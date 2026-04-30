from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path
import django.urls.converters
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

original_register = django.urls.converters.register_converter
def safe_register_converter(converter, type_name):
    if type_name in django.urls.converters.get_converters():
        return
    original_register(converter, type_name)

django.urls.converters.register_converter = safe_register_converter
django.urls.register_converter = safe_register_converter

from apps.students.mobile_urls import parent_urlpatterns, student_urlpatterns


def healthcheck(_request):
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/auth/", include("apps.accounts.urls")),
    path("api/v1/superadmin/", include("apps.superadmin.urls")),
    path("api/v1/branches/", include("apps.institutions.urls")),
    path("api/v1/rooms/", include("apps.institutions.room_urls")),
    path("api/v1/staff/", include("apps.staff.urls")),
    path("api/v1/students/", include("apps.students.urls")),
    path("api/v1/parents/", include("apps.students.parent_urls")),
    path("api/v1/student/", include((student_urlpatterns, "students-mobile"))),
    path("api/v1/parent/", include((parent_urlpatterns, "parents-mobile"))),
    path("api/v1/lessons/", include("apps.lessons.urls")),
    path("api/v1/attendance/", include("apps.lessons.attendance_urls")),
    path("api/v1/payments/", include("apps.finance.urls")),
    path("api/v1/homeworks/", include("apps.homework.urls")),
    path("api/v1/grades/", include("apps.grades.urls")),
    path("api/v1/chats/", include("apps.chat.urls")),
    path("api/v1/notifications/", include("apps.notifications.urls")),
    path("api/v1/audit/", include("apps.audit.urls")),
    path("api/v1/", include("apps.reports.urls")),
    path("api/v1/", include("apps.courses.urls")),
    path("api/v1/health/", healthcheck, name="healthcheck"),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
]
