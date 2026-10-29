"""Partner dashboard and reversible stock operations; orders use main.views."""
import uuid
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo
from django.db import transaction
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.exceptions import ValidationError, PermissionDenied
from rest_framework.response import Response
from .models import Listing, ListingStockAction, Reservation, Store, PartnerApproval
from .serializers import ListingSerializer, ReservationSerializer, UserSerializer
from .listing_services import ListingConflict, lock_listing
from .models import Listing, ListingStockAction, Reservation, Store
from .serializers import ListingSerializer, PartnerOrderSerializer, UserSerializer
from .listing_services import ListingConflict, lock_listing, ensure_partner_listing_mutable


def require_role(request, role):
    if UserSerializer(request.user).data["role"] != role:
        raise PermissionDenied("Akses tidak sesuai peran akun.")
    if role == "partner" and not PartnerApproval.objects.filter(user=request.user, status="approved").exists():
        raise PermissionDenied("Akun mitra belum disetujui admin.")




@api_view(["GET"])
def partner_dashboard(request):
    require_role(request, "partner")
    Reservation.expire_overdue()
    wib = ZoneInfo("Asia/Jakarta")
    now = timezone.now()
    today = now.astimezone(wib).date()
    period = request.query_params.get("period", "week")
    days = {"today": 1, "week": 7, "month": 30, "year": 365}.get(period)
    if days is None:
        raise ValidationError({"period": "Pilih today, week, month atau year."})
    start = datetime.combine(today-timedelta(days=days-1), time.min, tzinfo=wib)
    end = datetime.combine(today+timedelta(days=1), time.min, tzinfo=wib)
    owned = Reservation.objects.filter(listing__owner=request.user).select_related("listing", "listing__store_profile", "user")
    paid = list(owned.filter(created_at__gte=start, created_at__lt=end).filter(status__in=["paid", "picked_up"]))
    # Simulated paid amounts are not evidence of actual food collection.
    series = {}
    for row in paid:
        day = row.created_at.astimezone(wib).date().isoformat()
        series[day] = series.get(day, 0) + row.quantity
    pickups = owned.filter(pickup_deadline__gt=now, pickup_deadline__lt=end, status="paid").order_by("pickup_deadline", "pk")
    stores = Store.objects.filter(owner=request.user).order_by("pk")
    return Response({
        "period": period, "booked_portions": sum(row.quantity for row in paid), "simulated_total": sum(row.total for row in paid),
        "series": [{"day": (start.date()+timedelta(days=i)).isoformat(), "portions": series.get((start.date()+timedelta(days=i)).isoformat(),0)} for i in range(days)],
        "pickups": [{**PartnerOrderSerializer(row).data, "buyer_name": row.user.get_full_name() or row.user.username} for row in pickups],
        "orders": [{**PartnerOrderSerializer(row).data, "buyer_name": row.user.get_full_name() or row.user.username} for row in owned.order_by("-created_at")[:100]],
        "listings": ListingSerializer(Listing.objects.filter(owner=request.user, deleted_at__isnull=True).select_related("store_profile").order_by("-pk"),many=True).data,
        "stores": [{"id":s.pk,"name":s.name,"address":s.address,"closing_time":s.closing_time.isoformat(),"is_open":s.is_open} for s in stores],
    })


@api_view(["POST"])
def sold_out(request, pk):
    require_role(request, "partner")
    Reservation.expire_overdue()
    with transaction.atomic():
        item = lock_listing(pk, request.user)
        ensure_partner_listing_mutable(item)
        if item.stock < 1:
            raise ListingConflict("Listing sudah habis; muat ulang dashboard.")
        ListingStockAction.objects.filter(listing=item, used=False).update(used=True)
        action = ListingStockAction.objects.create(listing=item, token=uuid.uuid4(), previous_stock=item.stock, expires_at=timezone.now()+timedelta(seconds=60))
        item.stock = 0
        item.save(update_fields=["stock"])
    return Response({"listing": ListingSerializer(item).data,"undo_token": str(action.token),"expires_at":action.expires_at.isoformat()})


@api_view(["POST"])
def undo_sold_out(request, pk):
    require_role(request,"partner")
    Reservation.expire_overdue()
    with transaction.atomic():
        item = lock_listing(pk, request.user)
        ensure_partner_listing_mutable(item)
        try:
            token = uuid.UUID(str(request.data.get("token")))
        except (ValueError, TypeError, AttributeError):
            raise ValidationError({"token":"Token tidak valid."})
        action = ListingStockAction.objects.select_for_update().filter(listing=item,token=token).first()
        if not action or action.used or action.expires_at <= timezone.now() or item.stock != 0:
            raise ListingConflict("Urungkan tidak tersedia: lewat 60 detik atau stok sudah berubah. Muat ulang listing.")
        item.stock=action.previous_stock
        item.save(update_fields=["stock"])
        action.used=True
        action.save(update_fields=["used"])
    return Response(ListingSerializer(item).data)
