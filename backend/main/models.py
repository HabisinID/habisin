from django.conf import settings
from django.db import models


class Book(models.Model):
    title = models.CharField(max_length=255)
    author = models.CharField(max_length=255)
    publish_date = models.DateField()

    def __str__(self):
        return self.title


class Profile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile")
    role = models.CharField(max_length=10, choices=[("buyer", "Pembeli"), ("partner", "Mitra")], default="buyer")


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
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    listing = models.ForeignKey(Listing, on_delete=models.PROTECT)
    quantity = models.PositiveIntegerField()
    total = models.PositiveIntegerField()
    code = models.CharField(max_length=5, unique=True)
    status = models.CharField(max_length=12, default="reserved", choices=[("reserved", "Dipesan"), ("cancelled", "Dibatalkan")])
    created_at = models.DateTimeField(auto_now_add=True)
