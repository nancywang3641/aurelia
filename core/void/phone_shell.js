// core/void/phone_shell.js
// 大廳「📱 手機殼」浮窗 —— 置中、一支手機造型外框 + app 切換。
// 一次顯示一個 app；點主畫面圖標進 app、底部 home bar / 返回鈕切回主畫面。
// 能吃容器的 app(微信/微薄/閱讀/RPG)直接渲染進手機螢幕；自開大面板的從手機啟動、開它自己的面板。
(function () {
    'use strict';
    const win = window;

    // mode: 'inside' = 渲染進手機螢幕(吃容器 div)；'out' = 開它自己的全屏面板(從手機啟動)
    const APPS = [
        { id: 'wx',     name: '微信', emoji: '💬',  mode: 'inside', go: function (c) { return win.__PHONE_APPS && win.__PHONE_APPS['微信'] && win.__PHONE_APPS['微信'](c); } },
        { id: 'wb',     name: '微薄', emoji: '👁️',  mode: 'inside', go: function (c) { return win.__PHONE_APPS && win.__PHONE_APPS['微博'] && win.__PHONE_APPS['微博'](c); } },
        // 🔮 塔羅已搬進廣場的占卜小屋（快轉地圖→占卜小屋→點紫薇→占卜）；手機不再重複開一個門。
        //    PWA 獨立版還是走手機那條（那邊沒有廣場），見 index.js / index.html 的 PhoneSystem.install。
        { id: 'rpg',    name: 'RPG',  emoji: '🛡️', mode: 'inside', go: function (c) { return win.RPG_PANEL && win.RPG_PANEL.launch && win.RPG_PANEL.launch(c); } },
        // 🏢 房產/家具已移出手機：合併成「房產手帳」獨立窗口（大廳右側 dock 的房產鈕）
        { id: 'reader', name: '閱讀', emoji: '📖',  mode: 'inside', go: function (c) {
            if (!win.VN_READER || !win.VN_READER.show) return;
            win.VN_READER.show(c);
            const x = document.getElementById('vn-reader-sa-close');
            if (x) x.onclick = _home;   // 統一返回：閱讀 ✕ → 回手機主畫面
        } },
        // 🏪 黑市已搬到 404 號房的柴郡身上（快轉地圖→404→點柴郡→黑市；立繪模式走前往→黑市）；手機不再重複開一個門。
        { id: 'settings', name: '樣式', emoji: '🖌️', mode: 'inside', go: function (c) { _renderSettings(c); } },
        { id: 'appstore', name: '應用商城', emoji: '🛒', mode: 'inside', go: function (c) { return win.APP_STORE && win.APP_STORE.launch && win.APP_STORE.launch(c); } },
        { id: 'ctrlroom', name: '控制室', emoji: '🎛️', mode: 'inside', go: function (c) { return win.OS_CONTROL_ROOM && win.OS_CONTROL_ROOM.launchApp && win.OS_CONTROL_ROOM.launchApp(c); } },
        // 🤖 AI 助手已移出手機：入口收攏成大廳 dock 的「宿舍」一顆（房間是獨立擴展，
        //    分兩個入口＝朋友沒裝時要顧兩處，而且以後住戶要站到舞台上也只該有一個門）。
    ];

    let _el = null;
    let _savedGoHome = null;   // app 內部「返回」會呼叫 PhoneSystem.goHome，開 app 時暫借、回主畫面/關閉時還原
    let _leaveApp = null;      // 需要善後的 app 離開時 → 存回呼，清空前先跑

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
    const _WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    function _tickClock() {
        if (!_el) return;
        const d = new Date();
        const hhmm = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
        const sb = _el.querySelector('#aps-sb-time');
        if (sb) sb.textContent = hhmm;
        const big = _el.querySelector('#aps-lock-time');
        if (big) big.textContent = hhmm;
        const date = _el.querySelector('#aps-lock-date');
        if (date) date.textContent = (d.getMonth() + 1) + '/' + d.getDate() + ' ' + _WEEK[d.getDay()];
    }

    // ── 今日心情：點一下換下一個，記在 localStorage ──────────────────────
    //   跟日期綁在一起：換一天就回到第一個，不然昨天挑的心情會一直掛在那。
    const MOODS = ['☀️', '⛅', '🌧️', '🌙', '✨', '🌸', '☕', '😴', '🔥', '🫧'];
    const MOOD_KEY = 'aurelia_phone_mood';
    function _todayKey() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
    function _loadMood() {
        try {
            const m = JSON.parse(win.localStorage.getItem(MOOD_KEY));
            if (m && m.day === _todayKey() && MOODS.indexOf(m.em) >= 0) return m.em;
        } catch (e) {}
        return MOODS[0];
    }
    function _saveMood(em) {
        try { win.localStorage.setItem(MOOD_KEY, JSON.stringify({ day: _todayKey(), em: em })); } catch (e) {}
    }
    function _paintMood() {
        if (!_el) return;
        const el = _el.querySelector('#aps-mood-em');
        if (el) el.textContent = _loadMood();
    }
    function _cycleMood() {
        const i = MOODS.indexOf(_loadMood());
        const next = MOODS[(i + 1) % MOODS.length];
        _saveMood(next);
        _paintMood();
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
    // 這排是系統字體：本機有就有、沒有就退回預設。要別的字體用下面那格自己填。
    const FONTS = [
        { name: '預設',  css: 'inherit' },
        { name: '思源宋', css: "'Noto Serif TC',serif" },
        { name: '優雅',  css: "'Playfair Display','Noto Serif TC',serif" },
        { name: '黑體',  css: "system-ui,'PingFang TC','Microsoft JhengHei',sans-serif" },
        { name: '等寬',  css: "'Courier New',monospace" },
    ];
    // 電腦裡裝好的字體：填名字就用，完全不連外、只有這台看得到。
    //   這個字串會直接進 CSS，所以走白名單不走黑名單——只留字體名真的會用到的字元
    //   （中日韓、英數、空格、- _ .）。黑名單剃引號分號還會漏掉 url( 這種，白名單一次擋完。
    function _fontCssFromName(name) {
        const clean = String(name || '')
            .replace(/[^\w一-鿿぀-ヿㇰ-ㇿ가-힯㐀-䶿 .\-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (!clean) return '';
        return "'" + clean + "',system-ui,sans-serif";
    }
    // 反查：目前存的字體是不是「自己填的」（不在上面清單裡）→ 是的話把名字挖回來填進輸入框
    function _customFontName(cssVal) {
        if (!cssVal || cssVal === 'inherit') return '';
        if (FONTS.some(function (f) { return f.css === cssVal; })) return '';
        const m = String(cssVal).match(/^'([^']+)'/);
        return m ? m[1] : '';
    }

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
          +   '<div class="aps-set-row"><input id="aps-set-fontname" class="aps-set-input" type="text" placeholder="或填你電腦裡的字體名，例如 微軟正黑體" value="' + _esc(_customFontName(t.font)) + '"><button id="aps-set-fontname-btn" class="aps-set-btn" type="button">套用</button></div>'
          +   '<div class="aps-set-subnote">先在電腦裡把字體<b>安裝好</b>再填它的名字。這條完全不連網，只有你這台看得到；換台電腦沒裝就會變回預設。留空＝改用上面那排。</div>'
          +   '<div class="aps-set-row"><button id="aps-set-reset" class="aps-set-btn ghost" type="button">還原全部預設</button></div>'
          +   '<div class="aps-set-note">字體會「硬套用」蓋掉所有 app(連寫死字體的也蓋)，只放過 fa 圖標不破壞。</div>'
          + '</div>';
        const back = c.querySelector('#aps-set-back'); if (back) back.addEventListener('click', _home);
        c.querySelectorAll('[data-k]').forEach(function (b) {
            b.addEventListener('click', function () { const p = {}; p[b.dataset.k] = b.dataset.css; _saveTheme(p); });
        });
        const wpBtn = c.querySelector('#aps-set-wpurl-btn');
        if (wpBtn) wpBtn.addEventListener('click', function () { const u = (c.querySelector('#aps-set-wpurl').value || '').trim(); _saveTheme({ wallpaper: u ? ('url(' + u + ') center/cover no-repeat') : '' }); });
        const fnBtn = c.querySelector('#aps-set-fontname-btn');
        if (fnBtn) fnBtn.addEventListener('click', function () {
            const css = _fontCssFromName(c.querySelector('#aps-set-fontname').value);
            _saveTheme({ font: css || 'inherit' });   // 清空＝退回預設，不然會卡在上一個自訂字體
        });
        const icfBtn = c.querySelector('#aps-set-icf-btn');
        if (icfBtn) icfBtn.addEventListener('click', function () { _saveIconFolder((c.querySelector('#aps-set-icfolder').value || '').trim()); });
        const reset = c.querySelector('#aps-set-reset');
        if (reset) reset.addEventListener('click', function () { try { win.localStorage.removeItem(THEME_KEY); } catch (e) {} _applyTheme(); _renderSettings(c); });
    }

    // ── 已安裝 app（app 商店裝的功能型 HTML app）──
    const INSTALLED_KEY = 'aurelia_phone_apps';   // 與 app_store.js 同 key：[{id,name,emoji,iconUrl}]
    function _loadInstalled() { try { return JSON.parse(win.localStorage.getItem(INSTALLED_KEY)) || []; } catch (e) { return []; } }
    function _saveInstalled(list) { try { win.localStorage.setItem(INSTALLED_KEY, JSON.stringify(list || [])); } catch (e) {} }
    function _cacheInstalled(meta) { try { var l = _loadInstalled().filter(function (m) { return m && m.id !== meta.id; }); l.push({ id: meta.id, name: meta.name || 'App', emoji: meta.emoji || '📦', iconUrl: meta.iconUrl || '' }); _saveInstalled(l); } catch (e) {} }

    // 使用者 app 啟動：點開才從 OS_DB 撈 HTML，丟給 AppRuntime 跑成 iframe
    function _userAppGo(id) {
        return function (container) {
            if (!container) return;
            try { var _o = JSON.parse(win.localStorage.getItem('aurelia_app_opened')) || {}; _o[id] = Date.now(); win.localStorage.setItem('aurelia_app_opened', JSON.stringify(_o)); } catch (e) {}   // 最近使用時間(給應用工坊顯示)
            container.innerHTML = '<div class="aps-loading">載入中…</div>';
            const dbp = (win.OS_DB && win.OS_DB.getPhoneApp) ? win.OS_DB.getPhoneApp(id) : Promise.resolve(null);
            Promise.resolve(dbp).then(function (rec) {
                if (!rec || !rec.html) { container.innerHTML = '<div class="aps-fail">app 內容遺失，請到應用商店重裝</div>'; return; }
                if (win.AppRuntime && win.AppRuntime.mountAppIframe) win.AppRuntime.mountAppIframe(container, rec.html, { preview: false, appId: rec.id || id, provider: rec.provider });
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
        // ① localStorage 快取（快、可能空）
        _loadInstalled().forEach(function (meta) {
            if (meta && meta.id && !APPS.find(function (a) { return a.id === meta.id; })) APPS.push(_makeUserApp(meta));
        });
        // ② 真來源 OS_DB（跟「我的應用」同源）：補回所有已建手機 app。
        //    修「重開後桌面圖標消失」根因——INSTALLED_KEY 之前從沒被 setItem 過、localStorage 永遠空，
        //    桌面圖標只靠 addApp 的 in-memory push（重開即丟）。改從 OS_DB 補回並回填快取。
        try {
            var dbp = (win.OS_DB && win.OS_DB.getAllPhoneApps) ? win.OS_DB.getAllPhoneApps() : null;
            if (dbp && dbp.then) {
                dbp.then(function (apps) {
                    var added = false;
                    (apps || []).forEach(function (rec) {
                        if (rec && rec.id && !APPS.find(function (a) { return a.id === rec.id; })) {
                            APPS.push(_makeUserApp(rec)); _cacheInstalled(rec); added = true;
                        }
                    });
                    if (added && _el) _renderGrid();
                }).catch(function () {});
            }
        } catch (e) {}
    }

    // ── 寫作工具（從舊「寫作頁」搬來，直接在手機殼螢幕內開）──────────────
    // launchFn(c) 把工具渲染進手機容器。返回鈕統一回手機主畫面：
    //   多數工具的返回鈕呼叫 PhoneSystem.goHome（_openApp 已暫改寫為 _home）→ 自動 OK；
    //   世界書(onclick="goHome()") / 創作室(自刪 os_studio_app) → 這裡補綁。
    function _mountTool(launchFn, c) {
        if (typeof launchFn !== 'function') { c.innerHTML = '<div class="aps-fail">工具尚未載入</div>'; return; }
        c.style.position = 'relative';   // 給自帶 absolute 版面的工具(創作室)當定位基準
        c.style.height = '100%';
        try { launchFn(c); }
        catch (e) { console.warn('[PhoneShell] 寫作工具掛載失敗', e); c.innerHTML = '<div class="aps-fail">這個工具載入失敗</div>'; return; }
        win.setTimeout(function () {
            c.querySelectorAll('.wb-back-btn,[onclick*="goHome"],#studio-back-btn').forEach(function (b) {
                b.removeAttribute('onclick');
                b.onclick = function (e) { if (e) { e.preventDefault(); e.stopPropagation(); } _home(); };
            });
        }, 250);
    }
    // 把寫作工具補進 APPS（世界書/提示詞原本就只有 standalone 版才有 → 只在 standalone 顯示）
    function _addWritingTools() {
        const standalone = !!document.getElementById('aurelia-standalone-root');
        const tools = [
            { id: 'sysset', name: '設置', emoji: '⚙️', mode: 'inside', go: function (c) { _mountTool(win.OS_SETTINGS && (win.OS_SETTINGS.launchApp || win.OS_SETTINGS.launch), c); } },
            { id: 'album',  name: '相簿',   emoji: '📷', mode: 'inside', go: function (c) { _mountTool(win.OS_SETTINGS && win.OS_SETTINGS.launchAlbum, c); } },
            { id: 'avsvar', name: '狀態檔案', emoji: '🎲', mode: 'inside', go: function (c) { _mountTool(win.OS_AVS && (win.OS_AVS.launchApp || win.OS_AVS.launch), c); } },
            // 創作室獨立 app 已移除：所有創作功能都從「應用商城」進(工坊首頁已內含 製作面板/主題/世界書/我的角色 等入口)
            { id: 'phone',  name: '電話',   emoji: '📞', mode: 'inside', go: function (c) { if (win.OS_DIALER && win.OS_DIALER.launch) { win.OS_DIALER.launch(c); } else { c.innerHTML = '<div class="aps-fail">📞 電話模組未載入</div>'; } } },
        ];
        if (standalone) {
            tools.push({ id: 'lorebook', name: '世界書', emoji: '📚', mode: 'inside', go: function (c) { _mountTool(win.OS_WORLDBOOK && (win.OS_WORLDBOOK.launchApp || win.OS_WORLDBOOK.launch), c); } });
            tools.push({ id: 'prompts',  name: '提示詞', emoji: '🎚️', mode: 'inside', go: function (c) { _mountTool(win.OS_PROMPTS && (win.OS_PROMPTS.launchApp || win.OS_PROMPTS.launch), c); } });
        }
        tools.forEach(function (t) { if (!APPS.find(function (a) { return a.id === t.id; })) APPS.push(t); });
    }
    // 底部 dock 固定 4 個：設置 / 樣式 / 相簿 / 電話（不重複進 grid）
    const DOCK_IDS = ['sysset', 'settings', 'album', 'phone'];
    function _renderDock() {
        if (!_el) return;
        const dockEl = _el.querySelector('.aps-dock');
        if (!dockEl) return;
        dockEl.innerHTML = DOCK_IDS.map(function (id) {
            const a = APPS.find(function (x) { return x.id === id; });
            if (!a) return '';
            return '<button class="aps-icon" data-app="' + a.id + '" type="button">'
                 + '<span class="aps-icon-em" data-app-em="' + a.id + '">' + a.emoji + '</span>'
                 + '<span class="aps-icon-name">' + _esc(a.name) + '</span></button>';
        }).join('');
        dockEl.querySelectorAll('.aps-icon').forEach(function (b) {
            b.addEventListener('click', function () { _openApp(b.dataset.app); });
        });
    }
    // 重畫主畫面圖標格（APPS 變動後呼叫）
    function _renderGrid() {
        if (!_el) return;
        const gridEl = _el.querySelector('.aps-grid');
        if (!gridEl) return;
        gridEl.innerHTML = APPS.filter(function (a) { return DOCK_IDS.indexOf(a.id) < 0; }).map(function (a) {
            return '<button class="aps-icon" data-app="' + a.id + '" type="button">'
                 + '<span class="aps-icon-em" data-app-em="' + a.id + '">' + a.emoji + '</span>'
                 + '<span class="aps-icon-name">' + _esc(a.name) + '</span></button>';
        }).join('');
        gridEl.querySelectorAll('.aps-icon').forEach(function (b) {
            b.addEventListener('click', function () { _openApp(b.dataset.app); });
        });
        _renderDock();
        _applyIcons();
    }
    // 對外：app 商店安裝/卸載時呼叫（只動 runtime 與圖標；持久化是商店的事）
    function addApp(meta) {
        if (!meta || !meta.id) return;
        if (!APPS.find(function (a) { return a.id === meta.id; })) APPS.push(_makeUserApp(meta));
        _cacheInstalled(meta);   // 持久化 meta（之前漏寫→重開桌面圖標消失）
        _renderGrid();
    }
    function removeApp(id) {
        const i = APPS.findIndex(function (a) { return a.id === id; });
        if (i >= 0) APPS.splice(i, 1);
        try { _saveInstalled(_loadInstalled().filter(function (m) { return m && m.id !== id; })); } catch (e) {}
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
          +     '<div class="aps-home" id="aps-home">'
          +       '<div class="aps-lock">'
          +         '<div class="aps-lock-time" id="aps-lock-time">--:--</div>'
          +         '<div class="aps-lock-date" id="aps-lock-date"></div>'
          +         '<button class="aps-mood" id="aps-mood" type="button" title="點一下換心情">今日心情：<span class="aps-mood-em" id="aps-mood-em">☀️</span></button>'
          +       '</div>'
          +       '<div class="aps-grid"></div><div class="aps-dock" id="aps-dock"></div></div>'
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
        _addWritingTools();        // 寫作工具（系統設置/變數工坊/創作室＋standalone:世界書/提示詞）
        _restoreInstalledApps();   // 從 localStorage 補回已安裝 app
        _renderGrid();             // 統一畫圖標格 + 綁定 + 套圖庫圖標
        const moodBtn = ov.querySelector('#aps-mood');
        if (moodBtn) moodBtn.addEventListener('click', _cycleMood);
        _paintMood();
        _tickClock();                                              // 先畫一次，別讓主畫面停在 --:--
        try { win.setInterval(_tickClock, 15000); } catch (e) {}   // 狀態列＋主畫面時鐘
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
        _paintMood();   // 心情是綁日期的，每次開都要重讀——只在 _build 畫一次的話跨日還掛著昨天那個
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
