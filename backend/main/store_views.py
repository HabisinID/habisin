from django.utils import timezone
from django.contrib.auth.models import User
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, BasePermission
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from .geocoding import location_token, search_address
from .models import Store, Listing, Reservation
from django.db.models.deletion import ProtectedError
from .serializers import GeocodeSerializer, StoreSerializer, ListingSerializer
from .listing_services import available_listings


class IsPartner(BasePermission):
    message = "Pengelolaan toko hanya tersedia untuk akun mitra."

    def has_permission(self, request, view):
        return request.user.is_authenticated and not request.user.is_staff and getattr(getattr(request.user, "profile", None), "role", None) == "partner"


class GeocodeThrottle(UserRateThrottle):
    rate = "10/min"
    scope = "store_geocode"


@api_view(["POST"])
@permission_classes([IsPartner])
@throttle_classes([GeocodeThrottle])
def geocode(request):
    serializer = GeocodeSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    address = serializer.validated_data["address"]
    results = search_address(address)
    return Response({"results": results, "geocode_token": location_token(address, request.user.pk) if results else None})


def _save_new_store(request):
    serializer = StoreSerializer(data=request.data, context={"request": request})
    serializer.is_valid(raise_exception=True)
    serializer.save(owner=request.user)
    return Response(serializer.data, status=201)


def _mutate_store(request, store):
    if store.closed_at:
        return Response({"detail": "Toko ditutup permanen dan tidak dapat diubah."}, status=409)
    if request.method == "DELETE":
        if request.data.get("confirmation_name") != store.name:
            return Response({"detail": "Ketik nama toko dengan tepat untuk mengonfirmasi penghapusan."}, status=400)
        try:
            store.delete()
        except ProtectedError:
            return Response({"detail": "Toko masih memiliki listing. Hapus atau pindahkan listing yang dapat dipindahkan, atau tutup toko sementara."}, status=409)
        return Response(status=204)
    serializer = StoreSerializer(store, data=request.data, partial=True, context={"request": request})
    serializer.is_valid(raise_exception=True)
    location_changed = any(field in serializer.validated_data and serializer.validated_data[field] != getattr(store, field) for field in ["name", "address", "latitude", "longitude"])
    if location_changed:
        listing_ids = list(Listing.objects.select_for_update().filter(store_profile=store).order_by("pk").values_list("pk", flat=True))
        if Reservation.objects.filter(listing_id__in=listing_ids, status__in=Reservation.ACTIVE_STATUSES).exists():
            return Response({"detail": "Nama dan lokasi toko tidak dapat diubah selama ada pesanan aktif."}, status=409)
    serializer.save()
    if location_changed:
        Listing.objects.filter(store_profile=store).update(store=store.name, address=store.address, latitude=store.latitude, longitude=store.longitude)
    return Response(serializer.data)


@api_view(["GET", "POST"])
@permission_classes([IsPartner])
def partner_stores(request):
    if request.method == "GET":
        stores = Store.objects.filter(owner=request.user).order_by("name", "id")
        return Response({"stores": StoreSerializer(stores, many=True).data})
    with transaction.atomic():
        User.objects.select_for_update().get(pk=request.user.pk)
        return _save_new_store(request)


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsPartner])
def partner_store_detail(request, pk):
    Reservation.expire_overdue()
    with transaction.atomic():
        store = get_object_or_404(Store.objects.select_for_update(), pk=pk, owner=request.user)
        if request.method == "GET":
            return Response(StoreSerializer(store).data)
        return _mutate_store(request, store)


@api_view(["GET", "POST", "PATCH", "DELETE"])
@permission_classes([IsPartner])
def partner_store(request):
    Reservation.expire_overdue()
    with transaction.atomic():
        User.objects.select_for_update().get(pk=request.user.pk)
        stores = list(Store.objects.select_for_update().filter(owner=request.user).order_by("id")[:2])
        if len(stores) > 1:
            return Response({"detail": "Pilih ID toko melalui /api/partner/stores.", "code": "store_selection_required"}, status=409)
        store = stores[0] if stores else None
        if request.method == "GET":
            return Response({"store": StoreSerializer(store).data if store else None})
        if request.method == "POST":
            if store:
                return Response({"detail": "Akun ini sudah memiliki toko. Gunakan /api/partner/stores untuk menambah cabang."}, status=409)
            return _save_new_store(request)
        if store is None:
            return Response({"detail": "Toko tidak ditemukan."}, status=404)
        return _mutate_store(request, store)


@api_view(["GET"])
@permission_classes([AllowAny])
def public_store(request, pk):
    # Closed stores remain readable so their status and address are unambiguous.
    return Response(StoreSerializer(get_object_or_404(Store, pk=pk)).data)


@api_view(["GET"])
@permission_classes([AllowAny])
def public_store_listings(request, pk):
    Reservation.expire_overdue()
    store = get_object_or_404(Store, pk=pk)
    items = available_listings().filter(store_profile=store).select_related("store_profile").order_by("id")
    return Response(ListingSerializer(items, many=True).data)
