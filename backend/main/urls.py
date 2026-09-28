from django.urls import path
from . import views

urlpatterns = [
    path("auth/csrf", views.csrf),
    path("auth/register", views.register),
    path("auth/login", views.sign_in),
    path("auth/logout", views.sign_out),
    path("auth/username", views.username_available),
    path("auth/me", views.me),
    path("auth/password", views.password),
    path("listings", views.listings),
    path("reservations", views.reservations),
    path("reservations/<int:pk>/cancel", views.cancel_reservation),
    path("dashboard", views.dashboard),
]
