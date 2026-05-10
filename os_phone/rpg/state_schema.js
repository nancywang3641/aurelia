// ----------------------------------------------------------------
// [檔案] state_schema.js (V1 - Stage 1：副模型生 schema)
// 路徑：os_phone/rpg/state_schema.js
// 職責：
// 1. 讀世界書 + 主角設定 + 開頭幾條 chat → 拼成 Stage 1 prompt
// 2. 跑副模型 chatSecondary 吐 JSON schema（這個世界要追蹤哪些狀態欄位）
// 3. 寫進 OS_DB.saveStateData（key = chatId）
// 4. emit 'AURELIA_STATE_SCHEMA_GENERATED' 事件給 panel 重新渲染
//
// 對應 map 的 world_generator 的位置：一次性 / 可重生
// ----------------------------------------------------------------
(function() {
    console.log('🧬 [State Schema] V1 載入');
    const win = window.parent || window;

    const CONFIG = {
        headMessages: 6,    // 開頭幾條訊息餵給副模型參考
        timeoutMs: 60000,
        retryCount: 2,
        minFields: 4,
        maxFields: 15
    };

    // --- 工具 ---
    // 與 state_runtime.js 共用 normalize 邏輯（剝路徑、砍 .jsonl）
    function normalizeChatId(raw) {
        if (!raw) return '';
        let s = String(raw).split(/[\\/]/).pop() || '';
        s = s.replace(/\.jsonl?$/i, '');
        return s.trim();
    }

    function getChatId() {
        try {
            const ctx = win.SillyTavern?.getContext?.();
            return normalizeChatId(ctx?.chatId);
        } catch(e) { return ''; }
    }

    function showToast(msg, type = 'info') {
        if (win.toastr) win.toastr[type](msg);
        else console.log('[State Schema Toast]', msg);
    }

    function extractJSON(text) {
        if (!text) return null;
        // 先試完整 parse
        try { return JSON.parse(text); } catch(e) {}
        // 抓 ```json ... ``` 區塊
        const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fence) {
            try { return JSON.parse(fence[1]); } catch(e) {}
        }
        // 抓最外層 { ... }
        const brace = text.match(/\{[\s\S]*\}/);
        if (brace) {
            try { return JSON.parse(brace[0]); } catch(e) {}
        }
        return null;
    }

    // --- 蒐集素材 ---
    async function gatherWorldbookText() {
        try {
            if (!win.TavernHelper) return '';
            const ctx = win.SillyTavern?.getContext?.();
            const bookName = win.TavernHelper.getCurrentCharPrimaryLorebook?.()
                || win.TavernHelper.getCharWorldbookNames?.('current')?.primary
                || '';
            if (!bookName) return '';
            const entries = await win.TavernHelper.getLorebookEntries(bookName);
            if (!entries || !entries.length) return '';
            return entries
                .filter(e => e && e.enabled !== false && e.content)
                .slice(0, 25)   // 防爆
                .map(e => `[${e.comment || (e.keys || []).join(',') || 'entry'}]\n${(e.content || '').slice(0, 800)}`)
                .join('\n\n');
        } catch(e) {
            console.warn('[State Schema] 讀世界書失敗:', e);
            return '';
        }
    }

    async function gatherUserPersona() {
        try {
            const ctx = win.SillyTavern?.getContext?.();
            const name = ctx?.name1 || '';
            const desc = ctx?.userPersona || ctx?.persona || '';
            return name || desc ? `主角：${name}\n${desc}`.trim() : '';
        } catch(e) { return ''; }
    }

    async function gatherCharCard() {
        try {
            const ctx = win.SillyTavern?.getContext?.();
            const ch = ctx?.characters?.[ctx?.characterId];
            if (!ch) return '';
            const parts = [];
            if (ch.description) parts.push(`描述：${String(ch.description).slice(0, 1500)}`);
            if (ch.scenario)    parts.push(`場景：${String(ch.scenario).slice(0, 800)}`);
            if (ch.first_mes)   parts.push(`開場：${String(ch.first_mes).slice(0, 800)}`);
            return parts.join('\n');
        } catch(e) { return ''; }
    }

    async function gatherHeadMessages() {
        try {
            if (!win.TavernHelper?.getChatMessages) return '';
            const last = await win.TavernHelper.getChatMessages(-1);
            const lastId = (last && last[0] && (last[0].message_id ?? last[0].id)) ?? 0;
            const headEnd = Math.min(CONFIG.headMessages - 1, lastId);
            const msgs = await win.TavernHelper.getChatMessages(`0-${headEnd}`);
            if (!msgs || !msgs.length) return '';
            return msgs.map(m => {
                const role = m.is_user ? 'USER' : (m.name || 'AI');
                const text = (m.message || m.mes || '').slice(0, 600);
                return `[${role}] ${text}`;
            }).join('\n\n');
        } catch(e) {
            console.warn('[State Schema] 撈訊息失敗:', e);
            return '';
        }
    }

    // --- prompt ---
    function buildPrompt(materials) {
        return `你是劇情狀態追蹤系統的 schema 設計師。
看下面這個跑團世界的世界書、角色設定、開頭劇情，決定接下來的劇情中**值得每輪追蹤**的狀態欄位。

【世界書】
${materials.worldbook || '（無）'}

【角色卡】
${materials.charCard || '（無）'}

【主角設定】
${materials.userPersona || '（無）'}

【開頭劇情】
${materials.headMessages || '（無）'}

---

請輸出嚴格 JSON，格式如下（不要包 markdown 區塊，不要加註解）：

{
  "fields": {
    "<欄位中文名>": {
      "type": "<number | string | enum | list>",
      "desc": "<這欄位記什麼，何時會變>",
      "init": "<初始值，可空字串>"
    }
  }
}

【規則】
- 欄位數 ${CONFIG.minFields}-${CONFIG.maxFields} 個
- **只追蹤會隨劇情變化的事**（好感度、HP、當前任務、時間、地點、心情、攜帶物品、進度條、倒計時等）
- **絕不追蹤永久不變的事**（世界觀設定、種族、固定外觀、背景設定）
- 名稱用中文簡潔，例：「主角好感」、「當前地點」、「末日倒計時」
- enum 型在 desc 列出可選值
- list 型用於物品/線索清單
- 重視這個世界**特有**的元素（例：末日題材就要倒計時；推理題材就要線索清單；戀愛題材就要好感分數）`;
    }

    // --- 副模型呼叫 ---
    function callSecondary(prompt) {
        return new Promise((resolve, reject) => {
            if (!win.OS_API?.chatSecondary) return reject(new Error('OS_API.chatSecondary 不可用'));
            const messages = [
                { role: 'system', content: 'You are a strict JSON schema designer. Output only valid JSON, no markdown, no comments.' },
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
                if (json && json.fields && typeof json.fields === 'object' && Object.keys(json.fields).length >= CONFIG.minFields) {
                    return json;
                }
                lastErr = new Error(`第 ${i+1} 次：schema 不符（fields 太少或缺）`);
                console.warn('[State Schema]', lastErr.message, 'raw head:', String(raw).slice(0, 300));
            } catch(e) {
                lastErr = e;
                console.warn('[State Schema] 第', i+1, '次失敗:', e?.message || e);
            }
        }
        throw lastErr || new Error('副模型重試耗盡');
    }

    // --- 對外 API ---
    async function generate(opts = {}) {
        const chatId = getChatId();
        if (!chatId) { showToast('⚠️ 沒有 chatId，無法生成 schema', 'warning'); return null; }

        showToast('🧬 副模型正在分析世界 → 生成狀態 schema...', 'info');
        try {
            const [worldbook, userPersona, charCard, headMessages] = await Promise.all([
                gatherWorldbookText(),
                gatherUserPersona(),
                gatherCharCard(),
                gatherHeadMessages()
            ]);
            const prompt = buildPrompt({ worldbook, userPersona, charCard, headMessages });
            const json = await runWithRetry(prompt);

            // 寫進 OS_DB（保留舊 patches/current，只覆蓋 schema）
            const existing = (win.OS_DB?.getStateData ? await win.OS_DB.getStateData(chatId) : null) || {};
            await win.OS_DB.saveStateData(chatId, {
                schema: json.fields,
                patches: opts.resetPatches ? {} : (existing.patches || {}),
                current: opts.resetPatches ? {} : (existing.current || {})
            });

            const count = Object.keys(json.fields).length;
            showToast(`✅ Schema 生成完成（${count} 個欄位）`, 'success');
            try { win.eventEmit?.('AURELIA_STATE_SCHEMA_GENERATED', { chatId, fields: json.fields }); } catch(e) {}
            return json.fields;
        } catch(e) {
            console.error('[State Schema] 生成失敗:', e);
            showToast(`❌ Schema 生成失敗：${e.message || e}`, 'error');
            return null;
        }
    }

    async function getCurrentSchema() {
        const chatId = getChatId();
        if (!chatId || !win.OS_DB?.getStateData) return null;
        const data = await win.OS_DB.getStateData(chatId);
        return data?.schema || null;
    }

    win.OS_STATE_SCHEMA = {
        generate,
        getCurrentSchema,
        CONFIG
    };

    console.log('🧬 [State Schema] Ready');
})();
