"""Раздача `/media/` с изъятием PII-каталогов (T-013 / R-17)."""
from django.http import Http404
from django.views.static import serve

#: Каталоги, которые нельзя отдавать напрямую ни при каких условиях.
FORBIDDEN_MEDIA_SEGMENTS = {"student_docs"}


def protected_media_serve(request, path, document_root=None, **kwargs):
    """`/media/student_docs/...` больше не отдаётся напрямую.

    Раньше сканы паспортов и свидетельств о рождении детей скачивал кто угодно,
    у кого есть ссылка — `/media/` раздавался `django.views.static.serve`
    в проде без аутентификации и без срока жизни ссылки.
    Новые документы лежат в приватном хранилище (`PRIVATE_MEDIA_ROOT`/MinIO),
    но старые файлы физически остаются в `MEDIA_ROOT` до миграции, поэтому
    путь закрывается явно.

    Легитимный доступ: `GET /api/v1/students/<id>/documents/<doc_id>/download/`.
    """
    normalized = (path or "").replace("\\", "/").lower()
    if FORBIDDEN_MEDIA_SEGMENTS & set(normalized.split("/")):
        raise Http404("Not found")
    return serve(request, path, document_root=document_root, **kwargs)
