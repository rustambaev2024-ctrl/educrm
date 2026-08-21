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
