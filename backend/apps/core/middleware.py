from django.conf import settings
from django.http import HttpResponse


class DevCorsMiddleware:
    """Small CORS layer controlled by settings.CORS_ALLOWED_ORIGINS."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.method == "OPTIONS" and self._is_allowed_origin(request):
            response = HttpResponse(status=204)
        else:
            response = self.get_response(request)

        if self._is_allowed_origin(request):
            self._patch_response(request, response)
        return response

    def _is_allowed_origin(self, request):
        origin = request.headers.get("Origin")
        allowed = set(getattr(settings, "CORS_ALLOWED_ORIGINS", []))
        return bool(origin and origin in allowed)

    def _patch_response(self, request, response):
        response["Access-Control-Allow-Origin"] = request.headers["Origin"]
        response["Vary"] = "Origin"
        response["Access-Control-Allow-Credentials"] = "true"
        response["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        response["Access-Control-Allow-Headers"] = (
            "Authorization, Content-Type, X-Tenant-Schema, X-Requested-With"
        )
        response["Access-Control-Max-Age"] = "86400"
