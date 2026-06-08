from django.db import migrations


def add_setting(apps, schema_editor):
    Setting = apps.get_model('site_settings', 'Setting')
    Setting.objects.get_or_create(
        field_name='NOTIFY_SERVICE_TODAY',
        defaults={
            'label':       'Notify on Service Due Today',
            'value':       'true',
            'category':    'operations',
            'field_type':  'select',
            'options':     'true,false',
            'description': 'Send a WhatsApp reminder to customers whose vehicle service is due today.',
            'sort_order':  16,
        },
    )


def remove_setting(apps, schema_editor):
    Setting = apps.get_model('site_settings', 'Setting')
    Setting.objects.filter(field_name='NOTIFY_SERVICE_TODAY').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('site_settings', '0008_auto_absent_settings'),
    ]

    operations = [
        migrations.RunPython(add_setting, remove_setting),
    ]
