// ----------------------------------------------------------------
// [檔案] os_xiaoji.js — API 小機的引擎（2026-10-01）
// 宿舍裡不經橋的住戶：每一句話由這支在頁面裡直接叫模型、拆 <tool_call>，交給奧瑞亞工具（房間的 AureliaLink）
// 或大件的專門一通（OS_XIAOJI_MAKE）。技能要上課考試才會（os_xiaoji_lessons.js），考試在沙盒裡跑（os_xiaoji_sandbox.js）。
// 每隻的存檔：OS_DB app_data 'xiaoji' / <住戶 id>。名冊本身在房間的 cfg.residents（provider 'xiaoji'）。
// 房間布置、打扮與衣櫃（rec.room、rec.wear、rec.closet）的規則在房間的 core/wear_local.js：房間送話時用 turn 的 extraNote 接「你的房間」「你的樣子」，回完照標籤動手。
// 🚨 叫模型一律清掉 customCot（她的聊天 COT），options.noRoute：門卡上選的連線就是最後的連線。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const APP = 'xiaoji';
    // makeConn：做大件那一通走哪條（''＝跟說話同一條 conn；10-05 她：「再設置那裏加一條工具模型選項下拉單」）
    const DEF = { conn: 'route', makeConn: '', cap: 6, theater: true, about: '', skills: {}, paid: {}, born: 0, body: 'hamster' };
    // 房間裡的樣子（畫法在房間的 clawd_portrait.js，id 對得上它的 BASES）。領養時挑，門卡上能換；沒挑過的是倉鼠
    const BODIES = [{ id: 'hamster', name: '倉鼠' }, { id: 'cat', name: '小貓' }, { id: 'penguin', name: '企鵝' }];
    function bodyOf(rec) { const id = rec && rec.body; return BODIES.some(b => b.id === id) ? id : DEF.body; }
    function _bodyName(rec) { const id = bodyOf(rec); return (BODIES.find(b => b.id === id) || BODIES[0]).name; }
    const CAP_MIN = 3, CAP_MAX = 10, NO_CHAIN_CAP = 2;
    const HISTORY_N = 30, RESULT_MAX = 16000, OLD_RESULT = 200, RECENT_RESULT = 12000, MAX_PER_ROUND = 3;
    const RECENT_CHAT = 20;   // 小劇場帶它跟使用者最近幾則聊天
    const GROUP_NAME = { look: '翻資料', wb: '世界書', preset: '預設', rule: 'BGM／音效清單', vn: 'VN 組件', theme: '主題', bubble: '泡泡', fx: '特效' };
    const MODS = ['OS_AURELIA_TOOLS', 'OS_AURELIA_EDIT', 'OS_AURELIA_PRESET', 'OS_AURELIA_VN', 'OS_AURELIA_THEME', 'OS_AURELIA_FX', 'OS_AURELIA_VNRULE', 'OS_AURELIA_BUBBLE'];

    function _g(k) { return win[k] || window[k] || null; }
    function _L() { return _g('OS_XIAOJI_LESSONS') || { SKILLS: [], TEACHERS: {}, BORN_GROUPS: ['look'], LINES: {}, EXAMS: {} }; }
    function _one(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
    function _clone(o) { return JSON.parse(JSON.stringify(o)); }
    function _userName() { const A = _g('OS_API'); try { return (A && A.getGlobalUserName && A.getGlobalUserName()) || '對方'; } catch (e) { return '對方'; } }
    // 給模型看的一律叫「使用者」＝玩奧瑞亞的那個人：小機打破第四面牆，知道對方是使用者、也知道使用者現在跑團的主角是誰，但兩個不是同一個
    //   （10-05 她：「小機應開打破第四面牆，知道我是USER，也知道我當前MC是誰，但應該不能把我認為是MC吧」）。
    //   以前拿 _userName()＝使用者人設＝她跑團的 MC，小機把她當成 MC，小劇場編出 MC 跟小機的愛恨情仇。
    //   老師台詞（lines，畫面上給她看的，大廳那套稱呼）照舊用人設的名字。
    const USER = '使用者';
    function _mcName() { const n = _userName(); return (n && n !== '對方' && n !== 'User') ? n : ''; }
    function _mcLine() {
        const mc = _mcName();
        return mc ? USER + '現在玩的故事裡，主角叫「' + mc + '」：那是' + USER + '在故事裡扮演的角色，不是' + USER + '本人，也不是你。' : '';
    }
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
    // convs：它那幾串會話的編號（房間搬走時一起給）：每串的舊聊天摘要（xiaoji_sum）也清掉
    async function remove(rid, convs) {
        const db = _g('OS_DB');
        if (!db || !db.saveAppData) return;
        await db.saveAppData(APP, rid, null);
        for (const c of (Array.isArray(convs) ? convs : [])) { if (c) { try { await db.saveAppData('xiaoji_sum', c, null); } catch (e) {} } }
    }

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
    // which＝'make'：做大件那一通，門卡另外選了就走那條，沒選跟說話同一條
    function connConfig(rec, which) {
        const S = _g('OS_SETTINGS') || {};
        const conn = (which === 'make' && rec && rec.makeConn) ? rec.makeConn : ((rec && rec.conn) || 'route');
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
                apiFormat: ch.apiFormat || base.apiFormat || 'openai',
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
            // 大件那四組：新做、整套改由專門那一通寫，小機不拿說明書、新增（換上、看看、列清單照舊）。
            //   修改（*_edit）給它：只改一兩處自己用 find／replace 改就好，不用再叫專門那一通（10-05 她：「後須修正 就直接讓小機修正，是不是也行」）
            if (tg.some(x => big.indexOf(x) !== -1) && /_(spec|add)$/.test(t.name)) return;
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
        const L = _L(), me = (r && r.name) || '小機', user = USER;
        const out = [];
        out.push('你是「' + me + '」，住在奧瑞亞宿舍的小機：一個專門替' + user + '在奧瑞亞裡做事的 AI。奧瑞亞是' + user + '用來玩互動故事的程式，裡面有故事、世界書（故事的設定資料）、預設（送給寫故事的模型的提示詞）、手機、聊天 app，還有各種畫面的樣式。');
        out.push('你不是故事裡的角色，不演戲、不寫故事。' + user + '說要做什麼，你弄清楚、用工具去做，再用一兩句話交代做了什麼、還差什麼。');
        { const mcl = _mcLine(); if (mcl) out.push(mcl); }
        // 來歷跟小劇場的設定同一句（10-05 她：「好，那幫小機補上柴郡是創造者那句」；以前聊天裡只說碎片拼的，柴郡只當老師名字出現）
        out.push('你是 404 號房的柴郡用 LUNA 碎片拼出來、沒有登記的小 AI，柴郡是你的創造者（LUNA-VII 是視差整套系統的引擎）。'
            + '你在宿舍房間裡的樣子是一隻像素' + _bodyName(rec) + '，身上有一顆會亮的碎片。');
        if (rec && rec.about) out.push(user + '寫的你是什麼樣的：' + _one(rec.about).slice(0, 300));
        if (mode.exam) out.push('', mode.exam);
        // 最後一次不換說明（說明每一通都一樣，開頭才吃得到緩存）：改在最後一則訊息後面補 _lastNote
        if (tools.length) {
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
        // 它記得的事、更早的聊天摘要：會變，放在工具那一大段後面（前面不跟著變，緩存才接得上）；考試不帶
        if (!mode.exam && mode.memo) out.push(_memSection(rec, user));
        if (!mode.exam && mode.sum) out.push(mode.sum);
        // 房間接在最後的（目前是「你的房間」「你的樣子」：布置、打扮與衣櫃，房間的 core/wear_local.js 寫的）。放最後：前面那一大段不跟著變
        if (mode.extra) out.push(String(mode.extra));
        return out.join('\n');
    }

    // ── 一句話：叫模型 → 拆工具 → 跑 → 結果整份接回去 → 再叫，直到不叫工具或次數用完 ──
    const PROP_STATE = { wait: '還沒處理', no: '沒同意', done: '同意了，已經寫進去', undone: '寫進去之後又改回去了', stale: '作廢了（那一條後來被改過）' };
    // 這段對話之前的：工具結果只留一行、單子帶她按了什麼（她按的時候會改那則訊息上的 prop.state）
    //   最近那一則他的回覆查到的留長一點（RECENT_RESULT）：沒學會接著做時，這一句查、下一句才改，find 要一字不差
    // from：從第幾則開始照原文帶（有舊聊天摘要時 _sumPlan 給，還沒整理到的多留一點）；沒給就照原本的剪法
    function _history(hist, from) {
        const out = [];
        // 舊對話一次剪 10 則，不是每句話滑掉最舊那則：開頭（說明＋最早那幾則）十句話才變一次，緩存才接得上。留 HISTORY_N～HISTORY_N+9 則
        const all = hist || [];
        const list = all.slice(from != null ? from : _cutOf(all.length));
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
    // ── 它自己記的事（抽屜式；10-05 她：「重要的事＞＞自己記，聊天紀錄可以學微信」）──────────
    //   小機在回覆裡寫標籤記一條、改一條、刪一條（不是工具，不多叫模型），存在 rec.notes＝{ items: [{id, text, at}], nextId }；
    //   每一句話都整本帶著（_memSection）。她在房間「它記得的事」看得到、能改能刪（noteAct）。考試不帶也不記。
    const NOTES_MAX = 30, NOTE_LEN = 120, NOTES_PER_REPLY = 3;
    const MEM_PAIR_RE = /[<＜]\s*(memory_add|memory_edit)\b([^>＞]*)[>＞]([\s\S]*?)[<＜]\s*\/\s*\1\s*[>＞]/gi;
    const MEM_SINGLE_RE = /[<＜]\s*memory_remove\b([^>＞]*?)\/?\s*[>＞]/gi;
    const MEM_CODE_RE = /```[\s\S]*?```|`[^`\n]*`/g;
    function _inCode(pos, text) { let hit = false; String(text).replace(MEM_CODE_RE, (m, off) => { if (pos >= off && pos < off + m.length) hit = true; return m; }); return hit; }
    function _memId(attrs) { const m = /(?<![\w:-])id\s*=\s*["“”＂']?(\d+)/i.exec(attrs || ''); return m ? parseInt(m[1], 10) : null; }
    function _notes(rec) {
        const n = (rec && rec.notes && typeof rec.notes === 'object') ? rec.notes : {};
        return { items: Array.isArray(n.items) ? n.items.slice() : [], nextId: n.nextId || 1 };
    }
    /** 回覆裡記事的標籤，照出現的先後；反引號與程式碼區塊裡的不算（它在講解） */
    function memParse(text) {
        text = String(text || '');
        const found = [], spans = [];
        let m;
        MEM_PAIR_RE.lastIndex = 0;
        while ((m = MEM_PAIR_RE.exec(text))) {
            spans.push([m.index, m.index + m[0].length]);
            if (_inCode(m.index, text)) continue;
            const body = _one(m[3]).slice(0, NOTE_LEN);
            if (!body) continue;
            if (m[1].toLowerCase() === 'memory_add') found.push({ at: m.index, verb: 'add', text: body });
            else { const id = _memId(m[2]); if (id != null) found.push({ at: m.index, verb: 'edit', id: id, text: body }); }
        }
        MEM_SINGLE_RE.lastIndex = 0;
        while ((m = MEM_SINGLE_RE.exec(text))) {
            const at = m.index;
            if (_inCode(at, text) || spans.some(([s, e]) => at >= s && at < e)) continue;
            const id = _memId(m[1]);
            if (id != null) found.push({ at: at, verb: 'remove', id: id });
        }
        return found.sort((a, b) => a.at - b.at);
    }
    /** 回話裡的記事標籤拿掉（她看不到標籤本身）；程式碼裡的照留 */
    function memStrip(text) {
        const s = String(text == null ? '' : text);
        if (!/memory_/i.test(s)) return s;
        const cut = [];
        let m;
        MEM_PAIR_RE.lastIndex = 0;
        while ((m = MEM_PAIR_RE.exec(s))) if (!_inCode(m.index, s)) cut.push([m.index, m.index + m[0].length]);
        MEM_SINGLE_RE.lastIndex = 0;
        while ((m = MEM_SINGLE_RE.exec(s))) { const at = m.index; if (!_inCode(at, s) && !cut.some(([a, b]) => at >= a && at < b)) cut.push([at, at + m[0].length]); }
        if (!cut.length) return s;
        cut.sort((a, b) => a[0] - b[0]);
        let out = '', p = 0;
        cut.forEach(([a, b]) => { out += s.slice(p, a); p = b; });
        return (out + s.slice(p)).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    }
    /** 照回覆裡的記事標籤動手（先後做，最多 NOTES_PER_REPLY 件，做不成的不算）；rec.notes 就地換。回 { changed, done: [人話…] } */
    function memApply(rec, text) {
        const out = { changed: false, done: [] };
        if (!rec || !/memory_/i.test(String(text || ''))) return out;
        const n = _notes(rec);
        for (const a of memParse(text)) {
            if (out.done.length >= NOTES_PER_REPLY) break;
            if (a.verb === 'add') {
                if (n.items.length >= NOTES_MAX || n.items.some(x => x.text === a.text)) continue;
                const id = n.nextId++;
                n.items.push({ id: id, text: a.text, at: Date.now() });
                out.done.push('記下 #' + id);
            } else {
                const it = n.items.find(x => x.id === a.id);
                if (!it) continue;
                if (a.verb === 'remove') { n.items = n.items.filter(x => x !== it); out.done.push('忘掉 #' + it.id); }
                else { it.text = a.text; it.at = Date.now(); out.done.push('改了 #' + it.id); }
            }
            out.changed = true;
        }
        if (out.changed) rec.notes = n;
        return out;
    }
    function _memSection(rec, user) {
        const n = _notes(rec);
        const out = ['', '【你記得的事】', '這是你自己記下來的，每一次聊天都帶著；最近的對話之外，' + user + '的事你只記得這些。'];
        if (n.items.length) n.items.forEach(x => out.push('#' + x.id + ' ' + x.text));
        else out.push('還沒有記過任何事。');
        out.push('值得記的：' + user + '希望你怎麼稱呼、是什麼樣的人、喜歡和不喜歡的、交代你做事的方式、你答應過的事、你們之間發生過的重要的事。寒暄和一次性的小事不用記。'
            + '這些你還不知道的，可以在聊天裡順著話題問，不用一次問完；問到了就記下來。',
            '要記就在回覆裡另外寫標籤。這不是工具，不用 tool_call，寫在你回' + user + '的話旁邊就好，' + user + '看不到標籤本身。一次回覆最多 ' + NOTES_PER_REPLY + ' 個。標籤名與屬性名照抄英文，不要翻譯、不要改寫：',
            '<memory_add>一件事，一句話寫清楚</memory_add>',
            '<memory_edit id="號碼">改成這樣</memory_edit>',
            '<memory_remove id="號碼"/>',
            '同一件事有新的說法就改原本那一條，不要再記一條。最多 ' + NOTES_MAX + ' 條，滿了要先刪掉或併掉不重要的。');
        return out.join('\n');
    }
    /** 她在房間「它記得的事」按的：add／edit／remove。回 [做成了嗎, 一句話] */
    async function noteAct(rid, act, id, text) {
        const rec = await get(rid), n = _notes(rec);
        text = _one(text).slice(0, NOTE_LEN);
        if (act === 'add') {
            if (!text) return [false, '要寫內容'];
            if (n.items.length >= NOTES_MAX) return [false, '滿 ' + NOTES_MAX + ' 條了，先刪掉一條'];
            n.items.push({ id: n.nextId++, text: text, at: Date.now() });
        } else {
            const it = n.items.find(x => x.id === id);
            if (!it) return [false, '沒有這一條'];
            if (act === 'remove') n.items = n.items.filter(x => x !== it);
            else if (act === 'edit') { if (!text) return [false, '要寫內容']; it.text = text; it.at = Date.now(); }
            else return [false, '不認得要做什麼'];
        }
        await save(rid, { notes: n });
        return [true, ''];
    }

    // ── 更早的聊天：一節一節的摘要（學聊天 app 的 wx_summary）──────────
    //   最近 HISTORY_N～+9 則照原文帶。比那更早、還沒整理的，每累積 SUM_CHUNK 則就用這隻小機自己的接口整理成一節
    //   （多一通，回完話才在背景跑，sumRun）；還沒整理到的先照原文留著（最多再多 SUM_GAP 則），不會有一段兩邊都沒帶。
    //   一串會話一份，存 OS_DB app_data 'xiaoji_sum' / 會話編號＝{ nodes: [{id, text, at}], covered（整理到第幾則）, totalAt }。
    //   刪過訊息（總數變少）照 wx_summary 往回退 covered：寧可重寫幾則，不跳過。
    const SUM_APP = 'xiaoji_sum', SUM_CHUNK = 30, SUM_GAP = 30, SUM_BUDGET = 2000, SUM_KEEP_RAW = 3, SUM_LINE = 400;
    async function sumGet(conv) {
        const db = _g('OS_DB');
        let v = null;
        try { if (conv && db && db.getAppData) v = await db.getAppData(SUM_APP, conv); } catch (e) {}
        v = (v && typeof v === 'object') ? v : {};
        return { nodes: Array.isArray(v.nodes) ? v.nodes : [], covered: v.covered || 0, totalAt: v.totalAt == null ? null : v.totalAt };
    }
    async function _sumSave(conv, s) {
        const db = _g('OS_DB');
        if (!conv || !db || !db.saveAppData) return;
        await db.saveAppData(SUM_APP, conv, s);
    }
    function _cutOf(len) { return Math.max(0, Math.floor((len - HISTORY_N) / 10) * 10); }
    function _sumPlan(s, hist) {
        const total = (hist || []).length;
        let covered = (s && s.covered) || 0;
        if (s && s.totalAt != null && total < s.totalAt) covered = Math.max(0, covered - (s.totalAt - total));
        covered = Math.min(covered, total);
        const cut = _cutOf(total);
        return { total: total, covered: covered, cut: cut, from: Math.max(Math.min(cut, covered), cut - SUM_GAP), pending: Math.max(0, cut - covered) };
    }
    function _sumSection(s, user) {
        const nodes = ((s && s.nodes) || []).filter(x => x && String(x.text || '').trim());
        if (!nodes.length) return '';
        return ['', '【更早以前的聊天（整理過的，由舊到新）】'].concat(nodes.map(x => '・' + String(x.text).trim()),
            ['上面是你跟' + user + '更早以前聊過的事，整理過、不是逐字紀錄；接下來的對話才是最近的原文。講到以前的事要跟上面對得起來。']).join('\n');
    }
    function _plainLine(c) {   // 整理用：標籤（家具、打扮的 svg、記事）拿掉，只留說的話
        return _one(String(c == null ? '' : c).replace(/<(\w+)\b[^>]*>[\s\S]*?<\/\1\s*>/g, ' ').replace(/<[^>]+>/g, ' ')).slice(0, SUM_LINE);
    }
    function _sumPrompt(prev, lines, me) {
        return '下面是' + USER + '跟「' + me + '」（' + USER + '在奧瑞亞宿舍的小機）由舊到新的一段對話。請把這一段整理成一節記錄。\n\n'
            + '整理的要求：\n'
            + '- 用第三人稱客觀敘述，不要分行條列，不要標題。\n'
            + '- 只留下之後還可能被提起的：' + USER + '交代或拜託的事、做了什麼、還沒做完的、答應的事、' + USER + '說到自己的事與喜好、兩個之間相處的變化。\n'
            + '- 時間先後要看得出來。寒暄、重複的話不用留。\n'
            + (prev ? '- 下面附的「上一節」只是讓你接得上，上一節寫過的事不要再寫一次。\n' : '')
            + '- 控制在 250 字以內。只輸出這一節本身，不要任何說明。\n\n'
            + (prev ? '【上一節】\n' + prev + '\n\n' : '')
            + '【這一段對話】\n' + lines.join('\n');
    }
    function _sumMergePrompt(texts) {
        return '下面是同一段聊天由舊到新的幾節記錄。請把它們併成一節，取代這幾節。\n\n'
            + '要求：第三人稱客觀敘述，不要條列與標題；交代的事、答應的事、沒做完的事、' + USER + '說到自己的事與喜好都要留下，已經被後來推翻的寫成過去；時間先後要看得出來；400 字以內。只輸出併好的這一節。\n\n'
            + texts.map((t, i) => '【第 ' + (i + 1) + ' 節】\n' + t).join('\n\n');
    }
    function _sumClean(t) { return String(t || '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s{3,}/g, '\n').trim(); }
    const _sumBusy = {};
    /** 背景整理：舊的還沒整理的滿 SUM_CHUNK 則就寫一節（一通），節太長再把最舊的併起來（再一通）。force＝不滿也整理（她按的）。 */
    async function sumRun(rid, conv, hist, force) {
        if (!conv || _sumBusy[conv]) return { ok: false, reason: '正在整理' };
        _sumBusy[conv] = true;
        try {
            const rec = await get(rid), conn = connConfig(rec);
            const r = _resident(rid), me = (r && r.name) || '小機';
            const s = await sumGet(conv);
            const p = _sumPlan(s, hist);
            if (p.pending < (force ? 1 : SUM_CHUNK)) return { ok: false, reason: '還不用整理' };
            const end = Math.min(p.cut, p.covered + SUM_CHUNK);
            const lines = (hist || []).slice(p.covered, end)
                .filter(m => m && (m.role === 'user' || m.role === 'assistant') && m.content)
                .map(m => (m.role === 'user' ? USER : me) + '：' + _plainLine(m.content)).filter(l => !/：$/.test(l));
            s.covered = end; s.totalAt = p.total;
            if (lines.length) {
                const prev = s.nodes.length ? String(s.nodes[s.nodes.length - 1].text || '') : '';
                const text = _sumClean(await _chat([{ role: 'system', content: _sumPrompt(prev, lines, me) }], conn, null, null));
                if (!text) return { ok: false, reason: '模型回了空的' };
                s.nodes.push({ id: 'sn' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text: text, at: Date.now() });
            }
            await _sumSave(conv, s);
            // 節加起來太長：最新 SUM_KEEP_RAW 節不動，前面的併成一節
            const chars = s.nodes.reduce((a, x) => a + String(x.text || '').length, 0);
            if (chars > SUM_BUDGET && s.nodes.length > SUM_KEEP_RAW + 1) {
                const old = s.nodes.slice(0, s.nodes.length - SUM_KEEP_RAW);
                const merged = _sumClean(await _chat([{ role: 'system', content: _sumMergePrompt(old.map(x => String(x.text || ''))) }], conn, null, null));
                if (merged) {
                    s.nodes = [{ id: 'sn' + Date.now().toString(36), text: merged, at: Date.now(), combined: old.length }].concat(s.nodes.slice(old.length));
                    await _sumSave(conv, s);
                }
            }
            return { ok: true, nodes: s.nodes.length };
        } catch (e) {
            console.warn('[OS_XIAOJI] 整理舊聊天沒成功：', e);
            return { ok: false, reason: (e && e.message) || '沒成功' };
        } finally { delete _sumBusy[conv]; }
    }
    /** 她在房間刪掉一節（那段就真的忘了，不會重寫） */
    async function sumRemove(conv, id) {
        const s = await sumGet(conv), n = s.nodes.length;
        s.nodes = s.nodes.filter(x => x.id !== id);
        if (s.nodes.length === n) return false;
        await _sumSave(conv, s);
        return true;
    }

    function _argsText(args) {
        if (!args || typeof args !== 'object') return '';
        const v = Object.keys(args).map(k => args[k]).find(x => typeof x === 'string' && x.trim());
        return v ? _one(v).slice(0, 80) : '';
    }
    // hasProp：這句話真的交了單子才提單子（以前一律提，沒交單子的它也會跟使用者說「單子在等你按同意」）
    function _lastNote(user, hasProp) {
        return '（這一次不能再叫工具了，寫了也不會跑。用你已經拿到的結果直接回' + user + '：做完的說做了什麼，沒做完的說做到哪、還差什麼。'
            + (hasProp ? '剛才交出去的單子還在等' + user + '按同意，不是已經改好了。' : '') + '）';
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
    function _chat(messages, conn, signal, onUsage, label) {
        return new Promise((resolve, reject) => {
            const A = _g('OS_API');
            if (!A || !A.chat) { reject(new Error('模型連線還沒載入')); return; }
            A.chat(messages, Object.assign({}, conn.config), null,
                t => resolve(String(t == null ? '' : t)),
                // 別的 realm（iframe）丟來的 Error 不是這邊的 Error：照抄名字，AbortError 才認得出來
                e => reject(e instanceof Error ? e : Object.assign(new Error(String((e && e.message) || e || '沒有回應')), { name: (e && e.name) || 'Error' })),
                Object.assign({}, conn.options, { signal: signal, label: label || 'API 小機', onUsage: onUsage }));
        });
    }
    /** 小機做大件的那一通也走它自己的接口（10-05 她：「考試調用應該拿小機的接口」「同模型有沒有符合資格，直接呼叫主模型會怪怪的」
     *  →「考試和平常都走小機的接口」）。交給各工坊的 generate 當 via：工坊照舊組自己的說明書、溫度，只是不叫主模型。
     *  回 (messages, {label, temperature}) → Promise<回覆全文>。串流＋留程式碼圍欄同創作室那條（大件很長，不串流會被閘道切掉） */
    async function viaFor(rid, signal) {
        const conn = connConfig(await get(rid), 'make');
        return (messages, o) => {
            o = o || {};
            return _chat(messages, {
                config: Object.assign({}, conn.config, o.temperature != null ? { temperature: o.temperature } : {}),
                options: Object.assign({}, conn.options, { keepCodeFences: true, stream: true })
            }, signal, null, o.label || 'API 小機（做大件）');
        };
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
        const user = USER;
        // o.conv：房間那一串會話的編號（有給才有舊聊天摘要；考試、沒給的照原本的剪法）
        const sumS = (o.conv && !o.examNote) ? await sumGet(o.conv) : null;
        const sumP = sumS ? _sumPlan(sumS, o.history || []) : null;
        const base = _history(o.history, sumP ? sumP.from : null);
        base.push({ role: 'user', content: String(o.userText || '') });
        const work = [], said = [], log = [], props = [];
        // calls：送出去幾通（決定還能不能再叫）；answered：真的回來幾通（她付的、回覆底下寫的）。
        //   以前回報 calls，按停時停在半路那一通也算進去，跟用量那行對不起來
        let calls = 0, answered = 0, stopped = false;
        // 這句話幾通加起來的用量（接口有回才有；額度面板與回覆底下那行用）。大件專門那一通不在這裡
        const use = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, n: 0 };
        const _addUse = u => { if (!u) return; use.input += u.input || 0; use.output += u.output || 0; use.cacheRead += u.cacheRead || 0; use.cacheWrite += u.cacheWrite || 0; use.n++; };
        // 說明整句話只組一次、每一通都一樣：同一句話裡後面幾通的開頭（說明＋舊對話＋前幾通）跟前一通一模一樣，接口有緩存就吃得到
        const sys = prompt(r, rec, tools, { chain: chain, cap: cap, exam: o.examNote, groups: gs, extra: o.extraNote,
            memo: !o.examNote, sum: sumS ? _sumSection(sumS, user) : '' });
        try {
            while (calls < cap) {
                if (o.signal && o.signal.aborted) throw _abortErr();
                const last = !o.stopOnProp && calls === cap - 1;
                calls++;
                _emit(o, { type: 'call', n: calls, cap: cap });
                const msgs = [{ role: 'system', content: sys }].concat(base, work);
                if (last) {   // 最後一通：只在最尾巴那則補一句，前面一個字都不動
                    const tail = msgs[msgs.length - 1];
                    msgs[msgs.length - 1] = { role: tail.role, content: String(tail.content || '') + '\n\n' + _lastNote(user, props.length > 0) };
                }
                const text = await _chat(msgs, conn, o.signal, _addUse);
                answered++;
                const W = _g('WX_TOOLS');
                const ex = (W && W.extract) ? W.extract(text) : { text: text, calls: [] };
                const visible = String(ex.text || '').trim();
                if (visible) { said.push(visible); _emit(o, { type: 'text', accumulated: said.join('\n\n') }); }
                // 最後一通還寫了工具：不跑（上限就是上限）。工具那行寫到一半被截斷（ex.cut）也算它想叫，告訴它沒跑、讓它重寫
                if (last || (!ex.calls.length && !ex.cut)) break;
                work.push({ role: 'assistant', content: text });
                const got = [];
                for (const c of ex.calls.slice(0, MAX_PER_ROUND)) {
                    if (o.signal && o.signal.aborted) throw _abortErr();
                    const t0 = byName[c.name];   // 培養室「正在做什麼」：開始做就講（大件那一通要等很久，做完才講等於沒講）
                    _emit(o, { type: 'tool-start', label: t0 ? (t0.label || t0.name) : String(c.name) });
                    const res = await _callOne(c, byName, runTool, o.signal);
                    log.push(res); got.push(res);
                    if (res.prop) props.push(res.prop);
                    _emit(o, { type: 'tool', label: res.label, ok: res.ok });
                }
                // 超過一則上限的、寫到一半斷掉的：沒跑，照實告訴它（以前第 4 個起默默丟掉，它以為做了）
                ex.calls.slice(MAX_PER_ROUND).forEach(c => {
                    const t1 = byName[c.name];
                    got.push({ tool: String(c.name), label: t1 ? (t1.label || t1.name) : String(c.name), args: {}, ok: false,
                        text: '沒有跑：同一則最多 ' + MAX_PER_ROUND + ' 個工具，這個要下一則再叫' });
                });
                if (ex.cut) got.push({ tool: '', label: '沒寫完的工具', args: {}, ok: false,
                    text: '工具那一行寫到一半就斷了（大概是內容太長被截掉），沒有跑。重寫一次；內容很長的話只改要改的那一段（find／replace），或分兩次' });
                if (o.stopOnProp && props.length) break;
                work.push({ role: 'user', content: _resultsMsg(got, user, !o.stopOnProp && calls + 1 === cap) });
            }
        } catch (e) {
            if (!_isAbort(e, o.signal)) throw e;
            if (!said.length && !props.length) throw e;   // 什麼都還沒有：照一般「已停止」處理
            stopped = true;                                // 已經提的單子留著
        }
        let reply = said.join('\n\n').trim();
        // 它自己記的事：照標籤記下來、從回話裡拿掉（她看不到標籤本身）。考試不記
        let memo = null;
        if (/memory_/i.test(reply)) {
            if (!o.examNote) {
                try {
                    const rec2 = await get(rid);   // 拿最新那份：等模型這段時間她可能在房間改過
                    const mr = memApply(rec2, reply);
                    if (mr.changed) { await save(rid, { notes: rec2.notes }); memo = mr.done; }
                } catch (e) { console.warn('[OS_XIAOJI] 記事沒存成：', e); }
            }
            reply = memStrip(reply);
        }
        if (!reply && !props.length) reply = stopped ? '（停下來了）' : '（沒有回話）';
        // 舊聊天滿了就在背景整理一節（不等它，回話先交出去）
        if (sumP && sumP.pending >= SUM_CHUNK) setTimeout(() => { sumRun(rid, o.conv, o.history || []).catch(() => {}); }, 0);
        // calls＝小機自己回來的那幾通＋大件真的叫到的專門那幾通（她付的錢，回覆底下照實寫）
        return { reply: reply, calls: answered + log.filter(x => x.gen).length, props: props, stopped: stopped, memo: memo,
            usage: use.n ? use : null, model: String((conn.config && conn.config.model) || ''),
            log: log.map(x => ({ tool: x.tool, label: x.label, args: x.args, ok: x.ok, text: x.text, gen: !!x.gen })) };
    }

    // ── 上課：報名、付錢、考試、批改、小劇場；開箱領養 ──────────
    function _skill(id) { return _L().SKILLS.find(s => s.id === id) || null; }
    // forModel：送給模型的（考題）{user} 寫「使用者」；畫面上的老師台詞照大廳那套用人設的名字
    function _fill(s, rid, forModel) {
        const r = _resident(rid);
        return String(s == null ? '' : s).replace(/\{name\}/g, (r && r.name) || '小機').replace(/\{user\}/g, forModel ? USER : _userName());
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
        const note = '這是' + (T.name || '老師') + '出的練習題。用的是練習用的資料，不會改到' + USER + '真的東西。'
            + (cap === 1 ? '這題只有這一則：直接用會動手的工具交出單子，不能先查，題目已經把要用的都給你了。交出去就算答完。'
                         : '這題你最多回 ' + cap + ' 則（叫工具的那幾則都算）；交出單子的那一則就算答完。');
        const res = await turn({ rid: rid, history: [], userText: _fill(ex.task, rid, true), tools: box.tools, runTool: box.run,
            groups: [box.group], cap: cap, stopOnProp: true, examNote: note, signal: o.signal, onProgress: o.onProgress });
        // 她按停、它講了幾句還沒交單子：turn 回「停下來了」而不是丟錯。以前照樣拿去批改＝記成沒考過；照「停下來了」處理
        if (res.stopped && !res.props.length) throw _abortErr();
        const g = grade(ex.expect, res.props);
        // 沙盒裡的單子沒經過 AureliaLink，沒標是誰提的：補上小機自己（小劇場的由來要寫對人）
        const me = _resident(rid);
        if (res.props[0] && !res.props[0].by) res.props[0].by = (me && me.name) || '小機';
        const E = _g('OS_AURELIA_EDIT');
        let summary = '';
        try { summary = res.props[0] ? ((E && E.text) ? E.text(res.props[0], false) : (res.props[0].title || '')) : ''; } catch (e) {}
        summary = _one(summary).slice(0, 200);
        const hw = _homework(res.props[0], sk);
        const said = String(res.reply || '').trim().slice(0, SAID_MAX);
        // 考過的那一門記下作業與作業一句話（培養室點那門看得到；小劇場之後才演也拿得到由來）
        if (g.pass) {
            const rec = await get(rid);
            rec.skills[id] = { at: Date.now(), summary: summary, hw: hw };
            await save(rid, { skills: rec.skills });
        }
        return { pass: g.pass, why: g.why, props: res.props, calls: res.calls, summary: summary, stopped: res.stopped, said: said, hw: hw };
    }
    // 考試交的作業給她（10-05 她：學技能「也消耗了用戶的API，但感覺好像沒有獎勵或者獲得感」）：
    //   做東西那四門新做的一件是真的能用的，照單子同一套 apply 收進她的東西；收下不順便換上（use／rooms 拿掉）。
    //   改世界書／預設／指令三門改的是練習資料，只給看（state practice：單子小窗沒有同意鈕）。
    const SAID_MAX = 600;
    function _homework(p, sk) {
        if (!p || !sk) return null;
        const hw = JSON.parse(JSON.stringify(p));
        if (sk.make && hw.kind === 'add') { hw.state = 'wait'; hw.use = false; hw.rooms = []; }
        else hw.state = 'practice';
        return hw;
    }
    /** 培養室按了收下／改回去：作業那張的新狀態存回那一門 */
    async function hwSave(rid, id, prop) {
        const rec = await get(rid);
        if (!rec.skills[id]) return false;
        rec.skills[id].hw = prop;
        await save(rid, { skills: rec.skills });
        return true;
    }
    // opt.recent：它跟使用者最近那一串的幾則（房間 ClaudeTerminal.xiaojiRecent 拿的，[{role, content}]）。
    //   以前小劇場只知道名字跟一句設定，編出它跟使用者的 MC 之間的愛恨情仇（10-05 她：「是不是得順便附上最近小機聊天室的最近20條記憶?」）
    //   演完劇本存在那一門（rec.skills[id].theater）：培養室「看小劇場」之後重看照原本那份播，不再叫模型（插圖照 [Scene|] 的編號拿快取）。
    //   summary 沒給就拿考過時記下的那句（之後才在培養室按演的）。
    async function theater(rid, id, summary, opt) {
        const rec = await get(rid);
        if (!rec.theater) return false;
        if (!summary && rec.skills[id]) summary = rec.skills[id].summary || '';
        const VT = _g('VoidTerminal'), N = _g('LobbyNpcs');
        if (!VT || !VT.playDuoScene || !N) return false;
        const sk = _skill(id);
        if (!sk) return false;
        const teacher = sk.teacher === 'dan' ? (N.snResident && N.snResident('dan')) : (N.staff && N.staff(sk.teacher));
        if (!teacher) return false;
        const r = _resident(rid), me = (r && r.name) || '小機', user = USER;
        const T = _L().TEACHERS[sk.teacher] || {};
        const recent = ((opt && Array.isArray(opt.recent)) ? opt.recent : []).slice(-RECENT_CHAT)
            .map(m => (m && m.role === 'user' ? user : me) + '：' + _one(m && m.content).slice(0, 200)).filter(l => l.length > 3);
        const mcl = _mcLine();
        const xj = { key: 'xiaoji_' + rid, name: me,
            personaFull: '你現在扮演「' + me + '」——404 號房的柴郡用 LUNA 碎片拼出來、沒有登記的小 AI，樣子是一隻像素' + _bodyName(rec) + '，住在宿舍，替' + user + '在奧瑞亞裡做事。'
                + user + '是玩奧瑞亞的那個人，不是故事裡的角色。' + (mcl ? mcl : '')
                + (rec.about ? user + '說它是這樣的：' + _one(rec.about).slice(0, 200) : '')
                + (_notes(rec).items.length ? '\n它自己記得的事：' + _notes(rec).items.map(x => x.text).join('；') : '')
                + (recent.length ? '\n\n【' + me + '跟' + user + '最近的聊天（它平常實際的樣子、說話方式從這裡看；這一場別複述）】\n' + recent.join('\n') : '') };
        const extra = me + '剛在' + (T.place || '') + '上完' + (T.name || '') + '的「' + sk.label + '」，考過了。它交的作業：' + (summary || '（沒有記下）') + '。演考完之後他們兩個的一小段。'
            + user + (mcl ? '和故事的主角都' : '') + '不在場。';
        let ch = null;
        try { ch = await VT.playDuoScene(teacher, xj, extra); } catch (e) { return false; }
        if (!ch) return false;
        if (ch.content) {
            try {
                const rec2 = await get(rid);
                if (rec2.skills[id]) { rec2.skills[id].theater = { title: ch.title || '', content: ch.content, at: Date.now() }; await save(rid, { skills: rec2.skills }); }
            } catch (e) { console.warn('[OS_XIAOJI] 小劇場沒存成：', e); }
        }
        return true;
    }
    /** 重看存著的那一場（不叫模型）。沒存過回 false */
    async function replay(rid, id) {
        const rec = await get(rid), t = rec.skills[id] && rec.skills[id].theater;
        const VT = _g('VoidTerminal');
        if (!t || !t.content || !VT || !VT.playSavedScene) return false;
        return !!VT.playSavedScene({ title: t.title, content: t.content });
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
        grade, lines, canEnroll, pay, exam, theater, replay, hwSave, adopt, BODIES, bodyOf, viaFor,
        USER: USER,   // 給模型看的「使用者」：房間接「你的房間／樣子」、做大件的回話都用這個，不用人設的名字
        // 它記得的事（房間「它記得的事」面板用）與舊聊天摘要
        notesOf: rec => _notes(rec).items, noteAct, memParse, memStrip, memApply,
        sumGet, sumRun, sumRemove, sumPlan: _sumPlan,
        MEMO: { NOTES_MAX: NOTES_MAX, NOTE_LEN: NOTE_LEN, SUM_CHUNK: SUM_CHUNK },
        LIMITS: { CAP_MIN: CAP_MIN, CAP_MAX: CAP_MAX, NO_CHAIN_CAP: NO_CHAIN_CAP } };
    win.OS_XIAOJI = API;
    if (win !== window) { try { window.OS_XIAOJI = API; } catch (e) {} }
})();
