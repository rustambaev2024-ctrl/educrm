from django.db import migrations

SEED = [
    ("tuition", "O'qish to'lovi", "Оплата обучения"),
    ("salary", "Ish haqi", "Зарплата"),
    ("rent", "Ijara", "Аренда"),
    ("utilities", "Kommunal", "Коммунальные"),
    ("marketing", "Marketing", "Маркетинг"),
    ("other", "Boshqa", "Прочее"),
]


def seed_categories(apps, schema_editor):
    ExpenseCategory = apps.get_model("finance", "ExpenseCategory")
    for code, name_uz, name_ru in SEED:
        ExpenseCategory.objects.get_or_create(code=code, defaults={"name_uz": name_uz, "name_ru": name_ru})


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("finance", "0009_expensecategory"),
    ]
    operations = [
        migrations.RunPython(seed_categories, noop_reverse),
    ]
