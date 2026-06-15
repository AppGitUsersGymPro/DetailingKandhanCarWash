from django.db import migrations, models


def backfill_snapshot(apps, schema_editor):
    InvoiceItem = apps.get_model('vendors', 'InvoiceItem')
    for item in InvoiceItem.objects.select_related('product').all():
        changed = False
        if item.product_id and not item.product_name:
            item.product_name = item.product.product_name
            changed = True
        if item.product_id and not item.product_unit:
            item.product_unit = item.product.product_unit
            changed = True
        if changed:
            item.save(update_fields=['product_name', 'product_unit'])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('vendors', '0011_alter_invoiceitem_product'),
    ]

    operations = [
        migrations.AddField(
            model_name='invoiceitem',
            name='product_name',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='invoiceitem',
            name='product_unit',
            field=models.CharField(blank=True, max_length=10, null=True),
        ),
        migrations.RunPython(backfill_snapshot, noop),
    ]
