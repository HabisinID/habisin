"""Integration of main orders with module 3 listing locks and stock undo."""
from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from .models import Listing, Reservation
from . import test_commerce


class ReservationLifecycleTests(TestCase):
    setUp = test_commerce.CommerceTests.setUp
    food = test_commerce.CommerceTests.food

    def book(self, quantity=1):
        self.client.force_authenticate(self.buyer)
        result = self.client.post('/api/reservations', {'listing_id': self.a.pk, 'quantity': quantity}, format='json')
        self.assertEqual(result.status_code, 201, result.data)
        self.order = Reservation.objects.get(pk=result.data['id'])
        self.client.force_authenticate(self.partner)
        return f'/api/partner/reservations/{self.order.pk}/cancel'

    def test_partner_cancellation_is_deferred_for_every_role(self):
        path = self.book()
        for user in [self.partner, self.other, self.buyer, None]:
            self.client.force_authenticate(user)
            self.assertEqual(self.client.post(path, {'reason':'Tidak tersedia'}, format='json').status_code, 404)
        self.a.refresh_from_db()
        self.assertEqual(self.a.stock, 3)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, 'pending')

    def test_expired_archived_unlocks_edit_and_never_revives(self):
        self.book()
        path = f'/api/partner/listings/{self.a.pk}'
        self.assertEqual(self.client.patch(path, {'price':4000}, format='json').status_code, 400)
        deadline = timezone.now()-timedelta(seconds=1)
        Reservation.objects.filter(pk=self.order.pk).update(pickup_deadline=deadline)
        response = self.client.get('/api/partner/dashboard').data
        self.assertEqual(response['pickups'], [])
        self.assertEqual(response['orders'][0]['status'], 'expired')
        changed=self.client.patch(path, {'price':4000,'pickup_end':(timezone.now()+timedelta(hours=8)).isoformat()}, format='json')
        self.assertEqual(changed.status_code, 200, changed.data)
        self.client.force_authenticate(self.buyer)
        archived=self.client.get('/api/reservations').data[0]
        self.assertEqual(archived['status'], 'expired')
        self.assertEqual(archived['listing']['pickup_end'], deadline.isoformat())
        self.assertEqual(self.client.post(f'/api/reservations/{self.order.pk}/cancel').status_code,409)
        self.a.refresh_from_db()
        self.assertEqual(self.a.stock,4)
        self.assertTrue(Reservation.objects.filter(pk=self.order.pk).exists())

    def test_expiry_releases_store_lock_and_invalidates_undo_once(self):
        self.book()
        from .test_listing_revision import create_store
        store=create_store(self.partner,'Cabang baru')
        path=f'/api/partner/listings/{self.a.pk}'
        self.assertEqual(self.client.patch(path,{'store_id':store.pk},format='json').status_code,409)
        token=self.client.post(f'{path}/sold-out',{},format='json').data['undo_token']
        Reservation.objects.filter(pk=self.order.pk).update(created_at=timezone.now()-timedelta(minutes=5))
        self.assertEqual(self.client.patch(path,{'store_id':store.pk},format='json').status_code,200)
        self.assertEqual(self.client.post(f'{path}/undo-sold-out',{'token':token},format='json').status_code,409)
        Reservation.expire_overdue()
        self.a.refresh_from_db()
        self.assertEqual(self.a.stock,1)

    def test_new_ticket_deadline_is_snapshot_of_listing(self):
        self.book()
        self.a.refresh_from_db()
        self.assertEqual(self.order.pickup_deadline,self.a.pickup_end)
        Listing.objects.filter(pk=self.a.pk).update(pickup_end=timezone.now()+timedelta(days=1))
        self.order.refresh_from_db()
        self.assertEqual(self.order.deadline,self.a.pickup_end)

    def test_account_deletion_releases_expired_stock_once(self):
        self.buyer.set_password('Lifecycle-Test-381!');self.buyer.save()
        self.book()
        Reservation.objects.filter(pk=self.order.pk).update(pickup_deadline=timezone.now()-timedelta(seconds=1))
        Listing.objects.filter(pk=self.a.pk).update(stock=6)
        self.client.force_authenticate(self.buyer)
        result=self.client.delete('/api/auth/me',{'password':'Lifecycle-Test-381!'},format='json')
        self.assertEqual(result.status_code,204,result.data)
        self.a.refresh_from_db()
        self.assertEqual(self.a.stock,7)
