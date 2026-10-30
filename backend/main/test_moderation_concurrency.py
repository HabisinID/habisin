"""Row-lock contracts require PostgreSQL; SQLite must not claim concurrency safety."""
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest import skipUnless

from django.contrib.auth.models import User
from django.db import close_old_connections, connection, connections
from django.test import TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient

from . import test_commerce
from .models import AdminModerationLog, ModerationLog, PartnerApproval, Reservation


@skipUnless(connection.vendor == "postgresql", "Requires PostgreSQL row locks")
class ModerationConcurrencyTests(TransactionTestCase):
    setUp = test_commerce.CommerceTests.setUp
    food = test_commerce.CommerceTests.food

    def test_takedown_serializes_with_each_stock_and_ticket_writer(self):
        from datetime import timedelta
        admin = User.objects.create_user("concurrent_admin", is_staff=True)
        for other_action in ["retry", "reserve", "pay", "cancel", "expire", "pickup"]:
            with self.subTest(action=other_action):
                item = self.food(self.partner, self.store, "Concurrent " + other_action)
                self.client.force_authenticate(self.buyer)
                response = self.client.post("/api/reservations", {"listing_id": item.pk, "quantity": 1}, format="json")
                self.assertEqual(response.status_code, 201)
                order = Reservation.objects.get(pk=response.data["id"])
                if other_action in ["cancel", "pickup"]:
                    order.status = "paid"
                    order.save(update_fields=["status"])
                if other_action == "expire":
                    Reservation.objects.filter(pk=order.pk).update(created_at=timezone.now()-timedelta(minutes=10))
                barrier = Barrier(2)

                def run(takedown):
                    close_old_connections()
                    try:
                        with connection.cursor() as cursor:
                            cursor.execute("SET lock_timeout TO '8s'")
                        client = APIClient()
                        user = admin if takedown or other_action == "retry" else self.partner if other_action == "pickup" else self.buyer
                        client.force_authenticate(User.objects.get(pk=user.pk))
                        barrier.wait(timeout=10)
                        if takedown or other_action == "retry":
                            suffix = "take-down/" if takedown else "moderate"
                            return client.post(f"/api/admin/listings/{item.pk}/{suffix}", {"action": "take_down", "reason": "Unsafe concurrent food"}, format="json").status_code
                        if other_action == "reserve":
                            return client.post("/api/reservations", {"listing_id": item.pk, "quantity": 1}, format="json").status_code
                        if other_action == "expire":
                            Reservation.expire_overdue()
                            return 200
                        path = f"/api/partner/kasir/{order.pk}/pickup" if other_action == "pickup" else f"/api/reservations/{order.pk}/{other_action}"
                        return client.post(path, {}, format="json").status_code
                    finally:
                        connections.close_all()

                with ThreadPoolExecutor(max_workers=2) as pool:
                    results = list(pool.map(run, [True, False]))
                self.assertEqual(results[0], 200)
                self.assertIn(results[1], [200, 201, 400, 409])
                item.refresh_from_db()
                self.assertTrue(item.taken_down)
                self.assertFalse(item.reservation_set.filter(status__in=Reservation.ACTIVE_STATUSES).exists())
                collected = sum(item.reservation_set.filter(status="picked_up").values_list("quantity", flat=True))
                self.assertEqual(item.stock, 4-collected)
                self.assertEqual(ModerationLog.objects.filter(listing=item).count(), 1)
                self.assertEqual(AdminModerationLog.objects.filter(target_name=item.name, action_type="TAKEDOWN_LISTING").count(), 1)

    def test_partner_approve_and_reject_cannot_both_win(self):
        approval = PartnerApproval.objects.get(user=self.other)
        approval.status = "pending"; approval.save(update_fields=["status"])
        admin = User.objects.create_user("approval_admin", is_staff=True)
        barrier = Barrier(2)

        def review(action):
            close_old_connections()
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SET lock_timeout TO '8s'")
                client = APIClient(); client.force_authenticate(User.objects.get(pk=admin.pk))
                barrier.wait(timeout=10)
                response = client.post(f"/api/admin/partner-approvals/{approval.pk}/{action}", {"reason": "Reviewed concurrently"}, format="json")
                return response.status_code
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as pool:
            codes = list(pool.map(review, ["approve", "reject"]))
        self.assertEqual(sorted(codes), [200, 400])
        approval.refresh_from_db()
        log = AdminModerationLog.objects.get(target_name=self.other.username)
        self.assertEqual(log.action_type, "APPROVE_PARTNER" if approval.status == "approved" else "REJECT_PARTNER")
