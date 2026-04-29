from django.db import connection, transaction
from django_tenants.utils import get_public_schema_name, get_tenant_model, schema_context
from drf_spectacular.utils import OpenApiResponse, OpenApiTypes, extend_schema
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView, TokenVerifyView

from .models import User
from .permissions import IsBranchAdmin
from .serializers import (
    ChangePasswordSerializer,
    CustomTokenObtainPairSerializer,
    LogoutSerializer,
    MeUpdateSerializer,
    ResetPasswordSerializer,
    UserSerializer,
    create_user_session,
    normalize_phone,
)


class LoginView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        data = request.data.copy()
        if data.get("phone"):
            data["phone"] = normalize_phone(data["phone"])

        phone = data.get("phone")
        if not phone:
            return Response({"phone": ["This field is required."]}, status=status.HTTP_400_BAD_REQUEST)

        # Login is tenant-discovery entry point. A stale localStorage tenant or
        # localhost domain fallback must not force authentication in the wrong schema.
        tenant = self._resolve_tenant_by_phone(phone)
        if tenant is None:
            return Response({"detail": "Invalid phone or password"}, status=status.HTTP_401_UNAUTHORIZED)
        connection.set_tenant(tenant)
        request.tenant = tenant

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        refresh = RefreshToken(data["refresh"])
        create_user_session(serializer.user, str(refresh["jti"]), request)

        return Response(data, status=status.HTTP_200_OK)

    def _resolve_tenant_by_phone(self, phone):
        phone = normalize_phone(phone)
        tenant_model = get_tenant_model()
        tenants = tenant_model.objects.exclude(schema_name=get_public_schema_name())

        for tenant in tenants.iterator():
            with schema_context(tenant.schema_name):
                if User.objects.filter(phone=phone).exists():
                    return tenant
        return None


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
