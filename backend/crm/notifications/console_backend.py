"""
Zero-network SMS backend for local development — logs the message
instead of sending it. Selected via SMS_BACKEND=console (also the
default when SMS_BACKEND isn't set at all, so a fresh local checkout
never accidentally tries to hit a real provider without credentials).
"""

import logging

logger = logging.getLogger("crm.sms")

from .base import SMSSender


class ConsoleSMSSender(SMSSender):
    def send(self, to_phone: str, message: str) -> dict:
        logger.info("[console-sms] to=%s message=%s", to_phone, message)
        # Also print — management commands / `runserver` output is what
        # gets watched during manual phase-1 testing, and not every dev
        # setup has logging configured to show INFO on the console.
        print(f"[console-sms] to={to_phone}\n{message}\n")
        return {"ok": True, "detail": "console: logged, not actually sent"}
