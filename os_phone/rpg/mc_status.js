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
//   約定：AI 寫「(已完成)」「(取消)」就打勾；日曆那行每輪整份重寫，沒再寫的劇情約定不再當成「還沒到」。
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
        _cacheChat = cid;
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
    function snapshotOf(st) {
        return JSON.parse(JSON.stringify({
            date: st.date, time: st.time, hp: st.hp, name: st.name,
            buffs: st.buffs, turn: st.turn | 0, expired: st.expired || [],
            events: st.events.filter(e => e.src !== 'me'),   // 她手動記的不進快照、也不被回朔
        }));
    }
    function restoreSnapshot(st, snap) {
        st.date = snap.date || null; st.time = snap.time || ''; st.hp = snap.hp || ''; st.name = snap.name || '';
        st.buffs = JSON.parse(JSON.stringify(snap.buffs || []));
        st.turn = snap.turn | 0;
        st.expired = JSON.parse(JSON.stringify(snap.expired || []));
        const mine = st.events.filter(e => e.src === 'me');
        st.events = JSON.parse(JSON.stringify(snap.events || [])).concat(mine);
        st.events.sort((a, b) => dateKey(a.date) - dateKey(b.date));
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
    function addEventTo(st, dateStr, title, note, src, msgId) {
        const d = parseDate(dateStr);
        const sm = _splitMark(title);
        title = sm.base;
        if (!d || !title || NONE_RE.test(title)) return null;
        const k = _evKey(title);
        const same = st.events.filter(e => _evKey(e.title) === k);
        const sameDay = (e) => e.date && dateKey(e.date) === dateKey(d);
        // 'gone'＝某一輪日曆沒寫它（見 applyStatusBlock）；之後又寫回來就不算結束
        const open = (e) => !e.done || e.done === 'gone';
        if (sm.status) {
            const target = same.find(e => open(e) && sameDay(e)) || same.find(open);
            if (target) { target.done = sm.status; target.doneTs = Date.now(); return target; }
            const already = same.find(e => e.done);
            if (already) return already;
        } else {
            const dup = same.find(sameDay);
            if (dup) { if (dup.done === 'gone') { delete dup.done; delete dup.doneTs; } return dup; }
        }
        const ev = { id: 'ev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), date: d, title: title, note: String(note || ''), src: src || 'ai', ts: Date.now() };
        if (sm.status) { ev.done = sm.status; ev.doneTs = Date.now(); }
        if (msgId != null) ev.msg = String(msgId);
        st.events.push(ev);
        st.events.sort((a, b) => dateKey(a.date) - dateKey(b.date));
        return ev;
    }
    function addEvent(dateStr, title, note, src, msgId) {
        return run(async () => { const st = await load(); const ev = addEventTo(st, dateStr, title, note, src, msgId); if (ev) await save(); return ev; });
    }
    function updateEvent(id, patch) {
        return run(async () => {
            const st = await load();
            const ev = st.events.find(e => e.id === id);
            if (!ev) return false;
            if (patch && patch.title != null) ev.title = String(patch.title).trim() || ev.title;
            if (patch && patch.date) { const d = parseDate(patch.date); if (d) ev.date = d; }
            ev.edited = true;
            st.events.sort((a, b) => dateKey(a.date) - dateKey(b.date));
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
                    if (parseDate(parts[0])) { addCal(parts[0], val); return; }
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
            if (hadCal) {
                st.events.forEach(e => {
                    if (e.src === 'ai' && !e.done && !calIds.has(e.id)) { e.done = 'gone'; e.doneTs = Date.now(); touched = true; }
                });
            }
            if (touched) await save();
            return touched;
        });
    }

    function upcoming(st, days) {
        const open = st.events.filter(e => !e.done);
        if (!st.date) return open.slice(0, 5);
        return open.filter(e => { const dd = dayDiff(st.date, e.date); return dd >= 0 && dd <= (days || UPCOMING_DAYS); });
    }
    function doneLabel(e) { return e.done === 'cancel' ? '（取消了）' : (e.done === 'gone' ? '（劇情沒再提）' : (e.done ? '（已完成）' : '')); }
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
        if (up.length) L.push('近期約定：' + up.map(e => fmtDate(e.date) + ' ' + e.title).join('；'));
        // 做完／取消的也放這裡（按做完的先後），AI 才知道那件事已經過去了，不會再提
        const past = st.events
            .filter(e => (e.done && e.done !== 'gone') || (!e.done && st.date && dayDiff(st.date, e.date) < 0))
            .sort((a, b) => ((a.doneTs || 0) - (b.doneTs || 0)) || (dateKey(a.date) - dateKey(b.date)))
            .slice(-3);
        if (past.length) L.push('已過的約定：' + past.map(e => fmtDate(e.date) + ' ' + e.title + doneLabel(e)).join('；'));
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
        resetCache: function () { _cache = null; _cacheChat = ''; },
    };
    win.OS_MC_STATUS = API;
    if (win !== window) window.OS_MC_STATUS = API;
    console.log('🕰 [MC Status] 主角狀態與故事時鐘已載入');
})();
