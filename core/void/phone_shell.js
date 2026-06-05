// core/void/phone_shell.js
// 大廳「📱 手機殼」浮窗 —— 置中、一支手機造型外框 + app 切換。
// 一次顯示一個 app；點主畫面圖標進 app、底部 home bar / 返回鈕切回主畫面。
// 能吃容器的 app(微信/微薄/塔羅/RPG)直接渲染進手機螢幕；自開大面板的(閱讀/黑市)從手機啟動、開它自己的面板。
(function () {
    'use strict';
    const win = window;

    // mode: 'inside' = 渲染進手機螢幕(吃容器 div)；'out' = 開它自己的全屏面板(從手機啟動)
    const APPS = [
        { id: 'wx',     name: '微信', emoji: '💬',  mode: 'inside', go: function (c) { return win.__PHONE_APPS && win.__PHONE_APPS['微信'] && win.__PHONE_APPS['微信'](c); } },
        { id: 'wb',     name: '微薄', emoji: '👁️',  mode: 'inside', go: function (c) { return win.__PHONE_APPS && win.__PHONE_APPS['微博'] && win.__PHONE_APPS['微博'](c); } },
        { id: 'tarot',  name: '塔羅', emoji: '🔮',  mode: 'inside', go: function (c) { return win.OS_TAROT && win.OS_TAROT.launch && win.OS_TAROT.launch(c); } },
        { id: 'rpg',    name: 'RPG',  emoji: '🛡️', mode: 'inside', go: function (c) { return win.RPG_PANEL && win.RPG_PANEL.launch && win.RPG_PANEL.launch(c); } },
        { id: 'reader', name: '閱讀', emoji: '📖',  mode: 'inside', go: function (c) { return win.VN_READER && win.VN_READER.show && win.VN_READER.show(c); } },
        { id: 'store',  name: '黑市', emoji: '🏪',  mode: 'inside', go: function (c) {
            // 黑市用大廳單例 #store-panel-overlay(position:absolute)。搬進手機 + 強制填滿；
            // 回傳離開回呼：還原樣式 + 搬回大廳原位（不能讓手機清空時刪掉單例）。
            const ov = document.getElementById('store-panel-overlay');
            if (!ov || !c) return;
            const origParent = ov.parentElement;
            const force = { position: 'absolute', left: '0', top: '0', right: '0', bottom: '0', width: '100%', 'max-width': 'none', height: '100%', transform: 'none', 'border-radius': '0' };
            Object.keys(force).forEach(function (k) { ov.style.setProperty(k, force[k], 'important'); });
            c.appendChild(ov);
            if (win.VoidPanels && win.VoidPanels.openStore) win.VoidPanels.openStore();   // 渲染內容 + display:flex
            return function () {
                ov.style.display = 'none';
                Object.keys(force).forEach(function (k) { ov.style.removeProperty(k); });
                if (origParent) origParent.appendChild(ov);
            };
        } },
    ];

    let _el = null;
    let _savedGoHome = null;   // app 內部「返回」會呼叫 PhoneSystem.goHome，開 app 時暫借、回主畫面/關閉時還原
    let _leaveApp = null;      // 借用大廳單例面板的 app(如黑市)離開時要還原/搬回 → 存回呼，清空前先跑

    function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    function _restoreGoHome() {
        if (_savedGoHome !== null && win.PhoneSystem) { win.PhoneSystem.goHome = _savedGoHome; }
        _savedGoHome = null;
    }
    function _runLeave() { if (_leaveApp) { try { _leaveApp(); } catch (e) {} _leaveApp = null; } }

    function _build() {
        const ov = document.createElement('div');
        ov.id = 'aurelia-phone-shell';
        ov.className = 'aps-overlay';
        ov.style.display = 'none';
        const grid = APPS.map(function (a) {
            return '<button class="aps-icon" data-app="' + a.id + '" type="button">'
                 + '<span class="aps-icon-em">' + a.emoji + '</span>'
                 + '<span class="aps-icon-name">' + _esc(a.name) + '</span></button>';
        }).join('');
        // 手機殼不加自己的 header／返回 —— 用 app 原本的 header/返回（返回會呼叫 goHome→回主畫面）。
        // 只留底部 home bar + 右上 ✕ 當萬用退出。
        ov.innerHTML =
            '<div class="aps-frame">'
          +   '<div class="aps-notch"></div>'
          +   '<div class="aps-screen">'
          +     '<div class="aps-home" id="aps-home"><div class="aps-grid">' + grid + '</div></div>'
          +     '<div class="aps-app" id="aps-app"><div class="aps-app-body" id="aps-app-body"></div></div>'
          +   '</div>'
          +   '<div class="aps-homebar"><button class="aps-home-btn" id="aps-home-btn" type="button" title="回主畫面"></button></div>'
          +   '<button class="aps-close" id="aps-close" type="button" title="關閉">✕</button>'
          + '</div>';
        document.body.appendChild(ov);

        ov.addEventListener('click', function (e) { if (e.target === ov) close(); });   // 點背景關閉
        ov.querySelector('#aps-close').addEventListener('click', close);
        ov.querySelector('#aps-home-btn').addEventListener('click', _home);
        ov.querySelectorAll('.aps-icon').forEach(function (b) {
            b.addEventListener('click', function () { _openApp(b.dataset.app); });
        });
        _el = ov;
        return ov;
    }

    // 回手機主畫面（清空目前 app）
    function _home() {
        if (!_el) return;
        _runLeave();
        _restoreGoHome();
        const body = _el.querySelector('#aps-app-body');
        if (body) body.innerHTML = '';
        _el.querySelector('#aps-app').style.display = 'none';
        _el.querySelector('#aps-home').style.display = 'flex';
    }

    function _openApp(id) {
        const app = APPS.find(function (a) { return a.id === id; });
        if (!app || !_el) return;
        if (app.mode === 'out') {
            // 大面板：關掉手機殼、開它自己的全屏面板
            close();
            try { app.go(); } catch (e) { console.warn('[PhoneShell] 開啟失敗', id, e); }
            return;
        }
        // inside：渲染進手機螢幕
        _runLeave();   // 防禦：清空前先還原上一個借單例的 app
        const body = _el.querySelector('#aps-app-body');
        body.innerHTML = '';
        const div = document.createElement('div');
        div.className = 'aps-mount';
        body.appendChild(div);
        // app 內部「返回/home」按鈕原本呼叫 PhoneSystem.goHome → 暫時改成回手機主畫面
        if (win.PhoneSystem) { _savedGoHome = win.PhoneSystem.goHome; win.PhoneSystem.goHome = _home; }
        _el.querySelector('#aps-home').style.display = 'none';
        _el.querySelector('#aps-app').style.display = 'flex';
        try { const cleanup = app.go(div); if (typeof cleanup === 'function') _leaveApp = cleanup; }
        catch (e) { console.warn('[PhoneShell] 掛載失敗', id, e); body.innerHTML = '<div class="aps-fail">這個 app 載入失敗</div>'; }
    }

    function open() {
        const ov = _el || _build();
        _home();
        ov.style.display = 'flex';
    }
    function close() {
        if (!_el) return;
        _runLeave();
        _restoreGoHome();
        const body = _el.querySelector('#aps-app-body');
        if (body) body.innerHTML = '';
        _el.querySelector('#aps-app').style.display = 'none';
        _el.style.display = 'none';
    }
    function toggle() { if (_el && _el.style.display !== 'none') close(); else open(); }

    win.VoidPhoneShell = { open: open, close: close, toggle: toggle };
    console.log('✅ VoidPhoneShell（大廳手機殼浮窗）模組就緒');
})();
