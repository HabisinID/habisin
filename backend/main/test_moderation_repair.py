"""Regression coverage for the two admin APIs and their historical schemas."""
from django.contrib.auth.models import User
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TestCase, TransactionTestCase
from django.utils import timezone

from . import test_commerce
from .test_migration_database import FreshMigrationDatabaseMixin
from .models import Listing, ModerationLog, WorkspaceModerationLog, Reservation


class ModerationIntegrationTests(TestCase):
    setUp = test_commerce.CommerceTests.setUp
    food = test_commerce.CommerceTests.food

    def admin(self):
        admin = User.objects.create_user(username="repair_admin", is_staff=True)
        self.client.force_authenticate(admin)
        return admin

    def test_workspace_logs_summary_and_module6_logs_are_independent(self):
        admin = self.admin()
        response = self.client.post(f"/api/admin/listings/{self.a.pk}/moderate", {
            "action": "take_down", "reason": "Foto tidak sesuai",
        }, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        log = WorkspaceModerationLog.objects.get()
        self.assertEqual(log.actor, admin)
        self.assertEqual(log.listing, self.a)
        self.assertFalse(ModerationLog.objects.exists())
        summary = self.client.get("/api/admin/summary")
        self.assertEqual(summary.status_code, 200, summary.data)
        self.assertEqual(summary.data["listings_taken_down"], 1)
        self.assertEqual(summary.data["recent_activity"][0]["reason"], "Foto tidak sesuai")
        self.assertEqual(self.client.get("/api/admin/moderation-logs").data["count"], 1)
        self.assertEqual(self.client.get("/api/admin/moderation-logs/").status_code, 200)

    def test_module6_takedown_returns_stock_once_and_workspace_can_restore(self):
        response = self.client.post("/api/reservations", {
            "listing_id": self.a.pk, "quantity": 2,
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        order_id = response.data["id"]
        self.assertEqual(self.client.post(f"/api/reservations/{order_id}/pay").status_code, 200)
        admin = self.admin()
        path = f"/api/admin/listings/{self.a.pk}/take-down/"
        response = self.client.post(path, {"reason": "Keamanan makanan"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.a.refresh_from_db()
        self.assertEqual(self.a.stock, 4)
        self.assertTrue(self.a.taken_down)
        self.assertIsNotNone(self.a.moderated_at)
        self.assertEqual(self.a.moderated_by, admin)
        order = Reservation.objects.get(pk=order_id)
        self.assertEqual(order.status, "cancelled")
        self.assertEqual(order.cancelled_by, "admin")
        self.assertIn("Keamanan makanan", order.cancellation_note)
        self.assertEqual(self.client.post(path, {"reason": "Ulang"}, format="json").status_code, 400)
        self.a.refresh_from_db()
        self.assertEqual(self.a.stock, 4)
        self.assertEqual(ModerationLog.objects.count(), 1)
        self.assertFalse(WorkspaceModerationLog.objects.exists())
        self.client.force_authenticate(self.partner)
        self.assertEqual(self.client.get(f"/api/partner/listings/{self.a.pk}").status_code, 200)
        for fields in ({"active": True}, {"stock": 8}, {"name": "Bypass"}):
            self.assertEqual(self.client.patch(f"/api/partner/listings/{self.a.pk}", fields, format="json").status_code, 409)
        self.client.force_authenticate(admin)
        restored = self.client.post(f"/api/admin/listings/{self.a.pk}/moderate", {
            "action": "restore", "reason": "Sudah diperbaiki",
        }, format="json")
        self.assertEqual(restored.status_code, 200, restored.data)
        self.a.refresh_from_db()
        self.assertFalse(self.a.taken_down)
        self.assertIsNone(self.a.moderated_at)
        self.assertFalse(self.a.active)
        self.client.force_authenticate(self.partner)
        self.assertEqual(self.client.patch(f"/api/partner/listings/{self.a.pk}", {"active": True}, format="json").status_code, 200)

    def test_module6_can_restore_workspace_takedown_without_cancelling_tickets(self):
        order = self.client.post("/api/reservations", {"listing_id": self.a.pk}, format="json")
        self.assertEqual(order.status_code, 201, order.data)
        self.client.post(f'/api/reservations/{order.data["id"]}/pay')
        self.admin()
        self.assertEqual(self.client.post(f"/api/admin/listings/{self.a.pk}/moderate", {
            "action": "take_down", "reason": "Periksa foto",
        }, format="json").status_code, 200)
        self.assertEqual(self.client.post(f"/api/admin/listings/{self.a.pk}/restore/", {}, format="json").status_code, 200)
        self.assertEqual(Reservation.objects.get(pk=order.data["id"]).status, "paid")
        self.a.refresh_from_db()
        self.assertFalse(self.a.taken_down)
        self.assertIsNone(self.a.moderated_at)

    def test_legacy_flags_both_block_catalog_and_partner_mutations(self):
        for fields in ({"taken_down": True}, {"moderated_at": timezone.now()}):
            Listing.objects.filter(pk=self.a.pk).update(taken_down=False, moderated_at=None, active=True)
            Listing.objects.filter(pk=self.a.pk).update(**fields)
            self.assertNotIn(self.a.pk, [row["id"] for row in self.client.get("/api/listings").data])
            self.client.force_authenticate(self.partner)
            self.assertEqual(self.client.patch(f"/api/partner/listings/{self.a.pk}", {"active": True}, format="json").status_code, 409)
            self.assertEqual(self.client.post(f"/api/partner/listings/{self.a.pk}/sold-out").status_code, 409)


class ModerationSchemaUpgradeTests(FreshMigrationDatabaseMixin, TransactionTestCase):
    final = [("main", "0019_repair_moderation_log_models")]

    def migrate_to(self, name):
        executor = MigrationExecutor(connection)
        executor.migrate([("main", name)])
        return executor.loader.project_state([("main", name)]).apps if name else None

    def reset(self, target):
        return self.reset_main_to(target)

    def user(self, apps):
        return apps.get_model("auth", "User").objects.create(username="old-log-owner")

    def test_old_workspace_database_keeps_log_ids_and_references(self):
        apps = self.reset("0013_partner_workspace_moderation")
        user = self.user(apps)
        model = apps.get_model("main", "WorkspaceModerationLog")
        row = model.objects.create(actor_id=user.pk, target_name="Surplus", store_name="Cabang", action="take_down", reason="Alasan asli")
        with connection.schema_editor() as editor:
            editor.alter_db_table(model, model._meta.db_table, "main_moderationlog")
        self.migrate_to(self.final[0][1])
        result = WorkspaceModerationLog.objects.get(pk=row.pk)
        self.assertEqual((result.actor_id, result.reason, result.store_name), (user.pk, "Alasan asli", "Cabang"))
        self.assertFalse(ModerationLog.objects.exists())

    def test_module6_only_database_keeps_logs_while_workspace_is_added(self):
        apps = self.reset("0013_moderationlog_partnerapproval")
        user = self.user(apps)
        row = apps.get_model("main", "ModerationLog").objects.create(admin_user_id=user.pk, action_type="APPROVE_PARTNER", target_name="Mitra", reason="Disetujui")
        self.migrate_to(self.final[0][1])
        self.assertEqual(ModerationLog.objects.get(pk=row.pk).admin_user_id, user.pk)
        self.assertFalse(WorkspaceModerationLog.objects.exists())

    def test_both_recorded_migrations_with_old_workspace_table_are_repaired(self):
        apps = self.reset("0018_merge_20261029_1357")
        user = self.user(apps)
        workspace = apps.get_model("main", "WorkspaceModerationLog")
        row = workspace.objects.create(actor_id=user.pk, target_name="Lama", store_name="Cabang", action="restore", reason="Riwayat lama")
        with connection.schema_editor() as editor:
            editor.delete_model(apps.get_model("main", "ModerationLog"))
            editor.alter_db_table(workspace, workspace._meta.db_table, "main_moderationlog")
        self.migrate_to(self.final[0][1])
        self.assertEqual(WorkspaceModerationLog.objects.get(pk=row.pk).reason, "Riwayat lama")
        self.assertFalse(ModerationLog.objects.exists())

    def test_partial_repair_merges_colliding_ids_without_discarding_rows(self):
        apps = self.reset("0018_merge_20261029_1357")
        user = self.user(apps)
        workspace = apps.get_model("main", "WorkspaceModerationLog")
        workspace.objects.create(pk=1, actor_id=user.pk, target_name="Baru", store_name="Cabang", action="restore", reason="Sudah disalin")
        with connection.schema_editor() as editor:
            editor.delete_model(apps.get_model("main", "ModerationLog"))
        table = workspace._meta.db_table
        try:
            workspace._meta.db_table = "main_moderationlog"
            with connection.schema_editor() as editor:
                editor.create_model(workspace)
            workspace.objects.create(pk=1, actor_id=user.pk, target_name="Lama A", store_name="Cabang", action="take_down", reason="Pertahankan A")
            workspace.objects.create(pk=2, actor_id=user.pk, target_name="Lama B", store_name="Cabang", action="take_down", reason="Pertahankan B")
        finally:
            workspace._meta.db_table = table
        self.migrate_to(self.final[0][1])
        self.assertEqual(set(WorkspaceModerationLog.objects.values_list("reason", flat=True)), {"Sudah disalin", "Pertahankan A", "Pertahankan B"})
        fresh = WorkspaceModerationLog.objects.create(actor_id=user.pk, target_name="Setelah migrasi", store_name="Cabang", action="restore", reason="Baru")
        self.assertEqual(WorkspaceModerationLog.objects.count(), 4)
        self.assertGreater(fresh.pk, 3)
