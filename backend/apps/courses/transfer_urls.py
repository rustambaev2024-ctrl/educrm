from django.urls import path
from .views import StudentTransferView

urlpatterns = [
    path("", StudentTransferView.as_view()),
]
