from django.db import transaction
from drf_spectacular.utils import OpenApiResponse, OpenApiTypes, extend_schema
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView, TokenVerifyView

from .permissions import IsBranchAdmin
from .serializers import (
    ChangePasswordSerializer,
    CustomTokenObtainPairSerializer,
    LogoutSerializer,
    MeUpdateSerializer,
    ResetPasswordSerializer,
    UserSerializer,
    create_user_session,
)


class LoginView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        refresh = RefreshToken(data["refresh"])
        create_user_session(serializer.user, str(refresh["jti"]), request)

        return Response(data, status=status.HTTP_200_OK)


class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(
        request=LogoutSerializer,
        responses={
            200: OpenApiResponse(response=OpenApiTypes.OBJECT, description="Logged out"),
            400: OpenApiResponse(response=OpenApiTypes.OBJECT, description="Invalid token"),
        },
    )
    def post(self, request):
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        refresh = serializer.validated_data["refresh"]

        try:
            token = RefreshToken(refresh)
            token.blacklist()
        except Exception:
            return Response({"detail": "Invalid refresh token"}, status=status.HTTP_400_BAD_REQUEST)

        request.user.sessions.filter(refresh_token_jti=str(token["jti"])).update(is_active=False)
        return Response({"detail": "Logged out"}, status=status.HTTP_200_OK)


class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses=UserSerializer)
    def get(self, request):
        return Response(UserSerializer(request.user).data)

    @extend_schema(request=MeUpdateSerializer, responses=UserSerializer)
    def patch(self, request):
        serializer = MeUpdateSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSerializer(request.user).data)


class ChangePasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(
        request=ChangePasswordSerializer,
        responses={200: OpenApiResponse(response=OpenApiTypes.OBJECT, description="Password changed")},
    )
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        return Response({"detail": "Password changed"}, status=status.HTTP_200_OK)


class ResetPasswordView(APIView):
    permission_classes = [IsBranchAdmin]

    @extend_schema(
        request=ResetPasswordSerializer,
        responses={200: OpenApiResponse(response=OpenApiTypes.OBJECT, description="Password reset")},
    )
    @transaction.atomic
    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.context["target_user"]
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])
        user.sessions.update(is_active=False)
        return Response({"detail": "Password reset"}, status=status.HTTP_200_OK)


AuthRefreshView = TokenRefreshView
AuthVerifyView = TokenVerifyView
