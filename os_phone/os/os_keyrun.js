// ----------------------------------------------------------------
// [手機] os_keyrun.js —— 借接口給電腦上的 AI（2026-11-02）
// 她：「是不是可以在奧瑞亞開個允許KEY? 比如以後做個接口，只有這時候可以在那調用?」
//   打開後限時（預設 30 分鐘）：這台電腦上的 AI（專案的丹）可以把「畫圖」「念台詞」交給奧瑞亞，
//   用她設置裡接好的接口跑，只把圖、音檔交回去；金鑰從頭到尾不離開這個頁面。
// 工作怎麼進來：丹那邊跑一支只在本機的小程式，它在 127.0.0.1:47231 臨時開一個小站排工作；
//   開關開著時這裡去那邊拿（_loop），跑完交回同一站。開關關著＝根本不去拿。127.0.0.1 只有這台電腦連得到。
//   沒走橋（cc-bridge）的 /v1/aurelia 那條：那是住戶的門，45 秒就放棄、不帶音檔，丹也拿不到橋的通行碼。
// 通行碼：每次打開產生一組（三組四碼），只顯示在這一格、只放記憶體（重整就關、碼作廢），她複製給丹。
//   工作和結果都用它簽名（PBKDF2 → HMAC-SHA256），碼本身不在線上傳：住戶或網頁就算先佔了那個埠、
//   偷看了排隊的工作，也拿不到碼、做不出能用的工作。同一件只做一次（記編號，十分鐘內送來的才收）。
// 只收白名單四種：image（OS_IMAGE_MANAGER.generate）、voice（OS_MINIMAX.synth）、text（OS_API 照「哪件事走哪個模型」叫，11-18）、
//   jev（決策模型，11-18）。不收程式碼、不回設定或金鑰；
//   找不到接口時列出來的只有名字、模型、編號，沒有網址和金鑰。
// 每件記一行在這一格底下（aurelia_keyrun_log，最近 60 筆；紀錄檔不進備份）；生圖照舊由生圖那支記進 OS_USAGE，
//   念台詞這裡記一筆 kind:'voice'。
// 畫面：系統設置「系統/備份」那一格，os_settings.js 畫好後叫 mount(el)。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    if (win.OS_KEYRUN) { if (win !== window) window.OS_KEYRUN = win.OS_KEYRUN; return; }

    const PORT = 47231;
    const BASE = 'http://127.0.0.1:' + PORT + '/keyrun';
    const LOG_KEY = 'aurelia_keyrun_log';
    const LOG_MAX = 60;
    const SHOW_MAX = 20;
    const OPEN_MIN = 30;           // 打開一次多久
    const MORE_MIN = 30;           // 「多 30 分鐘」
    const LEFT_MAX_MIN = 120;      // 延長最多延到還剩兩小時
    const FRESH_MS = 10 * 60 * 1000;
    const PAYLOAD_MAX = 40 * 1024 * 1024;
    const REF_MAX = 8 * 1024 * 1024;
    const KDF = { salt: 'aurelia-keyrun-v1', iter: 150000 };   // 丹那邊的小程式用同一組
    const ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';           // 不放 0O1IL，她抄的時候不會看錯
    const IDLE_MS = 3000;          // 對方沒開站時多久再看一次

    // 官方價目（2026-11-02 查的，只拿來估「大概多少錢」）。
    //   GPT 圖片：每百萬 token 的美元（文字輸入／圖片輸入／圖片輸出）；只有接到 OpenAI 官方時才算錢，公益站、代理各算各的。
    //   MiniMax：國際站每百萬字美元、中國站每萬字人民幣；字數用回應的 usage_characters（中日韓字一個算兩個）。
    const IMG_RATES = [
        { re: /^gpt-image-2/i,      t: 5, i: 8,   o: 30 },
        { re: /^gpt-image-1\.5/i,   t: 5, i: 8,   o: 32 },
        { re: /^gpt-image-1-mini/i, t: 2, i: 2.5, o: 8 },
        { re: /^gpt-image-1/i,      t: 5, i: 10,  o: 40 },
    ];
    const TTS_RATES = { io: { turbo: 60, hd: 100 }, cn: { turbo: 2, hd: 3.5 } };

    let _on = false, _until = 0, _code = '', _hkey = null;
    let _offTimer = null, _loopId = 0, _pollCtl = null, _tick = null;
    let _peer = 0, _busy = '';
    let _stats = { n: 0, usd: 0, cny: 0 };
    const _done = new Set();       // 這次打開做過的工作編號
    const _views = new Set();      // 畫面上掛著的格子

    const _enc = new TextEncoder();
    const _sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const _toast = (msg, type) => { try { win.AUI && win.AUI.toast(msg, { type: type || 'info' }); } catch (e) {} };

    // ── 通行碼與簽名 ──
    function _newCode() {
        const out = [], buf = new Uint8Array(32);
        while (out.length < 12) {
            crypto.getRandomValues(buf);
            for (let i = 0; i < buf.length && out.length < 12; i++) if (buf[i] < 248) out.push(ABC[buf[i] % 31]);   // 248＝31×8，沒有偏差
        }
        return out.slice(0, 4).join('') + '-' + out.slice(4, 8).join('') + '-' + out.slice(8).join('');
    }
    function _norm(code) { return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
    async function _deriveKey(code) {
        const base = await crypto.subtle.importKey('raw', _enc.encode(_norm(code)), 'PBKDF2', false, ['deriveKey']);
        return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: _enc.encode(KDF.salt), iterations: KDF.iter, hash: 'SHA-256' },
            base, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign', 'verify']);
    }
    function _hex(buf) { return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join(''); }
    function _unhex(s) {
        s = String(s || '');
        if (!/^[0-9a-f]{64}$/i.test(s)) return null;
        const out = new Uint8Array(32);
        for (let i = 0; i < 32; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
        return out;
    }
    async function _sign(key, str) { return _hex(await crypto.subtle.sign('HMAC', key, _enc.encode(str))); }
    async function _verify(key, str, sig) {
        const b = _unhex(sig);
        if (!b || !key) return false;
        try { return await crypto.subtle.verify('HMAC', key, b, _enc.encode(str)); } catch (e) { return false; }
    }

    // ── 開、關、延長 ──
    async function on(minutes) {
        if (_on) return true;
        if (!(win.crypto && crypto.subtle && win.fetch)) { _toast('這個頁面做不了通行碼，借不出去', 'error'); return false; }
        const code = _newCode();
        let key;
        try { key = await _deriveKey(code); } catch (e) { _toast('通行碼做不出來：' + ((e && e.message) || e), 'error'); return false; }
        _code = code; _hkey = key; _on = true;
        _until = Date.now() + (minutes > 0 ? minutes : OPEN_MIN) * 60000;
        _done.clear(); _peer = 0; _busy = ''; _stats = { n: 0, usd: 0, cny: 0 };
        _armOff();
        _loop(++_loopId);
        _repaint();
        return true;
    }
    function off(why) {
        if (!_on) return;
        _on = false; _code = ''; _hkey = null; _until = 0; _peer = 0; _busy = '';
        _loopId++;
        if (_offTimer) { clearTimeout(_offTimer); _offTimer = null; }
        if (_pollCtl) { try { _pollCtl.abort(); } catch (e) {} _pollCtl = null; }
        if (why === 'time') _toast('借接口的時間到了，已經關掉');
        _repaint();
    }
    function more() {
        if (!_on) return;
        _until = Math.min(_until + MORE_MIN * 60000, Date.now() + LEFT_MAX_MIN * 60000);
        _armOff();
        _repaint();
    }
    function _armOff() {
        if (_offTimer) clearTimeout(_offTimer);
        _offTimer = setTimeout(() => {
            _offTimer = null;
            if (!_on) return;
            if (Date.now() >= _until - 50) off('time'); else _armOff();   // 背景分頁的計時器會晚，晚了就再排一次
        }, Math.max(0, _until - Date.now()));
    }

    // ── 去對方的小站拿工作 ──
    async function _loop(id) {
        let fails = 0;
        while (_on && id === _loopId) {
            if (Date.now() >= _until) { off('time'); return; }
            const ctl = new AbortController();
            _pollCtl = ctl;
            const t = setTimeout(() => ctl.abort(), 30000);
            const t0 = Date.now();
            let d = null;
            try {
                const r = await fetch(BASE + '/next', { cache: 'no-store', signal: ctl.signal });
                if (r.ok) d = await r.json();
            } catch (e) { d = null; }
            clearTimeout(t);
            if (_pollCtl === ctl) _pollCtl = null;
            if (!_on || id !== _loopId) return;
            if (!d || typeof d !== 'object') {
                fails++;
                await _sleep(fails > 40 ? IDLE_MS * 2 : IDLE_MS);
                continue;
            }
            fails = 0;
            const first = !_peer;
            _peer = Date.now();
            if (first) _repaint();
            const jobs = Array.isArray(d.jobs) ? d.jobs.slice(0, 5) : [];
            for (const j of jobs) await _take(j);
            if (!jobs.length && Date.now() - t0 < 1000) await _sleep(1000);   // 對方沒有等著回（不是那支小程式）：別一直敲
        }
    }

    async function _take(j) {
        const key = _hkey;   // 做到一半時間到了也用這把交回去
        const payload = (j && typeof j.payload === 'string') ? j.payload : '';
        let job = null;
        if (payload && payload.length <= PAYLOAD_MAX) { try { job = JSON.parse(payload); } catch (e) {} }
        const id = (job && typeof job.id === 'string') ? job.id.slice(0, 48) : '';
        if (!job || !id) return _refuse(id, 'bad');
        if (!_on || !key) return _refuse(id, 'off');
        if (!(await _verify(key, payload, j.sig))) return _refuse(id, 'code');
        if (_done.has(id)) return _refuse(id, 'dup');
        if (!(job.at > 0) || Math.abs(Date.now() - job.at) > FRESH_MS) return _refuse(id, 'old');
        _done.add(id);
        const kind = String(job.kind || '');
        const H = Object.prototype.hasOwnProperty.call(JOBS, kind) ? JOBS[kind] : null;
        if (!H) return _answer(key, id, { ok: false, text: '不收這種工作（只收畫圖 image、念台詞 voice、叫文字模型 text、問 Jev jev）。' },
            { kind: '', what: '不收的工作' + (kind ? '：' + kind.slice(0, 24) : ''), quiet: true });
        let args;
        try { args = H.check((job.args && typeof job.args === 'object' && !Array.isArray(job.args)) ? job.args : {}); }
        catch (e) { return _answer(key, id, { ok: false, text: e.message }, { kind: kind, what: H.name }); }
        _busy = H.busy;
        _repaint();
        const t0 = Date.now();
        let res;
        try { res = await H.run(args); } catch (e) { res = { ok: false, text: (e && e.message) || String(e) }; }
        _busy = '';
        res.ms = Date.now() - t0;
        return _answer(key, id, res, { kind: kind, what: H.what(args, res) });
    }

    // 做完（或照規矩不做）的：簽名交回，記一行
    async function _answer(key, id, res, meta) {
        const out = { v: 1, id: id, ok: !!res.ok, text: String(res.text || ''), at: Date.now() };
        if (res.ok && Array.isArray(res.files)) out.files = res.files;
        if (res.cost) out.cost = res.cost;
        if (res.ms) out.ms = res.ms;
        const payload = JSON.stringify(out);
        let sig = '';
        try { sig = key ? await _sign(key, payload) : ''; } catch (e) {}
        const line = _logJob(meta, res);
        const sent = await _post({ payload: payload, sig: sig });
        if (!sent && line) { line.lost = true; _logPatch(line); }
        _repaint();
    }
    // 對不上的（沒碼、碼錯、做過、太舊）：不簽名，只回一句話；同一種連著來只記一行加次數。
    //   tell 回給丹、log 是她畫面上那行（「她」指她自己會很怪，分兩句寫）
    const REFUSE = {
        bad:  { tell: '看不懂這件工作。',                         log: '看不懂的工作' },
        off:  { tell: '借接口的開關沒開。',                       log: '開關沒開的時候送來的' },
        code: { tell: '通行碼不對（要用她這次打開時畫面上那組）。', log: '通行碼不對' },
        dup:  { tell: '這件做過了，不再做第二次。',               log: '同一件又送一次' },
        old:  { tell: '這件工作太舊了，重新送一次。',             log: '太久以前的工作' },
    };
    async function _refuse(id, why) {
        const r = REFUSE[why];
        _logRefuse(why, r.log);
        await _post({ payload: JSON.stringify({ v: 1, id: id, ok: false, text: r.tell, at: Date.now() }), sig: '' });
        _repaint();
    }
    async function _post(body) {
        try {
            const r = await fetch(BASE + '/done', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body), cache: 'no-store' });
            return r.ok;
        } catch (e) { return false; }
    }

    // ── 欄位檢查 ──
    function _onlyKeys(a, keys, name) {
        const bad = Object.keys(a).filter(k => keys.indexOf(k) < 0);
        if (bad.length) throw new Error('不認得的欄位：' + bad.slice(0, 5).join('、') + '（' + name + '只收 ' + keys.join('、') + '）');
    }
    function _str(v, max, label, re) {
        if (v == null) return '';
        if (typeof v !== 'string') throw new Error(label + '要是文字');
        const s = v.trim();
        if (s.length > max) throw new Error(label + '太長（最多 ' + max + ' 字）');
        if (s && re && !re.test(s)) throw new Error(label + '的寫法不對');
        return s;
    }
    function _int(v, lo, hi, def, label) {
        if (v == null || v === '') return def;
        const n = Number(v);
        if (!Number.isFinite(n) || n < lo || n > hi) throw new Error(label + '要在 ' + lo + '～' + hi + ' 之間');
        return Math.round(n);
    }
    function _b64Blob(b64, mime) {
        const bin = atob(String(b64).replace(/\s+/g, ''));
        const buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        return new Blob([buf], { type: mime });
    }
    function _blobB64(blob) {
        return new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(String(fr.result || '').replace(/^data:[^,]*,/, ''));
            fr.onerror = () => reject(new Error('檔案讀不出來'));
            fr.readAsDataURL(blob);
        });
    }
    function _ext(mime) { return ({ 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'audio/mpeg': 'mp3', 'text/plain': 'txt', 'application/json': 'json' })[mime] || 'png'; }
    function _chars(s) { return Array.from(String(s || '')).length; }

    // ── 畫圖：用哪組接口 ──
    function _plainName(s) { return String(s || '').replace(/https?:\/\/([^\/\s]+)\S*/g, '$1'); }   // 沒取名的節點名字是網址：只留站名
    function _connItems(IM) {
        let nodes = [];
        try { nodes = JSON.parse(localStorage.getItem('os_img_capi_nodes') || '[]'); } catch (e) {}
        const modelOf = { capi: String((IM.config && IM.config.customApi && IM.config.customApi.model) || '') };
        (Array.isArray(nodes) ? nodes : []).forEach(n => { if (n && n.id) modelOf['capi:' + n.id] = String(n.model || ''); });
        return (IM.connList() || []).map(c => ({ id: c.id, svc: c.svc, name: _plainName(c.name), model: modelOf[c.id] || '' }));
    }
    function _connLine(i) { return i.name + (i.model && i.name.indexOf(i.model) < 0 ? '（' + i.model + '）' : '') + ' [' + i.id + ']'; }
    function _pickConn(IM, q) {
        const items = _connItems(IM);
        if (!q) {   // 沒指定：照「插圖」那一列在用的
            const r = (IM.getRoutes() || {}).scene;
            const hit = (r && r.conn) ? IM._resolveConn(r.conn) : null;
            if (hit) { const it = items.find(i => i.id === r.conn); return { name: it ? it.name : r.conn, opts: hit }; }
            const svc = IM.legacyServiceOf('scene');
            const it = items.find(i => i.svc === svc && i.id.indexOf(':') < 0);
            return { name: it ? it.name : svc, opts: { provider: svc } };
        }
        const ql = q.toLowerCase();
        let hits = items.filter(i => i.id === q);
        if (!hits.length) hits = items.filter(i => i.name.toLowerCase().indexOf(ql) >= 0 || i.model.toLowerCase().indexOf(ql) >= 0);
        if (hits.length > 1) { const exact = hits.filter(i => i.model.toLowerCase() === ql); if (exact.length === 1) hits = exact; }
        // 「自訂接口・目前那組」常常就是某個節點：模型一樣的話算節點那個
        if (hits.length > 1) hits = hits.filter(i => !(i.id === 'capi' && i.model && hits.some(o => o.id.indexOf('capi:') === 0 && o.model === i.model)));
        if (!hits.length) throw new Error('找不到「' + q + '」這組接口。這裡有：' + items.map(_connLine).join('；'));
        if (hits.length > 1) throw new Error('「' + q + '」對到好幾組接口。是哪一組要寫清楚，或直接寫方括號裡的編號：' + hits.map(_connLine).join('；'));
        const opts = IM._resolveConn(hits[0].id);
        if (!opts) throw new Error('「' + hits[0].name + '」這組現在用不了（可能被刪了）');
        return { name: hits[0].name, opts: opts };
    }
    function _imgCost(IM, t0) {
        const u = IM._lastCustomApiUsage;
        if (!u || !(u.at >= t0) || !u.usage) return null;
        const us = u.usage, d = us.input_tokens_details || {};
        const iIn = d.image_tokens | 0;
        const tIn = (d.text_tokens != null) ? (d.text_tokens | 0) : Math.max(0, (us.input_tokens | 0) - iIn);
        const out = us.output_tokens | 0;
        const cost = { tokIn: tIn + iIn, tokOut: out };
        const rate = u.official ? IMG_RATES.find(r => r.re.test(u.model || '')) : null;
        if (rate) cost.usd = (tIn * rate.t + iIn * rate.i + out * rate.o) / 1e6;
        return cost;
    }

    // ── 念台詞：花多少 ──
    function _ttsCost(MM, t0) {
        const info = typeof MM.lastInfo === 'function' ? MM.lastInfo() : null;
        const cfg = typeof MM.getConfig === 'function' ? MM.getConfig() : {};
        const model = (info && info.model) || cfg.speechModel || '';
        const chars = (info && info.at >= t0 && info.chars != null) ? (info.chars | 0) : null;
        const cost = { model: model };
        if (chars != null) {
            cost.chars = chars;
            const tier = /hd/i.test(model) ? 'hd' : 'turbo';
            if (((info && info.provider) || cfg.provider) === 'io') cost.usd = chars * TTS_RATES.io[tier] / 1e6;
            else cost.cny = chars * TTS_RATES.cn[tier] / 1e4;
        }
        return cost;
    }
    function _noteVoice(cost, ok) {
        try { win.OS_USAGE && win.OS_USAGE.note({ kind: 'voice', source: 'minimax', model: (cost && cost.model) || '', chars: (cost && cost.chars) || 0, ok: ok }); } catch (e) {}
    }

    // ── 白名單：只有這四種 ──
    const IMG_KEYS = ['prompt', 'conn', 'width', 'height', 'quality', 'type', 'raw', 'model', 'refs'];
    const QUALITY_NAME = { low: '低畫質', medium: '中畫質', high: '高畫質' };
    const VOICE_KEYS = ['text', 'voice', 'lang', 'speed', 'emotion'];
    const TEXT_KEYS = ['system', 'user', 'task', 'via'];
    const JEV_KEYS = ['state', 'questions'];
    const JOBS = {
        image: {
            name: '畫圖', busy: '正在畫圖…',
            check(a) {
                _onlyKeys(a, IMG_KEYS, '畫圖');
                const prompt = _str(a.prompt, 4000, '要畫什麼（prompt）');
                if (!prompt) throw new Error('少了要畫什麼（prompt）');
                if (a.raw != null && typeof a.raw !== 'boolean') throw new Error('raw 要是 true 或 false');
                const refs = a.refs == null ? [] : a.refs;
                if (!Array.isArray(refs) || refs.length > 4) throw new Error('參考圖（refs）最多 4 張');
                return {
                    prompt: prompt,
                    conn: _str(a.conn, 120, '接口（conn）'),
                    width: _int(a.width, 256, 2048, 1024, '寬（width）'),
                    height: _int(a.height, 256, 2048, 1024, '高（height）'),
                    quality: _str(a.quality, 10, '畫質（quality）', /^(low|medium|high)$/),
                    type: _str(a.type, 10, '用途（type）', /^(scene|char|bg|item)$/) || 'scene',
                    raw: a.raw !== false,   // 預設原樣送：不接她自己故事用的底詞
                    model: _str(a.model, 80, '模型（model）', /^[\w.\-:\/]+$/),
                    refs: refs.map((r, i) => {
                        if (!r || typeof r !== 'object') throw new Error('第 ' + (i + 1) + ' 張參考圖讀不出來');
                        const b64 = typeof r.b64 === 'string' ? r.b64 : '';
                        if (!b64 || b64.length > REF_MAX || !/^[A-Za-z0-9+/=\s]+$/.test(b64)) throw new Error('第 ' + (i + 1) + ' 張參考圖讀不出來（最多 6MB）');
                        return {
                            name: _str(r.name, 60, '參考圖的名字') || ('reference ' + (i + 1)),
                            mime: _str(r.mime, 20, '參考圖的格式', /^image\/(png|jpeg|webp)$/) || 'image/png',
                            b64: b64,
                        };
                    }),
                };
            },
            async run(a) {
                const IM = win.OS_IMAGE_MANAGER;
                if (!IM || typeof IM.generate !== 'function') throw new Error('這個頁面沒有生圖');
                const pick = _pickConn(IM, a.conn);
                const opts = Object.assign({ width: a.width, height: a.height, raw: a.raw, force: true }, pick.opts);
                if (a.model) opts.model = a.model;
                const capi = opts.provider === 'custom_api';
                if (a.refs.length && !capi) throw new Error('「' + pick.name + '」不收參考圖（只有自訂接口收）');
                if (capi && (a.quality || a.refs.length)) {
                    opts.customApi = Object.assign({}, opts.customApi || (IM.config && IM.config.customApi) || {});
                    if (a.quality) opts.customApi.quality = a.quality;
                    if (a.refs.length) {
                        opts.customApi.refImages = true;
                        opts.refBlobs = a.refs.map(r => ({ name: r.name, kind: 'char', blob: _b64Blob(r.b64, r.mime) }));
                    }
                }
                const t0 = Date.now();
                const url = await IM.generate(a.prompt, a.type, opts);
                if (!url) {
                    const le = IM._lastCustomApiError;
                    throw new Error((capi && le && le.at >= t0 && le.msg) ? le.msg : '「' + pick.name + '」沒回圖（到奧瑞亞的圖片設置試試這組接口）');
                }
                const blob = await (await fetch(url)).blob();
                const mime = /^image\//.test(blob.type) ? blob.type : 'image/png';
                return { ok: true, text: '畫好了（' + pick.name + '）', conn: pick.name,
                    files: [{ name: 'image.' + _ext(mime), mime: mime, b64: await _blobB64(blob) }], cost: _imgCost(IM, t0) };
            },
            what(a, res) { return ['畫圖', res.conn || a.conn, a.width + '×' + a.height, QUALITY_NAME[a.quality]].filter(Boolean).join('・'); },
        },
        voice: {
            name: '念台詞', busy: '正在念台詞…',
            check(a) {
                _onlyKeys(a, VOICE_KEYS, '念台詞');
                const text = _str(a.text, 2000, '台詞（text）');
                if (!text) throw new Error('少了要念的台詞（text）');
                const voice = _str(a.voice, 120, '聲音（voice）', /^[\w.\-]+$/);
                if (!voice) throw new Error('少了用哪個聲音（voice，填聲音的編號）');
                let speed;
                if (a.speed != null) {
                    speed = Number(a.speed);
                    if (!(speed >= 0.5 && speed <= 2)) throw new Error('語速（speed）要在 0.5～2 之間');
                }
                return {
                    text: text, voice: voice, speed: speed,
                    lang: _str(a.lang, 40, '語言（lang）', /^[A-Za-z][A-Za-z ,_\-]*$/),
                    emotion: _str(a.emotion, 20, '情緒（emotion）', /^(happy|sad|angry|fearful|disgusted|surprised|calm|fluent|neutral|whisper)$/),
                };
            },
            async run(a) {
                const MM = win.OS_MINIMAX;
                if (!MM || typeof MM.synth !== 'function') throw new Error('這個頁面沒有 MiniMax 語音');
                const o = {};
                if (a.lang) o.language_boost = a.lang;
                if (a.speed != null) o.speed = a.speed;
                if (a.emotion) o.emotion = a.emotion;
                const t0 = Date.now();
                let blob;
                try { blob = await MM.synth(a.text, a.voice, o); }
                catch (e) {
                    _noteVoice(_ttsCost(MM, t0), false);
                    const m = (e && e.message) || String(e);
                    throw new Error(m === 'NO_KEY' ? 'MiniMax 還沒填金鑰（奧瑞亞設置的語音那頁）'
                        : m === 'NO_VOICE' ? '少了聲音編號'
                        : m === 'NOTHING_TO_SAY' ? '這句清掉括號、標點之後沒有字可以念' : m);
                }
                const cost = _ttsCost(MM, t0);
                _noteVoice(cost, true);
                return { ok: true, text: '念好了', files: [{ name: 'voice.mp3', mime: 'audio/mpeg', b64: await _blobB64(blob) }], cost: cost };
            },
            what(a) { return ['念台詞', a.voice, _chars(a.text) + ' 字'].join('・'); },
        },
        // 11-18 加：叫文字模型、問 Jev（世界門場記表要先拿舊章考「判岔路準不準」，她：「可以，我開那個key給你測」）。
        //   照她設置裡「哪件事走哪個模型」那張表走（task＝那一列，預設 extract＝每輪記狀態那通），回覆存成文字檔交回。
        //   叫模型的記帳照舊由 OS_API 那邊記；Jev 記進 OS_JEV_USAGE（tag keyrun）。
        text: {
            name: '叫文字模型', busy: '正在叫文字模型…',
            check(a) {
                _onlyKeys(a, TEXT_KEYS, '叫文字模型');
                const user = _str(a.user, 60000, '要送的內容（user）');
                if (!user) throw new Error('少了要送的內容（user）');
                const S = win.OS_SETTINGS;
                const tasks = (S && Array.isArray(S.LLM_TASKS)) ? S.LLM_TASKS : [];
                const task = _str(a.task, 40, '哪件事（task）', /^[\w\-]+$/) || 'extract';
                const row = tasks.find(t => t.id === task);
                if (tasks.length && !row) throw new Error('「' + task + '」不是「哪件事走哪個模型」裡的一列。這裡有：' + tasks.map(t => t.id + '（' + t.name + '）').join('、'));
                const via = _str(a.via, 10, '走哪個入口（via）', /^(sec|main)$/) || 'sec';
                return { system: _str(a.system, 20000, '系統指令（system）'), user: user, task: task, taskName: row ? row.name : task, via: via };
            },
            async run(a) {
                const API = win.OS_API;
                const fn = API && (a.via === 'main' ? API.chatMain : API.chatSecondary);
                if (typeof fn !== 'function') throw new Error('這個頁面叫不到文字模型');
                const messages = (a.system ? [{ role: 'system', content: a.system }] : []).concat([{ role: 'user', content: a.user }]);
                const reply = await new Promise((resolve, reject) => {
                    let done = false;
                    const timer = setTimeout(() => { if (done) return; done = true; reject(new Error('模型 5 分鐘沒回')); }, 300000);
                    fn.call(API, messages, null,
                        (t) => { if (done) return; done = true; clearTimeout(timer); resolve(String(t == null ? '' : t)); },
                        (e) => { if (done) return; done = true; clearTimeout(timer); reject(e instanceof Error ? e : new Error(String((e && e.message) || e))); },
                        { task: a.task });
                });
                if (!reply.trim()) throw new Error('模型回了空的');
                return { ok: true, text: '回好了（' + _chars(reply) + ' 字）',
                    files: [{ name: 'reply.txt', mime: 'text/plain', b64: await _blobB64(new Blob([reply], { type: 'text/plain' })) }] };
            },
            what(a) { return ['叫文字模型', a.taskName, _chars(a.system) + _chars(a.user) + ' 字'].join('・'); },
        },
        jev: {
            name: '問 Jev', busy: '正在問 Jev…',
            check(a) {
                _onlyKeys(a, JEV_KEYS, '問 Jev');
                const obj = (v) => v && typeof v === 'object' && !Array.isArray(v);
                if (!obj(a.state)) throw new Error('state 要是一個物件');
                if (JSON.stringify(a.state).length > 60000) throw new Error('state 太長（最多 6 萬字）');
                if (!obj(a.questions)) throw new Error('questions 要是一個物件');
                const ids = Object.keys(a.questions);
                if (!ids.length || ids.length > 10) throw new Error('一次問 1～10 題（Jev 一批太多題常常失敗）');
                const questions = {};
                ids.forEach(id => {
                    if (!/^[\w\-]{1,40}$/.test(id)) throw new Error('題目代號「' + id.slice(0, 20) + '」只能用英文字母、數字、底線');
                    const q = a.questions[id];
                    if (!obj(q)) throw new Error(id + ' 要是一個物件');
                    _onlyKeys(q, ['type', 'instructions', 'criteria'], '每一題');
                    const type = _str(q.type, 10, id + ' 的題型（type）', /^(boolean|choice|score)$/);
                    if (!type) throw new Error(id + ' 少了題型（boolean、choice、score）');
                    const ins = _str(q.instructions, 2000, id + ' 的題目（instructions）');
                    if (!ins) throw new Error(id + ' 少了題目（instructions）');
                    const out = { type: type, instructions: ins };
                    if (q.criteria != null) {
                        const c = q.criteria;
                        const list = Array.isArray(c) ? c : (obj(c) ? Object.keys(c) : null);
                        if (!list || list.length > 30 || JSON.stringify(c).length > 8000) throw new Error(id + ' 的選項（criteria）最多 30 個');
                        out.criteria = c;
                    }
                    questions[id] = out;
                });
                return { state: a.state, questions: questions };
            },
            async run(a) {
                const J = win.OS_JEV_CONN;
                if (!J || !J.ready()) throw new Error('Jev 還沒接（設置 → AI 模型 → 決策模型那三格要填）');
                const c = J.get();
                const ctrl = new AbortController();
                const timer = setTimeout(() => ctrl.abort(), 30000);
                let res, data = null;
                try {
                    res = await fetch(c.url, {
                        method: 'POST',
                        headers: { 'Authorization': 'Bearer ' + c.key, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ model: c.model, state: a.state, questions: a.questions }),
                        signal: ctrl.signal,
                    });
                    data = await res.json().catch(() => null);
                } catch (e) {
                    throw new Error(ctrl.signal.aborted ? 'Jev 30 秒沒回' : ((e && e.message) || String(e)));
                } finally { clearTimeout(timer); }
                const ok = !!(res && res.ok && data && data.answers);
                try { win.OS_JEV_USAGE && win.OS_JEV_USAGE.add('keyrun', data, ok); } catch (e) {}
                if (!ok) throw new Error('Jev 沒回答：' + ((data && data.error && (data.error.message || data.error)) || ('HTTP ' + (res ? res.status : '?'))));
                const gw = data.providerMetadata && data.providerMetadata.gateway;
                const cost = (gw && typeof gw.cost === 'number') ? { usd: gw.cost } : null;
                const json = JSON.stringify({ answers: data.answers }, null, 1);
                return { ok: true, text: '答好了（' + Object.keys(data.answers).length + ' 題）', cost: cost,
                    files: [{ name: 'answers.json', mime: 'application/json', b64: await _blobB64(new Blob([json], { type: 'application/json' })) }] };
            },
            what(a) { return ['問 Jev', Object.keys(a.questions).length + ' 題'].join('・'); },
        },
    };

    // ── 記錄 ──
    function _logLoad() {
        try { const v = JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
    }
    function _logSave(list) {
        try { win.AUI && win.AUI.lsSet(LOG_KEY, JSON.stringify(list.slice(0, LOG_MAX)), '借接口的記錄'); } catch (e) {}
    }
    function _logJob(meta, res) {
        const c = res.cost || {};
        const line = { t: Date.now(), kind: meta.kind || '', what: String(meta.what || '').slice(0, 120), ok: !!res.ok };
        // 她畫面上只放第一句：後面那串（可以用的接口、編號）是寫給丹挑的
        if (!res.ok && !meta.quiet) line.err = String(res.text || '').split(/(?<=。)/)[0].slice(0, 160);
        if (typeof c.usd === 'number') line.usd = c.usd;
        if (typeof c.cny === 'number') line.cny = c.cny;
        if (res.ms) line.ms = res.ms;
        const list = _logLoad();
        list.unshift(line);
        _logSave(list);
        if (res.ok) {
            _stats.n++;
            if (line.usd) _stats.usd += line.usd;
            if (line.cny) _stats.cny += line.cny;
        }
        return line;
    }
    function _logPatch(line) {
        const list = _logLoad();
        const hit = list.find(x => x.t === line.t && x.what === line.what);
        if (hit) { Object.assign(hit, line); _logSave(list); }
    }
    function _logRefuse(why, text) {
        const list = _logLoad();
        const last = list[0];
        if (last && last.why === why && Date.now() - last.t < 10 * 60000) { last.n = (last.n || 1) + 1; last.t = Date.now(); }
        else list.unshift({ t: Date.now(), why: why, what: '擋下：' + text, ok: false, n: 1 });   // text＝REFUSE 裡給她看的那句
        _logSave(list);
    }
    function clearLog() { _logSave([]); _repaint(); }

    // ── 畫面 ──
    function _money(usd, cny) {
        const f = (n) => n >= 0.01 ? n.toFixed(3) : n.toFixed(4);
        const out = [];
        if (usd) out.push('US$' + f(usd));
        if (cny) out.push('¥' + f(cny));
        return out.join('＋');
    }
    function _left() {
        const s = Math.max(0, Math.ceil((_until - Date.now()) / 1000));
        const p = (n) => String(n).padStart(2, '0');
        const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
        return '還剩 ' + (h ? h + ':' + p(m) : m) + ':' + p(s % 60);
    }
    function _stateText() {
        if (_busy) return _busy;
        if (_peer && Date.now() - _peer < 45000) return '對方連上了，等工作進來';
        return '等對方來拿工作…';
    }
    function _when(t) {
        const d = new Date(t), now = new Date(), p = (n) => String(n).padStart(2, '0');
        const hm = p(d.getHours()) + ':' + p(d.getMinutes());
        return d.toDateString() === now.toDateString() ? hm : (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hm;
    }
    function _lineHtml(x) {
        const icon = x.why ? 'fa-solid fa-ban' : (x.ok ? 'fa-solid fa-check' : 'fa-solid fa-xmark');
        const cls = x.why ? 'is-block' : (x.ok ? 'is-ok' : 'is-fail');
        const what = x.what + (x.n > 1 ? '（' + x.n + ' 次）' : '');
        const note = x.lost ? '做好了，但對方已經走了，沒交回去' : (x.err || '');
        return '<div class="keyrun-line ' + cls + '"><i class="' + icon + '"></i>'
            + '<span class="keyrun-when">' + _esc(_when(x.t)) + '</span>'
            + '<span class="keyrun-what">' + _esc(what) + '</span>'
            + '<span class="keyrun-cost">' + _esc(_money(x.usd, x.cny)) + '</span>'
            + (note ? '<span class="keyrun-note">' + _esc(note) + '</span>' : '')
            + '</div>';
    }
    function _html() {
        const help = (win.AUI && win.AUI.helpBtn) ? win.AUI.helpBtn('keyrun') : '';
        let h = '<div class="set-label"><span><i class="fa-solid fa-key"></i> 借接口給電腦上的 AI' + help + '</span>'
            + '<label class="toggle-switch"><input type="checkbox" class="keyrun-switch"' + (_on ? ' checked' : '') + '><span class="slider"></span></label></div>';
        if (_on) {
            const sum = _stats.n ? '這次做了 ' + _stats.n + ' 件' + (_money(_stats.usd, _stats.cny) ? '・約 ' + _money(_stats.usd, _stats.cny) : '') : '';
            h += '<div class="keyrun-live">'
                + '<div class="keyrun-row"><span class="keyrun-left">' + _left() + '</span>'
                + '<button type="button" class="set-btn keyrun-more">多 ' + MORE_MIN + ' 分鐘</button></div>'
                + '<div class="keyrun-cap">通行碼</div>'
                + '<div class="keyrun-row"><input class="set-input keyrun-code" readonly value="' + _esc(_code) + '">'
                + '<button type="button" class="set-btn keyrun-copy"><i class="fa-regular fa-copy"></i> 複製</button></div>'
                + '<div class="keyrun-state' + (_busy ? ' is-busy' : '') + '">' + _esc(_stateText()) + '</div>'
                + (sum ? '<div class="keyrun-sum">' + _esc(sum) + '</div>' : '')
                + '</div>';
        }
        const list = _logLoad();
        if (list.length) {
            h += '<div class="keyrun-log"><div class="keyrun-log-head"><span>記錄</span>'
                + '<button type="button" class="keyrun-clear">清掉</button></div>'
                + list.slice(0, SHOW_MAX).map(_lineHtml).join('') + '</div>';
        }
        return h;   // 沒有記錄：開著時上面那行「等對方來拿工作…」就是空的樣子，關著只剩開關那排
    }
    function _repaint() {
        _views.forEach(el => { if (el.isConnected) el.innerHTML = _html(); else _views.delete(el); });
    }
    function _tickFn() {
        _views.forEach(el => { if (!el.isConnected) _views.delete(el); });
        if (!_views.size) { clearInterval(_tick); _tick = null; return; }
        if (!_on) return;
        _views.forEach(el => {
            const l = el.querySelector('.keyrun-left');
            if (l) l.textContent = _left();
            const s = el.querySelector('.keyrun-state');
            if (s) s.textContent = _stateText();
        });
    }
    function _copy(el) {
        const inp = el.querySelector('.keyrun-code');
        const done = () => _toast('通行碼複製好了，貼給要借用的 AI', 'success');
        const fallback = () => {
            try { inp.focus({ preventScroll: true }); inp.select(); if (document.execCommand('copy')) return done(); } catch (e) {}
            _toast('沒複製到，長按通行碼自己複製', 'warn');
        };
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(_code).then(done, fallback);
            else fallback();
        } catch (e) { fallback(); }
    }
    function _regHelp() {
        if (!(win.AUI && win.AUI.registerHelp)) return;
        win.AUI.registerHelp({ keyrun: { title: '借接口給電腦上的 AI',
            body: '打開後，這台電腦上的 AI（像丹）可以請奧瑞亞用妳接好的接口畫圖、念台詞、叫文字模型、問 Jev，只拿得到圖、聲音和模型回的字，拿不到金鑰。叫文字模型照妳「哪件事走哪個模型」那張表走。'
                + '它要有這次的通行碼才叫得動，時間到或重整頁面就自己關。瀏覽器問要不要讓網頁連到這台裝置，按允許。' } });
    }
    function mount(el) {
        if (!el) return;
        _regHelp();
        _views.add(el);
        el.innerHTML = _html();
        if (!el._keyrunBound) {
            el._keyrunBound = true;
            el.addEventListener('change', (e) => {
                const sw = e.target.closest && e.target.closest('.keyrun-switch');
                if (!sw) return;
                if (sw.checked) on().then(ok => { if (!ok) _repaint(); });
                else off('hand');
            });
            el.addEventListener('click', (e) => {
                const t = e.target.closest && e.target.closest('button');
                if (!t || !el.contains(t)) return;
                if (t.classList.contains('keyrun-more')) more();
                else if (t.classList.contains('keyrun-copy')) _copy(el);
                else if (t.classList.contains('keyrun-clear')) {
                    const ask = win.AUI && win.AUI.confirm ? win.AUI.confirm('清掉借接口的記錄？') : Promise.resolve(true);
                    Promise.resolve(ask).then(ok => { if (ok) clearLog(); });
                }
            });
        }
        if (!_tick) _tick = setInterval(_tickFn, 1000);
    }

    // 通行碼不對外給：頁面裡別的程式（創作室做的 app 那種）拿不到，只有這一格畫面上看得到
    win.OS_KEYRUN = {
        on: on, off: off, more: more, mount: mount, clearLog: clearLog,
        isOn: () => _on,
        leftMs: () => _on ? Math.max(0, _until - Date.now()) : 0,
        log: () => _logLoad(),
        PORT: PORT,
    };
    if (win !== window) window.OS_KEYRUN = win.OS_KEYRUN;
})();
