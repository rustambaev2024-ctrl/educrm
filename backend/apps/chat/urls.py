from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import ChatViewSet, MessageViewSet

router = DefaultRouter()
router.register(r"", ChatViewSet, basename="chat")

message_edit = MessageViewSet.as_view({"patch": "edit"})
message_remove = MessageViewSet.as_view({"delete": "remove"})

urlpatterns = router.urls + [
    path("messages/<uuid:pk>/edit/", message_edit, name="message-edit"),
    path("messages/<uuid:pk>/", message_remove, name="message-delete"),
]
