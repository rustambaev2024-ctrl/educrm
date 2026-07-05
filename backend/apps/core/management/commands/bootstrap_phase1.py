import os

from django.core.management.base import BaseCommand
from django.db import connection
from django_tenants.utils import schema_context

from apps.accounts.models import User
from apps.tenants.models import Domain, Institution


class Command(BaseCommand):
    help = "Bootstrap phase1 tenant and role users"

    def handle(self, *args, **options):
        password = os.getenv("BOOTSTRAP_PASSWORD")
        if not password:
            self.stderr.write(
                self.style.ERROR("BOOTSTRAP_PASSWORD must be set for bootstrap_phase1.")
            )
            return
        schema_name = os.getenv("BOOTSTRAP_SCHEMA_NAME", "bootstrap")
        institution_name = os.getenv("BOOTSTRAP_INSTITUTION_NAME", "Bootstrap Institution")
        domain_name = os.getenv("BOOTSTRAP_DOMAIN", schema_name)

        institution, created = Institution.objects.get_or_create(
            schema_name=schema_name,
            defaults={
                "name": institution_name,
                "slug": schema_name,
            },
        )

        if created:
            institution.save()
            self.stdout.write(self.style.SUCCESS(f"Created tenant schema: {schema_name}"))

        Domain.objects.get_or_create(
            domain=domain_name,
            defaults={"tenant": institution, "is_primary": True},
        )

        with schema_context(schema_name):
            users = [
                ("superadmin", "+998900000001", "Super Admin"),
                ("director", "+998900000002", "Director User"),
                ("branch_admin", "+998900000003", "Branch Admin"),
                ("teacher", "+998900000004", "Teacher User"),
                ("student", "+998900000005", "Student User"),
                ("parent", "+998900000006", "Parent User"),
            ]

            for role, phone, full_name in users:
                user, _ = User.objects.get_or_create(
                    phone=phone,
                    defaults={
                        "full_name": full_name,
                        "role": role,
                        "is_staff": role in ("superadmin", "director", "branch_admin"),
                    },
                )
                user.set_password(password)
                user.save(update_fields=["password"])

        connection.set_schema_to_public()
        self.stdout.write(self.style.SUCCESS("Phase1 bootstrap complete."))
