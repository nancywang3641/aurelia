// ----------------------------------------------------------------
// [檔案] os_aurelia_vn.js — 「改 VN 組件」：角色／住戶提出新增或修改，單子附預覽，她按同意才寫
// 路徑：os_phone/os/os_aurelia_vn.js
//
// 小機工具「會動手」的第三件（前兩件：改世界書 os_aurelia_edit.js、改預設 os_aurelia_preset.js）。
// 09-30 她：「預覽是不是搞成兩層結構，一樣是單子，但有附預覽?」→ 單子小窗裡直接畫改前、改後兩張預覽（不摺疊）。
//   ・範圍：創作室「純展示」那一型（嵌進劇情正文、故事裡跳出來的面板）。裝成手機應用的（純應用、共用）與主畫面組件
//     存了還要裝機、改了要重裝，這裡只給看，改要在創作室。
//   ・寫法說明書跟創作室同一份（OS_STUDIO.vnSpec 從 MODES.vn_ui.prompt 切），不另寫一套。
//   ・提出前跑創作室的自檢（OS_STUDIO_CHECK.staticIssues／cssIssues）：新增的有問題直接退回；
//     修改只擋這次新冒出來的問題（舊組件本來就有的不算，不然連關掉都關不了）。
//   ・同意＝跟創作室存檔同一串：OS_DB.saveVNTagTemplate → syncActiveTagsToLocal（寫故事的模型才知道有這個標籤）
//     → VN_DynamicParser.init（畫面才認得）→ 酒館正則匯入過的照新內容重寫（OS_STUDIO.refreshTavernRegex）。
//     修改前那份推進組件自己的 history（創作室的「歷史」看得到、可以退回）。
//   ・改回去：新增的整個拿掉（OS_STUDIO.purgeTemplateFully），修改的換回改前那份；提出後被改過＝作廢，不蓋掉。
// 暴露：window.OS_AURELIA_VN = { note, tools, run, propose, apply, undo, verb, text, what, noun, cards, detail, mountPreview }
//   單子 prop.mod === 'vn'，OS_AURELIA_EDIT 看到就轉過來（同意、改回去、那一行的字、小窗的格子、修改紀錄）。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const PART = 2600;          // 看全文、說明書一段最多幾個字（聊天 app 一次結果上限 3000）
    const TEXT_MAX = 40000;     // 一個欄位最多幾個字
    // 參數名 → 組件欄位
    const ARG = { html: 'html', css: 'css', js: 'js', demo_format: 'demoFormat', usage_desc: 'usageDesc' };
    const LAB = { html: '畫面（html）', css: '樣式（css）', js: '程式（js）', demoFormat: '正文裡的寫法（demoFormat）', usageDesc: '給寫故事的模型的說明（usageDesc）' };
    const LOOK = ['html', 'css', 'js', 'demoFormat'];   // 這幾個改了才要畫預覽

    function _S() { return win.OS_STUDIO || null; }
    function _D() { return win.OS_DB || null; }
    function _no(t) { return { ok: false, text: t }; }
    function _one(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
    function _cut(s, n) { s = _one(s); return s.length > n ? s.slice(0, n) + '…' : s; }
    function _newId() { return 'pv' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
    function _safeTag(t) { return String(t || '').replace(/[^a-zA-Z0-9_-]/g, ''); }
    function _keys(k) { return (Array.isArray(k) ? k : String(k == null ? '' : k).split(/[,，、]/)).map(function (x) { return String(x).trim(); }).filter(Boolean).slice(0, 8); }
    function _bool(v) {
        if (typeof v === 'boolean') return v;
        const s = String(v == null ? '' : v).trim().toLowerCase();
        if (/^(true|1|on|yes|開|打開|启用|啟用)$/.test(s)) return true;
        if (/^(false|0|off|no|關|關掉|停用)$/.test(s)) return false;
        return undefined;
    }
    function _type(t) { return (t && t.panelType) || '純展示'; }   // 分型以前做的舊組件沒有 panelType，都是故事裡的面板
    function _snap(t) {
        return { tagId: String(t.tagId || ''), title: String(t.title || ''), isBlock: !!t.isBlock,
            html: String(t.html || ''), css: String(t.css || ''), js: String(t.js || ''),
            demoFormat: String(t.demoFormat || ''), usageDesc: String(t.usageDesc || ''),
            keywords: _keys(t.keywords), isActive: t.isActive !== false };
    }
    function _same(a, b) { return JSON.stringify(_snap(a)) === JSON.stringify(_snap(b)); }
    function _caps(js) {
        js = String(js || '');
        const gen = /st\.callAI\s*\(|st\.setImage\s*\(/.test(js), show = /\blines\b/.test(js) || /container/.test(js);
        return (gen && show) ? 'both' : (gen ? 'gen' : 'display');
    }
    async function _all() {
        const D = _D();
        if (!D || !D.getAllVNTagTemplates) return [];
        try { return (await D.getAllVNTagTemplates()) || []; } catch (e) { return []; }
    }
    // 用標籤（tagId）或名字找；同一個標籤有好幾份（創作室複製出來的關著的那種）→ 開著的優先
    async function _find(key) {
        const k = _one(key).toLowerCase();
        if (!k) return { err: '要寫是哪一個組件（標籤或名字）。' };
        const all = await _all();
        let hit = all.filter(function (t) { return String(t.tagId || '').toLowerCase() === k; });
        if (!hit.length) hit = all.filter(function (t) { return _one(t.title).toLowerCase() === k; });
        if (!hit.length) {
            const near = all.filter(function (t) { return (String(t.tagId || '') + ' ' + (t.title || '')).toLowerCase().indexOf(k) !== -1; }).slice(0, 5);
            return { err: '找不到「' + _one(key) + '」這個組件。' + (near.length ? '像的有：' + near.map(function (t) { return t.tagId + (t.title ? '（' + t.title + '）' : ''); }).join('、') : '先用 aurelia_vn_list 看有哪些。') };
        }
        const on = hit.filter(function (t) { return t.isActive !== false; });
        if (on.length > 1 || (!on.length && hit.length > 1)) return { err: '「' + _one(key) + '」有好幾個同名的，請對方在創作室整理掉重複的再改。' };
        return { t: on[0] || hit[0] };
    }
    function _issues(data) {
        const CK = win.OS_STUDIO_CHECK;
        if (!CK || !CK.staticIssues) return [];
        try { return CK.staticIssues(data, '純展示').map(function (x) { return x.msg; }); } catch (e) { return []; }
    }

    // ── 草稿：還沒按同意的那張單子（09-30 她：「像創建室那樣反覆改動後，再傳進去?」）──────────
    //   同一個標籤最新那張單子記在這裡（這一邊的 localStorage）。她還沒按同意時小機再改，就接著這份改、出一張新的，
    //   舊的那張作廢（按同意時比對：不是最新那張就擋下）；read 看到的也是這份。按同意寫進去了就清掉。
    const DRAFT_KEY = 'aurelia_vn_drafts', DRAFT_DAYS = 14;
    function _drafts() {
        let o = {};
        try { o = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}') || {}; } catch (e) {}
        const old = Date.now() - DRAFT_DAYS * 86400000;
        Object.keys(o).forEach(function (k) { if (!o[k] || o[k].at < old) delete o[k]; });
        return o;
    }
    function _draftsSave(o) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(o)); } catch (e) {} }
    function _draftFor(key) {
        const k = _one(key).toLowerCase(), o = _drafts();
        if (!k) return null;
        if (o[k]) return o[k];
        return Object.keys(o).map(function (x) { return o[x]; }).find(function (d) { return _one(d.after && d.after.title).toLowerCase() === k; }) || null;
    }
    function _draftPut(prop) {
        const o = _drafts();
        o[prop.title.toLowerCase()] = { id: prop.id, kind: prop.kind, tag: prop.title, tplId: prop.tplId || null, before: prop.before, after: prop.after, at: Date.now() };
        _draftsSave(o);
    }
    function _draftDrop(tag) { const o = _drafts(); delete o[String(tag || '').toLowerCase()]; _draftsSave(o); }
    // 這張是不是已經有新的一版（還在等她的才算）
    function superseded(prop) {
        if (!prop || (prop.state !== 'wait' && prop.state !== 'no')) return false;
        const d = _drafts()[String(prop.title || '').toLowerCase()];
        return !!(d && d.id !== prop.id);
    }

    // ── 看的 ─────────────────────────────────────────────────────────────
    async function list() {
        const all = await _all(), o = _drafts();
        const saved = {};
        all.forEach(function (t) { saved[String(t.tagId || '').toLowerCase()] = 1; });
        const drafts = Object.keys(o).filter(function (k) { return !saved[k]; }).map(function (k) {
            return '・' + o[k].tag + '「' + ((o[k].after && o[k].after.title) || '') + '」｜草稿：單子還沒被同意，還沒寫進去';
        });
        if (!all.length && !drafts.length) return '對方還沒有任何 VN 組件。';
        return '對方的 VN 組件（標籤｜名字｜哪一型｜開著沒）：\n' + drafts.concat(all.map(function (t) {
            const ty = _type(t), can = ty === '純展示';
            return '・' + t.tagId + '「' + (t.title || '') + '」｜' + ty + '｜' + (t.isActive !== false ? '開著' : '關著') + (can ? '' : '｜這種只能看，要在創作室改')
                + (t.usageDesc ? '\n  用途：' + _cut(t.usageDesc, 90) : '')
                + (t.demoFormat ? '\n  正文裡的寫法：' + _cut(String(t.demoFormat).split('\n')[0], 90) : '')
                + (o[String(t.tagId || '').toLowerCase()] ? '\n  （有一張改它的單子還沒被同意，read 看到的是那份）' : '');
        })).join('\n');
    }
    function _paged(text, part, what) {
        const n = Math.max(1, Math.ceil(text.length / PART));
        const p = Math.min(n, Math.max(1, Math.floor(Number(part) || 1)));
        const body = text.slice((p - 1) * PART, p * PART);
        return (n > 1 ? what + '（第 ' + p + '／' + n + ' 段' + (p < n ? '，part 填 ' + (p + 1) + ' 看下一段' : '，這是最後一段') + '）\n' : '') + body;
    }
    async function read(args) {
        const d = _draftFor(args.tag);
        let s, ty, note = '';
        if (d) {
            s = d.after; ty = '純展示';
            note = '這是你上一張單子的內容，對方還沒按同意、還沒寫進去' + (d.kind === 'edit' ? '（已經存著的那份是改之前的樣子）' : '') + '；要再改就對它用 aurelia_vn_edit。\n';
        } else {
            const f = await _find(args.tag);
            if (f.err) return f.err;
            s = _snap(f.t); ty = _type(f.t);
        }
        const head = note + '組件 ' + s.tagId + '「' + s.title + '」｜' + ty + '｜' + (s.isActive ? '開著' : '關著') + '｜'
            + (s.isBlock ? '區塊（正文裡照 demoFormat 寫一段，js 拿到每一行）' : '單行標籤') + (s.keywords.length ? '｜觸發詞：' + s.keywords.join('、') : '');
        const body = ['usageDesc', 'demoFormat', 'html', 'css', 'js'].map(function (k) { return '【' + LAB[k] + '】\n' + (s[k] || '（空的）'); }).join('\n\n');
        return _paged(head + '\n\n' + body, args.part, '組件 ' + s.tagId + ' 的全文');
    }
    function spec(args) {
        const S = _S();
        const txt = (S && S.vnSpec) ? S.vnSpec('純展示') : '';
        if (!txt) return '創作室還沒載好，現在看不到寫法。';
        const pre = '下面是對方的創作室給模型的 VN 組件說明書（故事裡跳出來的那一型）。說明書裡講的「輸出 <json>」你不用管：'
            + '新增用 aurelia_vn_add 交，tag＝tagId、demo_format＝demoFormat、usage_desc＝usageDesc、is_block＝isBlock，其他照同名參數。\n\n';
        return _paged(pre + txt, args.part, 'VN 組件的寫法');
    }

    // ── 提出（做成單子）──────────────────────────────────────────────────
    async function _proposeAdd(args) {
        const tag = _one(args.tag);
        if (!tag) return _no('要寫 tag（標籤，英數字）。');
        if (_safeTag(tag) !== tag) return _no('tag 只能用英文字母、數字、底線、連字號。');
        if ((await _all()).some(function (t) { return String(t.tagId || '').toLowerCase() === tag.toLowerCase(); })) {
            return _no('已經有標籤是「' + tag + '」的組件了，要改它用 aurelia_vn_edit，要做新的換一個標籤。');
        }
        const demo = String(args.demo_format || '');
        const data = { tagId: tag, title: _one(args.title) || tag, html: String(args.html || ''), css: String(args.css || ''), js: String(args.js || ''),
            demoFormat: demo, usageDesc: String(args.usage_desc || ''), keywords: _keys(args.keywords),
            isBlock: _bool(args.is_block) !== undefined ? _bool(args.is_block) : !!demo.trim(), isActive: true };
        if (!data.usageDesc.trim()) return _no('要寫 usage_desc：給寫故事的模型的一句話說明（什麼時候用、照 demo_format 寫）。');
        if (['html', 'css', 'js', 'demoFormat', 'usageDesc'].some(function (k) { return data[k].length > TEXT_MAX; })) return _no('有一欄太長了（每欄最多 ' + TEXT_MAX + ' 字）。');
        const bad = _issues(data);
        if (bad.length) return _no('這樣做出來會出問題，改好再提：\n- ' + bad.join('\n- '));
        const prop = { id: _newId(), mod: 'vn', kind: 'add', book: 'VN 組件', title: tag, name: data.title, before: null, after: _snap(data), state: 'wait', at: Date.now() };
        _draftPut(prop);   // 同一個標籤還沒被同意的舊單子，從這張起作廢
        return { ok: true, prop: prop };
    }
    async function _proposeEdit(args) {
        // 還沒被同意的單子（草稿）→ 接著那份改；新增的草稿改完還是一張「新增」
        const d = _draftFor(args.tag);
        let kind, tplId, before, base;
        if (d) {
            kind = d.kind; tplId = d.tplId; before = d.before; base = d.after;
        } else {
            const f = await _find(args.tag);
            if (f.err) return _no(f.err);
            const t = f.t;
            if (_type(t) !== '純展示') return _no('「' + t.tagId + '」是' + _type(t) + '的組件，這裡只能看；要改請對方在創作室改（這裡只改故事裡跳出來的那種）。');
            kind = 'edit'; tplId = t.id; before = _snap(t); base = _snap(t);
        }
        const after = JSON.parse(JSON.stringify(base));
        if (args.find != null && args.find !== '') {
            const key = ARG[String(args.field || '').trim()];
            if (!key) return _no('用 find 要寫 field：html、css、js、demo_format、usage_desc 其中一個。');
            if (args[String(args.field).trim()] != null) return _no('同一個欄位不能同時用 find 和整欄重寫。');
            const find = String(args.find), n = after[key].split(find).length - 1;
            if (n === 0) return _no('「' + _cut(find, 60) + '」在 ' + args.field + ' 裡找不到，要照 aurelia_vn_read 看到的原文一字不差抄。');
            if (n > 1) return _no('「' + _cut(find, 60) + '」在 ' + args.field + ' 裡出現了 ' + n + ' 次，多抄前後幾個字，讓它只出現一次。');
            after[key] = after[key].replace(find, function () { return String(args.replace == null ? '' : args.replace); });
        }
        Object.keys(ARG).forEach(function (a) { if (args[a] != null) after[ARG[a]] = String(args[a]); });
        if (args.title != null && _one(args.title)) after.title = _one(args.title);
        if (args.keywords != null) after.keywords = _keys(args.keywords);
        if (args.enabled != null) {
            const b = _bool(args.enabled);
            if (b === undefined) return _no('enabled 只能是 true（打開）或 false（關掉）。');
            after.isActive = b;
        }
        if (['html', 'css', 'js', 'demoFormat', 'usageDesc'].some(function (k) { return after[k].length > TEXT_MAX; })) return _no('改完有一欄太長了（每欄最多 ' + TEXT_MAX + ' 字）。');
        if (JSON.stringify(base) === JSON.stringify(after)) return _no('跟現在一模一樣，沒有要改的地方。');
        if (before && JSON.stringify(before) === JSON.stringify(after)) return _no('改完跟已經存著的那份一模一樣，不用再提單子。');
        // 新增的全部要過；修改只擋這次新冒出來的問題（舊組件本來就有的不算）
        const old = before ? _issues(before) : [], bad = _issues(after).filter(function (m) { return old.indexOf(m) === -1; });
        if (bad.length) return _no('改完會出問題，改好再提：\n- ' + bad.join('\n- '));
        const prop = { id: _newId(), mod: 'vn', kind: kind, book: 'VN 組件', tplId: tplId, title: after.tagId, name: after.title || '', before: before, after: after, state: 'wait', at: Date.now() };
        _draftPut(prop);
        return { ok: true, prop: prop };
    }
    async function propose(name, args) {
        if (!_D() || !_D().saveVNTagTemplate) return _no('VN 組件的資料還沒載好，現在改不了。');
        args = args || {};
        if (name === 'aurelia_vn_add') return _proposeAdd(args);
        if (name === 'aurelia_vn_edit') return _proposeEdit(args);
        return _no('沒有叫做「' + name + '」的工具');
    }

    // ── 她按同意／改回去 ─────────────────────────────────────────────────
    async function _after() {
        const S = _S();
        try { if (S && S._b && S._b.syncActiveTagsToLocal) await S._b.syncActiveTagsToLocal(); } catch (e) {}
        try { if (win.VN_DynamicParser && win.VN_DynamicParser.init) await win.VN_DynamicParser.init(); } catch (e) {}
    }
    async function _byId(id) { return (await _all()).find(function (t) { return t.id === id; }) || null; }
    function _stale(prop, why) { prop.state = 'stale'; prop.why = why; return { ok: false, text: why }; }
    function _write(rec, s) {
        ['tagId', 'title', 'isBlock', 'html', 'css', 'js', 'demoFormat', 'usageDesc', 'isActive'].forEach(function (k) { rec[k] = s[k]; });
        rec.keywords = s.keywords.slice();
        rec.caps = _caps(s.js);
        return rec;
    }
    async function apply(prop) {
        if (!prop || (prop.state !== 'wait' && prop.state !== 'no')) return { ok: false, text: '這張已經處理過了' };
        const D = _D();
        if (!D || !D.saveVNTagTemplate) return { ok: false, text: 'VN 組件的資料還沒載好' };
        if (superseded(prop)) return { ok: false, text: '這張已經有新的一版了，看最新那張' };
        try {
            if (prop.kind === 'add') {
                if ((await _all()).some(function (t) { return String(t.tagId || '').toLowerCase() === prop.after.tagId.toLowerCase(); })) return _stale(prop, '在那之後已經有同一個標籤的組件了，沒有再加');
                const rec = _write({ id: 'tpl_' + Date.now(), panelType: '純展示' }, prop.after);
                await D.saveVNTagTemplate(rec);
                prop.tplId = rec.id;
            } else {
                const cur = await _byId(prop.tplId);
                if (!cur || !_same(cur, prop.before)) return _stale(prop, '這個組件在提出之後被改過了，這張作廢，沒有蓋掉');
                const b = prop.before;
                cur.history = (Array.isArray(cur.history) ? cur.history : []).concat([{ ts: Date.now(), html: b.html, css: b.css, js: b.js, demoFormat: b.demoFormat,
                    usageDesc: b.usageDesc, isBlock: b.isBlock, tagId: b.tagId, note: (prop.by || '小機') + ' 改之前' }]).slice(-30);
                await D.saveVNTagTemplate(_write(cur, prop.after));
            }
            await _after();
            try { const S = _S(); if (S && S.refreshTavernRegex) await S.refreshTavernRegex(prop.after); } catch (e) {}
        } catch (e) { return { ok: false, text: '寫不進去：' + ((e && e.message) || '不知道為什麼') }; }
        prop.state = 'done'; prop.doneAt = Date.now();
        _draftDrop(prop.title);
        return { ok: true };
    }
    async function undo(prop) {
        if (!prop || prop.state !== 'done') return { ok: false, text: '這張沒有寫進去過' };
        const D = _D(), S = _S();
        try {
            const cur = await _byId(prop.tplId);
            if (!cur || !_same(cur, prop.after)) return { ok: false, text: '這個組件在那之後又被改過了，改不回去（怕蓋掉後來的修改）' };
            if (prop.kind === 'add') {
                if (!S || !S.purgeTemplateFully) return { ok: false, text: '創作室還沒載好' };
                await S.purgeTemplateFully(cur.id);
            } else {
                await D.saveVNTagTemplate(_write(cur, prop.before));
                await _after();
                try { if (S && S.refreshTavernRegex) await S.refreshTavernRegex(prop.before); } catch (e) {}
            }
        } catch (e) { return { ok: false, text: '改不回去：' + ((e && e.message) || '不知道為什麼') }; }
        prop.state = 'undone'; prop.undoneAt = Date.now();
        return { ok: true };
    }

    // ── 那一行怎麼寫、單子小窗畫什麼 ─────────────────────────────────────
    function verb(prop) {
        if (prop.kind === 'add') return '新增';
        const b = Object.assign({}, prop.before), a = Object.assign({}, prop.after);
        const sw = b.isActive !== a.isActive;
        b.isActive = a.isActive = true;
        return (sw && JSON.stringify(b) === JSON.stringify(a)) ? (prop.after.isActive ? '打開' : '關掉') : '修改';
    }
    function _whatLine(prop) { return 'VN 組件「' + prop.title + (prop.name && prop.name !== prop.title ? '（' + prop.name + '）' : '') + '」'; }
    function text(prop, forModel) {
        if (!prop) return '';
        const who = prop.by || '對方', v = verb(prop), what = _whatLine(prop);
        if (forModel) {
            if (prop.state === 'done') return who + ' ' + v + '了' + what + '，對方同意了，已經寫進去';
            if (prop.state === 'no') return who + ' 提出要' + v + what + '，對方沒有同意，沒有改';
            if (prop.state === 'undone') return who + ' ' + v + '了' + what + '，後來對方改回去了';
            if (prop.state === 'stale') return who + ' 提出要' + v + what + '，但那個組件後來被改過，沒有寫進去';
            return who + ' 提出要' + v + what + '，還在等對方決定';
        }
        if (prop.state === 'done' || prop.state === 'undone') return who + ' ' + v + '了' + what;
        return who + ' 想' + v + what;
    }
    function what() { return 'VN 組件'; }
    function noun() { return 'VN 組件'; }
    function _changed(prop) {
        const b = prop.before || {}, a = prop.after || {};
        return ['usageDesc', 'demoFormat', 'html', 'css', 'js'].filter(function (k) { return b[k] !== a[k]; });
    }
    // 小窗的格子：{ lab, preview:'before'|'after' } 是新的一種（wx_tools 畫完之後叫 mountPreview 把預覽放進去）
    function cards(prop) {
        const a = prop.after || {}, out = [];
        if (prop.kind === 'add') {
            out.push({ lab: '標籤', val: a.tagId + (a.title && a.title !== a.tagId ? '（名字：' + a.title + '）' : '') });
            out.push({ lab: '新組件的樣子（照正文裡的寫法放示範資料）', preview: 'after' });
            out.push({ lab: LAB.usageDesc, txt: a.usageDesc || '（空的）' });
            out.push({ lab: LAB.demoFormat, txt: a.demoFormat || '（沒有：單行標籤）' });
            if (a.keywords && a.keywords.length) out.push({ lab: '觸發詞', val: a.keywords.join('、') });
            ['html', 'css', 'js'].forEach(function (k) { if (a[k]) out.push({ lab: LAB[k], txt: a[k] }); });
            return out;
        }
        const b = prop.before || {}, ch = _changed(prop);
        if (ch.some(function (k) { return LOOK.indexOf(k) !== -1; })) {
            out.push({ lab: '改前的樣子', preview: 'before' });
            out.push({ lab: '改後的樣子', preview: 'after' });
        }
        if (b.title !== a.title) out.push({ lab: '名字', from: b.title, to: a.title });
        if (b.isActive !== a.isActive) out.push({ lab: '開關', from: b.isActive ? '開著' : '關著', to: a.isActive ? '開著' : '關著' });
        if ((b.keywords || []).join('、') !== (a.keywords || []).join('、')) out.push({ lab: '觸發詞', from: (b.keywords || []).join('、') || '（沒有）', to: (a.keywords || []).join('、') || '（沒有）' });
        ch.forEach(function (k) { out.push({ lab: LAB[k], diff: [b[k], a[k]] }); });
        if (!out.length) out.push({ lab: '組件', val: prop.title });
        return out;
    }
    // 修改紀錄那一筆寫什麼（OS_AURELIA_EDIT 的修改紀錄會來問）
    function detail(prop) {
        if (prop.kind === 'add') return ['正文裡的寫法：「' + _cut(prop.after.demoFormat || '（單行標籤）', 120) + '」', '用途：「' + _cut(prop.after.usageDesc, 120) + '」'];
        const b = prop.before || {}, a = prop.after || {}, out = [];
        if (b.title !== a.title) out.push('名字：「' + b.title + '」改成「' + a.title + '」');
        if (b.isActive !== a.isActive) out.push(a.isActive ? '打開了' : '關掉了');
        const ch = _changed(prop);
        if (ch.length) out.push('改了：' + ch.map(function (k) { return LAB[k]; }).join('、'));
        return out;
    }
    // 單子小窗畫完之後，把預覽放進 el（改前那份或改後那份）
    function mountPreview(prop, which, el) {
        const S = _S();
        if (!S || !S.vnPreview) { el.textContent = '創作室還沒載好，畫不出預覽。'; return; }
        const data = which === 'before' ? prop.before : prop.after;
        if (!data) return;
        S.vnPreview(el, data).then(function (r) {
            if (r && r.error) {
                const d = document.createElement('div');
                d.className = 'wxtl-pp-pverr';
                d.textContent = '預覽時出錯：' + r.error;
                el.appendChild(d);
            }
        });
    }

    // ── 給模型看的清單（寫給沒看過奧瑞亞的模型）─────────────────────────────
    const NOTE = 'aurelia_vn_ 開頭的工具是看和改對方的 VN 組件。VN 組件是對方故事畫面裡的小面板：寫故事的模型在正文裡照某個格式寫一段標籤，'
        + '畫面就把那段換成這個面板（用 html、css、js 畫出來，例如圖鑑、信件、手機畫面）。list、read、spec 的結果下一輪交給你。'
        + 'add 和 edit 不會直接改，只會在對方的畫面上出一張單子，附改前改後的預覽，對方按同意才寫進去；你不會拿到結果，寫完這一輪就結束，'
        + '所以那一則要在工具那一行之前用你自己的話說想怎麼做，不要說已經改好了。做新的或大改之前先用 spec 看寫法，一定要照它的規矩；'
        + '改一個之前先用 read 看全文，看到了再在下一輪寫 edit，不要跟 read、spec 寫在同一輪。'
        + '單子還沒被同意之前，對方要你再調整：直接對同一個標籤用 edit，會接著你上一張單子的內容改、出一張新的單子，舊的那張自動作廢，read 看到的也是那份還沒寫進去的內容。'
        + '這裡只能改「故事裡跳出來的」那種組件；裝在手機桌面上的應用、主畫面組件只能看，要對方在創作室改。組件不能刪，要拿掉就用 enabled: false 關掉。';
    const TOOLS = [
        { name: 'aurelia_vn_list', label: '看有哪些 VN 組件', run: list,
          description: '列出對方所有的 VN 組件：標籤、名字、哪一型、開著沒、用途、正文裡的寫法。',
          inputSchema: { type: 'object', properties: {} } },
        { name: 'aurelia_vn_read', label: '看 VN 組件全文', run: read,
          description: '看一個 VN 組件的全文（說明、正文裡的寫法、html、css、js）。改之前先用這個看。很長會分段，用 part 看下一段。',
          inputSchema: { type: 'object', properties: {
              tag: { type: 'string', description: '組件的標籤或名字' },
              part: { type: 'number', description: '很長時看第幾段（從 1 開始）' } }, required: ['tag'] } },
        { name: 'aurelia_vn_spec', label: '看 VN 組件的寫法', run: spec,
          description: '看怎麼寫 VN 組件：面板怎麼放、一定要守的規矩、js 裡能用的 st 函式清單、正文裡的寫法怎麼定。做新的或大改之前先看。很長會分段，用 part 看下一段。',
          inputSchema: { type: 'object', properties: { part: { type: 'number', description: '看第幾段（從 1 開始）' } } } },
        { name: 'aurelia_vn_add', label: '新增 VN 組件', propose: true,
          description: '提出做一個新的 VN 組件（故事裡跳出來的那種；對方看過預覽、按同意才會加）。寫之前先用 aurelia_vn_spec 看寫法。',
          inputSchema: { type: 'object', properties: {
              tag: { type: 'string', description: '標籤：英文字母、數字、底線，正文裡就用這個名字寫，不能跟已經有的重複' },
              title: { type: 'string', description: '給對方看的名字，四個字以內' },
              html: { type: 'string', description: '面板的 html' },
              css: { type: 'string', description: '樣式，每一條選擇器都要在 .vn-dynamic-panel-標籤 底下' },
              js: { type: 'string', description: '程式：拿得到 container、lines（正文那一段的每一行）、onComplete（關掉面板）、st；關閉鈕一定要叫 onComplete' },
              demo_format: { type: 'string', description: '正文裡怎麼寫這一段（資料的結構，每一行一筆），寫故事的模型照這個寫' },
              usage_desc: { type: 'string', description: '給寫故事的模型的一句話說明：什麼時候用、照正文裡的寫法填' },
              keywords: { type: 'string', description: '選填：三到五個觸發詞，逗號隔開（正文出現這些詞代表需要這個面板）' },
              is_block: { type: 'boolean', description: '正文裡是不是寫一整段資料（有 demo_format 就是 true，不填照有沒有 demo_format 決定）' } },
            required: ['tag', 'html', 'js', 'usage_desc'] } },
        { name: 'aurelia_vn_edit', label: '改 VN 組件', propose: true,
          description: '提出修改一個已經有的 VN 組件（對方看過改前改後的預覽、按同意才會改）。只改一段：field 寫哪一欄、find 寫原文、replace 寫換成什麼；整欄重寫：直接給那一欄（html、css、js、demo_format、usage_desc）；也可以改名字、觸發詞，或用 enabled 關掉、打開。',
          inputSchema: { type: 'object', properties: {
              tag: { type: 'string', description: '要改的組件的標籤或名字' },
              field: { type: 'string', description: '用 find 時要改哪一欄：html、css、js、demo_format、usage_desc' },
              find: { type: 'string', description: '要換掉的那一段：照 aurelia_vn_read 看到的原文一字不差抄，要在那一欄裡只出現一次' },
              replace: { type: 'string', description: '換成什麼（跟 find 一起用；要刪掉那段就寫空字串）' },
              html: { type: 'string', description: '整欄重寫：新的 html' },
              css: { type: 'string', description: '整欄重寫：新的樣式' },
              js: { type: 'string', description: '整欄重寫：新的程式' },
              demo_format: { type: 'string', description: '整欄重寫：新的正文裡的寫法' },
              usage_desc: { type: 'string', description: '整欄重寫：新的說明' },
              title: { type: 'string', description: '新的名字' },
              keywords: { type: 'string', description: '新的觸發詞，逗號隔開（會整組換掉）' },
              enabled: { type: 'boolean', description: 'true 打開、false 關掉（關掉＝故事裡不會再出現，但沒有刪掉）' } },
            required: ['tag'] } },
    ];

    function _E() { return win.OS_AURELIA_EDIT || window.OS_AURELIA_EDIT || null; }
    async function run(name, args) {
        if (name === 'aurelia_change_log') { const E = _E(); if (!E) throw new Error('修改紀錄還沒載好'); return E.readLog(args); }
        const t = TOOLS.find(function (x) { return x.name === name && x.run; });
        if (!t) throw new Error('沒有叫做「' + name + '」的工具');
        return String((await t.run(args || {})) || '').trim() || '什麼都沒有查到。';
    }
    const _pub = TOOLS.map(function (t) { return { name: t.name, label: t.label, description: t.description, inputSchema: t.inputSchema, propose: !!t.propose }; });

    const API = {
        note: NOTE,
        get tools() { const E = _E(); return (E && E.logTool) ? _pub.concat([E.logTool]) : _pub; },
        run: run, propose: propose, apply: apply, undo: undo,
        verb: verb, text: text, what: what, noun: noun, cards: cards, detail: detail, mountPreview: mountPreview, superseded: superseded,
    };
    win.OS_AURELIA_VN = API;
    window.OS_AURELIA_VN = API;
})();
