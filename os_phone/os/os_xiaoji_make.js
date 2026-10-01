// ----------------------------------------------------------------
// [檔案] os_xiaoji_make.js — 小機的大件：交給專門一通去做（2026-10-01）
// 她定的：小機做主題（和組件、泡泡、特效這種大件）交給一通只帶說明書＋「想要的感覺」的專門呼叫（工坊那種），
// 小機自己只負責講清楚要什麼、看結果、出單子。做出來的東西照舊走那一組模組的 propose（檢查、草稿、單子），模組不改。
// 只有小機看得到這四個工具；聊天 app 與會員住戶照舊用 *_spec／*_add。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    function _g(k) { return win[k] || window[k] || null; }
    const MOD = { vn: 'OS_AURELIA_VN', theme: 'OS_AURELIA_THEME', bubble: 'OS_AURELIA_BUBBLE', fx: 'OS_AURELIA_FX' };
    const FEEL = { type: 'string', description: '想要的感覺：給負責做的那一位看的需求。寫清楚用在哪裡、氣氛、顏色、質感、要有哪些部分；要改已經有的那一件，就寫要改哪裡、改成怎樣' };
    const FROM = { type: 'string', description: '要改的那一件現在的名字（照列出來的寫）；新做一件就不填' };
    const NAME = { type: 'string', description: '新做的這一套叫什麼（中文，十個字以內，不能跟已經有的重複）；改舊的不用填' };
    const DEFS = [
        { name: 'aurelia_vn_make', group: 'vn', label: '做 VN 組件',
          description: '請專門做組件的那一位，照你寫的需求做一個 VN 組件（故事播到一半跳出來的那種面板），做好直接變成一張單子，對方看過預覽、按同意才加進去。改已經有的組件也用這個（填 from）。這個工具會另外叫一次模型。',
          inputSchema: { type: 'object', properties: { feel: FEEL, from: FROM }, required: ['feel'] } },
        { name: 'aurelia_theme_make', group: 'theme', label: '做主題',
          description: '請專門做主題的那一位，照你寫的需求做一套主題，做好直接變成一張單子，對方看過樣子、按同意才存。kind：story＝故事畫面、phone＝手機外觀、chat＝聊天 app。改已經有的那一套也用這個（填 from）。這個工具會另外叫一次模型。',
          inputSchema: { type: 'object', properties: { kind: { type: 'string', enum: ['story', 'phone', 'chat'], description: '哪一種主題' }, name: NAME, feel: FEEL, from: FROM }, required: ['kind', 'feel'] } },
        { name: 'aurelia_bubble_make', group: 'bubble', label: '做泡泡',
          description: '請專門做泡泡的那一位，照你寫的需求做一套聊天 app 的對話泡泡，做好直接變成一張單子，對方看過樣子、按同意才收進主題庫。改已經有的那一套也用這個（填 from）。這個工具會另外叫一次模型。',
          inputSchema: { type: 'object', properties: { name: NAME, feel: FEEL, from: FROM,
              rooms: { type: 'string', description: '新做的這一套同意之後要換到哪幾間聊天室（聊天室名字，逗號隔開；寫「全部」＝每一間）；不填＝只收進主題庫' } }, required: ['feel'] } },
        { name: 'aurelia_fx_make', group: 'fx', label: '做特效',
          description: '請專門做特效的那一位，照你寫的需求做一個畫面特效（下雨、閃光那種會動的），做好直接變成一張單子，對方試播過、按同意才加進去。改已經有的特效也用這個（填 from，寫特效代號或名字）。這個工具會另外叫一次模型。',
          inputSchema: { type: 'object', properties: { feel: FEEL, from: FROM }, required: ['feel'] } }
    ];
    function tools(groups) {
        const gs = groups || [];
        return DEFS.filter(d => gs.indexOf(d.group) !== -1).map(d => Object.assign({ make: true, propose: true }, d));
    }

    function _userName() { const A = _g('OS_API'); try { return (A && A.getGlobalUserName && A.getGlobalUserName()) || '對方'; } catch (e) { return '對方'; } }
    function _who(rid) { const CT = _g('ClaudeTerminal'); try { const r = CT && CT.getResident && CT.getResident(rid); return (r && r.name) || rid; } catch (e) { return rid; } }
    function _where() { const A = _g('AureliaLink'); try { return (A && A.where) ? A.where() : ''; } catch (e) { return ''; } }

    // 讀整份（模組的 read 會分段：「（第 p／n 段，part 填 …）」那行拿掉、全部接起來）
    async function _readAll(m, tool, args) {
        let out = '', p = 1, n = 1;
        do {
            const t = String(await m.run(tool, Object.assign({}, args, { part: p })));
            const hm = t.match(/^[^\n]*（第 (\d+)／(\d+) 段[^\n]*\n/);
            if (hm) { n = parseInt(hm[2], 10); out += t.slice(hm[0].length); } else { out += t; n = 1; }
            p++;
        } while (p <= n && p <= 20);
        return out;
    }
    const READ = {
        vn: a => ['aurelia_vn_read', { tag: a.from }],
        theme: a => ['aurelia_theme_read', { kind: a.kind, name: a.from }],
        bubble: a => ['aurelia_bubble_read', { name: a.from }],
        fx: a => ['aurelia_fx_read', { id: a.from }]
    };
    function _notFound(t) { return t.length < 300 && /找不到|沒有叫|沒有這/.test(t); }
    async function _specCode(m, group, kind) {
        const t = String(await m.run('aurelia_' + group + '_spec', group === 'theme' ? { kind: kind } : {}));
        const k = t.match(/spec 參數填：([a-z0-9]+)/);
        if (!k) throw new Error('拿不到說明書的憑證');
        return k[1];
    }

    // 各組的產生器：回 { edit, args }＝要交給模組 propose 的參數
    const GEN = {
        async vn(a, cur) {
            const S = _g('OS_STUDIO');
            if (!S || !S.vnGenerate) throw new Error('創作室還沒載入');
            const j = await S.vnGenerate(a.feel, cur);
            const f = { html: j.html || '', css: j.css || '', js: j.js || '', demo_format: j.demoFormat || '', usage_desc: j.usageDesc || '' };
            if (cur) return { edit: true, args: Object.assign({ tag: a.from }, f) };
            return { edit: false, args: Object.assign({ tag: j.tagId, title: j.title || '',
                keywords: Array.isArray(j.keywords) ? j.keywords.join(',') : String(j.keywords || ''),
                is_block: j.isBlock === undefined ? !!j.demoFormat : !!j.isBlock }, f) };
        },
        async theme(a, cur) {
            if (a.kind === 'chat') {
                const P = _g('WX_THEME_PACK');
                if (!P || !P.generate) throw new Error('聊天 app 主題還沒載入');
                const g = await P.generate(cur ? (a.feel + '\n（照參考那一份改：沒提到的地方保持原樣）') : a.feel, cur);
                return cur ? { edit: true, args: { kind: 'chat', name: a.from, css: g.css } }
                           : { edit: false, args: { kind: 'chat', name: a.name || g.name || '', css: g.css } };
            }
            if (a.kind === 'phone') {
                const P = _g('OS_PHONE_THEME');
                if (!P || !P.generate) throw new Error('手機主題還沒載入');
                const raw = await P.generate(a.feel, cur);
                const j = P.pickJson ? P.pickJson(raw) : null;
                const data = j ? JSON.stringify(j) : String(raw || '');
                return cur ? { edit: true, args: { kind: 'phone', name: a.from, data: data } }
                           : { edit: false, args: { kind: 'phone', name: a.name || (j && j.name) || '', data: data } };
            }
            const S = _g('OS_STUDIO');
            if (!S || !S.vnTheme || !S.vnTheme.generate) throw new Error('創作室還沒載入');
            const g = await S.vnTheme.generate(a.feel, cur);
            return cur ? { edit: true, args: { kind: 'story', name: a.from, css: g.css } }
                       : { edit: false, args: { kind: 'story', name: a.name || '', css: g.css } };
        },
        async bubble(a, cur) {
            const B = _g('WX_BUBBLE_AI');
            if (!B || !B.ask) throw new Error('泡泡還沒載入');
            const g = await new Promise((res, rej) => B.ask({ text: a.feel, currentCss: cur, log: [], chatId: 'xiaoji', onDone: res,
                onError: e => rej(e instanceof Error ? e : new Error(String((e && e.message) || e))) }));
            if (!g || !g.css) throw new Error('它沒有交出泡泡的樣式');
            return cur ? { edit: true, args: { name: a.from, css: g.css } }
                       : { edit: false, args: { name: a.name || '', css: g.css, rooms: a.rooms || '' } };
        },
        async fx(a, cur) {
            const S = _g('OS_STUDIO');
            if (!S || !S.fxGenerate) throw new Error('創作室還沒載入');
            const j = await S.fxGenerate(a.feel, cur);
            return cur ? { edit: true, args: { id: a.from, recipe: JSON.stringify(j) } }
                       : { edit: false, args: { recipe: JSON.stringify(j) } };
        }
    };

    async function run(name, args, ctx) {
        ctx = ctx || {};
        const d = DEFS.find(x => x.name === name);
        if (!d) return { ok: false, text: '沒有叫做「' + name + '」的工具' };
        const a = Object.assign({}, args || {});
        a.feel = String(a.feel || '').trim();
        a.from = String(a.from || '').trim();
        if (!a.feel) return { ok: false, text: 'feel 要寫想要的感覺' };
        const m = ctx.mod || _g(MOD[d.group]);
        if (!m || !m.propose) return { ok: false, text: '這一組還沒載好' };
        let cur = '';
        if (a.from) {
            const rd = READ[d.group](a);
            cur = await _readAll(m, rd[0], rd[1]);
            if (!cur.trim() || _notFound(cur)) return { ok: false, text: cur.trim() || ('找不到「' + a.from + '」') };
        }
        let got;
        try { got = await GEN[d.group](a, cur); }
        catch (e) { return { ok: false, gen: true, text: '負責做的那一位沒做成：' + ((e && e.message) || e) + '。可以把 feel 寫清楚一點再叫一次。' }; }
        try {
            if (!got.edit) got.args.spec = await _specCode(m, d.group, a.kind);
            const r = await m.propose('aurelia_' + d.group + (got.edit ? '_edit' : '_add'), got.args);
            if (!r || !r.ok || !r.prop) return { ok: false, gen: true, text: '做出來了但沒過檢查：' + ((r && r.text) || '不知道為什麼') + '。可以把 feel 寫清楚一點再叫一次。' };
            r.prop.by = _who(ctx.rid);
            r.prop.where = _where();
            r.prop.from = '宿舍';
            return { ok: true, gen: true, prop: r.prop,
                text: '已經做成單子交給' + _userName() + '了：看過按同意才會存（存了也能改回去）。不要說已經改好了。' };
        } catch (e) { return { ok: false, gen: true, text: (e && e.message) || '沒有成功' }; }
    }

    const API = { tools: tools, run: run };
    win.OS_XIAOJI_MAKE = API;
    if (win !== window) { try { window.OS_XIAOJI_MAKE = API; } catch (e) {} }
})();
