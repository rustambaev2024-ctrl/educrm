import json
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.utils import timezone
from django_tenants.utils import schema_context


class QuizConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.session_code = self.scope["url_route"]["kwargs"]["code"]
        self.room_group = f"quiz_{self.session_code}"

        # Tenant schema resolution:
        # - authenticated host: schema comes from JWT (scope["schema_name"])
        # - anonymous participant: schema is passed as ?schema=<name> in the WS URL
        scope_schema = self.scope.get("schema_name", "public")
        qs = parse_qs(self.scope.get("query_string", b"").decode())
        query_schema = qs.get("schema", [""])[0]
        self.schema_name = query_schema or scope_schema or "public"

        await self.channel_layer.group_add(self.room_group, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.room_group, self.channel_name)

    async def receive(self, text_data):
        data = json.loads(text_data)
        msg_type = data.get("type")

        if msg_type == "host_start":
            await self.handle_start(data)
        elif msg_type == "host_next":
            await self.handle_next(data)
        elif msg_type == "host_finish":
            await self.handle_finish(data)
        elif msg_type == "participant_answer":
            await self.handle_answer(data)
        elif msg_type == "ping":
            await self.send(text_data=json.dumps({"type": "pong"}))

    async def handle_start(self, data):
        session = await self.get_session()
        if not session:
            return
        await self.set_session_status(session, "active", 0)
        questions = await self.get_questions(session)
        if not questions:
            return
        first_q = questions[0]
        await self.channel_layer.group_send(
            self.room_group,
            {
                "type": "quiz_event",
                "payload": {
                    "type": "question",
                    "index": 0,
                    "total": len(questions),
                    "question": first_q,
                },
            },
        )

    async def handle_next(self, data):
        session = await self.get_session()
        if not session:
            return
        questions = await self.get_questions(session)
        next_index = session.current_question_index + 1
        if next_index >= len(questions):
            await self.handle_finish(data)
            return
        await self.set_session_question_index(session, next_index)
        await self.channel_layer.group_send(
            self.room_group,
            {
                "type": "quiz_event",
                "payload": {
                    "type": "question",
                    "index": next_index,
                    "total": len(questions),
                    "question": questions[next_index],
                },
            },
        )

    async def handle_finish(self, data):
        session = await self.get_session()
        if not session:
            return
        await self.finalize_session(session)
        results = await self.get_results(session)
        await self.channel_layer.group_send(
            self.room_group,
            {
                "type": "quiz_event",
                "payload": {"type": "finished", "results": results},
            },
        )

    async def handle_answer(self, data):
        participant_id = data.get("participant_id")
        question_id = data.get("question_id")
        answer_id = data.get("answer_id")
        result = await self.save_answer(participant_id, question_id, answer_id)
        # Уведомить хоста о новом ответе
        await self.channel_layer.group_send(
            self.room_group,
            {
                "type": "quiz_event",
                "payload": {
                    "type": "answer_received",
                    "participant_id": participant_id,
                    "is_correct": result["is_correct"],
                    "score": result["score"],
                },
            },
        )

    async def quiz_event(self, event):
        await self.send(text_data=json.dumps(event["payload"]))

    # ─── DB helpers (all wrapped in tenant schema_context) ──────────────────────

    @database_sync_to_async
    def get_session(self):
        from .models import QuizSession

        with schema_context(self.schema_name):
            try:
                return QuizSession.objects.select_related("quiz").get(code=self.session_code)
            except QuizSession.DoesNotExist:
                return None

    @database_sync_to_async
    def get_questions(self, session):
        with schema_context(self.schema_name):
            questions = list(
                session.quiz.questions.prefetch_related("answers").order_by("order")
            )
            result = []
            for q in questions:
                result.append(
                    {
                        "id": str(q.id),
                        "text": q.text,
                        "time_limit": q.time_limit,
                        "answers": [
                            {"id": str(a.id), "text": a.text}
                            for a in q.answers.all()
                        ],
                    }
                )
            return result

    @database_sync_to_async
    def set_session_status(self, session, status, question_index):
        with schema_context(self.schema_name):
            session.status = status
            session.current_question_index = question_index
            if status == "active":
                session.started_at = timezone.now()
            session.save(update_fields=["status", "current_question_index", "started_at"])

    @database_sync_to_async
    def set_session_question_index(self, session, index):
        with schema_context(self.schema_name):
            session.current_question_index = index
            session.save(update_fields=["current_question_index"])

    @database_sync_to_async
    def finalize_session(self, session):
        from .models import SessionParticipant

        with schema_context(self.schema_name):
            session.status = "finished"
            session.ended_at = timezone.now()
            session.save(update_fields=["status", "ended_at"])
            # Вычислить рейтинг участников
            participants = list(
                SessionParticipant.objects.filter(session=session).order_by("-score")
            )
            for rank, p in enumerate(participants, 1):
                p.rank = rank
            SessionParticipant.objects.bulk_update(participants, ["rank"])

    @database_sync_to_async
    def save_answer(self, participant_id, question_id, answer_id):
        from .models import Answer, ParticipantAnswer, SessionParticipant

        with schema_context(self.schema_name):
            try:
                participant = SessionParticipant.objects.get(id=participant_id)
                # Защита от повторного ответа на тот же вопрос
                if ParticipantAnswer.objects.filter(
                    participant=participant, question_id=question_id
                ).exists():
                    return {"is_correct": False, "score": participant.score}

                answer = Answer.objects.get(id=answer_id)
                is_correct = answer.is_correct
                # Очки: 1000 за правильный ответ (как Kahoot)
                score_delta = 1000 if is_correct else 0
                ParticipantAnswer.objects.create(
                    participant=participant,
                    question_id=question_id,
                    answer=answer,
                    is_correct=is_correct,
                )
                if is_correct:
                    participant.score += score_delta
                    participant.save(update_fields=["score"])
                return {"is_correct": is_correct, "score": participant.score}
            except Exception:
                return {"is_correct": False, "score": 0}

    @database_sync_to_async
    def get_results(self, session):
        from .models import SessionParticipant

        with schema_context(self.schema_name):
            participants = SessionParticipant.objects.filter(session=session).order_by("-score")
            return [
                {
                    "participant_id": str(p.id),
                    "name": p.name,
                    "score": p.score,
                    "rank": p.rank,
                }
                for p in participants
            ]
