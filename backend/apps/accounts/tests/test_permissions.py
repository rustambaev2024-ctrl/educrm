"""Pins down the exact allowed-role set for the finance-scoped permission classes.

IsFinanceWriter / IsAccountantOrDirector / IsAccountant differ by exactly one
role each. Without a test per exact set, an accidental swap (e.g. a view
wired to IsFinanceWriter when it should be IsAccountantOrDirector) would
silently grant branch_admin access to something meant to be director/
accountant-only, and nothing would catch it.

Pure has_permission(request, view) checks — no DB, no DRF request machinery
needed, so a lightweight SimpleNamespace stands in for the request.
"""
from types import SimpleNamespace

import pytest

from apps.accounts.permissions import (
    IsAccountant,
    IsAccountantOrDirector,
    IsFinanceWriter,
)

ALL_ROLES = [
    "superadmin",
    "director",
    "branch_admin",
    "accountant",
    "teacher",
    "support_teacher",
    "student",
    "parent",
]


def _request_as(role, authenticated=True):
    user = SimpleNamespace(role=role, is_authenticated=authenticated)
    return SimpleNamespace(user=user)


@pytest.mark.parametrize("role", ALL_ROLES)
def test_is_finance_writer_exact_role_set(role):
    """superadmin/director/branch_admin/accountant only."""
    allowed = {"superadmin", "director", "branch_admin", "accountant"}
    expected = role in allowed
    assert IsFinanceWriter().has_permission(_request_as(role), None) is expected


@pytest.mark.parametrize("role", ALL_ROLES)
def test_is_accountant_or_director_exact_role_set(role):
    """superadmin/director/accountant only — branch_admin deliberately excluded."""
    allowed = {"superadmin", "director", "accountant"}
    expected = role in allowed
    assert IsAccountantOrDirector().has_permission(_request_as(role), None) is expected


@pytest.mark.parametrize("role", ALL_ROLES)
def test_is_accountant_exact_role_set(role):
    """superadmin/accountant only — director deliberately excluded."""
    allowed = {"superadmin", "accountant"}
    expected = role in allowed
    assert IsAccountant().has_permission(_request_as(role), None) is expected


def test_unauthenticated_denied_by_all_three():
    request = _request_as("accountant", authenticated=False)
    assert IsFinanceWriter().has_permission(request, None) is False
    assert IsAccountantOrDirector().has_permission(request, None) is False
    assert IsAccountant().has_permission(request, None) is False


def test_missing_user_denied_by_all_three():
    request = SimpleNamespace(user=None)
    assert IsFinanceWriter().has_permission(request, None) is False
    assert IsAccountantOrDirector().has_permission(request, None) is False
    assert IsAccountant().has_permission(request, None) is False
