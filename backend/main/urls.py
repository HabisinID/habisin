from django.urls import path, include
from . import views
from . import store_views, commerce_views, workspace_views, reviews_views, verification, admin_complaints_views
from rest_framework.routers import DefaultRouter, SimpleRouter

router = DefaultRouter()
router.register(r"admin/moderation-logs", views.ModerationLogViewSet, basename="moderationlog")
router.register(r"admin/listings", views.AdminListingViewSet, basename="adminlisting")
approval_router = SimpleRouter()
approval_router.trailing_slash = "/?"
approval_router.register(r"admin/partner-approvals", views.PartnerApprovalViewSet, basename="partnerapproval")

urlpatterns = [
    path("", include(router.urls)),
    path("", include(approval_router.urls)),

    path("partner/orders", workspace_views.partner_orders),
    path("partner/reservations/<int:pk>/cancel", workspace_views.partner_cancel),
    path("partner/stores/<int:pk>/close", workspace_views.close_store),
    path("admin/summary", workspace_views.admin_summary),
    path("admin/complaints", admin_complaints_views.admin_complaints),
    path("admin/complaints/<int:pk>", admin_complaints_views.admin_complaint_status),
    path("admin/listings", workspace_views.admin_listings),
    path("admin/listings/<int:pk>/moderate", workspace_views.moderate_listing),
    path("admin/moderation-logs", workspace_views.moderation_logs),
    path("partner/dashboard", commerce_views.partner_dashboard),
    path("partner/kasir", verification.page),
    path("partner/kasir/check", verification.check),
    path("partner/kasir/recent", verification.recent),
    path("partner/kasir/<int:pk>/pickup", verification.pickup),
    path("partner/kasir/<int:pk>/undo", verification.undo),
    path("partner/listings/<int:pk>/sold-out", commerce_views.sold_out),
    path("partner/listings/<int:pk>/undo-sold-out", commerce_views.undo_sold_out),
    path("auth/csrf", views.csrf),
    path("auth/register", views.register),
    path("auth/login", views.sign_in),
    path("auth/logout", views.sign_out),
    path("auth/username", views.username_available),
    path("auth/me", views.me),
    path("auth/password", views.password),
    path("listings", views.listings),
    path("partner/listings", views.partner_listings),
    path("partner/listings/<int:pk>", views.partner_listing_detail),
    path("reservations", views.reservations),
    path("listings/<int:pk>/reservation-policy", views.listing_reservation_policy),
    path("reservations/<int:pk>", views.reservation_detail),
    path("reservations/<int:pk>/pay", views.pay_reservation),
    path("reservations/<int:pk>/cancel", views.cancel_reservation),
    path("dashboard", views.dashboard),
    path("partner/geocode", store_views.geocode),
    path("partner/store", store_views.partner_store),
    path("partner/stores", store_views.partner_stores),
    path("partner/stores/<int:pk>", store_views.partner_store_detail),
    path("stores/<int:pk>", store_views.public_store),
    path("stores/<int:pk>/listings", store_views.public_store_listings),
    path("stores/<int:pk>/reviews", reviews_views.store_reviews),
    path("listings/<int:pk>/review-eligibility", reviews_views.review_eligibility),
    path("reservations/<int:pk>/feedback", reviews_views.reservation_feedback),
    path("reviews", reviews_views.create_review),
    path("reviews/mine", reviews_views.my_feedback),
    path("reviews/<int:pk>", reviews_views.review_detail),
    path("complaints", reviews_views.create_complaint),
]
