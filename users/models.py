from django.contrib.auth.models import AbstractUser
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class User(AbstractUser):
    # Расширяем стандартного Django-пользователя полями, которые нужны приложению:
    # магазин, настройки таймера, тема интерфейса и прогресс достижений.
    email = models.EmailField(unique=True)
    # coins — внутренняя валюта магазина. Новому пользователю даём стартовый баланс.
    coins = models.IntegerField(default=100)
    # avatar хранит не картинку, а id из каталога AVATAR_CATALOG во views.py.
    avatar = models.CharField(max_length=100, default='fa-dog')
    # Дата рождения необязательна, поэтому разрешаем пустое значение в формах и NULL в базе.
    birthdate = models.DateField(blank=True, null=True)
    THEME_CHOICES = [
        ('light', 'Light'),
        ('dark', 'Dark'),
    ]
    theme = models.CharField(
        max_length=10,
        choices=THEME_CHOICES,
        default='light',
        help_text='Тема оформления: светлая, тёмная',
    )
    # JSONField удобен здесь, потому что список покупок — простые id из фиксированных каталогов.
    # default=list важен: Django создаёт новый список для каждого пользователя.
    purchased_avatars = models.JSONField(default=list, blank=True)
    purchased_themes = models.JSONField(default=list, blank=True)
    purchased_sounds = models.JSONField(default=list, blank=True)
    # claimed_achievements хранит id достижений, за которые монеты уже выданы.
    claimed_achievements = models.JSONField(default=list, blank=True)
    # active_theme и active_sound — выбранные предметы магазина, отдельно от базовой light/dark темы.
    active_theme = models.CharField(max_length=30, default='default')
    active_sound = models.CharField(max_length=30, default='default')
    # По этой дате endpoint daily_bonus понимает, можно ли выдать бонус сегодня.
    last_bonus_claimed_on = models.DateField(blank=True, null=True)
    # Настройки таймера хранятся у пользователя, чтобы после входа они были доступны с любого устройства.
    timer_work_minutes = models.PositiveSmallIntegerField(
        default=25,
        validators=[MinValueValidator(1), MaxValueValidator(60)],
    )
    timer_short_break_minutes = models.PositiveSmallIntegerField(
        default=5,
        validators=[MinValueValidator(1), MaxValueValidator(30)],
    )
    timer_long_break_minutes = models.PositiveSmallIntegerField(
        default=15,
        validators=[MinValueValidator(1), MaxValueValidator(60)],
    )
    timer_cycles_before_long_break = models.PositiveSmallIntegerField(
        default=4,
        validators=[MinValueValidator(1), MaxValueValidator(10)],
    )

    def __str__(self):
        return self.username


class Avatar(models.Model):
    # Модель оставлена для совместимости с админкой/старым подходом.
    # Текущий магазин в API использует in-memory каталог AVATAR_CATALOG.
    name = models.CharField(max_length=100)
    image = models.CharField(max_length=500)
    price_coins = models.PositiveIntegerField(default=0)
    is_default = models.BooleanField(default=False)

    def __str__(self):
        return f'{self.name} ({self.price_coins} монет)'


class UserAvatar(models.Model):
    # Связка пользователь-аватар фиксирует факт покупки, если используется табличная модель магазина.
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='avatars')
    avatar = models.ForeignKey(Avatar, on_delete=models.CASCADE)
    purchased_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=False)

    class Meta:
        # Один и тот же аватар нельзя купить одним пользователем дважды.
        unique_together = ('user', 'avatar')

    def __str__(self):
        return f'{self.user.username} - {self.avatar.name}'
