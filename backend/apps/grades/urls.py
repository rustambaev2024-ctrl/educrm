from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import ExamViewSet, GradeViewSet

router = DefaultRouter()
router.register(r"exams", ExamViewSet, basename="exam")

grade_list = GradeViewSet.as_view({"get": "list", "post": "create"})
grade_detail = GradeViewSet.as_view(
    {
        "get": "retrieve",
        "patch": "partial_update",
        "delete": "destroy",
    }
)
group_journal = GradeViewSet.as_view({"get": "group_journal"})
student_average = GradeViewSet.as_view({"get": "student_average"})

urlpatterns = [
    path("", grade_list, name="grade-list"),
    path("<uuid:pk>/", grade_detail, name="grade-detail"),
    path("group/<uuid:group_id>/journal/", group_journal, name="grade-group-journal"),
    path("student/<uuid:student_id>/average/", student_average, name="grade-student-average"),
] + router.urls
