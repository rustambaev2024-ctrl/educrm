from rest_framework.routers import DefaultRouter

from .views import CourseViewSet, GroupViewSet

router = DefaultRouter()
router.register(r"courses", CourseViewSet, basename="course")
router.register(r"groups", GroupViewSet, basename="group")

urlpatterns = router.urls
