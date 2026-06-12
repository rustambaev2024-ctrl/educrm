import uuid
from django.db import models
from django.conf import settings


class CoinSetting(models.Model):
    """Настройки геймификации — одна запись на тенант"""

    # Начисления за события
    coins_present = models.PositiveIntegerField(default=10)
    coins_late = models.PositiveIntegerField(default=5)
    coins_grade_perfect = models.PositiveIntegerField(default=20)
    coins_grade_good = models.PositiveIntegerField(default=10)
    coins_homework_done = models.PositiveIntegerField(default=15)
    coins_quiz_correct = models.PositiveIntegerField(default=5)
    coins_streak_7 = models.PositiveIntegerField(default=50)
    coins_streak_30 = models.PositiveIntegerField(default=200)

    # Штрафы/бонусы за посещаемость (положительное = бонус, отрицательное = штраф, 0 = ничего)
    coins_late_penalty = models.IntegerField(default=0)
    coins_absent_penalty = models.IntegerField(default=0)

    # XP курс
    xp_per_coin = models.PositiveIntegerField(default=3)

    # Уровни (JSON)
    level_thresholds = models.JSONField(default=list)

    # Магазин
    store_open_days = models.JSONField(default=list)
    max_purchases_per_week = models.PositiveIntegerField(default=1)
    max_purchases_per_month = models.PositiveIntegerField(default=3)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "coins_setting"

    @classmethod
    def get_or_create_default(cls):
        setting, _ = cls.objects.get_or_create(
            pk=1,
            defaults={
                "level_thresholds": [
                    {"level": 1, "name_uz": "Boshlovchi", "name_ru": "Новичок",  "xp": 0},
                    {"level": 2, "name_uz": "O'rta",      "name_ru": "Средний",  "xp": 500},
                    {"level": 3, "name_uz": "Yaxshi",     "name_ru": "Хороший",  "xp": 1500},
                    {"level": 4, "name_uz": "A'lo",       "name_ru": "Отличник", "xp": 3000},
                    {"level": 5, "name_uz": "Champion",   "name_ru": "Чемпион",  "xp": 6000},
                ],
                "store_open_days": [0, 1, 2, 3, 4],
            },
        )
        return setting


class CoinWallet(models.Model):
    """Кошелёк студента"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.OneToOneField(
        "students.Student",
        on_delete=models.CASCADE,
        related_name="coin_wallet",
    )
    balance = models.PositiveIntegerField(default=0)
    xp = models.PositiveIntegerField(default=0)
    level = models.PositiveIntegerField(default=1)
    streak = models.PositiveIntegerField(default=0)
    last_activity_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "coins_wallet"

    def __str__(self):
        return f"{self.student} — {self.balance} coins"


class CoinTransaction(models.Model):
    TRANSACTION_TYPES = [
        ("earn",       "Earn"),
        ("spend",      "Spend"),
        ("adjustment", "Adjustment"),
        ("penalty",    "Penalty"),
    ]
    REASON_TYPES = [
        ("attendance",  "Attendance"),
        ("grade",       "Grade"),
        ("homework",    "Homework"),
        ("quiz",        "Quiz"),
        ("streak",      "Streak"),
        ("purchase",    "Purchase"),
        ("manual",      "Manual"),
        ("penalty",     "Penalty"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    wallet = models.ForeignKey(
        CoinWallet, on_delete=models.CASCADE, related_name="transactions"
    )
    transaction_type = models.CharField(max_length=20, choices=TRANSACTION_TYPES)
    reason = models.CharField(max_length=20, choices=REASON_TYPES)
    amount = models.IntegerField()
    comment = models.CharField(max_length=500, blank=True, default="")
    balance_after = models.PositiveIntegerField()
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="coin_transactions_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "coins_transaction"
        ordering = ["-created_at"]


class Achievement(models.Model):
    CONDITION_TYPES = [
        ("streak",       "Streak days"),
        ("total_coins",  "Total coins earned"),
        ("attendance",   "Attendance count"),
        ("grade_count",  "Perfect grades count"),
        ("homework",     "Homework submitted"),
        ("quiz_wins",    "Quiz wins"),
        ("level",        "Reach level"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title_uz = models.CharField(max_length=200)
    title_ru = models.CharField(max_length=200)
    description_uz = models.CharField(max_length=500, blank=True)
    description_ru = models.CharField(max_length=500, blank=True)
    icon = models.CharField(max_length=50, default="trophy")
    condition_type = models.CharField(max_length=30, choices=CONDITION_TYPES)
    condition_value = models.PositiveIntegerField()
    reward_coins = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "coins_achievement"


class UserAchievement(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    wallet = models.ForeignKey(
        CoinWallet, on_delete=models.CASCADE, related_name="achievements"
    )
    achievement = models.ForeignKey(
        Achievement, on_delete=models.CASCADE
    )
    unlocked_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "coins_user_achievement"
        unique_together = [("wallet", "achievement")]


class ProductCategory(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name_uz = models.CharField(max_length=200)
    name_ru = models.CharField(max_length=200)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "coins_product_category"
        ordering = ["order"]


class Product(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    category = models.ForeignKey(
        ProductCategory, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="products"
    )
    name_uz = models.CharField(max_length=200)
    name_ru = models.CharField(max_length=200)
    description_uz = models.TextField(blank=True)
    description_ru = models.TextField(blank=True)
    price_coins = models.PositiveIntegerField()
    stock = models.IntegerField(default=-1)  # -1 = unlimited
    min_level = models.PositiveIntegerField(default=1)
    is_active = models.BooleanField(default=True)
    image_url = models.URLField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "coins_product"
        ordering = ["category", "price_coins"]


class Order(models.Model):
    STATUS_CHOICES = [
        ("new",       "New"),
        ("confirmed", "Confirmed"),
        ("delivered", "Delivered"),
        ("cancelled", "Cancelled"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    wallet = models.ForeignKey(
        CoinWallet, on_delete=models.CASCADE, related_name="orders"
    )
    product = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name="orders"
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="new")
    quantity = models.PositiveIntegerField(default=1)
    coins_spent = models.PositiveIntegerField()
    comment = models.TextField(blank=True)
    processed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "coins_order"
        ordering = ["-created_at"]
