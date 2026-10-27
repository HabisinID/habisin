import django.db.models.deletion
from django.db import migrations, models


def backfill_review_products(apps, schema_editor):
    Review = apps.get_model("main", "Review")
    Reservation = apps.get_model("main", "Reservation")
    database = schema_editor.connection.alias
    for review in Review.objects.using(database).filter(listing__isnull=True).iterator():
        listing_id = Reservation.objects.using(database).filter(pk=review.reservation_id).values_list("listing_id", flat=True).first()
        if listing_id is not None:
            Review.objects.using(database).filter(pk=review.pk).update(listing_id=listing_id)


class Migration(migrations.Migration):
    dependencies = [("main", "0013_complaint_review")]

    operations = [
        migrations.AddField(
            model_name="review",
            name="listing",
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.PROTECT, related_name="reviews", to="main.listing"),
        ),
        migrations.RunPython(backfill_review_products, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="review",
            name="reservation",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="reviews", to="main.reservation"),
        ),
        migrations.AlterField(
            model_name="review",
            name="listing",
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="reviews", to="main.listing"),
        ),
        migrations.AddConstraint(
            model_name="review",
            constraint=models.UniqueConstraint(fields=("user", "listing"), name="review_user_product_unique"),
        ),
        migrations.AddField(
            model_name="complaint",
            name="reason",
            field=models.CharField(choices=[("hygiene", "Masalah kebersihan"), ("freshness", "Makanan basi atau tidak segar"), ("mismatch", "Makanan tidak sesuai pesanan"), ("other", "Masalah lainnya")], default="other", max_length=12),
        ),
    ]
