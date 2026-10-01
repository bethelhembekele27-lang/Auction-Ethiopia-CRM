from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0014_pickup_optional_datetime'),
    ]

    # Destructive: drops the columns outright rather than nulling them, which
    # discards any pickup date/time already entered. Taken on a backup.
    operations = [
        migrations.RemoveField(model_name='pickup', name='pickupDate'),
        migrations.RemoveField(model_name='pickup', name='pickupTime'),
    ]