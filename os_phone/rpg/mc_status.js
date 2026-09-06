// ----------------------------------------------------------------
// [檔案] mc_status.js
// 職責：主角狀態與故事時鐘——「模型只回報變化，程式負責記住、倒數、再塞回去」。
//   VN 腳本回合末尾兩種寫法都認：
//     ① 標籤：[Date|月/日|時:分] [HP|數值] [Buff|名|回合] [Event|月/日|一句話]（vn_core.next 解析後打進來）
//     ② 區塊：<os_status> … 日期|6/20 / HP|65/100 / BUFF/DEBUFF|名(剩/總)、… / 日曆|6/20|一句話 … </os_status>
//        （她自己貼給主模型的那份格式；vn_core.loadScript 先整塊撈出來餵這裡、再從劇本剝掉）
//   回合：每則新訊息讓狀態效果倒數一回合（區塊寫法由模型直接給數字，以它為準）。
//   回朔：每則訊息處理前存一張快照。同一則再進來（swipe／重生／編輯）先退回快照再套新內容；
//        每輪生成前對帳，聊天裡已經不在的訊息退回最早那則的快照。她手動記的約定不跟著回朔。
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

    function blank() { return { date: null, time: '', hp: '', name: '', buffs: [], events: [], snaps: {}, snapOrder: [] }; }

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
            buffs: st.buffs,
            events: st.events.filter(e => e.src !== 'me'),   // 她手動記的不進快照、也不被回朔
        }));
    }
    function restoreSnapshot(st, snap) {
        st.date = snap.date || null; st.time = snap.time || ''; st.hp = snap.hp || ''; st.name = snap.name || '';
        st.buffs = JSON.parse(JSON.stringify(snap.buffs || []));
        const mine = st.events.filter(e => e.src === 'me');
        st.events = JSON.parse(JSON.stringify(snap.events || [])).concat(mine);
        st.events.sort((a, b) => dateKey(a.date) - dateKey(b.date));
    }
    function dropSnapsFrom(st, idx) {
        const gone = st.snapOrder.splice(idx);
        gone.forEach(k => { delete st.snaps[k]; });
        return gone;
    }

    // ── 回合：每則訊息處理前存快照；同一則再進來先退回快照 ──
    function onMessage(msgId) {
        return run(async () => {
            const st = await load();
            if (msgId == null || msgId === '') return st;
            const id = String(msgId);
            const idx = st.snapOrder.indexOf(id);
            if (idx >= 0) {
                // swipe／重生／編輯：退回這則處理前的樣子，它之後的快照也一併作廢（後面的內容會重新進來）
                restoreSnapshot(st, st.snaps[id]);
                dropSnapsFrom(st, idx);
            }
            st.snaps[id] = snapshotOf(st);
            st.snapOrder.push(id);
            if (st.snapOrder.length > SNAP_MAX) { const old = st.snapOrder.shift(); delete st.snaps[old]; }
            st.buffs.forEach(b => { b.left = (b.left | 0) - 1; b.age = (b.age | 0) + 1; });
            st.buffs = st.buffs.filter(b => b.left > 0 && b.age <= MAX_BUFF_AGE);
            await save();
            return st;
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
    // 酒館：訊息 id 就是樓層索引，聊天縮短＝尾巴那幾樓被刪或重生 → 那幾則的快照該退
    async function reconcileWithTavern() {
        try {
            const ctx = win.SillyTavern && win.SillyTavern.getContext && win.SillyTavern.getContext();
            const chat = ctx && ctx.chat;
            if (!Array.isArray(chat)) return 0;
            const st = await load();
            const dead = st.snapOrder.filter(id => /^\d+$/.test(id) && parseInt(id, 10) >= chat.length);
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
    function applyBuff(st, name, rounds, total) {
        name = String(name || '').trim();
        if (!name) return;
        const n = (rounds == null || rounds === '') ? 3 : parseInt(String(rounds).replace(/[^\d\-]/g, ''), 10);
        const i = st.buffs.findIndex(b => b.name === name);
        if (!(n > 0)) { if (i >= 0) st.buffs.splice(i, 1); }
        else if (i >= 0) { st.buffs[i].left = n; st.buffs[i].total = Math.max(st.buffs[i].total | 0, total || n); st.buffs[i].age = 0; }
        else st.buffs.push({ name: name, left: n, total: total || n, age: 0 });
    }
    function setBuff(name, rounds) {
        return run(async () => { const st = await load(); applyBuff(st, name, rounds); await save(); });
    }
    function addEventTo(st, dateStr, title, note, src, msgId) {
        const d = parseDate(dateStr);
        title = String(title || '').trim();
        if (!d || !title) return null;
        const dup = st.events.find(e => e.date && dateKey(e.date) === dateKey(d) && e.title === title);
        if (dup) return dup;
        const ev = { id: 'ev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), date: d, title: title, note: String(note || ''), src: src || 'ai', ts: Date.now() };
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
            let touched = false, buffLine = null;
            body.split(/\n/).forEach(raw => {
                const line = raw.trim();
                if (!line || line.indexOf('|') < 0) return;
                const parts = line.split('|').map(x => x.trim());
                const key = parts[0].replace(/\s+/g, '').toLowerCase();
                const val = parts.slice(1).join('|').trim();
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
                    if (parts.length >= 3 && addEventTo(st, parts[1], parts.slice(2).join('|'), '', 'ai', msgId)) touched = true;
                }
            });
            if (buffLine != null) {
                const items = buffLine.split(/[、，,;；]/).map(x => x.trim()).filter(x => x && !/^(無|无|none|-)$/i.test(x));
                const next = [];
                items.forEach(it => {
                    const m = it.match(/^(.*?)\s*[（(]\s*(\d+)\s*(?:\/\s*(\d+))?\s*[)）]\s*$/);
                    const name = (m ? m[1] : it).trim();
                    const left = m ? parseInt(m[2], 10) : 3;
                    const total = m && m[3] ? parseInt(m[3], 10) : left;
                    if (!name || !(left > 0)) return;
                    const old = st.buffs.find(b => b.name === name);
                    next.push({ name: name, left: left, total: Math.max(total, left), age: old ? (old.age | 0) : 0 });
                });
                st.buffs = next;
                touched = true;
            }
            if (touched) await save();
            return touched;
        });
    }

    function upcoming(st, days) {
        if (!st.date) return st.events.slice(0, 5);
        return st.events.filter(e => { const dd = dayDiff(st.date, e.date); return dd >= 0 && dd <= (days || UPCOMING_DAYS); });
    }
    function summary(st) {
        const parts = [];
        if (st.date) parts.push(fmtDate(st.date) + (st.time ? ' ' + st.time : ''));
        if (st.hp) parts.push('HP ' + st.hp);
        st.buffs.forEach(b => parts.push(b.name + ' ' + b.left));
        return parts;
    }

    // ── 注入文字（酒館與 PWA 共用的唯一真相）──
    async function buildBlock() {
        const st = await load();
        if (!st.date && !st.hp && !st.buffs.length && !st.events.length) return '';
        const L = ['【主角狀態｜系統記錄，以此為準】'];
        if (st.name) L.push('主角：' + st.name);
        if (st.date) L.push('現在：' + fmtDate(st.date) + (st.time ? ' ' + st.time : ''));
        if (st.hp) L.push('HP：' + st.hp);
        L.push('狀態效果：' + (st.buffs.length ? st.buffs.map(b => b.name + '（剩 ' + b.left + ' 回合）').join('、') : '無'));
        const up = upcoming(st, UPCOMING_DAYS);
        if (up.length) L.push('近期約定：' + up.map(e => fmtDate(e.date) + ' ' + e.title).join('；'));
        const past = st.date ? st.events.filter(e => dayDiff(st.date, e.date) < 0).slice(-3) : [];
        if (past.length) L.push('已過的約定：' + past.map(e => fmtDate(e.date) + ' ' + e.title).join('；'));
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
        const st = _cache;
        const parts = st ? summary(st) : [];
        if (!parts.length) { el.hidden = true; el.innerHTML = ''; return; }
        const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        let html = '';
        if (st.date) html += '<span class="mc-hud-item mc-hud-date"><i class="fa-regular fa-calendar"></i>' + esc(fmtDate(st.date) + (st.time ? ' ' + st.time : '')) + '</span>';
        if (st.hp) html += '<span class="mc-hud-item mc-hud-hp"><i class="fa-solid fa-heart"></i>' + esc(st.hp) + '</span>';
        st.buffs.forEach(b => { html += '<span class="mc-hud-item mc-hud-buff">' + esc(b.name) + '<b>' + b.left + '</b></span>'; });
        el.innerHTML = html;
        el.hidden = false;
    }

    // 酒館事件：每輪生成前注入；換聊天室清快取
    try {
        if (win.eventOn && win.tavern_events) {
            if (win.tavern_events.GENERATION_STARTED) win.eventOn(win.tavern_events.GENERATION_STARTED, function (type, opts, dryRun) { if (dryRun) return; injectStatus(); });
            if (win.tavern_events.CHAT_CHANGED) win.eventOn(win.tavern_events.CHAT_CHANGED, function () { try { _lastUninject && _lastUninject(); } catch (e) {} _lastUninject = null; _cache = null; _cacheChat = ''; renderHud(); });
        }
    } catch (e) {}

    const API = {
        load: load, save: save, onMessage: onMessage, rollbackByIds: rollbackByIds, listSnapshotIds: listSnapshotIds, reconcileWithTavern: reconcileWithTavern,
        setDate: setDate, setHp: setHp, setBuff: setBuff, addEvent: addEvent, updateEvent: updateEvent, removeEvent: removeEvent, applyStatusBlock: applyStatusBlock,
        upcoming: upcoming, summary: summary, buildBlock: buildBlock, injectStatus: injectStatus, renderHud: renderHud,
        parseDate: parseDate, parseTime: parseTime, fmtDate: fmtDate, dateKey: dateKey, dayDiff: dayDiff, getChatId: getChatId,
        resetCache: function () { _cache = null; _cacheChat = ''; },
    };
    win.OS_MC_STATUS = API;
    if (win !== window) window.OS_MC_STATUS = API;
    console.log('🕰 [MC Status] 主角狀態與故事時鐘已載入');
})();
