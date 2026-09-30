"""
Dedicated throttle scopes for the two endpoints in this API where the
default 30/minute AnonRateThrottle is too generous:

- Login: guessing a password. Budgeted per HOUR rather than per minute
  because every employee at the call center shares one office IP — a
  per-minute budget gets exhausted the moment the morning shift all
  logs in together, which locks out the entire office rather than just
  an attacker. 30/hour is still far too slow to brute force a password
  over the wire, and a real user never makes more than a few attempts
  in an hour.
- Pass verify: guessing a 6-digit fallback code (1,000,000 possibilities).
  30/min per IP is exploitable given codes are valid for 3 days
  (30 * 60 * 24 * 3 = 129,600 attempts possible within one code's
  lifetime from a single IP alone). Tightened to reduce that window
  without affecting the legitimate one-or-two-attempts-per-visit case.

Both are separate from the general `anon` scope (DEFAULT_THROTTLE_RATES
in settings.py) so tightening these doesn't affect any other endpoint.
"""

from rest_framework.throttling import AnonRateThrottle


class LoginThrottle(AnonRateThrottle):
    scope = 'login'


class PassVerifyThrottle(AnonRateThrottle):
    scope = 'pass_verify'
