from pathlib import Path
from decouple import config
import dj_database_url
import os
from botocore.client import Config as BotoConfig


from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent.parent


load_dotenv(BASE_DIR / ".env")

SECRET_KEY = config("SECRET_KEY")
DEBUG = config("DEBUG", default=False, cast=bool)

ALLOWED_HOSTS = config("ALLOWED_HOSTS", default="localhost,127.0.0.1").split(",")  # add your Render domain later

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    'rest_framework.authtoken',   # <-- add this if missing
    'corsheaders',
    "crm",  # your app
    "storages",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
ROOT_URLCONF = "auction_crm_backend.urls"

# Required even though we're an API-only backend -- Django's admin site
# and error pages both need this configured or admin.E403 (what you just
# hit) gets raised.
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "auction_crm_backend.wsgi.application"

# --- Database ---
# Local dev (no DATABASE_URL in .env): falls back to SQLite, a plain file
# on disk -- zero setup, good enough while Docker/Postgres isn't available.
# On Render: DATABASE_URL is auto-set by the managed Postgres add-on, and
# dj_database_url picks it up automatically -- no code changes needed to
# switch. This is the ONLY place that needs to differ between the two.


# --- Database ---
DATABASE_URL = config(
    "DATABASE_URL",
    default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}",
)

DATABASES = {
    'default': dj_database_url.parse(
        DATABASE_URL,
        conn_max_age=600,
        ssl_require=not DEBUG,
    )
}
# Password validation -- Django's defaults, only relevant once you're
# creating real user accounts (employees) with chosen passwords.
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Africa/Addis_Ababa"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

CORS_ALLOWED_ORIGINS = config(
    "CORS_ALLOWED_ORIGINS",
    default="http://localhost:5173,http://localhost:3000"
).split(",")

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "crm.auth.BearerTokenAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    "EXCEPTION_HANDLER": "crm.exceptions.api_exception_handler",
    # Phase 2: the /pass/ endpoints are the only AllowAny (unauthenticated)
    # routes in this API — throttle anonymous requests so they can't be
    # brute-forced or hammered. Authenticated routes are unaffected since
    # DRF only applies AnonRateThrottle to unauthenticated requests.
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.AnonRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "30/minute",
        # Tighter scopes for brute-force-sensitive endpoints — see
        # crm/throttles.py for why these two specifically.
        "login": "10/minute",
        "pass_verify": "10/minute",
    },
}
STATIC_ROOT = BASE_DIR / 'staticfiles'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Backblaze B2 (S3-compatible) storage for uploaded attachments.
# Static files (CSS/JS) are untouched — still served by WhiteNoise from
# STATIC_ROOT, same as before. Only MEDIA (user-uploaded files) moves off
# the ephemeral Render disk and onto B2, so attachments survive redeploys.
AWS_ACCESS_KEY_ID = config("B2_KEY_ID", default="")
AWS_SECRET_ACCESS_KEY = config("B2_APPLICATION_KEY", default="")
AWS_STORAGE_BUCKET_NAME = config("B2_BUCKET_NAME", default="")
AWS_S3_ENDPOINT_URL = config("B2_ENDPOINT_URL", default="")  # e.g. https://s3.us-west-004.backblazeb2.com
# Backblaze B2's S3-compatible API returns 403 (not 404) on HeadObject
# for a non-existent key under scoped application keys — this breaks
# django-storages' pre-upload exists() check with a hard error instead
# of the expected "doesn't exist yet, proceed" signal. Setting
# file_overwrite=True skips that check entirely (django-storages'
# exists() short-circuits before ever calling head_object when this is
# True). To avoid two different uploads genuinely colliding on the same
# filename now that the check is skipped, InquiryAttachment.file below
# uses a UUID-prefixed upload path instead of relying on D
AWS_S3_ADDRESSING_STYLE = "virtual"
AWS_S3_FILE_OVERWRITE = True
AWS_DEFAULT_ACL = None          # B2 doesn't use S3-style per-object ACLs
AWS_QUERYSTRING_AUTH = True     # bucket is private — generate signed, expiring URLs
AWS_QUERYSTRING_EXPIRE = 3600   # signed URL validity, in seconds (1 hour)
AWS_S3_REGION_NAME = config("B2_REGION", default="")
AWS_S3_CLIENT_CONFIG = BotoConfig(
    signature_version="s3v4",
    s3={"payload_signing_enabled": False},
)
STORAGES = {
    "default": {
        "BACKEND": "crm.storage.SimpleS3Storage",
    },
    "staticfiles": {
        "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
    },
}
