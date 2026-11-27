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

    // ── 🚪 世界門（11-15）：名冊、檔案只送「現在這個地方」的人 ─────────────────────────
    //   以前一段聊天＝一個故事，檔案照聊天室分就夠；世界門讓一段聊天在奧瑞亞和好幾個世界來回，
    //   人在視差世界裡時名冊照樣列奧瑞亞的人，世界裡出現同名的人還會把奧瑞亞那個人的檔案帶進來。
    //   她 11-15 盤點後選修這塊（大總結 b6c8a258 之後）。
    //   規則：檔案記著在哪建的（place：世界名，''＝主角原本生活的地方）；送的時候只挑這裡的，旅伴（這一趟入隊的）到哪都照送；
    //     舊檔案沒記 place → 看劇情裡他在哪出場過（OS_WORLDGATE.castInfo），沒出場紀錄的照送。
    //   同名不同人：這裡出現一個名字、但同名那份檔案不屬於這裡 → 另開一份「名字＠地方」，兩份各記各的。
    const WG_SEP = '＠';
    const _zk = s => { try { const Z = win.OS_ZH; if (Z && typeof Z.key === 'function') return Z.key(String(s == null ? '' : s)); } catch (e) {} return String(s == null ? '' : s).replace(/\s/g, ''); };
    const _first = s => String(s || '').split(/[·・•\s]/)[0];
    function _baseOf(key) { const s = String(key); const i = s.indexOf(WG_SEP); return i < 0 ? s : s.slice(0, i); }
    function _placeOfKey(key) { const s = String(key); const i = s.indexOf(WG_SEP); return i < 0 ? null : s.slice(i + 1); }
    // 現在在哪、這一趟的旅伴、誰在哪出場過；沒有世界門（或一個世界都沒有）回 null＝照舊不挑
    async function _scope() {
        const G = win.OS_WORLDGATE || window.OS_WORLDGATE;
        if (!G || typeof G.worldNames !== 'function') return null;
        try {
            const names = (await G.worldNames()) || [];
            if (!names.length) return null;
            const cur = (typeof G.getCurrentWorld === 'function') ? await G.getCurrentWorld() : null;
            const ci = (typeof G.castInfo === 'function') ? await G.castInfo() : null;
            const team = new Set();
            ((ci && ci.team) || []).forEach(n => { team.add(_zk(n)); team.add(_zk(_first(n))); });
            const cast = new Map();
            if (ci && ci.places) Object.keys(ci.places).forEach(n => {
                const ps = (ci.places[n] || []).map(p => _zk(p));
                [_zk(n), _zk(_first(n))].forEach(k => { if (!k) return; const s = cast.get(k) || new Set(); ps.forEach(p => s.add(p)); cast.set(k, s); });
            });
            return { place: (cur && cur.name) || '', team: team, cast: cast.size ? cast : null };
        } catch (e) { return null; }
    }
    function _inTeam(sc, name) { return sc.team.has(_zk(name)) || sc.team.has(_zk(_first(name))); }
    // 這份檔案屬不屬於現在這個地方
    function _belongs(key, rec, sc) {
        if (!sc) return true;
        const here = _zk(sc.place), kp = _placeOfKey(key);
        if (kp !== null) return _zk(kp) === here;
        const base = _baseOf(key);
        if (_inTeam(sc, base)) return true;
        if (rec && rec.place != null) return _zk(rec.place) === here;
        const seen = sc.cast ? (sc.cast.get(_zk(base)) || sc.cast.get(_zk(_first(base))) || null) : null;
        return !seen || seen.has(here);
    }
    // 這個名字在這裡要記進哪一份：同名那份屬於這裡（或還沒有）就是它，不然另開「名字＠地方」
    function _keyFor(name, dossiers, sc) {
        if (!sc) return name;
        const rec = dossiers[name];
        if (!rec || _belongs(name, rec, sc)) return name;
        return name + WG_SEP + sc.place;
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
            //   世界門：記進哪一份看 _keyFor（同名但不屬於這裡的另開一份）
            const sc = await _scope();
            const fresh = [], stale = [];
            for (const name of present) {
                const n = ledger.chars[name]?.n || 0;
                if (n < CONFIG.minAppearances) continue;
                const key = _keyFor(name, dossiers, sc);
                const d = dossiers[key];
                const apart = key !== name;   // 跟同名那份是不同的人
                if (!d) fresh.push({ name, key, n, mode: 'new', apart });
                else if (n - (d.nAtUpdate || 0) >= CONFIG.refreshGrowth) stale.push({ name, key, n, mode: 'update', old: d, apart });
            }
            const candidates = fresh.concat(stale).slice(0, CONFIG.maxFilesPerRound);

            let block = null;
            if (candidates.length) {
                const where = c => c.apart ? `；這是在「${sc.place || '主角原本生活的地方'}」遇到的${c.name}，跟別處同名的人不是同一個，只寫在這裡發生的事` : '';
                const list = candidates.map(c => c.mode === 'new'
                    ? `・${c.name}（第${c.n}次登場・尚無檔案 → 新建${where(c)}）`
                    : `・${c.name}（第${c.n}次登場・已有檔案 → 增修${where(c)}。舊檔案：${String(c.old.file || '').trim()}）`
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
            return { chatId, ledger, candidates, block, scope: sc };
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
                const key = cand.key || name;
                const old = dossiers[key];
                const rec = {
                    hook: String(f.hook || '').trim().slice(0, CONFIG.hookMaxLen) || (old?.hook || ''),
                    file: text.slice(0, CONFIG.fileMaxLen),
                    nAtUpdate: cand.n,
                    createdAt: old?.createdAt || Date.now(),
                    updatedAt: Date.now()
                };
                // 在哪建的（世界門）：舊的照舊；新建的記這一輪的地方（沒有世界門就不記）
                const place = old ? old.place : (handle.scope ? handle.scope.place : undefined);
                if (place != null) rec.place = place;
                dossiers[key] = rec;
                saved++;
            }
            await win.OS_DB.saveStateData(handle.chatId, { ...data, npcLedger: handle.ledger, npcDossiers: dossiers });
            if (saved) console.log(`📇 [NPC Dossier] 本輪建/修 ${saved} 份人物檔案，累計 ${Object.keys(dossiers).length} 份`);
        } catch (e) {
            console.warn('[NPC Dossier] commit 失敗:', e?.message || e);
        }
    }

    // ── 2.2 往事線索（11-26）：劇情裡誰露出了「故事開始以前」的事，記一行 ─────────────
    //   給紫薇的記憶迴廊用（lobby_memory.js）：抽牌從這裡挑一條當題目，回憶才接得上主線；
    //   一條都沒有＝還不熟，那個人在迴廊裡是灰的（11-26：沒有碎片＝跟這個角色接觸不深，形同陌生人）。
    //   不另叫模型：酒館、網頁版都搭 state_runtime 那通副模型（網頁版建檔那通有跑也一起帶）。
    //   存 state_data(chatId).npcPasts = { 名字: [{ t, at }] }，對帳時正文裡沒有的人一起清。
    const PAST_MAX = 12, PAST_LEN = 40;
    const _pastKey = (t) => _zk(String(t || '').replace(/[，。、！？…「」『』\s,.!?]/g, ''));
    async function preparePasts(chatId, text) {
        try {
            if (!_isOn() || !chatId || !win.OS_DB?.getStateData) return null;
            const names = Array.from(_charNamesIn(text)).slice(0, 10);
            if (!names.length) return null;
            const data = (await win.OS_DB.getStateData(chatId)) || {};
            const pasts = data.npcPasts || {};
            const known = names.map(n => (pasts[n] || []).map(p => '・' + n + '：' + p.t)).flat().slice(-20);
            // 世界門的旅人：奧瑞亞來的普通人，在世界裡的身分是進門後才有的，不算他的過去（11-26）
            let trav = [];
            try { const G = win.OS_WORLDGATE; trav = (G && G.travelers) ? ((await G.travelers()) || []).map(t => _zk(t.name)) : []; } catch (e) {}
            const tagged = names.map(n => trav.indexOf(_zk(n)) >= 0 ? n + '（世界門的旅人）' : n);
            const hasTrav = tagged.some((t, i) => t !== names[i]);
            const block = `

═══════════════════════════════════════
【★ 順便記「往事線索」→ 放進同一個 JSON 的 "npc_pasts" 欄位】
這輪劇情裡，下面這些人如果露出了「故事開始以前」的事，記一行：身上的舊傷或疤、提到過去的誰（家人、故人、死去的人）、從哪裡來、以前做過什麼、某個習慣或忌諱的由來、不肯提的事。
這輪在場的人：${tagged.join('、')}
${known.length ? '已經記過的（別重複）：\n' + known.join('\n') + '\n' : ''}${hasTrav ? '標「世界門的旅人」的人本來是奧瑞亞的普通人：他在這個世界的身分、種族、樣子是進門後被改造的，不算以前的事；只記他提到的、在奧瑞亞時候的事。\n' : ''}規則：
- 只記這輪正文裡真的寫到、或明顯透露出來的；這輪沒有就給空陣列 []，不要編。
- 要是他以前的事；這輪劇情裡正在發生的事不算。
- 一條一句、三十字以內，寫看得到的事實，不寫猜測。主角不記。
- 一輪最多三條。
格式： "npc_pasts": [ { "name": "在場的人名", "hint": "一句話" } ]`;
            return { chatId, names, block };
        } catch (e) {
            console.warn('[NPC Dossier] 往事線索前置失敗:', e?.message || e);
            return null;
        }
    }
    // 收線索：只收這輪在場的人；跟記過的同一句不再收（標點、簡繁不同也算同一句）
    async function commitPasts(handle, list) {
        try {
            if (!handle || !handle.chatId || !Array.isArray(list) || !list.length || !win.OS_DB?.saveStateData) return 0;
            const allow = new Map(handle.names.map(n => [_zk(n), n]));
            const data = (await win.OS_DB.getStateData(handle.chatId)) || {};
            const pasts = JSON.parse(JSON.stringify(data.npcPasts || {}));
            let added = 0;
            list.slice(0, 3).forEach(p => {
                const name = allow.get(_zk(String(p && p.name || '').replace(/（[^）]*）|\([^)]*\)/g, '').trim()));   // 模型可能連「（世界門的旅人）」一起抄回來
                const t = String(p && p.hint || '').replace(/\s+/g, ' ').trim().slice(0, PAST_LEN);
                if (!name || t.length < 3) return;
                const arr = pasts[name] || (pasts[name] = []);
                const k = _pastKey(t);
                if (arr.some(x => _pastKey(x.t) === k)) return;
                arr.push({ t, at: Date.now() });
                if (arr.length > PAST_MAX) arr.splice(0, arr.length - PAST_MAX);
                added++;
            });
            if (!added) return 0;
            await win.OS_DB.saveStateData(handle.chatId, { ...data, npcPasts: pasts });
            console.log(`📇 [NPC Dossier] 本輪記下 ${added} 條往事線索`);
            return added;
        } catch (e) {
            console.warn('[NPC Dossier] 往事線索沒存到:', e?.message || e);
            return 0;
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
            if (!Object.keys(dossiers).length && !Object.keys(chars).length && !Object.keys(data.npcPasts || {}).length) return;

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

            const dead = Object.keys(dossiers).filter(n => !nowChars[_baseOf(n)]);   // 「名字＠地方」那份看名字
            const pasts = data.npcPasts || {};
            const deadPast = Object.keys(pasts).filter(n => !nowChars[n]);   // 往事線索也跟著正文走
            const sameCount = Object.keys(chars).length === Object.keys(nowChars).length
                && Object.keys(nowChars).every(n => chars[n] && chars[n].n === nowChars[n].n);
            if (!dead.length && !deadPast.length && sameCount) return;   // 沒變化就別寫 DB

            const nextDossiers = {};
            for (const n of Object.keys(dossiers)) if (nowChars[_baseOf(n)]) nextDossiers[n] = dossiers[n];
            const nextPasts = {};
            for (const n of Object.keys(pasts)) if (nowChars[n]) nextPasts[n] = pasts[n];

            await win.OS_DB.saveStateData(chatId, {
                ...data,
                npcLedger: { lastMsgId: msgs.length - 1, chars: nowChars },
                npcDossiers: nextDossiers,
                npcPasts: nextPasts
            });
            console.log(`[NPC Dossier] 對帳(${tag})：正文現存 ${Object.keys(nowChars).length} 人`
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

            // 🚪 世界門：只挑屬於現在這個地方的；同一個名字兩份都算這裡的話，「名字＠地方」那份優先
            const sc = await _scope();
            const pick = new Map();   // 名字 → 檔案鑰匙
            Object.keys(dossiers).forEach(k => {
                if (!_belongs(k, dossiers[k], sc)) return;
                const b = _baseOf(k);
                if (!pick.has(b) || _placeOfKey(k) !== null) pick.set(b, k);
            });
            if (!pick.size) return '';
            const byRecency = Array.from(pick.keys())
                .sort((a, b) => (chars[b]?.lastAt || 0) - (chars[a]?.lastAt || 0));
            const mentioned = recentText
                ? byRecency.filter(n => recentText.indexOf(n) !== -1).slice(0, CONFIG.maxInjectFull)
                : [];
            const rosterNames = byRecency.slice(0, CONFIG.maxRoster);

            const rosterLines = rosterNames.map(n => {
                const d = dossiers[pick.get(n)];
                const cnt = chars[n]?.n;
                return `・${n}｜${d.hook || '（無簡介）'}${cnt ? `（登場${cnt}次）` : ''}`;
            }).join('\n');
            const parts = [
                `<人物名冊 規則="本故事登場過的人物索引·唯讀·嚴禁複述">\n以下人物在本故事登場過、有既定人設與往事。劇情再次提到或主角尋訪他們（含用暱稱、身分代稱間接提到）時，必須沿用名冊與其檔案，嚴禁當成初次見面的新角色、嚴禁另編一個同名新人。\n${rosterLines}\n</人物名冊>`
            ];
            if (mentioned.length) {
                const fileLines = mentioned.map(n => `【${n}】${dossiers[pick.get(n)].file}`).join('\n');
                parts.push(`<人物檔案 規則="本輪相關人物的長期檔案·權威·寫作不得矛盾">\n${fileLines}\n</人物檔案>`);
            }

            // 🔬 chatId 一起印：查「新聊天室卻冒出舊角色」時，這串直接告訴你檔案是從哪一格 DB 撈的
            console.log(`[NPC Dossier] 名冊 ${rosterNames.length} 人` + (mentioned.length ? `＋完整檔案 [${mentioned.join('、')}]` : '（本輪無名字命中）') + `｜讀自 chatId=${chatId}`);
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

            // 這通有跑就順便記往事線索（state_runtime 那通也會記；同一句不會收兩次）
            const ph = await preparePasts(chatId, content);
            const got = await _pwaAskFiles(handle, content, ph);
            await commit(handle, got && got.files);
            if (ph && got) await commitPasts(ph, got.pasts);
        } catch (e) {
            console.warn('[NPC Dossier] PWA 建檔失敗:', e?.message || e);
        } finally { _pwaBusy = false; }
    }

    // 副模型單通：把 prepare 組好的同一份規則（block）當 system，正文當 user，只要 npc_files
    function _pwaAskFiles(handle, content, ph) {
        return new Promise((resolve) => {
            try {
                if (!win.OS_API?.chat) return resolve(null);
                const secCfg = (win.OS_SETTINGS?.getSecondaryConfig?.()) || (win.OS_SETTINGS?.getConfig?.()) || {};
                secCfg._isSecondary = true;
                const sys = '你是「人物檔案管理員」。讀下面的劇情正文，依規則產出 JSON，只輸出 JSON、不要任何說明文字。\n'
                    + '輸出格式：{ "npc_files": [ { "name": "...", "hook": "...", "file": "..." } ]' + (ph ? ', "npc_pasts": [ { "name": "...", "hint": "..." } ]' : '') + ' }\n'
                    + String(handle.block || '') + String((ph && ph.block) || '');
                win.OS_API.chat(
                    [{ role: 'system', content: sys }, { role: 'user', content: content.slice(0, 6000) }],
                    secCfg, null,
                    (text) => {
                        try {
                            const m = String(text || '').match(/\{[\s\S]*\}/);
                            const obj = m ? JSON.parse(m[0]) : null;
                            resolve(obj ? { files: Array.isArray(obj.npc_files) ? obj.npc_files : null, pasts: Array.isArray(obj.npc_pasts) ? obj.npc_pasts : null } : null);
                        } catch (e) { resolve(null); }
                    },
                    () => resolve(null),
                    { task: 'extract', disableTyping: true }
                );
            } catch (e) { resolve(null); }
        });
    }

    // ── 事件接線 ───────────────────────────────────────────────────────
    // 監聽器把 Promise 交回去 → 酒館 emit 會等注入完才組 prompt；最多等 2.5 秒，免得資料庫卡住連生成一起卡
    const WAIT_MS = 2500;
    function _waitFor(fn) { return Promise.race([Promise.resolve().then(fn).catch(function () {}), new Promise(function (r) { setTimeout(r, WAIT_MS); })]); }

    function init() {
        if (!win.eventOn || !win.tavern_events) { setTimeout(init, 1000); return; }
        if (win.tavern_events.GENERATION_STARTED) {
            win.eventOn(win.tavern_events.GENERATION_STARTED, (type, opts, dryRun) => {
                if (dryRun) return;   // 🚫 dryRun 空跑會吃掉 once 注入，真生成反而沒有
                if (win.__AURELIA_SUMMARIZING) return;
                return _waitFor(injectDossiers);
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
        preparePasts, commitPasts,
        // 往事線索（記憶迴廊用）：{ 名字: [{ t, at }] }；chatId 不給＝現在這個故事
        pastsOf: async (chatId) => {
            const cid = chatId || _getChatId();
            if (!cid || !win.OS_DB?.getStateData) return {};
            try { return ((await win.OS_DB.getStateData(cid)) || {}).npcPasts || {}; } catch (e) { return {}; }
        },
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
