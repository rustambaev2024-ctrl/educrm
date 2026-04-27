from django.urls import path

from .views import AttendanceViewSet

attendance_update = AttendanceViewSet.as_view({"patch": "update"})

urlpatterns = [
    path("<uuid:pk>/", attendance_update, name="attendance-update"),
]
