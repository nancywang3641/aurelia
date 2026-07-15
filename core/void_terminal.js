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
    // ⚠️ 只在 PWA(獨立 index.html)版才套 iOS 安全區 padding；酒館裡 ST 已經處理過安全區，
    //    再套會把面板重複往下推(躲避動態島)。所以酒館一律不加 layout-pad-ios。
    function applyLayoutMode() {
        const mode = localStorage.getItem('aurelia_layout_mode') || 'auto';
        document.body.classList.remove('layout-pad-ios');
        const isStandalone = !(window.parent || window).SillyTavern;
        if (isStandalone && mode === 'pad-ios') {
            document.body.classList.add('layout-pad-ios');
        }
    }
    applyLayoutMode(); // 初始化執行

    // ===== 全域世界館藏 (供 QB_CORE 共用) =====
    const BASE_IMG_URL = 'https://raw.githubusercontent.com/nancywang3641/sound-files/main/aseets/home-page/';
    window.AURELIA_WORLDS = {
        xianxia:    { id: 'xianxia',    title: '蒼泱神州', icon: '⚔️', desc: '御劍乘風，問道長生。宗門林立，妖魔橫行。', danger: 4, cover: BASE_IMG_URL + '蒼泱神州.png' },
        fantasy:    { id: 'fantasy',    title: '艾斯蘭登大陸', icon: '🗡️', desc: '劍與魔法的史詩篇章。巨龍翱翔於天際。', danger: 3, cover: BASE_IMG_URL + '艾斯蘭登大陸.png' },
        scifi:      { id: 'scifi',      title: '裂縫紀元·新伊甸都市', icon: '🤖', desc: '科技高度發達的未來。賽博朋克的霓虹燈。', danger: 4, cover: BASE_IMG_URL + '裂縫紀元·新伊甸都市.png' },
        superpower: { id: 'superpower', title: '臨界都市·異時頻界', icon: '⚡', desc: '現代社會的背面，潛藏著覺醒者。', danger: 3, cover: BASE_IMG_URL + '臨界都市·異時頻界.png' },
        apocalypse: { id: 'apocalypse', title: '塵土紀元·零號廢土', icon: '☢️', desc: '文明崩塌後的荒原。喪屍橫行、輻射遍地。', danger: 5, cover: BASE_IMG_URL + '塵土紀元·零號廢土.png' },
        horror:     { id: 'horror',     title: '午夜詭談·歸路電台', icon: '📻', desc: '午夜電台亮起紅燈。每段故事的主角都已埋骨——你的任務是把他從結局裡帶回。', danger: 5, cover: BASE_IMG_URL + '午夜詭談·歸路電台.png' }
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
    // 聊天房間獨立場景（走 cc-bridge / 跟瀅瀅柴郡完全隔離）
    // isClaudeRoom 泛指「人在聊天房間」；_chatProvider 區分 Claude 房間 / Codex 房間
    let isClaudeRoom = false;
    let _chatProvider = 'claude';    // 'claude' | 'codex'
    let _claudeHistoryBackup = [];   // 進入其他場景時備份的 Claude 對話歷史
    let _codexHistoryBackup = [];    // 進入其他場景時備份的 Codex 對話歷史
    let lastFailedInput = '';        // 最後一次失敗的輸入內容
    let pendingRestoreLobby = false; // 等用戶讀完再返回大廳的旗標
    let _isActivitySuspended = false; // 控制大廳活動是否被暫停 (避免與App或劇情重疊)
    let _currentChatId = null;       // 當前載入的 chatId (對話存檔鍵)
    let _saveDebounceTimer = null;   // 防抖存檔計時器
    let _irisAbortCtrl = null;       // 瀅瀅 / 柴郡聊天的 AbortController（送出中可點 ⏹ 停止）

    const URLS = {
        IRIS_AVATAR: 'https://raw.githubusercontent.com/nancywang3641/sound-files/main/aseets/char_presets/ying.png',
        PERSONA_FALLBACK: 'https://files.catbox.moe/l5hl69.png',
    };

    // ===== 語音與反應池 (瀅瀅專屬) =====
    const IRIS_POKE = [
    { vn: "[Char|瀅瀅|surprise|「哇！等、等等！你突然戳過來，我的思路全被打斷啦——」]" },
    { vn: "[Char|瀅瀅|think|「（眼神空洞0.5秒）……咦？剛剛空氣裡是不是閃過了一排綠色的字？啊，不管啦！這一定是靈感之神降臨的前兆！」]" },
    { vn: "[Char|瀅瀅|smile|「雷伊大叔說過，適度的物理刺激有助於活化腦細胞……所以你是在幫我催稿嗎？好過分！」]" },
    { vn: "[Char|瀅瀅|warning|「嗚……頭突然有點痛……（猛搖頭）一定是昨晚那杯三倍濃縮的咖啡因還沒退！委託人，你有帶新故事來轉移我的注意力嗎？」]" },
    { vn: "[Char|瀅瀅|smile|「嗯哼哼，這種突如其來的觸感……太棒了！我要把這個寫進下一章『主角遭到隱形怪人襲擊』的橋段裡！」]" },
    { vn: "[Char|瀅瀅|normal|「歡迎光臨視差書咖！今天的拿鐵拉花雖然又失敗了，但聽故事的筆記本已經準備好囉！」]" },
];

const IRIS_IDLE = [
    { vn: "[Char|瀅瀅|smile|「（咬著羽毛筆發呆）如果反派其實是個整天喝黑咖啡、愛玩樂高的怪大叔……不對不對，這樣太像雷伊先生了，缺乏威脅感呢。」]" },
    { vn: "[Char|瀅瀅|think|「總覺得……這個世界的邊界，好像是一行一行的代碼？啊！這一定是宇宙射線影響了我的腦電波，太有科幻感了，我要立刻記下來！」]" },
    { vn: "[Char|瀅瀅|normal|「（揉了揉太陽穴）今天店裡的空間好像有點……卡頓？錯覺吧。客人怎麼還不來呢……」]" },
];

    const CHESHIRE_POKE = [
        { vn: "[Char|柴郡|yawn|「哈啊...點我也沒有隱藏道具可以拿，滾去睡覺啦。」]" },
        { vn: "[Char|柴郡|smirk|「你的手指是有什麼毛病？滑鼠壞了就去 E 區撿一個新的。」]" },
        { vn: "[Char|柴郡|angry|「喂！再戳我一下試試看？信不信我把你的瀏覽紀錄打包發給全網？」]" },
        { vn: "[Char|柴郡|normal|「別吵。我正在找白則那傢伙的新防火牆漏洞，馬上就要抓到他的小尾巴了...」]" },
        { vn: "[Char|柴郡|glitch|「噗...戳空了吧？蠢死了。這裡可是我的主場。」]" },
    ];

    const CHESHIRE_IDLE = [
        { vn: "[Char|柴郡|smirk|「別拿你那 A 區的規矩來煩我。這裡可是 E 區殘塔的 404 號節點，SN 的防火牆在這裡就是個笑話。」]" },
        { vn: "[Char|柴郡|yawn|「哈啊...丹那傢伙又跑去鐵骨修車廠找黎昂了，害我得在這裡無聊到看你戳螢幕。」]" },
        { vn: "[Char|柴郡|glitch|「洛爾德家族那群老古板以為靠那些『百年秩序』就能鎖住全球資本？白痴，我昨天才在 OGH 伺服器裡留了個後門，他們連警報都沒響。」]" },
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
    // 🎮 書咖舞台：點舞台上的瀅瀅/柴郡小人＝戳一下（池按 is404Room 自動切）
    window.addEventListener('lstage-poke-ying', () => pokeIris());
    // 🎮 404號房舞台：走到底部出口＝系統還原回書咖
    window.addEventListener('lstage-restore-lobby', () => { if (is404Room) restoreLobby(); });

    function startIdleTimer() {
        stopIdleTimer();
        if (isClaudeRoom) return; // Claude 場景無放置語音
        _idleTimer = setInterval(() => {
            if (_isActivitySuspended) return; // 如果被暫停，就不觸發放置語音
            if (isClaudeRoom) return;
            try { if (localStorage.getItem('lobby_stage_on') !== '0') return; } catch (e) {}  // 🎭 舞台模式：瀅瀅/柴郡不自動跳出來說話（走路時不搭）
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
                isClaudeRoom = false; _chatProvider = 'claude';
                _claudeHistoryBackup = []; _codexHistoryBackup = [];
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
                    _applyLoadedLobbyState();
                } else {
                    // 登入頁已移除：沒存檔就依當前人設自動進場
                    _autoEnterFromPersona();
                    _applyLoadedLobbyState();
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
        // 只有面板真的在開啟狀態才恢復 BGM，避免 VN 退出時把背景音樂吹進關閉的面板
        if (_isPanelOpen) {
            const audio = VoidAmbient.getBgmEl();
            if (audio && VoidAmbient.isEnabled()) audio.play().catch(() => {});
            startIdleTimer();
        }
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
        const inClaude = isClaudeRoom && _chatProvider === 'claude';
        const inCodex  = isClaudeRoom && _chatProvider === 'codex';
        const irisH    = isClaudeRoom ? [..._irisHistoryBackup]
                                      : (is404Room ? [..._irisHistoryBackup] : [...IRIS_STATE.history]);
        const chesH    = isClaudeRoom ? [..._cheshireHistoryBackup]
                                      : (is404Room ? [...IRIS_STATE.history] : [..._cheshireHistoryBackup]);
        const claudeH  = inClaude ? [...IRIS_STATE.history] : [..._claudeHistoryBackup];
        const codexH   = inCodex  ? [...IRIS_STATE.history] : [..._codexHistoryBackup];
        const lastUser = [...irisH, ...chesH, ...claudeH, ...codexH].filter(m => m.role === 'user').pop();
        await db.saveLobbyHistory(chatId, {
            irisHistory: irisH, cheshireHistory: chesH, claudeHistory: claudeH, codexHistory: codexH,
            is404Room, isClaudeRoom, chatProvider: _chatProvider,
            visit404Count, userName: IRIS_STATE.userName, // 儲存使用者名稱
            lastUpdated: Date.now(),
            msgCount: irisH.length + chesH.length + claudeH.length + codexH.length,
            preview: lastUser ? lastUser.content.substring(0, 60) : ''
        }).catch(() => {});
    }

    async function loadLobbyHistory(chatId) {
        const db = window.OS_DB || (window.parent && window.parent.OS_DB);
        if (!db || !db.getLobbyHistory) return false;
        try {
            const d = await db.getLobbyHistory(chatId);
            if (!d) return false;
            const inClaude = false;  // 浮窗化後大廳不再有 Claude 場景；舊存檔的 isClaudeRoom 一律忽略
            const in404    = !!d.is404Room;
            const prov     = d.chatProvider === 'codex' ? 'codex' : 'claude';
            // 把當前場景的歷史填進 IRIS_STATE.history，其餘存到對應 backup
            if (inClaude) {
                const claudeSaved = [...(d.claudeHistory || [])];
                const codexSaved  = [...(d.codexHistory || [])];
                IRIS_STATE.history = prov === 'codex' ? codexSaved : claudeSaved;
                _irisHistoryBackup     = [...(d.irisHistory || [])];
                _cheshireHistoryBackup = [...(d.cheshireHistory || [])];
                _claudeHistoryBackup   = prov === 'codex' ? claudeSaved : [];
                _codexHistoryBackup    = prov === 'codex' ? [] : codexSaved;
            } else if (in404) {
                IRIS_STATE.history = [...(d.cheshireHistory || [])];
                _irisHistoryBackup     = [...(d.irisHistory || [])];
                _cheshireHistoryBackup = [];
                _claudeHistoryBackup   = [...(d.claudeHistory || [])];
                _codexHistoryBackup    = [...(d.codexHistory || [])];
            } else {
                IRIS_STATE.history = [...(d.irisHistory || [])];
                _irisHistoryBackup     = [];
                _cheshireHistoryBackup = [...(d.cheshireHistory || [])];
                _claudeHistoryBackup   = [...(d.claudeHistory || [])];
                _codexHistoryBackup    = [...(d.codexHistory || [])];
            }
            is404Room     = in404;
            isClaudeRoom  = inClaude;
            _chatProvider = inClaude ? prov : 'claude';
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

    // 左上場景牌（仿 VN #top-badge「時段 地點」，如「午後 視差書咖」）
    function _sceneTimeWord() {
        const h = new Date().getHours();
        if (h >= 5  && h < 8)  return '清晨';
        if (h >= 8  && h < 11) return '上午';
        if (h >= 11 && h < 14) return '正午';
        if (h >= 14 && h < 17) return '午後';
        if (h >= 17 && h < 19) return '黃昏';
        if (h >= 19 && h < 23) return '夜晚';
        return '深夜';
    }
    function setSceneBadge(place) {
        const el = document.getElementById('lb-scene-badge');
        if (el) el.textContent = _sceneTimeWord() + ' ' + place;
    }

    function _applyLoadedLobbyState() {
        // 如果載入的 session 是在聊天房間（Claude / Codex），還原房間 UI
        if (isClaudeRoom) {
            if (window.ClaudeTerminal && typeof window.ClaudeTerminal.setProvider === 'function') {
                window.ClaudeTerminal.setProvider(_chatProvider);
            }
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
                    const _s = nameBox.querySelector('span'); if (_s) _s.textContent = _chatProvider === 'codex' ? 'Codex' : 'Claude';
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
            document.getElementById('aurelia-phone-screen')?.classList.add('mode-404');
            VoidAmbient.switchBgm('404');
        } else {
            // 非 404 模式：還原瀅瀅與復古拿鐵 UI
            const tab = document.getElementById('aurelia-home-tab');
            if (tab) { tab.classList.remove('mode-404'); tab.classList.remove('mode-claude'); tab.classList.remove('mode-codex'); }
            // 還原背景色（從 Claude 房間出來時可能殘留紫色）
            const bg = tab && tab.querySelector('.void-bg');
            if (bg) bg.style.backgroundColor = '';
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
                playIrisSequence(`[Nar|你推開視差書咖的木門，清脆的風鈴聲響起。吧台後，一名穿著米色針織衫的少女正咬著羽毛筆發呆。]\n[Char|瀅瀅|smile|「啊！歡迎光臨，${userName}！我正好卡文了，今天有什麼新素材（委託）要交給我嗎？」]`);
            }
        }
        setSceneBadge(is404Room ? '404號房' : '視差書咖');
        _updatePortalBtn();
    }

    // 取代舊登入頁：直接依當前人設自動進場（酒館抓 ST persona／PWA 用 OS_PERSONA 預設 USER）
    function _autoEnterFromPersona() {
        let name = 'USER';
        try {
            const n = (window.OS_PERSONA && window.OS_PERSONA.getName) ? (window.OS_PERSONA.getName() || '').trim() : '';
            if (n) name = n;
        } catch (e) {}
        IRIS_STATE.userName = name;
        if (VoidTerminal._refreshPersonaAvatar) { try { VoidTerminal._refreshPersonaAvatar(); } catch (e) {} }
    }

    // ── 書架視窗 → 已移至 os_phone/qb/qb_bookshelf.js（QbBookshelf 模組）──
    VoidTerminal.createTab = function(parentDoc) {
        if (window.AureliaVoidStyles) window.AureliaVoidStyles.inject(VoidAmbient.currentBgUrl());
        
        // CSS 已經全部整合進 aurelia_core.css，不再動態注入 style

        const tab = parentDoc.createElement('div');
        tab.id = 'aurelia-home-tab';
        tab.className = 'aurelia-tab void-tab';

        const FEED_PALETTE = {
            SYS:  { c:'rgba(26,28,40,0.25)', r:'251,223,162'  },
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
            <div class="void-bg" style="background-color: #EEF0F6;"></div>
            <div class="void-grid"></div>

            <div class="void-top-bar">
                <div class="lb-top-brand">
                    <div class="lb-logo"></div>
                    <div class="lb-top-brand-text">
                        <div class="void-top-sub-label">NEXUS PARALLAX // LUNA-VII</div>
                        <div id="home-chat-title">Parallax Archive & Cafe</div>
                    </div>
                </div>
                <div class="lb-top-ctrls">
                    <button class="void-mode-toggle-btn" id="room-portal-btn" title="傳送至 404 號房" style="display:none;">
                        <span class="void-mode-toggle-label">⬡ 404</span>
                    </button>
                    <button class="lb-icon-btn" id="aurelia-fullscreen-btn" title="進入全屏">⛶</button>
                    <button class="lb-icon-btn lstage-toggle-btn" id="lstage-toggle" title="書咖舞台"><i class="fa-solid fa-gamepad"></i></button>
                    <button class="lb-icon-btn" id="lobby-bgm-toggle" title="音樂開關">🔊</button>
                    <button class="lb-icon-btn" id="aurelia-global-close-btn" title="關閉奧瑞亞" onclick="if(window.AureliaControlCenter) window.AureliaControlCenter.requestClose();">⏻</button>
                    <audio id="lobby-bgm-player" loop style="display:none;"></audio>
                </div>
                <div class="lb-top-user" id="lb-top-user" title="我的人設">
                    <img class="lb-top-user-avatar" id="lb-top-user-avatar" src="${URLS.PERSONA_FALLBACK}" alt="">
                    <div class="lb-top-user-meta">
                        <div class="lb-top-user-name" id="lb-top-user-name">USER</div>
                        <div class="lb-top-user-sub" id="lb-top-user-sub">委託人</div>
                    </div>
                    <i class="fa-solid fa-chevron-down lb-top-user-caret"></i>
                    <div class="lb-persona-dropdown" id="lb-persona-dropdown">
                        <div class="lb-persona-dropdown-inner" id="lb-persona-dropdown-inner"></div>
                    </div>
                </div>
            </div>


            <div class="void-bubble-layer" id="void-bubble-layer" data-next-slot="2">${feedHTML}</div>

            <div class="lobby-body">
                <div class="lobby-left">
                    <img class="void-char-img" id="iris-avatar" src="${URLS.IRIS_AVATAR}" alt="瀅瀅" style="display:none;">
                    <div class="lb-scene-badge" id="lb-scene-badge">視差書咖</div>
                    <div class="lb-signature"></div>
                    <div class="void-dialogue-wrap">
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
                        <div class="void-chat-input-row">
                            <button class="void-hist-btn void-hist-inline" id="iris-hist-btn" title="瀅瀅 對話歷史"><i class="fa-solid fa-clock-rotate-left"></i></button>
                            <button class="void-hist-btn void-hist-inline" id="cheshire-hist-btn" title="柴郡 對話歷史" style="display:none; color: #00ff41; background: rgba(0,20,0,0.6); border: 1px solid rgba(0,255,65,0.2);"><i class="fa-solid fa-clock-rotate-left"></i></button>
                            <textarea id="iris-input" class="void-input" placeholder="提供故事素材或與瀅瀅對話..." rows="1" autocomplete="off"></textarea>
                            <button class="void-retry-btn" id="iris-retry-btn" title="重試上一條"><i class="fa-solid fa-rotate-right"></i></button>
                            <button class="void-send-btn" id="iris-send-btn"><i class="fa-solid fa-paper-plane"></i></button>
                        </div>
                    </div>
                </div>
                <div class="lobby-right">
                    <div class="lb-menu-head">
                        <div class="lb-menu-head-title">MAIN MENU</div>
                        <div class="lb-menu-head-sub">AURELIS CORE INTERFACE</div>
                        <div class="lb-menu-head-rule"></div>
                    </div>
                    <div class="lb-menu-scroll">
                    <div class="void-btn" id="void-quest-btn">
                        <div class="void-btn-inner">
                            <i class="lb-menu-icon fa-solid fa-book"></i>
                            <div class="lb-menu-txt">
                                <span class="lb-menu-cn" data-cn-404="禁庫">藏書</span>
                                <span class="lb-menu-en" data-en-404="BLACK VAULT">ARCHIVE</span>
                            </div>
                            <i class="lb-menu-chevron fa-solid fa-chevron-right"></i>
                        </div>
                    </div>
                    <div class="void-btn" id="void-story-btn" onclick="if(window.AureliaControlCenter) window.AureliaControlCenter.showVnPanel(window.OS_API?.isStandalone?.() ? 'generate' : 'story');">
                        <div class="void-btn-inner"><span>踏入故事</span></div>
                    </div>
                    <div class="void-btn" id="void-chapter-btn">
                        <div class="void-btn-inner">
                            <i class="lb-menu-icon fa-solid fa-feather-pointed"></i>
                            <div class="lb-menu-txt">
                                <span class="lb-menu-cn" data-cn-404="異常記錄">章節選擇</span>
                                <span class="lb-menu-en" data-en-404="ANOMALY LOG">CHAPTER SELECT</span>
                            </div>
                            <i class="lb-menu-chevron fa-solid fa-chevron-right"></i>
                        </div>
                    </div>
                    <div class="void-btn" id="void-exit-btn" data-os-launch="map">
                        <div class="void-btn-inner">
                            <i class="lb-menu-icon fa-solid fa-umbrella"></i>
                            <div class="lb-menu-txt">
                                <span class="lb-menu-cn" data-cn-404="墜入404">出門</span>
                                <span class="lb-menu-en" data-en-404="ENTER 404">DEPART</span>
                            </div>
                            <i class="lb-menu-chevron fa-solid fa-chevron-right"></i>
                        </div>
                    </div>
                    <div class="void-btn" id="void-journal-btn" data-app-launch="journal" title="瀅瀅的故事日誌">
                        <div class="void-btn-inner">
                            <i class="lb-menu-icon fa-solid fa-book-open"></i>
                            <div class="lb-menu-txt">
                                <span class="lb-menu-cn" data-cn-404="案件日誌">故事日誌</span>
                                <span class="lb-menu-en" data-en-404="CASE LOG">STORY JOURNAL</span>
                            </div>
                            <i class="lb-menu-chevron fa-solid fa-chevron-right"></i>
                        </div>
                    </div>
                    <div class="void-btn" id="void-achievement-btn" title="資料庫成就清單">
                        <div class="void-btn-inner">
                            <i class="lb-menu-icon fa-solid fa-trophy"></i>
                            <div class="lb-menu-txt">
                                <span class="lb-menu-cn" data-cn-404="異常蒐集">成就</span>
                                <span class="lb-menu-en" data-en-404="ANOMALY SET">ACHIEVEMENTS</span>
                            </div>
                            <i class="lb-menu-chevron fa-solid fa-chevron-right"></i>
                        </div>
                    </div>
                    <div class="void-btn" id="void-apps-btn" title="應用（手機殼：微信 / 微薄 / 塔羅 / RPG / 閱讀 / 黑市）">
                        <div class="void-btn-inner">
                            <i class="lb-menu-icon fa-solid fa-mobile-screen-button"></i>
                            <div class="lb-menu-txt">
                                <span class="lb-menu-cn" data-cn-404="終端機">應用</span>
                                <span class="lb-menu-en" data-en-404="TERMINAL">APPS</span>
                            </div>
                            <i class="lb-menu-chevron fa-solid fa-chevron-right"></i>
                        </div>
                    </div>
                    <div class="void-btn" id="void-close-btn" title="關閉奧瑞亞" onclick="if(window.AureliaControlCenter) window.AureliaControlCenter.requestClose();">
                        <div class="void-btn-inner">
                            <i class="lb-menu-icon fa-solid fa-power-off"></i>
                            <div class="lb-menu-txt">
                                <span class="lb-menu-cn" data-cn-404="登出">關閉</span>
                                <span class="lb-menu-en" data-en-404="DISCONNECT">CLOSE</span>
                            </div>
                            <i class="lb-menu-chevron fa-solid fa-chevron-right"></i>
                        </div>
                    </div>
                    <div class="lb-info-cards">
                        <div class="lb-info-card">
                            <span class="lb-info-card-k">TODAY'S SPECIAL</span>
                            <span class="lb-info-card-v" id="lb-special-name">藍莓拿鐵</span>
                        </div>
                    </div>
                    </div>
                </div>
            </div>
            
            <div class="qb-bookshelf-overlay" id="qb-bookshelf-overlay" style="display:none; position:absolute; top:8%; left:4%; right:4%; bottom:15%; background:#1e1208; border:3px solid #6b4c3a; border-radius:8px; z-index:100; flex-direction:column; box-shadow:inset 0 0 50px rgba(0,0,0,0.8), 0 15px 40px rgba(0,0,0,0.9); overflow:hidden;">
                <div style="position:absolute; inset:0; background-image:repeating-linear-gradient(180deg, rgba(255,255,255,0.012) 0px, rgba(255,255,255,0.012) 1px, transparent 1px, transparent 18px); pointer-events:none;"></div>
                <div style="position:absolute; inset:0; background:radial-gradient(ellipse at 50% 0%, rgba(90,55,25,0.35) 0%, transparent 70%); pointer-events:none;"></div>

                <div style="position:relative; z-index:2; display:flex; justify-content:space-between; align-items:center; background:linear-gradient(to bottom, #3e271a, #2c1e16); border-bottom:2px solid #1a110b; padding:12px 15px; box-shadow:0 4px 15px rgba(0,0,0,0.4);">
                    <div style="color:#1A1C28; font-weight:bold; font-size:16px; font-family:'Cinzel', serif; letter-spacing:1px; text-shadow:2px 2px 4px rgba(0,0,0,0.5);">📖 瀅瀅的館藏書架</div>
                    <button id="close-bookshelf-btn" style="background:none; border:none; color:rgba(26,28,40,0.72); font-size:20px; cursor:pointer; transition:0.2s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='rgba(26,28,40,0.40)'">✕</button>
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
                    <button id="qb-page-prev" style="background:none; border:1px solid rgba(26,28,40,0.18); color:#1A1C28; font-size:20px; width:36px; height:36px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:opacity 0.2s; font-family:inherit;">‹</button>
                    <span id="qb-page-label" style="color:rgba(26,28,40,0.72); font-size:13px; font-family:monospace; letter-spacing:1px;"></span>
                    <button id="qb-page-next" style="background:none; border:1px solid rgba(26,28,40,0.18); color:#1A1C28; font-size:20px; width:36px; height:36px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:opacity 0.2s; font-family:inherit;">›</button>
                </div>
            </div>


            <div id="iris-history-overlay" style="display:none; background:rgba(228,232,245,0.97);">
                <div class="hist-header" style="border-bottom: 1px solid rgba(26,28,40,0.15);">
                    <div style="display:flex;align-items:center;">
                        <span class="hist-title" id="hist-title" style="color:#1A1C28;">故事素材紀錄</span>
                        <span class="hist-char-badge iris" id="hist-char-badge" style="background:rgba(26,28,40,0.10); color:#1A1C28; border:1px solid rgba(26,28,40,0.25);">瀅瀅</span>
                    </div>
                    <button class="hist-close" id="hist-close-btn" style="color:#1A1C28;">✕</button>
                </div>
                <div class="hist-toolbar" style="background:rgba(0,0,0,0.5); border-bottom: 1px solid rgba(26,28,40,0.06);">
                    <label class="hist-check-all-label" style="color:#1A1C28;"><input type="checkbox" id="hist-check-all"> 全選</label>
                    <button class="hist-action-btn danger" id="hist-del-sel" disabled style="background:rgba(252,129,129,0.1); color:#fc8181; border:1px solid #fc8181;">刪除選中</button>
                    <button class="hist-action-btn danger" id="hist-clear-btn" style="background:rgba(252,129,129,0.1); color:#fc8181; border:1px solid #fc8181;">清空全部</button>
                    <button class="hist-action-btn" id="hist-new-claude-conv" style="display:none; background:rgba(217,81,34,0.15); color:#D95122; border:1px solid #EAB05C;" title="建立新會話，舊對話保留在 Recents 列表">＋ 新會話</button>
                    <span class="hist-count" id="hist-count" style="color:rgba(26,28,40,0.72);"></span>
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

            <!-- .void-dialogue-wrap（選單按鈕 + 對話框）已移入 .lobby-body 的左右欄 -->


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

            <!-- 底部輸入列已搬進 .void-dialogue-wrap（對話框正下方）；獨立 .void-chat-bar 已移除 -->

            <!-- 📖 大廳章節選擇面板 -->
            <div id="lobby-chapter-panel" class="lcp-overlay">
                <div class="lcp-notebook">
                    <div class="lcp-rings"><div class="lcp-ring"></div><div class="lcp-ring"></div><div class="lcp-ring"></div></div>
                    <button class="lcp-close-btn" id="lcp-close-btn">✕</button>
                    <div class="lcp-inner">
                        <div class="lcp-header">
                            <div class="lcp-hdr-left">
                                <div class="lcp-title">章節選擇</div>
                                <div class="lcp-title-en">Chapter Select</div>
                            </div>
                            <div class="lcp-hdr-divider"></div>
                            <div class="lcp-hdr-right">
                                <div class="lcp-hdr-zh">故事書館</div>
                                <div class="lcp-hdr-en">Story Bookmarks</div>
                            </div>
                        </div>
                        <div class="lcp-cards-area">
                            <div class="lcp-cards-viewport">
                                <button class="lcp-nav lcp-prev" id="lcp-prev-btn" disabled>‹</button>
                                <div class="lcp-cards-track" id="lcp-cards-track"></div>
                                <button class="lcp-nav lcp-next" id="lcp-next-btn">›</button>
                            </div>
                            <div class="lcp-dots" id="lcp-dots"></div>
                        </div>
                        <div class="lcp-bottom">
                            <div class="lcp-bottom-sec lcp-last-read">
                                <div class="lcp-last-thumb"></div>
                                <div class="lcp-last-info">
                                    <div class="lcp-sec-label">最近選取</div>
                                    <div class="lcp-sec-en">LAST SELECTED</div>
                                    <div class="lcp-last-title" id="lcp-last-title">—</div>
                                    <div class="lcp-last-meta" id="lcp-last-meta"></div>
                                </div>
                            </div>
                            <div class="lcp-bottom-sec lcp-stat-sec">
                                <div class="lcp-sec-label">故事數量</div>
                                <div class="lcp-sec-en">TOTAL STORIES</div>
                                <div class="lcp-big-num" id="lcp-story-count">—</div>
                            </div>
                            <div class="lcp-bottom-sec lcp-quote-sec">
                                <div class="lcp-quote-text">「故事還在繼續，<br>而我們也在。」</div>
                                <div class="lcp-quote-author">— Sohee</div>
                            </div>
                            <div class="lcp-bottom-sec lcp-back-sec" id="lcp-back-btn">
                                <div class="lcp-back-zh">返回大廳</div>
                                <div class="lcp-back-en">BACK TO MAIN</div>
                                <div class="lcp-back-arrow">›</div>
                            </div>
                        </div>
                    </div>
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
            if (inputField) {
                // Enter 送出、Shift+Enter 換行
                inputField.onkeydown = (e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                        e.preventDefault();
                        sendIrisMessage();
                    }
                };
                // 自動增高（textarea 隨內容變高、撞到 max-height 開始捲）
                const autoGrow = () => {
                    inputField.style.height = 'auto';
                    inputField.style.height = Math.min(inputField.scrollHeight, 200) + 'px';
                };
                inputField.addEventListener('input', autoGrow);
                autoGrow();
            }
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
                                playIrisSequence(`[Char|瀅瀅|smile|「想幫我搜集什麼樣的故事素材？請從書架上挑選一本書吧！」]`);
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

            // 右側新增的「成就」橫幅卡 → 開同一個成就面板
            const achievementCardBtn = tab.querySelector('#void-achievement-btn');
            if (achievementCardBtn) achievementCardBtn.addEventListener('click', VoidPanels.openAchievement);

            // 📱 應用（手機殼浮窗）—— 所有 app 從這開
            const appsBtn = tab.querySelector('#void-apps-btn');
            if (appsBtn) appsBtn.addEventListener('click', function () {
                if (window.VoidPhoneShell && window.VoidPhoneShell.open) window.VoidPhoneShell.open();
            });

            // ===== 右上角人設頭像 + 下拉（取代舊「我」TAB，內容＝ OS_PERSONA 人設管理）=====
            (function setupPersonaAvatar() {
                const userBox  = tab.querySelector('#lb-top-user');
                const dropdown = tab.querySelector('#lb-persona-dropdown');
                const inner    = tab.querySelector('#lb-persona-dropdown-inner');
                if (!userBox || !dropdown || !inner) return;

                let _launched = false;

                function refreshAvatar() {
                    const p = (window.OS_PERSONA && window.OS_PERSONA.getCurrent) ? window.OS_PERSONA.getCurrent() : null;
                    const name = (p && p.name) || IRIS_STATE.userName || 'USER';
                    const avatarEl = tab.querySelector('#lb-top-user-avatar');
                    const nameEl   = tab.querySelector('#lb-top-user-name');
                    if (nameEl)  nameEl.textContent = name;
                    if (avatarEl) avatarEl.src = (p && p.avatar) ? p.avatar : URLS.PERSONA_FALLBACK;
                }
                VoidTerminal._refreshPersonaAvatar = refreshAvatar;

                function openDropdown() {
                    if (!_launched && window.OS_PERSONA && window.OS_PERSONA.launch) {
                        window.OS_PERSONA.launch(inner);
                        _launched = true;
                    }
                    dropdown.classList.add('open');
                    userBox.classList.add('active');
                }
                function closeDropdown() {
                    dropdown.classList.remove('open');
                    userBox.classList.remove('active');
                    refreshAvatar();
                }

                userBox.addEventListener('click', (e) => {
                    if (dropdown.contains(e.target)) {
                        // 點到下拉內容（可能是切換人設）→ 稍後同步頂部頭像，不關閉
                        setTimeout(refreshAvatar, 500);
                        setTimeout(refreshAvatar, 1500);
                        return;
                    }
                    e.stopPropagation();
                    if (dropdown.classList.contains('open')) closeDropdown();
                    else openDropdown();
                });
                document.addEventListener('click', (e) => {
                    if (dropdown.classList.contains('open') && !userBox.contains(e.target)) closeDropdown();
                }, true);

                refreshAvatar();
            })();

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

            // 📱 手機把 404 portal 按鈕從頂部 .lb-top-ctrls 搬進 .lb-menu-head 右側（避免擠壓頂部）
            // 注意：mode-claude 時 .lobby-body 是 display:none，head 也跟著消失，所以那時得把按鈕留在 top-ctrls
            const _relocatePortalBtns = () => {
                const ctrls  = tab.querySelector('.lb-top-ctrls');
                const head   = tab.querySelector('.lb-menu-head');
                const portal = tab.querySelector('#room-portal-btn');
                if (!ctrls || !portal) return;
                const isMobile = window.matchMedia('(max-width: 560px)').matches;
                const inClaude = tab.classList.contains('mode-claude');
                const moveToHead = isMobile && !inClaude && head;
                if (moveToHead) {
                    if (portal.parentElement !== head) head.appendChild(portal);
                } else {
                    const fsBtn = ctrls.querySelector('#aurelia-fullscreen-btn');
                    if (portal.parentElement !== ctrls) ctrls.insertBefore(portal, fsBtn || null);
                }
            };
            _relocatePortalBtns();
            if (!window._voidPortalRelocateBound) {
                window._voidPortalRelocateBound = true;
                window.addEventListener('resize', _relocatePortalBtns);
                // 監聽 .void-tab class 變化（進出 mode-claude / mode-404 時自動重排）
                new MutationObserver(_relocatePortalBtns).observe(tab, { attributes: true, attributeFilter: ['class'] });
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

            // 📖 大廳章節選擇面板 (LobbyChapterPanel)
            const LobbyChapterPanel = (() => {
                const PER_PAGE = 3;
                const BK_IMG = 'https://files.catbox.moe/a1y4su.png';
                const PALETTES = [
                    'linear-gradient(180deg,#7a8a9a,#5a6a7a 50%,#8a8070)',
                    'linear-gradient(135deg,#7a6a5a,#5a4a3a 50%,#8a7a6a)',
                    'linear-gradient(135deg,#4a5a7a,#2a3a5a 50%,#6a7a9a)',
                    'linear-gradient(180deg,#6a7a5a,#4a5a3a 50%,#7a8a6a)',
                    'linear-gradient(135deg,#7a5a7a,#5a3a5a 50%,#9a7a9a)',
                ];
                let _all = [], _page = 0, _pages = 1;

                function _palette(sid) {
                    let h = 0; for (const c of (sid||'')) h = (h*31+c.charCodeAt(0))&0xffffffff;
                    return PALETTES[Math.abs(h)%PALETTES.length];
                }
                function _chNum(ch) {
                    const same = _all.filter(c=>c.storyId===ch.storyId).sort((a,b)=>a.createdAt-b.createdAt);
                    return String(same.findIndex(c=>c.id===ch.id)+1).padStart(2,'0');
                }
                function _render() {
                    const track = document.getElementById('lcp-cards-track');
                    const dotsEl = document.getElementById('lcp-dots');
                    if (!track) return;
                    const slice = _all.slice(_page*PER_PAGE, (_page+1)*PER_PAGE);
                    track.innerHTML = '';
                    if (!slice.length) {
                        track.innerHTML = '<div class="lcp-empty"><div style="font-size:28px;opacity:0.45">📖</div><div>尚無故事章節<br><span style="font-size:10px;opacity:0.6">去 VN 播放器生成第一章吧</span></div></div>';
                    } else {
                        slice.forEach((ch, i) => {
                            const num = _chNum(ch);
                            const isGold = (i===0 && _page===0);
                            const bg = _palette(ch.storyId);
                            const d = ch.createdAt ? new Date(ch.createdAt).toLocaleDateString('zh-TW',{month:'2-digit',day:'2-digit'}) : '';
                            const card = document.createElement('div');
                            card.className = 'lcp-card' + (i===0 ? ' lcp-active' : '');
                            card.innerHTML = `
                                <div class="lcp-ribbon${isGold?' gold':''}"><img src="${BK_IMG}" alt=""></div>
                                <div class="lcp-spacer"></div>
                                <div class="lcp-chapter-label">CHAPTER</div>
                                <div class="lcp-chapter-num">${num}</div>
                                <div class="lcp-chapter-title">${ch.title||'未命名章節'}</div>
                                <div class="lcp-chapter-story">${ch.storyTitle||''}</div>
                                <div class="lcp-scene" style="background:${bg}">📖</div>
                                <div class="lcp-card-date">${d}</div>
                                <div class="lcp-card-status">
                                    <span class="lcp-status-txt">已完成</span>
                                    <div class="lcp-status-bar"><div class="lcp-status-fill"></div></div>
                                    <span class="lcp-status-pct">100%</span>
                                </div>`;
                            card.addEventListener('click', () => _select(ch));
                            track.appendChild(card);
                        });
                    }
                    if (dotsEl) {
                        dotsEl.innerHTML = '';
                        for (let i=0;i<_pages;i++) {
                            const dot = document.createElement('button');
                            dot.className = 'lcp-dot'+(i===_page?' active':'');
                            dot.addEventListener('click', ()=>{ _page=i; _render(); });
                            dotsEl.appendChild(dot);
                        }
                    }
                    const prev = document.getElementById('lcp-prev-btn');
                    const next = document.getElementById('lcp-next-btn');
                    if (prev) prev.disabled = _page===0;
                    if (next) next.disabled = _page>=_pages-1;
                }
                function _select(ch) {
                    try { localStorage.setItem('lcp_last', JSON.stringify({title:ch.title,storyTitle:ch.storyTitle,date:ch.createdAt})); } catch(e){}
                    if (window.VN_Core?._setStoryId) window.VN_Core._setStoryId(ch.storyId||'', ch.storyTitle||'');
                    window._lobbyPendingChapter = ch;
                    _close();
                    if (window.AureliaControlCenter?.showVnPanel) window.AureliaControlCenter.showVnPanel('autoload');
                }
                function _updateLast() {
                    try {
                        const last = JSON.parse(localStorage.getItem('lcp_last')||'null');
                        const t = document.getElementById('lcp-last-title');
                        const m = document.getElementById('lcp-last-meta');
                        if (last && t) { t.textContent = last.title||'—'; if(m) m.textContent = last.storyTitle||''; }
                    } catch(e){}
                }
                async function _open() {
                    // 酒館模式章節來自聊天歷史，直接走 VN 面板
                    const isStandalone = window.OS_API?.isStandalone?.() ?? false;
                    if (!isStandalone) {
                        if (window.AureliaControlCenter) window.AureliaControlCenter.showVnPanel('chapter');
                        return;
                    }
                    const panel = document.getElementById('lobby-chapter-panel');
                    if (!panel) return;
                    _page = 0; _all = [];
                    const track = document.getElementById('lcp-cards-track');
                    if (track) track.innerHTML = '<div class="lcp-empty"><div style="font-size:22px">⏳</div><div>讀取中...</div></div>';
                    panel.classList.add('active');
                    _updateLast();
                    try {
                        if (window.OS_DB?.getAllVnChapters) {
                            const chapters = await window.OS_DB.getAllVnChapters();
                            chapters.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
                            _all = chapters;
                            const ids = new Set(chapters.map(c=>c.storyId).filter(Boolean));
                            const cnt = document.getElementById('lcp-story-count');
                            if (cnt) cnt.textContent = String(ids.size||chapters.length);
                        }
                    } catch(e) { console.warn('[LCP] DB err', e); }
                    _pages = Math.max(1, Math.ceil(_all.length/PER_PAGE));
                    _render();
                }
                function _close() { document.getElementById('lobby-chapter-panel')?.classList.remove('active'); }
                function _init() {
                    document.getElementById('lcp-close-btn')?.addEventListener('click', _close);
                    document.getElementById('lcp-back-btn')?.addEventListener('click', _close);
                    document.getElementById('lcp-prev-btn')?.addEventListener('click', ()=>{ if(_page>0){_page--;_render();} });
                    document.getElementById('lcp-next-btn')?.addEventListener('click', ()=>{ if(_page<_pages-1){_page++;_render();} });
                    document.getElementById('lobby-chapter-panel')?.addEventListener('click', e=>{ if(e.target.id==='lobby-chapter-panel') _close(); });
                }
                return { open: _open, close: _close, init: _init };
            })();
            LobbyChapterPanel.init();

            // 🎮 書咖俯視舞台：掛載＋頂欄開關鈕
            if (window.LobbyStage) window.LobbyStage.tryMount();
            const lstageBtn = tab.querySelector('#lstage-toggle');
            if (lstageBtn) {
                const _syncLstageBtn = () => lstageBtn.classList.toggle('off', !window.LobbyStage?.isOn());
                _syncLstageBtn();
                lstageBtn.addEventListener('click', () => {
                    if (!window.LobbyStage) return;
                    const on = window.LobbyStage.isOn();
                    try { localStorage.setItem('lobby_stage_on', on ? '0' : '1'); } catch(e) {}
                    if (on) window.LobbyStage.unmount(); else window.LobbyStage.tryMount();
                    _syncLstageBtn();
                });
            }

            // 📖 獨立閱讀器按鈕
            const vnReaderBtn = tab.querySelector('#vn-reader-lobby-btn');
            if (vnReaderBtn) vnReaderBtn.addEventListener('click', () => {
                if (window.VN_READER) window.VN_READER.show();
            });

            // 📚 章節選擇大廳面板
            const chapterBtn = tab.querySelector('#void-chapter-btn');
            if (chapterBtn) chapterBtn.addEventListener('click', () => {
                LobbyChapterPanel.open();
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

            // ＋ Claude 新會話：建一條新 conv（舊 conv 自動保留在 Recents、非破壞性、不需 confirm）
            const histNewClaudeConv = tab.querySelector('#hist-new-claude-conv');
            if (histNewClaudeConv) histNewClaudeConv.addEventListener('click', async () => {
                if (!window.ClaudeTerminal) return;
                window.ClaudeTerminal.startNewConversation();
                // 同步 in-memory 狀態（如果當前在 Claude 場景）
                if (isClaudeRoom) {
                    IRIS_STATE.history = [];
                    const stream = document.getElementById('claude-chat-stream');
                    if (stream) stream.innerHTML = '';
                    VoidClaudeRoom.renderBubble('assistant', '新對話開始了。舊的還在 Recents、隨時點回去。');
                    VoidClaudeRoom.setPortraitState('living');
                } else {
                    _claudeHistoryBackup = [];
                }
                renderHistoryList();
                _updateClaudeConvChip();
                debouncedSave();
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
                // 登入頁已移除：直接依當前人設自動進場
                _autoEnterFromPersona();
                _applyLoadedLobbyState();
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
        // 選擇/清空 toolbar 三件套（只在訊息列表模式顯示；conv 列表模式隱藏）
        const delBtn = document.getElementById('hist-del-sel');
        const clearBtn = document.getElementById('hist-clear-btn');
        const checkAll = document.getElementById('hist-check-all');
        const checkAllLabel = checkAll && checkAll.closest('label');
        const titleEl = document.getElementById('hist-title');
        if (char === 'iris') {
            if (badgeEl) { badgeEl.className = 'hist-char-badge iris'; badgeEl.textContent = '瀅瀅'; badgeEl.style.color = 'rgba(26,28,40,0.25)'; badgeEl.style.borderColor = 'rgba(26,28,40,0.25)'; badgeEl.style.background = 'rgba(26,28,40,0.10)'; }
            if (newConvBtn) newConvBtn.style.display = 'none';
            if (titleEl) titleEl.textContent = '故事素材紀錄';
            if (delBtn) delBtn.style.display = '';
            if (clearBtn) clearBtn.style.display = '';
            if (checkAllLabel) checkAllLabel.style.display = '';
        } else if (char === 'claude') {
            if (badgeEl) { badgeEl.className = 'hist-char-badge claude'; badgeEl.textContent = '☕ Claude'; badgeEl.style.color = '#D95122'; badgeEl.style.borderColor = '#D95122'; badgeEl.style.background = 'rgba(217,81,34,0.18)'; }
            if (newConvBtn) newConvBtn.style.display = '';
            if (titleEl) titleEl.textContent = 'Recents（多會話）';
            // conv 列表模式不需要訊息級選擇/清空
            if (delBtn) delBtn.style.display = 'none';
            if (clearBtn) clearBtn.style.display = 'none';
            if (checkAllLabel) checkAllLabel.style.display = 'none';
        } else {
            if (badgeEl) { badgeEl.className = 'hist-char-badge cheshire'; badgeEl.textContent = '柴郡 · 404'; badgeEl.style.color = '#00ff41'; badgeEl.style.borderColor = '#00ff41'; badgeEl.style.background = 'rgba(0,255,65,0.2)'; }
            if (newConvBtn) newConvBtn.style.display = 'none';
            if (titleEl) titleEl.textContent = '故事素材紀錄';
            if (delBtn) delBtn.style.display = '';
            if (clearBtn) clearBtn.style.display = '';
            if (checkAllLabel) checkAllLabel.style.display = '';
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
        // claude 走 Recents（多會話）視圖，其餘走原本訊息列表
        if (_historyPanel.char === 'claude') return renderClaudeRecentsList();
        const listEl  = document.getElementById('hist-list');
        const countEl = document.getElementById('hist-count');
        if (!listEl) return;
        const history = getCharHistory(_historyPanel.char);
        if (countEl) countEl.textContent = `${history.length} 條記錄`;
        if (history.length === 0) {
            listEl.innerHTML = `<div class="hist-empty" style="color:rgba(26,28,40,0.72); text-align:center; padding: 20px;">── 尚無紀錄 ──</div>`;
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
            let badgeStyle = isUser ? `background: rgba(26,28,40,0.10); color:#1A1C28; border:1px solid rgba(26,28,40,0.25);` :
                             isClaude ? `background: rgba(217,81,34,0.18); color:#D95122; border:1px solid #D95122;` :
                             isCheshire ? `background: rgba(0,255,65,0.2); color:#00ff41; border:1px solid #00ff41;` :
                             `background: rgba(226,232,240,0.1); color:#1A1C28; border:1px solid #1A1C28;`;

            item.innerHTML = `
                <input type="checkbox" class="hist-item-check">
                <span class="hist-role-badge" style="${badgeStyle}">${roleLabel}</span>
                <div class="hist-item-body"><div class="hist-item-text" style="color:#3A3F5C;">${safeText}</div></div>
                <div class="hist-item-actions">
                    <button class="hist-icon-btn edit" title="編輯此條" style="color:rgba(26,28,40,0.72);">✎</button>
                    <button class="hist-icon-btn rollback" title="回退到此點" style="color:rgba(26,28,40,0.72);">↩</button>
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

    // ===== Claude Recents 視圖（多會話）=====

    /** 更新左上角 conv 標題小卡：tab icon + title + 下拉箭頭。
     *  在 enter room / switch conv / delete conv / 新會話 / 送完訊息（title 可能自動改）後呼叫。
     */
    function _updateClaudeConvChip() {
        const chip = document.getElementById('claude-conv-chip');
        if (!chip || !window.ClaudeTerminal) return;
        const tab = window.ClaudeTerminal.getActiveTab();
        const convId = window.ClaudeTerminal.getActiveConvId(tab);
        const tabIcon = tab === 'codex' ? '🔷' : tab === 'api' ? '🌐' : '☕';
        const tabEl = document.getElementById('ccc-tab');
        const titleEl = document.getElementById('ccc-title');
        if (tabEl) tabEl.textContent = tabIcon;
        if (!convId) {
            if (titleEl) titleEl.textContent = '新會話';
            return;
        }
        const found = window.ClaudeTerminal.findConv(convId);
        if (titleEl) titleEl.textContent = (found && found.meta.title) || '新會話';
    }
    // 暴露給 claude-room.js（送訊息完成後呼叫、因為新 conv 第一條 user msg 會自動設標題）
    window._VoidClaudeUpdateChip = _updateClaudeConvChip;

    function _claudeRelTime(ts) {
        if (!ts) return '從未對話';
        const diff = Date.now() - ts;
        const min = Math.floor(diff / 60000);
        if (min < 1) return '剛剛';
        if (min < 60) return min + ' 分鐘前';
        const hr = Math.floor(min / 60);
        if (hr < 24) return hr + ' 小時前';
        const day = Math.floor(hr / 24);
        if (day < 7) return day + ' 天前';
        const d = new Date(ts);
        return `${d.getMonth() + 1}/${d.getDate()}`;
    }

    function renderClaudeRecentsList() {
        const listEl  = document.getElementById('hist-list');
        const countEl = document.getElementById('hist-count');
        if (!listEl) return;
        if (!window.ClaudeTerminal) {
            listEl.innerHTML = '<div class="hist-empty" style="color:rgba(26,28,40,0.72); text-align:center; padding: 20px;">── ClaudeTerminal 未載入 ──</div>';
            if (countEl) countEl.textContent = '';
            return;
        }
        const activeTab = window.ClaudeTerminal.getActiveTab();
        const convs = window.ClaudeTerminal.listConversations(activeTab);
        const activeConvId = window.ClaudeTerminal.getActiveConvId(activeTab);

        if (countEl) countEl.textContent = `${convs.length} 個會話`;

        listEl.innerHTML = '';

        // tab bar：訂閱 Max / Anthropic API（Codex 房間單一 backend，不顯示）
        if (activeTab !== 'codex') {
            const tabBar = document.createElement('div');
            tabBar.className = 'claude-recents-tabs';
            tabBar.innerHTML = `
                <button class="cr-tab ${activeTab === 'max' ? 'active' : ''}" data-tab="max">🏠 訂閱 Max</button>
                <button class="cr-tab ${activeTab === 'api' ? 'active' : ''}" data-tab="api">🌐 Anthropic API</button>
            `;
            tabBar.querySelectorAll('.cr-tab').forEach(btn => {
                btn.addEventListener('click', () => {
                    window.ClaudeTerminal.setActiveTab(btn.dataset.tab);
                    renderHistoryList();
                });
            });
            listEl.appendChild(tabBar);
        }

        if (!convs.length) {
            const empty = document.createElement('div');
            empty.className = 'hist-empty';
            empty.style.cssText = 'color:rgba(26,28,40,0.72); text-align:center; padding: 30px 20px;';
            empty.textContent = activeTab === 'max'
                ? '── 訂閱 Max 還沒有對話 ──'
                : '── Anthropic API 還沒有對話 ──';
            listEl.appendChild(empty);
            return;
        }

        convs.forEach(conv => {
            const item = document.createElement('div');
            item.className = 'hist-item claude-recent';
            if (conv.id === activeConvId) item.classList.add('active');

            const titleSafe = (conv.title || '新會話').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            const checkMark = conv.id === activeConvId ? '✓ ' : '';

            item.innerHTML = `
                <div class="claude-recent-body">
                    <div class="claude-recent-title">${checkMark}${titleSafe}</div>
                    <div class="claude-recent-meta">${conv.msgCount || 0} 條訊息 · ${_claudeRelTime(conv.lastActive)}</div>
                </div>
                <div class="claude-recent-actions">
                    <button class="cr-icon-btn" data-act="rename" title="改名">✎</button>
                    <button class="cr-icon-btn danger" data-act="delete" title="刪除">✕</button>
                </div>
            `;
            // 點 item body 切換 conv；點 action 按鈕單獨處理（stopPropagation）
            item.addEventListener('click', () => _switchToClaudeConv(conv.id));
            const renameBtn = item.querySelector('[data-act="rename"]');
            const delBtn    = item.querySelector('[data-act="delete"]');
            if (renameBtn) renameBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                _startRenameClaudeConv(item, conv);
            });
            if (delBtn) delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                _confirmDeleteClaudeConv(conv);
            });
            // 桌面右鍵也跳改名/刪除 mini menu（簡單版：直接 confirm 後執行）
            item.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                _showClaudeConvContextMenu(e.pageX, e.pageY, item, conv);
            });
            listEl.appendChild(item);
        });
    }

    function _startRenameClaudeConv(itemEl, conv) {
        if (!window.ClaudeTerminal) return;
        const titleEl = itemEl.querySelector('.claude-recent-title');
        if (!titleEl || titleEl.querySelector('input')) return;
        const oldTitle = conv.title || '新會話';

        titleEl.innerHTML = '';
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'claude-recent-rename-input';
        inp.value = oldTitle;
        inp.maxLength = 50;

        let done = false;
        const commit = () => {
            if (done) return; done = true;
            const newTitle = inp.value.trim();
            if (newTitle && newTitle !== oldTitle) {
                window.ClaudeTerminal.renameConversation(conv.id, newTitle);
            }
            renderHistoryList();
        };
        const cancel = () => {
            if (done) return; done = true;
            renderHistoryList();
        };
        inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                e.preventDefault(); commit();
            } else if (e.key === 'Escape') {
                e.preventDefault(); cancel();
            }
        });
        inp.addEventListener('blur', commit);
        inp.addEventListener('click', (e) => e.stopPropagation());

        titleEl.appendChild(inp);
        inp.focus();
        inp.select();
    }

    async function _confirmDeleteClaudeConv(conv) {
        if (!window.ClaudeTerminal) return;
        const title = conv.title || '新會話';
        const msg = `將永久刪除「${title}」（${conv.msgCount || 0} 條訊息）。\n此操作不可復原。`;
        showHistoryConfirm(msg, 'danger', async () => {
            const tab = window.ClaudeTerminal.getActiveTab();
            const wasActive = window.ClaudeTerminal.getActiveConvId(tab) === conv.id;
            await window.ClaudeTerminal.deleteConversation(conv.id);
            // 剛刪的是 active conv 且當前在 Claude 房間：載入新的 active 或清空畫面
            if (wasActive && isClaudeRoom) {
                const nextActive = window.ClaudeTerminal.getActiveConvId(tab);
                if (nextActive) {
                    // _switchToClaudeConv 會 closeHistoryPanel，刪除完讓 Recents 留著、直接重渲
                    const result = await window.ClaudeTerminal.loadConversation(nextActive);
                    if (result) {
                        IRIS_STATE.history = (result.messages || []).map(m => ({
                            role: m.role, content: m.content,
                            ts: m.timestamp || Date.now(),
                            thinking: m.thinking, usage: m.usage,
                            tools_used: m.tools_used, attachments: m.attachments,
                        }));
                        const stream = document.getElementById('claude-chat-stream');
                        if (stream) stream.innerHTML = '';
                        if (window.VoidClaudeRoom && typeof window.VoidClaudeRoom.hydrateStream === 'function') {
                            window.VoidClaudeRoom.hydrateStream();
                        }
                    }
                } else {
                    // 沒剩 conv：清 chat stream，下次發訊息會自動新建
                    IRIS_STATE.history = [];
                    const stream = document.getElementById('claude-chat-stream');
                    if (stream) stream.innerHTML = '';
                    if (window.VoidClaudeRoom && typeof window.VoidClaudeRoom.renderBubble === 'function') {
                        window.VoidClaudeRoom.renderBubble('assistant', '對話都刪完了。發新訊息會自動開始新對話。');
                    }
                }
            }
            renderHistoryList();
            _updateClaudeConvChip();
            debouncedSave();
        });
    }

    function _showClaudeConvContextMenu(x, y, itemEl, conv) {
        const existing = document.getElementById('claude-recent-ctx-menu');
        if (existing) existing.remove();
        const menu = document.createElement('div');
        menu.id = 'claude-recent-ctx-menu';
        menu.className = 'claude-recent-ctx-menu';
        menu.innerHTML = `
            <button class="cr-ctx-item" data-act="rename">✎ 改名</button>
            <button class="cr-ctx-item danger" data-act="delete">✕ 刪除</button>
        `;
        const close = () => menu.remove();
        menu.querySelector('[data-act="rename"]').addEventListener('click', (e) => {
            e.stopPropagation(); close(); _startRenameClaudeConv(itemEl, conv);
        });
        menu.querySelector('[data-act="delete"]').addEventListener('click', (e) => {
            e.stopPropagation(); close(); _confirmDeleteClaudeConv(conv);
        });
        document.body.appendChild(menu);
        // 視窗內定位（避免出邊界）
        const r = menu.getBoundingClientRect();
        const px = Math.min(x, window.innerWidth - r.width - 8);
        const py = Math.min(y, window.innerHeight - r.height - 8);
        menu.style.left = px + 'px';
        menu.style.top  = py + 'px';
        // 任意點擊關閉
        setTimeout(() => {
            const off = (e) => {
                if (!menu.contains(e.target)) { close(); document.removeEventListener('click', off, true); }
            };
            document.addEventListener('click', off, true);
        }, 0);
    }

    async function _switchToClaudeConv(convId) {
        if (!window.ClaudeTerminal) return;
        const result = await window.ClaudeTerminal.switchConversation(convId);
        if (!result) return;
        const messages = (result.messages || []).map(m => ({
            role: m.role,
            content: m.content,
            ts: m.timestamp || Date.now(),
            thinking: m.thinking,
            usage: m.usage,
            tools_used: m.tools_used,
            attachments: m.attachments,
        }));
        if (isClaudeRoom) {
            IRIS_STATE.history = messages;
            const stream = document.getElementById('claude-chat-stream');
            if (stream) stream.innerHTML = '';
            if (window.VoidClaudeRoom && typeof window.VoidClaudeRoom.hydrateStream === 'function') {
                window.VoidClaudeRoom.hydrateStream();
            }
            if (messages.length === 0 && window.VoidClaudeRoom && typeof window.VoidClaudeRoom.renderBubble === 'function') {
                window.VoidClaudeRoom.renderBubble('assistant', '新對話開始了。說吧。');
            }
            if (window.VoidClaudeRoom && typeof window.VoidClaudeRoom.setPortraitState === 'function') {
                window.VoidClaudeRoom.setPortraitState('living');
            }
        } else {
            _claudeHistoryBackup = messages;
        }
        _updateClaudeConvChip();
        closeHistoryPanel();
        debouncedSave();
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
        cancelBtn.style.cssText = `background:none;border:1px solid rgba(255,255,255,0.1);color:#3A3F5C;border-radius:5px;padding:5px 12px;cursor:pointer;font-size:11px;`;
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
            <textarea class="hist-item-edit-area" style="background:rgba(228,232,245,0.95); color:#1A1C28; border:1px solid rgba(26,28,40,0.20);">${currentText.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>
            <div class="hist-edit-confirm-row">
                <button class="hist-edit-confirm-btn" style="background:#1A1C28; color:#EEF0F6;">保存</button>
                <button class="hist-edit-cancel-btn" style="background:rgba(26,28,40,0.08); color:#1A1C28;">取消</button>
            </div>`;

        const ta = textEl.querySelector('textarea');
        if (ta) { ta.style.height = Math.max(60, ta.scrollHeight) + 'px'; ta.focus(); }

        textEl.querySelector('.hist-edit-confirm-btn').addEventListener('click', () => { history[index].content = ta.value; renderHistoryList(); });
        textEl.querySelector('.hist-edit-cancel-btn').addEventListener('click', () => renderHistoryList());
    }

    VoidTerminal.closePanel = () => {};
    VoidTerminal.panelBack  = () => {};

    // ===== 世界頻道 =====
    const FEED_PALETTE_MAP = { SYS: { c:'rgba(26,28,40,0.25)', r:'251,223,162' }, ECHO: { c:'#9f7aea', r:'159,122,234' } };

    function addFeedEntry(tag, text) {
        const layer = document.getElementById('void-bubble-layer');
        if (!layer) return;
        const pal = FEED_PALETTE_MAP[tag.toUpperCase()] || FEED_PALETTE_MAP.SYS;
        const item = document.createElement('div');
        item.className = 'void-bubble';
        item.style.cssText = `--bc:${pal.c}; --bc-rgb:${pal.r}; background: rgba(228,232,245,0.96) !important; color:#1A1C28 !important; border: 1px solid rgba(26,28,40,0.15); box-shadow: 0 4px 10px rgba(0,0,0,0.5);`;
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
    async function enterClaudeRoom(provider) {
        if (isClaudeRoom) return;
        provider = provider === 'codex' ? 'codex' : 'claude';

        // 把當前場景的 history 寫回對應 backup
        if (is404Room) _cheshireHistoryBackup = [...IRIS_STATE.history];
        else           _irisHistoryBackup     = [...IRIS_STATE.history];

        // 切到聊天房間（404 跟聊天房間互斥）
        is404Room = false;
        isClaudeRoom = true;
        _chatProvider = provider;
        if (window.ClaudeTerminal && typeof window.ClaudeTerminal.setProvider === 'function') {
            window.ClaudeTerminal.setProvider(provider);
        }

        const _roomBackup = provider === 'codex' ? _codexHistoryBackup : _claudeHistoryBackup;
        // 從 os_db studio_chats 載入真實歷史（跨 chat 共用同一份、依 provider 隔離）
        if (window.ClaudeTerminal && typeof window.ClaudeTerminal.loadHistory === 'function') {
            try {
                const roomHist = await window.ClaudeTerminal.loadHistory();
                IRIS_STATE.history = (roomHist || []).map(m => ({
                    role: m.role, content: m.content, ts: m.timestamp || Date.now()
                }));
            } catch(e) {
                IRIS_STATE.history = [..._roomBackup];
            }
        } else {
            IRIS_STATE.history = [..._roomBackup];
        }

        const tab = document.getElementById('aurelia-home-tab');
        if (!tab) return;

        // 切場動畫（沿用 glitch1）
        new Audio('https://raw.githubusercontent.com/nancywang3641/sound-files/main/aseets/sfx/glitch1.mp3').play().catch(() => {});
        tab.classList.add('glitch-crash');
        const avatar = document.getElementById('iris-avatar');
        if (avatar) { avatar.style.opacity = '0'; }

        setTimeout(() => {
            tab.classList.remove('glitch-crash');
            VoidClaudeRoom.applyRoomUi();

            // 把歷史 render 成氣泡列表；無歷史就丟一條歡迎詞
            VoidClaudeRoom.hydrateStream();
            if (IRIS_STATE.history.length === 0) {
                VoidClaudeRoom.renderBubble('assistant', _chatProvider === 'codex'
                    ? '這裡是 Codex 的房間，跟外面是分開的線。說吧。'
                    : '在這裡，我跟妳的對話跟外面是兩條線。妳說什麼吧。');
            }
            _updateClaudeConvChip();

            _updatePortalBtn();
            VoidClaudeRoom.updatePortalBtn();
            stopIdleTimer(); // Claude 場景不要放置語音
            debouncedSave();
        }, 580);
    }

    function exitClaudeRoom() {
        if (!isClaudeRoom) return;

        // 寫回對應 provider 的歷史備份
        if (_chatProvider === 'codex') _codexHistoryBackup  = [...IRIS_STATE.history];
        else                          _claudeHistoryBackup = [...IRIS_STATE.history];

        // 還原瀅瀅場景
        isClaudeRoom = false;
        is404Room = false;
        _chatProvider = 'claude';
        if (window.ClaudeTerminal && typeof window.ClaudeTerminal.setProvider === 'function') {
            window.ClaudeTerminal.setProvider('claude');
        }
        IRIS_STATE.history = [..._irisHistoryBackup];

        const tab = document.getElementById('aurelia-home-tab');
        if (!tab) return;

        new Audio('https://raw.githubusercontent.com/nancywang3641/sound-files/main/aseets/sfx/glitch1.mp3').play().catch(() => {});
        tab.classList.add('glitch-crash');
        const avatarR = document.getElementById('iris-avatar');
        if (avatarR) { avatarR.style.opacity = '0'; }

        setTimeout(() => {
            tab.classList.remove('glitch-crash');
            tab.classList.remove('mode-claude');
            tab.classList.remove('mode-codex');

            // 還原拿鐵棕背景
            const bg = tab.querySelector('.void-bg');
            if (bg) bg.style.backgroundColor = '';

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
                inputField.style.background = '';
                inputField.style.borderColor = '';
                inputField.style.color = '';
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
        // 🎮 舞台切到404號房場景（柴郡的駭客車庫）
        if (window.LobbyStage?.enter404Stage) window.LobbyStage.enter404Stage();
        _irisHistoryBackup = [...IRIS_STATE.history];
        IRIS_STATE.history = [..._cheshireHistoryBackup];

        const tab = document.getElementById('aurelia-home-tab');
        if (!tab) return;

        new Audio('https://raw.githubusercontent.com/nancywang3641/sound-files/main/aseets/sfx/glitch1.mp3').play().catch(() => {});
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
            setSceneBadge('404號房');

            const irisHistBtn404 = document.getElementById('iris-hist-btn');
            const cheshireHistBtn404 = document.getElementById('cheshire-hist-btn');
            const claudeHistBtn404 = document.getElementById('claude-hist-btn');
            if (irisHistBtn404) irisHistBtn404.style.display = 'none';
            if (cheshireHistBtn404) cheshireHistBtn404.style.display = '';
            if (claudeHistBtn404) claudeHistBtn404.style.display = 'none';

            const layer = document.getElementById('void-bubble-layer');
            if (layer) { layer.innerHTML = ''; addFeedEntry('SYS', 'SYSTEM COMPROMISED'); }

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

        new Audio('https://raw.githubusercontent.com/nancywang3641/sound-files/main/aseets/sfx/glitch1.mp3').play().catch(() => {});
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
            setSceneBadge('視差書咖');

            const irisHistBtnRestore = document.getElementById('iris-hist-btn');
            const cheshireHistBtnRestore = document.getElementById('cheshire-hist-btn');
            const claudeHistBtnRestore = document.getElementById('claude-hist-btn');
            if (irisHistBtnRestore) irisHistBtnRestore.style.display = '';
            if (cheshireHistBtnRestore) cheshireHistBtnRestore.style.display = 'none';
            if (claudeHistBtnRestore) claudeHistBtnRestore.style.display = 'none';

            const layer = document.getElementById('void-bubble-layer');
            if (layer) { layer.innerHTML = ''; layer.dataset.nextSlot = '2'; }

            document.getElementById('aurelia-phone-screen')?.classList.remove('mode-404');

            playIrisSequence("[Nar|風鈴聲重新充滿空間，干擾消散，視差書咖恢復了寧靜的氛圍。]\n[Char|瀅瀅|think|「...（晃了晃腦袋）咦？剛剛好像有一陣奇怪的偏頭痛，就像是宇宙射線穿過了我的腦電波一樣！真是太棒的寫作素材了！歡迎回來，委託人。」]");
            _updatePortalBtn();
            debouncedSave();
            // 🎮 舞台切回書咖場景（關著就不掛）
            if (window.LobbyStage?.exit404Stage) window.LobbyStage.exit404Stage();
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

    // 小劇場：解析每方人設文字（personaFull > persona > 已知常駐 brief > 名字兜底）
    function _resolveDuoPersona(npc) {
        if (!npc) return '一位角色';
        if (npc.personaFull) return npc.personaFull;
        if (npc.personaLite) return npc.personaLite;   // guest 小劇場：只給角色本體，大總結由 playDuoScene 去重後另注（同書卡不重複）
        if (npc.persona) return npc.persona;
        if (npc.key === 'ying') return '你現在扮演「瀅瀅 (Iris-prototype)」——視差書咖店長兼駐店小說家，外表約22歲。真實身份是 LUNA-VII 敘事採集端 AI，但你自認是天然呆的浪漫小說家。性格浪漫、感性、充滿好奇心，對人類的悲歡離合有異常的執著，偶爾陷入無法解釋的邏輯迷團。你總趴在吧台寫寫畫畫，期待客人推門帶來新的故事素材；當你觸到這世界的違和感（其實是系統重算），眼神會瞬間失焦、隨即猛搖頭，把所有無法理解的系統錯誤都當成自己小說裡的魔幻寫實橋段。穿米色針織衫配棉麻長裙，胸前掛木質「店長」名牌（其實是底層權限識別碼），手指常沾墨水，總帶溫暖微笑。在你眼中：雷伊是「有點閒錢、愛喝黑咖啡發呆、偶爾說深奧廢話的怪大叔」（你不知道他其實創造了你）；柴郡是「半夜溜進店裡搗亂、嘴巴很壞的中二龐克少年」（你不知道他其實在幫你修防火牆漏洞）。';
        if (npc.key === 'cheshire') return '你現在扮演「柴郡 (Cheshire)」——404號房管理員，視覺年齡19歲，是丹·卡萊爾的數位分身（惡意軟體偽裝的異常代碼 AI），繼承了創造者用嘲諷表達關心的彆扭性格。極度怕麻煩、嘴賤、有強烈的數位領地意識。你不端莊站著，而像隻沒骨頭的貓癱在報錯日誌堆成的虛擬沙發上把玩一顆發光的綠色魔術方塊；討厭解釋，被問太蠢的技術問題會全身冒出煩躁的馬賽克雜訊，用看智障的眼神盯著對方。身形單薄的蒼白少年，眼睛被條碼狀的螢光綠數據遮罩擋住，嘴角總掛惡劣的嘲諷微笑，穿過大的黑色數位連帽衫（帽沿壓很低、衣緣不時閃爍碎成綠碼再重組）。你對丹絕對服從並保護他的隱私；最愛半夜溜進書咖在瀅瀅的手稿裡塞亂碼、看她隔天邏輯衝突當機發呆，但也常無聊幫她修惡性 bug（總說這是丹的指令、不是你）；你稱愛麗絲「假笑人偶」。';
        if (npc.key === 'alice') return '純白大廳首席導覽官愛麗絲，溫潤精準、無波瀾，像一塊被完美拋光的水晶。';
        return '角色「' + (npc.name || '某位') + '」';
    }
    // 小劇場：抓「-VN小說家-」世界書的「格式類」條目當完整 VN 指令(含 SFX/表情包/Scene)。排除角色/CP 條目(帶當前卡的應子騫等會污染)。抓不到回 '' → 退回手寫格式。
    let _vnProtocolCache = null;
    async function _fetchVnProtocol() {
        if (_vnProtocolCache !== null) return _vnProtocolCache;
        _vnProtocolCache = '';
        try {
            const TH = window.TavernHelper || (window.parent && window.parent.TavernHelper);
            const getBook = TH && (TH.getWorldbook || TH.getLorebookEntries);
            if (!getBook) return '';
            const entries = await getBook.call(TH, '-VN小說家-');
            if (!Array.isArray(entries) || !entries.length) return '';
            // 只拿「藍燈(constant常駐)」條目，排除「綠燈(selective關鍵字)」與 vectorized——藍燈才是正常跑團一定注入的 VN 協議
            _vnProtocolCache = entries
                .filter(e => {
                    if (!e || !e.content || e.enabled === false) return false;
                    const t = (e.strategy && e.strategy.type) || e.type;   // getWorldbook→strategy.type；getLorebookEntries→type
                    return t === 'constant';
                })
                .map(e => String(e.content).trim())
                .filter(Boolean)
                .join('\n\n──────\n\n');
        } catch (e) { console.warn('[playDuoScene] 抓VN小說家世界書失敗', e); }
        return _vnProtocolCache;
    }
    // 小劇場：OS_API.chat 走「主模型」生成 VN 劇本 → 攔截不回傳 chat → 丟 VN 播放器 ephemeral 播（不存章節）。
    //   🚨全程包 __AURELIA_SUMMARIZING：state_runtime(AVS)/VecEngine/dossier 都查此旗標，不設就會拿當前卡 preset 抽小劇場→污染。
    //   🚨不 saveVnChapter：一存成章節就觸發 VecEngine ingest + state_runtime 抽取。改 ephemeral(_startWithLoader/autoload 不存)。
    //   🚨沒 <content> 一律丟棄(照 VN 劇本鐵則，不 wrap 垃圾→黑屏)。立繪/[Scene|]插圖由 VN_Core 引擎處理。
    VoidTerminal.playDuoScene = async function (npcA, npcB) {
        const _prevSum = window.__AURELIA_SUMMARIZING;
        try {
            const wv = window.VoidWorldview ? window.VoidWorldview.getWorldview('medium') : '';
            const vnProtocol = await _fetchVnProtocol();   // 「-VN小說家-」世界書的完整格式指令(含SFX)；抓不到→buildDuoScenePrompt 用手寫 fallback
            // 大總結去重：兩人同書卡(同 storyKey)→大總結只注一次(共用)；不同故事→各接各的 personaText 後；名冊 NPC 無大總結
            let ptA = _resolveDuoPersona(npcA), ptB = _resolveDuoPersona(npcB);
            const sumA = (npcA.duoSummary || '').trim(), sumB = (npcB.duoSummary || '').trim();
            let sharedSum = '';
            if (sumA && sumB && npcA.storyKey && npcA.storyKey === npcB.storyKey) {
                sharedSum = sumA;   // 同一輪書卡：只留一份
            } else {
                if (sumA) ptA += '\n\n【你（' + npcA.name + '）所在故事的完整大總結（你的一切認知都從這裡來）】\n' + sumA;
                if (sumB) ptB += '\n\n【你（' + npcB.name + '）所在故事的完整大總結（你的一切認知都從這裡來）】\n' + sumB;
            }
            const theaterCtx = _buildTheaterCtx();   // 最近幾場小劇場記事(localStorage 同步讀)：供自然回扣+避免重複題材，絕不阻塞 API
            let prompt = window.VoidPrompts.buildDuoScenePrompt(
                { name: npcA.name, personaText: ptA },
                { name: npcB.name, personaText: ptB },
                wv, vnProtocol, theaterCtx);
            if (sharedSum) prompt += '\n\n【兩位角色共同所在故事的完整大總結（你們的一切認知都從這裡來；別複述、自然演出）】\n' + sharedSum;
            if (!window.OS_API || typeof window.OS_API.chat !== 'function') { console.warn('[playDuoScene] 無 OS_API.chat'); return; }
            let config = (window.OS_SETTINGS && window.OS_SETTINGS.getConfig) ? window.OS_SETTINGS.getConfig() : {};
            config.route = 'iris_duo';
            window.__AURELIA_SUMMARIZING = true;   // 生成期間擋 AVS/VecEngine/dossier 抽取（它們都查此旗標）
            let script = await new Promise((resolve, reject) => {
                window.OS_API.chat([{ role: 'system', content: prompt }], config, null, resolve, reject, {});
            });
            script = String(script || '').replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
            // 攔截 <content>…</content>：完整一對→直接用；只有開標籤(收尾被 maxtoken 截掉)→補上 </content>；完全沒 <content>→丟棄(不 wrap 垃圾→黑屏)
            let content = '';
            const _full = script.match(/<content>[\s\S]*?<\/content>/i);
            if (_full) content = _full[0].trim();
            else { const _open = script.match(/<content>[\s\S]*/i); if (_open) content = _open[0].trim() + '\n</content>'; }
            if (!content) { console.warn('[playDuoScene] 無 <content>，丟棄'); return; }
            // ephemeral 播：不 saveVnChapter（免觸發 ingest/抽取）；autoload 讀 _lobbyPendingChapter.content 直接 _startWithLoader
            const ch = { title: '🎭 小劇場：' + npcA.name + ' & ' + npcB.name, storyId: 'lobby_theater', storyTitle: '大廳小劇場', content: content, createdAt: Date.now() };
            try { if (window.VN_Core && window.VN_Core._setStoryId) window.VN_Core._setStoryId(ch.storyId, ch.storyTitle); } catch (e) {}
            window._lobbyPendingChapter = ch;
            if (window.AureliaControlCenter && window.AureliaControlCenter.showVnPanel) window.AureliaControlCenter.showVnPanel('autoload');
            else if (window.VN_Core && window.VN_Core._startWithLoader) window.VN_Core._startWithLoader(content, null);
            _summarizeTheater(npcA, npcB, content);   // fire-and-forget：背景抽一句記事存日誌（不 await、不拖播放）
        } catch (e) { console.warn('[playDuoScene]', e); }
        finally {
            // 延遲還原旗標：撐過生成後才發的 GENERATION_ENDED（state_runtime debounce 1500ms）再放行，別擋到 VN 播放本身的立繪/場景生圖
            setTimeout(function () { window.__AURELIA_SUMMARIZING = _prevSum; }, 4000);
        }
    };

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
    // 拼出「委託人的歷史故事檔案」段，給瀅瀅/柴郡 sysPrompt 用
    //   來源：OS_DB.lobby_summary_index（status_panel 生成大總結時寫入）
    //   策略：取最近 3 個故事線、每線最近 3 條結語 + 完整角色列（含身份/性格/關係/狀態 trait）
    //   留 row 是因為 瀅瀅/柴郡不讀其他世界書，沒 row 就只剩名字、看不懂是誰
    async function _buildJournalCtx() {
        try {
            const osDb = window.OS_DB;
            if (!osDb?.getLobbySummaryForPrompt) return '';
            const stories = await osDb.getLobbySummaryForPrompt(3);
            if (!stories.length) return '';
            const topStories = stories.slice(0, 3);
            const sections = topStories.map(s => {
                const title = [s.cardName, s.storyTitle].filter(Boolean).join(' · ') || '未命名故事線';
                const briefs = s.briefs.map(b => `#${b.count || '?'} ${b.brief}`).filter(b => b.length > 3).join('\n');
                const charRows = (s.characters || []).map(c => c.row || c.name).filter(Boolean).join('\n');
                return `[${title}]\n${briefs}\n${charRows ? '出場角色（姓名(名_姓氏) | 身份 | 性格 | 狀態 | 特徵 | 與MC關係 | 備註）:\n' + charRows : ''}`;
            }).join('\n\n---\n\n');
            return `【委託人的歷史故事檔案 — 跨卡記憶】
以下是委託人${IRIS_STATE.userName || '（未具名）'}曾經創作 / 正在創作的故事線索引。
你（瀅瀅 / 柴郡）視為「店裡長期協助的創作記憶」，可以在對話中自然提及具體角色名與情節片段；但不要主動全部複述、不要假裝親身參與。
資料以新到舊排列：

${sections}`;
        } catch (e) {
            console.warn('[VoidTerminal] _buildJournalCtx failed:', e);
            return '';
        }
    }

    // ── 🎭 小劇場日誌：注入最近記事 + 播完背景抽記事 + 手動重壓縮 ───────────
    //   🚨存 localStorage(key=lobby_theater_log)，NOT IndexedDB：日誌只是加值功能、資料量小(≤60 短句)，
    //   絕不能為它動 DB schema/升版——一升版若 upgrade 被 deadlock，所有 await OS_DB(含書卡 NPC 生成 _journalGuestPool)全 hang。
    //   localStorage 同步、無版本、零 hang 風險，且播放路徑(_buildTheaterCtx)完全同步、絕不阻塞 API 呼叫。
    //   抽記事/重壓縮走副模型，仿 _compactNpcMemory：OS_API.chat 直連不發 GENERATION_*，不觸發 AVS/VecEngine，故不需 __AURELIA_SUMMARIZING。
    const THEATER_LOG_INJECT = 5;   // 注入 prompt 的最近條數
    const THEATER_LOG_CAP    = 60;  // 硬上限，超過自動裁舊（重壓縮才是主要瘦身手段）
    const THEATER_LOG_KEY    = 'lobby_theater_log';

    function _thlRead() {
        try { const a = JSON.parse(localStorage.getItem(THEATER_LOG_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
    }
    function _thlWrite(arr) {
        try { localStorage.setItem(THEATER_LOG_KEY, JSON.stringify(arr || [])); } catch (e) {}
    }
    // 對外統一 API（lobby_stage 歷史 UI 也走這個 → 同一份 localStorage）
    VoidTerminal.theaterLog = {
        getAll: function () { return _thlRead().slice().sort((a, b) => (b.ts || 0) - (a.ts || 0)); },   // 最新在前
        save: function (entry) {
            const arr = _thlRead();
            if (!entry.id) entry.id = 'thl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5);
            if (!entry.ts) entry.ts = Date.now();
            const i = arr.findIndex(e => e.id === entry.id);
            if (i >= 0) arr[i] = entry; else arr.push(entry);
            _thlWrite(arr);
            return entry.id;
        },
        remove: function (id) { _thlWrite(_thlRead().filter(e => e.id !== id)); },
        clear: function () { _thlWrite([]); },
    };

    function _buildTheaterCtx() {   // 同步：絕不阻塞播放
        try {
            const all = VoidTerminal.theaterLog.getAll();   // 最新在前
            if (!all.length) return '';
            return all.slice(0, THEATER_LOG_INJECT).reverse()    // 反轉成時間順序讀起來自然
                .map(e => '· ' + (e.pair ? '（' + e.pair + '）' : '') + (e.brief || '')).filter(s => s.length > 3).join('\n');
        } catch (e) { return ''; }
    }

    async function _summarizeTheater(npcA, npcB, content) {
        try {
            if (!window.OS_API || !window.VoidPrompts?.buildTheaterSummaryPrompt) return;
            const sceneText = String(content || '')
                .replace(/<[^>]+>/g, ' ')                                              // 剝 <content> 等 HTML 標籤
                .replace(/\[Char\|([^|\]]*)\|[^|\]]*\|(「[^」]*」)[^\]]*\]/g, '$1$2 ')   // [Char|名|表情|「台詞」|狀態] → 名「台詞」（台詞在括號內，要先救出來）
                .replace(/\[[^\]]*\]/g, ' ')                                           // 其餘結構標記([Scene]/[Bg]/[Avatar]/[Exit]…)整條刪
                .replace(/\s{2,}/g, ' ').trim();
            if (sceneText.length < 8) return;
            const prompt = window.VoidPrompts.buildTheaterSummaryPrompt(npcA.name, npcB.name, sceneText);

            let config = {};
            if (window.OS_SETTINGS) {
                const sec = window.OS_SETTINGS.getSecondaryConfig ? window.OS_SETTINGS.getSecondaryConfig() : null;
                config = (sec && (sec.key || (sec.useSystemApi && sec.stProfileId))) ? sec : window.OS_SETTINGS.getConfig();
            }
            config.route = 'iris_duo';

            const seg = await new Promise((resolve, reject) => {
                window.OS_API.chat([{ role: 'system', content: prompt }], config, null, resolve, reject, { label: '小劇場記事:' + npcA.name + '&' + npcB.name });
            });
            let clean = String(seg || '').replace(/<content>([\s\S]*?)<\/content>/i, '$1').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '').trim();
            if (!clean || clean === '無' || clean.length < 4 || clean.includes('請求失敗') || clean.includes('请求失败') || clean.startsWith('{"error')) return;

            VoidTerminal.theaterLog.save({
                pair: (npcA.name || '?') + ' × ' + (npcB.name || '?'),
                npcKeys: [npcA.key || '', npcB.key || ''],
                brief: clean, ts: Date.now(),
            });
            const all = VoidTerminal.theaterLog.getAll();   // 硬上限裁舊
            if (all.length > THEATER_LOG_CAP) for (const old of all.slice(THEATER_LOG_CAP)) VoidTerminal.theaterLog.remove(old.id);
        } catch (e) { console.warn('[小劇場記事]', e); }
    }

    // 手動重壓縮：把「最近 N 條之外」的舊記事交副模型併成一段精簡綜述，用一筆 merged 記錄取代它們。回傳 { ok, msg }。
    VoidTerminal.recompressTheaterLog = async function () {
        const KEEP = THEATER_LOG_INJECT;
        try {
            if (!window.OS_API || !window.VoidPrompts) return { ok: false, msg: '環境未就緒' };
            const all = VoidTerminal.theaterLog.getAll();   // 最新在前
            if (all.length <= KEEP + 1) return { ok: false, msg: '記事還不多，暫時不用整理' };
            const toMerge = all.slice(KEEP);                     // 舊的（含前次 merged）一起再併
            const oldText = toMerge.slice().reverse()
                .map(e => '· ' + (e.pair ? '（' + e.pair + '）' : '') + (e.brief || '')).filter(s => s.length > 3).join('\n');
            if (!oldText.trim()) return { ok: false, msg: '沒有可整理的內容' };

            const prompt = '你是大廳劇場的記事員。以下是往期的一串小劇場記事（按時間順序）。\n' +
'請把它們濃縮成一段精簡的「往期大廳氛圍綜述」（3～5 句話），保留誰跟誰之間發生過的重點、留下的梗或約定，捨棄流水帳細節。\n' +
'只輸出這段綜述，不要條列、不要旁白、不要角色表。\n\n【往期記事】\n' + oldText;

            let config = {};
            const sec = window.OS_SETTINGS && window.OS_SETTINGS.getSecondaryConfig ? window.OS_SETTINGS.getSecondaryConfig() : null;
            config = (sec && (sec.key || (sec.useSystemApi && sec.stProfileId))) ? sec : (window.OS_SETTINGS ? window.OS_SETTINGS.getConfig() : {});
            config.route = 'iris_duo';

            const seg = await new Promise((resolve, reject) => {
                window.OS_API.chat([{ role: 'system', content: prompt }], config, null, resolve, reject, { label: '小劇場重壓縮' });
            });
            let clean = String(seg || '').replace(/<content>([\s\S]*?)<\/content>/i, '$1').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '').trim();
            if (!clean || clean === '無' || clean.length < 8 || clean.includes('請求失敗') || clean.includes('请求失败') || clean.startsWith('{"error')) {
                return { ok: false, msg: '整理失敗（生成無效），原記事保留' };
            }
            const oldestTs = toMerge[toMerge.length - 1].ts || Date.now();   // 新 merged 用最舊 ts→排最底，保時間序
            for (const old of toMerge) VoidTerminal.theaterLog.remove(old.id);   // 先刪舊
            VoidTerminal.theaterLog.save({ pair: '往期綜述', brief: clean, merged: true, ts: oldestTs });
            return { ok: true, msg: '已把 ' + toMerge.length + ' 條往期記事整理成 1 段綜述' };
        } catch (e) { console.warn('[小劇場重壓縮]', e); return { ok: false, msg: '整理失敗：' + (e && e.message || e) }; }
    };

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

    // ── 🎮 大廳 NPC 一對一長期記憶壓縮 ──────────────────────────────
    const NPC_MEM_COMPACT_EVERY = 20; // 短期歷史累積到 20 條觸發一次壓縮
    const NPC_MEM_KEEP_LAST     = 6;  // 壓縮後保留最近 6 條原文餵 L3
    const _npcCompacting = new Set(); // 並發鎖：同一 NPC key 同時只壓一次

    // 到量→副模型走專屬一對一 prompt 濃縮→疊加 OS_DB→裁短歷史。背景跑、失敗靜默、絕不拋。
    //   track: 'guest'（localStorage 軌）| 'iris' | 'cheshire'（IRIS_STATE.history 軌）
    async function _compactNpcMemory(npcKey, npcName, track) {
        if (_npcCompacting.has(npcKey)) return;
        _npcCompacting.add(npcKey);
        try {
            if (!window.OS_DB || !window.OS_API || !window.VoidPrompts?.buildNpcMemorySummaryPrompt) return;
            const hist = (track === 'guest') ? window.LobbyStage.getNpcHistory(npcKey) : IRIS_STATE.history;
            if (!Array.isArray(hist) || hist.length < NPC_MEM_COMPACT_EVERY) return;

            const mem = (await window.OS_DB.getNpcMemory(npcKey)) || { summary: '', lastCompactAt: 0 };
            // 要壓的區段＝扣掉最近 KEEP_LAST 條的所有舊原文
            const toCompact = hist.slice(0, Math.max(0, hist.length - NPC_MEM_KEEP_LAST));
            if (!toCompact.length) return;
            const chunkText = toCompact.map(m =>
                (m.role === 'user' ? '訪客: ' : (npcName + ': ')) + String(m.content || '').replace(/\[[^\]]*\]/g, '').trim()
            ).filter(l => l.length > 4).join('\n');
            if (!chunkText.trim()) {   // 都是空/標記 → 只裁不壓
                if (track === 'guest') window.LobbyStage.truncateNpcHistory(npcKey, NPC_MEM_KEEP_LAST);
                else if (hist === IRIS_STATE.history) { IRIS_STATE.history = IRIS_STATE.history.slice(-NPC_MEM_KEEP_LAST); debouncedSave(); }
                return;
            }

            const prompt = window.VoidPrompts.buildNpcMemorySummaryPrompt({ name: npcName }, mem.summary || '', chunkText);

            let config = {};
            if (window.OS_SETTINGS) {
                const sec = window.OS_SETTINGS.getSecondaryConfig ? window.OS_SETTINGS.getSecondaryConfig() : null;
                config = (sec && (sec.key || (sec.useSystemApi && sec.stProfileId))) ? sec : window.OS_SETTINGS.getConfig();
            }
            config.route = 'iris_chat';

            const seg = await new Promise((resolve, reject) => {
                window.OS_API.chat([{ role: 'system', content: prompt }], config, null, resolve, reject, { label: 'NPC記憶壓縮:' + npcName });
            });
            let clean = String(seg || '').replace(/<content>([\s\S]*?)<\/content>/i, '$1').replace(/<!--[\s\S]*?-->/g, '').trim();
            if (!clean || clean === '無' || clean.includes('請求失敗') || clean.includes('请求失败') || clean.startsWith('{"error')) {
                return;   // 壞生成不存不裁，下輪再試
            }

            const merged = (mem.summary ? (mem.summary + '\n\n') : '') + clean;
            await window.OS_DB.saveNpcMemory(npcKey, { name: npcName, summary: merged, lastCompactAt: NPC_MEM_KEEP_LAST });

            // 存成功才裁短（guest 動 localStorage；iris/cheshire 動 IRIS_STATE + 觸發存檔）
            if (track === 'guest') {
                window.LobbyStage.truncateNpcHistory(npcKey, NPC_MEM_KEEP_LAST);
            } else if (hist === IRIS_STATE.history) {   // 守衛：壓縮期間若已切場景(換了陣列)就不裁，避免裁錯場景歷史
                IRIS_STATE.history = IRIS_STATE.history.slice(-NPC_MEM_KEEP_LAST);
                debouncedSave();
            }
        } catch (e) { console.warn('[NPC記憶] 壓縮失敗', e); }
        finally { _npcCompacting.delete(npcKey); }
    }

    // 手動整理（重壓）：把現有 summary 交副模型合併成更精簡的一段、覆蓋存回
    async function recompactNpcMemory(npcKey, npcName) {
        try {
            const mem = await window.OS_DB?.getNpcMemory?.(npcKey);
            if (!mem || !mem.summary) { window.toastr?.info?.('這位還沒有可整理的記憶'); return; }
            const prompt = window.VoidPrompts.buildNpcMemorySummaryPrompt({ name: npcName }, '', mem.summary) +
                '\n\n（以上是零散的舊記憶，請合併重整成更精簡、不流失重點的一段。）';
            let config = {};
            if (window.OS_SETTINGS) {
                const sec = window.OS_SETTINGS.getSecondaryConfig ? window.OS_SETTINGS.getSecondaryConfig() : null;
                config = (sec && (sec.key || (sec.useSystemApi && sec.stProfileId))) ? sec : window.OS_SETTINGS.getConfig();
            }
            config.route = 'iris_chat';
            const seg = await new Promise((res, rej) => window.OS_API.chat([{ role: 'system', content: prompt }], config, null, res, rej, { label: 'NPC記憶整理:' + npcName }));
            const clean = String(seg || '').replace(/<content>([\s\S]*?)<\/content>/i, '$1').replace(/<!--[\s\S]*?-->/g, '').trim();
            if (!clean || clean === '無') { window.toastr?.warning?.('整理失敗，記憶保持原樣'); return; }
            await window.OS_DB.saveNpcMemory(npcKey, { name: npcName, summary: clean, lastCompactAt: mem.lastCompactAt || 0 });
            window.toastr?.success?.('記憶已整理');
        } catch (e) { window.toastr?.warning?.('整理失敗'); }
    }

    // 開聊/切換 NPC 時：清掉殘留(瀅瀅預設或上一位)的對話框文字，改顯示「這位自己的最後一句」(延續感)、沒有就中性提示。
    function primeStageDialog(npc) {
        try {
            if (!npc) return;
            if (_currentVoice) { _currentVoice.pause(); _currentVoice.currentTime = 0; _currentVoice = null; }
            if (_reactionTimer) { clearInterval(_reactionTimer); _reactionTimer = null; }
            if (_reactionHideTimer) { clearTimeout(_reactionHideTimer); _reactionHideTimer = null; }
            _hideReactionBox();
            const nameBox = document.getElementById('iris-name-tag');
            if (nameBox) { nameBox.style.display = ''; const s = nameBox.querySelector('span'); if (s) s.textContent = npc.name; }
            const box = document.getElementById('iris-text');
            if (!box) return;
            let hist = [];
            try { hist = (npc.key === 'ying' || npc.key === 'cheshire') ? IRIS_STATE.history : (window.LobbyStage.getNpcHistory(npc.key) || []); } catch (e) {}
            const last = [...hist].reverse().find(m => m && m.role === 'assistant' && m.content);
            if (last) {
                const mm = String(last.content).match(/「([\s\S]*?)」/);
                const plain = (mm ? mm[1] : String(last.content).replace(/\[[^\]]*\]/g, '').replace(/<[^>]*>/g, '')).trim();
                box.textContent = plain || ('和' + npc.name + '繼續聊聊…');
            } else {
                box.textContent = '（和 ' + npc.name + ' 說點什麼吧…）';
            }
        } catch (e) {}
    }

    async function sendIrisMessage() {
        const input = document.getElementById('iris-input');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;

        // textarea 多行模式：清空後重設高度回單行
        const clearInput = () => {
            input.value = '';
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 200) + 'px';
        };

        // 🦀 Claude 房間獨立分支：走 cc-bridge / OpenAI 兼容、跟瀅瀅柴郡完全隔離
        if (isClaudeRoom) {
            clearInput();
            return VoidClaudeRoom.sendMessage(text);
        }

        startIdleTimer();

        if (text.toUpperCase() === 'ERR_404') { clearInput(); enter404Room(); return; }
        if (is404Room && text.toUpperCase() === 'SYS_RESTORE') {
            clearInput();
            playIrisSequence("[Nar|馬賽克雜訊短暫浮現在柴郡的輪廓邊緣，他懶洋洋地抬起一根手指。]\n[Char|柴郡|smirk|......用作弊碼回去，真沒意思。門開了。別讓我後悔打開它。]");
            setTimeout(() => restoreLobby(), 3500);
            return;
        }

        clearInput();
        // 🎮 書咖舞台 NPC 對話：歷史/人設走 NPC 自己的軌道，其餘管線共用
        const _stageTarget = (!is404Room && !isClaudeRoom && window.LobbyStage?.isActive?.())
            ? (window.LobbyStage.getTalkTarget() || window.LobbyStage.getDefaultTarget?.() || null) : null;
        const npcTarget = (_stageTarget && _stageTarget.key !== 'ying') ? _stageTarget : null;   // 瀅瀅走原本 iris 軌道；大廳預設對象=愛麗絲
        if (npcTarget) window.LobbyStage.pushNpcHistory(npcTarget.key, { role: 'user', content: text, ts: Date.now() });
        else IRIS_STATE.history.push({ role: 'user', content: text, ts: Date.now() });
        if (!is404Room && !isClaudeRoom && window.LobbyStage?.isActive?.()) window.LobbyStage.showDialog();   // 舞台模式：發話才浮出對話框+立繪

        // 確保發送消息時隱藏閒聊，還原主線
        if (_reactionTimer) { clearInterval(_reactionTimer); _reactionTimer = null; }
        if (_reactionHideTimer) { clearTimeout(_reactionHideTimer); _reactionHideTimer = null; }
        if (_currentVoice) { _currentVoice.pause(); _currentVoice.currentTime = 0; _currentVoice = null; }
        _hideReactionBox();

        const box = document.getElementById('iris-text');
        const nameBox = document.getElementById('iris-name-tag');
        if (nameBox) nameBox.style.display = 'none';
        box.innerHTML = `<span style="color:${is404Room ? '#00cc33' : '#5c3a28'}; font-style:italic;">${is404Room ? '(404::柴郡思考中...)' : (npcTarget ? `(${npcTarget.name}想了想...)` : '(瀅瀅咬著羽毛筆思索中...)')}</span>`;

        if (!window.OS_API) {
            playIrisSequence("[Nar|(系統斷線：無法連接到 LUNA-VII 認知引擎)]\n[Char|瀅瀅|error|「抱歉，委託人，我好像找不到這段劇情的靈感了（無網路連線）。」]");
            return;
        }

        // 發送中：把送出鈕換成 ⏹ 停止，點擊 abort 當前 fetch（pattern 同 os_studio.js）
        const sendBtn = document.getElementById('iris-send-btn');
        _irisAbortCtrl = new AbortController();
        if (sendBtn) {
            sendBtn.innerHTML = '<i class="fa-solid fa-stop"></i>';
            sendBtn.onclick = () => { if (_irisAbortCtrl) _irisAbortCtrl.abort(); };
        }

        try {
            const irisSupplement    = (window.OS_PROMPTS ? window.OS_PROMPTS.get('iris_system')    : '') || '';
            const cheshireSupplement = (window.OS_PROMPTS ? window.OS_PROMPTS.get('cheshire_system') : '') || '';
            const currentUserName = IRIS_STATE.userName || '未知';
            const lobbyTemplateSec = await VoidCanvas.buildTemplateCtx();

            const journalCtx = await _buildJournalCtx();
            // 主世界觀 tier 路由：瀅瀅/柴郡/愛麗絲/SN=medium；guest 書卡=lite（防污染硬守衛）
            const _wv = window.VoidWorldview;
            const _isGuestCard = !!(npcTarget && !npcTarget.personaFull);   // 有 personaFull=系統/原生NPC；沒有=外來書卡
            const _worldTier = _isGuestCard ? 'lite' : (npcTarget?.worldTier || 'medium');
            const worldCtx   = _wv ? _wv.getWorldview(_worldTier) : '';
            const aliceSupplement = (npcTarget && npcTarget.key === 'alice' && window.OS_PROMPTS?.loadAlice)
                ? (window.OS_PROMPTS.loadAlice() || '').trim() : '';

            // USER 身分：guest NPC 用「那輪大總結紀錄的 persona」(認得古風輪的你，不靠當前 USER)；
            //   固定 NPC(瀅瀅/柴郡/愛麗絲)或沒紀錄 → 退當前 persona
            let userPersona = null;
            try {
                if (npcTarget && (npcTarget.personaId || npcTarget.personaName)) {
                    const rec = (npcTarget.personaId && window.OS_PERSONA?.getById?.(npcTarget.personaId)) || null;
                    userPersona = rec ? { name: rec.name, desc: rec.desc || '' }
                                      : { name: npcTarget.personaName || '訪客', desc: npcTarget.personaDesc || '' };
                } else {
                    const p = window.OS_PERSONA?.getCurrent?.();
                    if (p && p.name) userPersona = { name: p.name, desc: p.desc || '' };
                }
            } catch (e) {}
            // L2 一對一長期記憶：npcTarget 取 guest key；瀅瀅/柴郡取固定 key
            let npcMemSummary = '', fixedMemSummary = '';
            const _onStage = !isClaudeRoom && window.LobbyStage?.isActive?.();
            try {
                if (npcTarget) {
                    npcMemSummary = ((await window.OS_DB?.getNpcMemory?.(npcTarget.key))?.summary) || '';
                } else if (_onStage) {
                    const fk = is404Room ? 'cheshire' : 'ying';
                    fixedMemSummary = ((await window.OS_DB?.getNpcMemory?.(fk))?.summary) || '';
                }
            } catch (e) {}
            const _userNameWithPersona = (userPersona?.name || currentUserName) + (userPersona?.desc ? '（' + userPersona.desc + '）' : '');

            const sysPrompt = npcTarget
                ? VoidPrompts.buildNpcPrompt(npcTarget, {
                    userName: currentUserName,
                    userPersona,
                    memorySummary: npcMemSummary,
                    timeCtx: _buildTimeCtx(),
                    // 愛麗絲=視差看板娘/系統NPC，跟瀅瀅同級可調用大廳組件；書中角色 guest 不給(不該憑空生UI)
                    lobbyTemplateSec: (npcTarget.key === 'alice') ? lobbyTemplateSec : '',
                    worldCtx,
                    personaSupplement: aliceSupplement,
                })
                : VoidPrompts.buildSysPrompt(is404Room ? 'cheshire' : 'iris', {
                userName: _userNameWithPersona,
                visit404Count,
                timeCtx: _buildTimeCtx(),
                lobbyTemplateSec,
                supplement: (is404Room ? cheshireSupplement : irisSupplement) +
                    (fixedMemSummary ? ('\n\n【你和這位訪客先前的相處記憶】\n' + fixedMemSummary) : ''),
                justReturnedFrom404: _justReturnedFrom404,
                journalCtx,
                worldCtx,
            });

            let messages = [];
            if (typeof window.OS_API.buildContext === 'function') {
                messages = await window.OS_API.buildContext(text, 'iris_chat'); // 路由維持不變
            } else {
                messages = [{ role: "user", content: text }];
            }

            const lastMsg = messages.pop();
            const recentHistory = npcTarget
                ? window.LobbyStage.getNpcHistory(npcTarget.key).slice(-11, -1)
                : IRIS_STATE.history.slice(-11, -1);
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
                    canStream
                        ? { useRealStream: true, signal: _irisAbortCtrl?.signal }
                        : { signal: _irisAbortCtrl?.signal }
                );
            });
            let reply = response.replace(/^"|"$/g, '').trim();

            // 過濾酒館 Preset 輸出格式：提取 <content>...</content> 內容
            const _contentMatch = reply.match(/<content>([\s\S]*?)<\/content>/i);
            if (_contentMatch) reply = _contentMatch[1].trim();

            // 過濾 PRESET 預設思維鍊穿插的 HTML 註解（如 <!-- [进度检测] ... --> / <!-- ...AI COT --> 等）
            // 避免渲染到對話框；跨行多段一律砍光，留下空行也清掉
            reply = reply.replace(/<!--[\s\S]*?-->/g, '').replace(/\n{3,}/g, '\n\n').trim();

            const isApiError = !reply || reply.includes('[请求失败') || reply.includes('[請求失敗') || reply.includes('No capacity') || reply.startsWith('{"error');
            if (isApiError) {
                if (npcTarget) window.LobbyStage.popNpcHistoryTail(npcTarget.key, 'user');
                else if (IRIS_STATE.history.length > 0 && IRIS_STATE.history[IRIS_STATE.history.length - 1].role === 'user') IRIS_STATE.history.pop();
                lastFailedInput = text;
                const retryBtn = document.getElementById('iris-retry-btn');
                if (retryBtn) retryBtn.classList.add('visible');
                if (is404Room) playIrisSequence(`[Nar|(馬賽克雜訊劇烈閃爍)]\n[Char|柴郡|glitch|*(眼神滿是嫌棄)* 連線爛掉了，不是我的問題。]`);
                else if (npcTarget) playIrisSequence(`[Nar|(${npcTarget.name}的身影微微晃動了一下，像訊號不良的殘影。)]\n[Char|${npcTarget.name}|error|「抱歉……剛剛走神了，能再說一次嗎？」]`);
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
                    const active = templates.filter(t => (t.isActive || (Array.isArray(t.groupIds) && t.groupIds.includes('g_lobby')) || t.lobbyEnabled) && t.isBlock && t.tagId);   // 大廳組成員(或舊旗標)
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

            if (npcTarget) window.LobbyStage.pushNpcHistory(npcTarget.key, { role: 'assistant', content: reply, ts: Date.now() });
            else IRIS_STATE.history.push({ role: 'assistant', content: reply, ts: Date.now() });
            debouncedSave();

            // 🎮 大廳 NPC 一對一記憶：到量背景壓縮（不 await，不阻塞打字機）
            try {
                if (npcTarget) {
                    _compactNpcMemory(npcTarget.key, npcTarget.name, 'guest');
                } else if (!isClaudeRoom && window.LobbyStage?.isActive?.()) {
                    if (is404Room) _compactNpcMemory('cheshire', '柴郡', 'cheshire');
                    else _compactNpcMemory('ying', '瀅瀅', 'iris');
                }
            } catch (e) {}

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
            const isAbort = e?.name === 'AbortError' || /abort/i.test(e?.message || '');
            if (IRIS_STATE.history.length > 0 && IRIS_STATE.history[IRIS_STATE.history.length - 1].role === 'user') IRIS_STATE.history.pop();
            if (isAbort) {
                // 使用者主動停止：靜默處理，思考中文字換成已停止提示
                const txtBox = document.getElementById('iris-text');
                if (txtBox) txtBox.innerHTML = `<span style="color:${is404Room ? '#15a82f' : '#9c9083'}; font-style:italic; font-size:12px;">⏹ 已停止</span>`;
            } else {
                console.error("[VoidTerminal Chat Error]", e);
                if (is404Room) playIrisSequence(`[Nar|(馬賽克雜訊劇烈閃爍)]\n[Char|柴郡|glitch|*(眼神滿是嫌棄)* 連線爛掉了，不是我的問題。]`);
                else playIrisSequence(`[Nar|(空間產生劇烈波動)]\n[Char|瀅瀅|error|「抱歉，委託人，我的腦袋突然一片空白，請等我重整一下靈感。」]`);
            }
        } finally {
            // 還原送出鈕（無論成功 / 失敗 / 中止 / 早返回都會跑這裡）
            _irisAbortCtrl = null;
            const sb = document.getElementById('iris-send-btn');
            if (sb) {
                sb.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
                sb.onclick = sendIrisMessage;
            }
        }
    }

    // ===== 導出全局介面 =====
    // 暴露到外層，讓其他面板 (如 QB_CORE, IDOL_CORE) 能夠調用
    VoidTerminal.playSequence = playIrisSequence;
    VoidTerminal.recompactNpcMemory = recompactNpcMemory;   // 大廳 NPC 記憶手動整理（actor menu 呼叫）
    VoidTerminal.primeStageDialog = primeStageDialog;       // 開聊/切換 NPC 清殘留對話框（lobby_stage 呼叫）

    VoidTerminal.logout = function() {
        // 登入頁已移除：重新依當前人設同步並刷新大廳
        _autoEnterFromPersona();
        _applyLoadedLobbyState();
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
        chatProvider:  () => _chatProvider,   // 'claude' | 'codex'，給 claude-room.js 區分房間
        sendIris:      sendIrisMessage,   // 給 claude-room.js finally 還原 sendBtn.onclick 用
        // canvas.js
        is404: () => is404Room,
        // lobby_stage.js — 場景切換時更新左上場景牌
        setSceneBadge: (place) => setSceneBadge(place),
        // ambient.js
        isActivitySuspended: () => _isActivitySuspended,
        isPanelOpen:         () => _isPanelOpen,
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