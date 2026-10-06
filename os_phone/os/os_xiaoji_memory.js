// ----------------------------------------------------------------
// [檔案] os_xiaoji_memory.js — 小機的記憶（2026-10-06，OS_XIAOJI_MEM）
// 設計：docs/superpowers/specs/2026-10-06-xiaoji-memory-design.md（本地）。
// 四層：經歷簿（原話整句，只加不刪）→ 記憶（它的筆記：有出處、有版本、記錯不刪）→ 性格（相處出來的，每條有出處）
//       → 找回（每句話送出前在本機找：照字＋照意思）。唯一叫模型的是「整理」（每多約 20 件事，背景一通）。
// 10-06 她：「小機可沒有重新建的選項喔」→ 第一天就完整：原話整句留、每條有出處、改了留舊版、模型不准刪、索引可重建。
// 全部存在 OS_DB app_data（不升 DB 版號）：
//   xiaoji_life  <rid>:head、<rid>:<塊號>（每塊 100 行）  經歷簿
//   xiaoji_mem   <rid>                                   記憶
//   xiaoji_trait <rid>                                   性格
//   xiaoji_vec   <rid>:head、<rid>:<塊號>                  照意思找用的數字（可重建，不進備份）
//   xiaoji_sum   <會話編號>                               一串會話的舊聊天摘要（10-05 那套搬過來）
// 🚨 模型只能新增、更新、更正（聊天當場可以收起）；標記錯、放回去、抹掉只有她能做。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const V = 1;
    const LIFE = 'xiaoji_life', MEMS = 'xiaoji_mem', TRAITS = 'xiaoji_trait', VEC = 'xiaoji_vec', SUM = 'xiaoji_sum';
    const BLOCK = 100;
    const USER = '使用者';
    const API = {};

    function _g(k) { return win[k] || window[k] || null; }
    function _db() {
        const d = _g('OS_DB');
        if (!d || !d.saveAppData || !d.getAppData) throw new Error('資料庫還沒載入');
        return d;
    }
    async function _get(app, key) {
        const v = await _db().getAppData(app, key);
        return (v && typeof v === 'object') ? v : null;
    }
    async function _put(app, key, v) { await _db().saveAppData(app, key, v); }
    function _one(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
    function _now() { return Date.now(); }

    // 同一隻同一時間只做一件寫入（一句話記經歷、房間記打扮、背景整理可能同時到）。
    //   瀏覽器有 Web Locks（navigator.locks）就連別的分頁一起排隊——酒館開兩頁時兩邊不會互相蓋掉同一塊；沒有就只排這一頁。
    //   🚨 _lock 裡面不准再叫 _lock（同名 Web Lock 巢狀會卡死）：memDo／erase 都是鎖完才記經歷
    const _locks = {};
    function _lock(rid, fn) {
        const L = (win.navigator && win.navigator.locks) || null;
        const inner = () => (L && L.request) ? L.request('xiaoji_mem_' + rid, () => fn()) : fn();
        const run = (_locks[rid] || Promise.resolve()).catch(() => {}).then(inner);
        _locks[rid] = run.catch(() => {});
        return run;
    }
    // 這一頁的快取：經歷簿的塊、找回用的單位、向量。寫入時跟著換或作廢
    const _cache = {};
    function _c(rid) { return _cache[rid] || (_cache[rid] = { blocks: {}, units: null, evMap: null, vecs: null }); }
    function _dirty(rid) { _c(rid).units = null; }

    // ── 經歷簿 ──────────────────────────────────────────────
    function _head0() { return { v: V, nextId: 1, blocks: 0, tidyAt: 0, tidyFails: 0, tidyErr: '', lastTidy: '', migrated: 0 }; }
    async function head(rid) { return Object.assign(_head0(), (await _get(LIFE, rid + ':head')) || {}); }
    function _num(id) { return parseInt(String(id == null ? '' : id).replace(/^e/, ''), 10) || 0; }
    function _blk(n) { return Math.floor((n - 1) / BLOCK); }
    async function _readBlock(rid, b) {
        const v = await _get(LIFE, rid + ':' + b);
        return (v && Array.isArray(v.items)) ? v : { v: V, items: [] };
    }
    const KEEP = { id: 1, at: 1, kind: 1, state: 1, conv: 1, ts: 1, erased: 1 };

    /** 記一行。ev＝{ kind, at?, conv?, ts?, ...內容 }。回這一行的編號 'e123' */
    async function log(rid, ev) {
        if (!rid || !ev || !ev.kind) throw new Error('經歷要有 rid 和 kind');
        return _lock(rid, async () => {
            const h = await head(rid);
            let n = h.nextId, b = _blk(n);
            let blk = await _readBlock(rid, b);
            // 另一個分頁剛寫過、或上一次 head 沒寫成：以那一塊實際最後一行為準
            const last = blk.items.length ? _num(blk.items[blk.items.length - 1].id) : 0;
            if (last >= n) {
                n = last + 1;
                if (_blk(n) !== b) { b = _blk(n); blk = await _readBlock(rid, b); }
            }
            const row = Object.assign({}, ev, { id: 'e' + n, at: ev.at || _now(), state: 'ok' });
            blk.items.push(row);
            await _put(LIFE, rid + ':' + b, blk);   // 先寫那一塊再寫 head：head 沒寫成，下一次照上面那段補回來
            _c(rid).blocks[b] = blk; _dirty(rid);
            h.nextId = n + 1; h.blocks = Math.max(h.blocks, b + 1);
            await _put(LIFE, rid + ':head', h);
            return row.id;
        });
    }
    /** 整本（舊到新）。最後一塊每次重讀（別的分頁可能剛寫過），其他用快取 */
    async function allEvents(rid) {
        const h = await head(rid), c = _c(rid), out = [];
        // head 落後（上一次 head 沒寫成）時，下一塊可能已經有東西
        let blocks = h.blocks;
        if (blocks && (await _readBlock(rid, blocks)).items.length) blocks++;
        for (let b = 0; b < blocks; b++) {
            let blk = c.blocks[b];
            if (!blk || b >= blocks - 1) { blk = await _readBlock(rid, b); c.blocks[b] = blk; }
            for (const e of blk.items) out.push(e);
        }
        return out;
    }
    /** 就地改幾行（撤回、抹掉、整理標退回）。fn(row) 回 false＝這行不算。回改了幾行 */
    async function _patch(rid, ids, fn) {
        const want = new Set((ids || []).map(String));
        if (!want.size) return 0;
        return _lock(rid, async () => {
            const byB = {};
            want.forEach(id => { const n = _num(id); if (n > 0) (byB[_blk(n)] = byB[_blk(n)] || []).push(id); });
            let changed = 0;
            for (const b of Object.keys(byB)) {
                const blk = await _readBlock(rid, +b);
                let hit = false;
                blk.items.forEach(row => { if (want.has(row.id) && fn(row) !== false) { hit = true; changed++; } });
                if (hit) { await _put(LIFE, rid + ':' + b, blk); _c(rid).blocks[b] = blk; }
            }
            if (changed) _dirty(rid);
            return changed;
        });
    }
    /** 撤回（不算數，但不刪）：在還在的對話裡刪了那一則、或重生了回話 */
    function withdraw(rid, ids) { return _patch(rid, ids, row => { if (row.state !== 'ok') return false; row.state = 'withdrawn'; }); }
    /** 抹掉（只有她能按）：內容清掉，只留編號、時間、種類 */
    async function erase(rid, ids) {
        const n = await _patch(rid, ids, row => {
            if (row.state === 'erased') return false;
            Object.keys(row).forEach(k => { if (!KEEP[k]) delete row[k]; });
            row.state = 'erased'; row.erased = _now();
        });
        if (n) await log(rid, { kind: 'erase', ids: (ids || []).map(String), by: 'rae' });
        return n;
    }
    /** 一來回。同一串同一則（重生）記第二次時，舊那行撤回 */
    async function logTurn(rid, t) {
        t = t || {};
        if (t.conv && t.ts) {
            const old = (await allEvents(rid)).filter(e => e.kind === 'chat' && e.state === 'ok' && e.conv === t.conv && e.ts === t.ts).map(e => e.id);
            if (old.length) await withdraw(rid, old);
        }
        return log(rid, { kind: 'chat', at: t.at, conv: t.conv || '', ts: t.ts || 0, user: String(t.user || ''), reply: String(t.reply || ''),
            tools: Array.isArray(t.tools) ? t.tools : [], props: Array.isArray(t.props) ? t.props : [] });
    }
    /** 對帳：這一串裡，使用者那則已經不在對話裡的 → 撤回。整串刪掉不會有人來對帳（她定的：經歷留著） */
    async function reconcile(rid, conv, hist, curTs) {
        if (!conv) return 0;
        const have = new Set((hist || []).filter(m => m && m.role === 'user' && m.timestamp).map(m => m.timestamp));
        if (curTs) have.add(curTs);
        const gone = (await allEvents(rid)).filter(e => e.kind === 'chat' && e.state === 'ok' && e.conv === conv && e.ts && !have.has(e.ts)).map(e => e.id);
        return gone.length ? withdraw(rid, gone) : 0;
    }
    /** 翻經歷簿（新到舊）：before＝從哪一行往前（不含），沒給＝最新 */
    async function page(rid, before, n) {
        const all = await allEvents(rid);
        const end = before ? all.findIndex(e => e.id === before) : all.length;
        const to = end < 0 ? all.length : end;
        return all.slice(Math.max(0, to - (n || 30)), to).reverse();
    }
    Object.assign(API, { V, USER, head, log, allEvents, withdraw, erase, logTurn, reconcile, page });

    // ── (後面的段落接在這行上面) ──

    win.OS_XIAOJI_MEM = API;
    if (win !== window) { try { window.OS_XIAOJI_MEM = API; } catch (e) {} }
})();
