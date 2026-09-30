"""
PFM export client — pulls verified winners from the PFM service.

PFM is a separate system with its own API; the CRM never shares a database
with it. Everything here is deliberately defensive and never raises: the
caller is an HTTP endpoint that must return a clean {"message": ...} error
to the operator, not a 500 from a JSON decode deep in `requests`.

The client also deliberately does NOT write anything — fetching, previewing
and importing are separate steps, and the import re-fetches from PFM rather
than trusting whatever rows the browser had on screen. That keeps the browser
from being able to invent a winner.
"""

import logging
from decimal import Decimal, InvalidOperation

import requests
from decouple import config
from django.utils.dateparse import parse_datetime

logger = logging.getLogger("crm.pfm")

# Hard ceiling on cursor pages per call. Exists so a mis-behaving or malicious
# PFM (one that never returns a null nextCursor) can't spin this endpoint
# forever. Hitting it is treated as an ERROR, not a short read — see the
# truncation check at the bottom of fetch_verified_winners.
MAX_PAGES = 20
PAGE_SIZE = 100


def _dec(v):
    try:
        return Decimal(str(v)) if v not in (None, "") else None
    except (InvalidOperation, ValueError):
        return None


def fetch_verified_winners(since=""):
    """Returns (ok, rows | error_message). Never raises."""
    base = config("PFM_BASE_URL", default="").rstrip("/")
    key = config("PFM_API_KEY", default="")
    if not base or not key:
        return False, "PFM_BASE_URL / PFM_API_KEY are not configured on the server."

    rows, cursor = [], ""
    try:
        for _ in range(MAX_PAGES):
            params = {"limit": PAGE_SIZE}
            if since:
                params["since"] = since
            if cursor:
                params["cursor"] = cursor
            r = requests.get(f"{base}/api/export/v1/verified-winners/", params=params,
                             headers={"Authorization": f"Bearer {key}"}, timeout=20)
            if r.status_code == 401:
                return False, "PFM rejected the API key (401)."
            if r.status_code >= 400:
                return False, f"PFM returned HTTP {r.status_code}."
            data = r.json()
            if data.get("version") != 1:
                return False, f"Unsupported PFM export version: {data.get('version')}."
            rows.extend(data.get("results", []))
            cursor = data.get("nextCursor") or ""
            if not cursor:
                break
    except requests.RequestException as exc:
        logger.warning("PFM network error: %s", exc)
        return False, f"Could not reach PFM: {exc}"
    except ValueError:
        return False, "PFM returned a non-JSON response."

    # Still holding a cursor after the last allowed page means the result set
    # was truncated. Returning the partial set as a success would let an
    # operator believe an import was complete when it silently dropped
    # everything past page MAX_PAGES — so fail loudly and tell them how to
    # narrow the range instead.
    if cursor:
        return False, (
            f"PFM has more than {MAX_PAGES * PAGE_SIZE} matching winners. "
            "Narrow the 'verified since' date and try again."
        )

    return True, [normalize(x) for x in rows]


def normalize(x):
    """One PFM result row -> the flat dict the staging model stores."""
    lots = x.get("lots") or []
    summary = "; ".join(
        " ".join(p for p in [l.get("lotNumber", ""), l.get("description", "")] if p) for l in lots
    )[:1000]
    return {
        "invoiceNumber": str(x.get("invoiceNumber", "")).strip(),
        "bidderName": str(x.get("bidderName", "")).strip(),
        "bidderNameAmharic": str(x.get("bidderNameAmharic", "")).strip(),
        "companyName": str(x.get("companyName", "")).strip(),
        "phone": str(x.get("phone", "")).strip(),
        "email": str(x.get("email", "")).strip(),
        "auction": str(x.get("auctionName", "")).strip(),
        "lots": lots,
        "lotsSummary": summary,
        "amountPaid": _dec(x.get("amountPaid")),
        "verifiedAt": parse_datetime(x.get("verifiedAt") or ""),
    }
