import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getErrorMessage } from '../../utils/apiErrors';
import '../../styles/auth.css';

// Regist — форма регистрации нового пользователя.
function Regist() {
    // Каждое поле формы контролируется React-состоянием.
    // username, email и password уйдут на backend в register().
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    // confirmPassword нужен только на клиенте, на сервер его не отправляем.
    const [confirmPassword, setConfirmPassword] = useState('');
    // Эти два флага управляют видимостью двух password-input.
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const { register } = useAuth();
    const navigate = useNavigate();
    // Вычисляемое значение, не отдельный state: оно всегда зависит от текущих password-полей.
    const passwordsMatch = password && confirmPassword && password === confirmPassword;

    // Клиентская проверка отсекает очевидные ошибки до запроса на сервер.
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            setErrorMessage('Пароли не совпадают');
            return;
        }
        if (password.length < 6) {
            setErrorMessage('Пароль должен быть минимум 6 символов');
            return;
        }
        setErrorMessage('');
        setLoading(true);
        try {
            await register({ username, email, password });
            // После регистрации пользователь уже авторизован, поэтому ведём его на таймер.
            navigate('/', { replace: true });
        } catch (error) {
            setErrorMessage(getErrorMessage(error.response?.data, 'Ошибка регистрации'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-page">
            <div className="card">
                <div className="logo">
                    {/* SVG-логотип хранится прямо в JSX как вектор, без отдельного файла картинки. */}
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        {/* path d — это координаты и команды, по которым браузер рисует фигуру. */}
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1 .45-1.41.81-1.41 1.36 0 .55.45.99 1 .99h.01c.55 0 1-.45 1-1 0-.17-.03-.33-.09-.48-.16-.39-.51-.71-1.01-.97-1.25-.64-1.81-1.46-1.81-2.54 0-1.38 1.06-2.5 2.5-2.5.7 0 1.32.28 1.78.74l.42-.42c.2-.2.51-.2.71 0 .2.2.2.51 0 .71l-.49.49c.24.44.38.95.38 1.48 0 1.38-1.06 2.5-2.5 2.5-.7 0-1.32-.28-1.78-.74l-.42.42c-.2.2-.51.2-.71 0-.2-.2-.2-.51 0-.71l.49-.49z" fill="#4F46E5"/>
                    </svg>
                </div>
                <h2>Создать аккаунт</h2>
                <p className="subtitle">Начни свой путь к продуктивности ✨</p>
                {/* Сообщение собирается из ответа API через общий helper getErrorMessage. */}
                {errorMessage && <div className="form-feedback error" role="alert">{errorMessage}</div>}
                <form onSubmit={handleSubmit}>
                    <div className="input-group">
                        <label htmlFor="username">Имя пользователя</label>
                        {/* При каждом вводе setUsername обновляет state, а value берёт значение из state. */}
                        <input
                            id="username"
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="corgi_lover"
                            autoComplete="username"
                            required
                        />
                    </div>
                    <div className="input-group">
                        <label htmlFor="email">Электронная почта</label>
                        {/* type="email" включает базовую браузерную проверку формата email. */}
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="hello@focusflow.com"
                            autoComplete="email"
                            required
                        />
                    </div>
                    <div className="input-group">
                        <label htmlFor="register-password">Пароль</label>
                        <div className="password-container">
                            {/* autoComplete="new-password" подсказывает браузеру, что это новый пароль. */}
                            <input
                                id="register-password"
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                autoComplete="new-password"
                                required
                            />
                            <button
                                type="button"
                                className="toggle-password"
                                onClick={() => setShowPassword(!showPassword)}
                                aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                            >
                                <i className={`fa-regular ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                            </button>
                        </div>
                        <small className="hint">минимум 6 символов</small>
                    </div>
                    <div className="input-group">
                        <label htmlFor="confirm-password">Повторите пароль</label>
                        <div className="password-container">
                            {/* Подтверждение пароля проверяется на клиенте в handleSubmit. */}
                            <input
                                id="confirm-password"
                                type={showConfirmPassword ? 'text' : 'password'}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="••••••••"
                                autoComplete="new-password"
                                required
                            />
                            <button
                                type="button"
                                className="toggle-password"
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                aria-label={showConfirmPassword ? 'Скрыть подтверждение пароля' : 'Показать подтверждение пароля'}
                            >
                                <i className={`fa-regular ${showConfirmPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                            </button>
                        </div>
                        {/* Подсказка обновляется сразу при вводе обоих паролей. */}
                        {password && confirmPassword && (
                            <div className={`password-match ${passwordsMatch ? 'match-success' : 'match-error'}`}>
                                <i className={`fa-solid ${passwordsMatch ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i>
                                {passwordsMatch ? ' Пароли совпадают' : ' Пароли не совпадают'}
                            </div>
                        )}
                    </div>
                    {/* Пока loading=true, текст кнопки меняется и повторная отправка запрещена. */}
                    <button type="submit" className="btn" disabled={loading}>{loading ? 'Регистрация...' : 'Зарегистрироваться'}</button>
                </form>
                <p className="login-link">Уже есть аккаунт? <Link to="/auth">Войти</Link></p>
            </div>
        </div>
    );
}

export default Regist;
