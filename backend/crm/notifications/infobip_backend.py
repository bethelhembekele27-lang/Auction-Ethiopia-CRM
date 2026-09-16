"""
Infobip SMS backend — used for Phase 3 testing instead of Vonage.

Why this one instead of Vonage: Vonage's trial gives a small SHARED
dollar credit (~$2), which gets eaten fast by per-segment carrier fees
to Ethiopia (~$0.37/segment) — good for maybe 5-6 real sends total.
Infobip's trial instead grants 100 free SMS as a message COUNT, which
is a much bigger allowance for repeated back-to-back testing, and (like
Vonage, unlike Twilio's trial) still allows a real custom message body
rather than locking you into canned templates.

Trial constraints that matter for setup:
- You can only send to up to 5 phone numbers, and each one must be
  verified through Infobip's dashboard during/after signup (same idea
  as Vonage's "test numbers", different mechanism).
- Each Infobip account gets its OWN personal base URL (e.g.
  "8935q9.api.infobip.com") shown on your dashboard homepage — this is
  NOT a shared URL like Vonage's rest.nexmo.com, so it must be
  configured per-account via INFOBIP_BASE_URL.
- Uses the `Authorization: App <api_key>` header scheme (Infobip's own
  "API Key" auth method — not Bearer, not Basic).

Uses raw HTTP via `requests`, same convention as vonage_backend.py —
no SDK dependency added for one API call.
"""

import requests

from .base import SMSSender


class InfobipSMSSender(SMSSender):
    def __init__(self, base_url: str = "", api_key: str = "", sender_name: str = "AuctionEth"):
        # base_url comes from the dashboard WITHOUT a scheme, e.g.
        # "8935q9.api.infobip.com" — normalize so callers can supply it
        # either way.
        base_url = (base_url or "").strip()
        if base_url and not base_url.startswith("http"):
            base_url = f"https://{base_url}"
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        # Infobip trial accounts may substitute their own demo sender ID
        # if this alphanumeric one isn't pre-approved for the
        # destination country — same caveat as Vonage's "from" field.
        self.sender_name = sender_name

    def send(self, to_phone: str, message: str) -> dict:
        if not self.base_url or not self.api_key:
            return {"ok": False, "detail": "Infobip base URL / API key not configured."}

        url = f"{self.base_url}/sms/2/text/advanced"
        headers = {
            "Authorization": f"App {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        # Infobip wants the destination in international format with no
        # leading "+" — same conversion as the Vonage backend.
        cleaned = (to_phone or "").replace(" ", "").replace("-", "")
        if cleaned.startswith("+"):
            cleaned = cleaned[1:]
        elif cleaned.startswith("0"):
            cleaned = "251" + cleaned[1:]

        payload = {
            "messages": [
                {
                    "from": self.sender_name,
                    "destinations": [{"to": cleaned}],
                    "text": message,
                }
            ]
        }

        try:
            resp = requests.post(url, json=payload, headers=headers, timeout=10)
        except requests.RequestException as exc:
            return {"ok": False, "detail": f"Network error calling Infobip: {exc}"}

        try:
            data = resp.json()
        except ValueError:
            return {"ok": False, "detail": f"Infobip returned non-JSON response (status {resp.status_code})."}

        if resp.status_code >= 400:
            # Infobip's error shape usually has requestError.serviceException
            svc_exc = (data.get("requestError") or {}).get("serviceException", {})
            reason = svc_exc.get("text") or data
            return {"ok": False, "detail": f"Infobip rejected (HTTP {resp.status_code}): {reason}"}

        messages = data.get("messages", [])
        if not messages:
            return {"ok": False, "detail": f"Unexpected Infobip response shape: {data}"}

        first = messages[0]
        status = first.get("status", {})
        group_name = status.get("groupName", "")
        if group_name == "PENDING":
            return {
                "ok": True,
                "detail": f"Infobip accepted (message-id {first.get('messageId', '?')}).",
            }

        return {
            "ok": False,
            "detail": f"Infobip status: {group_name} — {status.get('description', 'no description')}",
        }