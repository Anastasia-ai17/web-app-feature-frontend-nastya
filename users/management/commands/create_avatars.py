from django.core.management.base import BaseCommand
from users.models import Avatar

class Command(BaseCommand):
    help = 'Создаёт начальные аватары для магазина'

    def handle(self, *args, **options):
        avatars = [
            {'name': 'Пёс', 'image': 'avatars/dog.png', 'price_coins': 0, 'is_default': True},
            {'name': 'Кот', 'image': 'avatars/cat.png', 'price_coins': 50, 'is_default': False},
            {'name': 'Рыбка', 'image': 'avatars/fish.png', 'price_coins': 30, 'is_default': False},
            {'name': 'Птичка', 'image': 'avatars/bird.png', 'price_coins': 40, 'is_default': False},
            {'name': 'Хорёк', 'image': 'avatars/ferret.png', 'price_coins': 80, 'is_default': False},
            {'name': 'Лягушка', 'image': 'avatars/frog.png', 'price_coins': 25, 'is_default': False},
        ]
        
        for data in avatars:
            Avatar.objects.get_or_create(
                name=data['name'],
                defaults=data
            )
        
        self.stdout.write(self.style.SUCCESS('Аватары созданы'))