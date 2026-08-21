import pytest
from django.utils import timezone

from apps.courses.models import Course, Group
from apps.grades.models import Exam
from apps.grades.serializers import ExamResultSerializer, ExamSerializer, GradeSerializer
from apps.institutions.models import Branch
from apps.staff.models import Staff
from apps.students.models import Student

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


@pytest.fixture
def exam_and_student(django_user_model):
    branch = Branch.objects.create(name="Main", address="A", phone="+998901777777")
    teacher_user = django_user_model.objects.create_user(
        phone="+998909300001",
        full_name="Teacher",
        role="teacher",
        password="secret123",
    )
    teacher_staff = Staff.objects.create(user=teacher_user, branch=branch)
    student_user = django_user_model.objects.create_user(
        phone="+998909300002",
        full_name="Student",
        role="student",
        password="secret123",
    )
    student = Student.objects.create(user=student_user, branch=branch)
    course = Course.objects.create(name="Chemistry")
    group = Group.objects.create(
        name="CHEM-01",
        course=course,
        branch=branch,
        teacher=teacher_staff,
        start_date=timezone.localdate(),
        monthly_price="400000.00",
        status="active",
        schedule=[],
    )
    exam = Exam.objects.create(group=group, name="Midterm", date=timezone.localdate(), max_score=5)
    return exam, student


@pytest.mark.parametrize("value", [2, 3, 4, 5])
def test_exam_result_serializer_accepts_in_range_score(exam_and_student, value):
    exam, student = exam_and_student
    serializer = ExamResultSerializer(
        data={
            "exam": str(exam.id),
            "student": str(student.id),
            "score": value,
            "pass_status": "passed",
        }
    )
    assert serializer.is_valid(), serializer.errors
    assert "score" not in serializer.errors


def test_exam_result_serializer_rejects_out_of_range_score(exam_and_student):
    exam, student = exam_and_student
    serializer = ExamResultSerializer(
        data={
            "exam": str(exam.id),
            "student": str(student.id),
            "score": 87,
            "pass_status": "passed",
        }
    )
    serializer.is_valid()
    assert "score" in serializer.errors


def test_exam_serializer_still_accepts_legacy_max_score_for_reads():
    # validate_max_score срабатывает только при записи (deserialization);
    # проверяем именно этот путь, а не отображение уже сохранённых старых записей.
    serializer = ExamSerializer(data={"group": None, "name": "Midterm", "date": "2026-08-21", "max_score": 100}, partial=True)
    serializer.is_valid()
    assert "max_score" not in serializer.errors
