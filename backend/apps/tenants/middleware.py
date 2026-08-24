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
    #: T-010 / Б-1: анонимные, но ТЕНАНТНЫЕ пути. Раньше они лежали в
    #: `PUBLIC_PATH_*` и получали `request.tenant = None` ДО резолва тенанта —
    #: после T-010 (`_get_schema()` читает только `request.tenant`) это ломало
    #: живой квиз целиком: `by-code` отдавал 404 всегда, `join` без тикета тоже.
    #: Теперь тенант резолвится штатно (заголовок → домен), и только если не
    #: резолвится — запрос идёт дальше с `tenant = None`, а вьюха отвечает 404
    #: «сессия не найдена»: аноним не должен получать 401 «User not found», и
    #: разница статусов здесь снова стала бы оракулом имён схем (BUG-037).
    TENANT_OPTIONAL_PATH_PREFIXES = (
        "/api/v1/quiz-sessions/by-code/",
        "/api/v1/public/leads/lidpixel/",
    )
    #: (prefix, suffix) — голый суффикс слишком широк: `/join/` не должен
    #: ослаблять любой будущий эндпоинт с таким хвостом.
    TENANT_OPTIONAL_PATH_PREFIX_SUFFIX = (
        ("/api/v1/quiz-sessions/", "/join/"),
    )
    #: Пути вообще без тенанта. Квиз-путей здесь быть не должно — см. выше.
    PUBLIC_PATH_PREFIXES = ()
    PUBLIC_PATH_SUFFIXES = ()
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
            if self._is_tenant_optional_path(request.path):
                request.tenant = None
                return self.get_response(request)
            if request.path in self.PUBLIC_PATHS:
                request.tenant = None
                return self.get_response(request)
            # Несуществующий тенант отвечает ровно то же, что ответил бы
            # существующий на такой же запрос без пригодных учётных данных —
            # тело и заголовки включительно (T-031, ниже).
            return self._unresolved_tenant_response(request)

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
            return self._blocked_tenant_response(request, tenant)
        return self.get_response(request)

    # T-029: обезличенный ответ для неаутентифицированных. Публичная страница
    # квиза (`POST /join/`) тоже проходит через `_is_blocked_tenant_request`,
    # поэтому аноним, подставляя `X-Tenant-Schema`, читал из тела ответа и факт
    # существования учебного центра, и его статус (`frozen`/`archived`).
    ANON_BLOCKED_DETAIL = {
        "uz": "So'rovni bajarib bo'lmadi",
        "ru": "Запрос не может быть выполнен",
    }
    BLOCKED_DETAIL = {
        "frozen": {
            "uz": "O'quv markazi vaqtincha to'xtatilgan",
            "ru": "Учебный центр временно заморожен",
        },
        "archived": {
            "uz": "O'quv markazi arxivlangan",
            "ru": "Учебный центр архивирован",
        },
    }

    def _blocked_tenant_response(self, request, tenant):
        """403 для frozen/archived: статус центра виден только своим.

        Аутентифицированному пользователю центра нужно понимать, почему
        перестали проходить изменения, — ему отдаём статус и двуязычный текст.
        Анониму отдаём один и тот же обезличенный текст для обоих статусов и
        **без** поля `institution_status`.
        """
        if not self._has_bearer_token(request):
            return JsonResponse({"detail": self.ANON_BLOCKED_DETAIL}, status=403)
        return JsonResponse(
            {
                "detail": self.BLOCKED_DETAIL.get(
                    tenant.status, self.ANON_BLOCKED_DETAIL
                ),
                "institution_status": tenant.status,
            },
            status=403,
        )

    @staticmethod
    def _has_bearer_token(request):
        """Есть ли в запросе разбираемый и валидный по подписи access-токен.

        Полную аутентификацию делает DRF ниже по стеку; здесь нужен только
        ответ на вопрос «это свой или посторонний», чтобы решить, показывать ли
        статус учебного центра.
        """
        raw_token = HeaderOrDomainTenantMiddleware._raw_bearer_token(request)
        if raw_token is None:
            return False
        try:
            from rest_framework_simplejwt.tokens import AccessToken

            AccessToken(raw_token)
        except Exception:
            return False
        return True

    #: Тот же заголовок, что ставит DRF (`JWTAuthentication.authenticate_header`).
    #: Его отсутствие само по себе выдавало «этой схемы нет».
    WWW_AUTHENTICATE = 'Bearer realm="api"'

    def _unresolved_tenant_response(self, request):
        """401 для нерезолвленного тенанта — байт в байт как у auth-слоя.

        T-031. Было: `{"detail": "User not found"}` без `WWW-Authenticate`,
        тогда как существующая схема на тот же запрос отвечала
        `{"detail": "Учетные данные не были предоставлены."}` (без токена) или
        `{"detail": ..., "code": "token_not_valid", "messages": [...]}`
        (с непригодным токеном). Разница в теле и в заголовке делала 401
        оракулом: перебором `X-Tenant-Schema` можно было составить список
        реальных схем, то есть список учебных центров платформы.

        Теперь ответ собирается из тех же исключений DRF/simplejwt, что
        сработали бы за middleware, поэтому остаётся синхронным с библиотекой
        и с активной локалью.
        """
        from rest_framework.exceptions import AuthenticationFailed, NotAuthenticated
        from rest_framework_simplejwt.authentication import JWTAuthentication
        from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

        raw_token = self._raw_bearer_token(request)
        if raw_token is None:
            exc = NotAuthenticated()
        else:
            try:
                JWTAuthentication().get_validated_token(raw_token)
            except (InvalidToken, TokenError) as invalid:
                exc = invalid
            else:
                # Токен валиден, но пользователя в этой схеме нет — ровно то,
                # что simplejwt отвечает для чужой существующей схемы.
                exc = AuthenticationFailed("User not found", code="user_not_found")

        detail = getattr(exc, "detail", None)
        body = dict(detail) if isinstance(detail, dict) else {"detail": str(detail)}
        response = JsonResponse(body, status=401)
        response["WWW-Authenticate"] = self.WWW_AUTHENTICATE
        return response

    @staticmethod
    def _raw_bearer_token(request):
        header = request.META.get("HTTP_AUTHORIZATION") or ""
        parts = header.split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            return None
        return parts[1]

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

    def _is_tenant_optional_path(self, path):
        """Путь, который допустимо обслужить без резолвленного тенанта.

        Тенант для таких путей всё равно ищется штатно (`_resolve_from_header`
        → `_resolve_from_domain`) — отдельного механизма выбора схемы клиентом
        не появляется.
        """
        if path in self.TENANT_OPTIONAL_PATHS:
            return True
        if path.startswith(self.TENANT_OPTIONAL_PATH_PREFIXES):
            return True
        return any(
            path.startswith(prefix) and path.endswith(suffix)
            for prefix, suffix in self.TENANT_OPTIONAL_PATH_PREFIX_SUFFIX
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
