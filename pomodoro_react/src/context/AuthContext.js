import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { authAPI } from '../services/api';
import { clearLegacyShopStorage, getStorageNamespace, removeShopStorage, SHOP_STORAGE_KEYS, writeShopStorage } from '../utils/storage';

const AuthContext = createContext();

// Хук-обёртка, чтобы компоненты могли брать auth-состояние без прямой работы с Context.
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    // user хранит объект пользователя, который приходит от backend.
    const [user, setUser] = useState(null);
    // loading=true, пока приложение проверяет, есть ли валидная сессия.
    const [loading, setLoading] = useState(true);
    // isAuthenticated удобно использовать в UI, чтобы не проверять user вручную.
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    // Сохраняем токены и пользователя после входа или регистрации.
    const persistAuth = useCallback((payload) => {
        const userData = payload.user;
        const access = payload.tokens?.access;
        const refresh = payload.tokens?.refresh;
        // access нужен для обычных запросов, refresh — для обновления истёкшего access.
        if (access) localStorage.setItem('access_token', access);
        if (refresh) localStorage.setItem('refresh_token', refresh);
        if (userData) {
            // Дублируем пользователя в localStorage, чтобы данные переживали обновление страницы.
            localStorage.setItem('user', JSON.stringify(userData));
            setUser(userData);
            setIsAuthenticated(true);
        }
        return payload;
    }, []);

    // Полностью очищаем авторизационные данные при выходе или невалидном токене.
    const clearAuth = useCallback(() => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        setUser(null);
        setIsAuthenticated(false);
    }, []);

    // При старте приложения проверяем, можно ли восстановить сессию из localStorage.
    const checkAuth = useCallback(async () => {
        const token = localStorage.getItem('access_token');
        if (!token) {
            // Если токена нет, запрос на /me/ не нужен.
            clearAuth();
            setLoading(false);
            return;
        }
        try {
            // /me/ подтверждает, что токен ещё валиден, и возвращает актуального пользователя.
            const response = await authAPI.getMe();
            if (response.data?.authenticated && response.data.user) {
                setUser(response.data.user);
                setIsAuthenticated(true);
            } else {
                clearAuth();
            }
        } catch (error) {
            clearAuth();
        } finally {
            setLoading(false);
        }
    }, [clearAuth]);

    // useEffect без пользовательского события запускает проверку сессии при монтировании Provider.
    useEffect(() => { checkAuth(); }, [checkAuth]);

    const register = useCallback(async (userData) => {
        // register возвращает те же токены, что и login, поэтому используем общий persistAuth.
        const response = await authAPI.register(userData);
        return persistAuth(response.data);
    }, [persistAuth]);

    const login = useCallback(async (credentials) => {
        // credentials содержит login/password из формы Auth.js.
        const response = await authAPI.login(credentials);
        return persistAuth(response.data);
    }, [persistAuth]);

    const logout = useCallback(async () => {
        const refreshToken = localStorage.getItem('refresh_token');
        try {
            // Сообщаем backend о выходе, но локальную очистку делаем даже если запрос упал.
            await authAPI.logout(refreshToken);
        } catch (error) {}
        finally { 
            clearAuth();
            const guestNamespace = getStorageNamespace(false, null);
            // После выхода возвращаем гостевое состояние к дефолтным настройкам.
            document.body.classList.remove('theme-forest', 'theme-twilight', 'theme-dream');
            document.body.classList.add('theme-default');
            writeShopStorage(guestNamespace, SHOP_STORAGE_KEYS.activeTheme, 'default');
            writeShopStorage(guestNamespace, SHOP_STORAGE_KEYS.activeSound, 'default');
            removeShopStorage(guestNamespace, SHOP_STORAGE_KEYS.alarmSoundType);
            localStorage.removeItem('timerMode');
            localStorage.removeItem('timerTimeLeft');
            localStorage.removeItem('timerCycles');
            localStorage.removeItem('timerRunning');
            clearLegacyShopStorage();
        }
    }, [clearAuth]);

    // Обновляем пользователя одновременно в React state и localStorage.
    const updateUser = useCallback((newData) => {
        setUser((prev) => {
            const nextUser = { ...(prev || {}), ...newData };
            localStorage.setItem('user', JSON.stringify(nextUser));
            return nextUser;
        });
    }, []);

    return (
        // Всё, что лежит в value, доступно любому компоненту через useAuth().
        <AuthContext.Provider value={{ user, loading, isAuthenticated, register, login, logout, updateUser, checkAuth }}>
            {children}
        </AuthContext.Provider>
    );
};
