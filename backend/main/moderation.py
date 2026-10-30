"""One transaction contract for the workspace and module 6 moderation APIs."""
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .listing_services import ListingConflict, lock_listing
from .models import AdminModerationLog, ListingStockAction, ModerationLog, Reservation


def moderate_listing(pk, actor, action, reason, *, require_removed=False):
    if action not in {"take_down", "restore"}:
        raise ValidationError({"action": "Pilih turunkan atau pulihkan."})
    if not isinstance(reason, str) or not 1 <= len(reason.strip()) <= 500:
        raise ValidationError({"reason": "Isi alasan 1–500 karakter."})
    reason = reason.strip()
    Reservation.expire_overdue()
    with transaction.atomic():
        item = lock_listing(pk)
        if item.deleted_at:
            raise ListingConflict("Listing sudah dihapus pemilik.")
        removed = bool(item.moderated_at or item.taken_down)
        taking_down = action == "take_down"
        if require_removed and not removed:
            raise ValidationError({"detail": "Listing tidak dalam status diturunkan."})
        now = timezone.now()
        if taking_down:
            orders = list(Reservation.objects.select_for_update().filter(
                listing=item, status__in=Reservation.ACTIVE_STATUSES
            ).order_by("pk"))
            if orders:
                Reservation.objects.filter(pk__in=[order.pk for order in orders]).update(
                    status="cancelled", cancelled_by="admin", cancelled_at=now,
                    cancellation_note=reason,
                )
                # Only orders whose locked status still held stock are released.
                type(item).objects.filter(pk=item.pk).update(stock=F("stock") + sum(order.quantity for order in orders))
                item.refresh_from_db(fields=["stock"])
            item.moderated_at = item.moderated_at or now
            item.moderated_by = item.moderated_by or actor
            existing_reason = item.moderation_reason or item.takedown_reason
            reason_to_save = existing_reason if removed and existing_reason else reason
        else:
            item.moderated_at = None
            item.moderated_by = None
            reason_to_save = ""
        item.taken_down = taking_down
        item.takedown_reason = item.moderation_reason = reason_to_save
        if removed or taking_down:
            item.active = False
            item.save(update_fields=["active", "taken_down", "takedown_reason", "moderated_at", "moderated_by", "moderation_reason"])
            ListingStockAction.objects.filter(listing=item, used=False).update(used=True)
        if removed != taking_down:
            ModerationLog.objects.create(listing=item, actor=actor, target_name=item.name,
                                         store_name=item.store, action=action, reason=reason)
            AdminModerationLog.objects.create(admin_user=actor, target_name=item.name,
                action_type="TAKEDOWN_LISTING" if taking_down else "RESTORE_LISTING", reason=reason)
        return item
