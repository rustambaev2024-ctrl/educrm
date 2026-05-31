from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import QuizSessionViewSet, QuizViewSet

router = DefaultRouter()
router.register("quizzes", QuizViewSet, basename="quiz")
router.register("quiz-sessions", QuizSessionViewSet, basename="quiz-session")

urlpatterns = [path("", include(router.urls))]
