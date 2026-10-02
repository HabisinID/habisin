from django.conf import settings
from django.core.management import call_command
from django.core.management.base import CommandError


def seed_demo_after_migrate(sender, using="default", apps=None, **kwargs):
    """Opt-in PWS demo setup, after migrate; never run on imports or requests."""
    if not settings.SEED_DEMO_ON_MIGRATE or using != "default":
        return
    # A rollback/targeted migration may not contain the complete current schema.
    if apps is not None:
        try:
            apps.get_model("main", "Listing")
            apps.get_model("main", "Reservation")
        except LookupError:
            return
    try:
        call_command("seed_demo", stdout=kwargs.get("stdout"))
    except CommandError as exc:
        # Existing reservations must survive redeploys unchanged.
        stdout = kwargs.get("stdout")
        message = f"Demo seed skipped: {exc}"
        if stdout:
            stdout.write(message)
        else:
            print(message)
