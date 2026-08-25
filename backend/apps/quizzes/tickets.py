"""Подписанные тикеты сессии квиза (T-010 / R-19).

Участник живого квиза анонимен — JWT у него нет. До этого схема тенанта бралась
из свободного `?schema=` в URL (REST и WebSocket), а при его отсутствии бэкенд
перебирал ВСЕ схемы платформы в поисках 6-значного кода. Код уникален только
внутри схемы, поэтому совпадение кодов у двух учебных центров отдавало участнику
чужие вопросы, а его ФИО, дата рождения и телефон родителя записывались в
произвольно выбранную схему.

Тикет решает это: схему определяет сервер один раз (по тенанту запроса) и
подписывает. Клиент дальше не может её подменить — подпись не сойдётся.
"""
from django.core import signing

SALT = "quizzes.join-ticket"
#: Живой квиз идёт минуты, не часы. TTL с запасом на ожидание старта.
DEFAULT_MAX_AGE = 3 * 60 * 60


def issue_join_ticket(schema_name: str, session_id, code: str) -> str:
    return signing.dumps(
        {"schema": schema_name, "session_id": str(session_id), "code": str(code)},
        salt=SALT,
    )


def read_join_ticket(value: str, max_age: int = DEFAULT_MAX_AGE):
    """Вернуть payload тикета или None, если он подделан/протух."""
    if not value:
        return None
    try:
        return signing.loads(value, salt=SALT, max_age=max_age)
    except signing.BadSignature:
        return None
