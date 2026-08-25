# R-21: финансовая аудит-тропа не должна исчезать вместе с учеником.
# Payment.wallet: CASCADE -> PROTECT.
# Цепочка была: Student -> (CASCADE) Wallet -> (CASCADE) Payment,
# т.е. DELETE /students/<id>/ физически стирал balance_before/balance_after.
# С PROTECT удаление Wallet (и, транзитивно, Student/User) поднимает ProtectedError
# на стадии сбора связей, до единого DELETE — транзакция не ломается.
#
# on_delete — поведение уровня Django, не уровня БД: SQL эта миграция не выполняет
# (db_constraint не менялся), поэтому она мгновенная, без блокировок и полностью
# обратима стандартным `migrate finance 0007`.

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("finance", "0007_payment_student_set_null"),
    ]

    operations = [
        migrations.AlterField(
            model_name="payment",
            name="wallet",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="payments",
                to="finance.wallet",
            ),
        ),
    ]
