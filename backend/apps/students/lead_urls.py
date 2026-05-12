from rest_framework.routers import DefaultRouter

from .views import StudentLeadViewSet

router = DefaultRouter()
router.register(r"", StudentLeadViewSet, basename="student-lead")

urlpatterns = router.urls
