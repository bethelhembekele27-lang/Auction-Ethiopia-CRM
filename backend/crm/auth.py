"""
Custom Bearer token authentication for DRF.
Accepts "Authorization: Bearer <token>" instead of DRF's default "Token <token>".
"""

from rest_framework.authentication import TokenAuthentication


class BearerTokenAuthentication(TokenAuthentication):
    """
    Custom token authentication that accepts Bearer scheme.
    
    Frontend sends: Authorization: Bearer <token>
    DRF's default TokenAuthentication expects: Authorization: Token <token>
    This class overrides the keyword to match Bearer.
    """
    keyword = 'Bearer'