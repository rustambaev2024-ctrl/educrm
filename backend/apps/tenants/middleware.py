import logging

from django.db import connection
from django.conf import settings
from django.http import JsonResponse
from django_tenants.utils import (
    get_public_schema_name,
    get_tenant_domain_model,
    get_tenant_model,
)

logger = logging.getLogger(__name__)


class HeaderOrDomainTenantMiddleware:
    TENANT_SCHEMA_HEADER = "HTTP_X_TENANT_SCHEMA"
    PUBLIC_PATHS = {
        "/api/v1/health/",
        "/api/schema/",
        "/api/docs/",
    }
    TENANT_OPTIONAL_PATHS = {
        "/api/v1/auth/login/",
        "/api/v1/auth/token/",
    }
    PUBLIC_PATH_PREFIXES = (
        "/api/v1/quiz-sessions/by-code/",
    )
    PUBLIC_PATH_SUFFIXES = (
        "/join/",
    )
    MUTATING_METHODS = {"POST", "PATCH", "PUT", "DELETE"}

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        connection.set_schema_to_public()

        if self._is_public_path(request.path):
            request.tenant = None
            return self.get_response(request)

        tenant = self._resolve_from_header(request) or self._resolve_from_domain(request)

        if tenant is None:
            if request.path in self.TENANT_OPTIONAL_PATHS:
                request.tenant = None
                return self.get_response(request)
            if request.path in self.PUBLIC_PATHS:
                request.tenant = None
                return self.get_response(request)
            # Единый ответ для несуществующего тенанта — тот же, что auth-слой
            # даёт для чужой валидной схемы (401 "User not found"). Разные
            # статусы (401 vs 404) позволяли перебирать валидные schema-имена
            # (information disclosure, BUG-037).
            return JsonResponse({"detail": "User not found"}, status=401)

        # R-25 / T-017: заголовок X-Tenant-Schema до этого никем не сверялся с
        # токеном. Пользователь одного учебного центра мог подставить чужую схему
        # и работать в ней со своим валидным JWT.
        if self._jwt_schema_mismatch(request, tenant):
            return JsonResponse(
                {
                    "detail": {
                        "uz": "Token boshqa o'quv markaziga tegishli",
                        "ru": "Токен принадлежит другому учебному центру",
                    }
                },
                status=403,
            )

        connection.set_tenant(tenant)
        request.tenant = tenant

        if self._is_blocked_tenant_request(request, tenant):
            return JsonResponse(
                {
                    "detail": (
                        "Institution is frozen"
                        if tenant.status == "frozen"
                        else "Institution is archived"
                    ),
                    "institution_status": tenant.status,
                },
                status=403,
            )
        return self.get_response(request)

    def _jwt_schema_mismatch(self, request, tenant):
        """True, если Bearer-токен выдан в другой схеме, чем запрошенная.

        Правила намеренно мягкие там, где строгость сломала бы легитимный путь:
        - нет заголовка Authorization / не Bearer → пропускаем (анонимные и
          публичные сценарии, `/join/`, логин, refresh);
        - токен не разбирается → пропускаем, 401 отдаст слой аутентификации DRF;
        - в токене нет claim `schema_name` (выдан до появления claim) →
          пропускаем, иначе разлогинило бы всех разом;
        - роль `superadmin` → пропускаем: платформенный администратор по смыслу
          работает поверх всех тенантов. Факт кросс-тенантного запроса логируем.
        """
        header = request.META.get("HTTP_AUTHORIZATION") or ""
        parts = header.split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            return False

        try:
            from rest_framework_simplejwt.tokens import AccessToken

            token = AccessToken(parts[1])
        except Exception:
            return False

        token_schema = token.get("schema_name")
        if not token_schema or token_schema == tenant.schema_name:
            return False

        if token.get("role") == "superadmin":
            logger.warning(
                "superadmin cross-tenant request: token schema '%s', requested '%s', path %s",
                token_schema,
                tenant.schema_name,
                request.path,
            )
            return False

        logger.warning(
            "X-Tenant-Schema mismatch: token schema '%s', requested '%s', path %s",
            token_schema,
            tenant.schema_name,
            request.path,
        )
        return True

    def _is_public_path(self, path):
        return (
            path in self.PUBLIC_PATHS
            or path.startswith(self.PUBLIC_PATH_PREFIXES)
            or path.endswith(self.PUBLIC_PATH_SUFFIXES)
        )

    def _is_blocked_tenant_request(self, request, tenant):
        if request.method not in self.MUTATING_METHODS:
            return False
        if tenant.schema_name == get_public_schema_name():
            return False
        if request.path.startswith("/api/v1/auth/"):
            return False
        return tenant.status in ("frozen", "archived")

    def _resolve_from_header(self, request):
        schema = request.META.get(self.TENANT_SCHEMA_HEADER)
        if not schema:
            return None

        tenant_model = get_tenant_model()
        try:
            return tenant_model.objects.get(schema_name=schema)
        except tenant_model.DoesNotExist:
            return None

    def _resolve_from_domain(self, request):
        hostname = request.get_host().split(":")[0]
        if not hostname:
            return None

        domain_model = get_tenant_domain_model()
        try:
            domain = domain_model.objects.select_related("tenant").get(domain=hostname)
            return domain.tenant
        except domain_model.DoesNotExist:
            if hostname in set(getattr(settings, "TENANT_PUBLIC_FALLBACK_HOSTS", [])):
                tenant_model = get_tenant_model()
                try:
                    return tenant_model.objects.get(schema_name=get_public_schema_name())
                except tenant_model.DoesNotExist:
                    return None
            return None
