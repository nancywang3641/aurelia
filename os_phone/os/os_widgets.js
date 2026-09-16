// 🧩 主畫面組件（widget）
//
// 跟應用平行的一套東西：應用是「點開來用」的，組件是「放在那裡看」的。
// 一份組件＝一個大小＋一塊畫面，做好存起來、裝到主畫面、拿掉、拖著換位置。
//
// 🚨 組件跟圖標住同一個格子、記在同一份排列裡（phone_shell 的 layout.grid）。
//    所以長按編輯、拖拉換位、左上角減號移除那一整套完全不用重寫，組件天生就會。
//    組件只是「比較寬、比較高的一格」而已。
//
// 大小只有三種，照桌面小工具的通例。主畫面是三欄：
//    小 s ＝ 兩欄寬，寬 w ＝ 整排，大 l ＝ 整排而且高一倍。
//
// 內建那幾個（拍立得、時鐘、日曆）以前是焊死在主畫面 HTML 裡的一塊，
//    現在跟自己做的組件走同一條路：可以拿掉、可以換位置，設定就在組件自己身上
//    ——拍立得的照片點它自己就能換，不必再跑一趟樣式面板。
(function () {
    'use strict';
    const win = window.parent || window;

    const STORE_KEY = 'aurelia_widgets';        // 她自己做的那些：[{id,name,size,html,...}]
    const CFG_KEY   = 'aurelia_widget_cfg';     // 每個組件自己的設定（例如拍立得那張照片）
    const ID_RE     = /^wdg_/;                  // 排列清單裡靠這個認出「這格是組件不是圖標」

    // 三種大小。cols＝佔幾欄（主畫面共三欄），rows＝高度相當於幾排圖標。
    const SIZES = {
        s: { cols: 2, rows: 2, name: '小' },
        w: { cols: 3, rows: 2, name: '寬' },
        l: { cols: 3, rows: 3, name: '大' }
    };
    function sizeOf(w) { return SIZES[(w && w.size) || 's'] || SIZES.s; }

    function _esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ── 存取 ────────────────────────────────────────────────────────────
    function _loadMine() { try { return JSON.parse(win.localStorage.getItem(STORE_KEY)) || []; } catch (e) { return []; } }
    function _saveMine(list) { try { win.localStorage.setItem(STORE_KEY, JSON.stringify(list || [])); } catch (e) {} }
    function _loadCfg() { try { return JSON.parse(win.localStorage.getItem(CFG_KEY)) || {}; } catch (e) { return {}; } }
    function _saveCfg(m) { try { win.localStorage.setItem(CFG_KEY, JSON.stringify(m || {})); } catch (e) {} }
    function cfgOf(id) { return _loadCfg()[id] || {}; }
    function setCfg(id, patch) {
        const m = _loadCfg();
        m[id] = Object.assign({}, m[id] || {}, patch || {});
        _saveCfg(m);
    }

    // ── 內建組件 ────────────────────────────────────────────────────────
    //   畫面各自用 paint() 重畫（時鐘要走秒、拍立得跟著今天的心情變），
    //   tap() 是點下去做什麼（不是編輯模式的時候才會走到）。
    const BUILTIN = [
        {
            // 🚨 bare＝不要外面那層圓角卡片。拍立得本來就是一張相紙：直角、有紙膠帶、
            //    微微歪一點、底下一行手寫字。套上通用卡片殼就變成一塊圓角方卡片，那不是拍立得。
            id: 'wdg_polaroid', name: '拍立得', size: 's', builtin: true, bare: true,
            hint: '點一下寫今天那句話，長按可以換照片',
            html: function (w) {
                const url = _photoUrl();
                // 沒放照片就露出程式自己畫的那張風景（四塊顏色來自主題，換皮會跟著變）
                return '<div class="aps-w-pol">'
                     +   '<div class="aps-w-pol-ph">'
                     +     (url ? '<img class="aps-w-pol-img" src="' + _esc(url) + '" alt="">'
                               : '<span class="aps-w-pol-sun"></span><span class="aps-w-pol-hill"></span><span class="aps-w-pol-hill aps-w-pol-hill2"></span><span class="aps-w-pol-sea"></span>')
                     +   '</div>'
                     +   '<div class="aps-w-pol-cap"><span data-w-mood></span><time data-w-date></time></div>'
                     + '</div>';
            },
            paint: function (el, w) {
                const mood = el.querySelector('[data-w-mood]');
                const date = el.querySelector('[data-w-date]');
                if (mood) mood.textContent = _moodText();
                if (date) date.textContent = _dateText();
            },
            tap: function (el, w) { _editMoodText(); },
            // 長按進編輯模式之後，這顆組件自己的設定：照片換在這裡（她的原話：組件上就可以上傳）
            settings: async function (w) { await _askPhoto(w); }
        },
        {
            id: 'wdg_clock', name: '時鐘', size: 's', builtin: true,
            hint: '現在幾點',
            html: function () {
                return '<div class="aps-w-clock">'
                     +   '<div class="aps-w-clock-t" data-w-time>--:--</div>'
                     +   '<div class="aps-w-clock-d" data-w-day></div>'
                     + '</div>';
            },
            paint: function (el) {
                const d = new Date();
                const t = el.querySelector('[data-w-time]');
                const dd = el.querySelector('[data-w-day]');
                if (t) t.textContent = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
                if (dd) dd.textContent = _dateText() + '　' + '日一二三四五六'.charAt(d.getDay());
            }
        },
        {
            id: 'wdg_note', name: '便條', size: 'w', builtin: true,
            hint: '點一下寫下來，寫什麼都行',
            html: function (w) {
                const t = String(cfgOf(w.id).text || '').trim();
                return '<div class="aps-w-note">'
                     +   (t ? '<p class="aps-w-note-tx">' + _esc(t).replace(/\n/g, '<br>') + '</p>'
                            : '<p class="aps-w-note-tx aps-w-note-empty">還沒寫東西</p>')
                     + '</div>';
            },
            tap: async function (el, w) {
                const A = win.AUI || window.AUI;
                if (!A || !A.prompt) return;
                const v = await A.prompt('想寫什麼？', String(cfgOf(w.id).text || ''), {
                    title: '便條', multiline: true, okText: '寫上去', hint: '留空就清掉。'
                });
                if (v === null) return;
                setCfg(w.id, { text: String(v).trim() });
                repaintAll();
            }
        }
    ];

    // ── 內建那幾個共用的小東西（跟主畫面的心情是同一份資料，不另存一份）────
    const MOOD_KEY = 'aurelia_phone_mood';
    const MOOD_WORDS = ['今天是晴天', '有點多雲', '下雨的一天', '安靜的夜', '亮晶晶的一天',
                        '喘口氣', '配一杯咖啡', '想睡', '整個燒起來', '泡泡一樣輕'];
    const MOODS = ['☀️', '⛅', '🌧️', '🌙', '✨', '🌸', '☕', '😴', '🔥', '🫧'];
    function _todayKey() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
    function _moodRec() { try { return JSON.parse(win.localStorage.getItem(MOOD_KEY)) || {}; } catch (e) { return {}; } }
    function _moodText() {
        const m = _moodRec();
        if (m.day === _todayKey() && typeof m.text === 'string' && m.text) return m.text;
        const i = Math.max(0, MOODS.indexOf(m.day === _todayKey() ? m.em : MOODS[0]));
        return MOOD_WORDS[i];
    }
    function _dateText() {
        const d = new Date();
        return d.getFullYear() + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '.' + ('0' + d.getDate()).slice(-2);
    }
    async function _editMoodText() {
        const A = win.AUI || window.AUI;
        if (!A || !A.prompt) return;
        const m = _moodRec();
        const cur = (m.day === _todayKey() && typeof m.text === 'string') ? m.text : '';
        const i = Math.max(0, MOODS.indexOf(m.day === _todayKey() ? m.em : MOODS[0]));
        const v = await A.prompt('今天想寫什麼？', cur, {
            title: '拍立得', placeholder: MOOD_WORDS[i], hint: '留空就回到今天的心情那句。', okText: '寫上去'
        });
        if (v === null) return;
        try {
            win.localStorage.setItem(MOOD_KEY, JSON.stringify({
                day: _todayKey(), em: (m.day === _todayKey() && m.em) || MOODS[0], text: String(v).trim()
            }));
        } catch (e) {}
        repaintAll();
        try { if (win.VoidPhoneShell && win.VoidPhoneShell.repaintMood) win.VoidPhoneShell.repaintMood(); } catch (e) {}
    }
    // 📷 換照片：她的原話「拍立得照片在樣式面板上傳很煩人，我想要的是組件上就可以上傳」。
    //   🚨 樣式面板那個入口留著（她原本就在用），但兩邊讀寫「同一份」資料 ——
    //   各存一份的話，同一張拍立得在兩個地方會是兩張照片。
    function _photoUrl() {
        try { return String(win.VoidPhoneShell.polaroidPhoto() || '').trim(); } catch (e) { return ''; }
    }
    async function _askPhoto(w) {
        const A = win.AUI || window.AUI;
        if (!A || !A.prompt) return;
        const v = await A.prompt('照片網址', _photoUrl(), {
            title: '拍立得的照片', okText: '換上去',
            hint: '留空就回到程式自己畫的那張風景。樣式面板裡換的是同一張。'
        });
        if (v === null) return;
        try { win.VoidPhoneShell.setPolaroidPhoto(String(v).trim()); } catch (e) {}
        repaintAll();
    }

    // ── 名冊 ────────────────────────────────────────────────────────────
    function all() {
        const mine = _loadMine().map(function (m) {
            return { id: m.id, name: m.name || '組件', size: m.size || 's', html: m.html || '', hint: m.hint || '' };
        });
        return BUILTIN.concat(mine);
    }
    function get(id) { return all().find(function (w) { return w.id === id; }) || null; }
    function isWidgetId(id) { return ID_RE.test(String(id || '')); }

    // ── 畫出來 ──────────────────────────────────────────────────────────
    //   外層那顆殼由主畫面負責（它要掛 data-app 才吃得到既有的拖拉與移除）。
    //   這裡只回「殼裡面」那塊。
    function innerHTML(w) {
        if (!w) return '';
        if (typeof w.html === 'function') return w.html(w);
        // 她自己做的：一段 HTML。組件很小，不給它 script —— 要跑程式的東西做成應用。
        return '<div class="aps-w-user">' + String(w.html || '') + '</div>';
    }
    // 掛上去之後要動的部分（時鐘走分針、拍立得跟著今天那句話變）
    function paint(el, w) {
        if (!el || !w) return;
        try { if (typeof w.paint === 'function') w.paint(el, w); } catch (e) {}
    }
    function repaintAll() {
        try { if (win.VoidPhoneShell && win.VoidPhoneShell.renderHome) win.VoidPhoneShell.renderHome(); } catch (e) {}
    }
    // 點下去（不是編輯模式時）。沒有 tap 的組件點了不做事，不要亂跳。
    function tap(el, w) {
        if (!w || typeof w.tap !== 'function') return false;
        try { w.tap(el, w); } catch (e) { console.warn('[組件] 點擊出錯:', e); }
        return true;
    }
    // 這顆組件自己的設定（編輯模式下那顆齒輪）。沒有就回 false，主畫面不畫那顆。
    function hasSettings(w) { return !!(w && typeof w.settings === 'function'); }
    function openSettings(w) {
        if (!hasSettings(w)) return;
        try { w.settings(w); } catch (e) { console.warn('[組件] 設定開不起來:', e); }
    }

    // ── 她自己做的：新增／改／刪 ────────────────────────────────────────
    function newId() { return 'wdg_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7); }
    function save(meta) {
        if (!meta) return null;
        const list = _loadMine();
        const rec = {
            id: meta.id && isWidgetId(meta.id) && !_isBuiltin(meta.id) ? meta.id : newId(),
            name: String(meta.name || '組件').slice(0, 20),
            size: SIZES[meta.size] ? meta.size : 's',
            html: String(meta.html || ''),
            hint: String(meta.hint || '')
        };
        const i = list.findIndex(function (x) { return x && x.id === rec.id; });
        if (i >= 0) list[i] = rec; else list.push(rec);
        _saveMine(list);
        repaintAll();
        return rec;
    }
    function _isBuiltin(id) { return BUILTIN.some(function (w) { return w.id === id; }); }
    function remove(id) {
        if (_isBuiltin(id)) return false;            // 內建的只能從桌面拿掉，不能刪
        _saveMine(_loadMine().filter(function (x) { return x && x.id !== id; }));
        const m = _loadCfg(); delete m[id]; _saveCfg(m);
        try { if (win.VoidPhoneShell && win.VoidPhoneShell.hideWidget) win.VoidPhoneShell.hideWidget(id); } catch (e) {}
        return true;
    }
    function setSize(id, size) {
        if (!SIZES[size]) return false;
        if (_isBuiltin(id)) { setCfg(id, { size: size }); repaintAll(); return true; }
        const list = _loadMine();
        const r = list.find(function (x) { return x && x.id === id; });
        if (!r) return false;
        r.size = size; _saveMine(list); repaintAll();
        return true;
    }
    // 內建的大小也讓她改 → 讀的時候要把她改過的蓋上去
    function sizeKeyOf(w) {
        if (!w) return 's';
        const c = cfgOf(w.id);
        return SIZES[c.size] ? c.size : (SIZES[w.size] ? w.size : 's');
    }

    // ══ 🧩 「組件」那一頁 ══════════════════════════════════════════════
    //   跟應用商城同一個家族的長相（沿用它那套樣式），做的事對應過來：
    //   商城是「拿到一個應用、裝到桌面」，這裡是「做一個組件、放到主畫面」。
    function _shellHome() {
        if (win.PhoneSystem && win.PhoneSystem.goHome) win.PhoneSystem.goHome();
        else if (win.VoidPhoneShell && win.VoidPhoneShell.home) win.VoidPhoneShell.home();
    }
    function _onHome(id) {
        try { return (win.VoidPhoneShell.homeWidgetIds() || []).indexOf(id) >= 0; } catch (e) { return false; }
    }
    function _sizeBtns(w) {
        const cur = sizeKeyOf(w);
        return Object.keys(SIZES).map(function (k) {
            return '<button class="wg-sz' + (k === cur ? ' wg-sz-on' : '') + '" data-wg-size="' + k
                 + '" data-wg-id="' + w.id + '" type="button">' + SIZES[k].name + '</button>';
        }).join('');
    }
    function _row(w) {
        const on = _onHome(w.id);
        return '<div class="wg-row">'
             +   '<div class="wg-row-tx">'
             +     '<div class="wg-row-t">' + _esc(w.name) + (_isBuiltin(w.id) ? '<span class="wg-tag">內建</span>' : '') + '</div>'
             +     (w.hint ? '<div class="wg-row-d">' + _esc(w.hint) + '</div>' : '')
             +     '<div class="wg-szs">' + _sizeBtns(w) + '</div>'
             +   '</div>'
             +   '<div class="wg-row-go">'
             +     '<button class="wg-put' + (on ? ' wg-put-on' : '') + '" data-wg-put="' + w.id + '" type="button">'
             +       '<i class="fa-solid ' + (on ? 'fa-check' : 'fa-plus') + '"></i>'
             +       '<span>' + (on ? '在主畫面上' : '放到主畫面') + '</span>'
             +     '</button>'
             +     (_isBuiltin(w.id) ? '' : '<button class="wg-del" data-wg-del="' + w.id + '" type="button" title="刪掉這個組件"><i class="fa-solid fa-trash"></i></button>')
             +   '</div>'
             + '</div>';
    }
    function _listHTML() {
        const list = all();
        if (!list.length) return '<div class="wg-empty">還沒有任何組件。</div>';
        return list.map(_row).join('');
    }
    function _pageHTML() {
        return '<div class="ws-app wg-app">'
             + '<div class="ws-view active" data-view="home">'
             +   '<div class="ws-home-hd">'
             +     '<button class="ws-back ws-home-back" type="button" title="回主畫面"><i class="fa-solid fa-chevron-left"></i></button>'
             +     '<div class="ws-home-hd-tx">'
             +       '<div class="ws-home-title">組件</div>'
             +       '<div class="ws-home-sub">放在主畫面上、不用點開就看得到的那些小東西</div>'
             +     '</div>'
             +   '</div>'
             +   '<button class="ws-card" data-wg-new="paste" type="button">'
             +     '<span class="wg-card-ic"><i class="fa-solid fa-code"></i></span>'
             +     '<span class="ws-card-tx"><span class="ws-card-t">貼一個現成的</span>'
             +       '<span class="ws-card-d">把做好的一小塊畫面貼進來，取個名字就能放上主畫面</span></span>'
             +     '<span class="ws-card-go"><i class="fa-solid fa-chevron-right"></i></span>'
             +   '</button>'
             +   '<button class="ws-card" data-wg-new="studio" type="button">'
             +     '<span class="wg-card-ic"><i class="fa-solid fa-wand-magic-sparkles"></i></span>'
             +     '<span class="ws-card-tx"><span class="ws-card-t">開創作室做一個</span>'
             +       '<span class="ws-card-d">講一句話讓它畫出來，做好回這裡貼上</span></span>'
             +     '<span class="ws-card-go"><i class="fa-solid fa-chevron-right"></i></span>'
             +   '</button>'
             +   '<div class="wg-sec">全部組件</div>'
             +   '<div class="wg-list" data-wg-list>' + _listHTML() + '</div>'
             + '</div></div>';
    }
    function _repaintPage(c) {
        const box = c.querySelector('[data-wg-list]');
        if (box) box.innerHTML = _listHTML();
    }
    async function _newByPaste(c) {
        const A = win.AUI || window.AUI;
        if (!A || !A.prompt) return;
        const name = await A.prompt('這個組件叫什麼？', '', { title: '新組件', okText: '下一步' });
        if (name === null) return;
        const html = await A.prompt('把那一小塊畫面貼進來', '', {
            title: '新組件', multiline: true, okText: '建立',
            hint: '一小段畫面就好。要跑程式的東西請做成應用，組件只負責顯示。'
        });
        if (html === null || !String(html).trim()) return;
        const rec = save({ name: String(name).trim() || '組件', html: String(html), size: 's' });
        if (rec) {
            try { win.VoidPhoneShell.unhideWidget(rec.id); } catch (e) {}   // 做好就直接上主畫面（跟裝應用一樣）
            _repaintPage(c);
            try { AUI.toast('「' + rec.name + '」已經放上主畫面'); } catch (e) {}
        }
    }
    function launch(c) {
        if (!c) return;
        c.innerHTML = _pageHTML();
        const back = c.querySelector('.ws-home-back');
        if (back) back.addEventListener('click', _shellHome);
        c.addEventListener('click', function (e) {
            const nw = e.target.closest('[data-wg-new]');
            if (nw) {
                if (nw.dataset.wgNew === 'paste') _newByPaste(c);
                else if (win.OS_STUDIO && win.OS_STUDIO.launch) win.OS_STUDIO.launch(c, 'vn_ui');
                else try { AUI.toast('創作室還沒載入'); } catch (er) {}
                return;
            }
            const sz = e.target.closest('[data-wg-size]');
            if (sz) { setSize(sz.dataset.wgId, sz.dataset.wgSize); _repaintPage(c); return; }
            const put = e.target.closest('[data-wg-put]');
            if (put) {
                const id = put.dataset.wgPut;
                try {
                    if (_onHome(id)) win.VoidPhoneShell.hideWidget(id);
                    else win.VoidPhoneShell.unhideWidget(id);
                } catch (er) {}
                _repaintPage(c);
                return;
            }
            const del = e.target.closest('[data-wg-del]');
            if (del) {
                const id = del.dataset.wgDel, w = get(id);
                (async function () {
                    const ok = await AUI.confirm('刪掉「' + ((w && w.name) || '這個組件') + '」？刪掉就拿不回來了。', { okText: '刪掉', danger: true });
                    if (!ok) return;
                    remove(id); _repaintPage(c);
                })();
                return;
            }
        });
    }

    win.OS_WIDGETS = {
        SIZES: SIZES,
        all: all, get: get, isWidgetId: isWidgetId,
        innerHTML: innerHTML, paint: paint, tap: tap,
        hasSettings: hasSettings, openSettings: openSettings,
        save: save, remove: remove, setSize: setSize,
        sizeKeyOf: sizeKeyOf, sizeOf: function (w) { return SIZES[sizeKeyOf(w)] || SIZES.s; },
        cfgOf: cfgOf, setCfg: setCfg,
        isBuiltin: _isBuiltin,
        newId: newId,
        launch: launch
    };
})();
