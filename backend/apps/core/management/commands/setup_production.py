from django.core.management.base import BaseCommand
from django.db import connection
from django_tenants.utils import schema_context, get_public_schema_name

from apps.accounts.models import User
from apps.tenants.models import Domain, Institution

class Command(BaseCommand):
    help = "Setup production superadmin and remove demo data"

    def handle(self, *args, **options):
        # 1. Drop demo and bootstrap schemas to clean up dummy data
        schemas_to_drop = ["demo", "bootstrap"]
        for schema in schemas_to_drop:
            try:
                inst = Institution.objects.get(schema_name=schema)
                with connection.cursor() as cursor:
                    cursor.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE;')
                inst.delete()
                self.stdout.write(self.style.SUCCESS(f"Deleted schema: {schema}"))
            except Institution.DoesNotExist:
                pass

        # 2. Setup System Tenant (NOT public, because User model is in TENANT_APPS)
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

        # 3. Create Superadmin in the new tenant schema
        with schema_context(tenant_schema):
            # Clear old users to ensure clean slate
            User.objects.all().delete()
            
            # Create your personal superadmin
            user = User.objects.create(
                phone="+998914235141",
                full_name="Super Admin",
                role="superadmin",
                is_staff=True,
                is_superuser=True
            )
            user.set_password("iyricc-8")
            user.save()
            
        self.stdout.write(self.style.SUCCESS("Superadmin setup complete! Your account +998914235141 is ready."))
