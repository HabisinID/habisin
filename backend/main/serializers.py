from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from .models import Listing, Reservation


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
        fields = ["id", "listing", "quantity", "total", "code", "status", "created_at"]
