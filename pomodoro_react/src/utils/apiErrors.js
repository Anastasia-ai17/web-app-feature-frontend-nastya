// Приводит разные форматы ошибок Django/DRF к одной строке для показа в формах.
export function getErrorMessage(payload, fallback) {
    if (!payload) return fallback;

    // API иногда возвращает строку, массив или объект с detail/error/errors.
    if (typeof payload === 'string') return payload;
    if (Array.isArray(payload)) return payload.filter(Boolean).join(' ');

    const source = payload.errors || payload.detail || payload.error || payload;
    if (typeof source === 'string') return source;
    if (Array.isArray(source)) return source.filter(Boolean).join(' ');
    if (typeof source !== 'object') return fallback;

    // Для объектных ошибок собираем все строковые значения в одно сообщение.
    return Object.values(source)
        .flat()
        .filter((value) => typeof value === 'string' && value.trim())
        .join(' ') || fallback;
}
