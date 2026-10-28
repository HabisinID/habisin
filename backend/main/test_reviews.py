"""API tests for Module 9 reviews and food complaints."""
from datetime import timedelta

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .models import Complaint, Listing, Profile, Reservation, Review, Store


class ReviewAndComplaintTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.partner = User.objects.create_user(username="review_partner")
        Profile.objects.create(user=self.partner, role="partner")
        self.buyer = User.objects.create_user(username="review_buyer", first_name="Raihan")
        Profile.objects.create(user=self.buyer, role="buyer")
        self.other_buyer = User.objects.create_user(username="review_other")
        Profile.objects.create(user=self.other_buyer, role="buyer")
        self.store = Store.objects.create(
            owner=self.partner,
            name="Dapur Ulasan",
            description="Makanan rumahan",
            address="Jalan Margonda, Depok",
            opening_time="08:00",
            closing_time="20:00",
            latitude=-6.36,
            longitude=106.83,
        )
        self.listing = self.make_listing("Roti Surplus")
        self.other_listing = self.make_listing("Kue Surplus")

    def make_listing(self, name):
        now = timezone.now()
        return Listing.objects.create(
            owner=self.partner,
            store_profile=self.store,
            name=name,
            store=self.store.name,
            category="Roti & kue",
            description="Makanan layak santap",
            address=self.store.address,
            price=5000,
            original_price=10000,
            stock=5,
            image="https://example.com/food.jpg",
            latitude=self.store.latitude,
            longitude=self.store.longitude,
            pickup_start=now,
            pickup_end=now + timedelta(hours=4),
        )

    def make_reservation(self, user=None, listing=None, status="picked_up", code="H7K49"):
        return Reservation.objects.create(
            user=user or self.buyer,
            listing=listing or self.listing,
            quantity=1,
            total=5000,
            code=code,
            status=status,
            paid_at=timezone.now() if status in ["paid", "picked_up"] else None,
            picked_up_at=timezone.now() if status == "picked_up" else None,
        )

    def login(self, user=None):
        self.client.force_authenticate(user or self.buyer)

    def test_review_requires_owned_picked_up_order_and_is_unique_per_product(self):
        picked_up = self.make_reservation(code="H7K49")
        self.make_reservation(status="paid", code="H7K48")

        self.login()
        eligibility = self.client.get(f"/api/listings/{self.listing.pk}/review-eligibility")
        self.assertEqual(eligibility.status_code, 200)
        self.assertTrue(eligibility.data["can_review"])
        self.assertEqual(eligibility.data["reservation_id"], picked_up.pk)

        response = self.client.post(
            "/api/reviews",
            {"reservation_id": picked_up.pk, "rating": 5, "comment": "Roti masih enak."},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Review.objects.get().listing, self.listing)
        self.assertEqual(Review.objects.get().store, self.store)

        # A second completed order for the same product cannot create another review.
        another_order = self.make_reservation(code="H7K47")
        duplicate = self.client.post(
            "/api/reviews",
            {"reservation_id": another_order.pk, "rating": 4, "comment": "Ulasan kedua."},
            format="json",
        )
        self.assertEqual(duplicate.status_code, 400)
        self.assertEqual(Review.objects.count(), 1)
        self.assertFalse(self.client.get(f"/api/listings/{self.listing.pk}/review-eligibility").data["can_review"])

    def test_review_rejects_unpicked_foreign_reservation_and_invalid_rating(self):
        paid_order = self.make_reservation(status="paid", code="H7K49")
        another_users_order = self.make_reservation(user=self.other_buyer, code="H7K48")
        self.login()

        for reservation_id, rating in [(paid_order.pk, 5), (another_users_order.pk, 5)]:
            with self.subTest(reservation_id=reservation_id):
                response = self.client.post(
                    "/api/reviews",
                    {"reservation_id": reservation_id, "rating": rating, "comment": "Ulasan valid."},
                    format="json",
                )
                self.assertEqual(response.status_code, 400)
        for rating in [0, 6, 3.5]:
            with self.subTest(rating=rating):
                response = self.client.post(
                    "/api/reviews",
                    {"reservation_id": paid_order.pk, "rating": rating, "comment": "Ulasan valid."},
                    format="json",
                )
                self.assertEqual(response.status_code, 400)
        self.assertFalse(Review.objects.exists())

    def test_review_update_delete_and_owner_permissions(self):
        order = self.make_reservation(code="H7K49")
        self.login()
        created = self.client.post(
            "/api/reviews",
            {"reservation_id": order.pk, "rating": 3, "comment": "Cukup baik."},
            format="json",
        )
        review_id = created.data["id"]

        self.login(self.other_buyer)
        self.assertEqual(self.client.patch(f"/api/reviews/{review_id}", {"rating": 1}, format="json").status_code, 404)
        self.assertEqual(self.client.delete(f"/api/reviews/{review_id}").status_code, 404)

        self.login()
        updated = self.client.patch(f"/api/reviews/{review_id}", {"rating": 4, "comment": "Lebih enak saat hangat."}, format="json")
        self.assertEqual(updated.status_code, 200, updated.data)
        self.assertEqual(updated.data["rating"], 4)
        self.assertEqual(self.client.delete(f"/api/reviews/{review_id}").status_code, 204)
        self.assertFalse(Review.objects.exists())

    def test_store_reviews_are_public_and_return_product_details_and_average(self):
        first_order = self.make_reservation(code="H7K49")
        second_order = self.make_reservation(user=self.other_buyer, code="H7K48")
        for user, order, rating in [(self.buyer, first_order, 5), (self.other_buyer, second_order, 3)]:
            self.login(user)
            response = self.client.post(
                "/api/reviews",
                {"reservation_id": order.pk, "rating": rating, "comment": "Makanan baik."},
                format="json",
            )
            self.assertEqual(response.status_code, 201, response.data)

        response = APIClient().get(f"/api/stores/{self.store.pk}/reviews")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["review_count"], 2)
        self.assertEqual(response.data["average_rating"], 4)
        review = response.data["reviews"][0]
        self.assertEqual(review["listing_id"], self.listing.pk)
        self.assertEqual(review["listing_name"], self.listing.name)
        self.assertIn("created_at", review)

    def test_complaint_allowed_for_paid_or_picked_up_order_only_once(self):
        paid_order = self.make_reservation(status="paid", code="H7K49")
        self.login()

        response = self.client.post(
            "/api/complaints",
            {"reservation_id": paid_order.pk, "reason": "hygiene", "description": "Kemasan makanan terlihat kotor."},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Complaint.objects.get().store, self.store)

        duplicate = self.client.post(
            "/api/complaints",
            {"reservation_id": paid_order.pk, "reason": "other", "description": "Saya ingin melaporkan hal lain."},
            format="json",
        )
        self.assertEqual(duplicate.status_code, 409)
        self.assertEqual(Complaint.objects.count(), 1)

        picked_up_order = self.make_reservation(code="H7K48")
        accepted = self.client.post(
            "/api/complaints",
            {"reservation_id": picked_up_order.pk, "reason": "freshness", "description": "Makanan berbau kurang segar."},
            format="json",
        )
        self.assertEqual(accepted.status_code, 201, accepted.data)

    def test_complaint_rejects_invalid_status_reason_and_short_description(self):
        pending_order = self.make_reservation(status="pending", code="H7K49")
        cancelled_order = self.make_reservation(status="cancelled", code="H7K48")
        self.login()

        for order in [pending_order, cancelled_order]:
            with self.subTest(status=order.status):
                response = self.client.post(
                    "/api/complaints",
                    {"reservation_id": order.pk, "reason": "other", "description": "Masalah makanan."},
                    format="json",
                )
                self.assertEqual(response.status_code, 400)

        accepted_status = self.make_reservation(status="paid", code="H7K47")
        for payload in [
            {"reservation_id": accepted_status.pk, "reason": "invalid", "description": "Penjelasan masalah cukup panjang."},
            {"reservation_id": accepted_status.pk, "reason": "other", "description": "pendek"},
        ]:
            with self.subTest(payload=payload):
                self.assertEqual(self.client.post("/api/complaints", payload, format="json").status_code, 400)
        self.assertFalse(Complaint.objects.exists())

    def test_feedback_endpoints_are_scoped_to_buyer_and_order_owner(self):
        order = self.make_reservation(code="H7K49")
        self.login(self.other_buyer)
        self.assertEqual(self.client.get(f"/api/reservations/{order.pk}/feedback").status_code, 404)

        self.login(self.partner)
        self.assertEqual(self.client.get(f"/api/reservations/{order.pk}/feedback").status_code, 403)
        self.assertEqual(self.client.get(f"/api/listings/{self.listing.pk}/review-eligibility").status_code, 403)
        self.assertEqual(self.client.post("/api/reviews", {"reservation_id": order.pk, "rating": 5}, format="json").status_code, 400)

        self.login(self.buyer)
        feedback = self.client.get(f"/api/reservations/{order.pk}/feedback")
        self.assertEqual(feedback.status_code, 200)
        self.assertTrue(feedback.data["can_review"])
        self.assertTrue(feedback.data["can_complain"])
        mine = self.client.get("/api/reviews/mine")
        self.assertEqual(mine.status_code, 200)
        self.assertEqual(mine.data, {"reviews": [], "complaints": []})
