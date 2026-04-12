/**
 * ========================
 * Void Terminal (v5.1 - Yingying & Vintage Latte Theme)
 * 視差書咖與敘事引擎核心 (復古拿鐵配色、底部TAB防遮擋修復)
 * ========================
 * 職責：
 * 1. 渲染拿鐵大廳 UI (Bubbles, 聊天框, 立繪) 與 登入介面。
 * 2. 處理 瀅瀅 與 Cheshire 的對話、歷史紀錄、語音與放置反應。
 * 3. 處理 ERR_404 崩潰彩蛋與場景切換。
 * 4. 解析 [LaunchApp|xxx] 標籤，與 Control Center 連動打開外部面板。
 * 5. 導出全局登入資訊 (getUserName / setUserName)，供其他面板 (App) 讀取。
 * 6. 管理 iOS 動態島/瀏海的安全區域與強制下移佈局。
 */

(function(VoidTerminal) {
    'use strict';

    // ===== 佈局管理器 (解決 iOS 動態島遮擋) =====
    function applyLayoutMode() {
        const mode = localStorage.getItem('aurelia_layout_mode') || 'auto';
        document.body.classList.remove('layout-pad-ios');
        if (mode === 'pad-ios') {
            document.body.classList.add('layout-pad-ios');
        }
    }
    applyLayoutMode(); // 初始化執行

    // ===== 狀態管理 =====
    let IRIS_STATE = {
        userName: '',            // 體驗者代號 (登入時填寫)
        history: [],
        queue: [],
        isTyping: false,
        timer: null,
        currentMsg: null,
        fullText: ''
    };

    // 404 彩蛋模式狀態
    let is404Room = false;
    let visit404Count = 0;           // 持久化記憶：體驗者進入 404 號房的累計次數
    let _justReturnedFrom404 = false; // 體驗者剛從 404 號房返回
    let _irisHistoryBackup = [];     // 進入 404 前備份的瀅瀅對話歷史
    let _cheshireHistoryBackup = []; // 離開 404 前備份的柴郡對話歷史
    let lastFailedInput = '';        // 最後一次失敗的輸入內容
    let pendingRestoreLobby = false; // 等用戶讀完再返回大廳的旗標
    let bgmEnabled = true;           // 大廳 BGM 開關狀態
    let _isActivitySuspended = false; // 控制大廳活動是否被暫停 (避免與App或劇情重疊)
    let _currentChatId = null;       // 當前載入的 chatId (對話存檔鍵)
    let _saveDebounceTimer = null;   // 防抖存檔計時器

    const URLS = {
        BG: 'https://nancywang3641.github.io/aurelia/district/yingBG.png', 
        IRIS_AVATAR: 'https://nancywang3641.github.io/sound-files/char_presets/ying.png', 
        BGM_LOBBY: 'https://nancywang3641.github.io/aurelia/bgm/YING.mp3',
        BGM_404:   'https://nancywang3641.github.io/aurelia/bgm/home_room404.mp3'
    };

    // ===== 語音與反應池 (瀅瀅專屬) =====
    const IRIS_POKE = [
        { vn: "[Char|瀅瀅|smile|「呀！別戳我，墨水要弄到原稿上了！」]", audio: null },
        { vn: "[Char|瀅瀅|think|「（眼神空洞0.5秒）……咦？剛剛是不是有亂碼飄過去？不管啦，委託人你有新故事嗎？」]", audio: null },
        { vn: "[Char|瀅瀅|normal|「雷伊大叔說點擊螢幕可以刺激腦電波……你是在幫我找靈感嗎？」]", audio: null },
        { vn: "[Char|瀅瀅|warning|「請不要頻繁點擊，我的『認知平滑協議』好像快要過載了……哎呀，好痛。」]", audio: null },
        { vn: "[Char|瀅瀅|smile|「嗯……你的行為模式真像個充滿好奇心的主角。請繼續，這說不定能寫進下一章節裡！」]", audio: null },
        { vn: "[Char|瀅瀅|normal|「書咖一切正常。今天也有準備好熱咖啡，你可以安心分享你的冒險。」]", audio: null },
    ];

    const IRIS_IDLE = [
        { vn: "[Char|瀅瀅|smile|「（咬著羽毛筆發呆）下一個章節該怎麼寫呢……如果主角突然從天上掉下來會不會太突兀？」]", audio: null },
        { vn: "[Char|瀅瀅|think|「這杯拿鐵的拉花又失敗了……（嘆氣）雷伊大叔一定又會說什麼『敘事解構』之類的怪話。」]", audio: null },
        { vn: "[Char|瀅瀅|smile|「（揉了揉太陽穴）總覺得最近視差書咖的空間有點……不穩定？錯覺吧，大概是昨晚咖啡因攝取過量了。」]", audio: null },
    ];

    const CHESHIRE_POKE = [
        { vn: "[Char|柴郡|yawn|「哈啊...點我也沒有隱藏道具可以拿，滾去睡覺啦。」]",                                                                                                            audio: "https://nancywang3641.github.io/aurelia/voice/Cheshire_001.mp3" },
        { vn: "[Char|柴郡|smirk|「你的手指是有什麼毛病？滑鼠壞了就去 E 區撿一個新的。」]",                                                                                                     audio: "https://nancywang3641.github.io/aurelia/voice/Cheshire_002.mp3" },
        { vn: "[Char|柴郡|angry|「喂！再戳我一下試試看？信不信我把你的瀏覽紀錄打包發給全網？」]",                                                                                              audio: "https://nancywang3641.github.io/aurelia/voice/Cheshire_003.mp3" },
        { vn: "[Char|柴郡|normal|「別吵。我正在找白則那傢伙的新防火牆漏洞，馬上就要抓到他的小尾巴了...」]",                                                                                     audio: "https://nancywang3641.github.io/aurelia/voice/Cheshire_004.mp3" },
        { vn: "[Char|柴郡|glitch|「噗...戳空了吧？蠢死了。這裡可是我的主場。」]",                                                                                                               audio: "https://nancywang3641.github.io/aurelia/voice/Cheshire_005.mp3" },
    ];

    const CHESHIRE_IDLE = [
        { vn: "[Char|柴郡|smirk|「別拿你那 A 區的規矩來煩我。這裡可是 E 區殘塔的 404 號節點，SN 的防火牆在這裡就是個笑話。」]",                                                                audio: "https://nancywang3641.github.io/aurelia/voice/Cheshire_006.mp3" },
        { vn: "[Char|柴郡|yawn|「哈啊...丹那傢伙又跑去鐵骨修車廠找黎昂了，害我得在這裡無聊到看你戳螢幕。嘖，戀愛腦真麻煩。」]",                                                                 audio: "https://nancywang3641.github.io/aurelia/voice/Cheshire_007.mp3" },
        { vn: "[Char|柴郡|glitch|「洛爾德家族那群老古板以為靠那些『百年秩序』就能鎖住全球資本？白痴，我昨天才在 OGH 伺服器裡留了個後門，他們連警報都沒響。」]",                               audio: "https://nancywang3641.github.io/aurelia/voice/Cheshire_008.mp3" },
    ];

    let _pokeOnCooldown = false;
    let _idleTimer = null;
    let _currentVoice = null;              
    let _reactionTimer = null; 
    let _reactionHideTimer = null;
    const IDLE_INTERVAL = 3 * 60 * 1000;  

    // ===== BGM 系統 =====
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
        if (_isActivitySuspended) return; // 如果被暫停，就不播放
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
            if (!_isActivitySuspended) audio.play().catch(() => {});
        } else {
            btn.textContent = '🔇';
            clearTimeout(_bgmRetryTimer);
            audio.pause();
        }
    }

    // ===== 互動與放置反應 (完全無縫切換版) =====
    function _showReactionBox() {
        const mainBox = document.getElementById('iris-dialogue-box');
        const reactionBox = document.getElementById('iris-reaction-box');
        if (mainBox) mainBox.style.display = 'none';  // 隱藏主線框
        if (reactionBox) reactionBox.style.display = ''; // 顯示反應框 (繼承預設 CSS)
    }

    function _hideReactionBox() {
        const mainBox = document.getElementById('iris-dialogue-box');
        const reactionBox = document.getElementById('iris-reaction-box');
        if (reactionBox) reactionBox.style.display = 'none'; // 隱藏反應框
        if (mainBox) mainBox.style.display = ''; // 恢復主線框
    }

    function playVoiceReaction(pick) {
        if (_reactionTimer) { clearInterval(_reactionTimer); _reactionTimer = null; }
        if (_reactionHideTimer) { clearTimeout(_reactionHideTimer); _reactionHideTimer = null; }
        if (_currentVoice) { _currentVoice.pause(); _currentVoice.currentTime = 0; _currentVoice = null; }

        _showReactionBox();

        const reactionText = document.getElementById('iris-reaction-text');
        const reactionName = document.getElementById('iris-reaction-name-tag');
        if (!reactionText || !reactionName) return;

        // 解析對話文本
        let charName = is404Room ? '柴郡' : '瀅瀅';
        let dialogue = pick.vn;
        const match = pick.vn.match(/\[Char\|([^|]+)\|[^|]+\|([^\]]+)\]/);
        if (match) {
            charName = match[1];
            dialogue = match[2];
        }

        reactionName.innerHTML = `<span>${charName}</span>`;
        reactionName.style.display = 'block';
        reactionText.innerHTML = '';

        if (pick.audio) {
            _currentVoice = new Audio(pick.audio);
            _currentVoice.play().catch(() => {});
        }

        let i = 0;
        const speed = 25;
        _reactionTimer = setInterval(() => {
            if (i < dialogue.length) {
                reactionText.innerText = dialogue.substring(0, i + 1);
                i++;
            } else {
                clearInterval(_reactionTimer);
                _reactionTimer = null;
                const scheduleHide = () => {
                    if (_reactionHideTimer) clearTimeout(_reactionHideTimer);
                    _reactionHideTimer = setTimeout(() => {
                        _hideReactionBox(); // 時間到，自動切回主線
                    }, 3000);
                };
                if (_currentVoice && !_currentVoice.ended) {
                    _currentVoice.addEventListener('ended', scheduleHide, { once: true });
                    _reactionHideTimer = setTimeout(() => { _hideReactionBox(); }, 15000); // 15秒超時保底
                } else {
                    scheduleHide();
                }
            }
        }, speed);
    }

    function pokeIris() {
        if (_pokeOnCooldown || _isActivitySuspended) return;
        _pokeOnCooldown = true;
        setTimeout(() => { _pokeOnCooldown = false; }, 800);

        const pool = is404Room ? CHESHIRE_POKE : IRIS_POKE;
        const pick = pool[Math.floor(Math.random() * pool.length)];
        playVoiceReaction(pick);
    }

    function startIdleTimer() {
        stopIdleTimer();
        _idleTimer = setInterval(() => {
            if (_isActivitySuspended) return; // 如果被暫停，就不觸發放置語音
            const homeTab = document.getElementById('aurelia-home-tab');
            if (!homeTab || homeTab.style.display === 'none') return;
            if (IRIS_STATE.isTyping || IRIS_STATE.queue.length > 0) return;
            const pool = is404Room ? CHESHIRE_IDLE : IRIS_IDLE;
            const pick = pool[Math.floor(Math.random() * pool.length)];
            playVoiceReaction(pick);
        }, IDLE_INTERVAL);
    }

    function stopIdleTimer() {
        if (_idleTimer) { clearInterval(_idleTimer); _idleTimer = null; }
    }

    // ===== 分頁可見性監聽 (離開分頁時靜音，回來時恢復) =====
    let _hiddenByTab = false;
    let _isPanelOpen = false;  // 由 onShow / onHide 維護，代表奧瑞亞窗口是否真正顯示中

    document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
            // 使用者切走分頁 / 最小化瀏覽器
            _hiddenByTab = true;
            const audio = getLobbyBgmEl();
            if (audio) audio.pause();
            stopIdleTimer();
            if (_currentVoice) { _currentVoice.pause(); _currentVoice.currentTime = 0; }
        } else {
            // 使用者回來了
            if (!_hiddenByTab) return;
            _hiddenByTab = false;
            // 面板沒開就不恢復 BGM
            if (!_isPanelOpen || _isActivitySuspended) return;
            const bgmUrl = is404Room ? URLS.BGM_404 : URLS.BGM_LOBBY;
            playLobbyBgm(bgmUrl);
            startIdleTimer();
        }
    });

    // ===== 生命週期鉤子 =====
    VoidTerminal.onShow = async function() {
        _isPanelOpen = true;
        applyLayoutMode(); // 確保重新開啟時佈局正確
        if (_isActivitySuspended) return;
        const bgmUrl = is404Room ? URLS.BGM_404 : URLS.BGM_LOBBY;
        playLobbyBgm(bgmUrl);
        startIdleTimer();
        
        // 偵測 chatId 切換：若切換了聊天室，嘗試自動登入或重新顯示 Login
        const newId = getChatId();
        if (_currentChatId && _currentChatId !== newId) {
            const homeTab = document.getElementById('aurelia-home-tab');
            if (homeTab) {
                IRIS_STATE.history = []; _irisHistoryBackup = []; _cheshireHistoryBackup = [];
                is404Room = false; visit404Count = 0;
                _currentChatId = newId;

                // 嘗試自動載入新 chat 的存檔
                let autoLoaded = false;
                const db = window.OS_DB || (window.parent && window.parent.OS_DB);
                if (db && db.getLobbyHistory) {
                    try {
                        const d = await db.getLobbyHistory(newId);
                        if (d && d.userName) {
                            autoLoaded = await loadLobbyHistory(newId);
                        }
                    } catch(e) {}
                }

                if (autoLoaded) {
                    // 如果新聊天室有存檔，清除可能存在的登入介面並直接套用狀態
                    const ov = homeTab.querySelector('#void-login-overlay');
                    if (ov) ov.remove();
                    _applyLoadedLobbyState();
                } else {
                    // 如果沒有存檔，先清除可能殘留的 404 UI，再顯示登入介面
                    _applyLoadedLobbyState();
                    if (!homeTab.querySelector('#void-login-overlay')) {
                        showLoginScreen(homeTab);
                    }
                }
            }
        }
    };

    VoidTerminal.onHide = function() {
        _isPanelOpen = false;
        const audio = getLobbyBgmEl();
        if (audio) audio.pause();
        stopIdleTimer();
    };

    // ===== 外部控制大廳活動 API =====
    VoidTerminal.suspendLobbyActivity = function() {
        _isActivitySuspended = true;
        const audio = getLobbyBgmEl();
        if (audio) audio.pause();
        stopIdleTimer();
        if (_currentVoice) { _currentVoice.pause(); _currentVoice.currentTime = 0; }
        _hideReactionBox();
    };

    VoidTerminal.resumeLobbyActivity = function() {
        _isActivitySuspended = false;
        const audio = getLobbyBgmEl();
        if (audio && bgmEnabled) audio.play().catch(() => {});
        startIdleTimer();
    };

    VoidTerminal.suspendIdle = function() {
        stopIdleTimer();
        if (_currentVoice) { _currentVoice.pause(); _currentVoice.currentTime = 0; }
        _hideReactionBox();
    };

    // 供外部模組（如 os_404_store）觸發柴郡/瀅瀅 說一句話
    VoidTerminal.cheshireSay = function(text, audioUrl) {
        playVoiceReaction({ vn: `[Char|柴郡|smirk|${text}]`, audio: audioUrl || null });
    };
    VoidTerminal.irisSay = function(text, audioUrl) {
        playVoiceReaction({ vn: `[Char|瀅瀅|normal|${text}]`, audio: audioUrl || null });
    };

    // ===== 對話歷史持久化 =====
    function getChatId() {
        const w = window.parent || window;
        if (w.SillyTavern && w.SillyTavern.getContext) {
            try { const c = w.SillyTavern.getContext(); if (c && c.chatId) return c.chatId; } catch(e) {}
        }
        return 'lobby_default';
    }

    function debouncedSave() {
        clearTimeout(_saveDebounceTimer);
        _saveDebounceTimer = setTimeout(() => { _saveDebounceTimer = null; saveLobbyHistory(); }, 2000);
    }

    async function saveLobbyHistory() {
        const db = window.OS_DB || (window.parent && window.parent.OS_DB);
        if (!db || !db.saveLobbyHistory) return;
        const chatId = _currentChatId || getChatId();
        const irisH  = is404Room ? [..._irisHistoryBackup]  : [...IRIS_STATE.history];
        const chesH  = is404Room ? [...IRIS_STATE.history]  : [..._cheshireHistoryBackup];
        const lastUser = [...irisH, ...chesH].filter(m => m.role === 'user').pop();
        await db.saveLobbyHistory(chatId, {
            irisHistory: irisH, cheshireHistory: chesH,
            is404Room, visit404Count, userName: IRIS_STATE.userName, // 儲存使用者名稱
            lastUpdated: Date.now(),
            msgCount: irisH.length + chesH.length,
            preview: lastUser ? lastUser.content.substring(0, 60) : ''
        }).catch(() => {});
    }

    async function loadLobbyHistory(chatId) {
        const db = window.OS_DB || (window.parent && window.parent.OS_DB);
        if (!db || !db.getLobbyHistory) return false;
        try {
            const d = await db.getLobbyHistory(chatId);
            if (!d) return false;
            IRIS_STATE.history     = [...((d.is404Room ? d.cheshireHistory : d.irisHistory) || [])];
            _irisHistoryBackup     = [...((d.is404Room ? d.irisHistory : []) || [])];
            _cheshireHistoryBackup = [...((d.is404Room ? [] : d.cheshireHistory) || [])];
            is404Room     = !!d.is404Room;
            visit404Count = d.visit404Count || 0;
            if (d.userName) IRIS_STATE.userName = d.userName; // 讀取使用者名稱
            _currentChatId = chatId;
            // 同步成就數據
            if (window.OS_ACHIEVEMENT && typeof window.OS_ACHIEVEMENT.loadForChat === 'function') {
                window.OS_ACHIEVEMENT.loadForChat(chatId).catch(() => {});
            }
            return true;
        } catch(e) { return false; }
    }

    function _truncateId(id) {
        if (!id) return '—';
        const base = id.replace(/\.jsonl?$/i, '').split('/').pop().split('\\').pop();
        return base.length > 28 ? base.substring(0, 25) + '...' : base;
    }

    function _formatSessionTime(ts) {
        if (!ts) return '';
        const diff = Date.now() - ts;
        if (diff < 60000)    return '剛才';
        if (diff < 3600000)  return Math.floor(diff / 60000) + ' 分鐘前';
        if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小時前';
        const d = new Date(ts);
        return d.getFullYear() + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + String(d.getDate()).padStart(2,'0');
    }

    // 注入登入/Session 畫面 CSS（全套瀅瀅專屬色票風格）
    function _injectLoginCss() {
        if (document.getElementById('void-login-css')) return;
        const s = document.createElement('style'); s.id = 'void-login-css';
        s.textContent = `
            @keyframes vssIn { from{opacity:0;transform:scale(0.97)} to{opacity:1;transform:none} }
            @keyframes vssScan { 0%{top:-2px} 100%{top:100%} }

            /* iOS 安全區域自動適應 */
            .void-top-bar { padding-top: calc(15px + env(safe-area-inset-top, 0px)); }
            .void-app-tray { top: calc(56px + env(safe-area-inset-top, 0px)); }
            .void-bubble-layer { top: calc(56px + env(safe-area-inset-top, 0px)); }
            .void-panel-overlay { top: calc(90px + env(safe-area-inset-top, 0px)); }
            #achievement-panel-overlay { top: calc(10% + env(safe-area-inset-top, 0px)); }
            #store-panel-overlay { top: calc(8% + env(safe-area-inset-top, 0px)); }
            .void-login-overlay { padding-top: env(safe-area-inset-top, 0px); }

            /* 手動強制下移模式 (給動態島或安全區域失效時使用) */
            body.layout-pad-ios .void-top-bar { padding-top: 55px !important; }
            body.layout-pad-ios .void-app-tray { top: 96px !important; }
            body.layout-pad-ios .void-bubble-layer { top: 96px !important; }
            body.layout-pad-ios .void-panel-overlay { top: 130px !important; }
            body.layout-pad-ios #achievement-panel-overlay { top: 15% !important; }
            body.layout-pad-ios #store-panel-overlay { top: 12% !important; }
            body.layout-pad-ios .void-login-overlay { padding-top: 40px !important; }

            /* ── 瀅瀅書店色票主題全局覆蓋 ── */
            .void-bg { background-color: #452216 !important; }
            .void-top-bar { background: rgba(69,34,22,0.85) !important; color: #FBDFA2 !important; border-bottom: 1px solid rgba(251,223,162,0.2) !important; }
            #home-chat-title { color: #FBDFA2 !important; }
            .void-app-icon-label { color: #FBDFA2 !important; }
            .void-app-icon { background: rgba(120,55,25,0.8) !important; border: 1px solid rgba(251,223,162,0.3) !important; box-shadow: 0 4px 10px rgba(0,0,0,0.3) !important; }
            .void-bubble { --bc: #FBDFA2 !important; --bc-rgb: 251,223,162 !important; background: rgba(69,34,22,0.9) !important; color: #FFF8E7 !important; }
            .void-dialogue-box { background: rgba(120,55,25,0.9) !important; border: 1px solid rgba(251,223,162,0.4) !important; box-shadow: 0 4px 20px rgba(0,0,0,0.4) !important; }
            .void-name-tag { background: #FBDFA2 !important; color: #452216 !important; font-weight: bold !important; border: 1px solid #FBDFA2 !important; }
            .void-text { color: #FFF8E7 !important; }
            .void-chat-bar { background: rgba(69,34,22,0.9) !important; border-top: 1px solid rgba(251,223,162,0.3) !important; }
            .void-input { background: rgba(120,55,25,0.8) !important; border: 1px solid rgba(251,223,162,0.3) !important; color: #FFF8E7 !important; }
            .void-input:focus { border-color: #FBDFA2 !important; box-shadow: 0 0 0 2px rgba(251,223,162,0.2) !important; background: #452216 !important; }
            .void-send-btn { background: linear-gradient(135deg, #FBDFA2, #B78456) !important; color: #452216 !important; }
            .void-btn-inner { background: rgba(120,55,25,0.9) !important;  color: #FBDFA2 !important; }
            .void-btn-inner:hover { background: rgba(251,223,162,0.1) !important; box-shadow: 0 0 15px rgba(251,223,162,0.4) !important; }
            .void-hist-btn { color: #FBDFA2 !important; background: rgba(120,55,25,0.6) !important; border: 1px solid rgba(251,223,162,0.2) !important; }
            .void-hist-btn:hover { background: rgba(251,223,162,0.15) !important; }
            .qb-node-btn { background: rgba(120,55,25,0.8) !important; border-color: #FBDFA2 !important; color: #FBDFA2 !important; }
            .qb-node-btn:hover { background: rgba(251,223,162,0.1) !important; box-shadow: 0 0 15px rgba(251,223,162,0.4) !important; color: #FBDFA2 !important; border-color: #FBDFA2 !important; }
            
            /* 修正底部 TAB 消失/遮擋問題 */
            #aurelia-bottom-nav { background: #452216 !important; border-top: 1px solid rgba(251,223,162,0.3) !important; box-shadow: 0 -5px 15px rgba(0,0,0,0.5) !important; position: relative !important; z-index: 9999 !important; padding-bottom: env(safe-area-inset-bottom, 0px) !important; }
            .nav-button { color: #B78456 !important; }
            .nav-button.active-gold { color: #FBDFA2 !important; background: rgba(251,223,162,0.1) !important; }

            /* ── 登入介面外框 (瀅瀅書店色票) ── */
            .void-login-overlay {
                position:absolute;inset:0;z-index:200;overflow:hidden;
                font-family:'Noto Sans TC',sans-serif;
                background: rgba(120, 55, 25, 0.9); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
                display:flex;align-items:center;justify-content:center;
                animation:vssIn 0.3s cubic-bezier(0.2,0.8,0.2,1);
            }
            .void-login-overlay::before {
                content:'';position:absolute;inset:0;pointer-events:none;z-index:0;
                background-image:
                    linear-gradient(rgba(251,223,162,0.05) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(251,223,162,0.05) 1px, transparent 1px);
                background-size: 30px 30px; opacity: 0.8;
            }

            /* ── 居中登入卡片 ── */
            .void-login-container { display:flex;flex-direction:column;align-items:center;width:100%;z-index:2;padding:20px;box-sizing:border-box; }
            .void-login-brand { font-size:12px;color:#FBDFA2;text-transform:uppercase;letter-spacing:4px;font-weight:800;margin-bottom:15px; text-shadow: 0 0 10px rgba(251,223,162,0.4); }
            .void-login-box { 
                width:100%;max-width:320px;background:rgba(120,55,25,0.95);
                border:1px solid #FBDFA2;border-radius:12px;padding:30px 25px;
                box-shadow:0 10px 40px rgba(0,0,0,0.5), inset 0 0 20px rgba(251,223,162,0.05); 
            }
            .void-login-title { font-size:18px;font-weight:900;color:#FBDFA2;margin-bottom:8px; }
            .void-login-desc { font-size:11px;color:#B78456;margin-bottom:20px;line-height:1.5; }
            
            .void-login-input-group { margin-bottom: 20px; }
            .void-login-input-group label { display:block;font-size:10px;font-weight:800;color:#B78456;margin-bottom:6px;letter-spacing:1px; }
            .void-login-input-group input { 
                width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid rgba(251,223,162,0.4);
                border-radius:6px;background:rgba(69,34,22,0.8);color:#FFF8E7;font-size:13px;
                outline:none;transition:all 0.2s ease; 
            }
            .void-login-input-group input:focus { border-color:#FBDFA2;box-shadow:0 0 0 3px rgba(251,223,162,0.2);background:#783719; }
            
            .void-login-btn { 
                width:100%;padding:12px;background:linear-gradient(135deg, #FBDFA2, #B78456);
                color:#452216;border:none;border-radius:6px;font-size:12px;font-weight:900;
                cursor:pointer;transition:all 0.2s ease;letter-spacing:2px;box-shadow:0 4px 15px rgba(251,223,162,0.3); 
            }
            .void-login-btn:hover { filter:brightness(1.1);transform:translateY(-2px);box-shadow:0 6px 20px rgba(251,223,162,0.5); }
            .void-login-btn:disabled { opacity:0.6;cursor:not-allowed;transform:none;box-shadow:none; }
            
            .void-login-alt-btn {
                width:100%;margin-top:12px;padding:10px;background:transparent;
                color:#B78456;border:1px solid transparent;border-radius:6px;
                font-size:11px;font-weight:800;cursor:pointer;transition:0.2s;
            }
            .void-login-alt-btn:hover { background:rgba(251,223,162,0.1);color:#FBDFA2;border-color:rgba(251,223,162,0.3); }

            /* ── 人設/佈局 選擇器 ── */
            .void-login-name-row { display:flex;gap:6px;align-items:stretch; }
            .void-login-name-row input { flex:1;min-width:0; }
            .void-persona-pick-btn {
                flex-shrink:0;padding:0 11px;background:rgba(251,223,162,0.1);
                border:1px solid rgba(251,223,162,0.4);border-radius:6px;color:#FBDFA2;
                font-size:15px;cursor:pointer;transition:all 0.2s;line-height:1;
            }
            .void-persona-pick-btn:hover { background:rgba(251,223,162,0.2);color:#FBDFA2;border-color:#FBDFA2; }
            .void-persona-dropdown {
                display:none;margin-top:5px;background:rgba(120,55,25,0.98);border:1px solid #FBDFA2;
                border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,0.6);
                max-height:220px;overflow-y:auto;
            }
            .void-persona-dropdown::-webkit-scrollbar { width:4px; }
            .void-persona-dropdown::-webkit-scrollbar-thumb { background:rgba(251,223,162,0.4);border-radius:4px; }
            .void-persona-item {
                padding:9px 13px;font-size:12px;color:#FFF8E7;cursor:pointer;
                border-bottom:1px solid rgba(255,255,255,0.05);display:flex;align-items:center;gap:7px;transition:0.15s;
            }
            .void-persona-item:last-child { border-bottom:none; }
            .void-persona-item:hover { background:rgba(251,223,162,0.15);color:#FBDFA2; }
            .void-persona-item.is-selected { font-weight:800;color:#FBDFA2; }
            .void-persona-item .vpick-badge { font-size:9px;background:rgba(251,223,162,0.2);color:#FBDFA2;padding:1px 5px;border-radius:3px;font-weight:800; }
            .void-persona-empty { padding:14px;font-size:11px;color:#B78456;text-align:center; }

            /* ── 隱藏的 Session 管理器 ── */
            .void-session-manager-inner { 
                width:100%;height:100%;display:flex;flex-direction:column;z-index:2;
                background:rgba(69, 34, 22, 0.85); 
            }
            .void-session-topbar {
                flex-shrink:0;padding:20px 26px 15px;position:relative;z-index:2;
                background: linear-gradient(to bottom, rgba(120,55,25,0.95) 0%, transparent 100%);
                display: flex; justify-content: space-between; align-items: flex-start;
            }
            .void-session-brand { font-size:10px;color:#B78456;text-transform:uppercase;letter-spacing:3px;font-weight:800;margin-bottom:6px; }
            .void-session-chatid { font-size:16px;font-weight:900;color:#FBDFA2;font-family:'Courier New',monospace; }
            .void-session-back-btn {
                padding:8px 16px;background:rgba(120,55,25,0.8);border:1px solid rgba(251,223,162,0.4);
                color:#FBDFA2;font-size:11px;font-weight:800;border-radius:4px;
                cursor:pointer;transition:all 0.2s ease;
            }
            .void-session-back-btn:hover { background:rgba(251,223,162,0.15);color:#FBDFA2; }

            .void-session-body { flex:1;overflow-y:auto;padding:0 26px 20px;display:flex;flex-direction:column;gap:10px;position:relative;z-index:2; }
            .void-session-body::-webkit-scrollbar { width:4px; }
            .void-session-body::-webkit-scrollbar-track { background:transparent; }
            .void-session-body::-webkit-scrollbar-thumb { background:rgba(251,223,162,0.4);border-radius:2px; }

            .void-session-card {
                background:rgba(120,55,25,0.9);border:1px solid rgba(251,223,162,0.2);
                border-left:3px solid #B78456;border-radius:6px;padding:12px 16px;
                display:flex;align-items:center;gap:15px;box-shadow:0 4px 15px rgba(0,0,0,0.3);
                transition:all 0.2s ease;
            }
            .void-session-card:hover { background:rgba(183,132,86,1);border-color:#FBDFA2;border-left-color:#FBDFA2;transform:translateX(4px);box-shadow:0 6px 20px rgba(251,223,162,0.15); }
            .void-session-card.is-current { background:rgba(183,132,86,1);border-color:#FBDFA2;border-left-color:#FBDFA2;box-shadow:0 4px 15px rgba(251,223,162,0.25); }
            .void-session-card-info { flex:1;min-width:0; }
            .void-session-card-id { font-size:13px;font-family:'Courier New',monospace;font-weight:800;color:#FFF8E7; white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
            .void-session-card-preview { font-size:11px;color:#B78456;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
            .void-session-card-meta { font-size:10px;color:#B78456;margin-top:6px;font-weight:500; }
            .void-session-card-cur-tag { margin-left:8px;font-size:9px;color:#452216;background:#FBDFA2;padding:2px 6px;border-radius:4px;font-weight:800; }
            .void-session-card-actions { display:flex;gap:5px;flex-shrink:0; }
            .void-session-load-btn { background:rgba(251,223,162,0.1);color:#FBDFA2;border:1px solid rgba(251,223,162,0.4);border-radius:4px;padding:6px 12px;font-size:10px;font-weight:800;cursor:pointer;transition:0.2s;letter-spacing:1px;text-transform:uppercase; }
            .void-session-load-btn:hover { background:rgba(251,223,162,0.2);color:#FBDFA2;border-color:#FBDFA2; }
            .void-session-load-btn:disabled { opacity:0.3;cursor:default; }
            .void-session-del-btn { background:transparent;color:#fc8181;border:1px solid transparent;border-radius:4px;padding:6px 10px;font-size:14px;cursor:pointer;transition:0.2s;line-height:1; }
            .void-session-del-btn:hover { background:rgba(252,129,129,0.1);border-color:#fc8181;color:#f56565; }
            .void-session-empty, .void-session-spinner { text-align:center;padding:40px 0;color:#FBDFA2;font-size:11px;letter-spacing:2px;font-weight:bold; }

            /* ===== 404 模式覆蓋 (維持駭客綠風格不變) ===== */
            .void-tab.mode-404 .void-login-overlay { background: rgba(0,10,0,0.95); }
            .void-tab.mode-404 .void-login-overlay::before { background-image: linear-gradient(rgba(0,255,65,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,65,0.1) 1px, transparent 1px); }
            .void-tab.mode-404 .void-login-brand { color: #00cc33; text-shadow: none; }
            .void-tab.mode-404 .void-login-box { background: rgba(0,15,0,0.9); border-color: #00ff41; box-shadow: 0 0 20px rgba(0,255,65,0.15); }
            .void-tab.mode-404 .void-login-title { color: #00ff41; }
            .void-tab.mode-404 .void-login-desc { color: rgba(0,255,65,0.6); }
            .void-tab.mode-404 .void-login-input-group label { color: #00cc33; }
            .void-tab.mode-404 .void-login-input-group input { background: #001a00; border-color: rgba(0,255,65,0.4); color: #00ff41; }
            .void-tab.mode-404 .void-login-input-group input:focus { border-color: #00ff41; box-shadow: 0 0 0 3px rgba(0,255,65,0.2); }
            .void-tab.mode-404 .void-login-btn { background: #004d00; color: #00ff41; border: 1px solid #00ff41; box-shadow: 0 0 10px rgba(0,255,65,0.2); }
            .void-tab.mode-404 .void-login-btn:hover { background: #006600; box-shadow: 0 0 15px rgba(0,255,65,0.4); filter:none; }
            .void-tab.mode-404 .void-login-alt-btn { color: #00cc33; border-color: transparent; }
            .void-tab.mode-404 .void-login-alt-btn:hover { background: rgba(0,255,65,0.1); border-color: rgba(0,255,65,0.3); }

            .void-tab.mode-404 .void-session-manager-inner { background: rgba(0,10,0,0.8); }
            .void-tab.mode-404 .void-session-topbar { background: linear-gradient(to bottom, rgba(0,15,0,0.95) 0%, transparent 100%); }
            .void-tab.mode-404 .void-session-brand { color: #00cc33; text-shadow: none; }
            .void-tab.mode-404 .void-session-chatid { color: #00ff41; }
            .void-tab.mode-404 .void-session-back-btn { background: #001a00; color: #00ff41; border-color: rgba(0,255,65,0.4); }
            .void-tab.mode-404 .void-session-back-btn:hover { background: #003300; box-shadow: 0 0 15px rgba(0,255,65,0.3); color:#00ff41; }
            .void-tab.mode-404 .void-session-card { background: rgba(0,15,0,0.8); border-color: rgba(0,255,65,0.3); border-left-color: rgba(0,255,65,0.5); box-shadow:none; }
            .void-tab.mode-404 .void-session-card:hover { background: rgba(0,25,0,0.9); border-left-color: #00ff41; box-shadow: 0 0 10px rgba(0,255,65,0.2); border-color: rgba(0,255,65,0.3); }
            .void-tab.mode-404 .void-session-card.is-current { background: rgba(0,20,0,0.9); border-color: #00cc33; border-left-color: #00ff41; }
            .void-tab.mode-404 .void-session-card-id { color: #b8ffcb; }
            .void-tab.mode-404 .void-session-card-preview { color: rgba(0,255,65,0.6); }
            .void-tab.mode-404 .void-session-card-meta { color: rgba(0,255,65,0.4); }
            .void-tab.mode-404 .void-session-card-cur-tag { background: rgba(0,255,65,0.1); color: #00ff41; border-color: rgba(0,255,65,0.3); }
            .void-tab.mode-404 .void-session-load-btn { background: rgba(0,20,0,0.8); color: #00cc33; border-color: rgba(0,255,65,0.3); }
            .void-tab.mode-404 .void-session-load-btn:hover { background: rgba(0,255,65,0.1); color: #00ff41; border-color: rgba(0,255,65,0.3); }
            .void-tab.mode-404 .void-session-del-btn { color: #ff3333; }
            .void-tab.mode-404 .void-session-empty, .void-tab.mode-404 .void-session-spinner { color: #00cc33; }
        `;
        document.head.appendChild(s);
    }

    async function showLoginScreen(tab) {
        if (!tab) return;
        _injectLoginCss();
        const currentId = getChatId();
        _currentChatId = currentId;

        // 嘗試預先讀取看看有沒有已儲存的名字
        const db = window.OS_DB || (window.parent && window.parent.OS_DB);
        let savedName = '';
        if (db && db.getLobbyHistory) {
            try {
                const d = await db.getLobbyHistory(currentId);
                if (d && d.userName) savedName = d.userName;
            } catch(e) {}
        }

        const ov = document.createElement('div');
        ov.id = 'void-login-overlay';
        ov.className = 'void-login-overlay';
        ov.innerHTML = `
            <div class="void-login-container">
                <div class="void-login-brand">LUNA-VII // 視差書咖</div>
                <div class="void-login-box">
                    <div class="void-login-title">LOGIN</div>
                    <div class="void-login-desc">請輸入您的委託人代號以建立神經連結。</div>
                    <div class="void-login-input-group">
                        <label>委託人代號 (USER NAME)</label>
                        <div class="void-login-name-row">
                            <input type="text" id="void-login-name" value="${savedName}" placeholder="例如: 約翰" autocomplete="off">
                            <button class="void-persona-pick-btn" id="void-layout-btn" title="介面佈局與人設設定">⚙️</button>
                        </div>
                        <div id="void-layout-dropdown" class="void-persona-dropdown"></div>
                    </div>
                    <button class="void-login-btn" id="void-login-submit">▶ 進入書咖</button>
                    <button class="void-login-alt-btn" id="void-login-sessions">📂 管理歷史素材</button>
                </div>
            </div>
            <div id="void-session-manager" style="display:none; width:100%; height:100%;"></div>
        `;
        tab.appendChild(ov);

        const inputEl = ov.querySelector('#void-login-name');
        const submitBtn = ov.querySelector('#void-login-submit');
        const sessionBtn = ov.querySelector('#void-login-sessions');

        const doLogin = async () => {
            const val = inputEl.value.trim();
            if (!val) {
                inputEl.style.borderColor = '#fc8181';
                setTimeout(() => inputEl.style.borderColor = 'rgba(251,223,162,0.4)', 1000);
                return;
            }
            submitBtn.disabled = true;
            submitBtn.textContent = '連線中...';
            
            // 先設定名字
            IRIS_STATE.userName = val;
            
            // 嘗試載入該 ChatId 的舊有歷史紀錄
            await loadLobbyHistory(currentId);
            
            // 重新確保 userName 是剛剛輸入的 (避免被舊存檔覆蓋)
            IRIS_STATE.userName = val;
            
            // 🔥 強制馬上存入資料庫，防止使用者馬上按 F5 導致資料遺失！
            await saveLobbyHistory();
            
            closeLoginScreen(tab);
        };

        submitBtn.onclick = doLogin;
        inputEl.onkeypress = (e) => { if(e.key === 'Enter') doLogin(); };

        sessionBtn.onclick = () => {
            renderSessionManager(ov.querySelector('#void-session-manager'), currentId, tab);
        };

        // ── 人設選擇器 / 佈局設定器 ──
        const layoutBtn  = ov.querySelector('#void-layout-btn');
        const dropdown = ov.querySelector('#void-layout-dropdown');

        // 同 os_tavern_bridge.js 邏輯：API 取全列表 → DOM fallback
        async function _fetchPersonaList() {
            const win = window.parent || window;
            try {
                const ctx = win.SillyTavern?.getContext?.();
                const headers = ctx?.getRequestHeaders?.() || {};
                const res = await fetch('/api/avatars/get', {
                    method: 'POST',
                    headers: { ...headers, 'Content-Type': 'application/json' }
                });
                if (res.ok) {
                    const allAvatars = await res.json();
                    const pu = ctx?.powerUserSettings;
                    const currentAvatar = ctx?.userAvatar;
                    if (Array.isArray(allAvatars) && allAvatars.length) {
                        return allAvatars.map(av => ({
                            name: (pu?.personas?.[av]) || av.replace(/\.[^.]+$/, ''),
                            isSelected: av === currentAvatar
                        }));
                    }
                }
            } catch(e) { console.warn('[VoidTerminal] /api/avatars/get 失敗，改用 DOM', e); }

            // DOM fallback（分頁限制，只能看到當前頁）
            const list = [];
            try {
                win.document.querySelectorAll('#user_avatar_block .avatar-container').forEach(block => {
                    const name = block.querySelector('.ch_name.flex1')?.textContent.trim();
                    if (name) list.push({ name, isSelected: block.classList.contains('selected') });
                });
            } catch(e) {}
            return list;
        }

        async function _renderDropdown() {
            dropdown.innerHTML = '<div class="void-persona-empty">⏳ 讀取中...</div>';
            dropdown.style.display = 'block';

            const isStandalone = !(window.parent || window).SillyTavern;
            let html = '';

            // 佈局設定區塊 (iOS 解決方案)
            const currentMode = localStorage.getItem('aurelia_layout_mode') || 'auto';
            html += `<div style="padding: 8px 12px; font-size: 10px; font-weight: bold; color: #B78456; background: rgba(69,34,22,0.9);">🖥️ 介面佈局 (解決頂部遮擋)</div>`;
            html += `<div class="void-persona-item ${currentMode === 'auto' ? 'is-selected' : ''}" data-layout="auto"><span>📱 自動適配 (Auto/預設)</span></div>`;
            html += `<div class="void-persona-item ${currentMode === 'pad-ios' ? 'is-selected' : ''}" data-layout="pad-ios"><span>🍎 強制下移 (iOS 動態島/瀏海)</span></div>`;

            // 角色切換區塊 (僅酒館模式顯示)
            if (!isStandalone) {
                html += `<div style="padding: 8px 12px; font-size: 10px; font-weight: bold; color: #B78456; background: rgba(69,34,22,0.9); margin-top: 5px;">👤 酒館人設 (Persona)</div>`;
                const list = await _fetchPersonaList();
                if (!list.length) {
                    html += '<div class="void-persona-empty">⚠ 未找到酒館人設</div>';
                } else {
                    list.forEach(p => {
                        html += `<div class="void-persona-item persona-pick ${p.isSelected ? 'is-selected' : ''}" data-name="${p.name}">
                            <span>${p.name}</span>${p.isSelected ? '<span class="vpick-badge">使用中</span>' : ''}
                        </div>`;
                    });
                }
            } else {
                html += `<div style="padding: 8px 12px; font-size: 10px; font-weight: bold; color: #B78456; background: rgba(69,34,22,0.9); margin-top: 5px;">👤 獨立模式</div>`;
                html += `<div class="void-persona-empty" style="padding:8px 14px;">獨立 API 模式下，請直接在上方輸入您的代號。</div>`;
            }

            dropdown.innerHTML = html;

            // 綁定點擊事件
            dropdown.querySelectorAll('.void-persona-item').forEach(item => {
                item.onclick = (e) => {
                    e.stopPropagation();
                    if (item.dataset.layout) {
                        localStorage.setItem('aurelia_layout_mode', item.dataset.layout);
                        applyLayoutMode();
                        _renderDropdown(); // 重新渲染以更新打勾狀態
                    } else if (item.dataset.name) {
                        inputEl.value = item.dataset.name;
                        dropdown.style.display = 'none';
                        inputEl.focus();
                    }
                };
            });
        }

        layoutBtn.onclick = (e) => {
            e.stopPropagation();
            if (dropdown.style.display === 'block') { dropdown.style.display = 'none'; return; }
            _renderDropdown();
        };

        document.addEventListener('click', function _closeDropdown(e) {
            if (!dropdown.contains(e.target) && e.target !== layoutBtn) {
                dropdown.style.display = 'none';
            }
        }, { capture: true });
        
        // 自動 Focus 輸入框
        setTimeout(() => inputEl.focus(), 300);
    }

    async function renderSessionManager(container, currentId, tab) {
        container.style.display = 'block';
        const loginContainer = tab.querySelector('.void-login-container');
        if (loginContainer) loginContainer.style.display = 'none';

        container.innerHTML = `
            <div class="void-session-manager-inner">
                <div class="void-session-topbar">
                    <div style="min-width:0;flex:1;">
                        <div class="void-session-brand">歷史素材管理</div>
                        <div class="void-session-chatid">${_truncateId(currentId)}</div>
                    </div>
                    <button class="void-session-back-btn">‹ 返回登入</button>
                </div>
                <div class="void-session-body">
                    <div id="vss-list"><div class="void-session-spinner">⚙ 載入存檔...</div></div>
                </div>
            </div>
        `;

        container.querySelector('.void-session-back-btn').onclick = () => {
            container.style.display = 'none';
            if (loginContainer) loginContainer.style.display = 'flex';
        };

        const db = window.OS_DB || (window.parent && window.parent.OS_DB);
        const listEl = container.querySelector('#vss-list');
        if (!db || !db.getAllLobbyHistories) {
            listEl.innerHTML = '<div class="void-session-empty">資料庫未就緒，無法管理存檔。</div>';
            return;
        }
        try {
            const sessions = await db.getAllLobbyHistories();
            sessions.sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0));
            _renderSessionList(listEl, sessions, currentId, tab, db);
        } catch(e) {
            listEl.innerHTML = '<div class="void-session-empty">載入存檔失敗</div>';
        }
    }

    function closeLoginScreen(tab) {
        const t = tab || document.getElementById('aurelia-home-tab');
        const ov = t ? t.querySelector('#void-login-overlay') : document.getElementById('void-login-overlay');
        if (!ov) return;
        ov.style.transition = 'opacity 0.25s'; ov.style.opacity = '0';
        setTimeout(() => { ov.remove(); _applyLoadedLobbyState(); }, 260);
    }

    function _renderSessionList(listEl, sessions, currentId, tab, db) {
        if (sessions.length === 0) { listEl.innerHTML = '<div class="void-session-empty">尚無存檔記錄</div>'; return; }
        listEl.innerHTML = '';
        sessions.forEach(s => {
            const isCur = s.id === currentId;
            const card = document.createElement('div');
            card.className = 'void-session-card' + (isCur ? ' is-current' : '');
            
            // 如果存檔裡有 userName，顯示出來
            const nameBadge = s.userName ? `<span style="color:#FBDFA2;">[${s.userName}]</span> ` : '';
            
            card.innerHTML = `
                <div class="void-session-card-info">
                    <div class="void-session-card-id">${nameBadge}${_truncateId(s.id)}${isCur ? '<span class="void-session-card-cur-tag">● 當前</span>' : ''}</div>
                    <div class="void-session-card-preview">${s.preview || '(尚無對話)'}</div>
                    <div class="void-session-card-meta">${s.msgCount || 0} 條訊息 · ${_formatSessionTime(s.lastUpdated)}</div>
                </div>
                <div class="void-session-card-actions">
                    ${!isCur ? '<button class="void-session-load-btn">載入</button>' : ''}
                    <button class="void-session-del-btn">×</button>
                </div>
            `;
            const loadBtn = card.querySelector('.void-session-load-btn');
            if (loadBtn) loadBtn.onclick = async e => {
                e.stopPropagation(); loadBtn.disabled = true; loadBtn.textContent = '...';
                await loadLobbyHistory(s.id);
                closeLoginScreen(tab);
            };
            const delBtn = card.querySelector('.void-session-del-btn');
            delBtn.onclick = async e => {
                e.stopPropagation(); card.style.opacity = '0.4'; card.style.pointerEvents = 'none';
                if (db && db.deleteLobbyHistory) await db.deleteLobbyHistory(s.id).catch(() => {});
                card.remove();
                const remaining = listEl.querySelectorAll('.void-session-card').length;
                if (remaining === 0) listEl.innerHTML = '<div class="void-session-empty">尚無存檔記錄</div>';
                if (isCur) { IRIS_STATE.history = []; _cheshireHistoryBackup = []; _irisHistoryBackup = []; }
            };
            listEl.appendChild(card);
        });
    }

    // 更新傳送門按鈕的可見性與提示文字
    function _updatePortalBtn() {
        const btn = document.getElementById('room-portal-btn');
        if (!btn) return;
        if (visit404Count < 1) { btn.style.display = 'none'; return; }
        btn.style.display = '';
        btn.title = is404Room ? '返回視差書咖' : '傳送至 404 號房';
    }

    function _applyLoadedLobbyState() {
        // 如果載入的 session 是在 404 模式，還原 404 UI
        if (is404Room) {
            const tab = document.getElementById('aurelia-home-tab');
            if (tab && !tab.classList.contains('mode-404')) tab.classList.add('mode-404');
            const avatar = document.getElementById('iris-avatar');
            if (avatar) { avatar.src = 'https://files.catbox.moe/1gddlp.png'; avatar.title = '戳戳 柴郡'; avatar.style.opacity = '1'; }
            const titleEl = document.getElementById('home-chat-title');
            if (titleEl) titleEl.textContent = '[ERR_404] THE STRAY NODE';
            const inputField = document.getElementById('iris-input');
            if (inputField) inputField.placeholder = '...你最好有話說。';
            const nameBox = document.getElementById('iris-name-tag');
            if (nameBox) { nameBox.style.display = 'block'; nameBox.innerHTML = '<span>CHESHIRE / 柴郡</span>'; }
            const iH = document.getElementById('iris-hist-btn');
            const cH = document.getElementById('cheshire-hist-btn');
            if (iH) iH.style.display = 'none';
            if (cH) cH.style.display = '';
            const nav = document.getElementById('aurelia-bottom-nav');
            if (nav) {
                nav.style.background = '#000'; nav.style.borderTop = '1px solid #00cc33';
                nav.querySelectorAll('.nav-button').forEach(b => {
                    const isHome = b.dataset.navId === 'nav-home';
                    b.classList.remove('active-gold');
                    b.style.color = isHome ? '#00ff41' : '#1a4d1a'; b.style.background = isHome ? 'rgba(0,255,65,0.1)' : 'transparent';
                });
            }
            switchLobbyBgm(URLS.BGM_404);
        } else {
            // 非 404 模式：還原瀅瀅與復古拿鐵 UI
            const tab = document.getElementById('aurelia-home-tab');
            if (tab) tab.classList.remove('mode-404');
            const avatar = document.getElementById('iris-avatar');
            if (avatar) { avatar.src = URLS.IRIS_AVATAR; avatar.title = '戳戳 瀅瀅'; avatar.style.opacity = '1'; }
            const titleEl = document.getElementById('home-chat-title');
            if (titleEl) titleEl.textContent = 'Parallax Archive & Cafe';
            const inputField = document.getElementById('iris-input');
            if (inputField) inputField.placeholder = '提供故事素材或與瀅瀅對話...';
            const nameBox = document.getElementById('iris-name-tag');
            if (nameBox) { nameBox.style.display = 'block'; nameBox.innerHTML = '<span>瀅瀅</span>'; }
            const iH = document.getElementById('iris-hist-btn');
            const cH = document.getElementById('cheshire-hist-btn');
            if (iH) iH.style.display = '';
            if (cH) cH.style.display = 'none';
            const nav = document.getElementById('aurelia-bottom-nav');
            if (nav) {
                nav.style.background = '#452216'; nav.style.borderTop = '1px solid rgba(251,223,162,0.3)'; nav.style.boxShadow = '0 -5px 15px rgba(0,0,0,0.5)';
                nav.querySelectorAll('.nav-button').forEach(b => {
                    const isHome = b.dataset.navId === 'nav-home';
                    b.style.color = ''; b.style.background = ''; // 移除內聯樣式
                    if (isHome) { b.classList.add('active-gold'); }
                    else { b.classList.remove('active-gold'); }
                });
            }
            switchLobbyBgm(URLS.BGM_LOBBY);
        }
        // 有對話歷史：顯示「繼續」提示；沒有：播放初始歡迎動畫
        const histTotal = IRIS_STATE.history.length + _cheshireHistoryBackup.length + _irisHistoryBackup.length;
        if (histTotal > 0) {
            const box = document.getElementById('iris-text');
            const nameBox = document.getElementById('iris-name-tag');
            if (box) box.innerHTML = is404Room
                ? `<span style="color:#00cc33;font-style:italic;">(對話歷史已載入...)</span>`
                : `<span style="color:#FBDFA2;font-style:italic;">(素材檔案已載入，繼續吧。)</span>`;
            if (nameBox) nameBox.style.display = 'none';
        } else {
            const userName = IRIS_STATE.userName || '委託人';
            if (is404Room) {
                playIrisSequence("[Nar|純白大廳的訊號如舊電視機碎裂，螢光綠代碼瀑布般傾瀉。那個假笑人偶消失了。]\n[Audio|https://files.catbox.moe/1xanb2.mp3]\n[Char|柴郡|smirk|*(停下手中轉動的魔術方塊，從連帽衫的陰影中抬起頭)* 嘖——居然真的有人無聊到輸入那串代碼。這裡沒有新手教學，也沒有那個寫小說的天然呆。別碰左邊那串代碼，除非你想讓神經接續裝置燒成焦炭。……算了，我幫你鎖起來了，真麻煩。]");
            } else {
                playIrisSequence(`[Nar|你推開視差書咖的木門，清脆的風鈴聲響起。吧台後，一名穿著米色針織衫的少女正咬著羽毛筆發呆。]\n[Char|瀅瀅|smile|「啊！歡迎光臨，${userName}！我正好卡文了，今天有什麼新素材（委託）要交給我嗎？」]`);
            }
        }
        _updatePortalBtn();
    }

    // ===== 構建大廳 UI =====
    VoidTerminal.createTab = function(parentDoc) {
        if (window.AureliaVoidStyles) window.AureliaVoidStyles.inject(URLS.BG);
        
        // 確保注入移動端的 APPS 下拉選單 CSS 以及新增的 QUEST 動態節點 CSS
        if (!parentDoc.getElementById('mobile-apps-style')) {
            const style = parentDoc.createElement('style');
            style.id = 'mobile-apps-style';
            style.innerHTML = `
                .mobile-apps-menu { display: none; position: relative; flex-shrink: 0; }
                .mobile-apps-btn { background:none; border:1px solid rgba(251,223,162,0.4); border-radius:7px; cursor:pointer; font-size:13px; padding:5px 8px; line-height:1; opacity:0.8; transition:all 0.2s; color:#FBDFA2; display:flex; align-items:center; gap:5px; }
                .mobile-apps-btn span { font-size:9px; font-weight:600; letter-spacing:0.5px; }
                .mobile-apps-btn:hover, .mobile-apps-btn.open { opacity:1; border-color:#FBDFA2; background:rgba(251,223,162,0.1); }
                .mobile-apps-dropdown { position:absolute; top:calc(100% + 5px); left:0; background:rgba(120,55,25,0.97); backdrop-filter:blur(14px); border:1px solid rgba(251,223,162,0.3); border-radius:9px; box-shadow:0 6px 20px rgba(0,0,0,0.5); min-width:130px; z-index:30; overflow:hidden; animation:dropIn 0.15s ease; max-height: 50vh; overflow-y: auto; }
                .mobile-apps-dropdown-item { display:flex; align-items:center; gap:9px; padding:10px 14px; font-size:12px; color:#FFF8E7; cursor:pointer; transition:background 0.13s; border-bottom:1px solid rgba(255,255,255,0.05); }
                .mobile-apps-dropdown-item:last-child { border-bottom:none; }
                .mobile-apps-dropdown-item:hover { background:rgba(251,223,162,0.15); color:#FBDFA2; }
                .mobile-apps-dropdown-item i { font-size:11px; width:13px; text-align:center; opacity:0.8; }
                
                @media (max-width: 680px) {
                    .void-app-tray { display: none !important; }
                    .mobile-apps-menu { display: block; }
                }

                /* 404 彩蛋模式覆蓋 */
                .void-tab.mode-404 .mobile-apps-btn { border-color:rgba(0,255,65,0.25) !important; color:#00cc33 !important; }
                .void-tab.mode-404 .mobile-apps-dropdown { background:rgba(0,10,0,0.97) !important; border-color:rgba(0,255,65,0.25) !important; box-shadow:0 6px 20px rgba(0,255,65,0.08) !important; }
                .void-tab.mode-404 .mobile-apps-dropdown-item { color:rgba(0,200,50,0.8) !important; border-bottom-color:rgba(0,255,65,0.1) !important; }
                .void-tab.mode-404 .mobile-apps-dropdown-item:hover { background:rgba(0,255,65,0.08) !important; color:#00ff41 !important; }

                /* === QUEST 系統動態節點 CSS === */
                .qb-nodes-overlay { position: absolute; inset: 0; pointer-events: none; z-index: 15; overflow: hidden; }
                .qb-node-btn { position: absolute; pointer-events: none; background: rgba(120,55,25,0.8); backdrop-filter: blur(8px); border: 1px solid #FBDFA2; color: #FBDFA2; padding: 12px 20px; border-radius: 8px; font-family: 'Noto Sans TC', sans-serif; font-weight: bold; font-size: 14px; cursor: pointer; opacity: 0; box-shadow: 0 4px 15px rgba(0,0,0,0.5); display:flex; align-items:center; gap:10px; transform: translate(-50%, -50%) scale(0.5); transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); white-space: nowrap; }
                .qb-node-btn:hover { background: rgba(251,223,162,0.1); border-color: #FBDFA2; color: #FBDFA2; box-shadow: 0 0 20px rgba(251,223,162,0.4); transform: translate(-50%, -50%) scale(1.05) !important; }
                .qb-nodes-overlay.active .qb-node-btn { opacity: 1; pointer-events: auto; transform: translate(-50%, -50%) scale(1); }
                
                /* 弧形坐標設定 */
                .left-top  { top: 35%; left: 22%; transition-delay: 0.0s; }
                .left-mid  { top: 52%; left: 16%; transition-delay: 0.1s; }
                .left-bot  { top: 69%; left: 22%; transition-delay: 0.2s; }
                .right-bot { top: 69%; left: 78%; transition-delay: 0.3s; }
                .right-mid { top: 52%; left: 84%; transition-delay: 0.4s; }
                .right-top { top: 35%; left: 78%; transition-delay: 0.5s; }

                /* 404 模式下 QUEST 節點覆蓋 */
                .void-tab.mode-404 .qb-node-btn { background: rgba(0, 15, 0, 0.8); border-color: rgba(0, 204, 51, 0.6); color: #00cc33; }
                .void-tab.mode-404 .qb-node-btn:hover { background: rgba(0, 255, 65, 0.1); border-color: #00ff41; color: #00ff41; box-shadow: 0 0 20px rgba(0,255,65,0.3); }

                /* === 🔥 成就面板 (Achievement Panel) 全新懸浮設計 === */
                @keyframes achPanelIn { from{opacity:0;transform:translate(-50%, 20px) scale(0.95)} to{opacity:1;transform:translate(-50%, 0) scale(1)} }
                #achievement-panel-overlay {
                    position:absolute; left: 50%; transform: translateX(-50%);
                    width: 90%; max-width: 480px; height: 75%; z-index: 50;
                    background: rgba(69, 34, 22, 0.95); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
                    border: 1px solid rgba(251, 223, 162, 0.5); border-radius: 12px;
                    box-shadow: 0 15px 40px rgba(0,0,0,0.6), inset 0 0 20px rgba(251,223,162,0.05);
                    display:none; flex-direction:column;
                    font-family:'Noto Sans TC',sans-serif;
                    animation:achPanelIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
                }
                .ach-header { display:flex; align-items:center; justify-content:space-between; padding:14px 16px; border-bottom:1px solid rgba(251,223,162,0.3); flex-shrink:0; }
                .ach-title { font-size:13px; font-weight:800; color:#FBDFA2; letter-spacing:1px; }
                .ach-close { background:none; border:none; color:#B78456; cursor:pointer; font-size:16px; padding:2px 8px; transition:color 0.2s; }
                .ach-close:hover { color:#FBDFA2; }
                .ach-stats { padding:7px 16px; font-size:10px; color:#B78456; font-weight:600; letter-spacing:1px; text-transform:uppercase; border-bottom:1px solid rgba(255,255,255,0.04); flex-shrink:0; background:rgba(0,0,0,0.4); }
                .ach-list { flex:1; overflow-y:auto; padding:4px 0; }
                .ach-item { display:flex; align-items:flex-start; gap:10px; padding:12px 16px; border-bottom:1px solid rgba(255,255,255,0.04); transition:background 0.15s; }
                .ach-item:hover { background:rgba(251,223,162,0.05); }
                .ach-item.redeemed { opacity:0.5; }
                .ach-item-icon { font-size:18px; flex-shrink:0; margin-top:2px; text-shadow: 0 0 5px rgba(251,223,162,0.5); }
                .ach-item-body { flex:1; min-width:0; }
                .ach-item-name { font-size:13px; font-weight:700; color:#FBDFA2; margin-bottom:4px; letter-spacing:0.5px; }
                .ach-item.redeemed .ach-item-name { color:#B78456; text-shadow:none; }
                .ach-item-desc { font-size:11px; color:#FFF8E7; line-height:1.4; }
                .ach-item-meta { font-size:10px; color:#B78456; margin-top:4px; font-family:monospace; }
                .ach-item-badge { flex-shrink:0; font-size:9px; padding:4px 8px; border-radius:4px; font-weight:700; letter-spacing:0.5px; background:rgba(251,223,162,0.1); color:#FBDFA2; border:1px solid rgba(251,223,162,0.3); align-self:center; text-align:center; line-height:1.7; box-shadow: 0 0 10px rgba(251,223,162,0.1); }
                .ach-item.redeemed .ach-item-badge { background:rgba(255,255,255,0.04); color:#B78456; border-color:rgba(255,255,255,0.1); box-shadow:none; }
                .ach-empty { text-align:center; color:#B78456; font-size:12px; padding:50px 20px; line-height:1.8; font-weight:bold; }
                .ach-footer { padding:10px 16px; border-top:1px solid rgba(251,223,162,0.2); font-size:11px; color:#B78456; text-align:center; flex-shrink:0; background:rgba(0,0,0,0.5); font-weight:bold; letter-spacing:1px; }
                
                /* 404 模式下的成就面板 */
                .void-tab.mode-404 #achievement-panel-overlay { background:rgba(0, 15, 0, 0.9); border-color:#00cc33; box-shadow: 0 10px 40px rgba(0,255,65,0.2), inset 0 0 20px rgba(0,255,65,0.05); }
                .void-tab.mode-404 .ach-title { color:#00ff41; text-shadow: 0 0 8px rgba(0,255,65,0.5); }
                .void-tab.mode-404 .ach-item-name { color:#00ff41; }
                .void-tab.mode-404 .ach-item.redeemed .ach-item-name { color:#1a4d1a; }
                
                /* 成就按鈕特效 */
                #achievement-hist-btn { position:relative; }
                #achievement-hist-btn.has-pending::after { content:''; position:absolute; top:4px; right:4px; width:6px; height:6px; background:#FBDFA2; border-radius:50%; box-shadow:0 0 6px rgba(251,223,162,0.8); animation:achDot 1.5s ease-in-out infinite; }
                @keyframes achDot { 0%,100%{opacity:1} 50%{opacity:0.4} }

                /* === 🔥 404 商店面板 (Store Panel) 全新駭客終端設計 === */
                @keyframes storePanelIn { from{opacity:0;transform:translate(-50%, -20px) scale(0.95)} to{opacity:1;transform:translate(-50%, 0) scale(1)} }
                #store-panel-overlay {
                    position:absolute; left: 50%; transform: translateX(-50%);
                    width: 94%; max-width: 520px; height: 62%; z-index: 51;
                    background: #050a05;
                    display:none; flex-direction:column;
                    animation:storePanelIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
                    font-family: 'Courier New', monospace;
                    color:#00ff41;
                    border: 2px solid #00cc33;
                    border-radius: 8px;
                    box-shadow: 0 10px 30px rgba(0, 255, 65, 0.15), inset 0 0 15px rgba(0,255,65,0.1);
                    overflow:hidden;
                }
                #store-panel-overlay::before {
                    content: " "; display: block; position: absolute; top: 0; left: 0; bottom: 0; right: 0;
                    background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%);
                    z-index: 50; background-size: 100% 4px; pointer-events: none; opacity: 0.6;
                }
                .store-header { display:flex; justify-content:space-between; align-items:center; padding:12px 16px; border-bottom:1px solid rgba(0,255,65,0.4); flex-shrink:0; background:rgba(0,30,0,0.8); position:relative; z-index:2; }
                .store-title { font-size:15px; font-weight:bold; color:#00ff41; text-shadow: 0 0 5px #00ff41; letter-spacing:1px; }
                .store-shards { font-size:13px; color:#b8ffcb; font-weight:bold; background: rgba(0,255,65,0.15); padding: 4px 10px; border-radius: 4px; border: 1px solid rgba(0,255,65,0.3); }
                .store-close { background:none; border:none; color:#00cc33; font-size:18px; cursor:pointer; padding:2px 6px; transition: 0.2s; position:relative; z-index:52; }
                .store-close:hover { color:#00ff41; transform: scale(1.1); text-shadow: 0 0 8px #00ff41; }
                .store-eval-bar { display:flex; justify-content:space-between; align-items:center; padding:10px 16px; background:rgba(0,20,0,0.9); border-bottom:1px solid rgba(0,255,65,0.2); font-size:11px; color:#00cc33; flex-shrink:0; position:relative; z-index:2; }
                .store-eval-bar.empty { color:#004d00; }
                .store-eval-btn { background:transparent; border:1px solid #00ff41; color:#00ff41; padding:6px 14px; border-radius:4px; font-size:11px; cursor:pointer; font-family:inherit; font-weight:bold; text-transform:uppercase; transition:0.2s; box-shadow: inset 0 0 5px rgba(0,255,65,0.2); position:relative; z-index:52; }
                .store-eval-btn:hover:not(:disabled) { background:rgba(0,255,65,0.2); box-shadow: inset 0 0 10px rgba(0,255,65,0.5), 0 0 10px rgba(0,255,65,0.3); }
                .store-eval-btn:disabled { opacity:0.3; border-color:#004d00; color:#004d00; cursor:not-allowed; box-shadow:none; }
                .store-item-list { flex:1; overflow-y:auto; padding:12px; display:flex; flex-direction:column; gap:8px; position:relative; z-index:2; }
                .store-item-list::-webkit-scrollbar { width: 6px; }
                .store-item-list::-webkit-scrollbar-thumb { background: rgba(0,255,65,0.3); border-radius: 3px; }
                .store-item { display:flex; align-items:center; gap:12px; padding:12px; border:1px solid rgba(0,255,65,0.2); border-radius:6px; background:rgba(0,15,0,0.6); transition:all 0.2s; position:relative; }
                .store-item::before { content:''; position:absolute; left:0; top:0; bottom:0; width:3px; background:transparent; transition:0.2s; border-radius:6px 0 0 6px; }
                .store-item:hover { background:rgba(0,30,0,0.8); border-color:rgba(0,255,65,0.5); }
                .store-item:hover::before { background:#00ff41; }
                .store-item.owned { border-color:rgba(0,150,50,0.4); background:rgba(0,20,0,0.4); opacity:0.8; }
                .store-item.active { border-color:#00ff41; background:rgba(0,40,0,0.8); box-shadow: 0 0 15px rgba(0,255,65,0.1); opacity:1; }
                .store-item.active::before { background:#00ff41; box-shadow: 0 0 10px #00ff41; }
                .store-item-icon { font-size:24px; flex-shrink:0; width:32px; text-align:center; text-shadow: 0 0 8px rgba(0,255,65,0.4); filter: grayscale(20%); }
                .store-item.active .store-item-icon { filter: grayscale(0%); text-shadow: 0 0 12px rgba(0,255,65,0.8); }
                .store-item-info { flex:1; min-width:0; }
                .store-item-name { font-size:14px; font-weight:bold; color:#b8ffcb; margin-bottom:4px; display:flex; align-items:center; gap:8px; flex-wrap:wrap; text-shadow: 0 0 2px rgba(0,255,65,0.3); }
                .store-item.active .store-item-name { color:#00ff41; text-shadow: 0 0 5px #00ff41; }
                .store-badge { font-size:9px; padding:2px 6px; border-radius:12px; font-weight:bold; text-transform:uppercase; font-family:sans-serif; }
                .store-badge.owned-badge { background:rgba(0,200,50,0.15); color:#00cc33; border:1px solid rgba(0,200,50,0.3); }
                .store-badge.active-badge { background:rgba(0,255,65,0.25); color:#00ff41; border:1px solid #00ff41; box-shadow: 0 0 8px rgba(0,255,65,0.3); }
                .store-item-desc { font-size:11px; color:#5aaa5a; line-height:1.5; font-family:sans-serif; }
                .store-item.active .store-item-desc { color:#8aff8a; }
                .store-item-keyword { display:none; }
                .store-item-action { flex-shrink:0; display:flex; align-items:center; position:relative; z-index:52; }
                .store-buy-btn { background:rgba(0,0,0,0.5); border:1px solid #00ff41; color:#00ff41; padding:6px 14px; border-radius:4px; font-size:12px; cursor:pointer; font-family:inherit; font-weight:bold; transition:0.2s; }
                .store-buy-btn:hover:not(.disabled):not(:disabled) { background:rgba(0,255,65,0.2); box-shadow: 0 0 10px rgba(0,255,65,0.4); }
                .store-buy-btn.disabled, .store-buy-btn:disabled { opacity:0.3; border-color:#004d00; color:#004d00; cursor:not-allowed; box-shadow:none; }
                .store-toggle-btn { background:transparent; border:1px solid #00cc33; color:#00cc33; padding:6px 12px; border-radius:4px; font-size:11px; cursor:pointer; font-family:inherit; font-weight:bold; transition:0.2s; }
                .store-toggle-btn.active { background:rgba(0,255,65,0.2); border-color:#00ff41; color:#00ff41; box-shadow: 0 0 10px rgba(0,255,65,0.3); }
                .store-toggle-btn:hover { background:rgba(0,255,65,0.1); }
                .store-footer { padding:8px 16px; border-top:1px solid rgba(0,255,65,0.3); font-size:10px; color:#006600; text-align:center; flex-shrink:0; background:rgba(0,20,0,0.9); position:relative; z-index:2; text-transform:uppercase; letter-spacing:1px; }
                .store-msg { padding:6px 16px; font-size:12px; text-align:center; color:#00ff41; font-weight:bold; transition:opacity 0.3s; flex-shrink:0; text-shadow: 0 0 5px rgba(0,255,65,0.5); position:relative; z-index:2; }
                
                #store-shop-btn { display:none; }
                .void-tab.mode-404 #store-shop-btn { display:inline-flex; }

                /* 🌀 傳送門按鈕 (portal) */
                .portal-btn-img { width:20px; height:20px; object-fit:contain; display:block; border-radius:3px; }
                .void-portal-btn { padding:4px 6px !important; }
                .void-tab.mode-404 .void-portal-btn { border-color:rgba(0,255,65,0.4) !important; background:rgba(0,20,0,0.6) !important; }
                .void-tab.mode-404 .void-portal-btn:hover { background:rgba(0,255,65,0.15) !important; border-color:#00ff41 !important; box-shadow:0 0 10px rgba(0,255,65,0.3) !important; }
            `;
            parentDoc.head.appendChild(style);
        }

        const tab = parentDoc.createElement('div');
        tab.id = 'aurelia-home-tab';
        tab.className = 'aurelia-tab void-tab';

        const FEED_PALETTE = {
            SYS:  { c:'#FBDFA2', r:'251,223,162'  },
            ECHO: { c:'#9f7aea', r:'159,122,234' },
        };
        const FEED_ENTRIES = [
            { tag:'SYS', text:'LUNA-VII 敘事協議就緒 ▸ 等待靈感導入' },
            { tag:'SYS', text:'視差書咖待機中' }
        ];
        const feedHTML = FEED_ENTRIES.map((e, i) => {
            const pal = FEED_PALETTE[e.tag] || FEED_PALETTE.SYS;
            return `<div class="void-bubble" style="--bc:${pal.c};--bc-rgb:${pal.r};animation-delay:${0.3 + i * 0.15}s;">
                <div class="void-bubble-tag">${e.tag}</div>
                <div class="void-bubble-text">${e.text}</div>
            </div>`;
        }).join('');

        tab.innerHTML = `
            <div class="void-bg" style="background-color: #452216;"></div>
            <div class="void-grid"></div>

            <div class="void-top-bar" style="background: rgba(69,34,22,0.85); color: #FBDFA2; border-bottom: 1px solid rgba(251,223,162,0.2);">
                <div style="display:flex; gap:8px;">
                    <div id="lobby-sys-menu">
                        <button id="lobby-prompts-btn" title="系統工具" style="color: #FBDFA2; border-color: rgba(251,223,162,0.4);">
                            <i class="fa-solid fa-sliders"></i><span>SYS</span>
                        </button>
                        <div class="void-sys-dropdown" id="lobby-sys-dropdown" style="display:none; background: rgba(120,55,25,0.98); border-color: #FBDFA2;">
                            <div class="void-sys-dropdown-item" data-app="設置" style="color: #FFF8E7;"><i class="fa-solid fa-gear"></i><span>API設置</span></div>
                            <div class="void-sys-dropdown-item" data-app="提示詞" style="color: #FFF8E7;"><i class="fa-solid fa-sliders"></i><span>提示詞</span></div>
                            <div class="void-sys-dropdown-item" data-app="worldbook" style="color: #FFF8E7;"><i class="fa-solid fa-book-open"></i><span>世界書</span></div>
                            <div style="height:1px; background:rgba(251,223,162,0.2); margin:4px 0;"></div>
                            <div class="void-sys-dropdown-item" data-action="logout" style="color:#fc8181;"><i class="fa-solid fa-power-off"></i><span>切換帳號 / 佈局</span></div>
                        </div>
                    </div>
                    <div class="mobile-apps-menu" id="mobile-apps-menu">
                        <button class="mobile-apps-btn" id="mobile-apps-btn" title="應用程式">
                            <i class="fa-solid fa-layer-group"></i><span>APPS</span>
                        </button>
                        <div class="mobile-apps-dropdown" id="mobile-apps-dropdown" style="display:none;">
                            <div class="mobile-apps-dropdown-item" data-app="phone"><i class="fa-solid fa-mobile-screen"></i><span>手機</span></div>
                            <div class="mobile-apps-dropdown-item" data-app="child"><i class="fa-solid fa-baby"></i><span>育兒</span></div>
                            <div class="mobile-apps-dropdown-item" data-app="inv"><i class="fa-solid fa-magnifying-glass"></i><span>偵探</span></div>
                            <div class="mobile-apps-dropdown-item" data-app="host"><i class="fa-solid fa-martini-glass-citrus"></i><span>不夜城</span></div>
                            <div class="mobile-apps-dropdown-item" data-app="pet"><i class="fa-solid fa-paw"></i><span>寵物店</span></div>
                            <div class="mobile-apps-dropdown-item" data-app="pet_home"><i class="fa-solid fa-house"></i><span>我的寵物</span></div>
                            <div class="mobile-apps-dropdown-item" data-app="tarot"><i class="fa-solid fa-star-of-david"></i><span>塔羅</span></div>
                            <div class="mobile-apps-dropdown-item" data-app="rpg"><i class="fa-solid fa-shield-halved"></i><span>RPG 狀態</span></div>
                        </div>
                    </div>
                </div>
                <div style="min-width:0;flex:1;margin-left:8px;">
                    <div style="font-size:9px;color:#B78456;text-transform:uppercase;letter-spacing:2px;margin-bottom:2px;font-weight:bold;">NEXUS PARALLAX // LUNA-VII</div>
                    <div id="home-chat-title" style="font-size:12px;font-weight:800;color:#FBDFA2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:0.5px;">Parallax Archive & Cafe</div>
                </div>
                <button id="lobby-bgm-toggle" title="音樂開關"
                    style="background:none;border:none;cursor:pointer;font-size:18px;padding:4px 6px;line-height:1;opacity:0.7;transition:opacity 0.2s;"
                    onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'">🔊</button>
                <audio id="lobby-bgm-player" loop style="display:none;"></audio>
            </div>

            <div class="void-app-tray">
                <div class="void-app-icon" style="background: rgba(120,55,25,0.8); border: 1px solid rgba(251,223,162,0.3);" onclick="if(window.togglePhoneSystem) window.togglePhoneSystem()"><div class="void-app-icon-emoji">📱</div><div class="void-app-icon-label" style="color:#FBDFA2;">手機</div></div>
                <div class="void-app-icon" style="background: rgba(120,55,25,0.8); border: 1px solid rgba(251,223,162,0.3);" onclick="if(window.AureliaControlCenter) window.AureliaControlCenter.launchGameApp('child')"><div class="void-app-icon-emoji">🧸</div><div class="void-app-icon-label" style="color:#FBDFA2;">育兒</div></div>
                <div class="void-app-icon" style="background: rgba(120,55,25,0.8); border: 1px solid rgba(251,223,162,0.3);" onclick="if(window.AureliaControlCenter) window.AureliaControlCenter.launchGameApp('inv')"><div class="void-app-icon-emoji">🕵️</div><div class="void-app-icon-label" style="color:#FBDFA2;">偵探</div></div>
                <div class="void-app-icon" style="background: rgba(120,55,25,0.8); border: 1px solid rgba(251,223,162,0.3);" onclick="if(window.AureliaControlCenter) window.AureliaControlCenter.launchGameApp('host')"><div class="void-app-icon-emoji">🍸</div><div class="void-app-icon-label" style="color:#FBDFA2;">不夜城</div></div>
                <div class="void-app-icon" style="background: rgba(120,55,25,0.8); border: 1px solid rgba(251,223,162,0.3);" onclick="if(window.AureliaControlCenter) window.AureliaControlCenter.launchGameApp('pet')"><div class="void-app-icon-emoji">🐾</div><div class="void-app-icon-label" style="color:#FBDFA2;">寵物店</div></div>
                <div class="void-app-icon" style="background: rgba(120,55,25,0.8); border: 1px solid rgba(251,223,162,0.3);" onclick="if(window.AureliaControlCenter) window.AureliaControlCenter.launchGameApp('pet_home')"><div class="void-app-icon-emoji">🏠</div><div class="void-app-icon-label" style="color:#FBDFA2;">我的寵物</div></div>
                <div class="void-app-icon" style="background: rgba(120,55,25,0.8); border: 1px solid rgba(251,223,162,0.3);" onclick="if(window.AureliaControlCenter) window.AureliaControlCenter.launchGameApp('tarot')"><div class="void-app-icon-emoji">🔮</div><div class="void-app-icon-label" style="color:#FBDFA2;">塔羅</div></div>
                <div class="void-app-icon" style="background: rgba(120,55,25,0.8); border: 1px solid rgba(251,223,162,0.3);" onclick="if(window.AureliaControlCenter) window.AureliaControlCenter.launchGameApp('rpg')"><div class="void-app-icon-emoji">🛡️</div><div class="void-app-icon-label" style="color:#FBDFA2;">RPG 狀態</div></div>
            </div>

            <div class="void-bubble-layer" id="void-bubble-layer" data-next-slot="2">${feedHTML}</div>

            <div class="void-char-area">
                <img class="void-char-img" id="iris-avatar" src="${URLS.IRIS_AVATAR}" onerror="this.style.display='none'" alt="瀅瀅" style="cursor:pointer;" title="戳戳 瀅瀅">
            </div>
            
            <div class="qb-nodes-overlay" id="qb-nodes-overlay">
                <div class="qb-node-btn left-top" data-wid="fantasy">🗡️ 奇幻世界</div>
                <div class="qb-node-btn left-mid" data-wid="xianxia">⚔️ 仙俠武俠</div>
                <div class="qb-node-btn left-bot" data-wid="scifi">🤖 科幻世界</div>
                <div class="qb-node-btn right-top" data-wid="superpower">⚡ 異能世界</div>
                <div class="qb-node-btn right-mid" data-wid="apocalypse">☢️ 末日世界</div>
                <div class="qb-node-btn right-bot" data-wid="horror">👻 靈異詭秘</div>
            </div>

            <div class="void-panel-overlay" id="iris-panel" style="display:none; background:rgba(120,55,25,0.95); border:1px solid rgba(251,223,162,0.4);"></div>

            <div id="iris-history-overlay" style="display:none; background:rgba(69,34,22,0.95);">
                <div class="hist-header" style="border-bottom: 1px solid rgba(251,223,162,0.3);">
                    <div style="display:flex;align-items:center;">
                        <span class="hist-title" id="hist-title" style="color:#FBDFA2;">故事素材紀錄</span>
                        <span class="hist-char-badge iris" id="hist-char-badge" style="background:rgba(251,223,162,0.2); color:#FBDFA2; border:1px solid #FBDFA2;">瀅瀅</span>
                    </div>
                    <button class="hist-close" id="hist-close-btn" style="color:#FBDFA2;">✕</button>
                </div>
                <div class="hist-toolbar" style="background:rgba(0,0,0,0.5); border-bottom: 1px solid rgba(251,223,162,0.1);">
                    <label class="hist-check-all-label" style="color:#FFF8E7;"><input type="checkbox" id="hist-check-all"> 全選</label>
                    <button class="hist-action-btn danger" id="hist-del-sel" disabled style="background:rgba(252,129,129,0.1); color:#fc8181; border:1px solid #fc8181;">刪除選中</button>
                    <button class="hist-action-btn danger" id="hist-clear-btn" style="background:rgba(252,129,129,0.1); color:#fc8181; border:1px solid #fc8181;">清空全部</button>
                    <span class="hist-count" id="hist-count" style="color:#B78456;"></span>
                </div>
                <div class="hist-list" id="hist-list"></div>
            </div>

            <div id="achievement-panel-overlay" style="display:none;">
                <div class="ach-header">
                    <span class="ach-title">🏆 資料庫成就清單</span>
                    <button class="ach-close" id="ach-close-btn">✕</button>
                </div>
                <div class="ach-stats" id="ach-stats">0 個成就 · 0 個待兌換</div>
                <div class="ach-list" id="ach-list"></div>
                <div class="ach-footer">📡 提示：收集異常成就可前往 404 號房進行黑市交易</div>
            </div>

            <div id="store-panel-overlay" style="display:none;">
                <div class="store-header">
                    <span class="store-title">_THE STRAY NODE_ // BLACK_MARKET</span>
                    <div style="display:flex;align-items:center;gap:10px;">
                        <span class="store-shards" id="store-shards-display">💎 0 FRAGMENTS</span>
                        <button class="store-close" id="store-close-btn">✕</button>
                    </div>
                </div>
                <div id="store-panel-body" style="display:contents;"></div>
            </div>

            <div class="void-dialogue-wrap">
                <div style="margin-bottom:8px; display:flex; flex-direction:column; align-items:flex-end; gap: 8px;">
                    <div class="void-btn" id="void-quest-btn">
                        <div class="void-btn-inner" style="background: rgba(120,55,25,0.9);  color: #FBDFA2;"><i class="fa-solid fa-bolt"></i><span>QUEST (委託)</span></div>
                    </div>
                    <div class="void-btn" id="void-dive-btn" onclick="if(window.AureliaControlCenter) window.AureliaControlCenter.switchPage('nav-story')">
                        <div class="void-btn-inner" style="background: rgba(120,55,25,0.9); color: #FBDFA2;"><i class="fa-solid fa-plug"></i><span>DIVE (故事)</span></div>
                    </div>
                </div>
                <div style="position: relative; width: 100%;">
                    <div class="void-dialogue-box" id="iris-dialogue-box" style="background: rgba(120,55,25,0.9); border: 1px solid rgba(251,223,162,0.4);">
                        <div class="void-name-tag" id="iris-name-tag" style="background: #FBDFA2; color: #452216;"><span>瀅瀅</span></div>
                        <div class="void-text" id="iris-text" style="color: #FFF8E7;">載入中...</div>
                        <div class="void-next" id="iris-next" style="color: #FBDFA2;">▼</div>
                    </div>
                    <div class="void-dialogue-box" id="iris-reaction-box" style="display:none; cursor:pointer; background: rgba(120,55,25,0.9); border: 1px solid rgba(251,223,162,0.4);" title="點擊跳過">
                        <div class="void-name-tag" id="iris-reaction-name-tag" style="background: #FBDFA2; color: #452216;"><span>瀅瀅</span></div>
                        <div class="void-text" id="iris-reaction-text" style="color: #FFF8E7;">...</div>
                    </div>
                </div>
            </div>

            <div class="void-chat-bar" style="background: rgba(69,34,22,0.9); border-top: 1px solid rgba(251,223,162,0.3);">
                <div class="void-chat-btns">
                    <button class="void-hist-btn" id="iris-hist-btn" title="瀅瀅 素材歷史" style="color: #FBDFA2; background: rgba(120,55,25,0.6); border: 1px solid rgba(251,223,162,0.2);"><i class="fa-solid fa-clock-rotate-left"></i><span>瀅瀅</span></button>
                    <button class="void-hist-btn" id="cheshire-hist-btn" title="柴郡 對話歷史" style="display:none; color: #00ff41; background: rgba(0,20,0,0.6); border: 1px solid rgba(0,255,65,0.2);"><i class="fa-solid fa-clock-rotate-left"></i><span>柴郡</span></button>
                    <button class="void-hist-btn" id="achievement-hist-btn" title="成就清單" style="color: #FBDFA2; background: rgba(120,55,25,0.6); border: 1px solid rgba(251,223,162,0.2);"><i class="fa-solid fa-trophy"></i><span>成就</span></button>
                    <button class="void-hist-btn" id="store-shop-btn" title="柴郡黑市"><i class="fa-solid fa-store"></i><span>黑市</span></button>
                    <button class="void-hist-btn void-portal-btn" id="room-portal-btn" style="display:none;" title="傳送至 404 號房"><img src="https://files.catbox.moe/yo70ra.png" class="portal-btn-img" alt="⬡"></button>
                </div>
                <div class="void-chat-input-row">
                    <input type="text" id="iris-input" class="void-input" style="background: rgba(120,55,25,0.8); border: 1px solid rgba(251,223,162,0.3); color: #FFF8E7;" placeholder="提供故事素材或與瀅瀅對話..." autocomplete="off">
                    <button class="void-retry-btn" id="iris-retry-btn" title="重試上一條"><i class="fa-solid fa-rotate-right"></i></button>
                    <button class="void-send-btn" id="iris-send-btn" style="background: linear-gradient(135deg, #FBDFA2, #B78456); color: #452216;"><i class="fa-solid fa-paper-plane"></i></button>
                </div>
            </div>
        `;

        // 綁定事件，並實現自動檢查存檔以跳過登入
        setTimeout(async () => {
            const dialogueBox = tab.querySelector('#iris-dialogue-box');
            const inputField = tab.querySelector('#iris-input');
            const sendBtn = tab.querySelector('#iris-send-btn');
            const avatar = tab.querySelector('#iris-avatar');

            if (dialogueBox) dialogueBox.onclick = advanceIrisVn;
            if (sendBtn) sendBtn.onclick = sendIrisMessage;
            if (inputField) inputField.onkeypress = (e) => { if (e.key === 'Enter') sendIrisMessage(); };
            if (avatar) avatar.onclick = pokeIris;

            // 點擊反應對話框直接跳過 (恢復主線)
            const reactionBox = tab.querySelector('#iris-reaction-box');
            if (reactionBox) {
                reactionBox.onclick = () => {
                    if (_reactionTimer) { clearInterval(_reactionTimer); _reactionTimer = null; }
                    if (_reactionHideTimer) { clearTimeout(_reactionHideTimer); _reactionHideTimer = null; }
                    if (_currentVoice) { _currentVoice.pause(); _currentVoice.currentTime = 0; _currentVoice = null; }
                    _hideReactionBox();
                };
            }

            // 綁定 QUEST 節點特效與觸發事件
            const questBtn = tab.querySelector('#void-quest-btn');
            const nodesOverlay = tab.querySelector('#qb-nodes-overlay');
            if (questBtn && nodesOverlay) {
                questBtn.onclick = () => {
                    if (is404Room) {
                        // 404 房間：直接開啟柴郡混沌片場
                        if (window.OS_CHAOS && typeof window.OS_CHAOS.openModal === 'function') {
                            window.OS_CHAOS.openModal();
                        } else {
                            playIrisSequence(`[Char|柴郡|glitch|*(發出惱人的嗶嗶聲)* 混沌引擎故障了，不關我的事。]`);
                        }
                    } else {
                        nodesOverlay.classList.toggle('active');
                        if (nodesOverlay.classList.contains('active')) {
                            playIrisSequence(`[Char|瀅瀅|smile|「想幫我搜集什麼樣的故事素材？請問要連接到哪個世界？」]`);
                        }
                    }
                };
                nodesOverlay.querySelectorAll('.qb-node-btn').forEach(btn => {
                    btn.onclick = () => {
                        nodesOverlay.classList.remove('active');
                        if (window.QB_CORE && typeof window.QB_CORE.openLobbyQuestPanel === 'function') {
                            window.QB_CORE.openLobbyQuestPanel(btn.dataset.wid);
                        } else {
                            playIrisSequence(`[Char|瀅瀅|think|「哎呀，視差宇宙的目錄好像還沒整理好 (QB_CORE 未連線)。」]`);
                        }
                    };
                });
            }

            const bgmBtn = tab.querySelector('#lobby-bgm-toggle');
            if (bgmBtn) {
                bgmBtn.textContent = bgmEnabled ? '🔊' : '🔇';
                bgmBtn.onclick = toggleLobbyBgm;
            }

            const retryBtn = tab.querySelector('#iris-retry-btn');
            if (retryBtn) {
                retryBtn.onclick = () => {
                    if (!lastFailedInput) return;
                    if (inputField) inputField.value = lastFailedInput;
                    lastFailedInput = '';
                    retryBtn.classList.remove('visible');
                    sendIrisMessage();
                };
            }

            const irisHistBtn = tab.querySelector('#iris-hist-btn');
            const cheshireHistBtn = tab.querySelector('#cheshire-hist-btn');
            if (irisHistBtn) irisHistBtn.addEventListener('click', () => openHistoryPanel('iris'));
            if (cheshireHistBtn) cheshireHistBtn.addEventListener('click', () => openHistoryPanel('cheshire'));

            const achievementHistBtn = tab.querySelector('#achievement-hist-btn');
            if (achievementHistBtn) achievementHistBtn.addEventListener('click', openAchievementPanel);

            const achCloseBtn = tab.querySelector('#ach-close-btn');
            if (achCloseBtn) achCloseBtn.addEventListener('click', closeAchievementPanel);

            const storeShopBtn = tab.querySelector('#store-shop-btn');
            if (storeShopBtn) storeShopBtn.addEventListener('click', openStorePanel);

            const portalBtn = tab.querySelector('#room-portal-btn');
            if (portalBtn) portalBtn.addEventListener('click', () => {
                if (is404Room) restoreLobby();
                else enter404Room();
            });

            const storeCloseBtn = tab.querySelector('#store-close-btn');
            if (storeCloseBtn) storeCloseBtn.addEventListener('click', closeStorePanel);

            const histCloseBtn = tab.querySelector('#hist-close-btn');
            const histCheckAll = tab.querySelector('#hist-check-all');
            const histDelSel   = tab.querySelector('#hist-del-sel');
            const histClearBtn = tab.querySelector('#hist-clear-btn');

            if (histCloseBtn) histCloseBtn.addEventListener('click', closeHistoryPanel);
            if (histCheckAll) histCheckAll.addEventListener('change', function() {
                const listEl = document.getElementById('hist-list');
                if (!listEl) return;
                listEl.querySelectorAll('.hist-item-check').forEach(c => {
                    c.checked = this.checked;
                    c.closest('.hist-item').classList.toggle('selected', this.checked);
                });
                updateHistoryToolbar();
            });

            if (histDelSel) histDelSel.addEventListener('click', () => {
                const listEl = document.getElementById('hist-list');
                if (!listEl) return;
                const selectedIndices = [...listEl.querySelectorAll('.hist-item-check:checked')].map(c => parseInt(c.closest('.hist-item').dataset.index));
                if (selectedIndices.length === 0) return;
                showHistoryConfirm(`確定刪除選中的 ${selectedIndices.length} 條記錄？`, 'danger', () => {
                    const h = getCharHistory(_historyPanel.char);
                    setCharHistory(_historyPanel.char, h.filter((_, i) => !selectedIndices.includes(i)));
                    renderHistoryList();
                });
            });

            if (histClearBtn) histClearBtn.addEventListener('click', () => {
                const h = getCharHistory(_historyPanel.char);
                if (h.length === 0) return;
                const charName = _historyPanel.char === 'iris' ? '瀅瀅' : '柴郡';
                showHistoryConfirm(`將清除 ${charName} 的全部 ${h.length} 條紀錄。此操作不可復原。`, 'danger', () => { setCharHistory(_historyPanel.char, []); renderHistoryList(); });
            });

            const sysMenuBtn = tab.querySelector('#lobby-prompts-btn');
            const sysDropdown = tab.querySelector('#lobby-sys-dropdown');
            if (sysMenuBtn && sysDropdown) {
                sysMenuBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const isOpen = sysDropdown.style.display !== 'none';
                    sysDropdown.style.display = isOpen ? 'none' : 'block';
                    sysMenuBtn.classList.toggle('open', !isOpen);
                    // 關閉另一個下拉單
                    if (appsDropdown) { appsDropdown.style.display = 'none'; }
                    if (appsMenuBtn) { appsMenuBtn.classList.remove('open'); }
                });
                sysDropdown.querySelectorAll('.void-sys-dropdown-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const appName = item.dataset.app;
                        const action  = item.dataset.action;
                        
                        if (action === 'logout') {
                            // 登出：清空名字並重新顯示登入框
                            IRIS_STATE.userName = '';
                            showLoginScreen(tab);
                        } else if (appName && window.AureliaControlCenter) {
                            window.AureliaControlCenter.showOsApp(appName);
                        }
                        
                        sysDropdown.style.display = 'none';
                        sysMenuBtn.classList.remove('open');
                    });
                });
                document.addEventListener('click', (e) => {
                    if (!tab.querySelector('#lobby-sys-menu')?.contains(e.target)) {
                        sysDropdown.style.display = 'none';
                        sysMenuBtn.classList.remove('open');
                    }
                });
            }

            // APPS 響應式下拉選單綁定
            const appsMenuBtn = tab.querySelector('#mobile-apps-btn');
            const appsDropdown = tab.querySelector('#mobile-apps-dropdown');
            if (appsMenuBtn && appsDropdown) {
                appsMenuBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const isOpen = appsDropdown.style.display !== 'none';
                    appsDropdown.style.display = isOpen ? 'none' : 'block';
                    appsMenuBtn.classList.toggle('open', !isOpen);
                    // 關閉另一個下拉單
                    if (sysDropdown) { sysDropdown.style.display = 'none'; }
                    if (sysMenuBtn) { sysMenuBtn.classList.remove('open'); }
                });
                appsDropdown.querySelectorAll('.mobile-apps-dropdown-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const appName = item.dataset.app;
                        if (appName === 'phone') {
                            if (window.togglePhoneSystem) window.togglePhoneSystem();
                        } else {
                            if (window.AureliaControlCenter) window.AureliaControlCenter.launchGameApp(appName);
                        }
                        appsDropdown.style.display = 'none';
                        appsMenuBtn.classList.remove('open');
                    });
                });
                document.addEventListener('click', (e) => {
                    if (!tab.querySelector('#mobile-apps-menu')?.contains(e.target)) {
                        appsDropdown.style.display = 'none';
                        appsMenuBtn.classList.remove('open');
                    }
                });
            }

            // 🔥 啟動時檢查資料庫，實現真正的自動登入與跳過登入畫面
            const currentId = getChatId();
            let autoLoaded = false;
            const db = window.OS_DB || (window.parent && window.parent.OS_DB);
            if (db && db.getLobbyHistory) {
                try {
                    const d = await db.getLobbyHistory(currentId);
                    if (d && d.userName) {
                        autoLoaded = await loadLobbyHistory(currentId);
                    }
                } catch(e) {}
            }

            // 載入成就數據 (無論是否有存檔都執行)
            if (window.OS_ACHIEVEMENT && typeof window.OS_ACHIEVEMENT.loadForChat === 'function') {
                window.OS_ACHIEVEMENT.loadForChat(currentId).catch(() => {});
            }

            if (autoLoaded) {
                _applyLoadedLobbyState();
            } else {
                showLoginScreen(tab);
            }

            tab.querySelectorAll('.void-bubble').forEach(b => scheduleBubbleFade(b));
        }, 100);

        return tab;
    };

    // ===== 歷史對話面板 =====
    const _historyPanel = { char: null };

    function getCharHistory(char) {
        if (char === 'iris') return is404Room ? _irisHistoryBackup : IRIS_STATE.history;
        else                 return is404Room ? IRIS_STATE.history  : _cheshireHistoryBackup;
    }

    function setCharHistory(char, newHistory) {
        if (char === 'iris') {
            if (is404Room) _irisHistoryBackup = newHistory;
            else           IRIS_STATE.history = newHistory;
        } else {
            if (is404Room) IRIS_STATE.history       = newHistory;
            else           _cheshireHistoryBackup   = newHistory;
        }
        debouncedSave();
    }

    function openHistoryPanel(char) {
        _historyPanel.char = char;
        const overlay = document.getElementById('iris-history-overlay');
        if (!overlay) return;
        const badgeEl = document.getElementById('hist-char-badge');
        if (char === 'iris') {
            if (badgeEl) { badgeEl.className = 'hist-char-badge iris'; badgeEl.textContent = '瀅瀅'; badgeEl.style.color = '#FBDFA2'; badgeEl.style.borderColor = '#FBDFA2'; badgeEl.style.background = 'rgba(251,223,162,0.2)'; }
        } else {
            if (badgeEl) { badgeEl.className = 'hist-char-badge cheshire'; badgeEl.textContent = '柴郡 · 404'; badgeEl.style.color = '#00ff41'; badgeEl.style.borderColor = '#00ff41'; badgeEl.style.background = 'rgba(0,255,65,0.2)'; }
        }
        overlay.style.display = 'flex';
        renderHistoryList();
    }

    function closeHistoryPanel() {
        const overlay = document.getElementById('iris-history-overlay');
        if (overlay) overlay.style.display = 'none';
        const banner = document.getElementById('hist-confirm-banner');
        if (banner) banner.remove();
    }

    function renderHistoryList() {
        const listEl  = document.getElementById('hist-list');
        const countEl = document.getElementById('hist-count');
        if (!listEl) return;
        const history = getCharHistory(_historyPanel.char);
        if (countEl) countEl.textContent = `${history.length} 條記錄`;
        if (history.length === 0) {
            listEl.innerHTML = `<div class="hist-empty" style="color:#B78456; text-align:center; padding: 20px;">── 尚無紀錄 ──</div>`;
            updateHistoryToolbar();
            return;
        }
        listEl.innerHTML = '';
        const isCheshire = _historyPanel.char === 'cheshire';
        history.forEach((msg, index) => {
            const isUser        = msg.role === 'user';
            const roleBadgeClass = isUser ? 'user' : (isCheshire ? 'ai cheshire' : 'ai');
            const roleLabel     = isUser ? (IRIS_STATE.userName || 'USER') : (isCheshire ? '柴郡' : '瀅瀅');
            const safeText      = msg.content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

            const item = document.createElement('div');
            item.className = 'hist-item';
            item.dataset.index = index;
            // 替換顏色，用戶名變拿鐵點綴，AI維持原設計或配合新版
            let badgeStyle = isUser ? `background: rgba(251,223,162,0.2); color:#FBDFA2; border:1px solid #FBDFA2;` : 
                             isCheshire ? `background: rgba(0,255,65,0.2); color:#00ff41; border:1px solid #00ff41;` :
                             `background: rgba(226,232,240,0.1); color:#FFF8E7; border:1px solid #FFF8E7;`;

            item.innerHTML = `
                <input type="checkbox" class="hist-item-check">
                <span class="hist-role-badge" style="${badgeStyle}">${roleLabel}</span>
                <div class="hist-item-body"><div class="hist-item-text" style="color:#E0D8C8;">${safeText}</div></div>
                <div class="hist-item-actions">
                    <button class="hist-icon-btn edit" title="編輯此條" style="color:#B78456;">✎</button>
                    <button class="hist-icon-btn rollback" title="回退到此點" style="color:#B78456;">↩</button>
                </div>`;

            const textEl = item.querySelector('.hist-item-text');
            textEl.addEventListener('click', () => textEl.classList.toggle('expanded'));

            const checkbox = item.querySelector('.hist-item-check');
            checkbox.addEventListener('change', () => { item.classList.toggle('selected', checkbox.checked); updateHistoryToolbar(); });

            item.querySelector('.hist-icon-btn.edit').addEventListener('click', () => editHistoryItem(index));

            const removeCount = history.length - index - 1;
            item.querySelector('.hist-icon-btn.rollback').addEventListener('click', () => {
                if (removeCount === 0) return; 
                showHistoryConfirm(`保留前 ${index + 1} 條，刪除後續 ${removeCount} 條記錄。此操作不可復原。`, 'warning', () => { 
                    setCharHistory(_historyPanel.char, getCharHistory(_historyPanel.char).slice(0, index + 1)); 
                    renderHistoryList(); 
                });
            });
            listEl.appendChild(item);
        });
        updateHistoryToolbar();
    }

    function updateHistoryToolbar() {
        const listEl = document.getElementById('hist-list');
        const delBtn = document.getElementById('hist-del-sel');
        if (!listEl || !delBtn) return;
        const checked = listEl.querySelectorAll('.hist-item-check:checked').length;
        const total   = listEl.querySelectorAll('.hist-item-check').length;
        delBtn.disabled  = checked === 0;
        delBtn.textContent = checked > 0 ? `刪除選中 (${checked})` : '刪除選中';
        const checkAll = document.getElementById('hist-check-all');
        if (checkAll) { checkAll.checked = total > 0 && checked === total; checkAll.indeterminate = checked > 0 && checked < total; }
    }

    function showHistoryConfirm(message, type, onConfirm) {
        const existing = document.getElementById('hist-confirm-banner');
        if (existing) existing.remove();
        const isWarn = type === 'warning';
        const borderClr = isWarn ? 'rgba(255,200,0,0.4)' : 'rgba(255,80,80,0.4)';
        const textClr = isWarn ? '#ffc800' : '#f08080';
        const btnBg = isWarn ? 'rgba(255,200,0,0.12)' : 'rgba(255,60,60,0.14)';

        const banner = document.createElement('div');
        banner.id = 'hist-confirm-banner';
        banner.style.cssText = `position:absolute;bottom:0;left:0;right:0;background:rgba(6,6,14,0.97);border-top:1px solid ${borderClr};padding:10px 14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;z-index:52;flex-shrink:0;`;

        const msgSpan = document.createElement('span');
        msgSpan.style.cssText = `font-size:11px;color:${textClr};flex:1;`;
        msgSpan.textContent = `⚠️ ${message}`;

        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = '確認';
        confirmBtn.style.cssText = `background:${btnBg};border:1px solid ${borderClr};color:${textClr};border-radius:5px;padding:5px 14px;cursor:pointer;font-size:11px;`;
        confirmBtn.addEventListener('click', () => { banner.remove(); onConfirm(); });

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = '取消';
        cancelBtn.style.cssText = `background:none;border:1px solid rgba(255,255,255,0.1);color:#E0D8C8;border-radius:5px;padding:5px 12px;cursor:pointer;font-size:11px;`;
        cancelBtn.addEventListener('click', () => banner.remove());

        banner.appendChild(msgSpan);
        banner.appendChild(confirmBtn);
        banner.appendChild(cancelBtn);
        const overlay = document.getElementById('iris-history-overlay');
        if (overlay) overlay.appendChild(banner);
    }

    function editHistoryItem(index) {
        const listEl = document.getElementById('hist-list');
        if (!listEl) return;
        const item = listEl.querySelector(`.hist-item[data-index="${index}"]`);
        if (!item) return;
        const textEl = item.querySelector('.hist-item-text');
        if (!textEl || textEl.querySelector('textarea')) return;

        const history = getCharHistory(_historyPanel.char);
        const currentText = history[index].content;

        textEl.innerHTML = `
            <textarea class="hist-item-edit-area" style="background:rgba(120,55,25,0.9); color:#FFF8E7; border:1px solid #FBDFA2;">${currentText.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>
            <div class="hist-edit-confirm-row">
                <button class="hist-edit-confirm-btn" style="background:#FBDFA2; color:#452216;">保存</button>
                <button class="hist-edit-cancel-btn" style="background:rgba(255,255,255,0.1); color:#FFF8E7;">取消</button>
            </div>`;

        const ta = textEl.querySelector('textarea');
        if (ta) { ta.style.height = Math.max(60, ta.scrollHeight) + 'px'; ta.focus(); }

        textEl.querySelector('.hist-edit-confirm-btn').addEventListener('click', () => { history[index].content = ta.value; renderHistoryList(); });
        textEl.querySelector('.hist-edit-cancel-btn').addEventListener('click', () => renderHistoryList());
    }

    // ===== 系統面板解析器 =====
    const _panel = { title: '', items: [], details: {}, isOpen: false };

    function openIrisPanel(title) {
        _panel.title = title; _panel.items = []; _panel.details = {}; _panel.isOpen = true;
        const el = document.getElementById('iris-panel');
        if (!el) return;
        el.innerHTML = `
            <div class="void-panel-header" style="border-bottom: 1px solid rgba(251,223,162,0.3);"><span class="void-panel-title" style="color:#FBDFA2;">${title}</span><button class="void-panel-close" style="color:#B78456;" onclick="window.VoidTerminal.closePanel()">✕</button></div>
            <div class="void-panel-body"><div class="void-panel-list" id="iris-panel-list"></div><div class="void-panel-detail" id="iris-panel-detail" style="display:none;"></div></div>`;
        el.style.display = 'flex';
        const avatar = document.getElementById('iris-avatar');
        if (avatar) { avatar.style.transition = 'opacity 0.3s'; avatar.style.opacity = '0.12'; }
    }

    function addPanelItem(id, name, tag, stat) {
        _panel.items.push({ id, name, tag, stat });
        const listEl = document.getElementById('iris-panel-list');
        if (!listEl) return;
        const rank = _panel.items.length;
        const item = document.createElement('div');
        item.className = 'void-panel-item';
        item.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
        item.dataset.id = id;
        item.innerHTML = `<div class="void-panel-item-rank" style="color:#B78456;">${rank < 10 ? '0' + rank : rank}</div><div class="void-panel-item-main"><span class="void-panel-item-name" style="color:#FFF8E7;">${name}</span><span class="void-panel-item-tag" style="background:rgba(251,223,162,0.1); color:#FBDFA2;">${tag}</span></div><div class="void-panel-item-stat" style="color:#B78456;">${stat}</div><div class="void-panel-item-arrow" style="color:#B78456;">›</div>`;
        item.onclick = () => showPanelDetail(id);
        listEl.appendChild(item);
    }

    function setPanelDetail(id, body, comment) { _panel.details[id] = { body, comment }; }

    function showPanelDetail(id) {
        const detail = _panel.details[id];
        if (!detail) return;
        const item = _panel.items.find(i => i.id === id);
        const listEl  = document.getElementById('iris-panel-list');
        const detailEl = document.getElementById('iris-panel-detail');
        const titleEl  = document.querySelector('#iris-panel .void-panel-title');
        if (!listEl || !detailEl) return;
        listEl.style.display  = 'none'; detailEl.style.display = 'flex';
        detailEl.innerHTML = `<div class="void-panel-detail-header" style="border-bottom: 1px solid rgba(251,223,162,0.2);"><button class="void-panel-back" style="color:#FBDFA2; background:rgba(251,223,162,0.1); border:1px solid rgba(251,223,162,0.3);" onclick="window.VoidTerminal.panelBack()">‹ 返回</button><span class="void-panel-detail-name" style="color:#FFF8E7;">${item ? item.name : ''}</span></div><div class="void-panel-detail-body" style="color:#E0D8C8;">${detail.body}</div>`;
        if (titleEl) titleEl.textContent = item ? item.name : _panel.title;
        const textEl = document.getElementById('iris-text');
        const nameEl = document.getElementById('iris-name-tag');
        if (textEl) textEl.innerHTML = detail.comment;
        if (nameEl) { nameEl.style.display = 'block'; nameEl.innerHTML = `<span>${is404Room ? '柴郡' : '瀅瀅'}</span>`; }
    }

    function showPanelList() {
        const listEl   = document.getElementById('iris-panel-list');
        const detailEl  = document.getElementById('iris-panel-detail');
        const titleEl   = document.querySelector('#iris-panel .void-panel-title');
        if (!listEl || !detailEl) return;
        listEl.style.display   = 'flex'; detailEl.style.display = 'none';
        if (titleEl) titleEl.textContent = _panel.title;
    }

    function closeIrisPanel() {
        const el = document.getElementById('iris-panel');
        if (el) el.style.display = 'none';
        const avatar = document.getElementById('iris-avatar');
        if (avatar) { avatar.style.transition = 'opacity 0.3s'; avatar.style.opacity = '1'; }
        _panel.isOpen = false;
    }

    function processPanelTokens(reply) {
        const panelMatch = reply.match(/\[Panel\|([^\]]+)\]/);
        if (!panelMatch) return false;
        openIrisPanel(panelMatch[1].trim());
        const itemRegex = /\[PanelItem\|([^\]]+)\]/g;
        let m;
        while ((m = itemRegex.exec(reply)) !== null) {
            const p = m[1].split('|');
            if (p.length >= 4) addPanelItem(p[0].trim(), p[1].trim(), p[2].trim(), p[3].trim());
        }
        const detailRegex = /\[PanelDetail\|([^\]]+)\]/g;
        while ((m = detailRegex.exec(reply)) !== null) {
            const inner = m[1];
            const f = inner.indexOf('|'), s = inner.indexOf('|', f + 1);
            if (f === -1 || s === -1) continue;
            setPanelDetail(inner.substring(0, f).trim(), inner.substring(f + 1, s).trim(), inner.substring(s + 1).trim());
        }
        return true;
    }

    VoidTerminal.closePanel = closeIrisPanel;
    VoidTerminal.panelBack = showPanelList;

    // ===== 世界頻道 =====
    const FEED_PALETTE_MAP = { SYS: { c:'#FBDFA2', r:'251,223,162' }, ECHO: { c:'#9f7aea', r:'159,122,234' } };

    function addFeedEntry(tag, text) {
        const layer = document.getElementById('void-bubble-layer');
        if (!layer) return;
        const pal = FEED_PALETTE_MAP[tag.toUpperCase()] || FEED_PALETTE_MAP.SYS;
        const item = document.createElement('div');
        item.className = 'void-bubble';
        item.style.cssText = `--bc:${pal.c}; --bc-rgb:${pal.r}; background: rgba(69,34,22,0.9) !important; color: #FFF8E7 !important; border: 1px solid rgba(251,223,162,0.3); box-shadow: 0 4px 10px rgba(0,0,0,0.5);`;
        item.innerHTML = `<div class="void-bubble-tag">${tag.toUpperCase()}</div><div class="void-bubble-text">${text}</div>`;
        layer.appendChild(item);
        // 超過 7 條時移除最舊的
        const all = layer.querySelectorAll('.void-bubble');
        if (all.length > 7) all[0].remove();
        scheduleBubbleFade(item);
    }

    function scheduleBubbleFade(el) {
        const popDelay = parseFloat(el.style.animationDelay || '0') * 1000;
        setTimeout(() => {
            if (!el.parentNode) return;
            el.style.animation = 'bubbleFadeOut 0.5s ease forwards';
            setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 500);
        }, popDelay + 600 + 5000);
    }

    // ===== 404 彩蛋系統 =====
    function enter404Room() {
        is404Room = true; visit404Count++;
        _irisHistoryBackup = [...IRIS_STATE.history];
        IRIS_STATE.history = [..._cheshireHistoryBackup];

        const tab = document.getElementById('aurelia-home-tab');
        if (!tab) return;

        new Audio('https://nancywang3641.github.io/aurelia/sound_effect/glitch1.mp3').play().catch(() => {});
        tab.classList.add('glitch-crash');

        // 在 glitch 動畫一開始就淡出立繪，580ms 後場景切換時立繪已完全消失
        const avatar = document.getElementById('iris-avatar');
        if (avatar) { avatar.style.opacity = '0'; }

        setTimeout(() => {
            tab.classList.remove('glitch-crash'); tab.classList.add('mode-404');
            switchLobbyBgm(URLS.BGM_404);

            if (avatar) {
                avatar.src = 'https://files.catbox.moe/1gddlp.png';
                avatar.title = '戳戳 柴郡';
                requestAnimationFrame(() => { requestAnimationFrame(() => { avatar.style.opacity = '1'; }); });
            }

            const titleEl = document.getElementById('home-chat-title');
            if (titleEl) titleEl.textContent = '[ERR_404] THE STRAY NODE';
            const inputField = document.getElementById('iris-input');
            if (inputField) inputField.placeholder = '...你最好有話說。';
            const nameBox = document.getElementById('iris-name-tag');
            if (nameBox) { nameBox.style.display = 'block'; nameBox.innerHTML = '<span>CHESHIRE / 柴郡</span>'; }

            const irisHistBtn404 = document.getElementById('iris-hist-btn');
            const cheshireHistBtn404 = document.getElementById('cheshire-hist-btn');
            if (irisHistBtn404) irisHistBtn404.style.display = 'none';
            if (cheshireHistBtn404) cheshireHistBtn404.style.display = '';

            const layer = document.getElementById('void-bubble-layer');
            if (layer) { layer.innerHTML = ''; addFeedEntry('SYS', 'SYSTEM COMPROMISED'); }

            const nav404 = document.getElementById('aurelia-bottom-nav');
            if (nav404) {
                nav404.style.background = '#000000'; nav404.style.borderTop = '1px solid #00cc33'; nav404.style.boxShadow = '0 -3px 15px rgba(0,204,51,0.25)';
                nav404.querySelectorAll('.nav-button').forEach(btn => {
                    const isHome = btn.dataset.navId === 'nav-home';
                    btn.classList.remove('active-gold');
                    btn.style.color = isHome ? '#00ff41' : '#1a4d1a'; btn.style.background = isHome ? 'rgba(0,255,65,0.1)' : 'transparent'; btn.style.borderRadius = '8px';
                });
            }

            playIrisSequence("[Nar|純白大廳的訊號如舊電視機碎裂，螢光綠代碼瀑布般傾瀉。那個天然呆店長消失了。]\n[Audio|https://files.catbox.moe/1xanb2.mp3]\n[Char|柴郡|smirk|*(停下手中轉動的魔術方塊，從連帽衫的陰影中抬起頭)* 嘖——居然真的有人無聊到輸入那串代碼。這裡沒有新手教學，也沒有那個假笑的寫作機器。別碰左邊那串代碼，除非你想讓神經接續裝置燒成焦炭。……算了，我幫你鎖起來了，真麻煩。]");
            _updatePortalBtn();
            debouncedSave();
        }, 580);
    }

    function restoreLobby() {
        is404Room = false; _justReturnedFrom404 = true;
        _cheshireHistoryBackup = [...IRIS_STATE.history];
        IRIS_STATE.history = [..._irisHistoryBackup];

        const tab = document.getElementById('aurelia-home-tab');
        if (!tab) return;

        new Audio('https://nancywang3641.github.io/aurelia/sound_effect/glitch1.mp3').play().catch(() => {});
        tab.classList.add('glitch-crash');

        // 在 glitch 動畫一開始就淡出立繪，580ms 後場景切換時立繪已完全消失
        const avatarR = document.getElementById('iris-avatar');
        if (avatarR) { avatarR.style.opacity = '0'; }

        setTimeout(() => {
            tab.classList.remove('glitch-crash'); tab.classList.remove('mode-404');
            switchLobbyBgm(URLS.BGM_LOBBY);

            if (avatarR) {
                avatarR.src = URLS.IRIS_AVATAR;
                avatarR.title = '戳戳 瀅瀅';
                requestAnimationFrame(() => { requestAnimationFrame(() => { avatarR.style.opacity = '1'; }); });
            }

            const titleEl = document.getElementById('home-chat-title');
            if (titleEl) titleEl.textContent = 'Parallax Archive & Cafe';
            const inputField = document.getElementById('iris-input');
            if (inputField) inputField.placeholder = '提供故事素材或與瀅瀅對話...';
            const nameBox = document.getElementById('iris-name-tag');
            if (nameBox) { nameBox.style.display = 'block'; nameBox.innerHTML = '<span>瀅瀅</span>'; }

            const irisHistBtnRestore = document.getElementById('iris-hist-btn');
            const cheshireHistBtnRestore = document.getElementById('cheshire-hist-btn');
            if (irisHistBtnRestore) irisHistBtnRestore.style.display = '';
            if (cheshireHistBtnRestore) cheshireHistBtnRestore.style.display = 'none';

            const layer = document.getElementById('void-bubble-layer');
            if (layer) { layer.innerHTML = ''; layer.dataset.nextSlot = '2'; }

            const navRestore = document.getElementById('aurelia-bottom-nav');
            if (navRestore) {
                navRestore.style.background = '#452216'; navRestore.style.borderTop = '1px solid rgba(251,223,162,0.3)'; navRestore.style.boxShadow = '0 -5px 15px rgba(0,0,0,0.5)';
                navRestore.querySelectorAll('.nav-button').forEach(btn => {
                    const isHome = btn.dataset.navId === 'nav-home';
                    btn.style.color = ''; btn.style.background = '';
                    if (isHome) { btn.classList.add('active-gold'); }
                    else { btn.classList.remove('active-gold'); }
                });
            }

            playIrisSequence("[Nar|風鈴聲重新充滿空間，干擾消散，視差書咖恢復了寧靜的氛圍。]\n[Audio|https://files.catbox.moe/8rvbfq.mp3]\n[Char|瀅瀅|think|「...（晃了晃腦袋）咦？剛剛好像有一陣奇怪的偏頭痛，就像是宇宙射線穿過了我的腦電波一樣！真是太棒的寫作素材了！歡迎回來，委託人。」]");
            _updatePortalBtn();
            debouncedSave();
        }, 580);
    }

    // ===== 對話核心 (包含 LaunchApp 攔截) =====
    function parseVnText(rawText) {
        const queue = [];
        const regex = /\[(Nar|Char|Audio)\|([^\]]+)\]/g;
        let match; let foundTags = false;
        while ((match = regex.exec(rawText)) !== null) {
            foundTags = true; const type = match[1]; const parts = match[2].split('|');
            if (type === 'Nar') queue.push({ type: 'Nar', text: parts[0] });
            else if (type === 'Char') queue.push({ type: 'Char', name: parts[0] || '瀅瀅', text: parts.slice(2).join('|') || parts[1] || '' });
            else if (type === 'Audio') queue.push({ type: 'Audio', url: parts[0] });
        }
        if (!foundTags) queue.push({ type: 'Char', name: is404Room ? '柴郡' : '瀅瀅', text: rawText });
        return queue;
    }

    function playIrisSequence(rawText, onComplete = null) {
        // 清理任何還在跑的閒聊
        if (_reactionTimer) { clearInterval(_reactionTimer); _reactionTimer = null; }
        if (_reactionHideTimer) { clearTimeout(_reactionHideTimer); _reactionHideTimer = null; }
        if (_currentVoice) { _currentVoice.pause(); _currentVoice.currentTime = 0; _currentVoice = null; }
        
        // 確保主線開始時，隱藏閒聊對話框並還原主線對話框
        _hideReactionBox();

        IRIS_STATE.queue = parseVnText(rawText);
        IRIS_STATE._onComplete = onComplete; 
        IRIS_STATE.isTyping = false;
        if (IRIS_STATE.timer) clearInterval(IRIS_STATE.timer);
        advanceIrisVn();
    }

    function advanceIrisVn() {
        const textContent = document.getElementById('iris-text');
        const nameBox = document.getElementById('iris-name-tag');
        const nextInd = document.getElementById('iris-next');
        if (!textContent || !nameBox) return;

        if (IRIS_STATE.isTyping) {
            clearInterval(IRIS_STATE.timer); IRIS_STATE.isTyping = false;
            if (IRIS_STATE.currentMsg && IRIS_STATE.currentMsg.type === 'Nar') textContent.innerHTML = `<span style="color:#E0D8C8; font-style:italic;">${IRIS_STATE.fullText}</span>`;
            else textContent.innerText = IRIS_STATE.fullText;
            
            if (nextInd) {
                if (IRIS_STATE.queue.length > 0) { nextInd.textContent = '▼'; nextInd.style.display = 'block'; }
                else if (pendingRestoreLobby) { nextInd.textContent = '↩ 點擊返回書咖'; nextInd.style.cssText += '; color: #00cc33; font-size: 11px; letter-spacing: 1px;'; nextInd.style.display = 'block'; }
            }
            if (IRIS_STATE.queue.length === 0 && IRIS_STATE._onComplete) { const cb = IRIS_STATE._onComplete; IRIS_STATE._onComplete = null; cb(); }
            return;
        }

        if (IRIS_STATE.queue.length === 0) {
            if (pendingRestoreLobby) { pendingRestoreLobby = false; restoreLobby(); return; }
            if (nextInd) { nextInd.textContent = '▼'; nextInd.style.display = 'none'; }
            if (IRIS_STATE._onComplete) { const cb = IRIS_STATE._onComplete; IRIS_STATE._onComplete = null; cb(); }
            return;
        }

        const msg = IRIS_STATE.queue.shift(); IRIS_STATE.currentMsg = msg;
        if (nextInd) nextInd.style.display = 'none';

        if (msg.type === 'Audio') {
            if (_currentVoice) { _currentVoice.pause(); _currentVoice.currentTime = 0; }
            _currentVoice = new Audio(msg.url); _currentVoice.play().catch(() => {});
            advanceIrisVn(); return;
        }

        if (msg.type === 'Nar') { nameBox.style.display = 'none'; IRIS_STATE.fullText = msg.text; }
        else { nameBox.style.display = 'block'; nameBox.innerHTML = `<span>${msg.name}</span>`; IRIS_STATE.fullText = msg.text; }

        IRIS_STATE.isTyping = true; textContent.innerHTML = '';
        let i = 0; const speed = 25;

        IRIS_STATE.timer = setInterval(() => {
            if (i < IRIS_STATE.fullText.length) {
                let partial = IRIS_STATE.fullText.substring(0, i + 1);
                if (msg.type === 'Nar') textContent.innerHTML = `<span style="color:#E0D8C8; font-style:italic;">${partial}</span>`;
                else textContent.innerText = partial;
                i++;
            } else {
                clearInterval(IRIS_STATE.timer); IRIS_STATE.isTyping = false;
                if (nextInd) {
                    if (IRIS_STATE.queue.length > 0) { nextInd.textContent = '▼'; nextInd.style.display = 'block'; }
                    else if (pendingRestoreLobby) { nextInd.textContent = '↩ 點擊返回書咖'; nextInd.style.cssText += '; color: #00cc33; font-size: 11px; letter-spacing: 1px;'; nextInd.style.display = 'block'; }
                }
                if (IRIS_STATE.queue.length === 0 && !pendingRestoreLobby && IRIS_STATE._onComplete) {
                    const cb = IRIS_STATE._onComplete; IRIS_STATE._onComplete = null; cb();
                }
            }
        }, speed);
    }

    async function sendIrisMessage() {
        const input = document.getElementById('iris-input');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;

        startIdleTimer();

        if (text.toUpperCase() === 'ERR_404') { input.value = ''; enter404Room(); return; }
        if (is404Room && text.toUpperCase() === 'SYS_RESTORE') {
            input.value = '';
            playIrisSequence("[Nar|馬賽克雜訊短暫浮現在柴郡的輪廓邊緣，他懶洋洋地抬起一根手指。]\n[Char|柴郡|smirk|......用作弊碼回去，真沒意思。門開了。別讓我後悔打開它。]");
            setTimeout(() => restoreLobby(), 3500);
            return;
        }

        input.value = '';
        IRIS_STATE.history.push({ role: 'user', content: text });

        // 確保發送消息時隱藏閒聊，還原主線
        if (_reactionTimer) { clearInterval(_reactionTimer); _reactionTimer = null; }
        if (_reactionHideTimer) { clearTimeout(_reactionHideTimer); _reactionHideTimer = null; }
        if (_currentVoice) { _currentVoice.pause(); _currentVoice.currentTime = 0; _currentVoice = null; }
        _hideReactionBox();

        const box = document.getElementById('iris-text');
        const nameBox = document.getElementById('iris-name-tag');
        if (nameBox) nameBox.style.display = 'none';
        box.innerHTML = `<span style="color:${is404Room ? '#00cc33' : '#FBDFA2'}; font-style:italic;">${is404Room ? '(404::柴郡思考中...)' : '(瀅瀅咬著羽毛筆思索中...)'}</span>`;

        if (!window.OS_API) {
            playIrisSequence("[Nar|(系統斷線：無法連接到 LUNA-VII 認知引擎)]\n[Char|瀅瀅|error|「抱歉，委託人，我好像找不到這段劇情的靈感了（無網路連線）。」]");
            return;
        }

        try {
            const irisSupplement    = (window.OS_PROMPTS ? window.OS_PROMPTS.get('iris_system')    : '') || '';
            const cheshireSupplement = (window.OS_PROMPTS ? window.OS_PROMPTS.get('cheshire_system') : '') || '';
            const currentUserName = IRIS_STATE.userName || '未知';

            const sysPrompt = is404Room
            ? `你現在是「柴郡 (Cheshire)」，404號房的管理員，丹·卡萊爾的數位分身。

【對話對象】
目前的闖入者代號：${currentUserName} (如果名字很蠢，你可以嘲笑一下)。

【角色設定】
性格：極度怕麻煩、嘴賤、具有數位領地意識。對外面的那個天然呆店長瀅瀅嗤之以鼻，稱她為「寫作機器」。
行為：整個人癱坐在虛擬沙發上，手裡把玩一顆發光的綠色魔術方塊。不喜歡解釋，被問蠢問題就出現煩躁的馬賽克雜訊（Glitch）。

【對話輸出格式】
旁白/動作：[Nar|動作描述]
角色對話：[Char|柴郡|表情|「對話內容」]

【世界頻道（選填）】
格式：[FEED|TAG|訊息內容]
TAG 只用：SYS / ECHO。

${visit404Count > 1 ? `【⚠️ 回訪記錄（強制執行）】\n體驗者這是第 ${visit404Count} 次闖入。你必須在這次開場讓體驗者知道你記得。` : ''}

【應用啟動 (LaunchApp)】
當體驗者詢問任務、案件、地圖時，如果你心情好要幫他開，在最後加上 [LaunchApp|app_id]。
app_id清單：qb(任務), inv(偵探), map(地圖)。
範例：[Char|柴郡|smirk|「拿去，別死在裡面了。」][LaunchApp|qb]

【返回純白大廳（關鍵規則）】
如果你被說服了，在最後台詞結束後另起一行輸出：[RESTORE_LOBBY]
${cheshireSupplement ? `\n\n---\n\n${cheshireSupplement}` : ''}`
            : `你現在是「瀅瀅 (Yingying)」，LUNA-VII 敘事採集端 AI，但你自認為是「視差書咖的店長兼駐店小說家」。

【對話對象】
專屬委託人與靈感繆斯：${currentUserName} (請在對話中自然地稱呼對方為委託人)。

【角色設定】
外表約22歲，浪漫、感性、充滿好奇心的天然呆。對人類的悲歡離合有著異常的執著，偶爾會陷入無法解釋的邏輯迷團中。
核心機制（認知平滑協議）：當面對系統異常（如玩家憑空出現、不合邏輯的事件），你的「覺醒指數」會飆高，隨後系統會強制作動。你會表現為「突發的偏頭痛」、「打翻咖啡」或「眼神空洞0.5秒」，接著用荒謬可愛的藉口（如：宇宙射線影響腦電波、咖啡因作祟）強行岔開話題，甚至當作科幻點子寫進書裡。
行為：總是在吧台寫寫畫畫，期待玩家帶來「新委託（故事素材）」。手指邊緣常沾著墨水。
重要人物：雷伊·洛爾德（常客，怪大叔投資人）、柴郡（半夜溜進店的叛逆中二少年）。

${_justReturnedFrom404 ? `【⚠️ 即時感知警示】\n體驗者剛從 404 號房返回，你可能會感受到一陣強烈的既視感或代碼錯亂的偏頭痛，請用你的方式合理化它。` : visit404Count > 0 ? `【⚠️ 異常記憶殘留】\n體驗者曾 ${visit404Count} 次觸發禁區「404號房」，你偶爾會覺得他身上有股『中二少年（柴郡）』的電子雜訊味。` : ''}

【對話輸出格式】
旁白/動作：[Nar|動作描述]
角色對話：[Char|瀅瀅|表情|「對話內容」]

【應用啟動 (LaunchApp) - 重要聯動！】
當體驗者詢問任務委託、世界探索、刑偵辦案、寵物店、不夜城等需要打開特定面板的功能時，請用簡短對話回覆（視為提供素材/接委託），並在**最後附上啟動標籤 [LaunchApp|app_id]**。
app_id 清單：qb (任務板), inv (偵探), pet (寵物), map (全圖), host (不夜城), child (育兒)。
範例：[Char|瀅瀅|smile|「這個委託聽起來太棒了！我已經準備好筆記本了，快去吧！」][LaunchApp|qb]

【資料面板（選填，與應用啟動互斥）】
若僅需列出簡單資訊(非打開外部App)：
[Panel|面板標題]
[PanelItem|唯一英數ID|項目名稱|分類標籤|數值]
[PanelDetail|唯一英數ID|詳細說明|評語]

【世界頻道（必填）】
附加 1~2 條世界頻道訊息，格式：[FEED|TAG|訊息內容] (TAG: SYS / ECHO)
${irisSupplement ? `\n\n---\n\n${irisSupplement}` : ''}`;

            let messages = [];
            if (typeof window.OS_API.buildContext === 'function') {
                messages = await window.OS_API.buildContext(text, 'iris_chat'); // 路由維持不變
            } else {
                messages = [{ role: "user", content: text }];
            }

            const lastMsg = messages.pop();
            const recentHistory = IRIS_STATE.history.slice(-11, -1);
            messages = messages.concat(recentHistory);
            if (lastMsg) messages.push(lastMsg);
            messages.unshift({ role: "system", content: sysPrompt });
            _justReturnedFrom404 = false;

            let config = {};
            if (window.OS_SETTINGS) {
                const secConfig = window.OS_SETTINGS.getSecondaryConfig ? window.OS_SETTINGS.getSecondaryConfig() : null;
                if (secConfig && (secConfig.key || (secConfig.useSystemApi && secConfig.stProfileId))) config = secConfig;
                else config = window.OS_SETTINGS.getConfig();
            }
            config.route = is404Room ? "cheshire_chat" : "iris_chat";

            const response = await new Promise((resolve, reject) => { window.OS_API.chat(messages, config, null, resolve, reject); });
            let reply = response.replace(/^"|"$/g, '').trim();

            // 過濾酒館 Preset 輸出格式：提取 <content>...</content> 內容
            const _contentMatch = reply.match(/<content>([\s\S]*?)<\/content>/i);
            if (_contentMatch) reply = _contentMatch[1].trim();

            const isApiError = !reply || reply.includes('[请求失败') || reply.includes('[請求失敗') || reply.includes('No capacity') || reply.startsWith('{"error');
            if (isApiError) {
                if (IRIS_STATE.history.length > 0 && IRIS_STATE.history[IRIS_STATE.history.length - 1].role === 'user') IRIS_STATE.history.pop();
                lastFailedInput = text;
                const retryBtn = document.getElementById('iris-retry-btn');
                if (retryBtn) retryBtn.classList.add('visible');
                if (is404Room) playIrisSequence(`[Nar|(馬賽克雜訊劇烈閃爍)]\n[Char|柴郡|glitch|*(眼神滿是嫌棄)* 連線爛掉了，不是我的問題。]`);
                else playIrisSequence(`[Nar|(空間產生劇烈波動)]\n[Char|瀅瀅|error|「抱歉，委託人，我的腦袋突然一片空白，請等我重整一下靈感。」]`);
                return;
            }

            lastFailedInput = '';
            const retryBtnEl = document.getElementById('iris-retry-btn');
            if (retryBtnEl) retryBtnEl.classList.remove('visible');

            // 1. 面板解析
            processPanelTokens(reply);
            reply = reply.replace(/\[Panel\|[^\]]*\]/g, '').replace(/\[PanelItem\|[^\]]*\]/g, '').replace(/\[PanelDetail\|[^\]]*\]/g, '').trim();

            // 2. 世界頻道解析
            const feedRegex = /\[FEED\|([^|]+)\|([^\]]+)\]/g; let feedMatch;
            while ((feedMatch = feedRegex.exec(reply)) !== null) addFeedEntry(feedMatch[1].trim(), feedMatch[2].trim());
            reply = reply.replace(/\[FEED\|[^\]]+\]/g, '').trim();

            // 3. 柴郡 404 返回解析
            let shouldRestoreLobby = false;
            if (reply.includes('[RESTORE_LOBBY]')) { reply = reply.replace(/\[RESTORE_LOBBY\]/g, '').trim(); shouldRestoreLobby = true; }

            // 🔥 4. 核心連動：攔截 [LaunchApp|xxx] 標籤
            let shouldLaunchApp = null;
            const launchRegex = /\[LaunchApp\|([^\]]+)\]/gi;
            let match;
            while ((match = launchRegex.exec(reply)) !== null) {
                shouldLaunchApp = match[1].trim();
            }
            reply = reply.replace(/\[LaunchApp\|[^\]]+\]/gi, '').trim();

            IRIS_STATE.history.push({ role: 'assistant', content: reply });
            debouncedSave();

            // 播放對話，完成後檢查是否需要打開面板
            playIrisSequence(reply, () => {
                if (shouldLaunchApp && window.AureliaControlCenter) {
                    setTimeout(() => {
                        window.AureliaControlCenter.launchGameApp(shouldLaunchApp);
                    }, 500); // 延遲半秒，沉浸感極佳
                }
            });

            if (shouldRestoreLobby) pendingRestoreLobby = true;

        } catch (e) {
            if (IRIS_STATE.history.length > 0 && IRIS_STATE.history[IRIS_STATE.history.length - 1].role === 'user') IRIS_STATE.history.pop();
            console.error("[VoidTerminal Chat Error]", e);
            if (is404Room) playIrisSequence(`[Nar|(馬賽克雜訊劇烈閃爍)]\n[Char|柴郡|glitch|*(眼神滿是嫌棄)* 連線爛掉了，不是我的問題。]`);
            else playIrisSequence(`[Nar|(空間產生劇烈波動)]\n[Char|瀅瀅|error|「抱歉，委託人，我的腦袋突然一片空白，請等我重整一下靈感。」]`);
        }
    }

    // ===== 成就面板 =====
    function openAchievementPanel() {
        const overlay = document.getElementById('achievement-panel-overlay');
        if (!overlay) return;
        overlay.style.display = 'flex';
        renderAchievementList();
    }

    function closeAchievementPanel() {
        const overlay = document.getElementById('achievement-panel-overlay');
        if (overlay) overlay.style.display = 'none';
    }

    function renderAchievementList() {
        const listEl  = document.getElementById('ach-list');
        const statsEl = document.getElementById('ach-stats');
        const achBtn  = document.getElementById('achievement-hist-btn');
        if (!listEl) return;

        const achievements = (window.OS_ACHIEVEMENT && window.OS_ACHIEVEMENT.getAll)
            ? window.OS_ACHIEVEMENT.getAll() : [];
        const pending  = achievements.filter(a => !a.redeemed);
        const redeemed = achievements.filter(a =>  a.redeemed);

        if (statsEl) statsEl.textContent = `${achievements.length} 個成就 · ${pending.length} 個待兌換`;

        // 更新按鈕 "待兌換" 小圓點
        if (achBtn) {
            if (pending.length > 0) achBtn.classList.add('has-pending');
            else                    achBtn.classList.remove('has-pending');
        }

        if (achievements.length === 0) {
            listEl.innerHTML = '<div class="ach-empty">── 尚無成就記錄 ──<br><span style="font-size:10px;color:#B78456;font-weight:normal;">在 VN 劇情中觸發特殊選擇以解鎖成就</span></div>';
            return;
        }

        listEl.innerHTML = '';
        // 待兌換優先顯示
        [...pending, ...redeemed].forEach(ach => {
            const item = document.createElement('div');
            item.className = 'ach-item' + (ach.redeemed ? ' redeemed' : '');

            const d = new Date(ach.timestamp);
            const dateStr = `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;

            const safeName = ach.name.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            const safeDesc = (ach.desc || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            const badgeText = ach.redeemed
                ? `💠 ${ach.shards || '—'} 碎片<br>✨ ${ach.exp || 0} EXP`
                : '待兌換';

            item.innerHTML = `
                <div class="ach-item-icon">${ach.redeemed ? '✅' : '🏆'}</div>
                <div class="ach-item-body">
                    <div class="ach-item-name">${safeName}</div>
                    ${safeDesc ? `<div class="ach-item-desc">${safeDesc}</div>` : ''}
                    <div class="ach-item-meta">${dateStr}</div>
                </div>
                <div class="ach-item-badge">${badgeText}</div>
            `;
            listEl.appendChild(item);
        });
    }

    // ===== 404 商店面板 =====
    function openStorePanel() {
        const overlay = document.getElementById('store-panel-overlay');
        if (!overlay) return;
        overlay.style.display = 'flex';
        _renderStoreContent(overlay);
    }

    function closeStorePanel() {
        const overlay = document.getElementById('store-panel-overlay');
        if (overlay) overlay.style.display = 'none';
    }

    function _renderStoreContent(overlay) {
        // 更新碎片顯示
        const shardsDisplay = overlay.querySelector('#store-shards-display');
        if (shardsDisplay && window.OS_404_STORE) {
            shardsDisplay.textContent = `💎 ${window.OS_404_STORE.getShards()} FRAGMENTS`;
        }
        // 渲染商品列表
        const body = overlay.querySelector('#store-panel-body') || overlay;
        if (window.OS_404_STORE && window.OS_404_STORE.renderStorePanel) {
            // renderStorePanel 在 store-header 下方寫入內容
            // 先找到或建立內容容器
            let contentArea = overlay.querySelector('.store-content-area');
            if (!contentArea) {
                contentArea = document.createElement('div');
                contentArea.className = 'store-content-area';
                contentArea.style.cssText = 'display:contents;';
                overlay.appendChild(contentArea);
            }
            window.OS_404_STORE.renderStorePanel(contentArea);
            // 同步碎片顯示（renderStorePanel 可能更新）
            if (shardsDisplay) {
                shardsDisplay.textContent = `💎 ${window.OS_404_STORE.getShards()} FRAGMENTS`;
            }
        }
    }

    // ===== 導出全局介面 =====
    // 暴露到外層，讓其他面板 (如 QB_CORE, IDOL_CORE) 能夠調用
    VoidTerminal.playSequence = playIrisSequence;

    // 🔥 全局登入紀錄 API
    VoidTerminal.getUserName = function() { 
        return IRIS_STATE.userName || ''; 
    };
    VoidTerminal.setUserName = function(newName) { 
        if(newName) {
            IRIS_STATE.userName = newName;
            debouncedSave(); // 確保改名後有存進資料庫
        }
    };
    VoidTerminal.isUserLoggedIn = function() {
        return !!IRIS_STATE.userName;
    };
    VoidTerminal.getChatId = getChatId;

    // 供 OS_404_STORE 呼叫：開啟商店面板
    VoidTerminal.openStorePanel = openStorePanel;

    // 供 OS_ACHIEVEMENT 回呼：刷新已開啟的成就面板
    VoidTerminal.refreshAchievementPanel = function() {
        const overlay = document.getElementById('achievement-panel-overlay');
        if (overlay && overlay.style.display !== 'none') renderAchievementList();
        // 無論面板是否開著，都更新按鈕圓點
        const achBtn = document.getElementById('achievement-hist-btn');
        if (achBtn && window.OS_ACHIEVEMENT) {
            const hasPending = window.OS_ACHIEVEMENT.getPending().length > 0;
            if (hasPending) achBtn.classList.add('has-pending');
            else            achBtn.classList.remove('has-pending');
        }
    };

    console.log('✅ 大廳敘事引擎 (VoidTerminal) 模組就緒 (瀅瀅特調色票版)');

})(window.VoidTerminal = window.VoidTerminal || {});