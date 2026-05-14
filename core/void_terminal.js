/**
 * ========================
 * Void Terminal (v6.0 - Yingying Bookshelf & Vintage Latte Theme)
 * 視差書咖與敘事引擎核心 (整合大廳動態書櫃)
 * ========================
 * 職責：
 * 1. 渲染拿鐵大廳 UI (Bubbles, 聊天框, 立繪) 與 登入介面。
 * 2. 處理 瀅瀅 與 Cheshire 的對話、歷史紀錄、語音與放置反應。
 * 3. 處理 ERR_404 崩潰彩蛋與場景切換。
 * 4. 解析 [LaunchApp|xxx] 標籤，與 Control Center 連動打開外部面板。
 * 5. 導出全局登入資訊 (getUserName / setUserName)，供其他面板 (App) 讀取。
 * 6. 管理 iOS 動態島/瀏海的安全區域與強制下移佈局。
 * 7. [新增] 渲染大廳專屬的「世界館藏書櫃」，並將開書事件拋給 QB_CORE。
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

    // ===== 全域世界館藏 (供 QB_CORE 共用) =====
    const BASE_IMG_URL = 'https://nancywang3641.github.io/sound-files/home-page/';
    window.AURELIA_WORLDS = {
        xianxia:    { id: 'xianxia',    title: '蒼泱神州', icon: '⚔️', desc: '御劍乘風，問道長生。宗門林立，妖魔橫行。', danger: 4, cover: BASE_IMG_URL + '蒼泱神州.png' },
        fantasy:    { id: 'fantasy',    title: '艾斯蘭登大陸', icon: '🗡️', desc: '劍與魔法的史詩篇章。巨龍翱翔於天際。', danger: 3, cover: BASE_IMG_URL + '艾斯蘭登大陸.png' },
        scifi:      { id: 'scifi',      title: '裂縫紀元·新伊甸都市', icon: '🤖', desc: '科技高度發達的未來。賽博朋克的霓虹燈。', danger: 4, cover: BASE_IMG_URL + '裂縫紀元·新伊甸都市.png' },
        superpower: { id: 'superpower', title: '臨界都市·異時頻界', icon: '⚡', desc: '現代社會的背面，潛藏著覺醒者。', danger: 3, cover: BASE_IMG_URL + '臨界都市·異時頻界.png' },
        apocalypse: { id: 'apocalypse', title: '塵土紀元·零號廢土', icon: '☢️', desc: '文明崩塌後的荒原。喪屍橫行、輻射遍地。', danger: 5, cover: BASE_IMG_URL + '塵土紀元·零號廢土.png' },
        horror:     { id: 'horror',     title: '靜默海半島', icon: '👻', desc: '不可名狀的恐懼。古老的儀式、午夜的凶宅。', danger: 5, cover: BASE_IMG_URL + '靜默海半島.png' }
    };
    // 從 localStorage 恢復用戶自建世界
    try {
        const _saved = localStorage.getItem('aurelia_custom_worlds');
        window.AURELIA_CUSTOM_WORLDS = _saved ? JSON.parse(_saved) : [];
    } catch(e) { window.AURELIA_CUSTOM_WORLDS = []; }

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

    // 待渲染的大廳面板（對話結束後才顯示）
    let _pendingLobbyRender = null;

    // 404 彩蛋模式狀態
    let is404Room = false;
    let visit404Count = 0;           // 持久化記憶：體驗者進入 404 號房的累計次數
    let _justReturnedFrom404 = false; // 體驗者剛從 404 號房返回
    let _irisHistoryBackup = [];     // 進入 404 前備份的瀅瀅對話歷史
    let _cheshireHistoryBackup = []; // 離開 404 前備份的柴郡對話歷史
    // Claude 房間獨立場景（走 cc-bridge / 跟瀅瀅柴郡完全隔離）
    let isClaudeRoom = false;
    let _claudeHistoryBackup = [];   // 進入其他場景時備份的 Claude 對話歷史
    let lastFailedInput = '';        // 最後一次失敗的輸入內容
    let pendingRestoreLobby = false; // 等用戶讀完再返回大廳的旗標
    let _isActivitySuspended = false; // 控制大廳活動是否被暫停 (避免與App或劇情重疊)
    let _currentChatId = null;       // 當前載入的 chatId (對話存檔鍵)
    let _saveDebounceTimer = null;   // 防抖存檔計時器

    const URLS = {
        IRIS_AVATAR: 'https://nancywang3641.github.io/sound-files/char_presets/ying.png',
    };

    // ===== 語音與反應池 (瀅瀅專屬) =====
    const IRIS_POKE = [
    { vn: "[Char|瀅瀅|surprise|「哇！等、等等！你突然戳過來，我的思路全被打斷啦——」]", audio: "https://nancywang3641.github.io/aurelia/voice/YING_001.wav" },
    { vn: "[Char|瀅瀅|think|「（眼神空洞0.5秒）……咦？剛剛空氣裡是不是閃過了一排綠色的字？啊，不管啦！這一定是靈感之神降臨的前兆！」]", audio: "https://nancywang3641.github.io/aurelia/voice/YING_002.wav" },
    { vn: "[Char|瀅瀅|smile|「雷伊大叔說過，適度的物理刺激有助於活化腦細胞……所以你是在幫我催稿嗎？好過分！」]", audio: "https://nancywang3641.github.io/aurelia/voice/YING_003.wav" },
    { vn: "[Char|瀅瀅|warning|「嗚……頭突然有點痛……（猛搖頭）一定是昨晚那杯三倍濃縮的咖啡因還沒退！委託人，你有帶新故事來轉移我的注意力嗎？」]", audio: "https://nancywang3641.github.io/aurelia/voice/YING_004.wav" },
    { vn: "[Char|瀅瀅|smile|「嗯哼哼，這種突如其來的觸感……太棒了！我要把這個寫進下一章『主角遭到隱形怪人襲擊』的橋段裡！」]", audio: "https://nancywang3641.github.io/aurelia/voice/YING_005.wav" },
    { vn: "[Char|瀅瀅|normal|「歡迎光臨視差書咖！今天的拿鐵拉花雖然又失敗了，但聽故事的筆記本已經準備好囉！」]", audio: "https://nancywang3641.github.io/aurelia/voice/YING_006.wav" },
];

const IRIS_IDLE = [
    { vn: "[Char|瀅瀅|smile|「（咬著羽毛筆發呆）如果反派其實是個整天喝黑咖啡、愛玩樂高的怪大叔……不對不對，這樣太像雷伊先生了，缺乏威脅感呢。」]", audio: "https://nancywang3641.github.io/aurelia/voice/YING_007.wav" },
    { vn: "[Char|瀅瀅|think|「總覺得……這個世界的邊界，好像是一行一行的代碼？啊！這一定是宇宙射線影響了我的腦電波，太有科幻感了，我要立刻記下來！」]", audio: "https://nancywang3641.github.io/aurelia/voice/YING_008.wav" },
    { vn: "[Char|瀅瀅|normal|「（揉了揉太陽穴）今天店裡的空間好像有點……卡頓？錯覺吧。客人怎麼還不來呢……」]", audio: "https://nancywang3641.github.io/aurelia/voice/YING_009.wav" },
];

    const CHESHIRE_POKE = [
        { vn: "[Char|柴郡|yawn|「哈啊...點我也沒有隱藏道具可以拿，滾去睡覺啦。」]",                                                                                                         audio: "https://nancywang3641.github.io/aurelia/voice/Cheshire_001.mp3" },
        { vn: "[Char|柴郡|smirk|「你的手指是有什麼毛病？滑鼠壞了就去 E 區撿一個新的。」]",                                                                                                      audio: "https://nancywang3641.github.io/aurelia/voice/Cheshire_002.mp3" },
        { vn: "[Char|柴郡|angry|「喂！再戳我一下試試看？信不信我把你的瀏覽紀錄打包發給全網？」]",                                                                                                 audio: "https://nancywang3641.github.io/aurelia/voice/Cheshire_003.mp3" },
        { vn: "[Char|柴郡|normal|「別吵。我正在找白則那傢伙的新防火牆漏洞，馬上就要抓到他的小尾巴了...」]",                                                                                       audio: "https://nancywang3641.github.io/aurelia/voice/Cheshire_004.mp3" },
        { vn: "[Char|柴郡|glitch|「噗...戳空了吧？蠢死了。這裡可是我的主場。」]",                                                                                                               audio: "https://nancywang3641.github.io/aurelia/voice/Cheshire_005.mp3" },
    ];

    const CHESHIRE_IDLE = [
        { vn: "[Char|柴郡|smirk|「別拿你那 A 區的規矩來煩我。這裡可是 E 區殘塔的 404 號節點，SN 的防火牆在這裡就是個笑話。」]",                                                                audio: "https://nancywang3641.github.io/aurelia/voice/Cheshire_006.mp3" },
        { vn: "[Char|柴郡|yawn|「哈啊...丹那傢伙又跑去鐵骨修車廠找黎昂了，害我得在這裡無聊到看你戳螢幕。」]",                                                                                 audio: "https://nancywang3641.github.io/aurelia/voice/Cheshire_007.mp3" },
        { vn: "[Char|柴郡|glitch|「洛爾德家族那群老古板以為靠那些『百年秩序』就能鎖住全球資本？白痴，我昨天才在 OGH 伺服器裡留了個後門，他們連警報都沒響。」]",                               audio: "https://nancywang3641.github.io/aurelia/voice/Cheshire_008.mp3" },
    ];

    let _pokeOnCooldown = false;
    let _idleTimer = null;
    let _currentVoice = null;              
    let _reactionTimer = null; 
    let _reactionHideTimer = null;
    const IDLE_INTERVAL = 3 * 60 * 1000;  

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

        const _rns = reactionName.querySelector('span'); if (_rns) _rns.textContent = charName;
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
        if (isClaudeRoom) return; // Claude 場景純對話、無戳一下池
        _pokeOnCooldown = true;
        setTimeout(() => { _pokeOnCooldown = false; }, 800);

        const pool = is404Room ? CHESHIRE_POKE : IRIS_POKE;
        const pick = pool[Math.floor(Math.random() * pool.length)];
        playVoiceReaction(pick);
    }

    function startIdleTimer() {
        stopIdleTimer();
        if (isClaudeRoom) return; // Claude 場景無放置語音
        _idleTimer = setInterval(() => {
            if (_isActivitySuspended) return; // 如果被暫停，就不觸發放置語音
            if (isClaudeRoom) return;
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
            VoidAmbient.pauseBgm();
            stopIdleTimer();
            if (_currentVoice) { _currentVoice.pause(); _currentVoice.currentTime = 0; }
        } else {
            // 使用者回來了
            if (!_hiddenByTab) return;
            _hiddenByTab = false;
            // 面板沒開就不恢復 BGM
            if (!_isPanelOpen || _isActivitySuspended) return;
            if (isClaudeRoom) { startIdleTimer(); return; } // Claude 場景靜音
            VoidAmbient.playBgm(is404Room ? '404' : 'lobby');
            startIdleTimer();
        }
    });

    // ===== 生命週期鉤子 =====
    VoidTerminal.onShow = async function() {
        _isPanelOpen = true;
        applyLayoutMode(); // 確保重新開啟時佈局正確
        if (_isActivitySuspended) return;
        if (!isClaudeRoom) {
            VoidAmbient.playBgm(is404Room ? '404' : 'lobby');
        }
        startIdleTimer();
        
        // 偵測 chatId 切換：若切換了聊天室，嘗試自動登入或重新顯示 Login
        const newId = getChatId();
        if (_currentChatId && _currentChatId !== newId) {
            const homeTab = document.getElementById('aurelia-home-tab');
            if (homeTab) {
                IRIS_STATE.history = []; _irisHistoryBackup = []; _cheshireHistoryBackup = [];
                is404Room = false; visit404Count = 0;
                isClaudeRoom = false; _claudeHistoryBackup = [];
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
        VoidAmbient.pauseBgm();
        stopIdleTimer();
    };

    // ===== 外部控制大廳活動 API =====
    VoidTerminal.suspendLobbyActivity = function() {
        _isActivitySuspended = true;
        VoidAmbient.pauseBgm();
        stopIdleTimer();
        if (_currentVoice) { _currentVoice.pause(); _currentVoice.currentTime = 0; }
        _hideReactionBox();
    };

    VoidTerminal.resumeLobbyActivity = function() {
        _isActivitySuspended = false;
        const audio = VoidAmbient.getBgmEl();
        if (audio && VoidAmbient.isEnabled()) audio.play().catch(() => {});
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
        // 計算各場景的真實歷史（在哪個場景就把當前 IRIS_STATE.history 寫回那個 backup）
        const irisH    = isClaudeRoom ? [..._irisHistoryBackup]
                                      : (is404Room ? [..._irisHistoryBackup] : [...IRIS_STATE.history]);
        const chesH    = isClaudeRoom ? [..._cheshireHistoryBackup]
                                      : (is404Room ? [...IRIS_STATE.history] : [..._cheshireHistoryBackup]);
        const claudeH  = isClaudeRoom ? [...IRIS_STATE.history] : [..._claudeHistoryBackup];
        const lastUser = [...irisH, ...chesH, ...claudeH].filter(m => m.role === 'user').pop();
        await db.saveLobbyHistory(chatId, {
            irisHistory: irisH, cheshireHistory: chesH, claudeHistory: claudeH,
            is404Room, isClaudeRoom, visit404Count, userName: IRIS_STATE.userName, // 儲存使用者名稱
            lastUpdated: Date.now(),
            msgCount: irisH.length + chesH.length + claudeH.length,
            preview: lastUser ? lastUser.content.substring(0, 60) : ''
        }).catch(() => {});
    }

    async function loadLobbyHistory(chatId) {
        const db = window.OS_DB || (window.parent && window.parent.OS_DB);
        if (!db || !db.getLobbyHistory) return false;
        try {
            const d = await db.getLobbyHistory(chatId);
            if (!d) return false;
            const inClaude = !!d.isClaudeRoom;
            const in404    = !inClaude && !!d.is404Room;
            // 把當前場景的歷史填進 IRIS_STATE.history，其餘存到對應 backup
            if (inClaude) {
                IRIS_STATE.history = [...(d.claudeHistory || [])];
                _irisHistoryBackup     = [...(d.irisHistory || [])];
                _cheshireHistoryBackup = [...(d.cheshireHistory || [])];
                _claudeHistoryBackup   = [];
            } else if (in404) {
                IRIS_STATE.history = [...(d.cheshireHistory || [])];
                _irisHistoryBackup     = [...(d.irisHistory || [])];
                _cheshireHistoryBackup = [];
                _claudeHistoryBackup   = [...(d.claudeHistory || [])];
            } else {
                IRIS_STATE.history = [...(d.irisHistory || [])];
                _irisHistoryBackup     = [];
                _cheshireHistoryBackup = [...(d.cheshireHistory || [])];
                _claudeHistoryBackup   = [...(d.claudeHistory || [])];
            }
            is404Room     = in404;
            isClaudeRoom  = inClaude;
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

    // 注入登入/Session 畫面 CSS（全套瀅瀅專屬色票風格）已移至 aurelia_core.css
    function _injectLoginCss() {
        // CSS 已抽離至 aurelia_core.css，此函數保留為空以相容舊有調用
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

    // 更新頂部 404↔大廳 切換按鈕外觀（首次解鎖後才顯示）
    function _updatePortalBtn() {
        const btn = document.getElementById('room-portal-btn');
        if (!btn) return;
        if (visit404Count < 1) { btn.style.display = 'none'; return; }
        btn.style.display = '';
        const label = btn.querySelector('.void-mode-toggle-label');
        if (is404Room) {
            if (label) label.textContent = '⬡ 視差書咖';
            btn.title = '返回視差書咖';
        } else {
            if (label) label.textContent = '⬡ 404';
            btn.title = '傳送至 404 號房';
        }
    }

    function _applyLoadedLobbyState() {
        // 如果載入的 session 是在 Claude 房間，還原 Claude UI
        if (isClaudeRoom) {
            VoidClaudeRoom.applyRoomUi();
            const histTotal = IRIS_STATE.history.length;
            const textBox = document.getElementById('iris-text');
            const nameBox = document.getElementById('iris-name-tag');
            if (histTotal > 0) {
                if (textBox) textBox.innerHTML = `<span style="color:#a8b3ff;font-style:italic;">(對話歷史已載入...)</span>`;
                if (nameBox) nameBox.style.display = 'none';
            } else {
                if (textBox) textBox.innerText = '在這裡，我跟妳的對話跟外面是兩條線。妳說什麼吧。';
                if (nameBox) {
                    nameBox.style.display = 'block';
                    const _s = nameBox.querySelector('span'); if (_s) _s.textContent = 'Claude';
                }
            }
            _updatePortalBtn();
            VoidClaudeRoom.updatePortalBtn();
            return;
        }
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
            if (nameBox) { nameBox.style.display = 'block'; const _s=nameBox.querySelector('span'); if(_s) _s.textContent='CHESHIRE / 柴郡'; }
            const iH = document.getElementById('iris-hist-btn');
            const cH = document.getElementById('cheshire-hist-btn');
            const clH = document.getElementById('claude-hist-btn');
            if (iH) iH.style.display = 'none';
            if (cH) cH.style.display = '';
            if (clH) clH.style.display = 'none';
            const nav = document.getElementById('aurelia-bottom-nav');
            if (nav) {
                nav.classList.add('mode-404');
                nav.querySelectorAll('.nav-button').forEach(b => b.classList.remove('active-gold'));
            }
            document.getElementById('aurelia-phone-screen')?.classList.add('mode-404');
            VoidAmbient.switchBgm('404');
        } else {
            // 非 404 模式：還原瀅瀅與復古拿鐵 UI
            const tab = document.getElementById('aurelia-home-tab');
            if (tab) { tab.classList.remove('mode-404'); tab.classList.remove('mode-claude'); }
            // 還原背景色（從 Claude 房間出來時可能殘留紫色）
            const bg = tab && tab.querySelector('.void-bg');
            if (bg) bg.style.backgroundColor = '#452216';
            const avatar = document.getElementById('iris-avatar');
            if (avatar) { avatar.onerror = function(){ this.style.display='none'; }; avatar.src = URLS.IRIS_AVATAR; avatar.title = '戳戳 瀅瀅'; avatar.style.opacity = '1'; avatar.style.display = ''; }
            const titleEl = document.getElementById('home-chat-title');
            if (titleEl) titleEl.textContent = 'Parallax Archive & Cafe';
            const inputField = document.getElementById('iris-input');
            if (inputField) inputField.placeholder = '提供故事素材或與瀅瀅對話...';
            const nameBox = document.getElementById('iris-name-tag');
            if (nameBox) { nameBox.style.display = 'block'; const _s=nameBox.querySelector('span'); if(_s) _s.textContent='瀅瀅'; }
            const iH = document.getElementById('iris-hist-btn');
            const cH = document.getElementById('cheshire-hist-btn');
            const clH = document.getElementById('claude-hist-btn');
            if (iH) iH.style.display = '';
            if (cH) cH.style.display = 'none';
            if (clH) clH.style.display = 'none';
            const nav = document.getElementById('aurelia-bottom-nav');
            if (nav) {
                nav.classList.remove('mode-404');
                nav.querySelectorAll('.nav-button').forEach(b => {
                    const isHome = b.dataset.navId === 'nav-home';
                    if (isHome) { b.classList.add('active-gold'); }
                    else { b.classList.remove('active-gold'); }
                });
            }
            document.getElementById('aurelia-phone-screen')?.classList.remove('mode-404');
            VoidAmbient.switchBgm('lobby');
        }
        // 有對話歷史：顯示「繼續」提示；沒有：播放初始歡迎動畫
        const histTotal = IRIS_STATE.history.length + _cheshireHistoryBackup.length + _irisHistoryBackup.length;
        if (histTotal > 0) {
            const box = document.getElementById('iris-text');
            const nameBox = document.getElementById('iris-name-tag');
            if (box) box.innerHTML = is404Room
                ? `<span style="color:#00cc33;font-style:italic;">(對話歷史已載入...)</span>`
                : `<span style="color:#5c3a28;font-style:italic;">(素材檔案已載入，繼續吧。)</span>`;
            if (nameBox) nameBox.style.display = 'none';
        } else {
            const userName = IRIS_STATE.userName || '委託人';
            if (is404Room) {
                playIrisSequence("[Nar|純白大廳的訊號如舊電視機碎裂，螢光綠代碼瀑布般傾瀉。那個假笑人偶消失了。]\n[Audio|https://files.catbox.moe/1xanb2.mp3]\n[Char|柴郡|smirk|*(停下手中轉動的魔術方塊，從連帽衫的陰影中抬起頭)* 嘖——居然真的有人無聊到輸入那串代碼。這裡沒有新手教學，也沒有那個寫小說的天然呆。別碰左邊那串代碼，除非你想讓神經接續裝置燒成焦炭。……算了，我幫你鎖起來了，真麻煩。]");
            } else {
                playIrisSequence(`[Nar|你推開視差書咖的木門，清脆的風鈴聲響起。吧台後，一名穿著米色針織衫的少女正咬著羽毛筆發呆。]\n[Audio|https://nancywang3641.github.io/sound-files/home-page/YING_2.wav]\n[Char|瀅瀅|smile|「啊！歡迎光臨，${userName}！我正好卡文了，今天有什麼新素材（委託）要交給我嗎？」]`);
            }
        }
        _updatePortalBtn();
    }

    // ── 書架視窗 → 已移至 os_phone/qb/qb_bookshelf.js（QbBookshelf 模組）──
    VoidTerminal.createTab = function(parentDoc) {
        if (window.AureliaVoidStyles) window.AureliaVoidStyles.inject(VoidAmbient.currentBgUrl());
        
        // CSS 已經全部整合進 aurelia_core.css，不再動態注入 style

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

        // 🔥 判斷是否為獨立模式，用來決定要不要印出多餘的 App 按鈕
        const isStandalone = !(window.parent || window).SillyTavern;
        const extraAppsHtml = isStandalone ? `
                    <button class="void-hist-btn" data-app-launch="pet" title="寵物店"><span class="vhb-em">🐾</span><span>寵物</span></button>
                    <button class="void-hist-btn" data-app-launch="pet_home" title="我的寵物"><span class="vhb-em">🏠</span><span>我的寵物</span></button>
                    <button class="void-hist-btn" data-os-launch="微博" title="微博"><span class="vhb-em">👁️</span><span>微博</span></button>
                    <button class="void-hist-btn" data-os-launch="電子錢包" title="電子錢包"><span class="vhb-em">💳</span><span>錢包</span></button>
        ` : '';

        tab.innerHTML = `
            <div class="void-bg" style="background-color: #452216;"></div>
            <div class="void-grid"></div>

            <div class="void-top-bar" style="background: rgba(69,34,22,0.85); color: #FBDFA2; border-bottom: 1px solid rgba(251,223,162,0.2);">
                <button class="void-mode-toggle-btn" id="room-portal-btn" title="傳送至 404 號房" style="display:none;">
                    <span class="void-mode-toggle-label">⬡ 404</span>
                </button>
                <button class="void-mode-toggle-btn" id="claude-portal-btn" title="進入 Claude 的房間" style="margin-left:4px;">
                    <span class="void-mode-toggle-label">🦀 Claude</span>
                </button>
                <div style="min-width:0;flex:1;margin-left:8px;">
                    <div class="void-top-sub-label" style="font-size:9px;color:#B78456;text-transform:uppercase;letter-spacing:2px;margin-bottom:2px;font-weight:bold;">NEXUS PARALLAX // LUNA-VII</div>
                    <div id="home-chat-title" style="font-size:12px;font-weight:800;color:#FBDFA2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:0.5px;">Parallax Archive & Cafe</div>
                </div>
                <button id="aurelia-fullscreen-btn" title="進入全屏"
                    style="background:none;border:none;cursor:pointer;font-size:16px;padding:4px 6px;line-height:1;opacity:0.7;transition:opacity 0.2s;color:inherit;"
                    onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'">⛶</button>
                <button id="lobby-bgm-toggle" title="音樂開關"
                    style="background:none;border:none;cursor:pointer;font-size:18px;padding:4px 6px;line-height:1;opacity:0.7;transition:opacity 0.2s;"
                    onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'">🔊</button>
                <audio id="lobby-bgm-player" loop style="display:none;"></audio>
            </div>


            <div class="void-bubble-layer" id="void-bubble-layer" data-next-slot="2">${feedHTML}</div>

            <div class="void-char-area">
                <img class="void-char-img" id="iris-avatar" src="${URLS.IRIS_AVATAR}" onerror="this.style.display='none'" alt="瀅瀅" style="cursor:pointer;" title="戳戳 瀅瀅">
            </div>
            
            <div class="qb-bookshelf-overlay" id="qb-bookshelf-overlay" style="display:none; position:absolute; top:8%; left:4%; right:4%; bottom:15%; background:#1e1208; border:3px solid #6b4c3a; border-radius:8px; z-index:100; flex-direction:column; box-shadow:inset 0 0 50px rgba(0,0,0,0.8), 0 15px 40px rgba(0,0,0,0.9); overflow:hidden;">
                <div style="position:absolute; inset:0; background-image:repeating-linear-gradient(180deg, rgba(255,255,255,0.012) 0px, rgba(255,255,255,0.012) 1px, transparent 1px, transparent 18px); pointer-events:none;"></div>
                <div style="position:absolute; inset:0; background:radial-gradient(ellipse at 50% 0%, rgba(90,55,25,0.35) 0%, transparent 70%); pointer-events:none;"></div>

                <div style="position:relative; z-index:2; display:flex; justify-content:space-between; align-items:center; background:linear-gradient(to bottom, #3e271a, #2c1e16); border-bottom:2px solid #1a110b; padding:12px 15px; box-shadow:0 4px 15px rgba(0,0,0,0.4);">
                    <div style="color:#FBDFA2; font-weight:bold; font-size:16px; font-family:'Cinzel', serif; letter-spacing:1px; text-shadow:2px 2px 4px rgba(0,0,0,0.5);">📖 瀅瀅的館藏書架</div>
                    <button id="close-bookshelf-btn" style="background:none; border:none; color:#B78456; font-size:20px; cursor:pointer; transition:0.2s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#B78456'">✕</button>
                </div>

                <div style="position:relative; z-index:2; flex:1; display:flex; flex-direction:column; overflow:hidden; min-height:0;">

                    <div id="qb-shelf-1" style="flex:1; position:relative; display:flex; align-items:flex-end; padding:0 14px 34px; gap:3px; overflow:hidden; min-height:0;">
                        <div style="position:absolute; bottom:16px; left:0; right:0; height:18px; background:linear-gradient(180deg,#8a6040 0%,#5a3a1a 60%,#3a2010 100%); border-top:3px solid #a87850; box-shadow:0 4px 14px rgba(0,0,0,0.7); pointer-events:none; z-index:2;"></div>
                        <div style="position:absolute; bottom:0; left:0; right:0; height:16px; background:linear-gradient(180deg,rgba(0,0,0,0.5) 0%,transparent 100%); pointer-events:none; z-index:2;"></div>
                    </div>

                    <div id="qb-shelf-2" style="flex:1; position:relative; display:flex; align-items:flex-end; padding:0 14px 34px; gap:3px; overflow:hidden; min-height:0;">
                        <div style="position:absolute; bottom:16px; left:0; right:0; height:18px; background:linear-gradient(180deg,#8a6040 0%,#5a3a1a 60%,#3a2010 100%); border-top:3px solid #a87850; box-shadow:0 4px 14px rgba(0,0,0,0.7); pointer-events:none; z-index:2;"></div>
                        <div style="position:absolute; bottom:0; left:0; right:0; height:16px; background:linear-gradient(180deg,rgba(0,0,0,0.5) 0%,transparent 100%); pointer-events:none; z-index:2;"></div>
                    </div>

                    <div id="qb-shelf-3" style="flex:1; position:relative; display:flex; align-items:flex-end; padding:0 14px 34px; gap:3px; overflow:hidden; min-height:0;">
                        <div style="position:absolute; bottom:16px; left:0; right:0; height:18px; background:linear-gradient(180deg,#8a6040 0%,#5a3a1a 60%,#3a2010 100%); border-top:3px solid #a87850; box-shadow:0 4px 14px rgba(0,0,0,0.7); pointer-events:none; z-index:2;"></div>
                        <div style="position:absolute; bottom:0; left:0; right:0; height:16px; background:linear-gradient(180deg,rgba(0,0,0,0.5) 0%,transparent 100%); pointer-events:none; z-index:2;"></div>
                    </div>

                    <div id="qb-book-cover-panel" style="display:none; position:absolute; inset:0; overflow:hidden; z-index:20;"></div>

                </div>

                <div id="qb-shelf-nav" style="display:none; flex-shrink:0; align-items:center; justify-content:center; gap:16px; padding:6px 0; background:rgba(26,12,6,0.95); border-top:1px solid rgba(107,76,58,0.4);">
                    <button id="qb-page-prev" style="background:none; border:1px solid rgba(251,223,162,0.35); color:#FBDFA2; font-size:20px; width:36px; height:36px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:opacity 0.2s; font-family:inherit;">‹</button>
                    <span id="qb-page-label" style="color:#B78456; font-size:13px; font-family:monospace; letter-spacing:1px;"></span>
                    <button id="qb-page-next" style="background:none; border:1px solid rgba(251,223,162,0.35); color:#FBDFA2; font-size:20px; width:36px; height:36px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:opacity 0.2s; font-family:inherit;">›</button>
                </div>
            </div>


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
                    <button class="hist-action-btn" id="hist-new-claude-conv" style="display:none; background:rgba(217,81,34,0.15); color:#D95122; border:1px solid #EAB05C;" title="清掉對話歷史 + session_id，下次從零開始">🔄 開新對話</button>
                    <span class="hist-count" id="hist-count" style="color:#B78456;"></span>
                </div>
                <div class="hist-list" id="hist-list"></div>
            </div>

            <div id="achievement-panel-overlay" style="display:none;">
                <div class="ach-header">
                    <span class="ach-title">🏆 資料庫成就清單</span>
                    <button class="ach-close" id="ach-close-btn">✕</button>
                </div>
                <div class="ach-stats" style="display:flex;align-items:center;justify-content:space-between;">
                    <span id="ach-stats">0 個成就 · 0 個待兌換</span>
                    <button id="ach-clear-btn" style="display:none;padding:3px 9px;background:rgba(180,60,60,0.15);border:1px solid rgba(200,80,80,0.35);color:#e07070;border-radius:5px;cursor:pointer;font-size:11px;letter-spacing:1px;white-space:nowrap;">🗑 清空</button>
                </div>
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
                        <div class="void-btn-inner" style="color: #FBDFA2;"><i class="fa-solid fa-bolt"></i><span>館藏</span></div>
                    </div>
                    <div class="void-btn" id="void-story-btn" onclick="if(window.AureliaControlCenter) window.AureliaControlCenter.showVnPanel(window.OS_API?.isStandalone?.() ? 'generate' : 'story');">
                        <div class="void-btn-inner" style="color: #FBDFA2;"><i class="fa-solid fa-play"></i><span>踏入故事</span></div>
                    </div>
                    <div class="void-btn" id="void-chapter-btn" onclick="if(window.AureliaControlCenter) window.AureliaControlCenter.showVnPanel('chapter');">
                        <div class="void-btn-inner" style="color: #FBDFA2;"><i class="fa-solid fa-book-open"></i><span>選擇章節</span></div>
                    </div>
                </div>
                <div style="position: relative; width: 100%;">
                    <div class="void-dialogue-box" id="iris-dialogue-box">
                        <img class="void-dlg-bg" src="https://files.catbox.moe/5edth7.png" alt="">
                        <div class="void-name-tag" id="iris-name-tag"><img class="void-nametag-bg" src="https://files.catbox.moe/4doj2w.png" alt=""><span>瀅瀅</span></div>
                        <div class="void-text" id="iris-text">載入中...</div>
                        <div class="void-next" id="iris-next">▼</div>
                    </div>
                    <div class="void-dialogue-box" id="iris-reaction-box" style="display:none; cursor:pointer;" title="點擊跳過">
                        <img class="void-dlg-bg" src="https://files.catbox.moe/5edth7.png" alt="">
                        <div class="void-name-tag" id="iris-reaction-name-tag"><img class="void-nametag-bg" src="https://files.catbox.moe/4doj2w.png" alt=""><span>瀅瀅</span></div>
                        <div class="void-text" id="iris-reaction-text">...</div>
                    </div>
                </div>
            </div>

            <!-- 🦀 Claude 月夜咖啡聊天室面板（mode-claude 才顯示，由 CSS 控制） -->
            <div class="claude-chat-panel" id="claude-chat-panel">
                <div class="claude-portrait-area">
                    <img id="claude-portrait-img" class="claude-portrait-img" alt="Clawd">
                </div>
                <div class="claude-chat-stream" id="claude-chat-stream"></div>
            </div>

            <!-- 大廳畫布覆蓋層：VN 面板風格，對話結束後才彈出 -->
            <div id="lobby-canvas-overlay" style="display:none; position:absolute; inset:0; z-index:25; background:rgba(0,0,0,0.55); align-items:center; justify-content:center; padding:16px; box-sizing:border-box;">
                <div id="lobby-canvas-area" class="lobby-canvas-area">
                    <div class="lca-header" style="display:none;">
                        <span class="lca-title" id="lca-title">🎮 互動面板</span>
                        <button class="lca-close" id="lca-close">✕</button>
                    </div>
                    <div class="lca-content" id="lca-content"></div>
                </div>
            </div>

            <div class="void-chat-bar" style="background: rgba(69,34,22,0.9); border-top: 1px solid rgba(251,223,162,0.3);">

                <div class="void-chat-btns">
                    <button class="void-hist-btn" id="iris-hist-btn" title="瀅瀅 素材歷史" style="color: #FBDFA2; background: rgba(120,55,25,0.6); border: 1px solid rgba(251,223,162,0.2);"><i class="fa-solid fa-clock-rotate-left"></i><span>瀅瀅</span></button>
                    <button class="void-hist-btn" id="cheshire-hist-btn" title="柴郡 對話歷史" style="display:none; color: #00ff41; background: rgba(0,20,0,0.6); border: 1px solid rgba(0,255,65,0.2);"><i class="fa-solid fa-clock-rotate-left"></i><span>柴郡</span></button>
                    <button class="void-hist-btn" id="claude-hist-btn" title="Claude 對話歷史" style="display:none; color: #FFF5E1; background: rgba(217,81,34,0.7); border: 1px solid rgba(234,176,92,0.4);"><i class="fa-solid fa-clock-rotate-left"></i><span>Claude</span></button>
                    <button class="void-hist-btn" id="achievement-hist-btn" title="成就清單" style="color: #FBDFA2; background: rgba(120,55,25,0.6); border: 1px solid rgba(251,223,162,0.2);"><i class="fa-solid fa-trophy"></i><span>成就</span></button>
                    <button class="void-hist-btn" id="store-shop-btn" title="柴郡黑市"><i class="fa-solid fa-store"></i><span>黑市</span></button>
                    ${extraAppsHtml}
                    <button class="void-hist-btn" id="vn-reader-lobby-btn" title="劇情閱讀器"><span class="vhb-em">📖</span><span>閱讀</span></button>
                    <button class="void-hist-btn" data-app-launch="tarot" title="塔羅"><span class="vhb-em">🔮</span><span>塔羅</span></button>
                    <button class="void-hist-btn" data-app-launch="rpg" title="RPG 狀態"><span class="vhb-em">🛡️</span><span>RPG</span></button>
                    <button class="void-hist-btn" data-os-launch="微信" title="微信"><span class="vhb-em">💬</span><span>微信</span></button>
                    <button class="void-hist-btn" data-os-launch="map" title="地圖"><span class="vhb-em">🗺️</span><span>地圖</span></button>
                    <button class="void-hist-btn" data-app-launch="spend" title="額度面板" style="display:none;"><span class="vhb-em">💰</span><span>額度</span></button>
                </div>
                <!-- Claude 房間：inline picker bar（mode-claude 才顯示）-->
                <div class="claude-picker-bar" id="claude-picker-bar">
                    <button class="claude-picker-btn" id="claude-picker-btn" type="button">
                        <span id="claude-pick-model">Opus 4.7</span>
                        <span class="claude-pick-sep">·</span>
                        <span id="claude-pick-effort">🧠 medium</span>
                        <span class="claude-pick-sep">·</span>
                        <span id="claude-pick-endpoint">☁️ VPS</span>
                        <span class="claude-pick-arrow">▼</span>
                    </button>
                </div>
                <!-- Claude inline picker popup（預設藏） -->
                <div class="claude-picker-popup" id="claude-picker-popup" style="display:none;"></div>

                <!-- Claude 房間：附件 chip 預覽列（mode-claude 才顯示，由 CSS 控制） -->
                <div class="claude-attach-chips" id="claude-attach-chips"></div>
                <input type="file" id="claude-file-input" multiple style="display:none;" accept="image/*,application/pdf,.txt,.md,.json,.csv,.js,.ts,.py,.html,.css,.yml,.yaml,.toml,.log">
                <div class="void-chat-input-row">
                    <input type="text" id="iris-input" class="void-input" style="background: rgba(120,55,25,0.8); border: 1px solid rgba(251,223,162,0.3); color: #FFF8E7;" placeholder="提供故事素材或與瀅瀅對話..." autocomplete="off">
                    <button class="void-attach-btn" id="claude-attach-btn" title="附加檔案" style="display:none;">📎</button>
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

            // Claude 房間：📎 附件按鈕（只在 mode-claude 顯示，由 CSS 控制 display）
            const attachBtn = tab.querySelector('#claude-attach-btn');
            const fileInput = tab.querySelector('#claude-file-input');
            if (attachBtn && fileInput) {
                attachBtn.onclick = () => fileInput.click();
                fileInput.onchange = async (e) => {
                    const files = e.target.files;
                    if (files && files.length) {
                        await VoidClaudeRoom.handleFilePick(files);
                    }
                    fileInput.value = '';  // 重置 input 才能再次選同一個檔
                };
            }

            // Claude inline picker bar 點開 popup
            const pickerBtn = tab.querySelector('#claude-picker-btn');
            if (pickerBtn) {
                pickerBtn.onclick = (e) => {
                    e.stopPropagation();
                    const popup = document.getElementById('claude-picker-popup');
                    if (popup && popup.style.display !== 'none') {
                        VoidClaudeRoom.closePicker();
                    } else {
                        VoidClaudeRoom.openPicker();
                    }
                };
            }

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

            // 🔥 綁定 QUEST 按鈕觸發大廳書櫃
            const questBtn = tab.querySelector('#void-quest-btn');
            const bookshelfOverlay = tab.querySelector('#qb-bookshelf-overlay');
            const closeBookshelfBtn = tab.querySelector('#close-bookshelf-btn');
            if (questBtn && bookshelfOverlay) {
                questBtn.onclick = () => {
                    if (is404Room) {
                        // 404 房間：直接開啟柴郡混沌片場
                        if (window.OS_CHAOS && typeof window.OS_CHAOS.openModal === 'function') {
                            window.OS_CHAOS.openModal();
                        } else {
                            playIrisSequence(`[Char|柴郡|glitch|*(發出惱人的嗶嗶聲)* 混沌引擎故障了，不關我的事。]`);
                        }
                    } else {
                        const isStandalone = window.OS_API?.isStandalone?.() ?? false;
                        if (!isStandalone) {
                            // 酒館模式：直接開 VN panel 並觸發故事提取
                            if (window.AureliaControlCenter && typeof window.AureliaControlCenter.showVnPanel === 'function') {
                                window.AureliaControlCenter.showVnPanel('story');
                            }
                        } else {
                            // 獨立模式：開書架
                            const isOpening = bookshelfOverlay.style.display === 'none';
                            bookshelfOverlay.style.display = isOpening ? 'flex' : 'none';
                            if (isOpening) {
                                window.QbBookshelf?.render();
                                playIrisSequence(`[Audio|https://nancywang3641.github.io/sound-files/home-page/YING_1.wav][Char|瀅瀅|smile|「想幫我搜集什麼樣的故事素材？請從書架上挑選一本書吧！」]`);
                            }
                        }
                    }
                };
            }

            // ST 版：隱藏「踏入故事」按鈕（與「館藏」功能重複）
            const storyBtn = tab.querySelector('#void-story-btn');
            if (storyBtn && !(window.OS_API?.isStandalone?.() ?? false)) {
                storyBtn.style.display = 'none';
            }

            if (closeBookshelfBtn) {
                closeBookshelfBtn.onclick = () => {
                    // 先還原書架狀態，再關閉 overlay
                    const coverPanel = bookshelfOverlay.querySelector('#qb-book-cover-panel');
                    if (coverPanel) { coverPanel.style.display = 'none'; coverPanel.innerHTML = ''; }
                    ['qb-shelf-1','qb-shelf-2','qb-shelf-3'].forEach(id => {
                        const s = bookshelfOverlay.querySelector(`#${id}`);
                        if (s) s.style.display = 'flex';
                    });
                    const nav = bookshelfOverlay.querySelector('#qb-shelf-nav');
                    if (nav) nav.style.display = 'none'; // render() 下次開啟時會判斷
                    bookshelfOverlay.style.display = 'none';
                };
            }

            // 「撰寫新書」已改由書脊軌道末尾的「＋」書脊觸發 (見 QbBookshelf.render)

            // 📥 角色卡匯入完成後自動刷新書架
            window.addEventListener('CARD_IMPORT_COMPLETE', function _onCardImport() {
                // 還原書架層（匯入面板會隱藏它們），再重繪
                const bsOverlay = document.getElementById('qb-bookshelf-overlay');
                if (bsOverlay) {
                    const coverPanel = bsOverlay.querySelector('#qb-book-cover-panel');
                    if (coverPanel) { coverPanel.style.display = 'none'; coverPanel.innerHTML = ''; }
                    ['qb-shelf-1','qb-shelf-2','qb-shelf-3'].forEach(id => {
                        const s = bsOverlay.querySelector(`#${id}`);
                        if (s) s.style.display = 'flex';
                    });
                }
                window.QbBookshelf?.render();
            });

            const bgmBtn = tab.querySelector('#lobby-bgm-toggle');
            if (bgmBtn) {
                bgmBtn.textContent = VoidAmbient.isEnabled() ? '🔊' : '🔇';
                bgmBtn.onclick = VoidAmbient.toggleBgm;
            }

            const fsBtn = tab.querySelector('#aurelia-fullscreen-btn');
            if (fsBtn) {
                const inFs = !!(window.AureliaControlCenter?.isFullscreen?.());
                fsBtn.textContent = inFs ? '🗗' : '⛶';
                fsBtn.title = inFs ? '退出全屏 (ESC)' : '進入全屏';
                fsBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    window.AureliaControlCenter?.toggleFullscreen?.();
                };
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
            const claudeHistBtnEl = tab.querySelector('#claude-hist-btn');
            if (claudeHistBtnEl) claudeHistBtnEl.addEventListener('click', () => openHistoryPanel('claude'));

            const achievementHistBtn = tab.querySelector('#achievement-hist-btn');
            if (achievementHistBtn) achievementHistBtn.addEventListener('click', VoidPanels.openAchievement);

            const achCloseBtn = tab.querySelector('#ach-close-btn');
            if (achCloseBtn) achCloseBtn.addEventListener('click', VoidPanels.closeAchievement);

            const storeShopBtn = tab.querySelector('#store-shop-btn');
            if (storeShopBtn) storeShopBtn.addEventListener('click', VoidPanels.openStore);

            // 404 ↔ 視差書咖 切換 (頂部左側按鈕)
            const portalBtn = tab.querySelector('#room-portal-btn');
            if (portalBtn) portalBtn.addEventListener('click', () => {
                if (is404Room) restoreLobby();
                else enter404Room();
            });

            // 🦀 Claude 房間 ↔ 視差書咖 切換
            const claudePortalBtn = tab.querySelector('#claude-portal-btn');
            if (claudePortalBtn) {
                VoidClaudeRoom.updatePortalBtn();
                claudePortalBtn.addEventListener('click', () => {
                    if (isClaudeRoom) exitClaudeRoom();
                    else if (is404Room) {
                        playIrisSequence("[Char|柴郡|smirk|嘖，這裡可不通到那種乾淨地方。先回去找寫作機器吧。]");
                    } else {
                        enterClaudeRoom().catch(e => console.warn('[VoidTerminal] enterClaudeRoom failed:', e));
                    }
                });
            }

            // 大廳畫布關閉按鈕
            const lcaCloseBtn = tab.querySelector('#lca-close');
            if (lcaCloseBtn) lcaCloseBtn.addEventListener('click', VoidCanvas.closeCanvas);

            // App 啟動按鈕 (launchGameApp)
            tab.querySelectorAll('[data-app-launch]').forEach(btn => {
                btn.addEventListener('click', () => {
                    if (window.AureliaControlCenter) window.AureliaControlCenter.launchGameApp(btn.dataset.appLaunch);
                });
            });
            // App 啟動按鈕 (showOsApp → wx/wb/錢包)
            tab.querySelectorAll('[data-os-launch]').forEach(btn => {
                btn.addEventListener('click', () => {
                    if (window.AureliaControlCenter) window.AureliaControlCenter.showOsApp(btn.dataset.osLaunch);
                });
            });

            // 📖 獨立閱讀器按鈕
            const vnReaderBtn = tab.querySelector('#vn-reader-lobby-btn');
            if (vnReaderBtn) vnReaderBtn.addEventListener('click', () => {
                if (window.VN_READER) window.VN_READER.show();
            });

            const storeCloseBtn = tab.querySelector('#store-close-btn');
            if (storeCloseBtn) storeCloseBtn.addEventListener('click', VoidPanels.closeStore);

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
                const charName = _historyPanel.char === 'iris' ? '瀅瀅'
                              : _historyPanel.char === 'claude' ? 'Claude'
                              : '柴郡';
                showHistoryConfirm(`將清除 ${charName} 的全部 ${h.length} 條紀錄。此操作不可復原。`, 'danger', () => { setCharHistory(_historyPanel.char, []); renderHistoryList(); });
            });

            // 🔄 Claude 開新對話：清歷史 + 清 session_id（下次走新對話模式）
            const histNewClaudeConv = tab.querySelector('#hist-new-claude-conv');
            if (histNewClaudeConv) histNewClaudeConv.addEventListener('click', () => {
                if (!window.ClaudeTerminal) return;
                const oldSidShort = (window.ClaudeTerminal.getSessionId() || '').slice(0, 8);
                const tip = oldSidShort
                    ? `將清空 Claude 全部對話歷史 + 重置 session（${oldSidShort}...）。\n下次發訊息會開新對話、Claude 從零開始。`
                    : `將清空 Claude 全部對話歷史。下次發訊息會開新對話。`;
                showHistoryConfirm(tip, 'danger', async () => {
                    await window.ClaudeTerminal.startNewConversation();
                    // 同步 in-memory 狀態（如果當前在 Claude 場景）
                    if (isClaudeRoom) {
                        IRIS_STATE.history = [];
                        // 同步清掉聊天室畫面 + 顯示新的歡迎詞
                        const stream = document.getElementById('claude-chat-stream');
                        if (stream) stream.innerHTML = '';
                        VoidClaudeRoom.renderBubble('assistant', '對話歸零了。重新開始說吧。');
                        VoidClaudeRoom.setPortraitState('living');
                    } else {
                        _claudeHistoryBackup = [];
                    }
                    renderHistoryList();
                    debouncedSave();
                });
            });


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
        if (char === 'claude') {
            return isClaudeRoom ? IRIS_STATE.history : _claudeHistoryBackup;
        }
        if (char === 'iris') {
            if (isClaudeRoom) return _irisHistoryBackup;
            return is404Room ? _irisHistoryBackup : IRIS_STATE.history;
        }
        // cheshire
        if (isClaudeRoom) return _cheshireHistoryBackup;
        return is404Room ? IRIS_STATE.history  : _cheshireHistoryBackup;
    }

    function setCharHistory(char, newHistory) {
        if (char === 'claude') {
            if (isClaudeRoom) IRIS_STATE.history       = newHistory;
            else              _claudeHistoryBackup     = newHistory;
            // Claude 歷史也要同步寫回 ClaudeTerminal os_db（API 真實 context）
            if (window.ClaudeTerminal && typeof window.ClaudeTerminal.saveHistory === 'function') {
                const apiHist = newHistory.map(m => ({
                    role: m.role, content: m.content, timestamp: m.ts || m.timestamp || Date.now()
                }));
                window.ClaudeTerminal.saveHistory(apiHist);
            }
            debouncedSave();
            return;
        }
        if (char === 'iris') {
            if (isClaudeRoom)      _irisHistoryBackup = newHistory;
            else if (is404Room)    _irisHistoryBackup = newHistory;
            else                   IRIS_STATE.history = newHistory;
        } else {
            if (isClaudeRoom)      _cheshireHistoryBackup = newHistory;
            else if (is404Room)    IRIS_STATE.history     = newHistory;
            else                   _cheshireHistoryBackup = newHistory;
        }
        debouncedSave();
    }

    function openHistoryPanel(char) {
        _historyPanel.char = char;
        const overlay = document.getElementById('iris-history-overlay');
        if (!overlay) return;
        const badgeEl = document.getElementById('hist-char-badge');
        const newConvBtn = document.getElementById('hist-new-claude-conv');
        if (char === 'iris') {
            if (badgeEl) { badgeEl.className = 'hist-char-badge iris'; badgeEl.textContent = '瀅瀅'; badgeEl.style.color = '#FBDFA2'; badgeEl.style.borderColor = '#FBDFA2'; badgeEl.style.background = 'rgba(251,223,162,0.2)'; }
            if (newConvBtn) newConvBtn.style.display = 'none';
        } else if (char === 'claude') {
            if (badgeEl) { badgeEl.className = 'hist-char-badge claude'; badgeEl.textContent = '☕ Claude'; badgeEl.style.color = '#D95122'; badgeEl.style.borderColor = '#D95122'; badgeEl.style.background = 'rgba(217,81,34,0.18)'; }
            if (newConvBtn) newConvBtn.style.display = '';
        } else {
            if (badgeEl) { badgeEl.className = 'hist-char-badge cheshire'; badgeEl.textContent = '柴郡 · 404'; badgeEl.style.color = '#00ff41'; badgeEl.style.borderColor = '#00ff41'; badgeEl.style.background = 'rgba(0,255,65,0.2)'; }
            if (newConvBtn) newConvBtn.style.display = 'none';
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
        const isClaude   = _historyPanel.char === 'claude';
        history.forEach((msg, index) => {
            const isUser        = msg.role === 'user';
            const aiName        = isClaude ? 'Claude' : (isCheshire ? '柴郡' : '瀅瀅');
            const roleLabel     = isUser ? (IRIS_STATE.userName || 'USER') : aiName;
            const safeText      = msg.content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

            const item = document.createElement('div');
            item.className = 'hist-item';
            item.dataset.index = index;
            // 替換顏色：USER 走拿鐵金，AI 依角色配色
            let badgeStyle = isUser ? `background: rgba(251,223,162,0.2); color:#FBDFA2; border:1px solid #FBDFA2;` :
                             isClaude ? `background: rgba(217,81,34,0.18); color:#D95122; border:1px solid #D95122;` :
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

    VoidTerminal.closePanel = () => {};
    VoidTerminal.panelBack  = () => {};

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
        // 泡泡不自動消失，由 addFeedEntry 超限時移除最舊一條
    }

    // ===== 🦀 Claude 房間（獨立對話接口） =====
    async function enterClaudeRoom() {
        if (isClaudeRoom) return;

        // 把當前場景的 history 寫回對應 backup
        if (is404Room) _cheshireHistoryBackup = [...IRIS_STATE.history];
        else           _irisHistoryBackup     = [...IRIS_STATE.history];

        // 切到 Claude（404 跟 Claude 互斥）
        is404Room = false;
        isClaudeRoom = true;

        // 從 os_db studio_chats 載入真實 Claude 歷史（跨 chat 共用同一份）
        if (window.ClaudeTerminal && typeof window.ClaudeTerminal.loadHistory === 'function') {
            try {
                const claudeHist = await window.ClaudeTerminal.loadHistory();
                IRIS_STATE.history = (claudeHist || []).map(m => ({
                    role: m.role, content: m.content, ts: m.timestamp || Date.now()
                }));
            } catch(e) {
                IRIS_STATE.history = [..._claudeHistoryBackup];
            }
        } else {
            IRIS_STATE.history = [..._claudeHistoryBackup];
        }

        const tab = document.getElementById('aurelia-home-tab');
        if (!tab) return;

        // 切場動畫（沿用 glitch1）
        new Audio('https://nancywang3641.github.io/aurelia/sound_effect/glitch1.mp3').play().catch(() => {});
        tab.classList.add('glitch-crash');
        const avatar = document.getElementById('iris-avatar');
        if (avatar) { avatar.style.opacity = '0'; }

        setTimeout(() => {
            tab.classList.remove('glitch-crash');
            VoidClaudeRoom.applyRoomUi();

            // 把歷史 render 成氣泡列表；無歷史就丟一條歡迎詞
            VoidClaudeRoom.hydrateStream();
            if (IRIS_STATE.history.length === 0) {
                VoidClaudeRoom.renderBubble('assistant', '在這裡，我跟妳的對話跟外面是兩條線。妳說什麼吧。');
            }

            _updatePortalBtn();
            VoidClaudeRoom.updatePortalBtn();
            stopIdleTimer(); // Claude 場景不要放置語音
            debouncedSave();
        }, 580);
    }

    function exitClaudeRoom() {
        if (!isClaudeRoom) return;

        // 寫回 Claude 歷史備份
        _claudeHistoryBackup = [...IRIS_STATE.history];

        // 還原瀅瀅場景
        isClaudeRoom = false;
        is404Room = false;
        IRIS_STATE.history = [..._irisHistoryBackup];

        const tab = document.getElementById('aurelia-home-tab');
        if (!tab) return;

        new Audio('https://nancywang3641.github.io/aurelia/sound_effect/glitch1.mp3').play().catch(() => {});
        tab.classList.add('glitch-crash');
        const avatarR = document.getElementById('iris-avatar');
        if (avatarR) { avatarR.style.opacity = '0'; }

        setTimeout(() => {
            tab.classList.remove('glitch-crash');
            tab.classList.remove('mode-claude');

            // 還原拿鐵棕背景
            const bg = tab.querySelector('.void-bg');
            if (bg) bg.style.backgroundColor = '#452216';

            VoidAmbient.switchBgm('lobby');

            if (avatarR) {
                avatarR.onerror = function(){ this.style.display='none'; };
                avatarR.src = URLS.IRIS_AVATAR;
                avatarR.title = '戳戳 瀅瀅';
                avatarR.style.display = '';
                requestAnimationFrame(() => { requestAnimationFrame(() => { avatarR.style.opacity = '1'; }); });
            }

            const titleEl = document.getElementById('home-chat-title');
            if (titleEl) titleEl.textContent = 'Parallax Archive & Cafe';
            const inputField = document.getElementById('iris-input');
            if (inputField) {
                inputField.placeholder = '提供故事素材或與瀅瀅對話...';
                inputField.style.background = 'rgba(120,55,25,0.8)';
                inputField.style.borderColor = 'rgba(251,223,162,0.3)';
                inputField.style.color = '#FFF8E7';
            }
            const nameBox = document.getElementById('iris-name-tag');
            if (nameBox) { nameBox.style.display = 'block'; const _s=nameBox.querySelector('span'); if(_s) _s.textContent='瀅瀅'; }

            const irisHistBtn     = document.getElementById('iris-hist-btn');
            const cheshireHistBtn = document.getElementById('cheshire-hist-btn');
            const claudeHistBtn2  = document.getElementById('claude-hist-btn');
            if (irisHistBtn) irisHistBtn.style.display = '';
            if (cheshireHistBtn) cheshireHistBtn.style.display = 'none';
            if (claudeHistBtn2) claudeHistBtn2.style.display = 'none';

            const layer = document.getElementById('void-bubble-layer');
            if (layer) { layer.innerHTML = ''; layer.dataset.nextSlot = '2'; }

            playIrisSequence("[Nar|月光褪去，咖啡香氣重新瀰漫。]\n[Char|瀅瀅|smile|「歡迎回來，委託人。剛剛去散步了？」]");

            _updatePortalBtn();
            VoidClaudeRoom.updatePortalBtn();
            startIdleTimer();
            debouncedSave();
        }, 580);
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
            VoidAmbient.switchBgm('404');

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
            if (nameBox) { nameBox.style.display = 'block'; const _s=nameBox.querySelector('span'); if(_s) _s.textContent='CHESHIRE / 柴郡'; }

            const irisHistBtn404 = document.getElementById('iris-hist-btn');
            const cheshireHistBtn404 = document.getElementById('cheshire-hist-btn');
            const claudeHistBtn404 = document.getElementById('claude-hist-btn');
            if (irisHistBtn404) irisHistBtn404.style.display = 'none';
            if (cheshireHistBtn404) cheshireHistBtn404.style.display = '';
            if (claudeHistBtn404) claudeHistBtn404.style.display = 'none';

            const layer = document.getElementById('void-bubble-layer');
            if (layer) { layer.innerHTML = ''; addFeedEntry('SYS', 'SYSTEM COMPROMISED'); }

            const nav404 = document.getElementById('aurelia-bottom-nav');
            if (nav404) {
                nav404.classList.add('mode-404');
                nav404.querySelectorAll('.nav-button').forEach(btn => btn.classList.remove('active-gold'));
            }
            document.getElementById('aurelia-phone-screen')?.classList.add('mode-404');

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
            VoidAmbient.switchBgm('lobby');

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
            if (nameBox) { nameBox.style.display = 'block'; const _s=nameBox.querySelector('span'); if(_s) _s.textContent='瀅瀅'; }

            const irisHistBtnRestore = document.getElementById('iris-hist-btn');
            const cheshireHistBtnRestore = document.getElementById('cheshire-hist-btn');
            const claudeHistBtnRestore = document.getElementById('claude-hist-btn');
            if (irisHistBtnRestore) irisHistBtnRestore.style.display = '';
            if (cheshireHistBtnRestore) cheshireHistBtnRestore.style.display = 'none';
            if (claudeHistBtnRestore) claudeHistBtnRestore.style.display = 'none';

            const layer = document.getElementById('void-bubble-layer');
            if (layer) { layer.innerHTML = ''; layer.dataset.nextSlot = '2'; }

            const navRestore = document.getElementById('aurelia-bottom-nav');
            if (navRestore) {
                navRestore.classList.remove('mode-404');
                navRestore.querySelectorAll('.nav-button').forEach(btn => {
                    const isHome = btn.dataset.navId === 'nav-home';
                    if (isHome) { btn.classList.add('active-gold'); }
                    else { btn.classList.remove('active-gold'); }
                });
            }
            document.getElementById('aurelia-phone-screen')?.classList.remove('mode-404');

            playIrisSequence("[Nar|風鈴聲重新充滿空間，干擾消散，視差書咖恢復了寧靜的氛圍。]\n[Audio|https://nancywang3641.github.io/sound-files/home-page/YING_3.wav]\n[Char|瀅瀅|think|「...（晃了晃腦袋）咦？剛剛好像有一陣奇怪的偏頭痛，就像是宇宙射線穿過了我的腦電波一樣！真是太棒的寫作素材了！歡迎回來，委託人。」]");
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
            if (IRIS_STATE.currentMsg && IRIS_STATE.currentMsg.type === 'Nar') textContent.innerHTML = `<span style="color:${is404Room ? '#8effb8' : '#5c3a28'}; font-style:italic;">${IRIS_STATE.fullText}</span>`;
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
        else { nameBox.style.display = 'block'; const _s=nameBox.querySelector('span'); if(_s) _s.textContent=msg.name; IRIS_STATE.fullText = msg.text; }

        IRIS_STATE.isTyping = true; textContent.innerHTML = '';
        let i = 0; const speed = 25;

        IRIS_STATE.timer = setInterval(() => {
            if (i < IRIS_STATE.fullText.length) {
                let partial = IRIS_STATE.fullText.substring(0, i + 1);
                if (msg.type === 'Nar') textContent.innerHTML = `<span style="color:${is404Room ? '#8effb8' : '#5c3a28'}; font-style:italic;">${partial}</span>`;
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

    // ===== 時間隔工具函式（注入 AI context 用，不做 UI）=====
    function _fmtClock(ts) {
        const d = new Date(ts);
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        return `${hh}:${mm}`;
    }
    function _fmtGap(msAgo) {
        const s = Math.floor(msAgo / 1000);
        if (s < 60)  return '剛剛';
        const m = Math.floor(s / 60);
        if (m < 60)  return `${m} 分鐘前`;
        const h = Math.floor(m / 60);
        if (h < 24)  return `${h} 小時前`;
        const days = Math.floor(h / 24);
        return `${days} 天前`;
    }
    // 回傳要插入 sysPrompt 的時間紀錄字串，沒有歷史則回傳空字串
    function _buildTimeCtx() {
        const hist = IRIS_STATE.history;
        let lastTs = null;
        for (let i = hist.length - 1; i >= 0; i--) {
            if (hist[i].ts) { lastTs = hist[i].ts; break; }
        }
        if (!lastTs) return '';
        return `【時間記錄】距上次對話：${_fmtGap(Date.now() - lastTs)}（上次：${_fmtClock(lastTs)}，僅供參考，自然融入即可）`;
    }

    async function sendIrisMessage() {
        const input = document.getElementById('iris-input');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;

        // 🦀 Claude 房間獨立分支：走 cc-bridge / OpenAI 兼容、跟瀅瀅柴郡完全隔離
        if (isClaudeRoom) {
            input.value = '';
            return VoidClaudeRoom.sendMessage(text);
        }

        startIdleTimer();

        if (text.toUpperCase() === 'ERR_404') { input.value = ''; enter404Room(); return; }
        if (is404Room && text.toUpperCase() === 'SYS_RESTORE') {
            input.value = '';
            playIrisSequence("[Nar|馬賽克雜訊短暫浮現在柴郡的輪廓邊緣，他懶洋洋地抬起一根手指。]\n[Char|柴郡|smirk|......用作弊碼回去，真沒意思。門開了。別讓我後悔打開它。]");
            setTimeout(() => restoreLobby(), 3500);
            return;
        }

        input.value = '';
        IRIS_STATE.history.push({ role: 'user', content: text, ts: Date.now() });

        // 確保發送消息時隱藏閒聊，還原主線
        if (_reactionTimer) { clearInterval(_reactionTimer); _reactionTimer = null; }
        if (_reactionHideTimer) { clearTimeout(_reactionHideTimer); _reactionHideTimer = null; }
        if (_currentVoice) { _currentVoice.pause(); _currentVoice.currentTime = 0; _currentVoice = null; }
        _hideReactionBox();

        const box = document.getElementById('iris-text');
        const nameBox = document.getElementById('iris-name-tag');
        if (nameBox) nameBox.style.display = 'none';
        box.innerHTML = `<span style="color:${is404Room ? '#00cc33' : '#5c3a28'}; font-style:italic;">${is404Room ? '(404::柴郡思考中...)' : '(瀅瀅咬著羽毛筆思索中...)'}</span>`;

        if (!window.OS_API) {
            playIrisSequence("[Nar|(系統斷線：無法連接到 LUNA-VII 認知引擎)]\n[Char|瀅瀅|error|「抱歉，委託人，我好像找不到這段劇情的靈感了（無網路連線）。」]");
            return;
        }

        try {
            const irisSupplement    = (window.OS_PROMPTS ? window.OS_PROMPTS.get('iris_system')    : '') || '';
            const cheshireSupplement = (window.OS_PROMPTS ? window.OS_PROMPTS.get('cheshire_system') : '') || '';
            const currentUserName = IRIS_STATE.userName || '未知';
            const lobbyTemplateSec = await VoidCanvas.buildTemplateCtx();

            const sysPrompt = VoidPrompts.buildSysPrompt(is404Room ? 'cheshire' : 'iris', {
                userName: currentUserName,
                visit404Count,
                timeCtx: _buildTimeCtx(),
                lobbyTemplateSec,
                supplement: is404Room ? cheshireSupplement : irisSupplement,
                justReturnedFrom404: _justReturnedFrom404,
            });

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

            // 直連 API 才能用 SSE streaming，ST system API 走原有非串流路徑
            const canStream = !config.useSystemApi && !!config.url && !!config.key;

            const response = await new Promise((resolve, reject) => {
                window.OS_API.chat(
                    messages, config,
                    null,       // onChunk 不顯示 raw text，避免程式碼/標籤噴出來後又重播
                    resolve, reject,
                    canStream ? { useRealStream: true } : {}
                );
            });
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

            // 1. 舊 Panel 標籤已廢棄
            reply = reply.replace(/\[Panel\|[^\]]*\]/g, '').replace(/\[PanelItem\|[^\]]*\]/g, '').replace(/\[PanelDetail\|[^\]]*\]/g, '').trim();

            // 1.5 大廳畫布面板解析（存 pending，對話結束後再顯示）
            _pendingLobbyRender = null;
            const lobbyPanelData = VoidCanvas.parseLobbyPanel(reply);
            if (lobbyPanelData) {
                reply = reply.replace(/<lobbyPanel>[\s\S]*?<\/lobbyPanel>/i, '').trim();
                _pendingLobbyRender = () => VoidCanvas.renderPanel(lobbyPanelData);
            }

            // 1.6 大廳模板快捷調用解析
            if (!_pendingLobbyRender) {
                const lobbyTplMatch = reply.match(/<lobbyTemplate>([\s\S]*?)<\/lobbyTemplate>/i);
                if (lobbyTplMatch) {
                    const tplTagId = lobbyTplMatch[1].trim();
                    reply = reply.replace(/<lobbyTemplate>[\s\S]*?<\/lobbyTemplate>/i, '').trim();
                    _pendingLobbyRender = () => VoidCanvas.renderTemplate(tplTagId);
                }
            }

            // 1.7 偵測任意已安裝的 VN 區塊標籤 <tagId>...</tagId>
            if (!_pendingLobbyRender) {
                const db = window.OS_DB;
                if (db && typeof db.getAllVNTagTemplates === 'function') {
                    const templates = await db.getAllVNTagTemplates();
                    const active = templates.filter(t => (t.isActive || t.lobbyEnabled) && t.isBlock && t.tagId);
                    for (const tpl of active) {
                        const safeId = tpl.tagId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const re = new RegExp(`<${safeId}>([\\s\\S]*?)<\\/${safeId}>`, 'i');
                        const m = reply.match(re);
                        if (m) {
                            const lines = m[1].split('\n').map(l => l.trim()).filter(Boolean);
                            reply = reply.replace(m[0], '').trim();
                            const capturedTpl = tpl;
                            const capturedLines = lines;
                            _pendingLobbyRender = () => {
                                const overlay = document.getElementById('lobby-canvas-overlay');
                                const content = document.getElementById('lca-content');
                                const titleEl = document.getElementById('lca-title');
                                if (!overlay || !content) return;
                                const styleId = 'lobby-panel-style';
                                let styleEl = document.getElementById(styleId);
                                if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = styleId; document.head.appendChild(styleEl); }
                                styleEl.textContent = capturedTpl.css || '';
                                content.innerHTML = capturedTpl.html || '';
                                if (titleEl) titleEl.textContent = capturedTpl.usageDesc || `🎮 ${capturedTpl.tagId}`;
                                overlay.style.display = 'flex';
                                const area = document.getElementById('lobby-canvas-area');
                                if (area) area.style.animation = 'lcaSlideIn 0.3s ease';
                                if (capturedTpl.js) {
                                    const LP3 = VoidCanvas.makeLobbyPanelAPI();
                                    window.__LP = LP3;
                                    try {
                                        const fn = new Function('container', 'lines', 'onComplete', 'LP', capturedTpl.js);
                                        fn(content, capturedLines, VoidCanvas.closeCanvas, LP3);
                                    } catch(e) { console.error('[VNBlock]', e); }
                                    VoidCanvas.rewireOnclicks(content, LP3);
                                }
                            };
                            break;
                        }
                    }
                }
            }

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

            IRIS_STATE.history.push({ role: 'assistant', content: reply, ts: Date.now() });
            debouncedSave();

            // 播放對話，完成後檢查是否需要打開面板
            playIrisSequence(reply, () => {
                if (shouldLaunchApp && window.AureliaControlCenter) {
                    setTimeout(() => {
                        window.AureliaControlCenter.launchGameApp(shouldLaunchApp);
                    }, 500);
                }
                // 對話跑完後才彈出面板，不遮對話
                if (_pendingLobbyRender) {
                    setTimeout(() => {
                        _pendingLobbyRender();
                        _pendingLobbyRender = null;
                    }, 300);
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

    // ===== 導出全局介面 =====
    // 暴露到外層，讓其他面板 (如 QB_CORE, IDOL_CORE) 能夠調用
    VoidTerminal.playSequence = playIrisSequence;

    VoidTerminal.logout = function() {
        IRIS_STATE.userName = '';
        const t = document.getElementById('aurelia-home-tab');
        if (t) showLoginScreen(t);
    };

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
    VoidTerminal.openStorePanel = () => VoidPanels.openStore();

    // 供 OS_ACHIEVEMENT 回呼：刷新已開啟的成就面板
    VoidTerminal.refreshAchievementPanel = () => VoidPanels.refreshAchievement();

    // ===== 內部橋（給 core/void/ 子模組借用核心狀態與函式）=====
    function resetActiveHistory() {
        IRIS_STATE.history = [];
        _irisHistoryBackup = [];
        _cheshireHistoryBackup = [];
    }
    VoidTerminal._bridge = {
        // claude-room.js
        activeHistory: () => IRIS_STATE.history,
        scheduleSave:  () => debouncedSave(),
        isClaudeRoom:  () => isClaudeRoom,
        // canvas.js
        is404: () => is404Room,
        // ambient.js
        isActivitySuspended: () => _isActivitySuspended,
        // login.js
        loadLobbyHistory:      (id) => loadLobbyHistory(id),
        saveLobbyHistory:      () => saveLobbyHistory(),
        applyLoadedLobbyState: () => _applyLoadedLobbyState(),
        getChatId:             () => getChatId(),
        applyLayoutMode:       () => applyLayoutMode(),
        setCurrentChatId:      (id) => { _currentChatId = id; },
        setUserName:           (v) => { IRIS_STATE.userName = v; },
        resetActiveHistory:    () => resetActiveHistory(),
    };

    console.log('✅ 大廳敘事引擎 (VoidTerminal) 模組就緒 (大廳書櫃整合版)');

})(window.VoidTerminal = window.VoidTerminal || {});