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

        tenant = self._resolve_tenant_by_phone(phone, request)
        if tenant is None:
            # Суперадмин — логинимся в public схеме
            connection.set_schema_to_public()
            request.tenant = None
        else:
            connection.set_tenant(tenant)
            request.tenant = tenant

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        refresh = RefreshToken(data["refresh"])
        create_user_session(serializer.user, str(refresh["jti"]), request)

        user = serializer.user
        if hasattr(user, "student_profile"):
            student_status = user.student_profile.status
            if student_status in ("expelled", "archived"):
                return Response(
                    {
                        "detail": {
                            "uz": "Siz tizimdan chiqarilgansiz. Administrator bilan bog'laning.",
                            "ru": "Вы отчислены из системы. Обратитесь к администратору.",
                        }
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

        return Response(data, status=status.HTTP_200_OK)

    def _resolve_tenant_by_phone(self, phone, request):
        phone = normalize_phone(phone)
        tenant_model = get_tenant_model()
        from rest_framework.exceptions import ValidationError

        # 0. Суперадмин живёт в public схеме — проверяем первым
        with schema_context(get_public_schema_name()):
            if User.objects.filter(phone=phone, role="superadmin").exists():
                from apps.tenants.models import Institution
                try:
                    public_tenant = tenant_model.objects.get(schema_name=get_public_schema_name())
                except tenant_model.DoesNotExist:
                    public_tenant = None
                return public_tenant  # может быть None — LoginView обработает

        # 1. Slug в теле запроса (новый механизм — точный, O(1))
        slug = request.data.get("slug") if hasattr(request, "data") else None
        if slug:
            try:
                tenant = tenant_model.objects.get(slug=slug)
            except tenant_model.DoesNotExist:
                raise ValidationError({"detail": "Institution not found"})
            with schema_context(tenant.schema_name):
                if not User.objects.filter(phone=phone).exists():
                    raise ValidationError({"detail": "Invalid credentials"})
            return tenant

        # 2. X-Tenant-Schema header (старый механизм — совместимость)
        schema_header = request.META.get("HTTP_X_TENANT_SCHEMA")
        if schema_header and schema_header != get_public_schema_name():
            try:
                requested_tenant = tenant_model.objects.get(schema_name=schema_header)
            except tenant_model.DoesNotExist:
                raise ValidationError({"detail": "Institution not found"})
            with schema_context(requested_tenant.schema_name):
                if not User.objects.filter(phone=phone).exists():
                    raise ValidationError({"detail": "Invalid credentials"})
            return requested_tenant

        # 3. Fallback: перебор всех тенантов (для обратной совместимости)
        tenants = tenant_model.objects.exclude(schema_name=get_public_schema_name())
        for tenant in tenants.iterator():
            with schema_context(tenant.schema_name):
                if User.objects.filter(phone=phone).exists():
                    return tenant
        raise ValidationError({"detail": "Invalid credentials"})


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
