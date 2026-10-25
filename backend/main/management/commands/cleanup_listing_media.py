from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from main.listing_media import delete_listing_file
from main.models import Listing


class Command(BaseCommand):
    help = "List unreferenced listing photos; dry-run unless --delete is supplied."

    def add_arguments(self, parser):
        parser.add_argument("--delete", action="store_true")
        parser.add_argument("--min-age-hours", type=float, default=24)

    def handle(self, *args, **options):
        if options["min_age_hours"] < 0:
            raise CommandError("Minimum age cannot be negative.")
        storage = Listing._meta.get_field("image_file").storage
        referenced = set(Listing.objects.exclude(image_file="").values_list("image_file", flat=True))
        cutoff = timezone.now() - timedelta(hours=options["min_age_hours"])
        pending = ["listings"]
        count = 0
        while pending:
            directory = pending.pop()
            try:
                dirs, files = storage.listdir(directory)
            except FileNotFoundError:
                continue
            pending.extend(f"{directory}/{name}" for name in dirs)
            for filename in files:
                name = f"{directory}/{filename}"
                if name in referenced or storage.get_modified_time(name) > cutoff:
                    continue
                count += 1
                self.stdout.write(f'{"DELETE" if options["delete"] else "DRY-RUN"} {name}')
                if options["delete"]:
                    delete_listing_file(storage, name)
        self.stdout.write(f"{count} unreferenced listing photo(s); referenced photos were preserved.")
