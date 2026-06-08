from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def create_profiles_for_existing_users(apps, schema_editor):
    User = apps.get_model('auth', 'User')
    UserProfile = apps.get_model('site_settings', 'UserProfile')
    for user in User.objects.all():
        UserProfile.objects.get_or_create(user=user, defaults={'role': 'admin'})


class Migration(migrations.Migration):

    dependencies = [
        ('site_settings', '0003_incentive_order_threshold'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='UserProfile',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('role', models.CharField(
                    choices=[('admin', 'Admin'), ('staff', 'Staff')],
                    default='admin',
                    max_length=20,
                )),
                ('user', models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='profile',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
        ),
        migrations.RunPython(
            create_profiles_for_existing_users,
            migrations.RunPython.noop,
        ),
    ]
