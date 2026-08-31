# Бонусный баланс ученика — план реализации

> **Для агентов:** ОБЯЗАТЕЛЬНЫЙ СКИЛЛ — superpowers:subagent-driven-development.
> Каждая задача: implementer → spec-compliance review → code-quality review →
> цикл фикс-и-повторное-ревью. Это денежная логика, строгость не снижать.

**Цель:** ученики получают второй, бонусный баланс, начисляемый вручную
директором/админом филиала; списание за урок при нехватке основного
баланса разбивается между основным балансом и бонусом; статус «должник»
и все производные от него места (SMS, KPI, отчёты) считают по сумме
обоих балансов.

**Архитектура:** второе числовое поле рядом с уже существующим балансом
(`Wallet.bonus_balance` + денормализованное зеркало
`Student.bonus_balance`, по тому же паттерну синхронизации, что уже есть).
Новое поле `Payment.funding_source` (`main`/`bonus`) размечает, какого
счёта касается запись журнала — без новых типов платежей. Одна общая
функция `apply_payment()` продолжает быть единственным местом, которое
пишет в баланс, теперь параметризованная тем, какой счёт трогать.

**Тех.стек:** Django/DRF (бэкенд), React/TypeScript (фронтенд) — тот же
стек, что и весь остальной проект. Полная спека:
`docs/superpowers/specs/2026-08-31-student-bonus-balance-design.md` —
читать перед каждой задачей, там объяснено ПОЧЕМУ, здесь — точно ЧТО.

---

### Task 1: Модели данных — Wallet.bonus_balance, Student.bonus_balance, Payment.funding_source

**Файлы:**
- Изменить: `backend/apps/finance/models.py`
- Изменить: `backend/apps/students/models.py`
- Создать: `backend/apps/finance/migrations/0009_bonus_balance.py`
- Создать: `backend/apps/students/migrations/0008_student_bonus_balance.py`

**Контекст.** Последняя реальная миграция `finance` в кодовой базе —
`0008_payment_wallet_protect.py`. Последняя реальная миграция `students` —
`0007_merge_20260825_1003.py`. **Важно:** на базе прода миграции
`finance/0009`–`0014` от откаченной ветки `feature/accountant-role`
физически применены (записи в `django_migrations` есть), хотя файлов в
коде нет — это не мешает Django (зависимости объявляются явно через
`dependencies=[...]`, не по номеру файла), но название новой миграции
должно быть однозначно узнаваемым, не `0009_expensecategory` (старое имя
удалённой миграции).

**Шаг 1 — `Wallet` в `backend/apps/finance/models.py`.** Найти класс
`Wallet` (поле `balance = models.DecimalField(...)`), добавить рядом:

```python
    bonus_balance = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
```

**Шаг 2 — `Payment` в том же файле.** Найти
`PAYMENT_TYPE_CHOICES` в классе `Payment`, добавить рядом новый choices-
список и поле (после `category = models.CharField(...)`, перед
`comment`):

```python
    FUNDING_SOURCE_CHOICES = [("main", "Main balance"), ("bonus", "Bonus balance")]
    # default="main": все исторические записи корректно остаются "с
    # основного баланса" без отдельного бэкфилла — это единственно верное
    # значение для всего, что было создано до этой миграции.
    funding_source = models.CharField(max_length=10, choices=FUNDING_SOURCE_CHOICES, default="main")
```

**Шаг 3 — `Student` в `backend/apps/students/models.py`.** Найти поле
`wallet_balance = models.DecimalField(...)`, добавить рядом:

```python
    bonus_balance = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
```

**Шаг 4 — миграции.** Сгенерировать штатно:
```bash
cd backend
python manage.py makemigrations finance students
```
Проверить, что созданные файлы называются `finance/0009_...` и
`students/0008_...` (не переиспользуют номер удалённой ветки), и что
операции — ровно `AddField` на три поля выше, без побочных изменений.
Переименовать файлы в `0009_bonus_balance.py` и
`0008_student_bonus_balance.py`, если автогенерация дала другое имя
(dependencies внутри файла останутся верными, autodetector сам
проставит правильные `dependencies=[("finance", "0008_payment_wallet_protect")]`
и `dependencies=[("students", "0007_merge_20260825_1003")]`).

**Шаг 5 — проверка.**
```bash
python manage.py makemigrations --check --dry-run
```
Ожидается: `No changes detected` (модели и миграции синхронны).
```bash
python manage.py migrate finance students
python manage.py check
```
Ожидается: чисто, без ошибок.

**Шаг 6 — коммит.**
```bash
git add backend/apps/finance/models.py backend/apps/finance/migrations/0009_bonus_balance.py \
        backend/apps/students/models.py backend/apps/students/migrations/0008_student_bonus_balance.py
git commit -m "feat(finance): add bonus_balance to Wallet/Student, funding_source to Payment"
```

---

### Task 2: `apply_payment()` — параметр `funding_source`

**Файлы:**
- Изменить: `backend/apps/finance/services.py`

**Контекст.** Сейчас `apply_payment()` всегда читает/пишет
`wallet.balance`/`student.wallet_balance`. Нужно, чтобы при
`funding_source="bonus"` она работала с `wallet.bonus_balance`/
`student.bonus_balance` вместо этого — той же функцией, не дублируя
логику.

**Текущий код (для ориентира, читать реальный файл перед правкой — могли
быть более поздние правки после написания этого плана):**
```python
@transaction.atomic
def apply_payment(
    student: Student,
    payment_type: str,
    amount: Decimal,
    *,
    created_by=None,
    group=None,
    lesson=None,
    method: str = "",
    category: str = "tuition",
    comment: str = "",
    suppress_notifications: bool = False,
) -> PaymentResult:
    amount = Decimal(amount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if amount <= 0:
        raise ValueError("Amount must be greater than zero")
    if payment_type not in {"top_up", "charge", "discount", "refund", "manual_charge", "manual_top_up"}:
        raise ValueError("Unsupported payment type")

    student = Student.objects.select_for_update().select_related("user").get(id=student.id)
    wallet, _ = Wallet.objects.select_for_update().get_or_create(
        student=student,
        defaults={"balance": student.wallet_balance},
    )

    delta = wallet_delta(payment_type, amount)

    balance_before = wallet.balance
    balance_after = (wallet.balance + delta).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    wallet.balance = balance_after
    wallet.save(update_fields=["balance", "updated_at"])
    student.wallet_balance = balance_after
    student.save(update_fields=["wallet_balance"])

    teacher_id = group.teacher_id if group and group.teacher_id else None

    payment = Payment.objects.create(
        wallet=wallet,
        student=student,
        branch=student.branch,
        group=group,
        lesson=lesson,
        teacher_id=teacher_id,
        payment_type=payment_type,
        amount=amount,
        balance_before=balance_before,
        balance_after=balance_after,
        method=method,
        category=category,
        comment=comment,
        created_by=created_by,
    )

    status_changed = _status_changed_for_balance(student, balance_after)
    if status_changed and student.status == "debtor" and not suppress_notifications:
        _notify_student_became_debtor(student)

    return PaymentResult(payment=payment, status_changed=status_changed)
```

**Новый код — заменить целиком на:**
```python
@transaction.atomic
def apply_payment(
    student: Student,
    payment_type: str,
    amount: Decimal,
    *,
    created_by=None,
    group=None,
    lesson=None,
    method: str = "",
    category: str = "tuition",
    comment: str = "",
    suppress_notifications: bool = False,
    funding_source: str = "main",
) -> PaymentResult:
    if funding_source not in ("main", "bonus"):
        raise ValueError("Unsupported funding_source")
    amount = Decimal(amount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if amount <= 0:
        raise ValueError("Amount must be greater than zero")
    if payment_type not in {"top_up", "charge", "discount", "refund", "manual_charge", "manual_top_up"}:
        raise ValueError("Unsupported payment type")

    student = Student.objects.select_for_update().select_related("user").get(id=student.id)
    wallet, _ = Wallet.objects.select_for_update().get_or_create(
        student=student,
        defaults={"balance": student.wallet_balance, "bonus_balance": student.bonus_balance},
    )

    delta = wallet_delta(payment_type, amount)

    if funding_source == "bonus":
        balance_before = wallet.bonus_balance
        balance_after = (wallet.bonus_balance + delta).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        wallet.bonus_balance = balance_after
        wallet.save(update_fields=["bonus_balance", "updated_at"])
        student.bonus_balance = balance_after
        student.save(update_fields=["bonus_balance"])
    else:
        balance_before = wallet.balance
        balance_after = (wallet.balance + delta).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        wallet.balance = balance_after
        wallet.save(update_fields=["balance", "updated_at"])
        student.wallet_balance = balance_after
        student.save(update_fields=["wallet_balance"])

    teacher_id = group.teacher_id if group and group.teacher_id else None

    payment = Payment.objects.create(
        wallet=wallet,
        student=student,
        branch=student.branch,
        group=group,
        lesson=lesson,
        teacher_id=teacher_id,
        payment_type=payment_type,
        amount=amount,
        balance_before=balance_before,
        balance_after=balance_after,
        method=method,
        category=category,
        comment=comment,
        created_by=created_by,
        funding_source=funding_source,
    )

    # Пересчёт статуса — по сумме main+bonus, всегда, вне зависимости от
    # того, какой счёт затронула эта конкретная операция (см. Task 3):
    # чистое начисление бонуса без единого списания урока тоже может
    # вывести ученика из статуса "должник".
    status_changed = _status_changed_for_combined_balance(student)
    if status_changed and student.status == "debtor" and not suppress_notifications:
        _notify_student_became_debtor(student)

    return PaymentResult(payment=payment, status_changed=status_changed)
```

**Также поправить `get_or_create_wallet()`** (несколькими строками выше)
— она читает `defaults={"balance": student.wallet_balance}` при
создании кошелька; добавить `bonus_balance` в тот же `defaults`:
```python
def get_or_create_wallet(student: Student) -> Wallet:
    wallet, created = Wallet.objects.get_or_create(
        student=student,
        defaults={"balance": student.wallet_balance, "bonus_balance": student.bonus_balance},
    )
```
(тело функции ниже — сверка `wallet.balance` vs `student.wallet_balance`
и логирование расхождения — не трогать в этой задаче, это уже
существующая логика для основного баланса, бонус ей не касается).

**Не создавать** `_status_changed_for_combined_balance` в этой задаче —
это Task 3, она в этом коде используется, но определяется следующим
шагом (порядок задач специально такой, implementer Task 2 должен
временно оставить импорт/вызов, а функцию добавит Task 3 — **чтобы
избежать этого разрыва, объединить Task 2 и Task 3 в одной задаче при
диспетчеризации implementer'у**, они правят один и тот же файл и
взаимозависимы).

**Проверка:** `python manage.py check` чисто. Полноценный тест — в
Task 13 (там будет реальный `test_bonus_balance.py`), здесь достаточно
что код импортируется и не падает на `check`.

**Коммит:** вместе с Task 3 (см. ниже) одним коммитом, т.к. код
взаимозависим.

---

### Task 3: Замена `_status_changed_for_balance` на `_status_changed_for_combined_balance`

**Файлы:**
- Изменить: `backend/apps/finance/services.py` (продолжение Task 2, один PR/коммит)
- Изменить: `backend/apps/core/definitions.py` (только докстринг)

**Текущий код в `services.py` (найти и удалить целиком):**
```python
def _status_changed_for_balance(student: Student, balance: Decimal) -> bool:
    # Never touch statuses that are not part of the active/debtor cycle
    if student.status in _PROTECTED_STATUSES:
        return False
    previous = student.status
    if balance < 0 and student.status != "debtor":
        student.status = "debtor"
    elif balance >= 0 and student.status == "debtor":
        student.status = "active"
    if previous != student.status:
        student.save(update_fields=["status"])
        return True
    return False
```

**Заменить на:**
```python
def _status_changed_for_combined_balance(student: Student) -> bool:
    """Единая точка, откуда меняется student.status — по правилу
    is_debtor_balance(main + bonus), а не по одному основному балансу.
    Вызывается после ЛЮБОЙ операции apply_payment, вне зависимости от
    того, main или bonus она затронула: чистое начисление бонуса без
    единого списания урока тоже может вывести ученика из долга."""
    if student.status in _PROTECTED_STATUSES:
        return False
    combined = student.wallet_balance + student.bonus_balance
    previous = student.status
    if is_debtor_balance(combined) and student.status != "debtor":
        student.status = "debtor"
    elif not is_debtor_balance(combined) and student.status == "debtor":
        student.status = "active"
    if previous != student.status:
        student.save(update_fields=["status"])
        return True
    return False
```

Добавить импорт `is_debtor_balance` в начало `services.py` (рядом с уже
существующим `from apps.core.definitions import wallet_delta`):
```python
from apps.core.definitions import is_debtor_balance, wallet_delta
```

**В `backend/apps/core/definitions.py`** — найти докстринг функции
`is_debtor_balance`, там есть строка со ссылкой на старое имя функции:
```
    finance.services._status_changed_for_balance при каждой операции.
```
Заменить `_status_changed_for_balance` на
`_status_changed_for_combined_balance` в этой строке — комментарий не
должен указывать на удалённый код. Тело функции `is_debtor_balance`
**не менять** (`balance < 0` остаётся верным правилом — меняется только
то, что ей передают на вход).

**Проверка:**
```bash
grep -rn "_status_changed_for_balance\b" backend/apps/
```
Ожидается: ноль совпадений (старое имя нигде больше не встречается, ни в
коде, ни в комментариях).
```bash
cd backend && python manage.py check
```
Чисто.

**Коммит (объединяет Task 2 + Task 3):**
```bash
git add backend/apps/finance/services.py backend/apps/core/definitions.py
git commit -m "feat(finance): apply_payment supports funding_source main/bonus, debtor status uses combined balance"
```

---

### Task 4: Общий хелпер `with_combined_balance()` в `apps/core/definitions.py`

**Файлы:**
- Изменить: `backend/apps/core/definitions.py`

**Контекст.** 9 разных мест в бэкенде фильтруют учеников-должников
напрямую по `wallet_balance` (см. полный список в Task 5–7 ниже). Чтобы
не переписывать правило 9 раз независимо, один переиспользуемый хелпер.

**Добавить в конец файла `backend/apps/core/definitions.py`:**
```python
from django.db.models import F, QuerySet


def with_combined_balance(queryset: QuerySet) -> QuerySet:
    """Аннотирует queryset учеников полем combined_balance =
    wallet_balance + bonus_balance. Использовать вместо прямой
    фильтрации по wallet_balance везде, где решается вопрос "должник или
    нет" — единая точка того, что складывается; при следующем изменении
    (например, появится третий вид баланса) правится один раз, а не в
    девяти местах по всему бэкенду."""
    return queryset.annotate(combined_balance=F("wallet_balance") + F("bonus_balance"))
```
(добавить импорт `from django.db.models import F, QuerySet` в начало
файла вместе с уже существующими импортами, если там ещё нет импортов
из `django.db.models` — проверить текущие импорты файла перед правкой).

**Проверка:**
```bash
cd backend && python manage.py shell -c "
from apps.core.definitions import with_combined_balance
from apps.students.models import Student
print(with_combined_balance(Student.objects.all()).query)
"
```
Ожидается: SQL с `wallet_balance + bonus_balance AS combined_balance`,
без ошибок.

**Коммит:**
```bash
git add backend/apps/core/definitions.py
git commit -m "feat(core): add with_combined_balance() queryset helper for debtor logic"
```

---

### Task 5: `update_debtor_statuses()` — переписать через `with_combined_balance`

**Файлы:**
- Изменить: `backend/apps/finance/tasks.py`

**Найти функцию (сравнить с реальным файлом перед правкой):**
```python
def update_debtor_statuses():
    """Приводит статус "debtor" в соответствие с балансом.
    ...
    Статусы вне цикла активный/должник (frozen, archived, graduate, expelled)
    не трогаем — тем же правилом, что и finance.services._status_changed_for_balance.
    """
    for schema in _iter_tenant_schemas():
        with schema_context(schema):
            cleared = Student.objects.filter(
                status="debtor", wallet_balance__gte=0
            ).update(status="active")
            marked = Student.objects.filter(
                status="active", wallet_balance__lt=0
            ).update(status="debtor")
            if cleared or marked:
                logger.info(
                    "update_debtor_statuses в '%s': погашено %s, помечено должниками %s",
                    schema, cleared, marked,
                )
```

**Заменить тело цикла на:**
```python
def update_debtor_statuses():
    """Приводит статус "debtor" в соответствие с балансом.
    ...
    Статусы вне цикла активный/должник (frozen, archived, graduate, expelled)
    не трогаем — тем же правилом, что и finance.services._status_changed_for_combined_balance.

    Считает по сумме main+bonus (with_combined_balance), не по одному
    wallet_balance — ученик, чей минус на основном балансе полностью
    покрыт бонусом, не должник, и эта задача не должна его туда
    переводить каждую ночь.
    """
    for schema in _iter_tenant_schemas():
        with schema_context(schema):
            cleared = with_combined_balance(
                Student.objects.filter(status="debtor")
            ).filter(combined_balance__gte=0).update(status="active")
            marked = with_combined_balance(
                Student.objects.filter(status="active")
            ).filter(combined_balance__lt=0).update(status="debtor")
            if cleared or marked:
                logger.info(
                    "update_debtor_statuses в '%s': погашено %s, помечено должниками %s",
                    schema, cleared, marked,
                )
```

Добавить импорт в начало `tasks.py` (рядом с уже существующими импортами
из `apps.core`, если есть — иначе новой строкой):
```python
from apps.core.definitions import with_combined_balance
```

**Проверка:**
```bash
cd backend && python manage.py check
grep -n "_status_changed_for_balance" apps/finance/tasks.py
```
Ожидается: чисто, и ноль совпадений старого имени функции в докстринге.

**Коммит:**
```bash
git add backend/apps/finance/tasks.py
git commit -m "fix(finance): update_debtor_statuses respects bonus balance, not just wallet_balance"
```

---

### Task 6: `BranchViewSet.debtors` — правка через `with_combined_balance`

**Файлы:**
- Изменить: `backend/apps/institutions/views.py`

**Найти (в `BranchViewSet`, action `debtors`):**
```python
    @action(detail=True, methods=["get"], url_path="debtors", permission_classes=[IsBranchAdmin])
    def debtors(self, request, pk=None):
        branch = self.get_object()
        debtors = (
            Student.objects.select_related("user")
            .filter(branch=branch, wallet_balance__lt=0)
            .order_by("user__full_name")
        )
        payload = [
            {
                "student_id": str(student.id),
                "full_name": student.user.full_name,
                "phone": student.user.phone,
                "status": student.status,
                "wallet_balance": str(student.wallet_balance),
            }
```
(дочитать оставшуюся часть функции в реальном файле — она продолжается
после этого фрагмента, не обрезать существующие поля payload, только
поправить источник фильтра и отображаемого баланса).

**Заменить фильтр и поле баланса:**
```python
    @action(detail=True, methods=["get"], url_path="debtors", permission_classes=[IsBranchAdmin])
    def debtors(self, request, pk=None):
        branch = self.get_object()
        debtors = with_combined_balance(
            Student.objects.select_related("user").filter(branch=branch)
        ).filter(combined_balance__lt=0).order_by("user__full_name")
        payload = [
            {
                "student_id": str(student.id),
                "full_name": student.user.full_name,
                "phone": student.user.phone,
                "status": student.status,
                "wallet_balance": str(student.combined_balance),
            }
```
(остальные поля payload, если есть за пределами показанного фрагмента —
оставить как есть, менять только `.filter(...)` и значение
`wallet_balance` в payload). Ключ в JSON-ответе (`"wallet_balance"`)
**не переименовывать** — фронтенд читает именно это имя ключа, меняется
только то, ОТКУДА берётся значение (объединённый баланс вместо сырого
`student.wallet_balance`).

Добавить импорт `with_combined_balance` в начало файла:
```python
from apps.core.definitions import with_combined_balance
```

**Проверка:** `python manage.py check` чисто.

**Коммит:**
```bash
git add backend/apps/institutions/views.py
git commit -m "fix(institutions): branch debtors list respects bonus balance"
```

---

### Task 7: `debtor_reminder()` и `send_debtor_sms()` — правка через `with_combined_balance`

**Файлы:**
- Изменить: `backend/apps/notifications/tasks.py`

**Контекст.** Это самое чувствительное место из всех девяти —
`send_debtor_sms()` реально отправляет SMS ученику/родителю. Если не
поправить, семья получит SMS с требованием оплатить долг, который на
самом деле уже покрыт бонусом.

**В `debtor_reminder()` найти:**
```python
            debtors = Student.objects.filter(
                wallet_balance__lt=0,
                status__in=ENROLLED_STUDENT_STATUSES,
            )
            if not debtors.exists():
                continue
            count = debtors.count()
            total_debt = sum(abs(d.wallet_balance) for d in debtors)
```
**Заменить на:**
```python
            debtors = with_combined_balance(
                Student.objects.filter(status__in=ENROLLED_STUDENT_STATUSES)
            ).filter(combined_balance__lt=0)
            if not debtors.exists():
                continue
            count = debtors.count()
            total_debt = sum(abs(d.combined_balance) for d in debtors)
```

**В `send_debtor_sms()` найти:**
```python
            debtors = Student.objects.filter(
                wallet_balance__lt=0,
                status__in=ENROLLED_STUDENT_STATUSES,
            ).select_related("user")
            for student in debtors:
                if not student.user.phone:
                    continue
                balance = abs(student.wallet_balance)
```
**Заменить на:**
```python
            debtors = with_combined_balance(
                Student.objects.filter(status__in=ENROLLED_STUDENT_STATUSES)
            ).filter(combined_balance__lt=0).select_related("user")
            for student in debtors:
                if not student.user.phone:
                    continue
                balance = abs(student.combined_balance)
```
(текст самого SMS-сообщения ниже по коду использует переменную
`balance` — не трогать, она уже будет содержать верную сумму после
этой правки).

Добавить импорт в начало файла:
```python
from apps.core.definitions import with_combined_balance
```

**Проверка:** `python manage.py check` чисто.
```bash
grep -n "wallet_balance__lt\|wallet_balance__gte" backend/apps/notifications/tasks.py
```
Ожидается: ноль совпадений (обе прямые фильтрации заменены).

**Коммит:**
```bash
git add backend/apps/notifications/tasks.py
git commit -m "fix(notifications): debtor reminder and debtor SMS respect bonus balance"
```

---

### Task 8: `reports/services.py` — 4 места, правка через `with_combined_balance`

**Файлы:**
- Изменить: `backend/apps/reports/services.py`

**Место 1 — `get_overview()`:**
```python
    debtors_count = Student.objects.filter(branch_id__in=branch_ids, wallet_balance__lt=0).count()
```
→
```python
    debtors_count = with_combined_balance(
        Student.objects.filter(branch_id__in=branch_ids)
    ).filter(combined_balance__lt=0).count()
```

**Место 2 — `get_debtors_report()`:**
```python
    debtors_qs = Student.objects.select_related("user", "branch").filter(
        branch_id__in=branch_ids,
        wallet_balance__lt=0,
    )
```
→
```python
    debtors_qs = with_combined_balance(
        Student.objects.select_related("user", "branch").filter(branch_id__in=branch_ids)
    ).filter(combined_balance__lt=0)
```
(дочитать реальный файл дальше этой точки — если ниже по функции есть
использование `student.wallet_balance` как отображаемой суммы долга в
этом же отчёте, заменить на `student.combined_balance` там же, по той
же логике, что и в Task 6).

**Место 3 — внутри `get_daily_report()`:**
```python
    total_debt = Student.objects.filter(
        branch_id__in=branch_ids,
        wallet_balance__lt=0,
    ).aggregate(total=Coalesce(Sum("wallet_balance"), Decimal("0")))["total"]
```
→
```python
    total_debt = with_combined_balance(
        Student.objects.filter(branch_id__in=branch_ids)
    ).filter(combined_balance__lt=0).aggregate(
        total=Coalesce(Sum("combined_balance"), Decimal("0"))
    )["total"]
```

**Место 4 — внутри `get_group_report()`:**
```python
    debtors = Student.objects.filter(id__in=student_ids, wallet_balance__lt=0).select_related("user")
    debtors_list = [
        {"student_id": str(d.id), "student_name": d.user.full_name, "balance": float(d.wallet_balance)}
        for d in debtors
    ]
```
→
```python
    debtors = with_combined_balance(
        Student.objects.filter(id__in=student_ids)
    ).filter(combined_balance__lt=0).select_related("user")
    debtors_list = [
        {"student_id": str(d.id), "student_name": d.user.full_name, "balance": float(d.combined_balance)}
        for d in debtors
    ]
```

Добавить импорт в начало файла (проверить, нет ли уже импорта из
`apps.core.definitions` в этом файле — если есть, добавить
`with_combined_balance` в существующую строку импорта, не дублировать):
```python
from apps.core.definitions import with_combined_balance
```

**Проверка:**
```bash
cd backend
grep -n "wallet_balance__lt\|wallet_balance__gte" apps/reports/services.py
```
Ожидается: ноль совпадений.
```bash
python manage.py check
```
Чисто.

**Коммит:**
```bash
git add backend/apps/reports/services.py
git commit -m "fix(reports): overview KPI, debtors report, daily report, group report respect bonus balance"
```

---

### Task 9: `charge_for_lesson()` — разбивка списания за урок между main/bonus

**Файлы:**
- Изменить: `backend/apps/finance/services.py`
- Изменить: `backend/apps/finance/tasks.py`

**Добавить в `services.py`, после функции `apply_payment()`:**
```python
def charge_for_lesson(
    student: Student, group, lesson, lesson_price: Decimal,
    *, category: str, comment: str, created_by=None,
) -> list[PaymentResult]:
    """Списывает lesson_price за урок, разбивая между основным балансом
    и бонусом. Основной баланс покрывает столько, сколько на нём
    ПОЛОЖИТЕЛЬНОГО есть — уже отрицательный баланс не считается
    "доступным", тогда всё сразу уходит в бонус. Остаток берётся из
    бонуса, не больше, чем там реально есть. Если и бонуса не хватило —
    непокрытый остаток списывается с основного, уходя в минус, как и
    раньше до этой фичи. Возвращает 1 или 2 PaymentResult: одна запись,
    если счёт всего один; две — если списание разбилось между обоими."""
    wallet = get_or_create_wallet(student)
    main_available = max(wallet.balance, Decimal("0.00"))
    from_main = min(lesson_price, main_available)
    remainder = lesson_price - from_main
    from_bonus = min(remainder, wallet.bonus_balance) if remainder > 0 else Decimal("0.00")
    from_main_final = lesson_price - from_bonus

    results = []
    if from_bonus > 0:
        results.append(apply_payment(
            student=student, payment_type="charge", amount=from_bonus,
            group=group, lesson=lesson, category=category, comment=comment,
            created_by=created_by, funding_source="bonus",
        ))
    if from_main_final > 0:
        results.append(apply_payment(
            student=student, payment_type="charge", amount=from_main_final,
            group=group, lesson=lesson, category=category, comment=comment,
            created_by=created_by, funding_source="main",
        ))
    return results
```

**В `tasks.py`** — найти вызывающий код внутри `charge_groups_for_day()`:
```python
        for student, att in students_to_process:
            try:
                with transaction.atomic():
                    cat = "absent_charge" if (att and att.status == "absent") else "tuition"
                    apply_payment(
                        student=student,
                        payment_type="charge",
                        amount=lesson_price,
                        group=group,
                        lesson=lesson,
                        category=cat,
                        comment=f"Daily lesson charge for {today}",
                    )
                    if att:
                        charged_attendance_ids.append(att.id)
                    charged_total += 1
            except Exception as e:
                logger.error(f"Charge failed for student {student.id}: {e}")
```
**Заменить на:**
```python
        for student, att in students_to_process:
            try:
                with transaction.atomic():
                    cat = "absent_charge" if (att and att.status == "absent") else "tuition"
                    charge_for_lesson(
                        student=student,
                        group=group,
                        lesson=lesson,
                        lesson_price=lesson_price,
                        category=cat,
                        comment=f"Daily lesson charge for {today}",
                    )
                    if att:
                        charged_attendance_ids.append(att.id)
                    charged_total += 1
            except Exception as e:
                logger.error(f"Charge failed for student {student.id}: {e}")
```
Заменить импорт в начале `tasks.py`:
```python
from .services import (
    apply_payment,
    calculate_lesson_price,
    charge_for_lesson,
)
```
(`apply_payment` может остаться неиспользуемым импортом в этом файле,
если в нём больше нет прямых вызовов — проверить `grep -n "apply_payment"
apps/finance/tasks.py` после правки и убрать импорт `apply_payment`, если
он больше нигде в файле не используется; линтер/flake8 отловит
неиспользуемый импорт, если он останется).

**Проверка:**
```bash
cd backend && python manage.py check
```

**Коммит:**
```bash
git add backend/apps/finance/services.py backend/apps/finance/tasks.py
git commit -m "feat(finance): split lesson charge between main balance and bonus"
```

---

### Task 10: `reverse_payment()` — проброс `funding_source` + обрезка при отмене бонуса

**Файлы:**
- Изменить: `backend/apps/finance/services.py`

**Контекст.** Каждая ветка `reverse_payment()` создаёт зеркальную
операцию через `apply_payment(...)`. Нужно, чтобы зеркальная операция
возвращала деньги в тот же счёт (`main`/`bonus`), откуда они были
списаны/начислены — это делается одним новым аргументом в каждом
вызове. Плюс особый случай: если отменяют начисление бонуса, а часть
уже потрачена на уроки, реверс не должен утащить `bonus_balance` в
минус.

**Прочитать актуальный `reverse_payment()` в файле перед правкой** —
структура веток (`if payment.payment_type == "charge": ... elif
payment.payment_type == "top_up": ... elif "manual_charge": ... elif
"manual_top_up": ...`) не меняется, в каждый существующий вызов
`apply_payment(...)` внутри каждой ветки добавляется один новый
именованный аргумент:
```python
            funding_source=payment.funding_source,
```

**Особый случай — перед веткой `elif payment.payment_type == "top_up":`**
(та ветка, что создаёт `manual_charge` для отмены пополнения), добавить
проверку СРАЗУ ПОСЛЕ входа в эту ветку, до вызова `apply_payment`:

```python
    elif payment.payment_type == "top_up":
        amount_to_reverse = payment.amount
        if payment.funding_source == "bonus":
            # Часть начисленного бонуса уже могла уйти на уроки — реверс
            # не должен утащить bonus_balance в минус. Возвращаем не
            # больше, чем реально осталось на бонусном счету.
            wallet = get_or_create_wallet(payment.student)
            amount_to_reverse = min(payment.amount, wallet.bonus_balance)
            if amount_to_reverse <= 0:
                raise ValueError("Bonus already fully spent, nothing left to reverse")
        # top_up was +amount. Reverse with manual_charge (NOT "charge" — that's lesson billing).
        result = apply_payment(
            student=payment.student,
            payment_type="manual_charge",
            amount=amount_to_reverse,
            group=payment.group,
            lesson=payment.lesson,
            created_by=created_by,
            comment=comment,
            funding_source=payment.funding_source,
        )
```
(заменяет существующую ветку `elif payment.payment_type == "top_up":` —
логика та же, добавлена только предварительная обрезка суммы для
бонусного случая; для `funding_source="main"` `amount_to_reverse`
остаётся равным `payment.amount`, поведение не меняется).

Остальные ветки (`charge`→`refund`, `manual_charge`→`manual_top_up`,
`manual_top_up`→`manual_charge`) получают **только** добавленный
аргумент `funding_source=payment.funding_source` в их существующие
вызовы `apply_payment`, без другой логики.

**Проверка:** `python manage.py check` чисто. Полноценная проверка
поведения — тест в Task 13.

**Коммит:**
```bash
git add backend/apps/finance/services.py
git commit -m "fix(finance): reverse_payment preserves funding_source, caps bonus reversal at remaining balance"
```

---

### Task 11: API — `PaymentCreateSerializer` поле `funding_source`

**Файлы:**
- Изменить: `backend/apps/finance/serializers.py`

**В классе `PaymentCreateSerializer`** — добавить поле после
`comment`:
```python
    funding_source = serializers.ChoiceField(
        choices=["main", "bonus"], required=False, default="main",
    )
```

**В `validate(self, attrs)`** — добавить проверку в начале метода, до
существующей логики про `payment_type == "expense"`:
```python
    def validate(self, attrs):
        payment_type = attrs.get("payment_type")
        funding_source = attrs.get("funding_source", "main")
        if funding_source == "bonus" and payment_type != "top_up":
            # Через этот публичный эндпоинт "бонус" разрешён только для
            # начисления (top_up). charge/manual_charge/manual_top_up с
            # funding_source="bonus" создаются исключительно изнутри
            # charge_for_lesson()/reverse_payment() — не через прямой
            # POST, иначе кто угодно с доступом к API мог бы обойти
            # правило "бонус тратится только на уроки".
            raise serializers.ValidationError({
                "funding_source": "Bonus funding source is only allowed for top_up payments created through this endpoint.",
            })
        request = self.context.get("request")
        user = getattr(request, "user", None)
        # ... остаток существующего тела validate() без изменений ...
```
(`# ... остаток существующего тела validate() без изменений ...` — это
инструкция реализующему, не код для вставки буквально; вся остальная
существующая логика метода остаётся дословно как в файле, меняется
только добавленный блок в начале).

**В `create(self, validated_data)`** — найти вызов `apply_payment(...)`
для не-`expense` случая (в конце метода), добавить аргумент:
```python
        payment_result = apply_payment(
            student=student,
            payment_type=validated_data["payment_type"],
            amount=validated_data["amount"],
            created_by=self.context["request"].user,
            group=group,
            lesson=lesson,
            method=validated_data.get("method", ""),
            category=validated_data.get("category", "tuition"),
            comment=validated_data.get("comment", ""),
            funding_source=validated_data.get("funding_source", "main"),
        )
```

**Проверка:**
```bash
cd backend && python manage.py check
```
Ручная проверка через `manage.py shell` необязательна — полноценная
проверка через реальный HTTP-запрос будет в Task 13 (тест на
`POST /api/v1/payments/` с `funding_source="bonus"`).

**Коммит:**
```bash
git add backend/apps/finance/serializers.py
git commit -m "feat(finance): PaymentCreateSerializer accepts funding_source for bonus grants"
```

---

### Task 12: Сериализаторы чтения — добавить `bonus_balance` в ответы API

**Файлы:**
- Изменить: `backend/apps/students/serializers.py` (или файл, где реально
  сериализуется `Student` для списков/детали — найти командой ниже
  перед правкой, не гадать путь)
- Изменить: `backend/apps/finance/serializers.py` (`PaymentSerializer`)

**Шаг 1 — найти все места, где `wallet_balance` попадает в ответ API:**
```bash
cd backend
grep -rn '"wallet_balance"\|wallet_balance =' apps/students/serializers.py apps/finance/serializers.py
```
Для каждого найденного `serializers.ModelSerializer`/`Serializer`,
у которого в `fields`/явном объявлении есть `wallet_balance` (или его
аналог, отдающий баланс ученика фронту) — добавить `bonus_balance` рядом
в `fields` (для `ModelSerializer`) или явным полем (для ручных
`Serializer`), тем же способом, что уже используется в этом же классе
для `wallet_balance`.

**Шаг 2 — `PaymentSerializer` в `backend/apps/finance/serializers.py`.**
Добавить `"funding_source"` в `fields` (рядом с уже существующим
`"category"`):
```python
class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = (
            "id",
            "student",
            "branch",
            "group",
            "lesson",
            "staff",
            "payment_type",
            "amount",
            "balance_before",
            "balance_after",
            "method",
            "category",
            "funding_source",
            "comment",
            "created_by",
            "created_at",
        )
```

**Проверка:**
```bash
cd backend && python manage.py check
```
Реальная проверка формата ответа — через существующий эндпоинт списка
студентов/платежей вручную (`python manage.py runserver` +
`curl`/Postman на реальном тенанте) не обязательна на этом шаге, будет
покрыта фронтенд-задачами (Task 14–16), которые прочитают эти поля.

**Коммит:**
```bash
git add backend/apps/students/serializers.py backend/apps/finance/serializers.py
git commit -m "feat(api): expose bonus_balance and funding_source in student/payment serializers"
```

---

### Task 13: Backend-тесты — `test_bonus_balance.py`

**Файлы:**
- Создать: `backend/tests/test_bonus_balance.py`

**Контекст.** Прочитать `backend/tests/test_finance_services.py` и
`backend/tests/conftest.py` перед написанием — использовать те же
фикстуры (`director_user`/`branch_admin_user`/`student` и т.п., если они
там определены) и тот же стиль вызова `apply_payment`/`APIClient`, не
изобретать новый паттерн настройки тестовых данных.

**Обязательные тест-кейсы** (каждый — отдельная функция
`test_...`, `pytestmark = pytest.mark.django_db` на уровне модуля):

1. Начисление бонуса создаёт `Payment(payment_type="top_up",
   funding_source="bonus")`, увеличивает `wallet.bonus_balance`, НЕ
   трогает `wallet.balance`.
2. Списание за урок при основном балансе, полностью покрывающем цену —
   `charge_for_lesson` возвращает список из ОДНОГО `PaymentResult`,
   `funding_source="main"`, бонус не тронут.
3. Списание за урок: основной баланс 3000, цена урока 5000, бонус ≥2000
   — `charge_for_lesson` возвращает ДВА `PaymentResult`
   (`funding_source="main"`, amount=3000 и `funding_source="bonus"`,
   amount=2000), у каждого корректные `balance_before`/`balance_after`
   для своего счёта, итоговый `wallet.balance == 0`,
   `wallet.bonus_balance` уменьшен на 2000.
4. Списание за урок при основном балансе уже отрицательном (например,
   -1000) и достаточном бонусе — 100% списания уходит в бонус, основной
   баланс не меняется дальше.
5. Списание за урок при основном балансе отрицательном И
   недостаточном бонусе — непокрытый остаток списывается с основного,
   уходя в ещё больший минус (совпадает с поведением до этой фичи).
6. Должник по сумме: `wallet_balance=0, bonus_balance=5000` →
   `student.status != "debtor"`. `wallet_balance=-1000,
   bonus_balance=500` → `student.status == "debtor"` (сумма
   отрицательна, -500).
7. **Кросс-проверка всех 9 мест разом, одним тестом.** Один ученик с
   `wallet_balance=-1000`, `bonus_balance=2000`,
   `status in ENROLLED_STUDENT_STATUSES` создаётся один раз, затем
   последовательно проверяется, что он НЕ считается должником в:
   `BranchViewSet.debtors` (реальный HTTP GET через `APIClient`),
   `debtor_reminder()` (вызвать функцию напрямую, проверить, что она не
   создала уведомление на этого ученика / что счётчик его не включает),
   `send_debtor_sms()` (вызвать напрямую, замокать реальную отправку
   SMS если у неё внешняя зависимость — проверить по существующему
   паттерну тестирования этой функции, если она уже где-то тестируется
   в проекте, использовать тот же подход к моку), `get_overview()`
   (`debtors_count` не включает его), `get_debtors_report()` (не в
   списке), `get_daily_report()` — `total_debt` не включает его вклад,
   `get_group_report()` (не в `debtors_list`), и `update_debtor_statuses()`
   не переводит его в `debtor` (запустить функцию, проверить
   `student.refresh_from_db(); assert student.status != "debtor"`).
8. Отмена начисления бонуса, когда часть уже потрачена на уроки: бонус
   начислен на 5000, из них 3000 списано на урок (остаток бонуса 2000),
   `reverse_payment()` на исходном начислении — реверс ограничен
   остатком (`amount_to_reverse == 2000`, не 5000),
   `wallet.bonus_balance == 0` после реверса, не уходит в минус.
9. `refund_lesson_charges()` на уроке, где списание было разбито на
   main+bonus (сценарий как в кейсе 3, затем урок отменяется/сигнал
   уважительной причины) — обе записи (`main` и `bonus`) находятся и
   возвращаются, `wallet.balance` и `wallet.bonus_balance` восстановлены
   до состояния "до списания".
10. `POST /api/v1/payments/` с `payment_type="top_up",
    funding_source="bonus"` через `APIClient` от `branch_admin`/
    `director` — 201, создаёт запись с верным `funding_source`.
11. `POST /api/v1/payments/` с `payment_type="charge",
    funding_source="bonus"` (попытка напрямую создать бонусное
    списание, не через `top_up`) — 400, отклонено валидацией
    сериализатора.

**Проверка:**
```bash
cd backend
python -m pytest tests/test_bonus_balance.py -v
```
Ожидается: все тесты проходят.
```bash
python -m pytest --ignore=test_student.py -q
```
Ожидается: те же 24 базовых известных провала (`test_quiz_middleware_stack.py`
7, `test_quiz_tenant_isolation.py` 4, `test_staff_password_guard.py` 3,
`test_student_document_privacy.py` 3, `test_trigger_daily_charge.py` 5,
`test_homework_student_scope.py` 1, `test_quiz_join_error_handling.py` 1),
без единого нового провала, плюс новые тесты из `test_bonus_balance.py`
все зелёные.

**Коммит:**
```bash
git add backend/tests/test_bonus_balance.py
git commit -m "test(finance): bonus balance grant, split lesson charge, debtor status, reversal, cross-check all 9 debtor sites"
```

---

### Task 14: Фронтенд — типы и маппинг

**Файлы:**
- Изменить: `src/lib/data/types.ts`
- Изменить: `src/lib/data/mappers.ts`

**В `types.ts`** — найти интерфейс `Student`, добавить поле рядом с
`balance`:
```typescript
  bonusBalance?: number;
```
Найти интерфейс `Payment`, добавить поле рядом с `category`:
```typescript
  fundingSource?: "main" | "bonus";
```

**В `mappers.ts`** — найти функцию, маппящую сырой ответ API в
`Student` (там, где `balance: r.wallet_balance` или аналогичное
присвоение) — добавить:
```typescript
    bonusBalance: r.bonus_balance != null ? Number(r.bonus_balance) : undefined,
```
Найти функцию `mapPayment()` (или её текущее имя — проверить реальный
файл), добавить:
```typescript
    fundingSource: r.funding_source ?? undefined,
```
(тип сырого ответа `PaymentRaw`/аналогичный, если он объявлен явно в
этом файле — добавить туда же соответствующее необязательное поле
`funding_source?: "main" | "bonus" | null;`, по образцу уже
существующих полей в этом типе).

**Шаг 3 — КРИТИЧНО, не пропускать: реально прокинуть поле в запрос.**

Проверено по реальному коду прямо сейчас: `addPayment` в
`src/lib/data/store.tsx` (около строки 1439) вызывает
`paymentApi.create({...})` со **явно перечисленным** списком полей —
`student_id`, `staff_id`, `group_id`, `branch_id`, `amount`,
`payment_type`, `method`, `category`, `comment`. Расширение TS-типа
`Payment` полем `fundingSource` (шаги выше) **само по себе ничего не
меняет** — `addPayment` не строит запрос автоматически по всем полям
входного объекта, каждое поле нужно явно перечислить в этом списке,
иначе оно молча потеряется, и кнопка «Начислить бонус» из Task 15 будет
создавать обычный `top_up`, никак не помеченный как бонус. **Это тот же
класс бага**, что уже был найден и исправлен в этом проекте раньше
(поля `categoryId`/`transactionDate` были добавлены в тип, но не
прокинуты в тело запроса — обнаружено отдельно, уже после того, как тип
был расширен) — в этот раз не повторять, чинить в той же задаче, что и
добавление типа, а не отдельным поздним патчем.

Найти в `store.tsx` вызов `paymentApi.create({...})` внутри `addPayment`
и добавить строку в объект:
```typescript
      funding_source: created.fundingSource,
```
(рядом с уже существующей строкой `category: created.category ?? ...`).

**Проверка:**
```bash
npm run build
```
Чисто, без новых ошибок. Дополнительно — прочитать текущее тело
`addPayment` целиком перед правкой (файл мог измениться со времени
написания этого плана) и убедиться, что новая строка действительно
попадает в объект, который передаётся в `paymentApi.create(...)`, а не
в какой-то промежуточный, не доходящий до запроса.

**Коммит:**
```bash
git add src/lib/data/types.ts src/lib/data/mappers.ts src/lib/data/store.tsx
git commit -m "feat(frontend): add bonusBalance/fundingSource types, mapping, and forward fundingSource into the actual API request"
```

---

### Task 15: Фронтенд UI — начисление бонуса + колонка «Бонус» в Финансах

**Файлы:**
- Изменить: `src/routes/admin/finance.tsx`
- Изменить: `src/routes/director/finance.tsx`

**Контекст.** Прочитать `admin/finance.tsx` полностью перед правкой —
скопировать структуру существующего `PaymentDialog` (ученик, сумма через
`NumberInput`, метод, комментарий, вызов `addPayment`) как образец для
нового диалога начисления бонуса. `director/finance.tsx` сегодня НЕ
умеет создавать платежи вообще (только читает и позволяет сторно) —
кнопка «Начислить бонус» будет первым действием создания на этой
странице.

**В обеих страницах** добавить:
1. Кнопку «Начислить бонус» рядом с уже существующими кнопками действий
   в шапке страницы (в `admin/finance.tsx` — рядом с «Добавить расход»/
   «Принять оплату»; в `director/finance.tsx` — новый блок действий,
   т.к. там сейчас действий создания нет вообще, следовать паттерну
   расположения кнопок, уже принятому в `admin/finance.tsx`, для
   визуальной согласованности между двумя страницами).
2. Диалог начисления бонуса (`Dialog`, не reuse существующего
   `PaymentDialog`, т.к. набор полей отличается — нет выбора метода
   оплаты, обязательна причина): выбор ученика (тот же паттерн выбора,
   что в `PaymentDialog` этой же страницы), сумма (`NumberInput`,
   `allowNegative={false}` если проп поддерживает — проверить сигнатуру
   `NumberInput` в `src/components/edu/number-input.tsx`), причина
   (`Textarea`, `required`, валидация на пустоту перед отправкой —
   `toast.error` при попытке отправить без причины, по установленному в
   проекте паттерну обязательных полей).
3. Отправка: `addPayment({ studentId: <выбранный>, branchId:
   <по паттерну этой же страницы для остальных платежей>, amount:
   <введённая сумма>, direction: "in", type: "top_up", method: "",
   category: "", comment: <причина>, fundingSource: "bonus" })` —
   **проверить актуальную сигнатуру `addPayment` в `src/lib/data/store.tsx`
   перед вызовом**, поля должны совпасть с тем, что реально принимает
   функция (она уже была расширена в прошлых задачах этого проекта,
   сверить с фактическим кодом, не с этим планом, если они разойдутся —
   план мог устареть к моменту реализации).
4. После успеха — `toast.success` с суммой и именем ученика, закрыть
   диалог, дать стору обновиться обычным способом (как уже происходит
   после `addPayment` на этой же странице для обычных платежей — не
   изобретать отдельный механизм обновления).

**В таблице «Кошельки»** (обе страницы) — добавить колонку «Бонус» сразу
после существующей колонки «Баланс», отображающую `student.bonusBalance
?? 0` в том же формате (`formatMoney`), что и основной баланс.

**Проверка:**
```bash
npm run build
```
Чисто. Также — прочитать `.claude/skills/design-system/SKILL.md` (или
эквивалентный файл дизайн-системы проекта — `educrm-deploy:design-system`)
перед версткой диалога: `NumberInput` вместо нативного `input
type=number`, `ConfirmDialog` НЕ нужен для самого начисления (это не
разрушительное действие, разрушительное — только отмена, которая уже
идёт через существующий механизм сторно), но структура диалога должна
соответствовать 8 столпам UI проекта (минимум 5 состояний на элемент,
обратная связь на каждое действие через toast).

**Коммит:**
```bash
git add src/routes/admin/finance.tsx src/routes/director/finance.tsx
git commit -m "feat(finance): grant-bonus dialog and bonus column in Кошельки table, both admin and director"
```

---

### Task 16: Фронтенд UI — отображение бонуса в личных кабинетах

**Файлы:**
- Изменить: `src/routes/student/index.tsx`
- Изменить: `src/routes/student/profile.tsx`
- Изменить: `src/routes/parent/children.tsx`

**Контекст.** Прочитать каждый файл, найти место, где сейчас
отображается баланс ученика (карточка/строка/статистика с балансом —
конкретное место в каждом файле уже задокументировано в
`docs/PLATFORM_OVERVIEW.md`, раздел про соответствующую страницу).

**В каждом из трёх мест** — добавить вторую строку/значение «Бонус:
<сумма>» **только если** `bonusBalance` определён и больше нуля (`{
student.bonusBalance != null && student.bonusBalance > 0 && (...) }`) —
не показывать нулевой/неопределённый бонус тем, у кого его никогда не
было, чтобы не захламлять интерфейс сущностью, которая к пользователю
не относится. Использовать тот же визуальный паттерн (шрифт/цвет), что
уже применяется к отображению основного баланса на этой же странице —
не изобретать новый стиль для второго числа.

**Проверка:**
```bash
npm run build
```
Чисто.

**Коммит:**
```bash
git add src/routes/student/index.tsx src/routes/student/profile.tsx src/routes/parent/children.tsx
git commit -m "feat(frontend): show bonus balance in student/parent portals when present"
```

---

### Task 17: Финальный целостный ревью всей ветки

Не отдельная кодовая задача — дождаться завершения Task 1–16 (каждая уже
прошла implementer → spec-compliance review → code-quality review), затем
дождаться дополнительного целостного ревью всего диапазона
`master...feature/student-bonus-balance` разом, отдельным ревьюером
(не переиспользовать отчёт последней точечной задачи).

**Обязательно перепроверить свежим взглядом:**
- Все 9 мест из Task 5–8 действительно переведены на
  `with_combined_balance` — `grep -rn "wallet_balance__lt\|wallet_balance__gte"
  backend/apps/` не находит ничего вне `with_combined_balance` и
  `update_debtor_statuses`/миграций.
- `_status_changed_for_balance` (старое имя) нигде не осталось — ни в
  коде, ни в комментариях.
- `funding_source` пробрасывается во ВСЕХ ветках `reverse_payment()`, не
  только в `top_up`.
- `finance/urls.py` не менялся не по делу (новый эндпоинт не создавался,
  как и планировалось).
- `director/finance.tsx` и `admin/finance.tsx` — новая кнопка/диалог
  добавлены единообразно, без визуального рассинхрона между двумя
  страницами.

**Прогнать:**
```bash
cd backend
python manage.py check
python manage.py makemigrations --check --dry-run
python -m pytest --ignore=test_student.py -q
cd ..
npm run build
npx tsc --noEmit  # сравнить количество ошибок с базовым уровнем на момент начала этой ветки, новых быть не должно
npx playwright test
```
Все — чисто/на прежнем базовом уровне, ноль новых провалов.

---

### Task 18: Мерж в staging → проверка → мерж в master → проверка

**Шаг 1.** Смержить `feature/student-bonus-balance` в `staging`
(fast-forward, если возможно — проверить `git merge-base --is-ancestor
staging feature/student-bonus-balance` перед мержем; если staging успел
уйти вперёд с момента создания ветки — обычный merge commit, не
force). Запушить.

**Шаг 2.** Дождаться деплоя, проверить здоровье через Railway MCP
(`environment-status` на staging-окружении) — все сервисы `online`,
`SUCCESS`, ноль `recentFailures`. Прочитать логи деплоя backend-сервиса
(`get-logs`, фильтр по `migrat|health|Traceback|error`) — миграции
`0009`/`0008` (finance/students) применились без ошибок на всех
тенантских схемах, health-check вернул 200.

**Шаг 3.** Только после подтверждённого здорового staging — смержить
`staging` в `master` тем же способом, запушить.

**Шаг 4.** Дождаться деплоя прод-окружения, повторить ту же проверку
здоровья (Railway MCP, логи миграций, health-check 200) на
production-окружении.

**Шаг 5.** Обновить `CLAUDE.md` — секция статуса: фича бонусного баланса
реализована и задеплоена, дата, что именно изменилось, известные
компромиссы v1 (нет срока действия бонуса, нет ручного списания бонуса
кроме как за урок, нет массового начисления) — тем же стилем, что уже
использован для записи о роли «Бухгалтер» в этом же файле.

**Не мержить в master, если staging показал хоть один
`recentFailures > 0` или сервис не `online`** — сначала диагностировать
и исправить, только потом продолжать.
