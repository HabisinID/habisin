"""Modul 8: cashier verification of pickup codes, rendered for HTMX."""
from datetime import timedelta
from unittest.mock import patch
from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from .models import Listing, Profile, Reservation, VerificationLog
from .test_listing_revision import create_store, listing_payload

PAGE = "/api/partner/kasir"
CHECK = "/api/partner/kasir/check"


def food(owner, store, name="Roti Cabang"):
    data = listing_payload(store.pk)
    data.pop("store_id")
    return Listing.objects.create(owner=owner, store_profile=store, store=store.name, address=store.address, latitude=store.latitude, longitude=store.longitude, **{**data, "name": name})


class VerificationTests(TestCase):
    def setUp(self):
        cache.clear()
        self.partner = User.objects.create_user(username="kasir_partner")
        self.other = User.objects.create_user(username="kasir_other")
        self.buyer = User.objects.create_user(username="kasir_buyer", first_name="Rani", last_name="Ayu")
        for user, role in [(self.partner, "partner"), (self.other, "partner"), (self.buyer, "buyer")]:
            Profile.objects.create(user=user, role=role)
        self.store = create_store(self.partner, "Dapur Rani")
        self.listing = food(self.partner, self.store)
        self.client.force_login(self.partner)

    def order(self, code="H7K49", status="paid", listing=None, **changes):
        return Reservation.objects.create(user=self.buyer, listing=listing or self.listing, quantity=2, total=10000, code=code, status=status, paid_at=timezone.now() if status != "pending" else None, **changes)

    def check(self, code):
        return self.client.post(CHECK, {"code": code})

    def logs(self):
        return list(VerificationLog.objects.filter(partner=self.partner).values_list("code", "outcome"))

    # Page and roles

    def test_page_is_for_partners_only(self):
        self.assertContains(self.client.get(PAGE), "Kode ambil dari pembeli")
        self.client.force_login(self.buyer)
        self.assertEqual(self.client.get(PAGE).status_code, 403)
        self.client.logout()
        self.assertEqual(self.client.get(PAGE).status_code, 403)
        self.assertEqual(self.check("H7K49").status_code, 403)

    def test_cashier_has_the_partner_workspace_menu_in_order(self):
        from html.parser import HTMLParser

        class Navigation(HTMLParser):
            def __init__(self):
                super().__init__()
                self.inside = False
                self.links = []

            def handle_starttag(self, tag, attrs):
                attrs = dict(attrs)
                if tag == "nav" and attrs.get("aria-label") == "Navigasi mitra":
                    self.inside = True
                if self.inside and tag == "a":
                    self.links.append((attrs.get("href"), attrs.get("aria-current")))

            def handle_endtag(self, tag):
                if tag == "nav":
                    self.inside = False

        response = self.client.get(PAGE)
        parser = Navigation()
        parser.feed(response.content.decode())
        self.assertEqual(parser.links, [
            ("/partner", None), ("/partner/listings", None),
            ("/partner/orders", None), (PAGE, "page"),
            ("/partner/store", None), ("/partner/account", None),
        ])
        self.assertContains(response, 'id="partner-menu"')
        self.assertContains(response, 'aria-controls="partner-menu"')

    def test_page_offers_qr_scanning(self):
        self.assertContains(self.client.get(PAGE), "Pindai QR")

    def test_dashboard_links_go_straight_to_the_partner_dashboard(self):
        # "/" would show the landing page for a moment before redirecting partners.
        page = self.client.get(PAGE)
        self.assertContains(page, '<a class="item" href="/partner">')
        self.assertContains(page, 'class="logo" href="/partner"')
        self.assertNotContains(page, 'href="/"')

    def test_page_counts_orders_waiting_for_pickup(self):
        self.order("H7K49")
        self.order("AAAAA", status="pending")
        self.order("CCCCC", status="picked_up", picked_up_at=timezone.now())
        response = self.client.get(PAGE)
        self.assertContains(response, "Dapur Rani")
        self.assertContains(response, "1 pesanan belum diambil")

    # Check outcomes

    def test_matching_code_shows_the_order_without_logging(self):
        order = self.order()
        response = self.check("h7k49")
        self.assertEqual(response.context["outcome"], "match")
        self.assertEqual(response.context["order"], order)
        self.assertContains(response, "Kode cocok")
        self.assertContains(response, "H7K · 49")
        self.assertContains(response, "Rani A.")
        self.assertContains(response, "Roti Cabang × 2")
        self.assertEqual(self.logs(), [])

    def test_buyer_name_is_shortened_even_when_stored_whole(self):
        # Sign-up stores the whole name in first_name.
        User.objects.filter(pk=self.buyer.pk).update(first_name="Rani Ayu Lestari", last_name="")
        self.order()
        response = self.check("H7K49")
        self.assertContains(response, "Rani L.")
        self.assertNotContains(response, "Lestari")
        self.assertContains(response, "Rp 10.000")

    def test_unknown_code_is_rejected_and_logged(self):
        response = self.check("XXXXX")
        self.assertEqual(response.context["outcome"], "not_found")
        self.assertContains(response, "Tidak ditemukan")
        self.assertEqual(self.logs(), [("XXXXX", "not_found")])

    def test_other_store_code_never_reveals_the_order(self):
        foreign = food(self.other, create_store(self.other, "Toko Sebelah"), "Nasi Rahasia")
        self.order("TTTTT", listing=foreign)
        response = self.check("TTTTT")
        self.assertEqual(response.context["outcome"], "other_store")
        self.assertIsNone(response.context["order"])
        self.assertContains(response, "Milik toko lain")
        for secret in ["Nasi Rahasia", "Toko Sebelah", "Rani"]:
            self.assertNotContains(response, secret)
        self.assertEqual(VerificationLog.objects.get().reservation, None)

    def test_used_cancelled_expired_and_unpaid_codes_are_rejected(self):
        picked = timezone.localtime().replace(hour=19, minute=42)
        self.order("UUUUU", status="picked_up", picked_up_at=picked)
        self.order("CCCCC", status="cancelled", cancelled_by="buyer", cancelled_at=timezone.now())
        self.order("EEEEE", status="expired")
        self.order("PPPPP", status="pending")
        expected = [("UUUUU", "used", "Sudah dipakai pukul 19.42"), ("CCCCC", "cancelled", "Pembeli membatalkan"), ("EEEEE", "expired", "Kode kedaluwarsa"), ("PPPPP", "unpaid", "Belum dibayar")]
        for code, outcome, text in expected:
            response = self.check(code)
            self.assertEqual(response.context["outcome"], outcome)
            self.assertContains(response, text)
        self.assertEqual(sorted(self.logs()), sorted((code, outcome) for code, outcome, _ in expected))

    def test_partner_cancellation_names_the_partner(self):
        self.order("CCCCC", status="cancelled", cancelled_by="partner", cancelled_at=timezone.now())
        self.assertContains(self.check("CCCCC"), "Mitra membatalkan")

    def test_paid_code_past_its_deadline_is_expired(self):
        self.order(pickup_deadline=timezone.now() - timedelta(minutes=1))
        self.assertEqual(self.check("H7K49").context["outcome"], "expired")

    def test_malformed_code_is_a_bad_request(self):
        for code in ["", "H7K4", "H7K490", "B8S5Z"]:
            self.assertEqual(self.check(code).status_code, 400, code)
        self.assertEqual(self.logs(), [])

    def test_checking_is_rate_limited_per_partner(self):
        for _ in range(30):
            self.assertEqual(self.check("XXXXX").status_code, 200)
        response = self.check("XXXXX")
        self.assertEqual(response.status_code, 429)
        self.assertContains(response, "Terlalu banyak percobaan", status_code=429)
        self.client.force_login(self.other)
        self.assertEqual(self.check("XXXXX").status_code, 200)

    # Hand over and undo

    def test_mark_picked_up_logs_and_clears_for_the_next_code(self):
        order = self.order()
        response = self.client.post(f"{PAGE}/{order.pk}/pickup")
        self.assertContains(response, "Diserahkan pukul")
        self.assertContains(response, "Urungkan")
        order.refresh_from_db()
        self.assertEqual(order.status, "picked_up")
        self.assertIsNotNone(order.picked_up_at)
        self.assertEqual(self.logs(), [("H7K49", "picked_up")])
        self.assertEqual(self.client.post(f"{PAGE}/{order.pk}/pickup").status_code, 409)

    def test_only_the_owning_partner_can_hand_over_or_undo(self):
        order = self.order()
        self.client.force_login(self.other)
        for action in ["pickup", "undo"]:
            self.assertEqual(self.client.post(f"{PAGE}/{order.pk}/{action}").status_code, 404)
        self.client.force_login(self.buyer)
        self.assertEqual(self.client.post(f"{PAGE}/{order.pk}/pickup").status_code, 403)
        order.refresh_from_db()
        self.assertEqual(order.status, "paid")

    def test_undo_within_sixty_seconds_restores_the_order(self):
        order = self.order()
        self.client.post(f"{PAGE}/{order.pk}/pickup")
        response = self.client.post(f"{PAGE}/{order.pk}/undo")
        self.assertEqual(response.context["outcome"], "match")
        order.refresh_from_db()
        self.assertEqual((order.status, order.picked_up_at), ("paid", None))
        self.assertEqual(self.logs(), [])

    def test_undo_after_sixty_seconds_is_refused(self):
        order = self.order()
        self.client.post(f"{PAGE}/{order.pk}/pickup")
        later = timezone.now() + timedelta(seconds=61)
        with patch("django.utils.timezone.now", return_value=later):
            self.assertEqual(self.client.post(f"{PAGE}/{order.pk}/undo").status_code, 409)
        order.refresh_from_db()
        self.assertEqual(order.status, "picked_up")

    # Recent checks

    def test_recent_lists_the_five_newest_checks_of_this_partner(self):
        VerificationLog.objects.create(partner=self.other, code="OTHER", outcome="not_found")
        for code in ["AAAAA", "CCCCC", "DDDDD", "EEEEE", "FFFFF", "HHHHH"]:
            self.check(code)
        rows = self.client.get(f"{PAGE}/recent").context["logs"]
        self.assertEqual([row.code for row in rows], ["HHHHH", "FFFFF", "EEEEE", "DDDDD", "CCCCC"])

    def test_recent_shows_handed_over_and_rejected(self):
        order = self.order()
        self.client.post(f"{PAGE}/{order.pk}/pickup")
        self.check("XXXXX")
        response = self.client.get(f"{PAGE}/recent")
        self.assertContains(response, "Diambil")
        self.assertContains(response, "Ditolak")
        self.assertContains(response, "Rani A.")
