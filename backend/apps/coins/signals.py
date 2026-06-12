from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender="lessons.Attendance")
def award_coins_for_attendance(sender, instance, created, **kwargs):
    if instance.status not in ("present", "late", "absent"):
        return
    try:
        from apps.coins.services import award_coins, deduct_coins
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
                reason__in=("attendance", "penalty"),
                comment__contains=str(instance.lesson_id),
                created_at__date=timezone.now().date(),
            ).exists()
            if already:
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
        pass


@receiver(post_save, sender="grades.Grade")
def award_coins_for_grade(sender, instance, created, **kwargs):
    try:
        from apps.coins.services import award_coins
        from apps.coins.models import CoinSetting, CoinTransaction

        score_pct = instance.score or 0
        if score_pct < 80:
            return

        setting = CoinSetting.get_or_create_default()
        coins = setting.coins_grade_perfect if score_pct >= 100 else setting.coins_grade_good

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
            comment=f"Grade {instance.score}/100 (id {instance.pk})",
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


@receiver(post_save, sender="students.Student")
def create_wallet_for_new_student(sender, instance, created, **kwargs):
    """Создать кошелёк автоматически при создании студента"""
    if not created:
        return
    try:
        from apps.coins.models import CoinWallet
        CoinWallet.objects.get_or_create(student=instance)
    except Exception:
        pass
