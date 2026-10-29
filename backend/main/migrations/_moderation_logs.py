"""Compatibility operations for the two historical, colliding log migrations.

Keep this module: deployed migration histories import these operations too.
"""
from django.core.management.color import no_style
from django.db import migrations, router


OLD_TABLE = "main_moderationlog"
WORKSPACE_TABLE = "main_workspacemoderationlog"
WORKSPACE_COLUMNS = {
    "id", "listing_id", "actor_id", "target_name", "store_name", "action",
    "reason", "created_at",
}
ADMIN_COLUMNS = {"id", "admin_user_id", "action_type", "target_name", "reason", "created_at"}


def columns(connection, table):
    with connection.cursor() as cursor:
        if table not in connection.introspection.table_names(cursor):
            return set()
        return {column.name for column in connection.introspection.get_table_description(cursor, table)}


def move_legacy_workspace_table(schema_editor):
    """Identify by columns, never assume an old table belongs to Modul 6."""
    connection = schema_editor.connection
    old_columns = columns(connection, OLD_TABLE)
    if not old_columns:
        return
    is_workspace = WORKSPACE_COLUMNS <= old_columns
    is_admin = ADMIN_COLUMNS <= old_columns
    if is_workspace and is_admin:
        raise RuntimeError("Ambiguous moderation log schema; back up and inspect both log formats before migration.")
    if not is_workspace:
        if not is_admin:
            raise RuntimeError("Unknown main_moderationlog schema; migration stopped without discarding logs.")
        return
    quote = schema_editor.quote_name
    destination = columns(connection, WORKSPACE_TABLE)
    if not destination:
        schema_editor.execute(f"ALTER TABLE {quote(OLD_TABLE)} RENAME TO {quote(WORKSPACE_TABLE)}")
        return
    if not WORKSPACE_COLUMNS <= destination:
        raise RuntimeError("Unknown workspace log schema; migration stopped without discarding logs.")
    # Interrupted/manual repairs may have left both workspace tables. Preserve
    # distinct records even when their primary keys overlap; no model references
    # a workspace log ID, so only the colliding imported row needs a new ID.
    fields = sorted(WORKSPACE_COLUMNS)
    field_sql = ", ".join(quote(field) for field in fields)
    id_index = fields.index("id")
    with connection.cursor() as reader, connection.cursor() as writer:
        reader.execute(f"SELECT {field_sql} FROM {quote(OLD_TABLE)} ORDER BY {quote('id')}")
        while batch := reader.fetchmany(500):
            for row in batch:
                writer.execute(
                    f"SELECT {field_sql} FROM {quote(WORKSPACE_TABLE)} WHERE {quote('id')} = %s",
                    [row[id_index]],
                )
                existing = writer.fetchone()
                if existing == row:
                    continue
                if existing is not None:
                    # Allocate explicitly above both sets of IDs; PostgreSQL's
                    # sequence can still lag behind a previous explicit import.
                    writer.execute(f"SELECT MAX({quote('id')}) FROM {quote(WORKSPACE_TABLE)}")
                    highest = writer.fetchone()[0] or 0
                    row = list(row)
                    reader_id = row[id_index]
                    writer.execute(f"SELECT MAX({quote('id')}) FROM {quote(OLD_TABLE)}")
                    row[id_index] = max(highest, writer.fetchone()[0] or 0, reader_id) + 1
                placeholders = ", ".join(["%s"] * len(fields))
                writer.execute(
                    f"INSERT INTO {quote(WORKSPACE_TABLE)} ({field_sql}) VALUES ({placeholders})", row,
                )
    schema_editor.execute(f"DROP TABLE {quote(OLD_TABLE)}")


class CreateModerationModel(migrations.CreateModel):
    """Create once, preserving tables made by an already-applied old sibling."""

    def database_forwards(self, app_label, schema_editor, from_state, to_state):
        model = to_state.apps.get_model(app_label, self.name)
        if not self.allow_migrate_model(schema_editor.connection.alias, model):
            return
        move_legacy_workspace_table(schema_editor)
        existing = columns(schema_editor.connection, model._meta.db_table)
        if existing:
            expected = {field.column for field in model._meta.local_fields}
            if not expected <= existing:
                raise RuntimeError(f"Unexpected schema for {model._meta.db_table}; existing data was not replaced.")
            return
        super().database_forwards(app_label, schema_editor, from_state, to_state)


def repair_log_tables(apps, schema_editor):
    """Also repair databases that already recorded one/both old migrations."""
    move_legacy_workspace_table(schema_editor)
    models = [apps.get_model("main", name) for name in ("WorkspaceModerationLog", "ModerationLog")]
    for model in models:
        if not router.allow_migrate_model(schema_editor.connection.alias, model):
            continue
        existing = columns(schema_editor.connection, model._meta.db_table)
        if not existing:
            schema_editor.create_model(model)
        elif not {field.column for field in model._meta.local_fields} <= existing:
            raise RuntimeError(f"Unexpected schema for {model._meta.db_table}; repair stopped without replacing data.")
    for sql in schema_editor.connection.ops.sequence_reset_sql(no_style(), models):
        schema_editor.execute(sql)
