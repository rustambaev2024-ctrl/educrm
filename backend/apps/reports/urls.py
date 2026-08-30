from django.urls import path

from .views import (
    AnalyticsAttendanceView,
    AnalyticsConversionView,
    AnalyticsDebtorsView,
    AnalyticsOverviewView,
    AnalyticsRevenueView,
    AnalyticsRoomsView,
    AnalyticsTeachersView,
    DailyReportView,
    GroupReportView,
    TeacherLessonsView,
    ExportExcelView,
    ExportPdfView,
    SalaryCalculateView,
    TeacherSalaryView,
)

urlpatterns = [
    path("analytics/overview/", AnalyticsOverviewView.as_view(), name="analytics-overview"),
    path("analytics/attendance/", AnalyticsAttendanceView.as_view(), name="analytics-attendance"),
    path("analytics/revenue/", AnalyticsRevenueView.as_view(), name="analytics-revenue"),
    path("analytics/teachers/", AnalyticsTeachersView.as_view(), name="analytics-teachers"),
    path("analytics/teacher-lessons/", TeacherLessonsView.as_view(), name="analytics-teacher-lessons"),
    path("analytics/rooms/", AnalyticsRoomsView.as_view(), name="analytics-rooms"),
    path("analytics/conversion/", AnalyticsConversionView.as_view(), name="analytics-conversion"),
    path("analytics/debtors/", AnalyticsDebtorsView.as_view(), name="analytics-debtors"),
    path("salary/calculate/", SalaryCalculateView.as_view(), name="salary-calculate"),
    path("salary/me/", TeacherSalaryView.as_view(), name="teacher-salary"),
    path("export/excel/", ExportExcelView.as_view(), name="export-excel"),
    path("export/pdf/", ExportPdfView.as_view(), name="export-pdf"),
    path("analytics/daily-report/", DailyReportView.as_view(), name="daily-report"),
    path("analytics/group-report/<uuid:group_id>/", GroupReportView.as_view(), name="group-report"),
]

