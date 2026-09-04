from django.urls import path
from .views import (
    LoginView,
    LogoutView,
    EmployeeDetailView,
    EmployeeListCreateView,
    EmployeePrivilegesView,
    InquiryDetailView,
    InquiryListCreateView,
    InquiryAttachmentView,
    RoleListCreateView,
    FollowupListCreateView,
    FollowupDetailView,
    VisitSetupListCreateView,
    VisitSetupDetailView,
    AppointmentListCreateView,
    AppointmentDetailView,
    ComplaintListCreateView,
    ComplaintDetailView,
    EscalationListCreateView,
    EscalationResolveView,
    AuditLogListView,
    AuditLogClearView,
    GoogleLoginView,
)

urlpatterns = [
    path('auth/login', LoginView.as_view(), name='auth-login'),
    path('auth/logout', LogoutView.as_view(), name='auth-logout'),
    path('auth/google', GoogleLoginView.as_view(), name='auth-google'),

    path('roles', RoleListCreateView.as_view(), name='role-list-create'),
    path('employees', EmployeeListCreateView.as_view(), name='employee-list-create'),
    path('employees/<str:employee_id>', EmployeeDetailView.as_view(), name='employee-detail'),
    path('employees/<str:employee_id>/privileges', EmployeePrivilegesView.as_view(), name='employee-privileges'),

    path('inquiries', InquiryListCreateView.as_view(), name='inquiry-list-create'),
    path('inquiries/<str:inquiry_id>', InquiryDetailView.as_view(), name='inquiry-detail'),

    path('followups', FollowupListCreateView.as_view(), name='followup-list-create'),
    path('followups/<str:followup_id>', FollowupDetailView.as_view(), name='followup-detail'),

    path('visit-setups', VisitSetupListCreateView.as_view(), name='visit-setup-list-create'),
    path('visit-setups/<str:visit_setup_id>', VisitSetupDetailView.as_view(), name='visit-setup-detail'),

    path('appointments', AppointmentListCreateView.as_view(), name='appointment-list-create'),
    path('appointments/<str:appointment_id>', AppointmentDetailView.as_view(), name='appointment-detail'),

    path('complaints', ComplaintListCreateView.as_view(), name='complaint-list-create'),
    path('complaints/<str:complaint_id>', ComplaintDetailView.as_view(), name='complaint-detail'),

    path('escalations', EscalationListCreateView.as_view(), name='escalation-list-create'),
    path('escalations/<str:escalation_id>/resolve', EscalationResolveView.as_view(), name='escalation-resolve'),

    path('audit', AuditLogListView.as_view(), name='audit-list'),
    path('audit/clear/', AuditLogClearView.as_view()),
    # urls.py
    path('inquiries/<str:inquiry_id>/attachments/', InquiryAttachmentView.as_view()),
    path('inquiries/<str:inquiry_id>/attachments/<int:attachment_id>/', InquiryAttachmentView.as_view()),
]