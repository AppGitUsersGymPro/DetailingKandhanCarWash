import uuid
from django.db import migrations, models


def gen_share_tokens(apps, schema_editor):
    """Give every existing estimation its own distinct token before the
    unique constraint goes on (a plain AddField would reuse one value)."""
    Estimation = apps.get_model('estimation', 'Estimation')
    for est in Estimation.objects.filter(share_token__isnull=True):
        est.share_token = uuid.uuid4()
        est.save(update_fields=['share_token'])


class Migration(migrations.Migration):

    dependencies = [
        ('estimation', '0001_initial'),
    ]

    operations = [
        # 1) add it nullable + non-unique so existing rows are allowed through
        migrations.AddField(
            model_name='estimation',
            name='share_token',
            field=models.UUIDField(null=True, editable=False),
        ),
        # 2) backfill a distinct UUID per row
        migrations.RunPython(gen_share_tokens, migrations.RunPython.noop),
        # 3) tighten to the real definition
        migrations.AlterField(
            model_name='estimation',
            name='share_token',
            field=models.UUIDField(default=uuid.uuid4, editable=False, unique=True),
        ),
    ]
