from django.db import transaction
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied

from apps.accounts.models import User
from apps.core.passwords import generate_temp_password, validate_password_strength

from .models import Staff, StaffPenalty, StaffBonus, SupportTeacherLink

# R-18: кто чей пароль вправе сбросить через PATCH /staff/<id>/.
# Таблицей, а не цепочкой сравнений: правило видно целиком и ревьюится за раз.
# Совпадает по смыслу с гардом /auth/reset-password/.
PASSWORD_RESET_MATRIX = {
    "superadmin": frozenset({"director", "branch_admin", "teacher", "support_teacher"}),
    "director": frozenset({"branch_admin", "teacher", "support_teacher"}),
    "branch_admin": frozenset({"teacher", "support_teacher"}),
}
#: Роли, не ограниченные филиалом. Все остальные обязаны совпасть по филиалу
#: (default-deny: новая роль по умолчанию окажется ограниченной, а не открытой).
BRANCH_UNSCOPED_ACTORS = frozenset({"superadmin", "director"})


def normalize_phone(value: str) -> str:
    """Keep phone uniqueness stable for inputs with spaces/dashes."""
    if not value:
        return value
    value = str(value).strip()
    if value.startswith("+"):
        return "+" + "".join(ch for ch in value[1:] if ch.isdigit())
    return "".join(ch for ch in value if ch.isdigit())


class StaffSerializer(serializers.ModelSerializer):
    user_id = serializers.UUIDField(read_only=True, source="user.id")
    full_name = serializers.CharField(source="user.full_name")
    phone = serializers.CharField(source="user.phone")
    role = serializers.ChoiceField(
        source="user.role",
        choices=["director", "branch_admin", "teacher", "support_teacher"],
    )
    password = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = Staff
        fields = (
            "id",
            "user_id",
            "full_name",
            "phone",
            "role",
            "password",
            "branch",
            "passport_number",
            "hire_date",
            "status",
            "salary_percent",
            "fixed_salary",
        )
        read_only_fields = ("id", "user_id")

    def validate_phone(self, value):
        value = normalize_phone(value)
        if self.instance is None:
            from django.db import connection
            from django_tenants.utils import get_tenant_model, schema_context, get_public_schema_name
            from apps.accounts.models import User

            current_schema = connection.schema_name
            Institution = get_tenant_model()
            conflicts = []
            for tenant in Institution.objects.exclude(schema_name__in=["public", current_schema]):
                with schema_context(tenant.schema_name):
                    if User.objects.filter(phone=value).exists():
                        conflicts.append(tenant.name)
            if conflicts:
                raise serializers.ValidationError(
                    f"Phone {value} already registered in: {', '.join(conflicts)}"
                )
        return value

    def validate(self, attrs):
        # R-23: политика включена, см. apps/core/passwords.py.
        # Проверка на уровне объекта, чтобы ошибка была в формате {detail:{uz,ru}}.
        password = attrs.get("password")
        if password:
            validate_password_strength(password)
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        user_data = validated_data.pop("user")
        # R-23: никакого общего литерала. Пароль либо задан явно, либо
        # генерируется криптостойко и один раз возвращается создателю.
        password = validated_data.pop("password", None)
        generated_password = None
        if not password:
            password = generate_temp_password()
            generated_password = password
        phone = normalize_phone(user_data["phone"])

        existing_user = User.objects.filter(phone=phone).first()
        if existing_user:
            if hasattr(existing_user, "staff_profile"):
                raise serializers.ValidationError(
                    {"phone": "Пользователь с этим телефоном уже является сотрудником."}
                )

            existing_user.full_name = user_data["full_name"]
            existing_user.role = user_data["role"]
            existing_user.set_password(password)
            existing_user.must_change_password = True
            existing_user.save(
                update_fields=["full_name", "role", "password", "must_change_password"]
            )
            staff = Staff.objects.create(user=existing_user, **validated_data)
        else:
            user = User.objects.create_user(
                phone=phone,
                full_name=user_data["full_name"],
                role=user_data["role"],
                password=password,
            )
            user.must_change_password = True
            user.save(update_fields=["must_change_password"])
            staff = Staff.objects.create(user=user, **validated_data)

        self._creation_extra = {}
        if generated_password:
            self._creation_extra["generated_password"] = generated_password
        return staff

    def to_representation(self, instance):
        data = super().to_representation(instance)
        extra = getattr(self, "_creation_extra", None)
        if extra:
            data.update(extra)
        return data

    def _assert_can_set_password(self, instance):
        """R-18: смена чужого пароля через PATCH /staff/<id>/ — привилегированная операция.

        Раньше поле `password` не было защищено ничем, и `branch_admin` менял пароль
        директора, после чего заходил его аккаунтом: все филиалы, все деньги, все отчёты.
        Правила совпадают с `/auth/reset-password/` — единое место истины по смыслу.

        Легитимные пути остаются открытыми: свой пароль (или `/auth/change-password/`),
        директор — сотрудникам, админ филиала — учителям своего филиала.
        """
        actor = self.context["request"].user
        target_user = instance.user

        # Свой пароль можно менять всегда (штатно — через /auth/change-password/).
        if actor.id == target_user.id:
            return

        allowed_targets = PASSWORD_RESET_MATRIX.get(actor.role, frozenset())
        if target_user.role not in allowed_targets:
            raise PermissionDenied({
                "detail": {
                    "uz": "Bu xodim parolini o'zgartirishga ruxsatingiz yo'q",
                    "ru": "У вас нет прав менять пароль этого сотрудника",
                }
            })

        # Все, кроме superadmin/director, ограничены ещё и своим филиалом.
        if actor.role not in BRANCH_UNSCOPED_ACTORS:
            actor_branch = getattr(getattr(actor, "staff_profile", None), "branch_id", None)
            if not actor_branch or instance.branch_id != actor_branch:
                raise PermissionDenied({
                    "detail": {
                        "uz": "Xodim sizning filialingizdan emas",
                        "ru": "Сотрудник не из вашего филиала",
                    }
                })

    @transaction.atomic
    def update(self, instance, validated_data):
        user_data = validated_data.pop("user", None)
        password = validated_data.pop("password", None)

        if password:
            self._assert_can_set_password(instance)

        new_role = (user_data or {}).get("role")
        if new_role and new_role != instance.user.role:
            actor = self.context["request"].user
            if actor.role not in ("superadmin", "director"):
                raise serializers.ValidationError({
                    "detail": {
                        "uz": "Faqat direktor xodim rolini o'zgartira oladi",
                        "ru": "Только директор может изменить роль сотрудника",
                    }
                })
            if new_role in ("superadmin", "director") and actor.role != "superadmin":
                raise serializers.ValidationError({
                    "detail": {
                        "uz": "Bu rolni faqat superadmin belgilay oladi",
                        "ru": "Эту роль может назначить только суперадмин",
                    }
                })

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        actor = self.context["request"].user
        if user_data:
            user = instance.user
            for attr, value in user_data.items():
                setattr(user, attr, value)
            if password:
                user.set_password(password)
                # R-23: пароль выдан другим человеком — владелец обязан его сменить.
                user.must_change_password = actor.id != user.id
            user.save()
        elif password:
            user = instance.user
            user.set_password(password)
            user.must_change_password = actor.id != user.id
            user.save(update_fields=["password", "must_change_password"])

        return instance


class StaffPenaltySerializer(serializers.ModelSerializer):
    staff_name = serializers.CharField(source="staff.user.full_name", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True)

    class Meta:
        model = StaffPenalty
        fields = (
            "id",
            "staff",
            "staff_name",
            "branch",
            "branch_name",
            "amount",
            "reason",
            "penalty_date",
            "status",
            "comment",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "staff_name",
            "branch_name",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        )

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than zero.")
        return value

    def validate(self, attrs):
        staff = attrs.get("staff") or getattr(self.instance, "staff", None)
        branch = attrs.get("branch") or getattr(self.instance, "branch", None)
        if staff and branch and staff.branch_id and staff.branch_id != branch.id:
            raise serializers.ValidationError({"branch": "Penalty branch must match staff branch."})
        return attrs


class StaffBonusSerializer(serializers.ModelSerializer):
    staff_name = serializers.CharField(source="staff.user.full_name", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True)

    class Meta:
        model = StaffBonus
        fields = (
            "id",
            "staff",
            "staff_name",
            "branch",
            "branch_name",
            "amount",
            "reason",
            "bonus_date",
            "comment",
            "created_by",
            "created_by_name",
            "created_at",
        )
        read_only_fields = (
            "id",
            "staff_name",
            "branch_name",
            "created_by",
            "created_by_name",
            "created_at",
        )

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than zero.")
        return value

    def validate(self, attrs):
        staff = attrs.get("staff") or getattr(self.instance, "staff", None)
        branch = attrs.get("branch") or getattr(self.instance, "branch", None)
        if staff and branch and staff.branch_id and staff.branch_id != branch.id:
            raise serializers.ValidationError({"branch": "Bonus branch must match staff branch."})
        return attrs


class SupportTeacherLinkSerializer(serializers.ModelSerializer):
    support_teacher_name = serializers.CharField(
        source="support_teacher.full_name", read_only=True
    )
    teacher_name = serializers.CharField(
        source="teacher.user.full_name", read_only=True
    )
    groups = serializers.SerializerMethodField()

    def get_groups(self, obj):
        from apps.courses.models import Group
        return list(
            Group.objects.filter(teacher=obj.teacher)
            .values("id", "name")
        )

    class Meta:
        model = SupportTeacherLink
        fields = [
            "id", "support_teacher", "support_teacher_name",
            "teacher", "teacher_name", "groups", "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def validate_support_teacher(self, value):
        if value.role != "support_teacher":
            raise serializers.ValidationError(
                "Выбранный пользователь не является помощником учителя."
            )
        return value

    def validate(self, attrs):
        request = self.context.get("request")
        support_teacher = attrs.get("support_teacher") or getattr(self.instance, "support_teacher", None)
        teacher = attrs.get("teacher") or getattr(self.instance, "teacher", None)
        user = getattr(request, "user", None)

        # Проверка совпадения филиалов support_teacher и teacher
        if support_teacher and teacher:
            st_branch_id = getattr(
                getattr(support_teacher, "staff_profile", None), "branch_id", None
            )
            if st_branch_id and teacher.branch_id and st_branch_id != teacher.branch_id:
                raise serializers.ValidationError({
                    "detail": {
                        "uz": "Yordamchi o'qituvchi va o'qituvchi bir filialdan bo'lishi kerak",
                        "ru": "Помощник и учитель должны быть из одного филиала",
                    }
                })

        # admin/branch_admin может привязывать только учителей своего филиала.
        if user and user.role == "branch_admin":
            admin_branch_id = getattr(
                getattr(user, "staff_profile", None), "branch_id", None
            )
            if not admin_branch_id:
                raise serializers.ValidationError(
                    {"teacher": "У администратора не задан филиал."}
                )
            if teacher and teacher.branch_id != admin_branch_id:
                raise serializers.ValidationError(
                    {"teacher": "Учитель относится к другому филиалу."}
                )
        return attrs
