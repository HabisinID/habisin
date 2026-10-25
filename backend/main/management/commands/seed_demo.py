import json
from datetime import timedelta
from pathlib import Path
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction, IntegrityError
from django.utils import timezone
from main.models import Listing, Reservation


class Command(BaseCommand):
    help = "Create or refresh six demo listings (no demo user credentials)."

    @transaction.atomic
    def handle(self, *args, **options):
        Reservation.expire_overdue()
        if Reservation.objects.filter(status__in=Reservation.ACTIVE_STATUSES).exists():
            raise CommandError("Cancel active demo reservations before refreshing catalog stock.")
        items = json.loads((Path(__file__).resolve().parents[2] / "demo.json").read_text(encoding="utf-8"))
        demo_ids = [item["id"] for item in items]
        if Listing.objects.select_for_update().filter(pk__in=demo_ids, owner__isnull=False).exists():
            raise CommandError("Demo IDs overlap with partner-owned listings. No listings were changed.")
        now = timezone.localtime()
        for item in items:
            pk = item.pop("id")
            item["prepared_at"] = now - timedelta(hours=1)
            item["pickup_start"] = now
            item["pickup_end"] = now + timedelta(hours=8)
            try:
                Listing.objects.update_or_create(pk=pk, owner__isnull=True, defaults=item)
            except IntegrityError as exc:
                raise CommandError("Demo IDs overlap with partner-owned listings. No listings were changed.") from exc
        self.stdout.write(self.style.SUCCESS("Six demo listings ready; pickup expires in eight hours."))
