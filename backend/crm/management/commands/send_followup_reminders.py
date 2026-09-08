"""
Daily job — pushes a reminder to each call_operator who has one or more
Pending follow-ups due today or overdue. Meant to run once per day via
a scheduled task (Render Cron Job), since this is the one notification
kind with no natural create/update event to hook a push send onto.

Consolidated by design: an operator with 5 overdue follow-ups gets ONE
push ("5 follow-ups need attention"), not 5 separate pushes — avoids
spamming someone who's simply behind, while still surfacing the total.
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from crm.models import Followup
from crm.push import send_push_to_user


class Command(BaseCommand):
    help = "Sends a push notification to each operator with due/overdue follow-ups."

    def handle(self, *args, **options):
        today = timezone.localdate()

        due = (
            Followup.objects
            .filter(reminder=True, status='Pending', date__lte=today, assignedOperator__isnull=False)
            .select_related('assignedOperator__user')
        )

        by_operator = {}
        for f in due:
            emp = f.assignedOperator
            if not emp or not emp.user:
                continue
            by_operator.setdefault(emp, []).append(f)

        sent_count = 0
        for employee, followups in by_operator.items():
            overdue = [f for f in followups if f.date < today]
            due_today = [f for f in followups if f.date == today]

            if overdue and due_today:
                body = f"{len(overdue)} overdue, {len(due_today)} due today."
            elif overdue:
                body = f"{len(overdue)} follow-up{'s' if len(overdue) != 1 else ''} overdue."
            else:
                body = f"{len(due_today)} follow-up{'s' if len(due_today) != 1 else ''} due today."

            send_push_to_user(
                employee.user,
                title=f"{len(followups)} follow-up reminder{'s' if len(followups) != 1 else ''}",
                body=body,
                url="/?page=followups",
            )
            sent_count += 1

        self.stdout.write(self.style.SUCCESS(
            f'Sent follow-up reminder push to {sent_count} operator(s), covering {due.count()} follow-up(s).'
        ))