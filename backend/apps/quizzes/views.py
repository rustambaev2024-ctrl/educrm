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


class QuizViewSet(viewsets.ModelViewSet):
    serializer_class = QuizSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = Quiz.objects.prefetch_related("questions__answers")
        # Директор и Админ видят все тесты
        if user.role in ("director", "admin", "branch_admin", "superadmin"):
            return qs
        # Учитель — только свои
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

    # Same url_path ("sessions"), GET method — list the quiz's sessions.
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
            }
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="join",
        permission_classes=[AllowAny],
    )
    def join(self, request, pk=None):
        # detail=True with AllowAny: fetch directly (scoped queryset returns none for anon).
        try:
            session = QuizSession.objects.get(pk=pk)
        except QuizSession.DoesNotExist:
            return Response({"error": "Session not found"}, status=404)

        if session.status != "waiting":
            return Response({"error": "Session already started"}, status=400)

        data = request.data
        if not (data.get("name") or "").strip():
            return Response({"error": "Name is required"}, status=400)

        participant = SessionParticipant.objects.create(
            session=session,
            name=data.get("name", "").strip(),
            phone=data.get("phone", ""),
            birth_date=data.get("birth_date") or None,
            parent_name=data.get("parent_name", ""),
            parent_phone=data.get("parent_phone", ""),
        )
        return Response(
            {
                "participant_id": str(participant.id),
                "name": participant.name,
            },
            status=201,
        )
