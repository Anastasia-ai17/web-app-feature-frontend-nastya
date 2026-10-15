from django.conf import settings
from django.db import models


class FocusSession(models.Model):
    # Одна запись — одна завершённая рабочая сессия Pomodoro.
    # Перерывы здесь не сохраняются, потому что статистика и достижения считаются по фокус-времени.
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='focus_sessions',
    )
    # Длительность храним в минутах: этого достаточно для статистики и проще агрегировать.
    duration_minutes = models.PositiveSmallIntegerField()
    # Время завершения ставится сервером, чтобы клиент не мог подменить дату для статистики.
    completed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # Новые сессии показываются первыми, если queryset используется без явной сортировки.
        ordering = ['-completed_at']

    def __str__(self):
        return f'{self.user.username}: {self.duration_minutes} min'
