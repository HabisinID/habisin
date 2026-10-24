from datetime import datetime, timedelta
from io import StringIO
from unittest.mock import patch
from django.contrib.auth.models import User
from django.db import IntegrityError
from django.core.cache import cache
from django.core.management import call_command, CommandError
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from .models import Listing, Profile, Reservation, Store


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

    def test_preview_origin_still_requires_token_and_rejects_external_origin(self):
        token = self.client.get("/api/auth/csrf").json()["csrfToken"]
        payload = {"username": "missing_preview_user", "password": "Wrong-Preview-381!"}
        self.assertEqual(self.client.post("/api/auth/login", payload, format="json", HTTP_ORIGIN="http://127.0.0.1:3001").status_code, 403)
        self.assertEqual(self.client.post("/api/auth/login", payload, format="json", HTTP_ORIGIN="http://127.0.0.1:3001", HTTP_X_CSRFTOKEN=token).status_code, 400)
        self.assertEqual(self.client.post("/api/auth/login", payload, format="json", HTTP_ORIGIN="https://untrusted.invalid", HTTP_X_CSRFTOKEN=token).status_code, 403)

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
        cache.clear()
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
        self.assertEqual(order.json()["status"], "pending")
        self.assertIsNone(order.json()["paid_at"])
        self.assertEqual(self.reserve().status_code, 400)
        self.item.refresh_from_db()
        self.assertEqual(self.item.stock, 1)
        for _ in range(2):
            cancelled = self.client.post(f'/api/reservations/{order.json()["id"]}/cancel')
            self.assertEqual(cancelled.status_code, 200)
            self.assertEqual(cancelled.json()["status"], "cancelled")
        self.item.refresh_from_db()
        self.assertEqual(self.item.stock, 3)

    def test_order_ownership(self):
        order = self.reserve().json()
        other = User.objects.create_user(username="other")
        self.client.force_authenticate(other)
        self.assertEqual(self.client.get("/api/reservations").json(), [])
        self.assertEqual(self.client.post(f'/api/reservations/{order["id"]}/cancel').status_code, 404)

    def test_invalid_quantities_expiry_and_anonymous_access(self):
        # Enough stock that only the 4-portion limit can reject 5.
        Listing.objects.filter(pk=self.item.pk).update(stock=10)
        for quantity in [0, -1, 5, 11, "2", True, 1.5]:
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


class ReservationFlowTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.user = User.objects.create_user(username="buyer", password="Secure-Meal-927!")
        Profile.objects.create(user=self.user)
        self.client.force_authenticate(self.user)
        self.item = Listing.objects.create(name="Lunch", store="Demo", category="Makanan berat", description="Demo", address="Depok", price=15000, original_price=30000, stock=5, image="/demo.jpg", latitude=-6.36, longitude=106.83, pickup_start=timezone.now(), pickup_end=timezone.now() + timedelta(hours=4))

    def reserve(self, **changes):
        return self.client.post("/api/reservations", {"listing_id": self.item.pk, "quantity": 2, **changes}, format="json")

    def order(self, **changes):
        return self.reserve(**changes).json()["id"]

    def stock(self):
        self.item.refresh_from_db()
        return self.item.stock

    def set_status(self, pk, status):
        Reservation.objects.filter(pk=pk).update(status=status)

    def as_other_user(self):
        other = User.objects.create_user(username="other")
        Profile.objects.create(user=other)
        self.client.force_authenticate(other)

    def test_create_pending_order_with_note(self):
        response = self.reserve(note="  Tolong dibungkus terpisah  ")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["status"], "pending")
        self.assertEqual(response.json()["note"], "Tolong dibungkus terpisah")
        self.assertEqual(self.stock(), 3)

    def test_note_validation(self):
        for note in ["x" * 141, 123, ["catatan"]]:
            self.assertEqual(self.reserve(note=note).status_code, 400)
        self.assertEqual(self.stock(), 5)
        self.assertEqual(self.reserve(note="x" * 140).status_code, 201)

    def test_detail_is_owner_only(self):
        pk = self.order()
        self.assertEqual(self.client.get(f"/api/reservations/{pk}").json()["id"], pk)
        self.as_other_user()
        self.assertEqual(self.client.get(f"/api/reservations/{pk}").status_code, 404)

    def test_edit_pending_order_moves_stock_and_total(self):
        pk = self.order()
        response = self.client.patch(f"/api/reservations/{pk}", {"quantity": 4, "note": "Jam 7 malam"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["quantity"], 4)
        self.assertEqual(response.json()["total"], 60000)
        self.assertEqual(response.json()["note"], "Jam 7 malam")
        self.assertEqual(self.stock(), 1)
        self.assertEqual(self.client.patch(f"/api/reservations/{pk}", {"quantity": 1}, format="json").status_code, 200)
        self.assertEqual(self.stock(), 4)
        self.assertEqual(self.client.patch(f"/api/reservations/{pk}", {"note": ""}, format="json").json()["quantity"], 1)

    def test_edit_rejects_overselling_and_invalid_input(self):
        pk = self.order()
        Listing.objects.filter(pk=self.item.pk).update(stock=1)
        self.assertEqual(self.client.patch(f"/api/reservations/{pk}", {"quantity": 4}, format="json").status_code, 400)
        for quantity in [0, 5, "3", True, 1.5]:
            self.assertEqual(self.client.patch(f"/api/reservations/{pk}", {"quantity": quantity}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(f"/api/reservations/{pk}", {"note": "x" * 141}, format="json").status_code, 400)
        self.assertEqual(Reservation.objects.get(pk=pk).quantity, 2)
        self.assertEqual(self.stock(), 1)

    def test_edit_only_while_pending(self):
        pk = self.order()
        for status in ["paid", "picked_up", "cancelled"]:
            self.set_status(pk, status)
            self.assertEqual(self.client.patch(f"/api/reservations/{pk}", {"quantity": 1}, format="json").status_code, 409)
        self.assertEqual(self.stock(), 3)

    def test_pay_once(self):
        pk = self.order()
        response = self.client.post(f"/api/reservations/{pk}/pay")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "paid")
        self.assertIsNotNone(response.json()["paid_at"])
        self.assertEqual(self.client.post(f"/api/reservations/{pk}/pay").status_code, 409)
        self.assertEqual(self.stock(), 3)

    def test_cannot_pay_cancelled_or_expired_order(self):
        cancelled = self.order()
        self.client.post(f"/api/reservations/{cancelled}/cancel")
        self.assertEqual(self.client.post(f"/api/reservations/{cancelled}/pay").status_code, 409)
        expired = self.order()
        Reservation.objects.filter(listing_id=self.item.pk).update(pickup_deadline=timezone.now() - timedelta(minutes=1))
        self.assertEqual(self.client.post(f"/api/reservations/{expired}/pay").status_code, 409)
        self.assertEqual(Reservation.objects.get(pk=expired).status, "expired")

    def test_cancel_pending_and_paid_but_not_picked_up(self):
        pending, paid, picked_up = self.order(quantity=1), self.order(quantity=1), self.order(quantity=1)
        self.client.post(f"/api/reservations/{paid}/pay")
        self.set_status(picked_up, "picked_up")
        self.assertEqual(self.stock(), 2)
        for pk in [pending, paid]:
            self.assertEqual(self.client.post(f"/api/reservations/{pk}/cancel").json()["status"], "cancelled")
        self.assertEqual(self.stock(), 4)
        self.assertEqual(self.client.post(f"/api/reservations/{picked_up}/cancel").status_code, 409)
        self.assertEqual(self.stock(), 4)

    def test_delete_only_finished_orders_from_history(self):
        pending, paid, cancelled, picked_up = (self.order(quantity=1) for _ in range(4))
        self.client.post(f"/api/reservations/{paid}/pay")
        self.client.post(f"/api/reservations/{cancelled}/cancel")
        self.set_status(picked_up, "picked_up")
        for pk in [pending, paid]:
            self.assertEqual(self.client.delete(f"/api/reservations/{pk}").status_code, 409)
        stock = self.stock()
        for pk in [cancelled, picked_up]:
            self.assertEqual(self.client.delete(f"/api/reservations/{pk}").status_code, 204)
        self.assertEqual(self.stock(), stock)
        self.assertEqual(set(Reservation.objects.values_list("pk", flat=True)), {pending, paid})

    def test_other_users_cannot_touch_order(self):
        pk = self.order()
        self.as_other_user()
        self.assertEqual(self.client.patch(f"/api/reservations/{pk}", {"quantity": 1}, format="json").status_code, 404)
        self.assertEqual(self.client.post(f"/api/reservations/{pk}/pay").status_code, 404)
        self.assertEqual(self.client.delete(f"/api/reservations/{pk}").status_code, 404)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.post(f"/api/reservations/{pk}/pay").status_code, 403)
        self.assertEqual(Reservation.objects.get(pk=pk).status, "pending")

    def test_order_changes_are_rate_limited_per_user(self):
        pk = self.order()
        for _ in range(29):
            self.assertEqual(self.client.post(f"/api/reservations/{pk}/cancel").status_code, 200)
        throttled = self.client.post(f"/api/reservations/{pk}/cancel")
        self.assertEqual(throttled.status_code, 429)
        self.assertIn("Retry-After", throttled)
        self.assertRegex(throttled.json()["detail"], r"^Terlalu banyak permintaan\. Coba lagi dalam \d+ detik\.$")
        self.assertEqual(self.reserve().status_code, 429)
        self.assertEqual(self.client.get("/api/reservations").status_code, 200)
        self.assertEqual(self.client.get(f"/api/reservations/{pk}").status_code, 200)
        self.as_other_user()
        self.assertEqual(self.reserve().status_code, 201)

    def test_ticket_codes_skip_look_alike_characters(self):
        # No B/8, S/5, Z/2, G/6, O/0, I/1/L, Q: the cashier types the code by hand.
        with patch("main.views.secrets.choice", side_effect=lambda alphabet: alphabet[0]) as choice:
            self.reserve()
        self.assertEqual(choice.call_args.args[0], "ACDEFHJKMNPRTUVWXY3479")

    def test_ticket_code_collision_retries_with_new_code(self):
        Reservation.objects.create(user=self.user, listing=self.item, quantity=1, total=15000, code="AAAAA", status="cancelled")
        with patch("main.views.secrets.choice", side_effect=list("AAAAABBBBB")):
            self.assertEqual(self.reserve().json()["code"], "BBBBB")
        with patch("main.views.secrets.choice", return_value="A"), self.assertRaises(IntegrityError):
            self.reserve()
        self.assertEqual(self.stock(), 3)


    def age(self, pk, minutes):
        Reservation.objects.filter(pk=pk).update(created_at=timezone.now() - timedelta(minutes=minutes))

    def test_unpaid_order_expires_after_payment_window(self):
        pk = self.order()
        self.age(pk, 4)
        self.assertEqual(self.client.get(f"/api/reservations/{pk}").json()["status"], "pending")
        self.age(pk, 6)
        self.assertEqual(self.client.get(f"/api/reservations/{pk}").json()["status"], "expired")
        self.assertEqual(self.stock(), 5)
        self.assertEqual(self.client.post(f"/api/reservations/{pk}/pay").status_code, 409)
        self.assertEqual(self.client.post(f"/api/reservations/{pk}/cancel").status_code, 409)
        self.assertEqual(self.client.delete(f"/api/reservations/{pk}").status_code, 204)

    def test_pay_before_is_capped_by_pickup_end(self):
        order = self.reserve().json()
        created = datetime.fromisoformat(order["created_at"])
        self.assertEqual(datetime.fromisoformat(order["pay_before"]), created + timedelta(minutes=5))
        end = timezone.now() + timedelta(minutes=2)
        Reservation.objects.filter(pk=order["id"]).update(pickup_deadline=end)
        pay_before = self.client.get(f"/api/reservations/{order['id']}").json()["pay_before"]
        self.assertEqual(datetime.fromisoformat(pay_before), end)

    def test_paid_order_expires_when_not_picked_up(self):
        pk = self.order()
        self.client.post(f"/api/reservations/{pk}/pay")
        self.age(pk, 60)
        self.assertEqual(self.client.get(f"/api/reservations/{pk}").json()["status"], "paid")
        Reservation.objects.filter(listing_id=self.item.pk).update(pickup_deadline=timezone.now() - timedelta(minutes=1))
        self.assertEqual(self.client.get("/api/reservations").json()[0]["status"], "expired")
        self.assertEqual(self.stock(), 5)

    def test_catalog_releases_stock_held_by_unpaid_orders(self):
        pk = self.order()
        self.age(pk, 6)
        self.client.force_authenticate(None)
        listing = next(item for item in self.client.get("/api/listings").json() if item["id"] == self.item.pk)
        self.assertEqual(listing["stock"], 5)
        self.assertEqual(Reservation.objects.get(pk=pk).status, "expired")


    def ends_in(self, minutes):
        end = timezone.now() + timedelta(minutes=minutes)
        Listing.objects.filter(pk=self.item.pk).update(pickup_end=end)
        Reservation.objects.filter(listing=self.item).update(pickup_deadline=end)
        return end

    def test_paid_orders_cannot_be_cancelled_in_last_30_minutes(self):
        paid = self.order(quantity=1)
        self.client.post(f"/api/reservations/{paid}/pay")
        end = self.ends_in(20)
        response = self.client.post(f"/api/reservations/{paid}/cancel")
        self.assertEqual(response.status_code, 409)
        self.assertIn(f"Pembatalan ditutup pukul {timezone.localtime(end - timedelta(minutes=30)):%H.%M}", response.json()["detail"])
        self.assertEqual(Reservation.objects.get(pk=paid).status, "paid")
        self.assertEqual(self.stock(), 4)

    def test_unpaid_orders_and_early_cancellations_are_allowed(self):
        pending = self.order(quantity=1)
        self.ends_in(20)
        self.assertEqual(self.client.post(f"/api/reservations/{pending}/cancel").status_code, 200)
        paid = self.order(quantity=1)
        self.client.post(f"/api/reservations/{paid}/pay")
        self.ends_in(31)
        self.assertEqual(self.client.post(f"/api/reservations/{paid}/cancel").status_code, 200)
        self.assertEqual(self.stock(), 5)

    def test_order_reports_when_cancellation_closes(self):
        end = self.ends_in(120)
        order = self.reserve().json()
        self.assertEqual(datetime.fromisoformat(order["cancel_until"]), end - timedelta(minutes=30))


class FreeClaimTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.user = User.objects.create_user(username="buyer")
        Profile.objects.create(user=self.user)
        self.client.force_authenticate(self.user)
        listing = {"store": "Demo", "category": "Roti & kue", "description": "Demo", "address": "Depok", "original_price": 20000, "stock": 5, "image": "/demo.jpg", "latitude": -6.36, "longitude": 106.83, "pickup_start": timezone.now(), "pickup_end": timezone.now() + timedelta(hours=4)}
        self.free = Listing.objects.create(name="Roti gratis", price=0, **listing)
        self.other_free = Listing.objects.create(name="Kue gratis", price=0, **listing)
        self.paid = Listing.objects.create(name="Roti diskon", price=8000, **listing)

    def claim(self, listing, quantity):
        return self.client.post("/api/reservations", {"listing_id": listing.pk, "quantity": quantity}, format="json")

    def test_free_portions_are_limited_to_two_per_day_across_listings(self):
        self.assertEqual(self.claim(self.free, 2).status_code, 201)
        response = self.claim(self.other_free, 1)
        self.assertEqual(response.status_code, 400)
        self.assertIn("2 porsi gratis", response.json()["detail"])
        self.assertEqual(self.claim(self.paid, 4).status_code, 201)
        self.other_free.refresh_from_db()
        self.assertEqual(self.other_free.stock, 5)

    def test_cancelled_and_yesterdays_claims_do_not_count(self):
        cancelled = self.claim(self.free, 2).json()["id"]
        self.client.post(f"/api/reservations/{cancelled}/cancel")
        yesterday = Reservation.objects.create(user=self.user, listing=self.free, quantity=2, total=0, code="CCCCC", status="picked_up")
        Reservation.objects.filter(pk=yesterday.pk).update(created_at=timezone.now() - timedelta(days=1))
        self.assertEqual(self.claim(self.other_free, 2).status_code, 201)

    def test_editing_a_free_claim_respects_the_daily_limit(self):
        pk = self.claim(self.free, 1).json()["id"]
        self.assertEqual(self.client.patch(f"/api/reservations/{pk}", {"quantity": 3}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(f"/api/reservations/{pk}", {"quantity": 2}, format="json").status_code, 200)


class SeedDemoTests(TestCase):
    def test_seed_reads_demo_catalog_as_utf8(self):
        # Windows defaults to cp1252, which turns "·" into "Â·".
        call_command("seed_demo", stdout=StringIO())
        self.assertEqual(Listing.objects.get(pk=1).store, "Kopi Tuku · Margonda")

    def test_seed_is_not_blocked_by_orders_past_pickup(self):
        call_command("seed_demo", stdout=StringIO())
        user = User.objects.create_user(username="buyer")
        Listing.objects.filter(pk=1).update(pickup_end=timezone.now() - timedelta(minutes=1))
        Reservation.objects.create(user=user, listing_id=1, quantity=1, total=18000, code="CCCCC", status="paid")
        call_command("seed_demo", stdout=StringIO())
        self.assertEqual(Reservation.objects.get().status, "expired")


class ThrottleMessageTests(TestCase):
    def test_custom_throttle_message_keeps_text_and_waits_in_indonesian(self):
        from rest_framework.exceptions import Throttled
        from .exceptions import exception_handler

        response = exception_handler(Throttled(wait=1.2, detail="Pencarian alamat sedang digunakan."), {})
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.data["detail"], "Pencarian alamat sedang digunakan. Coba lagi dalam 2 detik.")


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
            "prepared_at": (timezone.now() - timedelta(hours=1)).isoformat(),
            "pickup_start": timezone.now().isoformat(),
            "pickup_end": (timezone.now() + timedelta(hours=4)).isoformat(),
        }
        self.store = Store.objects.create(owner=self.partner, name=self.data["store"], description="Toko roti", address=self.data["address"], opening_time="08:00", closing_time="20:00", latitude=self.data["latitude"], longitude=self.data["longitude"])
        self.item = Listing.objects.create(owner=self.partner, store_profile=self.store, **self.data)
        self.data = {key: value for key, value in self.data.items() if key not in ["store", "address", "latitude", "longitude"]}
        self.data["store_id"] = self.store.pk
        self.path = f"/api/partner/listings/{self.item.pk}"
        self.client.force_authenticate(self.partner)

    def reserve(self, status="paid"):
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
        self.assertEqual(self.client.patch(self.path, {"price": 5000}, format="json").status_code, 200)
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
