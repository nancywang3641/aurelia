// ----------------------------------------------------------------
// [檔案] os_xiaoji_sandbox.js — 小機考試的沙盒（2026-10-01）
// 考試要用小機以後真的會用的那套工具，但不能碰她的真東西。做法：把那一組工具模組的原始碼再跑一份，
// 傳進一個假的 window（Proxy：資料來源那幾個全域換成練習資料，檢查函式照用真的）和一個假的 localStorage（Map），
// 模組一行都不用改；草稿、說明書憑證、單子全部落在假的那一份。
// 🚨 考試不叫 *_look：聊天 app 主題、泡泡的 look 會套到她正在用的聊天 app 上。
// 🚨 模組裡要是有人直接寫裸的全域（不經 win.）就會漏到真的那份 —— 預覽窗的 sandbox_check 會比對考前考後的 localStorage。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    function _g(k) { return win[k] || window[k] || null; }
    const FILES = { wb: 'os_aurelia_edit.js', preset: 'os_aurelia_preset.js', rule: 'os_aurelia_vnrule.js', vn: 'os_aurelia_vn.js', theme: 'os_aurelia_theme.js', bubble: 'os_aurelia_bubble.js', fx: 'os_aurelia_fx.js' };
    const GLOBAL = { wb: 'OS_AURELIA_EDIT', preset: 'OS_AURELIA_PRESET', rule: 'OS_AURELIA_VNRULE', vn: 'OS_AURELIA_VN', theme: 'OS_AURELIA_THEME', bubble: 'OS_AURELIA_BUBBLE', fx: 'OS_AURELIA_FX' };
    const _src = {};
    const clone = o => JSON.parse(JSON.stringify(o == null ? null : o));

    function _scriptUrl(file) {
        const docs = [document];
        try { if (win.document && win.document !== document) docs.push(win.document); } catch (e) {}
        for (const d of docs) {
            const s = Array.prototype.find.call(d.querySelectorAll('script[src]'), x => x.src.split('?')[0].endsWith('/' + file));
            if (s) return s.src;
        }
        return null;
    }
    async function _source(file) {
        if (_src[file]) return _src[file];
        const url = _scriptUrl(file);
        if (!url) throw new Error('找不到 ' + file + ' 是從哪裡載的');
        const r = await fetch(url);
        if (!r.ok) throw new Error('讀不到 ' + file + '（' + r.status + '）');
        return (_src[file] = await r.text());
    }
    function _fakeStorage() {
        const m = new Map();
        return {
            getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(String(k), String(v)); },
            removeItem: k => { m.delete(k); }, clear: () => m.clear(),
            key: i => Array.from(m.keys())[i] || null, get length() { return m.size; }, _map: m
        };
    }
    // 假 window：parent／window／self／top 都指回自己（模組開頭是 window.parent || window）；
    // 覆寫的全域用練習資料；模組掛自己的 API 落在假的這份；其他照讀真的（小寫的函式綁回真的 window，免得 Illegal invocation）
    function _fakeWindow(overrides, ls) {
        const own = {};
        const proxy = new Proxy(own, {
            get(t, k) {
                if (k === 'parent' || k === 'window' || k === 'self' || k === 'top') return proxy;
                if (k === 'localStorage') return ls;
                if (Object.prototype.hasOwnProperty.call(overrides, k)) return overrides[k];
                if (Object.prototype.hasOwnProperty.call(t, k)) return t[k];
                const v = win[k];
                return (typeof v === 'function' && /^[a-z]/.test(String(k))) ? v.bind(win) : v;
            },
            set(t, k, v) { t[k] = v; return true; }
        });
        return proxy;
    }
    async function load(group, overrides) {
        const ls = _fakeStorage();
        const fw = _fakeWindow(overrides || {}, ls);
        const src = await _source(FILES[group]);
        new Function('window', 'localStorage', src)(fw, ls);
        const api = fw[GLOBAL[group]];
        if (!api) throw new Error('沙盒裡沒有載到 ' + GLOBAL[group]);
        return { api: api, ls: ls, win: fw };
    }

    // 每一組要換掉的資料來源（練習資料從 OS_XIAOJI_LESSONS.EXAMS[…].data 來）
    function overridesFor(group, data) {
        data = data || {};
        const over = { TavernHelper: null, OS_API: Object.assign(Object.create(_g('OS_API') || {}), { isStandalone: () => true }) };
        if (group === 'wb') {
            const book = data.book || '練習書', entries = clone(data.entries || []);
            over.OS_WORLDBOOK = { lorebookApi: {
                getLorebookEntries: async b => (b === book ? clone(entries) : []),
                createLorebookEntries: async () => true, setLorebookEntries: async () => true, deleteLorebookEntries: async () => true
            } };
            over.OS_AURELIA_TOOLS = Object.assign(Object.create(_g('OS_AURELIA_TOOLS') || {}), { allBooks: async () => ({ names: [book], open: [book] }) });
        }
        if (group === 'preset') {
            let es = clone(data.entries || []), bs = clone(data.bundles || []);
            const RP = _g('OS_PROMPTS') || {};
            over.OS_PROMPTS = { getEntries: () => clone(es), getBundles: () => clone(bs), saveEntries: x => { es = clone(x); }, saveBundles: x => { bs = clone(x); },
                SYS_SLOTS: RP.SYS_SLOTS || {}, PANELS: RP.PANELS || [] };
        }
        if (group === 'rule') {
            const lists = clone(data.lists || []);
            over.OS_VN_RULES = { getLists: () => clone(lists), builtinState: () => [], quickState: () => ({ themes: [], theme: '' }), list: () => [],
                setList: () => true, setBuiltin: () => true, setQuick: () => true, setTheme: () => true };
        }
        if (group === 'vn' || group === 'fx') {
            over.OS_DB = Object.assign(Object.create(_g('OS_DB') || {}), {
                getAllVNTagTemplates: async () => [], saveVNTagTemplate: async () => true,
                getAllUITemplates: async () => [], saveUITemplate: async () => true, deleteUITemplate: async () => true
            });
        }
        if (group === 'fx') over.OS_FX = Object.assign(Object.create(_g('OS_FX') || {}), { listAll: () => [], isEnabled: () => false, builtinIds: () => [] });
        if (group === 'theme') {
            over.WX_THEME_PACK = Object.assign(Object.create(_g('WX_THEME_PACK') || {}), { load: async () => [], activeId: () => '' });
            const S = _g('OS_STUDIO') || {};
            over.OS_STUDIO = Object.assign(Object.create(S), { vnTheme: Object.assign(Object.create(S.vnTheme || {}), { gallery: () => [], saveGallery: () => true }) });
            over.VoidPhoneShell = { builtinThemes: () => [], getUserThemes: () => [], currentThemeId: () => '' };
            over.VN_Theme = Object.assign(Object.create(_g('VN_Theme') || {}), { getCss: () => '', getCurrentWorld: () => 'practice' });
        }
        if (group === 'bubble') {
            over.WX_BUBBLE_AI = Object.assign(Object.create(_g('WX_BUBBLE_AI') || {}), { galLoad: () => [], galSave: () => true });
            over.WX_BUBBLE_SETTINGS = Object.assign(Object.create(_g('WX_BUBBLE_SETTINGS') || {}), { getConfig: () => ({}) });
            over.WX_CONTACTS = { getAllCustomContacts: () => [] };
        }
        return over;
    }

    async function open(skillId, rid) {
        const L = _g('OS_XIAOJI_LESSONS') || { SKILLS: [], EXAMS: {} };
        const sk = L.SKILLS.find(s => s.id === skillId);
        if (!sk) throw new Error('沒有這門課');
        const group = skillId === 'chain' ? 'wb' : sk.groups[0];
        const ex = (L.EXAMS || {})[skillId] || {};
        const box = await load(group, overridesFor(group, ex.data));
        const api = box.api;
        const M = _g('OS_XIAOJI_MAKE');
        const tools = sk.make
            ? ((M && M.tools) ? M.tools([group]) : [])
            : (api.tools || []).filter(t => t.name !== 'aurelia_change_log' && !/_look$/.test(t.name))
                .map(t => ({ name: t.name, label: t.label || t.name, description: t.description, inputSchema: t.inputSchema, propose: !!t.propose, groups: [group] }));
        async function run(t, args) {
            if (t.make) return M.run(t.name, args, { rid: rid, mod: api });
            if (t.propose) {
                const r = await api.propose(t.name, args);
                return (r && r.ok && r.prop) ? { ok: true, text: '交出去了', prop: r.prop } : { ok: false, text: (r && r.text) || '沒有成功' };
            }
            return { ok: true, text: String(await api.run(t.name, args)) };
        }
        return { tools: tools, run: run, ls: box.ls, group: group };
    }

    const API = { open: open, load: load, overridesFor: overridesFor };
    win.OS_XIAOJI_SANDBOX = API;
    if (win !== window) { try { window.OS_XIAOJI_SANDBOX = API; } catch (e) {} }
})();
