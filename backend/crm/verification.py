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
from django.db import models
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


# =============================================================================
# PHASE 2 — scan / verify + pass-page resolution
#
# QR RENDERING DECISION: the QR is rendered CLIENT-SIDE (frontend, from the
# `ownToken` string returned below), not server-side. This avoids adding
# qrcode/Pillow to the Django backend — Pillow is a native-code dependency
# that slows down and can break cold builds on Render's free tier, and the
# pass-page JSON already carries the token in one round-trip either way, so
# server-rendering it as an image bought nothing. Matches this project's
# existing convention of doing rendering work in the frontend (see
# frontend/src/utils/export.js's client-side PDF export via html2canvas).
# =============================================================================

class VerificationError(Exception):
    """Raised with a client-safe message — views.py turns this into the
    standard {"message": "..."} error shape, same pattern as every other
    validation error in this codebase."""
    pass


def _find_verification_by_token(raw):
    return PartyVerification.objects.filter(
        models.Q(visitorToken=raw) | models.Q(guideToken=raw)
    ).first()


def resolve_pass(token: str) -> dict:
    """
    GET /api/pass/<token>/ support. Returns the display payload for
    whichever role this token belongs to (visitor or guide) — including
    the party's own token/code, for the frontend to render as a QR
    (client-side, see module docstring above) for the other party to
    scan back (mutual verification).
    """
    from .models import Appointment  # local import avoids a top-of-file cycle

    v = _find_verification_by_token(token)
    if v is None:
        raise VerificationError("This link is invalid.")
    if v.expiresAt < timezone.now():
        raise VerificationError("This link has expired.")

    role = 'visitor' if v.visitorToken == token else 'guide'
    own_code = v.visitorCode if role == 'visitor' else v.guideCode

    if v.subjectType == 'visitation':
        try:
            appt = Appointment.objects.get(publicId=v.subjectId)
        except Appointment.DoesNotExist:
            raise VerificationError("The related visit record no longer exists.")
        subject_data = {
            'visitorName': appt.visitorName, 'phone': appt.phone,
            'company': appt.company, 'auction': appt.auction, 'batch': appt.batch,
            'visitDate': appt.visitDate.isoformat(), 'visitTime': appt.visitTime.strftime('%H:%M'),
            'address': appt.address, 'mapsLink': appt.mapsLink,
            'guideName': appt.guideName, 'guidePhone': appt.guidePhone,
        }
    else:
        # Pickup pass data lands in phase 4, alongside the Pickup model
        # actually being exposed via any view/serializer.
        raise VerificationError("Unsupported pass type.")

    return {
        'role': role,
        'subjectType': v.subjectType,
        'subject': subject_data,
        'ownToken': token,
        'ownCode': own_code,
        'otherVerified': bool(v.guideVerifiedAt if role == 'visitor' else v.visitorVerifiedAt),
        'expiresAt': v.expiresAt.isoformat(),
    }


def verify_token(scanned: str, own_token: str, own_role: str, ip: str | None = None) -> dict:
    """
    POST /api/pass/verify/ support. `own_token` identifies which
    PartyVerification/role is doing the scanning; `scanned` is what their
    camera (or manual 6-digit entry) read from the OTHER party — accepts
    either the other party's full token (QR scan) or their 6-digit
    fallback code (manual entry), since both are valid proof for the
    same check. Stamps *VerifiedAt/*VerifiedByIp for the scanned-in party.
    """
    v = _find_verification_by_token(own_token)
    if v is None:
        raise VerificationError("Your session link is invalid — request a new confirmation.")
    if v.expiresAt < timezone.now():
        raise VerificationError("This pass has expired.")
    if own_role not in ('visitor', 'guide'):
        raise VerificationError("Invalid role.")

    other_role = 'guide' if own_role == 'visitor' else 'visitor'
    other_token = v.guideToken if own_role == 'visitor' else v.visitorToken
    other_code = v.guideCode if own_role == 'visitor' else v.visitorCode

    scanned = (scanned or '').strip()
    matched = scanned == other_token or (len(scanned) == 6 and scanned == other_code)
    if not matched:
        raise VerificationError("That code doesn't match — ask them to show it again.")

    now = timezone.now()
    if other_role == 'visitor':
        v.visitorVerifiedAt = now
        v.visitorVerifiedByIp = ip
        v.save(update_fields=['visitorVerifiedAt', 'visitorVerifiedByIp'])
    else:
        v.guideVerifiedAt = now
        v.guideVerifiedByIp = ip
        v.save(update_fields=['guideVerifiedAt', 'guideVerifiedByIp'])

    return {'verifiedRole': other_role, 'verifiedAt': now.isoformat(), 'subjectId': v.subjectId, 'subjectType': v.subjectType}
