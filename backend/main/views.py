import re
import secrets
from functools import wraps
from django.contrib.auth import authenticate, login, logout, update_session_auth_hash
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction, IntegrityError
from django.db.models import F
from django.middleware.csrf import get_token
from django.utils import timezone
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import api_view, permission_classes, throttle_classes, action
from rest_framework.permissions import AllowAny, SAFE_METHODS
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle
from .models import Profile, Listing, Reservation, Store, ListingStockAction, PartnerApproval, ModerationLog
from .listing_services import ListingConflict, available_listings, lock_listing, lock_stores
from .listing_media import compensate_media_writes, delete_listing_file, save_listing_with_media
from .reservation_policy import reservation_policy
from django.db.models.deletion import ProtectedError
from rest_framework import serializers as drf_serializers
from .serializers import PartnerListingSerializer, UserSerializer, RegisterSerializer, ListingSerializer, ReservationSerializer, ReservationCreateSerializer, ReservationUpdateSerializer, PartnerApprovalSerializer, ModerationLogSerializer, AdminListingSerializer


class AuthThrottle(AnonRateThrottle):
    rate = "30/min"


class OrderWriteThrottle(UserRateThrottle):
    """Limit order changes per account; reading orders is not counted."""
    scope = "reservation_write"
    rate = "30/min"

    def allow_request(self, request, view):
        return request.method in SAFE_METHODS or super().allow_request(request, view)


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
            if data["role"] == "partner":
                PartnerApproval.objects.create(user=user)
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
        Reservation.expire_overdue()
        with transaction.atomic():
            user = User.objects.select_for_update().get(pk=request.user.pk)
            owned_ids = Listing.objects.filter(owner=user).values_list("pk", flat=True)
            order_ids = Reservation.objects.filter(user=user, status__in=Reservation.ACTIVE_STATUSES).values_list("listing_id", flat=True)
            ids = sorted(set(owned_ids) | set(order_ids))
            store_ids = set(Store.objects.filter(owner=user).values_list("pk", flat=True))
            store_ids.update(Listing.objects.filter(pk__in=ids).values_list("store_profile_id", flat=True))
            stores = lock_stores(store_ids)
            locked = list(Listing.objects.select_for_update().filter(pk__in=ids).order_by("pk"))
            if any(item.store_profile_id and item.store_profile_id not in stores for item in locked):
                raise ListingConflict()
            for reservation in Reservation.objects.select_for_update().filter(user=user, status__in=Reservation.ACTIVE_STATUSES).order_by("pk"):
                release_stock(reservation.listing_id, reservation.quantity)
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

def partner_approved(user):
    approval = PartnerApproval.objects.filter(user=user).first()
    return approval is not None and approval.status == "approved"

@api_view(["GET"])
@permission_classes([AllowAny])
def listings(request):
    Reservation.expire_overdue()
    items = available_listings().filter(taken_down=False).select_related("store_profile")
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
    if not partner_approved(request.user):
        return Response({"detail": "Akun mitra belum disetujui admin."}, status=403)
    if request.method == "GET":
        items = Listing.objects.filter(owner=request.user).select_related("store_profile").order_by("-id")
        return Response(ListingSerializer(items, many=True).data)
    Reservation.expire_overdue()
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
    if not partner_approved(request.user):
        return Response({"detail": "Akun mitra belum disetujui admin."}, status=403)
    Reservation.expire_overdue()
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
            if "stock" in request.data:
                ListingStockAction.objects.filter(listing=item, used=False).update(used=True)
            return Response(ListingSerializer(item).data)
        return Response(ListingSerializer(item).data)


STOCK_UNAVAILABLE = "Stok tidak cukup atau waktu pengambilan sudah berakhir."


def take_stock(listing_id, quantity):
    # A conditional UPDATE cannot oversell, even with concurrent orders.
    updated = available_listings().filter(pk=listing_id, stock__gte=quantity).update(stock=F("stock") - quantity)
    if updated:
        ListingStockAction.objects.filter(listing_id=listing_id, used=False).update(used=True)
    return updated


def release_stock(listing_id, quantity):
    ListingStockAction.objects.filter(listing_id=listing_id, used=False).update(used=True)
    Listing.objects.filter(pk=listing_id).update(stock=F("stock") + quantity)


def owned_reservation(view):
    """Pass the caller's own order to the view, locked for the rest of the request.

    Other users' orders answer 404 so their existence is not revealed.
    """
    @wraps(view)
    def wrapper(request, pk, *args, **kwargs):
        Reservation.expire_overdue()
        with transaction.atomic():
            User.objects.select_for_update().get(pk=request.user.pk)
            before = Reservation.objects.filter(pk=pk, user=request.user).only("listing_id").first()
            if before is None:
                return Response({"detail": "Pesanan tidak ditemukan."}, status=404)
            lock_listing(before.listing_id)
            reservation = Reservation.objects.select_for_update().select_related("listing").get(pk=pk, user=request.user)
            return view(request, reservation, *args, **kwargs)
    return wrapper


def free_limit_error(user, listing, quantity, exclude=None):
    """Return a 400 response when a free claim would exceed the daily limit."""
    if listing.price != 0:
        return None
    # Lock the buyer so two parallel claims cannot both pass the check.
    User.objects.select_for_update().get(pk=user.pk)
    claimed = Reservation.free_portions_today(user, exclude)
    if claimed + quantity <= Reservation.FREE_DAILY_LIMIT:
        return None
    limit = Reservation.FREE_DAILY_LIMIT
    return Response({"detail": f"Maks. {limit} porsi gratis per hari agar donasi terbagi rata. Hari ini kamu sudah mengklaim {claimed} porsi."}, status=400)


def conflict(reservation, action):
    return Response({"detail": f"Pesanan berstatus {reservation.get_status_display().lower()} tidak dapat {action}."}, status=409)


@api_view(["GET", "POST"])
@throttle_classes([OrderWriteThrottle])
def reservations(request):
    Reservation.expire_overdue()
    if request.method == "GET":
        return Response(ReservationSerializer(Reservation.objects.filter(user=request.user).select_related("listing").order_by("-created_at"), many=True).data)
    if UserSerializer(request.user).data["role"] != "buyer":
        return Response({"detail": "Pemesanan hanya tersedia untuk akun pembeli."}, status=403)
    serializer = ReservationCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    with transaction.atomic():
        User.objects.select_for_update().get(pk=request.user.pk)
        listing = lock_listing(data["listing_id"]) if Listing.objects.filter(pk=data["listing_id"]).exists() else None
        error = listing and free_limit_error(request.user, listing, data["quantity"])
        if error:
            return error
        if not take_stock(data["listing_id"], data["quantity"]):
            return Response({"detail": STOCK_UNAVAILABLE}, status=400)
        listing.refresh_from_db()
        for attempt in range(5):
            try:
                with transaction.atomic():
                    reservation = Reservation.objects.create(user=request.user, listing=listing, quantity=data["quantity"], total=data["quantity"] * listing.price, note=data.get("note", ""), code="".join(secrets.choice(Reservation.CODE_ALPHABET) for _ in range(5)))
                break
            except IntegrityError:
                if attempt == 4:
                    raise
    return Response(ReservationSerializer(reservation).data, status=201)


@api_view(["GET", "PATCH", "DELETE"])
@throttle_classes([OrderWriteThrottle])
@owned_reservation
def reservation_detail(request, reservation):
    if request.method == "GET":
        return Response(ReservationSerializer(reservation).data)
    if request.method == "DELETE":
        if reservation.status not in Reservation.FINISHED_STATUSES:
            return conflict(reservation, "dihapus; batalkan terlebih dahulu")
        reservation.delete()
        return Response(status=204)
    if reservation.status != "pending":
        return conflict(reservation, "diubah")
    serializer = ReservationUpdateSerializer(data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    quantity = data.get("quantity", reservation.quantity)
    change = quantity - reservation.quantity
    error = change > 0 and free_limit_error(request.user, reservation.listing, quantity, exclude=reservation)
    if error:
        return error
    if change > 0 and not take_stock(reservation.listing_id, change):
        return Response({"detail": STOCK_UNAVAILABLE}, status=400)
    if change < 0:
        release_stock(reservation.listing_id, -change)
    reservation.quantity = quantity
    reservation.total = quantity * reservation.listing.price
    reservation.note = data.get("note", reservation.note)
    reservation.save(update_fields=["quantity", "total", "note"])
    reservation.listing.refresh_from_db()
    return Response(ReservationSerializer(reservation).data)


@api_view(["POST"])
@throttle_classes([OrderWriteThrottle])
@owned_reservation
def pay_reservation(request, reservation):
    if reservation.status != "pending":
        return conflict(reservation, "dibayar")
    reservation.status = "paid"
    reservation.paid_at = timezone.now()
    reservation.save(update_fields=["status", "paid_at"])
    reservation.listing.refresh_from_db()
    return Response(ReservationSerializer(reservation).data)


@api_view(["POST"])
@throttle_classes([OrderWriteThrottle])
@owned_reservation
def cancel_reservation(request, reservation):
    if reservation.status in ["picked_up", "expired"]:
        return conflict(reservation, "dibatalkan")
    if reservation.status == "paid" and timezone.now() >= reservation.cancel_until:
        closed = timezone.localtime(reservation.cancel_until)
        return Response({"detail": f"Pembatalan ditutup pukul {closed:%H.%M} (30 menit sebelum batas ambil)."}, status=409)
    # Cancelling twice is harmless: stock is only released on the first call.
    if reservation.status in Reservation.ACTIVE_STATUSES:
        reservation.status = "cancelled"
        reservation.save(update_fields=["status"])
        release_stock(reservation.listing_id, reservation.quantity)
    reservation.listing.refresh_from_db()
    return Response(ReservationSerializer(reservation).data)


@api_view(["GET"])
def dashboard(request):
    role = UserSerializer(request.user).data["role"]
    if role == "buyer":
        return Response({"detail": "Akses khusus mitra atau admin."}, status=403)
    return Response({"role": role, "users": User.objects.count() if role == "admin" else None, "listings": Listing.objects.filter(active=True).count(), "message": "Katalog contoh HABISIN. Mitra dapat mengelola profil dan lokasi toko. Pengelolaan produk dan moderasi tersedia pada pengembangan berikutnya."})


@api_view(["GET"])
def listing_reservation_policy(request, pk):
    Reservation.expire_overdue()
    if UserSerializer(request.user).data["role"] != "buyer":
        return Response({"detail": "Pemesanan hanya tersedia untuk akun pembeli."}, status=403)
    item = Listing.objects.filter(pk=pk).first()
    if item is None:
        return Response({"detail": "Makanan tidak ditemukan."}, status=404)
    return Response(reservation_policy(request.user, item))


class IsAdminUser(permissions.BasePermission):
    """Custom permission: Hanya mengizinkan admin (is_staff=True) yang boleh akses."""
    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated and request.user.is_staff

class PartnerApprovalViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = PartnerApprovalSerializer
    permission_classes = [IsAdminUser]

    def get_queryset(self):
        queryset = PartnerApproval.objects.select_related("user").order_by("-requested_at")
        status_filter = self.request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        return queryset

    def review(self, request, new_status, action_type, default_reason):
        approval = self.get_object()
        if approval.status != "pending":
            return Response({"detail": "Pengajuan ini sudah diproses."}, status=status.HTTP_400_BAD_REQUEST)
        reason = str(request.data.get("reason", "")).strip()
        if new_status == "rejected" and not reason:
            return Response({"detail": "Alasan penolakan wajib diisi."}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            approval.status = new_status
            approval.reviewed_at = timezone.now()
            approval.save(update_fields=["status", "reviewed_at"])
            ModerationLog.objects.create(
                admin_user=request.user,
                action_type=action_type,
                target_name=approval.user.username,
                reason=reason or default_reason,
            )
        return Response(PartnerApprovalSerializer(approval).data)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        return self.review(request, "approved", "APPROVE_PARTNER", "Disetujui oleh admin")

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        return self.review(request, "rejected", "REJECT_PARTNER", "Ditolak oleh admin")


class AdminListingViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Listing.objects.select_related("store_profile", "owner").order_by("-id")
    serializer_class = AdminListingSerializer
    permission_classes = [IsAdminUser]

    @action(detail=True, methods=["post"], url_path="take-down")
    def take_down(self, request, pk=None):
        listing = self.get_object()
        if listing.taken_down:
            return Response({"detail": "Listing sudah diturunkan."}, status=status.HTTP_400_BAD_REQUEST)
        reason = str(request.data.get("reason", "")).strip()
        if not reason:
            return Response({"detail": "Alasan take-down wajib diisi."}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            Reservation.objects.filter(listing=listing, status__in=Reservation.ACTIVE_STATUSES).update(
                status="cancelled",
                cancellation_note="Listing diturunkan oleh admin.",
                cancelled_at=timezone.now(),
            )
            listing.taken_down = True
            listing.takedown_reason = reason
            listing.active = False
            listing.save(update_fields=["taken_down", "takedown_reason", "active"])
            ModerationLog.objects.create(
                admin_user=request.user,
                action_type="TAKEDOWN_LISTING",
                target_name=listing.name,
                reason=reason,
            )
        return Response(AdminListingSerializer(listing).data)

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        listing = self.get_object()
        if not listing.taken_down:
            return Response({"detail": "Listing tidak dalam status diturunkan."}, status=status.HTTP_400_BAD_REQUEST)
        reason = str(request.data.get("reason", "")).strip() or "Dipulihkan oleh admin"
        with transaction.atomic():
            listing.taken_down = False
            listing.takedown_reason = ""
            listing.save(update_fields=["taken_down", "takedown_reason"])
            ModerationLog.objects.create(
                admin_user=request.user,
                action_type="RESTORE_LISTING",
                target_name=listing.name,
                reason=reason,
            )
        return Response(AdminListingSerializer(listing).data)


class ModerationLogViewSet(viewsets.ModelViewSet):
    serializer_class = ModerationLogSerializer
    permission_classes = [IsAdminUser]

    def get_queryset(self):
        queryset = ModerationLog.objects.select_related("admin_user").order_by("-created_at")
        action_type = self.request.query_params.get("action_type")
        if action_type:
            queryset = queryset.filter(action_type=action_type)
        return queryset

    def perform_create(self, serializer):
        serializer.save(admin_user=self.request.user)