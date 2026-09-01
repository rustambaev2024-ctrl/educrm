import logging
from calendar import monthrange
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction

from apps.core.definitions import is_debtor_balance, wallet_delta
from apps.lessons.services import slot_weekday
from apps.notifications.services import NotificationService
from apps.students.models import Student

from .models import Payment, Wallet

logger = logging.getLogger(__name__)


# Отметки, за которые ученик платит за урок. Сегодня набор совпадает с
# apps.core.definitions.ATTENDANCE_PRESENT_STATUSES, но остаётся отдельным
# именем сознательно: «считается присутствием в отчёте» и «платит за занятие» —
# разные вопросы, и правило биллинга не должно меняться заодно с правилом
# метрики. Если наборы начнут расходиться — так и должно быть.
CHARGEABLE_ATTENDANCE_STATUSES = {"present", "late"}


@dataclass
class PaymentResult:
    payment: Payment
    status_changed: bool


def get_or_create_wallet(student: Student) -> Wallet:
    wallet, created = Wallet.objects.get_or_create(
        student=student,
        defaults={"balance": student.wallet_balance, "bonus_balance": student.bonus_balance},
    )
    if not created and abs(float(wallet.balance) - float(student.wallet_balance)) > 0.01:
        logger.warning(
            "Wallet balance mismatch for student %s: wallet=%s, student=%s. Syncing from student.",
            student.id,
            wallet.balance,
            student.wallet_balance,
        )
        wallet.balance = student.wallet_balance
        wallet.save(update_fields=["balance", "updated_at"])
    return wallet


def calculate_lesson_price(group, lesson_date: date) -> Decimal:
    year, month = lesson_date.year, lesson_date.month
    _, days_in_month = monthrange(year, month)

    lesson_days = {
        slot_weekday(slot)
        for slot in (group.schedule or [])
        if isinstance(slot, dict)
    } - {None}
    lessons_count = sum(
        1
        for day in range(1, days_in_month + 1)
        if date(year, month, day).weekday() in lesson_days
    )
    if lessons_count <= 0:
        return Decimal("0.00")

    return (group.monthly_price / Decimal(lessons_count)).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )


_PROTECTED_STATUSES = {"frozen", "expelled", "graduate", "archived"}


def _status_changed_for_combined_balance(student: Student) -> bool:
    """
    Единая точка, откуда меняется student.status — по правилу
    is_debtor_balance(main + bonus), а не по одному основному балансу.
    Вызывается после ЛЮБОЙ операции apply_payment, вне зависимости от
    того, main или bonus она затронула: чистое начисление бонуса без
    единого списания урока тоже может вывести ученика из долга.
    """
    if student.status in _PROTECTED_STATUSES:
        return False
    combined = student.wallet_balance + student.bonus_balance
    previous = student.status
    is_debtor = is_debtor_balance(combined)
    if is_debtor and student.status != "debtor":
        student.status = "debtor"
    elif not is_debtor and student.status == "debtor":
        student.status = "active"
    if previous != student.status:
        student.save(update_fields=["status"])
        return True
    return False


def _notify_student_became_debtor(student: Student):
    recipients = [student.user]
    parent_users = [parent.user for parent in student.parents.select_related("user").all()]
    recipients.extend(parent_users)
    NotificationService.notify(
        recipients=recipients,
        notification_type="payment_due",
        title="Hisobingiz manfiy bo'ldi / Баланс стал отрицательным",
        body="Iltimos, hisobingizni to'ldiring. / Пожалуйста, пополните счёт.",
        related_object_type="Student",
        related_object_id=str(student.id),
    )


@transaction.atomic
def apply_payment(
    student: Student,
    payment_type: str,
    amount: Decimal,
    *,
    created_by=None,
    group=None,
    lesson=None,
    method: str = "",
    category: str = "tuition",
    comment: str = "",
    suppress_notifications: bool = False,
    funding_source: str = "main",
) -> PaymentResult:
    if funding_source not in ("main", "bonus"):
        raise ValueError("Unsupported funding_source")
    amount = Decimal(amount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if amount <= 0:
        raise ValueError("Amount must be greater than zero")
    if payment_type not in {"top_up", "charge", "discount", "refund", "manual_charge", "manual_top_up"}:
        raise ValueError("Unsupported payment type")

    student = Student.objects.select_for_update().select_related("user").get(id=student.id)
    wallet, _ = Wallet.objects.select_for_update().get_or_create(
        student=student,
        defaults={"balance": student.wallet_balance, "bonus_balance": student.bonus_balance},
    )

    delta = wallet_delta(payment_type, amount)

    if funding_source == "bonus":
        balance_before = wallet.bonus_balance
        balance_after = (wallet.bonus_balance + delta).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        wallet.bonus_balance = balance_after
        wallet.save(update_fields=["bonus_balance", "updated_at"])
        student.bonus_balance = balance_after
        student.save(update_fields=["bonus_balance"])
    else:
        balance_before = wallet.balance
        balance_after = (wallet.balance + delta).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        wallet.balance = balance_after
        wallet.save(update_fields=["balance", "updated_at"])
        student.wallet_balance = balance_after
        student.save(update_fields=["wallet_balance"])

    teacher_id = group.teacher_id if group and group.teacher_id else None

    payment = Payment.objects.create(
        wallet=wallet,
        student=student,
        branch=student.branch,
        group=group,
        lesson=lesson,
        teacher_id=teacher_id,
        payment_type=payment_type,
        amount=amount,
        balance_before=balance_before,
        balance_after=balance_after,
        method=method,
        category=category,
        comment=comment,
        created_by=created_by,
        funding_source=funding_source,
    )

    # Пересчёт статуса — по сумме main+bonus, всегда, вне зависимости от
    # того, какой счёт затронула эта конкретная операция: чистое
    # начисление бонуса без единого списания урока тоже может вывести
    # ученика из статуса "должник".
    status_changed = _status_changed_for_combined_balance(student)
    if status_changed and student.status == "debtor" and not suppress_notifications:
        _notify_student_became_debtor(student)

    return PaymentResult(payment=payment, status_changed=status_changed)


@transaction.atomic
def charge_for_lesson(
    student: Student,
    group,
    lesson,
    lesson_price: Decimal,
    *,
    category: str = "tuition",
    comment: str = "",
    created_by=None,
) -> list[PaymentResult]:
    """
    Списывает lesson_price за урок, разбивая между основным балансом и
    бонусом. Основной баланс покрывает столько, сколько на нём
    ПОЛОЖИТЕЛЬНОГО есть (уже отрицательный баланс не считается
    "доступным" — тогда всё сразу уходит в бонус). Остаток берётся из
    бонуса, не больше, чем там реально есть. Если и бонуса не хватило —
    непокрытый остаток списывается с основного, уходя в минус, как и
    раньше. Возвращает 1 или 2 PaymentResult: одна запись, если счёт
    всего один, две — если списание разбилось между main и bonus.
    """
    wallet = get_or_create_wallet(student)
    # Снимок из get_or_create_wallet не заблокирован — перечитываем ту же
    # строку под select_for_update() ДО того, как считать разбивку, иначе
    # решение о том, сколько взять с bonus/main, может быть принято по
    # устаревшим цифрам, если параллельная транзакция (например, пополнение
    # через API) успеет изменить тот же кошелёк между чтением и записью.
    wallet = Wallet.objects.select_for_update().get(pk=wallet.pk)
    main_available = max(wallet.balance, Decimal("0.00"))
    from_main = min(lesson_price, main_available)
    remainder = lesson_price - from_main
    from_bonus = min(remainder, wallet.bonus_balance) if remainder > 0 else Decimal("0.00")
    # from_main_final != from_main, если бонуса не хватило на remainder: недостача
    # возвращается на main вторым слагаемым, даже если это уводит баланс в минус.
    from_main_final = lesson_price - from_bonus

    results = []
    if from_bonus > 0:
        results.append(apply_payment(
            student=student,
            payment_type="charge",
            amount=from_bonus,
            group=group,
            lesson=lesson,
            category=category,
            comment=comment,
            created_by=created_by,
            funding_source="bonus",
        ))
    if from_main_final > 0:
        results.append(apply_payment(
            student=student,
            payment_type="charge",
            amount=from_main_final,
            group=group,
            lesson=lesson,
            category=category,
            comment=comment,
            created_by=created_by,
            funding_source="main",
        ))
    return results


def refund_lesson_charges(lesson, *, student=None, created_by=None) -> int:
    """Вернуть деньги, списанные за занятие. Возвращает число возвратов.

    Одно правило для трёх поводов: урок отменили, урок перенесли, ученику
    поставили уважительную причину. Во всех трёх случаях занятия не было —
    значит и денег за него быть не должно. Раньше возврат существовал только
    для уважительной причины, а отмена и перенос уже списанные деньги
    оставляли: за перенесённый урок платили дважды — за старую дату и за новую.

    Идемпотентна: уже возвращённые списания пропускаются.
    """
    charges = Payment.objects.filter(lesson=lesson, payment_type="charge")
    if student is not None:
        charges = charges.filter(student=student)

    refunded = 0
    for charge in charges:
        if Payment.objects.filter(comment=f"Reversal of payment {charge.id}").exists():
            continue
        try:
            with transaction.atomic():
                reverse_payment(charge, created_by=created_by)
            refunded += 1
        except Exception:
            # Возврат не должен ронять отмену/перенос урока: администратор не
            # поймёт, почему действие не сохранилось.
            logger.exception(
                "Не удалось вернуть списание %s за урок %s", charge.id, lesson.id
            )
    return refunded


@transaction.atomic
def reverse_payment(payment: Payment, created_by=None) -> PaymentResult:
    """
    Cancels a payment by applying a reverse operation.
    If it was a charge -> refund back to wallet, and mark attendance as not charged.
    If it was a top_up -> subtract from wallet (correction).
    """
    if payment.payment_type == "refund":
        raise ValueError("Cannot reverse a refund payment")

    # Блокируем строку платежа и проверяем повтор ЗДЕСЬ, а не только во вьюхе.
    # Отмену запускают три независимых источника: кнопка в интерфейсе, сигнал
    # «уважительная причина» и команда возврата ошибочных списаний. Проверка
    # «уже отменён» снаружи не атомарна — два одновременных вызова проходят её
    # оба и возвращают деньги дважды.
    payment = Payment.objects.select_for_update().get(id=payment.id)
    comment = f"Reversal of payment {payment.id}"
    if Payment.objects.filter(comment=comment).exists():
        raise ValueError("Payment is already reversed")

    if payment.payment_type == "charge":
        # Charge was -amount. Refund is +amount.
        result = apply_payment(
            student=payment.student,
            payment_type="refund",
            amount=payment.amount,
            group=payment.group,
            lesson=payment.lesson,
            created_by=created_by,
            comment=comment,
            funding_source=payment.funding_source,
        )
        # Update attendance if exists
        if payment.lesson:
            from apps.lessons.models import Attendance
            Attendance.objects.filter(
                lesson=payment.lesson,
                student=payment.student
            ).update(is_charged=False)

    elif payment.payment_type == "top_up":
        # top_up was +amount. Reverse with manual_charge (NOT "charge" — that's lesson billing).
        amount_to_reverse = payment.amount
        if payment.funding_source == "bonus":
            # This top_up granted bonus money; some of it may already have
            # been spent on lessons. Reversing it can never take the bonus
            # balance below zero — cap at whatever bonus is left.
            wallet = get_or_create_wallet(payment.student)
            amount_to_reverse = min(payment.amount, wallet.bonus_balance)
            if amount_to_reverse <= 0:
                raise ValueError(
                    "Cannot reverse this bonus top-up: the granted bonus has already been fully spent"
                )
        result = apply_payment(
            student=payment.student,
            payment_type="manual_charge",
            amount=amount_to_reverse,
            group=payment.group,
            lesson=payment.lesson,
            created_by=created_by,
            comment=comment,
            funding_source=payment.funding_source,
        )
    elif payment.payment_type == "manual_charge":
        # Manual charge was -amount. Reverse with manual_top_up.
        result = apply_payment(
            student=payment.student,
            payment_type="manual_top_up",
            amount=payment.amount,
            group=payment.group,
            lesson=payment.lesson,
            created_by=created_by,
            comment=comment,
            funding_source=payment.funding_source,
        )
    elif payment.payment_type == "manual_top_up":
        # Manual top_up was +amount. Reverse with manual_charge.
        result = apply_payment(
            student=payment.student,
            payment_type="manual_charge",
            amount=payment.amount,
            group=payment.group,
            lesson=payment.lesson,
            created_by=created_by,
            comment=comment,
            funding_source=payment.funding_source,
        )
    else:
        raise ValueError(f"Reversal for {payment.payment_type} not implemented")

    return result
