from rest_framework import serializers

from .models import (
    CoinWallet,
    CoinTransaction,
    CoinSetting,
    Achievement,
    UserAchievement,
    Product,
    ProductCategory,
    Order,
)


class CoinWalletSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(
        source="student.user.full_name", read_only=True
    )
    student_id = serializers.UUIDField(source="student.id", read_only=True)

    class Meta:
        model = CoinWallet
        fields = ["id", "balance", "xp", "level", "streak",
                  "last_activity_date", "student_name", "student_id"]


class CoinTransactionSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(
        source="wallet.student.user.full_name", read_only=True
    )

    class Meta:
        model = CoinTransaction
        fields = ["id", "transaction_type", "reason", "amount",
                  "comment", "balance_after", "created_at", "created_by",
                  "student_name"]


class CoinSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = CoinSetting
        fields = "__all__"


class ProductCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductCategory
        fields = "__all__"


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.SerializerMethodField()

    def get_category_name(self, obj):
        if obj.category:
            return {"uz": obj.category.name_uz, "ru": obj.category.name_ru}
        return None

    class Meta:
        model = Product
        fields = "__all__"


class OrderSerializer(serializers.ModelSerializer):
    product_name = serializers.SerializerMethodField()
    student_name = serializers.CharField(
        source="wallet.student.user.full_name", read_only=True
    )

    def get_product_name(self, obj):
        return {"uz": obj.product.name_uz, "ru": obj.product.name_ru}

    class Meta:
        model = Order
        fields = ["id", "product", "product_name", "student_name",
                  "status", "quantity", "coins_spent", "comment",
                  "created_at", "updated_at"]


class AchievementSerializer(serializers.ModelSerializer):
    unlocked = serializers.SerializerMethodField()

    def get_unlocked(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        return UserAchievement.objects.filter(
            wallet__student__user=request.user,
            achievement=obj,
        ).exists()

    class Meta:
        model = Achievement
        fields = "__all__"
