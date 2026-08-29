from rest_framework.permissions import BasePermission


class IsSuperAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == "superadmin"
        )


class IsDirector(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in ("superadmin", "director")
        )


class IsBranchAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in ("superadmin", "director", "branch_admin")
        )


class IsFinanceWriter(BasePermission):
    """superadmin/director/branch_admin/accountant — write access to payments/expenses.

    Deliberately NOT the same as IsBranchAdmin: that class is also imported by
    courses/institutions/lessons/staff/students views, where accountant must
    have zero access. This class exists only for money-handling endpoints.
    """

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in ("superadmin", "director", "branch_admin", "accountant")
        )


class IsAccountantOrDirector(BasePermission):
    """Chart-of-accounts management, salary calculation, reconciliation statements.

    Deliberately narrower than IsFinanceWriter: branch_admin should not
    configure expense categories or see a salary calculation for staff
    outside their own branch — those stay director/accountant only.
    """

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in ("superadmin", "director", "accountant")
        )


class IsAccountant(BasePermission):
    """Period close/reopen — the one action even director does not get.

    superadmin is included as the platform-owner override that every other
    permission class in this file also grants; director is deliberately
    excluded — that exclusion is the entire point of this permission class.
    """

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in ("superadmin", "accountant")
        )


class IsTeacher(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in (
                "superadmin",
                "director",
                "branch_admin",
                "teacher",
            )
        )


class IsSupportTeacher(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == "support_teacher"
        )


class IsTeacherOrSupport(BasePermission):
    """Разрешает доступ и teacher и support_teacher"""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in ("teacher", "support_teacher")
        )


class IsStudent(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == "student"
        )


class IsParent(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == "parent"
        )
