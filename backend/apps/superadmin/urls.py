from rest_framework.routers import DefaultRouter

from .views import PlatformSettingsView, SuperadminInstitutionViewSet, SuperadminLogViewSet

router = DefaultRouter()
router.register(r"institutions", SuperadminInstitutionViewSet, basename="superadmin-institution")
router.register(r"logs", SuperadminLogViewSet, basename="superadmin-log")
router.register(r"settings", PlatformSettingsView, basename="superadmin-settings")

urlpatterns = router.urls

