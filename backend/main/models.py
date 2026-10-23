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
    owner = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="store")
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
    name = models.CharField(max_length=160)
    store = models.CharField(max_length=120)
    category = models.CharField(max_length=30)
    description = models.TextField()
    address = models.CharField(max_length=250)
    price = models.PositiveIntegerField()
    original_price = models.PositiveIntegerField()
    stock = models.PositiveIntegerField(default=5)
    image = models.CharField(max_length=250)
    latitude = models.FloatField()
    longitude = models.FloatField()
    pickup_start = models.DateTimeField()
    pickup_end = models.DateTimeField()
    active = models.BooleanField(default=True)


class Reservation(models.Model):
    # Stock is held while an order is pending or paid; cancelling releases it.
    ACTIVE_STATUSES = ["pending", "paid"]
    # A surplus listing is shared: one order may take at most this many portions.
    MAX_QUANTITY = 4
    NOTE_MAX_LENGTH = 140
    # Codes are typed by a cashier, so look-alikes (B/8, S/5, Z/2, G/6, O/0, I/1/L, Q) are left out.
    CODE_ALPHABET = "ACDEFHJKMNPRTUVWXY3479"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    listing = models.ForeignKey(Listing, on_delete=models.PROTECT)
    quantity = models.PositiveIntegerField()
    total = models.PositiveIntegerField()
    code = models.CharField(max_length=5, unique=True)
    note = models.CharField(max_length=NOTE_MAX_LENGTH, blank=True)
    status = models.CharField(max_length=12, default="pending", choices=[("pending", "Menunggu pembayaran"), ("paid", "Lunas"), ("picked_up", "Sudah diambil"), ("cancelled", "Dibatalkan")])
    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    picked_up_at = models.DateTimeField(null=True, blank=True)
