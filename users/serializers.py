from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from rest_framework import serializers

from .models import Avatar, User, UserAvatar


class UserRegistrationSerializer(serializers.ModelSerializer):
    # Пароль принимаем только на вход: в ответах API он никогда не сериализуется.
    password = serializers.CharField(
        write_only=True,
        required=True,
        style={'input_type': 'password'},
    )

    class Meta:
        model = User
        fields = ('username', 'email', 'password')

    def validate_email(self, value):
        # iexact запрещает регистрацию дублей с другим регистром букв.
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('Пользователь с таким email уже существует')
        return value

    def validate_username(self, value):
        # Django хранит username как строку, поэтому явно защищаемся от Corgi/corgi дублей.
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError('Пользователь с таким именем уже существует')
        return value

    def validate_password(self, value):
        # Используем стандартные validators из settings.py, чтобы правила пароля были едиными.
        try:
            validate_password(value)
        except ValidationError as exc:
            raise serializers.ValidationError(list(exc.messages)) from exc
        return value

    def create(self, validated_data):
        # create_user корректно хеширует пароль; напрямую сохранять password нельзя.
        return User.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password'],
        )


class LoginSerializer(serializers.Serializer):
    # Фронт отправляет поле login, но username оставлен для совместимости с обычными формами.
    login = serializers.CharField(required=False, allow_blank=True)
    username = serializers.CharField(required=False, allow_blank=True)
    password = serializers.CharField(
        write_only=True,
        style={'input_type': 'password'},
    )

    def validate(self, data):
        # Пользователь может ввести либо username, либо email. Дальше приводим это к username,
        # потому что authenticate по умолчанию работает с USERNAME_FIELD.
        login_value = (data.get('login') or data.get('username') or '').strip()
        password = data.get('password')

        if not login_value or not password:
            raise serializers.ValidationError('Необходимо указать имя пользователя или email и пароль')

        username = login_value
        if '@' in login_value:
            # Для email ищем пользователя без загрузки всех полей: нужен только username.
            user = User.objects.filter(email__iexact=login_value).only('username').first()
            username = user.username if user else login_value

        # authenticate проверяет пароль через Django password hashers.
        user = authenticate(username=username, password=password)
        if not user:
            raise serializers.ValidationError('Неверное имя пользователя, email или пароль')
        if not user.is_active:
            raise serializers.ValidationError('Пользователь деактивирован')

        # Сохраняем найденного пользователя в validated_data, чтобы view не делал повторный запрос.
        data['user'] = user
        return data


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        # Этот сериализатор используется и для профиля, и для auth payload,
        # поэтому включает все поля, которые фронт должен держать в AuthContext.
        fields = (
            'id',
            'username',
            'email',
            'coins',
            'birthdate',
            'avatar',
            'theme',
            'purchased_avatars',
            'purchased_themes',
            'purchased_sounds',
            'claimed_achievements',
            'active_theme',
            'active_sound',
            'last_bonus_claimed_on',
            'timer_work_minutes',
            'timer_short_break_minutes',
            'timer_long_break_minutes',
            'timer_cycles_before_long_break',
            'date_joined',
        )
        # Деньги, покупки и системные поля нельзя менять через PATCH /profile/.
        # Для них есть отдельные endpoint-ы магазина и статистики.
        read_only_fields = (
            'id',
            'username',
            'email',
            'coins',
            'purchased_avatars',
            'purchased_themes',
            'purchased_sounds',
            'claimed_achievements',
            'active_theme',
            'active_sound',
            'last_bonus_claimed_on',
            'date_joined',
        )


class UserThemeSerializer(serializers.ModelSerializer):
    class Meta:
        # Базовая UI-тема отделена от тем магазина и хранит только light/dark.
        model = User
        fields = ('theme',)


class PasswordChangeSerializer(serializers.Serializer):
    # Оба поля write_only: пароль не должен вернуться клиенту даже случайно.
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate_current_password(self, value):
        user = self.context['request'].user
        # Перед сменой пароля проверяем старый пароль, чтобы украденная сессия не могла сменить пароль.
        if not user.check_password(value):
            raise serializers.ValidationError('Неверный текущий пароль')
        return value

    def validate_new_password(self, value):
        # Новый пароль проверяется теми же правилами, что и при регистрации.
        try:
            validate_password(value, self.context['request'].user)
        except ValidationError as exc:
            raise serializers.ValidationError(list(exc.messages)) from exc
        return value

    def save(self, **kwargs):
        user = self.context['request'].user
        # set_password хеширует значение и обновляет формат хранения пароля под текущий hasher.
        user.set_password(self.validated_data['new_password'])
        user.save(update_fields=['password'])
        return user


class AvatarSerializer(serializers.ModelSerializer):
    class Meta:
        # Сериализатор табличной модели Avatar нужен для старого UserAvatarSerializer и админских данных.
        model = Avatar
        fields = ('id', 'name', 'image', 'price_coins', 'is_default')


class UserAvatarSerializer(serializers.ModelSerializer):
    # В ответе отдаём вложенный объект avatar, а на запись можем принимать только avatar_id.
    avatar = AvatarSerializer(read_only=True)
    avatar_id = serializers.IntegerField(write_only=True, required=False)

    class Meta:
        model = UserAvatar
        fields = ('id', 'avatar', 'avatar_id', 'purchased_at', 'is_active')
        read_only_fields = ('id', 'purchased_at')
