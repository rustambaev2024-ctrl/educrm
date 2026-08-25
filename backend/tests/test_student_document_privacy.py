"""T-013 / R-17: документы учеников (PII несовершеннолетних) больше не публичны."""
import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.http import Http404

from apps.core.media import protected_media_serve
from apps.institutions.models import Branch
from apps.staff.models import Staff
from apps.students.models import Student, StudentDocument
from apps.students.storage import (
    ALLOWED_DOCUMENT_EXTENSIONS,
    MAX_DOCUMENT_SIZE,
    PrivateFileSystemStorage,
    student_document_path,
)

User = get_user_model()
pytestmark = pytest.mark.django_db

PASSWORD = "secret123"


def _auth(api_client, user):
    response = api_client.post(
        "/api/v1/auth/login/",
        {"phone": user.phone, "password": PASSWORD},
        format="json",
    )
    assert response.status_code == 200, response.json()
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.json()['access']}")


@pytest.fixture
def env():
    branch = Branch.objects.create(name="Main", address="A", phone="+998901222001")
    other_branch = Branch.objects.create(name="Second", address="B", phone="+998901222002")

    director = User.objects.create_user(
        phone="+998909900001", full_name="Director", role="director", password=PASSWORD
    )
    Staff.objects.create(user=director, branch=branch)

    foreign_admin = User.objects.create_user(
        phone="+998909900002", full_name="Other Admin", role="branch_admin", password=PASSWORD
    )
    Staff.objects.create(user=foreign_admin, branch=other_branch)

    student_user = User.objects.create_user(
        phone="+998909900003", full_name="Student", role="student", password=PASSWORD
    )
    student = Student.objects.create(user=student_user, branch=branch)

    document = StudentDocument.objects.create(
        student=student,
        doc_type="passport",
        file=SimpleUploadedFile("passport.pdf", b"%PDF-1.4 scan", content_type="application/pdf"),
        uploaded_by=director,
    )
    return {
        "director": director,
        "foreign_admin": foreign_admin,
        "student": student,
        "student_user": student_user,
        "document": document,
    }


# ─── Хранение ─────────────────────────────────────────────────────────────────

def test_upload_path_contains_tenant_schema(env):
    """Инвариант 5 multitenancy.md: тенант в пути хранения."""
    from unittest.mock import patch

    with patch("apps.students.storage.connection", schema_name="tenant_alpha"):
        path = student_document_path(env["document"], "passport.pdf")
    assert path.startswith("tenant_alpha/student_docs/")
    assert str(env["document"].student_id) in path


def test_original_filename_is_not_reused(env):
    path = student_document_path(env["document"], "ivanov_passport.pdf")
    assert "ivanov" not in path
    assert path.endswith(".pdf")


def test_unknown_extension_is_stripped_from_path(env):
    path = student_document_path(env["document"], "shell.php")
    assert not path.endswith(".php")


def test_stored_file_has_tenant_in_name(env):
    """Под SQLite схемы нет, но структура пути должна быть выдержана."""
    parts = env["document"].file.name.split("/")
    assert parts[1] == "student_docs"
    assert parts[2] == str(env["document"].student_id)


def test_private_storage_has_no_public_url():
    storage = PrivateFileSystemStorage()
    with pytest.raises(NotImplementedError):
        storage.url("anything.pdf")


# ─── Раздача /media/ ──────────────────────────────────────────────────────────

def test_media_serve_refuses_student_docs(rf):
    request = rf.get("/media/student_docs/2026/07/passport.pdf")
    with pytest.raises(Http404):
        protected_media_serve(request, "student_docs/2026/07/passport.pdf", document_root="/tmp")


def test_media_serve_refuses_nested_student_docs(rf):
    request = rf.get("/media/x/student_docs/passport.pdf")
    with pytest.raises(Http404):
        protected_media_serve(request, "x/student_docs/passport.pdf", document_root="/tmp")


def test_media_serve_still_allows_logos(api_client):
    """Легитимный путь: логотипы и аватары продолжают отдаваться."""
    response = api_client.get("/media/logos/does-not-exist.png")
    # 404 от файловой системы, а не от гарда — путь не запрещён целиком.
    assert response.status_code == 404


# ─── API ──────────────────────────────────────────────────────────────────────

def test_api_no_longer_returns_permanent_file_url(api_client, env):
    _auth(api_client, env["director"])
    response = api_client.get(f"/api/v1/students/{env['student'].id}/")
    assert response.status_code == 200, response.json()
    documents = response.json()["documents"]
    assert documents
    assert "file" not in documents[0]
    assert documents[0]["download_url"].endswith(
        f"/documents/{env['document'].id}/download/"
    )


def test_download_requires_authentication(api_client, env):
    api_client.credentials()
    response = api_client.get(
        f"/api/v1/students/{env['student'].id}/documents/{env['document'].id}/download/"
    )
    assert response.status_code in (401, 403)


def test_director_can_download(api_client, env):
    """Легитимный путь: директор открывает документ своего ученика."""
    _auth(api_client, env["director"])
    response = api_client.get(
        f"/api/v1/students/{env['student'].id}/documents/{env['document'].id}/download/"
    )
    assert response.status_code in (200, 302)


def test_admin_from_another_branch_cannot_download(api_client, env):
    _auth(api_client, env["foreign_admin"])
    response = api_client.get(
        f"/api/v1/students/{env['student'].id}/documents/{env['document'].id}/download/"
    )
    assert response.status_code in (403, 404)


def test_unknown_document_id_is_404(api_client, env):
    _auth(api_client, env["director"])
    response = api_client.get(
        f"/api/v1/students/{env['student'].id}"
        "/documents/00000000-0000-0000-0000-000000000000/download/"
    )
    assert response.status_code == 404
    assert set(response.json()["detail"]) == {"uz", "ru"}


def test_upload_rejects_disallowed_extension(api_client, env):
    _auth(api_client, env["director"])
    response = api_client.post(
        f"/api/v1/students/{env['student'].id}/documents/",
        {
            "doc_type": "passport",
            "file": SimpleUploadedFile("evil.php", b"<?php", content_type="text/plain"),
        },
        format="multipart",
    )
    assert response.status_code == 400
    assert ".php" not in str(response.json())


def test_upload_accepts_allowed_extension(api_client, env):
    """Легитимный путь: загрузка скана паспорта продолжает работать."""
    _auth(api_client, env["director"])
    response = api_client.post(
        f"/api/v1/students/{env['student'].id}/documents/",
        {
            "doc_type": "passport",
            "file": SimpleUploadedFile("scan.jpg", b"\xff\xd8\xff binary", content_type="image/jpeg"),
        },
        format="multipart",
    )
    assert response.status_code == 201, response.json()
    assert "download_url" in response.json()
    assert "file" not in response.json()


def test_limits_are_declared():
    assert ".pdf" in ALLOWED_DOCUMENT_EXTENSIONS
    assert ".php" not in ALLOWED_DOCUMENT_EXTENSIONS
    assert MAX_DOCUMENT_SIZE == 10 * 1024 * 1024
