"""
Возврат списаний за занятия, которых не было.

daily_lesson_charge до августа 2026 списывал деньги по Group.schedule, не
проверяя, существует ли в этот день реальный урок. Из-за этого деньги уходили
в дни без занятий (в том числе в выходные) — жалоба клиентов, с которой всё
и началось.

Такое списание однозначно опознаётся по двум признакам сразу:
  * lesson_id IS NULL — настоящее списание за урок всегда привязано к уроку;
  * комментарий "Daily lesson charge for ..." — его ставит только задача.

Ручные списания администратора сюда не попадают: у них другой тип
(manual_charge) и другой комментарий.

По умолчанию команда НИЧЕГО не меняет — только показывает, что нашла.
Возврат выполняется через reverse_payment, то есть создаётся встречный
платёж, а история списания сохраняется. Повторный запуск безопасен: уже
возвращённые списания пропускаются.

    python manage.py refund_phantom_charges                 # только показать
    python manage.py refund_phantom_charges --apply         # вернуть деньги
    python manage.py refund_phantom_charges --schema kelajak_talim
    python manage.py refund_phantom_charges --since 2026-07-01
"""

from datetime import datetime
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Sum
from django_tenants.utils import get_public_schema_name, get_tenant_model, schema_context

PHANTOM_COMMENT_PREFIX = "Daily lesson charge"


def phantom_charges(since=None):
    """Списания задачи за уроки, которых нет. Отдельной функцией — чтобы
    предикат отбора можно было проверить тестом, не поднимая тенанты."""
    from apps.finance.models import Payment

    queryset = Payment.objects.filter(
        payment_type="charge",
        lesson__isnull=True,
        comment__startswith=PHANTOM_COMMENT_PREFIX,
    ).select_related("student__user", "group")
    if since:
        queryset = queryset.filter(created_at__date__gte=since)
    return queryset


def not_yet_reversed(payments):
    """Отбрасывает те, что уже вернули — команда должна быть повторяемой."""
    from apps.finance.models import Payment

    reversed_comments = set(
        Payment.objects.filter(
            comment__startswith="Reversal of payment "
        ).values_list("comment", flat=True)
    )
    return [
        payment
        for payment in payments
        if f"Reversal of payment {payment.id}" not in reversed_comments
    ]


class Command(BaseCommand):
    help = "Найти и вернуть списания за уроки, которых не существовало"

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="выполнить возврат (без флага — только показать найденное)",
        )
        parser.add_argument(
            "--schema",
            default=None,
            help="ограничиться одной организацией (schema_name)",
        )
        parser.add_argument(
            "--since",
            default=None,
            help="учитывать списания начиная с даты, ГГГГ-ММ-ДД",
        )

    def handle(self, *args, **options):
        apply_changes = options["apply"]
        only_schema = options["schema"]
        since = None
        if options["since"]:
            since = datetime.strptime(options["since"], "%Y-%m-%d").date()

        if not apply_changes:
            self.stdout.write(
                self.style.WARNING(
                    "Пробный прогон: деньги не возвращаются. "
                    "Для возврата добавьте --apply"
                )
            )

        tenant_model = get_tenant_model()
        public = get_public_schema_name()
        schemas = [
            tenant.schema_name
            for tenant in tenant_model.objects.exclude(schema_name=public)
            if only_schema is None or tenant.schema_name == only_schema
        ]
        if not schemas:
            self.stdout.write("Организации не найдены.")
            return

        grand_total = Decimal("0.00")
        grand_count = 0

        for schema in schemas:
            with schema_context(schema):
                count, total = self._process_schema(schema, since, apply_changes)
                grand_count += count
                grand_total += total

        verb = "возвращено" if apply_changes else "будет возвращено"
        self.stdout.write(
            self.style.SUCCESS(
                f"\nИТОГО: {grand_count} списаний, {grand_total} — {verb}"
            )
        )

    def _process_schema(self, schema: str, since, apply_changes: bool):
        from apps.finance.services import reverse_payment

        phantom = phantom_charges(since)
        pending = not_yet_reversed(phantom)

        if not pending:
            self.stdout.write(f"{schema}: фантомных списаний нет")
            return 0, Decimal("0.00")

        total = phantom.filter(id__in=[p.id for p in pending]).aggregate(
            t=Sum("amount")
        )["t"] or Decimal("0.00")

        self.stdout.write(
            self.style.WARNING(
                f"\n{schema}: {len(pending)} списаний на {total}"
            )
        )
        by_student: dict[str, list] = {}
        for payment in pending:
            name = payment.student.user.full_name if payment.student else "—"
            by_student.setdefault(name, []).append(payment)
        for name, rows in sorted(by_student.items()):
            amount = sum(r.amount for r in rows)
            days = ", ".join(sorted({str(r.created_at.date()) for r in rows}))
            self.stdout.write(f"  {name}: {len(rows)} × = {amount} ({days})")

        if not apply_changes:
            return len(pending), total

        returned = 0
        for payment in pending:
            try:
                with transaction.atomic():
                    reverse_payment(payment)
                returned += 1
            except Exception as exc:
                self.stderr.write(
                    self.style.ERROR(f"  не удалось вернуть {payment.id}: {exc}")
                )
        self.stdout.write(self.style.SUCCESS(f"  возвращено: {returned}"))
        return returned, total
