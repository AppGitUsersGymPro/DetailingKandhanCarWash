from django.db import migrations


def remove_setting(apps, schema_editor):
    Setting = apps.get_model('site_settings', 'Setting')
    Setting.objects.filter(field_name='NOTIFY_EXPECTED_EXIT').delete()


def restore_setting(apps, schema_editor):
    Setting = apps.get_model('site_settings', 'Setting')
    Setting.objects.get_or_create(
        field_name='NOTIFY_EXPECTED_EXIT',
        defaults={
            'label':       'Notify on Expected Exit Overdue',
            'value':       'true',
            'category':    'operations',
            'field_type':  'select',
            'options':     'true,false',
            'description': 'Send a WhatsApp reminder to customer/garage when vehicle is past its expected exit time.',
            'sort_order':  16,
        },
    )


class Migration(migrations.Migration):

    dependencies = [
        ('site_settings', '0005_new_notification_settings'),
    ]

    operations = [
        migrations.RunPython(remove_setting, restore_setting),
    ]
