import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { authAPI, pomodoroAPI, shopAPI } from '../../services/api';
import { getStorageNamespace, readShopStorage, SHOP_STORAGE_KEYS, writeShopStorage } from '../../utils/storage';
import '../../styles/person.css';

// Person — личный кабинет: профиль, дата рождения, аватар, пароль, статистика и достижения.
function Person() {
    const { user, updateUser, logout } = useAuth();
    const navigate = useNavigate();
    // Дата рождения хранится тремя select-полями, чтобы пользователь не вводил формат вручную.
    const [, setBirthdate] = useState('');
    const [birthdateDay, setBirthdateDay] = useState('');
    const [birthdateMonth, setBirthdateMonth] = useState('');
    const [birthdateYear, setBirthdateYear] = useState('');
    const [selectedAvatar, setSelectedAvatar] = useState('fa-dog');
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    // Эти флаги защищают локально выбранный аватар от перезаписи повторной загрузкой профиля.
    const [hasLocalAvatarChange, setHasLocalAvatarChange] = useState(false);
    const localAvatarRef = useRef(null);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [passwordData, setPasswordData] = useState({ current: '', new: '', confirm: '' });
    const [stats, setStats] = useState({
        today: 0,
        week: 0,
        month: 0,
        total_minutes: 0,
        achievements: { unlocked: 0, total: 0, items: [] },
    });

    // Список всех аватаров стабилен, поэтому useMemo не даёт пересоздавать массив на каждый render.
    const allAvatars = useMemo(() => [
        { id: 'fa-dog', name: 'Корги', emoji: '🐶', default: true },
        { id: 'fa-cat', name: 'Кот', emoji: '🐱', default: true },
        { id: 'fa-fish', name: 'Рыбка', emoji: '🐟', default: true },
        { id: 'fa-dove', name: 'Голубь', emoji: '🐦', default: true },
        { id: 'fa-otter', name: 'Выдра', emoji: '🦦', default: true },
        { id: 'fa-frog', name: 'Лягушка', emoji: '🐸', default: true },
        { id: 'fa-fox', name: 'Лисёнок', emoji: '🦊', price: 300 },
        { id: 'fa-panda', name: 'Панда', emoji: '🐼', price: 350 },
        { id: 'fa-penguin', name: 'Пингвин', emoji: '🐧', price: 300 }
    ], []);
    const [availableAvatars, setAvailableAvatars] = useState([]);
    const storageNamespace = getStorageNamespace(true, user?.id);

    // Загружаем купленные аватары: сначала пробуем сервер, затем fallback из localStorage.
    const loadAvatars = useCallback(async () => {
        try {
            const response = await shopAPI.getPreferences();
            const purchasedIds = response.data?.purchased_avatars || [];
            if (purchasedIds.length > 0) {
                writeShopStorage(storageNamespace, SHOP_STORAGE_KEYS.purchasedAvatars, JSON.stringify(purchasedIds));
                setAvailableAvatars(allAvatars.filter(avatar => purchasedIds.includes(avatar.id)));
                return;
            }
        } catch (error) {
            console.error('Error loading purchased avatars:', error);
        }

        const purchased = readShopStorage(storageNamespace, SHOP_STORAGE_KEYS.purchasedAvatars);
        let purchasedIds = [];
        if (purchased) {
            try {
                const parsed = JSON.parse(purchased);
                if (Array.isArray(parsed)) purchasedIds = parsed;
            } catch {}
        }
        if (purchasedIds.length === 0) {
            purchasedIds = allAvatars.filter(a => a.default).map(a => a.id);
            writeShopStorage(storageNamespace, SHOP_STORAGE_KEYS.purchasedAvatars, JSON.stringify(purchasedIds));
        }
        setAvailableAvatars(allAvatars.filter(avatar => purchasedIds.includes(avatar.id)));
    }, [allAvatars, storageNamespace]);

    // Загружаем профиль пользователя и раскладываем дату рождения по отдельным select.
    const loadUserData = useCallback(async () => {
        if (isSaving || hasLocalAvatarChange) return;
        try {
            const response = await authAPI.getProfile();
            const userData = response.data.user || response.data;
            const birthdateStr = userData.birthdate || '';
            setBirthdate(birthdateStr);
            if (birthdateStr) {
                const date = new Date(birthdateStr);
                if (!isNaN(date.getTime())) {
                    setBirthdateDay(date.getDate().toString());
                    setBirthdateMonth((date.getMonth() + 1).toString());
                    setBirthdateYear(date.getFullYear().toString());
                }
            }
            if (userData.avatar && !hasLocalAvatarChange && !localAvatarRef.current) setSelectedAvatar(userData.avatar);
            updateUser(userData);
        } catch (error) { console.error('Error loading user:', error); }
        finally { setLoading(false); }
    }, [updateUser, isSaving, hasLocalAvatarChange]);

    // Статистика приходит отдельно от профиля, потому что это данные Pomodoro-модуля.
    const loadStats = useCallback(async () => {
        try {
            const response = await pomodoroAPI.getStats();
            setStats(response.data);
            if (Number.isFinite(response.data?.coins)) {
                updateUser({ coins: response.data.coins });
            }
        }
        catch (error) {
            console.error('Error loading stats:', error);
            setStats({
                today: 0,
                week: 0,
                month: 0,
                total_minutes: 0,
                achievements: { unlocked: 0, total: 0, items: [] },
            });
        }
    }, [updateUser]);

    // Страница профиля защищена на уровне компонента: без пользователя отправляем на вход.
    useEffect(() => {
        if (!user) { navigate('/auth'); return; }
        loadAvatars(); loadUserData(); loadStats();
    }, [loadUserData, navigate, user, loadStats, loadAvatars]);

    const formatTime = (minutes) => { const hours = Math.floor(minutes / 60); const mins = minutes % 60; return hours > 0 ? `${hours}ч ${mins}м` : `${mins}м`; };
    const formatDate = (dateString) => { if (!dateString) return 'Не указано'; const date = new Date(dateString); return isNaN(date.getTime()) ? 'Не указано' : date.toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' }); };
    // Собираем YYYY-MM-DD только если дата календарно корректна.
    const combineBirthdate = () => {
        if (birthdateDay && birthdateMonth && birthdateYear) {
            const year = parseInt(birthdateYear), month = parseInt(birthdateMonth), day = parseInt(birthdateDay);
            const testDate = new Date(year, month - 1, day);
            if (testDate.getFullYear() === year && testDate.getMonth() === month - 1 && testDate.getDate() === day)
                return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
        return '';
    };
    // Изменение любого select обновляет часть даты и пересобирает итоговое значение.
    const handleDayChange = (e) => { const day = e.target.value; setBirthdateDay(day); if (day && birthdateMonth && birthdateYear) setBirthdate(combineBirthdate()); };
    const handleMonthChange = (e) => {
        const month = e.target.value;
        setBirthdateMonth(month);
        if (birthdateDay && month && birthdateYear) {
            const year = parseInt(birthdateYear), monthNum = parseInt(month), dayNum = parseInt(birthdateDay);
            const lastDayOfMonth = new Date(year, monthNum, 0).getDate();
            if (dayNum > lastDayOfMonth) setBirthdateDay(lastDayOfMonth.toString());
            setBirthdate(combineBirthdate());
        }
    };
    const handleYearChange = (e) => {
        const year = e.target.value;
        setBirthdateYear(year);
        if (birthdateDay && birthdateMonth && year) {
            const monthNum = parseInt(birthdateMonth), dayNum = parseInt(birthdateDay), yearNum = parseInt(year);
            const lastDayOfMonth = new Date(yearNum, monthNum, 0).getDate();
            if (dayNum > lastDayOfMonth) setBirthdateDay(lastDayOfMonth.toString());
            setBirthdate(combineBirthdate());
        }
    };
    // Локальный выбор аватара сразу отражается в UI, но сохраняется только по кнопке.
    const handleAvatarSelect = (avatarId) => { setSelectedAvatar(avatarId); setHasLocalAvatarChange(true); localAvatarRef.current = avatarId; };
    // Сохраняем только редактируемые поля профиля: дату рождения и аватар.
    const saveProfile = async () => {
        setIsSaving(true);
        try {
            const finalBirthdate = combineBirthdate();
            const updateData = {};
            if (finalBirthdate) updateData.birthdate = finalBirthdate;
            if (selectedAvatar) updateData.avatar = String(selectedAvatar);
            await authAPI.updateProfile(updateData);
            updateUser({ ...user, birthdate: finalBirthdate || user?.birthdate, avatar: selectedAvatar || user?.avatar });
            setBirthdate(finalBirthdate);
            setHasLocalAvatarChange(false);
            localAvatarRef.current = null;
            alert('✅ Изменения сохранены!');
        } catch (error) {
            console.error('Save error:', error);
            alert(`❌ ${error.response?.data?.message || error.response?.data?.detail || error.response?.data?.avatar || 'Ошибка сохранения'}`);
        } finally { setIsSaving(false); }
    };
    // Смена пароля идёт отдельным endpoint, текущий пароль в профиле не хранится.
    const changePassword = async () => {
        if (passwordData.new.length < 6) { alert('❌ Пароль должен быть минимум 6 символов'); return; }
        if (passwordData.new !== passwordData.confirm) { alert('❌ Пароли не совпадают'); return; }
        try {
            await authAPI.changePassword({ current_password: passwordData.current, new_password: passwordData.new });
            alert('✅ Пароль успешно изменён!');
            setShowPasswordModal(false);
            setPasswordData({ current: '', new: '', confirm: '' });
        } catch (error) { alert('❌ Неверный текущий пароль'); }
    };
    // UI работает с emoji, а сервер хранит id выбранного аватара.
    const getCurrentAvatarEmoji = () => { const avatar = allAvatars.find(a => a.id === selectedAvatar); return avatar ? avatar.emoji : '🐶'; };
    const handleLogout = useCallback(async () => {
        await logout();
        navigate('/auth', { replace: true });
    }, [logout, navigate]);

    if (loading) return <div className="loading-spinner">Загрузка...</div>;

    return (
        <div className="container">
            {/* Карточка профиля объединяет выбор аватара и редактируемые персональные поля. */}
            <div className="card">
                <h2 className="card-title"><i className="fa-solid fa-circle-user"></i> Профиль пользователя</h2>
                <div className="profile-section">
                    <div className="avatar-section">
                        <div className="avatar"><span style={{ fontSize: '56px' }}>{getCurrentAvatarEmoji()}</span></div>
                        <div className="avatar-selector">
                            {availableAvatars.map(av => (
                                <div key={av.id} className={`avatar-option ${selectedAvatar === av.id ? 'selected' : ''}`} onClick={() => handleAvatarSelect(av.id)} title={av.name}>
                                    <span style={{ fontSize: '28px' }}>{av.emoji}</span>
                                </div>
                            ))}
                        </div>
                        <p className="avatar-hint"><i className="fa-solid fa-store"></i> Новые аватары можно купить в магазине</p>
                    </div>
                    <div className="profile-form">
                        <div className="form-group"><label>Имя пользователя</label><input type="text" value={user?.username || ''} readOnly /></div>
                        <div className="form-group"><label>Email</label><input type="email" value={user?.email || ''} readOnly /></div>
                        <div className="form-group"><label>Дата регистрации</label><input type="text" value={formatDate(user?.date_joined || user?.registration_date)} readOnly /></div>
                        <div className="form-group">
                            <label>Дата рождения</label>
                            <div className="birthdate-selectors">
                                <select value={birthdateDay} onChange={handleDayChange} className="birthdate-select"><option value="">День</option>{Array.from({ length: 31 }, (_, i) => i + 1).map(day => <option key={day} value={day}>{day}</option>)}</select>
                                <select value={birthdateMonth} onChange={handleMonthChange} className="birthdate-select"><option value="">Месяц</option>{[{ value: 1, name: 'Январь' }, { value: 2, name: 'Февраль' }, { value: 3, name: 'Март' }, { value: 4, name: 'Апрель' }, { value: 5, name: 'Май' }, { value: 6, name: 'Июнь' }, { value: 7, name: 'Июль' }, { value: 8, name: 'Август' }, { value: 9, name: 'Сентябрь' }, { value: 10, name: 'Октябрь' }, { value: 11, name: 'Ноябрь' }, { value: 12, name: 'Декабрь' }].map(month => <option key={month.value} value={month.value}>{month.name}</option>)}</select>
                                <select value={birthdateYear} onChange={handleYearChange} className="birthdate-select"><option value="">Год</option>{Array.from({ length: new Date().getFullYear() - 1900 + 1 }, (_, i) => new Date().getFullYear() - i).map(year => <option key={year} value={year}>{year}</option>)}</select>
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Пароль</label>
                            <div className="password-group">
                                <input type="password" value="········" readOnly />
                                <button className="change-password-btn" onClick={() => setShowPasswordModal(true)}><i className="fa-solid fa-key"></i> Сменить</button>
                            </div>
                        </div>
                        <div className="button-group">
                            <button className="save-btn" onClick={saveProfile} disabled={isSaving}>
                                <i className="fa-solid fa-check"></i> {isSaving ? 'Сохранение...' : 'Сохранить изменения'}
                            </button>
                            <button type="button" className="logout-btn" onClick={handleLogout}>
                                <i className="fa-solid fa-sign-out-alt"></i> Выйти из аккаунта
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            {/* Статистика показывает агрегированные минуты за разные периоды. */}
            <div className="card">
                <h2 className="card-title"><i className="fa-solid fa-chart-simple"></i> Статистика</h2>
                <div className="stats-grid">
                    <div className="stat-card"><div className="stat-icon"><i className="fa-solid fa-sun"></i></div><div className="stat-value">{formatTime(stats.today || 0)}</div><div className="stat-label">Сегодня</div></div>
                    <div className="stat-card"><div className="stat-icon"><i className="fa-solid fa-calendar-week"></i></div><div className="stat-value">{formatTime(stats.week || 0)}</div><div className="stat-label">За неделю</div></div>
                    <div className="stat-card"><div className="stat-icon"><i className="fa-solid fa-calendar-alt"></i></div><div className="stat-value">{formatTime(stats.month || 0)}</div><div className="stat-label">За месяц</div></div>
                </div>
            </div>
            {/* Достижения приходят с прогрессом и флагом разблокировки от backend. */}
            <div className="card">
                <div className="achievements-header">
                    <h2 className="card-title"><i className="fa-solid fa-trophy"></i> Достижения</h2>
                    <div className="achievements-count">
                        {stats.achievements?.unlocked || 0}/{stats.achievements?.total || 0}
                    </div>
                </div>
                <div className="achievements-grid">
                    {(stats.achievements?.items || []).map((achievement) => (
                        <div
                            className={`achievement-card ${achievement.unlocked ? 'unlocked' : 'locked'}`}
                            key={achievement.id}
                        >
                            <div className="achievement-icon">
                                <i className={achievement.icon}></i>
                            </div>
                            <div className="achievement-body">
                                <div className="achievement-title">{achievement.title}</div>
                                <div className="achievement-description">{achievement.description}</div>
                                <div className="achievement-progress">
                                    <div
                                        className="achievement-progress-fill"
                                        style={{ width: `${achievement.progress_percent || 0}%` }}
                                    ></div>
                                </div>
                                <div className="achievement-meta">
                                    {achievement.progress}/{achievement.target}
                                </div>
                                <div className="achievement-reward">
                                    <i className="fa-solid fa-coins"></i>
                                    {achievement.reward_coins || 0} монет
                                    {achievement.reward_claimed && <span>Получено</span>}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            {/* Модалка смены пароля открывается только по кнопке в профиле. */}
            <div className={`modal ${showPasswordModal ? 'active' : ''}`}>
                <div className="modal-content">
                    <h3 className="modal-title">Смена пароля</h3>
                    <div className="form-group"><label>Текущий пароль</label><input type="password" value={passwordData.current} onChange={(e) => setPasswordData({ ...passwordData, current: e.target.value })} placeholder="••••••••" /></div>
                    <div className="form-group"><label>Новый пароль</label><input type="password" value={passwordData.new} onChange={(e) => setPasswordData({ ...passwordData, new: e.target.value })} placeholder="••••••••" /></div>
                    <div className="form-group"><label>Подтвердите новый пароль</label><input type="password" value={passwordData.confirm} onChange={(e) => setPasswordData({ ...passwordData, confirm: e.target.value })} placeholder="••••••••" /></div>
                    <div className="modal-actions">
                        <button className="modal-btn secondary" onClick={() => setShowPasswordModal(false)}>Отмена</button>
                        <button className="modal-btn primary" onClick={changePassword}>Сохранить</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Person;
