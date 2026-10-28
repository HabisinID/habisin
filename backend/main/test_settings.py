import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from django.test import SimpleTestCase

BACKEND = Path(__file__).resolve().parent.parent
PRODUCTION_ENV = {
    "PRODUCTION": "True",
    "SECRET_KEY": "test-only-production-secret",
    "DB_NAME": "habisin",
    "DB_USER": "habisin_user",
    "DB_PASSWORD": "not-a-real-password",
    "DB_HOST": "db.internal",
    "DB_PORT": "5432",
    "SCHEMA": "tugas_kelompok",
}
READ_SETTINGS = (
    "import json, habisin.settings as s; db = s.DATABASES['default']; "
    "print(json.dumps({'engine': db['ENGINE'], 'name': str(db['NAME']), 'host': db.get('HOST'), "
    "'port': db.get('PORT'), 'options': db.get('OPTIONS', {}), 'debug': s.DEBUG}))"
)


def load_settings(env):
    """Import settings in a fresh process with only the given variables.

    The working directory is empty so a developer's backend/.env cannot leak in.
    """
    clean = {key: value for key, value in os.environ.items() if key in {"PATH", "SYSTEMROOT", "TEMP", "TMP"}}
    with tempfile.TemporaryDirectory() as empty:
        return subprocess.run(
            [sys.executable, "-c", READ_SETTINGS],
            cwd=empty,
            env={**clean, "PYTHONPATH": str(BACKEND), **env},
            capture_output=True,
            text=True,
        )


class EnvironmentSettingsTests(SimpleTestCase):
    def test_development_uses_sqlite_with_debug(self):
        result = load_settings({})
        self.assertEqual(result.returncode, 0, result.stderr)
        settings = json.loads(result.stdout)
        self.assertEqual(settings["engine"], "django.db.backends.sqlite3")
        self.assertTrue(settings["name"].endswith("db.sqlite3"))
        self.assertTrue(settings["debug"])

    def test_production_uses_postgresql_schema_without_debug(self):
        result = load_settings(PRODUCTION_ENV)
        self.assertEqual(result.returncode, 0, result.stderr)
        settings = json.loads(result.stdout)
        self.assertEqual(settings["engine"], "django.db.backends.postgresql")
        self.assertEqual([settings["name"], settings["host"], settings["port"]], ["habisin", "db.internal", "5432"])
        self.assertEqual(settings["options"], {"options": "-c search_path=tugas_kelompok"})
        self.assertFalse(settings["debug"])

    def test_production_refuses_to_start_without_database_credentials(self):
        env = {key: value for key, value in PRODUCTION_ENV.items() if key not in {"DB_PASSWORD", "DB_HOST"}}
        result = load_settings(env)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("DB_HOST, DB_PASSWORD", result.stderr)

    def test_production_refuses_to_start_without_a_schema(self):
        # Without SCHEMA, migrations would land in "public" and stay there.
        env = {key: value for key, value in PRODUCTION_ENV.items() if key != "SCHEMA"}
        result = load_settings(env)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("SCHEMA", result.stderr)

    def test_a_mistyped_production_flag_stops_startup(self):
        # "Tru" or "1" must not quietly fall back to SQLite on PWS.
        for value in ["Tru", "1", "yes"]:
            result = load_settings({**PRODUCTION_ENV, "PRODUCTION": value})
            self.assertNotEqual(result.returncode, 0, value)
            self.assertIn("PRODUCTION", result.stderr, value)
        result = load_settings({**PRODUCTION_ENV, "PRODUCTION": " TRUE "})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["engine"], "django.db.backends.postgresql")

    def test_production_with_debug_still_needs_a_real_secret_key(self):
        env = {key: value for key, value in PRODUCTION_ENV.items() if key != "SECRET_KEY"}
        result = load_settings({**env, "DEBUG": "True"})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("SECRET_KEY", result.stderr)
