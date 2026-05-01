from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import OpenApiTypes, extend_schema_field
from rest_framework import serializers

from apps.accounts.models import User

from .models import Certificate, Parent, ParentStudentLink, Student, StudentDocument


class StudentSerializer(serializers.ModelSerializer):
    user_id = serializers.UUIDField(read_only=True, source="user.id")
    full_name = serializers.CharField(source="user.full_name")
    phone = serializers.CharField(source="user.phone")
    photo = serializers.ImageField(source="user.photo", required=False, allow_null=True)
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    parent_full_name = serializers.CharField(write_only=True, required=False, allow_blank=True)
    parent_phone = serializers.CharField(write_only=True, required=False, allow_blank=True)
    parent_password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    document_file = serializers.FileField(write_only=True, required=False, allow_null=True)
    document_type = serializers.ChoiceField(
        choices=StudentDocument.DOC_TYPE_CHOICES,
        write_only=True,
        required=False,
        default="passport",
    )
    documents = serializers.SerializerMethodField()
    group_ids = serializers.SerializerMethodField()
    parent_id = serializers.SerializerMethodField()

    class Meta:
        model = Student
        fields = (
            "id",
            "user_id",
            "full_name",
            "phone",
            "photo",
            "password",
            "parent_full_name",
            "parent_phone",
            "parent_password",
            "document_file",
            "document_type",
            "documents",
            "branch",
            "date_of_birth",
            "status",
            "wallet_balance",
            "registered_at",
            "notes",
            "group_ids",
            "parent_id",
        )
        read_only_fields = ("id", "user_id", "wallet_balance", "registered_at", "documents", "group_ids", "parent_id")

    def validate(self, attrs):
        user_data = attrs.get("user", {})
        if self.instance is None and not user_data.get("photo"):
            raise serializers.ValidationError({"photo": "Student photo is required."})
            
        phone = user_data.get("phone")
        if phone and self.instance is None:
            if User.objects.filter(phone=phone).exists():
                raise serializers.ValidationError({"phone": "This phone number is already registered."})
        elif phone and self.instance:
            if User.objects.filter(phone=phone).exclude(id=self.instance.user.id).exists():
                raise serializers.ValidationError({"phone": "This phone number is already registered."})
                
        return attrs

    @extend_schema_field(serializers.ListField(child=serializers.UUIDField()))
    def get_group_ids(self, obj):
        return [
            str(group_id)
            for group_id in obj.group_memberships.filter(left_at__isnull=True).values_list(
                "group_id",
                flat=True,
            )
        ]

    @extend_schema_field(OpenApiTypes.UUID)
    def get_parent_id(self, obj):
        parent = obj.parents.first()
        return str(parent.id) if parent else None

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_documents(self, obj):
        return [
            {
                "id": str(document.id),
                "name": document.file.name.split("/")[-1],
                "doc_type": document.doc_type,
                "file": document.file.url if document.file else None,
                "uploaded_at": document.uploaded_at.isoformat(),
            }
            for document in obj.documents.all()
        ]

    @transaction.atomic
    def create(self, validated_data):
        try:
            user_data = validated_data.pop("user")
            photo = user_data.pop("photo", None)
            password = validated_data.pop("password", None) or "ChangeMe123"
            parent_full_name = validated_data.pop("parent_full_name", "")
            parent_phone = validated_data.pop("parent_phone", "")
            parent_password = validated_data.pop("parent_password", "") or "ChangeMe123"
            document_file = validated_data.pop("document_file", None)
            document_type = validated_data.pop("document_type", "passport")
            
            user = User.objects.create_user(
                phone=user_data["phone"],
                full_name=user_data["full_name"],
                role="student",
                password=password,
            )
            if photo:
                user.photo = photo
                user.save(update_fields=["photo"])
            student = Student.objects.create(user=user, **validated_data)

            if document_file:
                StudentDocument.objects.create(
                    student=student,
                    doc_type=document_type,
                    file=document_file,
                    uploaded_by=self.context["request"].user if self.context.get("request") else None,
                )

            if parent_full_name and parent_phone:
                parent_user, created = User.objects.get_or_create(
                    phone=parent_phone,
                    defaults={
                        "full_name": parent_full_name,
                        "role": "parent",
                    },
                )
                if created:
                    parent_user.set_password(parent_password)
                    parent_user.save(update_fields=["password"])
                parent, _ = Parent.objects.get_or_create(user=parent_user)
                ParentStudentLink.objects.get_or_create(parent=parent, student=student)

            return student
        except Exception as e:
            import traceback
            traceback.print_exc()
            raise serializers.ValidationError({"detail": f"Ошибка сервера: {str(e)}"})

    @transaction.atomic
    def update(self, instance, validated_data):
        user_data = validated_data.pop("user", None)
        password = validated_data.pop("password", None)
        document_file = validated_data.pop("document_file", None)
        document_type = validated_data.pop("document_type", "passport")

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if user_data:
            user = instance.user
            for attr, value in user_data.items():
                setattr(user, attr, value)
            if password:
                user.set_password(password)
            user.save()
        elif password:
            user = instance.user
            user.set_password(password)
            user.save(update_fields=["password"])

        if document_file:
            StudentDocument.objects.create(
                student=instance,
                doc_type=document_type,
                file=document_file,
                uploaded_by=self.context["request"].user if self.context.get("request") else None,
            )

        return instance


class StudentDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudentDocument
        fields = ("id", "student", "doc_type", "file", "uploaded_by", "uploaded_at")
        read_only_fields = ("id", "student", "uploaded_by", "uploaded_at")


class CertificateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Certificate
        fields = ("id", "student", "course", "issued_at", "file", "issued_by")
        read_only_fields = ("id", "student", "issued_by")

    def validate(self, attrs):
        attrs.setdefault("issued_at", timezone.localdate())
        return attrs


class ParentSerializer(serializers.ModelSerializer):
    user_id = serializers.UUIDField(read_only=True, source="user.id")
    full_name = serializers.CharField(source="user.full_name")
    phone = serializers.CharField(source="user.phone")
    children_ids = serializers.SerializerMethodField()

    class Meta:
        model = Parent
        fields = ("id", "user_id", "full_name", "phone", "children_ids")
        read_only_fields = ("id", "user_id")

    @extend_schema_field(serializers.ListField(child=serializers.UUIDField()))
    def get_children_ids(self, obj):
        return [str(child_id) for child_id in obj.children.values_list("id", flat=True)]


class ParentStudentLinkSerializer(serializers.ModelSerializer):
    class Meta:
        model = ParentStudentLink
        fields = ("parent", "student", "linked_at")
        read_only_fields = ("linked_at",)
