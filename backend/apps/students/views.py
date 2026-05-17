import logging
from django.db import transaction
from django.db.models import Q
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.accounts.permissions import IsBranchAdmin, IsTeacher
from apps.finance.serializers import PaymentSerializer
from apps.lessons.serializers import AttendanceSerializer

from apps.students.meta_conversions import send_lead_event

from .models import Parent, Student, StudentLead
from .serializers import (
    CertificateSerializer,
    ParentSerializer,
    StudentDocumentSerializer,
    StudentLeadSerializer,
    StudentSerializer,
)


class StudentViewSet(viewsets.ModelViewSet):
    queryset = Student.objects.select_related("user", "branch").all()
    serializer_class = StudentSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_permissions(self):
        if self.action in ("list", "retrieve", "attendance_history", "payments_history"):
            permission_classes = [permissions.IsAuthenticated]
        else:
            permission_classes = [IsBranchAdmin]
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()
        if not user.is_authenticated:
            return qs.none()

        if user.role in ("superadmin", "director"):
            scoped = qs
        elif user.role in ("admin", "branch_admin", "teacher") and hasattr(user, "staff_profile"):
            branch_id = user.staff_profile.branch_id
            scoped = qs.filter(branch_id=branch_id) if branch_id else qs.none()
        elif user.role == "student" and hasattr(user, "student_profile"):
            scoped = qs.filter(id=user.student_profile.id)
        elif user.role == "parent" and hasattr(user, "parent_profile"):
            scoped = qs.filter(parents=user.parent_profile)
        else:
            scoped = qs.none()

        params = self.request.query_params
        if params.get("branch_id"):
            scoped = scoped.filter(branch_id=params["branch_id"])
        if params.get("status"):
            scoped = scoped.filter(status=params["status"])
        if params.get("group_id"):
            scoped = scoped.filter(
                group_memberships__group_id=params["group_id"],
                group_memberships__left_at__isnull=True,
            )
        if params.get("search"):
            value = params["search"].strip()
            scoped = scoped.filter(
                Q(user__full_name__icontains=value)
                | Q(user__phone__icontains=value)
            )
        return scoped.distinct().order_by("-registered_at")

    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        student = self.get_object()
        user = student.user
        delete_parent = request.query_params.get("delete_parent", "").lower() == "true"

        parent_user_to_delete = None
        if delete_parent:
            from .models import Parent, ParentStudentLink
            links = ParentStudentLink.objects.filter(student=student).select_related("parent__user")
            for link in links:
                parent = link.parent
                # Only delete if this parent has no other children
                other_children = ParentStudentLink.objects.filter(parent=parent).exclude(student=student).count()
                if other_children == 0:
                    parent_user_to_delete = parent.user
                    parent.delete()

        student.delete()
        user.delete()
        if parent_user_to_delete:
            parent_user_to_delete.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(
        detail=True,
        methods=["post"],
        url_path="documents",
        parser_classes=[MultiPartParser, FormParser, JSONParser],
    )
    def upload_document(self, request, pk=None):
        student = self.get_object()
        serializer = StudentDocumentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(student=student, uploaded_by=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(
        detail=True,
        methods=["post"],
        url_path="certificate",
        parser_classes=[MultiPartParser, FormParser, JSONParser],
    )
    def attach_certificate(self, request, pk=None):
        student = self.get_object()
        serializer = CertificateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(student=student, issued_by=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path="attendance")
    def attendance_history(self, request, pk=None):
        student = self.get_object()
        attendance_qs = student.attendance.select_related("lesson", "lesson__group")

        params = request.query_params
        if params.get("group_id"):
            attendance_qs = attendance_qs.filter(lesson__group_id=params["group_id"])
        if params.get("date_from"):
            attendance_qs = attendance_qs.filter(lesson__datetime__date__gte=params["date_from"])
        if params.get("date_to"):
            attendance_qs = attendance_qs.filter(lesson__datetime__date__lte=params["date_to"])

        total = attendance_qs.count()
        present_count = attendance_qs.filter(status__in=["present", "late", "online"]).count()
        percent = round((present_count * 100 / total), 2) if total > 0 else 0

        serializer = AttendanceSerializer(attendance_qs.order_by("-lesson__datetime"), many=True)
        return Response(
            {
                "student_id": str(student.id),
                "total": total,
                "present": present_count,
                "attendance_percent": percent,
                "records": serializer.data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["get"], url_path="payments")
    def payments_history(self, request, pk=None):
        student = self.get_object()
        payments = student.payments.select_related("lesson", "group", "created_by")
        serializer = PaymentSerializer(payments, many=True)
        return Response(
            {
                "student_id": str(student.id),
                "wallet_balance": str(student.wallet_balance),
                "payments": serializer.data,
            },
            status=status.HTTP_200_OK,
        )


class ParentViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Parent.objects.select_related("user").prefetch_related("children").all()
    serializer_class = ParentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()
        if not user.is_authenticated:
            return qs.none()

        if user.role in ("superadmin", "director"):
            scoped = qs
        elif user.role in ("admin", "branch_admin", "teacher") and hasattr(user, "staff_profile"):
            branch_id = user.staff_profile.branch_id
            scoped = qs.filter(children__branch_id=branch_id) if branch_id else qs.none()
        elif user.role == "parent" and hasattr(user, "parent_profile"):
            scoped = qs.filter(id=user.parent_profile.id)
        elif user.role == "student" and hasattr(user, "student_profile"):
            scoped = qs.filter(children=user.student_profile)
        else:
            scoped = qs.none()

        search = self.request.query_params.get("search")
        if search:
            scoped = scoped.filter(
                Q(user__full_name__icontains=search.strip())
                | Q(user__phone__icontains=search.strip())
            )
        return scoped.distinct().order_by("user__full_name")


class StudentLeadViewSet(viewsets.ModelViewSet):
    queryset = StudentLead.objects.select_related("branch", "interested_course", "created_by").all()
    serializer_class = StudentLeadSerializer
    permission_classes = [IsBranchAdmin]

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()
        if not user.is_authenticated:
            return qs.none()

        if user.role in ("superadmin", "director"):
            scoped = qs
        elif user.role in ("admin", "branch_admin") and hasattr(user, "staff_profile"):
            branch_id = user.staff_profile.branch_id
            scoped = qs.filter(branch_id=branch_id) if branch_id else qs.none()
        else:
            scoped = qs.none()

        params = self.request.query_params
        if params.get("branch_id"):
            scoped = scoped.filter(branch_id=params["branch_id"])
        if params.get("course_id"):
            scoped = scoped.filter(interested_course_id=params["course_id"])
        if params.get("status"):
            scoped = scoped.filter(status=params["status"])
        if params.get("search"):
            value = params["search"].strip()
            scoped = scoped.filter(
                Q(full_name__icontains=value)
                | Q(phone__icontains=value)
                | Q(notes__icontains=value)
            )
        return scoped.distinct().order_by("-created_at")

    def perform_create(self, serializer):
        user = self.request.user
        branch = serializer.validated_data.get("branch")
        if not branch and hasattr(user, "staff_profile") and user.staff_profile.branch_id:
            serializer.save(created_by=user, branch=user.staff_profile.branch)
            return
        serializer.save(created_by=user)

    @action(detail=True, methods=["post"], url_path="convert")
    def convert_to_student(self, request, pk=None):
        lead = self.get_object()

        if lead.status == "won":
            return Response({"detail": "Lead already converted"}, status=status.HTTP_400_BAD_REQUEST)

        from apps.accounts.models import User
        import secrets

        data = request.data
        password = data.get("password") or secrets.token_urlsafe(8)
        full_name = data.get("full_name", lead.full_name)
        phone = data.get("phone", lead.phone)
        branch_id = data.get("branch_id", getattr(lead.branch, "id", None))
        birth_date = data.get("date_of_birth")

        # Create Student User
        user = User.objects.create_user(
            phone=phone,
            full_name=full_name,
            password=password,
            role="student",
        )

        # Create Student
        student = Student.objects.create(
            user=user,
            branch_id=branch_id,
            date_of_birth=birth_date,
        )

        # Handle Parent
        parent_name = data.get("parent_name")
        parent_phone = data.get("parent_phone")
        if parent_name and parent_phone:
            parent_password = data.get("parent_password") or secrets.token_urlsafe(8)
            parent_user = User.objects.filter(phone=parent_phone, role="parent").first()
            if not parent_user:
                parent_user = User.objects.create_user(
                    phone=parent_phone,
                    full_name=parent_name,
                    password=parent_password,
                    role="parent",
                )
            parent_profile, _ = Parent.objects.get_or_create(user=parent_user)
            from .models import ParentStudentLink
            ParentStudentLink.objects.get_or_create(parent=parent_profile, student=student)

        # Mark lead as won
        lead.status = "won"
        lead.save(update_fields=["status", "updated_at"])

        meta_sent = False
        try:
            institution = request.tenant
            if hasattr(institution, "meta_pixel_id") and institution.meta_pixel_id:
                meta_sent = send_lead_event(
                    pixel_id=institution.meta_pixel_id,
                    access_token=institution.meta_access_token,
                    phone=lead.phone,
                    lead_id=str(lead.id),
                )
        except Exception as e:
            logger = logging.getLogger(__name__)
            logger.error(f"Meta event error: {e}")

        return Response({
            "student_id": str(student.id),
            "password": password,
            "meta_event_sent": meta_sent,
        })
