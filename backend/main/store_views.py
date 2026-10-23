from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, BasePermission
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from .geocoding import location_token, search_address
from .models import Store
from .serializers import GeocodeSerializer, StoreSerializer


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


@api_view(["GET", "POST", "PATCH", "DELETE"])
@permission_classes([IsPartner])
def partner_store(request):
    store = Store.objects.filter(owner=request.user).first()
    if request.method == "GET":
        return Response({"store": StoreSerializer(store).data if store else None})
    if request.method == "POST":
        if store:
            return Response({"detail": "Akun ini sudah memiliki toko. Edit toko yang tersedia."}, status=409)
        serializer = StoreSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                serializer.save(owner=request.user)
        except IntegrityError:
            return Response({"detail": "Akun ini sudah memiliki toko."}, status=409)
        return Response(serializer.data, status=201)
    if store is None:
        return Response({"detail": "Toko tidak ditemukan."}, status=404)
    if request.method == "DELETE":
        if request.data.get("confirmation_name") != store.name:
            return Response({"detail": "Ketik nama toko dengan tepat untuk mengonfirmasi penghapusan."}, status=400)
        store.delete()
        return Response(status=204)
    serializer = StoreSerializer(store, data=request.data, partial=True, context={"request": request})
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([AllowAny])
def public_store(request, pk):
    # Closed stores remain readable so their status and address are unambiguous.
    return Response(StoreSerializer(get_object_or_404(Store, pk=pk)).data)
