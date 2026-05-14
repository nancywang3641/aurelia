// ----------------------------------------------------------------
// [檔案] state_schema.js (V2 - Stage 1：主模型生 schema)
// 路徑：os_phone/rpg/state_schema.js
// 職責：
// 1. 讀世界書 + 主角設定 + 開頭幾條 chat → 拼成 Stage 1 prompt
// 2. 跑主模型 OS_API.chat 吐 JSON schema（這個世界要追蹤哪些狀態欄位）
//    主模型用於 schema 是因為這是一次性「設計師工作」，要對世界觀深度理解，
//    用主模型品質較高。Stage 2 高頻 patches 抽取仍用副模型（state_runtime.js）。
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

═══════════════════════════════════════
⚠️【第一鐵律 · 違反直接整份重寫】
這是群像劇，角色很多。**絕對禁止**生成「變數名裡帶具體角色名」的扁平變數。
❌ 錯誤（一個角色一個變數）：「瑟琳理智值」「奧爾德信任度」「卡蜜拉HP」「小花好感度」
✅ 正確（所有角色塞進一個 object 容器）：開「角色狀態」object 欄位，init = { "瑟琳":{...}, "奧爾德":{...} }
判斷法：變數名裡**只要出現任何一個具體角色名**，就是錯的 → 必須改成 object 容器。
通用化原則：你看到「奧爾德」「瑟琳」這些名字，不是叫你各開一個變數，是叫你把它們當「同一個容器裡的不同條目」。
═══════════════════════════════════════

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
      "type": "<number | string | enum | list | object>",
      "desc": "<這欄位記什麼，何時會變>",
      "init": <初始值>
    }
  },
  "rules": [
    {
      "name": "<規則名>",
      "path": "<變數名，object 型用點記法如 角色狀態.瑟琳.理智值>",
      "op": "<>= | <= | > | < | = | !=>",
      "value": <比較值>,
      "content": "<當條件成立時主模型該如何調整劇情/對話>"
    }
  ]
}

【⚠️ 同類多實體 → 必須用 object 型（最重要）】
- 當世界有「多個同類角色 / NPC」且各自有屬性要追蹤時：
  ❌ **絕不要**每個角色拆成獨立扁平變數（例「瑟琳理智值」「奧爾德信任度」分成兩個 number 欄位）
  ✅ **要**歸納成一個 object 型欄位，init 是巢狀物件

【⚠️ object 容器內：基礎屬性統一 + 角色特有（重要）】
- 每個角色的屬性分兩部分，順序固定：
  1.【基礎屬性】先定一組「所有角色都有」的通用屬性（依世界觀題材決定，例：HP、好感度、信任度）。
     ★ 每個角色都必須完整放這組，**欄位名、數量、順序完全一致**
  2.【角色特有】基礎屬性之後，可再依該角色人設加 1~3 個專屬屬性（例：復仇者加「復仇執念」、騎士加「忠誠度」）
- desc 裡**必須寫明「基礎屬性是哪幾個」**，跑團時新角色登場才知道要套同一組基礎
- 正確範例（注意前三個基礎屬性完全一致，第四個才是各自特有）：
  {
    "角色狀態": {
      "type": "object",
      "desc": "每個角色的即時狀態。基礎屬性（每人都有，順序一致）：HP(0-100)、好感度(0-100)、信任度(-50~100)。之後可依人設加專屬屬性。新角色登場時自動套這組基礎屬性",
      "init": {
        "瑟琳":   { "HP": 100, "好感度": 0, "信任度": 0, "復仇執念": 80 },
        "奧爾德": { "HP": 100, "好感度": 0, "信任度": 0, "忠誠度": 50 }
      }
    }
  }
- object 型的好處：劇情中臨時冒出的隨機 NPC，主模型可直接往這欄位裡加新角色（套基礎屬性組），不必預先定義
- 判斷準則：「這個屬性是綁在某個角色 / 某個實體身上的嗎？」→ 是，就放進 object 型容器
- 同理，多個地點、多個派系、多個任務…只要是「同類的一群」，都用 object 型歸納（一樣是基礎屬性統一 + 特有）

【init 型別規則】
- number 型 → 給數字，例 0 或 50（不要加引號）
- string / enum 型 → 給字串，例 "未開始" 或 "" 表空
- list 型 → 必須給陣列，例 [] 或 ["物品A", "物品B"]（**禁止給單獨的 "[" 或字串**）
- object 型 → 給巢狀物件 { "實體名": { "屬性": 值, ... } }，至少放開頭劇情已登場的角色 / 實體

【desc 必須明確邊界（防止 AI 後續無限累加）】
- **number 型 desc 必須註明範圍**，例：「好感度 (0-100)：...」、「HP (0-200 上限)：...」、「金錢餘額 (0-99999 上限)：...」
- **倒計時類**註明起始值與終止條件，例：「末日倒計時 (90 開始，可變負，-30 完全末日)」
- **絕對禁止**寫沒上限的 desc，例「好感度，互動上升」← 這種寫法會讓 AI 累加到 999999
- enum 型 desc 必須列出**完整可選值**，例：「狀態。可選值: 健康/受傷/重傷/死亡」

【rules 設計規則】
- 規則數 8-15 條（核心變數要分階段，條數要夠）
- **挑開頭劇情中 3-5 個最重要的角色**深做規則，次要 / 路人角色不必（之後使用者可在創作室自己補）
- **核心變數必須「分階段」**：同一角色的同一核心屬性（好感度 / 信任度 / HP / 理智值 / 倒計時…），
  設 3~4 條遞進閾值規則，每階段 content 不同、一階比一階深。
  例：瑟琳的好感度設 4 條 → value=20 / 50 / 80 / 95，content 從「稍有鬆動」遞進到「完全交付」
- path 用點記法綁**特定角色**（角色狀態.瑟琳.好感度），**每個角色各自的規則，絕不共用**
  —— 因為同樣是「好感度 80」，不同角色的人格決定完全不同的行為模式，共用規則會抹平個性
- ⚠️【content 是規則有沒有深度的關鍵】必須「讀該角色人設 → 寫出他特有的反應」：
  ❌ 敷衍（沒讀人設、通用空話）：「角色對主角變得親密」「語氣變溫柔」
  ✅ 有深度（貼復仇者瑟琳）：「瑟琳的親近帶著佔有與危險，主角受威脅時她會先一步露出殺意，私下用近乎偏執的方式守著，但仍不輕易吐露真心」
  ✅ 有深度（貼偶像葉亭）：「葉亭用舞台般明亮的笑容回應，主動製造肢體接觸卻拿捏分寸，把在意藏進玩笑話，獨處時才露出疲憊的真實一面」
  → 同一個好感度階段，瑟琳和葉亭的 content **必須完全不同**，各自死貼人格
- content 用 50~100 字，寫「具體會做什麼動作、語氣、肢體、心理」，**禁止空泛形容詞**
- 規則依世界觀題材取捨重點（戀愛 → 好感階段細分；末日 → 倒計時階段；推理 → 線索觸發）
- 不要用 markdown 符號、不要分項列點，純文字一段話

【整體規則】
- 欄位數 ${CONFIG.minFields}-${CONFIG.maxFields} 個（object 型容器算一個欄位，內含多角色不另計）
- **只追蹤會隨劇情變化的事**（好感度、HP、當前任務、時間、地點、心情、攜帶物品、進度條、倒計時等）
- **絕不追蹤永久不變的事**（世界觀設定、種族、固定外觀、背景設定）
- 名稱用中文簡潔，例：「角色狀態」、「當前地點」、「末日倒計時」
- list 型用於物品/線索清單
- **多角色屬性一律用 object 型容器**（見上方規則），不要散成一堆「XX的YY」扁平變數
- 重視這個世界**特有**的元素（例：末日題材就要倒計時；推理題材就要線索清單；戀愛題材就要好感分數）

═══════════════════════════════════════
【⚠️ 輸出 JSON 前 · 強制自我檢查（必做，做完才能送出）】
逐一掃過 fields 的每一個 key：
1. 這個 key 裡有沒有出現任何「具體角色名」？（瑟琳 / 奧爾德 / 卡蜜拉 / 小花 …）
   → 有 → 立刻刪掉這個欄位，把它的屬性併進一個 object 型容器（如「角色狀態」）的 init 裡
2. 檢查完後，全世界角色的屬性應該只集中在 1~2 個 object 容器欄位裡，
   不應該存在任何「角色名＋屬性」形式的扁平 key
3. 同理檢查地點、派系、任務 —— 同類的一群都該收進 object 容器
確認完全沒有「帶具體名字的扁平變數」，才能輸出。
═══════════════════════════════════════`;
    }

    // --- 主模型呼叫（schema 是一次性設計工作，用主模型品質較好）---
    function callPrimary(prompt) {
        return new Promise((resolve, reject) => {
            if (!win.OS_API?.chat) return reject(new Error('OS_API.chat 不可用'));
            const config = win.OS_SETTINGS?.getConfig?.();
            if (!config) return reject(new Error('讀不到主模型 config（OS_SETTINGS）'));
            const messages = [
                { role: 'system', content: 'You are a strict JSON schema designer. Output only valid JSON, no markdown, no comments.' },
                { role: 'user', content: prompt }
            ];
            let done = false;
            const timer = setTimeout(() => {
                if (done) return; done = true;
                reject(new Error('主模型超時'));
            }, CONFIG.timeoutMs);
            win.OS_API.chat(messages, config, null, (text) => {
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
                const raw = await callPrimary(prompt);
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
        throw lastErr || new Error('主模型重試耗盡');
    }

    // --- 對外 API ---
    async function generate(opts = {}) {
        const chatId = getChatId();
        if (!chatId) { showToast('⚠️ 沒有 chatId，無法生成 schema', 'warning'); return null; }

        showToast('🧬 主模型正在分析世界 → 生成 schema...', 'info');
        try {
            const [worldbook, userPersona, charCard, headMessages] = await Promise.all([
                gatherWorldbookText(),
                gatherUserPersona(),
                gatherCharCard(),
                gatherHeadMessages()
            ]);
            const prompt = buildPrompt({ worldbook, userPersona, charCard, headMessages });
            const json = await runWithRetry(prompt);

            // V2 之後：generate 不再寫 state_data.schema（schema 已搬到 AVS 變數包）
            // 純生成並回傳；呼叫端（os_avs.js）負責寫 var_pack + rules
            // V3：同時返回 fields 跟 rules（AI 生成階段同步出條件規則，跟變數包綁定）
            const count = Object.keys(json.fields).length;
            const ruleCount = Array.isArray(json.rules) ? json.rules.length : 0;
            showToast(`✅ Schema 生成完成（${count} 個欄位 / ${ruleCount} 條規則）`, 'success');
            try { win.eventEmit?.('AURELIA_STATE_SCHEMA_GENERATED', { chatId, fields: json.fields, rules: json.rules }); } catch(e) {}

            return { fields: json.fields, rules: Array.isArray(json.rules) ? json.rules : [] };
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

    // === 用戶手動編輯 schema（增 / 改 / 刪欄位）===
    async function addField(name, def) {
        const chatId = getChatId();
        if (!chatId || !win.OS_DB?.getStateData) return false;
        if (!name || !name.trim()) { showToast('⚠️ 欄位名不能空', 'warning'); return false; }
        const data = (await win.OS_DB.getStateData(chatId)) || {};
        const schema = { ...(data.schema || {}) };
        if (schema[name]) { showToast(`⚠️ 欄位「${name}」已存在`, 'warning'); return false; }
        schema[name] = {
            type: (def && def.type) || 'string',
            desc: (def && def.desc) || '',
            init: (def && def.init) || ''
        };
        await win.OS_DB.saveStateData(chatId, {
            schema,
            patches: data.patches || {},
            current: data.current || {}
        });
        try { win.eventEmit?.('AURELIA_STATE_SCHEMA_GENERATED', { chatId, fields: schema }); } catch(e) {}
        showToast(`✅ 新增欄位「${name}」`, 'success');
        return true;
    }

    async function updateField(name, def) {
        const chatId = getChatId();
        if (!chatId || !win.OS_DB?.getStateData) return false;
        const data = (await win.OS_DB.getStateData(chatId)) || {};
        const schema = { ...(data.schema || {}) };
        if (!schema[name]) return false;
        schema[name] = {
            ...schema[name],
            type: (def && def.type) || schema[name].type,
            desc: def && def.desc !== undefined ? def.desc : schema[name].desc
        };
        await win.OS_DB.saveStateData(chatId, {
            schema,
            patches: data.patches || {},
            current: data.current || {}
        });
        try { win.eventEmit?.('AURELIA_STATE_SCHEMA_GENERATED', { chatId, fields: schema }); } catch(e) {}
        showToast(`✏️ 已更新「${name}」`, 'success');
        return true;
    }

    async function deleteField(name) {
        const chatId = getChatId();
        if (!chatId || !win.OS_DB?.getStateData) return false;
        const data = (await win.OS_DB.getStateData(chatId)) || {};
        const schema = { ...(data.schema || {}) };
        if (!schema[name]) return false;
        delete schema[name];
        // 從 current 砍
        const current = { ...(data.current || {}) };
        delete current[name];
        // 從每筆 patch 砍掉這欄位
        const patches = {};
        for (const [pid, p] of Object.entries(data.patches || {})) {
            const np = { ...p };
            delete np[name];
            if (Object.keys(np).length > 0) patches[pid] = np;
        }
        await win.OS_DB.saveStateData(chatId, { schema, patches, current });
        try { win.eventEmit?.('AURELIA_STATE_SCHEMA_GENERATED', { chatId, fields: schema }); } catch(e) {}
        showToast(`🗑 已刪除欄位「${name}」`, 'info');
        return true;
    }

    win.OS_STATE_SCHEMA = {
        generate,
        getCurrentSchema,
        addField,
        updateField,
        deleteField,
        CONFIG
    };

    console.log('🧬 [State Schema] Ready');
})();
