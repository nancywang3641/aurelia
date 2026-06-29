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
    let _hsel = { on: false, ids: new Set() };   // 通話紀錄多選狀態
    let _hrecs = [];                              // 已載入的通話紀錄（給 transcript 查）

    function launch(container) {
        _root = container;
        _clearTimer();
        _renderList();
    }
    function _clearTimer() { if (_timer) { clearInterval(_timer); _timer = null; } }
    function _cut(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) + '…' : s; }
    // 返回手機主畫面（手機殼開 app 時把 PhoneSystem.goHome 暫接成「回主畫面」）
    function _goHome() { try { const PS = _w('PhoneSystem'); if (PS && typeof PS.goHome === 'function') PS.goHome(); } catch (e) {} }
    function _bindHome() { const b = _root && _root.querySelector('#dlr-home'); if (b) b.addEventListener('click', _goHome); }
    function _headHTML(title) { return '<button class="dlr-back" id="dlr-home" type="button" title="返回主畫面">‹</button><span class="dlr-head-title">' + _esc(title) + '</span>'; }

    // 底部分頁列（iOS 風：通話紀錄 / 通訊錄 / 鍵盤）
    function _tabbar(active) {
        return '<div class="dlr-tabbar">'
          +   '<button class="dlr-tab' + (active === 'hist' ? ' on' : '') + '" data-tab="hist" type="button"><span class="dlr-tab-ic">🕐</span><span class="dlr-tab-tx">通話紀錄</span></button>'
          +   '<button class="dlr-tab' + (active === 'list' ? ' on' : '') + '" data-tab="list" type="button"><span class="dlr-tab-ic">👥</span><span class="dlr-tab-tx">通訊錄</span></button>'
          +   '<button class="dlr-tab' + (active === 'pad' ? ' on' : '') + '" data-tab="pad" type="button"><span class="dlr-tab-ic">⌨️</span><span class="dlr-tab-tx">鍵盤</span></button>'
          + '</div>';
    }
    function _bindTabs() {
        _root.querySelectorAll('.dlr-tab').forEach(function (b) {
            b.addEventListener('click', function () {
                const t = b.dataset.tab;
                if (t === 'pad') _renderPad('');
                else if (t === 'hist') _renderHistory();
                else _renderList();
            });
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
          +   '<div class="dlr-head">' + _headHTML('電話') + '</div>'
          +   '<div class="dlr-list">' + (rows || '<div class="dlr-empty">通訊錄是空的<br>到微信加聯絡人後這裡就有了</div>') + '</div>'
          +   _tabbar('list')
          + '</div>';
        _root.querySelectorAll('.dlr-row').forEach(function (b) {
            b.addEventListener('click', function () { const c = list.find(function (x) { return x.id === b.dataset.id; }); if (c) _dialing(c); });
        });
        _bindTabs(); _bindHome();
    }

    // ── ② 撥號鍵盤 ──────────────────────────────────────────────
    function _renderPad(typed) {
        if (!_root) return;
        _clearTimer();
        const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
        _root.innerHTML =
            '<div class="dlr-wrap dlr-pad">'
          +   '<div class="dlr-head">' + _headHTML('鍵盤') + '</div>'
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
        _bindTabs(); _bindHome();
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
    // 通話畫面用「泡泡」顯示（與通話紀錄/微信一致），不再用單行字幕
    function _callLogEl() { return _root ? _root.querySelector('#dlr-call-log') : null; }
    function _scrollCallLog() { const l = _callLogEl(); if (l) l.scrollTop = l.scrollHeight; }
    function _bubbleHTML(m, name) {
        if (!m) return '';
        if (m.type && m.type !== 'msg') { const tx = m.content || m.time || ''; return tx ? '<div class="dlr-tx-time">' + _esc(_cut(String(tx), 40)) + '</div>' : ''; }
        if (!m.content) return '';
        const me = !!m.isMe;
        const who = me ? '' : _esc(m.senderName || m.sender || name || '');
        return '<div class="dlr-tx-msg' + (me ? ' me' : '') + '">'
             + (who ? '<div class="dlr-tx-who">' + who + '</div>' : '')
             + '<div class="dlr-tx-bubble">' + _esc(String(m.content)) + '</div></div>';
    }
    function _appendCallBubble(isMe, content, name) {
        const l = _callLogEl(); if (!l) return;
        l.insertAdjacentHTML('beforeend', _bubbleHTML({ type: 'msg', isMe: isMe, content: content, senderName: name }, name));
        _scrollCallLog();
    }
    function _appendTyping() {
        const l = _callLogEl(); if (!l) return null;
        const d = (win.document || document).createElement('div');
        d.className = 'dlr-tx-msg dlr-typing';
        d.innerHTML = '<div class="dlr-tx-bubble dlr-typing-bubble"><span></span><span></span><span></span></div>';
        l.appendChild(d); _scrollCallLog();
        return d;
    }
    function _removeTyping(el) { if (el && el.parentNode) el.parentNode.removeChild(el); }
    async function _renderCallLog(contact) {
        const OS_DB = _w('OS_DB'); const l = _callLogEl(); if (!l) return;
        let rec = null; try { if (OS_DB && OS_DB.getApiChat) rec = await OS_DB.getApiChat(contact.id); } catch (e) {}
        const ms = (rec && Array.isArray(rec.messages)) ? rec.messages : [];
        l.innerHTML = ms.map(function (m) { return _bubbleHTML(m, contact.name); }).join('');
        _scrollCallLog();
    }
    function _enableSay(on) {
        const inp = _root && _root.querySelector('#dlr-say');
        const btn = _root && _root.querySelector('#dlr-say-btn');
        if (inp) inp.disabled = !on;
        if (btn) btn.disabled = !on;
        if (on && inp) { try { inp.focus(); } catch (e) {} }
    }
    // 念出對方台詞 —— 跟 VN 一樣「當前開哪個引擎就念哪個」（SoVITS／MiniMax 各自看自己的開關）
    function _speak(contact, text) {
        if (!text) return;
        try { const VNC = _w('VN_Core'); if (VNC && VNC._vnSoVITSPlay) VNC._vnSoVITSPlay(contact.name, text, '', ''); } catch (e) {}
        try { const mm = _w('OS_MINIMAX'); if (mm && mm.playForChar) mm.playForChar(contact.name, text, { expression: '' }); } catch (e) {}
    }

    function _inCall(contact) {
        if (!_root) return;
        _clearTimer();
        _sayBusy = false;
        _root.innerHTML =
            '<div class="dlr-incall">'
          +   '<div class="dlr-call-top">'
          +     '<div class="dlr-call-top-ava">' + _esc(_avatarBg(contact)) + '</div>'
          +     '<div class="dlr-call-top-info">'
          +       '<div class="dlr-call-top-name">' + _esc(contact.name) + '</div>'
          +       '<div class="dlr-call-top-timer" id="dlr-call-timer">通話中 00:00</div>'
          +     '</div>'
          +   '</div>'
          +   '<div class="dlr-call-log" id="dlr-call-log"></div>'
          +   '<div class="dlr-call-foot light">'
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

        // 先把這個人之前的對話載成泡泡（有記憶），再讓對方接起來說第一句
        _renderCallLog(contact).then(function () { _say(contact, null); });
    }

    // 一輪對話：使用者的話先冒泡 → 對方「輸入中…」泡泡 → buildContext + OS_API.chat → 回覆冒泡 + 念出 + 寫回同一份 DB
    async function _say(contact, userText) {
        if (!_root) return;
        const OS_API = _w('OS_API'), OS_DB = _w('OS_DB');
        if (!OS_API || !OS_API.buildContext || !OS_API.chat || !OS_DB) { _appendCallBubble(false, '（通話引擎未載入）', contact.name); return; }
        if (_sayBusy) return;
        _sayBusy = true; _enableSay(false);
        if (userText) _appendCallBubble(true, userText, _userName());
        const typing = _appendTyping();

        // config：用主模型設定（跟 os_studio st.callAI 同源 → 能正確帶 useSystemApi 或 url/key）
        const S = _w('OS_SETTINGS');
        let cfg = (S && S.getConfig && S.getConfig()) || {};
        cfg = Object.assign({}, cfg, { usePresetPrompts: false, enableThinking: false });

        // 暫把微信 active 指到這個聯絡人，buildContext 就會從 DB 抓他的整條歷史；結束還原
        const wxApp = _w('wxApp');
        const prevActive = wxApp ? wxApp.GLOBAL_ACTIVE_ID : undefined;
        if (wxApp) wxApp.GLOBAL_ACTIVE_ID = contact.id;
        let _settled = false;
        let watchdog = null;
        const restore = function () { if (wxApp) wxApp.GLOBAL_ACTIVE_ID = prevActive; };
        const done = function () { if (_settled) return; _settled = true; if (watchdog) clearTimeout(watchdog); _removeTyping(typing); _sayBusy = false; _enableSay(true); };
        // 看門狗：40 秒沒回 → 別乾等，給提示
        watchdog = setTimeout(function () {
            done();
            _appendCallBubble(false, '（沒接通——到「設置 → 主模型」確認 API/連線有設好）', contact.name);
            restore();
        }, 40000);

        try {
            const messages = await OS_API.buildContext(userText || null, 'call_voice_system');
            await OS_API.chat(messages, cfg,
                function () {},
                async function (finalText) {
                    const reply = _extractSpoken(finalText) || '……';
                    done();                                   // 先收掉「輸入中…」泡泡
                    _appendCallBubble(false, reply, contact.name);
                    _speak(contact, reply);                   // 念出來（當前開哪個引擎就用哪個）
                    // 寫回「同一份」DB 記錄（微信那邊也讀得到 → 真共用記憶）
                    try {
                        const rec = (await OS_DB.getApiChat(contact.id)) || { id: contact.id, name: contact.name, members: [contact.name], isGroup: false, messages: [] };
                        if (!Array.isArray(rec.messages)) rec.messages = [];
                        if (userText) { const un = _userName(); rec.messages.push({ type: 'msg', isMe: true, content: userText, sender: un, senderName: un }); }
                        rec.messages.push({ type: 'msg', isMe: false, content: reply, sender: contact.name, senderName: contact.name, raw: _rawFor(contact, reply) });
                        await OS_DB.saveApiChat(contact.id, rec);
                    } catch (e) { console.warn('[dialer] 寫回 DB 失敗', e); }
                    restore();
                },
                function (err) { done(); _appendCallBubble(false, '（接不通：' + ((err && err.message) || '錯誤') + '）', contact.name); restore(); },
                { disableTyping: cfg.disableTyping !== false }
            );
        } catch (e) {
            done(); _appendCallBubble(false, '（通話失敗）', contact.name); restore();
        }
    }

    // ── ③ 通話紀錄（歷史對話）＝OS_DB api_chats（與微信同一份記憶）──────────
    function _recPreview(rec) {
        const ms = (rec && Array.isArray(rec.messages)) ? rec.messages : [];
        for (let i = ms.length - 1; i >= 0; i--) {
            const m = ms[i];
            if (m && (!m.type || m.type === 'msg') && m.content) return (m.isMe ? '我：' : '') + String(m.content);
        }
        return '（無對話內容）';
    }
    async function _loadRecords() {
        const OS_DB = _w('OS_DB');
        if (!OS_DB || !OS_DB.getAllApiChats) return [];
        let map = {};
        try { map = (await OS_DB.getAllApiChats()) || {}; } catch (e) { return []; }
        const out = [];
        Object.keys(map).forEach(function (id) {
            const d = map[id] || {};
            if (d.isGroup) return;
            const ms = Array.isArray(d.messages) ? d.messages : [];
            if (!ms.some(function (m) { return m && (!m.type || m.type === 'msg') && m.content; })) return;   // 沒實質對話的略過
            out.push({ id: id, name: d.name || id, messages: ms, lastTime: d.lastTime || '' });
        });
        return out;
    }

    function _renderHistory() {
        if (!_root) return;
        _clearTimer();
        _hsel = { on: false, ids: new Set() };
        _root.innerHTML =
            '<div class="dlr-wrap">'
          +   '<div class="dlr-head">' + _headHTML('通話紀錄')
          +     '<div class="dlr-sel-actions">'
          +       '<button class="dlr-sel-toggle" id="dlr-sel-toggle" type="button">選取</button>'
          +       '<div class="dlr-sel-bar">'
          +         '<button class="dlr-sel-btn" id="dlr-sel-cancel" type="button">取消</button>'
          +         '<button class="dlr-sel-btn" id="dlr-sel-all" type="button">全選</button>'
          +         '<button class="dlr-sel-btn danger" id="dlr-sel-clear" type="button">清除</button>'
          +       '</div>'
          +     '</div>'
          +   '</div>'
          +   '<div class="dlr-list" id="dlr-hist-list"><div class="dlr-empty">載入中…</div></div>'
          +   _tabbar('hist')
          + '</div>';
        _bindTabs(); _bindHome();
        _root.querySelector('#dlr-sel-toggle').addEventListener('click', _enterHsel);
        _root.querySelector('#dlr-sel-cancel').addEventListener('click', _exitHsel);
        _root.querySelector('#dlr-sel-all').addEventListener('click', _selectAll);
        _root.querySelector('#dlr-sel-clear').addEventListener('click', _clearSelected);
        _fillHistory();
    }
    async function _fillHistory() {
        _hrecs = await _loadRecords();
        const listEl = _root && _root.querySelector('#dlr-hist-list');
        if (!listEl) return;
        if (!_hrecs.length) {
            listEl.innerHTML = '<div class="dlr-empty">還沒有通話紀錄<br>撥通一次電話、聊過之後這裡就會留下對話</div>';
            return;
        }
        listEl.innerHTML = _hrecs.map(function (r) {
            return '<button class="dlr-row dlr-hrow" data-id="' + _esc(r.id) + '" type="button">'
                 + '<span class="dlr-check" aria-hidden="true"></span>'
                 + '<span class="dlr-ava">' + _esc((r.name || '?').trim().slice(0, 1)) + '</span>'
                 + '<span class="dlr-row-main"><span class="dlr-row-name">' + _esc(r.name) + '</span>'
                 + '<span class="dlr-row-prev">' + _esc(_cut(_recPreview(r), 24)) + '</span></span>'
                 + (r.lastTime ? '<span class="dlr-row-time">' + _esc(r.lastTime) + '</span>' : '')
                 + '</button>';
        }).join('');
        listEl.querySelectorAll('.dlr-hrow').forEach(function (b) {
            b.addEventListener('click', function () { _onHrow(b.dataset.id); });
        });
        _applyHsel();
    }
    function _onHrow(id) {
        if (_hsel.on) {
            if (_hsel.ids.has(id)) _hsel.ids.delete(id); else _hsel.ids.add(id);
            _applyHsel();
        } else {
            const rec = (_hrecs || []).find(function (r) { return r.id === id; });
            if (rec) _renderTranscript(rec);
        }
    }
    function _enterHsel() { _hsel.on = true; _applyHsel(); }
    function _exitHsel() { _hsel.on = false; _hsel.ids.clear(); _applyHsel(); }
    function _selectAll() {
        const rows = _root ? _root.querySelectorAll('.dlr-hrow') : [];
        if (_hsel.ids.size === rows.length) _hsel.ids.clear();
        else { _hsel.ids = new Set(); rows.forEach(function (b) { _hsel.ids.add(b.dataset.id); }); }
        _applyHsel();
    }
    function _applyHsel() {
        const wrap = _root && _root.querySelector('.dlr-wrap');
        if (wrap) wrap.classList.toggle('selmode', !!_hsel.on);
        const rows = _root ? _root.querySelectorAll('.dlr-hrow') : [];
        rows.forEach(function (b) { b.classList.toggle('sel-on', _hsel.ids.has(b.dataset.id)); });
        const allBtn = _root && _root.querySelector('#dlr-sel-all');
        const clrBtn = _root && _root.querySelector('#dlr-sel-clear');
        if (allBtn) allBtn.textContent = (rows.length > 0 && _hsel.ids.size === rows.length) ? '全不選' : '全選';
        if (clrBtn) { clrBtn.textContent = _hsel.ids.size > 0 ? ('清除(' + _hsel.ids.size + ')') : '清除'; clrBtn.disabled = _hsel.ids.size === 0; }
    }
    async function _clearSelected() {
        if (!_hsel.ids.size) return;
        const n = _hsel.ids.size;
        if (!win.confirm('確定清除選取的 ' + n + ' 筆通話紀錄嗎？\n（這份對話與微信共用，會一起清掉，無法復原）')) return;
        const OS_DB = _w('OS_DB');
        const ids = Array.from(_hsel.ids);
        for (let i = 0; i < ids.length; i++) {
            try { if (OS_DB && OS_DB.deleteApiChat) await OS_DB.deleteApiChat(ids[i]); } catch (e) {}
        }
        // 微信面板若開著，同步把這幾筆從它的記憶體移除並重繪
        try {
            const wxApp = _w('wxApp');
            if (wxApp && wxApp.GLOBAL_CHATS) { ids.forEach(function (id) { delete wxApp.GLOBAL_CHATS[id]; }); if (typeof wxApp.render === 'function') wxApp.render(); }
        } catch (e) {}
        _renderHistory();
    }

    // ── 歷史對話 transcript（唯讀檢視）──
    function _renderTranscript(rec) {
        if (!_root) return;
        _clearTimer();
        const ms = Array.isArray(rec.messages) ? rec.messages : [];
        const body = ms.map(function (m) { return _bubbleHTML(m, rec.name); }).join('');
        _root.innerHTML =
            '<div class="dlr-wrap">'
          +   '<div class="dlr-tx-head">'
          +     '<button class="dlr-tx-back" id="dlr-tx-back" type="button">‹ 通話紀錄</button>'
          +     '<span class="dlr-tx-title">' + _esc(rec.name) + '</span>'
          +     '<button class="dlr-tx-call" id="dlr-tx-call" type="button">📞</button>'
          +   '</div>'
          +   '<div class="dlr-tx-wrap">' + (body || '<div class="dlr-empty">這通沒有對話內容</div>') + '</div>'
          + '</div>';
        _root.querySelector('#dlr-tx-back').addEventListener('click', _renderHistory);
        const callBtn = _root.querySelector('#dlr-tx-call');
        if (callBtn) callBtn.addEventListener('click', function () {
            const c = _contacts().find(function (x) { return x.id === rec.id; }) || { id: rec.id, name: rec.name };
            _dialing(c);
        });
    }

    win.OS_DIALER = { launch: launch };
})();
