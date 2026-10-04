// ----------------------------------------------------------------
// [檔案] os_aurelia_bubble.js — 「改泡泡」：角色／住戶提出新做、修改、換用聊天泡泡，單子附樣子，她按同意才換
// 路徑：os_phone/os/os_aurelia_bubble.js
//
// 小機工具「會動手」的第七件。10-01 她：宿舍的丹幫她寫了聊天 app 主題，想接著讓他寫泡泡——
//   聊天 app 主題（改主題的 chat）特別不管泡泡，泡泡是另一套，這裡只當傳話，說明書、防呆、存法全部借聊天 app 泡泡那套：
//   ・每間聊天室各一份設定（WX_BUBBLE_SETTINGS.getConfig(聯絡人 id)，mode default／general 微調／ai／custom 手寫）。
//     小機寫的一律走 ai 那條（底稿＋提權，跟「交給 AI」同一種東西），存在那間的 aiCSS。
//   ・泡泡主題庫（WX_BUBBLE_AI.galLoad，全域）：收著做好的幾套。新做＝收進庫，可以順便換到哪幾間；
//     修改＝改庫裡那一套，正在用它的聊天室（aiCSS 一字不差）一起換；換上＝把庫裡一套放到哪幾間，或還原成預設。
//   ・聊天室範圍：這個故事主角手機的通訊錄（WX_CONTACTS.getAllCustomContacts，人＋群組）；「全部」＝每一間；聊天 app 裡可以寫「這間」。
//   ・存的時候只存不貼（WX_BUBBLE_SETTINGS.store）：貼泡泡的 <style> 整支 app 只有一個，貼了別間的會蓋掉她正開著那間；
//     存完如果改到的有她正開著那間，才照那間重貼一次。
//   ・單子上：亮背景／暗背景的假聊天畫面（跟設置面板的預覽同一組 class），加一顆「先套上看看」直接蓋在聊天 app 上，關掉單子換回原本的。
//   ・還沒被同意之前再改＝接著上一張（草稿），舊的那張作廢（同改主題）。
//   ・改回去：新做的從庫裡拿掉、改的換回改前、換過的聊天室換回原本；之後又被改過就不動。
// 暴露：window.OS_AURELIA_BUBBLE = { note, tools, run, propose, apply, undo, verb, text, what, noun, cards, detail, mountPreview, superseded, look }
//   單子 prop.mod === 'bubble'，OS_AURELIA_EDIT 看到就轉過來。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const PART = 12000;   // 看樣式一頁幾個字（10-01 她：跑團世界觀都三萬起步，3000 莫名。3000 是 09-19 只有上網搜尋時定的，奧瑞亞工具沿用沒重想過；聊天 app 那邊奧瑞亞的結果放寬到 16000）
    const CSS_MAX = 60 * 1024;
    const PV_W = 390;           // 假聊天畫面照手機寬畫

    function _B() { return win.WX_BUBBLE_SETTINGS || window.WX_BUBBLE_SETTINGS || null; }
    function _AI() { return win.WX_BUBBLE_AI || window.WX_BUBBLE_AI || null; }
    function _no(t) { return { ok: false, text: t }; }
    function _one(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
    function _cut(s, n) { s = _one(s); return s.length > n ? s.slice(0, n) + '…' : s; }
    function _fold(s) {
        const T = win.OS_AURELIA_TOOLS || window.OS_AURELIA_TOOLS;
        return (T && T.fold) ? T.fold(_one(s)) : _one(s).toLowerCase();
    }
    function _newId() { return 'pb' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
    function _ready() { const B = _B(), AI = _AI(); return !!(B && B.getConfig && B.store && B.preview && AI && AI.galLoad); }
    const NOT_READY = '聊天 app 的泡泡設定還沒載好。';

    // ── 聊天室 ───────────────────────────────────────────────────────────
    function _allRooms() {
        const W = win.WX_CONTACTS || window.WX_CONTACTS;
        let all = [];
        try { all = (W && W.getAllCustomContacts && W.getAllCustomContacts()) || []; } catch (e) {}
        return all.filter(function (c) { return c && c.id; }).map(function (c) {
            return { id: c.id, name: _one(c.name || c.realName || c.id), real: _one(c.realName || ''), group: !!c.isGroup };
        });
    }
    function _rl(r) { return r.name + (r.group ? '（群聊）' : ''); }
    function _roomNames(rs, max) {
        max = max || 4;
        const a = (rs || []).map(function (r) { return r.name; });
        return a.length > max ? a.slice(0, max).join('、') + ' 等 ' + a.length + ' 間' : a.join('、');
    }
    // 「小安、工作群」「全部」「這間」→ [{ id, name, group }]
    function _rooms(arg, ctx) {
        const all = _allRooms();
        let parts = Array.isArray(arg) ? arg : String(arg == null ? '' : arg).split(/[、,，\/\n;；]+/);
        parts = parts.map(_one).filter(Boolean);
        if (!parts.length) return { list: [] };
        if (parts.length === 1 && /^(全部|所有|每一間|全部的聊天室|所有聊天室|all)$/i.test(parts[0])) {
            return all.length ? { list: all } : { err: '主角手機的通訊錄是空的，沒有聊天室可以換。' };
        }
        const out = [], miss = [];
        parts.forEach(function (p) {
            if (/^(這間|这间|這一間|这一间|this)$/i.test(p)) {
                const c = ctx && ctx.chat;
                if (c && c.id) out.push({ id: c.id, name: _one(c.name || c.id), group: !!c.isGroup });
                else miss.push(p + '（「這間」只有在聊天 app 的聊天室裡叫才認得）');
                return;
            }
            const f = _fold(p.replace(/[（(]群聊[)）]/g, ''));
            let hit = all.filter(function (r) { return _fold(r.name) === f || (r.real && _fold(r.real) === f); });
            if (!hit.length) hit = all.filter(function (r) { return _fold(r.name).indexOf(f) !== -1; });
            if (hit.length === 1) out.push(hit[0]);
            else miss.push(p + (hit.length > 1 ? '（有好幾間像：' + hit.slice(0, 4).map(_rl).join('、') + '）' : ''));
        });
        if (miss.length) {
            return { err: '找不到這幾間聊天室：' + miss.join('、') + '。' + (all.length ? '有這些：' + all.slice(0, 30).map(_rl).join('、') : '通訊錄是空的。') };
        }
        const seen = {};
        return { list: out.filter(function (r) { if (seen[r.id]) return false; seen[r.id] = 1; return true; }) };
    }
    // 某一間現在的泡泡：{ mode, ai（存著的 aiCSS）, css（看得到的樣子）, label, raw（手寫的，不走泡泡那套零件）}
    function _now(id) {
        const B = _B(), AI = _AI();
        const c = B.getConfig(id) || {};
        const ai = String(c.aiCSS || '');
        if (c.mode === 'ai' && ai.trim()) {
            const g = AI.galLoad().find(function (t) { return t.css === ai; });
            return { mode: 'ai', ai: ai, css: ai, label: g ? '主題庫的「' + g.name + '」' : '一套沒收進主題庫的（交給 AI 做的）' };
        }
        if (c.mode === 'general') return { mode: 'general', ai: ai, css: AI.fromGeneral ? AI.fromGeneral(c) : '', label: '自己調的顏色' };
        if (c.mode === 'custom') return { mode: 'custom', ai: ai, css: String(c.customCSS || ''), label: '手寫的 CSS', raw: true };
        return { mode: c.mode || 'default', ai: ai, css: '', label: '預設的樣子' };
    }
    // 單子上記每一間原本的樣子（改回去用）；aiCSS 常常好幾間同一份，收進 pool 只存一次
    function _snap(prop, r) {
        const n = _now(r.id);
        prop.pool = prop.pool || [];
        let i = prop.pool.indexOf(n.ai);
        if (i < 0) { prop.pool.push(n.ai); i = prop.pool.length - 1; }
        return { id: r.id, name: r.name, group: !!r.group, mode: n.mode, ai: i, was: n.label };
    }
    function _isSnap(prop, s) {
        const c = _B().getConfig(s.id) || {};
        return (c.mode || 'default') === s.mode && String(c.aiCSS || '') === (prop.pool || [])[s.ai];
    }
    function _isSet(id, css, reset) {
        const c = _B().getConfig(id) || {};
        return reset ? (c.mode || 'default') === 'default' : (c.mode === 'ai' && String(c.aiCSS || '') === css);
    }
    function _store(id, patch) {
        const B = _B();
        if (!B.store(id, Object.assign({}, B.getConfig(id) || {}, patch))) throw new Error('存不進去：瀏覽器給這個網站的空間滿了');
    }
    // 改到的有她正開著那一間：照那間重貼一次（其他間下次打開自己會貼）
    function _refreshActive(ids) {
        try {
            const app = win.wxApp || window.wxApp, act = app && app.GLOBAL_ACTIVE_ID;
            if (act && (!ids || ids.indexOf(act) !== -1)) _B().applyStyle(act);
        } catch (e) {}
    }

    // ── 主題庫 ───────────────────────────────────────────────────────────
    function _gal() { return _AI().galLoad() || []; }
    function _findGal(name) {
        const k = _fold(name);
        if (!k) return { err: '要寫是哪一套（名字）。' };
        const all = _gal();
        const hit = all.filter(function (t) { return _fold(t.name) === k || t.id === _one(name); });
        if (hit.length === 1) return { t: hit[0] };
        if (hit.length > 1) return { err: '主題庫裡有好幾套都叫「' + _one(name) + '」，請對方先改掉重複的名字。' };
        const near = all.filter(function (t) { return _fold(t.name).indexOf(k) !== -1; }).slice(0, 5);
        return { err: '泡泡主題庫裡沒有叫「' + _one(name) + '」的。' + (near.length ? '像的有：' + near.map(function (t) { return t.name; }).join('、') : '先用 aurelia_bubble_list 看有哪些。') };
    }
    function _usedBy(css) {
        return _allRooms().filter(function (r) { const c = _B().getConfig(r.id) || {}; return c.mode === 'ai' && String(c.aiCSS || '') === css; });
    }

    // ── 檢查（借設置面板「交給 AI」那一套）──────────────────────────────────
    function _check(raw) {
        const AI = _AI();
        let css = String(raw == null ? '' : raw).trim();
        if (/```/.test(css) && AI.pickCss) css = AI.pickCss(css).css || css;
        if (!css) return { err: '樣式是空的。' };
        if (!/\{[\s\S]*\}/.test(css)) return { err: '這不像一份 CSS。' };
        if (css.length > CSS_MAX) return { err: '樣式太長了（最多 60KB）。' };
        if (!/\.pbub-/.test(css)) return { err: '裡面沒有一條寫到泡泡的零件（.pbub- 開頭那些），套上去什麼都不會變；零件名字照 aurelia_bubble_spec 那張表。' };
        const warn = [];
        const lk = AI.stripLayout ? AI.stripLayout(css) : { css: css, hit: 0 };
        if (lk.hit) warn.push('有 ' + lk.hit + ' 處寫到訊息列的排法（display、flex-direction 這些），已經拿掉了（留著會把兩邊的訊息推到同一側）');
        const od = _dropOutside(lk.css);
        css = od.css;
        if (od.dropped.length) warn.push('有 ' + od.dropped.length + ' 條不是寫在泡泡零件上（' + od.dropped.slice(0, 3).join('、') + '），已經拿掉了（泡泡的樣式整支聊天 app 共用，留著會改到泡泡以外的地方）');
        if (!/\.pbub-/.test(css)) return { err: '拿掉不是寫在泡泡零件上的之後，一條都不剩；零件名字照 aurelia_bubble_spec 那張表。' };
        try { (AI.risky ? AI.risky(css) : []).forEach(function (m) { warn.push(m); }); } catch (e) {}
        return { css: css, warn: warn };
    }
    // 泡泡的 <style> 整支 app 只有一個：最外層不是寫在泡泡零件上的規則（body、.wx-header 那種）剝掉。
    //   只看最外層；@media、@keyframes、@font-face、@import 整塊留著。先拿掉註解（註解裡的大括號會把層數算亂）。
    //   🚫 不用 (?<=…) 往回看：舊一點的 iOS Safari 不認得，整支檔會載不起來。
    function _dropOutside(css) {
        const src = String(css || '').replace(/\/\*[\s\S]*?\*\//g, '');
        const keep = [], dropped = [];
        let depth = 0, start = 0, open = -1;
        for (let i = 0; i < src.length; i++) {
            const ch = src[i];
            if (ch === '{') { if (depth === 0) open = i; depth++; }
            else if (ch === '}') {
                depth--;
                if (depth === 0) {
                    const sel = _one(src.slice(start, open));
                    const ok = !sel || sel.charAt(0) === '@' || /\.pbub-/.test(sel) || /^:root$/i.test(sel);
                    if (ok) keep.push(src.slice(start, i + 1)); else dropped.push(_cut(sel, 30));
                    start = i + 1;
                }
                if (depth < 0) depth = 0;
            } else if (ch === ';' && depth === 0) { keep.push(src.slice(start, i + 1)); start = i + 1; }   // @import …;
        }
        if (start < src.length) keep.push(src.slice(start));
        return { css: dropped.length ? keep.join('').replace(/\n{3,}/g, '\n\n').trim() : String(css || ''), dropped: dropped };
    }

    // ── 看的 ─────────────────────────────────────────────────────────────
    function list() {
        if (!_ready()) return NOT_READY;
        const gal = _gal(), rooms = _allRooms();
        const lines = gal.map(function (t) {
            const used = _usedBy(t.css);
            return '・' + t.name + '｜' + (used.length ? '用在：' + _roomNames(used, 6) : '沒有聊天室在用');
        });
        const o = _drafts();
        Object.keys(o).forEach(function (k) { if (o[k].kind === 'add' && !o[k].alias) lines.push('・' + o[k].after.name + '｜草稿：單子還沒被同意，還沒收進庫裡'); });
        const rl = rooms.slice(0, 40).map(function (r) { return '・' + _rl(r) + '：' + _now(r.id).label; });
        return '【泡泡主題庫】（收著做好的幾套，哪一間要用就換上）' + (lines.length ? '\n' + lines.join('\n') : '\n（空的）')
            + '\n\n【每間聊天室現在的泡泡】（這個故事主角手機裡的聊天室，每間各自設定）'
            + (rl.length ? '\n' + rl.join('\n') + (rooms.length > 40 ? '\n（還有 ' + (rooms.length - 40) + ' 間沒列）' : '') : '\n（通訊錄是空的）');
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
    function read(args, ctx) {
        if (!_ready()) return NOT_READY;
        if (args.name) {
            const d = _draftFor(args.name);
            if (d) return _paged('這是你上一張單子的內容，對方還沒按同意；要再改就對它用 aurelia_bubble_edit。\n泡泡主題「' + d.after.name + '」\n' + d.after.css, args.part, '這套的內容');
            const f = _findGal(args.name);
            if (f.err) return f.err;
            const used = _usedBy(f.t.css);
            return _paged('泡泡主題「' + f.t.name + '」' + (used.length ? '（用在：' + _roomNames(used, 6) + '）' : '') + '\n' + f.t.css, args.part, '這套的內容');
        }
        if (args.room) {
            const r = _rooms(args.room, ctx);
            if (r.err) return r.err;
            if (r.list.length !== 1) return 'room 一次只看一間。';
            const n = _now(r.list[0].id), who = _rl(r.list[0]);
            if (!n.css) return '「' + who + '」現在是' + n.label + '，沒有自己的樣式。';
            if (n.raw) return _paged('「' + who + '」現在是對方手寫的 CSS（不走泡泡那套零件，只給看；要換就做一套新的換上去）\n' + n.css, args.part, '這間的樣式');
            if (n.mode === 'general') return _paged('「' + who + '」現在是對方用顏色格子調的，換成 CSS 寫法給你看：\n' + n.css, args.part, '這間的樣式');
            return _paged('「' + who + '」現在是' + n.label + '\n' + n.css, args.part, '這間的樣式');
        }
        return 'name（主題庫那一套的名字）和 room（聊天室）要填一個。';
    }
    // 看過說明書的憑證（10-01，跟改主題那組同一套）：聊天 app 一輪最多叫三個工具、一起跑完才交回結果，
    //   AI 可以同一輪叫 spec 又叫 add——交出去那份是沒看過說明書、憑印象寫的。說明書最後給一串字，add 要帶著它；
    //   同一輪叫的拿不到，一定交不出去。每次看都發一串新的（記在這台、留一天）。
    const SPEC_CODE_KEY = 'aurelia_bubble_spec_codes', SPEC_CODE_TTL = 86400000;
    function _specCodes() {
        let o = {};
        try { o = JSON.parse(localStorage.getItem(SPEC_CODE_KEY) || '{}') || {}; } catch (e) {}
        const old = Date.now() - SPEC_CODE_TTL;
        Object.keys(o).forEach(function (k) { if (!o[k] || o[k].at < old) delete o[k]; });
        return o;
    }
    function _specIssue() {
        const o = _specCodes();
        const code = Math.random().toString(36).slice(2, 6);
        o[code] = { at: Date.now() };
        Object.keys(o).sort(function (a, b) { return o[b].at - o[a].at; }).slice(30).forEach(function (k) { delete o[k]; });
        try { localStorage.setItem(SPEC_CODE_KEY, JSON.stringify(o)); } catch (e) {}
        return code;
    }
    function _specCheck(code) {
        if (_specCodes()[String(code == null ? '' : code).trim().toLowerCase()]) return null;
        return _no((code ? 'spec 填的那串字對不上泡泡的說明書' : '還沒看過泡泡的說明書就交了')
            + '：先只叫 aurelia_bubble_spec 看完整份說明書——結果下一輪才會交給你，不要跟交泡泡同一輪叫；'
            + '下一輪照說明書寫，交的時候 spec 參數填說明書最後給的那串字。');
    }
    function spec(args) {
        const AI = _AI();
        const src = String((AI && AI.PROMPT) || '');
        if (!src) return '泡泡的說明書還沒載好。';
        // 原本那份是給「一次生成一整套、回一段 CSS」的模型的：輸出格式那段換成工具怎麼交
        const head = src.split('【輸出格式】')[0].trim();
        const tail = '\n\n【交的格式】\n'
            + '動手前先想清楚：這次的泡泡是那個世界裡的什麼東西、兩側各是什麼角色、尖角留不留、頭像框是什麼材質的框。講不出「它是什麼」，畫出來就會是兩個圓角矩形換顏色。\n'
            + '交的時候用 aurelia_bubble_add（或 aurelia_bubble_edit）的 css 參數，只交 CSS 本身，不用 ``` 包起來。\n'
            + '交之前自檢一次：兩側都設計了嗎？遮住字只看泡泡，認得出主題嗎（玻璃那一類就看疊層做了沒）？字底下是實底，還是半透明加了模糊？'
            + '.pbub-row 上有沒有不小心寫到 display / flex-direction / justify-content？底色改成漸層了但尖角還是純色嗎？有問題就修好再交。';
        const pre = '下面是對方的聊天 app 給模型的泡泡說明書。想跟對方的聊天 app 主題搭，可以先用 aurelia_theme_read（kind: chat）看那套的配色（沒有這個工具就跳過）。\n\n';
    // 號碼開頭也放一份：聊天 app 下一輪就把說明書收成開頭 200 字，只放結尾的話，中間先叫 look 再交時號碼已經看不到、只好再看一次說明書（10-01 公益站 gemini-3.1-pro 實測）
        const code = _specIssue();
        return _paged('（看完照著寫，用 aurelia_bubble_add 交的時候 spec 參數填：' + code + '）\n' + pre + head + tail + '\n\n——說明書到這裡。照它寫好之後用 aurelia_bubble_add 交，spec 參數填：' + code, args.part, '泡泡的寫法', SPEC_PART);
    }

    // ── 草稿：還沒被同意的那張（同改主題）──────────────────────────────────
    const DRAFT_KEY = 'aurelia_bubble_drafts', DRAFT_DAYS = 14;
    function _drafts() {
        let o = {};
        try { o = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}') || {}; } catch (e) {}
        const old = Date.now() - DRAFT_DAYS * 86400000;
        Object.keys(o).forEach(function (k) { if (!o[k] || o[k].at < old) delete o[k]; });
        return o;
    }
    function _draftsSave(o) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(o)); } catch (e) {} }
    function _draftFor(name) { return _drafts()[_fold(name)] || null; }
    function _draftPut(prop, oldName) {
        const o = _drafts();
        const rec = { id: prop.id, kind: prop.kind, tid: prop.tid || null, before: prop.before, after: prop.after, rooms: prop.rooms || [], pool: prop.pool || [], at: Date.now() };
        o[_fold(prop.title)] = rec;
        if (oldName && _fold(oldName) !== _fold(prop.title)) o[_fold(oldName)] = Object.assign({ alias: true }, rec);
        _draftsSave(o);
    }
    function _draftDrop(prop) {
        const o = _drafts();
        Object.keys(o).forEach(function (k) { if (o[k].id === prop.id) delete o[k]; });
        _draftsSave(o);
    }
    function superseded(prop) {
        if (!prop || prop.kind === 'use' || (prop.state !== 'wait' && prop.state !== 'no')) return false;
        const d = _drafts()[_fold(prop.title)];
        return !!(d && d.id !== prop.id);
    }

    // ── 提出（做成單子）──────────────────────────────────────────────────
    const RESET_RE = /^(預設|预设|默認|默认|原本的|default|還原|还原)$/i;
    const RESERVED = /^(預設|预设|默認|默认|原本的|default|還原|还原|全部|所有|每一間|all|這間|这间)$/i;
    function _prop(kind, title, extra) {
        return Object.assign({ id: _newId(), mod: 'bubble', kind: kind, book: '聊天泡泡', title: title, state: 'wait', at: Date.now() }, extra);
    }
    function _proposeAdd(args, ctx) {
        const sc = _specCheck(args.spec);
        if (sc) return sc;
        const name = _one(args.name).slice(0, 30);
        if (!name) return _no('要取一個名字（name）。');
        if (RESERVED.test(name)) return _no('「' + name + '」是拿來指「還原成預設」或「每一間」的字，換一個名字。');
        if (_gal().some(function (t) { return _fold(t.name) === _fold(name); })) return _no('主題庫裡已經有一套叫「' + name + '」了，要改它用 aurelia_bubble_edit，要做新的換一個名字。');
        const c = _check(args.css);
        if (c.err) return _no(c.err);
        const rr = _rooms(args.rooms, ctx);
        if (rr.err) return _no(rr.err);
        const prop = _prop('add', name, { before: null, after: { name: name, css: c.css }, warn: c.warn });
        prop.rooms = rr.list.map(function (r) { return _snap(prop, r); });
        _draftPut(prop);
        return { ok: true, prop: prop };
    }
    function _proposeEdit(args, ctx) {
        const d = _draftFor(args.name);
        let kind, tid, before, base, prop;
        if (d) { kind = d.kind; tid = d.tid; before = d.before; base = d.after; }
        else {
            const f = _findGal(args.name);
            if (f.err) return _no(f.err);
            kind = 'edit'; tid = f.t.id;
            before = { name: f.t.name, css: f.t.css || '' };
            base = { name: before.name, css: before.css };
        }
        const after = { name: base.name, css: base.css };
        if (args.new_name != null && _one(args.new_name)) {
            after.name = _one(args.new_name).slice(0, 30);
            if (RESERVED.test(after.name)) return _no('「' + after.name + '」是拿來指「還原成預設」或「每一間」的字，換一個名字。');
            if (after.name !== base.name && _gal().some(function (t) { return t.id !== tid && _fold(t.name) === _fold(after.name); })) return _no('主題庫裡已經有一套叫「' + after.name + '」了，換一個名字。');
        }
        let css = after.css, warn = [];
        if (args.find != null && args.find !== '') {
            if (args.css != null) return _no('find 和整份重寫（css）不能一起用。');
            const n = css.split(String(args.find)).length - 1;
            if (n === 0) return _no('「' + _cut(args.find, 60) + '」在樣式裡找不到，要照 aurelia_bubble_read 看到的原文一字不差抄。');
            if (n > 1) return _no('「' + _cut(args.find, 60) + '」在樣式裡出現了 ' + n + ' 次，多抄前後幾個字，讓它只出現一次。');
            css = css.replace(String(args.find), function () { return String(args.replace == null ? '' : args.replace); });
        }
        if (args.css != null) css = String(args.css);
        if (css !== after.css) {
            const c = _check(css);
            if (c.err) return _no(c.err);
            after.css = c.css; warn = c.warn;
        }
        if (after.name === base.name && after.css === base.css) return _no('跟現在一模一樣，沒有要改的地方。');
        if (before && after.name === before.name && after.css === before.css) return _no('改完跟庫裡存著的那套一模一樣，不用再提單子。');
        prop = _prop(kind, kind === 'add' ? after.name : before.name, { tid: tid, before: before, after: after, warn: warn });
        if (d && kind === 'add') {
            // 新做的草稿：接著上一張要換到的那幾間（原本的樣子照上一張記的）
            prop.pool = (d.pool || []).slice();
            prop.rooms = (d.rooms || []).slice();
        } else {
            // 修改庫裡那一套：正在用它的聊天室一起換
            prop.rooms = _usedBy(before.css).map(function (r) { return _snap(prop, r); });
        }
        _draftPut(prop, d ? base.name : null);   // 新做的草稿改了名字：舊名字那格也指到這張，舊單子才會作廢
        return { ok: true, prop: prop };
    }
    function _proposeUse(args, ctx) {
        const reset = RESET_RE.test(_one(args.name));
        let t = null;
        if (!reset) {
            const f = _findGal(args.name);
            if (f.err) {
                const d = _draftFor(args.name);
                if (d && d.kind === 'add') return _no('「' + d.after.name + '」還在單子上等對方同意，還沒收進主題庫，不能用 use 換；要換到哪幾間，用 aurelia_bubble_edit 改那張單子的樣式，或重新提 add 時寫在 rooms。');
                return _no(f.err);
            }
            t = f.t;
        }
        const rr = _rooms(args.rooms, ctx);
        if (rr.err) return _no(rr.err);
        if (!rr.list.length) return _no('rooms 要寫換到哪幾間聊天室。');
        const todo = rr.list.filter(function (r) { return !_isSet(r.id, t ? t.css : '', reset); });
        if (!todo.length) return _no(reset ? '這幾間本來就是預設的樣子。' : '這幾間本來就是「' + t.name + '」了。');
        const prop = _prop('use', reset ? '預設' : t.name, { tid: t ? t.id : '', reset: reset, before: null, after: { name: reset ? '預設的樣子' : t.name, css: t ? t.css : '' } });
        prop.rooms = todo.map(function (r) { return _snap(prop, r); });
        return { ok: true, prop: prop };
    }
    async function propose(name, args, ctx) {
        if (!_ready()) return _no(NOT_READY);
        args = args || {};
        if (name === 'aurelia_bubble_add') return _proposeAdd(args, ctx);
        if (name === 'aurelia_bubble_edit') return _proposeEdit(args, ctx);
        if (name === 'aurelia_bubble_use') return _proposeUse(args, ctx);
        return _no('沒有叫做「' + name + '」的工具');
    }

    // ── 她按同意／改回去 ─────────────────────────────────────────────────
    function _stale(prop, why) { prop.state = 'stale'; prop.why = why; return { ok: false, text: why }; }
    async function apply(prop) {
        if (!prop || (prop.state !== 'wait' && prop.state !== 'no')) return { ok: false, text: '這張已經處理過了' };
        if (superseded(prop)) return { ok: false, text: '這張已經有新的一版了，看最新那張' };
        if (!_ready()) return { ok: false, text: NOT_READY };
        const AI = _AI(), a = prop.after, b = prop.before, rooms = prop.rooms || [];
        const touched = [];
        try {
            if (prop.kind === 'add' || prop.kind === 'use') {
                if (rooms.some(function (s) { return !_isSnap(prop, s); })) return _stale(prop, '有聊天室的泡泡在提出之後被改過了，這張作廢，沒有蓋掉');
            }
            if (prop.kind === 'add') {
                if (_gal().some(function (t) { return _fold(t.name) === _fold(a.name); })) return _stale(prop, '在那之後主題庫已經有同名的一套了，沒有再存');
                const arr = AI.galAdd(a.name, a.css);
                if (!arr) return { ok: false, text: '存不進去：瀏覽器給這個網站的空間滿了' };
                prop.tid = arr[0].id;
            } else if (prop.kind === 'edit') {
                const arr = _gal(), t = arr.find(function (x) { return x.id === prop.tid; });
                if (!t || t.css !== b.css || t.name !== b.name) return _stale(prop, '這一套在提出之後被改過了，這張作廢，沒有蓋掉');
                t.css = a.css; t.name = a.name;
                if (!AI.galSave(arr)) return { ok: false, text: '存不進去：瀏覽器給這個網站的空間滿了' };
            }
            rooms.forEach(function (s) {
                if (prop.kind === 'edit' && !_isSet(s.id, b.css)) return;   // 提出之後換成別套的那間不動
                _store(s.id, prop.reset ? { mode: 'default' } : { mode: 'ai', aiCSS: a.css });
                touched.push(s.id);
            });
        } catch (e) { return { ok: false, text: '換不上：' + ((e && e.message) || '不知道為什麼') }; }
        prop.touched = touched;
        _refreshActive(touched);
        prop.state = 'done'; prop.doneAt = Date.now();
        if (prop.kind !== 'use') _draftDrop(prop);
        return { ok: true };
    }
    async function undo(prop) {
        if (!prop || prop.state !== 'done') return { ok: false, text: '這張沒有寫進去過' };
        if (!_ready()) return { ok: false, text: NOT_READY };
        const AI = _AI(), a = prop.after, b = prop.before;
        const LATER = '在那之後又被改過了，改不回去（怕蓋掉後來的修改）';
        const back = (prop.rooms || []).filter(function (s) { return (prop.touched || []).indexOf(s.id) !== -1 && _isSet(s.id, a.css, prop.reset); });
        try {
            if (prop.kind === 'add') {
                const arr = _gal(), t = arr.find(function (x) { return x.id === prop.tid; });
                if (t && t.css !== a.css) return { ok: false, text: LATER };
                AI.galSave(arr.filter(function (x) { return x.id !== prop.tid; }));
            } else if (prop.kind === 'edit') {
                const arr = _gal(), t = arr.find(function (x) { return x.id === prop.tid; });
                if (!t || t.css !== a.css) return { ok: false, text: LATER };
                t.css = b.css; t.name = b.name;
                AI.galSave(arr);
            } else if (!back.length) return { ok: false, text: LATER };
            back.forEach(function (s) {
                if (prop.kind === 'edit') _store(s.id, { mode: 'ai', aiCSS: b.css });
                else _store(s.id, { mode: s.mode, aiCSS: (prop.pool || [])[s.ai] || '' });
            });
        } catch (e) { return { ok: false, text: '改不回去：' + ((e && e.message) || '不知道為什麼') }; }
        _refreshActive(back.map(function (s) { return s.id; }));
        prop.state = 'undone'; prop.undoneAt = Date.now();
        return { ok: true };
    }

    // ── 那一行怎麼寫、單子小窗畫什麼 ─────────────────────────────────────
    function verb(prop) { return prop.kind === 'add' ? '新做' : (prop.kind === 'edit' ? '修改' : (prop.reset ? '還原' : '換上')); }
    function _whatLine(prop) {
        const rn = _roomNames(prop.rooms, 3);
        if (prop.kind === 'use') return prop.reset ? '「' + rn + '」的泡泡' : '泡泡主題「' + prop.after.name + '」（在' + rn + '）';
        return '泡泡主題「' + ((prop.after && prop.after.name) || prop.title) + '」' + (prop.kind === 'add' && rn ? '（換到' + rn + '）' : '');
    }
    function text(prop, forModel) {
        if (!prop) return '';
        const who = prop.by || '對方', v = verb(prop), what = _whatLine(prop);
        if (forModel) {
            if (prop.state === 'done') return who + ' ' + v + '了' + what + '，對方同意了，已經換上';
            if (prop.state === 'no') return who + ' 提出要' + v + what + '，對方沒有同意，沒有改';
            if (prop.state === 'undone') return who + ' ' + v + '了' + what + '，後來對方改回去了';
            if (prop.state === 'stale') return who + ' 提出要' + v + what + '，但後來被改過，沒有換上';
            return who + ' 提出要' + v + what + '，還在等對方決定';
        }
        if (prop.state === 'done' || prop.state === 'undone') return who + ' ' + v + '了' + what;
        return who + ' 想' + v + what;
    }
    function what(prop) { return prop && prop.kind === 'use' && prop.reset ? '聊天泡泡' : '泡泡主題'; }
    function noun() { return '聊天泡泡'; }
    function _roomLines(prop) {
        return (prop.rooms || []).map(function (s) { return _rl(s) + '：' + (s.was || '原本的樣子') + ' → ' + (prop.reset ? '預設的樣子' : '「' + prop.after.name + '」'); }).join('\n');
    }
    function cards(prop) {
        const a = prop.after || {}, b = prop.before, out = [];
        if (prop.kind === 'edit') {
            out.push({ lab: '改前的樣子', preview: 'before' });
            out.push({ lab: '改後的樣子', preview: 'after' });
        } else {
            out.push({ lab: prop.kind === 'add' ? '新的樣子' : '換上之後', preview: 'after' });
        }
        out.push({ lab: '套在聊天 app 上看', preview: 'try' });
        if ((prop.warn || []).length) out.push({ lab: '要注意', txt: prop.warn.join('\n') });
        if (prop.kind === 'edit' && b && b.name !== a.name) out.push({ lab: '名字', from: b.name, to: a.name });
        if (prop.kind === 'add') out.push({ lab: '同意之後', val: '收進泡泡主題庫' + ((prop.rooms || []).length ? '，並換到這幾間：' + _roomNames(prop.rooms, 8) : '（先不換到任何一間）') });
        if (prop.kind === 'use') out.push({ lab: '換的聊天室', txt: _roomLines(prop) });
        if (prop.kind === 'edit') out.push({ lab: '正在用這套的聊天室', val: (prop.rooms || []).length ? _roomNames(prop.rooms, 8) + '，會一起換成新的樣子' : '沒有，只改主題庫裡那一套' });
        if (prop.kind === 'edit' && b && b.css !== a.css) out.push({ lab: '樣式', diff: [b.css, a.css] });
        else if (prop.kind === 'add') out.push({ lab: '樣式', txt: a.css });
        return out;
    }
    function detail(prop) {
        const out = [];
        if (prop.kind === 'use') out.push(_roomLines(prop).split('\n').join('；'));
        else if (prop.kind === 'edit' && prop.before && prop.before.name !== prop.after.name) out.push('名字：「' + prop.before.name + '」改成「' + prop.after.name + '」');
        if (prop.kind === 'add' && (prop.rooms || []).length) out.push('同意時換到了：' + _roomNames(prop.rooms, 8));
        if (prop.kind === 'edit' && (prop.touched || []).length) out.push('一起換了 ' + prop.touched.length + ' 間在用這套的聊天室');
        if ((prop.warn || []).length) out.push('提出時提醒過：' + prop.warn.join('；'));
        return out;
    }

    // ── 預覽：假的聊天畫面（跟設置面板同一組 class），亮背景／暗背景 ─────────────
    //   尺寸照真的聊天室（手機寬、40px 頭像、15px 字）；泡泡預設樣子複刻 app 的，特異性壓低，底稿與提權後的主題都蓋得過。
    const PV_BASE = '*{box-sizing:border-box}html,body{margin:0}'
        + 'body{width:' + PV_W + 'px;padding:16px 0 4px;font-family:-apple-system,"PingFang TC","Microsoft JhengHei","Noto Sans TC",sans-serif;overflow:hidden}'
        + '.pbub-row{display:flex;align-items:flex-start;margin:0 12px 16px}.pbub-row.pbub-me{flex-direction:row-reverse}'
        + '.pbub-avatar{width:40px;height:40px;border-radius:6px;flex-shrink:0;background:#c4c4c4}.pbub-me .pbub-avatar{background:#a5e6aa}'
        + '.pbub-wrap{max-width:70%;min-width:0;margin:0 10px}'
        + '.pbub-bubble{max-width:100%;padding:10px 14px;border-radius:6px;position:relative;font-size:15px;line-height:1.5;color:#000;background:#fff;word-break:break-word}'
        + '.pbub-me .pbub-bubble{background:#95ec69}';
    const PV_BG = {
        light: 'body{background:#ededed;background-image:linear-gradient(45deg,rgba(0,0,0,.04) 25%,transparent 25%,transparent 75%,rgba(0,0,0,.04) 75%),linear-gradient(45deg,rgba(0,0,0,.04) 25%,transparent 25%,transparent 75%,rgba(0,0,0,.04) 75%);background-size:16px 16px;background-position:0 0,8px 8px}',
        dark: 'body{background:#1d222c;background-image:linear-gradient(45deg,rgba(255,255,255,.05) 25%,transparent 25%,transparent 75%,rgba(255,255,255,.05) 75%),linear-gradient(45deg,rgba(255,255,255,.05) 25%,transparent 25%,transparent 75%,rgba(255,255,255,.05) 75%);background-size:16px 16px;background-position:0 0,8px 8px}',
    };
    const PV_ROWS = [['other', '今晚要不要出來？'], ['me', '好啊，老地方。我可能會晚十分鐘，路上有點塞。'], ['other', '沒關係，我先幫你點一杯，還是老樣子？'], ['me', '對，謝啦']];
    function _doc(css, bg) {
        const AI = _AI();
        return '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' + PV_BASE + PV_BG[bg === 'dark' ? 'dark' : 'light']
            + '\n' + ((AI && AI.BASE_CSS) || '') + '\n' + ((AI && AI.boost) ? AI.boost(css || '') : (css || '')) + '</style></head><body>'
            + PV_ROWS.map(function (m) { return '<div class="pbub-row pbub-' + m[0] + '"><div class="pbub-avatar"></div><div class="pbub-wrap"><div class="pbub-bubble">' + m[1] + '</div></div></div>'; }).join('')
            + '</body></html>';
    }
    let _bg = 'light';
    const _live = [];
    function _pv(el, css) {
        const tabs = document.createElement('div');
        tabs.className = 'vn-pv-tabs';
        tabs.innerHTML = '<button type="button" class="vn-pv-tab" data-bg="light">亮的聊天背景</button><button type="button" class="vn-pv-tab" data-bg="dark">暗的聊天背景</button>';
        const wrap = document.createElement('div');
        wrap.className = 'th-pv-wrap';
        const box = document.createElement('div');
        box.className = 'th-pv-box';
        const fr = document.createElement('iframe');
        fr.className = 'th-pv-frame';
        fr.setAttribute('sandbox', 'allow-same-origin');
        box.appendChild(fr); wrap.appendChild(box);
        el.appendChild(tabs); el.appendChild(wrap);
        let painted = '', h = 300;
        const size = function () {
            const s = Math.min(1, Math.max(1, wrap.clientWidth || 320) / PV_W);
            fr.style.width = PV_W + 'px'; fr.style.height = h + 'px'; fr.style.transform = 'scale(' + s + ')';
            box.style.width = Math.round(PV_W * s) + 'px'; box.style.height = Math.round(h * s) + 'px';
        };
        fr.onload = function () { try { h = Math.max(120, Math.ceil(fr.contentDocument.body.scrollHeight)); } catch (e) {} size(); };
        const one = { el: el, paint: function () {
            size();
            if (painted !== _bg) { painted = _bg; fr.srcdoc = _doc(css, _bg); }
            tabs.querySelectorAll('[data-bg]').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-bg') === _bg); });
        } };
        _live.push(one);
        tabs.addEventListener('click', function (e) {
            const b = e.target.closest('[data-bg]');
            if (!b) return;
            _bg = b.getAttribute('data-bg');
            for (let i = _live.length - 1; i >= 0; i--) { if (!_live[i].el.isConnected) _live.splice(i, 1); else _live[i].paint(); }
        });
        one.paint();
        try { const ro = new ResizeObserver(function () { if (wrap.isConnected) size(); }); ro.observe(wrap); } catch (e) {}
    }
    // 直接蓋在聊天 app 上，回一支換回來的。走 WX_BUBBLE_SETTINGS.preview：試套的時候她切到哪一間都先貼這一份
    //   （🚨以前直接換 <style> 的內容，她一進聊天室就被那間存的蓋回去，按了像沒反應）；alive 回 false 就自己收掉。
    function _tryOn(css, reset, alive) {
        const B = _B();
        B.preview(reset ? { mode: 'default' } : { mode: 'ai', aiCSS: css || '' }, alive);
        return function () { B.preview(null); };
    }
    function _try(el, prop) {
        if (!_ready()) { el.textContent = NOT_READY; return null; }
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'th-pv-try';
        el.appendChild(btn);
        const tip = document.createElement('div');
        tip.className = 'th-pv-tip';
        tip.textContent = '套上之後去聊天 app 看，切到哪一間聊天室都先用這套給你看；按「換回原本的」或關掉這張單子就換回來，按同意才會留著。';
        el.appendChild(tip);
        let restore = null;
        const paint = function () { btn.textContent = restore ? '換回原本的' : '先套上看看'; btn.classList.toggle('on', !!restore); };
        btn.addEventListener('click', function () {
            if (restore) { restore(); restore = null; }
            else restore = _tryOn(prop.after && prop.after.css, prop.reset, function () { return el.isConnected; });
            paint();
        });
        paint();
        // 單子關掉：收掉試套，照她最後開的那間存著的貼回去（同意了的話那間可能已經是新的樣子）
        return function () { if (restore) { restore(); restore = null; } };
    }
    function mountPreview(prop, which, el) {
        if (which === 'try') return _try(el, prop);
        if (!_ready()) { el.textContent = NOT_READY; return null; }
        const t = which === 'before' ? prop.before : prop.after;
        _pv(el, prop.reset ? '' : ((t && t.css) || ''));
        return null;
    }

    // ── 提單子之前先看看（截圖＋檢查，不出單子）─────────────────────────────
    function _candidate(args, ctx) {
        let t = null;
        const d = args.name ? _draftFor(args.name) : null;
        if (d) t = { name: d.after.name, css: d.after.css };
        else if (args.name) { const f = _findGal(args.name); if (!f.err) t = { name: f.t.name, css: f.t.css }; }
        else if (args.room) {
            const r = _rooms(args.room, ctx);
            if (r.err) return { err: r.err };
            if (r.list.length === 1) {
                const n = _now(r.list[0].id);
                if (n.raw) return { err: '「' + _rl(r.list[0]) + '」是對方手寫的 CSS，不走泡泡那套零件，畫不出來。' };
                t = { name: _rl(r.list[0]), head: '「' + _rl(r.list[0]) + '」現在的泡泡', css: n.css };
            }
        }
        const warn = [];
        let css = t ? t.css : null;
        if (args.find != null && args.find !== '') {
            if (css == null) return { err: '找不到那一套，find 沒有東西可以換。' };
            const n = css.split(String(args.find)).length - 1;
            if (n !== 1) return { err: n ? '「' + _cut(args.find, 60) + '」出現了 ' + n + ' 次，多抄前後幾個字。' : '「' + _cut(args.find, 60) + '」在樣式裡找不到。' };
            css = css.replace(String(args.find), function () { return String(args.replace == null ? '' : args.replace); });
        }
        if (args.css != null) css = String(args.css);
        if (css == null) return { err: args.name ? _findGal(args.name).err : '要給 name（主題庫那一套）、room（聊天室）或 css（新的一套）其中一個。' };
        if (css.trim()) {
            const c = _check(css);
            if (c.err) return { err: c.err };
            css = c.css; c.warn.forEach(function (w) { warn.push(w); });
        }
        const nm = (t && t.name) || _one(args.name) || '新的一套';
        return { t: { name: nm, head: (t && t.head && css === t.css) ? t.head : '泡泡「' + nm + '」', css: css }, warn: warn };
    }
    function _wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    // opt.textOnly：拿不到圖的那條（聊天 app 的角色）只做檢查。以前照樣截三張、還把新泡泡套在她開著的那間截一張再換回，
    //   圖最後丟掉，她只看到畫面閃一下又變回來（10-04：「突然我的酒館瀏覽器好像出現變排版了，手機樣式也被套上展示，但他結束查看後，就又回到原本樣子」）。
    async function look(args, ctx, opt) {
        args = args || {};
        if (!_ready()) return { text: NOT_READY, images: [] };
        const S = win.OS_STUDIO || window.OS_STUDIO;
        const c = _candidate(args, ctx);
        if (c.err) return { text: c.err, images: [] };
        const lines = [], images = [];
        if (opt && opt.textOnly) { /* 不截圖 */ }
        else if (!S || !S.shotNode) lines.push('・現在截不了圖（創作室還沒載好），下面只有檢查的結果。');
        else {
            for (const bg of ['light', 'dark']) {
                const host = document.createElement('div');
                host.style.cssText = 'position:fixed;left:-30000px;top:0;pointer-events:none;width:' + PV_W + 'px;height:600px;';
                document.body.appendChild(host);
                try {
                    const fr = document.createElement('iframe');
                    fr.style.cssText = 'display:block;border:0;width:' + PV_W + 'px;height:600px;';
                    host.appendChild(fr);
                    await new Promise(function (r) { fr.onload = r; fr.srcdoc = _doc(c.t.css, bg); setTimeout(r, 2000); });
                    await _wait(300);
                    const h = Math.max(120, Math.ceil(fr.contentDocument.body.scrollHeight));
                    images.push(await S.shotNode(fr.contentDocument.documentElement, PV_W, h, bg === 'dark' ? '#1d222c' : '#ededed'));
                    lines.push('・' + (bg === 'dark' ? '暗' : '亮') + '的聊天背景上（假的聊天畫面，手機寬 ' + PV_W + '）');
                } catch (e) { lines.push('・' + (bg === 'dark' ? '暗' : '亮') + '的背景沒截下來（' + ((e && e.message) || e) + '）'); }
                finally { host.remove(); }
            }
            // 她的聊天 app 正開著某一間：套上去截一張真的（背景是她自己挑的圖），截完馬上換回去
            const app = win.wxApp || window.wxApp, box = app && app.APP_CONTAINER;
            const r = box && box.getBoundingClientRect ? box.getBoundingClientRect() : null;
            if (app && app.GLOBAL_ACTIVE_ID && r && r.width > 50 && r.height > 50) {
                const restore = _tryOn(c.t.css);
                try {
                    await _wait(400);
                    images.push(await S.shotNode(box, Math.ceil(r.width), Math.ceil(r.height), '#fff'));
                    lines.push('・她的聊天 app 正開著的那間，套上這套的樣子（截完已經換回原本的）');
                } catch (e) { lines.push('・她的聊天 app 那張沒截下來（' + ((e && e.message) || e) + '）'); }
                finally { restore(); }
            } else lines.push('・她的聊天 app 現在沒開著某一間聊天室，真的畫面截不到。');
        }
        return {
            text: c.t.head + (lines.length ? '畫出來的樣子（這一步沒有出單子，對方看不到）：\n' + lines.join('\n') : '的檢查（這一步沒有出單子，對方看不到）：')
                + (c.warn.length ? '\n檢查抓到的（提單子時也會列給對方看）：\n- ' + c.warn.join('\n- ') : '\n檢查沒抓到問題。'),
            images: images.slice(0, 3)
        };
    }

    // ── 給模型看的清單 ─────────────────────────────────────────────────────
    const NOTE = 'aurelia_bubble_ 開頭的工具是看和改對方手機聊天 app 裡的聊天泡泡（每則訊息外面那一圈的樣子，連頭像的框）。'
        + '泡泡是每間聊天室各自設定的；另外有一個泡泡主題庫，收著做好的幾套，哪一間要用就換上。'
        + 'list、read、spec、look 的結果都要下一輪才拿到；互相不用等的可以同一輪一起叫，但要看過 look 的圖再決定的話，提單子放到下一輪。'
        + 'add（做一套新的收進主題庫，可以順便換到哪幾間）、edit（改主題庫裡的一套，正在用它的聊天室會一起換）、use（把主題庫的一套換到哪幾間，或把那幾間還原成預設）'
        + '不會直接改，只會在對方的畫面上出一張單子，附畫出來的樣子，對方按同意才換。檢查沒過（名字重複、找不到聊天室、樣式用不上）會把原因交回給你，改好再提；'
        + '過了就變成單子，對方同不同意你這一輪不會知道，寫完這一輪就結束，所以提單子的那一則，先用你自己的話說想怎麼做再叫工具，不要說已經換好了。'
        + '新做的一套要換到哪幾間，寫在 add 的 rooms 裡；use 只能換主題庫裡已經有的（對方同意收進去之後才有）。'
        + '做新的或大改之前先用 spec 看寫法，一定要照它的規矩。改一套之前先用 read 看內容，看到了再在下一輪寫 edit。'
        + '提單子之前可以先用 look 看畫出來的樣子（截圖＋檢查），看了滿意再提，這一步不會出單子。'
        + '單子還沒被同意之前對方要你再調整：對同一套用 edit（新做還沒被同意的那套也是用 edit），會接著你上一張的內容改、出一張新的，舊的那張作廢，要換到的聊天室照上一張。';
    const ROOMS_DESC = '哪幾間聊天室：名字照 aurelia_bubble_list 列的寫，好幾間用頓號隔開；寫「全部」＝aurelia_bubble_list 列出來的每一間；你是在某一間聊天室裡跟對方聊天的話，可以寫「這間」＝你們正在聊的這一間';
    const ROOM_ONE = '看某一間聊天室現在的泡泡（一次一間，名字照 aurelia_bubble_list 列的寫；你是在某一間聊天室裡跟對方聊天的話，可以寫「這間」）';
    const TOOLS = [
        { name: 'aurelia_bubble_list', label: '看有哪些泡泡', run: list,
          description: '列出泡泡主題庫裡有哪幾套（各用在哪幾間），和每間聊天室現在的泡泡是哪一種。',
          inputSchema: { type: 'object', properties: {} } },
        { name: 'aurelia_bubble_read', label: '看泡泡的樣式', run: read,
          description: '看主題庫裡一套的 CSS（填 name），或某一間聊天室現在用的（填 room），兩個填一個。改之前先看。很長會分段，用 part 看下一段（不填＝第 1 段，結果開頭會寫共幾段）。',
          inputSchema: { type: 'object', properties: { name: { type: 'string', description: '主題庫裡那一套的名字（你還沒被同意的那張單子也看得到）' },
              room: { type: 'string', description: ROOM_ONE },
              part: { type: 'number', description: '很長時看第幾段（從 1 開始）' } } } },
        { name: 'aurelia_bubble_spec', label: '看泡泡的寫法', run: spec,
          description: '看泡泡怎麼寫：能改哪些零件、一定要守的規矩、要交什麼格式。做新的或大改之前先看。整份一次給你，寫之前看完。',
          inputSchema: { type: 'object', properties: { part: { type: 'number', description: '看第幾段（從 1 開始）' } } } },
        { name: 'aurelia_bubble_look', label: '看看泡泡畫出來的樣子',
          description: '提單子之前先看看：把一套泡泡畫在假的聊天畫面上截圖給你（亮背景、暗背景各一張；對方的聊天 app 正開著某一間時，多一張套在真畫面上的），能看圖的才看得到，並列出檢查抓到的問題。不會出單子，對方看不到。'
            + '只填 name＝看主題庫裡那一套（或你還沒被同意的那張單子）；name 再加上 find 和 replace、或整份 css＝看它改完的樣子；新的一套＝name 寫打算取的名字（主題庫裡還沒有的）、css 給整份；填 room＝看那一間現在的樣子。',
          inputSchema: { type: 'object', properties: { name: { type: 'string', description: '主題庫那一套的名字；新的一套寫打算取的名字' },
              room: { type: 'string', description: ROOM_ONE },
              find: { type: 'string', description: '要換掉的那一段，照 aurelia_bubble_read 看到的原文一字不差抄，要只出現一次' },
              replace: { type: 'string', description: '換成什麼（跟 find 一起用）' },
              css: { type: 'string', description: '整份 CSS（新的一套，或整份重寫），照 aurelia_bubble_spec 的規矩寫' } } } },
        { name: 'aurelia_bubble_add', label: '新做一套泡泡', propose: true,
          description: '提出新做一套泡泡收進主題庫，要換到哪幾間聊天室也寫在這張（rooms），不用另外叫 use（對方看過樣子、按同意才會存、才會換）。寫之前先用 aurelia_bubble_spec 看寫法（結果下一輪才會到，不要跟這個同一輪叫），交的時候 spec 填說明書最後給的那串字。',
          inputSchema: { type: 'object', properties: {
              name: { type: 'string', description: '這套的名字（中文，十個字以內），不能跟主題庫裡已經有的重複，也不能叫「預設」「全部」' },
              css: { type: 'string', description: '整份 CSS，照 aurelia_bubble_spec 的規矩寫' },
              rooms: { type: 'string', description: ROOMS_DESC + '。不填＝只收進主題庫，先不換到任何一間' },
              spec: { type: 'string', description: '看完 aurelia_bubble_spec 之後，說明書最後給的那串字' } },
            required: ['name', 'css', 'spec'] } },
        { name: 'aurelia_bubble_edit', label: '改一套泡泡', propose: true,
          description: '提出修改主題庫裡的一套泡泡（對方看過改前改後、按同意才會改；正在用這套的聊天室會一起換成新的樣子）。你新做、對方還沒同意的那套也用這個改，要換到的聊天室照上一張。只改一段用 find 和 replace，整份重寫用 css；也可以用 new_name 改名字。',
          inputSchema: { type: 'object', properties: {
              name: { type: 'string', description: '要改的那一套現在的名字（還沒被同意的新做那套，就寫它在單子上的名字）' },
              find: { type: 'string', description: '要換掉的那一段，照 aurelia_bubble_read 看到的原文一字不差抄，要只出現一次' },
              replace: { type: 'string', description: '換成什麼（跟 find 一起用；要刪掉那段就寫空字串）' },
              css: { type: 'string', description: '整份重寫' },
              new_name: { type: 'string', description: '新的名字（要改名字才填）' } },
            required: ['name'] } },
        { name: 'aurelia_bubble_use', label: '換上一套泡泡', propose: true,
          description: '提出把主題庫裡已經有的一套泡泡換到哪幾間聊天室，或把那幾間還原成預設的樣子（對方看過樣子、按同意才會換）。還沒被同意收進主題庫的那套不能用這個換，要換的聊天室寫在 add 的 rooms。',
          inputSchema: { type: 'object', properties: {
              name: { type: 'string', description: '主題庫裡那一套的名字；要還原成預設的樣子就寫「預設」' },
              rooms: { type: 'string', description: ROOMS_DESC } },
            required: ['name', 'rooms'] } },
    ];
    function _E() { return win.OS_AURELIA_EDIT || window.OS_AURELIA_EDIT || null; }
    async function run(name, args, ctx) {
        if (name === 'aurelia_change_log') { const E = _E(); if (!E) throw new Error('修改紀錄還沒載好'); return E.readLog(args); }
        // 聊天 app 的角色只拿得到字（圖只有宿舍住戶那條會轉過去，走 look）
        if (name === 'aurelia_bubble_look') return (await look(args || {}, ctx, { textOnly: true })).text + '\n（這裡看不到截圖，只有檢查的結果。）';
        const t = TOOLS.find(function (x) { return x.name === name && x.run; });
        if (!t) throw new Error('沒有叫做「' + name + '」的工具');
        return String((await t.run(args || {}, ctx)) || '').trim() || '什麼都沒有查到。';
    }
    const _pub = TOOLS.map(function (t) { return { name: t.name, label: t.label, description: t.description, inputSchema: t.inputSchema, propose: !!t.propose }; });

    const API = {
        note: NOTE,
        get tools() { const E = _E(); return (E && E.logTool) ? _pub.concat([E.logTool]) : _pub; },
        run: run, propose: propose, apply: apply, undo: undo,
        verb: verb, text: text, what: what, noun: noun, cards: cards, detail: detail, mountPreview: mountPreview, superseded: superseded,
        look: look,
    };
    win.OS_AURELIA_BUBBLE = API;
    window.OS_AURELIA_BUBBLE = API;
})();
