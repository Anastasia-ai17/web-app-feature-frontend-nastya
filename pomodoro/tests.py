from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .models import FocusSession


User = get_user_model()


class PomodoroApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='corgi',
            email='corgi@example.com',
            password='StrongPass123!',
        )

    def test_session_creation_requires_auth(self):
        response = self.client.post(
            '/api/pomodoro/sessions/',
            {'duration_minutes': 25},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_authenticated_user_can_save_session_and_read_stats(self):
        self.client.force_authenticate(user=self.user)

        create_response = self.client.post(
            '/api/pomodoro/sessions/',
            {'duration_minutes': 25},
            format='json',
        )

        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(FocusSession.objects.count(), 1)

        old_session = FocusSession.objects.create(user=self.user, duration_minutes=40)
        FocusSession.objects.filter(pk=old_session.pk).update(
            completed_at=timezone.now() - timedelta(days=10)
        )

        stats_response = self.client.get('/api/pomodoro/stats/')

        self.assertEqual(stats_response.status_code, status.HTTP_200_OK)
        self.assertEqual(stats_response.data['today'], 25)
        self.assertEqual(stats_response.data['week'], 25)
        self.assertEqual(stats_response.data['month'], 65)
        self.assertEqual(stats_response.data['total_minutes'], 65)
        self.assertEqual(stats_response.data['total_sessions'], 2)
        self.assertEqual(stats_response.data['longest_session_minutes'], 40)
        self.assertIn('achievements', stats_response.data)
        self.assertEqual(stats_response.data['achievements']['total'], 8)

        achievements = {
            item['id']: item
            for item in stats_response.data['achievements']['items']
        }
        self.assertTrue(achievements['first_focus']['unlocked'])
        self.assertTrue(achievements['one_hour']['unlocked'])
        self.assertFalse(achievements['five_sessions']['unlocked'])
        self.assertEqual(achievements['five_sessions']['progress'], 2)
        self.assertEqual(achievements['five_sessions']['reward_coins'], 75)

    def test_achievement_rewards_are_awarded_once(self):
        self.client.force_authenticate(user=self.user)

        create_response = self.client.post(
            '/api/pomodoro/sessions/',
            {'duration_minutes': 60},
            format='json',
        )

        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(create_response.data['coins_earned'], 10)
        self.assertEqual(create_response.data['achievement_rewards_earned'], 225)
        self.assertEqual(create_response.data['coins'], 335)

        self.user.refresh_from_db()
        self.assertEqual(self.user.coins, 335)
        self.assertCountEqual(
            self.user.claimed_achievements,
            ['first_focus', 'one_hour', 'focused_day', 'long_session'],
        )

        stats_response = self.client.get('/api/pomodoro/stats/')

        self.assertEqual(stats_response.status_code, status.HTTP_200_OK)
        self.assertEqual(stats_response.data['achievement_rewards_earned'], 0)
        self.assertEqual(stats_response.data['coins'], 335)

        self.user.refresh_from_db()
        self.assertEqual(self.user.coins, 335)
