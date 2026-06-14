import logging

from django.db import connection, transaction
from django_tenants.utils import get_public_schema_name, get_tenant_model, schema_context
from drf_spectacular.utils import OpenApiResponse, OpenApiTypes, extend_schema
from rest_framework import permissions, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView, TokenVerifyView

from .models import User
from .permissions import IsBranchAdmin
from .serializers import (
    ChangePasswordSerializer,
    LogoutSerializer,
    MeUpdateSerializer,
    ResetPasswordSerializer,
    UserSerializer,
    create_user_session,
    normalize_phone,
)

logger = logging.getLogger(__name__)


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        phone = normalize_phone(request.data.get("phone", "").strip())
        password = request.data.get("password", "")
        slug = (request.data.get("slug") or "").strip() or None

        if not phone or not password:
            return Response(
                {"detail": "Telefon raqam va parol kiritilishi shart"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ШАГ 1: Суперадмин в public схеме
        try:
            with schema_context(get_public_schema_name()):
                superadmin = User.objects.filter(phone=phone, role="superadmin").first()
                if superadmin and superadmin.check_password(password):
                    connection.set_schema_to_public()
                    request.tenant = None
                    refresh = RefreshToken.for_user(superadmin)
                    create_user_session(superadmin, str(refresh["jti"]), request)
                    return Response({
                        "access": str(refresh.access_token),
                        "refresh": str(refresh),
                        "user": {
                            "id": str(superadmin.id),
                            "phone": superadmin.phone,
                            "fullName": superadmin.full_name,
                            "role": superadmin.role,
                            "schemaName": get_public_schema_name(),
                        },
                        "schemaName": get_public_schema_name(),
                        "tenantSlug": None,
                    })
        except Exception as exc:
            logger.error("Superadmin login check failed: %s", exc)

        # ШАГ 2: Найти тенант
        tenant_model = get_tenant_model()
        tenant = None

        if slug:
            try:
                tenant = tenant_model.objects.get(slug=slug)
            except tenant_model.DoesNotExist:
                return Response(
                    {"detail": "Muassasa topilmadi / Учреждение не найдено"},
                    status=status.HTTP_404_NOT_FOUND,
                )
        else:
            # Header совместимость (старый фронтенд)
            schema_header = request.META.get("HTTP_X_TENANT_SCHEMA")
            slug_header = request.META.get("HTTP_X_TENANT_SLUG")
            if slug_header:
                tenant = tenant_model.objects.filter(slug=slug_header).first()
            elif schema_header and schema_header != get_public_schema_name():
                tenant = tenant_model.objects.filter(schema_name=schema_header).first()

            if not tenant:
                # Перебор тенантов по номеру телефона
                for t in tenant_model.objects.exclude(schema_name=get_public_schema_name()).iterator():
                    try:
                        with schema_context(t.schema_name):
                            if User.objects.filter(phone=phone).exists():
                                tenant = t
                                break
                    except Exception:
                        continue

        if not tenant:
            return Response(
                {"detail": "Telefon raqam yoki parol noto'g'ri / Неверный телефон или пароль"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # ШАГ 3: Аутентификация в тенанте
        try:
            with schema_context(tenant.schema_name):
                user = User.objects.filter(phone=phone).first()
                if not user or not user.check_password(password):
                    return Response(
                        {"detail": "Telefon raqam yoki parol noto'g'ri / Неверный телефон или пароль"},
                        status=status.HTTP_401_UNAUTHORIZED,
                    )
                if not user.is_active:
                    return Response(
                        {"detail": "Akkaunt bloklangan / Аккаунт заблокирован"},
                        status=status.HTTP_403_FORBIDDEN,
                    )
                if hasattr(user, "student_profile") and user.student_profile.status in ("expelled", "archived"):
                    return Response(
                        {
                            "detail": {
                                "uz": "Siz tizimdan chiqarilgansiz. Administrator bilan bog'laning.",
                                "ru": "Вы отчислены из системы. Обратитесь к администратору.",
                            }
                        },
                        status=status.HTTP_403_FORBIDDEN,
                    )

                connection.set_tenant(tenant)
                request.tenant = tenant
                refresh = RefreshToken.for_user(user)
                create_user_session(user, str(refresh["jti"]), request)

                return Response({
                    "access": str(refresh.access_token),
                    "refresh": str(refresh),
                    "user": {
                        "id": str(user.id),
                        "phone": user.phone,
                        "fullName": user.full_name,
                        "role": user.role,
                        "schemaName": tenant.schema_name,
                    },
                    "schemaName": tenant.schema_name,
                    "tenantSlug": tenant.slug,
                })
        except Exception as exc:
            logger.error("Tenant login failed (schema=%s): %s", tenant.schema_name, exc)
            return Response(
                {"detail": "Ichki xatolik / Внутренняя ошибка"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


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
