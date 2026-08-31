from django.db import models
from django.conf import settings


# =============================================================================
# Fixed vocabularies — MUST match src/constants/lookups.js on the frontend
# exactly (spelling, casing, spacing). Keeping them here as one source of
# truth so serializers/validators can import from this file instead of
# retyping the same lists everywhere.
# =============================================================================

CATEGORIES = [
    "Auction Information", "Registration Support", "Bidder Registration",
    "Bid Submission", "Processing Fee Inquiry", "Payment Inquiry",
    "Visitation Appointment", "Technical Support", "Complaint",
    "General Inquiry", "Other",
]

PRIORITIES = ["Low", "Medium", "High", "Urgent"]

INQUIRY_STATUSES = [
    "Open", "Assigned", "Pending Follow-up", "Waiting for Customer",
    "Resolved", "Closed", "With Manager",
]

APPT_STATUSES = ["Requested", "Approved", "Confirmed", "Completed", "Cancelled", "No Show"]

# A follow-up starts life as "Pending" (server-assigned) and can only be
# moved FORWARD to one of these three by the client — never back to Pending.
FOLLOWUP_SETTABLE_STATUSES = ["Satisfied", "Not Satisfied", "No Show"]
FOLLOWUP_ALL_STATUSES = ["Pending"] + FOLLOWUP_SETTABLE_STATUSES

COMPLAINT_CATEGORIES = [
    "Service Quality", "Billing / Fees", "Auction Process", "Staff Conduct",
    "Technical Issue", "Delivery / Item Condition", "Other",
]

DEPARTMENTS = ["Call Center", "Finance", "Auction Operations", "IT Support", "Logistics", "Management"]

DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

COMPLAINT_STATUSES = ["Open", "Resolved"]
ESCALATION_STATUSES = ["Open", "Resolved"]
EMPLOYEE_STATUSES = ["Active", "Inactive"]

# Role slugs the frontend hardcodes permission checks against (constants/roles.js).
# Custom roles created later via POST /roles can use any other slug.
BUILT_IN_ROLE_SLUGS = ["administrator", "call_operator", "auction_manager", "viewer"]

PERMISSIONS = [
    "View dashboard", "View inquiries", "Create / edit inquiries",
    "Manage follow-ups", "Manage visitations", "Manage complaints",
    "View reports", "Export reports", "View audit trail",
    "Manage employees & roles",
]


def next_public_id(model_cls, prefix, pad=4):
    """
    Generates PREFIX-00NN ids the way API_SPEC.md §13 requires.
    NOTE: count-based, not gap-safe — fine for a low-concurrency internal
    tool, but two near-simultaneous creates could theoretically collide.
    Revisit with a dedicated sequence/counter table if that ever bites us.
    """
    count = model_cls.objects.count()
    return f"{prefix}-{count + 1:0{pad}d}"


# =============================================================================
# Roles & Employees  (§8)
# =============================================================================

class Role(models.Model):
    """
    key = the slug the frontend's role-based checks compare against
    (administrator / call_operator / auction_manager / viewer, or a custom
    slugified name for roles created via 'New role').

    defaultPrivileges isn't returned by GET /roles (spec says that just
    returns key strings) but IS needed server-side: POST /employees has to
    fill in a new employee's starting privileges from "the role's
    defaults" per API_SPEC.md §8, and this is where that list lives.
    """
    key = models.SlugField(max_length=60, unique=True)
    name = models.CharField(max_length=100, unique=True)
    isBuiltIn = models.BooleanField(default=False)
    defaultPrivileges = models.JSONField(default=list, blank=True)
    createdAt = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Employee(models.Model):
    """
    One-to-one with Django's built-in User (handles password hashing,
    login, etc. for free). 'publicId' is the EMP-00NN the frontend expects;
    'name' is the human display name used all over the app (operator
    dropdowns, audit log 'u' field, notification bodies).
    """
    publicId = models.CharField(max_length=20, unique=True, editable=False)
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='employee')
    name = models.CharField(max_length=150, unique=True)
    role = models.ForeignKey(Role, on_delete=models.PROTECT, related_name='employees')
    status = models.CharField(max_length=10, choices=[(s, s) for s in EMPLOYEE_STATUSES], default='Active')
    privileges = models.JSONField(default=list, blank=True)  # subset of PERMISSIONS
    lastPasswordChange = models.DateTimeField(null=True, blank=True)
    lastUsernameChange = models.DateTimeField(null=True, blank=True)

    def save(self, *args, **kwargs):
        if not self.publicId:
            self.publicId = next_public_id(Employee, 'EMP')
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.user.get_username()})"


# =============================================================================
# Inquiry  (§2)
# =============================================================================

class Inquiry(models.Model):
    publicId = models.CharField(max_length=20, unique=True, editable=False)

    callerName = models.CharField(max_length=150)
    phone = models.CharField(max_length=20)
    company = models.CharField(max_length=200, blank=True, default='')
    auction = models.CharField(max_length=300, blank=True, default='')   # free text, not FK — see frontend note
    batch = models.CharField(max_length=100, blank=True, default='')

    category = models.CharField(max_length=40, choices=[(c, c) for c in CATEGORIES])
    priority = models.CharField(max_length=10, choices=[(p, p) for p in PRIORITIES], default='Medium')

    # Spec models this as a plain display-name string; we FK to Employee
    # instead so it can't drift from a real account — serializer exposes
    # it back out as the string the frontend expects. Flag if you'd rather
    # keep it as a raw CharField to match the spec literally.
    operator = models.ForeignKey(Employee, on_delete=models.SET_NULL, null=True, blank=True, related_name='inquiries')

    dateTime = models.DateTimeField()
    description = models.TextField(blank=True, default='')
    status = models.CharField(max_length=25, choices=[(s, s) for s in INQUIRY_STATUSES], default='Open')

    followUpDate = models.DateField(null=True, blank=True)
    resolutionNotes = models.TextField(blank=True, default='')
    resolvedDate = models.DateField(null=True, blank=True)

    attachments = models.JSONField(default=list, blank=True)  # list of filenames

    createdAt = models.DateTimeField(auto_now_add=True)
    updatedAt = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if not self.publicId:
            self.publicId = next_public_id(Inquiry, 'INQ')
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.publicId} — {self.callerName}"


# =============================================================================
# Followup  (§3)
# =============================================================================

class Followup(models.Model):
    publicId = models.CharField(max_length=20, unique=True, editable=False)

    inquiry = models.ForeignKey(Inquiry, on_delete=models.SET_NULL, null=True, blank=True, related_name='followups')
    callerName = models.CharField(max_length=150)
    date = models.DateField()
    reminder = models.BooleanField(default=True)
    assignedOperator = models.ForeignKey(Employee, on_delete=models.SET_NULL, null=True, blank=True, related_name='followups')

    status = models.CharField(max_length=15, choices=[(s, s) for s in FOLLOWUP_ALL_STATUSES], default='Pending')
    notes = models.TextField(blank=True, default='')
    createdDate = models.DateField(auto_now_add=True)

    # Carried over from the visit/inquiry that spawned this follow-up, so
    # the Follow-ups page can show "Company / Batch" without an extra join.
    company = models.CharField(max_length=200, blank=True, default='')
    batch = models.CharField(max_length=100, blank=True, default='')
    guideName = models.CharField(max_length=150, blank=True, default='')

    def save(self, *args, **kwargs):
        if not self.publicId:
            self.publicId = next_public_id(Followup, 'FU')
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.publicId} — {self.callerName}"

class VisitSetup(models.Model):
    publicId = models.CharField(max_length=20, unique=True, editable=False)

    company = models.CharField(max_length=200)
    batch = models.CharField(max_length=100)
    # Same free-text-or-real-date flexibility as before, just split into a
    # range. CharField (not DateField) on purpose — the frontend still
    # allows manually-typed values like "mid August 2026".
    dateFrom = models.CharField(max_length=100, blank=True, default='')
    dateTo = models.CharField(max_length=100, blank=True, default='')
    address = models.CharField(max_length=300, blank=True, default='')
    items = models.TextField(blank=True, default='')

    guideName = models.CharField(max_length=150)
    guidePhone = models.CharField(max_length=20, blank=True, default='')
    # guideDays removed — a visit setup now only tracks the date range and
    # daily time window, not specific weekdays.
    guideTimeFrom = models.TimeField(null=True, blank=True)
    guideTimeTo = models.TimeField(null=True, blank=True)

    createdBy = models.ForeignKey(Employee, on_delete=models.SET_NULL, null=True, blank=True, related_name='visit_setups')
    createdDate = models.DateField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if not self.publicId:
            self.publicId = next_public_id(VisitSetup, 'VST')
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.publicId} — {self.company} / {self.batch}"


# =============================================================================
# Appointment / Visitation  (§4)
# =============================================================================

class Appointment(models.Model):
    publicId = models.CharField(max_length=20, unique=True, editable=False)

    auction = models.CharField(max_length=300, blank=True, default='')
    visitorName = models.CharField(max_length=150)
    phone = models.CharField(max_length=20)
    company = models.CharField(max_length=200, blank=True, default='')

    visitDate = models.DateField()
    visitTime = models.TimeField()
    assignedStaff = models.CharField(max_length=150, blank=True, default='')
    status = models.CharField(max_length=15, choices=[(s, s) for s in APPT_STATUSES], default='Requested')
    notes = models.TextField(blank=True, default='')

    setup = models.ForeignKey(VisitSetup, on_delete=models.SET_NULL, null=True, blank=True, related_name='appointments')
    # Denormalized copies from the chosen VisitSetup at booking time, so the
    # Visitations table/API can render without a join — matches the shape
    # API_SPEC.md §4 returns directly on the Appointment object.
    batch = models.CharField(max_length=100, blank=True, default='')
    guideName = models.CharField(max_length=150, blank=True, default='')
    guidePhone = models.CharField(max_length=20, blank=True, default='')
    address = models.CharField(max_length=300, blank=True, default='')
    items = models.TextField(blank=True, default='')

    createdAt = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if not self.publicId:
            self.publicId = next_public_id(Appointment, 'APT')
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.publicId} — {self.visitorName}"

    # NOTE: API_SPEC.md §4 requires that creating an Appointment
    # auto-creates a linked Followup dated visitDate + 1 day. That's a
    # cross-model side effect, so it belongs in the serializer's create()
    # / the view, not here in save() — flagging so we don't forget it
    # when we build AppointmentSerializer.


# =============================================================================
# Complaint  (§5)
# =============================================================================

class Complaint(models.Model):
    publicId = models.CharField(max_length=20, unique=True, editable=False)

    # Spec: "soft reference, not FK necessarily — inquiryId is just a
    # string." Kept literally as a string per that note.
    inquiryId = models.CharField(max_length=20, blank=True, default='')

    callerName = models.CharField(max_length=150)
    phone = models.CharField(max_length=20)
    category = models.CharField(max_length=40, choices=[(c, c) for c in COMPLAINT_CATEGORIES])
    description = models.TextField()
    department = models.CharField(max_length=30, choices=[(d, d) for d in DEPARTMENTS])
    priority = models.CharField(max_length=10, choices=[(p, p) for p in PRIORITIES], default='Medium')
    status = models.CharField(max_length=10, choices=[(s, s) for s in COMPLAINT_STATUSES], default='Open')

    resolution = models.TextField(blank=True, default='')
    resolutionDate = models.DateField(null=True, blank=True)
    date = models.DateField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if not self.publicId:
            self.publicId = next_public_id(Complaint, 'CMP')
        # Business rule from the spec: resolving without an explicit date
        # defaults it to today, server-side.
        if self.status == 'Resolved' and not self.resolutionDate:
            from django.utils import timezone
            self.resolutionDate = timezone.localdate()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.publicId} — {self.callerName}"


# =============================================================================
# Escalation / "Manager Request"  (§7)
# =============================================================================

class Escalation(models.Model):
    publicId = models.CharField(max_length=20, unique=True, editable=False)

    # Real FK (not just a string) since the "only valid when the related
    # inquiry's priority is Urgent" rule needs the actual record to check
    # against. Serializer outputs inquiry.publicId as the 'inquiryId' string.
    inquiry = models.ForeignKey(Inquiry, on_delete=models.CASCADE, related_name='escalations')
    callerName = models.CharField(max_length=150)

    operatorName = models.CharField(max_length=150)  # display name snapshot, like AuditLog.userRole
    createdBy = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='escalations_raised')

    note = models.TextField()
    status = models.CharField(max_length=10, choices=[(s, s) for s in ESCALATION_STATUSES], default='Open')
    createdAt = models.DateTimeField(auto_now_add=True)

    resolutionNote = models.TextField(blank=True, default='')
    resolvedAt = models.DateTimeField(null=True, blank=True)

    def save(self, *args, **kwargs):
        if not self.publicId:
            self.publicId = next_public_id(Escalation, 'ESC')
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.publicId} — {self.callerName}"

    # NOTE: "only meaningful when inquiry.priority == 'Urgent'" is a
    # creation-time validation rule — enforce it in the serializer/view,
    # not here, so a later change to the inquiry's priority doesn't
    # retroactively invalidate an existing escalation.


# =============================================================================
# AuditLog  (§10)
# =============================================================================

class AuditLog(models.Model):
    """
    Append-only. performedBy/userRole are snapshots (not live FKs beyond
    performedBy itself) so historical entries still read correctly even if
    the user's role or name changes later — same reasoning as the
    Processing Fee project's AuditLog.userRole field.
    """
    actionDate = models.DateTimeField(auto_now_add=True)
    performedBy = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='audit_entries')
    userRole = models.CharField(max_length=60, blank=True, default='')  # role label AT THE TIME of the action

    action = models.CharField(max_length=255)          # e.g. "Update inquiry status"
    previousValue = models.CharField(max_length=150, blank=True, default='')
    newValue = models.CharField(max_length=150, blank=True, default='')
    reason = models.TextField(blank=True, default='')
    ipAddress = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        ordering = ['-actionDate']

    def __str__(self):
        return f"{self.actionDate:%Y-%m-%d %H:%M} — {self.action}"