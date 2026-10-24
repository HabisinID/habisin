from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from .models import Listing, Reservation
from . import test_commerce


class ReservationLifecycleTests(TestCase):
    setUp = test_commerce.CommerceTests.setUp
    food = test_commerce.CommerceTests.food
    payload = test_commerce.CommerceTests.payload
    post = test_commerce.CommerceTests.post

    def book(self):
        result = self.post(self.payload(self.a))
        self.assertEqual(result.status_code, 201)
        self.order = Reservation.objects.get(pk=result.data[0]["id"])
        self.client.force_authenticate(self.partner)
        return f"/api/partner/reservations/{self.order.pk}/cancel"

    def cancel(self, path, reason="Makanan tidak layak diserahkan"):
        return self.client.post(path, {"reason": reason}, format="json")

    def test_seller_reason_required_trimmed_and_stock_returned_once(self):
        path = self.book()
        for reason in [None, "", "   ", "x" * 501, 123]:
            self.assertEqual(self.cancel(path, reason).status_code, 400)
        self.a.refresh_from_db()
        self.assertEqual(self.a.stock, 3)
        first = self.cancel(path, "  Kualitas makanan menurun  ")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.data["cancellation_note"], "Kualitas makanan menurun")
        self.assertEqual(first.data["cancelled_by"], "partner")
        self.assertTrue(first.data["cancelled_at"])
        self.assertEqual(self.cancel(path, "Alasan lain").data["cancellation_note"], "Kualitas makanan menurun")
        self.a.refresh_from_db()
        self.assertEqual(self.a.stock, 4)
        self.client.force_authenticate(self.buyer)
        order = self.client.get("/api/reservations").data[0]
        self.assertEqual(order["cancellation_note"], "Kualitas makanan menurun")
        self.assertEqual(self.client.post(f"/api/reservations/{self.order.pk}/cancel").status_code, 200)
        self.a.refresh_from_db()
        self.assertEqual(self.a.stock, 4)

    def test_partner_can_cancel_inside_thirty_minutes_and_invalidates_undo(self):
        path = self.book()
        Reservation.objects.filter(pk=self.order.pk).update(pickup_deadline=timezone.now()+timedelta(minutes=5))
        token = self.client.post(f"/api/partner/listings/{self.a.pk}/sold-out", {}, format="json").data["undo_token"]
        self.assertEqual(self.cancel(path).status_code, 200)
        self.assertEqual(self.client.post(f"/api/partner/listings/{self.a.pk}/undo-sold-out", {"token": token}, format="json").status_code, 409)
        self.a.refresh_from_db()
        self.assertEqual(self.a.stock, 1)

    def test_seller_ownership_and_buyer_cannot_use_partner_route(self):
        path = self.book()
        self.client.force_authenticate(self.other)
        self.assertEqual(self.cancel(path).status_code, 404)
        self.client.force_authenticate(self.buyer)
        self.assertEqual(self.cancel(path).status_code, 403)
        self.client.force_authenticate(None)
        self.assertEqual(self.cancel(path).status_code, 403)

    def test_expired_is_archived_unlocks_edit_and_never_revives(self):
        path = self.book()
        listing_path = f"/api/partner/listings/{self.a.pk}"
        self.assertEqual(self.client.patch(listing_path, {"price": 4000}, format="json").status_code, 400)
        deadline = timezone.now()-timedelta(seconds=1)
        Reservation.objects.filter(pk=self.order.pk).update(pickup_deadline=deadline)
        self.assertEqual(self.cancel(path).status_code, 409)
        response = self.client.get("/api/partner/dashboard").data
        self.assertEqual(response["pickups"], [])
        self.assertEqual(response["orders"][0]["status"], "expired")
        changed = self.client.patch(listing_path, {"price": 4000, "pickup_end": (timezone.now()+timedelta(hours=8)).isoformat()}, format="json")
        self.assertEqual(changed.status_code, 200, changed.data)
        self.client.force_authenticate(self.buyer)
        archived = self.client.get("/api/reservations").data[0]
        self.assertEqual(archived["status"], "expired")
        self.assertEqual(archived["listing"]["pickup_end"], deadline.isoformat())
        self.assertFalse(archived["can_cancel"])
        self.a.refresh_from_db()
        self.assertEqual(self.a.stock, 3)
        self.assertTrue(Reservation.objects.filter(pk=self.order.pk).exists())

    def test_expired_releases_branch_lock_but_active_order_still_locks(self):
        self.book()
        from .test_listing_revision import create_store
        store = create_store(self.partner, "Cabang baru")
        path = f"/api/partner/listings/{self.a.pk}"
        self.assertEqual(self.client.patch(path, {"store_id": store.pk}, format="json").status_code, 409)
        Reservation.objects.filter(pk=self.order.pk).update(pickup_deadline=timezone.now()-timedelta(seconds=1))
        self.assertEqual(self.client.patch(path, {"store_id": store.pk}, format="json").status_code, 200)

    def test_seller_cancelled_free_ticket_releases_quota(self):
        Listing.objects.filter(pk=self.a.pk).update(price=0)
        self.a.refresh_from_db()
        path = self.book()
        self.assertEqual(self.cancel(path).status_code, 200)
        self.client.force_authenticate(self.buyer)
        self.assertEqual(self.post(self.payload(self.a)).status_code, 201)

    def test_new_ticket_deadline_is_snapshot_of_listing(self):
        self.book()
        self.a.refresh_from_db()
        self.assertEqual(self.order.pickup_deadline, self.a.pickup_end)
        Listing.objects.filter(pk=self.a.pk).update(pickup_end=timezone.now()+timedelta(days=1))
        self.order.refresh_from_db()
        self.assertEqual(self.order.pickup_deadline, self.a.pickup_end)

    def test_deleting_account_does_not_restore_expired_stock_into_new_batch(self):
        self.buyer.set_password("Lifecycle-Test-381!")
        self.buyer.save()
        self.book()
        Reservation.objects.filter(pk=self.order.pk).update(pickup_deadline=timezone.now()-timedelta(seconds=1))
        Listing.objects.filter(pk=self.a.pk).update(stock=6)
        self.client.force_authenticate(self.buyer)
        result = self.client.delete("/api/auth/me", {"password": "Lifecycle-Test-381!"}, format="json")
        self.assertEqual(result.status_code, 204)
        self.a.refresh_from_db()
        self.assertEqual(self.a.stock, 6)
