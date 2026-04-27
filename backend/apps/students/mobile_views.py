from collections import defaultdict
from datetime import timedelta

from django.db.models import Avg
from drf_spectacular.utils import OpenApiTypes, extend_schema
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsParent, IsStudent
from apps.courses.models import GroupMembership
from apps.finance.models import Payment
from apps.grades.models import Grade
from apps.homework.models import HomeworkStatus
from apps.lessons.models import Attendance, Lesson

from .models import Parent, ParentStudentLink, Student


ATTENDANCE_PRESENT_STATUSES = {"present", "late", "online"}


def _parse_period(request):
    today = timezone.localdate()
    default_from = today - timedelta(days=30)
    date_from = parse_date(request.query_params.get("date_from", "")) or default_from
    date_to = parse_date(request.query_params.get("date_to", "")) or today
    if date_from > date_to:
        date_from, date_to = date_to, date_from
    return date_from, date_to


def _active_group_ids_for_student(student: Student):
    return list(
        GroupMembership.objects.filter(student=student, left_at__isnull=True).values_list(
            "group_id",
            flat=True,
        )
    )


class StudentMeView(APIView):
    permission_classes = [IsStudent]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        student = request.user.student_profile
        active_groups = GroupMembership.objects.filter(
            student=student,
            left_at__isnull=True,
        ).select_related("group", "group__course")
        return Response(
            {
                "id": str(student.id),
                "full_name": student.user.full_name,
                "phone": student.user.phone,
                "branch_id": str(student.branch_id) if student.branch_id else None,
                "date_of_birth": str(student.date_of_birth) if student.date_of_birth else None,
                "status": student.status,
                "wallet_balance": str(student.wallet_balance),
                "registered_at": student.registered_at.isoformat(),
                "groups": [
                    {
                        "group_id": str(membership.group_id),
                        "group_name": membership.group.name,
                        "course_name": membership.group.course.name,
                    }
                    for membership in active_groups
                ],
            },
            status=status.HTTP_200_OK,
        )


class StudentMeScheduleView(APIView):
    permission_classes = [IsStudent]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        student = request.user.student_profile
        group_ids = _active_group_ids_for_student(student)
        if not group_ids:
            return Response({"results": []}, status=status.HTTP_200_OK)

        date_from, date_to = _parse_period(request)
        lessons = (
            Lesson.objects.select_related("group", "teacher__user", "room")
            .filter(
                group_id__in=group_ids,
                datetime__date__gte=date_from,
                datetime__date__lte=date_to,
            )
            .order_by("datetime")
        )
        return Response(
            {
                "date_from": str(date_from),
                "date_to": str(date_to),
                "results": [
                    {
                        "lesson_id": str(lesson.id),
                        "group_id": str(lesson.group_id),
                        "group_name": lesson.group.name,
                        "datetime": lesson.datetime.isoformat(),
                        "status": lesson.status,
                        "topic": lesson.topic,
                        "teacher_name": (
                            lesson.teacher.user.full_name
                            if lesson.teacher and lesson.teacher.user
                            else None
                        ),
                        "room_name": lesson.room.name if lesson.room else None,
                    }
                    for lesson in lessons
                ],
            },
            status=status.HTTP_200_OK,
        )


class StudentMeAttendanceView(APIView):
    permission_classes = [IsStudent]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        student = request.user.student_profile
        date_from, date_to = _parse_period(request)

        queryset = Attendance.objects.select_related("lesson", "lesson__group").filter(
            student=student
        )
        queryset = queryset.filter(
            lesson__datetime__date__gte=date_from,
            lesson__datetime__date__lte=date_to,
        )
        group_id = request.query_params.get("group_id")
        if group_id:
            queryset = queryset.filter(lesson__group_id=group_id)

        total = queryset.count()
        present = queryset.filter(status__in=ATTENDANCE_PRESENT_STATUSES).count()
        attendance_percent = round((present * 100 / total), 2) if total else 0

        return Response(
            {
                "date_from": str(date_from),
                "date_to": str(date_to),
                "total": total,
                "present": present,
                "attendance_percent": attendance_percent,
                "records": [
                    {
                        "attendance_id": str(item.id),
                        "lesson_id": str(item.lesson_id),
                        "group_id": str(item.lesson.group_id),
                        "group_name": item.lesson.group.name,
                        "lesson_datetime": item.lesson.datetime.isoformat(),
                        "status": item.status,
                        "late_minutes": item.late_minutes,
                        "comment": item.comment,
                    }
                    for item in queryset.order_by("-lesson__datetime")
                ],
            },
            status=status.HTTP_200_OK,
        )


class StudentMeGradesView(APIView):
    permission_classes = [IsStudent]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        student = request.user.student_profile
        grades_qs = Grade.objects.select_related("group", "lesson", "exam").filter(student=student)
        group_id = request.query_params.get("group_id")
        if group_id:
            grades_qs = grades_qs.filter(group_id=group_id)

        grouped = defaultdict(list)
        for grade in grades_qs.order_by("-graded_at"):
            grouped[str(grade.group_id)].append(grade)

        group_payload = []
        for current_group_id, items in grouped.items():
            average_score = sum(item.score for item in items) / len(items)
            group_payload.append(
                {
                    "group_id": current_group_id,
                    "group_name": items[0].group.name,
                    "average_score": round(float(average_score), 2),
                    "grades": [
                        {
                            "grade_id": str(item.id),
                            "grade_type": item.grade_type,
                            "score": item.score,
                            "comment": item.comment,
                            "lesson_id": str(item.lesson_id) if item.lesson_id else None,
                            "exam_id": str(item.exam_id) if item.exam_id else None,
                            "graded_at": item.graded_at.isoformat(),
                        }
                        for item in items
                    ],
                }
            )

        overall_avg = grades_qs.aggregate(avg=Avg("score"))["avg"]
        return Response(
            {
                "overall_average": (
                    round(float(overall_avg), 2) if overall_avg is not None else None
                ),
                "groups": group_payload,
            },
            status=status.HTTP_200_OK,
        )


class StudentMeHomeworksView(APIView):
    permission_classes = [IsStudent]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        student = request.user.student_profile
        statuses = HomeworkStatus.objects.select_related("homework", "homework__group").filter(
            student=student
        )

        date_from, date_to = _parse_period(request)
        statuses = statuses.filter(
            homework__created_at__date__gte=date_from,
            homework__created_at__date__lte=date_to,
        )

        summary = defaultdict(int)
        active = []
        history = []
        for item in statuses.order_by("-homework__created_at"):
            summary[item.status] += 1
            payload = {
                "status_id": str(item.id),
                "homework_id": str(item.homework_id),
                "title": item.homework.title,
                "group_id": str(item.homework.group_id),
                "group_name": item.homework.group.name,
                "deadline": item.homework.deadline.isoformat() if item.homework.deadline else None,
                "status": item.status,
                "grade": item.grade,
                "teacher_comment": item.teacher_comment,
                "submitted_at": item.submitted_at.isoformat() if item.submitted_at else None,
                "checked_at": item.checked_at.isoformat() if item.checked_at else None,
            }
            if item.status in ("checked", "overdue"):
                history.append(payload)
            else:
                active.append(payload)

        return Response(
            {
                "date_from": str(date_from),
                "date_to": str(date_to),
                "summary": dict(summary),
                "active": active,
                "history": history,
            },
            status=status.HTTP_200_OK,
        )


class StudentMeWalletView(APIView):
    permission_classes = [IsStudent]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        student = request.user.student_profile
        limit_raw = request.query_params.get("limit", "50")
        try:
            limit = max(1, min(200, int(limit_raw)))
        except ValueError:
            limit = 50

        payments = (
            Payment.objects.select_related("group", "lesson", "created_by")
            .filter(student=student)
            .order_by("-created_at")[:limit]
        )
        return Response(
            {
                "student_id": str(student.id),
                "wallet_balance": str(student.wallet_balance),
                "transactions": [
                    {
                        "payment_id": str(payment.id),
                        "payment_type": payment.payment_type,
                        "amount": str(payment.amount),
                        "balance_before": str(payment.balance_before),
                        "balance_after": str(payment.balance_after),
                        "group_id": str(payment.group_id) if payment.group_id else None,
                        "lesson_id": str(payment.lesson_id) if payment.lesson_id else None,
                        "comment": payment.comment,
                        "created_at": payment.created_at.isoformat(),
                    }
                    for payment in payments
                ],
            },
            status=status.HTTP_200_OK,
        )


class StudentMeDocumentsView(APIView):
    permission_classes = [IsStudent]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        student = request.user.student_profile
        documents = student.documents.all().order_by("-uploaded_at")
        certificates = student.certificates.select_related("course").all().order_by("-issued_at")
        return Response(
            {
                "documents": [
                    {
                        "id": str(document.id),
                        "doc_type": document.doc_type,
                        "file": document.file.url if document.file else None,
                        "uploaded_at": document.uploaded_at.isoformat(),
                    }
                    for document in documents
                ],
                "certificates": [
                    {
                        "id": str(certificate.id),
                        "course_id": str(certificate.course_id) if certificate.course_id else None,
                        "course_name": certificate.course.name if certificate.course else None,
                        "issued_at": str(certificate.issued_at),
                        "file": certificate.file.url if certificate.file else None,
                    }
                    for certificate in certificates
                ],
            },
            status=status.HTTP_200_OK,
        )


class ParentChildLinkSerializer(serializers.Serializer):
    student_id = serializers.UUIDField()

    def validate_student_id(self, value):
        if not Student.objects.filter(id=value).exists():
            raise serializers.ValidationError("Student not found")
        return value


class ParentMeChildrenView(APIView):
    permission_classes = [IsParent]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        parent, _ = Parent.objects.get_or_create(user=request.user)
        children = parent.children.select_related("user", "branch").all()
        today = timezone.localdate()
        window_start = today - timedelta(days=30)

        results = []
        for child in children:
            group_ids = _active_group_ids_for_student(child)
            upcoming_lesson = (
                Lesson.objects.select_related("group")
                .filter(
                    group_id__in=group_ids,
                    datetime__gte=timezone.now(),
                    status__in=("scheduled", "rescheduled"),
                )
                .order_by("datetime")
                .first()
            )
            attendance_qs = Attendance.objects.filter(
                student=child,
                lesson__datetime__date__gte=window_start,
                lesson__datetime__date__lte=today,
            )
            total = attendance_qs.count()
            present = attendance_qs.filter(status__in=ATTENDANCE_PRESENT_STATUSES).count()
            attendance_percent = round((present * 100 / total), 2) if total else 0
            active_homeworks = HomeworkStatus.objects.filter(
                student=child,
                status__in=("not_submitted", "submitted", "revision"),
            ).count()
            avg_grade = Grade.objects.filter(student=child).aggregate(avg=Avg("score"))["avg"]

            results.append(
                {
                    "student_id": str(child.id),
                    "full_name": child.user.full_name,
                    "phone": child.user.phone,
                    "status": child.status,
                    "wallet_balance": str(child.wallet_balance),
                    "attendance_percent": attendance_percent,
                    "average_grade": round(float(avg_grade), 2) if avg_grade is not None else None,
                    "active_homeworks": active_homeworks,
                    "upcoming_lesson": (
                        {
                            "lesson_id": str(upcoming_lesson.id),
                            "group_name": upcoming_lesson.group.name,
                            "datetime": upcoming_lesson.datetime.isoformat(),
                        }
                        if upcoming_lesson
                        else None
                    ),
                }
            )
        return Response({"children": results}, status=status.HTTP_200_OK)


class ParentLinkChildView(APIView):
    permission_classes = [IsParent]

    @extend_schema(request=ParentChildLinkSerializer, responses=OpenApiTypes.OBJECT)
    def post(self, request):
        serializer = ParentChildLinkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        student = Student.objects.get(id=serializer.validated_data["student_id"])
        parent, _ = Parent.objects.get_or_create(user=request.user)
        link, created = ParentStudentLink.objects.get_or_create(parent=parent, student=student)
        return Response(
            {
                "linked": created,
                "student_id": str(student.id),
                "linked_at": link.linked_at.isoformat(),
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
