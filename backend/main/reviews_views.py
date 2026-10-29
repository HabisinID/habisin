from django.db import IntegrityError, transaction
from django.db.models import Avg, Count
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import Complaint, Listing, Reservation, Review, Store
from .reviews_serializers import (
    ComplaintMineSerializer,
    ComplaintWriteSerializer,
    ReviewMineSerializer,
    ReviewPublicSerializer,
    ReviewWriteSerializer,
)


@api_view(["GET"])
@permission_classes([AllowAny])
def store_reviews(request, pk):
    store = get_object_or_404(Store, pk=pk)
    reviews = Review.objects.filter(store=store).select_related("user", "listing")
    stats = reviews.aggregate(average=Avg("rating"), count=Count("id"))
    return Response({
        "store_id": store.pk,
        "average_rating": round(stats["average"], 2) if stats["average"] is not None else None,
        "review_count": stats["count"],
        "reviews": ReviewPublicSerializer(reviews, many=True).data,
    })


@api_view(["GET"])
def my_feedback(request):
    reviews = Review.objects.filter(user=request.user).select_related("store", "listing")
    complaints = Complaint.objects.filter(user=request.user).select_related("store")
    return Response({
        "reviews": ReviewMineSerializer(reviews, many=True).data,
        "complaints": ComplaintMineSerializer(complaints, many=True).data,
    })


@api_view(["GET"])
def review_eligibility(request, pk):
    if request.user.is_staff or getattr(getattr(request.user, "profile", None), "role", None) != "buyer":
        return Response({"detail": "Fitur ulasan hanya tersedia untuk akun pembeli."}, status=403)
    listing = get_object_or_404(Listing.objects.select_related("store_profile"), pk=pk)
    review = Review.objects.filter(user=request.user, listing=listing).select_related("listing", "store").first()
    reservation = Reservation.objects.filter(
        user=request.user, listing=listing, status="picked_up"
    ).order_by("-picked_up_at", "-id").first()
    return Response({
        "listing": {
            "id": listing.pk,
            "name": listing.name,
            "store": listing.store,
            "store_id": listing.store_profile_id,
            "image": listing.image_file.url if listing.image_file else listing.image,
            "price": listing.price,
            "pickup_start": listing.pickup_start,
            "pickup_end": listing.pickup_end,
        },
        "can_review": reservation is not None and review is None and listing.store_profile_id is not None,
        "reservation_id": reservation.pk if reservation else (review.reservation_id if review else None),
        "review": ReviewMineSerializer(review).data if review else None,
    })


@api_view(["GET"])
def reservation_feedback(request, pk):
    if request.user.is_staff or getattr(getattr(request.user, "profile", None), "role", None) != "buyer":
        return Response({"detail": "Fitur ulasan hanya tersedia untuk akun pembeli."}, status=403)
    reservation = get_object_or_404(
        Reservation.objects.select_related("listing__store_profile"),
        pk=pk,
        user=request.user,
    )
    review = Review.objects.filter(user=request.user, listing=reservation.listing).select_related("listing", "store").first()
    complaint = Complaint.objects.filter(user=request.user, reservation=reservation).first()
    return Response({
        "can_review": reservation.status == "picked_up" and review is None,
        "review": ReviewMineSerializer(review).data if review else None,
        "can_complain": reservation.status in ["paid", "picked_up"] and complaint is None,
        "complaint": ComplaintMineSerializer(complaint).data if complaint else None,
    })


@api_view(["POST"])
def create_review(request):
    serializer = ReviewWriteSerializer(data=request.data, context={"request": request})
    serializer.is_valid(raise_exception=True)
    try:
        with transaction.atomic():
            review = serializer.save()
    except IntegrityError:
        return Response({"detail": "Produk ini sudah memiliki ulasan."}, status=409)
    return Response(ReviewMineSerializer(review).data, status=201)


@api_view(["PATCH", "DELETE"])
def review_detail(request, pk):
    review = get_object_or_404(Review, pk=pk, user=request.user)
    if request.method == "DELETE":
        review.delete()
        return Response(status=204)
    serializer = ReviewWriteSerializer(review, data=request.data, partial=True, context={"request": request})
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(ReviewMineSerializer(review).data)


@api_view(["POST"])
def create_complaint(request):
    serializer = ComplaintWriteSerializer(data=request.data, context={"request": request})
    serializer.is_valid(raise_exception=True)
    try:
        with transaction.atomic():
            complaint = serializer.save()
    except IntegrityError:
        return Response({"detail": "Pesanan ini sudah memiliki laporan."}, status=409)
    return Response(ComplaintWriteSerializer(complaint).data, status=201)
