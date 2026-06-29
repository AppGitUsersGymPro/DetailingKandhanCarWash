import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('jobcards', '0019_alter_jobcard_employee'),
    ]

    operations = [
        migrations.AddField(
            model_name='jobcard',
            name='share_token',
            field=models.UUIDField(default=uuid.uuid4, editable=False, unique=True),
        ),
    ]
