"""Disposable Django backend for browser tests. Never opens the working database.

From backend/: .venv/bin/python ../frontend/tests/serve-backend.py
Use HABISIN_TEST_PORT (e.g. 8001) to coexist with the working backend.
Ctrl+C removes the temporary database and media.
Only upstream geocoding results are fixtures; sessions, APIs, uploads and orders
use the actual Django application. Public map tiles/images are mocked in fixtures.ts.
"""
import hashlib
import os
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))
os.environ["DJANGO_SETTINGS_MODULE"] = "habisin.settings"
os.environ["DEBUG"] = "True"

from django.conf import settings

with TemporaryDirectory(prefix="habisin-browser-") as directory:
    root = Path(directory)
    settings.DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": root / "db.sqlite3"}}
    settings.MEDIA_ROOT = root / "media"
    settings.CSRF_TRUSTED_ORIGINS = [os.environ.get("HABISIN_TEST_ORIGIN", "http://127.0.0.1:3000")]

    import django
    django.setup()
    from django.core.management import call_command
    from main.models import GeocodingCache
    from main.views import AuthThrottle
    # Browser fixtures create many disposable accounts from one IP.
    # Production's 30/min limit remains unchanged.
    AuthThrottle.rate = "1000/min"

    call_command("migrate", interactive=False, verbosity=0)
    call_command("seed_demo")
    # Optional admin exists only inside the TemporaryDirectory database above.
    if os.environ.get("HABISIN_TEST_ADMIN_PASSWORD"):
        from django.contrib.auth.models import User
        User.objects.create_user(username="workspace_admin", password=os.environ["HABISIN_TEST_ADMIN_PASSWORD"], is_staff=True)

    for address, lat, lng in [
        ("Jalan Margonda, Beji, Depok", -6.366, 106.829),
        ("Jalan Pondok Cina 22, Depok", -6.369, 106.831),
    ]:
        key = hashlib.sha256(f"{settings.NOMINATIM_URL}|{address.casefold()}".encode()).hexdigest()
        GeocodingCache.objects.create(query_hash=key, results=[{"display_name": address, "latitude": lat, "longitude": lng}])
    print(f"Browser-test database and media only: {root}", flush=True)
    call_command("runserver", f"127.0.0.1:{os.environ.get('HABISIN_TEST_PORT', '8000')}", use_reloader=False)
