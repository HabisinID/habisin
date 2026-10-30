from datetime import timedelta
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command, CommandError
from django.test import TestCase
from django.utils import timezone

from main.listing_services import available_listings
from main.management.commands.seed_depok_stores import USERNAME
from main.models import Listing, Store


class SeedDepokStoresTests(TestCase):
    def seed(self, **options):
        call_command("seed_depok_stores", stdout=StringIO(), **options)

    def test_creates_40_fictional_stores_with_disabled_owner(self):
        self.seed()
        self.assertEqual(Store.objects.count(), 40)
        self.assertEqual(Listing.objects.count(), 0)
        owner = get_user_model().objects.get(username=USERNAME)
        self.assertFalse(owner.is_active)
        self.assertFalse(owner.has_usable_password())
        self.assertEqual(owner.profile.role, "partner")
        self.assertEqual(owner.partner_approval.status, "approved")
        self.assertEqual(len(set(Store.objects.values_list("latitude", "longitude"))), 40)

    def test_repeated_seed_does_not_reset_existing_inventory(self):
        deadline = timezone.now() + timedelta(days=25)
        self.seed(with_listings=True, pickup_end=deadline.isoformat())
        self.assertEqual(available_listings().count(), 40)
        item = Listing.objects.first()
        item.stock = 0
        item.active = False
        item.save()
        store = Store.objects.first()
        store.is_open = False
        store.save()
        before = list(Listing.objects.order_by("pk").values())
        self.seed(with_listings=True, pickup_end=(deadline + timedelta(days=1)).isoformat())
        self.assertEqual(list(Listing.objects.order_by("pk").values()), before)
        self.assertEqual(Store.objects.count(), 40)
        store.refresh_from_db()
        self.assertFalse(store.is_open)

    def test_existing_username_is_never_repurposed(self):
        owner = get_user_model().objects.create_user(username=USERNAME, password="Real-Password-927!")
        with self.assertRaises(CommandError):
            self.seed()
        self.assertEqual(Store.objects.count(), 0)
        owner.refresh_from_db()
        self.assertTrue(owner.check_password("Real-Password-927!"))

    def test_deadline_validation_happens_before_writes(self):
        for value in [None, "bad", "2026-99-99", "2099-11-20T12:00:00", (timezone.now() - timedelta(days=1)).isoformat()]:
            with self.subTest(value=value), self.assertRaises(CommandError):
                self.seed(with_listings=True, pickup_end=value)
        with self.assertRaises(CommandError):
            self.seed(pickup_end="2099-11-20T12:00:00+07:00")
        self.assertFalse(get_user_model().objects.exists())
        self.assertFalse(Store.objects.exists())
