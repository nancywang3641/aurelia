// ----------------------------------------------------------------
// [檔案] os_avs_adapter.js (V1)
// 路徑：os_phone/os/os_avs_adapter.js
// 職責：AVS 系統的「資料來源切換層」。
//       PWA 獨立端 → 讀寫 localStorage（保留原 AVS engine 行為，不破壞）
//       酒館擴展端 → 變數讀 OS_DB.state_data.current（副模型抽出來的）
//                    規則用獨立 localStorage key，跨 chat 共用
//
// 設計目標：engine / rules / UI 不必動內部演算法，
//          只把 storage 存取點換成 adapter 即可雙端通吃。
// ----------------------------------------------------------------
(function() {
    console.log('🎲 [AVS Adapter] V1 載入');
    const win = window.parent || window;

    // 變數狀態的記憶體 cache（酒館模式用，因為 OS_DB 是 async，
    // 但 engine.read() 是 sync 接口，所以維護一份 sync 可讀的鏡像）
    let _cache = { chatId: null, vars: {}, schema: null, ts: 0 };
    let _refreshing = false;

    function isStandalone() {
        return !!(win.OS_API?.isStandalone?.());
    }

    function normalizeChatId(raw) {
        if (win.OS_STATE_RUNTIME?.normalizeChatId) {
            return win.OS_STATE_RUNTIME.normalizeChatId(raw);
        }
        if (!raw) return '';
        return String(raw).split(/[\\/]/).pop().replace(/\.jsonl?$/i, '').trim();
    }

    function getCurrentChatId() {
        try {
            const ctx = win.SillyTavern?.getContext?.();
            return normalizeChatId(ctx?.chatId);
        } catch(e) { return ''; }
    }

    // ===== Tavern：refresh 記憶體 cache（OS_DB → memory）=====
    async function _refreshTavernCache() {
        if (_refreshing) return;
        _refreshing = true;
        try {
            const cid = getCurrentChatId();
            if (!cid || !win.OS_DB?.getStateData) {
                _cache = { chatId: cid, vars: {}, schema: null, ts: Date.now() };
                return;
            }
            const data = await win.OS_DB.getStateData(cid);
            _cache = {
                chatId: cid,
                vars: data?.current || {},
                schema: data?.schema || null,
                ts: Date.now()
            };
        } catch(e) {
            console.warn('[AVS Adapter] refresh cache 失敗:', e);
        } finally {
            _refreshing = false;
        }
    }

    // ===== PWA：localStorage 直連（保留原 AVS engine 行為）=====
    function _pwaStateKey() {
        const sid = localStorage.getItem('vn_current_story_id') || '';
        return sid ? `avs_state_${sid}` : 'avs_current_state';
    }
    function _pwaReadState() {
        try { return JSON.parse(localStorage.getItem(_pwaStateKey()) || '{}'); } catch(e) { return {}; }
    }
    function _pwaWriteState(state) {
        try { localStorage.setItem(_pwaStateKey(), JSON.stringify(state)); } catch(e) {
            console.error('[AVS Adapter] PWA 寫入失敗:', e);
        }
    }

    // ===== 規則 storage（兩端各自 key，PWA 沿用原 avs_condition_rules）=====
    const RULES_KEY_PWA    = 'avs_condition_rules';
    const RULES_KEY_TAVERN = 'aurelia_rules_tavern';

    function _rulesKey() {
        return isStandalone() ? RULES_KEY_PWA : RULES_KEY_TAVERN;
    }

    // ================================================================
    // 對外 API
    // ================================================================
    win.OS_AVS_ADAPTER = {
        isStandalone,
        getCurrentChatId,

        /** sync 讀變數狀態（engine.read / rules.getActiveContext 用）*/
        readState() {
            if (isStandalone()) return _pwaReadState();
            return { ..._cache.vars };
        },

        /** 寫變數狀態（async；PWA 走 localStorage，酒館寫 OS_DB.state_data.current）*/
        async writeState(state) {
            if (isStandalone()) { _pwaWriteState(state); return; }
            const cid = getCurrentChatId();
            if (!cid || !win.OS_DB?.getStateData) return;
            const data = (await win.OS_DB.getStateData(cid)) || {};
            await win.OS_DB.saveStateData(cid, {
                schema: data.schema || _cache.schema,
                patches: data.patches || {},
                current: state || {}
            });
            _cache = { chatId: cid, vars: { ...(state || {}) }, schema: data.schema, ts: Date.now() };
        },

        /** sync 讀規則陣列 */
        loadRules() {
            try { return JSON.parse(localStorage.getItem(_rulesKey()) || '[]'); } catch(e) { return []; }
        },

        /** sync 寫規則陣列 */
        saveRules(rules) {
            try { localStorage.setItem(_rulesKey(), JSON.stringify(rules || [])); } catch(e) {
                console.error('[AVS Adapter] 規則寫入失敗:', e);
            }
        },

        /** storyId：用於 engine snapshot 等的 storage 分艙（酒館用 chatId）*/
        getStoryId() {
            if (isStandalone()) return localStorage.getItem('vn_current_story_id') || '';
            return getCurrentChatId();
        },

        /** worldId：rules filter 用（規則.worldId === 當前 worldId 才生效；酒館用 chatId）*/
        getWorldId() {
            if (isStandalone()) return localStorage.getItem('vn_current_world_id') || '';
            return getCurrentChatId();
        },

        /** 取當前 cache snapshot（給 UI 顯示用，不要修改回傳值）*/
        getCache() { return { ..._cache }; },

        /** 強制 refresh cache（酒館才有用；PWA 走 localStorage 不需要）*/
        async refreshCache() {
            if (!isStandalone()) await _refreshTavernCache();
        }
    };

    // ===== 酒館模式：監聽相關事件自動 refresh cache =====
    function setupTavernHooks() {
        if (isStandalone()) return;
        if (win.eventOn && win.tavern_events) {
            if (win.tavern_events.CHAT_CHANGED) {
                win.eventOn(win.tavern_events.CHAT_CHANGED, _refreshTavernCache);
            }
            // state_runtime 抽完 patch / schema 更新 / 用戶手動編輯欄位 都要 refresh
            try { win.eventOn?.('AURELIA_STATE_PATCHED', _refreshTavernCache); } catch(e) {}
            try { win.eventOn?.('AURELIA_STATE_SCHEMA_GENERATED', _refreshTavernCache); } catch(e) {}
            try { win.eventOn?.('AURELIA_STATE_DATA_REMOVED', _refreshTavernCache); } catch(e) {}
        }
        // 啟動時跑一次
        _refreshTavernCache();
    }

    // 等待 OS_API / OS_DB / SillyTavern 都載完
    function init() {
        if (typeof win.OS_API?.isStandalone !== 'function') {
            setTimeout(init, 500);
            return;
        }
        setupTavernHooks();
        console.log(`🎲 [AVS Adapter] Ready · 模式=${isStandalone() ? 'PWA' : 'TAVERN'}`);
    }

    init();
})();
