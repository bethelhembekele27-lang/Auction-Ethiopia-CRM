import os

from django.contrib import admin
from django.urls import include, path
from django.conf import settings
from django.conf.urls.static import static

# Admin lives at a configurable path so it isn't at the well-known
# /admin/ that scanners probe on every Django deployment. Defaults to
# 'admin' so local dev and any existing bookmarks keep working; set
# ADMIN_PATH in the environment to move it.
admin_path = os.environ.get('ADMIN_PATH', 'admin').strip('/')

urlpatterns = [
    path(f'{admin_path}/', admin.site.urls),
    path('api/', include('crm.urls')),
]+ static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
