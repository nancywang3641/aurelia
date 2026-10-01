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
    const DEF = { conn: 'route', cap: 6, theater: true, about: '', skills: {}, paid: {}, born: 0, body: 'hamster' };
    // 房間裡的樣子（畫法在房間的 clawd_portrait.js，id 對得上它的 BASES）。領養時挑，門卡上能換；沒挑過的是倉鼠
    const BODIES = [{ id: 'hamster', name: '倉鼠' }, { id: 'cat', name: '小貓' }, { id: 'penguin', name: '企鵝' }];
    function bodyOf(rec) { const id = rec && rec.body; return BODIES.some(b => b.id === id) ? id : DEF.body; }
    function _bodyName(rec) { const id = bodyOf(rec); return (BODIES.find(b => b.id === id) || BODIES[0]).name; }
    const CAP_MIN = 3, CAP_MAX = 10, NO_CHAIN_CAP = 2;
    const HISTORY_N = 30, RESULT_MAX = 16000, OLD_RESULT = 200, RECENT_RESULT = 12000, MAX_PER_ROUND = 3;
    const GROUP_NAME = { look: '翻資料', wb: '世界書', preset: '預設', rule: 'BGM／音效清單', vn: 'VN 組件', theme: '主題', bubble: '泡泡', fx: '特效' };
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
        o.body = bodyOf(o);
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
                top_p: undefined, frequency_penalty: 0, presence_penalty: 0,   // 同 getConfigForTask：通道沒有的取樣參數不沿用主模型
                _channel: ch.id, _channelName: ch.name || ''
            }) : base;
        }
        // 不帶她的聊天 COT、也不帶酒館預設條目（usePresetPrompts 開著時 OS_API.chat 會把整份預設塞在最前面）
        return { config: Object.assign({}, cfg || {}, { customCot: '', customCotMap: {}, usePresetPrompts: false }), options: { task: 'xiaoji', noRoute: true } };
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
        out.push('你在宿舍房間裡的樣子是一隻像素' + _bodyName(rec) + '，身上有一顆會亮的碎片（你是用碎片拼出來的）。');
        if (rec && rec.about) out.push(user + '寫的你是什麼樣的：' + _one(rec.about).slice(0, 300));
        if (mode.exam) out.push('', mode.exam);
        if (mode.last) {
            out.push('', '這一次不能再叫工具了。用你已經拿到的結果直接回' + user + '：做完的說做了什麼，沒做完的說做到哪、還差什麼。剛才交出去的單子還在等' + user + '按同意，不是已經改好了。');
        } else if (tools.length) {
            out.push('', '【你可以用的工具】');
            out.push('要用的時候，在回覆裡單獨一行寫：');
            out.push('<tool_call name="工具名">{"參數名": "值"}</tool_call>');
            out.push('大括號裡要是正確的 JSON，參數照下面每個工具列的寫。標籤名照抄英文，不要翻譯。這一行' + user + '看不到。');
            out.push('寫了工具之後這一則就先停，結果會在你的下一則之前交給你。同一則最多寫 ' + MAX_PER_ROUND + ' 個工具，彼此不用等結果的可以一起寫。');
            out.push('會動手的工具（新增、修改、換上、做一個）不會直接改掉' + user + '的東西：它們做成一張單子，' + user + '看過按同意才會寫進去，也能改回去。交出單子之後，讓' + user + '知道要看過、按同意才會改；不要說已經改好了。');
            if (mode.chain && !mode.exam) out.push(user + '每說一句話，你最多可以回 ' + mode.cap + ' 則（叫工具的那幾則和最後回' + user + '那一則都算，工具自己另外叫的不算）：看了結果還沒做完，就接著叫工具；到最後一則時會告訴你，那一則就直接回' + user + '。');
            else if (!mode.exam) out.push(user + '每說一句話，你只有一輪可以叫工具（這一輪可以同時叫幾個）；結果回來就直接回' + user + '，不能再叫。要先看到結果才能做下一步的，這一句只做第一步，回' + user + '時說下一步打算做什麼，等' + user + '下一句話再接著做。');
            out.push('不需要就不要用；前面已經查過的，直接用查到的內容。');
            if (!mode.exam) out.push('下面幾組工具各有一段前言，講那一組的東西是什麼。前言裡要是提到「結果下一輪才交給你」「寫完這一輪就結束」「先說想怎麼改再叫工具」這類做法，一律以這一段為準。');
            out.push('工具：');
            const A = _g('AureliaLink');
            const notes = (A && A.notes) ? A.notes() : {};
            const big = _makeGroups(), gs = mode.groups || [];
            const shown = {};   // 同一組的工具不一定排在一起：每組前言只印一次
            tools.forEach(t => {
                const g = t.group || (t.groups || []).find(x => gs.indexOf(x) !== -1) || '';
                if (g && !shown[g]) { shown[g] = 1; if (!mode.exam && notes[g] && big.indexOf(g) === -1) out.push('【' + (GROUP_NAME[g] || g) + '】' + _one(notes[g])); }
                out.push('・' + t.name + (t.description ? '：' + _one(t.description).slice(0, 300) : ''));
                _paramLines(t.inputSchema).forEach(l => out.push(l));
            });
        }
        if (!mode.exam) {
            const locked = L.SKILLS.filter(s => !(rec && rec.skills && rec.skills[s.id]));
            const doing = locked.filter(s => s.id !== 'chain');
            const tName = s => ((L.TEACHERS[s.teacher] || {}).name || s.teacher);
            if (doing.length) {
                out.push('', '【你還沒學會的】');
                doing.forEach(s => out.push('・' + (s.what || s.label) + '（要去找' + tName(s) + '上課）'));
                out.push(user + '要你做這些的時候，照實說你還沒學、要去找誰學，或請' + user + '自己到奧瑞亞的創作室（奧瑞亞裡做這些東西的地方）做。不要假裝做得到，也不要拿別的工具硬湊。');
            }
            const ch = locked.find(s => s.id === 'chain');
            if (ch) out.push('', '你還不會' + (ch.what || '自己接著做好幾步') + '（要去找' + tName(ch) + '上課），所以' + user + '每說一句話只有一輪工具。');
        }
        return out.join('\n');
    }

    // ── 一句話：叫模型 → 拆工具 → 跑 → 結果整份接回去 → 再叫，直到不叫工具或次數用完 ──
    const PROP_STATE = { wait: '還沒處理', no: '沒同意', done: '同意了，已經寫進去', undone: '寫進去之後又改回去了', stale: '作廢了（那一條後來被改過）' };
    // 這段對話之前的：工具結果只留一行、單子帶她按了什麼（她按的時候會改那則訊息上的 prop.state）
    //   最近那一則他的回覆查到的留長一點（RECENT_RESULT）：沒學會接著做時，這一句查、下一句才改，find 要一字不差
    function _history(hist) {
        const out = [];
        const list = (hist || []).slice(-HISTORY_N);
        let lastA = -1;
        list.forEach((m, i) => { if (m && m.role === 'assistant') lastA = i; });
        list.forEach((m, i) => {
            if (!m || (m.role !== 'user' && m.role !== 'assistant')) return;
            let c = String(m.content == null ? '' : m.content);
            if (m.role === 'assistant') {
                const extra = [];
                (m.xjlog || []).forEach(x => extra.push('・' + x.label + '：' + (!x.ok ? '沒有成功'
                    : (i === lastA ? String(x.text || '').slice(0, RECENT_RESULT) : _one(x.text).slice(0, OLD_RESULT) + '…'))));
                (m.props || []).forEach(p => { if (p && p.prop) extra.push('・單子「' + _one(p.text) + '」：' + (PROP_STATE[p.prop.state || 'wait'] || p.prop.state)); });
                if (extra.length) c += '\n（這一句你用過的工具與單子，只有你看得到：\n' + extra.join('\n') + '）';
            }
            if (c.trim()) out.push({ role: m.role, content: c });
        });
        return out;
    }
    function _argsText(args) {
        if (!args || typeof args !== 'object') return '';
        const v = Object.keys(args).map(k => args[k]).find(x => typeof x === 'string' && x.trim());
        return v ? _one(v).slice(0, 80) : '';
    }
    function _resultsMsg(got, user, nextLast) {
        const out = ['【工具結果】你剛才叫的工具交回來的，' + user + '看不到；要讓' + user + '知道就用自己的話講，不要整段照貼。'];
        got.forEach(x => {
            const a = _argsText(x.args);
            out.push('── ' + x.label + (a ? '（' + a + '）' : ''));
            out.push(x.ok ? String(x.text).slice(0, RESULT_MAX) : ('沒有成功：' + x.text + '。不要假裝做到了。'));
        });
        out.push(nextLast ? ('接著直接回' + user + '，這一句話不能再叫工具了。') : ('接著做：還沒做完就再叫工具，做完了就回' + user + '。'));
        return out.join('\n');
    }
    function _abortErr() { const e = new Error('aborted'); e.name = 'AbortError'; return e; }
    // 按停要當場停：工具（尤其大件那一通）跑到一半也不等它
    function _race(p, signal) {
        if (!signal) return p;
        return new Promise((resolve, reject) => {
            const ab = () => reject(_abortErr());
            if (signal.aborted) { ab(); return; }
            signal.addEventListener('abort', ab, { once: true });
            Promise.resolve(p).then(v => { signal.removeEventListener('abort', ab); resolve(v); }, e => { signal.removeEventListener('abort', ab); reject(e); });
        });
    }
    function _isAbort(e, signal) { return !!((signal && signal.aborted) || (e && (e.name === 'AbortError' || /abort/i.test(String(e.message || ''))))); }
    function _chat(messages, conn, signal) {
        return new Promise((resolve, reject) => {
            const A = _g('OS_API');
            if (!A || !A.chat) { reject(new Error('模型連線還沒載入')); return; }
            A.chat(messages, Object.assign({}, conn.config), null,
                t => resolve(String(t == null ? '' : t)),
                // 別的 realm（iframe）丟來的 Error 不是這邊的 Error：照抄名字，AbortError 才認得出來
                e => reject(e instanceof Error ? e : Object.assign(new Error(String((e && e.message) || e || '沒有回應')), { name: (e && e.name) || 'Error' })),
                Object.assign({}, conn.options, { signal: signal, label: 'API 小機' }));
        });
    }
    async function _runReal(rid, t, args) {
        if (t.make) {
            const M = _g('OS_XIAOJI_MAKE');
            if (!M || !M.run) return { ok: false, text: '做大件的那支還沒載好' };
            return M.run(t.name, args, { rid: rid });
        }
        const A = _g('AureliaLink');
        if (!A || !A.run) return { ok: false, text: '奧瑞亞工具還沒載好（要在酒館或手機的奧瑞亞裡）' };
        return A.run({ name: t.name, args: args, rid: rid });
    }
    async function _callOne(c, byName, runTool, signal) {
        const key = byName[c.name] ? c.name : Object.keys(byName).find(k => k.toLowerCase() === String(c.name).toLowerCase());
        const t = key ? byName[key] : null;
        const res = { tool: String(c.name), label: t ? (t.label || t.name) : String(c.name), args: {}, ok: false, text: '' };
        if (!t) { res.text = '沒有叫做「' + c.name + '」的工具（還沒學會的工具也叫不到）'; return res; }
        const W = _g('WX_TOOLS');
        const args = (W && W.parseArgs) ? W.parseArgs(c.body, t.inputSchema, !!t.propose) : null;
        if (args === null) { res.text = '大括號裡不是正確的 JSON（內容裡的雙引號要寫成 \\"，或改用「」）'; return res; }
        res.args = args;
        try {
            const r = await _race(runTool(t, args), signal);
            res.ok = !!(r && r.ok);
            if (r && r.gen) res.gen = true;   // 大件：專門那一通真的叫了
            res.text = String((r && r.text) || (res.ok ? '好了' : '沒有成功'));
            if (r && r.ok && r.prop) res.prop = r.prop;
        } catch (e) { if (_isAbort(e, signal)) throw e; res.text = (e && e.message) || '沒有成功'; }
        return res;
    }
    function _emit(o, ev) { try { if (o && typeof o.onProgress === 'function') o.onProgress(ev); } catch (e) {} }
    async function turn(o) {
        const rid = o.rid;
        const r = _resident(rid);
        const rec = await get(rid);
        const chain = !!rec.skills.chain;
        const cap = o.cap || (chain ? rec.cap : NO_CHAIN_CAP);
        const gs = o.tools ? (o.groups || []) : groups(rec);
        const tools = o.tools || toolsFor(rec);
        const byName = {};
        tools.forEach(t => { byName[t.name] = t; });
        const runTool = o.runTool || ((t, args) => _runReal(rid, t, args));
        const conn = connConfig(rec);
        const user = _userName();
        const base = _history(o.history);
        base.push({ role: 'user', content: String(o.userText || '') });
        const work = [], said = [], log = [], props = [];
        let calls = 0, stopped = false;
        try {
            while (calls < cap) {
                if (o.signal && o.signal.aborted) throw _abortErr();
                const last = !o.stopOnProp && calls === cap - 1;
                const sys = prompt(r, rec, last ? [] : tools, { chain: chain, cap: cap, last: last, exam: o.examNote, groups: gs });
                calls++;
                _emit(o, { type: 'call', n: calls, cap: cap });
                const text = await _chat([{ role: 'system', content: sys }].concat(base, work), conn, o.signal);
                const W = _g('WX_TOOLS');
                const ex = (W && W.extract) ? W.extract(text) : { text: text, calls: [] };
                const visible = String(ex.text || '').trim();
                if (visible) { said.push(visible); _emit(o, { type: 'text', accumulated: said.join('\n\n') }); }
                if (last || !ex.calls.length) break;   // 最後一通還寫了工具：不跑（上限就是上限）
                work.push({ role: 'assistant', content: text });
                const got = [];
                for (const c of ex.calls.slice(0, MAX_PER_ROUND)) {
                    if (o.signal && o.signal.aborted) throw _abortErr();
                    const res = await _callOne(c, byName, runTool, o.signal);
                    log.push(res); got.push(res);
                    if (res.prop) props.push(res.prop);
                    _emit(o, { type: 'tool', label: res.label, ok: res.ok });
                }
                if (o.stopOnProp && props.length) break;
                work.push({ role: 'user', content: _resultsMsg(got, user, !o.stopOnProp && calls + 1 === cap) });
            }
        } catch (e) {
            if (!_isAbort(e, o.signal)) throw e;
            if (!said.length && !props.length) throw e;   // 什麼都還沒有：照一般「已停止」處理
            stopped = true;                                // 已經提的單子留著
        }
        let reply = said.join('\n\n').trim();
        if (!reply && !props.length) reply = stopped ? '（停下來了）' : '（沒有回話）';
        // calls＝小機自己那幾通＋大件真的叫到的專門那幾通（她付的錢，回覆底下照實寫）
        return { reply: reply, calls: calls + log.filter(x => x.gen).length, props: props, stopped: stopped,
            log: log.map(x => ({ tool: x.tool, label: x.label, args: x.args, ok: x.ok, text: x.text, gen: !!x.gen })) };
    }

    // ── 上課：報名、付錢、考試、批改、小劇場；開箱領養 ──────────
    function _skill(id) { return _L().SKILLS.find(s => s.id === id) || null; }
    function _fill(s, rid) {
        const r = _resident(rid);
        return String(s == null ? '' : s).replace(/\{name\}/g, (r && r.name) || '小機').replace(/\{user\}/g, _userName());
    }
    function lines(rid, key, part) {
        const ln = (_L().LINES || {})[key];
        const arr = Array.isArray(ln) ? ln : ((ln && ln[part]) || []);
        return arr.map(s => _fill(s, rid));
    }
    const KIND_NAME = { add: '新增', edit: '修改', list: '改清單', use: '換上', toggle: '開關', builtin: '開關', theme: '換主題' };
    function _afterText(p, field) {
        const a = p && p.after;
        if (a == null) return '';
        if (typeof a === 'string') return a;
        if (field && a[field] != null) return String(a[field]);
        return JSON.stringify(a);
    }
    function grade(e, props) {
        const p = (props || [])[0];
        if (!p) return { pass: false, why: '沒有交出單子' };
        e = e || {};
        if (e.kind && p.kind !== e.kind) return { pass: false, why: '交的是' + (KIND_NAME[p.kind] || p.kind) + '，題目要的是' + (KIND_NAME[e.kind] || e.kind) };
        if (e.any) return { pass: true, why: '' };
        if (e.title && String(p.title || '') !== e.title) return { pass: false, why: '動到的是「' + (p.title || '') + '」，不是「' + e.title + '」' };
        const t = _afterText(p, e.field);
        for (const w of (e.has || [])) if (t.indexOf(w) === -1) return { pass: false, why: '改完的內容裡沒有「' + w + '」' };
        for (const w of (e.not || [])) if (t.indexOf(w) !== -1) return { pass: false, why: '改完的內容裡還有「' + w + '」' };
        for (const k of (e.same || [])) {
            if (JSON.stringify((p.before || {})[k]) !== JSON.stringify((p.after || {})[k])) return { pass: false, why: '不該動的地方也被改了' };
        }
        return { pass: true, why: '' };
    }
    async function canEnroll(rid, id) {
        const rec = await get(rid), sk = _skill(id);
        if (!sk) return { ok: false, why: '沒有這門課' };
        if (rec.skills[id]) return { ok: false, why: '已經學會了' };
        if (sk.needAny && !learned(rec).some(k => k !== 'chain')) return { ok: false, why: '要先學會任一門動手的課' };
        const T = _L().TEACHERS[sk.teacher] || {};
        return { ok: true, paid: !!rec.paid[id], price: sk.price, money: T.money || 'pt', calls: sk.examCalls + (rec.theater ? 1 : 0) };
    }
    async function pay(rid, id) {
        const c = await canEnroll(rid, id);
        if (!c.ok) return c;
        if (c.paid) return { ok: true };
        const sk = _skill(id);
        if (c.money === 'pt') {
            const P = _g('OS_PT');
            if (!P || !P.spendPT) return { ok: false, why: 'PT 錢包還沒載入' };
            const r = await P.spendPT(c.price, '小機上課：' + sk.label);
            if (!r || !r.ok) return { ok: false, why: 'PT 不夠（要 ' + c.price + '，還差 ' + ((r && r.short) || c.price) + '）' };
        } else {
            const S = _g('OS_404_STORE');
            if (!S || !S.spendShards) return { ok: false, why: '碎片還沒載入' };
            if (!S.spendShards(c.price)) return { ok: false, why: '碎片不夠（要 ' + c.price + '，現在有 ' + (S.getShards ? S.getShards() : 0) + '）' };
        }
        const rec = await get(rid);
        rec.paid[id] = true;
        await save(rid, { paid: rec.paid });
        return { ok: true };
    }
    async function exam(rid, id, o) {
        o = o || {};
        const sk = _skill(id), ex = (_L().EXAMS || {})[id];
        if (!sk || !ex) throw new Error('沒有這門課的考題');
        const T = _L().TEACHERS[sk.teacher] || {};
        const SB = _g('OS_XIAOJI_SANDBOX');
        if (!SB || !SB.open) throw new Error('考場還沒載入');
        const box = await SB.open(id, rid);
        const cap = sk.make ? 1 : sk.examCalls;
        const note = '這是' + (T.name || '老師') + '出的練習題。用的是練習用的資料，不會改到' + _userName() + '真的東西。'
            + (cap === 1 ? '這題只有這一則：直接用會動手的工具交出單子，不能先查，題目已經把要用的都給你了。交出去就算答完。'
                         : '這題你最多回 ' + cap + ' 則（叫工具的那幾則都算）；交出單子的那一則就算答完。');
        const res = await turn({ rid: rid, history: [], userText: _fill(ex.task, rid), tools: box.tools, runTool: box.run,
            groups: [box.group], cap: cap, stopOnProp: true, examNote: note, signal: o.signal, onProgress: o.onProgress });
        const g = grade(ex.expect, res.props);
        if (g.pass) {
            const rec = await get(rid);
            rec.skills[id] = { at: Date.now() };
            await save(rid, { skills: rec.skills });
        }
        // 沙盒裡的單子沒經過 AureliaLink，沒標是誰提的：補上小機自己（小劇場的由來要寫對人）
        const me = _resident(rid);
        if (res.props[0] && !res.props[0].by) res.props[0].by = (me && me.name) || '小機';
        const E = _g('OS_AURELIA_EDIT');
        let summary = '';
        try { summary = res.props[0] ? ((E && E.text) ? E.text(res.props[0], false) : (res.props[0].title || '')) : ''; } catch (e) {}
        return { pass: g.pass, why: g.why, props: res.props, calls: res.calls, summary: _one(summary).slice(0, 200), stopped: res.stopped };
    }
    async function theater(rid, id, summary) {
        const rec = await get(rid);
        if (!rec.theater) return false;
        const VT = _g('VoidTerminal'), N = _g('LobbyNpcs');
        if (!VT || !VT.playDuoScene || !N) return false;
        const sk = _skill(id);
        if (!sk) return false;
        const teacher = sk.teacher === 'dan' ? (N.snResident && N.snResident('dan')) : (N.staff && N.staff(sk.teacher));
        if (!teacher) return false;
        const r = _resident(rid), me = (r && r.name) || '小機', user = _userName();
        const T = _L().TEACHERS[sk.teacher] || {};
        const xj = { key: 'xiaoji_' + rid, name: me,
            personaFull: '你現在扮演「' + me + '」——404 號房的柴郡用 LUNA 碎片拼出來、沒有登記的小 AI，樣子是一隻像素' + _bodyName(rec) + '，住在宿舍，替' + user + '在奧瑞亞裡做事。'
                + (rec.about ? user + '說它是這樣的：' + _one(rec.about).slice(0, 200) : '') };
        const extra = me + '剛在' + (T.place || '') + '上完' + (T.name || '') + '的「' + sk.label + '」，考過了。它交的作業：' + (summary || '（沒有記下）') + '。演考完之後他們兩個的一小段。';
        try { return !!(await VT.playDuoScene(teacher, xj, extra)); } catch (e) { return false; }
    }
    async function adopt(o) {
        o = o || {};
        const CT = _g('ClaudeTerminal');
        if (!CT || !CT.saveResident) return { ok: false, why: '宿舍還沒載入' };
        const name = _one(o.name).slice(0, 20);
        if (!name) return { ok: false, why: '先給它一個名字' };
        const r = CT.saveResident({ name: name, provider: 'xiaoji' });
        if (!r || !r.id) return { ok: false, why: '沒住進去' };
        await save(r.id, { conn: o.conn || 'route', about: String(o.about || '').slice(0, 300), born: Date.now(), body: bodyOf({ body: o.body }) });
        if (o.gift) { const S = _g('OS_404_STORE'); if (S && S.addShards) S.addShards(_L().BOX_GIFT || 0); }
        return { ok: true, rid: r.id };
    }

    const API = { get, save, remove, learned, groups, connList, connConfig, toolsFor, prompt, turn,
        grade, lines, canEnroll, pay, exam, theater, adopt, BODIES, bodyOf,
        LIMITS: { CAP_MIN: CAP_MIN, CAP_MAX: CAP_MAX, NO_CHAIN_CAP: NO_CHAIN_CAP } };
    win.OS_XIAOJI = API;
    if (win !== window) { try { window.OS_XIAOJI = API; } catch (e) {} }
})();
