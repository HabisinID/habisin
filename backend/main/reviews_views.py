from django.db import IntegrityError, transaction
from django.db.models import Avg, Count
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import Complaint, Review, Store
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
    reviews = Review.objects.filter(store=store).select_related("user")
    stats = reviews.aggregate(average=Avg("rating"), count=Count("id"))
    return Response({
        "store_id": store.pk,
        "average_rating": round(stats["average"], 2) if stats["average"] is not None else None,
        "review_count": stats["count"],
        "reviews": ReviewPublicSerializer(reviews, many=True).data,
    })


@api_view(["GET"])
def my_feedback(request):
    reviews = Review.objects.filter(user=request.user).select_related("store")
    complaints = Complaint.objects.filter(user=request.user).select_related("store")
    return Response({
        "reviews": ReviewMineSerializer(reviews, many=True).data,
        "complaints": ComplaintMineSerializer(complaints, many=True).data,
    })


@api_view(["POST"])
def create_review(request):
    serializer = ReviewWriteSerializer(data=request.data, context={"request": request})
    serializer.is_valid(raise_exception=True)
    try:
        with transaction.atomic():
            review = serializer.save()
    except IntegrityError:
        return Response({"detail": "Pesanan ini sudah memiliki ulasan."}, status=409)
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
