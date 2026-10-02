import re
import secrets
from django.contrib.auth import authenticate, login, logout, update_session_auth_hash
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction, IntegrityError
from django.db.models import F
from django.middleware.csrf import get_token
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from .models import Profile, Listing, Reservation
from .serializers import UserSerializer, RegisterSerializer, ListingSerializer, ReservationSerializer


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
            for reservation in Reservation.objects.filter(user=request.user, status="reserved"):
                Listing.objects.filter(pk=reservation.listing_id).update(stock=F("stock") + reservation.quantity)
            user = request.user
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
    items = Listing.objects.filter(active=True, pickup_end__gt=timezone.now())
    return Response(ListingSerializer(items, many=True).data)


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
        updated = Listing.objects.filter(pk=listing_id, active=True, stock__gte=quantity, pickup_end__gt=timezone.now()).update(stock=F("stock") - quantity)
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
        reservation = Reservation.objects.filter(pk=pk, user=request.user).first()
        if not reservation:
            return Response({"detail": "Pesanan tidak ditemukan."}, status=404)
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
    return Response({"role": role, "users": User.objects.count() if role == "admin" else None, "listings": Listing.objects.filter(active=True).count(), "message": "Katalog contoh HABISIN. Onboarding toko dan moderasi tersedia pada pengembangan berikutnya."})
