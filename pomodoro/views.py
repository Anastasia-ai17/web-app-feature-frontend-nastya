from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Max, Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .serializers import FocusSessionSerializer


# Достижения описаны декларативно: id хранится в User.claimed_achievements,
# metric указывает, из какого агрегата брать прогресс, reward_coins — награда.
ACHIEVEMENT_DEFINITIONS = (
    {
        'id': 'first_focus',
        'title': 'Первый фокус',
        'description': 'Завершить первую рабочую сессию',
        'icon': 'fa-solid fa-seedling',
        'target': 1,
        'metric': 'total_sessions',
        'reward_coins': 25,
    },
    {
        'id': 'five_sessions',
        'title': 'Стабильный ритм',
        'description': 'Завершить 5 рабочих сессий',
        'icon': 'fa-solid fa-list-check',
        'target': 5,
        'metric': 'total_sessions',
        'reward_coins': 75,
    },
    {
        'id': 'twenty_sessions',
        'title': 'Мастер циклов',
        'description': 'Завершить 20 рабочих сессий',
        'icon': 'fa-solid fa-layer-group',
        'target': 20,
        'metric': 'total_sessions',
        'reward_coins': 200,
    },
    {
        'id': 'one_hour',
        'title': 'Первый час',
        'description': 'Набрать 60 минут фокуса',
        'icon': 'fa-solid fa-hourglass-half',
        'target': 60,
        'metric': 'total_minutes',
        'reward_coins': 50,
    },
    {
        'id': 'ten_hours',
        'title': 'Глубокая работа',
        'description': 'Набрать 10 часов фокуса',
        'icon': 'fa-solid fa-brain',
        'target': 600,
        'metric': 'total_minutes',
        'reward_coins': 250,
    },
    {
        'id': 'focused_day',
        'title': 'Сильный день',
        'description': 'Набрать 60 минут за сегодня',
        'icon': 'fa-solid fa-sun',
        'target': 60,
        'metric': 'today_minutes',
        'reward_coins': 50,
    },
    {
        'id': 'focused_week',
        'title': 'Сильная неделя',
        'description': 'Набрать 5 часов за неделю',
        'icon': 'fa-solid fa-calendar-check',
        'target': 300,
        'metric': 'week_minutes',
        'reward_coins': 150,
    },
    {
        'id': 'long_session',
        'title': 'Длинный заход',
        'description': 'Завершить сессию на 50 минут или больше',
        'icon': 'fa-solid fa-stopwatch',
        'target': 50,
        'metric': 'longest_session_minutes',
        'reward_coins': 100,
    },
)


def _sum_minutes(queryset):
    # aggregate вернёт None, если записей нет, поэтому приводим пустой результат к 0.
    return queryset.aggregate(total=Sum('duration_minutes'))['total'] or 0


def _build_achievement_metrics(user):
    # Все показатели считаются на backend, чтобы клиент не мог подделать прогресс достижений.
    now = timezone.now()
    # Начало дня берём в timezone-aware формате из Django.
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    # weekday(): понедельник = 0, поэтому вычитание даёт начало текущей недели.
    week_start = today_start - timedelta(days=today_start.weekday())
    # Для "месяца" используется скользящее окно 30 дней, а не календарный месяц.
    month_start = today_start - timedelta(days=30)

    sessions = user.focus_sessions.all()

    # Одни и те же агрегаты используются и для карточек статистики, и для достижений.
    today_minutes = _sum_minutes(sessions.filter(completed_at__gte=today_start))
    week_minutes = _sum_minutes(sessions.filter(completed_at__gte=week_start))
    month_minutes = _sum_minutes(sessions.filter(completed_at__gte=month_start))
    total_minutes = _sum_minutes(sessions)
    total_sessions = sessions.count()
    longest_session_minutes = sessions.aggregate(
        longest=Max('duration_minutes')
    )['longest'] or 0

    return {
        'today': today_minutes,
        'week': week_minutes,
        'month': month_minutes,
        'today_minutes': today_minutes,
        'week_minutes': week_minutes,
        'month_minutes': month_minutes,
        'total_minutes': total_minutes,
        'total_sessions': total_sessions,
        'longest_session_minutes': longest_session_minutes,
    }


def _build_achievements(metrics, claimed_achievement_ids=None):
    # Собираем UI-готовый список достижений: прогресс, процент, unlocked и статус награды.
    achievements = []
    unlocked_count = 0
    claimed_ids = set(claimed_achievement_ids or [])

    for definition in ACHIEVEMENT_DEFINITIONS:
        # metric связывает определение достижения с рассчитанным значением из metrics.
        current = metrics.get(definition['metric'], 0)
        target = definition['target']
        # progress ограничиваем target, чтобы progress bar не уходил выше 100%.
        progress = min(target, current)
        unlocked = current >= target
        reward_claimed = definition['id'] in claimed_ids
        if unlocked:
            unlocked_count += 1

        achievements.append(
            {
                **definition,
                'current': current,
                'progress': progress,
                'progress_percent': round((progress / target) * 100),
                'unlocked': unlocked,
                'reward_claimed': reward_claimed,
            }
        )

    return {
        'unlocked': unlocked_count,
        'total': len(ACHIEVEMENT_DEFINITIONS),
        'items': achievements,
    }


def _award_unclaimed_achievement_rewards(user, metrics):
    # Награды выдаём автоматически при запросе статистики или сохранении новой сессии.
    achievements = _build_achievements(metrics, user.claimed_achievements)
    newly_unlocked = [
        item
        for item in achievements['items']
        if item['unlocked'] and not item['reward_claimed']
    ]

    earned_coins = sum(item['reward_coins'] for item in newly_unlocked)
    if not newly_unlocked:
        # Если новых достижений нет, возвращаем текущий список без записи в базу.
        return achievements, 0, []

    # dict.fromkeys убирает дубликаты, но сохраняет порядок уже полученных достижений.
    claimed_ids = list(
        dict.fromkeys([
            *(user.claimed_achievements or []),
            *[item['id'] for item in newly_unlocked],
        ])
    )
    # claimed_achievements и coins обновляются вместе, чтобы награда не начислялась повторно.
    user.claimed_achievements = claimed_ids
    user.coins += earned_coins
    user.save(update_fields=['claimed_achievements', 'coins'])

    return (
        _build_achievements(metrics, user.claimed_achievements),
        earned_coins,
        newly_unlocked,
    )


def _get_stats_payload_with_rewards(user):
    # Общая функция для GET /stats/ и POST /sessions/: оба endpoint-а должны вернуть актуальные награды.
    metrics = _build_achievement_metrics(user)
    achievements, earned_coins, newly_unlocked = _award_unclaimed_achievement_rewards(
        user,
        metrics,
    )
    return {
        **metrics,
        'achievements': achievements,
        'achievement_rewards_earned': earned_coins,
        'newly_unlocked_achievements': newly_unlocked,
        'coins': user.coins,
    }


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def pomodoro_stats(request):
    # select_for_update блокирует строку пользователя на время выдачи наград,
    # чтобы параллельные запросы не начислили одну и ту же награду дважды.
    User = get_user_model()
    with transaction.atomic():
        user = User.objects.select_for_update().get(pk=request.user.pk)
        payload = _get_stats_payload_with_rewards(user)

    return Response(payload, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_focus_session(request):
    # Фронт вызывает этот endpoint после завершения рабочей сессии.
    serializer = FocusSessionSerializer(data=request.data)
    if serializer.is_valid():
        User = get_user_model()
        with transaction.atomic():
            # Блокируем пользователя, потому что одновременно меняем баланс и достижения.
            user = User.objects.select_for_update().get(pk=request.user.pk)
            session = serializer.save(user=user)
            # Базовая награда за любую завершённую сессию начисляется отдельно от достижений.
            user.coins += 10
            user.save(update_fields=['coins'])
            stats_payload = _get_stats_payload_with_rewards(user)

        # В ответ добавляем новый баланс и список новых достижений, чтобы UI обновился без доп. запроса.
        data = FocusSessionSerializer(session).data
        data['coins'] = user.coins
        data['coins_earned'] = 10
        data['achievement_rewards_earned'] = stats_payload['achievement_rewards_earned']
        data['newly_unlocked_achievements'] = stats_payload['newly_unlocked_achievements']
        return Response(data, status=status.HTTP_201_CREATED)

    return Response({'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
