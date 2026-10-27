"""Modul 8: the cashier page, where partners verify pickup codes and hand orders over.

Rendered as Django templates for HTMX; the Next.js proxy serves it under /api, so
the session cookie and CSRF token are the same as the rest of the app.
"""
import re
from datetime import timedelta
from functools import wraps
from django.db import transaction
from django.shortcuts import render
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.throttling import UserRateThrottle
from .listing_services import lock_listing
from .models import Reservation, VerificationLog
from .serializers import UserSerializer

UNDO_WINDOW = timedelta(seconds=60)
CODE_PATTERN = re.compile(f"[{Reservation.CODE_ALPHABET}]{{5}}")
# The order's status decides what the cashier sees after a code is found.
STATUS_OUTCOME = {"paid": "match", "picked_up": "used", "cancelled": "cancelled", "expired": "expired", "pending": "unpaid"}
DAYS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]


class VerifyThrottle(UserRateThrottle):
    """Stops guessing codes: 30 checks a minute per partner account."""
    scope = "kasir_verify"
    rate = "30/min"


def partner_only(view):
    """Let only signed-in partners in; others get an HTML 403 instead of DRF's JSON."""
    @wraps(view)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated or UserSerializer(request.user).data["role"] != "partner":
            return render(request, "main/kasir/forbidden.html", status=403)
        return view(request, *args, **kwargs)
    return wrapper


def partner_owns_reservation(view):
    """Pass the partner's own order to the view, locked; other stores' orders answer 404."""
    @wraps(view)
    def wrapper(request, pk, *args, **kwargs):
        Reservation.expire_overdue()
        with transaction.atomic():
            before = Reservation.objects.filter(pk=pk, listing__owner=request.user).only("listing_id").first()
            if before is None:
                return render(request, "main/kasir/_message.html", {"message": "Pesanan tidak ditemukan di toko ini."}, status=404)
            lock_listing(before.listing_id)
            order = Reservation.objects.select_for_update().select_related("listing", "user").get(pk=pk)
            return view(request, order, *args, **kwargs)
    return wrapper


def kasir_view(methods):
    """DRF session auth with CSRF, then the partner check above."""
    def decorate(view):
        return api_view(methods)(permission_classes([AllowAny])(partner_only(view)))
    return decorate


def waiting_count(partner):
    return Reservation.objects.filter(listing__owner=partner, status="paid").count()


def result(request, outcome, order, code, status=200):
    context = {"outcome": outcome, "order": order, "code": code, "waiting": waiting_count(request.user)}
    response = render(request, "main/kasir/_result.html", context, status=status)
    # The "Verifikasi terakhir" list reloads on this event.
    response["HX-Trigger"] = "verified"
    return response


@kasir_view(["GET"])
def page(request):
    Reservation.expire_overdue()
    stores = list(request.user.stores.values_list("name", flat=True))
    now = timezone.localtime()
    return render(request, "main/kasir/page.html", {
        "store": stores[0] if len(stores) == 1 else f"{len(stores)} toko",
        "day": DAYS[now.weekday()],
        "now": now,
        "waiting": waiting_count(request.user),
        "alphabet": Reservation.CODE_ALPHABET,
        "logs": recent_logs(request.user),
    })


@kasir_view(["POST"])
def check(request):
    if not VerifyThrottle().allow_request(request, None):
        return render(request, "main/kasir/_message.html", {"message": "Terlalu banyak percobaan. Tunggu sebentar, lalu coba lagi."}, status=429)
    code = str(request.data.get("code", "")).strip().upper()
    if not CODE_PATTERN.fullmatch(code):
        return render(request, "main/kasir/_message.html", {"message": "Kode terdiri dari 5 karakter yang ada di tiket pembeli."}, status=400)
    Reservation.expire_overdue()
    order = Reservation.objects.select_related("listing", "user").filter(code=code).first()
    if order is None:
        outcome = "not_found"
    elif order.listing.owner_id != request.user.pk:
        outcome, order = "other_store", None
    else:
        outcome = STATUS_OUTCOME[order.status]
    if outcome != "match":
        VerificationLog.objects.create(partner=request.user, reservation=order, code=code, outcome=outcome)
    return result(request, outcome, order, code)


@kasir_view(["POST"])
@partner_owns_reservation
def pickup(request, order):
    if order.status != "paid":
        return result(request, STATUS_OUTCOME[order.status], order, order.code, status=409)
    order.status, order.picked_up_at = "picked_up", timezone.now()
    order.save(update_fields=["status", "picked_up_at"])
    VerificationLog.objects.create(partner=request.user, reservation=order, code=order.code, outcome="picked_up")
    return result(request, "handed_over", order, order.code)


@kasir_view(["POST"])
@partner_owns_reservation
def undo(request, order):
    if order.status != "picked_up" or timezone.now() - order.picked_up_at > UNDO_WINDOW:
        return render(request, "main/kasir/_message.html", {"message": "Batas urungkan 60 detik sudah lewat."}, status=409)
    order.status, order.picked_up_at = "paid", None
    order.save(update_fields=["status", "picked_up_at"])
    VerificationLog.objects.filter(reservation=order, outcome="picked_up").delete()
    return result(request, "match", order, order.code)


@kasir_view(["GET"])
def recent(request):
    return render(request, "main/kasir/_recent.html", {"logs": recent_logs(request.user)})


def recent_logs(partner):
    return VerificationLog.objects.filter(partner=partner).select_related("reservation__listing", "reservation__user")[:5]
