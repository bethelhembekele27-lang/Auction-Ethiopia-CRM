"""
Verification & Notification engine — shared between the visitation and
pickup workflows (pickup wiring lands in phase 4; only the visitation
path is called from anywhere today).

PHASE 1 SCOPE: this file currently implements only what "Send
confirmation" on an Appointment needs — creating a PartyVerification
record, building the two SMS bodies, and sending+logging them. The
scan/verify side (`verify_token`) and the pickup message builder land
in later phases per the project's phase-by-phase build order — adding
them now would be building ahead of what's been tested.
"""

import secrets
from datetime import timedelta

from decouple import config
from django.utils import timezone

from .models import PartyVerification, NotificationLog
from .notifications import get_sms_sender

# How long a visitor/guide pass stays valid after an appointment's
# confirmation is sent — 3 days, per product decision.
VERIFICATION_VALIDITY = timedelta(days=3)

# Where the public pass pages are served from (the frontend app, not this
# API) — e.g. "https://auction-ethiopia-crm.example.com". No default
# pointed at production; local dev should set this in .env the same way
# CORS_ALLOWED_ORIGINS already needs setting there.
FRONTEND_BASE_URL = config("FRONTEND_BASE_URL", default="http://localhost:5173")


def _generate_token() -> str:
    return secrets.token_urlsafe(32)


def _generate_code() -> str:
    # 6-digit fallback code for manual entry if camera scanning fails
    # on-site. Zero-padded so it's always displayed as 6 digits.
    return f"{secrets.randbelow(1_000_000):06d}"


def create_verification(subject_type: str, subject_id: str, expires_at=None) -> PartyVerification:
    """
    Creates a fresh PartyVerification for one Appointment or Pickup.
    Called once per "Send confirmation" click — re-sending replaces the
    previous verification for that subject rather than accumulating
    stale ones, since only the most recently sent pass should be valid.
    """
    if expires_at is None:
        expires_at = timezone.now() + VERIFICATION_VALIDITY

    # A re-send should invalidate the previous pass for this subject —
    # otherwise an old SMS link from an earlier confirmation would stay
    # valid alongside the new one.
    PartyVerification.objects.filter(subjectType=subject_type, subjectId=subject_id).delete()

    return PartyVerification.objects.create(
        subjectType=subject_type,
        subjectId=subject_id,
        visitorToken=_generate_token(),
        guideToken=_generate_token(),
        visitorCode=_generate_code(),
        guideCode=_generate_code(),
        expiresAt=expires_at,
    )


def build_visitation_messages(appointment, verification: PartyVerification) -> tuple[str, str]:
    """
    Pure string-building, no side effects — easy to unit test and safe
    to call speculatively (e.g. for a preview) without sending anything.
    Returns (visitor_message, guide_message).
    """
    visitor_link = f"{FRONTEND_BASE_URL}/v/{verification.visitorToken}"
    guide_link = f"{FRONTEND_BASE_URL}/g/{verification.guideToken}"

    location_bits = [appointment.address] if appointment.address else []
    if appointment.mapsLink:
        location_bits.append(appointment.mapsLink)
    location = " — ".join(location_bits) or "Location to be confirmed"

    what = appointment.batch or appointment.auction or "your item"

    visitor_message = (
        f"Auction Ethiopia: your visit to view {what} is set for "
        f"{appointment.visitDate} at {appointment.visitTime}. "
        f"Location: {location}. Guide: {appointment.guideName or '—'} "
        f"({appointment.guidePhone or '—'}). Your visit pass (QR + code): {visitor_link}"
    )

    guide_message = (
        f"Auction Ethiopia: {appointment.visitorName} ({appointment.phone}) is "
        f"scheduled to view {what} on {appointment.visitDate} at "
        f"{appointment.visitTime}. Verify them here: {guide_link}"
    )

    return visitor_message, guide_message


def send_and_log(subject_type: str, subject_id: str, recipient_role: str, phone: str, message: str) -> NotificationLog:
    """
    Sends one SMS via whichever backend SMS_BACKEND selects, and ALWAYS
    writes a NotificationLog row — success or failure — per the project
    handoff's requirement that every send attempt is auditable regardless
    of backend.
    """
    sender = get_sms_sender()
    result = sender.send(phone, message)

    return NotificationLog.objects.create(
        subjectType=subject_type,
        subjectId=subject_id,
        recipientRole=recipient_role,
        recipientPhone=phone,
        messageBody=message,
        status="sent" if result.get("ok") else "failed",
        providerResponse=result.get("detail", ""),
    )
