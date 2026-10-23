"""Server-side, user-triggered Nominatim lookups for partner store addresses."""
import errno
import hashlib
import json
import logging
import math
import socket
import ssl
from datetime import timedelta
from time import sleep
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

from django.conf import settings
from django.core import signing
from django.utils import timezone
from rest_framework.exceptions import APIException, Throttled, ValidationError

from .models import GeocodingCache, GeocodingQuota

logger = logging.getLogger(__name__)

TOKEN_SALT = "habisin.store-location"
TOKEN_MAX_AGE = 30 * 60


class GeocodingUnavailable(APIException):
    status_code = 503
    default_detail = "Pencarian alamat sedang tidak tersedia. Coba lagi sebentar."


def normalize_address(address):
    return " ".join(address.split())


def _request_address(query):
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
    return results


def _failure_details(exc):
    reason = exc.reason if isinstance(exc, URLError) else exc
    transient = False
    if isinstance(exc, HTTPError):
        category = "rate_limited" if exc.code == 429 else "http_error"
        message = ("Layanan peta sedang membatasi permintaan. Tunggu sebentar lalu coba lagi."
                   if exc.code == 429 else "Layanan peta menolak atau gagal memproses permintaan. Coba lagi nanti atau hubungi pengelola.")
    elif isinstance(reason, socket.gaierror):
        category = "dns"
        transient = reason.errno == socket.EAI_AGAIN
        message = "Server belum dapat menemukan layanan peta (gangguan DNS). Coba lagi sebentar; jika berlanjut, hubungi pengelola."
    elif isinstance(reason, ssl.SSLError):
        category = "tls"
        message = "Koneksi aman ke layanan peta gagal. Hubungi pengelola untuk memeriksa sertifikat koneksi server."
    elif isinstance(reason, TimeoutError):
        category = "timeout"
        transient = True
        message = "Layanan peta terlalu lama merespons. Coba lagi sebentar."
    elif isinstance(exc, (URLError, OSError)):
        category = "connection"
        transient = isinstance(reason, ConnectionError) or getattr(reason, "errno", None) in {errno.ETIMEDOUT, errno.ECONNRESET}
        message = "Server belum dapat terhubung ke layanan peta. Coba lagi sebentar; jika berlanjut, hubungi pengelola."
    else:
        category = "invalid_response"
        message = "Layanan peta mengirim hasil yang tidak valid. Coba lagi nanti atau hubungi pengelola."
    return category, message, transient


def search_address(address):
    query = normalize_address(address)
    # Include the provider so a configuration change cannot return old results.
    query_hash = hashlib.sha256(f"{settings.NOMINATIM_URL}|{query.casefold()}".encode()).hexdigest()
    cached = GeocodingCache.objects.filter(query_hash=query_hash, fetched_at__gte=timezone.now() - timedelta(days=7)).first()
    if cached:
        return cached.results

    GeocodingQuota.objects.get_or_create(pk=1)
    now = timezone.now()
    # Cover both attempts and OS-level DNS delays, which can exceed socket timeouts.
    # Overlapping workers get 429; finally releases the lease after completion.
    acquired = GeocodingQuota.objects.filter(pk=1, available_at__lte=now).update(available_at=now + timedelta(minutes=2))
    if not acquired:
        raise Throttled(wait=2, detail="Pencarian alamat sedang digunakan. Tunggu sebentar lalu coba lagi.")
    try:
        for attempt in range(2):
            try:
                results = _request_address(query)
                GeocodingCache.objects.update_or_create(query_hash=query_hash, defaults={"results": results})
                return results
            except (HTTPError, URLError, TimeoutError, OSError, ValueError, TypeError, KeyError) as exc:
                category, message, transient = _failure_details(exc)
                retry = attempt == 0 and transient
                reason = exc.reason if isinstance(exc, URLError) else exc
                # Do not log addresses, query strings, provider credentials, or tokens.
                logger.warning(
                    "Geocoding failed: provider=%s category=%s exception=%s http_status=%s errno=%s retry=%s",
                    urlsplit(settings.NOMINATIM_URL).hostname, category, type(reason).__name__,
                    exc.code if isinstance(exc, HTTPError) else None, getattr(reason, "errno", None), retry,
                )
                if not retry:
                    raise GeocodingUnavailable(detail=message, code=f"geocoder_{category}") from exc
                # Keep the shared quota reserved and respect the provider's rate limit.
                sleep(1.1)
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
