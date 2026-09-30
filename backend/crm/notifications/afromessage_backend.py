"""
AfroMessage SMS backend.

Chosen over Infobip because its trial account credits a per-message
allowance and does not require every destination to be pre-verified in
the dashboard first, which makes back-to-back manual testing cheap.
Endpoint takes the destination in E.164 (+2519...) form, and uses
`Authorization: Bearer <token>`.

The `identifier_id` (shown as "Identifier" in the AfroMessage dashboard)
is the value that goes in the `from` field; free-tier accounts have
exactly one pre-approved identifier, which is why it's a separate
setting from `sender` (the free-form display name, unused on free).
"""

import logging
import requests

from .base import SMSSender

logger = logging.getLogger("crm.sms")
API_URL = "https://api.afromessage.com/api/send"


def _to_e164(phone: str) -> str:
    p = (phone or "").replace(" ", "").replace("-", "")
    if p.startswith("+"):
        return p
    if p.startswith("251"):
        return "+" + p
    if p.startswith("0"):
        return "+251" + p[1:]
    return "+" + p


class AfroMessageSender(SMSSender):
    def __init__(self, token="", identifier_id="", sender=""):
        self.token = token
        self.identifier_id = identifier_id
        self.sender = sender

    def send(self, to_phone: str, message: str) -> dict:
        if not self.token:
            return {"ok": False, "detail": "AFROMESSAGE_TOKEN not configured."}
        payload = {"to": _to_e164(to_phone), "message": message}
        if self.identifier_id:
            payload["from"] = self.identifier_id
        if self.sender:
            payload["sender"] = self.sender
        try:
            resp = requests.post(
                API_URL, json=payload, timeout=15,
                headers={"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"},
            )
            data = resp.json()
        except requests.RequestException as exc:
            logger.warning("AfroMessage network error: %s", exc)
            return {"ok": False, "detail": f"Network error: {exc}"}
        except ValueError:
            return {"ok": False, "detail": f"Non-JSON response (HTTP {resp.status_code})."}
        except Exception as exc:  # never raise
            logger.exception("AfroMessage unexpected error")
            return {"ok": False, "detail": f"Unexpected error: {exc}"}

        if data.get("acknowledge") == "success":
            return {"ok": True, "detail": f"AfroMessage accepted: {str(data)[:200]}"}
        logger.warning("AfroMessage rejected: %s", data)
        return {"ok": False, "detail": f"AfroMessage rejected (HTTP {resp.status_code}): {str(data)[:300]}"}
