"""
get_sms_sender() — reads SMS_BACKEND the same way settings.py reads
every other environment-driven setting (via decouple.config), and
returns the matching SMSSender instance. Adding a new provider later
is: write a new *_backend.py implementing SMSSender, add one line here.

When SMS_ALLOWED_NUMBERS is set, the real sender is wrapped in an
AllowlistSender so only those numbers can be texted — useful while
testing a new provider against a live SMS gateway, so a bug can't text
the whole customer list.
"""

from decouple import config

from .base import SMSSender
from .console_backend import ConsoleSMSSender

_BACKENDS = {
    "console": lambda: ConsoleSMSSender(),
}


def _smsethiopia_factory():
    from .smsethiopia_backend import SMSEthiopiaSender
    return SMSEthiopiaSender(
        api_key=config("SMSETHIOPIA_API_KEY", default=""),
        sender_id=config("SMSETHIOPIA_SENDER_ID", default=""),
    )

_BACKENDS["smsethiopia"] = _smsethiopia_factory


def _infobip_factory():
    from .infobip_backend import InfobipSMSSender
    return InfobipSMSSender(
        base_url=config("INFOBIP_BASE_URL", default=""),
        api_key=config("INFOBIP_API_KEY", default=""),
        sender_name=config("INFOBIP_SENDER_NAME", default="AuctionEth"),
    )

_BACKENDS["infobip"] = _infobip_factory


def _afromessage_factory():
    from .afromessage_backend import AfroMessageSender
    return AfroMessageSender(
        token=config("AFROMESSAGE_TOKEN", default=""),
        identifier_id=config("AFROMESSAGE_IDENTIFIER_ID", default=""),
        sender=config("AFROMESSAGE_SENDER", default=""),
    )

_BACKENDS["afromessage"] = _afromessage_factory


def _norm(p: str) -> str:
    p = (p or "").replace(" ", "").replace("-", "").lstrip("+")
    return "251" + p[1:] if p.startswith("0") else p


class AllowlistSender(SMSSender):
    """If SMS_ALLOWED_NUMBERS is set, ONLY those numbers can be texted."""
    def __init__(self, inner, allowed):
        self.inner, self.allowed = inner, {_norm(a) for a in allowed}

    def send(self, to_phone, message):
        if _norm(to_phone) not in self.allowed:
            return {"ok": False, "detail": "Blocked by SMS_ALLOWED_NUMBERS (testing safety allowlist)."}
        return self.inner.send(to_phone, message)


def get_sms_sender() -> SMSSender:
    name = config("SMS_BACKEND", default="console")
    factory = _BACKENDS.get(name)
    if factory is None:
        raise ValueError(f"Unknown SMS_BACKEND '{name}'. Valid: {', '.join(_BACKENDS)}")
    sender = factory()
    allowed = [a for a in config("SMS_ALLOWED_NUMBERS", default="").split(",") if a.strip()]
    return AllowlistSender(sender, allowed) if allowed else sender
