from io import BytesIO, StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.db import IntegrityError
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from .models import Listing, Profile, Reservation, PartnerApproval
from .test_listing_revision import create_store, listing_payload


def photo(format="JPEG", size=(800, 600), animated=False, exif=None):
    output = BytesIO()
    image = Image.new("RGB", size, "#84aa61")
    options = {"exif": exif} if exif is not None else {}
    if animated:
        options.update(save_all=True, append_images=[Image.new("RGB", size, "red")], duration=100, loop=0)
    image.save(output, format, **options)
    return SimpleUploadedFile("camera." + format.lower(), output.getvalue(), content_type="image/" + format.lower())


class ListingMediaTests(TestCase):
    def setUp(self):
        self.directory = TemporaryDirectory()
        self.settings_override = override_settings(MEDIA_ROOT=self.directory.name)
        self.settings_override.enable()
        self.addCleanup(self.directory.cleanup)
        self.addCleanup(self.settings_override.disable)
        self.user = User.objects.create_user(username="photo_partner", password="Photo-Secure-927!")
        Profile.objects.create(user=self.user, role="partner")
        PartnerApproval.objects.create(user=self.user, status="approved")
        self.store = create_store(self.user)
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.storage = Listing._meta.get_field("image_file").storage

    def upload(self, file=None, **changes):
        data = listing_payload(self.store.pk)
        data.pop("image")
        return self.client.post("/api/partner/listings", {**data, "image_source": "upload", "image_file": file or photo(), **changes}, format="multipart")

    def files(self):
        return list(Path(self.directory.name).rglob("*.jpg"))

    def test_valid_formats_are_normalized_without_exif_and_reloadable(self):
        exif = Image.Exif()
        exif[270] = "private camera metadata"
        for format in ["JPEG", "PNG", "WEBP"]:
            response = self.upload(photo(format, exif=exif), packaging="Kotak", storage_notes="Dingin", allergens="Susu", buyer_notes="Bawa wadah sendiri")
            self.assertEqual(response.status_code, 201, response.data)
            self.assertEqual(response.data["buyer_notes"], "Bawa wadah sendiri")
            self.assertEqual(response.data["packaging"], "Kotak")
            self.assertEqual(response.data["storage_notes"], "Dingin")
            self.assertEqual(response.data["allergens"], "Susu")
            self.assertIsNotNone(response.data["prepared_at"])
            self.assertEqual(response.data["image_source"], "upload")
            self.assertTrue(response.data["image"].startswith("/media/listings/"))
            item = Listing.objects.get(pk=response.data["id"])
            with self.storage.open(item.image_file.name, "rb") as file, Image.open(file) as saved:
                self.assertEqual((saved.format, saved.size), ("JPEG", (800, 600)))
                self.assertEqual(dict(saved.getexif()), {})
            public = self.client.get("/api/listings").json()
            self.assertTrue(any(row["image"] == response.data["image"] for row in public))

    def test_source_required_exclusive_and_partial_patch_preserves_photo(self):
        data = listing_payload(self.store.pk)
        for payload in [{key: value for key, value in data.items() if key != "image"}, {**data, "image_source": "upload"}, {**data, "image_file": photo()}]:
            response = self.client.post("/api/partner/listings", payload, format="multipart")
            self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(self.files(), [])
        created = self.upload().data
        path = f'/api/partner/listings/{created["id"]}'
        response = self.client.patch(path, {"stock": 2}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["image"], created["image"])
        self.assertEqual(self.client.patch(path, {"image": ""}, format="json").status_code, 400)

    def test_invalid_files_dimensions_formats_and_spoofed_mime_are_rejected(self):
        cases = [
            SimpleUploadedFile("fake.jpg", b"<html>not a photo</html>", content_type="image/jpeg"),
            SimpleUploadedFile("large.jpg", b"x" * (5 * 1024 * 1024 + 1), content_type="image/jpeg"),
            SimpleUploadedFile("crop.svg", b'<svg xmlns="http://www.w3.org/2000/svg"/>', content_type="image/svg+xml"),
            SimpleUploadedFile("camera.heic", b"not supported", content_type="image/heic"),
            photo(size=(200, 150)), photo(size=(800, 500)), photo(size=(2000, 1500)), photo("GIF"), photo("WEBP", animated=True), photo("PNG", animated=True),
        ]
        for file in cases:
            with self.subTest(name=file.name, size=file.size):
                response = self.upload(file)
                self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(Listing.objects.count(), 0)
        self.assertEqual(self.files(), [])

    def test_unauthorized_and_invalid_store_do_not_write_files(self):
        response = self.upload(store_id=12345678)
        self.assertEqual(response.status_code, 400)
        self.client.force_authenticate(None)
        self.assertEqual(self.upload().status_code, 403)
        self.assertEqual(self.files(), [])
        client = APIClient(enforce_csrf_checks=True)
        client.force_login(self.user)
        data = listing_payload(self.store.pk)
        data.pop("image")
        self.assertEqual(client.post("/api/partner/listings", {**data, "image_file": photo()}, format="multipart").status_code, 403)

    def test_replacement_deletes_old_file_only_after_commit(self):
        created = self.upload().data
        item = Listing.objects.get(pk=created["id"])
        previous = item.image_file.name
        path = f'/api/partner/listings/{item.pk}'
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.patch(path, {"image_file": photo(), "price": -1}, format="multipart")
            self.assertEqual(response.status_code, 400)
        self.assertTrue(self.storage.exists(previous))
        self.assertEqual(len(self.files()), 1)
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.patch(path, {"image_source": "url", "image": "https://example.com/new.jpg"}, format="json")
            self.assertEqual(response.status_code, 200)
            self.assertTrue(self.storage.exists(previous))
        self.assertFalse(self.storage.exists(previous))
        self.assertEqual(response.data["image_source"], "url")
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.patch(path, {"image_source": "upload", "image_file": photo()}, format="multipart")
        self.assertEqual(response.status_code, 200)
        item.refresh_from_db()
        self.assertEqual(item.image, "")
        self.assertTrue(item.image_file)

    def test_storage_and_database_failure_preserve_old_data_without_orphans(self):
        created = self.upload().data
        path = f'/api/partner/listings/{created["id"]}'
        previous = Listing.objects.get().image_file.name
        with patch.object(self.storage, "save", side_effect=OSError("disk unavailable")):
            response = self.client.patch(path, {"image_file": photo()}, format="multipart")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(Listing.objects.get().image_file.name, previous)
        self.assertEqual(len(self.files()), 1)
        with patch.object(Listing._default_manager, "create", side_effect=IntegrityError("database unavailable")):
            with self.assertRaises(IntegrityError):
                self.upload()
        self.assertEqual(len(self.files()), 1)
        self.assertEqual(Listing.objects.count(), 1)

    def test_delete_cleanup_and_orphan_command_preserve_referenced_files(self):
        created = self.upload().data
        name = Listing.objects.get().image_file.name
        orphan = self.storage.save("listings/orphan.jpg", photo())
        output = StringIO()
        call_command("cleanup_listing_media", min_age_hours=0, stdout=output)
        self.assertIn("DRY-RUN", output.getvalue())
        self.assertTrue(self.storage.exists(orphan))
        call_command("cleanup_listing_media", delete=True, min_age_hours=0, stdout=StringIO())
        self.assertFalse(self.storage.exists(orphan))
        self.assertTrue(self.storage.exists(name))
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.client.delete(f'/api/partner/listings/{created["id"]}').status_code, 204)
            self.assertTrue(self.storage.exists(name))
        self.assertTrue(self.storage.exists(name))
        self.assertIsNotNone(Listing.objects.get(pk=created["id"]).deleted_at)

    def test_cleanup_failure_does_not_undo_successful_replacement(self):
        created = self.upload().data
        with self.assertLogs("main.listing_media", level="ERROR"), patch.object(self.storage, "delete", side_effect=OSError("cleanup unavailable")), self.captureOnCommitCallbacks(execute=True):
            response = self.client.patch(f'/api/partner/listings/{created["id"]}', {"image": "https://example.com/replacement.jpg"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Listing.objects.get().image, "https://example.com/replacement.jpg")

    def test_account_delete_keeps_uploaded_photo_referenced_by_buyer_history(self):
        created = self.upload().data
        item = Listing.objects.get(pk=created["id"])
        name = item.image_file.name
        buyer = User.objects.create_user(username="photo_buyer")
        Profile.objects.create(user=buyer, role="buyer")
        self.client.force_authenticate(buyer)
        reserved = self.client.post("/api/reservations", {"listing_id": item.pk, "quantity": 1}, format="json")
        self.assertEqual(reserved.status_code, 201)
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.delete("/api/auth/me", {"password": "Photo-Secure-927!"}, format="json").status_code, 409)
        Reservation.objects.filter(pk=reserved.data["id"]).update(status="picked_up")
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.delete("/api/auth/me", {"password": "Photo-Secure-927!"}, format="json")
        self.assertEqual(response.status_code, 204)
        item.refresh_from_db()
        self.assertFalse(item.active)
        self.assertIsNone(item.owner_id)
        self.assertIsNone(item.store_profile_id)
        self.assertTrue(self.storage.exists(name))
        call_command("cleanup_listing_media", delete=True, min_age_hours=0, stdout=StringIO())
        self.assertTrue(self.storage.exists(name))
        self.client.force_authenticate(buyer)
        history = self.client.get("/api/reservations").json()[0]
        self.assertEqual(history["listing"]["image"], created["image"])
        self.assertEqual(history["listing"]["address"], self.store.address)
