// ----------------------------------------------------------------
// [檔案] os_aurelia_fx.js — 「改特效」：角色／住戶提出新增或修改畫面特效，單子上可以試播，她按同意才存
// 路徑：os_phone/os/os_aurelia_fx.js
//
// 小機工具「會動手」的第五件（前面：改世界書、改預設、改 VN 組件、改主題）。10-01 她：照順序做特效。
//   ・特效是一份配方（JSON，積木＋參數），交給固定的播放器照著播（vn_fx.js 的 OS_FX），不是程式碼。
//     內建的有好幾個（BUILTINS）；她做的存在創作室（OS_DB 的 ui_templates，isFX），同一個 fxId 存一份就蓋過內建（創作室本來就這樣）。
//   ・寫法說明書跟創作室特效工坊同一份（OS_STUDIO.fxSpec），檢查用播放器自己的 validate（不認得的積木與參數會被拿掉）。
//   ・試播與截圖用 OS_FX.sandbox() 另開的播放器：不碰故事裡那份，她正在下的雨不會被停掉。截圖不放音效。
//   ・同意＝照創作室存檔那樣存（同 fxId 覆蓋、reloadSaved）；開關走 OS_FX.setEnabled。改回去：新增的刪掉、改的換回改前（改內建的＝刪掉蓋過它的那份）。
//   ・還沒被同意前再改＝接著上一張（草稿），舊的作廢（同 VN 組件）。
// 暴露：window.OS_AURELIA_FX = { note, tools, run, propose, apply, undo, verb, text, what, noun, cards, detail, mountPreview, superseded, look }
//   單子 prop.mod === 'fx'，OS_AURELIA_EDIT 看到就轉過來。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const PART = 2600;

    function _FX() { return win.OS_FX || window.OS_FX || null; }
    function _D() { return win.OS_DB || window.OS_DB || null; }
    function _S() { return win.OS_STUDIO || window.OS_STUDIO || null; }
    function _no(t) { return { ok: false, text: t }; }
    function _one(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
    function _cut(s, n) { s = _one(s); return s.length > n ? s.slice(0, n) + '…' : s; }
    function _newId() { return 'pf' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
    function _key(id) { return String(id || '').trim().toLowerCase(); }
    function _clean(r) { if (!r) return null; const o = JSON.parse(JSON.stringify(r)); delete o.enabled; delete o.group; return o; }
    function _same(a, b) { return JSON.stringify(_clean(a)) === JSON.stringify(_clean(b)); }

    // 已存的（創作室那份）：[{ tpl, recipe }]
    async function _saved() {
        const D = _D();
        if (!D || !D.getAllUITemplates) return [];
        try { return ((await D.getAllUITemplates()) || []).filter(function (t) { return t && t.isFX && t.fxRecipe; }).map(function (t) { return { tpl: t, recipe: t.fxRecipe }; }); } catch (e) { return []; }
    }
    function _isBuiltin(id) { const F = _FX(); return !!(F && F.builtinIds && F.builtinIds().indexOf(_key(id)) !== -1); }
    // 一個特效現在的樣子：已存的優先（蓋過內建），不然內建
    async function _current(id) {
        const k = _key(id), F = _FX();
        const hit = (await _saved()).find(function (x) { return _key(x.recipe.fxId) === k; });
        if (hit) return { recipe: _clean(hit.recipe), tpl: hit.tpl, builtin: _isBuiltin(k) };
        const b = F ? F.listAll().find(function (r) { return r.fxId === k; }) : null;
        return b ? { recipe: _clean(b), tpl: null, builtin: true } : null;
    }
    async function _find(key) {
        const F = _FX();
        if (!F) return { err: '特效播放器還沒載好。' };
        const k = _key(key);
        if (!k) return { err: '要寫是哪一個特效（fx- 開頭的代號或名字）。' };
        const all = F.listAll();
        const hit = all.find(function (r) { return r.fxId === k; }) || all.find(function (r) { return _one(r.name).toLowerCase() === k; });
        if (!hit) {
            const near = all.filter(function (r) { return (r.fxId + ' ' + r.name).toLowerCase().indexOf(k) !== -1; }).slice(0, 5);
            return { err: '找不到「' + _one(key) + '」這個特效。' + (near.length ? '像的有：' + near.map(function (r) { return r.fxId + '（' + r.name + '）'; }).join('、') : '先用 aurelia_fx_list 看有哪些。') };
        }
        const cur = await _current(hit.fxId);
        return { id: hit.fxId, cur: cur, enabled: F.isEnabled(hit.fxId) };
    }
    // 把交來的配方過播放器的 validate：格式不對退回；有積木被拿掉就提醒
    function _check(raw) {
        const F = _FX();
        if (!F || !F.validate) return { err: '特效播放器還沒載好。' };
        let r = raw;
        if (typeof r === 'string') { const s = r, i = s.indexOf('{'), j = s.lastIndexOf('}'); try { r = JSON.parse(s.slice(i, j + 1)); } catch (e) { r = null; } }
        if (!r || typeof r !== 'object') return { err: 'recipe 要是一份 JSON 配方（格式照 aurelia_fx_spec 看到的）。' };
        const norm = F.validate(r);
        if (!norm) return { err: '配方格式不對：fxId 要 fx- 開頭、只用小寫英文數字連字號，steps 要有認得的積木。' };
        if (!norm.steps || !norm.steps.length) return { err: '一個能用的積木都沒有（積木名稱與參數照說明書那張表）。' };
        const warn = [];
        const n0 = Array.isArray(r.steps) ? r.steps.length : 0;
        if (n0 > norm.steps.length) warn.push('有 ' + (n0 - norm.steps.length) + ' 個積木不認得或參數不對，被拿掉了');
        if (norm.steps.some(function (s) { return s.block === 'code'; })) warn.push('有自訂繪製的程式：播的時候連續出錯 3 次會自己停');
        return { recipe: _clean(norm), warn: warn };
    }

    // ── 看的 ─────────────────────────────────────────────────────────────
    async function list() {
        const F = _FX();
        if (!F) return '特效播放器還沒載好。';
        const all = F.listAll(), o = _drafts();
        const lines = all.map(function (r) {
            return '・' + r.fxId + '「' + r.name + '」｜' + (r.kind === 'loop' ? '持續（掛到換場）' : '瞬發') + '｜' + (r.enabled ? '開著' : '關著')
                + (_isBuiltin(r.fxId) ? '｜內建' : '') + (o[r.fxId] ? '｜有一張改它的單子還沒被同意' : '')
                + '\n  什麼時候用：' + _cut(r.use || r.desc || '', 80);
        });
        Object.keys(o).forEach(function (k) { if (o[k].kind === 'add' && !all.some(function (r) { return r.fxId === k; })) lines.push('・' + k + '「' + (o[k].after.name || '') + '」｜草稿：單子還沒被同意，還沒存進去'); });
        return '對方的畫面特效（正文裡寫 #代號# 就會播）：\n' + lines.join('\n');
    }
    function _paged(text, part, what) {
        const n = Math.max(1, Math.ceil(text.length / PART));
        const p = Math.min(n, Math.max(1, Math.floor(Number(part) || 1)));
        return (n > 1 ? what + '（第 ' + p + '／' + n + ' 段' + (p < n ? '，part 填 ' + (p + 1) + ' 看下一段' : '，這是最後一段') + '）\n' : '') + text.slice((p - 1) * PART, p * PART);
    }
    async function read(args) {
        const d = _drafts()[_key(args.id)];
        if (d) return _paged('這是你上一張單子的內容，對方還沒按同意；要再改就對它用 aurelia_fx_edit。\n' + JSON.stringify(d.after, null, 1), args.part, '這個特效的配方');
        const f = await _find(args.id);
        if (f.err) return f.err;
        return _paged('特效 ' + f.id + (f.cur.builtin && !f.cur.tpl ? '（內建）' : '') + '｜' + (f.enabled ? '開著' : '關著') + '\n' + JSON.stringify(f.cur.recipe, null, 1), args.part, '這個特效的配方');
    }
    function spec(args) {
        const S = _S(), txt = S && S.fxSpec ? S.fxSpec() : '';
        if (!txt) return '創作室還沒載好，現在看不到寫法。';
        const pre = '下面是對方的特效工坊給模型的說明書。說明書說的「輸出被 <json> 包裹的配方」，你把那份 JSON 放進 aurelia_fx_add 的 recipe 參數就好。\n\n';
        return _paged(pre + txt, args.part, '特效的寫法');
    }

    // ── 草稿（同 VN 組件）────────────────────────────────────────────────
    const DRAFT_KEY = 'aurelia_fx_drafts', DRAFT_DAYS = 14;
    function _drafts() {
        let o = {};
        try { o = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}') || {}; } catch (e) {}
        const old = Date.now() - DRAFT_DAYS * 86400000;
        Object.keys(o).forEach(function (k) { if (!o[k] || o[k].at < old) delete o[k]; });
        return o;
    }
    function _draftsSave(o) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(o)); } catch (e) {} }
    function _draftPut(prop) { const o = _drafts(); o[_key(prop.title)] = { id: prop.id, kind: prop.kind, before: prop.before, after: prop.after, at: Date.now() }; _draftsSave(o); }
    function _draftDrop(prop) { const o = _drafts(); if (o[_key(prop.title)] && o[_key(prop.title)].id === prop.id) { delete o[_key(prop.title)]; _draftsSave(o); } }
    function superseded(prop) {
        if (!prop || (prop.state !== 'wait' && prop.state !== 'no') || prop.kind === 'toggle') return false;
        const d = _drafts()[_key(prop.title)];
        return !!(d && d.id !== prop.id);
    }

    // ── 提出 ─────────────────────────────────────────────────────────────
    function _prop(kind, id, extra) { return Object.assign({ id: _newId(), mod: 'fx', kind: kind, book: '畫面特效', title: id, state: 'wait', at: Date.now() }, extra); }
    async function _proposeAdd(args) {
        const c = _check(args.recipe);
        if (c.err) return _no(c.err);
        const F = _FX();
        if (F.listAll().some(function (r) { return r.fxId === c.recipe.fxId; })) return _no('已經有代號是「' + c.recipe.fxId + '」的特效了，要改它用 aurelia_fx_edit，要做新的換一個代號。');
        const prop = _prop('add', c.recipe.fxId, { before: null, after: c.recipe, warn: c.warn });
        _draftPut(prop);
        return { ok: true, prop: prop };
    }
    async function _proposeEdit(args) {
        const d = _drafts()[_key(args.id)];
        let kind, before, base, builtin = false, onOff = null;
        if (d) { kind = d.kind; before = d.before; base = d.after; }
        else {
            const f = await _find(args.id);
            if (f.err) return _no(f.err);
            kind = 'edit'; before = f.cur.recipe; base = f.cur.recipe; builtin = f.cur.builtin && !f.cur.tpl;
            onOff = f.enabled;
        }
        let after = base, warn = [];
        if (args.recipe != null && args.recipe !== '') {
            const c = _check(args.recipe);
            if (c.err) return _no(c.err);
            if (c.recipe.fxId !== base.fxId) return _no('recipe 裡的 fxId 要跟原本一樣（' + base.fxId + '）；要做新的另一個用 aurelia_fx_add。');
            after = c.recipe; warn = c.warn;
        }
        const wantOn = args.enabled == null ? null : (args.enabled === true || args.enabled === 'true');
        const changed = !_same(after, base);
        if (!changed && (wantOn == null || wantOn === onOff)) return _no('跟現在一模一樣，沒有要改的地方。');
        if (!changed && wantOn != null) {
            // 只開關：不走草稿，直接一張開關單
            return { ok: true, prop: _prop('toggle', base.fxId, { name: base.name, before: { enabled: onOff }, after: { enabled: wantOn } }) };
        }
        if (before && _same(after, before)) return _no('改完跟存著的那份一模一樣，不用再提單子。');
        const prop = _prop(kind, after.fxId, { before: before, after: after, builtin: builtin, warn: warn });
        if (wantOn != null) prop.setOn = wantOn;
        _draftPut(prop);
        return { ok: true, prop: prop };
    }
    async function propose(name, args) {
        args = args || {};
        if (name === 'aurelia_fx_add') return _proposeAdd(args);
        if (name === 'aurelia_fx_edit') return _proposeEdit(args);
        return _no('沒有叫做「' + name + '」的工具');
    }

    // ── 她按同意／改回去 ─────────────────────────────────────────────────
    function _stale(prop, why) { prop.state = 'stale'; prop.why = why; return { ok: false, text: why }; }
    async function _reload() { const F = _FX(); try { if (F && F.reloadSaved) await F.reloadSaved(); } catch (e) {} }
    async function apply(prop) {
        if (!prop || (prop.state !== 'wait' && prop.state !== 'no')) return { ok: false, text: '這張已經處理過了' };
        if (superseded(prop)) return { ok: false, text: '這張已經有新的一版了，看最新那張' };
        const F = _FX(), D = _D();
        if (!F || !D || !D.saveUITemplate) return { ok: false, text: '特效播放器還沒載好' };
        try {
            if (prop.kind === 'toggle') {
                if (F.isEnabled(prop.title) !== prop.before.enabled) return _stale(prop, '這個特效的開關在提出之後被動過了，這張作廢');
                F.setEnabled(prop.title, prop.after.enabled);
            } else if (prop.kind === 'add') {
                if (F.listAll().some(function (r) { return r.fxId === prop.after.fxId; })) return _stale(prop, '在那之後已經有同一個代號的特效了，沒有再存');
                const id = 'fx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
                await D.saveUITemplate({ id: id, title: prop.after.name, isFX: true, panelType: '特效', fxRecipe: prop.after, createdAt: Date.now() });
                prop.tplId = id;
            } else {
                const cur = await _current(prop.title);
                if (!cur || !_same(cur.recipe, prop.before)) return _stale(prop, '這個特效在提出之後被改過了，這張作廢，沒有蓋掉');
                prop.hadTpl = !!cur.tpl;
                const id = cur.tpl ? cur.tpl.id : ('fx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6));
                await D.saveUITemplate({ id: id, title: prop.after.name, isFX: true, panelType: '特效', fxRecipe: prop.after, createdAt: cur.tpl ? (cur.tpl.createdAt || Date.now()) : Date.now() });
                prop.tplId = id;
                if (prop.setOn != null) { prop.prevOn = F.isEnabled(prop.title); F.setEnabled(prop.title, prop.setOn); }
            }
            await _reload();
        } catch (e) { return { ok: false, text: '存不進去：' + ((e && e.message) || '不知道為什麼') }; }
        prop.state = 'done'; prop.doneAt = Date.now();
        _draftDrop(prop);
        return { ok: true };
    }
    async function undo(prop) {
        if (!prop || prop.state !== 'done') return { ok: false, text: '這張沒有寫進去過' };
        const F = _FX(), D = _D();
        const LATER = '在那之後又被改過了，改不回去（怕蓋掉後來的修改）';
        try {
            if (prop.kind === 'toggle') {
                if (F.isEnabled(prop.title) !== prop.after.enabled) return { ok: false, text: LATER };
                F.setEnabled(prop.title, prop.before.enabled);
            } else {
                const cur = await _current(prop.title);
                if (!cur || !_same(cur.recipe, prop.after)) return { ok: false, text: LATER };
                if (prop.kind === 'add' || !prop.hadTpl) await D.deleteUITemplate(prop.tplId);   // 新增的、蓋過內建的：刪掉那份就回到原本
                else await D.saveUITemplate(Object.assign({}, cur.tpl, { title: prop.before.name, fxRecipe: prop.before }));
                if (prop.prevOn != null) F.setEnabled(prop.title, prop.prevOn);
                await _reload();
            }
        } catch (e) { return { ok: false, text: '改不回去：' + ((e && e.message) || '不知道為什麼') }; }
        prop.state = 'undone'; prop.undoneAt = Date.now();
        return { ok: true };
    }

    // ── 那一行怎麼寫、單子小窗畫什麼 ─────────────────────────────────────
    function verb(prop) { if (prop.kind === 'add') return '新增'; if (prop.kind === 'toggle') return prop.after.enabled ? '打開' : '關掉'; return '修改'; }
    function _whatLine(prop) { const n = (prop.after && prop.after.name) || prop.name || ''; return '畫面特效「' + prop.title + (n ? '（' + n + '）' : '') + '」'; }
    function text(prop, forModel) {
        if (!prop) return '';
        const who = prop.by || '對方', v = verb(prop), what = _whatLine(prop);
        if (forModel) {
            if (prop.state === 'done') return who + ' ' + v + '了' + what + '，對方同意了，已經存進去';
            if (prop.state === 'no') return who + ' 提出要' + v + what + '，對方沒有同意，沒有改';
            if (prop.state === 'undone') return who + ' ' + v + '了' + what + '，後來對方改回去了';
            if (prop.state === 'stale') return who + ' 提出要' + v + what + '，但那個特效後來被改過，沒有存進去';
            return who + ' 提出要' + v + what + '，還在等對方決定';
        }
        if (prop.state === 'done' || prop.state === 'undone') return who + ' ' + v + '了' + what;
        return who + ' 想' + v + what;
    }
    function what() { return '畫面特效'; }
    function noun() { return '特效'; }
    function cards(prop) {
        const a = prop.after || {}, b = prop.before, out = [];
        if (prop.kind === 'toggle') return [{ lab: '開關', from: b.enabled ? '開著' : '關著', to: a.enabled ? '開著' : '關著' }];
        if (prop.kind === 'add') out.push({ lab: '試播', preview: 'after' });
        else { out.push({ lab: '改前', preview: 'before' }); out.push({ lab: '改後', preview: 'after' }); }
        if ((prop.warn || []).length) out.push({ lab: '要注意', txt: prop.warn.join('\n') });
        if (prop.builtin) out.push({ lab: '這是內建的', val: '同意之後存一份蓋過內建的；改回去就回到內建原本的樣子' });
        out.push({ lab: '代號', val: '#' + a.fxId + '#（正文裡這樣寫就會播）' });
        out.push({ lab: '什麼時候用', txt: a.use || a.desc || '（沒寫）' });
        out.push({ lab: '瞬發還是持續', val: a.kind === 'loop' ? '持續（掛到換場）' : '瞬發（播完就消失）' });
        if (prop.kind === 'add') out.push({ lab: '配方', txt: JSON.stringify(a, null, 1) });
        else out.push({ lab: '配方', diff: [JSON.stringify(b, null, 1), JSON.stringify(a, null, 1)] });
        return out;
    }
    function detail(prop) {
        if (prop.kind === 'toggle') return [prop.after.enabled ? '打開了' : '關掉了'];
        const out = [];
        if (prop.kind === 'add') out.push('什麼時候用：「' + _cut(prop.after.use || prop.after.desc || '', 100) + '」');
        else out.push('改了配方' + (prop.builtin ? '（存一份蓋過內建的）' : ''));
        if ((prop.warn || []).length) out.push('提出時提醒過：' + prop.warn.join('；'));
        return out;
    }

    // ── 預覽：小舞台＋播一次（另開的播放器，不碰故事裡那份）──────────────────
    function _frames() { const S = _S(); return (S && S.vnFrames) ? S.vnFrames() : { phone: { w: 390, h: 844, lab: '手機' }, center: { w: 1000, h: 660, lab: '中間' }, full: { w: 1920, h: 1080, lab: '全螢幕' } }; }
    function _vp() { try { const v = localStorage.getItem('fx_pv_vp'); return _frames()[v] ? v : 'phone'; } catch (e) { return 'phone'; } }
    const _live = [];
    let _player = null;
    // 小舞台：一塊像故事背景的底（特效是疊在背景上看的），畫布由播放器自己掛上去
    //   樣式直接寫在元素上：截圖時是畫在畫面外、單子的樣式表不一定載過
    const STAGE_CSS = 'position:relative;overflow:hidden;transform-origin:top left;';
    function _stageHtml() { return '<div class="fx-pv-bg" style="position:absolute;inset:0;background:linear-gradient(160deg,#3d5673 0%,#6f6487 40%,#b08a6a 75%,#d9bf92 100%);"></div>'; }
    function mountPreview(prop, which, el) {
        const F = _FX();
        const recipe = which === 'before' ? prop.before : prop.after;
        if (!F || !F.sandbox || !recipe) { el.textContent = '特效播放器還沒載好。'; return null; }
        const Fr = _frames();
        const sizes = document.createElement('div');
        sizes.className = 'vn-pv-tabs';
        sizes.innerHTML = Object.keys(Fr).map(function (k) { return '<button type="button" class="vn-pv-tab" data-vp="' + k + '">' + Fr[k].lab + '</button>'; }).join('');
        const wrap = document.createElement('div'); wrap.className = 'th-pv-wrap';
        const box = document.createElement('div'); box.className = 'th-pv-box';
        const stage = document.createElement('div'); stage.className = 'fx-pv-stage'; stage.style.cssText = STAGE_CSS; stage.innerHTML = _stageHtml();
        box.appendChild(stage); wrap.appendChild(box);
        const play = document.createElement('button'); play.type = 'button'; play.className = 'th-pv-try'; play.textContent = '播一次';
        el.appendChild(sizes); el.appendChild(wrap); el.appendChild(play);
        const one = { el: el, paint: function () {
            const vp = _vp(), f = _frames()[vp];
            const avail = Math.max(1, wrap.clientWidth || 320);
            const s = vp === 'phone' ? Math.min(avail / f.w, 430 / f.h) : Math.min(1, avail / f.w);
            stage.style.width = f.w + 'px'; stage.style.height = f.h + 'px'; stage.style.transform = 'scale(' + s + ')';
            box.style.width = Math.round(f.w * s) + 'px'; box.style.height = Math.round(f.h * s) + 'px';
            sizes.querySelectorAll('[data-vp]').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-vp') === vp); });
        } };
        _live.push(one);
        sizes.addEventListener('click', function (e) {
            const b = e.target.closest('[data-vp]');
            if (!b) return;
            try { localStorage.setItem('fx_pv_vp', b.getAttribute('data-vp')); } catch (er) {}
            for (let i = _live.length - 1; i >= 0; i--) { if (!_live[i].el.isConnected) _live.splice(i, 1); else _live[i].paint(); }
        });
        play.addEventListener('click', function () {
            if (_player) { try { _player.stopAll(); } catch (e) {} }
            _player = F.sandbox();
            _player.preview(recipe, stage);   // 持續型播 4 秒自己停（同創作室試播）
        });
        one.paint();
        return function () { if (_player) { try { _player.stopAll(); } catch (e) {} _player = null; } };
    }

    // ── 提單子之前先看看（截圖）──────────────────────────────────────────
    //   在畫面外另開一個播放器播一次、中途截兩張（開頭與中間），不放音效、不出單子。
    async function look(args) {
        args = args || {};
        const F = _FX(), S = _S();
        if (!F || !F.sandbox || !S || !S.shotNode) return { text: '特效播放器或創作室還沒載好，現在截不了圖。', images: [] };
        let recipe = null, warn = [];
        if (args.recipe != null && args.recipe !== '') { const c = _check(args.recipe); if (c.err) return { text: c.err, images: [] }; recipe = c.recipe; warn = c.warn; }
        else {
            const d = _drafts()[_key(args.id)];
            if (d) recipe = d.after;
            else { const f = await _find(args.id); if (f.err) return { text: f.err, images: [] }; recipe = f.cur.recipe; }
        }
        const Fr = _frames(), size = Fr[args.size] ? args.size : 'phone', f = Fr[size];
        const quiet = Object.assign({}, recipe); delete quiet.sfx;   // 截圖不放音效
        let total = 1500;
        if (recipe.kind !== 'loop') { total = 0; (recipe.steps || []).forEach(function (s) { total = Math.max(total, (s.at || 0) + (s.dur || 0)); }); total = Math.min(total || 1200, 8000); }
        const host = document.createElement('div');
        host.style.cssText = 'position:fixed;left:-30000px;top:0;pointer-events:none;';
        const stage = document.createElement('div'); stage.className = 'fx-pv-stage'; stage.innerHTML = _stageHtml();
        stage.style.cssText = STAGE_CSS + 'width:' + f.w + 'px;height:' + f.h + 'px;';
        host.appendChild(stage); document.body.appendChild(host);
        // 截圖工具拍不到播放器那張畫布，而且拍一張要好一陣子（等它拍完特效早播完了，實測兩張都是結束後的樣子）：
        //   背景在播之前截一次；播的時候到了時間點「當下」把畫布複製下來，漫畫符號那種圖形（.vn-fx-svg）記下樣子與位置；最後再合成
        const toImg = function (src) { return new Promise(function (res, rej) { const im = new Image(); im.onload = function () { res(im); }; im.onerror = rej; im.src = src; }); };
        const grab = function (player) {
            const c = player._canvas, cp = document.createElement('canvas');
            if (c && c.width) { cp.width = c.width; cp.height = c.height; cp.getContext('2d').drawImage(c, 0, 0); }
            const sr = stage.getBoundingClientRect();
            const svgs = Array.prototype.map.call(stage.querySelectorAll('.vn-fx-svg'), function (el) {
                const r = el.getBoundingClientRect(), svg = el.tagName.toLowerCase() === 'svg' ? el : el.querySelector('svg');
                if (!svg || !r.width) return null;
                const x = svg.cloneNode(true);
                x.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                return { x: r.left - sr.left, y: r.top - sr.top, w: r.width, h: r.height, o: Number(getComputedStyle(el).opacity || 1),
                    src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(x)) };
            }).filter(Boolean);
            return { fx: cp, svgs: svgs };
        };
        const compose = async function (bg, fr) {
            const k = Math.min(1, 1024 / Math.max(f.w, f.h));
            const out = document.createElement('canvas');
            out.width = Math.round(f.w * k); out.height = Math.round(f.h * k);
            const g = out.getContext('2d');
            if (bg) g.drawImage(bg, 0, 0, out.width, out.height);
            if (fr.fx.width) g.drawImage(fr.fx, 0, 0, out.width, out.height);
            for (const s of fr.svgs) {
                try { const im = await toImg(s.src); g.globalAlpha = s.o; g.drawImage(im, s.x * k, s.y * k, s.w * k, s.h * k); g.globalAlpha = 1; } catch (e) {}
            }
            return out.toDataURL('image/jpeg', 0.82);
        };
        const p = F.sandbox(), images = [], lines = [], frames = [];
        const at = recipe.kind === 'loop' ? [700, 1800] : [Math.round(total * 0.15), Math.round(total * 0.45)];
        let bg = null;
        try {
            try { bg = await toImg(await S.shotNode(stage, f.w, f.h, '#222')); } catch (e) {}
            if (!p.play(quiet, stage)) return { text: '這份配方播不起來。', images: [] };
            const t0 = performance.now();
            for (const ms of at) {
                while (performance.now() - t0 < ms) await new Promise(function (r) { setTimeout(r, 15); });
                frames.push({ ms: ms, fr: grab(p) });
            }
        } finally { try { p.stopAll(); } catch (e) {} host.remove(); }
        for (const x of frames) {
            try { images.push(await compose(bg, x.fr)); lines.push('・播到第 ' + (x.ms / 1000).toFixed(1) + ' 秒'); }
            catch (e) { lines.push('・第 ' + (x.ms / 1000).toFixed(1) + ' 秒沒截下來（' + ((e && e.message) || e) + '）'); }
        }
        if (document.hidden) lines.push('（她的畫面現在在背景，動畫可能停住，截到的會是開頭的樣子）');
        return {
            text: '特效 ' + recipe.fxId + '「' + recipe.name + '」播出來的樣子（' + f.lab + ' ' + f.w + '×' + f.h + '，' + (recipe.kind === 'loop' ? '持續型' : '瞬發，全長約 ' + (total / 1000).toFixed(1) + ' 秒') + '；沒有出單子，對方看不到）：\n'
                + lines.join('\n') + (warn.length ? '\n檢查抓到的：\n- ' + warn.join('\n- ') : ''),
            images: images.slice(0, 3)
        };
    }

    // ── 給模型看的清單 ─────────────────────────────────────────────────────
    const NOTE = 'aurelia_fx_ 開頭的工具是看和改對方的畫面特效。特效是故事畫面上播的效果（下雪、閃紅、雷劈、漫畫符號這類），'
        + '寫故事的模型在正文寫 #代號# 就會播；每個特效是一份配方（JSON：用固定的積木組起來），不是程式。'
        + 'list、read、spec、look 的結果下一輪交給你。add 和 edit 不會直接改，只會在對方的畫面上出一張單子（可以試播），對方按同意才存；'
        + '你不會拿到結果，寫完這一輪就結束，所以那一則要先用你自己的話說想怎麼做，不要說已經改好了。'
        + '做新的或大改之前先用 spec 看寫法，一定要照它的積木與範圍；提單子之前可以先用 look 看播出來的樣子。'
        + '內建的特效也能改（會存一份蓋過它，改回去就回到內建的）。單子還沒被同意之前要再調整：對同一個代號用 edit，會接著你上一張改、舊的作廢。';
    const TOOLS = [
        { name: 'aurelia_fx_list', label: '看有哪些特效', run: list,
          description: '列出對方所有的畫面特效：代號、名字、瞬發還是持續、開著沒、什麼時候用。', inputSchema: { type: 'object', properties: {} } },
        { name: 'aurelia_fx_read', label: '看特效配方', run: read,
          description: '看一個特效的配方全文（JSON）。改之前先看。',
          inputSchema: { type: 'object', properties: { id: { type: 'string', description: '特效代號（fx- 開頭）或名字' }, part: { type: 'number', description: '很長時看第幾段' } }, required: ['id'] } },
        { name: 'aurelia_fx_spec', label: '看特效的寫法', run: spec,
          description: '看怎麼寫特效配方：有哪些積木、每個參數的範圍、瞬發與持續的差別。做新的或大改之前先看。很長會分段，用 part 看下一段。',
          inputSchema: { type: 'object', properties: { part: { type: 'number', description: '看第幾段（從 1 開始）' } } } },
        { name: 'aurelia_fx_look', label: '看看特效播出來的樣子',
          description: '提單子之前先看看：把特效在畫面外播一次、截兩張（能看圖的才看得到）。只填 id＝看已經有的（或你還沒被同意的那張）；給 recipe＝看這份新配方。不會出單子。',
          inputSchema: { type: 'object', properties: { id: { type: 'string', description: '特效代號或名字' },
              recipe: { type: 'string', description: '要看的配方（JSON）' },
              size: { type: 'string', description: 'phone（手機，不填就是這個）、center（電腦中間）、full（電腦全屏）' } } } },
        { name: 'aurelia_fx_add', label: '新增特效', propose: true,
          description: '提出新增一個畫面特效（對方試播過、按同意才會存）。寫之前先用 aurelia_fx_spec 看寫法。',
          inputSchema: { type: 'object', properties: { recipe: { type: 'string', description: '整份配方（JSON，格式照說明書；fxId 不能跟已經有的重複）' } }, required: ['recipe'] } },
        { name: 'aurelia_fx_edit', label: '改特效', propose: true,
          description: '提出修改一個已經有的特效（對方試播改前改後、按同意才會改）。recipe 給整份新配方（fxId 不變）；也可以只用 enabled 打開或關掉它（關掉＝正文寫了也不播、寫故事的模型也看不到它）。',
          inputSchema: { type: 'object', properties: { id: { type: 'string', description: '要改的特效代號或名字' },
              recipe: { type: 'string', description: '整份新配方（JSON，fxId 跟原本一樣）' },
              enabled: { type: 'boolean', description: 'true 打開、false 關掉' } }, required: ['id'] } },
    ];
    function _E() { return win.OS_AURELIA_EDIT || window.OS_AURELIA_EDIT || null; }
    async function run(name, args) {
        if (name === 'aurelia_change_log') { const E = _E(); if (!E) throw new Error('修改紀錄還沒載好'); return E.readLog(args); }
        if (name === 'aurelia_fx_look') return (await look(args || {})).text + '\n（這裡看不到截圖，只有播放的資訊。）';
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
        look: look,
    };
    win.OS_AURELIA_FX = API;
    window.OS_AURELIA_FX = API;
})();
