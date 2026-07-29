"""Приватное хранилище документов учеников (T-013 / R-17, ADR-002).

Что было: `StudentDocument.file` лежал в `MEDIA_ROOT/student_docs/%Y/%m/`,
`/media/` раздавался `django.views.static.serve` в проде **без аутентификации**
и без срока жизни ссылки, а путь не содержал идентификатора тенанта — все
учебные центры писали в один каталог (нарушение инварианта 5 multitenancy.md).
Скан паспорта или свидетельства о рождении ребёнка скачивался по прямой ссылке
кем угодно, кто её знал.

Что стало:
- путь объекта начинается с `tenant_schema` (инвариант 5);
- имя файла заменяется на UUID — оригинальное имя не утекает и не даёт
  подобрать ссылку;
- при настроенном MinIO объекты приватные, отдаются короткоживущей
  presigned-ссылкой; иначе — отдельный каталог вне `MEDIA_ROOT`, который
  `/media/` не раздаёт.
"""
import os
import uuid

from django.conf import settings
from django.core.files.storage import FileSystemStorage
from django.db import connection

#: Разрешённые расширения документов ученика.
ALLOWED_DOCUMENT_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".heic", ".webp"}
#: Больше 10 МБ скан документа быть не должен.
MAX_DOCUMENT_SIZE = 10 * 1024 * 1024


def student_document_path(instance, filename: str) -> str:
    """`<schema>/student_docs/<student_id>/<uuid><ext>` — тенант в пути."""
    _, ext = os.path.splitext(filename or "")
    ext = ext.lower()
    if ext not in ALLOWED_DOCUMENT_EXTENSIONS:
        ext = ""
    schema = getattr(connection, "schema_name", "public")
    student_id = getattr(instance, "student_id", None) or "unassigned"
    return f"{schema}/student_docs/{student_id}/{uuid.uuid4().hex}{ext}"


class PrivateFileSystemStorage(FileSystemStorage):
    """Локальный fallback: каталог вне `MEDIA_ROOT`, без публичного URL."""

    def __init__(self, **kwargs):
        kwargs.setdefault(
            "location",
            getattr(settings, "PRIVATE_MEDIA_ROOT", None)
            or os.path.join(settings.BASE_DIR, "private_media"),
        )
        kwargs.setdefault("base_url", None)
        super().__init__(**kwargs)

    def url(self, name):
        raise NotImplementedError(
            "Документы учеников не имеют публичного URL — "
            "используйте GET /api/v1/students/<id>/documents/<doc_id>/download/"
        )


def _build_storage():
    """MinIO, если он реально настроен; иначе приватный локальный каталог."""
    endpoint = getattr(settings, "AWS_S3_ENDPOINT_URL", None)
    bucket = getattr(settings, "AWS_STORAGE_BUCKET_NAME", None)
    if not (endpoint and bucket and getattr(settings, "USE_PRIVATE_S3_DOCUMENTS", False)):
        return PrivateFileSystemStorage()

    from storages.backends.s3boto3 import S3Boto3Storage

    class PrivateS3DocumentStorage(S3Boto3Storage):
        bucket_name = bucket
        default_acl = "private"
        querystring_auth = True
        querystring_expire = getattr(settings, "DOCUMENT_URL_TTL_SECONDS", 300)
        file_overwrite = False

    return PrivateS3DocumentStorage()


#: Один экземпляр на процесс; FileField сериализует его в миграции по ссылке.
def private_document_storage():
    global _STORAGE
    try:
        return _STORAGE
    except NameError:
        _STORAGE = _build_storage()
        return _STORAGE
