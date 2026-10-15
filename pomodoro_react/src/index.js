import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import App from './App';
import './styles/global.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <React.StrictMode>
        {/* BrowserRouter включает клиентскую маршрутизацию без перезагрузки страницы. */}
        <BrowserRouter>
            {/* AuthProvider делает данные пользователя доступными во всех компонентах через useAuth(). */}
            <AuthProvider>
                {/* ThemeProvider управляет светлой/тёмной темой интерфейса. */}
                <ThemeProvider>
                    <App />
                </ThemeProvider>
            </AuthProvider>
        </BrowserRouter>
    </React.StrictMode>
);
