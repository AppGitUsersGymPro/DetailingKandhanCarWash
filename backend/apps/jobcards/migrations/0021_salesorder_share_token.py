import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('jobcards', '0021_merge_20260629_1634'),
    ]

    operations = [
        migrations.AddField(
            model_name='salesorder',
            name='share_token',
            field=models.UUIDField(default=uuid.uuid4, editable=False, unique=True),
        ),
    ]
