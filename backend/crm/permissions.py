from rest_framework.permissions import BasePermission, IsAuthenticated, AllowAny
from rest_framework.views import APIView
from django.core.exceptions import ImproperlyConfigured


class HasAnyRole(BasePermission):
    """
    Restricts a view to users whose linked Employee.role.key is in a
    fixed allow-list, e.g. HasAnyRole('administrator', 'auction_manager').

    Usage on a view:
        permission_classes = [IsAuthenticated, HasAnyRole('administrator')]

    A user with no linked Employee (see views._employee_for's docstring —
    e.g. a bare Django superuser) is denied by every instance of this
    class, since there's no role to check against. This is deliberate:
    such an account shouldn't be treated as having elevated access just
    because it bypassed the normal Employee-creation flow.
    """
    message = "You don't have permission to perform this action."

    def __init__(self, *allowed_roles):
        self.allowed_roles = allowed_roles

    def __call__(self):
        # DRF instantiates permission_classes entries with no args
        # (`cls()`), so HasAnyRole itself can't be listed directly in
        # permission_classes — see has_any_role() factory below, which
        # returns a zero-arg class DRF can instantiate normally.
        return self

    def has_permission(self, request, view):
        try:
            employee = request.user.employee
        except AttributeError:
            return False
        except Exception:
            return False
        return employee.role.key in self.allowed_roles


def has_any_role(*allowed_roles):
    """
    Factory that returns a fresh zero-arg permission class bound to the
    given roles, since DRF calls each entry in permission_classes with no
    arguments (`PermissionClass()`). Use this in permission_classes
    instead of HasAnyRole directly:

        permission_classes = [IsAuthenticated, has_any_role('administrator')]
    """
    class _BoundHasAnyRole(HasAnyRole):
        def __init__(self):
            super().__init__(*allowed_roles)

    return _BoundHasAnyRole


# =============================================================================
# Systematic permission layer
#
# Every APIView in crm/views.py should subclass RoleRequiredAPIView instead
# of APIView directly. It forces each view to explicitly state its role
# requirement — there's no way to "forget" a check silently, because the
# default (ROLES_ANY_AUTHENTICATED_USER) still has to be written on
# purpose, and check_missing_role_declarations() (called from
# apps.py on startup) fails the whole app if any APIView subclass in this
# file skips declaring one entirely.
# =============================================================================

ROLES_ANY_AUTHENTICATED_USER = 'any_authenticated_user'
ROLES_PUBLIC = 'public'  # for the two genuinely unauthenticated /pass/ endpoints


class RoleRequiredAPIView(APIView):
    """
    Base class for every view in crm/views.py.

    Set ONE of these class attributes:
      required_roles = ('administrator',)                 -- same roles for every HTTP method
      required_roles = ROLES_ANY_AUTHENTICATED_USER        -- any logged-in user, no role restriction
      required_roles = ROLES_PUBLIC                        -- no auth at all (the /pass/ endpoints)
      method_roles = {'GET': ROLES_ANY_AUTHENTICATED_USER, 'POST': ('administrator',)}
                                                            -- different roles per method (e.g. InquiryAttachmentView)

    Leaving BOTH unset is a configuration error, not "default to open" —
    get_permissions() raises rather than silently falling back to
    IsAuthenticated, so a forgotten declaration breaks immediately in
    dev/tests instead of shipping as an unguarded endpoint.
    """
    required_roles = None
    method_roles = None

    def get_permissions(self):
        roles = self._roles_for_method()

        if roles == ROLES_PUBLIC:
            return [AllowAny()]
        if roles == ROLES_ANY_AUTHENTICATED_USER:
            return [IsAuthenticated()]
        if roles is None:
            raise ImproperlyConfigured(
                f"{self.__class__.__name__} declares no required_roles or method_roles. "
                f"Set one explicitly (see RoleRequiredAPIView docstring) — there is no default."
            )
        return [IsAuthenticated(), has_any_role(*roles)()]

    def _roles_for_method(self):
        if self.method_roles is not None:
            return self.method_roles.get(self.request.method, None)
        return self.required_roles


def check_missing_role_declarations():
    """
    Called once from CrmConfig.ready() (see apps.py). Imports every
    APIView subclass in crm.views and raises if any of them fails to
    declare required_roles/method_roles — catches a forgotten
    declaration at server startup (and in CI, since `manage.py check`
    triggers ready()) rather than in production traffic.
    """
    from django.apps import apps
    if not apps.ready:
        return
    from . import views as views_module
    import inspect

    offenders = []
    for name, obj in vars(views_module).items():
        if (
            inspect.isclass(obj)
            and issubclass(obj, RoleRequiredAPIView)
            and obj is not RoleRequiredAPIView
        ):
            if obj.required_roles is None and obj.method_roles is None:
                offenders.append(name)

    if offenders:
        raise ImproperlyConfigured(
            "These views subclass RoleRequiredAPIView but never set "
            "required_roles or method_roles: " + ", ".join(sorted(offenders))
        )