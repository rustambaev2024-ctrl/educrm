from django.db.models import Q
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes as perm_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsBranchAdmin

from .models import Payment
from .serializers import PaymentCreateSerializer, PaymentSerializer
from .services import reverse_payment


class PaymentViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    queryset = Payment.objects.select_related("student", "branch", "group", "lesson", "staff").all()

    def get_permissions(self):
        if self.action == "create":
            permission_classes = [IsBranchAdmin]
        else:
            permission_classes = [permissions.IsAuthenticated]
        return [permission() for permission in permission_classes]

    def get_serializer_class(self):
        if self.action == "create":
            return PaymentCreateSerializer
        return PaymentSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        payment = serializer.save()
        output = PaymentSerializer(payment)
        return Response(output.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], permission_classes=[IsBranchAdmin])
    def reverse(self, request, pk=None):
        payment = self.get_object()
        try:
            result = reverse_payment(payment, created_by=request.user)
            return Response(PaymentSerializer(result.payment).data)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()
        if user.role in ("superadmin", "director"):
            scoped = qs
        elif user.role in ("admin", "branch_admin") and hasattr(user, "staff_profile"):
            branch_id = user.staff_profile.branch_id
            scoped = qs.filter(Q(student__branch_id=branch_id) | Q(branch_id=branch_id)) if branch_id else qs.none()
        elif user.role == "student" and hasattr(user, "student_profile"):
            scoped = qs.filter(student=user.student_profile)
        elif user.role == "parent" and hasattr(user, "parent_profile"):
            scoped = qs.filter(student__parents=user.parent_profile)
        else:
            return qs.none()

        student_id = self.request.query_params.get("student_id")
        if student_id:
            scoped = scoped.filter(student_id=student_id)
        return scoped


@api_view(["POST"])
@perm_classes([IsAuthenticated])
def trigger_daily_charge(request):
    """Manual trigger for daily_lesson_charge task (director/admin only)."""
    if request.user.role not in ("director", "admin", "branch_admin", "superadmin"):
        return Response({"detail": "Not allowed"}, status=status.HTTP_403_FORBIDDEN)

    from .tasks import daily_lesson_charge
    try:
        daily_lesson_charge()
        charge_count = Payment.objects.filter(payment_type="charge").count()
        return Response({
            "status": "ok",
            "message": "daily_lesson_charge executed successfully",
            "total_charges": charge_count,
        })
    except Exception as e:
        return Response({"status": "error", "detail": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
