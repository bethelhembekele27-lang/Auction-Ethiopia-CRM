from django.contrib.auth.models import User
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import serializers

import os
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests
from django.db import transaction

from django.contrib.auth import authenticate
from django.utils.dateparse import parse_date
 # add InquiryAttachment alongside whatever's already imported
from .models import (
    Inquiry,InquiryAttachment ,Employee, CATEGORIES, PRIORITIES, INQUIRY_STATUSES,
    Followup, FOLLOWUP_SETTABLE_STATUSES,VisitSetup, DAYS_OF_WEEK,Appointment, Followup,Role,Complaint, COMPLAINT_CATEGORIES, DEPARTMENTS, COMPLAINT_STATUSES,Escalation,
    AuditLog,PushSubscription,)
import re

ET_PHONE_RE = re.compile(r'^(?:\+251|0)(9|7)\d{8}$')

def validate_ethiopian_phone(value):
    cleaned = (value or '').replace(' ', '').replace('-', '')
    if not ET_PHONE_RE.match(cleaned):
        raise serializers.ValidationError(
            "Enter a valid Ethiopian phone number, e.g. 0912345678 or +251912345678."
        )
    return cleaned

# =============================================================================
# Roles
# =============================================================================

class RoleCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100)
    defaultPrivileges = serializers.ListField(child=serializers.CharField(), required=False, default=list)

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Role name is required.")
        if Role.objects.filter(name__iexact=value).exists():
            raise serializers.ValidationError("A role with that name already exists.")
        return value

    def create(self, validated_data):
        name = validated_data['name']
        privileges = validated_data.get('defaultPrivileges', [])
        base_key = slugify(name).replace('-', '_') or 'role'
        key = base_key
        suffix = 2
        while Role.objects.filter(key=key).exists():
            key = f"{base_key}_{suffix}"
            suffix += 1

        return Role.objects.create(
            key=key,
            name=name,
            isBuiltIn=False,
            defaultPrivileges=privileges,
        )
        
class RoleReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = Role
        fields = ['key', 'name', 'isBuiltIn', 'defaultPrivileges']

# =============================================================================
# Employees
# =============================================================================

class EmployeeSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source='publicId', read_only=True)
    username = serializers.CharField(source='user.username', read_only=True)
    email = serializers.CharField(source='user.email', read_only=True)  # ADD THIS LINE
    role = serializers.CharField(source='role.key', read_only=True)

    class Meta:
        model = Employee
        fields = [
            'id', 'name', 'username', 'email', 'role', 'status',  # add 'email' here too
            'lastPasswordChange', 'lastUsernameChange', 'privileges',
        ]


class EmployeeCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=150)
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True, min_length=6)
    role = serializers.CharField()
    email = serializers.EmailField(required=False, allow_blank=True)

    def validate_name(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError("Employee name is required.")

        if Employee.objects.filter(name__iexact=value).exists():
            raise serializers.ValidationError(
                "An employee with that name already exists."
            )

        return value

    def validate_username(self, value):
        value = value.strip().lower()

        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError(
                "That username is already taken."
            )

        return value

    def validate_email(self, value):
        value = value.strip().lower()

        if value and User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError(
                "That email is already in use by another account."
            )

        return value

    def validate_role(self, value):
        try:
            return Role.objects.get(key=value)
        except Role.DoesNotExist:
            raise serializers.ValidationError("Invalid role.")

    def create(self, validated_data):
        role = validated_data['role']

        # Create both User and Employee as one database transaction.
        # If Employee creation fails for any reason, the User creation
        # is rolled back automatically.
        with transaction.atomic():
            user = User.objects.create_user(
                username=validated_data['username'],
                password=validated_data['password'],
                email=validated_data.get('email', ''),
            )

            employee = Employee.objects.create(
                user=user,
                name=validated_data['name'],
                role=role,
                status='Active',
                privileges=list(role.defaultPrivileges),
                lastPasswordChange=timezone.now(),
            )

        return employee


class InquiryAttachmentSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = InquiryAttachment
        fields = ['id', 'fileName', 'url', 'uploadedAt']

    def get_url(self, obj):
        request = self.context.get('request')

        if not obj.file:
            return None

        if request:
            return request.build_absolute_uri(
                f'/api/inquiries/{obj.inquiry.publicId}/attachments/{obj.id}/'
            )

        return f'/api/inquiries/{obj.inquiry.publicId}/attachments/{obj.id}/'


class InquirySerializer(serializers.ModelSerializer):
    """
    Maps the Inquiry API fields onto the Inquiry model.

    Inquiry follow-ups are synchronized server-side:
    - Creating an Inquiry with followUpDate creates one linked Followup.
    - Changing followUpDate updates the linked Followup.
    - Clearing followUpDate removes an active/pending linked Followup.
    - Caller/company/batch changes are copied to the linked Followup.
    """

    id = serializers.CharField(source='publicId', read_only=True)
    operator = serializers.SerializerMethodField()
    followUpDate = serializers.CharField(required=False, allow_blank=True)
    resolvedDate = serializers.CharField(required=False, allow_blank=True)
    attachments = InquiryAttachmentSerializer(
        source='attachment_files',
        many=True,
        read_only=True
    )

    class Meta:
        model = Inquiry
        fields = [
            'id',
            'callerName',
            'phone',
            'company',
            'auction',
            'batch',
            'category',
            'priority',
            'operator',
            'dateTime',
            'description',
            'status',
            'followUpDate',
            'resolutionNotes',
            'resolvedDate',
            'attachments',
        ]

    def get_operator(self, obj):
        return obj.operator.name if obj.operator else ''

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['followUpDate'] = (
            instance.followUpDate.isoformat()
            if instance.followUpDate
            else ''
        )
        data['resolvedDate'] = (
            instance.resolvedDate.isoformat()
            if instance.resolvedDate
            else ''
        )
        return data

    def validate_category(self, value):
        if value not in CATEGORIES:
            raise serializers.ValidationError(
                f"Must be one of: {', '.join(CATEGORIES)}"
            )
        return value

    def validate_priority(self, value):
        if value not in PRIORITIES:
            raise serializers.ValidationError(
                f"Must be one of: {', '.join(PRIORITIES)}"
            )
        return value

    def validate_status(self, value):
        if value not in INQUIRY_STATUSES:
            raise serializers.ValidationError(
                f"Must be one of: {', '.join(INQUIRY_STATUSES)}"
            )
        return value

    def _sync_followup(self, inquiry, old_follow_up_date=None):
        """
        Keep the Inquiry's linked Followup synchronized.

        Only ever touches the *Pending* Followup tied to this inquiry —
        never a resolved (Satisfied/Not Satisfied/No Show) one. This
        matters: if the original auto-created Followup was already
        resolved and the Inquiry's follow-up date is changed afterward,
        a FRESH Pending Followup must be created, not the resolved one
        silently overwritten (which would corrupt a historical record
        with a new date while leaving its old resolved status intact).

        Appointment-created Followups are unaffected because their
        inquiry field is NULL.
        """
        pending = Followup.objects.filter(
            inquiry=inquiry, status='Pending'
        ).order_by('-id').first()

        if not inquiry.followUpDate:
            if pending:
                pending.delete()
            return

        if pending:
            pending.date = inquiry.followUpDate
            pending.callerName = inquiry.callerName
            pending.company = inquiry.company
            pending.batch = inquiry.batch    
            pending.assignedOperator = inquiry.operator
            pending.save()
        else:
            Followup.objects.create(
                inquiry=inquiry,
                callerName=inquiry.callerName,
                date=inquiry.followUpDate,
                reminder=True,
                assignedOperator=inquiry.operator,
                status='Pending',
                notes='',
                company=inquiry.company,
                batch=inquiry.batch,
                guideName='',
            )

    def create(self, validated_data):
        follow_up_raw = validated_data.pop('followUpDate', '')
        resolved_raw = validated_data.pop('resolvedDate', '')

        validated_data['followUpDate'] = (
            parse_date(follow_up_raw)
            if follow_up_raw
            else None
        )

        validated_data['resolvedDate'] = (
            parse_date(resolved_raw)
            if resolved_raw
            else None
        )

        # operator arrives via serializer.save(operator=...)
        # in InquiryListCreateView.
        inquiry = Inquiry.objects.create(**validated_data)

        # Automatically create the linked Followup if a date was supplied.
        self._sync_followup(inquiry)

        return inquiry

    def update(self, instance, validated_data):
        follow_up_was_supplied = 'followUpDate' in validated_data

        if follow_up_was_supplied:
            raw = validated_data.pop('followUpDate')

            instance.followUpDate = (
                parse_date(raw)
                if raw
                else None
            )

        if 'resolvedDate' in validated_data:
            raw = validated_data.pop('resolvedDate')

            instance.resolvedDate = (
                parse_date(raw)
                if raw
                else None
            )

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        instance.save()

        # Synchronize the linked Followup whenever the Inquiry is edited.
        #
        # We also do this when followUpDate wasn't part of the PATCH because
        # caller/company/batch/status/etc. may have changed and the Followup
        # stores copies of some Inquiry fields.
        self._sync_followup(instance)

        return instance
# =============================================================================
# Followups  (§3)
# =============================================================================

class FollowupSerializer(serializers.ModelSerializer):
    """
    Maps API_SPEC.md §3 field names onto the model:
    - `id` <-> Followup.publicId
    - `inquiryId` <-> Followup.inquiry (FK) — "" if not tied to an inquiry
    - `assignedOperator` <-> Employee.name, resolved both ways, same
      pattern as InquirySerializer.operator
    - `createdDate` is read-only here because the model field is
      auto_now_add=True — ANY client-supplied value (including the one
      the frontend currently sends on create) is ignored and the server
      always stamps "today". Flagging: if the frontend's client-sent
      createdDate is meant to win, drop auto_now_add on the model instead.
    - `status`: a follow-up is always created as "Pending" server-side
      (spec §11) and can only move FORWARD via PATCH to one of
      FOLLOWUP_SETTABLE_STATUSES — never back to "Pending". Enforced in
      validate_status() below rather than trusting the client.
    """
    id = serializers.CharField(source='publicId', read_only=True)
    inquiryId = serializers.CharField(required=False, allow_blank=True)
    assignedOperator = serializers.CharField(required=False, allow_blank=True)
    createdDate = serializers.DateField(read_only=True)


    class Meta:
        model = Followup
        fields = [
            'id', 'inquiryId', 'callerName', 'date', 'reminder',
            'assignedOperator', 'status', 'notes', 'createdDate',
            'company', 'batch', 'guideName',
        ]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['inquiryId'] = instance.inquiry.publicId if instance.inquiry else ''
        data['assignedOperator'] = instance.assignedOperator.name if instance.assignedOperator else ''
        return data

    def validate_status(self, value):
        if self.instance is None:
            # New follow-ups always start as Pending.
            if value and value != 'Pending':
                raise serializers.ValidationError(
                    "New follow-ups always start as 'Pending' — status is set server-side."
                )
        else:
            # When editing an existing Pending follow-up, allow Pending
            # to remain unchanged. This is necessary when editing its date
            # or notes without changing the follow-up outcome.
            if value == self.instance.status:
                return value

            if value not in FOLLOWUP_SETTABLE_STATUSES:
                raise serializers.ValidationError(
                    f"status must be one of: {', '.join(FOLLOWUP_SETTABLE_STATUSES)}"
                )

        return value

    def _resolve_inquiry(self, inquiry_id):
        if not inquiry_id:
            return None
        try:
            return Inquiry.objects.get(publicId=inquiry_id)
        except Inquiry.DoesNotExist:
            raise serializers.ValidationError({'inquiryId': f'No inquiry "{inquiry_id}" found.'})

    def _resolve_operator(self, name):
        if not name:
            return None
        try:
            return Employee.objects.get(name=name)
        except Employee.DoesNotExist:
            raise serializers.ValidationError({'assignedOperator': f'No employee named "{name}" found.'})

    def create(self, validated_data):
        inquiry_id = validated_data.pop('inquiryId', '')
        operator_name = validated_data.pop('assignedOperator', '')
        validated_data.pop('status', None)  # always forced below, regardless of input

        validated_data['inquiry'] = self._resolve_inquiry(inquiry_id)
        validated_data['assignedOperator'] = self._resolve_operator(operator_name)
        validated_data['status'] = 'Pending'

        return Followup.objects.create(**validated_data)

    def update(self, instance, validated_data):
        if 'inquiryId' in validated_data:
            instance.inquiry = self._resolve_inquiry(validated_data.pop('inquiryId'))
        if 'assignedOperator' in validated_data:
            instance.assignedOperator = self._resolve_operator(validated_data.pop('assignedOperator'))

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance
    
    



# =============================================================================
# Visit Setups  (§6)
# =============================================================================

class VisitSetupSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source='publicId', read_only=True)
    createdBy = serializers.CharField(source='createdBy.name', read_only=True, default='')
    createdDate = serializers.DateField(read_only=True)

    class Meta:
        model = VisitSetup
        fields = [
            'id', 'company', 'batch', 'dateFrom', 'dateTo', 'address', 'items',
            'guideName', 'guidePhone', 'guideTimeFrom', 'guideTimeTo',
            'createdBy', 'createdDate',
        ]

    def create(self, validated_data):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            try:
                validated_data['createdBy'] = request.user.employee
            except Employee.DoesNotExist:
                pass
        return super().create(validated_data)
    



# =============================================================================
# Account self-service  (password change + username edit for the CURRENT
# user — distinct from EmployeeDetailView, which is administrator-only
# and edits OTHER employees' records)
# =============================================================================

class ChangePasswordSerializer(serializers.Serializer):
    """
    PATCH /api/account/change-password/ — { oldPassword, newPassword }.
    Requires the current password so a hijacked/left-open session can't
    be used to lock the real owner out by silently swapping the password
    with nothing but a valid token.
    """
    oldPassword = serializers.CharField(write_only=True)
    newPassword = serializers.CharField(write_only=True, min_length=6)

    def validate(self, data):
        user = self.context['request'].user
        if not user.check_password(data['oldPassword']):
            raise serializers.ValidationError({'oldPassword': 'Current password is incorrect.'})
        if data['oldPassword'] == data['newPassword']:
            raise serializers.ValidationError({'newPassword': 'New password must be different from your current password.'})
        return data

    def save(self, **kwargs):
        user = self.context['request'].user
        user.set_password(self.validated_data['newPassword'])
        user.save(update_fields=['password'])
        try:
            employee = user.employee
            employee.lastPasswordChange = timezone.now()
            employee.save(update_fields=['lastPasswordChange'])
        except Employee.DoesNotExist:
            pass
        return user


class UpdateUsernameSerializer(serializers.Serializer):
    """PATCH /api/account/username/ — { username } for the CURRENT user."""
    username = serializers.CharField(max_length=150)

    def validate_username(self, value):
        value = value.strip().lower()
        if not value:
            raise serializers.ValidationError("Username is required.")
        user = self.context['request'].user
        if User.objects.filter(username__iexact=value).exclude(pk=user.pk).exists():
            raise serializers.ValidationError("That username is already taken.")
        return value

    def save(self, **kwargs):
        user = self.context['request'].user
        user.username = self.validated_data['username']
        user.save(update_fields=['username'])
        try:
            employee = user.employee
            employee.lastUsernameChange = timezone.now()
            employee.save(update_fields=['lastUsernameChange'])
        except Employee.DoesNotExist:
            pass
        return user


class AdminResetPasswordSerializer(serializers.Serializer):
    """
    POST /api/employees/<id>/reset-password/ — administrator only,
    { newPassword }. No old-password check by design: this is the
    "I forgot it" / "the employee is locked out" recovery path an admin
    uses on someone else's account, so there is no old password to check.
    """
    newPassword = serializers.CharField(write_only=True, min_length=6)

    def save(self, **kwargs):
        employee = self.context['employee']
        employee.user.set_password(self.validated_data['newPassword'])
        employee.user.save(update_fields=['password'])
        employee.lastPasswordChange = timezone.now()
        employee.save(update_fields=['lastPasswordChange'])
        return employee


# =============================================================================
# Auth  (§1)
# =============================================================================

class LoginSerializer(serializers.Serializer):
    """
    POST /auth/login — API_SPEC.md §1.
    Validates credentials via Django's authenticate(), and separately
    requires the user to have a linked Employee record (an authenticated
    Django user with no Employee — e.g. a superuser made via
    createsuperuser rather than through POST /employees/ — can log into
    Django but has no `role`/`operatorName` to report, so login is
    refused here rather than returning a broken/partial user object).
    """
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        username = data.get('username', '').strip().lower()
        password = data.get('password', '')

        user = authenticate(username=username, password=password)
        if user is None:
            raise serializers.ValidationError("Incorrect username or password.")
        if not user.is_active:
            raise serializers.ValidationError("This account has been deactivated.")

        try:
            employee = user.employee
        except Employee.DoesNotExist:
            raise serializers.ValidationError(
                "This account has no employee record and cannot access the CRM."
            )

        data['user'] = user
        data['employee'] = employee
        return data
    



# =============================================================================
# Appointments / Visitations  (§4)
# =============================================================================

class AppointmentSerializer(serializers.ModelSerializer):
    """
    Maps API_SPEC.md §4 field names onto the model.
    - `id` <-> Appointment.publicId
    - `assignedStaff` is plain free text, same as `guideName` — NOT
      resolved against Employee. A visit's assigned staff/guide is
      frequently someone from VisitSetup who isn't necessarily a CRM
      login (see guideName), so this field never validates against
      Employee and never silently drops input the way an FK lookup would.
    - `setupId` <-> VisitSetup FK, "" if not booked against one.
    - visitTime: TimeField formatted as plain "HH:MM" to match the
      frontend's <input type="time">, same as VisitSetup's guide times.
    - Auto-follow-up creation (spec §4) happens in create() below, NOT
      via a client-suppliable flag — every appointment created through
      this endpoint gets one, no opt-out.
    """
    id = serializers.CharField(source='publicId', read_only=True)
    setupId = serializers.CharField(required=False, allow_blank=True)
    visitTime = serializers.TimeField(format='%H:%M', input_formats=['%H:%M'])

    class Meta:
        model = Appointment
        fields = [
            'id', 'auction', 'visitorName', 'phone', 'company',
            'visitDate', 'visitTime', 'assignedStaff', 'status', 'notes',
            'setupId', 'batch', 'guideName', 'guidePhone', 'address', 'items',
        ]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['setupId'] = instance.setup.publicId if instance.setup else ''
        return data
    def validate_phone(self, value):
     return validate_ethiopian_phone(value)

    def _resolve_setup(self, setup_id):
        if not setup_id:
            return None
        try:
            return VisitSetup.objects.get(publicId=setup_id)
        except VisitSetup.DoesNotExist:
            raise serializers.ValidationError({'setupId': f'No visit setup "{setup_id}" found.'})

    def create(self, validated_data):
        setup_id = validated_data.pop('setupId', '')
        creating_employee = validated_data.pop('_creating_employee', None)

        validated_data['setup'] = self._resolve_setup(setup_id)

        appointment = Appointment.objects.create(**validated_data)

        # --- spec §4: auto-create the linked day-after follow-up ---
        next_day = appointment.visitDate + timezone.timedelta(days=1)
        batch_or_auction = appointment.batch or appointment.auction or '—'
        Followup.objects.create(
            inquiry=None,
            callerName=appointment.visitorName,
            date=next_day,
            reminder=True,
            assignedOperator=creating_employee,
            status='Pending',
            notes=(
                f"Follow up after the visit — ask {appointment.visitorName} "
                f"what they thought of the items ({batch_or_auction})."
            ),
            company=appointment.company,
            batch=appointment.batch,
            guideName=appointment.guideName or appointment.assignedStaff,
        )

        return appointment

    def update(self, instance, validated_data):
        if 'setupId' in validated_data:
            instance.setup = self._resolve_setup(validated_data.pop('setupId'))

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance
    
    



# =============================================================================
# Complaints  (§5)
# =============================================================================

class ComplaintSerializer(serializers.ModelSerializer):
    """
    Maps API_SPEC.md §5 field names onto the model.
    - `id` <-> Complaint.publicId
    - `inquiryId` is a plain string (soft reference, not FK) per the
      model's own comment — no resolution/validation against a real
      Inquiry, matches how the frontend already treats it (an optional
      free-text field on the New/Edit Complaint forms).
    - `resolutionDate` is read-only: Complaint.save() already
      auto-defaults it to today when status is set to "Resolved" without
      one supplied (spec §5) — this is model-level business logic, so the
      serializer doesn't duplicate it, just doesn't let the client
      override it directly either.
    - `date` (when logged) is auto_now_add on the model — also read-only
      here for the same reason createdDate is on Followup/VisitSetup.
    """
    id = serializers.CharField(source='publicId', read_only=True)
    resolutionDate = serializers.DateField(read_only=True)
    date = serializers.DateField(read_only=True)

    class Meta:
        model = Complaint
        fields = [
            'id', 'inquiryId', 'callerName', 'phone', 'category',
            'description', 'department', 'priority', 'status',
            'resolution', 'resolutionDate', 'date',
        ]

    def validate_category(self, value):
        if value not in COMPLAINT_CATEGORIES:
            raise serializers.ValidationError(f"Must be one of: {', '.join(COMPLAINT_CATEGORIES)}")
        return value

    def validate_department(self, value):
        if value not in DEPARTMENTS:
            raise serializers.ValidationError(f"Must be one of: {', '.join(DEPARTMENTS)}")
        return value
    def validate_phone(self, value):
        return validate_ethiopian_phone(value)

    def validate_status(self, value):
        if value not in COMPLAINT_STATUSES:
            raise serializers.ValidationError(f"Must be one of: {', '.join(COMPLAINT_STATUSES)}")
        return value

    def create(self, validated_data):
        return Complaint.objects.create(**validated_data)

    def update(self, instance, validated_data):
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()  # triggers the resolutionDate auto-default in Complaint.save()
        return instance
    


# =============================================================================
# Escalations / "Manager Requests"  (§7)
# =============================================================================

class EscalationSerializer(serializers.ModelSerializer):
    """
    Maps API_SPEC.md §7 field names onto the model.
    - `id` <-> Escalation.publicId
    - `inquiryId` <-> Escalation.inquiry (real FK, unlike Complaint's
      soft-reference inquiryId) — resolved both ways.
    - `createdByUsername` <-> Escalation.createdBy (FK to User) — exposed
      as the username string per spec, resolved from request.user in the
      view's post(), never accepted from the client body (a client
      claiming to be someone else here would defeat the whole point of
      role-scoped visibility).
    - status/createdAt/resolutionNote/resolvedAt are all server-set —
      "Request: Escalation object without id/status/createdAt/
      resolutionNote/resolvedAt (server sets these)" per spec.
    - Validates that the related inquiry's priority is "Urgent" at
      CREATE time only — see Escalation model's own comment: a later
      priority change on the inquiry must NOT retroactively invalidate
      an already-created escalation, so this check lives here and is
      never re-run.
    """
    id = serializers.CharField(source='publicId', read_only=True)
    inquiryId = serializers.CharField(required=False, allow_blank=True)
    createdByUsername = serializers.CharField(read_only=True)
    status = serializers.CharField(read_only=True)
    createdAt = serializers.SerializerMethodField()
    resolutionNote = serializers.CharField(read_only=True)
    resolvedAt = serializers.SerializerMethodField()

    class Meta:
        model = Escalation
        fields = [
            'id', 'inquiryId', 'callerName', 'operatorName',
            'createdByUsername', 'note', 'status', 'createdAt',
            'resolutionNote', 'resolvedAt',
        ]

    def get_createdAt(self, instance):
        return int(instance.createdAt.timestamp() * 1000)

    def get_resolvedAt(self, instance):
        return int(instance.resolvedAt.timestamp() * 1000) if instance.resolvedAt else None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['inquiryId'] = instance.inquiry.publicId
        data['createdByUsername'] = instance.createdBy.username if instance.createdBy else ''
        return data

    def validate(self, data):
        inquiry_id = data.get('inquiryId')
        try:
            inquiry = Inquiry.objects.get(publicId=inquiry_id)
        except Inquiry.DoesNotExist:
            raise serializers.ValidationError({'inquiryId': f'No inquiry "{inquiry_id}" found.'})

        if inquiry.priority != 'Urgent':
            raise serializers.ValidationError(
                "Escalations can only be raised from an inquiry with priority 'Urgent'."
            )

        data['_inquiry'] = inquiry
        return data

    def create(self, validated_data):
        inquiry = validated_data.pop('_inquiry')
        validated_data.pop('inquiryId', None)
        creating_user = validated_data.pop('_creating_user')

        return Escalation.objects.create(
            inquiry=inquiry,
            callerName=validated_data['callerName'],
            operatorName=validated_data['operatorName'],
            createdBy=creating_user,
            note=validated_data['note'],
            status='Open',
        )


class EscalationResolveSerializer(serializers.Serializer):
    """PATCH /escalations/:id/resolve — { resolutionNote: string }"""
    resolutionNote = serializers.CharField()

    def save(self, **kwargs):
        escalation = self.context['escalation']
        escalation.resolutionNote = self.validated_data['resolutionNote']
        escalation.status = 'Resolved'
        escalation.resolvedAt = timezone.now()
        escalation.save(update_fields=['resolutionNote', 'status', 'resolvedAt'])
        return escalation 
    



# =============================================================================
# Audit Log  (§10) — read-only, nothing POSTs to this from the frontend;
# entries are written server-side via the log_audit() helper in views.py.
# =============================================================================

class AuditLogSerializer(serializers.ModelSerializer):
    d = serializers.SerializerMethodField()
    t = serializers.SerializerMethodField()
    u = serializers.SerializerMethodField()
    r = serializers.CharField(source='userRole')
    a = serializers.CharField(source='action')
    pv = serializers.CharField(source='previousValue')
    nv = serializers.CharField(source='newValue')
    rs = serializers.CharField(source='reason')
    ip = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = ['d', 't', 'u', 'r', 'a', 'pv', 'nv', 'rs', 'ip']

    def get_d(self, obj):
        return timezone.localtime(obj.actionDate).date().isoformat()

    def get_t(self, obj):
        return timezone.localtime(obj.actionDate).strftime('%H:%M')

    def get_u(self, obj):
        return obj.performedBy.username if obj.performedBy else 'System'

    def get_ip(self, obj):
        return obj.ipAddress or '—'
    


# =============================================================================
# Google Sign-In  (new — not in original API_SPEC.md, additive)
# =============================================================================

class GoogleLoginSerializer(serializers.Serializer):
    """
    POST /auth/google/ — { id_token: string } from the frontend's Google
    Sign-In flow.

    IMPORTANT: this does NOT create new accounts. It only authenticates
    someone who already has a User (with a matching email) AND a linked
    Employee record — matching the project owner's explicit requirement
    that Google login is for "authenticated people who already have
    accounts in the system," not open signup. A Google account with no
    matching, Employee-linked User is rejected outright.
    """
    id_token = serializers.CharField()

    def validate(self, data):
        raw_token = data.get('id_token', '')
        client_id = os.environ.get('GOOGLE_CLIENT_ID')

        if not client_id:
            raise serializers.ValidationError('Google sign-in is not configured on this server.')

        try:
            claims = google_id_token.verify_oauth2_token(
                raw_token, google_requests.Request(), client_id
            )
        except ValueError:
            raise serializers.ValidationError('Invalid or expired Google token.')

        if not claims.get('email_verified', False):
            raise serializers.ValidationError('Google account email is not verified.')

        email = claims.get('email', '').strip().lower()
        if not email:
            raise serializers.ValidationError('No email present on the Google account.')

        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            raise serializers.ValidationError('This Google account is not linked to any employee record.')
        except User.MultipleObjectsReturned:
            # Shouldn't happen if emails are kept unique on creation, but
            # fail safely rather than picking one arbitrarily.
            raise serializers.ValidationError('Multiple accounts share this email — contact an administrator.')

        if not user.is_active:
            raise serializers.ValidationError('This account has been deactivated.')

        try:
            employee = user.employee
        except Employee.DoesNotExist:
            raise serializers.ValidationError(
                'This Google account has no employee record and cannot access the CRM.'
            )

        data['user'] = user
        data['employee'] = employee
        return data
    
class PushSubscriptionSerializer(serializers.Serializer):
    endpoint = serializers.URLField()
    keys = serializers.DictField()

    def create(self, validated_data):
        user = self.context['request'].user
        endpoint = validated_data['endpoint']
        keys = validated_data['keys']
        sub, _ = PushSubscription.objects.update_or_create(
            endpoint=endpoint,
            defaults={'user': user, 'p256dh': keys.get('p256dh', ''), 'auth': keys.get('auth', '')},
        )
        return sub