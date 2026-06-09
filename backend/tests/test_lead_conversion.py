import pytest
from tests.factories import BranchFactory, UserFactory

pytestmark = pytest.mark.django_db(transaction=True)


def make_lead(branch, phone="+998901234567", name="Test Lead"):
    from apps.students.models import StudentLead
    return StudentLead.objects.create(
        full_name=name,
        phone=phone,
        branch=branch,
        status="new",
    )


class TestConvertLeadToStudent:
    """Тесты конвертации лида в студента"""

    def test_convert_creates_student(self, api_client):
        """После конвертации создаётся студент"""
        from apps.students.models import Student
        branch = BranchFactory()
        lead = make_lead(branch)
        admin = UserFactory(role="director")
        api_client.force_authenticate(user=admin)

        response = api_client.post(
            f"/api/v1/leads/{lead.id}/convert/",
            {"branch_id": str(branch.id)},
            format="json",
        )

        assert response.status_code == 200
        assert Student.objects.filter(user__phone=lead.phone).exists()

    def test_convert_marks_lead_as_won(self, api_client):
        """После конвертации лид получает статус won"""
        branch = BranchFactory()
        lead = make_lead(branch)
        admin = UserFactory(role="director")
        api_client.force_authenticate(user=admin)

        api_client.post(
            f"/api/v1/leads/{lead.id}/convert/",
            {"branch_id": str(branch.id)},
            format="json",
        )

        lead.refresh_from_db()
        assert lead.status == "won"

    def test_convert_duplicate_phone_returns_400(self, api_client):
        """Конвертация с уже занятым телефоном возвращает 400"""
        branch = BranchFactory()
        phone = "+998902345678"
        # Создаём пользователя с тем же телефоном
        UserFactory(phone=phone, role="student")
        lead = make_lead(branch, phone=phone, name="Duplicate Lead")
        admin = UserFactory(role="director")
        api_client.force_authenticate(user=admin)

        response = api_client.post(
            f"/api/v1/leads/{lead.id}/convert/",
            {"branch_id": str(branch.id)},
            format="json",
        )

        assert response.status_code == 400

    def test_already_won_lead_returns_400(self, api_client):
        """Повторная конвертация уже конвертированного лида возвращает 400"""
        from apps.students.models import StudentLead
        branch = BranchFactory()
        lead = StudentLead.objects.create(
            full_name="Won Lead",
            phone="+998903456789",
            branch=branch,
            status="won",
        )
        admin = UserFactory(role="director")
        api_client.force_authenticate(user=admin)

        response = api_client.post(
            f"/api/v1/leads/{lead.id}/convert/",
            {"branch_id": str(branch.id)},
            format="json",
        )

        assert response.status_code == 400

    def test_convert_creates_user_with_student_role(self, api_client):
        """После конвертации создаётся пользователь с ролью student"""
        from django.contrib.auth import get_user_model
        User = get_user_model()
        branch = BranchFactory()
        lead = make_lead(branch, phone="+998904567890")
        admin = UserFactory(role="director")
        api_client.force_authenticate(user=admin)

        api_client.post(
            f"/api/v1/leads/{lead.id}/convert/",
            {"branch_id": str(branch.id)},
            format="json",
        )

        user = User.objects.filter(phone=lead.phone).first()
        assert user is not None
        assert user.role == "student"

    def test_convert_unauthenticated_returns_401(self, api_client):
        """Неавторизованный запрос возвращает 401"""
        branch = BranchFactory()
        lead = make_lead(branch, phone="+998905678901")

        response = api_client.post(
            f"/api/v1/leads/{lead.id}/convert/",
            {"branch_id": str(branch.id)},
            format="json",
        )

        assert response.status_code == 401

    def test_convert_duplicate_phone_lead_not_marked_won(self, api_client):
        """При ошибке конвертации (дубль телефона) лид НЕ получает статус won"""
        from apps.students.models import StudentLead
        branch = BranchFactory()
        phone = "+998907890123"
        UserFactory(phone=phone, role="student")
        lead = make_lead(branch, phone=phone, name="Lead With Dup Phone")
        admin = UserFactory(role="director")
        api_client.force_authenticate(user=admin)

        response = api_client.post(
            f"/api/v1/leads/{lead.id}/convert/",
            {"branch_id": str(branch.id)},
            format="json",
        )

        assert response.status_code == 400
        lead.refresh_from_db()
        assert lead.status == "new"  # не изменился
