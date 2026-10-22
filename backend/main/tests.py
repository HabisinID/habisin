from datetime import timedelta
from io import StringIO
from django.contrib.auth.models import User
from django.core.management import call_command, CommandError
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


class PartnerListingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.partner = User.objects.create_user(username="partner", password="Secure-Meal-927!")
        Profile.objects.create(user=self.partner, role="partner")
        self.other = User.objects.create_user(username="other_partner")
        Profile.objects.create(user=self.other, role="partner")
        self.buyer = User.objects.create_user(username="customer")
        Profile.objects.create(user=self.buyer)
        self.data = {
            "name": "Roti Surplus", "store": "Toko Mitra", "category": "Roti & kue",
            "description": "Roti layak makan hari ini", "address": "Beji, Depok",
            "price": 10000, "original_price": 20000, "stock": 4,
            "image": "https://example.com/roti.jpg", "latitude": -6.36, "longitude": 106.83,
            "pickup_start": timezone.now().isoformat(),
            "pickup_end": (timezone.now() + timedelta(hours=4)).isoformat(),
        }
        self.item = Listing.objects.create(owner=self.partner, **self.data)
        self.path = f"/api/partner/listings/{self.item.pk}"
        self.client.force_authenticate(self.partner)

    def reserve(self, status="reserved"):
        return Reservation.objects.create(user=self.buyer, listing=self.item, quantity=1, total=10000, code="AB234", status=status)

    def test_ownerless_legacy_listing_stays_readable_without_exposing_owner(self):
        self.item.owner = None
        self.item.save()
        self.client.force_authenticate(None)
        response = self.client.get("/api/listings")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()[0]["id"], self.item.pk)
        self.assertNotIn("owner", response.json()[0])
        self.client.force_authenticate(self.partner)
        self.assertEqual(self.client.get("/api/partner/listings").json(), [])
        self.assertEqual(self.client.patch(self.path, {"name": "Hijacked"}, format="json").status_code, 404)

    def test_partner_can_create_read_update_toggle_and_delete_own_listing(self):
        response = self.client.post("/api/partner/listings", {**self.data, "owner": self.other.pk, "price": 0}, format="json")
        self.assertEqual(response.status_code, 201)
        item = Listing.objects.get(pk=response.json()["id"])
        self.assertEqual(item.owner, self.partner)
        self.assertEqual(item.price, 0)
        path = f"/api/partner/listings/{item.pk}"
        self.assertEqual(self.client.get(path).json()["name"], self.data["name"])
        self.assertEqual(len(self.client.get("/api/partner/listings").json()), 2)
        response = self.client.patch(path, {"name": "Updated", "stock": 2, "owner": self.other.pk}, format="json")
        self.assertEqual(response.status_code, 200)
        item.refresh_from_db()
        self.assertEqual((item.name, item.stock, item.owner), ("Updated", 2, self.partner))
        for active in [False, True]:
            self.assertEqual(self.client.patch(path, {"active": active}, format="json").status_code, 200)
            ids = [row["id"] for row in self.client.get("/api/listings").json()]
            self.assertEqual(item.pk in ids, active)
        self.assertEqual(self.client.delete(path).status_code, 204)
        self.assertFalse(Listing.objects.filter(pk=item.pk).exists())

    def test_inventory_permissions_and_cross_partner_access(self):
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get("/api/partner/listings").json(), [])
        for method in ["get", "patch", "delete"]:
            self.assertEqual(getattr(self.client, method)(self.path).status_code, 404)
        for user in [self.buyer, None]:
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get("/api/partner/listings").status_code, 403)
            self.assertEqual(self.client.post("/api/partner/listings", self.data, format="json").status_code, 403)
            self.assertEqual(self.client.patch(self.path, {"stock": 0}, format="json").status_code, 403)

    def test_partner_mutation_requires_csrf_for_session_authentication(self):
        client = APIClient(enforce_csrf_checks=True)
        client.force_login(self.partner)
        self.assertEqual(client.post("/api/partner/listings", self.data, format="json").status_code, 403)
        token = client.get("/api/auth/csrf").json()["csrfToken"]
        self.assertEqual(client.post("/api/partner/listings", self.data, format="json", HTTP_X_CSRFTOKEN=token).status_code, 201)

    def test_invalid_listing_fields_are_rejected_without_mutation(self):
        cases = [
            {"price": -1}, {"price": 30000}, {"original_price": -1}, {"stock": -1}, {"stock": 1.5},
            {"latitude": 91}, {"longitude": -181}, {"latitude": "NaN"},
            {"image": "javascript:alert(1)"}, {"image": "ftp://example.com/photo.jpg"}, {"category": "Invalid"}, {"name": ""},
            {"pickup_end": (timezone.now() - timedelta(hours=1)).isoformat()},
            {"pickup_start": (timezone.now() + timedelta(hours=5)).isoformat()},
        ]
        for changes in cases:
            with self.subTest(changes=changes):
                self.assertEqual(self.client.patch(self.path, changes, format="json").status_code, 400)
        self.item.refresh_from_db()
        self.assertEqual((self.item.stock, self.item.price, self.item.name), (4, 10000, "Roti Surplus"))

    def test_active_reservations_protect_purchase_fields_and_history_prevents_delete(self):
        order = self.reserve()
        for changes in [{"price": 5000}, {"address": "Alamat baru"}, {"latitude": -6.4}, {"pickup_end": (timezone.now() + timedelta(hours=5)).isoformat()}]:
            self.assertEqual(self.client.patch(self.path, changes, format="json").status_code, 400)
        self.assertEqual(self.client.patch(self.path, {"name": "Deskripsi diperbarui", "stock": 2}, format="json").status_code, 200)
        self.assertEqual(self.client.delete(self.path).status_code, 409)
        order.status = "cancelled"
        order.save()
        self.assertEqual(self.client.patch(self.path, {"price": 5000, "address": "Alamat baru"}, format="json").status_code, 200)
        self.assertEqual(self.client.delete(self.path).status_code, 409)
        self.assertTrue(Reservation.objects.filter(pk=order.pk).exists())

    def test_inventory_includes_inactive_expired_and_sold_out_listings(self):
        Listing.objects.filter(pk=self.item.pk).update(active=False, pickup_start=timezone.now() - timedelta(hours=2), pickup_end=timezone.now() - timedelta(hours=1))
        self.assertEqual(len(self.client.get("/api/partner/listings").json()), 1)
        self.assertEqual(self.client.get("/api/listings").json(), [])
        self.assertEqual(self.client.patch(self.path, {"stock": 0}, format="json").status_code, 200)
        self.client.force_authenticate(self.buyer)
        self.assertEqual(self.client.post("/api/reservations", {"listing_id": self.item.pk, "quantity": 1}, format="json").status_code, 400)

    def test_manual_stock_and_unrelated_edits_preserve_reservations(self):
        self.client.force_authenticate(self.buyer)
        order = self.client.post("/api/reservations", {"listing_id": self.item.pk, "quantity": 2}, format="json")
        self.assertEqual(order.status_code, 201)
        self.client.force_authenticate(self.partner)
        self.assertEqual(self.client.patch(self.path, {"name": "Updated"}, format="json").json()["stock"], 2)
        self.assertEqual(self.client.patch(self.path, {"stock": 0}, format="json").status_code, 200)
        self.client.force_authenticate(self.buyer)
        self.assertEqual(self.client.post("/api/reservations", {"listing_id": self.item.pk, "quantity": 1}, format="json").status_code, 400)
        self.assertEqual(self.client.post(f'/api/reservations/{order.json()["id"]}/cancel').json()["listing"]["stock"], 2)

    def test_seed_refuses_to_overwrite_partner_listing(self):
        with self.assertRaises(CommandError):
            call_command("seed_demo", stdout=StringIO())
        self.item.refresh_from_db()
        self.assertEqual((self.item.owner, self.item.stock), (self.partner, 4))
        self.assertEqual(Listing.objects.count(), 1)

    def test_deleting_partner_account_deactivates_listings_and_keeps_buyer_history(self):
        order = self.reserve()
        self.assertEqual(self.client.delete("/api/auth/me", {"password": "Secure-Meal-927!"}, format="json").status_code, 204)
        self.item.refresh_from_db()
        self.assertIsNone(self.item.owner)
        self.assertFalse(self.item.active)
        self.assertTrue(Reservation.objects.filter(pk=order.pk).exists())
