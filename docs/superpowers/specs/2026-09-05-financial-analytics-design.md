# Финансовая аналитика — дизайн

**Дата:** 2026-09-05
**Статус:** утверждено владельцем в диалоге, спека пишется по факту согласования (закрыть всё в текущей сессии)

## Контекст и повод

Владелец считает, что платформа отстаёт от конкурентов по аналитике — общее
ощущение нехватки цифр и разрезов, без привязки к конкретному чужому экрану.
Тема сама по себе шире одной фичи (финансы, сводка по центру, лиды, отток,
загрузка кабинетов, эффективность учителей — и это ещё не полный список), но
владелец явно попросил двигаться по одному направлению за раз, начиная с
**финансовой аналитики**. Это первый из серии независимых заходов; следующие
направления получат свой цикл спека→план→реализация отдельно.

При разведке выяснилось, что часть проблемы — не отсутствие данных, а то, что
уже посчитанное на бэкенде не выведено на экран. `backend/apps/reports/services.py`
уже содержит `get_revenue_report` (разрезы по филиалу/группе/дню),
`get_debtors_report`, `get_teachers_report` и другие — но `director/analytics.tsx`
и `admin/analytics.tsx` их не вызывают вообще, а считают четыре графика сами на
клиенте из сырых списков (`students`, `payments`, `groups`, `courses`). Эта
работа не создаёт аналитику с нуля — она достраивает то, что наполовину
готово, и выводит на экран.

## Что входит в объём (по итогам уточняющих вопросов)

Владелец выбрал все четыре направления внутри финансов — ничего не отбрасываем:

1. Выручка/расходы по разрезам (филиал, курс, учитель, категория расхода), с
   трендом во времени.
2. Прибыль и маржинальность (выручка минус расходы по тем же разрезам).
3. Долги и сбор платежей (кто должен, сколько выставлено vs собрано за период).
4. Прогноз выручки на следующий месяц (по активным ученикам, не статистическая
   модель).

Аудитория — директор и администратор/branch_admin, с тем же скоупом по
филиалу, что уже используется в остальных отчётах (`branch_ids_for_user`).
Живёт как новая вкладка «Финансы» внутри существующей страницы «Аналитика» у
обеих ролей — вкладка «Обзор» с текущими 4 графиками не меняется. Периоды —
готовые пресеты (этот месяц / квартал / 6 месяцев / год) плюс произвольный
диапазон дат. Экспорт в Excel/PDF нужен сразу, тем же механизмом, что уже
используют `daily-report`/`group-report`.

## Архитектура

### Бэкенд (`backend/apps/reports/`)

Все новые/расширенные функции живут в `services.py`, следуют уже
установленным в файле соглашениям: `ReportFilters`/`branch_ids_for_user`/
`_with_date_range`/`_quantize`/`_percentage`, скоуп по роли через
`branch_ids_for_user(user, filters.branch_id)` — ничего нового не изобретаем.

**1. `get_revenue_report()` — расширение существующей функции.**
Сейчас отдаёт `by_branch`/`by_group`/`by_day`. Добавляются:
- `by_course` — та же агрегация (`.values(...).annotate(total=net, transactions=Count("id"))`),
  группировка по `group__course_id`/`group__course__name` вместо `group_id`.
- `by_teacher` — то же самое, группировка по `group__teacher_id`/`group__teacher__user__full_name`.
  Строки с `group__teacher__isnull=True` (группа без назначенного учителя)
  идут отдельной строкой `"Без учителя"/"O'qituvchisiz"`, не выбрасываются.
- `expense_by_category` — тот же паттерн, но исходный queryset — платежи с
  `payment_type="expense"`, группировка по `category` (свободная строка на
  `Payment.category`, пустая категория → `"Без категории"/"Kategoriyasiz"`).
  Сумма — просто `Sum("amount")` (расходы не бывают "отменены" отдельным типом
  как доходы, знак не нужен).

**2. `get_teachers_report()` — исправление существующего пробела.**
Поле `revenue_total` в ответе сейчас захардкожено строкой `"0"` — вообще не
считается. Добавляется реальный расчёт: сумма `_SIGNED_REVENUE_AMOUNT` по
платежам, где `group__teacher_id == teacher.id`, за тот же период фильтра.
Отдельная аннотация на `teachers_qs`, тем же `Case`/`When`, что уже
используется в `_SIGNED_REVENUE_AMOUNT` наверху файла.

**3. Новая `get_profitability_report(user, filters) -> dict`.**
Выручка минус расходы по двум разрезам — филиал и курс:
```python
def get_profitability_report(user, filters: ReportFilters) -> dict:
    branch_ids = branch_ids_for_user(user, filters.branch_id)
    payments_qs = Payment.objects.filter(branch_id__in=branch_ids)
    payments_qs = _with_date_range(payments_qs, "created_at", filters.date_from, filters.date_to)

    revenue_qs = payments_qs.filter(
        payment_type__in=INCOME_PAYMENT_TYPES + INCOME_REVERSAL_TYPES
    ).annotate(signed_amount=_SIGNED_REVENUE_AMOUNT)
    expense_qs = payments_qs.filter(payment_type="expense")

    def _margin_rows(revenue_group_field, expense_group_field, name_field):
        revenue_by_key = {
            row[revenue_group_field]: row["total"]
            for row in revenue_qs.values(revenue_group_field)
                .annotate(total=Coalesce(Sum("signed_amount"), Decimal("0.00")))
        }
        expense_by_key = {
            row[expense_group_field]: row["total"]
            for row in expense_qs.values(expense_group_field)
                .annotate(total=Coalesce(Sum("amount"), Decimal("0.00")))
        }
        keys = set(revenue_by_key) | set(expense_by_key)
        rows = []
        for key in keys:
            if key is None:
                continue
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

    by_branch = _margin_rows("branch_id", "branch_id", "branch__name")
    by_course = _margin_rows("group__course_id", "group__course_id", "group__course__name")

    total_revenue = _net_revenue(payments_qs)
    total_expense = expense_qs.aggregate(total=Coalesce(Sum("amount"), Decimal("0.00")))["total"]
    total_profit = total_revenue - total_expense

    return {
        "period": {"date_from": str(filters.date_from), "date_to": str(filters.date_to)},
        "total_revenue": str(_quantize(total_revenue)),
        "total_expense": str(_quantize(total_expense)),
        "total_profit": str(_quantize(total_profit)),
        "total_margin_percent": str(_percentage(total_profit, total_revenue) if total_revenue > 0 else Decimal("0.00")),
        "by_branch": by_branch,
        "by_course": by_course,
    }
```
Названия филиалов/курсов подмешиваются вторым, отдельным dict-запросом по
собранным id (`Branch.objects.filter(id__in=...).values("id", "name")` /
аналогично `Course`) — не через `values(name_field)` в основном агрегате,
потому что `revenue_by_key`/`expense_by_key` строятся из двух разных querysets
и с одним `.values(group_field, name_field)` имя пришлось бы тащить в оба
словаря вручную. Финальная реализация это делает при сборке ответа, до
сортировки `rows`.

**4. `get_debtors_report()` — добавление `collection_rate`.**
В существующий ответ добавляется поле верхнего уровня:
```python
billed = payments_qs.filter(payment_type__in=CHARGE_PAYMENT_TYPES).aggregate(
    total=Coalesce(Sum("amount"), Decimal("0.00"))
)["total"]
collected = _net_revenue(payments_qs)  # уже существующая функция
collection_rate = _percentage(collected, billed) if billed > 0 else Decimal("100.00")
```
`payments_qs` — платежи за `filters.date_from`/`filters.date_to` (тот же
`_with_date_range`, что и в остальных отчётах этого файла) — это годовой/
квартальный сбор за период, отдельно от текущего списка должников (который,
как и сейчас, не зависит от периода — это срез "прямо сейчас").

**5. Новая `get_revenue_forecast(user, filters) -> dict`.**
```python
def get_revenue_forecast(user, filters: ReportFilters) -> dict:
    branch_ids = branch_ids_for_user(user, filters.branch_id)
    from apps.courses.models import Group

    active_groups = Group.objects.filter(
        branch_id__in=branch_ids, status="active"
    ).annotate(active_students=Count(
        "memberships", filter=Q(memberships__left_at__isnull=True)
    ))
    potential = sum(
        (g.monthly_price or Decimal("0.00")) * g.active_students
        for g in active_groups
    )

    # Типичный процент недосбора/оттока — среднее отношение
    # (выставлено - собрано) / выставлено за последние 3 месяца.
    today = timezone.localdate()
    lookback_from = today.replace(day=1) - timedelta(days=90)
    lookback_qs = Payment.objects.filter(
        branch_id__in=branch_ids,
        created_at__date__gte=lookback_from,
        created_at__date__lt=today.replace(day=1),
    )
    billed = lookback_qs.filter(payment_type__in=CHARGE_PAYMENT_TYPES).aggregate(
        total=Coalesce(Sum("amount"), Decimal("0.00"))
    )["total"]
    collected = _net_revenue(lookback_qs)
    shortfall_rate = (
        _percentage(billed - collected, billed) if billed > 0 else Decimal("0.00")
    )
    forecast = potential * (Decimal("100.00") - shortfall_rate) / Decimal("100.00")

    return {
        "potential_revenue": str(_quantize(potential)),
        "shortfall_rate_percent": str(shortfall_rate),
        "forecast_revenue": str(_quantize(forecast)),
    }
```
`Group.monthly_price` — уже существующее поле (используется в
`director/courses.tsx` для показа цены группы). Если за 3 месяца назад вообще
не было выставлений (новый филиал/центр) — `shortfall_rate = 0`, прогноз
равен полному потенциалу; отдельно помечается на фронте припиской
"недостаточно истории для точного прогноза" при `billed == 0`.

### URL и API-обвязка

`backend/apps/reports/urls.py` — два новых пути:
```python
path("analytics/profitability/", AnalyticsProfitabilityView.as_view(), name="analytics-profitability"),
path("analytics/revenue-forecast/", AnalyticsRevenueForecastView.as_view(), name="analytics-revenue-forecast"),
```
(`revenue`/`debtors` эндпоинты уже существуют и смонтированы —
расширяются существующие `AnalyticsRevenueView`/`AnalyticsDebtorsView`,
новые классы вьюх для них не создаются).

`backend/apps/reports/views.py` — два новых класса `APIView` по образцу
`AnalyticsRevenueView`/`AnalyticsDebtorsView` (тот же `AnalyticsBaseView`
паттерн: `get_filters`, обработка `ValidationError` → 400).

`src/lib/api.ts` — в объект `analyticsApi` уже есть обёртка `revenue`
(используется расширенный ответ без изменений на этом уровне); добавляются
`debtors` (эндпоинт существует на бэкенде, обёртки во фронтенде до сих пор
не было), `profitability`, `revenueForecast` — по образцу существующих
`overview`/`teachers`.

### Фронтенд

Новый файл `src/components/edu/finance-analytics-tab.tsx` — общий компонент
для admin и director (принцип как `GrantBonusDialog`/`CoinStudentsTab`),
принимает `branchOptions`/`selectedBranchId`/`onBranchChange` пропами (у
director есть выбор филиала, у admin/branch_admin — нет, проп опционален).

Структура внутри:
- Верхний переключатель периода (пресеты + `Popover`+`Calendar` для
  произвольного диапазона — переиспользуется существующий паттерн выбора
  дат, если он есть в `daily-report-page.tsx`; иначе — тот же `Select` с
  пресетами, который уже нужен и не требует нового компонента).
- 4 карточки `Card` подряд (мобильный — `grid-cols-1`, обязательно с базовым
  классом, чтобы не словить blowout из известного паттерна багов проекта):
  1. Выручка/расходы — `LineChart` (тренд по дням) + три `Table` (по
     филиалу/курсу/учителю), с сортировкой по колонке "Сумма".
  2. Прибыль и маржа — `BarChart` (прибыль по филиалу/курсу) +
     `expense_by_category` как отдельная таблица под графиком.
  3. Долги и сбор — KPI-строка (`collection_rate`) + таблица должников
     (переиспользует существующий рендер из идеи `get_debtors_report`,
     тот же формат данных, что уже есть в ответе).
  4. Прогноз — одна крупная цифра (`forecast_revenue`) + подпись с
     `potential_revenue`/`shortfall_rate_percent`, и предупреждение при
     недостатке истории.
- Каждая карточка — свой `EmptyChartState` (уже существующий в
  `director/analytics.tsx`, выносится в `finance-analytics-tab.tsx` вместе
  с остальным, либо импортируется, если будет вынесен раньше как общий).
- Экспорт — кнопка в шапке вкладки, дергает `ExportExcelView`/`ExportPdfView`
  с новым `report_type` (см. ниже), передавая текущие фильтры (период,
  филиал).

`director/analytics.tsx` и `admin/analytics.tsx` — оборачиваются в `Tabs`
(`Обзор`/`Финансы`), текущий JSX обеих становится содержимым вкладки
«Обзор» без изменений; `finance-analytics-tab.tsx` — контент вкладки
«Финансы».

### Экспорт (Excel/PDF)

`backend/apps/reports/views.py::_build_export_payload` — уже существующая
функция маршрутизирует по `report_type` на нужный сервис. Добавляется ветка
для нового типа `"finance_analytics"`, вызывающая все 4 новых/расширенных
сервиса разом и собирающая один многостраничный Excel-файл (вкладка на
блок) — сохраняет уже существующий паттерн `ExportExcelView`/`ExportPdfView`,
не создаёт новый механизм экспорта.

## Тестирование

`backend/tests/test_financial_analytics.py` (новый файл):
- `get_revenue_report` — новые разрезы `by_course`/`by_teacher`, включая
  группу без учителя.
- `get_teachers_report` — `revenue_total` реально считается, не "0".
- `get_profitability_report` — положительная и отрицательная маржа, филиал
  без расходов (только доход → margin 100%), филиал без дохода (только
  расход → margin 0%, не деление на ноль).
- `get_debtors_report` — `collection_rate` при полном сборе (100%), частичном,
  нулевом выставлении (100% — не 0/0 ошибка).
- `get_revenue_forecast` — есть история (обычный случай), нет истории за 3
  месяца (`shortfall_rate=0`), нет активных групп (`forecast=0`, не падает).
- Скоуп по роли — `branch_admin` видит только свой филиал во всех пяти
  функциях (переиспользуется существующий паттерн проверки скоупа из
  `test_reports.py`, если он есть, иначе пишется с нуля по образцу).

Фронтенд — `npm run build`, `python manage.py check`,
`makemigrations --check --dry-run` (миграций в этой фиче быть не должно —
изменений моделей нет, только новые query и endpoints; если `dry-run`
покажет расхождение — это сигнал ошибки, а не ожидаемый шаг). Playwright —
новый спек на вкладку «Финансы» у admin и director: рендер всех 4 блоков с
тестовыми данными, переключение периода, экспорт (клик по кнопке, без
проверки содержимого файла — только что запрос уходит и не падает), 375px.

## Явно не входит в объём (следующие заходы)

Сводная аналитика по центру (ученики/группы/лиды), отток/удержание,
загрузка кабинетов, эффективность учителей за пределами `revenue_total` —
всё это отдельные направления, которые владелец попросил делать по одному
после того, как это будет готово.
