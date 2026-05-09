/**
 * ========================
 * Claude Terminal (v0.1 - MVP)
 * 「Claude 的房間」獨立對話接口
 * ========================
 * 職責：
 * 1. 走 cc-bridge / OpenAI 兼容 API（不經 OS_API、跟主/副模型隔離、不污染 preset）
 * 2. 對話歷史持久化至 IndexedDB（os_db studio_chats，modeId = 'claude_room_main'）
 * 3. 提供立繪資源映射（本機 Clawd SVG，朋友 fallback DiceBear pixel-art）
 *
 * 不負責 UI 渲染——UI 由 void_terminal 共用大廳場景；本檔僅 API + 持久化 + 資源 helper。
 */

(function(ClaudeTerminal) {
    'use strict';

    const HISTORY_MODE_ID = 'claude_room_main';
    const HISTORY_LIMIT = 100; // 最近 100 條（約 50 輪），新對話模式才用；resume 模式只送新訊息
    const SESSION_ID_KEY = 'claude_room_session_id'; // localStorage key
    const SVG_BASE = 'scripts/extensions/third-party/my-tavern-extension/core/assets/claude/';
    const FALLBACK_URL = 'https://api.dicebear.com/7.x/pixel-art/svg?seed=clawd&size=256';

    ClaudeTerminal.ASSETS = {
        idle:     SVG_BASE + 'clawd-static-base.svg',
        living:   SVG_BASE + 'clawd-idle-living.svg',
        mini:     SVG_BASE + 'clawd-mini-idle.svg',
        thinking: SVG_BASE + 'clawd-working-thinking.svg',
        happy:    SVG_BASE + 'clawd-happy.svg',
        error:    SVG_BASE + 'clawd-error.svg'
    };
    ClaudeTerminal.FALLBACK_URL = FALLBACK_URL;

    /** <img onerror> 用，朋友 clone 沒 svg 時切 DiceBear 像素風 */
    ClaudeTerminal.imgOnError = `this.onerror=null;this.src='${FALLBACK_URL}';`;

    // ============== 設定 ==============

    function _normalizeChatUrl(raw) {
        let u = (raw || '').trim().replace(/\/+$/, '');
        if (!u) return '';
        if (u.endsWith('/chat/completions')) return u;
        if (u.endsWith('/v1')) return u + '/chat/completions';
        return u + '/v1/chat/completions';
    }

    ClaudeTerminal.getConfig = function() {
        if (!window.OS_SETTINGS || typeof window.OS_SETTINGS.getClaudeRoomConfig !== 'function') {
            return null;
        }
        const c = window.OS_SETTINGS.getClaudeRoomConfig();
        // 優先用 active endpoint（新版多 slot），fallback 到老 c.url/c.key（向下相容）
        const ep = (typeof window.OS_SETTINGS.getActiveClaudeEndpoint === 'function')
            ? window.OS_SETTINGS.getActiveClaudeEndpoint(c) : null;
        const url   = ep && ep.url   ? _normalizeChatUrl(ep.url)   : _normalizeChatUrl(c.url);
        const key   = ep && ep.token ? ep.token.trim()              : (c.key || '').trim();
        const apiKey = ep && ep.apiKey ? ep.apiKey.trim() : '';
        return {
            url, key, apiKey,
            endpointId:   ep ? ep.id : 'pc',
            endpointName: ep ? ep.name : '',
            model: (c.inlineModel || c.model || 'claude-opus-4-7').trim(),
            maxTokens: Number(c.maxTokens) || 4096,
            temperature: Number(c.temperature),
            top_p: Number(c.top_p),
            // inline picker 覆寫（送進 body 給 cc-bridge）
            inlineEffort:  (c.inlineEffort  || '').trim(),
            inlineBackend: (c.inlineBackend || '').trim(),
        };
    };

    ClaudeTerminal.isConfigured = function() {
        const c = ClaudeTerminal.getConfig();
        return !!(c && c.url && c.key);
    };

    // ============== 歷史持久化（os_db studio_chats）==============

    ClaudeTerminal.loadHistory = async function() {
        if (!window.OS_DB || typeof window.OS_DB.getStudioChat !== 'function') return [];
        try {
            const msgs = await window.OS_DB.getStudioChat(HISTORY_MODE_ID);
            return Array.isArray(msgs) ? msgs : [];
        } catch (e) {
            console.warn('[ClaudeTerminal] loadHistory failed:', e);
            return [];
        }
    };

    ClaudeTerminal.saveHistory = async function(messages) {
        if (!window.OS_DB || typeof window.OS_DB.saveStudioChat !== 'function') return;
        try {
            await window.OS_DB.saveStudioChat(HISTORY_MODE_ID, messages || []);
        } catch (e) {
            console.warn('[ClaudeTerminal] saveHistory failed:', e);
        }
    };

    ClaudeTerminal.clearHistory = async function() {
        if (!window.OS_DB || typeof window.OS_DB.clearStudioChat !== 'function') return;
        try {
            await window.OS_DB.clearStudioChat(HISTORY_MODE_ID);
        } catch (e) {
            console.warn('[ClaudeTerminal] clearHistory failed:', e);
        }
    };

    // ============== Session ID（給 cc-bridge resume 用，省 prompt cache） ==============

    ClaudeTerminal.getSessionId = function() {
        try { return localStorage.getItem(SESSION_ID_KEY) || null; } catch (e) { return null; }
    };

    ClaudeTerminal.setSessionId = function(sid) {
        try {
            if (sid) localStorage.setItem(SESSION_ID_KEY, sid);
            else localStorage.removeItem(SESSION_ID_KEY);
        } catch (e) {}
    };

    /** 開新對話：清 session_id + 清歷史。給 hist 視窗按鈕用 */
    ClaudeTerminal.startNewConversation = async function() {
        ClaudeTerminal.setSessionId(null);
        await ClaudeTerminal.clearHistory();
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
     *   1. resume 模式（有 session_id）：只送新 user message，cc-bridge 用 `claude --resume <id>` 續接
     *      → Anthropic prompt cache 命中、Max 訂閱限額消耗 ~1/10
     *   2. 新對話模式（沒 session_id）：送整個 history，cc-bridge 開新 session
     *      → 第一次或 startNewConversation 後走此路
     *
     * @param {string} userText
     * @param {Array<{path,filename,mime}>} [attachments] 上傳完的附件清單（已是 cc-bridge 本機路徑）
     * @returns {Promise<{reply: string, sessionFallback: boolean}>}
     *   sessionFallback=true 表 cc-bridge resume 失敗、退回新 session（Claude 失憶警告）
     */
    ClaudeTerminal.send = async function(userText, attachments) {
        const cfg = ClaudeTerminal.getConfig();
        if (!cfg) throw new Error('SETTINGS_MISSING:OS_SETTINGS 未載入');
        if (!cfg.url || !cfg.key) throw new Error('NOT_CONFIGURED:還沒填 URL 跟 Key，去設定 → 🦀 Claude 的房間');

        // 讀歷史 → 加新 user → 立即存（讓 UI 即時顯示在 hist 視窗）
        const history = await ClaudeTerminal.loadHistory();
        const newUserMsg = { role: 'user', content: userText, timestamp: Date.now() };
        const updatedHistory = [...history, newUserMsg];
        await ClaudeTerminal.saveHistory(updatedHistory);

        // 決定送多少 messages：有 session_id 就只送新 user（resume 走 cache）；沒就送全歷史
        const incomingSid = ClaudeTerminal.getSessionId();
        const apiMessages = incomingSid
            ? [{ role: 'user', content: userText }]
            : [
                ...history.slice(-HISTORY_LIMIT).map(m => ({ role: m.role, content: m.content })),
                { role: 'user', content: userText }
              ];

        const body = {
            model: cfg.model,
            messages: apiMessages,
            stream: false,
            max_tokens: cfg.maxTokens
        };
        if (incomingSid) body.session_id = incomingSid;
        if (Number.isFinite(cfg.temperature)) body.temperature = cfg.temperature;
        if (Number.isFinite(cfg.top_p)) body.top_p = cfg.top_p;
        if (attachments && attachments.length) body.attachments = attachments;
        // 自定 overrides 給 cc-bridge：inline picker 選的 backend/effort、面板填的 api key
        if (cfg.inlineBackend) body.cc_backend = cfg.inlineBackend;
        if (cfg.inlineEffort)  body.cc_api_effort = cfg.inlineEffort;
        if (cfg.apiKey)        body.anthropic_api_key = cfg.apiKey;

        let resp, data;
        try {
            resp = await fetch(cfg.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + cfg.key
                },
                body: JSON.stringify(body)
            });
        } catch (e) {
            // 訊息存進歷史但 API 失敗——回滾這條 user
            await ClaudeTerminal.saveHistory(history);
            throw new Error('NETWORK:本機 cc-bridge 沒在跑？或網路斷線。原始：' + (e.message || e));
        }

        try {
            data = await resp.json();
        } catch (e) {
            await ClaudeTerminal.saveHistory(history);
            throw new Error('BAD_JSON:cc-bridge 回應無法解析 JSON');
        }

        if (!resp.ok) {
            await ClaudeTerminal.saveHistory(history);
            const errMsg = (data && data.error && data.error.message) || `HTTP ${resp.status}`;
            if (resp.status === 401 || resp.status === 403) {
                throw new Error('AUTH:Key 不對。去設定 → 🦀 Claude 的房間 重填。');
            }
            if (resp.status >= 500) {
                throw new Error('SERVER:Claude 跑出錯。看 cc-bridge log。原始：' + errMsg);
            }
            throw new Error('API:' + errMsg);
        }

        const reply = data && data.choices && data.choices[0] && data.choices[0].message
            ? (data.choices[0].message.content || '').trim()
            : '';

        if (!reply) {
            await ClaudeTerminal.saveHistory(history);
            throw new Error('EMPTY:Claude 沒回半個字。');
        }

        // 更新 session_id（CLI 每次都吐 new session_id，resume 成功也會吐同一個）
        const newSid = data.session_id || null;
        if (newSid) ClaudeTerminal.setSessionId(newSid);

        // Fallback 偵測：送了 sid 但 cc-bridge 回了不同的 → 表示 resume 失敗、開了新 session
        // → Claude 看不到之前歷史、這次回覆會失憶。caller 應該顯示警告
        const sessionFallback = !!(incomingSid && newSid && incomingSid !== newSid);

        // thinking content（API 模式才有；CLI 模式為 null/undefined）
        const thinking = (typeof data.thinking === 'string' && data.thinking.trim()) ? data.thinking : null;

        // usage_meta（含 token 數 + total_cost_usd + model）
        const usageMeta = data.usage_meta || null;

        // 寫回 assistant（含 thinking + usage 一起存，hist 視窗 / 重整後可看回放）
        const assistantMsg = { role: 'assistant', content: reply, timestamp: Date.now() };
        if (thinking) assistantMsg.thinking = thinking;
        if (usageMeta) assistantMsg.usage = usageMeta;
        const finalHistory = [...updatedHistory, assistantMsg];
        await ClaudeTerminal.saveHistory(finalHistory);

        return { reply, thinking, usage: usageMeta, sessionFallback };
    };

    /** 對話總數（給 UI badge / 標題用） */
    ClaudeTerminal.getMessageCount = async function() {
        const h = await ClaudeTerminal.loadHistory();
        return h.length;
    };

    console.log('[ClaudeTerminal] 模組已載入 (v0.1 MVP)');

})(window.ClaudeTerminal = window.ClaudeTerminal || {});
