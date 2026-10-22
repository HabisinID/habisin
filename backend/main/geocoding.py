"""Server-side, user-triggered Nominatim lookups for partner store addresses."""
import hashlib
import json
import math
from datetime import timedelta
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.conf import settings
from django.core import signing
from django.utils import timezone
from rest_framework.exceptions import APIException, Throttled, ValidationError

from .models import GeocodingCache, GeocodingQuota

TOKEN_SALT = "habisin.store-location"
TOKEN_MAX_AGE = 30 * 60


class GeocodingUnavailable(APIException):
    status_code = 503
    default_detail = "Pencarian alamat sedang tidak tersedia. Coba lagi sebentar."


def normalize_address(address):
    return " ".join(address.split())


def search_address(address):
    query = normalize_address(address)
    # Include the provider so a configuration change cannot return old results.
    query_hash = hashlib.sha256(f"{settings.NOMINATIM_URL}|{query.casefold()}".encode()).hexdigest()
    cached = GeocodingCache.objects.filter(query_hash=query_hash, fetched_at__gte=timezone.now() - timedelta(days=7)).first()
    if cached:
        return cached.results

    GeocodingQuota.objects.get_or_create(pk=1)
    now = timezone.now()
    # Reserve a lease before opening the connection; overlapping workers get 429.
    acquired = GeocodingQuota.objects.filter(pk=1, available_at__lte=now).update(available_at=now + timedelta(seconds=30))
    if not acquired:
        raise Throttled(wait=2, detail="Pencarian alamat sedang digunakan. Tunggu sebentar lalu coba lagi.")
    try:
        params = urlencode({"q": query, "format": "jsonv2", "limit": 5, "accept-language": "id"})
        request = Request(f"{settings.NOMINATIM_URL}?{params}", headers={"User-Agent": settings.NOMINATIM_USER_AGENT, "Accept": "application/json"})
        with urlopen(request, timeout=8) as response:
            raw = response.read(1024 * 1024 + 1)
        if len(raw) > 1024 * 1024:
            raise ValueError("Geocoder response too large")
        payload = json.loads(raw)
        if not isinstance(payload, list):
            raise ValueError("Invalid geocoder response")
        results = []
        for item in payload[:5]:
            latitude, longitude = float(item["lat"]), float(item["lon"])
            if not math.isfinite(latitude) or not math.isfinite(longitude) or not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
                raise ValueError("Invalid geocoder coordinates")
            label = item["display_name"]
            if not isinstance(label, str) or not label.strip():
                raise ValueError("Invalid geocoder label")
            results.append({"display_name": label[:1000], "latitude": latitude, "longitude": longitude})
        GeocodingCache.objects.update_or_create(query_hash=query_hash, defaults={"results": results})
        return results
    except (HTTPError, URLError, TimeoutError, OSError, ValueError, TypeError, KeyError) as exc:
        raise GeocodingUnavailable() from exc
    finally:
        # Leave a full second between requests, including failures.
        GeocodingQuota.objects.filter(pk=1).update(available_at=timezone.now() + timedelta(seconds=1.1))


def location_token(address, user_id):
    return signing.dumps({"address": normalize_address(address), "user_id": user_id}, salt=TOKEN_SALT)


def validate_location_token(token, address, user_id):
    try:
        data = signing.loads(token, salt=TOKEN_SALT, max_age=TOKEN_MAX_AGE)
    except (signing.BadSignature, TypeError):
        raise ValidationError({"geocode_token": "Cari ulang alamat dan konfirmasi pin toko sebelum menyimpan."})
    if data != {"address": normalize_address(address), "user_id": user_id}:
        raise ValidationError({"geocode_token": "Hasil pencarian tidak cocok dengan alamat atau akun ini. Cari ulang alamat."})
