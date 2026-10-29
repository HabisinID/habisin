"""Fresh databases for forward-upgrade tests, never downgrade the shared test DB."""
from contextlib import contextmanager
from copy import deepcopy
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4

from django.db import connections
from django.db.migrations.executor import MigrationExecutor


@contextmanager
def migration_database():
    original = connections["default"]
    config = deepcopy(original.settings_dict)
    schema = None
    with TemporaryDirectory(prefix="habisin-schema-upgrade-") as directory:
        if original.vendor == "sqlite":
            config["NAME"] = str(Path(directory) / "migration.sqlite3")
        elif original.vendor == "postgresql":
            schema = "migration_test_" + uuid4().hex
            with original.cursor() as cursor:
                cursor.execute(f"CREATE SCHEMA {original.ops.quote_name(schema)}")
            config["OPTIONS"]["options"] = "-c search_path=" + schema
        else:
            raise RuntimeError("Upgrade fixtures support SQLite/PostgreSQL only.")
        isolated = type(original)(config, alias="default")
        connections["default"] = isolated
        try:
            executor = MigrationExecutor(isolated)
            executor.migrate([target for target in executor.loader.graph.leaf_nodes() if target[0] != "main"])
            yield isolated
        finally:
            isolated.close()
            connections["default"] = original
            if schema:
                with original.cursor() as cursor:
                    cursor.execute(f"DROP SCHEMA {original.ops.quote_name(schema)} CASCADE")


class FreshMigrationDatabaseMixin:
    def reset_main_to(self, migration):
        self.close_migration_database()
        self._migration_database = migration_database()
        connection = self._migration_database.__enter__()
        executor = MigrationExecutor(connection)
        executor.migrate([("main", migration)])
        return executor.loader.project_state([("main", migration)]).apps

    def close_migration_database(self):
        context = getattr(self, "_migration_database", None)
        if context:
            self._migration_database = None
            context.__exit__(None, None, None)

    def tearDown(self):
        self.close_migration_database()
        super().tearDown()
