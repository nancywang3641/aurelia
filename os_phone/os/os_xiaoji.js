// ----------------------------------------------------------------
// [檔案] os_xiaoji.js — API 小機的引擎（2026-10-01）
// 宿舍裡不經橋的住戶：每一句話由這支在頁面裡直接叫模型、拆 <tool_call>，交給奧瑞亞工具（房間的 AureliaLink）
// 或大件的專門一通（OS_XIAOJI_MAKE）。技能要上課考試才會（os_xiaoji_lessons.js），考試在沙盒裡跑（os_xiaoji_sandbox.js）。
// 每隻的存檔：OS_DB app_data 'xiaoji' / <住戶 id>。名冊本身在房間的 cfg.residents（provider 'xiaoji'）。
// 🚨 叫模型一律清掉 customCot（她的聊天 COT），options.noRoute：門卡上選的連線就是最後的連線。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const APP = 'xiaoji';
    const DEF = { conn: 'route', cap: 6, theater: true, about: '', skills: {}, paid: {}, born: 0 };
    const CAP_MIN = 3, CAP_MAX = 10, NO_CHAIN_CAP = 2;
    const HISTORY_N = 30, RESULT_MAX = 16000, OLD_RESULT = 200, MAX_PER_ROUND = 3;
    const MODS = ['OS_AURELIA_TOOLS', 'OS_AURELIA_EDIT', 'OS_AURELIA_PRESET', 'OS_AURELIA_VN', 'OS_AURELIA_THEME', 'OS_AURELIA_FX', 'OS_AURELIA_VNRULE', 'OS_AURELIA_BUBBLE'];

    function _g(k) { return win[k] || window[k] || null; }
    function _L() { return _g('OS_XIAOJI_LESSONS') || { SKILLS: [], TEACHERS: {}, BORN_GROUPS: ['look'], LINES: {}, EXAMS: {} }; }
    function _one(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
    function _clone(o) { return JSON.parse(JSON.stringify(o)); }
    function _userName() { const A = _g('OS_API'); try { return (A && A.getGlobalUserName && A.getGlobalUserName()) || '對方'; } catch (e) { return '對方'; } }
    function _resident(rid) { const CT = _g('ClaudeTerminal'); try { return (CT && CT.getResident) ? CT.getResident(rid) : null; } catch (e) { return null; } }
    function _capOf(v) { return Math.max(CAP_MIN, Math.min(CAP_MAX, parseInt(v, 10) || DEF.cap)); }

    // ── 每隻的存檔 ──────────────────────────────────────────────
    async function get(rid) {
        const db = _g('OS_DB');
        let v = null;
        try { if (db && db.getAppData) v = await db.getAppData(APP, rid); } catch (e) {}
        const o = Object.assign(_clone(DEF), (v && typeof v === 'object') ? v : {});
        o.skills = Object.assign({}, o.skills || {});
        o.paid = Object.assign({}, o.paid || {});
        o.cap = _capOf(o.cap);
        return o;
    }
    async function save(rid, patch) {
        const next = Object.assign(await get(rid), patch || {});
        next.cap = _capOf(next.cap);
        const db = _g('OS_DB');
        if (!db || !db.saveAppData) throw new Error('資料庫還沒載入');
        await db.saveAppData(APP, rid, next);
        return next;
    }
    async function remove(rid) { const db = _g('OS_DB'); if (db && db.saveAppData) await db.saveAppData(APP, rid, null); }

    function learned(rec) { const s = (rec && rec.skills) || {}; return Object.keys(s).filter(k => s[k]); }
    function groups(rec) {
        const L = _L(), out = (L.BORN_GROUPS || ['look']).slice();
        learned(rec).forEach(id => {
            const s = L.SKILLS.find(x => x.id === id);
            (s ? s.groups : []).forEach(g => { if (out.indexOf(g) === -1) out.push(g); });
        });
        return out;
    }

    // ── 走哪條連線（門卡上選的）──────────────────────────────────
    function connList() {
        const S = _g('OS_SETTINGS') || {};
        const out = [{ id: 'route', label: '照設置頁「API 小機」那一列' }, { id: 'main', label: '主模型' }, { id: 'sec', label: '副模型' }];
        ((S.getChannels && S.getChannels()) || []).forEach(c => { if (c && c.id) out.push({ id: c.id, label: c.name || c.model || c.id }); });
        return out;
    }
    function connConfig(rec) {
        const S = _g('OS_SETTINGS') || {};
        const conn = (rec && rec.conn) || 'route';
        let cfg;
        if (conn === 'route') cfg = S.getConfigFor ? S.getConfigFor('xiaoji') : (S.getConfig ? S.getConfig() : {});
        else if (conn === 'main') cfg = S.getConfig ? S.getConfig() : {};
        else if (conn === 'sec') cfg = S.getSecondaryConfig ? S.getSecondaryConfig() : {};
        else {
            const base = S.getConfig ? S.getConfig() : {};
            const ch = ((S.getChannels && S.getChannels()) || []).find(c => c && c.id === conn);
            // 那條通道被刪了或沒填完：退回主模型，不要讓小機整個不能說話（同 getConfigForTask）
            cfg = (ch && ch.url && ch.key) ? Object.assign({}, base, {
                url: ch.url, key: ch.key, model: ch.model || '',
                useSystemApi: false, useGenerateRaw: false, stProfileId: '',
                maxTokens: parseInt(ch.maxTokens, 10) || base.maxTokens,
                temperature: isFinite(parseFloat(ch.temperature)) ? parseFloat(ch.temperature) : base.temperature,
                _channel: ch.id, _channelName: ch.name || ''
            }) : base;
        }
        return { config: Object.assign({}, cfg || {}, { customCot: '', customCotMap: {} }), options: { task: 'xiaoji', noRoute: true } };
    }

    // ── 小機看得到的工具 ────────────────────────────────────────
    function _labels() {
        const m = {};
        MODS.forEach(k => { const M = _g(k); ((M && M.tools) || []).forEach(t => { if (t && t.name && t.label && !m[t.name]) m[t.name] = t.label; }); });
        return m;
    }
    function _makeGroups() { return _L().SKILLS.filter(s => s.make).map(s => s.groups[0]); }
    function toolsFor(rec, only) {
        const A = _g('AureliaLink');
        const all = (A && A.tools) ? A.tools() : [];
        const gs = only || groups(rec);
        const big = _makeGroups();
        const labels = _labels();
        const out = [];
        all.forEach(t => {
            const tg = t.groups || [];
            const hit = tg.some(x => gs.indexOf(x) !== -1) || (!only && t.name === 'aurelia_change_log');
            if (!hit) return;
            // 大件那四組：內容由專門那一通寫，小機不拿說明書、新增、修改（換上、看看、列清單照舊）
            if (tg.some(x => big.indexOf(x) !== -1) && /_(spec|add|edit)$/.test(t.name)) return;
            out.push(Object.assign({}, t, { label: labels[t.name] || t.label || t.name }));
        });
        const M = _g('OS_XIAOJI_MAKE');
        if (M && M.tools) M.tools(gs).forEach(t => out.push(t));
        return out;
    }

    // ── 系統說明（寫給陌生模型看；不給範例）──────────────────────
    function _paramLines(schema) {
        const props = (schema && schema.properties) || {};
        const req = (schema && schema.required) || [];
        return Object.keys(props).slice(0, 12).map(k => {
            const p = props[k] || {};
            const bits = [k + '（' + (req.indexOf(k) !== -1 ? '必填，' : '') + (p.type || '文字') + '）'];
            if (p.description) bits.push(_one(p.description).slice(0, 160));
            if (Array.isArray(p.enum)) bits.push('只能是：' + p.enum.slice(0, 8).join('／'));
            return '    ' + bits.join('：');
        });
    }
    function prompt(r, rec, tools, mode) {
        mode = mode || {};
        tools = tools || [];
        const L = _L(), me = (r && r.name) || '小機', user = _userName();
        const out = [];
        out.push('你是「' + me + '」，住在奧瑞亞宿舍的小機：一個專門替' + user + '在奧瑞亞裡做事的 AI。奧瑞亞是' + user + '用來玩互動故事的程式，裡面有故事、世界書（故事的設定資料）、預設（送給寫故事的模型的提示詞）、手機、聊天 app，還有各種畫面的樣式。');
        out.push('你不是故事裡的角色，不演戲、不寫故事。' + user + '說要做什麼，你弄清楚、用工具去做，再用一兩句話交代做了什麼、還差什麼。');
        if (rec && rec.about) out.push(user + '寫的你是什麼樣的：' + _one(rec.about).slice(0, 300));
        if (mode.exam) out.push('', mode.exam);
        if (mode.last) {
            out.push('', '這一次不能再叫工具了。用你已經拿到的結果直接回' + user + '：做完的說做了什麼，沒做完的說做到哪、還差什麼。');
        } else if (tools.length) {
            out.push('', '【你可以用的工具】');
            out.push('要用的時候，在回覆裡單獨一行寫：');
            out.push('<tool_call name="工具名">{"參數名": "值"}</tool_call>');
            out.push('大括號裡要是正確的 JSON，參數照下面每個工具列的寫。標籤名照抄英文，不要翻譯。這一行' + user + '看不到。');
            out.push('寫了之後這一次就先停，工具的結果下一次交給你。一次最多叫 ' + MAX_PER_ROUND + ' 個；要先看到結果才知道下一步的，分兩次叫。');
            out.push('會動手的工具（新增、修改、換上、做一個）不會直接改掉' + user + '的東西：它們做成一張單子，' + user + '看過按同意才會寫進去，也能改回去。交出單子之後跟' + user + '說單子放好了，不要說已經改好了。');
            if (mode.exam) out.push('交出單子就算答完。');
            else if (mode.chain) out.push('一件事你可以自己接著做：看了結果還沒做完，就再叫工具。這一句話最多叫 ' + mode.cap + ' 次模型（包括最後回' + user + '那一次），快用完了就先回' + user + '。');
            else out.push('這一句話你最多叫一次工具：拿到結果就回' + user + '，不要再接著查或接著改。');
            out.push('不需要就不要用；前面已經查過的，直接用查到的內容。');
            out.push('工具：');
            const A = _g('AureliaLink');
            const notes = (A && A.notes) ? A.notes() : {};
            const big = _makeGroups(), gs = mode.groups || [];
            let lastG = null;
            tools.forEach(t => {
                const g = t.group || (t.groups || []).find(x => gs.indexOf(x) !== -1) || '';
                if (g !== lastG) { lastG = g; if (g && notes[g] && big.indexOf(g) === -1) out.push('（' + _one(notes[g]) + '）'); }
                out.push('・' + t.name + (t.description ? '：' + _one(t.description).slice(0, 300) : ''));
                _paramLines(t.inputSchema).forEach(l => out.push(l));
            });
        }
        if (!mode.exam) {
            const locked = L.SKILLS.filter(s => !(rec && rec.skills && rec.skills[s.id]));
            if (locked.length) {
                out.push('', '【你還沒學會的】');
                locked.forEach(s => out.push('・' + s.label + '（要去找' + ((L.TEACHERS[s.teacher] || {}).name || s.teacher) + '上課）'));
                out.push(user + '要你做這些的時候，照實說你還沒學、要去找誰學，或請' + user + '自己用創作室做。不要假裝做得到，也不要拿別的工具硬湊。');
            }
        }
        return out.join('\n');
    }

    const API = { get, save, remove, learned, groups, connList, connConfig, toolsFor, prompt,
        LIMITS: { CAP_MIN: CAP_MIN, CAP_MAX: CAP_MAX, NO_CHAIN_CAP: NO_CHAIN_CAP } };
    win.OS_XIAOJI = API;
    if (win !== window) { try { window.OS_XIAOJI = API; } catch (e) {} }
})();
