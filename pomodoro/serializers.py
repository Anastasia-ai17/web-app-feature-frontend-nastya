from rest_framework import serializers

from .models import FocusSession


class FocusSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = FocusSession
        # Клиент отправляет только duration_minutes, остальные поля создаёт backend.
        fields = ('id', 'duration_minutes', 'completed_at')
        read_only_fields = ('id', 'completed_at')

    def validate_duration_minutes(self, value):
        # Защищаем API от нулевых, отрицательных и случайно огромных значений таймера.
        if value <= 0:
            raise serializers.ValidationError('Длительность должна быть больше нуля')
        if value > 300:
            raise serializers.ValidationError('Длительность слишком большая')
        return value
