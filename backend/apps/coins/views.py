from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from apps.accounts.permissions import IsDirector

from .models import (
    CoinWallet,
    CoinTransaction,
    CoinSetting,
    Achievement,
    Product,
    ProductCategory,
    Order,
)
from .serializers import (
    CoinWalletSerializer,
    CoinTransactionSerializer,
    CoinSettingSerializer,
    AchievementSerializer,
    ProductSerializer,
    ProductCategorySerializer,
    OrderSerializer,
)


def _get_next_level_xp(xp, current_level, thresholds):
    for t in sorted(thresholds, key=lambda x: x["xp"]):
        if t["level"] > current_level:
            return t["xp"]
    return None


class CoinSettingViewSet(viewsets.ModelViewSet):
    """Настройки геймификации — только директор"""
    serializer_class = CoinSettingSerializer
    permission_classes = [IsAuthenticated, IsDirector]

    def get_queryset(self):
        return CoinSetting.objects.all()

    def get_object(self):
        return CoinSetting.get_or_create_default()

    @action(detail=False, methods=["get", "patch"], url_path="me")
    def me(self, request):
        setting = CoinSetting.get_or_create_default()
        if request.method == "GET":
            return Response(CoinSettingSerializer(setting).data)
        serializer = CoinSettingSerializer(setting, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class CoinWalletViewSet(viewsets.ReadOnlyModelViewSet):
    """Кошельки студентов"""
    serializer_class = CoinWalletSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role in ("director", "admin", "branch_admin", "superadmin"):
            return CoinWallet.objects.select_related("student__user").order_by("-balance")
        if user.role == "student":
            return CoinWallet.objects.filter(student__user=user)
        return CoinWallet.objects.none()

    @action(detail=False, methods=["get"], url_path="my")
    def my_wallet(self, request):
        """Мой кошелёк (для студента)"""
        try:
            wallet = CoinWallet.objects.get(student__user=request.user)
        except CoinWallet.DoesNotExist:
            return Response({"balance": 0, "xp": 0, "level": 1, "streak": 0,
                             "level_thresholds": [], "next_level_xp": None})
        setting = CoinSetting.get_or_create_default()
        data = CoinWalletSerializer(wallet).data
        data["level_thresholds"] = setting.level_thresholds
        data["next_level_xp"] = _get_next_level_xp(
            wallet.xp, wallet.level, setting.level_thresholds
        )
        return Response(data)

    @action(detail=False, methods=["post"], url_path="award")
    def award(self, request):
        """Ручное начисление монет (admin/teacher)"""
        if request.user.role not in (
            "director", "admin", "branch_admin", "teacher", "support_teacher"
        ):
            return Response(status=403)
        from apps.students.models import Student
        from .services import award_coins

        student_id = request.data.get("student_id")
        amount = int(request.data.get("amount", 0))
        comment = request.data.get("comment", "")
        if not student_id or amount <= 0:
            return Response({"error": "Invalid data"}, status=400)
        try:
            student = Student.objects.get(id=student_id)
            tx = award_coins(student, amount, "manual", comment, request.user)
            return Response({"success": True, "transaction_id": str(tx.id)})
        except Student.DoesNotExist:
            return Response({"error": "Student not found"}, status=404)

    @action(detail=False, methods=["post"], url_path="deduct")
    def deduct(self, request):
        """Ручное списание монет"""
        if request.user.role not in ("director", "admin", "branch_admin"):
            return Response(status=403)
        from apps.students.models import Student
        from .services import deduct_coins

        student_id = request.data.get("student_id")
        amount = int(request.data.get("amount", 0))
        comment = request.data.get("comment", "")
        if not student_id or amount <= 0:
            return Response({"error": "Invalid data"}, status=400)
        try:
            student = Student.objects.get(id=student_id)
            tx = deduct_coins(student, amount, "penalty", comment, request.user)
            return Response({"success": True, "transaction_id": str(tx.id)})
        except Student.DoesNotExist:
            return Response({"error": "Student not found"}, status=404)


class CoinTransactionViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = CoinTransactionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == "student":
            return CoinTransaction.objects.filter(wallet__student__user=user)
        if user.role in ("director", "admin", "branch_admin", "superadmin"):
            student_id = self.request.query_params.get("student_id")
            qs = CoinTransaction.objects.select_related("wallet__student__user")
            if student_id:
                qs = qs.filter(wallet__student_id=student_id)
            return qs
        return CoinTransaction.objects.none()


class ProductViewSet(viewsets.ModelViewSet):
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if self.request.user.role in ("director", "admin", "branch_admin"):
            return Product.objects.select_related("category").all()
        return Product.objects.filter(is_active=True).select_related("category")

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), IsDirector()]
        return [IsAuthenticated()]

    @action(detail=True, methods=["post"], url_path="buy")
    def buy(self, request, pk=None):
        """Купить товар"""
        if request.user.role != "student":
            return Response({"error": "Students only"}, status=403)
        from apps.students.models import Student
        from .services import purchase_product

        try:
            product = self.get_object()
            student = Student.objects.get(user=request.user)
            order = purchase_product(student, product)
            return Response(OrderSerializer(order).data, status=201)
        except Student.DoesNotExist:
            return Response({"error": "Student not found"}, status=404)
        except ValueError as e:
            return Response({"error": str(e)}, status=400)


class ProductCategoryViewSet(viewsets.ModelViewSet):
    serializer_class = ProductCategorySerializer
    permission_classes = [IsAuthenticated, IsDirector]
    queryset = ProductCategory.objects.all()


class OrderViewSet(viewsets.ModelViewSet):
    serializer_class = OrderSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "patch", "head", "options"]

    def get_queryset(self):
        user = self.request.user
        if user.role == "student":
            return Order.objects.filter(
                wallet__student__user=user
            ).select_related("product")
        if user.role in ("director", "admin", "branch_admin", "superadmin"):
            return Order.objects.select_related(
                "product", "wallet__student__user"
            ).order_by("-created_at")
        return Order.objects.none()

    @action(detail=True, methods=["patch"], url_path="status")
    def update_status(self, request, pk=None):
        """Изменить статус заказа (admin/director)"""
        if request.user.role not in ("director", "admin", "branch_admin"):
            return Response(status=403)
        order = self.get_object()
        new_status = request.data.get("status")
        if new_status not in ("confirmed", "delivered", "cancelled"):
            return Response({"error": "Invalid status"}, status=400)
        # Возврат монет при отмене ещё необработанного заказа
        if new_status == "cancelled" and order.status in ("new", "confirmed"):
            from .services import award_coins
            award_coins(
                order.wallet.student,
                order.coins_spent,
                "adjustment",
                f"Refund for cancelled order #{order.id}",
                request.user,
            )
        order.status = new_status
        order.processed_by = request.user
        order.save()
        return Response(OrderSerializer(order).data)


class AchievementViewSet(viewsets.ModelViewSet):
    serializer_class = AchievementSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if self.request.user.role in ("director", "admin", "branch_admin"):
            return Achievement.objects.all()
        return Achievement.objects.filter(is_active=True)

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), IsDirector()]
        return [IsAuthenticated()]


class LeaderboardViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def list(self, request):
        wallets = CoinWallet.objects.select_related(
            "student__user"
        ).order_by("-xp")[:20]
        data = [
            {
                "rank": i + 1,
                "student_name": w.student.user.full_name,
                "xp": w.xp,
                "level": w.level,
                "balance": w.balance,
            }
            for i, w in enumerate(wallets)
        ]
        return Response(data)
