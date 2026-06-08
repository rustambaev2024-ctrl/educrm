from django.core.management.base import BaseCommand

from django_tenants.utils import schema_context

from apps.tenants.models import Institution


class Command(BaseCommand):
    help = "Assign a default branch to students that have no branch"

    def handle(self, *args, **kwargs):
        institutions = Institution.objects.exclude(schema_name="public")
        if not institutions.exists():
            self.stdout.write("No tenants found.")
            return

        for institution in institutions:
            with schema_context(institution.schema_name):
                from apps.students.models import Student
                from apps.institutions.models import Branch

                students_no_branch = Student.objects.filter(branch__isnull=True)
                count = students_no_branch.count()

                if count == 0:
                    self.stdout.write(
                        f"{institution.schema_name}: all students have a branch OK"
                    )
                    continue

                default_branch = Branch.objects.first()
                if not default_branch:
                    self.stdout.write(
                        f"{institution.schema_name}: no branches found, skipped {count} students"
                    )
                    continue

                students_no_branch.update(branch=default_branch)
                self.stdout.write(
                    f"{institution.schema_name}: fixed {count} students -> {default_branch.name}"
                )
