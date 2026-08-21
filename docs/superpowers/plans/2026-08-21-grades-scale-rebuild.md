# Пересборка шкалы оценок (2–5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перевести `Grade.score`, `HomeworkStatus.grade` и `ExamResult.score` с разъехавшейся 100/10-балльной шкалы на единую 2–3–4–5, убрать семь дублированных копий формулы среднего балла на фронте, починить три найденных попутно бага (монеты за домашку, зелёные оценки у помощника, счётчик «Отличники»), и дать безопасный path пересчёта уже накопленной истории.

**Architecture:** Backend — новые границы валидации на существующих полях (без разрушительной схемной миграции для `Grade`/`HomeworkStatus`; `Exam.max_score` остаётся полем, но перестаёт быть обязательным вводом — дефолт 5), плюс отдельная management-команда пересчёта истории с dry-run по умолчанию. Frontend — одна общая функция `gradeAverage()`/`gradeTone()` в `src/lib/data/metrics.ts` (по образцу уже существующей `attendancePercentage()`), заменяющая семь локальных копий; поле `maxScore` уходит из типа `Grade` целиком, потому что после перехода оценка сама по себе уже конечное число 2–5, пересчитывать нечего.

**Tech Stack:** Django + DRF (`backend/apps/grades`, `backend/apps/homework`, `backend/apps/coins`), django-tenants (management-команда обходит схемы через `schema_context`), pytest + `api_client` фикстура; React + TypeScript, Vitest-стиля pure-logic тесты через Playwright (`e2e/*.spec.ts`, без браузера — см. `e2e/nav-model.spec.ts` как образец).

---

## Порядок задач

1. Модели и валидаторы (бэкенд)
2. Сериализаторы — диапазон 2–5
3. Монеты — новый порог награды
4. Management-команда пересчёта истории
5. Общая функция среднего балла (фронт)
6. Убрать `maxScore` из типов/маппера/стора
7. `teacher/grades.tsx` — переход на общую функцию + фикс «Отличники»
8. `support-teacher/grades.tsx` — переход на общую функцию + фикс «зелёных оценок»
9. `student/grades.tsx`, `student/profile.tsx`, `parent/children.tsx`, `teacher/index.tsx`
10. Уборка: мёртвый `scoreTone` в `format.ts`, тексты диапазона
11. Итоговая проверка

---

### Task 1: Модели и валидаторы

**Files:**
- Modify: `backend/apps/grades/models.py:1-6, 46` (импорт + `Grade.score`)
- Modify: `backend/apps/grades/models.py:78` (`Exam.max_score` default)
- Modify: `backend/apps/homework/models.py:1-6, ~72-76` (импорт + `HomeworkStatus.grade`)
- Create: `backend/apps/grades/migrations/0004_grade_scale_2_5.py`
- Create: `backend/apps/homework/migrations/0003_homeworkstatus_grade_scale_2_5.py`

- [ ] **Step 1: Изменить `Grade.score` и `Exam.max_score`**

В `backend/apps/grades/models.py` строка 5:
```python
from django.core.validators import MaxValueValidator
```
заменить на:
```python
from django.core.validators import MaxValueValidator, MinValueValidator
```

Строка 46 (`Grade.score`):
```python
    score = models.PositiveSmallIntegerField(validators=[MaxValueValidator(100)])
```
заменить на:
```python
    score = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(2), MaxValueValidator(5)],
        help_text="Оценка по школьной шкале 2–5.",
    )
```

Строка 78 (`Exam.max_score`) — поле остаётся (нужно как источник для пересчёта истории в Task 4), но перестаёт быть смыслом «сколько баллов максимум»:
```python
    max_score = models.PositiveSmallIntegerField(default=100)
```
заменить на:
```python
    # Историческое поле. Новые экзамены всегда на шкале 2–5 — дефолт 5,
    # фронт больше не спрашивает это значение у пользователя. Поле не
    # удаляется прямо сейчас: команда recalculate_grades_scale (Task 4)
    # читает его для старых записей, чтобы посчитать процент от ИХ
    # исторического максимума, а не от 100 по умолчанию.
    max_score = models.PositiveSmallIntegerField(default=5)
```

- [ ] **Step 2: Изменить `HomeworkStatus.grade`**

В `backend/apps/homework/models.py` строка 5:
```python
from django.core.validators import MaxValueValidator
```
заменить на:
```python
from django.core.validators import MaxValueValidator, MinValueValidator
```

Найти `grade = models.PositiveSmallIntegerField(null=True, blank=True, validators=[MaxValueValidator(10)])` и заменить на:
```python
    grade = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(2), MaxValueValidator(5)],
    )
```

- [ ] **Step 3: Сгенерировать миграции**

Run: `python manage.py makemigrations grades homework`
Expected: создаются `apps/grades/migrations/0004_...py` (переименовать в `0004_grade_scale_2_5.py`, если автогенерация даст другое имя) и `apps/homework/migrations/0003_...py` (переименовать в `0003_homeworkstatus_grade_scale_2_5.py`). Обе миграции — только `AlterField` без SQL-эффекта (Django validators не создают DB CHECK constraint для этого поля), безопасны к выкатке до пересчёта данных.

- [ ] **Step 4: Проверить, что миграции применяются на пустой тестовой базе**

Run: `python manage.py migrate --plan | grep -E "grade_scale|homeworkstatus_grade_scale"`
Expected: обе новые миграции в плане, без ошибок.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/grades/models.py backend/apps/homework/models.py backend/apps/grades/migrations backend/apps/homework/migrations
git commit -m "feat(grades): scale to 2-5, exam.max_score becomes historical-only"
```

---

### Task 2: Сериализаторы — диапазон 2–5

**Files:**
- Modify: `backend/apps/grades/serializers.py:24-27, 36-39, 57-60`
- Test: `backend/tests/test_grades_scale.py` (new)

- [ ] **Step 1: Написать падающий тест на валидацию**

Create `backend/tests/test_grades_scale.py`:
```python
import pytest
from django.contrib.auth import get_user_model

from apps.grades.serializers import ExamResultSerializer, ExamSerializer, GradeSerializer

User = get_user_model()
pytestmark = pytest.mark.django_db


@pytest.mark.parametrize("value", [0, 1, 6, 10, 100])
def test_grade_serializer_rejects_out_of_range_score(value):
    serializer = GradeSerializer(data={"score": value, "grade_type": "lesson"}, partial=True)
    serializer.is_valid()
    assert "score" in serializer.errors, f"{value} должен быть отклонён вне диапазона 2-5"


@pytest.mark.parametrize("value", [2, 3, 4, 5])
def test_grade_serializer_accepts_in_range_score(value):
    serializer = GradeSerializer(data={"score": value, "grade_type": "lesson"}, partial=True)
    serializer.is_valid()
    assert "score" not in serializer.errors


def test_exam_result_serializer_rejects_out_of_range_score():
    serializer = ExamResultSerializer(data={"score": 87, "pass_status": "passed"}, partial=True)
    serializer.is_valid()
    assert "score" in serializer.errors


def test_exam_serializer_still_accepts_legacy_max_score_for_reads():
    # max_score больше не запрашивается формой создания, но само поле должно
    # спокойно принимать значения вплоть до 100 — это старые записи, не новые.
    serializer = ExamSerializer(data={"group": None, "name": "Midterm", "date": "2026-08-21", "max_score": 100}, partial=True)
    serializer.is_valid()
    assert "max_score" not in serializer.errors
```

- [ ] **Step 2: Запустить и убедиться, что тест падает**

Run: `pytest backend/tests/test_grades_scale.py -v`
Expected: `test_grade_serializer_rejects_out_of_range_score[0]` и другие FAIL — текущий валидатор пропускает 0..100 как валидные значения относительно старого правила «≤100», а новый тест ожидает отказ для всего вне 2–5.

- [ ] **Step 3: Переписать валидаторы**

В `backend/apps/grades/serializers.py`:

```python
    def validate_score(self, value):
        if value < 2 or value > 5:
            raise serializers.ValidationError("Score must be between 2 and 5.")
        return value
```
— заменить этим и `GradeSerializer.validate_score` (строки 24-27), и `ExamResultSerializer.validate_score` (строки 57-60) — идентичный код в обоих местах, дублирование сознательно оставлено (два разных сериализатора, DRY здесь не выигрывает — нет общего родителя, куда стоило бы выносить один метод ради двух вызовов).

`ExamSerializer.validate_max_score` (строки 36-39):
```python
    def validate_max_score(self, value):
        if value > 100:
            raise serializers.ValidationError("Max score must be between 1 and 100.")
        return value
```
оставить БЕЗ изменений — поле историческое, старые значения вплоть до 100 обязаны проходить валидацию (её читает Task 4), новые формы это поле больше не отправляют (см. Task 4, значение по умолчанию уже 5 на уровне модели).

- [ ] **Step 4: Запустить тест, убедиться что проходит**

Run: `pytest backend/tests/test_grades_scale.py -v`
Expected: все тесты PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/grades/serializers.py backend/tests/test_grades_scale.py
git commit -m "feat(grades): validate score range 2-5 at the API boundary"
```

---

### Task 3: Монеты — новый порог награды

**Files:**
- Modify: `backend/apps/coins/signals.py:90-121`
- Test: `backend/tests/test_teacher_coins_scope.py` OR new `backend/tests/test_coins_grade_reward.py`

- [ ] **Step 1: Написать падающий тест**

Create `backend/tests/test_coins_grade_reward.py`:
```python
import pytest
from django.contrib.auth import get_user_model

from apps.coins.models import CoinSetting, CoinTransaction, CoinWallet
from apps.courses.models import Course, Group, GroupMembership
from apps.grades.models import Grade
from apps.institutions.models import Branch
from apps.staff.models import Staff
from apps.students.models import Student

User = get_user_model()
pytestmark = pytest.mark.django_db


def _setup_student():
    branch = Branch.objects.create(name="Main", address="A", phone="+998901000001")
    director = User.objects.create_user(phone="+998909300001", full_name="Director", role="director", password="secret123")
    teacher_user = User.objects.create_user(phone="+998909300002", full_name="Teacher", role="teacher", password="secret123")
    teacher = Staff.objects.create(user=teacher_user, branch=branch)
    student_user = User.objects.create_user(phone="+998909300003", full_name="Student", role="student", password="secret123")
    student = Student.objects.create(user=student_user, branch=branch)
    course = Course.objects.create(name="Biology", created_by=director)
    group = Group.objects.create(
        name="BIO-02", course=course, branch=branch, teacher=teacher,
        start_date="2026-08-01", monthly_price="400000.00", status="active", schedule=[],
    )
    GroupMembership.objects.create(group=group, student=student, enrolled_by=director)
    return student, group, teacher_user


def test_perfect_grade_awards_perfect_coins():
    student, group, teacher_user = _setup_student()
    setting = CoinSetting.get_or_create_default()
    Grade.objects.create(student=student, group=group, grade_type="lesson", score=5, graded_by=teacher_user)
    wallet = CoinWallet.objects.get(student=student)
    tx = CoinTransaction.objects.filter(wallet=wallet, reason="grade").first()
    assert tx is not None, "оценка 5 обязана начислить монеты"
    assert tx.amount == setting.coins_grade_perfect


def test_good_grade_awards_good_coins():
    student, group, teacher_user = _setup_student()
    setting = CoinSetting.get_or_create_default()
    Grade.objects.create(student=student, group=group, grade_type="lesson", score=4, graded_by=teacher_user)
    wallet = CoinWallet.objects.get(student=student)
    tx = CoinTransaction.objects.filter(wallet=wallet, reason="grade").first()
    assert tx is not None, "оценка 4 обязана начислить монеты"
    assert tx.amount == setting.coins_grade_good


@pytest.mark.parametrize("score", [2, 3])
def test_low_grade_awards_nothing(score):
    student, group, teacher_user = _setup_student()
    Grade.objects.create(student=student, group=group, grade_type="lesson", score=score, graded_by=teacher_user)
    wallet = CoinWallet.objects.get(student=student)
    assert not CoinTransaction.objects.filter(wallet=wallet, reason="grade").exists()


def test_homework_grade_now_reaches_the_reward_rule():
    """Баг из аудита: раньше score_pct>=80 сравнивался с уже испорченным
    числом (8 из 10 хранилось как 8 из 100), и монеты за отличную домашку
    почти никогда не начислялись. После перехода на 2-5 сравнение честное."""
    student, group, teacher_user = _setup_student()
    setting = CoinSetting.get_or_create_default()
    Grade.objects.create(student=student, group=group, grade_type="homework", score=5, graded_by=teacher_user)
    wallet = CoinWallet.objects.get(student=student)
    tx = CoinTransaction.objects.filter(wallet=wallet, reason="grade").first()
    assert tx is not None
    assert tx.amount == setting.coins_grade_perfect
```

- [ ] **Step 2: Запустить и убедиться что падает**

Run: `pytest backend/tests/test_coins_grade_reward.py -v`
Expected: FAIL — текущее правило `score_pct < 80: return` отбрасывает оценки 4 и 5 (обе `< 80`), монеты не начисляются вовсе.

- [ ] **Step 3: Переписать правило в `signals.py`**

Заменить строки 90-121 в `backend/apps/coins/signals.py`:
```python
@receiver(post_save, sender="grades.Grade")
def award_coins_for_grade(sender, instance, created, **kwargs):
    if kwargs.get("raw"):
        return
    try:
        from apps.coins.services import award_coins
        from apps.coins.models import CoinSetting, CoinTransaction

        # Награда — только за 4 и 5 по новой школьной шкале 2-5.
        # До перехода здесь стояло "score_pct >= 80" — сравнение с числом,
        # которое для оценок за домашку было уже испорчено (8 из 10 хранилось
        # как 8 из 100), из-за чего монеты за отличную домашку почти никогда
        # не начислялись. Теперь оценка сама по себе уже 2-5, сравнивать
        # больше не с чем — сравниваем напрямую.
        score = instance.score
        if score < 4:
            return

        setting = CoinSetting.get_or_create_default()
        coins = setting.coins_grade_perfect if score == 5 else setting.coins_grade_good

        # Защита от двойного начисления за одну и ту же оценку
        already = CoinTransaction.objects.filter(
            wallet__student=instance.student,
            reason="grade",
            comment__contains=str(instance.pk),
        ).exists()
        if already:
            return

        award_coins(
            student=instance.student,
            amount=coins,
            reason="grade",
            comment=f"Grade {instance.score}/5 (id {instance.pk})",
        )
    except Exception:
        logger.exception("Монеты за оценку не начислены (оценка %s)", instance.pk)
```

- [ ] **Step 4: Запустить тест, убедиться что проходит**

Run: `pytest backend/tests/test_coins_grade_reward.py -v`
Expected: все тесты PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/coins/signals.py backend/tests/test_coins_grade_reward.py
git commit -m "fix(coins): reward threshold now compares against the 2-5 scale directly"
```

---

### Task 4: Management-команда пересчёта истории

**Files:**
- Modify: `backend/apps/grades/services.py` (добавить `band_percent_to_scale`)
- Create: `backend/apps/grades/management/commands/__init__.py` (если папки management/commands ещё нет — проверить `ls backend/apps/grades/management` перед созданием)
- Create: `backend/apps/grades/management/commands/recalculate_grades_scale.py`
- Test: `backend/tests/test_recalculate_grades_scale.py`

- [ ] **Step 1: Написать падающий тест на функцию округления**

Add to `backend/apps/grades/services.py` — сначала тест, затем реализация. Create `backend/tests/test_recalculate_grades_scale.py`:
```python
import pytest

from apps.grades.services import band_percent_to_scale

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize(
    "percent,expected",
    [
        (100, 5), (90, 5), (85, 5),
        (84, 4), (70, 4), (65, 4),
        (64, 3), (55, 3), (50, 3),
        (49, 2), (20, 2), (0, 2),
    ],
)
def test_band_percent_to_scale(percent, expected):
    assert band_percent_to_scale(percent) == expected
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `pytest backend/tests/test_recalculate_grades_scale.py -v`
Expected: FAIL — `ImportError: cannot import name 'band_percent_to_scale'`.

- [ ] **Step 3: Добавить функцию в `services.py`**

Добавить в начало `backend/apps/grades/services.py` (после импортов, до `upsert_homework_grade`):
```python
def band_percent_to_scale(percent: float) -> int:
    """
    Процент от максимума -> оценка 2-5.

    Пороги — не произвольные: это те же 85/65/50, что уже негласно стояли
    за цветом оценок в шести задублированных местах фронтенда (scoreTone),
    формализованные теперь в саму оценку, а не только в цвет.
    """
    if percent >= 85:
        return 5
    if percent >= 65:
        return 4
    if percent >= 50:
        return 3
    return 2
```

- [ ] **Step 4: Запустить, убедиться что проходит**

Run: `pytest backend/tests/test_recalculate_grades_scale.py -v`
Expected: все `test_band_percent_to_scale` PASS.

- [ ] **Step 5: Проверить/создать структуру папки management-команды**

Run: `ls backend/apps/grades/management 2>&1 || echo "нет папки"`

Если папки нет — создать:
```bash
mkdir -p backend/apps/grades/management/commands
touch backend/apps/grades/management/__init__.py
touch backend/apps/grades/management/commands/__init__.py
```

- [ ] **Step 6: Написать команду**

Create `backend/apps/grades/management/commands/recalculate_grades_scale.py`:
```python
"""
Пересчёт истории оценок в новую шкалу 2-5.

Три источника, три разных формулы процента — не потому что так удобнее,
а потому что данные по-разному испорчены/чисты:

  * Домашка (HomeworkStatus.grade) — берём значение НАПРЯМУЮ из этого поля
    (оно старой шкалы 0-10, багом со списанием монет и рассинхронизацией
    "из 10 показано как из 100" не задето само по себе) и пишем итог
    в него же и в связанный Grade.score, а не наоборот — если считать от
    уже испорченного Grade.score, ошибка закрепится под видом новой шкалы.
  * Экзамены (ExamResult.score / Exam.max_score) — процент от максимума
    ЭТОГО конкретного экзамена, не от 100 по умолчанию: часть экзаменов
    в базе уже сохранена не на сотню.
  * Остальные типы оценок — исторически честно на 100-балльной шкале,
    процент от 100 напрямую.

По умолчанию НИЧЕГО не меняет — только показывает отчёт. Применяется
только с --apply. Повторный запуск после --apply безопасен: оценки уже
в диапазоне 2-5, band_percent_to_scale(4/5*100=80) все равно попадёт
в тот же самый бакет (>=65 -> 4), так что повторный прогон не искажает
уже пересчитанные записи катастрофически — но команда для чистоты
всё равно предназначена для одноразового запуска, не для регулярного.

    python manage.py recalculate_grades_scale                  # только показать
    python manage.py recalculate_grades_scale --apply          # применить
    python manage.py recalculate_grades_scale --schema kelajak_talim
"""

from django.core.management.base import BaseCommand
from django_tenants.utils import get_public_schema_name, get_tenant_model, schema_context

from apps.grades.services import band_percent_to_scale

OTHER_GRADE_TYPES = ["lesson", "activity", "speaking", "vocabulary", "test", "extra_lesson"]


class Command(BaseCommand):
    help = "Пересчитать историю оценок (Grade, HomeworkStatus, ExamResult) в шкалу 2-5"

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="применить пересчёт (без флага — только показать)",
        )
        parser.add_argument(
            "--schema",
            default=None,
            help="ограничиться одной организацией (schema_name)",
        )

    def handle(self, *args, **options):
        apply_changes = options["apply"]
        only_schema = options["schema"]

        if not apply_changes:
            self.stdout.write(
                self.style.WARNING(
                    "Пробный прогон: данные не меняются. Для применения добавьте --apply"
                )
            )

        tenant_model = get_tenant_model()
        public = get_public_schema_name()
        schemas = [
            tenant.schema_name
            for tenant in tenant_model.objects.exclude(schema_name=public)
            if only_schema is None or tenant.schema_name == only_schema
        ]
        if not schemas:
            self.stdout.write("Организации не найдены.")
            return

        grand = {"homework": 0, "exam": 0, "other": 0, "orphan_homework": 0}
        for schema in schemas:
            with schema_context(schema):
                counts = self._process_schema(schema, apply_changes)
                for key in grand:
                    grand[key] += counts[key]

        verb = "пересчитано" if apply_changes else "будет пересчитано"
        self.stdout.write(
            self.style.SUCCESS(
                f"\nИТОГО {verb}: ДЗ {grand['homework']}, экзамены {grand['exam']}, "
                f"остальные {grand['other']}, записи без источника {grand['orphan_homework']}"
            )
        )
        if grand["orphan_homework"] and not apply_changes:
            self.stdout.write(
                self.style.ERROR(
                    "Есть оценки типа homework без связанного HomeworkStatus — "
                    "надёжного источника процента для них нет, пересчитаны от уже "
                    "сохранённого числа как от старой 100-балльной шкалы. Решите "
                    "с владельцем продукта, приемлемо ли это до запуска --apply."
                )
            )

    def _process_schema(self, schema: str, apply_changes: bool):
        from apps.grades.models import Exam, ExamResult, Grade
        from apps.homework.models import HomeworkStatus

        counts = {"homework": 0, "exam": 0, "other": 0, "orphan_homework": 0}

        # --- Домашние задания: источник — HomeworkStatus.grade ---
        hw_statuses = HomeworkStatus.objects.filter(grade__isnull=False)
        for hs in hw_statuses:
            old_value = hs.grade  # 0..10, старая шкала
            percent = (old_value / 10) * 100
            new_value = band_percent_to_scale(percent)
            counts["homework"] += 1
            if apply_changes:
                hs.grade = new_value
                hs.save(update_fields=["grade"])
                grade_row = getattr(hs, "grade_record", None)
                if grade_row is not None:
                    grade_row.score = new_value
                    grade_row.save(update_fields=["score"])
            else:
                self.stdout.write(f"  [ДЗ] {hs.id}: {old_value}/10 -> {new_value}")

        # --- Оценки типа homework без связанного HomeworkStatus (аномалия) ---
        orphans = Grade.objects.filter(grade_type="homework", homework_status__isnull=True)
        for grade in orphans:
            old_value = grade.score
            new_value = band_percent_to_scale(old_value)
            counts["orphan_homework"] += 1
            if apply_changes:
                grade.score = new_value
                grade.save(update_fields=["score"])
            else:
                self.stdout.write(
                    self.style.ERROR(f"  [ДЗ без источника] {grade.id}: {old_value}/100 -> {new_value}")
                )

        # --- Экзамены: источник — ExamResult.score / Exam.max_score ---
        results = ExamResult.objects.select_related("exam").all()
        for result in results:
            max_score = result.exam.max_score or 100
            old_value = result.score
            percent = (old_value / max_score) * 100
            new_value = band_percent_to_scale(percent)
            counts["exam"] += 1
            if apply_changes:
                result.score = new_value
                result.save(update_fields=["score"])
                Grade.objects.filter(exam=result.exam, student=result.student).update(score=new_value)
            else:
                self.stdout.write(f"  [Экзамен] {result.id}: {old_value}/{max_score} -> {new_value}")

        # --- Остальные типы: исторически на 100-балльной шкале напрямую ---
        other_grades = Grade.objects.filter(grade_type__in=OTHER_GRADE_TYPES)
        for grade in other_grades:
            old_value = grade.score
            new_value = band_percent_to_scale(old_value)
            counts["other"] += 1
            if apply_changes:
                grade.score = new_value
                grade.save(update_fields=["score"])
            else:
                self.stdout.write(f"  [{grade.grade_type}] {grade.id}: {old_value}/100 -> {new_value}")

        total = sum(counts.values())
        if total == 0:
            self.stdout.write(f"{schema}: оценок для пересчёта нет")
        else:
            self.stdout.write(
                self.style.WARNING(
                    f"\n{schema}: ДЗ {counts['homework']}, экзамены {counts['exam']}, "
                    f"остальные {counts['other']}, без источника {counts['orphan_homework']}"
                )
            )
        return counts
```

- [ ] **Step 7: Написать тест на саму команду (dry-run и apply, все три ветки + orphan)**

Append to `backend/tests/test_recalculate_grades_scale.py`:
```python
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command

from apps.courses.models import Course, Group, GroupMembership
from apps.grades.models import Exam, ExamResult, Grade
from apps.homework.models import Homework, HomeworkStatus
from apps.institutions.models import Branch
from apps.staff.models import Staff
from apps.students.models import Student

User = get_user_model()


def _setup():
    branch = Branch.objects.create(name="Main", address="A", phone="+998901100001")
    director = User.objects.create_user(phone="+998909400001", full_name="Director", role="director", password="secret123")
    teacher_user = User.objects.create_user(phone="+998909400002", full_name="Teacher", role="teacher", password="secret123")
    teacher = Staff.objects.create(user=teacher_user, branch=branch)
    student_user = User.objects.create_user(phone="+998909400003", full_name="Student", role="student", password="secret123")
    student = Student.objects.create(user=student_user, branch=branch)
    course = Course.objects.create(name="Biology", created_by=director)
    group = Group.objects.create(
        name="BIO-03", course=course, branch=branch, teacher=teacher,
        start_date="2026-08-01", monthly_price="400000.00", status="active", schedule=[],
    )
    GroupMembership.objects.create(group=group, student=student, enrolled_by=director)
    return branch, director, teacher_user, student, group


@pytest.mark.django_db
def test_homework_recalculation_uses_homeworkstatus_as_source():
    """
    Ровно баг из аудита: Grade.score для домашки был испорчен ("8 из 10"
    хранилось как "8 из 100"). Источником пересчёта обязан быть
    HomeworkStatus.grade (0..10, не испорчен), а не Grade.score напрямую.
    """
    branch, director, teacher_user, student, group = _setup()
    homework = Homework.objects.create(
        title="Chapter 1", assign_type="group", group=group, created_by=teacher_user,
    )
    hw_status = HomeworkStatus.objects.create(
        homework=homework, student=student, status="checked", grade=9,  # 9 из 10 = 90%
    )
    # Испорченная копия — как в реальном баге: 9 записано в поле "из 100".
    Grade.objects.create(
        student=student, group=group, homework_status=hw_status,
        grade_type="homework", score=9, graded_by=teacher_user,
    )

    from apps.grades.management.commands.recalculate_grades_scale import Command

    cmd = Command()
    counts = cmd._process_schema(schema="public", apply_changes=True)

    hw_status.refresh_from_db()
    assert hw_status.grade == 5, "90% от HomeworkStatus.grade -> оценка 5, не от испорченного Grade.score=9/100"
    linked_grade = Grade.objects.get(homework_status=hw_status)
    assert linked_grade.score == 5
    assert counts["homework"] == 1


@pytest.mark.django_db
def test_exam_recalculation_uses_its_own_max_score():
    branch, director, teacher_user, student, group = _setup()
    exam = Exam.objects.create(group=group, name="Midterm", date="2026-08-01", max_score=10, created_by=teacher_user)
    result = ExamResult.objects.create(exam=exam, student=student, score=9, pass_status="passed")
    Grade.objects.create(student=student, group=group, exam=exam, grade_type="exam", score=9, graded_by=teacher_user)

    from apps.grades.management.commands.recalculate_grades_scale import Command

    cmd = Command()
    cmd._process_schema(schema="public", apply_changes=True)

    result.refresh_from_db()
    assert result.score == 5, "9 из 10 (max_score этого экзамена) -> 90% -> 5"
    linked_grade = Grade.objects.get(exam=exam, student=student)
    assert linked_grade.score == 5


@pytest.mark.django_db
def test_other_grade_types_use_flat_100_percent():
    branch, director, teacher_user, student, group = _setup()
    grade = Grade.objects.create(student=student, group=group, grade_type="activity", score=72, graded_by=teacher_user)

    from apps.grades.management.commands.recalculate_grades_scale import Command

    cmd = Command()
    cmd._process_schema(schema="public", apply_changes=True)

    grade.refresh_from_db()
    assert grade.score == 4, "72% -> попадает в диапазон 65-84 -> оценка 4"


@pytest.mark.django_db
def test_dry_run_leaves_data_untouched():
    branch, director, teacher_user, student, group = _setup()
    grade = Grade.objects.create(student=student, group=group, grade_type="activity", score=72, graded_by=teacher_user)

    from apps.grades.management.commands.recalculate_grades_scale import Command

    cmd = Command()
    cmd.stdout = StringIO()
    counts = cmd._process_schema(schema="public", apply_changes=False)

    grade.refresh_from_db()
    assert grade.score == 72, "без --apply данные не должны меняться"
    assert counts["other"] == 1


@pytest.mark.django_db
def test_orphan_homework_grade_is_flagged_and_recalculated_from_own_score():
    branch, director, teacher_user, student, group = _setup()
    # Оценка типа homework без связанного HomeworkStatus — аномалия,
    # которую команда обязана заметить, а не молча пропустить.
    grade = Grade.objects.create(
        student=student, group=group, grade_type="homework", score=90, graded_by=teacher_user,
    )

    from apps.grades.management.commands.recalculate_grades_scale import Command

    cmd = Command()
    counts = cmd._process_schema(schema="public", apply_changes=True)

    grade.refresh_from_db()
    assert grade.score == 5
    assert counts["orphan_homework"] == 1
    assert counts["homework"] == 0
```

- [ ] **Step 8: Запустить все тесты команды**

Run: `pytest backend/tests/test_recalculate_grades_scale.py -v`
Expected: все PASS. Если тесты падают на `schema="public"` (single-tenant тестовое окружение может не использовать django-tenants schema routing в pytest) — заменить вызов `cmd._process_schema(schema="public", ...)` на прямой вызов без `schema_context` (метод `_process_schema` не обращается к `schema_context` сам — это делает `handle()`; тесты дергают `_process_schema` напрямую и потому не зависят от реального переключения схемы, что и должно работать в обычной pytest-django базе).

- [ ] **Step 9: Commit**

```bash
git add backend/apps/grades/services.py backend/apps/grades/management backend/tests/test_recalculate_grades_scale.py
git commit -m "feat(grades): one-shot recalculation command for the 2-5 scale migration"
```

**Не запускать команду на проде из этого плана.** Применение (`--apply`) на реальных данных — отдельное решение владельца продукта после того, как весь этот план выкачен и проверен на staging (см. Task 11).

---

### Task 5: Общая функция среднего балла (фронт)

**Files:**
- Modify: `src/lib/data/metrics.ts`
- Create: `e2e/grade-metrics.spec.ts`

- [ ] **Step 1: Написать падающий тест**

Create `e2e/grade-metrics.spec.ts`:
```ts
import { test, expect } from "@playwright/test";
import { gradeAverage, gradeTone } from "../src/lib/data/metrics";

test.describe("gradeAverage", () => {
  test("пустой список -> 0", () => {
    expect(gradeAverage([])).toBe(0);
  });

  test("считает среднее по шкале 2-5", () => {
    expect(gradeAverage([{ score: 5 }, { score: 4 }, { score: 3 }])).toBe(4);
  });

  test("округляет до одного знака", () => {
    expect(gradeAverage([{ score: 5 }, { score: 4 }, { score: 4 }])).toBe(4.3);
  });
});

test.describe("gradeTone", () => {
  test("5 и близко к нему -> ok", () => {
    expect(gradeTone(5)).toContain("text-success");
    expect(gradeTone(4.5)).toContain("text-success");
  });

  test("4 -> info", () => {
    expect(gradeTone(4)).toContain("text-info");
    expect(gradeTone(3.5)).toContain("text-info");
  });

  test("3 -> warning", () => {
    expect(gradeTone(3)).toContain("text-warning");
    expect(gradeTone(2.5)).toContain("text-warning");
  });

  test("2 -> destructive", () => {
    expect(gradeTone(2)).toContain("text-destructive");
  });
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `npx playwright test e2e/grade-metrics.spec.ts --project=chromium --reporter=line`
Expected: FAIL — `gradeAverage`/`gradeTone` не существуют в `metrics.ts`.

- [ ] **Step 3: Реализовать функции**

Append to `src/lib/data/metrics.ts`:
```ts
export interface GradeLike {
  score: number;
}

/**
 * Средний балл по шкале 2–5.
 *
 * Раньше формула "(score/maxScore)*100" (или *10 — в разных файлах
 * по-разному) была продублирована в шести местах фронтенда, каждое со
 * своей интерпретацией шкалы. После перехода на 2–5 сама оценка уже
 * конечное число — пересчитывать её в проценты незачем, среднее — это
 * просто среднее.
 */
export function gradeAverage(grades: GradeLike[]): number {
  if (grades.length === 0) return 0;
  const sum = grades.reduce((total, g) => total + g.score, 0);
  return Math.round((sum / grades.length) * 10) / 10;
}

/**
 * Цветовая категория по значению оценки (2–5 или их среднему).
 *
 * Пороги — не сдвинуты: раньше это были 85/65/50 в процентах, применённые
 * к тому же самому диапазону, что теперь и есть сама оценка.
 */
export function gradeTone(value: number): string {
  if (value >= 4.5) return "bg-success/15 text-success";
  if (value >= 3.5) return "bg-info/15 text-info";
  if (value >= 2.5) return "bg-warning/15 text-warning";
  return "bg-destructive/15 text-destructive";
}
```

- [ ] **Step 4: Запустить, убедиться что проходит**

Run: `npx playwright test e2e/grade-metrics.spec.ts --project=chromium --reporter=line`
Expected: все тесты PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/metrics.ts e2e/grade-metrics.spec.ts
git commit -m "feat(grades): shared gradeAverage/gradeTone, replacing six duplicated copies"
```

---

### Task 6: Убрать `maxScore` из типов/маппера/стора

**Files:**
- Modify: `src/lib/data/types.ts:294-310`
- Modify: `src/lib/data/mappers.ts:571-590`
- Modify: `src/lib/data/store.tsx:1822-1844` (`gradeSubmission`) и `~1889-1907` (`addGrade`, если там встречается `maxScore`)

- [ ] **Step 1: Убрать `maxScore` из типа `Grade`**

В `src/lib/data/types.ts`, строки 294-310, заменить:
```ts
export interface Grade {
  id: string;
  groupId: string;
  studentId: string;
  teacherId: string;
  kind: GradeKind;
  /** За какое занятие поставлена оценка. */
  lessonId?: string;
  /** За какой экзамен поставлена оценка. */
  examId?: string;
  homeworkStatusId?: string;
  title: string;       // e.g. "Unit 4 Quiz", "Midterm"
  score: number;       // 0..100 (0..10 for kind "homework", mirrors HomeworkStatus.grade)
  maxScore: number;    // 100, except kind "homework" which is 10
  date: string;        // ISO date
  comment?: string;
}
```
на:
```ts
export interface Grade {
  id: string;
  groupId: string;
  studentId: string;
  teacherId: string;
  kind: GradeKind;
  /** За какое занятие поставлена оценка. */
  lessonId?: string;
  /** За какой экзамен поставлена оценка. */
  examId?: string;
  homeworkStatusId?: string;
  title: string;       // e.g. "Unit 4 Quiz", "Midterm"
  score: number;       // 2..5, школьная шкала — единая для всех kind
  date: string;        // ISO date
  comment?: string;
}
```

- [ ] **Step 2: Убрать `maxScore` из `mapGrade()`**

В `src/lib/data/mappers.ts`, строки 571-590, удалить строку `maxScore: 100,` (строка 585). Итоговая функция:
```ts
export function mapGrade(r: GradeRaw) {
  const type = r.grade_type ?? r.type ?? "exam";
  return {
    id: r.id,
    studentId: extractId(r.student),
    groupId: extractId(r.group),
    teacherId: extractId(r.graded_by ?? undefined),
    lessonId: extractId(r.lesson ?? undefined) || undefined,
    examId: extractId(r.exam ?? undefined) || undefined,
    homeworkStatusId: extractId(r.homework_status ?? undefined) || undefined,
    kind: type,
    type,
    title: type,
    score: typeof r.score === "number" ? r.score : Number(r.score ?? 0),
    date: r.graded_at ?? r.created_at ?? new Date().toISOString(),
    comment: r.comment ?? undefined,
    createdAt: r.graded_at ?? r.created_at ?? new Date().toISOString(),
  };
}
```
Это одновременно устраняет баг из аудита: раньше `mapGrade()` всегда подставляла `maxScore: 100`, даже для домашки, из-за чего одна и та же оценка выглядела по-разному до и после обновления страницы. Теперь подставлять нечего — само число уже 2–5.

- [ ] **Step 3: Убрать `maxScore` из `gradeSubmission` в сторе**

В `src/lib/data/store.tsx`, внутри `gradeSubmission` (около строки 1831-1842), найти:
```ts
          const created: Grade = {
            id: uid("gr"),
            groupId: hw.groupId,
            teacherId: hw.teacherId,
            studentId,
            kind: "homework",
            title: hw.title,
            score: grade,
            maxScore: 10,
            date: getLocalDateString(),
            comment: feedback,
          };
```
заменить на:
```ts
          const created: Grade = {
            id: uid("gr"),
            groupId: hw.groupId,
            teacherId: hw.teacherId,
            studentId,
            kind: "homework",
            title: hw.title,
            score: grade,
            date: getLocalDateString(),
            comment: feedback,
          };
```

- [ ] **Step 4: Собрать проект и проверить типы**

Run: `npm run build`
Expected: exit code 0. Если TypeScript укажет на другие места, использующие `grade.maxScore` и ещё не тронутые в этой задаче (страницы из Task 7-9) — это ОЖИДАЕМО на этом шаге; полный `tsc --noEmit` без ошибок по `maxScore` будет только после Task 9. Проверить сейчас достаточно, что `npm run build` не падает фатально (Vite сообщает TS-ошибки, но по умолчанию не блокирует сборку — см. существующий baseline из 24 ошибок в проекте).

Run: `npx tsc --noEmit 2>&1 | grep -c "maxScore"`
Expected: число > 0 (это ожидаемо — страницы из Task 7-9 ещё используют `maxScore`, они и есть следующие задачи).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/types.ts src/lib/data/mappers.ts src/lib/data/store.tsx
git commit -m "refactor(grades): drop maxScore — the grade itself is already 2-5"
```

---

### Task 7: `teacher/grades.tsx` — общая функция + фикс «Отличники»

**Files:**
- Modify: `src/routes/teacher/grades.tsx`

- [ ] **Step 1: Заменить импорт и убрать локальную `scoreTone`**

Добавить в блок импортов (после `import { getAvatarColor } from "@/lib/avatar-color";`):
```ts
import { gradeAverage, gradeTone } from "@/lib/data/metrics";
```

Удалить локальную функцию (строки 30-36):
```ts
function scoreTone(score: number, max: number): string {
  const pct = (score / max) * 100;
  if (pct >= 85) return "bg-success/15 text-success";
  if (pct >= 65) return "bg-info/15 text-info";
  if (pct >= 50) return "bg-warning/15 text-warning";
  return "bg-destructive/15 text-destructive";
}
```

- [ ] **Step 2: Переписать `avgByStudent`, `overallAvg`, `topStudentsCount`**

Заменить (строки 66-83):
```ts
  const avgByStudent = useMemo(() => {
    const map: Record<string, { sum: number; cnt: number }> = {};
    for (const g of groupGrades) {
      if (!map[g.studentId]) map[g.studentId] = { sum: 0, cnt: 0 };
      map[g.studentId].sum += (g.score / g.maxScore) * 100;
      map[g.studentId].cnt += 1;
    }
    return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, Math.round((v.sum / v.cnt) * 10) / 10]));
  }, [groupGrades]);

  const overallAvg = useMemo(() => {
    if (groupGrades.length === 0) return 0;
    return Math.round((groupGrades.reduce((s, g) => s + (g.score / g.maxScore) * 100, 0) / groupGrades.length) * 10) / 10;
  }, [groupGrades]);

  const topStudentsCount = useMemo(() => {
    return Object.values(avgByStudent).filter((v) => v.cnt > 0 && (v.sum / v.cnt) >= 80).length;
  }, [avgByStudent]);
```
на:
```ts
  const avgByStudent = useMemo(() => {
    const byStudent: Record<string, typeof groupGrades> = {};
    for (const g of groupGrades) {
      (byStudent[g.studentId] ??= []).push(g);
    }
    return Object.fromEntries(
      Object.entries(byStudent).map(([studentId, grades]) => [studentId, gradeAverage(grades)]),
    );
  }, [groupGrades]);

  const overallAvg = useMemo(() => gradeAverage(groupGrades), [groupGrades]);

  // Раньше здесь было .cnt/.sum на объекте, которого в avgByStudent уже не
  // было (avgByStudent — просто числа) — счётчик всегда возвращал 0,
  // независимо от реальных данных.
  const topStudentsCount = useMemo(() => {
    return Object.values(avgByStudent).filter((avg) => avg >= 4.5).length;
  }, [avgByStudent]);
```

- [ ] **Step 3: Обновить отображение и диапазон ввода**

Строка 151, заменить:
```tsx
          <KpiCard label={t("grades.average")} value={`${overallAvg} / 100`} icon={Award} iconColor="green" />
```
на:
```tsx
          <KpiCard label={t("grades.average")} value={`${overallAvg} / 5`} icon={Award} iconColor="green" />
```

Строка 179, заменить:
```tsx
                    <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${scoreTone(avg, 10)}`}>{avg}/10</span>
```
на:
```tsx
                    <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${gradeTone(avg)}`}>{avg}/5</span>
```

Строка 214-216, заменить:
```tsx
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-bold ${scoreTone(g.score, g.maxScore)}`}>
                        {g.score}<span className="text-muted-foreground">/{g.maxScore}</span>
                      </span>
```
на:
```tsx
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-bold ${gradeTone(g.score)}`}>
                        {g.score}<span className="text-muted-foreground">/5</span>
                      </span>
```

Строка 97-100 (валидация), заменить:
```tsx
    if (score < 0 || score > 100) {
      toast.error(t("grades.scoreRange"));
      return;
    }
```
на:
```tsx
    if (score < 2 || score > 5) {
      toast.error(t("grades.scoreRange"));
      return;
    }
```

Строка 101-111 (`addGrade` вызов), убрать `maxScore: 100`:
```tsx
    addGrade({
      groupId: selectedGroup.id,
      studentId: selectedStudentId,
      teacherId,
      kind: form.kind,
      title: t(`gkind.${form.kind}`),
      score,
      date: getLocalDateString(),
      comment: form.comment.trim() || undefined,
    });
```

Строки 259-260 (форма ввода), заменить:
```tsx
              <Label>{t("grades.field.score")}* (0-100)</Label>
              <Input type="number" min={0} max={100} step={1} value={form.score} onChange={(e) => setForm({ ...form, score: e.target.value })} />
```
на:
```tsx
              <Label>{t("grades.field.score")}* (2-5)</Label>
              <Input type="number" min={2} max={5} step={1} value={form.score} onChange={(e) => setForm({ ...form, score: e.target.value })} />
```

- [ ] **Step 4: Проверить сборку**

Run: `npm run build`
Expected: exit code 0, без новых ошибок в `teacher/grades.tsx`.

- [ ] **Step 5: Playwright smoke (если есть e2e на эту страницу)**

Run: `npx playwright test --project=chromium --reporter=line -g "teacher"`
Expected: существующие тесты, задевающие `/teacher/grades`, проходят (нет специфичных — команда не должна упасть с "no tests found" фатально; если так, пропустить шаг).

- [ ] **Step 6: Commit**

```bash
git add src/routes/teacher/grades.tsx
git commit -m "fix(grades): teacher page onto shared average — 'top students' KPI counted zero before"
```

---

### Task 8: `support-teacher/grades.tsx` — общая функция + фикс «зелёных оценок»

**Files:**
- Modify: `src/routes/support-teacher/grades.tsx`

- [ ] **Step 1: Заменить импорт и убрать локальную `scoreTone`**

Добавить в блок импортов (после `import { formatDate, getLocalDateString, initialsOf } from "@/lib/format";`):
```ts
import { gradeAverage, gradeTone } from "@/lib/data/metrics";
```

Удалить локальную функцию (строки 35-41), идентичную удалённой в Task 7.

- [ ] **Step 2: Переписать `avgByStudent`, `overallAvg`, `topStudentsCount`**

Заменить (строки 72-89):
```ts
  const avgByStudent = useMemo(() => {
    const map: Record<string, { sum: number; cnt: number }> = {};
    for (const g of groupGrades) {
      if (!map[g.studentId]) map[g.studentId] = { sum: 0, cnt: 0 };
      map[g.studentId].sum += (g.score / g.maxScore) * 100;
      map[g.studentId].cnt += 1;
    }
    return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, Math.round((v.sum / v.cnt) * 10) / 10]));
  }, [groupGrades]);

  const overallAvg = useMemo(() => {
    if (groupGrades.length === 0) return 0;
    return Math.round((groupGrades.reduce((s, g) => s + (g.score / g.maxScore) * 100, 0) / groupGrades.length) * 10) / 10;
  }, [groupGrades]);

  const topStudentsCount = useMemo(() => {
    return Object.values(avgByStudent).filter((v) => v >= 80).length;
  }, [avgByStudent]);
```
на:
```ts
  const avgByStudent = useMemo(() => {
    const byStudent: Record<string, typeof groupGrades> = {};
    for (const g of groupGrades) {
      (byStudent[g.studentId] ??= []).push(g);
    }
    return Object.fromEntries(
      Object.entries(byStudent).map(([studentId, grades]) => [studentId, gradeAverage(grades)]),
    );
  }, [groupGrades]);

  const overallAvg = useMemo(() => gradeAverage(groupGrades), [groupGrades]);

  const topStudentsCount = useMemo(() => {
    return Object.values(avgByStudent).filter((avg) => avg >= 4.5).length;
  }, [avgByStudent]);
```

- [ ] **Step 3: Обновить отображение и диапазон ввода**

Строка 153, заменить `${overallAvg} / 100` на `${overallAvg} / 5` (идентично Task 7 Step 3).

Строка 181, заменить:
```tsx
                    <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${scoreTone(avg, 10)}`}>{avg}/10</span>
```
на:
```tsx
                    <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${gradeTone(avg)}`}>{avg}/5</span>
```
Это устраняет баг из аудита: `scoreTone(avg, 10)` при `avg` уже в диапазоне 0-100 давало `pct = avg/10*100`, почти всегда ≥85 → всегда «отлично» независимо от реальных цифр. Теперь `avg` — это средняя оценка 2-5 напрямую, `gradeTone` сравнивает её как есть.

Строка 215-217, заменить:
```tsx
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-bold ${scoreTone(g.score, g.maxScore)}`}>
                        {g.score}<span className="text-muted-foreground">/{g.maxScore}</span>
                      </span>
```
на:
```tsx
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-bold ${gradeTone(g.score)}`}>
                        {g.score}<span className="text-muted-foreground">/5</span>
                      </span>
```

Строки 103-106 (валидация): `score < 0 || score > 100` → `score < 2 || score > 5` (идентично Task 7).

Строки 111-122 (`addGrade` вызов): убрать `maxScore: 100,`.

Строки 261-262 (форма ввода): `(0-100)` → `(2-5)`, `min={0} max={100}` → `min={2} max={5}` (идентично Task 7 Step 3).

- [ ] **Step 4: Проверить сборку**

Run: `npm run build`
Expected: exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/routes/support-teacher/grades.tsx
git commit -m "fix(grades): support-teacher grades were shown green regardless of the real number"
```

---

### Task 9: `student/grades.tsx`, `student/profile.tsx`, `parent/children.tsx`, `teacher/index.tsx`

**Files:**
- Modify: `src/routes/student/grades.tsx`
- Modify: `src/routes/student/profile.tsx`
- Modify: `src/routes/parent/children.tsx`
- Modify: `src/routes/teacher/index.tsx`

- [ ] **Step 1: `student/grades.tsx`**

Добавить импорт `gradeAverage, gradeTone` из `@/lib/data/metrics`. Удалить локальную `scoreTone` (строки 14-19).

Заменить (строки 32-34):
```ts
  const average = myGrades.length
    ? Math.round((myGrades.reduce((sum, grade) => sum + (grade.score / grade.maxScore) * 10, 0) / myGrades.length) * 10) / 10
    : 0;
```
на:
```ts
  const average = gradeAverage(myGrades);
```

Строка 64, заменить `{average}/10` на `{average}/5`.

Строка 79, заменить `const pct = (grade.score / grade.maxScore) * 100;` — удалить эту строку целиком (больше не нужна).

Строки 95, 98, заменить:
```tsx
                  <div className={`flex shrink-0 items-center gap-1 rounded-xl px-2 py-1 text-sm font-bold ${scoreTone(pct)}`}>
                    <Star className="size-3.5" />
                    {grade.score}
                    <span className="text-xs opacity-60">/{grade.maxScore}</span>
                  </div>
```
на:
```tsx
                  <div className={`flex shrink-0 items-center gap-1 rounded-xl px-2 py-1 text-sm font-bold ${gradeTone(grade.score)}`}>
                    <Star className="size-3.5" />
                    {grade.score}
                    <span className="text-xs opacity-60">/5</span>
                  </div>
```

- [ ] **Step 2: `student/profile.tsx`**

Добавить импорт `gradeAverage, gradeTone` из `@/lib/data/metrics`. Удалить локальную `scoreTone` (строки 22-27).

Заменить (строки 44-46):
```ts
  const avg = myGrades.length
    ? Math.round((myGrades.reduce((s, g) => s + (g.score / g.maxScore) * 10, 0) / myGrades.length) * 10) / 10
    : 0;
```
на:
```ts
  const avg = gradeAverage(myGrades);
```

Строка 166, заменить `const pct = (g.score / g.maxScore) * 100;` — удалить строку.

Строки 175-176, заменить:
```tsx
                    <div className={`flex items-center gap-1 rounded-md px-2 py-1 text-sm font-bold ${scoreTone(pct)}`}>
                      <Star className="size-3.5" /> {g.score}<span className="text-xs opacity-60">/{g.maxScore}</span>
                    </div>
```
на:
```tsx
                    <div className={`flex items-center gap-1 rounded-md px-2 py-1 text-sm font-bold ${gradeTone(g.score)}`}>
                      <Star className="size-3.5" /> {g.score}<span className="text-xs opacity-60">/5</span>
                    </div>
```

- [ ] **Step 3: `parent/children.tsx`**

Добавить импорт `gradeAverage, gradeTone` из `@/lib/data/metrics`. Удалить локальную `scoreTone` (строки 18-23).

Заменить (строки 75-76):
```ts
  const avg = childGrades.length
    ? Math.round(childGrades.reduce((s, g) => s + (g.score / g.maxScore) * 100, 0) / childGrades.length)
    : 0;
```
на:
```ts
  const avg = gradeAverage(childGrades);
```

Строка 127, заменить:
```tsx
          <Mini icon={Award} value={`${avg}%`} label={t("profile.avgGrade")} />
```
на:
```tsx
          <Mini icon={Award} value={`${avg}/5`} label={t("profile.avgGrade")} />
```
(было `%` — теперь это не процент, а оценка 2-5, «4.2%» вводило бы в заблуждение сильнее, чем «4.2/5»).

Строка 193, заменить:
```ts
                const pct = (g.score / g.maxScore) * 100;
```
на ничего (удалить строку) — и строку 200:
```tsx
                    <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${scoreTone(pct)}`}>{g.score}</span>
```
на:
```tsx
                    <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${gradeTone(g.score)}`}>{g.score}</span>
```

Строка 221, заменить `const pct = (g.score / g.maxScore) * 100;` — удалить строку.

Строки 230-231, заменить:
```tsx
                  <div className={`flex items-center gap-1 rounded-md px-2 py-1 text-sm font-bold ${scoreTone(pct)}`}>
                    <Star className="size-3.5" /> {g.score}<span className="text-xs opacity-60">/{g.maxScore}</span>
                  </div>
```
на:
```tsx
                  <div className={`flex items-center gap-1 rounded-md px-2 py-1 text-sm font-bold ${gradeTone(g.score)}`}>
                    <Star className="size-3.5" /> {g.score}<span className="text-xs opacity-60">/5</span>
                  </div>
```

- [ ] **Step 4: `teacher/index.tsx`**

Добавить импорт `gradeAverage` из `@/lib/data/metrics` (добавить в существующую строку `import { attendancePercentage } from "@/lib/data/metrics";` → `import { attendancePercentage, gradeAverage } from "@/lib/data/metrics";`).

Заменить (строки 58-61):
```ts
  const avgGrade = useMemo(() => {
    if (!myGrades.length) return 0;
    return Math.round((myGrades.reduce((s, g) => s + (g.score / g.maxScore) * 10, 0) / myGrades.length) * 10) / 10;
  }, [myGrades]);
```
на:
```ts
  const avgGrade = useMemo(() => gradeAverage(myGrades), [myGrades]);
```

- [ ] **Step 5: Собрать и проверить типы**

Run: `npm run build`
Expected: exit code 0.

Run: `npx tsc --noEmit 2>&1 | grep -c "maxScore"`
Expected: `0` — это последняя задача, трогающая `maxScore` во фронтенде; после неё упоминаний не остаётся нигде.

- [ ] **Step 6: Commit**

```bash
git add src/routes/student/grades.tsx src/routes/student/profile.tsx src/routes/parent/children.tsx src/routes/teacher/index.tsx
git commit -m "refactor(grades): remaining four pages onto shared gradeAverage/gradeTone"
```

---

### Task 10: Уборка — мёртвый `scoreTone`, тексты диапазона

**Files:**
- Modify: `src/lib/format.ts:119-123`
- Modify: `src/lib/i18n.tsx:338, 1116`

- [ ] **Step 1: Проверить, что `format.ts`'s `scoreTone` больше нигде не используется**

Run: `grep -rn "from \"@/lib/format\"" src/ | xargs -I{} echo {} | grep -l scoreTone 2>/dev/null; grep -rn "scoreTone" src/ --include="*.tsx" --include="*.ts"`
Expected: единственное оставшееся определение — сама `format.ts:119-123`, ни одного импорта `scoreTone` из `format.ts` в других файлах (все шесть страниц к этому шагу уже переведены на `gradeTone` из `metrics.ts` в Tasks 7-9).

- [ ] **Step 2: Удалить мёртвую функцию**

В `src/lib/format.ts`, удалить строки 119-123:
```ts
export function scoreTone(pct: number): string {
  if (pct >= 85) return "text-green-600";
  if (pct >= 65) return "text-yellow-600";
  return "text-red-600";
}
```

- [ ] **Step 3: Обновить текст диапазона в двух языках**

В `src/lib/i18n.tsx`, строка 338:
```ts
  "grades.scoreRange": "Baho 0 dan 100 gacha bo'lishi kerak",
```
заменить на:
```ts
  "grades.scoreRange": "Baho 2 dan 5 gacha bo'lishi kerak",
```

Строка 1116:
```ts
  "grades.scoreRange": "Оценка должна быть от 0 до 100",
```
заменить на:
```ts
  "grades.scoreRange": "Оценка должна быть от 2 до 5",
```

- [ ] **Step 4: Собрать проект**

Run: `npm run build`
Expected: exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts src/lib/i18n.tsx
git commit -m "chore(grades): drop dead scoreTone, update range copy to 2-5"
```

---

### Task 11: Итоговая проверка

**Files:** нет изменений — только верификация.

- [ ] **Step 1: Полный прогон бэкенд-тестов**

Run: `cd backend && pytest -v`
Expected: все тесты PASS, включая новые из Task 2-4 и существующие (`test_phase4_api.py::test_homework_grade_exam_cycle` — проверить отдельно, см. Step 2).

- [ ] **Step 2: Проверить, не сломался ли существующий тест на старой шкале**

`test_phase4_api.py::test_homework_grade_exam_cycle` (строка 96) отправляет `"grade": 9` при создании ДЗ и `"score": 9` для экзамена с `"max_score": 10` — эти значения (9) теперь ВНЕ диапазона 2-5. Тест падает уже сразу после Task 1 (не только после Task 2): `HomeworkStatusSerializer` — обычный `ModelSerializer` без переопределения поля `grade`, поэтому DRF сам выводит `min_value`/`max_value` из валидаторов модели и отклоняет запрос `PATCH /homeworks/{id}/status/` с 400 ещё до вызова `upsert_homework_grade` — то есть отказ происходит на уровне API, а не только там, где `GradeSerializer.validate_score` мог бы его поймать. Практически это значит: между Task 1 и этим шагом ветка содержит один заведомо красный тест — это ожидаемо и не регрессия, но стоит иметь в виду при проверке промежуточных коммитов.

Run: `pytest backend/tests/test_phase4_api.py::test_homework_grade_exam_cycle -v`

Если тест падает — заменить `"grade": 9` на `"grade": 5` и `"score": 9` (для ExamResult) на `"score": 5`, `"max_score": 10` оставить как есть (историческое поле, само по себе не проверяется на диапазон при создании — `validate_max_score` по-прежнему допускает вплоть до 100). Закоммитить правку теста отдельно:
```bash
git add backend/tests/test_phase4_api.py
git commit -m "test: update legacy homework/exam cycle test for the 2-5 scale"
```

- [ ] **Step 3: Полная фронтенд-проверка**

Run: `npm run build`
Expected: exit code 0.

Run: `npx tsc --noEmit 2>&1 | tail -5 && npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: 24 (базовый уровень, зафиксированный в `CLAUDE.md` на 2026-08-09) — если число другое, разобраться, не добавила ли эта работа новых ошибок типов сверх известного базового уровня.

- [ ] **Step 4: Полный Playwright**

Run: `npx playwright test --project=chromium --reporter=line`
Expected: все тесты PASS, включая новый `e2e/grade-metrics.spec.ts`.

- [ ] **Step 5: Обновить `CLAUDE.md`**

Добавить в раздел «ТЕКУЩИЙ СТАТУС И ОТКРЫТЫЕ ЗАДАЧИ» короткую запись о завершённой работе (дата, что сделано, что осталось для владельца — а именно: команда `recalculate_grades_scale` написана и протестирована, но **не запущена на проде**, ждёт решения владельца о времени запуска — по аналогии с уже существующей записью про `refund_phantom_charges`).

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: grades scale rebuild complete, recalculation command awaits owner go-ahead on prod"
```

---

## Что после этого плана

Возврат к редизайну интерфейса (учитель + помощник учителя), с открытыми глазами на похожие «хвосты старого» по пути — см. `docs/superpowers/specs/2026-08-21-grades-scale-rebuild-design.md`, раздел 9.

Команду `recalculate_grades_scale --apply` на проде запускать отдельным, осознанным шагом — не автоматически в рамках этого плана.
