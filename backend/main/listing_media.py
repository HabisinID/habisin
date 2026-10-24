import logging
import warnings
from contextlib import contextmanager
from io import BytesIO
from pathlib import PurePosixPath
from uuid import uuid4

from django.core.files.base import ContentFile
from django.db import transaction
from PIL import Image, ImageOps, UnidentifiedImageError
from rest_framework.exceptions import APIException, ValidationError

from .models import Listing

logger = logging.getLogger(__name__)
MAX_UPLOAD_BYTES = 5 * 1024 * 1024


class MediaUnavailable(APIException):
    status_code = 503
    default_detail = "Foto belum dapat disimpan. Coba lagi; foto sebelumnya tetap tersedia."


def normalize_listing_image(upload):
    if upload.size > MAX_UPLOAD_BYTES:
        raise ValidationError("Foto hasil crop maksimal 5 MiB.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(upload) as source:
                if source.format not in {"JPEG", "PNG", "WEBP"} or getattr(source, "is_animated", False):
                    raise ValidationError("Gunakan foto statis JPEG, PNG, atau WebP. HEIC, GIF, SVG, dan animasi tidak didukung.")
                width, height = source.size
                if not (400 <= width <= 1600 and 300 <= height <= 1200) or width * 3 != height * 4:
                    raise ValidationError("Crop foto ke rasio 4:3, minimal 400×300 dan maksimal 1600×1200 piksel.")
                source.load()
                oriented = ImageOps.exif_transpose(source)
                if oriented.size != (width, height):
                    raise ValidationError("Konfirmasi ulang orientasi foto sebelum menyimpan hasil crop 4:3.")
                rgba = oriented.convert("RGBA")
                clean = Image.new("RGB", rgba.size, "white")
                clean.paste(rgba, mask=rgba.getchannel("A"))
                output = BytesIO()
                clean.save(output, "JPEG", quality=90, optimize=True)
                return ContentFile(output.getvalue(), name="listing.jpg")
    except ValidationError:
        raise
    except (OSError, ValueError, UnidentifiedImageError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise ValidationError("Foto tidak dapat dibaca. Pilih file JPEG, PNG, atau WebP yang valid.") from exc


def delete_listing_file(storage, name, only_unreferenced=True):
    if not name:
        return
    if not name.startswith("listings/") or ".." in PurePosixPath(name).parts:
        logger.warning("Skipped cleanup outside listing media namespace")
        return
    try:
        if not only_unreferenced or not Listing.objects.filter(image_file=name).exists():
            storage.delete(name)
    except Exception:
        logger.exception("Listing media cleanup failed; run cleanup_listing_media to reconcile")


@contextmanager
def compensate_media_writes():
    created = []
    try:
        yield created
    except BaseException:
        for storage, name in created:
            delete_listing_file(storage, name, only_unreferenced=False)
        raise


def save_listing_with_media(serializer, created, **kwargs):
    field = Listing._meta.get_field("image_file")
    previous = serializer.instance.image_file.name if serializer.instance else ""
    upload = serializer.validated_data.get("image_file")
    if upload:
        name = f"listings/{uuid4().hex}.jpg"
        try:
            saved_name = field.storage.save(name, upload)
        except Exception as exc:
            delete_listing_file(field.storage, name, only_unreferenced=False)
            raise MediaUnavailable() from exc
        created.append((field.storage, saved_name))
        serializer.validated_data["image_file"] = saved_name
    item = serializer.save(**kwargs)
    if previous and previous != item.image_file.name:
        transaction.on_commit(lambda: delete_listing_file(field.storage, previous))
    return item
