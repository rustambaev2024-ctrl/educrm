"""Глобальная пагинация списков (T-018 / R-24).

Почему opt-in, а не безусловная:
`REST_FRAMEWORK` не задавал `DEFAULT_PAGINATION_CLASS` вообще, поэтому весь
фронтенд (`src/lib/data/store.tsx`) читает списки одним ответом и постранично
дочитывает только `/students/`, `/staff/`, `/parents/` (`fetchAllPages`).
Безусловное включение `PAGE_SIZE` **молча обрезало бы** группы, уроки,
посещаемость, платежи и оценки до первой страницы — то есть заменило бы
проблему производительности на потерю данных в UI.

Поэтому: клиент, который прислал `page` или `page_size`, получает
пагинированный ответ `{count, next, previous, results}`; клиент, который
ничего не прислал, получает прежний плоский список, но **не более**
`MAX_UNPAGINATED` записей — жёсткий потолок от 39-килобайтных ответов (R-6).

Полное принудительное включение — после миграции фронтенда на постраничное
чтение всех списков (follow-up к F-002, роль frontend).
"""
import logging

from django.db import connection
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

logger = logging.getLogger(__name__)


class OptInPageNumberPagination(PageNumberPagination):
    page_size = 100
    page_size_query_param = "page_size"
    max_page_size = 1000

    #: Потолок для клиентов, которые не просили пагинацию.
    MAX_UNPAGINATED = 1000

    #: T-028. Молчаливое усечение опаснее самого усечения: клиент не отличает
    #: «записей ровно 1000» от «записей больше, остальные потеряны», и
    #: пользователь видит неполный список без единого признака. Тело ответа —
    #: плоский массив, добавить в него поле нельзя без слома контракта,
    #: поэтому признак идёт заголовками. `Access-Control-Expose-Headers`
    #: (`apps/core/middleware.py`) обязателен, иначе браузер их не покажет.
    TRUNCATED_HEADER = "X-Result-Truncated"
    LIMIT_HEADER = "X-Result-Limit"

    def paginate_queryset(self, queryset, request, view=None):
        asked = self.page_query_param in request.query_params or (
            self.page_size_query_param in request.query_params
        )
        if not asked:
            self.page = None
            # +1 записи вместо COUNT(*): признак усечения не должен стоить
            # лишнего запроса на каждом списке.
            window = list(queryset[: self.MAX_UNPAGINATED + 1])
            self.truncated = len(window) > self.MAX_UNPAGINATED
            if self.truncated:
                logger.warning(
                    "Unpaginated list truncated at %s: tenant=%s path=%s view=%s",
                    self.MAX_UNPAGINATED,
                    getattr(connection, "schema_name", "unknown"),
                    request.path,
                    type(view).__name__ if view is not None else "unknown",
                )
            return window[: self.MAX_UNPAGINATED]
        self.truncated = False
        return super().paginate_queryset(queryset, request, view=view)

    def get_paginated_response(self, data):
        if getattr(self, "page", None) is None:
            response = Response(data)
            if getattr(self, "truncated", False):
                response[self.TRUNCATED_HEADER] = "true"
                response[self.LIMIT_HEADER] = str(self.MAX_UNPAGINATED)
            return response
        return super().get_paginated_response(data)
