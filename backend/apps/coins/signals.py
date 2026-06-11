from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender="lessons.Attendance")
def award_coins_for_attendance(sender, instance, created, **kwargs):
    # Начисляем только за present/late
    if instance.status not in ("present", "late"):
        return
    try:
        from apps.coins.services import award_coins
        from apps.coins.models import CoinSetting, CoinTransaction
        from django.utils import timezone

        # instance.student — это уже students.Student
        student = instance.student
        if not student:
            return

        # Защита от двойного начисления за один и тот же урок (при повторном save)
        if instance.lesson_id:
            already = CoinTransaction.objects.filter(
                wallet__student=student,
                reason="attendance",
                comment__contains=str(instance.lesson_id),
                created_at__date=timezone.now().date(),
            ).exists()
            if already:
                return

        setting = CoinSetting.get_or_create_default()
        coins = (
            setting.coins_present
            if instance.status == "present"
            else setting.coins_late
        )

        award_coins(
            student=student,
            amount=coins,
            reason="attendance",
            comment=f"Attendance: {instance.status} (lesson {instance.lesson_id})",
        )
    except Exception:
        pass


@receiver(post_save, sender="grades.Grade")
def award_coins_for_grade(sender, instance, created, **kwargs):
    if not created:
        return
    try:
        from apps.coins.services import award_coins
        from apps.coins.models import CoinSetting

        setting = CoinSetting.get_or_create_default()

        # Grade.score хранится как 0-100 (percent-like)
        score_pct = instance.score or 0

        if score_pct >= 100:
            coins = setting.coins_grade_perfect
        elif score_pct >= 80:
            coins = setting.coins_grade_good
        else:
            return

        award_coins(
            student=instance.student,
            amount=coins,
            reason="grade",
            comment=f"Grade {instance.score}/100",
        )
    except Exception:
        pass


@receiver(post_save, sender="homework.HomeworkStatus")
def award_coins_for_homework(sender, instance, created, **kwargs):
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
        pass
