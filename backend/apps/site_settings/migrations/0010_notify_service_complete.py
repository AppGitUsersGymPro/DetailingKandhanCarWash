from django.db import migrations


def add_setting(apps, schema_editor):
    Setting = apps.get_model('site_settings', 'Setting')
    Setting.objects.get_or_create(
        field_name='NOTIFY_SERVICE_COMPLETE',
        defaults={
            'label':       'Notify on Each Service Complete',
            'value':       'true',
            'category':    'operations',
            'field_type':  'select',
            'options':     'true,false',
            'description': 'Send a WhatsApp message to the customer/garage whenever an individual service inside a job card is marked completed.',
            'sort_order':  17,
        },
    )


def remove_setting(apps, schema_editor):
    Setting = apps.get_model('site_settings', 'Setting')
    Setting.objects.filter(field_name='NOTIFY_SERVICE_COMPLETE').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('site_settings', '0009_notify_service_today'),
    ]

    operations = [
        migrations.RunPython(add_setting, remove_setting),
    ]
