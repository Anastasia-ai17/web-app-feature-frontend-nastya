import React, { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import Base from './components/base/Base';
import Index from './components/index/Index';
import Auth from './components/auth/Auth';
import Regist from './components/regist/Regist';
import Person from './components/person/Person';
import Shop from './components/shop/Shop';
import { shopAPI } from './services/api';
import { useAuth } from './context/AuthContext';
import { TimerProvider } from './context/TimerContext';
import { getStorageNamespace, readShopStorage, SHOP_STORAGE_KEYS, writeShopStorage } from './utils/storage';
import './styles/global.css';

function App() {
    // loading не даёт показать страницы раньше, чем AuthContext проверит текущую сессию.
    const { loading, isAuthenticated, user } = useAuth();

    // Синхронизируем купленную тему магазина: сначала применяем локальную,
    // затем для авторизованного пользователя уточняем значение с сервера.
    useEffect(() => {
        if (loading) return;
        let isCancelled = false;
        const namespace = getStorageNamespace(isAuthenticated, user?.id);
        const body = document.body;
        
        // Список тем ограничивает классы, которые приложение может добавить на body.
        const themes = ['default', 'forest', 'twilight', 'dream'];
        const applyThemeClass = (themeId) => {
            // Сначала снимаем все классы тем, чтобы на body не осталось несколько тем сразу.
            themes.forEach(theme => body.classList.remove(`theme-${theme}`));
            if (themeId && themes.includes(themeId) && themeId !== 'default') {
                body.classList.add(`theme-${themeId}`);
            } else {
                body.classList.add('theme-default');
            }
        };

        const syncTheme = async () => {
            // Локальная тема применяется мгновенно, чтобы не ждать сетевой запрос.
            const savedTheme = readShopStorage(namespace, SHOP_STORAGE_KEYS.activeTheme);
            applyThemeClass(savedTheme);

            if (!isAuthenticated) return;
            try {
                const response = await shopAPI.getPreferences();
                const serverTheme = response.data?.active_theme;
                if (!serverTheme || !themes.includes(serverTheme)) return;
                writeShopStorage(namespace, SHOP_STORAGE_KEYS.activeTheme, serverTheme);
                // isCancelled защищает от обновления DOM после размонтирования эффекта.
                if (!isCancelled) applyThemeClass(serverTheme);
            } catch (error) {
                console.error('Failed to load active theme:', error);
            }
        };

        syncTheme();
        return () => { isCancelled = true; };
    }, [loading, isAuthenticated, user?.id]);

    if (loading) {
        // Пока идёт восстановление сессии, показываем простой экран загрузки вместо маршрутов.
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: '20px' }}>
                🌊 Загрузка FocusFlow...
            </div>
        );
    }

    return (
        // TimerProvider хранит состояние таймера отдельно от конкретной страницы,
        // чтобы таймер и настройки были доступны всем вложенным маршрутам.
        <TimerProvider>
            <Routes>
                {/* Base содержит общий layout: шапку, навигацию и Outlet для страниц. */}
                <Route path="/" element={<Base />}>
                    <Route index element={<Index />} />
                    <Route path="auth" element={<Auth />} />
                    <Route path="regist" element={<Regist />} />
                    <Route path="person" element={<Person />} />
                    <Route path="shop" element={<Shop />} />
                </Route>
            </Routes>
        </TimerProvider>
    );
}

export default App;
