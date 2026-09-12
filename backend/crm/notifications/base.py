"""
Provider-agnostic SMS sender interface.

Every backend (console, SMSEthiopia, whatever comes next) implements
`send()` and returns the same small dict shape so callers — and
NotificationLog, which stores `providerResponse` — never need to know
which backend actually ran.
"""

from abc import ABC, abstractmethod


class SMSSender(ABC):
    @abstractmethod
    def send(self, to_phone: str, message: str) -> dict:
        """
        Attempts to send `message` to `to_phone`.

        Returns a dict with at least:
            {"ok": bool, "detail": str}
        `detail` is a short human-readable string (log line, provider
        message ID, or error text) — stored verbatim in
        NotificationLog.providerResponse.

        Must NOT raise for ordinary delivery failures (bad number,
        provider rejected, network error) — those are reported via
        {"ok": False, "detail": "..."} so the caller can still write a
        NotificationLog row and show the operator a clean error instead
        of a 500. Only raise for genuine programmer errors (e.g. missing
        required config), the same way the rest of this codebase treats
        configuration problems.
        """
        raise NotImplementedError
