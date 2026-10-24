"""Shared decisions; booking checks run under the user's row lock."""
from datetime import datetime, timedelta, time
from zoneinfo import ZoneInfo
from django.db.models import Sum
from django.utils import timezone
from .models import Reservation

WIB = ZoneInfo("Asia/Jakarta")
CANCELLATION_WINDOW = timedelta(minutes=30)


def cancellation_reason(reservation, now=None):
    if reservation.status != "reserved":
        return ""
    if reservation.listing.pickup_end - (now or timezone.now()) < CANCELLATION_WINDOW:
        return "Pesanan tidak bisa dibatalkan karena waktu pengambilan tersisa kurang dari 30 menit atau sudah berakhir."
    return ""


def reservation_policy(user, listing, now=None):
    now = now or timezone.now()
    free = Reservation.objects.filter(user=user, total=0, status="reserved")
    active = free.filter(listing__pickup_end__gt=now).order_by("created_at").first()
    day = now.astimezone(WIB).date()
    start = datetime.combine(day, time.min, tzinfo=WIB)
    daily = free.filter(created_at__gte=start, created_at__lt=start + timedelta(days=1))
    if listing.store_profile_id:
        daily = daily.filter(listing__store_profile_id=listing.store_profile_id)
    else:
        daily = daily.filter(listing_id=listing.pk)
    used = daily.aggregate(total=Sum("quantity"))["total"] or 0
    remaining = max(0, 2 - used)
    reason = ""
    if listing.price == 0:
        if active:
            reason = "Anda masih memiliki satu tiket gratis aktif. Gunakan tiket yang ada, tunggu batas ambil berakhir, atau batalkan jika masih diizinkan."
        elif not remaining:
            reason = "Kuota gratis di toko ini sudah habis hari ini (maksimal 2 porsi per hari WIB)."
    maximum = min(listing.stock, 2 if listing.price == 0 else 10, remaining if listing.price == 0 else 10)
    return dict(remaining_free_portions=remaining, active_free_reservation_id=active.pk if active else None,
                max_quantity=0 if reason else maximum, reason=reason, day=day.isoformat())
