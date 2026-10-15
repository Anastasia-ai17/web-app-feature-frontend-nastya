from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken


User = get_user_model()


class UserApiTests(APITestCase):
    def test_register_returns_tokens_and_user(self):
        response = self.client.post(
            '/api/register/',
            {
                'username': 'corgi',
                'email': 'corgi@example.com',
                'password': 'StrongPass123!',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('tokens', response.data)
        self.assertEqual(response.data['user']['username'], 'corgi')

    def test_login_accepts_email_and_returns_tokens(self):
        User.objects.create_user(
            username='corgi',
            email='corgi@example.com',
            password='StrongPass123!',
        )

        response = self.client.post(
            '/api/login/',
            {
                'login': 'corgi@example.com',
                'password': 'StrongPass123!',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data['tokens'])

    def test_profile_and_password_change_require_auth(self):
        response = self.client.get('/api/profile/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        response = self.client.post(
            '/api/change-password/',
            {'current_password': 'x', 'new_password': 'y'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_blacklists_refresh_token(self):
        user = User.objects.create_user(
            username='logout',
            email='logout@example.com',
            password='StrongPass123!',
        )
        refresh = RefreshToken.for_user(user)
        access = str(refresh.access_token)

        response = self.client.post(
            '/api/logout/',
            {'refresh': str(refresh)},
            HTTP_AUTHORIZATION=f'Bearer {access}',
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        refresh_response = self.client.post(
            '/api/token/refresh/',
            {'refresh': str(refresh)},
            format='json',
        )
        self.assertEqual(refresh_response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_authenticated_user_can_update_profile_and_theme(self):
        user = User.objects.create_user(
            username='corgi',
            email='corgi@example.com',
            password='StrongPass123!',
        )
        self.client.force_authenticate(user=user)

        profile_response = self.client.patch(
            '/api/profile/',
            {'birthdate': '2024-03-11', 'avatar': 'fa-cat'},
            format='json',
        )
        theme_response = self.client.put('/api/theme/', {'theme': 'dark'}, format='json')

        self.assertEqual(profile_response.status_code, status.HTTP_200_OK)
        self.assertEqual(profile_response.data['user']['avatar'], 'fa-cat')
        self.assertEqual(theme_response.status_code, status.HTTP_200_OK)
        self.assertEqual(theme_response.data['theme'], 'dark')

        user.refresh_from_db()
        self.assertEqual(str(user.birthdate), '2024-03-11')
        self.assertEqual(user.avatar, 'fa-cat')
        self.assertEqual(user.theme, 'dark')

    def test_authenticated_user_can_update_timer_settings(self):
        user = User.objects.create_user(
            username='timer',
            email='timer@example.com',
            password='StrongPass123!',
        )
        self.client.force_authenticate(user=user)

        response = self.client.patch(
            '/api/profile/',
            {
                'timer_work_minutes': 40,
                'timer_short_break_minutes': 7,
                'timer_long_break_minutes': 20,
                'timer_cycles_before_long_break': 3,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['user']['timer_work_minutes'], 40)
        self.assertEqual(response.data['user']['timer_short_break_minutes'], 7)
        self.assertEqual(response.data['user']['timer_long_break_minutes'], 20)
        self.assertEqual(response.data['user']['timer_cycles_before_long_break'], 3)

        user.refresh_from_db()
        self.assertEqual(user.timer_work_minutes, 40)
        self.assertEqual(user.timer_short_break_minutes, 7)
        self.assertEqual(user.timer_long_break_minutes, 20)
        self.assertEqual(user.timer_cycles_before_long_break, 3)

    def test_authenticated_user_can_use_shop_preferences(self):
        user = User.objects.create_user(
            username='shopper',
            email='shopper@example.com',
            password='StrongPass123!',
            coins=1000,
        )
        self.client.force_authenticate(user=user)

        bonus_response = self.client.post('/api/shop/bonus/', {}, format='json')
        theme_response = self.client.post('/api/shop/themes/forest/select/', {}, format='json')
        sound_response = self.client.post('/api/shop/sounds/trill/select/', {}, format='json')
        avatar_response = self.client.post('/api/shop/avatars/fa-fox/buy/', {}, format='json')
        preferences_response = self.client.get('/api/shop/preferences/')

        self.assertEqual(bonus_response.status_code, status.HTTP_200_OK)
        self.assertEqual(theme_response.status_code, status.HTTP_200_OK)
        self.assertEqual(sound_response.status_code, status.HTTP_200_OK)
        self.assertEqual(avatar_response.status_code, status.HTTP_200_OK)
        self.assertEqual(preferences_response.status_code, status.HTTP_200_OK)

        self.assertEqual(preferences_response.data['coins'], 50)
        self.assertIn('forest', preferences_response.data['purchased_themes'])
        self.assertIn('trill', preferences_response.data['purchased_sounds'])
        self.assertIn('fa-fox', preferences_response.data['purchased_avatars'])
        self.assertEqual(preferences_response.data['active_theme'], 'forest')
        self.assertEqual(preferences_response.data['active_sound'], 'trill')

    def test_daily_bonus_can_be_claimed_once_per_day(self):
        user = User.objects.create_user(
            username='bonus',
            email='bonus@example.com',
            password='StrongPass123!',
        )
        self.client.force_authenticate(user=user)

        first_response = self.client.post('/api/shop/bonus/', {}, format='json')
        second_response = self.client.post('/api/shop/bonus/', {}, format='json')

        self.assertEqual(first_response.status_code, status.HTTP_200_OK)
        self.assertEqual(second_response.status_code, status.HTTP_400_BAD_REQUEST)
