"""Migration paths use disposable Django test databases, never the working DB."""
from datetime import timedelta

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase
from django.utils import timezone


FINAL = [("main", "0019_reconcile_moderation_log_tables")]


class ModerationMergeMigrationTests(TransactionTestCase):
    def migrate(self, target):
        executor = MigrationExecutor(connection)
        executor.migrate(target)
        if any(name is None for _, name in target):
            return None
        return executor.loader.project_state(target).apps

    def upgrade_branch(self, origin, legacy_admin=False):
        self.migrate([("main", None)])
        apps = self.migrate([("main", origin)])
        user = apps.get_model("auth", "User").objects.create(username="preserved-admin")
        Store = apps.get_model("main", "Store")
        store_values = dict(owner_id=user.pk, name="Preserved store", description="Food",
                            address="Depok", opening_time="08:00", closing_time="20:00",
                            latitude=-6.36, longitude=106.83)
        store_fields = {field.name for field in Store._meta.fields}
        if "profile_picture" in store_fields:
            store_values["profile_picture"] = "stores/preserved.jpg"
        if "weekly_hours" in store_fields:
            store_values["weekly_hours"] = [{"day": 0, "enabled": False, "sessions": []}]
        store = Store.objects.create(**store_values)
        Listing = apps.get_model("main", "Listing")
        values = dict(owner_id=user.pk, store_profile_id=store.pk, name="Preserved listing",
                      store=store.name, category="Roti & kue", description="Food", address="Depok",
                      price=5000, original_price=10000, stock=7, image="https://example.com/food.jpg",
                      latitude=-6.36, longitude=106.83, pickup_start=timezone.now(),
                      pickup_end=timezone.now() + timedelta(hours=4))
        if legacy_admin:
            values.update(taken_down=True, takedown_reason="Module 6 reason")
        else:
            values.update(moderated_at=timezone.now(), moderation_reason="Workspace reason")
        listing = Listing.objects.create(**values)
        if legacy_admin:
            Log = apps.get_model("main", "AdminModerationLog")
            log = Log.objects.create(admin_user_id=user.pk, action_type="APPROVE_PARTNER",
                                     target_name="Original partner", reason="Approved")
            approval = apps.get_model("main", "PartnerApproval").objects.create(user_id=user.pk, status="approved")
            # Reproduce the table name from the original module 6 release while
            # leaving its migration recorder entries applied.
            with connection.schema_editor() as editor:
                editor.alter_db_table(Log, Log._meta.db_table, "main_moderationlog")
        else:
            log = apps.get_model("main", "ModerationLog").objects.create(
                actor_id=user.pk, listing_id=listing.pk, action="take_down",
                target_name=listing.name, store_name=store.name, reason="Workspace reason")
        original_created_at = log.created_at
        try:
            merged = self.migrate(FINAL)
            restored = merged.get_model("main", "Listing").objects.get(pk=listing.pk)
            self.assertEqual(restored.name, listing.name)
            self.assertEqual(restored.stock, 7)
            restored_store = merged.get_model("main", "Store").objects.get(pk=store.pk)
            if "profile_picture" in store_values:
                self.assertEqual(restored_store.profile_picture.name, store_values["profile_picture"])
            if "weekly_hours" in store_values:
                self.assertEqual(restored_store.weekly_hours, store_values["weekly_hours"])
            if legacy_admin:
                self.assertTrue(restored.taken_down)
                self.assertEqual(restored.takedown_reason, "Module 6 reason")
                restored_log = merged.get_model("main", "AdminModerationLog").objects.get(pk=log.pk)
                self.assertEqual(restored_log.admin_user_id, user.pk)
                self.assertEqual(restored_log.action_type, "APPROVE_PARTNER")
                self.assertEqual(restored_log.reason, "Approved")
                self.assertEqual(merged.get_model("main", "PartnerApproval").objects.get(pk=approval.pk).status, "approved")
            else:
                self.assertEqual(restored.moderated_at, values["moderated_at"])
                self.assertEqual(restored.moderation_reason, "Workspace reason")
                restored_log = merged.get_model("main", "ModerationLog").objects.get(pk=log.pk)
                self.assertEqual(restored_log.actor_id, user.pk)
                self.assertEqual(restored_log.listing_id, listing.pk)
                self.assertEqual(restored_log.store_name, store.name)
                self.assertEqual(restored_log.action, "take_down")
            self.assertEqual(restored_log.created_at, original_created_at)
            self.assertEqual(restored_log.target_name, log.target_name)
        finally:
            self.migrate(FINAL)

    def test_upgrade_existing_workspace_preserves_logs_photos_and_moderation(self):
        self.upgrade_branch("0017_merge_reviews_workspace_profile_pictures")

    def test_upgrade_original_module_6_preserves_admin_logs_and_approval(self):
        self.upgrade_branch("0014_listing_takedown_reason_listing_taken_down", legacy_admin=True)

    def test_reconciles_already_recorded_merge_with_legacy_admin_table(self):
        apps = self.migrate([("main", "0018_merge_20261029_1357")])
        User = apps.get_model("auth", "User")
        AdminLog = apps.get_model("main", "AdminModerationLog")
        WorkspaceLog = apps.get_model("main", "ModerationLog")
        user = User.objects.create(username="legacy-admin")
        log = AdminLog.objects.create(admin_user_id=user.pk, action_type="REJECT_PARTNER",
                                      target_name="Legacy partner", reason="Missing information")
        with connection.schema_editor() as editor:
            editor.delete_model(WorkspaceLog)
            editor.alter_db_table(AdminLog, AdminLog._meta.db_table, WorkspaceLog._meta.db_table)
        try:
            apps = self.migrate(FINAL)
            restored = apps.get_model("main", "AdminModerationLog").objects.get(pk=log.pk)
            self.assertEqual(restored.action_type, "REJECT_PARTNER")
            self.assertEqual(restored.reason, "Missing information")
            self.assertEqual(restored.created_at, log.created_at)
            self.assertFalse(apps.get_model("main", "ModerationLog").objects.exists())
        finally:
            self.migrate(FINAL)
