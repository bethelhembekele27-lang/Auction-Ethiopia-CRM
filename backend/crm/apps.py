from django.apps import AppConfig


class CrmConfig(AppConfig):
    name = 'crm'

    def ready(self):
        from .permissions import check_missing_role_declarations
        check_missing_role_declarations()
