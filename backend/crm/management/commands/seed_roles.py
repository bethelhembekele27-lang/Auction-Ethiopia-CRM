from django.core.management.base import BaseCommand

from crm.models import PERMISSIONS, Role

# Mirrors src/constants/roles.js -> rolePrivilegeDefaults on the frontend
# EXACTLY. If that file ever changes, update this to match.
BUILT_IN_ROLES = {
    'administrator': {
        'name': 'Administrator',
        'defaultPrivileges': list(PERMISSIONS),
    },
    'call_operator': {
        'name': 'CRM / Call Center Officer',
        'defaultPrivileges': [
            'View dashboard', 'View inquiries', 'Create / edit inquiries',
            'Manage follow-ups', 'Manage visitations', 'Manage complaints',
        ],
    },
    'auction_manager': {
        'name': 'Auction Manager',
        'defaultPrivileges': [
            p for p in PERMISSIONS
            if p not in ('Manage employees & roles', 'View reports', 'Export reports')
        ],
    },
    'viewer': {
        'name': 'Viewer',
        'defaultPrivileges': ['View dashboard', 'View inquiries', 'View audit trail'],
    },
}


class Command(BaseCommand):
    help = "Seeds the 4 built-in roles (idempotent — safe to re-run any time)."

    def handle(self, *args, **options):
        for key, data in BUILT_IN_ROLES.items():
            role, created = Role.objects.update_or_create(
                key=key,
                defaults={
                    'name': data['name'],
                    'defaultPrivileges': data['defaultPrivileges'],
                    'isBuiltIn': True,
                },
            )
            action = 'Created' if created else 'Updated'
            self.stdout.write(self.style.SUCCESS(f"{action} role: {role.name} ({role.key})"))