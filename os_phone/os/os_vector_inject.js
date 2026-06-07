// ----------------------------------------------------------------
// [檔案] os_vector_inject.js (V1)
// 路徑：os_phone/os/os_vector_inject.js
// 職責：酒館版「向量記憶召回」注入器。
//       PWA 端的記憶召回寫在 os_api_engine._buildStandaloneContext（已有）；
//       但酒館 VN 走 SillyTavern 原生生成，不經過那段 → 改用 injectPrompts 在每輪生成前塞。
//       做法完全照 os_phone/rpg/blacklist_injector.js：
//         GENERATION_STARTED → search 相關記憶 → injectPrompts({once:true})
//       只在「酒館（非獨立）+ 記憶開啟」時跑；PWA 不碰（避免重複召回）。
// 依賴：window.OS_VECTOR_ENGINE.search/isEnabled、window.TavernHelper.injectPrompts/getChatMessages
//       window.VN_Core._currentStoryId / window.OS_AVS_ADAPTER.getStoryId
// ----------------------------------------------------------------
(function () {
    'use strict';
    console.log('🧠 [Vector Memory Injector] 載入');
    const win = window.parent || window;

    const INJECT_ID = 'aurelia_vn_memory';
    let _lastUninject = null;
    let _lastRecall = null;   // 給 CTX 面板「記憶召回」行讀：{ text, count }
    let _pendingRecallKeywords = [];   // 主模型上一輪 <recall> 點名、待下一輪載入完整內文的關鍵詞
    const _RECALL_RE = /<recall>([\s\S]*?)<\/recall>/gi;

    // 抽出 AI 回覆裡的 <recall>關鍵詞</recall> → 存給下一輪 injectMemories 補完整內文；並把標籤從顯示訊息清掉。
    // 回傳清過 <recall> 的內文(給後續 ingest，避免把標籤記成記憶)。
    async function _captureAndStripRecall(content) {
        try {
            const kws = [];
            let mt; _RECALL_RE.lastIndex = 0;
            while ((mt = _RECALL_RE.exec(content)) !== null) {
                String(mt[1] || '').split(/[,，、\s]+/).forEach((k) => { k = k.trim(); if (k) kws.push(k); });
            }
            if (!kws.length) return content;        // 沒有 <recall> → 原樣返回
            _pendingRecallKeywords = Array.from(new Set(kws)).slice(0, 12);
            console.log('🧠 [Recall] 主模型點名、下一輪載入細節:', _pendingRecallKeywords.join('、'));
            // 從顯示訊息清掉 <recall>…</recall>（用陣列索引 chat.length-1 改，避開懶載入真樓號越界）
            const cleaned = content.replace(/\s*<recall>[\s\S]*?<\/recall>\s*/gi, '\n').trim();
            if (cleaned !== content) {
                try {
                    const ctx = win.SillyTavern?.getContext?.();
                    const arrIdx = (ctx && Array.isArray(ctx.chat)) ? ctx.chat.length - 1 : -1;
                    if (arrIdx >= 0 && win.TavernHelper?.setChatMessages) {
                        await win.TavernHelper.setChatMessages([{ message_id: arrIdx, message: cleaned, mes: cleaned }], { refresh: 'affected' });
                    }
                } catch (e) {}
            }
            return cleaned;
        } catch (e) { console.warn('[Recall] capture 失敗:', e?.message || e); return content; }
    }

    function _storyId() {
        return (win.VN_Core && win.VN_Core._currentStoryId)
            || win.OS_AVS_ADAPTER?.getStoryId?.()
            || localStorage.getItem('vn_current_story_id') || '';
    }

    // 召回不開副模型「挑」(省一通)：只把「全部記憶的 tags 關鍵詞索引」注入主模型(不丟完整內文)，
    // 且索引會過濾(剔泛用 tag、同主題去重)，主模型看得到全部主題→不漏，但 prompt 大幅縮水(原本丟 90 字內文×244 條 → 爆 1.1 萬 token)。
    // 需要某條完整內容時主模型用 <recall>關鍵詞</recall> 點名，下一輪補上(見 _captureAndStripRecall)。
    const MEM_TAG_MAX = 6;       // 每條最多列幾個 tag
    const MEM_FALLBACK_MAX = 30; // 無 tag 的記憶才退回極短內文，幾字以內

    async function injectMemories() {
        try {
            // 撤上次（避免疊加 / 切 chat 殘留）
            try { _lastUninject?.(); } catch (e) {}
            _lastUninject = null;
            _lastRecall = null;   // 每輪先歸零；成功召回才填回（給 CTX 面板顯示）

            // 正在跑大總結（os_story_tools 的 generateRaw）→ 別把記憶召回摻進總結 prompt
            if (win.__AURELIA_SUMMARIZING) return;

            // 只在酒館跑；PWA 走 buildContext 已有召回
            if (win.OS_API?.isStandalone?.()) return;
            if (!win.TavernHelper?.injectPrompts) return;
            if (win.OS_VECTOR_ENGINE?.isEnabled?.() !== true) return;

            const storyId = _storyId();
            if (!storyId) return;                 // 沒有當前 VN 故事就不注入
            if (!win.OS_DB?.getAllVnMemories) return;

            const all = (await win.OS_DB.getAllVnMemories(storyId)) || [];
            if (!all.length) return;
            all.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));   // 時序穩定(舊→新)

            // 索引要「濾過」才有用：raw tags 大量重複(主角名幾乎每條都有=噪音、同主題的行一再出現)。
            // 兩道過濾 → ①剔除「幾乎每條都出現」的泛用 tag(主角/常駐地點)，開頭只點一次
            //           ②依剩餘 tag 集合去重(同主題多條塌成一行；該主題完整內容仍可 <recall> 撈回)
            const facts = all.filter(m => m.type !== 'dialogue');
            const voice = all.filter(m => m.type === 'dialogue');

            // 統計 fact tag 出現次數 → 找出泛用 tag(≥半數記憶都有)
            const _freq = {};
            facts.forEach(m => Array.from(new Set((m.tags || []).filter(Boolean))).forEach(t => { _freq[t] = (_freq[t] || 0) + 1; }));
            const _ubiqMin = Math.max(4, Math.ceil(facts.length * 0.5));
            const ubiq = Object.keys(_freq).filter(t => _freq[t] >= _ubiqMin);
            const ubiqSet = new Set(ubiq);

            // 逐條：剔泛用 tag → 取識別性 tag → 依「tag 集合」去重(同主題只留一行)
            const _seen = new Set();
            const factLines = [];
            facts.forEach(m => {
                let tags = (m.tags || []).filter(Boolean).filter(t => !ubiqSet.has(t)).slice(0, MEM_TAG_MAX);
                if (tags.length) {
                    const key = tags.slice().sort().join('|');
                    if (_seen.has(key)) return; _seen.add(key);
                    factLines.push('・' + tags.join('、'));
                } else {                                   // 整條只剩泛用 tag → 退回極短內文當識別
                    let t = String(m.text || '').replace(/\s+/g, ' ').trim();
                    if (t.length > MEM_FALLBACK_MAX) t = t.slice(0, MEM_FALLBACK_MAX) + '…';
                    if (!t) return;
                    const key = 'T:' + t;
                    if (_seen.has(key)) return; _seen.add(key);
                    factLines.push('・' + t);
                }
            });

            // 語氣記憶的 tag 幾乎只有角色名 → 收斂成「有語氣樣本的角色」一行(要範例就 <recall> 角色名)
            const voiceNames = Array.from(new Set(voice.flatMap(m => (m.tags || []).filter(Boolean))));

            let block = `[記憶索引｜下列每行是一段「過往已發生記憶」的關鍵詞(同主題已合併)，提醒你這些事都發生過：寫作時保持連貫、勿與之矛盾，需要細節時依關鍵詞 <recall> 回想]\n`;
            if (ubiq.length) block += `（貫穿全篇、幾乎每條都有的主體，下面不再重複列出：${ubiq.join('、')}）\n`;
            block += factLines.join('\n');
            if (voiceNames.length) {
                block += `\n\n【角色語氣索引｜下列角色有語氣/說話樣本，需要某角色的說話風格範例就 <recall> 其名】\n・${voiceNames.join('、')}`;
            }

            // ── 主模型上一輪 <recall> 點名的記憶 → 這一輪補完整內文（細節晚一輪到，不多通 API）──
            if (_pendingRecallKeywords.length) {
                const kws = _pendingRecallKeywords.map(k => k.toLowerCase());
                const hit = all.filter(m => {
                    const hay = ((m.tags || []).join(' ') + ' ' + (m.text || '')).toLowerCase();
                    return kws.some(k => k && hay.includes(k));
                }).slice(0, 8);
                if (hit.length) {
                    block += `\n\n【點名記憶細節｜你上一輪用 <recall> 要求回想的記憶，完整內容如下，務必據此保持連貫】\n`;
                    block += hit.map(m => {
                        let t = String(m.text || '').replace(/\s+/g, ' ').trim();
                        if (t.length > 300) t = t.slice(0, 300) + '…';
                        return `・${t}`;
                    }).join('\n');
                }
                _pendingRecallKeywords = [];   // 消費掉；要持續帶細節就靠主模型下一輪再 <recall>
            }

            // ── 教主模型怎麼把「索引」變「細節」（細節晚一輪到）──
            block += `\n\n[記憶用法｜上面只有關鍵詞、沒有細節。若這段劇情需要某條記憶的完整內容，請在回覆最後、</content> 之外，加一行 <recall>關鍵詞</recall>（多個關鍵詞用、或逗號隔開）。系統會在下一輪把那幾條的完整內容補給你。這行不會顯示給讀者，切勿寫進 <content> 內。]`;

            const result = win.TavernHelper.injectPrompts([{
                id: INJECT_ID,
                content: block.trim(),
                position: 'in_chat',
                depth: 1,
                role: 'system'
            }], { once: true });
            _lastUninject = result?.uninject || null;
            _lastRecall = { text: block.trim(), count: all.length };   // 給 CTX 面板「記憶召回」行
            console.log(`🧠 [Vector Memory Injector] 注入記憶 tags 索引 ${all.length} 條（只丟關鍵詞、不丟內文，prompt 大幅縮水）`);
        } catch (e) {
            console.warn('[Vector Memory Injector] 失敗:', e?.message || e);
        }
    }

    // ── 酒館原生生成結束 → 直接 ingest（酒館不走 saveVnChapter，VN_CHAPTER_SAVED 不會發，
    //    所以這裡補上：拿剛生成的 AI 劇情丟給引擎提取記憶）──
    let _lastIngestSig = null;
    let _pendingMemory = null;   // 結合觸發：狀態系統開著時，待 state_runtime 那通副模型一起抽的記憶內容
    async function ingestLatest() {
        try {
            if (win.__AURELIA_SUMMARIZING) return;                     // 大總結生成不是劇情，別記成記憶
            if (win.OS_API?.isStandalone?.()) return;                 // 酒館 only（PWA 走 saveVnChapter→VN_CHAPTER_SAVED）
            if (win.OS_VECTOR_ENGINE?.isEnabled?.() !== true) return;
            if (typeof win.OS_VECTOR_ENGINE?.ingest !== 'function') return;
            const storyId = _storyId();
            if (!storyId) return;
            if (!win.TavernHelper?.getChatMessages) return;

            const last = await win.TavernHelper.getChatMessages(-1);
            if (!last || !last[0]) return;
            const m = last[0];
            if (m.is_user) return;                                     // 只記 AI 回覆
            const id = String(m.message_id ?? m.id ?? '');
            let content = (m.message || m.mes || m.content || '').trim();
            if (!content) return;
            // 主模型若用 <recall> 點名要回想的記憶 → 記下關鍵詞(下一輪補完整內文)，並把標籤從訊息清掉(不顯示給讀者)
            content = await _captureAndStripRecall(content);
            // 只記「VN 劇情」回覆 —— 認 <content> 標籤即可（它裡面就是全文）；
            // 不依賴 [Chapter|/[Story| 等特定 tag（用戶 tag 很多又持續新增，照 tag 走會漏）。
            if (!/<content>[\s\S]*?<\/content>/i.test(content)) return;

            // 去重用「內容簽章」而非只看 id：同則同內容才跳過；重 roll/重生換了內容 → 重新記
            // （ingest 端會先清掉同一則(id)的舊記憶再寫新的 → 自動替換、不殘留舊分支）
            const sig = id + '#' + content.length + '#' + content.slice(0, 40);
            if (sig === _lastIngestSig) return;
            _lastIngestSig = sig;
            const cid = id || ('msg_' + Date.now());
            // 結合觸發：狀態系統開著 → 把該記的內容掛成 pending，交給 state_runtime 那一通副模型一起抽(每回合省一通)；
            //           狀態系統沒開 → 照舊自己抽一通(降級不變)。
            if (win.OS_STATE_RUNTIME?.isEnabled?.()) {
                _pendingMemory = { content, storyId, chapterId: cid };
            } else {
                win.OS_VECTOR_ENGINE.ingest(content, storyId, cid);
            }
        } catch (e) { console.warn('[Vector Memory Injector] ingestLatest 失敗:', e?.message || e); }
    }

    function init() {
        if (!win.eventOn || !win.tavern_events) { setTimeout(init, 1000); return; }
        if (win.tavern_events.GENERATION_STARTED) win.eventOn(win.tavern_events.GENERATION_STARTED, injectMemories);
        if (win.tavern_events.GENERATION_ENDED) win.eventOn(win.tavern_events.GENERATION_ENDED, ingestLatest);
        // 刪訊息 → 自動清掉那一則的記憶（記憶跟著現存劇情走，不用手動管）
        if (win.tavern_events.MESSAGE_DELETED) win.eventOn(win.tavern_events.MESSAGE_DELETED, (mesId) => {
            try {
                if (win.OS_API?.isStandalone?.()) return;
                const id = (mesId !== undefined && mesId !== null) ? String(mesId) : '';
                if (id && win.OS_DB?.deleteVnMemoriesByChapter) win.OS_DB.deleteVnMemoriesByChapter(id, _storyId());
            } catch (e) {}
        });
        if (win.tavern_events.CHAT_CHANGED) win.eventOn(win.tavern_events.CHAT_CHANGED, () => { try { _lastUninject?.(); _lastUninject = null; } catch (e) {} _lastIngestSig = null; _lastRecall = null; _pendingRecallKeywords = []; });
        console.log('🧠 [Vector Memory Injector] Ready（召回 + 酒館 ingest）');
    }

    win.OS_VECTOR_INJECT = {
        injectMemories, ingestLatest,
        get _lastRecall() { return _lastRecall; },
        // 結合觸發：state_runtime 取走待處理記憶內容(取走即清，避免重複)
        consumePendingMemory() { const p = _pendingMemory; _pendingMemory = null; return p; },
        hasPendingMemory() { return !!_pendingMemory; },
    };
    init();
})();
