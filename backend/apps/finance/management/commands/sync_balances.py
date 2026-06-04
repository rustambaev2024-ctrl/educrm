from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db.models import Sum

from django_tenants.utils import schema_context

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

                students = Student.objects.filter(
                    status__in=["active", "frozen", "debtor"]
                ).select_related("user")

                fixed = 0
                created = 0
                skipped = 0

                for student in students:
                    income = (
                        Payment.objects.filter(
                            student=student,
                            payment_type__in=["top_up", "manual_top_up", "discount", "refund"],
                        ).aggregate(t=Sum("amount"))["t"]
                        or Decimal("0")
                    )
                    expense = (
                        Payment.objects.filter(
                            student=student,
                            payment_type__in=["charge", "manual_charge"],
                        ).aggregate(t=Sum("amount"))["t"]
                        or Decimal("0")
                    )
                    real_balance = income - expense

                    wallet, is_new = Wallet.objects.get_or_create(
                        student=student,
                        defaults={"balance": real_balance},
                    )
                    if is_new:
                        created += 1
                    elif abs(wallet.balance - real_balance) > Decimal("0.01"):
                        self.stdout.write(
                            f"  {institution.schema_name} | {student.user.full_name}: "
                            f"wallet={wallet.balance} -> {real_balance}"
                        )
                        wallet.balance = real_balance
                        wallet.save(update_fields=["balance", "updated_at"])
                        fixed += 1
                    else:
                        skipped += 1

                    if student.wallet_balance != real_balance:
                        student.wallet_balance = real_balance
                        student.save(update_fields=["wallet_balance"])

                self.stdout.write(
                    self.style.SUCCESS(
                        f"{institution.schema_name}: {fixed} fixed, "
                        f"{created} wallets created, {skipped} already correct"
                    )
                )
