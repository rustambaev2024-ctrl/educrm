import pytest
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db

# apps.finance.urls is mounted at /api/v1/payments/ (see config/urls.py), and
# expense-categories is registered on that same router — so the real path is
# /api/v1/payments/expense-categories/, not /api/v1/expense-categories/.
EXPENSE_CATEGORIES_URL = "/api/v1/payments/expense-categories/"


def test_branch_admin_cannot_create_expense_category(branch_admin_user):
    client = APIClient()
    client.force_authenticate(user=branch_admin_user)
    response = client.post(
        EXPENSE_CATEGORIES_URL,
        {"code": "test", "name_uz": "Test", "name_ru": "Тест"},
        format="json",
    )
    assert response.status_code == 403


def test_accountant_can_create_expense_category(accountant_user):
    client = APIClient()
    client.force_authenticate(user=accountant_user)
    response = client.post(
        EXPENSE_CATEGORIES_URL,
        {"code": "test", "name_uz": "Test", "name_ru": "Тест"},
        format="json",
    )
    assert response.status_code == 201
    assert response.data["active"] is True


def test_deleting_a_category_deactivates_not_deletes(accountant_user, db):
    from apps.finance.models import ExpenseCategory

    category = ExpenseCategory.objects.create(code="test-del", name_uz="Test", name_ru="Тест")
    client = APIClient()
    client.force_authenticate(user=accountant_user)
    response = client.delete(f"{EXPENSE_CATEGORIES_URL}{category.id}/")
    assert response.status_code == 204
    category.refresh_from_db()
    assert category.active is False


def test_branch_admin_can_list_expense_categories(branch_admin_user):
    client = APIClient()
    client.force_authenticate(user=branch_admin_user)
    response = client.get(EXPENSE_CATEGORIES_URL)
    assert response.status_code == 200


def test_deleting_an_already_inactive_category_is_idempotent(accountant_user):
    from apps.finance.models import ExpenseCategory

    category = ExpenseCategory.objects.create(code="test-idem", name_uz="Test", name_ru="Тест", active=False)
    client = APIClient()
    client.force_authenticate(user=accountant_user)
    response = client.delete(f"{EXPENSE_CATEGORIES_URL}{category.id}/")
    assert response.status_code == 204


def test_reactivating_a_deactivated_category(accountant_user):
    from apps.finance.models import ExpenseCategory

    category = ExpenseCategory.objects.create(code="test-react", name_uz="Test", name_ru="Тест", active=False)
    client = APIClient()
    client.force_authenticate(user=accountant_user)
    response = client.patch(
        f"{EXPENSE_CATEGORIES_URL}{category.id}/",
        {"active": True},
        format="json",
    )
    assert response.status_code == 200
    category.refresh_from_db()
    assert category.active is True
