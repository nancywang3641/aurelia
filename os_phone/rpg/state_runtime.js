// ----------------------------------------------------------------
// [檔案] state_runtime.js (V1 - Stage 2：副模型抽 + patch + injectPrompts)
// 路徑：os_phone/rpg/state_runtime.js
// 職責：
// 1. 監聽 GENERATION_ENDED → 副模型按 schema 抽劇情狀態變化 → 寫 patches[msgId] → 重算 current
// 2. 監聽 GENERATION_STARTED → injectPrompts 把 current state 注入下一輪主模型 system prompt
// 3. 監聽 MESSAGE_DELETED / SWIPED / UPDATED / EDITED → 砍對應 patch → 重算 current
// 4. 對外：setEnabled / forceExtract / clearPatches
//
// 對應 map 的 vn_bridge：監聽 → 抽 → patch → 累積
// ----------------------------------------------------------------
(function() {
    console.log('🛰️ [State Runtime] V1 載入');
    const win = window.parent || window;

    const CONFIG = {
        debounceMs: 1500,           // GENERATION_ENDED 後 N 毫秒才開始抽
        timeoutMs: 60000,
        retryCount: 2,
        recentMsgs: 4,              // 抽取時參考最近幾條訊息
        maxPatches: 80,             // patches 上限，超過砍最舊
        injectId: 'aurelia_state_brief',
        storageKey: 'aurelia_state_runtime_enabled'
    };

    let _debounceTimer = null;
    let _running = false;           // 防止並發抽取
    let _lastInjectUninject = null; // 上次 injectPrompts 的 uninject 函式

    // --- 工具 ---
    function getChatId() {
        try {
            const ctx = win.SillyTavern?.getContext?.();
            return ctx?.chatId || '';
        } catch(e) { return ''; }
    }

    function isEnabled() {
        return localStorage.getItem(CONFIG.storageKey) === '1';
    }

    function setEnabled(on) {
        localStorage.setItem(CONFIG.storageKey, on ? '1' : '0');
        if (!on) {
            try { _lastInjectUninject?.(); _lastInjectUninject = null; } catch(e) {}
        }
        try { win.eventEmit?.('AURELIA_STATE_RUNTIME_TOGGLED', { enabled: on }); } catch(e) {}
    }

    function showToast(msg, type = 'info') {
        if (win.toastr) win.toastr[type](msg);
        else console.log('[State Runtime Toast]', msg);
    }

    function extractJSON(text) {
        if (!text) return null;
        try { return JSON.parse(text); } catch(e) {}
        const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fence) { try { return JSON.parse(fence[1]); } catch(e) {} }
        const brace = text.match(/\{[\s\S]*\}/);
        if (brace) { try { return JSON.parse(brace[0]); } catch(e) {} }
        return null;
    }

    // --- patch 累積：把 patches 按 msgId 由小到大套到 current ---
    function recomputeCurrent(patches) {
        const ids = Object.keys(patches).map(Number).filter(n => !isNaN(n)).sort((a,b) => a-b);
        const cur = {};
        for (const id of ids) {
            const p = patches[id];
            if (p && typeof p === 'object') Object.assign(cur, p);
        }
        return cur;
    }

    function trimPatches(patches) {
        const ids = Object.keys(patches).map(Number).filter(n => !isNaN(n)).sort((a,b) => a-b);
        if (ids.length <= CONFIG.maxPatches) return patches;
        const cut = ids.slice(0, ids.length - CONFIG.maxPatches);
        const out = { ...patches };
        cut.forEach(id => delete out[id]);
        return out;
    }

    // --- 蒐集最近幾條訊息給副模型 ---
    async function gatherRecentMessages() {
        try {
            if (!win.TavernHelper?.getChatMessages) return { text: '', lastId: -1 };
            const last = await win.TavernHelper.getChatMessages(-1);
            if (!last || !last[0]) return { text: '', lastId: -1 };
            const lastId = last[0].message_id ?? last[0].id ?? 0;
            const start = Math.max(0, lastId - CONFIG.recentMsgs + 1);
            const msgs = await win.TavernHelper.getChatMessages(`${start}-${lastId}`);
            if (!msgs || !msgs.length) return { text: '', lastId };
            const text = msgs.map(m => {
                const role = m.is_user ? 'USER' : (m.name || 'AI');
                const t = (m.message || m.mes || '').slice(0, 1500);
                return `[${role}] ${t}`;
            }).join('\n\n');
            return { text, lastId };
        } catch(e) {
            console.warn('[State Runtime] 撈訊息失敗:', e);
            return { text: '', lastId: -1 };
        }
    }

    // --- 副模型呼叫 ---
    function callSecondary(prompt) {
        return new Promise((resolve, reject) => {
            if (!win.OS_API?.chatSecondary) return reject(new Error('OS_API.chatSecondary 不可用'));
            const messages = [
                { role: 'system', content: 'You are a strict state diff extractor. Output only valid JSON, no markdown.' },
                { role: 'user', content: prompt }
            ];
            let done = false;
            const timer = setTimeout(() => {
                if (done) return; done = true;
                reject(new Error('副模型超時'));
            }, CONFIG.timeoutMs);
            win.OS_API.chatSecondary(messages, null, (text) => {
                if (done) return; done = true;
                clearTimeout(timer);
                resolve(text);
            }, (err) => {
                if (done) return; done = true;
                clearTimeout(timer);
                reject(err);
            });
        });
    }

    async function runWithRetry(prompt) {
        let lastErr;
        for (let i = 0; i < CONFIG.retryCount; i++) {
            try {
                const raw = await callSecondary(prompt);
                const json = extractJSON(raw);
                if (json && json.updates && typeof json.updates === 'object') return json;
                lastErr = new Error(`第 ${i+1} 次：JSON 不含 updates`);
                console.warn('[State Runtime]', lastErr.message, 'raw head:', String(raw).slice(0, 300));
            } catch(e) {
                lastErr = e;
                console.warn('[State Runtime] 第', i+1, '次失敗:', e?.message || e);
            }
        }
        throw lastErr || new Error('副模型重試耗盡');
    }

    // --- prompt：給 schema + current + 最近劇情 → 抽 diff ---
    function buildExtractPrompt(schema, current, recentText) {
        return `你是劇情狀態追蹤抽取器。根據 schema 與最近的劇情，找出狀態欄位的變化。

【schema 定義】
${JSON.stringify(schema, null, 2)}

【上一輪後的當下狀態】
${JSON.stringify(current, null, 2)}

【最近劇情】
${recentText || '（無）'}

---

請輸出嚴格 JSON（不包 markdown，不加註解）：

{
  "updates": {
    "<欄位名>": <新值>
  }
}

【規則】
- 只輸出**這輪有變化**的欄位；沒變的不要寫進 updates
- 數字欄位：直接給新數值（例：當下好感 12 + 升 3 → 15）
- 字串/enum 欄位：給新字串
- list 欄位：給完整陣列（追加項就 push 後完整輸出）
- 如果這輪劇情完全沒觸發任何欄位變化，輸出 { "updates": {} }
- 不要編造劇情沒寫的事`;
    }

    // --- 主流程：抽一次 ---
    async function extractOnce() {
        if (_running) return;
        _running = true;
        try {
            const chatId = getChatId();
            if (!chatId || !win.OS_DB?.getStateData) return;

            const data = await win.OS_DB.getStateData(chatId);
            if (!data || !data.schema || !Object.keys(data.schema).length) {
                // 沒 schema 不抽（要先按按鈕生 schema）
                return;
            }

            const { text: recentText, lastId } = await gatherRecentMessages();
            if (!recentText || lastId < 0) return;

            // 已經抽過這個 msgId，跳過
            if (data.patches && data.patches[lastId] !== undefined) return;

            const prompt = buildExtractPrompt(data.schema, data.current || {}, recentText);
            const json = await runWithRetry(prompt);
            const updates = json.updates || {};

            // 過濾：只接受 schema 裡有的欄位
            const filtered = {};
            for (const k of Object.keys(updates)) {
                if (data.schema[k] !== undefined) filtered[k] = updates[k];
            }

            // 寫 patch
            const newPatches = trimPatches({ ...(data.patches || {}), [lastId]: filtered });
            const newCurrent = recomputeCurrent(newPatches);
            await win.OS_DB.saveStateData(chatId, {
                schema: data.schema,
                patches: newPatches,
                current: newCurrent
            });

            const changed = Object.keys(filtered).length;
            if (changed > 0) {
                console.log(`🛰️ [State Runtime] 抽取完成 msg#${lastId}：${changed} 欄位變化`, filtered);
            }
            try { win.eventEmit?.('AURELIA_STATE_PATCHED', { chatId, msgId: lastId, updates: filtered }); } catch(e) {}
        } catch(e) {
            console.warn('[State Runtime] 抽取失敗:', e?.message || e);
        } finally {
            _running = false;
        }
    }

    // --- inject：把 current 塞進下一輪主模型 system prompt ---
    async function injectCurrent() {
        try {
            // 先撤上次的（避免疊加）
            try { _lastInjectUninject?.(); } catch(e) {}
            _lastInjectUninject = null;

            if (!win.TavernHelper?.injectPrompts) return;
            const chatId = getChatId();
            if (!chatId || !win.OS_DB?.getStateData) return;

            const data = await win.OS_DB.getStateData(chatId);
            if (!data || !data.current || !Object.keys(data.current).length) return;

            const lines = Object.entries(data.current)
                .map(([k, v]) => `- ${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
                .join('\n');
            const content = `[當前劇情狀態 / 由系統自動追蹤，作為劇情參考]\n${lines}`;

            const result = win.TavernHelper.injectPrompts([{
                id: CONFIG.injectId,
                content,
                position: 'in_chat',
                depth: 1,
                role: 'system'
            }], { once: true });
            _lastInjectUninject = result?.uninject || null;
        } catch(e) {
            console.warn('[State Runtime] inject 失敗:', e?.message || e);
        }
    }

    // --- patch 維護：訊息變動時砍對應 patch ---
    async function onMessageInvalidated(msgId) {
        try {
            const chatId = getChatId();
            if (!chatId || !win.OS_DB?.getStateData) return;
            const data = await win.OS_DB.getStateData(chatId);
            if (!data || !data.patches) return;
            if (data.patches[msgId] === undefined) return;
            const newPatches = { ...data.patches };
            delete newPatches[msgId];
            await win.OS_DB.saveStateData(chatId, {
                schema: data.schema,
                patches: newPatches,
                current: recomputeCurrent(newPatches)
            });
            console.log(`🛰️ [State Runtime] 砍 patch msg#${msgId}`);
        } catch(e) {
            console.warn('[State Runtime] 砍 patch 失敗:', e);
        }
    }

    // --- 對外 API ---
    async function clearPatches() {
        const chatId = getChatId();
        if (!chatId || !win.OS_DB?.getStateData) return;
        const data = await win.OS_DB.getStateData(chatId);
        if (!data) return;
        await win.OS_DB.saveStateData(chatId, {
            schema: data.schema,
            patches: {},
            current: {}
        });
        showToast('🧹 已清空所有 state patches', 'info');
    }

    async function forceExtract() {
        if (!isEnabled()) {
            showToast('⚠️ 請先開啟「副模型抽取」開關', 'warning');
            return;
        }
        showToast('🛰️ 立即抽取一次...', 'info');
        await extractOnce();
        showToast('✅ 抽取完成', 'success');
    }

    // --- 事件監聽 ---
    function init() {
        if (!win.eventOn || !win.tavern_events) {
            setTimeout(init, 1000);
            return;
        }

        // 主模型生成完 → 防抖後抽
        win.eventOn(win.tavern_events.GENERATION_ENDED, () => {
            if (!isEnabled()) return;
            clearTimeout(_debounceTimer);
            _debounceTimer = setTimeout(extractOnce, CONFIG.debounceMs);
        });

        // 主模型開始生成 → inject current 給它看
        if (win.tavern_events.GENERATION_STARTED) {
            win.eventOn(win.tavern_events.GENERATION_STARTED, () => {
                if (!isEnabled()) return;
                injectCurrent();
            });
        }

        // 訊息失效 → 砍對應 patch
        const invalidateEvents = [
            'MESSAGE_DELETED', 'MESSAGE_SWIPED', 'MESSAGE_UPDATED', 'MESSAGE_EDITED'
        ];
        invalidateEvents.forEach(name => {
            const ev = win.tavern_events[name];
            if (ev) win.eventOn(ev, (msgId) => onMessageInvalidated(msgId));
        });

        // 切聊天 → 清 inject（新 chatId 的 inject 會在下次 GENERATION_STARTED 重新跑）
        if (win.tavern_events.CHAT_CHANGED) {
            win.eventOn(win.tavern_events.CHAT_CHANGED, () => {
                try { _lastInjectUninject?.(); _lastInjectUninject = null; } catch(e) {}
            });
        }

        console.log('🛰️ [State Runtime] Ready');
    }

    win.OS_STATE_RUNTIME = {
        isEnabled, setEnabled,
        forceExtract, clearPatches,
        injectCurrent, extractOnce,
        CONFIG
    };

    init();
})();
