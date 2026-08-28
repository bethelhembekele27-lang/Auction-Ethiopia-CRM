from rest_framework.permissions import BasePermission


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