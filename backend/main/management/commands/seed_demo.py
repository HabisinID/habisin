import json
from datetime import timedelta
from pathlib import Path
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction, IntegrityError
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from main.models import Listing, Reservation


class Command(BaseCommand):
    help = "Create or refresh six demo listings (no demo user credentials)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--pickup-end",
            help="Future ISO 8601 pickup deadline with timezone, e.g. 2026-11-21T00:00:00+07:00. Defaults to eight hours from now.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        now = timezone.localtime()
        pickup_end = now + timedelta(hours=8)
        if options.get("pickup_end"):
            try:
                pickup_end = parse_datetime(options["pickup_end"])
            except ValueError:
                pickup_end = None
            if pickup_end is None or timezone.is_naive(pickup_end):
                raise CommandError("--pickup-end must be an ISO 8601 datetime with a timezone offset.")
            if pickup_end <= now:
                raise CommandError("--pickup-end must be in the future.")
        Reservation.expire_overdue()
        if Reservation.objects.filter(status__in=Reservation.ACTIVE_STATUSES).exists():
            raise CommandError("Cancel active demo reservations before refreshing catalog stock.")
        items = json.loads((Path(__file__).resolve().parents[2] / "demo.json").read_text(encoding="utf-8"))
        demo_ids = [item["id"] for item in items]
        if Listing.objects.select_for_update().filter(pk__in=demo_ids, owner__isnull=False).exists():
            raise CommandError("Demo IDs overlap with partner-owned listings. No listings were changed.")
        for item in items:
            pk = item.pop("id")
            item["prepared_at"] = now - timedelta(hours=1)
            item["pickup_start"] = now
            item["pickup_end"] = pickup_end
            try:
                Listing.objects.update_or_create(pk=pk, owner__isnull=True, defaults=item)
            except IntegrityError as exc:
                raise CommandError("Demo IDs overlap with partner-owned listings. No listings were changed.") from exc
        self.stdout.write(self.style.SUCCESS(f"Six demo listings ready; pickup ends at {timezone.localtime(pickup_end).isoformat()}."))
