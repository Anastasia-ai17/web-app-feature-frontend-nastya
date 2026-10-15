from django.urls import path
from . import views
from rest_framework_simplejwt.views import TokenRefreshView

urlpatterns = [
    # Auth endpoints: регистрация/вход возвращают user + JWT, refresh обновляет access-токен.
    path('register/', views.register_user, name='register'),
    path('login/', views.login_user, name='login'),
    path('me/', views.me_view, name='me'),
    path('protected/', views.protected_view, name='protected'),
    # Профиль и пароль работают только для авторизованного пользователя.
    path('profile/', views.profile_view, name='profile'),
    path('change-password/', views.change_password, name='change-password'),
    path('logout/', views.logout_view, name='logout'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    # Базовая тема light/dark хранится отдельно для пользователя и гостя.
    path('theme/', views.user_theme, name='user-theme'),
    path('theme/guest/', views.guest_theme, name='guest-theme'),
    # Shop endpoints: каталог открыт, покупки и активные настройки требуют авторизацию.
    path('shop/avatars/', views.shop_avatars, name='shop-avatars'),
    path('shop/avatars/<str:avatar_id>/buy/', views.buy_avatar, name='buy-avatar'),
    path(
        'shop/avatars/<str:avatar_id>/activate/',
        views.activate_avatar,
        name='activate-avatar',
    ),
    path('shop/my-avatars/', views.my_avatars, name='my-avatars'),
    path('shop/coins/', views.my_coins, name='my-coins'),
    path('shop/preferences/', views.shop_preferences, name='shop-preferences'),
    path('shop/themes/<str:theme_id>/select/', views.select_theme, name='select-theme'),
    path('shop/sounds/<str:sound_id>/select/', views.select_sound, name='select-sound'),
    path('shop/bonus/', views.daily_bonus, name='daily-bonus'),
]
