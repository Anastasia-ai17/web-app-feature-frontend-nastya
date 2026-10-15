from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Avatar, UserAvatar
from .serializers import (
    AvatarSerializer,
    LoginSerializer,
    PasswordChangeSerializer,
    UserAvatarSerializer,
    UserRegistrationSerializer,
    UserSerializer,
    UserThemeSerializer,
)

# Бесплатные аватары, которые должны быть доступны любому пользователю даже у старых аккаунтов.
DEFAULT_AVATARS = ['fa-dog', 'fa-cat', 'fa-fish', 'fa-dove', 'fa-otter', 'fa-frog']

# Каталоги магазина лежат в коде, потому что набор предметов фиксированный и небольшой.
# Во всех пользовательских полях хранятся только id из этих словарей.
AVATAR_CATALOG = {
    'fa-dog': {'name': 'Корги', 'emoji': '🐶', 'price_coins': 0, 'is_default': True},
    'fa-cat': {'name': 'Кот', 'emoji': '🐱', 'price_coins': 0, 'is_default': True},
    'fa-fish': {'name': 'Рыбка', 'emoji': '🐟', 'price_coins': 0, 'is_default': True},
    'fa-dove': {'name': 'Голубь', 'emoji': '🐦', 'price_coins': 0, 'is_default': True},
    'fa-otter': {'name': 'Выдра', 'emoji': '🦦', 'price_coins': 0, 'is_default': True},
    'fa-frog': {'name': 'Лягушка', 'emoji': '🐸', 'price_coins': 0, 'is_default': True},
    'fa-fox': {'name': 'Лисёнок', 'emoji': '🦊', 'price_coins': 300, 'is_default': False},
    'fa-panda': {'name': 'Панда', 'emoji': '🐼', 'price_coins': 350, 'is_default': False},
    'fa-penguin': {'name': 'Пингвин', 'emoji': '🐧', 'price_coins': 300, 'is_default': False},
}

# Темы магазина отличаются от базовой light/dark темы интерфейса.
# Они меняют декоративное оформление страницы и покупаются за coins.
THEME_CATALOG = {
    'default': {'name': 'Стандартная', 'price_coins': 0},
    'forest': {'name': 'Лесная', 'price_coins': 500},
    'twilight': {'name': 'Рассвет-Закат', 'price_coins': 500},
    'dream': {'name': 'Розовая мечта', 'price_coins': 500},
}

# Звуки магазина выбираются для сигнала таймера.
SOUND_CATALOG = {
    'default': {'name': 'Стандартный', 'price_coins': 0},
    'trill': {'name': 'Трель', 'price_coins': 200},
    'chime': {'name': 'Нежный звон', 'price_coins': 200},
    'digital': {'name': 'Цифровой сигнал', 'price_coins': 200},
}


def ensure_user_shop_state(user):
    # Эта функция чинит состояние пользователя перед операциями магазина.
    # Она нужна для старых аккаунтов, у которых появились новые JSON-поля после миграций.
    changed_fields = []
    if not user.purchased_avatars:
        # Если список пустой, выдаём стартовый набор бесплатных аватаров.
        user.purchased_avatars = [*DEFAULT_AVATARS]
        changed_fields.append('purchased_avatars')
    if 'default' not in user.purchased_themes:
        # dict.fromkeys сохраняет порядок и убирает дубликаты.
        user.purchased_themes = [*dict.fromkeys([*user.purchased_themes, 'default'])]
        changed_fields.append('purchased_themes')
    if 'default' not in user.purchased_sounds:
        user.purchased_sounds = [*dict.fromkeys([*user.purchased_sounds, 'default'])]
        changed_fields.append('purchased_sounds')
    if user.avatar not in user.purchased_avatars:
        # Активный аватар должен быть среди купленных, иначе профиль покажет недоступный id.
        user.avatar = user.purchased_avatars[0]
        changed_fields.append('avatar')
    if user.active_theme not in THEME_CATALOG:
        user.active_theme = 'default'
        changed_fields.append('active_theme')
    if user.active_sound not in SOUND_CATALOG:
        user.active_sound = 'default'
        changed_fields.append('active_sound')
    if changed_fields:
        # Сохраняем только реально изменённые поля, чтобы не трогать updated state без причины.
        user.save(update_fields=changed_fields)


def serialize_preferences(user):
    # Общий формат ответа для магазина: баланс, покупки и активные выбранные предметы.
    ensure_user_shop_state(user)
    return {
        'coins': user.coins,
        'purchased_avatars': user.purchased_avatars,
        'purchased_themes': user.purchased_themes,
        'purchased_sounds': user.purchased_sounds,
        'active_avatar': user.avatar,
        'active_theme': user.active_theme,
        'active_sound': user.active_sound,
        'last_bonus_claimed_on': user.last_bonus_claimed_on,
    }


def build_auth_payload(user, message):
    # После регистрации и входа фронту нужны одни и те же данные: user + пара JWT-токенов.
    refresh = RefreshToken.for_user(user)
    return {
        'message': message,
        'user': UserSerializer(user).data,
        'tokens': {
            'refresh': str(refresh),
            'access': str(refresh.access_token),
        },
    }


@api_view(['POST'])
@permission_classes([AllowAny])
def register_user(request):
    # Регистрация открыта без токена, а валидатор проверяет email, username и пароль.
    serializer = UserRegistrationSerializer(data=request.data)

    if serializer.is_valid():
        user = serializer.save()
        return Response(
            build_auth_payload(user, 'Пользователь успешно создан'),
            status=status.HTTP_201_CREATED,
        )

    return Response({'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([AllowAny])
def login_user(request):
    # LoginSerializer принимает username или email и кладёт найденного пользователя в validated_data.
    serializer = LoginSerializer(data=request.data)

    if serializer.is_valid():
        user = serializer.validated_data['user']
        return Response(
            build_auth_payload(user, 'Вход выполнен успешно'),
            status=status.HTTP_200_OK,
        )

    return Response({'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([AllowAny])
def me_view(request):
    # /me/ используется фронтом при загрузке приложения, чтобы восстановить сессию из access-токена.
    if not request.user.is_authenticated:
        return Response({'authenticated': False, 'user': None}, status=status.HTTP_200_OK)

    return Response(
        {
            'authenticated': True,
            'user': UserSerializer(request.user).data,
        },
        status=status.HTTP_200_OK,
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def protected_view(request):
    # Тестовый защищённый endpoint: полезен для ручной проверки JWT-авторизации.
    return Response(
        {
            'message': 'Это защищенный эндпоинт',
            'user': UserSerializer(request.user).data,
        },
        status=status.HTTP_200_OK,
    )


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def profile_view(request):
    # GET возвращает профиль, PATCH обновляет только разрешённые поля из UserSerializer.
    user = request.user

    if request.method == 'GET':
        return Response(UserSerializer(user).data, status=status.HTTP_200_OK)

    serializer = UserSerializer(user, data=request.data, partial=True)
    if serializer.is_valid():
        # partial=True позволяет отправлять только изменённые поля, например birthdate или avatar.
        serializer.save()
        return Response({'user': serializer.data}, status=status.HTTP_200_OK)

    return Response({'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password(request):
    # Serializer получает request в context, чтобы проверить текущий пароль именно у request.user.
    serializer = PasswordChangeSerializer(data=request.data, context={'request': request})
    if serializer.is_valid():
        serializer.save()
        return Response({'message': 'Пароль успешно обновлён'}, status=status.HTTP_200_OK)

    return Response({'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_view(request):
    # Access-токены в JWT обычно живут недолго и не отзываются.
    # Поэтому при выходе отзываем refresh-токен, чтобы им нельзя было получить новый access.
    refresh_token = request.data.get('refresh')
    if refresh_token:
        try:
            RefreshToken(refresh_token).blacklist()
        except TokenError:
            return Response(
                {'error': 'Некорректный refresh-токен'},
                status=status.HTTP_400_BAD_REQUEST,
            )

    return Response({'message': 'Выход выполнен'}, status=status.HTTP_200_OK)


@api_view(['GET', 'PUT', 'POST'])
@permission_classes([IsAuthenticated])
def user_theme(request):
    # Endpoint базовой UI-темы авторизованного пользователя: light/dark.
    user = request.user

    if request.method == 'GET':
        return Response(UserThemeSerializer(user).data, status=status.HTTP_200_OK)

    serializer = UserThemeSerializer(user, data=request.data, partial=True)
    if serializer.is_valid():
        # PUT и POST обрабатываются одинаково, чтобы фронт мог использовать любой из этих методов.
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    return Response({'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def guest_theme(request):
    # У гостя нет записи User, поэтому тему сохраняем в cookie браузера.
    if request.method == 'GET':
        theme = request.COOKIES.get('theme', 'system')
        return Response({'theme': theme}, status=status.HTTP_200_OK)

    theme = request.data.get('theme', 'system')
    response = Response(
        {'theme': theme, 'message': 'Тема сохранена в cookies'},
        status=status.HTTP_200_OK,
    )
    # Cookie живёт год: гостевая тема не теряется между перезапусками браузера.
    response.set_cookie('theme', theme, max_age=60 * 60 * 24 * 365)
    return response


@api_view(['GET'])
@permission_classes([AllowAny])
def shop_avatars(request):
    # Каталог аватаров открыт и для гостя: магазин можно просматривать без входа.
    avatars = [
        {
            'id': avatar_id,
            **avatar_data,
        }
        for avatar_id, avatar_data in AVATAR_CATALOG.items()
    ]
    return Response(avatars, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def buy_avatar(request, avatar_id):
    # Покупка требует авторизацию, потому что меняет баланс и список покупок пользователя.
    user = request.user
    ensure_user_shop_state(user)

    avatar = AVATAR_CATALOG.get(str(avatar_id))
    if avatar is None:
        return Response({'error': 'Аватар не найден'}, status=status.HTTP_404_NOT_FOUND)

    avatar_id = str(avatar_id)
    if avatar_id in user.purchased_avatars:
        # Повторная покупка не списывает монеты и возвращает понятную ошибку.
        return Response(
            {'error': 'Вы уже купили этот аватар'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    price = avatar['price_coins']
    if user.coins < price:
        # Проверку баланса делаем до transaction, чтобы не создавать лишнюю запись блокировки.
        return Response(
            {
                'error': (
                    f'Недостаточно монет. Нужно: {price}, '
                    f'у вас: {user.coins}'
                )
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    with transaction.atomic():
        # Баланс и покупку сохраняем вместе: нельзя списать coins без добавления предмета.
        user.coins -= price
        user.purchased_avatars = [*user.purchased_avatars, avatar_id]
        user.save(update_fields=['coins', 'purchased_avatars'])

    return Response(
        {
            'message': f'Аватар "{avatar["name"]}" куплен!',
            'coins': user.coins,
            'coins_left': user.coins,
            'avatar_id': avatar_id,
            'purchased_avatars': user.purchased_avatars,
        },
        status=status.HTTP_200_OK,
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def activate_avatar(request, avatar_id):
    # Активация не покупает предмет: пользователь может выбрать только уже доступный id.
    user = request.user
    ensure_user_shop_state(user)
    avatar_id = str(avatar_id)

    if avatar_id not in user.purchased_avatars:
        return Response(
            {'error': 'Аватар не найден в вашей коллекции'},
            status=status.HTTP_404_NOT_FOUND,
        )

    user.avatar = avatar_id
    user.save(update_fields=['avatar'])

    return Response(
        {
            'message': 'Аватар активирован',
            'active_avatar_id': avatar_id,
        },
        status=status.HTTP_200_OK,
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_avatars(request):
    # Возвращаем только купленные аватары и помечаем текущий активный.
    user = request.user
    ensure_user_shop_state(user)
    avatars = [
        {
            'id': avatar_id,
            **AVATAR_CATALOG[avatar_id],
            'is_active': user.avatar == avatar_id,
        }
        for avatar_id in user.purchased_avatars
        if avatar_id in AVATAR_CATALOG
    ]
    return Response(avatars, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_coins(request):
    # Баланс часто меняется после таймера, бонусов и покупок, поэтому запрещаем кеширование.
    response = Response({'coins': request.user.coins}, status=status.HTTP_200_OK)
    response['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response['Pragma'] = 'no-cache'
    response['Expires'] = '0'
    return response


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def shop_preferences(request):
    # Один компактный endpoint для первичной загрузки состояния магазина на фронте.
    return Response(serialize_preferences(request.user), status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def select_theme(request, theme_id):
    # Если тема ещё не куплена, endpoint покупает её и сразу делает активной.
    user = request.user
    ensure_user_shop_state(user)

    theme_item = THEME_CATALOG.get(theme_id)
    if theme_item is None:
        return Response({'error': 'Тема не найдена'}, status=status.HTTP_404_NOT_FOUND)

    if theme_id not in user.purchased_themes:
        price = theme_item['price_coins']
        if user.coins < price:
            return Response(
                {'error': f'Недостаточно монет. Нужно: {price}, у вас: {user.coins}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.coins -= price
        user.purchased_themes = [*user.purchased_themes, theme_id]

    # Даже для уже купленной темы сохраняем active_theme, чтобы выбор переключался.
    user.active_theme = theme_id
    user.save(update_fields=['coins', 'purchased_themes', 'active_theme'])
    return Response(
        {
            'message': f'Тема "{theme_item["name"]}" выбрана',
            **serialize_preferences(user),
        },
        status=status.HTTP_200_OK,
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def select_sound(request, sound_id):
    # Логика звуков совпадает с темами: покупка при первом выборе, затем простое переключение.
    user = request.user
    ensure_user_shop_state(user)

    sound_item = SOUND_CATALOG.get(sound_id)
    if sound_item is None:
        return Response({'error': 'Звук не найден'}, status=status.HTTP_404_NOT_FOUND)

    if sound_id not in user.purchased_sounds:
        price = sound_item['price_coins']
        if user.coins < price:
            return Response(
                {'error': f'Недостаточно монет. Нужно: {price}, у вас: {user.coins}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.coins -= price
        user.purchased_sounds = [*user.purchased_sounds, sound_id]

    # active_sound читает TimerContext, когда проигрывает сигнал окончания интервала.
    user.active_sound = sound_id
    user.save(update_fields=['coins', 'purchased_sounds', 'active_sound'])
    return Response(
        {
            'message': f'Звук "{sound_item["name"]}" выбран',
            **serialize_preferences(user),
        },
        status=status.HTTP_200_OK,
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def daily_bonus(request):
    # Ежедневный бонус выдаётся один раз за локальную дату сервера.
    user = request.user
    today = timezone.localdate()

    if user.last_bonus_claimed_on == today:
        # Баланс возвращаем даже при ошибке, чтобы фронт мог оставить UI синхронизированным.
        return Response(
            {
                'error': 'Сегодня вы уже получали бонус',
                'coins': user.coins,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    bonus = 50
    # Обновляем дату вместе с балансом, чтобы повторный запрос в этот же день был заблокирован.
    user.coins += bonus
    user.last_bonus_claimed_on = today
    user.save(update_fields=['coins', 'last_bonus_claimed_on'])

    return Response(
        {
            'message': f'Вы получили {bonus} монет',
            'bonus': bonus,
            **serialize_preferences(user),
        },
        status=status.HTTP_200_OK,
    )
