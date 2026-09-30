// ----------------------------------------------------------------
// [檔案] os_aurelia_edit.js — 「改世界書」：角色提出修改，她按同意才寫進去
// 路徑：os_phone/os/os_aurelia_edit.js
//
// 小機工具的第二級「會動手」（盤點見 docs/小機奧瑞亞工具清單_20260930.md 二、會動手）。
// 查的那一級在 os_aurelia_tools.js；這支放要改東西的，而且一律不直接改：
//   角色叫工具 → 這裡先檢查（找得到那一條、要換的那段只出現一次、不是世界門管的書）→ 做成一張單子（prop）
//   → 聊天 app 冒一行，她點開看改前改後 → 按同意才 apply → 寫完還能 undo（改回去）。
//   ・範圍跟查世界書一樣：這個故事開著的書（OS_AURELIA_TOOLS.books）。
//   ・酒館寫酒館助手的 lorebook；手機寫 OS_WORLDBOOK.lorebookApi（同名函式，書包）。
//   ・不給刪：要拿掉就關掉（enabled:false），她隨時開得回來。
//   ・🚫 世界門那三本：【奧瑞亞世界】【奧瑞亞-視差】不給改（開關與條目由世界門程式管，工具去寫會打架）；
//     【奧瑞亞-人物核心】只准改已經有的條目內容（09-30 開放）——世界門每次現讀這本的標題與內容排熟人名冊，
//     標題、關鍵字（「僅存放資料」那種標記）、開關會改到名冊，不給動；也不給加新條目。
//   ・條目在提出之後被改過（她自己改、別張單子先寫了）→ 這張作廢，不蓋掉；改回去也一樣。
// 暴露：window.OS_AURELIA_EDIT = { note, tools, run(name, args), propose(name, args), apply(prop), undo(prop), text(prop, forModel), verb, sheet, logTool, readLog }
//   ・修改紀錄（aurelia_change_log）：單子寫進去／改回去時記一筆，誰提的、改了哪一段，給角色與住戶改之前先看。
//   prop 是普通物件（存在聊天 app 那一則系統訊息上），apply／undo 會改它的 state：
//   wait 等她決定 → done 寫進去了 → undone 改回去了；no 她沒同意（之後還能同意）；stale 條目被改過、作廢。
//   🔀 所有「會動手」的單子都從這裡進：prop.mod === 'preset'（改預設，os_aurelia_preset.js）的 apply／undo／text／verb／sheet
//     轉給 OS_AURELIA_PRESET。聊天 app（WX_TOOLS 單子小窗、wx_core、wx_view）與房間留言板都只認這支，不用各接一條。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const LOCKED = ['【奧瑞亞世界】', '【奧瑞亞-視差】'];
    const CONTENT_ONLY = ['【奧瑞亞-人物核心】'];
    const CONTENT_MAX = 12000;   // 一條最多幾個字
    const READ_MAX = 2800;       // 看全文最多交回去幾個字（聊天 app 一次結果上限 3000）

    function _pwa() { try { return !!(win.OS_API && win.OS_API.isStandalone && win.OS_API.isStandalone()); } catch (e) { return false; } }
    function _api() { return _pwa() ? ((win.OS_WORLDBOOK && win.OS_WORLDBOOK.lorebookApi) || null) : (win.TavernHelper || null); }
    function _T() { return win.OS_AURELIA_TOOLS || window.OS_AURELIA_TOOLS; }
    function _fold(s) { const T = _T(); return (T && T.fold) ? T.fold(s) : String(s == null ? '' : s).toLowerCase(); }
    function _one(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
    function _cut(s, n) { s = String(s == null ? '' : s).trim(); return s.length > n ? s.slice(0, n) + '…' : s; }
    function _keysArr(k) { return (Array.isArray(k) ? k : String(k == null ? '' : k).split(/[,，、]/)).map(function (x) { return String(x).trim(); }).filter(Boolean); }
    function _keysText(arr) { return (arr && arr.length) ? arr.join(', ') : '（沒有關鍵字＝常駐，每一輪都會送）'; }
    function _bool(v) {
        if (typeof v === 'boolean') return v;
        const s = String(v == null ? '' : v).trim().toLowerCase();
        if (/^(true|1|on|yes|開|打開|开|打开|啟用|启用)$/.test(s)) return true;
        if (/^(false|0|off|no|關|關掉|关|关掉|停用)$/.test(s)) return false;
        return undefined;
    }
    function _newId() { return 'pp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
    function _locked(book) { return LOCKED.indexOf(book) !== -1; }
    function _contentOnly(book) { return CONTENT_ONLY.indexOf(book) !== -1; }
    function _gateNote(book) { return _locked(book) ? '（世界門管的，只能看）' : (_contentOnly(book) ? '（世界門管的，只能改內容）' : ''); }
    function _same(a, b) {
        return a.comment === b.comment && a.content === b.content && a.enabled === b.enabled && _keysArr(a.keys).join(',') === _keysArr(b.keys).join(',');
    }
    function _onlyContent(a, b) { return a.comment === b.comment && a.enabled === b.enabled && _keysArr(a.keys).join(',') === _keysArr(b.keys).join(','); }
    function _snap(e) { return { comment: e.comment, keys: e.keys.slice(), content: e.content, enabled: e.enabled }; }
    // 別的模組的單子（改預設）：交給那支處理。回 undefined＝是世界書的單子，照這支自己的走
    function _other(prop) {
        if (!prop || !prop.mod) return undefined;
        if (prop.mod === 'preset') return win.OS_AURELIA_PRESET || window.OS_AURELIA_PRESET || null;
        if (prop.mod === 'vn') return win.OS_AURELIA_VN || window.OS_AURELIA_VN || null;   // 改 VN 組件（os_aurelia_vn.js）
        if (prop.mod === 'theme') return win.OS_AURELIA_THEME || window.OS_AURELIA_THEME || null;   // 改主題（os_aurelia_theme.js）
        if (prop.mod === 'fx') return win.OS_AURELIA_FX || window.OS_AURELIA_FX || null;   // 改特效（os_aurelia_fx.js）
        if (prop.mod === 'vnrule') return win.OS_AURELIA_VNRULE || window.OS_AURELIA_VNRULE || null;   // 改指令（os_aurelia_vnrule.js）
        if (prop.mod === 'bubble') return win.OS_AURELIA_BUBBLE || window.OS_AURELIA_BUBBLE || null;   // 改泡泡（os_aurelia_bubble.js）
        return null;
    }

    // 範圍＝所有的書（跟創作室世界書設計師一樣），這個故事開著的排前面（open）
    async function _books() { const T = _T(); return (T && T.allBooks) ? await T.allBooks() : { names: [], open: [] }; }
    async function _entriesOf(book) {
        const A = _api();
        if (!A || !A.getLorebookEntries) return [];
        let es = [];
        try { es = (await A.getLorebookEntries(book)) || []; } catch (e) {}
        return es.map(function (e) { return { uid: e.uid, comment: String(e.comment || ''), keys: _keysArr(e.keys), content: String(e.content || ''), enabled: e.enabled !== false }; });
    }
    // 用標題找（所有的書；關著的條目也找，才能再打開）。只有標題一模一樣（繁簡不計）才算，差一點的只拿來提示
    async function _find(title, book) {
        const ft = _fold(_one(title));
        const bs = await _books();
        let names = bs.names;
        if (book) names = names.filter(function (n) { return n === book || _fold(n) === _fold(book); });
        const exact = [], near = [];
        for (const b of names) {
            (await _entriesOf(b)).forEach(function (e) {
                const fc = _fold(_one(e.comment));
                if (!fc) return;
                if (fc === ft) exact.push({ book: b, e: e });
                else if (fc.indexOf(ft) !== -1 || ft.indexOf(fc) !== -1) near.push({ book: b, e: e });
            });
        }
        return { exact: exact, near: near, names: bs.names, open: bs.open, bookAsked: book && !names.length };
    }
    function _missText(title, f, book) {
        if (!f.names.length) return '還沒有任何世界書。';
        if (f.bookAsked) return '沒有叫「' + book + '」的書。aurelia_worldbook_read 什麼都不填，可以列出所有的書。';
        if (f.near.length) return '世界書裡沒有標題叫「' + title + '」的條目。標題相近的有：' + f.near.slice(0, 6).map(function (h) { return '「' + h.e.comment + '」（' + h.book + '）'; }).join('、') + '。標題要照這裡一字不差寫。';
        return '世界書裡沒有標題叫「' + title + '」的條目。先用 aurelia_worldbook_search 找到那一條，標題照找到的寫。';
    }
    function _manyText(title, f) {
        return '有 ' + f.exact.length + ' 本書都有叫「' + title + '」的條目：' + f.exact.map(function (h) { return h.book; }).join('、') + '。用 book 寫是哪一本。';
    }
    // 一段文字在內容裡出現幾次、第一次在哪。原字找不到再用繁簡折過的找（WX_ZH 一字對一字，位置不變）
    function _locate(content, find) {
        const count = function (hay, needle) { let n = 0, at = -1, i = hay.indexOf(needle); while (i !== -1) { if (at < 0) at = i; n++; i = hay.indexOf(needle, i + needle.length); } return { count: n, at: at }; };
        let r = count(content, find);
        if (r.count) return r;
        const fc = _fold(content), ff = _fold(find);
        if (fc.length === content.length && ff.length === find.length) r = count(fc, ff);
        return r;
    }

    // ── 看：有哪些書／某本書有哪些條目／某一條全文（改之前先看）─────────────────
    function _bookLabel(n, bs) { return n + (bs.open.indexOf(n) !== -1 ? '（這個故事開著）' : '') + _gateNote(n); }
    async function _listBooks() {
        const bs = await _books();
        if (!bs.names.length) return '還沒有任何世界書。';
        return ['有這些世界書（共 ' + bs.names.length + ' 本，這個故事開著的在前面）' + (bs.names.length > 60 ? '，列前 60 本' : '') + '：']
            .concat(bs.names.slice(0, 60).map(function (n) { return '・' + _bookLabel(n, bs); })).join('\n');
    }
    async function _listEntries(book) {
        const bs = await _books();
        const hit = bs.names.find(function (n) { return n === book; }) || bs.names.find(function (n) { return _fold(n) === _fold(book); });
        if (!hit) return '沒有叫「' + book + '」的書。aurelia_worldbook_read 什麼都不填，可以列出所有的書。';
        const es = await _entriesOf(hit);
        if (!es.length) return '「' + hit + '」是空的，還沒有條目。';
        return ['「' + _bookLabel(hit, bs) + '」有 ' + es.length + ' 條' + (es.length > 80 ? '，列前 80 條' : '') + '：']
            .concat(es.slice(0, 80).map(function (e) {
                return '・' + (e.comment || '（沒有標題）') + (e.keys.length ? '｜關鍵字：' + _cut(e.keys.join(','), 40) : '｜常駐') + (e.enabled ? '' : '｜現在關著');
            })).join('\n');
    }
    async function readEntry(args) {
        const title = _one(args && args.title), book = _one(args && args.book);
        if (!title) return book ? _listEntries(book) : _listBooks();
        const f = await _find(title, book);
        if (!f.exact.length) return _missText(title, f, book);
        if (f.exact.length > 1) return _manyText(title, f);
        const h = f.exact[0], e = h.e;
        const body = e.content.length > READ_MAX
            ? e.content.slice(0, READ_MAX) + '\n…（後面還有 ' + (e.content.length - READ_MAX) + ' 字沒列出來。這條太長，只能用 find 和 replace 改上面看得到的部分）'
            : e.content;
        return '【' + e.comment + '】\n'
            + '書：' + h.book + (f.open.indexOf(h.book) === -1 ? '（這個故事沒開這本）' : '') + _gateNote(h.book) + '\n'
            + '關鍵字：' + _keysText(e.keys) + '\n'
            + (e.enabled ? '現在開著' : '現在是關著的（不會送出）') + '\n'
            + '內容：\n' + (body || '（空的）');
    }

    // ── 提案：先檢查，過了才做成單子 ─────────────────────────────────
    function _no(text) { return { ok: false, text: text }; }
    function _has(args, k) { return args[k] !== undefined && args[k] !== null; }
    async function _proposeAdd(args) {
        const title = _one(args.title);
        const content = String(args.content == null ? '' : args.content).trim();
        if (!title) return _no('要給新條目的標題（title）。');
        if (!content) return _no('要給新條目的內容（content）。');
        if (content.length > CONTENT_MAX) return _no('內容太長了（最多 ' + CONTENT_MAX + ' 字），拆成幾條。');
        const bs = await _books();
        const usable = bs.names.filter(function (n) { return !_locked(n) && !_contentOnly(n); });
        const some = function () { return usable.length ? '可以放的書：' + usable.slice(0, 15).join('、') + (usable.length > 15 ? '…（還有 ' + (usable.length - 15) + ' 本）' : '') : ''; };
        let book = _one(args.book);
        if (book) {
            const hit = bs.names.find(function (n) { return n === book; }) || bs.names.find(function (n) { return _fold(n) === _fold(book); });
            if (!hit) return _no('沒有叫「' + book + '」的書。' + some());
            book = hit;
        } else {
            // 沒寫書：放在這個故事開著的第一本能改的；沒打開故事（或開著的都是世界門的）就要它寫清楚
            book = bs.open.filter(function (n) { return !_locked(n) && !_contentOnly(n); })[0] || '';
            if (!book) return _no(bs.names.length ? '現在沒有打開的故事可以放，要用 book 寫放在哪本書。' + some() : '還沒有任何世界書，沒地方放。');
        }
        if (_locked(book)) return _no('「' + book + '」是世界門管的書，不能從這裡改。' + some());
        if (_contentOnly(book)) return _no('「' + book + '」只能改已經有的條目內容，不能加新的。' + some());
        const same = (await _entriesOf(book)).find(function (e) { return _fold(_one(e.comment)) === _fold(title); });
        if (same) return _no('「' + book + '」已經有一條叫「' + title + '」的了，要改那一條用 aurelia_worldbook_edit。');
        return { ok: true, prop: {
            id: _newId(), kind: 'add', book: book, title: title,
            before: null, after: { comment: title, keys: _keysArr(args.keys), content: content, enabled: true },
            state: 'wait', at: Date.now()
        } };
    }
    async function _proposeEdit(args) {
        const title = _one(args.title), bookAsked = _one(args.book);
        if (!title) return _no('要給要改的那一條現在的標題（title）。');
        const f = await _find(title, bookAsked);
        if (!f.exact.length) return _no(_missText(title, f, bookAsked));
        if (f.exact.length > 1) return _no(_manyText(title, f));
        const h = f.exact[0], cur = h.e;
        if (_locked(h.book)) return _no('「' + h.book + '」是世界門管的書，不能從這裡改。');
        const after = _snap(cur);
        if (_has(args, 'find') && _has(args, 'content')) return _no('find（換掉一段）和 content（整條重寫）只能用一個。');
        if (_has(args, 'find')) {
            const find = String(args.find);
            if (!find.trim()) return _no('find 是空的：要寫出要換掉的那一段。');
            if (!_has(args, 'replace')) return _no('寫了 find 就要寫 replace（要刪掉那段就寫空字串 ""）。');
            const pos = _locate(cur.content, find);
            if (!pos.count) return _no('「' + cur.comment + '」的內容裡找不到「' + _cut(find, 60) + '」。先用 aurelia_worldbook_read 看全文，find 要一字不差照抄。');
            if (pos.count > 1) return _no('要換的那段在內容裡出現了 ' + pos.count + ' 次，find 多抄一點前後文，讓它只出現一次。');
            after.content = cur.content.slice(0, pos.at) + String(args.replace) + cur.content.slice(pos.at + find.length);
        } else if (_has(args, 'content')) {
            if (cur.content.length > READ_MAX) return _no('這條內容很長（' + cur.content.length + ' 字），不能整條重寫，用 find 和 replace 改其中一段。');
            after.content = String(args.content).trim();
            if (!after.content) return _no('content 不能是空的；要拿掉這一條就用 enabled: false 關掉。');
        }
        if (_has(args, 'new_title')) { const nt = _one(args.new_title); if (nt) after.comment = nt; }
        if (_has(args, 'keys')) after.keys = _keysArr(args.keys);
        if (_has(args, 'enabled')) {
            const b = _bool(args.enabled);
            if (b === undefined) return _no('enabled 只能是 true（打開）或 false（關掉）。');
            after.enabled = b;
        }
        if (_contentOnly(h.book) && !_onlyContent(cur, after)) {
            return _no('「' + h.book + '」只能改條目內容（find 和 replace，或 content）；標題、關鍵字、開關由世界門管，不能從這裡改。');
        }
        if (after.content.length > CONTENT_MAX) return _no('改完太長了（最多 ' + CONTENT_MAX + ' 字）。');
        if (_same(cur, after)) return _no('跟現在一模一樣，沒有要改的地方。');
        return { ok: true, prop: {
            id: _newId(), kind: 'edit', book: h.book, title: cur.comment, uid: cur.uid,
            before: _snap(cur), after: after,
            state: 'wait', at: Date.now()
        } };
    }
    async function propose(name, args) {
        const A = _api();
        if (!A || !A.getLorebookEntries || !A.createLorebookEntries || !A.setLorebookEntries) {
            return _no(_pwa() ? '手機的世界書還沒載好，現在改不了。' : '酒館助手沒開，現在改不了世界書。');
        }
        args = args || {};
        if (name === 'aurelia_worldbook_add') return _proposeAdd(args);
        if (name === 'aurelia_worldbook_edit') return _proposeEdit(args);
        return _no('沒有叫做「' + name + '」的工具');
    }

    // ── 她按同意／改回去 ───────────────────────────────────────────
    // 條目現在在哪（快照要一模一樣才算）。酒館的 uid 固定；手機的 uid 只在這頁開著期間有效，對不上就照內容找
    async function _current(prop, snap) {
        const es = await _entriesOf(prop.book);
        const byUid = es.find(function (e) { return prop.uid != null && e.uid === prop.uid && _same(e, snap); });
        if (byUid) return byUid;
        const hits = es.filter(function (e) { return _same(e, snap); });
        return hits.length === 1 ? hits[0] : null;
    }
    // 只送有變的欄位；關鍵字有變就一起給類型（沒有關鍵字＝常駐）
    function _patch(to, from) {
        const p = {};
        if (to.comment !== from.comment) p.comment = to.comment;
        if (to.content !== from.content) p.content = to.content;
        if (to.enabled !== from.enabled) p.enabled = to.enabled;
        if (_keysArr(to.keys).join(',') !== _keysArr(from.keys).join(',')) { p.keys = to.keys.slice(); p.type = to.keys.length ? 'selective' : 'constant'; }
        return p;
    }
    function _stale(prop, why) { prop.state = 'stale'; prop.why = why; return { ok: false, text: why }; }
    // 同意／改回去成功了就記進修改紀錄（下面「修改紀錄」那段）；改預設的單子也從這裡過
    async function apply(prop) {
        const r = await _apply(prop);
        if (r && r.ok) _logPut(prop);
        return r;
    }
    async function undo(prop) {
        const r = await _undo(prop);
        if (r && r.ok) _logPut(prop);
        return r;
    }
    async function _apply(prop) {
        const M = _other(prop);
        if (M !== undefined) return M ? M.apply(prop) : { ok: false, text: '這張單子的功能還沒載好' };
        if (!prop || (prop.state !== 'wait' && prop.state !== 'no')) return { ok: false, text: '這張已經處理過了' };
        const A = _api();
        if (!A || !A.createLorebookEntries || !A.setLorebookEntries) return { ok: false, text: _pwa() ? '手機的世界書還沒載好' : '酒館助手沒開，改不了世界書' };
        if (_locked(prop.book)) return _stale(prop, '「' + prop.book + '」是世界門管的書，不能從這裡改');
        if (_contentOnly(prop.book) && (prop.kind !== 'edit' || !_onlyContent(prop.before, prop.after))) return _stale(prop, '「' + prop.book + '」只能改條目內容');
        try {
            if (prop.kind === 'add') {
                const dup = (await _entriesOf(prop.book)).find(function (e) { return _fold(_one(e.comment)) === _fold(prop.after.comment); });
                if (dup) return _stale(prop, '這本書在那之後已經有一條同名的了，沒有再加');
                const a = prop.after;
                await A.createLorebookEntries(prop.book, [{ comment: a.comment, keys: a.keys.slice(), content: a.content, enabled: true, type: a.keys.length ? 'selective' : 'constant' }]);
            } else {
                const cur = await _current(prop, prop.before);
                if (!cur) return _stale(prop, '這一條在提出之後被改過了，這張作廢，沒有蓋掉');
                await A.setLorebookEntries(prop.book, [Object.assign({ uid: cur.uid }, _patch(prop.after, cur))]);
            }
        } catch (e) { return { ok: false, text: '寫不進去：' + ((e && e.message) || '不知道為什麼') }; }
        prop.state = 'done'; prop.doneAt = Date.now();
        return { ok: true };
    }
    async function _undo(prop) {
        const M = _other(prop);
        if (M !== undefined) return M ? M.undo(prop) : { ok: false, text: '這張單子的功能還沒載好' };
        if (!prop || prop.state !== 'done') return { ok: false, text: '這張沒有寫進去過' };
        const A = _api();
        if (!A || !A.setLorebookEntries || !A.deleteLorebookEntries) return { ok: false, text: _pwa() ? '手機的世界書還沒載好' : '酒館助手沒開，改不了世界書' };
        try {
            const cur = await _current(prop, prop.after);
            if (!cur) return { ok: false, text: '這一條在那之後又被改過了，改不回去（怕蓋掉後來的修改）' };
            if (prop.kind === 'add') await A.deleteLorebookEntries(prop.book, [cur.uid]);
            else await A.setLorebookEntries(prop.book, [Object.assign({ uid: cur.uid }, _patch(prop.before, cur))]);
        } catch (e) { return { ok: false, text: '改不回去：' + ((e && e.message) || '不知道為什麼') }; }
        prop.state = 'undone'; prop.undoneAt = Date.now();
        return { ok: true };
    }

    // ── 那一行怎麼寫：給她看的（forModel false）與給模型看的（聊天記錄裡的旁註）─────────
    function _verb(prop) {
        const M = _other(prop);
        if (M) return M.verb(prop);
        if (prop.kind === 'add') return '新增';
        const b = prop.before || {}, a = prop.after || {};
        const onlySwitch = b.enabled !== a.enabled && b.comment === a.comment && b.content === a.content && _keysArr(b.keys).join(',') === _keysArr(a.keys).join(',');
        return onlySwitch ? (a.enabled ? '打開' : '關掉') : '修改';
    }
    function text(prop, forModel) {
        if (!prop) return '';
        const M = _other(prop);
        if (M) return M.text(prop, forModel);
        const who = prop.by || '對方', v = _verb(prop), what = '世界書「' + prop.title + '」';
        if (forModel) {
            if (prop.state === 'done') return who + ' ' + v + '了' + what + '，對方同意了，已經寫進去';
            if (prop.state === 'no') return who + ' 提出要' + v + what + '，對方沒有同意，沒有改';
            if (prop.state === 'undone') return who + ' ' + v + '了' + what + '，後來對方改回去了';
            if (prop.state === 'stale') return who + ' 提出要' + v + what + '，但那一條後來被改過，沒有寫進去';
            return who + ' 提出要' + v + what + '，還在等對方決定';
        }
        // 狀態（點開看／沒同意／寫進去了…）聊天 app 畫在右邊的小標（WX_TOOLS.propChip），這裡只寫是哪一件
        if (prop.state === 'done' || prop.state === 'undone') return who + ' ' + v + '了' + what;
        return who + ' 想' + v + what;
    }

    // ── 修改紀錄 ────────────────────────────────────────────────────────
    //   09-30 她：「改這些預設/世界書，可以做成紀錄，並標示有誰誰改過，這樣小機們能知道之前有什麼調整?」
    //   單子寫進去、或改回去的時候記一筆（同一張單子同一筆，改回去補上時間）；沒同意的、作廢的沒改到東西，不記。
    //   她自己動手改的不經單子，不在這裡。存這一邊的 localStorage：酒館與手機的世界書、預設本來就分開，紀錄跟著分開。
    const LOG_KEY = 'aurelia_change_log', LOG_MAX = 200;
    function _logLoad() { try { const a = JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
    function _logSave(a) { try { localStorage.setItem(LOG_KEY, JSON.stringify(a.slice(0, LOG_MAX))); } catch (e) {} }
    // 兩段文字只留改掉的那段（前後各帶幾個字），太長截斷
    function _diffMid(a, b) {
        a = String(a || ''); b = String(b || '');
        let i = 0, j = 0;
        while (i < a.length && i < b.length && a[i] === b[i]) i++;
        while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
        const PAD = 12, s = Math.max(0, i - PAD);
        const cut = function (t, end) { return _cut(_one(t.slice(s, Math.min(t.length, end + PAD))), 160); };
        return [(s > 0 ? '…' : '') + cut(a, a.length - j), (s > 0 ? '…' : '') + cut(b, b.length - j)];
    }
    function _detail(prop) {
        const M = _other(prop);
        if (M && M.detail) return M.detail(prop);   // 欄位不一樣的（VN 組件）自己寫
        const b = prop.before || {}, a = prop.after || {}, out = [];
        const nm = prop.mod === 'preset' ? 'name' : 'comment', nmLab = prop.mod === 'preset' ? '名字' : '標題';
        if (prop.kind === 'add') {
            if (prop.mod !== 'preset') out.push('關鍵字：' + _keysText(_keysArr(a.keys)));
            out.push('內容：「' + _cut(_one(a.content), 160) + '」');
            return out;
        }
        if (b[nm] !== a[nm]) out.push(nmLab + '：「' + b[nm] + '」改成「' + a[nm] + '」');
        if (prop.mod !== 'preset' && _keysArr(b.keys).join(',') !== _keysArr(a.keys).join(',')) out.push('關鍵字：' + _keysText(_keysArr(b.keys)) + ' 改成 ' + _keysText(_keysArr(a.keys)));
        if (b.enabled !== a.enabled) out.push(a.enabled ? '打開了' : '關掉了');
        if (b.content !== a.content) { const d = _diffMid(b.content, a.content); out.push('內容：原本「' + d[0] + '」改成「' + d[1] + '」'); }
        return out;
    }
    function _logPut(prop) {
        const arr = _logLoad();
        let rec = arr.find(function (x) { return x && x.id === prop.id; });
        if (!rec) {
            rec = { id: prop.id, by: prop.by || '', from: prop.from || '', book: prop.book || '', title: prop.title || '' };
            arr.unshift(rec);
        }
        if (prop.state === 'done') {
            rec.line = text(prop, false); rec.detail = _detail(prop);
            rec.doneAt = prop.doneAt || Date.now(); delete rec.undoneAt;
        } else if (prop.state === 'undone') {
            if (!rec.line) { rec.line = text(Object.assign({}, prop, { state: 'done' }), false); rec.detail = _detail(prop); }
            rec.undoneAt = prop.undoneAt || Date.now();
        }
        _logSave(arr);
    }
    function _when(t) {
        const d = new Date(t), p = function (n) { return (n < 10 ? '0' : '') + n; };
        return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }
    function readLog(args) {
        const n = Math.max(1, Math.min(40, Number(args.count) || 15));
        const q = _fold(_one(args.about));
        let arr = _logLoad().filter(function (x) { return x && x.line; });
        if (q) arr = arr.filter(function (x) { return _fold([x.line, x.book, x.title].join(' ')).indexOf(q) !== -1; });
        if (!arr.length) {
            return q ? '修改紀錄裡沒有跟「' + _one(args.about) + '」有關的。'
                : '還沒有修改紀錄。這裡只記經過單子、對方按同意寫進去的修改；對方自己動手改的不在這裡。';
        }
        return '以前經單子改過的（新的在前，只記對方按同意寫進去的；對方自己動手改的不在這裡）：\n' + arr.slice(0, n).map(function (x) {
            const head = '・' + _when(x.doneAt) + ' ' + x.line + (x.from ? '（在' + x.from + '提的）' : '') + '，對方同意寫進去了'
                + (x.undoneAt ? '；' + _when(x.undoneAt) + ' 對方改回去了' : '');
            return head + ((x.detail && x.detail.length) ? '\n  ' + x.detail.join('\n  ') : '');
        }).join('\n') + (arr.length > n ? '\n（還有更早的 ' + (arr.length - n) + ' 筆，count 填大一點可以看更多）' : '');
    }
    const LOG_TOOL = { name: 'aurelia_change_log', label: '看修改紀錄', run: readLog,
        description: '看以前經單子改過的世界書和預設：誰提的、改了哪一條、改了哪一段、什麼時候、後來有沒有被對方改回去。只記對方按同意寫進去的，對方自己動手改的、沒同意的不在這裡。改一條之前可以先看以前怎麼改過。',
        inputSchema: { type: 'object', properties: {
            about: { type: 'string', description: '只看跟這個有關的：條目標題、書名、預設名字裡有這幾個字（不填就是全部）' },
            count: { type: 'number', description: '看最近幾筆（不填 15，最多 40）' } } } };

    // ── 給模型看的清單 ────────────────────────────────────────────────
    //   說明寫給沒看過奧瑞亞的模型。查世界書（aurelia_worldbook_search）跟「翻奧瑞亞的資料」是同一個功能，
    //   這組也帶著它（說明另寫一份，不提這組沒有的 aurelia_people），只勾這組也找得到條目；兩組都勾時聊天 app 只列一次。
    //   冷讀（09-30）抓到的：「結果下一輪給你」只適用查和看，要講明 add／edit 是例外；edit 不能跟 read 寫在同一輪
    //   （它不會等 read 的結果）；「送」要講是故事生成時帶上，不然模型以為是送給它。
    //   範圍是所有的書（09-30 定案：跟創作室世界書設計師一樣，視差的 VN 哪張卡都能用，不綁這個故事）。
    const NOTE = 'aurelia_worldbook_ 開頭的四個工具（search、read、add、edit）是看和改對方的世界書（故事生成時會帶上的設定資料）。'
        + '找得到對方所有的世界書，不只這個故事的；對方現在這個故事開著的書排前面，結果會標出哪些書這個故事沒開。'
        + 'search 和 read 跟前面說的一樣，結果下一輪交給你。'
        + 'add 和 edit 不一樣：不會直接改，只會在對方的畫面上出一張單子（寫著改前改後），對方按同意才寫進去；你不會拿到結果，寫完這一輪就結束。'
        + '所以用 add 或 edit 的那一則，要在工具那一行之前用你自己的話跟對方說你想怎麼改，不要說已經改好了；對方同意或沒同意，之後聊天記錄裡會有一行寫出來。'
        + '改一條之前要先用 read 看過全文，看到了再在下一輪寫 edit，不要跟 search、read 寫在同一輪。條目不能刪，要拿掉就用 enabled: false 關掉。';
    const SEARCH_DESC = '在所有的世界書裡用關鍵字找條目，看得到標題、在哪本書、內容的開頭、現在有沒有開著。要看或改某一條之前，先用這個找到它的標題。';
    const OWN = [
        { name: 'aurelia_worldbook_read', label: '看世界書條目', run: readEntry,
          description: '看世界書。什麼都不填：列出所有的書；只填 book：列出那本書有哪些條目；填 title：看那一條的全文、關鍵字、現在有沒有開著。改一條之前先用這個看全文，標題照找到的寫。',
          inputSchema: { type: 'object', properties: {
              title: { type: 'string', description: '條目的標題' },
              book: { type: 'string', description: '書名；列某本書的條目、或好幾本書都有同名的條目時才要填' } } } },
        { name: 'aurelia_worldbook_add', label: '新增世界書條目', propose: true,
          description: '提出在世界書新增一條（對方按同意才會加）。同一本書已經有同名的，改用 aurelia_worldbook_edit。',
          inputSchema: { type: 'object', properties: {
              title: { type: 'string', description: '新條目的標題' },
              content: { type: 'string', description: '條目內容：寫設定本身，不要寫給對方的話' },
              keys: { type: 'string', description: '觸發的關鍵字，逗號隔開：故事裡出現其中任何一個詞時才會帶上這一條。不填＝常駐，每一輪都帶、很佔篇幅，所以幾乎都要填' },
              book: { type: 'string', description: '要放在哪本書；不填就放在對方現在這個故事開著的第一本（沒打開故事時一定要填）' } }, required: ['title', 'content'] } },
        { name: 'aurelia_worldbook_edit', label: '改世界書條目', propose: true,
          description: '提出修改世界書裡已經有的一條（對方按同意才會改）。只改一段用 find 和 replace；整條重寫用 content；也可以只改標題、關鍵字，或用 enabled 關掉、打開這一條。',
          inputSchema: { type: 'object', properties: {
              title: { type: 'string', description: '要改的那一條現在的標題' },
              find: { type: 'string', description: '要換掉的那一段，照全文一字不差抄，要在內容裡只出現一次' },
              replace: { type: 'string', description: '換成什麼（跟 find 一起用；要刪掉那段就寫空字串）' },
              content: { type: 'string', description: '整條的新內容（整條重寫才用，不能跟 find 一起用）' },
              new_title: { type: 'string', description: '新的標題（要改標題才填）' },
              keys: { type: 'string', description: '新的關鍵字，逗號隔開（要改才填，會整組換掉）' },
              enabled: { type: 'boolean', description: 'true 打開、false 關掉（關掉＝不會再送出，但沒有刪掉）' },
              book: { type: 'string', description: '書名；只有好幾本書都有同名的條目時才要填' } }, required: ['title'] } },
        LOG_TOOL,
    ];
    let _search = null;
    function _searchTool() {
        if (_search) return _search;
        const T = _T();
        const s = ((T && T.tools) || []).find(function (t) { return t.name === 'aurelia_worldbook_search'; });
        if (s) _search = Object.assign({}, s, { description: SEARCH_DESC });
        return _search;
    }
    const _pub = OWN.map(function (t) { return { name: t.name, label: t.label, description: t.description, inputSchema: t.inputSchema, propose: !!t.propose }; });

    async function run(name, args) {
        if (name === 'aurelia_worldbook_search') {
            const T = _T();
            if (!T) throw new Error('奧瑞亞的資料還沒載好');
            return T.run(name, args || {}, { wbAll: true });
        }
        const t = OWN.find(function (x) { return x.name === name; });
        if (!t || !t.run) throw new Error('沒有叫做「' + name + '」的工具');
        const out = await t.run(args || {});
        return String(out == null ? '' : out).trim() || '什麼都沒有查到。';
    }

    // 單子小窗要的：標題（動詞後面接的）、按鈕與提示裡的名詞、每一格畫什麼（cards 為 null＝世界書，小窗自己照改前改後畫）
    function sheet(prop) {
        const M = _other(prop);
        if (M) return { what: M.what(prop), noun: M.noun(prop), cards: M.cards(prop) };
        return { what: '世界書條目', noun: '世界書', cards: null };
    }

    const API = {
        note: NOTE,
        get tools() { const s = _searchTool(); return (s ? [s] : []).concat(_pub); },
        run: run, propose: propose, apply: apply, undo: undo, text: text,
        verb: _verb, keysText: _keysText, sheet: sheet,
        // 單子小窗畫完之後放預覽（格子帶 preview 的，目前只有 VN 組件）
        // 回傳收尾的那支（有的預覽會先套上去，單子關掉時要換回來：聊天 app 主題的「先套上看看」）
        mountPreview: function (prop, which, el) { const M = _other(prop); return (M && M.mountPreview) ? M.mountPreview(prop, which, el) : null; },
        // 這張是不是已經有新的一版（VN 組件的草稿：她還沒按同意時小機又改了一次）
        superseded: function (prop) { const M = _other(prop); return !!(M && M.superseded && M.superseded(prop)); },
        // 修改紀錄：改預設那組也帶著「看修改紀錄」（聊天 app 兩組都勾只列一次）
        logTool: { name: LOG_TOOL.name, label: LOG_TOOL.label, description: LOG_TOOL.description, inputSchema: LOG_TOOL.inputSchema },
        readLog: function (args) { return readLog(args || {}); },
    };
    win.OS_AURELIA_EDIT = API;
    window.OS_AURELIA_EDIT = API;
})();
