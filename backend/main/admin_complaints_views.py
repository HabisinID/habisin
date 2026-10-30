"""Admin queue and resolution actions for buyer food complaints."""
from django.db import transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from .commerce_views import require_role
from .models import Complaint


def complaint_data(complaint):
    reservation = complaint.reservation
    listing = reservation.listing
    buyer = complaint.user
    return {
        "id": complaint.pk,
        "status": complaint.status,
        "status_label": complaint.get_status_display(),
        "reason": complaint.reason,
        "reason_label": complaint.get_reason_display(),
        "description": complaint.description,
        "created_at": complaint.created_at.isoformat(),
        "buyer_name": buyer.get_full_name() or buyer.username,
        "buyer_username": buyer.username,
        "store_name": complaint.store.name,
        "listing_id": listing.pk,
        "listing_name": listing.name,
        "listing_image": listing.image_file.url if listing.image_file else listing.image,
        "listing_active": listing.active,
        "listing_moderated_at": listing.moderated_at.isoformat() if listing.moderated_at else None,
        "listing_moderation_reason": listing.moderation_reason,
        "reservation_id": reservation.pk,
        "reservation_code": reservation.code,
        "reservation_status": reservation.status,
        "quantity": reservation.quantity,
        "total": reservation.total,
        "picked_up_at": reservation.picked_up_at.isoformat() if reservation.picked_up_at else None,
    }


def integer_param(request, name, default, maximum):
    try:
        value = int(request.query_params.get(name, default))
    except (TypeError, ValueError):
        raise ValidationError({name: "Gunakan angka bulat."})
    if value < 1 or value > maximum:
        raise ValidationError({name: "Angka di luar batas."})
    return value


@api_view(["GET"])
def admin_complaints(request):
    require_role(request, "admin")
    complaints = Complaint.objects.select_related(
        "user",
        "store",
        "reservation",
        "reservation__listing",
    )
    status = request.query_params.get("status", "open")
    if status in {"open", "reviewed", "resolved"}:
        complaints = complaints.filter(status=status)
    elif status != "all":
        raise ValidationError({"status": "Filter status komplain tidak valid."})

    query = request.query_params.get("q", "").strip()[:100]
    if query:
        complaints = complaints.filter(
            Q(description__icontains=query)
            | Q(store__name__icontains=query)
            | Q(reservation__listing__name__icontains=query)
            | Q(user__username__icontains=query)
            | Q(user__first_name__icontains=query)
            | Q(user__last_name__icontains=query)
        )

    counts = {
        row["status"]: row["total"]
        for row in Complaint.objects.values("status").annotate(total=Count("id"))
    }
    page = integer_param(request, "page", 1, 1000000)
    page_size = integer_param(request, "page_size", 25, 100)
    total = complaints.count()
    results = complaints[(page - 1) * page_size : page * page_size]
    return Response(
        {
            "results": [complaint_data(row) for row in results],
            "count": total,
            "page": page,
            "page_size": page_size,
            "counts": counts,
        }
    )


@api_view(["PATCH"])
def admin_complaint_status(request, pk):
    require_role(request, "admin")
    status = request.data.get("status")
    if not isinstance(status, str) or status not in {"reviewed", "resolved"}:
        raise ValidationError({"status": "Pilih sedang ditinjau atau selesai."})

    with transaction.atomic():
        complaint = get_object_or_404(
            Complaint.objects.select_for_update().select_related(
                "user", "store", "reservation", "reservation__listing"
            ),
            pk=pk,
        )
        if complaint.status == "resolved" and status != "resolved":
            raise ValidationError({"status": "Komplain yang selesai tidak dapat dibuka kembali."})
        if complaint.status != status:
            complaint.status = status
            complaint.save(update_fields=["status"])
    return Response(complaint_data(complaint))
