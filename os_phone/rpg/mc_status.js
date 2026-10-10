// ----------------------------------------------------------------
// [檔案] mc_status.js
// 職責：主角狀態與故事時鐘——「模型只回報變化，程式負責記住、倒數、再塞回去」。
//   VN 腳本回合末尾兩種寫法都認：
//     ① 標籤：[Date|月/日|時:分] [HP|數值] [Buff|名|回合] [Event|月/日|一句話]（vn_core.next 解析後打進來）
//     ② 區塊：<os_status> … 日期|6/20 / HP|65/100 / BUFF/DEBUFF|名(剩/總)、… / 日曆|6/20|一句話 … </os_status>
//        （她自己貼給主模型的那份格式；vn_core.loadScript 先整塊撈出來餵這裡、再從劇本剝掉）
//   回合：每則新訊息讓狀態效果倒數一回合（區塊寫法由模型直接給數字，以它為準）。
//   回朔：每則訊息處理前存一張快照（帶內容簽名）。最新那則換了內容（swipe／重生）先退回快照再套新內容；
//        處理過的內容再進來（重看舊章）什麼都不動。每輪生成前對帳：內容已經不在完整聊天檔裡的，退回最早那則的快照。
//        她手動記的約定不跟著回朔。
//   約定：AI 寫「(已完成)」「(取消)」就打勾；日曆那行每輪整份重寫，連著兩輪沒再寫的劇情約定不再當成「還沒到」。
//        每件約定記哪天＋幾點（或早上／中午／下午／晚上／深夜哪個時段）；同一天時間不打架、換個說法的算同一件（10-10）。
//   委託卡：地圖接了委託就在日曆佔一格（進行中），收到報酬／不辦了收掉；跟約定排在同一條時間線上送給 AI。
//   注入：每輪生成前把現在幾點、HP、還在身上的效果、七天內的約定組成一小段：
//     酒館走 TavernHelper.injectPrompts（once、不貼回 chat）；PWA 走提示詞順序表的 mc_status 那一格。
//   資料：OS_DB.app_data（appId=mc_status、chat scope）。跟狀態系統／副模型完全無關——她拍板不給副模型加負擔。
//   日曆 app（os_calendar.js）讀寫同一份。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const APP_ID = 'mc_status';
    const INJECT_ID = 'aurelia_mc_status';
    const MAX_BUFF_AGE = 20;     // 效果最多活這麼多回合，防模型忘了寫 0 賴著不走
    const REVIVE_BLOCK = 8;      // 效果到期後這麼多回合內，AI 又寫回同一個（或換說法的同一個）不收——防它從聊天紀錄抄回來復活
    const UPCOMING_DAYS = 7;     // 注入「近期約定」看幾天內
    const SNAP_MAX = 40;         // 快照留最近幾則
    const MISS_GONE = 2;         // 劇情寫的約定，連著這麼多輪日曆都沒寫才算「劇情沒再提」

    let _cache = null, _cacheChat = '';
    let _lastUninject = null;
    let _q = Promise.resolve();  // 所有會改資料的動作排隊跑，loadScript 的倒數／回朔一定先於同一則的標籤

    function normalizeChatId(raw) {
        if (!raw) return '';
        let s = String(raw).split(/[\\/]/).pop() || '';
        s = s.replace(/\.jsonl?$/i, '');
        return s.trim();
    }
    // 分艙鍵走 adapter（酒館＝chatId、PWA＝storyId），跟 state_runtime 同一套
    function getChatId() {
        try {
            const id = win.OS_AVS_ADAPTER && win.OS_AVS_ADAPTER.getCurrentChatId && win.OS_AVS_ADAPTER.getCurrentChatId();
            if (id) return id;
            const ctx = win.SillyTavern && win.SillyTavern.getContext && win.SillyTavern.getContext();
            return normalizeChatId(ctx && ctx.chatId);
        } catch (e) { return ''; }
    }

    function blank() { return { date: null, time: '', hp: '', name: '', buffs: [], events: [], snaps: {}, snapOrder: [], turn: 0, expired: [], seenSigs: [] }; }

    async function load() {
        const cid = getChatId();
        if (!cid) return blank();
        if (_cache && _cacheChat === cid) return _cache;
        let d = null;
        try { d = await win.OS_DB.getAppData(APP_ID, 'state', cid); } catch (e) { console.warn('[MC Status] 讀取失敗:', e); }
        _cache = Object.assign(blank(), d || {});
        if (!Array.isArray(_cache.buffs)) _cache.buffs = [];
        if (!Array.isArray(_cache.events)) _cache.events = [];
        if (!_cache.snaps || typeof _cache.snaps !== 'object') _cache.snaps = {};
        if (!Array.isArray(_cache.snapOrder)) _cache.snapOrder = Object.keys(_cache.snaps);
        if (!Array.isArray(_cache.expired)) _cache.expired = [];
        if (!Array.isArray(_cache.seenSigs)) _cache.seenSigs = [];
        if (!(_cache.turn >= 0)) _cache.turn = 0;
        delete _cache.seen;   // 舊版欄位
        // 10-10 起約定多一個 time 欄、換說法不再多一列：舊資料補時間、把已經堆出來的重複收掉（有動才存）
        let fixed = false;
        _cache.events.forEach(e => { if (e.time == null) { _fillTime(e); fixed = true; } });
        if (_dedupe(_cache)) fixed = true;
        if (fixed) _sortEvents(_cache);
        _cacheChat = cid;
        if (fixed) await save();
        return _cache;
    }
    async function save() {
        if (!_cache || !_cacheChat) return;
        try { await win.OS_DB.saveAppData(APP_ID, 'state', _cache, _cacheChat); }
        catch (e) { console.warn('[MC Status] 存檔失敗:', e); }
        try { win.dispatchEvent(new CustomEvent('aurelia:mc-status', { detail: _cache })); } catch (e) {}
        try { if (win !== window) window.dispatchEvent(new CustomEvent('aurelia:mc-status', { detail: _cache })); } catch (e) {}
        renderHud();
    }
    // 排隊：回傳 fn 的結果
    function run(fn) {
        const p = _q.then(fn, fn);
        _q = p.catch(e => { console.warn('[MC Status] 動作失敗:', e); });
        return p;
    }

    // ── 日期／時間 ──
    const CN = { 零: 0, 一: 1, 二: 2, 兩: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    function cnNum(t) {
        if (!t) return NaN;
        if (/^\d+$/.test(t)) return parseInt(t, 10);
        if (t.indexOf('十') >= 0) {
            const parts = t.split('十');
            const a = parts[0] ? CN[parts[0]] : 1;
            const b = parts[1] ? CN[parts[1]] : 0;
            if (a == null || b == null) return NaN;
            return a * 10 + b;
        }
        let n = 0;
        for (const ch of t) { if (!(ch in CN)) return NaN; n = n * 10 + CN[ch]; }
        return n;
    }
    // 回 {y?, m, d} 或 null；認 2085/6/20、6/20、6-20、6月20日、六月二十日
    function parseDate(s) {
        s = String(s || '').trim();
        let m;
        if ((m = s.match(/(\d{4})\s*[\/\-年.]\s*(\d{1,2})\s*[\/\-月.]\s*(\d{1,2})/))) return { y: +m[1], m: +m[2], d: +m[3] };
        if ((m = s.match(/(\d{1,2})\s*[\/\-月.]\s*(\d{1,2})/))) return { m: +m[1], d: +m[2] };
        if ((m = s.match(/([零一二兩两三四五六七八九十\d]+)月([零一二兩两三四五六七八九十\d]+)[日號号]?/))) {
            const mm = cnNum(m[1]), dd = cnNum(m[2]);
            if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) return { m: mm, d: dd };
        }
        return null;
    }
    // 認 18:30、18：30、18點、晚上 8 點；認不出就原字留著（傍晚、深夜…）
    function parseTime(s) {
        s = String(s || '').trim();
        if (!s) return '';
        let m = s.match(/(\d{1,2})\s*[:：點点时時]\s*(\d{1,2})?/);
        if (m) {
            let h = parseInt(m[1], 10);
            if (/(下午|晚上|晚間|傍晚|夜)/.test(s) && h < 12) h += 12;
            return String(h).padStart(2, '0') + ':' + String(m[2] || '00').padStart(2, '0');
        }
        return s.slice(0, 8);
    }
    // ── 約定的時間：說得出幾點就記 18:00，說不準就記時段（晚上），都沒有就空著 ──
    //   她 10-10：「日歷要不要再擴展至日時段，然後分成時段來放」。時段由程式分，AI 只要寫時間。
    //   分得出幾點，程式才算得出「還有 40 分鐘」「已經過了」；同一天同一個時間＝同一件事，換了說法也不會多一列。
    const SLOTS = [
        { id: '早上', re: /早上|上午|早晨|清晨|一早|今早|明早/, from: 5 * 60, to: 11 * 60 },
        { id: '中午', re: /中午|午間|午间/, from: 11 * 60, to: 13 * 60 },
        { id: '下午', re: /下午|午後|午后/, from: 13 * 60, to: 17 * 60 },
        { id: '晚上', re: /傍晚|晚上|晚間|晚间|夜晚|今晚|明晚/, from: 17 * 60, to: 23 * 60 },
        { id: '深夜', re: /深夜|半夜|凌晨|午夜/, from: 23 * 60, to: 29 * 60 },   // 跨過午夜到隔天 5 點
    ];
    const CN_H = '[零一二兩两三四五六七八九十]{1,3}';
    const DAYPART = '早上|上午|早晨|清晨|中午|下午|傍晚|晚上|晚間|晚间|夜晚|今晚|明晚|今早|明早|深夜|半夜|凌晨';
    // 「18:00」「18點」「晚上六點」「下午三點半」「十點十五分」→ 18:00；認不出回 ''（不留原字，跟主角現在幾點那格不同）
    //   loose＝日期那格（本來就在寫時間）：國字鐘點直接認。標題裡要前面有早上／晚上這類才認——不然「多帶一點錢」會變 01:00
    function clockOf(s, loose) {
        s = String(s || '');
        let m = s.match(/(\d{1,2})\s*[:：點点時时]\s*(半|\d{1,2})?/);
        if (!m) m = s.match(new RegExp((loose ? '' : '(?:' + DAYPART + ')\\s*') + '(' + CN_H + ')\\s*[點点時时]\\s*(半|' + CN_H + '(?=\\s*分))?'));
        if (!m) return '';
        let h = cnNum(m[1]);
        let mi = !m[2] ? 0 : (m[2] === '半' ? 30 : cnNum(m[2]));
        if (!(h >= 0 && h <= 24) || !(mi >= 0 && mi < 60)) return '';
        const before = s.slice(0, m.index + m[0].indexOf(m[1]));
        if (/下午|晚上|晚間|晚间|傍晚|夜晚|今晚|明晚/.test(before) && h < 12) h += 12;
        else if (/中午/.test(before) && h < 11) h += 12;
        else if (/晚上|深夜|半夜/.test(before) && h === 12) h = 0;   // 晚上 12 點＝半夜
        if (h === 24) h = 0;
        return String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0');
    }
    function slotWordOf(s) { const x = SLOTS.find(z => z.re.test(String(s || ''))); return x ? x.id : ''; }
    // 約定的 time 欄（18:00 或 晚上）→ 一天裡的第幾分鐘；時段給它的開頭
    function minsOf(t) {
        const m = String(t || '').match(/^(\d{2}):(\d{2})$/);
        return m ? (+m[1]) * 60 + (+m[2]) : null;
    }
    function slotOf(t) {
        const n = minsOf(t);
        if (n == null) { const x = SLOTS.find(z => z.id === t); return x ? x.id : ''; }
        const x = SLOTS.find(z => (n >= z.from && n < z.to) || (n + 1440 >= z.from && n + 1440 < z.to));
        return x ? x.id : '';
    }
    function _slotRange(t) { const n = minsOf(t); if (n != null) return { from: n, to: n }; const x = SLOTS.find(z => z.id === t); return x ? { from: x.from, to: x.to } : null; }
    // 同一天照時間排：寫了鐘點的照鐘點、只寫時段的排在那個時段開頭、沒寫時間的排最後
    function _dayMins(e) { const r = _slotRange(e && e.time); return r ? r.from : 9999; }
    function _sortEvents(st) { st.events.sort((a, b) => (dateKey(a.date) - dateKey(b.date)) || (_dayMins(a) - _dayMins(b))); }
    function fmtDate(d) { return d ? ((d.y ? d.y + '/' : '') + d.m + '/' + d.d) : ''; }
    function dateKey(d) { return d ? ((d.y || 0) * 10000 + d.m * 100 + d.d) : 0; }
    // a 到 b 差幾天（沒寫年份的一律當同一年）
    function dayDiff(a, b) {
        if (!a || !b) return 0;
        const y = (a.y || b.y || 2001);
        const t = (x) => Math.round(new Date(x.y || y, x.m - 1, x.d).getTime() / 86400e3);
        return t(b) - t(a);
    }

    // ── 快照：回朔用 ──
    // 不跟著劇情回朔的：她自己記的、委託卡（委託紀錄本來就不回朔：重新生成那章，錢不會再進一次）
    function _keepOnRollback(e) { return e.src === 'me' || e.src === 'mission'; }
    function snapshotOf(st) {
        return JSON.parse(JSON.stringify({
            date: st.date, time: st.time, hp: st.hp, name: st.name,
            buffs: st.buffs, turn: st.turn | 0, expired: st.expired || [],
            events: st.events.filter(e => !_keepOnRollback(e)),   // 她手動記的、委託卡不進快照、也不被回朔
        }));
    }
    function restoreSnapshot(st, snap) {
        st.date = snap.date || null; st.time = snap.time || ''; st.hp = snap.hp || ''; st.name = snap.name || '';
        st.buffs = JSON.parse(JSON.stringify(snap.buffs || []));
        st.turn = snap.turn | 0;
        st.expired = JSON.parse(JSON.stringify(snap.expired || []));
        const mine = st.events.filter(_keepOnRollback);
        st.events = JSON.parse(JSON.stringify(snap.events || [])).concat(mine);
        st.events.forEach(_fillTime);   // 改之前存的快照，約定沒有 time 欄
        _sortEvents(st);
    }
    function dropSnapsFrom(st, idx) {
        const gone = st.snapOrder.splice(idx);
        gone.forEach(k => { delete st.snaps[k]; });
        return gone;
    }

    // ── 內容簽名：認「這一則是不是處理過」──
    //   🚨 09-24 她：約定拍完了，隔天 AI 又提約定。送出那包的主角狀態停在第 8 章（6/20、約定 6/25 還沒到），
    //   資料庫裡的存檔一輪一輪看：每次生成前都被退回第 8 章那份。兩個原因：
    //   ① 對帳拿 ctx.chat.length 當「聊天有幾樓」，TauriTavern 懶載入只放最近一段進來 → 樓號比它大的全被當成刪掉。
    //   ② 樓號不可靠：GENERATION_ENDED 給的是「則數」（樓號＋1），章節列表回放給的是樓號，同一則會用兩個號碼各處理一次；
    //      回放舊章也被當成「重生這一則」，退回那章之前、之後的全丟。
    //   現在：處理過的內容用簽名認（重看＝什麼都不動），對帳看「這段內容還在不在完整聊天檔裡」，不看樓號。
    //   簽名前剝掉程式自己會補寫進正文的東西（插圖 [Scene|]、狀態標記註解、<recall>），免得補寫一次就被當成新內容。
    function sigOf(text) {
        const s = String(text || '')
            .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '')
            .replace(/\[Scene\|[^\]\n]*\]/gi, '')
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/<recall>[\s\S]*?<\/recall>/gi, '')
            .replace(/\s+/g, '');
        if (!s) return '';
        let h = 5381;
        for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
        return s.length + ':' + (h >>> 0).toString(36);
    }
    const SEEN_MAX = 400;
    function _seen(st, sig) {
        if (!sig) return false;
        return st.snapOrder.some(k => st.snaps[k] && st.snaps[k].sig === sig) || (st.seenSigs || []).indexOf(sig) >= 0;
    }
    // 比目前處理過最新的那則還舊、又沒處理過 → 是在翻舊章，不是新的一輪
    function _olderThanLatest(st, id) {
        if (!/^\d+$/.test(id)) return false;
        const nums = st.snapOrder.filter(k => /^\d+$/.test(k)).map(Number);
        return nums.length > 0 && Number(id) < Math.max.apply(null, nums);
    }

    // ── 回合：每則訊息處理前存快照；同一則換了內容（swipe／重生）先退回快照 ──
    //   回傳 { replay }：true＝這則處理過或是舊章，呼叫端不要再套它的狀態欄。
    function onMessage(msgId, text) {
        return run(async () => {
            const st = await load();
            const sig = text != null ? sigOf(text) : '';
            if (_seen(st, sig)) return { replay: true };
            if (msgId == null || msgId === '') {
                // 獨立版沒有樓號：只記簽名，重看同一章就認得出來
                if (sig) {
                    if (!Array.isArray(st.seenSigs)) st.seenSigs = [];
                    st.seenSigs.push(sig);
                    if (st.seenSigs.length > SEEN_MAX) st.seenSigs = st.seenSigs.slice(-SEEN_MAX);
                    await save();
                }
                return { replay: false };
            }
            const id = String(msgId);
            const idx = st.snapOrder.indexOf(id);
            if (idx >= 0) {
                // 只有「最新那則換了內容」才是 swipe／重生；更早的樓號撞到＝回放或兩種編號撞號，退回去會把之後的進度全丟
                if (idx !== st.snapOrder.length - 1) return { replay: true };
                restoreSnapshot(st, st.snaps[id]);
                dropSnapsFrom(st, idx);
            } else if (_olderThanLatest(st, id)) {
                return { replay: true };
            }
            st.snaps[id] = snapshotOf(st);
            st.snaps[id].sig = sig;
            st.snapOrder.push(id);
            if (st.snapOrder.length > SNAP_MAX) { const old = st.snapOrder.shift(); delete st.snaps[old]; }
            st.turn = (st.turn | 0) + 1;
            st.buffs.forEach(b => { b.left = (b.left | 0) - 1; b.age = (b.age | 0) + 1; });
            // 剛到期的記下來：AI 前幾回合自己寫過它，聊天紀錄裡還看得到，下一回合常又抄回來 → 在「死了又復活」那關擋
            st.buffs.filter(b => !(b.left > 0 && b.age <= MAX_BUFF_AGE)).forEach(b => st.expired.push({ name: b.name, turn: st.turn }));
            st.expired = st.expired.filter(e => st.turn - (e.turn | 0) <= REVIVE_BLOCK).slice(-30);
            st.buffs = st.buffs.filter(b => b.left > 0 && b.age <= MAX_BUFF_AGE);
            await save();
            return { replay: false };
        });
    }
    // 對帳：這些訊息 id 已經不在了 → 退回其中最早那則處理前的快照。回退了幾則。
    function rollbackByIds(ids) {
        return run(async () => {
            const st = await load();
            const dead = (ids || []).map(String).filter(id => st.snaps[id]);
            if (!dead.length) return 0;
            let idx = Infinity;
            dead.forEach(id => { const i = st.snapOrder.indexOf(id); if (i >= 0 && i < idx) idx = i; });
            if (!isFinite(idx)) return 0;
            restoreSnapshot(st, st.snaps[st.snapOrder[idx]]);
            const gone = dropSnapsFrom(st, idx);
            await save();
            console.log('[MC Status] 回朔：退回 ' + gone.length + ' 則之前的狀態');
            return gone.length;
        });
    }
    function listSnapshotIds() { return _cache ? _cache.snapOrder.slice() : []; }
    // 酒館：處理過的那段內容已經不在聊天裡（刪樓／重生／swipe）→ 那幾則的快照該退
    //   🚨 不能拿 ctx.chat.length 比樓號：TauriTavern 懶載入，ctx.chat 只有最近一段，會把每一則新的都當成刪掉（見 sigOf 上面）。
    //   看的是完整聊天檔（VN_READER.fetchFullChat 讀檔繞開懶載入）＋記憶體裡那段（剛寫完、檔案還沒存的在這裡）。
    //   讀不到完整聊天檔就不動；舊存檔沒有簽名的快照認不出來，一律當還活著。
    async function reconcileWithTavern() {
        try {
            const st = await load();
            const signed = st.snapOrder.filter(k => st.snaps[k] && st.snaps[k].sig);
            if (!signed.length) return 0;
            const R = win.VN_READER || window.VN_READER;
            if (!R || !R.fetchFullChat) return 0;
            const full = await R.fetchFullChat();
            if (!Array.isArray(full) || !full.length) return 0;
            const alive = new Set();
            const add = (m) => { const s = m ? sigOf(m.mes || m.message || m.content || '') : ''; if (s) alive.add(s); };
            full.forEach(add);
            try {
                const ctx = win.SillyTavern && win.SillyTavern.getContext && win.SillyTavern.getContext();
                if (ctx && Array.isArray(ctx.chat)) ctx.chat.forEach(add);
            } catch (e) {}
            const dead = signed.filter(k => !alive.has(st.snaps[k].sig));
            return dead.length ? await rollbackByIds(dead) : 0;
        } catch (e) { return 0; }
    }

    // ── 寫入 ──
    function setDate(dateStr, timeStr) {
        return run(async () => {
            const st = await load();
            const d = parseDate(dateStr);
            let t = timeStr ? parseTime(timeStr) : '';
            if (!t) { const m = String(dateStr || '').match(/(\d{1,2}\s*[:：]\s*\d{2})/); if (m) t = parseTime(m[1]); }
            let changed = false;
            if (d) { st.date = d; changed = true; }
            if (t) { st.time = t; changed = true; }
            if (changed) await save();
            return changed;
        });
    }
    function setHp(v) {
        return run(async () => { const st = await load(); st.hp = String(v || '').trim(); await save(); });
    }
    // 🍬 效果「像口香糖黏著」（她 09-06、09-23 都講過）：狀態欄每回合是 AI 整份重寫，程式又把「宿醉（剩 2 回合）」
    //   注入回去給它看 → 它照抄、常把剩餘回合寫回原本的數字 → 倒數一直被充值；到期拿掉後它又從聊天紀錄抄回來 → 復活；
    //   名字稍微換個說法（宿醉→宿醉頭痛）就被當成新的，從零算。
    //   規則：AI 只能讓剩餘回合變少或拿掉，不能充值；同一個效果換說法算同一個；剛到期的 REVIVE_BLOCK 回合內 AI 寫回來不收。
    //   🔴 代價：劇情裡真的又喝醉、傷口裂開，這幾回合內也加不回去（之後要讓 Jev 判「這回合正文真的讓它加重了嗎」才放行）。
    function _sameBuff(a, b) {
        a = String(a || '').trim(); b = String(b || '').trim();
        if (!a || !b) return false;
        if (a === b) return true;
        return (a.length >= 2 && b.indexOf(a) >= 0) || (b.length >= 2 && a.indexOf(b) >= 0);
    }
    function _findBuff(st, name) { return st.buffs.find(b => _sameBuff(b.name, name)) || null; }
    function _justExpired(st, name) { return (st.expired || []).some(e => _sameBuff(e.name, name) && (st.turn | 0) - (e.turn | 0) <= REVIVE_BLOCK); }
    function applyBuff(st, name, rounds, total) {
        name = String(name || '').trim();
        if (!name) return;
        const n = (rounds == null || rounds === '') ? 3 : parseInt(String(rounds).replace(/[^\d\-]/g, ''), 10);
        const old = _findBuff(st, name);
        if (!(n > 0)) { if (old) st.buffs.splice(st.buffs.indexOf(old), 1); }
        else if (old) { old.left = Math.min(n, old.left | 0); old.total = Math.max(old.total | 0, total || n); }   // 只准變少，不重設年齡
        else if (!_justExpired(st, name)) st.buffs.push({ name: name, left: n, total: total || n, age: 0 });
    }
    function setBuff(name, rounds) {
        return run(async () => { const st = await load(); applyBuff(st, name, rounds); await save(); });
    }
    // ✅ 約定做完／取消：AI 每輪整份重寫日曆那行，做完了會寫「周末下午去拍照(已完成)」。
    //   以前整串標題比對，括號一加就當另一個約定，原本那筆永遠掛在「近期約定」、每輪又送回去說還沒到。
    //   現在把尾巴的括號狀態剝下來：完成／結束／取消 → 把同一個約定打勾；進行中／今天這類只剝掉不算。
    //   地點那種括號（某某咖啡店）不認得就停，留在標題裡；比對「是不是同一個」時才把括號全拿掉、簡繁折一起。
    const NONE_RE = /^(无|無|none|暂无|暫無|无约定|無約定|没有|沒有|-|—)$/i;
    function _splitMark(title) {
        let t = String(title || '').trim(), status = '';
        let m;
        while ((m = t.match(/[（(【\[]\s*([^()（）【】\[\]]{1,10}?)\s*[)）】\]]\s*$/))) {
            const w = m[1];
            if (/取消|作废|作廢|爽约|爽約/.test(w)) status = status || 'cancel';
            else if (/完成|结束|結束|赴约|赴約|履约|履約|已过|已過|搞定/.test(w)) status = status || 'done';
            else if (!/进行|進行|今天|今日|明天|待定|待发|待發/.test(w)) break;
            t = t.slice(0, m.index).trim();
        }
        return { base: t, status: status };
    }
    function _evKey(title) {
        const s = String(title || '').replace(/[（(【\[][^()（）【】\[\]]*[)）】\]]/g, '');
        const Z = win.OS_ZH || window.OS_ZH;
        return Z && Z.key ? Z.key(s) : s.replace(/\s+/g, '');
    }
    // 日期那格「6/25 18:00」「6/25 晚上」「今晚」「明天」＋標題「晚上六點去吃飯」→ 哪天、幾點（或哪個時段）
    //   今天／明天這類照故事時鐘換成日期（AI 常寫「今晚」）；她自己打「18:00 吃飯」開頭那個鐘點從標題拿掉
    const REL_DAY = [[/^(今天|今日|今晚|今早|今夜|今天晚上|今天下午|今天早上)/, 0], [/^(明天|明日|明晚|明早|隔天)/, 1], [/^(後天|后天)/, 2]];
    // 日曆那行少寫一個「|」：「日曆|今天 早上 晨跑(取消)」「日曆|6/20 買一束花(已完成)」→ 開頭的日期／時間切下來當日期那格
    //   10-10 公益站 flash 真的這樣寫（四行裡兩行），不切的話整行讀不到、那件事永遠收不掉
    const WHEN_HEAD = new RegExp('^((?:\\d{4}\\s*[\\/\\-年.]\\s*)?\\d{1,2}\\s*[\\/\\-月.]\\s*\\d{1,2}\\s*[日號号]?|今天|今日|今晚|今早|今夜|明天|明日|明晚|明早|隔天|後天|后天)' +
        '((?:\\s*(?:\\d{1,2}\\s*[:：]\\s*\\d{2}|(?:' + DAYPART + ')(?:\\s*[零一二兩两三四五六七八九十\\d]{1,3}\\s*[點点時时]半?)?))?)\\s+(.+)$');
    function _peelWhen(s) {
        const m = String(s || '').trim().match(WHEN_HEAD);
        return m ? { when: (m[1] + ' ' + (m[2] || '')).trim(), rest: m[3].trim() } : null;
    }
    function _whenOf(st, dateStr, title) {
        const ds = String(dateStr || '').trim();
        let date = parseDate(ds), rest = ds;
        if (date) rest = ds.replace(/(\d{4}\s*[\/\-年.]\s*)?\d{1,2}\s*[\/\-月.]\s*\d{1,2}\s*[日號号]?/, '');
        else if (st && st.date) {
            const r = REL_DAY.find(x => x[0].test(ds));
            if (r) { date = _addDays(st.date, r[1]); rest = ds; }
        }
        title = String(title || '').trim();
        const lead = title.match(/^\s*(\d{1,2}\s*[:：]\s*\d{2})\s*/);
        if (lead) title = title.slice(lead[0].length).trim();
        const time = clockOf(rest, true) || (lead ? clockOf(lead[1], true) : '') || slotWordOf(rest) || clockOf(title) || slotWordOf(title);
        return { date, time, title };
    }
    function _addDays(d, n) {
        const y = d.y || 2001;
        const t = new Date(y, d.m - 1, d.d + n);
        const out = { m: t.getMonth() + 1, d: t.getDate() };
        if (d.y) out.y = t.getFullYear();
        return out;
    }
    // 換了說法的同一件（多寫一個人、多寫地點、把兩步併成一句）：字大半一樣
    //   她 10-10 截圖：同一頓晚餐多寫了一個人、同一趟送貨寫了三種說法，每換一次就多一列
    //   「和小明吃午餐」對「和小明吃晚餐」不算（只有一半一樣，而且多半時段也不同）
    function _bigrams(k) { const o = []; for (let i = 0; i + 1 < k.length; i++) o.push(k.slice(i, i + 2)); return o; }
    function _alike(a, b, sameClock) {
        const A = _bigrams(a), B = _bigrams(b);
        if (!A.length || !B.length) return false;
        const left = new Map();
        B.forEach(x => left.set(x, (left.get(x) || 0) + 1));
        let hit = 0;
        A.forEach(x => { const n = left.get(x) || 0; if (n > 0) { hit++; left.set(x, n - 1); } });
        const dice = 2 * hit / (A.length + B.length), short = Math.min(A.length, B.length), cover = hit / short;
        if (sameClock) return dice >= 0.4 || cover >= 0.5;   // 同一天同一個鐘點：只要有一點像就是同一件
        return dice >= 0.75 || (short >= 4 && cover >= 0.8);
    }
    // 兩個時間撞不撞：都寫了鐘點、差超過一小時，或時段不同，就不是同一件
    function _timeClash(a, b) {
        if (!a || !b) return false;
        const ma = minsOf(a), mb = minsOf(b);
        if (ma != null && mb != null) return Math.abs(ma - mb) > 60;
        return slotOf(a) !== slotOf(b);
    }
    //   她自己記的、微信說好的、委託卡也找：日曆要 AI 每輪整份重寫，它會把「近期約定」裡她記的那筆、進行中的委託也抄進來，
    //   不找的話每抄一次就多一列 AI 的分身（失憶檢查抓到的）。劇情寫的優先。
    function _findAlike(st, d, time, k) {
        const hit = e => e.date && dateKey(e.date) === dateKey(d) && _evKey(e.title) !== k && !_timeClash(e.time, time)
            && _alike(_evKey(e.title), k, !!(time && e.time && minsOf(time) != null && minsOf(time) === minsOf(e.time)));
        return st.events.find(e => e.src === 'ai' && hit(e)) || st.events.find(e => e.src !== 'ai' && !e.done && hit(e)) || null;
    }
    // 認成同一列時：劇情寫的、還沒結束的換成 AI 最新的說法（她自己改過標題的不蓋）；這次有寫時間就以這次為準。
    //   她記的、微信說好的、委託卡是別人的那一列：AI 抄過來只當「有寫到」，不改它的字和時間
    function _settle(ev, w) {
        if (ev.src !== 'ai') return;
        if (!ev.done && !ev.edited && w.title && ev.title !== w.title) ev.title = w.title;
        if (w.time) ev.time = w.time;
    }
    function addEventTo(st, dateStr, title, note, src, msgId) {
        const sm = _splitMark(title);
        const w = _whenOf(st, dateStr, sm.base);
        const d = w.date;
        title = w.title;
        if (!d || !title || NONE_RE.test(title)) return null;
        const k = _evKey(title);
        const same = st.events.filter(e => _evKey(e.title) === k);
        const sameDay = (e) => e.date && dateKey(e.date) === dateKey(d);
        const alike = () => ((src || 'ai') === 'ai' ? _findAlike(st, d, w.time, k) : null);
        // 'gone'＝連著幾輪日曆都沒寫它（見 applyStatusBlock）；之後又寫回來就不算結束
        const open = (e) => !e.done || e.done === 'gone';
        if (sm.status) {
            let target = same.find(e => open(e) && sameDay(e)) || same.find(open);
            if (!target) { const a = alike(); if (a && open(a)) target = a; }
            if (target && target.src === 'mission') return target;   // 委託只認錢真的進來（或她按不辦了），AI 寫已完成不算
            if (target) { _settle(target, w); target.done = sm.status; target.doneTs = Date.now(); target.miss = 0; return target; }
            const already = same.find(e => e.done);
            if (already) return already;
        } else {
            const dup = same.find(sameDay) || alike();
            if (dup && dup.src !== 'ai') return dup;
            if (dup) { if (dup.done === 'gone') { delete dup.done; delete dup.doneTs; } _settle(dup, w); dup.miss = 0; return dup; }
        }
        const ev = { id: 'ev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), date: d, time: w.time || '', title: title, note: String(note || ''), src: src || 'ai', ts: Date.now() };
        if (sm.status) { ev.done = sm.status; ev.doneTs = Date.now(); }
        if (msgId != null) ev.msg = String(msgId);
        st.events.push(ev);
        _sortEvents(st);
        return ev;
    }
    // 已經堆出來的重複（改之前留下的、或同一輪先後寫了兩種說法）：同一天、時間不打架、字大半一樣的「劇情沒再提」那列拿掉，
    //   留還在的那列（兩列都是沒再提的，留後寫的那列）。只動劇情寫的；她自己記的、微信說好的、委託卡不碰。
    function _dedupe(st) {
        const all = st.events.slice();
        const twin = (e, g) => e !== g && e.src === 'ai' && e.date && g.date && dateKey(e.date) === dateKey(g.date) && !_timeClash(e.time, g.time)
            && (_evKey(e.title) === _evKey(g.title) || _alike(_evKey(e.title), _evKey(g.title), !!(e.time && g.time && minsOf(e.time) != null && minsOf(e.time) === minsOf(g.time))));
        const drop = new Set();
        all.forEach(g => {
            if (g.src !== 'ai' || g.done !== 'gone') return;
            if (all.some(e => twin(e, g) && (e.done !== 'gone' || (e.ts || 0) > (g.ts || 0)))) drop.add(g);
        });
        if (!drop.size) return false;
        st.events = st.events.filter(e => !drop.has(e));
        return true;
    }
    // 改之前記的約定沒有 time 欄：從標題補（「晚上六點…」→ 18:00）
    function _fillTime(e) { if (e && e.time == null) e.time = e.title ? (clockOf(e.title) || slotWordOf(e.title)) : ''; }

    // ── 委託卡：接了委託就在日曆上佔一格（從接的那個時間開始、進行中），收到報酬＝辦完了、按「不辦了」＝不辦了 ──
    //   她 10-10：「委託卡似乎也能卡上去當時段」。地圖（map_core）接取／入帳／不辦了的時候叫；AI 不用寫，
    //   也不會被算成「劇情沒再提」（那條只看劇情寫的）。跟委託紀錄一樣不跟著劇情回朔。
    function missionStart(m) {
        return run(async () => {
            const st = await load();
            if (!m || !m.id || !st.date) return null;
            const id = String(m.id);
            const had = st.events.find(e => e.src === 'mission' && e.mission === id);
            if (had) return had;
            const ev = { id: 'ev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), date: Object.assign({}, st.date), time: minsOf(st.time) != null ? st.time : '',
                title: String(m.title || '委託').trim() || '委託', note: '', src: 'mission', mission: id, ts: Date.now() };
            st.events.push(ev);
            _sortEvents(st);
            await save();
            return ev;
        });
    }
    function missionEnd(id, how) {
        return run(async () => {
            const st = await load();
            const ev = st.events.find(e => e.src === 'mission' && e.mission === String(id));
            if (!ev || ev.done) return false;
            ev.done = how === 'cancel' ? 'cancel' : 'done';
            ev.doneTs = Date.now();
            if (st.date) ev.endDate = Object.assign({}, st.date);
            if (minsOf(st.time) != null) ev.endTime = st.time;
            await save();
            return true;
        });
    }
    function addEvent(dateStr, title, note, src, msgId) {
        return run(async () => { const st = await load(); const ev = addEventTo(st, dateStr, title, note, src, msgId); if (ev) await save(); return ev; });
    }
    function updateEvent(id, patch) {
        return run(async () => {
            const st = await load();
            const ev = st.events.find(e => e.id === id);
            if (!ev) return false;
            // 日曆的「改一下」帶著鐘點給她改（18:00 與某某聚餐）：開頭的鐘點拿出來當時間
            if (patch && patch.title != null) { const w = _whenOf(st, '', String(patch.title)); if (w.title) { ev.title = w.title; ev.time = w.time || ''; } }
            if (patch && patch.date) { const d = parseDate(patch.date); if (d) ev.date = d; }
            ev.edited = true;
            _sortEvents(st);
            await save();
            return true;
        });
    }
    function removeEvent(id) {
        return run(async () => { const st = await load(); const i = st.events.findIndex(e => e.id === id); if (i >= 0) { st.events.splice(i, 1); await save(); } });
    }

    // ── 她那套 <os_status> 區塊 ──
    //   日期|6/20  主角名|X  HP|65/100  BUFF/DEBUFF|宿醉(1/3)、肌肉疲勞(2/5)  日曆|6/25|一句話
    //   區塊每輪整份重寫 → 狀態效果以它為準（整份取代）；(a/b) 讀作「剩 a 回合／總 b 回合」。
    function applyStatusBlock(text, msgId) {
        return run(async () => {
            const st = await load();
            const body = String(text || '').replace(/<\/?[^>]+>/g, '\n');
            let touched = false, buffLine = null, inCal = false, hadCal = false;
            const calIds = new Set();   // 這份日曆寫到的約定
            // 一行寫好幾個約定（周末上午去修车；周末下午去拍照）拆開記
            const addCal = (dateStr, title) => {
                String(title || '').split(/[；;]/).forEach(t => { const ev = addEventTo(st, dateStr, t, '', 'ai', msgId); if (ev) { touched = true; calIds.add(ev.id); } });
            };
            body.split(/\n/).forEach(raw => {
                const line = raw.trim();
                if (!line || line.indexOf('|') < 0) return;
                const parts = line.split('|').map(x => x.trim());
                const key = parts[0].replace(/\s+/g, '').toLowerCase();
                const val = parts.slice(1).join('|').trim();
                // 日曆那行後面用 <br> 接的「明天(6/22)|下午两点拍摄」：開頭是日期就當同一張日曆的下一筆
                if (inCal && !/^(日期|日期時間|日期时间|date|時間|时间|主角名|主角|mc|name|hp|體力|体力|生命|buff\/debuff|buff|debuff|狀態|状态|狀態效果|状态效果)$/.test(key)) {
                    if (parseDate(parts[0]) || REL_DAY.some(x => x[0].test(parts[0]))) { addCal(parts[0], val); return; }   // 「明天 下午|搬家」也是下一筆
                }
                inCal = false;
                if (/^(日期|日期時間|日期时间|date|時間|时间)$/.test(key)) {
                    const d = parseDate(val);
                    if (d) { st.date = d; touched = true; }
                    const m = val.match(/(\d{1,2}\s*[:：]\s*\d{2})/); if (m) { st.time = parseTime(m[1]); touched = true; }
                } else if (/^(主角名|主角|mc|name)$/.test(key)) {
                    if (val) { st.name = val; touched = true; }
                } else if (/^(hp|體力|体力|生命)$/.test(key)) {
                    st.hp = val; touched = true;
                } else if (/^(buff\/debuff|buff|debuff|狀態|状态|狀態效果|状态效果)$/.test(key)) {
                    buffLine = val;
                } else if (/^(日曆|日历|行事曆|行事历|calendar|約定|约定|event)$/.test(key)) {
                    inCal = true; hadCal = true;
                    if (parts.length >= 3) addCal(parts[1], parts.slice(2).join('|'));
                    else if (parts.length === 2) { const pw = _peelWhen(parts[1]); if (pw) addCal(pw.when, pw.rest); }
                }
            });
            if (buffLine != null) {
                // AI 常在效果後面加一段括號說明「扭伤(1/5) (下楼梯摔了一跤，脚踝肿，已经消了一半)」，
                //   說明裡的逗號會把它切成「脚踝肿」「已经消了一半)」好幾個假效果 → 先把不是 (剩/總) 數字的括號拿掉再切
                const items = buffLine
                    .replace(/[（(](?!\s*\d+\s*(?:\/\s*\d+)?\s*[)）])[^（()）]*[)）]/g, '')
                    .split(/[、，,;；]/).map(x => x.trim()).filter(x => x && !/^(無|无|none|-)$/i.test(x));
                const next = [];
                items.forEach(it => {
                    const m = it.match(/^(.*?)\s*[（(]\s*(\d+)\s*(?:\/\s*(\d+))?\s*[)）]\s*$/);
                    const name = (m ? m[1] : it).trim();
                    const left = m ? parseInt(m[2], 10) : 3;
                    const total = m && m[3] ? parseInt(m[3], 10) : left;
                    if (!name || !(left > 0)) return;
                    const old = _findBuff(st, name);
                    if (old) {   // 已經有的：只准變少（AI 抄回原本的數字＝不理），名字沿用原本那個，免得換說法變兩條
                        if (next.some(b => b.name === old.name)) return;
                        next.push({ name: old.name, left: Math.min(left, old.left | 0), total: Math.max(old.total | 0, total), age: old.age | 0 });
                    } else if (!_justExpired(st, name)) {
                        next.push({ name: name, left: left, total: Math.max(total, left), age: 0 });
                    }
                });
                st.buffs = next;
                touched = true;
            }
            // 日曆跟狀態效果一樣是每輪整份重寫：劇情寫的約定這份日曆沒再寫＝AI 認為結束了，不再當成「還沒到」送回去。
            //   09-24 那本：6/20 把「周末」記成 6/25，隔天改寫成 6/21 另一種說法，舊的 6/25 那筆沒人收，一直掛著。
            //   只收劇情寫的（src ai）；微信說好的、她自己記的不動。這份沒有日曆那行就什麼都不收。
            //   10-10 改：漏寫一輪不算結束，連著 MISS_GONE 輪沒寫才算（她怕接委託那幾輪 AI 只寫委託、晚上的約就被當成結束、之後不再提醒）
            if (hadCal) {
                st.events.forEach(e => {
                    if (e.src !== 'ai' || e.done) return;
                    if (calIds.has(e.id)) { e.miss = 0; return; }
                    e.miss = (e.miss | 0) + 1;
                    if (e.miss >= MISS_GONE) { e.done = 'gone'; e.doneTs = Date.now(); }
                    touched = true;
                });
                if (_dedupe(st)) touched = true;
            }
            if (touched) await save();
            return touched;
        });
    }

    // 還沒到的約定（委託卡不算約定，另外列）；時間已經過了的不算（見 _passed）
    function upcoming(st, days) {
        const open = st.events.filter(e => !e.done && e.src !== 'mission');
        if (!st.date) return open.slice(0, 5);
        return open.filter(e => { const dd = dayDiff(st.date, e.date); return dd >= 0 && dd <= (days || UPCOMING_DAYS) && !_passed(st, e); });
    }
    // 過了沒：前幾天的、今天寫了鐘點而且過了一小時以上的（剛到時間＝正在赴約）、今天只寫時段而時段已經過了的
    const PASS_GRACE = 60;
    function _passed(st, e) {
        if (!st.date || !e.date) return false;
        const dd = dayDiff(st.date, e.date);
        if (dd !== 0) return dd < 0;
        const now = minsOf(st.time), r = _slotRange(e.time);
        if (now == null || !r) return false;
        return minsOf(e.time) != null ? now > r.from + PASS_GRACE : now >= r.to;
    }
    // 「今天 18:00」「明天 晚上」「6/23」
    function _whenText(st, e, date) {
        date = date || e.date;
        const dd = st.date && date ? dayDiff(st.date, date) : null;
        const day = dd === 0 ? '今天' : (dd === 1 ? '明天' : (dd === -1 ? '昨天' : fmtDate(date)));
        return day + (e.time ? ' ' + e.time : '');
    }
    // 今天寫了鐘點的：還有多久／就是現在
    function _untilText(st, e) {
        if (!st.date || !e.date || dayDiff(st.date, e.date) !== 0) return '';
        const now = minsOf(st.time), t = minsOf(e.time);
        if (now == null || t == null) return '';
        const left = t - now;
        if (left <= 0) return '時間到了';
        if (left < 60) return '還有 ' + left + ' 分鐘';
        if (left <= 360) return '還有 ' + Math.floor(left / 60) + ' 小時' + (left % 60 >= 30 ? '半' : '');
        return '';
    }
    function doneLabel(e) {
        if (e.src === 'mission') return e.done === 'cancel' ? '（不辦了）' : (e.done ? '（辦完了）' : '（進行中）');
        return e.done === 'cancel' ? '（取消了）' : (e.done === 'gone' ? '（劇情沒再提）' : (e.done ? '（已完成）' : ''));
    }
    // 委託開場要知道主角今天還有哪些約（還沒過的）：「18:00 與某某聚餐；晚上 去看展」
    async function todayPlansText() {
        if (!_on()) return '';
        const st = await load();
        if (!st.date) return '';
        return st.events.filter(e => !e.done && e.src !== 'mission' && e.date && dayDiff(st.date, e.date) === 0 && !_passed(st, e))
            .map(e => (e.time ? e.time + ' ' : '') + e.title).join('；');
    }
    function summary(st) {
        const parts = [];
        if (st.date) parts.push(fmtDate(st.date) + (st.time ? ' ' + st.time : ''));
        if (st.hp) parts.push('HP ' + st.hp);
        st.buffs.forEach(b => parts.push(b.name + ' ' + b.left));
        return parts;
    }

    // 故事畫面「設定」→「內建格式」→「主角狀態」關掉＝VN 指令裡教模型寫狀態欄那條關了：不注入、不顯示（資料留著）
    function _on() {
        try { const VR = win.OS_VN_RULES || window.OS_VN_RULES; return !(VR && VR.isOn && VR.list && VR.list().some(e => e.id === 'status_bar')) || VR.isOn('status_bar'); }
        catch (e) { return true; }
    }

    // ── 注入文字（酒館與 PWA 共用的唯一真相）──
    async function buildBlock() {
        if (!_on()) return '';
        const st = await load();
        if (!st.date && !st.hp && !st.buffs.length && !st.events.length) return '';
        const L = ['【主角狀態｜系統記錄，以此為準】'];
        if (st.name) L.push('主角：' + st.name);
        if (st.date) L.push('現在：' + fmtDate(st.date) + (st.time ? ' ' + st.time : ''));
        if (st.hp) L.push('HP：' + st.hp);
        L.push('狀態效果：' + (st.buffs.length ? st.buffs.map(b => b.name + '（剩 ' + b.left + ' 回合）').join('、') : '無'));
        const up = upcoming(st, UPCOMING_DAYS);
        if (up.length) L.push('近期約定：' + up.map(e => { const u = _untilText(st, e); return _whenText(st, e) + ' ' + e.title + (u ? '（' + u + '）' : ''); }).join('；'));
        // 委託卡：跟約定排在同一條時間線上，AI 才看得出委託會不會撞到約（怎麼結算另外由委託那段交代）
        const runMis = st.events.filter(e => e.src === 'mission' && !e.done).slice(-3);
        if (runMis.length) L.push('進行中的委託：' + runMis.map(e => '「' + e.title + '」（' + _whenText(st, e) + ' 接的）').join('；') + '（委託不用寫進日曆，系統會記）');
        // 時間過了、劇情還沒交代的：讓 AI 寫清楚去了沒，不要無聲無息地不見（她 10-10：「會不會晚上約定擱置?」）
        const late = st.events.filter(e => !e.done && e.src !== 'mission' && _passed(st, e)).slice(-3);
        if (late.length) L.push('時間已經過了、劇情還沒交代的約定：' + late.map(e => _whenText(st, e) + ' ' + e.title).join('；') + '（照前面的劇情判斷主角去了沒：去了在日曆寫(已完成)，沒去寫(取消)；不用為了它倒回去補演）');
        // 做完／取消的也放這裡（按做完的先後），AI 才知道那件事已經過去了，不會再提
        const past = st.events
            .filter(e => e.done && e.done !== 'gone')
            .sort((a, b) => ((a.doneTs || 0) - (b.doneTs || 0)) || (dateKey(a.date) - dateKey(b.date)))
            .slice(-3);
        if (past.length) L.push('已過的約定：' + past.map(e => fmtDate(e.date) + ' ' + (e.src === 'mission' ? '委託「' + e.title + '」' : e.title) + doneLabel(e)).join('；'));
        L.push('（狀態效果的剩餘回合以這裡為準往下數；時間只能往前走。）');
        return L.join('\n');
    }

    async function injectStatus() {
        try {
            try { _lastUninject && _lastUninject(); } catch (e) {}
            _lastUninject = null;
            if (win.__AURELIA_SUMMARIZING) return;
            if (win.OS_API && win.OS_API.isStandalone && win.OS_API.isStandalone()) return;   // PWA 走順序表那一格
            if (!win.TavernHelper || !win.TavernHelper.injectPrompts) return;
            await reconcileWithTavern();   // 刪文／重生的先退掉，再組
            const content = await buildBlock();
            if (!content) return;
            const r = win.TavernHelper.injectPrompts([{ id: INJECT_ID, content: content, position: 'in_chat', depth: 0, role: 'system' }], { once: true });
            _lastUninject = (r && r.uninject) || null;
        } catch (e) { console.warn('[MC Status] 注入失敗:', e); }
    }

    // ── VN 畫面上方的窄狀態列 ──
    function renderHud() {
        const docs = [typeof document !== 'undefined' ? document : null, win.document].filter((d, i, a) => d && d.getElementById && a.indexOf(d) === i);
        let el = null;
        for (const d of docs) { el = d.getElementById('mc-status-hud'); if (el) break; }
        if (!el) return;
        const st = _on() ? _cache : null;
        const parts = st ? summary(st) : [];
        if (!parts.length) { el.hidden = true; el.innerHTML = ''; return; }
        const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        let html = '';
        if (st.date) html += '<span class="mc-hud-item mc-hud-date"><i class="fa-regular fa-calendar"></i>' + esc(fmtDate(st.date) + (st.time ? ' ' + st.time : '')) + '</span>';
        if (st.hp) html += '<span class="mc-hud-item mc-hud-hp"><i class="fa-solid fa-heart"></i>' + esc(st.hp) + '</span>';
        st.buffs.forEach(b => { html += '<span class="mc-hud-item mc-hud-buff"><i class="fa-solid fa-hourglass-half"></i>' + esc(b.name) + '<b>' + b.left + '</b></span>'; });
        el.innerHTML = html;
        el.hidden = false;
    }

    // 酒館事件：每輪生成前注入；換聊天室清快取
    //   監聽器把 Promise 交回去 → 酒館 emit 會等注入完才組 prompt；最多等 2.5 秒，免得資料庫卡住連生成一起卡
    const WAIT_MS = 2500;
    function _waitFor(fn) { return Promise.race([Promise.resolve().then(fn).catch(function () {}), new Promise(function (r) { setTimeout(r, WAIT_MS); })]); }
    try {
        if (win.eventOn && win.tavern_events) {
            if (win.tavern_events.GENERATION_STARTED) win.eventOn(win.tavern_events.GENERATION_STARTED, function (type, opts, dryRun) { if (dryRun) return; return _waitFor(injectStatus); });
            if (win.tavern_events.CHAT_CHANGED) win.eventOn(win.tavern_events.CHAT_CHANGED, function () { try { _lastUninject && _lastUninject(); } catch (e) {} _lastUninject = null; _cache = null; _cacheChat = ''; renderHud(); });
        }
    } catch (e) {}

    const API = {
        load: load, save: save, onMessage: onMessage, rollbackByIds: rollbackByIds, listSnapshotIds: listSnapshotIds, reconcileWithTavern: reconcileWithTavern,
        setDate: setDate, setHp: setHp, setBuff: setBuff, addEvent: addEvent, updateEvent: updateEvent, removeEvent: removeEvent, applyStatusBlock: applyStatusBlock,
        upcoming: upcoming, doneLabel: doneLabel, sigOf: sigOf, summary: summary, buildBlock: buildBlock, injectStatus: injectStatus, renderHud: renderHud,
        parseDate: parseDate, parseTime: parseTime, fmtDate: fmtDate, dateKey: dateKey, dayDiff: dayDiff, getChatId: getChatId,
        missionStart: missionStart, missionEnd: missionEnd, todayPlansText: todayPlansText,
        clockOf: clockOf, slotOf: slotOf, slotWordOf: slotWordOf, minsOf: minsOf, SLOTS: SLOTS.map(x => x.id),
        resetCache: function () { _cache = null; _cacheChat = ''; },
    };
    win.OS_MC_STATUS = API;
    if (win !== window) window.OS_MC_STATUS = API;
    console.log('🕰 [MC Status] 主角狀態與故事時鐘已載入');
})();
