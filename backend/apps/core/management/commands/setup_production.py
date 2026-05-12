from django.core.management.base import BaseCommand
from django_tenants.utils import schema_context

from apps.accounts.models import User
from apps.tenants.models import Domain, Institution

class Command(BaseCommand):
    help = "Ensure production tenant and superadmin exist without deleting existing data"

    def handle(self, *args, **options):
        # Setup System Tenant (NOT public, because User model is in TENANT_APPS).
        # This command runs on production boot, so it must never delete tenant data.
        tenant_schema = "crm"
        crm_inst, _ = Institution.objects.get_or_create(
            schema_name=tenant_schema,
            defaults={
                "name": "EduCRM",
                "slug": "crm",
            },
        )
        
        # Register domains for this tenant
        domains = ["educrm-production.up.railway.app", "localhost", "127.0.0.1"]
        for i, domain in enumerate(domains):
            Domain.objects.get_or_create(
                domain=domain,
                defaults={"tenant": crm_inst, "is_primary": (i == 0)},
            )

        # Ensure your personal superadmin exists in the tenant schema.
        with schema_context(tenant_schema):
            user, created = User.objects.get_or_create(
                phone="+998912755141",
                defaults={
                    "full_name": "Super Admin",
                    "role": "superadmin",
                    "is_staff": True,
                    "is_superuser": True,
                },
            )
            update_fields = []
            if user.role != "superadmin":
                user.role = "superadmin"
                update_fields.append("role")
            if not user.is_staff:
                user.is_staff = True
                update_fields.append("is_staff")
            if not user.is_superuser:
                user.is_superuser = True
                update_fields.append("is_superuser")
            if created:
                user.set_password("iyricc-8")
                update_fields.append("password")
            if update_fields:
                user.save(update_fields=update_fields)
            
        self.stdout.write(self.style.SUCCESS("Superadmin setup complete! Your account +998912755141 is ready."))
