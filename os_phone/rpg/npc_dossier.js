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
//
// 🔀 雙版：記帳/建檔規則/檔案資料完全共用，差在「誰餵正文、誰負責注入」──
//   酒館：state_runtime 那通副模型搭便車建檔（prepare→commit）＋ GENERATION_STARTED injectPrompts
//   PWA ：VN_CHAPTER_SAVED → 自己打一通副模型建檔；注入由 _buildStandaloneContext 的
//         npc_dossier 那一格取 buildBlock() 塞進 messages（PWA 沒有 injectPrompts）
//   分艙鑰匙一律走 OS_AVS_ADAPTER（酒館 chatId／PWA storyId）。
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
    function _isStandalone() {
        try { return !!win.OS_API?.isStandalone?.(); } catch (e) { return false; }
    }
    // 分艙鑰匙：酒館＝chatId、PWA＝storyId。一律走 adapter，自己寫 fallback 會在 PWA 拿到假鑰匙。
    function _getChatId() {
        try {
            if (win.OS_AVS_ADAPTER?.getStoryId) return String(win.OS_AVS_ADAPTER.getStoryId() || '');
            return _normChatId(win.SillyTavern?.getContext?.()?.chatId);
        } catch (e) { return ''; }
    }
    function _userName() {
        try {
            const n = String(win.SillyTavern?.getContext?.()?.name1 || '').trim();
            if (n) return n;
        } catch (e) {}
        try { return String(win.OS_API?.getGlobalUserName?.() || '').trim(); } catch (e) { return ''; }
    }
    // PWA：當前故事的章節（新→舊 由 getAllVnChapters 給，這裡轉成舊→新）
    async function _pwaChapters() {
        try {
            if (!win.OS_DB?.getAllVnChapters) return [];
            const sid = _getChatId();
            const all = await win.OS_DB.getAllVnChapters();
            const mine = sid ? all.filter(ch => ch.storyId === sid) : all.filter(ch => !ch.storyId);
            return mine.slice().reverse();   // 舊 → 新，索引＝「樓號」
        } catch (e) { return []; }
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

    // ── 2.5 對帳：正文才是底本，檔案跟著正文走 ──────────────────────────────
    // 🚨 這個模組原本只有寫入路徑（prepare 累加登場數、commit 寫檔案），沒有任何回收：
    //    刪正文／重生／swipe 一律不影響 DB。名冊又是「無條件全塞」（不看有沒有被提到），
    //    所以刪光某角色的正文、重新生成，AI 照樣從名冊看到他 → 又寫一次 → 越滾越多。
    //    而且 lastMsgId 只防同樓重複計數，刪樓後樓號往前，重生一次就再記一次登場。
    // 做法：重掃全檔的 [Char|名] → 正文裡沒有的角色，檔案與帳一起移除；
    //      登場次數也用「實際出現的樓數」重算，不再是只增不減的計數器。
    async function reconcile(tag, corpusList) {
        try {
            if (!_isOn()) return;
            const chatId = _getChatId();
            if (!chatId || !win.OS_DB?.getStateData) return;
            const data = await win.OS_DB.getStateData(chatId);
            if (!data) return;
            const dossiers = data.npcDossiers || {};
            const chars = data.npcLedger?.chars || {};
            if (!Object.keys(dossiers).length && !Object.keys(chars).length) return;

            // 指定底本模式（VN回朔）：呼叫方直接給「還活著的章節正文」陣列當唯一真相，
            // 不掃酒館聊天檔——VN 回朔刪的是 DB 章節，酒館樓層可能還留著舊文，掃它會把該死的角色救回來
            const _hasCorpus = Array.isArray(corpusList);
            let msgs = null;
            if (_hasCorpus) {
                msgs = corpusList.map(t => ({ message: String(t || '') }));
            } else if (_isStandalone()) {
                // PWA 沒有聊天樓：底本＝當前故事的章節（正文才是唯一真相，跟酒館同語意）
                const chs = await _pwaChapters();
                msgs = chs.map(ch => ({ message: String(ch.content || '') }));
                if (!msgs.length) {
                    console.warn(`📇 [NPC Dossier] 對帳(${tag})：讀不到章節 → 不動`);
                    return;
                }
            } else {
                try { msgs = await win.VN_READER?.fetchFullChat?.(); } catch (e) {}
                if (!Array.isArray(msgs) || !msgs.length) {
                    console.warn(`📇 [NPC Dossier] 對帳(${tag})：讀不到完整聊天檔 → 不動`);
                    return;
                }
            }

            // 逐樓重算：n＝該名字出現過的樓數（跟原本「一樓算一次」同語意）
            const nowChars = {};
            for (const m of msgs) {
                if (!m || m.is_user || m.role === 'user') continue;
                for (const name of _charNamesIn(m.message || m.mes || '')) {
                    const c = nowChars[name] || { n: 0, firstAt: chars[name]?.firstAt || Date.now() };
                    c.n++;
                    c.lastAt = chars[name]?.lastAt || Date.now();
                    nowChars[name] = c;
                }
            }

            // 🛡️ 保命閘：全檔掃不到任何角色、但原本有一堆檔案 → 十之八九讀到殘缺檔，寧可不動
            //    （指定底本模式不設閘：呼叫方給的就是全部真相——回朔到零章節＝角色本來就該全清）
            if (!_hasCorpus && !Object.keys(nowChars).length && Object.keys(dossiers).length) {
                console.warn(`📇 [NPC Dossier] 對帳(${tag})：全檔掃不到任何 [Char|]、但有 ${Object.keys(dossiers).length} 份檔案 → 疑似殘缺聊天檔，不動`);
                return;
            }

            const dead = Object.keys(dossiers).filter(n => !nowChars[n]);
            const sameCount = Object.keys(chars).length === Object.keys(nowChars).length
                && Object.keys(nowChars).every(n => chars[n] && chars[n].n === nowChars[n].n);
            if (!dead.length && sameCount) return;   // 沒變化就別寫 DB

            const nextDossiers = {};
            for (const n of Object.keys(dossiers)) if (nowChars[n]) nextDossiers[n] = dossiers[n];

            await win.OS_DB.saveStateData(chatId, {
                ...data,
                npcLedger: { lastMsgId: msgs.length - 1, chars: nowChars },
                npcDossiers: nextDossiers
            });
            console.log(`📇 [NPC Dossier] 對帳(${tag})：正文現存 ${Object.keys(nowChars).length} 人`
                + (dead.length ? `，移除已不在正文的檔案 [${dead.join('、')}]` : '，無檔案需移除')
                + `｜登場次數已依正文重算`);
        } catch (e) {
            console.warn('[NPC Dossier] 對帳失敗:', e?.message || e);
        }
    }

    // ── 3. 注入：名冊常駐 + 名字命中的完整檔案 ─────────────────────────────
    let _lastUninject = null;

    // 組注入文字（兩版共用的唯一真相）：recentText＝最近正文＋這次輸入，用來判斷哪些角色本輪相關。
    //   酒館端由 injectDossiers 包成 injectPrompts；PWA 端由 _buildStandaloneContext 當
    //   npc_dossier 那一格 push 進 messages（PWA 沒有 injectPrompts，這層才要拆出來）。
    async function buildBlock(recentText) {
        try {
            if (!_isOn()) return '';
            const chatId = _getChatId();
            if (!chatId || !win.OS_DB?.getStateData) return '';
            const data = await win.OS_DB.getStateData(chatId);
            const dossiers = data?.npcDossiers;
            if (!dossiers || !Object.keys(dossiers).length) return '';
            const chars = data?.npcLedger?.chars || {};

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

            // 🔬 chatId 一起印：查「新聊天室卻冒出舊角色」時，這串直接告訴你檔案是從哪一格 DB 撈的
            console.log(`📇 [NPC Dossier] 名冊 ${rosterNames.length} 人` + (mentioned.length ? `＋完整檔案 [${mentioned.join('、')}]` : '（本輪無名字命中）') + `｜讀自 chatId=${chatId}`);
            return parts.join('\n');
        } catch (e) {
            console.warn('[NPC Dossier] 組注入文字失敗:', e?.message || e);
            return '';
        }
    }

    async function injectDossiers() {
        try {
            try { _lastUninject?.(); } catch (e) {}
            _lastUninject = null;
            if (!win.TavernHelper?.injectPrompts) return;

            // 最近幾則正文（含用戶剛送出的那句「去找某人」）→ 名字命中 = 該角色本輪相關
            let recentText = '';
            try {
                const ctx = win.SillyTavern?.getContext?.();
                if (ctx && Array.isArray(ctx.chat)) {
                    recentText = ctx.chat.slice(-CONFIG.scanMsgs).filter(m => m && !m.is_system)
                        .map(m => m.mes || m.message || '').join('\n');
                }
            } catch (e) {}

            const content = await buildBlock(recentText);
            if (!content) return;

            const result = win.TavernHelper.injectPrompts([{
                id: CONFIG.injectId,
                content,
                position: 'in_chat',
                depth: 1,
                role: 'system'
            }], { once: true });
            _lastUninject = result?.uninject || null;
        } catch (e) {
            console.warn('[NPC Dossier] 注入失敗:', e?.message || e);
        }
    }

    // ── 4. PWA 建檔驅動：酒館靠 state_runtime 那通副模型搭便車，PWA 沒有那條路 ──────
    //   PWA 的「一章寫完」訊號＝ OS_DB.saveVnChapter 發的 VN_CHAPTER_SAVED（向量記憶也接這個）。
    //   收到後：prepare 純程式記帳 → 有待建檔的人才多打一通副模型（沒人達標＝0 API）→ commit。
    let _pwaBusy = false;
    async function _pwaExtract(detail) {
        if (_pwaBusy) return;
        _pwaBusy = true;
        try {
            if (!_isOn() || !_isStandalone()) return;
            const chatId = _getChatId();
            if (!chatId) return;
            const content = String(detail?.content || '');
            if (!content) return;

            // 「樓號」＝這章在本故事章節序列中的位置；重生同一章拿到同一個索引 → 不會灌水登場數
            const chs = await _pwaChapters();
            let idx = chs.findIndex(ch => ch.id === detail?.id);
            if (idx < 0) idx = chs.length - 1;

            const handle = await prepare(chatId, content, idx);
            if (!handle) return;
            if (!handle.candidates?.length) { await commit(handle, null); return; }   // 沒人達標也要落帳

            const files = await _pwaAskFiles(handle, content);
            await commit(handle, files);
        } catch (e) {
            console.warn('[NPC Dossier] PWA 建檔失敗:', e?.message || e);
        } finally { _pwaBusy = false; }
    }

    // 副模型單通：把 prepare 組好的同一份規則（block）當 system，正文當 user，只要 npc_files
    function _pwaAskFiles(handle, content) {
        return new Promise((resolve) => {
            try {
                if (!win.OS_API?.chat) return resolve(null);
                const secCfg = (win.OS_SETTINGS?.getSecondaryConfig?.()) || (win.OS_SETTINGS?.getConfig?.()) || {};
                secCfg._isSecondary = true;
                const sys = '你是「人物檔案管理員」。讀下面的劇情正文，依規則產出 JSON，只輸出 JSON、不要任何說明文字。\n'
                    + '輸出格式：{ "npc_files": [ { "name": "...", "hook": "...", "file": "..." } ] }\n'
                    + String(handle.block || '');
                win.OS_API.chat(
                    [{ role: 'system', content: sys }, { role: 'user', content: content.slice(0, 6000) }],
                    secCfg, null,
                    (text) => {
                        try {
                            const m = String(text || '').match(/\{[\s\S]*\}/);
                            const obj = m ? JSON.parse(m[0]) : null;
                            resolve(Array.isArray(obj?.npc_files) ? obj.npc_files : null);
                        } catch (e) { resolve(null); }
                    },
                    () => resolve(null),
                    { disableTyping: true }
                );
            } catch (e) { resolve(null); }
        });
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
        // 🧾 對帳：正文變動就重算，檔案不再只進不出（刪樓/編輯/swipe 都要跟）
        const _ev = win.tavern_events;
        const _wire = (name, tag) => {
            if (_ev[name]) win.eventOn(_ev[name], () => {
                if (win.__AURELIA_SUMMARIZING) return;
                setTimeout(() => reconcile(tag), 300);   // 讓酒館先把刪除/編輯落地再掃
            });
        };
        _wire('MESSAGE_DELETED', '刪樓');
        _wire('MESSAGE_UPDATED', '編輯');
        _wire('MESSAGE_EDITED', '編輯');
        _wire('MESSAGE_SWIPED', 'swipe');
        console.log('📇 [NPC Dossier] Ready（含正文對帳）');
    }

    // PWA 接線：章節落地就記帳＋建檔（判 isStandalone 放在事件內，載入當下 OS_API 還沒起來）
    win.addEventListener('VN_CHAPTER_SAVED', (e) => {
        if (!_isStandalone()) return;
        setTimeout(() => _pwaExtract(e.detail || {}), 800);   // 讓向量 ingest 先開跑，兩通不互相卡
    });

    win.OS_NPC_DOSSIER = {
        prepare, commit, injectDossiers, reconcile, buildBlock,
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
