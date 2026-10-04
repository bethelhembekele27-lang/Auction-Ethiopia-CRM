"""
Custom Bearer token authentication for DRF.
Accepts "Authorization: Bearer <token>" instead of DRF's default "Token <token>".
"""

from datetime import timedelta

from django.utils import timezone
from rest_framework.authentication import TokenAuthentication
from rest_framework.exceptions import AuthenticationFailed

# DRF tokens never expire on their own, so without this a token leaked
# out of browser storage (or captured off the wire before TLS was in
# place) stays valid forever. 14 days is long enough that an operator
# isn't logged out mid-shift and short enough to bound exposure.
TOKEN_LIFETIME = timedelta(days=14)


class BearerTokenAuthentication(TokenAuthentication):
    """
    Custom token authentication that accepts Bearer scheme.
    
    Frontend sends: Authorization: Bearer <token>
    DRF's default TokenAuthentication expects: Authorization: Token <token>
    This class overrides the keyword to match Bearer, and expires the
    token past TOKEN_LIFETIME.
    """
    keyword = 'Bearer'

    def authenticate_credentials(self, key):
        user, token = super().authenticate_credentials(key)
        if timezone.now() - token.created > TOKEN_LIFETIME:
            token.delete()
            raise AuthenticationFailed('Session expired. Please log in again.')
        return user, token