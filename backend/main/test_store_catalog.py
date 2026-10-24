from datetime import timedelta
from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from .models import Listing
from .test_listing_revision import create_store


class StoreCatalogTests(TestCase):
    def setUp(self):
        owner = User.objects.create_user(username="catalog", email="private@example.com")
        self.a = create_store(owner, "Same name")
        self.b = create_store(owner, "Same name")

    def listing(self, store, **fields):
        return Listing.objects.create(store_profile=store, store=store.name, address=store.address,
            latitude=store.latitude, longitude=store.longitude, name="Food", description="Food today",
            price=0, original_price=10000, stock=2, image="https://example.com/food.jpg",
            pickup_start=timezone.now(), pickup_end=timezone.now()+timedelta(hours=2), **fields)

    def test_catalog_uses_store_identity_eligibility_and_public_serializer(self):
        a1, a2, b = self.listing(self.a), self.listing(self.a), self.listing(self.b)
        for change in [dict(stock=0), dict(active=False), dict(pickup_end=timezone.now())]:
            item = self.listing(self.a)
            Listing.objects.filter(pk=item.pk).update(**change)
        legacy = self.listing(self.a)
        Listing.objects.filter(pk=legacy.pk).update(store_profile=None)
        data = self.client.get(f"/api/stores/{self.a.pk}/listings").json()
        self.assertEqual([row["id"] for row in data], [a1.pk, a2.pk])
        self.assertEqual(self.client.get(f"/api/stores/{self.b.pk}/listings").json()[0]["id"], b.pk)
        for row in data:
            self.assertEqual(row["store_id"], self.a.pk)
            self.assertNotIn("owner", row)
            self.assertNotIn("owner", row["store_summary"])
            self.assertNotIn("email", row["store_summary"])
            self.assertEqual(row["image_source"], "url")
        # A stored file is serialized through its configured storage URL, not the old URL field.
        a1.image = ""
        a1.image_file.name = "listings/catalog-test.jpg"
        a1.save()
        self.assertEqual(self.client.get(f"/api/stores/{self.a.pk}/listings").json()[0]["image"], a1.image_file.url)

    def test_closed_empty_and_missing_store_are_distinct(self):
        self.assertEqual(self.client.get(f"/api/stores/{self.a.pk}/listings").json(), [])
        self.listing(self.a)
        self.a.is_open = False
        self.a.save()
        response = self.client.get(f"/api/stores/{self.a.pk}/listings")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])
        self.assertEqual(self.client.get("/api/stores/999999/listings").status_code, 404)
        self.assertEqual(self.client.get(f"/api/stores/{self.a.pk}").status_code, 200)
