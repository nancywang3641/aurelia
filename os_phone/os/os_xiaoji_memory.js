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

    // ── 文字小工具 ──────────────────────────────────────────
    // 中文兩字一組、英數一個詞（照字找、比相似都用它）
    function _bigrams(s) {
        const out = [], re = /[a-z0-9]+|[\u3400-\u9fff\uf900-\ufaff]+/g, t = String(s == null ? '' : s).toLowerCase();
        let m;
        while ((m = re.exec(t))) {
            const w = m[0];
            if (/^[a-z0-9]+$/.test(w) || w.length === 1) out.push(w);
            else for (let i = 0; i < w.length - 1; i++) out.push(w.slice(i, i + 2));
        }
        return out;
    }
    function _sim(a, b) {
        const A = new Set(_bigrams(a)), B = new Set(_bigrams(b));
        if (!A.size || !B.size) return 0;
        let n = 0; A.forEach(x => { if (B.has(x)) n++; });
        return n / Math.min(A.size, B.size);
    }
    function _ago(at) {
        if (!at) return '';
        const d = Math.floor((_now() - at) / 86400000);
        if (d <= 0) return '今天';
        if (d === 1) return '昨天';
        if (d < 31) return d + ' 天前';
        const mo = Math.floor(d / 30);
        return mo < 12 ? mo + ' 個月前' : Math.floor(d / 365) + ' 年前';
    }
    function _shortId(id) { return String(id == null ? '' : id).replace(/^[a-z]/, ''); }
    function _evIds(x) {
        return (Array.isArray(x) ? x : String(x == null ? '' : x).split(/[,，、\s]+/))
            .map(s => { const m = /(\d+)/.exec(String(s)); return m ? 'e' + m[1] : ''; }).filter(Boolean);
    }
    function _idOf(prefix, x) { const m = /(\d+)/.exec(String(x == null ? '' : x)); return m ? prefix + m[1] : ''; }

    // ── 記憶（它的筆記）──────────────────────────────────────
    const MEM_LEN = 120, PER_REPLY = 3, PIN_BUDGET = 1500;
    const MEM_KINDS = ['user', 'promise', 'event', 'work', 'legacy'];
    const ABOUTS = ['user', 'self', 'story', 'other'];
    const ABOUT_ZH = { '使用者': 'user', '用戶': 'user', '自己': 'self', '我': 'self', '故事': 'story', '主角': 'story', '別人': 'other', '其他': 'other' };
    const KIND_NAME = { user: '是什麼樣的人', promise: '約定', event: '發生過的事', work: '做過的東西', legacy: '以前記的' };
    const ABOUT_NAME = { user: USER, self: '你自己', story: '故事', other: '別人' };

    async function mems(rid) {
        const v = await _get(MEMS, rid);
        return { v: V, nextId: (v && v.nextId) || 1, items: (v && Array.isArray(v.items)) ? v.items : [] };
    }
    function isPinned(m) { return !!m && m.state === 'ok' && (m.kind === 'promise' || ((m.kind === 'user' || m.kind === 'legacy') && m.about === 'user')); }
    // 她改正過（下一版是她的 fix）的舊說法：模型不能改回去
    function _raeFixed(m, text) {
        for (let i = 0; i < m.versions.length - 1; i++) {
            const nx = m.versions[i + 1];
            if (nx.by === 'rae' && nx.why === 'fix' && m.versions[i].text === text) return true;
        }
        return false;
    }
    /** 改記憶都經過這裡，每一次都記一行經歷。
     *  verb：add｜update（以前對、後來變了）｜fix（當初記錯）｜wrong（她標記錯、沒給正確的）｜stow（收起）｜unstow（放回去）｜revert（退回整理改的）
     *  by：self（它聊天當場）｜tidy（整理那一通）｜rae（她）｜import（搬家）。回 { ok, id, why, prev } */
    async function memDo(rid, verb, o) {
        o = o || {};
        const by = o.by || 'self';
        if (verb === 'wrong' && by !== 'rae') return { ok: false, why: '只有使用者能標記錯' };
        if (verb === 'unstow' && by !== 'rae') return { ok: false, why: '只有使用者能放回去' };
        if (verb === 'stow' && by === 'tidy') return { ok: false, why: '整理不能收起記憶' };
        if (verb === 'revert' && by !== 'rae') return { ok: false, why: '只有使用者能退回' };
        const text = _one(o.text).slice(0, MEM_LEN), from = _evIds(o.from), at = o.at || _now();
        const res = await _lock(rid, async () => {
            const M = await mems(rid);
            if (verb === 'add') {
                if (!text) return { ok: false, why: '沒有內容' };
                const about = ABOUTS.indexOf(o.about) !== -1 ? o.about : ABOUT_ZH[o.about];
                if (!about) return { ok: false, why: '沒寫關於誰' };
                const kind = MEM_KINDS.indexOf(o.kind) !== -1 ? o.kind : (about === 'user' ? 'user' : 'event');
                if (!from.length) return { ok: false, why: '沒有出處' };
                if (M.items.some(m => m.state === 'ok' && m.text === text)) return { ok: false, why: '已經記過' };
                const id = 'm' + M.nextId++;
                M.items.push({ id, kind, about, text, from, state: 'ok', at, versions: [{ text, at, by, why: 'add', from }] });
                await _put(MEMS, rid, M);
                return { ok: true, id, prev: null };
            }
            const m = M.items.find(x => x.id === _idOf('m', o.id));
            if (!m) return { ok: false, why: '沒有這一條' };
            const prev = { text: m.text, state: m.state, kind: m.kind, about: m.about };
            if (verb === 'update' || verb === 'fix' || verb === 'revert') {
                if (verb !== 'revert' && m.state !== 'ok') return { ok: false, why: m.state === 'wrong' ? '這條被標成記錯了' : '這條收起來了' };
                if (!text) return { ok: false, why: '沒有內容' };
                if (by === 'tidy' && !from.length) return { ok: false, why: '沒有出處' };
                if (by !== 'rae' && _raeFixed(m, text)) return { ok: false, why: '使用者改正過，不能改回原本的說法' };
                const kind = MEM_KINDS.indexOf(o.kind) !== -1 ? o.kind : m.kind;
                const about = ABOUTS.indexOf(o.about) !== -1 ? o.about : m.about;
                if (verb !== 'revert' && text === m.text && kind === m.kind && about === m.about) return { ok: false, why: '沒有變' };
                m.versions.push({ text, at, by, why: verb, from });
                m.text = text; m.kind = kind; m.about = about; m.at = at;
                from.forEach(f => { if (m.from.indexOf(f) === -1) m.from.push(f); });
                if (verb === 'revert') m.state = o.state || 'ok';
            } else if (verb === 'wrong') {
                if (m.state === 'wrong') return { ok: false, why: '已經是記錯了' };
                m.state = 'wrong'; m.at = at;
            } else if (verb === 'stow') {
                if (m.state !== 'ok') return { ok: false, why: '這條不是在用的' };
                m.state = 'stowed'; m.at = at;
            } else if (verb === 'unstow') {
                if (m.state === 'ok') return { ok: false, why: '本來就在用' };
                m.state = 'ok'; m.at = at;
            } else return { ok: false, why: '不認得要做什麼' };
            await _put(MEMS, rid, M);
            return { ok: true, id: m.id, prev };
        });
        if (res.ok) { _dirty(rid); await log(rid, { kind: 'mem', mid: res.id, verb, by, text, prev: res.prev }); }
        return res;
    }

    // ── 性格（相處出來的樣子）──────────────────────────────
    const TRAIT_LEN = 60, TRAITS_PER_KIND = 5, RAE_DROP_DAYS = 30, DROP_SIM = 0.6;
    const TRAIT_KINDS = ['talk', 'taste', 'bond', 'work'];
    const TRAIT_NAME = { talk: '講話', taste: '喜好', bond: '跟' + USER, work: '做事' };
    async function traits(rid) {
        const v = await _get(TRAITS, rid);
        return { v: V, nextId: (v && v.nextId) || 1, items: (v && Array.isArray(v.items)) ? v.items : [] };
    }
    /** verb：add｜update｜drop（它不再這樣，整理那一通看出來的）｜remove（她拿掉）｜revert（她退回整理改的）。回 { ok, id, why, prev } */
    async function traitDo(rid, verb, o) {
        o = o || {};
        const by = o.by || 'tidy';
        if ((verb === 'remove' || verb === 'revert') && by !== 'rae') return { ok: false, why: '只有使用者能拿掉或退回' };
        if ((verb === 'add' || verb === 'update' || verb === 'drop') && by === 'rae') return { ok: false, why: '性格只能刪不能改（她定的）' };
        const text = _one(o.text).slice(0, TRAIT_LEN), from = _evIds(o.from), at = o.at || _now();
        const res = await _lock(rid, async () => {
            const T = await traits(rid);
            if (verb === 'add') {
                if (TRAIT_KINDS.indexOf(o.kind) === -1) return { ok: false, why: '不認得是哪一欄' };
                if (!text) return { ok: false, why: '沒有內容' };
                if (!from.length) return { ok: false, why: '沒有出處' };
                if (T.items.filter(t => t.state === 'ok' && t.kind === o.kind).length >= TRAITS_PER_KIND) return { ok: false, why: '這一欄滿 ' + TRAITS_PER_KIND + ' 條了' };
                if (T.items.some(t => t.state === 'removed' && at - (t.at || 0) < RAE_DROP_DAYS * 86400000 && _sim(t.text, text) >= DROP_SIM)) return { ok: false, why: '使用者拿掉過差不多的' };
                const id = 't' + T.nextId++;
                T.items.push({ id, kind: o.kind, text, from, state: 'ok', at, versions: [{ text, at, by, why: 'add', from }] });
                await _put(TRAITS, rid, T);
                return { ok: true, id, prev: null };
            }
            const t = T.items.find(x => x.id === _idOf('t', o.id));
            if (!t) return { ok: false, why: '沒有這一條' };
            const prev = { text: t.text, state: t.state };
            if (verb === 'update') {
                if (t.state !== 'ok') return { ok: false, why: '這條已經不在了' };
                if (!text || !from.length) return { ok: false, why: text ? '沒有出處' : '沒有內容' };
                if (text === t.text) return { ok: false, why: '沒有變' };
                t.versions.push({ text, at, by, why: 'update', from }); t.text = text; t.at = at;
                from.forEach(f => { if (t.from.indexOf(f) === -1) t.from.push(f); });
            } else if (verb === 'drop') {
                if (t.state !== 'ok') return { ok: false, why: '這條已經不在了' };
                if (!from.length) return { ok: false, why: '沒有出處' };
                t.state = 'dropped'; t.at = at; t.versions.push({ text: t.text, at, by, why: 'drop', from });
            } else if (verb === 'remove') {
                if (t.state !== 'ok') return { ok: false, why: '這條已經不在了' };
                t.state = 'removed'; t.at = at; t.versions.push({ text: t.text, at, by, why: 'remove', from: [] });
            } else if (verb === 'revert') {
                const back = o.text != null ? text : t.text;
                t.versions.push({ text: back, at, by, why: 'revert', from: [] });
                t.text = back; t.state = o.state || 'ok'; t.at = at;
            } else return { ok: false, why: '不認得要做什麼' };
            await _put(TRAITS, rid, T);
            return { ok: true, id: t.id, prev };
        });
        if (res.ok) await log(rid, { kind: 'trait', tid: res.id, verb, by, text, prev: res.prev });
        return res;
    }

    // ── 聊天當場的記事標籤（不是工具，不多叫模型）──────────────
    const TAG_PAIR = /[<＜]\s*(memory_add|memory_update|memory_fix|memory_edit)\b([^>＞]*)[>＞]([\s\S]*?)[<＜]\s*\/\s*\1\s*[>＞]/gi;
    const TAG_ONE = /[<＜]\s*memory_remove\b([^>＞]*?)\/?\s*[>＞]/gi;
    const CODE_RE = /```[\s\S]*?```|`[^`\n]*`/g;
    function _codeSpans(t) { const s = []; String(t).replace(CODE_RE, (m, off) => { s.push([off, off + m.length]); return m; }); return s; }
    function _inSpans(pos, spans) { return spans.some(([a, b]) => pos >= a && pos < b); }
    function _attr(attrs, name) {
        const m = new RegExp('(?:^|\\s)' + name + '\\s*=\\s*["“”＂\']?([^"“”＂\'\\s>＞/]+)', 'i').exec(attrs || '');
        return m ? m[1] : '';
    }
    function parse(text) {
        text = String(text || '');
        const code = _codeSpans(text), found = [], pairs = [];
        let m;
        TAG_PAIR.lastIndex = 0;
        while ((m = TAG_PAIR.exec(text))) {
            pairs.push([m.index, m.index + m[0].length]);
            if (_inSpans(m.index, code)) continue;
            const body = _one(m[3]).slice(0, MEM_LEN);
            if (!body) continue;
            const tag = m[1].toLowerCase();
            if (tag === 'memory_add') {
                const a = _attr(m[2], 'about'), k = _attr(m[2], 'kind');
                found.push({ at: m.index, verb: 'add', about: ABOUTS.indexOf(a) !== -1 ? a : (ABOUT_ZH[a] || ''), kind: (MEM_KINDS.indexOf(k) !== -1 && k !== 'legacy') ? k : '', text: body });
            } else {
                const id = _idOf('m', _attr(m[2], 'id'));
                if (id) found.push({ at: m.index, verb: tag === 'memory_fix' ? 'fix' : 'update', id, text: body });
            }
        }
        TAG_ONE.lastIndex = 0;
        while ((m = TAG_ONE.exec(text))) {
            const at = m.index;
            if (_inSpans(at, code) || _inSpans(at, pairs)) continue;
            const id = _idOf('m', _attr(m[1], 'id'));
            if (id) found.push({ at, verb: 'remove', id });
        }
        return found.sort((a, b) => a.at - b.at).map(x => { const o = Object.assign({}, x); delete o.at; return o; });
    }
    function strip(text) {
        const s = String(text == null ? '' : text);
        if (!/memory_/i.test(s)) return s;
        const code = _codeSpans(s), cut = [];
        let m;
        TAG_PAIR.lastIndex = 0;
        while ((m = TAG_PAIR.exec(s))) if (!_inSpans(m.index, code)) cut.push([m.index, m.index + m[0].length]);
        TAG_ONE.lastIndex = 0;
        while ((m = TAG_ONE.exec(s))) if (!_inSpans(m.index, code) && !_inSpans(m.index, cut)) cut.push([m.index, m.index + m[0].length]);
        if (!cut.length) return s;
        cut.sort((a, b) => a[0] - b[0]);
        let out = '', p = 0;
        cut.forEach(([a, b]) => { out += s.slice(p, a); p = b; });
        return (out + s.slice(p)).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    }
    /** 照回覆裡的標籤動手（先後做，成功的最多 PER_REPLY 件）；出處＝這一則（evId） */
    async function applyReply(rid, text, evId) {
        const out = { changed: false, done: [] };
        for (const a of parse(text)) {
            if (out.done.length >= PER_REPLY) break;
            let r;
            if (a.verb === 'add') r = await memDo(rid, 'add', { about: a.about, kind: a.kind, text: a.text, from: [evId], by: 'self' });
            else if (a.verb === 'remove') r = await memDo(rid, 'stow', { id: a.id, by: 'self' });
            else r = await memDo(rid, a.verb, { id: a.id, text: a.text, from: [evId], by: 'self' });
            if (!r.ok) continue;
            out.changed = true;
            out.done.push((a.verb === 'add' ? '記下' : a.verb === 'remove' ? '收起' : a.verb === 'fix' ? '更正' : '改了') + ' #' + _shortId(r.id));
        }
        return out;
    }

    // ── 說明裡的兩段：釘住的記憶、相處出來的樣子 ────────────────
    function _memHowto() {
        return [
            '值得記的：' + USER + '希望你怎麼稱呼、是什麼樣的人、喜歡和不喜歡的、交代你做事的方式、你答應過的事、你們之間發生過的重要的事、你做過的東西。寒暄和一次性的小事不用記。這些你還不知道的，可以在聊天裡順著話題問，不用一次問完；問到了就記下來。',
            '要記、要改，就在回覆裡另外寫標籤。這不是工具，不用 tool_call，寫在回' + USER + '的話旁邊就好，' + USER + '看不到標籤本身。一次回覆最多 ' + PER_REPLY + ' 個。標籤名、屬性名、屬性值都照抄英文，不要翻譯：',
            '<memory_add about="user">一件事，一句話寫清楚</memory_add>',
            'about 一定要寫，只能是：user＝' + USER + '本人的事；self＝你自己的事、你答應' + USER + '的事；story＝' + USER + '玩的故事裡的事（包括故事的主角）；other＝別人的事。',
            '約定、交代、你答應的事，另外加 kind="promise"（這種每一句話都會帶著，不會忘）：<memory_add about="self" kind="promise">答應的事，一句話寫清楚</memory_add>',
            '<memory_update id="號碼">改成這樣</memory_update>：以前是對的，後來變了。',
            '<memory_fix id="號碼">正確的是這樣</memory_fix>：當初就記錯了。' + USER + '糾正你的時候用這個。',
            '<memory_remove id="號碼"/>：不重要了，收起來（不會刪掉，' + USER + '翻得到）。',
            '同一件事有新的說法就改原本那一條，不要再記一條。'
        ].join('\n');
    }
    function _memLine(m) { return '#' + _shortId(m.id) + '（' + KIND_NAME[m.kind] + '｜關於' + ABOUT_NAME[m.about] + '｜' + _ago(m.at) + '）' + m.text; }
    async function pinnedText(rid) {
        const M = await mems(rid);
        const pins = M.items.filter(isPinned).sort((a, b) => b.at - a.at);
        const lines = [], shown = [], over = [];
        let used = 0;
        pins.forEach(m => {
            const l = _memLine(m);
            if (used + l.length > PIN_BUDGET) { over.push(m.id); return; }
            used += l.length; lines.push(l); shown.push(m.id);
        });
        const text = ['【你記得的事】',
            '這是你自己記的筆記，每一句話都帶著。筆記可能記錯；「這句話讓你想起的」那段附了原話，筆記跟原話對不上時，以原話為準。']
            .concat(lines.length ? lines : ['還沒有記過任何事。'], over.length ? ['（還有 ' + over.length + ' 條記得的事沒列在這裡，用得上時會出現在「這句話讓你想起的」。）'] : [], ['', _memHowto()]).join('\n');
        return { text, shown, over };
    }
    async function traitsText(rid) {
        const T = (await traits(rid)).items.filter(t => t.state === 'ok');
        if (!T.length) return '';
        const out = ['【你現在的樣子】', '這是你跟' + USER + '相處下來慢慢長成的樣子，不是規定；自然地照著做，不用講出來。'];
        TRAIT_KINDS.forEach(k => { const xs = T.filter(t => t.kind === k); if (xs.length) out.push(TRAIT_NAME[k] + '：' + xs.map(t => t.text).join('；')); });
        return out.join('\n');
    }
    /** 小劇場人設用（第三人稱一兩行） */
    async function personaLines(rid) {
        const pins = (await mems(rid)).items.filter(isPinned).sort((a, b) => b.at - a.at).slice(0, 20);
        const T = (await traits(rid)).items.filter(t => t.state === 'ok');
        const out = [];
        if (pins.length) out.push('它記得的事：' + pins.map(m => m.text).join('；'));
        if (T.length) out.push('它現在的樣子：' + TRAIT_KINDS.map(k => { const xs = T.filter(t => t.kind === k); return xs.length ? TRAIT_NAME[k] + '：' + xs.map(t => t.text).join('、') : ''; }).filter(Boolean).join('；'));
        return out.join('\n');
    }
    Object.assign(API, { mems, memDo, isPinned, traits, traitDo, parse, strip, applyReply, pinnedText, traitsText, personaLines,
        KIND_NAME, ABOUT_NAME, TRAIT_NAME, LIMITS: { MEM_LEN, PER_REPLY, PIN_BUDGET, TRAIT_LEN, TRAITS_PER_KIND } });

    // ── 找回 ────────────────────────────────────────────────
    const UNIT_LEN = 400, RECALL_MEM = 6, RECALL_EV = 4, EV_SNIP = 300, SRC_SNIP = 120, TOPK = 20, RRF_K = 60;
    const EMBED_MODEL = 'Xenova/bge-small-zh-v1.5', READY = 0.9, QUERY_WAIT = 1500, VEC_MIN = 0.35, VEC_BLOCK = 200, EMBED_BATCH = 32;
    const EV_NAME = { chat: '聊天', prop: '單子', lesson: '上課', exam: '考試', hw: '作業', theater: '小劇場', wear: '打扮', room: '房間', bubble: '泡泡', born: '來到宿舍', sum: '舊聊天整理' };
    function _evText(e, who) {
        if (!e || e.state !== 'ok') return '';
        const me = who || '你';
        if (e.kind === 'chat') return [e.user ? USER + '：' + e.user : '', e.reply ? me + '：' + e.reply : ''].filter(Boolean).join('\n');
        if (e.kind === 'exam') return '考「' + (e.label || e.skill || '') + '」' + (e.pass ? '考過了' : '沒考過' + (e.why ? '（' + e.why + '）' : '')) + (e.text ? '。交的作業：' + e.text : '');
        if (EV_NAME[e.kind]) return EV_NAME[e.kind] + '：' + String(e.text || '');
        return '';
    }
    async function _units(rid) {
        const c = _c(rid);
        if (c.units) return c.units;
        const evs = await allEvents(rid), M = await mems(rid);
        const out = [];
        const add = u => { const t = _bigrams(u.text), tf = {}; t.forEach(w => { tf[w] = (tf[w] || 0) + 1; }); u.tf = tf; u.len = t.length; out.push(u); };
        M.items.forEach(m => {
            if (m.state === 'ok') add({ uid: m.id + '@' + m.versions.length, type: 'mem', ref: m.id, text: m.text, at: m.at });
            if (m.state === 'wrong') return;
            m.versions.forEach((v, i) => { const nx = m.versions[i + 1]; if (nx && nx.why === 'update' && v.text !== nx.text) add({ uid: m.id + 'v' + i, type: 'old', ref: m.id, text: v.text, at: v.at, until: nx.at }); });
        });
        evs.forEach(e => {
            const t = _evText(e);
            if (!t) return;
            for (let i = 0, k = 0; i < t.length; i += UNIT_LEN, k++) add({ uid: e.id + '#' + k, type: 'ev', ref: e.id, text: t.slice(i, i + UNIT_LEN), at: e.at, conv: e.conv || '', ts: e.ts || 0 });
        });
        c.units = out; c.evMap = new Map(evs.map(e => [e.id, e]));
        return out;
    }
    function _bm25(units, q) {
        const qt = Array.from(new Set(_bigrams(q)));
        if (!qt.length || !units.length) return [];
        const N = units.length, df = {};
        qt.forEach(w => { df[w] = 0; units.forEach(u => { if (u.tf[w]) df[w]++; }); });
        const avg = units.reduce((a, u) => a + u.len, 0) / N || 1, k1 = 1.2, b = 0.75;
        return units.map((u, i) => {
            let s = 0;
            qt.forEach(w => { const f = u.tf[w]; if (!f) return; const idf = Math.log(1 + (N - df[w] + 0.5) / (df[w] + 0.5)); s += idf * f * (k1 + 1) / (f + k1 * (1 - b + b * u.len / avg)); });
            return { i, s };
        }).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
    }
    function _rrf(lists) {
        const s = {};
        lists.forEach(l => l.forEach((uid, r) => { s[uid] = (s[uid] || 0) + 1 / (RRF_K + r + 1); }));
        return Object.keys(s).sort((a, b) => s[b] - s[a]);
    }
    function _dot(a, b) { let d = 0; const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) d += a[i] * b[i]; return d; }
    // 截一段給模型看：從第一個對到的字前面一點開始截（只截開頭的話，很長一則中間那句會被截掉）
    function _snip(text, q, n) {
        const t = _one(text);
        if (t.length <= n) return t;
        const low = t.toLowerCase();
        let at = -1;
        _bigrams(q).forEach(w => { const i = low.indexOf(w); if (i !== -1 && (at === -1 || i < at)) at = i; });
        const s = Math.max(0, Math.min(at === -1 ? 0 : at - Math.floor(n / 3), t.length - n));
        return (s > 0 ? '…' : '') + t.slice(s, s + n) + (s + n < t.length ? '…' : '');
    }
    function _timeout(p, ms) { return Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]); }

    // 向量：Float32 打包成 base64 字串（JSON 安全、比數字陣列省一半以上）
    function _pack(vec) { const b = new Uint8Array(new Float32Array(vec).buffer); let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }
    function _unpack(s) { const bin = atob(s), b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return new Float32Array(b.buffer); }
    async function _vecHead(rid) { const h = await _get(VEC, rid + ':head'); return (h && h.model === EMBED_MODEL) ? h : { v: V, model: EMBED_MODEL, blocks: 0 }; }
    async function _vecs(rid) {
        const c = _c(rid);
        if (c.vecs) return c.vecs;
        const h = await _vecHead(rid), map = new Map();
        for (let b = 0; b < h.blocks; b++) {
            const blk = await _get(VEC, rid + ':' + b);
            if (blk && blk.model === EMBED_MODEL && Array.isArray(blk.items)) blk.items.forEach(([uid, s]) => map.set(uid, _unpack(s)));
        }
        c.vecs = map;
        return map;
    }
    async function embedStatus(rid) {
        const units = await _units(rid), vecs = await _vecs(rid);
        const done = units.filter(u => vecs.has(u.uid)).length;
        return { done, total: units.length, ready: units.length > 0 && done >= units.length * READY };
    }
    const _embedRun = {};
    /** 背景把還沒算的單位算好（回完話後叫；遷移、還原之後從頭算）。小模型載不到就丟錯（叫的那邊吞掉，下次再試） */
    function embedPending(rid, onProgress) {
        if (_embedRun[rid]) return _embedRun[rid];
        _embedRun[rid] = (async () => {
            const VE = _g('OS_VECTOR_ENGINE');
            const units = await _units(rid), vecs = await _vecs(rid);
            const todo = units.filter(u => !vecs.has(u.uid));
            let done = units.length - todo.length;
            if (!todo.length || !VE || !VE.embedLocal) return { done, total: units.length };
            const h = await _vecHead(rid);
            let bi = Math.max(0, h.blocks - 1);
            let blk = h.blocks ? await _get(VEC, rid + ':' + bi) : null;
            if (!blk || blk.model !== EMBED_MODEL || !Array.isArray(blk.items) || blk.items.length >= VEC_BLOCK) { blk = { v: V, model: EMBED_MODEL, items: [] }; bi = h.blocks; }
            for (let i = 0; i < todo.length; i += EMBED_BATCH) {
                const part = todo.slice(i, i + EMBED_BATCH);
                const out = await VE.embedLocal(part.map(u => u.text), EMBED_MODEL);
                for (let j = 0; j < part.length; j++) {
                    if (!out || !out[j]) continue;
                    if (blk.items.length >= VEC_BLOCK) { await _put(VEC, rid + ':' + bi, blk); bi++; blk = { v: V, model: EMBED_MODEL, items: [] }; }
                    blk.items.push([part[j].uid, _pack(out[j])]);
                    vecs.set(part[j].uid, new Float32Array(out[j]));
                    done++;
                }
                await _put(VEC, rid + ':' + bi, blk);
                await _put(VEC, rid + ':head', { v: V, model: EMBED_MODEL, blocks: bi + 1 });
                if (typeof onProgress === 'function') { try { onProgress({ done, total: units.length }); } catch (e) {} }
            }
            return { done, total: units.length };
        })().finally(() => { delete _embedRun[rid]; });
        return _embedRun[rid];
    }

    /** 這句話讓它想起的：照字＋照意思（向量就緒才用）合併；最近原文窗裡的經歷、已經釘住的記憶不重複拿 */
    async function recall(rid, o) {
        o = o || {};
        const units = await _units(rid), evMap = _c(rid).evMap;
        const q = String(o.query || '');
        const pinIds = new Set(o.pinIds || []);
        const winFrom = o.windowFromTs == null ? Infinity : o.windowFromTs;
        const inWin = e => !!(e && o.conv && e.conv === o.conv && e.ts && e.ts >= winFrom);
        const pool = units.filter(u => u.type === 'ev' ? !inWin(evMap.get(u.ref)) : !(u.type === 'mem' && pinIds.has(u.ref)));
        const kw = _bm25(pool, q).slice(0, TOPK).map(x => pool[x.i].uid);
        let vec = [], usedVec = false;
        const VE = _g('OS_VECTOR_ENGINE');
        if (q.trim() && VE && VE.embedLocal) {
            const vecs = await _vecs(rid);
            const have = units.filter(u => vecs.has(u.uid)).length;
            if (units.length && have >= units.length * READY) {
                let qv = null;
                try { qv = await _timeout(Promise.resolve(VE.embedLocal(q, EMBED_MODEL)).catch(() => null), QUERY_WAIT); } catch (e) { qv = null; }
                if (qv) {
                    usedVec = true;
                    const qf = new Float32Array(qv);
                    vec = pool.filter(u => vecs.has(u.uid)).map(u => ({ uid: u.uid, s: _dot(qf, vecs.get(u.uid)) }))
                        .filter(x => x.s >= VEC_MIN).sort((a, b) => b.s - a.s).slice(0, TOPK).map(x => x.uid);
                }
            }
        }
        const byUid = new Map(pool.map(u => [u.uid, u]));
        const memsOut = [], evsOut = [], seenM = new Set(), seenE = new Set(), seenT = new Set();
        for (const uid of _rrf([kw, vec])) {
            const u = byUid.get(uid);
            if (!u) continue;
            if (u.type === 'ev') {
                // 同一則只拿一段；內容一模一樣的經歷（重複的閒聊）只拿一次
                const t = _one(_evText(evMap.get(u.ref)));
                if (evsOut.length < RECALL_EV && !seenE.has(u.ref) && !seenT.has(t)) { seenE.add(u.ref); seenT.add(t); evsOut.push(u); }
            }
            else if (memsOut.length < RECALL_MEM && !seenM.has(u.ref + u.type)) { seenM.add(u.ref + u.type); memsOut.push(u); }
            if (memsOut.length >= RECALL_MEM && evsOut.length >= RECALL_EV) break;
        }
        return { mems: memsOut, evs: evsOut, usedVec, q };
    }
    function windowFrom(hist, fromIdx) {
        const h = hist || [];
        for (let i = Math.max(0, fromIdx || 0); i < h.length; i++) if (h[i] && h[i].timestamp) return h[i].timestamp;
        return Infinity;
    }
    async function _recallText(rid, R) {
        if (!R.mems.length && !R.evs.length) return '';
        const M = await mems(rid), evMap = _c(rid).evMap || new Map();
        const lines = [];
        R.mems.forEach(u => {
            const m = M.items.find(x => x.id === u.ref);
            if (!m) return;
            if (u.type === 'old') { lines.push('・以前（到' + _ago(u.until) + '為止）#' + _shortId(m.id) + '：' + u.text); return; }
            const src = (m.from || []).map(id => evMap.get(id)).find(e => e && e.state === 'ok');
            const s = src ? _snip(_evText(src), R.q + ' ' + m.text, SRC_SNIP) : '';
            lines.push('・' + _memLine(m) + (s ? '　原話：「' + s + '」' : ''));
        });
        R.evs.forEach(u => {
            const e = evMap.get(u.ref);
            if (!e) return;
            lines.push('・經歷（' + _ago(e.at) + '，' + (EV_NAME[e.kind] || e.kind) + '）' + _snip(u.text, R.q, EV_SNIP));
        });
        if (!lines.length) return '';
        return ['【這句話讓你想起的】',
            '從你的筆記和以前的經歷裡，照這句話找出來的；用不上就當沒看到。標「以前」的是過去的事，現在不一定還是這樣。筆記跟附的原話對不上時，以原話為準。']
            .concat(lines).join('\n');
    }
    /** 一句話要帶的三段（考試不叫這支）。recall 段每句會變，放說明最後 */
    async function sections(rid, o) {
        o = o || {};
        const P = await pinnedText(rid);
        const T = await traitsText(rid);
        const R = await recall(rid, { query: o.query, conv: o.conv, windowFromTs: o.windowFromTs, pinIds: P.shown });
        return { pinned: P.text, traits: T, recall: await _recallText(rid, R), usedVec: R.usedVec, over: P.over };
    }
    Object.assign(API, { EMBED_MODEL, recall, sections, windowFrom, embedPending, embedStatus, evText: _evText });

    // ── 舊聊天：一串會話一節一節的摘要（10-05 那套，從 os_xiaoji.js 搬來；行為照舊）────────
    const SUM_CHUNK = 30, SUM_GAP = 30, SUM_BUDGET = 2000, SUM_KEEP_RAW = 3, SUM_LINE = 400;
    async function sumGet(conv) {
        let v = null;
        try { v = conv ? await _get(SUM, conv) : null; } catch (e) { v = null; }
        return { nodes: (v && Array.isArray(v.nodes)) ? v.nodes : [], covered: (v && v.covered) || 0, totalAt: (v && v.totalAt != null) ? v.totalAt : null };
    }
    async function _sumSave(conv, s) { if (conv) await _put(SUM, conv, s); }
    function sumPlan(s, hist, cut) {
        const total = (hist || []).length;
        let covered = (s && s.covered) || 0;
        if (s && s.totalAt != null && total < s.totalAt) covered = Math.max(0, covered - (s.totalAt - total));
        covered = Math.min(covered, total);
        cut = cut || 0;
        return { total, covered, cut, from: Math.max(Math.min(cut, covered), cut - SUM_GAP), pending: Math.max(0, cut - covered) };
    }
    function sumSection(s) {
        const nodes = ((s && s.nodes) || []).filter(x => x && String(x.text || '').trim());
        if (!nodes.length) return '';
        return ['【更早以前的聊天（整理過的，由舊到新）】'].concat(nodes.map(x => '・' + String(x.text).trim()),
            ['上面是你跟' + USER + '更早以前聊過的事，整理過、不是逐字紀錄；接下來的對話才是最近的原文。講到以前的事要跟上面對得起來。']).join('\n');
    }
    /** 她在房間刪掉一節（那段就真的忘了，不會重寫；原本那節還在經歷簿） */
    async function sumRemove(conv, id) {
        const s = await sumGet(conv), n = s.nodes.length;
        s.nodes = s.nodes.filter(x => x.id !== id);
        if (s.nodes.length === n) return false;
        await _sumSave(conv, s);
        return true;
    }
    function _plainLine(c) { return _one(String(c == null ? '' : c).replace(/<(\w+)\b[^>]*>[\s\S]*?<\/\1\s*>/g, ' ').replace(/<[^>]+>/g, ' ')).slice(0, SUM_LINE); }

    // ── 整理（唯一叫模型的那一通）────────────────────────────
    const TIDY_EVERY = 20, TIDY_MAX_BATCH = 40, CHAT_CLIP = 1500, TIDY_CAP = { add: 10, fix: 5, trait: 3 }, REL_MEMS = 40;
    const COUNTED = ['chat', 'prop', 'lesson', 'exam', 'hw', 'theater', 'wear', 'room', 'bubble', 'born'];
    function _isRae(e) { return (e.kind === 'mem' || e.kind === 'trait') ? e.by === 'rae' : e.kind === 'erase'; }
    function _mdate(at) { const d = new Date(at || 0); return (d.getMonth() + 1) + '/' + d.getDate(); }
    function _batchLine(e) {
        const head0 = e.id + '（' + _mdate(e.at) + '）';
        if (e.kind === 'chat') {
            const tools = (e.tools || []).map(t => t.label || t.name).filter(Boolean);
            return head0 + '聊天｜' + USER + '：' + String(e.user || '').slice(0, CHAT_CLIP) + '｜它：' + String(e.reply || '').slice(0, CHAT_CLIP)
                + (tools.length ? '｜它用了：' + tools.join('、') : '') + ((e.props || []).length ? '｜交了單子：' + e.props.map(p => p.text || '').join('；') : '');
        }
        return head0 + _one(_evText(e, '它'));
    }
    function _raeLine(e) {
        if (e.kind === 'erase') return e.id + '　' + USER + '抹掉了經歷 ' + (e.ids || []).join('、');
        if (e.kind === 'mem') {
            const v = { wrong: '標成記錯了', fix: '改正成「' + e.text + '」', update: '改成「' + e.text + '」', stow: '收起來了', unstow: '放回去了', revert: '退回成「' + e.text + '」', add: '幫它記了「' + e.text + '」' }[e.verb] || e.verb;
            return e.id + '　' + USER + '把 #' + _shortId(e.mid) + '「' + ((e.prev && e.prev.text) || '') + '」' + v;
        }
        return e.id + '　' + USER + '拿掉了樣子 ' + e.tid + '「' + ((e.prev && e.prev.text) || '') + '」';
    }
    function maintainPrompt(o) {
        const out = ['你在替「' + o.me + '」整理它的記憶。' + o.me + '是住在奧瑞亞宿舍、替' + USER + '做事的小 AI；' + USER + '是玩奧瑞亞的那個人。照下面要做的事，只交標籤，不要寫別的話。'];
        if (o.batch) {
            out.push('', '【這一批經歷】（每一行開頭是編號，出處就寫這個編號）');
            o.batch.forEach(e => out.push(_batchLine(e)));
            out.push('', '【它現在的筆記】（跟這一批可能有關的）');
            if (o.mems.length) o.mems.forEach(m => out.push('#' + _shortId(m.id) + '［' + KIND_NAME[m.kind] + '｜關於' + ABOUT_NAME[m.about] + '］' + m.text + '（出處 ' + m.from.join(',') + '）'));
            else out.push('還沒有。');
            out.push('', '【它現在的樣子】');
            if (o.traits.length) o.traits.forEach(t => out.push(t.id + '［' + TRAIT_NAME[t.kind] + '］' + t.text + '（出處 ' + t.from.join(',') + '）'));
            else out.push('還沒有。');
            if (o.rae.length) { out.push('', '【' + USER + '這一批做的事】（要特別照顧）'); o.rae.forEach(l => out.push(l)); }
            out.push('', '要做的：',
                '一、補記：這一批裡值得記、筆記還沒有的。<mem_add kind="種類" about="關於誰" from="編號,編號">一句話</mem_add>。'
                + 'kind 只能是 user（' + USER + '是什麼樣的人、喜好、習慣）、promise（約定、交代、答應的事）、event（發生過的重要的事）、work（它做過的東西）；'
                + 'about 只能是 user（' + USER + '本人）、self（它自己）、story（' + USER + '玩的故事裡的事，包括主角）、other（別人）。寒暄和一次性的小事不用記。',
                '二、更正：這一批跟現在的筆記對不上的。以前對、後來變了：<mem_update id="號碼" from="編號">新的說法</mem_update>；當初就記錯了：<mem_fix id="號碼" from="編號">正確的說法</mem_fix>。對得上就不要動。種類或關於誰標錯的（例如約定被記成發生過的事），也用 mem_update，把屬性寫成對的、內容照抄。' + USER + '標成記錯或改正過的，不要改回原本的說法。',
                '三、樣子：只有這一批看得出它跟' + USER + '相處時的做法有變化，才寫。<trait_add kind="欄" from="編號,編號">一句做法</trait_add>、<trait_update id="號碼" from="編號">新的做法</trait_update>、<trait_drop id="號碼" from="編號"/>。'
                + '欄只能是 talk（講話的方式）、taste（它自己的喜好和主見）、bond（跟' + USER + '的相處）、work（做事的習慣）。只寫做出來的樣子，不寫形容詞；寫不出是哪幾行看出來的就不要寫。' + USER + '拿掉的樣子不要再寫回來。',
                '出處只能寫上面這一批的編號（改舊筆記時也可以寫它原本的出處）。不能收起、不能刪任何一條。標籤名、屬性名、屬性值照抄英文。',
                '這一批沒有要做的，就只交 <none/>。');
        }
        if (o.sum) {
            out.push('', '【這一串要整理成一節的舊對話】' + (o.sum.prev ? '（下面附上一節，只是讓你接得上，上一節寫過的不要再寫）' : ''));
            if (o.sum.prev) out.push('上一節：' + o.sum.prev);
            o.sum.lines.forEach(l => out.push(l));
            out.push('把這一段整理成一節，放在 <conv_summary>…</conv_summary> 裡：第三人稱客觀敘述，不要條列與標題；只留之後還可能被提起的（交代或拜託的事、做了什麼、還沒做完的、答應的事、' + USER + '說到自己的事與喜好、兩個之間相處的變化）；時間先後要看得出來；250 字以內。');
        }
        if (o.merge) {
            out.push('', '【要併成一節的舊記錄】');
            o.merge.forEach((t, i) => out.push('第 ' + (i + 1) + ' 節：' + t));
            out.push('把這幾節併成一節，放在 <conv_merge>…</conv_merge> 裡：第三人稱，不要條列；交代的事、答應的事、沒做完的事、' + USER + '說到自己的事與喜好都要留下，已經被後來推翻的寫成過去；400 字以內。');
        }
        return out.join('\n');
    }
    const T_MEM = /[<＜]\s*(mem_add|mem_update|mem_fix)\b([^>＞]*)[>＞]([\s\S]*?)[<＜]\s*\/\s*\1\s*[>＞]/gi;
    const T_TRAIT = /[<＜]\s*(trait_add|trait_update)\b([^>＞]*)[>＞]([\s\S]*?)[<＜]\s*\/\s*\1\s*[>＞]/gi;
    const T_DROP = /[<＜]\s*trait_drop\b([^>＞]*?)\/?\s*[>＞]/gi;
    const T_SUM = /[<＜]\s*conv_summary\b[^>＞]*[>＞]([\s\S]*?)[<＜]\s*\/\s*conv_summary\s*[>＞]/i;
    const T_MERGE = /[<＜]\s*conv_merge\b[^>＞]*[>＞]([\s\S]*?)[<＜]\s*\/\s*conv_merge\s*[>＞]/i;
    const T_NONE = /[<＜]\s*none\s*\/?\s*[>＞]/i;
    function _clean(t) { return String(t || '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim(); }
    function _tags(text) {
        const out = [];
        let m;
        T_MEM.lastIndex = 0; while ((m = T_MEM.exec(text))) out.push({ type: 'mem', verb: m[1].toLowerCase().slice(4), attrs: m[2], text: _one(m[3]), raw: m[0].slice(0, 80) });
        T_TRAIT.lastIndex = 0; while ((m = T_TRAIT.exec(text))) out.push({ type: 'trait', verb: m[1].toLowerCase().slice(6), attrs: m[2], text: _one(m[3]), raw: m[0].slice(0, 80) });
        T_DROP.lastIndex = 0; while ((m = T_DROP.exec(text))) out.push({ type: 'trait', verb: 'drop', attrs: m[1], text: '', raw: m[0].slice(0, 80) });
        return out;
    }
    async function _setHead(rid, patch) { return _lock(rid, async () => { const h = Object.assign(await head(rid), patch || {}); await _put(LIFE, rid + ':head', h); return h; }); }
    async function _due(rid, o) {
        const h = await head(rid), all = await allEvents(rid);
        const after = all.filter(e => _num(e.id) > h.tidyAt);
        const counted = after.filter(e => e.state === 'ok' && COUNTED.indexOf(e.kind) !== -1);
        let tidy = null;
        if (counted.length >= TIDY_EVERY || (o.force && counted.length)) {
            const batch = counted.slice(0, TIDY_MAX_BATCH);
            const upto = _num(batch[batch.length - 1].id);
            tidy = { batch, upto, rae: after.filter(e => _num(e.id) <= upto && _isRae(e)) };
        }
        let sum = null, merge = null, s = null;
        if (o.conv && Array.isArray(o.hist)) {
            s = await sumGet(o.conv);
            const p = sumPlan(s, o.hist, o.cut || 0);
            if (p.pending >= SUM_CHUNK || (o.force && p.pending)) {
                const end = Math.min(p.cut, p.covered + SUM_CHUNK);
                const lines = o.hist.slice(p.covered, end).filter(m => m && (m.role === 'user' || m.role === 'assistant') && m.content)
                    .map(m => (m.role === 'user' ? USER : (o.me || '小機')) + '：' + _plainLine(m.content)).filter(l => !/：$/.test(l));
                sum = { plan: p, end, lines, prev: s.nodes.length ? String(s.nodes[s.nodes.length - 1].text || '') : '' };
            }
            const chars = s.nodes.reduce((a, x) => a + String(x.text || '').length, 0);
            if (chars > SUM_BUDGET && s.nodes.length > SUM_KEEP_RAW + 1) merge = s.nodes.slice(0, s.nodes.length - SUM_KEEP_RAW);
        }
        return { h, tidy, sum, merge, s };
    }
    async function _relMems(rid, batch) {
        const M = (await mems(rid)).items.filter(m => m.state === 'ok');
        if (M.length <= REL_MEMS) return M;
        const units = M.map(m => { const t = _bigrams(m.text), tf = {}; t.forEach(w => { tf[w] = (tf[w] || 0) + 1; }); return { m, tf, len: t.length, text: m.text }; });
        const hit = _bm25(units, batch.map(e => _evText(e)).join('\n')).slice(0, REL_MEMS).map(x => units[x.i].m);
        M.filter(isPinned).forEach(m => { if (hit.indexOf(m) === -1) hit.push(m); });
        return hit;
    }
    const _mBusy = {};
    /** 該整理的整理、該摘要的摘要，塞同一通。o：{ conv, hist, cut, me, call(messages) → {text, usage}, force } */
    async function maintain(rid, o) {
        o = o || {};
        if (_mBusy[rid]) return { ran: false, why: '正在整理' };
        _mBusy[rid] = true;
        try {
            const d = await _due(rid, o);
            if (!d.tidy && !d.sum && !d.merge) return { ran: false, why: '還不用整理' };
            const relMems = d.tidy ? await _relMems(rid, d.tidy.batch) : [];
            const T = d.tidy ? (await traits(rid)).items.filter(t => t.state === 'ok') : [];
            const prompt = maintainPrompt({ me: o.me || '小機', batch: d.tidy && d.tidy.batch, mems: relMems, traits: T,
                rae: d.tidy ? d.tidy.rae.map(_raeLine) : [], sum: d.sum, merge: d.merge && d.merge.map(x => String(x.text || '')) });
            let text = '', usage = null, callErr = '';
            try { const r = await o.call([{ role: 'system', content: prompt }]); text = _clean(r && r.text); usage = (r && r.usage) || null; }
            catch (e) { callErr = (e && e.message) || '沒有回應'; }
            const res = { ran: true };
            if (d.tidy) res.tidy = await _applyTidy(rid, d.tidy, text, callErr, usage, !!d.sum);
            if (d.sum) {
                const m = T_SUM.exec(text), body = m ? _clean(m[1]).replace(/<[^>]+>/g, ' ').trim() : '';
                if (body) {
                    const s = d.s;
                    s.nodes.push({ id: 'sn' + _now().toString(36) + Math.random().toString(36).slice(2, 6), text: body, at: _now() });
                    s.covered = d.sum.end; s.totalAt = d.sum.plan.total;
                    await _sumSave(o.conv, s);
                    await log(rid, { kind: 'sum', conv: o.conv, text: body });
                    res.sum = { ok: true };
                } else res.sum = { ok: false, why: callErr || '沒交這一節' };
            }
            if (d.merge) {
                const m = T_MERGE.exec(text), body = m ? _clean(m[1]).replace(/<[^>]+>/g, ' ').trim() : '';
                if (body) {
                    const s = await sumGet(o.conv);
                    s.nodes = [{ id: 'sn' + _now().toString(36), text: body, at: _now(), combined: d.merge.length }].concat(s.nodes.slice(d.merge.length));
                    await _sumSave(o.conv, s);
                    await log(rid, { kind: 'sum', conv: o.conv, text: body, merged: d.merge.length });
                }
            }
            return res;
        } finally { delete _mBusy[rid]; }
    }
    async function _applyTidy(rid, tidy, text, callErr, usage, withSum) {
        const inBatch = new Set(tidy.batch.map(e => e.id));
        const changes = [], rejected = [];
        const cnt = { add: 0, fix: 0, trait: 0 };
        const tags = callErr ? [] : _tags(text);
        for (const t of tags) {
            const from = _evIds(_attr(t.attrs, 'from'));
            const reject = why => rejected.push({ tag: t.raw, why });
            if (t.type === 'mem') {
                const verb = t.verb;
                if (verb === 'add' ? cnt.add >= TIDY_CAP.add : cnt.fix >= TIDY_CAP.fix) { reject('這一通交太多了'); continue; }
                let own = [];
                if (verb !== 'add') { const m = (await mems(rid)).items.find(x => x.id === _idOf('m', _attr(t.attrs, 'id'))); own = m ? m.from : []; }
                if (from.length && from.some(f => !inBatch.has(f) && own.indexOf(f) === -1)) { reject('出處不在這一批'); continue; }
                const r = verb === 'add'
                    ? await memDo(rid, 'add', { kind: _attr(t.attrs, 'kind'), about: _attr(t.attrs, 'about'), text: t.text, from, by: 'tidy' })
                    : await memDo(rid, verb, { id: _attr(t.attrs, 'id'), text: t.text, from, by: 'tidy', kind: _attr(t.attrs, 'kind'), about: _attr(t.attrs, 'about') });
                if (!r.ok) { reject(r.why); continue; }
                cnt[verb === 'add' ? 'add' : 'fix']++;
                changes.push({ type: 'mem', verb, id: r.id, prev: r.prev });
            } else {
                if (cnt.trait >= TIDY_CAP.trait) { reject('這一通交太多了'); continue; }
                let own = [];
                if (t.verb !== 'add') { const x = (await traits(rid)).items.find(y => y.id === _idOf('t', _attr(t.attrs, 'id'))); own = x ? x.from : []; }
                if (from.length && from.some(f => !inBatch.has(f) && own.indexOf(f) === -1)) { reject('出處不在這一批'); continue; }
                const r = await traitDo(rid, t.verb, { id: _attr(t.attrs, 'id'), kind: _attr(t.attrs, 'kind'), text: t.text, from, by: 'tidy' });
                if (!r.ok) { reject(r.why); continue; }
                cnt.trait++;
                changes.push({ type: 'trait', verb: t.verb, id: r.id, prev: r.prev });
            }
        }
        const none = !callErr && T_NONE.test(text);
        const ok = !callErr && (changes.length > 0 || (!tags.length && (none || (withSum && T_SUM.test(text)))));
        const why = ok ? '' : (callErr || (tags.length ? '交的都不收：' + rejected.map(x => x.why).join('、') : '沒交東西'));
        if (ok) {
            const id = await log(rid, { kind: 'tidy', upto: 'e' + tidy.upto, n: tidy.batch.length, changes, rejected, sum: withSum, ok: true, usage });
            await _setHead(rid, { tidyAt: tidy.upto, tidyFails: 0, tidyErr: '', lastTidy: id });
        } else {
            const h = await head(rid);
            await _setHead(rid, { tidyFails: (h.tidyFails || 0) + 1, tidyErr: why });
        }
        return { ok, why, changes, rejected, raw: String(text || '').slice(0, 4000) };
    }
    /** 她按「退回這一次」：新增的收起、改的改回去、性格的照原樣，整理那行標退回 */
    async function revertTidy(rid, tidyId) {
        const ev = (await allEvents(rid)).find(e => e.id === tidyId && e.kind === 'tidy');
        if (!ev) return { ok: false, why: '找不到這一次整理' };
        if (ev.reverted) return { ok: false, why: '已經退回過了' };
        for (const c of (ev.changes || []).slice().reverse()) {
            if (c.type === 'mem') {
                if (c.verb === 'add') await memDo(rid, 'stow', { id: c.id, by: 'rae' });
                else await memDo(rid, 'revert', { id: c.id, text: c.prev && c.prev.text, by: 'rae', kind: c.prev && c.prev.kind, about: c.prev && c.prev.about, state: c.prev && c.prev.state });
            } else {
                if (c.verb === 'add') await traitDo(rid, 'remove', { id: c.id, by: 'rae' });
                else await traitDo(rid, 'revert', { id: c.id, text: c.prev && c.prev.text, state: (c.prev && c.prev.state) || 'ok', by: 'rae' });
            }
        }
        await _patch(rid, [tidyId], row => { row.reverted = _now(); });
        return { ok: true };
    }
    async function status(rid) {
        const h = await head(rid), all = await allEvents(rid);
        const pending = all.filter(e => _num(e.id) > h.tidyAt && e.state === 'ok' && COUNTED.indexOf(e.kind) !== -1).length;
        const last = h.lastTidy ? all.find(e => e.id === h.lastTidy) : null;
        const M = await mems(rid), T = await traits(rid);
        let embed = { done: 0, total: 0, ready: false };
        try { embed = await embedStatus(rid); } catch (e) {}
        return { pending, every: TIDY_EVERY, lastTidy: last, tidyFails: h.tidyFails || 0, tidyErr: h.tidyErr || '', embed,
            counts: { events: all.length, mems: M.items.filter(m => m.state === 'ok').length, traits: T.items.filter(t => t.state === 'ok').length } };
    }
    Object.assign(API, { SUM_CHUNK, sumGet, sumPlan, sumSection, sumRemove, maintain, maintainPrompt, revertTidy, status, _setHead });

    // ── 刪整隻（宿舍請它搬走）──────────────────────────────
    async function drop(rid, convs) {
        const h = await head(rid), vh = await _get(VEC, rid + ':head');
        for (let b = 0; b <= h.blocks; b++) await _put(LIFE, rid + ':' + b, null);
        await _put(LIFE, rid + ':head', null);
        await _put(MEMS, rid, null); await _put(TRAITS, rid, null);
        for (let b = 0; b < ((vh && vh.blocks) || 0); b++) await _put(VEC, rid + ':' + b, null);
        await _put(VEC, rid + ':head', null);
        for (const c of (Array.isArray(convs) ? convs : [])) if (c) await _put(SUM, c, null);
        delete _cache[rid];
    }
    Object.assign(API, { drop });

    // ── 搬家（新版第一次載入，每隻做一次；她定的：搬現有的、不花錢、性格之後長）────────
    function _pairs(conv, msgs) {
        const out = [];
        let users = [];
        (msgs || []).forEach(m => {
            if (!m || m.held) return;
            if (m.role === 'user') { users.push(m); return; }
            if (m.role !== 'assistant') return;
            const ts = users.length ? (users[users.length - 1].timestamp || 0) : 0;
            out.push({ kind: 'chat', conv, ts, at: ts || m.timestamp || 0, imported: true,
                user: users.map(u => String(u.content || '')).join('\n'), reply: String(m.content || ''),
                tools: (m.xjlog || []).map(x => ({ name: x.tool || '', label: x.label || '', ok: !!x.ok })),
                props: (m.props || []).map(p => ({ id: p.id || (p.prop && p.prop.id) || '', text: p.text || '' })) });
            users = [];
        });
        if (users.length) {
            const ts = users[users.length - 1].timestamp || 0;
            out.push({ kind: 'chat', conv, ts, at: ts, imported: true, user: users.map(u => String(u.content || '')).join('\n'), reply: '', tools: [], props: [] });
        }
        return out;
    }
    function _migKey(ev) { return ev.kind + '|' + (ev.conv || '') + '|' + (ev.ts || '') + '|' + (ev.what || '') + '|' + (ev.skill || '') + '|' + String(ev.text || ev.user || '').slice(0, 40); }
    async function migrate(rid, convs) {
        const h0 = await head(rid);
        if (h0.migrated >= V) return { ran: false };
        const all0 = await allEvents(rid);
        // 中途壞掉再來一次：已經搬過的那幾行不再搬
        const seen = new Set(all0.filter(e => e.imported).map(_migKey));
        const once = async ev => {
            const row = Object.assign({ imported: true }, ev), k = _migKey(row);
            if (seen.has(k)) return null;
            seen.add(k);
            return log(rid, row);
        };
        const X = _g('OS_XIAOJI');
        const rec = (X && X.get) ? await X.get(rid) : {};
        let nEv = 0, nMem = 0;
        // 1. 對話（全部會話照時間排）
        const D = _g('OS_DB'), rows = [];
        for (const c of (convs || [])) {
            let msgs = null;
            try { msgs = (D && D.getStudioChat) ? await D.getStudioChat('xiaoji_conv_' + c.id) : null; } catch (e) { msgs = null; }
            _pairs(c.id, msgs).forEach(p => { if (!p.at) p.at = c.created || rec.born || 1; rows.push(p); });
        }
        rows.sort((a, b) => a.at - b.at);
        for (const p of rows) if (await once(p)) nEv++;
        // 2. 舊聊天摘要
        for (const c of (convs || [])) {
            const s = await sumGet(c.id);
            for (const n of s.nodes) if (await once({ kind: 'sum', conv: c.id, text: String(n.text || ''), at: n.at || 1 })) nEv++;
        }
        // 3. 領養、上過的課、作業、小劇場
        if (rec.born && await once({ kind: 'born', text: '來到宿舍住下', at: rec.born })) nEv++;
        const L = _g('OS_XIAOJI_LESSONS') || { SKILLS: [] };
        for (const id of Object.keys(rec.skills || {})) {
            const sk = rec.skills[id];
            if (!sk) continue;
            const label = ((L.SKILLS || []).find(x => x.id === id) || {}).label || id;
            if (await once({ kind: 'exam', skill: id, label, pass: true, text: sk.summary || '', at: sk.at || rec.born || 1 })) nEv++;
            if (sk.hw && await once({ kind: 'hw', skill: id, label, state: sk.hw.state, text: (sk.hw.state === 'done' ? '收下了作業' : '作業') + '：' + (sk.summary || ''), at: sk.at || 1 })) nEv++;
            if (sk.theater && await once({ kind: 'theater', skill: id, label, text: '演了一場：' + (sk.theater.title || ''), at: sk.theater.at || sk.at || 1 })) nEv++;
        }
        // 4. 舊記事 → 以前記的（釘住）。原本整份留在 import 那一行
        const notes = (rec.notes && Array.isArray(rec.notes.items)) ? rec.notes.items : [];
        if (notes.length) {
            const have = new Set((await mems(rid)).items.map(m => m.text));
            const imp = (await once({ kind: 'import', what: 'notes', data: rec.notes, at: _now(), text: '' }))
                || ((await allEvents(rid)).find(e => e.kind === 'import' && e.what === 'notes') || {}).id;
            for (const n of notes) {
                const t = _one(n.text).slice(0, MEM_LEN);
                if (!t || have.has(t)) continue;
                const r = await memDo(rid, 'add', { kind: 'legacy', about: 'user', text: t, from: [imp], by: 'import', at: n.at || _now() });
                if (r.ok) nMem++;
            }
            if (X && X.save) await X.save(rid, { notes: undefined });
        }
        await _lock(rid, async () => { const h = await head(rid); h.migrated = V; h.tidyAt = h.nextId - 1; await _put(LIFE, rid + ':head', h); });
        return { ran: true, events: nEv, mems: nMem };
    }
    const _migRun = {};
    /** 房間送話前叫：沒搬過才搬（getConvs 只在要搬時叫一次） */
    async function ensureMigrated(rid, getConvs) {
        if ((await head(rid)).migrated >= V) return { ran: false };
        if (!_migRun[rid]) _migRun[rid] = Promise.resolve().then(() => migrate(rid, typeof getConvs === 'function' ? getConvs() : getConvs)).finally(() => { delete _migRun[rid]; });
        return _migRun[rid];
    }

    // ── 單隻匯出匯入（換電腦、酒館搬手機版）──────────────────
    async function exportOne(rid, extra) {
        extra = extra || {};
        const D = _db(), h = await head(rid), blocks = [];
        for (let b = 0; b < h.blocks; b++) blocks.push(await _readBlock(rid, b));
        const X = _g('OS_XIAOJI');
        const convs = [], sums = {}, props = {};
        for (const c of (extra.convs || [])) {
            const msgs = (D.getStudioChat ? await D.getStudioChat('xiaoji_conv_' + c.id) : null) || [];
            convs.push({ meta: c, messages: msgs });
            sums[c.id] = await sumGet(c.id);
            for (const m of msgs) for (const p of (m.props || [])) {
                const pr = p.prop || p;
                if (pr && pr._big && pr.id && !props[pr.id]) { const full = await _get('xiaoji_prop', pr.id); if (full) props[pr.id] = full; }
            }
        }
        return { v: V, kind: 'aurelia-xiaoji', at: _now(), resident: extra.resident || { id: rid },
            rec: (X && X.get) ? await X.get(rid) : null, life: { head: h, blocks }, mem: await mems(rid), trait: await traits(rid), sums, convs, props };
    }
    async function importOne(data, opt) {
        opt = opt || {};
        if (!data || data.kind !== 'aurelia-xiaoji' || !data.life) throw new Error('這不是小機的檔案');
        const D = _db();
        const oldRid = (data.resident && data.resident.id) || 'r_' + _now().toString(36);
        const rid = opt.asNew ? 'r_' + _now().toString(36) + Math.random().toString(36).slice(2, 5) : oldRid;
        const convMap = {};
        (data.convs || []).forEach(c => { const id = c.meta.id; convMap[id] = opt.asNew ? 'xc_' + _now().toString(36) + Math.random().toString(36).slice(2, 6) : id; });
        const mapConv = id => convMap[id] || id;
        for (let b = 0; b < data.life.blocks.length; b++) {
            const blk = JSON.parse(JSON.stringify(data.life.blocks[b]));
            blk.items.forEach(e => { if (e.conv) e.conv = mapConv(e.conv); });
            await _put(LIFE, rid + ':' + b, blk);
        }
        await _put(LIFE, rid + ':head', Object.assign({}, data.life.head));
        await _put(MEMS, rid, data.mem || { v: V, nextId: 1, items: [] });
        await _put(TRAITS, rid, data.trait || { v: V, nextId: 1, items: [] });
        if (data.rec) await _put('xiaoji', rid, data.rec);
        const convs = [];
        for (const c of (data.convs || [])) {
            const id = mapConv(c.meta.id);
            if (D.saveStudioChat) await D.saveStudioChat('xiaoji_conv_' + id, c.messages || []);
            const s = (data.sums || {})[c.meta.id];
            if (s) await _put(SUM, id, s);
            convs.push(Object.assign({}, c.meta, { id, residentId: rid }));
        }
        for (const pid of Object.keys(data.props || {})) await _put('xiaoji_prop', pid, data.props[pid]);
        delete _cache[rid];
        return { rid, resident: Object.assign({}, data.resident, { id: rid }), convs };
    }
    Object.assign(API, { migrate, ensureMigrated, exportOne, importOne });

    // ── (後面的段落接在這行上面) ──

    win.OS_XIAOJI_MEM = API;
    if (win !== window) { try { window.OS_XIAOJI_MEM = API; } catch (e) {} }
})();
