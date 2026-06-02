from django.db import connection
from django.conf import settings
from django.http import JsonResponse
from django_tenants.utils import (
    get_public_schema_name,
    get_tenant_domain_model,
    get_tenant_model,
)


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
            return JsonResponse({"detail": "Tenant not found"}, status=404)

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
