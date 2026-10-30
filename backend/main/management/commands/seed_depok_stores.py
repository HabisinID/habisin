"""Create fictional demo stores without geocoding or modifying existing inventory."""
import json
from datetime import time, timedelta
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from main.models import Listing, PartnerApproval, Profile, Store

USERNAME = "habisin_demo_depok"
MARKER = "seed_depok_stores:v1"
# Approximate illustrative points, not surveyed business locations.
AREAS = [
    ("Beji", -6.368, 106.821),
    ("Pondok Cina", -6.369, 106.833),
    ("Kukusan", -6.360, 106.812),
    ("Kemiri Muka", -6.379, 106.829),
    ("Depok Jaya", -6.395, 106.805),
    ("Pancoran Mas", -6.402, 106.814),
    ("Sukmajaya", -6.398, 106.847),
    ("Cilodong", -6.438, 106.850),
    ("Cimanggis", -6.365, 106.866),
    ("Sawangan", -6.403, 106.768),
]
VARIANTS = [
    ("Roti", "Roti & kue", "Paket roti demo", 8000, 16000),
    ("Dapur", "Nasi & lauk", "Paket nasi demo", 12000, 24000),
    ("Minuman", "Minuman", "Paket minuman demo", 5000, 10000),
    ("Camilan", "Camilan", "Paket camilan demo", 6000, 12000),
]


class Command(BaseCommand):
    help = "Create 40 fictional stores around Depok; optionally add one demo listing each. Safe to rerun."

    def add_arguments(self, parser):
        parser.add_argument("--with-listings", action="store_true", help="Create one listing per store, without resetting existing listings.")
        parser.add_argument("--pickup-end", help="Required with --with-listings: future ISO 8601 datetime with timezone.")

    @transaction.atomic
    def handle(self, *args, **options):
        now = timezone.now()
        deadline = None
        if options["with_listings"]:
            try:
                deadline = parse_datetime(options.get("pickup_end") or "")
            except ValueError:
                deadline = None
            if deadline is None or timezone.is_naive(deadline) or deadline <= now:
                raise CommandError("--with-listings requires --pickup-end with a future ISO 8601 datetime and timezone offset.")
        elif options.get("pickup_end"):
            raise CommandError("Use --with-listings together with --pickup-end.")

        User = get_user_model()
        owner, _ = User.objects.get_or_create(
            username=USERNAME,
            defaults={"first_name": "Demo Depok", "last_name": MARKER, "is_active": False, "password": "!"},
        )
        owner = User.objects.select_for_update().get(pk=owner.pk)
        if owner.last_name != MARKER or owner.is_active or owner.has_usable_password() or owner.is_staff or owner.is_superuser:
            raise CommandError(f"Username {USERNAME} belongs to another account; no data changed.")
        profile, _ = Profile.objects.get_or_create(user=owner, defaults={"role": "partner"})
        if profile.role != "partner":
            raise CommandError("Demo owner is not a partner; no data changed.")
        PartnerApproval.objects.get_or_create(user=owner, defaults={"status": "approved", "reviewed_at": now})
        photos = json.loads((Path(__file__).resolve().parents[2] / "demo.json").read_text(encoding="utf-8"))
        stores_created = listings_created = 0
        for area_index, (area, lat, lng) in enumerate(AREAS):
            for variant_index, (kind, category, product, price, original) in enumerate(VARIANTS):
                number = area_index * 4 + variant_index + 1
                store, added = Store.objects.get_or_create(
                    owner=owner, name=f"[DEMO] {kind} {area} {number:02d}",
                    defaults={
                        "description": "Toko fiktif untuk demo Habisin, bukan usaha atau lokasi penjual nyata.",
                        "address": f"Area ilustrasi {area}, Depok (lokasi demo, bukan alamat usaha)",
                        "opening_time": time(0, 0), "closing_time": time(23, 59),
                        "latitude": lat + (variant_index - 1.5) * 0.0012,
                        "longitude": lng + (variant_index - 1.5) * 0.0015,
                        "category": category, "neighborhood": area, "city": "Depok",
                    },
                )
                stores_created += int(added)
                if deadline is not None:
                    _, added = Listing.objects.get_or_create(
                        owner=owner, store_profile=store, name=f"[DEMO] {product} {number:02d}",
                        defaults={
                            "store": store.name, "category": category,
                            "description": "Makanan fiktif untuk demonstrasi aplikasi; bukan penawaran dari toko nyata.",
                            "address": store.address, "latitude": store.latitude, "longitude": store.longitude,
                            "price": price, "original_price": original, "stock": 10,
                            "image": photos[number % len(photos)]["image"],
                            "prepared_at": now - timedelta(hours=1), "pickup_start": now, "pickup_end": deadline,
                        },
                    )
                    listings_created += int(added)
        self.stdout.write(self.style.SUCCESS(
            f"Created {stores_created} stores and {listings_created} listings. "
            "40 demo store identities ensured; existing stores, stock, deadlines, and orders unchanged. "
            "Demo owner is inactive and cannot sign in."
        ))
