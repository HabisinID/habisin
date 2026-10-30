"""Workspace contracts use disposable Django test DB/media only."""
from datetime import timedelta
from django.contrib.auth.models import User
from django.utils import timezone
from django.test import TestCase
from . import test_commerce
from .models import Listing, ModerationLog, Profile, Reservation


class WorkspaceRevisionTests(TestCase):
    setUp = test_commerce.CommerceTests.setUp
    food = test_commerce.CommerceTests.food

    def order(self, paid=False, note='Tanpa sendok, terima kasih'):
        self.client.force_authenticate(self.buyer)
        response=self.client.post('/api/reservations',{'listing_id':self.a.pk,'quantity':1,'note':note},format='json')
        self.assertEqual(response.status_code,201,response.data)
        if paid:
            self.assertEqual(self.client.post(f'/api/reservations/{response.data["id"]}/pay').status_code,200)
        self.client.force_authenticate(self.partner)
        return Reservation.objects.get(pk=response.data['id'])

    def admin(self):
        user, _=User.objects.get_or_create(username='workspace_admin',defaults={'is_staff':True})
        Profile.objects.get_or_create(user=user,defaults={'role':'buyer'})
        self.client.force_authenticate(user)
        return user

    def cancel(self, order, reason='Stok rusak saat persiapan'):
        return self.client.post(f'/api/partner/reservations/{order.pk}/cancel',{'reason':reason},format='json')

    def moderate(self, action='take_down', reason='Foto tidak sesuai produk'):
        return self.client.post(f'/api/admin/listings/{self.a.pk}/moderate',{'action':action,'reason':reason},format='json')

    def test_partner_notes_and_privacy_every_response(self):
        order=self.order(paid=True)
        for path in ['/api/partner/orders','/api/partner/dashboard']:
            data=self.client.get(path).data
            self.assertNotIn('"code"',__import__('json').dumps(data))
            self.assertIn(order.note,__import__('json').dumps(data))
        data=self.cancel(order).data
        self.assertNotIn('code',data)
        self.client.force_authenticate(self.buyer)
        buyer=self.client.get(f'/api/reservations/{order.pk}').data
        self.assertEqual(buyer['cancellation_note'],'Stok rusak saat persiapan')
        self.assertEqual(buyer['cancelled_by'],'partner')
        self.assertEqual(buyer['code'],order.code)

    def test_reason_validation_retry_and_stock_once(self):
        order=self.order()
        for invalid in ['', ' '*3, 'a'*501, 12, None]:
            self.assertEqual(self.cancel(order,invalid).status_code,400)
        self.assertEqual(self.cancel(order).status_code,200)
        response=self.cancel(order,'Alasan kedua')
        self.assertEqual(response.data['cancellation_note'],'Stok rusak saat persiapan')
        self.a.refresh_from_db();self.assertEqual(self.a.stock,4)

    def test_partner_can_cancel_paid_with_less_than_thirty_minutes(self):
        order=self.order(paid=True)
        Reservation.objects.filter(pk=order.pk).update(pickup_deadline=timezone.now()+timedelta(minutes=10))
        self.assertEqual(self.cancel(order).status_code,200)

    def test_finished_or_expired_not_cancelled_twice(self):
        order=self.order(paid=True)
        Reservation.objects.filter(pk=order.pk).update(status='picked_up')
        self.assertEqual(self.cancel(order).status_code,409)
        Reservation.objects.filter(pk=order.pk).update(status='paid',pickup_deadline=timezone.now()-timedelta(seconds=1))
        self.assertEqual(self.cancel(order).status_code,409)
        self.a.refresh_from_db();self.assertEqual(self.a.stock,4)
        self.assertEqual(self.cancel(order).status_code,409)
        self.a.refresh_from_db();self.assertEqual(self.a.stock,4)

    def test_filters_ownership_pagination_dates(self):
        order=self.order()
        local=timezone.localtime(order.deadline).date().isoformat()
        data=self.client.get(f'/api/partner/orders?from={local}&to={local}&status=pending&page_size=1').data
        self.assertEqual(data['count'],1);self.assertEqual(data['results'][0]['id'],order.pk)
        for query in ['from=nope','from=2026-10-27&to=2026-10-26','status=nope','page=0','page_size=101']:
            self.assertEqual(self.client.get('/api/partner/orders?'+query).status_code,400)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get('/api/partner/orders').data['count'],0)
        self.assertEqual(self.client.get(f'/api/partner/orders?store_id={self.store.pk}').status_code,404)
        self.assertEqual(self.cancel(order).status_code,404)

    def test_takedown_requires_admin_and_nonempty_reason(self):
        for user in [self.partner,self.buyer,None]:
            self.client.force_authenticate(user)
            self.assertEqual(self.moderate().status_code,403)
            self.assertEqual(self.client.get('/api/admin/summary').status_code,403)
        self.admin()
        self.assertEqual(self.moderate(reason=' ').status_code,400)
        self.assertEqual(self.moderate(action='activate').status_code,400)
        self.assertEqual(ModerationLog.objects.count(),0)

    def test_takedown_blocks_every_mutation_cancels_tickets_and_restores(self):
        order=self.order(paid=True)
        self.admin();self.assertEqual(self.moderate().status_code,200)
        self.assertEqual(self.moderate().status_code,200)
        self.assertEqual(ModerationLog.objects.count(),1)
        summary=self.client.get('/api/admin/summary').data
        self.assertEqual(summary['listings_live'],1)
        self.assertEqual(summary['orders_today'],1)
        self.assertEqual(summary['partners_active'],2)
        self.assertEqual(summary['pickup_portions_today'],0)
        self.assertTrue(summary['complaints_available'])
        self.client.force_authenticate(self.partner)
        path=f'/api/partner/listings/{self.a.pk}'
        for method,payload,suffix in [('patch',{'stock':20},''),('patch',{'active':True},''),('patch',{'name':'Bypass'},''),('delete',{},''),('post',{},'/sold-out'),('post',{'token':'bad'},'/undo-sold-out')]:
            self.assertEqual(getattr(self.client,method)(path+suffix,payload,format='json').status_code,409)
        self.client.force_authenticate(self.buyer)
        self.assertNotIn(self.a.pk,[row['id'] for row in self.client.get('/api/listings').data])
        self.assertEqual(self.client.get(f'/api/reservations/{order.pk}').data['status'],'cancelled')
        self.assertEqual(self.client.post('/api/reservations',{'listing_id':self.a.pk},format='json').status_code,400)
        self.admin();self.assertEqual(self.moderate('restore','Foto diperbaiki').status_code,200)
        self.a.refresh_from_db();self.assertFalse(self.a.active);self.assertIsNone(self.a.moderated_at)
        self.assertEqual(ModerationLog.objects.count(),2)
        self.client.force_authenticate(self.partner)
        self.assertEqual(self.client.patch(path,{'active':True},format='json').status_code,200)

    def test_archive_with_finished_history_preserves_buyer_record(self):
        order=self.order()
        path=f'/api/partner/listings/{self.a.pk}'
        self.assertEqual(self.client.delete(path).status_code,409)
        self.assertEqual(self.cancel(order).status_code,200)
        self.assertEqual(self.client.delete(path).status_code,204)
        self.assertNotIn(self.a.pk,[row['id'] for row in self.client.get('/api/partner/listings').data])
        self.assertEqual(self.client.patch(path,{'active':True},format='json').status_code,404)
        self.client.force_authenticate(self.buyer)
        self.assertEqual(self.client.get(f'/api/reservations/{order.pk}').status_code,200)

    def hours(self):
        return [{'day':i,'enabled':True,'sessions':[{'start':'08:00','end':'12:00'},{'start':'14:00','end':'20:00'}]} for i in range(7)]

    def test_schedule_roundtrip_and_validation(self):
        self.client.force_authenticate(self.partner)
        path=f'/api/partner/stores/{self.store.pk}'
        response=self.client.patch(path,{'weekly_hours':self.hours(),'category':'Roti & kue','landmark':'Depan stasiun'},format='json')
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(len(response.data['weekly_hours']),7)
        bad=self.hours();bad[0]['sessions'][1]['start']='11:00'
        duplicate=self.hours();duplicate[6]['day']=0
        too_many=self.hours();too_many[0]['sessions']*=2
        for value in [[{}],bad,duplicate,too_many,{'day':1}]:
            self.assertEqual(self.client.patch(path,{'weekly_hours':value},format='json').status_code,400)
        overnight=self.hours();overnight[6]['sessions']=[{'start':'22:00','end':'09:00'}]
        self.assertEqual(self.client.patch(path,{'weekly_hours':overnight},format='json').status_code,400)
        self.assertEqual(self.client.patch(path,{'weekly_hours':[]},format='json').status_code,200)

    def test_close_store_guards_history_and_other_branch(self):
        order=self.order()
        path=f'/api/partner/stores/{self.store.pk}/close'
        self.assertEqual(self.client.post(path,{'confirmation_name':'wrong'},format='json').status_code,400)
        payload={'confirmation_name':self.store.name}
        self.assertEqual(self.client.post(path,payload,format='json').status_code,409)
        self.cancel(order)
        self.assertEqual(self.client.post(path,payload,format='json').status_code,200)
        self.assertEqual(self.client.post(path,payload,format='json').status_code,200)
        self.assertEqual(self.client.patch(f'/api/partner/stores/{self.store.pk}',{'is_open':True},format='json').status_code,409)
        self.assertEqual(self.client.patch(f'/api/partner/listings/{self.a.pk}',{'active':True},format='json').status_code,409)
        self.assertTrue(Reservation.objects.filter(pk=order.pk).exists())

    def test_delete_account_active_order_guard_and_password_confirmation(self):
        self.partner.set_password('Original-Meal-918!');self.partner.save()
        order=self.order(paid=True)
        self.assertEqual(self.client.delete('/api/auth/me',{'password':'Original-Meal-918!'},format='json').status_code,409)
        self.assertTrue(User.objects.filter(pk=self.partner.pk).exists())
        self.assertEqual(self.client.post('/api/auth/password',{'old_password':'Original-Meal-918!','new_password':'Updated-Meal-918!','new_password_confirm':'different'},format='json').status_code,400)
        self.assertEqual(self.client.post('/api/auth/password',{'old_password':'Original-Meal-918!','new_password':'Updated-Meal-918!','new_password_confirm':'Updated-Meal-918!'},format='json').status_code,200)

    def test_password_keeps_current_session_and_revokes_another(self):
        from rest_framework.test import APIClient
        self.partner.set_password('Original-Meal-918!');self.partner.save()
        first,second=APIClient(),APIClient()
        for client in [first,second]:
            self.assertTrue(client.login(username=self.partner.username,password='Original-Meal-918!'))
        response=first.post('/api/auth/password',{'old_password':'Original-Meal-918!','new_password':'Updated-Meal-918!','new_password_confirm':'Updated-Meal-918!'},format='json')
        self.assertEqual(response.status_code,200)
        self.assertEqual(first.get('/api/auth/me').status_code,200)
        self.assertEqual(second.get('/api/auth/me').status_code,403)

    def test_temporary_or_permanent_close_is_scoped_to_branch(self):
        from .test_listing_revision import create_store
        branch=create_store(self.partner,'Cabang kedua')
        food=self.food(self.partner,branch,'Milik cabang kedua')
        self.client.force_authenticate(self.partner)
        path=f'/api/partner/stores/{self.store.pk}/close'
        self.assertEqual(self.client.post(path,{'confirmation_name':self.store.name},format='json').status_code,200)
        branch.refresh_from_db();food.refresh_from_db()
        self.assertTrue(branch.is_open);self.assertIsNone(branch.closed_at);self.assertTrue(food.active)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.post(path,{'confirmation_name':self.store.name},format='json').status_code,404)

    def test_active_inbox_includes_future_pending_and_paid_without_date_filters(self):
        paid=self.order(paid=True)
        pending=self.order()
        future=timezone.now()+timedelta(days=2)
        Reservation.objects.filter(pk__in=[paid.pk,pending.pk]).update(pickup_deadline=future)
        data=self.client.get('/api/partner/orders?status=active').data
        self.assertEqual({row['id'] for row in data['results']},{paid.pk,pending.pk})
        self.assertEqual(data['count'],2)
        self.assertEqual(self.cancel(paid).status_code,200)
        data=self.client.get('/api/partner/orders?status=active').data
        self.assertEqual([row['id'] for row in data['results']],[pending.pk])
        self.assertEqual(data['results'][0]['status'],'pending')
        self.assertNotIn('code',data['results'][0])
