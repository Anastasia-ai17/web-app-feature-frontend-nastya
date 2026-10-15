import React, { useCallback, useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { shopAPI } from '../../services/api';
import { getStorageNamespace, readShopStorage, removeShopStorage, SHOP_STORAGE_KEYS, writeShopStorage } from '../../utils/storage';
import '../../styles/shop.css';

// В магазине звук проигрывается сразу в браузере через Web Audio API без аудиофайлов.
const playShopSound = (type) => {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();
    switch(type) {
      case 'default':
        // Простой короткий сигнал на одной частоте.
        const osc1 = audioContext.createOscillator();
        const gain1 = audioContext.createGain();
        osc1.connect(gain1);
        gain1.connect(audioContext.destination);
        osc1.type = 'sine';
        osc1.frequency.value = 880;
        gain1.gain.value = 0.3;
        osc1.start();
        gain1.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.8);
        setTimeout(() => audioContext.close(), 800);
        break;
      case 'trill':
        // Трель собирается из серии коротких нот с задержками.
        const playNote = (freq, duration, delay) => {
          setTimeout(() => {
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();
            osc.connect(gain);
            gain.connect(audioContext.destination);
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.3, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + duration);
            osc.start();
            osc.stop(audioContext.currentTime + duration);
          }, delay);
        };
        playNote(880, 0.15, 0);
        playNote(1046.50, 0.15, 150);
        playNote(880, 0.15, 300);
        playNote(1046.50, 0.15, 450);
        playNote(880, 0.2, 600);
        playNote(1046.50, 0.3, 800);
        setTimeout(() => audioContext.close(), 1200);
        break;
      case 'chime':
        // Звон меняет частоту одного генератора по таймерам.
        const osc3 = audioContext.createOscillator();
        const gain3 = audioContext.createGain();
        osc3.connect(gain3);
        gain3.connect(audioContext.destination);
        osc3.type = 'sine';
        osc3.frequency.value = 523.25;
        gain3.gain.value = 0.3;
        osc3.start();
        setTimeout(() => { osc3.frequency.value = 659.25; }, 150);
        setTimeout(() => { osc3.frequency.value = 783.99; }, 300);
        gain3.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.8);
        setTimeout(() => audioContext.close(), 800);
        break;
      case 'digital':
        // Цифровой сигнал использует square-волну для более резкого звучания.
        const osc4 = audioContext.createOscillator();
        const gain4 = audioContext.createGain();
        osc4.connect(gain4);
        gain4.connect(audioContext.destination);
        osc4.type = 'square';
        osc4.frequency.value = 440;
        gain4.gain.value = 0.3;
        osc4.start();
        setTimeout(() => { osc4.frequency.value = 880; }, 100);
        setTimeout(() => { osc4.frequency.value = 440; }, 200);
        gain4.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.6);
        setTimeout(() => audioContext.close(), 600);
        break;
      default: audioContext.close();
    }
  } catch (e) { console.log('Audio error:', e); if (navigator.vibrate) navigator.vibrate([200, 100, 200]); }
};

// Каталог звуков: ключ используется для хранения и синхронизации с API.
const AVAILABLE_SOUNDS = {
  default: { name: '🔔 Стандартный', type: 'default', icon: 'fa-bell', play: () => playShopSound('default') },
  trill: { name: '🎵 Трель', type: 'trill', price: 200, icon: 'fa-music', play: () => playShopSound('trill') },
  chime: { name: '✨ Нежный звон', type: 'chime', price: 200, icon: 'fa-bell', play: () => playShopSound('chime') },
  digital: { name: '📱 Цифровой сигнал', type: 'digital', price: 200, icon: 'fa-microchip', play: () => playShopSound('digital') }
};

// Каталог тем магазина. Для предпросмотра есть отдельные градиенты под light/dark.
const AVAILABLE_THEMES = {
  default: { name: '🌙 Стандартная', lightBg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', darkBg: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' },
  forest: { name: '🌲 Лесная', lightBg: 'linear-gradient(135deg, #2d6a4f 0%, #1b4332 100%)', darkBg: 'linear-gradient(135deg, #0a2f1f 0%, #051a0f 100%)', price: 500 },
  twilight: { name: '🌅 Рассвет-Закат', lightBg: 'linear-gradient(135deg, #fef08a 0%, #f97316 50%, #ec4899 100%)', darkBg: 'linear-gradient(135deg, #451a03 0%, #7f1d1d 50%, #831843 100%)', price: 500 },
  dream: { name: '🎀 Розовая мечта', lightBg: 'linear-gradient(135deg, #fbcfe8 0%, #f9a8d4 50%, #f472b6 100%)', darkBg: 'linear-gradient(135deg, #4c0519 0%, #9d174d 50%, #be185d 100%)', price: 500 },
};

// Каталог аватаров: default доступны сразу, остальные покупаются за монеты.
const AVAILABLE_AVATARS = [
  { id: 'fa-dog', name: 'Корги', emoji: '🐶', default: true },
  { id: 'fa-cat', name: 'Кот', emoji: '🐱', default: true },
  { id: 'fa-fish', name: 'Рыбка', emoji: '🐟', default: true },
  { id: 'fa-dove', name: 'Голубь', emoji: '🐦', default: true },
  { id: 'fa-otter', name: 'Выдра', emoji: '🦦', default: true },
  { id: 'fa-frog', name: 'Лягушка', emoji: '🐸', default: true },
  { id: 'fa-fox', name: 'Лисёнок', emoji: '🦊', price: 300 },
  { id: 'fa-panda', name: 'Панда', emoji: '🐼', price: 350 },
  { id: 'fa-penguin', name: 'Пингвин', emoji: '🐧', price: 300 }
];

// Серверные ответы могут содержать баланс в разных полях, поэтому нормализуем значение.
const extractCoins = (payload) => {
  const candidates = [
    payload?.coins,
    payload?.balance,
    payload?.user?.coins,
    payload?.user?.balance,
    payload?.preferences?.coins,
  ];
  for (const candidate of candidates) {
    const parsed = Number.parseInt(candidate, 10);
    if (!Number.isNaN(parsed) && parsed >= 0) return parsed;
  }
  return null;
};

// Безопасно читаем массив из localStorage: битый JSON не должен ломать страницу магазина.
const parseStoredArray = (value) => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

// Shop — магазин тем, звуков, аватаров и ежедневного бонуса.
function Shop() {
  const { isAuthenticated, user } = useAuth();
  const { theme } = useTheme();
  // Покупки и активные настройки дублируются в localStorage для быстрого старта UI.
  const [coins, setCoins] = useState(0);
  const [purchasedAvatars, setPurchasedAvatars] = useState([]);
  const [purchasedThemes, setPurchasedThemes] = useState([]);
  const [purchasedSounds, setPurchasedSounds] = useState([]);
  const [activeTheme, setActiveTheme] = useState('default');
  const [activeSound, setActiveSound] = useState('default');
  const [purchaseMessage, setPurchaseMessage] = useState('');
  const storageNamespace = getStorageNamespace(isAuthenticated, user?.id);

  // Монеты всегда сохраняем одновременно в state и namespaced localStorage.
  const persistCoins = useCallback((value) => {
    setCoins(value);
    writeShopStorage(storageNamespace, SHOP_STORAGE_KEYS.coins, value);
  }, [storageNamespace]);

  // Темы магазина управляются классами body.theme-* и работают вместе с dark-классом.
  const applyTheme = useCallback((themeId) => {
    const body = document.body;
    Object.keys(AVAILABLE_THEMES).forEach(theme => {
        body.classList.remove(`theme-${theme}`);
    });
    if (themeId !== 'default') {
        body.classList.add(`theme-${themeId}`);
    } else {
        body.classList.add('theme-default');
    }
    setActiveTheme(themeId);
    writeShopStorage(storageNamespace, SHOP_STORAGE_KEYS.activeTheme, themeId);
  }, [storageNamespace]);

  // Единая синхронизация серверных предпочтений после загрузки, покупки или сброса.
  const syncPreferences = useCallback((preferences) => {
    if (!preferences) return;
    const parsedCoins = extractCoins(preferences);
    if (parsedCoins !== null) persistCoins(parsedCoins);
    if (Array.isArray(preferences.purchased_avatars)) {
      setPurchasedAvatars(preferences.purchased_avatars);
      writeShopStorage(storageNamespace, SHOP_STORAGE_KEYS.purchasedAvatars, JSON.stringify(preferences.purchased_avatars));
    }
    if (Array.isArray(preferences.purchased_themes)) {
      setPurchasedThemes(preferences.purchased_themes);
      writeShopStorage(storageNamespace, SHOP_STORAGE_KEYS.purchasedThemes, JSON.stringify(preferences.purchased_themes));
    }
    if (Array.isArray(preferences.purchased_sounds)) {
      setPurchasedSounds(preferences.purchased_sounds);
      writeShopStorage(storageNamespace, SHOP_STORAGE_KEYS.purchasedSounds, JSON.stringify(preferences.purchased_sounds));
    }
    if (preferences.active_theme) {
      applyTheme(preferences.active_theme);
    }
    if (preferences.active_sound) {
      setActiveSound(preferences.active_sound);
      writeShopStorage(storageNamespace, SHOP_STORAGE_KEYS.activeSound, preferences.active_sound);
      writeShopStorage(storageNamespace, SHOP_STORAGE_KEYS.alarmSoundType, preferences.active_sound);
    }
  }, [applyTheme, persistCoins, storageNamespace]);

  // Загрузка монет: у гостей берём локальный баланс, у пользователя — серверный.
  const loadCoins = useCallback(async () => {
    if (!isAuthenticated) {
      const savedCoins = readShopStorage(storageNamespace, SHOP_STORAGE_KEYS.coins);
      const localCoins = Number.parseInt(savedCoins, 10);
      const normalizedCoins = Number.isNaN(localCoins) || localCoins < 0 ? 0 : localCoins;
      setCoins(normalizedCoins);
      return normalizedCoins;
    }
    try {
      const response = await shopAPI.getCoins();
      const serverCoins = extractCoins(response.data);
      if (serverCoins !== null) {
        persistCoins(serverCoins);
        return serverCoins;
      }
    } catch (error) {
      console.error('Failed to load coins from server:', error);
    }
    setCoins(0);
    removeShopStorage(storageNamespace, SHOP_STORAGE_KEYS.coins);
    return 0;
  }, [isAuthenticated, persistCoins, storageNamespace]);

  // При входе в магазин загружаем покупки и активные настройки.
  useEffect(() => {
    const loadData = async () => {
      if (isAuthenticated) {
        // Авторизованный пользователь считается источником истины на сервере.
        try {
          const response = await shopAPI.getPreferences();
          syncPreferences(response.data);
          if (extractCoins(response.data) === null) {
            await loadCoins();
          }
          return;
        } catch (error) {
          console.error('Failed to load shop preferences:', error);
          await loadCoins();
          return;
        }
      }

      await loadCoins();
      
      // У гостя нет серверного профиля, поэтому покупки и активные настройки берём из localStorage.
      const savedAvatars = parseStoredArray(readShopStorage(storageNamespace, SHOP_STORAGE_KEYS.purchasedAvatars));
      if (savedAvatars) setPurchasedAvatars(savedAvatars);
      else {
        const defaultAvatars = AVAILABLE_AVATARS.filter(a => a.default).map(a => a.id);
        setPurchasedAvatars(defaultAvatars);
        writeShopStorage(storageNamespace, SHOP_STORAGE_KEYS.purchasedAvatars, JSON.stringify(defaultAvatars));
      }
      
      const savedThemes = parseStoredArray(readShopStorage(storageNamespace, SHOP_STORAGE_KEYS.purchasedThemes));
      if (savedThemes) setPurchasedThemes(savedThemes);
      else {
        const defaultThemes = ['default'];
        setPurchasedThemes(defaultThemes);
        writeShopStorage(storageNamespace, SHOP_STORAGE_KEYS.purchasedThemes, JSON.stringify(defaultThemes));
      }
      
      const savedSounds = parseStoredArray(readShopStorage(storageNamespace, SHOP_STORAGE_KEYS.purchasedSounds));
      if (savedSounds) setPurchasedSounds(savedSounds);
      else {
        const defaultSounds = ['default'];
        setPurchasedSounds(defaultSounds);
        writeShopStorage(storageNamespace, SHOP_STORAGE_KEYS.purchasedSounds, JSON.stringify(defaultSounds));
      }
      
      const savedTheme = readShopStorage(storageNamespace, SHOP_STORAGE_KEYS.activeTheme);
      if (savedTheme) { setActiveTheme(savedTheme); applyTheme(savedTheme); }
      
      const savedSound = readShopStorage(storageNamespace, SHOP_STORAGE_KEYS.activeSound);
      if (savedSound) setActiveSound(savedSound);
    };
    
    loadData();
  }, [isAuthenticated, loadCoins, syncPreferences, applyTheme, storageNamespace]);

  // Покупка аватара доступна только авторизованному пользователю.
  const purchaseAvatar = async (avatar) => {
    if (!isAuthenticated) {
      setPurchaseMessage('🔒 Авторизуйтесь, чтобы покупать аватары!');
      setTimeout(() => setPurchaseMessage(''), 3000);
      return;
    }
    if (purchasedAvatars.includes(avatar.id)) { setPurchaseMessage(`❌ У вас уже есть этот аватар!`); setTimeout(() => setPurchaseMessage(''), 3000); return; }
    if (coins < avatar.price) { setPurchaseMessage(`❌ Не хватает монет! Нужно ${avatar.price} 🪙`); setTimeout(() => setPurchaseMessage(''), 3000); return; }
    try {
      const response = await shopAPI.buyAvatar(avatar.id);
      // После покупки сервер возвращает обновлённый набор предпочтений.
      syncPreferences(response.data);
      setPurchaseMessage(`✅ Куплен аватар ${avatar.name}! Теперь выберите его в профиле 🎉`);
      setTimeout(() => setPurchaseMessage(''), 3000);
    } catch (error) {
      setPurchaseMessage(`❌ ${error.response?.data?.error || 'Не удалось купить аватар'}`);
      setTimeout(() => setPurchaseMessage(''), 3000);
    }
  };

  // Выбор темы одновременно покупает её, если она ещё не куплена.
  const purchaseTheme = async (themeId, theme) => {
    if (!isAuthenticated) {
      setPurchaseMessage('🔒 Авторизуйтесь, чтобы покупать темы!');
      setTimeout(() => setPurchaseMessage(''), 3000);
      return;
    }
    if (!purchasedThemes.includes(themeId) && theme.price && coins < theme.price) { setPurchaseMessage(`❌ Не хватает монет! Нужно ${theme.price} 🪙`); setTimeout(() => setPurchaseMessage(''), 3000); return; }
    try {
      const response = await shopAPI.selectTheme(themeId);
      syncPreferences(response.data);
      const message = purchasedThemes.includes(themeId)
        ? `🎨 Тема "${theme.name}" применена!`
        : `✅ Куплена и применена тема "${theme.name}"! 🎨`;
      setPurchaseMessage(message);
      setTimeout(() => setPurchaseMessage(''), 3000);
    } catch (error) {
      setPurchaseMessage(`❌ ${error.response?.data?.error || 'Не удалось применить тему'}`);
      setTimeout(() => setPurchaseMessage(''), 3000);
    }
  };

  // Выбор звука сохраняет его как активный сигнал окончания таймера.
  const purchaseSound = async (soundId, sound) => {
    if (!isAuthenticated) {
      setPurchaseMessage('🔒 Авторизуйтесь, чтобы покупать звуки!');
      setTimeout(() => setPurchaseMessage(''), 3000);
      return;
    }
    if (!purchasedSounds.includes(soundId) && sound.price && coins < sound.price) { setPurchaseMessage(`❌ Не хватает монет! Нужно ${sound.price} 🪙`); setTimeout(() => setPurchaseMessage(''), 3000); return; }
    try {
      const response = await shopAPI.selectSound(soundId);
      syncPreferences(response.data);
      writeShopStorage(storageNamespace, SHOP_STORAGE_KEYS.alarmSoundType, sound.type);
      sound.play();
      const message = purchasedSounds.includes(soundId)
        ? `🔊 Звук "${sound.name}" применён!`
        : `✅ Куплен и применён звук "${sound.name}"! 🔔`;
      setPurchaseMessage(message);
      setTimeout(() => setPurchaseMessage(''), 3000);
    } catch (error) {
      setPurchaseMessage(`❌ ${error.response?.data?.error || 'Не удалось применить звук'}`);
      setTimeout(() => setPurchaseMessage(''), 3000);
    }
  };

  // Ежедневный бонус начисляется сервером, чтобы нельзя было просто накрутить localStorage.
  const getDailyBonus = async () => {
    if (!isAuthenticated) {
      setPurchaseMessage('🔒 Авторизуйтесь, чтобы получать бонусы!');
      setTimeout(() => setPurchaseMessage(''), 3000);
      return;
    }
    try {
      const response = await shopAPI.claimDailyBonus();
      syncPreferences(response.data);
      setPurchaseMessage(`🎁 Вы получили ${response.data.bonus || 50} 🪙 бонусных монет!`);
      setTimeout(() => setPurchaseMessage(''), 3000);
    } catch (error) {
      setPurchaseMessage(`❌ ${error.response?.data?.error || 'Сегодня вы уже получали бонус!'}`);
      setTimeout(() => setPurchaseMessage(''), 3000);
    }
  };

  // Сброс темы возвращает стандартное оформление для сервера или гостевого localStorage.
  const resetTheme = async () => {
    if (isAuthenticated) {
      try {
        const response = await shopAPI.selectTheme('default');
        syncPreferences(response.data);
      } catch (error) {
        console.error('Failed to reset theme:', error);
      }
    } else {
      applyTheme('default');
    }
    setPurchaseMessage('🎨 Тема сброшена до стандартной');
    setTimeout(() => setPurchaseMessage(''), 3000);
  };

  // Сброс звука возвращает стандартный сигнал и очищает override для будильника.
  const resetSound = async () => {
    if (isAuthenticated) {
      try {
        const response = await shopAPI.selectSound('default');
        syncPreferences(response.data);
      } catch (error) {
        console.error('Failed to reset sound:', error);
      }
    } else {
      setActiveSound('default');
      writeShopStorage(storageNamespace, SHOP_STORAGE_KEYS.activeSound, 'default');
    }
    removeShopStorage(storageNamespace, SHOP_STORAGE_KEYS.alarmSoundType);
    setPurchaseMessage('🔔 Звук сброшен до стандартного');
    setTimeout(() => setPurchaseMessage(''), 3000);
  };

  // Общий сброс вызывает две отдельные операции, чтобы сохранить их серверную логику.
  const resetAll = async () => {
    await resetTheme();
    await resetSound();
    setPurchaseMessage('✨ Все настройки сброшены до стандартных!');
    setTimeout(() => setPurchaseMessage(''), 3000);
  };

  return (
    <div className="container">
      {/* Временное уведомление показывает результат покупки, сброса или ошибки. */}
      {purchaseMessage && <div className="shop-notification">{purchaseMessage}</div>}
      <div className="shop-header-card">
        <div className="shop-balance">
          <i className="fa-solid fa-coins"></i>
          <span className="balance-value">{coins}</span>
          <span className="balance-label">монет</span>
        </div>
        <div className="shop-actions">
          <button className="daily-bonus-btn" onClick={getDailyBonus}><i className="fa-solid fa-gift"></i> Ежедневный бонус</button>
        </div>
      </div>

      {/* Раздел тем: показывает предпросмотр, цену и состояние покупки/активации. */}
      <div className="shop-category">
        <h2 className="category-title"><i className="fa-solid fa-palette"></i> Темы оформления</h2>
        <div className="shop-grid">
          {Object.entries(AVAILABLE_THEMES).map(([id, themeOption]) => {
            const isPurchased = purchasedThemes.includes(id);
            const isActive = activeTheme === id;
            const hasPrice = themeOption.price && id !== 'default';
            return (
              <div key={id} className="shop-item theme-item">
                <div className="theme-preview-box">
                  <div className="theme-preview-gradient" style={{ background: theme === 'dark' ? themeOption.darkBg : themeOption.lightBg }}>
                    <div className="theme-preview-content"><i className="fa-solid fa-palette"></i><span>{themeOption.name}</span></div>
                  </div>
                </div>
                <h3 className="shop-item-name">{themeOption.name}</h3>
                <p className="shop-item-description">{id === 'default' ? 'Стандартная тема по умолчанию' : 'Уникальное цветовое оформление'}</p>
                {hasPrice && <div className="shop-item-price"><i className="fa-solid fa-coins"></i>{themeOption.price}</div>}
                <button className={`shop-item-btn ${isActive ? 'active' : ''}`} onClick={() => purchaseTheme(id, themeOption)}>
                  {isActive ? <><i className="fa-solid fa-check"></i> Применено</> : isPurchased ? <><i className="fa-solid fa-check-double"></i> Применить</> : <><i className="fa-solid fa-cart-shopping"></i> Купить</>}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Раздел звуков: каждый звук можно прослушать перед покупкой или выбором. */}
      <div className="shop-category">
        <h2 className="category-title"><i className="fa-solid fa-music"></i> Звуки уведомлений</h2>
        <div className="shop-grid">
          {Object.entries(AVAILABLE_SOUNDS).map(([id, sound]) => {
            const isPurchased = purchasedSounds.includes(id);
            const isActive = activeSound === id;
            const hasPrice = sound.price;
            return (
              <div key={id} className="shop-item">
                <div className="shop-item-icon"><i className={`fa-solid ${sound.icon}`}></i></div>
                <h3 className="shop-item-name">{sound.name}</h3>
                <p className="shop-item-description">{id === 'default' ? 'Стандартный звук будильника' : 'Приятный звук окончания таймера'}</p>
                {hasPrice && <div className="shop-item-price"><i className="fa-solid fa-coins"></i>{sound.price}</div>}
                <div className="sound-buttons">
                  <button className="preview-sound-btn" onClick={() => sound.play()}><i className="fa-solid fa-play"></i> Прослушать</button>
                  <button className={`shop-item-btn ${isActive ? 'active' : ''}`} onClick={() => purchaseSound(id, sound)}>
                    {isActive ? <><i className="fa-solid fa-check"></i> Применено</> : isPurchased ? <><i className="fa-solid fa-check-double"></i> Применить</> : <><i className="fa-solid fa-cart-shopping"></i> Купить</>}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Раздел аватаров: купленные аватары потом доступны на странице профиля. */}
      <div className="shop-category">
        <h2 className="category-title"><i className="fa-solid fa-user-astronaut"></i> Аватары</h2>
        <p className="category-description">✨ Купите аватар, затем выберите его в профиле</p>
        <div className="shop-grid">
          {AVAILABLE_AVATARS.filter(a => !a.default).map(avatar => {
            const isPurchased = purchasedAvatars.includes(avatar.id);
            return (
              <div key={avatar.id} className="shop-item">
                <div className="shop-item-icon avatar-preview-icon"><span style={{ fontSize: '48px' }}>{avatar.emoji}</span></div>
                <h3 className="shop-item-name">{avatar.name}</h3>
                <p className="shop-item-description">Уникальный аватар для профиля</p>
                <div className="shop-item-price"><i className="fa-solid fa-coins"></i>{avatar.price}</div>
                {isPurchased ? <button className="shop-item-btn purchased" disabled><i className="fa-solid fa-check"></i> Куплено</button> : <button className="shop-item-btn" onClick={() => purchaseAvatar(avatar)}><i className="fa-solid fa-cart-shopping"></i> Купить</button>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Сброс настроек магазина не трогает статистику таймера и профиль. */}
      <div className="reset-section">
        <h3 className="reset-title"><i className="fa-solid fa-arrow-rotate-left"></i> Сброс настроек</h3>
        <div className="reset-buttons">
          <button className="reset-btn theme-reset" onClick={resetTheme}><i className="fa-solid fa-palette"></i> Сбросить тему</button>
          <button className="reset-btn sound-reset" onClick={resetSound}><i className="fa-solid fa-bell"></i> Сбросить звук</button>
          <button className="reset-btn all-reset" onClick={resetAll}><i className="fa-solid fa-rotate-left"></i> Сбросить всё</button>
        </div>
      </div>

      {/* Справочный блок объясняет пользователю источники монет. */}
      <div className="shop-info-card">
        <h3><i className="fa-solid fa-circle-info"></i> Как заработать монеты?</h3>
        <div className="info-list">
          <div className="info-item"><i className="fa-solid fa-hourglass-half"></i><span>Завершённый цикл работы — <strong>10 монет</strong></span></div>
          <div className="info-item"><i className="fa-solid fa-calendar-day"></i><span>Ежедневный бонус — <strong>50 монет</strong></span></div>
          <div className="info-item"><i className="fa-solid fa-trophy"></i><span>Достижения — <strong>от 25 до 250 монет</strong></span></div>
        </div>
      </div>
    </div>
  );
}

export default Shop;
