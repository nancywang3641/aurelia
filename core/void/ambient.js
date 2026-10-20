/**
 * core/void/ambient.js — 大廳 BGM 系統（背景時段切換 10-20 拿掉：那幾張底圖從來不存在）
 * 從 void_terminal.js 抽出。橋：VoidTerminal._bridge.isActivitySuspended()。
 */
(function (VoidAmbient) {
    'use strict';

    function _bridge() { return window.VoidTerminal && window.VoidTerminal._bridge; }

    const BGM_URLS = {
        lobby: 'https://raw.githubusercontent.com/nancywang3641/sound-files/main/aseets/bgm/home_yingcafe.mp3',
        '404': 'https://raw.githubusercontent.com/nancywang3641/sound-files/main/aseets/bgm/home_room404.mp3',
    };
    // 10-20：舊大廳的時段底圖（aseets/home-page/YingyingCafe_day／evening／night.png）sound-files 從來沒有
    //   （5 月從舊網站搬素材時漏搬），每次開大廳、每到時段邊界都 404，畫面一直是 .void-bg 的底色。
    //   大廳現在是舞台／左欄立繪，這張用不到：不再去抓、也不排時段計時器；呼叫端拿到空字串就不設 --void-bg-url

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
        AUI.lsSet('aurelia_bgm_enabled', String(bgmEnabled), '大廳音樂的開關');
        const audio = getLobbyBgmEl();
        const btn = document.getElementById('lobby-bgm-toggle');
        if (!audio || !btn) return;
        if (bgmEnabled) {
            btn.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
            _bgmRetryCount = 0;
            audio.load();
            if (!(_bridge() && _bridge().isActivitySuspended())) audio.play().catch(() => {});
        } else {
            btn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';
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
    VoidAmbient.currentBgUrl = () => '';   // 見最上面：舊大廳時段底圖從來不存在

    console.log('✅ VoidAmbient（BGM + 背景時段）模組就緒');
})(window.VoidAmbient = window.VoidAmbient || {});
