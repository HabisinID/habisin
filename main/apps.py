from django.apps import AppConfig


class MainConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'main'

    def ready(self):
        from django.db.models.signals import post_migrate
        from .deployment import seed_demo_after_migrate

        post_migrate.connect(
            seed_demo_after_migrate,
            sender=self,
            dispatch_uid="main.seed_demo_after_migrate",
        )
