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
        # 0, не 600: под ASGI (Daphne) sync-ORM работает в эфемерных потоках,
        # персистентное соединение привязывается к потоку и не переиспользуется —
        # соединения копятся до "FATAL: sorry, too many clients already".
        "CONN_MAX_AGE": 0,
    }
}
DATABASE_ROUTERS = ("django_tenants.routers.TenantSyncRouter",)

TENANT_MODEL = "tenants.Institution"
TENANT_DOMAIN_MODEL = "tenants.Domain"
PUBLIC_SCHEMA_NAME = "public"

# Парольной политики нет — это осознанное решение владельца, а не упущение.
# Аудитория платформы — школьники и администраторы учебных центров, которые
# заводят и диктуют пароли вручную; требование «8 символов, не только цифры,
# не из списка распространённых» блокировало создание учеников и возвращалось
# в поддержку жалобами. Валидаторы включались в рамках T-015/R-23 и были
# отключены обратно по прямому указанию владельца после жалоб с прода.
# Не включать обратно без явного решения владельца.
AUTH_PASSWORD_VALIDATORS = []

# Принудительная смена временного пароля при первом входе (T-026 / R-23)
# выключена по той же причине: она добавляла обязательный экран между входом
# и работой. Механизм в коде сохранён и включается переменной окружения
# FORCE_PASSWORD_CHANGE=1, если владелец вернётся к этому решению.
FORCE_PASSWORD_CHANGE = os.getenv("FORCE_PASSWORD_CHANGE", "0") not in ("0", "false", "False")

LANGUAGE_CODE = "ru"
TIME_ZONE = os.getenv("TIME_ZONE", "Asia/Tashkent")
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "/media/"
# На Railway диск контейнера эфемерный — загруженные файлы (логотипы, фото,
# файлы ДЗ) стираются при каждом редеплое. Чтобы они сохранялись, монтируем
# постоянный Railway Volume и указываем на него через MEDIA_ROOT.
# По умолчанию — прежний путь (для локальной разработки).
MEDIA_ROOT = os.getenv("MEDIA_ROOT", str(BASE_DIR / "media"))

# R-17 / ADR-002: документы учеников (паспорта, свидетельства о рождении) —
# отдельный приватный корень ВНЕ MEDIA_ROOT. `/media/` его не раздаёт.
PRIVATE_MEDIA_ROOT = os.getenv("PRIVATE_MEDIA_ROOT", str(BASE_DIR / "private_media"))
# Включается на окружении, где MinIO реально поднят и доступен воркеру.
USE_PRIVATE_S3_DOCUMENTS = os.getenv("USE_PRIVATE_S3_DOCUMENTS", "false").lower() == "true"
# Срок жизни presigned-ссылки на документ.
DOCUMENT_URL_TTL_SECONDS = int(os.getenv("DOCUMENT_URL_TTL_SECONDS", "300"))

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
    # T-026 / R-23: тот же JWTAuthentication плюс гейт принудительной смены
    # временного пароля (`apps/accounts/authentication.py`). Слой выбран
    # потому, что вьюхи массово затирают DEFAULT_PERMISSION_CLASSES, а
    # пользователь здесь уже загружен — проверка бесплатна.
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "apps.accounts.authentication.PasswordChangeGateJWTAuthentication",
    ],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    # R-24: до этого пагинации не было ни в одном списке, кроме /students/ и чата.
    # Класс включается глобально; поведение — см. apps/core/pagination.py.
    "DEFAULT_PAGINATION_CLASS": "apps.core.pagination.OptInPageNumberPagination",
    "PAGE_SIZE": 100,
    # R-19: анонимные эндпоинты живого квиза были без ограничений —
    # 6-значный код перебирался без всякой цены.
    "DEFAULT_THROTTLE_RATES": {
        "quiz_join": "30/min",
    },
}

SPECTACULAR_SETTINGS = {
    "TITLE": "GrowBase API",
    "DESCRIPTION": "GrowBase backend foundation",
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

# Настройки S3/MinIO убраны: STORAGES ниже использует локальный диск, и ни
# одна строчка кода к S3 не обращалась. Константы лежали мёртвым грузом с
# паролем minioadmin/minioadmin по умолчанию — при случайном включении S3
# бакет оказался бы с дефолтными ключами. Файлы хранятся на постоянном томе
# Railway (MEDIA_ROOT=/app/media). Если понадобится S3, заводить настройки
# заново вместе с реальными ключами.

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
    # РАСПИСАНИЕ — без этого горизонт уроков (90 дней от создания группы,
    # генерируется один раз) молча заканчивается и учителя перестают видеть
    # свои занятия. Найдено на проде 2026-08-08 — 9 из 36 активных групп в
    # одном филиале уже остались без будущих уроков.
    "extend-lesson-horizons": {
        "task": "apps.lessons.tasks.extend_lesson_horizons",
        "schedule": crontab(hour=1, minute=0),
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

# Sentry — inert unless SENTRY_DSN is set. No account is wired up yet; this
# just makes turning it on a one-variable change instead of a deploy.
SENTRY_DSN = os.getenv("SENTRY_DSN", "")
if SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.django import DjangoIntegration
    from sentry_sdk.integrations.celery import CeleryIntegration

    sentry_sdk.init(
        dsn=SENTRY_DSN,
        integrations=[DjangoIntegration(), CeleryIntegration()],
        environment=os.getenv("SENTRY_ENVIRONMENT", "production"),
        traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
        send_default_pii=False,
    )

