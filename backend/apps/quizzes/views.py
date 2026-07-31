from contextlib import contextmanager

from django.core.exceptions import ValidationError as DjangoValidationError
from django_tenants.utils import schema_context
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

from .models import Quiz, QuizSession, SessionParticipant
from .serializers import (
    QuestionSerializer,
    QuizSerializer,
    QuizSessionSerializer,
)
from .tickets import issue_join_ticket, read_join_ticket


class QuizJoinThrottle(AnonRateThrottle):
    """R-19: анонимные эндпоинты квиза были без ограничений — перебор кодов."""

    scope = "quiz_join"


def _get_schema(request):
    """Схема тенанта запроса — и только она.

    R-19: раньше здесь читался свободный `?schema=`, то есть любой аноним
    указывал, в какую схему платформы писать ФИО и телефон ребёнка. Теперь
    схему определяет middleware (заголовок/домен), клиент её не выбирает.
    """
    tenant = getattr(request, "tenant", None)
    return tenant.schema_name if tenant else None


@contextmanager
def _schema_ctx(schema_name):
    if schema_name:
        with schema_context(schema_name):
            yield
    else:
        yield


class QuizViewSet(viewsets.ModelViewSet):
    serializer_class = QuizSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = Quiz.objects.prefetch_related("questions__answers")
        if user.role in ("director", "branch_admin", "superadmin"):
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
        if user.role in ("director", "branch_admin", "superadmin"):
            return qs
        return qs.filter(host=user)

    @action(detail=True, methods=["get"], url_path="state")
    def state(self, request, pk=None):
        """
        Текущее состояние сессии для восстановления хоста после F5/переоткрытия
        вкладки — без этого хост после перезагрузки не знает, что случилось
        ПОСЛЕ последнего дошедшего WS-события (BUG-048).
        """
        session = self.get_object()
        questions = list(
            session.quiz.questions.prefetch_related("answers").order_by("order")
        )
        total = len(questions)
        idx = session.current_question_index
        current_question = None
        if session.status == "active" and 0 <= idx < total:
            q = questions[idx]
            current_question = {
                "id": str(q.id),
                "text": q.text,
                "time_limit": q.time_limit,
                "answers": [{"id": str(a.id), "text": a.text} for a in q.answers.all()],
            }
        return Response(
            {
                "status": session.status,
                "current_question_index": idx,
                "total_questions": total,
                "question": current_question,
                "participants_count": session.participants.count(),
            }
        )

    @action(
        detail=False,
        methods=["get"],
        url_path="by-code/(?P<code>[0-9]+)",
        authentication_classes=[],
        permission_classes=[AllowAny],
        throttle_classes=[QuizJoinThrottle],
    )
    def by_code(self, request, code=None):
        """Поиск сессии по коду — строго в схеме тенанта запроса.

        R-19: перебор всех схем платформы убран. 6-значный код уникален только
        внутри схемы, поэтому поиск «по всем центрам» отдавал участнику чужую
        сессию при совпадении кода.
        """
        schema_name = _get_schema(request)
        if not schema_name:
            return Response({"error": "Session not found"}, status=404)

        with _schema_ctx(schema_name):
            try:
                session = QuizSession.objects.select_related("quiz").get(code=code)
            except QuizSession.DoesNotExist:
                return Response({"error": "Session not found"}, status=404)

            return Response(
                {
                    "session_id": str(session.id),
                    "code": session.code,
                    "status": session.status,
                    "quiz_title": session.quiz.title,
                    "quiz_type": session.quiz.quiz_type,
                    "participants_count": session.participants.count(),
                    # Подписанный тикет: дальше клиент не выбирает схему сам.
                    "join_ticket": issue_join_ticket(schema_name, session.id, session.code),
                }
            )

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
        authentication_classes=[],
        permission_classes=[AllowAny],
        throttle_classes=[QuizJoinThrottle],
    )
    def join(self, request, pk=None):
        """Вход участника в сессию.

        R-19: схема берётся из подписанного тикета (`ticket`), выданного
        `by-code`, либо из тенанта запроса. Свободный `?schema=` и перебор всех
        схем удалены — ФИО, дата рождения и телефоны ребёнка и родителя больше
        не могут быть записаны в произвольно выбранный учебный центр.
        """
        ticket = read_join_ticket(request.data.get("ticket") or "")
        if ticket:
            if str(ticket.get("session_id")) != str(pk):
                return Response({"error": "Session not found"}, status=404)
            schema_name = ticket.get("schema")
        else:
            schema_name = _get_schema(request)

        if not schema_name:
            return Response({"error": "Session not found"}, status=404)

        with _schema_ctx(schema_name):
            try:
                session = QuizSession.objects.get(pk=pk)
            except (QuizSession.DoesNotExist, DjangoValidationError, ValueError):
                # T-030: раньше здесь стоял `except (QuizSession.DoesNotExist, Exception)`
                # — под 404 «сессии нет» пряталась ЛЮБАЯ ошибка, включая
                # несуществующую схему и падение БД. Именно так дефект класса Б-1
                # («квиз отдаёт 404 всем») прожил до прода незамеченным.
                # Оставлены только два «не найдено»-случая: записи нет и pk —
                # не UUID (`id` = UUIDField, невалидная строка даёт
                # ValidationError/ValueError, а не 500).
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
                {
                    "participant_id": str(participant.id),
                    "name": participant.name,
                    # Тикет для WebSocket: схема подписана сервером,
                    # участник не может подменить её на чужую.
                    "ws_ticket": issue_join_ticket(schema_name, session.id, session.code),
                },
                status=201,
            )
