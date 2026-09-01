from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db.models import Sum

from django_tenants.utils import schema_context

from apps.core.definitions import WALLET_CREDIT_TYPES, WALLET_DEBIT_TYPES
from apps.tenants.models import Institution


class Command(BaseCommand):
    help = "Sync wallet.balance and student.wallet_balance from payment history"

    def handle(self, *args, **kwargs):
        institutions = Institution.objects.exclude(schema_name="public")
        if not institutions.exists():
            self.stdout.write("No tenants found.")
            return

        for institution in institutions:
            with schema_context(institution.schema_name):
                from apps.finance.models import Payment, Wallet
                from apps.students.models import Student

                # ВСЕ ученики, а не только числящиеся. Раньше отбирались
                # только active/frozen/debtor — у отчисленного или выпускника
                # расхождение баланса с историей платежей не чинилось никогда,
                # хотя именно к ним возвращаются при разборе старых долгов.
                students = Student.objects.all().select_related("user")

                fixed = 0
                created = 0
                skipped = 0

                for student in students:
                    # Наборы типов берём из общего места, а не переписываем
                    # здесь: разойдись они с правилом проведения платежа, и
                    # эта команда «починила» бы верные балансы на неверные.
                    #
                    # funding_source обязателен в ОБОИХ агрегатах: платежи с
                    # main и bonus счёта хранятся в одной таблице Payment, и
                    # без этого фильтра бонусная активность подмешивалась бы
                    # в основной баланс (а bonus_balance вообще не чинился).
                    # Историческим платежам (до фичи бонусов) funding_source
                    # проставлен "main" дефолтом модели — фильтр по "main"
                    # для них не меняет сумму ни на копейку.
                    main_income = (
                        Payment.objects.filter(
                            student=student,
                            payment_type__in=WALLET_CREDIT_TYPES,
                            funding_source="main",
                        ).aggregate(t=Sum("amount"))["t"]
                        or Decimal("0")
                    )
                    main_expense = (
                        Payment.objects.filter(
                            student=student,
                            payment_type__in=WALLET_DEBIT_TYPES,
                            funding_source="main",
                        ).aggregate(t=Sum("amount"))["t"]
                        or Decimal("0")
                    )
                    bonus_income = (
                        Payment.objects.filter(
                            student=student,
                            payment_type__in=WALLET_CREDIT_TYPES,
                            funding_source="bonus",
                        ).aggregate(t=Sum("amount"))["t"]
                        or Decimal("0")
                    )
                    bonus_expense = (
                        Payment.objects.filter(
                            student=student,
                            payment_type__in=WALLET_DEBIT_TYPES,
                            funding_source="bonus",
                        ).aggregate(t=Sum("amount"))["t"]
                        or Decimal("0")
                    )
                    real_balance = main_income - main_expense
                    real_bonus_balance = bonus_income - bonus_expense

                    wallet, is_new = Wallet.objects.get_or_create(
                        student=student,
                        defaults={
                            "balance": real_balance,
                            "bonus_balance": real_bonus_balance,
                        },
                    )
                    if is_new:
                        created += 1
                    else:
                        # Каждое поле проверяется и логируется независимо —
                        # у одного студента могло разойтись только одно из
                        # двух, и оператору важно видеть, что именно чинится,
                        # а не общее «что-то не сошлось».
                        changes = []
                        update_fields = []
                        if abs(wallet.balance - real_balance) > Decimal("0.01"):
                            changes.append(f"wallet={wallet.balance} -> {real_balance}")
                            wallet.balance = real_balance
                            update_fields.append("balance")
                        if abs(wallet.bonus_balance - real_bonus_balance) > Decimal("0.01"):
                            changes.append(
                                f"bonus={wallet.bonus_balance} -> {real_bonus_balance}"
                            )
                            wallet.bonus_balance = real_bonus_balance
                            update_fields.append("bonus_balance")

                        if update_fields:
                            self.stdout.write(
                                f"  {institution.schema_name} | {student.user.full_name}: "
                                + ", ".join(changes)
                            )
                            wallet.save(update_fields=update_fields + ["updated_at"])
                            fixed += 1
                        else:
                            skipped += 1

                    student_fields = []
                    if student.wallet_balance != real_balance:
                        student.wallet_balance = real_balance
                        student_fields.append("wallet_balance")
                    if student.bonus_balance != real_bonus_balance:
                        student.bonus_balance = real_bonus_balance
                        student_fields.append("bonus_balance")
                    if student_fields:
                        student.save(update_fields=student_fields)

                self.stdout.write(
                    self.style.SUCCESS(
                        f"{institution.schema_name}: {fixed} fixed, "
                        f"{created} wallets created, {skipped} already correct"
                    )
                )
