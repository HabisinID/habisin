from django.db import migrations


def restore_missing_picture_columns(apps, schema_editor):
    # A sibling SQLite migration can rebuild a table from its historical state,
    # dropping columns that were added on a different migration branch.
    connection = schema_editor.connection
    for model_name in ("Profile", "Store"):
        model = apps.get_model("main", model_name)
        field = model._meta.get_field("profile_picture")
        with connection.cursor() as cursor:
            columns = {
                column.name
                for column in connection.introspection.get_table_description(
                    cursor, model._meta.db_table
                )
            }
        if field.column not in columns:
            schema_editor.add_field(model, field)


class Migration(migrations.Migration):
    dependencies = [("main", "0015_merge_profile_pictures_and_workspace")]

    operations = [
        # Reversing the repair must not remove columns owned by migration 0013.
        migrations.RunPython(restore_missing_picture_columns, migrations.RunPython.noop),
    ]
