from .base import *

if not SECRET_KEY or SECRET_KEY in {"unsafe-dev-secret", "change-me", "CHANGE_ME", "REPLACE_WITH_GENERATED_KEY"}:
    raise RuntimeError("A strong SECRET_KEY must be set for production.")

DEBUG = False
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_SSL_REDIRECT = os.getenv("SECURE_SSL_REDIRECT", "True").lower() == "true"
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_HSTS_SECONDS = 60 * 60 * 24 * 30
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

if not ALLOWED_HOSTS:
    raise RuntimeError("ALLOWED_HOSTS must be set for production.")

if not CORS_ALLOWED_ORIGINS:
    raise RuntimeError("CORS_ALLOWED_ORIGINS must be set for production.")
