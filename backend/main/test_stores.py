import json
import socket
import ssl
from datetime import timedelta
from unittest.mock import patch
from urllib.error import HTTPError, URLError

from django.contrib.auth.models import User
from django.core import signing
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from .geocoding import GeocodingUnavailable, location_token, search_address, TOKEN_SALT
from .models import GeocodingCache, GeocodingQuota, Profile, Store


class StoreTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(username="partner", password="Secure-Meal-927!")
        Profile.objects.create(user=self.user, role="partner")
        self.other = User.objects.create_user(username="other")
        Profile.objects.create(user=self.other, role="partner")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.data = {"name": "Dapur Berkah", "description": "Makanan rumahan setiap hari.", "address": "Jalan Margonda Raya 10, Depok", "opening_time": "08:00", "closing_time": "21:00", "latitude": -6.36, "longitude": 106.83, "location_confirmed": True}

    def create(self, **changes):
        data = {**self.data, "geocode_token": location_token(self.data["address"], self.user.pk), **changes}
        return self.client.post("/api/partner/store", data, format="json")

    def test_create_read_edit_close_reopen_and_delete(self):
        self.assertIsNone(self.client.get("/api/partner/store").json()["store"])
        response = self.create()
        self.assertEqual(response.status_code, 201, response.data)
        store = Store.objects.get()
        self.assertEqual(store.owner, self.user)
        self.assertNotIn("geocode_token", response.data)
        self.assertNotIn("owner", response.data)
        self.assertEqual(self.client.get("/api/partner/store").data["store"]["id"], store.pk)
        self.assertEqual(self.client.patch("/api/partner/store", {"name": "Nama baru", "opening_time": "22:00", "closing_time": "04:00"}, format="json").status_code, 200)
        for status in [False, True, False]:
            self.assertEqual(self.client.patch("/api/partner/store", {"is_open": status}, format="json").data["is_open"], status)
        public = APIClient().get(f"/api/stores/{store.pk}")
        self.assertEqual(public.status_code, 200)
        self.assertFalse(public.data["is_open"])
        self.assertEqual(self.client.delete("/api/partner/store", {"confirmation_name": "wrong"}, format="json").status_code, 400)
        self.assertEqual(self.client.delete("/api/partner/store", {"confirmation_name": "Nama baru"}, format="json").status_code, 204)
        self.assertEqual(APIClient().get(f"/api/stores/{store.pk}").status_code, 404)
        self.assertEqual(self.create().status_code, 201)

    def test_one_store_and_ownership(self):
        self.assertEqual(self.create(owner=self.other.pk).status_code, 201)
        self.assertEqual(Store.objects.get().owner, self.user)
        self.assertEqual(self.create().status_code, 409)
        self.client.force_authenticate(self.other)
        self.assertIsNone(self.client.get("/api/partner/store").data["store"])
        self.assertEqual(self.client.patch("/api/partner/store", {"name": "Stolen"}, format="json").status_code, 404)
        self.assertEqual(self.client.delete("/api/partner/store", {"confirmation_name": self.data["name"]}, format="json").status_code, 404)
        self.assertEqual(Store.objects.get().name, self.data["name"])

    def test_roles_and_anonymous_access(self):
        buyer = User.objects.create_user(username="buyer")
        Profile.objects.create(user=buyer)
        admin = User.objects.create_user(username="admin", is_staff=True)
        for user in [None, buyer, admin]:
            self.client.force_authenticate(user)
            for method in ["get", "post", "patch", "delete"]:
                self.assertEqual(getattr(self.client, method)("/api/partner/store", {}, format="json").status_code, 403)
            self.assertEqual(self.client.post("/api/partner/geocode", {"address": self.data["address"]}, format="json").status_code, 403)

    def test_geocoding_and_confirmation_required(self):
        for changes in [{"geocode_token": "invalid"}, {"location_confirmed": False}, {"geocode_token": location_token(self.data["address"], self.other.pk)}, {"geocode_token": signing.dumps({"address": "Different address", "user_id": self.user.pk}, salt=TOKEN_SALT)}]:
            self.assertEqual(self.create(**changes).status_code, 400)
        with patch("django.core.signing.time.time", return_value=timezone.now().timestamp() - 1900):
            token = location_token(self.data["address"], self.user.pk)
        self.assertEqual(self.create(geocode_token=token).status_code, 400)
        self.assertFalse(Store.objects.exists())
        self.create()
        changed = {"address": "Jalan Baru 22, Depok"}
        self.assertEqual(self.client.patch("/api/partner/store", changed, format="json").status_code, 400)
        self.assertEqual(self.client.patch("/api/partner/store", {"latitude": -6.4}, format="json").status_code, 400)
        changed.update(latitude=-6.4, longitude=106.8, location_confirmed=True, geocode_token=location_token(changed["address"], self.user.pk))
        self.assertEqual(self.client.patch("/api/partner/store", changed, format="json").status_code, 200)
        self.assertEqual(Store.objects.get().latitude, -6.4)

    def test_invalid_fields_and_coordinates(self):
        for changes in [{"latitude": 91}, {"longitude": -181}, {"latitude": "NaN"}, {"longitude": "Infinity"}, {"opening_time": "25:00"}, {"closing_time": "08:00"}, {"name": " "}, {"description": ""}, {"address": "short" * 51}]:
            self.assertEqual(self.create(**changes).status_code, 400, changes)
        self.assertFalse(Store.objects.exists())

    @patch("main.store_views.search_address", return_value=[{"latitude": -6.36, "longitude": 106.83, "display_name": "Depok"}])
    def test_geocode_endpoint_and_account_deletion(self, search):
        response = self.client.post("/api/partner/geocode", {"address": "  Jalan Margonda Raya 10, Depok  "}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["geocode_token"])
        search.assert_called_once_with(self.data["address"])
        self.assertEqual(self.create(geocode_token=response.data["geocode_token"]).status_code, 201)
        self.assertEqual(self.client.delete("/api/auth/me", {"password": "Secure-Meal-927!"}, format="json").status_code, 204)
        self.assertFalse(Store.objects.exists())

    def test_mutations_enforce_csrf(self):
        client = APIClient(enforce_csrf_checks=True)
        client.force_login(self.user)
        self.assertEqual(client.post("/api/partner/geocode", {"address": self.data["address"]}, format="json").status_code, 403)
        self.assertEqual(client.post("/api/partner/store", self.data, format="json").status_code, 403)


@override_settings(NOMINATIM_URL="https://nominatim.openstreetmap.org/search", NOMINATIM_USER_AGENT="HABISIN-test/1.0")
class GeocodingTests(TestCase):
    @patch("main.geocoding.urlopen")
    def test_cache_identification_and_shared_rate_limit(self, upstream):
        upstream.return_value.__enter__.return_value.read.return_value = json.dumps([{"lat": "-6.36", "lon": "106.83", "display_name": "Depok"}]).encode()
        result = search_address("Jalan Margonda, Depok")
        self.assertEqual(result[0]["latitude"], -6.36)
        self.assertEqual(search_address("  jalan   margonda, Depok "), result)
        self.assertEqual(upstream.call_count, 1)
        request = upstream.call_args.args[0]
        self.assertEqual(request.get_header("User-agent"), "HABISIN-test/1.0")
        self.assertIn("format=jsonv2", request.full_url)
        from rest_framework.exceptions import Throttled
        with self.assertRaises(Throttled):
            search_address("Jalan baru, Depok")
        self.assertEqual(upstream.call_count, 1)
        GeocodingQuota.objects.update(available_at=timezone.now() - timedelta(seconds=2))
        search_address("Jalan baru, Depok")
        self.assertEqual(upstream.call_count, 2)

    @patch("main.geocoding.urlopen", side_effect=URLError("offline"))
    def test_provider_failure_does_not_cache_or_save_invalid_results(self, upstream):
        with self.assertRaises(GeocodingUnavailable):
            search_address("Jalan Margonda, Depok")
        self.assertFalse(GeocodingCache.objects.exists())
        self.assertGreater(GeocodingQuota.objects.get().available_at, timezone.now())

    @patch("main.geocoding.urlopen")
    def test_empty_and_malformed_results(self, upstream):
        for payload in [b'{"error":"bad"}', b'[{"lat":"NaN","lon":"106","display_name":"Bad"}]', b'not json']:
            GeocodingQuota.objects.all().delete()
            upstream.return_value.__enter__.return_value.read.return_value = payload
            with self.assertRaises(GeocodingUnavailable):
                search_address("Jalan Margonda, Depok")
        GeocodingQuota.objects.all().delete()
        upstream.return_value.__enter__.return_value.read.return_value = b'[]'
        self.assertEqual(search_address("Jalan Margonda, Depok"), [])
        self.assertEqual(search_address("Jalan Margonda, Depok"), [])

    @patch("main.geocoding.sleep")
    @patch("main.geocoding.urlopen")
    def test_transient_dns_failure_retries_once_and_caches_success(self, upstream, pause):
        response = upstream.return_value
        response.__enter__.return_value.read.return_value = b'[{"lat":"-6.36","lon":"106.83","display_name":"Depok"}]'
        upstream.side_effect = [URLError(socket.gaierror(socket.EAI_AGAIN, "Temporary failure in name resolution")), response]
        with self.assertLogs("main.geocoding", level="WARNING") as logs:
            result = search_address("Jalan Margonda, Depok")
        self.assertEqual(result[0]["latitude"], -6.36)
        self.assertEqual(upstream.call_count, 2)
        pause.assert_called_once_with(1.1)
        self.assertIn("category=dns", logs.output[0])
        self.assertNotIn("Jalan Margonda", logs.output[0])
        self.assertEqual(search_address("Jalan Margonda, Depok"), result)
        self.assertEqual(upstream.call_count, 2)

    @patch("main.geocoding.sleep")
    @patch("main.geocoding.urlopen")
    def test_persistent_dns_failure_reports_dns_and_stops_after_one_retry(self, upstream, pause):
        upstream.side_effect = URLError(socket.gaierror(socket.EAI_AGAIN, "Temporary DNS failure"))
        with self.assertLogs("main.geocoding", level="WARNING"):
            with self.assertRaises(GeocodingUnavailable) as failure:
                search_address("Jalan Margonda, Depok")
        self.assertEqual(upstream.call_count, 2)
        pause.assert_called_once_with(1.1)
        self.assertIn("DNS", str(failure.exception.detail))
        self.assertEqual(failure.exception.detail.code, "geocoder_dns")
        self.assertFalse(GeocodingCache.objects.exists())
        self.assertGreater(GeocodingQuota.objects.get().available_at, timezone.now())

    @patch("main.geocoding.sleep")
    @patch("main.geocoding.urlopen")
    def test_rejections_certificates_and_permanent_dns_are_not_retried(self, upstream, pause):
        errors = [
            (HTTPError("https://provider.invalid/search?secret=hidden", 403, "Forbidden", {}, None), "geocoder_http_error"),
            (HTTPError("https://provider.invalid/search", 429, "Too many requests", {}, None), "geocoder_rate_limited"),
            (URLError(ssl.SSLCertVerificationError("Invalid certificate")), "geocoder_tls"),
            (URLError(socket.gaierror(socket.EAI_NONAME, "Unknown host")), "geocoder_dns"),
        ]
        for error, code in errors:
            GeocodingQuota.objects.all().delete()
            upstream.reset_mock()
            upstream.side_effect = error
            with self.assertLogs("main.geocoding", level="WARNING") as logs:
                with self.assertRaises(GeocodingUnavailable) as failure:
                    search_address("Jalan Margonda, Depok")
            self.assertEqual(failure.exception.detail.code, code)
            upstream.assert_called_once()
            self.assertNotIn("secret", str(logs.output))
            self.assertNotIn("Jalan Margonda", str(logs.output))
        pause.assert_not_called()

    @patch("main.geocoding.sleep")
    @patch("main.geocoding.urlopen")
    def test_timeout_retries_but_malformed_response_does_not(self, upstream, pause):
        response = upstream.return_value
        response.__enter__.return_value.read.return_value = b'[]'
        upstream.side_effect = [URLError(TimeoutError("Timed out")), response]
        with self.assertLogs("main.geocoding", level="WARNING"):
            self.assertEqual(search_address("Jalan Margonda, Depok"), [])
        self.assertEqual(upstream.call_count, 2)
        pause.assert_called_once_with(1.1)
        GeocodingQuota.objects.all().delete()
        upstream.reset_mock()
        upstream.side_effect = None
        response.__enter__.return_value.read.return_value = b'not json'
        with self.assertLogs("main.geocoding", level="WARNING"):
            with self.assertRaises(GeocodingUnavailable) as failure:
                search_address("Jalan lain, Depok")
        self.assertEqual(failure.exception.detail.code, "geocoder_invalid_response")
        upstream.assert_called_once()
