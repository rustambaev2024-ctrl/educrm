import logging
from django.db import transaction
from django.db.models import Q
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes, throttle_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

from apps.accounts.permissions import IsBranchAdmin, IsTeacher
from apps.finance.serializers import PaymentSerializer
from apps.lessons.serializers import AttendanceSerializer

from apps.students.meta_conversions import send_lead_event

from .models import Parent, ParentLinkCode, Student, StudentLead
from .serializers import (
    CertificateSerializer,
    ParentSerializer,
    StudentDocumentSerializer,
    StudentLeadSerializer,
    StudentSerializer,
)


logger = logging.getLogger(__name__)


class LeadSubmitThrottle(AnonRateThrottle):
    rate = "10/hour"


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([LeadSubmitThrottle])
def public_submit_lead(request):
    """
    Public endpoint — accepts lead submissions from the landing page.
    No authentication required. Tenant is resolved via X-Tenant-Schema header.
    """
    data = request.data
    full_name = (data.get("full_name") or "").strip()
    phone = (data.get("phone") or "").strip()
    source = data.get("source", "other")
    notes = (data.get("notes") or "").strip()
    interested_course_id = data.get("interested_course") or None

    if not full_name or not phone:
        return Response(
            {"detail": "full_name and phone are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Validate source
    valid_sources = {"walk_in", "phone", "telegram", "instagram", "referral", "other"}
    if source not in valid_sources:
        source = "other"

    lead_data = {
        "full_name": full_name,
        "phone": phone,
        "source": source,
        "notes": notes,
        "status": "new",
    }
    if interested_course_id:
        lead_data["interested_course_id"] = interested_course_id

    # Try to assign to first branch if available
    from apps.institutions.models import Branch
    first_branch = Branch.objects.first()
    if first_branch:
        lead_data["branch"] = first_branch

    lead = StudentLead.objects.create(**lead_data)

    # Fire Meta "Lead" event
    try:
        institution = getattr(request, "tenant", None)
        if institution and hasattr(institution, "meta_pixel_id") and institution.meta_pixel_id:
            send_lead_event(
                pixel_id=institution.meta_pixel_id,
                access_token=institution.meta_access_token,
                phone=phone,
                lead_id=str(lead.id),
            )
    except Exception as e:
        logger.error(f"Meta Lead event error on public submit: {e}")

    return Response(
        {"id": str(lead.id), "status": "ok"},
        status=status.HTTP_201_CREATED,
    )


class StudentPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 200


class StudentViewSet(viewsets.ModelViewSet):
    queryset = Student.objects.select_related("user", "branch").all()
    serializer_class = StudentSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    pagination_class = StudentPagination

    def get_permissions(self):
        if self.action in ("list", "retrieve", "attendance_history", "payments_history"):
            permission_classes = [permissions.IsAuthenticated]
        else:
            permission_classes = [IsBranchAdmin]
        return [permission() for permission in permission_classes]

    def perform_create(self, serializer):
        user = self.request.user
        # Если branch не пришёл с формы — подставляем филиал из профиля сотрудника,
        # чтобы ученик не остался без филиала и был виден в списках.
        if serializer.validated_data.get("branch"):
            serializer.save()
            return
        branch = None
        if hasattr(user, "staff_profile") and user.staff_profile.branch_id:
            branch = user.staff_profile.branch
        serializer.save(branch=branch)

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

    @action(detail=True, methods=["post"], url_path="assign-parent")
    @transaction.atomic
    def assign_parent(self, request, pk=None):
        student = self.get_object()
        data = request.data
        parent_id = data.get("parent_id")
        parent_name = data.get("parent_name")
        parent_phone = data.get("parent_phone")
        parent_password = data.get("parent_password")

        from apps.students.models import Parent, ParentStudentLink
        from apps.accounts.models import User
        import secrets

        parent = None

        if parent_id:
            try:
                parent = Parent.objects.get(id=parent_id)
            except Parent.DoesNotExist:
                return Response({"detail": "Parent not found."}, status=status.HTTP_404_NOT_FOUND)
        elif parent_phone:
            from apps.accounts.managers import UserManager
            normalized_phone = UserManager.normalize_phone(parent_phone)
            
            # Check if user already exists
            user = User.objects.filter(phone=normalized_phone).first()
            if user:
                if user.role != "parent":
                    return Response(
                        {"detail": f"User with phone {parent_phone} exists but has role '{user.role}' instead of parent."},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                parent, _ = Parent.objects.get_or_create(user=user)
            else:
                if not parent_name:
                    return Response({"detail": "parent_name is required to create a new parent."}, status=status.HTTP_400_BAD_REQUEST)
                
                pwd = parent_password or secrets.token_urlsafe(8)
                user = User.objects.create_user(
                    phone=normalized_phone,
                    full_name=parent_name,
                    role="parent",
                    password=pwd
                )
                parent = Parent.objects.create(user=user)
        else:
            return Response({"detail": "Either parent_id or parent_phone is required."}, status=status.HTTP_400_BAD_REQUEST)

        # Clear existing parent links for this student (ensure single parent mapping for this student)
        ParentStudentLink.objects.filter(student=student).delete()
        
        link, created = ParentStudentLink.objects.get_or_create(parent=parent, student=student)
        
        return Response({
            "status": "success",
            "parent": {
                "id": str(parent.id),
                "full_name": parent.user.full_name,
                "phone": parent.user.phone,
            },
            "created": created
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="generate-link-code")
    def generate_link_code(self, request, pk=None):
        student = self.get_object()
        if request.user.role not in ("admin", "branch_admin", "director", "superadmin"):
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        code_obj = ParentLinkCode.generate_for_student(student)
        return Response({
            "code": code_obj.code,
            "expires_at": code_obj.expires_at.isoformat(),
            "student_name": student.user.full_name,
        })


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
