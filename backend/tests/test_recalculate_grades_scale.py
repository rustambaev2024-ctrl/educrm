from datetime import date
from io import StringIO

import pytest
from django.contrib.auth import get_user_model

from apps.courses.models import Course, Group, GroupMembership
from apps.grades.management.commands.recalculate_grades_scale import Command
from apps.grades.models import Exam, ExamResult, Grade
from apps.grades.services import band_percent_to_scale
from apps.homework.models import Homework, HomeworkStatus
from apps.institutions.models import Branch
from apps.staff.models import Staff
from apps.students.models import Student

pytestmark = pytest.mark.django_db

User = get_user_model()


@pytest.mark.parametrize(
    "percent,expected",
    [
        (100, 5), (90, 5), (85, 5),
        (84, 4), (70, 4), (65, 4),
        (64, 3), (55, 3), (50, 3),
        (49, 2), (20, 2), (0, 2),
    ],
)
def test_band_percent_to_scale(percent, expected):
    assert band_percent_to_scale(percent) == expected


def _setup():
    branch = Branch.objects.create(name="Main", address="A", phone="+998901100001")
    director = User.objects.create_user(phone="+998909400001", full_name="Director", role="director", password="secret123")
    teacher_user = User.objects.create_user(phone="+998909400002", full_name="Teacher", role="teacher", password="secret123")
    teacher = Staff.objects.create(user=teacher_user, branch=branch)
    student_user = User.objects.create_user(phone="+998909400003", full_name="Student", role="student", password="secret123")
    student = Student.objects.create(user=student_user, branch=branch)
    course = Course.objects.create(name="Biology", created_by=director)
    group = Group.objects.create(
        name="BIO-03", course=course, branch=branch, teacher=teacher,
        start_date=date(2026, 8, 1), monthly_price="400000.00", status="active", schedule=[],
    )
    GroupMembership.objects.create(group=group, student=student, enrolled_by=director)
    return branch, director, teacher_user, student, group


def test_homework_recalculation_uses_homeworkstatus_as_source():
    """
    Ровно баг из аудита: Grade.score для домашки был испорчен ("8 из 10"
    хранилось как "8 из 100"). Источником пересчёта обязан быть
    HomeworkStatus.grade (0..10, не испорчен), а не Grade.score напрямую.
    """
    branch, director, teacher_user, student, group = _setup()
    homework = Homework.objects.create(
        title="Chapter 1", assign_type="group", group=group, created_by=teacher_user,
    )
    hw_status = HomeworkStatus.objects.create(
        homework=homework, student=student, status="checked", grade=9,  # 9 из 10 = 90%
    )
    # Испорченная копия — как в реальном баге: 9 записано в поле "из 100".
    Grade.objects.create(
        student=student, group=group, homework_status=hw_status,
        grade_type="homework", score=9, graded_by=teacher_user,
    )

    cmd = Command()
    counts = cmd._process_schema(schema="public", apply_changes=True)

    hw_status.refresh_from_db()
    assert hw_status.grade == 5, "90% от HomeworkStatus.grade -> оценка 5, не от испорченного Grade.score=9/100"
    linked_grade = Grade.objects.get(homework_status=hw_status)
    assert linked_grade.score == 5
    assert counts["homework"] == 1


def test_exam_recalculation_uses_its_own_max_score():
    branch, director, teacher_user, student, group = _setup()
    exam = Exam.objects.create(group=group, name="Midterm", date="2026-08-01", max_score=10, created_by=teacher_user)
    result = ExamResult.objects.create(exam=exam, student=student, score=9, pass_status="passed")
    Grade.objects.create(student=student, group=group, exam=exam, grade_type="exam", score=9, graded_by=teacher_user)

    cmd = Command()
    cmd._process_schema(schema="public", apply_changes=True)

    result.refresh_from_db()
    assert result.score == 5, "9 из 10 (max_score этого экзамена) -> 90% -> 5"
    linked_grade = Grade.objects.get(exam=exam, student=student)
    assert linked_grade.score == 5


def test_other_grade_types_use_flat_100_percent():
    branch, director, teacher_user, student, group = _setup()
    grade = Grade.objects.create(student=student, group=group, grade_type="activity", score=72, graded_by=teacher_user)

    cmd = Command()
    cmd._process_schema(schema="public", apply_changes=True)

    grade.refresh_from_db()
    assert grade.score == 4, "72% -> попадает в диапазон 65-84 -> оценка 4"


def test_dry_run_leaves_data_untouched():
    branch, director, teacher_user, student, group = _setup()
    grade = Grade.objects.create(student=student, group=group, grade_type="activity", score=72, graded_by=teacher_user)

    cmd = Command()
    cmd.stdout = StringIO()
    counts = cmd._process_schema(schema="public", apply_changes=False)

    grade.refresh_from_db()
    assert grade.score == 72, "без --apply данные не должны меняться"
    assert counts["other"] == 1


def test_orphan_homework_grade_is_flagged_and_recalculated_from_own_score():
    branch, director, teacher_user, student, group = _setup()
    # Оценка типа homework без связанного HomeworkStatus — аномалия,
    # которую команда обязана заметить, а не молча пропустить.
    grade = Grade.objects.create(
        student=student, group=group, grade_type="homework", score=90, graded_by=teacher_user,
    )

    cmd = Command()
    counts = cmd._process_schema(schema="public", apply_changes=True)

    grade.refresh_from_db()
    assert grade.score == 5
    assert counts["orphan_homework"] == 1
    assert counts["homework"] == 0
