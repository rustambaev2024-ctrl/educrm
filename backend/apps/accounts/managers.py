from django.contrib.auth.base_user import BaseUserManager


class UserManager(BaseUserManager):
    use_in_migrations = True

    @staticmethod
    def normalize_phone(value: str) -> str:
        """Normalize any Uzbek phone to a single canonical form +998XXXXXXXXX."""
        if not value:
            return value
        value = value.strip()
        digits = "".join(ch for ch in value if ch.isdigit())
        if digits.startswith("998"):
            return f"+{digits}"
        if len(digits) == 9:  # короткий локальный номер без кода страны
            return f"+998{digits}"
        # неоднозначный формат — возвращаем с + если был, иначе как есть
        return f"+{digits}" if value.startswith("+") else digits

    def create_user(self, phone, password=None, **extra_fields):
        if not phone:
            raise ValueError("Phone must be set")
        phone = self.normalize_phone(phone)
        user = self.model(phone=phone, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, phone, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", "superadmin")

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")

        return self.create_user(phone, password, **extra_fields)
