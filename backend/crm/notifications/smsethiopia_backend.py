"""
SMSEthiopia backend — PHASE 3 PLACEHOLDER.

Not implemented yet: the exact request/response shape of SMSEthiopia's
API wasn't confirmed as part of phase 1 (see project handoff doc — "look
up their current API docs... rather than guessing the endpoint
contract"). This file exists now so `crm/notifications/__init__.py`'s
factory has somewhere to import from once phase 3 starts, without
touching the factory or any calling code again at that point — only
this file's `send()` body needs filling in.

Until then, selecting SMS_BACKEND=smsethiopia raises a clear error at
send time rather than silently pretending to succeed.
"""

from .base import SMSSender


class SMSEthiopiaSender(SMSSender):
    def __init__(self, api_key: str = "", sender_id: str = ""):
        self.api_key = api_key
        self.sender_id = sender_id

    def send(self, to_phone: str, message: str) -> dict:
        raise NotImplementedError(
            "SMSEthiopia backend isn't implemented yet (phase 3). "
            "Set SMS_BACKEND=console for local development."
        )
