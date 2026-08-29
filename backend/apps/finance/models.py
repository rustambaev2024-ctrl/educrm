import uuid
from decimal import Decimal

from django.conf import settings
from django.db import models


class Wallet(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.OneToOneField(
        "students.Student",
        on_delete=models.CASCADE,
        related_name="wallet",
    )
    balance = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "finance_wallet"

    def __str__(self) -> str:
        return f"{self.student_id}: {self.balance}"


class ExpenseCategory(models.Model):
    """План счетов для расходов. Управляется director/accountant.

    active, а не удаление: у выключенной категории могут быть исторические
    Payment — они должны остаться читаемыми, просто категория больше не
    предлагается при вводе новой записи.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=32, unique=True)
    name_uz = models.CharField(max_length=100)
    name_ru = models.CharField(max_length=100)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "finance_expense_category"
        ordering = ["name_ru"]

    def __str__(self) -> str:
        return self.name_ru


class Payment(models.Model):
    PAYMENT_TYPE_CHOICES = [
        ("top_up", "Top Up"),
        ("charge", "Charge"),
        ("discount", "Discount"),
        ("refund", "Refund"),
        ("expense", "Expense"),
        ("manual_charge", "Manual Charge"),
        ("manual_top_up", "Manual Top Up"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # PROTECT, не CASCADE: Payment — append-only аудит-тропа (balance_before/balance_after).
    # Удаление Wallet (в т.ч. каскадом от Student/User) должно падать с ProtectedError. R-21.
    wallet = models.ForeignKey(
        Wallet,
        on_delete=models.PROTECT,
        related_name="payments",
        null=True,
        blank=True,
    )
    student = models.ForeignKey(
        "students.Student",
        on_delete=models.SET_NULL,
        related_name="payments",
        null=True,
        blank=True,
    )
    branch = models.ForeignKey(
        "institutions.Branch",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payments",
    )
    group = models.ForeignKey(
        "courses.Group",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payments",
    )
    lesson = models.ForeignKey(
        "lessons.Lesson",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payments",
    )
    staff = models.ForeignKey(
        "staff.Staff",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="salary_payments",
    )
    teacher = models.ForeignKey(
        "staff.Staff",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payments",
    )
    payment_type = models.CharField(max_length=20, choices=PAYMENT_TYPE_CHOICES)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    balance_before = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    balance_after = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    method = models.CharField(max_length=20, blank=True)
    category = models.CharField(max_length=50, blank=True)
    # Новое поле — источник истины для новых записей. Старое (CharField выше)
    # остаётся нетронутым для обратной совместимости с уже написанным кодом
    # фронтенда, который его читает как p.category — миграция на category_fk
    # там отдельная задача, не часть этого фича-сета.
    category_fk = models.ForeignKey(
        "ExpenseCategory",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="payments",
    )
    # Отдельное поле именно потому, что created_at не годится для бэкдейтинга
    # (auto_now_add, всегда "сейчас") — бухгалтеру иногда нужно завести расход
    # прошлым числом (счёт за аренду за прошлый месяц, полученный сегодня).
    # Заполнение этого поля на создании и проверка при закрытии периода
    # (с фоллбэком на created_at.date() для NULL) — отдельная задача, ещё
    # не реализована. Для всех платежей, кроме расходов, это поле останется
    # NULL навсегда — они никогда не бэкдейтятся, и фоллбэк на created_at.date()
    # для них и есть правильное постоянное поведение, а не временное состояние.
    transaction_date = models.DateField(null=True, blank=True)
    comment = models.CharField(max_length=500, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "finance_payment"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["student", "created_at"]),
            models.Index(fields=["payment_type"]),
            models.Index(fields=["branch"], name="payment_branch_idx"),
            models.Index(fields=["group"], name="payment_group_idx"),
            models.Index(fields=["payment_type", "created_at"], name="payment_type_date_idx"),
            models.Index(fields=["student", "payment_type"], name="payment_student_type_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.student_id} {self.payment_type} {self.amount}"
