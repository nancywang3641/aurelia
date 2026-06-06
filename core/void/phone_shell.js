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
        { id: 'reader', name: '閱讀', emoji: '📖',  mode: 'inside', go: function (c) {
            if (!win.VN_READER || !win.VN_READER.show) return;
            win.VN_READER.show(c);
            const x = document.getElementById('vn-reader-sa-close');
            if (x) x.onclick = _home;   // 統一返回：閱讀 ✕ → 回手機主畫面
        } },
        { id: 'store',  name: '黑市', emoji: '🏪',  mode: 'inside', go: function (c) {
            // 黑市用大廳單例 #store-panel-overlay。搬進手機(填滿靠 CSS)；回傳離開回呼搬回大廳原位
            // (不能讓手機清空時刪掉單例)。關閉鈕 rebind 成回主畫面、跟其他 app 統一。
            const ov = document.getElementById('store-panel-overlay');
            if (!ov || !c) return;
            const origParent = ov.parentElement;
            c.appendChild(ov);
            if (win.VoidPanels && win.VoidPanels.openStore) win.VoidPanels.openStore();   // 渲染內容 + display:flex
            const x = document.getElementById('store-close-btn');
            if (x) x.onclick = _home;   // 統一返回：黑市 ✕ → 回手機主畫面
            return function () {
                ov.style.display = 'none';
                if (origParent) origParent.appendChild(ov);
            };
        } },
        { id: 'settings', name: '設置', emoji: '⚙️', mode: 'inside', go: function (c) { _renderSettings(c); } },
        { id: 'appstore', name: '商店', emoji: '🛒', mode: 'inside', go: function (c) { return win.APP_STORE && win.APP_STORE.launch && win.APP_STORE.launch(c); } },
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

    // ── 手機主題（CSS 變數驅動，掛在 .aps-frame；app 不需知道主題的存在、自動相容）──
    const THEME_KEY = 'aurelia_phone_theme';
    // 可調項 → CSS 變數。加新可調項：這加一行 + 設置面板加個控制項，app 完全不用動。
    const THEME_VARS = {
        wallpaper:  '--aps-wallpaper',    // 主畫面背景（漸層 / 純色 / url(...)）
        iconBg:     '--aps-icon-bg',      // app 圖標容器底色
        iconRadius: '--aps-icon-radius',  // 圖標圓角
        labelColor: '--aps-label-color',  // 圖標文字色
        sbColor:    '--aps-sb-color',     // 狀態列文字色
        font:       '--aps-font',         // 字體
    };
    function _loadTheme() { try { return JSON.parse(win.localStorage.getItem(THEME_KEY)) || {}; } catch (e) { return {}; } }
    function _saveTheme(patch) {
        const t = Object.assign(_loadTheme(), patch);
        Object.keys(patch).forEach(function (k) { if (patch[k] === '' || patch[k] == null) delete t[k]; });   // 空 = 還原預設
        win.localStorage.setItem(THEME_KEY, JSON.stringify(t));
        _applyTheme();
    }
    function _applyTheme() {
        if (!_el) return;
        const frame = _el.querySelector('.aps-frame');
        if (!frame) return;
        const t = _loadTheme();
        Object.keys(THEME_VARS).forEach(function (k) {
            if (t[k]) frame.style.setProperty(THEME_VARS[k], t[k]);
            else frame.style.removeProperty(THEME_VARS[k]);   // 沒設 = 用 CSS 預設
        });
        // 字體「硬套用」：有設且非預設 → 加 class，CSS 用 !important 蓋掉所有 app(連寫死的)、只放過 fa 圖標
        frame.classList.toggle('aps-font-on', !!(t.font && t.font !== 'inherit'));
        _applyIcons();
    }

    // icon pack（VN 素材式）：給一個圖庫資料夾網址，每個 app 自動抓 <資料夾>/<代號>.png
    // (試 .png/.webp/.jpg；<代號> 抓不到時也試中文名)。全抓不到 → 維持 emoji 預設。
    const _ICON_EXTS = ['png', 'webp', 'jpg'];
    function _applyIcons() {
        if (!_el) return;
        const folder = (_loadTheme().iconFolder || '').trim();
        const base = folder ? (folder.replace(/\/+$/, '') + '/') : '';
        _el.querySelectorAll('.aps-icon-em[data-app-em]').forEach(function (em) {
            em.style.backgroundImage = ''; em.classList.remove('aps-icon-img');   // 先還原 emoji
            if (!base) return;
            const id = em.dataset.appEm;
            const app = APPS.find(function (a) { return a.id === id; });
            const names = app ? [id, app.name] : [id];
            const cands = [];
            names.forEach(function (n) { _ICON_EXTS.forEach(function (e) { cands.push(base + encodeURIComponent(n) + '.' + e); }); });
            (function tryNext(i) {
                if (i >= cands.length) return;   // 全失敗 → 維持 emoji
                const img = new Image();
                img.onload = function () { em.style.backgroundImage = 'url("' + cands[i] + '")'; em.classList.add('aps-icon-img'); };
                img.onerror = function () { tryNext(i + 1); };
                img.src = cands[i];
            })(0);
        });
    }
    function _saveIconFolder(v) {
        const t = _loadTheme();
        if (v) t.iconFolder = v; else delete t.iconFolder;
        win.localStorage.setItem(THEME_KEY, JSON.stringify(t));
        _applyTheme();
    }

    // ── 狀態列時鐘 ──
    function _tickClock() {
        if (!_el) return;
        const el = _el.querySelector('#aps-sb-time');
        if (!el) return;
        const d = new Date();
        el.textContent = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    }

    // ── 設置 app：手機主題（先做背景；圖標/字體之後照同模式加，零衝突）──
    const WALLPAPERS = [
        { name: '夜墨', css: 'linear-gradient(160deg,#2b2d42,#4a4e69)' },
        { name: '抹茶', css: 'linear-gradient(160deg,#a8c66c,#7d9a4f)' },
        { name: '奶橘', css: 'linear-gradient(160deg,#f6d365,#fda085)' },
        { name: '霧紫', css: 'linear-gradient(160deg,#a18cd1,#fbc2eb)' },
        { name: '海藍', css: 'linear-gradient(160deg,#4facfe,#00f2fe)' },
        { name: '純白', css: '#eef0f6' },
    ];
    const FONTS = [
        { name: '預設',  css: 'inherit' },
        { name: '思源宋', css: "'Noto Serif TC',serif" },
        { name: '優雅',  css: "'Playfair Display','Noto Serif TC',serif" },
        { name: '黑體',  css: "system-ui,'PingFang TC','Microsoft JhengHei',sans-serif" },
        { name: '等寬',  css: "'Courier New',monospace" },
    ];
    function _urlOf(v) { return (v && String(v).indexOf('url(') === 0) ? String(v).slice(4).split(')')[0] : ''; }
    function _renderSettings(c) {
        const t = _loadTheme();
        const sw = function (arr, key) { return arr.map(function (w) { return '<button class="aps-set-sw" data-k="' + key + '" data-css="' + _esc(w.css) + '" type="button" style="background:' + w.css + '"><span>' + _esc(w.name) + '</span></button>'; }).join(''); };
        const ftCh = FONTS.map(function (f) { return '<button class="aps-set-chip" data-k="font" data-css="' + _esc(f.css) + '" type="button" style="font-family:' + f.css + '">' + _esc(f.name) + '</button>'; }).join('');
        const icHintRows = APPS.map(function (a) {
            return '<div class="aps-set-icrow">'
                 + '<span class="aps-set-icprev">' + a.emoji + '</span>'
                 + '<span class="aps-set-icname">' + _esc(a.name) + '</span>'
                 + '<span class="aps-set-ichint">' + a.id + '.png</span>'
                 + '</div>';
        }).join('');
        c.innerHTML =
            '<div class="aps-set">'
          +   '<div class="aps-set-top"><button class="aps-set-back" id="aps-set-back" type="button" title="返回">‹</button><span class="aps-set-h">手機設置</span></div>'
          +   '<div class="aps-set-sec">背景</div><div class="aps-set-swgrid">' + sw(WALLPAPERS, 'wallpaper') + '</div>'
          +   '<div class="aps-set-row"><input id="aps-set-wpurl" class="aps-set-input" type="text" placeholder="或貼背景圖網址 https://..." value="' + _esc(_urlOf(t.wallpaper)) + '"><button id="aps-set-wpurl-btn" class="aps-set-btn" type="button">套用</button></div>'
          +   '<div class="aps-set-sec">APP 圖標（一個圖庫資料夾、自動對名）</div>'
          +   '<div class="aps-set-row"><input id="aps-set-icfolder" class="aps-set-input" type="text" placeholder="圖庫資料夾網址 https://.../icons/" value="' + _esc(t.iconFolder || '') + '"><button id="aps-set-icf-btn" class="aps-set-btn" type="button">套用</button></div>'
          +   '<div class="aps-set-subnote">把圖放進這資料夾、用下方代號當檔名(.png/.webp/.jpg 都行)。建議<b>正方形、120×120px 以上</b>(顯示成圓角方塊、會裁切，太小會糊)；沒放的自動用預設符號：</div>'
          +   '<div class="aps-set-iclist">' + icHintRows + '</div>'
          +   '<div class="aps-set-sec">字體（套用到所有 app）</div><div class="aps-set-chips">' + ftCh + '</div>'
          +   '<div class="aps-set-row"><button id="aps-set-reset" class="aps-set-btn ghost" type="button">還原全部預設</button></div>'
          +   '<div class="aps-set-note">字體會「硬套用」蓋掉所有 app(連寫死字體的也蓋)，只放過 fa 圖標不破壞。</div>'
          + '</div>';
        const back = c.querySelector('#aps-set-back'); if (back) back.addEventListener('click', _home);
        c.querySelectorAll('[data-k]').forEach(function (b) {
            b.addEventListener('click', function () { const p = {}; p[b.dataset.k] = b.dataset.css; _saveTheme(p); });
        });
        const wpBtn = c.querySelector('#aps-set-wpurl-btn');
        if (wpBtn) wpBtn.addEventListener('click', function () { const u = (c.querySelector('#aps-set-wpurl').value || '').trim(); _saveTheme({ wallpaper: u ? ('url(' + u + ') center/cover no-repeat') : '' }); });
        const icfBtn = c.querySelector('#aps-set-icf-btn');
        if (icfBtn) icfBtn.addEventListener('click', function () { _saveIconFolder((c.querySelector('#aps-set-icfolder').value || '').trim()); });
        const reset = c.querySelector('#aps-set-reset');
        if (reset) reset.addEventListener('click', function () { try { win.localStorage.removeItem(THEME_KEY); } catch (e) {} _applyTheme(); _renderSettings(c); });
    }

    // ── 已安裝 app（app 商店裝的功能型 HTML app）──
    const INSTALLED_KEY = 'aurelia_phone_apps';   // 與 app_store.js 同 key：[{id,name,emoji,iconUrl}]
    function _loadInstalled() { try { return JSON.parse(win.localStorage.getItem(INSTALLED_KEY)) || []; } catch (e) { return []; } }

    // 使用者 app 啟動：點開才從 OS_DB 撈 HTML，丟給 AppRuntime 跑成 iframe
    function _userAppGo(id) {
        return function (container) {
            if (!container) return;
            container.innerHTML = '<div class="aps-loading">載入中…</div>';
            const dbp = (win.OS_DB && win.OS_DB.getPhoneApp) ? win.OS_DB.getPhoneApp(id) : Promise.resolve(null);
            Promise.resolve(dbp).then(function (rec) {
                if (!rec || !rec.html) { container.innerHTML = '<div class="aps-fail">app 內容遺失，請到應用商店重裝</div>'; return; }
                if (win.AppRuntime && win.AppRuntime.mountAppIframe) win.AppRuntime.mountAppIframe(container, rec.html, { preview: false });
                else container.innerHTML = '<div class="aps-fail">app 執行器未載入</div>';
            }).catch(function () { container.innerHTML = '<div class="aps-fail">app 載入失敗</div>'; });
            // iframe 由 _home 清空容器時一併移除，無需回傳 cleanup
        };
    }
    function _makeUserApp(meta) {
        return { id: meta.id, name: meta.name || 'App', emoji: meta.emoji || '📦', iconUrl: meta.iconUrl || '', mode: 'inside', go: _userAppGo(meta.id) };
    }
    // 首次建殼/開機：從 localStorage 把已安裝 app 補回 APPS（去重）
    function _restoreInstalledApps() {
        _loadInstalled().forEach(function (meta) {
            if (meta && meta.id && !APPS.find(function (a) { return a.id === meta.id; })) APPS.push(_makeUserApp(meta));
        });
    }
    // 重畫主畫面圖標格（APPS 變動後呼叫）
    function _renderGrid() {
        if (!_el) return;
        const gridEl = _el.querySelector('.aps-grid');
        if (!gridEl) return;
        gridEl.innerHTML = APPS.map(function (a) {
            return '<button class="aps-icon" data-app="' + a.id + '" type="button">'
                 + '<span class="aps-icon-em" data-app-em="' + a.id + '">' + a.emoji + '</span>'
                 + '<span class="aps-icon-name">' + _esc(a.name) + '</span></button>';
        }).join('');
        gridEl.querySelectorAll('.aps-icon').forEach(function (b) {
            b.addEventListener('click', function () { _openApp(b.dataset.app); });
        });
        _applyIcons();
    }
    // 對外：app 商店安裝/卸載時呼叫（只動 runtime 與圖標；持久化是商店的事）
    function addApp(meta) {
        if (!meta || !meta.id) return;
        if (!APPS.find(function (a) { return a.id === meta.id; })) APPS.push(_makeUserApp(meta));
        _renderGrid();
    }
    function removeApp(id) {
        const i = APPS.findIndex(function (a) { return a.id === id; });
        if (i >= 0) APPS.splice(i, 1);
        _renderGrid();
    }

    function _build() {
        const ov = document.createElement('div');
        ov.id = 'aurelia-phone-shell';
        ov.className = 'aps-overlay';
        ov.style.display = 'none';
        // 手機殼不加自己的 header／返回 —— 用 app 原本的 header/返回（返回會呼叫 goHome→回主畫面）。
        // 只留底部 home bar + 右上 ✕ 當萬用退出。
        ov.innerHTML =
            '<div class="aps-frame">'
          +   '<div class="aps-notch"></div>'
          +   '<div class="aps-screen">'
          +     '<div class="aps-statusbar"><span class="aps-sb-time" id="aps-sb-time">--:--</span><span class="aps-sb-icons"><i class="fa-solid fa-signal"></i><i class="fa-solid fa-wifi"></i><i class="fa-solid fa-battery-full"></i></span></div>'
          +     '<div class="aps-home" id="aps-home"><div class="aps-grid"></div></div>'
          +     '<div class="aps-app" id="aps-app"><div class="aps-app-body" id="aps-app-body"></div></div>'
          +   '</div>'
          +   '<div class="aps-homebar"><button class="aps-home-btn" id="aps-home-btn" type="button" title="回主畫面"></button></div>'
          +   '<button class="aps-close" id="aps-close" type="button" title="關閉">✕</button>'
          + '</div>';
        document.body.appendChild(ov);

        ov.addEventListener('click', function (e) { if (e.target === ov) close(); });   // 點背景關閉
        ov.querySelector('#aps-close').addEventListener('click', close);
        ov.querySelector('#aps-home-btn').addEventListener('click', _home);
        _el = ov;
        _restoreInstalledApps();   // 從 localStorage 補回已安裝 app
        _renderGrid();             // 統一畫圖標格 + 綁定 + 套圖庫圖標
        try { win.setInterval(_tickClock, 15000); } catch (e) {}   // 狀態列時鐘
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
        _applyTheme();
        _tickClock();
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

    win.VoidPhoneShell = { open: open, close: close, toggle: toggle, addApp: addApp, removeApp: removeApp, home: _home };
    console.log('✅ VoidPhoneShell（大廳手機殼浮窗）模組就緒');
})();
