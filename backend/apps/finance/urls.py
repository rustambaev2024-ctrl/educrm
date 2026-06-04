from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import PaymentViewSet, trigger_daily_charge, run_sync_balances

router = DefaultRouter()
router.register(r"", PaymentViewSet, basename="payment")

urlpatterns = [
    path("trigger-daily-charge/", trigger_daily_charge, name="trigger-daily-charge"),
    path("sync-balances/", run_sync_balances, name="sync-balances"),
] + router.urls
