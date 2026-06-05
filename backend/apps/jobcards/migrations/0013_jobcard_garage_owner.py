from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('customers', '0005_garageowner_customer_garage'),
        ('jobcards',  '0012_alter_jobcard_vehicle_sub_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='jobcard',
            name='garage_owner',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='job_cards',
                to='customers.garageowner',
            ),
        ),
    ]
