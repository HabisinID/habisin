import json
from datetime import timedelta
from pathlib import Path
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from main.models import Listing, Reservation


class Command(BaseCommand):
    help = "Create or refresh six demo listings (no demo user credentials)."

    def handle(self, *args, **options):
        if Reservation.objects.filter(status="reserved").exists():
            raise CommandError("Cancel active demo reservations before refreshing catalog stock.")
        items = json.loads((Path(__file__).resolve().parents[2] / "demo.json").read_text())
        now = timezone.localtime()
        for item in items:
            pk = item.pop("id")
            item["pickup_start"] = now
            item["pickup_end"] = now + timedelta(hours=8)
            Listing.objects.update_or_create(pk=pk, defaults=item)
        self.stdout.write(self.style.SUCCESS("Six demo listings ready; pickup expires in eight hours."))
