from collections import Counter
from datetime import timedelta

from django.conf import settings
from django.db import models, transaction
from django.db.models import F, Q, Sum
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

    category = models.CharField(max_length=30, blank=True)
    neighborhood = models.CharField(max_length=120, blank=True)
    city = models.CharField(max_length=80, blank=True, default="Depok")
    landmark = models.CharField(max_length=250, blank=True)
    weekly_hours = models.JSONField(default=list, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)

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

    moderated_at = models.DateTimeField(null=True, blank=True)
    moderation_reason = models.CharField(max_length=500, blank=True)
    moderated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="moderated_listings")
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=(models.Q(image_file="") & ~models.Q(image="")) | (~models.Q(image_file="") & models.Q(image="")),
                name="listing_exactly_one_image_source",
            ),
        ]


class ModerationLog(models.Model):
    listing = models.ForeignKey(Listing, null=True, on_delete=models.SET_NULL, related_name="moderation_logs")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="moderation_logs")
    target_name = models.CharField(max_length=160)
    store_name = models.CharField(max_length=120)
    action = models.CharField(max_length=12, choices=[("take_down", "Turunkan"), ("restore", "Pulihkan")])
    reason = models.CharField(max_length=500)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]


class Reservation(models.Model):
    # Stock is held while an order is pending or paid; cancelling releases it.
    ACTIVE_STATUSES = ["pending", "paid"]
    FINISHED_STATUSES = ["picked_up", "cancelled", "expired"]
    # Unpaid orders hold stock only briefly, so nobody can lock a listing by not paying.
    PAYMENT_WINDOW = timedelta(minutes=5)
    # Late cancellations leave the store no time to sell the portions again.
    CANCEL_CUTOFF = timedelta(minutes=30)
    # Donations are shared fairly: one buyer may claim this many free portions per day.
    FREE_DAILY_LIMIT = 2
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
    status = models.CharField(max_length=12, default="pending", choices=[("pending", "Menunggu pembayaran"), ("paid", "Lunas"), ("picked_up", "Sudah diambil"), ("cancelled", "Dibatalkan"), ("expired", "Kedaluwarsa")])
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
            self.pickup_deadline = self.deadline
        super().save(*args, **kwargs)


    paid_at = models.DateTimeField(null=True, blank=True)
    picked_up_at = models.DateTimeField(null=True, blank=True)

    @property
    def pay_before(self):
        return min(self.created_at + self.PAYMENT_WINDOW, self.deadline)

    @property
    def cancel_until(self):
        return self.deadline - self.CANCEL_CUTOFF

    @classmethod
    def free_portions_today(cls, user, exclude=None):
        """Free portions the user claimed since local midnight, ignoring cancelled or expired claims."""
        midnight = timezone.localtime().replace(hour=0, minute=0, second=0, microsecond=0)
        claims = cls.objects.filter(user=user, total=0, created_at__gte=midnight).exclude(status__in=["cancelled", "expired"])
        if exclude is not None:
            claims = claims.exclude(pk=exclude.pk)
        return claims.aggregate(total=Sum("quantity"))["total"] or 0

    @classmethod
    def expire_overdue(cls):
        """Expire unpaid orders past the payment window and active orders past pickup.

        PWS has no scheduler, so callers run this before reading orders or stock.
        """
        now = timezone.now()
        from .listing_services import lock_stores
        from django.db.models.functions import Coalesce
        overdue = cls.objects.annotate(_deadline=Coalesce("pickup_deadline", "listing__pickup_end")).filter(
            Q(status="pending", created_at__lte=now - cls.PAYMENT_WINDOW)
            | Q(status__in=cls.ACTIVE_STATUSES, _deadline__lte=now)
        )
        with transaction.atomic():
            listing_ids = list(overdue.values_list("listing_id", flat=True).distinct())
            lock_stores(Listing.objects.filter(pk__in=listing_ids).values_list("store_profile_id", flat=True))
            list(Listing.objects.select_for_update().filter(pk__in=listing_ids).order_by("pk"))
            rows = list(overdue.filter(listing_id__in=listing_ids).select_for_update().order_by("pk").values_list("pk", "listing_id", "quantity"))
            if not rows:
                return
            cls.objects.filter(pk__in=[pk for pk, _, _ in rows]).update(status="expired")
            released = Counter()
            for _, listing_id, quantity in rows:
                released[listing_id] += quantity
            ListingStockAction.objects.filter(listing_id__in=released, used=False).update(used=True)
            for listing_id, quantity in released.items():
                Listing.objects.filter(pk=listing_id).update(stock=F("stock") + quantity)


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
