from django.urls import path
from . import views
from . import store_views, commerce_views

urlpatterns = [
    path("checkout", commerce_views.checkout),
    path("partner/dashboard", commerce_views.partner_dashboard),
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
    path("reservations/<int:pk>/cancel", views.cancel_reservation),
    path("dashboard", views.dashboard),
    path("partner/geocode", store_views.geocode),
    path("partner/store", store_views.partner_store),
    path("partner/stores", store_views.partner_stores),
    path("partner/stores/<int:pk>", store_views.partner_store_detail),
    path("stores/<int:pk>", store_views.public_store),
    path("stores/<int:pk>/listings", store_views.public_store_listings),
]
