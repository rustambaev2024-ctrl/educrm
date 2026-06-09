import factory
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.utils import timezone


class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = get_user_model()

    phone = factory.Sequence(lambda n: f"+998900000{n:03d}")
    full_name = factory.Sequence(lambda n: f"User {n}")
    role = "teacher"
    is_active = True


class BranchFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "institutions.Branch"

    name = factory.Sequence(lambda n: f"Branch {n}")
    address = "Toshkent, test ko'chasi"
    phone = factory.Sequence(lambda n: f"+998901{n:06d}")
    status = "active"


class CourseFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "courses.Course"

    name = factory.Sequence(lambda n: f"Course {n}")


class StaffFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "staff.Staff"

    user = factory.SubFactory(UserFactory, role="teacher")
    branch = factory.SubFactory(BranchFactory)
    salary_percent = Decimal("30.00")
    status = "active"


class GroupFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "courses.Group"

    name = factory.Sequence(lambda n: f"Group {n}")
    course = factory.SubFactory(CourseFactory)
    teacher = factory.SubFactory(StaffFactory)
    branch = factory.SubFactory(BranchFactory)
    status = "active"
    monthly_price = Decimal("500000.00")
    # schedule: list of dicts with "day" (0=Mon...6=Sun) matching Python weekday()
    schedule = [{"day": 0}, {"day": 2}, {"day": 4}]  # Mon, Wed, Fri
    start_date = factory.LazyFunction(lambda: timezone.now().date())


class StudentFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "students.Student"

    user = factory.SubFactory(UserFactory, role="student")
    branch = factory.SubFactory(BranchFactory)
    status = "active"
    wallet_balance = Decimal("0.00")


class WalletFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "finance.Wallet"

    student = factory.SubFactory(StudentFactory)
    balance = Decimal("0.00")


class PaymentFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "finance.Payment"

    student = factory.SubFactory(StudentFactory)
    wallet = factory.LazyAttribute(lambda o: o.student.wallet if hasattr(o.student, "wallet") else None)
    payment_type = "top_up"
    amount = Decimal("100000.00")
    balance_before = Decimal("0.00")
    balance_after = Decimal("100000.00")
    branch = factory.SubFactory(BranchFactory)


class LessonFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "lessons.Lesson"

    group = factory.SubFactory(GroupFactory)
    datetime = factory.LazyFunction(timezone.now)
    status = "scheduled"


class GroupMembershipFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "courses.GroupMembership"

    group = factory.SubFactory(GroupFactory)
    student = factory.SubFactory(StudentFactory)
    left_at = None
