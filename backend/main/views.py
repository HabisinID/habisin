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
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, SAFE_METHODS
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle
from .models import Profile, Listing, Reservation
from .serializers import UserSerializer, RegisterSerializer, ListingSerializer, ReservationSerializer, ReservationCreateSerializer, ReservationUpdateSerializer


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
            for reservation in Reservation.objects.filter(user=request.user, status__in=Reservation.ACTIVE_STATUSES):
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


STOCK_UNAVAILABLE = "Stok tidak cukup atau waktu pengambilan sudah berakhir."


def take_stock(listing_id, quantity):
    # A conditional UPDATE cannot oversell, even with concurrent orders.
    return Listing.objects.filter(pk=listing_id, active=True, stock__gte=quantity, pickup_end__gt=timezone.now()).update(stock=F("stock") - quantity)


def release_stock(listing_id, quantity):
    Listing.objects.filter(pk=listing_id).update(stock=F("stock") + quantity)


def owned_reservation(view):
    """Pass the caller's own order to the view, locked for the rest of the request.

    Other users' orders answer 404 so their existence is not revealed.
    """
    @wraps(view)
    def wrapper(request, pk, *args, **kwargs):
        with transaction.atomic():
            reservation = Reservation.objects.select_for_update().filter(pk=pk, user=request.user).first()
            if reservation is None:
                return Response({"detail": "Pesanan tidak ditemukan."}, status=404)
            return view(request, reservation, *args, **kwargs)
    return wrapper


def conflict(reservation, action):
    return Response({"detail": f"Pesanan berstatus {reservation.get_status_display().lower()} tidak dapat {action}."}, status=409)


@api_view(["GET", "POST"])
@throttle_classes([OrderWriteThrottle])
def reservations(request):
    if request.method == "GET":
        return Response(ReservationSerializer(Reservation.objects.filter(user=request.user).select_related("listing").order_by("-created_at"), many=True).data)
    if UserSerializer(request.user).data["role"] != "buyer":
        return Response({"detail": "Pemesanan hanya tersedia untuk akun pembeli."}, status=403)
    serializer = ReservationCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    with transaction.atomic():
        if not take_stock(data["listing_id"], data["quantity"]):
            return Response({"detail": STOCK_UNAVAILABLE}, status=400)
        listing = Listing.objects.get(pk=data["listing_id"])
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
        if reservation.status not in ["cancelled", "picked_up"]:
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
    if change > 0 and not take_stock(reservation.listing_id, change):
        return Response({"detail": STOCK_UNAVAILABLE}, status=400)
    if change < 0:
        release_stock(reservation.listing_id, -change)
    reservation.quantity = quantity
    reservation.total = quantity * reservation.listing.price
    reservation.note = data.get("note", reservation.note)
    reservation.save(update_fields=["quantity", "total", "note"])
    return Response(ReservationSerializer(reservation).data)


@api_view(["POST"])
@throttle_classes([OrderWriteThrottle])
@owned_reservation
def pay_reservation(request, reservation):
    if reservation.status != "pending":
        return conflict(reservation, "dibayar")
    if reservation.listing.pickup_end <= timezone.now():
        return Response({"detail": "Waktu pengambilan sudah berakhir. Batalkan pesanan ini."}, status=400)
    reservation.status = "paid"
    reservation.paid_at = timezone.now()
    reservation.save(update_fields=["status", "paid_at"])
    return Response(ReservationSerializer(reservation).data)


@api_view(["POST"])
@throttle_classes([OrderWriteThrottle])
@owned_reservation
def cancel_reservation(request, reservation):
    if reservation.status == "picked_up":
        return conflict(reservation, "dibatalkan")
    # Cancelling twice is harmless: stock is only released on the first call.
    if reservation.status in Reservation.ACTIVE_STATUSES:
        reservation.status = "cancelled"
        reservation.save(update_fields=["status"])
        release_stock(reservation.listing_id, reservation.quantity)
    return Response(ReservationSerializer(reservation).data)


@api_view(["GET"])
def dashboard(request):
    role = UserSerializer(request.user).data["role"]
    if role == "buyer":
        return Response({"detail": "Akses khusus mitra atau admin."}, status=403)
    return Response({"role": role, "users": User.objects.count() if role == "admin" else None, "listings": Listing.objects.filter(active=True).count(), "message": "Katalog contoh HABISIN. Mitra dapat mengelola profil dan lokasi toko. Pengelolaan produk dan moderasi tersedia pada pengembangan berikutnya."})
