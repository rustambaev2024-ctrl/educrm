from rest_framework import serializers

from .models import Answer, Question, Quiz, QuizSession, SessionParticipant


class AnswerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Answer
        fields = ["id", "text", "is_correct", "order"]


class QuestionSerializer(serializers.ModelSerializer):
    answers = AnswerSerializer(many=True)

    class Meta:
        model = Question
        fields = ["id", "text", "order", "time_limit", "answers"]

    def validate(self, data):
        answers = data.get("answers", [])
        if len(answers) < 2:
            raise serializers.ValidationError(
                "Kamida 2 ta javob varianti kerak / Нужно минимум 2 варианта ответа"
            )
        correct = [a for a in answers if a.get("is_correct")]
        if not correct:
            raise serializers.ValidationError(
                "Kamida 1 ta to'g'ri javob belgilanishi kerak / Нужен хотя бы 1 правильный ответ"
            )
        return data

    def create(self, validated_data):
        answers_data = validated_data.pop("answers")
        question = Question.objects.create(**validated_data)
        for a in answers_data:
            Answer.objects.create(question=question, **a)
        return question


class QuizSerializer(serializers.ModelSerializer):
    questions = QuestionSerializer(many=True, read_only=True)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True)
    questions_count = serializers.IntegerField(source="questions.count", read_only=True)
    sessions_count = serializers.IntegerField(source="sessions.count", read_only=True)

    class Meta:
        model = Quiz
        fields = [
            "id",
            "title",
            "description",
            "quiz_type",
            "created_by",
            "created_by_name",
            "questions",
            "questions_count",
            "sessions_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_by"]


class ParticipantSerializer(serializers.ModelSerializer):
    answers_count = serializers.IntegerField(source="answers.count", read_only=True)

    class Meta:
        model = SessionParticipant
        fields = [
            "id",
            "name",
            "phone",
            "birth_date",
            "parent_name",
            "parent_phone",
            "score",
            "rank",
            "joined_at",
            "answers_count",
        ]


class QuizSessionSerializer(serializers.ModelSerializer):
    quiz_title = serializers.CharField(source="quiz.title", read_only=True)
    quiz_type = serializers.CharField(source="quiz.quiz_type", read_only=True)
    host_name = serializers.CharField(source="host.full_name", read_only=True)
    participants_count = serializers.IntegerField(source="participants.count", read_only=True)
    participants = ParticipantSerializer(many=True, read_only=True)

    class Meta:
        model = QuizSession
        fields = [
            "id",
            "code",
            "status",
            "quiz",
            "quiz_title",
            "quiz_type",
            "host",
            "host_name",
            "current_question_index",
            "participants_count",
            "participants",
            "started_at",
            "ended_at",
            "created_at",
        ]
        read_only_fields = ["host", "code", "status"]
