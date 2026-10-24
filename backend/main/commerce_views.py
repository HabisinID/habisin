"""Atomic simulated checkout and partner operations; no payment provider."""
import hashlib
import json
import secrets
import uuid
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo
from django.contrib.auth.models import User
from django.db import IntegrityError, transaction
from django.db.models import F
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.exceptions import ValidationError, PermissionDenied
from rest_framework.response import Response
from .models import CheckoutBatch, Listing, ListingStockAction, Reservation, Store
from .serializers import ListingSerializer, ReservationSerializer, UserSerializer
from .listing_services import ListingConflict, available_listings, lock_listing, lock_stores
from .reservation_policy import reservation_policy


def require_role(request, role):
    if UserSerializer(request.user).data["role"] != role:
        raise PermissionDenied("Akses tidak sesuai peran akun.")


def create_reservation(user, item, quantity):
    for attempt in range(5):
        try:
            with transaction.atomic():
                return Reservation.objects.create(user=user, listing=item, quantity=quantity, total=item.price * quantity,
                    code="".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(5)))
        except IntegrityError:
            if attempt == 4:
                raise


@api_view(["POST"])
def checkout(request):
    require_role(request, "buyer")
    try:
        key = uuid.UUID(str(request.data.get("key")))
    except (ValueError, TypeError, AttributeError):
        raise ValidationError({"key": "Token checkout tidak valid."})
    rows = request.data.get("items")
    if not isinstance(rows, list) or not 1 <= len(rows) <= 20:
        raise ValidationError({"items": "Pilih 1–20 makanan."})
    normalized = []
    for row in rows:
        if not isinstance(row, dict) or type(row.get("listing_id")) is not int or type(row.get("quantity")) is not int or not 1 <= row["quantity"] <= 10 or type(row.get("expected_price")) is not int or row["expected_price"] < 0:
            raise ValidationError({"items": "Produk, harga, dan jumlah 1–10 porsi harus valid."})
        normalized.append({k: row[k] for k in ["listing_id", "quantity", "expected_price"]})
    normalized.sort(key=lambda row: row["listing_id"])
    ids = [row["listing_id"] for row in normalized]
    if len(set(ids)) != len(ids):
        raise ValidationError({"items": "Gabungkan porsi produk yang sama."})
    fingerprint = hashlib.sha256(json.dumps(normalized, sort_keys=True).encode()).hexdigest()
    with transaction.atomic():
        User.objects.select_for_update().get(pk=request.user.pk)
        existing = CheckoutBatch.objects.filter(user=request.user, key=key).first()
        if existing:
            if existing.fingerprint != fingerprint:
                raise ListingConflict("Token sudah dipakai untuk pilihan berbeda. Muat ulang checkout.")
            reservations = Reservation.objects.filter(pk__in=existing.reservation_ids, user=request.user).select_related("listing", "listing__store_profile").order_by("pk")
            return Response(ReservationSerializer(reservations, many=True).data)
        before = dict(Listing.objects.filter(pk__in=ids).values_list("pk", "store_profile_id"))
        if len(before) != len(ids):
            raise ListingConflict("Salah satu makanan tidak tersedia. Muat ulang katalog.")
        lock_stores(before.values())
        locked = {item.pk: item for item in Listing.objects.select_for_update().filter(pk__in=ids).order_by("pk")}
        result = []
        for row in normalized:
            item = locked[row["listing_id"]]
            if item.store_profile_id != before[item.pk]:
                raise ListingConflict()
            if item.price != row["expected_price"]:
                raise ListingConflict(f"Harga {item.name} berubah. Muat ulang katalog sebelum membayar.")
            policy = reservation_policy(request.user, item)
            if policy["reason"] or item.price == 0 and row["quantity"] > policy["max_quantity"]:
                raise ListingConflict(policy["reason"] or "Jumlah gratis melebihi kuota toko hari ini.")
            if not available_listings().filter(pk=item.pk, stock__gte=row["quantity"]).update(stock=F("stock")-row["quantity"]):
                raise ListingConflict(f"Stok {item.name} tidak cukup atau waktu ambil berakhir.")
            item.refresh_from_db()
            result.append(create_reservation(request.user, item, row["quantity"]))
        CheckoutBatch.objects.create(user=request.user, key=key, fingerprint=fingerprint, reservation_ids=[row.pk for row in result])
    return Response(ReservationSerializer(result, many=True).data, status=201)


@api_view(["GET"])
def partner_dashboard(request):
    require_role(request, "partner")
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
    paid = list(owned.filter(created_at__gte=start, created_at__lt=end).exclude(status="cancelled"))
    # No completed/collected status exists yet: report bookings, not pickups.
    series = {}
    for row in paid:
        day = row.created_at.astimezone(wib).date().isoformat()
        series[day] = series.get(day, 0) + row.quantity
    pickups = owned.filter(listing__pickup_end__gte=datetime.combine(today,time.min,tzinfo=wib), listing__pickup_end__lt=end).exclude(status="cancelled").order_by("listing__pickup_end", "pk")
    stores = Store.objects.filter(owner=request.user).order_by("pk")
    return Response({
        "period": period, "booked_portions": sum(row.quantity for row in paid), "simulated_total": sum(row.total for row in paid),
        "series": [{"day": (start.date()+timedelta(days=i)).isoformat(), "portions": series.get((start.date()+timedelta(days=i)).isoformat(),0)} for i in range(days)],
        "pickups": [{**ReservationSerializer(row).data, "buyer_name": row.user.get_full_name() or row.user.username} for row in pickups],
        "orders": [{**ReservationSerializer(row).data, "buyer_name": row.user.get_full_name() or row.user.username} for row in owned.order_by("-created_at")[:100]],
        "listings": ListingSerializer(Listing.objects.filter(owner=request.user).select_related("store_profile").order_by("-pk"),many=True).data,
        "stores": [{"id":s.pk,"name":s.name,"address":s.address,"closing_time":s.closing_time.isoformat(),"is_open":s.is_open} for s in stores],
    })


@api_view(["POST"])
def sold_out(request, pk):
    require_role(request, "partner")
    with transaction.atomic():
        item = lock_listing(pk, request.user)
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
    with transaction.atomic():
        item = lock_listing(pk, request.user)
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
