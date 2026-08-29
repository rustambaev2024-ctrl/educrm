# Accountant Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a new `accountant` role — institution-wide money read/write (payments, expenses, salary payout, reversal), a manageable chart of accounts, a month-end period close that blocks reversal even for `director`, and a per-student reconciliation-statement export.

**Architecture:** Backend: `accountant` is an 8th value in `User.ROLE_CHOICES`, scoped institution-wide in `get_queryset()` the same way `director` already is. Two new models (`ExpenseCategory`, `PeriodClose`) plus two new fields on `Payment` (`category_fk`, `transaction_date`). Write access to money endpoints is gated by NEW, narrowly-scoped permission classes — never by adding `accountant` to the existing `IsBranchAdmin` class, which is also imported by courses/institutions/lessons/staff/students views where accountant must have zero access. Frontend: new `src/routes/accountant/` folder following the established per-role pattern (`route.tsx` with `NavItem[]` + `RoleGuard`), reusing the same `addPayment`/`reversePayment` store functions every other role's finance page already calls — never a local reimplementation of money logic.

**Tech Stack:** Django 6 / DRF (backend/apps/finance, backend/apps/accounts), React 19 + TanStack Router + TypeScript (src/routes/accountant), WeasyPrint (PDF), openpyxl (Excel) — both already in use in `backend/apps/reports/exporters.py`.

Full design rationale: `docs/superpowers/specs/2026-08-29-accountant-role-design.md`.

---

## Task 1: `accountant` role + narrow permission classes

**Files:**
- Modify: `backend/apps/accounts/models.py` (`User.ROLE_CHOICES`)
- Modify: `backend/apps/accounts/permissions.py`
- Migration: `backend/apps/accounts/migrations/` (new file, next number after the latest in that app)

- [ ] **Step 1: Add the role**

In `backend/apps/accounts/models.py`, find `ROLE_CHOICES` and add one line:
```python
    ROLE_CHOICES = [
        ("superadmin", "Superadmin"),
        ("director", "Director"),
        ("branch_admin", "Branch Admin"),
        ("accountant", "Accountant"),
        ("teacher", "Teacher"),
        ("support_teacher", "Support Teacher"),
        ("student", "Student"),
        ("parent", "Parent"),
    ]
```
`role` is a plain `CharField(choices=...)`, not a DB enum — this needs a migration only because Django tracks `choices` changes, but it has no data-shape impact (no `makemigrations` prompt beyond a no-op alter).

- [ ] **Step 2: Generate the migration**

Run: `cd backend && python manage.py makemigrations accounts`
Expected: a new migration file altering the `role` field's `choices` (no schema change to the column itself).

- [ ] **Step 3: Add three new permission classes**

In `backend/apps/accounts/permissions.py`, add after the existing `IsBranchAdmin` class:
```python
class IsFinanceWriter(BasePermission):
    """superadmin/director/branch_admin/accountant — write access to payments/expenses.

    Deliberately NOT the same as IsBranchAdmin: that class is also imported by
    courses/institutions/lessons/staff/students views, where accountant must
    have zero access. This class exists only for money-handling endpoints.
    """

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in ("superadmin", "director", "branch_admin", "accountant")
        )


class IsAccountantOrDirector(BasePermission):
    """Chart-of-accounts management, salary calculation, reconciliation statements.

    Deliberately narrower than IsFinanceWriter: branch_admin should not
    configure expense categories or see a salary calculation for staff
    outside their own branch — those stay director/accountant only.
    """

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in ("superadmin", "director", "accountant")
        )


class IsAccountant(BasePermission):
    """Period close/reopen — the one action even director does not get.

    superadmin is included as the platform-owner override that every other
    permission class in this file also grants; director is deliberately
    excluded — that exclusion is the entire point of this permission class.
    """

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in ("superadmin", "accountant")
        )
```

- [ ] **Step 4: Run backend checks**

Run: `cd backend && python manage.py check`
Expected: `System check identified no issues`

- [ ] **Step 5: Commit**

```bash
git add backend/apps/accounts/models.py backend/apps/accounts/permissions.py backend/apps/accounts/migrations/
git commit -m "feat(accounts): add accountant role and finance-scoped permission classes"
```

---

## Task 2: Chart of accounts — `ExpenseCategory` model

**Files:**
- Modify: `backend/apps/finance/models.py`
- Migration: `backend/apps/finance/migrations/0009_expensecategory.py`
- Data migration: `backend/apps/finance/migrations/0010_seed_expense_categories.py`

- [ ] **Step 1: Add the model**

In `backend/apps/finance/models.py`, add above the `Payment` class:
```python
class ExpenseCategory(models.Model):
    """План счетов для расходов. Управляется director/accountant.

    active, а не удаление: у выключенной категории могут быть исторические
    Payment — они должны остаться читаемыми, просто категория больше не
    предлагается при вводе новой записи.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name_uz = models.CharField(max_length=100)
    name_ru = models.CharField(max_length=100)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "finance_expense_category"
        ordering = ["name_ru"]

    def __str__(self) -> str:
        return self.name_ru
```

- [ ] **Step 2: Generate the schema migration**

Run: `cd backend && python manage.py makemigrations finance`
Expected: creates `0009_expensecategory.py` (exact filename may differ slightly — use whatever Django generates, it will be `0009_...`).

- [ ] **Step 3: Write the seed data migration**

Create `backend/apps/finance/migrations/0010_seed_expense_categories.py` (adjust the `dependencies` migration name to match whatever Step 2 actually generated):
```python
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
    for _, name_uz, name_ru in SEED:
        ExpenseCategory.objects.get_or_create(name_ru=name_ru, defaults={"name_uz": name_uz})


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("finance", "0009_expensecategory"),
    ]
    operations = [
        migrations.RunPython(seed_categories, noop_reverse),
    ]
```

- [ ] **Step 4: Verify**

Run: `cd backend && python manage.py check`
Expected: no issues. This migration only touches the `public`/shared migration state at this point — actual per-tenant seeding happens when `migrate_schemas` runs per tenant, same as every other migration in this project.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/finance/models.py backend/apps/finance/migrations/0009_expensecategory.py backend/apps/finance/migrations/0010_seed_expense_categories.py
git commit -m "feat(finance): add ExpenseCategory model with seed data matching existing category labels"
```

---

## Task 3: `Payment.category_fk` + `Payment.transaction_date` + backfill

**Files:**
- Modify: `backend/apps/finance/models.py`
- Migration: `backend/apps/finance/migrations/0011_payment_category_fk_transaction_date.py`
- Data migration: `backend/apps/finance/migrations/0012_backfill_payment_category_fk.py`

- [ ] **Step 1: Add the two fields**

In `backend/apps/finance/models.py`, find the `Payment` model's `category` field (`category = models.CharField(max_length=50, blank=True)`) and add directly below it:
```python
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
    # По умолчанию — дата создания. Отдельное поле именно потому, что
    # created_at не годится для бэкдейтинга (auto_now_add, всегда "сейчас") —
    # бухгалтеру иногда нужно завести расход прошлым числом (счёт за аренду
    # за прошлый месяц, полученный сегодня). Закрытие периода проверяет ИМЕННО
    # это поле, с фоллбэком на created_at.date() для записей до этой миграции.
    transaction_date = models.DateField(null=True, blank=True)
```

- [ ] **Step 2: Generate the schema migration**

Run: `cd backend && python manage.py makemigrations finance`
Expected: new migration adding `category_fk` (FK, nullable) and `transaction_date` (nullable DateField) to `Payment`.

- [ ] **Step 3: Write the backfill data migration**

Create `backend/apps/finance/migrations/0012_backfill_payment_category_fk.py` (adjust `dependencies` to match Step 2's actual generated filename):
```python
import logging

from django.db import migrations

logger = logging.getLogger(__name__)


def backfill_category_fk(apps, schema_editor):
    Payment = apps.get_model("finance", "Payment")
    ExpenseCategory = apps.get_model("finance", "ExpenseCategory")

    name_ru_by_old_key = {
        "tuition": "Оплата обучения",
        "salary": "Зарплата",
        "rent": "Аренда",
        "utilities": "Коммунальные",
        "marketing": "Маркетинг",
        "other": "Прочее",
    }
    category_by_old_key = {
        key: ExpenseCategory.objects.filter(name_ru=name_ru).first()
        for key, name_ru in name_ru_by_old_key.items()
    }

    matched = 0
    unmatched = 0
    for payment in Payment.objects.exclude(category="").exclude(category__isnull=True):
        category = category_by_old_key.get(payment.category)
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
        ("finance", "0011_payment_category_fk_transaction_date"),
    ]
    operations = [
        migrations.RunPython(backfill_category_fk, noop_reverse),
    ]
```
The `logger.warning` on unmatched count is deliberate — per the design spec, this must not silently skip rows; if `unmatched > 0` on a real tenant, that surfaces in deploy logs the same way other data migrations in this project (`refund_phantom_charges`, `recalculate_grades_scale`) report their own counts.

- [ ] **Step 4: Verify**

Run: `cd backend && python manage.py check`
Expected: no issues.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/finance/models.py backend/apps/finance/migrations/0011_payment_category_fk_transaction_date.py backend/apps/finance/migrations/0012_backfill_payment_category_fk.py
git commit -m "feat(finance): add Payment.category_fk/transaction_date, backfill from legacy category string"
```

---

## Task 4: `PeriodClose` model

**Files:**
- Modify: `backend/apps/finance/models.py`
- Migration: `backend/apps/finance/migrations/0013_periodclose.py`

- [ ] **Step 1: Add the model**

In `backend/apps/finance/models.py`, add at the end of the file:
```python
class PeriodClose(models.Model):
    """Месяц закрыт бухгалтером — прошлые платежи в нём нельзя сторнировать,
    даже director. Институт-вайд (без филиала): один бухгалтер закрывает
    месяц для всего учреждения разом.

    Один активный (reopened_at IS NULL) close на месяц — обеспечено частичным
    unique-индексом, а не проверкой в коде: под конкурентными запросами
    только constraint в БД реально не пускает дубликат.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    month = models.DateField()  # всегда 1-е число месяца
    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="closed_periods",
    )
    closed_at = models.DateTimeField(auto_now_add=True)
    reopened_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="reopened_periods",
    )
    reopened_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "finance_period_close"
        ordering = ["-month"]
        constraints = [
            models.UniqueConstraint(
                fields=["month"],
                condition=models.Q(reopened_at__isnull=True),
                name="one_open_close_per_month",
            ),
        ]

    def __str__(self) -> str:
        status = "reopened" if self.reopened_at else "closed"
        return f"{self.month.isoformat()} ({status})"
```
`settings` is already imported at the top of this file (used by `Wallet`/`Payment.created_by` — check the existing `from django.conf import settings` import at the top; it's already there per the file's current header).

- [ ] **Step 2: Generate the migration**

Run: `cd backend && python manage.py makemigrations finance`
Expected: new migration `0013_periodclose.py` creating the table with the partial unique constraint.

- [ ] **Step 3: Verify**

Run: `cd backend && python manage.py check`
Expected: no issues.

- [ ] **Step 4: Commit**

```bash
git add backend/apps/finance/models.py backend/apps/finance/migrations/0013_periodclose.py
git commit -m "feat(finance): add PeriodClose model with one-active-close-per-month constraint"
```

---

## Task 5: Expense category API (list/create/deactivate)

**Files:**
- Create: `backend/apps/finance/serializers.py` (modify — add `ExpenseCategorySerializer`)
- Modify: `backend/apps/finance/views.py` (add `ExpenseCategoryViewSet`)
- Modify: `backend/apps/finance/urls.py`
- Test: `backend/tests/test_expense_category_permissions.py`

- [ ] **Step 1: Check the URL router pattern first**

Run: `cat backend/apps/finance/urls.py`
This project registers viewsets via `DefaultRouter` (same pattern `PaymentViewSet` already uses) — match whatever's there exactly rather than inventing a different registration style.

- [ ] **Step 2: Add the serializer**

In `backend/apps/finance/serializers.py`, add:
```python
from .models import ExpenseCategory, Payment


class ExpenseCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ExpenseCategory
        fields = ("id", "name_uz", "name_ru", "active", "created_at")
        read_only_fields = ("id", "created_at")
```
(Update the existing `from .models import Payment` import line to include `ExpenseCategory` instead of adding a second import line.)

- [ ] **Step 3: Add the viewset**

In `backend/apps/finance/views.py`, add:
```python
from apps.accounts.permissions import IsAccountantOrDirector, IsFinanceWriter

from .models import ExpenseCategory, Payment
from .serializers import ExpenseCategorySerializer, PaymentCreateSerializer, PaymentSerializer


class ExpenseCategoryViewSet(viewsets.ModelViewSet):
    queryset = ExpenseCategory.objects.all()
    serializer_class = ExpenseCategorySerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsFinanceWriter()]
        return [IsAccountantOrDirector()]

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get("include_inactive") != "1":
            qs = qs.filter(active=True)
        return qs

    def destroy(self, request, *args, **kwargs):
        # Никогда не удаляем физически — только выключаем. Историю Payment
        # с этой категорией нельзя оставить с оборванной ссылкой.
        instance = self.get_object()
        instance.active = False
        instance.save(update_fields=["active"])
        return Response(status=status.HTTP_204_NO_CONTENT)
```
(Update the existing `from .models import Payment` import at the top of the file to `from .models import ExpenseCategory, Payment`, and the existing `from .serializers import PaymentCreateSerializer, PaymentSerializer` to include `ExpenseCategorySerializer`.)

- [ ] **Step 4: Register the route**

In `backend/apps/finance/urls.py`, find where `PaymentViewSet` is registered on the router and add directly below it:
```python
router.register("expense-categories", ExpenseCategoryViewSet, basename="expense-category")
```
(Add `ExpenseCategoryViewSet` to the `from .views import ...` line at the top of this file.)

- [ ] **Step 5: Write the permission test**

Create `backend/tests/test_expense_category_permissions.py`:
```python
import pytest
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db


def test_branch_admin_cannot_create_expense_category(branch_admin_user):
    client = APIClient()
    client.force_authenticate(user=branch_admin_user)
    response = client.post(
        "/api/v1/expense-categories/",
        {"name_uz": "Test", "name_ru": "Тест"},
        format="json",
    )
    assert response.status_code == 403


def test_accountant_can_create_expense_category(accountant_user):
    client = APIClient()
    client.force_authenticate(user=accountant_user)
    response = client.post(
        "/api/v1/expense-categories/",
        {"name_uz": "Test", "name_ru": "Тест"},
        format="json",
    )
    assert response.status_code == 201
    assert response.data["active"] is True


def test_deleting_a_category_deactivates_not_deletes(accountant_user, db):
    from apps.finance.models import ExpenseCategory

    category = ExpenseCategory.objects.create(name_uz="Test", name_ru="Тест")
    client = APIClient()
    client.force_authenticate(user=accountant_user)
    response = client.delete(f"/api/v1/expense-categories/{category.id}/")
    assert response.status_code == 204
    category.refresh_from_db()
    assert category.active is False
```
This references `branch_admin_user`/`accountant_user` fixtures — check `backend/tests/conftest.py` for the existing fixture pattern (there should already be a `director_user`/`branch_admin_user`-style fixture factory used by other permission tests in this project, e.g. `test_staff_password_guard.py` or similar). Match that exact pattern; if no `accountant_user` fixture exists yet, add one to `conftest.py` following the same factory shape as the existing role fixtures.

- [ ] **Step 6: Run the tests**

Run: `cd backend && pytest tests/test_expense_category_permissions.py -v`
Expected: 3 passed.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/finance/serializers.py backend/apps/finance/views.py backend/apps/finance/urls.py backend/tests/test_expense_category_permissions.py backend/tests/conftest.py
git commit -m "feat(finance): expense category CRUD API, director/accountant only, soft-delete via active flag"
```

---

## Task 6: Period close/reopen API + payment write scoping

**Files:**
- Modify: `backend/apps/finance/views.py` (`PaymentViewSet`, add `PeriodCloseViewSet`)
- Modify: `backend/apps/finance/serializers.py` (`PaymentCreateSerializer`, add `PeriodCloseSerializer`)
- Modify: `backend/apps/finance/urls.py`
- Test: `backend/tests/test_period_close_blocks_reversal.py`

This is the single most important task in this plan — it's the one behavior the design spec calls out as needing its own dedicated test, and it touches the same `reverse_payment` call path that has already had two real bugs fixed this session (`b1078b9`, `de05b07`). Read `backend/apps/finance/views.py` and `backend/apps/finance/services.py` in full before editing — do not guess at the current shape of `PaymentViewSet`.

- [ ] **Step 1: Swap the write permission on `PaymentViewSet`**

In `backend/apps/finance/views.py`, `PaymentViewSet.get_permissions()` currently reads:
```python
    def get_permissions(self):
        if self.action == "create":
            permission_classes = [IsBranchAdmin]
        else:
            permission_classes = [permissions.IsAuthenticated]
        return [permission() for permission in permission_classes]
```
Change `IsBranchAdmin` to `IsFinanceWriter` (only in this method — do NOT touch the `IsBranchAdmin` import/usage anywhere else in this file or any other file; `IsBranchAdmin` must keep meaning exactly what it means today everywhere except here).

Also find the `reverse` action's decorator:
```python
    @action(detail=True, methods=["post"], permission_classes=[IsBranchAdmin])
    def reverse(self, request, pk=None):
```
Change `permission_classes=[IsBranchAdmin]` to `permission_classes=[IsFinanceWriter]`.

Update the file's import line from `from apps.accounts.permissions import IsBranchAdmin` to `from apps.accounts.permissions import IsFinanceWriter` (if `IsBranchAdmin` is not used elsewhere in this specific file — verify with `grep -n IsBranchAdmin backend/apps/finance/views.py` first; if it's genuinely unused elsewhere in this file after this change, remove it from the import rather than leaving a dead import).

- [ ] **Step 2: Add accountant to the institution-wide queryset scope**

In `PaymentViewSet.get_queryset()`, find:
```python
        if user.role in ("superadmin", "director"):
            scoped = qs
```
Change to:
```python
        if user.role in ("superadmin", "director", "accountant"):
            scoped = qs
```

- [ ] **Step 3: Add the period-close check inside `reverse()`**

At the top of `backend/apps/finance/views.py` (or wherever model imports live for this file), add:
```python
from .models import Payment, PeriodClose
```
(merge with whatever the existing `from .models import Payment` line already imports, per Task 5's `ExpenseCategory` addition — this file will end up importing `Payment`, `PeriodClose`, and `ExpenseCategory` from `.models` in one line by the time this task is done).

Add a small module-level helper function above `PaymentViewSet`:
```python
def _month_is_closed(check_date):
    month_start = check_date.replace(day=1)
    return PeriodClose.objects.filter(month=month_start, reopened_at__isnull=True).exists()
```

In `PaymentViewSet.reverse()`, the method currently starts:
```python
    @action(detail=True, methods=["post"], permission_classes=[IsFinanceWriter])
    def reverse(self, request, pk=None):
        payment = self.get_object()
        already_reversed = Payment.objects.filter(
            comment=f"Reversal of payment {payment.id}"
        ).exists()
```
Insert the period-close check between `payment = self.get_object()` and the `already_reversed` check:
```python
    @action(detail=True, methods=["post"], permission_classes=[IsFinanceWriter])
    def reverse(self, request, pk=None):
        payment = self.get_object()
        check_date = payment.transaction_date or payment.created_at.date()
        if _month_is_closed(check_date):
            return Response(
                {
                    "detail": {
                        "uz": "Bu davr yopilgan, to'lovni bekor qilib bo'lmaydi",
                        "ru": "Этот период закрыт бухгалтером, платёж нельзя отменить",
                    }
                },
                status=status.HTTP_409_CONFLICT,
            )
        already_reversed = Payment.objects.filter(
            comment=f"Reversal of payment {payment.id}"
        ).exists()
```
This check lives in the interactive view action, deliberately NOT inside `reverse_payment()` in `services.py` — that function is also called by the "excused absence" signal and the `refund_phantom_charges` management command, both of which are data-integrity mechanisms that must still be able to correct historical records after a period is closed. Do not move this check into `services.py`; if a future task wants automated flows to respect period close too, that's a deliberate, separate decision — not an oversight to "fix" here.

- [ ] **Step 4: Add `category_id`/`transaction_date` to expense creation**

In `backend/apps/finance/serializers.py`, `PaymentCreateSerializer` currently has:
```python
    category = serializers.CharField(required=False, allow_blank=True, max_length=50)
    comment = serializers.CharField(required=False, allow_blank=True, max_length=500)
```
Add two fields after `category`:
```python
    category = serializers.CharField(required=False, allow_blank=True, max_length=50)
    category_id = serializers.UUIDField(required=False)
    transaction_date = serializers.DateField(required=False)
    comment = serializers.CharField(required=False, allow_blank=True, max_length=500)
```
Add a validator method (alongside the existing `validate_staff_id`/`validate_branch_id` methods):
```python
    def validate_category_id(self, value):
        from .models import ExpenseCategory
        try:
            category = ExpenseCategory.objects.get(id=value, active=True)
        except ExpenseCategory.DoesNotExist as exc:
            raise serializers.ValidationError("Category not found or inactive") from exc
        self.context["category"] = category
        return value

    def validate_transaction_date(self, value):
        from .views import _month_is_closed
        if _month_is_closed(value):
            raise serializers.ValidationError({
                "uz": "Bu davr yopilgan",
                "ru": "Этот период закрыт",
            })
        return value
```
In the `validate()` method, only `branch_admin` currently has an explicit role check — no change needed there for backdating, since `transaction_date` is optional and Django REST Framework will simply not include it in `validated_data` if omitted (defaulting to today via the model's own logic in the next step). But add one explicit rule: backdating is accountant-only. Add this near the top of `validate()`, right after the existing `payment_type = attrs.get("payment_type")` / `user = getattr(request, "user", None)` lines:
```python
        if attrs.get("transaction_date") and (user is None or user.role != "accountant") and (user is None or user.role != "superadmin"):
            raise serializers.ValidationError({
                "transaction_date": {
                    "uz": "Faqat buxgalter sanani orqaga o'zgartira oladi",
                    "ru": "Только бухгалтер может указать более раннюю дату",
                }
            })
```

In `create()`, the `expense` branch currently reads:
```python
        if validated_data["payment_type"] == "expense":
            return Payment.objects.create(
                branch=validated_data["branch"],
                staff=self.context.get("staff"),
                payment_type="expense",
                amount=validated_data["amount"],
                balance_before=Decimal("0.00"),
                balance_after=Decimal("0.00"),
                method=validated_data.get("method", ""),
                category=validated_data.get("category", ""),
                comment=validated_data.get("comment", ""),
                created_by=self.context["request"].user,
            )
```
Change to also pass the two new fields:
```python
        if validated_data["payment_type"] == "expense":
            return Payment.objects.create(
                branch=validated_data["branch"],
                staff=self.context.get("staff"),
                payment_type="expense",
                amount=validated_data["amount"],
                balance_before=Decimal("0.00"),
                balance_after=Decimal("0.00"),
                method=validated_data.get("method", ""),
                category=validated_data.get("category", ""),
                category_fk=self.context.get("category"),
                transaction_date=validated_data.get("transaction_date", date.today()),
                comment=validated_data.get("comment", ""),
                created_by=self.context["request"].user,
            )
```
Add `from datetime import date` to the top of `backend/apps/finance/serializers.py` if it's not already imported (check first — this file may already import `datetime`-related names).

- [ ] **Step 5: Add `PeriodCloseViewSet`**

In `backend/apps/finance/serializers.py`, add:
```python
class PeriodCloseSerializer(serializers.ModelSerializer):
    closed_by_name = serializers.CharField(source="closed_by.full_name", read_only=True)
    reopened_by_name = serializers.CharField(source="reopened_by.full_name", read_only=True, default=None)

    class Meta:
        model = PeriodClose
        fields = ("id", "month", "closed_by", "closed_by_name", "closed_at", "reopened_by", "reopened_by_name", "reopened_at")
        read_only_fields = fields
```
(Add `PeriodClose` to the `from .models import ...` import line.)

In `backend/apps/finance/views.py`, add:
```python
class PeriodCloseViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    queryset = PeriodClose.objects.select_related("closed_by", "reopened_by").all()
    serializer_class = PeriodCloseSerializer
    permission_classes = [IsFinanceWriter]

    @action(detail=False, methods=["post"], permission_classes=[IsAccountant])
    def close(self, request):
        month_str = request.data.get("month")
        if not month_str:
            return Response({"detail": "month is required (YYYY-MM-01)"}, status=status.HTTP_400_BAD_REQUEST)
        month = date.fromisoformat(month_str).replace(day=1)
        if PeriodClose.objects.filter(month=month, reopened_at__isnull=True).exists():
            return Response(
                {"detail": {"uz": "Bu davr allaqachon yopilgan", "ru": "Этот период уже закрыт"}},
                status=status.HTTP_409_CONFLICT,
            )
        period = PeriodClose.objects.create(month=month, closed_by=request.user)
        return Response(PeriodCloseSerializer(period).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], permission_classes=[IsAccountant])
    def reopen(self, request, pk=None):
        period = self.get_object()
        if period.reopened_at is not None:
            return Response(
                {"detail": {"uz": "Bu davr allaqachon ochilgan", "ru": "Этот период уже открыт"}},
                status=status.HTTP_409_CONFLICT,
            )
        period.reopened_by = request.user
        period.reopened_at = timezone.now()
        period.save(update_fields=["reopened_by", "reopened_at"])
        return Response(PeriodCloseSerializer(period).data)
```
Add `from datetime import date` and `from django.utils import timezone` to the top of `backend/apps/finance/views.py` if not already present (check first).

- [ ] **Step 6: Register the route**

In `backend/apps/finance/urls.py`:
```python
router.register("period-closes", PeriodCloseViewSet, basename="period-close")
```
(Add `PeriodCloseViewSet` to the views import line.)

- [ ] **Step 7: Write the critical test — period close blocks reversal even for director**

Create `backend/tests/test_period_close_blocks_reversal.py`:
```python
from datetime import date
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db


def _make_charge_payment(student):
    from apps.finance.services import apply_payment
    result = apply_payment(student=student, payment_type="charge", amount=Decimal("50000"))
    return result.payment


def test_director_cannot_reverse_payment_in_closed_period(director_user, student):
    from apps.finance.models import PeriodClose

    payment = _make_charge_payment(student)
    payment.transaction_date = date(2026, 7, 15)
    payment.save(update_fields=["transaction_date"])

    PeriodClose.objects.create(month=date(2026, 7, 1), closed_by=director_user)

    client = APIClient()
    client.force_authenticate(user=director_user)
    response = client.post(f"/api/v1/payments/{payment.id}/reverse/")

    assert response.status_code == 409


def test_accountant_cannot_reverse_payment_in_closed_period(accountant_user, student):
    from apps.finance.models import PeriodClose

    payment = _make_charge_payment(student)
    payment.transaction_date = date(2026, 7, 15)
    payment.save(update_fields=["transaction_date"])

    PeriodClose.objects.create(month=date(2026, 7, 1), closed_by=accountant_user)

    client = APIClient()
    client.force_authenticate(user=accountant_user)
    response = client.post(f"/api/v1/payments/{payment.id}/reverse/")

    assert response.status_code == 409


def test_reversal_works_normally_in_an_open_period(director_user, student):
    payment = _make_charge_payment(student)

    client = APIClient()
    client.force_authenticate(user=director_user)
    response = client.post(f"/api/v1/payments/{payment.id}/reverse/")

    assert response.status_code == 200


def test_only_accountant_can_close_a_period(director_user, accountant_user):
    client = APIClient()
    client.force_authenticate(user=director_user)
    response = client.post("/api/v1/period-closes/close/", {"month": "2026-08-01"}, format="json")
    assert response.status_code == 403

    client.force_authenticate(user=accountant_user)
    response = client.post("/api/v1/period-closes/close/", {"month": "2026-08-01"}, format="json")
    assert response.status_code == 201


def test_director_cannot_reopen_a_closed_period(director_user, accountant_user):
    from apps.finance.models import PeriodClose

    period = PeriodClose.objects.create(month=date(2026, 6, 1), closed_by=accountant_user)

    client = APIClient()
    client.force_authenticate(user=director_user)
    response = client.post(f"/api/v1/period-closes/{period.id}/reopen/")
    assert response.status_code == 403
```
This references `director_user`, `accountant_user`, `student` fixtures — check `backend/tests/conftest.py` for the existing shape and match it exactly. If a `student` fixture with a wallet already exists (very likely, given how many other finance tests in this project need one — check `test_trigger_daily_charge.py` or `test_billing_requires_lesson.py` for the pattern), reuse it rather than writing a new one.

- [ ] **Step 8: Run the tests**

Run: `cd backend && pytest tests/test_period_close_blocks_reversal.py -v`
Expected: 5 passed.

- [ ] **Step 9: Run the full backend test suite to check for regressions**

Run: `cd backend && pytest --ignore=test_student.py`
Expected: all passing tests still pass (compare count against the project's known baseline — per `CLAUDE.md`, expect something in the neighborhood of 180+ passed, a handful of pre-existing skips, and `test_teacher_salary.py`'s known unrelated failures if still present — do not treat those specific pre-existing failures as something this task introduced).

- [ ] **Step 10: Commit**

```bash
git add backend/apps/finance/views.py backend/apps/finance/serializers.py backend/apps/finance/urls.py backend/tests/test_period_close_blocks_reversal.py backend/tests/conftest.py
git commit -m "feat(finance): period close/reopen API, blocks reversal in closed months even for director"
```

---

## Task 7: Salary calculation — accountant access

**Files:**
- Modify: `backend/apps/reports/views.py`

- [ ] **Step 1: Swap the permission class**

In `backend/apps/reports/views.py`, find `SalaryCalculateView`:
```python
class SalaryCalculateView(APIView):
    permission_classes = [IsDirector]
```
Change to:
```python
class SalaryCalculateView(APIView):
    permission_classes = [IsAccountantOrDirector]
```
Update the file's import line accordingly (`from apps.accounts.permissions import ...` — add `IsAccountantOrDirector`, keep `IsDirector` if it's used elsewhere in this file, check with `grep -n IsDirector backend/apps/reports/views.py` first since `IsDirector` is very likely used by other views in this same file that must NOT change).

- [ ] **Step 2: Verify**

Run: `cd backend && python manage.py check`
Expected: no issues.

- [ ] **Step 3: Commit**

```bash
git add backend/apps/reports/views.py
git commit -m "feat(reports): let accountant calculate teacher salaries, same as director"
```

---

## Task 8: Reconciliation statement — PDF template + endpoint

**Files:**
- Create: `backend/apps/reports/templates/reconciliation_act.html`
- Modify: `backend/apps/reports/exporters.py` (add `export_reconciliation_pdf`)
- Modify: `backend/apps/reports/views.py` (add `ReconciliationView`)
- Modify: `backend/apps/reports/urls.py`
- Test: `backend/tests/test_reconciliation_statement.py`

- [ ] **Step 1: Write the HTML template**

Create `backend/apps/reports/templates/reconciliation_act.html`:
```html
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: sans-serif; font-size: 12px; color: #111; }
  h1 { font-size: 16px; margin-bottom: 4px; }
  .meta { margin-bottom: 16px; color: #444; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
  th { background: #f2f2f2; }
  .amount { text-align: right; }
  .total-row td { font-weight: bold; border-top: 2px solid #333; }
  .signature { margin-top: 48px; display: flex; justify-content: space-between; }
  .signature-line { border-top: 1px solid #333; width: 220px; padding-top: 4px; text-align: center; }
</style>
</head>
<body>
  <h1>Акт сверки взаиморасчётов</h1>
  <div class="meta">
    <div>Ученик: {{ student_name }}</div>
    <div>Период: {{ date_from }} — {{ date_to }}</div>
    <div>Начальный баланс: {{ opening_balance }} сум</div>
  </div>
  <table>
    <thead>
      <tr><th>Дата</th><th>Операция</th><th class="amount">Сумма</th><th class="amount">Баланс</th></tr>
    </thead>
    <tbody>
      {% for row in rows %}
      <tr>
        <td>{{ row.date }}</td>
        <td>{{ row.label }}</td>
        <td class="amount">{{ row.amount }}</td>
        <td class="amount">{{ row.balance }}</td>
      </tr>
      {% endfor %}
      <tr class="total-row">
        <td colspan="3">Итоговый баланс</td>
        <td class="amount">{{ closing_balance }} сум</td>
      </tr>
    </tbody>
  </table>
  <div class="signature">
    <div class="signature-line">Бухгалтер: {{ accountant_name }}</div>
    <div class="signature-line">Подпись ученика/родителя</div>
  </div>
</body>
</html>
```

- [ ] **Step 2: Add the exporter function**

In `backend/apps/reports/exporters.py`, add at the end of the file:
```python
from pathlib import Path

_TEMPLATES_DIR = Path(__file__).parent / "templates"


def export_reconciliation_pdf(data: dict) -> bytes:
    """Акт сверки — свой шаблон, не generic JSON-дамп export_pdf() выше.

    Родитель/ученик подписывает этот документ — таблица начислений/платежей
    с бегущим балансом и место под подпись, а не <pre>{json}</pre>.
    """
    template_path = _TEMPLATES_DIR / "reconciliation_act.html"
    template_source = template_path.read_text(encoding="utf-8")

    rows_html = "".join(
        f"<tr><td>{row['date']}</td><td>{row['label']}</td>"
        f"<td class=\"amount\">{row['amount']}</td><td class=\"amount\">{row['balance']}</td></tr>"
        for row in data["rows"]
    )
    html = (
        template_source
        .replace("{{ student_name }}", str(data["student_name"]))
        .replace("{{ date_from }}", str(data["date_from"]))
        .replace("{{ date_to }}", str(data["date_to"]))
        .replace("{{ opening_balance }}", str(data["opening_balance"]))
        .replace("{{ closing_balance }}", str(data["closing_balance"]))
        .replace("{{ accountant_name }}", str(data.get("accountant_name", "")))
        .replace("{% for row in rows %}\n      <tr>\n        <td>{{ row.date }}</td>\n        <td>{{ row.label }}</td>\n        <td class=\"amount\">{{ row.amount }}</td>\n        <td class=\"amount\">{{ row.balance }}</td>\n      </tr>\n      {% endfor %}", rows_html)
    )

    if HTML is not None:
        try:
            return HTML(string=html).write_pdf()
        except Exception:
            pass
    return _simple_pdf_bytes(f"Reconciliation act for {data['student_name']}, {len(data['rows'])} rows")
```
Note: this uses plain `str.replace()` templating, not a real template engine — `django.template` is available in this project (Django itself), but pulling in `django.template.Template`/`Context` for one document is more machinery than this needs, and the existing `exporters.py` already sets the precedent of hand-built HTML strings (`export_pdf`'s `f"<html>...{body}...</html>"`) rather than a template engine. If the row list ever needs to render conditionally more complex markup, revisit this — for now it's a straight substitution and that's proportionate.

- [ ] **Step 3: Add the view**

In `backend/apps/reports/views.py`, add:
```python
from apps.finance.models import Payment
from apps.students.models import Student
from .exporters import export_reconciliation_pdf


class ReconciliationView(APIView):
    permission_classes = [IsAccountantOrDirector]

    def get(self, request, student_id):
        try:
            student = Student.objects.select_related("user").get(id=student_id)
        except Student.DoesNotExist:
            return Response({"detail": "Student not found"}, status=status.HTTP_404_NOT_FOUND)

        date_from = request.query_params.get("date_from")
        date_to = request.query_params.get("date_to")
        if not date_from or not date_to:
            return Response({"detail": "date_from and date_to are required"}, status=status.HTTP_400_BAD_REQUEST)

        before = Payment.objects.filter(student=student, created_at__date__lt=date_from)
        opening_balance = sum((p.balance_after - p.balance_before for p in before), Decimal("0.00"))

        period_payments = Payment.objects.filter(
            student=student,
            created_at__date__gte=date_from,
            created_at__date__lte=date_to,
        ).order_by("created_at")

        rows = []
        running_balance = opening_balance
        for payment in period_payments:
            running_balance += payment.balance_after - payment.balance_before
            rows.append({
                "date": payment.created_at.date().isoformat(),
                "label": payment.get_payment_type_display(),
                "amount": str(payment.amount),
                "balance": str(running_balance),
            })

        data = {
            "student_name": student.user.full_name if student.user else str(student),
            "date_from": date_from,
            "date_to": date_to,
            "opening_balance": str(opening_balance),
            "closing_balance": str(running_balance),
            "accountant_name": request.user.full_name,
            "rows": rows,
        }

        export_format = request.query_params.get("format", "pdf")
        if export_format == "excel":
            from .exporters import export_excel
            file_bytes = export_excel("reconciliation", data)
            response = HttpResponse(
                file_bytes,
                content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
            response["Content-Disposition"] = f'attachment; filename="reconciliation_{student_id}.xlsx"'
            return response

        file_bytes = export_reconciliation_pdf(data)
        response = HttpResponse(file_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="reconciliation_{student_id}.pdf"'
        return response
```
Add `from decimal import Decimal` to the top of `backend/apps/reports/views.py` if not already present (check first — very likely already imported given `SalaryCalculateSerializer` usage in this same file).

- [ ] **Step 4: Register the route**

In `backend/apps/reports/urls.py`, add:
```python
    path("reports/reconciliation/<uuid:student_id>/", ReconciliationView.as_view(), name="reconciliation"),
```
(Add `ReconciliationView` to the views import line.)

- [ ] **Step 5: Write the test**

Create `backend/tests/test_reconciliation_statement.py`:
```python
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db


def test_reconciliation_pdf_for_director(director_user, student):
    from apps.finance.services import apply_payment
    apply_payment(student=student, payment_type="top_up", amount=Decimal("100000"))

    client = APIClient()
    client.force_authenticate(user=director_user)
    response = client.get(
        f"/api/v1/reports/reconciliation/{student.id}/",
        {"date_from": "2026-01-01", "date_to": "2026-12-31"},
    )
    assert response.status_code == 200
    assert response["Content-Type"] == "application/pdf"


def test_reconciliation_requires_date_range(director_user, student):
    client = APIClient()
    client.force_authenticate(user=director_user)
    response = client.get(f"/api/v1/reports/reconciliation/{student.id}/")
    assert response.status_code == 400


def test_branch_admin_cannot_generate_reconciliation(branch_admin_user, student):
    client = APIClient()
    client.force_authenticate(user=branch_admin_user)
    response = client.get(
        f"/api/v1/reports/reconciliation/{student.id}/",
        {"date_from": "2026-01-01", "date_to": "2026-12-31"},
    )
    assert response.status_code == 403
```

- [ ] **Step 6: Run the tests**

Run: `cd backend && pytest tests/test_reconciliation_statement.py -v`
Expected: 3 passed.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/reports/templates/reconciliation_act.html backend/apps/reports/exporters.py backend/apps/reports/views.py backend/apps/reports/urls.py backend/tests/test_reconciliation_statement.py
git commit -m "feat(reports): reconciliation statement endpoint with a dedicated PDF template, not the generic JSON-dump exporter"
```

---

## Task 9: Frontend role registry + Payment type

**Files:**
- Modify: `src/lib/roles.ts`
- Modify: `src/lib/data/types.ts` (`Payment` interface)
- Modify: `src/lib/data/mappers.ts` (`mapPayment`)

- [ ] **Step 1: Add the role**

In `src/lib/roles.ts`:
```typescript
export type Role = "superadmin" | "director" | "branch_admin" | "accountant" | "teacher" | "support_teacher" | "student" | "parent";

export const ROLE_LABELS: Record<Role, string> = {
  superadmin: "Superadmin",
  director: "Direktor",
  branch_admin: "Filial admin",
  accountant: "Buxgalter",
  teacher: "O'qituvchi",
  support_teacher: "Yordamchi o'qituvchi",
  student: "O'quvchi",
  parent: "Ota-ona",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  superadmin: "Platforma boshqaruvi",
  director: "Tahlil va boshqaruv",
  branch_admin: "Filial boshqaruvi",
  accountant: "Moliya va hisobot",
  teacher: "Guruhlar, davomat, uy vazifalari",
  support_teacher: "Davomat, uy vazifalari, baholar",
  student: "Jadval, baholar, hamyon",
  parent: "Farzandlar monitoringi",
};

export const ROLE_HOMES: Record<Role, string> = {
  superadmin: "/superadmin",
  director: "/director",
  branch_admin: "/admin",
  accountant: "/accountant",
  teacher: "/teacher",
  support_teacher: "/support-teacher",
  student: "/student",
  parent: "/parent",
};
```

- [ ] **Step 2: Add fields to the `Payment` interface**

In `src/lib/data/types.ts`, find the `Payment` interface (starts around line 182) and add two fields after `category?`:
```typescript
  category?: string;
  categoryId?: string;
  transactionDate?: string;   // ISO date, only meaningfully different from `date` for backdated expenses
```
(Read the file first to find the exact current line with `category` in this interface — it may not be named exactly `category?` at this exact position; match whatever's actually there and insert the two new fields immediately after it.)

- [ ] **Step 3: Update `mapPayment`**

In `src/lib/data/mappers.ts`, find `mapPayment` (around line 442) and add two lines to the returned object, right after the existing `category:` line:
```typescript
    category: r.category ?? (direction === "out" ? "other" : "tuition"),
    categoryId: extractId(r.category_fk ?? undefined) || undefined,
    transactionDate: r.transaction_date ?? undefined,
```
Also update the `PaymentRaw` interface above this function (find it — it's the type `mapPayment` takes as input) to include `category_fk?` and `transaction_date?` as optional raw fields, matching the naming convention already used for `balance_before`/`balance_after` etc. in that same interface.

- [ ] **Step 4: Verify**

Run: `npm run build`
Expected: clean build (this task only adds optional fields, should not break any existing caller).

- [ ] **Step 5: Commit**

```bash
git add src/lib/roles.ts src/lib/data/types.ts src/lib/data/mappers.ts
git commit -m "feat(frontend): add accountant to role registry, category_fk/transaction_date to Payment type"
```

---

## Task 9b: Finance API helpers (`expenseCategoryApi`, `periodCloseApi`)

**Files:**
- Modify: `src/lib/api.ts` (or the split-file location — see Step 1)

Split out of what was originally planned as part of Task 13, moved earlier: Task 11 (dashboard) needs `periodCloseApi` to show period status, so this must land before Task 11, not after it.

- [ ] **Step 1: Check the API helper file layout**

Run: `ls src/lib/api*` — this project has (per earlier grep) a single `src/lib/api.ts`. Confirm it's still a single file; if it has since been split into `src/lib/api/*.ts`, add the new helpers to whichever module groups finance-related API calls (e.g. `src/lib/api/finance.ts` if that exists), matching the existing split. Otherwise, extend the single `src/lib/api.ts`.

- [ ] **Step 2: Add the helpers**

```typescript
export const expenseCategoryApi = {
  list: (includeInactive = false) =>
    apiGet(`/expense-categories/${includeInactive ? "?include_inactive=1" : ""}`),
  create: (data: { name_uz: string; name_ru: string }) =>
    apiPost("/expense-categories/", data),
  deactivate: (id: string) => apiDelete(`/expense-categories/${id}/`),
};

export const periodCloseApi = {
  list: () => apiGet("/period-closes/"),
  close: (month: string) => apiPost("/period-closes/close/", { month }),
  reopen: (id: string) => apiPost(`/period-closes/${id}/reopen/`),
};
```
Match the exact `apiGet`/`apiPost`/`apiDelete` helper names and calling convention already used elsewhere in this file — read a few existing entries (e.g. how `quizApi` or `superadminApi` is structured) and follow that exact shape rather than inventing a new one.

- [ ] **Step 3: Verify**

Run: `npm run build`
Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat(accountant): API helpers for expense categories and period close"
```

---

## Task 10: `accountant` route shell + navigation

**Files:**
- Create: `src/routes/accountant/route.tsx`

- [ ] **Step 1: Read the reference file**

Read `src/routes/superadmin/route.tsx` in full first — it's the smallest existing role shell (4 pages) and the closest structural analog to what accountant needs (5 pages, no sub-sections needed given the small page count, unlike director's 17-page grouped menu).

- [ ] **Step 2: Write the route shell**

Create `src/routes/accountant/route.tsx`:
```tsx
import { createFileRoute, Outlet } from "@tanstack/react-router";
import {
  DollarSign,
  FileSpreadsheet,
  LayoutDashboard,
  Receipt,
  ScrollText,
} from "lucide-react";
import { AppShell, type NavItem } from "@/components/layouts/app-shell";
import { RoleGuard } from "@/components/edu/role-guard";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/accountant")({
  component: AccountantLayout,
});

function AccountantLayout() {
  const { lang } = useI18n();
  const tr = (uz: string, ru: string) => (lang === "uz" ? uz : ru);

  const items: NavItem[] = [
    { to: "/accountant", label: tr("Boshqaruv paneli", "Панель управления"), icon: LayoutDashboard, primary: true },
    { to: "/accountant/finance", label: tr("Moliya", "Финансы"), icon: DollarSign, primary: true },
    { to: "/accountant/expenses", label: tr("Xarajatlar", "Расходы"), icon: Receipt, primary: true },
    { to: "/accountant/salaries", label: tr("Ish haqi", "Зарплаты"), icon: FileSpreadsheet, primary: true },
    { to: "/accountant/reconciliation", label: tr("Solishtiruv akti", "Акт сверки"), icon: ScrollText },
  ];

  return (
    <RoleGuard allow="accountant">
      {/* compact: сводные таблицы платежей и расходов, тот же профиль плотности, что у director. */}
      <AppShell items={items} density="compact">
        <Outlet />
      </AppShell>
    </RoleGuard>
  );
}
```

- [ ] **Step 3: Verify the route registers**

Run: `npm run build`
Expected: TanStack Router's file-based routing picks up the new route automatically (regenerates `src/routeTree.gen.ts`) — build should still succeed even though the 5 page files this route links to don't exist yet (TanStack Router generates route entries from file presence, not from whether linked pages exist yet; if the build fails specifically because of this, create placeholder files for the 5 pages below with just a `export const Route = createFileRoute(...)({ component: () => null })` stub, and let subsequent tasks fill them in for real).

- [ ] **Step 4: Commit**

```bash
git add src/routes/accountant/route.tsx
git commit -m "feat(accountant): route shell with 5-item nav"
```

---

## Task 11: `accountant/index.tsx` — dashboard

**Files:**
- Create: `src/routes/accountant/index.tsx`

- [ ] **Step 1: Read the reference**

Read `src/routes/superadmin/index.tsx` for the `PageShell` + `StatCardSkeleton` + KPI-tile pattern this project uses for a small dashboard (director's `index.tsx` is a bigger, more elaborate reference if more detail is wanted, but superadmin's is closer in scope to what accountant needs).

- [ ] **Step 2: Write the dashboard**

Create `src/routes/accountant/index.tsx` with a `PageShell` showing 4 `StatCard`-style tiles (this month's income, this month's expense, debtor count, current period status) sourced from `useData()`'s already-loaded `payments`/`students` — mirror the exact KPI-tile component and skeleton usage from `src/routes/superadmin/index.tsx` (import the same `StatCardSkeleton`/`KpiCard`-equivalent component that file uses — check its imports first), plus a call to `GET /api/v1/period-closes/` (via a new `periodCloseApi` helper — see Task 13) to show "Август открыт" / "Август закрыт бухгалтером {имя}, {дата}" as a `Badge`.

Do not write a period-close/reopen BUTTON on this page — that control lives on `expenses.tsx` per Task 13, this page is read-only status display.

- [ ] **Step 3: Verify**

Run: `npm run build`
Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add src/routes/accountant/index.tsx
git commit -m "feat(accountant): dashboard with monthly KPIs and period status"
```

---

## Task 12: `accountant/finance.tsx` — payments + reversal

**Files:**
- Create: `src/routes/accountant/finance.tsx`

- [ ] **Step 1: Read the reference in full**

Read `src/routes/director/finance.tsx` (330 lines) completely before writing anything — this is the file with the protected money functions (`handleReverse`/`confirmReverse`, balance/debt derivations) that have already been reviewed and fixed once this session (`reversePayment` contract bug, commit `b1078b9`). Do not paraphrase from memory.

- [ ] **Step 2: Create the accountant version**

Copy `src/routes/director/finance.tsx` to `src/routes/accountant/finance.tsx`, then apply exactly these changes and nothing else:
1. Change the `createFileRoute` path string from `"/director/finance"` to `"/accountant/finance"`.
2. `handleReverse`/`confirmReverse` and all balance/debt derivation logic: **byte-for-byte unchanged**. These call the same `reversePayment`/`addPayment` from `useData()` (`src/lib/data/store.tsx`) that every other role's finance page already calls — the period-close 409 response from Task 6 surfaces through the exact same error-toast path `confirmReverse` already has for any other API failure; no new error-handling code is needed here specifically for period-close, it falls out of the existing "check the return value, `apiErrorMessage` on failure" pattern already in this file.
3. Wherever the file renders a category `Badge` reading from `p.category` via a hardcoded `finance.cat.*` i18n lookup, leave it exactly as-is for now — this page reads existing `Payment.category` (legacy string), same as `director/finance.tsx` does today. Category-picker-from-API is `expenses.tsx`'s job (Task 13), not this page's.
4. Any `PageShell`/`title`/`subtitle` copy referencing "директор" specifically (if any) — check for it and rephrase generically (e.g. just the section name, no role name) if found; if the file doesn't reference the role by name anywhere (likely, per this project's established pattern of role-neutral page copy), no change needed here.

- [ ] **Step 3: Verify no money logic diverged**

Run: `git diff --no-index src/routes/director/finance.tsx src/routes/accountant/finance.tsx`
Read the full diff. Confirm every changed line is either the route path string or copy/comment text — if any line inside `handleReverse`, `confirmReverse`, a balance derivation, or a `useMemo` computing debt/income touched, that's a mistake — revert it back to match `director/finance.tsx` exactly for that specific logic.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: clean build.

- [ ] **Step 5: Commit**

```bash
git add src/routes/accountant/finance.tsx
git commit -m "feat(accountant): payments + reversal, mirrors director/finance.tsx money logic exactly"
```

---

## Task 13: `accountant/expenses.tsx` — expense entry + chart of accounts + period close control

**Files:**
- Create: `src/routes/accountant/expenses.tsx`

This is the one genuinely new page in this feature — no existing file to mirror. Uses `expenseCategoryApi`/`periodCloseApi` from Task 9b — those must already exist by the time this task runs. Read `src/components/edu/coin-students-tab.tsx` first for this project's established pattern of "a table with an inline add-row form plus category/type picker," since it's the closest existing analog (a data-entry table with a `Select` for a category-like field) even though it's for a different domain.

- [ ] **Step 1: Write the expenses page**

Create `src/routes/accountant/expenses.tsx` with:
- `PageShell` wrapping the page, `ignoreLoadError` if it does its own fetching (follow the pattern from `superadmin/settings.tsx` for a page with local fetch logic inside `PageShell`).
- A `Select` populated from `expenseCategoryApi.list()` for choosing a category when adding an expense (the create form calls `addPayment({ ..., type: "expense", categoryId: selectedCategory.id, ... })` from `useData()` — same store function `director/salaries.tsx`'s `handlePay` already uses, just with `payment_type: "expense"` and no `staffId`).
- A small inline category-management `Sheet` or section (list of categories with an active toggle / deactivate button, an "add category" mini-form) calling `expenseCategoryApi.create`/`.deactivate` directly (not through the `useData()` store — categories aren't part of that store's existing domain model, a direct API call + local refetch is proportionate here, following the same `load(opts?: { silent?: boolean })` pattern established throughout this session for local page state).
- The period close/reopen control: a `Card` showing the current month's status (fetched via `periodCloseApi.list()`), with a `ConfirmDialog`-gated button (`ConfirmDialog`, never `window.confirm`, per this project's `CLAUDE.md` rule) — "Закрыть [месяц]" if open, "Переоткрыть" if closed. Both actions call `periodCloseApi.close`/`.reopen` then refetch status. Show a clear warning in the `ConfirmDialog`'s description that this blocks reversal for everyone including the director, since that's the one surprising consequence a user of this button needs to understand before clicking it.

- [ ] **Step 2: Verify**

Run: `npm run build`
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add src/routes/accountant/expenses.tsx
git commit -m "feat(accountant): expense entry, chart-of-accounts management, period close/reopen control"
```

---

## Task 14: `accountant/salaries.tsx` — mirror director's salary page

**Files:**
- Create: `src/routes/accountant/salaries.tsx`

- [ ] **Step 1: Read the reference in full**

Read `src/routes/director/salaries.tsx` (548 lines) completely before writing anything.

- [ ] **Step 2: Create the accountant version**

Copy `src/routes/director/salaries.tsx` to `src/routes/accountant/salaries.tsx`, then apply exactly these changes:
1. Change the `createFileRoute` path string from `"/director/salaries"` to `"/accountant/salaries"`.
2. `handlePay` and all salary calculation/derivation logic (`calcLocalRow`, `salaryRows`, `totals`, the server-fallback-indicator logic added earlier this session): **byte-for-byte unchanged**.
3. Any role-name-specific copy: same check as Task 12 Step 2.4.

- [ ] **Step 3: Verify no money logic diverged**

Run: `git diff --no-index src/routes/director/salaries.tsx src/routes/accountant/salaries.tsx`
Read the full diff. Confirm every changed line is the route path string or copy/comment text only.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: clean build.

- [ ] **Step 5: Commit**

```bash
git add src/routes/accountant/salaries.tsx
git commit -m "feat(accountant): salary calculation and payout, mirrors director/salaries.tsx exactly"
```

---

## Task 15: `accountant/reconciliation.tsx` — acknowledgement statement export

**Files:**
- Create: `src/routes/accountant/reconciliation.tsx`

- [ ] **Step 1: Write the page**

Create `src/routes/accountant/reconciliation.tsx` — a `PageShell` with: a student picker (reuse whatever student-search `Select`/`Combobox` component `director/students.tsx` or `admin/students.tsx` already uses for picking a single student — check those files first rather than building a new search-and-select from scratch), a date-range picker (reuse `src/components/edu/date-input.tsx`, the `DateInput` component added earlier this session — check its props first), and two buttons ("Скачать PDF" / "Скачать Excel") that construct and open/download:
```
GET /api/v1/reports/reconciliation/{studentId}/?date_from={from}&date_to={to}&format=pdf
GET /api/v1/reports/reconciliation/{studentId}/?date_from={from}&date_to={to}&format=excel
```
Since this returns a binary file (not JSON), don't route it through the normal `apiGet` JSON helper — check how this project already handles a binary download response (the existing `ExportExcelView`/`ExportPdfView` pair in `backend/apps/reports/views.py` must already have a frontend caller somewhere — grep `src/` for `export/pdf` or `export/excel` API calls and copy that exact download-triggering pattern, e.g. `window.open` with an auth-token query param, or a `fetch` + `blob()` + synthetic `<a download>` click — match whatever this project already does rather than inventing a third approach).

- [ ] **Step 2: Verify**

Run: `npm run build`
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add src/routes/accountant/reconciliation.tsx
git commit -m "feat(accountant): reconciliation statement page — student/period picker, PDF/Excel export"
```

---

## Task 16: Nav-model Playwright test coverage

**Files:**
- Modify: `e2e/nav-model.spec.ts` (or wherever this project's existing nav-model test suite lives — confirmed to exist from this session's earlier work, e.g. `superadmin/index.tsx`'s task mentioned "nav-model + no-phantom-classes" Playwright coverage)

- [ ] **Step 1: Read the existing test file**

Read `e2e/nav-model.spec.ts` in full to find how other roles' nav configs are already tested (active-item highlighting, tab/section splitting, etc. — this file was referenced multiple times earlier in this session for `activeIndex`/`splitTabs`/`groupBySection` logic tests).

- [ ] **Step 2: Add accountant coverage**

Add test cases following the exact same pattern already in the file, using the 5-item `NavItem[]` array from `src/routes/accountant/route.tsx` (Task 10) as the fixture data — confirm `activeIndex` correctly picks `/accountant/finance` over `/accountant` when the path is `/accountant/finance/some-payment-id`, and that `splitTabs` puts all 5 items in the bottom tab bar without a "More" overflow (5 items = exactly `MAX_TABS_WITHOUT_MORE`, per the constant defined in `src/components/layouts/nav-model.ts`).

- [ ] **Step 3: Run the test**

Run: `npx playwright test e2e/nav-model.spec.ts`
Expected: all tests pass, including the new accountant cases.

- [ ] **Step 4: Commit**

```bash
git add e2e/nav-model.spec.ts
git commit -m "test(accountant): nav-model coverage for the 5-item accountant nav"
```

---

## Task 17: Final holistic review

**Files:** none (review-only task)

- [ ] **Step 1: Full-range diff review**

Dispatch a review pass across the entire `feature/accountant-role` branch diff against `master` (or whatever base branch this was branched from — confirm with `git merge-base feature/accountant-role master`). This is money-handling code touching the same `reverse_payment`/`Payment`/`PaymentViewSet` surface that has already had two real production-affecting bugs found by exactly this kind of pass earlier in this session — do not skip it or treat it as a formality.

Specifically verify:
- `IsBranchAdmin` was NEVER modified or given `accountant` — grep the whole diff for `IsBranchAdmin` and confirm every match is either an unrelated pre-existing line or the one `get_permissions()`/`reverse()` swap TO `IsFinanceWriter` (i.e. `IsBranchAdmin` should not appear as a NEW addition anywhere accountant now has access it shouldn't).
- `accountant/finance.tsx` and `accountant/salaries.tsx` diffs against their `director/` originals are genuinely byte-identical except for the route path and role-name copy (re-run the `git diff --no-index` checks from Tasks 12/14 one more time here, at the end, after all other tasks have landed — confirm nothing drifted).
- The period-close check in `reverse()` is NOT also present inside `reverse_payment()` in `services.py` (confirm the automated-flow exemption from Task 6 Step 3 is still intact and wasn't "fixed" by a later task under the mistaken impression it was a gap).
- Every new migration has been checked against a fresh/clean local DB, not just the already-migrated dev DB (`python manage.py migrate --check` or an equivalent fresh-apply verification, per this project's own migration-conflict incident earlier this session — that exact class of bug, two independently-created migrations with the same number, is NOT the same risk here since this task added them sequentially in one plan, but a fresh-apply check costs little and catches a different class of ordering mistake).

- [ ] **Step 2: Fix anything found**

Apply fixes directly (small) or dispatch a task-sized fix (larger).

- [ ] **Step 3: Run full verification suite**

Run: `cd backend && python manage.py check` — expect no issues.
Run: `cd backend && pytest --ignore=test_student.py` — expect no new failures versus the pre-existing baseline.
Run: `npm run build` — expect clean.
Run: `./node_modules/.bin/tsc --noEmit 2>&1 | grep -c "error TS"` — expect no worse than the project's current baseline (check `CLAUDE.md` for the current number before this branch started; compare after).
Run: `npx playwright test` — expect the same pass rate as the base branch, accounting for this project's documented environmental flakiness (re-run any single failure once before treating it as a regression, per this session's established practice).

- [ ] **Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "fix: final holistic review fixes for accountant role"
```

- [ ] **Step 5: Report readiness, do not merge**

Per this session's standing instruction ("не пушем на master пока не закончим весь редизайн + баги") and the explicit staging-first pattern established for every prior feature this session, this branch should be merged to `staging` (not `master`) for the owner to look at, once this task confirms everything is green — but do not push to `staging` automatically as part of this task; that decision point is explicitly Task 18.

---

## Task 18: Deploy to staging

**Files:** none (git/deploy operations only)

- [ ] **Step 1: Merge to staging**

```bash
git checkout staging
git pull origin staging
git merge feature/accountant-role --no-ff -m "merge: feature/accountant-role → staging (new accountant role: chart of accounts, period close, reconciliation statements)"
```

- [ ] **Step 2: Verify build on staging**

Run: `npm run build`
Expected: clean.

- [ ] **Step 3: Push**

```bash
git push origin staging
```

- [ ] **Step 4: Verify the deploy is healthy**

Use the Railway MCP (`get-status` on the staging environment) to confirm both `educrm` and `rare-elegance` deployments reach `SUCCESS`. If `educrm` fails, check `get-logs` for a migration error first — this branch adds several new migrations across two apps, and this project has already hit one real migration-conflict production incident this session; check the deploy logs for `CommandError: Conflicting migrations` specifically before assuming any other cause.

- [ ] **Step 5: Report to the owner**

Do not merge to `master`. Report that staging is ready, give the URL, and summarize in plain terms: new accountant login role exists, what it can/can't do, and that period-close is the one irreversible-by-director action worth trying deliberately on staging before trusting it.
