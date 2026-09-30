"""
Shared visit-window rules.

A visit booked against a VisitSetup doesn't have a single date/time of its
own — the setup defines a DATE RANGE and a daily TIME WINDOW, and the
visitor may turn up on any day in that range. These helpers turn that into
the two things everything else needs: the text an SMS/pass page shows
("2026-08-01 - 2026-08-10 (በየቀኑ 09:00-17:00)"), and the date its
auto-created follow-up should be dated.

Kept in its own module (rather than in verification.py or serializers.py)
because models, serializers, and the SMS/verification builders all need it
and importing from any of those into the others would create cycles.
"""

import re
from datetime import date, timedelta

from django.utils import timezone

_ISO = re.compile(r'^\d{4}-\d{2}-\d{2}$')


def _iso(s):
    """
    VisitSetup.dateFrom/dateTo are CharFields, not DateFields — the frontend
    still allows free text like "mid August 2026". So they're only usable as
    real dates when they happen to be ISO. Anything else falls through to the
    caller's fallback rather than raising, so one hand-typed oddity can never
    take down a list page.
    """
    if s and _ISO.match(s):
        try:
            return date.fromisoformat(s)
        except ValueError:
            return None
    return None


def followup_date_for_setup(setup):
    """dateTo - 3 days; falls back to dateFrom, then today+1. Never earlier than today."""
    today = timezone.localdate()
    end = _iso(getattr(setup, 'dateTo', '')) or _iso(getattr(setup, 'dateFrom', ''))
    if end is None:
        return today + timedelta(days=1)
    return max(end - timedelta(days=3), today)


def _t(v):
    if not v:
        return ''
    return v.strftime('%H:%M') if hasattr(v, 'strftime') else str(v)[:5]


def appointment_window(appt):
    """
    The date/time window for one appointment, as plain strings.

    Prefers the linked VisitSetup's range + daily window; falls back to the
    appointment's own visitDate/visitTime for rows booked before VisitSetup
    ranges existed, and for custom visits that supplied a single date/time.
    """
    s = appt.setup
    if s:
        return {'dateFrom': s.dateFrom or '', 'dateTo': s.dateTo or '',
                'timeFrom': _t(s.guideTimeFrom), 'timeTo': _t(s.guideTimeTo)}
    # legacy rows booked before this change
    return {'dateFrom': appt.visitDate.isoformat() if appt.visitDate else '', 'dateTo': '',
            'timeFrom': _t(appt.visitTime), 'timeTo': ''}


def window_text(w, daily='daily'):
    """
    Renders a window dict as one display line. A single date with no
    dateTo renders bare ("2026-08-01") rather than as a pointless range,
    and the daily-time clause is dropped entirely when the setup has no
    time window, instead of showing an empty "(daily )".
    """
    d = w['dateFrom']
    if w['dateTo'] and w['dateTo'] != w['dateFrom']:
        d = f"{w['dateFrom']} - {w['dateTo']}" if w['dateFrom'] else w['dateTo']
    t = f"{w['timeFrom']}-{w['timeTo']}" if w['timeFrom'] and w['timeTo'] else ''
    if d and t:
        return f"{d} ({daily} {t})"
    return d or t or '-'
