from datetime import time, timedelta

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .models import Complaint, Listing, Profile, Reservation, Store


class AdminComplaintHandlingTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="complaint_admin", is_staff=True
        )
        self.partner = User.objects.create_user(username="complaint_partner")
        Profile.objects.create(user=self.partner, role="partner")
        self.buyer = User.objects.create_user(
            username="complaint_buyer", first_name="Raihan"
        )
        self.store = Store.objects.create(
            owner=self.partner,
            name="Toko Uji Komplain",
            description="Toko untuk pengujian laporan komplain.",
            address="Jalan Margonda, Depok",
            opening_time=time(8),
            closing_time=time(22),
            latitude=-6.36,
            longitude=106.83,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def make_complaint(self, suffix, *, status="open", listing_name=None):
        now = timezone.now()
        listing = Listing.objects.create(
            owner=self.partner,
            store_profile=self.store,
            name=listing_name or f"Roti Komplain {suffix}",
            store=self.store.name,
            category="Roti & kue",
            description="Listing untuk pemeriksaan admin.",
            address=self.store.address,
            price=8000,
            original_price=12000,
            stock=5,
            image="https://example.com/complaint-test.svg",
            latitude=self.store.latitude,
            longitude=self.store.longitude,
            pickup_start=now - timedelta(hours=1),
            pickup_end=now + timedelta(hours=4),
        )
        reservation = Reservation.objects.create(
            user=self.buyer,
            listing=listing,
            quantity=2,
            total=16000,
            code=f"{suffix}234",
            status="picked_up",
            picked_up_at=now - timedelta(minutes=10),
        )
        return Complaint.objects.create(
            reservation=reservation,
            store=self.store,
            user=self.buyer,
            reason="freshness",
            description=f"Makanan {suffix} terasa basi setelah dibuka.",
            status=status,
        )

    def test_admin_can_filter_search_and_page_complaints(self):
        first = self.make_complaint("A", listing_name="Roti Basi")
        reviewed = self.make_complaint("B", status="reviewed")
        self.make_complaint("C", status="resolved")

        default = self.client.get("/api/admin/complaints")
        self.assertEqual(default.status_code, 200)
        self.assertEqual(default.data["count"], 1)
        self.assertEqual(default.data["results"][0]["id"], first.pk)
        self.assertEqual(default.data["results"][0]["buyer_name"], "Raihan")
        self.assertEqual(default.data["results"][0]["listing_name"], "Roti Basi")
        self.assertEqual(default.data["results"][0]["reservation_id"], first.reservation_id)
        self.assertEqual(default.data["counts"], {"open": 1, "reviewed": 1, "resolved": 1})

        search = self.client.get("/api/admin/complaints?status=all&q=Roti+Basi")
        self.assertEqual(search.data["count"], 1)
        self.assertEqual(search.data["results"][0]["id"], first.pk)

        page = self.client.get("/api/admin/complaints?status=all&page=2&page_size=1")
        self.assertEqual(page.data["count"], 3)
        self.assertEqual(page.data["page"], 2)
        self.assertEqual(page.data["results"][0]["id"], reviewed.pk)

    def test_admin_can_review_and_resolve_but_not_reopen_a_complaint(self):
        complaint = self.make_complaint("D")

        reviewed = self.client.patch(
            f"/api/admin/complaints/{complaint.pk}",
            {"status": "reviewed"},
            format="json",
        )
        self.assertEqual(reviewed.status_code, 200)
        self.assertEqual(reviewed.data["status"], "reviewed")

        resolved = self.client.patch(
            f"/api/admin/complaints/{complaint.pk}",
            {"status": "resolved"},
            format="json",
        )
        self.assertEqual(resolved.status_code, 200)
        self.assertEqual(resolved.data["status"], "resolved")

        reopened = self.client.patch(
            f"/api/admin/complaints/{complaint.pk}",
            {"status": "reviewed"},
            format="json",
        )
        self.assertEqual(reopened.status_code, 400)

    def test_only_admin_can_list_or_change_complaints(self):
        complaint = self.make_complaint("E")
        self.client.force_authenticate(self.partner)

        listing = self.client.get("/api/admin/complaints")
        status = self.client.patch(
            f"/api/admin/complaints/{complaint.pk}",
            {"status": "resolved"},
            format="json",
        )

        self.assertEqual(listing.status_code, 403)
        self.assertEqual(status.status_code, 403)
        complaint.refresh_from_db()
        self.assertEqual(complaint.status, "open")

    def test_admin_summary_counts_unresolved_complaints(self):
        self.make_complaint("F", status="open")
        self.make_complaint("G", status="reviewed")
        self.make_complaint("H", status="resolved")

        response = self.client.get("/api/admin/summary")

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["complaints_available"])
        self.assertEqual(response.data["complaints_open"], 2)
