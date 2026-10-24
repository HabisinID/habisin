import re
import secrets
from django.contrib.auth import authenticate, login, logout, update_session_auth_hash
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction, IntegrityError
from django.db.models import F
from django.db.models.deletion import ProtectedError
from django.middleware.csrf import get_token
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from .models import Profile, Listing, Reservation, Store
from .listing_services import ListingConflict, available_listings, lock_listing, lock_stores
from .reservation_policy import reservation_policy, cancellation_reason
from .listing_media import compensate_media_writes, delete_listing_file, save_listing_with_media
from rest_framework import serializers as drf_serializers
from .serializers import UserSerializer, RegisterSerializer, ListingSerializer, PartnerListingSerializer, ReservationSerializer


class AuthThrottle(AnonRateThrottle):
    rate = "30/min"


@api_view(["GET"])
@permission_classes([AllowAny])
def csrf(request):
    return Response({"csrfToken": get_token(request)})


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([AuthThrottle])
def register(request):
    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    try:
        with transaction.atomic():
            user = User.objects.create_user(username=data["username"], email=data["email"], password=data["password"], first_name=data["name"])
            Profile.objects.create(user=user, role=data["role"])
    except IntegrityError:
        return Response({"detail": "Username sudah digunakan."}, status=400)
    login(request, user)
    return Response(UserSerializer(user).data, status=201)


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([AuthThrottle])
def sign_in(request):
    username = request.data.get("username", "")
    password = request.data.get("password", "")
    if not isinstance(username, str) or not isinstance(password, str):
        return Response({"detail": "Data login tidak valid."}, status=400)
    user = authenticate(request, username=username.lower(), password=password)
    if user is None:
        return Response({"detail": "Username atau password salah."}, status=400)
    login(request, user)
    return Response(UserSerializer(user).data)


@api_view(["POST"])
def sign_out(request):
    logout(request)
    return Response({"detail": "Berhasil keluar."})


@api_view(["GET"])
@permission_classes([AllowAny])
@throttle_classes([AuthThrottle])
def username_available(request):
    username = request.query_params.get("username", "")
    valid = bool(re.fullmatch(r"[a-zA-Z0-9_]{3,30}", username))
    return Response({"available": valid and not User.objects.filter(username__iexact=username).exists(), "valid": valid})


@api_view(["GET", "PATCH", "DELETE"])
def me(request):
    if request.method == "DELETE":
        password = request.data.get("password")
        if not isinstance(password, str) or not request.user.check_password(password):
            return Response({"detail": "Password salah."}, status=400)
        with transaction.atomic():
            user = User.objects.select_for_update().get(pk=request.user.pk)
            owned_ids = Listing.objects.filter(owner=user).values_list("pk", flat=True)
            order_ids = Reservation.objects.filter(user=user, status="reserved").values_list("listing_id", flat=True)
            ids = sorted(set(owned_ids) | set(order_ids))
            store_ids = set(Store.objects.filter(owner=user).values_list("pk", flat=True))
            store_ids.update(Listing.objects.filter(pk__in=ids).values_list("store_profile_id", flat=True))
            stores = lock_stores(store_ids)
            locked = list(Listing.objects.select_for_update().filter(pk__in=ids).order_by("pk"))
            if any(item.store_profile_id and item.store_profile_id not in stores for item in locked):
                raise ListingConflict()
            for reservation in Reservation.objects.select_for_update().filter(user=user, status="reserved").order_by("pk"):
                Listing.objects.filter(pk=reservation.listing_id).update(stock=F("stock") + reservation.quantity)
            Listing.objects.filter(owner=user).update(active=False, store_profile=None)
            logout(request)
            user.delete()
        return Response(status=204)
    if request.method == "PATCH":
        serializer = UserSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
    return Response(UserSerializer(request.user).data)


@api_view(["POST"])
def password(request):
    old = request.data.get("old_password")
    new = request.data.get("new_password")
    if not isinstance(old, str) or not request.user.check_password(old):
        return Response({"detail": "Password lama salah."}, status=400)
    if not isinstance(new, str) or len(new) > 128:
        return Response({"detail": "Password baru tidak valid."}, status=400)
    try:
        validate_password(new, request.user)
    except DjangoValidationError as exc:
        return Response({"detail": exc.messages}, status=400)
    request.user.set_password(new)
    request.user.save()
    update_session_auth_hash(request, request.user)
    return Response({"detail": "Password berhasil diubah."})


@api_view(["GET"])
@permission_classes([AllowAny])
def listings(request):
    items = available_listings().select_related("store_profile")
    return Response(ListingSerializer(items, many=True).data)


def _target_store_id(data):
    if "store_id" not in data:
        return None
    try:
        return drf_serializers.IntegerField(min_value=1).run_validation(data["store_id"])
    except drf_serializers.ValidationError as exc:
        raise drf_serializers.ValidationError({"store_id": exc.detail}) from exc


@api_view(["GET", "POST"])
def partner_listings(request):
    if UserSerializer(request.user).data["role"] != "partner":
        return Response({"detail": "Pengelolaan listing hanya tersedia untuk akun mitra."}, status=403)
    if request.method == "GET":
        items = Listing.objects.filter(owner=request.user).select_related("store_profile").order_by("-id")
        return Response(ListingSerializer(items, many=True).data)
    with compensate_media_writes() as media, transaction.atomic():
        target_id = _target_store_id(request.data)
        lock_stores([target_id])
        serializer = PartnerListingSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        item = save_listing_with_media(serializer, media, owner=request.user)
        return Response(ListingSerializer(item).data, status=201)


@api_view(["GET", "PATCH", "DELETE"])
def partner_listing_detail(request, pk):
    if UserSerializer(request.user).data["role"] != "partner":
        return Response({"detail": "Pengelolaan listing hanya tersedia untuk akun mitra."}, status=403)
    with compensate_media_writes() as media, transaction.atomic():
        target_id = _target_store_id(request.data)
        item = lock_listing(pk, request.user, target_id)
        if request.method == "DELETE":
            name, storage = item.image_file.name, item.image_file.storage
            try:
                item.delete()
            except ProtectedError:
                return Response({"detail": "Listing memiliki riwayat pesanan dan tidak dapat dihapus. Nonaktifkan listing agar tidak ditawarkan lagi."}, status=409)
            if name:
                transaction.on_commit(lambda: delete_listing_file(storage, name))
            return Response(status=204)
        if request.method == "PATCH":
            serializer = PartnerListingSerializer(item, data=request.data, partial=True, context={"request": request})
            serializer.is_valid(raise_exception=True)
            item = save_listing_with_media(serializer, media)
            return Response(ListingSerializer(item).data)
        return Response(ListingSerializer(item).data)


@api_view(["GET", "POST"])
def reservations(request):
    if request.method == "GET":
        return Response(ReservationSerializer(Reservation.objects.filter(user=request.user).select_related("listing").order_by("-created_at"), many=True).data)
    if UserSerializer(request.user).data["role"] != "buyer":
        return Response({"detail": "Pemesanan hanya tersedia untuk akun pembeli."}, status=403)
    quantity = request.data.get("quantity", 1)
    listing_id = request.data.get("listing_id")
    if type(quantity) is not int or not 1 <= quantity <= 10 or type(listing_id) is not int:
        return Response({"detail": "Pilih produk dan 1–10 porsi."}, status=400)
    with transaction.atomic():
        User.objects.select_for_update().get(pk=request.user.pk)
        if not Listing.objects.filter(pk=listing_id).exists():
            return Response({"detail": "Makanan tidak tersedia."}, status=400)
        listing = lock_listing(listing_id)
        policy = reservation_policy(request.user, listing)
        if policy["reason"] or (listing.price == 0 and quantity > policy["max_quantity"]):
            return Response({"detail": policy["reason"] or "Maksimal 2 porsi gratis per toko per hari WIB; pilih jumlah sesuai sisa kuota."}, status=409)
        updated = available_listings().filter(pk=listing_id, stock__gte=quantity).update(stock=F("stock") - quantity)
        if not updated:
            return Response({"detail": "Stok tidak cukup atau waktu pengambilan sudah berakhir."}, status=400)
        listing = Listing.objects.get(pk=listing_id)
        for attempt in range(5):
            try:
                with transaction.atomic():
                    reservation = Reservation.objects.create(user=request.user, listing=listing, quantity=quantity, total=quantity * listing.price, code="".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(5)))
                break
            except IntegrityError:
                if attempt == 4:
                    raise
    return Response(ReservationSerializer(reservation).data, status=201)


@api_view(["POST"])
def cancel_reservation(request, pk):
    with transaction.atomic():
        User.objects.select_for_update().get(pk=request.user.pk)
        before = Reservation.objects.filter(pk=pk, user=request.user).only("listing_id").first()
        if not before:
            return Response({"detail": "Pesanan tidak ditemukan."}, status=404)
        lock_listing(before.listing_id)
        reservation = Reservation.objects.select_for_update().get(pk=pk, user=request.user)
        reason = cancellation_reason(reservation)
        if reason:
            return Response({"detail": reason}, status=409)
        updated = Reservation.objects.filter(pk=pk, user=request.user, status="reserved").update(status="cancelled")
        if updated:
            Listing.objects.filter(pk=reservation.listing_id).update(stock=F("stock") + reservation.quantity)
        reservation.refresh_from_db()
    return Response(ReservationSerializer(reservation).data)


@api_view(["GET"])
def dashboard(request):
    role = UserSerializer(request.user).data["role"]
    if role == "buyer":
        return Response({"detail": "Akses khusus mitra atau admin."}, status=403)
    return Response({"role": role, "users": User.objects.count() if role == "admin" else None, "listings": Listing.objects.filter(active=True).count(), "message": "Katalog contoh HABISIN. Mitra dapat mengelola profil dan lokasi toko serta listing makanan surplus. Moderasi tersedia pada pengembangan berikutnya."})


@api_view(["GET"])
def listing_reservation_policy(request, pk):
    if UserSerializer(request.user).data["role"] != "buyer":
        return Response({"detail": "Pemesanan hanya tersedia untuk akun pembeli."}, status=403)
    item = Listing.objects.filter(pk=pk).first()
    if item is None:
        return Response({"detail": "Makanan tidak ditemukan."}, status=404)
    return Response(reservation_policy(request.user, item))
