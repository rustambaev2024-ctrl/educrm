from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import ExpenseCategoryViewSet, PaymentViewSet, PeriodCloseViewSet, trigger_daily_charge

router = DefaultRouter()
router.register(r"", PaymentViewSet, basename="payment")
router.register("expense-categories", ExpenseCategoryViewSet, basename="expense-category")
router.register("period-closes", PeriodCloseViewSet, basename="period-close")

urlpatterns = [
    path("trigger-daily-charge/", trigger_daily_charge, name="trigger-daily-charge"),
] + router.urls
