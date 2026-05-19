from datetime import date
from decimal import Decimal

from django.db import transaction

from apps.courses.models import Group, GroupMembership
from apps.courses.transfers import StudentTransfer
from apps.students.models import Student


def transfer_student(
    *,
    student: Student,
    from_group: Group,
    to_group: Group,
    transfer_date: date,
    reason: str = "other",
    comment: str = "",
    created_by,
) -> StudentTransfer:
    """
    Перевести ученика из одной группы в другую.

    Логика:
    1. Закрыть членство в старой группе (left_at = transfer_date)
    2. Создать членство в новой группе
    3. Перенести баланс (он остаётся у ученика)
    4. Записать историю перевода с финансовым снимком
    5. Обновить филиал студента если группы в разных филиалах
    """
    if from_group.id == to_group.id:
        raise ValueError("Cannot transfer to the same group")

    # Проверить что ученик в исходной группе
    membership = GroupMembership.objects.filter(
        student=student,
        group=from_group,
        left_at__isnull=True,
    ).first()

    if not membership:
        raise ValueError(f"Student is not active in group {from_group.name}")

    # Проверить что в новой группе есть место
    active_count = GroupMembership.objects.filter(
        group=to_group,
        left_at__isnull=True,
    ).count()

    if to_group.capacity and active_count >= to_group.capacity:
        raise ValueError(f"Group {to_group.name} is full ({to_group.capacity} seats)")

    with transaction.atomic():
        # 1. Закрыть старое членство
        membership.left_at = transfer_date
        membership.save(update_fields=["left_at"])

        # 2. Создать новое членство
        GroupMembership.objects.create(
            student=student,
            group=to_group,
            enrolled_at=transfer_date,
            enrolled_by=created_by,
        )

        # 3. Обновить филиал студента если переводят в другой филиал
        if to_group.branch_id != from_group.branch_id:
            student.branch = to_group.branch
            student.save(update_fields=["branch"])

        # 4. Записать историю
        transfer = StudentTransfer.objects.create(
            student=student,
            from_group=from_group,
            to_group=to_group,
            from_branch=from_group.branch,
            to_branch=to_group.branch,
            transfer_date=transfer_date,
            reason=reason,
            comment=comment,
            balance_at_transfer=student.wallet.balance if hasattr(student, "wallet") else Decimal("0"),
            old_monthly_price=from_group.monthly_price,
            new_monthly_price=to_group.monthly_price,
            created_by=created_by,
        )

    return transfer
