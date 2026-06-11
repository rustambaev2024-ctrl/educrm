import os
from pathlib import Path
from datetime import timedelta


BASE_DIR = Path(__file__).resolve().parent.parent.parent


def env_list(name: str, default: str = "") -> list[str]:
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


SECRET_KEY = os.getenv("SECRET_KEY", "unsafe-dev-secret")
DEBUG = False
ALLOWED_HOSTS = env_list("ALLOWED_HOSTS", "localhost,127.0.0.1")
CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS")
CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS")

SHARED_APPS = [
    "django_tenants",
    "apps.tenants",
    "apps.superadmin",
    "django.contrib.contenttypes",
]

TENANT_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.postgres",
    "django_celery_beat",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "django_filters",
    "drf_spectacular",
    "storages",
    "channels",
    "apps.accounts",
    "apps.institutions",
    "apps.staff",
    "apps.students",
    "apps.courses",
    "apps.lessons",
    "apps.finance",
    "apps.homework",
    "apps.grades",
    "apps.chat",
    "apps.audit",
    "apps.notifications",
    "apps.reports",
    "apps.quizzes",
    "apps.coins",
    "apps.core",
]

INSTALLED_APPS = list(SHARED_APPS) + [app for app in TENANT_APPS if app not in SHARED_APPS]

MIDDLEWARE = [
    "apps.core.middleware.DevCorsMiddleware",
    "apps.tenants.middleware.HeaderOrDomainTenantMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "apps.audit.middleware.AuditMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
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

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django_tenants.postgresql_backend",
        "NAME": os.getenv("POSTGRES_DB", "educrm"),
        "USER": os.getenv("POSTGRES_USER", "educrm"),
        "PASSWORD": os.getenv("POSTGRES_PASSWORD", "educrm"),
        "HOST": os.getenv("POSTGRES_HOST", "localhost"),
        "PORT": os.getenv("POSTGRES_PORT", "5432"),
        "CONN_MAX_AGE": 600,
    }
}
DATABASE_ROUTERS = ("django_tenants.routers.TenantSyncRouter",)

TENANT_MODEL = "tenants.Institution"
TENANT_DOMAIN_MODEL = "tenants.Domain"
PUBLIC_SCHEMA_NAME = "public"

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

LANGUAGE_CODE = "ru"
TIME_ZONE = os.getenv("TIME_ZONE", "Asia/Tashkent")
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
AUTH_USER_MODEL = "accounts.User"

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": REDIS_URL,
        "KEY_PREFIX": "educrm",
        "TIMEOUT": 300,
    }
}

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {"hosts": [REDIS_URL]},
    }
}

CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = REDIS_URL
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = TIME_ZONE

REST_FRAMEWORK = {
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
}

SPECTACULAR_SETTINGS = {
    "TITLE": "EduCRM API",
    "DESCRIPTION": "EduCRM backend foundation",
    "VERSION": "0.1.0",
    "ENUM_NAME_OVERRIDES": {
        "BranchStatusEnum": "apps.institutions.models.Branch.STATUS_CHOICES",
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=60),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=30),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

AWS_ACCESS_KEY_ID = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
AWS_SECRET_ACCESS_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin")
AWS_STORAGE_BUCKET_NAME = os.getenv("MINIO_BUCKET", "educrm")
AWS_S3_ENDPOINT_URL = os.getenv("MINIO_ENDPOINT", "http://minio:9000")
AWS_S3_REGION_NAME = os.getenv("AWS_S3_REGION_NAME", "us-east-1")
AWS_S3_SIGNATURE_VERSION = "s3v4"
AWS_DEFAULT_ACL = None
AWS_S3_FILE_OVERWRITE = False

STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
    },
}

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "%(asctime)s %(levelname)s [%(name)s] %(message)s",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": os.getenv("LOG_LEVEL", "INFO"),
    },
}

from celery.schedules import crontab

CELERY_BEAT_SCHEDULE = {
    # ФИНАНСЫ — критически важно
    "daily-lesson-charge": {
        "task": "apps.finance.tasks.daily_lesson_charge",
        "schedule": crontab(hour=23, minute=0),
    },
    "update-debtor-statuses": {
        "task": "apps.finance.tasks.update_debtor_statuses",
        "schedule": crontab(hour=0, minute=30),
    },
    # УВЕДОМЛЕНИЯ
    "lead-follow-up-reminder": {
        "task": "apps.notifications.tasks.lead_follow_up_reminder",
        "schedule": crontab(hour=9, minute=0),
    },
    "debtor-reminder": {
        "task": "apps.notifications.tasks.debtor_reminder",
        "schedule": crontab(hour=10, minute=0, day_of_week=1),
    },
    "lesson-reminder": {
        "task": "apps.notifications.tasks.lesson_reminder",
        "schedule": crontab(minute="*/30"),
    },
    "homework-deadline-reminder": {
        "task": "apps.notifications.tasks.homework_deadline_reminder",
        "schedule": crontab(hour=18, minute=0),
    },
    "trial-lesson-reminder": {
        "task": "apps.notifications.tasks.trial_lesson_reminder",
        "schedule": crontab(minute="*/30"),
    },
    # ДОМАШНИЕ ЗАДАНИЯ
    "mark-overdue-homework": {
        "task": "apps.homework.tasks.mark_overdue_homework",
        "schedule": crontab(hour=0, minute=10),
    },
    # SMS
    "send-debtor-sms": {
        "task": "apps.notifications.tasks.send_debtor_sms",
        "schedule": crontab(hour=10, minute=0, day_of_week=1),
    },
    "send-trial-lesson-sms": {
        "task": "apps.notifications.tasks.send_trial_lesson_sms",
        "schedule": crontab(hour=9, minute=0),
    },
}

