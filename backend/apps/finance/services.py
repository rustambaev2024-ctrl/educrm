from calendar import monthrange
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction

from apps.notifications.services import NotificationService
from apps.students.models import Student

from .models import Payment, Wallet


CHARGEABLE_ATTENDANCE_STATUSES = {"present", "late"}


@dataclass
class PaymentResult:
    payment: Payment
    status_changed: bool


def get_or_create_wallet(student: Student) -> Wallet:
    wallet, _ = Wallet.objects.get_or_create(
        student=student,
        defaults={"balance": student.wallet_balance},
    )
    if wallet.balance != student.wallet_balance:
        wallet.balance = student.wallet_balance
        wallet.save(update_fields=["balance", "updated_at"])
    return wallet


def calculate_lesson_price(group, lesson_date: date) -> Decimal:
    year, month = lesson_date.year, lesson_date.month
    _, days_in_month = monthrange(year, month)

    lesson_days = {
        slot.get("day")
        for slot in (group.schedule or [])
        if isinstance(slot, dict) and slot.get("day") is not None
    }
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


def _status_changed_for_balance(student: Student, balance: Decimal) -> bool:
    # Never touch statuses that are not part of the active/debtor cycle
    if student.status in _PROTECTED_STATUSES:
        return False
    previous = student.status
    if balance < 0 and student.status != "debtor":
        student.status = "debtor"
    elif balance >= 0 and student.status == "debtor":
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
) -> PaymentResult:
    amount = Decimal(amount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if amount <= 0:
        raise ValueError("Amount must be greater than zero")
    if payment_type not in {"top_up", "charge", "discount", "refund", "manual_charge", "manual_top_up"}:
        raise ValueError("Unsupported payment type")

    student = Student.objects.select_for_update().select_related("user").get(id=student.id)
    wallet, _ = Wallet.objects.select_for_update().get_or_create(
        student=student,
        defaults={"balance": student.wallet_balance},
    )

    delta = amount
    if payment_type in ("charge", "manual_charge"):
        delta = -amount

    balance_before = wallet.balance
    balance_after = (wallet.balance + delta).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    wallet.balance = balance_after
    wallet.save(update_fields=["balance", "updated_at"])
    student.wallet_balance = balance_after
    student.save(update_fields=["wallet_balance"])

    payment = Payment.objects.create(
        wallet=wallet,
        student=student,
        branch=student.branch,
        group=group,
        lesson=lesson,
        payment_type=payment_type,
        amount=amount,
        balance_before=balance_before,
        balance_after=balance_after,
        method=method,
        category=category,
        comment=comment,
        created_by=created_by,
    )

    status_changed = _status_changed_for_balance(student, balance_after)
    if status_changed and student.status == "debtor":
        _notify_student_became_debtor(student)

    return PaymentResult(payment=payment, status_changed=status_changed)
    
    
@transaction.atomic
def reverse_payment(payment: Payment, created_by=None) -> PaymentResult:
    """
    Cancels a payment by applying a reverse operation.
    If it was a charge -> refund back to wallet, and mark attendance as not charged.
    If it was a top_up -> subtract from wallet (correction).
    """
    if payment.payment_type == "refund":
        raise ValueError("Cannot reverse a refund payment")
    
    comment = f"Reversal of payment {payment.id}"
    
    if payment.payment_type == "charge":
        # Charge was -amount. Refund is +amount.
        result = apply_payment(
            student=payment.student,
            payment_type="refund",
            amount=payment.amount,
            group=payment.group,
            lesson=payment.lesson,
            created_by=created_by,
            comment=comment
        )
        # Update attendance if exists
        if payment.lesson:
            from apps.lessons.models import Attendance
            Attendance.objects.filter(
                lesson=payment.lesson, 
                student=payment.student
            ).update(is_charged=False)
            
    elif payment.payment_type == "top_up":
        # Top up was +amount. To reverse, we need -amount (charge).
        result = apply_payment(
            student=payment.student,
            payment_type="charge",
            amount=payment.amount,
            group=payment.group,
            lesson=payment.lesson,
            created_by=created_by,
            comment=comment,
            category="other"  # correction
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
        )
    else:
        raise ValueError(f"Reversal for {payment.payment_type} not implemented")
        
    return result
