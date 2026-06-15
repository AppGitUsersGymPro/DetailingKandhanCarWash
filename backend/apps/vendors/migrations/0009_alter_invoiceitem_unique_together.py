from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('vendors', '0008_alter_inventory_unique_together_and_more'),
    ]

    operations = [
        migrations.AlterUniqueTogether(
            name='invoiceitem',
            unique_together={('invoice', 'product', 'product_brand', 'unit_amount')},
        ),
    ]
