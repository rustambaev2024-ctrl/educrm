from django_tenants.utils import schema_context
from apps.institutions.models import Branch

with schema_context("public"):
    print("PUBLIC:", Branch.objects.all())

with schema_context("crm"):
    print("CRM:", Branch.objects.all())
