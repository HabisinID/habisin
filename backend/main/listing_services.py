from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import APIException

from .models import Listing, ListingStockAction, Store


class ListingConflict(APIException):
    status_code = 409
    default_detail = "Data berubah. Muat ulang sebelum mencoba lagi."


def available_listings(queryset=None):
    queryset = Listing.objects.all() if queryset is None else queryset
    now = timezone.now()
    return queryset.filter(
        active=True,
        taken_down=False,
        moderated_at__isnull=True,
        stock__gt=0,
        pickup_end__gt=now,
        deleted_at__isnull=True,
    ).filter(
        Q(store_profile__isnull=True) | Q(store_profile__is_open=True)
    )


def lock_stores(ids):
    return {store.pk: store for store in Store.objects.select_for_update().filter(pk__in={pk for pk in ids if pk is not None}).order_by("pk")}


def lock_listing(pk, owner=None, target_store_id=None):
    lookup = {"pk": pk}
    if owner is not None:
        lookup["owner"] = owner
    before = get_object_or_404(Listing.objects.only("pk", "store_profile_id"), **lookup)
    stores = lock_stores([before.store_profile_id, target_store_id])
    item = get_object_or_404(Listing.objects.select_for_update(), **lookup)
    if item.store_profile_id != before.store_profile_id:
        raise ListingConflict()
    if item.store_profile_id:
        item.store_profile = stores[item.store_profile_id]
    return item


def ensure_partner_listing_mutable(item):
    if item.deleted_at:
        from django.http import Http404
        raise Http404("Listing sudah dihapus.")
    if item.moderated_at or item.taken_down:
        raise ListingConflict("Listing diturunkan admin dan terkunci. " + (item.moderation_reason or item.takedown_reason))
    if item.store_profile_id and item.store_profile.closed_at:
        raise ListingConflict("Toko ditutup permanen; listing tidak dapat diubah.")


def set_listing_moderation(item, removed, actor, reason):
    """Both admin APIs share one state; caller holds store/listing locks."""
    item.taken_down = removed
    item.takedown_reason = reason if removed else ""
    item.moderated_at = timezone.now() if removed else None
    item.moderated_by = actor if removed else None
    item.moderation_reason = reason if removed else ""
    # Restoring never publishes a listing without its partner's confirmation.
    item.active = False
    item.save(update_fields=[
        "taken_down", "takedown_reason", "moderated_at", "moderated_by",
        "moderation_reason", "active",
    ])
    ListingStockAction.objects.filter(listing=item, used=False).update(used=True)
