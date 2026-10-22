from django.contrib import admin
from .models import Profile, Listing, Reservation, Store

admin.site.register([Profile, Listing, Reservation])


@admin.register(Store)
class StoreAdmin(admin.ModelAdmin):
    list_display = ["name", "owner", "address", "is_open"]
    search_fields = ["name", "address", "owner__username"]
    list_filter = ["is_open"]
