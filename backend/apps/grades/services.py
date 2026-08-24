from django.db import transaction

from apps.homework.models import HomeworkStatus

from .models import ExamResult, Grade


def band_percent_to_scale(percent: float) -> int:
    """
    Процент от максимума -> оценка 2-5.

    Пороги — не произвольные: это те же 85/65/50, что уже негласно стояли
    за цветом оценок в шести задублированных местах фронтенда (scoreTone),
    формализованные теперь в саму оценку, а не только в цвет.
    """
    if percent >= 85:
        return 5
    if percent >= 65:
        return 4
    if percent >= 50:
        return 3
    return 2


@transaction.atomic
def upsert_homework_grade(homework_status: HomeworkStatus, graded_by):
    if homework_status.grade is None:
        return None
    homework = homework_status.homework
    grade, _ = Grade.objects.update_or_create(
        homework_status=homework_status,
        defaults={
            "student": homework_status.student,
            "group": homework.group,
            "lesson": homework.lesson,
            "grade_type": "homework",
            "score": homework_status.grade,
            "comment": homework_status.teacher_comment,
            "graded_by": graded_by,
        },
    )
    return grade


@transaction.atomic
def upsert_exam_grade(exam_result: ExamResult):
    grade, _ = Grade.objects.update_or_create(
        exam=exam_result.exam,
        student=exam_result.student,
        defaults={
            "group": exam_result.exam.group,
            "grade_type": "exam",
            "score": exam_result.score,
            "comment": exam_result.comment,
            "graded_by": exam_result.recorded_by,
        },
    )
    return grade
