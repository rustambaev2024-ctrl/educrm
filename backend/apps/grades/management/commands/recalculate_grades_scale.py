"""
Пересчёт истории оценок в новую шкалу 2-5.

Три источника, три разных формулы процента — не потому что так удобнее,
а потому что данные по-разному испорчены/чисты:

  * Домашка (HomeworkStatus.grade) — берём значение НАПРЯМУЮ из этого поля
    (оно старой шкалы 0-10, багом со списанием монет и рассинхронизацией
    "из 10 показано как из 100" не задето само по себе) и пишем итог
    в него же и в связанный Grade.score, а не наоборот — если считать от
    уже испорченного Grade.score, ошибка закрепится под видом новой
    шкалы.
  * Экзамены (ExamResult.score / Exam.max_score) — процент от максимума
    ЭТОГО конкретного экзамена, не от 100 по умолчанию: часть экзаменов
    в базе уже сохранена не на сотню.
  * Остальные типы оценок — исторически честно на 100-балльной шкале,
    процент от 100 напрямую.

По умолчанию НИЧЕГО не меняет — только показывает отчёт. Применяется
только с --apply.

Идемпотентность обеспечивается ЯВНОЙ проверкой, а не свойством формул:
перед записью каждая из четырёх веток (домашка / ДЗ без источника /
экзамены / остальные типы) проверяет, не оказались ли ВСЕ её исходные
значения уже в диапазоне 2-5 — это сильный признак, что ветка уже
пересчитана раньше. Если да — ветка полностью пропускается (ни одна
запись не трогается), выводится предупреждение. Формулы пересчёта САМИ
ПО СЕБЕ не идемпотентны: например, для домашки уже пересчитанное 5
интерпретируется как "5 из 10" -> 50% -> оценка 3, то есть повторный
слепой прогон тихо портит уже верные данные. Именно поэтому проверка
обязательна и включена по умолчанию. --force явно обходит её для
случаев, когда оператор уверен, что повторный пересчёт безопасен.

Каждая схема (тенант) обрабатывается в одной транзакции при --apply:
либо пересчитывается целиком, либо (при сбое посреди работы — обрыв
соединения с БД, неожиданные данные) откатывается целиком, без
промежуточного состояния "часть записей пересчитана, часть нет" —
именно такое промежуточное состояние опасно совместить с проверкой
идемпотентности выше: без атомарности не отличить схему, где повтор
действительно нужен, от той, где уже "почти всё" сделано.

    python manage.py recalculate_grades_scale                  # только показать
    python manage.py recalculate_grades_scale --apply          # применить
    python manage.py recalculate_grades_scale --schema kelajak_talim
    python manage.py recalculate_grades_scale --apply --force  # игнорировать проверку "уже пересчитано"
"""

from contextlib import nullcontext

from django.core.management.base import BaseCommand
from django.db import transaction
from django_tenants.utils import get_public_schema_name, get_tenant_model, schema_context

from apps.grades.services import band_percent_to_scale

OTHER_GRADE_TYPES = ["lesson", "activity", "speaking", "vocabulary", "test", "extra_lesson"]


def _looks_already_migrated(values) -> bool:
    """Все значения уже в 2-5 — вероятный признак, что эта часть уже
    пересчитана. Не идеальная эвристика (старые оценки могли случайно все
    оказаться в 2-5), поэтому есть --force как явный обход."""
    values = [v for v in values if v is not None]
    if not values:
        return False
    return all(2 <= v <= 5 for v in values)


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
        parser.add_argument(
            "--force",
            action="store_true",
            help=(
                "пересчитать, даже если данные какой-то ветки уже похожи на "
                "пересчитанные (все значения в диапазоне 2-5). Используйте, только "
                "если точно знаете, что повторный пересчёт этих данных безопасен."
            ),
        )

    def handle(self, *args, **options):
        apply_changes = options["apply"]
        only_schema = options["schema"]
        force = options["force"]

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
                counts = self._process_schema(schema, apply_changes, force)
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

    def _process_schema(self, schema: str, apply_changes: bool, force: bool = False):
        from apps.grades.models import Exam, ExamResult, Grade
        from apps.homework.models import HomeworkStatus

        counts = {"homework": 0, "exam": 0, "other": 0, "orphan_homework": 0}

        # Все четыре ветки ниже пишут Grade.score через queryset .update(),
        # а не .save() — намеренно: это пересчёт исторических данных, а не
        # новая выставленная оценка, и не должен задним числом запускать
        # award_coins_for_grade (Task 3, apps/coins/signals.py) и начислять
        # студентам монеты за оценки многолетней давности.
        atomic_ctx = transaction.atomic() if apply_changes else nullcontext()
        with atomic_ctx:
            # --- Домашние задания: источник — HomeworkStatus.grade ---
            hw_statuses = list(HomeworkStatus.objects.filter(grade__isnull=False))
            if apply_changes and not force and _looks_already_migrated([hs.grade for hs in hw_statuses]):
                self.stdout.write(
                    self.style.WARNING(
                        f"{schema}: [ДЗ] все значения HomeworkStatus.grade уже в диапазоне "
                        "2-5 — похоже, эта часть уже пересчитана, пропускаю без изменений. "
                        "Если это ложное срабатывание и повторный пересчёт нужен осознанно — "
                        "используйте --force."
                    )
                )
            else:
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
                            Grade.objects.filter(pk=grade_row.pk).update(score=new_value)
                    else:
                        self.stdout.write(f"  [ДЗ] {hs.id}: {old_value}/10 -> {new_value}")

            # --- Оценки типа homework без связанного HomeworkStatus (аномалия) ---
            orphans = list(Grade.objects.filter(grade_type="homework", homework_status__isnull=True))
            if apply_changes and not force and _looks_already_migrated([g.score for g in orphans]):
                self.stdout.write(
                    self.style.WARNING(
                        f"{schema}: [ДЗ без источника] все значения Grade.score уже в диапазоне "
                        "2-5 — похоже, эта часть уже пересчитана, пропускаю без изменений. "
                        "--force для явного обхода."
                    )
                )
            else:
                for grade in orphans:
                    old_value = grade.score
                    new_value = band_percent_to_scale(old_value)
                    counts["orphan_homework"] += 1
                    if apply_changes:
                        Grade.objects.filter(pk=grade.pk).update(score=new_value)
                    else:
                        self.stdout.write(
                            self.style.ERROR(f"  [ДЗ без источника] {grade.id}: {old_value}/100 -> {new_value}")
                        )

            # --- Экзамены: источник — ExamResult.score / Exam.max_score ---
            results = list(ExamResult.objects.select_related("exam").all())
            if apply_changes and not force and _looks_already_migrated([r.score for r in results]):
                self.stdout.write(
                    self.style.WARNING(
                        f"{schema}: [Экзамены] все значения ExamResult.score уже в диапазоне "
                        "2-5 — похоже, эта часть уже пересчитана, пропускаю без изменений. "
                        "--force для явного обхода."
                    )
                )
            else:
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
            other_grades = list(Grade.objects.filter(grade_type__in=OTHER_GRADE_TYPES))
            if apply_changes and not force and _looks_already_migrated([g.score for g in other_grades]):
                self.stdout.write(
                    self.style.WARNING(
                        f"{schema}: [остальные типы] все значения Grade.score уже в диапазоне "
                        "2-5 — похоже, эта часть уже пересчитана, пропускаю без изменений. "
                        "--force для явного обхода."
                    )
                )
            else:
                for grade in other_grades:
                    old_value = grade.score
                    new_value = band_percent_to_scale(old_value)
                    counts["other"] += 1
                    if apply_changes:
                        Grade.objects.filter(pk=grade.pk).update(score=new_value)
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
