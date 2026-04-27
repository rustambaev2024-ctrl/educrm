from django.urls import path

from .views import (
    AuthRefreshView,
    AuthVerifyView,
    ChangePasswordView,
    LoginView,
    LogoutView,
    MeView,
    ResetPasswordView,
)

urlpatterns = [
    path("login/", LoginView.as_view(), name="auth-login"),
    path("token/", LoginView.as_view(), name="auth-token"),
    path("refresh/", AuthRefreshView.as_view(), name="auth-refresh"),
    path("token/refresh/", AuthRefreshView.as_view(), name="auth-token-refresh"),
    path("verify/", AuthVerifyView.as_view(), name="auth-verify"),
    path("token/verify/", AuthVerifyView.as_view(), name="auth-token-verify"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
    path("me/", MeView.as_view(), name="auth-me"),
    path("change-password/", ChangePasswordView.as_view(), name="auth-change-password"),
    path("reset-password/", ResetPasswordView.as_view(), name="auth-reset-password"),
]
