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
    // 通訊錄＝微信通訊錄 ∪ 通話過的人（api_chats 非群組）：VN 劇情來電（沒加過微信的人）也要能在這裡回撥
    let _mergedContacts = [];
    async function _loadContacts() {
        const out = _contacts().slice();
        const seen = {}; out.forEach(function (c) { seen[c.id] = 1; });
        try {
            const WXDB = _w('WX_DB'), OS_DB = _w('OS_DB');
            const map = (WXDB && WXDB.getApiChatsForCurrentCard) ? ((await WXDB.getApiChatsForCurrentCard()) || {})
                      : ((OS_DB && OS_DB.getAllApiChats) ? ((await OS_DB.getAllApiChats()) || {}) : {});
            Object.keys(map).forEach(function (id) {
                const d = map[id] || {};
                if (seen[id] || d.isGroup || id === 'User') return;
                const ms = Array.isArray(d.messages) ? d.messages : [];
                if (!ms.some(function (m) { return m && (!m.type || m.type === 'msg') && m.content; })) return;   // 沒實質對話的空殼不列
                out.push({ id: id, name: d.name || id });
                seen[id] = 1;
            });
        } catch (e) {}
        _mergedContacts = out;
        return out;
    }
    function _findByDigits(d) {
        const all = _mergedContacts.length ? _mergedContacts : _contacts();
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
    async function _renderList() {
        if (!_root) return;
        _ringToken = null; _curCall = null; _clearPending();
        _clearTimer();
        const list = await _loadContacts();
        if (!_root) return;   // 載入期間 app 可能被關掉
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
          +   '<div class="dlr-list">' + (rows || '<div class="dlr-empty">通訊錄是空的<br>到微信加聯絡人、或跟人通過電話後這裡就有了</div>') + '</div>'
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
        _ringToken = null; _curCall = null; _clearPending();
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
        // 掛斷 → 回通話紀錄（剛講完的那通就在最上面）。以前掉回通訊錄，看起來像紀錄沒更新
        _root.querySelector('#dlr-hang').addEventListener('click', _renderHistory);
        _timer = setTimeout(function () {
            if (unknown) {
                const st = _root && _root.querySelector('#dlr-call-status');
                if (st) st.innerHTML = '查無此人 📵';
                _timer = setTimeout(_renderList, 1600);
            } else {
                // 響鈴：留在這個畫面問對方的第一句。它可以不接（見 _isRefusal），
                // 所以接通與否要等回覆才知道 —— 先進通話畫面再被掛掉不像打電話。
                const st = _root && _root.querySelector('#dlr-call-status');
                if (st) st.innerHTML = '響鈴中<span class="dlr-dots">…</span>';
                _ringToken = {};
                _say(contact, null, { firstRing: true, token: _ringToken });
            }
        }, 1800);
    }

    // 對方不接：只有一通電話的第一句能這樣回（後面講到一半不會突然變拒接，那是掛斷）
    // ── 一通電話的頭尾分隔 ────────────────────────────────────────
    // 通話畫面與微信共用同一份聊天記錄，所以上面看得到以前的訊息。那份裡面混著打字的訊息與
    // 好幾通電話，全部連在一起就分不出哪句是哪通、隔了多久。撥通與掛斷各寫一筆帶時間的分隔，
    // 通話畫面與逐字稿都靠它斷句。
    let _curCall = null;    // { id, name, startedAt, wroteStart }
    let _ringToken = null;  // 響鈴中的憑證：她中途離開就作廢，回覆晚到也不會把畫面拉回通話
    function _appendCallMark(text) {
        const l = _callLogEl(); if (!l || !text) return;
        l.insertAdjacentHTML('beforeend', _bubbleHTML({ type: 'system', content: text }, ''));
        _scrollCallLog();
    }
    function _stamp(ts) {
        const d = new Date(ts || Date.now());
        return (d.getMonth() + 1) + '/' + d.getDate() + ' '
             + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }
    function _dur(ms) {
        const s = Math.max(0, Math.round((ms || 0) / 1000));
        return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    }
    async function _writeCallMark(id, content, extra) {
        try {
            const OS_DB = _w('OS_DB');
            if (!OS_DB || !OS_DB.getApiChat || !OS_DB.saveApiChat) return;
            const rec = (await OS_DB.getApiChat(id)) || { id: id, name: (_curCall && _curCall.name) || id, members: [], isGroup: false, messages: [] };
            if (!Array.isArray(rec.messages)) rec.messages = [];
            rec.messages.push(Object.assign({ type: 'system', content: content, timestamp: Date.now() }, extra || {}));
            await OS_DB.saveApiChat(id, rec);
        } catch (e) { console.warn('[dialer] 寫通話分隔失敗', e); }
    }
    // 接通的那一刻才寫「通話開始」（響鈴被拒接不算一通）
    async function _markCallStart() {
        if (!_curCall || _curCall.wroteStart) return;
        _curCall.wroteStart = true;
        await _writeCallMark(_curCall.id, '通話開始 · ' + _stamp(_curCall.startedAt), { _callStart: true });
    }
    // 掛斷：有接通過才寫結束與時長，沒講到話就不留痕跡
    async function _hangUp(contact) {
        const c = _curCall;
        _curCall = null;
        if (c && c.wroteStart) await _writeCallMark(c.id, '通話結束 · ' + _dur(Date.now() - c.startedAt), { _callEnd: true });
        _renderHistory();
    }

    // ── 她講的話：連著講好幾句 ────────────────────────────────────
    // 講電話的時候一句沒講完就接下一句是常態，可是以前送出一句就馬上打一次 API、還把輸入框鎖住，
    // 等於逼她把整段擠成一句。改成排隊：送出先冒泡、先寫進記錄，停手一會兒才把累積的幾句
    // 一起送給模型（多句用換行接起來，跟他分句講話同一個格式）。
    // 沒有多一顆「說完了」的按鈕 —— 送出鍵本身就是說完一句，停手就是說完一段；
    // 而且到點時如果她還在打字（輸入框有字），就再等一輪，不會把她打到一半的話丟下。
    // 等多久算「說完了」：這是「送出一句之後、手完全停下來」的空檔 —— 想下一句、切輸入法、找字都算。
    // 一開始設 2.2 秒被她罵得對（那是打字機器人的速度），八秒她說還是趕 —— 她手速慢、邊想邊打。
    // 真的在打字不受這個數字影響（見下面 tick：輸入框有字就再等一輪），
    // 想立刻要回應也不必等 —— 框空著時送出鍵會變成「說完了」，按下去馬上送。
    const _SAY_WAIT = 13000;
    let _pendingSay = [];
    let _pendingTimer = null;
    function _clearPending() {
        if (_pendingTimer) { clearTimeout(_pendingTimer); _pendingTimer = null; }
        _pendingSay = [];
        _updateSayBtn();
    }
    // 她說的話先寫進記錄，不等模型回（逾時、掛斷都不會弄丟）
    async function _writeMyLine(contact, text) {
        try {
            const OS_DB = _w('OS_DB');
            if (!OS_DB || !OS_DB.getApiChat || !OS_DB.saveApiChat) return;
            const rec = (await OS_DB.getApiChat(contact.id)) || { id: contact.id, name: contact.name, members: [contact.name], isGroup: false, messages: [] };
            if (!Array.isArray(rec.messages)) rec.messages = [];
            const un = _userName();
            rec.messages.push({ type: 'msg', isMe: true, content: text, sender: un, senderName: un });
            await OS_DB.saveApiChat(contact.id, rec);
        } catch (e) { console.warn('[dialer] 先寫我說的話失敗', e); }
    }
    // 把累積的幾句一次送出去（時間到、或她按了「說完了」）
    function _flushSay(contact) {
        if (_pendingTimer) { clearTimeout(_pendingTimer); _pendingTimer = null; }
        if (!_pendingSay.length) return;
        const merged = _pendingSay.join('\n');
        _pendingSay = [];
        _updateSayBtn();
        _say(contact, merged, { alreadyShown: true });
    }
    function _queueSay(contact, text) {
        _pendingSay.push(text);
        _appendCallBubble(true, text, _userName());
        _writeMyLine(contact, text);
        _updateSayBtn();
        if (_pendingTimer) { clearTimeout(_pendingTimer); _pendingTimer = null; }
        const tick = function () {
            const el = _root && _root.querySelector('#dlr-say');
            if (el && String(el.value || '').trim()) { _pendingTimer = setTimeout(tick, _SAY_WAIT); return; }   // 還在打，再等一輪
            _pendingTimer = null;
            _flushSay(contact);
        };
        _pendingTimer = setTimeout(tick, _SAY_WAIT);
    }

    // ── 對方講的話：分句 ＋ 他自己掛斷 ──────────────────────────────
    // 真的講電話不是一問一答：一口氣講三句、或講完就掛，都是常態。
    // 模型一次回的內容用換行分句，程式一句一顆泡泡、中間留說話的時間差；
    // 最後一行是 [掛斷] 就代表他講完自己收線（也可以寫成 [掛斷|最後那句話]）。
    const _HANGUP_RE = /^\s*[\[［【]\s*(?:掛斷|挂断|收線|收线|結束通話|结束通话|Hangup|HangUp|EndCall|Bye)\s*(?:[|｜]\s*([^\]］】]*))?\s*[\]］】]\s*$/i;
    function _sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    // 一句話「講完」大概要多久：字數估，夾在 0.5～2.2 秒之間，太快像洗版、太慢像當機
    function _gapFor(text) { return Math.max(500, Math.min(2200, 380 + String(text || '').length * 75)); }
    function _splitSpeech(raw) {
        const out = { lines: [], hangup: false };
        String(raw == null ? '' : raw).split(/\r?\n+/).forEach(function (ln) {
            const t = ln.trim();
            if (!t) return;
            const m = t.match(_HANGUP_RE);
            if (m) { out.hangup = true; const tail = String(m[1] == null ? '' : m[1]).trim(); if (tail) out.lines.push(tail); return; }
            out.lines.push(t);
        });
        if (!out.lines.length && !out.hangup) out.lines.push('……');
        return out;
    }
    // 對方自己掛斷：畫面上講清楚是他掛的，停一拍再照正常收線流程走（會寫通話結束與時長）
    async function _remoteHangUp(contact) {
        if (!_root) return;
        _clearPending(); _enableSay(false);   // 他掛了，她還沒送出去的那幾句就別再送
        _appendCallMark('對方掛斷了');
        const st = _root.querySelector('#dlr-call-timer');
        if (st) st.textContent = '已結束';
        await _sleep(1600);
        if (!_root) return;
        await _hangUp(contact);
    }

    // 標記可以帶一句話：[不接|在忙，晚點回你] —— 不接，但補一則訊息過來（很像真人）。
    // 不帶就只是單純不接。那句話寫進同一份聊天記錄，她去微信找那個人就看得到、還是未讀。
    const _REFUSE_RE = /^\s*[\[［【]\s*(?:不接|拒接|不想接|沒接|未接|NoAnswer|Reject|Decline|Busy)\s*(?:[|｜]\s*([^\]］】]*))?\s*[\]］】]\s*$/i;
    function _refusalOf(s) {
        const m = String(s == null ? '' : s).match(_REFUSE_RE);
        return m ? { note: String(m[1] == null ? '' : m[1]).trim() } : null;
    }
    function _isRefusal(s) { return !!_refusalOf(s); }

    function _noAnswer(contact, note) { return _dialEnd(contact, '對方沒有接聽 📵', true, note); }
    function _dialFailed(contact) { return _dialEnd(contact, '沒接通 —— 到「設置 → 主模型」確認 API 有設好', false); }
    async function _dialEnd(contact, statusText, writeMissed, note) {
        if (!_root) return;
        _clearTimer();
        _root.innerHTML =
            '<div class="dlr-call dlr-call-dialing">'
          +   '<div class="dlr-call-ava">' + _esc(_avatarBg(contact)) + '</div>'
          +   '<div class="dlr-call-name">' + _esc(contact.name) + '</div>'
          +   '<div class="dlr-call-num">' + _esc(_num(contact.id)) + '</div>'
          +   '<div class="dlr-call-status">' + _esc(statusText) + '</div>'
          +   (note ? '<div class="dlr-call-note">傳了訊息給你：<span>' + _esc(_cut(note, 40)) + '</span></div>' : '')
          +   '<button class="dlr-hang" id="dlr-hang" type="button">結束</button>'
          + '</div>';
        const b = _root.querySelector('#dlr-hang');
        if (b) b.addEventListener('click', _renderHistory);
        // 通話紀錄留一筆，她才看得到自己打過（像 iPhone 的「已取消」）。接不通是設定問題，不留。
        if (writeMissed) try {
            const OS_DB = _w('OS_DB');
            if (OS_DB && OS_DB.getApiChat && OS_DB.saveApiChat) {
                const rec = (await OS_DB.getApiChat(contact.id)) || { id: contact.id, name: contact.name, members: [contact.name], isGroup: false, messages: [] };
                if (!Array.isArray(rec.messages)) rec.messages = [];
                rec.messages.push({ type: 'system', content: '未接聽', _missed: true, timestamp: Date.now() });
                // 不接但補一句：當成他傳來的訊息寫進同一份記錄，微信那邊也看得到、標成未讀
                if (note) {
                    rec.messages.push({ type: 'msg', isMe: false, content: note, sender: contact.name, senderName: contact.name, timestamp: Date.now(), _afterMissed: true });
                    rec.unread = true; rec.lastTime = Date.now();
                }
                await OS_DB.saveApiChat(contact.id, rec);
            }
        } catch (e) { console.warn('[dialer] 寫未接聽失敗', e); }
        _timer = setTimeout(_renderHistory, note ? 3200 : 2200);   // 有補訊息就多停一下讓她讀完
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
        if (inp) inp.disabled = !on;
        _updateSayBtn();
        if (on && inp) { try { inp.focus(); } catch (e) {} }
    }
    // 送出鍵一鍵兩用：輸入框有字＝「送」；已經送過幾句、框空著＝「說完了」，按下去不必等那幾秒。
    // 她原本問要不要加一顆 hold 按鈕，這樣就不用多一顆 —— 同一顆鈕看狀況換字。
    function _updateSayBtn() {
        const btn = _root && _root.querySelector('#dlr-say-btn');
        const inp = _root && _root.querySelector('#dlr-say');
        if (!btn || !inp) return;
        const hasText = !!String(inp.value || '').trim();
        const waiting = _pendingSay.length > 0;
        btn.textContent = (!hasText && waiting) ? '說完了' : '送';
        btn.classList.toggle('done', !hasText && waiting);
        btn.disabled = inp.disabled || (!hasText && !waiting);
    }
    // 念出對方台詞 —— 跟 VN 一樣「當前開哪個引擎就念哪個」（SoVITS／MiniMax 各自看自己的開關）
    function _speak(contact, text) {
        if (!text) return;
        try { const VNC = _w('VN_Core'); if (VNC && VNC._vnSoVITSPlay) VNC._vnSoVITSPlay(contact.name, text, '', ''); } catch (e) {}
        try { const mm = _w('OS_MINIMAX'); if (mm && mm.playForChar) mm.playForChar(contact.name, text, { expression: '' }); } catch (e) {}
    }

    function _inCall(contact, skipFirst) {
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
        // 計時。開始時間記在 _curCall 上，掛斷時要拿它算時長、寫分隔
        _curCall = { id: contact.id, name: contact.name, startedAt: Date.now(), wroteStart: false };
        let sec = 0;
        const tEl = _root.querySelector('#dlr-call-timer');
        _timer = setInterval(function () {
            sec++;
            if (tEl) tEl.textContent = '通話中 ' + String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
        }, 1000);
        _root.querySelector('#dlr-hang2').addEventListener('click', function () { _hangUp(contact); });

        const inp = _root.querySelector('#dlr-say');
        const fire = function () {
            if (_sayBusy) return;                 // 對方正在講話，等他講完
            const txt = (inp.value || '').trim();
            if (!txt) { _flushSay(contact); return; }   // 框空著又按送出＝「說完了」，不必等那幾秒
            inp.value = '';
            _queueSay(contact, txt);              // 先排隊：她可以連著講好幾句，停手才一起送出去
            _updateSayBtn();
        };
        _root.querySelector('#dlr-say-btn').addEventListener('click', fire);
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); fire(); } });
        inp.addEventListener('input', _updateSayBtn);   // 開始打字→鈕變回「送」，清空→變「說完了」
        _updateSayBtn();

        // 先把這個人之前的對話載成泡泡（有記憶），再讓對方接起來說第一句
        // skipFirst＝第一句已經在響鈴階段拿到了（見 _dialing），這裡不要再問一次
        return _renderCallLog(contact).then(function () { if (!skipFirst) _say(contact, null); });
    }

    // 一輪對話：使用者的話先冒泡 → 對方「輸入中…」泡泡 → buildContext + OS_API.chat → 回覆冒泡 + 念出 + 寫回同一份 DB
    async function _say(contact, userText, opts) {
        opts = opts || {};
        if (!_root) return;
        const OS_API = _w('OS_API'), OS_DB = _w('OS_DB');
        if (!OS_API || !OS_API.buildContext || !OS_API.chat || !OS_DB) { _appendCallBubble(false, '（通話引擎未載入）', contact.name); return; }
        if (_sayBusy) return;
        _sayBusy = true; _enableSay(false);
        if (userText && !opts.alreadyShown) _appendCallBubble(true, userText, _userName());   // 排隊那條已經冒過泡泡了
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
            if (opts.firstRing) { restore(); _dialFailed(contact); return; }   // 還在響鈴：沒有通話畫面可以冒泡
            _appendCallBubble(false, '（沒接通——到「設置 → 主模型」確認 API/連線有設好）', contact.name);
            restore();
        }, 40000);

        // 🚨 她說的話在「送出的當下」就寫進記錄，不等模型回（逾時、掛斷都不會弄丟）。
        //    走排隊那條的已經寫過了（見 _writeMyLine），這裡只補沒走排隊的情況。
        if (userText && !opts.alreadyShown) await _writeMyLine(contact, userText);

        try {
            const messages = await OS_API.buildContext(userText || null, 'call_voice_system');
            await OS_API.chat(messages, cfg,
                function () {},
                async function (finalText) {
                    const reply = _extractSpoken(finalText) || '……';
                    done();                                   // 先收掉「輸入中…」泡泡
                    // 響鈴那一句：對方可以不接（系統提示教它只回 [不接]）。接了才進通話畫面；
                    // _inCall 裡的 _renderCallLog 會整份重畫對話區，所以要等它畫完再冒這句泡泡。
                    if (opts.firstRing) {
                        const _ref = _refusalOf(reply);
                        if (_ref) { restore(); if (opts.token && opts.token !== _ringToken) return; _noAnswer(contact, _ref.note); return; }
                        if (opts.token && opts.token !== _ringToken) { restore(); return; }   // 響鈴中她已經離開這通了
                        await _inCall(contact, true);
                        // 🚨 done() 在上面就跑過了，但它那時通話畫面還不存在（響鈴階段還在撥號畫面），
                        //    解鎖輸入框那一下等於打在空氣上。畫面建好之後要再解一次，
                        //    不然對方明明回話了，輸入框卻是鎖的。
                        _enableSay(true);
                        // 接通了才算一通：寫進記錄，畫面上也補一條，第一句就落在分隔線下面
                        await _markCallStart();
                        _appendCallMark('通話開始 · ' + _stamp(_curCall && _curCall.startedAt));
                    }
                    // 講電話不是一問一答：一次可以連著講好幾句（一句一行），也可以講完自己掛。
                    const said = _splitSpeech(reply);
                    for (let si = 0; si < said.lines.length; si++) {
                        if (si) await _sleep(_gapFor(said.lines[si - 1]));   // 上一句「講完」才接下一句
                        if (!_root) return;                                  // 中途離開 app
                        _appendCallBubble(false, said.lines[si], contact.name);
                        _speak(contact, said.lines[si]);                     // 念出來（當前開哪個引擎就用哪個）
                    }
                    // 寫回「同一份」DB 記錄（微信那邊也讀得到 → 真共用記憶）；分幾句就存幾則
                    try {
                        const rec = (await OS_DB.getApiChat(contact.id)) || { id: contact.id, name: contact.name, members: [contact.name], isGroup: false, messages: [] };
                        if (!Array.isArray(rec.messages)) rec.messages = [];
                        // 她說的那句在送出時就寫進去了（見上面），這裡只補對方的回覆
                        said.lines.forEach(function (t) {
                            rec.messages.push({ type: 'msg', isMe: false, content: t, sender: contact.name, senderName: contact.name, raw: _rawFor(contact, t) });
                        });
                        await OS_DB.saveApiChat(contact.id, rec);
                    } catch (e) { console.warn('[dialer] 寫回 DB 失敗', e); }
                    restore();
                    if (said.hangup) { await _remoteHangUp(contact); return; }   // 他講完自己掛了
                },
                function (err) {
                    done();
                    if (opts.firstRing) { restore(); _dialFailed(contact); return; }
                    _appendCallBubble(false, '（接不通：' + ((err && err.message) || '錯誤') + '）', contact.name); restore();
                },
                { disableTyping: cfg.disableTyping !== false }
            );
        } catch (e) {
            done();
            if (opts.firstRing) { restore(); _dialFailed(contact); return; }
            _appendCallBubble(false, '（通話失敗）', contact.name); restore();
        }
    }

    // ── ③ 通話紀錄（歷史對話）＝OS_DB api_chats（與微信同一份記憶）──────────
    function _recPreview(rec) {
        const ms = (rec && Array.isArray(rec.messages)) ? rec.messages : [];
        for (let i = ms.length - 1; i >= 0; i--) {
            const m = ms[i];
            if (!m) continue;
            if (m._missed) return '未接聽';
            if ((!m.type || m.type === 'msg') && m.content) return (m.isMe ? '我：' : '') + String(m.content);
        }
        return '（無對話內容）';
    }
    async function _loadRecords() {
        const OS_DB = _w('OS_DB');
        if (!OS_DB) return [];
        let map = {};
        // 🚨 只列當前這張劇情卡的：以前這裡拿 getAllApiChats（整個資料庫），所以每張舊卡通過話的人
        //    全部堆在同一份通話紀錄裡。旁邊的通訊錄分頁本來就走 ForCurrentCard，只有這裡沒跟上。
        //    沒蓋章的舊資料照樣看得到（那條規則在 OS_DB 裡，刻意不弄丟舊東西）。
        try {
            map = (OS_DB.getApiChatsForCurrentCard
                ? (await OS_DB.getApiChatsForCurrentCard())
                : (OS_DB.getAllApiChats ? await OS_DB.getAllApiChats() : {})) || {};
        } catch (e) { return []; }
        const out = [];
        Object.keys(map).forEach(function (id) {
            const d = map[id] || {};
            if (d.isGroup) return;
            const ms = Array.isArray(d.messages) ? d.messages : [];
            // 沒實質對話的略過；但「未接聽」那筆要留著，她才看得到自己打過
            if (!ms.some(function (m) { return m && (((!m.type || m.type === 'msg') && m.content) || m._missed); })) return;
            out.push({ id: id, name: d.name || id, messages: ms, lastTime: d.lastTime || '' });
        });
        return out;
    }

    function _renderHistory() {
        if (!_root) return;
        _ringToken = null; _clearPending();
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
    // 逐字稿按「一通」切段：撥通那筆分隔開一段，收線那筆收尾。
    // 沒有分隔的（微信打字的訊息、還有加分隔之前留下的舊資料）自成一段，標成「更早的對話」。
    // 一條一條刪太瑣碎——她要的是一次清掉一整通。
    function _groupByCall(ms) {
        const groups = [];
        let cur = null;
        const open = function (title, from) { cur = { title: title, from: from, to: from, idx: [] }; groups.push(cur); };
        ms.forEach(function (m, i) {
            if (!m) return;
            if (m._callStart) { open(String(m.content || '通話'), i); cur.idx.push(i); cur.to = i; return; }
            if (!cur) open('更早的對話', i);
            cur.idx.push(i); cur.to = i;
            if (m._callEnd) cur = null;   // 收線＝這段結束，後面的另開一段
        });
        return groups;
    }
    async function _deleteCallGroup(rec, g) {
        try {
            const OS_DB = _w('OS_DB');
            if (!OS_DB || !OS_DB.saveApiChat) return;
            const drop = {}; g.idx.forEach(function (i) { drop[i] = 1; });
            const kept = (rec.messages || []).filter(function (_, i) { return !drop[i]; });
            const next = Object.assign({}, rec, { messages: kept, pushedCount: kept.length, renderedCount: kept.length });
            await OS_DB.saveApiChat(rec.id, next);
            // 記憶體那份也要跟上，不然切回微信還看得到
            try { const wx = _w('wxApp'); if (wx && wx.GLOBAL_CHATS && wx.GLOBAL_CHATS[rec.id]) wx.GLOBAL_CHATS[rec.id] = next; } catch (e) {}
            _renderTranscript(next);
        } catch (e) { console.warn('[dialer] 刪除這通失敗', e); }
    }
    function _renderTranscript(rec) {
        if (!_root) return;
        _clearTimer();
        const ms = Array.isArray(rec.messages) ? rec.messages : [];
        const groups = _groupByCall(ms);
        const body = groups.map(function (g, gi) {
            return '<div class="dlr-tx-group" data-g="' + gi + '">'
                 + '<div class="dlr-tx-ghead"><span>' + _esc(g.title) + '</span>'
                 + '<button class="dlr-tx-gdel" data-g="' + gi + '" type="button" title="刪掉這一整段">🗑</button></div>'
                 + g.idx.map(function (i) { return _bubbleHTML(ms[i], rec.name); }).join('')
                 + '</div>';
        }).join('');
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
        _root.querySelectorAll('.dlr-tx-gdel').forEach(function (b) {
            b.addEventListener('click', function () {
                const g = groups[parseInt(b.dataset.g, 10)];
                if (!g) return;
                const n = g.idx.filter(function (i) { const m = ms[i]; return m && (!m.type || m.type === 'msg'); }).length;
                if (!win.confirm('刪掉「' + g.title + '」這一段？\n' + n + ' 則對話，微信那邊也會一起消失，無法復原。')) return;
                _deleteCallGroup(rec, g);
            });
        });
    }

    win.OS_DIALER = { launch: launch };
})();
