import logging

from django.db import migrations

logger = logging.getLogger(__name__)


def backfill_category_fk(apps, schema_editor):
    Payment = apps.get_model("finance", "Payment")
    ExpenseCategory = apps.get_model("finance", "ExpenseCategory")

    # ExpenseCategory.code (unique) values match the OLD Payment.category
    # string values exactly — both trace back to the same original
    # finance.cat.* i18n keys, so this is a direct code-to-code match, not
    # a fuzzy lookup through a translatable display label.
    category_by_code = {c.code: c for c in ExpenseCategory.objects.all()}

    matched = 0
    unmatched = 0
    for payment in Payment.objects.exclude(category="").exclude(category__isnull=True):
        category = category_by_code.get(payment.category)
        if category is None:
            unmatched += 1
            continue
        payment.category_fk = category
        payment.transaction_date = payment.created_at.date()
        payment.save(update_fields=["category_fk", "transaction_date"])
        matched += 1

    logger.warning(
        "Payment.category backfill: %s matched, %s unmatched (unknown category string, left as-is)",
        matched,
        unmatched,
    )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("finance", "0011_payment_category_fk_payment_transaction_date"),
    ]
    operations = [
        migrations.RunPython(backfill_category_fk, noop_reverse),
    ]
