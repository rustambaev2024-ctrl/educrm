from django_tenants.utils import schema_context
from apps.institutions.models import Branch
from apps.accounts.models import User

with schema_context("crm"):
    print("CRM Branches:", list(Branch.objects.values('id', 'name')))
    print("CRM Users:", list(User.objects.values('id', 'phone', 'role')))
