import factory
from django.contrib.auth import get_user_model


class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = get_user_model()

    phone = factory.Sequence(lambda n: f"+998900000{n:03d}")
    full_name = factory.Sequence(lambda n: f"User {n}")
    role = "teacher"
    is_active = True
