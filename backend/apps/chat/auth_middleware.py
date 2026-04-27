from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth.models import AnonymousUser
from django_tenants.utils import schema_context
from rest_framework_simplejwt.tokens import AccessToken
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

from apps.accounts.models import User


@database_sync_to_async
def get_user_from_token(token: str):
    try:
        access = AccessToken(token)
        user_id = access.get("user_id")
        schema_name = access.get("schema_name", "public")
        with schema_context(schema_name):
            user = User.objects.filter(id=user_id).first()
        return user or AnonymousUser(), schema_name
    except (InvalidToken, TokenError):
        return AnonymousUser(), "public"


class JwtQueryAuthMiddleware(BaseMiddleware):
    async def __call__(self, scope, receive, send):
        query_string = parse_qs(scope.get("query_string", b"").decode())
        token_values = query_string.get("token", [])
        token = token_values[0] if token_values else ""
        if token:
            user, schema_name = await get_user_from_token(token)
            scope["user"] = user
            scope["schema_name"] = schema_name
        else:
            scope["user"] = AnonymousUser()
            scope["schema_name"] = "public"
        return await super().__call__(scope, receive, send)


def JwtQueryAuthMiddlewareStack(inner):
    return JwtQueryAuthMiddleware(inner)
