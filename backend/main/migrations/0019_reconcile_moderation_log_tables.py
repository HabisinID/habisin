from django.db import migrations

from ._moderation_merge import ensure_log_table


def reconcile_log_tables(apps, schema_editor):
    # Also covers a database where the old module 6 migration was already marked
    # applied before its model name was corrected in the historical migration.
    for name in ("AdminModerationLog", "ModerationLog"):
        ensure_log_table(schema_editor, apps.get_model("main", name))


class Migration(migrations.Migration):
    dependencies = [("main", "0018_merge_20261029_1357")]

    operations = [
        migrations.RunPython(reconcile_log_tables, migrations.RunPython.noop),
    ]
