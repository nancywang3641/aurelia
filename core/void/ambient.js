/**
 * core/void/ambient.js — 大廳 BGM 系統 + 背景時段切換
 * 從 void_terminal.js 抽出。橋：VoidTerminal._bridge.isActivitySuspended()。
 */
(function (VoidAmbient) {
    'use strict';

    function _bridge() { return window.VoidTerminal && window.VoidTerminal._bridge; }

    const BGM_URLS = {
        lobby: 'https://raw.githubusercontent.com/nancywang3641/sound-files/main/aseets/bgm/home_yingcafe.mp3',
        '404': 'https://raw.githubusercontent.com/nancywang3641/sound-files/main/aseets/bgm/home_room404.mp3',
    };
    const BASE_BG = 'https://raw.githubusercontent.com/nancywang3641/sound-files/main/aseets/home-page/';

    // ===== 大廳 BG 依本地時段切換：day(6-18) / evening(18-21) / night(21-6) =====
    function _getCafeBgPeriod() {
        const h = new Date().getHours();
        if (h >= 6 && h < 18) return 'day';
        if (h >= 18 && h < 21) return 'evening';
        return 'night';
    }

    // 算「現在 → 下一個時段邊界（06:00 / 18:00 / 21:00）」的毫秒數
    function _msToNextCafePeriod() {
        const now = new Date();
        const next = new Date(now);
        next.setMinutes(0, 0, 0);
        const h = now.getHours();
        if (h < 6)       next.setHours(6);
        else if (h < 18) next.setHours(18);
        else if (h < 21) next.setHours(21);
        else { next.setDate(next.getDate() + 1); next.setHours(6); }
        return next.getTime() - now.getTime() + 1000; // +1s buffer 確保跨過邊界
    }

    // 在每個時段邊界自動重套大廳 BG（一天只觸發 3 次）
    let _cafeBgTimer = null;
    function _scheduleCafeBgUpdate() {
        if (_cafeBgTimer) clearTimeout(_cafeBgTimer);
        _cafeBgTimer = setTimeout(() => {
            if (window.AureliaVoidStyles) window.AureliaVoidStyles.inject(VoidAmbient.currentBgUrl());
            _scheduleCafeBgUpdate();
        }, _msToNextCafePeriod());
    }

    // ===== BGM 系統 =====
    let bgmEnabled = true;
    (function initBgmState() {
        const saved = localStorage.getItem('aurelia_bgm_enabled');
        if (saved !== null) bgmEnabled = saved !== 'false';
    })();

    function getLobbyBgmEl() { return document.getElementById('lobby-bgm-player'); }

    const BGM_VOLUME = 0.3;
    let _bgmRetryTimer = null;
    let _bgmRetryCount = 0;
    const BGM_MAX_RETRY = 5;
    const BGM_RETRY_DELAY = 8000;

    function playLobbyBgm(url) {
        const br = _bridge();
        if (br && br.isActivitySuspended()) return; // 如果被暫停，就不播放
        if (br && br.isPanelOpen && !br.isPanelOpen()) return; // 奧瑞亞面板沒打開 → 不播
        const audio = getLobbyBgmEl();
        if (!audio) return;
        audio.volume = BGM_VOLUME;

        if (audio.src !== url) {
            audio.src = url;
            audio.load();
            _bgmRetryCount = 0;

            audio.onerror = () => {
                if (!bgmEnabled) return;
                if (_bgmRetryCount >= BGM_MAX_RETRY) return;
                _bgmRetryCount++;
                clearTimeout(_bgmRetryTimer);
                _bgmRetryTimer = setTimeout(() => {
                    audio.load();
                    audio.play().catch(() => {});
                }, BGM_RETRY_DELAY);
            };
        }

        if (bgmEnabled) audio.play().catch(() => {});
    }

    function switchLobbyBgm(url) {
        const br = _bridge();
        if (br && br.isPanelOpen && !br.isPanelOpen()) return; // 面板沒打開直接不切換（也不播）
        const audio = getLobbyBgmEl();
        if (!audio) return;
        const fade = setInterval(() => {
            if (audio.volume > 0.05) { audio.volume = Math.max(0, audio.volume - 0.05); }
            else {
                clearInterval(fade);
                audio.pause();
                audio.volume = BGM_VOLUME;
                playLobbyBgm(url);
            }
        }, 40);
    }

    function toggleLobbyBgm() {
        bgmEnabled = !bgmEnabled;
        localStorage.setItem('aurelia_bgm_enabled', bgmEnabled);
        const audio = getLobbyBgmEl();
        const btn = document.getElementById('lobby-bgm-toggle');
        if (!audio || !btn) return;
        if (bgmEnabled) {
            btn.textContent = '🔊';
            _bgmRetryCount = 0;
            audio.load();
            if (!(_bridge() && _bridge().isActivitySuspended())) audio.play().catch(() => {});
        } else {
            btn.textContent = '🔇';
            clearTimeout(_bgmRetryTimer);
            audio.pause();
        }
    }

    VoidAmbient.getBgmEl     = getLobbyBgmEl;
    VoidAmbient.playBgm      = (scene) => playLobbyBgm(BGM_URLS[scene]);
    VoidAmbient.switchBgm    = (scene) => switchLobbyBgm(BGM_URLS[scene]);
    VoidAmbient.pauseBgm     = () => { const a = getLobbyBgmEl(); if (a) a.pause(); };
    VoidAmbient.toggleBgm    = toggleLobbyBgm;
    VoidAmbient.isEnabled    = () => bgmEnabled;
    VoidAmbient.currentBgUrl = () => `${BASE_BG}YingyingCafe_${_getCafeBgPeriod()}.png`;

    _scheduleCafeBgUpdate(); // 啟動背景時段排程（沿用原 void_terminal.js 載入時行為）

    console.log('✅ VoidAmbient（BGM + 背景時段）模組就緒');
})(window.VoidAmbient = window.VoidAmbient || {});
