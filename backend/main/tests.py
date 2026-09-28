from datetime import timedelta
from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from .models import Listing, Profile, Reservation


class AuthenticationTests(TestCase):
    def setUp(self):
        self.client = APIClient(enforce_csrf_checks=True)
        self.data = {"username": "testbuyer", "name": "Test Buyer", "email": "buyer@example.com", "password": "Secure-Meal-927!", "role": "buyer"}

    def mutate(self, path, data=None, method="post", client=None):
        client = client or self.client
        token = client.get("/api/auth/csrf").json()["csrfToken"]
        return getattr(client, method)(path, data or {}, format="json", HTTP_X_CSRFTOKEN=token)

    def register(self, **changes):
        return self.mutate("/api/auth/register", {**self.data, **changes})

    def test_csrf_required_for_anonymous_registration_and_login(self):
        for path in ["/api/auth/register", "/api/auth/login"]:
            self.assertEqual(self.client.post(path, self.data, format="json").status_code, 403)

    def test_registration_session_profile_logout_and_login(self):
        response = self.register()
        self.assertEqual(response.status_code, 201)
        self.assertNotIn("password", response.json())
        self.assertTrue(User.objects.get().check_password(self.data["password"]))
        self.assertTrue(self.client.cookies["sessionid"]["httponly"])
        self.assertEqual(self.client.get("/api/auth/me").json()["role"], "buyer")
        self.assertEqual(self.mutate("/api/auth/me", {"name": "New Name", "role": "admin"}, "patch").json()["role"], "buyer")
        self.assertEqual(User.objects.get().first_name, "New Name")
        self.assertEqual(self.mutate("/api/auth/logout").status_code, 200)
        self.assertEqual(self.client.get("/api/auth/me").status_code, 403)
        self.assertEqual(self.mutate("/api/auth/login", self.data).status_code, 200)
        self.assertEqual(self.mutate("/api/auth/login", {**self.data, "password": "wrong"}).status_code, 400)

    def test_duplicate_username_and_weak_password_and_role_escalation(self):
        self.assertEqual(self.register(password="12345678").status_code, 400)
        self.assertEqual(self.register(role="admin").status_code, 400)
        self.assertEqual(self.register().status_code, 201)
        self.assertEqual(self.register(username="TESTBUYER").status_code, 400)
        self.assertFalse(self.client.get("/api/auth/username?username=TESTBUYER").json()["available"])
        self.assertTrue(self.client.get("/api/auth/username?username=new_person").json()["available"])

    def test_password_change_invalidates_other_session_but_keeps_current(self):
        self.register()
        other = APIClient(enforce_csrf_checks=True)
        self.mutate("/api/auth/login", self.data, client=other)
        self.assertEqual(self.mutate("/api/auth/password", {"old_password": "wrong", "new_password": "Another-Strong-927!"}).status_code, 400)
        self.assertEqual(self.mutate("/api/auth/password", {"old_password": self.data["password"], "new_password": "Another-Strong-927!"}).status_code, 200)
        self.assertEqual(self.client.get("/api/auth/me").status_code, 200)
        self.assertEqual(other.get("/api/auth/me").status_code, 403)
        self.mutate("/api/auth/logout")
        self.assertEqual(self.mutate("/api/auth/login", self.data).status_code, 400)
        self.assertEqual(self.mutate("/api/auth/login", {**self.data, "password": "Another-Strong-927!"}).status_code, 200)

    def test_delete_requires_password(self):
        self.register()
        self.assertEqual(self.mutate("/api/auth/me", {"password": "wrong"}, "delete").status_code, 400)
        self.assertTrue(User.objects.exists())
        self.assertEqual(self.mutate("/api/auth/me", {"password": self.data["password"]}, "delete").status_code, 204)
        self.assertFalse(User.objects.exists())
        self.assertEqual(self.client.get("/api/auth/me").status_code, 403)

    def test_partner_and_admin_permissions(self):
        self.register(role="partner")
        self.assertEqual(self.client.get("/api/dashboard").status_code, 200)
        self.assertIsNone(self.client.get("/api/dashboard").json()["users"])
        self.assertEqual(self.mutate("/api/reservations", {"listing_id": 1}).status_code, 403)
        User.objects.update(is_staff=True)
        self.assertEqual(self.client.get("/api/auth/me").json()["role"], "admin")
        self.assertEqual(self.client.get("/api/dashboard").json()["users"], 1)


class ReservationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="buyer", password="Secure-Meal-927!")
        Profile.objects.create(user=self.user)
        self.client.force_authenticate(self.user)
        self.item = Listing.objects.create(name="Lunch", store="Demo", category="Makanan berat", description="Demo", address="Depok", price=15000, original_price=30000, stock=3, image="/demo.jpg", latitude=-6.36, longitude=106.83, pickup_start=timezone.now(), pickup_end=timezone.now() + timedelta(hours=4))

    def reserve(self, **changes):
        return self.client.post("/api/reservations", {"listing_id": self.item.pk, "quantity": 2, **changes}, format="json")

    def test_reserve_cancel_idempotently_and_prevent_overselling(self):
        order = self.reserve()
        self.assertEqual(order.status_code, 201)
        self.assertEqual(order.json()["total"], 30000)
        self.assertEqual(len(order.json()["code"]), 5)
        self.assertEqual(self.reserve().status_code, 400)
        self.item.refresh_from_db()
        self.assertEqual(self.item.stock, 1)
        for _ in range(2):
            self.assertEqual(self.client.post(f'/api/reservations/{order.json()["id"]}/cancel').status_code, 200)
        self.item.refresh_from_db()
        self.assertEqual(self.item.stock, 3)

    def test_order_ownership(self):
        order = self.reserve().json()
        other = User.objects.create_user(username="other")
        self.client.force_authenticate(other)
        self.assertEqual(self.client.get("/api/reservations").json(), [])
        self.assertEqual(self.client.post(f'/api/reservations/{order["id"]}/cancel').status_code, 404)

    def test_invalid_quantities_expiry_and_anonymous_access(self):
        for quantity in [0, -1, 11, "2", True, 1.5]:
            self.assertEqual(self.reserve(quantity=quantity).status_code, 400)
        self.item.pickup_end = timezone.now() - timedelta(minutes=1)
        self.item.save()
        self.assertEqual(self.reserve().status_code, 400)
        self.assertEqual(self.client.get("/api/listings").json(), [])
        self.client.force_authenticate(None)
        self.assertEqual(self.reserve().status_code, 403)
        self.assertEqual(self.client.get("/api/listings").status_code, 200)

    def test_account_deletion_restores_reserved_stock(self):
        self.reserve()
        self.assertEqual(self.client.delete("/api/auth/me", {"password": "Secure-Meal-927!"}, format="json").status_code, 204)
        self.item.refresh_from_db()
        self.assertEqual(self.item.stock, 3)
        self.assertFalse(Reservation.objects.exists())

    def test_buyer_cannot_access_dashboard(self):
        self.assertEqual(self.client.get("/api/dashboard").status_code, 403)
