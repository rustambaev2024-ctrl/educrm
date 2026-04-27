from .base import *
from pathlib import Path

DEBUG = False
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.MD5PasswordHasher",
]
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": str(Path(BASE_DIR) / "test.sqlite3"),
    }
}

MIDDLEWARE = [
    mw
    for mw in MIDDLEWARE
    if mw != "apps.tenants.middleware.HeaderOrDomainTenantMiddleware"
]
