import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { themeAPI } from '../services/api';
import { getStorageNamespace, getUiThemeStorageKey } from '../utils/storage';

const ThemeContext = createContext();

// Общий доступ к текущей теме и функции переключения.
export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider = ({ children }) => {
    // ThemeProvider зависит от AuthContext, потому что тема хранится отдельно для гостя и пользователя.
    const { isAuthenticated, loading: authLoading, user } = useAuth();
    // light — базовая тема по умолчанию до чтения localStorage/API.
    const [theme, setTheme] = useState('light');

    // Тема применяется глобальным классом на body, поэтому CSS может менять весь интерфейс.
    const applyTheme = useCallback((newTheme, namespace) => {
        // Для тёмной темы добавляем body.dark, для светлой убираем.
        if (newTheme === 'dark') {
            document.body.classList.add('dark');
        } else {
            document.body.classList.remove('dark');
        }
        // Ключ содержит namespace, поэтому гость и разные пользователи не мешают друг другу.
        localStorage.setItem(getUiThemeStorageKey(namespace), newTheme);
    }, []);

    // Сначала показываем сохранённую локальную тему, затем синхронизируемся с сервером.
    const loadThemeFromServer = useCallback(async () => {
        const namespace = getStorageNamespace(isAuthenticated, user?.id);
        const token = localStorage.getItem('access_token');
        const savedTheme = localStorage.getItem(getUiThemeStorageKey(namespace));
        
        if (savedTheme && (savedTheme === 'light' || savedTheme === 'dark')) {
            // Локальная тема применяется первой, чтобы интерфейс не мигал при загрузке.
            setTheme(savedTheme);
            applyTheme(savedTheme, namespace);
        }
        
        try {
            // Для авторизованного пользователя берём личную тему, для гостя — гостевую.
            const response = token ? await themeAPI.getUserTheme() : await themeAPI.getGuestTheme();
            if (response.data.theme && (response.data.theme === 'light' || response.data.theme === 'dark')) {
                setTheme(response.data.theme);
                applyTheme(response.data.theme, namespace);
            }
        } catch (error) {
            console.error('Failed to load theme:', error);
        }
    }, [applyTheme, isAuthenticated, user?.id]);

    useEffect(() => {
        // Ждём AuthContext, иначе namespace может сначала быть guest, а потом user:id.
        if (authLoading) return;
        loadThemeFromServer();
    }, [authLoading, isAuthenticated, user?.id, loadThemeFromServer]);

    const toggleTheme = useCallback(async () => {
        const namespace = getStorageNamespace(isAuthenticated, user?.id);
        // Переключатель работает только между двумя базовыми UI-темами.
        const newTheme = theme === 'light' ? 'dark' : 'light';
        // Оптимистично меняем UI сразу, не дожидаясь ответа сервера.
        setTheme(newTheme);
        applyTheme(newTheme, namespace);
        const token = localStorage.getItem('access_token');
        try {
            if (token) await themeAPI.setUserTheme(newTheme);
            else await themeAPI.setGuestTheme(newTheme);
        } catch (error) { console.error('Failed to save theme:', error); }
    }, [theme, applyTheme, isAuthenticated, user?.id]);

    return (
        // Компоненты получают только текущую тему и функцию переключения.
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};
