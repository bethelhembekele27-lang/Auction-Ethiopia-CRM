from django.db.models import Q
from rest_framework import status as http_status
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.authtoken.models import Token
from .permissions import has_any_role, RoleRequiredAPIView, ROLES_ANY_AUTHENTICATED_USER, ROLES_PUBLIC
from .throttles import LoginThrottle, PassVerifyThrottle
from .models import (
    Employee, Inquiry, PERMISSIONS, Role, Followup, VisitSetup,
    Appointment, Complaint, Escalation, AuditLog, InquiryAttachment, PushSubscription,
    PartyVerification, Pickup,
)
from .serializers import (
    EmployeeCreateSerializer,
    EmployeeSerializer,
    InquirySerializer,
    InquiryAttachmentSerializer,
    RoleCreateSerializer,
    RoleReadSerializer,
    FollowupSerializer,
    VisitSetupSerializer,
    AppointmentSerializer,
    ComplaintSerializer,
    EscalationSerializer,
    EscalationResolveSerializer,
    LoginSerializer,
    AuditLogSerializer,
    GoogleLoginSerializer,
    ChangePasswordSerializer,
    UpdateUsernameSerializer,
    AdminResetPasswordSerializer,
    PushSubscriptionSerializer,
    PickupSerializer,
)
from django.contrib.auth.models import User
from rest_framework.parsers import MultiPartParser
from django.shortcuts import get_object_or_404
import os
from .push import send_push_to_user
from .verification import (
    create_verification, build_visitation_messages, send_and_log,
    resolve_pass, verify_token, VerificationError,build_pickup_messages,
)
# =============================================================================
# Shared helpers
# =============================================================================

def _employee_for(user):
    """
    Resolves the Employee record for the authenticated request.user, or
    None if there isn't one (e.g. a Django superuser created via
    createsuperuser rather than through POST /employees/). Every account
    made through this API's own employee-creation flow has one — this
    guard only exists for that one out-of-band case.
    """
    try:
        return user.employee
    except Employee.DoesNotExist:
        return None


def _role_key_for(user):
    """Returns the requesting user's role key, or None if they have no
    linked Employee (see _employee_for docstring for why that can happen)."""
    employee = _employee_for(user)
    return employee.role.key if employee else None


def log_audit(request, action, previous_value='—', new_value='', reason=''):
    """
    Writes one AuditLog entry for the CURRENT request's user, per spec §10:
    "the server independently logs the same actions when it processes
    each write" — this is the single place every state-changing view
    calls into, rather than trusting the client-side echo the frontend
    also keeps (App.jsx addAudit()) as the source of truth.

    userRole is a SNAPSHOT of the role's display name at the time of the
    action (matches AuditLog.userRole's own docstring: "so historical
    entries still read correctly even if the user's role or name changes
    later") — pulled from employee.role.name, not the slug key, since
    that's what the frontend's Audit page already expects to display.
    """
    employee = _employee_for(request.user)
    AuditLog.objects.create(
        performedBy=request.user,
        userRole=employee.role.name if employee else '',
        action=action,
        previousValue=str(previous_value)[:150],
        newValue=str(new_value)[:150],
        reason=reason,
        ipAddress=request.META.get('REMOTE_ADDR'),
    )


# =============================================================================
# Auth  (§1)
# =============================================================================

class LoginView(RoleRequiredAPIView):
    """
    POST /api/auth/login/ — no auth required to hit this one.
    Response: { token, user: { username, role, operatorName } }
    operatorName is only populated for call_operator accounts (spec §1),
    and is sourced from Employee.name since that's the single display-name
    field the model has — it must match exactly what's used to filter
    "my own" follow-ups/escalations elsewhere in the app.
    """
    required_roles = ROLES_PUBLIC
    throttle_classes = [LoginThrottle]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        if not serializer.is_valid():
            first_error = next(iter(serializer.errors.values()))[0]
            return Response({'message': str(first_error)}, status=http_status.HTTP_401_UNAUTHORIZED)

        user = serializer.validated_data['user']
        employee = serializer.validated_data['employee']

        token, _ = Token.objects.get_or_create(user=user)

        role_key = employee.role.key
        operator_name = employee.name if role_key == 'call_operator' else None

        return Response({
            'token': token.key,
            'user': {
                'username': user.username,
                'role': role_key,
                'operatorName': operator_name,
            },
        })


class LogoutView(RoleRequiredAPIView):
    """
    POST /api/auth/logout/ -> 204 No Content.
    Deletes the current token so it can no longer authenticate.
    """
    required_roles = ROLES_ANY_AUTHENTICATED_USER

    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        return Response(status=http_status.HTTP_204_NO_CONTENT)


# =============================================================================
# Account self-service  (§ new — replaces the old nonexistent PATCH /auth/me
# the frontend was calling, which 404'd since no such route ever existed)
# =============================================================================

class ChangePasswordView(RoleRequiredAPIView):
    """PATCH /api/account/change-password/ — { oldPassword, newPassword }."""
    required_roles = ROLES_ANY_AUTHENTICATED_USER

    def patch(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        log_audit(request, 'Change own password', '—', '—', request.user.username)
        return Response({'message': 'Password updated.'})


class UpdateUsernameView(RoleRequiredAPIView):
    """PATCH /api/account/username/ — { username } for the current user."""
    required_roles = ROLES_ANY_AUTHENTICATED_USER

    def patch(self, request):
        prev_username = request.user.username
        serializer = UpdateUsernameSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        log_audit(request, 'Change own username', prev_username, user.username, '—')
        return Response({'username': user.username})


class EmployeeResetPasswordView(RoleRequiredAPIView):
    """
    POST /api/employees/<id>/reset-password/ — administrator only,
    { newPassword }. For an admin resetting someone ELSE's password
    (lockout recovery) — no old password required, unlike self-service
    change-password above.
    """
    required_roles = ('administrator',)

    def post(self, request, employee_id):
        try:
            employee = Employee.objects.select_related('user').get(publicId=employee_id)
        except Employee.DoesNotExist:
            return Response({'message': 'Employee not found.'}, status=http_status.HTTP_404_NOT_FOUND)

        serializer = AdminResetPasswordSerializer(data=request.data, context={'employee': employee})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        log_audit(request, 'Reset employee password', '—', '—', employee.user.username)
        return Response({'message': f"Password reset for {employee.user.username}."})


# =============================================================================
# Roles
# =============================================================================

class RoleListCreateView(RoleRequiredAPIView):
    method_roles = {'GET': ROLES_ANY_AUTHENTICATED_USER, 'POST': ('administrator',)}

    def get(self, request):
        if request.query_params.get('full'):
            roles = Role.objects.order_by('name')
            return Response(RoleReadSerializer(roles, many=True).data)
        keys = list(Role.objects.order_by('name').values_list('key', flat=True))
        return Response(keys)

    def post(self, request):
        serializer = RoleCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        role = serializer.save()
        log_audit(request, 'Add role', '—', role.name, 'New role created — assign privileges from Employees')
        return Response({'key': role.key, 'name': role.name}, status=http_status.HTTP_201_CREATED)


class RoleDeleteView(RoleRequiredAPIView):
    """
    DELETE /api/roles/<key>/ — administrator only. Refuses built-in roles,
    and refuses if any employee currently holds this role — reassignment
    is a deliberate separate action, never a silent side effect of delete.
    """
    required_roles = ('administrator',)

    def delete(self, request, role_key):
        try:
            role = Role.objects.get(key=role_key)
        except Role.DoesNotExist:
            return Response({'message': 'Role not found.'}, status=http_status.HTTP_404_NOT_FOUND)

        if role.isBuiltIn:
            return Response({'message': 'Built-in roles cannot be deleted.'}, status=http_status.HTTP_400_BAD_REQUEST)

        in_use = Employee.objects.filter(role=role).count()
        if in_use:
            return Response(
                {'message': f'{in_use} employee(s) still use this role. Reassign them to a different role first.'},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        role_name = role.name
        role.delete()
        log_audit(request, 'Delete role', role_name, '—', 'Role removed — no employees were assigned')
        return Response(status=http_status.HTTP_204_NO_CONTENT)


# =============================================================================
# Employees
# =============================================================================

class EmployeeListCreateView(RoleRequiredAPIView):
    """
    GET  /api/employees/  -> open to any authenticated user
    POST /api/employees/  -> administrator only (spec §8).
    """
    method_roles = {'GET': ROLES_ANY_AUTHENTICATED_USER, 'POST': ('administrator',)}

    def get(self, request):
        employees = Employee.objects.select_related('user', 'role').order_by('name')
        return Response(EmployeeSerializer(employees, many=True).data)

    def post(self, request):

        serializer = EmployeeCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        employee = serializer.save()
        log_audit(
            request, 'Add employee', '—', f'{employee.user.username} created',
            f'{employee.name} · {employee.role.name} — credentials sent by text',
        )
        return Response(EmployeeSerializer(employee).data, status=http_status.HTTP_201_CREATED)

class EmployeeDetailView(RoleRequiredAPIView):
    """
    SECURITY: patch() previously had no role check at all beyond
    IsAuthenticated — meaning ANY logged-in employee (any role, including
    a plain call_operator) could PATCH ANY OTHER employee's record by
    publicId and flip their status to Inactive, overwrite their name, or
    change their email — up to and including deactivating/renaming an
    administrator account. delete() already correctly checked for
    'administrator' inline; patch() did not. This endpoint is only ever
    called from the administrator-only Employees.jsx page in the current
    frontend, so requiring 'administrator' here does not break any
    legitimate flow — self-service profile edits go through a different
    endpoint (see AccountSettingsModal / the account/change-password and
    account/update endpoints), never this one.
    """
    required_roles = ('administrator',)

    def patch(self, request, employee_id):
        try:
            employee = Employee.objects.select_related('user').get(publicId=employee_id)
        except Employee.DoesNotExist:
            return Response({'message': 'Employee not found.'}, status=http_status.HTTP_404_NOT_FOUND)

        new_status = request.data.get('status')
        if new_status is not None:
            if new_status not in ('Active', 'Inactive'):
                return Response({'message': "status must be 'Active' or 'Inactive'."}, status=http_status.HTTP_400_BAD_REQUEST)
            employee.status = new_status
            employee.user.is_active = (new_status == 'Active')
            employee.user.save(update_fields=['is_active'])
            employee.save(update_fields=['status'])

        # ADD FROM HERE:
        name = request.data.get('name')
        if name is not None and name.strip():
            employee.name = name.strip()
            employee.save(update_fields=['name'])

        email = request.data.get('email')
        if email is not None:
            email = email.strip().lower()
            if email and User.objects.filter(email=email).exclude(pk=employee.user_id).exists():
                return Response({'message': 'That email is already linked to another account.'}, status=http_status.HTTP_400_BAD_REQUEST)
            employee.user.email = email
            employee.user.save(update_fields=['email'])
        # TO HERE

        return Response(EmployeeSerializer(employee).data)
    
    def delete(self, request, employee_id):
        try:
            employee = Employee.objects.select_related('user').get(publicId=employee_id)
        except Employee.DoesNotExist:
            return Response({'message': 'Employee not found.'}, status=http_status.HTTP_404_NOT_FOUND)
        username = employee.user.username
        employee.user.delete()  # cascades to Employee
        log_audit(request, 'Delete employee', username, '—', 'Permanently removed')
        return Response(status=http_status.HTTP_204_NO_CONTENT)



class EmployeePrivilegesView(RoleRequiredAPIView):
    required_roles = ('administrator',)
    def patch(self, request, employee_id):
        try:
            employee = Employee.objects.select_related('user').get(publicId=employee_id)
        except Employee.DoesNotExist:
            return Response({'message': 'Employee not found.'}, status=http_status.HTTP_404_NOT_FOUND)

        privileges = request.data.get('privileges', [])
        if not isinstance(privileges, list):
            return Response({'message': 'privileges must be a list.'}, status=http_status.HTTP_400_BAD_REQUEST)

        invalid = set(privileges) - set(PERMISSIONS)
        if invalid:
            return Response(
                {'message': f"Unknown privilege(s): {', '.join(sorted(invalid))}"},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        prev_count = len(employee.privileges)
        employee.privileges = privileges
        employee.save(update_fields=['privileges'])
        log_audit(
            request, 'Edit privileges',
            f'{prev_count}/{len(PERMISSIONS)}', f'{len(privileges)}/{len(PERMISSIONS)}',
            employee.user.username,
        )
        return Response(EmployeeSerializer(employee).data)


# =============================================================================
# Inquiries
# =============================================================================

class InquiryListCreateView(RoleRequiredAPIView):
    """
    GET  /api/inquiries/?category=&priority=&status=&operator=&q=
         `q` is free-text across callerName, phone, company, publicId.
    POST /api/inquiries/
    """
    required_roles = ROLES_ANY_AUTHENTICATED_USER

    def get(self, request):
        qs = Inquiry.objects.all().order_by('-dateTime')

        category = request.query_params.get('category')
        priority = request.query_params.get('priority')
        status_param = request.query_params.get('status')
        operator = request.query_params.get('operator')
        q = request.query_params.get('q')

        if category:
            qs = qs.filter(category=category)
        if priority:
            qs = qs.filter(priority=priority)
        if status_param:
            qs = qs.filter(status=status_param)
        if operator:
            qs = qs.filter(operator__name=operator)
        if q:
            qs = qs.filter(
                Q(callerName__icontains=q) | Q(phone__icontains=q) |
                Q(company__icontains=q) | Q(publicId__icontains=q)
            )

        return Response(InquirySerializer(qs, many=True, context={'request': request}).data)

    def post(self, request):
        serializer = InquirySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        operator = _employee_for(request.user)   # already defined near the top of views.py
        inquiry = serializer.save(operator=operator)
        log_audit(request, 'Log inquiry', '—', f'{inquiry.publicId} created', f'{inquiry.category} from {inquiry.callerName}')
        return Response(InquirySerializer(inquiry, context={'request': request}).data, status=http_status.HTTP_201_CREATED)

class InquiryDetailView(RoleRequiredAPIView):
    required_roles = ROLES_ANY_AUTHENTICATED_USER

    def get_object(self, inquiry_id):
        try:
            return Inquiry.objects.get(publicId=inquiry_id)
        except Inquiry.DoesNotExist:
            return None

    def get(self, request, inquiry_id):
        inquiry = self.get_object(inquiry_id)
        if inquiry is None:
            return Response({'message': 'Inquiry not found.'}, status=http_status.HTTP_404_NOT_FOUND)
        return Response(InquirySerializer(inquiry, context={'request': request}).data)

    def patch(self, request, inquiry_id):
        inquiry = self.get_object(inquiry_id)
        if inquiry is None:
            return Response({'message': 'Inquiry not found.'}, status=http_status.HTTP_404_NOT_FOUND)

        prev_status = inquiry.status
        serializer = InquirySerializer(inquiry, data=request.data, partial=True, context={'request': request})
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()

        if prev_status != updated.status:
            log_audit(request, 'Update inquiry status', prev_status, updated.status, f'{updated.publicId} · {updated.callerName}')
        else:
            log_audit(request, 'Edit inquiry', '—', updated.publicId, f'Details updated for {updated.callerName}')

        return Response(InquirySerializer(updated, context={'request': request}).data)

    def delete(self, request, inquiry_id):
        inquiry = self.get_object(inquiry_id)
        if inquiry is None: 
            return Response({'message': 'Inquiry not found.'}, status=http_status.HTTP_404_NOT_FOUND)
        pid, caller = inquiry.publicId, inquiry.callerName
        inquiry.delete()
        log_audit(request, 'Delete inquiry', f'{pid} · {caller}', '—', 'Permanently removed')
        return Response(status=http_status.HTTP_204_NO_CONTENT)


class InquiryAttachmentView(RoleRequiredAPIView):
    parser_classes = [MultiPartParser]
    method_roles = {
        'GET': ROLES_ANY_AUTHENTICATED_USER,
        'POST': ('administrator', 'call_operator', 'auction_manager'),
        'DELETE': ('administrator', 'call_operator', 'auction_manager'),
    }

    def post(self, request, inquiry_id):
        inquiry = get_object_or_404(Inquiry, publicId=inquiry_id)
        f = request.FILES.get('file')

        if not f:
            return Response(
                {'message': 'file is required'},
                status=http_status.HTTP_400_BAD_REQUEST
            )

        att = InquiryAttachment.objects.create(
            inquiry=inquiry,
            file=f,
            fileName=f.name,
            fileSize=f.size,
            uploadedBy=request.user,
        )

        return Response(
            InquiryAttachmentSerializer(
                att,
                context={'request': request}
            ).data
        )

    def get(self, request, inquiry_id, attachment_id):
        att = get_object_or_404(
            InquiryAttachment,
            id=attachment_id,
            inquiry__publicId=inquiry_id,
        )

        if not att.file:
            return Response(
                {'message': 'Attachment file not found.'},
                status=http_status.HTTP_404_NOT_FOUND
            )

        from django.http import FileResponse

        try:
            response = FileResponse(
                att.file.open('rb'),
                as_attachment=False,
                filename=att.fileName,
            )
            return response
        except FileNotFoundError:
            return Response(
                {'message': 'Attachment file not found on the server.'},
                status=http_status.HTTP_404_NOT_FOUND
            )

    def delete(self, request, inquiry_id, attachment_id):
        att = get_object_or_404(
            InquiryAttachment,
            id=attachment_id,
            inquiry__publicId=inquiry_id,
        )

        att.delete()

        return Response(status=http_status.HTTP_204_NO_CONTENT)


# =============================================================================
# Followups  (§3)
# =============================================================================

class FollowupListCreateView(RoleRequiredAPIView):
    """
    GET  /api/followups/?operator=&status=&reminder=
    POST /api/followups/
    """
    required_roles = ROLES_ANY_AUTHENTICATED_USER

    def get(self, request):
        qs = Followup.objects.all().order_by('date')

        operator = request.query_params.get('operator')
        status_param = request.query_params.get('status')
        reminder = request.query_params.get('reminder')

        if operator:
            qs = qs.filter(assignedOperator__name=operator)
        if status_param:
            qs = qs.filter(status=status_param)
        if reminder is not None:
            qs = qs.filter(reminder=reminder.lower() in ('1', 'true', 'yes'))

        return Response(FollowupSerializer(qs, many=True).data)

    def post(self, request):
        serializer = FollowupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        followup = serializer.save()
        log_audit(
            request, 'Create follow-up', '—', f'{followup.publicId} created',
            f'Reminder for {followup.callerName} on {followup.date.isoformat()}',
        )
        return Response(FollowupSerializer(followup).data, status=http_status.HTTP_201_CREATED)


class FollowupDetailView(RoleRequiredAPIView):
    """
    PATCH /api/followups/<publicId>/ — update a follow-up.
    DELETE /api/followups/<publicId>/ — delete a follow-up.
    """
    required_roles = ROLES_ANY_AUTHENTICATED_USER

    def patch(self, request, followup_id):
        try:
            followup = Followup.objects.get(publicId=followup_id)
        except Followup.DoesNotExist:
            return Response(
                {'message': 'Follow-up not found.'},
                status=http_status.HTTP_404_NOT_FOUND
            )

        prev_status = followup.status
        serializer = FollowupSerializer(
            followup,
            data=request.data,
            partial=True
        )
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()

        if prev_status != updated.status:
            log_audit(
                request,
                'Update follow-up',
                prev_status,
                updated.status,
                f'{updated.publicId} · {updated.callerName}'
            )

        return Response(FollowupSerializer(updated).data)

    def delete(self, request, followup_id):
        try:
            followup = Followup.objects.get(publicId=followup_id)
        except Followup.DoesNotExist:
            return Response(
                {'message': 'Follow-up not found.'},
                status=http_status.HTTP_404_NOT_FOUND
            )

        public_id = followup.publicId
        caller_name = followup.callerName
        followup_date = followup.date

        followup.delete()

        log_audit(
            request,
            'Delete follow-up',
            'Existing',
            'Deleted',
            f'{public_id} · {caller_name}'
        )

        return Response(
            status=http_status.HTTP_204_NO_CONTENT
        )
# =============================================================================
# Visit Setups  (§6)
# =============================================================================

class VisitSetupListCreateView(RoleRequiredAPIView):
    """
    GET  /api/visit-setups/?q=  — q searches company, batch, guide name, ID.
    POST /api/visit-setups/     — createdBy/createdDate are server-set,
                                   never accepted from the client.
    """
    required_roles = ROLES_ANY_AUTHENTICATED_USER

    def get(self, request):
        qs = VisitSetup.objects.all().order_by('-createdDate')

        q = request.query_params.get('q')
        if q:
            qs = qs.filter(
                Q(company__icontains=q) | Q(batch__icontains=q) |
                Q(guideName__icontains=q) | Q(publicId__icontains=q)
            )

        return Response(VisitSetupSerializer(qs, many=True).data)

    def post(self, request):
        serializer = VisitSetupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        visit_setup = serializer.save(createdBy=_employee_for(request.user))
        log_audit(
            request, 'Create visit setup', '—', f'{visit_setup.publicId} created',
            f'{visit_setup.company} · {visit_setup.batch} — guide {visit_setup.guideName}',
        )
        return Response(VisitSetupSerializer(visit_setup).data, status=http_status.HTTP_201_CREATED)


class VisitSetupDetailView(RoleRequiredAPIView):
    """PATCH /api/visit-setups/<publicId>/ — partial updates."""
    method_roles = {'PATCH': ROLES_ANY_AUTHENTICATED_USER, 'DELETE': ('administrator',)}

    def patch(self, request, visit_setup_id):
        try:
            visit_setup = VisitSetup.objects.get(publicId=visit_setup_id)
        except VisitSetup.DoesNotExist:
            return Response({'message': 'Visit setup not found.'}, status=http_status.HTTP_404_NOT_FOUND)

        serializer = VisitSetupSerializer(visit_setup, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()
        log_audit(request, 'Edit visit setup', '—', updated.publicId, f'{updated.company} · {updated.batch}')
        return Response(VisitSetupSerializer(updated).data)
    
    def delete(self, request, visit_setup_id):
        try:
            vs = VisitSetup.objects.get(publicId=visit_setup_id)
        except VisitSetup.DoesNotExist:
            return Response({'message': 'Visit setup not found.'}, status=http_status.HTTP_404_NOT_FOUND)
        pid = vs.publicId
        vs.delete()
        log_audit(request, 'Delete visit setup', pid, '—', 'Permanently removed')
        return Response(status=http_status.HTTP_204_NO_CONTENT)


# =============================================================================
# Appointments / Visitations  (§4)
# =============================================================================

class AppointmentListCreateView(RoleRequiredAPIView):
    """
    GET  /api/appointments/?status=&auction=
    POST /api/appointments/ — auto-creates the linked day-after follow-up
                               server-side (see AppointmentSerializer.create).
    """
    required_roles = ROLES_ANY_AUTHENTICATED_USER

    def get(self, request):
        qs = Appointment.objects.all().order_by('visitDate')

        status_param = request.query_params.get('status')
        auction = request.query_params.get('auction')

        if status_param:
            qs = qs.filter(status=status_param)
        if auction:
            qs = qs.filter(auction=auction)

        return Response(AppointmentSerializer(qs, many=True).data)

    def post(self, request):
        serializer = AppointmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        appointment = serializer.save(_creating_employee=_employee_for(request.user))
        log_audit(
            request, 'Register visitor', '—', f'{appointment.publicId} created',
            f'{appointment.visitorName} · {appointment.company} · {appointment.batch}',
        )
        return Response(AppointmentSerializer(appointment).data, status=http_status.HTTP_201_CREATED)


class AppointmentDetailView(RoleRequiredAPIView):
    """PATCH /api/appointments/<publicId>/ — partial updates."""
    method_roles = {'PATCH': ROLES_ANY_AUTHENTICATED_USER, 'DELETE': ('administrator', 'auction_manager')}

    def patch(self, request, appointment_id):
        try:
            appointment = Appointment.objects.get(publicId=appointment_id)
        except Appointment.DoesNotExist:
            return Response({'message': 'Appointment not found.'}, status=http_status.HTTP_404_NOT_FOUND)

        prev_status = appointment.status
        serializer = AppointmentSerializer(appointment, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()

        if prev_status != updated.status:
            log_audit(
                request, 'Update visitation status', prev_status, updated.status,
                f'{updated.publicId} · {updated.visitorName}',
            )

        return Response(AppointmentSerializer(updated).data)
    
    def delete(self, request, appointment_id):
        try:
            appt = Appointment.objects.get(publicId=appointment_id)
        except Appointment.DoesNotExist:
            return Response({'message': 'Appointment not found.'}, status=http_status.HTTP_404_NOT_FOUND)
        pid, name = appt.publicId, appt.visitorName
        appt.delete()
        log_audit(request, 'Delete visitation', f'{pid} · {name}', '—', 'Permanently removed')
        return Response(status=http_status.HTTP_204_NO_CONTENT)


class AppointmentSendConfirmationView(RoleRequiredAPIView):
    """
    POST /api/appointments/<id>/send-confirmation/

    Manual trigger only — per the project handoff, confirmations are
    NEVER sent automatically on Appointment creation. Open to every role
    except viewer (viewers can't edit appointments at all, so they
    shouldn't be able to trigger outbound SMS either).

    Creates a fresh PartyVerification (invalidating any previous one for
    this appointment — see create_verification()'s docstring), sends the
    visitor SMS unconditionally, and the guide SMS only if a guide phone
    is on file. Every attempt is logged to NotificationLog regardless of
    success/failure (see verification.send_and_log), and one AuditLog
    entry is written summarizing the outcome, matching how every other
    state-changing view in this file logs to AuditLog.
    """
    required_roles = ('administrator', 'call_operator', 'auction_manager')

    def post(self, request, appointment_id):
        try:
            appointment = Appointment.objects.get(publicId=appointment_id)
        except Appointment.DoesNotExist:
            return Response({'message': 'Appointment not found.'}, status=http_status.HTTP_404_NOT_FOUND)

        verification = create_verification('visitation', appointment.publicId)
        visitor_message, guide_message = build_visitation_messages(appointment, verification)

        visitor_log = send_and_log('visitation', appointment.publicId, 'visitor', appointment.phone, visitor_message)

        guide_log = None
        if appointment.guidePhone:
            guide_log = send_and_log('visitation', appointment.publicId, 'guide', appointment.guidePhone, guide_message)

        summary = f'{appointment.visitorName} · visitor {visitor_log.status}'
        summary += f', guide {guide_log.status}' if guide_log else ', no guide phone on file — guide SMS skipped'
        log_audit(request, 'Send visitation confirmation', '—', appointment.publicId, summary)

        return Response({
            'message': 'Confirmation sent.',
            'visitor': {'status': visitor_log.status, 'detail': visitor_log.providerResponse},
            'guide': {'status': guide_log.status, 'detail': guide_log.providerResponse} if guide_log else None,
        })


class AppointmentPreviewConfirmationView(RoleRequiredAPIView):
    """
    GET /api/appointments/<id>/preview-confirmation/

    Returns the SMS messages that would be sent without actually sending them.
    Used by the frontend's preview-before-send modal.
    """
    required_roles = ('administrator', 'call_operator', 'auction_manager')

    def get(self, request, appointment_id):
        try:
            appointment = Appointment.objects.get(publicId=appointment_id)
        except Appointment.DoesNotExist:
            return Response({'message': 'Appointment not found.'}, status=http_status.HTTP_404_NOT_FOUND)

        # Create a temporary verification to generate the messages
        verification = create_verification('visitation', appointment.publicId)
        visitor_message, guide_message = build_visitation_messages(appointment, verification)

        # Delete the temporary verification since we're only previewing
        verification.delete()

        return Response({
            'id': appointment.publicId,
            'visitorMessage': visitor_message,
            'guideMessage': guide_message if appointment.guidePhone else None,
        })


class AppointmentBulkSendConfirmationView(RoleRequiredAPIView):
    """
    POST /api/appointments/send-confirmation-bulk/

    Sends confirmations for multiple appointments at once.
    Body: { ids: ["id1", "id2", ...] }
    Returns: { results: [{ id, ok, visitor: {status, detail}, guide: {status, detail} | null }] }
    """
    required_roles = ('administrator', 'call_operator', 'auction_manager')

    def post(self, request):
        ids = request.data.get('ids', [])
        if not ids:
            return Response({'message': 'No IDs provided.'}, status=http_status.HTTP_400_BAD_REQUEST)

        results = []
        for appointment_id in ids:
            try:
                appointment = Appointment.objects.get(publicId=appointment_id)
                verification = create_verification('visitation', appointment.publicId)
                visitor_message, guide_message = build_visitation_messages(appointment, verification)

                visitor_log = send_and_log('visitation', appointment.publicId, 'visitor', appointment.phone, visitor_message)

                guide_log = None
                if appointment.guidePhone:
                    guide_log = send_and_log('visitation', appointment.publicId, 'guide', appointment.guidePhone, guide_message)

                results.append({
                    'id': appointment.publicId,
                    'ok': True,
                    'visitor': {'status': visitor_log.status, 'detail': visitor_log.providerResponse},
                    'guide': {'status': guide_log.status, 'detail': guide_log.providerResponse} if guide_log else None,
                })
            except Appointment.DoesNotExist:
                results.append({'id': appointment_id, 'ok': False})
            except Exception:
                results.append({'id': appointment_id, 'ok': False})

        return Response({'results': results})


class PickupListCreateView(RoleRequiredAPIView):
    required_roles = ROLES_ANY_AUTHENTICATED_USER

    def get(self, request):
        qs = Pickup.objects.all().order_by('pickupDate')
        status_param = request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
        return Response(PickupSerializer(qs, many=True).data)

    def post(self, request):
        serializer = PickupSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        pickup = serializer.save()
        log_audit(request, 'Schedule pickup', '—', f'{pickup.publicId} created',
                   f'{pickup.winnerName} · {pickup.itemDescription or pickup.auction}')
        return Response(PickupSerializer(pickup).data, status=http_status.HTTP_201_CREATED)


class PickupDetailView(RoleRequiredAPIView):
    method_roles = {'PATCH': ROLES_ANY_AUTHENTICATED_USER, 'DELETE': ('administrator', 'auction_manager')}

    def patch(self, request, pickup_id):
        try:
            pickup = Pickup.objects.get(publicId=pickup_id)
        except Pickup.DoesNotExist:
            return Response({'message': 'Pickup not found.'}, status=http_status.HTTP_404_NOT_FOUND)
        prev_status = pickup.status
        serializer = PickupSerializer(pickup, data=request.data, partial=True, context={'request': request})
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()
        if prev_status != updated.status:
            log_audit(request, 'Update pickup status', prev_status, updated.status,
                       f'{updated.publicId} · {updated.winnerName}')
        return Response(PickupSerializer(updated).data)

    def delete(self, request, pickup_id):
        try:
            pu = Pickup.objects.get(publicId=pickup_id)
        except Pickup.DoesNotExist:
            return Response({'message': 'Pickup not found.'}, status=http_status.HTTP_404_NOT_FOUND)
        pid, name = pu.publicId, pu.winnerName
        pu.delete()
        log_audit(request, 'Delete pickup', f'{pid} · {name}', '—', 'Permanently removed')
        return Response(status=http_status.HTTP_204_NO_CONTENT)


class PickupSendConfirmationView(RoleRequiredAPIView):
    """Mirrors AppointmentSendConfirmationView exactly."""
    required_roles = ('administrator', 'call_operator', 'auction_manager')

    def post(self, request, pickup_id):
        try:
            pickup = Pickup.objects.get(publicId=pickup_id)
        except Pickup.DoesNotExist:
            return Response({'message': 'Pickup not found.'}, status=http_status.HTTP_404_NOT_FOUND)

        verification = create_verification('pickup', pickup.publicId)
        winner_message, guide_message = build_pickup_messages(pickup, verification)

        winner_log = send_and_log('pickup', pickup.publicId, 'visitor', pickup.phone, winner_message)
        guide_log = None
        if pickup.guidePhone:
            guide_log = send_and_log('pickup', pickup.publicId, 'guide', pickup.guidePhone, guide_message)

        summary = f'{pickup.winnerName} · winner {winner_log.status}'
        summary += f', guide {guide_log.status}' if guide_log else ', no guide phone on file — guide SMS skipped'
        log_audit(request, 'Send pickup confirmation', '—', pickup.publicId, summary)

        return Response({
            'message': 'Confirmation sent.',
            'visitor': {'status': winner_log.status, 'detail': winner_log.providerResponse},
            'guide': {'status': guide_log.status, 'detail': guide_log.providerResponse} if guide_log else None,
        })


class PickupPreviewConfirmationView(RoleRequiredAPIView):
    """
    GET /api/pickups/<id>/preview-confirmation/

    Returns the SMS messages that would be sent without actually sending them.
    Used by the frontend's preview-before-send modal.
    """
    required_roles = ('administrator', 'call_operator', 'auction_manager')

    def get(self, request, pickup_id):
        try:
            pickup = Pickup.objects.get(publicId=pickup_id)
        except Pickup.DoesNotExist:
            return Response({'message': 'Pickup not found.'}, status=http_status.HTTP_404_NOT_FOUND)

        # Create a temporary verification to generate the messages
        verification = create_verification('pickup', pickup.publicId)
        winner_message, guide_message = build_pickup_messages(pickup, verification)

        # Delete the temporary verification since we're only previewing
        verification.delete()

        return Response({
            'id': pickup.publicId,
            'visitorMessage': winner_message,
            'guideMessage': guide_message if pickup.guidePhone else None,
        })


class PickupBulkSendConfirmationView(RoleRequiredAPIView):
    """
    POST /api/pickups/send-confirmation-bulk/

    Sends confirmations for multiple pickups at once.
    Body: { ids: ["id1", "id2", ...] }
    Returns: { results: [{ id, ok, visitor: {status, detail}, guide: {status, detail} | null }] }
    """
    required_roles = ('administrator', 'call_operator', 'auction_manager')

    def post(self, request):
        ids = request.data.get('ids', [])
        if not ids:
            return Response({'message': 'No IDs provided.'}, status=http_status.HTTP_400_BAD_REQUEST)

        results = []
        for pickup_id in ids:
            try:
                pickup = Pickup.objects.get(publicId=pickup_id)
                verification = create_verification('pickup', pickup.publicId)
                winner_message, guide_message = build_pickup_messages(pickup, verification)

                winner_log = send_and_log('pickup', pickup.publicId, 'visitor', pickup.phone, winner_message)

                guide_log = None
                if pickup.guidePhone:
                    guide_log = send_and_log('pickup', pickup.publicId, 'guide', pickup.guidePhone, guide_message)

                results.append({
                    'id': pickup.publicId,
                    'ok': True,
                    'visitor': {'status': winner_log.status, 'detail': winner_log.providerResponse},
                    'guide': {'status': guide_log.status, 'detail': guide_log.providerResponse} if guide_log else None,
                })
            except Pickup.DoesNotExist:
                results.append({'id': pickup_id, 'ok': False})
            except Exception:
                results.append({'id': pickup_id, 'ok': False})

        return Response({'results': results})


# =============================================================================
# Complaints  (§5)
# =============================================================================

class ComplaintListCreateView(RoleRequiredAPIView):
    """
    GET  /api/complaints/?status=
    POST /api/complaints/ — callerName and description required (enforced
                             by the model).
    """
    required_roles = ROLES_ANY_AUTHENTICATED_USER

    def get(self, request):
        qs = Complaint.objects.all().order_by('-date')

        status_param = request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)

        return Response(ComplaintSerializer(qs, many=True).data)

    def post(self, request):
        serializer = ComplaintSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        complaint = serializer.save()
        log_audit(request, 'Log complaint', '—', f'{complaint.category} — {complaint.callerName}', complaint.publicId)
        return Response(ComplaintSerializer(complaint).data, status=http_status.HTTP_201_CREATED)


class ComplaintDetailView(RoleRequiredAPIView):
    """
    PATCH /api/complaints/<publicId>/ — if status is set to "Resolved"
    without resolutionDate, Complaint.save() defaults it to today.
    """
    method_roles = {'PATCH': ROLES_ANY_AUTHENTICATED_USER, 'DELETE': ('administrator', 'auction_manager')}

    def patch(self, request, complaint_id):
        try:
            complaint = Complaint.objects.get(publicId=complaint_id)
        except Complaint.DoesNotExist:
            return Response({'message': 'Complaint not found.'}, status=http_status.HTTP_404_NOT_FOUND)

        prev_status = complaint.status
        serializer = ComplaintSerializer(complaint, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()

        if prev_status != updated.status:
            log_audit(
                request, 'Update complaint status', prev_status, updated.status,
                f'{updated.publicId} · {updated.callerName}',
            )

        if prev_status != 'Resolved' and updated.status == 'Resolved' and updated.inquiryId:
            try:
                linked_inquiry = Inquiry.objects.select_related('operator__user').get(publicId=updated.inquiryId)
                if linked_inquiry.operator and linked_inquiry.operator.user:
                    send_push_to_user(
                        linked_inquiry.operator.user,
                        title=f"Complaint resolved — {updated.publicId}",
                        body=f'{updated.callerName}\'s complaint ({updated.category}) was resolved.',
                        url="/?page=complaints",
                    )
            except Inquiry.DoesNotExist:
                pass

        return Response(ComplaintSerializer(updated).data)
    
    def delete(self, request, complaint_id):
        try:
            c = Complaint.objects.get(publicId=complaint_id)
        except Complaint.DoesNotExist:
            return Response({'message': 'Complaint not found.'}, status=http_status.HTTP_404_NOT_FOUND)
        pid, caller = c.publicId, c.callerName
        c.delete()
        log_audit(request, 'Delete complaint', f'{pid} · {caller}', '—', 'Permanently removed')
        return Response(status=http_status.HTTP_204_NO_CONTENT)


# =============================================================================
# Escalations / "Manager Requests"  (§7)
# =============================================================================

class EscalationListCreateView(RoleRequiredAPIView):
    """
    GET  /api/escalations/ — role-scoped server-side, NOT client-filtered:
         call_operator sees only escalations they personally created;
         auction_manager / administrator see all.
    POST /api/escalations/ — only valid when the related inquiry's
         priority is "Urgent" (checked in EscalationSerializer.validate).
    """
    required_roles = ROLES_ANY_AUTHENTICATED_USER

    def get(self, request):
        role_key = _role_key_for(request.user)
        qs = Escalation.objects.all().order_by('-createdAt')

        if role_key == 'call_operator':
            qs = qs.filter(createdBy=request.user)
        # auction_manager / administrator (and any other role, pending the
        # permission-enforcement pass — item #9) see all.

        return Response(EscalationSerializer(qs, many=True).data)

    def post(self, request):
        serializer = EscalationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        escalation = serializer.save(_creating_user=request.user)
        log_audit(
            request, 'Send to Auction Manager', '—', f'{escalation.publicId} created',
            f'{escalation.inquiry.publicId} · {escalation.callerName} — flagged by {escalation.operatorName}',
        )

        # Push every auction_manager — they don't get in-app-only paging for
        # this, same as the existing bell/popup behavior for this notification kind.
        managers = User.objects.filter(employee__role__key='auction_manager')
        for manager in managers:
            send_push_to_user(
                manager,
                title=f"New manager request from {escalation.operatorName}",
                body=f'{escalation.inquiry.publicId} ({escalation.callerName}) — "{escalation.note[:80]}"',
                url="/?page=escalations",
            )

        return Response(EscalationSerializer(escalation).data, status=http_status.HTTP_201_CREATED)


class EscalationResolveView(RoleRequiredAPIView):
    """
    PATCH /api/escalations/<publicId>/resolve/ — auction_manager /
    administrator only (spec §7).
    """
    required_roles = ('auction_manager', 'administrator')

    def patch(self, request, escalation_id):
        try:
            escalation = Escalation.objects.get(publicId=escalation_id)
        except Escalation.DoesNotExist:
            return Response({'message': 'Escalation not found.'}, status=http_status.HTTP_404_NOT_FOUND)

        if escalation.status == 'Resolved':
            return Response(
                {'message': 'This manager request has already been resolved.'},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        serializer = EscalationResolveSerializer(data=request.data, context={'escalation': escalation})
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()
        log_audit(
            request, 'Resolve manager request', 'Open', 'Resolved',
            f'{updated.publicId} · notified {updated.operatorName}',
        )

        if updated.createdBy:
            send_push_to_user(
                updated.createdBy,
                title=f"Manager request resolved — {updated.publicId}",
                body=f'The Auction Manager resolved your request on {updated.inquiry.publicId} ({updated.callerName}): "{(updated.resolutionNote or "")[:80]}"',
                url="/?page=inquiries",
            )

        return Response(EscalationSerializer(updated).data)


# =============================================================================
# Audit Log  (§10)
# =============================================================================

class AuditLogListView(RoleRequiredAPIView):
    """
    GET /api/audit/?from=&to=&user=&action=
    administrator and auction_manager only (spec §10).
    """
    required_roles = ('administrator', 'auction_manager')

    def get(self, request):
        qs = AuditLog.objects.all().order_by('-actionDate')

        from_date = request.query_params.get('from')
        to_date = request.query_params.get('to')
        user = request.query_params.get('user')
        action = request.query_params.get('action')

        if from_date:
            qs = qs.filter(actionDate__date__gte=from_date)
        if to_date:
            qs = qs.filter(actionDate__date__lte=to_date)
        if user:
            qs = qs.filter(performedBy__username=user)
        if action:
            qs = qs.filter(action__icontains=action)

        return Response(AuditLogSerializer(qs, many=True).data)

class AuditLogClearView(RoleRequiredAPIView):
    required_roles = ('administrator',)

    def delete(self, request):
        count, _ = AuditLog.objects.all().delete()
        return Response({'deleted': count})


class GoogleLoginView(RoleRequiredAPIView):
    """
    POST /api/auth/google/ — { id_token }.
    Same response shape as POST /auth/login/: { token, user: { username,
    role, operatorName } }. See GoogleLoginSerializer docstring for the
    "no auto-signup" requirement this enforces.
    """
    required_roles = ROLES_PUBLIC
    throttle_classes = [LoginThrottle]

    def post(self, request):
        serializer = GoogleLoginSerializer(data=request.data)
        if not serializer.is_valid():
            first_error = next(iter(serializer.errors.values()))[0]
            return Response({'message': str(first_error)}, status=http_status.HTTP_401_UNAUTHORIZED)

        user = serializer.validated_data['user']
        employee = serializer.validated_data['employee']

        token, _ = Token.objects.get_or_create(user=user)

        role_key = employee.role.key
        operator_name = employee.name if role_key == 'call_operator' else None

        return Response({
            'token': token.key,
            'user': {
                'username': user.username,
                'role': role_key,
                'operatorName': operator_name,
            },
        })

class PushSubscribeView(RoleRequiredAPIView):
    required_roles = ROLES_ANY_AUTHENTICATED_USER

    def post(self, request):
        serializer = PushSubscriptionSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({'message': 'Subscribed.'}, status=http_status.HTTP_201_CREATED)


class PushUnsubscribeView(RoleRequiredAPIView):
    required_roles = ROLES_ANY_AUTHENTICATED_USER

    def post(self, request):
        endpoint = request.data.get('endpoint')
        PushSubscription.objects.filter(user=request.user, endpoint=endpoint).delete()
        return Response({'message': 'Unsubscribed.'})


class VapidPublicKeyView(RoleRequiredAPIView):
    required_roles = ROLES_ANY_AUTHENTICATED_USER

    def get(self, request):
        return Response({'publicKey': os.environ.get('VAPID_PUBLIC_KEY', '')})


class TriggerFollowupRemindersView(RoleRequiredAPIView):
    """
    POST /api/internal/send-followup-reminders/ — called once a day by a
    GitHub Actions scheduled workflow (or any external free cron pinger).
    Protected by a shared secret header, NOT user auth, since nothing is
    logged in when this fires. Runs the same logic as the management
    command, just triggerable over HTTP since Render's free tier has no
    free cron product.
    """
    required_roles = ROLES_PUBLIC

    def post(self, request):
        secret = request.headers.get('X-Cron-Secret')
        if secret != os.environ.get('CRON_SECRET'):
            return Response({'message': 'Forbidden.'}, status=http_status.HTTP_403_FORBIDDEN)

        from django.core.management import call_command
        call_command('send_followup_reminders')
        return Response({'message': 'Reminders sent.'})


# =============================================================================
# Verification & Notification — Phase 2 (public pass pages)
# =============================================================================

class PassResolveView(RoleRequiredAPIView):
    """
    GET /api/pass/<token>/ — PUBLIC. Resolves a visitor/guide token to
    that party's display payload (see verification.resolve_pass). No
    auth — the token itself is the credential (opaque, unguessable,
    time-limited), same trust model as a password-reset link.
    """
    required_roles = ROLES_PUBLIC

    def get(self, request, token):
        try:
            data = resolve_pass(token)
        except VerificationError as e:
            return Response({'message': str(e)}, status=http_status.HTTP_404_NOT_FOUND)
        return Response(data)


class PassVerifyView(RoleRequiredAPIView):
    """
    POST /api/pass/verify/ — PUBLIC. { scannedToken, ownToken, ownRole }.
    Marks the OTHER party (relative to ownRole) as verified. Logs one
    AuditLog entry the same way every other state-changing view does,
    even though the caller isn't authenticated — performedBy is left
    null (log_audit reads request.user, which is AnonymousUser here;
    that's fine, AuditLog.performedBy is nullable for exactly this kind
    of system-triggered/public entry).
    """
    required_roles = ROLES_PUBLIC
    throttle_classes = [PassVerifyThrottle]

    def post(self, request):
        scanned = request.data.get('scannedToken', '')
        own_token = request.data.get('ownToken', '')
        own_role = request.data.get('ownRole', '')
        try:
            result = verify_token(scanned, own_token, own_role, ip=request.META.get('REMOTE_ADDR'))
        except VerificationError as e:
            return Response({'message': str(e)}, status=http_status.HTTP_400_BAD_REQUEST)

        AuditLog.objects.create(
            performedBy=request.user if request.user.is_authenticated else None,
            userRole='',
            action=f'Verify {result["verifiedRole"]} QR',
            previousValue='—',
            newValue=result['subjectId'],
            reason='Verified at public pass link',
            ipAddress=request.META.get('REMOTE_ADDR'),
        )
        return Response(result)