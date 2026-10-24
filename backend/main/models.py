from django.conf import settings
from django.db import models
from django.utils import timezone


class Book(models.Model):
    title = models.CharField(max_length=255)
    author = models.CharField(max_length=255)
    publish_date = models.DateField()

    def __str__(self):
        return self.title


class Profile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile")
    role = models.CharField(max_length=10, choices=[("buyer", "Pembeli"), ("partner", "Mitra")], default="buyer")


class Store(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="stores")
    name = models.CharField(max_length=120)
    description = models.TextField(max_length=2000)
    address = models.CharField(max_length=250)
    opening_time = models.TimeField()
    closing_time = models.TimeField()
    latitude = models.FloatField()
    longitude = models.FloatField()
    is_open = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class GeocodingCache(models.Model):
    query_hash = models.CharField(max_length=64, primary_key=True)
    results = models.JSONField(default=list)
    fetched_at = models.DateTimeField(auto_now=True)


class GeocodingQuota(models.Model):
    # A single database row coordinates requests across all application workers.
    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    available_at = models.DateTimeField(default=timezone.now)


class Listing(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="listings")
    store_profile = models.ForeignKey(Store, null=True, blank=True, on_delete=models.PROTECT, related_name="listings")
    name = models.CharField(max_length=160)
    store = models.CharField(max_length=120)
    category = models.CharField(max_length=30)
    description = models.TextField()
    address = models.CharField(max_length=250)
    price = models.PositiveIntegerField()
    original_price = models.PositiveIntegerField()
    stock = models.PositiveIntegerField(default=5)
    image = models.CharField(max_length=250, blank=True)
    image_file = models.ImageField(upload_to="listings/", blank=True)
    latitude = models.FloatField()
    longitude = models.FloatField()
    pickup_start = models.DateTimeField()
    pickup_end = models.DateTimeField()
    prepared_at = models.DateTimeField(null=True, blank=True)
    buyer_notes = models.CharField(max_length=140, blank=True)
    packaging = models.CharField(max_length=500, blank=True)
    storage_notes = models.CharField(max_length=500, blank=True)
    allergens = models.CharField(max_length=500, blank=True)
    active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=(models.Q(image_file="") & ~models.Q(image="")) | (~models.Q(image_file="") & models.Q(image="")),
                name="listing_exactly_one_image_source",
            ),
        ]


class Reservation(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    listing = models.ForeignKey(Listing, on_delete=models.PROTECT)
    quantity = models.PositiveIntegerField()
    total = models.PositiveIntegerField()
    code = models.CharField(max_length=5, unique=True)
    status = models.CharField(max_length=12, default="reserved", choices=[("reserved", "Dipesan"), ("cancelled", "Dibatalkan")])
    created_at = models.DateTimeField(auto_now_add=True)
    pickup_deadline = models.DateTimeField(null=True, editable=False)
    cancellation_note = models.CharField(max_length=500, blank=True)
    cancelled_by = models.CharField(max_length=7, blank=True, choices=[("buyer", "Pembeli"), ("partner", "Mitra")])
    cancelled_at = models.DateTimeField(null=True, blank=True)

    @property
    def deadline(self):
        return self.pickup_deadline or self.listing.pickup_end

    def save(self, *args, **kwargs):
        if self._state.adding and self.pickup_deadline is None:
            self.pickup_deadline = self.listing.pickup_end
        super().save(*args, **kwargs)


class CheckoutBatch(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    key = models.UUIDField()
    fingerprint = models.CharField(max_length=64)
    reservation_ids = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "key"], name="checkout_user_key_unique")]


class ListingStockAction(models.Model):
    listing = models.ForeignKey(Listing, on_delete=models.CASCADE)
    token = models.UUIDField(unique=True)
    previous_stock = models.PositiveIntegerField()
    expires_at = models.DateTimeField()
    used = models.BooleanField(default=False)
