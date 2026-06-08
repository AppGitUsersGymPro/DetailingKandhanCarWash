from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='Notification',
            fields=[
                ('id',              models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('recipient_name',  models.CharField(max_length=255)),
                ('recipient_phone', models.CharField(max_length=20)),
                ('channel',         models.CharField(choices=[('whatsapp', 'WhatsApp')], default='whatsapp', max_length=20)),
                ('trigger_type',    models.CharField(choices=[
                    ('job_checkin',      'Job Check-in'),
                    ('job_completed',    'Job Completed'),
                    ('payment_received', 'Payment Received'),
                    ('customer_welcome', 'Customer Welcome'),
                    ('garage_payment',   'Garage Payment'),
                    ('service_reminder', 'Service Reminder'),
                ], max_length=50)),
                ('message',         models.TextField()),
                ('status',          models.CharField(choices=[('pending', 'Pending'), ('sent', 'Sent'), ('failed', 'Failed')], default='pending', max_length=20)),
                ('retry_count',     models.PositiveIntegerField(default=0)),
                ('error_log',       models.TextField(blank=True, default='')),
                ('created_at',      models.DateTimeField(auto_now_add=True)),
                ('sent_at',         models.DateTimeField(blank=True, null=True)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
    ]
