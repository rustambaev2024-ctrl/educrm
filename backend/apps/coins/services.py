from django.utils import timezone
from django.db import models
from django.db import transaction as db_transaction

from .models import (
    CoinWallet,
    CoinTransaction,
    CoinSetting,
    Achievement,
    UserAchievement,
)


def get_or_create_wallet(student):
    wallet, _ = CoinWallet.objects.get_or_create(student=student)
    return wallet


@db_transaction.atomic
def award_coins(student, amount: int, reason: str,
                comment: str = "", created_by=None) -> CoinTransaction:
    """Начислить монеты студенту"""
    get_or_create_wallet(student)
    # Блокируем строку кошелька на время транзакции (lock-then-read)
    wallet = CoinWallet.objects.select_for_update().get(student=student)
    wallet.balance += amount

    # Начислить XP
    setting = CoinSetting.get_or_create_default()
    xp_gained = amount * setting.xp_per_coin
    wallet.xp += xp_gained

    # Обновить уровень
    wallet.level = _calculate_level(wallet.xp, setting.level_thresholds)

    # Обновить серию
    today = timezone.now().date()
    if wallet.last_activity_date:
        days_diff = (today - wallet.last_activity_date).days
        if days_diff == 1:
            wallet.streak += 1
        elif days_diff > 1:
            wallet.streak = 1
        # days_diff == 0 — та же дата, серия не меняется
    else:
        wallet.streak = 1
    wallet.last_activity_date = today
    wallet.save(update_fields=["balance", "xp", "level", "streak",
                               "last_activity_date", "updated_at"])

    tx = CoinTransaction.objects.create(
        wallet=wallet,
        transaction_type="earn",
        reason=reason,
        amount=amount,
        comment=comment,
        balance_after=wallet.balance,
        created_by=created_by,
    )

    # Проверить серийные бонусы (только для не-streak начислений — иначе рекурсия)
    if reason != "streak":
        _check_streak_bonus(wallet, setting)

    # Проверить ачивки
    _check_achievements(wallet)

    return tx


@db_transaction.atomic
def deduct_coins(student, amount: int, reason: str = "penalty",
                 comment: str = "", created_by=None) -> CoinTransaction:
    """Снять монеты (XP и уровень не падают)"""
    get_or_create_wallet(student)
    wallet = CoinWallet.objects.select_for_update().get(student=student)
    wallet.balance = max(0, wallet.balance - amount)
    wallet.save(update_fields=["balance", "updated_at"])

    return CoinTransaction.objects.create(
        wallet=wallet,
        transaction_type="penalty",
        reason=reason,
        amount=-amount,
        comment=comment,
        balance_after=wallet.balance,
        created_by=created_by,
    )


@db_transaction.atomic
def purchase_product(student, product):
    """Купить товар в магазине"""
    from .models import Order, Product

    get_or_create_wallet(student)
    # Блокируем кошелёк и товар на время транзакции (lock-then-read)
    wallet = CoinWallet.objects.select_for_update().get(student=student)
    try:
        product = Product.objects.select_for_update().get(pk=product.pk)
    except Product.DoesNotExist:
        raise ValueError("Product not available")

    if not product.is_active:
        raise ValueError("Product not available")

    # Магазин работает только в разрешённые дни
    setting = CoinSetting.get_or_create_default()
    if setting.store_open_days and timezone.localtime().weekday() not in setting.store_open_days:
        raise ValueError("Store is closed today")

    if wallet.balance < product.price_coins:
        raise ValueError("Insufficient coins")

    if wallet.level < product.min_level:
        raise ValueError("Level too low")

    if product.stock == 0:
        raise ValueError("Out of stock")

    # Проверить лимиты (под блокировкой)
    _check_purchase_limits(wallet, product, setting)

    # Списать монеты
    wallet.balance -= product.price_coins
    wallet.save(update_fields=["balance", "updated_at"])

    # Уменьшить сток (guard stock__gt=0, чтобы не уйти в минус → "unlimited")
    if product.stock > 0:
        updated = Product.objects.filter(pk=product.pk, stock__gt=0).update(
            stock=models.F("stock") - 1
        )
        if not updated:
            raise ValueError("Out of stock")

    # Создать транзакцию
    CoinTransaction.objects.create(
        wallet=wallet,
        transaction_type="spend",
        reason="purchase",
        amount=-product.price_coins,
        comment=f"Purchased: {product.name_uz}",
        balance_after=wallet.balance,
    )

    return Order.objects.create(
        wallet=wallet,
        product=product,
        coins_spent=product.price_coins,
        status="new",
    )


def _calculate_level(xp: int, thresholds: list) -> int:
    level = 1
    for threshold in sorted(thresholds, key=lambda x: x["xp"]):
        if xp >= threshold["xp"]:
            level = threshold["level"]
    return level


def _check_streak_bonus(wallet, setting):
    if wallet.streak == 7:
        award_coins(
            wallet.student, setting.coins_streak_7,
            reason="streak", comment="7-day streak bonus!"
        )
    elif wallet.streak == 30:
        award_coins(
            wallet.student, setting.coins_streak_30,
            reason="streak", comment="30-day streak bonus!"
        )


def _check_purchase_limits(wallet, product, setting):
    from .models import Order

    now = timezone.now()
    week_ago = now - timezone.timedelta(days=7)
    month_ago = now - timezone.timedelta(days=30)

    weekly = Order.objects.filter(
        wallet=wallet,
        product=product,
        created_at__gte=week_ago,
    ).exclude(status="cancelled").count()

    if weekly >= setting.max_purchases_per_week:
        raise ValueError("Weekly purchase limit reached")

    monthly = Order.objects.filter(
        wallet=wallet,
        created_at__gte=month_ago,
    ).exclude(status="cancelled").count()

    if monthly >= setting.max_purchases_per_month:
        raise ValueError("Monthly purchase limit reached")


def _check_achievements(wallet):
    achievements = Achievement.objects.filter(is_active=True).exclude(
        id__in=UserAchievement.objects.filter(wallet=wallet).values_list(
            "achievement_id", flat=True
        )
    )
    for ach in achievements:
        unlocked = False
        if ach.condition_type == "streak" and wallet.streak >= ach.condition_value:
            unlocked = True
        elif ach.condition_type == "level" and wallet.level >= ach.condition_value:
            unlocked = True
        elif ach.condition_type == "total_coins":
            total = CoinTransaction.objects.filter(
                wallet=wallet, transaction_type="earn"
            ).aggregate(total=models.Sum("amount"))["total"] or 0
            if total >= ach.condition_value:
                unlocked = True

        if unlocked:
            UserAchievement.objects.create(wallet=wallet, achievement=ach)
            if ach.reward_coins > 0:
                award_coins(
                    wallet.student, ach.reward_coins,
                    reason="manual",
                    comment=f"Achievement: {ach.title_uz}",
                )
