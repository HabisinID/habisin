from datetime import datetime, time, timedelta
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from .models import Listing, PartnerApproval, Profile, Reservation, Store


class PartnerSalesStatisticsTests(TestCase):
    def setUp(self):
        self.now = datetime(2026, 10, 30, 12, 0, tzinfo=ZoneInfo("Asia/Jakarta"))
        self.partner = self.make_partner("statistics_partner")
        self.other_partner = self.make_partner("statistics_other")
        self.buyer = User.objects.create_user(username="statistics_buyer")
        self.store = self.make_store(self.partner, "Mitra statistik")
        self.listing = self.make_listing(self.partner, self.store, "Roti statistik")
        self.client = APIClient()
        self.client.force_authenticate(self.partner)

    def make_partner(self, username):
        user = User.objects.create_user(username=username)
        Profile.objects.create(user=user, role="partner")
        PartnerApproval.objects.create(user=user, status="approved")
        return user

    def make_store(self, owner, name):
        return Store.objects.create(
            owner=owner,
            name=name,
            description="Toko untuk pengujian statistik",
            address="Jalan Margonda, Depok",
            opening_time=time(8),
            closing_time=time(22),
            latitude=-6.36,
            longitude=106.83,
        )

    def make_listing(self, owner, store, name):
        return Listing.objects.create(
            owner=owner,
            store_profile=store,
            name=name,
            store=store.name,
            category="Roti & kue",
            description="Makanan surplus",
            address=store.address,
            price=8000,
            original_price=12000,
            stock=20,
            image="https://example.com/statistics.svg",
            latitude=store.latitude,
            longitude=store.longitude,
            pickup_start=self.now - timedelta(hours=1),
            pickup_end=self.now + timedelta(hours=4),
        )

    def make_reservation(self, code, *, listing=None, quantity, total, status, picked_up_at=None):
        return Reservation.objects.create(
            user=self.buyer,
            listing=listing or self.listing,
            quantity=quantity,
            total=total,
            code=code,
            status=status,
            picked_up_at=picked_up_at,
        )

    def test_week_stats_count_completed_sales_and_free_pickups_separately(self):
        today = self.now
        self.make_reservation(
            "A2345", quantity=3, total=24000, status="picked_up", picked_up_at=today
        )
        self.make_reservation(
            "B2345",
            quantity=2,
            total=14000,
            status="picked_up",
            picked_up_at=today - timedelta(days=2),
        )
        self.make_reservation(
            "C2345", quantity=2, total=0, status="picked_up", picked_up_at=today
        )
        self.make_reservation(
            "D2345",
            quantity=10,
            total=50000,
            status="picked_up",
            picked_up_at=today - timedelta(days=9),
        )
        self.make_reservation("E2345", quantity=4, total=32000, status="paid")
        self.make_reservation("F2345", quantity=5, total=40000, status="cancelled")

        with patch("django.utils.timezone.now", return_value=self.now):
            response = self.client.get("/api/partner/dashboard?period=week")

        self.assertEqual(response.status_code, 200)
        sales = response.data["sales"]
        self.assertEqual(sales["sold_portions"], 5)
        self.assertEqual(sales["simulated_total"], 38000)
        self.assertEqual(sales["free_portions"], 2)
        self.assertEqual(len(sales["picked_up_series"]), 7)
        self.assertEqual(sales["picked_up_series"][-1]["portions"], 3)
        self.assertEqual(sales["picked_up_series"][-3]["portions"], 2)
        self.assertTrue(
            all(
                row["portions"] == 0
                for index, row in enumerate(sales["picked_up_series"])
                if index not in {4, 6}
            )
        )

    def test_period_and_partner_ownership_are_applied(self):
        self.make_reservation(
            "G2345", quantity=3, total=24000, status="picked_up", picked_up_at=self.now
        )
        self.make_reservation(
            "H2345",
            quantity=4,
            total=32000,
            status="picked_up",
            picked_up_at=self.now - timedelta(days=12),
        )
        other_store = self.make_store(self.other_partner, "Toko mitra lain")
        other_listing = self.make_listing(self.other_partner, other_store, "Listing mitra lain")
        self.make_reservation(
            "J2345",
            listing=other_listing,
            quantity=99,
            total=999000,
            status="picked_up",
            picked_up_at=self.now,
        )

        with patch("django.utils.timezone.now", return_value=self.now):
            today_response = self.client.get("/api/partner/dashboard?period=today")
            month_response = self.client.get("/api/partner/dashboard?period=month")

        self.assertEqual(today_response.data["sales"]["sold_portions"], 3)
        self.assertEqual(today_response.data["sales"]["simulated_total"], 24000)
        self.assertEqual(month_response.data["sales"]["sold_portions"], 7)
        self.assertEqual(month_response.data["sales"]["simulated_total"], 56000)

    def test_non_partner_cannot_read_partner_sales_statistics(self):
        self.client.force_authenticate(self.buyer)
        with patch("django.utils.timezone.now", return_value=self.now):
            response = self.client.get("/api/partner/dashboard")
        self.assertEqual(response.status_code, 403)
