from rest_framework.routers import DefaultRouter

from .views import StaffPenaltyViewSet

router = DefaultRouter()
router.register(r"", StaffPenaltyViewSet, basename="staff-penalty")

urlpatterns = router.urls
