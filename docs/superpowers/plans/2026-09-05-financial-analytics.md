# Финансовая аналитика — план реализации

> **Для агентных исполнителей:** ОБЯЗАТЕЛЬНЫЙ ПОДСКИЛ: используйте
> superpowers:subagent-driven-development для выполнения плана по задачам.
> Шаги отмечены чекбоксами (`- [ ]`) для отслеживания прогресса.

**Цель:** Достроить и вывести на экран директору/администратору вкладку
«Финансы» внутри существующей страницы «Аналитика» — 4 блока (выручка/
расходы по разрезам, прибыль/маржа, долги/сбор, прогноз), опираясь на уже
существующие, но недоиспользуемые бэкенд-отчёты.

**Архитектура:** Бэкенд расширяет `backend/apps/reports/services.py` двумя
новыми (`get_profitability_report`, `get_revenue_forecast`) и тремя
доработанными функциями (`get_revenue_report`, `get_teachers_report`,
`get_debtors_report`) — без новых моделей/миграций, два новых `APIView` в
`views.py`+`urls.py`. Фронтенд — новый общий компонент
`finance-analytics-tab.tsx`, встроенный второй вкладкой в
`director/analytics.tsx`/`admin/analytics.tsx` через `Tabs` (вкладка «Обзор»
не меняется).

**Стек:** Django REST Framework (существующий паттерн `AnalyticsBaseView`),
React + `recharts` (существующий паттерн из `director/analytics.tsx`),
`openpyxl`-экспорт (существующий, не меняется).

Спека: `docs/superpowers/specs/2026-09-05-financial-analytics-design.md`.

---

### Task 1: `get_revenue_report` — разрезы по курсу и учителю

**Files:**
- Modify: `backend/apps/reports/services.py:188-243` (`get_revenue_report`)
- Test: `backend/tests/test_financial_analytics.py` (новый файл)

- [ ] **Step 1: Написать падающие тесты**

```python
# backend/tests/test_financial_analytics.py
import pytest
from datetime import date, timedelta
from decimal import Decimal

from tests.factories import (
    BranchFactory, CourseFactory, GroupFactory, PaymentFactory,
    StaffFactory, StudentFactory, UserFactory, WalletFactory,
)

pytestmark = pytest.mark.django_db


def _director():
    return UserFactory(role="director")


def _wide_filters(branch_id=None):
    from apps.reports.services import ReportFilters
    return ReportFilters(date_from=date(2000, 1, 1), date_to=date(2100, 1, 1), branch_id=branch_id)


class TestRevenueReportBreakdowns:
    def test_by_course_groups_payments_by_group_course(self):
        from apps.reports.services import get_revenue_report

        branch = BranchFactory()
        course_a = CourseFactory(name="Course A")
        course_b = CourseFactory(name="Course B")
        group_a = GroupFactory(branch=branch, course=course_a)
        group_b = GroupFactory(branch=branch, course=course_b)
        student = StudentFactory(branch=branch)
        WalletFactory(student=student)
        PaymentFactory(student=student, branch=branch, group=group_a, payment_type="top_up", amount=Decimal("100000.00"))
        PaymentFactory(student=student, branch=branch, group=group_b, payment_type="top_up", amount=Decimal("50000.00"))

        report = get_revenue_report(_director(), _wide_filters())

        by_course = {row["course_name"]: row["total"] for row in report["by_course"]}
        assert by_course["Course A"] == "100000.00"
        assert by_course["Course B"] == "50000.00"

    def test_by_teacher_groups_payments_by_group_teacher(self):
        from apps.reports.services import get_revenue_report

        branch = BranchFactory()
        teacher = StaffFactory(branch=branch)
        group = GroupFactory(branch=branch, teacher=teacher)
        student = StudentFactory(branch=branch)
        WalletFactory(student=student)
        PaymentFactory(student=student, branch=branch, group=group, payment_type="top_up", amount=Decimal("70000.00"))

        report = get_revenue_report(_director(), _wide_filters())

        row = next(r for r in report["by_teacher"] if r["teacher_id"] == str(teacher.id))
        assert row["total"] == "70000.00"
        assert row["teacher_name"] == teacher.user.full_name

    def test_by_teacher_groups_payment_without_group_as_unassigned(self):
        from apps.reports.services import get_revenue_report

        branch = BranchFactory()
        student = StudentFactory(branch=branch)
        WalletFactory(student=student)
        PaymentFactory(student=student, branch=branch, group=None, payment_type="top_up", amount=Decimal("30000.00"))

        report = get_revenue_report(_director(), _wide_filters())

        unassigned = next(r for r in report["by_teacher"] if r["teacher_id"] is None)
        assert unassigned["total"] == "30000.00"
```

- [ ] **Step 2: Запустить тесты и убедиться, что падают**

Run: `python -m pytest backend/tests/test_financial_analytics.py::TestRevenueReportBreakdowns -v`
Expected: FAIL — `KeyError: 'by_course'` (ключа ещё нет в ответе).

- [ ] **Step 3: Реализовать `by_course`/`by_teacher`**

В `backend/apps/reports/services.py`, внутри `get_revenue_report`, после блока
`by_group = (...)` (строки 206-210) добавить:

```python
    by_course = (
        payments_qs.values("group__course_id", "group__course__name")
        .annotate(total=net, transactions=Count("id"))
        .order_by("-total")
    )
    by_teacher = (
        payments_qs.values("group__teacher_id", "group__teacher__user__full_name")
        .annotate(total=net, transactions=Count("id"))
        .order_by("-total")
    )
```

И в возвращаемом словаре (после блока `"by_group": [...]`, перед `"by_day"`)
добавить:

```python
        "by_course": [
            {
                "course_id": str(row["group__course_id"]) if row["group__course_id"] else None,
                "course_name": row["group__course__name"] or "No course",
                "transactions": row["transactions"],
                "total": str(_quantize(row["total"])),
            }
            for row in by_course
        ],
        "by_teacher": [
            {
                "teacher_id": str(row["group__teacher_id"]) if row["group__teacher_id"] else None,
                "teacher_name": row["group__teacher__user__full_name"] or "Unassigned",
                "transactions": row["transactions"],
                "total": str(_quantize(row["total"])),
            }
            for row in by_teacher
        ],
```

- [ ] **Step 4: Запустить тесты, убедиться что проходят**

Run: `python -m pytest backend/tests/test_financial_analytics.py::TestRevenueReportBreakdowns -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Коммит**

```bash
git add backend/apps/reports/services.py backend/tests/test_financial_analytics.py
git commit -m "feat(reports): add by_course/by_teacher breakdowns to revenue report"
```

---

### Task 2: `get_teachers_report` — реальный `revenue_total`

**Files:**
- Modify: `backend/apps/reports/services.py:246-360` (`get_teachers_report`)
- Test: `backend/tests/test_financial_analytics.py`

- [ ] **Step 1: Написать падающий тест**

```python
class TestTeachersReportRevenue:
    def test_revenue_total_sums_payments_for_teachers_groups(self):
        from apps.reports.services import get_teachers_report

        branch = BranchFactory()
        teacher = StaffFactory(branch=branch)
        group = GroupFactory(branch=branch, teacher=teacher)
        student = StudentFactory(branch=branch)
        WalletFactory(student=student)
        PaymentFactory(student=student, branch=branch, group=group, payment_type="top_up", amount=Decimal("120000.00"))

        report = get_teachers_report(_director(), _wide_filters())

        row = next(r for r in report["results"] if r["teacher_id"] == str(teacher.id))
        assert row["revenue_total"] == "120000.00"

    def test_revenue_total_is_zero_for_teacher_without_payments(self):
        from apps.reports.services import get_teachers_report

        branch = BranchFactory()
        teacher = StaffFactory(branch=branch)
        GroupFactory(branch=branch, teacher=teacher)

        report = get_teachers_report(_director(), _wide_filters())

        row = next(r for r in report["results"] if r["teacher_id"] == str(teacher.id))
        assert row["revenue_total"] == "0.00"
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `python -m pytest backend/tests/test_financial_analytics.py::TestTeachersReportRevenue -v`
Expected: FAIL — `assert "0" == "120000.00"` (сейчас всегда захардкожен `"0"`).

- [ ] **Step 3: Реализовать реальный расчёт**

В `get_teachers_report`, в аннотации `teachers_qs` (строки 255-328) добавить
ещё одну аннотацию рядом с `students_count`:

```python
        revenue_total=Coalesce(
            Sum(
                Case(
                    When(
                        lessons__group__payments__payment_type__in=("top_up", "manual_top_up"),
                        lessons__group__payments__created_at__date__gte=filters.date_from,
                        lessons__group__payments__created_at__date__lte=filters.date_to,
                        then=F("lessons__group__payments__amount"),
                    ),
                    When(
                        lessons__group__payments__payment_type__in=("refund", "manual_charge"),
                        lessons__group__payments__created_at__date__gte=filters.date_from,
                        lessons__group__payments__created_at__date__lte=filters.date_to,
                        then=-F("lessons__group__payments__amount"),
                    ),
                    default=Value(Decimal("0.00")),
                    output_field=DecimalField(max_digits=14, decimal_places=2),
                ),
                distinct=True,
            ),
            Decimal("0.00"),
        ),
```

Это считает выручку через `lessons__group__payments` — тот же путь связи,
что уже используют остальные аннотации в этой функции (`lessons__group__...`).
`distinct=True` обязателен: без него JOIN через `lessons` и `payments`
одновременно даёт декартово произведение и завышает сумму кратно числу
уроков — тот же риск, что и у `present_count`/`absent_count` выше в этой же
функции (они используют `distinct=True` по этой же причине).

Заменить строку `"revenue_total": "0",` на:

```python
            "revenue_total": str(_quantize(teacher.revenue_total or Decimal("0.00"))),
```

- [ ] **Step 4: Запустить тесты**

Run: `python -m pytest backend/tests/test_financial_analytics.py::TestTeachersReportRevenue -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Коммит**

```bash
git add backend/apps/reports/services.py backend/tests/test_financial_analytics.py
git commit -m "fix(reports): compute real revenue_total in teachers report (was hardcoded 0)"
```

---

### Task 3: Новая `get_profitability_report`

**Files:**
- Modify: `backend/apps/reports/services.py` (добавить функцию после `get_revenue_report`)
- Test: `backend/tests/test_financial_analytics.py`

- [ ] **Step 1: Написать падающие тесты**

```python
class TestProfitabilityReport:
    def test_positive_margin_when_revenue_exceeds_expense(self):
        from apps.reports.services import get_profitability_report

        branch = BranchFactory()
        student = StudentFactory(branch=branch)
        WalletFactory(student=student)
        PaymentFactory(student=student, branch=branch, payment_type="top_up", amount=Decimal("100000.00"))
        PaymentFactory(student=None, wallet=None, branch=branch, payment_type="expense", amount=Decimal("40000.00"))

        report = get_profitability_report(_director(), _wide_filters())

        assert report["total_revenue"] == "100000.00"
        assert report["total_expense"] == "40000.00"
        assert report["total_profit"] == "60000.00"
        assert report["total_margin_percent"] == "60.00"

    def test_branch_with_only_expense_has_zero_margin_not_error(self):
        from apps.reports.services import get_profitability_report

        branch = BranchFactory()
        PaymentFactory(student=None, wallet=None, branch=branch, payment_type="expense", amount=Decimal("10000.00"))

        report = get_profitability_report(_director(), _wide_filters())

        row = next(r for r in report["by_branch"] if r["id"] == str(branch.id))
        assert row["revenue"] == "0.00"
        assert row["expense"] == "10000.00"
        assert row["profit"] == "-10000.00"
        assert row["margin_percent"] == "0.00"

    def test_branch_with_only_revenue_has_full_margin(self):
        from apps.reports.services import get_profitability_report

        branch = BranchFactory()
        student = StudentFactory(branch=branch)
        WalletFactory(student=student)
        PaymentFactory(student=student, branch=branch, payment_type="top_up", amount=Decimal("50000.00"))

        report = get_profitability_report(_director(), _wide_filters())

        row = next(r for r in report["by_branch"] if r["id"] == str(branch.id))
        assert row["margin_percent"] == "100.00"

    def test_by_course_breakdown_present(self):
        from apps.reports.services import get_profitability_report

        branch = BranchFactory()
        course = CourseFactory(name="Course X")
        group = GroupFactory(branch=branch, course=course)
        student = StudentFactory(branch=branch)
        WalletFactory(student=student)
        PaymentFactory(student=student, branch=branch, group=group, payment_type="top_up", amount=Decimal("80000.00"))

        report = get_profitability_report(_director(), _wide_filters())

        row = next(r for r in report["by_course"] if r["id"] == str(course.id))
        assert row["revenue"] == "80000.00"

    def test_expense_by_category_groups_by_free_text_category(self):
        from apps.reports.services import get_profitability_report

        branch = BranchFactory()
        PaymentFactory(student=None, wallet=None, branch=branch, payment_type="expense", amount=Decimal("30000.00"), category="Ijara")
        PaymentFactory(student=None, wallet=None, branch=branch, payment_type="expense", amount=Decimal("20000.00"), category="Ijara")
        PaymentFactory(student=None, wallet=None, branch=branch, payment_type="expense", amount=Decimal("15000.00"), category="")

        report = get_profitability_report(_director(), _wide_filters())

        by_category = {row["category"]: row["total"] for row in report["expense_by_category"]}
        assert by_category["Ijara"] == "50000.00"
        assert by_category["Uncategorized"] == "15000.00"
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `python -m pytest backend/tests/test_financial_analytics.py::TestProfitabilityReport -v`
Expected: FAIL — `ImportError: cannot import name 'get_profitability_report'`

- [ ] **Step 3: Реализовать функцию**

Добавить в `backend/apps/reports/services.py`, сразу после конца
`get_revenue_report` (после строки, где сейчас заканчивается функция —
перед `def get_teachers_report`):

```python
def get_profitability_report(user, filters: ReportFilters) -> dict:
    branch_ids = branch_ids_for_user(user, filters.branch_id)
    payments_qs = Payment.objects.filter(branch_id__in=branch_ids)
    payments_qs = _with_date_range(payments_qs, "created_at", filters.date_from, filters.date_to)

    revenue_qs = payments_qs.filter(
        payment_type__in=INCOME_PAYMENT_TYPES + INCOME_REVERSAL_TYPES
    ).annotate(signed_amount=_SIGNED_REVENUE_AMOUNT)
    expense_qs = payments_qs.filter(payment_type="expense")

    def _margin_rows(group_field):
        revenue_by_key = {
            row[group_field]: row["total"]
            for row in revenue_qs.values(group_field)
            .annotate(total=Coalesce(Sum("signed_amount"), Decimal("0.00")))
        }
        expense_by_key = {
            row[group_field]: row["total"]
            for row in expense_qs.values(group_field)
            .annotate(total=Coalesce(Sum("amount"), Decimal("0.00")))
        }
        keys = {k for k in (set(revenue_by_key) | set(expense_by_key)) if k is not None}
        rows = []
        for key in keys:
            revenue = revenue_by_key.get(key, Decimal("0.00"))
            expense = expense_by_key.get(key, Decimal("0.00"))
            profit = revenue - expense
            margin = _percentage(profit, revenue) if revenue > 0 else Decimal("0.00")
            rows.append({
                "id": str(key),
                "revenue": str(_quantize(revenue)),
                "expense": str(_quantize(expense)),
                "profit": str(_quantize(profit)),
                "margin_percent": str(margin),
            })
        rows.sort(key=lambda r: Decimal(r["profit"]), reverse=True)
        return rows

    by_branch = _margin_rows("branch_id")
    by_course = _margin_rows("group__course_id")

    # values_list("id", ...) отдаёт реальные UUID-объекты, а row["id"] в
    # by_branch/by_course уже строка (str(key) вызван внутри _margin_rows) —
    # ключи словаря сразу приводятся к строке, чтобы сравнение совпадало
    # без обратной конвертации строки в UUID.
    branch_names = {
        str(k): v for k, v in Branch.objects.filter(id__in=[r["id"] for r in by_branch]).values_list("id", "name")
    }
    for row in by_branch:
        row["name"] = branch_names.get(row["id"], "Unknown")

    from apps.courses.models import Course
    course_names = {
        str(k): v for k, v in Course.objects.filter(id__in=[r["id"] for r in by_course]).values_list("id", "name")
    }
    for row in by_course:
        row["name"] = course_names.get(row["id"], "No course")

    expense_by_category_qs = (
        expense_qs.values("category")
        .annotate(total=Coalesce(Sum("amount"), Decimal("0.00")))
        .order_by("-total")
    )
    expense_by_category = [
        {
            "category": row["category"] or "Uncategorized",
            "total": str(_quantize(row["total"])),
        }
        for row in expense_by_category_qs
    ]

    total_revenue = _net_revenue(payments_qs)
    total_expense = expense_qs.aggregate(total=Coalesce(Sum("amount"), Decimal("0.00")))["total"]
    total_profit = total_revenue - total_expense
    total_margin = _percentage(total_profit, total_revenue) if total_revenue > 0 else Decimal("0.00")

    return {
        "period": {"date_from": str(filters.date_from), "date_to": str(filters.date_to)},
        "total_revenue": str(_quantize(total_revenue)),
        "total_expense": str(_quantize(total_expense)),
        "total_profit": str(_quantize(total_profit)),
        "total_margin_percent": str(total_margin),
        "by_branch": by_branch,
        "by_course": by_course,
        "expense_by_category": expense_by_category,
    }
```

**Примечание про размещение:** спека изначально описывала `expense_by_category`
как добавку к `get_revenue_report`, но `expense_qs` уже строится именно
здесь, в `get_profitability_report` (revenue-функция расходов вообще не
трогает) — считать его тут, а не заново открывать `Payment.objects.filter(payment_type="expense")`
в другом месте.

- [ ] **Step 4: Запустить тесты**

Run: `python -m pytest backend/tests/test_financial_analytics.py::TestProfitabilityReport -v`
Expected: PASS (5 passed)

- [ ] **Step 5: Коммит**

```bash
git add backend/apps/reports/services.py backend/tests/test_financial_analytics.py
git commit -m "feat(reports): add get_profitability_report (revenue minus expense by branch/course)"
```

---

### Task 4: `get_debtors_report` — добавить `collection_rate`

**Files:**
- Modify: `backend/apps/reports/services.py:427-` (`get_debtors_report`)
- Test: `backend/tests/test_financial_analytics.py`

- [ ] **Step 1: Текущий конец функции (для ориентира при вставке)**

`get_debtors_report` (`services.py:446-450`) заканчивается:
```python
    return {
        "period": {"date_from": str(filters.date_from), "date_to": str(filters.date_to)},
        "debtors_count": len(results),
        "results": results,
    }
```

- [ ] **Step 2: Написать падающие тесты**

```python
class TestDebtorsCollectionRate:
    def test_full_collection_rate_when_all_billed_is_collected(self):
        from apps.reports.services import get_debtors_report

        branch = BranchFactory()
        student = StudentFactory(branch=branch)
        WalletFactory(student=student)
        PaymentFactory(student=student, branch=branch, payment_type="charge", amount=Decimal("50000.00"))
        PaymentFactory(student=student, branch=branch, payment_type="top_up", amount=Decimal("50000.00"))

        report = get_debtors_report(_director(), _wide_filters())

        assert report["collection_rate"] == "100.00"

    def test_zero_billed_gives_full_collection_rate_not_division_error(self):
        from apps.reports.services import get_debtors_report

        BranchFactory()

        report = get_debtors_report(_director(), _wide_filters())

        assert report["collection_rate"] == "100.00"

    def test_partial_collection_rate(self):
        from apps.reports.services import get_debtors_report

        branch = BranchFactory()
        student = StudentFactory(branch=branch)
        WalletFactory(student=student)
        PaymentFactory(student=student, branch=branch, payment_type="charge", amount=Decimal("100000.00"))
        PaymentFactory(student=student, branch=branch, payment_type="top_up", amount=Decimal("40000.00"))

        report = get_debtors_report(_director(), _wide_filters())

        assert report["collection_rate"] == "40.00"
```

- [ ] **Step 3: Запустить, убедиться что падает**

Run: `python -m pytest backend/tests/test_financial_analytics.py::TestDebtorsCollectionRate -v`
Expected: FAIL — `KeyError: 'collection_rate'`

- [ ] **Step 4: Реализовать**

Перед `return` в `get_debtors_report` добавить:

```python
    period_payments_qs = Payment.objects.filter(branch_id__in=branch_ids)
    period_payments_qs = _with_date_range(period_payments_qs, "created_at", filters.date_from, filters.date_to)
    billed = period_payments_qs.filter(payment_type__in=CHARGE_PAYMENT_TYPES).aggregate(
        total=Coalesce(Sum("amount"), Decimal("0.00"))
    )["total"]
    collected = _net_revenue(period_payments_qs)
    collection_rate = _percentage(collected, billed) if billed > 0 else Decimal("100.00")
```

И добавить `"collection_rate": str(collection_rate),` в возвращаемый словарь.

Примечание: `collection_rate` считается за `filters.date_from`/`date_to`
(сбор за период), тогда как список должников (`results`) — это срез "прямо
сейчас", не зависящий от периода (как и было раньше). Это два разных среза
внутри одного ответа, оба нужны — не противоречие, а два вопроса
("кто должен сейчас" и "сколько собрали за этот период"), явно
задокументированные в спеке.

- [ ] **Step 5: Запустить тесты**

Run: `python -m pytest backend/tests/test_financial_analytics.py::TestDebtorsCollectionRate -v`
Expected: PASS (3 passed)

- [ ] **Step 6: Коммит**

```bash
git add backend/apps/reports/services.py backend/tests/test_financial_analytics.py
git commit -m "feat(reports): add collection_rate to debtors report"
```

---

### Task 5: Новая `get_revenue_forecast`

**Files:**
- Modify: `backend/apps/reports/services.py` (добавить функцию после `get_debtors_report`)
- Test: `backend/tests/test_financial_analytics.py`

- [ ] **Step 1: Написать падающие тесты**

```python
from apps.courses.models import GroupMembership
from tests.factories import GroupMembershipFactory


class TestRevenueForecast:
    def test_forecast_from_active_students_and_group_price(self):
        from apps.reports.services import get_revenue_forecast

        branch = BranchFactory()
        group = GroupFactory(branch=branch, status="active", monthly_price=Decimal("100000.00"))
        s1 = StudentFactory(branch=branch)
        s2 = StudentFactory(branch=branch)
        GroupMembershipFactory(group=group, student=s1, left_at=None)
        GroupMembershipFactory(group=group, student=s2, left_at=None)

        forecast = get_revenue_forecast(_director(), _wide_filters())

        assert forecast["potential_revenue"] == "200000.00"

    def test_no_active_groups_gives_zero_forecast_not_crash(self):
        from apps.reports.services import get_revenue_forecast

        BranchFactory()

        forecast = get_revenue_forecast(_director(), _wide_filters())

        assert forecast["potential_revenue"] == "0.00"
        assert forecast["forecast_revenue"] == "0.00"

    def test_no_billing_history_gives_zero_shortfall_rate(self):
        from apps.reports.services import get_revenue_forecast

        branch = BranchFactory()
        group = GroupFactory(branch=branch, status="active", monthly_price=Decimal("50000.00"))
        student = StudentFactory(branch=branch)
        GroupMembershipFactory(group=group, student=student, left_at=None)

        forecast = get_revenue_forecast(_director(), _wide_filters())

        assert forecast["shortfall_rate_percent"] == "0.00"
        assert forecast["forecast_revenue"] == forecast["potential_revenue"]

    def test_left_students_not_counted(self):
        from apps.reports.services import get_revenue_forecast
        from django.utils import timezone

        branch = BranchFactory()
        group = GroupFactory(branch=branch, status="active", monthly_price=Decimal("100000.00"))
        student = StudentFactory(branch=branch)
        GroupMembershipFactory(group=group, student=student, left_at=timezone.now())

        forecast = get_revenue_forecast(_director(), _wide_filters())

        assert forecast["potential_revenue"] == "0.00"
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `python -m pytest backend/tests/test_financial_analytics.py::TestRevenueForecast -v`
Expected: FAIL — `ImportError: cannot import name 'get_revenue_forecast'`

- [ ] **Step 3: Реализовать**

Добавить в `backend/apps/reports/services.py`, после `get_debtors_report`:

```python
def get_revenue_forecast(user, filters: ReportFilters) -> dict:
    from apps.courses.models import Group

    branch_ids = branch_ids_for_user(user, filters.branch_id)
    active_groups = Group.objects.filter(
        branch_id__in=branch_ids, status="active"
    ).annotate(
        active_students=Count("memberships", filter=Q(memberships__left_at__isnull=True))
    )
    potential = sum(
        ((g.monthly_price or Decimal("0.00")) * g.active_students for g in active_groups),
        Decimal("0.00"),
    )

    today = timezone.localdate()
    lookback_from = (today.replace(day=1) - timedelta(days=90)).replace(day=1)
    lookback_to = today.replace(day=1) - timedelta(days=1)
    lookback_qs = Payment.objects.filter(branch_id__in=branch_ids)
    lookback_qs = _with_date_range(lookback_qs, "created_at", lookback_from, lookback_to)

    billed = lookback_qs.filter(payment_type__in=CHARGE_PAYMENT_TYPES).aggregate(
        total=Coalesce(Sum("amount"), Decimal("0.00"))
    )["total"]
    collected = _net_revenue(lookback_qs)
    shortfall_rate = _percentage(billed - collected, billed) if billed > 0 else Decimal("0.00")
    forecast = potential * (Decimal("100.00") - shortfall_rate) / Decimal("100.00")

    return {
        "potential_revenue": str(_quantize(potential)),
        "shortfall_rate_percent": str(shortfall_rate),
        "forecast_revenue": str(_quantize(forecast)),
        "has_sufficient_history": billed > 0,
    }
```

Добавить `Q` в импорт `django.db.models` наверху файла (строка 7):
`from django.db.models import Avg, Case, Count, DecimalField, F, Q, Sum, Value, When`.

- [ ] **Step 4: Запустить тесты**

Run: `python -m pytest backend/tests/test_financial_analytics.py::TestRevenueForecast -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Коммит**

```bash
git add backend/apps/reports/services.py backend/tests/test_financial_analytics.py
git commit -m "feat(reports): add get_revenue_forecast based on active students and 3-month collection history"
```

---

### Task 6: Права доступа по филиалу — тест на скоуп

**Files:**
- Test: `backend/tests/test_financial_analytics.py`

- [ ] **Step 1: Написать и сразу проверить тесты скоупа (уже должны проходить — это защита от регрессии)**

```python
class TestBranchScoping:
    def test_branch_admin_does_not_see_other_branch_revenue(self):
        from apps.reports.services import get_revenue_report

        own_branch = BranchFactory()
        other_branch = BranchFactory()
        branch_admin_user = UserFactory(role="branch_admin")
        StaffFactory(user=branch_admin_user, branch=own_branch)

        student = StudentFactory(branch=other_branch)
        WalletFactory(student=student)
        PaymentFactory(student=student, branch=other_branch, payment_type="top_up", amount=Decimal("999999.00"))

        report = get_revenue_report(branch_admin_user, _wide_filters())

        assert report["total_revenue"] == "0.00"

    def test_branch_admin_does_not_see_other_branch_profitability(self):
        from apps.reports.services import get_profitability_report

        own_branch = BranchFactory()
        other_branch = BranchFactory()
        branch_admin_user = UserFactory(role="branch_admin")
        StaffFactory(user=branch_admin_user, branch=own_branch)

        student = StudentFactory(branch=other_branch)
        WalletFactory(student=student)
        PaymentFactory(student=student, branch=other_branch, payment_type="top_up", amount=Decimal("999999.00"))

        report = get_profitability_report(branch_admin_user, _wide_filters())

        assert report["total_revenue"] == "0.00"

    def test_branch_admin_does_not_see_other_branch_forecast(self):
        from apps.reports.services import get_revenue_forecast

        own_branch = BranchFactory()
        other_branch = BranchFactory()
        branch_admin_user = UserFactory(role="branch_admin")
        StaffFactory(user=branch_admin_user, branch=own_branch)

        GroupFactory(branch=other_branch, status="active", monthly_price=Decimal("500000.00"))

        forecast = get_revenue_forecast(branch_admin_user, _wide_filters())

        assert forecast["potential_revenue"] == "0.00"
```

Run: `python -m pytest backend/tests/test_financial_analytics.py::TestBranchScoping -v`
Expected: PASS сразу (это regression-тест на уже существующий `branch_ids_for_user`,
использованный всеми пятью функциями выше — если он падает, значит одна из
задач 1-5 забыла применить фильтр `branch_id__in=branch_ids`).

- [ ] **Step 2: Коммит**

```bash
git add backend/tests/test_financial_analytics.py
git commit -m "test(reports): verify branch_admin scope isolation for new financial reports"
```

---

### Task 7: Backend API — два новых `APIView` + маршруты

**Files:**
- Modify: `backend/apps/reports/views.py`
- Modify: `backend/apps/reports/urls.py`
- Modify: `backend/apps/reports/serializers.py` (`ExportRequestSerializer.report_type` choices)
- Test: `backend/tests/test_financial_analytics.py`

- [ ] **Step 1: Написать падающие тесты (через APIClient, конец-в-конец)**

```python
class TestNewAnalyticsEndpoints:
    def test_profitability_endpoint_returns_200(self, api_client):
        director = _director()
        api_client.force_authenticate(user=director)

        response = api_client.get("/api/v1/analytics/profitability/")

        assert response.status_code == 200, response.content
        assert "total_profit" in response.json()

    def test_revenue_forecast_endpoint_returns_200(self, api_client):
        director = _director()
        api_client.force_authenticate(user=director)

        response = api_client.get("/api/v1/analytics/revenue-forecast/")

        assert response.status_code == 200, response.content
        assert "forecast_revenue" in response.json()

    def test_debtors_endpoint_includes_collection_rate(self, api_client):
        director = _director()
        api_client.force_authenticate(user=director)

        response = api_client.get("/api/v1/analytics/debtors/")

        assert response.status_code == 200, response.content
        assert "collection_rate" in response.json()
```

`api_client` — уже существующая pytest-фикстура (`tests/conftest.py:6-8`,
`return APIClient()`), используется как есть, без дополнительной настройки.

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `python -m pytest backend/tests/test_financial_analytics.py::TestNewAnalyticsEndpoints -v`
Expected: FAIL — 404 (маршрутов ещё нет).

- [ ] **Step 3: Добавить вьюхи**

В `backend/apps/reports/views.py`, импорт функций (строки 20-32) — добавить
`get_profitability_report`, `get_revenue_forecast`:

```python
from .services import (
    calculate_teacher_salary,
    get_attendance_report,
    get_audit_logs_snapshot,
    get_conversion_report,
    get_daily_report,
    get_debtors_report,
    get_overview,
    get_profitability_report,
    get_revenue_forecast,
    get_revenue_report,
    get_rooms_report,
    get_teachers_report,
    normalize_filters,
)
```

После `class AnalyticsDebtorsView(AnalyticsBaseView): ...` (строка 133-136)
добавить:

```python
class AnalyticsProfitabilityView(AnalyticsBaseView):
    @extend_schema(parameters=[AnalyticsFilterSerializer], responses=OpenApiTypes.OBJECT)
    def get(self, request):
        return Response(get_profitability_report(request.user, self.get_filters(request)))


class AnalyticsRevenueForecastView(AnalyticsBaseView):
    @extend_schema(parameters=[AnalyticsFilterSerializer], responses=OpenApiTypes.OBJECT)
    def get(self, request):
        return Response(get_revenue_forecast(request.user, self.get_filters(request)))
```

- [ ] **Step 4: Добавить маршруты**

В `backend/apps/reports/urls.py`, импорт (добавить к существующему списку):
`AnalyticsProfitabilityView`, `AnalyticsRevenueForecastView`.

После строки `path("analytics/debtors/", AnalyticsDebtorsView.as_view(), name="analytics-debtors"),`
добавить:

```python
    path("analytics/profitability/", AnalyticsProfitabilityView.as_view(), name="analytics-profitability"),
    path("analytics/revenue-forecast/", AnalyticsRevenueForecastView.as_view(), name="analytics-revenue-forecast"),
```

- [ ] **Step 5: Разрешить `report_type="finance_analytics"` в экспорте (понадобится в Task 8, но серилизатор общий — правим сейчас)**

В `backend/apps/reports/serializers.py`, в `ExportRequestSerializer`:
```python
    report_type = serializers.ChoiceField(
        choices=["finance", "finance_analytics", "attendance", "salary", "audit"],
    )
```

- [ ] **Step 6: Запустить тесты**

Run: `python -m pytest backend/tests/test_financial_analytics.py::TestNewAnalyticsEndpoints -v`
Expected: PASS (3 passed)

- [ ] **Step 7: Коммит**

```bash
git add backend/apps/reports/views.py backend/apps/reports/urls.py backend/apps/reports/serializers.py backend/tests/test_financial_analytics.py
git commit -m "feat(reports): expose profitability and revenue-forecast endpoints"
```

---

### Task 8: Экспорт — `report_type="finance_analytics"`

**Files:**
- Modify: `backend/apps/reports/views.py:180-207` (`_build_export_payload`)
- Test: `backend/tests/test_financial_analytics.py`

Экспорт уже полностью общий (`export_excel`/`export_pdf` в `exporters.py`
итерируют произвольный `data: dict` — скалярные значения идут на лист
Summary, списки становятся отдельными листами по ключу). Новый тип экспорта
не требует правок `exporters.py` — только сборку объединённого `data`.

- [ ] **Step 1: Написать падающий тест**

```python
class TestFinanceAnalyticsExport:
    def test_export_excel_finance_analytics_returns_200(self, api_client):
        director = _director()
        api_client.force_authenticate(user=director)

        response = api_client.post("/api/v1/export/excel/", {"report_type": "finance_analytics"}, format="json")

        assert response.status_code == 200, response.content
        assert response["Content-Type"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

    def test_export_pdf_finance_analytics_returns_200(self, api_client):
        director = _director()
        api_client.force_authenticate(user=director)

        response = api_client.post("/api/v1/export/pdf/", {"report_type": "finance_analytics"}, format="json")

        assert response.status_code == 200, response.content
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `python -m pytest backend/tests/test_financial_analytics.py::TestFinanceAnalyticsExport -v`
Expected: FAIL — 400 (`report_type` неизвестен `_build_export_payload`, хотя
сериализатор его уже пропускает после Task 7 — сама сборка данных ещё не
реализована, упадёт на `return report_type, {...}` ветке audit-логов с
неожиданным содержимым, тест не найдёт ожидаемых данных/статуса).

- [ ] **Step 3: Реализовать сборку**

В `_build_export_payload`, после ветки `if report_type == "finance":` (строки
184-185), добавить:

```python
    if report_type == "finance_analytics":
        revenue = get_revenue_report(user, filters)
        profitability = get_profitability_report(user, filters)
        debtors = get_debtors_report(user, filters)
        forecast = get_revenue_forecast(user, filters)
        return report_type, {
            "period": revenue["period"],
            "total_revenue": revenue["total_revenue"],
            "total_expense": profitability["total_expense"],
            "total_profit": profitability["total_profit"],
            "total_margin_percent": profitability["total_margin_percent"],
            "collection_rate": debtors["collection_rate"],
            "forecast_revenue": forecast["forecast_revenue"],
            "potential_revenue": forecast["potential_revenue"],
            "revenue_by_branch": revenue["by_branch"],
            "revenue_by_course": revenue["by_course"],
            "revenue_by_teacher": revenue["by_teacher"],
            "revenue_by_day": revenue["by_day"],
            "profitability_by_branch": profitability["by_branch"],
            "profitability_by_course": profitability["by_course"],
            "expense_by_category": profitability["expense_by_category"],
            "debtors": debtors["results"],
        }
```

Добавить `get_profitability_report`, `get_revenue_forecast` в импорт из
`.services` в этом же файле (уже частично сделано в Task 7 — проверить, что
обе есть).

- [ ] **Step 4: Запустить тесты**

Run: `python -m pytest backend/tests/test_financial_analytics.py::TestFinanceAnalyticsExport -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Коммит**

```bash
git add backend/apps/reports/views.py backend/tests/test_financial_analytics.py
git commit -m "feat(reports): add finance_analytics export type combining all 4 blocks"
```

---

### Task 9: Полный прогон бэкенд-тестов + `manage.py check`

**Files:** нет изменений, только проверка.

- [ ] **Step 1: Полный прогон**

Запускать из корня репозитория (`pytest.ini` там же, `pythonpath = backend`;
`manage.py`-команды — из `backend/`, так, как их запускает сам Django):

```bash
python -m pytest backend/tests/test_financial_analytics.py -v
cd backend && python manage.py check && cd ..
python -m pytest backend/tests -q
```

Expected: все новые тесты зелёные; полный прогон `pytest backend/tests`
"24 failed / известные, не связаны с этой работой" — если появились НОВЫЕ
падения вне `test_financial_analytics.py`, это регрессия, останавливаемся и
разбираемся, не идём дальше).

- [ ] **Step 2: Если всё чисто — ничего коммитить не нужно, переходим к фронтенду**

---

### Task 10: `src/lib/api.ts` — обёртки для новых эндпоинтов

**Files:**
- Modify: `src/lib/api.ts` (`analyticsApi`)

- [ ] **Step 1: Добавить обёртки**

В объект `analyticsApi` (после `revenue: (...)`, перед `teachers: (...)`)
добавить:

```typescript
  debtors: (params?: Record<string, string>) =>
    requestJson(`/analytics/debtors/${params ? `?${new URLSearchParams(params)}` : ""}`),
  profitability: (params?: Record<string, string>) =>
    requestJson(`/analytics/profitability/${params ? `?${new URLSearchParams(params)}` : ""}`),
  revenueForecast: (params?: Record<string, string>) =>
    requestJson(`/analytics/revenue-forecast/${params ? `?${new URLSearchParams(params)}` : ""}`),
```

- [ ] **Step 2: Проверить сборку**

Run: `npm run build`
Expected: чисто (новые функции пока нигде не вызываются — не должно быть
ошибок типов на этом шаге).

- [ ] **Step 3: Коммит**

```bash
git add src/lib/api.ts
git commit -m "feat(api): add debtors/profitability/revenueForecast analytics wrappers"
```

---

### Task 11: Типы ответов и i18n-ключи

**Files:**
- Modify: `src/lib/i18n.tsx`

- [ ] **Step 1: Добавить ключи**

Реальная структура файла — НЕ вложенные `{uz, ru}` объекты. Это два
отдельных плоских словаря `const UZ: Dict = {...}` (`i18n.tsx:9`) и
`const RU: Dict = {...}` (`i18n.tsx:801`), `type Dict = Record<string, string>`
(`i18n.tsx:7`), с одинаковым набором строковых ключей вида `"section.key"` —
у каждого словаря своё, одноязычное значение. Добавить один и тот же набор
ключей в оба словаря, каждый раз с одним значением, не парой.

В `UZ` (после блока `// Parent`, `i18n.tsx:474-487`, перед `// Director home`):

```typescript
  // Finance analytics
  "financeAnalytics.tab": "Moliya",
  "financeAnalytics.overviewTab": "Umumiy",
  "financeAnalytics.periodThisMonth": "Bu oy",
  "financeAnalytics.periodQuarter": "Chorak",
  "financeAnalytics.periodSixMonths": "6 oy",
  "financeAnalytics.periodYear": "Yil",
  "financeAnalytics.periodCustom": "O'z oralig'i",
  "financeAnalytics.byBranch": "Filial bo'yicha",
  "financeAnalytics.byCourse": "Kurs bo'yicha",
  "financeAnalytics.byTeacher": "O'qituvchi bo'yicha",
  "financeAnalytics.profitMargin": "Foyda va marja",
  "financeAnalytics.expenseByCategory": "Xarajat turlari",
  "financeAnalytics.debtCollection": "Qarzlar va yig'im",
  "financeAnalytics.collectionRate": "Yig'im foizi",
  "financeAnalytics.forecastNextMonth": "Keyingi oy uchun prognoz",
  "financeAnalytics.forecastInsufficientHistory": "Aniq prognoz uchun tarix yetarli emas",
  "financeAnalytics.exportExcel": "Excel eksport",
  "financeAnalytics.exportPdf": "PDF eksport",
```

В `RU`, на том же логическом месте (после аналогичного русского блока
`// Parent`) — те же ключи, русские значения:

```typescript
  // Finance analytics
  "financeAnalytics.tab": "Финансы",
  "financeAnalytics.overviewTab": "Обзор",
  "financeAnalytics.periodThisMonth": "Этот месяц",
  "financeAnalytics.periodQuarter": "Квартал",
  "financeAnalytics.periodSixMonths": "6 месяцев",
  "financeAnalytics.periodYear": "Год",
  "financeAnalytics.periodCustom": "Свой диапазон",
  "financeAnalytics.byBranch": "По филиалам",
  "financeAnalytics.byCourse": "По курсам",
  "financeAnalytics.byTeacher": "По учителям",
  "financeAnalytics.profitMargin": "Прибыль и маржа",
  "financeAnalytics.expenseByCategory": "Расходы по категориям",
  "financeAnalytics.debtCollection": "Долги и сбор",
  "financeAnalytics.collectionRate": "Процент сбора",
  "financeAnalytics.forecastNextMonth": "Прогноз на следующий месяц",
  "financeAnalytics.forecastInsufficientHistory": "Недостаточно истории для точного прогноза",
  "financeAnalytics.exportExcel": "Экспорт в Excel",
  "financeAnalytics.exportPdf": "Экспорт в PDF",
```

Отдельный ключ `forecast` (просто слово "Прогноз") не заводится — компонент
(Task 12) использует `forecastNextMonth` целиком как заголовок блока, второй
короткий вариант не нужен.

- [ ] **Step 2: Собрать**

Run: `npm run build`
Expected: чисто.

- [ ] **Step 3: Коммит**

```bash
git add src/lib/i18n.tsx
git commit -m "feat(i18n): add financeAnalytics translation keys"
```

---

### Task 12: Компонент `finance-analytics-tab.tsx`

**Files:**
- Create: `src/components/edu/finance-analytics-tab.tsx`

- [ ] **Step 1: Написать компонент**

```typescript
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Download } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Line, LineChart,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { DateInput } from "@/components/edu/date-input";
import { analyticsApi } from "@/lib/api";
import { apiErrorMessage } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/format";

type PeriodPreset = "month" | "quarter" | "half_year" | "year" | "custom";

interface FinanceAnalyticsTabProps {
  /** Если передан — фильтр по конкретному филиалу (для директора с выбором). */
  branchId?: string;
}

function localDateIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function presetRange(preset: Exclude<PeriodPreset, "custom">): { date_from: string; date_to: string } {
  const today = new Date();
  const to = localDateIso(today);
  const from = new Date(today);
  if (preset === "month") from.setMonth(from.getMonth() - 1);
  if (preset === "quarter") from.setMonth(from.getMonth() - 3);
  if (preset === "half_year") from.setMonth(from.getMonth() - 6);
  if (preset === "year") from.setFullYear(from.getFullYear() - 1);
  return { date_from: localDateIso(from), date_to: to };
}

/**
 * Бэкенд отдаёт денежные суммы строками (`Decimal` квантуется и сериализуется
 * через `str()` в `services.py`, чтобы не терять точность в JSON) — recharts
 * же требует числовые поля для оси/высоты столбцов. Без этой конвертации
 * графики рисуются пустыми или нулевой высоты, без ошибки в консоли.
 */
function numericField<T extends Record<string, any>>(rows: T[], field: keyof T): (T & Record<string, number>)[] {
  return rows.map((row) => ({ ...row, [field]: Number(row[field]) }));
}

export function FinanceAnalyticsTab({ branchId }: FinanceAnalyticsTabProps) {
  const { t, lang } = useI18n();
  const [preset, setPreset] = useState<PeriodPreset>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [revenue, setRevenue] = useState<any | null>(null);
  const [profitability, setProfitability] = useState<any | null>(null);
  const [debtors, setDebtors] = useState<any | null>(null);
  const [forecast, setForecast] = useState<any | null>(null);
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);

  const range = useMemo(() => {
    if (preset === "custom") {
      // Пока обе даты произвольного диапазона не заполнены — не запрашиваем
      // с половинчатыми параметрами, ждём обе.
      if (!customFrom || !customTo) return null;
      return { date_from: customFrom, date_to: customTo };
    }
    return presetRange(preset);
  }, [preset, customFrom, customTo]);

  const revenueByDayChart = useMemo(
    () => numericField(revenue?.by_day ?? [], "total"),
    [revenue],
  );
  const profitabilityByBranchChart = useMemo(
    () => numericField(profitability?.by_branch ?? [], "profit"),
    [profitability],
  );

  const params = useMemo(() => {
    if (!range) return null;
    const p: Record<string, string> = { ...range };
    if (branchId) p.branch_id = branchId;
    return p;
  }, [range, branchId]);

  useEffect(() => {
    if (!params) {
      // Свой диапазон выбран, но обе даты ещё не введены — ничего не грузим,
      // не показываем ни спиннер, ни пустые блоки как ошибку.
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      analyticsApi.revenue(params),
      analyticsApi.profitability(params),
      analyticsApi.debtors(params),
      analyticsApi.revenueForecast(params),
    ])
      .then(([r, p, d, f]) => {
        if (cancelled) return;
        setRevenue(r);
        setProfitability(p);
        setDebtors(d);
        setForecast(f);
      })
      .catch((e) => {
        if (cancelled) return;
        toast.error(apiErrorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params]);

  const handleExport = async (kind: "excel" | "pdf") => {
    if (exporting || !params) return;
    setExporting(kind);
    try {
      const { exportReport } = await import("@/lib/api");
      await exportReport(kind, { report_type: "finance_analytics", ...params });
      toast.success(lang === "uz" ? "Fayl yuklandi" : "Файл скачан");
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setExporting(null);
    }
  };

  if (loading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">{t("common.loading")}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={preset} onValueChange={(v) => setPreset(v as PeriodPreset)}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="month">{t("financeAnalytics.periodThisMonth")}</SelectItem>
            <SelectItem value="quarter">{t("financeAnalytics.periodQuarter")}</SelectItem>
            <SelectItem value="half_year">{t("financeAnalytics.periodSixMonths")}</SelectItem>
            <SelectItem value="year">{t("financeAnalytics.periodYear")}</SelectItem>
            <SelectItem value="custom">{t("financeAnalytics.periodCustom")}</SelectItem>
          </SelectContent>
        </Select>
        {preset === "custom" && (
          <div className="flex items-center gap-2">
            <DateInput
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              maxDate={customTo || undefined}
            />
            <span className="text-sm text-muted-foreground">—</span>
            <DateInput
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              minDate={customFrom || undefined}
            />
          </div>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" disabled={!!exporting || !params} onClick={() => handleExport("excel")}>
            <Download className="size-3.5 mr-1" /> {t("financeAnalytics.exportExcel")}
          </Button>
          <Button variant="outline" size="sm" disabled={!!exporting || !params} onClick={() => handleExport("pdf")}>
            <Download className="size-3.5 mr-1" /> {t("financeAnalytics.exportPdf")}
          </Button>
        </div>
      </div>

      {preset === "custom" && !params && (
        <div className="text-sm text-muted-foreground">
          {lang === "uz" ? "Ikkala sanani ham kiriting" : "Укажите обе даты диапазона"}
        </div>
      )}

      <Card className="p-6 shadow-elegant">
        <h3 className="mb-4 text-base font-semibold">{t("director.monthlyRevenue")}</h3>
        {revenueByDayChart.length ? (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={revenueByDayChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              <Line type="monotone" dataKey="total" stroke="var(--chart-1)" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChartState label={lang === "uz" ? "Ma'lumot yo'q" : "Данных нет"} />
        )}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <BreakdownTable title={t("financeAnalytics.byBranch")} rows={revenue?.by_branch ?? []} nameKey="branch_name" lang={lang} />
          <BreakdownTable title={t("financeAnalytics.byCourse")} rows={revenue?.by_course ?? []} nameKey="course_name" lang={lang} />
          <BreakdownTable title={t("financeAnalytics.byTeacher")} rows={revenue?.by_teacher ?? []} nameKey="teacher_name" lang={lang} />
        </div>
      </Card>

      <Card className="p-6 shadow-elegant">
        <h3 className="mb-4 text-base font-semibold">{t("financeAnalytics.profitMargin")}</h3>
        {profitabilityByBranchChart.length ? (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={profitabilityByBranchChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="profit" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChartState label={lang === "uz" ? "Ma'lumot yo'q" : "Данных нет"} />
        )}
        <div className="mt-6">
          <BreakdownTable
            title={t("financeAnalytics.expenseByCategory")}
            rows={profitability?.expense_by_category ?? []}
            nameKey="category"
            lang={lang}
          />
        </div>
      </Card>

      <Card className="p-6 shadow-elegant">
        <h3 className="mb-4 text-base font-semibold">{t("financeAnalytics.debtCollection")}</h3>
        <div className="mb-4 text-2xl font-bold tabular-nums">
          {debtors?.collection_rate ?? "0"}% <span className="text-sm font-normal text-muted-foreground">{t("financeAnalytics.collectionRate")}</span>
        </div>
        {debtors?.results?.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("finance.col.student")}</TableHead>
                <TableHead className="text-right">{t("students.col.balance")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {debtors.results.map((row: any) => (
                <TableRow key={row.student_id}>
                  <TableCell>{row.full_name}</TableCell>
                  <TableCell className="text-right text-destructive">{formatMoney(Number(row.wallet_balance), lang)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyChartState label={lang === "uz" ? "Qarzdorlar yo'q" : "Должников нет"} />
        )}
      </Card>

      <Card className="p-6 shadow-elegant">
        <h3 className="mb-2 text-base font-semibold">{t("financeAnalytics.forecastNextMonth")}</h3>
        <div className="text-3xl font-bold tabular-nums text-primary">
          {formatMoney(Number(forecast?.forecast_revenue ?? 0), lang)}
        </div>
        <div className="mt-2 text-sm text-muted-foreground">
          {formatMoney(Number(forecast?.potential_revenue ?? 0), lang)} × ({100 - Number(forecast?.shortfall_rate_percent ?? 0)}%)
        </div>
        {forecast && !forecast.has_sufficient_history && (
          <div className="mt-3 flex items-center gap-2 text-xs text-warn">
            <AlertCircle className="size-3.5" /> {t("financeAnalytics.forecastInsufficientHistory")}
          </div>
        )}
      </Card>
    </div>
  );
}

function BreakdownTable({ title, rows, nameKey, lang }: { title: string; rows: any[]; nameKey: string; lang: string }) {
  return (
    <div>
      <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</div>
      {rows.length === 0 ? (
        <div className="text-xs text-muted-foreground">{lang === "uz" ? "Ma'lumot yo'q" : "Данных нет"}</div>
      ) : (
        <div className="space-y-1.5">
          {rows.slice(0, 5).map((row, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="truncate text-foreground">{row[nameKey]}</span>
              <span className="shrink-0 font-medium tabular-nums">{formatMoney(Number(row.total), lang)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyChartState({ label }: { label: string }) {
  return (
    <div className="flex h-[200px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-6 text-center">
      <AlertCircle className="size-8 text-muted-foreground" />
      <div className="mt-3 text-sm font-medium text-foreground">{label}</div>
    </div>
  );
}
```

**Важно про `exportReport`:** этой функции в `src/lib/api.ts` ещё нет. Нужна
отдельная функция, а не `requestJson` — `requestJson` всегда вызывает
`res.json()` (`api.ts:202`), а `POST /export/excel/`/`POST /export/pdf/`
отдают бинарный файл (`blob`). `API_BASE_URL`, `getTenantSchema()`,
`readAccessToken()` — уже существующие экспорты этого же файла
(`api.ts:7,61,93`), используются как есть, тем же способом, что и внутри
`requestJson` (`api.ts:141-149`). 401-ретрай с обновлением токена (как в
`requestJson:172-193`) сознательно не дублируется — экспорт инициируется
пользователем по клику, а не фоновым запросом, поэтому при истёкшем токене
достаточно показать ошибку тостом и дать нажать кнопку ещё раз после того,
как токен обновится на следующем обычном запросе.

- [ ] **Step 2: Добавить `exportReport` в `src/lib/api.ts`**

Рядом с `analyticsApi` (после него, экспортируемая отдельно функция):

```typescript
export async function exportReport(
  kind: "excel" | "pdf",
  payload: Record<string, string>,
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Tenant-Schema": getTenantSchema(),
  };
  const access = readAccessToken();
  if (access) headers.Authorization = `Bearer ${access}`;

  const res = await fetch(`${API_BASE_URL}/export/${kind}/`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Export failed: ${res.status}`);
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `finance_analytics_report.${kind === "excel" ? "xlsx" : "pdf"}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
```

- [ ] **Step 3: Собрать**

Run: `npm run build`
Expected: чисто. Дополнительно проверить блоуаут-паттерны (design-system
skill): `grid-cols-1 lg:grid-cols-3` уже с базовым классом — ок.

- [ ] **Step 4: Коммит**

```bash
git add src/components/edu/finance-analytics-tab.tsx src/lib/api.ts
git commit -m "feat(analytics): add FinanceAnalyticsTab component"
```

---

### Task 13: Встроить вкладки в `director/analytics.tsx`

**Files:**
- Modify: `src/routes/director/analytics.tsx`

- [ ] **Step 1: Обернуть существующий контент в `Tabs`**

Импорт добавить:
```typescript
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FinanceAnalyticsTab } from "@/components/edu/finance-analytics-tab";
```

В `return` компонента `AnalyticsPage`, обернуть текущий `<div className="space-y-6">...</div>`
(весь существующий JSX без единого изменения внутри) в:

```tsx
  return (
    <PageShell title={t("nav.analytics")} subtitle={t("director.subtitle")}>
      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">{t("financeAnalytics.overviewTab")}</TabsTrigger>
          <TabsTrigger value="finance">{t("financeAnalytics.tab")}</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <div className="space-y-6">
            {/* ...весь существующий JSX страницы (KPI-карточки, 4 графика, SmallStat) без изменений... */}
          </div>
        </TabsContent>
        <TabsContent value="finance">
          <FinanceAnalyticsTab />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
```

Верхний `<PageShell title=... subtitle=...>` остаётся ровно один — сейчас он
уже оборачивает `<div className="space-y-6">`, после правки он оборачивает
`<Tabs>`, а `<div className="space-y-6">` просто перемещается на один
уровень внутрь `TabsContent value="overview"`, без изменения содержимого.

На этой странице сейчас нет переключателя филиала — `AnalyticsPage` берёт
из `useData()` только `students, groups, courses, branches, payments,
attendance, staff, isLoading`, без какого-либо `selectedBranchId`/фильтра.
Заводить его специально ради этой задачи не нужно (спека допускает
переключатель филиала как деталь именно вкладки «Финансы», не обязательно
всей страницы) — `<FinanceAnalyticsTab />` вызывается без пропа `branchId`,
директор видит данные сразу по всем филиалам, как и на остальной части этой
страницы сейчас.

- [ ] **Step 2: Собрать и проверить**

Run: `npm run build`
Expected: чисто.

- [ ] **Step 3: Коммит**

```bash
git add src/routes/director/analytics.tsx
git commit -m "feat(director): add Finance tab to analytics page"
```

---

### Task 14: Встроить вкладки в `admin/analytics.tsx`

**Files:**
- Modify: `src/routes/admin/analytics.tsx`

- [ ] **Step 1: Тот же паттерн, что в Task 13**

Идентичная обёртка `Tabs`/`TabsList`/`TabsContent` вокруг существующего
JSX функции `AdminAnalytics`. У admin/branch_admin нет выбора филиала на
уровне страницы (бэкенд уже сам сужает `branch_ids_for_user` до одного
филиала для этой роли) — `<FinanceAnalyticsTab />` вызывается без `branchId`.

- [ ] **Step 2: Собрать**

Run: `npm run build`
Expected: чисто.

- [ ] **Step 3: Коммит**

```bash
git add src/routes/admin/analytics.tsx
git commit -m "feat(admin): add Finance tab to analytics page"
```

---

### Task 15: Playwright — CSS-риски новой вкладки (статический моунт, без логина)

**Важное открытие при подготовке плана:** в этом проекте НЕТ логин-хелпера
для Playwright и ни один существующий спек не заходит в систему — все
авторизованные экраны живут за аутентификацией, поэтому риски CSS
(блоуаут, схлопывание сетки) проверяются на статической разметке,
смонтированной поверх публичной `/` через `page.evaluate` (см.
`e2e/table-cards.spec.ts`, `e2e/login-page.spec.ts` — оба явно
документируют эту причину в комментариях). Ранняя версия этого плана
предполагала `page.goto("/director/analytics")` с реальным логином — это
было ошибкой, нет инфраструктуры под это. Тестируем не данные (они и так
покрыты бэкенд-тестами Task 1-8), а именно CSS-механизм: 3-колоночная
сетка разрезов (`grid-cols-1 lg:grid-cols-3`) не должна расползаться на
375px, экспорт-кнопки в шапке не должны вылезать за край.

**Files:**
- Create: `e2e/finance-analytics-tab.spec.ts`

- [ ] **Step 1: Написать сценарий по образцу `table-cards.spec.ts`**

```typescript
import { expect, test } from "@playwright/test";

/**
 * Вкладка «Финансы» живёт за авторизацией, поэтому здесь проверяется не
 * реальный экран, а представительная разметка теми же классами
 * (`grid grid-cols-1 lg:grid-cols-3`, `TabsList` с двумя вкладками) —
 * тот же приём, что и в table-cards.spec.ts. Риск, который ловит этот
 * тест: базовый `grid-cols-1` перед `lg:grid-cols-3` (без него — тот самый
 * blowout-паттерн из PR #17), и что шапка с переключателем периода +
 * двумя кнопками экспорта не вылезает за 375px.
 */

const FINANCE_TAB_HTML = `
<div id="probe" style="width:100%">
  <div class="flex h-9 items-center gap-1 rounded-lg bg-muted p-1" role="tablist">
    <button role="tab">Обзор</button>
    <button role="tab" aria-selected="true">Финансы</button>
  </div>
  <div class="flex flex-wrap items-center justify-between gap-3 mt-4">
    <div style="width:180px" class="h-9 rounded-md border"></div>
    <div class="flex gap-2">
      <button class="h-9 px-3 rounded-md border">Экспорт в Excel</button>
      <button class="h-9 px-3 rounded-md border">Экспорт в PDF</button>
    </div>
  </div>
  <div class="grid grid-cols-1 gap-6 lg:grid-cols-3 mt-6">
    <div style="min-height:120px" class="rounded-lg border p-3">По филиалам</div>
    <div style="min-height:120px" class="rounded-lg border p-3">По курсам</div>
    <div style="min-height:120px" class="rounded-lg border p-3">По учителям</div>
  </div>
</div>`;

async function mount(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.evaluate((html) => {
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:0;top:0;width:100%;z-index:99999";
    host.innerHTML = html;
    document.body.appendChild(host);
  }, FINANCE_TAB_HTML);
}

test("вкладки и шапка с экспортом не вызывают горизонтальную прокрутку", async ({ page }) => {
  await mount(page);

  const docOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );

  expect(
    docOverflow,
    "страница не должна получать горизонтальную прокрутку от TabsList/шапки экспорта",
  ).toBeLessThanOrEqual(0);
});

test("сетка разрезов схлопывается в одну колонку на узком экране", async ({ page }, testInfo) => {
  await mount(page);

  const result = await page.evaluate(() => {
    const grid = document.querySelector("#probe > .grid") as HTMLElement;
    const style = getComputedStyle(grid);
    return {
      narrow: window.matchMedia("(max-width: 1023px)").matches,
      columnCount: style.gridTemplateColumns.split(" ").length,
    };
  });

  if (testInfo.project.name === "mobile") {
    expect(result.narrow, 'профиль "mobile" обязан попадать в max-width: 1023px (lg breakpoint)').toBe(true);
  }

  if (result.narrow) {
    expect(result.columnCount, "на телефоне сетка разрезов должна быть в одну колонку").toBe(1);
  } else {
    expect(result.columnCount, "на десктопе — три колонки разрезов рядом").toBe(3);
  }
});
```

- [ ] **Step 2: Запустить в обоих профилях (desktop + mobile из `playwright.config.ts`)**

Run: `npx playwright test e2e/finance-analytics-tab.spec.ts`
Expected: 4 passed (2 теста × 2 профиля).

- [ ] **Step 3: Коммит**

```bash
git add e2e/finance-analytics-tab.spec.ts
git commit -m "test(e2e): guard Finance tab grid/header against mobile overflow"
```

---

### Task 16: Финальный целостный ревью и полная проверка

**Files:** нет новых, только верификация всего диапазона `feature/financial-analytics`.

- [ ] **Step 1: Полный набор проверок**

```bash
cd backend
python manage.py check
python manage.py makemigrations --check --dry-run
cd ..

python -m pytest backend/tests -q
npm run build
npx tsc --noEmit
npx playwright test
```

Expected:
- `makemigrations --check --dry-run` → "No changes detected" (в этой фиче
  нет изменений моделей — если что-то показывает диф, это ошибка, искать
  случайно задетое поле модели).
- `pytest backend/tests` — без новых падений сверх известного базового уровня.
- `npm run build` — чисто.
- `tsc --noEmit` — тот же базовый уровень ошибок, что и на момент начала
  ветки (см. `CLAUDE.md`), без новых.
- Playwright — все зелёные, включая новый спек из Task 15.

- [ ] **Step 2: Целостный ревью всего диапазона**

Перечитать весь `git diff master...feature/financial-analytics` целиком —
особое внимание:
- Не тронута ли вкладка «Обзор» на обеих страницах (`director/analytics.tsx`,
  `admin/analytics.tsx`) — JSX внутри `TabsContent value="overview"` должен
  быть побайтово идентичен тому, что было до Task 13/14.
- Скоуп по филиалу (`branch_ids_for_user`) применён во всех пяти
  бэкенд-функциях, включая новые — не пропущен ли он где-то при копировании
  паттерна.
- Сопоставление имён по строковым id в `get_profitability_report` не путает
  филиалы/курсы местами.
- Кнопки экспорта реально дизейблятся на время запроса и пока произвольный
  диапазон дат не заполнен (`disabled={!!exporting || !params}`)
  — тот же принцип защиты от двойного клика, что применяется ко всем денежным
  операциям в проекте.

Если найдены проблемы — исправить и повторить Step 1 для затронутых частей.

- [ ] **Step 3: Обновить `CLAUDE.md`**

Добавить секцию "Финансовая аналитика — влито" по образцу существующих
секций (архитектура, что переиспользовано из уже существующих отчётов,
что добавлено, проверки) — не копировать текст спеки дословно, а
резюмировать так же коротко, как остальные записи в файле.

- [ ] **Step 4: Коммит документации**

```bash
git add CLAUDE.md
git commit -m "docs: record financial analytics feature"
```

---

### Task 17: Мерж и деплой

**Files:** нет изменений кода — только git-операции.

- [ ] **Step 1: Слить в master**

```bash
git checkout master
git merge --ff-only feature/financial-analytics
```

Если fast-forward невозможен (master ушёл вперёд за время работы) —
остановиться и разобраться, не форсировать.

- [ ] **Step 2: Запушить**

```bash
git push origin master
```

- [ ] **Step 3: Синхронизировать staging**

```bash
git checkout staging
git merge --ff-only master
git push origin staging
git checkout master
```

- [ ] **Step 4: Проверить прод-деплой**

Через Railway MCP (`environment-status`, `get-logs` с фильтром по
миграциям/health-check) — подтвердить, что оба сервиса (`educrm`,
`rare-elegance`) задеплоились без ошибок. Миграций в этой фиче нет, поэтому
проверка миграций на этот раз не нужна — только сборка и health-check.

- [ ] **Step 5: Финальное сообщение владельцу**

Кратко: что добавлено (вкладка «Финансы», 4 блока), что уже было
переиспользовано с бэкенда, что проверено, ссылка на спеку/план.

---

## Явно не входит в объём

Сводная аналитика по центру, отток/удержание, загрузка кабинетов — следующие
отдельные заходы, каждый со своей спекой (см. спеку, раздел "Явно не входит
в объём").
