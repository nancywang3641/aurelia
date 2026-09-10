// ----------------------------------------------------------------
// [檔案] wx_wallet.js (V1)
// 路徑：os_phone/wx/wx_wallet.js
// 職責：微信自己的錢包——手機裡的錢。收紅包、收轉帳會進來，發紅包、轉出去會扣掉，
//       每一筆都留在收支明細裡。
//
// 為什麼要有這支：
//   微信裡本來就有八個以上的進出帳呼叫點（發紅包扣款、餘額不足擋下、收款入帳…），
//   但它們接的 OS_ECONOMY 早就退役到 _archive/dead-code，任何載入清單都不再載它。
//   於是每一處都被 `if (win.OS_ECONOMY)` 靜默跳過：發紅包不扣錢、收款不入帳、
//   餘額不足也不擋——她的原話是「這些收款無歸宿了」。
//
// 🚨 簽章刻意跟退役的 OS_ECONOMY 一模一樣（getBalance 同步回數字、transaction 回成功與否），
//   那些呼叫點才能原地換一個活著的實作，不必改判斷邏輯。所以：
//     · getBalance() 是同步的 → 餘額要留一份記憶體快取，開 app 時先載一次。
//     · transaction() 立刻更新快取並回傳結果，寫進 OS_DB 是後面的事（不擋 UI）。
//
// 分艙：跟微信其他東西一樣「一張卡一本帳」（app_data 的 chatId scope）。
//   PT 是刻意全域共用的，這裡不是——紅包轉帳都發生在某一段劇情裡面。
//
// 錢從哪裡來：她說賺錢管道還沒想好，所以第一版只有「收到的錢」跟「自己調整」兩個來源。
//   等 PT → 奧瑞亞的錢那條鏈想清楚了，加一個 transaction 呼叫就接得上，不用動這裡的結構。
// ----------------------------------------------------------------
(function () {
    'use strict';
    console.log('[WX] 載入錢包模塊 (wx_wallet V1)...');
    const win = window.parent || window;
    const doc = win.document;

    const APP_ID = 'wx_wallet';
    const K_BALANCE = 'balance';
    const K_LEDGER = 'ledger';
    const LEDGER_CAP = 200;          // 明細保留筆數，舊的自然掉出去

    let _cache = 0;                  // 餘額的記憶體快取（getBalance 同步靠它）
    let _loaded = false;
    let _ledger = [];

    function _db() { return win.OS_DB || window.OS_DB; }
    function _scope() {
        try { const d = _db(); if (d && d.currentChatId) { const c = d.currentChatId(); if (c != null && String(c)) return String(c); } } catch (e) {}
        try { return localStorage.getItem('vn_current_story_id') || 'default'; } catch (e) { return 'default'; }
    }
    function _num(v) { const n = Number(v); return isFinite(n) ? n : 0; }
    function _round(n) { return Math.round(_num(n) * 100) / 100; }
    function money(n) { return '¥' + _round(n).toFixed(2); }

    async function load() {
        const d = _db();
        if (!d || !d.getAppData) { _loaded = true; return _cache; }
        const sid = _scope();
        try {
            const b = await d.getAppData(APP_ID, K_BALANCE, sid);
            _cache = _round(b);
            const l = await d.getAppData(APP_ID, K_LEDGER, sid);
            _ledger = Array.isArray(l) ? l : [];
        } catch (e) { console.warn('[WX_WALLET] 讀取失敗', e); }
        _loaded = true;
        return _cache;
    }

    async function _persist() {
        const d = _db();
        if (!d || !d.saveAppData) return;
        const sid = _scope();
        try {
            await d.saveAppData(APP_ID, K_BALANCE, _round(_cache), sid);
            await d.saveAppData(APP_ID, K_LEDGER, _ledger, sid);
        } catch (e) { console.warn('[WX_WALLET] 存檔失敗', e); }
    }

    // 同步回傳快取。呼叫點是「發之前先看夠不夠」那種即時判斷，等不了 await。
    function getBalance() { return _round(_cache); }

    // 進出帳。delta 正數是進來、負數是出去。回傳成功與否（餘額不夠就不動）。
    // 立刻改快取讓畫面對得上，寫進資料庫是後面的事。
    function transaction(delta, reason, meta) {
        const d = _round(delta);
        if (!d) return true;                       // 零元不算一筆，也不算失敗
        if (d < 0 && _cache + d < 0) {
            console.warn('[WX_WALLET] 餘額不足，這筆不動：' + money(d) + '（現有 ' + money(_cache) + '）');
            return false;
        }
        _cache = _round(_cache + d);
        _ledger.unshift(Object.assign({
            amount: d,
            reason: String(reason || (d > 0 ? '收到' : '支出')),
            ts: Date.now()
        }, meta || {}));
        if (_ledger.length > LEDGER_CAP) _ledger.length = LEDGER_CAP;
        _persist();
        _refreshOpenPage();
        return true;
    }

    // 她自己改餘額（賺錢管道還沒想好之前的入口）。差額會記成一筆，看得出來是誰動的。
    function setBalance(next, note) {
        const target = _round(next);
        if (target < 0) return false;
        const diff = _round(target - _cache);
        if (!diff) return true;
        _cache = target;
        _ledger.unshift({ amount: diff, reason: note || '自己調整', ts: Date.now(), manual: true });
        if (_ledger.length > LEDGER_CAP) _ledger.length = LEDGER_CAP;
        _persist();
        _refreshOpenPage();
        return true;
    }

    function getLedger() { return _ledger.slice(); }

    async function clearAll() {
        _cache = 0; _ledger = [];
        await _persist();
        _refreshOpenPage();
    }

    // ── 畫面 ─────────────────────────────────────────────
    const CSS = `
        .wxwal-page { position:absolute; inset:0; z-index:520; display:flex; flex-direction:column;
            background:#f2f2f2; color:#000; font-family:-apple-system,BlinkMacSystemFont,'Noto Sans TC',sans-serif; }
        .wxwal-page.wxwal-dark { background:#111; color:#f0f0f0; }
        .wxwal-head { flex:0 0 auto; height:50px; display:flex; align-items:center; padding:0 8px;
            padding-top:env(safe-area-inset-top,0px); height:calc(50px + env(safe-area-inset-top,0px));
            background:#fff; border-bottom:1px solid #e5e5e5; }
        .wxwal-dark .wxwal-head { background:#1c1c1e; border-bottom-color:#2a2a2a; }
        .wxwal-back { width:44px; height:44px; display:flex; align-items:center; justify-content:center;
            font-size:18px; color:#576b95; cursor:pointer; }
        .wxwal-title { flex:1; text-align:center; font-size:17px; font-weight:600; }
        .wxwal-edit { width:44px; height:44px; display:flex; align-items:center; justify-content:center;
            font-size:16px; color:#576b95; cursor:pointer; }
        .wxwal-card { margin:12px; padding:22px 20px; border-radius:12px; background:#07c160; color:#fff; }
        .wxwal-card-label { font-size:13px; opacity:.85; }
        .wxwal-card-num { font-size:34px; font-weight:600; margin-top:6px; letter-spacing:.5px; word-break:break-all; }
        .wxwal-sec { margin:0 12px 6px; font-size:12px; color:#888; }
        .wxwal-list { flex:1; overflow-y:auto; margin:0 12px 12px; background:#fff; border-radius:12px; }
        .wxwal-dark .wxwal-list { background:#1c1c1e; }
        .wxwal-row { display:flex; align-items:center; gap:12px; padding:14px 16px; border-bottom:1px solid #f2f2f2; }
        .wxwal-dark .wxwal-row { border-bottom-color:#2a2a2a; }
        .wxwal-row:last-child { border-bottom:none; }
        .wxwal-ico { width:34px; height:34px; flex:0 0 auto; border-radius:50%; display:flex; align-items:center;
            justify-content:center; font-size:14px; background:#f2f2f2; color:#888; }
        .wxwal-dark .wxwal-ico { background:#2a2a2a; }
        .wxwal-ico.wxwal-in { background:#e8f8ee; color:#07c160; }
        .wxwal-dark .wxwal-ico.wxwal-in { background:#123; color:#3ddc84; }
        .wxwal-body { flex:1; min-width:0; }
        .wxwal-why { font-size:15px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .wxwal-when { font-size:12px; color:#999; margin-top:3px; }
        .wxwal-amt { flex:0 0 auto; font-size:16px; font-weight:600; }
        .wxwal-amt.wxwal-in { color:#07c160; }
        .wxwal-empty { padding:48px 28px; text-align:center; color:#999; font-size:14px; line-height:1.9; }
        .wxwal-empty i { font-size:30px; display:block; margin-bottom:14px; color:#d8d8d8; }
        .wxwal-empty-btn { display:inline-block; margin-top:18px; padding:10px 22px; border-radius:20px;
            background:#07c160; color:#fff; font-size:14px; cursor:pointer; }
    `;

    function _injectCss() {
        if (doc.getElementById('wx-wallet-style')) return;
        const s = doc.createElement('style');
        s.id = 'wx-wallet-style';
        s.textContent = CSS;
        (doc.head || doc.body).appendChild(s);
    }

    function _isDark() {
        try { return localStorage.getItem('wx_dark_mode') === '1'; } catch (e) { return false; }
    }

    function _when(ts) {
        try {
            const d = new Date(ts);
            const now = new Date();
            const same = d.toDateString() === now.toDateString();
            const hh = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
            if (same) return '今天 ' + hh;
            return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hh;
        } catch (e) { return ''; }
    }

    function _esc(s) { return String(s == null ? '' : s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }

    function _listHtml() {
        if (!_ledger.length) {
            return '<div class="wxwal-empty">'
                + '<i class="fa-solid fa-receipt"></i>'
                + '還沒有任何進出。<br>收到的紅包和轉帳會記在這裡。'
                + '<div class="wxwal-empty-btn" data-wxwal="edit">先放一點進去</div>'
                + '</div>';
        }
        return _ledger.map(function (e) {
            const inn = _num(e.amount) > 0;
            const ico = e.manual ? 'fa-pen' : (inn ? 'fa-arrow-down' : 'fa-arrow-up');
            return '<div class="wxwal-row">'
                + '<div class="wxwal-ico' + (inn ? ' wxwal-in' : '') + '"><i class="fa-solid ' + ico + '"></i></div>'
                + '<div class="wxwal-body">'
                + '<div class="wxwal-why">' + _esc(e.reason) + '</div>'
                + '<div class="wxwal-when">' + _when(e.ts) + '</div>'
                + '</div>'
                + '<div class="wxwal-amt' + (inn ? ' wxwal-in' : '') + '">'
                + (inn ? '+' : '−') + money(Math.abs(_num(e.amount))).replace('¥', '¥') + '</div>'
                + '</div>';
        }).join('');
    }

    function _pageHtml() {
        return '<div class="wxwal-head">'
            + '<div class="wxwal-back" data-wxwal="close"><i class="fa-solid fa-chevron-left"></i></div>'
            + '<div class="wxwal-title">錢包</div>'
            + '<div class="wxwal-edit" data-wxwal="edit"><i class="fa-solid fa-pen"></i></div>'
            + '</div>'
            + '<div class="wxwal-card">'
            + '<div class="wxwal-card-label">餘額</div>'
            + '<div class="wxwal-card-num">' + money(_cache) + '</div>'
            + '</div>'
            + '<div class="wxwal-sec">收支明細</div>'
            + '<div class="wxwal-list">' + _listHtml() + '</div>';
    }

    function _refreshOpenPage() {
        const el = doc.getElementById('wx-wallet-page');
        if (el) { el.innerHTML = _pageHtml(); _bind(el); }
        // 「我」那一頁格子右邊那個數字也要跟著動
        try {
            const cell = doc.getElementById('wx-wallet-cell-amount');
            if (cell) cell.textContent = money(_cache);
        } catch (e) {}
    }

    function _askAmount() {
        const cur = getBalance();
        const raw = win.prompt('現在錢包裡有多少？', String(cur));
        if (raw == null) return;
        const n = Number(String(raw).replace(/[^\d.\-]/g, ''));
        if (!isFinite(n) || n < 0) { try { win.toastr && win.toastr.warning('請填一個不是負數的金額', '錢包'); } catch (e) {} return; }
        setBalance(n);
    }

    function _bind(el) {
        el.querySelectorAll('[data-wxwal]').forEach(function (n) {
            const act = n.getAttribute('data-wxwal');
            n.onclick = function () {
                if (act === 'close') close();
                else if (act === 'edit') _askAmount();
            };
        });
    }

    function _container() {
        try { if (win.wxApp && win.wxApp.APP_CONTAINER) return win.wxApp.APP_CONTAINER; } catch (e) {}
        return doc.body;
    }

    async function open() {
        _injectCss();
        if (!_loaded) await load();
        close();
        const el = doc.createElement('div');
        el.id = 'wx-wallet-page';
        el.className = 'wxwal-page' + (_isDark() ? ' wxwal-dark' : '');
        el.innerHTML = _pageHtml();
        _container().appendChild(el);
        _bind(el);
    }

    function close() {
        const el = doc.getElementById('wx-wallet-page');
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    // 開 app 時先把餘額載進快取，「我」那頁跟發紅包的判斷才有東西可以問
    function init() { load().then(_refreshOpenPage).catch(function () {}); }

    win.WX_WALLET = {
        init: init, load: load,
        getBalance: getBalance,
        transaction: transaction,
        setBalance: setBalance,
        getLedger: getLedger,
        clearAll: clearAll,
        money: money,
        open: open, close: close
    };
    if (win !== window) { try { window.WX_WALLET = win.WX_WALLET; } catch (e) {} }
})();
