from django.db.models import Q
from rest_framework import status as http_status
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.authtoken.models import Token
from .permissions import has_any_role
from .models import (
    Employee, Inquiry, PERMISSIONS, Role, Followup, VisitSetup,
    Appointment, Complaint, Escalation, AuditLog,
)
from .serializers import (
    EmployeeCreateSerializer,
    EmployeeSerializer,
    InquirySerializer,
    RoleCreateSerializer,
    FollowupSerializer,
    VisitSetupSerializer,
    AppointmentSerializer,
    ComplaintSerializer,
    EscalationSerializer,
    EscalationResolveSerializer,
    LoginSerializer,
    AuditLogSerializer,
    GoogleLoginSerializer,
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

class LoginView(APIView):
    """
    POST /api/auth/login/ — no auth required to hit this one.
    Response: { token, user: { username, role, operatorName } }
    operatorName is only populated for call_operator accounts (spec §1),
    and is sourced from Employee.name since that's the single display-name
    field the model has — it must match exactly what's used to filter
    "my own" follow-ups/escalations elsewhere in the app.
    """
    permission_classes = [AllowAny]

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


class LogoutView(APIView):
    """
    POST /api/auth/logout/ -> 204 No Content.
    Deletes the current token so it can no longer authenticate.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        return Response(status=http_status.HTTP_204_NO_CONTENT)


# =============================================================================
# Roles
# =============================================================================

class RoleListCreateView(APIView):
    """
    GET  /api/roles/  -> array of role KEY strings — open to any
                          authenticated user (needed for dropdowns, etc.)
    POST /api/roles/  -> administrator only (spec §8).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        keys = list(Role.objects.order_by('name').values_list('key', flat=True))
        return Response(keys)

    def post(self, request):
        if not has_any_role('administrator')().has_permission(request, self):
            return Response({'message': 'Only an Administrator can create roles.'}, status=http_status.HTTP_403_FORBIDDEN)

        serializer = RoleCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        role = serializer.save()
        log_audit(request, 'Add role', '—', role.name, 'New role created — assign privileges from Employees')
        return Response({'key': role.key, 'name': role.name}, status=http_status.HTTP_201_CREATED)


# =============================================================================
# Employees
# =============================================================================

class EmployeeListCreateView(APIView):
    """
    GET  /api/employees/  -> open to any authenticated user
    POST /api/employees/  -> administrator only (spec §8).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        employees = Employee.objects.select_related('user', 'role').order_by('name')
        return Response(EmployeeSerializer(employees, many=True).data)

    def post(self, request):
        if not has_any_role('administrator')().has_permission(request, self):
            return Response({'message': 'Only an Administrator can create employees.'}, status=http_status.HTTP_403_FORBIDDEN)

        serializer = EmployeeCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        employee = serializer.save()
        log_audit(
            request, 'Add employee', '—', f'{employee.user.username} created',
            f'{employee.name} · {employee.role.name} — credentials sent by text',
        )
        return Response(EmployeeSerializer(employee).data, status=http_status.HTTP_201_CREATED)

class EmployeeDetailView(APIView):
    """
    PATCH /api/employees/<publicId>/  -> partial updates, e.g. { "status": "Inactive" }
    Keeps Employee.status and the linked Django User.is_active in sync,
    since a deactivated employee shouldn't be able to log in at all.
    """
    permission_classes = [IsAuthenticated, has_any_role('administrator')]

    def patch(self, request, employee_id):
        try:
            employee = Employee.objects.select_related('user').get(publicId=employee_id)
        except Employee.DoesNotExist:
            return Response({'message': 'Employee not found.'}, status=http_status.HTTP_404_NOT_FOUND)

        new_status = request.data.get('status')
        if new_status is not None:
            if new_status not in ('Active', 'Inactive'):
                return Response(
                    {'message': "status must be 'Active' or 'Inactive'."},
                    status=http_status.HTTP_400_BAD_REQUEST,
                )
            prev_status = employee.status
            employee.status = new_status
            employee.user.is_active = (new_status == 'Active')
            employee.user.save(update_fields=['is_active'])
            employee.save(update_fields=['status'])

            if prev_status != new_status:
                action = 'Activate employee' if new_status == 'Active' else 'Deactivate employee'
                log_audit(request, action, prev_status, new_status, employee.user.username)

        return Response(EmployeeSerializer(employee).data)


class EmployeePrivilegesView(APIView):

    permission_classes = [IsAuthenticated, has_any_role('administrator')]
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

class InquiryListCreateView(APIView):
    """
    GET  /api/inquiries/?category=&priority=&status=&operator=&q=
         `q` is free-text across callerName, phone, company, publicId.
    POST /api/inquiries/
    """
    permission_classes = [IsAuthenticated]

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

        return Response(InquirySerializer(qs, many=True).data)

    def post(self, request):
        serializer = InquirySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        inquiry = serializer.save()
        log_audit(request, 'Log inquiry', '—', f'{inquiry.publicId} created', f'{inquiry.category} from {inquiry.callerName}')
        return Response(InquirySerializer(inquiry).data, status=http_status.HTTP_201_CREATED)


class InquiryDetailView(APIView):
    """
    GET   /api/inquiries/<id>/
    PATCH /api/inquiries/<id>/
    """
    permission_classes = [IsAuthenticated]

    def get_object(self, inquiry_id):
        try:
            return Inquiry.objects.get(publicId=inquiry_id)
        except Inquiry.DoesNotExist:
            return None

    def get(self, request, inquiry_id):
        inquiry = self.get_object(inquiry_id)
        if inquiry is None:
            return Response({'message': 'Inquiry not found.'}, status=http_status.HTTP_404_NOT_FOUND)
        return Response(InquirySerializer(inquiry).data)

    def patch(self, request, inquiry_id):
        inquiry = self.get_object(inquiry_id)
        if inquiry is None:
            return Response({'message': 'Inquiry not found.'}, status=http_status.HTTP_404_NOT_FOUND)

        prev_status = inquiry.status
        serializer = InquirySerializer(inquiry, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()

        if prev_status != updated.status:
            log_audit(request, 'Update inquiry status', prev_status, updated.status, f'{updated.publicId} · {updated.callerName}')
        else:
            log_audit(request, 'Edit inquiry', '—', updated.publicId, f'Details updated for {updated.callerName}')

        return Response(InquirySerializer(updated).data)


# =============================================================================
# Followups  (§3)
# =============================================================================

class FollowupListCreateView(APIView):
    """
    GET  /api/followups/?operator=&status=&reminder=
    POST /api/followups/
    """
    permission_classes = [IsAuthenticated]

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


class FollowupDetailView(APIView):
    """
    PATCH /api/followups/<publicId>/ — typically { status, notes }.
    No GET-by-id in the spec, so only PATCH is implemented here.
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request, followup_id):
        try:
            followup = Followup.objects.get(publicId=followup_id)
        except Followup.DoesNotExist:
            return Response({'message': 'Follow-up not found.'}, status=http_status.HTTP_404_NOT_FOUND)

        prev_status = followup.status
        serializer = FollowupSerializer(followup, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()

        if prev_status != updated.status:
            log_audit(request, 'Update follow-up', prev_status, updated.status, f'{updated.publicId} · {updated.callerName}')

        return Response(FollowupSerializer(updated).data)


# =============================================================================
# Visit Setups  (§6)
# =============================================================================

class VisitSetupListCreateView(APIView):
    """
    GET  /api/visit-setups/?q=  — q searches company, batch, guide name, ID.
    POST /api/visit-setups/     — createdBy/createdDate are server-set,
                                   never accepted from the client.
    """
    permission_classes = [IsAuthenticated]

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


class VisitSetupDetailView(APIView):
    """PATCH /api/visit-setups/<publicId>/ — partial updates."""
    permission_classes = [IsAuthenticated]

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


# =============================================================================
# Appointments / Visitations  (§4)
# =============================================================================

class AppointmentListCreateView(APIView):
    """
    GET  /api/appointments/?status=&auction=
    POST /api/appointments/ — auto-creates the linked day-after follow-up
                               server-side (see AppointmentSerializer.create).
    """
    permission_classes = [IsAuthenticated]

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


class AppointmentDetailView(APIView):
    """PATCH /api/appointments/<publicId>/ — partial updates."""
    permission_classes = [IsAuthenticated]

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


# =============================================================================
# Complaints  (§5)
# =============================================================================

class ComplaintListCreateView(APIView):
    """
    GET  /api/complaints/?status=
    POST /api/complaints/ — callerName and description required (enforced
                             by the model).
    """
    permission_classes = [IsAuthenticated]

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


class ComplaintDetailView(APIView):
    """
    PATCH /api/complaints/<publicId>/ — if status is set to "Resolved"
    without resolutionDate, Complaint.save() defaults it to today.
    """
    permission_classes = [IsAuthenticated]

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

        return Response(ComplaintSerializer(updated).data)


# =============================================================================
# Escalations / "Manager Requests"  (§7)
# =============================================================================

class EscalationListCreateView(APIView):
    """
    GET  /api/escalations/ — role-scoped server-side, NOT client-filtered:
         call_operator sees only escalations they personally created;
         auction_manager / administrator see all.
    POST /api/escalations/ — only valid when the related inquiry's
         priority is "Urgent" (checked in EscalationSerializer.validate).
    """
    permission_classes = [IsAuthenticated]

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
        return Response(EscalationSerializer(escalation).data, status=http_status.HTTP_201_CREATED)


class EscalationResolveView(APIView):
    """
    PATCH /api/escalations/<publicId>/resolve/ — auction_manager /
    administrator only (spec §7).
    """
    permission_classes = [IsAuthenticated, has_any_role('auction_manager', 'administrator')]

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
        return Response(EscalationSerializer(updated).data)


# =============================================================================
# Audit Log  (§10)
# =============================================================================

class AuditLogListView(APIView):
    """
    GET /api/audit/?from=&to=&user=&action=
    administrator and auction_manager only (spec §10).
    """
    permission_classes = [IsAuthenticated, has_any_role('administrator', 'auction_manager')]

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
    




class GoogleLoginView(APIView):
    """
    POST /api/auth/google/ — { id_token }.
    Same response shape as POST /auth/login/: { token, user: { username,
    role, operatorName } }. See GoogleLoginSerializer docstring for the
    "no auto-signup" requirement this enforces.
    """
    permission_classes = [AllowAny]

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