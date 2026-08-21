import pytest
from django.contrib.auth import get_user_model

from apps.grades.serializers import ExamResultSerializer, ExamSerializer, GradeSerializer

User = get_user_model()
pytestmark = pytest.mark.django_db


@pytest.mark.parametrize("value", [0, 1, 6, 10, 100])
def test_grade_serializer_rejects_out_of_range_score(value):
    serializer = GradeSerializer(data={"score": value, "grade_type": "lesson"}, partial=True)
    serializer.is_valid()
    assert "score" in serializer.errors, f"{value} должен быть отклонён вне диапазона 2-5"


@pytest.mark.parametrize("value", [2, 3, 4, 5])
def test_grade_serializer_accepts_in_range_score(value):
    serializer = GradeSerializer(data={"score": value, "grade_type": "lesson"}, partial=True)
    serializer.is_valid()
    assert "score" not in serializer.errors


def test_exam_result_serializer_rejects_out_of_range_score():
    serializer = ExamResultSerializer(data={"score": 87, "pass_status": "passed"}, partial=True)
    serializer.is_valid()
    assert "score" in serializer.errors


def test_exam_serializer_still_accepts_legacy_max_score_for_reads():
    # max_score больше не запрашивается формой создания, но само поле должно
    # спокойно принимать значения вплоть до 100 — это старые записи, не новые.
    serializer = ExamSerializer(data={"group": None, "name": "Midterm", "date": "2026-08-21", "max_score": 100}, partial=True)
    serializer.is_valid()
    assert "max_score" not in serializer.errors
