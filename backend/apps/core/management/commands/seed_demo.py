from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import connection, transaction
from django.utils import timezone
from django_tenants.utils import schema_context

from apps.accounts.models import User
from apps.audit.models import AuditLog
from apps.chat.models import Chat, ChatParticipant, Message
from apps.courses.models import Course, Group, GroupMembership
from apps.finance.services import apply_payment, get_or_create_wallet
from apps.grades.models import Exam, ExamResult, Grade
from apps.homework.models import Homework, HomeworkStatus
from apps.institutions.models import Branch, Room
from apps.lessons.models import Attendance, Lesson
from apps.notifications.models import Notification
from apps.staff.models import Staff
from apps.students.models import Parent, ParentStudentLink, Student
from apps.tenants.models import Domain, Institution


PASSWORD = "secret123"


class Command(BaseCommand):
    help = "Seed the demo tenant with realistic data for UI integration checks"

    def handle(self, *args, **options):
        institution, created = Institution.objects.get_or_create(
            schema_name="demo",
            defaults={
                "name": "Demo Institution",
                "slug": "demo",
                "address": "Tashkent, Amir Temur 24",
                "phone": "+998900000000",
            },
        )
        if created:
            institution.save()

        Domain.objects.get_or_create(
            domain="demo.localhost",
            defaults={"tenant": institution, "is_primary": True},
        )
        Domain.objects.get_or_create(
            domain="localhost",
            defaults={"tenant": institution, "is_primary": False},
        )

        with schema_context("demo"):
            with transaction.atomic():
                data = self._seed_tenant()

        connection.set_schema_to_public()
        self.stdout.write(
            self.style.SUCCESS(
                "Demo seed complete: "
                f"{data['branches']} branches, {data['rooms']} rooms, "
                f"{data['students']} students, {data['groups']} groups. "
                f"Director login: +998900000002 / {PASSWORD}"
            )
        )

    def _user(self, phone: str, full_name: str, role: str, *, is_staff=False) -> User:
        user, _ = User.objects.get_or_create(
            phone=phone,
            defaults={
                "full_name": full_name,
                "role": role,
                "is_staff": is_staff,
            },
        )
        updates = []
        if user.full_name != full_name:
            user.full_name = full_name
            updates.append("full_name")
        if user.role != role:
            user.role = role
            updates.append("role")
        if user.is_staff != is_staff:
            user.is_staff = is_staff
            updates.append("is_staff")
        user.set_password(PASSWORD)
        user.save(update_fields=["password", *updates] if updates else ["password"])
        return user

    def _staff(
        self,
        phone: str,
        full_name: str,
        role: str,
        branch: Branch | None,
        *,
        salary_percent: Decimal | None = None,
    ) -> Staff:
        user = self._user(phone, full_name, role, is_staff=role in ("director", "admin", "branch_admin"))
        staff, _ = Staff.objects.get_or_create(
            user=user,
            defaults={
                "branch": branch,
                "hire_date": timezone.localdate() - timedelta(days=180),
                "status": "active",
                "salary_percent": salary_percent,
            },
        )
        changed = []
        if staff.branch_id != (branch.id if branch else None):
            staff.branch = branch
            changed.append("branch")
        if salary_percent is not None and staff.salary_percent != salary_percent:
            staff.salary_percent = salary_percent
            changed.append("salary_percent")
        if changed:
            staff.save(update_fields=changed)
        return staff

    def _student(
        self,
        phone: str,
        full_name: str,
        branch: Branch,
        *,
        days_old: int,
        status: str = "active",
        balance: Decimal = Decimal("0.00"),
    ) -> Student:
        user = self._user(phone, full_name, "student")
        student, _ = Student.objects.get_or_create(
            user=user,
            defaults={
                "branch": branch,
                "date_of_birth": timezone.localdate() - timedelta(days=365 * 15 + days_old),
                "status": status,
                "wallet_balance": balance,
                "notes": "Demo profile for integration testing.",
            },
        )
        updates = []
        if student.branch_id != branch.id:
            student.branch = branch
            updates.append("branch")
        if student.status != status:
            student.status = status
            updates.append("status")
        if student.wallet_balance != balance:
            student.wallet_balance = balance
            updates.append("wallet_balance")
        if updates:
            student.save(update_fields=updates)

        wallet = get_or_create_wallet(student)
        if wallet.balance != student.wallet_balance:
            wallet.balance = student.wallet_balance
            wallet.save(update_fields=["balance", "updated_at"])
        return student

    def _seed_tenant(self):
        today = timezone.localdate()
        now = timezone.now()

        main, _ = Branch.objects.get_or_create(
            name="Main Campus",
            defaults={
                "address": "Tashkent, Yunusabad 12",
                "phone": "+998901112233",
                "status": "active",
            },
        )
        west, _ = Branch.objects.get_or_create(
            name="West Branch",
            defaults={
                "address": "Tashkent, Chilanzar 8",
                "phone": "+998907778899",
                "status": "active",
            },
        )

        rooms = []
        for branch, names in (
            (main, [("Room 101", 16), ("Speaking Lab", 12), ("Exam Hall", 24)]),
            (west, [("Room A", 14), ("Room B", 18)]),
        ):
            for name, capacity in names:
                room, _ = Room.objects.get_or_create(
                    branch=branch,
                    name=name,
                    defaults={"capacity": capacity, "is_active": True},
                )
                rooms.append(room)

        director = self._staff("+998900000002", "Director User", "director", main)
        admin = self._staff("+998900000003", "Branch Admin", "admin", main)
        teacher = self._staff(
            "+998900000004",
            "Teacher User",
            "teacher",
            main,
            salary_percent=Decimal("40.00"),
        )
        second_teacher = self._staff(
            "+998900000014",
            "Madina English Teacher",
            "teacher",
            west,
            salary_percent=Decimal("35.00"),
        )

        parent_user = self._user("+998900000006", "Parent User", "parent")
        parent, _ = Parent.objects.get_or_create(user=parent_user)

        students = [
            self._student("+998900000005", "Student User", main, days_old=10, balance=Decimal("260000.00")),
            self._student("+998900000015", "Aziz Karimov", main, days_old=45, balance=Decimal("120000.00")),
            self._student(
                "+998900000016",
                "Malika Sobirova",
                main,
                days_old=75,
                balance=Decimal("-90000.00"),
                status="debtor",
            ),
            self._student("+998900000017", "Timur Akhmedov", west, days_old=110, balance=Decimal("0.00")),
            self._student("+998900000018", "Sofia Lee", west, days_old=140, balance=Decimal("450000.00")),
        ]
        for child in students[:3]:
            ParentStudentLink.objects.get_or_create(parent=parent, student=child)

        english, _ = Course.objects.get_or_create(
            name="English Advanced",
            defaults={"description": "Speaking, grammar and exam practice.", "created_by": director.user},
        )
        math, _ = Course.objects.get_or_create(
            name="Math Foundation",
            defaults={"description": "Core algebra and problem solving.", "created_by": director.user},
        )

        group_a, _ = Group.objects.get_or_create(
            name="ENG-A1 Morning",
            defaults={
                "course": english,
                "branch": main,
                "teacher": teacher,
                "room": rooms[0],
                "capacity": 12,
                "start_date": today - timedelta(days=28),
                "end_date": today + timedelta(days=90),
                "monthly_price": Decimal("600000.00"),
                "status": "active",
                "schedule": [
                    {"day": 0, "start": "09:00", "end": "10:30"},
                    {"day": 2, "start": "09:00", "end": "10:30"},
                    {"day": 4, "start": "09:00", "end": "10:30"},
                ],
            },
        )
        group_b, _ = Group.objects.get_or_create(
            name="MATH-B2 Evening",
            defaults={
                "course": math,
                "branch": west,
                "teacher": second_teacher,
                "room": rooms[3],
                "capacity": 14,
                "start_date": today - timedelta(days=14),
                "end_date": today + timedelta(days=120),
                "monthly_price": Decimal("500000.00"),
                "status": "active",
                "schedule": [
                    {"day": 1, "start": "17:00", "end": "18:30"},
                    {"day": 3, "start": "17:00", "end": "18:30"},
                ],
            },
        )

        for student in students[:3]:
            GroupMembership.objects.get_or_create(group=group_a, student=student, defaults={"enrolled_by": admin.user})
        for student in students[3:]:
            GroupMembership.objects.get_or_create(group=group_b, student=student, defaults={"enrolled_by": admin.user})

        lessons = []
        for index, days in enumerate([-9, -7, -5, 1, 3, 5]):
            lesson, _ = Lesson.objects.get_or_create(
                group=group_a,
                datetime=now + timedelta(days=days),
                defaults={
                    "room": rooms[0],
                    "teacher": teacher,
                    "topic": f"Speaking practice #{index + 1}",
                    "status": "conducted" if days < 0 else "scheduled",
                },
            )
            lessons.append(lesson)
        for index, days in enumerate([-6, -4, 2, 4]):
            Lesson.objects.get_or_create(
                group=group_b,
                datetime=now + timedelta(days=days),
                defaults={
                    "room": rooms[3],
                    "teacher": second_teacher,
                    "topic": f"Algebra session #{index + 1}",
                    "status": "conducted" if days < 0 else "scheduled",
                },
            )

        for lesson in lessons[:3]:
            for idx, student in enumerate(students[:3]):
                Attendance.objects.get_or_create(
                    lesson=lesson,
                    student=student,
                    defaults={
                        "status": (
                            "late"
                            if idx == 1
                            else ("absent" if idx == 2 and lesson == lessons[1] else "present")
                        ),
                        "late_minutes": 8 if idx == 1 else None,
                        "comment": "Demo attendance",
                        "recorded_by": teacher.user,
                    },
                )

        for student, amount in (
            (students[0], Decimal("600000.00")),
            (students[1], Decimal("300000.00")),
            (students[2], Decimal("50000.00")),
            (students[4], Decimal("500000.00")),
        ):
            if not student.payments.filter(comment="Demo monthly payment").exists():
                apply_payment(
                    student=student,
                    payment_type="top_up",
                    amount=amount,
                    created_by=admin.user,
                    group=group_a if student in students[:3] else group_b,
                    comment="Demo monthly payment",
                )

        homework, _ = Homework.objects.get_or_create(
            title="Unit 4 speaking homework",
            group=group_a,
            defaults={
                "description": "Record a 2 minute answer and upload notes.",
                "deadline": now + timedelta(days=2),
                "assign_type": "group",
                "created_by": teacher.user,
            },
        )
        for idx, student in enumerate(students[:3]):
            status_value = ["submitted", "checked", "not_submitted"][idx]
            HomeworkStatus.objects.get_or_create(
                homework=homework,
                student=student,
                defaults={
                    "status": status_value,
                    "answer_text": "Demo answer" if status_value != "not_submitted" else "",
                    "submitted_at": now - timedelta(days=1) if status_value != "not_submitted" else None,
                    "grade": 92 if status_value == "checked" else None,
                    "teacher_comment": "Strong answer" if status_value == "checked" else "",
                    "checked_by": teacher.user if status_value == "checked" else None,
                    "checked_at": now if status_value == "checked" else None,
                },
            )

        for student, score, kind in (
            (students[0], 88, "lesson"),
            (students[1], 92, "homework"),
            (students[2], 76, "activity"),
        ):
            Grade.objects.get_or_create(
                student=student,
                group=group_a,
                grade_type=kind,
                comment="Demo grade",
                defaults={"score": score, "graded_by": teacher.user, "lesson": lessons[0]},
            )

        exam, _ = Exam.objects.get_or_create(
            group=group_a,
            name="Monthly Checkpoint",
            defaults={"date": today + timedelta(days=7), "max_score": 100, "created_by": teacher.user},
        )
        for student, score in ((students[0], 90), (students[1], 84), (students[2], 71)):
            ExamResult.objects.get_or_create(
                exam=exam,
                student=student,
                defaults={
                    "score": score,
                    "pass_status": "passed",
                    "comment": "Seed result",
                    "recorded_by": teacher.user,
                },
            )

        chat, _ = Chat.objects.get_or_create(
            group=group_a,
            defaults={"chat_type": "group_chat", "name": group_a.name},
        )
        for user, role in [(teacher.user, "admin"), *[(student.user, "member") for student in students[:3]]]:
            ChatParticipant.objects.get_or_create(chat=chat, user=user, defaults={"role": role})
        if not chat.messages.filter(text="Welcome to ENG-A1 Morning").exists():
            Message.objects.create(
                chat=chat,
                sender=teacher.user,
                message_type="text",
                text="Welcome to ENG-A1 Morning",
            )

        Notification.objects.get_or_create(
            recipient=director.user,
            notification_type="new_student",
            title="Demo data loaded",
            body="Demo branch, groups, students and finance records are ready.",
            related_object_type="Seed",
            related_object_id="demo",
        )
        Notification.objects.get_or_create(
            recipient=teacher.user,
            notification_type="new_homework",
            title="Homework assigned",
            body="Unit 4 speaking homework is visible to your students.",
            related_object_type="Homework",
            related_object_id=str(homework.id),
        )

        for action, entity, entity_id in (
            ("create", "Branch", main.id),
            ("create", "Group", group_a.id),
            ("payment", "Payment", students[0].id),
        ):
            AuditLog.objects.get_or_create(
                action=action,
                entity_type=entity,
                entity_id=str(entity_id),
                defaults={
                    "user": director.user,
                    "user_role": "director",
                    "ip_address": "127.0.0.1",
                    "user_agent": "seed_demo",
                },
            )

        return {
            "branches": Branch.objects.count(),
            "rooms": Room.objects.count(),
            "students": Student.objects.count(),
            "groups": Group.objects.count(),
        }
