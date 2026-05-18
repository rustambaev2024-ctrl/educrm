from django.urls import path

from .views import public_submit_lead

urlpatterns = [
    path("", public_submit_lead, name="public-lead-submit"),
]
