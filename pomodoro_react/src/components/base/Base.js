import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import '../../styles/base.css';

// Base — общий каркас всех страниц: верхняя панель, навигация и место для текущего маршрута.
function Base() {
    const { isAuthenticated, user } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const navigate = useNavigate();

    return (
        <>
            <header className="header">
                <div className="header-content">
                    <button
                        type="button"
                        className="logo"
                        // Переход через navigate сохраняет поведение SPA без перезагрузки документа.
                        onClick={() => navigate('/')}
                        aria-label="Перейти на главную страницу"
                    >
                        <i className="fa-solid fa-water"></i> {/* Иконка потока/волны */}
                        <span>FocusFlow</span>
                    </button>
                    <nav className="nav">
                        {/* NavLink сам определяет активный маршрут и добавляет active-класс. */}
                        <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                            <i className="fa-solid fa-house"></i>
                            Главная
                        </NavLink>
                        <NavLink to="/shop" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                            <i className="fa-solid fa-store"></i>
                            Магазин
                        </NavLink>
                        {/* Для авторизованного пользователя показываем профиль, иначе ссылку на вход. */}
                        {isAuthenticated ? (
                            <NavLink to="/person" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                                <i className="fa-solid fa-user"></i>
                                {user?.username || 'Профиль'}
                            </NavLink>
                        ) : (
                            <NavLink to="/auth" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                                <i className="fa-solid fa-right-to-bracket"></i>
                                Авторизация
                            </NavLink>
                        )}
                    </nav>
                    <button
                        type="button"
                        className={`theme-toggle ${theme === 'dark' ? 'dark' : ''}`}
                        onClick={toggleTheme}
                        aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
                    >
                        {/* Обе иконки находятся в кнопке, CSS показывает нужную по текущей теме. */}
                        <i className="fa-solid fa-moon"></i>
                        <i className="fa-solid fa-sun"></i>
                    </button>
                </div>
            </header>
            <main className="main">
                {/* Outlet рендерит дочерний Route из App.js. */}
                <Outlet />
            </main>
        </>
    );
}

export default Base;
