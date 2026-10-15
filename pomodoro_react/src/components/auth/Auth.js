import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getErrorMessage } from '../../utils/apiErrors';
import '../../styles/auth.css';

// Auth — форма входа. После успешной авторизации данные сохраняются в AuthContext.
function Auth() {
    // Поля формы хранятся локально, потому что они нужны только этому экрану.
    // login может быть email или username — backend сам разбирает, что пришло.
    const [login, setLogin] = useState('');
    // password обновляется при каждом вводе, это называется контролируемый input.
    const [password, setPassword] = useState('');
    // showPassword отвечает только за отображение: пароль как text или как password.
    const [showPassword, setShowPassword] = useState(false);
    // loading блокирует кнопку, чтобы пользователь не отправил форму несколько раз подряд.
    const [loading, setLoading] = useState(false);
    // errorMessage хранит человекочитаемую ошибку для вывода над формой.
    const [errorMessage, setErrorMessage] = useState('');
    // Переименовываем login из AuthContext в loginUser, чтобы не конфликтовать со state login.
    const { login: loginUser } = useAuth();
    // navigate программно меняет маршрут внутри SPA.
    const navigate = useNavigate();
    // location нужен, чтобы вернуть пользователя на страницу, с которой его отправили на вход.
    const location = useLocation();

    // Отправляем форму в AuthContext, а он уже вызывает API и сохраняет токены.
    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMessage('');
        setLoading(true);
        try {
            await loginUser({ login, password });
            // Если пользователь пришёл с защищённой страницы, возвращаем его туда.
            navigate(location.state?.from || '/', { replace: true });
        } catch (error) {
            setErrorMessage(getErrorMessage(error.response?.data, 'Неверное имя пользователя или пароль'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-page">
            <div className="card">
                <div className="logo">
                    {/* SVG — это векторная картинка. Числа в path d — координаты и команды рисования. */}
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        {/* M, C, s, z внутри d говорят браузеру, как построить контур иконки. */}
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1 .45-1.41.81-1.41 1.36 0 .55.45.99 1 .99h.01c.55 0 1-.45 1-1 0-.17-.03-.33-.09-.48-.16-.39-.51-.71-1.01-.97-1.25-.64-1.81-1.46-1.81-2.54 0-1.38 1.06-2.5 2.5-2.5.7 0 1.32.28 1.78.74l.42-.42c.2-.2.51-.2.71 0 .2.2.2.51 0 .71l-.49.49c.24.44.38.95.38 1.48 0 1.38-1.06 2.5-2.5 2.5-.7 0-1.32-.28-1.78-.74l-.42.42c-.2.2-.51.2-.71 0-.2-.2-.2-.51 0-.71l.49-.49z" fill="#4F46E5"/>
                    </svg>
                </div>
                <h2>Добро пожаловать!</h2>
                <p className="subtitle">Войди в свой аккаунт ✨</p>
                {/* Ошибка показывается только после неуспешного ответа API. */}
                {errorMessage && <div className="form-feedback error" role="alert">{errorMessage}</div>}
                <form onSubmit={handleSubmit}>
                    <div className="input-group">
                        <label htmlFor="login">Email или имя пользователя</label>
                        {/* value + onChange делают поле контролируемым React-компонентом. */}
                        <input
                            id="login"
                            type="text"
                            value={login}
                            onChange={(e) => setLogin(e.target.value)}
                            placeholder="corgi_lover@mail.ru"
                            autoComplete="username"
                            required
                        />
                    </div>
                    <div className="input-group">
                        <label htmlFor="password">Пароль</label>
                        <div className="password-container">
                            {/* type меняется по showPassword, но state password не очищается. */}
                            <input
                                id="password"
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                autoComplete="current-password"
                                required
                            />
                            <button
                                type="button"
                                className="toggle-password"
                                // Переключаем только тип input, значение пароля остаётся тем же.
                                onClick={() => setShowPassword(!showPassword)}
                                aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                            >
                                <i className={`fa-regular ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                            </button>
                        </div>
                    </div>
                    {/* disabled={loading} защищает от повторной отправки во время запроса. */}
                    <button type="submit" className="btn" disabled={loading}>{loading ? 'Вход...' : 'Войти'}</button>
                </form>
                {/* Link меняет маршрут через React Router без полной перезагрузки страницы. */}
                <p className="register-link">Ещё нет аккаунта? <Link to="/regist">Создать аккаунт</Link></p>
            </div>
        </div>
    );
}

export default Auth;
