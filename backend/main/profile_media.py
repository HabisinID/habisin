"""Validate and re-encode avatar uploads, discarding metadata and original names."""
import warnings
from io import BytesIO
from uuid import uuid4

from django.core.files.base import ContentFile
from PIL import Image, ImageOps, UnidentifiedImageError
from rest_framework.exceptions import ValidationError


def normalize_profile_picture(upload):
    if upload.size > 5 * 1024 * 1024:
        raise ValidationError("Foto maksimal 5 MiB.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(upload) as image:
                if image.format not in {"JPEG", "PNG", "WEBP"} or getattr(image, "is_animated", False):
                    raise ValidationError("Gunakan foto statis JPEG, PNG, atau WebP.")
                if image.width * image.height > 20_000_000:
                    raise ValidationError("Foto maksimal 20 megapiksel.")
                image.load()
                image = ImageOps.exif_transpose(image).convert("RGBA")
                image.thumbnail((1024, 1024))
                clean = Image.new("RGB", image.size, "white")
                clean.paste(image, mask=image.getchannel("A"))
                output = BytesIO()
                clean.save(output, "JPEG", quality=90)
                return ContentFile(output.getvalue(), name=f"{uuid4().hex}.jpg")
    except (OSError, ValueError, UnidentifiedImageError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise ValidationError("Foto tidak dapat dibaca. Pilih JPEG, PNG, atau WebP yang valid.") from exc
