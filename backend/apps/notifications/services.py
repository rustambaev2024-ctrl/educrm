from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db.models import QuerySet

from apps.students.models import Parent

from .models import Notification


class NotificationService:
    @staticmethod
    def _serialize(notification: Notification) -> dict:
        return {
            "id": str(notification.id),
            "notification_type": notification.notification_type,
            "title": notification.title,
            "body": notification.body,
            "related_object_type": notification.related_object_type,
            "related_object_id": notification.related_object_id,
            "is_read": notification.is_read,
            "created_at": notification.created_at.isoformat(),
            "read_at": notification.read_at.isoformat() if notification.read_at else None,
        }

    @staticmethod
    def _push(notification: Notification):
        channel_layer = get_channel_layer()
        if channel_layer is None:
            return
        user_group = f"notifications_{notification.recipient_id}"
        async_to_sync(channel_layer.group_send)(
            user_group,
            {
                "type": "notification.new",
                "notification": NotificationService._serialize(notification),
            },
        )
        unread_count = Notification.objects.filter(
            recipient_id=notification.recipient_id,
            is_read=False,
        ).count()
        async_to_sync(channel_layer.group_send)(
            user_group,
            {"type": "notification.count", "unread_count": unread_count},
        )

    @staticmethod
    def notify(
        recipients: list,
        notification_type: str,
        title: str,
        body: str,
        *,
        related_object_type: str = "",
        related_object_id: str = "",
    ):
        unique_users = {user.id: user for user in recipients if user is not None}
        notifications = [
            Notification(
                recipient=user,
                notification_type=notification_type,
                title=title,
                body=body,
                related_object_type=related_object_type,
                related_object_id=related_object_id,
            )
            for user in unique_users.values()
        ]
        created = Notification.objects.bulk_create(notifications)
        for notification in created:
            NotificationService._push(notification)
        return created

    @staticmethod
    def on_lesson_cancelled(lesson):
        active_students = [
            membership.student
            for membership in (
                lesson.group.memberships.filter(left_at__isnull=True).select_related(
                    "student__user"
                )
            )
        ]
        student_users = [student.user for student in active_students]
        parent_user_objects = [
            parent.user
            for parent in (
                Parent.objects.filter(children__in=active_students)
                .select_related("user")
                .distinct()
            )
        ]
        recipients = student_users + parent_user_objects
        if lesson.group.teacher and lesson.group.teacher.user:
            recipients.append(lesson.group.teacher.user)
        NotificationService.notify(
            recipients=recipients,
            notification_type="lesson_cancelled",
            title="Dars bekor qilindi",
            body=f"{lesson.group.name} guruhi uchun dars bekor qilindi.",
            related_object_type="Lesson",
            related_object_id=str(lesson.id),
        )

    @staticmethod
    def on_new_homework(homework):
        if homework.assign_type == "individual" and homework.individual_student:
            students = [homework.individual_student]
        else:
            students = [
                membership.student
                for membership in (
                    homework.group.memberships.filter(left_at__isnull=True).select_related(
                        "student__user"
                    )
                )
            ]
        student_users = [student.user for student in students]
        parent_users = [
            parent.user
            for parent in (
                Parent.objects.filter(children__in=students).select_related("user").distinct()
            )
        ]
        NotificationService.notify(
            recipients=student_users + parent_users,
            notification_type="new_homework",
            title="Yangi uy vazifasi",
            body=f"Yangi uy vazifasi berildi: {homework.title}",
            related_object_type="Homework",
            related_object_id=str(homework.id),
        )

    @staticmethod
    def unread_queryset_for_user(user) -> QuerySet:
        return Notification.objects.filter(recipient=user, is_read=False)
