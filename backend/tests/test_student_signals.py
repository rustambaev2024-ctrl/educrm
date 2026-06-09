import pytest
from django.utils import timezone

from tests.factories import StudentFactory, GroupFactory, GroupMembershipFactory

pytestmark = pytest.mark.django_db


class TestCloseMembershipsOnStatusChange:
    """Тесты сигнала close_memberships_on_status_change в students/models.py"""

    def test_expelled_student_closes_active_memberships(self):
        """При отчислении студента активные членства в группах закрываются"""
        student = StudentFactory(status="active")
        group = GroupFactory()
        membership = GroupMembershipFactory(student=student, group=group, left_at=None)

        student.status = "expelled"
        student.save()

        membership.refresh_from_db()
        assert membership.left_at is not None

    def test_archived_student_closes_active_memberships(self):
        """При архивировании студента членства закрываются"""
        student = StudentFactory(status="active")
        group = GroupFactory()
        membership = GroupMembershipFactory(student=student, group=group, left_at=None)

        student.status = "archived"
        student.save()

        membership.refresh_from_db()
        assert membership.left_at is not None

    def test_graduate_student_closes_active_memberships(self):
        """При выпуске студента членства закрываются"""
        student = StudentFactory(status="active")
        group = GroupFactory()
        membership = GroupMembershipFactory(student=student, group=group, left_at=None)

        student.status = "graduate"
        student.save()

        membership.refresh_from_db()
        assert membership.left_at is not None

    def test_frozen_student_does_not_close_memberships(self):
        """Заморозка студента НЕ закрывает членства"""
        student = StudentFactory(status="active")
        group = GroupFactory()
        membership = GroupMembershipFactory(student=student, group=group, left_at=None)

        student.status = "frozen"
        student.save()

        membership.refresh_from_db()
        assert membership.left_at is None

    def test_debtor_status_does_not_close_memberships(self):
        """Смена статуса active→debtor НЕ закрывает членства"""
        student = StudentFactory(status="active")
        group = GroupFactory()
        membership = GroupMembershipFactory(student=student, group=group, left_at=None)

        student.status = "debtor"
        student.save()

        membership.refresh_from_db()
        assert membership.left_at is None

    def test_already_closed_membership_not_updated(self):
        """Уже закрытые членства не изменяются при отчислении"""
        past_time = timezone.now() - timezone.timedelta(days=30)
        student = StudentFactory(status="active")
        group = GroupFactory()
        membership = GroupMembershipFactory(student=student, group=group, left_at=past_time)

        student.status = "expelled"
        student.save()

        membership.refresh_from_db()
        # left_at остался прежним (не сбросился на now())
        delta = abs((membership.left_at - past_time).total_seconds())
        assert delta < 1.0

    def test_multiple_memberships_all_closed(self):
        """При отчислении закрываются ВСЕ активные членства студента"""
        student = StudentFactory(status="active")
        group1 = GroupFactory()
        group2 = GroupFactory()
        group3 = GroupFactory()
        m1 = GroupMembershipFactory(student=student, group=group1, left_at=None)
        m2 = GroupMembershipFactory(student=student, group=group2, left_at=None)
        m3 = GroupMembershipFactory(student=student, group=group3, left_at=None)

        student.status = "expelled"
        student.save()

        for m in (m1, m2, m3):
            m.refresh_from_db()
            assert m.left_at is not None

    def test_other_students_memberships_not_affected(self):
        """Отчисление одного студента не закрывает членства другого"""
        student1 = StudentFactory(status="active")
        student2 = StudentFactory(status="active")
        group = GroupFactory()
        m1 = GroupMembershipFactory(student=student1, group=group, left_at=None)
        m2 = GroupMembershipFactory(student=student2, group=group, left_at=None)

        student1.status = "expelled"
        student1.save()

        m1.refresh_from_db()
        m2.refresh_from_db()
        assert m1.left_at is not None
        assert m2.left_at is None  # другой студент не затронут
