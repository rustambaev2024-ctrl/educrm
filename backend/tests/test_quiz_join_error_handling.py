"""T-030: `join` больше не прячет любую ошибку под 404 «сессии нет».

Было: `except (QuizSession.DoesNotExist, Exception)` — второй элемент кортежа
делал первый декоративным. Под 404 уходили падения БД, отсутствующая схема,
ошибки конфигурации. Ровно этот класс маскировки позволил дефекту Б-1
(«живой квиз отдаёт 404 всем») дожить до прода незамеченным.

Стало: 404 только для «записи нет» и «pk не UUID». Всё остальное поднимается
наверх и попадает в логи/мониторинг как 500.
"""
import uuid
from contextlib import contextmanager
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.db import DatabaseError
from django.test import Client

from apps.quizzes.models import Quiz, QuizSession, SessionParticipant

User = get_user_model()

SCHEMA = "tenant_alpha"


@contextmanager
def _noop_ctx(schema_name):
    yield


@pytest.fixture
def session(db):
    host = User.objects.create_user(
        phone="+998900000031", password="x", role="teacher", full_name="Host T030"
    )
    quiz = Quiz.objects.create(title="Live T030", created_by=host, quiz_type="student")
    return QuizSession.objects.create(quiz=quiz, host=host, code="654321")


@pytest.fixture
def anon_client(session):
    """Тенант резолвится вьюхой напрямую — middleware тенанта здесь не нужен."""
    with patch("apps.quizzes.views._schema_ctx", _noop_ctx), patch(
        "apps.quizzes.views._get_schema", return_value=SCHEMA
    ):
        yield Client()


@pytest.mark.django_db
def test_join_unknown_session_is_404(anon_client):
    response = anon_client.post(
        f"/api/v1/quiz-sessions/{uuid.uuid4()}/join/",
        {"name": "Ali"},
        content_type="application/json",
    )
    assert response.status_code == 404


@pytest.mark.django_db
def test_join_malformed_pk_is_404_not_500(anon_client):
    """`id` — UUIDField: мусорный pk даёт ValidationError, а не DoesNotExist."""
    response = anon_client.post(
        "/api/v1/quiz-sessions/not-a-uuid/join/",
        {"name": "Ali"},
        content_type="application/json",
    )
    assert response.status_code == 404


@pytest.mark.django_db
def test_join_database_error_is_not_masked_as_404(anon_client, session):
    """Регресс T-030: настоящая ошибка обязана всплыть, а не стать 404."""
    with patch(
        "apps.quizzes.models.QuizSession.objects.get",
        side_effect=DatabaseError("connection lost"),
    ):
        with pytest.raises(DatabaseError):
            anon_client.post(
                f"/api/v1/quiz-sessions/{session.id}/join/",
                {"name": "Ali"},
                content_type="application/json",
            )


@pytest.mark.django_db
def test_join_happy_path_still_works(anon_client, session):
    response = anon_client.post(
        f"/api/v1/quiz-sessions/{session.id}/join/",
        {"name": "Ali"},
        content_type="application/json",
    )
    assert response.status_code == 201, response.content
    assert SessionParticipant.objects.filter(
        id=response.json()["participant_id"]
    ).exists()
