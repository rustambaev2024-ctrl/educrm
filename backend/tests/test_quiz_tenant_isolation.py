"""T-010 / R-19: тенантная изоляция живого квиза (WS + REST + PII)."""
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from django.contrib.auth.models import AnonymousUser
from django.contrib.auth import get_user_model
from rest_framework.test import APIRequestFactory

from apps.quizzes.consumers import quiz_group_name, resolve_schema_from_scope
from apps.quizzes.tickets import issue_join_ticket, read_join_ticket
from apps.quizzes.views import QuizSessionViewSet, _get_schema

User = get_user_model()

SCHEMA_A = "tenant_alpha"
SCHEMA_B = "tenant_beta"
CODE = "123456"


# ─── Тикеты ───────────────────────────────────────────────────────────────────

def test_ticket_roundtrip():
    ticket = issue_join_ticket(SCHEMA_A, "11111111-1111-1111-1111-111111111111", CODE)
    payload = read_join_ticket(ticket)
    assert payload["schema"] == SCHEMA_A
    assert payload["code"] == CODE


def test_tampered_ticket_is_rejected():
    ticket = issue_join_ticket(SCHEMA_A, "id-1", CODE)
    assert read_join_ticket(ticket[:-3] + "abc") is None
    assert read_join_ticket("") is None
    assert read_join_ticket("garbage") is None


def test_expired_ticket_is_rejected():
    ticket = issue_join_ticket(SCHEMA_A, "id-1", CODE)
    assert read_join_ticket(ticket, max_age=-1) is None


# ─── WS-группа и схема ────────────────────────────────────────────────────────

def test_ws_group_name_includes_schema():
    """Два центра с одинаковым кодом обязаны попасть в РАЗНЫЕ группы."""
    assert quiz_group_name(SCHEMA_A, CODE) != quiz_group_name(SCHEMA_B, CODE)
    assert SCHEMA_A in quiz_group_name(SCHEMA_A, CODE)


def _scope(user=None, schema_name=None, code=CODE):
    return {
        "url_route": {"kwargs": {"code": code}},
        "user": user if user is not None else AnonymousUser(),
        "schema_name": schema_name,
    }


def test_ws_schema_comes_from_jwt_for_authenticated_host():
    scope = _scope(user=SimpleNamespace(is_anonymous=False), schema_name=SCHEMA_A)
    # Даже если клиент подсунул чужую схему в query — берётся схема из JWT.
    assert resolve_schema_from_scope(scope, {"schema": [SCHEMA_B]}) == SCHEMA_A


def test_ws_free_schema_param_is_not_trusted_for_anonymous():
    scope = _scope()
    assert resolve_schema_from_scope(scope, {"schema": [SCHEMA_B]}) is None


def test_ws_schema_comes_from_signed_ticket_for_anonymous():
    ticket = issue_join_ticket(SCHEMA_A, "id-1", CODE)
    scope = _scope()
    assert resolve_schema_from_scope(scope, {"ticket": [ticket]}) == SCHEMA_A


def test_ws_ticket_for_another_session_code_is_ignored():
    ticket = issue_join_ticket(SCHEMA_A, "id-1", "999999")
    scope = _scope()
    assert resolve_schema_from_scope(scope, {"ticket": [ticket]}) is None


# ─── REST ─────────────────────────────────────────────────────────────────────

def test_get_schema_ignores_query_param():
    """R-19: `?schema=` больше не выбирает схему платформы."""
    request = APIRequestFactory().get(f"/api/v1/quiz-sessions/by-code/{CODE}/?schema={SCHEMA_B}")
    request.tenant = SimpleNamespace(schema_name=SCHEMA_A)
    request.query_params = {"schema": SCHEMA_B}
    assert _get_schema(request) == SCHEMA_A


def test_get_schema_ignores_header_without_tenant():
    request = APIRequestFactory().get("/x/", HTTP_X_TENANT_SCHEMA=SCHEMA_B)
    request.query_params = {}
    assert _get_schema(request) is None


def test_cross_tenant_scan_helpers_are_gone():
    """Перебор всех схем в поисках кода сессии должен быть удалён целиком."""
    import apps.quizzes.views as views

    assert not hasattr(views, "_find_schema_for_session")
    assert not hasattr(views, "_list_tenant_schemas")


@contextmanager
def _noop_ctx(schema_name):
    yield


@pytest.mark.django_db
def test_join_with_ticket_for_other_session_is_rejected():
    """Тикет от другой сессии не должен пускать в эту — и ничего не писать."""
    # initkwargs @action применяются роутером; при ручном as_view их надо передать.
    view = QuizSessionViewSet.as_view(
        {"post": "join"},
        detail=True,
        authentication_classes=[],
        permission_classes=QuizSessionViewSet.join.kwargs["permission_classes"],
        throttle_classes=[],
    )
    ticket = issue_join_ticket(SCHEMA_A, "00000000-0000-0000-0000-000000000000", CODE)
    request = APIRequestFactory().post(
        "/api/v1/quiz-sessions/11111111-1111-1111-1111-111111111111/join/",
        {"name": "Ali", "ticket": ticket},
        format="json",
    )
    request.tenant = SimpleNamespace(schema_name=SCHEMA_B)

    with patch("apps.quizzes.views._schema_ctx", _noop_ctx):
        response = view(request, pk="11111111-1111-1111-1111-111111111111")

    assert response.status_code == 404


def test_join_and_by_code_are_throttled():
    from apps.quizzes.views import QuizJoinThrottle
    from django.conf import settings

    assert QuizJoinThrottle.scope == "quiz_join"
    assert settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["quiz_join"]

    by_code = QuizSessionViewSet.by_code
    join = QuizSessionViewSet.join
    assert QuizJoinThrottle in by_code.kwargs["throttle_classes"]
    assert QuizJoinThrottle in join.kwargs["throttle_classes"]
