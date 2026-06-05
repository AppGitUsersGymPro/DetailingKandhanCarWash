from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('customers', '0004_vehiclecolour_vehiclecompany_vehiclemodel_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='GarageOwner',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name',         models.CharField(max_length=255)),
                ('garage_name',  models.CharField(max_length=255)),
                ('location',     models.TextField(blank=True, default='')),
                ('gstin',        models.CharField(blank=True, default='', max_length=50)),
                ('phone_number', models.CharField(max_length=20, unique=True)),
                ('email',        models.EmailField(blank=True, null=True)),
                ('notes',        models.TextField(blank=True, default='')),
            ],
        ),
        migrations.AlterField(
            model_name='customer',
            name='email',
            field=models.EmailField(blank=True, null=True, unique=True),
        ),
        migrations.AddField(
            model_name='customer',
            name='garage_owner',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='proxy_customers',
                to='customers.garageowner',
            ),
        ),
    ]
