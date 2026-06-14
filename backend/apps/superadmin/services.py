from django.contrib.auth import get_user_model
from django.db import transaction
from django_tenants.utils import schema_context

from apps.tenants.models import Institution
from apps.staff.models import Staff

from .models import InstitutionActionLog, InstitutionNotice


def normalize_phone(value: str) -> str:
    value = (value or "").strip()
    has_plus = value.startswith("+")
    digits = "".join(ch for ch in value if ch.isdigit())
    if has_plus or digits.startswith("998"):
        return f"+{digits}"
    return digits


def actor_payload(user) -> dict:
    return {
        "actor_id": str(getattr(user, "id", "")) if getattr(user, "id", None) else "",
        "actor_phone": getattr(user, "phone", "") or "",
    }


def write_institution_log(
    institution: Institution,
    action: str,
    *,
    user=None,
    message: str = "",
    metadata: dict | None = None,
) -> InstitutionActionLog:
    actor = actor_payload(user)
    return InstitutionActionLog.objects.create(
        institution=institution,
        action=action,
        message=message,
        actor_id=actor["actor_id"],
        actor_phone=actor["actor_phone"],
        metadata=metadata or {},
    )


def create_director_in_tenant(
    institution: Institution,
    *,
    phone: str,
    full_name: str,
    password: str,
):
    phone = normalize_phone(phone)
    if not phone or not full_name or not password:
        return None

    User = get_user_model()
    with schema_context(institution.schema_name):
        user, created = User.objects.get_or_create(
            phone=phone,
            defaults={
                "full_name": full_name,
                "role": "director",
                "is_active": True,
                "is_staff": True,
            },
        )
        user.full_name = full_name
        user.role = "director"
        user.is_active = True
        user.is_staff = True
        user.set_password(password)
        user.save(update_fields=["full_name", "role", "is_active", "is_staff", "password"])
        Staff.objects.get_or_create(user=user)
        return user


@transaction.atomic
def create_institution_with_bootstrap(serializer, user):
    director_phone = serializer.validated_data.get("director_phone", "")
    director_full_name = serializer.validated_data.get("director_full_name", "")
    director_password = serializer.validated_data.get("director_password", "")

    institution = serializer.save()

    # Если Domain не создан через serializer — создаём по умолчанию из slug
    if institution.slug and not institution.domains.exists():
        from apps.tenants.models import Domain
        Domain.objects.get_or_create(
            tenant=institution,
            defaults={"domain": f"{institution.slug}.educrm.uz", "is_primary": True},
        )
    director_created = False
    try:
        director = create_director_in_tenant(
            institution,
            phone=director_phone,
            full_name=director_full_name,
            password=director_password,
        )
        director_created = director is not None
    except Exception as exc:
        write_institution_log(
            institution,
            "create",
            user=user,
            message="Institution created, director bootstrap failed",
            metadata={"director_error": str(exc)},
        )
        return institution

    write_institution_log(
        institution,
        "create",
        user=user,
        message="Institution created",
        metadata={"director_created": director_created},
    )
    return institution


def set_institution_status(institution: Institution, status: str, user, message: str = ""):
    institution.status = status
    institution.save(update_fields=["status"])
    write_institution_log(institution, status, user=user, message=message)
    return institution


def create_notice(institution: Institution, *, title: str, body: str, send_at=None, user=None):
    notice = InstitutionNotice.objects.create(
        institution=institution,
        title=title,
        body=body,
        send_at=send_at,
        created_by_id=str(getattr(user, "id", "")) if getattr(user, "id", None) else "",
    )
    write_institution_log(
        institution,
        "notify",
        user=user,
        message=title,
        metadata={"notice_id": str(notice.id)},
    )
    return notice
