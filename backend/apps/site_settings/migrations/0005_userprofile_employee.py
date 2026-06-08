from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('site_settings', '0004_userprofile'),
        ('employees', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='userprofile',
            name='employee',
            field=models.OneToOneField(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='user_profile',
                to='employees.employee',
            ),
        ),
    ]
