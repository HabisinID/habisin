"""Cross-module moderation uses real APIs and disposable test data."""
from unittest.mock import patch

from django.contrib.auth.models import User
from django.core.cache import cache
from django.db import IntegrityError
from django.test import TestCase
from django.utils import timezone

from . import test_commerce
from .models import AdminModerationLog, ListingStockAction, ModerationLog, Reservation


class ModerationContractTests(TestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        test_commerce.CommerceTests.setUp(self)

    food = test_commerce.CommerceTests.food

    def admin_action(self, action="take_down", workspace=True, reason="Makanan tidak aman untuk dikonsumsi"):
        admin, _ = User.objects.get_or_create(username="moderation_admin", defaults={"is_staff": True})
        self.client.force_authenticate(admin)
        path = f"/api/admin/listings/{self.a.pk}/"
        path += "moderate" if workspace else "take-down/" if action == "take_down" else "restore/"
        return self.client.post(path, {"action": action, "reason": reason}, format="json")

    def order(self, status="paid", code="ACDEF"):
        response = self.client.post("/api/reservations", {"listing_id": self.a.pk, "quantity": 2}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        order = Reservation.objects.get(pk=response.data["id"])
        order.status = status
        order.code = code
        order.save(update_fields=["status", "code"])
        return order

    def test_cancel_release_retry_cross_restore_and_partner_contract(self):
        order = self.order()
        self.assertEqual(self.admin_action(workspace=False).status_code, 200)
        self.assertEqual(self.admin_action().status_code, 200)
        order.refresh_from_db(); self.a.refresh_from_db()
        self.assertEqual((order.status, order.cancelled_by), ("cancelled", "admin"))
        self.assertEqual(order.cancellation_note, "Makanan tidak aman untuk dikonsumsi")
        self.assertEqual(self.a.stock, 4)
        self.assertTrue(self.a.taken_down)
        self.assertIsNotNone(self.a.moderated_at)
        self.assertEqual(ModerationLog.objects.count(), 1)
        self.assertEqual(AdminModerationLog.objects.count(), 1)
        self.client.force_authenticate(self.partner)
        inventory = self.client.get("/api/partner/listings").data
        self.assertTrue(next(row for row in inventory if row["id"] == self.a.pk)["taken_down"])
        base = f"/api/partner/listings/{self.a.pk}"
        self.assertEqual(self.client.get(base).status_code, 200)
        for method, suffix, payload in [("patch", "", {"name": "Bypass"}), ("delete", "", {}), ("post", "/sold-out", {})]:
            self.assertEqual(getattr(self.client, method)(base+suffix, payload, format="json").status_code, 409)
        self.assertEqual(self.admin_action("restore").status_code, 200)
        self.a.refresh_from_db(); order.refresh_from_db()
        self.assertFalse(self.a.active or self.a.taken_down)
        self.assertIsNone(self.a.moderated_at)
        self.assertEqual(order.status, "cancelled")
        self.assertEqual(self.a.stock, 4)

    def test_reverse_cross_restore_and_finished_orders_do_not_release_twice(self):
        order = self.order(status="picked_up")
        self.assertEqual(self.admin_action().status_code, 200)
        self.assertEqual(self.admin_action("restore", workspace=False).status_code, 200)
        order.refresh_from_db(); self.a.refresh_from_db()
        self.assertEqual(order.status, "picked_up")
        self.assertEqual(self.a.stock, 2)

    def test_both_legacy_markers_hide_and_lock_listing(self):
        for fields in [{"taken_down": True}, {"taken_down": False, "moderated_at": timezone.now()}]:
            type(self.a).objects.filter(pk=self.a.pk).update(**fields)
            self.client.force_authenticate(self.partner)
            self.assertEqual(self.client.patch(f"/api/partner/listings/{self.a.pk}", {"stock": 8}, format="json").status_code, 409)
            self.assertNotIn(self.a.pk, [row["id"] for row in self.client.get("/api/listings").data])
        self.assertEqual(self.admin_action("restore", workspace=False).status_code, 200)

    def test_log_failure_rolls_back_orders_stock_and_listing(self):
        order = self.order()
        with patch("main.moderation.AdminModerationLog.objects.create", side_effect=IntegrityError("log unavailable")):
            with self.assertRaises(IntegrityError):
                self.admin_action()
        self.a.refresh_from_db(); order.refresh_from_db()
        self.assertEqual(self.a.stock, 2)
        self.assertEqual(order.status, "paid")
        self.assertFalse(self.a.taken_down)
        self.assertFalse(ModerationLog.objects.exists())

    def test_reason_validation_and_admin_only(self):
        for reason in [None, "", " ", "x"*501, ["not text"]]:
            self.assertEqual(self.admin_action(reason=reason).status_code, 400)
        for user in [self.buyer, self.partner]:
            self.client.force_authenticate(user)
            for suffix in ["moderate", "take-down/"]:
                self.assertEqual(self.client.post(f"/api/admin/listings/{self.a.pk}/{suffix}", {"action": "take_down", "reason": "Unsafe"}, format="json").status_code, 403)

    def test_stock_undo_invalidated_and_expired_order_not_cancelled_again(self):
        import uuid
        from datetime import timedelta
        order = self.order(status="pending")
        Reservation.objects.filter(pk=order.pk).update(created_at=timezone.now()-timedelta(minutes=10))
        token = ListingStockAction.objects.create(listing=self.a, token=uuid.uuid4(), previous_stock=10, expires_at=timezone.now()+timedelta(minutes=1))
        self.admin_action()
        order.refresh_from_db(); self.a.refresh_from_db(); token.refresh_from_db()
        self.assertEqual(order.status, "expired")
        self.assertEqual(self.a.stock, 4)
        self.assertTrue(token.used)
