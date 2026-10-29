from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.contrib.auth.models import User
from django.utils import timezone
from datetime import timedelta
from django.test import TestCase, TransactionTestCase
from rest_framework.test import APIClient
from .geocoding import location_token
from .models import Listing, Profile, Reservation, Store, PartnerApproval
from .test_migration_database import FreshMigrationDatabaseMixin


def listing_payload(store_id):
    return dict(prepared_at=(timezone.now()-timedelta(hours=1)).isoformat(), store_id=store_id, name="Roti Cabang", description="Roti layak makan hari ini", category="Roti & kue", price=5000, original_price=10000, stock=4, image="https://example.com/roti.jpg", pickup_start=timezone.now().isoformat(), pickup_end=(timezone.now()+timedelta(hours=4)).isoformat())


def create_store(user, name="Cabang A", **changes):
    PartnerApproval.objects.get_or_create(user=user, defaults={"status": "approved"})
    data = store_payload(user, name)
    data.pop("geocode_token")
    data.pop("location_confirmed")
    return Store.objects.create(owner=user, **{**data, **changes})


def store_payload(user, name="Dapur Cabang"):
    address = "Jalan Margonda 10, Depok"
    return dict(name=name, description="Makanan segar", address=address, opening_time="08:00", closing_time="20:00", latitude=-6.36, longitude=106.83, geocode_token=location_token(address, user.pk), location_confirmed=True)


class MultipleStoreAPITests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="branches", password="Branch-Secure-927!")
        Profile.objects.create(user=self.user, role="partner")
        PartnerApproval.objects.get_or_create(user=self.user, defaults={"status": "approved"})
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def create(self, name):
        response = self.client.post("/api/partner/stores", store_payload(self.user, name), format="json")
        self.assertEqual(response.status_code, 201, response.data)
        return response.json()

    def test_plural_crud_is_scoped_to_store_id(self):
        a, b = self.create("A"), self.create("B")
        self.assertEqual([s["id"] for s in self.client.get("/api/partner/stores").json()["stores"]], [a["id"], b["id"]])
        path = f'/api/partner/stores/{b["id"]}'
        self.assertEqual(self.client.get(path).json()["name"], "B")
        self.assertEqual(self.client.patch(path, {"name": "B Baru", "is_open": False}, format="json").status_code, 200)
        self.assertTrue(Store.objects.get(pk=a["id"]).is_open)
        self.assertEqual(self.client.delete(path, {"confirmation_name": "B Baru"}, format="json").status_code, 204)
        self.assertEqual(Store.objects.get().name, "A")

    def test_foreign_owner_roles_csrf_and_location_validation(self):
        other = User.objects.create_user(username="foreign_partner")
        Profile.objects.create(user=other, role="partner")
        PartnerApproval.objects.get_or_create(user=other, defaults={"status": "approved"})
        item = self.create("A")
        path = f'/api/partner/stores/{item["id"]}'
        self.client.force_authenticate(other)
        self.assertEqual(self.client.get("/api/partner/stores").json(), {"stores": []})
        for method in ["get", "patch", "delete"]:
            self.assertEqual(getattr(self.client, method)(path).status_code, 404)
        self.client.force_authenticate(self.user)
        for patch in [{"geocode_token": "bad"}, {"location_confirmed": False}, {"latitude": 91}]:
            self.assertEqual(self.client.post("/api/partner/stores", {**store_payload(self.user), **patch}, format="json").status_code, 400)
        csrf = APIClient(enforce_csrf_checks=True)
        csrf.force_login(self.user)
        self.assertEqual(csrf.post("/api/partner/stores", store_payload(self.user), format="json").status_code, 403)
        buyer = User.objects.create_user(username="branch_buyer")
        Profile.objects.create(user=buyer)
        admin = User.objects.create_user(username="branch_admin", is_staff=True)
        for user in [None, buyer, admin]:
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get("/api/partner/stores").status_code, 403)
            self.assertEqual(self.client.post("/api/partner/stores", {}, format="json").status_code, 403)

    def test_singular_adapter_never_picks_first_of_multiple_stores(self):
        self.assertEqual(self.client.get("/api/partner/store").json(), {"store": None})
        a = self.create("A")
        self.assertEqual(self.client.get("/api/partner/store").json()["store"]["id"], a["id"])
        self.assertEqual(self.client.post("/api/partner/store", store_payload(self.user), format="json").status_code, 409)
        self.create("B")
        for method in ["get", "post", "patch", "delete"]:
            response = getattr(self.client, method)("/api/partner/store", {}, format="json")
            self.assertEqual(response.status_code, 409)
            self.assertEqual(response.json()["code"], "store_selection_required")
        self.assertEqual(Store.objects.count(), 2)

    def test_listing_serialization_preserves_legacy_and_adds_public_store_identity(self):
        data = dict(name="Roti", store="Nama lama", address="Alamat lama", description="Roti sisa hari ini", category="Roti & kue", price=1000, original_price=2000, stock=2, image="https://example.com/a.jpg", latitude=-6.36, longitude=106.83, pickup_start=timezone.now(), pickup_end=timezone.now()+timedelta(hours=2))
        item = Listing.objects.create(owner=self.user, **data)
        result = self.client.get("/api/listings").json()[0]
        self.assertIsNone(result["store_id"])
        self.assertIsNone(result["store_summary"])
        self.assertEqual(result["store"], data["store"])
        created = self.create("Cabang A")
        item.store_profile_id = created["id"]
        item.save()
        result = self.client.get("/api/listings").json()[0]
        self.assertEqual(result["store_id"], created["id"])
        self.assertEqual(result["store_summary"]["name"], "Cabang A")
        self.assertNotIn("owner", result["store_summary"])
        self.assertNotIn("email", result["store_summary"])


class MultipleStoreMigrationTests(FreshMigrationDatabaseMixin, TransactionTestCase):
    def test_existing_store_survives_and_owner_can_add_second_store(self):
        executor = MigrationExecutor(connection)
        latest = executor.loader.graph.leaf_nodes()
        old = [("main", "0004_merge_listing_store")]
        apps = self.reset_main_to(old[0][1])
        user = apps.get_model("auth", "User").objects.create(username="migration_partner")
        Store = apps.get_model("main", "Store")
        data = dict(owner_id=user.pk, name="Cabang pertama", description="Dapur", address="Jalan Margonda 1", opening_time="08:00", closing_time="20:00", latitude=-6.36, longitude=106.83)
        original = Store.objects.create(**data)
        try:
            executor = MigrationExecutor(connection)
            executor.migrate(latest)
            Store = executor.loader.project_state(latest).apps.get_model("main", "Store")
            stored = Store.objects.get(pk=original.pk)
            self.assertEqual((stored.name, stored.owner_id, stored.latitude, stored.longitude), (data["name"], user.pk, -6.36, 106.83))
            Store.objects.create(**{**data, "name": "Cabang kedua"})
            self.assertEqual(Store.objects.filter(owner_id=user.pk).count(), 2)
        finally:
            MigrationExecutor(connection).migrate(latest)


class LinkedListingTests(TestCase):
    def setUp(self):
        self.partner = User.objects.create_user(username="linked_partner", password="Linked-Secure-927!")
        Profile.objects.create(user=self.partner, role="partner")
        PartnerApproval.objects.get_or_create(user=self.partner, defaults={"status": "approved"})
        self.buyer = User.objects.create_user(username="linked_buyer")
        Profile.objects.create(user=self.buyer)
        self.a = create_store(self.partner)
        self.b = create_store(self.partner, "Cabang B", address="Jalan Pondok Cina 2", latitude=-6.37)
        self.client = APIClient()
        self.client.force_authenticate(self.partner)
        response = self.client.post("/api/partner/listings", listing_payload(self.a.pk), format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.item = Listing.objects.get(pk=response.data["id"])
        self.path = f"/api/partner/listings/{self.item.pk}"

    def reserve(self):
        self.client.force_authenticate(self.buyer)
        response = self.client.post("/api/reservations", {"listing_id": self.item.pk, "quantity": 1}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.client.force_authenticate(self.partner)
        return response.data

    def test_required_store_ownership_snapshot_and_partial_patch(self):
        for invalid in [None, "invalid", 0, -1]:
            response = self.client.post("/api/partner/listings", {**listing_payload(self.a.pk), "store_id": invalid}, format="json")
            self.assertEqual(response.status_code, 400)
            self.assertIn("store_id", response.data)
        for changes in [{"store_id": None}, {"store_id": 987654}, {"address": "Palsu"}, {"latitude": 0}, {"store": "Palsu"}]:
            response = self.client.post("/api/partner/listings", {**listing_payload(self.a.pk), **changes}, format="json")
            self.assertEqual(response.status_code, 400, response.data)
        no_store = listing_payload(self.a.pk)
        no_store.pop("store_id")
        self.assertEqual(self.client.post("/api/partner/listings", no_store, format="json").status_code, 400)
        other = User.objects.create_user(username="linked_other")
        foreign = create_store(other, "Foreign")
        self.assertEqual(self.client.patch(self.path, {"store_id": foreign.pk}, format="json").status_code, 400)
        result = self.client.patch(self.path, {"store_id": self.b.pk}, format="json")
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual((result.data["store_id"], result.data["store"], result.data["address"], result.data["latitude"]), (self.b.pk, self.b.name, self.b.address, self.b.latitude))
        self.assertEqual(self.client.patch(self.path, {"stock": 2}, format="json").data["store_id"], self.b.pk)
        self.item.refresh_from_db()
        self.assertEqual(self.item.stock, 2)

    def test_store_and_listing_moves_are_guarded_until_no_active_orders(self):
        sibling = self.client.post("/api/partner/listings", {**listing_payload(self.a.pk), "name": "Produk A kedua"}, format="json").json()
        order = self.reserve()
        self.assertEqual(self.client.patch(self.path, {"store_id": self.b.pk}, format="json").status_code, 409)
        for path in [f"/api/partner/stores/{self.a.pk}"]:
            self.assertEqual(self.client.patch(path, {"name": "Pindah"}, format="json").status_code, 409)
            self.assertEqual(self.client.patch(path, {"description": "Deskripsi baru"}, format="json").status_code, 200)
        self.b.delete()
        self.assertEqual(self.client.patch("/api/partner/store", {"name": "Pindah"}, format="json").status_code, 409)
        self.item.refresh_from_db()
        self.assertEqual(self.item.store, self.a.name)
        self.client.force_authenticate(self.buyer)
        self.assertEqual(self.client.post(f'/api/reservations/{order["id"]}/cancel').status_code, 200)
        self.client.force_authenticate(self.partner)
        response = self.client.patch(f"/api/partner/stores/{self.a.pk}", {"name": "Nama Baru"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.item.refresh_from_db()
        self.assertEqual(self.item.store, "Nama Baru")
        self.assertEqual(Listing.objects.get(pk=sibling["id"]).store, "Nama Baru")
        address = "Jalan Baru 23, Depok"
        response = self.client.patch(f"/api/partner/stores/{self.a.pk}", {"address": address, "latitude": -6.38, "longitude": 106.84, "geocode_token": location_token(address, self.partner.pk), "location_confirmed": True}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.item.refresh_from_db()
        self.assertEqual((self.item.address, self.item.latitude), (address, -6.38))
        self.assertEqual(Listing.objects.get(pk=sibling["id"]).address, address)

    def test_closed_store_sold_out_and_expired_are_not_discoverable_or_reservable(self):
        order = self.reserve()
        response = self.client.patch(f"/api/partner/stores/{self.a.pk}", {"is_open": False}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get("/api/listings").json(), [])
        self.assertEqual(len(self.client.get("/api/partner/listings").json()), 1)
        self.assertEqual(Reservation.objects.get(pk=order["id"]).status, "pending")
        self.client.force_authenticate(self.buyer)
        self.assertEqual(self.client.post("/api/reservations", {"listing_id": self.item.pk}, format="json").status_code, 400)
        self.client.force_authenticate(self.partner)
        self.assertEqual(self.client.patch(self.path, {"active": True}, format="json").status_code, 400)
        self.client.patch(f"/api/partner/stores/{self.a.pk}", {"is_open": True}, format="json")
        self.assertEqual(len(self.client.get("/api/listings").json()), 1)
        for changes in [{"stock": 0}, {"stock": 2, "pickup_end": timezone.now()-timedelta(seconds=1)}]:
            Listing.objects.filter(pk=self.item.pk).update(**changes)
            self.assertEqual(self.client.get("/api/listings").json(), [])

    def test_store_delete_conflicts_and_account_delete_keeps_ticket_snapshot(self):
        order = self.reserve()
        self.assertEqual(self.client.delete(f"/api/partner/stores/{self.a.pk}", {"confirmation_name": self.a.name}, format="json").status_code, 409)
        self.assertEqual(self.client.delete("/api/auth/me", {"password": "Linked-Secure-927!"}, format="json").status_code, 409)
        Reservation.objects.filter(pk=order["id"]).update(status="picked_up")
        self.assertEqual(self.client.delete("/api/auth/me", {"password": "Linked-Secure-927!"}, format="json").status_code, 204)
        self.assertFalse(Store.objects.filter(owner_id=self.partner.pk).exists())
        self.item.refresh_from_db()
        self.assertIsNone(self.item.store_profile_id)
        self.assertFalse(self.item.active)
        self.client.force_authenticate(self.buyer)
        history = self.client.get("/api/reservations").json()[0]
        self.assertEqual(history["id"], order["id"])
        self.assertEqual(history["listing"]["address"], self.a.address)

    def test_legacy_requires_explicit_store_and_reserved_link_must_match_snapshot(self):
        self.item.store_profile = None
        self.item.save()
        self.assertEqual(self.client.patch(self.path, {"name": "Legacy"}, format="json").status_code, 400)
        self.reserve()
        self.assertEqual(self.client.patch(self.path, {"store_id": self.b.pk}, format="json").status_code, 409)
        self.assertEqual(self.client.patch(self.path, {"store_id": self.a.pk}, format="json").status_code, 200)
