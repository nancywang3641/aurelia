// ==SillyTavern Extension==
// @name         多功能面板系統 - 精簡版 (RPG & WX & VN)
// @version      4.3.0
// @description  修復 CSS 破圖問題，刪除多餘 APP，專注於 RPG、微信與長線劇情。
// @author       none
// @license      MIT

// 🔥 1. 全局通訊狀態
window.PANEL_COMMUNICATION = {
    ready: false,
    processors: {},
    modulesLoaded: {}
};

// 🔥 2. 模組加載順序
const MODULE_LOAD_ORDER = [
    { name: 'bgm_collector', path: './scripts/extensions/third-party/my-tavern-extension/bgm-global-collector.js', key: 'bgmCollector' },
    { name: 'loader_core', path: './scripts/extensions/third-party/my-tavern-extension/core/loader_core.js', key: 'core' },
    { name: 'ui_utilities', path: './scripts/extensions/third-party/my-tavern-extension/core/ui_utilities.js', key: 'utilities' },
    { name: 'tavern_bridge', path: './scripts/extensions/third-party/my-tavern-extension/core/tavern_bridge.js', key: 'bridge' },
    { name: 'panel_manager', path: './scripts/extensions/third-party/my-tavern-extension/core/panel_manager.js', key: 'panelManager' },
    { name: 'claude_terminal', path: './scripts/extensions/third-party/my-tavern-extension/core/claude_terminal.js', key: 'claudeTerminal' },
    { name: 'void_panels', path: './scripts/extensions/third-party/my-tavern-extension/core/void/panels.js', key: 'voidPanels' },
    { name: 'void_prompts', path: './scripts/extensions/third-party/my-tavern-extension/core/void/prompts.js', key: 'voidPrompts' },
    { name: 'void_ambient', path: './scripts/extensions/third-party/my-tavern-extension/core/void/ambient.js', key: 'voidAmbient' },
    { name: 'void_canvas', path: './scripts/extensions/third-party/my-tavern-extension/core/void/canvas.js', key: 'voidCanvas' },
    { name: 'void_claude_room', path: './scripts/extensions/third-party/my-tavern-extension/core/void/claude-room.js', key: 'voidClaudeRoom' },
    { name: 'void_terminal', path: './scripts/extensions/third-party/my-tavern-extension/core/void_terminal.js', key: 'voidTerminal' },
    { name: 'control_center', path: './scripts/extensions/third-party/my-tavern-extension/core/control_center.js', key: 'controlCenter' },
    { name: 'html_extractor', path: './scripts/extensions/third-party/my-tavern-extension/core/html_extractor.js', key: 'htmlExtractor' },
    { name: 'story_extractor', path: './scripts/extensions/third-party/my-tavern-extension/core/story_extractor.js', key: 'storyExtractor' },
    { name: 'regex_bridge', path: './scripts/extensions/third-party/my-tavern-extension/core/aurelia_regex_bridge.js', key: 'regexBridge' },
    { name: 'vn_dom_bridge', path: './scripts/extensions/third-party/my-tavern-extension/core/vn_dom_bridge.js', key: 'vnDomBridge' }
];

// 🔥 [配置] 手機系統檔案列表 (已移除寵物/不夜城/育兒/刑偵/WB/錢包，且移除酒館不需要的 AVS 與獨立世界書)
const PHONE_BASE_PATH = './scripts/extensions/third-party/my-tavern-extension/os_phone/';
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
    'os/os_card_import.js',

    // === 📖 VN 視覺小說系統 ===
    'vn_story/vn_styles.js',
    'vn_story/vn_settings.js',
    'vn_story/vn_tts.js',
    'vn_story/vn_tts_panel.js',
    'vn_story/vn_core.js',
    'vn_story/vn_phone.js',
    'vn_story/vn_reader.js',
    'vn_story/vn_ui_workshop.js',

    // === 🛡️ RPG 狀態系統 ===
    'rpg/state_schema.js',         // Stage 1：主模型生 schema
    'rpg/state_runtime.js',        // Stage 2：副模型抽 + patch + injectPrompts
    'rpg/blacklist_injector.js',   // 每輪 inject 黑名單條目（避免世界書 keys 觸發漏掉）
    'rpg/summary_core.js',
    'rpg/status_panel.js',
    'rpg/avatar_manager.js',

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
        link.href = path + '?v=' + Date.now();
        link.onload = () => resolve();
        link.onerror = () => { console.error(`[Aurelia] 核心樣式載入失敗: ${path}`); resolve(); }; 
        document.head.appendChild(link);
    });
}

// 載入模組工具
async function loadModule(conf) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = conf.path + '?v=' + Date.now();
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
        s.src = PHONE_BASE_PATH + path + '?v=' + Date.now();
        s.onload = () => resolve();
        s.onerror = () => { console.error(`[PhoneOS] 缺失腳本: ${path}`); resolve(); }; 
        document.head.appendChild(s);
    });
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
                    const achRegex = /\[Achievement\|([^\]|]+)\|?([^\]]*)\]/g;
                    let achMatch;
                    while ((achMatch = achRegex.exec(content)) !== null) {
                        const achName = achMatch[1].trim();
                        const achDesc = achMatch[2].trim();
                        if (achName && window.OS_ACHIEVEMENT?.unlock) {
                            window.OS_ACHIEVEMENT.unlock(achName, achDesc);
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
        await loadCSS('./scripts/extensions/third-party/my-tavern-extension/aurelia_core_st.css');

        for (const conf of MODULE_LOAD_ORDER) await loadModule(conf);

        console.log('[System] 正在掛載手機模組...');
        for (const file of PHONE_FILES) await loadPhoneScript(file);
        
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
            window.registerSettings('多功能面板系統', './scripts/extensions/third-party/my-tavern-extension/settings.html');
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
        fetch('./scripts/extensions/third-party/my-tavern-extension/settings.html')
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
    const Helper = {
        getChatMessages: async () => window.chat || [],
        getLastMessageId: async () => (window.chat ? window.chat.length - 1 : -1),
        getLorebookEntries: async (lorebookName) => {
            if (!window.world_info) await new Promise(r => setTimeout(r, 500));
            if (window.world_info && window.world_info.globalSelect) return window.world_info.globalSelect;
            if (window.SillyTavern?.getContext) {
                const ctx = window.SillyTavern.getContext();
                if (ctx.worldInfo?.globalSelect) return ctx.worldInfo.globalSelect;
            }
            return [];
        },
        setLorebookEntries: async (lorebookName, entries) => {
            try {
                let context = window.SillyTavern?.getContext();
                let sourceData = (context && context.worldInfos) || window.world_info;
                let booksArray = [];
                if (Array.isArray(sourceData)) booksArray = sourceData;
                else if (typeof sourceData === 'object' && sourceData) booksArray = Object.values(sourceData);
                const lorebook = booksArray.find(wi => wi.name === lorebookName);
                if (lorebook) {
                    lorebook.entries = entries;
                    if (context?.saveWorldInfo) await context.saveWorldInfo(lorebookName);
                    else if (window.saveWorldInfo) window.saveWorldInfo(lorebookName);
                    return true;
                }
                return false;
            } catch (e) { return false; }
        }
    };
    window.TavernHelper = Helper;
    window.getLorebookEntries = Helper.getLorebookEntries;
    if (window.top) window.top.TavernHelper = Helper;

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

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeExtension);
else initializeExtension();