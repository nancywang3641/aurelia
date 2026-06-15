'use strict';
// os_dialer.js —— 📞 電話 app（手機殼）
// 兩層：① 聯絡列表（讀 WX_CONTACTS，共用同一份通訊錄）② 撥號鍵盤 → 撥號中動畫 → 撥通通話畫面
// 號碼是從聯絡人 id 算出來的固定假號碼（純展示、不另存），鍵盤撥與點聯絡人撥的是同一個人。
// 撥通的「對話區」預留好；之後接 wxApp.openChat(id) → 共用微信記憶（同一個人、不斷層）。
(function () {
    const win = window;

    // id → 固定 11 碼假號碼（同一個人永遠同一組）
    function _num(id) {
        const s = String(id || '');
        let h = 0;
        for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; }
        const d = String(h % 1000000000).padStart(9, '0');   // 9 碼
        return '1' + d.slice(0, 2) + ' ' + d.slice(2, 6) + ' ' + d.slice(5);   // 1XX XXXX XXXXX → 顯示用
    }
    function _digits(id) { return _num(id).replace(/\D/g, ''); }

    function _contacts() {
        try {
            const list = (win.WX_CONTACTS && win.WX_CONTACTS.getAllCustomContacts) ? win.WX_CONTACTS.getAllCustomContacts() : [];
            return (list || []).filter(function (c) { return c && c.id && c.id !== 'User' && !c.isGroup; });
        } catch (e) { return []; }
    }
    function _findByDigits(d) {
        const all = _contacts();
        for (let i = 0; i < all.length; i++) { if (_digits(all[i].id) === d) return all[i]; }
        return null;
    }
    function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    function _avatarBg(c) {
        // 通訊錄頭像存 avatarId(進 OS_DB) → 先用首字佔位，圖庫之後再接
        return (c.name || '?').trim().slice(0, 1);
    }

    let _root = null;
    let _timer = null;

    function launch(container) {
        _root = container;
        _clearTimer();
        _renderList();
    }
    function _clearTimer() { if (_timer) { clearInterval(_timer); _timer = null; } }

    // ── ① 聯絡列表 ──────────────────────────────────────────────
    function _renderList() {
        if (!_root) return;
        _clearTimer();
        const list = _contacts();
        const rows = list.map(function (c) {
            return '<button class="dlr-row" data-id="' + _esc(c.id) + '" type="button">'
                 + '<span class="dlr-ava">' + _esc(_avatarBg(c)) + '</span>'
                 + '<span class="dlr-row-main"><span class="dlr-row-name">' + _esc(c.name) + '</span>'
                 + '<span class="dlr-row-num">' + _esc(_num(c.id)) + '</span></span>'
                 + '<span class="dlr-row-call">📞</span></button>';
        }).join('');
        _root.innerHTML =
            '<div class="dlr-wrap">'
          +   '<div class="dlr-head">電話</div>'
          +   '<div class="dlr-list">' + (rows || '<div class="dlr-empty">通訊錄是空的<br>到微信加聯絡人後這裡就有了</div>') + '</div>'
          +   '<button class="dlr-pad-fab" id="dlr-pad-fab" type="button" title="撥號鍵盤">⌨️</button>'
          + '</div>';
        _root.querySelectorAll('.dlr-row').forEach(function (b) {
            b.addEventListener('click', function () { const c = list.find(function (x) { return x.id === b.dataset.id; }); if (c) _dialing(c); });
        });
        const fab = _root.querySelector('#dlr-pad-fab');
        if (fab) fab.addEventListener('click', function () { _renderPad(''); });
    }

    // ── ② 撥號鍵盤 ──────────────────────────────────────────────
    function _renderPad(typed) {
        if (!_root) return;
        _clearTimer();
        const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
        _root.innerHTML =
            '<div class="dlr-wrap dlr-pad">'
          +   '<button class="dlr-back" id="dlr-back" type="button">‹ 通訊錄</button>'
          +   '<div class="dlr-num-disp" id="dlr-num-disp">' + _esc(typed || '') + '</div>'
          +   '<div class="dlr-keys">'
          +     keys.map(function (k) { return '<button class="dlr-key" data-k="' + k + '" type="button">' + k + '</button>'; }).join('')
          +   '</div>'
          +   '<div class="dlr-pad-actions">'
          +     '<button class="dlr-call-btn" id="dlr-call-btn" type="button">📞 撥號</button>'
          +     '<button class="dlr-del" id="dlr-del" type="button">⌫</button>'
          +   '</div>'
          + '</div>';
        let cur = String(typed || '');
        const disp = _root.querySelector('#dlr-num-disp');
        const setDisp = function () { if (disp) disp.textContent = cur; };
        _root.querySelectorAll('.dlr-key').forEach(function (b) {
            b.addEventListener('click', function () { cur += b.dataset.k; setDisp(); });
        });
        _root.querySelector('#dlr-del').addEventListener('click', function () { cur = cur.slice(0, -1); setDisp(); });
        _root.querySelector('#dlr-back').addEventListener('click', _renderList);
        _root.querySelector('#dlr-call-btn').addEventListener('click', function () {
            const d = cur.replace(/\D/g, '');
            if (!d) return;
            const c = _findByDigits(d);
            if (c) _dialing(c);
            else _dialing({ id: '__unknown__', name: '未知號碼', _raw: cur });   // 查無此人彩蛋
        });
    }

    // ── 撥號中動畫 → 撥通 ────────────────────────────────────────
    function _dialing(contact) {
        if (!_root) return;
        _clearTimer();
        const unknown = contact.id === '__unknown__';
        const num = unknown ? (contact._raw || '') : _num(contact.id);
        _root.innerHTML =
            '<div class="dlr-call dlr-call-dialing">'
          +   '<div class="dlr-call-ava">' + _esc(unknown ? '?' : _avatarBg(contact)) + '</div>'
          +   '<div class="dlr-call-name">' + _esc(contact.name) + '</div>'
          +   '<div class="dlr-call-num">' + _esc(num) + '</div>'
          +   '<div class="dlr-call-status" id="dlr-call-status">撥號中<span class="dlr-dots">…</span></div>'
          +   '<button class="dlr-hang" id="dlr-hang" type="button">掛斷</button>'
          + '</div>';
        _root.querySelector('#dlr-hang').addEventListener('click', _renderList);
        _timer = setTimeout(function () {
            if (unknown) {
                const st = _root && _root.querySelector('#dlr-call-status');
                if (st) st.innerHTML = '查無此人 📵';
                _timer = setTimeout(_renderList, 1600);
            } else {
                _inCall(contact);
            }
        }, 1800);
    }

    // ── 撥通：通話畫面（頭像/計時/掛斷）+ 對話區（之後接 wx 共用記憶）──
    function _inCall(contact) {
        if (!_root) return;
        _clearTimer();
        _root.innerHTML =
            '<div class="dlr-call dlr-incall">'
          +   '<div class="dlr-call-bar">'
          +     '<div class="dlr-call-ava sm">' + _esc(_avatarBg(contact)) + '</div>'
          +     '<div class="dlr-call-meta"><span class="dlr-call-name sm">' + _esc(contact.name) + '</span>'
          +     '<span class="dlr-call-timer" id="dlr-call-timer">通話中 00:00</span></div>'
          +     '<button class="dlr-hang sm" id="dlr-hang2" type="button">掛斷</button>'
          +   '</div>'
          +   '<div class="dlr-call-body" id="dlr-call-body"></div>'
          + '</div>';
        // 計時
        let sec = 0;
        const tEl = _root.querySelector('#dlr-call-timer');
        _timer = setInterval(function () {
            sec++;
            if (tEl) tEl.textContent = '通話中 ' + String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
        }, 1000);
        _root.querySelector('#dlr-hang2').addEventListener('click', _renderList);

        // 對話區：接微信同一個人的對話（共用記憶）。wx app 掛進 body → openChat(該聯絡人)。
        // 之後若要更乾淨的「通話 UI」再抽 wx 的 AI/thread；先復用 wx 確保記憶相通。
        const body = _root.querySelector('#dlr-call-body');
        try {
            const mountWx = win.__PHONE_APPS && win.__PHONE_APPS['微信'];
            const wxApp = (win.parent && win.parent.wxApp) || win.wxApp;
            if (body && mountWx && wxApp && wxApp.openChat) {
                mountWx(body);
                wxApp.openChat(contact.id);
            } else if (body) {
                body.innerHTML = '<div class="dlr-call-hint">📞 已接通<br><span>對話接微信記憶（建置中）</span></div>';
            }
        } catch (e) {
            if (body) body.innerHTML = '<div class="dlr-call-hint">📞 已接通</div>';
        }
    }

    win.OS_DIALER = { launch: launch };
})();
