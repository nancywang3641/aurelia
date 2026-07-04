// ----------------------------------------------------------------
// [檔案] npc_dossier.js (V1 - NPC 長期人物檔案：群像卡防失憶)
// 路徑：os_phone/rpg/npc_dossier.js
// 職責：
// 1. 登場記帳：每輪抽取時掃 [Char|名] 標籤，程式自己數每個角色登場幾次（0 API）
// 2. 建檔搭便車：登場 ≥2 次的回頭客 → 附進 state_runtime 那通副模型，同一個 JSON 多吐 "npc_files"
// 3. 名冊+檔案注入：GENERATION_STARTED 時常駐注入「人物名冊」(一行索引)；
//    最近劇情有提到名字的角色 → 加注完整檔案（名字觸發、不在場不佔字）
// 治的病：群像卡/世界卡隨機 NPC 幾百輪後再登場被當陌生人——語意向量召回對「同名精準命中」
// 先天吃虧，這裡用實體(名字)索引補上。隱藏開關 localStorage sp_npc_dossier=0 可關，預設開。
// 資料存 OS_DB state_data(chatId) 的 npcLedger / npcDossiers 欄位（CHAT_DELETED 自動跟著清）。
// ----------------------------------------------------------------
(function() {
    console.log('📇 [NPC Dossier] V1 載入');
    const win = window.parent || window;

    const CONFIG = {
        flagKey: 'sp_npc_dossier',   // =0 關，預設開
        injectId: 'aurelia_npc_dossier',
        minAppearances: 2,           // 登場次數達標才建檔（一次性路人自然淡出，這是正確行為）
        maxFilesPerRound: 4,         // 一輪最多建/更新幾份檔案（綁住副模型輸出預算）
        refreshGrowth: 5,            // 建檔後又登場 N 次 → 檔案該增修了
        maxInjectFull: 6,            // 每輪最多注入幾份完整檔案
        maxRoster: 40,               // 名冊行數上限（按最近登場排序，超過的最舊淡出名冊）
        fileMaxLen: 400,             // 單份檔案存檔硬上限（字元）
        hookMaxLen: 20,              // 名冊鉤子上限
        scanMsgs: 3                  // 注入端掃最近幾則找「被提到的名字」（含用戶剛打的那句）
    };

    function _isOn() { return localStorage.getItem(CONFIG.flagKey) !== '0'; }

    function _normChatId(raw) {
        if (!raw) return '';
        let s = String(raw).split(/[\\/]/).pop() || '';
        return s.replace(/\.jsonl?$/i, '').trim();
    }
    function _getChatId() {
        try { return _normChatId(win.SillyTavern?.getContext?.()?.chatId); } catch (e) { return ''; }
    }
    function _userName() {
        try { return String(win.SillyTavern?.getContext?.()?.name1 || '').trim(); } catch (e) { return ''; }
    }

    // 從正文抓 [Char|名]：跳過 {代號} / *心聲* / 明顯非人名（過長、佔位符）；主角本人不建檔
    function _charNamesIn(text) {
        const out = new Set();
        if (!text) return out;
        const me = _userName();
        const re = /\[Char\|([^|\]\n]+)/g; let m;
        while ((m = re.exec(String(text))) !== null) {
            const n = (m[1] || '').trim();
            if (!n || n.length > 20) continue;
            const c0 = n.charAt(0);
            if (c0 === '{' || c0 === '*' || c0 === '#') continue;
            if (n === '旁白' || n === '系統') continue;
            if (me && n === me) continue;
            out.add(n);
        }
        return out;
    }

    // ── 1+2. 建檔前置（state_runtime.extractOnce 在組 prompt 時呼叫）──────────
    // 讀 state_data → 更新登場記帳（純程式、0 API）→ 挑「該建/該修檔案」的候選 → 回 prompt 附加塊。
    // 這裡不寫 DB：帳與檔案由 commit() 在狀態存檔「之後」一次寫入，避免被 extractOnce 的舊 data spread 蓋掉。
    async function prepare(chatId, lastContent, lastId) {
        try {
            if (!_isOn() || !chatId || !win.OS_DB?.getStateData) return null;
            const present = _charNamesIn(lastContent);
            if (!present.size) return null;

            const data = (await win.OS_DB.getStateData(chatId)) || {};
            const ledger = data.npcLedger ? JSON.parse(JSON.stringify(data.npcLedger)) : { lastMsgId: -1, chars: {} };
            const dossiers = data.npcDossiers || {};

            // 記帳：同一樓只數一次（swipe 重抽不灌水）；lastId 比記錄小 = 懶載窗口重排 → 接受並覆蓋基準
            if (lastId >= 0 && lastId !== ledger.lastMsgId) {
                for (const name of present) {
                    const c = ledger.chars[name] || { n: 0, firstAt: Date.now() };
                    c.n = (c.n || 0) + 1;
                    c.lastAt = Date.now();
                    ledger.chars[name] = c;
                }
                ledger.lastMsgId = lastId;
            }

            // 候選：本輪在場 + 登場達標 + （沒檔案 或 建檔後又累積了夠多戲份）；新建優先於增修
            const fresh = [], stale = [];
            for (const name of present) {
                const n = ledger.chars[name]?.n || 0;
                if (n < CONFIG.minAppearances) continue;
                const d = dossiers[name];
                if (!d) fresh.push({ name, n, mode: 'new' });
                else if (n - (d.nAtUpdate || 0) >= CONFIG.refreshGrowth) stale.push({ name, n, mode: 'update', old: d });
            }
            const candidates = fresh.concat(stale).slice(0, CONFIG.maxFilesPerRound);

            let block = null;
            if (candidates.length) {
                const list = candidates.map(c => c.mode === 'new'
                    ? `・${c.name}（第${c.n}次登場・尚無檔案 → 新建）`
                    : `・${c.name}（第${c.n}次登場・已有檔案 → 增修。舊檔案：${String(c.old.file || '').trim()}）`
                ).join('\n');
                block = `

═══════════════════════════════════════
【★ 兼任「人物檔案管理員」→ 放進同一個 JSON 的 "npc_files" 欄位】
下列角色已多次登場，屬於會回頭的長期人物，需要建立或更新「長期人物檔案」。檔案的用途：這個角色即使幾百輪後再登場，也能靠檔案還原人設與往事，不會被當成陌生人。
待處理名單：
${list}
檔案撰寫規則：
- 每份 120~200 字，必含：①身分、與主角的關係 ②初遇（何時何地怎麼認識；一經寫定永不改動）③至今的重要往事（按時間先後；增修時把舊檔案內容合併保留、只融入新事件）④性格與說話特徵 ⑤最後一次見面時的情境。
- 每份另給 "hook"：15 字內的一句話身分鉤子（給人物名冊索引用）。
- 只寫劇情裡真實發生過的事，嚴禁編造；舊檔案的初遇與既有事實必須原樣保留。
- 只處理待處理名單裡的角色，別自行加人。
格式： "npc_files": [ { "name": "待處理名單裡的角色名", "hook": "一句話身分", "file": "檔案內文" } ]`;
            }
            return { chatId, ledger, candidates, block };
        } catch (e) {
            console.warn('[NPC Dossier] prepare 失敗:', e?.message || e);
            return null;
        }
    }

    // ── 落帳 + 收檔案（extractOnce 在狀態存檔後呼叫；副模型沒吐 npc_files 也要落帳）──
    async function commit(handle, files) {
        try {
            if (!handle || !handle.chatId || !win.OS_DB?.saveStateData) return;
            const data = (await win.OS_DB.getStateData(handle.chatId)) || {};
            const dossiers = { ...(data.npcDossiers || {}) };
            const allowed = new Map((handle.candidates || []).map(c => [c.name, c]));
            let saved = 0;
            for (const f of (Array.isArray(files) ? files : [])) {
                if (!f || !f.name) continue;
                const name = String(f.name).trim();
                const cand = allowed.get(name);            // 只收待處理名單裡的，AI 亂加人不收
                if (!cand) continue;
                const text = String(f.file || '').trim();
                if (text.length < 40) continue;            // 太短=沒寫好，別拿去蓋舊檔
                const old = dossiers[name];
                dossiers[name] = {
                    hook: String(f.hook || '').trim().slice(0, CONFIG.hookMaxLen) || (old?.hook || ''),
                    file: text.slice(0, CONFIG.fileMaxLen),
                    nAtUpdate: cand.n,
                    createdAt: old?.createdAt || Date.now(),
                    updatedAt: Date.now()
                };
                saved++;
            }
            await win.OS_DB.saveStateData(handle.chatId, { ...data, npcLedger: handle.ledger, npcDossiers: dossiers });
            if (saved) console.log(`📇 [NPC Dossier] 本輪建/修 ${saved} 份人物檔案，累計 ${Object.keys(dossiers).length} 份`);
        } catch (e) {
            console.warn('[NPC Dossier] commit 失敗:', e?.message || e);
        }
    }

    // ── 3. 注入：名冊常駐 + 名字命中的完整檔案 ─────────────────────────────
    let _lastUninject = null;

    async function injectDossiers() {
        try {
            try { _lastUninject?.(); } catch (e) {}
            _lastUninject = null;
            if (!_isOn() || !win.TavernHelper?.injectPrompts) return;
            const chatId = _getChatId();
            if (!chatId || !win.OS_DB?.getStateData) return;
            const data = await win.OS_DB.getStateData(chatId);
            const dossiers = data?.npcDossiers;
            if (!dossiers || !Object.keys(dossiers).length) return;
            const chars = data?.npcLedger?.chars || {};

            // 最近幾則正文（含用戶剛送出的那句「去找某人」）→ 名字命中 = 該角色本輪相關
            let recentText = '';
            try {
                const ctx = win.SillyTavern?.getContext?.();
                if (ctx && Array.isArray(ctx.chat)) {
                    recentText = ctx.chat.slice(-CONFIG.scanMsgs).filter(m => m && !m.is_system)
                        .map(m => m.mes || m.message || '').join('\n');
                }
            } catch (e) {}

            const byRecency = Object.keys(dossiers)
                .sort((a, b) => (chars[b]?.lastAt || 0) - (chars[a]?.lastAt || 0));
            const mentioned = recentText
                ? byRecency.filter(n => recentText.indexOf(n) !== -1).slice(0, CONFIG.maxInjectFull)
                : [];
            const rosterNames = byRecency.slice(0, CONFIG.maxRoster);

            const rosterLines = rosterNames.map(n => {
                const d = dossiers[n];
                const cnt = chars[n]?.n;
                return `・${n}｜${d.hook || '（無簡介）'}${cnt ? `（登場${cnt}次）` : ''}`;
            }).join('\n');
            const parts = [
                `<人物名冊 規則="本故事登場過的人物索引·唯讀·嚴禁複述">\n以下人物在本故事登場過、有既定人設與往事。劇情再次提到或主角尋訪他們（含用暱稱、身分代稱間接提到）時，必須沿用名冊與其檔案，嚴禁當成初次見面的新角色、嚴禁另編一個同名新人。\n${rosterLines}\n</人物名冊>`
            ];
            if (mentioned.length) {
                const fileLines = mentioned.map(n => `【${n}】${dossiers[n].file}`).join('\n');
                parts.push(`<人物檔案 規則="本輪相關人物的長期檔案·權威·寫作不得矛盾">\n${fileLines}\n</人物檔案>`);
            }

            const result = win.TavernHelper.injectPrompts([{
                id: CONFIG.injectId,
                content: parts.join('\n'),
                position: 'in_chat',
                depth: 1,
                role: 'system'
            }], { once: true });
            _lastUninject = result?.uninject || null;
            console.log(`📇 [NPC Dossier] 注入：名冊 ${rosterNames.length} 人` + (mentioned.length ? `＋完整檔案 [${mentioned.join('、')}]` : '（本輪無名字命中）'));
        } catch (e) {
            console.warn('[NPC Dossier] 注入失敗:', e?.message || e);
        }
    }

    // ── 事件接線 ───────────────────────────────────────────────────────
    function init() {
        if (!win.eventOn || !win.tavern_events) { setTimeout(init, 1000); return; }
        if (win.tavern_events.GENERATION_STARTED) {
            win.eventOn(win.tavern_events.GENERATION_STARTED, (type, opts, dryRun) => {
                if (dryRun) return;   // 🚫 dryRun 空跑會吃掉 once 注入，真生成反而沒有
                if (win.__AURELIA_SUMMARIZING) return;
                injectDossiers();
            });
        }
        if (win.tavern_events.CHAT_CHANGED) {
            win.eventOn(win.tavern_events.CHAT_CHANGED, () => {
                try { _lastUninject?.(); _lastUninject = null; } catch (e) {}
            });
        }
        console.log('📇 [NPC Dossier] Ready');
    }

    win.OS_NPC_DOSSIER = {
        prepare, commit, injectDossiers,
        isOn: _isOn,
        // 診斷/管理用：撈當前卡全部檔案與登場帳
        dump: async () => {
            const cid = _getChatId();
            if (!cid || !win.OS_DB?.getStateData) return null;
            const d = await win.OS_DB.getStateData(cid);
            return { chatId: cid, ledger: d?.npcLedger || null, dossiers: d?.npcDossiers || null };
        },
        CONFIG
    };

    init();
})();
