from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from unittest.mock import patch
from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from .models import Listing, Profile, Reservation
from .test_listing_revision import create_store, listing_payload


class FoodInformationTests(TestCase):
    def setUp(self):
        self.partner = User.objects.create_user(username="metadata_partner")
        Profile.objects.create(user=self.partner, role="partner")
        self.store = create_store(self.partner)
        self.client = APIClient()
        self.client.force_authenticate(self.partner)

    def test_metadata_roundtrip_and_legacy_patch(self):
        payload = {**listing_payload(self.store.pk), "packaging": "Kotak kertas", "storage_notes": "Suhu ruang", "allergens": "Susu, gluten", "category": "Minuman"}
        result = self.client.post("/api/partner/listings", payload, format="json")
        self.assertEqual(result.status_code, 201, result.data)
        item = Listing.objects.get(pk=result.data["id"])
        self.assertEqual(item.packaging, payload["packaging"])
        self.assertEqual(self.client.get("/api/listings").data[0]["allergens"], "Susu, gluten")
        item.prepared_at = None
        item.save()
        result = self.client.patch(f"/api/partner/listings/{item.pk}", {"stock": 3}, format="json")
        self.assertEqual(result.status_code, 200)
        self.assertIsNone(result.data["prepared_at"])

    def test_required_future_invalid_and_oversized_metadata(self):
        base = listing_payload(self.store.pk)
        missing = {k: v for k, v in base.items() if k != "prepared_at"}
        for changes in [missing, {**base, "prepared_at": None}, {**base, "prepared_at": "invalid"}, {**base, "prepared_at": (timezone.now()+timedelta(minutes=1)).isoformat()}, {**base, "packaging": "x"*501}, {**base, "storage_notes": "x"*501}, {**base, "allergens": "x"*501}]:
            result = self.client.post("/api/partner/listings", changes, format="json")
            self.assertEqual(result.status_code, 400, result.data)
        self.assertFalse(Listing.objects.exists())

    def test_preparation_after_deadline_rejected_on_patch(self):
        result = self.client.post("/api/partner/listings", listing_payload(self.store.pk), format="json")
        item = Listing.objects.get(pk=result.data["id"])
        Listing.objects.filter(pk=item.pk).update(pickup_start=timezone.now()-timedelta(hours=3), pickup_end=timezone.now()-timedelta(hours=1))
        result = self.client.patch(f"/api/partner/listings/{item.pk}", {"prepared_at": timezone.now().isoformat()}, format="json")
        self.assertEqual(result.status_code, 400)
        self.assertIn("prepared_at", result.data)


class ReservationPolicyTests(TestCase):
    def setUp(self):
        self.partner = User.objects.create_user(username="policy_partner")
        self.buyer = User.objects.create_user(username="policy_buyer")
        Profile.objects.create(user=self.buyer)
        self.store = create_store(self.partner)
        self.other_store = create_store(self.partner, "Cabang B")
        self.client = APIClient()
        self.client.force_authenticate(self.buyer)
        self.now = timezone.now()
        self.a = self.food(self.store)
        self.b = self.food(self.other_store)

    def food(self, store, **changes):
        data = listing_payload(store.pk)
        data.pop("store_id")
        return Listing.objects.create(store_profile=store, store=store.name, address=store.address, latitude=store.latitude, longitude=store.longitude, **{**data, "price": 0, "stock": 10, **changes})

    def reserve(self, item, quantity=1):
        return self.client.post("/api/reservations", {"listing_id": item.pk, "quantity": quantity}, format="json")

    def test_free_quantity_limit_is_global_across_stores(self):
        self.assertEqual(self.reserve(self.a, 3).status_code, 400)
        self.assertEqual(self.reserve(self.a, 2).status_code, 201)
        self.assertEqual(self.reserve(self.b).status_code, 400)
        self.b.refresh_from_db()
        self.assertEqual(self.b.stock, 10)
        policy = self.client.get(f"/api/listings/{self.b.pk}/reservation-policy").data
        self.assertEqual(policy["max_quantity"], 0)
        self.assertIsNone(policy["active_free_reservation_id"])

    def test_cancel_releases_quota_and_is_idempotent(self):
        order = self.reserve(self.a, 2).data
        path = f'/api/reservations/{order["id"]}/cancel'
        self.assertEqual(self.client.post(path).status_code, 200)
        self.assertEqual(self.client.post(path).status_code, 200)
        self.a.refresh_from_db()
        self.assertEqual(self.a.stock, 10)
        self.assertEqual(self.reserve(self.a, 2).status_code, 201)

    def test_expired_ticket_restores_global_daily_quota(self):
        self.reserve(self.a, 2)
        Reservation.objects.filter(listing=self.a).update(pickup_deadline=self.now-timedelta(seconds=1))
        sibling = self.food(self.store)
        self.assertEqual(self.reserve(sibling).status_code, 201)
        self.assertEqual(self.reserve(self.b).status_code, 201)

    def test_wib_midnight_and_paid_are_independent(self):
        order = self.reserve(self.a, 2).data
        boundary = datetime(2026, 10, 24, 0, 0, tzinfo=ZoneInfo("Asia/Jakarta"))
        Reservation.objects.filter(pk=order["id"]).update(created_at=boundary-timedelta(seconds=1))
        Listing.objects.filter(pk=self.a.pk).update(pickup_end=boundary-timedelta(seconds=1))
        sibling = self.food(self.store, pickup_end=boundary+timedelta(hours=4))
        with patch("main.reservation_policy.timezone.now", return_value=boundary):
            self.assertEqual(self.client.get(f"/api/listings/{sibling.pk}/reservation-policy").data["remaining_free_portions"], 2)
        paid = self.food(self.store, price=1000)
        self.assertEqual(self.reserve(paid, 3).status_code, 201)

    def test_cancellation_exact_boundary_and_late_rejection(self):
        for delta, expected in [(timedelta(minutes=30)+timedelta(seconds=1), 200), (timedelta(minutes=30), 409), (timedelta(minutes=30)-timedelta(seconds=1), 409), (-timedelta(seconds=1), 409)]:
            for price in [0, 1000]:
                food = self.food(self.store, price=price, pickup_end=self.now+delta)
                order = Reservation.objects.create(user=self.buyer, listing=food, quantity=1, total=price, code=f"{Reservation.objects.count():05}", status="paid")
                with patch("main.reservation_policy.timezone.now", return_value=self.now):
                    result = self.client.post(f"/api/reservations/{order.pk}/cancel")
                self.assertEqual(result.status_code, expected)
                food.refresh_from_db()
                self.assertEqual(food.stock, 11 if expected == 200 or delta.total_seconds() < 0 else 10)

    def test_policy_permissions_and_missing_listing(self):
        self.assertEqual(self.client.get("/api/listings/999999/reservation-policy").status_code, 404)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f"/api/listings/{self.a.pk}/reservation-policy").status_code, 403)
        Profile.objects.create(user=self.partner, role="partner")
        self.client.force_authenticate(self.partner)
        self.assertEqual(self.client.get(f"/api/listings/{self.a.pk}/reservation-policy").status_code, 403)

    def test_expired_single_portion_releases_both_portions_and_cancelled_retry_is_safe(self):
        order = self.reserve(self.a, 1).data
        Reservation.objects.filter(listing=self.a).update(pickup_deadline=self.now-timedelta(seconds=1))
        sibling = self.food(self.store)
        self.assertEqual(self.reserve(sibling, 2).status_code, 201)
        policy = self.client.get(f"/api/listings/{sibling.pk}/reservation-policy").data
        self.assertEqual(policy["remaining_free_portions"], 0)
        Reservation.objects.filter(pk=order["id"]).update(status="cancelled")
        result = self.client.post(f'/api/reservations/{order["id"]}/cancel')
        self.assertEqual(result.status_code, 200)


class BuyerNotesTests(TestCase):
    setUp = FoodInformationTests.setUp

    def test_notes_json_roundtrip_limits_and_legacy_patch(self):
        payload = {**listing_payload(self.store.pk), "buyer_notes": "Bawa wadah <b>sendiri</b>", "category": "Kue basah"}
        response = self.client.post("/api/partner/listings", payload, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(self.client.get("/api/listings").data[0]["buyer_notes"], payload["buyer_notes"])
        self.assertEqual(self.client.patch(f'/api/partner/listings/{response.data["id"]}', {"stock": 2}, format="json").status_code, 200)
        for category in ["Sayur & buah", "Lainnya", "Katering", "Camilan", "Sehat"]:
            self.assertEqual(self.client.post("/api/partner/listings", {**payload, "category": category, "buyer_notes": ""}, format="json").status_code, 201)
        self.assertEqual(self.client.post("/api/partner/listings", {**payload, "buyer_notes": "x"*140}, format="json").status_code, 201)
        invalid = self.client.post("/api/partner/listings", {**payload, "buyer_notes": "x"*141}, format="json")
        self.assertEqual(invalid.status_code, 400)
        self.assertIn("buyer_notes", invalid.data)

    def test_design_name_and_price_rules_preserve_unchanged_legacy(self):
        base = {**listing_payload(self.store.pk), "name": "a"*60}
        created = self.client.post("/api/partner/listings", base, format="json")
        self.assertEqual(created.status_code, 201)
        for changes in [{"name": "a"*61}, {"price": base["original_price"]}, {"price": base["original_price"]+1}]:
            response = self.client.post("/api/partner/listings", {**base, **changes}, format="json")
            self.assertEqual(response.status_code, 400)
        item = Listing.objects.get(pk=created.data["id"])
        Listing.objects.filter(pk=item.pk).update(name="legacy"*20, price=1000, original_price=1000)
        path = f"/api/partner/listings/{item.pk}"
        result = self.client.patch(path, {"stock": 3}, format="json")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.data["name"], "legacy"*20)
        self.assertEqual(self.client.patch(path, {"name": "b"*61}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(path, {"name": "b"*60}, format="json").status_code, 200)
        self.assertEqual(self.client.patch(path, {"price": 999}, format="json").status_code, 200)
        self.assertEqual(self.client.post("/api/partner/listings", {**base, "price": 0, "original_price": 0}, format="json").status_code, 201)
