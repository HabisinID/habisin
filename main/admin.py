from django.contrib import admin
from .models import Profile, Listing, Reservation

admin.site.register([Profile, Listing, Reservation])
