import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '/api';

// Единый axios-клиент для всех запросов к Django REST API.
const api = axios.create({
    // baseURL позволяет писать в методах только относительные пути: /login/, /profile/ и т.д.
    baseURL: API_BASE_URL,
    // Backend ожидает JSON, поэтому этот заголовок ставится для всех запросов по умолчанию.
    headers: { 'Content-Type': 'application/json' },
});

// Перед каждым запросом добавляем access-токен, если пользователь авторизован.
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('access_token');
        // Если токена нет, запрос остаётся гостевым.
        if (token) config.headers.Authorization = `Bearer ${token}`;
        return config;
    },
    (error) => Promise.reject(error)
);

// Если access-токен истёк, пробуем обновить его через refresh-токен
// и повторяем исходный запрос один раз.
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
            // _retry защищает от бесконечного цикла, если refresh тоже вернул 401.
            originalRequest._retry = true;
            const refreshToken = localStorage.getItem('refresh_token');
            if (refreshToken) {
                try {
                    // Refresh-запрос делаем обычным axios, чтобы не попасть в тот же interceptor.
                    const response = await axios.post(`${API_BASE_URL}/token/refresh/`, { refresh: refreshToken });
                    localStorage.setItem('access_token', response.data.access);
                    originalRequest.headers.Authorization = `Bearer ${response.data.access}`;
                    // Повторяем исходный запрос уже с новым access-токеном.
                    return api(originalRequest);
                } catch (refreshError) {
                    // Если refresh не сработал, локальная сессия больше невалидна.
                    localStorage.removeItem('access_token');
                    localStorage.removeItem('refresh_token');
                    localStorage.removeItem('user');
                    window.location.href = '/auth';
                }
            }
        }
        return Promise.reject(error);
    }
);

// API аутентификации и профиля.
export const authAPI = {
    register: (data) => api.post('/register/', data),
    login: (data) => api.post('/login/', data),
    getMe: () => api.get('/me/'),
    getProfile: () => api.get('/profile/'),
    updateProfile: (data) => api.patch('/profile/', data),
    changePassword: (data) => api.post('/change-password/', data),
    logout: (refresh) => api.post('/logout/', refresh ? { refresh } : {}),
};

// API таймера и статистики Pomodoro.
export const pomodoroAPI = {
    getStats: () => api.get('/pomodoro/stats/'),
    saveSession: (data) => api.post('/pomodoro/sessions/', data),
    getCoins: () => api.get('/shop/coins/'),
};

// API базовой светлой/тёмной темы интерфейса.
export const themeAPI = {
    getUserTheme: () => api.get('/theme/'),
    setUserTheme: (theme) => api.put('/theme/', { theme }),
    getGuestTheme: () => api.get('/theme/guest/'),
    setGuestTheme: (theme) => api.post('/theme/guest/', { theme }),
};

// API магазина: аватары, монеты, темы, звуки и ежедневный бонус.
export const shopAPI = {
    getAvatars: () => api.get('/shop/avatars/'),
    buyAvatar: (avatarId) => api.post(`/shop/avatars/${avatarId}/buy/`),
    activateAvatar: (avatarId) => api.post(`/shop/avatars/${avatarId}/activate/`),
    getMyAvatars: () => api.get('/shop/my-avatars/'),
    getCoins: () => api.get('/shop/coins/', {
        headers: {
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
        },
        params: {
            _ts: Date.now(),
        },
    }),
    getPreferences: () => api.get('/shop/preferences/'),
    selectTheme: (themeId) => api.post(`/shop/themes/${themeId}/select/`),
    selectSound: (soundId) => api.post(`/shop/sounds/${soundId}/select/`),
    claimDailyBonus: () => api.post('/shop/bonus/'),
};

export default api;
