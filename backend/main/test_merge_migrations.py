"""Exercise both pre-merge schemas against disposable test databases only."""
from datetime import timedelta
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase
from django.utils import timezone


class MergeMigrationTests(TransactionTestCase):
    final = [('main', '0021_buyer_history_archiving')]

    def upgrade_from(self, origin, status):
        executor = MigrationExecutor(connection)
        executor.migrate([('main', None)])
        executor = MigrationExecutor(connection)
        executor.migrate([('main', origin)])
        apps = executor.loader.project_state([('main', origin)]).apps
        try:
            user = apps.get_model('auth', 'User').objects.create(username='migration-buyer', password='hashed-fixture')
            apps.get_model('main','Profile').objects.create(user_id=user.pk,role='buyer')
            store = apps.get_model('main','Store').objects.create(owner_id=user.pk,name='Toko tetap',description='Cabang lama',address='Depok',opening_time='08:00',closing_time='22:00',latitude=-6.36,longitude=106.83)
            now = timezone.now()
            fields = dict(name='Foto tersimpan',store='Toko lama',category='Roti & kue',description='Riwayat',address='Depok',price=5000,original_price=10000,stock=3,image='https://example.com/food.jpg',latitude=-6.36,longitude=106.83,pickup_start=now,pickup_end=now+timedelta(hours=4))
            if origin.startswith('0011'):
                fields.update(image='', image_file='listings/preserved.jpg', owner_id=user.pk,store_profile_id=store.pk)
            listing = apps.get_model('main','Listing').objects.create(**fields)
            order_fields = dict(user_id=user.pk,listing_id=listing.pk,quantity=1,total=5000,code='ACDEF',status=status)
            if origin.startswith('0011'):
                order_fields.update(pickup_deadline=listing.pickup_end,cancellation_note='Catatan lama')
            else:
                order_fields.update(note='Tanpa sendok',paid_at=now)
            order = apps.get_model('main','Reservation').objects.create(**order_fields)
            executor = MigrationExecutor(connection)
            executor.migrate(self.final)
            merged = executor.loader.project_state(self.final).apps
            result = merged.get_model('main','Reservation').objects.get(pk=order.pk)
            self.assertEqual(result.status,'paid')
            self.assertIsNotNone(result.paid_at)
            self.assertEqual(result.pickup_deadline,listing.pickup_end)
            self.assertEqual(result.quantity,1)
            self.assertEqual(merged.get_model('auth','User').objects.get(pk=user.pk).password,'hashed-fixture')
            restored = merged.get_model('main','Listing').objects.get(pk=listing.pk)
            self.assertEqual(restored.stock,3)
            self.assertIsNone(restored.moderated_at)
            self.assertIsNone(restored.deleted_at)
            self.assertEqual(merged.get_model("main","Store").objects.get(pk=store.pk).weekly_hours,[])
            self.assertEqual(merged.get_model('main','Store').objects.get(pk=store.pk).owner_id,user.pk)
            if origin.startswith('0011'):
                self.assertEqual(restored.image_file.name,'listings/preserved.jpg')
                self.assertEqual(result.cancellation_note,'Catatan lama')
            else:
                self.assertEqual(restored.image,fields['image'])
                self.assertEqual(result.note,'Tanpa sendok')
        finally:
            MigrationExecutor(connection).migrate(self.final)

    def test_upgrade_modules_branch_preserves_reserved_history_and_photo(self):
        self.upgrade_from('0011_reservation_lifecycle','reserved')

    def test_upgrade_main_preserves_paid_order_and_account(self):
        self.upgrade_from('0006_reservation_expired_status','paid')

    def test_both_0013_branches_upgrade_without_losing_data(self):
        for origin in ['0013_partner_workspace_moderation', '0013_verification_log']:
            with self.subTest(origin=origin):
                executor = MigrationExecutor(connection)
                executor.migrate([('main', None)])
                executor = MigrationExecutor(connection)
                executor.migrate([('main', origin)])
                apps = executor.loader.project_state([('main', origin)]).apps
                user = apps.get_model('auth', 'User').objects.create(username='merge-' + origin)
                if origin == '0013_verification_log':
                    apps.get_model('main', 'VerificationLog').objects.create(partner_id=user.pk, code='ABCDE', outcome='not_found')
                executor = MigrationExecutor(connection)
                executor.migrate(self.final)
                apps = executor.loader.project_state(self.final).apps
                self.assertTrue(apps.get_model('auth', 'User').objects.filter(pk=user.pk).exists())
                self.assertIn('moderated_at', [f.name for f in apps.get_model('main', 'Listing')._meta.fields])
                if origin == '0013_verification_log':
                    self.assertTrue(apps.get_model('main', 'VerificationLog').objects.filter(partner_id=user.pk, code='ABCDE').exists())


class PictureColumnRepairTests(TransactionTestCase):
    before = [("main", "0015_merge_profile_pictures_and_workspace")]
    final = [("main", "0016_repair_profile_picture_columns")]

    def tearDown(self):
        # The assertion target is historical, but subsequent tests use current
        # models (including PostgreSQL concurrency tests with new columns).
        executor = MigrationExecutor(connection)
        executor.migrate(executor.loader.graph.leaf_nodes())
        super().tearDown()

    def check_repair(self, missing):
        executor = MigrationExecutor(connection)
        executor.migrate(self.before)
        apps = executor.loader.project_state(self.before).apps
        User = apps.get_model("auth", "User")
        Profile = apps.get_model("main", "Profile")
        Store = apps.get_model("main", "Store")
        user = User.objects.create(username="repair-owner")
        profile = Profile.objects.create(user_id=user.pk, profile_picture="profiles/kept.jpg")
        store = Store.objects.create(
            owner_id=user.pk, name="Preserved store", description="Food",
            address="Depok", opening_time="08:00", closing_time="20:00",
            latitude=-6.36, longitude=106.83, landmark="Park",
            weekly_hours=[{"day": 0, "enabled": False, "sessions": []}],
            profile_picture="" if missing else "stores/kept.jpg",
        )
        try:
            if missing:
                with connection.schema_editor() as editor:
                    editor.remove_field(Store, Store._meta.get_field("profile_picture"))
                with connection.cursor() as cursor:
                    self.assertNotIn("profile_picture", [c.name for c in connection.introspection.get_table_description(cursor, "main_store")])
            executor = MigrationExecutor(connection)
            executor.migrate(self.final)
            store.refresh_from_db()
            profile.refresh_from_db()
            self.assertEqual(store.name, "Preserved store")
            self.assertEqual(store.landmark, "Park")
            self.assertEqual(store.weekly_hours, [{"day": 0, "enabled": False, "sessions": []}])
            self.assertEqual(profile.profile_picture.name, "profiles/kept.jpg")
            self.assertEqual(store.profile_picture.name, "" if missing else "stores/kept.jpg")
            MigrationExecutor(connection).migrate(self.before)
            MigrationExecutor(connection).migrate(self.final)
            store.refresh_from_db()
        finally:
            MigrationExecutor(connection).migrate(self.final)

    def test_repairs_missing_store_column_without_losing_data(self):
        self.check_repair(missing=True)

    def test_preserves_existing_picture_columns_and_values(self):
        self.check_repair(missing=False)
