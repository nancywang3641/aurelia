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
    // 🚨 10-05 A/B（泡泡，草莓蛋糕／深夜便利商店）：叫小機擴寫「氣氛、顏色、質感、要有哪些部分」兩輪都做得最普通——
    //   擴寫出來的是形容詞和通用零件清單，把她講的那個具體東西沖淡了。她一句話＋說明書本來就夠。
    //   所以這格改成：原話照抄，只補看得見的東西；要它自己決定結構的（VN 組件有哪幾塊）才列部分（10-06 她：改吧）
    const FEEL = { type: 'string', description: '給負責做的那一位看的需求，它只看得到這一格和它自己的說明書。'
        + '第一行把使用者要這件東西時說的話照抄，一字不改、不要縮短。'
        + '底下只補看得見的具體東西：原話裡那樣東西實際長什麼樣（形狀、材質、上面有什麼）。'
        + 'VN 組件另外寫它有哪幾塊、各能按什麼、按了會怎樣；特效另外寫它怎麼動。泡泡和主題的零件是固定的，不用列零件。'
        + '不要堆氣氛、感覺的形容詞：形容詞會把原話裡那個具體的東西沖淡，做出來最普通。'
        + '要改已經有的那一件，一樣先照抄原話，再寫要改哪裡、改成怎樣' };
    const FROM = { type: 'string', description: '要改的那一件現在的名字（照列出來的寫）；新做一件就不填' };
    const NAME = { type: 'string', description: '新做的這一套叫什麼（中文，十個字以內，不能跟已經有的重複）；改舊的不用填' };
    const DEFS = [
        { name: 'aurelia_vn_make', group: 'vn', label: '做 VN 組件',
          description: '請專門做組件的那一位，照你寫的需求做一個 VN 組件（故事播到一半跳出來的那種面板），做好直接變成一張單子，對方看過預覽、按同意才加進去。只改一兩處（換個顏色、大小、一段字）用 aurelia_vn_edit 自己改就好，不用另外叫模型；要換風格、整套重做才用這個（填 from）。這個工具會另外叫一次模型。',
          inputSchema: { type: 'object', properties: { feel: FEEL, from: FROM }, required: ['feel'] } },
        { name: 'aurelia_theme_make', group: 'theme', label: '做主題',
          description: '請專門做主題的那一位，照你寫的需求做一套主題，做好直接變成一張單子，對方看過樣子、按同意才存。kind：story＝故事畫面、phone＝手機外觀、chat＝聊天 app。只改一兩處（換個顏色、大小、一段字）用 aurelia_theme_edit 自己改就好，不用另外叫模型；要換風格、整套重做才用這個（填 from）。這個工具會另外叫一次模型。',
          inputSchema: { type: 'object', properties: { kind: { type: 'string', enum: ['story', 'phone', 'chat'], description: '哪一種主題' }, name: NAME, feel: FEEL, from: FROM }, required: ['kind', 'feel'] } },
        { name: 'aurelia_bubble_make', group: 'bubble', label: '做泡泡',
          description: '請專門做泡泡的那一位，照你寫的需求做一套聊天 app 的對話泡泡，做好直接變成一張單子，對方看過樣子、按同意才收進主題庫。只改一兩處（換個顏色、大小、一段字）用 aurelia_bubble_edit 自己改就好，不用另外叫模型；要換風格、整套重做才用這個（填 from）。這個工具會另外叫一次模型。',
          inputSchema: { type: 'object', properties: { name: NAME, feel: FEEL, from: FROM,
              rooms: { type: 'string', description: '新做的這一套同意之後要換到哪幾間聊天室（聊天室名字，逗號隔開；寫「全部」＝每一間）；不填＝只收進主題庫' } }, required: ['feel'] } },
        { name: 'aurelia_fx_make', group: 'fx', label: '做特效',
          description: '請專門做特效的那一位，照你寫的需求做一個畫面特效（下雨、閃光那種會動的），做好直接變成一張單子，對方試播過、按同意才加進去。只把它關掉或打開用 aurelia_fx_edit 的 enabled 就好；要改它怎麼動、整個重做才用這個（填 from，寫特效代號或名字）。這個工具會另外叫一次模型。',
          inputSchema: { type: 'object', properties: { feel: FEEL, from: FROM }, required: ['feel'] } }
    ];
    function tools(groups) {
        const gs = groups || [];
        return DEFS.filter(d => gs.indexOf(d.group) !== -1).map(d => Object.assign({ make: true, propose: true }, d));
    }

    function _one(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
    function _fold(s) { return _one(s).toLowerCase(); }   // 跟各模組比撞名同一種比法
    // 撞名就補編號：name（2）、name（3）…（產生器取的名字、或小機沒給名字時用；它自己給的名字撞了是先擋回去）
    function _uniq(name, taken, sep) {
        const has = n => taken.some(t => _fold(t) === _fold(n));
        if (!has(name)) return name;
        for (let i = 2; i < 100; i++) { const n = sep ? name + sep + i : name + '（' + i + '）'; if (!has(n)) return n; }
        return name + (sep || '-') + Date.now().toString(36);
    }
    const KIND_NEW = { story: '新的劇情主題', phone: '新的手機主題', chat: '新的聊天 app 主題' };

    // 回給小機看的：一律「使用者」，不用人設的名字（人設＝使用者跑團的主角，見 os_xiaoji.js 的 USER）
    function _userName() { const X = _g('OS_XIAOJI'); return (X && X.USER) || '使用者'; }
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
        async vn(a, cur, via) {
            const S = _g('OS_STUDIO');
            if (!S || !S.vnGenerate) throw new Error('創作室還沒載入');
            const j = await S.vnGenerate(a.feel, cur, via);
            // 改舊的：產生器沒回的那幾欄不送（aurelia_vn_edit 有給的欄位就整欄換掉，以前補成空字串＝沒改的程式、樣式被清空）
            if (cur) {
                const f = { tag: a.from };
                [['html', 'html'], ['css', 'css'], ['js', 'js'], ['demo_format', 'demoFormat'], ['usage_desc', 'usageDesc']]
                    .forEach(([arg, k]) => { if (j[k] != null) f[arg] = String(j[k]); });
                return { edit: true, args: f };
            }
            const f = { html: j.html || '', css: j.css || '', js: j.js || '', demo_format: j.demoFormat || '', usage_desc: j.usageDesc || '' };
            return { edit: false, args: Object.assign({ tag: j.tagId, title: j.title || '',
                keywords: Array.isArray(j.keywords) ? j.keywords.join(',') : String(j.keywords || ''),
                is_block: j.isBlock === undefined ? !!j.demoFormat : !!j.isBlock }, f) };
        },
        async theme(a, cur, via) {
            if (a.kind === 'chat') {
                const P = _g('WX_THEME_PACK');
                if (!P || !P.generate) throw new Error('聊天 app 主題還沒載入');
                // 改舊的：cur 當「這支 app 現在的這一套」（第三個參數）。第二個參數是「別的 app 的美化、只抓風格」，以前錯放在那裡，改一點變整套重做
                const g = cur ? await P.generate(a.feel, '', cur, via) : await P.generate(a.feel, '', '', via);
                return cur ? { edit: true, args: { kind: 'chat', name: a.from, css: g.css } }
                           : { edit: false, args: { kind: 'chat', name: a.name || g.name || '', css: g.css } };
            }
            if (a.kind === 'phone') {
                const P = _g('OS_PHONE_THEME');
                if (!P || !P.generate) throw new Error('手機主題還沒載入');
                const raw = await P.generate(a.feel, cur, via);
                const j = P.pickJson ? P.pickJson(raw) : null;
                const data = j ? JSON.stringify(j) : String(raw || '');
                return cur ? { edit: true, args: { kind: 'phone', name: a.from, data: data } }
                           : { edit: false, args: { kind: 'phone', name: a.name || (j && j.name) || '', data: data } };
            }
            const S = _g('OS_STUDIO');
            if (!S || !S.vnTheme || !S.vnTheme.generate) throw new Error('創作室還沒載入');
            const g = await S.vnTheme.generate(a.feel, cur, via);
            return cur ? { edit: true, args: { kind: 'story', name: a.from, css: g.css } }
                       : { edit: false, args: { kind: 'story', name: a.name || '', css: g.css } };
        },
        async bubble(a, cur, via) {
            const B = _g('WX_BUBBLE_AI');
            if (!B || !B.ask) throw new Error('泡泡還沒載入');
            const g = await new Promise((res, rej) => B.ask({ text: a.feel, currentCss: cur, log: [], chatId: 'xiaoji', via: via, onDone: res,
                onError: e => rej(e instanceof Error ? e : new Error(String((e && e.message) || e))) }));
            if (!g || !g.css) throw new Error('它沒有交出泡泡的樣式');
            return cur ? { edit: true, args: { name: a.from, css: g.css } }
                       : { edit: false, args: { name: a.name || '', css: g.css, rooms: a.rooms || '' } };
        },
        async fx(a, cur, via) {
            const S = _g('OS_STUDIO');
            if (!S || !S.fxGenerate) throw new Error('創作室還沒載入');
            const j = await S.fxGenerate(a.feel, cur, via);
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
        // 叫產生器之前先查得出來的先擋（以前做完才在交單子那步擋，專門那一通白花）：主題種類、自己給的名字撞名、改的那個能不能改
        if (d.group === 'theme' && !KIND_NEW[a.kind]) return { ok: false, text: 'kind 要寫 story、phone 或 chat' };
        a.name = _one(a.name);
        let genFeel = a.feel;
        if (!a.from) {
            if (a.name && d.group === 'bubble' && m.reserved && m.reserved(a.name)) return { ok: false, text: '「' + a.name + '」是拿來指「還原成預設」或「每一間」的字，name 換一個' };
            if (a.name && m.names && (d.group === 'theme' || d.group === 'bubble')) {
                const taken = await m.names(a.kind);
                if (taken.some(n => _fold(n) === _fold(a.name))) return { ok: false, text: '已經有一套叫「' + a.name + '」了：要改它就把名字填在 from，要做新的 name 換一個' };
            }
            // VN 組件的標籤是產生器取的：先告訴它哪些已經有了
            if (d.group === 'vn' && m.tags) {
                const tg = await m.tags();
                if (tg.length) genFeel = a.feel + '\n（已經有的組件標籤，新的這個不能跟它們重複：' + tg.slice(0, 80).join('、') + '）';
            }
        } else if (d.group === 'vn' && m.canEdit) {
            const err = await m.canEdit(a.from);
            if (err) return { ok: false, text: err };
        }
        let cur = '';
        if (a.from && d.group === 'theme' && m.content) {
            // 主題直接拿內容（練習題用的假模組沒有 content，照舊走下面讀的那條）
            const c = await m.content(a.kind, a.from);
            if (c.err) return { ok: false, text: c.err };
            cur = c.text;
        } else if (a.from) {
            const rd = READ[d.group](a);
            cur = await _readAll(m, rd[0], rd[1]);
            if (!cur.trim() || _notFound(cur)) return { ok: false, text: cur.trim() || ('找不到「' + a.from + '」') };
        }
        // 做的那一通走這隻小機自己的接口（考試、平常都一樣；10-05 她：「考試和平常都走小機的接口」）。拿不到才照舊走工坊自己的設定
        let via = ctx.via || null;
        if (!via && ctx.rid) { const X = _g('OS_XIAOJI'); try { if (X && X.viaFor) via = await X.viaFor(ctx.rid); } catch (e) { via = null; } }
        let got;
        try { got = await GEN[d.group](Object.assign({}, a, { feel: genFeel }), cur, via); }
        catch (e) { return { ok: false, gen: true, text: '負責做的那一位沒做成：' + ((e && e.message) || e) + '。可以把 feel 寫清楚一點再叫一次。' }; }
        // 新做的：名字是產生器取的（或沒取）、特效代號是產生器取的——撞了就補編號，不要因為名字讓這一通白做
        if (!got.edit) {
            try {
                if ((d.group === 'theme' || d.group === 'bubble') && m.names) {
                    const base = _one(got.args.name) || (d.group === 'theme' ? KIND_NEW[a.kind] : '新的泡泡');
                    got.args.name = _uniq(base.slice(0, 26), await m.names(a.kind));
                }
                if (d.group === 'fx' && m.ids) {
                    const r = JSON.parse(got.args.recipe);
                    const ids = m.ids();
                    if (r && r.fxId && ids.indexOf(String(r.fxId).trim().toLowerCase()) !== -1) {
                        r.fxId = _uniq(String(r.fxId).trim().toLowerCase(), ids, '-');
                        got.args.recipe = JSON.stringify(r);
                    }
                }
            } catch (e) { /* 補不了就照原樣交，交單子那步會說原因 */ }
        }
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
