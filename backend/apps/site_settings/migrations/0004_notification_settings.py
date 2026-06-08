from django.db import migrations

NOTIFICATION_SETTINGS = [
    # (field_name, label, value, category, field_type, options, description, sort_order)
    ('NOTIFY_CHECKIN',          'Notify on Vehicle Check-in',    'true', 'operations', 'select', 'true,false',
     'Send a WhatsApp message to the customer when their vehicle is checked in.', 10),
    ('NOTIFY_COMPLETED',        'Notify on Job Completed',       'true', 'operations', 'select', 'true,false',
     'Send a WhatsApp message to the customer when their vehicle is ready for pickup.', 11),
    ('NOTIFY_PAYMENT',          'Notify on Payment Received',    'true', 'operations', 'select', 'true,false',
     'Send a WhatsApp payment confirmation to the customer after each payment.', 12),
    ('NOTIFY_CUSTOMER_WELCOME', 'Notify on New Customer',        'true', 'operations', 'select', 'true,false',
     'Send a welcome WhatsApp message when a new customer is registered.', 13),
    ('NOTIFY_GARAGE_PAYMENT',   'Notify Garage on Payment',      'true', 'operations', 'select', 'true,false',
     'Send a WhatsApp message to the garage owner when a payment is applied to their job cards.', 14),
    ('NOTIFY_SERVICE_REMINDER', 'Notify on Service Due',         'true', 'operations', 'select', 'true,false',
     'Send a WhatsApp reminder when a vehicle is due for its next service.', 15),
]


def add_settings(apps, schema_editor):
    Setting = apps.get_model('site_settings', 'Setting')
    for row in NOTIFICATION_SETTINGS:
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
    Setting.objects.filter(field_name__in=[r[0] for r in NOTIFICATION_SETTINGS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('site_settings', '0003_incentive_order_threshold'),
    ]

    operations = [
        migrations.RunPython(add_settings, remove_settings),
    ]
