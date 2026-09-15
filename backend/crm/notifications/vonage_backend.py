"""
Vonage (formerly Nexmo) SMS backend — used for real end-to-end testing
before switching to the company's SMS gateway (see project handoff:
Twilio's trial forbids custom message bodies, so it can't test our
actual pass-link text; Vonage's free DEMO mode can).

DEMO mode notes (matter for setup, not just code):
- Free trial gives ~€2 credit, no card required.
- You must add each real destination number (your phone, a colleague's)
  as a verified "test number" in the Vonage dashboard before it will
  accept sends to it — sending to an unregistered number silently fails
  in trial mode.
- Every message gets "[FREE SMS DEMO, TEST MESSAGE]" appended by Vonage
  automatically. That's expected — it goes away the moment real credit
  is added, no code change needed.
- Vonage requires the destination number in international format with
  no leading "+" (e.g. "251912345678"), not the "0912345678" /
  "+251912345678" formats this app stores/validates. Converted below.

Uses raw HTTP via `requests` rather than the `vonage` SDK package, to
avoid adding a new dependency for one API call — matches this
project's existing convention (see crm/push.py using pywebpush
directly rather than a heavier wrapper).
"""

import requests

from .base import SMSSender


VONAGE_SMS_URL = "https://rest.nexmo.com/sms/json"


def _to_international(phone: str) -> str:
    """
    Converts the app's stored Ethiopian phone formats ("0912345678" or
    "+251912345678") into the bare international format Vonage expects
    ("251912345678"). Assumes the number has already passed
    validate_ethiopian_phone() — this does not re-validate.
    """
    cleaned = (phone or "").replace(" ", "").replace("-", "")
    if cleaned.startswith("+"):
        return cleaned[1:]
    if cleaned.startswith("0"):
        return "251" + cleaned[1:]
    return cleaned


class VonageSMSSender(SMSSender):
    def __init__(self, api_key: str = "", api_secret: str = "", brand_name: str = "AuctionEth"):
        self.api_key = api_key
        self.api_secret = api_secret
        # "from" in DEMO mode — Vonage trial accounts can't use a real
        # short code/sender ID yet, but the field is still required;
        # Vonage substitutes its own demo sender regardless of what's
        # sent here, so a plain brand string is fine.
        self.brand_name = brand_name

    def send(self, to_phone: str, message: str) -> dict:
        if not self.api_key or not self.api_secret:
            return {"ok": False, "detail": "Vonage API key/secret not configured."}

        payload = {
            "api_key": self.api_key,
            "api_secret": self.api_secret,
            "to": _to_international(to_phone),
            "from": self.brand_name,
            "text": message,
        }

        try:
            resp = requests.post(VONAGE_SMS_URL, data=payload, timeout=10)
        except requests.RequestException as exc:
            return {"ok": False, "detail": f"Network error calling Vonage: {exc}"}

        try:
            data = resp.json()
        except ValueError:
            return {"ok": False, "detail": f"Vonage returned non-JSON response (status {resp.status_code})."}

        # Vonage's SMS API always returns 200 at the HTTP level — success/
        # failure is per-message inside messages[], keyed by "status"
        # ("0" = success). See https://developer.vonage.com/en/messaging/sms/guides/troubleshooting-sms
        messages = data.get("messages", [])
        if not messages:
            return {"ok": False, "detail": f"Unexpected Vonage response shape: {data}"}

        first = messages[0]
        status = first.get("status")
        if status == "0":
            return {
                "ok": True,
                "detail": f"Vonage accepted (message-id {first.get('message-id', '?')}).",
            }

        error_text = first.get("error-text", "Unknown Vonage error")
        return {"ok": False, "detail": f"Vonage rejected (status {status}): {error_text}"}