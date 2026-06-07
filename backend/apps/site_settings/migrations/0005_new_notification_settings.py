from django.db import migrations

NEW_SETTINGS = [
    # (field_name, label, value, category, field_type, options, description, sort_order)
    ('NOTIFY_EXPECTED_EXIT',      'Notify on Expected Exit Overdue', 'true', 'operations', 'select', 'true,false',
     'Send a WhatsApp reminder to customer/garage when vehicle is past its expected exit time.', 16),
    ('NOTIFY_GARAGE_ALL_COMPLETED', 'Notify Garage: All Jobs Done',  'true', 'operations', 'select', 'true,false',
     'Notify garage owner when all their outstanding job cards have been completed.', 17),
    ('NOTIFY_LOW_STOCK',          'Notify on Low Stock',             'true', 'operations', 'select', 'true,false',
     'Alert the admin WhatsApp number when inventory falls below the minimum threshold.', 18),
    ('NOTIFY_SALARY',             'Notify on Salary Processed',      'true', 'operations', 'select', 'true,false',
     'Send a WhatsApp message to each employee when their salary is processed.', 19),
    ('admin_whatsapp_number',     'Admin WhatsApp Number',           '',     'operations', 'text',   '',
     'Phone number (with country code, e.g. 919876543210) to receive low-stock and admin alerts.', 20),
]


def add_settings(apps, schema_editor):
    Setting = apps.get_model('site_settings', 'Setting')
    for row in NEW_SETTINGS:
        Setting.objects.get_or_create(
            field_name=row[0],
            defaults={
                'label':       row[1],
                'value':       row[2],
                'category':    row[3],
                'field_type':  row[4],
                'options':     row[5],
                'description': row[6],
                'sort_order':  row[7],
            },
        )


def remove_settings(apps, schema_editor):
    Setting = apps.get_model('site_settings', 'Setting')
    Setting.objects.filter(field_name__in=[r[0] for r in NEW_SETTINGS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('site_settings', '0004_notification_settings'),
    ]

    operations = [
        migrations.RunPython(add_settings, remove_settings),
    ]
