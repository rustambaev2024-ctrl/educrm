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
        "NAME": ":memory:",
    }
}

# Remove django_tenants routing so standard `migrate` runs on SQLite
DATABASE_ROUTERS = []

# Use in-memory cache to avoid Redis dependency in tests
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
    }
}

# Disable Channel Layers to avoid Redis dependency in tests
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels.layers.InMemoryChannelLayer",
    }
}

# Remove django_tenants and apps.tenants from INSTALLED_APPS —
# they require PostgreSQL and break SQLite test setup
INSTALLED_APPS = [
    app for app in INSTALLED_APPS
    if app not in ("django_tenants", "apps.tenants", "apps.superadmin")
]

ROOT_URLCONF = "config.test_urls"


MIDDLEWARE = [
    mw
    for mw in MIDDLEWARE
    if mw not in (
        "apps.tenants.middleware.HeaderOrDomainTenantMiddleware",
        "django_tenants.middleware.main.TenantMainMiddleware",
    )
]
