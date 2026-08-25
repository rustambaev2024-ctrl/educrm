from django.db import migrations, models


class Migration(migrations.Migration):
    """T-015 / R-23: признак «пароль выдан администратором, нужна смена».

    Обратима стандартным откатом (удаление колонки), данных не переносит.
    Применяется ко всем tenant-схемам (`apps.accounts` — TENANT_APP).
    """

    dependencies = [
        ("accounts", "0004_merge_admin_into_branch_admin"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="must_change_password",
            field=models.BooleanField(default=False),
        ),
    ]
