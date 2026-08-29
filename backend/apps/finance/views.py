import uuid
from datetime import date

from django.db.models import Q
from django.utils import timezone
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes as perm_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsAccountant, IsAccountantOrDirector, IsFinanceWriter

from .models import ExpenseCategory, Payment, PeriodClose
from .serializers import (
    ExpenseCategorySerializer,
    PaymentCreateSerializer,
    PaymentSerializer,
    PeriodCloseSerializer,
)
from .services import reverse_payment


def _month_is_closed(check_date):
    month_start = check_date.replace(day=1)
    return PeriodClose.objects.filter(month=month_start, reopened_at__isnull=True).exists()


class PaymentViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    queryset = Payment.objects.select_related("student", "branch", "group", "lesson", "staff").all()

    def get_permissions(self):
        if self.action == "create":
            permission_classes = [IsFinanceWriter]
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

    @action(detail=True, methods=["post"], permission_classes=[IsFinanceWriter])
    def reverse(self, request, pk=None):
        payment = self.get_object()
        check_date = payment.transaction_date or payment.created_at.date()
        if _month_is_closed(check_date):
            return Response(
                {
                    "detail": {
                        "uz": "Bu davr yopilgan, to'lovni bekor qilib bo'lmaydi",
                        "ru": "Этот период закрыт бухгалтером, платёж нельзя отменить",
                    }
                },
                status=status.HTTP_409_CONFLICT,
            )
        already_reversed = Payment.objects.filter(
            comment=f"Reversal of payment {payment.id}"
        ).exists()
        if already_reversed:
            return Response(
                {
                    "detail": {
                        "uz": "Bu to'lov allaqachon bekor qilingan",
                        "ru": "Этот платёж уже отменён",
                    }
                },
                status=status.HTTP_409_CONFLICT,
            )
        try:
            result = reverse_payment(payment, created_by=request.user)
            return Response(PaymentSerializer(result.payment).data)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()
        if user.role in ("superadmin", "director", "accountant"):
            scoped = qs
        elif user.role == "branch_admin" and hasattr(user, "staff_profile"):
            branch_id = user.staff_profile.branch_id
            scoped = qs.filter(Q(student__branch_id=branch_id) | Q(branch_id=branch_id)) if branch_id else qs.none()
        elif user.role == "student" and hasattr(user, "student_profile"):
            scoped = qs.filter(student=user.student_profile)
        elif user.role == "parent" and hasattr(user, "parent_profile"):
            scoped = qs.filter(student__parents=user.parent_profile)
        elif user.role == "support_teacher":
            raise PermissionDenied({
                "uz": "Siz moliyaviy ma'lumotlarga kirishga ruxsatingiz yo'q",
                "ru": "У вас нет доступа к финансовым данным",
            })
        else:
            return qs.none()

        student_id = self.request.query_params.get("student_id")
        if student_id:
            try:
                uuid.UUID(student_id)
            except ValueError:
                return qs.none()
            scoped = scoped.filter(student_id=student_id)
        return scoped


class PeriodCloseViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    queryset = PeriodClose.objects.select_related("closed_by", "reopened_by").all()
    serializer_class = PeriodCloseSerializer
    permission_classes = [IsFinanceWriter]

    @action(detail=False, methods=["post"], permission_classes=[IsAccountant])
    def close(self, request):
        from django.db import IntegrityError

        month_str = request.data.get("month")
        if not month_str:
            return Response({"detail": "month is required (YYYY-MM-01)"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            month = date.fromisoformat(month_str).replace(day=1)
        except ValueError:
            return Response(
                {"detail": {"uz": "Sana formati noto'g'ri", "ru": "Неверный формат даты"}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if PeriodClose.objects.filter(month=month, reopened_at__isnull=True).exists():
            return Response(
                {"detail": {"uz": "Bu davr allaqachon yopilgan", "ru": "Этот период уже закрыт"}},
                status=status.HTTP_409_CONFLICT,
            )
        try:
            period = PeriodClose.objects.create(month=month, closed_by=request.user)
        except IntegrityError:
            return Response(
                {"detail": {"uz": "Bu davr allaqachon yopilgan", "ru": "Этот период уже закрыт"}},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(PeriodCloseSerializer(period).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], permission_classes=[IsAccountant])
    def reopen(self, request, pk=None):
        period = self.get_object()
        if period.reopened_at is not None:
            return Response(
                {"detail": {"uz": "Bu davr allaqachon ochilgan", "ru": "Этот период уже открыт"}},
                status=status.HTTP_409_CONFLICT,
            )
        period.reopened_by = request.user
        period.reopened_at = timezone.now()
        period.save(update_fields=["reopened_by", "reopened_at"])
        return Response(PeriodCloseSerializer(period).data)


class ExpenseCategoryViewSet(viewsets.ModelViewSet):
    queryset = ExpenseCategory.objects.all()
    serializer_class = ExpenseCategorySerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsFinanceWriter()]
        return [IsAccountantOrDirector()]

    def get_queryset(self):
        qs = super().get_queryset()
        if self.action == "list" and self.request.query_params.get("include_inactive") != "1":
            qs = qs.filter(active=True)
        return qs

    def destroy(self, request, *args, **kwargs):
        # Никогда не удаляем физически — только выключаем. Историю Payment
        # с этой категорией нельзя оставить с оборванной ссылкой.
        instance = self.get_object()
        instance.active = False
        instance.save(update_fields=["active"])
        return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@perm_classes([IsAuthenticated])
def trigger_daily_charge(request):
    """Ручной запуск списания за сегодняшние занятия — только своей организации.

    Раньше здесь вызывалась сама задача daily_lesson_charge(), а она обходит
    ВСЕ схемы тенантов. То есть директор одного учебного центра запускал
    списание у всех остальных клиентов платформы разом, синхронно внутри
    HTTP-запроса. Теперь списываем строго в текущей схеме.
    """
    if request.user.role not in ("director", "branch_admin", "superadmin"):
        return Response({"detail": "Not allowed"}, status=status.HTTP_403_FORBIDDEN)

    from django.core.cache import cache
    from django.db import connection
    from django.utils import timezone

    from .tasks import charge_groups_for_day

    # localdate(), а не date.today(): контейнер живёт в UTC, платформа —
    # в Asia/Tashkent. Ночью эти даты расходятся, и кнопка списывала за вчера.
    today = timezone.localdate()
    schema = getattr(connection, "schema_name", "default")

    # Тот же замок, что у ночной задачи, но свой на организацию: два нажатия
    # подряд не должны идти параллельно. От повторного списания защищает
    # привязка к уроку внутри charge_groups_for_day, замок — от гонки.
    lock_key = f"daily_lesson_charge:{schema}:{today}"
    if not cache.add(lock_key, "running", timeout=600):
        return Response(
            {
                "status": "busy",
                "detail": {
                    "uz": "Hisobdan yechish allaqachon bajarilmoqda",
                    "ru": "Списание уже выполняется",
                },
            },
            status=status.HTTP_409_CONFLICT,
        )

    try:
        before = Payment.objects.filter(payment_type="charge", lesson__datetime__date=today).count()
        charge_groups_for_day(today, today.weekday())
        after = Payment.objects.filter(payment_type="charge", lesson__datetime__date=today).count()
        return Response({
            "status": "ok",
            "date": str(today),
            "charges_created": after - before,
            "charges_today": after,
        })
    except Exception as e:
        return Response({"status": "error", "detail": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    finally:
        cache.delete(lock_key)
