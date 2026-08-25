# R-21: история монет — такая же аудит-тропа, как и деньги (balance_after в каждой записи),
# и у CoinTransaction нет собственной ссылки на студента, только на кошелёк.
# CoinTransaction.wallet: CASCADE -> PROTECT.
# Цепочка была: Student -> (CASCADE) CoinWallet -> (CASCADE) CoinTransaction.
#
# on_delete — поведение уровня Django, не уровня БД: SQL эта миграция не выполняет,
# полностью обратима стандартным `migrate coins 0002`.

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("coins", "0002_coinsetting_coins_absent_penalty_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="cointransaction",
            name="wallet",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="transactions",
                to="coins.coinwallet",
            ),
        ),
    ]
