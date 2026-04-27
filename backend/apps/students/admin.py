from django.contrib import admin

from .models import Certificate, Parent, ParentStudentLink, Student, StudentDocument


@admin.register(Student)
class StudentAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "branch", "status", "wallet_balance", "registered_at")
    list_filter = ("status", "branch")
    search_fields = ("user__full_name", "user__phone")


@admin.register(Parent)
class ParentAdmin(admin.ModelAdmin):
    list_display = ("id", "user")
    search_fields = ("user__full_name", "user__phone")


@admin.register(ParentStudentLink)
class ParentStudentLinkAdmin(admin.ModelAdmin):
    list_display = ("parent", "student", "linked_at")
    search_fields = ("parent__user__full_name", "student__user__full_name")


@admin.register(StudentDocument)
class StudentDocumentAdmin(admin.ModelAdmin):
    list_display = ("id", "student", "doc_type", "uploaded_at", "uploaded_by")
    list_filter = ("doc_type",)


@admin.register(Certificate)
class CertificateAdmin(admin.ModelAdmin):
    list_display = ("id", "student", "course", "issued_at", "issued_by")
