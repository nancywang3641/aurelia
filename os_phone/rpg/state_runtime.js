// ----------------------------------------------------------------
// [檔案] state_runtime.js (V1 - Stage 2：副模型抽 + patch + injectPrompts)
// 路徑：os_phone/rpg/state_runtime.js
// 職責：
// 1. 監聽 GENERATION_ENDED → 副模型按 schema 抽劇情狀態變化 → 寫 patches[msgId] → 重算 current
// 2. 監聽 GENERATION_STARTED → injectPrompts 把 current state 注入下一輪主模型 system prompt
// 3. 監聽 MESSAGE_DELETED / SWIPED / UPDATED / EDITED → 砍對應 patch → 重算 current
// 4. 對外：setEnabled / forceExtract / clearPatches
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
        rulesInjectId: 'aurelia_avs_rules',
        storageKey: 'aurelia_state_runtime_enabled'
    };

    let _debounceTimer = null;
    let _running = false;           // 防止並發抽取
    let _lastInjectUninject = null; // 上次 state inject 的 uninject 函式
    let _lastRulesUninject = null;  // 上次 rules inject 的 uninject 函式

    // --- 工具 ---
    // 把 ctx.chatId 或 chat_file_name 清乾淨：剝路徑、砍 .jsonl/.json
    // 統一格式才能跟 CHAT_DELETED 事件 payload 對齊
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
    // 把點記法 key（角色.卡蜜拉.HP）展開寫進巢狀物件，與 AVS 引擎的 <vars> 點記法結構一致
    function _setDeep(obj, path, val) {
        const keys = path.split('.');
        let cur = obj;
        for (let i = 0; i < keys.length - 1; i++) {
            const k = keys[i];
            if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
            cur = cur[k];
        }
        cur[keys[keys.length - 1]] = val;
    }

    // 深合併 src 進 dst：巢狀物件遞迴合併、純值取 src。給 object 型欄位 patch 用，
    // 避免「AI 一次輸出整個物件就把整碗覆蓋掉、舊角色全消失」(時而一人時而三人的根因)。
    function _deepMergeObj(dst, src) {
        if (!src || typeof src !== 'object' || Array.isArray(src)) return src;
        if (!dst || typeof dst !== 'object' || Array.isArray(dst)) dst = {};
        for (const k of Object.keys(src)) {
            const sv = src[k];
            dst[k] = (sv && typeof sv === 'object' && !Array.isArray(sv)) ? _deepMergeObj(dst[k], sv) : sv;
        }
        return dst;
    }

    // 把單筆 patch（key→value）套進 cur：點記法→巢狀；物件→深合併；純值→取新
    function _applyPatchInto(cur, p) {
        if (!p || typeof p !== 'object') return;
        for (const [k, v] of Object.entries(p)) {
            if (k.includes('.')) _setDeep(cur, k, v);                          // 點記法 → 巢狀（動態實體用，如 角色.路人甲.HP）
            else if (v && typeof v === 'object' && !Array.isArray(v)) cur[k] = _deepMergeObj(cur[k], v);  // 物件欄位 → 深合併(別整碗覆蓋)
            else cur[k] = v;                                                   // 數字/字串/陣列 → 取新值
        }
    }

    // 從 base 快照起算，依 msgId 順序重播 patches → current。
    // base 是「被 trim 掉的舊 patch 收斂成的底」，確保穩定屬性(形象/身分等)不會因 patch 被砍而消失。
    function recomputeCurrent(patches, base) {
        const ids = Object.keys(patches).map(Number).filter(n => !isNaN(n)).sort((a,b) => a-b);
        const cur = base ? JSON.parse(JSON.stringify(base)) : {};
        for (const id of ids) _applyPatchInto(cur, patches[id]);
        return cur;
    }

    // patches 超過上限時：把最舊的幾筆「疊進 base 快照」再刪除（資料不流失、只是收斂成底）。
    // 回傳 { patches, base }。
    function trimPatches(patches, base) {
        const ids = Object.keys(patches).map(Number).filter(n => !isNaN(n)).sort((a,b) => a-b);
        const newBase = base ? JSON.parse(JSON.stringify(base)) : {};
        if (ids.length <= CONFIG.maxPatches) return { patches, base: newBase };
        const cut = ids.slice(0, ids.length - CONFIG.maxPatches);
        const out = { ...patches };
        cut.forEach(id => { _applyPatchInto(newBase, patches[id]); delete out[id]; });
        return { patches: out, base: newBase };
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
    let _lastRawText = '';      // 最近一次副模型原始輸出(診斷複製用，含解析失敗的也存)
    let _lastExtract = null;    // 最近一次抽取結果(給資訊中心狀態面板顯示/複製)

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
                _lastRawText = raw;   // 存原始輸出(成功/失敗都存，給診斷看格式有沒有亂)
                const json = extractJSON(raw);
                // 結合觸發後：updates(狀態) 或 memories(記憶) 任一存在即算成功
                if (json && (typeof json.updates === 'object' || Array.isArray(json.memories))) return json;
                lastErr = new Error(`第 ${i+1} 次：JSON 不含 updates/memories`);
                console.warn('[State Runtime]', lastErr.message, 'raw head:', String(raw).slice(0, 300));
            } catch(e) {
                lastErr = e;
                console.warn('[State Runtime] 第', i+1, '次失敗:', e?.message || e);
            }
        }
        throw lastErr || new Error('副模型重試耗盡');
    }

    // --- prompt：給 schema + current + 最近劇情 → 抽 diff（或初始 fill）---
    function buildExtractPrompt(schema, current, recentText, isInitialFill) {
        const modeRules = isInitialFill
            ? `【初始化模式 / FIRST RUN】
- 這是首次抽取，當下狀態為空
- 必須把 schema 中**所有欄位**的當下值都填進 updates，不能漏
- 從劇情推斷；劇情沒明說的欄位，依世界觀給合理初值（好感類給 0 / 能力類給基準值 / 倒計時看 schema.desc 的初值）
- 寧可用 schema.desc 裡的範圍初值，也不要留空`
            : `【更新模式 / DIFF】
- 只輸出**這輪有變化**的欄位；沒變的不要寫進 updates
- 補齊例外：若【當下狀態】裡某個已登場實體，缺少 schema 基礎屬性組裡的穩定欄位，這輪順手把缺的那幾個補上（從劇情或世界觀推合理值）；穩定屬性補一次即可、之後不必再動
- 如果這輪劇情完全沒觸發任何欄位變化，輸出 { "updates": {} }`;

        return `你是劇情狀態追蹤抽取器。根據 schema 與最近的劇情，找出狀態欄位的變化。

【schema 定義 / 每個欄位的 desc 就是 AI 必須嚴守的約束】
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

${modeRules}

【通用規則】
- 數字欄位：直接給新數值（例：當下好感 12 + 升 3 → 15）
- 字串/enum 欄位：給新字串
- list 欄位：給完整陣列（追加項就 push 後完整輸出）
- 不要編造劇情沒寫的事（但初始化模式可以從 schema.desc 推合理初值）
- **嚴守每個欄位的 desc 約束**：例如 desc 寫「0-100」就不准超出範圍、寫「枚舉值：A/B/C」就不准給其他值

【物件型欄位 / 動態實體（重要）】
- 若某欄位 type 是 "object"，代表它用來裝「多個實體各自的屬性」（例如每個角色的 HP/SAN）
- 這時 updates 的 key 要用點記法：「欄位名.實體名.屬性」，值放在最末層
  例：schema 有 object 欄位「角色」→ 輸出 { "角色.卡蜜拉.HP": 70, "角色.路人甲.SAN": 50 }
- **對劇情中所有出場角色都要抽**，包含臨時 / 隨機 NPC（路人、店主、士兵…），不限主要角色
- 該欄位的 desc 會說明「基礎屬性組」有哪些、數值範圍，嚴格照辦
- **新角色首次登場時**：按 desc 的「基礎屬性組」幫他補齊每一個基礎屬性的初值（例 desc 寫基礎屬性是 HP/好感度/信任度 → 新角色這三個都要給初值），之後才依劇情加特有屬性`;
    }

    // --- 從 AVS 變數包合併出 schema（融合：schema 來源從 OS_DB.state_data.schema → AVS 變數包）---
    async function getActiveSchema() {
        if (!win.OS_DB?.getAllVarPacks) return null;
        const allPacks = await win.OS_DB.getAllVarPacks();
        if (!allPacks.length) return null;
        // 只用「沒綁 chatId（全域 pack）」或「綁定當前 chatId」的 pack
        // 避免跨 chat / 跨角色卡的 pack 互相污染（每個 chat 角色不同、變數不同）
        const chatId = getChatId();
        const packs = allPacks.filter(p => !p.chatId || p.chatId === chatId);
        const schema = {};
        for (const pack of packs) {
            if (!Array.isArray(pack.variables)) continue;
            for (const v of pack.variables) {
                if (!v.name) continue;
                const entry = {
                    type: v.type || 'string',
                    desc: v.desc || '',
                    init: v.defaultValue
                };
                // 物件型：把縮排結構文字 parse 成巢狀範本，讓副模型看得到有哪些子欄位
                if (v.type === 'object' && win._AVS_ENGINE?.parseTree) {
                    try {
                        const tree = win._AVS_ENGINE.parseTree(v.defaultValue);
                        const keys = Object.keys(tree);
                        entry.structure = (keys.length === 1 && keys[0] === v.name) ? tree[v.name] : tree;
                        delete entry.init; // structure 已完整表達，init 原始字串多餘
                    } catch(e) {}
                }
                schema[v.name] = entry;
            }
        }
        return Object.keys(schema).length ? schema : null;
    }

    // --- 記憶抽取規則（結合觸發共用向量引擎的規則，沒有就退而求其次給簡述）---
    function _memoryRulesText() {
        return (win.OS_VECTOR_ENGINE?.EXTRACTION_PROMPT)
            || '從劇情抽出值得長期記住的條目：關鍵事件、角色狀態變化、重要物品、世界規則、人物關係、以及每個重要角色最能代表性格的原句台詞與口癖(防 OOC)。跳過純過場與不帶資訊的閒聊。';
    }
    // 附加在「狀態 prompt」後面：要求同一個 JSON 多吐一個 memories 欄位（共用同一通副模型）
    function _memoryAddendum() {
        return `

═══════════════════════════════════════
【★ 同時抽取「長期記憶」→ 放進同一個 JSON 的 "memories" 欄位】
除了上面的 "updates"，請在**同一個 JSON** 裡再加一個 "memories" 陣列，每筆 { "type", "text", "tags" }；沒有值得記的就給 []。
抽取規則：
${_memoryRulesText()}

最終輸出格式：{ "updates": { ... }, "memories": [ { "type":"...", "text":"...", "tags":[...] } ] }`;
    }
    // 只有記憶要抽時的獨立 prompt（沒變數包 / 這則狀態已抽過）
    function _memoryOnlyPrompt(text) {
        return `你是長期記憶抽取器。從下面的劇情抽出值得長期記住的記憶條目。

【劇情】
${text || '（無）'}

抽取規則：
${_memoryRulesText()}

請輸出嚴格 JSON（不包 markdown）：{ "memories": [ { "type":"...", "text":"...", "tags":[...] } ] }`;
    }

    // --- 主流程：抽一次（結合觸發：狀態 + 記憶共用同一通副模型）---
    async function extractOnce() {
        if (_running) return;
        _running = true;
        let pendingMem = null, memIngested = false;
        try {
            const chatId = getChatId();
            if (!chatId || !win.OS_DB?.getStateData) return;

            const schema = await getActiveSchema();
            const hasState = !!(schema && Object.keys(schema).length);

            // 結合觸發：取走 vector_inject 掛的待處理記憶（狀態系統開著時它會交棒過來）
            pendingMem = (win.OS_VECTOR_INJECT?.consumePendingMemory?.()) || null;
            const wantMemory = !!(pendingMem && win.OS_VECTOR_ENGINE?.isEnabled?.() === true && typeof win.OS_VECTOR_ENGINE?.ingestEntries === 'function');

            if (!hasState && !wantMemory) return;   // 兩邊都沒事做

            const currentState = win._AVS_ENGINE?.read?.() || {};
            const { text: recentText, lastId } = await gatherRecentMessages();

            const data = (await win.OS_DB.getStateData(chatId)) || {};
            const stateAlreadyDone = hasState && data.patches && lastId >= 0 && data.patches[lastId] !== undefined;
            const doState = hasState && !stateAlreadyDone && !!recentText && lastId >= 0;

            if (!doState && !wantMemory) return;

            // 組 prompt：狀態部分用原本 buildExtractPrompt(不動，保品質)；要記憶就附加 memories 區段共用同一通
            let prompt;
            if (doState) {
                const isInitialFill = !currentState || Object.keys(currentState).length === 0;
                prompt = buildExtractPrompt(schema, currentState, recentText, isInitialFill);
                if (wantMemory) prompt += _memoryAddendum();
            } else {
                prompt = _memoryOnlyPrompt(recentText || pendingMem.content || '');
            }

            const json = await runWithRetry(prompt);
            // 存本輪抽取(原始輸出+memories)，狀態部分等下面算完 filtered/current 再補上 → 給狀態面板診斷/複製
            _lastExtract = { at: Date.now(), msgId: lastId, raw: _lastRawText, updates: null, memories: Array.isArray(json.memories) ? json.memories : null, current: null };

            // --- 狀態 patch（邏輯與原本一致）---
            if (doState && json.updates && typeof json.updates === 'object') {
                const updates = json.updates;
                const filtered = {};
                for (const k of Object.keys(updates)) {
                    const root = k.split('.')[0];
                    if (schema[k] !== undefined || schema[root] !== undefined) filtered[k] = updates[k];
                }
                const trimmed = trimPatches({ ...(data.patches || {}), [lastId]: filtered }, data.base);
                const newCurrent = recomputeCurrent(trimmed.patches, trimmed.base);
                if (_lastExtract) { _lastExtract.updates = filtered; _lastExtract.current = newCurrent; }   // 補上狀態給診斷面板
                try { win._AVS_ENGINE?.write?.(newCurrent); } catch(e) { console.warn('[State Runtime] AVS engine.write 失敗:', e); }
                await win.OS_DB.saveStateData(chatId, { ...data, patches: trimmed.patches, base: trimmed.base, current: newCurrent });
                const changed = Object.keys(filtered).length;
                if (changed > 0) console.log(`🛰️ [State Runtime] 抽取完成 msg#${lastId}：${changed} 欄位變化`, filtered);
                try { win.eventEmit?.('AURELIA_STATE_PATCHED', { chatId, msgId: lastId, updates: filtered }); } catch(e) {}
            }

            // --- 記憶入庫（結合觸發）---
            if (wantMemory) {
                if (Array.isArray(json.memories)) {
                    try {
                        await win.OS_VECTOR_ENGINE.ingestEntries(json.memories, pendingMem.storyId, pendingMem.chapterId);
                        memIngested = true;
                        console.log(`🧠 [State Runtime] 結合抽取：記憶 ${json.memories.length} 條入庫`);
                    } catch(e) { console.warn('[State Runtime] 記憶入庫失敗:', e?.message || e); }
                }
                // 副模型沒吐 memories → 降級：讓向量引擎自己抽一通，不漏記憶
                if (!memIngested) { try { win.OS_VECTOR_ENGINE.ingest(pendingMem.content, pendingMem.storyId, pendingMem.chapterId); memIngested = true; } catch(e) {} }
            }
        } catch(e) {
            console.warn('[State Runtime] 抽取失敗:', e?.message || e);
            // 整通失敗也別漏記憶：有 pending 就讓引擎自己補抽一通
            if (pendingMem && !memIngested && win.OS_VECTOR_ENGINE?.isEnabled?.()) {
                try { win.OS_VECTOR_ENGINE.ingest(pendingMem.content, pendingMem.storyId, pendingMem.chapterId); } catch(_) {}
            }
        } finally {
            _running = false;
        }
    }

    // --- inject AVS rules：把當前生效規則的 <behavior_rules> 塞主模型 system prompt ---
    // 跟 injectCurrent 並列；用獨立 inject id 互不影響
    async function injectRules() {
        try {
            try { _lastRulesUninject?.(); } catch(e) {}
            _lastRulesUninject = null;

            if (!win.TavernHelper?.injectPrompts) return;
            if (!win.OS_AVS_RULES?.getActiveContext) return;

            // 變數狀態：優先用 adapter cache（已 refresh 過 OS_DB）
            const state = win.OS_AVS_ADAPTER?.readState?.() || {};
            if (!state || !Object.keys(state).length) return;

            // V3：拿當前 chat 對應的 active pack IDs，傳給 getActiveContext 做 packId filter
            let activePackIds = null;
            try {
                if (win.OS_DB?.getAllVarPacks) {
                    const chatId = getChatId();
                    const allPacks = await win.OS_DB.getAllVarPacks();
                    activePackIds = (allPacks || [])
                        .filter(p => !p.chatId || p.chatId === chatId)
                        .map(p => p.id);
                }
            } catch(e) { /* fallback：activePackIds 留 null，走 worldId filter */ }

            const ctx = win.OS_AVS_RULES.getActiveContext(state, activePackIds) || '';
            if (!ctx.trim()) return;   // 沒命中任何規則就不 inject

            const result = win.TavernHelper.injectPrompts([{
                id: CONFIG.rulesInjectId,
                content: ctx,
                position: 'in_chat',
                depth: 1,
                role: 'system'
            }], { once: true });
            _lastRulesUninject = result?.uninject || null;
        } catch(e) {
            console.warn('[State Runtime] rules inject 失敗:', e?.message || e);
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
                ...data,
                patches: newPatches,
                current: recomputeCurrent(newPatches, data.base)
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
            ...data,
            patches: {},
            base: {},
            current: {}
        });
        showToast('🧹 已清空 patches，副模型即將重新初始化', 'info');
        // 自動跑一次 extract（current 已清空 → 進初始化模式 → 重新填齊全部欄位）
        setTimeout(() => extractOnce(), 500);
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

        // 主模型開始生成 → inject current 給它看（state 摘要）+ inject AVS rules（行為規範）
        if (win.tavern_events.GENERATION_STARTED) {
            win.eventOn(win.tavern_events.GENERATION_STARTED, () => {
                // state 摘要受「即時抽取總開關」控制
                if (isEnabled()) injectCurrent();
                // AVS rules 永遠評估（不受抽取開關影響；沒命中規則就不 inject）
                injectRules();
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
                try { _lastRulesUninject?.(); _lastRulesUninject = null; } catch(e) {}
            });
        }

        // chat 被酒館刪 → 自動清對應 state_data（避免孤兒資料）
        if (win.tavern_events.CHAT_DELETED) {
            win.eventOn(win.tavern_events.CHAT_DELETED, async (chatFileName) => {
                try {
                    const id = normalizeChatId(chatFileName);
                    if (!id || !win.OS_DB?.getStateData) return;
                    const data = await win.OS_DB.getStateData(id);
                    if (!data) return;
                    await win.OS_DB.deleteStateData(id);
                    console.log(`🛰️ [State Runtime] chat 被刪 → 自動清 state_data: ${id}`);
                    try { win.eventEmit?.('AURELIA_STATE_DATA_REMOVED', { chatId: id }); } catch(e) {}
                } catch(e) {
                    console.warn('[State Runtime] CHAT_DELETED 清理失敗:', e);
                }
            });
        }

        console.log('🛰️ [State Runtime] Ready');
    }

    // === 跨世界資料管理 ===
    async function listAllStateData() {
        if (!win.OS_DB?.getAllStateData) return [];
        const all = await win.OS_DB.getAllStateData();
        return all.map(e => ({
            chatId: e.id,
            schemaCount: e.schema ? Object.keys(e.schema).length : 0,
            patchesCount: e.patches ? Object.keys(e.patches).length : 0,
            currentCount: e.current ? Object.keys(e.current).length : 0,
            timestamp: e.timestamp || 0
        })).sort((a, b) => b.timestamp - a.timestamp);
    }

    async function removeStateData(chatId) {
        if (!chatId || !win.OS_DB?.deleteStateData) return false;
        await win.OS_DB.deleteStateData(chatId);
        try { win.eventEmit?.('AURELIA_STATE_DATA_REMOVED', { chatId }); } catch(e) {}
        return true;
    }

    // === Migration：舊資料 key 含路徑 / .jsonl 的，搬成 cleaned key ===
    const MIGRATION_FLAG = 'aurelia_state_migrated_v1';
    async function runMigration() {
        if (localStorage.getItem(MIGRATION_FLAG) === '1') return;
        if (!win.OS_DB?.getAllStateData) return;
        try {
            const all = await win.OS_DB.getAllStateData();
            let migrated = 0, skipped = 0;
            for (const entry of all) {
                const oldId = entry.id;
                const newId = normalizeChatId(oldId);
                if (!newId || oldId === newId) continue;
                // 衝突：新 key 已存在 → 砍舊 key（保留新的）
                const exists = await win.OS_DB.getStateData(newId);
                if (exists) {
                    await win.OS_DB.deleteStateData(oldId);
                    skipped++;
                } else {
                    await win.OS_DB.saveStateData(newId, {
                        schema: entry.schema,
                        patches: entry.patches,
                        current: entry.current
                    });
                    await win.OS_DB.deleteStateData(oldId);
                    migrated++;
                }
            }
            localStorage.setItem(MIGRATION_FLAG, '1');
            if (migrated || skipped) console.log(`🛰️ [State Runtime] migration：搬 ${migrated} 筆 / 衝突砍 ${skipped} 筆`);
        } catch(e) {
            console.warn('[State Runtime] migration 失敗:', e);
        }
    }

    win.OS_STATE_RUNTIME = {
        isEnabled, setEnabled,
        forceExtract, clearPatches,
        injectCurrent, injectRules, extractOnce,
        listAllStateData, removeStateData,
        normalizeChatId,
        getActiveSchema,   // V2：schema 從 AVS 變數包合併（給 status_panel 等外部 UI 用）
        getLastExtract: () => _lastExtract,   // 最近一次抽取(原始輸出+updates+current) 給狀態面板診斷/複製
        CONFIG
    };

    // 啟動時跑 migration（fire-and-forget）
    runMigration();

    init();
})();
