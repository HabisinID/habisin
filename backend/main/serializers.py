import math

from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
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
        fields = "__all__"


class ReservationSerializer(serializers.ModelSerializer):
    listing = ListingSerializer(read_only=True)

    class Meta:
        model = Reservation
        fields = ["id", "listing", "quantity", "total", "code", "note", "status", "created_at", "paid_at", "picked_up_at"]


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
