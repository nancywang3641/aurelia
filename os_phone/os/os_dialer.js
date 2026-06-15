'use strict';
// os_dialer.js —— 📞 電話 app（手機殼）
// 兩層：① 聯絡列表（讀 WX_CONTACTS，共用同一份通訊錄）② 撥號鍵盤 → 撥號中動畫 → 撥通通話畫面
// 號碼是從聯絡人 id 算出來的固定假號碼（純展示、不另存），鍵盤撥與點聯絡人撥的是同一個人。
// 撥通＝VN call 字幕通話 UI；對話直接讀寫 OS_DB 那個 id 的聊天記錄（與微信同一份）→ 真共用記憶，不掛微信 app。
(function () {
    const win = window;

    // 解析 OS 全域物件（手機殼可能在 iframe，物件掛在 parent）
    function _w(name) { try { if (win.parent && win.parent[name]) return win.parent[name]; } catch (e) {} return win[name]; }

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

    // 底部分頁列（iOS 風：通訊錄 / 鍵盤）
    function _tabbar(active) {
        return '<div class="dlr-tabbar">'
          +   '<button class="dlr-tab' + (active === 'list' ? ' on' : '') + '" data-tab="list" type="button"><span class="dlr-tab-ic">👥</span><span class="dlr-tab-tx">通訊錄</span></button>'
          +   '<button class="dlr-tab' + (active === 'pad' ? ' on' : '') + '" data-tab="pad" type="button"><span class="dlr-tab-ic">⌨️</span><span class="dlr-tab-tx">鍵盤</span></button>'
          + '</div>';
    }
    function _bindTabs() {
        _root.querySelectorAll('.dlr-tab').forEach(function (b) {
            b.addEventListener('click', function () { if (b.dataset.tab === 'pad') _renderPad(''); else _renderList(); });
        });
    }

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
          +   _tabbar('list')
          + '</div>';
        _root.querySelectorAll('.dlr-row').forEach(function (b) {
            b.addEventListener('click', function () { const c = list.find(function (x) { return x.id === b.dataset.id; }); if (c) _dialing(c); });
        });
        _bindTabs();
    }

    // ── ② 撥號鍵盤 ──────────────────────────────────────────────
    function _renderPad(typed) {
        if (!_root) return;
        _clearTimer();
        const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
        _root.innerHTML =
            '<div class="dlr-wrap dlr-pad">'
          +   '<div class="dlr-pad-inner">'
          +     '<div class="dlr-num-disp" id="dlr-num-disp">' + _esc(typed || '') + '</div>'
          +     '<div class="dlr-keys">'
          +       keys.map(function (k) { return '<button class="dlr-key" data-k="' + k + '" type="button">' + k + '</button>'; }).join('')
          +     '</div>'
          +     '<div class="dlr-pad-actions">'
          +       '<button class="dlr-call-btn" id="dlr-call-btn" type="button">📞 撥號</button>'
          +       '<button class="dlr-del" id="dlr-del" type="button">⌫</button>'
          +     '</div>'
          +   '</div>'
          +   _tabbar('pad')
          + '</div>';
        let cur = String(typed || '');
        const disp = _root.querySelector('#dlr-num-disp');
        const setDisp = function () { if (disp) disp.textContent = cur; };
        _root.querySelectorAll('.dlr-key').forEach(function (b) {
            b.addEventListener('click', function () { cur += b.dataset.k; setDisp(); });
        });
        _root.querySelector('#dlr-del').addEventListener('click', function () { cur = cur.slice(0, -1); setDisp(); });
        _root.querySelector('#dlr-call-btn').addEventListener('click', function () {
            const d = cur.replace(/\D/g, '');
            if (!d) return;
            const c = _findByDigits(d);
            if (c) _dialing(c);
            else _dialing({ id: '__unknown__', name: '未知號碼', _raw: cur });   // 查無此人彩蛋
        });
        _bindTabs();
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

    // ── 撥通：VN call 字幕通話 UI；對話直讀寫 OS_DB（與微信同一份記憶）──
    let _sayBusy = false;

    function _userName() {
        const api = _w('OS_API');
        try { if (api && api.getGlobalUserName) return api.getGlobalUserName() || '我'; } catch (e) {}
        const u = _w('WX_USER');
        try { if (u && u.getInfo) return u.getInfo().name || '我'; } catch (e) {}
        return '我';
    }
    // 從 AI 原始輸出抽「講出口的話」：去 CoT、去微信格式頭、去表情包、去行首 [名字] 前綴
    function _extractSpoken(raw) {
        let t = String(raw || '');
        t = t.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '');
        t = t.replace(/\[(?:Chat|With|Time|System|Notice|CoT|Thinking)[:：][^\]]*\]/gi, '');
        t = t.replace(/\[表情包[:：][^\]]*\]/g, '');
        t = t.replace(/^\s*\[[^\]]+\]\s*/gm, '');
        return t.replace(/\n{2,}/g, '\n').trim();
    }
    function _rawFor(contact, text) {
        const n = contact.name || '', id = contact.id || '';
        return '\n[Chat: ' + n + '|' + id + ']\n[With: ' + n + ']\n[' + n + '] ' + text;
    }
    function _setSub(name, text) {
        const nEl = _root && _root.querySelector('#dlr-sub-name');
        const tEl = _root && _root.querySelector('#dlr-sub-text');
        if (nEl) nEl.textContent = name || '';
        if (tEl) tEl.textContent = text == null ? '' : text;
    }
    function _enableSay(on) {
        const inp = _root && _root.querySelector('#dlr-say');
        const btn = _root && _root.querySelector('#dlr-say-btn');
        if (inp) inp.disabled = !on;
        if (btn) btn.disabled = !on;
        if (on && inp) { try { inp.focus(); } catch (e) {} }
    }

    function _inCall(contact) {
        if (!_root) return;
        _clearTimer();
        _sayBusy = false;
        _root.innerHTML =
            '<div class="dlr-call dlr-incall">'
          +   '<div class="dlr-call-stage">'
          +     '<div class="dlr-call-ava big">' + _esc(_avatarBg(contact)) + '</div>'
          +     '<div class="dlr-call-name">' + _esc(contact.name) + '</div>'
          +     '<div class="dlr-call-timer" id="dlr-call-timer">通話中 00:00</div>'
          +     '<div class="dlr-call-sub"><div class="dlr-sub-name" id="dlr-sub-name"></div>'
          +       '<div class="dlr-sub-text" id="dlr-sub-text">接通中…</div></div>'
          +   '</div>'
          +   '<div class="dlr-call-foot">'
          +     '<div class="dlr-say-bar">'
          +       '<input class="dlr-say" id="dlr-say" type="text" placeholder="說點什麼…" autocomplete="off" disabled>'
          +       '<button class="dlr-say-btn" id="dlr-say-btn" type="button" disabled>送</button>'
          +     '</div>'
          +     '<button class="dlr-hang big" id="dlr-hang2" type="button">掛斷</button>'
          +   '</div>'
          + '</div>';
        // 計時
        let sec = 0;
        const tEl = _root.querySelector('#dlr-call-timer');
        _timer = setInterval(function () {
            sec++;
            if (tEl) tEl.textContent = '通話中 ' + String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
        }, 1000);
        _root.querySelector('#dlr-hang2').addEventListener('click', _renderList);

        const inp = _root.querySelector('#dlr-say');
        const fire = function () {
            if (_sayBusy) return;
            const txt = (inp.value || '').trim();
            if (!txt) return;
            inp.value = '';
            _say(contact, txt);
        };
        _root.querySelector('#dlr-say-btn').addEventListener('click', fire);
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); fire(); } });

        // 撥通＝對方接起來先說一句（讀 DB 歷史 → 有記憶）
        _say(contact, null);
    }

    // 一輪對話：暫設 active=該聯絡人 → buildContext(同一份 DB 歷史) + OS_API.chat → 回覆寫回同一份 DB
    async function _say(contact, userText) {
        if (!_root) return;
        const OS_API = _w('OS_API'), OS_DB = _w('OS_DB');
        if (!OS_API || !OS_API.buildContext || !OS_API.chat || !OS_DB) { _setSub(contact.name, '（通話引擎未載入）'); return; }
        _sayBusy = true; _enableSay(false);
        _setSub(contact.name, '…');
        let n = 0; const think = setInterval(function () {
            n = (n % 3) + 1;
            if (_sayBusy) { const t2 = _root && _root.querySelector('#dlr-sub-text'); if (t2) t2.textContent = '…'.repeat(n); }
        }, 380);

        // config（照 wx triggerReply：wx_phone_api_config，缺 url/key 就繼承 os_global_config）
        let cfg = {};
        try { const s = localStorage.getItem('wx_phone_api_config'); if (s) cfg = JSON.parse(s); } catch (e) {}
        if (!cfg.url || !cfg.key) {
            try {
                const m = JSON.parse(localStorage.getItem('os_global_config') || '{}');
                if (m.url) cfg.url = m.url;
                if (m.key) cfg.key = m.key;
                if (!cfg.model && m.model) cfg.model = m.model;
                if (!cfg.maxTokens && m.maxTokens) cfg.maxTokens = m.maxTokens;
            } catch (e) {}
        }

        // 暫把微信 active 指到這個聯絡人，buildContext 就會從 DB 抓他的整條歷史；結束還原
        const wxApp = _w('wxApp');
        const prevActive = wxApp ? wxApp.GLOBAL_ACTIVE_ID : undefined;
        if (wxApp) wxApp.GLOBAL_ACTIVE_ID = contact.id;
        const restore = function () { if (wxApp) wxApp.GLOBAL_ACTIVE_ID = prevActive; };
        const done = function () { clearInterval(think); _sayBusy = false; _enableSay(true); };

        try {
            const messages = await OS_API.buildContext(userText || null, 'wx_chat_system');
            await OS_API.chat(messages, cfg,
                function () {},
                async function (finalText) {
                    const reply = _extractSpoken(finalText) || '……';
                    _setSub(contact.name, reply);
                    // 寫回「同一份」DB 記錄（微信那邊也讀得到 → 真共用記憶）
                    try {
                        const rec = (await OS_DB.getApiChat(contact.id)) || { id: contact.id, name: contact.name, members: [contact.name], isGroup: false, messages: [] };
                        if (!Array.isArray(rec.messages)) rec.messages = [];
                        if (userText) { const un = _userName(); rec.messages.push({ type: 'msg', isMe: true, content: userText, sender: un, senderName: un }); }
                        rec.messages.push({ type: 'msg', isMe: false, content: reply, sender: contact.name, senderName: contact.name, raw: _rawFor(contact, reply) });
                        await OS_DB.saveApiChat(contact.id, rec);
                    } catch (e) { console.warn('[dialer] 寫回 DB 失敗', e); }
                    restore(); done();
                },
                function (err) { _setSub(contact.name, '（接不通：' + ((err && err.message) || '錯誤') + '）'); restore(); done(); },
                { disableTyping: cfg.disableTyping !== false }
            );
        } catch (e) {
            _setSub(contact.name, '（通話失敗）'); restore(); done();
        }
    }

    win.OS_DIALER = { launch: launch };
})();
