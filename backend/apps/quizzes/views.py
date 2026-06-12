from contextlib import contextmanager

from django_tenants.utils import schema_context
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import Quiz, QuizSession, SessionParticipant
from .serializers import (
    QuestionSerializer,
    QuizSerializer,
    QuizSessionSerializer,
)


def _get_schema(request):
    """Resolve tenant schema from query param, header, or active tenant."""
    return (
        request.query_params.get("schema")
        or request.META.get("HTTP_X_TENANT_SCHEMA")
        or (request.tenant.schema_name if getattr(request, "tenant", None) else None)
    )


@contextmanager
def _schema_ctx(schema_name):
    if schema_name:
        with schema_context(schema_name):
            yield
    else:
        yield


def _list_tenant_schemas():
    """Список всех tenant-схем (кроме public). Запрашивается в public-контексте."""
    from apps.tenants.models import Institution
    from django_tenants.utils import get_public_schema_name
    from django.db import connection

    public = get_public_schema_name()
    connection.set_schema_to_public()
    return list(
        Institution.objects.exclude(schema_name=public).values_list("schema_name", flat=True)
    )


def _find_schema_for_session(predicate):
    """
    Перебрать все tenant-схемы и вернуть имя той, где predicate() находит сессию.
    predicate выполняется ВНУТРИ schema_context, поэтому любой доступ к данным
    безопасен. Возвращает schema_name или None.
    """
    for schema_name in _list_tenant_schemas():
        try:
            with schema_context(schema_name):
                if predicate():
                    return schema_name
        except QuizSession.DoesNotExist:
            continue
        except Exception:
            continue
    return None


class QuizViewSet(viewsets.ModelViewSet):
    serializer_class = QuizSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = Quiz.objects.prefetch_related("questions__answers")
        if user.role in ("director", "admin", "branch_admin", "superadmin"):
            return qs
        return qs.filter(created_by=user)

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=["post"], url_path="questions")
    def add_question(self, request, pk=None):
        quiz = self.get_object()
        serializer = QuestionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(quiz=quiz)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="sessions")
    def create_session(self, request, pk=None):
        quiz = self.get_object()
        session = QuizSession.objects.create(
            quiz=quiz,
            host=request.user,
            code=QuizSession.generate_code(),
        )
        return Response(QuizSessionSerializer(session).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["patch", "delete"],
            url_path="questions/(?P<question_id>[^/.]+)")
    def update_question(self, request, pk=None, question_id=None):
        quiz = self.get_object()
        try:
            from .models import Answer, Question
            question = quiz.questions.get(id=question_id)
        except Exception:
            return Response({"error": "Not found"}, status=404)

        if request.method == "DELETE":
            question.delete()
            return Response(status=204)

        if "text" in request.data:
            question.text = request.data["text"]
        if "time_limit" in request.data:
            question.time_limit = request.data["time_limit"]
        if "order" in request.data:
            question.order = request.data["order"]
        question.save()

        if "answers" in request.data:
            question.answers.all().delete()
            for a in request.data["answers"]:
                Answer.objects.create(
                    question=question,
                    text=a["text"],
                    is_correct=a.get("is_correct", False),
                    order=a.get("order", 0),
                )

        from .serializers import QuestionSerializer
        return Response(QuestionSerializer(question).data)

    @create_session.mapping.get
    def list_sessions(self, request, pk=None):
        quiz = self.get_object()
        sessions = quiz.sessions.prefetch_related("participants").order_by("-created_at")
        return Response(QuizSessionSerializer(sessions, many=True).data)


class QuizSessionViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = QuizSessionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = QuizSession.objects.prefetch_related("participants").select_related("quiz", "host")
        if not user.is_authenticated:
            return qs.none()
        if user.role in ("director", "admin", "branch_admin", "superadmin"):
            return qs
        return qs.filter(host=user)

    @action(
        detail=False,
        methods=["get"],
        url_path="by-code/(?P<code>[0-9]+)",
        permission_classes=[AllowAny],
    )
    def by_code(self, request, code=None):
        def _fetch_payload():
            """Возвращает dict с данными сессии. Выполняется внутри нужной схемы."""
            session = QuizSession.objects.select_related("quiz").get(code=code)
            return {
                "session_id": str(session.id),
                "code": session.code,
                "status": session.status,
                "quiz_title": session.quiz.title,
                "quiz_type": session.quiz.quiz_type,
                "participants_count": session.participants.count(),
            }

        schema_name = _get_schema(request)

        # 1) Если schema известна — ищем в ней.
        if schema_name:
            try:
                with _schema_ctx(schema_name):
                    return Response(_fetch_payload())
            except (QuizSession.DoesNotExist, Exception):
                pass

        # 2) Fallback: ищем схему, где есть сессия с этим кодом, и сериализуем там же.
        found_schema = _find_schema_for_session(
            lambda: QuizSession.objects.filter(code=code).exists()
        )
        if found_schema:
            try:
                with schema_context(found_schema):
                    return Response(_fetch_payload())
            except Exception:
                pass

        return Response({"error": "Session not found"}, status=404)

    @action(detail=True, methods=["post"], url_path="force-finish")
    def force_finish(self, request, pk=None):
        session = self.get_object()
        if session.status == "finished":
            return Response({"detail": "Already finished"}, status=400)
        from django.utils import timezone
        session.status = "finished"
        session.ended_at = timezone.now()
        session.save(update_fields=["status", "ended_at"])
        from .models import SessionParticipant
        participants = list(SessionParticipant.objects.filter(session=session).order_by("-score"))
        for rank, p in enumerate(participants, 1):
            p.rank = rank
        SessionParticipant.objects.bulk_update(participants, ["rank"])
        return Response({"status": "finished"})

    @action(detail=True, methods=["delete"], url_path=r"participants/(?P<participant_id>[^/.]+)")
    def kick_participant(self, request, pk=None, participant_id=None):
        session = self.get_object()
        if session.status != "waiting":
            return Response({"detail": "Can only kick from waiting session"}, status=400)
        from .models import SessionParticipant
        try:
            participant = SessionParticipant.objects.get(id=participant_id, session=session)
        except SessionParticipant.DoesNotExist:
            return Response({"detail": "Participant not found"}, status=404)
        participant.delete()
        return Response(status=204)

    @action(
        detail=True,
        methods=["post"],
        url_path="join",
        permission_classes=[AllowAny],
    )
    def join(self, request, pk=None):
        schema_name = _get_schema(request)

        # Определяем рабочую схему: переданная или найденная по всем тенантам.
        if not schema_name:
            schema_name = _find_schema_for_session(
                lambda: QuizSession.objects.filter(pk=pk).exists()
            )

        if not schema_name:
            return Response({"error": "Session not found"}, status=404)

        with _schema_ctx(schema_name):
            try:
                session = QuizSession.objects.get(pk=pk)
            except (QuizSession.DoesNotExist, Exception):
                return Response({"error": "Session not found"}, status=404)

            if session.status != "waiting":
                return Response({"error": "Session already started"}, status=400)

            data = request.data
            name = (data.get("name") or "").strip()
            if not name:
                return Response({"error": "name_required"}, status=400)

            # БАГ 5: для lead тестов — обязательные поля на бэкенде
            if session.quiz.quiz_type == "lead":
                if not (data.get("phone") or "").strip():
                    return Response({"error": "phone_required"}, status=400)
                if not (data.get("parent_name") or "").strip():
                    return Response({"error": "parent_name_required"}, status=400)
                if not (data.get("parent_phone") or "").strip():
                    return Response({"error": "parent_phone_required"}, status=400)

            participant = SessionParticipant.objects.create(
                session=session,
                name=name,
                phone=data.get("phone", ""),
                birth_date=data.get("birth_date") or None,
                parent_name=data.get("parent_name", ""),
                parent_phone=data.get("parent_phone", ""),
            )
            return Response(
                {"participant_id": str(participant.id), "name": participant.name},
                status=201,
            )
