// ----------------------------------------------------------------
// [檔案] os_vn_rules.js — VN 指令（只存這一份）
// 路徑：os_phone/os/os_vn_rules.js
// 職責：VN 正文格式、SFX、BGM、手機／戰鬥模組、頭像規則這類「每個故事都一樣的 VN 寫法」。
//   以前住三個地方各改各的：酒館全域世界書「-VN小說家-」、os_prompts 寫死給 PWA 的總綱、PWA 自己的常駐書包，
//   改一次要抄三遍，還要手動匯出匯入。現在只有這一份：
//   ・酒館：GENERATION_STARTED → injectPrompts（倒數第 N 則前）／setExtensionPrompt（最前面），生成完就撤
//   ・PWA：os_api_engine 組 VN context 時把 getDepthParts() 併進世界書 @D 那批；「最前面」的走面板提示詞那格
//   ・自動開關（自由模式／世界題材／頭像產圖）撥這份的 enabled。這份是空的＝還沒搬，那幾支照舊撥世界書。
//   ・角色、CP 關係、內容偏好不放這裡：那些是世界設定，不能跟著通用規則跑進每個故事。
// 存放：localStorage os_vn_rules = [{ id, name, content, enabled, depth, role }]
//   depth：null＝最前面（主提示後）、N＝倒數第 N 則前（0＝歷史最後面）；role：0 系統／1 使用者／2 AI
//   陣列順序＝送出順序（同一個位置裡越後面越貼近生成點，跟酒館 order 大的排後面同方向）
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;

    const KEY = 'os_vn_rules';
    const INJECT_ID = 'aurelia_vn_rules';
    const ROLE_NAME = { 0: 'system', 1: 'user', 2: 'assistant' };
    const ROLE_FROM = { system: 0, user: 1, assistant: 2 };
    const SEP = '\n\n';

    function _aui() { return win.AUI || window.AUI || null; }
    function _toast(kind, msg) { try { const t = _aui() && _aui().toastr; if (t && t[kind]) t[kind](msg); } catch (e) {} }
    function _isStandalone() { try { return !!(win.OS_API && win.OS_API.isStandalone && win.OS_API.isStandalone()); } catch (e) { return false; } }
    function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function _genId() { return 'vr_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7); }
    function _normDepth(d) {
        if (d === null || d === undefined || d === '') return null;
        const n = parseInt(d, 10);
        return (isNaN(n) || n < 0) ? null : n;
    }
    function _normRole(r) { return (r === 1 || r === 2) ? r : 0; }

    // ================================================================
    // 資料
    // ================================================================
    function list() {
        try {
            const a = JSON.parse(localStorage.getItem(KEY) || '[]');
            return Array.isArray(a) ? a.filter(e => e && e.id) : [];
        } catch (e) { return []; }
    }
    function save(arr) {
        try { localStorage.setItem(KEY, JSON.stringify(arr || [])); return true; }
        catch (e) {
            // 🚨 localStorage 滿了是靜默失敗，一定要出聲，不然她以為存了
            console.warn('[VN指令] 存檔失敗:', e);
            _toast('error', 'VN 指令存不進去：瀏覽器的儲存空間滿了');
            return false;
        }
    }
    function hasAny() { return list().length > 0; }
    const _live = e => !!(e && e.enabled !== false && String(e.content || '').trim());

    // 設了位置的：[{ depth, role, text }]，深度大的排前面（呼叫端由大到小插），形狀跟 OS_WORLDBOOK.getContextParts 的 depths 一樣
    function getDepthParts() {
        const byKey = new Map();
        list().forEach(e => {
            if (!_live(e)) return;
            const d = _normDepth(e.depth);
            if (d === null) return;
            const r = _normRole(e.role);
            const k = d + ':' + r;
            if (!byKey.has(k)) byKey.set(k, { depth: d, role: r, arr: [] });
            byKey.get(k).arr.push(String(e.content).trim());
        });
        return [...byKey.values()]
            .map(o => ({ depth: o.depth, role: o.role, text: o.arr.join(SEP) }))
            .sort((a, b) => (b.depth - a.depth) || (b.role - a.role));
    }
    // 「最前面」那幾條
    function getPreText() {
        return list().filter(e => _live(e) && _normDepth(e.depth) === null).map(e => String(e.content).trim()).join(SEP);
    }
    // 全部開著的，不分位置（小劇場那種自己組 prompt 的地方用）
    function getText() {
        return list().filter(_live).map(e => String(e.content).trim()).join('\n\n──────\n\n');
    }

    // 批次撥開關。decide(entry) 回 undefined＝不碰；true/false＝該開/該關；{ want, label }＝同上，回報時用 label 當名字。
    // ⚠️ 邊界跟以前撥世界書那幾支一樣：只改 enabled，不寫內容。
    function apply(decide) {
        const out = { opened: [], closed: [], seen: [] };
        const arr = list();
        let dirty = false;
        arr.forEach(e => {
            let r;
            try { r = decide(e); } catch (err) { r = undefined; }
            if (r === undefined || r === null) return;
            const want = (typeof r === 'object') ? !!r.want : !!r;
            const label = (typeof r === 'object' && r.label) || e.name || '';
            out.seen.push(label);
            if ((e.enabled !== false) === want) return;
            e.enabled = want;
            dirty = true;
            (want ? out.opened : out.closed).push(label);
        });
        if (dirty && save(arr)) _refreshOpen();
        return out;
    }
    // 名字含 managed 其中之一的才動；on 裡的開、其餘關。契約同 OS_WORLDBOOK.setEnabledByTitle（回報用命中的關鍵字）
    function setEnabledByName(managed, on, adjust) {
        if (!Array.isArray(managed) || !managed.length) return { opened: [], closed: [], seen: [] };
        const onSet = on instanceof Set ? on : new Set(on || []);
        return apply(e => {
            const nm = String(e.name || '');
            const hit = managed.find(n => nm.includes(n));
            if (!hit) return undefined;
            let should = onSet.has(hit);
            if (typeof adjust === 'function') { try { should = !!adjust(nm, hit, should); } catch (err) {} }
            return { want: should, label: hit };
        });
    }

    // 哪些條目會被腳本自動撥：各腳本自己登記（它們有的比這支早載入，所以登記簿掛在 win 上）
    function autoLabels(name) {
        const nm = String(name || '');
        const out = [];
        (win.__VN_RULES_AUTO || []).forEach(r => {
            try { if (r && typeof r.test === 'function' && r.test(nm) && out.indexOf(r.label) < 0) out.push(r.label); } catch (e) {}
        });
        return out;
    }

    // ================================================================
    // 酒館注入
    // ================================================================
    let _undo = [];
    let _lastInjected = null;
    function _clearInjected() {
        _undo.forEach(f => { try { f(); } catch (e) {} });
        _undo = [];
    }
    function inject(dryRun) {
        _clearInjected();
        if (dryRun) return;                        // 空跑不注入（once 會被空跑吃掉）
        if (win.__AURELIA_SUMMARIZING) return;     // 大總結／小工具自己的生成，別塞 VN 寫法進去
        if (_isStandalone()) return;               // PWA 走 os_api_engine
        const TH = win.TavernHelper;
        if (!TH || !TH.injectPrompts) return;
        if (!hasAny()) return;                     // 還沒搬：酒館世界書照舊負責
        const parts = getDepthParts();
        const pre = getPreText();
        if (parts.length) {
            const r = TH.injectPrompts(parts.map(p => ({
                id: INJECT_ID + '_d' + p.depth + '_' + p.role,
                content: p.text,
                position: 'in_chat',
                depth: p.depth,
                role: ROLE_NAME[p.role]
            })), { once: true });
            if (r && typeof r.uninject === 'function') _undo.push(r.uninject);
        }
        if (pre) {
            let ctx = null;
            try { ctx = (win.SillyTavern && win.SillyTavern.getContext) ? win.SillyTavern.getContext() : null; } catch (e) {}
            if (ctx && ctx.setExtensionPrompt) {
                // IN_PROMPT＝preset 主提示正後方（跟大總結同一個位置，os_summary_inject 對過酒館原始碼）
                ctx.setExtensionPrompt(INJECT_ID + '_pre', pre, 0, 0, false, 0);
                _undo.push(() => ctx.setExtensionPrompt(INJECT_ID + '_pre', '', 0, 0, false, 0));
            }
        }
        _lastInjected = {
            parts: parts.map(p => ({ depth: p.depth, role: ROLE_NAME[p.role], len: p.text.length })),
            preLen: pre.length
        };
    }
    function _hook() {
        if (!win.eventOn || !win.tavern_events) { setTimeout(_hook, 1000); return; }
        const ev = win.tavern_events;
        if (ev.GENERATION_STARTED) win.eventOn(ev.GENERATION_STARTED, function (type, opts, dryRun) { inject(dryRun); });
        // setExtensionPrompt 是持久值 → 生成一結束就撤，免得被後面別的生成吃進去
        if (ev.GENERATION_ENDED) win.eventOn(ev.GENERATION_ENDED, _clearInjected);
        if (ev.GENERATION_STOPPED) win.eventOn(ev.GENERATION_STOPPED, _clearInjected);
        if (ev.CHAT_CHANGED) win.eventOn(ev.CHAT_CHANGED, _clearInjected);
    }

    // ================================================================
    // 匯入
    // ================================================================
    // 酒館條目三種形狀都吃：getLorebookEntries（position 字串）、getWorldbook（position 物件）、酒館匯出的 JSON（position 數字，4＝@D）
    function _fromTavern(e) {
        if (!e) return null;
        const pos = e.position;
        let depth = null, role = 0, order = Number(e.order);
        if (pos && typeof pos === 'object') {
            if (String(pos.type || '') === 'at_depth') {
                depth = _normDepth(pos.depth); if (depth === null) depth = 0;
                role = ROLE_FROM[pos.role] || 0;
            }
            if (isNaN(order)) order = Number(pos.order);
        } else if (typeof pos === 'string') {
            const m = pos.match(/^at_depth_as_(system|user|assistant)$/);
            if (m) { depth = _normDepth(e.depth); if (depth === null) depth = 0; role = ROLE_FROM[m[1]]; }
        } else if (typeof pos === 'number') {
            if (pos === 4) { depth = _normDepth(e.depth); if (depth === null) depth = 0; role = _normRole(e.role); }
        }
        return {
            uid: e.uid != null ? e.uid : null,
            name: String(e.comment != null ? e.comment : (e.name || '')).trim() || '(未命名)',
            content: String(e.content || ''),
            enabled: e.disable === true ? false : e.enabled !== false,
            constant: e.constant === true || e.type === 'constant' || !!(e.strategy && e.strategy.type === 'constant'),
            depth: depth,
            role: role,
            order: isNaN(order) ? 100 : order
        };
    }
    function _itemsFromJson(data) {
        if (data && data.type === 'aurelia_vn_rules' && Array.isArray(data.entries)) {
            return data.entries.map((e, i) => ({
                uid: null, name: String((e && e.name) || '').trim() || '(未命名)', content: String((e && e.content) || ''),
                enabled: !e || e.enabled !== false, constant: true, depth: _normDepth(e && e.depth), role: _normRole(e && e.role), order: i
            }));
        }
        const raw = (data && data.entries) ? (Array.isArray(data.entries) ? data.entries : Object.values(data.entries))
                  : (Array.isArray(data) ? data : []);
        // 檔案裡的 uid 對不到酒館那本書，清掉免得拿去關錯條目
        return raw.map(e => { const it = _fromTavern(e); if (it) it.uid = null; return it; }).filter(Boolean);
    }
    // 預設勾哪些：常駐的＋會被腳本自動點燈的（手機、BGM 那組平常是關著等腳本開）。角色／CP 是世界設定，不勾。
    function _defaultPick(it) {
        if (/角色[｜|]/.test(it.name)) return false;
        return it.constant || autoLabels(it.name).length > 0;
    }
    // 同名的換掉內容與位置、留在原本的順序；新的照酒館 order 由小到大接在後面
    function importItems(items) {
        const arr = list();
        let added = 0, replaced = 0;
        (items || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0)).forEach(it => {
            const rec = { name: it.name, content: it.content, enabled: it.enabled !== false, depth: _normDepth(it.depth), role: _normRole(it.role) };
            const i = arr.findIndex(x => x.name === it.name);
            if (i >= 0) { Object.assign(arr[i], rec); replaced++; }
            else { arr.push(Object.assign({ id: _genId() }, rec)); added++; }
        });
        return save(arr) ? { added: added, replaced: replaced } : null;
    }

    async function _tavernBooks() {
        const H = win.TavernHelper;
        const out = [];
        const add = n => { const s = typeof n === 'string' ? n : (n && n.name); if (s && out.indexOf(s) < 0) out.push(s); };
        for (const fn of ['getWorldbookNames', 'getLorebooks', 'getWorldbooks']) {
            try { if (H && typeof H[fn] === 'function') ((await H[fn]()) || []).forEach(add); } catch (e) {}
        }
        return out;
    }
    async function _tavernEntries(book) {
        const H = win.TavernHelper;
        if (!H || !book) return [];
        try { if (typeof H.getLorebookEntries === 'function') return (await H.getLorebookEntries(book)) || []; } catch (e) {}
        try { if (typeof H.getWorldbook === 'function') return (await H.getWorldbook(book)) || []; } catch (e) {}
        return [];
    }
    // 搬過來的條目在世界書那邊關掉（只撥開關、內容不動），不然兩邊一起送
    async function _closeInTavernBook(book, items) {
        const H = win.TavernHelper;
        const uids = items.map(i => i.uid).filter(u => u != null);
        if (!H || !book || !uids.length) return 0;
        try {
            if (typeof H.setLorebookEntries === 'function') {
                await H.setLorebookEntries(book, uids.map(uid => ({ uid: uid, enabled: false })));
                return uids.length;
            }
            if (typeof H.updateWorldbookWith === 'function') {
                const set = new Set(uids);
                await H.updateWorldbookWith(book, l => { l.forEach(e => { if (set.has(e.uid)) e.enabled = false; }); return l; });
                return uids.length;
            }
        } catch (e) { console.warn('[VN指令] 關掉世界書條目失敗:', e); }
        return 0;
    }
    // PWA 的常駐書包裡同名的關掉（名字完全一樣才算，固定版／自由版名字互為前綴，不能用包含）
    async function _closeInPwaBook(names) {
        const DB = win.OS_DB;
        if (!DB || !DB.getAllWorldbookEntries || !DB.saveWorldbookEntry) return 0;
        const set = new Set(names);
        let n = 0;
        try {
            const all = (await DB.getAllWorldbookEntries()) || [];
            for (const e of all) {
                if (!e || e.enabled === false || !set.has(String(e.title || '').trim())) continue;
                await DB.saveWorldbookEntry(Object.assign({}, e, { enabled: false, updatedAt: Date.now() }));
                n++;
            }
        } catch (e) { console.warn('[VN指令] 關掉 PWA 世界書條目失敗:', e); }
        return n;
    }
    // 搬完讓那幾支自動開關立刻對一次，燈的狀態才會對上現在的世界／模式／產圖器
    async function _resyncAuto(reason) {
        try { const F = win.VN_FREE_MODE || window.VN_FREE_MODE; if (F && F.applyForCurrent) await F.applyForCurrent(true); } catch (e) {}
        try { const W = win.WORLD_RULES || window.WORLD_RULES; if (W && W.sync) await W.sync(reason); } catch (e) {}
        try { const A = win.OS_AVATAR_RULES_INJECTOR || window.OS_AVATAR_RULES_INJECTOR; if (A && A.sync) await A.sync(); } catch (e) {}
    }

    function exportFile() {
        const arr = list();
        if (!arr.length) { _toast('info', '還沒有 VN 指令可以匯出'); return; }
        const data = {
            type: 'aurelia_vn_rules', version: 1,
            entries: arr.map(e => ({ name: e.name, content: e.content, enabled: e.enabled !== false, depth: _normDepth(e.depth), role: _normRole(e.role) }))
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'vn_rules_' + new Date().toISOString().slice(0, 10) + '.json';
        (document.body || document.documentElement).appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // ================================================================
    // 畫面（手機工具「VN 指令」；殼沿用提示詞的 pm-*）
    // ================================================================
    let _openRoot = null;
    function _refreshOpen() {
        try { if (_openRoot && _openRoot.isConnected) _renderList(_openRoot); } catch (e) {}
    }
    function _posLabel(depth) {
        const d = _normDepth(depth);
        if (d === null) return '最前面';
        if (d === 0) return '最後';
        return '倒數第 ' + d + ' 則前';
    }
    // 🚨 別用 requestAnimationFrame 等下一幀再加 open：畫面沒在合成（視窗被蓋住、背景分頁）時它不會跑，
    //    頁面就永遠停在畫面外。先讀一次版面逼瀏覽器把「還沒 open」的位置算好，再加 class，一樣有滑入動畫。
    function _slideIn(modal) {
        void modal.offsetWidth;
        modal.classList.add('open');
    }
    function _fmtCount(n) { return n >= 10000 ? (Math.round(n / 1000) / 10) + ' 萬' : String(n); }

    function launch(container) {
        if (!container) return;
        container.innerHTML = `
            <div class="pm-wrap pm-vr-wrap">
                <div class="pm-header sysh">
                    <span class="pm-back-btn sysh-back pm-vr-home">‹</span>
                    <span class="pm-title sysh-title">VN 指令</span>
                    <div class="pm-header-actions sysh-acts">
                        <span class="pm-header-action sysh-act pm-vr-export" title="匯出"><i class="fa-solid fa-file-export"></i></span>
                        <span class="pm-header-action sysh-act pm-vr-import" title="匯入"><i class="fa-solid fa-file-import"></i></span>
                    </div>
                </div>
                <div class="pm-body pm-vr-body"></div>
            </div>`;
        const root = container.querySelector('.pm-vr-wrap');
        _openRoot = root;
        root.querySelector('.pm-vr-home').onclick = () => { const w = window.parent || window; if (w.PhoneSystem) w.PhoneSystem.goHome(); };
        root.querySelector('.pm-vr-export').onclick = exportFile;
        root.querySelector('.pm-vr-import').onclick = () => _openImport(root);
        _renderList(root);
    }

    function _renderList(root) {
        const body = root.querySelector('.pm-vr-body');
        if (!body) return;
        const d = root.ownerDocument || document;
        const keepTop = body.scrollTop;
        const arr = list();
        body.innerHTML = '';

        if (!arr.length) {
            body.innerHTML = `
                <div class="pm-empty pm-vr-empty">
                    <i class="fa-solid fa-feather-pointed pm-vr-empty-icon"></i>
                    <div>還沒有 VN 指令</div>
                    <button class="pm-vr-primary pm-vr-empty-import"><i class="fa-solid fa-file-import"></i> 匯入</button>
                    <button class="pm-add-btn pm-vr-empty-add">＋ 自己寫一條</button>
                </div>`;
            body.querySelector('.pm-vr-empty-import').onclick = () => _openImport(root);
            body.querySelector('.pm-vr-empty-add').onclick = () => _openEditor(root, null);
            return;
        }

        const onCount = arr.filter(e => e.enabled !== false).length;
        const chars = arr.filter(_live).reduce((s, e) => s + String(e.content).length, 0);
        const hd = d.createElement('div');
        hd.className = 'pm-vr-summary';
        hd.innerHTML = `
            <div class="pm-vr-stat"><b>${onCount}</b><span>開著</span></div>
            <div class="pm-vr-stat"><b>${arr.length - onCount}</b><span>關著</span></div>
            <div class="pm-vr-stat"><b>${_fmtCount(chars)}</b><span>字會送出</span></div>
            <button class="pm-add-btn pm-vr-add">＋ 新增</button>`;
        hd.querySelector('.pm-vr-add').onclick = () => _openEditor(root, null);
        body.appendChild(hd);

        const listEl = d.createElement('div');
        listEl.className = 'pm-vr-list';
        arr.forEach(e => {
            const item = d.createElement('div');
            item.className = 'pm-uni-item pm-vr-item' + (e.enabled === false ? ' is-off' : '');
            item.dataset.id = e.id;
            item.draggable = true;
            const autos = autoLabels(e.name);
            item.innerHTML = `
                <div class="pm-uni-head">
                    <span class="pm-uni-handle">⠿</span>
                    <input type="checkbox" class="pm-entry-toggle" ${e.enabled !== false ? 'checked' : ''}>
                    <div class="pm-vr-main">
                        <div class="pm-vr-name">${_esc(e.name || '(未命名)')}</div>
                        <div class="pm-vr-meta">
                            <span>${_posLabel(e.depth)}</span>
                            <span>${String(e.content || '').length} 字</span>
                            ${autos.length ? `<span class="pm-vr-auto"><i class="fa-solid fa-rotate"></i>${_esc(autos.join('、'))}</span>` : ''}
                        </div>
                    </div>
                    <button class="pm-icon-btn del pm-vr-del"><i class="fa-solid fa-trash-can"></i></button>
                </div>`;
            const tg = item.querySelector('.pm-entry-toggle');
            tg.onclick = ev => ev.stopPropagation();
            tg.onchange = () => {
                const all = list();
                const x = all.find(y => y.id === e.id);
                if (!x) return;
                x.enabled = tg.checked;
                if (save(all)) _renderList(root);
            };
            item.querySelector('.pm-vr-del').onclick = async ev => {
                ev.stopPropagation();
                const A = _aui();
                if (A && !(await A.confirm('刪除「' + (e.name || '(未命名)') + '」？'))) return;
                if (save(list().filter(y => y.id !== e.id))) _renderList(root);
            };
            item.addEventListener('click', ev => {
                if (ev.target.closest('.pm-entry-toggle, .pm-vr-del, .pm-uni-handle')) return;
                _openEditor(root, e.id);
            });
            _attachDrag(root, listEl, item, e.id);
            listEl.appendChild(item);
        });
        body.appendChild(listEl);
        body.scrollTop = keepTop;
    }

    function _attachDrag(root, listEl, item, id) {
        const d = root.ownerDocument || document;
        const clear = () => listEl.querySelectorAll('.pm-vr-item').forEach(i => i.classList.remove('drag-over'));
        const reorder = (fromId, toId) => {
            if (!fromId || !toId || fromId === toId) return;
            const arr = list();
            const fi = arr.findIndex(x => x.id === fromId), ti = arr.findIndex(x => x.id === toId);
            if (fi < 0 || ti < 0) return;
            const moved = arr.splice(fi, 1)[0];
            arr.splice(ti, 0, moved);
            if (save(arr)) _renderList(root);
        };
        item.addEventListener('dragstart', e => { item.classList.add('dragging'); e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; });
        item.addEventListener('dragend', () => { item.classList.remove('dragging'); clear(); });
        item.addEventListener('dragover', e => { e.preventDefault(); clear(); item.classList.add('drag-over'); });
        item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
        item.addEventListener('drop', e => { e.preventDefault(); clear(); reorder(e.dataTransfer.getData('text/plain'), id); });
        // 手機只從把手拖：整張卡都能拖的話，滑清單就變成在搬條目
        const handle = item.querySelector('.pm-uni-handle');
        let ghost = null, active = false;
        handle.addEventListener('touchstart', () => {
            active = true;
            item.classList.add('dragging');
            ghost = item.cloneNode(true);
            ghost.classList.add('pm-vr-ghost');
            ghost.style.width = item.offsetWidth + 'px';
            ghost.style.left = '-9999px';
            ghost.style.top = '-9999px';
            d.body.appendChild(ghost);
        }, { passive: true });
        handle.addEventListener('touchmove', e => {
            if (!active) return;
            e.preventDefault();
            const t = e.touches[0];
            if (ghost) { ghost.style.left = (t.clientX - 20) + 'px'; ghost.style.top = (t.clientY - 30) + 'px'; }
            const el = d.elementFromPoint(t.clientX, t.clientY);
            const tgt = el && el.closest('.pm-vr-item');
            clear();
            if (tgt && tgt !== item) tgt.classList.add('drag-over');
        }, { passive: false });
        handle.addEventListener('touchend', e => {
            if (!active) return;
            active = false;
            item.classList.remove('dragging');
            if (ghost) { ghost.remove(); ghost = null; }
            const t = e.changedTouches[0];
            const el = d.elementFromPoint(t.clientX, t.clientY);
            const tgt = el && el.closest('.pm-vr-item');
            clear();
            if (tgt && tgt.dataset.id !== id) reorder(id, tgt.dataset.id);
        }, { passive: true });
    }

    function _openEditor(root, id) {
        const d = root.ownerDocument || document;
        let modal = root.querySelector('.pm-vr-emodal');
        if (!modal) {
            modal = d.createElement('div');
            modal.className = 'pm-bmodal pm-emodal pm-vr-emodal';
            root.appendChild(modal);
        }
        const cur = id ? list().find(x => x.id === id) : null;
        if (id && !cur) return;
        const e = cur || { name: '', content: '', enabled: true, depth: 0, role: 0 };
        const dep = _normDepth(e.depth);
        const opts = ['<option value="pre"' + (dep === null ? ' selected' : '') + '>最前面</option>'];
        for (let i = 0; i <= 10; i++) opts.push('<option value="' + i + '"' + (dep === i ? ' selected' : '') + '>' + _posLabel(i) + '</option>');
        if (dep !== null && dep > 10) opts.push('<option value="' + dep + '" selected>' + _posLabel(dep) + '</option>');

        modal.innerHTML = `
            <div class="pm-bmodal-hd">
                <button class="pm-bmodal-back">‹</button>
                <span class="pm-bmodal-title">${cur ? '編輯' : '新增'}</span>
                <button class="pm-bundle-save pm-vr-save">保存</button>
            </div>
            <div class="pm-bmodal-body pm-entry-edit">
                <input class="pm-entry-name-input" type="text" placeholder="名稱" value="${_esc(e.name)}">
                <label class="pm-vr-pos-row"><span>放在</span><select class="pm-vr-pos">${opts.join('')}</select></label>
                <textarea class="pm-entry-ta" placeholder="內容">${_esc(e.content)}</textarea>
            </div>`;

        const close = () => modal.classList.remove('open');
        modal.querySelector('.pm-bmodal-back').onclick = close;
        modal.querySelector('.pm-vr-save').onclick = () => {
            const name = modal.querySelector('.pm-entry-name-input').value.trim() || '(未命名)';
            const content = modal.querySelector('.pm-entry-ta').value;
            const pv = modal.querySelector('.pm-vr-pos').value;
            const depth = pv === 'pre' ? null : _normDepth(pv);
            const arr = list();
            if (cur) {
                const x = arr.find(y => y.id === cur.id);
                if (x) Object.assign(x, { name: name, content: content, depth: depth });
            } else {
                arr.push({ id: _genId(), name: name, content: content, enabled: true, depth: depth, role: 0 });
            }
            if (!save(arr)) return;
            close();
            _renderList(root);
        };
        _slideIn(modal);
    }

    function _openImport(root) {
        const d = root.ownerDocument || document;
        let modal = root.querySelector('.pm-vr-imodal');
        if (!modal) {
            modal = d.createElement('div');
            modal.className = 'pm-bmodal pm-vr-imodal';
            root.appendChild(modal);
        }
        const inTavern = !_isStandalone() && !!win.TavernHelper;
        modal.innerHTML = `
            <div class="pm-bmodal-hd">
                <button class="pm-bmodal-back">‹</button>
                <span class="pm-bmodal-title">匯入</span>
            </div>
            <div class="pm-bmodal-body">
                <div class="pm-vr-src">
                    ${inTavern ? '<select class="pm-vr-book"></select>' : ''}
                    <button class="pm-add-btn pm-vr-file-btn"><i class="fa-solid fa-file-arrow-up"></i> 從檔案</button>
                    <input type="file" accept=".json" class="pm-vr-file" hidden>
                </div>
                <div class="pm-vr-ilist"></div>
            </div>
            <div class="pm-vr-ifoot">
                <div class="pm-vr-inote"></div>
                <button class="pm-vr-primary pm-vr-go" disabled>搬進來</button>
            </div>`;

        const listEl = modal.querySelector('.pm-vr-ilist');
        const goBtn = modal.querySelector('.pm-vr-go');
        const noteEl = modal.querySelector('.pm-vr-inote');
        const state = { kind: '', book: '', items: [], picks: [] };
        const close = () => modal.classList.remove('open');
        modal.querySelector('.pm-bmodal-back').onclick = close;

        const refreshGo = () => {
            const n = state.picks.filter(Boolean).length;
            goBtn.disabled = !n;
            goBtn.textContent = n ? ('搬進來 ' + n + ' 條') : '搬進來';
        };
        const renderItems = (emptyText) => {
            const have = new Set(list().map(x => x.name));
            listEl.innerHTML = '';
            if (!state.items.length) {
                listEl.innerHTML = '<div class="pm-staging-empty">' + _esc(emptyText) + '</div>';
                refreshGo();
                return;
            }
            state.items.forEach((it, i) => {
                const row = d.createElement('label');
                row.className = 'pm-vr-irow' + (it.enabled ? '' : ' is-off');
                row.innerHTML = `
                    <input type="checkbox" class="pm-entry-toggle" ${state.picks[i] ? 'checked' : ''}>
                    <div class="pm-vr-main">
                        <div class="pm-vr-name">${_esc(it.name)}</div>
                        <div class="pm-vr-meta">
                            <span>${_posLabel(it.depth)}</span>
                            <span>${it.content.length} 字</span>
                            ${it.enabled ? '' : '<span>原本關著</span>'}
                            ${have.has(it.name) ? '<span class="pm-vr-same"><i class="fa-solid fa-right-left"></i>換掉同名的</span>' : ''}
                        </div>
                    </div>`;
                row.querySelector('input').onchange = ev => { state.picks[i] = ev.target.checked; refreshGo(); };
                listEl.appendChild(row);
            });
            refreshGo();
        };
        const useItems = (kind, book, items, emptyText) => {
            state.kind = kind;
            state.book = book;
            state.items = items;
            state.picks = items.map(_defaultPick);
            if (kind === 'tavern') noteEl.textContent = '搬過來的條目，世界書裡會關掉，內容不動';
            else if (_isStandalone()) noteEl.textContent = '搬過來的條目，世界書裡同名的會關掉';
            else noteEl.textContent = '';
            renderItems(emptyText);
        };

        // 酒館：選一本世界書
        const bookSel = modal.querySelector('.pm-vr-book');
        if (bookSel) {
            const loadBook = async (book) => {
                listEl.innerHTML = '<div class="pm-staging-empty">讀取中…</div>';
                const raw = await _tavernEntries(book);
                useItems('tavern', book, raw.map(_fromTavern).filter(Boolean), '這本世界書沒有條目');
            };
            _tavernBooks().then(names => {
                if (!names.length) { bookSel.innerHTML = '<option value="">找不到世界書</option>'; useItems('', '', [], '找不到世界書，可以從檔案匯入'); return; }
                const pick = names.find(n => /VN/i.test(n)) || names[0];
                bookSel.innerHTML = names.map(n => '<option value="' + _esc(n) + '"' + (n === pick ? ' selected' : '') + '>' + _esc(n) + '</option>').join('');
                loadBook(pick);
            });
            bookSel.onchange = () => { if (bookSel.value) loadBook(bookSel.value); };
        } else {
            useItems('', '', [], '選一個檔案：酒館匯出的世界書，或這裡匯出的 VN 指令');
        }

        // 從檔案
        const fileIn = modal.querySelector('.pm-vr-file');
        modal.querySelector('.pm-vr-file-btn').onclick = () => fileIn.click();
        fileIn.onchange = () => {
            const f = fileIn.files && fileIn.files[0];
            fileIn.value = '';
            if (!f) return;
            const reader = new FileReader();
            reader.onload = () => {
                let items = [];
                try { items = _itemsFromJson(JSON.parse(String(reader.result || '').replace(/^﻿/, ''))); }
                catch (e) { _toast('error', '這個檔案讀不懂'); return; }
                if (bookSel) bookSel.value = '';
                useItems('file', '', items, '檔案裡沒有條目');
            };
            reader.readAsText(f);
        };

        goBtn.onclick = async () => {
            const chosen = state.items.filter((it, i) => state.picks[i]);
            if (!chosen.length) return;
            goBtn.disabled = true;
            const r = importItems(chosen);
            if (!r) { goBtn.disabled = false; return; }
            let closed = 0;
            if (state.kind === 'tavern') closed = await _closeInTavernBook(state.book, chosen);
            else if (_isStandalone()) closed = await _closeInPwaBook(chosen.map(c => c.name));
            await _resyncAuto('匯入 VN 指令');
            _toast('success', '搬進來 ' + chosen.length + ' 條' + (closed ? '，世界書裡關掉 ' + closed + ' 條' : ''));
            close();
            _renderList(root);
        };

        _slideIn(modal);
    }

    win.OS_VN_RULES = {
        list: list, save: save, hasAny: hasAny,
        getDepthParts: getDepthParts, getPreText: getPreText, getText: getText,
        apply: apply, setEnabledByName: setEnabledByName, autoLabels: autoLabels,
        importItems: importItems, exportFile: exportFile,
        inject: inject,
        launch: launch, launchApp: launch,
        get lastInjected() { return _lastInjected; }
    };
    window.OS_VN_RULES = win.OS_VN_RULES;
    _hook();
    console.log('🪶 [VN指令] 模組就緒');
})();
