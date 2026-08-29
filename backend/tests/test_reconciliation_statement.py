from decimal import Decimal

import pytest
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db


def test_reconciliation_pdf_for_director(director_user, student):
    from apps.finance.services import apply_payment
    apply_payment(student=student, payment_type="top_up", amount=Decimal("100000"))

    client = APIClient()
    client.force_authenticate(user=director_user)
    response = client.get(
        f"/api/v1/reports/reconciliation/{student.id}/",
        {"date_from": "2026-01-01", "date_to": "2026-12-31"},
    )
    assert response.status_code == 200
    assert response["Content-Type"] == "application/pdf"


def test_reconciliation_requires_date_range(director_user, student):
    client = APIClient()
    client.force_authenticate(user=director_user)
    response = client.get(f"/api/v1/reports/reconciliation/{student.id}/")
    assert response.status_code == 400


def test_branch_admin_cannot_generate_reconciliation(branch_admin_user, student):
    client = APIClient()
    client.force_authenticate(user=branch_admin_user)
    response = client.get(
        f"/api/v1/reports/reconciliation/{student.id}/",
        {"date_from": "2026-01-01", "date_to": "2026-12-31"},
    )
    assert response.status_code == 403


def test_reconciliation_pdf_escapes_html_in_interpolated_values(monkeypatch):
    """export_reconciliation_pdf builds HTML by hand (str.replace, not a
    template engine with autoescaping) — student_name comes from User.full_name
    (free text set at account creation) and date_from/date_to come straight
    from unvalidated query params. A malicious value must not survive into
    the HTML WeasyPrint renders, or it's an HTML-injection/SSRF vector (an
    injected <img src="http://..."> would make WeasyPrint fetch it)."""
    from apps.reports import exporters

    captured_html = {}

    class _FakeHTML:
        def __init__(self, string):
            captured_html["value"] = string

        def write_pdf(self):
            return b"%PDF-fake"

    monkeypatch.setattr(exporters, "HTML", _FakeHTML)

    malicious = '<img src="http://evil.example/steal" onerror="x">'
    exporters.export_reconciliation_pdf({
        "student_name": malicious,
        "date_from": "2026-01-01",
        "date_to": "2026-12-31",
        "opening_balance": "0",
        "closing_balance": "0",
        "accountant_name": malicious,
        "rows": [{"date": "2026-01-05", "label": malicious, "amount": "1", "balance": "1"}],
    })

    html = captured_html["value"]
    # A real, executable <img ...> tag must never appear — only its escaped,
    # inert text form. escape() doesn't touch plain words like "onerror=",
    # only the markup-forming characters (< > " '), so checking for a literal
    # "<img" tag (not the substring "onerror=") is the actual security claim.
    assert "<img" not in html
    assert "&lt;img" in html
