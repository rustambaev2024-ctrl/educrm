from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.db.models import Count, Sum, Avg
from django.db.models.functions import Coalesce, TruncDate
from django.db.models import F
from django.utils import timezone

from apps.audit.models import AuditLog
from apps.courses.models import GroupMembership
from apps.finance.models import Payment
from apps.institutions.models import Branch, Room
from apps.lessons.models import Attendance, Lesson, TeacherAttendance
from apps.staff.models import Staff, StaffPenalty
from apps.students.models import Student


ATTENDANCE_PRESENT_STATUSES = ("present", "late", "online")
ACTIVE_STUDENT_STATUSES = ("active", "frozen", "debtor")


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


def _branch_ids_for_user(user, branch_id: str | None = None) -> list:
    if user.role in ("superadmin", "director"):
        queryset = Branch.objects.all()
        if branch_id:
            queryset = queryset.filter(id=branch_id)
        return list(queryset.values_list("id", flat=True))

    if (
        user.role in ("admin", "branch_admin", "teacher")
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
    branch_ids = _branch_ids_for_user(user, filters.branch_id)
    students_qs = Student.objects.filter(branch_id__in=branch_ids)
    students_qs = _with_date_range(students_qs, "registered_at", filters.date_from, filters.date_to)
    total_students = students_qs.count()
    active_students = students_qs.filter(status__in=ACTIVE_STUDENT_STATUSES).count()
    debtors_count = Student.objects.filter(branch_id__in=branch_ids, wallet_balance__lt=0).count()

    payments_qs = Payment.objects.filter(
        branch_id__in=branch_ids,
        payment_type="top_up",
    )
    payments_qs = _with_date_range(payments_qs, "created_at", filters.date_from, filters.date_to)
    revenue_total = payments_qs.aggregate(total=Coalesce(Sum("amount"), Decimal("0.00")))["total"]

    attendance_qs = Attendance.objects.filter(lesson__group__branch_id__in=branch_ids)
    attendance_qs = _with_date_range(
        attendance_qs,
        "lesson__datetime",
        filters.date_from,
        filters.date_to,
    )
    attendance_total = attendance_qs.count()
    attendance_present = attendance_qs.filter(status__in=ATTENDANCE_PRESENT_STATUSES).count()

    return {
        "period": {"date_from": str(filters.date_from), "date_to": str(filters.date_to)},
        "students_total": total_students,
        "students_active": active_students,
        "debtors_count": debtors_count,
        "revenue_total": str(_quantize(revenue_total)),
        "attendance_rate": str(_percentage(attendance_present, attendance_total)),
    }


def get_attendance_report(user, filters: ReportFilters) -> dict:
    branch_ids = _branch_ids_for_user(user, filters.branch_id)
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
        total = branch_qs.count()
        present = branch_qs.filter(status__in=ATTENDANCE_PRESENT_STATUSES).count()
        results.append(
            {
                "branch_id": str(branch.id),
                "branch_name": branch.name,
                "total_records": total,
                "present_records": present,
                "absent_records": branch_qs.filter(status="absent").count(),
                "attendance_rate": str(_percentage(present, total)),
            }
        )

    overall_total = attendance_qs.count()
    overall_present = attendance_qs.filter(status__in=ATTENDANCE_PRESENT_STATUSES).count()
    return {
        "period": {"date_from": str(filters.date_from), "date_to": str(filters.date_to)},
        "overall_rate": str(_percentage(overall_present, overall_total)),
        "results": results,
    }


def get_revenue_report(user, filters: ReportFilters) -> dict:
    branch_ids = _branch_ids_for_user(user, filters.branch_id)
    payments_qs = Payment.objects.filter(branch_id__in=branch_ids, payment_type="top_up")
    payments_qs = _with_date_range(payments_qs, "created_at", filters.date_from, filters.date_to)

    total_revenue = payments_qs.aggregate(total=Coalesce(Sum("amount"), Decimal("0.00")))["total"]
    by_branch = (
        payments_qs.values("branch_id", "branch__name")
        .annotate(total=Coalesce(Sum("amount"), Decimal("0.00")), transactions=Count("id"))
        .order_by("-total")
    )
    by_group = (
        payments_qs.values("group_id", "group__name")
        .annotate(total=Coalesce(Sum("amount"), Decimal("0.00")), transactions=Count("id"))
        .order_by("-total")
    )
    by_day = (
        payments_qs.annotate(day=TruncDate("created_at"))
        .values("day")
        .annotate(total=Coalesce(Sum("amount"), Decimal("0.00")))
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
        "by_day": [
            {"day": str(row["day"]), "total": str(_quantize(row["total"]))}
            for row in by_day
        ],
    }


def get_teachers_report(user, filters: ReportFilters) -> dict:
    branch_ids = _branch_ids_for_user(user, filters.branch_id)
    teachers_qs = Staff.objects.select_related("user", "branch").filter(
        user__role="teacher",
        branch_id__in=branch_ids,
    )

    attendance_qs = Attendance.objects.filter(lesson__group__branch_id__in=branch_ids)
    attendance_qs = _with_date_range(
        attendance_qs,
        "lesson__datetime",
        filters.date_from,
        filters.date_to,
    )
    payments_qs = Payment.objects.filter(
        branch_id__in=branch_ids,
        payment_type="top_up",
    )
    payments_qs = _with_date_range(payments_qs, "created_at", filters.date_from, filters.date_to)

    rows = []
    for teacher in teachers_qs:
        # Attendance for the teacher (pre-filtered by branch/date)
        teacher_att = attendance_qs.filter(lesson__teacher=teacher)
        total_att = teacher_att.count()
        present_att = teacher_att.filter(status__in=ATTENDANCE_PRESENT_STATUSES).count()

        # Revenue for teacher's groups
        teacher_revenue = payments_qs.filter(group__teacher=teacher).aggregate(
            total=Coalesce(Sum("amount"), Decimal("0.00"))
        )["total"]

        # Active students taught by this teacher
        students_count = (
            GroupMembership.objects.filter(
                group__teacher=teacher,
                group__branch_id__in=branch_ids,
                left_at__isnull=True,
            )
            .values("student_id")
            .distinct()
            .count()
        )

        # Lessons and lesson-level stats for the period
        lessons_qs = Lesson.objects.filter(
            group__branch_id__in=branch_ids,
            teacher=teacher,
        )
        lessons_qs = _with_date_range(lessons_qs, "datetime", filters.date_from, filters.date_to)
        total_lessons = lessons_qs.count()
        conducted_lessons = lessons_qs.filter(status="conducted").count()
        cancelled_lessons = lessons_qs.filter(status="cancelled").count()

        # Attendance breakdown
        present_count = teacher_att.filter(status__in=["present", "late"]).count()
        absent_count = teacher_att.filter(status="absent").count()
        late_count = teacher_att.filter(status="late").count()
        avg_late = (
            teacher_att
            .filter(status="late", late_minutes__isnull=False)
            .aggregate(avg=Avg("late_minutes"))
            ["avg"]
            or 0
        )

        attendance_rate_value = float(_percentage(present_att, total_att)) if total_att else 0.0

        rows.append(
            {
                "teacher_id": str(teacher.id),
                "teacher_name": teacher.user.full_name,
                "branch_id": str(teacher.branch_id) if teacher.branch_id else None,
                "branch_name": teacher.branch.name if teacher.branch else None,
                "students_count": students_count,
                # keep revenue as string to preserve existing formatting
                "revenue_total": str(_quantize(teacher_revenue)),
                # detailed fields for Nazorat page
                "attendance_rate": round(attendance_rate_value, 1),
                "conducted_lessons": conducted_lessons,
                "cancelled_lessons": cancelled_lessons,
                "total_lessons": total_lessons,
                "present_count": present_count,
                "absent_count": absent_count,
                "late_count": late_count,
                "avg_late_minutes": round(float(avg_late), 1),
                "conduct_rate": round((conducted_lessons / total_lessons * 100) if total_lessons else 0.0, 1),
            }
        )

    rows.sort(key=lambda row: Decimal(row["revenue_total"]), reverse=True)
    return {
        "period": {"date_from": str(filters.date_from), "date_to": str(filters.date_to)},
        "results": rows,
    }


def get_rooms_report(user, filters: ReportFilters) -> dict:
    branch_ids = _branch_ids_for_user(user, filters.branch_id)
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
    branch_ids = _branch_ids_for_user(user, filters.branch_id)
    students_qs = Student.objects.filter(branch_id__in=branch_ids)
    students_qs = _with_date_range(students_qs, "registered_at", filters.date_from, filters.date_to)

    total_registered = students_qs.count()
    active = students_qs.filter(status__in=ACTIVE_STUDENT_STATUSES).count()
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
    branch_ids = _branch_ids_for_user(user, filters.branch_id)
    debtors_qs = Student.objects.select_related("user", "branch").filter(
        branch_id__in=branch_ids,
        wallet_balance__lt=0,
    )
    results = [
        {
            "student_id": str(student.id),
            "full_name": student.user.full_name,
            "phone": student.user.phone,
            "branch_id": str(student.branch_id) if student.branch_id else None,
            "branch_name": student.branch.name if student.branch else None,
            "wallet_balance": str(_quantize(student.wallet_balance)),
            "status": student.status,
        }
        for student in debtors_qs.order_by("user__full_name")
    ]
    return {
        "period": {"date_from": str(filters.date_from), "date_to": str(filters.date_to)},
        "debtors_count": len(results),
        "results": results,
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

    payments_qs = Payment.objects.filter(
        payment_type="charge",
        group__teacher=teacher,
        created_at__date__gte=period_start,
        created_at__date__lte=period_end,
        lesson__attendance__student_id=F("student_id"),
        lesson__attendance__status__in=["present", "late"],
    ).distinct()

    students_data = (
        payments_qs
        .exclude(group_id__isnull=True)
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
        gid = str(row["group_id"])
        if gid not in groups_map:
            groups_map[gid] = {
                "group_id": gid,
                "group_name": row["group__name"] or "Unnamed group",
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
    net_salary = _quantize(max(calculated_salary - total_penalties, Decimal("0.00")))
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
    }

    cache.set(cache_key, result, timeout=300)
    return result


def get_daily_report(user, report_date: date, branch_id: str | None = None) -> dict:
    """Ежедневный отчёт 'Kunlik hisobot'."""
    branch_ids = _branch_ids_for_user(user, branch_id)
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
    income_today = payments_today.filter(payment_type="top_up").aggregate(
        total=Coalesce(Sum("amount"), Decimal("0"))
    )["total"]
    income_yesterday = payments_yesterday.filter(payment_type="top_up").aggregate(
        total=Coalesce(Sum("amount"), Decimal("0"))
    )["total"]
    charges_today = payments_today.filter(payment_type="charge").aggregate(
        total=Coalesce(Sum("amount"), Decimal("0"))
    )["total"]

    top_payments = list(
        payments_today.filter(payment_type="top_up")
        .select_related("student__user")
        .order_by("-amount")[:5]
        .values("amount", "payment_method", "created_at", "student__user__full_name")
    )

    new_debtors_today = Student.objects.filter(
        branch_id__in=branch_ids,
        wallet_balance__lt=0,
        updated_at__date=report_date,
    ).count()
    total_debt = Student.objects.filter(
        branch_id__in=branch_ids,
        wallet_balance__lt=0,
    ).aggregate(total=Coalesce(Sum("wallet_balance"), Decimal("0")))["total"]

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

    total_students = attendance_today.count()
    present_students = attendance_today.filter(status__in=["present", "late"]).count()
    absent_students = attendance_today.filter(status="absent").count()
    late_students = attendance_today.filter(status="late").count()
    att_rate_today = round(present_students / total_students * 100, 1) if total_students else 0

    total_students_y = attendance_yesterday.count()
    present_students_y = attendance_yesterday.filter(status__in=["present", "late"]).count()
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

    # 5. ЛИДЫ (заглушка, так как модель Lead не существует)
    new_leads_count = 0
    new_leads_yesterday = 0
    leads_list = []

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
                    "method": p["payment_method"],
                    "time": p["created_at"].strftime("%H:%M"),
                }
                for p in top_payments
            ],
            "payments_count": payments_today.filter(payment_type="top_up").count(),
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
            "total": total_students,
            "present": present_students,
            "absent": absent_students,
            "late": late_students,
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
    branch_ids = _branch_ids_for_user(user, filters.branch_id)
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
