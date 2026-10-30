from datetime import time, timedelta

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .models import Complaint, Listing, PartnerApproval, Profile, Reservation, Store


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

    def test_admin_summary_is_admin_only(self):
        self.client.force_authenticate(self.buyer)
        self.assertEqual(self.client.get("/api/admin/summary").status_code, 403)

        self.client.force_authenticate(self.partner)
        self.assertEqual(self.client.get("/api/admin/summary").status_code, 403)

        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/admin/summary").status_code, 403)

    def test_admin_summary_reports_the_four_current_application_metrics(self):
        older = self.make_complaint("M")
        self.make_complaint("N")
        local_now = timezone.localtime()
        start_of_day = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
        Reservation.objects.filter(pk=older.reservation_id).update(
            created_at=start_of_day - timedelta(seconds=1)
        )

        response = self.client.get("/api/admin/summary")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["listings_live"], 2)
        self.assertEqual(response.data["orders_today"], 1)
        self.assertEqual(response.data["partners_active"], 1)
        self.assertEqual(response.data["pickup_portions_today"], 4)

    def test_admin_summary_previews_at_most_three_unresolved_complaints(self):
        complaints = [self.make_complaint(str(i)) for i in range(5)]
        resolved = self.make_complaint("R", status="resolved")

        response = self.client.get("/api/admin/summary")

        preview = response.data["complaint_preview"]
        self.assertEqual(len(preview), 3)
        self.assertEqual(
            [item["id"] for item in preview],
            [complaints[4].pk, complaints[3].pk, complaints[2].pk],
        )
        self.assertNotIn(resolved.pk, [item["id"] for item in preview])
        self.assertEqual(
            set(preview[0]),
            {"id", "listing_name", "store_name", "reason_label", "created_at"},
        )

    def test_admin_summary_previews_at_most_three_pending_partner_registrations(self):
        approvals = []
        for index in range(5):
            user = User.objects.create_user(username=f"pending_partner_{index}")
            approvals.append(PartnerApproval.objects.create(user=user))
            if index == 0:
                Store.objects.create(
                    owner=user,
                    name="Warung Pendaftar",
                    description="Toko yang sedang menunggu persetujuan.",
                    address="Jalan Margonda, Depok",
                    opening_time=time(8),
                    closing_time=time(21),
                    latitude=-6.36,
                    longitude=106.83,
                    category="Nasi & lauk",
                    neighborhood="Kukusan",
                )
        approved_user = User.objects.create_user(username="approved_partner")
        PartnerApproval.objects.create(user=approved_user, status="approved")

        response = self.client.get("/api/admin/summary")

        preview = response.data["partner_approval_preview"]
        self.assertEqual(len(preview), 3)
        self.assertEqual(
            [item["id"] for item in preview],
            [approval.pk for approval in approvals[:3]],
        )
        self.assertEqual(response.data["partner_approvals_pending"], 5)
        self.assertEqual(preview[0]["store_name"], "Warung Pendaftar")
        self.assertEqual(preview[0]["category"], "Nasi & lauk")
        self.assertEqual(preview[0]["neighborhood"], "Kukusan")
        self.assertEqual(
            set(preview[0]),
            {"id", "name", "store_name", "category", "neighborhood", "requested_at"},
        )
