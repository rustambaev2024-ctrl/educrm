"""Staging settings — изолированная копия прода на отдельном окружении Railway.

Наследуем base (а не production), чтобы окружение гарантированно поднималось
без жёстких guard'ов production.py, но с безопасными staging-дефолтами.
Отличия от прода задаются переменными окружения в Railway (environment=staging).
"""

from .base import *  # noqa: F401,F403

# Подробная отладка при необходимости (по умолчанию выключена).
DEBUG = os.getenv("DEBUG", "False").lower() == "true"

# Домен Railway staging заранее неизвестен — берём из env,
# при отсутствии допускаем "*" (только для staging, не для прода).
if not ALLOWED_HOSTS:
    ALLOWED_HOSTS = ["*"]

# За прокси Railway HTTPS терминируется на edge.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
# На staging не форсируем SSL-редирект/HSTS — упрощает отладку.
SECURE_SSL_REDIRECT = os.getenv("SECURE_SSL_REDIRECT", "False").lower() == "true"

# Никаких реальных писем со staging — только в консоль.
EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

# Подробное логирование на staging.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {"format": "%(asctime)s %(levelname)s [%(name)s] %(message)s"},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "verbose"},
    },
    "root": {
        "handlers": ["console"],
        "level": os.getenv("LOG_LEVEL", "DEBUG"),
    },
}
