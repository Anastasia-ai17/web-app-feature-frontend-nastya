"""
URL configuration for pomodoro_project project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/

This file fixes a shadowing issue by importing views modules with explicit
aliases and ensures `include` is imported for including other URLconfs.
"""
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path('admin/', admin.site.urls),
    # users.urls содержит auth, профиль, темы и магазин под общим /api/.
    path('api/', include('users.urls')),
    # pomodoro.urls вынесен в отдельный namespace URL-ов для таймера и статистики.
    path('api/pomodoro/', include('pomodoro.urls')),
]
