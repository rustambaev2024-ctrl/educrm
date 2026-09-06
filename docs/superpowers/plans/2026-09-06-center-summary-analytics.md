# Сводная аналитика по центру — план реализации

> **Для агентных исполнителей:** ОБЯЗАТЕЛЬНЫЙ ПОДСКИЛ: используйте
> superpowers:subagent-driven-development. Шаги отмечены чекбоксами.

**Цель:** Заменить клиентски считаемое содержимое вкладки «Обзор» на
серверную сводную аналитику по центру — посещаемость с трендом, динамика
набора/оттока, заполненность групп с трендом, ряд KPI.

**Архитектура:** `backend/apps/reports/services.py` — одна расширенная
функция (`get_attendance_report` + `by_day`), две новые
(`get_enrollment_trend`, `get_occupancy_trend`), один фикс утечки скоупа
(`get_teachers_report`), `get_overview` берётся как есть. Без миграций.
Фронтенд — новый общий компонент `center-summary-tab.tsx` по образцу уже
отработанного `finance-analytics-tab.tsx`.

**Стек:** Django REST Framework, React + recharts, существующий
`exporters.py`.

Спека: `docs/superpowers/specs/2026-09-06-center-summary-analytics-design.md`.

Ветка: `feature/center-summary-analytics` (создана, спека уже закоммичена).

Тесты гоняются из корня репозитория: `python -m pytest backend/tests/... -v`
(`pytest.ini` в корне, `pythonpath = backend`). `manage.py`-команды — из
`backend/`.

---

### Task 1: `get_attendance_report` — тренд по дням

**Files:**
- Modify: `backend/apps/reports/services.py:150-185`
- Test: `backend/tests/test_center_summary.py` (новый файл)

- [ ] **Step 1: Написать падающие тесты**

```python
# backend/tests/test_center_summary.py
import pytest
from datetime import date, timedelta
from decimal import Decimal

from django.utils import timezone

from tests.factories import (
    BranchFactory, CourseFactory, GroupFactory, GroupMembershipFactory,
    LessonFactory, StaffFactory, StudentFactory, UserFactory,
)

pytestmark = pytest.mark.django_db


def _director():
    return UserFactory(role="director")


def _wide_filters(branch_id=None):
    from apps.reports.services import ReportFilters
    return ReportFilters(date_from=date(2000, 1, 1), date_to=date(2100, 1, 1), branch_id=branch_id)


def _filters(date_from, date_to, branch_id=None):
    from apps.reports.services import ReportFilters
    return ReportFilters(date_from=date_from, date_to=date_to, branch_id=branch_id)


class TestAttendanceTrend:
    def test_by_day_uses_same_rule_as_overall_rate(self):
        from apps.lessons.models import Attendance
        from apps.reports.services import get_attendance_report

        branch = BranchFactory()
        group = GroupFactory(branch=branch)
        lesson_day = timezone.now().replace(hour=10, minute=0, second=0, microsecond=0)
        lesson = LessonFactory(group=group, datetime=lesson_day)
        s1 = StudentFactory(branch=branch)
        s2 = StudentFactory(branch=branch)
        s3 = StudentFactory(branch=branch)
        Attendance.objects.create(lesson=lesson, student=s1, status="present")
        Attendance.objects.create(lesson=lesson, student=s2, status="absent")
        # excused не входит ни в числитель, ни в знаменатель — как и в overall_rate
        Attendance.objects.create(lesson=lesson, student=s3, status="excused")

        report = get_attendance_report(_director(), _wide_filters())

        assert report["overall_rate"] == "50.00"
        day_row = next(r for r in report["by_day"] if r["day"] == str(lesson_day.date()))
        assert day_row["attendance_rate"] == "50.00"
        assert day_row["present_records"] == 1
        assert day_row["total_records"] == 2

    def test_by_day_empty_when_no_attendance(self):
        from apps.reports.services import get_attendance_report

        BranchFactory()

        report = get_attendance_report(_director(), _wide_filters())

        assert report["by_day"] == []
```

- [ ] **Step 2:** Run: `python -m pytest backend/tests/test_center_summary.py::TestAttendanceTrend -v`
      Expected: FAIL — `KeyError: 'by_day'`.

- [ ] **Step 3: Реализовать**

В `get_attendance_report`, перед финальным `return`, добавить:

```python
    # Тренд по дням — тем же правилом, что и overall_rate: числитель
    # ATTENDANCE_PRESENT_STATUSES, знаменатель ATTENDANCE_COUNTED_STATUSES
    # (уважительные исключены из обоих). Считается двумя сгруппированными
    # запросами вместо цикла по дням: дней в году 365, а запросов должно
    # остаться два.
    present_by_day = {
        row["day"]: row["count"]
        for row in attendance_qs.filter(status__in=ATTENDANCE_PRESENT_STATUSES)
        .annotate(day=TruncDate("lesson__datetime"))
        .values("day")
        .annotate(count=Count("id"))
    }
    counted_by_day = {
        row["day"]: row["count"]
        for row in attendance_qs.filter(status__in=ATTENDANCE_COUNTED_STATUSES)
        .annotate(day=TruncDate("lesson__datetime"))
        .values("day")
        .annotate(count=Count("id"))
    }
    by_day = [
        {
            "day": str(day),
            "present_records": present_by_day.get(day, 0),
            "total_records": counted_by_day[day],
            "attendance_rate": str(_percentage(present_by_day.get(day, 0), counted_by_day[day])),
        }
        for day in sorted(counted_by_day)
    ]
```

И добавить `"by_day": by_day,` в возвращаемый словарь.

`TruncDate` и `Count` уже импортированы в этом файле (используются в
`get_revenue_report`). `ATTENDANCE_PRESENT_STATUSES`/
`ATTENDANCE_COUNTED_STATUSES` уже импортированы из `apps.core.definitions`.

- [ ] **Step 4:** Run tests, expect PASS (2 passed).

- [ ] **Step 5: Коммит**

```bash
git add backend/apps/reports/services.py backend/tests/test_center_summary.py
git commit -m "feat(reports): add by_day attendance trend to attendance report"
```

---

### Task 2: Фикс утечки скоупа по филиалу в `get_teachers_report`

**Files:**
- Modify: `backend/apps/reports/services.py:420-454`
- Test: `backend/tests/test_center_summary.py`

Известная проблема, зафиксированная в `CLAUDE.md` при работе над финансами:
аннотации `present_count`, `absent_count`, `late_count`, `_avg_late`
считаются без `lessons__group__branch_id__in=branch_ids`, тогда как соседняя
`students_count` (строка 459) этот фильтр применяет. Учитель с группой в
чужом филиале протаскивает её посещаемость в цифры `branch_admin`.

- [ ] **Step 1: Написать падающий тест**

```python
class TestTeachersReportBranchLeak:
    def test_attendance_counts_do_not_leak_across_branches(self):
        from apps.lessons.models import Attendance
        from apps.reports.services import get_teachers_report

        own_branch = BranchFactory()
        other_branch = BranchFactory()
        branch_admin_user = UserFactory(role="branch_admin")
        teacher = StaffFactory(user=UserFactory(role="teacher"), branch=own_branch)
        StaffFactory(user=branch_admin_user, branch=own_branch)

        # Группа того же учителя, но в ЧУЖОМ филиале, с посещаемостью
        other_group = GroupFactory(branch=other_branch, teacher=teacher)
        other_lesson = LessonFactory(group=other_group, teacher=teacher, datetime=timezone.now())
        student = StudentFactory(branch=other_branch)
        Attendance.objects.create(lesson=other_lesson, student=student, status="present")

        report = get_teachers_report(branch_admin_user, _wide_filters())

        row = next((r for r in report["results"] if r["teacher_id"] == str(teacher.id)), None)
        assert row is not None, "учитель своего филиала должен быть в отчёте"
        assert row["present_count"] == 0, "посещаемость чужого филиала не должна течь в цифры"
        assert row["absent_count"] == 0
```

Примечание для исполнителя: у `LessonFactory` поле `teacher` может
отсутствовать в фабрике — если так, передавать его не нужно, связь урока с
учителем в этом тесте идёт через `Group.teacher`, а аннотации ходят по
`lessons__...` (обратная связь `Staff.lessons`). Прочитать
`backend/tests/factories.py::LessonFactory` перед написанием теста и
использовать реально существующие поля; если `Lesson.teacher` в модели есть,
а в фабрике нет — передать явно.

- [ ] **Step 2:** Run: `python -m pytest backend/tests/test_center_summary.py::TestTeachersReportBranchLeak -v`
      Expected: FAIL — `present_count == 1`, а не 0.

- [ ] **Step 3: Реализовать**

В четыре аннотации (`present_count`, `absent_count`, `late_count`,
`_avg_late`) добавить в их `Q(...)` тот же фильтр, что уже есть у
`students_count`:

```python
                lessons__group__branch_id__in=branch_ids,
```

Пример для `present_count` (остальные три — по тому же образцу):

```python
        present_count=Count(
            "lessons__attendance",
            filter=Q(
                lessons__attendance__status__in=ATTENDANCE_PRESENT_STATUSES,
                lessons__datetime__date__gte=filters.date_from,
                lessons__datetime__date__lte=filters.date_to,
                lessons__group__branch_id__in=branch_ids,
            ),
            distinct=True,
        ),
```

- [ ] **Step 4:** Run tests, expect PASS. Затем прогнать существующие тесты
      этой функции, чтобы фикс ничего не сломал:
      `python -m pytest backend/tests/test_financial_analytics.py -v`
      Expected: все зелёные (там есть тесты на `revenue_total` и скоуп).

- [ ] **Step 5: Коммит**

```bash
git add backend/apps/reports/services.py backend/tests/test_center_summary.py
git commit -m "fix(reports): stop attendance counts leaking across branches in teachers report"
```

---

### Task 3: Новая `get_enrollment_trend`

**Files:**
- Modify: `backend/apps/reports/services.py`
- Test: `backend/tests/test_center_summary.py`

- [ ] **Step 1: Написать падающие тесты**

```python
class TestEnrollmentTrend:
    def test_new_students_counted_in_registration_month(self):
        from apps.reports.services import get_enrollment_trend
        from apps.students.models import Student

        branch = BranchFactory()
        student = StudentFactory(branch=branch)
        # registered_at — auto_now_add, поэтому для детерминированного месяца
        # переписываем его напрямую через queryset.update (обходит auto_now_add)
        moment = timezone.now().replace(year=2026, month=3, day=15)
        Student.objects.filter(id=student.id).update(registered_at=moment)

        report = get_enrollment_trend(_director(), _filters(date(2026, 1, 1), date(2026, 12, 31)))

        row = next(r for r in report["results"] if r["month"] == "2026-03")
        assert row["enrolled"] == 1

    def test_transfer_between_groups_is_not_churn(self):
        from apps.reports.services import get_enrollment_trend

        branch = BranchFactory()
        group_a = GroupFactory(branch=branch)
        group_b = GroupFactory(branch=branch)
        student = StudentFactory(branch=branch)
        left_moment = timezone.now().replace(year=2026, month=3, day=10)
        # Ушёл из A, но остался в B — это перевод, не отток.
        GroupMembershipFactory(group=group_a, student=student, left_at=left_moment)
        GroupMembershipFactory(group=group_b, student=student, left_at=None)

        report = get_enrollment_trend(_director(), _filters(date(2026, 1, 1), date(2026, 12, 31)))

        row = next(r for r in report["results"] if r["month"] == "2026-03")
        assert row["churned"] == 0

    def test_student_leaving_last_group_counts_as_churn(self):
        from apps.reports.services import get_enrollment_trend

        branch = BranchFactory()
        group = GroupFactory(branch=branch)
        student = StudentFactory(branch=branch)
        left_moment = timezone.now().replace(year=2026, month=4, day=20)
        GroupMembershipFactory(group=group, student=student, left_at=left_moment)

        report = get_enrollment_trend(_director(), _filters(date(2026, 1, 1), date(2026, 12, 31)))

        row = next(r for r in report["results"] if r["month"] == "2026-04")
        assert row["churned"] == 1

    def test_months_without_events_are_present_as_zeros(self):
        from apps.reports.services import get_enrollment_trend

        BranchFactory()

        report = get_enrollment_trend(_director(), _filters(date(2026, 1, 1), date(2026, 3, 31)))

        months = [r["month"] for r in report["results"]]
        assert months == ["2026-01", "2026-02", "2026-03"]
        assert all(r["enrolled"] == 0 and r["churned"] == 0 for r in report["results"])
```

- [ ] **Step 2:** Run, expect FAIL — `ImportError: cannot import name 'get_enrollment_trend'`.

- [ ] **Step 3: Реализовать**

Сначала добавить общий помощник рядом с `_percentage`/`_quantize`:

```python
def _months_in_range(date_from: date, date_to: date) -> list[str]:
    """Ключи «YYYY-MM» по всем месяцам периода включительно.

    Месяцы без событий должны присутствовать в тренде нулями, иначе на
    графике провал выглядит как отсутствие данных, а не как настоящий ноль.
    """
    months = []
    year, month = date_from.year, date_from.month
    while (year, month) <= (date_to.year, date_to.month):
        months.append(f"{year:04d}-{month:02d}")
        month += 1
        if month > 12:
            year, month = year + 1, 1
    return months
```

Затем саму функцию (после `get_attendance_report`):

```python
def get_enrollment_trend(user, filters: ReportFilters) -> dict:
    branch_ids = branch_ids_for_user(user, filters.branch_id)

    enrolled_by_month = {
        row["month"].strftime("%Y-%m"): row["count"]
        for row in Student.objects.filter(
            branch_id__in=branch_ids,
            registered_at__date__gte=filters.date_from,
            registered_at__date__lte=filters.date_to,
        )
        .annotate(month=TruncMonth("registered_at"))
        .values("month")
        .annotate(count=Count("id"))
        if row["month"]
    }

    # Отток: у ученика закрылось ПОСЛЕДНЕЕ членство и активных не осталось.
    # Перевод из группы в группу закрывает одно членство, но открывает другое —
    # такой ученик из центра не ушёл, и в отток попадать не должен.
    #
    # «Активных не осталось» проверяется на СЕГОДНЯ, а не на конец того месяца:
    # ученик, который ушёл и вернулся, в итоге не потерян, и показывать его в
    # прошлом месяце как ушедшего — вводить директора в заблуждение.
    churned_by_month: dict[str, int] = {}
    churn_candidates = (
        Student.objects.filter(branch_id__in=branch_ids)
        .annotate(
            active_memberships=Count(
                "group_memberships",
                filter=Q(group_memberships__left_at__isnull=True),
            ),
            last_left_at=Max("group_memberships__left_at"),
        )
        .filter(
            active_memberships=0,
            last_left_at__date__gte=filters.date_from,
            last_left_at__date__lte=filters.date_to,
        )
    )
    for student in churn_candidates:
        key = timezone.localtime(student.last_left_at).strftime("%Y-%m")
        churned_by_month[key] = churned_by_month.get(key, 0) + 1

    results = [
        {
            "month": month,
            "enrolled": enrolled_by_month.get(month, 0),
            "churned": churned_by_month.get(month, 0),
        }
        for month in _months_in_range(filters.date_from, filters.date_to)
    ]

    return {
        "period": {"date_from": str(filters.date_from), "date_to": str(filters.date_to)},
        "total_enrolled": sum(r["enrolled"] for r in results),
        "total_churned": sum(r["churned"] for r in results),
        "results": results,
    }
```

Импорты наверху файла: добавить `Max` к списку из `django.db.models`
(`from django.db.models import Avg, Case, Count, DecimalField, F, Max, Q, Sum, Value, When`)
и `TruncMonth` к `django.db.models.functions`
(`from django.db.models.functions import Coalesce, TruncDate, TruncMonth`).

- [ ] **Step 4:** Run tests, expect PASS (4 passed).

- [ ] **Step 5: Коммит**

```bash
git add backend/apps/reports/services.py backend/tests/test_center_summary.py
git commit -m "feat(reports): add get_enrollment_trend (new students vs churn per month)"
```

---

### Task 4: Новая `get_occupancy_trend`

**Files:**
- Modify: `backend/apps/reports/services.py`
- Test: `backend/tests/test_center_summary.py`

- [ ] **Step 1: Написать падающие тесты**

```python
class TestOccupancyTrend:
    def test_membership_open_at_month_end_counts(self):
        from apps.reports.services import get_occupancy_trend

        branch = BranchFactory()
        group = GroupFactory(branch=branch, status="active", capacity=10)
        student = StudentFactory(branch=branch)
        from apps.courses.models import GroupMembership
        membership = GroupMembershipFactory(group=group, student=student, left_at=None)
        GroupMembership.objects.filter(id=membership.id).update(
            enrolled_at=timezone.now().replace(year=2026, month=2, day=10)
        )

        report = get_occupancy_trend(_director(), _filters(date(2026, 1, 1), date(2026, 3, 31)))

        by_month = {r["month"]: r for r in report["results"]}
        assert by_month["2026-01"]["occupied"] == 0, "до вступления место не занято"
        assert by_month["2026-02"]["occupied"] == 1
        assert by_month["2026-03"]["occupied"] == 1
        assert by_month["2026-02"]["capacity"] == 10
        assert by_month["2026-02"]["occupancy_percent"] == "10.00"

    def test_membership_closed_before_month_end_does_not_count(self):
        from apps.reports.services import get_occupancy_trend
        from apps.courses.models import GroupMembership

        branch = BranchFactory()
        group = GroupFactory(branch=branch, status="active", capacity=5)
        student = StudentFactory(branch=branch)
        membership = GroupMembershipFactory(group=group, student=student)
        GroupMembership.objects.filter(id=membership.id).update(
            enrolled_at=timezone.now().replace(year=2026, month=1, day=5),
            left_at=timezone.now().replace(year=2026, month=2, day=3),
        )

        report = get_occupancy_trend(_director(), _filters(date(2026, 1, 1), date(2026, 3, 31)))

        by_month = {r["month"]: r for r in report["results"]}
        assert by_month["2026-01"]["occupied"] == 1
        assert by_month["2026-02"]["occupied"] == 0
        assert by_month["2026-03"]["occupied"] == 0

    def test_zero_capacity_does_not_divide_by_zero(self):
        from apps.reports.services import get_occupancy_trend

        BranchFactory()

        report = get_occupancy_trend(_director(), _filters(date(2026, 1, 1), date(2026, 1, 31)))

        assert report["results"][0]["capacity"] == 0
        assert report["results"][0]["occupancy_percent"] == "0.00"
```

- [ ] **Step 2:** Run, expect FAIL — `ImportError: cannot import name 'get_occupancy_trend'`.

- [ ] **Step 3: Реализовать**

`_months_in_range` уже добавлен в Task 3 — переиспользовать его, не
определять второй раз.

```python
def get_occupancy_trend(user, filters: ReportFilters) -> dict:
    from apps.courses.models import Group, GroupMembership

    branch_ids = branch_ids_for_user(user, filters.branch_id)

    # Вместимость берётся текущая: истории у Group.capacity нет, отдельную
    # таблицу снимков ради тренда не заводим. Направление (растёт/падает
    # заполняемость) от этого не искажается, абсолютный процент прошлых
    # месяцев — пересчитан по сегодняшней вместимости.
    capacity = Group.objects.filter(
        branch_id__in=branch_ids, status="active"
    ).aggregate(total=Coalesce(Sum("capacity"), 0))["total"]

    results = []
    for month in _months_in_range(filters.date_from, filters.date_to):
        year, month_number = (int(part) for part in month.split("-"))
        if month_number == 12:
            month_end = date(year, 12, 31)
        else:
            month_end = date(year, month_number + 1, 1) - timedelta(days=1)

        occupied = (
            GroupMembership.objects.filter(
                group__branch_id__in=branch_ids,
                enrolled_at__date__lte=month_end,
            )
            .filter(Q(left_at__isnull=True) | Q(left_at__date__gt=month_end))
            .count()
        )
        results.append(
            {
                "month": month,
                "occupied": occupied,
                "capacity": capacity,
                "occupancy_percent": str(_percentage(occupied, capacity)),
            }
        )

    return {
        "period": {"date_from": str(filters.date_from), "date_to": str(filters.date_to)},
        "capacity": capacity,
        "results": results,
    }
```

`timedelta` уже импортирован наверху файла (`from datetime import date, timedelta`).

- [ ] **Step 4:** Run tests, expect PASS (3 passed).

- [ ] **Step 5: Коммит**

```bash
git add backend/apps/reports/services.py backend/tests/test_center_summary.py
git commit -m "feat(reports): add get_occupancy_trend (occupied seats vs capacity per month)"
```

---

### Task 5: Скоуп по филиалу — тесты изоляции

**Files:**
- Test: `backend/tests/test_center_summary.py`

- [ ] **Step 1: Написать тесты (должны проходить сразу — это защита от регрессии)**

```python
class TestCenterSummaryBranchScoping:
    def test_enrollment_trend_excludes_other_branch(self):
        from apps.reports.services import get_enrollment_trend
        from apps.students.models import Student

        own_branch = BranchFactory()
        other_branch = BranchFactory()
        branch_admin_user = UserFactory(role="branch_admin")
        StaffFactory(user=branch_admin_user, branch=own_branch)

        student = StudentFactory(branch=other_branch)
        Student.objects.filter(id=student.id).update(
            registered_at=timezone.now().replace(year=2026, month=5, day=1)
        )

        report = get_enrollment_trend(branch_admin_user, _filters(date(2026, 1, 1), date(2026, 12, 31)))

        assert report["total_enrolled"] == 0

    def test_occupancy_trend_excludes_other_branch(self):
        from apps.reports.services import get_occupancy_trend

        own_branch = BranchFactory()
        other_branch = BranchFactory()
        branch_admin_user = UserFactory(role="branch_admin")
        StaffFactory(user=branch_admin_user, branch=own_branch)

        group = GroupFactory(branch=other_branch, status="active", capacity=20)
        GroupMembershipFactory(group=group, student=StudentFactory(branch=other_branch), left_at=None)

        report = get_occupancy_trend(branch_admin_user, _filters(date(2026, 1, 1), date(2026, 1, 31)))

        assert report["capacity"] == 0
        assert report["results"][0]["occupied"] == 0

    def test_attendance_by_day_excludes_other_branch(self):
        from apps.lessons.models import Attendance
        from apps.reports.services import get_attendance_report

        own_branch = BranchFactory()
        other_branch = BranchFactory()
        branch_admin_user = UserFactory(role="branch_admin")
        StaffFactory(user=branch_admin_user, branch=own_branch)

        group = GroupFactory(branch=other_branch)
        lesson = LessonFactory(group=group, datetime=timezone.now())
        Attendance.objects.create(lesson=lesson, student=StudentFactory(branch=other_branch), status="present")

        report = get_attendance_report(branch_admin_user, _wide_filters())

        assert report["by_day"] == []
```

Run: `python -m pytest backend/tests/test_center_summary.py::TestCenterSummaryBranchScoping -v`
Expected: PASS сразу. Если падает — одна из задач 1/3/4 не применила
`branch_ids`, вернуться и исправить, а не оставлять тест красным.

- [ ] **Step 2: Коммит**

```bash
git add backend/tests/test_center_summary.py
git commit -m "test(reports): verify branch isolation for center summary reports"
```

---

### Task 6: API — два новых эндпоинта

**Files:**
- Modify: `backend/apps/reports/views.py`, `backend/apps/reports/urls.py`, `backend/apps/reports/serializers.py`
- Test: `backend/tests/test_center_summary.py`

- [ ] **Step 1: Написать падающие тесты**

```python
class TestCenterSummaryEndpoints:
    def test_enrollment_trend_endpoint(self, api_client):
        api_client.force_authenticate(user=_director())

        response = api_client.get("/api/v1/analytics/enrollment-trend/")

        assert response.status_code == 200, response.content
        assert "results" in response.json()

    def test_occupancy_trend_endpoint(self, api_client):
        api_client.force_authenticate(user=_director())

        response = api_client.get("/api/v1/analytics/occupancy-trend/")

        assert response.status_code == 200, response.content
        assert "results" in response.json()

    def test_attendance_endpoint_includes_by_day(self, api_client):
        api_client.force_authenticate(user=_director())

        response = api_client.get("/api/v1/analytics/attendance/")

        assert response.status_code == 200, response.content
        assert "by_day" in response.json()
```

- [ ] **Step 2:** Run, expect FAIL — 404 на двух новых.

- [ ] **Step 3: Вьюхи**

В `views.py` добавить `get_enrollment_trend`, `get_occupancy_trend` в импорт
из `.services`, и после `AnalyticsRevenueForecastView`:

```python
class AnalyticsEnrollmentTrendView(AnalyticsBaseView):
    @extend_schema(parameters=[AnalyticsFilterSerializer], responses=OpenApiTypes.OBJECT)
    def get(self, request):
        return Response(get_enrollment_trend(request.user, self.get_filters(request)))


class AnalyticsOccupancyTrendView(AnalyticsBaseView):
    @extend_schema(parameters=[AnalyticsFilterSerializer], responses=OpenApiTypes.OBJECT)
    def get(self, request):
        return Response(get_occupancy_trend(request.user, self.get_filters(request)))
```

- [ ] **Step 4: Маршруты**

В `urls.py` — импорт обоих классов и после `analytics/revenue-forecast/`:

```python
    path("analytics/enrollment-trend/", AnalyticsEnrollmentTrendView.as_view(), name="analytics-enrollment-trend"),
    path("analytics/occupancy-trend/", AnalyticsOccupancyTrendView.as_view(), name="analytics-occupancy-trend"),
```

- [ ] **Step 5: Разрешить новый тип экспорта**

В `serializers.py`, `ExportRequestSerializer`:

```python
    report_type = serializers.ChoiceField(
        choices=["finance", "finance_analytics", "center_summary", "attendance", "salary", "audit"],
    )
```

- [ ] **Step 6:** Run tests, expect PASS (3 passed).

- [ ] **Step 7: Коммит**

```bash
git add backend/apps/reports/views.py backend/apps/reports/urls.py backend/apps/reports/serializers.py backend/tests/test_center_summary.py
git commit -m "feat(reports): expose enrollment-trend and occupancy-trend endpoints"
```

---

### Task 7: Экспорт `report_type="center_summary"`

**Files:**
- Modify: `backend/apps/reports/views.py` (`_build_export_payload`)
- Test: `backend/tests/test_center_summary.py`

- [ ] **Step 1: Написать падающий тест**

```python
class TestCenterSummaryExport:
    def test_export_excel_center_summary(self, api_client):
        api_client.force_authenticate(user=_director())

        response = api_client.post(
            "/api/v1/export/excel/", {"report_type": "center_summary"}, format="json"
        )

        assert response.status_code == 200, response.content
        assert response["Content-Type"] == (
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )

    def test_export_pdf_center_summary(self, api_client):
        api_client.force_authenticate(user=_director())

        response = api_client.post(
            "/api/v1/export/pdf/", {"report_type": "center_summary"}, format="json"
        )

        assert response.status_code == 200, response.content
```

- [ ] **Step 2:** Run, expect FAIL (или 200 через fallback-ветку — тогда всё
      равно реализовать, как в фиче финансов: тест проверяет статус, а
      настоящая сборка данных обязательна для реального экспорта).

- [ ] **Step 3: Реализовать**

В `_build_export_payload`, после ветки `finance_analytics`:

```python
    if report_type == "center_summary":
        overview = get_overview(user, filters)
        attendance = get_attendance_report(user, filters)
        enrollment = get_enrollment_trend(user, filters)
        occupancy = get_occupancy_trend(user, filters)
        return report_type, {
            "period": overview["period"],
            "students_total": overview["students_total"],
            "students_active": overview["students_active"],
            "debtors_count": overview["debtors_count"],
            "attendance_rate": overview["attendance_rate"],
            "attendance_overall_rate": attendance["overall_rate"],
            "total_enrolled": enrollment["total_enrolled"],
            "total_churned": enrollment["total_churned"],
            "capacity": occupancy["capacity"],
            "attendance_by_branch": attendance["results"],
            "attendance_by_day": attendance["by_day"],
            "enrollment_by_month": enrollment["results"],
            "occupancy_by_month": occupancy["results"],
        }
```

Добавить `get_enrollment_trend`, `get_occupancy_trend` в импорт из
`.services` в этом файле (если ещё не добавлены в Task 6).

- [ ] **Step 4:** Run tests, expect PASS (2 passed).

- [ ] **Step 5: Коммит**

```bash
git add backend/apps/reports/views.py backend/tests/test_center_summary.py
git commit -m "feat(reports): add center_summary export type"
```

---

### Task 8: Полный прогон бэкенда

- [ ] **Step 1:**

```bash
python -m pytest backend/tests/test_center_summary.py -v
cd backend && python manage.py check && python manage.py makemigrations --check --dry-run && cd ..
python -m pytest backend/tests -q
```

Expected: новые тесты зелёные; `makemigrations --check` → «No changes
detected» (миграций в этой работе нет); полный прогон — тот же базовый
уровень известных падений (24 в файлах, не относящихся к этой работе), без
новых. Если появились новые падения — остановиться и разобраться.

- [ ] **Step 2:** Коммит не нужен, если правок не потребовалось.

---

### Task 9: `src/lib/api.ts` — обёртки

**Files:**
- Modify: `src/lib/api.ts`

- [ ] **Step 1:** В объект `analyticsApi` (рядом с `revenueForecast`) добавить:

```typescript
  enrollmentTrend: (params?: Record<string, string>) =>
    requestJson(`/analytics/enrollment-trend/${params ? `?${new URLSearchParams(params)}` : ""}`),
  occupancyTrend: (params?: Record<string, string>) =>
    requestJson(`/analytics/occupancy-trend/${params ? `?${new URLSearchParams(params)}` : ""}`),
```

`overview` и `attendance` в `analyticsApi` уже есть — новые обёртки для них
не нужны.

- [ ] **Step 2:** Run `npm run build`. Expected: чисто.

- [ ] **Step 3: Коммит**

```bash
git add src/lib/api.ts
git commit -m "feat(api): add enrollmentTrend/occupancyTrend analytics wrappers"
```

---

### Task 10: i18n-ключи

**Files:**
- Modify: `src/lib/i18n.tsx`

- [ ] **Step 1:** Структура файла — два плоских словаря `const UZ: Dict` и
`const RU: Dict` с одинаковыми ключами вида `"section.key"`. Добавить в оба,
рядом с уже существующим блоком `financeAnalytics.*`.

В `UZ`:

```typescript
  // Center summary analytics
  "centerSummary.attendanceTrend": "Davomat dinamikasi",
  "centerSummary.attendanceByBranch": "Filiallar bo'yicha davomat",
  "centerSummary.enrollmentTrend": "Yangi o'quvchilar va ketganlar",
  "centerSummary.enrolled": "Qabul qilindi",
  "centerSummary.churned": "Ketdi",
  "centerSummary.occupancyTrend": "Guruhlar to'ldirilganligi",
  "centerSummary.occupied": "Band joylar",
  "centerSummary.capacity": "Sig'im",
  "centerSummary.studentsTotal": "Jami o'quvchilar",
  "centerSummary.studentsActive": "Faol o'quvchilar",
  "centerSummary.debtors": "Qarzdorlar",
  "centerSummary.attendanceRate": "O'rtacha davomat",
```

В `RU`:

```typescript
  // Center summary analytics
  "centerSummary.attendanceTrend": "Динамика посещаемости",
  "centerSummary.attendanceByBranch": "Посещаемость по филиалам",
  "centerSummary.enrollmentTrend": "Набор и отток",
  "centerSummary.enrolled": "Пришли",
  "centerSummary.churned": "Ушли",
  "centerSummary.occupancyTrend": "Заполненность групп",
  "centerSummary.occupied": "Занято мест",
  "centerSummary.capacity": "Вместимость",
  "centerSummary.studentsTotal": "Всего учеников",
  "centerSummary.studentsActive": "Активных учеников",
  "centerSummary.debtors": "Должников",
  "centerSummary.attendanceRate": "Средняя посещаемость",
```

Ключи периода/экспорта (`financeAnalytics.periodThisMonth`,
`financeAnalytics.exportExcel` и т.д.) переиспользуются как есть — они не
про финансы по смыслу, а про элемент управления, и заводить вторую копию с
другим префиксом было бы дублированием.

- [ ] **Step 2:** `npm run build` — чисто.

- [ ] **Step 3: Коммит**

```bash
git add src/lib/i18n.tsx
git commit -m "feat(i18n): add centerSummary translation keys"
```

---

### Task 11: Компонент `center-summary-tab.tsx`

**Files:**
- Create: `src/components/edu/center-summary-tab.tsx`

- [ ] **Step 1: Прочитать образец**

Прочитать `src/components/edu/finance-analytics-tab.tsx` целиком и
повторить его структуру: `PeriodPreset`, `localDateIso`, `presetRange`,
`numericField`, состояние загрузки/ошибки, очистка данных при неполном
произвольном диапазоне, `handleExport`, `EmptyChartState`, шапка с
`Select` + `DateInput` + кнопки экспорта. Отличается только набор запросов и
содержимое карточек.

- [ ] **Step 2: Написать компонент**

```typescript
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, AlertTriangle, Download, TrendingUp, UserCheck, Users } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Line, LineChart, Legend as ChartLegend,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { KpiCard } from "@/components/edu/kpi-card";
import { DateInput } from "@/components/edu/date-input";
import { analyticsApi, exportReport } from "@/lib/api";
import { apiErrorMessage } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";

type PeriodPreset = "month" | "quarter" | "half_year" | "year" | "custom";

interface CenterSummaryTabProps {
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

/** Проценты приходят с бэкенда строками — recharts нужны числа. */
function numericField<T extends Record<string, any>>(rows: T[], field: keyof T): (T & Record<string, number>)[] {
  return rows.map((row) => ({ ...row, [field]: Number(row[field]) }));
}

export function CenterSummaryTab({ branchId }: CenterSummaryTabProps) {
  const { t, lang } = useI18n();
  const [preset, setPreset] = useState<PeriodPreset>("half_year");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<any | null>(null);
  const [attendance, setAttendance] = useState<any | null>(null);
  const [enrollment, setEnrollment] = useState<any | null>(null);
  const [occupancy, setOccupancy] = useState<any | null>(null);
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);

  const range = useMemo(() => {
    if (preset === "custom") {
      if (!customFrom || !customTo) return null;
      return { date_from: customFrom, date_to: customTo };
    }
    return presetRange(preset);
  }, [preset, customFrom, customTo]);

  const params = useMemo(() => {
    if (!range) return null;
    const p: Record<string, string> = { ...range };
    if (branchId) p.branch_id = branchId;
    return p;
  }, [range, branchId]);

  const attendanceChart = useMemo(
    () => numericField(attendance?.by_day ?? [], "attendance_rate"),
    [attendance],
  );
  const occupancyChart = useMemo(
    () => numericField(occupancy?.results ?? [], "occupancy_percent"),
    [occupancy],
  );

  useEffect(() => {
    if (!params) {
      setOverview(null);
      setAttendance(null);
      setEnrollment(null);
      setOccupancy(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      analyticsApi.overview(params),
      analyticsApi.attendance(params),
      analyticsApi.enrollmentTrend(params),
      analyticsApi.occupancyTrend(params),
    ])
      .then(([o, a, e, oc]) => {
        if (cancelled) return;
        setOverview(o);
        setAttendance(a);
        setEnrollment(e);
        setOccupancy(oc);
      })
      .catch((e) => {
        if (cancelled) return;
        setOverview(null);
        setAttendance(null);
        setEnrollment(null);
        setOccupancy(null);
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
      await exportReport(kind, { report_type: "center_summary", ...params });
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
            <DateInput value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} maxDate={customTo || undefined} />
            <span className="text-sm text-muted-foreground">—</span>
            <DateInput value={customTo} onChange={(e) => setCustomTo(e.target.value)} minDate={customFrom || undefined} />
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={t("centerSummary.studentsTotal")} value={`${overview?.students_total ?? 0}`} icon={Users} iconColor="blue" />
        <KpiCard label={t("centerSummary.studentsActive")} value={`${overview?.students_active ?? 0}`} icon={UserCheck} iconColor="green" />
        <KpiCard label={t("centerSummary.debtors")} value={`${overview?.debtors_count ?? 0}`} icon={AlertTriangle} iconColor="amber" />
        <KpiCard label={t("centerSummary.attendanceRate")} value={`${overview?.attendance_rate ?? "0"}%`} icon={TrendingUp} iconColor="violet" />
      </div>

      <Card className="p-6 shadow-elegant">
        <h3 className="mb-4 text-base font-semibold">{t("centerSummary.attendanceTrend")}</h3>
        {attendanceChart.length ? (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={attendanceChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 100]} stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip formatter={(value: any) => [`${value}%`, ""]} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              <Line type="monotone" dataKey="attendance_rate" stroke="var(--chart-1)" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChartState label={lang === "uz" ? "Ma'lumot yo'q" : "Данных нет"} />
        )}
        <div className="mt-6">
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("centerSummary.attendanceByBranch")}
          </div>
          {attendance?.results?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{lang === "uz" ? "Filial" : "Филиал"}</TableHead>
                  <TableHead className="text-right">{t("centerSummary.attendanceRate")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attendance.results.map((row: any) => (
                  <TableRow key={row.branch_id}>
                    <TableCell>{row.branch_name}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.attendance_rate}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-xs text-muted-foreground">{lang === "uz" ? "Ma'lumot yo'q" : "Данных нет"}</div>
          )}
        </div>
      </Card>

      <Card className="p-6 shadow-elegant">
        <h3 className="mb-4 text-base font-semibold">{t("centerSummary.enrollmentTrend")}</h3>
        {enrollment?.results?.length ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={enrollment.results}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              <ChartLegend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="enrolled" name={t("centerSummary.enrolled")} fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="churned" name={t("centerSummary.churned")} fill="var(--chart-4)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChartState label={lang === "uz" ? "Ma'lumot yo'q" : "Данных нет"} />
        )}
      </Card>

      <Card className="p-6 shadow-elegant">
        <h3 className="mb-4 text-base font-semibold">{t("centerSummary.occupancyTrend")}</h3>
        {occupancyChart.length ? (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={occupancyChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 100]} stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip formatter={(value: any) => [`${value}%`, ""]} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              <Line type="monotone" dataKey="occupancy_percent" stroke="var(--chart-2)" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChartState label={lang === "uz" ? "Ma'lumot yo'q" : "Данных нет"} />
        )}
        <div className="mt-4 text-sm text-muted-foreground">
          {t("centerSummary.capacity")}: {occupancy?.capacity ?? 0}
        </div>
      </Card>
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

Примечания исполнителю:
- `exportReport` уже экспортируется из `src/lib/api.ts` (добавлен в фиче
  финансов) — импортировать, а не писать заново.
- `KpiCard` принимает `iconColor` — свериться с его реальным типом
  (`src/components/edu/kpi-card.tsx`) и использовать допустимые значения.
- Дефолтный период — `half_year`, а не `month`: у тренда по месяцам один
  месяц даёт одну точку, график выглядел бы пустым.
- Проверить блоуаут-паттерн: `grid grid-cols-2 gap-3 lg:grid-cols-4` —
  базовый класс есть, ок.

- [ ] **Step 3:** `npm run build` — чисто.

- [ ] **Step 4: Коммит**

```bash
git add src/components/edu/center-summary-tab.tsx
git commit -m "feat(analytics): add CenterSummaryTab component"
```

---

### Task 12: Заменить содержимое «Обзора» у директора

**Files:**
- Modify: `src/routes/director/analytics.tsx`

- [ ] **Step 1:** Заменить содержимое `<TabsContent value="overview">`
(строки ~106-205 — весь текущий JSX с KPI-карточками и четырьмя графиками)
на:

```tsx
        <TabsContent value="overview">
          <CenterSummaryTab />
        </TabsContent>
```

Импорт: `import { CenterSummaryTab } from "@/components/edu/center-summary-tab";`

Вкладка `finance` и каркас `Tabs` не трогаются.

- [ ] **Step 2: Удалить осиротевший код**

После замены в файле останутся неиспользуемые `useMemo`-блоки (`monthly`,
`byStatus`, `byBranch`, `courseOccupancy`), производные (`totalRevenue`,
`totalExpense`, `overdueAmount`, `activeStudents`, `activeGroups`, `attPct`,
`moneyUnit`, `hasMonthlyData` и т.п.), локальные компоненты `SmallStat`/
`EmptyChartState` и часть импортов (`recharts`, `sumIncome`/`sumExpense`,
`attendancePercentage`, `countActiveStudents`/`totalDebt`, `formatMoney`,
`KpiCard`, `Card`, иконки). Удалить всё, что стало мёртвым — не оставлять
закомментированным. `useData()` остаётся только если из него ещё что-то
используется (например `isLoading` для `PageLoadingState`); если нет —
убрать и его вместе с импортом.

`npm run build` и `npx tsc --noEmit` покажут неиспользуемое — свериться с
базовым уровнем ошибок типов (21), новых быть не должно.

- [ ] **Step 3:** `npm run build` — чисто.

- [ ] **Step 4: Коммит**

```bash
git add src/routes/director/analytics.tsx
git commit -m "feat(director): replace client-computed overview with CenterSummaryTab"
```

---

### Task 13: Заменить содержимое «Обзора» у админа

**Files:**
- Modify: `src/routes/admin/analytics.tsx`

- [ ] **Step 1:** Тот же приём, что в Task 12: `<TabsContent value="overview">`
(строки ~88-174) → `<CenterSummaryTab />`, удалить осиротевший код и импорты.

- [ ] **Step 2:** `npm run build` — чисто.

- [ ] **Step 3: Коммит**

```bash
git add src/routes/admin/analytics.tsx
git commit -m "feat(admin): replace client-computed overview with CenterSummaryTab"
```

---

### Task 14: Playwright — CSS-риски новой вкладки

**Files:**
- Create: `e2e/center-summary-tab.spec.ts`

В проекте нет логин-хелпера, авторизованные экраны тестируются статическим
моунтом разметки поверх публичной `/` (см. `e2e/table-cards.spec.ts`,
`e2e/finance-analytics-tab.spec.ts`).

- [ ] **Step 1: Написать спек**

```typescript
import { expect, test } from "@playwright/test";

/**
 * Вкладка «Обзор» живёт за авторизацией — проверяется представительная
 * разметка теми же классами, что и в CenterSummaryTab: ряд KPI
 * (`grid-cols-2 lg:grid-cols-4`) и шапка с периодом и экспортом.
 * Риск — известный blowout-паттерн проекта на 375px.
 */

const SUMMARY_HTML = `
<div id="probe" style="width:100%">
  <div class="flex flex-wrap items-center gap-3">
    <div style="width:180px" class="h-9 rounded-md border"></div>
    <div class="ml-auto flex gap-2">
      <button class="h-9 px-3 rounded-md border">Экспорт в Excel</button>
      <button class="h-9 px-3 rounded-md border">Экспорт в PDF</button>
    </div>
  </div>
  <div class="grid grid-cols-2 gap-3 lg:grid-cols-4 mt-6">
    <div style="min-height:80px" class="rounded-lg border p-3">Всего учеников</div>
    <div style="min-height:80px" class="rounded-lg border p-3">Активных учеников</div>
    <div style="min-height:80px" class="rounded-lg border p-3">Должников</div>
    <div style="min-height:80px" class="rounded-lg border p-3">Средняя посещаемость</div>
  </div>
</div>`;

async function mount(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.evaluate((html) => {
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:0;top:0;width:100%;z-index:99999";
    host.innerHTML = html;
    document.body.appendChild(host);
  }, SUMMARY_HTML);
}

test("сводка не даёт горизонтальной прокрутки", async ({ page }) => {
  await mount(page);

  const docOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );

  expect(docOverflow, "страница не должна прокручиваться вбок из-за ряда KPI").toBeLessThanOrEqual(0);
});

test("ряд KPI — две колонки на телефоне, четыре на десктопе", async ({ page }, testInfo) => {
  await mount(page);

  const result = await page.evaluate(() => {
    const grid = document.querySelector("#probe > .grid") as HTMLElement;
    return {
      narrow: window.matchMedia("(max-width: 1023px)").matches,
      columnCount: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
    };
  });

  if (testInfo.project.name === "mobile") {
    expect(result.narrow).toBe(true);
  }
  expect(result.columnCount).toBe(result.narrow ? 2 : 4);
});
```

- [ ] **Step 2:** Run: `npx playwright test e2e/center-summary-tab.spec.ts`
      Expected: 4 passed (2 теста × 2 профиля).

- [ ] **Step 3: Коммит**

```bash
git add e2e/center-summary-tab.spec.ts
git commit -m "test(e2e): guard center summary KPI grid against mobile overflow"
```

---

### Task 15: Финальный целостный ревью

- [ ] **Step 1: Полный набор проверок**

```bash
cd backend && python manage.py check && python manage.py makemigrations --check --dry-run && cd ..
python -m pytest backend/tests -q
npm run build
npx tsc --noEmit
npx playwright test
```

Expected: миграций нет; тесты — базовый уровень без новых падений;
`tsc --noEmit` — 21, без новых; Playwright — все зелёные.

- [ ] **Step 2: Целостный ревью диапазона**

`git diff master...feature/center-summary-analytics` целиком. Особое внимание:
- вкладка «Финансы» не задета ни в одном из двух файлов роутов;
- скоуп по филиалу есть в обеих новых функциях и в фиксе `get_teachers_report`;
- в `director/analytics.tsx`/`admin/analytics.tsx` не осталось мёртвого кода
  и неиспользуемых импортов после удаления старого содержимого;
- определение оттока в коде прокомментировано (перевод между группами не
  считается оттоком, «активных не осталось» проверяется на сегодня);
- проценты конвертируются `Number()` перед recharts (иначе графики пустые).

- [ ] **Step 3: Обновить `CLAUDE.md`** — добавить секцию про эту работу по
образцу секции про финансовую аналитику, и **снять** из «Известные проблемы»
пункт про утечку посещаемости в `get_teachers_report` (он закрыт в Task 2).

- [ ] **Step 4: Коммит**

```bash
git add CLAUDE.md
git commit -m "docs: record center summary analytics feature"
```

---

### Task 16: Мерж и деплой

- [ ] **Step 1:**

```bash
git checkout master
git merge --ff-only feature/center-summary-analytics
git push origin master
git checkout staging && git merge --ff-only master && git push origin staging && git checkout master
```

Если fast-forward невозможен — остановиться, не форсировать.

- [ ] **Step 2:** Проверить деплой обоих сервисов на Railway
(`educrm` = `3d6efe67-39fd-42de-8d6b-4f40e8e78420`,
`rare-elegance` = `cd22127f-1799-4f5e-984c-f071933a7f3d`,
проект `c257906f-dccd-441c-98a0-8b31d4078176`,
прод-окружение `55b51b42-34f6-4a0f-b641-c99f1e23372d`) — оба должны дойти до
`SUCCESS`, в логах бэкенда health-check `200`. Миграций в этой работе нет.

---

## Явно не входит

Лиды/конверсия, отток по причинам, загрузка кабинетов, эффективность
учителей отдельным экраном — следующие заходы.
