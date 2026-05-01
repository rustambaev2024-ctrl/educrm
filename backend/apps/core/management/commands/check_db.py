from django.core.management.base import BaseCommand
from django_tenants.utils import schema_context
from apps.institutions.models import Branch
from apps.accounts.models import User

class Command(BaseCommand):
    def handle(self, *args, **options):
        with schema_context("crm"):
            print("CRM Branches:", list(Branch.objects.values('id', 'name')))
            print("CRM Users:", list(User.objects.values('id', 'phone', 'role')))
