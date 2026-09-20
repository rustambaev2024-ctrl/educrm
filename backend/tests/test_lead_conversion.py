import pytest
from tests.factories import BranchFactory, StaffFactory, StudentFactory, UserFactory

pytestmark = pytest.mark.django_db(transaction=True)


def make_lead(branch, phone="+998901234567", name="Test Lead"):
    from apps.students.models import StudentLead
    return StudentLead.objects.create(
        full_name=name,
        phone=phone,
        branch=branch,
        status="new",
    )


class TestLinkLeadToExistingStudent:
    """Связывание заявки с уже заведённым вручную учеником.

    Ученика нередко создают на странице «Ученики» раньше, чем вспоминают
    про карточку заявки. Раньше это был тупик: доска пускает в «won»
    только через конвертацию, а конвертация упиралась в занятый телефон.
    Заявка не могла стать выигранной никогда — а вместе с ней не уходили
    ни «Purchase» в Meta, ни продажа в LeadPixel.
    """

    def test_duplicate_phone_of_real_student_offers_linking(self, api_client):
        """Телефон занят настоящим учеником — 409 с его карточкой, не глухой отказ"""
        branch = BranchFactory()
        student = StudentFactory(branch=branch)
        lead = make_lead(branch, phone=student.user.phone, name="Same Person")
        api_client.force_authenticate(user=UserFactory(role="director"))

        response = api_client.post(
            f"/api/v1/leads/{lead.id}/convert/",
            {"branch_id": str(branch.id)},
            format="json",
        )

        assert response.status_code == 409
        assert response.data["existing_student"]["id"] == str(student.id)
        assert response.data["existing_student"]["full_name"] == student.user.full_name

    def test_link_marks_lead_won_and_stores_link(self, api_client):
        """Связывание закрывает заявку и проставляет связь — без нового ученика"""
        from apps.students.models import Student

        branch = BranchFactory()
        student = StudentFactory(branch=branch)
        lead = make_lead(branch, phone=student.user.phone)
        api_client.force_authenticate(user=UserFactory(role="director"))
        before = Student.objects.count()

        response = api_client.post(
            f"/api/v1/leads/{lead.id}/convert/",
            {"link_student_id": str(student.id)},
            format="json",
        )

        assert response.status_code == 200
        assert response.data["linked"] is True
        lead.refresh_from_db()
        assert lead.status == "won"
        assert lead.converted_student_id == student.id
        # Главное: дубля не появилось.
        assert Student.objects.count() == before

    def test_link_refuses_student_from_another_branch(self, api_client):
        """Администратор филиала не может привязать чужого ученика.

        Ручка принимает id ученика напрямую — ровно тот вид ручки, через
        который в этом проекте уже утекал доступ между филиалами.
        """
        own_branch = BranchFactory()
        other_branch = BranchFactory()
        stranger = StudentFactory(branch=other_branch)
        lead = make_lead(own_branch)

        admin = UserFactory(role="branch_admin")
        StaffFactory(user=admin, branch=own_branch)
        api_client.force_authenticate(user=admin)

        response = api_client.post(
            f"/api/v1/leads/{lead.id}/convert/",
            {"link_student_id": str(stranger.id)},
            format="json",
        )

        assert response.status_code == 404
        lead.refresh_from_db()
        assert lead.converted_student_id is None
        assert lead.status != "won"

    def test_link_refuses_student_already_linked_to_another_lead(self, api_client):
        """Один ученик — одна выигранная заявка.

        Поле converted_student — обычный ForeignKey, так что без этой
        проверки два лида на одного ребёнка отправили бы в LeadPixel две
        продажи и завысили бы окупаемость рекламы вдвое.
        """
        from apps.students.models import StudentLead

        branch = BranchFactory()
        student = StudentFactory(branch=branch)
        StudentLead.objects.create(
            full_name="First Lead",
            phone="+998909999001",
            branch=branch,
            status="won",
            converted_student=student,
        )
        second = make_lead(branch, phone="+998909999002", name="Second Lead")
        api_client.force_authenticate(user=UserFactory(role="director"))

        response = api_client.post(
            f"/api/v1/leads/{second.id}/convert/",
            {"link_student_id": str(student.id)},
            format="json",
        )

        assert response.status_code == 409
        second.refresh_from_db()
        assert second.status != "won"


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
