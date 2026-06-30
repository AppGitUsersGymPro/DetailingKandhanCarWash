from django.db import models


class Expense(models.Model):
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    customer = models.CharField(max_length=255)
    date = models.DateField()
    category = models.CharField(max_length=255)
    reference = models.CharField(max_length=255, blank=True, null=True)
    description = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"{self.category} - {self.amount} on {self.date}"

    class Meta:
        ordering = ['-date']


class DailyBalance(models.Model):
    date            = models.DateField(unique=True, db_index=True)
    opening_balance = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    collected       = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    expenses        = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    closing_balance = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    updated_at      = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date']

    def __str__(self):
        return f"Balance {self.date}: closing={self.closing_balance}"