"""T-016 / R-25: `mark_overdue_homework` обязана явно ставить схему каждого тенанта."""
from datetime import timedelta
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.courses.models import Course, Group, GroupMembership
from apps.homework.models import HomeworkStatus
from apps.homework.tasks import mark_overdue_homework, mark_overdue_in_current_schema
from apps.institutions.models import Branch
from apps.staff.models import Staff
from apps.students.models import Student

User = get_user_model()


class _RecordingSchemaContext:
    """Подменяет `schema_context`, записывая, в какие схемы реально входила задача."""

    entered = []

    def __init__(self, schema):
        self.schema = schema

    def __enter__(self):
        type(self).entered.append(self.schema)
        return self

    def __exit__(self, *exc):
        return False


def test_task_enters_schema_context_for_every_tenant():
    _RecordingSchemaContext.entered = []
    with patch(
        "apps.homework.tasks._iter_tenant_schemas",
        return_value=iter(["tenant_alpha", "tenant_beta"]),
    ), patch("apps.homework.tasks.schema_context", _RecordingSchemaContext), patch(
        "apps.homework.tasks.mark_overdue_in_current_schema", return_value=0
    ):
        mark_overdue_homework()

    assert _RecordingSchemaContext.entered == ["tenant_alpha", "tenant_beta"]


def test_task_never_touches_public_schema():
    """Схемы берутся из `_iter_tenant_schemas`, а он исключает public."""
    import apps.homework.tasks as tasks
    import inspect

    source = inspect.getsource(tasks._iter_tenant_schemas)
    assert "exclude(schema_name=public)" in source


@pytest.mark.django_db
def test_overdue_marking_is_idempotent():
    branch = Branch.objects.create(name="Main", address="A", phone="+998901555001")
    teacher_user = User.objects.create_user(
        phone="+998909500001", full_name="Teacher", role="teacher", password="secret123"
    )
    teacher_staff = Staff.objects.create(user=teacher_user, branch=branch)
    student_user = User.objects.create_user(
        phone="+998909500002", full_name="Student", role="student", password="secret123"
    )
    student = Student.objects.create(user=student_user, branch=branch)
    course = Course.objects.create(name="Math")
    group = Group.objects.create(
        name="MATH-09",
        course=course,
        branch=branch,
        teacher=teacher_staff,
        start_date=timezone.localdate(),
        monthly_price="300000.00",
        status="active",
        schedule=[],
    )
    GroupMembership.objects.create(group=group, student=student)
    homework = group.homeworks.create(
        title="Old HW",
        assign_type="group",
        deadline=timezone.now() - timedelta(days=2),
        created_by=teacher_user,
    )
    hw_status = HomeworkStatus.objects.create(
        homework=homework, student=student, status="not_submitted"
    )

    assert mark_overdue_in_current_schema() == 1
    # Повторный запуск (beat может дёрнуть дважды) ничего не меняет.
    assert mark_overdue_in_current_schema() == 0
    hw_status.refresh_from_db()
    assert hw_status.status == "overdue"
