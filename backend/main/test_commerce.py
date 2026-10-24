import uuid
from datetime import timedelta
from unittest.mock import patch
from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from .models import CheckoutBatch, Listing, ListingStockAction, Profile, Reservation
from .test_listing_revision import create_store, listing_payload

class CommerceTests(TestCase):
    def setUp(self):
        self.partner=User.objects.create_user(username="commerce_partner")
        self.other=User.objects.create_user(username="commerce_other")
        self.buyer=User.objects.create_user(username="commerce_buyer")
        for user,role in [(self.partner,"partner"),(self.other,"partner"),(self.buyer,"buyer")]: Profile.objects.create(user=user,role=role)
        self.store=create_store(self.partner)
        self.a=self.food(self.partner,self.store,"A")
        self.b=self.food(self.partner,self.store,"B")
        self.client=APIClient();self.client.force_authenticate(self.buyer)
    def food(self,owner,store,name):
        data=listing_payload(store.pk);data.pop("store_id")
        return Listing.objects.create(owner=owner,store_profile=store,store=store.name,address=store.address,latitude=store.latitude,longitude=store.longitude,**{**data,"name":name})
    def payload(self,*items,key=None):
        return {"key":str(key or uuid.uuid4()),"items":[{"listing_id":i.pk,"quantity":1,"expected_price":i.price} for i in items]}
    def post(self,payload):return self.client.post("/api/checkout",payload,format="json")
    def test_checkout_success_replay_and_token_conflict(self):
        data=self.payload(self.a,self.b);first=self.post(data);self.assertEqual(first.status_code,201,first.data)
        self.assertEqual(len(first.data),2);self.assertNotEqual(first.data[0]["code"],first.data[1]["code"])
        replay=self.post(data);self.assertEqual(replay.status_code,200);self.assertEqual([r["id"] for r in replay.data],[r["id"] for r in first.data]);self.assertEqual(Reservation.objects.count(),2)
        self.a.refresh_from_db();self.assertEqual(self.a.stock,3)
        data["items"][0]["quantity"]=2;self.assertEqual(self.post(data).status_code,409)
    def test_stale_price_and_stock_rollback_all(self):
        for changes in [{"stock":0},{"price":6000},{"active":False},{"pickup_end":timezone.now()-timedelta(seconds=1)}]:
            data=self.payload(self.a,self.b);Listing.objects.filter(pk=self.b.pk).update(**changes)
            self.assertEqual(self.post(data).status_code,409);self.a.refresh_from_db();self.assertEqual(self.a.stock,4);self.assertEqual(Reservation.objects.count(),0);self.assertFalse(CheckoutBatch.objects.exists())
            Listing.objects.filter(pk=self.b.pk).update(stock=4,price=5000,active=True,pickup_end=timezone.now()+timedelta(hours=4))
    def test_free_policy_applies_within_transaction(self):
        Listing.objects.all().update(price=0);self.a.refresh_from_db();self.b.refresh_from_db()
        self.assertEqual(self.post(self.payload(self.a,self.b)).status_code,409);self.assertEqual(Reservation.objects.count(),0)
        self.assertEqual(self.post(self.payload(self.a)).status_code,201)
        self.assertEqual(self.post(self.payload(self.b)).status_code,409)
    def test_input_roles_and_closed_store(self):
        for changes in [{"key":"bad"},{"items":[]},{"items":[{"listing_id":self.a.pk,"quantity":True,"expected_price":5000}]},{"items":self.payload(self.a,self.a)["items"]}]:self.assertEqual(self.post({**self.payload(self.a),**changes}).status_code,400)
        self.store.is_open=False;self.store.save();self.assertEqual(self.post(self.payload(self.a)).status_code,409)
        self.client.force_authenticate(self.partner);self.assertEqual(self.post(self.payload(self.a)).status_code,403)
        self.client.force_authenticate(None);self.assertEqual(self.post(self.payload(self.a)).status_code,403)
    def test_dashboard_isolated_and_periods(self):
        # Keep the pickup within today's WIB window, even when tests run at night.
        now = timezone.localtime().replace(hour=12, minute=0, second=0, microsecond=0)
        with patch("django.utils.timezone.now", return_value=now):
            self.a.pickup_end = now + timedelta(hours=1)
            self.a.save(update_fields=["pickup_end"])
            foreign=self.food(self.other,create_store(self.other),"Private")
            self.assertEqual(self.post(self.payload(self.a)).status_code,201)
            self.client.force_authenticate(self.partner)
            for period in ["today","week","month","year"]:
                result=self.client.get(f"/api/partner/dashboard?period={period}");self.assertEqual(result.status_code,200);self.assertEqual(result.data["booked_portions"],1);self.assertEqual(result.data["simulated_total"],5000);self.assertNotIn(foreign.pk,[r["id"] for r in result.data["listings"]]);self.assertEqual(len(result.data["pickups"]),1)
            self.assertEqual(self.client.get("/api/partner/dashboard?period=bad").status_code,400)
            self.client.force_authenticate(self.other);self.assertEqual(self.client.get("/api/partner/dashboard").data["orders"],[])
            self.client.force_authenticate(self.buyer);self.assertEqual(self.client.get("/api/partner/dashboard").status_code,403)
    def sold(self):
        self.client.force_authenticate(self.partner);result=self.client.post(f"/api/partner/listings/{self.a.pk}/sold-out",{},format="json");self.assertEqual(result.status_code,200,result.data);return result.data["undo_token"]
    def undo(self,token):return self.client.post(f"/api/partner/listings/{self.a.pk}/undo-sold-out",{"token":token},format="json")
    def test_sold_out_undo_once_and_ownership(self):
        token=self.sold();self.a.refresh_from_db();self.assertEqual(self.a.stock,0)
        self.client.force_authenticate(self.other);self.assertEqual(self.undo(token).status_code,404)
        self.client.force_authenticate(self.partner);self.assertEqual(self.undo(token).status_code,200);self.a.refresh_from_db();self.assertEqual(self.a.stock,4);self.assertEqual(self.undo(token).status_code,409)
    def test_expiry_and_manual_patch_invalidate_undo(self):
        token=self.sold();ListingStockAction.objects.update(expires_at=timezone.now()-timedelta(seconds=1));self.assertEqual(self.undo(token).status_code,409)
        Listing.objects.filter(pk=self.a.pk).update(stock=4);token=self.sold()
        self.assertEqual(self.client.patch(f"/api/partner/listings/{self.a.pk}",{"stock":2},format="json").status_code,200);self.assertEqual(self.undo(token).status_code,409)
    def test_cancellation_invalidates_undo_without_losing_stock(self):
        order=self.post(self.payload(self.a)).data[0];token=self.sold();self.client.force_authenticate(self.buyer)
        self.assertEqual(self.client.post(f'/api/reservations/{order["id"]}/cancel').status_code,200)
        self.client.force_authenticate(self.partner);self.assertEqual(self.undo(token).status_code,409);self.a.refresh_from_db();self.assertEqual(self.a.stock,1)
