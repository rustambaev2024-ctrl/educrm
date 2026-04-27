from rest_framework import serializers


class AnalyticsFilterSerializer(serializers.Serializer):
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)
    branch_id = serializers.UUIDField(required=False)

    def validate(self, attrs):
        date_from = attrs.get("date_from")
        date_to = attrs.get("date_to")
        if date_from and date_to and date_from > date_to:
            raise serializers.ValidationError({"date_to": "Must be greater or equal to date_from"})
        return attrs


class ExportRequestSerializer(AnalyticsFilterSerializer):
    report_type = serializers.ChoiceField(
        choices=["finance", "attendance", "salary", "audit"],
    )
    teacher_id = serializers.UUIDField(required=False)
    salary_percent = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        required=False,
    )

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if attrs["report_type"] == "salary" and not attrs.get("teacher_id"):
            raise serializers.ValidationError(
                {"teacher_id": "Teacher is required for salary export"}
            )
        return attrs


class SalaryCalculateSerializer(serializers.Serializer):
    teacher_id = serializers.UUIDField()
    date_from = serializers.DateField()
    date_to = serializers.DateField()
    salary_percent = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        required=False,
    )

    def validate(self, attrs):
        if attrs["date_from"] > attrs["date_to"]:
            raise serializers.ValidationError({"date_to": "Must be greater or equal to date_from"})
        return attrs
