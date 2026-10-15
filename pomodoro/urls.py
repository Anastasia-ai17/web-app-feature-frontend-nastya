from django.urls import path

from . import views


urlpatterns = [
    # stats возвращает агрегированную статистику и достижения текущего пользователя.
    path('stats/', views.pomodoro_stats, name='pomodoro-stats'),
    # sessions создаёт новую завершённую фокус-сессию и начисляет монеты.
    path('sessions/', views.create_focus_session, name='pomodoro-sessions'),
]
