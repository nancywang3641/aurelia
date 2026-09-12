// ----------------------------------------------------------------
// [手機] os_usage.js —— 用量記錄層（每一次呼叫都留一筆，關掉 app 不歸零）
// 職責：
//   奧瑞亞每跟模型講一次話、每生一張圖，都在這裡記一筆：什麼時候、哪件事、
//   走哪條通道、哪個模型、送出/回來多少 token、花多久、成不成功。
//   記在自己的 IndexedDB（Aurelia_Usage_DB），跟手機那本 WeChat_Simulator_DB 分開開，
//   所以永遠不必動 os_db.js 的 DB_VERSION（升版被舊連線擋住＝全站 await 卡死）。
//   每日彙總永久保留、明細只留 30 天，關掉 app 再打開數字照樣接得上。
// 🚨 記錄不准擋路：寫入一律排隊延後批次寫，API 路徑上不 await、不丟例外。
// 🚨 只記「帳」不記內容：prompt 與回覆原文不進這個庫（那是 DEBUG 面板的環形緩衝在管）。
// 對外：OS_USAGE.start(meta) / end(rec, res) / note(entry)
//       OS_USAGE.days(from,to) / today() / recent(n) / totals(n) / clearAll()
// ----------------------------------------------------------------
(function () {
    const win = window.parent || window;
    if (win.OS_USAGE) { if (win !== window) window.OS_USAGE = win.OS_USAGE; return; }

    const DB_NAME = 'Aurelia_Usage_DB';
    const DB_VERSION = 1;
    const S_DAYS = 'days';      // 每日彙總（id = YYYY-MM-DD）：永久保留，一天一筆、很小
    const S_CALLS = 'calls';    // 明細（id = 時間戳-序號）：給「最近做了什麼」用，會滾掉
    const RAW_MAX = 3000;       // 明細筆數上限
    const RAW_KEEP_DAYS = 30;   // 明細只留這麼多天
    const FLUSH_MS = 1500;      // 寫入排隊多久合併送一次

    let _db = null, _dbErr = false, _opening = null;
    let _seq = 0;
    let _queue = [];            // 還沒落地的
    let _timer = null;
    let _flushes = 0;

    // ── 日期鑰匙：用「她所在時區的那一天」，不是 UTC ──
    function dayKey(ts) {
        const d = new Date(ts == null ? Date.now() : ts);
        const p = (n) => String(n).padStart(2, '0');
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    }
    function shiftDay(key, delta) {
        const [y, m, d] = String(key).split('-').map(Number);
        const dt = new Date(y, (m || 1) - 1, d || 1);
        dt.setDate(dt.getDate() + delta);
        return dayKey(dt.getTime());
    }

    function open() {
        if (_db) return Promise.resolve(_db);
        if (_dbErr) return Promise.resolve(null);
        if (_opening) return _opening;
        _opening = new Promise((resolve) => {
            let req;
            try { req = indexedDB.open(DB_NAME, DB_VERSION); }
            catch (e) { _dbErr = true; resolve(null); return; }
            req.onupgradeneeded = (ev) => {
                const db = ev.target.result;
                if (!db.objectStoreNames.contains(S_DAYS)) db.createObjectStore(S_DAYS, { keyPath: 'id' });
                if (!db.objectStoreNames.contains(S_CALLS)) db.createObjectStore(S_CALLS, { keyPath: 'id' });
            };
            // 這個庫只有自己在用，還是照 IndexedDB 的規矩讓既有連線遇升版主動讓開，別 deadlock。
            req.onblocked = () => { console.warn('[OS_USAGE] 資料庫升級被既有連線擋住，等舊連線關閉…'); };
            req.onsuccess = (ev) => {
                _db = ev.target.result;
                _db.onversionchange = () => { try { _db.close(); } catch (e) {} _db = null; _opening = null; };
                resolve(_db);
            };
            req.onerror = () => {
                // 記帳失敗不准影響對話：關起門來認輸，記憶體那份照樣可以給面板看當下這一輪。
                console.warn('[OS_USAGE] 用量資料庫打不開，這次開機只在記憶體裡記', req.error);
                _dbErr = true; resolve(null);
            };
        });
        return _opening;
    }

    // ── token 估算：優先用酒館 tokenizer，PWA/取不到就粗估（CJK≈1 字 1 token、其餘≈4 字 1 token）──
    async function estTok(text) {
        const s = String(text || '');
        if (!s) return 0;
        try {
            const ST = win.SillyTavern || (win.parent && win.parent.SillyTavern);
            if (ST && typeof ST.getTokenCountAsync === 'function') return await ST.getTokenCountAsync(s);
        } catch (e) {}
        const cjk = (s.match(/[㐀-鿿豈-﫿぀-ヿ]/g) || []).length;
        return cjk + Math.ceil((s.length - cjk) / 4);
    }

    // ── 空的一天 / 空的一格 ──
    function blankDay(id) {
        return { id: id, n: 0, ok: 0, fail: 0, inTok: 0, outTok: 0, ms: 0, img: 0, imgFail: 0,
                 task: {}, model: {}, chan: {}, src: {}, firstAt: 0, updatedAt: 0 };
    }
    function bucket(map, key) {
        const k = key || '(未標)';
        if (!map[k]) map[k] = { n: 0, inTok: 0, outTok: 0, ms: 0, fail: 0 };
        return map[k];
    }
    // 把一筆明細疊進某一天的彙總（新舊資料共用，面板不必自己算）
    function foldInto(day, e) {
        day.updatedAt = Math.max(day.updatedAt || 0, e.t || 0);
        if (!day.firstAt) day.firstAt = e.t || 0;
        if (e.kind === 'image') {
            day.img++;
            if (e.ok === false) day.imgFail++;
            const b = bucket(day.src, e.source);
            b.n++; if (e.ok === false) b.fail++;
            return day;
        }
        day.n++;
        if (e.ok === false) day.fail++; else day.ok++;
        day.inTok += (e.inTok || 0);
        day.outTok += (e.outTok || 0);
        day.ms += (e.ms || 0);
        const t = bucket(day.task, e.task || e.label);
        t.n++; t.inTok += (e.inTok || 0); t.outTok += (e.outTok || 0); t.ms += (e.ms || 0); if (e.ok === false) t.fail++;
        const m = bucket(day.model, e.model);
        m.n++; m.inTok += (e.inTok || 0); m.outTok += (e.outTok || 0); if (e.ok === false) m.fail++;
        const c = bucket(day.chan, e.chanName || e.chan);
        c.n++; c.inTok += (e.inTok || 0); c.outTok += (e.outTok || 0); if (e.ok === false) c.fail++;
        return day;
    }

    // ── 排隊寫入 ──
    function enqueue(e) {
        try {
            e.id = String(e.t || Date.now()) + '-' + String(++_seq).padStart(4, '0');
            e.day = dayKey(e.t);
            _queue.push(e);
            if (!_timer) _timer = setTimeout(flush, FLUSH_MS);
        } catch (err) {}
        return e;
    }

    async function flush() {
        _timer = null;
        if (!_queue.length) return;
        const batch = _queue;
        _queue = [];
        const db = await open();
        if (!db) return;   // 庫壞掉：這批就當沒記過，別卡著也別重試到天荒地老
        try {
            // 先把要碰到的那幾天讀出來，疊完再一次寫回去（一天一筆，讀寫都很小）
            const dayIds = Array.from(new Set(batch.map(e => e.day)));
            const olds = await Promise.all(dayIds.map(id => getOne(db, S_DAYS, id)));
            const map = {};
            dayIds.forEach((id, i) => { map[id] = olds[i] || blankDay(id); });
            batch.forEach(e => { try { foldInto(map[e.day], e); } catch (err) {} });

            await new Promise((resolve) => {
                const tx = db.transaction([S_DAYS, S_CALLS], 'readwrite');
                const sd = tx.objectStore(S_DAYS), sc = tx.objectStore(S_CALLS);
                dayIds.forEach(id => { try { sd.put(map[id]); } catch (err) {} });
                batch.forEach(e => { try { sc.put(e); } catch (err) {} });
                tx.oncomplete = resolve;
                tx.onerror = () => { console.warn('[OS_USAGE] 這批沒寫進去', tx.error); resolve(); };
                tx.onabort = () => resolve();
            });
        } catch (err) { console.warn('[OS_USAGE] 寫入出錯', err); }
        if ((++_flushes % 20) === 1) prune().catch(() => {});
    }

    function getOne(db, store, id) {
        return new Promise((resolve) => {
            try {
                const r = db.transaction(store, 'readonly').objectStore(store).get(id);
                r.onsuccess = () => resolve(r.result || null);
                r.onerror = () => resolve(null);
            } catch (e) { resolve(null); }
        });
    }
    function getAll(db, store, range) {
        return new Promise((resolve) => {
            try {
                const r = db.transaction(store, 'readonly').objectStore(store).getAll(range || null);
                r.onsuccess = () => resolve(r.result || []);
                r.onerror = () => resolve([]);
            } catch (e) { resolve([]); }
        });
    }

    // 明細滾動淘汰：超過保留天數的直接砍，還是太多就砍最舊的（彙總不動，永久保留）
    async function prune() {
        const db = await open();
        if (!db) return;
        const cutoff = shiftDay(dayKey(), -RAW_KEEP_DAYS);
        const ids = await new Promise((resolve) => {
            try {
                const out = [];
                const r = db.transaction(S_CALLS, 'readonly').objectStore(S_CALLS).getAllKeys();
                r.onsuccess = () => resolve(r.result || out);
                r.onerror = () => resolve(out);
            } catch (e) { resolve([]); }
        });
        if (!ids.length) return;
        const cutTs = new Date(cutoff.split('-')[0], Number(cutoff.split('-')[1]) - 1, Number(cutoff.split('-')[2])).getTime();
        let doomed = ids.filter(id => Number(String(id).split('-')[0]) < cutTs);
        const left = ids.length - doomed.length;
        if (left > RAW_MAX) doomed = doomed.concat(ids.filter(id => doomed.indexOf(id) < 0).sort().slice(0, left - RAW_MAX));
        if (!doomed.length) return;
        await new Promise((resolve) => {
            const tx = db.transaction(S_CALLS, 'readwrite');
            const s = tx.objectStore(S_CALLS);
            doomed.forEach(id => { try { s.delete(id); } catch (e) {} });
            tx.oncomplete = resolve; tx.onerror = resolve; tx.onabort = resolve;
        });
    }

    // ── 對外：一次呼叫的開始與結束 ──
    // meta = { kind:'text', task, label, cat:'main|sec|aux', chan, chanName, model, via, relay }
    function start(meta) {
        const e = Object.assign({ kind: 'text' }, meta || {});
        e.t = Date.now();
        e.ok = null; e.ms = 0; e.inTok = 0; e.outTok = 0; e.err = '';
        return e;
    }
    // res = { ok, inTok, outTok, err, ms }
    //   ms 給呼叫端自己帶（token 估算是在回覆之後才算完的，用那時候的時間會把估算時間也算進耗時）
    function end(rec, res) {
        if (!rec || rec._done) return rec;
        rec._done = true;
        const r = res || {};
        rec.ok = !!r.ok;
        rec.ms = (r.ms != null) ? (r.ms | 0) : (Date.now() - (rec.t || Date.now()));
        if (r.inTok != null) rec.inTok = r.inTok | 0;
        if (r.outTok != null) rec.outTok = r.outTok | 0;
        if (!rec.ok) rec.err = String((r.err && r.err.message) || r.err || '').slice(0, 200);
        delete rec._done;
        return enqueue(rec);
    }
    // 一次就記完的（生圖那種：呼叫出去就是一張）
    function note(entry) {
        const e = Object.assign({ kind: 'image', ok: true }, entry || {});
        if (!e.t) e.t = Date.now();
        return enqueue(e);
    }

    // ── 對外：查 ──
    // 還沒落地的那幾筆也要算進去，不然剛講完話面板卻是舊數字。
    function foldQueue(map) {
        _queue.forEach(e => {
            if (!map[e.day]) return;
            try { foldInto(map[e.day], e); } catch (err) {}
        });
        return map;
    }
    async function days(fromDay, toDay) {
        const from = fromDay || shiftDay(dayKey(), -29);
        const to = toDay || dayKey();
        const db = await open();
        const map = {};
        for (let d = from; d <= to; d = shiftDay(d, 1)) map[d] = blankDay(d);
        if (db) {
            const rows = await getAll(db, S_DAYS, IDBKeyRange.bound(from, to));
            rows.forEach(r => { map[r.id] = r; });
        }
        foldQueue(map);
        return Object.keys(map).sort().map(k => map[k]);
    }
    async function today() {
        const id = dayKey();
        const db = await open();
        const map = {};
        map[id] = (db && await getOne(db, S_DAYS, id)) || blankDay(id);
        foldQueue(map);
        return map[id];
    }
    // 最近幾筆明細（新→舊）；排隊中的排在最前面
    async function recent(limit, kind) {
        const n = limit || 60;
        const db = await open();
        let rows = db ? await getAll(db, S_CALLS) : [];
        rows = rows.concat(_queue);
        rows.sort((a, b) => (b.t || 0) - (a.t || 0));
        if (kind) rows = rows.filter(r => r.kind === kind);
        return rows.slice(0, n);
    }
    // 近 n 天合計（預設 7 天）
    async function totals(nDays) {
        const list = await days(shiftDay(dayKey(), -((nDays || 7) - 1)), dayKey());
        const sum = blankDay('sum');
        list.forEach(d => {
            sum.n += d.n; sum.ok += d.ok; sum.fail += d.fail;
            sum.inTok += d.inTok; sum.outTok += d.outTok; sum.ms += d.ms;
            sum.img += d.img; sum.imgFail += d.imgFail || 0;
            ['task', 'model', 'chan', 'src'].forEach(f => {
                Object.keys(d[f] || {}).forEach(k => {
                    const a = bucket(sum[f], k), b = d[f][k];
                    a.n += b.n || 0; a.inTok += b.inTok || 0; a.outTok += b.outTok || 0;
                    a.ms += b.ms || 0; a.fail += b.fail || 0;
                });
            });
        });
        sum.dayList = list;
        return sum;
    }
    async function clearAll() {
        _queue = [];
        const db = await open();
        if (!db) return false;
        await new Promise((resolve) => {
            const tx = db.transaction([S_DAYS, S_CALLS], 'readwrite');
            try { tx.objectStore(S_DAYS).clear(); tx.objectStore(S_CALLS).clear(); } catch (e) {}
            tx.oncomplete = resolve; tx.onerror = resolve; tx.onabort = resolve;
        });
        return true;
    }
    async function exportAll() {
        const db = await open();
        return {
            exportedAt: new Date().toISOString(),
            days: db ? await getAll(db, S_DAYS) : [],
            calls: db ? await getAll(db, S_CALLS) : []
        };
    }

    // 切走／關掉之前先把排隊的落地，免得最後幾筆跟著視窗一起消失
    try {
        win.addEventListener('pagehide', () => { flush(); });
        win.document.addEventListener('visibilitychange', () => { if (win.document.visibilityState === 'hidden') flush(); });
    } catch (e) {}

    win.OS_USAGE = {
        start: start, end: end, note: note,
        days: days, today: today, recent: recent, totals: totals,
        clearAll: clearAll, exportAll: exportAll, flush: flush, prune: prune,
        estTok: estTok, dayKey: dayKey, shiftDay: shiftDay,
        RAW_KEEP_DAYS: RAW_KEEP_DAYS
    };
    if (win !== window) window.OS_USAGE = win.OS_USAGE;
    console.log('[PhoneOS] 載入用量記錄層 (OS_USAGE)');
})();
