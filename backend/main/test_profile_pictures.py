from io import BytesIO
from tempfile import TemporaryDirectory

from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from .models import Profile, Store


def photo():
    data = BytesIO()
    Image.new("RGB", (80, 100), "red").save(data, "PNG")
    return SimpleUploadedFile("portrait.png", data.getvalue(), content_type="image/png")


class ProfilePicturesTests(TestCase):
    def setUp(self):
        self.media = TemporaryDirectory()
        self.addCleanup(self.media.cleanup)
        settings = override_settings(MEDIA_ROOT=self.media.name)
        settings.enable()
        self.addCleanup(settings.disable)
        self.user = User.objects.create_user("owner", password="test-password")
        Profile.objects.create(user=self.user, role="partner")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.store = Store.objects.create(owner=self.user, name="Store", description="Food", address="Depok", opening_time="08:00", closing_time="20:00", latitude=0, longitude=0)

    def test_profile_upload_preserve_replace_and_remove(self):
        response = self.client.patch("/api/auth/me", {"profile_picture": photo()}, format="multipart")
        self.assertEqual(response.status_code, 200)
        url = response.data["profile_picture"]
        self.assertTrue(url.startswith("/media/profiles/"))
        self.assertEqual(self.client.patch("/api/auth/me", {"name": "New"}, format="json").data["profile_picture"], url)
        response = self.client.patch("/api/auth/me", {"profile_picture": photo()}, format="multipart")
        self.assertNotEqual(response.data["profile_picture"], url)
        self.assertIsNone(self.client.patch("/api/auth/me", {"profile_picture": ""}, format="multipart").data["profile_picture"])

    def test_store_upload_public_read_and_permissions(self):
        path = f"/api/partner/stores/{self.store.pk}"
        response = self.client.patch(path, {"profile_picture": photo()}, format="multipart")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["profile_picture"].startswith("/media/stores/"))
        self.assertEqual(self.client.get(f"/api/stores/{self.store.pk}").data["profile_picture"], response.data["profile_picture"])
        other = User.objects.create_user("other")
        Profile.objects.create(user=other, role="partner")
        self.client.force_authenticate(other)
        self.assertEqual(self.client.patch(path, {"profile_picture": photo()}, format="multipart").status_code, 404)
        self.client.force_authenticate(self.user)
        self.assertIsNone(self.client.patch(path, {"profile_picture": None}, format="json").data["profile_picture"])

    def test_invalid_upload_does_not_change_profile(self):
        response = self.client.patch("/api/auth/me", {"profile_picture": SimpleUploadedFile("fake.png", b"invalid")}, format="multipart")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Profile.objects.get(user=self.user).profile_picture)
