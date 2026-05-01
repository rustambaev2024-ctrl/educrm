import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django_tenants.utils import schema_context
from apps.institutions.models import Branch

with schema_context("crm"):
    branch, _ = Branch.objects.get_or_create(name="Test Branch")
    print("Created branch:", branch.id)
