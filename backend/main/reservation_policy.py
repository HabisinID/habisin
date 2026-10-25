"""UI projection of the same global donation and payment policy as Modul 7."""
from django.utils import timezone
from .models import Reservation


def cancellation_reason(reservation, now=None):
    if reservation.status == "paid" and (now or timezone.now()) >= reservation.cancel_until:
        return "Pembatalan ditutup 30 menit sebelum batas ambil."
    if reservation.status in ["picked_up", "expired"]:
        return "Pesanan ini sudah tidak dapat dibatalkan."
    return ""


def reservation_policy(user, listing, now=None):
    remaining = max(0, Reservation.FREE_DAILY_LIMIT - Reservation.free_portions_today(user))
    maximum = min(listing.stock, Reservation.MAX_QUANTITY, remaining if listing.price == 0 else Reservation.MAX_QUANTITY)
    reason = "Kuota gratis hari ini sudah habis (maksimal 2 porsi lintas semua toko)." if listing.price == 0 and not remaining else ""
    return dict(remaining_free_portions=remaining, active_free_reservation_id=None,
                max_quantity=max(0, maximum), reason=reason, day=timezone.localdate(now).isoformat())
