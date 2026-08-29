from datetime import date
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db


def _make_charge_payment(student):
    from apps.finance.services import apply_payment
    result = apply_payment(student=student, payment_type="charge", amount=Decimal("50000"))
    return result.payment


def test_director_cannot_reverse_payment_in_closed_period(director_user, student):
    from apps.finance.models import PeriodClose

    payment = _make_charge_payment(student)
    payment.transaction_date = date(2026, 7, 15)
    payment.save(update_fields=["transaction_date"])

    PeriodClose.objects.create(month=date(2026, 7, 1), closed_by=director_user)

    client = APIClient()
    client.force_authenticate(user=director_user)
    response = client.post(f"/api/v1/payments/{payment.id}/reverse/")

    assert response.status_code == 409


def test_accountant_cannot_reverse_payment_in_closed_period(accountant_user, student):
    from apps.finance.models import PeriodClose

    payment = _make_charge_payment(student)
    payment.transaction_date = date(2026, 7, 15)
    payment.save(update_fields=["transaction_date"])

    PeriodClose.objects.create(month=date(2026, 7, 1), closed_by=accountant_user)

    client = APIClient()
    client.force_authenticate(user=accountant_user)
    response = client.post(f"/api/v1/payments/{payment.id}/reverse/")

    assert response.status_code == 409


def test_reversal_works_normally_in_an_open_period(director_user, student):
    payment = _make_charge_payment(student)

    client = APIClient()
    client.force_authenticate(user=director_user)
    response = client.post(f"/api/v1/payments/{payment.id}/reverse/")

    assert response.status_code == 200


def test_only_accountant_can_close_a_period(director_user, accountant_user):
    client = APIClient()
    client.force_authenticate(user=director_user)
    response = client.post("/api/v1/payments/period-closes/close/", {"month": "2026-08-01"}, format="json")
    assert response.status_code == 403

    client.force_authenticate(user=accountant_user)
    response = client.post("/api/v1/payments/period-closes/close/", {"month": "2026-08-01"}, format="json")
    assert response.status_code == 201


def test_director_cannot_reopen_a_closed_period(director_user, accountant_user):
    from apps.finance.models import PeriodClose

    period = PeriodClose.objects.create(month=date(2026, 6, 1), closed_by=accountant_user)

    client = APIClient()
    client.force_authenticate(user=director_user)
    response = client.post(f"/api/v1/payments/period-closes/{period.id}/reopen/")
    assert response.status_code == 403


def test_close_rejects_malformed_month(accountant_user):
    client = APIClient()
    client.force_authenticate(user=accountant_user)
    response = client.post("/api/v1/payments/period-closes/close/", {"month": "not-a-date"}, format="json")
    assert response.status_code == 400


def test_close_race_returns_409_not_500(accountant_user):
    from apps.finance.models import PeriodClose

    # Simulate the race directly: create the record that would win, then
    # attempt the same create the view would perform for the loser — confirms
    # the IntegrityError path returns 409, not an unhandled 500.
    PeriodClose.objects.create(month=date(2026, 5, 1), closed_by=accountant_user)

    client = APIClient()
    client.force_authenticate(user=accountant_user)
    response = client.post("/api/v1/payments/period-closes/close/", {"month": "2026-05-01"}, format="json")
    assert response.status_code == 409
