def get_support_teacher_group_ids(user):
    """Возвращает ID групп доступных support teacher"""
    from apps.staff.models import SupportTeacherLink
    from apps.courses.models import Group

    teacher_ids = SupportTeacherLink.objects.filter(
        support_teacher=user
    ).values_list("teacher_id", flat=True)

    return list(
        Group.objects.filter(teacher_id__in=teacher_ids)
        .values_list("id", flat=True)
    )
