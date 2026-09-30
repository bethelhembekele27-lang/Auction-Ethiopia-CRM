"""
Backfills SavedLocation from every address + mapsLink pair already recorded
on VisitSetup, Appointment and Pickup, so operators get a populated
"pick a location" dropdown on day one instead of an empty one.

Rows are applied oldest-first so the most recently created record for an
address wins when the same address appears on several of them — matching
"whatever was last typed is the current truth".
"""

from datetime import datetime, time

from django.db import migrations
from django.utils import timezone


def _key(s):
    return ' '.join((s or '').lower().split())


def backfill(apps, schema_editor):
    # Historical models via apps.get_model, never the real ones — this
    # function must keep working against the schema as it exists at this
    # point in the migration chain, even after later migrations change it.
    SavedLocation = apps.get_model('crm', 'SavedLocation')

    rows = []
    # VisitSetup.createdDate is a DateField, not a DateTime, so it needs a
    # time component before it can be sorted against the other two models'
    # createdAt timestamps.
    for v in apps.get_model('crm', 'VisitSetup').objects.exclude(address='').exclude(mapsLink=''):
        ts = timezone.make_aware(datetime.combine(v.createdDate, time.min))
        rows.append((ts, v.address, v.mapsLink))
    for name in ('Appointment', 'Pickup'):
        for r in apps.get_model('crm', name).objects.exclude(address='').exclude(mapsLink=''):
            rows.append((r.createdAt, r.address, r.mapsLink))

    rows.sort(key=lambda r: r[0])  # oldest first, so the newest write wins
    for _, addr, link in rows:
        k = _key(addr)
        if k:
            SavedLocation.objects.update_or_create(
                addressKey=k, defaults={'address': ' '.join(addr.split()), 'mapsLink': link})


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0011_visit_rework_and_saved_locations'),
    ]

    operations = [
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
