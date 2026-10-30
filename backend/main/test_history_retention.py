from datetime import timedelta

from django.contrib.auth.models import User
from django.core.cache import cache
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TestCase, TransactionTestCase
from django.utils import timezone

from . import test_commerce
from .models import Complaint, Listing, Reservation, Review, VerificationLog


class HistoryRetentionTests(TestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        test_commerce.CommerceTests.setUp(self)

    food = test_commerce.CommerceTests.food

    def completed_order(self):
        created = self.client.post("/api/reservations", {"listing_id": self.a.pk, "quantity": 2}, format="json")
        self.assertEqual(created.status_code, 201)
        order = Reservation.objects.get(pk=created.data["id"])
        order.status = "picked_up"
        order.paid_at = order.picked_up_at = timezone.now()
        order.save(update_fields=["status", "paid_at", "picked_up_at"])
        return order

    def test_archive_keeps_feedback_partner_admin_statistics_and_media_reference(self):
        order = self.completed_order()
        review = self.client.post("/api/reviews", {"reservation_id": order.pk, "rating": 4, "comment": "Masih baik"}, format="json")
        complaint = self.client.post("/api/complaints", {"reservation_id": order.pk, "reason": "other", "description": "Kemasan pesanan mengalami masalah"}, format="json")
        self.assertEqual(review.status_code, 201)
        self.assertEqual(complaint.status_code, 201)
        log = VerificationLog.objects.create(partner=self.partner, reservation=order, code=order.code, outcome="picked_up")
        self.client.force_authenticate(self.partner)
        sales = self.client.get("/api/partner/dashboard").data["sales"]
        self.client.force_authenticate(self.buyer)
        path = f"/api/reservations/{order.pk}"
        self.assertEqual(self.client.delete(path).status_code, 204)
        order.refresh_from_db(); stamp = order.buyer_archived_at
        self.assertIsNotNone(stamp)
        self.assertEqual(self.client.delete(path).status_code, 204)
        order.refresh_from_db(); self.assertEqual(order.buyer_archived_at, stamp)
        self.assertEqual(self.client.get("/api/reservations").data, [])
        for method, suffix in [("get", ""), ("patch", ""), ("post", "/pay"), ("post", "/cancel")]:
            self.assertEqual(getattr(self.client, method)(path+suffix, {}, format="json").status_code, 404)
        mine = self.client.get("/api/reviews/mine").data
        self.assertEqual(len(mine["reviews"]), 1)
        self.assertEqual(len(mine["complaints"]), 1)
        self.assertEqual(self.client.get(f"/api/reservations/{order.pk}/feedback").status_code, 200)
        self.client.force_authenticate(self.partner)
        self.assertEqual(self.client.get("/api/partner/dashboard").data["sales"], sales)
        orders = self.client.get("/api/partner/orders").data["results"]
        self.assertEqual([row["id"] for row in orders], [order.pk])
        self.assertNotIn("code", orders[0])
        self.assertEqual(self.client.delete(f"/api/partner/listings/{self.a.pk}").status_code, 204)
        self.a.refresh_from_db(); self.assertIsNotNone(self.a.deleted_at)
        self.assertFalse(self.a.active)
        self.assertTrue(self.a.image)
        self.assertTrue(Review.objects.filter(pk=review.data["id"], listing=self.a).exists())
        self.assertTrue(Complaint.objects.filter(pk=complaint.data["id"], reservation=order).exists())
        self.assertTrue(VerificationLog.objects.filter(pk=log.pk, reservation=order).exists())
        admin = User.objects.create_user("retention_admin", is_staff=True)
        self.client.force_authenticate(admin)
        self.assertEqual(self.client.get("/api/admin/complaints").data["count"], 1)
        self.assertEqual(self.client.get("/api/admin/summary").data["pickup_portions_today"], 2)

    def test_active_orders_and_other_owners_cannot_archive(self):
        order = self.completed_order()
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.delete(f"/api/reservations/{order.pk}").status_code, 404)
        self.client.force_authenticate(self.buyer)
        for status in Reservation.ACTIVE_STATUSES:
            order.status = status; order.save(update_fields=["status"])
            self.assertEqual(self.client.delete(f"/api/reservations/{order.pk}").status_code, 409)
        order.refresh_from_db(); self.assertIsNone(order.buyer_archived_at)

    def test_soft_delete_without_orders_disappears_from_all_offers(self):
        self.client.force_authenticate(self.partner)
        path = f"/api/partner/listings/{self.a.pk}"
        self.assertEqual(self.client.delete(path).status_code, 204)
        self.assertTrue(Listing.objects.filter(pk=self.a.pk, deleted_at__isnull=False, active=False).exists())
        for url in ["/api/listings", f"/api/stores/{self.store.pk}/listings", "/api/partner/listings"]:
            self.assertNotIn(self.a.pk, [row["id"] for row in self.client.get(url).data])
        self.assertEqual(self.client.get(path).status_code, 404)
        self.assertEqual(self.client.patch(path, {"active": True}, format="json").status_code, 404)
        self.client.force_authenticate(self.buyer)
        self.assertEqual(self.client.post("/api/reservations", {"listing_id": self.a.pk, "quantity": 1}, format="json").status_code, 400)

    def test_cashier_undo_cannot_leave_active_order_hidden_or_revive_removed_listing(self):
        order = self.completed_order()
        self.client.delete(f"/api/reservations/{order.pk}")
        self.client.force_authenticate(self.partner)
        self.assertEqual(self.client.post(f"/api/partner/kasir/{order.pk}/undo").status_code, 200)
        order.refresh_from_db()
        self.assertEqual(order.status, "paid")
        self.assertIsNone(order.buyer_archived_at)
        self.client.force_authenticate(self.buyer)
        self.assertEqual([row["id"] for row in self.client.get("/api/reservations").data], [order.pk])
        order.status = "picked_up"; order.picked_up_at = timezone.now()
        order.save(update_fields=["status", "picked_up_at"])
        self.client.force_authenticate(self.partner)
        for flag, value in [("deleted_at", timezone.now()), ("moderated_at", timezone.now()), ("taken_down", True)]:
            Listing.objects.filter(pk=self.a.pk).update(**{flag: value})
            self.assertEqual(self.client.post(f"/api/partner/kasir/{order.pk}/undo").status_code, 409)
            Listing.objects.filter(pk=self.a.pk).update(**{flag: False if flag == "taken_down" else None})


class HistoryRetentionMigrationTests(TransactionTestCase):
    def test_existing_transaction_and_relations_survive_upgrade(self):
        before = [("main", "0020_admin_cancellation_actor")]
        after = [("main", "0021_buyer_history_archiving")]
        executor = MigrationExecutor(connection)
        executor.migrate(before)
        apps = executor.loader.project_state(before).apps
        try:
            user = apps.get_model("auth", "User").objects.create(username="retained-history")
            store = apps.get_model("main", "Store").objects.create(owner_id=user.pk, name="Old store", description="Food", address="Depok", opening_time="08:00", closing_time="22:00", latitude=-6.36, longitude=106.83)
            now = timezone.now()
            listing = apps.get_model("main", "Listing").objects.create(owner_id=user.pk, store_profile_id=store.pk, name="Old food", store=store.name, description="Food", category="Roti & kue", address="Depok", price=5000, original_price=10000, stock=3, image="https://example.com/preserved.jpg", latitude=-6.36, longitude=106.83, pickup_start=now, pickup_end=now+timedelta(hours=4))
            order = apps.get_model("main", "Reservation").objects.create(user_id=user.pk, listing_id=listing.pk, quantity=1, total=5000, status="picked_up", code="ACDEF", picked_up_at=now)
            review = apps.get_model("main", "Review").objects.create(user_id=user.pk, listing_id=listing.pk, store_id=store.pk, reservation_id=order.pk, rating=4)
            complaint = apps.get_model("main", "Complaint").objects.create(user_id=user.pk, store_id=store.pk, reservation_id=order.pk, reason="other", description="Old complaint")
            log = apps.get_model("main", "AdminModerationLog").objects.create(admin_user_id=user.pk, action_type="RESTORE_LISTING", target_name=listing.name, reason="Old log")
            executor = MigrationExecutor(connection); executor.migrate(after)
            apps = executor.loader.project_state(after).apps
            restored = apps.get_model("main", "Reservation").objects.get(pk=order.pk)
            self.assertIsNone(restored.buyer_archived_at)
            self.assertEqual(restored.total, 5000)
            self.assertEqual(apps.get_model("main", "Review").objects.get(pk=review.pk).reservation_id, order.pk)
            self.assertEqual(apps.get_model("main", "Complaint").objects.get(pk=complaint.pk).reservation_id, order.pk)
            self.assertTrue(apps.get_model("main", "AdminModerationLog").objects.filter(pk=log.pk).exists())
        finally:
            MigrationExecutor(connection).migrate(after)
