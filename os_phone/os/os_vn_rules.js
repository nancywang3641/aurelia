// ----------------------------------------------------------------
// [檔案] os_vn_rules.js — VN 指令（程式內建的 VN 主 prompt）
// 路徑：os_phone/os/os_vn_rules.js
// 職責：VN 面板靠它產出能解析的格式——正文格式與 TAG 總綱、SFX、BGM、手機／戰鬥模組、頭像規則。
//   內容在 os_vn_rules_data.js，跟著程式走：沒有匯入匯出、沒有編輯畫面，要改就改那支檔案。
//   以前住三個地方各改各的：酒館全域世界書「-VN小說家-」、os_prompts 寫死給 PWA 的總綱、PWA 常駐書包。
//   ・酒館：GENERATION_STARTED → injectPrompts（倒數第 N 則前）／setExtensionPrompt（最前面），生成完就撤
//   ・PWA：os_api_engine 組 VN context 時把 getDepthParts() 併進世界書 @D 那批；「最前面」的走面板提示詞那格
//   ・自由模式／世界題材／頭像產圖只撥開關，狀態記在這台裝置（os_vn_rules_on）；內容永遠是程式裡那份
//   ・角色、CP 關係、內容偏好不放這裡：那些是世界設定或個人偏好，留在世界書
//   ・第一次載入：把世界書裡跟內建條目「同名」的關掉（只做一次、只撥開關），不然會送兩份
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;

    const STATE_KEY = 'os_vn_rules_on';             // { id: true/false }：被撥過的才記，沒記的用出廠值
    const MIGRATE_KEY = 'os_vn_rules_book_off_v1';  // 世界書同名條目已經關過
    const INJECT_ID = 'aurelia_vn_rules';
    const ROLE_NAME = { 0: 'system', 1: 'user', 2: 'assistant' };
    const SEP = '\n\n';

    // 126c44a 那一版是可編輯、要匯入的副本，已經不用
    try { localStorage.removeItem('os_vn_rules'); } catch (e) {}

    function _toast(kind, msg, title) {
        try { const A = win.AUI || window.AUI; const t = A && A.toastr; if (t && t[kind]) t[kind](msg, title); } catch (e) {}
    }
    function _isStandalone() { try { return !!(win.OS_API && win.OS_API.isStandalone && win.OS_API.isStandalone()); } catch (e) { return false; } }
    function _normDepth(d) {
        if (d === null || d === undefined || d === '') return null;
        const n = parseInt(d, 10);
        return (isNaN(n) || n < 0) ? null : n;
    }
    function _normRole(r) { return (r === 1 || r === 2) ? r : 0; }

    // ================================================================
    // 資料
    // ================================================================
    function _data() {
        const d = win.OS_VN_RULES_DATA || window.OS_VN_RULES_DATA;
        return Array.isArray(d) ? d : [];
    }
    function _loadState() {
        try { const s = JSON.parse(localStorage.getItem(STATE_KEY) || '{}'); return (s && typeof s === 'object') ? s : {}; }
        catch (e) { return {}; }
    }
    function _saveState(s) {
        try { localStorage.setItem(STATE_KEY, JSON.stringify(s || {})); return true; }
        catch (e) { console.warn('[VN指令] 開關狀態存不進去:', e); return false; }
    }

    function list() {
        const st = _loadState();
        return _data().map(d => ({
            id: d.id,
            name: d.name,
            content: String(d.content || ''),
            depth: _normDepth(d.depth),
            role: _normRole(d.role),
            enabled: Object.prototype.hasOwnProperty.call(st, d.id) ? st[d.id] !== false : d.on !== false
        }));
    }
    function hasAny() { return _data().length > 0; }
    const _live = e => !!(e && e.enabled && e.content.trim());

    // 設了位置的：[{ depth, role, text }]，深度大的排前面（呼叫端由大到小插），形狀跟 OS_WORLDBOOK.getContextParts 的 depths 一樣
    function getDepthParts() {
        const byKey = new Map();
        list().forEach(e => {
            if (!_live(e) || e.depth === null) return;
            const k = e.depth + ':' + e.role;
            if (!byKey.has(k)) byKey.set(k, { depth: e.depth, role: e.role, arr: [] });
            byKey.get(k).arr.push(e.content.trim());
        });
        return [...byKey.values()]
            .map(o => ({ depth: o.depth, role: o.role, text: o.arr.join(SEP) }))
            .sort((a, b) => (b.depth - a.depth) || (b.role - a.role));
    }
    // 「最前面」那幾條
    function getPreText() {
        return list().filter(e => _live(e) && e.depth === null).map(e => e.content.trim()).join(SEP);
    }
    // 全部開著的，不分位置（小劇場那種自己組 prompt 的地方用）
    function getText() {
        return list().filter(_live).map(e => e.content.trim()).join('\n\n──────\n\n');
    }

    // 批次撥開關。decide(entry) 回 undefined＝不碰；true/false＝該開/該關；{ want, label }＝同上，回報時用 label 當名字。
    function apply(decide) {
        const out = { opened: [], closed: [], seen: [] };
        const st = _loadState();
        let dirty = false;
        list().forEach(e => {
            let r;
            try { r = decide(e); } catch (err) { r = undefined; }
            if (r === undefined || r === null) return;
            const want = (typeof r === 'object') ? !!r.want : !!r;
            const label = (typeof r === 'object' && r.label) || e.name || '';
            out.seen.push(label);
            if (e.enabled === want) return;
            st[e.id] = want;
            dirty = true;
            (want ? out.opened : out.closed).push(label);
        });
        if (dirty) _saveState(st);
        return out;
    }
    // 名字含 managed 其中之一的才動；on 裡的開、其餘關。回報用命中的關鍵字
    function setEnabledByName(managed, on, adjust) {
        if (!Array.isArray(managed) || !managed.length) return { opened: [], closed: [], seen: [] };
        const onSet = on instanceof Set ? on : new Set(on || []);
        return apply(e => {
            const hit = managed.find(n => e.name.includes(n));
            if (!hit) return undefined;
            let should = onSet.has(hit);
            if (typeof adjust === 'function') { try { should = !!adjust(e.name, hit, should); } catch (err) {} }
            return { want: should, label: hit };
        });
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

    // ================================================================
    // 第一次載入：世界書裡同名的關掉
    // ================================================================
    // 酒館：全域掛著的＋這張卡掛的＋名叫 -VN小說家- 的那本（沒掛也查，搬過來以前內建條目就住那裡）
    async function _tavernBooksToCheck(H) {
        const out = [];
        const add = n => { const s = typeof n === 'string' ? n : (n && n.name); if (s && out.indexOf(s) < 0) out.push(s); };
        try { if (H.getGlobalWorldbookNames) ((await H.getGlobalWorldbookNames()) || []).forEach(add); } catch (e) {}
        try { const st = H.getLorebookSettings ? await H.getLorebookSettings() : null; ((st && st.selected_global_lorebooks) || []).forEach(add); } catch (e) {}
        try { const c = H.getCharLorebooks ? await H.getCharLorebooks() : null; if (c) { add(c.primary); (c.additional || []).forEach(add); } } catch (e) {}
        try {
            const fn = H.getWorldbookNames || H.getLorebooks;
            const all = fn ? ((await fn.call(H)) || []) : [];
            if (all.some(n => (typeof n === 'string' ? n : (n && n.name)) === '-VN小說家-')) add('-VN小說家-');
        } catch (e) {}
        return out;
    }
    // 回 true＝做完了（有沒有關到都算）；false＝還沒就緒，等一下再試
    async function _closeSameNameOnce() {
        try { if (localStorage.getItem(MIGRATE_KEY)) return true; } catch (e) { return true; }
        const names = new Set(_data().map(d => String(d.name || '').trim()));
        if (!names.size) return false;
        let closed = 0;
        const where = [];
        if (_isStandalone()) {
            const DB = win.OS_DB;
            if (!DB || !DB.getAllWorldbookEntries || !DB.saveWorldbookEntry) return false;
            const all = (await DB.getAllWorldbookEntries()) || [];
            for (const e of all) {
                // 名字完全一樣才算：固定版／自由版名字互為前綴，用「包含」會關錯
                if (!e || e.enabled === false || !names.has(String(e.title || '').trim())) continue;
                await DB.saveWorldbookEntry(Object.assign({}, e, { enabled: false, updatedAt: Date.now() }));
                closed++;
                const b = e.book || '世界書';
                if (where.indexOf(b) < 0) where.push(b);
            }
        } else {
            const H = win.TavernHelper;
            if (!H || typeof H.getLorebookEntries !== 'function' || typeof H.setLorebookEntries !== 'function') return false;
            for (const book of await _tavernBooksToCheck(H)) {
                let ents = [];
                try { ents = (await H.getLorebookEntries(book)) || []; } catch (e) { continue; }
                const ups = ents
                    .filter(e => e && e.enabled !== false && names.has(String(e.comment || '').trim()))
                    .map(e => ({ uid: e.uid, enabled: false }));
                if (!ups.length) continue;
                try { await H.setLorebookEntries(book, ups); closed += ups.length; where.push(book); }
                catch (e) { console.warn('[VN指令] 關掉「' + book + '」同名條目失敗:', e); }
            }
        }
        try { localStorage.setItem(MIGRATE_KEY, String(Date.now())); } catch (e) {}
        if (closed) {
            console.log('🪶 [VN指令] 世界書同名條目已關掉 ' + closed + ' 條：' + where.join('、'));
            _toast('info', '「' + where.join('、') + '」裡同名的 ' + closed + ' 條已關掉，內容沒動', 'VN 指令改由程式內建');
        }
        return true;
    }
    function _scheduleCloseSameName(tries) {
        setTimeout(async () => {
            let done = false;
            try { done = await _closeSameNameOnce(); } catch (e) { console.warn('[VN指令] 關世界書同名條目失敗:', e); done = true; }
            if (!done && tries < 6) _scheduleCloseSameName(tries + 1);
        }, tries ? 5000 : 6000);
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

    win.OS_VN_RULES = {
        list: list, hasAny: hasAny,
        getDepthParts: getDepthParts, getPreText: getPreText, getText: getText,
        apply: apply, setEnabledByName: setEnabledByName,
        inject: inject,
        get lastInjected() { return _lastInjected; }
    };
    window.OS_VN_RULES = win.OS_VN_RULES;
    _hook();
    _scheduleCloseSameName(0);
    console.log('🪶 [VN指令] 模組就緒（' + _data().length + ' 條內建）');
})();
