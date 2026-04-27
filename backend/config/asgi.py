import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from django.core.asgi import get_asgi_application  # noqa: E402
from django.urls import re_path  # noqa: E402

django_asgi_app = get_asgi_application()

from apps.chat.auth_middleware import JwtQueryAuthMiddlewareStack  # noqa: E402
from apps.chat.consumers import ChatConsumer  # noqa: E402
from apps.notifications.consumers import NotificationConsumer  # noqa: E402

websocket_urlpatterns = [
    re_path(r"ws/chat/(?P<chat_id>[0-9a-f-]+)/$", ChatConsumer.as_asgi()),
    re_path(r"ws/notifications/$", NotificationConsumer.as_asgi()),
]

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": JwtQueryAuthMiddlewareStack(URLRouter(websocket_urlpatterns)),
    }
)
