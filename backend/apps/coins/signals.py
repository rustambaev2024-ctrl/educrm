import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.core.definitions import ATTENDANCE_COUNTED_STATUSES

logger = logging.getLogger(__name__)

# Начисление монет не должно ронять сохранение посещаемости, оценки или
# сдачи работы — учитель не поймёт, почему не сохранилась отметка. Поэтому
# ошибки здесь гасятся. Но гасить их МОЛЧА нельзя: функция срабатывает сама,
# никто её не запускает, и о поломке узнать неоткуда. Пишем в журнал.


@receiver(post_save, sender="lessons.Attendance")
def award_coins_for_attendance(sender, instance, created, **kwargs):
    if kwargs.get("raw"):
        return
    # Коины начисляются/снимаются по тем же отметкам, что попадают в
    # посещаемость: уважительный пропуск не наказывается и не награждается.
    if instance.status not in ATTENDANCE_COUNTED_STATUSES:
        return
    try:
        from apps.coins.services import award_coins, deduct_coins
        from apps.coins.models import CoinSetting, CoinTransaction
        from django.utils import timezone

        # instance.student — это уже students.Student
        student = instance.student
        if not student:
            return

        # Защита от двойного начисления за один и тот же урок
        if instance.lesson_id:
            already = CoinTransaction.objects.filter(
                wallet__student=student,
                reason__in=("attendance", "penalty"),
                comment__contains=str(instance.lesson_id),
            ).exists()
            if already:
                return

        # Монеты начисляются только за уроки не старше 2 дней
        if instance.lesson_id:
            from apps.lessons.models import Lesson
            try:
                lesson = Lesson.objects.get(id=instance.lesson_id)
                lesson_date = lesson.datetime.date()
                if (timezone.localdate() - lesson_date).days > 2:
                    return
            except Lesson.DoesNotExist:
                return

        setting = CoinSetting.get_or_create_default()
        lesson_tag = f"(lesson {instance.lesson_id})"

        if instance.status == "present":
            if setting.coins_present > 0:
                award_coins(student, setting.coins_present,
                            "attendance", f"Present at lesson {lesson_tag}")

        elif instance.status == "late":
            if setting.coins_late > 0:
                award_coins(student, setting.coins_late,
                            "attendance", f"Late to lesson {lesson_tag}")
            if setting.coins_late_penalty > 0:
                award_coins(student, setting.coins_late_penalty,
                            "attendance", f"Late bonus {lesson_tag}")
            elif setting.coins_late_penalty < 0:
                deduct_coins(student, abs(setting.coins_late_penalty),
                             "penalty", f"Late to lesson {lesson_tag}")

        elif instance.status == "absent":
            if setting.coins_absent_penalty > 0:
                award_coins(student, setting.coins_absent_penalty,
                            "attendance", f"Absent bonus {lesson_tag}")
            elif setting.coins_absent_penalty < 0:
                deduct_coins(student, abs(setting.coins_absent_penalty),
                             "penalty", f"Absent from lesson {lesson_tag}")

    except Exception:
        logger.exception(
            "Монеты за посещаемость не начислены (ученик %s, урок %s)",
            getattr(instance, "student_id", None),
            getattr(instance, "lesson_id", None),
        )


@receiver(post_save, sender="grades.Grade")
def award_coins_for_grade(sender, instance, created, **kwargs):
    if kwargs.get("raw"):
        return
    try:
        from apps.coins.services import award_coins
        from apps.coins.models import CoinSetting, CoinTransaction

        # Награда — только за 4 и 5 по новой школьной шкале 2-5.
        # До перехода здесь стояло "score_pct >= 80" — сравнение с числом,
        # которое для оценок за домашку было уже испорчено (8 из 10 хранилось
        # как 8 из 100), из-за чего монеты за отличную домашку почти никогда
        # не начислялись. Теперь оценка сама по себе уже 2-5, сравнивать
        # больше не с чем — сравниваем напрямую.
        score = instance.score
        if score < 4:
            return

        setting = CoinSetting.get_or_create_default()
        coins = setting.coins_grade_perfect if score == 5 else setting.coins_grade_good

        # Защита от двойного начисления за одну и ту же оценку
        already = CoinTransaction.objects.filter(
            wallet__student=instance.student,
            reason="grade",
            comment__contains=str(instance.pk),
        ).exists()
        if already:
            return

        award_coins(
            student=instance.student,
            amount=coins,
            reason="grade",
            comment=f"Grade {instance.score}/5 (id {instance.pk})",
        )
    except Exception:
        logger.exception("Монеты за оценку не начислены (оценка %s)", instance.pk)


@receiver(post_save, sender="homework.HomeworkStatus")
def award_coins_for_homework(sender, instance, created, **kwargs):
    if kwargs.get("raw"):
        return
    # Начисляем при переходе в статус "submitted"
    if instance.status != "submitted":
        return
    try:
        from apps.coins.services import award_coins
        from apps.coins.models import CoinSetting, CoinTransaction

        # Защита от двойного начисления за одну домашку
        already = CoinTransaction.objects.filter(
            wallet__student=instance.student,
            reason="homework",
            comment__contains=str(instance.homework_id),
        ).exists()
        if already:
            return

        # Проверка дедлайна — начисляем только если сдано вовремя
        homework = instance.homework
        if homework.deadline and instance.submitted_at:
            if instance.submitted_at > homework.deadline:
                return

        setting = CoinSetting.get_or_create_default()
        award_coins(
            student=instance.student,
            amount=setting.coins_homework_done,
            reason="homework",
            comment=f"Homework submitted on time (hw {instance.homework_id})",
        )
    except Exception:
        logger.exception(
            "Монеты за домашнюю работу не начислены (работа %s, ученик %s)",
            getattr(instance, "homework_id", None),
            getattr(instance, "student_id", None),
        )


@receiver(post_save, sender="students.Student")
def create_wallet_for_new_student(sender, instance, created, **kwargs):
    """Создать кошелёк автоматически при создании студента"""
    if kwargs.get("raw"):
        return
    if not created:
        return
    try:
        from apps.coins.models import CoinWallet
        CoinWallet.objects.get_or_create(student=instance)
    except Exception:
        logger.exception("Кошелёк монет не создан для ученика %s", instance.pk)
