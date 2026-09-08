from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.db.models import Avg, Case, Count, DecimalField, F, Max, Q, Sum, Value, When
from django.db.models.functions import Coalesce, TruncDate, TruncMonth
from django.utils import timezone

from apps.audit.models import AuditLog
from apps.core.definitions import (
    ACTIVE_STUDENT_STATUSES,
    ATTENDANCE_COUNTED_STATUSES,
    ATTENDANCE_PRESENT_STATUSES,
    CHARGE_PAYMENT_TYPES,
    ENROLLED_STUDENT_STATUSES,
    INCOME_PAYMENT_TYPES,
    INCOME_REVERSAL_TYPES,
    attendance_rate_parts,
    with_combined_balance,
)
from apps.courses.models import GroupMembership
from apps.finance.models import Payment
from apps.institutions.models import Branch, Room
from apps.lessons.models import Attendance, Lesson, TeacherAttendance
from apps.staff.models import Staff, StaffBonus, StaffPenalty
from apps.students.models import Student


# Знаковая сумма операции с точки зрения выручки: поступление — плюс, его
# отмена — минус, всё остальное не выручка.
_SIGNED_REVENUE_AMOUNT = Case(
    When(payment_type__in=INCOME_PAYMENT_TYPES, then=F("amount")),
    When(payment_type__in=INCOME_REVERSAL_TYPES, then=-F("amount")),
    default=Value(Decimal("0.00")),
    output_field=DecimalField(max_digits=14, decimal_places=2),
)


def _net_revenue(payments_qs) -> Decimal:
    """
    Выручка за период: поступления минус их отмены.

    Отмена пополнения создаёт "manual_charge" (finance.services.reverse_payment),
    и без вычитания ошибочное пополнение вместе с исправлением дают в отчёте
    двойную выручку вместо нуля. Фронт вычитал её и раньше — из-за этого
    «Доход» на панели и «Выручка» в отчёте расходились на сумму всех
    исправлений за период.
    """
    income = payments_qs.filter(payment_type__in=INCOME_PAYMENT_TYPES).aggregate(
        total=Coalesce(Sum("amount"), Decimal("0.00"))
    )["total"]
    reversals = payments_qs.filter(payment_type__in=INCOME_REVERSAL_TYPES).aggregate(
        total=Coalesce(Sum("amount"), Decimal("0.00"))
    )["total"]
    return income - reversals


@dataclass(frozen=True)
class ReportFilters:
    date_from: date
    date_to: date
    branch_id: str | None = None


def normalize_filters(raw_filters: dict) -> ReportFilters:
    today = timezone.localdate()
    date_from = raw_filters.get("date_from") or (today - timedelta(days=30))
    date_to = raw_filters.get("date_to") or today
    if date_from > date_to:
        raise ValidationError("date_from must be less or equal to date_to")
    branch_id = str(raw_filters["branch_id"]) if raw_filters.get("branch_id") else None
    return ReportFilters(date_from=date_from, date_to=date_to, branch_id=branch_id)


def _quantize(value: Decimal | int | float) -> Decimal:
    return Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _percentage(part: int | Decimal, total: int | Decimal) -> Decimal:
    if not total:
        return Decimal("0.00")
    return _quantize((Decimal(part) / Decimal(total)) * Decimal("100"))


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


def branch_ids_for_user(user, branch_id: str | None = None) -> list:
    if user.role in ("superadmin", "director"):
        queryset = Branch.objects.all()
        if branch_id:
            queryset = queryset.filter(id=branch_id)
        return list(queryset.values_list("id", flat=True))

    if (
        user.role in ("branch_admin", "teacher")
        and hasattr(user, "staff_profile")
        and user.staff_profile.branch_id
    ):
        own_branch_id = user.staff_profile.branch_id
        if branch_id and str(own_branch_id) != str(branch_id):
            return []
        return [own_branch_id]
    return []


def _with_date_range(queryset, field_name: str, date_from: date, date_to: date):
    return queryset.filter(
        **{
            f"{field_name}__date__gte": date_from,
            f"{field_name}__date__lte": date_to,
        }
    )


def get_overview(user, filters: ReportFilters) -> dict:
    branch_ids = branch_ids_for_user(user, filters.branch_id)
    students_qs = Student.objects.filter(branch_id__in=branch_ids)
    students_qs = _with_date_range(students_qs, "registered_at", filters.date_from, filters.date_to)
    total_students = students_qs.count()
    active_students = students_qs.filter(status__in=ACTIVE_STUDENT_STATUSES).count()
    # combined_balance = wallet_balance + bonus_balance: должник считается по
    # сумме, бонус может покрывать минус на основном балансе.
    debtors_count = with_combined_balance(
        Student.objects.filter(branch_id__in=branch_ids)
    ).filter(combined_balance__lt=0).count()

    payments_qs = Payment.objects.filter(branch_id__in=branch_ids)
    payments_qs = _with_date_range(payments_qs, "created_at", filters.date_from, filters.date_to)
    revenue_total = _net_revenue(payments_qs)

    attendance_qs = Attendance.objects.filter(lesson__group__branch_id__in=branch_ids)
    attendance_qs = _with_date_range(
        attendance_qs,
        "lesson__datetime",
        filters.date_from,
        filters.date_to,
    )
    attendance_present, attendance_total = attendance_rate_parts(attendance_qs)

    return {
        "period": {"date_from": str(filters.date_from), "date_to": str(filters.date_to)},
        "students_total": total_students,
        "students_active": active_students,
        "debtors_count": debtors_count,
        "revenue_total": str(_quantize(revenue_total)),
        "attendance_rate": str(_percentage(attendance_present, attendance_total)),
    }


def get_attendance_report(user, filters: ReportFilters) -> dict:
    branch_ids = branch_ids_for_user(user, filters.branch_id)
    branches = Branch.objects.filter(id__in=branch_ids).order_by("name")
    attendance_qs = Attendance.objects.filter(lesson__group__branch_id__in=branch_ids)
    attendance_qs = _with_date_range(
        attendance_qs,
        "lesson__datetime",
        filters.date_from,
        filters.date_to,
    )

    results = []
    for branch in branches:
        branch_qs = attendance_qs.filter(lesson__group__branch_id=branch.id)
        present, total = attendance_rate_parts(branch_qs)
        results.append(
            {
                "branch_id": str(branch.id),
                "branch_name": branch.name,
                # total_records — знаменатель посещаемости (без уважительных),
                # а не «сколько всего отметок»: иначе present + absent никогда
                # не сходится с total и таблицу нельзя проверить на глаз.
                "total_records": total,
                "present_records": present,
                "absent_records": branch_qs.filter(status="absent").count(),
                "excused_records": branch_qs.filter(status="excused").count(),
                "attendance_rate": str(_percentage(present, total)),
            }
        )

    overall_present, overall_total = attendance_rate_parts(attendance_qs)

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

    return {
        "period": {"date_from": str(filters.date_from), "date_to": str(filters.date_to)},
        "overall_rate": str(_percentage(overall_present, overall_total)),
        "results": results,
        "by_day": by_day,
    }


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

        # group__status="active" обязателен: знаменатель (capacity) считается
        # только по активным группам, и без этого фильтра членства в
        # завершённых/замороженных группах попадали бы в числитель, давая
        # заполненность больше 100%.
        occupied = (
            GroupMembership.objects.filter(
                group__branch_id__in=branch_ids,
                group__status="active",
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


def get_revenue_report(user, filters: ReportFilters) -> dict:
    branch_ids = branch_ids_for_user(user, filters.branch_id)
    all_payments_qs = Payment.objects.filter(branch_id__in=branch_ids)
    all_payments_qs = _with_date_range(all_payments_qs, "created_at", filters.date_from, filters.date_to)
    total_revenue = _net_revenue(all_payments_qs)

    # Разбивки считаются по знаковой сумме, а не только по поступлениям: иначе
    # сумма строк таблицы не сходится с итогом на величину отмен, и таблицу
    # нельзя сложить в столбик и проверить.
    payments_qs = all_payments_qs.filter(
        payment_type__in=INCOME_PAYMENT_TYPES + INCOME_REVERSAL_TYPES
    ).annotate(signed_amount=_SIGNED_REVENUE_AMOUNT)
    net = Coalesce(Sum("signed_amount"), Decimal("0.00"))
    by_branch = (
        payments_qs.values("branch_id", "branch__name")
        .annotate(total=net, transactions=Count("id"))
        .order_by("-total")
    )
    by_group = (
        payments_qs.values("group_id", "group__name")
        .annotate(total=net, transactions=Count("id"))
        .order_by("-total")
    )
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
    by_day = (
        payments_qs.annotate(day=TruncDate("created_at"))
        .values("day")
        .annotate(total=net)
        .order_by("day")
    )

    return {
        "period": {"date_from": str(filters.date_from), "date_to": str(filters.date_to)},
        "total_revenue": str(_quantize(total_revenue)),
        "by_branch": [
            {
                "branch_id": str(row["branch_id"]) if row["branch_id"] else None,
                "branch_name": row["branch__name"] or "Unknown",
                "transactions": row["transactions"],
                "total": str(_quantize(row["total"])),
            }
            for row in by_branch
        ],
        "by_group": [
            {
                "group_id": str(row["group_id"]) if row["group_id"] else None,
                "group_name": row["group__name"] or "No group",
                "transactions": row["transactions"],
                "total": str(_quantize(row["total"])),
            }
            for row in by_group
        ],
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
        "by_day": [
            {"day": str(row["day"]), "total": str(_quantize(row["total"]))}
            for row in by_day
        ],
    }


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

    # values_list("id", ...) returns real UUID objects, but row["id"] in
    # by_branch/by_course is already a string (str(key) was called inside
    # _margin_rows) — build the name dict with string keys upfront so the
    # lookup matches without converting back to UUID.
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


def get_teachers_report(user, filters: ReportFilters) -> dict:
    branch_ids = branch_ids_for_user(user, filters.branch_id)

    from django.db.models import Avg, Count
    from django.db.models.functions import Coalesce

    # revenue_total считается отдельным сгруппированным запросом, а не
    # Sum(Case(...distinct=True)) внутри teachers_qs.annotate(...): distinct=True
    # на Sum компилируется в SUM(DISTINCT expr) — он схлопывает РАВНЫЕ СУММЫ,
    # а не повторяющиеся строки. Два разных top_up на 100000.00 (например, два
    # ученика в разных группах платят одну и ту же цену курса) считались бы как
    # один. Тот же паттерн, что и _margin_rows() в get_profitability_report ниже.
    revenue_by_teacher = {
        row["group__teacher_id"]: row["total"]
        for row in Payment.objects.filter(
            group__branch_id__in=branch_ids,
            payment_type__in=INCOME_PAYMENT_TYPES + INCOME_REVERSAL_TYPES,
            created_at__date__gte=filters.date_from,
            created_at__date__lte=filters.date_to,
        )
        .annotate(signed_amount=_SIGNED_REVENUE_AMOUNT)
        .values("group__teacher_id")
        .annotate(total=Coalesce(Sum("signed_amount"), Decimal("0.00")))
    }

    teachers_qs = Staff.objects.select_related("user", "branch").filter(
        user__role="teacher",
        branch_id__in=branch_ids,
    ).annotate(
        total_lessons=Count(
            "lessons",
            filter=Q(
                lessons__datetime__date__gte=filters.date_from,
                lessons__datetime__date__lte=filters.date_to,
                lessons__group__branch_id__in=branch_ids,
            ),
            distinct=True,
        ),
        conducted_lessons=Count(
            "lessons",
            filter=Q(
                lessons__status="conducted",
                lessons__datetime__date__gte=filters.date_from,
                lessons__datetime__date__lte=filters.date_to,
                lessons__group__branch_id__in=branch_ids,
            ),
            distinct=True,
        ),
        cancelled_lessons=Count(
            "lessons",
            filter=Q(
                lessons__status="cancelled",
                lessons__datetime__date__gte=filters.date_from,
                lessons__datetime__date__lte=filters.date_to,
                lessons__group__branch_id__in=branch_ids,
            ),
            distinct=True,
        ),
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
        absent_count=Count(
            "lessons__attendance",
            filter=Q(
                lessons__attendance__status="absent",
                lessons__datetime__date__gte=filters.date_from,
                lessons__datetime__date__lte=filters.date_to,
                lessons__group__branch_id__in=branch_ids,
            ),
            distinct=True,
        ),
        late_count=Count(
            "lessons__attendance",
            filter=Q(
                lessons__attendance__status="late",
                lessons__datetime__date__gte=filters.date_from,
                lessons__datetime__date__lte=filters.date_to,
                lessons__group__branch_id__in=branch_ids,
            ),
            distinct=True,
        ),
        _avg_late=Avg(
            "lessons__attendance__late_minutes",
            filter=Q(
                lessons__attendance__status="late",
                lessons__datetime__date__gte=filters.date_from,
                lessons__datetime__date__lte=filters.date_to,
                lessons__group__branch_id__in=branch_ids,
            ),
        ),
        students_count=Count(
            "lessons__group__memberships__student",
            filter=Q(
                lessons__group__memberships__left_at__isnull=True,
                lessons__group__branch_id__in=branch_ids,
            ),
            distinct=True,
        ),
    )

    rows = []
    for teacher in teachers_qs:
        total = teacher.total_lessons or 0
        conducted = teacher.conducted_lessons or 0
        present = teacher.present_count or 0
        absent = teacher.absent_count or 0
        total_att = present + absent

        rows.append({
            "teacher_id": str(teacher.id),
            "teacher_name": teacher.user.full_name,
            "branch_id": str(teacher.branch_id) if teacher.branch_id else None,
            "branch_name": teacher.branch.name if teacher.branch else None,
            "students_count": teacher.students_count or 0,
            "revenue_total": str(_quantize(revenue_by_teacher.get(teacher.id, Decimal("0.00")))),
            "attendance_rate": round(present / total_att * 100, 1) if total_att else 0.0,
            "conducted_lessons": conducted,
            "cancelled_lessons": teacher.cancelled_lessons or 0,
            "total_lessons": total,
            "present_count": present,
            "absent_count": absent,
            "late_count": teacher.late_count or 0,
            "avg_late_minutes": round(float(teacher._avg_late or 0), 1),
            "conduct_rate": round(conducted / total * 100, 1) if total else 0.0,
        })

    rows.sort(key=lambda r: r["conduct_rate"], reverse=True)
    return {
        "period": {"date_from": str(filters.date_from), "date_to": str(filters.date_to)},
        "results": rows,
    }


def get_rooms_report(user, filters: ReportFilters) -> dict:
    branch_ids = branch_ids_for_user(user, filters.branch_id)
    rooms_qs = Room.objects.filter(
        branch_id__in=branch_ids,
        is_active=True,
    ).select_related("branch")
    lessons_qs = Lesson.objects.filter(
        group__branch_id__in=branch_ids,
        room__isnull=False,
    ).exclude(status="cancelled")
    lessons_qs = _with_date_range(lessons_qs, "datetime", filters.date_from, filters.date_to)

    period_days = max((filters.date_to - filters.date_from).days + 1, 1)
    results = []
    for room in rooms_qs:
        room_lessons = lessons_qs.filter(room=room)
        lessons_count = room_lessons.count()
        load_percent = _percentage(min(lessons_count, period_days), period_days)
        results.append(
            {
                "room_id": str(room.id),
                "room_name": room.name,
                "branch_id": str(room.branch_id),
                "branch_name": room.branch.name,
                "capacity": room.capacity,
                "lessons_count": lessons_count,
                "teachers_count": room_lessons.values("teacher_id").distinct().count(),
                "load_percent": str(load_percent),
            }
        )

    results.sort(key=lambda row: Decimal(row["load_percent"]), reverse=True)
    return {
        "period": {"date_from": str(filters.date_from), "date_to": str(filters.date_to)},
        "results": results,
    }


def get_conversion_report(user, filters: ReportFilters) -> dict:
    branch_ids = branch_ids_for_user(user, filters.branch_id)
    students_qs = Student.objects.filter(branch_id__in=branch_ids)
    students_qs = _with_date_range(students_qs, "registered_at", filters.date_from, filters.date_to)

    total_registered = students_qs.count()
    # В воронке удержания вопрос не «сколько учится сегодня», а «сколько мы не
    # потеряли», поэтому здесь ENROLLED (шире на "frozen"): заморозка — пауза,
    # а не уход, и терять её между «активными» и «отчисленными» нельзя.
    active = students_qs.filter(status__in=ENROLLED_STUDENT_STATUSES).count()
    graduated = students_qs.filter(status="graduate").count()
    expelled = students_qs.filter(status="expelled").count()

    return {
        "period": {"date_from": str(filters.date_from), "date_to": str(filters.date_to)},
        "funnel": [
            {"stage": "registered", "count": total_registered},
            {"stage": "active", "count": active},
            {"stage": "graduated", "count": graduated},
            {"stage": "expelled", "count": expelled},
        ],
        "conversion_rate": str(_percentage(graduated, total_registered)),
        "retention_rate": str(_percentage(active, total_registered)),
    }


def get_debtors_report(user, filters: ReportFilters) -> dict:
    branch_ids = branch_ids_for_user(user, filters.branch_id)
    # combined_balance = wallet_balance + bonus_balance — ключ "wallet_balance"
    # в ответе сохранён ради фронтенда, значение уже учитывает бонус.
    debtors_qs = with_combined_balance(
        Student.objects.select_related("user", "branch").filter(branch_id__in=branch_ids)
    ).filter(combined_balance__lt=0)
    results = [
        {
            "student_id": str(student.id),
            "full_name": student.user.full_name,
            "phone": student.user.phone,
            "branch_id": str(student.branch_id) if student.branch_id else None,
            "branch_name": student.branch.name if student.branch else None,
            "wallet_balance": str(_quantize(student.combined_balance)),
            "status": student.status,
        }
        for student in debtors_qs.order_by("user__full_name")
    ]

    period_payments_qs = Payment.objects.filter(branch_id__in=branch_ids)
    period_payments_qs = _with_date_range(period_payments_qs, "created_at", filters.date_from, filters.date_to)
    billed = period_payments_qs.filter(payment_type__in=CHARGE_PAYMENT_TYPES).aggregate(
        total=Coalesce(Sum("amount"), Decimal("0.00"))
    )["total"]
    collected = _net_revenue(period_payments_qs)
    collection_rate = _percentage(collected, billed) if billed > 0 else Decimal("100.00")

    return {
        "period": {"date_from": str(filters.date_from), "date_to": str(filters.date_to)},
        "debtors_count": len(results),
        "results": results,
        "collection_rate": str(collection_rate),
    }


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
    # Клампим снизу: если collected > billed (сборы за реверсы/предоплаты
    # прошлых периодов перекрыли начисления окна), shortfall_rate не должен
    # уходить в минус — иначе forecast_revenue превысит potential_revenue.
    shortfall_rate = (
        max(_percentage(billed - collected, billed), Decimal("0.00")) if billed > 0 else Decimal("0.00")
    )
    forecast = potential * (Decimal("100.00") - shortfall_rate) / Decimal("100.00")

    return {
        "potential_revenue": str(_quantize(potential)),
        "shortfall_rate_percent": str(shortfall_rate),
        "forecast_revenue": str(_quantize(forecast)),
        "has_sufficient_history": billed > 0,
    }


def calculate_teacher_salary(
    *,
    teacher_id,
    period_start: date,
    period_end: date,
    salary_percent: Decimal | None = None,
) -> dict:
    cache_key = f"teacher_salary:{teacher_id}:{period_start}:{period_end}:{salary_percent}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    teacher = Staff.objects.select_related("user").filter(id=teacher_id).first()
    if teacher is None:
        raise ValidationError("Teacher not found")

    applied_percent = salary_percent
    if applied_percent is None:
        applied_percent = teacher.salary_percent or Decimal("0.00")
    applied_percent = _quantize(applied_percent)

    # Зарплата учителя считается от ВСЕХ списаний за его группы, а не только
    # от уроков, где ученик был отмечен present/late. Списание происходит со всех
    # активных участников группы независимо от посещаемости, поэтому привязка к
    # lesson + attendance занижала зарплату. Исключаем absent_charge — списания
    # за пропуск без уважительной причины не идут в долю учителя.
    payments_qs = Payment.objects.filter(
        payment_type="charge",
        teacher=teacher,
        created_at__date__gte=period_start,
        created_at__date__lte=period_end,
    ).exclude(
        category="absent_charge",
    ).distinct()

    students_data = (
        payments_qs
        .values(
            "group_id",
            "group__name",
            "student_id",
            "student__user__full_name",
        )
        .annotate(payments_sum=Coalesce(Sum("amount"), Decimal("0.00")))
        .order_by("group_id", "-payments_sum")
    )

    groups_map: dict = {}
    for row in students_data:
        gid = str(row["group_id"]) if row["group_id"] else "__deleted__"
        if gid not in groups_map:
            if gid == "__deleted__":
                group_name = "O'chirilgan guruh / Удалённая группа"
            else:
                group_name = row["group__name"] or "Unnamed group"
            groups_map[gid] = {
                "group_id": gid if gid != "__deleted__" else None,
                "group_name": group_name,
                "students": [],
                "group_total": Decimal("0.00"),
            }
        amount = _quantize(row["payments_sum"])
        groups_map[gid]["students"].append({
            "student_id": str(row["student_id"]),
            "full_name": row["student__user__full_name"],
            "payments_sum": str(amount),
        })
        groups_map[gid]["group_total"] += amount

    groups_payload = []
    total_student_payments = Decimal("0.00")
    for group in groups_map.values():
        group["group_total"] = str(_quantize(group["group_total"]))
        total_student_payments += _quantize(Decimal(group["group_total"]))
        groups_payload.append(group)

    total_student_payments = _quantize(total_student_payments)
    calculated_salary = _quantize(total_student_payments * (applied_percent / Decimal("100")))

    penalties_qs = StaffPenalty.objects.filter(
        staff=teacher,
        status="active",
        penalty_date__gte=period_start,
        penalty_date__lte=period_end,
    ).order_by("-penalty_date", "-created_at")

    total_penalties = _quantize(
        penalties_qs.aggregate(total=Coalesce(Sum("amount"), Decimal("0.00")))["total"]
    )

    bonuses_qs = StaffBonus.objects.filter(
        staff=teacher,
        bonus_date__gte=period_start,
        bonus_date__lte=period_end,
    ).order_by("-bonus_date", "-created_at")

    total_bonuses = _quantize(
        bonuses_qs.aggregate(total=Coalesce(Sum("amount"), Decimal("0.00")))["total"]
    )

    net_salary = _quantize(max(calculated_salary - total_penalties + total_bonuses, Decimal("0.00")))
    penalty_debt = _quantize(max(total_penalties - calculated_salary, Decimal("0.00")))

    # Calculate actual payouts made to teacher during this period
    payouts_qs = Payment.objects.filter(
        staff=teacher,
        payment_type="expense",
        created_at__date__gte=period_start,
        created_at__date__lte=period_end,
    )
    total_paid = _quantize(
        payouts_qs.aggregate(total=Coalesce(Sum("amount"), Decimal("0.00")))["total"]
    )
    remaining_balance = _quantize(max(net_salary - total_paid, Decimal("0.00")))

    result = {
        "teacher": {
            "id": str(teacher.id),
            "full_name": teacher.user.full_name,
        },
        "period": {"start": str(period_start), "end": str(period_end)},
        "groups": groups_payload,
        "total_student_payments": str(total_student_payments),
        "salary_percent": str(applied_percent),
        "calculated_salary": str(calculated_salary),
        "penalties_total": str(total_penalties),
        "penalty_debt": str(penalty_debt),
        "bonuses_total": str(total_bonuses),
        "net_salary": str(net_salary),
        "total_paid": str(total_paid),
        "remaining_balance": str(remaining_balance),
        "penalties": [
            {
                "id": str(penalty.id),
                "amount": str(_quantize(penalty.amount)),
                "reason": penalty.reason,
                "penalty_date": str(penalty.penalty_date),
                "comment": penalty.comment,
            }
            for penalty in penalties_qs
        ],
        "bonuses": [
            {
                "id": str(bonus.id),
                "amount": str(_quantize(bonus.amount)),
                "reason": bonus.reason,
                "bonus_date": str(bonus.bonus_date),
                "comment": bonus.comment,
            }
            for bonus in bonuses_qs
        ],
    }

    cache.set(cache_key, result, timeout=300)
    return result


def get_daily_report(user, report_date: date, branch_id: str | None = None) -> dict:
    """Ежедневный отчёт 'Kunlik hisobot'."""
    branch_ids = branch_ids_for_user(user, branch_id)
    yesterday = report_date - timedelta(days=1)

    # 1. ФИНАНСЫ
    payments_today = Payment.objects.filter(
        branch_id__in=branch_ids,
        created_at__date=report_date,
    )
    payments_yesterday = Payment.objects.filter(
        branch_id__in=branch_ids,
        created_at__date=yesterday,
    )
    income_today = _net_revenue(payments_today)
    income_yesterday = _net_revenue(payments_yesterday)
    charges_today = payments_today.filter(payment_type__in=CHARGE_PAYMENT_TYPES).aggregate(
        total=Coalesce(Sum("amount"), Decimal("0"))
    )["total"]

    top_payments = list(
        payments_today.filter(payment_type__in=INCOME_PAYMENT_TYPES)
        .select_related("student__user")
        .order_by("-amount")[:5]
        .values("amount", "method", "created_at", "student__user__full_name")
    )

    # Student model has no updated_at field, so we cannot calculate "new" debtors for today
    new_debtors_today = 0
    # combined_balance = wallet_balance + bonus_balance, тем же правилом,
    # что и должники в остальных отчётах.
    total_debt = with_combined_balance(
        Student.objects.filter(branch_id__in=branch_ids)
    ).filter(combined_balance__lt=0).aggregate(
        total=Coalesce(Sum("combined_balance"), Decimal("0"))
    )["total"]

    # 2. УРОКИ
    lessons_today = Lesson.objects.filter(
        group__branch_id__in=branch_ids,
        datetime__date=report_date,
    ).select_related("group", "teacher__user")
    lessons_yesterday = Lesson.objects.filter(
        group__branch_id__in=branch_ids,
        datetime__date=yesterday,
    )

    total_lessons = lessons_today.count()
    conducted = lessons_today.filter(status="conducted").count()
    cancelled = lessons_today.filter(status="cancelled").count()
    conducted_yesterday = lessons_yesterday.filter(status="conducted").count()

    # Уроки без отметки посещаемости (conducted но attendance пустой)
    lessons_no_attendance = []
    for lesson in lessons_today.filter(status="conducted"):
        if not lesson.attendance.exists():
            lessons_no_attendance.append({
                "group_name": lesson.group.name,
                "teacher_name": lesson.teacher.user.full_name if lesson.teacher else "-",
                "time": lesson.datetime.strftime("%H:%M"),
            })

    cancelled_lessons = []
    for lesson in lessons_today.filter(status="cancelled"):
        cancelled_lessons.append({
            "group_name": lesson.group.name,
            "teacher_name": lesson.teacher.user.full_name if lesson.teacher else "-",
            "time": lesson.datetime.strftime("%H:%M"),
            "reason": lesson.cancel_reason or "",
        })

    # 3. ПОСЕЩАЕМОСТЬ УЧЕНИКОВ
    attendance_today = Attendance.objects.filter(
        lesson__group__branch_id__in=branch_ids,
        lesson__datetime__date=report_date,
    ).select_related("student__user", "lesson__group", "lesson__teacher__user")
    attendance_yesterday = Attendance.objects.filter(
        lesson__group__branch_id__in=branch_ids,
        lesson__datetime__date=yesterday,
    )

    present_students, total_students = attendance_rate_parts(attendance_today)
    absent_students = attendance_today.filter(status="absent").count()
    late_students = attendance_today.filter(status="late").count()
    excused_students = attendance_today.filter(status="excused").count()
    att_rate_today = round(present_students / total_students * 100, 1) if total_students else 0

    present_students_y, total_students_y = attendance_rate_parts(attendance_yesterday)
    att_rate_yesterday = round(present_students_y / total_students_y * 100, 1) if total_students_y else 0

    absent_list = []
    for att in attendance_today.filter(status="absent").select_related(
        "student__user", "lesson__group", "lesson__teacher__user"
    )[:20]:
        absent_list.append({
            "student_name": att.student.user.full_name,
            "group_name": att.lesson.group.name,
            "teacher_name": att.lesson.teacher.user.full_name if att.lesson.teacher else "-",
        })

    # 4. УЧИТЕЛЯ (TeacherAttendance)
    teacher_att_today = TeacherAttendance.objects.filter(
        lesson__datetime__date=report_date,
        lesson__group__branch_id__in=branch_ids,
    ).select_related("teacher__user", "lesson__group")

    teachers_present = teacher_att_today.filter(status="present").count()
    teachers_late = teacher_att_today.filter(status="late").count()
    teachers_absent = teacher_att_today.filter(status="absent").count()

    # Все учителя у которых есть уроки сегодня
    teachers_scheduled_ids = lessons_today.exclude(
        teacher=None
    ).values_list("teacher_id", flat=True).distinct()
    teachers_total = len(set(teachers_scheduled_ids))

    teacher_list = []
    for ta in teacher_att_today.order_by("status"):
        teacher_list.append({
            "teacher_name": ta.teacher.user.full_name,
            "status": ta.status,
            "check_in_time": ta.check_in_time.strftime("%H:%M") if ta.check_in_time else None,
            "late_minutes": ta.late_minutes,
        })

    # 5. ЛИДЫ — модели Lead нет, блок отчёта не заполняется.

    return {
        "date": str(report_date),
        "yesterday": str(yesterday),
        "finance": {
            "income_today": str(_quantize(income_today)),
            "income_yesterday": str(_quantize(income_yesterday)),
            "income_delta": str(_quantize(income_today - income_yesterday)),
            "charges_today": str(_quantize(charges_today)),
            "new_debtors_today": new_debtors_today,
            "total_debt": str(_quantize(abs(total_debt))),
            "top_payments": [
                {
                    "student_name": p["student__user__full_name"],
                    "amount": str(p["amount"]),
                    "method": p["method"] or "-",
                    "time": p["created_at"].strftime("%H:%M"),
                }
                for p in top_payments
            ],
            "payments_count": payments_today.filter(payment_type__in=INCOME_PAYMENT_TYPES).count(),
        },
        "lessons": {
            "total": total_lessons,
            "conducted": conducted,
            "cancelled": cancelled,
            "conducted_yesterday": conducted_yesterday,
            "no_attendance_count": len(lessons_no_attendance),
            "no_attendance_list": lessons_no_attendance,
            "cancelled_list": cancelled_lessons,
        },
        "students": {
            # total — знаменатель посещаемости: отметки без уважительных, чтобы
            # present + absent сходилось с total. Уважительные отдаются отдельно.
            "total": total_students,
            "present": present_students,
            "absent": absent_students,
            "late": late_students,
            "excused": excused_students,
            "attendance_rate": att_rate_today,
            "attendance_rate_yesterday": att_rate_yesterday,
            "absent_list": absent_list,
        },
        "teachers": {
            "total": teachers_total,
            "present": teachers_present,
            "late": teachers_late,
            "absent": teachers_absent,
            "no_data": teachers_total - teachers_present - teachers_late - teachers_absent,
            "list": teacher_list,
        },
        "leads": {
            "today": 0,
            "yesterday": 0,
            "delta": 0,
            "list": [],
        },
    }


def get_audit_logs_snapshot(user, filters: ReportFilters) -> list[dict]:
    branch_ids = branch_ids_for_user(user, filters.branch_id)
    logs_qs = AuditLog.objects.select_related("user").filter(
        timestamp__date__gte=filters.date_from,
        timestamp__date__lte=filters.date_to,
    )
    if user.role not in ("superadmin", "director"):
        logs_qs = logs_qs.filter(user__staff_profile__branch_id__in=branch_ids)
    return [
        {
            "id": str(log.id),
            "user_id": str(log.user_id) if log.user_id else None,
            "user_role": log.user_role,
            "action": log.action,
            "entity_type": log.entity_type,
            "entity_id": log.entity_id,
            "ip_address": str(log.ip_address) if log.ip_address else None,
            "timestamp": log.timestamp.isoformat(),
        }
        for log in logs_qs.order_by("-timestamp")[:5000]
    ]


def get_group_report(group_id, date_from=None, date_to=None):
    """Detailed report for a single group."""
    import calendar as cal
    from apps.courses.models import Group
    from apps.grades.models import Grade

    try:
        group = Group.objects.select_related("course", "teacher__user", "branch", "room").get(id=group_id)
    except Group.DoesNotExist:
        return None

    # Период по умолчанию — по времени центра, а не сервера: иначе с полуночи
    # до 05:00 отчёт открывался за вчерашний месяц.
    today = timezone.localdate()
    if not date_from:
        date_from = date(today.year, today.month, 1)
    if not date_to:
        date_to = today

    members = GroupMembership.objects.filter(group=group, left_at__isnull=True).select_related("student__user")
    student_ids = [m.student_id for m in members]

    lessons_qs = Lesson.objects.filter(
        group=group, datetime__date__gte=date_from, datetime__date__lte=date_to
    ).order_by("-datetime")
    total_lessons = lessons_qs.count()
    conducted = lessons_qs.filter(status="conducted").count()
    cancelled = lessons_qs.filter(status="cancelled").count()

    attendance_qs = Attendance.objects.filter(
        lesson__group=group, lesson__datetime__date__gte=date_from, lesson__datetime__date__lte=date_to
    )
    present_att, total_att = attendance_rate_parts(attendance_qs)
    attendance_rate = round(present_att / total_att * 100, 1) if total_att else 0

    # Monthly attendance (last 6 months)
    monthly_attendance = []
    for i in range(5, -1, -1):
        m_date = date(today.year, today.month, 1) - timedelta(days=i * 30)
        m_start = date(m_date.year, m_date.month, 1)
        m_end = date(m_start.year, m_start.month, cal.monthrange(m_start.year, m_start.month)[1])
        m_att = Attendance.objects.filter(
            lesson__group=group, lesson__datetime__date__gte=m_start, lesson__datetime__date__lte=m_end
        )
        m_present, m_total = attendance_rate_parts(m_att)
        monthly_attendance.append({
            "month": m_start.strftime("%b"),
            "rate": round(m_present / m_total * 100, 1) if m_total else 0,
        })

    # Finance
    payments_qs = Payment.objects.filter(
        group=group, created_at__date__gte=date_from, created_at__date__lte=date_to
    )
    income = float(_net_revenue(payments_qs))
    charges = float(payments_qs.filter(payment_type__in=CHARGE_PAYMENT_TYPES).aggregate(
        t=Coalesce(Sum("amount"), Decimal("0"))
    )["t"])

    # Debtors — combined_balance = wallet_balance + bonus_balance, тем же
    # правилом, что и в остальных отчётах.
    debtors = with_combined_balance(
        Student.objects.select_related("user").filter(id__in=student_ids)
    ).filter(combined_balance__lt=0)
    debtors_list = [
        {"student_id": str(d.id), "student_name": d.user.full_name, "balance": float(d.combined_balance)}
        for d in debtors
    ]

    # Recent lessons
    recent_lessons = []
    for lesson in lessons_qs[:10]:
        att = Attendance.objects.filter(lesson=lesson)
        present, counted = attendance_rate_parts(att)
        # Если журнал ещё не отмечен, показываем размер группы как знаменатель.
        total = counted or len(student_ids)
        recent_lessons.append({
            "id": str(lesson.id),
            "date": lesson.datetime.strftime("%d %b"),
            "topic": lesson.topic or "",
            "status": lesson.status,
            "present": present,
            "total": total,
        })

    # Students with attendance
    students_data = []
    for member in members:
        student = member.student
        s_att = attendance_qs.filter(student=student)
        s_present, s_total = attendance_rate_parts(s_att)
        s_rate = round(s_present / s_total * 100, 1) if s_total else 0
        last_grade = Grade.objects.filter(student=student, group=group).order_by("-graded_at").first()
        students_data.append({
            "student_id": str(student.id),
            "student_name": student.user.full_name,
            "phone": student.user.phone or "",
            # Намеренно НЕ combined_balance, в отличие от debtors_list выше:
            # это полный ростер группы (не вопрос "должник или нет"), просто
            # состояние основного счёта. У одного ученика здесь и в
            # debtors_list могут быть разные числа — это ожидаемо, не баг.
            "balance": float(student.wallet_balance),
            "attendance_rate": s_rate,
            "last_grade": float(last_grade.score) if last_grade else None,
        })

    avg_grade = Grade.objects.filter(group=group).aggregate(avg=Avg("score"))["avg"]

    return {
        "group": {
            "id": str(group.id),
            "name": group.name,
            "status": group.status,
            "teacher_name": group.teacher.user.full_name if group.teacher else None,
            "course_name": group.course.name if group.course else None,
            "room_name": group.room.name if group.room else None,
            "monthly_price": float(group.monthly_price or 0),
            "capacity": group.capacity,
        },
        "period": {"date_from": str(date_from), "date_to": str(date_to)},
        "kpi": {
            "students_count": len(student_ids),
            "debtors_count": len(debtors_list),
            "attendance_rate": attendance_rate,
            "total_lessons": total_lessons,
            "conducted_lessons": conducted,
            "cancelled_lessons": cancelled,
            "avg_grade": round(float(avg_grade), 1) if avg_grade else None,
            "monthly_income": float(group.monthly_price or 0) * len(student_ids),
        },
        "monthly_attendance": monthly_attendance,
        "debtors": debtors_list,
        "recent_lessons": recent_lessons,
        "students": students_data,
        "finance": {
            "income": income,
            "charges": charges,
            "total_debt": sum(d["balance"] for d in debtors_list),
        },
    }
