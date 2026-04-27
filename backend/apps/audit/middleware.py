from apps.audit.models import AuditLog


class AuditMiddleware:
    SKIP_PATHS = {
        "/api/v1/auth/login/",
        "/api/v1/auth/token/",
        "/api/v1/health/",
    }

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)

        if (
            request.method in ("POST", "PATCH", "PUT", "DELETE")
            and getattr(request, "user", None)
            and request.user.is_authenticated
            and request.path not in self.SKIP_PATHS
            and response.status_code < 500
        ):
            try:
                AuditLog.objects.create(
                    user=request.user,
                    user_role=getattr(request.user, "role", ""),
                    action=self._determine_action(request.method),
                    entity_type=(
                        request.path.strip("/").split("/")[2]
                        if request.path.count("/") >= 3
                        else "unknown"
                    ),
                    entity_id=self._extract_entity_id(request.path),
                    ip_address=request.META.get("REMOTE_ADDR"),
                    user_agent=request.META.get("HTTP_USER_AGENT", "")[:500],
                )
            except Exception:
                pass

        return response

    @staticmethod
    def _determine_action(method):
        return {
            "POST": "create",
            "PATCH": "update",
            "PUT": "update",
            "DELETE": "delete",
        }.get(method, "update")

    @staticmethod
    def _extract_entity_id(path):
        parts = [part for part in path.split("/") if part]
        if parts and len(parts) >= 4:
            return parts[-1]
        return ""
