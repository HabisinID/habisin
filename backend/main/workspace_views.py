"""Role-scoped partner orders and admin listing moderation."""
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.contrib.auth.models import User
from django.db import transaction
from django.db.models import Count, Q, Sum
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from .commerce_views import require_role
from .listing_services import ListingConflict, available_listings, lock_listing
from .models import Complaint, Listing, ListingStockAction, ModerationLog, PartnerApproval, Reservation, Store
from .serializers import ListingSerializer, PartnerOrderSerializer, StoreSerializer
from .views import release_stock

WIB = ZoneInfo("Asia/Jakarta")


def integer(request, name, default, minimum=1, maximum=1000000):
    try:
        value = int(request.query_params.get(name, default))
    except (ValueError, TypeError):
        raise ValidationError({name: "Gunakan angka bulat."})
    if not minimum <= value <= maximum:
        raise ValidationError({name: "Angka di luar batas."})
    return value


def paginated(request, items, serializer):
    page = integer(request, "page", 1)
    size = integer(request, "page_size", 25, maximum=100)
    total = items.count()
    return {"results": serializer(items[(page-1)*size:page*size], many=True).data, "count": total, "page": page, "page_size": size}


@api_view(["GET"])
def partner_orders(request):
    require_role(request, "partner")
    Reservation.expire_overdue()
    orders = Reservation.objects.filter(listing__owner=request.user).select_related("listing", "listing__store_profile", "user").annotate(deadline_value=Coalesce("pickup_deadline", "listing__pickup_end"))
    store_id = request.query_params.get("store_id")
    if store_id:
        store = get_object_or_404(Store, pk=integer(request, "store_id", 0), owner=request.user)
        orders = orders.filter(listing__store_profile=store)
    bounds = {}
    for name in ["from", "to"]:
        value = request.query_params.get(name)
        if value:
            try:
                bounds[name] = date.fromisoformat(value)
            except ValueError:
                raise ValidationError({name: "Tanggal harus YYYY-MM-DD."})
    if len(bounds) == 2 and not 0 <= (bounds["to"]-bounds["from"]).days <= 366:
        raise ValidationError({"to": "Rentang tanggal maksimal 366 hari dan tidak boleh terbalik."})
    if "from" in bounds:
        orders = orders.filter(deadline_value__gte=datetime.combine(bounds["from"], time.min, tzinfo=WIB))
    if "to" in bounds:
        orders = orders.filter(deadline_value__lt=datetime.combine(bounds["to"]+timedelta(days=1), time.min, tzinfo=WIB))
    counts = {row["status"]: row["total"] for row in orders.values("status").annotate(total=Count("id"))}
    status = request.query_params.get("status", "all")
    if status == "active":
        orders = orders.filter(status__in=Reservation.ACTIVE_STATUSES)
    elif status == "history":
        orders = orders.filter(status__in=Reservation.FINISHED_STATUSES)
    elif status in Reservation.ACTIVE_STATUSES + Reservation.FINISHED_STATUSES:
        orders = orders.filter(status=status)
    elif status != "all":
        raise ValidationError({"status": "Filter status tidak valid."})
    search = request.query_params.get("q", "").strip()[:100]
    if search:
        orders = orders.filter(Q(listing__name__icontains=search) | Q(user__first_name__icontains=search) | Q(user__username__icontains=search))
    data = paginated(request, orders.order_by("deadline_value", "id") if status in ["active", "paid"] else orders.order_by("-created_at", "-id"), PartnerOrderSerializer)
    return Response({**data, "counts": counts})


def reason_value(request):
    value = request.data.get("reason")
    if not isinstance(value, str) or not 1 <= len(value.strip()) <= 500:
        raise ValidationError({"reason": "Isi alasan 1–500 karakter."})
    return value.strip()


@api_view(["POST"])
def partner_cancel(request, pk):
    require_role(request, "partner")
    reason = reason_value(request)
    Reservation.expire_overdue()
    before = get_object_or_404(Reservation, pk=pk, listing__owner=request.user)
    with transaction.atomic():
        User.objects.select_for_update().get(pk=before.user_id)
        item = lock_listing(before.listing_id, request.user)
        order = Reservation.objects.select_for_update().select_related("listing", "user").get(pk=pk)
        if order.status == "cancelled" and order.cancelled_by == "partner":
            return Response(PartnerOrderSerializer(order).data)
        if order.status not in Reservation.ACTIVE_STATUSES or order.deadline <= timezone.now():
            raise ListingConflict("Pesanan sudah selesai, dibatalkan atau kedaluwarsa.")
        order.status = "cancelled"
        order.cancellation_note = reason
        order.cancelled_by = "partner"
        order.cancelled_at = timezone.now()
        order.save(update_fields=["status", "cancellation_note", "cancelled_by", "cancelled_at"])
        release_stock(item.pk, order.quantity)
        order.listing.refresh_from_db()
        return Response(PartnerOrderSerializer(order).data)


@api_view(["POST"])
def close_store(request, pk):
    require_role(request, "partner")
    Reservation.expire_overdue()
    with transaction.atomic():
        store = get_object_or_404(Store.objects.select_for_update(), pk=pk, owner=request.user)
        if request.data.get("confirmation_name") != store.name:
            raise ValidationError({"confirmation_name": "Ketik nama toko dengan tepat."})
        if store.closed_at:
            return Response(StoreSerializer(store).data)
        items = list(Listing.objects.select_for_update().filter(store_profile=store).order_by("pk"))
        if Reservation.objects.filter(listing_id__in=[item.pk for item in items], status__in=Reservation.ACTIVE_STATUSES).exists():
            raise ListingConflict("Tangani pesanan aktif sebelum menutup toko permanen.")
        store.closed_at = timezone.now()
        store.is_open = False
        store.save(update_fields=["closed_at", "is_open", "updated_at"])
        Listing.objects.filter(store_profile=store).update(active=False)
        ListingStockAction.objects.filter(listing__store_profile=store, used=False).update(used=True)
        return Response(StoreSerializer(store).data)


def log_data(log):
    return {"id": log.pk, "listing_id": log.listing_id, "target_name": log.target_name, "store_name": log.store_name,
            "action": log.action, "reason": log.reason, "created_at": log.created_at.isoformat(),
            "actor_name": (log.actor.get_full_name() or log.actor.username) if log.actor else "Admin dihapus"}


@api_view(["GET"])
def admin_summary(request):
    require_role(request, "admin")
    Reservation.expire_overdue()
    now = timezone.localtime()
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)
    completed_today = Reservation.objects.filter(
        status="picked_up", picked_up_at__gte=start, picked_up_at__lt=end
    )
    complaint_counts = {
        row["status"]: row["total"]
        for row in Complaint.objects.values("status").annotate(total=Count("id"))
    }
    complaints_new = complaint_counts.get("open", 0)
    complaints_reviewed = complaint_counts.get("reviewed", 0)
    # Keep the legacy field's meaning: all unresolved reports.
    complaints_open = complaints_new + complaints_reviewed
    complaint_preview = [
        {
            "id": complaint.pk,
            "listing_name": complaint.reservation.listing.name,
            "store_name": complaint.store.name,
            "reason_label": complaint.get_reason_display(),
            "created_at": complaint.created_at.isoformat(),
        }
        for complaint in Complaint.objects.filter(status__in=["open", "reviewed"])
        .select_related("store", "reservation__listing")[:3]
    ]
    pending_approvals = (
        PartnerApproval.objects.filter(status="pending")
        .select_related("user")
        .prefetch_related("user__stores")
        .order_by("requested_at", "id")
    )
    partner_approval_preview = []
    for approval in pending_approvals[:3]:
        store = next(iter(approval.user.stores.all()), None)
        partner_approval_preview.append({
            "id": approval.pk,
            "name": (approval.user.get_full_name() or approval.user.username),
            "store_name": store.name if store else None,
            "category": store.category if store else None,
            "neighborhood": store.neighborhood if store else None,
            "requested_at": approval.requested_at.isoformat(),
        })
    return Response({"listings_live": available_listings().count(), "orders_today": Reservation.objects.filter(created_at__gte=start, created_at__lt=end).count(),
                     "partners_active": User.objects.filter(is_active=True, is_staff=False, profile__role="partner").count(),
                     "recent_activity": [log_data(row) for row in ModerationLog.objects.select_related("actor")[:5]],
                     "complaints_available": True, "complaints_open": complaints_open,
                     "complaints_new": complaints_new,
                     "complaints_reviewed": complaints_reviewed,
                     "complaints_unresolved": complaints_open,
                     "complaint_preview": complaint_preview,
                     "partner_approval_available": True,
                     "partner_approvals_pending": PartnerApproval.objects.filter(status="pending").count(),
                     "partner_approval_preview": partner_approval_preview,
                     "pickup_portions_today": completed_today.aggregate(total=Sum("quantity"))["total"] or 0})


@api_view(["GET"])
def admin_listings(request):
    require_role(request, "admin")
    items = Listing.objects.filter(deleted_at__isnull=True).select_related("store_profile").order_by("-pk")
    status = request.query_params.get("status", "all")
    if status == "removed":
        items = items.filter(moderated_at__isnull=False)
    elif status == "live":
        items = available_listings(items)
    elif status != "all":
        raise ValidationError({"status": "Filter tidak valid."})
    query = request.query_params.get("q", "").strip()[:100]
    if query:
        items = items.filter(Q(name__icontains=query) | Q(store__icontains=query))
    return Response(paginated(request, items, ListingSerializer))


@api_view(["POST"])
def moderate_listing(request, pk):
    require_role(request, "admin")
    reason = reason_value(request)
    action = request.data.get("action")
    if action not in ["take_down", "restore"]:
        raise ValidationError({"action": "Pilih turunkan atau pulihkan."})
    with transaction.atomic():
        item = lock_listing(pk)
        if item.deleted_at:
            raise ListingConflict("Listing sudah dihapus pemilik.")
        removed = bool(item.moderated_at)
        if removed == (action == "take_down"):
            return Response(ListingSerializer(item).data)
        item.moderated_at = timezone.now() if action == "take_down" else None
        item.moderated_by = request.user if action == "take_down" else None
        item.moderation_reason = reason if action == "take_down" else ""
        item.active = False
        item.save(update_fields=["moderated_at", "moderated_by", "moderation_reason", "active"])
        ListingStockAction.objects.filter(listing=item, used=False).update(used=True)
        ModerationLog.objects.create(listing=item, actor=request.user, target_name=item.name, store_name=item.store, action=action, reason=reason)
        return Response(ListingSerializer(item).data)


@api_view(["GET"])
def moderation_logs(request):
    require_role(request, "admin")
    logs = ModerationLog.objects.select_related("actor").all()
    action = request.query_params.get("action")
    if action:
        if action not in ["take_down", "restore"]:
            raise ValidationError({"action": "Filter tindakan tidak valid."})
        logs = logs.filter(action=action)
    query = request.query_params.get("q", "").strip()[:100]
    if query:
        logs = logs.filter(Q(target_name__icontains=query) | Q(store_name__icontains=query) | Q(reason__icontains=query))
    page, size = integer(request, "page", 1), integer(request, "page_size", 25, maximum=100)
    return Response({"results": [log_data(row) for row in logs[(page-1)*size:page*size]], "count": logs.count(), "page": page, "page_size": size})
