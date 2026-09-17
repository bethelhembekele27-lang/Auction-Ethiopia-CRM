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

from .models import PartyVerification, NotificationLog,Pickup
from .notifications import get_sms_sender


# How long a visitor/guide pass stays valid after an appointment's
# confirmation is sent — 3 days, per product decision.
VERIFICATION_VALIDITY = timedelta(days=3)

# Where the public pass pages are served from (the frontend app, not this
# API) — e.g. "https://auction-ethiopia-crm.example.com". No default
# pointed at production; local dev should set this in .env the same way
# CORS_ALLOWED_ORIGINS already needs setting there.
FRONTEND_BASE_URL = config("FRONTEND_BASE_URL", default="http://localhost:5173")


# Characters that are common in copy-pasted or auto-generated text but
# fall outside the GSM-7 SMS alphabet — including any ONE of these
# forces the entire message into UCS-2 encoding, cutting the per-segment
# limit from 160 to 70 characters and multiplying segment cost. Run over
# every outbound message right before sending, since free-text fields
# (address, notes) can introduce these unpredictably from user input.
_GSM7_SAFE_REPLACEMENTS = {
    "—": "-", "–": "-",           # em/en dash
    "\u2018": "'", "\u2019": "'",  # curly single quotes
    "\u201c": '"', "\u201d": '"',  # curly double quotes
    "\u2026": "...",               # ellipsis
    "\xa0": " ",                   # non-breaking space
}


def to_gsm7_safe(text: str) -> str:
    for bad, good in _GSM7_SAFE_REPLACEMENTS.items():
        text = text.replace(bad, good)
    return text


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
    visitor_link = f"{FRONTEND_BASE_URL}/v/{verification.visitorToken}"
    guide_link = f"{FRONTEND_BASE_URL}/g/{verification.guideToken}"

    location_bits = [appointment.address] if appointment.address else []
    if appointment.mapsLink:
        location_bits.append(appointment.mapsLink)
    location = " - ".join(location_bits) or "Location to be confirmed"

    what = appointment.batch or appointment.auction or "your item"
    qty_suffix = f" (qty: {appointment.quantity})" if appointment.quantity else ""

    visitor_message = (
        f"Auction Ethiopia - Visit Confirmed\n"
        f"{what}{qty_suffix}\n"
        f"{appointment.visitDate} at {appointment.visitTime}\n"
        f"Location: {location}\n"
        f"Guide: {appointment.guideName or '-'} ({appointment.guidePhone or '-'})\n"
        f"Your pass: {visitor_link}"
    )

    guide_message = (
        f"Auction Ethiopia - Verify Visitor\n"
        f"{appointment.visitorName} ({appointment.phone})\n"
        f"Viewing {what}{qty_suffix}\n"
        f"{appointment.visitDate} at {appointment.visitTime}\n"
        f"Verify: {guide_link}"
    )

    return to_gsm7_safe(visitor_message), to_gsm7_safe(guide_message)


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
            'items': appt.items, 'quantity': appt.quantity,
            'visitDate': appt.visitDate.isoformat(), 'visitTime': appt.visitTime.strftime('%H:%M'),
            'address': appt.address, 'mapsLink': appt.mapsLink,
            'guideName': appt.guideName, 'guidePhone': appt.guidePhone,
        }
    else:
        try:
            pu = Pickup.objects.get(publicId=v.subjectId)
        except Pickup.DoesNotExist:
            raise VerificationError("The related pickup record no longer exists.")
        subject_data = {
            'visitorName': pu.winnerName, 'phone': pu.phone,
            'company': '', 'auction': pu.auction, 'batch': '',
            'items': pu.itemDescription, 'quantity': pu.quantity,
            'visitDate': pu.pickupDate.isoformat(), 'visitTime': pu.pickupTime.strftime('%H:%M'),
            'address': pu.address, 'mapsLink': pu.mapsLink,
            'guideName': pu.guideName, 'guidePhone': pu.guidePhone,
        }

    return {
        'role': role,
        'subjectType': v.subjectType,
        'subject': subject_data,
        'ownToken': token,
        'ownCode': own_code,
        # "I verified them" — used to show the ink-stamp confirmation on
        # THIS device.
        'otherVerified': bool(v.guideVerifiedAt if role == 'visitor' else v.visitorVerifiedAt),
        # "They verified me" — the piece that was missing before: a
        # visitor who was scanned by the guide had zero on-screen
        # feedback that anything happened, since the guide is usually
        # the only one who ever scans (a visitor rarely scans the guide
        # back). This lets that visitor's own screen show "you're
        # checked in" without requiring the reverse scan.
        'ownVerified': bool(v.visitorVerifiedAt if role == 'visitor' else v.guideVerifiedAt),
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

def create_pickup(validated_data: dict, created_by=None):
    """
    Isolated creation step for a Pickup — kept separate from
    PickupSerializer.create() per the original project handoff's
    explicit requirement: "keep Pickup creation logic in a standalone
    service function... so a future bulk-import endpoint can call the
    exact same function in a loop instead of duplicating validation/
    side effects." The manual single-record API view (via the
    serializer) is the only caller today; a future PFM Excel-import
    path should call this directly per row rather than re-deriving its
    own creation logic.

    Takes already-validated data (matching Pickup's field names) —
    validation itself stays in PickupSerializer since DRF's own
    validate_*() hooks are the established pattern in this codebase for
    single-record API input. A future bulk-import caller that skips the
    serializer is responsible for validating its own rows before
    calling this.
    """
    from .models import Pickup
    data = dict(validated_data)
    if created_by is not None:
        data['createdBy'] = created_by
    return Pickup.objects.create(**data)


def build_pickup_messages(pickup, verification: PartyVerification) -> tuple[str, str]:
    visitor_link = f"{FRONTEND_BASE_URL}/v/{verification.visitorToken}"
    guide_link = f"{FRONTEND_BASE_URL}/g/{verification.guideToken}"

    location_bits = [pickup.address] if pickup.address else []
    if pickup.mapsLink:
        location_bits.append(pickup.mapsLink)
    location = " - ".join(location_bits) or "Location to be confirmed"

    what = pickup.itemDescription or pickup.auction or "your item(s)"
    qty_suffix = f" (qty: {pickup.quantity})" if pickup.quantity else ""
    ref_line = f"Ref: {pickup.paymentReference}\n" if pickup.paymentReference else ""

    visitor_message = (
        f"Auction Ethiopia - Pickup Confirmed\n"
        f"{what}{qty_suffix}\n"
        f"{pickup.pickupDate} at {pickup.pickupTime}\n"
        f"{ref_line}"
        f"Location: {location}\n"
        f"Guide: {pickup.guideName or '-'} ({pickup.guidePhone or '-'})\n"
        f"Your pass: {visitor_link}"
    )
    guide_message = (
        f"Auction Ethiopia - Verify Pickup\n"
        f"{pickup.winnerName} ({pickup.phone})\n"
        f"Collecting {what}{qty_suffix}\n"
        f"{pickup.pickupDate} at {pickup.pickupTime}\n"
        f"Verify: {guide_link}"
    )
    return to_gsm7_safe(visitor_message), to_gsm7_safe(guide_message)