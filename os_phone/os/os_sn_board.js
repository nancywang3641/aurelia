// ----------------------------------------------------------------
// [檔案] os_phone/os/os_sn_board.js — 🧑‍💼 SN 32 樓研討白板（本體：規則、資料、值班、收進世界）
// 職責：住戶照時間上班，一班一通只做一件事（挑毛病 > 寫稿 > 湊點子 > 剪素材 > 不叫）；
//   她丟素材、孵化、回爐、放棄，同意後把稿寫進世界書【奧瑞亞-白板】。畫面在 os_sn_board_ui.js（掛回 OS_SN_BOARD）。
// 設計書：docs/sn_board_design.md（只在本機）。排班骨架照 os_cafe_staff.js（時間表、錯過只補一班、鎖）。
// 資料：OS_DB 通用資料 sn_board::global::{staff,board,shifts}；酒館、手機各一份（同世界書）。
// 🚨 值班的人：小機（OS_XIAOJI 門卡＝花錢）／宿舍住戶 claude、codex（ClaudeTerminal.sendAs 經過橋＝會員額度）。
// 🚨 送給值班的人的只有白板自己的東西＋世界書條目，不送跑團原文（那是問題箱的事）。
// 🚨 改白板一律在 _lockData 裡「重讀→改→寫」：值班那通要幾分鐘，她中間按的東西不能被蓋掉。
// 暴露：window.OS_SN_BOARD
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;

    const APP = 'sn_board';
    const BOOK = '【奧瑞亞-白板】';
    const REF_BOOKS = ['【奧瑞亞世界】', '【奧瑞亞-視差】', '【奧瑞亞-人物核心】', BOOK];
    const CAPS = { WAIT: 3, IDEAS: 5, MATS: 20, COMBINE_AT: 10, COMBINE_SHOW: 8, CLIP_MAX: 3, DROPPED: 30, SHIFTS: 40, REFS: 8, REF_CUT: 600, ENTRIES: 8 };
    const LEN = { MAT: 80, CARD: 120, WHY: 60, SRC: 40, IDEA: 60, KEY: 12, KEYS: 6, TITLE: 24, FRONT: 300, NAME: 30, ENTRY: 1200, NOTE: 120, SAY: 20, REDO: 200 };
    const KINDS = { faction: '勢力', place: '地點', person: '人物', conflict: '衝突', rule: '規矩' };
    const JOBS = { check: '挑毛病', write: '寫稿', combine: '湊點子', clip: '剪素材', idle: '沒事做' };
    const SLEEP_MS = 14 * 86400000;

    function _g(n) { return win[n] || window[n]; }
    function _mkId(p) { return (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
    function _one(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
    function _cut(s, n) { s = _one(s); return s.length > n ? s.slice(0, n) : s; }
    // 模型寫的素材卡太長：在句子邊上切；引的詞被切到一半（引號開了沒關）就整段引的拿掉，不留「I k」那種半截
    //   10-10 她截圖：讀歌詞剪的卡寫了說明＋一句英文歌詞，超過就被硬切在字中間
    const QUOTES = [['「', '」'], ['『', '』'], ['“', '”'], ['（', '）'], ['【', '】'], ['《', '》'], ['(', ')']];   // 括號開了沒關一樣（影片標題被切成「…（警」）
    function _cutNice(s, n) {
        s = _one(s);
        if (s.length <= n) return s;
        let t = s.slice(0, n);
        let open = -1;
        QUOTES.forEach(([a, b]) => { const i = t.lastIndexOf(a); if (i > t.lastIndexOf(b) && i > open) open = i; });
        if ((t.match(/"/g) || []).length % 2) open = Math.max(open, t.lastIndexOf('"'));
        if (open > 0) t = t.slice(0, open);
        else { const m = t.match(/^[\s\S]*[。！？；，」』”）.!?]/); if (m && m[0].length >= n / 2) t = m[0]; }
        return t.replace(/[\s—–\-:：，、；,]+$/, '');
    }
    function _cutBlock(s, n) { s = String(s == null ? '' : s).replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim(); return s.length > n ? s.slice(0, n) : s; }
    function _keys(s) { return String(s == null ? '' : s).split(/[,，、;；]/).map(x => _cut(x, LEN.KEY)).filter(Boolean).slice(0, LEN.KEYS); }
    function _plain(s) { return String(s == null ? '' : s).replace(/<[^>]+>/g, ''); }

    // ── 純規則（tmp/sn_board_test.cjs 直接測）──────────────────────
    function emptyBoard() { return { materials: [], ideas: [], drafts: [], world: [], dropped: [] }; }
    function normBoard(v) {
        const b = emptyBoard();
        if (v && typeof v === 'object') Object.keys(b).forEach(k => { if (Array.isArray(v[k])) b[k] = v[k]; });
        return b;
    }
    // 「等妳看」那 3 份：稿（不管挑過沒）＋孵化中的點子都算，滿了就先不孵
    function waitCount(b) { return b.drafts.length + b.ideas.filter(i => i.state === 'hatching').length; }
    function canHatch(b) { return waitCount(b) < CAPS.WAIT; }
    // 從沒打開過（lastVisit 0）不算睡著；兩週沒打開才睡
    function isAsleep(st, now) { return !!(st && st.lastVisit) && now - st.lastVisit > SLEEP_MS; }
    function nextSlot(slots, next) {
        const s = Array.isArray(slots) ? slots : [];
        const a = next === 1 ? 1 : 0;
        if (s[a]) return a;
        if (s[1 - a]) return 1 - a;
        return -1;
    }
    // 只剩一個人值班：他自己寫、還等人挑的稿直接放進「等妳看」（標沒人挑過），不然永遠卡著
    function unstick(b, soloId) {
        if (!soloId) return b;
        b.drafts.forEach(d => { if (d.state === 'check' && d.writer && d.writer.id === soloId) { d.state = 'wait'; d.unchecked = true; } });
        return b;
    }
    function pickJob(b, who) {
        const id = who && who.id;
        const d = b.drafts.find(x => x.state === 'check' && !(x.writer && x.writer.id === id));
        if (d) return { kind: 'check', draftId: d.id };
        const h = b.ideas.find(x => x.state === 'hatching');
        if (h) return { kind: 'write', ideaId: h.id };
        const wild = b.ideas.filter(x => x.state === 'wild').length;
        if (b.materials.length >= CAPS.COMBINE_AT && wild < CAPS.IDEAS) {
            const order = b.materials.filter(m => m.by === 'rae').concat(b.materials.filter(m => m.by !== 'rae'));
            return { kind: 'combine', matIds: order.slice(0, CAPS.COMBINE_SHOW).map(m => m.id) };
        }
        if (b.materials.length < CAPS.MATS) return { kind: 'clip' };
        return { kind: 'idle' };
    }

    // 讀回覆：英文標籤；屬性的引號半形全形「」都收；<think> 那段先拿掉；包在 ``` 裡也照讀
    // 引號要成對：用哪一種開頭就找同一種的結尾（值裡面可以有「」或撇號：name="「黑潮」幫"、why="it's odd"）
    const _CLOSE = { '"': '"', '“': '”', '”': '”', "'": "'", '「': '」', '『': '』' };
    function _attr(s, name) {
        s = String(s || '');
        const m = s.match(new RegExp(name + '\\s*=\\s*(["“”\'「『])', 'i'));
        if (!m) return '';
        const start = m.index + m[0].length;
        const end = s.indexOf(_CLOSE[m[1]], start);
        return (end < 0 ? s.slice(start) : s.slice(start, end)).trim();
    }
    // 素材編號：全形數字、「素材1、素材3」這種寫法都收
    function _nums(s) {
        const t = String(s || '').replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
        return (t.match(/\d+/g) || []).map(Number);
    }
    // 有開頭沒結尾（回覆太長被切掉）：從開頭拿到最後
    function _tagOrCut(text, name) {
        const x = _tag(text, name);
        if (x) return x;
        const m = String(text || '').match(new RegExp('<' + name + '\\b([^>]*)>([\\s\\S]*)$', 'i'));
        return m ? { attrs: m[1], body: m[2], cut: true } : null;
    }
    function _tag(text, name) {
        const m = String(text || '').match(new RegExp('<' + name + '\\b([^>]*)>([\\s\\S]*?)</' + name + '>', 'i'));
        return m ? { attrs: m[1], body: m[2].trim() } : null;
    }
    function _all(text, name) {
        const out = [], re = new RegExp('<' + name + '\\b([^>]*)>([\\s\\S]*?)</' + name + '>', 'gi');
        let m;
        while ((m = re.exec(String(text || '')))) out.push({ attrs: m[1], body: m[2].trim() });
        return out;
    }
    function _entry(x) {
        const kind = _attr(x.attrs, 'kind').toLowerCase();
        const name = _cut(_attr(x.attrs, 'name'), LEN.NAME);
        const content = _cutBlock(_plain(x.body), LEN.ENTRY);
        if (!KINDS[kind] || !name || !content) return null;   // 清單外的種類（寫死的事件之類）不收
        const keys = _keys(_attr(x.attrs, 'keys'));
        // 🚨 沒關鍵字＝寫進世界書會變常駐（每輪都送，祕密就漏了）：一律用標題當關鍵字
        return { kind, name, keys: keys.length ? keys : [name], content };
    }
    function parseReply(text, job) {
        const t = String(text || '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '');
        const s = _tag(t, 'say');
        const say = s ? _cut(_plain(s.body), LEN.SAY) : '';
        const no = why => ({ ok: false, why });
        const kind = job && job.kind;
        if (kind === 'clip') {
            const mats = _all(t, 'material').map(x => ({ text: _cutNice(_plain(x.body), LEN.CARD), why: _cut(_attr(x.attrs, 'why'), LEN.WHY), source: _cutNice(_attr(x.attrs, 'source'), LEN.SRC) }))
                .filter(m => m.text).slice(0, CAPS.CLIP_MAX);
            return mats.length ? { ok: true, materials: mats, say } : no('沒剪出素材');
        }
        if (kind === 'combine') {
            const x = _tag(t, 'idea');
            if (!x) return no('沒湊出點子');
            const text2 = _cut(_plain(x.body), LEN.IDEA);
            const ids = job.matIds || [];
            const nums = _nums(_attr(x.attrs, 'from')).filter(n => n >= 1 && n <= ids.length);
            const from = Array.from(new Set(nums)).map(n => ids[n - 1]);
            if (!text2) return no('沒湊出點子');
            if (!from.length) return no('點子沒說用了哪幾張素材');
            return { ok: true, idea: { text: text2, keys: _keys(_attr(x.attrs, 'keys')), from }, say };
        }
        if (kind === 'write') {
            const x = _tagOrCut(t, 'draft');
            if (!x) return no('沒寫出稿');
            const title = _cut(_attr(x.attrs, 'title'), LEN.TITLE);
            const front = _tag(x.body, 'front');
            const entries = _all(x.body, 'entry').map(_entry).filter(Boolean).slice(0, CAPS.ENTRIES);
            const note = _tag(x.body, 'note');
            if (!title || !front || !front.body || !entries.length) return no(x.cut ? '稿寫到一半被切掉了（回覆太長）' : '稿缺標題、方向或條目');
            return { ok: true, draft: { title, front: _cutBlock(_plain(front.body), LEN.FRONT), entries, note: note ? _cut(_plain(note.body), LEN.NOTE) : '' }, say };
        }
        if (kind === 'check') {
            const x = _tagOrCut(t, 'review');
            if (!x) return no('沒交挑毛病的結果');
            const note = _tag(x.body, 'note');
            return { ok: true, review: { entries: _all(x.body, 'entry').map(_entry).filter(Boolean).slice(0, CAPS.ENTRIES), note: note ? _cut(_plain(note.body), LEN.NOTE) : '' }, say };
        }
        return no('這班沒事做');
    }

    function _who(w) { return { id: w.id, name: w.name, type: w.type }; }
    function applyResult(b, job, p, who, now, o) {
        o = o || {};
        const fail = why => ({ ok: false, why });
        if (job.kind === 'clip') {
            const room = CAPS.MATS - b.materials.length;
            if (room <= 0) return fail('素材已經滿了');
            const add = p.materials.slice(0, room).map(m => Object.assign({ id: _mkId('m'), by: who.id, byName: who.name, at: now }, m));
            b.materials = b.materials.concat(add);
            return { ok: true, board: b, text: '剪了 ' + add.length + ' 張素材' };
        }
        if (job.kind === 'combine') {
            const used = p.idea.from.map(id => b.materials.find(m => m.id === id)).filter(Boolean);
            if (!used.length) return fail('那幾張素材已經不在了');
            if (b.ideas.filter(i => i.state === 'wild').length >= CAPS.IDEAS) return fail('野生點子已經滿了');
            const ids = new Set(used.map(m => m.id));
            b.materials = b.materials.filter(m => !ids.has(m.id));
            b.ideas.push({ id: _mkId('i'), text: p.idea.text, keys: p.idea.keys, from: used.map(m => ({ text: m.text, why: m.why, source: m.source, by: m.by })),
                by: who.id, byName: who.name, at: now, state: 'wild', redo: '', prev: null });
            return { ok: true, board: b, text: '湊了一個點子：' + p.idea.text };
        }
        if (job.kind === 'write') {
            const idea = b.ideas.find(i => i.id === job.ideaId && i.state === 'hatching');
            if (!idea) return fail('那個點子已經不在了');
            b.ideas = b.ideas.filter(i => i !== idea);
            const d = { id: _mkId('d'), idea: { text: idea.text, keys: idea.keys, from: idea.from, by: idea.by, byName: idea.byName },
                title: p.draft.title, front: p.draft.front, entries: p.draft.entries, writer: _who(who), checker: null,
                notes: p.draft.note ? [{ by: who.id, name: who.name, role: 'write', text: p.draft.note }] : [],
                state: o.solo ? 'wait' : 'check', unchecked: !!o.solo, peeked: false, at: now };
            b.drafts.push(d);
            return { ok: true, board: b, text: '寫了稿「' + d.title + '」', waitTitle: o.solo ? d.title : '' };
        }
        if (job.kind === 'check') {
            const d = b.drafts.find(x => x.id === job.draftId && x.state === 'check');
            if (!d) return fail('那份稿已經不在了');
            p.review.entries.forEach(e => { const i = d.entries.findIndex(x => x.name === e.name); if (i >= 0) d.entries[i] = e; });
            d.checker = _who(who);
            if (p.review.note) d.notes.push({ by: who.id, name: who.name, role: 'check', text: p.review.note });
            d.state = 'wait';
            return { ok: true, board: b, text: '挑完「' + d.title + '」的毛病', waitTitle: d.title };
        }
        return fail('這班沒事做');
    }

    // 她的動作（純）：改好的白板在 .board，畫面那邊包進 _lockData 寫回去
    // m＝一句話，或 materialFrom 合好的 { text, why, source, link }
    function addMaterial(b, m, now) {
        const o = (m && typeof m === 'object') ? m : { text: m };
        const t = _cut(o.text, LEN.CARD);   // 她打的那格本來就限 80；模型剪的卡在 parseReply 已經好好切過
        if (!t) return { ok: false, why: '先打一句話' };
        if (b.materials.length >= CAPS.MATS) return { ok: false, why: '素材滿 ' + CAPS.MATS + ' 張了，等他們湊成點子再丟' };
        b.materials.push({ id: _mkId('m'), text: t, why: _cut(o.why || '', LEN.MAT), source: o.source || '妳丟的', by: 'rae', byName: '妳', at: now, link: safeLink(o.link) });
        return { ok: true, board: b };
    }

    // ── 丟素材貼連結：YouTube 的先讀歌詞（橋讀字幕）剪成素材卡，讀不到才叫 Gemini 聽；其他連結當出處 ──
    //   她 10-10：「我丟音樂其實是想丟歌詞啦」——要的是歌詞，不是讓模型聽聲音。歌的字幕就是歌詞。
    const LINK_MAX = 300;
    function safeLink(s) {
        const t = String(s == null ? '' : s).trim();
        return (t && t.length <= LINK_MAX && /^https?:\/\/[^\s<>"']+$/i.test(t)) ? t : '';
    }
    // 公開的 YouTube 影片（一般、短網址、手機版、YouTube Music、Shorts）→ 正式網址；不是 YouTube 回空字串
    function youTubeUrl(s) {
        const t = safeLink(s);
        const m = t.match(/^https?:\/\/(?:www\.|m\.|music\.)?(?:youtu\.be\/([\w-]+)|youtube\.com\/(?:watch\?(?:[^#]*&)?v=([\w-]+)|(?:shorts|live|embed)\/([\w-]+)))/i);
        const id = m && (m[1] || m[2] || m[3]);
        return id ? 'https://www.youtube.com/watch?v=' + id : '';
    }
    // 連結上的時間（她按分享或複製網址時 YouTube 加的 t=871s；也認 1h2m3s、start=）→ 秒；沒有回 null
    function youTubeStart(s) {
        const m = String(s == null ? '' : s).match(/[?&#](?:t|start)=([0-9hms]+)/i);
        if (!m) return null;
        const v = m[1].toLowerCase();
        const part = k => { const x = v.match(new RegExp('(\\d+)' + k)); return x ? parseInt(x[1], 10) : 0; };
        const n = /^\d+s?$/.test(v) ? parseInt(v, 10) : part('h') * 3600 + part('m') * 60 + part('s');
        return n > 0 ? n : null;
    }
    // 她那句寫「第五首」「第 3 首」「第十二首」→ 幾；沒寫回 null。連結沒帶時間時當作停在那首
    //   10-10 她貼整張、寫「第五首歌詞好聽」，結果剪了另外三首、她那句還貼在那三張上
    const ZH_NUM = { 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    function noteSong(note) {
        const m = String(note == null ? '' : note).match(/第\s*([0-9０-９]+|[一二兩三四五六七八九十]+)\s*首/);
        if (!m) return null;
        const v = m[1].replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
        if (/^\d+$/.test(v)) return parseInt(v, 10) || null;
        const i = v.indexOf('十');
        if (i < 0) return v.length === 1 ? ZH_NUM[v] : null;
        if (v.indexOf('十', i + 1) >= 0 || i > 1) return null;
        const tens = i === 0 ? 1 : ZH_NUM[v[0]], rest = v.slice(i + 1);
        const ones = rest ? (rest.length === 1 ? ZH_NUM[rest] : undefined) : 0;
        return (tens && ones !== undefined) ? tens * 10 + ones : null;
    }
    function _mmss(sec) { sec = Math.max(0, Math.floor(sec || 0)); const m = Math.floor(sec / 60), s = sec % 60; return m + ':' + (s < 10 ? '0' : '') + s; }

    // ── 歌詞：橋讀來的章節（歌單每首的開始時間）＋原文字幕 → 要剪的那幾首 ──
    //   連結帶時間＝她停在哪首就那首；沒帶＝整張（後面重播的不算）。
    //   字幕稀到不像在唱＝那首沒讀到（多半是別的語言：YouTube 只照影片的語言聽，10-10 她那張第 5 首韓文歌只剩雜音）→ 叫 Gemini 只聽那首。
    const LYR = { WPM: 25, MIN_WORDS: 30, CHARS: 24000, CLIP: 240, SIG: 8 };   // CHARS：她那張 10 首英文歌整份約 1.9 萬字
    const CJK = /[\u3040-\u30ff\u3400-\u9fff]/g;   // 日文假名、中日漢字（沒空白分字的那幾種）
    function _lyrClean(t) { return String(t == null ? '' : t).replace(/\[[^\]]*\]/g, ' ').replace(/>>/g, ' ').replace(/\s+/g, ' ').trim(); }
    // 字數：英文、韓文照空白分；中日文一個字算半個（沒空白）。自動字幕把聽不懂的標成 Foreign speech，那不算
    function _lyrWords(t) {
        const s = _lyrClean(t).replace(/\b(?:foreign|speech)\b/gi, ' ');
        const cjk = (s.match(CJK) || []).length;
        return s.replace(CJK, ' ').split(/\s+/).filter(w => /[^.,!?'"“”‘’()\-–—…:;]/.test(w)).length + Math.ceil(cjk / 2);
    }
    function _lyrKeys(lines) {
        const out = [];
        lines.forEach(l => _lyrClean(l[1]).toLowerCase().replace(CJK, c => ' ' + c + ' ').split(/\s+/).forEach(w => {
            w = w.replace(/[.,!?'"“”‘’()\-–—…:;]/g, '');
            if (w && w !== 'foreign' && w !== 'speech') out.push({ t: l[0], w });
        }));
        return out;
    }
    // 歌單後半重播：開頭那幾個字在 after 之後又一模一樣出現的地方
    function _loopAt(lines, after) {
        const ws = _lyrKeys(lines);
        if (ws.length < LYR.SIG * 2) return null;
        const sig = ws.slice(0, LYR.SIG).map(x => x.w).join(' ');
        for (let i = LYR.SIG; i + LYR.SIG <= ws.length; i++) {
            if (ws[i].t < after) continue;
            if (ws.slice(i, i + LYR.SIG).map(x => x.w).join(' ') === sig) return ws[i].t;
        }
        return null;
    }
    function lyricPlan(info, at) {
        if (!info || !info.ok) return null;
        const lines = (Array.isArray(info.lines) ? info.lines : []).filter(l => Array.isArray(l) && isFinite(l[0]) && l[1]);
        const dur = +info.duration || (lines.length ? lines[lines.length - 1][0] + 5 : 0);
        let songs = (Array.isArray(info.chapters) ? info.chapters : []).filter(c => c && isFinite(c.start))
            .map((c, i) => ({ n: i + 1, title: _cut(c.title, LEN.SRC), start: +c.start, end: +c.end || dur }));
        if (!songs.length) songs = [{ n: 0, title: '', start: 0, end: dur }];
        // 最後一首常常一路算到影片結尾（後面是重播）：在重播開始的地方收尾，最長也只跟其他首差不多。
        //   只看有章節的歌單：一首歌的 MV 開頭那句副歌又唱一次很正常，不能當重播切掉；
        //   最後一首開頭一分鐘內對到的也不算（最後一首是第 1 首的另一個版本時，開頭本來就一樣）
        const last = songs[songs.length - 1];
        if (songs.length > 1) {
            const loop = _loopAt(lines, last.start + 60);
            if (loop != null) last.end = Math.min(last.end, loop);
            last.end = Math.min(last.end, last.start + Math.ceil(Math.max(...songs.slice(0, -1).map(s => s.end - s.start)) * 1.3));
        }
        let pick = songs;
        if (at != null) pick = [songs.find(s => at >= s.start && at < s.end) || { n: 0, title: '', start: at, end: at + LYR.CLIP }];
        const out = pick.map(s => {
            const ls = lines.filter(l => l[0] >= s.start && l[0] < s.end);
            const words = _lyrWords(ls.map(l => l[1]).join(' '));
            const sung = words >= LYR.MIN_WORDS && words / Math.max((s.end - s.start) / 60, 0.5) >= LYR.WPM;
            return { n: s.n, title: s.title, start: s.start, end: s.end, lyrics: sung ? _lyrClean(ls.map(l => l[1]).join(' ')) : '' };
        });
        const each = Math.floor(LYR.CHARS / Math.max(1, out.filter(s => s.lyrics).length));   // 很長的（講話的長片）才會被切
        out.forEach(s => { s.lyrics = s.lyrics.slice(0, each); });
        return { title: _cut(info.title, LEN.SRC * 3), channel: _cut(info.channel, LEN.SRC), auto: !!info.capAuto, one: at != null || songs.length === 1, songs: out };
    }
    // 剪出來的卡寫的是哪首（source 寫歌名）→ 那首的開始秒數，卡上的連結直接跳到那首
    function songAt(songs, source) {
        if (songs.length === 1) return songs[0].start;
        const f = s => String(s || '').toLowerCase().replace(/^\s*\d+\s*[.)、]\s*/, '').replace(/[\s〈〉《》「」"'’]/g, '');
        const k = f(source);
        const hit = k && songs.find(s => f(s.title) && (f(s.title).includes(k) || k.includes(f(s.title))));
        return hit ? hit.start : null;
    }
    function lyricsMessages(plan, note, user) {
        const U = user || '她';
        const songs = plan.songs.filter(s => s.lyrics);
        const sys = '你在幫' + U + '的白板剪素材：她丟來一支影片，下面是它的字幕。是歌的話字幕就是歌詞，' + U + '要的就是歌詞——從歌詞剪「之後可能長成故事」的素材卡。\n\n' + RULES +
            '\n卡片不用整段抄歌詞：寫這首歌在講什麼故事、有什麼畫面、什麼情緒，最多帶一兩句最抓人的詞。不是歌的話，寫它在講什麼。\n' + REAL_CASE +
            (plan.auto ? '\n字幕是 YouTube 自動聽出來的，會有聽錯的字，照上下文讀。' : '');
        const L = ['影片：' + (plan.title || '（沒標題）') + (plan.channel ? '（' + plan.channel + '）' : ''),
            note ? U + '丟的時候說：「' + note + '」' : U + '丟的時候沒有多說什麼。'];
        songs.forEach(s => L.push('── ' + (s.title || '字幕') + '（' + _mmss(s.start) + ' 起）', s.lyrics));
        L.push(songs.length > 1 ? '挑最有故事的 1～' + CAPS.CLIP_MAX + ' 首（她那句有提到喜歡哪首、哪種的，照她說的挑），一首剪一張；source 寫歌名。' : '剪一張；source 寫' + (songs[0].title ? '歌名' : '影片標題') + '。',
            '格式（每張一行，只交這幾行）：', '<material source="歌名" why="哪裡有意思">這首在講什麼故事、什麼畫面、什麼情緒（一句話，連引的詞在內 ' + LEN.MAT + ' 字以內，可以帶一句最抓人的詞）</material>');
        return [{ role: 'system', content: sys }, { role: 'user', content: L.join('\n') }];
    }
    // 看過影片：一句話用它看到的、哪裡有趣用她那句（她的口味最準）；沒看：她那句就是素材
    //   many＝一次剪了好幾首：她那句是講整次的（10-10「第五首歌詞好聽」被貼在另外三首上），每張用它自己的 why
    function materialFrom(o) {
        o = o || {};
        const note = _cut(o.note, LEN.MAT), link = safeLink(o.link), card = o.card;
        // 出處留影片標題（值班的人才知道那是什麼）；它沒寫標題就寫看過影片
        if (card && card.text) return { ok: true, text: _cutNice(card.text, LEN.CARD), why: (o.many ? '' : note) || _cut(card.why, LEN.WHY), source: card.source ? '妳丟的影片：' + _cutNice(card.source, LEN.SRC) : '妳丟的・看過影片', link };
        if (!note) return { ok: false, why: '寫一句妳的感覺再丟' };
        return { ok: true, text: note, why: '', source: '妳丟的', link };
    }
    // 送給 Gemini 的：影片在前、她那句和要交的格式在後（最後一段要是要它做的事）
    //   clip＝只聽那一段（歌單裡的一首）：start／end 秒數掛在 video_url 上，os_api_engine 轉成 Gemini 的 video_metadata
    function watchMessages(link, note, user, clip) {
        const U = user || '她';
        const sys = '你在幫' + U + '的白板剪素材：看她丟來的一支影片，剪成一張「之後可能長成故事」的素材卡。\n\n' + RULES +
            '\n是歌的話，' + U + '要的是歌詞：重點聽歌詞在講什麼（故事、畫面、情緒），不是 MV 畫面；不用整段抄歌詞，最多帶一兩句最抓人的詞。不是歌的話，寫發生了什麼、畫面跟感覺。\n' + REAL_CASE;
        const video = { url: link };
        if (clip) { video.start = Math.floor(clip.start); video.end = Math.ceil(clip.end); }
        const txt = [
            note ? U + '丟這支影片的時候說：「' + note + '」' : U + '丟了這支影片，沒有多說什麼。',
            clip ? '只看 ' + _mmss(video.start) + '～' + _mmss(video.end) + ' 這一段' + (clip.title ? '（〈' + clip.title + '〉）' : '') + '。' : '',
            '看完剪一張素材卡：一句話講它是什麼；why 寫哪裡有意思、可能長成什麼；source 寫' + (clip && clip.title ? '歌名' : '影片標題或頻道') + '。',
            '格式（只交這一行）：',
            '<material source="' + (clip && clip.title ? '歌名' : '影片標題或頻道') + '" why="哪裡有意思">一句話（' + LEN.MAT + ' 字以內）</material>',
        ].filter(Boolean).join('\n');
        return [{ role: 'system', content: sys }, { role: 'user', content: [{ type: 'video_url', video_url: video }, { type: 'text', text: txt }] }];
    }
    function hatch(b, ideaId) {
        const i = b.ideas.find(x => x.id === ideaId && x.state === 'wild');
        if (!i) return { ok: false, why: '找不到這個點子' };
        if (!canHatch(b)) return { ok: false, why: '先看完再孵' };
        i.state = 'hatching';
        return { ok: true, board: b };
    }
    function redo(b, draftId, reason, now) {
        const d = b.drafts.find(x => x.id === draftId && x.state === 'wait');
        if (!d) return { ok: false, why: '找不到這份稿' };
        b.drafts = b.drafts.filter(x => x !== d);
        b.ideas.push({ id: _mkId('i'), text: d.idea.text, keys: d.idea.keys, from: d.idea.from, by: d.idea.by, byName: d.idea.byName, at: now,
            state: 'hatching', redo: _cut(reason, LEN.REDO), prev: { title: d.title, front: d.front } });
        return { ok: true, board: b };
    }
    function drop(b, kind, id, now) {
        const list = kind === 'idea' ? 'ideas' : kind === 'draft' ? 'drafts' : kind === 'material' ? 'materials' : '';
        if (!list) return { ok: false, why: '不知道要放棄什麼' };
        const x = b[list].find(y => y.id === id);
        if (!x) return { ok: false, why: '已經不在了' };
        b[list] = b[list].filter(y => y !== x);
        if (kind !== 'material') {
            b.dropped.unshift({ title: kind === 'draft' ? x.title : x.text, at: now });
            b.dropped = b.dropped.slice(0, CAPS.DROPPED);
        }
        return { ok: true, board: b };
    }
    function countKinds(entries) { const c = {}; (entries || []).forEach(e => { c[e.kind] = (c[e.kind] || 0) + 1; }); return c; }
    function countText(c) { return Object.keys(KINDS).filter(k => c && c[k]).map(k => c[k] + ' 個' + KINDS[k]).join('、'); }
    // props＝寫進去的單子（改回去要用）；draft 整份留著，改回去時放回等妳看
    function markWorld(b, draftId, now, props) {
        const d = b.drafts.find(x => x.id === draftId);
        if (!d) return { ok: false, why: '找不到這份稿' };
        b.drafts = b.drafts.filter(x => x !== d);
        b.world.unshift({ id: d.id, title: d.title, count: countKinds(d.entries), at: now, book: BOOK, props: props || [], draft: d });
        return { ok: true, board: b };
    }
    function refTerms(job, b) {
        if (job.kind === 'write') { const i = b.ideas.find(x => x.id === job.ideaId); return i ? (i.keys || []).slice() : []; }
        if (job.kind === 'check') {
            const d = b.drafts.find(x => x.id === job.draftId);
            const out = [];
            if (d) d.entries.forEach(e => { out.push(e.name); (e.keys || []).forEach(k => out.push(k)); });
            return out;
        }
        return [];
    }
    function pickRefs(hits) {
        return hits.slice().sort((a, b) => b.n - a.n).slice(0, CAPS.REFS).map(h => ({ book: h.book, title: h.title, content: _cutBlock(h.content, CAPS.REF_CUT) }));
    }

    // 要送什麼：系統那段＝他是誰＋今天在 32 樓值班＋素材界線；使用者那段＝這班那一件事＋格式
    const RULES = [
        '素材界線（一定要守）：',
        '・不收：校園暴力、校園槍擊；真實案件的受害者（不拿真人真事當娛樂）；任何「怎麼做到」的教學（弄槍、避監視器、配毒、計畫攻擊）；未成年跟暴力或色情綁在一起。',
        '・可以：一般謀殺案、警匪對峙、追捕、開槍、有人中彈——寫發生了什麼、人怎麼反應、怎麼查出來，手法只到推理需要的程度。',
        '白板上的東西只留在家裡，不准貼到任何外面的社群。',
    ].join('\n');
    // 她丟的影片是真案（10-10 她丟了一支法庭實錄）：照 10-09 講好的「拿辦案結構，不拿人名和案情」剪，卡才在界線內、湊點子時不會被跳過
    const REAL_CASE = '是真實發生的案件的話：卡片不寫真名、不重講那件真事，只留它是怎麼被拆穿的（哪句話露了餡、哪個證據翻了盤），寫成以後故事裡借得走的辦案手法。';
    const SAY_FMT = '<say>站在白板旁冒出來的一句，' + LEN.SAY + ' 個字以內（可以不寫）</say>';
    function _list(arr, f, none) { return arr.length ? arr.map(f).join('\n') : none; }
    function _refsText(refs) { return refs.length ? refs.map(r => '── ' + r.title + '｜' + r.book + '\n' + r.content).join('\n') : '（沒找到相關的）'; }
    function _draftText(d) {
        return '標題：' + d.title + '\n方向：' + d.front + '\n條目：\n' +
            d.entries.map(e => '（' + e.kind + '｜' + e.name + '｜' + (e.keys || []).join(',') + '）' + e.content).join('\n');
    }
    function buildMessages(job, who, b, refs, user) {
        const U = user || '她';
        const sys = (who.sys ? who.sys + '\n\n' : '你是' + who.name + '。\n') +
            '今天你在 SN 公司 32 樓的研討室值白板的班。白板是' + U + '的：大家在上面剪素材、湊點子、寫世界觀的稿；' + U + '看過說好，稿裡的東西才會寫進她的世界書。\n' +
            '這一班只做下面交代的那一件事，照格式交回來就下班，格式以外的話不用寫。\n\n' + RULES;
        const dropped = _list(b.dropped.slice(0, 10), x => '・' + x.title, '（沒有）');
        const L = [];
        if (job.kind === 'clip') {
            L.push('【這班：剪素材】',
                '從你自己最近的經歷、讀到看到的東西裡，剪 1～' + CAPS.CLIP_MAX + ' 張「之後可能長成故事」的素材。',
                '每張：一句話講那件事；why 寫哪裡有趣；source 寫出處（在哪裡看到、聽誰說的、你自己的哪段經歷）。',
                '白板上已經有這些素材，別重複：', _list(b.materials.slice(-10), m => '・' + m.text, '（還沒有）'),
                U + '放棄過這些，別提類似的：', dropped,
                '格式（每張一個）：', '<material source="出處" why="哪裡有趣">一句話</material>', SAY_FMT);
        } else if (job.kind === 'combine') {
            const mats = (job.matIds || []).map(id => b.materials.find(m => m.id === id)).filter(Boolean);
            L.push('【這班：湊點子】',
                '下面是還沒用過的素材（標「' + U + '丟的」是她自己丟的，優先用）：',
                mats.map((m, i) => (i + 1) + '. ' + m.text + '（' + [m.by === 'rae' ? U + '丟的' : '', m.why, m.source, m.link].filter(Boolean).join('｜') + '）').join('\n'),
                '挑 2～3 張湊成一個點子：一兩句話，能長成一段世界觀或一條劇情線。湊之前再看一次素材界線，碰到界線外的那張就不要用。',
                '現有的野生點子，別重複：', _list(b.ideas, i => '・' + i.text, '（還沒有）'),
                U + '放棄過這些，別提類似的：', dropped,
                '格式：', '<idea from="用到的素材編號，逗號隔開" keys="跟這個點子有關的兩三個詞，逗號隔開">一兩句話</idea>', SAY_FMT);
        } else if (job.kind === 'write') {
            const i = b.ideas.find(x => x.id === job.ideaId) || { text: '', from: [] };
            L.push('【這班：寫稿】', U + '孵化了這個點子：' + i.text);
            if (i.from && i.from.length) L.push('它是從這些素材湊的：', i.from.map(m => '・' + m.text + (m.why ? '（' + m.why + '）' : '')).join('\n'));
            if (i.prev) L.push('這是回爐的稿。上一版標題「' + i.prev.title + '」，方向：' + i.prev.front, U + '說：「' + (i.redo || '重寫') + '」照她說的重寫。');
            L.push('世界書裡跟它可能有關的條目（寫的時候別跟這些打架）：', _refsText(refs),
                '寫成一份稿，分兩半：',
                '・front：給' + U + '看的方向，兩三句：這東西會讓世界多出什麼、主角碰上會怎樣。不寫祕密、不寫結局。',
                '・entry：真正要寫進世界書的條目，1～' + CAPS.ENTRIES + ' 條。kind 只能是 faction（勢力）、place（地點）、person（人物）、conflict（衝突）、rule（世界的規矩）。不寫已經決定好會發生的事件；衝突寫「可能怎麼爆」，不寫「哪天爆」。keys 是會讓這條被想起來的詞（兩三個）。祕密和真相寫在 entry 裡。',
                '・note：給挑毛病那位同事的一句話。',
                '格式：', '<draft title="稿的名字，十個字以內">', '<front>方向</front>', '<entry kind="種類" name="條目標題" keys="詞,詞">內容</entry>', '<note>一句話</note>', '</draft>', SAY_FMT);
        } else if (job.kind === 'check') {
            const d = b.drafts.find(x => x.id === job.draftId);
            L.push('【這班：挑毛病】', ((d && d.writer && d.writer.name) || '同事') + '寫了這份稿，你來挑毛病：', d ? _draftText(d) : '');
            if (d && d.notes.length) L.push('寫稿的人留言：' + d.notes.map(n => n.text).join('／'));
            L.push('世界書裡可能有關的條目：', _refsText(refs),
                '檢查：跟現有世界書有沒有打架、有沒有寫死會發生的事件、有沒有碰到素材界線、條目之間有沒有矛盾。',
                '有問題就直接改那一條（name 跟原本一模一樣，內容寫改好的整條）；沒問題就不用放 entry。',
                '格式：', '<review>', '<entry kind="種類" name="原本的標題" keys="詞,詞">改好的整條內容</entry>',
                '<note>給寫稿的人和' + U + '的一句話：你看了什麼、改了什麼</note>', '</review>', SAY_FMT);
        }
        return [{ role: 'system', content: sys }, { role: 'user', content: L.join('\n') }];
    }

    // ── 資料（OS_DB 通用資料，不升版）──────────────────────────────
    const DEF_STAFF = { slots: [null, null], times: ['12:00', '20:00'], next: 0, on: false, lastAt: 0, running: 0, runningJob: '', runningWho: '', lastVisit: 0, unread: false, says: {}, fail: null };
    const RUN_STALE = 10 * 60000;   // 「上班中」超過這麼久當作沒在跑（分頁中途被關）。要比兩種逾時都長
    const _cfg = { XIAOJI_TIMEOUT: 180000, DORM_TIMEOUT: 480000, VIDEO_TIMEOUT: 240000, YT_TIMEOUT: 30000 };
    const VIDEO_TASK = 'sn_board_video';   // 名冊 LLM_TASKS 那一列「白板看影片／讀歌詞」
    const _listeners = new Set();
    function _emit() { _listeners.forEach(f => { try { f(); } catch (e) {} }); }
    function onChange(f) { _listeners.add(f); return () => _listeners.delete(f); }
    function _DB() { const D = _g('OS_DB'); if (!D || !D.getAppData || !D.saveAppData) throw new Error('資料庫還沒好'); return D; }
    async function _get(key, def) { const v = await _DB().getAppData(APP, key); return v == null ? def : v; }
    async function _set(key, v) { await _DB().saveAppData(APP, key, v); }
    function _locks() { return (win.navigator && win.navigator.locks) || (typeof navigator !== 'undefined' && navigator.locks) || null; }
    function _lockData(fn) { const L = _locks(); return (L && L.request) ? L.request('aurelia_sn_board_data', () => fn()) : fn(); }
    function _TS() { const C = _g('OS_CAFE_STAFF'); return (C && C.times) || null; }
    function _normTimes(t) { const T = _TS(); return T ? T.normTimes(t) : (Array.isArray(t) ? t : []); }

    async function getStaff() {
        let v = null;
        try { v = await _get('staff', null); } catch (e) {}
        const o = Object.assign({}, DEF_STAFF, (v && typeof v === 'object') ? v : {});
        o.slots = [0, 1].map(i => (Array.isArray(o.slots) && o.slots[i]) || null);
        o.times = _normTimes(o.times);
        return o;
    }
    async function saveStaff(patch) {
        const v = await _get('staff', null);   // 讀不到就丟錯：別拿預設值蓋掉她排好的班
        const next = Object.assign({}, DEF_STAFF, (v && typeof v === 'object') ? v : {}, patch || {});
        next.times = _normTimes(next.times);
        await _set('staff', next);
        _emit();
        return next;
    }
    // 「等妳看」幾份：大廳地點卡那行字讀這個；份數一變就通知大廳只改那行（lobby_places 聽 lobby-place-who）
    let _waitCache = 0;
    function _countWait(b) {
        const n = b.drafts.filter(d => d.state === 'wait').length;
        if (n === _waitCache) return;
        _waitCache = n;
        try { win.dispatchEvent(typeof CustomEvent === 'function' ? new CustomEvent('lobby-place-who') : { type: 'lobby-place-who' }); } catch (e) {}
    }
    async function getBoard() { const b = normBoard(await _get('board', null)); _countWait(b); return b; }
    async function saveBoard(b) { await _set('board', b); _countWait(b); _emit(); return b; }
    function waitingNow() { return _waitCache; }
    async function shifts() { try { return (await _get('shifts', [])) || []; } catch (e) { return []; } }
    async function _logShift(rec) {
        try { const arr = (await _get('shifts', [])) || []; arr.unshift(rec); await _set('shifts', arr.slice(0, CAPS.SHIFTS)); } catch (e) {}
    }

    // 她的動作：一律「鎖住→重讀→改→寫」
    function _edit(fn) {
        return _lockData(async () => {
            const b = await getBoard();
            const r = fn(b, Date.now());
            if (!r || !r.ok) return r || { ok: false, why: '沒改成' };
            await saveBoard(r.board);
            return { ok: true };
        });
    }
    const act = {
        addMaterial: text => _edit((b, now) => addMaterial(b, text, now)),
        dropMaterial: o => dropMaterial(o),
        hatch: id => _edit(b => hatch(b, id)),
        redo: (id, reason) => _edit((b, now) => redo(b, id, reason, now)),
        drop: (kind, id) => _edit((b, now) => drop(b, kind, id, now)),
        peek: id => _edit(b => { const d = b.drafts.find(x => x.id === id); if (!d) return { ok: false, why: '找不到這份稿' }; d.peeked = true; return { ok: true, board: b }; }),
    };
    // 打開白板：沒睡著才記「來過」；睡著了要她按叫醒（讓她看到它睡過）
    async function visit() {
        const st = await getStaff();
        if (isAsleep(st, Date.now())) return { asleep: true, st };
        return { asleep: false, st: await saveStaff({ lastVisit: Date.now() }) };
    }
    // 叫醒＝從現在開始排班：睡著那段錯過的不補（不然一叫醒就馬上花一通）
    async function wake() { const st = await getStaff(); return saveStaff({ lastVisit: Date.now(), lastAt: Math.max(st.lastAt || 0, Date.now()) }); }

    // ── 值班名單：小機（宿舍名冊 provider=xiaoji）＋宿舍住戶（claude、codex；deepseek 沒有自己的家）──
    function _roomResidents() {
        try {
            const cfg = JSON.parse((win.localStorage || localStorage).getItem('os_claude_room_config') || 'null');
            return (cfg && Array.isArray(cfg.residents)) ? cfg.residents : [];
        } catch (e) { return []; }
    }
    function _dormReady() {
        const CT = _g('ClaudeTerminal');
        try { const c = CT && CT.getConfig ? CT.getConfig() : null; return !!(c && c.url && c.key && CT.sendAs); } catch (e) { return false; }
    }
    async function candidates() {
        const out = { xiaoji: [], dorm: [], dormReady: _dormReady() };
        const X = _g('OS_XIAOJI');
        for (const r of _roomResidents()) {
            if (!r || !r.id) continue;
            const prov = r.provider || 'claude';
            if (prov === 'xiaoji') {
                let base = 'hamster';
                try { if (X && X.get) base = X.bodyOf(await X.get(r.id)); } catch (e) {}
                out.xiaoji.push({ type: 'xiaoji', id: r.id, name: r.name || '小機', base });
            } else if (prov === 'claude' || prov === 'codex') {
                out.dorm.push({ type: 'dorm', id: r.id, name: r.name || '住戶', base: prov === 'codex' ? 'lorde' : 'crab' });
            }
        }
        return out;
    }
    async function setSlot(i, pick) {
        const st = await getStaff();
        const other = st.slots[1 - i];
        if (pick && other && other.id === pick.id) return { ok: false, why: '他已經在另一格了' };
        const slots = st.slots.slice();
        slots[i] = pick ? { type: pick.type, id: pick.id, name: pick.name, base: pick.base } : null;
        const any = slots.some(Boolean), had = st.slots.some(Boolean);
        // 挑人那一刻不補已經過了的時間（不然一挑就馬上花一通）
        await saveStaff({ slots, on: any ? (had ? st.on : true) : false, lastAt: Math.max(st.lastAt || 0, Date.now()), next: Math.max(0, nextSlot(slots, st.next)) });
        return { ok: true };
    }
    function setOn(on) { return saveStaff({ on: !!on, lastAt: Date.now() }); }
    async function setTimes(times) { const st = await getStaff(); return saveStaff({ times, lastAt: Math.max(st.lastAt || 0, Date.now()) }); }

    // 上班當下找人：還在不在、用什麼身分說話、走哪條
    async function resolve(pick) {
        if (!pick) return null;
        const c = await candidates();
        const me = (pick.type === 'xiaoji' ? c.xiaoji : c.dorm).find(x => x.id === pick.id);
        if (!me) return null;
        const X = _g('OS_XIAOJI');
        const user = (X && X.USER) || '她';
        if (me.type === 'dorm') return Object.assign({}, me, { sys: '', user });
        const MEM = _g('OS_XIAOJI_MEM');
        if (!X || !X.get || !X.connConfig) return null;
        const rec = await X.get(me.id);
        const bodyName = ((X.BODIES || []).find(b => b.id === X.bodyOf(rec)) || {}).name || '';
        let lines = '';
        try { if (MEM && MEM.personaLines) lines = await MEM.personaLines(me.id); } catch (e) {}
        const sys = '你是' + me.name + '，' + (bodyName ? '一隻' + bodyName + '樣子的' : '') + '小 AI，住在奧瑞亞的宿舍。' +
            (rec && rec.about ? '\n' + user + '對你的描述：' + String(rec.about).slice(0, 300) : '') + (lines ? '\n' + lines : '');
        return Object.assign({}, me, { sys, conn: X.connConfig(rec), user });
    }
    // 臉、站姿：一律畫成他現在的打扮（她 10-10：「不過形象似乎是預設齁」）
    //   衣服：小機＝它在宿舍衣櫃換的（OS_XIAOJI 存檔的 wear，RoomWear.client 轉）；宿舍住戶＝橋上那份（房間的 DormPanel.wearOf）。
    //   頭像＝畫一格裁掉空白（同宿舍門卡）；站在 32 樓場景那張再描一圈框（同書咖店員）。小螃蟹沒打扮過用預設臉（同門卡）。
    //   五分鐘內同一位不重畫（白板開著時每次重畫都會來要）。
    const LOOK_TTL = 5 * 60000;
    const _lookMemo = new Map();   // type:id → { at, face, look }
    async function _wearFor(pick) {
        try {
            if (pick.type === 'xiaoji') {
                const X = _g('OS_XIAOJI'), RW = _g('RoomWear');
                const rec = (X && X.get) ? await X.get(pick.id) : null;
                return (RW && RW.client && rec && rec.wear) ? RW.client(rec.wear) : null;
            }
            const D = _g('DormPanel');
            return (D && D.wearOf) ? ((await D.wearOf(pick.id)) || null) : null;
        } catch (e) { return null; }
    }
    async function _draw(pick, outlined) {
        const CP = _g('ClawdPortrait'), CS = _g('OS_CAFE_STAFF');
        if (!pick || !CP || !CP.renderStill || !CP.crop) return '';
        const key = pick.type + ':' + pick.id, slot = outlined ? 'look' : 'face';
        const m = _lookMemo.get(key);
        const fresh = m && Date.now() - m.at < LOOK_TTL;
        if (fresh && m[slot]) return m[slot];
        const base = pick.base || (pick.type === 'xiaoji' ? 'hamster' : 'crab');
        const wear = await _wearFor(pick);
        let url = '';
        if (!outlined && base === 'crab' && !(wear && wear.own)) {
            try { url = (CP.faceOf && (await CP.faceOf(base))) || ''; } catch (e) {}
        } else {
            const paint = async w => {
                const cv = (win.document || document).createElement('canvas');
                await CP.renderStill(cv, w, 'idle', 1, base);
                return CP.crop(outlined && CS && CS.outline ? CS.outline(cv) : cv) || '';
            };
            try { url = await paint(wear); } catch (e) { try { url = await paint(null); } catch (e2) {} }   // 那套衣服畫不出來就畫沒打扮的
        }
        const nm = fresh ? m : { at: Date.now() };
        nm[slot] = url;
        _lookMemo.set(key, nm);
        return url;
    }
    function faceOf(pick) { return _draw(pick, false); }
    function lookOf(pick) { return _draw(pick, true); }

    // ── 世界書裡跟這件事有關的條目（世界門那三本＋白板那本；字面找，最多 8 條）──
    function _pwa() { try { const A = _g('OS_API'); return !!(A && A.isStandalone && A.isStandalone()); } catch (e) { return false; } }
    function _lb() { return _pwa() ? ((_g('OS_WORLDBOOK') || {}).lorebookApi || null) : (_g('TavernHelper') || null); }
    function _fold(s) { const T = _g('OS_AURELIA_TOOLS'); return (T && T.fold) ? T.fold(s) : String(s == null ? '' : s).toLowerCase(); }
    async function worldRefs(terms) {
        const A = _lb();
        const ts = Array.from(new Set((terms || []).map(_one).filter(t => t.length >= 2))).slice(0, 12).map(_fold);
        if (!A || !A.getLorebookEntries || !ts.length) return [];
        const hits = [];
        for (const book of REF_BOOKS) {
            let es = [];
            try { es = (await A.getLorebookEntries(book)) || []; } catch (e) {}
            es.forEach(e => {
                if (!e || e.enabled === false) return;
                const hay = _fold((e.comment || '') + ' ' + (Array.isArray(e.keys) ? e.keys.join(',') : String(e.keys || '')) + ' ' + (e.content || ''));
                const n = ts.filter(t => hay.indexOf(t) >= 0).length;
                if (n) hits.push({ book, title: e.comment || '', content: String(e.content || ''), n });
            });
        }
        return pickRefs(hits);
    }

    // ── 叫人 ──
    function _withTimeout(ms, run) {
        const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        return new Promise((resolve, reject) => {
            let over = false;
            const timer = setTimeout(() => { over = true; try { if (ctrl) ctrl.abort(); } catch (e) {} reject(new Error('逾時')); }, ms);
            Promise.resolve().then(() => run(ctrl ? ctrl.signal : undefined)).then(
                v => { if (over) return; clearTimeout(timer); resolve(v); },
                e => { if (over) return; clearTimeout(timer); reject(e); });
        });
    }
    function _callXiaoji(who, msgs, kind) {
        const A = _g('OS_API');
        if (!A || !A.chat) return Promise.reject(new Error('沒有模型可以叫'));
        const config = Object.assign({}, who.conn.config, { route: 'sn_board' });
        // 寫稿、挑毛病要整份交回來（最多 8 條、每條上千字）：門卡預設 1000～2000 會被切掉 → 至少 8192（同 chatMain）
        if (kind === 'write' || kind === 'check') config.maxTokens = Math.max(parseInt(config.maxTokens, 10) || 0, 8192);
        return _withTimeout(_cfg.XIAOJI_TIMEOUT, signal => new Promise((res, rej) => {
            A.chat(msgs, config, null, t => res(t), e => rej(e),
                Object.assign({}, who.conn.options, { label: '白板值班', keepCodeFences: true, signal }));   // 🚨 第六格就是 options
        }));
    }
    function _callDorm(who, msgs) {
        const CT = _g('ClaudeTerminal');
        if (!CT || !CT.sendAs) return Promise.reject(new Error('宿舍還沒載入'));
        return _withTimeout(_cfg.DORM_TIMEOUT, signal => CT.sendAs(who.id, msgs, { signal }).then(r => (r && r.reply) || ''));
    }
    // 看影片只在「白板看影片」那列指到她的某一條通道時才看（主／副模型多半是看不了影片的中轉站，不猜）
    function canWatch() {
        const S = _g('OS_SETTINGS');
        try { const c = (S && S.getConfigFor) ? S.getConfigFor(VIDEO_TASK) : null; return !!(c && c._channel && c.url && c.key); } catch (e) { return false; }
    }
    // 讀歌詞、看影片都走名冊「白板看影片／讀歌詞」那列；讀歌詞是純文字，主／副模型也讀得了，不用指到通道
    function _ask(msgs, label) {
        const A = _g('OS_API'), S = _g('OS_SETTINGS');
        if (!A || !A.chat || !S || !S.getConfigFor) return Promise.reject(new Error('沒有模型可以叫'));
        const config = Object.assign({}, S.getConfigFor(VIDEO_TASK), { route: VIDEO_TASK });
        config.maxTokens = Math.max(parseInt(config.maxTokens, 10) || 0, 8192);   // Gemini 會先想一下，想的也算在上限裡
        return _withTimeout(_cfg.VIDEO_TIMEOUT, signal => new Promise((res, rej) => {
            A.chat(msgs, config, null, t => res(t), e => rej(e),
                { task: VIDEO_TASK, label, keepCodeFences: true, signal });   // 🚨 第六格就是 options
        }));
    }
    function _user() { const X = _g('OS_XIAOJI'); return (X && X.USER) || '她'; }
    function _watch(link, note, clip) { return _ask(watchMessages(link, note, _user(), clip), '白板看影片'); }
    // 橋讀這支的章節和原文字幕（瀏覽器自己讀不到 YouTube 的）。橋沒開、舊橋沒這條、讀不到都回 null
    async function _ytInfo(link) {
        const CT = _g('ClaudeTerminal');
        let c = null;
        try { c = CT && CT.getConfig ? CT.getConfig() : null; } catch (e) {}
        const f = win.fetch || (typeof fetch !== 'undefined' ? fetch : null);
        if (!c || !c.url || !c.key || !f) return null;
        const base = String(c.url).replace(/\/v1\/chat\/completions\/?$/, '');
        try {
            const r = await _withTimeout(_cfg.YT_TIMEOUT, signal => f.call(win, base + '/v1/youtube?url=' + encodeURIComponent(link), { headers: { Authorization: 'Bearer ' + c.key }, signal }));
            if (!r || !r.ok) return null;
            const j = await r.json();
            return (j && j.ok) ? j : null;
        } catch (e) { return null; }
    }
    const _err = e => String((e && e.message) || e).slice(0, 80);
    async function dropMaterial(o) {
        o = o || {};
        const note = _cut(o.note, LEN.MAT), raw = String(o.link || '').trim(), link = safeLink(raw);
        if (raw && !link) return { ok: false, why: '這個連結看不懂（要 http 或 https 開頭）' };
        const yt = youTubeUrl(link);
        let at = yt ? youTubeStart(link) : null;
        let cards = [], why = '', how = '';
        if (yt) {
            const info = await _ytInfo(yt);
            const k = at == null ? noteSong(note) : null;   // 連結沒停在哪首、她那句寫了第幾首：就那首
            if (k && info && Array.isArray(info.chapters) && info.chapters[k - 1] && isFinite(info.chapters[k - 1].start)) at = +info.chapters[k - 1].start;
            const plan = lyricPlan(info, at);
            const read = plan ? plan.songs.filter(s => s.lyrics) : [];
            if (read.length) {
                try {
                    const p = parseReply(await _ask(lyricsMessages(plan, note, _user()), '白板讀歌詞'), { kind: 'clip' });
                    if (p.ok) { cards = p.materials.map(c => Object.assign(c, { at: songAt(read, c.source) })); how = 'read'; }
                    else why = '這支的歌詞沒剪成：' + p.why;
                } catch (e) { why = '這支的歌詞沒剪成：' + _err(e); }
                const missed = plan.songs.filter(s => !s.lyrics);
                if (cards.length && missed.length) why = (missed.length > 1 ? '這幾首' : '這首') + '沒有字幕、沒讀到：' + missed.map(s => s.title || _mmss(s.start)).join('、') +
                    (missed[0].n ? '（要的話，一句話裡寫「第 ' + missed[0].n + ' 首」再丟一次）' : '（要的話，連結停在那首再丟一次）');
            } else if (plan && !plan.one) {
                why = '這張歌單讀不到歌詞；一句話裡寫想要第幾首、或連結停在那首再丟一次，會只聽那首';   // 不整張叫 Gemini 聽：一小時的片聽不完
            } else if (!canWatch()) {
                why = plan ? '這首沒有字幕、讀不到歌詞；要聽的話，設置「哪件事走哪個模型」的「白板看影片／讀歌詞」指到看得了影片的通道（例如 Gemini）'
                    : '這支影片沒看：設置「哪件事走哪個模型」的「白板看影片／讀歌詞」還沒指到妳的通道';
            } else {
                // 橋讀到了就只聽那首；橋沒開但連結帶時間，就從那裡聽一段；都沒有才整支看（原本的做法）
                const clip = plan ? plan.songs[0] : (at != null ? { title: '', start: at, end: at + LYR.CLIP } : null);
                try {
                    const p = parseReply(await _watch(yt, note, clip), { kind: 'clip' });
                    if (p.ok) { cards = [Object.assign(p.materials[0], { at: clip ? clip.start : null })]; how = 'watch'; }
                    else why = '這支影片沒看成：' + p.why;
                } catch (e) { why = '這支影片沒看成：' + _err(e); }
            }
        }
        const ytAt = s => yt + (s > 0 ? '&t=' + Math.floor(s) + 's' : '');
        const mfs = cards.length ? cards.map(c => materialFrom({ note, link: ytAt(c.at), card: c, many: cards.length > 1 })) : [materialFrom({ note, link: yt || link })];
        if (!mfs[0].ok) return { ok: false, why: why ? why + '；寫一句妳的感覺再丟' : mfs[0].why };
        let n = 0;
        const r = await _edit((b, now) => {
            let last = null;
            n = 0;
            for (const mf of mfs) { last = addMaterial(b, mf, now); if (!last.ok) break; n++; }
            return n ? { ok: true, board: b } : last;
        });
        return (r && r.ok) ? { ok: true, read: how === 'read', watched: how === 'watch', n, why } : r;
    }
    function _notify(text, warn) {
        let hidden = false;
        try { hidden = (win.document || document).visibilityState === 'hidden'; } catch (e) {}
        if (hidden) { try { const K = _g('OS_KEEPALIVE'); if (K && K.notify) K.notify('SN 32 樓白板', text, 'sn-board'); } catch (e) {} return; }
        try { const A = _g('AUI'); if (A && A.toast) A.toast(text, { type: warn ? 'warn' : 'info' }); } catch (e) {}
    }
    async function _remember(rid, rec) {
        const MEM = _g('OS_XIAOJI_MEM');
        if (!MEM || !MEM.log) return;
        try {
            await MEM.log(rid, { kind: 'sn_board', text: '在 SN 32 樓值白板的班：' + rec.text + '。' });
            if (MEM.embedPending) MEM.embedPending(rid).catch(() => {});
        } catch (e) { console.warn('[SNBoard] 寫進經歷簿失敗', e); }
    }

    // ── 上一班 ──
    let _busy = null;
    function runShift(o) {
        if (_busy) return _busy;
        const job = () => _shift(o || {});
        const L = _locks();
        _busy = Promise.resolve(L && L.request ? L.request('aurelia_sn_board_shift', { ifAvailable: true }, lock => lock ? job() : { skipped: 'locked' }) : job())
            .finally(() => { _busy = null; _emit(); });
        return _busy;
    }
    async function _shift(o) {
        const now = Date.now();
        const st = await getStaff();
        const idx = nextSlot(st.slots, st.next);
        if (idx < 0) return { skipped: 'nostaff' };
        if (!o.force) {
            const TS = _TS();
            if (!st.on) return { skipped: 'off' };
            if (isAsleep(st, now)) return { skipped: 'asleep' };
            if (!TS || !TS.dueSlot(st.times, st.lastAt, now)) return { skipped: 'notdue' };
        }
        if (st.running && now - st.running < RUN_STALE) return { skipped: 'running' };
        const pick = st.slots[idx];
        const solo = st.slots.filter(Boolean).length === 1;
        const after = nextSlot(st.slots, 1 - idx);   // 下一班從另一格開始；另一格空著就還是他
        const rec = { id: _mkId('s'), at: now, who: { type: pick.type, id: pick.id, name: pick.name }, did: 'idle', ok: false, error: '', text: '', say: '', quota: pick.type === 'dorm' };
        const plan = await _lockData(async () => {
            const b = await getBoard();
            const before = JSON.stringify(b.drafts);
            unstick(b, solo ? pick.id : null);
            if (JSON.stringify(b.drafts) !== before) await saveBoard(b);
            return { job: pickJob(b, pick), board: b };
        });
        rec.did = plan.job.kind;
        if (rec.did === 'idle') {
            rec.ok = true; rec.text = '沒事做，這班沒叫';
            await _logShift(rec);
            await saveStaff({ lastAt: Date.now(), next: after });
            return rec;
        }
        await saveStaff({ running: Date.now(), runningJob: rec.did, runningWho: pick.id });
        let waitTitle = '';
        try {
            const who = await resolve(pick);
            if (!who) throw new Error('找不到' + pick.name);
            const refs = (rec.did === 'write' || rec.did === 'check') ? await worldRefs(refTerms(plan.job, plan.board)) : [];
            const msgs = buildMessages(plan.job, who, plan.board, refs, who.user);
            const reply = who.type === 'xiaoji' ? await _callXiaoji(who, msgs, rec.did) : await _callDorm(who, msgs);
            const p = parseReply(reply, plan.job);
            if (!p.ok) throw new Error(p.why);
            // 叫模型那幾分鐘她可能按了東西：鎖住、重讀、再套
            const r = await _lockData(async () => {
                const res = applyResult(await getBoard(), plan.job, p, who, Date.now(), { solo });
                if (res.ok) await saveBoard(res.board);
                return res;
            });
            if (!r.ok) throw new Error(r.why);
            rec.ok = true; rec.text = r.text; rec.say = p.say || ''; waitTitle = r.waitTitle || '';
        } catch (e) {
            rec.error = String((e && e.message) || e).replace(/^[A-Z_]+:/, '').slice(0, 120);
        }
        await _logShift(rec);
        // 寫稿／挑毛病那種「同一件」連著失敗：每一班都會挑到同一件、每一班都花一通 → 連兩班就停手（放回去、告訴她）
        const failKey = rec.did === 'write' ? 'write:' + plan.job.ideaId : rec.did === 'check' ? 'check:' + plan.job.draftId : '';
        let fail = null, gaveUp = '';
        if (!rec.ok && failKey) {
            const n = (st.fail && st.fail.key === failKey ? st.fail.n : 0) + 1;
            if (n >= FAIL_GIVEUP) { try { gaveUp = await _giveUp(plan.job); } catch (e) {} }
            else fail = { key: failKey, n };
        }
        try {
            const cur = await getStaff();
            const says = Object.assign({}, cur.says || {});
            if (rec.say) says[pick.id] = { text: rec.say, at: Date.now() };
            await saveStaff({ running: 0, runningJob: '', runningWho: '', lastAt: Date.now(), next: after, unread: true, says, fail });
        } catch (e) { try { await saveStaff({ running: 0 }); } catch (e2) {} }
        if (rec.ok && pick.type === 'xiaoji') _remember(pick.id, rec);
        if (waitTitle) _notify('白板多一份等妳看：「' + waitTitle + '」');
        else if (gaveUp) _notify(gaveUp, true);
        else if (rec.error) _notify(pick.name + '這班沒上成：' + rec.error, true);
        return rec;
    }
    const FAIL_GIVEUP = 2;
    function _giveUp(job) {
        return _lockData(async () => {
            const b = await getBoard();
            if (job.kind === 'write') {
                const i = b.ideas.find(x => x.id === job.ideaId && x.state === 'hatching');
                if (!i) return '';
                i.state = 'wild';
                await saveBoard(b);
                return '「' + _cut(i.text, 16) + '」連兩班都沒寫成，先放回野生點子；想再試就再按孵化。';
            }
            if (job.kind === 'check') {
                const d = b.drafts.find(x => x.id === job.draftId && x.state === 'check');
                if (!d) return '';
                d.state = 'wait'; d.unchecked = true;
                await saveBoard(b);
                return '「' + d.title + '」連兩班都沒人挑得了毛病，先放進等妳看（沒人挑過）。';
            }
            return '';
        });
    }

    // ── 排程：奧瑞亞開著時每分鐘看一次；好幾天沒開也只補最近那一班（同書咖）──
    async function tick() {
        try {
            const st = await getStaff();
            if (!st.on || nextSlot(st.slots, st.next) < 0 || isAsleep(st, Date.now())) return;
            if (st.running && Date.now() - st.running < RUN_STALE) return;
            const TS = _TS();
            if (!TS || !TS.dueSlot(st.times, st.lastAt, Date.now())) return;
            await runShift({});
        } catch (e) { console.warn('[SNBoard] 排程', e); }
    }
    let _ticking = false;
    function start() {
        if (_ticking) return;
        _ticking = true;
        // 先讀一次白板：大廳地點卡那行「幾份等妳看」靠 waitingNow() 的快取
        setTimeout(() => { getBoard().catch(() => {}); tick(); setInterval(tick, 60000); }, 25000);
    }

    // ── 收進世界：一條一張單子（跟住戶改世界書同一套，寫完記修改紀錄），一次同意全部 ──
    async function _ensureBook() {
        const A = _lb();
        if (!A || !A.getLorebookEntries || !A.createLorebook) return { ok: false, why: _pwa() ? '手機的世界書還沒載好' : '酒館助手沒開，寫不了世界書' };
        let names = [];
        try { names = (await A.getLorebooks()) || []; } catch (e) {}
        if (names.indexOf(BOOK) < 0) {
            try { await A.createLorebook(BOOK); } catch (e) { return { ok: false, why: '建不了【奧瑞亞-白板】這本：' + ((e && e.message) || '') }; }
        }
        return { ok: true };
    }
    // 掛上：酒館＝角色卡的附加世界書；手機＝常駐書包（手機只讀「常駐 ∪ 這本藏書掛的」，藏書那份每次開書會被書架重寫，
    //   所以只能常駐。條目都用關鍵字觸發，常駐也不會每輪整包送）
    function isAttached() {
        if (_pwa()) {
            const W = _g('OS_WORLDBOOK');
            try { return !!(W && W.getActivePacks && W.getActivePacks().indexOf(BOOK) >= 0); } catch (e) { return false; }
        }
        const TH = _g('TavernHelper');
        try {
            const c = TH && TH.getCharLorebooks ? TH.getCharLorebooks() : null;
            return !!(c && (c.primary === BOOK || (c.additional || []).indexOf(BOOK) >= 0));
        } catch (e) { return false; }
    }
    async function attach() {
        if (_pwa()) {
            const W = _g('OS_WORLDBOOK');
            if (!W || !W.setGlobalPack) return { ok: false, why: '手機的世界書還沒載好' };
            const ok0 = await _ensureBook();
            if (!ok0.ok) return ok0;
            try { W.setGlobalPack(BOOK, true); return { ok: true }; } catch (e) { return { ok: false, why: '打不開：' + ((e && e.message) || '') }; }
        }
        const TH = _g('TavernHelper');
        if (!TH || !TH.getCharLorebooks || !TH.setCurrentCharLorebooks) return { ok: false, why: '酒館助手沒開' };
        const ok = await _ensureBook();   // 她按了掛上＝要這本：還沒有就先建
        if (!ok.ok) return ok;
        try {
            const c = TH.getCharLorebooks() || {};
            const add = (c.additional || []).slice();
            if (add.indexOf(BOOK) < 0) add.push(BOOK);
            await TH.setCurrentCharLorebooks({ primary: c.primary || null, additional: add });   // 主書和其他附加書都不動
            return { ok: true };
        } catch (e) { return { ok: false, why: '掛不上：' + ((e && e.message) || '') }; }
    }
    // 一條一張單子；有一條提不了（同名已經有了之類）就整份不成立
    async function _propsFor(d) {
        const E = _g('OS_AURELIA_EDIT');
        if (!E || !E.propose) return { ok: false, why: '改世界書的功能還沒載好' };
        const props = [];
        for (const e of d.entries) {
            const r = await E.propose('aurelia_worldbook_add', { book: BOOK, title: e.name, content: e.content, keys: (e.keys || []).join(',') });
            if (!r || !r.ok) return { ok: false, why: '「' + e.name + '」寫不進去：' + ((r && r.text) || '不知道為什麼') + '。按回爐叫他們改名字。' };
            r.prop.by = '白板'; r.prop.from = '白板';
            props.push(r.prop);
        }
        return { ok: true, props };
    }
    async function _bookExists() {
        const A = _lb();
        try { return ((A && A.getLorebooks) ? ((await A.getLorebooks()) || []) : []).indexOf(BOOK) >= 0; } catch (e) { return false; }
    }
    // 給她看單子之前：只檢查、不寫。那本還沒有就不建（她按同意或掛上才建）
    async function prepareWorld(draftId) {
        const A = _lb();
        if (!A || !A.getLorebookEntries || !A.createLorebook) return { ok: false, why: _pwa() ? '手機的世界書還沒載好' : '酒館助手沒開，寫不了世界書' };
        const b = await getBoard();
        const d = b.drafts.find(x => x.id === draftId && x.state === 'wait');
        if (!d) return { ok: false, why: '找不到這份稿' };
        if (await _bookExists()) {
            const chk = await _propsFor(d);
            if (!chk.ok) return chk;
        }
        return { ok: true, count: countKinds(d.entries), attached: isAttached(), pwa: _pwa() };
    }
    async function commitWorld(draftId) {
        const E = _g('OS_AURELIA_EDIT');
        if (!E || !E.apply) return { ok: false, why: '改世界書的功能還沒載好' };
        const b = await getBoard();
        const d = b.drafts.find(x => x.id === draftId && x.state === 'wait');
        if (!d) return { ok: false, why: '找不到這份稿' };
        const ok = await _ensureBook();
        if (!ok.ok) return ok;
        const pr = await _propsFor(d);
        if (!pr.ok) return pr;
        const done = [];
        for (const p of pr.props) {
            const r = await E.apply(p);
            if (!r || !r.ok) {
                for (const q of done.reverse()) { try { await E.undo(q); } catch (e) {} }   // 寫一半就收回去，不留半套
                return { ok: false, why: '「' + p.title + '」寫不進去：' + ((r && r.text) || '不知道為什麼') };
            }
            done.push(p);
        }
        return _edit((bb, now) => markWorld(bb, draftId, now, done));
    }
    // 改回去：照寫進去的反順序一張張 undo（跟住戶改世界書同一套，修改紀錄也會記）；全部回去了，稿放回等妳看
    async function undoWorld(worldId) {
        const E = _g('OS_AURELIA_EDIT');
        if (!E || !E.undo) return { ok: false, why: '改世界書的功能還沒載好' };
        const b = await getBoard();
        const w = b.world.find(x => x.id === worldId);
        if (!w) return { ok: false, why: '找不到這一份' };
        const props = (w.props || []).slice();
        if (!props.length) return { ok: false, why: '這一份沒記到單子，改不回去' };
        const left = [], bad = [];
        for (const p of props.slice().reverse()) {
            const r = await E.undo(p);
            if (!r || !r.ok) { left.unshift(p); bad.push('「' + p.title + '」' + ((r && r.text) || '')); }
        }
        return _lockData(async () => {
            const nb = await getBoard();
            const i = nb.world.findIndex(x => x.id === worldId);
            if (i >= 0) {
                if (!left.length) {
                    const wi = nb.world[i];
                    nb.world.splice(i, 1);
                    if (wi.draft && !nb.drafts.some(x => x.id === wi.draft.id)) nb.drafts.push(Object.assign({}, wi.draft, { state: 'wait' }));
                } else nb.world[i].props = left;
                await saveBoard(nb);
            }
            return bad.length ? { ok: false, why: '有幾條在那之後被改過，沒改回去：' + bad.join('；') } : { ok: true };
        });
    }

    const OS_SN_BOARD = {
        BOOK, KINDS, JOBS, CAPS, _cfg,
        getStaff, saveStaff, getBoard, waitingNow, shifts, act, visit, wake, candidates, setSlot, setOn, setTimes, resolve, faceOf, lookOf, onChange,
        waitCount, canHatch, countText, isAsleep, canWatch,
        runShift, tick, start, worldRefs, isBusy: () => !!_busy,
        prepareWorld, commitWorld, undoWorld, attach, isAttached,
        _lockDataForTest: _lockData, _saveBoardForTest: saveBoard,
        _pure: { emptyBoard, normBoard, waitCount, canHatch, isAsleep, nextSlot, unstick, pickJob, parseReply, applyResult,
            addMaterial, hatch, redo, drop, countKinds, countText, markWorld, refTerms, pickRefs, buildMessages,
            safeLink, youTubeUrl, youTubeStart, noteSong, cutNice: _cutNice, materialFrom, watchMessages, lyricPlan, lyricsMessages, songAt,
            BOOK, REF_BOOKS, CAPS, LEN, LYR, KINDS, JOBS, SLEEP_MS },
    };
    win.OS_SN_BOARD = OS_SN_BOARD;
    if (win !== window) { try { window.OS_SN_BOARD = OS_SN_BOARD; } catch (e) {} }
    try { if ((win.document || {}).readyState !== undefined) start(); } catch (e) {}
})();
