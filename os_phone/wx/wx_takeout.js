// ----------------------------------------------------------------
// [檔案] wx_takeout.js — 外送（雙向）
// 路徑：os_phone/wx/wx_takeout.js
//
// 照小手機常見的外送做兩件事，兩個方向都有：
//   ・點給對方：誰付錢誰點，送到對方手上。[Takeout: 店名|品項|金額|給誰|留言|單號]
//   ・請對方付（代付）：自己挑好，請對方買單。[TakeoutAsk: 店名|品項|金額|找誰付|單號]
//     角色請她付的，十五分鐘沒理就失效（她選的，照真的外送代付）；
//     她請角色付的不自己過期——角色要等她下一次送出才有機會回，拿時間逼它不公平。
//     角色回代付：[系統: TakeoutPay|號碼或單號] ／ [系統: TakeoutDecline|號碼或單號]
//
// 送達要真的等（她選的）：每張單有一個「幾分鐘送到」，卡片照經過的時間一格一格走
//   等商家接單 → 商家備餐中 → 騎手已取餐 → 配送中 → 已送達。
//   狀態是「現在時間 − 開始時間」算出來的，不靠計時器存狀態：她關掉手機再開，一樣走到對的那一格。
//   送到那一刻補一行系統訊息進聊天室（對方就是從這行知道的），這張單就結案。
//
// 店與菜單（她選的：兩個都要）：按一顆鈕，照這個故事的世界生幾家店（叫一次模型，名冊 takeout），
//   存在這個故事底下，下次打開還在；店裡沒有的就「自己寫」。
//
// 狀態記在那間聊天室的卡片帳本（wx_cards.js，kind＝takeout），跟紅包轉帳同一本：
//   單號只當別名、程式自己發號碼、綁在哪一則訊息上。這裡不另外發明一套。
//
// 暴露：window.WX_TAKEOUT
// ----------------------------------------------------------------
(function () {
    'use strict';
    console.log('[WeChat] 載入外送 (wx_takeout.js)...');
    const win = window.parent || window;
    const d = win.document;

    const APP_ID = 'wx_takeout';
    const KIND = 'takeout';
    const ASK_TTL = 15 * 60 * 1000;          // 角色請她付的代付，多久沒理就失效
    const ETA_MIN = 15, ETA_MAX = 60;        // 一張單幾分鐘送到（店自己說的會夾在這裡面）
    const TICK_MS = 20000;                   // 畫面上的卡多久重算一次
    const SHOP_N = 6;

    // 走到第幾格：用「經過的時間 ÷ 要送的時間」。四個點亮的格子（接單、取餐、配送、送達）前面還有一個「剛下單」。
    const STAGE = [
        { upto: 0.08, label: '等商家接單' },
        { upto: 0.45, label: '商家備餐中' },
        { upto: 0.55, label: '騎手已取餐' },
        { upto: 1.00, label: '配送中' },
        { upto: Infinity, label: '已送達' }
    ];
    const STEP_NAMES = ['接單', '取餐', '配送', '送達'];

    const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const REF = '(window.parent.WX_TAKEOUT || window.WX_TAKEOUT)';

    function _cards() { return win.WX_CARDS || window.WX_CARDS; }
    function _app() { return win.wxApp || window.wxApp; }
    function _aui() { return win.AUI || window.AUI; }
    function _wallet() { return win.WX_WALLET || window.WX_WALLET; }
    function _db() { return win.OS_DB || window.OS_DB; }
    function _me() { try { return win.WX_ME.name(); } catch (e) { return '我'; } }
    function _isMe(n) { try { return win.WX_ME.isMine(n); } catch (e) { return false; } }
    function _toast(t) { try { const A = _aui(); if (A && A.toast) A.toast(t); } catch (e) {} }
    function _scope() {
        try { const db = _db(); if (db && db.currentChatId) { const c = db.currentChatId(); if (c != null && String(c)) return String(c); } } catch (e) {}
        try { return localStorage.getItem('vn_current_story_id') || 'default'; } catch (e) { return 'default'; }
    }
    function _num(v) { const n = parseFloat(String(v == null ? '' : v).replace(/[^\d.]/g, '')); return isFinite(n) ? n : 0; }
    function money(n) {
        const v = Math.round(_num(n) * 100) / 100;
        return '¥' + (Math.abs(v - Math.round(v)) < 0.001 ? String(Math.round(v)) : v.toFixed(2));
    }
    function _hash(s) { let h = 0; s = String(s || ''); for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; } return Math.abs(h); }
    function _clampEta(m) { const n = Math.round(_num(m)); return n ? Math.max(ETA_MIN, Math.min(ETA_MAX, n)) : 0; }
    function _hhmm(ts) { const t = new Date(ts); return String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0'); }
    function _chat(chatId) { const a = _app(); return (a && a.GLOBAL_CHATS && chatId) ? a.GLOBAL_CHATS[chatId] : null; }

    // ── 讀一張單的字 ─────────────────────────────────────────────
    //   模型不一定每格都寫：金額是唯一認得出來的那格（數字），前後照它對位。
    //   單號在最後一格、看起來像英數代號才算；沒寫就交給畫面那邊用「第幾則訊息」當身分。
    const ID_RE = /^[A-Za-z][A-Za-z0-9_-]{1,40}$/;
    const AMT_RE = /^[¥￥$]?\s*\d+(?:\.\d+)?\s*(?:元|塊|块)?$/;
    function parse(mode, content) {
        let parts = String(content == null ? '' : content).split(/[|｜]/).map(s => s.trim());
        while (parts.length && !parts[parts.length - 1]) parts.pop();
        let id = '';
        if (parts.length >= 4 && ID_RE.test(parts[parts.length - 1])) id = parts.pop();
        const ai = parts.findIndex(p => AMT_RE.test(p));
        let shop = '', items = '', amount = 0, who = '', note = '';
        if (ai >= 0) {
            amount = _num(parts[ai]);
            if (ai >= 2) { shop = parts[0]; items = parts.slice(1, ai).filter(Boolean).join('、'); }
            else if (ai === 1) { items = parts[0]; }
            who = parts[ai + 1] || '';
            note = parts.slice(ai + 2).filter(Boolean).join('｜');
        } else {
            shop = parts[0] || ''; items = parts.slice(1).filter(Boolean).join('、');
        }
        if (mode === 'ask') note = '';
        return { mode, shop, items: items || shop || '外送', amount, who, note, id };
    }

    // ── 狀態 ────────────────────────────────────────────────────
    function _stage(data, now) {
        if (!data || !data.startAt || !data.eta) return -1;
        const p = ((now || Date.now()) - data.startAt) / (data.eta * 60000);
        for (let i = 0; i < STAGE.length; i++) if (p < STAGE[i].upto) return i;
        return STAGE.length - 1;
    }
    function _minsLeft(data, now) {
        if (!data || !data.startAt || !data.eta) return 0;
        return Math.max(1, Math.ceil((data.startAt + data.eta * 60000 - (now || Date.now())) / 60000));
    }
    function _delivering(c) { return !!(c && c.data && c.data.startAt); }
    function _askOpen(c) { return !!(c && c.data && c.data.mode === 'ask' && !c.data.startAt && c.status === 'pending'); }

    // 這張單誰出錢、送給誰（名字）。from＝發這則訊息的人（她就是自己的名字）。
    function _parties(c) {
        const x = (c && c.data) || {};
        const me = _me();
        const from = x.fromMe ? me : (x.from || '對方');
        if (x.mode === 'ask') {
            const payer = x.paidBy || (x.fromMe ? (x.who || '對方') : me);
            return { payer: payer, eater: from, from: from };
        }
        const eater = x.fromMe ? (x.who || '對方') : me;
        return { payer: from, eater: eater, from: from };
    }

    // 找一個店名配上的「幾分鐘送到」：店是這個故事生出來的就用它說的，不然用單號擲一個 20～40 分
    function _etaFor(shop, alias) {
        const s = _shopByName(shop);
        return _clampEta(s && s.eta) || (20 + (_hash(alias || shop) % 21));
    }

    // 畫卡片時用：帳本裡有就拿，沒有就開一張（第一次畫到＝收到這則的時候，當作下單時間）
    function ensure(chatId, alias, info, slot, fromMe, sender) {
        const C = _cards();
        if (!C || !chatId) return null;
        const seed = {
            mode: info.mode, shop: info.shop, items: info.items, amount: info.amount,
            who: info.who, note: info.note, fromMe: !!fromMe, from: fromMe ? '' : (sender || ''),
            eta: _etaFor(info.shop, alias)
        };
        if (info.mode === 'order') seed.startAt = Date.now();
        else seed.askAt = Date.now();
        return C.findOrAttach(chatId, KIND, alias, seed, slot);
    }

    // ── 把時間走完的單結案（送到了、代付過期了）─────────────────
    //   回傳這一次剛結案的那幾張，給模型的清單會說「剛剛送到」。
    function sweep(chatId) {
        const C = _cards();
        if (!C || !chatId) return [];
        const now = Date.now();
        const done = [];
        C.pending(chatId, KIND).forEach(function (c) {
            const x = c.data || {};
            if (_askOpen(c) && !x.fromMe && x.askAt && now - x.askAt > ASK_TTL) {
                C.update(chatId, c.key, { status: 'expired' });
                _line(chatId, (x.from || '對方') + ' 請你付的外送過期了，你沒有付（' + (x.shop || x.items) + '）');
                done.push({ card: c, what: 'expired' });
                return;
            }
            if (_delivering(c) && _stage(x, now) >= STAGE.length - 1) {
                C.update(chatId, c.key, { status: 'finished', data: { doneAt: x.startAt + x.eta * 60000 } });
                const p = _parties(c);
                const what = '（' + (x.shop || x.items) + '）';
                const ask = x.mode === 'ask';
                _line(chatId, _isMe(p.eater)
                    ? p.payer + (ask ? ' 幫你付的外送送到了' : ' 幫你點的外送送到了') + what
                    : (ask ? '你幫 ' + p.eater + ' 付的外送送到 ' + p.eater + ' 那裡了' : '你點給 ' + p.eater + ' 的外送送到了') + what);
                done.push({ card: c, what: 'delivered' });
            }
        });
        return done;
    }
    function _line(chatId, text) {
        try { const a = _app(); if (a && a.pushSystemLine) a.pushSystemLine(chatId, text); } catch (e) {}
    }

    // ── 聊天室裡的那張卡 ────────────────────────────────────────
    //   ctx: { chatId, msgIndex, isMe, sender, mode, content, alias }
    function cardHTML(ctx) {
        const info = parse(ctx.mode, ctx.content);
        const alias = info.id || ctx.alias;
        const c = ensure(ctx.chatId, alias, info, ctx.msgIndex, ctx.isMe, ctx.sender);
        if (!c) return _staticHTML(info, ctx.isMe, ctx.sender);
        return '<div class="wxto-card" data-wxto-chat="' + esc(ctx.chatId) + '" data-wxto-key="' + esc(c.key) + '">' + _cardInner(c) + '</div>';
    }
    function _cardInner(c) {
        const x = c.data || {};
        const now = Date.now();
        const p = _parties(c);
        const meEat = _isMe(p.eater);
        let kind;
        if (x.mode === 'ask') kind = x.fromMe ? ('請 ' + (x.who || '對方') + ' 付') : (p.from + ' 想請你付');
        else kind = x.fromMe ? ('點給 ' + (x.who || '對方')) : (p.from + ' 幫你點的');
        let dim = false, foot = '', steps = '', act = '';
        if (_delivering(c) || c.status === 'finished') {
            const st = c.status === 'finished' ? STAGE.length - 1 : _stage(x, now);
            steps = '<div class="wxto-steps">' + STEP_NAMES.map(function (n, i) {
                return '<span class="wxto-step' + (st > i ? ' is-on' : '') + (st === i + 1 && st < STAGE.length - 1 ? ' is-now' : '') + '"><i></i><em>' + n + '</em></span>';
            }).join('') + '</div>';
            if (c.status === 'finished' || st >= STAGE.length - 1) {
                foot = '已送達 ' + _hhmm((x.doneAt) || (x.startAt + x.eta * 60000));
            } else {
                foot = STAGE[Math.max(0, st)].label + ' · 預計 ' + _hhmm(x.startAt + x.eta * 60000) + ' 送達';
            }
            if (x.mode === 'ask' && x.paidBy) kind = (_isMe(x.paidBy) ? '你幫 ' + p.eater + ' 付的' : x.paidBy + ' 幫你付的');
        } else if (c.status === 'expired') {
            dim = true; foot = '代付已過期';
        } else if (c.status === 'declined') {
            dim = true; foot = x.fromMe ? ((x.who || '對方') + ' 沒有付') : '你沒有付';
        } else if (_askOpen(c)) {
            if (x.fromMe) {
                foot = '等 ' + (x.who || '對方') + ' 付款';
            } else {
                const left = Math.max(0, (x.askAt || now) + ASK_TTL - now);
                foot = Math.ceil(left / 60000) + ' 分鐘內有效';
                act = '<div class="wxto-act">' +
                    '<button type="button" class="wxto-btn" onclick="event.stopPropagation(); ' + REF + '.act(this, \'decline\')">不要</button>' +
                    '<button type="button" class="wxto-btn is-main" onclick="event.stopPropagation(); ' + REF + '.act(this, \'pay\')">幫 ' + esc(p.from) + ' 付 ' + money(x.amount) + '</button>' +
                    '</div>';
            }
        }
        return '<div class="wxto-card-in' + (dim ? ' is-dim' : '') + (meEat && !dim ? ' is-mine' : '') + '">' +
            '<div class="wxto-card-hd"><i class="fa-solid fa-motorcycle"></i><span class="wxto-card-kind">' + esc(kind) + '</span><span class="wxto-card-amt">' + money(x.amount) + '</span></div>' +
            '<div class="wxto-card-bd">' +
            (x.shop ? '<div class="wxto-card-shop">' + esc(x.shop) + '</div>' : '') +
            '<div class="wxto-card-items">' + esc(x.items || '外送') + '</div>' +
            (x.note ? '<div class="wxto-card-note">' + esc(x.note) + '</div>' : '') +
            '</div>' + steps +
            '<div class="wxto-card-ft">' + esc(foot) + '</div>' + act +
            '</div>';
    }
    // 沒有帳本可用的地方（VN 手機：劇情裡的手機，只有畫面沒有資料）：只畫單子本身，不走狀態
    function _staticHTML(info, isMe, sender) {
        const kind = info.mode === 'ask' ? (isMe ? '代付請求' : (sender || '對方') + ' 想請人付') : '外送訂單';
        return '<div class="wxto-card"><div class="wxto-card-in">' +
            '<div class="wxto-card-hd"><i class="fa-solid fa-motorcycle"></i><span class="wxto-card-kind">' + esc(kind) + '</span><span class="wxto-card-amt">' + money(info.amount) + '</span></div>' +
            '<div class="wxto-card-bd">' +
            (info.shop ? '<div class="wxto-card-shop">' + esc(info.shop) + '</div>' : '') +
            '<div class="wxto-card-items">' + esc(info.items) + '</div>' +
            (info.note ? '<div class="wxto-card-note">' + esc(info.note) + '</div>' : '') +
            '</div></div></div>';
    }
    function staticCard(mode, content, isMe, sender) { return _staticHTML(parse(mode, content), isMe, sender); }

    // 畫面上有幾張就重算幾張（時間在走）
    function refresh(root) {
        const host = root || (_app() && _app().APP_CONTAINER) || d;
        if (!host || !host.querySelectorAll) return;
        const C = _cards();
        if (!C) return;
        const swept = {};
        host.querySelectorAll('.wxto-card[data-wxto-key]').forEach(function (el) {
            const cid = el.dataset.wxtoChat, key = el.dataset.wxtoKey;
            if (!swept[cid]) { swept[cid] = 1; sweep(cid); }
            const c = C.byKey(cid, key);
            if (c) el.innerHTML = _cardInner(c);
        });
    }
    let _ticker = 0;
    function _startTicker() {
        if (_ticker) return;
        _ticker = setInterval(function () {
            try {
                const a = _app();
                if (a && a.APP_CONTAINER && a.APP_CONTAINER.isConnected) refresh(a.APP_CONTAINER);
            } catch (e) {}
        }, TICK_MS);
    }

    // ── 她按卡片上的「幫他付」「不要」──────────────────────────
    function act(btn, what) {
        const el = btn && btn.closest && btn.closest('.wxto-card');
        const C = _cards();
        if (!el || !C) return;
        const cid = el.dataset.wxtoChat, key = el.dataset.wxtoKey;
        sweep(cid);
        const c = C.byKey(cid, key);
        if (!c || !_askOpen(c) || c.data.fromMe) { refresh(el.parentNode); return; }
        const x = c.data;
        if (what === 'pay') {
            const W = _wallet();
            if (W && !W.transaction(-x.amount, '外送代付 - ' + (x.from || '對方'))) {
                _toast('錢包餘額不夠（現在 ' + money(W.getBalance()) + '）');
                return;
            }
            C.update(cid, key, { data: { paidBy: _me(), startAt: Date.now(), eta: x.eta || _etaFor(x.shop, c.alias) } });
            _line(cid, '你幫 ' + (x.from || '對方') + ' 付了外送 ' + money(x.amount) + '（' + (x.shop ? x.shop + '・' : '') + x.items + '），店家開始準備了');
        } else {
            C.update(cid, key, { status: 'declined' });
            _line(cid, '你沒有幫 ' + (x.from || '對方') + ' 付外送（' + (x.shop || x.items) + '）');
        }
        refresh();
    }

    // ── 角色回她的代付：[系統: TakeoutPay|號碼] / [系統: TakeoutDecline|號碼] ──
    //   在系統訊息解析的最前面接住，別讓轉帳那幾條的「Accept／Return」先吃掉。
    const INTENT_RE = /^\s*Takeout\s*(Pay|Decline)\b\s*[|｜:：]?\s*(.*)$/i;
    function intent(content, ctx) {
        const m = String(content || '').match(INTENT_RE);
        if (!m) return null;
        const C = _cards();
        const cid = ctx && ctx.chatId;
        if (!C || !cid) return { type: 'system', content: '', isMe: false };
        const ref = String(m[2] || '').replace(/\]+\s*$/, '').trim();
        // 只找「她請人付、還沒結果」的那幾張：find 對不上會退回最近一張，先把範圍縮在這裡
        const mine = C.pending(cid, KIND).filter(function (c) { return _askOpen(c) && c.data.fromMe; });
        let c = null;
        if (ref) { const f = C.find(cid, KIND, ref); if (f && mine.some(function (x) { return x.key === f.key; })) c = f; }
        if (!c) c = mine[mine.length - 1] || null;
        if (!c) return { type: 'system', content: '', isMe: false };
        const payer = (ctx.chatName && !(_chat(cid) || {}).isGroup) ? ctx.chatName : (c.data.who || '對方');
        const x = c.data;
        if (/^pay$/i.test(m[1])) {
            C.update(cid, c.key, { data: { paidBy: payer, startAt: Date.now(), eta: x.eta || _etaFor(x.shop, c.alias) } });
            setTimeout(refresh, 0);
            return { type: 'system', content: payer + ' 幫你付了外送 ' + money(x.amount) + '（' + (x.shop ? x.shop + '・' : '') + x.items + '），店家開始準備了', isMe: false };
        }
        C.update(cid, c.key, { status: 'declined' });
        setTimeout(refresh, 0);
        return { type: 'system', content: payer + ' 沒有幫你付外送（' + (x.shop || x.items) + '）', isMe: false };
    }

    // 「誰幫誰」：點外送是「A 點給 B」，代付是「A 幫 B 付」——錢是誰出的要講對，模型才知道該謝誰
    function _who(c, p) { return (c.data && c.data.mode === 'ask') ? p.payer + ' 幫 ' + p.eater + ' 付的' : p.payer + ' 點給 ' + p.eater + ' 的'; }

    // ── 給模型看的那幾行（接在「現在還沒處理完的」清單裡）──────
    function briefLines(chatId) {
        const C = _cards();
        if (!C || !chatId) return { lines: [], asks: false };
        const just = sweep(chatId);
        const now = Date.now();
        const lines = [];
        let asks = false;
        const desc = function (c) { const x = c.data || {}; return (x.shop ? x.shop + '的' : '') + (x.items || '外送') + '（' + money(x.amount) + '）'; };
        C.pending(chatId, KIND).forEach(function (c) {
            const x = c.data || {};
            const p = _parties(c);
            let t;
            if (_askOpen(c)) {
                if (x.fromMe) { asks = true; t = '代付：' + p.from + ' 請 ' + (x.who || '你') + ' 付 ' + desc(c) + '，等你決定'; }
                else t = '代付：' + p.from + ' 請 ' + _me() + ' 付 ' + desc(c) + '，' + _me() + ' 還沒回應，' + Math.max(1, Math.ceil(((x.askAt || now) + ASK_TTL - now) / 60000)) + ' 分鐘後失效';
            } else if (_delivering(c)) {
                t = '外送：' + _who(c, p) + ' ' + desc(c) + '，' + STAGE[Math.max(0, _stage(x, now))].label + '，大約 ' + _minsLeft(x, now) + ' 分鐘後送到';
            }
            if (t) lines.push(c.seq + ' 號　' + t);
        });
        just.forEach(function (j) {
            const c = j.card, x = c.data || {}, p = _parties(c);
            lines.push(j.what === 'delivered'
                ? '剛剛：' + _who(c, p) + ' ' + (x.shop ? x.shop + '的' : '') + (x.items || '外送') + ' 送到 ' + p.eater + ' 那裡了'
                : '剛剛：' + p.from + ' 請 ' + _me() + ' 付的外送過期了，' + _me() + ' 沒有付');
        });
        return { lines: lines, asks: asks };
    }

    // ================================================================
    // 外送頁（聊天室「＋」→ 外送）
    // ================================================================
    let _root = null, _chatId = '';
    let _mode = 'order';        // order＝點給對方、ask＝請對方付
    let _to = '';               // 送給誰／找誰付（群聊可以挑）
    let _shops = [];            // [{ name, eta, note, dishes:[{ name, price }] }]
    let _pick = '';             // 現在看哪一家（'__custom' ＝自己寫）
    let _carts = {};            // { 店名: { 品名: 數量 } }
    let _custom = [];           // 自己寫的：[{ shop, name, price }]
    let _busy = false;
    let _noteDraft = '';        // 給對方的話：重畫時別弄丟她打到一半的字
    let _shopsScope = null;     // 店是跟著故事走的：記住讀的是哪個故事的，換了就重讀

    async function _loadShops() {
        _shopsScope = _scope();
        const db = _db();
        if (!db || !db.getAppData) return;
        try { const v = await db.getAppData(APP_ID, 'shops', _shopsScope); _shops = (v && Array.isArray(v.list)) ? v.list : []; } catch (e) { _shops = []; }
    }
    async function _saveShops() {
        const db = _db();
        if (!db || !db.saveAppData) return;
        try { await db.saveAppData(APP_ID, 'shops', { at: Date.now(), list: _shops }, _scope()); } catch (e) { console.warn('[外送] 店家存不進去', e); }
    }
    function _shopByName(name) { const n = String(name || '').trim(); return n ? _shops.find(function (s) { return s.name === n; }) : null; }

    function _members(chatId) {
        const chat = _chat(chatId);
        if (!chat) return [];
        if (!chat.isGroup) return [chat.name || chat.id];
        let all = [];
        try { all = (win.WX_CONTACTS && win.WX_CONTACTS.getAllCustomContacts) ? win.WX_CONTACTS.getAllCustomContacts() : []; } catch (e) {}
        return (chat.members || []).filter(function (id) { return id !== 'User' && id !== 'user'; }).map(function (id) {
            const ct = all.find(function (c) { return c.id === id; });
            return ct && ct.name ? ct.name : id;
        }).filter(function (n) { return n && !_isMe(n); });
    }

    function _lines() {
        if (_pick === '__custom') return _custom.map(function (x, i) { return { name: x.name, price: x.price, qty: 1, idx: i }; });
        const cart = _carts[_pick] || {};
        const s = _shopByName(_pick);
        if (!s) return [];
        return (s.dishes || []).filter(function (x) { return cart[x.name] > 0; }).map(function (x) { return { name: x.name, price: x.price, qty: cart[x.name] }; });
    }
    function _total() { return _lines().reduce(function (n, x) { return n + _num(x.price) * x.qty; }, 0); }
    function _count() { return _lines().reduce(function (n, x) { return n + x.qty; }, 0); }

    async function open(chatId) {
        const a = _app();
        const host = a && a.APP_CONTAINER;
        chatId = chatId || (a && a.GLOBAL_ACTIVE_ID);
        if (!host || !chatId || !_chat(chatId)) return false;
        close();
        _chatId = chatId;
        _mode = 'order';
        const ms = _members(chatId);
        _to = ms[0] || '';
        _carts = {}; _custom = []; _noteDraft = '';
        _root = d.createElement('div');
        _root.className = 'wxto-root';
        host.appendChild(_root);
        _guard(host);
        _root.addEventListener('click', _onClick);
        _root.addEventListener('change', _onChange);
        try { const W = _wallet(); if (W && W.load) await W.load(); } catch (e) {}
        if (_shopsScope !== _scope()) { _pick = ''; await _loadShops(); }
        if (!_root) return false;
        if (!_shopByName(_pick) && _pick !== '__custom') _pick = _shops[0] ? _shops[0].name : '';
        _render();
        return true;
    }
    function close() {
        if (_obs) { try { _obs.disconnect(); } catch (e) {} _obs = null; }
        if (_root) { try { _root.remove(); } catch (e) {} }
        _root = null;
    }
    // 🚨 聊天 app 整頁重畫（別間來了訊息、角色回話）會把容器整個清掉，蓋在上面的這頁也跟著不見，
    //    她挑到一半的購物車就沒了。盯著容器：這頁被清掉就原封不動貼回去（狀態都在這支裡，不用重來）；
    //    容器本身都不在了＝她離開聊天 app，那就真的收掉。
    let _obs = null;
    function _guard(host) {
        if (_obs) { try { _obs.disconnect(); } catch (e) {} }
        const MO = win.MutationObserver || window.MutationObserver;
        if (!MO) return;
        _obs = new MO(function () {
            if (!_root) return;
            if (!host.isConnected) { close(); return; }
            if (!_root.isConnected) host.appendChild(_root);
        });
        _obs.observe(host, { childList: true });
    }

    function _render() {
        if (!_root) return;
        const scrollEl = _root.querySelector('.wxto-scroll');
        const keepTop = scrollEl ? scrollEl.scrollTop : 0;
        const stripEl = _root.querySelector('.wxto-shops');
        const keepLeft = stripEl ? stripEl.scrollLeft : 0;
        const chat = _chat(_chatId) || {};
        const ms = _members(_chatId);
        const W = _wallet();
        const bal = W ? W.getBalance() : null;
        const who = _to || '對方';
        const total = _total(), n = _count();

        let head =
            '<div class="wxto-head">' +
            '  <button class="wxto-back" type="button" data-act="close"><i class="fa-solid fa-chevron-left"></i></button>' +
            '  <div class="wxto-head-t"><div class="wxto-title">外送</div><div class="wxto-sub">' + (_mode === 'order' ? '送到 ' + esc(who) + ' 手上' : '請 ' + esc(who) + ' 買單') + '</div></div>' +
            '  <span class="wxto-head-pad"></span>' +
            '</div>';

        let seg =
            '<div class="wxto-seg">' +
            '  <button type="button" class="wxto-seg-b' + (_mode === 'order' ? ' is-on' : '') + '" data-act="mode" data-v="order"><i class="fa-solid fa-gift"></i>點給' + esc(chat.isGroup ? '誰' : who) + '</button>' +
            '  <button type="button" class="wxto-seg-b' + (_mode === 'ask' ? ' is-on' : '') + '" data-act="mode" data-v="ask"><i class="fa-solid fa-hand-holding-dollar"></i>請' + esc(chat.isGroup ? '誰' : who) + '付</button>' +
            '</div>';
        if (chat.isGroup) {
            seg += '<label class="wxto-to"><span>' + (_mode === 'order' ? '送給' : '找誰付') + '</span><select class="wxto-to-sel">' +
                ms.map(function (m) { return '<option value="' + esc(m) + '"' + (m === _to ? ' selected' : '') + '>' + esc(m) + '</option>'; }).join('') +
                '</select></label>';
        }

        let shops = '<div class="wxto-shops">' +
            _shops.map(function (s) {
                const c = _carts[s.name] ? Object.values(_carts[s.name]).reduce(function (a, b) { return a + b; }, 0) : 0;
                return '<button type="button" class="wxto-shop' + (_pick === s.name ? ' is-on' : '') + '" data-act="shop" data-v="' + esc(s.name) + '">' +
                    '<b>' + esc(s.name) + '</b><span>' + (_clampEta(s.eta) || 30) + ' 分鐘</span>' + (c ? '<em>' + c + '</em>' : '') + '</button>';
            }).join('') +
            '<button type="button" class="wxto-shop is-custom' + (_pick === '__custom' ? ' is-on' : '') + '" data-act="shop" data-v="__custom"><b><i class="fa-solid fa-pen"></i>自己寫</b><span>店裡沒有的</span></button>' +
            (_shops.length ? '<button type="button" class="wxto-reshop" data-act="find" title="換一批店"><i class="fa-solid fa-rotate"></i></button>' : '') +
            '</div>';

        let menu = '';
        if (_busy) {
            menu = '<div class="wxto-empty"><i class="fa-solid fa-spinner fa-spin"></i><div class="wxto-empty-t">正在找附近的店…</div></div>';
        } else if (_pick === '__custom') {
            menu = '<div class="wxto-custom">' +
                '<input class="wxto-in" data-f="shop" type="text" maxlength="30" placeholder="哪家店（可以不寫）" autocomplete="off">' +
                '<div class="wxto-custom-row">' +
                '  <input class="wxto-in" data-f="name" type="text" maxlength="40" placeholder="想吃什麼" autocomplete="off">' +
                '  <input class="wxto-in wxto-in-price" data-f="price" type="text" inputmode="decimal" maxlength="8" placeholder="多少錢" autocomplete="off">' +
                '</div>' +
                '<button type="button" class="wxto-add" data-act="custom-add"><i class="fa-solid fa-plus"></i>加進去</button>' +
                (_custom.length ? '<div class="wxto-dishes">' + _custom.map(function (x, i) {
                    return '<div class="wxto-dish"><div class="wxto-dish-t"><b>' + esc(x.name) + '</b>' + (x.shop ? '<span>' + esc(x.shop) + '</span>' : '') + '</div>' +
                        '<div class="wxto-dish-p">' + money(x.price) + '</div>' +
                        '<button type="button" class="wxto-x" data-act="custom-del" data-i="' + i + '"><i class="fa-solid fa-xmark"></i></button></div>';
                }).join('') + '</div>' : '') +
                '</div>';
        } else if (!_shops.length) {
            menu = '<div class="wxto-empty"><i class="fa-solid fa-store"></i>' +
                '<div class="wxto-empty-t">附近還沒有店</div>' +
                '<div class="wxto-empty-s">照你現在這個故事的世界，找幾家會送到這裡的店</div>' +
                '<button type="button" class="wxto-find" data-act="find"><i class="fa-solid fa-magnifying-glass-location"></i>找附近的店</button>' +
                '<button type="button" class="wxto-link" data-act="shop" data-v="__custom">或是自己寫想吃什麼</button>' +
                '</div>';
        } else {
            const s = _shopByName(_pick);
            const cart = _carts[_pick] || {};
            menu = s ? ((s.note ? '<div class="wxto-shop-note">' + esc(s.note) + '</div>' : '') +
                '<div class="wxto-dishes">' + (s.dishes || []).map(function (x) {
                    const q = cart[x.name] || 0;
                    return '<div class="wxto-dish' + (q ? ' is-in' : '') + '"><div class="wxto-dish-t"><b>' + esc(x.name) + '</b></div>' +
                        '<div class="wxto-dish-p">' + money(x.price) + '</div>' +
                        '<div class="wxto-step-q">' +
                        (q ? '<button type="button" data-act="dec" data-v="' + esc(x.name) + '"><i class="fa-solid fa-minus"></i></button><span>' + q + '</span>' : '') +
                        '<button type="button" class="is-plus" data-act="inc" data-v="' + esc(x.name) + '"><i class="fa-solid fa-plus"></i></button>' +
                        '</div></div>';
                }).join('') + '</div>') : '';
        }

        // 留言等真的點了東西才出現：空的時候那格只是多一條讓人不知道要幹嘛的框
        const noteBox = (_mode === 'order' && n)
            ? '<input class="wxto-in wxto-note" type="text" maxlength="40" placeholder="給' + esc(who) + '的話（可以不寫）" autocomplete="off">' : '';

        const short = _mode === 'order' && bal != null && total > bal;
        const btnText = !n ? (_mode === 'order' ? '還沒點東西' : '還沒挑東西') : short ? '錢包餘額不夠' : (_mode === 'order' ? '付款 ' + money(total) : '請 ' + who + ' 付 ' + money(total));
        const bar =
            '<div class="wxto-bar">' +
            '  <div class="wxto-bar-sum"><i class="fa-solid fa-bag-shopping"></i><div class="wxto-bar-t">' +
            '    <div>' + (n ? '<b>' + n + ' 件</b><span>' + money(total) + '</span>' : '<span>空的</span>') + '</div>' +
            (bal == null ? '' : '    <small' + (short ? ' class="is-short"' : '') + '>錢包 ' + money(bal) + '</small>') +
            '  </div></div>' +
            '  <button type="button" class="wxto-go" data-act="go"' + (!n || short ? ' disabled' : '') + '>' + esc(btnText) + '</button>' +
            '</div>';

        const _nb0 = _root.querySelector('.wxto-note');
        if (_nb0) _noteDraft = _nb0.value;
        const noteVal = _noteDraft;
        _root.innerHTML = head + '<div class="wxto-scroll">' + seg + shops + '<div class="wxto-menu">' + menu + '</div>' + noteBox + '</div>' + bar;
        const nb = _root.querySelector('.wxto-note'); if (nb) nb.value = noteVal;
        const sc = _root.querySelector('.wxto-scroll'); if (sc) sc.scrollTop = keepTop;
        // 選中的那家要看得到：只動那一排自己的橫向捲動（別用 scrollIntoView，它會連外層一起捲、把整頁推歪）
        const st = _root.querySelector('.wxto-shops');
        if (st) {
            st.scrollLeft = keepLeft;
            const on = st.querySelector('.wxto-shop.is-on');
            if (on) {
                const l = on.offsetLeft - st.offsetLeft, r = l + on.offsetWidth;
                if (l < st.scrollLeft) st.scrollLeft = Math.max(0, l - 8);
                else if (r > st.scrollLeft + st.clientWidth) st.scrollLeft = r - st.clientWidth + 8;
            }
        }
    }

    function _onChange(e) {
        const t = e.target;
        if (t && t.classList && t.classList.contains('wxto-to-sel')) { _to = t.value; _render(); }
    }
    function _onClick(e) {
        const b = e.target && e.target.closest && e.target.closest('[data-act]');
        if (!b || !_root || !_root.contains(b)) return;
        const act = b.dataset.act, v = b.dataset.v;
        if (act === 'close') return close();
        if (act === 'mode') { _mode = v === 'ask' ? 'ask' : 'order'; return _render(); }
        if (act === 'shop') { _pick = v; return _render(); }
        if (act === 'find') return _findShops();
        if (act === 'inc' || act === 'dec') {
            const cart = _carts[_pick] = _carts[_pick] || {};
            cart[v] = Math.max(0, Math.min(20, (cart[v] || 0) + (act === 'inc' ? 1 : -1)));
            if (!cart[v]) delete cart[v];
            return _render();
        }
        if (act === 'custom-add') {
            const g = function (f) { const el = _root.querySelector('.wxto-custom [data-f="' + f + '"]'); return el ? el.value.trim() : ''; };
            const name = g('name'), price = _num(g('price'));
            if (!name) { _toast('寫一下想吃什麼'); return; }
            if (!(price > 0)) { _toast('寫一下多少錢'); return; }
            _custom.push({ shop: g('shop'), name: name, price: price });
            return _render();
        }
        if (act === 'custom-del') { _custom.splice(parseInt(b.dataset.i, 10), 1); return _render(); }
        if (act === 'go') return _submit();
    }

    function _submit() {
        const lines = _lines();
        if (!lines.length) return;
        const total = Math.round(_total() * 100) / 100;
        const who = _to || ((_chat(_chatId) || {}).name) || '對方';
        const items = lines.map(function (x) { return x.name + (x.qty > 1 ? '×' + x.qty : ''); }).join('、');
        const shop = _pick === '__custom'
            ? (Array.from(new Set(_custom.map(function (x) { return x.shop; }).filter(Boolean))).join('、'))
            : _pick;
        const clean = function (s) { return String(s || '').replace(/[|｜\[\]［］]/g, ' ').replace(/\s+/g, ' ').trim(); };
        const id = 'to' + Date.now().toString(36);
        const C = _cards();
        const eta = _etaFor(shop, id);
        let content;
        if (_mode === 'order') {
            const W = _wallet();
            if (W && !W.transaction(-total, '外送 - 點給' + who)) { _toast('錢包餘額不夠'); _render(); return; }
            const _nb = _root.querySelector('.wxto-note');
            const note = clean(_nb ? _nb.value : _noteDraft);
            content = '[Takeout: ' + clean(shop) + '|' + clean(items) + '|' + total + '|' + clean(who) + '|' + note + '|' + id + ']';
            if (C) C.attach(_chatId, KIND, id, { mode: 'order', shop: clean(shop), items: clean(items), amount: total, who: who, note: note, fromMe: true, from: '', eta: eta, startAt: Date.now() }, null);
        } else {
            content = '[TakeoutAsk: ' + clean(shop) + '|' + clean(items) + '|' + total + '|' + clean(who) + '|' + id + ']';
            if (C) C.attach(_chatId, KIND, id, { mode: 'ask', shop: clean(shop), items: clean(items), amount: total, who: who, note: '', fromMe: true, from: '', eta: eta, askAt: Date.now() }, null);
        }
        if (_pick === '__custom') _custom = []; else delete _carts[_pick];
        close();
        try { _app().sendMsg(null, content); } catch (e) { console.warn('[外送] 送不出去', e); }
    }

    // ── 找附近的店：叫一次模型（名冊 takeout），照這個故事的世界 ─────
    const SHOP_RE = /[<＜]\s*shop\b([^>＞]*)[>＞]([\s\S]*?)[<＜]\s*\/\s*shop\s*[>＞]/gi;
    function _attr(attrs, name) {
        const m = String(attrs || '').match(new RegExp(name + '\\s*=\\s*["“”＂\']([^"“”＂\']*)["“”＂\']', 'i'));
        return m ? m[1].trim() : '';
    }
    function parseShops(text) {
        const out = [];
        const t = String(text || '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '');
        let m;
        SHOP_RE.lastIndex = 0;
        while ((m = SHOP_RE.exec(t))) {
            const name = _attr(m[1], 'name');
            if (!name || out.some(function (s) { return s.name === name; })) continue;
            const dishes = [];
            String(m[2] || '').split(/\n/).forEach(function (ln) {
                const p = ln.replace(/^[\s\-*・•\d.、]+/, '').split(/[|｜]/).map(function (s) { return s.trim(); });
                if (p.length < 2 || !p[0]) return;
                const price = _num(p[p.length - 1]);
                if (!(price > 0) || dishes.some(function (x) { return x.name === p[0]; })) return;
                dishes.push({ name: p[0].slice(0, 30), price: Math.round(price * 100) / 100 });
            });
            if (dishes.length) out.push({ name: name.slice(0, 20), eta: _clampEta(_attr(m[1], 'eta')) || 30, note: _attr(m[1], 'note').slice(0, 40), dishes: dishes.slice(0, 12) });
        }
        return out;
    }
    async function _findShops() {
        if (_busy) return;
        const O = win.OS_API || window.OS_API;
        if (!O || !O.buildContext || !O.chatSecondary) { _toast('模型連線還沒載入'); return; }
        _busy = true; _render();
        const done = function (list, err) {
            _busy = false;
            if (list && list.length) {
                _shops = list; _carts = {};
                if (_pick !== '__custom') _pick = list[0].name;
                _saveShops();
            } else {
                _toast(err ? '沒找到店：' + err : '沒找到店，再按一次試試');
            }
            _render();
        };
        try {
            const had = _shops.map(function (s) { return s.name; });
            const ask = '請列出 ' + SHOP_N + ' 家會送到主角附近的外送店，每家 5 到 8 樣東西。\n' +
                '店要是這個故事的世界、這個時代真的會有的；種類分散（正餐、小吃、飲料、甜點、宵夜之類，照這個世界有的來）。\n' +
                '價格照這個世界的生活水準，用這個世界通用的錢，只寫數字。\n' +
                (had.length ? '這幾家已經看過了，換別家：' + had.join('、') + '\n' : '') +
                '格式固定，標籤名與屬性名照抄英文，一家一個，除此之外不要寫任何字：\n' +
                '<shop name="店名" eta="送到要幾分鐘" note="一句話介紹這家">\n品名|價格\n品名|價格\n</shop>';
            const messages = await O.buildContext(ask, 'takeout_shop_sys');
            await O.chatSecondary(messages, null,
                function (text) { const list = parseShops(text); done(list, list.length ? '' : '格式對不上'); },
                function (e) { done(null, (e && e.message) || String(e || '')); },
                { task: 'takeout', label: '外送找店', disableTyping: true });
        } catch (e) { done(null, (e && e.message) || String(e)); }
    }

    const API = {
        KIND, parse, cardHTML, staticCard, refresh, sweep, act, intent, briefLines,
        open, close, parseShops, money
    };
    win.WX_TAKEOUT = API;
    window.WX_TAKEOUT = API;
    _startTicker();
    // 卡片上的「幾分鐘送到」會去對店名：早點把這個故事的店讀進來（讀不到就用單號擲，不影響）
    setTimeout(function () { if (_shopsScope === null) _loadShops().catch(function () {}); }, 3000);
})();
