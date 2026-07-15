"""Staging settings — изолированная копия прода на отдельном окружении Railway.

Безопасность как в проде (fail-closed): staging держит реальные тестовые данные,
поэтому обязательные секреты/хосты требуются, cookies только по HTTPS.
От прода отличается лишь удобствами отладки: консольная почта, подробный лог,
опционально DEBUG и отключаемый SSL-редирект.
"""

from .base import *  # noqa: F401,F403

# SECRET_KEY обязателен и не должен быть дефолтным/предсказуемым.
if not SECRET_KEY or SECRET_KEY in {
    "unsafe-dev-secret",
    "change-me",
    "CHANGE_ME",
    "REPLACE_WITH_GENERATED_KEY",
    "CHANGE_ME_staging_secret_key",
}:
    raise RuntimeError("A strong SECRET_KEY must be set for staging.")

# ALLOWED_HOSTS обязателен — никакого fallback на "*".
if not ALLOWED_HOSTS:
    raise RuntimeError("ALLOWED_HOSTS must be set for staging.")

# Внутренний хост healthcheck'а Railway — не публичный, всегда разрешён.
if "healthcheck.railway.app" not in ALLOWED_HOSTS:
    ALLOWED_HOSTS = [*ALLOWED_HOSTS, "healthcheck.railway.app"]

if not CORS_ALLOWED_ORIGINS:
    raise RuntimeError("CORS_ALLOWED_ORIGINS must be set for staging.")

# Подробная отладка при необходимости (по умолчанию выключена).
DEBUG = os.getenv("DEBUG", "False").lower() == "true"

# За прокси Railway HTTPS терминируется на edge.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
# Cookies только по HTTPS (staging обслуживается по https на edge Railway).
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
# SSL-редирект включён по умолчанию; отключается через env лишь для отладки.
SECURE_SSL_REDIRECT = os.getenv("SECURE_SSL_REDIRECT", "True").lower() == "true"

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
