"""Учитель ведёт монеты только своих учеников.

Начислять учитель мог и раньше, а списать — нет: снять ошибочно выданные
монеты было нечем. Список кошельков ему вообще не отдавался (пустой),
а администратор филиала видел кошельки всех филиалов, хотя начислять мог
только своим.
"""
import pytest
from django.contrib.auth import get_user_model

from apps.coins.views import students_in_coin_scope
from apps.courses.models import GroupMembership
from tests.factories import BranchFactory, GroupFactory, StaffFactory, StudentFactory

User = get_user_model()
pytestmark = pytest.mark.django_db


def _teacher_with_student():
    branch = BranchFactory()
    teacher = StaffFactory(branch=branch)
    group = GroupFactory(teacher=teacher, branch=branch)
    student = StudentFactory(branch=branch)
    GroupMembership.objects.create(group=group, student=student)
    return teacher, student


def test_teacher_sees_only_students_of_own_groups():
    teacher, own_student = _teacher_with_student()
    _other_teacher, foreign_student = _teacher_with_student()

    scope = students_in_coin_scope(teacher.user)

    assert own_student in scope
    assert foreign_student not in scope


def test_teacher_scope_is_not_empty():
    """Раньше учителю отдавался пустой список кошельков."""
    teacher, own_student = _teacher_with_student()

    assert students_in_coin_scope(teacher.user).count() == 1


def test_student_who_left_the_group_drops_out_of_scope():
    teacher, student = _teacher_with_student()
    membership = GroupMembership.objects.get(student=student)

    from django.utils import timezone

    membership.left_at = timezone.now()
    membership.save()

    assert student not in students_in_coin_scope(teacher.user)


def test_branch_admin_sees_only_own_branch():
    branch_a = BranchFactory()
    branch_b = BranchFactory()
    admin_user = User.objects.create_user(
        phone="+998905555501",
        full_name="Branch Admin",
        role="branch_admin",
        password="secret123",
    )
    StaffFactory(user=admin_user, branch=branch_a)
    own = StudentFactory(branch=branch_a)
    foreign = StudentFactory(branch=branch_b)

    scope = students_in_coin_scope(admin_user)

    assert own in scope
    assert foreign not in scope


def test_director_sees_everyone():
    director = User.objects.create_user(
        phone="+998905555502",
        full_name="Director",
        role="director",
        password="secret123",
    )
    student = StudentFactory()

    assert student in students_in_coin_scope(director)


def test_parent_and_student_have_no_management_scope():
    parent = User.objects.create_user(
        phone="+998905555503",
        full_name="Parent",
        role="parent",
        password="secret123",
    )
    StudentFactory()

    assert students_in_coin_scope(parent).count() == 0
