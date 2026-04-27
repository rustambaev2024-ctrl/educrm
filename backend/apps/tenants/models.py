from django.db import models
from django_tenants.models import DomainMixin, TenantMixin


class Institution(TenantMixin):
    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True)
    logo = models.ImageField(upload_to="logos/", null=True, blank=True)
    address = models.TextField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    currency = models.CharField(max_length=10, default="UZS")
    language = models.CharField(
        max_length=5,
        default="uz",
        choices=[("uz", "Uzbek"), ("ru", "Russian")],
    )
    status = models.CharField(
        max_length=20,
        choices=[("active", "Active"), ("frozen", "Frozen"), ("archived", "Archived")],
        default="active",
    )
    subscription_start = models.DateField(null=True, blank=True)
    subscription_end = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    auto_create_schema = True

    class Meta:
        app_label = "tenants"

    def __str__(self) -> str:
        return self.name


class Domain(DomainMixin):
    class Meta:
        app_label = "tenants"
