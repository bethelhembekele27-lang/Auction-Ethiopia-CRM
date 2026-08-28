"""
Idempotent — safe to run on every deploy. Creates (or updates) a single
administrator User + Employee pair from environment variables, so a
fresh database (a brand-new Neon project, or a wiped local db.sqlite3)
is never stuck with zero accounts, and never repeats the "superuser
with no linked Employee" gotcha hit twice during manual testing this
project.

Required env vars:
    BOOTSTRAP_ADMIN_USERNAME
    BOOTSTRAP_ADMIN_PASSWORD
    BOOTSTRAP_ADMIN_EMAIL       (optional, but needed for Google login)

If BOOTSTRAP_ADMIN_USERNAME/PASSWORD aren't set, the command does
nothing and exits quietly — safe to include in every deploy's release
step even on environments that don't want a bootstrap admin.
"""
import os

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.utils import timezone

from crm.models import Role, Employee


class Command(BaseCommand):
    help = "Creates or updates the bootstrap administrator account (idempotent)."

    def handle(self, *args, **options):
        username = os.environ.get('BOOTSTRAP_ADMIN_USERNAME')
        password = os.environ.get('BOOTSTRAP_ADMIN_PASSWORD')
        email = os.environ.get('BOOTSTRAP_ADMIN_EMAIL', '')

        if not username or not password:
            self.stdout.write(self.style.WARNING(
                'BOOTSTRAP_ADMIN_USERNAME / BOOTSTRAP_ADMIN_PASSWORD not set — skipping.'
            ))
            return

        try:
            role = Role.objects.get(key='administrator')
        except Role.DoesNotExist:
            self.stdout.write(self.style.ERROR(
                'No "administrator" role found — run seed_roles first.'
            ))
            return

        user, created = User.objects.get_or_create(
            username=username,
            defaults={'email': email, 'is_staff': True, 'is_superuser': True},
        )
        if created:
            user.set_password(password)
            user.save()
            action = 'Created'
        else:
            # Idempotent update — keeps password/email in sync with env
            # vars on every deploy, in case they were rotated.
            user.set_password(password)
            user.email = email
            user.is_staff = True
            user.is_superuser = True
            user.save()
            action = 'Updated'

        employee, emp_created = Employee.objects.get_or_create(
            user=user,
            defaults={
                'name': 'System Administrator',
                'role': role,
                'status': 'Active',
                'privileges': list(role.defaultPrivileges),
                'lastPasswordChange': timezone.now(),
            },
        )
        if not emp_created and employee.role_id != role.id:
            employee.role = role
            employee.status = 'Active'
            employee.save(update_fields=['role', 'status'])

        self.stdout.write(self.style.SUCCESS(
            f'{action} bootstrap admin user "{username}" (Employee: {employee.name}).'
        ))