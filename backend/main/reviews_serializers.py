from rest_framework import serializers

from .models import Complaint, Reservation, Review


class ReviewWriteSerializer(serializers.ModelSerializer):
    reservation_id = serializers.IntegerField(write_only=True, min_value=1, required=False)

    class Meta:
        model = Review
        fields = ["id", "reservation_id", "rating", "comment", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_rating(self, value):
        if type(value) is not int or not 1 <= value <= 5:
            raise serializers.ValidationError("Pilih rating 1 sampai 5 bintang.")
        return value

    def validate(self, attrs):
        user = self.context["request"].user
        if user.is_staff or getattr(getattr(user, "profile", None), "role", None) != "buyer":
            raise serializers.ValidationError("Fitur ulasan hanya tersedia untuk akun pembeli.")
        reservation_id = attrs.get("reservation_id")
        if self.instance is not None and reservation_id is not None:
            raise serializers.ValidationError({"reservation_id": "Pesanan ulasan tidak dapat diubah."})
        if reservation_id is not None:
            reservation = Reservation.objects.select_related("listing__store_profile").filter(
                pk=reservation_id, user=self.context["request"].user
            ).first()
            if reservation is None:
                raise serializers.ValidationError({"reservation_id": "Pesanan tidak ditemukan."})
            if reservation.status != "picked_up":
                raise serializers.ValidationError({"reservation_id": "Ulasan hanya dapat diberikan setelah makanan diambil."})
            store = reservation.listing.store_profile
            if store is None:
                raise serializers.ValidationError({"reservation_id": "Pesanan ini belum terhubung ke profil toko."})
            if self.instance is None and Review.objects.filter(
                user=user, listing=reservation.listing
            ).exists():
                raise serializers.ValidationError({
                    "reservation_id": "Kamu sudah mengulas makanan ini. Ubah ulasan yang sudah ada.",
                })
            attrs["reservation"] = reservation
            attrs["listing"] = reservation.listing
            attrs["store"] = store
            attrs["user"] = reservation.user
        elif self.instance is None:
            raise serializers.ValidationError({"reservation_id": "Pilih pesanan yang sudah diambil."})
        return attrs

    def create(self, validated_data):
        validated_data.pop("reservation_id", None)
        return super().create(validated_data)


class ReviewPublicSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.first_name", read_only=True)
    listing_id = serializers.IntegerField(read_only=True)
    listing_name = serializers.CharField(source="listing.name", read_only=True)

    class Meta:
        model = Review
        fields = ["id", "listing_id", "listing_name", "user_name", "rating", "comment", "created_at", "updated_at"]


class ReviewMineSerializer(serializers.ModelSerializer):
    reservation_id = serializers.IntegerField(read_only=True, allow_null=True)
    listing_id = serializers.IntegerField(read_only=True)
    listing_name = serializers.CharField(source="listing.name", read_only=True)
    product_image = serializers.SerializerMethodField()
    store_name = serializers.CharField(source="store.name", read_only=True)

    def get_product_image(self, review):
        return review.listing.image_file.url if review.listing.image_file else review.listing.image

    class Meta:
        model = Review
        fields = ["id", "reservation_id", "listing_id", "listing_name", "product_image", "store_name", "rating", "comment", "created_at", "updated_at"]


class ComplaintWriteSerializer(serializers.ModelSerializer):
    reservation_id = serializers.IntegerField(write_only=True, min_value=1)

    class Meta:
        model = Complaint
        fields = ["id", "reservation_id", "reason", "description", "status", "created_at"]
        read_only_fields = ["id", "status", "created_at"]

    def get_fields(self):
        fields = super().get_fields()
        fields["reason"].required = True
        return fields

    def validate_description(self, value):
        value = value.strip()
        if len(value) < 10:
            raise serializers.ValidationError("Jelaskan masalah makanan minimal 10 karakter.")
        return value

    def validate(self, attrs):
        user = self.context["request"].user
        if user.is_staff or getattr(getattr(user, "profile", None), "role", None) != "buyer":
            raise serializers.ValidationError("Laporan hanya tersedia untuk akun pembeli.")
        reservation_id = attrs.get("reservation_id")
        if reservation_id is not None:
            reservation = Reservation.objects.select_related("listing__store_profile").filter(
                pk=reservation_id, user=self.context["request"].user
            ).first()
            if reservation is None:
                raise serializers.ValidationError({"reservation_id": "Pesanan tidak ditemukan."})
            if reservation.status not in ["paid", "picked_up"]:
                raise serializers.ValidationError({"reservation_id": "Laporan hanya dapat dibuat untuk pesanan yang masih berlaku atau sudah diambil."})
            store = reservation.listing.store_profile
            if store is None:
                raise serializers.ValidationError({"reservation_id": "Pesanan ini belum terhubung ke profil toko."})
            attrs["reservation"] = reservation
            attrs["store"] = store
            attrs["user"] = reservation.user
        return attrs

    def create(self, validated_data):
        validated_data.pop("reservation_id", None)
        return super().create(validated_data)


class ComplaintMineSerializer(serializers.ModelSerializer):
    reservation_id = serializers.IntegerField(read_only=True)
    store_name = serializers.CharField(source="store.name", read_only=True)

    class Meta:
        model = Complaint
        fields = ["id", "reservation_id", "store_name", "reason", "description", "status", "created_at"]
