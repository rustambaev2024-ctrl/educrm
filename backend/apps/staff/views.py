from rest_framework import viewsets

from apps.accounts.permissions import IsBranchAdmin, IsDirector

from .models import Staff
from .serializers import StaffSerializer


class StaffViewSet(viewsets.ModelViewSet):
    queryset = Staff.objects.select_related("user", "branch").all().order_by("user__full_name")
    serializer_class = StaffSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve", "update", "partial_update"):
            permission_classes = [IsBranchAdmin]
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

        if user.role in ("admin", "branch_admin") and hasattr(user, "staff_profile"):
            branch_id = user.staff_profile.branch_id
            if branch_id:
                return qs.filter(branch_id=branch_id)

        return qs.none()
