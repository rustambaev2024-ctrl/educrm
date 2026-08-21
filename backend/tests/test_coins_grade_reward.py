from datetime import date

import pytest
from django.contrib.auth import get_user_model

from apps.coins.models import CoinSetting, CoinTransaction, CoinWallet
from apps.courses.models import Course, Group, GroupMembership
from apps.grades.models import Grade
from apps.institutions.models import Branch
from apps.staff.models import Staff
from apps.students.models import Student

User = get_user_model()
pytestmark = pytest.mark.django_db


def _setup_student():
    branch = Branch.objects.create(name="Main", address="A", phone="+998901000001")
    director = User.objects.create_user(phone="+998909300001", full_name="Director", role="director", password="secret123")
    teacher_user = User.objects.create_user(phone="+998909300002", full_name="Teacher", role="teacher", password="secret123")
    teacher = Staff.objects.create(user=teacher_user, branch=branch)
    student_user = User.objects.create_user(phone="+998909300003", full_name="Student", role="student", password="secret123")
    student = Student.objects.create(user=student_user, branch=branch)
    course = Course.objects.create(name="Biology", created_by=director)
    group = Group.objects.create(
        name="BIO-02", course=course, branch=branch, teacher=teacher,
        start_date=date(2026, 8, 1), monthly_price="400000.00", status="active", schedule=[],
    )
    GroupMembership.objects.create(group=group, student=student, enrolled_by=director)
    return student, group, teacher_user


def test_perfect_grade_awards_perfect_coins():
    student, group, teacher_user = _setup_student()
    setting = CoinSetting.get_or_create_default()
    Grade.objects.create(student=student, group=group, grade_type="lesson", score=5, graded_by=teacher_user)
    wallet = CoinWallet.objects.get(student=student)
    tx = CoinTransaction.objects.filter(wallet=wallet, reason="grade").first()
    assert tx is not None, "оценка 5 обязана начислить монеты"
    assert tx.amount == setting.coins_grade_perfect


def test_good_grade_awards_good_coins():
    student, group, teacher_user = _setup_student()
    setting = CoinSetting.get_or_create_default()
    Grade.objects.create(student=student, group=group, grade_type="lesson", score=4, graded_by=teacher_user)
    wallet = CoinWallet.objects.get(student=student)
    tx = CoinTransaction.objects.filter(wallet=wallet, reason="grade").first()
    assert tx is not None, "оценка 4 обязана начислить монеты"
    assert tx.amount == setting.coins_grade_good


@pytest.mark.parametrize("score", [2, 3])
def test_low_grade_awards_nothing(score):
    student, group, teacher_user = _setup_student()
    Grade.objects.create(student=student, group=group, grade_type="lesson", score=score, graded_by=teacher_user)
    wallet = CoinWallet.objects.get(student=student)
    assert not CoinTransaction.objects.filter(wallet=wallet, reason="grade").exists()


def test_homework_grade_now_reaches_the_reward_rule():
    """Баг из аудита: раньше score_pct>=80 сравнивался с уже испорченным
    числом (8 из 10 хранилось как 8 из 100), и монеты за отличную домашку
    почти никогда не начислялись. После перехода на 2-5 сравнение честное."""
    student, group, teacher_user = _setup_student()
    setting = CoinSetting.get_or_create_default()
    Grade.objects.create(student=student, group=group, grade_type="homework", score=5, graded_by=teacher_user)
    wallet = CoinWallet.objects.get(student=student)
    tx = CoinTransaction.objects.filter(wallet=wallet, reason="grade").first()
    assert tx is not None
    assert tx.amount == setting.coins_grade_perfect
