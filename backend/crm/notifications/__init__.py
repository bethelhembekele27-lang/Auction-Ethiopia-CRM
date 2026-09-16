"""
get_sms_sender() — reads SMS_BACKEND the same way settings.py reads
every other environment-driven setting (via decouple.config), and
returns the matching SMSSender instance. Adding a new provider later
is: write a new *_backend.py implementing SMSSender, add one line here.
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


def _vonage_factory():
    from .vonage_backend import VonageSMSSender
    return VonageSMSSender(
        api_key=config("VONAGE_API_KEY", default=""),
        api_secret=config("VONAGE_API_SECRET", default=""),
        brand_name=config("VONAGE_BRAND_NAME", default="AuctionEth"),
    )


_BACKENDS["vonage"] = _vonage_factory


def _infobip_factory():
    from .infobip_backend import InfobipSMSSender
    return InfobipSMSSender(
        base_url=config("INFOBIP_BASE_URL", default=""),
        api_key=config("INFOBIP_API_KEY", default=""),
        sender_name=config("INFOBIP_SENDER_NAME", default="AuctionEth"),
    )


_BACKENDS["infobip"] = _infobip_factory


def get_sms_sender() -> SMSSender:
    backend_name = config("SMS_BACKEND", default="console")
    factory = _BACKENDS.get(backend_name)
    if factory is None:
        raise ValueError(
            f"Unknown SMS_BACKEND '{backend_name}'. "
            f"Valid options: {', '.join(_BACKENDS.keys())}"
        )
    return factory()