from datetime import date, time, timedelta

from django.contrib.auth.models import User
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.test import APIClient, APIRequestFactory

from .auth import BearerTokenAuthentication
from .models import (
    Appointment, AuditLog, Employee, Followup, PartyVerification, Pickup,
    Role, SavedLocation, VisitSetup,
)
from .serializers import AppointmentSerializer, VisitSetupSerializer
from .verification import resolve_pass
from .visit_rules import appointment_window, followup_date_for_setup, window_text

SECRET = "unit-test-cron-secret"
CRON_URL = "/api/internal/send-followup-reminders/"


class HealthViewTests(TestCase):
    def test_health_is_public(self):
        res = self.client.get("/api/health/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"status": "ok"})


class CronSecretTests(TestCase):
    """The guard must reject on an UNSET CRON_SECRET: comparing two empty
    strings with `!=` is False, which would leave the endpoint open."""

    def post(self, secret):
        return self.client.post(CRON_URL, headers={"X-Cron-Secret": secret})

    def set_env(self, value):
        import crm.views as views

        previous = views.os.environ.get("CRON_SECRET")
        views.os.environ.pop("CRON_SECRET", None)
        if value is not None:
            views.os.environ["CRON_SECRET"] = value
        self.addCleanup(self._restore, previous)

    @staticmethod
    def _restore(previous):
        import crm.views as views

        views.os.environ.pop("CRON_SECRET", None)
        if previous is not None:
            views.os.environ["CRON_SECRET"] = previous

    def test_rejects_empty_header_when_secret_unset(self):
        self.set_env(None)
        self.assertEqual(self.post("").status_code, 403)

    def test_rejects_any_header_when_secret_unset(self):
        self.set_env(None)
        self.assertEqual(self.post("guessed-value").status_code, 403)

    def test_rejects_wrong_secret(self):
        self.set_env(SECRET)
        self.assertEqual(self.post(SECRET[:-1] + "!").status_code, 403)

    def test_rejects_empty_header_when_secret_set(self):
        self.set_env(SECRET)
        self.assertEqual(self.post("").status_code, 403)

    def test_accepts_exact_secret(self):
        self.set_env(SECRET)
        # Runs the management command against the throwaway test DB.
        self.assertEqual(self.post(SECRET).status_code, 200)


class TokenExpiryTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("tokenuser", password="x")
        self.token = Token.objects.create(user=self.user)
        self.auth = BearerTokenAuthentication()
        self.factory = APIRequestFactory()

    def _authenticate(self):
        request = self.factory.get("/", HTTP_AUTHORIZATION=f"Bearer {self.token.key}")
        return self.auth.authenticate(request)

    def _backdate_token(self, days):
        Token.objects.filter(pk=self.token.pk).update(
            created=timezone.now() - timedelta(days=days)
        )
        self.token.refresh_from_db()

    def test_fresh_token_authenticates(self):
        self.assertEqual(self._authenticate()[0], self.user)

    def test_token_inside_lifetime_still_works(self):
        self._backdate_token(days=13)
        self.assertEqual(self._authenticate()[0], self.user)

    def test_expired_token_is_rejected(self):
        self._backdate_token(days=15)
        with self.assertRaises(AuthenticationFailed):
            self._authenticate()

    def test_expired_token_is_deleted(self):
        pk = self.token.pk
        self._backdate_token(days=15)
        with self.assertRaises(AuthenticationFailed):
            self._authenticate()
        self.assertFalse(Token.objects.filter(pk=pk).exists())


class AllowlistSenderTests(TestCase):
    """SMS_ALLOWED_NUMBERS must block every number not on the list, so a
    new provider can be tested against a live gateway safely."""

    def sender(self, allowed):
        from crm.notifications import AllowlistSender

        return AllowlistSender(inner=_StubSender(), allowed=allowed)

    def test_blocks_number_not_on_list(self):
        result = self.sender(["+251911000001"]).send("+251911000002", "hi")
        self.assertFalse(result["ok"])

    def test_allows_number_on_list(self):
        result = self.sender(["+251911000001"]).send("+251911000001", "hi")
        self.assertTrue(result["ok"])

    def test_matches_despite_formatting_and_country_code(self):
        # Allowlist written one way, destination written another.
        for destination in ("+251911000001", "0911000001", "251911000001", "0911 000 001"):
            with self.subTest(destination=destination):
                result = self.sender(["+251911000001"]).send(destination, "hi")
                self.assertTrue(result["ok"])


class _StubSender:
    def send(self, to_phone, message):
        return {"ok": True, "detail": f"stub:{to_phone}"}


# =============================================================================
# Visit-window rules (crm/visit_rules.py)
# =============================================================================

class VisitRuleTests(TestCase):
    # Dates are built relative to today on purpose: followup_date_for_setup
    # clamps to "never earlier than today", so a hardcoded August window is
    # a past window the moment the test runs after that date.
    def setUp(self):
        self.today = timezone.localdate()
        self.start = self.today + timedelta(days=10)
        self.end = self.today + timedelta(days=20)
        # NB: not named `setup` — that shadows unittest's own TestCase.setup().
        self.vs = VisitSetup.objects.create(
            company='Acme', batch='B1',
            dateFrom=self.start.isoformat(), dateTo=self.end.isoformat(),
            guideName='Guide',
            guideTimeFrom=time(9, 0), guideTimeTo=time(17, 0),
        )

    def test_followup_dated_three_days_before_window_closes(self):
        self.assertEqual(followup_date_for_setup(self.vs), self.end - timedelta(days=3))

    def test_followup_never_backdated(self):
        # A window that already closed must not produce a past-dated task.
        past = VisitSetup.objects.create(company='C', batch='B2', guideName='G',
                                         dateFrom='2026-01-01', dateTo='2026-01-10')
        self.assertEqual(followup_date_for_setup(past), timezone.localdate())

    def test_falls_back_to_date_from_then_tomorrow(self):
        only_from = VisitSetup.objects.create(company='C', batch='B3', guideName='G',
                                             dateFrom=self.start.isoformat())
        self.assertEqual(followup_date_for_setup(only_from),
                         self.start - timedelta(days=3))

        free_text = VisitSetup.objects.create(company='C', batch='B4', guideName='G',
                                              dateFrom='mid August 2026')
        self.assertEqual(followup_date_for_setup(free_text),
                         timezone.localdate() + timedelta(days=1))

    def test_window_prefers_setup_range_over_appointment(self):
        appt = Appointment.objects.create(
            publicId='APT-9001', phone='0911000001', setup=self.vs,
            visitDate=self.start, visitTime=time(10, 0),
        )
        self.assertEqual(appointment_window(appt), {
            'dateFrom': self.start.isoformat(), 'dateTo': self.end.isoformat(),
            'timeFrom': '09:00', 'timeTo': '17:00',
        })

    def test_window_falls_back_for_setup_less_appointment(self):
        # No setup (custom visit): uses its own date/time, no range.
        appt = Appointment.objects.create(
            publicId='APT-9002', phone='0911000001', isCustom=True,
            visitDate=self.start, visitTime=time(10, 30),
        )
        w = appointment_window(appt)
        self.assertEqual(w['dateFrom'], self.start.isoformat())
        self.assertEqual(w['dateTo'], '')
        self.assertEqual(w['timeFrom'], '10:30')

    def test_window_text_shapes(self):
        base = {'dateFrom': '2026-08-01', 'dateTo': '2026-08-10',
                'timeFrom': '09:00', 'timeTo': '17:00'}
        self.assertEqual(window_text(base, 'በየቀኑ'),
                         '2026-08-01 - 2026-08-10 (በየቀኑ 09:00-17:00)')
        # Same start and end date collapses to a single bare date.
        same = dict(base, dateTo='2026-08-01')
        self.assertEqual(window_text(same), '2026-08-01 (daily 09:00-17:00)')
        # No time window must not render an empty "(daily )".
        notime = {'dateFrom': '2026-08-01', 'dateTo': '', 'timeFrom': '', 'timeTo': ''}
        self.assertEqual(window_text(notime), '2026-08-01')
        self.assertEqual(window_text({'dateFrom': '', 'dateTo': '', 'timeFrom': '', 'timeTo': ''}), '-')


class AppointmentCustomVisitTests(TestCase):
    def setUp(self):
        self.today = timezone.localdate()
        self.start = self.today + timedelta(days=10)
        self.end = self.today + timedelta(days=20)

    def test_custom_visit_creates_no_followup_and_no_setup(self):
        appt = AppointmentSerializer(data={
            'phone': '0911000001', 'isCustom': True,
            'address': 'Bole Road', 'mapsLink': 'https://maps.google.com/?q=bole',
        })
        appt.is_valid(raise_exception=True)
        created = appt.save()
        self.assertIsNone(created.setup)
        self.assertTrue(created.isCustom)
        self.assertEqual(Followup.objects.count(), 0)

    def test_custom_visit_requires_address_and_mapslink(self):
        for payload in ({'phone': '0911000001', 'isCustom': True, 'mapsLink': 'https://x.com'},
                        {'phone': '0911000001', 'isCustom': True, 'address': 'Somewhere'}):
            with self.subTest(payload=payload):
                s = AppointmentSerializer(data=payload)
                self.assertFalse(s.is_valid())
                self.assertTrue({'address', 'mapsLink'} & set(s.errors))

    def test_custom_visit_blanks_inherited_fields(self):
        s = AppointmentSerializer(data={
            'phone': '0911000001', 'isCustom': True, 'address': 'A', 'mapsLink': 'https://x.com',
            'company': 'Should be cleared', 'guideName': 'Should be cleared',
        })
        s.is_valid(raise_exception=True)
        created = s.save()
        self.assertEqual(created.company, '')
        self.assertEqual(created.guideName, '')

    def test_setup_visit_inherits_address_and_link_and_creates_linked_followup(self):
        setup = VisitSetup.objects.create(company='Acme', batch='B1', guideName='G',
                                          dateFrom=self.start.isoformat(),
                                          dateTo=self.end.isoformat(),
                                          address='Warehouse', mapsLink='https://maps.google.com/?q=wh',
                                          guidePhone='0911000002')
        s = AppointmentSerializer(data={
            'phone': '0911000001', 'setupId': setup.publicId, 'visitorName': 'V',
        })
        s.is_valid(raise_exception=True)
        created = s.save(_creating_employee=None)
        self.assertEqual(created.address, 'Warehouse')
        self.assertEqual(created.mapsLink, 'https://maps.google.com/?q=wh')
        # visitWindow is computed by the serializer, not stored on the model.
        self.assertEqual(AppointmentSerializer(created).data['visitWindow'],
                         {'dateFrom': self.start.isoformat(), 'dateTo': self.end.isoformat(),
                          'timeFrom': '', 'timeTo': ''})

        fu = Followup.objects.get()
        self.assertEqual(fu.appointment_id, created.id)
        self.assertIsNone(fu.inquiry_id)
        self.assertEqual(fu.date, self.end - timedelta(days=3))


class VisitSetupRedateTests(TestCase):
    def test_pending_followups_redate_but_resolved_ones_do_not(self):
        today = timezone.localdate()
        start, end = today + timedelta(days=10), today + timedelta(days=20)
        setup = VisitSetup.objects.create(company='Acme', batch='B1', guideName='G',
                                          dateFrom=start.isoformat(), dateTo=end.isoformat())
        s = AppointmentSerializer(data={'phone': '0911000001', 'setupId': setup.publicId})
        s.is_valid(raise_exception=True)
        appt = s.save()
        pending = Followup.objects.get()
        self.assertEqual(pending.date, end - timedelta(days=3))

        Followup.objects.create(appointment=appt, callerName='Earlier', date=today,
                                status='Satisfied')

        # Shift the window forward.
        shifted = end + timedelta(days=10)
        serializer = VisitSetupSerializer(setup, data={'dateTo': shifted.isoformat()}, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        pending.refresh_from_db()
        self.assertEqual(pending.date, shifted - timedelta(days=3))
        resolved = Followup.objects.get(status='Satisfied')
        self.assertEqual(resolved.date, today)


class SavedLocationViewTests(TestCase):
    def setUp(self):
        role = Role.objects.create(key='administrator', name='Administrator')
        self.user = User.objects.create_user('admin1', password='x')
        Employee.objects.create(user=self.user, name='Admin', role=role)
        # Bearer-token auth only — a Django session login is ignored entirely
        # by this API's authentication classes, so APIClient + an explicit
        # Authorization header is the only way in.
        self.client = APIClient()
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.key}')

    def post(self, **payload):
        return self.client.post('/api/locations', payload, content_type='application/json')

    def test_normalizes_address_so_variants_upsert_one_row(self):
        self.post(address='  Bole   Road ', mapsLink='https://x.com/a')
        self.post(address='bole road', mapsLink='https://x.com/b')
        self.assertEqual(SavedLocation.objects.count(), 1)
        self.assertEqual(SavedLocation.objects.get().mapsLink, 'https://x.com/b')

    def test_identical_resave_is_a_noop_with_no_audit_row(self):
        self.post(address='Bole Road', mapsLink='https://x.com/a')
        audits = AuditLog.objects.count()
        response = self.post(address='BOLE   ROAD', mapsLink='https://x.com/a')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(AuditLog.objects.count(), audits)

    def test_rejects_missing_and_malformed_fields(self):
        self.assertEqual(self.post(mapsLink='https://x.com').status_code, 400)
        self.assertEqual(self.post(address='A').status_code, 400)
        self.assertEqual(self.post(address='A', mapsLink='not-a-url').status_code, 400)

    def test_get_lists_saved_locations(self):
        self.post(address='Bole Road', mapsLink='https://x.com/a')
        body = self.client.get('/api/locations').json()
        self.assertEqual(body, [{'address': 'Bole Road', 'mapsLink': 'https://x.com/a'}])


class ResolvePassShapeTests(TestCase):
    """resolve_pass used to call .isoformat()/.strftime() directly on
    visitDate/visitTime, which are now nullable for setup-backed visits."""

    def test_setup_backed_visit_does_not_crash_and_returns_range(self):
        setup = VisitSetup.objects.create(company='Acme', batch='B1', guideName='G',
                                          dateFrom='2026-08-01', dateTo='2026-08-10',
                                          guideTimeFrom=time(9, 0), guideTimeTo=time(17, 0))
        appt = Appointment.objects.create(publicId='APT-9100', phone='0911000001', setup=setup)
        v = PartyVerification.objects.create(
            subjectType='visitation', subjectId='APT-9100',
            visitorToken='vt', guideToken='gt', visitorCode='111111', guideCode='222222',
            expiresAt=timezone.now() + timedelta(days=1),
        )
        subject = resolve_pass(v.visitorToken)['subject']
        self.assertEqual(subject['visitDate'], '2026-08-01')
        self.assertEqual(subject['visitDateTo'], '2026-08-10')
        self.assertEqual(subject['visitTimeTo'], '17:00')


class BackfillSavedLocationsTests(TransactionTestCase):
    """
    Exercises the 0012 data migration itself: migrate back to 0010, insert
    rows shaped like production, migrate forward, and assert the backfill
    produced one SavedLocation per distinct address with the newest write
    winning.

    Note VisitSetup has no `mapsLink` column until 0011, so pre-existing
    VisitSetup rows always carry mapsLink='' and are skipped by the
    backfill's .exclude(mapsLink='') — only rows created AFTER 0011 can
    contribute from that model. The test seeds a VisitSetup between the two
    steps to cover the branch.
    """
    migrate_from = ('crm', '0010_appointment_quantity')
    migrate_via = ('crm', '0011_visit_rework_and_saved_locations')
    migrate_to = ('crm', '0012_backfill_saved_locations')

    def test_backfill_collects_and_dedupes(self):
        executor = MigrationExecutor(connection)
        executor.migrate([self.migrate_from])
        old_apps = executor.loader.project_state([self.migrate_from]).apps
        Appointment = old_apps.get_model('crm', 'Appointment')
        Pickup = old_apps.get_model('crm', 'Pickup')

        # Same address on two models, different casing/spacing. Timestamps are
        # pinned explicitly because createdAt is auto_now_add — left alone
        # both rows would land on "now" and the sort order (and so which link
        # wins) would be untestable.
        old_appt = Appointment.objects.create(
            publicId='APT-8001', phone='0911000001', visitDate=date(2026, 8, 1),
            visitTime=time(10, 0), address='Bole Road', mapsLink='https://x.com/old',
        )
        Appointment.objects.filter(pk=old_appt.pk).update(
            createdAt=timezone.now() - timedelta(days=10))

        # No mapsLink -> must be skipped entirely, not stored blank.
        Pickup.objects.create(
            publicId='PCK-8001', winnerName='W', phone='0911000003',
            pickupDate=date(2026, 8, 2), pickupTime=time(11, 0),
            address='No Link Here', mapsLink='',
        )

        # Step to 0011 so the VisitSetup model has mapsLink, then add a row
        # that is NEWER than the appointment above for the same address.
        executor.loader.build_graph()
        executor.migrate([self.migrate_via])
        mid_apps = executor.loader.project_state([self.migrate_via]).apps
        VisitSetup = mid_apps.get_model('crm', 'VisitSetup')
        setup = VisitSetup.objects.create(
            publicId='VST-8001', company='Acme', batch='B1', guideName='G',
            address='  bole   road ', mapsLink='https://x.com/new',
        )
        VisitSetup.objects.filter(pk=setup.pk).update(createdDate=date.today())

        executor.loader.build_graph()
        executor.migrate([self.migrate_to])
        new_apps = executor.loader.project_state([self.migrate_to]).apps
        SavedLocation = new_apps.get_model('crm', 'SavedLocation')

        rows = {r.addressKey: r.mapsLink for r in SavedLocation.objects.all()}
        self.assertEqual(list(rows), ['bole road'], f'expected one deduped location, got {rows}')
        # Newest write wins: today's VisitSetup over the 10-day-old appointment.
        self.assertEqual(rows['bole road'], 'https://x.com/new')
