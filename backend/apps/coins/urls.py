from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    CoinSettingViewSet,
    CoinWalletViewSet,
    CoinTransactionViewSet,
    ProductViewSet,
    ProductCategoryViewSet,
    OrderViewSet,
    AchievementViewSet,
    LeaderboardViewSet,
)

router = DefaultRouter()
router.register("coins/settings",      CoinSettingViewSet,     basename="coin-setting")
router.register("coins/wallets",       CoinWalletViewSet,      basename="coin-wallet")
router.register("coins/transactions",  CoinTransactionViewSet, basename="coin-transaction")
router.register("coins/products",      ProductViewSet,         basename="coin-product")
router.register("coins/categories",    ProductCategoryViewSet, basename="coin-category")
router.register("coins/orders",        OrderViewSet,           basename="coin-order")
router.register("coins/achievements",  AchievementViewSet,     basename="coin-achievement")
router.register("coins/leaderboard",   LeaderboardViewSet,     basename="coin-leaderboard")

urlpatterns = [path("", include(router.urls))]
