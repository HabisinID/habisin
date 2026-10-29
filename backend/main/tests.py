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
from .models import Listing, Profile, Reservation, Store, PartnerApproval, ModerationLog
from .listing_services import available_listings


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
        PartnerApproval.objects.create(user=self.partner, status="approved")
        PartnerApproval.objects.create(user=self.other, status="approved")
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
        self.assertEqual(self.client.delete(self.path).status_code, 204)
        self.item.refresh_from_db()
        self.assertIsNotNone(self.item.deleted_at)
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
        self.assertEqual(self.client.delete("/api/auth/me", {"password": "Secure-Meal-927!"}, format="json").status_code, 409)
        Reservation.objects.filter(pk=order.pk).update(status="picked_up")
        self.assertEqual(self.client.delete("/api/auth/me", {"password": "Secure-Meal-927!"}, format="json").status_code, 204)
        self.item.refresh_from_db()
        self.assertIsNone(self.item.owner)
        self.assertFalse(self.item.active)
        self.assertTrue(Reservation.objects.filter(pk=order.pk).exists())


def rows(response):
    data = response.json()
    return data["results"] if isinstance(data, dict) and "results" in data else data


def make_user(username, role="buyer", staff=False, approval=None):
    user = User.objects.create_user(username=username, password="Secure-Meal-927!", is_staff=staff)
    Profile.objects.create(user=user, role=role)
    if approval:
        PartnerApproval.objects.create(user=user, status=approval)
    return user


def make_store(owner):
    return Store.objects.create(owner=owner, name="Toko Uji", description="Toko untuk uji", address="Beji, Depok", opening_time="08:00", closing_time="20:00", latitude=-6.36, longitude=106.83)


def make_listing(owner, store, **changes):
    values = dict(
        owner=owner, store_profile=store, name="Roti Uji", store=store.name, category="Roti & kue",
        description="Roti layak makan", address=store.address, price=10000, original_price=20000, stock=4,
        image="https://example.com/roti.jpg", latitude=store.latitude, longitude=store.longitude,
        prepared_at=timezone.now() - timedelta(hours=1), pickup_start=timezone.now() - timedelta(minutes=5),
        pickup_end=timezone.now() + timedelta(hours=4),
    )
    values.update(changes)
    return Listing.objects.create(**values)


class PartnerRegistrationTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient(enforce_csrf_checks=True)

    def register(self, role, username):
        token = self.client.get("/api/auth/csrf").json()["csrfToken"]
        data = {"name": "Uji", "username": username, "email": f"{username}@example.com", "password": "Secure-Meal-927!", "role": role}
        return self.client.post("/api/auth/register", data, format="json", HTTP_X_CSRFTOKEN=token)

    def test_partner_registration_creates_pending_approval(self):
        self.assertEqual(self.register("partner", "mitra_baru").status_code, 201)
        approval = PartnerApproval.objects.get(user__username="mitra_baru")
        self.assertEqual(approval.status, "pending")
        self.assertIsNone(approval.reviewed_at)

    def test_buyer_registration_creates_no_approval(self):
        self.assertEqual(self.register("buyer", "pembeli_baru").status_code, 201)
        self.assertFalse(PartnerApproval.objects.exists())


class PartnerAccessTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.partner = make_user("mitra", "partner", approval="pending")
        self.client.force_authenticate(self.partner)
        self.paths = ["/api/partner/listings", "/api/partner/stores", "/api/partner/dashboard"]

    def set_status(self, value):
        PartnerApproval.objects.filter(user=self.partner).update(status=value)

    def test_pending_partner_is_blocked(self):
        for path in self.paths:
            self.assertEqual(self.client.get(path).status_code, 403, path)

    def test_rejected_partner_is_blocked(self):
        self.set_status("rejected")
        for path in self.paths:
            self.assertEqual(self.client.get(path).status_code, 403, path)

    def test_partner_without_approval_record_is_blocked(self):
        PartnerApproval.objects.filter(user=self.partner).delete()
        for path in self.paths:
            self.assertEqual(self.client.get(path).status_code, 403, path)

    def test_approved_partner_can_work(self):
        self.set_status("approved")
        for path in self.paths:
            self.assertEqual(self.client.get(path).status_code, 200, path)

    def test_pending_partner_cannot_use_sold_out_action(self):
        store = make_store(self.partner)
        item = make_listing(self.partner, store)
        self.assertEqual(self.client.post(f"/api/partner/listings/{item.pk}/sold-out").status_code, 403)
        item.refresh_from_db()
        self.assertEqual(item.stock, 4)


class AdminApprovalTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.admin = make_user("admin_uji", staff=True)
        self.partner = make_user("mitra", "partner", approval="pending")
        self.approval = PartnerApproval.objects.get(user=self.partner)
        self.client.force_authenticate(self.admin)
        self.base = f"/api/admin/partner-approvals/{self.approval.pk}"

    def test_admin_lists_and_filters_requests(self):
        make_user("mitra_lama", "partner", approval="approved")
        everyone = [row["username"] for row in rows(self.client.get("/api/admin/partner-approvals/"))]
        self.assertCountEqual(everyone, ["mitra", "mitra_lama"])
        pending = [row["username"] for row in rows(self.client.get("/api/admin/partner-approvals/?status=pending"))]
        self.assertEqual(pending, ["mitra"])

    def test_approve_updates_status_and_writes_log(self):
        response = self.client.post(f"{self.base}/approve/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        self.approval.refresh_from_db()
        self.assertEqual(self.approval.status, "approved")
        self.assertIsNotNone(self.approval.reviewed_at)
        log = ModerationLog.objects.get(action_type="APPROVE_PARTNER")
        self.assertEqual(log.target_name, "mitra")
        self.assertEqual(log.admin_user, self.admin)

    def test_reject_requires_reason(self):
        response = self.client.post(f"{self.base}/reject/", {}, format="json")
        self.assertEqual(response.status_code, 400)
        self.approval.refresh_from_db()
        self.assertEqual(self.approval.status, "pending")
        self.assertFalse(ModerationLog.objects.exists())

    def test_reject_with_reason_updates_status_and_writes_log(self):
        response = self.client.post(f"{self.base}/reject/", {"reason": "Data tidak lengkap"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.approval.refresh_from_db()
        self.assertEqual(self.approval.status, "rejected")
        self.assertIsNotNone(self.approval.reviewed_at)
        log = ModerationLog.objects.get(action_type="REJECT_PARTNER")
        self.assertEqual(log.reason, "Data tidak lengkap")
        self.assertEqual(log.target_name, "mitra")

    def test_processed_request_cannot_be_processed_again(self):
        self.assertEqual(self.client.post(f"{self.base}/approve/", {}, format="json").status_code, 200)
        self.assertEqual(self.client.post(f"{self.base}/approve/", {}, format="json").status_code, 400)
        self.assertEqual(self.client.post(f"{self.base}/reject/", {"reason": "Salah"}, format="json").status_code, 400)
        self.approval.refresh_from_db()
        self.assertEqual(self.approval.status, "approved")
        self.assertEqual(ModerationLog.objects.count(), 1)

    def test_approved_partner_gains_access(self):
        partner_client = APIClient()
        partner_client.force_authenticate(self.partner)
        self.assertEqual(partner_client.get("/api/partner/listings").status_code, 403)
        self.client.post(f"{self.base}/approve/", {}, format="json")
        self.assertEqual(partner_client.get("/api/partner/listings").status_code, 200)

    def test_rejected_partner_stays_blocked(self):
        partner_client = APIClient()
        partner_client.force_authenticate(self.partner)
        self.client.post(f"{self.base}/reject/", {"reason": "Ditolak"}, format="json")
        self.assertEqual(partner_client.get("/api/partner/listings").status_code, 403)

    def test_approval_endpoint_is_read_only_for_direct_edits(self):
        self.assertEqual(self.client.patch(f"{self.base}/", {"status": "approved"}, format="json").status_code, 405)
        self.assertEqual(self.client.delete(f"{self.base}/").status_code, 405)
        self.assertEqual(self.client.post("/api/admin/partner-approvals/", {}, format="json").status_code, 405)
        self.approval.refresh_from_db()
        self.assertEqual(self.approval.status, "pending")

    def test_only_admin_can_use_approval_endpoints(self):
        buyer = make_user("pembeli")
        for user in [self.partner, buyer]:
            client = APIClient()
            client.force_authenticate(user)
            self.assertEqual(client.get("/api/admin/partner-approvals/").status_code, 403)
            self.assertEqual(client.post(f"{self.base}/approve/", {}, format="json").status_code, 403)
        anonymous = APIClient()
        self.assertIn(anonymous.get("/api/admin/partner-approvals/").status_code, [401, 403])
        self.approval.refresh_from_db()
        self.assertEqual(self.approval.status, "pending")


class ListingTakeDownTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.admin = make_user("admin_uji", staff=True)
        self.partner = make_user("mitra", "partner", approval="approved")
        self.buyer = make_user("pembeli")
        self.store = make_store(self.partner)
        self.item = make_listing(self.partner, self.store)
        self.client.force_authenticate(self.admin)
        self.base = f"/api/admin/listings/{self.item.pk}"
        self.partner_client = APIClient()
        self.partner_client.force_authenticate(self.partner)
        self.buyer_client = APIClient()
        self.buyer_client.force_authenticate(self.buyer)

    def take_down(self, reason="Mengandung konten yang melanggar"):
        return self.client.post(f"{self.base}/take-down/", {"reason": reason}, format="json")

    def public_ids(self):
        return [row["id"] for row in self.buyer_client.get("/api/listings").json()]

    def test_admin_sees_all_listings_with_moderation_fields(self):
        other = make_listing(self.partner, self.store, name="Kue Uji", active=False)
        response = self.client.get("/api/admin/listings/")
        self.assertEqual(response.status_code, 200)
        data = {row["id"]: row for row in rows(response)}
        self.assertEqual(set(data), {self.item.pk, other.pk})
        self.assertFalse(data[self.item.pk]["taken_down"])
        self.assertEqual(data[self.item.pk]["owner_username"], "mitra")

    def test_take_down_requires_reason(self):
        for body in [{}, {"reason": "   "}]:
            self.assertEqual(self.client.post(f"{self.base}/take-down/", body, format="json").status_code, 400)
        self.item.refresh_from_db()
        self.assertFalse(self.item.taken_down)
        self.assertTrue(self.item.active)
        self.assertFalse(ModerationLog.objects.exists())

    def test_take_down_marks_listing_and_writes_log(self):
        response = self.take_down()
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["taken_down"])
        self.assertFalse(response.json()["active"])
        self.item.refresh_from_db()
        self.assertTrue(self.item.taken_down)
        self.assertFalse(self.item.active)
        self.assertEqual(self.item.takedown_reason, "Mengandung konten yang melanggar")
        log = ModerationLog.objects.get(action_type="TAKEDOWN_LISTING")
        self.assertEqual(log.target_name, "Roti Uji")
        self.assertEqual(log.reason, "Mengandung konten yang melanggar")
        self.assertEqual(log.admin_user, self.admin)

    def test_take_down_twice_is_rejected(self):
        self.assertEqual(self.take_down().status_code, 200)
        self.assertEqual(self.take_down().status_code, 400)
        self.assertEqual(ModerationLog.objects.filter(action_type="TAKEDOWN_LISTING").count(), 1)

    def test_taken_down_listing_disappears_from_public_views(self):
        self.assertIn(self.item.pk, self.public_ids())
        store_path = f"/api/stores/{self.store.pk}/listings"
        self.assertEqual([row["id"] for row in self.client.get(store_path).json()], [self.item.pk])
        self.take_down()
        self.assertNotIn(self.item.pk, self.public_ids())
        self.assertEqual(self.client.get(store_path).json(), [])
        self.assertFalse(available_listings().filter(pk=self.item.pk).exists())

    def test_taken_down_listing_cannot_be_ordered(self):
        self.take_down()
        response = self.buyer_client.post("/api/reservations", {"listing_id": self.item.pk, "quantity": 1}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Reservation.objects.exists())

    def test_take_down_cancels_active_reservations(self):
        paid = Reservation.objects.create(user=self.buyer, listing=self.item, quantity=1, total=10000, code="AB234", status="paid")
        pending = Reservation.objects.create(user=self.buyer, listing=self.item, quantity=1, total=10000, code="CD345", status="pending")
        done = Reservation.objects.create(user=self.buyer, listing=self.item, quantity=1, total=10000, code="EF456", status="picked_up")
        self.assertEqual(self.take_down().status_code, 200)
        for order in [paid, pending]:
            order.refresh_from_db()
            self.assertEqual(order.status, "cancelled")
            self.assertTrue(order.cancellation_note)
            self.assertIsNotNone(order.cancelled_at)
        done.refresh_from_db()
        self.assertEqual(done.status, "picked_up")

    def test_partner_cannot_reactivate_taken_down_listing(self):
        self.take_down()
        response = self.partner_client.patch(f"/api/partner/listings/{self.item.pk}", {"active": True}, format="json")
        self.assertEqual(response.status_code, 400)
        self.item.refresh_from_db()
        self.assertFalse(self.item.active)
        self.assertTrue(self.item.taken_down)
        self.assertNotIn(self.item.pk, self.public_ids())

    def test_partner_still_sees_taken_down_listing_in_inventory(self):
        self.take_down()
        response = self.partner_client.get(f"/api/partner/listings/{self.item.pk}")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["active"])

    def test_restore_lets_partner_reactivate(self):
        self.take_down()
        response = self.client.post(f"{self.base}/restore/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["taken_down"])
        self.item.refresh_from_db()
        self.assertFalse(self.item.taken_down)
        self.assertEqual(self.item.takedown_reason, "")
        self.assertFalse(self.item.active)
        self.assertTrue(ModerationLog.objects.filter(action_type="RESTORE_LISTING", target_name="Roti Uji").exists())
        reactivated = self.partner_client.patch(f"/api/partner/listings/{self.item.pk}", {"active": True}, format="json")
        self.assertEqual(reactivated.status_code, 200)
        self.assertIn(self.item.pk, self.public_ids())

    def test_restore_requires_taken_down_listing(self):
        self.assertEqual(self.client.post(f"{self.base}/restore/", {}, format="json").status_code, 400)
        self.assertFalse(ModerationLog.objects.exists())

    def test_only_admin_can_take_down_or_restore(self):
        for client in [self.partner_client, self.buyer_client]:
            self.assertEqual(client.get("/api/admin/listings/").status_code, 403)
            self.assertEqual(client.post(f"{self.base}/take-down/", {"reason": "x"}, format="json").status_code, 403)
            self.assertEqual(client.post(f"{self.base}/restore/", {}, format="json").status_code, 403)
        self.assertIn(APIClient().post(f"{self.base}/take-down/", {"reason": "x"}, format="json").status_code, [401, 403])
        self.item.refresh_from_db()
        self.assertFalse(self.item.taken_down)
        self.assertTrue(self.item.active)

    def test_admin_listing_endpoint_cannot_edit_or_delete(self):
        self.assertEqual(self.client.patch(f"{self.base}/", {"name": "Baru"}, format="json").status_code, 405)
        self.assertEqual(self.client.delete(f"{self.base}/").status_code, 405)
        self.assertTrue(Listing.objects.filter(pk=self.item.pk).exists())


class ModerationLogTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.admin = make_user("admin_uji", staff=True)
        self.second_admin = make_user("admin_dua", staff=True)
        self.client.force_authenticate(self.admin)
        self.path = "/api/admin/moderation-logs/"
        self.body = {"action_type": "CATATAN", "target_name": "contoh", "reason": "uji coba"}

    def create(self, **changes):
        return self.client.post(self.path, {**self.body, **changes}, format="json")

    def test_create_assigns_current_admin(self):
        response = self.create()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["admin_username"], "admin_uji")
        self.assertEqual(ModerationLog.objects.get().admin_user, self.admin)

    def test_create_cannot_forge_admin(self):
        response = self.create(admin_user=self.second_admin.pk)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(ModerationLog.objects.get().admin_user, self.admin)

    def test_create_requires_all_fields(self):
        for missing in ["action_type", "target_name", "reason"]:
            body = {key: value for key, value in self.body.items() if key != missing}
            self.assertEqual(self.client.post(self.path, body, format="json").status_code, 400, missing)
        self.assertFalse(ModerationLog.objects.exists())

    def test_read_list_detail_and_filter(self):
        first = self.create().json()["id"]
        self.create(action_type="TAKEDOWN_LISTING", target_name="Roti")
        self.assertEqual(len(rows(self.client.get(self.path))), 2)
        detail = self.client.get(f"{self.path}{first}/")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()["target_name"], "contoh")
        filtered = rows(self.client.get(f"{self.path}?action_type=TAKEDOWN_LISTING"))
        self.assertEqual([row["target_name"] for row in filtered], ["Roti"])

    def test_update(self):
        log_id = self.create().json()["id"]
        response = self.client.patch(f"{self.path}{log_id}/", {"reason": "diubah"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(ModerationLog.objects.get(pk=log_id).reason, "diubah")
        replaced = self.client.put(f"{self.path}{log_id}/", {**self.body, "reason": "diganti"}, format="json")
        self.assertEqual(replaced.status_code, 200)
        self.assertEqual(ModerationLog.objects.get(pk=log_id).reason, "diganti")

    def test_update_cannot_forge_admin(self):
        log_id = self.create().json()["id"]
        self.client.patch(f"{self.path}{log_id}/", {"admin_user": self.second_admin.pk}, format="json")
        self.assertEqual(ModerationLog.objects.get(pk=log_id).admin_user, self.admin)

    def test_delete(self):
        log_id = self.create().json()["id"]
        self.assertEqual(self.client.delete(f"{self.path}{log_id}/").status_code, 204)
        self.assertFalse(ModerationLog.objects.filter(pk=log_id).exists())
        self.assertEqual(self.client.get(f"{self.path}{log_id}/").status_code, 404)

    def test_actions_are_logged_and_visible(self):
        partner = make_user("mitra", "partner", approval="pending")
        approval = PartnerApproval.objects.get(user=partner)
        self.client.post(f"/api/admin/partner-approvals/{approval.pk}/approve/", {}, format="json")
        store = make_store(partner)
        item = make_listing(partner, store)
        self.client.post(f"/api/admin/listings/{item.pk}/take-down/", {"reason": "Melanggar"}, format="json")
        actions = [row["action_type"] for row in rows(self.client.get(self.path))]
        self.assertCountEqual(actions, ["APPROVE_PARTNER", "TAKEDOWN_LISTING"])

    def test_only_admin_can_use_moderation_log(self):
        log_id = self.create().json()["id"]
        buyer = make_user("pembeli")
        partner = make_user("mitra", "partner", approval="approved")
        for user in [buyer, partner]:
            client = APIClient()
            client.force_authenticate(user)
            self.assertEqual(client.get(self.path).status_code, 403)
            self.assertEqual(client.post(self.path, self.body, format="json").status_code, 403)
            self.assertEqual(client.patch(f"{self.path}{log_id}/", {"reason": "x"}, format="json").status_code, 403)
            self.assertEqual(client.delete(f"{self.path}{log_id}/").status_code, 403)
        self.assertIn(APIClient().get(self.path).status_code, [401, 403])
        self.assertEqual(ModerationLog.objects.get(pk=log_id).reason, "uji coba")