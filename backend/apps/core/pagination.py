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
from rest_framework.pagination import PageNumberPagination


class OptInPageNumberPagination(PageNumberPagination):
    page_size = 100
    page_size_query_param = "page_size"
    max_page_size = 1000

    #: Потолок для клиентов, которые не просили пагинацию.
    MAX_UNPAGINATED = 1000

    def paginate_queryset(self, queryset, request, view=None):
        asked = self.page_query_param in request.query_params or (
            self.page_size_query_param in request.query_params
        )
        if not asked:
            self.page = None
            return list(queryset[: self.MAX_UNPAGINATED])
        return super().paginate_queryset(queryset, request, view=view)

    def get_paginated_response(self, data):
        if getattr(self, "page", None) is None:
            from rest_framework.response import Response

            return Response(data)
        return super().get_paginated_response(data)
