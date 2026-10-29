from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import APIException

from .models import Listing, Store


class ListingConflict(APIException):
    status_code = 409
    default_detail = "Data berubah. Muat ulang sebelum mencoba lagi."


def available_listings(queryset=None):
    queryset = Listing.objects.all() if queryset is None else queryset
    now = timezone.now()
    return queryset.filter(
        active=True,
        taken_down=False,
        stock__gt=0,
        pickup_end__gt=now,
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
