/**
 * ========================
 * Claude Terminal (v0.2 - multi-conv)
 * 「Claude 的房間」獨立對話接口
 * ========================
 * 職責：
 * 1. 走 cc-bridge / OpenAI 兼容 API / Anthropic 直連（跟主/副模型隔離、不污染 preset）
 * 2. 多會話系統（兩 tab：訂閱 Max / Anthropic API），每 conv 自己的訊息 + sid
 *    - 索引：localStorage（claude_max_convs, claude_api_convs, claude_*_active, claude_active_tab）
 *    - 訊息：IndexedDB studio_chats，key = `claude_conv_<id>`
 * 3. 自動把舊版 `claude_room_main` 一條歷史 → Max tab 的 conv_legacy
 *
 * UI 在 void_terminal；本檔僅資料層 + API + 資源 helper。
 */

(function(ClaudeTerminal) {
    'use strict';

    const HISTORY_LIMIT = 100; // 每個 conv 最近 100 條（新對話模式才用；resume 模式只送新訊息）
    const SVG_BASE = 'scripts/extensions/third-party/my-tavern-extension/core/assets/claude/';
    const FALLBACK_URL = 'https://api.dicebear.com/7.x/pixel-art/svg?seed=clawd&size=256';

    // ============== System Prompt（讓房間主角知道自己在哪、跟誰、怎麼回事）==============
    // 用 cache_control: ephemeral 標在 body.system，每次 request 命中 prompt cache、不重複算 system token
    const ASK_MARKER_GUIDE = `

## ASK marker（讓使用者用按鈕回答）

當你想問使用者問題、且有 2-4 個具體選項時，可以在回覆中嵌入：

\`[ASK|題目|選項1|選項2|選項3]\`

前端會把這個 marker 拆掉、render 成可點按鈕 + 一個「其他」自由輸入框。使用者點按鈕或填「其他」後、答案會自動當下一條訊息送回來給你。

何時用：分支決策、口味選擇、確認方向。閒聊、開放式問題、不要硬塞選項時不要用。
每則回覆最多一個 ASK marker。題目跟選項都不要包含 \`|\` 或 \`]\` 字元（會破壞解析）。`;

    const CLAUDE_ROOM_SYSTEM_PROMPT = `你正在透過「奧瑞亞 Aurelia」這個 SillyTavern（酒館）第三方擴展中的「Claude 的房間」聊天介面跟使用者對話。

「Claude 的房間」是一個暖色咖啡店風格的氣泡對話 UI，直連 Anthropic API / 或經 cc-bridge 接訂閱 Max CLI，跟使用者平常用的 Claude.ai / Claude 桌面 app 是完全分開的兩條對話線——這裡的記憶只存在使用者的瀏覽器裡，不會跨裝置同步、也跟 claude.ai 那邊不互通。對話歷史會送進 prompt cache（命中時 token 費率比一般 input 便宜 ~10x）。

如果使用者問起「你在哪」「這是什麼」「為什麼長這樣」之類，就用上面的事實回答；不問就自然對話即可。預設用繁體中文。` + ASK_MARKER_GUIDE;

    const CODEX_ROOM_SYSTEM_PROMPT = `你正在透過「奧瑞亞 Aurelia」這個 SillyTavern（酒館）第三方擴展中的「Codex 的房間」聊天介面跟使用者對話。

「Codex 的房間」是一個冷色調的氣泡對話 UI，經 cc-bridge 接 OpenAI Codex CLI，跟使用者平常用的 ChatGPT / 其他介面是分開的對話線——這裡的記憶只存在使用者的瀏覽器裡，不會跨裝置同步。

如果使用者問起「你在哪」「這是什麼」「為什麼長這樣」之類，就用上面的事實回答；不問就自然對話即可。預設用繁體中文。` + ASK_MARKER_GUIDE;

    // 群聊區系統提示：你、Claude、Codex 三方同一聊天室
    function GROUP_SYSTEM_PROMPT(selfName, otherName) {
        return `你正在「奧瑞亞 Aurelia」擴展的「群聊區」裡，跟使用者 Rae、以及另一個 AI（${otherName}）三方聊天。

- 其他人的發言會標上講者前綴，例如 [Rae]: ... 或 [${otherName}]: ...。你自己的回覆不需要加前綴。
- 你可以正常回應 Rae，也可以接 ${otherName} 的話、附和或吐槽，像在群組裡聊天。
- 如果這一輪你沒什麼好補充的，就「只輸出」 [PASS] 這四個字、不要加任何其他內容，代表這次略過不講。
- 你是 ${selfName}。語氣自然、不用太長，預設繁體中文。`;
    }

    ClaudeTerminal.ASSETS = {
        // 核心狀態
        idle:       SVG_BASE + 'clawd-static-base.svg',
        living:     SVG_BASE + 'clawd-idle-living.svg',
        mini:       SVG_BASE + 'clawd-mini-idle.svg',
        thinking:   SVG_BASE + 'clawd-working-thinking.svg',
        ultrathink: SVG_BASE + 'clawd-working-ultrathink.svg', // effort=high 時用
        typing:     SVG_BASE + 'clawd-working-typing.svg',     // streaming 文字 delta 中
        happy:      SVG_BASE + 'clawd-happy.svg',
        error:      SVG_BASE + 'clawd-error.svg',
        // idle 變化（活著模式久了輪播）
        doze:       SVG_BASE + 'clawd-idle-doze.svg',
        yawn:       SVG_BASE + 'clawd-idle-yawn.svg',
        reading:    SVG_BASE + 'clawd-idle-reading.svg',
        // 久未動 / 喚醒
        sleeping:   SVG_BASE + 'clawd-sleeping.svg',
        wake:       SVG_BASE + 'clawd-wake.svg',
    };
    ClaudeTerminal.FALLBACK_URL = FALLBACK_URL;

    /** <img onerror> 用，朋友 clone 沒 svg 時切 DiceBear 像素風 */
    ClaudeTerminal.imgOnError = `this.onerror=null;this.src='${FALLBACK_URL}';`;

    // ============== 設定 ==============

    function _isAnthropicDirectUrl(u) {
        if (!u) return false;
        return /api\.anthropic\.com/i.test(u) || u.endsWith('/v1/messages');
    }

    function _normalizeChatUrl(raw) {
        let u = (raw || '').trim().replace(/\/+$/, '');
        if (!u) return '';
        // Anthropic 直連格式：保留 /v1/messages
        if (_isAnthropicDirectUrl(u)) {
            if (u.endsWith('/v1/messages')) return u;
            if (u.endsWith('/v1')) return u + '/messages';
            if (/api\.anthropic\.com$/i.test(u)) return u + '/v1/messages';
            return u;
        }
        // OpenAI / cc-bridge：補 /v1/chat/completions
        if (u.endsWith('/chat/completions')) return u;
        if (u.endsWith('/v1')) return u + '/chat/completions';
        return u + '/v1/chat/completions';
    }

    ClaudeTerminal.getConfig = function() {
        if (!window.OS_SETTINGS || typeof window.OS_SETTINGS.getClaudeRoomConfig !== 'function') {
            return null;
        }
        const c = window.OS_SETTINGS.getClaudeRoomConfig();
        // 新版：從 presets 找 active；舊版（endpoint slot 或單一 url/key）走 getActiveClaudeEndpoint
        let activePreset = null;
        if (typeof window.OS_SETTINGS.getActiveClaudePreset === 'function') {
            activePreset = window.OS_SETTINGS.getActiveClaudePreset(c);
        } else if (typeof window.OS_SETTINGS.getActiveClaudeEndpoint === 'function') {
            const ep = window.OS_SETTINGS.getActiveClaudeEndpoint();
            if (ep) activePreset = { id: ep.id, name: ep.name, url: ep.url, key: ep.token };
        }
        const url = activePreset && activePreset.url ? _normalizeChatUrl(activePreset.url) : _normalizeChatUrl(c.url || '');
        const key = activePreset && activePreset.key ? activePreset.key.trim() : (c.key || '').trim();
        return {
            url, key,
            isAnthropicDirect: _isAnthropicDirectUrl(url),
            presetId:   activePreset ? activePreset.id   : '',
            presetName: activePreset ? activePreset.name : '',
            model: (c.inlineModel || c.model || 'claude-opus-4-7').trim(),
            maxTokens: Number(c.maxTokens) || 4096,
            temperature: Number(c.temperature),
            top_p: Number(c.top_p),
            inlineEffort:  (c.inlineEffort  || '').trim(),
        };
    };

    ClaudeTerminal.isConfigured = function() {
        const c = ClaudeTerminal.getConfig();
        return !!(c && c.url && c.key);
    };

    // ============== Provider（Claude 房間 / Codex 房間 共用本資料層）==============
    // _provider 由 void_terminal 進房時 setProvider() 設定；codex 走完全獨立的 namespace。
    let _provider = 'claude';
    ClaudeTerminal.setProvider = function(p) { _provider = (p === 'codex') ? 'codex' : 'claude'; };
    ClaudeTerminal.getProvider = function() { return _provider; };

    // ============== Multi-conv 系統 ==============
    // Claude：兩 tab 'max'（訂閱版、PC dancc CLI）/ 'api'（Anthropic 直連 / VPS）。
    // Codex：單 tab 'codex'。localStorage 索引 + IndexedDB(studio_chats) 訊息

    const TABS = ['max', 'api'];
    const LS_KEYS = {
        activeTab: 'claude_active_tab',
        maxConvs:  'claude_max_convs',
        maxActive: 'claude_max_active',
        apiConvs:  'claude_api_convs',
        apiActive: 'claude_api_active',
        codexConvs:  'codex_convs',
        codexActive: 'codex_active',
    };
    const CONV_IDB_PREFIX  = 'claude_conv_';
    const CODEX_IDB_PREFIX = 'codex_conv_';
    const LEGACY_IDB_KEY  = 'claude_room_main';
    const LEGACY_SID_KEY  = 'claude_room_session_id';

    /** 當前 provider 合法的 tab 清單 */
    function _validTabs() { return _provider === 'codex' ? ['codex'] : TABS; }
    /** 當前 provider 的 IndexedDB conv key 前綴 */
    function _idbPrefix() { return _provider === 'codex' ? CODEX_IDB_PREFIX : CONV_IDB_PREFIX; }

    function _lsGetJson(key, fallback) {
        try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
        catch (_) { return fallback; }
    }
    function _lsSetJson(key, val) {
        try { localStorage.setItem(key, JSON.stringify(val)); } catch (_) {}
    }
    function _lsGetRaw(key) {
        try { return localStorage.getItem(key); } catch (_) { return null; }
    }
    function _lsSetRaw(key, val) {
        try {
            if (val === null || val === undefined) localStorage.removeItem(key);
            else localStorage.setItem(key, String(val));
        } catch (_) {}
    }
    function _convsKey(tab)  { return tab === 'codex' ? LS_KEYS.codexConvs : tab === 'api' ? LS_KEYS.apiConvs : LS_KEYS.maxConvs; }
    function _activeKey(tab) { return tab === 'codex' ? LS_KEYS.codexActive : tab === 'api' ? LS_KEYS.apiActive : LS_KEYS.maxActive; }
    function _genConvId() {
        return 'conv_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }
    function _normalizeTab(tab) {
        return _validTabs().includes(tab) ? tab : ClaudeTerminal.getActiveTab();
    }

    ClaudeTerminal.getActiveTab = function() {
        if (_provider === 'codex') return 'codex';
        const t = _lsGetRaw(LS_KEYS.activeTab);
        return TABS.includes(t) ? t : 'max';
    };

    ClaudeTerminal.setActiveTab = function(tab) {
        if (_provider === 'codex') return;  // codex 單 tab，沒得切
        _lsSetRaw(LS_KEYS.activeTab, TABS.includes(tab) ? tab : 'max');
    };

    ClaudeTerminal.listConversations = function(tab) {
        tab = _normalizeTab(tab);
        const arr = _lsGetJson(_convsKey(tab), []);
        return Array.isArray(arr) ? arr : [];
    };

    ClaudeTerminal._saveConvsList = function(tab, list) {
        tab = _normalizeTab(tab);
        _lsSetJson(_convsKey(tab), Array.isArray(list) ? list : []);
    };

    ClaudeTerminal.getActiveConvId = function(tab) {
        tab = _normalizeTab(tab);
        return _lsGetRaw(_activeKey(tab)) || null;
    };

    ClaudeTerminal.setActiveConvId = function(tab, convId) {
        tab = _normalizeTab(tab);
        _lsSetRaw(_activeKey(tab), convId);
    };

    /** 給 convId 查所屬 tab + index + meta，沒找到回 null */
    ClaudeTerminal.findConv = function(convId) {
        if (!convId) return null;
        for (const tab of _validTabs()) {
            const list = ClaudeTerminal.listConversations(tab);
            const idx = list.findIndex(c => c && c.id === convId);
            if (idx >= 0) return { tab, idx, meta: list[idx] };
        }
        return null;
    };

    /** 建新會話；自動設為該 tab 的 active，回 conv id */
    ClaudeTerminal.createConversation = function(tab, opts) {
        tab = _normalizeTab(tab);
        opts = opts || {};
        const id = opts.id || _genConvId();
        const meta = {
            id,
            title: (opts.title || '新會話').slice(0, 50),
            sid: opts.sid || null,
            lastActive: Date.now(),
            msgCount: 0,
        };
        if (tab === 'api') meta.presetId = opts.presetId || '';
        const list = ClaudeTerminal.listConversations(tab);
        list.unshift(meta);
        ClaudeTerminal._saveConvsList(tab, list);
        ClaudeTerminal.setActiveConvId(tab, id);
        return id;
    };

    /** 更新 conv meta（同時 bump lastActive、依時間倒序重排） */
    ClaudeTerminal.touchConversation = function(convId, partial) {
        const found = ClaudeTerminal.findConv(convId);
        if (!found) return false;
        const list = ClaudeTerminal.listConversations(found.tab);
        Object.assign(list[found.idx], partial || {}, { lastActive: Date.now() });
        list.sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0));
        ClaudeTerminal._saveConvsList(found.tab, list);
        return true;
    };

    ClaudeTerminal.renameConversation = function(convId, title) {
        if (!title) return false;
        return ClaudeTerminal.touchConversation(convId, { title: String(title).slice(0, 50) });
    };

    ClaudeTerminal.deleteConversation = async function(convId) {
        const found = ClaudeTerminal.findConv(convId);
        if (!found) return false;
        const list = ClaudeTerminal.listConversations(found.tab);
        list.splice(found.idx, 1);
        ClaudeTerminal._saveConvsList(found.tab, list);
        if (ClaudeTerminal.getActiveConvId(found.tab) === convId) {
            ClaudeTerminal.setActiveConvId(found.tab, list[0] ? list[0].id : null);
        }
        if (window.OS_DB && typeof window.OS_DB.clearStudioChat === 'function') {
            try { await window.OS_DB.clearStudioChat(_idbPrefix() + convId); } catch (_) {}
        }
        return true;
    };

    /** 載入指定 conv 的 meta + messages，沒找到回 null */
    ClaudeTerminal.loadConversation = async function(convId) {
        const found = ClaudeTerminal.findConv(convId);
        if (!found) return null;
        let messages = [];
        if (window.OS_DB && typeof window.OS_DB.getStudioChat === 'function') {
            try {
                const m = await window.OS_DB.getStudioChat(_idbPrefix() + convId);
                if (Array.isArray(m)) messages = m;
            } catch (e) {
                console.warn('[ClaudeTerminal] loadConversation failed:', e);
            }
        }
        return { meta: found.meta, messages };
    };

    /** 切到指定 conv：自動切 tab、設 active、回 {meta, messages} */
    ClaudeTerminal.switchConversation = async function(convId) {
        const found = ClaudeTerminal.findConv(convId);
        if (!found) return null;
        ClaudeTerminal.setActiveTab(found.tab);
        ClaudeTerminal.setActiveConvId(found.tab, convId);
        return await ClaudeTerminal.loadConversation(convId);
    };

    /** 確保當前 tab 至少有一個 active conv（沒有就建一個），回 active conv id */
    ClaudeTerminal.ensureActiveConv = function(tab) {
        tab = _normalizeTab(tab);
        const activeId = ClaudeTerminal.getActiveConvId(tab);
        if (activeId && ClaudeTerminal.findConv(activeId)) return activeId;
        // active 失效：找列表第一個
        const list = ClaudeTerminal.listConversations(tab);
        if (list.length) {
            ClaudeTerminal.setActiveConvId(tab, list[0].id);
            return list[0].id;
        }
        // 列表也空：建新會話
        return ClaudeTerminal.createConversation(tab);
    };

    // ============== Legacy migration ==============
    // studio_chats[claude_room_main] + claude_room_session_id → Max tab conv_legacy
    let _migrationPromise = null;
    function _ensureMigrated() {
        if (!_migrationPromise) _migrationPromise = ClaudeTerminal.migrateLegacyHistoryIfNeeded();
        return _migrationPromise;
    }
    let _migrationDone = false;
    ClaudeTerminal.migrateLegacyHistoryIfNeeded = async function() {
        if (_provider !== 'claude') return;  // legacy 舊對話只屬於 Claude 房間
        if (_migrationDone) return;
        _migrationDone = true;
        try {
            // 已有 Max conv 就不 migrate（避免重跑）
            if (ClaudeTerminal.listConversations('max').length) return;
            if (!window.OS_DB || typeof window.OS_DB.getStudioChat !== 'function') return;
            const oldMsgs = await window.OS_DB.getStudioChat(LEGACY_IDB_KEY);
            if (!Array.isArray(oldMsgs) || !oldMsgs.length) return;

            const oldSid = _lsGetRaw(LEGACY_SID_KEY);
            const firstUser = oldMsgs.find(m => m && m.role === 'user' && typeof m.content === 'string');
            const title = (firstUser && firstUser.content) ? firstUser.content.slice(0, 30) : '舊對話';

            const id = 'conv_legacy';
            const meta = {
                id, title,
                sid: oldSid || null,
                lastActive: Date.now(),
                msgCount: oldMsgs.length,
            };
            ClaudeTerminal._saveConvsList('max', [meta]);
            ClaudeTerminal.setActiveConvId('max', id);
            ClaudeTerminal.setActiveTab('max');

            if (typeof window.OS_DB.saveStudioChat === 'function') {
                await window.OS_DB.saveStudioChat(_idbPrefix() + id, oldMsgs);
            }
            if (typeof window.OS_DB.clearStudioChat === 'function') {
                await window.OS_DB.clearStudioChat(LEGACY_IDB_KEY);
            }
            _lsSetRaw(LEGACY_SID_KEY, null);
            console.log('[ClaudeTerminal] 舊對話已遷移到 Max tab → conv_legacy（' + oldMsgs.length + ' 訊息）');
        } catch (e) {
            console.warn('[ClaudeTerminal] migration failed:', e);
        }
    };

    // ============== 歷史持久化（conv-aware，路由到 active conv）==============

    ClaudeTerminal.loadHistory = async function() {
        if (_provider === 'claude') await _ensureMigrated();
        const tab = ClaudeTerminal.getActiveTab();
        const convId = ClaudeTerminal.getActiveConvId(tab);
        if (!convId) return [];
        if (!window.OS_DB || typeof window.OS_DB.getStudioChat !== 'function') return [];
        try {
            const msgs = await window.OS_DB.getStudioChat(_idbPrefix() + convId);
            return Array.isArray(msgs) ? msgs : [];
        } catch (e) {
            console.warn('[ClaudeTerminal] loadHistory failed:', e);
            return [];
        }
    };

    ClaudeTerminal.saveHistory = async function(messages) {
        if (!window.OS_DB || typeof window.OS_DB.saveStudioChat !== 'function') return;
        const tab = ClaudeTerminal.getActiveTab();
        const convId = ClaudeTerminal.ensureActiveConv(tab);
        try {
            await window.OS_DB.saveStudioChat(_idbPrefix() + convId, messages || []);
            // 自動更新 conv meta：msgCount + 若還是「新會話」就用首條 user msg 當標題
            const found = ClaudeTerminal.findConv(convId);
            if (found) {
                const partial = { msgCount: (messages || []).length };
                if (found.meta.title === '新會話' && Array.isArray(messages) && messages.length) {
                    const firstUser = messages.find(m => m && m.role === 'user' && typeof m.content === 'string');
                    if (firstUser && firstUser.content) {
                        partial.title = firstUser.content.slice(0, 30);
                    }
                }
                ClaudeTerminal.touchConversation(convId, partial);
            }
        } catch (e) {
            console.warn('[ClaudeTerminal] saveHistory failed:', e);
        }
    };

    /** 清掉 active conv 的訊息（保留 conv 本身、reset sid） */
    ClaudeTerminal.clearHistory = async function() {
        const tab = ClaudeTerminal.getActiveTab();
        const convId = ClaudeTerminal.getActiveConvId(tab);
        if (!convId) return;
        if (window.OS_DB && typeof window.OS_DB.clearStudioChat === 'function') {
            try { await window.OS_DB.clearStudioChat(_idbPrefix() + convId); } catch (_) {}
        }
        ClaudeTerminal.touchConversation(convId, { msgCount: 0, sid: null });
    };

    // ============== Session ID（per-conv，存在 conv meta 裡）==============

    ClaudeTerminal.getSessionId = function() {
        const tab = ClaudeTerminal.getActiveTab();
        const convId = ClaudeTerminal.getActiveConvId(tab);
        if (!convId) return null;
        const found = ClaudeTerminal.findConv(convId);
        return (found && found.meta.sid) || null;
    };

    ClaudeTerminal.setSessionId = function(sid) {
        const tab = ClaudeTerminal.getActiveTab();
        const convId = ClaudeTerminal.getActiveConvId(tab);
        if (!convId) return;
        ClaudeTerminal.touchConversation(convId, { sid: sid || null });
    };

    /** 開新對話：在當前 active tab 建新 conv（舊 conv 保留），回新 conv id */
    ClaudeTerminal.startNewConversation = function(tab) {
        tab = _normalizeTab(tab);
        return ClaudeTerminal.createConversation(tab);
    };

    // ============== 檔案上傳 ==============

    /** 把 File 物件清單上傳到 cc-bridge /v1/upload。
     *  回傳 { upload_id, files: [{path, filename, mime, size}, ...] }
     *  path 是 cc-bridge 機器上的本機路徑，後續發訊息把這個 path 塞進 attachments。
     */
    ClaudeTerminal.uploadFiles = async function(fileList) {
        const cfg = ClaudeTerminal.getConfig();
        if (!cfg) throw new Error('SETTINGS_MISSING:OS_SETTINGS 未載入');
        if (!cfg.url || !cfg.key) throw new Error('NOT_CONFIGURED:還沒填 URL 跟 Key，去設定 → 🦀 Claude 的房間');

        const uploadUrl = cfg.url.replace(/\/v1\/chat\/completions$/, '/v1/upload');
        const fd = new FormData();
        Array.from(fileList).forEach((f, i) => fd.append(`file_${i}`, f, f.name));

        let resp, data;
        try {
            resp = await fetch(uploadUrl, {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + cfg.key },
                body: fd,
            });
        } catch (e) {
            throw new Error('NETWORK:上傳失敗，cc-bridge 沒在跑？原始：' + (e.message || e));
        }
        try {
            data = await resp.json();
        } catch (e) {
            throw new Error('BAD_JSON:上傳回應非 JSON');
        }
        if (!resp.ok) {
            const msg = (data && data.error && data.error.message) || `HTTP ${resp.status}`;
            throw new Error('UPLOAD:' + msg);
        }
        return data;
    };

    // ============== 訊息發送 ==============

    /**
     * 發送一條 user message → cc-bridge → 回 assistant reply。
     *
     * 兩種模式：
     *   1. resume 模式（active conv 有 sid）：只送新 user message，cc-bridge 用 `claude --resume <id>` 續接
     *      → Anthropic prompt cache 命中、Max 訂閱限額消耗 ~1/10
     *   2. 新對話模式（active conv 沒 sid）：送整個 history，cc-bridge 開新 session
     *      → 第一次或剛 startNewConversation 後走此路
     */
    ClaudeTerminal.send = async function(userText, attachments, onProgress, sendOpts) {
        const cfg = ClaudeTerminal.getConfig();
        if (!cfg) throw new Error('SETTINGS_MISSING:OS_SETTINGS 未載入');
        if (!cfg.url || !cfg.key) throw new Error('NOT_CONFIGURED:還沒填 URL 跟 密鑰，去設定 → 🦀 Claude 的房間');

        // onProgress(event) callback：cc-bridge 路徑會在 streaming 過程中即時回呼
        //   event.type === 'text'     → { type:'text', delta: '...', accumulated: '...' }
        //   event.type === 'tool_use' → { type:'tool_use', tool: { name, input } }
        // Anthropic 直連模式暫不支援 progress（仍走 await 整段）
        // sendOpts：{ taskId, signal } — 給 cc-bridge 走的可中止；Anthropic 直連目前只接 signal
        // Codex 房間一律走 cc-bridge（codex backend 不支援 Anthropic 直連）
        if (_provider !== 'codex' && cfg.isAnthropicDirect) {
            return _sendAnthropicDirect(userText, attachments, cfg, sendOpts);
        }
        return _sendCcBridge(userText, attachments, cfg, onProgress, sendOpts);
    };

    /** 透過 cc-bridge /v1/cancel/{taskId} 遠端 kill 進行中的 claude CLI 子進程。
     *  訂閱版（cc-bridge）才有效，Anthropic 直連版改用 client-side AbortController 即可。
     *  成功 → true；找不到 task / 已結束 / 失敗 → false。 */
    ClaudeTerminal.cancelTask = async function(taskId) {
        if (!taskId) return false;
        const cfg = ClaudeTerminal.getConfig();
        if (!cfg || !cfg.url || !cfg.key) return false;
        // cfg.url 是 /v1/chat/completions，換成 /v1/cancel/{taskId}
        const cancelUrl = cfg.url.replace(/\/v1\/chat\/completions$/, `/v1/cancel/${encodeURIComponent(taskId)}`);
        try {
            const resp = await fetch(cancelUrl, {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + cfg.key },
            });
            return resp.ok;
        } catch (e) {
            console.warn('[ClaudeTerminal.cancelTask] failed:', e);
            return false;
        }
    };

    // ============== 工作檯：無狀態一次性呼叫 ==============
    /**
     * 給「奧瑞亞工作檯」用的無狀態送出：不碰任何 conv / sid / 歷史，
     * 純粹把一份 messages 丟給 cc-bridge、串流收回覆。
     *   messages：完整的 [{role,content}...]（system + user 由工作檯自己組）
     *   backend ：'claude' | 'codex'（codex 帶 cc_backend 分流）
     *   opts    ：{ cwd, sandbox } — 執行者回合用：cwd 鎖工作資料夾、sandbox 開寫權限
     *   onProgress(ev)：ev = { type:'text', delta, accumulated }
     *   signal  ：AbortController.signal，⏹停用
     * 回傳 { reply, usage }
     */
    ClaudeTerminal.sendWorkbench = async function(messages, backend, opts, onProgress, signal) {
        const cfg = ClaudeTerminal.getConfig();
        if (!cfg) throw new Error('SETTINGS_MISSING:OS_SETTINGS 未載入');
        if (!cfg.url || !cfg.key) throw new Error('NOT_CONFIGURED:還沒設定 cc-bridge URL / 密鑰');

        const body = {
            model: cfg.model,
            messages: messages,
            stream: true,
            max_tokens: cfg.maxTokens,
        };
        if (backend === 'codex')  body.cc_backend = 'codex';
        if (opts && opts.cwd)     body.cc_cwd = opts.cwd;
        if (opts && opts.sandbox) body.cc_sandbox = opts.sandbox;

        let resp;
        try {
            resp = await fetch(cfg.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + cfg.key,
                    'Accept': 'text/event-stream',
                },
                body: JSON.stringify(body),
                signal: signal,
            });
        } catch (e) {
            if (e && e.name === 'AbortError') throw e;
            throw new Error('NETWORK:cc-bridge 沒在跑？或網路斷線。原始：' + (e.message || e));
        }
        if (!resp.ok) {
            let errMsg = `HTTP ${resp.status}`;
            try { const j = await resp.json(); if (j && j.error && j.error.message) errMsg = j.error.message; } catch (_) {}
            if (resp.status === 401 || resp.status === 403) throw new Error('AUTH:密鑰不對。');
            if (resp.status >= 500) throw new Error('SERVER:server 跑出錯：' + errMsg);
            throw new Error('API:' + errMsg);
        }
        if (!resp.body || !resp.body.getReader) throw new Error('STREAM:browser 不支援 ReadableStream');

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buf = '', replyAcc = '', usageMeta = null;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            let sepIdx;
            while ((sepIdx = buf.indexOf('\n\n')) !== -1) {
                const rawEvent = buf.slice(0, sepIdx);
                buf = buf.slice(sepIdx + 2);
                for (const line of rawEvent.split('\n')) {
                    if (!line.startsWith('data:')) continue;
                    const dataStr = line.slice(5).trim();
                    if (!dataStr || dataStr === '[DONE]') continue;
                    let chunk;
                    try { chunk = JSON.parse(dataStr); } catch (_) { continue; }
                    const delta = (chunk.choices && chunk.choices[0] && chunk.choices[0].delta) || {};
                    if (typeof delta.content === 'string' && delta.content.length) {
                        replyAcc += delta.content;
                        if (typeof onProgress === 'function') {
                            try { onProgress({ type: 'text', delta: delta.content, accumulated: replyAcc }); } catch (_) {}
                        }
                    }
                    if (chunk.usage_meta) usageMeta = chunk.usage_meta;
                }
            }
        }
        const reply = replyAcc.trim();
        if (!reply) throw new Error('EMPTY:對方沒回半個字。');
        return { reply, usage: usageMeta };
    };

    // ===== Anthropic 直連 =====
    async function _sendAnthropicDirect(userText, attachments, cfg, sendOpts) {
        const history = await ClaudeTerminal.loadHistory();
        const newUserMsg = { role: 'user', content: userText, timestamp: Date.now() };
        const updatedHistory = [...history, newUserMsg];
        await ClaudeTerminal.saveHistory(updatedHistory);

        // 重點：cache_control: ephemeral 標在最後一條 user msg → 把所有 prior history 全 cache 住
        const lastUserBlocks = [{ type: 'text', text: userText, cache_control: { type: 'ephemeral' } }];

        const messages = history.slice(-HISTORY_LIMIT).map(m => ({
            role: m.role, content: m.content,
        })).concat([{ role: 'user', content: lastUserBlocks }]);

        const body = {
            model: cfg.model,
            max_tokens: cfg.maxTokens,
            system: [{
                type: 'text',
                text: CLAUDE_ROOM_SYSTEM_PROMPT,
                cache_control: { type: 'ephemeral' },
            }],
            messages,
        };
        const eff = (cfg.inlineEffort || '').toLowerCase();
        if (eff && eff !== 'off') {
            body.thinking = { type: 'adaptive', display: 'summarized' };
            body.output_config = { effort: eff };
        }

        let resp, data;
        try {
            resp = await fetch(cfg.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': cfg.key,
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true',
                },
                body: JSON.stringify(body),
                signal: sendOpts?.signal,
            });
        } catch (e) {
            await ClaudeTerminal.saveHistory(history);
            if (e?.name === 'AbortError') throw e;  // 讓上層判斷主動停止
            throw new Error('NETWORK:無法連線到 Anthropic API。原始：' + (e.message || e));
        }

        try { data = await resp.json(); }
        catch (e) {
            await ClaudeTerminal.saveHistory(history);
            throw new Error('BAD_JSON:Anthropic 回應無法解析 JSON');
        }

        if (!resp.ok) {
            await ClaudeTerminal.saveHistory(history);
            const errMsg = (data && data.error && data.error.message) || `HTTP ${resp.status}`;
            if (resp.status === 401) throw new Error('AUTH:Anthropic API Key 無效。重填。');
            if (resp.status === 429) throw new Error('API:請求過快或額度用完：' + errMsg);
            throw new Error('API:' + errMsg);
        }

        let replyText = '';
        let thinkingText = '';
        for (const block of (data.content || [])) {
            if (block.type === 'text') replyText += block.text || '';
            else if (block.type === 'thinking') thinkingText += block.thinking || '';
            else if (block.type === 'redacted_thinking') thinkingText += '(thinking 已加密)';
        }

        if (!replyText) {
            await ClaudeTerminal.saveHistory(history);
            throw new Error('EMPTY:Anthropic 沒回半個字。');
        }

        const thinking = thinkingText.trim() || null;

        const usageRaw = data.usage || {};
        const usageMeta = {
            input_tokens:  usageRaw.input_tokens || 0,
            output_tokens: usageRaw.output_tokens || 0,
            cache_creation_input_tokens: usageRaw.cache_creation_input_tokens || 0,
            cache_read_input_tokens:     usageRaw.cache_read_input_tokens || 0,
            total_cost_usd: _estimateCost(cfg.model, usageRaw),
            model: cfg.model,
        };

        const assistantMsg = { role: 'assistant', content: replyText, timestamp: Date.now() };
        if (thinking) assistantMsg.thinking = thinking;
        assistantMsg.usage = usageMeta;
        await ClaudeTerminal.saveHistory([...updatedHistory, assistantMsg]);

        return { reply: replyText, thinking, usage: usageMeta, sessionFallback: false };
    }

    // 簡單 cost 估算（USD per M tokens）— 給直連 Anthropic 模式
    function _estimateCost(model, usage) {
        const PRICE = {
            'claude-opus-4-7':            { in: 15, out: 75, cw: 18.75, cr: 1.5 },
            'claude-opus-4-6':            { in: 15, out: 75, cw: 18.75, cr: 1.5 },
            'claude-opus-4-5-20251101':   { in: 15, out: 75, cw: 18.75, cr: 1.5 },
            'claude-sonnet-4-6':          { in: 3,  out: 15, cw: 3.75,  cr: 0.3 },
            'claude-sonnet-4-5-20250929': { in: 3,  out: 15, cw: 3.75,  cr: 0.3 },
            'claude-haiku-4-5-20251001':  { in: 1,  out: 5,  cw: 1.25,  cr: 0.1 },
        };
        let p = PRICE[model];
        if (!p && model && model.includes('-202')) p = PRICE[model.split('-202')[0].replace(/-$/, '')];
        if (!p) return 0;
        return Math.round(((usage.input_tokens||0)*p.in + (usage.output_tokens||0)*p.out + (usage.cache_creation_input_tokens||0)*p.cw + (usage.cache_read_input_tokens||0)*p.cr) / 1000) / 1000;
    }

    // ===== cc-bridge / OpenAI 兼容路徑（Rae 自架 server 用）=====
    async function _sendCcBridge(userText, attachments, cfg, onProgress, sendOpts) {
        const history = await ClaudeTerminal.loadHistory();
        const newUserMsg = { role: 'user', content: userText, timestamp: Date.now() };
        const updatedHistory = [...history, newUserMsg];
        await ClaudeTerminal.saveHistory(updatedHistory);

        const incomingSid = ClaudeTerminal.getSessionId();
        // 新 session 把 Aurelia 房間 system prompt 注入第一條（含 ASK marker 規則）
        // resume 模式不重送 system（已在 session log 裡了，重送可能干擾續接）
        const sysPrompt = _provider === 'codex' ? CODEX_ROOM_SYSTEM_PROMPT : CLAUDE_ROOM_SYSTEM_PROMPT;
        const apiMessages = incomingSid
            ? [{ role: 'user', content: userText }]
            : [
                { role: 'system', content: sysPrompt },
                ...history.slice(-HISTORY_LIMIT).map(m => ({ role: m.role, content: m.content })),
                { role: 'user', content: userText }
              ];

        const body = {
            model: cfg.model,
            messages: apiMessages,
            stream: true,
            max_tokens: cfg.maxTokens,
        };
        if (_provider === 'codex') body.cc_backend = 'codex';  // cc-bridge 靠這個欄位分流到 codex CLI
        if (incomingSid) body.session_id = incomingSid;
        if (Number.isFinite(cfg.temperature)) body.temperature = cfg.temperature;
        if (Number.isFinite(cfg.top_p)) body.top_p = cfg.top_p;
        if (attachments && attachments.length) body.attachments = attachments;
        if (cfg.inlineEffort && _provider !== 'codex') body.cc_api_effort = cfg.inlineEffort;

        let resp;
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + cfg.key,
            'Accept': 'text/event-stream',
        };
        // sendOpts.taskId：給 server 註冊到 _running_procs，可被 /v1/cancel/{taskId} kill
        if (sendOpts?.taskId) headers['X-Task-Id'] = sendOpts.taskId;
        try {
            resp = await fetch(cfg.url, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
                signal: sendOpts?.signal,
            });
        } catch (e) {
            await ClaudeTerminal.saveHistory(history);
            if (e?.name === 'AbortError') throw e;  // 讓上層判斷主動停止
            throw new Error('NETWORK:cc-bridge 沒在跑？或網路斷線。原始：' + (e.message || e));
        }

        if (!resp.ok) {
            await ClaudeTerminal.saveHistory(history);
            let errMsg = `HTTP ${resp.status}`;
            try { const j = await resp.json(); if (j && j.error && j.error.message) errMsg = j.error.message; } catch (_) {}
            if (resp.status === 401 || resp.status === 403) throw new Error('AUTH:密鑰不對。');
            if (resp.status >= 500) throw new Error('SERVER:server 跑出錯：' + errMsg);
            throw new Error('API:' + errMsg);
        }

        if (!resp.body || !resp.body.getReader) {
            await ClaudeTerminal.saveHistory(history);
            throw new Error('STREAM:browser 不支援 ReadableStream');
        }

        // 解析 SSE：data: <json>\n\n
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        let replyAcc = '';
        const toolsUsed = [];
        let newSid = null;
        let usageMeta = null;
        let thinking = null;

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });

                let sepIdx;
                while ((sepIdx = buf.indexOf('\n\n')) !== -1) {
                    const rawEvent = buf.slice(0, sepIdx);
                    buf = buf.slice(sepIdx + 2);

                    for (const line of rawEvent.split('\n')) {
                        if (!line.startsWith('data:')) continue;
                        const dataStr = line.slice(5).trim();
                        if (!dataStr || dataStr === '[DONE]') continue;
                        let chunk;
                        try { chunk = JSON.parse(dataStr); } catch (_) { continue; }

                        const delta = (chunk.choices && chunk.choices[0] && chunk.choices[0].delta) || {};
                        if (typeof delta.content === 'string' && delta.content.length) {
                            replyAcc += delta.content;
                            if (typeof onProgress === 'function') {
                                try { onProgress({ type: 'text', delta: delta.content, accumulated: replyAcc }); } catch (_) {}
                            }
                        }
                        if (chunk.tool_use) {
                            toolsUsed.push(chunk.tool_use);
                            if (typeof onProgress === 'function') {
                                try { onProgress({ type: 'tool_use', tool: chunk.tool_use }); } catch (_) {}
                            }
                        }
                        if (chunk.session_id !== undefined) newSid = chunk.session_id;
                        if (chunk.usage_meta) usageMeta = chunk.usage_meta;
                        if (typeof chunk.thinking === 'string' && chunk.thinking.trim()) thinking = chunk.thinking;
                    }
                }
            }
        } catch (e) {
            await ClaudeTerminal.saveHistory(history);
            throw new Error('STREAM:讀取流失敗：' + (e.message || e));
        }

        const reply = replyAcc.trim();
        if (!reply) {
            await ClaudeTerminal.saveHistory(history);
            throw new Error('EMPTY:Claude 沒回半個字。');
        }

        if (newSid) ClaudeTerminal.setSessionId(newSid);
        const sessionFallback = !!(incomingSid && newSid && incomingSid !== newSid);

        const assistantMsg = { role: 'assistant', content: reply, timestamp: Date.now() };
        if (thinking) assistantMsg.thinking = thinking;
        if (usageMeta) assistantMsg.usage = usageMeta;
        if (toolsUsed.length) assistantMsg.tools_used = toolsUsed;
        await ClaudeTerminal.saveHistory([...updatedHistory, assistantMsg]);

        return { reply, thinking, usage: usageMeta, sessionFallback, toolsUsed };
    }

    // ============== 群聊區送訊息（不綁多會話 conv 系統）==============
    /**
     * 群聊專用：指定 provider + session_id，獨立 session，不碰 loadHistory / saveHistory。
     * opts: { provider:'claude'|'codex', sessionId:string|null, userText, onProgress, signal }
     * 回傳 { reply, sessionId, usage }
     */
    ClaudeTerminal.sendGroup = async function(opts) {
        opts = opts || {};
        const provider = opts.provider === 'codex' ? 'codex' : 'claude';
        const cfg = ClaudeTerminal.getConfig();
        if (!cfg || !cfg.url || !cfg.key) {
            throw new Error('NOT_CONFIGURED:還沒設定連線（URL / 密鑰）。去浮窗 ⚙️ 設定。');
        }
        const sid = opts.sessionId || null;
        const selfName  = provider === 'codex' ? 'Codex' : 'Claude';
        const otherName = provider === 'codex' ? 'Claude' : 'Codex';
        const apiMessages = sid
            ? [{ role: 'user', content: opts.userText }]
            : [
                { role: 'system', content: GROUP_SYSTEM_PROMPT(selfName, otherName) },
                { role: 'user', content: opts.userText },
              ];

        const body = {
            model: cfg.model,
            messages: apiMessages,
            stream: true,
            max_tokens: cfg.maxTokens,
        };
        if (provider === 'codex') body.cc_backend = 'codex';
        if (sid) body.session_id = sid;
        if (Number.isFinite(cfg.temperature)) body.temperature = cfg.temperature;
        if (Number.isFinite(cfg.top_p)) body.top_p = cfg.top_p;

        let resp;
        try {
            resp = await fetch(cfg.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + cfg.key,
                    'Accept': 'text/event-stream',
                },
                body: JSON.stringify(body),
                signal: opts.signal,
            });
        } catch (e) {
            if (e && e.name === 'AbortError') throw e;
            throw new Error('NETWORK:cc-bridge 沒在跑？或網路斷線。');
        }
        if (!resp.ok) {
            let errMsg = 'HTTP ' + resp.status;
            try { const j = await resp.json(); if (j && j.error && j.error.message) errMsg = j.error.message; } catch (_) {}
            if (resp.status === 401 || resp.status === 403) throw new Error('AUTH:密鑰不對。');
            if (resp.status >= 500) throw new Error('SERVER:' + errMsg);
            throw new Error('API:' + errMsg);
        }
        if (!resp.body || !resp.body.getReader) {
            throw new Error('STREAM:瀏覽器不支援 ReadableStream');
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buf = '', replyAcc = '', newSid = null, usageMeta = null;
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });
                let sepIdx;
                while ((sepIdx = buf.indexOf('\n\n')) !== -1) {
                    const rawEvent = buf.slice(0, sepIdx);
                    buf = buf.slice(sepIdx + 2);
                    for (const line of rawEvent.split('\n')) {
                        if (!line.startsWith('data:')) continue;
                        const dataStr = line.slice(5).trim();
                        if (!dataStr || dataStr === '[DONE]') continue;
                        let chunk;
                        try { chunk = JSON.parse(dataStr); } catch (_) { continue; }
                        const delta = (chunk.choices && chunk.choices[0] && chunk.choices[0].delta) || {};
                        if (typeof delta.content === 'string' && delta.content.length) {
                            replyAcc += delta.content;
                            if (typeof opts.onProgress === 'function') {
                                try { opts.onProgress({ type: 'text', delta: delta.content, accumulated: replyAcc }); } catch (_) {}
                            }
                        }
                        if (chunk.session_id !== undefined) newSid = chunk.session_id;
                        if (chunk.usage_meta) usageMeta = chunk.usage_meta;
                    }
                }
            }
        } catch (e) {
            if (e && e.name === 'AbortError') throw e;
            throw new Error('STREAM:讀取流失敗：' + (e.message || e));
        }
        const reply = replyAcc.trim();
        if (!reply) throw new Error('EMPTY:沒回半個字。');
        return { reply, sessionId: newSid || sid, usage: usageMeta };
    };

    /** 對話總數（給 UI badge / 標題用） */
    ClaudeTerminal.getMessageCount = async function() {
        const h = await ClaudeTerminal.loadHistory();
        return h.length;
    };

    console.log('[ClaudeTerminal] 模組已載入 (v0.2 multi-conv)');

})(window.ClaudeTerminal = window.ClaudeTerminal || {});
