"""T-009 / R-22: ручной запуск списания — только свой тенант и только асинхронно."""
from unittest.mock import MagicMock, patch

import pytest
from django.contrib.auth import get_user_model

from apps.institutions.models import Branch
from apps.staff.models import Staff

User = get_user_model()
pytestmark = pytest.mark.django_db

TENANT_SCHEMA = "tenant_alpha"


def _login(api_client, phone, password="secret123"):
    response = api_client.post(
        "/api/v1/auth/login/",
        {"phone": phone, "password": password},
        format="json",
    )
    assert response.status_code == 200, response.json()
    return response.json()["access"]


def _auth(api_client, user):
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(api_client, user.phone)}")


@pytest.fixture
def actors():
    branch = Branch.objects.create(name="Main", address="A", phone="+998901666001")
    admin_user = User.objects.create_user(
        phone="+998909400001", full_name="Admin", role="branch_admin", password="secret123"
    )
    Staff.objects.create(user=admin_user, branch=branch)
    teacher_user = User.objects.create_user(
        phone="+998909400002", full_name="Teacher", role="teacher", password="secret123"
    )
    Staff.objects.create(user=teacher_user, branch=branch)
    student_user = User.objects.create_user(
        phone="+998909400003", full_name="Student", role="student", password="secret123"
    )
    return {"admin": admin_user, "teacher": teacher_user, "student": student_user}


def test_branch_admin_triggers_only_own_schema_asynchronously(api_client, actors):
    _auth(api_client, actors["admin"])
    fake_task = MagicMock()
    fake_task.delay.return_value = MagicMock(id="task-123")

    with patch("apps.finance.views.connection", schema_name=TENANT_SCHEMA), \
         patch("apps.finance.tasks.daily_lesson_charge_for_tenant", fake_task), \
         patch("apps.finance.tasks.daily_lesson_charge") as all_tenants_task:
        response = api_client.post("/api/v1/payments/trigger-daily-charge/", {}, format="json")

    assert response.status_code == 202, response.json()
    body = response.json()
    assert body["schema"] == TENANT_SCHEMA
    assert body["task_id"] == "task-123"
    # Задача поставлена в очередь ровно один раз и ровно для своей схемы.
    fake_task.delay.assert_called_once_with(TENANT_SCHEMA)
    # Общеплатформенная задача (все тенанты) не вызывается ни синхронно, ни асинхронно.
    all_tenants_task.assert_not_called()
    all_tenants_task.delay.assert_not_called()


@pytest.mark.parametrize("role_key", ["teacher", "student"])
def test_roles_without_finance_rights_are_rejected(api_client, actors, role_key):
    _auth(api_client, actors[role_key])
    with patch("apps.finance.views.connection", schema_name=TENANT_SCHEMA), \
         patch("apps.finance.tasks.daily_lesson_charge_for_tenant") as fake_task:
        response = api_client.post("/api/v1/payments/trigger-daily-charge/", {}, format="json")

    assert response.status_code == 403
    fake_task.delay.assert_not_called()


def test_public_schema_is_refused(api_client, actors):
    _auth(api_client, actors["admin"])
    with patch("apps.finance.views.connection", schema_name="public"), \
         patch("apps.finance.tasks.daily_lesson_charge_for_tenant") as fake_task:
        response = api_client.post("/api/v1/payments/trigger-daily-charge/", {}, format="json")

    assert response.status_code == 400
    assert set(response.json()["detail"]) == {"uz", "ru"}
    fake_task.delay.assert_not_called()


def test_charge_tenant_helper_enters_only_given_schema():
    """`charge_tenant` обязана работать строго в переданной схеме."""
    from apps.finance import tasks

    entered = []

    class _Ctx:
        def __init__(self, schema):
            entered.append(schema)

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

    with patch.object(tasks, "schema_context", _Ctx), \
         patch.object(tasks, "Group") as group_model:
        group_model.objects.filter.return_value.prefetch_related.return_value = []
        tasks.charge_tenant(TENANT_SCHEMA)

    assert entered == [TENANT_SCHEMA]
