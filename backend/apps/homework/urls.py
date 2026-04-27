from rest_framework.routers import DefaultRouter

from .views import HomeworkStatusViewSet, HomeworkViewSet

router = DefaultRouter()
router.register(r"submissions", HomeworkStatusViewSet, basename="homework-submission")
router.register(r"", HomeworkViewSet, basename="homework")

urlpatterns = router.urls
