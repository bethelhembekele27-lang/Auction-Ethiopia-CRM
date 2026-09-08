import json
import os
from pywebpush import webpush, WebPushException
from .models import PushSubscription


def send_push_to_user(user, title, body, url=None):
    """
    Fans out a push notification to every subscription this user has
    registered (multiple browsers/devices). Silently prunes any
    subscription the push service reports as dead (410 Gone / 404) —
    the browser revoked it and it'll never succeed again.
    """
    subs = PushSubscription.objects.filter(user=user)
    payload = json.dumps({"title": title, "body": body, "url": url or "/"})

    for sub in subs:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                },
                data=payload,
                vapid_private_key=os.environ["VAPID_PRIVATE_KEY"],
                vapid_claims={"sub": os.environ["VAPID_CLAIM_EMAIL"]},
            )
        except WebPushException as ex:
            status = getattr(ex.response, "status_code", None)
            if status in (404, 410):
                sub.delete()
            # Other errors (network blip, etc.) — don't delete, just skip.