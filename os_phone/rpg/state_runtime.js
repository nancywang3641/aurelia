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
        avatarInjectId: 'aurelia_avatar_reminder',
        storageKey: 'aurelia_state_runtime_enabled'
    };

    let _debounceTimer = null;
    let _repairDebounce = null;     // 開頭設置(Bg/BGM)補救的 debounce
    let _selfEditing = false;       // 開頭補救正在改寫訊息 → 擋 onMessageInvalidated 誤砍本則剛存的 patch
    let _running = false;           // 防止並發抽取
    let _genStopped = false;        // 本通生成是否被「手動停止」(GENERATION_STOPPED)→ 全副模型跳過，別拿半截正文白燒
    let _lastInjectUninject = null; // 上次 state inject 的 uninject 函式
    let _lastRulesUninject = null;  // 上次 rules inject 的 uninject 函式
    let _lastAvatarUninject = null; // 上次「缺頭像提醒」inject 的 uninject 函式

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
            // 最後一則完整原文（不切片）→ 給場景插圖切段編號用（程式自己對位，不靠 AI 逐字抄）
            const lastContent = String(last[0].message || last[0].mes || '').slice(0, 4000);
            const start = Math.max(0, lastId - CONFIG.recentMsgs + 1);
            const msgs = await win.TavernHelper.getChatMessages(`${start}-${lastId}`);
            if (!msgs || !msgs.length) return { text: '', lastId, lastContent };
            const text = msgs.map(m => {
                const role = m.is_user ? 'USER' : (m.name || 'AI');
                const t = (m.message || m.mes || '').slice(0, 1500);
                return `[${role}] ${t}`;
            }).join('\n\n');
            return { text, lastId, lastContent };
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
                { role: 'system', content: '你是嚴謹的劇情狀態抽取器：先做簡短分析推理（出場角色/本輪變化/新角色/主角/校對），最後把抽取結果放進一個 ```json 程式碼區塊。' },
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

    // ── 🗜️ 記憶合併壓縮（治長線過載）：把舊的零碎記憶交副模型併成密度更高的少數摘要 ──
    //    軟壓縮：新增 condensed 條目、原始標 merged:true 隱藏（不真刪、可還原）。
    //    npc/relationship/dialogue 不碰（人/防 OOC）、最近窗保留原樣。
    function _compressCall(prompt) {
        return new Promise((resolve, reject) => {
            if (!win.OS_API?.chatSecondary) return reject(new Error('副模型不可用'));
            const messages = [
                { role: 'system', content: '你是記憶歸檔員：把多條零碎的舊劇情記憶合併壓縮成數量更少、資訊密度更高的摘要，保留所有關鍵事實與因果，最後把結果放進一個 ```json 程式碼區塊。' },
                { role: 'user', content: prompt }
            ];
            let done = false;
            const timer = setTimeout(() => { if (done) return; done = true; reject(new Error('副模型超時')); }, CONFIG.timeoutMs);
            win.OS_API.chatSecondary(messages, null,
                (text) => { if (done) return; done = true; clearTimeout(timer); resolve(text); },
                (err) => { if (done) return; done = true; clearTimeout(timer); reject(err); });
        });
    }
    async function _compressRun(prompt) {
        let lastErr;
        for (let i = 0; i < CONFIG.retryCount; i++) {
            try {
                const raw = await _compressCall(prompt);
                const json = extractJSON(raw);
                if (json && Array.isArray(json.memories)) return json;
                lastErr = new Error('輸出不含 memories 陣列');
            } catch (e) { lastErr = e; console.warn('[記憶壓縮] 第', i + 1, '次失敗:', e?.message || e); }
        }
        throw lastErr || new Error('壓縮重試耗盡');
    }
    function _compressPrompt(chunk) {
        const list = chunk.map((m, i) => `${i + 1}. [${m.type}] ${String(m.summary || '').trim()}${m.text ? ' — ' + String(m.text).trim() : ''}`).join('\n');
        return `下面是同一個故事【較早期】的零碎劇情記憶，依時間排序。請把它們合併壓縮成數量更少、但資訊密度更高的摘要，方便長期保存。

【合併原則】
- 把同一條劇情線 / 同一地點 / 同一任務的多條，併成一條涵蓋整段的摘要。
- 保留所有關鍵事實：角色名、因果關係、重大轉折、得到或失去的東西、尚未了結的伏筆。可捨棄重複、純過場、對後續無影響的瑣事。
- 數量目標：壓到原本的三分之一上下；寧可資訊完整，也別併到失真。
- 不要加入原文沒有的推測。

【輸出格式】嚴格 JSON、放進一個 \`\`\`json 區塊：
{ "memories": [ { "type": "event", "summary": "一句話索引、20字內", "text": "1～3句完整細節", "tags": ["關鍵詞"] } ] }

【待合併記憶】
${list}`;
    }
    // storyId 由呼叫端(os_avs_memory 面板)傳入；回 { mergedCount, madeCount, after, before }
    async function compressOldMemories(opts) {
        opts = opts || {};
        const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : function () {};
        if (win.__AURELIA_SUMMARIZING) throw new Error('正在大總結，請稍後再試');
        if (!win.OS_DB?.getAllVnMemories || !win.OS_DB?.saveVnMemory) throw new Error('記憶資料庫不可用');
        if (!win.OS_API?.chatSecondary) throw new Error('副模型未設定（去記憶服務設定）');
        const storyId = opts.storyId;
        if (!storyId) throw new Error('找不到當前世界');

        const COMPRESS_TYPES = { event: 1, item: 1, location: 1, rule: 1 };   // npc/relationship/dialogue 不碰
        const KEEP_RECENT = 40;   // 這些類型最近 N 條保留原始細節、不壓
        const CHUNK = 35;

        const all = (await win.OS_DB.getAllVnMemories(storyId)) || [];
        const live = all.filter(m => m && !m.merged);
        const compressible = live
            .filter(m => COMPRESS_TYPES[m.type] && !m.condensed)              // 已壓過的不再壓，避免反覆壓到失真
            .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        if (compressible.length <= KEEP_RECENT) throw new Error('舊記憶還不夠多、暫時不需要整理');
        const targets = compressible.slice(0, compressible.length - KEEP_RECENT);

        let mergedCount = 0, madeCount = 0;
        for (let i = 0; i < targets.length; i += CHUNK) {
            const chunk = targets.slice(i, i + CHUNK);
            onProgress(`整理中… ${Math.min(i + chunk.length, targets.length)}/${targets.length}`);
            let json;
            try { json = await _compressRun(_compressPrompt(chunk)); }
            catch (e) { console.warn('[記憶壓縮] 這批失敗、保留原始跳過:', e?.message || e); continue; }
            const out = (json.memories || []).filter(x => x && (x.summary || x.text));
            // 安全閥：必須真的變少、且非空，否則不動原始（不讓壞輸出毀資料）
            if (!out.length || out.length >= chunk.length) { console.warn('[記憶壓縮] 這批沒變少、跳過'); continue; }
            const baseTs = chunk[0].createdAt || Date.now();
            // 先存新條目，存成至少一條才標原始 merged（中途崩最壞只是重複、不是資料遺失）
            let saved = 0;
            for (let k = 0; k < out.length; k++) {
                const e = out[k];
                try {
                    await win.OS_DB.saveVnMemory({
                        storyId,
                        type: e.type || 'event',
                        summary: String(e.summary || '').trim().slice(0, 60),
                        text: String(e.text || e.summary || '').trim(),
                        tags: Array.isArray(e.tags) ? e.tags.filter(Boolean).slice(0, 4) : [],
                        createdAt: baseTs + k,   // 排回原本時段
                        condensed: true
                    });
                    saved++; madeCount++;
                } catch (err) { console.warn('[記憶壓縮] 存新條目失敗:', err?.message || err); }
            }
            if (saved === 0) continue;   // 新的一條都沒存成 → 別動原始
            for (const m of chunk) {
                m.merged = true; m.mergedAt = Date.now();
                try { await win.OS_DB.saveVnMemory(m); mergedCount++; } catch (err) {}
            }
        }
        onProgress('完成');
        return { mergedCount, madeCount, after: live.length - mergedCount + madeCount, before: live.length };
    }

    // ── 🔁 AVS 角色去重：同一容器裡「繁體一個/簡體一個」或別名重複的同一角色 → 副模型確認後程式合併刪除 ──
    //    觸發：程式先掃「疑似繁簡變體」候選(同長度、差異字全是漢字)；有候選才花一次副模型呼叫，沒候選＝0 成本。
    //    防誤併：副模型只「確認」程式給的候選、被明確指示「不同角色絕不合併、不確定各自獨立」。
    //    防燒錢：同一組名單若副模型判「沒得併」(如王五/李四同長度)→ 記進 _dedupeSeen 不再問；名單變了才重評。
    const _dedupeSeen = new Map();   // contKey → 上次評估過、判「沒得併」的名字簽章
    const _CJK = /[㐀-鿿]/;
    function _normName(s) {
        return String(s == null ? '' : s).replace(/[（(][^（()]*[)）]/g, '').replace(/[「」『』“”"'·・,，。、\s\-_]/g, '').trim();
    }
    // 疑似同一角色的兩個寫法：正規化後相等(只差標點/空白)，或同長度且差異字全是漢字(繁簡特徵)
    function _looksLikeVariant(a, b) {
        const na = _normName(a), nb = _normName(b);
        if (!na || !nb) return false;
        if (na === nb) return true;                 // 只差標點/括號/空白 → 幾乎一定同角色
        if (na.length !== nb.length) return false;  // 不同長度的別名不在這抓(避免噪音)，交副模型在整組裡順手判
        for (let i = 0; i < na.length; i++) {
            if (na[i] === nb[i]) continue;
            if (!_CJK.test(na[i]) || !_CJK.test(nb[i])) return false;   // 差異含非漢字 → 不算繁簡變體
        }
        return true;   // 同長度、差異全漢字 = 繁簡候選(由副模型最終確認)
    }
    // 角色名去重「搭便車」：掃 currentState 找繁簡/別名候選容器 → 回 { block, pending }（沒候選回 null）。
    //   block 附進主副模型 prompt，要它在「同一個 json」多吐 "dupes"；★不再另開一通 chatSecondary（治「一輪三次 API」）。
    function _buildDedupeBlock(state) {
        if (!state || typeof state !== 'object') return null;
        const conts = [];
        for (const contKey of Object.keys(state)) {
            const cont = state[contKey];
            if (!cont || typeof cont !== 'object' || Array.isArray(cont)) continue;
            const names = Object.keys(cont).filter(n => cont[n] && typeof cont[n] === 'object' && !Array.isArray(cont[n]));
            if (names.length < 2 || names.length > 60) continue;
            let hasCand = false;
            outer: for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++)
                if (_looksLikeVariant(names[i], names[j])) { hasCand = true; break outer; }
            if (!hasCand) continue;
            const sig = names.slice().sort().join('|');
            if (_dedupeSeen.get(contKey) === sig) continue;   // 上次已判「沒得併」的同一組 → 不再問
            conts.push({ contKey: contKey, names: names, sig: sig });
        }
        if (!conts.length) return null;
        const listText = conts.map(c => '· 容器「' + c.contKey + '」：' + c.names.join('、')).join('\n');
        const block = '\n\n【附帶任務 · 角色名去重 — 在同一個 json 區塊一起輸出，不要另外回覆】\n' +
            '下列容器裡可能有「其實是同一角色」被寫成繁體/簡體或別名的重複：\n' + listText + '\n' +
            '請判斷並在輸出的 json 裡多加一個 "dupes" 欄位：\n' +
            '- 只把「確定是同一角色」的名字分到同一組；不同角色絕對不要併，寧可不併；不確定→不要放進組。\n' +
            '- 每組指定 keep(保留名)：優先「繁體＋最完整」的寫法。\n' +
            '- 只列「至少 2 個名字」的組；沒有任何重複就給空陣列。\n' +
            '格式： "dupes": [ { "container": "容器名", "keep": "保留名", "dup": ["被併掉的名1"] } ]';
        return { block: block, pending: conts };
    }
    // 深合併：把 src 欄位補進 dst(保留角色)，dst 既有非空值優先、只填 dst 缺的(空/待定/—)
    function _mergeEntity(dst, src) {
        if (!src || typeof src !== 'object' || !dst || typeof dst !== 'object') return dst;
        const _empty = v => v == null || v === '' || v === '待定' || v === '—';
        for (const k of Object.keys(src)) {
            const sv = src[k], dv = dst[k];
            if (dv && typeof dv === 'object' && !Array.isArray(dv) && sv && typeof sv === 'object' && !Array.isArray(sv)) _mergeEntity(dv, sv);
            else if (_empty(dv) && !_empty(sv)) dst[k] = sv;
        }
        return dst;
    }
    // 套用主副模型「搭便車」回的 dupes → 就地合併 state、記 _dedupeSeen。回合併筆數。
    //   pending = _buildDedupeBlock 這輪問過的候選容器；即使這輪沒併也記 _dedupeSeen（同組別再問，防燒 prompt）。
    function _applyDupes(state, dupes, pending) {
        if (!state || typeof state !== 'object') return 0;
        const byCont = {};
        (Array.isArray(dupes) ? dupes : []).forEach(g => {
            if (!g) return;
            const ck = String(g.container || '').trim();
            if (ck) { (byCont[ck] = byCont[ck] || []).push(g); }
        });
        let total = 0;
        (pending || []).forEach(p => {
            const cont = state[p.contKey];
            if (!cont || typeof cont !== 'object') return;
            let mergedHere = 0;
            (byCont[p.contKey] || []).forEach(g => {
                let keep = String(g.keep || '').trim();
                const dups = (Array.isArray(g.dup) ? g.dup : []).map(x => String(x || '').trim()).filter(Boolean);
                const groupAll = [keep, ...dups].filter(n => cont[n]);
                if (groupAll.length < 2) return;
                if (!groupAll.includes(keep)) keep = groupAll.slice().sort((a, b) => Object.keys(cont[b] || {}).length - Object.keys(cont[a] || {}).length)[0];
                for (const d of groupAll) {
                    if (d === keep || !cont[d]) continue;
                    _mergeEntity(cont[keep], cont[d]); delete cont[d]; mergedHere++; total++;
                    console.log('🔁 [State Runtime] 角色去重(搭便車)：「' + d + '」併入「' + keep + '」(' + p.contKey + ')');
                }
            });
            if (mergedHere === 0) _dedupeSeen.set(p.contKey, p.sig);   // 沒併 → 記住別再問同一組
            else _dedupeSeen.delete(p.contKey);                        // 併過 → 名單變了、清掉重評
        });
        return total;
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

        return `你是劇情狀態追蹤抽取器。**先分析、再輸出**——不要直接吐 JSON，先想清楚再寫。

【schema 定義 / 每個欄位的 desc 就是必須嚴守的約束】
${JSON.stringify(schema, null, 2)}

【上一輪後的當下狀態】
${JSON.stringify(current, null, 2)}

【最近劇情】
${recentText || '（無）'}

${modeRules}

---
【第一步 · 先分析】純文字、簡短，每項一兩句，**不准省略這步**：
1. 出場角色：這輪劇情出現哪些「具名、對劇情有份量」的角色？（雜魚/路人/野獸/怪物/雜兵不算；以該 object 欄位 desc 的規定為準）
2. 本輪變化：逐一看每個出場角色，這輪有什麼狀態變化？（好感度增減多少／身分是否揭露／外觀是否被描寫）——**只認劇情明寫或強烈暗示的，沒寫的不要編**
3. 新角色：有沒有第一次登場的角色？要按該欄位 desc 的「基礎屬性組」補哪幾個初值？
4. 主角檢查：出場的有沒有主角／MC／{{user}} 本人？（主角好感度填 null，其餘欄照記）
5. 初遇檢查：這輪見過 MC 的角色，每個都記了「初遇」嗎？（短暫出場、戲份少的也要；【當下狀態】裡缺初遇的見過 MC 的角色也要回補）
6. 校對：有沒有漏掉出場角色、有沒有編造、數值有沒有超出 desc 範圍、是否用點記法、沒變的有沒有誤寫進去

【第二步 · 輸出】把上面分析的結論整理成 JSON，放進一個 \`\`\`json 區塊（區塊外才是分析文字）：
\`\`\`json
{ "updates": { "<欄位名 或 容器.實體.屬性>": <新值> } }
\`\`\`

【通用規則】
- 數字欄位：給新數值（例：當下好感 12 + 升 3 → 15）
- 字串/enum：給新字串；list：給完整陣列（追加後完整輸出）
- 不要編造劇情沒寫的事（初始化模式才可從 desc 推合理初值）
- **嚴守每個欄位的 desc 約束**：desc 寫「0-100」就不准超範圍、寫枚舉就不准給別的值
- **好感度＝對主角的「情感親密／信任」，不是性慾**：性事可以長好感，但**幅度要看關係階段、不能用飛的**——關係還停在炮友／純肉體／逢場作戲（曖昧以下）時，性事對好感度只給很小增幅（炮友卻好感狂飆很詭異）；唯有關係已在**曖昧以上**（有情感基礎、互相在意）的情事，才可隨情感推進正常增長。好感度每輪通常只小幅變動（個位數），唯有重大情感事件才較大增減。對「身體/慾望」另有欄位的世界，性事強度寫進那欄、別灌進好感度。
- 「主線目標」是**穩定錨點**：初始化時依最初任務設定一次，之後**視為固定、不要再寫進 updates**（跑團再深也別覆蓋；每輪該變的是「當前任務」不是「主線目標」）；除非劇情明確翻轉主線（原目標作廢／被取代）才更新。

【物件型欄位 / 動態實體（重要）】
- type 是 "object" 的欄位 = 裝「多個實體各自的屬性」，updates 的 key 用點記法「欄位名.實體名.屬性」，值放最末層
  例：{ "角色狀態.卡蜜拉.好感度": 70, "角色狀態.阿傑.身分": "店主" }
- 對劇情中所有「具名有份量」的出場角色都要抽（是否含路人/臨時 NPC，以該欄位 desc 為準）
- 新角色首次登場：按 desc 的「基礎屬性組」補齊每一個基礎屬性初值，之後才依劇情加特有屬性
- 「初遇」錨點（防 NPC 失憶）：只要某角色**與 MC 當面見過 / 互動過**，首次登場時就給它一個「初遇」屬性，記「第一次與 MC 相遇的時序＋地點＋怎麼遇上的」（例：{ "角色狀態.某人.初遇": "第4輪・城門口・替MC指路認識" }）。**即使該角色只是短暫出場、戲份很少，只要見過 MC 就一定要記**——這是為了讓他很久以後再登場時，不會被當成第一次見 MC。
- 「初遇」一旦寫入＝**永久錨點**：之後視為固定、不要再寫進 updates、不可改寫或刪除（角色消失幾百輪後再出現，初遇仍在）。若【當下狀態】裡某個見過 MC 的角色「缺」初遇，這輪順手回補（從劇情回推第一次相遇）。`;
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
除了上面的 "updates"，請在**同一個 JSON** 裡再加一個 "memories" 陣列，每筆 { "type", "summary", "text", "tags" }；沒有值得記的就給 []。
抽取規則：
${_memoryRulesText()}

最終輸出格式：{ "updates": { ... }, "memories": [ { "type":"...", "summary":"...", "text":"...", "tags":[...] } ] }`;
    }
    // 🎬 記憶導演：把帶碼全記憶目錄附給副模型，讓它挑「下一輪主模型該被提醒哪幾條」(放進同一個 JSON 的 recall_next)
    function _recallAddendum(catText) {
        return `

═══════════════════════════════════════
【★ 兼任「記憶導演」→ 放進同一個 JSON 的 "recall_next" 欄位】
下面是本劇全部過往記憶的「帶碼目錄」。請以導演視角判斷：根據剛發生的這一輪劇情走向，「下一輪」主模型最需要被提醒哪幾條過往記憶，才不會前後矛盾或失憶（主模型常常忘記自己回想，所以由你幫它挑）。
規則：recall_next 只放代號(目錄裡每行行首那個 A 開頭的編號)、純代號字串、不要改寫內容。挑「這一輪之後主模型真正需要回想」的——**有幾條相關就放幾條，沒有就給 []，最多 6 條**；數量完全看實際需要、不要固定、不要為了湊而填、該挑的也別漏。

【全記憶帶碼目錄】
${catText}

→ 最終 JSON 需含 "recall_next" 欄位（你挑出的代號字串組成的陣列，數量看實際需要、沒有就 []）`;
    }
    // 只有記憶要抽時的獨立 prompt（沒變數包 / 這則狀態已抽過）
    function _memoryOnlyPrompt(text) {
        return `你是長期記憶抽取器。從下面的劇情抽出值得長期記住的記憶條目。

【劇情】
${text || '（無）'}

抽取規則：
${_memoryRulesText()}

請輸出嚴格 JSON（不包 markdown）：{ "memories": [ { "type":"...", "summary":"...", "text":"...", "tags":[...] } ] }`;
    }
    // 把最後一則劇情「自己切段編號」→ 供副模型只挑數字、程式自己對位（不靠 AI 逐字抄原文）
    // 回傳敘事行陣列（已濾掉結構標籤/註解/code block）；index+1 = 給 AI 看的 [P編號]
    function _segmentStory(content) {
        if (!content) return [];
        let body = String(content).replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '');   // 先剝 CoT：思考區提到 <content> 會害正則從 CoT 開抓
        const m = body.match(/<content>([\s\S]*?)<\/content>/i);
        if (m) body = m[1];
        body = body.replace(/<!--[\s\S]*?-->/g, '');   // HTML 註解
        body = body.replace(/```[\s\S]*?```/g, '');     // code block
        const out = [];
        const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
        for (const l of lines) {
            if (/^[\[<【]/.test(l)) continue;                          // [Bg|]/[Scene|]/[Choice|]/<xxx>/【卡片】等結構行
            if (/^(scene-id|status|summary|content)\s*[:：]/i.test(l)) continue;
            if (l === '</content>' || l === '</scene>') continue;
            out.push(l);
            if (out.length >= 40) break;                              // 上限防爆
        }
        return out;
    }

    // 從 AVS 狀態抽「角色外觀錨點」：掃 object 容器(角色狀態)裡每個角色的外觀欄位，組成權威外觀清單。
    // 用途：補漏——給沒有頭像快取、但 AVS 有記外觀的角色。skip：已被頭像快取覆蓋的角色名(不重複列)。
    function _charLooksRef(state, skip, keep) {
        if (!state || typeof state !== 'object') return '';
        const LOOK_KEYS = ['髮色','髮型','瀏海','眼色','瞳色','膚色','體型','身材','身高','服裝','衣著','外觀','形象','身分','身份','氣質','臉型'];
        const lines = [];
        for (const v of Object.values(state)) {
            if (!v || typeof v !== 'object' || Array.isArray(v)) continue;   // 只看 object 容器
            for (const [name, ent] of Object.entries(v)) {
                if (!ent || typeof ent !== 'object' || Array.isArray(ent)) continue;   // 每個角色實體
                if (skip && skip.has(name)) continue;                         // 頭像快取已覆蓋 → 不重複
                if (keep && !keep(name)) continue;                            // 近期濾鏡：不在最近名單就跳過
                const looks = LOOK_KEYS
                    .filter(k => ent[k] != null && String(ent[k]).trim() && String(ent[k]).trim() !== '待定')
                    .map(k => `${k}:${String(ent[k]).trim()}`);
                if (looks.length) lines.push(`・${name}（${looks.join('、')}）`);
            }
        }
        return lines.join('\n');
    }

    // 「最近出現過的角色」名單：掃 [Char|名字] 標籤 = 當前這輪正文 + 最近 3 章 content。
    //   給 _buildLooksRef 當濾鏡 → 外觀錨點只留近期角色，不再每個曾畫過的都塞、無限長。
    //   ★安全閥：空集合(剛開局/掃不到標籤)→ 呼叫端退回「全列」，永不因濾過頭害副模型沒外觀可參考、把人畫崩。
    async function _recentCharNames() {
        const names = new Set();
        const scan = (txt) => {
            if (!txt) return;
            const re = /\[Char\|([^|\]\n]+)/g; let m;
            while ((m = re.exec(String(txt))) !== null) { const n = (m[1] || '').trim(); if (n) names.add(n); }
        };
        // 當前這輪（讀最後一則原文，含正在被抽的這輪、其說話角色一定保留）
        try { const arr = await win.TavernHelper?.getChatMessages?.(-1); scan(arr && arr[0] && (arr[0].message || arr[0].mes)); } catch (e) {}
        // 最近 3 章正文（每章 saveVnChapter 都存了 content）
        try {
            if (win.OS_DB && win.OS_DB.getAllVnChapters) {
                let chs = (await win.OS_DB.getAllVnChapters()) || [];
                let sid = '';
                try { sid = localStorage.getItem('vn_current_story_id') || (win.OS_AVS_ADAPTER && win.OS_AVS_ADAPTER.getStoryId && win.OS_AVS_ADAPTER.getStoryId()) || ''; } catch (e) {}
                if (sid) { const f = chs.filter(c => c && c.storyId === sid); if (f.length) chs = f; }   // 只看當前故事；對不到就全章退路
                chs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                chs.slice(0, 3).forEach(c => scan(c && c.content));
            }
        } catch (e) {}
        return names;
    }

    // 組「角色外觀錨點」：★主來源＝每個角色「頭像當初生成用的提示詞」(avatar_cache, ground truth)——
    //   插圖照它畫就跟頭像/立繪同一個人。沒有頭像的角色才退回 AVS 狀態記的外觀(_charLooksRef)。
    //   跟 vn_core 立繪同邏輯(優先 avatar_cache.prompt，沒有才退腳本描述)，徹底解決「久了被摘要、副模型查不到外觀」。
    //   ★ 只列「最近出現過的角色」(近 3 章 + 這輪)，避免清單隨遊戲無限累積；空集合則不濾(全列)。
    async function _buildLooksRef(state) {
        const recentNames = await _recentCharNames();
        const filterOn = recentNames.size > 0;
        const keep = (name) => !filterOn || recentNames.has(name);
        const lines = [];
        const seen = new Set();
        try {
            const C = win.VN_Cache;
            if (C && C.getAll) {
                const world = C.getCurrentWorld ? C.getCurrentWorld() : '';
                const all = await C.getAll('avatar_cache');
                for (const e of (all || [])) {
                    if (!e || !e.prompt) continue;
                    if (world && C.worldOf && C.worldOf(e) !== world) continue;   // 只看當前世界
                    const name = (C.bareKeyOf ? C.bareKeyOf(e) : e.key) || '';
                    const p = String(e.prompt).trim();
                    if (!name || !p || seen.has(name)) continue;
                    if (!keep(name)) continue;                                   // 近期濾鏡：只留最近出現的角色
                    seen.add(name);
                    lines.push(`・${name}｜頭像生成詞：${p}`);
                }
            }
        } catch (e) {}
        const avs = _charLooksRef(state, seen);   // 補漏：沒頭像但 AVS 有外觀的角色 → 保持全列、不吃近期濾鏡(AVS 是全開的底，近期濾鏡只砍重的頭像生成詞)
        if (avs) lines.push(avs);
        return lines.join('\n');
    }

    // 頭像詞→插圖用：剝掉「肖像框架詞」(數量1boy/solo/portrait/bust/簡單背景/looking at viewer)。
    //   頭像是單人肖像、那些詞對；但 ##C代號## 是塞進「已經數過人(2boys)的多角色場景」→ 數量/solo 會打架害 NAI 多生人。
    //   性別不會丟(還有 adult male/young man+種族)。頭像本身那串不動，只動插圖展開的副本。
    function _stripAvatarFraming(p) {
        const DROP = [
            /^\d+\s*(boys?|girls?|others?)$/i,
            /^solo(\s+focus)?$/i,
            /^(portrait|bust[\s_-]?shot|upper[\s_-]?body|cowboy[\s_-]?shot|head\s?shot|close[\s_-]?up|closeup|face\s+focus)$/i,
            /^(simple|white|plain|gradient|grey|gray|dark|light|blurry)[\s_].*background$/i,
            /^(simple\s+)?background$/i,
            /^looking[\s_]at[\s_]viewer$/i,
        ];
        // 先整個剝掉 (服裝, simple background) 括號組——這是 [Avatar] 格式的「服裝+背景」欄。
        //   插圖展開時只要固定外觀(髮/瞳/種族/年齡/特徵)，服裝由場景副模型按當下劇情自己寫(洗澡→裸、戰鬥→盔甲)，
        //   不然頭像預設服裝會蓋掉劇情狀態(洗澡還穿著衣服)；背景也由場景畫。逗號切前先剝，否則括號會被切成兩半漏出。
        const s = String(p || '').replace(/[（(][^（()]*[)）]/g, ' ');
        return s.split(',').map(t => t.trim()).filter(t => t && !DROP.some(re => re.test(t))).join(', ');
    }

    // {角色名 → 外觀字串}登記表：avatar_cache 頭像生成詞(主，剝肖像框架) + AVS 簡易形象(補漏)。給「##角色名## 佔位模式」展開用。
    //   全角色、不濾近期(展開是 lookup、不進 prompt，不怕多)；同名優先頭像詞。
    async function _buildLooksMap(state) {
        const map = {};
        try {
            const C = win.VN_Cache;
            if (C && C.getAll) {
                const world = C.getCurrentWorld ? C.getCurrentWorld() : '';
                const all = await C.getAll('avatar_cache');
                for (const e of (all || [])) {
                    if (!e || !e.prompt) continue;
                    if (world && C.worldOf && C.worldOf(e) !== world) continue;
                    const name = (C.bareKeyOf ? C.bareKeyOf(e) : e.key) || '';
                    const p = _stripAvatarFraming(String(e.prompt).trim());   // 剝肖像框架詞(1boy/solo/portrait/bust/簡單背景)防場景數量打架
                    if (name && p && !map[name]) map[name] = p;
                }
            }
        } catch (e) {}
        // ★ 不再灌 AVS 中文外觀：NAI 不吃中文，塞進 prompt＝廢字。沒英文頭像詞的角色一律不進登記表，
        //   交給副模型「自己用英文 NAI tag 寫外觀」(見 _sceneAddendum 佔位指示)。state 參數保留(相容呼叫端)。
        return map;
    }

    // 把 scene prompt 裡的 ##角色名## / ##C2## / ##C2. 名## 換成登記表外觀；
    //   對不到走小寫正規化、再拆「代號+名」各試一次，都不到才留原名(別讓 ## 進生圖)。
    //   用 ## 不用 {{}}：NAI 的 {{}}/[]/() 是權重語法，佔位改 ## 才不會跟底詞/預設包的權重撞(Rae 2026-06-23)。
    function _expandSceneNames(str, map) {
        if (!str || String(str).indexOf('##') < 0) return str;
        const lowerMap = {};
        for (const k of Object.keys(map || {})) lowerMap[k.toLowerCase()] = map[k];
        const _look = (k) => { if (!k) return null; const kk = String(k).trim(); return (map && (map[kk] || map[kk.toUpperCase()])) || lowerMap[kk.toLowerCase()] || null; };
        return String(str).replace(/##\s*([^#]+?)\s*##/g, (m, raw) => {
            const name = String(raw).trim();
            let hit = _look(name);
            if (hit) return hit;
            const mm = name.match(/^(C\d+)[\s.．:：、,，_-]+(.+)$/i);   // ##C2. 名## → 拆代號與名各試
            if (mm) { hit = _look(mm[1]) || _look(mm[2]); if (hit) return hit; }
            return name;
        });
    }

    // 場景插圖最終清洗：剝掉「角色 [...] 區塊內」的人數/獨照框架詞(1boy/1girl/solo/portrait...)。
    //   登記表展開那條已由 _stripAvatarFraming 剝過；但「沒頭像的角色」是副模型自己 inline 寫外觀、會自帶 1boy →
    //   多角色場景每個 block 各帶 1boy 會跟場景級 2boys 數量打架 → NAI 吐多人/亂框。這裡兜底剝乾淨。
    //   ★只動 [...] 內：場景級總人數(括號外，如開頭 2boys)保留——那是對的，告訴 NAI 總共幾人。
    function _scrubSceneCounts(str) {
        if (!str || String(str).indexOf('[') < 0) return str;
        const DROP = [
            /^\d+\s*(boys?|girls?|others?)$/i,        // 1boy / 1 boy / 2boys / 1girl
            /^solo(\s+focus)?$/i,
            /^(portrait|bust[\s_-]?shot|upper[\s_-]?body|head\s?shot|close[\s_-]?up|closeup)$/i,
        ];
        return String(str).replace(/\[([^\[\]]*)\]/g, (m, inner) => {
            const kept = inner.split(',').map(t => t.trim()).filter(t => t && !DROP.some(re => re.test(t)));
            return '[' + kept.join(', ') + ']';
        });
    }

    // 附加在 prompt 後面：要求同一個 JSON 多吐 "scenes"（場景插圖）。
    // ★ 定位用「編號段落 + after_paragraph 數字」——AI 只挑數字、絕不抄原文（避免簡繁/改寫/引舊訊息對不上）。
    function _sceneAddendum(userPrompt, numberedText, looksRef, nameList) {
        // nameList 非空 = ##代號/角色名##佔位模式（不塞外觀大塊、AI 只寫動作場景、系統事後展開）；否則 = 外觀錨點模式（整塊塞）
        //   nameList = [{code:'C1', name:'小米'}, ...]；代號只在這通 prompt 內有效，AI 用代號最準(簡繁/暱稱免對錯)
        //   佔位用 ## ## 不用 {{}}：NAI 的 {{}} 是權重語法、會跟底詞/預設包撞，## 才安全
        const charBlock = (nameList && nameList.length)
            ? `\n【角色外觀】下面是「已登記角色」清單(每個附代號 C1/C2…)。**只有清單裡的角色才有代號**：畫到他→**只寫 ##代號##**(如 ##C1##；系統自動填入外觀、跟頭像同一個人)，**用代號最準**(簡繁/暱稱不會對錯)；固定外觀(髮型/瞳色/種族/體型)交給 ##代號##、你不要自己重寫，但**服裝穿脫/裸露由你按本輪劇情寫**(代號只給固定外觀、不含服裝，否則洗澡會穿著衣服)。\n已登記角色：${nameList.map(e => e.code + '. ' + e.name).join('｜')}\n⚠️ **清單裡「沒有」的角色(沒代號)→ 直接用英文 NAI 標籤寫他完整外觀(種族/年齡/髮色/眼色/體型/服裝)，名字「絕對不要」用 ## 包**——沒代號就沒得填，包了系統認不得、會把 ##名字## 原樣送進 NAI 壞掉。一句話：**有代號才用 ##，沒代號就寫外觀、不准包名字**。\n⚠️ 只有代號要用井號 ## 包、**不要用 {{ }}**——{{ }} 是 NAI 權重會壞。\n你負責：動作／姿勢／表情／站位／互動／場景／環境／鏡頭／光線**＋服裝/裸露狀態**(洗澡→裸體、戰鬥→盔甲、睡覺→睡衣…)；已登記角色的固定外觀(髮/瞳/種族/體型)交給 ##代號##。\n`
            : ((looksRef && looksRef.trim())
                ? `\n【角色外觀錨點（★最高權威）：以下是每個角色已確立的外觀——「頭像生成詞」即當初畫這張頭像用的提示詞。畫到哪個角色，就照他這串外觀畫：髮色／眼色／體型／髮型／服裝一律沿用(姿勢、表情、鏡頭可依本輪劇情調整)。劇情或摘要沒寫到外觀也要主動補上，嚴禁漏髮色/眼色/體型，更嚴禁自行另編一個長相】\n${looksRef.trim()}\n`
                : '');
        return `

═══════════════════════════════════════
【★ 同時輸出「場景插圖」→ 放進同一個 JSON 的 "scenes" 欄位】
${(userPrompt || '').trim()}
${charBlock}
【定位規則｜務必嚴格遵守】（若上方說明提到 after 引文或其他 scenes 格式，一律以這裡為準）
- 下面【本輪最新劇情（編號段落）】是切好編號的段落，你只能從這些編號裡挑插圖位置。
- 嚴禁為世界書設定/歷史對話/舊訊息生圖——只畫最新這一輪的劇情。
- 每張插圖輸出 "after_paragraph"：一個數字，代表這張圖要出現在哪個編號段落「之後」。
- 不要複製、不要引用原文文字，只給數字編號。
- 格式範例：{ "scenes": [ { "after_paragraph": 3, "prompt": "..." }, { "after_paragraph": 7, "prompt": "..." } ] }

【本輪最新劇情（編號段落）】
${numberedText}`;
    }

    // 依「插圖來源」(scene service) 直接挑該接口的副模型插圖指令；每接口各自獨立，互不污染。
    // 舊存檔 fallback：沒有 per-接口欄 → 退回舊的 標籤/自然語言/單一 extractPrompt
    function _pickScenePrompt(cfg) {
        cfg = cfg || {};
        let svc = '';
        try { svc = (win.OS_IMAGE_MANAGER?.serviceFor?.('scene')) || win.OS_IMAGE_MANAGER?.config?.service || ''; } catch (e) {}
        const perIface = ({
            novelai:        cfg.extractPromptNovelai,
            pollinations:   cfg.extractPromptPollinations,
            tavern_sd:      cfg.extractPromptTavern,
            comfyui_direct: cfg.extractPromptComfy,
        })[svc];
        const picked = (perIface || '').trim();
        if (picked) return picked;
        // 舊存檔退路
        const tags = (cfg.extractPromptTags || '').trim();
        const nat  = (cfg.extractPromptNatural || '').trim();
        const legacy = (cfg.extractPrompt || '').trim();
        return (svc === 'novelai' ? tags : nat) || legacy || nat || tags || '';
    }

    // --- 主流程：抽一次（結合觸發：狀態 + 記憶共用同一通副模型）---
    async function extractOnce(opts) {
        if (_running) return;
        _running = true;
        let pendingMem = null, memIngested = false, _dedupe = null;
        try {
            if (_genStopped) { console.log('🛰️ [State Runtime] 本通生成被手動停止 → 跳過抽取(AVS/記憶)'); return; }
            const chatId = getChatId();
            if (!chatId || !win.OS_DB?.getStateData) return;

            // ── 截斷守門：半截正文(破甲/中途停)→ 整通副模型跳過：別拿髒正文抽 AVS／記憶／場景，也別白燒一張圖。
            //    「繼續生成／重新生成」補齊後 GENERATION_ENDED 會再觸發、收尾完整就正常抽（同一 msgId 重生，故這通若已寫髒 patch 會擋住重抽，所以這裡要擋乾淨）。
            //    讀「完整原文」判斷(不切片，避免長正文結尾被截誤判)。兩種截斷：
            //    ① 有 <content> 沒 </content> = 截在正文中（任何聊天都擋）
            //    ② VN 前景但連 <content> 都沒有 = 思考期就截、正文還沒冒出來（只在 VN 模式擋，避免誤傷非 VN 訊息；建檔/套預設初始填充 skipScenes 不擋，怕卡片問候語沒 <content>）
            try {
                const _lastArr = await win.TavernHelper?.getChatMessages?.(-1);
                const _lastRaw = String((_lastArr && _lastArr[0] && (_lastArr[0].message || _lastArr[0].mes)) || '');
                // 🚫 API 報錯佔位訊息(主模型生成失敗、錯誤字串被當正文寫進聊天)→ 不是真劇情：
                //    整通副模型跳過，別拿錯誤字串抽 AVS／記憶／場景、白燒額度，也別寫髒 patch 卡住 swipe 重生的正解。
                //    主路靠 ST 標準前綴 [API Error]；輔以「短訊息含 API 憑證錯誤特徵」(這些字串幾乎不會出現在劇情正文)。
                const _errRaw = _lastRaw.trim();
                if (/^\[API Error\]/i.test(_errRaw)
                    || (_errRaw.length < 200 && /(x-api-key|invalid_credentials|Authentication required|API 返回內容為空)/i.test(_errRaw))) {
                    console.log('🛰️ [State Runtime] 偵測到 API 報錯訊息 → 跳過本通抽取/記憶/場景，等重生補齊');
                    return;
                }
                const _rawNoCot = _lastRaw.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '');   // CoT 提到 <content> 字樣不算正文
                const _hasOpen = _rawNoCot.indexOf('<content>') !== -1;
                const _hasClose = _rawNoCot.indexOf('</content>') !== -1;
                const _vnFg = (() => { try { const p = win.document.getElementById('aurelia-vn-panel'); return !!(p && p.style.display !== 'none' && win.document.getElementById('page-game')); } catch (e) { return false; } })();
                const _isInitFill = !!(opts && opts.skipScenes);
                if ((_hasOpen && !_hasClose) || (_vnFg && !_hasOpen && !_isInitFill)) {
                    console.log('🛰️ [State Runtime] 正文截斷 → 跳過本通抽取，等補齊/重生再抽');
                    return;
                }
            } catch (e) {}

            const schema = await getActiveSchema();
            const hasState = !!(schema && Object.keys(schema).length);

            // 結合觸發：取走 vector_inject 掛的待處理記憶（狀態系統開著時它會交棒過來）
            pendingMem = (win.OS_VECTOR_INJECT?.consumePendingMemory?.()) || null;
            const wantMemory = !!(pendingMem && win.OS_VECTOR_ENGINE?.isEnabled?.() === true && typeof win.OS_VECTOR_ENGINE?.ingestEntries === 'function');
            // 場景插圖（副模型版）：搭便車在這通副模型多吐 scenes（不另開呼叫）
            const _sceneCfg = (function(){ try { return (JSON.parse(localStorage.getItem('os_image_config')||'{}').sceneGen) || {}; } catch(e){ return {}; } })();
            const _scenePromptText = _pickScenePrompt(_sceneCfg);
            // 建檔/套預設的「初始填充」傳 skipScenes:true → 只填狀態、不搭便車生場景插圖（建檔不是劇情推進，不該生圖）
            // 開了「獨立插圖副模型」→ 搭便車插圖停（改走 extractScenesStandalone 那條獨立通）；沒開＝照舊搭便車
            const wantScenes = !(opts && opts.skipScenes) && !!(_sceneCfg.extractEnabled && _scenePromptText) && !_sceneCfg.standaloneEnabled;

            if (!hasState && !wantMemory) return;   // 兩邊都沒事做

            const currentState = win._AVS_ENGINE?.read?.() || {};
            const { text: recentText, lastId, lastContent } = await gatherRecentMessages();

            const data = (await win.OS_DB.getStateData(chatId)) || {};
            // force（狀態面板「立即抽一次」）＝無視「這樓已抽過」守門重抽——按鈕的意義就是換好模型重來一次，
            // 原本 patches[lastId] 已存在就靜默跳過，按了等於沒按
            const _force = !!(opts && opts.force);
            const stateAlreadyDone = !_force && hasState && data.patches && lastId >= 0 && data.patches[lastId] !== undefined;
            const doState = hasState && !stateAlreadyDone && !!recentText && lastId >= 0;

            if (!doState && !wantMemory) return;

            // 組 prompt：狀態部分用原本 buildExtractPrompt(不動，保品質)；要記憶就附加 memories 區段共用同一通
            let prompt;
            if (doState) {
                const isInitialFill = !currentState || Object.keys(currentState).length === 0;
                prompt = buildExtractPrompt(schema, currentState, recentText, isInitialFill);
                // 📜 大總結參照（唯讀）：早期劇情被總結收走後最近樓層看不到 → 副模型對不到帳，
                //   任務早完成了狀態還掛「進行中」。附壓縮版總結讓它比對「當前狀態 vs 既成事實」修正。
                //   sp_avs_summary_ref=0 可關（省 token）。
                try {
                    if (localStorage.getItem('sp_avs_summary_ref') !== '0' && win.OS_STORY_TOOLS?.getCurrentInjectionPayload) {
                        const _sum = await win.OS_STORY_TOOLS.getCurrentInjectionPayload();
                        if (_sum) prompt += '\n\n【劇情大總結（唯讀參照，嚴禁複述進輸出）】\n若「當前狀態」的欄位與下列既成事實不符（例如任務其實已完成、酬勞已領、關係已變化），請在 updates 修正該欄位：\n' + _sum;
                    }
                } catch (e) {}
                if (wantMemory) prompt += _memoryAddendum();
                // 角色去重搭便車：有繁簡/別名候選才把名單塞進這通 prompt（不另開 API）
                if (localStorage.getItem('sp_avs_dedupe') !== '0') { _dedupe = _buildDedupeBlock(currentState); if (_dedupe) prompt += _dedupe.block; }
            } else {
                prompt = _memoryOnlyPrompt(recentText || pendingMem.content || '');
            }
            // 場景插圖搭便車：把最後一則自己切段編號，要副模型只挑 after_paragraph 數字（程式自己對位）
            let _sceneParas = [];
            let _looksMap = null;   // ##角色名##佔位模式才建；null = 用外觀錨點舊模式、派發時不展開
            const _useNamePH = wantScenes && _sceneCfg.useNamePlaceholder !== false;   // 預設開
            if (wantScenes && (doState || wantMemory) && recentText) {
                _sceneParas = _segmentStory(lastContent || '');
                if (_sceneParas.length) {
                    const numbered = _sceneParas.map((p, i) => `[P${i + 1}] ${p}`).join('\n');
                    if (_useNamePH) {
                        const _nameMap = await _buildLooksMap(currentState);
                        // 列「所有有外觀資料的角色」(頭像 + AVS-only NPC)；佔位模式名單只是名字+代號、很短不臃腫，
                        // 不再濾近期(濾近期會把沒頭像、只有 AVS 的 NPC 漏掉→副模型不知有這角色→畫崩)
                        const _names = Object.keys(_nameMap);
                        // 配代號 Cn（只在這通 prompt 內有效；AI 用 ##Cn## 最準、免簡繁/暱稱對錯，也可用 ##角色名##）
                        const _entries = _names.map((n, i) => ({ code: 'C' + (i + 1), name: n }));
                        _looksMap = { ..._nameMap };                                       // 名字鍵 → 外觀
                        _entries.forEach(e => { _looksMap[e.code] = _nameMap[e.name]; });   // 代號鍵 → 同一外觀(展開時兩種都認)
                        prompt += _sceneAddendum(_scenePromptText, numbered, '', _entries);
                    } else {
                        prompt += _sceneAddendum(_scenePromptText, numbered, await _buildLooksRef(currentState));
                    }
                }
            }

            // 🎬 記憶導演：給副模型「全記憶帶碼目錄」，讓它挑下一輪主模型該被提醒哪幾條（搭這通、不多打 API）
            let _recallCat = null;
            try {
                if ((doState || wantMemory) && win.OS_VECTOR_INJECT?.getCatalogForPicking) {
                    // 把「當下劇情」當 query 傳進去 → 召回端用向量粗篩出相關候選給導演挑（取代全目錄常駐）；沒向量就退回全目錄。
                    _recallCat = await win.OS_VECTOR_INJECT.getCatalogForPicking(lastContent || recentText || '');
                    if (_recallCat && _recallCat.text) prompt += _recallAddendum(_recallCat.text);
                }
            } catch (e) {}

            const json = await runWithRetry(prompt);
            // 存本輪抽取(原始輸出+memories)，狀態部分等下面算完 filtered/current 再補上 → 給狀態面板診斷/複製
            _lastExtract = { at: Date.now(), msgId: lastId, raw: _lastRawText, updates: null, memories: Array.isArray(json.memories) ? json.memories : null, current: null };

            // 🎬 記憶導演：副模型挑的代號 → 記憶物件 → 交棒 vector_inject，下一輪注入完整內文（取代主模型常忘記寫的 <recall>）
            try {
                if (_recallCat && _recallCat.map && win.OS_VECTOR_INJECT?.setPendingRecall) {
                    const _codes = Array.isArray(json.recall_next) ? json.recall_next : [];
                    const _picked = _codes.map(c => _recallCat.map[String(c).trim().toUpperCase()]).filter(Boolean);
                    win.OS_VECTOR_INJECT.setPendingRecall(_picked);
                }
            } catch (e) {}

            // --- 狀態 patch（邏輯與原本一致）---
            if (doState && json.updates && typeof json.updates === 'object') {
                const updates = json.updates;
                const filtered = {};
                for (const k of Object.keys(updates)) {
                    const root = k.split('.')[0];
                    if (schema[k] !== undefined || schema[root] !== undefined) filtered[k] = updates[k];
                }
                const trimmed = trimPatches({ ...(data.patches || {}), [lastId]: filtered }, data.base);
                // 🔑 新 current 一律「以引擎現有狀態為底、只疊這輪 patch」——不要用 recomputeCurrent 從 base 空白重建。
                //   因為 patches/base 可能是空的(先前狀態由主模型 <vars> 寫入、沒進 patch 系統)，從空重建會把累積的角色全洗光——這就是覆蓋根因。
                //   點記法 _setDeep 只動有變化的葉節點、其餘角色與屬性原封保留。
                const newCurrent = JSON.parse(JSON.stringify(currentState || {}));
                _applyPatchInto(newCurrent, filtered);
                // 🔁 寫入前先去重：同一角色繁簡/別名重複 → 副模型確認後合併刪除（有候選才花呼叫、無候選 0 成本；sp_avs_dedupe=0 可關）
                try {
                    if (_dedupe) {   // 這輪有塞去重候選 → 套用主副模型同一通回的 json.dupes（沒併也會記 _dedupeSeen 別再問）
                        const _m = _applyDupes(newCurrent, json.dupes, _dedupe.pending);
                        if (_m > 0) { if (_lastExtract) _lastExtract.dedupedCount = _m; console.log(`🔁 [State Runtime] 本輪去重合併 ${_m} 個重複角色(搭便車)`); }
                    }
                } catch (e) { console.warn('[State Runtime] 角色去重略過:', e?.message || e); }
                if (_lastExtract) { _lastExtract.updates = filtered; _lastExtract.current = newCurrent; }   // 補上狀態給診斷面板
                // 📸 寫入前快照「抽取前狀態」→ 狀態面板「還原上一步」能撤掉這輪亂抽（小模型掉鏈子的保險）。
                //   舊快照只掛在主模型 <vars> 退役路徑上，副模型抽取從沒寫過 → 按鈕永遠是暗的。
                try { win._AVS_ENGINE?.snapshot?.(currentState || {}); } catch (e) {}
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

            // --- 場景插圖（副模型版）：把 scenes 交給渲染器（認 message_id 回填、防 desync）---
            if (wantScenes && Array.isArray(json.scenes) && json.scenes.length && win.VN_SceneInsert?.fromExtract) {
                try {
                    // AI 只給段號 → 換成程式自己存的那段原文(逐字)當錨點；VN_SceneInsert 拿原文去 VN 劇本逐字對位
                    const mapped = json.scenes.map(s => {
                        let after = '';
                        const n = parseInt(s.after_paragraph ?? s.afterParagraph ?? '', 10);
                        if (n >= 1 && _sceneParas[n - 1]) after = _sceneParas[n - 1];
                        else if (s.after) after = String(s.after);  // 舊格式相容（AI 真給了引文）
                        // 佔位模式：把 ##角色名## 換成登記表外觀（頭像詞→AVS→留原名）；非佔位模式 _looksMap=null 不動
                        return { after: after, prompt: _scrubSceneCounts(_looksMap ? _expandSceneNames(s.prompt, _looksMap) : s.prompt) };
                    }).filter(s => s && s.prompt);
                    win.VN_SceneInsert.fromExtract(mapped, { chatId: chatId, msgId: lastId });
                    console.log(`🖼️ [State Runtime] 場景插圖：派發 ${mapped.length} 張 段號[${json.scenes.map(s => s.after_paragraph ?? s.afterParagraph ?? '?').join(',')}]/共${_sceneParas.length}段 (msg#${lastId})`);
                } catch(e) { console.warn('[State Runtime] 場景插圖派發失敗:', e?.message || e); }
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

    // 🎯 獨立插圖副模型：scenes 拆成「單獨一通 chatSecondary」，只吃 standaloneSpec、不背 AVS/記憶。
    //    開關在 圖片設定→插圖→「獨立插圖副模型」。沒開＝走 extractOnce 搭便車路（上面，原碼保留），互不影響。
    // 獨立插圖佔位展開：把 ##角色名##/##代號## 換成登記表外觀；NAI 的 {{}}/[]/() 權重一概不碰（只動井號 ##）。
    function _expandHashNames(str, map) {
        if (!str || String(str).indexOf('##') < 0) return str;
        const lower = {}; for (const k of Object.keys(map || {})) lower[k.toLowerCase()] = map[k];
        return String(str).replace(/##\s*([^#]+?)\s*##/g, (m, raw) => {
            const name = String(raw).trim();
            const hit = (map && (map[name] || map[name.toUpperCase()])) || lower[name.toLowerCase()];
            return hit || name;   // 登記到→外觀；沒登記→拿掉井號留原文（別讓 ## 進 NAI）
        });
    }
    let _sceneRunning = false;
    let _sceneDebounce = null;
    async function extractScenesStandalone() {
        if (_sceneRunning) return;
        _sceneRunning = true;
        try {
            if (_genStopped) { console.log('🛰️ [State Runtime] 本通生成被手動停止 → 跳過場景插圖'); return; }
            if (win.__AURELIA_SUMMARIZING) return;
            const sg = (function () { try { return (JSON.parse(localStorage.getItem('os_image_config') || '{}').sceneGen) || {}; } catch (e) { return {}; } })();
            if (!sg.standaloneEnabled) return;
            const spec = String(sg.standaloneSpec || '').trim();
            if (!spec) return;
            if (!win.OS_API?.chatSecondary || !win.VN_SceneInsert?.fromExtract) return;
            const chatId = getChatId();
            if (!chatId) return;
            // 截斷守門（簡版）：API 報錯 / 半截正文 → 別生圖
            try {
                const _arr = await win.TavernHelper?.getChatMessages?.(-1);
                const _raw = String((_arr && _arr[0] && (_arr[0].message || _arr[0].mes)) || '');
                const _t = _raw.trim();
                if (/^\[API Error\]/i.test(_t) || (_t.length < 200 && /(x-api-key|invalid_credentials|Authentication required|API 返回內容為空)/i.test(_t))) return;
                const _rawNC = _raw.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '');   // CoT 提到 tag 字樣不算
                if (_rawNC.indexOf('<content>') !== -1 && _rawNC.indexOf('</content>') === -1) return;
            } catch (e) {}
            const { text: recentText, lastId, lastContent } = await gatherRecentMessages();
            if (!recentText || lastId < 0) return;
            const paras = _segmentStory(lastContent || '');
            if (!paras.length) return;
            const numbered = paras.map((p, i) => `[P${i + 1}] ${p}`).join('\n');
            // {{角色}} 登記表（同搭便車：頭像詞 + 代號 Cn）
            const currentState = win._AVS_ENGINE?.read?.() || {};
            const nameMap = await _buildLooksMap(currentState);
            const names = Object.keys(nameMap);
            const entries = names.map((n, i) => ({ code: 'C' + (i + 1), name: n }));
            const looksMap = { ...nameMap };
            entries.forEach(e => { looksMap[e.code] = nameMap[e.name]; });
            const charList = entries.length ? entries.map(e => `##${e.code}## ${e.name}`).join('｜') : '（無已登記角色，全部 NPC 自己寫外觀）';
            // 系統訊息 = 你貼的完整規範 + 對接層（只動我這邊：佔位用 ##名##、輸出 scenes JSON）；大佬規範的 {{}} 權重一概不碰
            const _override = `\n\n────────\n【本系統對接（最高優先，覆蓋上面規範裡衝突的部分，含覆蓋「每個角色一律用代號」這種說法）】\n- 你只生成插圖提示詞、不寫劇情正文、不續寫、不解釋。\n- 下面 user 會給「已登記角色清單」(每個附代號 C1/C2…)。**只有清單裡的角色才有代號**：畫到他→**只寫 ##代號##**(如 ##C1##；系統自動填外觀、跟頭像一致)，不要自己寫這些人的固定長相/DNA，只寫動作/姿勢/表情/服裝/裸露/站位/互動。\n- **清單裡「沒有」的角色(沒代號)→ 直接用英文寫他的完整外觀(種族/年齡/髮色/眼色/體型/服裝)，他的名字「絕對不要」用 ## 包起來**——沒代號就沒得填，包了系統認不得、會把 ##名字## 原樣送進 NAI 壞掉。一句話：**有代號才用 ##，沒代號就寫外觀、不准包名字**。\n- 只有「代號」要用井號 ## 包(如 ##C1##)，**不要用 {{ }}**——{{ }} 是 NAI 權重語法、會壞；## 跟你規範裡的 {{}} 權重互不衝突。\n- 只輸出一個 JSON、前後不要任何文字：{ "scenes": [ { "after_paragraph": 數字, "prompt": "..." } ] }。after_paragraph 從用戶給的編號段落挑數字、不要抄原文。`;
            const userMsg = `【已登記角色（畫到就用 ##代號## 或 ##角色名##，系統自動填外觀；不在名單的 NPC 自己寫外觀）】\n${charList}\n\n【本輪最新劇情（編號段落；after_paragraph 從這些數字挑，別抄原文）】\n${numbered}`;
            const messages = [
                { role: 'system', content: spec + _override },
                { role: 'user', content: userMsg }
            ];
            const raw = await new Promise((res, rej) => {
                let done = false;
                const timer = setTimeout(() => { if (done) return; done = true; rej(new Error('獨立插圖副模型超時')); }, CONFIG.timeoutMs);
                win.OS_API.chatSecondary(messages, null,
                    (text) => { if (done) return; done = true; clearTimeout(timer); res(text); },
                    (err) => { if (done) return; done = true; clearTimeout(timer); rej(err); });
            });
            const json = extractJSON(raw);
            if (!json || !Array.isArray(json.scenes) || !json.scenes.length) { console.warn('[獨立插圖] 輸出不含 scenes'); return; }
            const mapped = json.scenes.map(s => {
                let after = '';
                const n = parseInt(s.after_paragraph ?? s.afterParagraph ?? '', 10);
                if (n >= 1 && paras[n - 1]) after = paras[n - 1];
                else if (s.after) after = String(s.after);
                return { after, prompt: _scrubSceneCounts(_expandHashNames(s.prompt, looksMap)) };
            }).filter(s => s && s.prompt);
            if (mapped.length) {
                // 派發對位 msgId 用 getChatMessages(-1) 的「窗口號」lastId——跟 VN(_currentMessageId/loadScript)同一個 id 空間。
                // ⚠️別用 _trueLastId(/api/chats/search 的磁碟真號)：懶載大聊天(如 493 樓只載入窗口顯示 101)時，真號(493)≠VN 窗口號(101)、差 392 插不進。
                win.VN_SceneInsert.fromExtract(mapped, { chatId, msgId: lastId });
                console.log(`🖼️ [獨立插圖] 派發 ${mapped.length} 張 段號[${json.scenes.map(s => s.after_paragraph ?? '?').join(',')}]/共${paras.length}段 (msg#${lastId})`);
            }
        } catch (e) { console.warn('[獨立插圖] 失敗:', e?.message || e); }
        finally { _sceneRunning = false; }
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

    // --- inject 缺頭像提醒：主模型有時投入劇情忘了給角色頭像 → 善意提醒補上 ---
    // 只列「近期出場但還沒頭像」的；已宣告/已快取的去掉；一個都不缺就不注入。代號角色交給提醒文字讓模型自己略過。
    async function injectAvatarReminder() {
        try {
            try { _lastAvatarUninject?.(); } catch(e) {}
            _lastAvatarUninject = null;
            if (!win.TavernHelper?.injectPrompts) return;
            const VC = win.VN_Cache || (win.parent && win.parent.VN_Cache);
            if (!VC || !VC.get) return;   // 查不了快取就別亂提醒(免誤報)

            // 近期場景文字（in-memory chat 末段，繞檔讀；含本輪剛落地的）
            let text = '';
            try {
                const ctx = win.SillyTavern?.getContext?.();
                if (ctx && Array.isArray(ctx.chat)) {
                    text = ctx.chat.slice(-8).filter(m => m && !m.is_system).map(m => m.mes || m.message || '').join('\n');
                }
            } catch(e) {}
            if (!text) return;

            const cast = new Set(), declared = new Set();
            let mt;
            const reChar = /\[Char\|([^|\]]+)/g;
            while ((mt = reChar.exec(text))) { const n = (mt[1] || '').trim(); if (n && n.charAt(0) !== '{') cast.add(n); }
            const reAv = /\[Avatar\|([^|\]]+)/g;
            while ((mt = reAv.exec(text))) { const n = (mt[1] || '').trim(); if (n) declared.add(n); }
            if (!cast.size) return;

            // ⚠️時序：injectRules 只 await 一次就搶在 prompt 組裝前落地；這裡也必須併發查完(別逐個 await)
            // 否則角色一多、序列 await 拖太久 → injectPrompts 比 prompt 組裝晚 → 這輪 prompt 沒被塞進去(看起來像 AI 無視)
            const candidates = [...cast].filter(n => !declared.has(n));   // 扣掉近期已宣告頭像的
            const checks = await Promise.all(candidates.map(async name => {
                let has = false;
                try { has = !!(await VC.get('avatar_cache', name)); } catch(e) {}
                return has ? null : name;                          // 有快取→不缺；沒有→缺頭像
            }));
            const missing = checks.filter(Boolean);
            console.log('[頭像提醒] 近期出場=[' + [...cast].join('、') + '] / 缺頭像=[' + (missing.join('、') || '無') + ']' + (missing.length ? ' → 注入提醒' : ' → 不注入'));
            if (!missing.length) return;                          // 都有了 → 不注入

            const content = `<頭像宣告·硬性必填 規則="本輪必須執行·不得略過">\n下列出場角色目前沒有頭像：${missing.join('、')}。\n你【必須】在這次回覆開頭的角色卡（ChapterCard）區，為其中「有正式人名」的角色補上頭像宣告：[Avatar|角色名|外觀特徵]。這是必填項，不准漏、不准拖到下一輪、不准用「之後再補」帶過。\n唯一例外：純代號／未具名／純路人角色可以不補；除此之外一律補齊。\n</頭像宣告·硬性必填>`;
            const result = win.TavernHelper.injectPrompts([{
                id: CONFIG.avatarInjectId,
                content,
                position: 'in_chat',
                depth: 0,           // 越小越深、最貼生成點(最後一個讀到→最難被忽略)
                role: 'system'
            }], { once: true });
            _lastAvatarUninject = result?.uninject || null;
        } catch(e) {
            console.warn('[State Runtime] avatar reminder inject 失敗:', e?.message || e);
        }
    }

    // 好感度數字 → preset 的 5 階（每 20 一階；階段詞跟 preset 一字不差）
    function _affinityStage(n) {
        const v = parseFloat(n);
        if (isNaN(v)) return null;
        if (v <= 20) return '陌生';
        if (v <= 40) return '相识';
        if (v <= 60) return '友好';
        if (v <= 80) return '信任';
        return '亲密';
    }
    // 在場角色：掃最近幾則的 [Char|名]（跟缺頭像提醒同招），跳過 {代號} / *心聲*
    function _activeCastNames() {
        try {
            const ctx = win.SillyTavern?.getContext?.();
            if (!ctx || !Array.isArray(ctx.chat)) return [];
            const text = ctx.chat.slice(-6).filter(m => m && !m.is_system).map(m => m.mes || m.message || '').join('\n');
            const set = new Set(); let m;
            const re = /\[Char\|([^|\]]+)/g;
            while ((m = re.exec(text))) { const n = (m[1] || '').trim(); if (n && n.charAt(0) !== '{' && n.charAt(0) !== '*') set.add(n); }
            return [...set];
        } catch (e) { return []; }
    }
    // 遞迴掃 state 找每個角色的好感度：容器內某物件有「好感度」→ 該物件的 key 即角色名（角色狀態.名.好感度）
    function _collectAffinity(obj, keyName, out) {
        if (!obj || typeof obj !== 'object') return;
        if (obj['好感度'] !== undefined && keyName) {
            const n = parseFloat(obj['好感度']);
            if (!isNaN(n)) out[keyName] = n;
        }
        for (const [k, v] of Object.entries(obj)) {
            if (v && typeof v === 'object') _collectAffinity(v, k, out);
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

            // 變數定義說明書（2026-06-29 改：跟「當前值」一起即時注入，取代「每個 chatId 寫一條世界書」→不再堆條目）
            let defsBlock = '';
            try { if (win.OS_AVS?.buildVarDefsContent) defsBlock = (await win.OS_AVS.buildVarDefsContent(chatId)) || ''; } catch (e) {}

            const data = await win.OS_DB.getStateData(chatId);
            let stateBlock = '';
            if (data && data.current && Object.keys(data.current).length) {
                const lines = Object.entries(data.current)
                    .map(([k, v]) => `- ${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
                    .join('\n');
                stateBlock = `<世界狀態 規則="權威資料·寫作前必讀·不得矛盾·唯讀嚴禁複述">\n以下是當前劇情的權威狀態，由系統自動追蹤，屬於給你的唯讀背景。你接下來的寫作必須與這些數值、身分、關係完全一致，嚴禁與之矛盾或擅自更改。同時嚴禁在任何輸出（包括 <summary> 摘要）中複述、抄寫或整理本區塊內容——狀態由系統追蹤與保存，不需要也不允許你記錄。\n${lines}\n</世界狀態>`;
            }

            // 關係階段：在場角色的好感度數字 → preset 5 階（權威階段，演法交給 preset 的情感发展逻辑）
            let affinityBlock = '';
            try {
                if (data && data.current) {
                    const all = {};
                    _collectAffinity(data.current, null, all);
                    const active = new Set(_activeCastNames());
                    const lines = Object.keys(all)
                        .filter(name => active.has(name))
                        .map(name => { const st = _affinityStage(all[name]); return st ? `- ${name}：好感度 ${all[name]} → ${st} 阶段` : null; })
                        .filter(Boolean);
                    if (lines.length) {
                        affinityBlock = `<关系阶段 规则="权威·依此演·严禁跳阶；每一阶怎么演交给情感发展逻辑按角色性格处理，不要套公式">\n${lines.join('\n')}\n</关系阶段>`;
                    }
                }
            } catch (e) {}

            const content = [defsBlock, stateBlock, affinityBlock].filter(Boolean).join('\n');
            if (!content) return;   // 定義 + 當前值 + 關係階段都空 → 不注入

            const result = win.TavernHelper.injectPrompts([{
                id: CONFIG.injectId,
                content,
                position: 'in_chat',
                depth: 0,
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
            if (_selfEditing) { console.log('🛰️ [State Runtime] 開頭補救自身改寫 → 略過 patch 失效'); return; }
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
        await extractOnce({ force: true });   // 面板手動重抽＝無視「這樓已抽過」守門，用當下副模型重來
        showToast('✅ 抽取完成', 'success');
    }

    // ♻️ 深度整理（狀態面板手動、低頻）：用「主模型」把整份狀態清一輪——合併重複角色(繁簡/別名)、
    //   移除純路人、按大總結對帳修正過期欄位。日常副模型增量抽取的互補：玩個五十/百輪狀態髒了手動壓一次
    //   （狀態系統版的「重壓大總結」）。安全網：整理前快照(可還原上一步)、AI 回傳解析不過就整單放棄絕不寫半套、
    //   清理後重打底(base=cleaned、patches 歸零——舊補丁跟新基準已不對齊)。
    async function deepConsolidate() {
        const chatId = getChatId();
        if (!chatId || !win.OS_DB?.getStateData) return { ok: false, msg: '沒有進行中的故事' };
        if (!win.OS_API || typeof win.OS_API.chatMain !== 'function') return { ok: false, msg: '主模型不可用（先到系統設置設定）' };
        const currentState = win._AVS_ENGINE?.read?.() || {};
        if (!Object.keys(currentState).length) return { ok: false, msg: '目前沒有狀態可整理' };
        let summary = '';
        try { if (win.OS_STORY_TOOLS?.getCurrentInjectionPayload) summary = (await win.OS_STORY_TOOLS.getCurrentInjectionPayload()) || ''; } catch (e) {}

        const sys = '你是資料整理工具。只輸出 JSON，不要任何解說、標記或程式碼圍欄。';
        const prompt = [
            '下面是一份跑團劇情的「狀態資料」JSON。它由小模型逐輪累積，可能有：同一角色的繁簡/別名重複條目、早該更新的過期欄位、無足輕重的路人條目。請整理成乾淨版本。',
            '',
            '規則：',
            '1. 合併重複：同一角色的繁簡體/別名/暱稱條目合併成一條（名字保留資訊較完整的那個），數值取最新合理值。',
            '2. 移除純路人：只有「沒有好感度/關係數值、沒有物品往來、與任務無牽扯、劇情總結也沒提到」的條目才可移除；不確定就保留。',
            '3. 對帳修正：對照【劇情總結】的既成事實，修正過期欄位（例如任務其實已完成/酬勞已領、關係已變化）。',
            '4. 結構不變：保持原本的巢狀結構與欄位名，不發明新欄位、不改欄位型別、不改頂層分類。',
            '5. 只輸出 JSON，格式：{"current":{整理後完整狀態},"merged":["被合併掉的名字"],"removed":["被移除的名字"],"fixed":["修正了什麼(短句)"]}',
            '',
            '【當前狀態】',
            JSON.stringify(currentState),
            summary ? '\n【劇情總結（唯讀參照）】\n' + summary : '',
        ].join('\n');

        const _W = window.parent || window;
        _W.__AURELIA_SUMMARIZING = true;   // 同大總結：整理這通別觸發抽取/生圖等 GENERATION_* 掛勾
        let text = '';
        try {
            text = await new Promise((resolve, reject) => {
                try { win.OS_API.chatMain([{ role: 'system', content: sys }, { role: 'user', content: prompt }], null, resolve, reject); }
                catch (e) { reject(e); }
            });
        } catch (e) {
            return { ok: false, msg: (e && e.message) || String(e) };
        } finally {
            setTimeout(function () { _W.__AURELIA_SUMMARIZING = false; }, 3000);   // 撐過事後才發的 GENERATION_ENDED
        }

        let obj = null;
        try { const m = String(text || '').match(/\{[\s\S]*\}/); obj = JSON.parse(m ? m[0] : ''); } catch (e) {}
        const cleaned = obj && obj.current;
        if (!cleaned || typeof cleaned !== 'object' || Array.isArray(cleaned) || !Object.keys(cleaned).length) {
            console.warn('[State Runtime] ♻️ 深度整理：AI 回傳解析失敗，放棄不寫入。回傳開頭：', String(text || '').slice(0, 300));
            return { ok: false, msg: 'AI 回傳格式不對（已放棄，狀態未動）' };
        }
        // 防呆：整理後的頂層分類必須是原有分類的子集（模型亂發明/砍掉整個分類 → 可疑，放棄）
        const curRoots = Object.keys(currentState);
        if (!Object.keys(cleaned).every(k => curRoots.includes(k))) {
            console.warn('[State Runtime] ♻️ 深度整理：頂層分類對不上原狀態，放棄不寫入', Object.keys(cleaned), curRoots);
            return { ok: false, msg: 'AI 動了頂層分類（已放棄，狀態未動）' };
        }

        try { win._AVS_ENGINE?.snapshot?.(currentState); } catch (e) {}   // 整理前快照 → 還原上一步可撤
        try { win._AVS_ENGINE?.write?.(cleaned); } catch (e) { return { ok: false, msg: '寫入失敗：' + (e?.message || e) }; }
        try {
            const data = (await win.OS_DB.getStateData(chatId)) || {};
            await win.OS_DB.saveStateData(chatId, { ...data, base: cleaned, patches: {}, current: cleaned });
        } catch (e) {}
        const n = a => Array.isArray(a) ? a.length : 0;
        console.log('♻️ [State Runtime] 深度整理完成', { merged: obj.merged, removed: obj.removed, fixed: obj.fixed });
        return { ok: true, merged: n(obj.merged), removed: n(obj.removed), fixed: n(obj.fixed) };
    }

    // ─────────────────────────────────────────────────────────────────────
    // 開頭設置補救：主模型偶爾漏掉開場 ChapterCard 的 [Bg]/[BGM]（換背景/音樂的關鍵）
    //   → 腳本每輪重抓、漏一次就掉場景：章節卡空、回放/背景音樂失準。
    //   搭「生成結束」這趟，自動 carry-forward 最近一筆補回、改寫最新這則酒館訊息。
    //   • 只在「整則完全沒有該 tag」時補（這輪 AI 有給=可能換了場景，不去蓋）。
    //   • 歷史也找不到可 carry → 放棄（不亂編場景）。
    //   • 改寫用 setChatMessages({refresh:'affected'})，與 _captureAndStripRecall 同款（程式化刷新、不觸發 MESSAGE_EDITED）。
    //   • 隱藏開關 localStorage vn_fix_opening=0 可關，預設開。
    // ─────────────────────────────────────────────────────────────────────
    async function _repairOpeningSettings() {
        try {
            if (localStorage.getItem('vn_fix_opening') === '0') return;
            if (!win.TavernHelper?.setChatMessages) return;
            const ctx = win.SillyTavern?.getContext?.();
            if (!ctx || !Array.isArray(ctx.chat) || !ctx.chat.length) return;
            const arrIdx = ctx.chat.length - 1;                 // 用陣列索引改最新則（避開懶載真樓號越界，同 _captureAndStripRecall）
            const msg = ctx.chat[arrIdx] || {};
            if (msg.is_user || msg.is_system) return;           // 只修主模型回覆
            const cur = String(msg.mes || msg.message || '');
            // 只看最後一個 </thinking> 之後的正文段：CoT 常提到 <content>/<ChapterCard>/[Bg| 範例字樣，
            // 閘門會被騙、補回的行還會插進思考區被剝掉 → 檢測與插入都在 tail 上做、頭尾重組寫回
            let _tailStart = 0;
            { const _re = /<\/think(?:ing)?>/gi; let _tm; while ((_tm = _re.exec(cur)) !== null) _tailStart = _tm.index + _tm[0].length; }
            const _head = cur.slice(0, _tailStart), _tail = cur.slice(_tailStart);
            if (_tail.indexOf('<content>') === -1 || _tail.indexOf('</content>') === -1) return;  // 只動完整 VN 正文，避開半截/思考期/錯誤訊息

            const hasBg  = /\[Bg\|/i.test(_tail);
            const hasBgm = /\[BGM\|/i.test(_tail);
            if (hasBg && hasBgm) return;                        // 兩個都在 → 沒漏

            // carry-forward：往回找最近一則含該 tag 的訊息，撈「最後一個」(=當前場景/音樂)整行原樣（'_' = 本輪已有、不用找）
            let bgLine = hasBg ? '_' : null, bgmLine = hasBgm ? '_' : null;
            for (let i = arrIdx - 1; i >= 0 && (bgLine === null || bgmLine === null); i--) {
                const t = String(ctx.chat[i]?.mes || ctx.chat[i]?.message || '');
                if (bgLine === null)  { const ms = t.match(/^[ \t]*\[Bg\|[^\]\n]*\]/gim);  if (ms) bgLine  = ms[ms.length - 1].trim(); }
                if (bgmLine === null) { const ms = t.match(/^[ \t]*\[BGM\|[^\]\n]*\]/gim); if (ms) bgmLine = ms[ms.length - 1].trim(); }
            }
            const inject = [];
            if (bgmLine && bgmLine !== '_') inject.push(bgmLine);   // 音樂在前
            if (bgLine  && bgLine  !== '_') inject.push(bgLine);
            if (!inject.length) return;                          // 歷史也沒得 carry → 不補

            // 插進開場：有 <ChapterCard> 就插它後面（Bg/BGM 本就屬卡內）、否則插 <content> 後面；各自獨立一行
            // （在 _tail 上替換再與 _head 重組 → 絕不會插進 CoT 裡被剝掉）
            const block = inject.join('\n');
            const _nextTail = /<ChapterCard>/i.test(_tail)
                ? _tail.replace(/(<ChapterCard>[^\n]*\n?)/i, `$1${block}\n`)
                : _tail.replace(/(<content>[^\n]*\n?)/i, `$1${block}\n`);
            if (_nextTail === _tail) return;
            const next = _head + _nextTail;

            _selfEditing = true;   // 擋自身改寫觸發 MESSAGE_UPDATED → onMessageInvalidated 誤砍本則剛存的 patch
            try {
                await win.TavernHelper.setChatMessages([{ message_id: arrIdx, message: next, mes: next }], { refresh: 'affected' });
            } finally {
                setTimeout(() => { _selfEditing = false; }, 2500);   // 事件可能 async → 留窗口再解旗標
            }
            console.log('🛰️ [State Runtime] 開頭設置補救：補回 ' + inject.join(' '));
        } catch (e) { console.warn('[State Runtime] 開頭設置補救失敗:', e?.message || e); }
    }

    // --- 事件監聽 ---
    function init() {
        if (!win.eventOn || !win.tavern_events) {
            setTimeout(init, 1000);
            return;
        }

        // 主模型生成完 → 防抖後抽
        win.eventOn(win.tavern_events.GENERATION_ENDED, () => {
            console.log('[State Runtime] 🔎 GENERATION_ENDED fired，SUMMARIZING=' + !!win.__AURELIA_SUMMARIZING);   // 診斷：抽取的事件是否落在旗標窗內
            if (win.__AURELIA_SUMMARIZING) return;   // 🚫 大總結的 generateRaw 也會發 GENERATION_ENDED → 別抽，否則重複 AVS/記憶/場景生圖
            // 🎯 獨立插圖副模型：獨立於狀態系統(AVS)，狀態關著也能跑 → 在 isEnabled 檢查前排程；函式自己看開關
            clearTimeout(_sceneDebounce);
            _sceneDebounce = setTimeout(extractScenesStandalone, CONFIG.debounceMs + 600);
            // 開頭設置補救(Bg/BGM)：獨立於狀態系統，狀態關著也修 → 排在 isEnabled gate 前；自己看 vn_fix_opening 開關
            clearTimeout(_repairDebounce);
            _repairDebounce = setTimeout(() => { if (!_genStopped && !win.__AURELIA_SUMMARIZING) _repairOpeningSettings(); }, CONFIG.debounceMs + 900);
            if (!isEnabled()) return;
            clearTimeout(_debounceTimer);
            _debounceTimer = setTimeout(extractOnce, CONFIG.debounceMs);
        });

        // 主模型開始生成 → inject current 給它看（state 摘要）+ inject AVS rules（行為規範）
        if (win.tavern_events.GENERATION_STARTED) {
            win.eventOn(win.tavern_events.GENERATION_STARTED, (type, opts, dryRun) => {
                if (dryRun) return;   // 🚫 dryRun=酒館試算prompt/數token的空跑、非真生成 → 別注入(once 會被空跑那趟吃掉、真生成反而沒有)
                _genStopped = false;  // 新一輪真生成開始 → 清掉上輪的「手動停止」旗標
                console.log('[State Runtime] 🔎 GENERATION_STARTED fired，SUMMARIZING=' + !!win.__AURELIA_SUMMARIZING);   // 診斷
                if (win.__AURELIA_SUMMARIZING) return;   // 🚫 大總結生成不是劇情輪 → 別注入 state/rules
                // state 摘要受「即時抽取總開關」控制
                if (isEnabled()) injectCurrent();
                // AVS rules 永遠評估（不受抽取開關影響；沒命中規則就不 inject）
                injectRules();
                // 缺頭像提醒（永遠評估；一個都不缺就不 inject）
                injectAvatarReminder();
            });
        }

        // 手動停止生成（按下停止鈕）→ 標記本通被截：GENERATION_ENDED 仍會發、debounce 後 extractOnce/場景照排，
        //    但兩者入口會看這旗標 return，不拿半截/思考期正文白燒副模型。下一輪 GENERATION_STARTED 自動清旗標。
        if (win.tavern_events.GENERATION_STOPPED) {
            win.eventOn(win.tavern_events.GENERATION_STOPPED, () => {
                _genStopped = true;
                console.log('🛰️ [State Runtime] 偵測到手動停止生成 → 本通副模型(AVS/記憶/場景)全部跳過');
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
                try { _lastAvatarUninject?.(); _lastAvatarUninject = null; } catch(e) {}
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
        forceExtract, clearPatches, deepConsolidate,
        injectCurrent, injectRules, extractOnce,
        repairOpeningSettings: _repairOpeningSettings,   // 手動補一次開頭 Bg/BGM（測試/救援用）
        compressOldMemories,   // 🗜️ 記憶合併壓縮（治長線過載），給 os_avs_memory 整理鈕呼叫
        listAllStateData, removeStateData,
        normalizeChatId,
        getActiveSchema,   // V2：schema 從 AVS 變數包合併（給 status_panel 等外部 UI 用）
        getLastExtract: () => _lastExtract,   // 最近一次抽取(原始輸出+updates+current) 給狀態面板診斷/複製
        getStateDataDump: async () => { try { const cid = getChatId(); return (cid && win.OS_DB?.getStateData) ? await win.OS_DB.getStateData(cid) : null; } catch(e) { return null; } },  // 持久化的 patches/base/current 給診斷
        CONFIG
    };

    // 啟動時跑 migration（fire-and-forget）
    runMigration();

    init();
})();
