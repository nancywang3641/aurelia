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
    const SESSION_ID_KEY = 'claude_room_session_id'; // localStorage key（明天會被 multi-conv 系統取代）
    const SVG_BASE = 'scripts/extensions/third-party/my-tavern-extension/core/assets/claude/';
    const FALLBACK_URL = 'https://api.dicebear.com/7.x/pixel-art/svg?seed=clawd&size=256';

    // ============== System Prompt（讓 Clawd 知道自己在哪、跟誰、怎麼回事）==============
    // 用 cache_control: ephemeral 標在 body.system，每次 request 命中 prompt cache、不重複算 system token
    const CLAUDE_ROOM_SYSTEM_PROMPT = `你正在透過「奧瑞亞 Aurelia」這個 SillyTavern（酒館）第三方擴展中的「Claude 的房間」聊天介面跟使用者對話。

「Claude 的房間」是一個暖色咖啡店風格的氣泡對話 UI，直連 Anthropic API，跟使用者平常用的 Claude.ai / Claude 桌面 app 是完全分開的兩條對話線——這裡的記憶只存在使用者的瀏覽器裡，不會跨裝置同步、也跟 claude.ai 那邊不互通。對話歷史會送進 prompt cache（命中時 token 費率比一般 input 便宜 ~10x）。

如果使用者問起「你在哪」「這是什麼」「為什麼長這樣」之類，就用上面的事實回答；不問就自然對話即可。預設用繁體中文。`;

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
            // inlineBackend 已棄用（picker 砍 BACKEND section 了），保留讀但不送 body
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
    ClaudeTerminal.send = async function(userText, attachments, onProgress) {
        const cfg = ClaudeTerminal.getConfig();
        if (!cfg) throw new Error('SETTINGS_MISSING:OS_SETTINGS 未載入');
        if (!cfg.url || !cfg.key) throw new Error('NOT_CONFIGURED:還沒填 URL 跟 密鑰，去設定 → 🦀 Claude 的房間');

        // onProgress(event) callback：cc-bridge 路徑會在 streaming 過程中即時回呼
        //   event.type === 'text'     → { type:'text', delta: '...', accumulated: '...' }
        //   event.type === 'tool_use' → { type:'tool_use', tool: { name, input } }
        // Anthropic 直連模式暫不支援 progress（仍走 await 整段）
        // 依 URL 自動分流：Anthropic 直連 vs cc-bridge / OpenAI 兼容
        if (cfg.isAnthropicDirect) {
            return _sendAnthropicDirect(userText, attachments, cfg);
        }
        return _sendCcBridge(userText, attachments, cfg, onProgress);
    };

    // ===== Anthropic 直連（朋友最常用、不需任何 server）=====
    async function _sendAnthropicDirect(userText, attachments, cfg) {
        const history = await ClaudeTerminal.loadHistory();
        const newUserMsg = { role: 'user', content: userText, timestamp: Date.now() };
        const updatedHistory = [...history, newUserMsg];
        await ClaudeTerminal.saveHistory(updatedHistory);

        // 攻略：把附件圖片讀成 base64 image_block（瀏覽器原生 file 物件處理）
        // 注意：附件物件目前只在 cc-bridge 路徑生產（path 是 server 上的）
        // 直連模式暫不支援 path-based 附件，只走純文字（後續可加 FileReader 直接讀）
        // 重點：cache_control: ephemeral 標在最後一條 user msg → 把所有 prior history 全 cache 住
        // 下次發訊息時前面歷史命中 cache、token 算 cache_read 費率（比 input 便宜 ~10x）
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
        // thinking effort（非 off / 空字串才啟用）
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
            });
        } catch (e) {
            await ClaudeTerminal.saveHistory(history);
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

        // 拆 content blocks（可能有 thinking + text）
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

        // 算 cost（Opus 4.x 預設定價、其他可加擴展）
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
    async function _sendCcBridge(userText, attachments, cfg, onProgress) {
        const history = await ClaudeTerminal.loadHistory();
        const newUserMsg = { role: 'user', content: userText, timestamp: Date.now() };
        const updatedHistory = [...history, newUserMsg];
        await ClaudeTerminal.saveHistory(updatedHistory);

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
            stream: true,  // 走真 streaming 拿 block-level 漸進輸出
            max_tokens: cfg.maxTokens,
        };
        if (incomingSid) body.session_id = incomingSid;
        if (Number.isFinite(cfg.temperature)) body.temperature = cfg.temperature;
        if (Number.isFinite(cfg.top_p)) body.top_p = cfg.top_p;
        if (attachments && attachments.length) body.attachments = attachments;
        if (cfg.inlineEffort) body.cc_api_effort = cfg.inlineEffort;

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
            });
        } catch (e) {
            await ClaudeTerminal.saveHistory(history);
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

                // SSE 事件以 \n\n 分隔，每事件可能多行（我們只解 data:）
                let sepIdx;
                while ((sepIdx = buf.indexOf('\n\n')) !== -1) {
                    const rawEvent = buf.slice(0, sepIdx);
                    buf = buf.slice(sepIdx + 2);

                    // 拆每行（但通常只有 data: 一行）
                    for (const line of rawEvent.split('\n')) {
                        if (!line.startsWith('data:')) continue;
                        const dataStr = line.slice(5).trim();
                        if (!dataStr || dataStr === '[DONE]') continue;
                        let chunk;
                        try { chunk = JSON.parse(dataStr); } catch (_) { continue; }

                        const delta = (chunk.choices && chunk.choices[0] && chunk.choices[0].delta) || {};
                        // 文字 delta（漸進式 append）
                        if (typeof delta.content === 'string' && delta.content.length) {
                            replyAcc += delta.content;
                            if (typeof onProgress === 'function') {
                                try { onProgress({ type: 'text', delta: delta.content, accumulated: replyAcc }); } catch (_) {}
                            }
                        }
                        // 自定欄位：tool_use（後端即時送）
                        if (chunk.tool_use) {
                            toolsUsed.push(chunk.tool_use);
                            if (typeof onProgress === 'function') {
                                try { onProgress({ type: 'tool_use', tool: chunk.tool_use }); } catch (_) {}
                            }
                        }
                        // 自定欄位（done chunk 才會有）
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

    /** 對話總數（給 UI badge / 標題用） */
    ClaudeTerminal.getMessageCount = async function() {
        const h = await ClaudeTerminal.loadHistory();
        return h.length;
    };

    console.log('[ClaudeTerminal] 模組已載入 (v0.1 MVP)');

})(window.ClaudeTerminal = window.ClaudeTerminal || {});
