from django.urls import path

from .views import AttendanceViewSet

attendance_list = AttendanceViewSet.as_view({"get": "list"})
attendance_update = AttendanceViewSet.as_view({"patch": "update"})

urlpatterns = [
    path("", attendance_list, name="attendance-list"),
    path("<uuid:pk>/", attendance_update, name="attendance-update"),
]
