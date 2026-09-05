// ----------------------------------------------------------------
// [檔案] mc_status.js
// 職責：主角狀態與故事時鐘——「模型只回報變化，程式負責記住、倒數、再塞回去」。
//   VN 腳本回合末尾的四種標籤（vn_core.next 解析後打進來）：
//     [Date|月/日|時:分]   故事時鐘（每回合都寫；只記最新）
//     [HP|數值]            主角體力
//     [Buff|名|回合]       狀態效果（新增或改變才寫；每個新回合程式自動減 1，歸零消失，最多活 20 回合）
//     [Event|月/日|一句話] 約定／期限／預定行程（收進日曆，同日期同標題不重複）
//   每輪生成前把「現在幾點、HP、還在身上的效果各剩幾輪、七天內的約定」組成一小段注入：
//     酒館走 TavernHelper.injectPrompts（跟 os_app_memory_inject 同款、once、不貼回 chat）；
//     PWA 走提示詞順序表的 mc_status 那一格（os_api_engine 組裝時呼叫 buildBlock）。
//   資料：OS_DB.app_data（appId=mc_status、chat scope），跟狀態系統／副模型完全無關——她拍板不給副模型加負擔。
//   日曆 app（os_calendar.js）讀寫同一份。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const APP_ID = 'mc_status';
    const INJECT_ID = 'aurelia_mc_status';
    const MAX_BUFF_AGE = 20;     // 效果最多活這麼多回合，防模型忘了寫 0 賴著不走
    const UPCOMING_DAYS = 7;     // 注入「近期約定」看幾天內
    const SEEN_MAX = 60;         // 記住最近幾則訊息 id，防重播同一則時再倒數一次

    let _cache = null, _cacheChat = '';
    let _lastUninject = null;

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

    function blank() { return { date: null, time: '', hp: '', buffs: [], events: [], seen: [] }; }

    async function load() {
        const cid = getChatId();
        if (!cid) return blank();
        if (_cache && _cacheChat === cid) return _cache;
        let d = null;
        try { d = await win.OS_DB.getAppData(APP_ID, 'state', cid); } catch (e) { console.warn('[MC Status] 讀取失敗:', e); }
        _cache = Object.assign(blank(), d || {});
        if (!Array.isArray(_cache.buffs)) _cache.buffs = [];
        if (!Array.isArray(_cache.events)) _cache.events = [];
        if (!Array.isArray(_cache.seen)) _cache.seen = [];
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

    // ── 回合：每則新訊息只倒數一次 ──
    async function onMessage(msgId) {
        const st = await load();
        if (msgId == null || msgId === '') return st;
        const id = String(msgId);
        if (st.seen.indexOf(id) >= 0) return st;
        st.seen.push(id);
        if (st.seen.length > SEEN_MAX) st.seen.splice(0, st.seen.length - SEEN_MAX);
        st.buffs.forEach(b => { b.left = (b.left | 0) - 1; b.age = (b.age | 0) + 1; });
        st.buffs = st.buffs.filter(b => b.left > 0 && b.age <= MAX_BUFF_AGE);
        await save();   // seen 名單也要落地，不然重整後同一則會再倒數一次
        return st;
    }

    async function setDate(dateStr, timeStr) {
        const st = await load();
        const d = parseDate(dateStr);
        let t = timeStr ? parseTime(timeStr) : '';
        if (!t) { const m = String(dateStr || '').match(/(\d{1,2}\s*[:：]\s*\d{2})/); if (m) t = parseTime(m[1]); }
        let changed = false;
        if (d) { st.date = d; changed = true; }
        if (t) { st.time = t; changed = true; }
        if (changed) await save();
        return changed;
    }
    async function setHp(v) {
        const st = await load();
        st.hp = String(v || '').trim();
        await save();
    }
    async function setBuff(name, rounds) {
        const st = await load();
        name = String(name || '').trim();
        if (!name) return;
        const n = (rounds == null || rounds === '') ? 3 : parseInt(String(rounds).replace(/[^\d\-]/g, ''), 10);
        const i = st.buffs.findIndex(b => b.name === name);
        if (!(n > 0)) { if (i >= 0) st.buffs.splice(i, 1); }
        else if (i >= 0) { st.buffs[i].left = n; st.buffs[i].total = Math.max(st.buffs[i].total | 0, n); st.buffs[i].age = 0; }
        else st.buffs.push({ name: name, left: n, total: n, age: 0 });
        await save();
    }
    async function addEvent(dateStr, title, note, src) {
        const st = await load();
        const d = parseDate(dateStr);
        title = String(title || '').trim();
        if (!d || !title) return null;
        const dup = st.events.find(e => e.date && dateKey(e.date) === dateKey(d) && e.title === title);
        if (dup) return dup;
        const ev = { id: 'ev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), date: d, title: title, note: String(note || ''), src: src || 'ai', ts: Date.now() };
        st.events.push(ev);
        st.events.sort((a, b) => dateKey(a.date) - dateKey(b.date));
        await save();
        return ev;
    }
    async function removeEvent(id) {
        const st = await load();
        const i = st.events.findIndex(e => e.id === id);
        if (i >= 0) { st.events.splice(i, 1); await save(); }
    }
    function upcoming(st, days) {
        if (!st.date) return st.events.slice(0, 5);
        return st.events.filter(e => { const dd = dayDiff(st.date, e.date); return dd >= 0 && dd <= (days || UPCOMING_DAYS); });
    }
    // HUD 用的小片段：['6/20 18:30', 'HP 80', '肌肉鬆弛 3']
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
        if (st.date) L.push('現在：' + fmtDate(st.date) + (st.time ? ' ' + st.time : ''));
        if (st.hp) L.push('HP：' + st.hp);
        L.push('狀態效果：' + (st.buffs.length ? st.buffs.map(b => b.name + '（剩 ' + b.left + ' 回合）').join('、') : '無'));
        const up = upcoming(st, UPCOMING_DAYS);
        if (up.length) L.push('近期約定：' + up.map(e => fmtDate(e.date) + ' ' + e.title).join('；'));
        const past = st.date ? st.events.filter(e => dayDiff(st.date, e.date) < 0).slice(-3) : [];
        if (past.length) L.push('已過的約定：' + past.map(e => fmtDate(e.date) + ' ' + e.title).join('；'));
        L.push('回合末尾照格式回報 [Date|月/日|時:分] 與 [HP|數值]；狀態效果只在新增或改變時寫 [Buff|名|回合]，系統會自己遞減、不用重寫；新的約定寫 [Event|月/日|一句話]，已在名單裡的不要重寫。時間只能往前走。');
        return L.join('\n');
    }

    async function injectStatus() {
        try {
            try { _lastUninject && _lastUninject(); } catch (e) {}
            _lastUninject = null;
            if (win.__AURELIA_SUMMARIZING) return;
            if (win.OS_API && win.OS_API.isStandalone && win.OS_API.isStandalone()) return;   // PWA 走順序表那一格
            if (!win.TavernHelper || !win.TavernHelper.injectPrompts) return;
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
        load: load, save: save, onMessage: onMessage,
        setDate: setDate, setHp: setHp, setBuff: setBuff, addEvent: addEvent, removeEvent: removeEvent,
        upcoming: upcoming, summary: summary, buildBlock: buildBlock, injectStatus: injectStatus, renderHud: renderHud,
        parseDate: parseDate, parseTime: parseTime, fmtDate: fmtDate, dateKey: dateKey, dayDiff: dayDiff, getChatId: getChatId,
        resetCache: function () { _cache = null; _cacheChat = ''; },
    };
    win.OS_MC_STATUS = API;
    if (win !== window) window.OS_MC_STATUS = API;
    console.log('🕰 [MC Status] 主角狀態與故事時鐘已載入');
})();
