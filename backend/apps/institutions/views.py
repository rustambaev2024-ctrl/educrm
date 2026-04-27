from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.permissions import IsBranchAdmin, IsDirector
from apps.students.models import Student

from .models import Branch, Room
from .serializers import BranchSerializer, RoomSerializer


class BranchViewSet(viewsets.ModelViewSet):
    queryset = Branch.objects.all().order_by("-created_at")
    serializer_class = BranchSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            permission_classes = [permissions.IsAuthenticated]
        else:
            permission_classes = [IsDirector]
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()
        if not user.is_authenticated:
            return qs.none()

        if user.role in ("superadmin", "director"):
            return qs

        if user.role in ("admin", "branch_admin", "teacher") and hasattr(user, "staff_profile"):
            branch_id = user.staff_profile.branch_id
            if branch_id:
                return qs.filter(id=branch_id)
        if user.role == "student" and hasattr(user, "student_profile"):
            branch_id = user.student_profile.branch_id
            return qs.filter(id=branch_id) if branch_id else qs.none()
        if user.role == "parent" and hasattr(user, "parent_profile"):
            return qs.filter(students__parents=user.parent_profile).distinct()

        return qs

    @action(detail=True, methods=["get"], url_path="debtors", permission_classes=[IsBranchAdmin])
    def debtors(self, request, pk=None):
        branch = self.get_object()
        debtors = (
            Student.objects.select_related("user")
            .filter(branch=branch, wallet_balance__lt=0)
            .order_by("user__full_name")
        )
        payload = [
            {
                "student_id": str(student.id),
                "full_name": student.user.full_name,
                "phone": student.user.phone,
                "status": student.status,
                "wallet_balance": str(student.wallet_balance),
            }
            for student in debtors
        ]
        return Response(
            {
                "branch_id": str(branch.id),
                "debtors_count": len(payload),
                "results": payload,
            },
            status=status.HTTP_200_OK,
        )


class RoomViewSet(viewsets.ModelViewSet):
    queryset = Room.objects.select_related("branch").all().order_by("branch__name", "name")
    serializer_class = RoomSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            permission_classes = [permissions.IsAuthenticated]
        else:
            permission_classes = [IsBranchAdmin]
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()
        if not user.is_authenticated:
            return qs.none()

        if user.role in ("superadmin", "director"):
            scoped = qs
        elif user.role in ("admin", "branch_admin", "teacher") and hasattr(user, "staff_profile"):
            branch_id = user.staff_profile.branch_id
            scoped = qs.filter(branch_id=branch_id) if branch_id else qs.none()
        elif user.role == "student" and hasattr(user, "student_profile"):
            branch_id = user.student_profile.branch_id
            scoped = qs.filter(branch_id=branch_id) if branch_id else qs.none()
        elif user.role == "parent" and hasattr(user, "parent_profile"):
            scoped = qs.filter(branch__students__parents=user.parent_profile).distinct()
        else:
            scoped = qs.none()

        branch_id = self.request.query_params.get("branch_id")
        if branch_id:
            scoped = scoped.filter(branch_id=branch_id)
        return scoped
