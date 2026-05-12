from django.db.models import Q
from rest_framework import viewsets

from apps.accounts.permissions import IsBranchAdmin, IsDirector

from .models import Staff, StaffPenalty
from .serializers import StaffPenaltySerializer, StaffSerializer


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


class StaffPenaltyViewSet(viewsets.ModelViewSet):
    queryset = StaffPenalty.objects.select_related("staff__user", "branch", "created_by").all()
    serializer_class = StaffPenaltySerializer
    permission_classes = [IsDirector]

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()
        if not user.is_authenticated:
            return qs.none()

        if user.role not in ("superadmin", "director"):
            return qs.none()

        params = self.request.query_params
        if params.get("staff_id"):
            qs = qs.filter(staff_id=params["staff_id"])
        if params.get("branch_id"):
            qs = qs.filter(branch_id=params["branch_id"])
        if params.get("status"):
            qs = qs.filter(status=params["status"])
        if params.get("date_from"):
            qs = qs.filter(penalty_date__gte=params["date_from"])
        if params.get("date_to"):
            qs = qs.filter(penalty_date__lte=params["date_to"])
        if params.get("search"):
            value = params["search"].strip()
            qs = qs.filter(
                Q(reason__icontains=value)
                | Q(comment__icontains=value)
                | Q(staff__user__full_name__icontains=value)
                | Q(staff__user__phone__icontains=value)
            )
        return qs.distinct().order_by("-penalty_date", "-created_at")

    def perform_create(self, serializer):
        staff = serializer.validated_data["staff"]
        branch = serializer.validated_data.get("branch") or staff.branch
        serializer.save(created_by=self.request.user, branch=branch)
