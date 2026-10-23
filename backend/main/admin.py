from django.contrib import admin
from .models import Profile, Listing, Reservation, Store

@admin.register(Listing)
class ListingAdmin(admin.ModelAdmin):
    list_display = ["name", "store", "owner", "stock", "active", "pickup_end"]
    list_filter = ["active"]
    search_fields = ["name", "store", "owner__username"]


admin.site.register([Profile, Reservation])


@admin.register(Store)
class StoreAdmin(admin.ModelAdmin):
    list_display = ["name", "owner", "address", "is_open"]
    search_fields = ["name", "address", "owner__username"]
    list_filter = ["is_open"]
