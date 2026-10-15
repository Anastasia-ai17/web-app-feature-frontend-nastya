// Namespace отделяет гостевые настройки от настроек конкретного пользователя.
export const getStorageNamespace = (isAuthenticated, userId) =>
    isAuthenticated && userId ? `user:${userId}` : 'guest';

// Ключи магазина хранятся централизованно, чтобы не дублировать строки по компонентам.
export const SHOP_STORAGE_KEYS = {
    coins: 'coins',
    purchasedAvatars: 'purchasedAvatars',
    purchasedThemes: 'purchasedThemes',
    purchasedSounds: 'purchasedSounds',
    activeTheme: 'activeTheme',
    activeSound: 'activeSound',
    alarmSoundType: 'alarmSoundType',
};

// Полные ключи localStorage всегда содержат область приложения и namespace.
export const getShopStorageKey = (namespace, key) => `focusflow.shop.${namespace}.${key}`;
export const getUiThemeStorageKey = (namespace) => `focusflow.ui.${namespace}.theme`;

// Читаем новое имя ключа, а для гостя при необходимости поддерживаем старые legacy-ключи.
export const readShopStorage = (namespace, key, legacyKey = null) => {
    const value = localStorage.getItem(getShopStorageKey(namespace, key));
    if (value !== null) return value;
    return namespace === 'guest' && legacyKey ? localStorage.getItem(legacyKey) : null;
};

// localStorage хранит только строки, поэтому любое значение явно приводится к String.
export const writeShopStorage = (namespace, key, value) => {
    localStorage.setItem(getShopStorageKey(namespace, key), String(value));
};

// Удаление используется при сбросе темы, звука или монет.
export const removeShopStorage = (namespace, key) => {
    localStorage.removeItem(getShopStorageKey(namespace, key));
};

// Очистка старых ключей нужна после миграции на namespaced-хранилище.
export const clearLegacyShopStorage = () => {
    [
        'userCoins',
        'purchasedAvatars',
        'purchasedThemes',
        'purchasedSounds',
        'activeTheme',
        'activeSound',
        'customAlarmSoundType',
        'theme',
    ].forEach((key) => localStorage.removeItem(key));
};
