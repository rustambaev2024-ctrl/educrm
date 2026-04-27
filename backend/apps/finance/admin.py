from django.contrib import admin

from .models import Payment, Wallet


@admin.register(Wallet)
class WalletAdmin(admin.ModelAdmin):
    list_display = ("id", "student", "balance", "updated_at")
    search_fields = ("student__user__full_name", "student__user__phone")


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "student",
        "payment_type",
        "amount",
        "balance_before",
        "balance_after",
        "created_at",
    )
    list_filter = ("payment_type",)
    search_fields = ("student__user__full_name", "student__user__phone")
