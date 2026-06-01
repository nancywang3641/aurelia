// ==SillyTavern Extension==
// @name         多功能面板系統 - 精簡版 (RPG & WX & VN)
// @version      4.3.0
// @description  修復 CSS 破圖問題，刪除多餘 APP，專注於 RPG、微信與長線劇情。
// @author       none
// @license      MIT

// 🔥 0. 偵測載入來源，決定所有檔案（JS / CSS / settings.html）要從哪裡載
//    ① 原生擴展安裝（酒館 Extensions 直接裝）→ 偵測得到 index.js 的 script 標籤 → 走本地路徑（行為不變）
//    ② 酒館助手匯入（朋友貼 JSON，從 CDN 載入）→ 偵測不到 → 走 GitHub CDN，113 個檔全部從 repo 載
//    兩種裝法並存、互不影響；改動只多了一條 CDN fallback。
// 🔥 CDN 來源 ref：助手 JSON 可在「動態 import 前」設 globalThis.__AURELIA_REF__='<commit hash>'，
//    讓整包（index.js + 全部模組 + CSS）統一鎖那個不可變 commit —— jsdelivr 對 commit 永遠正確、零快取陳舊問題。
//    沒設則預設 'main'（自動跟更新，但有 jsdelivr @main 邊緣快取延遲，更新約半天內生效）。
const _AURELIA_REF = (function () {
    try {
        if (window.__AURELIA_REF__) return String(window.__AURELIA_REF__);
        if (window.parent && window.parent !== window) { try { if (window.parent.__AURELIA_REF__) return String(window.parent.__AURELIA_REF__); } catch (e) {} }
    } catch (e) {}
    return 'main';
})();
const _AURELIA_CDN_BASE = 'https://cdn.jsdelivr.net/gh/nancywang3641/aurelia@' + _AURELIA_REF;

// 🔥 0a. 酒館助手把匯入的腳本丟進「沙盒 <iframe>」跑：裸 document 指向 iframe 自己，UI 注入不到主頁面（按鈕出不來）。
//    對策：偵測到「自己不在主頁面、但 parent 才是主頁面」→ 把 index.js 重新注入主頁面以 classic script 執行，
//    讓整個擴展（含 100+ 模組）都跑在主頁面，裸 document 自動＝主頁面、UI 正常注入；iframe 這份隨即停手。
//    原生安裝時「自己就在主頁面」→ 不觸發，行為完全不變。
let _AURELIA_SKIP = false;
(function () {
    try {
        const _hasST = (d) => { try { return !!(d && (d.getElementById('chat') || d.getElementById('sheld') || d.querySelector('#send_form'))); } catch (e) { return false; } };
        if (!_hasST(document) && window.parent && window.parent !== window && _hasST(window.parent.document)) {
            _AURELIA_SKIP = true; // 我在酒館助手沙盒 iframe，主頁面在 parent
            const pwin = window.parent, pdoc = pwin.document;
            if (!pwin.__AURELIA_BOOTSTRAPPED__) {
                pwin.__AURELIA_BOOTSTRAPPED__ = true;
                pwin.__AURELIA_REF__ = _AURELIA_REF; // 把 ref 傳進主頁面，讓重注入的 index.js + 模組都鎖同一 commit
                const s = pdoc.createElement('script');
                s.src = _AURELIA_CDN_BASE + '/index.js?boot=' + Date.now();
                pdoc.head.appendChild(s);
                console.log('[Aurelia] 偵測到酒館助手沙盒 → 已將擴展重新注入主頁面執行');
            }
        }
    } catch (e) { console.warn('[Aurelia] 沙盒偵測失敗，照原樣在當前環境執行', e); }
})();

const _AURELIA_EXT_NAME = (() => {
    try {
        const scripts = document.getElementsByTagName('script');
        for (let i = scripts.length - 1; i >= 0; i--) {
            const src = scripts[i].src || '';
            const m = src.match(/scripts\/extensions\/third-party\/([^\/]+)\/index\.js/);
            if (m) return m[1];
        }
    } catch (e) {}
    return null; // 偵測不到 = 不是原生安裝（多半是酒館助手從 CDN 匯入）
})();
const _AURELIA_EXT_BASE = _AURELIA_EXT_NAME
    ? './scripts/extensions/third-party/' + _AURELIA_EXT_NAME
    : _AURELIA_CDN_BASE;
// CDN 模式下 EXT_NAME 為 null；下游用到它的本地路徑（TTS 本機模型等）會自行 `|| 'my-tavern-extension'` fallback，
// 那些是本機限定功能，朋友端載不到很正常（會優雅降級，不影響面板本體）。
window.AURELIA_EXT_NAME = _AURELIA_EXT_NAME;
window.AURELIA_EXT_BASE = _AURELIA_EXT_BASE;

// 🔥 防快取參數開關：
//   本機(原生安裝，EXT_NAME 有值) → 加 ?v=時間，方便你開發時即時看到改動。
//   CDN(酒館助手，EXT_NAME 為 null) → 加 ?v=版本號 → 同版本內 jsdelivr/瀏覽器照樣快取(載入快)，
//      但每次「改版 bump _AURELIA_VERSION」後，朋友的瀏覽器會自動重抓模組，不用手動清快取。
//      （index.js 本身是 ?boot= 強制重抓的，所以這個版本號一改、下次載入就生效。）
const _AURELIA_VERSION = '2026.06.01.6'; // ⚠️ 每次發佈更新就 bump 這個（CDN 朋友端靠它更新）
const _AURELIA_CACHE_BUST = _AURELIA_EXT_NAME ? ('?v=' + Date.now()) : ('?v=' + _AURELIA_VERSION);

// 🔥 1. 全局通訊狀態
window.PANEL_COMMUNICATION = {
    ready: false,
    processors: {},
    modulesLoaded: {}
};

// 🔥 2. 模組加載順序
const MODULE_LOAD_ORDER = [
    { name: 'debug_console', path: _AURELIA_EXT_BASE + '/core/debug_console.js', key: 'debugConsole' }, // 🐛 螢幕 console（無 devtools 環境用）— 最先載才攔得到後續 log
    { name: 'aurelia_api', path: _AURELIA_EXT_BASE + '/core/aurelia_api.js', key: 'aureliaApi' }, // 📦 統一資料入口(備用版插座)— 必須最先載
    { name: 'bgm_collector', path: _AURELIA_EXT_BASE + '/bgm-global-collector.js', key: 'bgmCollector' },
    { name: 'loader_core', path: _AURELIA_EXT_BASE + '/core/loader_core.js', key: 'core' },
    { name: 'ui_utilities', path: _AURELIA_EXT_BASE + '/core/ui_utilities.js', key: 'utilities' },
    { name: 'tavern_bridge', path: _AURELIA_EXT_BASE + '/core/tavern_bridge.js', key: 'bridge' },
    { name: 'panel_manager', path: _AURELIA_EXT_BASE + '/core/panel_manager.js', key: 'panelManager' },
    { name: 'claude_terminal', path: _AURELIA_EXT_BASE + '/core/claude_terminal.js', key: 'claudeTerminal' },
    { name: 'void_panels', path: _AURELIA_EXT_BASE + '/core/void/panels.js', key: 'voidPanels' },
    { name: 'void_prompts', path: _AURELIA_EXT_BASE + '/core/void/prompts.js', key: 'voidPrompts' },
    { name: 'void_ambient', path: _AURELIA_EXT_BASE + '/core/void/ambient.js', key: 'voidAmbient' },
    { name: 'void_canvas', path: _AURELIA_EXT_BASE + '/core/void/canvas.js', key: 'voidCanvas' },
    { name: 'void_login', path: _AURELIA_EXT_BASE + '/core/void/login.js', key: 'voidLogin' },
    { name: 'chat_window', path: _AURELIA_EXT_BASE + '/core/chat_window.js', key: 'chatWindow' },
    { name: 'chat_room', path: _AURELIA_EXT_BASE + '/core/chat_room.js', key: 'voidClaudeRoom' },
    { name: 'chat_group', path: _AURELIA_EXT_BASE + '/core/chat_group.js', key: 'chatGroup' },
    { name: 'chat_canvas', path: _AURELIA_EXT_BASE + '/core/chat_canvas.js', key: 'chatCanvas' },
    { name: 'void_terminal', path: _AURELIA_EXT_BASE + '/core/void_terminal.js', key: 'voidTerminal' },
    { name: 'control_center', path: _AURELIA_EXT_BASE + '/core/control_center.js', key: 'controlCenter' },
    { name: 'html_extractor', path: _AURELIA_EXT_BASE + '/core/html_extractor.js', key: 'htmlExtractor' },
    { name: 'story_extractor', path: _AURELIA_EXT_BASE + '/core/story_extractor.js', key: 'storyExtractor' },
    { name: 'regex_bridge', path: _AURELIA_EXT_BASE + '/core/aurelia_regex_bridge.js', key: 'regexBridge' },
    { name: 'vn_dom_bridge', path: _AURELIA_EXT_BASE + '/core/vn_dom_bridge.js', key: 'vnDomBridge' }
];

// 🔥 [配置] 手機系統檔案列表 (已移除寵物/不夜城/育兒/刑偵/WB/錢包，且移除酒館不需要的 AVS 與獨立世界書)
const PHONE_BASE_PATH = _AURELIA_EXT_BASE + '/os_phone/';
const PHONE_FILES = [
    // === 🟢 OS 層 (系統基礎) ===
    'os/os_settings.js',
    'os/os_db.js',
    'os/os_sync.js',
    'os/os_persona.js',
    'os/os_prompts.js', // 提示詞底層需要保留，但 UI 按鈕已透過 isStandalone 隱藏
    'os/os_lorebook.js',
    'os/os_contacts.js',
    'os/os_tavern_bridge.js',
    'os/os_bridge.js',
    'os/os_avs_adapter.js',   // 雙端切換層：必須在 engine / rules 之前載入
    'os/os_avs_engine.js',
    'os/os_avs_rules.js',
    'os/os_avs.js',           // 變數工坊 UI（PWA / 酒館共用一套面板）
    'os/os_studio.js',        // 靈感創作室（VN UI 煉丹 + 世界書設計師，PWA / 酒館共用）
    'os/os_api_engine.js',
    'os/phone_system.js',
    'os/os_monitor.js',
    'os/os_minimax.js',
    'os/translation_manager.js',
    'os/os_image_manager.js',
    'os/os_achievement.js',
    'os/os_backup.js',
    'os/os_404_store.js',
    'os/os_tarot.js',
    'os/os_spend_panel.js',
    'os/os_board.js',
    'os/os_card_import.js',
    'os/os_journal.js',
    'os/os_workbench.js',

    // === 📖 VN 視覺小說系統 ===
    'vn_story/vn_styles.js',
    'vn_story/vn_settings.js',
    'vn_story/vn_tts.js',
    'vn_story/vn_tts_panel.js',
    // vn_core 拆分後的底層工具（必須先於 vn_core.js 載入）
    'vn_story/vn_cache.js',
    'vn_story/vn_config.js',
    'vn_story/vn_monitor.js',
    'vn_story/vn_summary.js',
    'vn_story/vn_sticker.js',
    'vn_story/vn_panels.js',
    'vn_story/vn_generator.js',
    'vn_story/vn_core.js',
    'vn_story/vn_inspect.js',
    'vn_story/vn_phone.js',
    'vn_story/vn_reader.js',
    'vn_story/vn_ui_workshop.js',

    // === 🛡️ RPG 狀態系統 ===
    'rpg/state_schema.js',         // Stage 1：主模型生 schema
    'rpg/state_runtime.js',        // Stage 2：副模型抽 + patch + injectPrompts
    'rpg/blacklist_injector.js',   // 每輪 inject 黑名單條目（避免世界書 keys 觸發漏掉）
    'rpg/summary_core.js',
    'rpg/status_panel.js',
    // 'rpg/avatar_manager.js',  // ⛔ 已停用：廢棄舊檔，會與 VN 頭像系統並行重複生成同一角色（浪費資源）+ 亂跳「已收錄」toast。檔案保留；vn_core 仍會讀世界書既有頭像。

    // === 🗺️ MAP 地圖系統 ===
    'map/map_data.js',
    'map/world_runtime.js',
    'map/world_generator.js',
    'map/schedule_engine.js',
    'map/scene_map_engine.js',
    'map/map_core.js',

    // === 🔵 微信 (WeChat) ===
    'wx/wx_user_profile.js', 'wx/wx_theme.js',
    'wx/wx_contacts.js', 'wx/wx_chat_settings.js', 'wx/wx_bubble_settings.js',
    'wx/wx_message_manager.js', 'wx/wx_view.js', 'wx/wx_core.js',
    'wx/wx_tavern_api_bridge.js'
];

// 載入 CSS 工具 (🔥 修復酒館模式破圖的關鍵)
function loadCSS(path) {
    return new Promise((resolve) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = path + _AURELIA_CACHE_BUST;
        link.onload = () => resolve();
        link.onerror = () => { console.error(`[Aurelia] 核心樣式載入失敗: ${path}`); resolve(); };
        document.head.appendChild(link);
        if (!_AURELIA_EXT_NAME) resolve(); // CDN 模式：append 後立即放行，讓 CSS 平行下載(本機維持等 onload，不變)
    });
}

// 載入模組工具
async function loadModule(conf) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = conf.path + _AURELIA_CACHE_BUST;
        s.async = false;
        s.onload = () => { window.PANEL_COMMUNICATION.modulesLoaded[conf.key] = true; resolve(); };
        s.onerror = () => { console.error(`載入失敗: ${conf.name}`); reject(new Error(`Load failed: ${conf.name}`)); };
        document.head.appendChild(s);
    });
}

// 手機腳本載入工具
function loadPhoneScript(path) {
    return new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = PHONE_BASE_PATH + path + _AURELIA_CACHE_BUST;
        s.onload = () => resolve();
        s.onerror = () => { console.error(`[PhoneOS] 缺失腳本: ${path}`); resolve(); }; 
        document.head.appendChild(s);
    });
}

// CDN 並行載入器：一次插入全部 <script>，async=false → 平行下載、依插入順序執行(保留依賴順序)
function _loadBatchOrdered(list) {
    return Promise.all(list.map(item => new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = item.src;
        s.async = false;
        s.onload = () => { if (item.key) window.PANEL_COMMUNICATION.modulesLoaded[item.key] = true; resolve(); };
        s.onerror = () => { console.error('[Aurelia] 並行載入失敗:', item.src); resolve(); };
        document.head.appendChild(s);
    })));
}

// 讀取設置
function getExtensionSettings() {
    if (typeof window.extension_settings === 'undefined') window.extension_settings = {};
    let settings = window.extension_settings['多功能面板系統'];
    if (!settings) {
        try {
            const saved = localStorage.getItem('extension_settings');
            if (saved) settings = JSON.parse(saved)['多功能面板系統'];
        } catch (e) {}
    }
    if (!settings) {
        settings = { enabled: true, mount: { mode: 'embedded', selector: '#chat', placement: 'bottom' } };
    }
    return settings;
}

// 🔥 核心：監聽酒館消息 (已移除金錢與物品解析，僅保留成就解鎖)
function setupMessageListener() {
    console.log('[System] 啟動結算監聽器 (僅成就)...');
    
    if (window.eventOn) {
        window.eventOn('message_received', async (messageId) => {
            setTimeout(async () => {
                try {
                    const context = window.SillyTavern.getContext();
                    const chat = context.chat;
                    const lastMsg = chat[messageId];
                    if (!lastMsg || !lastMsg.mes) return;

                    const content = lastMsg.mes;
                    
                    // 🏆 成就解鎖（全局監聽）
                    //   新格式：[Achievement|emotion|名|描述]   (V1.2+)
                    //   舊格式：[Achievement|名|描述]           (向下相容)
                    const achRegex = /\[Achievement\|([^\]]+)\]/g;
                    let achMatch;
                    while ((achMatch = achRegex.exec(content)) !== null) {
                        const parts = achMatch[1].split('|').map(s => s.trim());
                        let achEmotion = null, achName = '', achDesc = '';
                        if (parts.length >= 3) {
                            achEmotion = parts[0] || null;
                            achName    = parts[1] || '';
                            achDesc    = parts[2] || '';
                        } else {
                            achName = parts[0] || '';
                            achDesc = parts[1] || '';
                        }
                        if (achName && window.OS_ACHIEVEMENT?.unlock) {
                            window.OS_ACHIEVEMENT.unlock(achEmotion, achName, achDesc);
                        }
                    }
                } catch (err) { console.error('監聽錯誤:', err); }
            }, 500);
        });
    }
}

// 核心初始化
async function initializeExtension() {
    try {
        setupEventBridge();

        // 🔥 1. 強制載入核心 CSS，解決大廳與設置破圖問題
        console.log('[System] 正在載入核心樣式 (CSS)...');
        await loadCSS(_AURELIA_EXT_BASE + '/aurelia_core_st.css');
        await loadCSS(_AURELIA_EXT_BASE + '/core/void/lobby.css');

        // core 模組 CSS（兩版共用，selector 已 scoped 不污染酒館）
        await loadCSS(_AURELIA_EXT_BASE + '/css/toast_manager.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/story_extractor.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/html_extractor.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/image_settings_panel.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/settings_manager.css');

        // os_phone/os 模組 CSS
        await loadCSS(_AURELIA_EXT_BASE + '/css/os_settings.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/os_studio.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/os_worldbook.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/os_persona.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/os_prompts.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/os_avs.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/os_avs_rules.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/os_think.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/os_debug_panel.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/os_tarot.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/os_journal.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/os_workbench.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/os_user_center.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/os_monitor.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/os_barrage.css');

        // vn_story / qb / wx / map / rpg 模組 CSS
        await loadCSS(_AURELIA_EXT_BASE + '/css/vn_styles.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/vn_core.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/vn_tts_panel.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/vn_ui_workshop.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/qb_core.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/qb_os_404_chaos.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/wx_chat_settings.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/map_core.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/rpg_status_panel.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/void_achievement.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/void_claude_recents.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/void_claude_ask.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/chat_window.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/os_board.css');

        if (_AURELIA_EXT_NAME) {
            // 本機：維持原樣(本地讀檔極快、且已驗證穩定，不動)
            for (const conf of MODULE_LOAD_ORDER) await loadModule(conf);
            console.log('[System] 正在掛載手機模組...');
            for (const file of PHONE_FILES) await loadPhoneScript(file);
        } else {
            // CDN：並行下載、依序執行 → 解決 130 個檔排隊造成的數秒延遲
            console.log('[System] CDN 並行載入核心模組...');
            await _loadBatchOrdered(MODULE_LOAD_ORDER.map(c => ({ src: c.path + _AURELIA_CACHE_BUST, key: c.key })));
            console.log('[System] CDN 並行載入手機模組...');
            await _loadBatchOrdered(PHONE_FILES.map(f => ({ src: PHONE_BASE_PATH + f + _AURELIA_CACHE_BUST })));
        }
        
        // 延遲執行：確保 PhoneSystem 和各個 App 模組都載入完畢後再註冊圖標
        setTimeout(() => {
            if (window.PhoneSystem) {
                // 註冊 RPG 狀態
                if (window.RPG_PANEL) {
                    window.PhoneSystem.install('RPG 狀態', '🛡️', '#5d4037', window.RPG_PANEL.launch);
                }

                // 註冊賽博塔羅系統
                if (window.OS_TAROT) {
                    window.PhoneSystem.install('賽博塔羅', '🔮', '#9b59b6', window.OS_TAROT.launch);
                }

                // 註冊地圖系統
                if (window.OS_MAP) {
                    window.PhoneSystem.install('地圖', '🗺️', '#2f9544', window.OS_MAP.launchApp);
                }

                // 註冊 VN 視覺小說
                if (window.VN_STORY) { 
                    window.PhoneSystem.install('故事模式', '📖', '#ff69b4', window.VN_STORY.launch);
                }

                // 註冊設置 (確保它在最後)
                if (window.OS_SETTINGS) {
                     window.PhoneSystem.install('設置', '⚙️', '#4c4c4c', window.OS_SETTINGS.launchApp);
                }
            }
            
            // 啟動監聽器
            setupMessageListener();

        }, 1500);

        installAPI();
        registerSettingsPage();

        setTimeout(() => {
            if (window.AureliaUIUtils) {
                window.AureliaUIUtils.init();
                overrideToggleLogic();
            }
        }, 1000);

        console.log('✅ 多功能面板系統 (V4.3 Clean) 已就緒');
    } catch (e) { console.error('啟動錯誤:', e); }
}

function registerSettingsPage() {
    try {
        if (typeof window.registerSettings === 'function') {
            window.registerSettings('多功能面板系統', _AURELIA_EXT_BASE + '/settings.html');
        } else {
            createManualSettingsPage();
        }
    } catch (error) {
        createManualSettingsPage();
    }
}

function createManualSettingsPage() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectSettingsPage);
    } else {
        injectSettingsPage();
    }
}

function injectSettingsPage() {
    try {
        let settingsContainer = document.querySelector('#extensions_settings');
        if (!settingsContainer) {
            settingsContainer = document.createElement('div');
            settingsContainer.id = 'extensions_settings';
            settingsContainer.style.display = 'none';
            document.body.appendChild(settingsContainer);
        }
        
        const settingsPageContainer = document.createElement('div');
        settingsPageContainer.id = 'multi_panel_settings_container';
        settingsPageContainer.innerHTML = `
            <div class="extension_settings">
                <div id="multi_panel_settings_content"></div>
            </div>
        `;
        settingsContainer.appendChild(settingsPageContainer);
        loadSettingsContent();
    } catch (error) {}
}

function loadSettingsContent() {
    try {
        fetch(_AURELIA_EXT_BASE + '/settings.html')
            .then(response => {
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                return response.text();
            })
            .then(html => {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const settingsContent = doc.querySelector('#multi_panel_settings');
                const settingsScriptContent = doc.querySelector('script'); 

                if (settingsContent) {
                    const targetContainer = document.getElementById('multi_panel_settings_content');
                    targetContainer.innerHTML = settingsContent.outerHTML;
                    
                    if (settingsScriptContent) {
                        const script = document.createElement('script');
                        if (typeof window.extension_settings === 'undefined') window.extension_settings = {};
                        script.textContent = settingsScriptContent.textContent;
                        document.body.appendChild(script);
                    }
                }
            })
            .catch(e => console.error('無法載入設置頁面', e));
    } catch (e) {}
}

function overrideToggleLogic() {
    const originalToggle = window.AureliaControlCenter ? window.AureliaControlCenter.toggle : null;

    const smartToggle = () => {
        const settings = getExtensionSettings();
        const mount = settings.mount || { mode: 'embedded', selector: '#chat', placement: 'bottom' };

        if (mount.mode === 'embedded') {
            const target = document.querySelector(mount.selector) || 
                           document.querySelector('#chat') || 
                           document.querySelector('.chat-body');
            
            if (target) {
                if (window.AureliaControlCenter && window.AureliaControlCenter.mountEmbedded) {
                    if (!window.AureliaControlCenter.isEmbeddedMounted()) {
                        const useFixed = mount.placement === 'bottom';
                        window.AureliaControlCenter.mountEmbedded(target, mount.placement, useFixed);
                    } else {
                        if (originalToggle) originalToggle.call(window.AureliaControlCenter);
                    }
                    return;
                }
            }
            
            console.log('[Aurelia] 尚未找到 #chat，啟動監聽器...');
            const obs = new MutationObserver(() => {
                const t = document.querySelector(mount.selector) || document.querySelector('#chat');
                if (t && window.AureliaControlCenter) {
                    const useFixed = mount.placement === 'bottom';
                    window.AureliaControlCenter.mountEmbedded(t, mount.placement, useFixed);
                    obs.disconnect();
                }
            });
            obs.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => obs.disconnect(), 10000);

        } else {
            if (window.AureliaControlCenter && window.AureliaControlCenter.isEmbeddedMounted && window.AureliaControlCenter.isEmbeddedMounted()) {
                window.AureliaControlCenter.unmountEmbedded();
            }
            if (originalToggle) originalToggle.call(window.AureliaControlCenter);
        }
    };

    if (window.AureliaControlCenter) window.AureliaControlCenter.toggle = smartToggle;
    window.toggleControlCenter = smartToggle;
}

function installAPI() {
    window.toggleVnPanel = () => safeTogglePanel('VN');
    window.toggleHtmlExtractor = () => window.AureliaHtmlExtractor?.show();
    window.toggleSettingsPanel = () => window.AureliaSettingsManager?.toggle();
    window.togglePhoneSystem = () => {
        if (window.PhoneSystem) window.PhoneSystem.show();
        else console.warn('手機系統載入中...');
    };

    window.openPanel = function(type) {
        const t = type.toUpperCase();
        if (t === 'STORY' || t === 'VN') safeTogglePanel('VN');
        else if (t === 'HTML_EXTRACTOR') window.AureliaHtmlExtractor?.show();
        else if (t === 'PHONE') window.togglePhoneSystem();
    };

    window.AureliaLoader = {
        toggleVnPanel: window.toggleVnPanel,
        toggleHtmlExtractor: window.toggleHtmlExtractor,
        toggleSettingsPanel: window.toggleSettingsPanel,
        togglePhoneSystem: window.togglePhoneSystem,
        hidePhoneModal: () => window.AureliaControlCenter?.hide(),
        openPhoneApp: function(targetAppName) {
            if (!window.AureliaControlCenter) return;
            if (typeof window.AureliaControlCenter.showOsApp === 'function') {
                window.AureliaControlCenter.showOsApp(targetAppName);
            }
        }
    };
    
    Object.defineProperty(window.AureliaLoader, 'isPhoneModalVisible', {
        get: function() { return window.AureliaControlCenter && window.AureliaControlCenter.isVisible(); }
    });
}

function safeTogglePanel(type) {
    const pm = window.AureliaPanelManager;
    if (pm) {
        pm.togglePanel(type);
        if (window.eventEmit && type === 'VN') {
            console.log(`🔔 [Aurelia] 廣播事件: VN_PANEL_OPENED`);
            window.eventEmit('VN_PANEL_OPENED');
        }
        if (window.AureliaControlCenter?.isVisible()) window.AureliaControlCenter.hide();
    }
}

function setupEventBridge() {
    console.log("🔥 [Aurelia] 初始化通訊橋樑...");
    if (!window.eventEmit) {
        window.eventEmit = function(eventName, data) {
            if (window.eventSource && typeof window.eventSource.emit === 'function') {
                window.eventSource.emit(eventName, data);
            }
            const payload = { type: eventName, data: data };
            document.querySelectorAll('iframe').forEach(iframe => {
                try { iframe.contentWindow.postMessage(payload, '*'); } catch(e){}
            });
            window.dispatchEvent(new CustomEvent(eventName, { detail: data }));
        };
    }
    // 📦 「統一資料入口 / 備用版插座」已搬到獨立模塊 core/aurelia_api.js（它在模組載入第一個就跑）。
    //    那裡負責設好 window.AureliaAPI + window.TavernHelper fallback —— 助手在用助手、不在走原生備用。
    //    要補更多原生備用方法，只改 aurelia_api.js 一處，不再散落在 index.js。

    function tryBridgeEventSource() {
        if (window.SillyTavern?.getContext) {
            try {
                const ctx = window.SillyTavern.getContext();
                if (ctx.eventSource) {
                    window.eventSource = ctx.eventSource;
                    window.event_types = ctx.eventTypes;
                    window.eventOn = (t, h) => ctx.eventSource.on(t, h);
                    window.eventOnce = (t, h) => ctx.eventSource.once(t, h);
                    window.eventOnButton = (n, h) => ctx.eventSource.on(`button_${n}`, h);
                    window.tavern_events = ctx.eventTypes;
                    return true;
                }
            } catch (e) {}
        }
        return false;
    }
    if (!tryBridgeEventSource()) {
        let n = 0;
        const i = setInterval(() => { if (tryBridgeEventSource() || ++n > 20) clearInterval(i); }, 500);
    }
    setTimeout(() => {
        if (window.eventEmit) {
            console.log("🔔 [Aurelia] System Ready");
            window.eventEmit('APP_READY'); 
            window.eventEmit('VN_PANEL_READY');
            window.eventEmit('CHAT_CHANGED');
        }

        function updateControlCenterTitle() {
            if (!window.AureliaControlCenter || !window.AureliaControlCenter.setChatTitle) return;
            if (window.SillyTavern && window.SillyTavern.getContext) {
                const ctx = window.SillyTavern.getContext();
                if (ctx.chatId) {
                    let fullPath = ctx.chatId;
                    let fileName = fullPath.split(/[\\/]/).pop();
                    let finalName = fileName.replace(/\.jsonl?$/i, '').replace(/\.json$/i, '');
                    window.AureliaControlCenter.setChatTitle(finalName);
                    return;
                }
            }
        }

        updateControlCenterTitle();
        
        const retryTimer = setInterval(() => {
            updateControlCenterTitle();
        }, 1000); 
        
        if (window.eventSource) {
            const refresh = () => setTimeout(updateControlCenterTitle, 200);
            window.eventOn('chat_id_changed', refresh);
            window.eventOn('character_loaded', refresh);
            window.eventOn('chat_saved', refresh);
        }

        window.addEventListener('click', () => setTimeout(updateControlCenterTitle, 200));

    }, 2000);
    window.addEventListener('message', (e) => {
        if (e.data?.type === 'REQUEST_OPEN_PANEL') {
            const t = e.data.data?.panelType;
            if (t) window.openPanel(t);
        }
    });
}

if (!_AURELIA_SKIP) {
    // 沙盒 iframe 那份(_AURELIA_SKIP=true)不啟動；真正執行的是被重新注入主頁面的那份
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeExtension);
    else initializeExtension();
}