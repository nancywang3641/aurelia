// ==SillyTavern Extension==
// @name         Time Manager
// @namespace    aurelia
// @version      1.0.0
// @description  游戏时间管理系统 - 复用 district-time.js 逻辑
// @author       Aurelia
// @match        http://localhost:8000/*
// @match        https://sillytavernai.com/*
// @match        https://sillytavernai.com:8000/*
// @grant        none
// ==/SillyTavern Extension==

(function() {
    'use strict';

    // 日誌記錄器
    function getLogger() {
        return {
            info: (msg) => console.log(`[TimeManager] ${msg}`),
            warn: (msg) => console.warn(`[TimeManager] ${msg}`),
            error: (msg) => console.error(`[TimeManager] ${msg}`)
        };
    }

    const logger = getLogger();

    // 遊戲時間相關變量
    let gameStartTime = parseInt(localStorage.getItem('aurelia_gameStartTime')) || Date.now();
    let baseGameTime = 0; // 基礎遊戲時間（分鐘），從設置的初始時間開始
    const TIME_STORAGE_KEY = 'aurelia_game_time';
    const TIME_SETTINGS_KEY = 'aurelia_time_settings';

    // 從 localStorage 獲取遊戲時間設置
    function getGameTimeSettings() {
        const storedSettings = localStorage.getItem(TIME_SETTINGS_KEY);
        if (storedSettings) {
            try {
                return JSON.parse(storedSettings);
            } catch (e) {
                logger.error('解析時間設置失敗:', e);
            }
        }
        
        // 默認設置
        return {
            timeMode: 'realtime',     // 🔥 時間模式：'realtime'（現實時間）| 'gametime'（遊戲時間）| 'timestop'（時停模式）
            gameDayDuration: 30,      // 遊戲一天 = 30分鐘實際時間
            dayStartTime: '06:00',    // 白天開始時間
            nightStartTime: '18:00',  // 夜晚開始時間
            currentWeek: 1,           // 當前周（1=周一, 2=周二, ..., 7=周日）
            currentDay: 1,            // 當前天數（第幾天）
            weather: '晴天',           // 默認天氣
            timeStopMode: false,       // 🔥 時停模式開關（已廢棄，使用 timeMode）
            timeStopDay: 1,           // 🔥 時停模式下的星期（1=周一, 2=周二, ..., 7=周日）
            timeStopTimeMode: '白天',  // 🔥 時停模式下的時段（黎明/白天/黃昏/夜晚）
            timeStopTime: '10:00'     // 🔥 時停模式下的時間（HH:MM格式）
        };
    }

    // 保存時間設置到 localStorage
    function saveTimeSettings(settings) {
        localStorage.setItem(TIME_SETTINGS_KEY, JSON.stringify(settings));
        logger.info('保存時間設置:', settings);
    }

    // 計算遊戲時間比例
    function calculateGameTimeRatio() {
        const settings = getGameTimeSettings();
        const gameDayDuration = settings.gameDayDuration;
        // 將遊戲一天時長轉換為毫秒
        const gameDayMs = gameDayDuration * 60 * 1000;
        // 計算比例：1毫秒實際時間 = 多少遊戲分鐘
        return 1440 / gameDayMs; // 1440是一天的分鐘數
    }

    // 🔥 已廢棄：此函數不再使用，邏輯已整合到 getCurrentGameMinutes 中
    // 從 localStorage 獲取遊戲時間
    function getStoredGameTime() {
        const stored = localStorage.getItem(TIME_STORAGE_KEY);
        if (stored) {
            try {
                const { time } = JSON.parse(stored);
                return time;
            } catch (e) {
                logger.error('解析存儲時間失敗:', e);
            }
        }
        return 0;
    }

    // 保存遊戲時間到 localStorage
    function saveGameTime(time) {
        localStorage.setItem(TIME_STORAGE_KEY, JSON.stringify({
            time: time,
            timestamp: Date.now()
        }));
    }

    // 獲取當前遊戲分鐘數
    function getCurrentGameMinutes() {
        const now = Date.now();
        
        // 🔥 修復：簡化邏輯，直接基於 gameStartTime 計算，避免重複累加
        // 計算從遊戲開始到現在經過的實際時間（毫秒）
        const elapsedMs = now - gameStartTime;
        
        // 計算遊戲時間比例
        const gameTimeRatio = calculateGameTimeRatio();
        
        // 計算經過的遊戲時間（分鐘）
        const elapsedGameMinutes = elapsedMs * gameTimeRatio;
        
        // 🔥 修復：使用基礎時間（從設置的初始時間開始，例如 06:00 = 360分鐘）
        const settings = getGameTimeSettings();
        const dayStartMinutes = timeToMinutes(settings.dayStartTime || '06:00');
        
        // 計算當前遊戲時間（分鐘）= 基礎時間 + 經過的遊戲時間
        const currentGameMinutes = dayStartMinutes + elapsedGameMinutes;
        
        // 確保時間在24小時範圍內（0-1439分鐘）
        return Math.floor(currentGameMinutes % 1440);
    }

    // 將時間字符串轉換為分鐘數
    function timeToMinutes(timeString) {
        const [hours, minutes] = timeString.split(':').map(Number);
        return hours * 60 + minutes;
    }

    // 格式化遊戲時間
    function formatGameTime(minutes) {
        const hours = Math.floor(minutes / 60) % 24;
        const mins = minutes % 60;
        return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    }

    // 獲取當前時間模式（黎明/白天/黃昏/夜晚）
    function getCurrentTimeMode(currentMinutes) {
        const settings = getGameTimeSettings();
        const dayStartMinutes = timeToMinutes(settings.dayStartTime);
        const nightStartMinutes = timeToMinutes(settings.nightStartTime);
        
        // 設定黎明和黃昏的持續時間（分鐘）
        const dawnDuration = 120;  // 🔥 黎明持續120分鐘（從04:00開始，到06:00結束）
        const duskDuration = 120;   // 黃昏持續120分鐘
        
        // 計算各個時段的開始時間
        const dawnStartMinutes = (dayStartMinutes - dawnDuration + 1440) % 1440;
        const duskStartMinutes = (nightStartMinutes - duskDuration + 1440) % 1440;
        
        // 判斷當前時間模式
        // 🔥 注意：需要處理跨天的情況（夜晚從18:00到第二天04:00）
        if (currentMinutes >= dawnStartMinutes && currentMinutes < dayStartMinutes) {
            // 黎明：04:00 - 06:00
            return '黎明';
        } else if (currentMinutes >= duskStartMinutes && currentMinutes < nightStartMinutes) {
            // 黃昏：16:00 - 18:00
            return '黃昏';
        } else if (currentMinutes >= dayStartMinutes && currentMinutes < duskStartMinutes) {
            // 白天：06:00 - 16:00
            return '白天';
        } else {
            // 夜晚：18:00 - 04:00（跨天）
            return '夜晚';
        }
    }

    // 獲取周X字符串
    function getWeekDayString(weekDay) {
        const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        return weekDays[weekDay] || '周一';
    }

    // 檢查時間是否在範圍內
    function isTimeInRange(currentTime, startTime, endTime) {
        const current = timeToMinutes(currentTime);
        const start = timeToMinutes(startTime);
        const end = timeToMinutes(endTime);
        
        if (start <= end) {
            // 正常範圍（如 08:00-12:00）
            // 🔥 修復：包含結束時間（<= 而不是 <），這樣 22:00 也在 19:00-22:00 範圍內
            return current >= start && current <= end;
        } else {
            // 跨日範圍（如 22:00-02:00）
            return current >= start || current <= end;
        }
    }

    // 🔥 核心API：獲取當前遊戲時間信息
    // 🔥 獲取現實時間（轉換為遊戲時間格式）
    // 🔥 完全獨立於遊戲時間系統，直接使用真實時間
    function getRealtimeGameTime() {
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const currentMinutes = hours * 60 + minutes;
        
        // 獲取當前真實的星期幾（0=周日, 1=周一, ..., 6=周六）
        const realWeekDay = now.getDay();
        // 轉換為遊戲格式（1=周一, 2=周二, ..., 7=周日）
        const gameWeekDay = realWeekDay === 0 ? 7 : realWeekDay;
        
        // 🔥 獲取當前真實的日期（用於計算是第幾天）
        // 如果沒有設置開始日期，使用當前日期作為第一天
        const settings = getGameTimeSettings();
        if (!settings.realtimeStartDate) {
            settings.realtimeStartDate = Date.now();
            saveTimeSettings(settings);
        }
        const startDate = new Date(settings.realtimeStartDate);
        const daysDiff = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        const currentDay = Math.max(1, (settings.currentDay || 1) + daysDiff);
        
        // 🔥 使用現實時間計算時間段（不依賴遊戲時間設置）
        const timeMode = getCurrentTimeMode(currentMinutes);
        
        return {
            day: getWeekDayString(gameWeekDay),
            timeMode: timeMode,
            time: formatGameTime(currentMinutes),
            minutes: currentMinutes,
            weekDay: gameWeekDay,
            dayNumber: currentDay,
            weather: settings.weather || '晴天',
            isRealtime: true,  // 🔥 標記為現實時間模式
            isTimeStop: false  // 🔥 明確標記不是時停模式
        };
    }

    function getCurrentGameTime() {
        const settings = getGameTimeSettings();
        
        // 🔥 優先檢查 timeMode（新系統）
        const timeMode = settings.timeMode;
        
        // 🔥 時停模式：直接使用手動設置的時間
        if (timeMode === 'timestop' || settings.timeStopMode) {
            const timeStopMinutes = timeToMinutes(settings.timeStopTime || '10:00');
            return {
                day: getWeekDayString(settings.timeStopDay || 1),
                timeMode: settings.timeStopTimeMode || '白天',
                time: settings.timeStopTime || '10:00',
                minutes: timeStopMinutes,
                weekDay: settings.timeStopDay || 1,
                dayNumber: settings.currentDay || 1,
                weather: settings.weather || '晴天',
                isTimeStop: true  // 🔥 標記為時停模式
            };
        }
        
        // 🔥 現實時間模式：使用真實時間（完全獨立，不受遊戲時間影響）
        if (timeMode === 'realtime') {
            return getRealtimeGameTime();
        }
        
        // 🔥 如果設置為遊戲時間模式，自動切換到現實時間（遊戲時間模式已移除）
        if (timeMode === 'gametime') {
            settings.timeMode = 'realtime';
            saveTimeSettings(settings);
            return getRealtimeGameTime();
        }
        
        // 🔥 默認為現實時間模式（遊戲時間模式已移除）
        return getRealtimeGameTime();
    }
    
    // 🔥 新增：設置時間模式
    function setTimeMode(mode) {
        const settings = getGameTimeSettings();
        
        // 🔥 只允許現實時間和時停模式（遊戲時間模式已移除）
        if (mode !== 'realtime' && mode !== 'timestop') {
            // 如果嘗試設置遊戲時間模式，自動切換到現實時間
            mode = 'realtime';
        }
        
        settings.timeMode = mode;
        
        // 如果切換到現實時間模式，記錄開始日期
        if (mode === 'realtime' && !settings.realtimeStartDate) {
            settings.realtimeStartDate = Date.now();
        }
        
        // 兼容舊的 timeStopMode
        if (mode === 'timestop') {
            settings.timeStopMode = true;
        } else {
            settings.timeStopMode = false;
        }
        
        saveTimeSettings(settings);
        logger.info(`設置時間模式: ${mode === 'realtime' ? '現實時間' : '時停模式'}`);
    }
    
    // 🔥 新增：設置時停模式（兼容舊API）
    function setTimeStopMode(enabled) {
        setTimeMode(enabled ? 'timestop' : 'realtime');
    }
    
    // 🔥 新增：設置時停模式下的時間
    function setTimeStopTime(day, timeMode, time) {
        const settings = getGameTimeSettings();
        settings.timeStopDay = day;
        settings.timeStopTimeMode = timeMode;
        settings.timeStopTime = time;
        saveTimeSettings(settings);
        logger.info(`設置時停時間: ${getWeekDayString(day)} ${timeMode} ${time}`);
    }

    // 設置當前周X
    function setCurrentWeek(weekDay) {
        const settings = getGameTimeSettings();
        settings.currentWeek = weekDay;
        saveTimeSettings(settings);
        logger.info(`設置當前周: ${getWeekDayString(weekDay)}`);
    }

    // 設置當前天數
    function setCurrentDay(day) {
        const settings = getGameTimeSettings();
        settings.currentDay = day;
        saveTimeSettings(settings);
        logger.info(`設置當前天數: 第 ${day} 天`);
    }
    
    // 🔥 新增：設置當前遊戲時間（用於手動調整時間）
    function setCurrentGameTime(hours, minutes) {
        const targetMinutes = hours * 60 + minutes;
        const settings = getGameTimeSettings();
        const dayStartMinutes = timeToMinutes(settings.dayStartTime || '06:00');
        
        // 計算需要調整的時間差
        const currentMinutes = getCurrentGameMinutes();
        const timeDiff = targetMinutes - currentMinutes;
        
        // 調整 gameStartTime，讓當前時間等於目標時間
        const gameTimeRatio = calculateGameTimeRatio();
        const adjustMs = (timeDiff / gameTimeRatio) * 1000; // 轉換為毫秒
        gameStartTime = gameStartTime - adjustMs;
        localStorage.setItem('aurelia_gameStartTime', gameStartTime.toString());
        
        logger.info(`設置當前遊戲時間: ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`);
    }

    // 設置天氣
    function setWeather(weather) {
        const settings = getGameTimeSettings();
        settings.weather = weather;
        saveTimeSettings(settings);
        logger.info(`設置天氣: ${weather}`);
    }

    // 更新時間設置
    function updateTimeSettings(newSettings) {
        const currentSettings = getGameTimeSettings();
        const mergedSettings = { ...currentSettings, ...newSettings };
        saveTimeSettings(mergedSettings);
        
        // 🔥 修復：如果更新了遊戲一天時長，需要重置 gameStartTime 以重新計算
        if (newSettings.gameDayDuration !== undefined) {
            // 重置遊戲開始時間，讓時間從當前時刻重新開始計算
            gameStartTime = Date.now();
            localStorage.setItem('aurelia_gameStartTime', gameStartTime.toString());
            logger.info('遊戲時間比例已更新，重置遊戲開始時間');
        }
        
        logger.info('更新時間設置:', mergedSettings);
    }

    // 初始化
    function init() {
        // 🔥 修復：清理舊的時間存儲數據，避免時間跳躍
        const oldTimeStorage = localStorage.getItem(TIME_STORAGE_KEY);
        if (oldTimeStorage) {
            logger.info('清理舊的時間存儲數據，重新初始化時間系統');
            localStorage.removeItem(TIME_STORAGE_KEY);
        }
        
        // 初始化遊戲開始時間
        if (!localStorage.getItem('aurelia_gameStartTime')) {
            localStorage.setItem('aurelia_gameStartTime', Date.now().toString());
            gameStartTime = Date.now();
            logger.info('初始化遊戲開始時間:', new Date(gameStartTime).toLocaleString());
        } else {
            gameStartTime = parseInt(localStorage.getItem('aurelia_gameStartTime'));
            logger.info('載入遊戲開始時間:', new Date(gameStartTime).toLocaleString());
        }

        // 初始化時間設置（如果不存在）
        const settings = getGameTimeSettings();
        saveTimeSettings(settings);
        
        // 測試時間計算
        const testTime = getCurrentGameMinutes();
        const testFormatted = formatGameTime(testTime);
        logger.info(`當前遊戲時間: ${testFormatted} (${testTime} 分鐘)`);
        logger.info('時間管理器初始化完成');
    }

    // 導出API
    window.TimeManager = {
        // 獲取當前遊戲時間
        getCurrentGameTime,
        
        // 獲取時間設置
        getGameTimeSettings,
        
        // 更新時間設置
        updateTimeSettings,
        
        // 設置當前周X
        setCurrentWeek,
        
        // 設置當前天數
        setCurrentDay,
        
        // 設置天氣
        setWeather,
        
        // 🔥 新增：設置當前遊戲時間（用於手動調整）
        setCurrentGameTime,
        
        // 🔥 新增：時停模式相關
        setTimeMode,
        setTimeStopMode,
        setTimeStopTime,
        
        // 工具函數
        timeToMinutes,
        formatGameTime,
        isTimeInRange,
        getWeekDayString,
        
        // 初始化
        init
    };

    // 自動初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    logger.info('時間管理器模組已加載');
})();

