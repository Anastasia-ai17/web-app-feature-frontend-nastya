# FocusFlow React Frontend

Эта папка содержит клиентскую часть FocusFlow: одностраничное React-приложение для Pomodoro-таймера, авторизации, профиля, магазина, тем и статистики.

## Как запускается приложение

`public/index.html` содержит `<div id="root"></div>`.

`src/index.js` находит этот элемент, создаёт React root и подключает:

- `BrowserRouter` для маршрутов без перезагрузки страницы;
- `AuthProvider` для пользователя и JWT-токенов;
- `ThemeProvider` для светлой/тёмной темы;
- `App` как главный компонент приложения.

`src/App.js` описывает маршруты:

- `/` — главная страница с таймером;
- `/auth` — вход;
- `/regist` — регистрация;
- `/person` — профиль;
- `/shop` — магазин.

Все страницы открываются внутри `components/base/Base.js`, где находятся шапка, навигация и `Outlet` для текущего маршрута.

## Структура папок

`src/components/` — React-компоненты страниц:

- `base/Base.js` — общий layout с шапкой, навигацией и переключателем темы;
- `index/Index.js` — главный Pomodoro-таймер и настройки времени;
- `auth/Auth.js` — форма входа;
- `regist/Regist.js` — форма регистрации;
- `person/Person.js` — профиль, статистика, достижения и смена пароля;
- `shop/Shop.js` — магазин тем, звуков, аватаров и ежедневного бонуса.

`src/context/` — глобальное состояние через React Context:

- `AuthContext.js` — пользователь, авторизация, регистрация, выход, обновление профиля;
- `ThemeContext.js` — светлая/тёмная тема;
- `TimerContext.js` — режим таймера, время, циклы, настройки, звук и сохранение сессий.

`src/services/` — работа с API:

- `api.js` — общий `axios`-клиент, JWT-interceptors и группы endpoint-методов.

`src/utils/` — вспомогательные функции:

- `storage.js` — namespaced-ключи `localStorage` для гостя и пользователя;
- `apiErrors.js` — преобразование разных форматов ошибок API в строку.

`src/styles/` — CSS по областям интерфейса:

- `global.css` — reset, фон, глобальные темы магазина и общие анимации;
- `base.css` — шапка и общий layout;
- `index.css` — таймер и настройки времени;
- `auth.css` — вход и регистрация;
- `person.css` — профиль, статистика и достижения;
- `shop.css` — магазин;
- `regist.css` — старый резервный файл стилей регистрации, сейчас компонент использует `auth.css`.

`public/` — статические файлы:

- `index.html` — HTML-шаблон для React;
- `manifest.json` — PWA-метаданные Create React App;
- `robots.txt` — правила индексации;
- `favicon.ico`, `logo192.png`, `logo512.png` — иконки.

## Связь с backend

React обращается к Django API через `/api`. В `src/services/api.js` базовый URL задаётся так:

```js
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '/api';
```

В разработке `package.json` также содержит proxy на `http://localhost:8000`, чтобы локальный frontend мог ходить в Django.

`axios` автоматически добавляет `Authorization: Bearer <access_token>` к запросам, если токен есть в `localStorage`. При ответе `401` приложение пытается обновить access-токен через refresh-токен.

## Комментарии в коде

Комментарии добавлены в ключевые места:

- вход приложения и маршруты;
- все контексты;
- API-клиент;
- компоненты страниц;
- утилиты;
- CSS-разделы;
- HTML-шаблон.

В JSON-файлы (`package.json`, `package-lock.json`, `manifest.json`) комментарии не добавлены, потому что стандарт JSON не поддерживает комментарии.

## Команды

```bash
npm start
```

Запускает frontend в режиме разработки.

```bash
npm run build
```

Собирает production-версию в папку `build`.

```bash
npm test
```

Запускает тестовый runner Create React App.
