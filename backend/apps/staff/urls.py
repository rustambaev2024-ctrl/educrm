from rest_framework.routers import DefaultRouter

from .views import StaffViewSet, StaffPenaltyViewSet, StaffBonusViewSet

router = DefaultRouter()
router.register(r"penalties", StaffPenaltyViewSet, basename="staff-penalty")
router.register(r"bonuses", StaffBonusViewSet, basename="staff-bonus")
router.register(r"", StaffViewSet, basename="staff")

urlpatterns = router.urls
