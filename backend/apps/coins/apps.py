from django.apps import AppConfig


class CoinsConfig(AppConfig):
    name = "apps.coins"

    def ready(self):
        import apps.coins.signals  # noqa
