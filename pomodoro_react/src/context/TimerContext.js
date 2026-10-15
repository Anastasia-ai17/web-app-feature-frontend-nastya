import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { authAPI, pomodoroAPI } from '../services/api';
import { useAuth } from './AuthContext';
import { getStorageNamespace, readShopStorage, SHOP_STORAGE_KEYS, writeShopStorage } from '../utils/storage';

const TimerContext = createContext();

// Хук для доступа к состоянию и действиям таймера из компонентов.
export const useTimer = () => useContext(TimerContext);

const SETTING_LIMITS = {
    // Ограничения защищают UI и backend от слишком маленьких/больших значений.
    work: { min: 1, max: 60 },
    shortBreak: { min: 1, max: 30 },
    longBreak: { min: 1, max: 60 },
    cyclesBeforeLongBreak: { min: 1, max: 10 },
};

const DEFAULT_SETTINGS = {
    // Классическая схема Pomodoro: 25 минут работы, 5 минут отдыха, 15 минут длинного перерыва.
    work: 25,
    shortBreak: 5,
    longBreak: 15,
    cyclesBeforeLongBreak: 4,
};

const clampSettingValue = (key, value, fallback) => {
    // Все значения из input/localStorage/API приводим к целым числам.
    const parsedValue = Number.parseInt(value, 10);
    if (Number.isNaN(parsedValue)) return fallback;
    const { min, max } = SETTING_LIMITS[key];
    // Возвращаем число только в разрешённых пределах.
    return Math.min(max, Math.max(min, parsedValue));
};

const getModeDurationSeconds = (mode, settings) => {
    // Таймер работает в секундах, а настройки пользователь задаёт в минутах.
    if (mode === 'work') return settings.work * 60;
    if (mode === 'shortBreak') return settings.shortBreak * 60;
    return settings.longBreak * 60;
};

// Показываем номер текущего рабочего цикла внутри набора до большого перерыва.
const getDisplayCycle = (completedCycles, cyclesBeforeLongBreak) => {
    const cycleLimit = Math.max(1, cyclesBeforeLongBreak);
    return (completedCycles % cycleLimit) + 1;
};

const getCompletedCycleInSet = (completedCycles, cyclesBeforeLongBreak) => {
    // Для экрана перерыва показываем, сколько рабочих циклов уже завершено в текущем наборе.
    if (completedCycles <= 0) return 0;
    const cycleLimit = Math.max(1, cyclesBeforeLongBreak);
    const remainder = completedCycles % cycleLimit;
    return remainder === 0 ? cycleLimit : remainder;
};

const extractCoins = (payload) => {
    // Разные endpoint-ы могут вернуть баланс под разными именами.
    const candidates = [
        payload?.coins,
        payload?.balance,
        payload?.user?.coins,
        payload?.user?.balance,
    ];
    for (const candidate of candidates) {
        const parsed = Number.parseInt(candidate, 10);
        if (!Number.isNaN(parsed) && parsed >= 0) return parsed;
    }
    return null;
};

export const TimerProvider = ({ children }) => {
    const { isAuthenticated, user, updateUser } = useAuth();
    
    // Основное состояние Pomodoro: текущий режим, остаток времени, запуск и циклы.
    // currentMode определяет, какой интервал сейчас идёт: work, shortBreak или longBreak.
    const [currentMode, setCurrentMode] = useState('work');
    // timeLeft — оставшееся время в секундах.
    const [timeLeft, setTimeLeft] = useState(DEFAULT_SETTINGS.work * 60);
    // isRunning запускает или останавливает setInterval.
    const [isRunning, setIsRunning] = useState(false);
    // workCyclesCompleted нужен, чтобы понять, когда включать длинный перерыв.
    const [workCyclesCompleted, setWorkCyclesCompleted] = useState(0);
    
    // settings хранит длительности и количество циклов до длинного перерыва.
    const [settings, setSettings] = useState({
        ...DEFAULT_SETTINGS,
    });
    
    // timerRef хранит id setInterval, чтобы его можно было очистить.
    const timerRef = useRef(null);
    // isEndingRef не даёт обработать окончание таймера два раза подряд.
    const isEndingRef = useRef(false);
    // audioStopRef хранит функцию остановки звука, созданную внутри playAlarm.
    const audioStopRef = useRef(null);
    // settingsSaveTimeoutRef нужен для debounce-сохранения настроек на сервер.
    const settingsSaveTimeoutRef = useRef(null);
    // restoredStorageNamespaceRef помогает понять, сменился ли пользователь/гость.
    const restoredStorageNamespaceRef = useRef(null);
    // refs ниже дают доступ к актуальному состоянию внутри callback/cleanup без лишних зависимостей.
    const isRunningRef = useRef(isRunning);
    const currentModeRef = useRef(currentMode);

    const storageNamespace = getStorageNamespace(isAuthenticated, user?.id);
    // Отдельные namespace не дают гостевым и пользовательским настройкам смешиваться.
    const currentModeDuration = getModeDurationSeconds(currentMode, settings);
    // Настройки нельзя менять во время работы или когда таймер уже частично прошёл.
    const isSettingsLocked = isRunning || timeLeft !== currentModeDuration;
    // Все ключи таймера получают общий префикс focusflow.timer.
    const storageKey = useCallback((key) => `focusflow.timer.${storageNamespace}.${key}`, [storageNamespace]);
    const readTimerStorage = useCallback((key, legacyKey = null) => {
        const value = localStorage.getItem(storageKey(key));
        if (value !== null) return value;
        // legacyKey нужен для старых гостевых ключей без namespace.
        return storageNamespace === 'guest' && legacyKey ? localStorage.getItem(legacyKey) : null;
    }, [storageKey, storageNamespace]);
    const writeTimerStorage = useCallback((key, value) => {
        localStorage.setItem(storageKey(key), String(value));
    }, [storageKey]);

    const getUserSettings = useCallback(() => ({
        // У авторизованного пользователя настройки таймера лежат прямо в объекте user.
        work: clampSettingValue('work', user?.timer_work_minutes, DEFAULT_SETTINGS.work),
        shortBreak: clampSettingValue('shortBreak', user?.timer_short_break_minutes, DEFAULT_SETTINGS.shortBreak),
        longBreak: clampSettingValue('longBreak', user?.timer_long_break_minutes, DEFAULT_SETTINGS.longBreak),
        cyclesBeforeLongBreak: clampSettingValue(
            'cyclesBeforeLongBreak',
            user?.timer_cycles_before_long_break,
            DEFAULT_SETTINGS.cyclesBeforeLongBreak
        ),
    }), [
        user?.timer_work_minutes,
        user?.timer_short_break_minutes,
        user?.timer_long_break_minutes,
        user?.timer_cycles_before_long_break,
    ]);

    useEffect(() => {
        // Держим ref синхронизированным с state для callback-ов.
        isRunningRef.current = isRunning;
    }, [isRunning]);

    useEffect(() => {
        // Аналогично сохраняем актуальный режим таймера.
        currentModeRef.current = currentMode;
    }, [currentMode]);

    // Загружаем настройки и состояние из хранилища конкретного пользователя.
    useEffect(() => {
        const savedSettings = isAuthenticated && user?.id
            ? getUserSettings()
            : {
                // У гостя настройки восстанавливаются из localStorage.
                work: clampSettingValue('work', readTimerStorage('workTime', 'workTime'), DEFAULT_SETTINGS.work),
                shortBreak: clampSettingValue('shortBreak', readTimerStorage('shortBreakTime', 'shortBreakTime'), DEFAULT_SETTINGS.shortBreak),
                longBreak: clampSettingValue('longBreak', readTimerStorage('longBreakTime', 'longBreakTime'), DEFAULT_SETTINGS.longBreak),
                cyclesBeforeLongBreak: clampSettingValue(
                    'cyclesBeforeLongBreak',
                    readTimerStorage('cyclesCount', 'cyclesCount'),
                    DEFAULT_SETTINGS.cyclesBeforeLongBreak
                ),
            };
        setSettings(savedSettings);

        const shouldRestoreTimerState = restoredStorageNamespaceRef.current !== storageNamespace;
        restoredStorageNamespaceRef.current = storageNamespace;

        if (!shouldRestoreTimerState) {
            // Если namespace тот же, меняем только длительность текущего режима при остановленном таймере.
            if (!isRunningRef.current) {
                setTimeLeft(getModeDurationSeconds(currentModeRef.current, savedSettings));
            }
            return;
        }
        
        // Восстанавливаем таймер после обновления страницы или смены пользователя.
        const savedMode = readTimerStorage('timerMode', 'timerMode');
        const savedTimeLeft = readTimerStorage('timerTimeLeft', 'timerTimeLeft');
        const savedCycles = readTimerStorage('timerCycles', 'timerCycles');
        const savedRunning = readTimerStorage('timerRunning', 'timerRunning');
        
        const nextMode = savedMode && ['work', 'shortBreak', 'longBreak'].includes(savedMode) ? savedMode : 'work';
        setCurrentMode(nextMode);
        const parsedCycles = Number.parseInt(savedCycles, 10);
        setWorkCyclesCompleted(Number.isNaN(parsedCycles) ? 0 : parsedCycles);
        const restoredTimeLeft = Number.parseInt(savedTimeLeft, 10);
        setTimeLeft(
            // Если раньше таймер был running, после перезагрузки не продолжаем отсчёт автоматически.
            savedRunning === 'true' || Number.isNaN(restoredTimeLeft)
                ? getModeDurationSeconds(nextMode, savedSettings)
                : restoredTimeLeft
        );
        setIsRunning(false);
    }, [getUserSettings, isAuthenticated, readTimerStorage, storageNamespace, user?.id]);

    // Сохраняем состояние таймера в localStorage конкретного пользователя.
    useEffect(() => {
        writeTimerStorage('timerMode', currentMode);
        writeTimerStorage('timerCycles', workCyclesCompleted.toString());
        if (!isRunning) {
            // Пока таймер бежит, не пишем каждую секунду в localStorage.
            writeTimerStorage('timerTimeLeft', timeLeft.toString());
        }
        writeTimerStorage('timerRunning', isRunning ? 'true' : 'false');
    }, [currentMode, workCyclesCompleted, timeLeft, isRunning, writeTimerStorage]);

    useEffect(() => () => {
        // При размонтировании очищаем отложенное сохранение настроек.
        if (settingsSaveTimeoutRef.current) {
            clearTimeout(settingsSaveTimeoutRef.current);
        }
    }, []);

    const persistUserTimerSettings = useCallback((nextSettings) => {
        if (!isAuthenticated || !user?.id) return;
        if (settingsSaveTimeoutRef.current) {
            clearTimeout(settingsSaveTimeoutRef.current);
        }

        const payload = {
            timer_work_minutes: nextSettings.work,
            timer_short_break_minutes: nextSettings.shortBreak,
            timer_long_break_minutes: nextSettings.longBreak,
            timer_cycles_before_long_break: nextSettings.cyclesBeforeLongBreak,
        };

        // Небольшая задержка защищает сервер от серии запросов при движении слайдера.
        settingsSaveTimeoutRef.current = setTimeout(async () => {
            try {
                const response = await authAPI.updateProfile(payload);
                updateUser(response.data?.user || payload);
            } catch (error) {
                console.error('Failed to save timer settings:', error);
            }
        }, 500);
    }, [isAuthenticated, updateUser, user?.id]);

    const stopAlarm = useCallback(() => {
        // audioStopRef.current создаётся в playAlarm и умеет закрыть AudioContext/таймеры звука.
        if (audioStopRef.current) {
            audioStopRef.current();
            audioStopRef.current = null;
        }
    }, []);

    const playAlarm = useCallback(() => {
        // Тип сигнала берём из настроек магазина.
        const soundType = readShopStorage(storageNamespace, SHOP_STORAGE_KEYS.alarmSoundType) || 'default';
        
        let repeatCount = 0;
        let isStopped = false;
        let timeouts = [];
        let currentAudioContext = null;
        
        audioStopRef.current = () => {
            // Эта функция вызывается кнопкой "остановить сигнал" на главной странице.
            isStopped = true;
            timeouts.forEach(tid => clearTimeout(tid));
            timeouts = [];
            if (currentAudioContext) {
                currentAudioContext.close();
                currentAudioContext = null;
            }
        };
        
        const playSoundOnce = (callback) => {
            if (isStopped) {
                if (callback) callback();
                return;
            }
            
            try {
                // AudioContext создаётся на каждый проигрыш, чтобы звук работал без файлов.
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                currentAudioContext = audioContext;
                if (audioContext.state === 'suspended') audioContext.resume();
                
                if (soundType === 'default') {
                    const osc = audioContext.createOscillator();
                    const gain = audioContext.createGain();
                    osc.connect(gain);
                    gain.connect(audioContext.destination);
                    osc.type = 'sine';
                    osc.frequency.value = 880;
                    gain.gain.value = 0.3;
                    osc.start();
                    gain.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.8);
                    osc.stop(audioContext.currentTime + 0.8);
                    const tid = setTimeout(() => {
                        if (currentAudioContext === audioContext) {
                            audioContext.close();
                            currentAudioContext = null;
                        }
                        if (callback && !isStopped) callback();
                    }, 800);
                    timeouts.push(tid);
                } else if (soundType === 'trill') {
                    const playNote = (freq, duration, delay) => {
                        const tid = setTimeout(() => {
                            if (isStopped) return;
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
                        timeouts.push(tid);
                    };
                    playNote(880, 0.15, 0);
                    playNote(1046.50, 0.15, 150);
                    playNote(880, 0.15, 300);
                    playNote(1046.50, 0.15, 450);
                    playNote(880, 0.2, 600);
                    playNote(1046.50, 0.3, 800);
                    const tid = setTimeout(() => {
                        if (currentAudioContext === audioContext) {
                            audioContext.close();
                            currentAudioContext = null;
                        }
                        if (callback && !isStopped) callback();
                    }, 1200);
                    timeouts.push(tid);
                } else if (soundType === 'chime') {
                    const osc = audioContext.createOscillator();
                    const gain = audioContext.createGain();
                    osc.connect(gain);
                    gain.connect(audioContext.destination);
                    osc.type = 'sine';
                    osc.frequency.value = 523.25;
                    gain.gain.value = 0.3;
                    osc.start();
                    const tid1 = setTimeout(() => { if (osc && !isStopped) osc.frequency.value = 659.25; }, 150);
                    const tid2 = setTimeout(() => { if (osc && !isStopped) osc.frequency.value = 783.99; }, 300);
                    gain.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.8);
                    osc.stop(audioContext.currentTime + 0.8);
                    timeouts.push(tid1, tid2);
                    const tid = setTimeout(() => {
                        if (currentAudioContext === audioContext) {
                            audioContext.close();
                            currentAudioContext = null;
                        }
                        if (callback && !isStopped) callback();
                    }, 800);
                    timeouts.push(tid);
                } else if (soundType === 'digital') {
                    const osc = audioContext.createOscillator();
                    const gain = audioContext.createGain();
                    osc.connect(gain);
                    gain.connect(audioContext.destination);
                    osc.type = 'square';
                    osc.frequency.value = 440;
                    gain.gain.value = 0.3;
                    osc.start();
                    const tid1 = setTimeout(() => { if (osc && !isStopped) osc.frequency.value = 880; }, 100);
                    const tid2 = setTimeout(() => { if (osc && !isStopped) osc.frequency.value = 440; }, 200);
                    gain.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.6);
                    osc.stop(audioContext.currentTime + 0.6);
                    timeouts.push(tid1, tid2);
                    const tid = setTimeout(() => {
                        if (currentAudioContext === audioContext) {
                            audioContext.close();
                            currentAudioContext = null;
                        }
                        if (callback && !isStopped) callback();
                    }, 600);
                    timeouts.push(tid);
                }
            } catch (e) { if (callback) callback(); }
        };
        
        const playRepeat = () => {
            // Сигнал повторяется ограниченное число раз, чтобы не звучать бесконечно.
            if (isStopped) return;
            if (repeatCount >= 20) return;
            repeatCount++;
            playSoundOnce(() => {
                if (!isStopped && repeatCount < 20) {
                    const tid = setTimeout(playRepeat, 500);
                    timeouts.push(tid);
                }
            });
        };
        
        playRepeat();
        
        if (Notification.permission === 'granted') {
            // Browser Notification показывается, если пользователь уже дал разрешение.
            const modeText = currentMode === 'work' ? 'Работа' : (currentMode === 'shortBreak' ? 'Отдых' : 'Большой перерыв');
            new Notification('⏰ FocusFlow', {
                body: `${modeText} завершена!`,
                icon: 'https://cdn-icons-png.flaticon.com/512/564/564619.png',
                requireInteraction: true,
                silent: true
            });
        } else if (Notification.permission === 'default') {
            // Первый запуск может запросить разрешение на уведомления.
            Notification.requestPermission();
        }
        
        // На устройствах с поддержкой vibration добавляем тактильный сигнал.
        if (navigator.vibrate) navigator.vibrate([500, 200, 500]);
    }, [currentMode, storageNamespace]);

    const saveSessionToServer = useCallback(async (duration) => {
        if (isAuthenticated) {
            try {
                // Сохраняем только рабочую сессию: backend начисляет статистику и монеты.
                await pomodoroAPI.saveSession({ duration_minutes: duration });
                // После сохранения сессии обновляем монетки пользователя
                const coinsResponse = await pomodoroAPI.getCoins();
                const userCoins = extractCoins(coinsResponse.data);
                if (userCoins !== null) {
                    writeShopStorage(storageNamespace, SHOP_STORAGE_KEYS.coins, userCoins);
                }
                return true;
            } catch (error) {
                console.error('Failed to save session:', error);
                return false;
            }
        }
        return false;
    }, [isAuthenticated, storageNamespace]);

    const handleTimeEnd = useCallback(async () => {
        // Защита от повторного вызова, если interval и state обновились почти одновременно.
        if (isEndingRef.current) return;
        isEndingRef.current = true;
        
        setIsRunning(false);
        stopAlarm();
        playAlarm();
        window.dispatchEvent(new Event('timerEnd'));
        
        // duration нужен для сохранения завершённой рабочей сессии.
        const duration = currentMode === 'work' ? settings.work : (currentMode === 'shortBreak' ? settings.shortBreak : settings.longBreak);
        let nextMode = 'work';
        
        if (currentMode === 'work') {
            // Сервер получает только завершённые рабочие сессии.
            await saveSessionToServer(duration);
            
            const newCycles = workCyclesCompleted + 1;
            setWorkCyclesCompleted(newCycles);
            // Каждый N-й рабочий цикл ведёт на длинный перерыв, остальные — на короткий.
            nextMode = newCycles % settings.cyclesBeforeLongBreak === 0 ? 'longBreak' : 'shortBreak';
        } else {
            // После любого перерыва возвращаемся к работе.
            nextMode = 'work';
        }

        setCurrentMode(nextMode);
        setTimeLeft(getModeDurationSeconds(nextMode, settings));
        
        setTimeout(() => { isEndingRef.current = false; }, 1000);
    }, [currentMode, settings, workCyclesCompleted, playAlarm, saveSessionToServer, stopAlarm]);

    // Основной цикл таймера: каждую секунду уменьшаем timeLeft.
    useEffect(() => {
        if (isRunning) {
            timerRef.current = setInterval(() => {
                setTimeLeft(prev => {
                    if (prev <= 1) {
                        clearInterval(timerRef.current);
                        handleTimeEnd();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => clearInterval(timerRef.current);
    }, [isRunning, handleTimeEnd]);

    const startTimer = useCallback(() => { 
        // Повторный старт при уже запущенном таймере ничего не меняет.
        if (!isRunning) setIsRunning(true); 
    }, [isRunning]);

    const pauseTimer = useCallback(() => { 
        // Пауза сохраняет текущий timeLeft и не сбрасывает режим.
        setIsRunning(false); 
    }, []);

    const resetTimer = useCallback(() => { 
        // Сброс останавливает звук, таймер и возвращает первый рабочий режим.
        stopAlarm();
        setIsRunning(false); 
        setWorkCyclesCompleted(0); 
        setCurrentMode('work');
        setTimeLeft(settings.work * 60);
        writeTimerStorage('timerTimeLeft', (settings.work * 60).toString());
        writeTimerStorage('timerMode', 'work');
        writeTimerStorage('timerCycles', '0');
        writeTimerStorage('timerRunning', 'false');
    }, [settings, stopAlarm, writeTimerStorage]);

    const updateSetting = useCallback((key, value) => {
        // Если пользователь уже начал цикл, настройки менять нельзя до сброса.
        if (isSettingsLocked) return;

        const normalizedValue = clampSettingValue(key, value, settings[key]);
        const newSettings = { ...settings, [key]: normalizedValue };
        setSettings(newSettings);
        if (key === 'cyclesBeforeLongBreak') {
            writeTimerStorage('cyclesCount', normalizedValue);
        } else {
            writeTimerStorage(`${key}Time`, normalizedValue);
        }
        if (!isRunning) {
            // При изменении длительности сразу пересчитываем отображаемое время.
            setTimeLeft(getModeDurationSeconds(currentMode, newSettings));
        }
        persistUserTimerSettings(newSettings);
    }, [settings, isRunning, currentMode, isSettingsLocked, persistUserTimerSettings, writeTimerStorage]);

    const resetToDefaults = useCallback(() => {
        // Сброс настроек запрещён при активном или частично пройденном таймере.
        if (isSettingsLocked) return;

        stopAlarm();
        const defaultSettings = { ...DEFAULT_SETTINGS };
        setSettings(defaultSettings);
        writeTimerStorage('workTime', 25);
        writeTimerStorage('shortBreakTime', 5);
        writeTimerStorage('longBreakTime', 15);
        writeTimerStorage('cyclesCount', 4);
        if (!isRunningRef.current) {
            setTimeLeft(getModeDurationSeconds(currentModeRef.current, defaultSettings));
        }
        persistUserTimerSettings(defaultSettings);
    }, [isSettingsLocked, persistUserTimerSettings, stopAlarm, writeTimerStorage]);

    const formatTime = useCallback((seconds) => {
        // padStart гарантирует формат 05:03 вместо 5:3.
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }, []);

    const getModeText = useCallback(() => {
        // Текст режима выводится на badge в Index.js.
        switch(currentMode) {
            case 'work': return '🔴 Работа';
            case 'shortBreak': return '🟢 Отдых';
            case 'longBreak': return '🔵 Большой перерыв';
            default: return 'Работа';
        }
    }, [currentMode]);

    const getCycleText = useCallback(() => {
        // Для работы показываем будущий номер цикла, для перерыва — завершённый.
        if (currentMode === 'work') {
            return `Цикл ${getDisplayCycle(workCyclesCompleted, settings.cyclesBeforeLongBreak)}/${settings.cyclesBeforeLongBreak}`;
        }
        return `Перерыв · Цикл ${getCompletedCycleInSet(workCyclesCompleted, settings.cyclesBeforeLongBreak)}/${settings.cyclesBeforeLongBreak}`;
    }, [currentMode, workCyclesCompleted, settings.cyclesBeforeLongBreak]);

    return (
        // TimerContext.Provider отдаёт наружу и state, и действия для управления таймером.
        <TimerContext.Provider value={{
            currentMode,
            timeLeft,
            isRunning,
            isSettingsLocked,
            workCyclesCompleted,
            settings,
            startTimer,
            pauseTimer,
            resetTimer,
            updateSetting,
            resetToDefaults,
            formatTime,
            getModeText,
            getCycleText,
            setCurrentMode,
            setWorkCyclesCompleted,
            setTimeLeft,
            setIsRunning,
            stopAlarm
        }}>
            {children}
        </TimerContext.Provider>
    );
};
