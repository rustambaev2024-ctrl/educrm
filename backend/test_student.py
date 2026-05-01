import os
import django
import sys

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.core.files.uploadedfile import SimpleUploadedFile
from django_tenants.utils import schema_context
from apps.students.serializers import StudentSerializer
from apps.institutions.models import Branch

with schema_context("crm"):
    branch = Branch.objects.first()
    if not branch:
        print("NO BRANCH FOUND!")
        sys.exit(1)

    photo = SimpleUploadedFile("photo.jpg", b"file_content", content_type="image/jpeg")
    
    data = {
        "full_name": "Test Student",
        "phone": "+998901112233",
        "branch": branch.id,
        "photo": photo,
        "parent_full_name": "Parent Test",
        "parent_phone": "+998901112244",
    }
    
    serializer = StudentSerializer(data=data)
    if serializer.is_valid():
        try:
            student = serializer.save()
            print("STUDENT CREATED:", student.id)
        except Exception as e:
            print("EXCEPTION DURING SAVE:", e)
    else:
        print("VALIDATION ERRORS:", serializer.errors)
