// ----------------------------------------------------------------
// [檔案] os_aurelia_theme.js — 「改主題」：角色／住戶提出新做、修改、換用主題，單子附改前改後的樣子，她按同意才換
// 路徑：os_phone/os/os_aurelia_theme.js
//
// 小機工具「會動手」的第四件（前三件：改世界書、改預設、改 VN 組件）。09-30 她：三種主題都要（劇情主題／手機主題／聊天 app 主題）。
//   三種各有自己的存法與工坊，這裡只當傳話，說明書、防呆、預覽全部借各自那一套：
//   ・劇情主題（story）：每個故事一段 CSS（VN_Theme，localStorage vn_theme_css::<故事>）＋創作室的主題藏櫃（vn_theme_gallery）。
//       說明書、假 VN 畫面、防呆（剝掉會把按鈕推走的寫法、會切掉名牌的警告）都在 OS_STUDIO.vnTheme。
//       「換上」＝把藏櫃裡那套套到她現在開著的這個故事。
//   ・手機主題（phone）：一套是一組格子（VoidPhoneShell 的 user themes），內建四套只能看、能換上。
//       說明書與檢查（OS_PHONE_THEME.prompt／clean／contrastIssues），單子上畫工坊那支假手機（previewHtml／paint）。
//   ・聊天 app 主題（chat）：一整份 CSS（WX_THEME_PACK），本來就沒有預覽 → 單子上一顆「先套上看看」，
//       直接蓋在聊天 app 上，關掉單子就換回正在用的那套（tryOn）。
//   ・還沒被同意之前再改＝接著上一張（草稿），舊的那張作廢（同 VN 組件）。
//   ・改回去：新做的拿掉、改的換回改前、換上的換回原本那套；之後又被改過就不動。
// 暴露：window.OS_AURELIA_THEME = { note, tools, run, propose, apply, undo, verb, text, what, noun, cards, detail, mountPreview, superseded }
//   單子 prop.mod === 'theme'，OS_AURELIA_EDIT 看到就轉過來。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const PART = 12000;   // 看內容一頁幾個字（10-01 她：跑團世界觀都三萬起步，3000 莫名。3000 是 09-19 只有上網搜尋時定的，奧瑞亞工具沿用沒重想過；聊天 app 那邊奧瑞亞的結果放寬到 16000）
    const CSS_MAX = 200 * 1024;
    const KINDS = { story: '劇情主題', phone: '手機主題', chat: '聊天 app 主題' };
    const CUR = '__current__';   // 劇情主題「這個故事正在用的」那段

    function _VT() { return win.VN_Theme || window.VN_Theme || null; }
    function _SV() { const S = win.OS_STUDIO || window.OS_STUDIO; return (S && S.vnTheme) || null; }
    function _PT() { return win.OS_PHONE_THEME || window.OS_PHONE_THEME || null; }
    function _PS() { return win.VoidPhoneShell || window.VoidPhoneShell || null; }
    function _WX() { return win.WX_THEME_PACK || window.WX_THEME_PACK || null; }
    function _no(t) { return { ok: false, text: t }; }
    function _one(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
    function _cut(s, n) { s = _one(s); return s.length > n ? s.slice(0, n) + '…' : s; }
    function _fold(s) { return _one(s).toLowerCase(); }
    function _newId() { return 'pt' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
    function _kind(k) {
        const s = _fold(k);
        if (/^(story|vn|劇情|劇情主題|剧情)/.test(s)) return 'story';
        if (/^(phone|手機|手机|手機主題)/.test(s)) return 'phone';
        if (/^(chat|wx|聊天|聊天 app|聊天app)/.test(s)) return 'chat';
        return null;
    }
    const KIND_DESC = 'story＝劇情主題（故事畫面的對話框、名牌、章節卡、章末鈕、設定視窗的樣子，每個故事各用一套）；'
        + 'phone＝手機主題（故事裡那支手機的主畫面、圖示、面板配色）；chat＝聊天 app 主題（手機裡聊天 app 整支的長相，泡泡不歸它管）';
    function _world() { const V = _VT(); try { return V && V.getCurrentWorld ? V.getCurrentWorld() : 'lobby_default'; } catch (e) { return 'lobby_default'; } }
    function _sameVars(a, b) { return JSON.stringify(a || {}) === JSON.stringify(b || {}); }

    // ── 每一種有哪些 ─────────────────────────────────────────────────────
    // 回 [{ id, name, builtin, active, css | vars, swatch }]
    async function _entries(tk) {
        if (tk === 'story') {
            const S = _SV(), V = _VT();
            const cur = V ? V.getCss(_world()) : '';
            const out = [{ id: CUR, name: '這個故事正在用的', css: cur, active: true, special: true }];
            ((S && S.gallery && S.gallery()) || []).forEach(function (t) { out.push({ id: t.id, name: t.name || '沒名字', css: t.css || '', active: !!cur && t.css === cur }); });
            return out;
        }
        if (tk === 'phone') {
            const P = _PS();
            if (!P) return [];
            const on = P.currentThemeId ? P.currentThemeId() : '';
            const built = (P.builtinThemes ? P.builtinThemes() : []).map(function (t) { return { id: t.id, name: t.name, builtin: true, active: t.id === on }; });
            const mine = (P.getUserThemes ? P.getUserThemes() : []).map(function (t) { return { id: t.id, name: t.name, vars: t.vars || {}, swatch: t.swatch || '', active: t.id === on }; });
            return built.concat(mine);
        }
        const W = _WX();
        if (!W) return [];
        const on = W.activeId ? W.activeId() : '';
        return ((await W.load()) || []).map(function (t) { return { id: t.id, name: t.name, css: t.css || '', active: t.id === on }; });
    }
    async function _find(tk, name) {
        const k = _fold(name);
        if (!k) return { err: '要寫是哪一套（名字）。' };
        const all = await _entries(tk);
        if (tk === 'story' && /^(這個故事正在用的|正在用的|現在的|current)$/.test(k)) return { t: all[0] };
        const hit = all.filter(function (t) { return _fold(t.name) === k || _fold(t.id) === k; });
        if (hit.length === 1) return { t: hit[0] };
        if (hit.length > 1) return { err: '有好幾套都叫「' + _one(name) + '」，請對方先改掉重複的名字。' };
        const near = all.filter(function (t) { return _fold(t.name).indexOf(k) !== -1; }).slice(0, 5);
        return { err: '找不到叫「' + _one(name) + '」的' + KINDS[tk] + '。' + (near.length ? '像的有：' + near.map(function (t) { return t.name; }).join('、') : '先用 aurelia_theme_list 看有哪些。') };
    }

    // ── 檢查（借各自工坊那一套）──────────────────────────────────────────
    // 劇情主題：會把按鈕推走的寫法直接剝掉（創作室套用時也是這樣），其他的只提醒
    function _checkStory(css) {
        const S = _SV();
        css = String(css || '').trim();
        if (!css) return { err: '樣式是空的。' };
        if (!/\{[\s\S]*\}/.test(css)) return { err: '這不像一份 CSS。' };
        if (css.length > CSS_MAX) return { err: '樣式太長了（最多 200KB）。' };
        const warn = [];
        if (S && S.strip) { const r = S.strip(css); if (r.hit) { css = r.css; warn.push('有 ' + r.hit + ' 處改到按鈕、名牌這些的位置或顯示方式，已經拿掉了（它們的位置是固定的，改了畫面會亂）'); } }
        try { if (S && S.risky) S.risky(css).forEach(function (m) { warn.push(m); }); } catch (e) {}
        try { if (S && S.flat) S.flat(css).forEach(function (m) { warn.push(m); }); } catch (e) {}
        try { if (S && S.missingVars) { const mv = S.missingVars(css); if (mv.length) warn.push('用了沒定義的變數：' + mv.join('、')); } } catch (e) {}
        return { css: css, warn: warn };
    }
    // 手機主題：照工坊那套把設定清成一組格子
    function _checkPhone(data, base) {
        const P = _PT();
        if (!P || !P.clean) return { err: '手機主題工坊還沒載好。' };
        let raw = data;
        if (typeof raw === 'string') raw = P.pickJson ? P.pickJson(raw) : (function () { try { return JSON.parse(raw); } catch (e) { return null; } })();
        if (!raw || typeof raw !== 'object') return { err: 'data 要是一份 JSON，格式照 aurelia_theme_spec（kind: phone）那份手機主題說明書（不是 kind: chat 那份，chat 才是交 CSS）。' };
        const got = P.clean(raw);
        if (!Object.keys(got).length) return { err: '這份設定裡一格都用不上（格子名稱要照說明書那張表）。' };
        const vars = Object.assign({}, base || {}, got);
        const warn = [];
        try { const miss = P.missing ? P.missing(vars) : []; if (miss.length) warn.push('有 ' + miss.length + ' 格沒填，會沿用內建留白相片的樣子'); } catch (e) {}
        try { const bad = P.contrastIssues ? P.contrastIssues(vars) : []; if (bad.length) warn.push('有 ' + bad.length + ' 組字壓在底上看不清楚：' + bad.slice(0, 4).map(function (x) { return x.t + '（' + x.r + ' 倍）'; }).join('、')); } catch (e) {}
        return { vars: vars, swatch: P.swatch ? P.swatch(raw.swatch, vars) : '', warn: warn };
    }
    // 聊天 app 主題：照主題包那套檢查，一條都用不上就退回
    function _checkChat(css) {
        const W = _WX();
        if (!W || !W.compile) return { err: '聊天 app 的主題還沒載好。' };
        css = String(css || '').trim();
        if (!css) return { err: '樣式是空的。' };
        const c = W.compile(css);
        if (!c.ok) return { err: c.error || '讀不懂這份樣式。' };
        // 退件要點名錯在哪、叫它回去重看那張表：退回後聊天 app 自動再回一次時，上一輪看的說明書已經收成一行（10-01 她：AI 說忘記寫 wx 被退件）
        const again = '先用 aurelia_theme_spec（kind: chat）再看一次聊天 app 主題的說明書（不是 kind: phone 那份），零件名字照那張表抄，整份重交。';
        const eg = (c.foreign || []).slice(0, 4).join('、');
        if (!c.kept) return { err: '這份樣式一條都用不上。' + again };
        if (!c.ours) {
            return { err: (c.palette ? '顏色表收到了，可是第二步的零件造型一條都沒有寫到這支聊天 app 的零件' : '裡面沒有一條寫到這支聊天 app 的零件')
                + (eg ? '：你寫的 ' + eg + ' 這支 app 沒有，零件都是 .wx- 開頭的' : '（零件都是 .wx- 開頭的）') + '。' + again };
        }
        const warn = [];
        if (eg) warn.push('有 ' + c.foreign.length + ' 條寫的零件這支 app 沒有，套上去碰不到東西：' + eg);
        if (c.dropped) warn.push('有 ' + c.dropped + ' 條被拿掉了（寫到泡泡、把東西藏起來、固定在螢幕上那種）');
        try { const miss = W.missingPalette ? W.missingPalette(css) : []; if (miss.length) warn.push('顏色表缺 ' + miss.length + ' 格必填的：' + miss.slice(0, 6).join('、')); } catch (e) {}
        try { const bad = W.contrastIssues ? W.contrastIssues(css) : []; if (bad.length) warn.push('有 ' + bad.length + ' 組字壓在底上看不清楚：' + bad.slice(0, 4).map(function (x) { return x.t + '（' + x.r + ' 倍）'; }).join('、')); } catch (e) {}
        return { css: css, warn: warn };
    }

    // ── 看的 ─────────────────────────────────────────────────────────────
    async function list(args) {
        const want = args && args.kind ? _kind(args.kind) : null;
        const kinds = want ? [want] : ['story', 'phone', 'chat'];
        const parts = [];
        for (const tk of kinds) {
            const all = await _entries(tk);
            const lines = all.map(function (t) {
                if (t.special) return '・這個故事正在用的（' + (t.css ? '有自訂樣式，' + t.css.length + ' 字' : '沒有自訂，用預設的黑金') + '）';
                return '・' + t.name + (t.builtin ? '｜內建，只能看、能換上' : '') + (t.active ? '｜正在用' : '');
            });
            const o = _drafts();
            Object.keys(o).forEach(function (k) { if (o[k].tk === tk && o[k].kind === 'add' && !o[k].alias) lines.push('・' + o[k].after.name + '｜草稿：單子還沒被同意，還沒存進去'); });
            parts.push('【' + KINDS[tk] + '】' + (lines.length ? '\n' + lines.join('\n') : '（沒有）'));
        }
        return parts.join('\n\n');
    }
    // 寫法（spec）一次給整份：聊天 app 的角色每個結果只完整看一次、下一輪就收成一行，分段的話看到第 3 頁時前兩頁早就不見了，
    //   永遠湊不齊那張表（10-01 她：gemini 一直跑去看第 3 頁、第 4 頁）。聊天 app 那邊 _spec 結尾的結果也放寬上限（wx_tools SPEC_MAX）。
    const SPEC_PART = 16000;
    function _paged(text, part, what, size) {
        const Z = size || PART;
        const n = Math.max(1, Math.ceil(text.length / Z));
        const p = Math.min(n, Math.max(1, Math.floor(Number(part) || 1)));
        return (n > 1 ? what + '（第 ' + p + '／' + n + ' 段' + (p < n ? '，part 填 ' + (p + 1) + ' 看下一段' : '，這是最後一段') + '）\n' : '') + text.slice((p - 1) * Z, p * Z);
    }
    async function read(args) {
        const tk = _kind(args.kind);
        if (!tk) return 'kind 要寫 story、phone 或 chat。';
        const d = _draftFor(tk, args.name);
        let t, note = '';
        if (d) { t = Object.assign({ name: d.after.name }, d.after); note = '這是你上一張單子的內容，對方還沒按同意；要再改就對它用 aurelia_theme_edit。\n'; }
        else { const f = await _find(tk, args.name); if (f.err) return f.err; t = f.t; }
        if (t.builtin) return KINDS[tk] + '「' + t.name + '」是內建的，內容寫在程式的樣式檔裡、這裡讀不到；要照它的感覺做，就用 aurelia_theme_add 做一套新的。';
        const body = tk === 'phone' ? JSON.stringify({ vars: t.vars || {} }, null, 1) : (t.css || '（空的）');
        return _paged(note + KINDS[tk] + '「' + t.name + '」' + (t.active ? '（正在用）' : '') + '\n' + body, args.part, '這套的內容');
    }
    // 看過說明書的憑證（10-01）：聊天 app 一輪最多叫三個工具、三個一起跑完才交回結果，
    //   AI 可以同一輪叫 spec 又叫 add——交出去那份是沒看過說明書、憑印象寫的（她測聊天 app 主題，零件寫成 .header 被退；
    //   手機主題那次只寫幾格也是同一個病）。說明書最後給一串字，add 要帶著它；同一輪叫的拿不到，一定交不出去。
    //   每次看都發一串新的（記在這台、留一天），所以不必管說明書每次產生的內容是不是一字不差。
    const SPEC_CODE_KEY = 'aurelia_theme_spec_codes', SPEC_CODE_TTL = 86400000;
    function _specCodes() {
        let o = {};
        try { o = JSON.parse(localStorage.getItem(SPEC_CODE_KEY) || '{}') || {}; } catch (e) {}
        const old = Date.now() - SPEC_CODE_TTL;
        Object.keys(o).forEach(function (k) { if (!o[k] || o[k].at < old) delete o[k]; });
        return o;
    }
    function _specIssue(tk) {
        const o = _specCodes();
        const code = Math.random().toString(36).slice(2, 6);
        o[code] = { tk: tk, at: Date.now() };
        const keys = Object.keys(o).sort(function (a, b) { return o[b].at - o[a].at; });
        keys.slice(30).forEach(function (k) { delete o[k]; });
        try { localStorage.setItem(SPEC_CODE_KEY, JSON.stringify(o)); } catch (e) {}
        return code;
    }
    function _specOk(tk, code) {
        const c = _specCodes()[String(code == null ? '' : code).trim().toLowerCase()];
        return !!(c && c.tk === tk);
    }
    function spec(args) {
        const tk = _kind(args.kind);
        if (!tk) return 'kind 要寫 story、phone 或 chat。';
        let txt = '', pre = '';
        if (tk === 'story') {
            const S = _SV(); txt = S && S.spec ? S.spec() : '';
            pre = '下面是對方的創作室給模型的劇情主題說明書。交的時候用 aurelia_theme_add（kind: story）的 css 參數，只交 CSS 本身。\n\n';
        } else if (tk === 'phone') {
            const P = _PT(); txt = P && P.prompt ? P.prompt() : '';
            pre = '下面是對方的手機主題工坊給模型的說明書。說明書要你輸出的那份 JSON，原樣放進 aurelia_theme_add（kind: phone）的 data 參數。\n\n';
        } else {
            const W = _WX(); txt = W && W.spec ? W.spec() : '';
            pre = '下面是對方的聊天 app 給模型的主題說明書。交的時候用 aurelia_theme_add（kind: chat）的 css 參數。\n\n';
        }
        if (!txt) return '那一種的說明書還沒載好。';
    // 號碼開頭也放一份：聊天 app 下一輪就把說明書收成開頭 200 字，只放結尾的話，中間先叫 look 再交時號碼已經看不到、只好再看一次說明書（10-01 公益站 gemini-3.1-pro 實測）
        const code = _specIssue(tk);
        const head = '（看完照著寫，用 aurelia_theme_add 交的時候 spec 參數填：' + code + '）\n';
        const tail = '\n\n——說明書到這裡。照它寫好之後用 aurelia_theme_add 交，spec 參數填：' + code;
        return _paged(head + pre + txt + tail, args.part, KINDS[tk] + '的寫法', SPEC_PART);
    }

    // ── 草稿：還沒被同意的那張（同 VN 組件）────────────────────────────────
    const DRAFT_KEY = 'aurelia_theme_drafts', DRAFT_DAYS = 14;
    function _drafts() {
        let o = {};
        try { o = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}') || {}; } catch (e) {}
        const old = Date.now() - DRAFT_DAYS * 86400000;
        Object.keys(o).forEach(function (k) { if (!o[k] || o[k].at < old) delete o[k]; });
        return o;
    }
    function _draftsSave(o) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(o)); } catch (e) {} }
    function _dkey(tk, name) { return tk + ':' + _fold(name); }
    function _draftFor(tk, name) { return _drafts()[_dkey(tk, name)] || null; }
    function _draftPut(prop, oldName) {
        const o = _drafts();
        const rec = { id: prop.id, tk: prop.tk, kind: prop.kind, tid: prop.tid || null, before: prop.before, after: prop.after, use: !!prop.use, at: Date.now() };
        o[_dkey(prop.tk, prop.title)] = rec;
        if (oldName && _dkey(prop.tk, oldName) !== _dkey(prop.tk, prop.title)) o[_dkey(prop.tk, oldName)] = Object.assign({ alias: true }, rec);
        _draftsSave(o);
    }
    function _draftDrop(prop) {
        const o = _drafts();
        Object.keys(o).forEach(function (k) { if (o[k].id === prop.id) delete o[k]; });
        _draftsSave(o);
    }
    function superseded(prop) {
        if (!prop || prop.kind === 'use' || (prop.state !== 'wait' && prop.state !== 'no')) return false;
        const d = _drafts()[_dkey(prop.tk, prop.title)];
        return !!(d && d.id !== prop.id);
    }

    // ── 提出（做成單子）──────────────────────────────────────────────────
    function _prop(tk, kind, name, extra) {
        return Object.assign({ id: _newId(), mod: 'theme', tk: tk, kind: kind, book: KINDS[tk], title: name, state: 'wait', at: Date.now() }, extra);
    }
    async function _proposeAdd(args) {
        const tk = _kind(args.kind);
        if (!tk) return _no('kind 要寫 story、phone 或 chat。');
        if (!_specOk(tk, args.spec)) {
            return _no((args.spec ? 'spec 填的那串字對不上' + KINDS[tk] + '的說明書' : '還沒看過' + KINDS[tk] + '的說明書就交了')
                + '：先只叫 aurelia_theme_spec（kind: ' + tk + '）看完整份說明書——結果下一輪才會交給你，不要跟交主題同一輪叫；'
                + '下一輪照說明書寫，交的時候 spec 參數填說明書最後給的那串字。');
        }
        const name = _one(args.name).slice(0, 30);
        if (!name) return _no('要取一個名字（name）。');
        if ((await _entries(tk)).some(function (t) { return _fold(t.name) === _fold(name); })) return _no('已經有一套叫「' + name + '」的' + KINDS[tk] + '了，要改它用 aurelia_theme_edit，要做新的換一個名字。');
        let after, warn;
        if (tk === 'phone') {
            const c = _checkPhone(args.data);
            if (c.err) return _no(c.err);
            // 新做一套只填了幾格：沒填的全回內建留白相片，她看到的是「只改了一部分」（10-01 她測小熊餅乾，說了要整套還是只改一點）。
            //   多半是沒看說明書、憑印象寫了幾格（格子名字寫錯的被 clean 丟掉）。缺超過四分之一就退回，點名缺哪些、叫它看完整的表重交；
            //   聊天 app 那邊退回的原因會交回給它、自動再回一次。改一套（edit）本來就只寫要改的，不擋。
            const P = _PT(), need = (P && P.missing) ? P.missing({}) : [], miss = (P && P.missing) ? P.missing(c.vars) : [];
            if (need.length && miss.length > need.length / 4) {
                return _no('新做一套手機主題要把說明書那張表的格子寫齊：這份認得的必填格只有 ' + (need.length - miss.length) + ' 格，還缺 ' + miss.length + ' 格（例如 ' + miss.slice(0, 6).join('、') + '）。'
                    + '沒填的會變回內建的樣子，看起來只改了一部分。先用 aurelia_theme_spec（kind: phone）看完整的表，格子名字照表抄，整份重交。');
            }
            after = { name: name, vars: c.vars, swatch: c.swatch }; warn = c.warn;
        } else {
            const c = tk === 'story' ? _checkStory(args.css) : _checkChat(args.css);
            if (c.err) return _no(c.err);
            after = { name: name, css: c.css }; warn = c.warn;
        }
        const prop = _prop(tk, 'add', name, { before: null, after: after, use: args.use === true || args.use === 'true', warn: warn });
        _draftPut(prop);
        return { ok: true, prop: prop };
    }
    async function _proposeEdit(args) {
        const tk = _kind(args.kind);
        if (!tk) return _no('kind 要寫 story、phone 或 chat。');
        const d = _draftFor(tk, args.name);
        let kind, tid, before, base, use = false;
        if (d) { kind = d.kind; tid = d.tid; before = d.before; base = d.after; use = d.use; }
        else {
            const f = await _find(tk, args.name);
            if (f.err) return _no(f.err);
            const t = f.t;
            if (t.builtin) return _no('「' + t.name + '」是內建的，不能改；要照它的感覺做，就用 aurelia_theme_add 做一套新的。');
            kind = 'edit'; tid = t.id;
            before = tk === 'phone' ? { name: t.name, vars: t.vars || {}, swatch: t.swatch || '' } : { name: t.name, css: t.css || '' };
            base = JSON.parse(JSON.stringify(before));
        }
        const after = JSON.parse(JSON.stringify(base));
        if (args.new_name != null && _one(args.new_name)) {
            if (tid === CUR) return _no('「這個故事正在用的」不能改名字；要存成一套就用 aurelia_theme_add。');
            after.name = _one(args.new_name).slice(0, 30);
        }
        let warn = [];
        if (tk === 'phone') {
            if (args.data != null && args.data !== '') {
                const c = _checkPhone(args.data, after.vars);
                if (c.err) return _no(c.err);
                after.vars = c.vars; after.swatch = c.swatch; warn = c.warn;
            }
        } else {
            let css = after.css;
            if (args.find != null && args.find !== '') {
                if (args.css != null) return _no('find 和整份重寫（css）不能一起用。');
                const n = css.split(String(args.find)).length - 1;
                if (n === 0) return _no('「' + _cut(args.find, 60) + '」在樣式裡找不到，要照 aurelia_theme_read 看到的原文一字不差抄。');
                if (n > 1) return _no('「' + _cut(args.find, 60) + '」在樣式裡出現了 ' + n + ' 次，多抄前後幾個字，讓它只出現一次。');
                css = css.replace(String(args.find), function () { return String(args.replace == null ? '' : args.replace); });
            }
            if (args.css != null) css = String(args.css);
            if (css !== after.css) {
                const c = tk === 'story' ? _checkStory(css) : _checkChat(css);
                if (c.err) return _no(c.err);
                after.css = c.css; warn = c.warn;
            }
        }
        if (JSON.stringify(after) === JSON.stringify(base)) return _no('跟現在一模一樣，沒有要改的地方。');
        if (before && JSON.stringify(after) === JSON.stringify(before)) return _no('改完跟存著的那套一模一樣，不用再提單子。');
        // 單子認哪一套（草稿也照這個對）：新做的＝它的名字；修改＝原本那套的名字（改名不影響）
        const prop = _prop(tk, kind, kind === 'add' ? after.name : before.name, { tid: tid, before: before, after: after, use: use, warn: warn });
        _draftPut(prop, d ? base.name : null);   // 新做的草稿改了名字：舊名字那格也指到這張，舊單子才會作廢
        return { ok: true, prop: prop };
    }
    async function _proposeUse(args) {
        const tk = _kind(args.kind);
        if (!tk) return _no('kind 要寫 story、phone 或 chat。');
        const f = await _find(tk, args.name);
        if (f.err) return _no(f.err);
        const t = f.t;
        if (t.special) return _no('這套本來就是這個故事正在用的。');
        if (t.active) return _no('「' + t.name + '」已經是正在用的了。');
        const all = await _entries(tk);
        const on = all.find(function (x) { return x.active && !x.special; });
        const before = tk === 'story' ? { name: '這個故事原本的樣子', css: all[0].css } : (on ? { id: on.id, name: on.name, vars: on.vars, builtin: on.builtin } : { id: '', name: '原本的樣子' });
        const after = tk === 'phone' ? { id: t.id, name: t.name, vars: t.vars, builtin: t.builtin } : { id: t.id, name: t.name, css: t.css };
        if (tk === 'story') before.world = _world();
        return { ok: true, prop: _prop(tk, 'use', t.name, { tid: t.id, before: before, after: after }) };
    }
    async function propose(name, args) {
        args = args || {};
        if (name === 'aurelia_theme_add') return _proposeAdd(args);
        if (name === 'aurelia_theme_edit') return _proposeEdit(args);
        if (name === 'aurelia_theme_use') return _proposeUse(args);
        return _no('沒有叫做「' + name + '」的工具');
    }

    // ── 她按同意／改回去 ─────────────────────────────────────────────────
    function _stale(prop, why) { prop.state = 'stale'; prop.why = why; return { ok: false, text: why }; }
    async function apply(prop) {
        if (!prop || (prop.state !== 'wait' && prop.state !== 'no')) return { ok: false, text: '這張已經處理過了' };
        if (superseded(prop)) return { ok: false, text: '這張已經有新的一版了，看最新那張' };
        const tk = prop.tk, a = prop.after, b = prop.before;
        try {
            if (tk === 'story') {
                const S = _SV(), V = _VT();
                if (!S || !V) return { ok: false, text: '劇情主題還沒載好' };
                const w = prop.kind === 'use' && b.world ? b.world : _world();
                if (prop.kind === 'add') {
                    const g = S.gallery();
                    if (g.some(function (t) { return _fold(t.name) === _fold(a.name); })) return _stale(prop, '在那之後已經有同名的一套了，沒有再存');
                    const id = 'th_' + Date.now().toString(36);
                    g.unshift({ id: id, name: a.name, css: a.css });
                    S.saveGallery(g);
                    prop.tid = id;
                    if (prop.use) { prop.world = w; prop.prevCss = V.getCss(w); V.setCss(w, a.css); }
                } else if (prop.kind === 'edit') {
                    if (prop.tid === CUR) {
                        if (V.getCss(w) !== b.css) return _stale(prop, '這個故事的樣式在提出之後被改過了，這張作廢，沒有蓋掉');
                        V.setCss(w, a.css); prop.world = w;
                    } else {
                        const g = S.gallery(), t = g.find(function (x) { return x.id === prop.tid; });
                        if (!t || t.css !== b.css || t.name !== b.name) return _stale(prop, '這一套在提出之後被改過了，這張作廢，沒有蓋掉');
                        const wasOn = V.getCss(w) === t.css;
                        t.css = a.css; t.name = a.name;
                        S.saveGallery(g);
                        if (wasOn || prop.use) { prop.world = w; prop.prevCss = V.getCss(w); V.setCss(w, a.css); }
                    }
                } else {
                    if (V.getCss(w) !== b.css) return _stale(prop, '這個故事的樣式在提出之後被改過了，這張作廢');
                    prop.world = w; prop.prevCss = b.css; V.setCss(w, a.css);
                }
            } else if (tk === 'phone') {
                const P = _PS();
                if (!P || !P.saveUserTheme) return { ok: false, text: '手機還沒載好' };
                if (prop.kind === 'add') {
                    if (P.getUserThemes().some(function (t) { return _fold(t.name) === _fold(a.name); })) return _stale(prop, '在那之後已經有同名的一套了，沒有再存');
                    const id = 'u' + Date.now().toString(36);
                    P.saveUserTheme({ id: id, name: a.name, swatch: a.swatch, vars: a.vars });
                    prop.tid = id;
                    if (prop.use) { prop.prevActive = P.currentThemeId(); P.useTheme(id); }
                } else if (prop.kind === 'edit') {
                    const t = P.getUserThemes().find(function (x) { return x.id === prop.tid; });
                    if (!t || t.name !== b.name || !_sameVars(t.vars, b.vars)) return _stale(prop, '這一套在提出之後被改過了，這張作廢，沒有蓋掉');
                    P.saveUserTheme({ id: t.id, name: a.name, swatch: a.swatch || t.swatch, vars: a.vars });
                    if (P.currentThemeId() === t.id) P.useTheme(t.id);   // 正在用的重新套一次
                } else {
                    if (P.currentThemeId() !== (b.id || P.currentThemeId())) return _stale(prop, '在那之後已經換過別套了，這張作廢');
                    prop.prevActive = P.currentThemeId(); P.useTheme(prop.tid);
                }
            } else {
                const W = _WX();
                if (!W) return { ok: false, text: '聊天 app 的主題還沒載好' };
                if (prop.kind === 'add') {
                    if (((await W.load()) || []).some(function (t) { return _fold(t.name) === _fold(a.name); })) return _stale(prop, '在那之後已經有同名的一套了，沒有再存');
                    const t = await W.add(a.name, a.css, 'ai');
                    if (!t) return { ok: false, text: '主題清單還讀不到，等一下再試' };
                    prop.tid = t.id;
                    if (prop.use) { prop.prevActive = W.activeId(); await W.apply(t.id); }
                } else if (prop.kind === 'edit') {
                    const t = ((await W.load()) || []).find(function (x) { return x.id === prop.tid; });
                    if (!t || t.css !== b.css || t.name !== b.name) return _stale(prop, '這一套在提出之後被改過了，這張作廢，沒有蓋掉');
                    await W.update(t.id, a.css, a.name);
                } else {
                    if (W.activeId() !== (b.id || '')) return _stale(prop, '在那之後已經換過別套了，這張作廢');
                    prop.prevActive = W.activeId(); await W.apply(prop.tid);
                }
            }
        } catch (e) { return { ok: false, text: '換不上：' + ((e && e.message) || '不知道為什麼') }; }
        prop.state = 'done'; prop.doneAt = Date.now();
        if (prop.kind !== 'use') _draftDrop(prop);
        return { ok: true };
    }
    async function undo(prop) {
        if (!prop || prop.state !== 'done') return { ok: false, text: '這張沒有寫進去過' };
        const tk = prop.tk, a = prop.after, b = prop.before;
        const LATER = '在那之後又被改過了，改不回去（怕蓋掉後來的修改）';
        try {
            if (tk === 'story') {
                const S = _SV(), V = _VT();
                const w = prop.world || _world();
                if (prop.kind === 'add') {
                    const g = S.gallery(), t = g.find(function (x) { return x.id === prop.tid; });
                    if (t && t.css !== a.css) return { ok: false, text: LATER };
                    S.saveGallery(g.filter(function (x) { return x.id !== prop.tid; }));
                    if (prop.prevCss != null && V.getCss(w) === a.css) V.setCss(w, prop.prevCss);
                } else if (prop.kind === 'edit') {
                    if (prop.tid === CUR) {
                        if (V.getCss(w) !== a.css) return { ok: false, text: LATER };
                        V.setCss(w, b.css);
                    } else {
                        const g = S.gallery(), t = g.find(function (x) { return x.id === prop.tid; });
                        if (!t || t.css !== a.css) return { ok: false, text: LATER };
                        t.css = b.css; t.name = b.name; S.saveGallery(g);
                        if (prop.prevCss != null && V.getCss(w) === a.css) V.setCss(w, b.css);
                    }
                } else {
                    if (V.getCss(w) !== a.css) return { ok: false, text: LATER };
                    V.setCss(w, prop.prevCss || '');
                }
            } else if (tk === 'phone') {
                const P = _PS();
                if (prop.kind === 'add') {
                    const t = P.getUserThemes().find(function (x) { return x.id === prop.tid; });
                    if (t && !_sameVars(t.vars, a.vars)) return { ok: false, text: LATER };
                    const wasOn = P.currentThemeId() === prop.tid;
                    P.removeUserTheme(prop.tid);
                    if (wasOn && prop.prevActive) P.useTheme(prop.prevActive);
                } else if (prop.kind === 'edit') {
                    const t = P.getUserThemes().find(function (x) { return x.id === prop.tid; });
                    if (!t || !_sameVars(t.vars, a.vars)) return { ok: false, text: LATER };
                    P.saveUserTheme({ id: t.id, name: b.name, swatch: b.swatch || t.swatch, vars: b.vars });
                    if (P.currentThemeId() === t.id) P.useTheme(t.id);
                } else {
                    if (P.currentThemeId() !== prop.tid) return { ok: false, text: LATER };
                    P.useTheme(prop.prevActive);
                }
            } else {
                const W = _WX();
                if (prop.kind === 'add') {
                    const t = ((await W.load()) || []).find(function (x) { return x.id === prop.tid; });
                    if (t && t.css !== a.css) return { ok: false, text: LATER };
                    const wasOn = W.activeId() === prop.tid;
                    await W.remove(prop.tid);
                    if (wasOn && prop.prevActive) await W.apply(prop.prevActive);
                } else if (prop.kind === 'edit') {
                    const t = ((await W.load()) || []).find(function (x) { return x.id === prop.tid; });
                    if (!t || t.css !== a.css) return { ok: false, text: LATER };
                    await W.update(t.id, b.css, b.name);
                } else {
                    if (W.activeId() !== prop.tid) return { ok: false, text: LATER };
                    await W.apply(prop.prevActive || '');
                }
            }
        } catch (e) { return { ok: false, text: '改不回去：' + ((e && e.message) || '不知道為什麼') }; }
        prop.state = 'undone'; prop.undoneAt = Date.now();
        return { ok: true };
    }

    // ── 那一行怎麼寫、單子小窗畫什麼 ─────────────────────────────────────
    function verb(prop) { return prop.kind === 'add' ? '新做' : (prop.kind === 'use' ? '換上' : '修改'); }
    function _whatLine(prop) {
        if (prop.tk === 'story' && prop.tid === CUR) return '這個故事正在用的劇情主題';
        return KINDS[prop.tk] + '「' + ((prop.after && prop.after.name) || prop.title) + '」';
    }
    function text(prop, forModel) {
        if (!prop) return '';
        const who = prop.by || '對方', v = verb(prop), what = _whatLine(prop);
        if (forModel) {
            if (prop.state === 'done') return who + ' ' + v + '了' + what + '，對方同意了，已經換上';
            if (prop.state === 'no') return who + ' 提出要' + v + what + '，對方沒有同意，沒有改';
            if (prop.state === 'undone') return who + ' ' + v + '了' + what + '，後來對方改回去了';
            if (prop.state === 'stale') return who + ' 提出要' + v + what + '，但那一套後來被改過，沒有換上';
            return who + ' 提出要' + v + what + '，還在等對方決定';
        }
        if (prop.state === 'done' || prop.state === 'undone') return who + ' ' + v + '了' + what;
        return who + ' 想' + v + what;
    }
    function what(prop) { return KINDS[prop && prop.tk] || '主題'; }
    function noun(prop) { return KINDS[prop && prop.tk] || '主題'; }
    function cards(prop) {
        const a = prop.after || {}, b = prop.before, out = [];
        const warn = (prop.warn || []).length ? { lab: '要注意', txt: prop.warn.join('\n') } : null;
        if (prop.tk === 'chat') {
            out.push({ lab: '樣子（聊天 app 開著才看得到）', preview: 'try' });
        } else if (prop.kind === 'add') {
            out.push({ lab: '新的樣子', preview: 'after' });
        } else {
            out.push({ lab: prop.kind === 'use' ? '現在的樣子' : '改前的樣子', preview: 'before' });
            out.push({ lab: prop.kind === 'use' ? '換上之後' : '改後的樣子', preview: 'after' });
        }
        if (warn) out.push(warn);
        if (prop.kind === 'add' && prop.use) out.push({ lab: '同意之後', val: prop.tk === 'story' ? '存起來，並直接套到你現在開著的這個故事' : '存起來，並直接換上' });
        if (prop.kind === 'use') out.push({ lab: '換上', from: (b && b.name) || '原本的樣子', to: a.name });
        if (prop.kind === 'edit' && b && b.name !== a.name) out.push({ lab: '名字', from: b.name, to: a.name });
        if (prop.tk === 'phone' && prop.kind !== 'use') {
            const bv = (b && b.vars) || {}, av = a.vars || {};
            const keys = Object.keys(av).filter(function (k) { return bv[k] !== av[k]; }).concat(Object.keys(bv).filter(function (k) { return !(k in av); }));
            // 格子代號換成工坊那張表的中文說明（她看不懂 --aps-… 那種）
            const P = _PT(), F = (P && P.FIELDS) || [];
            const lab = function (k) { const f = F.find(function (x) { return x.k === k; }); return f ? _cut(String(f.h).split(/[。，,]/)[0], 18) : k; };
            if (keys.length) out.push({ lab: '改了哪幾格', txt: keys.map(function (k) { return lab(k) + '：' + (bv[k] || '（原本的）') + ' → ' + (av[k] || '（拿掉）'); }).join('\n') });
        } else if (prop.kind === 'edit') {
            out.push({ lab: '樣式', diff: [b.css, a.css] });
        } else if (prop.kind === 'add') {
            out.push({ lab: '樣式', txt: a.css });
        }
        return out;
    }
    function detail(prop) {
        const out = [];
        if (prop.kind === 'use') out.push('從「' + ((prop.before && prop.before.name) || '原本的樣子') + '」換成「' + prop.after.name + '」');
        else if (prop.kind === 'edit' && prop.before && prop.before.name !== prop.after.name) out.push('名字：「' + prop.before.name + '」改成「' + prop.after.name + '」');
        if (prop.kind === 'add' && prop.use) out.push('同意時直接換上了');
        if ((prop.warn || []).length) out.push('提出時提醒過：' + prop.warn.join('；'));
        return out;
    }

    // ── 預覽 ─────────────────────────────────────────────────────────────
    // 劇情主題：跟創作室主題編輯器同一套（10-01 她：沒法看不同尺寸、尺寸不像手機端）——
    //   上面兩排：尺寸（手機／中間／全屏，預設手機、選的記著）與畫面（對話、旁白、章節卡、章末、設定）；
    //   假 VN 畫面照那個尺寸真的畫、再等比縮小放進來（手機限高 430，同編輯器）；章節卡畫完抄對話框的皮。幾張一起切。
    const MODES = [['char-mode', '對話'], ['nar-mode', '旁白'], ['chapter', '章節卡'], ['end', '章末'], ['settings', '設定']];
    let _mode = 'char-mode';
    const _live = [];
    function _thFrames() {
        const S = _SV();
        return (S && S.frames) ? S.frames() : { phone: { w: 390, h: 844, lab: '手機' }, center: { w: 1000, h: 660, lab: '中間' }, full: { w: 1920, h: 1080, lab: '全屏' } };
    }
    function _thVp() { try { const v = localStorage.getItem('vth_pv_vp'); return _thFrames()[v] ? v : 'phone'; } catch (e) { return 'phone'; } }
    function _storyPaint(fr, css, mode) {
        const S = _SV();
        fr.onload = function () { if (mode === 'chapter' && S.skinCard) { try { S.skinCard(fr.contentDocument); } catch (e) {} } };
        fr.srcdoc = S.doc(css, mode);
    }
    function _storyPreview(el, css) {
        const S = _SV();
        if (!S || !S.doc) { el.textContent = '創作室還沒載好，畫不出來。'; return; }
        const F = _thFrames();
        const sizes = document.createElement('div');
        sizes.className = 'vn-pv-tabs';
        sizes.innerHTML = Object.keys(F).map(function (k) { return '<button type="button" class="vn-pv-tab" data-vp="' + k + '">' + F[k].lab + '</button>'; }).join('');
        const tabs = document.createElement('div');
        tabs.className = 'vn-pv-tabs';
        tabs.innerHTML = MODES.map(function (m) { return '<button type="button" class="vn-pv-tab" data-mode="' + m[0] + '">' + m[1] + '</button>'; }).join('');
        const wrap = document.createElement('div');
        wrap.className = 'th-pv-wrap';
        const box = document.createElement('div');   // 縮好的那塊（置中；手機縮得比單子窄）
        box.className = 'th-pv-box';
        const fr = document.createElement('iframe');
        fr.className = 'th-pv-frame';
        fr.setAttribute('sandbox', 'allow-same-origin');
        box.appendChild(fr);
        wrap.appendChild(box);
        el.appendChild(sizes); el.appendChild(tabs); el.appendChild(wrap);
        let painted = '';
        const one = { el: el, paint: function () {
            const vp = _thVp(), f = _thFrames()[vp];
            const avail = Math.max(1, wrap.clientWidth || 320);
            const s = vp === 'phone' ? Math.min(avail / f.w, 430 / f.h) : Math.min(1, avail / f.w);
            fr.style.width = f.w + 'px'; fr.style.height = f.h + 'px'; fr.style.transform = 'scale(' + s + ')';
            box.style.width = Math.round(f.w * s) + 'px'; box.style.height = Math.round(f.h * s) + 'px';
            if (painted !== _mode) { painted = _mode; _storyPaint(fr, css, _mode); }
            sizes.querySelectorAll('[data-vp]').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-vp') === vp); });
            tabs.querySelectorAll('[data-mode]').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-mode') === _mode); });
        } };
        _live.push(one);
        const all = function () { for (let i = _live.length - 1; i >= 0; i--) { if (!_live[i].el.isConnected) _live.splice(i, 1); else _live[i].paint(); } };
        sizes.addEventListener('click', function (e) {
            const b = e.target.closest('[data-vp]');
            if (!b) return;
            try { localStorage.setItem('vth_pv_vp', b.getAttribute('data-vp')); } catch (er) {}
            all();
        });
        tabs.addEventListener('click', function (e) {
            const b = e.target.closest('[data-mode]');
            if (!b) return;
            _mode = b.getAttribute('data-mode');
            all();
        });
        one.paint();
        try { const ro = new ResizeObserver(function () { if (wrap.isConnected) one.paint(); }); ro.observe(wrap); } catch (e) {}
    }
    // 手機主題：工坊那支假手機，照這套的格子上色（內建的掛它的 class）
    function _phonePreview(el, t) {
        const P = _PT();
        if (!P || !P.previewHtml) { el.textContent = '手機主題工坊還沒載好，畫不出來。'; return; }
        el.innerHTML = '<div class="th-pv-phone">' + P.previewHtml() + '</div>';
        const box = el.querySelector('.pth-preview');
        if (!box || !t) return;
        if (t.vars && Object.keys(t.vars).length) P.paint(box, t.vars);
        else if (t.id) box.classList.add('theme-' + t.id);
    }
    // 聊天 app 主題：一顆「先套上看看」，蓋在真的聊天 app 上；回還原的那支（單子關掉時叫）
    function _chatTry(el, prop) {
        const W = _WX();
        if (!W || !W.tryOn) { el.textContent = '聊天 app 的主題還沒載好。'; return null; }
        const css = prop.after && prop.after.css;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'th-pv-try';
        el.appendChild(btn);
        const tip = document.createElement('div');
        tip.className = 'th-pv-tip';
        tip.textContent = '按了這張單子先收起來，直接看聊天 app 套上的樣子；底下那條可以回到單子，或換回原本的。按同意才會留著，關掉這張單子就換回正在用的那套。';
        el.appendChild(tip);
        let restore = null;
        const paint = function () { btn.textContent = restore ? '換回原本的' : '先套上看看'; btn.classList.toggle('on', !!restore); };
        btn.addEventListener('click', function () {
            if (restore) { restore(); restore = null; }
            else {
                restore = prop.kind === 'use' && !css ? W.tryOn('') : W.tryOn(css);
                // 單子蓋在聊天上看不到：請單子收起來（同 os_aurelia_bubble.js 的先套上看看）
                try {
                    const CE = (el.ownerDocument.defaultView || window).CustomEvent;
                    el.dispatchEvent(new CE('wxtl-peek', { bubbles: true, detail: { off: function () { if (restore) { restore(); restore = null; paint(); } } } }));
                } catch (e) {}
            }
            paint();
        });
        paint();
        return function () { if (restore && prop.state !== 'done') restore(); restore = null; };
    }
    function mountPreview(prop, which, el) {
        if (prop.tk === 'chat') return _chatTry(el, prop);
        const t = which === 'before' ? prop.before : prop.after;
        if (prop.tk === 'story') { _storyPreview(el, (t && t.css) || ''); return null; }
        _phonePreview(el, t);
        return null;
    }

    // ── 提單子之前先看看（10-01 她：主題也加先看看截圖吧）─────────────────────
    //   要看的那一套：名字找得到（草稿優先）就從它開始、再套上這次給的改法；找不到、又給了內容，就當新的一套。
    //   不出單子、不存任何東西。回 { text, images:[data URL] }（最多三張，橋只收三張）。
    async function _candidate(args) {
        const tk = _kind(args.kind);
        if (!tk) return { err: 'kind 要寫 story、phone 或 chat。' };
        let t = null;
        const d = args.name ? _draftFor(tk, args.name) : null;
        if (d) t = JSON.parse(JSON.stringify(d.after));
        else if (args.name) { const f = await _find(tk, args.name); if (!f.err) t = JSON.parse(JSON.stringify(f.t)); }
        const warn = [];
        if (tk === 'phone') {
            if (args.data != null && args.data !== '') {
                if (t && t.builtin) t = null;   // 內建的格子讀不到，給了格子就當新的一套看
                const c = _checkPhone(args.data, t ? t.vars : null);
                if (c.err) return { err: c.err };
                t = { name: (t && t.name) || _one(args.name) || '新的一套', vars: c.vars }; c.warn.forEach(function (w) { warn.push(w); });
            }
        } else {
            let css = t ? (t.css || '') : null;
            if (args.find != null && args.find !== '') {
                if (css == null) return { err: '找不到叫「' + _one(args.name) + '」的，find 沒有東西可以換。' };
                const n = css.split(String(args.find)).length - 1;
                if (n !== 1) return { err: n ? '「' + _cut(args.find, 60) + '」出現了 ' + n + ' 次，多抄前後幾個字。' : '「' + _cut(args.find, 60) + '」在樣式裡找不到。' };
                css = css.replace(String(args.find), function () { return String(args.replace == null ? '' : args.replace); });
            }
            if (args.css != null) css = String(args.css);
            if (css != null && (!t || css !== t.css || !d)) {
                if (css.trim()) {
                    const c = tk === 'story' ? _checkStory(css) : _checkChat(css);
                    if (c.err) return { err: c.err };
                    css = c.css; c.warn.forEach(function (w) { warn.push(w); });
                }
                t = Object.assign({}, t || { name: _one(args.name) || '新的一套' }, { css: css });
            }
        }
        if (!t) return { err: '找不到叫「' + _one(args.name) + '」的' + KINDS[tk] + '，要看新的一套就把內容一起給（css 或 data）。' };
        return { tk: tk, t: t, warn: warn };
    }
    function _wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function _offscreen(w, h) {
        const host = document.createElement('div');
        host.style.cssText = 'position:fixed;left:-30000px;top:0;pointer-events:none;width:' + w + 'px;height:' + h + 'px;';
        document.body.appendChild(host);
        return host;
    }
    const SIZES = { phone: '手機', center: '中間', full: '全螢幕' };
    // opt.textOnly：拿不到圖的那條（聊天 app 的角色）只做檢查，不截圖、也不把聊天主題套到她開著的聊天 app 上
    //   （以前套上、截圖、換回，圖丟掉，她只看到畫面閃一下；同 os_aurelia_bubble.js 的 look）。
    async function look(args, opt) {
        args = args || {};
        const textOnly = !!(opt && opt.textOnly);
        const S = win.OS_STUDIO || window.OS_STUDIO;
        if (!textOnly && (!S || !S.shotNode)) return { text: '創作室還沒載好，現在截不了圖。', images: [] };
        const c = await _candidate(args);
        if (c.err) return { text: c.err, images: [] };
        const lines = [], images = [];
        if (textOnly) { /* 不截圖 */ }
        else if (c.tk === 'story') {
            const SV = _SV(), F = _thFrames();
            const size = F[args.size] ? args.size : 'phone', f = F[size];
            const want = String(args.mode || '').trim();
            const modes = want === 'all' ? MODES.slice(0, 3) : (MODES.find(function (m) { return m[0] === want || m[1] === want; }) ? [MODES.find(function (m) { return m[0] === want || m[1] === want; })] : [MODES[0], MODES[2]]);
            for (const m of modes) {
                const host = _offscreen(f.w, f.h);
                try {
                    const fr = document.createElement('iframe');
                    fr.style.cssText = 'display:block;border:0;width:' + f.w + 'px;height:' + f.h + 'px;';
                    host.appendChild(fr);
                    await new Promise(function (r) {
                        fr.onload = function () { if (m[0] === 'chapter' && SV.skinCard) { try { SV.skinCard(fr.contentDocument); } catch (e) {} } r(); };
                        fr.srcdoc = SV.doc(c.t.css || '', m[0]);
                        setTimeout(r, 2000);
                    });
                    await _wait(500);
                    images.push(await S.shotNode(fr.contentDocument.documentElement, f.w, f.h, '#111'));
                    lines.push('・' + m[1] + '畫面（' + f.lab + ' ' + f.w + '×' + f.h + '）');
                } catch (e) { lines.push('・' + m[1] + '畫面沒截下來（' + ((e && e.message) || e) + '）'); }
                finally { host.remove(); }
            }
        } else if (c.tk === 'phone') {
            const P = _PT(), host = _offscreen(720, 700);
            try {
                _phonePreview(host, c.t);
                const box = host.querySelector('.pth-preview');
                await _wait(300);
                const r = box.getBoundingClientRect();
                images.push(await S.shotNode(box, Math.ceil(r.width), Math.ceil(r.height), '#f4f4f4'));
                lines.push('・工坊那支假手機（主畫面＋一個面板），照這套的格子上色');
            } catch (e) { lines.push('・沒截下來（' + ((e && e.message) || e) + '）'); }
            finally { host.remove(); }
            if (!P) lines.push('手機主題工坊還沒載好。');
        } else {
            // 聊天 app 畫不出假的：她的聊天 app 開著才截得到——先套上、截一張、馬上換回正在用的那套
            const W = _WX(), app = win.wxApp || window.wxApp, box = app && app.APP_CONTAINER;
            const r = box && box.getBoundingClientRect ? box.getBoundingClientRect() : null;
            if (!W || !W.tryOn || !r || r.width < 50 || r.height < 50) {
                lines.push('・她的聊天 app 現在沒開著，截不到；下面只有檢查的結果。');
            } else {
                const restore = W.tryOn(c.t.css || '');
                try {
                    await _wait(400);
                    images.push(await S.shotNode(box, Math.ceil(r.width), Math.ceil(r.height), '#fff'));
                    lines.push('・她的聊天 app 現在那一頁，套上這套的樣子（截完已經換回正在用的那套）');
                } catch (e) { lines.push('・沒截下來（' + ((e && e.message) || e) + '）'); }
                finally { restore(); }
            }
        }
        return {
            text: KINDS[c.tk] + '「' + (c.t.name || '') + '」' + (lines.length ? '畫出來的樣子（這一步沒有出單子，對方看不到）：\n' + lines.join('\n') : '的檢查（這一步沒有出單子，對方看不到）：')
                + (c.warn.length ? '\n檢查抓到的（提單子時也會列給對方看）：\n- ' + c.warn.join('\n- ') : '\n檢查沒抓到問題。'),
            images: images.slice(0, 3)
        };
    }

    // ── 給模型看的清單 ─────────────────────────────────────────────────────
    const NOTE = 'aurelia_theme_ 開頭的工具是看和改對方的三種主題：' + KIND_DESC + '。list、read、spec、look 的結果都要下一輪才拿到。'
        + 'add（新做一套）、edit（改一套）、use（換上某一套）不會直接改，只會在對方的畫面上出一張單子，附改前改後的樣子，對方按同意才換；'
        + '你不會拿到結果，寫完這一輪就結束，所以提單子的那一則，先用你自己的話說想怎麼做再叫工具，不要說已經換好了。'
        + '做新的或大改之前先用 spec 看那一種的寫法，一定要照它的規矩（三種能改的東西完全不一樣）。改一套之前先用 read 看內容，看到了再在下一輪寫 edit。'
        + '提單子之前可以先用 look 看畫出來的樣子（截圖＋檢查），看了滿意再提，這一步不會出單子。'
        + '內建的主題只能看、能換上，不能改（這點跟特效不同）；要照它的感覺改，就做一套新的。單子還沒被同意之前對方要你再調整：對同一套用 edit，會接著你上一張的內容改、出一張新的，舊的那張作廢。';
    const KIND_ARG = { type: 'string', description: '哪一種：' + KIND_DESC };
    const TOOLS = [
        { name: 'aurelia_theme_list', label: '看有哪些主題', run: list,
          description: '列出對方的主題：每一種有哪幾套、哪一套正在用、哪些是內建的。',
          inputSchema: { type: 'object', properties: { kind: { type: 'string', description: '只看哪一種（story、phone、chat），不填三種都列' } } } },
        { name: 'aurelia_theme_read', label: '看主題內容', run: read,
          description: '看一套主題的內容（劇情主題與聊天 app 主題是 CSS，手機主題是一份設定值 JSON）。改之前先看。很長會分段，用 part 看下一段。',
          inputSchema: { type: 'object', properties: { kind: KIND_ARG, name: { type: 'string', description: '那一套的名字；要看對方現在這個故事自己用的那段劇情主題，一字不差填「這個故事正在用的」' },
              part: { type: 'number', description: '很長時看第幾段（從 1 開始）' } }, required: ['kind', 'name'] } },
        { name: 'aurelia_theme_spec', label: '看主題的寫法', run: spec,
          description: '看某一種主題怎麼寫：能改哪些零件、一定要守的規矩、要交什麼格式。做新的或大改之前先看。整份一次給你，寫之前看完。',
          inputSchema: { type: 'object', properties: { kind: KIND_ARG, part: { type: 'number', description: '看第幾段（從 1 開始）' } }, required: ['kind'] } },
        { name: 'aurelia_theme_look', label: '看看主題畫出來的樣子',
          description: '提單子之前先看看：把一套主題畫出來截圖給你（能看圖的才看得到），並列出檢查抓到的問題。不會出單子，對方看不到。'
            + '只填 kind 和 name＝看已經有的（或你還沒被同意的那張單子）；再加上跟 aurelia_theme_edit 一樣的參數＝看改完的樣子；新的一套就照 aurelia_theme_add 給內容。'
            + '劇情主題畫故事畫面（size 選寬度、mode 選哪個畫面）；手機主題畫一支假手機；聊天 app 主題要對方的聊天 app 開著才截得到（截完馬上換回去）。',
          inputSchema: { type: 'object', properties: { kind: KIND_ARG,
              name: { type: 'string', description: '那一套的名字（新的一套就寫要取的名字）' },
              find: { type: 'string', description: '跟 aurelia_theme_edit 一樣' },
              replace: { type: 'string', description: '跟 aurelia_theme_edit 一樣' },
              css: { type: 'string', description: 'CSS 那兩種：整份' },
              data: { type: 'string', description: '手機主題：設定值（JSON）；看改完的樣子只寫要改的，看新的一套寫整份' },
              size: { type: 'string', description: '劇情主題用：phone（手機，不填就是這個）、center（電腦上故事畫面沒開全螢幕時）、full（電腦全屏）' },
              mode: { type: 'string', description: '劇情主題用：看哪個畫面，char-mode（對話）、nar-mode（旁白）、chapter（章節卡）、end（章末）、settings（設定），all＝前三個；不填看對話和章節卡' } },
            required: ['kind'] } },
        { name: 'aurelia_theme_add', label: '新做一套主題', propose: true,
          description: '提出新做一套主題（對方看過樣子、按同意才會存）。寫之前先用 aurelia_theme_spec 看那一種的寫法（結果下一輪才會到，不要跟這個同一輪叫），交的時候 spec 填說明書最後給的那串字。',
          inputSchema: { type: 'object', properties: { kind: KIND_ARG,
              name: { type: 'string', description: '這套的名字（中文，十個字以內），不能跟已經有的重複' },
              spec: { type: 'string', description: '看完 aurelia_theme_spec（同一種 kind）之後，說明書最後給的那串字' },
              css: { type: 'string', description: '劇情主題、聊天 app 主題用：整份 CSS' },
              data: { type: 'string', description: '手機主題用：說明書要的那份 JSON（layout、vars、swatch）' },
              use: { type: 'boolean', description: 'true＝對方同意後直接換上（劇情主題是套到對方現在開著的這個故事）；不填就只存起來' } },
            required: ['kind', 'name', 'spec'] } },
        { name: 'aurelia_theme_edit', label: '改一套主題', propose: true,
          description: '提出修改已經有的一套主題（對方看過改前改後、按同意才會改；正在用的會直接換成新的樣子）。CSS 那兩種：只改一段用 find 和 replace，整份重寫用 css；手機主題：data 只寫要改的那幾格。也可以用 new_name 改名字。內建的不能改。',
          inputSchema: { type: 'object', properties: { kind: KIND_ARG,
              name: { type: 'string', description: '要改的那一套現在的名字；要改對方現在這個故事自己用的那段劇情主題，一字不差填「這個故事正在用的」' },
              find: { type: 'string', description: 'CSS 那兩種：要換掉的那一段，照 aurelia_theme_read 看到的原文一字不差抄，要只出現一次' },
              replace: { type: 'string', description: '換成什麼（跟 find 一起用；要刪掉那段就寫空字串）' },
              css: { type: 'string', description: 'CSS 那兩種：整份重寫' },
              data: { type: 'string', description: '手機主題：要改的設定值（格式照 spec），只寫要改的' },
              new_name: { type: 'string', description: '新的名字（要改名字才填）' } },
            required: ['kind', 'name'] } },
        { name: 'aurelia_theme_use', label: '換上某一套主題', propose: true,
          description: '提出換成用某一套主題（對方看過換前換後、按同意才會換）。劇情主題是套到對方現在開著的這個故事。',
          inputSchema: { type: 'object', properties: { kind: KIND_ARG, name: { type: 'string', description: '要換上的那一套的名字' } }, required: ['kind', 'name'] } },
    ];
    function _E() { return win.OS_AURELIA_EDIT || window.OS_AURELIA_EDIT || null; }
    async function run(name, args) {
        if (name === 'aurelia_change_log') { const E = _E(); if (!E) throw new Error('修改紀錄還沒載好'); return E.readLog(args); }
        // 聊天 app 的角色只拿得到字（圖只有宿舍住戶那條會轉過去，走 look）
        if (name === 'aurelia_theme_look') return (await look(args || {}, { textOnly: true })).text + '\n（這裡看不到截圖，只有檢查的結果。）';
        const t = TOOLS.find(function (x) { return x.name === name && x.run; });
        if (!t) throw new Error('沒有叫做「' + name + '」的工具');
        return String((await t.run(args || {})) || '').trim() || '什麼都沒有查到。';
    }
    const _pub = TOOLS.map(function (t) { return { name: t.name, label: t.label, description: t.description, inputSchema: t.inputSchema, propose: !!t.propose }; });

    const API = {
        note: NOTE,
        get tools() { const E = _E(); return (E && E.logTool) ? _pub.concat([E.logTool]) : _pub; },
        run: run, propose: propose, apply: apply, undo: undo,
        verb: verb, text: text, what: what, noun: noun, cards: cards, detail: detail, mountPreview: mountPreview, superseded: superseded,
        look: look,
    };
    win.OS_AURELIA_THEME = API;
    window.OS_AURELIA_THEME = API;
})();
