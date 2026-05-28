from datetime import date as date_type, datetime

from django.http import HttpResponse
from drf_spectacular.utils import OpenApiResponse, OpenApiTypes, extend_schema
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsBranchAdmin, IsDirector
from apps.lessons.models import Lesson, Attendance

from .exporters import export_excel, export_pdf
from .serializers import (
    AnalyticsFilterSerializer,
    ExportRequestSerializer,
    SalaryCalculateSerializer,
)
from .services import (
    calculate_teacher_salary,
    get_attendance_report,
    get_audit_logs_snapshot,
    get_conversion_report,
    get_daily_report,
    get_debtors_report,
    get_overview,
    get_revenue_report,
    get_rooms_report,
    get_teachers_report,
    normalize_filters,
)


class AnalyticsBaseView(APIView):
    permission_classes = [IsBranchAdmin]

    def get_filters(self, request):
        serializer = AnalyticsFilterSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        return normalize_filters(serializer.validated_data)


class AnalyticsOverviewView(AnalyticsBaseView):
    @extend_schema(parameters=[AnalyticsFilterSerializer], responses=OpenApiTypes.OBJECT)
    def get(self, request):
        return Response(get_overview(request.user, self.get_filters(request)))


class AnalyticsAttendanceView(AnalyticsBaseView):
    @extend_schema(parameters=[AnalyticsFilterSerializer], responses=OpenApiTypes.OBJECT)
    def get(self, request):
        return Response(get_attendance_report(request.user, self.get_filters(request)))


class AnalyticsRevenueView(AnalyticsBaseView):
    @extend_schema(parameters=[AnalyticsFilterSerializer], responses=OpenApiTypes.OBJECT)
    def get(self, request):
        return Response(get_revenue_report(request.user, self.get_filters(request)))


class AnalyticsTeachersView(AnalyticsBaseView):
    @extend_schema(parameters=[AnalyticsFilterSerializer], responses=OpenApiTypes.OBJECT)
    def get(self, request):
        from django.core.cache import cache
        filters = self.get_filters(request)
        tenant = getattr(request, "tenant", None)
        schema = tenant.schema_name if tenant else "public"
        cache_key = f"teachers_report:{schema}:{filters.date_from}:{filters.date_to}:{filters.branch_id}"
        cached = cache.get(cache_key)
        if cached:
            return Response(cached)
        data = get_teachers_report(request.user, filters)
        cache.set(cache_key, data, 300)
        return Response(data)


class TeacherLessonsView(APIView):
    """Детальные уроки учителя за период — для боковой панели."""
    permission_classes = [IsBranchAdmin]

    @extend_schema(parameters=[AnalyticsFilterSerializer], responses=OpenApiTypes.OBJECT)
    def get(self, request):
        teacher_id = request.query_params.get("teacher_id")
        if not teacher_id:
            return Response({"detail": "teacher_id required"}, status=status.HTTP_400_BAD_REQUEST)

        serializer = AnalyticsFilterSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        filters = normalize_filters(serializer.validated_data)

        lessons = Lesson.objects.filter(teacher_id=teacher_id).select_related("group", "room").order_by("-datetime")
        if filters.date_from:
            lessons = lessons.filter(datetime__date__gte=filters.date_from)
        if filters.date_to:
            lessons = lessons.filter(datetime__date__lte=filters.date_to)

        lessons = lessons[:50]

        result = []
        for lesson in lessons:
            attendance_qs = Attendance.objects.filter(lesson=lesson)
            present = attendance_qs.filter(status__in=["present", "late"]).count()
            absent = attendance_qs.filter(status="absent").count()
            total = attendance_qs.count()
            result.append({
                "id": str(lesson.id),
                "datetime": lesson.datetime.isoformat(),
                "group_name": lesson.group.name if lesson.group else "",
                "room": lesson.room.name if lesson.room else "",
                "status": lesson.status,
                "topic": lesson.topic or "",
                "present_count": present,
                "absent_count": absent,
                "total_students": total,
                "attendance_rate": round((present / total * 100) if total else 0, 1),
            })

        return Response(result)


class AnalyticsRoomsView(AnalyticsBaseView):
    @extend_schema(parameters=[AnalyticsFilterSerializer], responses=OpenApiTypes.OBJECT)
    def get(self, request):
        return Response(get_rooms_report(request.user, self.get_filters(request)))


class AnalyticsConversionView(AnalyticsBaseView):
    @extend_schema(parameters=[AnalyticsFilterSerializer], responses=OpenApiTypes.OBJECT)
    def get(self, request):
        return Response(get_conversion_report(request.user, self.get_filters(request)))


class AnalyticsDebtorsView(AnalyticsBaseView):
    @extend_schema(parameters=[AnalyticsFilterSerializer], responses=OpenApiTypes.OBJECT)
    def get(self, request):
        return Response(get_debtors_report(request.user, self.get_filters(request)))


class SalaryCalculateView(APIView):
    permission_classes = [IsDirector]

    @extend_schema(parameters=[SalaryCalculateSerializer], responses=OpenApiTypes.OBJECT)
    def get(self, request):
        serializer = SalaryCalculateSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data
        report = calculate_teacher_salary(
            teacher_id=payload["teacher_id"],
            period_start=payload["date_from"],
            period_end=payload["date_to"],
            salary_percent=payload.get("salary_percent"),
        )
        return Response(report, status=status.HTTP_200_OK)


class TeacherSalaryView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(parameters=[AnalyticsFilterSerializer], responses=OpenApiTypes.OBJECT)
    def get(self, request):
        if request.user.role != "teacher":
            return Response({"detail": "Not a teacher"}, status=status.HTTP_403_FORBIDDEN)

        serializer = AnalyticsFilterSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        filters = normalize_filters(serializer.validated_data)

        # The teacher's ID is the ID of their Staff profile
        if not hasattr(request.user, "staff_profile"):
            return Response({"detail": "Staff profile not found"}, status=status.HTTP_404_NOT_FOUND)

        report = calculate_teacher_salary(
            teacher_id=request.user.staff_profile.id,
            period_start=filters.date_from,
            period_end=filters.date_to,
        )
        return Response(report, status=status.HTTP_200_OK)


def _build_export_payload(user, payload: dict) -> tuple[str, dict]:
    filters = normalize_filters(payload)
    report_type = payload["report_type"]

    if report_type == "finance":
        return report_type, get_revenue_report(user, filters)
    if report_type == "attendance":
        return report_type, get_attendance_report(user, filters)
    if report_type == "salary":
        return report_type, calculate_teacher_salary(
            teacher_id=payload["teacher_id"],
            period_start=filters.date_from,
            period_end=filters.date_to,
            salary_percent=payload.get("salary_percent"),
        )
    return report_type, {
        "period": {"date_from": str(filters.date_from), "date_to": str(filters.date_to)},
        "logs": get_audit_logs_snapshot(user, filters),
    }


class ExportExcelView(APIView):
    permission_classes = [IsBranchAdmin]

    @extend_schema(
        request=ExportRequestSerializer,
        responses={
            200: OpenApiResponse(response=OpenApiTypes.BINARY, description="Excel report file")
        },
    )
    def post(self, request):
        serializer = ExportRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        report_type, data = _build_export_payload(request.user, serializer.validated_data)
        file_bytes = export_excel(report_type, data)
        response = HttpResponse(
            file_bytes,
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = f'attachment; filename="{report_type}_report.xlsx"'
        return response


class ExportPdfView(APIView):
    permission_classes = [IsBranchAdmin]

    @extend_schema(
        request=ExportRequestSerializer,
        responses={200: OpenApiResponse(response=OpenApiTypes.BINARY, description="PDF report file")},
    )
    def post(self, request):
        serializer = ExportRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        report_type, data = _build_export_payload(request.user, serializer.validated_data)
        file_bytes = export_pdf(report_type, data)
        response = HttpResponse(file_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{report_type}_report.pdf"'
        return response


class DailyReportView(AnalyticsBaseView):
    @extend_schema(
        parameters=[
            {"name": "date", "in": "query", "schema": {"type": "string", "format": "date"}},
            {"name": "branch_id", "in": "query", "schema": {"type": "string"}},
        ],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request):
        from django.core.cache import cache
        date_str = request.query_params.get("date", str(date_type.today()))
        branch_id = request.query_params.get("branch_id")
        try:
            report_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            return Response({"error": "Invalid date format. Use YYYY-MM-DD"}, status=status.HTTP_400_BAD_REQUEST)
        tenant = getattr(request, "tenant", None)
        schema = tenant.schema_name if tenant else "public"
        cache_key = f"daily_report:{schema}:{date_str}:{branch_id or 'all'}"
        today_str = str(date_type.today())
        ttl = 300 if date_str == today_str else 3600
        cached = cache.get(cache_key)
        if cached:
            return Response(cached)
        data = get_daily_report(request.user, report_date, branch_id)
        cache.set(cache_key, data, ttl)
        return Response(data)


class GroupReportView(APIView):
    permission_classes = [IsBranchAdmin]

    def get(self, request, group_id):
        from django.core.cache import cache
        from .services import get_group_report

        date_from_str = request.query_params.get("date_from")
        date_to_str = request.query_params.get("date_to")
        date_from = datetime.strptime(date_from_str, "%Y-%m-%d").date() if date_from_str else None
        date_to = datetime.strptime(date_to_str, "%Y-%m-%d").date() if date_to_str else None

        tenant = getattr(request, "tenant", None)
        schema = tenant.schema_name if tenant else "public"
        cache_key = f"group_report:{schema}:{group_id}:{date_from}:{date_to}"
        cached = cache.get(cache_key)
        if cached:
            return Response(cached)

        data = get_group_report(str(group_id), date_from, date_to)
        if not data:
            return Response({"detail": "Group not found"}, status=status.HTTP_404_NOT_FOUND)

        cache.set(cache_key, data, 300)
        return Response(data)
