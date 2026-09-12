from django.urls import path
from .views import (
    LoginView,
    LogoutView,
    EmployeeDetailView,
    EmployeeListCreateView,
    EmployeePrivilegesView,
    EmployeeResetPasswordView,
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
    AppointmentSendConfirmationView,
    ComplaintListCreateView,
    ComplaintDetailView,
    EscalationListCreateView,
    EscalationResolveView,
    AuditLogListView,
    AuditLogClearView,
    GoogleLoginView,
    RoleDeleteView,
    ChangePasswordView,
    UpdateUsernameView,
    PushSubscribeView,
    PushUnsubscribeView,
    VapidPublicKeyView,
    TriggerFollowupRemindersView,
)

urlpatterns = [
    path('auth/login/', LoginView.as_view(), name='auth-login'),
    path('auth/logout/', LogoutView.as_view(), name='auth-logout'),
    path('auth/google/', GoogleLoginView.as_view(), name='auth-google'),

    path('account/change-password/', ChangePasswordView.as_view(), name='account-change-password'),
    path('account/username/', UpdateUsernameView.as_view(), name='account-update-username'),

    path('roles', RoleListCreateView.as_view(), name='role-list-create'),
    path('employees', EmployeeListCreateView.as_view(), name='employee-list-create'),
    path('employees/<str:employee_id>', EmployeeDetailView.as_view(), name='employee-detail'),
    path('employees/<str:employee_id>/privileges', EmployeePrivilegesView.as_view(), name='employee-privileges'),
    path('employees/<str:employee_id>/reset-password/', EmployeeResetPasswordView.as_view(), name='employee-reset-password'),

    path('inquiries', InquiryListCreateView.as_view(), name='inquiry-list-create'),
    path('inquiries/<str:inquiry_id>', InquiryDetailView.as_view(), name='inquiry-detail'),

    path('followups', FollowupListCreateView.as_view(), name='followup-list-create'),
    path('followups/<str:followup_id>', FollowupDetailView.as_view(), name='followup-detail'),

    path('visit-setups', VisitSetupListCreateView.as_view(), name='visit-setup-list-create'),
    path('visit-setups/<str:visit_setup_id>', VisitSetupDetailView.as_view(), name='visit-setup-detail'),

    path('appointments', AppointmentListCreateView.as_view(), name='appointment-list-create'),
    path('appointments/<str:appointment_id>', AppointmentDetailView.as_view(), name='appointment-detail'),
    path('appointments/<str:appointment_id>/send-confirmation/', AppointmentSendConfirmationView.as_view(), name='appointment-send-confirmation'),

    path('complaints', ComplaintListCreateView.as_view(), name='complaint-list-create'),
    path('complaints/<str:complaint_id>', ComplaintDetailView.as_view(), name='complaint-detail'),

    path('escalations', EscalationListCreateView.as_view(), name='escalation-list-create'),
    path('escalations/<str:escalation_id>/resolve', EscalationResolveView.as_view(), name='escalation-resolve'),

    path('audit', AuditLogListView.as_view(), name='audit-list'),
    path('audit/clear/', AuditLogClearView.as_view()),
    # urls.py
    path('inquiries/<str:inquiry_id>/attachments/', InquiryAttachmentView.as_view()),
    path('inquiries/<str:inquiry_id>/attachments/<int:attachment_id>/', InquiryAttachmentView.as_view()),

    path('roles/<str:role_key>/', RoleDeleteView.as_view(), name='role-delete'),

    path('push/subscribe/', PushSubscribeView.as_view(), name='push-subscribe'),
    path('push/unsubscribe/', PushUnsubscribeView.as_view(), name='push-unsubscribe'),
    path('push/vapid-public-key/', VapidPublicKeyView.as_view(), name='push-vapid-key'),
    path('internal/send-followup-reminders/', TriggerFollowupRemindersView.as_view(), name='trigger-followup-reminders'),
]