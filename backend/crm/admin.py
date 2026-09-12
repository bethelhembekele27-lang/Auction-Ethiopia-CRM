# backend/crm/admin.py
from django.contrib import admin
from .models import PartyVerification, NotificationLog, AuditLog

@admin.register(PartyVerification)
class PartyVerificationAdmin(admin.ModelAdmin):
    list_display = ('subjectType', 'subjectId', 'expiresAt', 'visitorVerifiedAt', 'guideVerifiedAt', 'createdAt')

@admin.register(NotificationLog)
class NotificationLogAdmin(admin.ModelAdmin):
    list_display = ('subjectType', 'subjectId', 'recipientRole', 'recipientPhone', 'status', 'sentAt')

@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ('actionDate', 'action', 'previousValue', 'newValue', 'performedBy')