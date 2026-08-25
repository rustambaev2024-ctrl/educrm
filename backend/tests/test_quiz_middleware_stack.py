"""T-010 / Б-1: анонимные квиз-пути проходят РЕАЛЬНЫЙ middleware-стек.

Предыдущая волна T-010 была отклонена security-ревью (`vault/80-Reports/security-T-019.md`)
именно потому, что все тесты подставляли `request.tenant` руками и обходили
`HeaderOrDomainTenantMiddleware`. В рантайме middleware объявлял квиз-пути
публичными, ставил `request.tenant = None` до резолва тенанта — и `_get_schema()`
всегда возвращал `None`, то есть живой квиз отдавал 404 всем и всегда.

Здесь запросы идут через `django.test.Client` с настоящей цепочкой middleware.
Единственное, что подменяется, — резолв тенанта в БД (`get_tenant_model` /
`get_tenant_domain_model`) и переключение схемы: тесты гоняются на SQLite без
django_tenants (см. `config/settings/test.py`), реальных схем там нет.
Подменяется НЕ выбор схемы клиентом, а слой хранения тенантов.
"""
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import Client, override_settings

from apps.quizzes.models import Quiz, QuizSession, SessionParticipant
from apps.quizzes.tickets import read_join_ticket
from apps.tenants.middleware import HeaderOrDomainTenantMiddleware

User = get_user_model()

SCHEMA_A = "tenant_alpha"
SCHEMA_B = "tenant_beta"
CODE = "123456"

MIDDLEWARE_WITH_TENANT = [
    "apps.tenants.middleware.HeaderOrDomainTenantMiddleware",
    *settings.MIDDLEWARE,
]


class _FakeDoesNotExist(Exception):
    pass


def _fake_tenant(schema):
    return SimpleNamespace(schema_name=schema, status="active")


def _fake_tenant_model(known_schemas):
    manager = MagicMock()

    def _get(schema_name=None, **kwargs):
        if schema_name in known_schemas:
            return _fake_tenant(schema_name)
        raise _FakeDoesNotExist()

    manager.get.side_effect = _get
    return SimpleNamespace(objects=manager, DoesNotExist=_FakeDoesNotExist)


def _fake_domain_model():
    """Ни один хост в тестах не привязан к домену тенанта."""
    manager = MagicMock()
    manager.select_related.return_value = manager
    manager.get.side_effect = _FakeDoesNotExist()
    return SimpleNamespace(objects=manager, DoesNotExist=_FakeDoesNotExist)


@pytest.fixture
def used_schemas():
    """Схемы, в которых вьюха реально открывала контекст."""
    return []


@pytest.fixture
def tenant_stack(used_schemas):
    """Реальный middleware-стек + подменённое хранилище тенантов."""
    cache.clear()

    @contextmanager
    def _recording_ctx(schema_name):
        used_schemas.append(schema_name)
        yield

    with override_settings(MIDDLEWARE=MIDDLEWARE_WITH_TENANT), patch(
        "apps.tenants.middleware.get_tenant_model",
        return_value=_fake_tenant_model({SCHEMA_A, SCHEMA_B}),
    ), patch(
        "apps.tenants.middleware.get_tenant_domain_model",
        return_value=_fake_domain_model(),
    ), patch(
        "apps.tenants.middleware.connection", MagicMock()
    ), patch(
        "apps.quizzes.views._schema_ctx", _recording_ctx
    ):
        yield Client()


@pytest.fixture
def session(db):
    host = User.objects.create_user(
        phone="+998900000010", password="x", role="teacher", full_name="Host Teacher"
    )
    quiz = Quiz.objects.create(title="Live", created_by=host, quiz_type="student")
    return QuizSession.objects.create(quiz=quiz, host=host, code=CODE)


# ─── Конфигурация middleware ──────────────────────────────────────────────────

def test_quiz_paths_are_not_declared_public():
    """Б-1: пока эти пути публичные, `_get_schema()` не может увидеть тенанта."""
    mw = HeaderOrDomainTenantMiddleware(lambda r: None)
    assert mw._is_public_path(f"/api/v1/quiz-sessions/by-code/{CODE}/") is False
    assert mw._is_public_path("/api/v1/quiz-sessions/abc/join/") is False


def test_quiz_paths_are_tenant_optional():
    mw = HeaderOrDomainTenantMiddleware(lambda r: None)
    assert mw._is_tenant_optional_path(f"/api/v1/quiz-sessions/by-code/{CODE}/") is True
    assert mw._is_tenant_optional_path("/api/v1/quiz-sessions/abc/join/") is True


def test_join_suffix_alone_does_not_relax_other_endpoints():
    """`/join/` как голый суффикс не должен ослаблять чужие эндпоинты."""
    mw = HeaderOrDomainTenantMiddleware(lambda r: None)
    assert mw._is_tenant_optional_path("/api/v1/groups/abc/join/") is False
    assert mw._is_public_path("/api/v1/groups/abc/join/") is False


# ─── by-code через реальный стек ──────────────────────────────────────────────

@pytest.mark.django_db
def test_by_code_works_through_real_middleware(tenant_stack, session, used_schemas):
    """Регресс Б-1: до фикса здесь было 404 при любом заголовке."""
    response = tenant_stack.get(
        f"/api/v1/quiz-sessions/by-code/{CODE}/", HTTP_X_TENANT_SCHEMA=SCHEMA_A
    )

    assert response.status_code == 200, response.content
    body = response.json()
    assert body["code"] == CODE
    assert used_schemas == [SCHEMA_A]
    assert read_join_ticket(body["join_ticket"])["schema"] == SCHEMA_A


@pytest.mark.django_db
def test_by_code_ignores_query_schema_through_real_middleware(
    tenant_stack, session, used_schemas
):
    """R-19: `?schema=` не выбирает схему даже когда путь анонимный."""
    response = tenant_stack.get(
        f"/api/v1/quiz-sessions/by-code/{CODE}/?schema={SCHEMA_B}",
        HTTP_X_TENANT_SCHEMA=SCHEMA_A,
    )

    assert response.status_code == 200, response.content
    assert used_schemas == [SCHEMA_A]
    assert read_join_ticket(response.json()["join_ticket"])["schema"] == SCHEMA_A


@pytest.mark.django_db
def test_by_code_without_resolvable_tenant_is_404(tenant_stack, session, used_schemas):
    """Нерезолвящийся тенант: 404 «сессии нет», не 401 и не 500."""
    response = tenant_stack.get(
        f"/api/v1/quiz-sessions/by-code/{CODE}/", HTTP_X_TENANT_SCHEMA="tenant_ghost"
    )

    assert response.status_code == 404
    assert used_schemas == []


# ─── join через реальный стек ─────────────────────────────────────────────────

@pytest.mark.django_db
def test_join_without_ticket_works_through_real_middleware(
    tenant_stack, session, used_schemas
):
    """Регресс Б-1: до фикса `join` без тикета давал 404 всегда."""
    response = tenant_stack.post(
        f"/api/v1/quiz-sessions/{session.id}/join/",
        {"name": "Ali"},
        content_type="application/json",
        HTTP_X_TENANT_SCHEMA=SCHEMA_A,
    )

    assert response.status_code == 201, response.content
    body = response.json()
    assert used_schemas == [SCHEMA_A]
    assert read_join_ticket(body["ws_ticket"])["schema"] == SCHEMA_A
    assert SessionParticipant.objects.filter(id=body["participant_id"]).exists()


@pytest.mark.django_db
def test_join_writes_pii_only_into_resolved_tenant(tenant_stack, session, used_schemas):
    """PII участника пишется в схему тенанта запроса, а не в выбранную клиентом."""
    response = tenant_stack.post(
        f"/api/v1/quiz-sessions/{session.id}/join/?schema={SCHEMA_A}",
        {"name": "Vali", "phone": "+998901234567"},
        content_type="application/json",
        HTTP_X_TENANT_SCHEMA=SCHEMA_B,
    )

    assert response.status_code == 201, response.content
    assert used_schemas == [SCHEMA_B]
    assert read_join_ticket(response.json()["ws_ticket"])["schema"] == SCHEMA_B


@pytest.mark.django_db
def test_join_without_resolvable_tenant_writes_nothing(tenant_stack, session, used_schemas):
    before = SessionParticipant.objects.count()
    response = tenant_stack.post(
        f"/api/v1/quiz-sessions/{session.id}/join/",
        {"name": "Ali"},
        content_type="application/json",
        HTTP_X_TENANT_SCHEMA="tenant_ghost",
    )

    assert response.status_code == 404
    assert used_schemas == []
    assert SessionParticipant.objects.count() == before


@pytest.mark.django_db
def test_join_ticket_still_overrides_header(tenant_stack, session, used_schemas):
    """Тикет `by-code` остаётся источником схемы — путь одного центра целиком."""
    by_code = tenant_stack.get(
        f"/api/v1/quiz-sessions/by-code/{CODE}/", HTTP_X_TENANT_SCHEMA=SCHEMA_A
    )
    ticket = by_code.json()["join_ticket"]
    used_schemas.clear()

    response = tenant_stack.post(
        f"/api/v1/quiz-sessions/{session.id}/join/",
        {"name": "Ali", "ticket": ticket},
        content_type="application/json",
        HTTP_X_TENANT_SCHEMA=SCHEMA_B,
    )

    assert response.status_code == 201, response.content
    assert used_schemas == [SCHEMA_A]
