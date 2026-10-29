import math
from urllib.parse import urlsplit

from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from django.db import transaction
from rest_framework import serializers
from .models import Listing, Reservation, Store, Profile, PartnerApproval, AdminModerationLog
from .geocoding import normalize_address, validate_location_token
from .listing_services import ListingConflict
from .listing_media import normalize_listing_image


class ProfilePictureField(serializers.ImageField):
    def to_internal_value(self, data):
        if data == "" or data is None:
            return ""
        from .profile_media import normalize_profile_picture
        return normalize_profile_picture(data)

    def to_representation(self, value):
        return value.url if value else None


class UserSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="first_name", max_length=150)
    role = serializers.SerializerMethodField()
    profile_picture = ProfilePictureField(source="profile.profile_picture", required=False, allow_null=True)

    class Meta:
        model = User
        fields = ["id", "username", "name", "email", "role", "profile_picture"]
        read_only_fields = ["id", "username", "role"]

    def update(self, instance, validated_data):
        profile_data = validated_data.pop("profile", None)
        with transaction.atomic():
            instance = super().update(instance, validated_data)
            if profile_data is not None:
                profile, _ = Profile.objects.get_or_create(user=instance)
                profile.profile_picture = profile_data["profile_picture"]
                profile.save(update_fields=["profile_picture"])
                instance.profile = profile
        return instance

    def get_role(self, user):
        return "admin" if user.is_staff else getattr(getattr(user, "profile", None), "role", "buyer")


class RegisterSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=150)
    username = serializers.RegexField(r"^[a-zA-Z0-9_]{3,30}$", max_length=30)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, max_length=128)
    role = serializers.ChoiceField(choices=["buyer", "partner"], default="buyer")

    def validate_username(self, value):
        value = value.lower()
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("Username sudah digunakan.")
        return value

    def validate(self, attrs):
        user = User(username=attrs["username"], email=attrs["email"], first_name=attrs["name"])
        try:
            validate_password(attrs["password"], user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": exc.messages})
        return attrs


class StoreSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Store
        fields = ["id", "name", "address", "latitude", "longitude", "is_open", "landmark", "profile_picture"]


class ListingSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()
    image_source = serializers.SerializerMethodField()

    def get_image(self, item):
        return item.image_file.url if item.image_file else item.image

    def get_image_source(self, item):
        return "upload" if item.image_file else "url"

    store_id = serializers.IntegerField(source="store_profile_id", read_only=True, allow_null=True)
    store_summary = StoreSummarySerializer(source="store_profile", read_only=True, allow_null=True)

    class Meta:
        model = Listing
        fields = ["id", "name", "store", "category", "description", "address", "price", "original_price", "stock", "image", "latitude", "longitude", "pickup_start", "pickup_end", "active", "store_id", "store_summary", "image_source", "prepared_at", "packaging", "storage_notes", "allergens", "buyer_notes", "moderated_at", "moderation_reason", "deleted_at"]


class PartnerListingSerializer(ListingSerializer):
    prepared_at = serializers.DateTimeField(required=True, allow_null=False)
    active = serializers.BooleanField(required=False, default=True)
    store_id = serializers.IntegerField(write_only=True, required=False, min_value=1)
    image = serializers.URLField(max_length=250, required=False)
    image_file = serializers.FileField(write_only=True, required=False)
    image_source = serializers.ChoiceField(choices=["url", "upload"], write_only=True, required=False)
    category = serializers.ChoiceField(choices=["Makanan berat", "Roti & kue", "Camilan", "Sehat", "Minuman", "Katering", "Kue basah", "Sayur & buah", "Lainnya"])
    price = serializers.IntegerField(min_value=0)
    original_price = serializers.IntegerField(min_value=0)
    stock = serializers.IntegerField(min_value=0)

    class Meta(ListingSerializer.Meta):
        fields = ListingSerializer.Meta.fields + ["image_file"]
        read_only_fields = ["id", "store", "address", "latitude", "longitude", "store_summary", "moderated_at", "moderation_reason", "deleted_at"]

    def validate_name(self, value):
        if len(value) > 60 and (self.instance is None or value != self.instance.name):
            raise serializers.ValidationError("Nama makanan maksimal 60 karakter.")
        return value

    def validate_image_file(self, value):
        return normalize_listing_image(value)

    def validate_image(self, value):
        if urlsplit(value).scheme.lower() not in ["http", "https"]:
            raise serializers.ValidationError("URL foto harus menggunakan HTTP atau HTTPS.")
        return value

    def validate(self, attrs):
        def value(field):
            return attrs.get(field, getattr(self.instance, field, None))

        errors = {field: "Ditentukan oleh toko. Gunakan pilihan toko." for field in ["store", "address", "latitude", "longitude"] if field in self.initial_data}
        mode = attrs.pop("image_source", None)
        has_url, has_file = "image" in attrs, "image_file" in attrs
        if has_url and has_file:
            errors["image"] = "Pilih satu sumber foto: upload atau URL."
        elif has_file:
            if mode not in [None, "upload"]:
                errors["image"] = "Sumber foto tidak sesuai dengan file upload."
            attrs["image"] = ""
        elif has_url:
            if mode not in [None, "url"]:
                errors["image"] = "Sumber foto tidak sesuai dengan URL."
            attrs["image_file"] = ""
        elif mode is not None or self.instance is None or not (self.instance.image or self.instance.image_file):
            errors["image"] = "Foto wajib. Unggah foto atau masukkan URL."
        store_id = attrs.pop("store_id", None)
        instance = self.instance
        if store_id is None and (instance is None or instance.store_profile_id is None):
            errors["store_id"] = "Pilih toko yang menjual makanan ini."
        target = None
        if store_id is not None:
            target = Store.objects.filter(pk=store_id, owner=self.context["request"].user).first()
            if target is None:
                errors["store_id"] = "Toko tidak tersedia untuk akun ini. Muat ulang pilihan toko."
            elif target.closed_at or ((instance is None or instance.store_profile_id != target.pk) and not target.is_open):
                errors["store_id"] = "Toko ditutup sementara. Pilih toko yang aktif."
        else:
            target = instance.store_profile if instance and instance.store_profile_id else None
        if target and attrs.get("active") is True and not target.is_open:
            errors["store_id"] = "Buka toko sebelum mengaktifkan listing."
        if target and (instance is None or store_id is not None):
            snapshot = dict(store=target.name, address=target.address, latitude=target.latitude, longitude=target.longitude)
            if instance and instance.reservation_set.filter(status__in=Reservation.ACTIVE_STATUSES).exists() and instance.store_profile_id != target.pk:
                same_legacy_location = instance.store_profile_id is None and all(getattr(instance, key) == val for key, val in snapshot.items())
                if not same_legacy_location:
                    raise ListingConflict("Toko tidak dapat diganti selama ada pesanan aktif.")
            attrs.update(snapshot, store_profile=target)
        prices_changed = self.instance is None or any(field in attrs and attrs[field] != getattr(self.instance, field) for field in ["price", "original_price"])
        if prices_changed and value("price") > 0 and value("price") >= value("original_price"):
            errors["price"] = "Harga sekarang harus lebih rendah dari harga normal."
        if value("pickup_end") <= value("pickup_start"):
            errors["pickup_end"] = "Waktu akhir harus setelah waktu mulai."
        if (self.instance is None or {"pickup_start", "pickup_end"}.intersection(attrs)) and value("pickup_end") <= timezone.now():
            errors["pickup_end"] = "Batas pengambilan harus di masa depan."
        prepared = value("prepared_at")
        if prepared is not None and ("prepared_at" in attrs or "pickup_end" in attrs):
            if prepared > timezone.now():
                errors["prepared_at"] = "Waktu dibuat tidak boleh di masa depan."
            elif prepared > value("pickup_end"):
                errors["prepared_at"] = "Waktu dibuat tidak boleh setelah batas pengambilan."
        if self.instance and self.instance.reservation_set.filter(status__in=Reservation.ACTIVE_STATUSES).exists():
            for field in ["price", "address", "latitude", "longitude", "pickup_start", "pickup_end"]:
                if field in attrs and attrs[field] != getattr(self.instance, field):
                    errors[field] = "Tidak dapat diubah selama ada pesanan aktif."
        if attrs.get("active") is True and self.instance and self.instance.taken_down:
            errors["active"] = "Listing ini diturunkan admin dan tidak dapat diaktifkan."
        if errors:
            raise serializers.ValidationError(errors)
        return attrs

    def update(self, instance, validated_data):
        for field, value in validated_data.items():
            setattr(instance, field, value)
        if validated_data:
            instance.save(update_fields=list(validated_data))
        return instance


class ReservationSerializer(serializers.ModelSerializer):
    listing = serializers.SerializerMethodField()

    def get_listing(self, item):
        data = dict(ListingSerializer(item.listing).data)
        data["pickup_end"] = item.deadline.isoformat()
        return data

    pay_before = serializers.DateTimeField(read_only=True)
    cancel_until = serializers.DateTimeField(read_only=True)

    class Meta:
        model = Reservation
        fields = ["id", "listing", "quantity", "total", "code", "note", "status", "created_at", "pay_before", "cancel_until", "paid_at", "picked_up_at", "cancellation_note", "cancelled_by", "cancelled_at"]


class PartnerOrderSerializer(ReservationSerializer):
    buyer_name = serializers.SerializerMethodField()

    def get_buyer_name(self, item):
        return item.user.get_full_name() or item.user.username

    class Meta(ReservationSerializer.Meta):
        fields = [field for field in ReservationSerializer.Meta.fields if field != "code"] + ["buyer_name"]


class PartnerListingReadSerializer(ListingSerializer):
    has_active_orders = serializers.SerializerMethodField()

    def get_has_active_orders(self, item):
        return item.reservation_set.filter(status__in=Reservation.ACTIVE_STATUSES).exists()

    class Meta(ListingSerializer.Meta):
        fields = ListingSerializer.Meta.fields + ["has_active_orders"]


class StrictIntegerField(serializers.IntegerField):
    # DRF accepts "2" and True as integers; orders only accept real JSON numbers.
    def to_internal_value(self, data):
        if type(data) is not int:
            self.fail("invalid")
        return super().to_internal_value(data)


class StrictCharField(serializers.CharField):
    # DRF converts numbers to strings; a note must be sent as text.
    def to_internal_value(self, data):
        if not isinstance(data, str):
            self.fail("invalid")
        return super().to_internal_value(data)


QUANTITY_ERRORS = {"invalid": "Jumlah porsi harus berupa angka bulat.", "min_value": f"Pilih 1–{Reservation.MAX_QUANTITY} porsi.", "max_value": f"Pilih 1–{Reservation.MAX_QUANTITY} porsi."}


class ReservationUpdateSerializer(serializers.Serializer):
    quantity = StrictIntegerField(min_value=1, max_value=Reservation.MAX_QUANTITY, required=False, error_messages=QUANTITY_ERRORS)
    note = StrictCharField(max_length=Reservation.NOTE_MAX_LENGTH, allow_blank=True, required=False, error_messages={"invalid": "Catatan harus berupa teks.", "max_length": f"Catatan maksimal {Reservation.NOTE_MAX_LENGTH} karakter."})


class ReservationCreateSerializer(ReservationUpdateSerializer):
    listing_id = StrictIntegerField(error_messages={"invalid": "Pilih produk yang valid."})
    quantity = StrictIntegerField(min_value=1, max_value=Reservation.MAX_QUANTITY, default=1, error_messages=QUANTITY_ERRORS)


class GeocodeSerializer(serializers.Serializer):
    address = serializers.CharField(min_length=5, max_length=250)

    def validate_address(self, value):
        value = normalize_address(value)
        if len(value) < 5:
            raise serializers.ValidationError("Tulis alamat toko yang lengkap.")
        return value


class StoreSerializer(serializers.ModelSerializer):
    profile_picture = ProfilePictureField(required=False, allow_null=True)
    address = serializers.CharField(min_length=5, max_length=250)
    latitude = serializers.FloatField(min_value=-90, max_value=90)
    longitude = serializers.FloatField(min_value=-180, max_value=180)
    geocode_token = serializers.CharField(write_only=True, required=False, max_length=2000)
    location_confirmed = serializers.BooleanField(write_only=True, required=False)

    class Meta:
        model = Store
        fields = ["id", "name", "description", "address", "opening_time", "closing_time", "latitude", "longitude", "is_open", "created_at", "updated_at", "geocode_token", "location_confirmed", "category", "neighborhood", "city", "landmark", "weekly_hours", "closed_at", "profile_picture"]
        read_only_fields = ["id", "created_at", "updated_at", "closed_at"]

    def validate_name(self, value):
        if len(value) > 60 and (self.instance is None or value != self.instance.name):
            raise serializers.ValidationError("Nama toko maksimal 60 karakter.")
        return value

    def validate_description(self, value):
        if len(value) > 280 and (self.instance is None or value != self.instance.description):
            raise serializers.ValidationError("Deskripsi toko maksimal 280 karakter.")
        return value

    def validate_weekly_hours(self, value):
        from .store_schedule import validate_weekly_hours
        return validate_weekly_hours(value)

    def validate_category(self, value):
        if value and value not in ["Roti & kue", "Nasi & lauk", "Minuman", "Camilan", "Katering", "Lainnya"]:
            raise serializers.ValidationError("Kategori toko tidak valid.")
        return value

    def validate_address(self, value):
        return GeocodeSerializer().validate_address(value)

    def validate(self, attrs):
        for field in ["latitude", "longitude"]:
            if field in attrs and not math.isfinite(attrs[field]):
                raise serializers.ValidationError({field: "Koordinat tidak valid."})
        instance = self.instance
        opening = attrs.get("opening_time", instance.opening_time if instance else None)
        closing = attrs.get("closing_time", instance.closing_time if instance else None)
        if opening == closing:
            raise serializers.ValidationError({"closing_time": "Jam tutup harus berbeda dari jam buka. Jam tutup lebih awal berarti hari berikutnya."})
        address_changed = instance is None or attrs.get("address", instance.address) != instance.address
        coordinates_changed = instance is None or any(field in attrs and attrs[field] != getattr(instance, field) for field in ["latitude", "longitude"])
        confirmed = attrs.pop("location_confirmed", False)
        token = attrs.pop("geocode_token", None)
        if address_changed:
            validate_location_token(token, attrs["address"], self.context["request"].user.pk)
            if "latitude" not in attrs or "longitude" not in attrs:
                raise serializers.ValidationError({"latitude": "Pilih ulang posisi pin untuk alamat baru."})
        if (address_changed or coordinates_changed) and not confirmed:
            raise serializers.ValidationError({"location_confirmed": "Konfirmasi posisi pin toko sebelum menyimpan."})
        return attrs

class PartnerApprovalSerializer(serializers.ModelSerializer):
    username = serializers.ReadOnlyField(source="user.username")

    class Meta:
        model = PartnerApproval
        fields = ["id", "user", "username", "status", "requested_at", "reviewed_at"]
        read_only_fields = ["id", "user", "requested_at"]


class ModerationLogSerializer(serializers.ModelSerializer):
    admin_username = serializers.ReadOnlyField(source="admin_user.username")

    class Meta:
        model = AdminModerationLog
        fields = ["id", "admin_user", "admin_username", "action_type", "target_name", "reason", "created_at"]
        read_only_fields = ["id", "admin_user", "created_at"]

class AdminListingSerializer(ListingSerializer):
    owner_username = serializers.ReadOnlyField(source="owner.username")

    class Meta(ListingSerializer.Meta):
        fields = ListingSerializer.Meta.fields + ["taken_down", "takedown_reason", "owner_username"]
        read_only_fields = ["taken_down", "takedown_reason"]