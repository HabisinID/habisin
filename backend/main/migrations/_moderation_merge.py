"""Schema operations frozen for the colliding module 6/workspace branches."""
from django.db import migrations, models


def columns(connection, table):
    with connection.cursor() as cursor:
        return {
            field.name
            for field in connection.introspection.get_table_description(cursor, table)
        }


def ensure_log_table(schema_editor, model):
    connection = schema_editor.connection
    tables = set(connection.introspection.table_names())
    workspace_table = "main_moderationlog"
    admin_table = "main_adminmoderationlog"
    # Module 6 was originally released with the workspace table's name. Move
    # those records intact before creating either model's correctly named table.
    if workspace_table in tables and {"admin_user_id", "action_type"} <= columns(connection, workspace_table):
        if admin_table in tables:
            raise RuntimeError("Both legacy and renamed admin moderation tables exist; refusing to overwrite audit history.")
        schema_editor.alter_db_table(model, workspace_table, admin_table)
        tables.remove(workspace_table)
        tables.add(admin_table)
    table = model._meta.db_table
    if table in tables:
        expected = {field.column for field in model._meta.local_fields}
        if not expected <= columns(connection, table):
            raise RuntimeError(f"Unexpected schema for {table}; refusing to overwrite audit history.")
        return
    schema_editor.create_model(model)


class CreateModerationLog(migrations.CreateModel):
    def database_forwards(self, app_label, schema_editor, from_state, to_state):
        model = to_state.apps.get_model(app_label, self.name)
        if self.allow_migrate_model(schema_editor.connection.alias, model):
            ensure_log_table(schema_editor, model)


def add_field_preserving_columns(schema_editor, model, field):
    if schema_editor.connection.vendor != "sqlite" or field.null:
        schema_editor.add_field(model, field)
        return
    # SQLite's default AddField path rebuilds the whole table from one branch's
    # historical model, discarding sibling columns. These non-null additive
    # fields have constant effective defaults; native ADD COLUMN retains all
    # existing columns, values, indexes and constraints. SQLite retains the SQL
    # default because removing it would require that same destructive rebuild.
    definition, params = schema_editor.column_sql(model, field, include_default=True)
    check = field.db_parameters(connection=schema_editor.connection)["check"]
    if check:
        definition += " " + schema_editor.sql_check_constraint % {"check": check}
    schema_editor.execute(schema_editor.sql_create_column % {
        "table": schema_editor.quote_name(model._meta.db_table),
        "column": schema_editor.quote_name(field.column),
        "definition": definition,
    }, params or None)
    schema_editor.deferred_sql.extend(schema_editor._field_indexes_sql(model, field))


class AddFieldPreservingColumns(migrations.AddField):
    def database_forwards(self, app_label, schema_editor, from_state, to_state):
        model = to_state.apps.get_model(app_label, self.model_name)
        if self.allow_migrate_model(schema_editor.connection.alias, model):
            field = model._meta.get_field(self.name)
            add_field_preserving_columns(schema_editor, model, field)


    def database_backwards(self, app_label, schema_editor, from_state, to_state):
        model = from_state.apps.get_model(app_label, self.model_name)
        if not self.allow_migrate_model(schema_editor.connection.alias, model):
            return
        field = model._meta.get_field(self.name)
        if schema_editor.connection.vendor == "sqlite":
            present = columns(schema_editor.connection, model._meta.db_table)
            if field.column not in present:
                return
            # Removing the workspace's FK requires SQLite to rebuild Listing.
            # Keep module 6's independent columns even when the historical state
            # at this branch's migration does not know about them yet.
            if model._meta.model_name == "listing":
                state = from_state.clone()
                sibling_fields = {
                    "taken_down": models.BooleanField(default=False),
                    "takedown_reason": models.TextField(blank=True),
                }
                for name, sibling in sibling_fields.items():
                    if name in present and name not in state.models[app_label, self.model_name_lower].fields:
                        state.add_field(app_label, self.model_name_lower, name, sibling, preserve_default=True)
                model = state.apps.get_model(app_label, self.model_name)
                field = model._meta.get_field(self.name)
        schema_editor.remove_field(model, field)
