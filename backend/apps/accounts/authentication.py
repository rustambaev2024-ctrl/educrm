"""Серверный гейт принудительной смены пароля (T-026 / R-23).

T-015 убрал дефолтный `ChangeMe123` и добавил `User.must_change_password`, но
флаг ни на что не влиял: сотрудник, получивший временный пароль от админа, мог
работать через API годами и не менять его. Пароль при этом известен тому, кто
его выдал, — то есть чужой аккаунт остаётся доступен третьему лицу.

Почему гейт живёт в слое аутентификации, а не в permission-классе и не в
middleware:
- permission-класс не сработает: большинство вьюх задают `permission_classes`
  явно и затирают `DEFAULT_PERMISSION_CLASSES`;
- middleware не видит пользователя JWT — DRF аутентифицирует уже во вьюхе,
  пришлось бы разбирать токен и ходить в БД вторым запросом;
- `JWTAuthentication.get_user()` и так загружает пользователя из схемы
  тенанта, поэтому проверка флага стоит ноль дополнительных запросов.

Открытым остаётся ровно то, без чего замок нельзя снять изнутри: прочитать
себя, сменить пароль, выйти. Логин и refresh этот класс не задевают вовсе —
там своя аутентификация.
"""
from django.conf import settings
from rest_framework.exceptions import PermissionDenied
from rest_framework_simplejwt.authentication import JWTAuthentication

#: Что разрешено пользователю с непогашенным `must_change_password`.
#: Путь → допустимые методы.
PASSWORD_CHANGE_ALLOWED = {
    "/api/v1/auth/change-password/": {"POST"},
    "/api/v1/auth/me/": {"GET", "HEAD", "OPTIONS"},
    "/api/v1/auth/logout/": {"POST"},
}

CHANGE_REQUIRED_CODE = "password_change_required"

PASSWORD_CHANGE_REQUIRED_DETAIL = {
    "uz": "Davom etish uchun vaqtinchalik parolni o'zgartiring",
    "ru": "Чтобы продолжить, смените временный пароль",
}


class PasswordChangeGateJWTAuthentication(JWTAuthentication):
    """`JWTAuthentication` + отказ работать с непогашенным временным паролем."""

    def authenticate(self, request):
        result = super().authenticate(request)
        if result is None:
            return None

        user, _token = result
        if self._is_locked(user) and not self._is_allowed(request):
            # 403 с машиночитаемым `code`: фронт обязан отличить этот отказ от
            # обычного «нет прав» и увести пользователя на смену пароля.
            raise PermissionDenied(
                {
                    "detail": PASSWORD_CHANGE_REQUIRED_DETAIL,
                    "code": CHANGE_REQUIRED_CODE,
                }
            )
        return result

    @staticmethod
    def _is_locked(user):
        if not getattr(settings, "FORCE_PASSWORD_CHANGE", True):
            # Аварийный выключатель для devops: если на проде окажется, что
            # сотрудники заперты (нет экрана смены пароля во фронте нужной
            # версии), гейт снимается переменной окружения без отката релиза.
            return False
        return bool(getattr(user, "must_change_password", False))

    @staticmethod
    def _is_allowed(request):
        allowed_methods = PASSWORD_CHANGE_ALLOWED.get(request.path)
        if allowed_methods is None:
            return False
        return request.method in allowed_methods
