import math
from urllib.parse import urlsplit

from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework import serializers
from .models import Listing, Reservation, Store
from .geocoding import normalize_address, validate_location_token


class UserSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="first_name", max_length=150)
    role = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "name", "email", "role"]
        read_only_fields = ["id", "username", "role"]

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


class ListingSerializer(serializers.ModelSerializer):
    class Meta:
        model = Listing
        fields = ["id", "name", "store", "category", "description", "address", "price", "original_price", "stock", "image", "latitude", "longitude", "pickup_start", "pickup_end", "active"]


class PartnerListingSerializer(ListingSerializer):
    image = serializers.URLField(max_length=250)
    category = serializers.ChoiceField(choices=["Makanan berat", "Roti & kue", "Camilan", "Sehat"])
    latitude = serializers.FloatField(min_value=-90, max_value=90)
    longitude = serializers.FloatField(min_value=-180, max_value=180)
    price = serializers.IntegerField(min_value=0)
    original_price = serializers.IntegerField(min_value=0)
    stock = serializers.IntegerField(min_value=0)

    class Meta(ListingSerializer.Meta):
        read_only_fields = ["id"]

    def validate_image(self, value):
        if urlsplit(value).scheme.lower() not in ["http", "https"]:
            raise serializers.ValidationError("URL foto harus menggunakan HTTP atau HTTPS.")
        return value

    def validate_latitude(self, value):
        if not math.isfinite(value):
            raise serializers.ValidationError("Latitude harus berupa angka yang valid.")
        return value

    def validate_longitude(self, value):
        if not math.isfinite(value):
            raise serializers.ValidationError("Longitude harus berupa angka yang valid.")
        return value

    def validate(self, attrs):
        def value(field):
            return attrs.get(field, getattr(self.instance, field, None))

        errors = {}
        if value("price") > value("original_price"):
            errors["price"] = "Harga jual tidak boleh melebihi harga normal."
        if value("pickup_end") <= value("pickup_start"):
            errors["pickup_end"] = "Waktu akhir harus setelah waktu mulai."
        if (self.instance is None or {"pickup_start", "pickup_end"}.intersection(attrs)) and value("pickup_end") <= timezone.now():
            errors["pickup_end"] = "Batas pengambilan harus di masa depan."
        if self.instance and self.instance.reservation_set.filter(status="reserved").exists():
            for field in ["price", "address", "latitude", "longitude", "pickup_start", "pickup_end"]:
                if field in attrs and attrs[field] != getattr(self.instance, field):
                    errors[field] = "Tidak dapat diubah selama ada pesanan aktif."
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
    listing = ListingSerializer(read_only=True)

    class Meta:
        model = Reservation
        fields = ["id", "listing", "quantity", "total", "code", "status", "created_at"]


class GeocodeSerializer(serializers.Serializer):
    address = serializers.CharField(min_length=5, max_length=250)

    def validate_address(self, value):
        value = normalize_address(value)
        if len(value) < 5:
            raise serializers.ValidationError("Tulis alamat toko yang lengkap.")
        return value


class StoreSerializer(serializers.ModelSerializer):
    address = serializers.CharField(min_length=5, max_length=250)
    latitude = serializers.FloatField(min_value=-90, max_value=90)
    longitude = serializers.FloatField(min_value=-180, max_value=180)
    geocode_token = serializers.CharField(write_only=True, required=False, max_length=2000)
    location_confirmed = serializers.BooleanField(write_only=True, required=False)

    class Meta:
        model = Store
        fields = ["id", "name", "description", "address", "opening_time", "closing_time", "latitude", "longitude", "is_open", "created_at", "updated_at", "geocode_token", "location_confirmed"]
        read_only_fields = ["id", "created_at", "updated_at"]

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
