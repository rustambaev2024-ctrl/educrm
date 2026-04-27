from django.urls import path

from .mobile_views import (
    ParentLinkChildView,
    ParentMeChildrenView,
    StudentMeAttendanceView,
    StudentMeDocumentsView,
    StudentMeGradesView,
    StudentMeHomeworksView,
    StudentMeScheduleView,
    StudentMeView,
    StudentMeWalletView,
)

student_urlpatterns = [
    path("me/", StudentMeView.as_view(), name="student-me"),
    path("me/schedule/", StudentMeScheduleView.as_view(), name="student-me-schedule"),
    path("me/attendance/", StudentMeAttendanceView.as_view(), name="student-me-attendance"),
    path("me/grades/", StudentMeGradesView.as_view(), name="student-me-grades"),
    path("me/homeworks/", StudentMeHomeworksView.as_view(), name="student-me-homeworks"),
    path("me/wallet/", StudentMeWalletView.as_view(), name="student-me-wallet"),
    path("me/documents/", StudentMeDocumentsView.as_view(), name="student-me-documents"),
]

parent_urlpatterns = [
    path("me/children/", ParentMeChildrenView.as_view(), name="parent-me-children"),
    path("me/children/link/", ParentLinkChildView.as_view(), name="parent-me-link-child"),
]

