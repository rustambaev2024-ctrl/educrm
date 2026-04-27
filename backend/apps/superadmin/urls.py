from rest_framework.routers import DefaultRouter

from .views import SuperadminInstitutionViewSet, SuperadminLogViewSet

router = DefaultRouter()
router.register(r"institutions", SuperadminInstitutionViewSet, basename="superadmin-institution")
router.register(r"logs", SuperadminLogViewSet, basename="superadmin-log")

urlpatterns = router.urls

