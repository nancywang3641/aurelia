// ----------------------------------------------------------------
// [微信] wx_notebook.js —— 記事本：一間聊天室一本，只有她和這間的角色看得到
// 職責：
//   LINE 記事本那種「兩個人共用的小倉庫」，但不做成貼文（沒有按讚、留言）。
//   約定、地址、去過的地方、心得、發票單子……她跟角色都能往裡面丟，也都能改、能刪。
//   ・她寫：右下角「＋」，一則可以有標題、內文、幾張照片（從相簿選，存圖庫只放編號）。
//   ・角色寫：聊天時它覺得重要就在回覆最後單獨一行 [系統: 記一筆｜標題｜內容]（見 addFromAi），
//     聊天室冒一行「○○記了一筆：…」，點了直接打開那一則。它想附照片就寫畫面描述，
//     卡上有「展開圖片」，按了才生（跟聊天裡它傳照片同一套，不自動燒額度）。
//   ・角色記得：每輪只給它「目錄」——每則一行（標題或第一句、照片的描述），不是每次都塞全文與圖。
//     她放的照片跟相簿照片一樣只給它看一次，它寫回一句描述，之後只送那句（見 photoOnceMessage）。
// 存哪：OS_DB app_data（appId 'wx_notebook'、key 'book'、按聊天室分）。
//   🚨 app_data 是共用倉：appId 不准用 app_ 開頭，應用工坊「清理殘留資料」只認 app_<時間>_<亂碼>。
//   不掛在 chat 物件上：跑團同步每次從正文整份重建訊息，掛上去會被沖掉；清空聊天記錄也不會清到它。
//   個人檔案卡那張舊紙條（localStorage wx_note_<id>）第一次打開時搬成第一則。
// 對外：WX_NOTEBOOK.open(chatId, itemId?) / close() / brief(chatId, {call}) /
//       addFromAi(chatId, text, chatName) / editFromAi(chatId, num, text) /
//       photoOnceMessage(chatId) / rememberPhoto(num, desc) / removeChat(chatId)
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const d = win.document;

    const APP_ID = 'wx_notebook';
    const DATA_KEY = 'book';
    const OLD_NOTE_KEY = (id) => 'wx_note_' + id;
    const TITLE_MAX = 60;
    const BODY_MAX = 4000;
    const PHOTO_MAX = 9;
    const BRIEF_MAX = 30;       // 目錄最多列幾則（最近的）
    const BRIEF_LEN = 60;       // 每則在目錄裡最多幾個字
    const PHOTO_ONCE_MAX = 3;   // 一輪最多給它看幾張她放的照片
    const PHOTO_TRIES = 2;      // 它沒寫回描述的話最多再試幾次

    const _cache = {};          // chatId → book（讀過一次就留在記憶體）
    const _queue = {};          // chatId → 寫入排隊（同一輪記兩筆不會互相蓋掉）
    let _photoBatch = { chatId: '', refs: [] };

    function _db() { return win.OS_DB || window.OS_DB; }
    function _aui() { return win.AUI || window.AUI; }
    function _pi() { return win.OS_PHONE_IMAGE || window.OS_PHONE_IMAGE; }
    function _esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function _newId() { return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
    function _chatName(chatId) {
        try { const c = win.wxApp && win.wxApp.GLOBAL_CHATS && win.wxApp.GLOBAL_CHATS[chatId]; return (c && c.name) || ''; } catch (e) { return ''; }
    }
    // 「我」在微信裡叫什麼：只有 WX_ME 一個出處（暱稱優先→人設名），拿不到才退到全域使用者名
    function _userName() {
        try { const me = win.WX_ME; if (me && me.name) { const n = me.name(); if (n) return n; } } catch (e) {}
        try { const api = win.OS_API; if (api && api.getGlobalUserName) return api.getGlobalUserName() || ''; } catch (e) {}
        return '';
    }

    // ── 資料 ─────────────────────────────────────────
    async function load(chatId) {
        if (!chatId) return { items: [] };
        if (_cache[chatId]) return _cache[chatId];
        let book = null;
        try { const db = _db(); if (db && db.getAppData) book = await db.getAppData(APP_ID, DATA_KEY, chatId); } catch (e) {}
        if (!book || !Array.isArray(book.items)) book = { items: [] };
        if (_cache[chatId]) return _cache[chatId];   // 等資料庫的時候別人已經讀進來了
        _cache[chatId] = book;
        // 個人檔案卡那張舊紙條：搬成第一則，寫進去之後才拿掉舊的
        try {
            const old = localStorage.getItem(OLD_NOTE_KEY(chatId));
            if (old && old.trim()) {
                const now = Date.now();
                book.items.push({ id: _newId(), by: 'me', title: '備忘錄', body: old.slice(0, BODY_MAX), photos: [], created: now - 1, updated: now - 1 });
                await _write(chatId);
                localStorage.removeItem(OLD_NOTE_KEY(chatId));
            }
        } catch (e) { console.warn('[記事本] 舊紙條搬家失敗', e); }
        return book;
    }
    function _write(chatId) {
        const prev = _queue[chatId] || Promise.resolve();
        const next = prev.then(async function () {
            const db = _db();
            if (!db || !db.saveAppData) throw new Error('資料庫還沒準備好');
            const book = _cache[chatId];
            await db.saveAppData(APP_ID, DATA_KEY, book ? JSON.parse(JSON.stringify(book)) : null, chatId);
            return true;
        });
        _queue[chatId] = next.catch(function () {});
        return next;
    }
    function _sorted(book) { return (book.items || []).slice().sort(function (a, b) { return (a.created || 0) - (b.created || 0); }); }
    function _headline(it, max) {
        const t = String(it.title || '').trim();
        const b = String(it.body || '').trim().split(/\n/)[0] || '';
        const s = t || b || ((it.photos || []).length ? '照片' : '');
        const n = max || BRIEF_LEN;
        return s.length > n ? s.slice(0, n) + '…' : s;
    }
    function _cleanPhotos(list) {
        return (list || []).filter(function (p) { return p && (p.src || p.desc); }).slice(0, PHOTO_MAX)
            .map(function (p) { return { src: String(p.src || ''), desc: String(p.desc || '').slice(0, 300), tries: p.tries || 0 }; });
    }

    async function add(chatId, item) {
        const book = await load(chatId);
        const now = Date.now();
        const it = {
            id: _newId(),
            by: item.by === 'char' ? 'char' : 'me',
            title: String(item.title || '').slice(0, TITLE_MAX),
            body: String(item.body || '').slice(0, BODY_MAX),
            photos: _cleanPhotos(item.photos),
            created: now,
            updated: now
        };
        book.items.push(it);
        await _write(chatId);
        return it;
    }
    async function update(chatId, id, patch) {
        const book = await load(chatId);
        const it = book.items.find(function (x) { return x.id === id; });
        if (!it) return null;
        if (patch.title != null) it.title = String(patch.title).slice(0, TITLE_MAX);
        if (patch.body != null) it.body = String(patch.body).slice(0, BODY_MAX);
        if (patch.photos) it.photos = _cleanPhotos(patch.photos);
        it.updated = Date.now();
        await _write(chatId);
        return it;
    }
    async function remove(chatId, id) {
        const book = await load(chatId);
        const before = book.items.length;
        book.items = book.items.filter(function (x) { return x.id !== id; });
        if (book.items.length !== before) await _write(chatId);
        return book.items.length !== before;
    }
    // 聯絡人／聊天室整個刪掉時一起丟
    async function removeChat(chatId) {
        if (!chatId) return;
        _cache[chatId] = { items: [] };
        try { await _write(chatId); } catch (e) {}
        delete _cache[chatId];
        try { localStorage.removeItem(OLD_NOTE_KEY(chatId)); } catch (e) {}
    }

    // ── 給 AI 的目錄 ─────────────────────────────────────
    // 號碼照「記下來的先後」排，最舊的是 1 號——它要改哪一則就寫號碼，號碼不會因為新增而變。
    // 通話那條只給目錄不教怎麼寫：講電話的時候寫不了字，[系統: …] 那一行會被念出來。
    async function brief(chatId, opts) {
        const o = opts || {};
        if (!chatId) return '';
        const book = await load(chatId);
        const all = _sorted(book);
        const who = _userName() || '對方';
        const lines = [];
        const start = Math.max(0, all.length - BRIEF_MAX);
        for (let i = start; i < all.length; i++) {
            const it = all[i];
            const _PI2 = _pi();   // 照片描述只給前段：後段是畫圖用的英文，不必餵回去
            const descs = (it.photos || []).map(function (p) { return (_PI2 && _PI2.textOnly) ? _PI2.textOnly(p.desc) : p.desc; }).filter(Boolean);
            const n = (it.photos || []).length;
            const ph = n ? '（照片 ' + n + ' 張' + (descs.length ? '：' + descs.join('；') : '') + '）' : '';
            lines.push((i + 1) + ' 號｜' + (it.by === 'char' ? '你記的' : who + '記的') + '｜' + _headline(it) + ph);
        }
        if (o.call) {
            if (!lines.length) return '';
            return ['【你們的記事本｜只有你們兩個看得到，一則一行】'].concat(start ? ['（更早的還有 ' + start + ' 則沒列出來）'] : []).concat(lines).join('\n');
        }
        const head = lines.length
            ? ['【你們的記事本｜只有你們兩個看得到，一則一行，全文與照片不在這裡】'].concat(start ? ['（更早的還有 ' + start + ' 則沒列出來）'] : []).concat(lines)
            : ['【你們的記事本｜只有你們兩個看得到，現在還是空的】'];
        return head.concat([
            '',
            '這段對話裡有值得留下來的東西（約定、地址、去過的地方、心得、跟' + who + '有關的事），就記一筆：回覆的最後單獨一行寫 [系統: 記一筆｜標題｜內容]；想附照片就在後面接「｜照片：給人看的一句中文 >> 畫圖用的英文句子」，一張接一次（那兩段中間一定要有 >>：前段是記事本上顯示的那句，中文寫短；後段拿去畫圖，寫成完整的英文句子，把畫面裡有誰、長相穿著、在做什麼、在哪裡講完）。',
            '要改你自己記過的某一則，單獨一行寫 [系統: 改記事本 號碼｜新的內容]。',
            '那一行不會變成聊天訊息。不必每輪都記，沒有值得留的就不寫；已經記過的事別重複記。'
        ]).join('\n');
    }

    // [系統: 記一筆｜標題｜內容｜照片：描述] → 馬上回那一則（聊天室要用它的 id 做「點了打開」），寫入在背後排隊
    function addFromAi(chatId, text, chatName) {
        if (!chatId) return null;
        const parts = String(text || '').replace(/\]+\s*$/, '').split(/[|｜]/).map(function (s) { return s.trim(); }).filter(Boolean);
        const photos = [], words = [];
        parts.forEach(function (p) {
            const m = p.match(/^(?:照片|相片|圖片|图片)\s*[:：]\s*(.+)$/);
            if (m) photos.push({ src: '', desc: m[1].trim() });
            else words.push(p);
        });
        if (!words.length && !photos.length) return null;
        const title = words.length > 1 ? words[0] : '';
        const body = words.length > 1 ? words.slice(1).join('\n') : (words[0] || '');
        const now = Date.now();
        const it = { id: _newId(), by: 'char', title: title.slice(0, TITLE_MAX), body: body.slice(0, BODY_MAX), photos: _cleanPhotos(photos), created: now, updated: now };
        load(chatId).then(function (book) {
            book.items.push(it);
            return _write(chatId);
        }).then(function () { _refreshIfOpen(chatId); })
          .catch(function (e) { console.warn('[記事本] 角色記的那筆存不進去', e); });
        return { item: it, notice: (chatName || _chatName(chatId) || '對方') + ' 記了一筆：' + _headline(it, 30) };
    }
    // [系統: 改記事本 號碼｜新的內容]：只改它自己記的那幾則，她寫的不讓它蓋掉
    function editFromAi(chatId, num, text) {
        const body = String(text || '').replace(/\]+\s*$/, '').trim();
        if (!chatId || !body || !(num >= 1)) return null;
        const book = _cache[chatId];
        const pick = function (bk) {
            const it = _sorted(bk)[num - 1];
            return (it && it.by === 'char') ? it : null;
        };
        const hit = book ? pick(book) : null;
        load(chatId).then(function (bk) {
            const it = pick(bk);
            if (!it) return;
            it.body = body.slice(0, BODY_MAX);
            it.updated = Date.now();
            return _write(chatId).then(function () { _refreshIfOpen(chatId); });
        }).catch(function (e) { console.warn('[記事本] 角色改那則存不進去', e); });
        return hit;
    }

    // ── 她放的照片只給它看一次 ───────────────────────────────
    async function _dataUrlOf(id) {
        const db = _db();
        const blobUrl = db && db.getImage ? await db.getImage(id) : '';
        if (!blobUrl) return '';
        try {
            const blob = await (await fetch(blobUrl)).blob();
            return await new Promise(function (res, rej) { const rd = new FileReader(); rd.onload = function () { res(String(rd.result || '')); }; rd.onerror = rej; rd.readAsDataURL(blob); });
        } finally { try { URL.revokeObjectURL(blobUrl); } catch (e) {} }
    }
    async function photoOnceMessage(chatId) {
        _photoBatch = { chatId: chatId || '', refs: [] };
        if (!chatId) return null;
        const pi = _pi();
        // 👁 設置裡的「看圖」：關著就不送圖（目錄裡只寫照片）；交給小模型就讓它寫描述，這一輪只送文字
        const mode = (pi && pi.visionMode) ? pi.visionMode() : 'off';
        if (mode === 'off') return null;
        const book = await load(chatId);
        const pend = [];
        _sorted(book).forEach(function (it, idx) {
            (it.photos || []).forEach(function (p, pIdx) {
                if (it.by === 'me' && p.src && pi && pi.isDbId(p.src) && !p.desc && (p.tries || 0) < PHOTO_TRIES) pend.push({ it: it, p: p, num: idx + 1 });
            });
        });
        const pick = pend.slice(-PHOTO_ONCE_MAX);
        const urls = [], used = [];
        for (const x of pick) {
            let url = '';
            try { url = await _dataUrlOf(x.p.src); } catch (e) {}
            if (!url) continue;
            x.p.tries = (x.p.tries || 0) + 1;
            used.push(x);
            urls.push(url);
        }
        if (!used.length) return null;
        if (mode === 'helper') {
            let descs = [];
            try { descs = await pi.describeImages(urls, '這是放進兩人共用記事本的照片。'); } catch (e) { pi.visionFailed(e); }
            const lines = [];
            used.forEach(function (x, i) {
                if (!descs[i]) return;
                x.p.desc = descs[i].slice(0, 300);
                lines.push('記事本 ' + x.num + ' 號那張：' + x.p.desc);
            });
            _write(chatId).catch(function () {});
            if (!lines.length) return null;
            return { role: 'user', content: '（這是' + (_userName() || '對方') + '放進你們記事本的照片。' + lines.join('；') + '。）' };
        }
        const parts = urls.map(function (url) { return { type: 'image_url', image_url: { url: url } }; });
        _write(chatId).catch(function () {});
        _photoBatch.refs = used;
        const n = used.length;
        const where = used.map(function (x, i) { return (n > 1 ? '第 ' + (i + 1) + ' 張' : '這張') + '在記事本 ' + x.num + ' 號'; }).join('，');
        const text = '（這是' + (_userName() || '對方') + '放進你們記事本的' + (n > 1 ? ' ' + n + ' 張照片' : '照片') + '：' + where + '。'
            + '看完在回覆的最後，' + (n > 1 ? '每張各' : '') + '單獨一行寫：[系統: 記事本照片 ' + (n > 1 ? '編號' : '1') + ' 一句話描述]，'
            + '之後就不用再看圖了。那一行不會變成聊天訊息。）';
        return { role: 'user', content: [{ type: 'text', text: text }].concat(parts) };
    }
    function rememberPhoto(num, desc) {
        const s = String(desc || '').replace(/\]+\s*$/, '').trim();
        const refs = _photoBatch.refs;
        if (!s || !refs.length) return false;
        const x = (num >= 1 && num <= refs.length) ? refs[num - 1] : refs.find(function (r) { return !r.p.desc; });
        if (!x) return false;
        x.p.desc = s.slice(0, 300);
        _write(_photoBatch.chatId).catch(function () {});
        return true;
    }

    // ── 畫面 ─────────────────────────────────────────
    let _root = null;
    let _chatId = '';
    let _draft = null;   // 正在編輯的那一則（新的還沒有 id）

    function close() {
        if (_root) { try { _root.remove(); } catch (e) {} }
        _root = null; _chatId = ''; _draft = null;
    }
    function _refreshIfOpen(chatId) {
        if (_root && _chatId === chatId && !_draft) _renderGrid();
    }
    function _fmtDate(ts) {
        const t = new Date(ts || Date.now());
        return (t.getMonth() + 1) + '/' + t.getDate();
    }

    async function open(chatId, itemId) {
        const host = (win.wxApp && win.wxApp.APP_CONTAINER) || null;
        if (!host || !chatId) return false;
        close();
        _chatId = chatId;
        const name = _chatName(chatId);
        _root = d.createElement('div');
        _root.className = 'wxnb-root';
        _root.innerHTML =
            '<div class="wxnb-head">' +
            '  <button class="wxnb-back" type="button" data-act="close"><i class="fa-solid fa-chevron-left"></i></button>' +
            '  <div class="wxnb-head-t"><div class="wxnb-title">記事本</div>' + (name ? '<div class="wxnb-sub">' + _esc(name) + '</div>' : '') + '</div>' +
            '  <span class="wxnb-head-pad"></span>' +
            '</div>' +
            '<div class="wxnb-search"><i class="fa-solid fa-magnifying-glass"></i><input class="wxnb-q" type="text" placeholder="搜尋" autocomplete="off"></div>' +
            '<div class="wxnb-scroll"><div class="wxnb-grid"></div>' +
            '  <div class="wxnb-empty" hidden><i class="fa-solid fa-box-open"></i><div class="wxnb-empty-t">這裡還是空的</div>' +
            '  <div class="wxnb-empty-s">約定、地址、去過的地方、發票單子，都可以丟進來</div></div>' +
            '</div>' +
            '<button class="wxnb-fab" type="button" data-act="new"><i class="fa-solid fa-plus"></i></button>';
        host.appendChild(_root);
        _root.querySelector('[data-act="close"]').onclick = close;
        _root.querySelector('[data-act="new"]').onclick = function () { _openEditor(null); };
        _root.querySelector('.wxnb-q').addEventListener('input', function () { _renderGrid(); });
        _root.querySelector('.wxnb-grid').addEventListener('click', function (e) {
            const card = e.target.closest && e.target.closest('.wxnb-card');
            if (card) _openEditor(card.dataset.id);
        });
        await load(chatId);
        if (!_root || _chatId !== chatId) return false;
        _renderGrid();
        if (itemId) _openEditor(itemId);
        return true;
    }

    function _thumbHTML(p) {
        const pi = _pi();
        if (p.src && pi && pi.isDbId(p.src)) return '<img class="wxnb-thumb" data-db-img="' + _esc(p.src) + '" alt="">';
        if (p.src && pi && pi.isUrl(p.src)) return '<img class="wxnb-thumb" src="' + _esc(p.src) + '" alt="">';
        return '<div class="wxnb-thumb-desc"><i class="fa-regular fa-image"></i><span>' + _esc(pi ? pi.displayText(p.desc) : p.desc) + '</span></div>';
    }
    function _renderGrid() {
        if (!_root) return;
        const book = _cache[_chatId] || { items: [] };
        const q = String((_root.querySelector('.wxnb-q') || {}).value || '').trim().toLowerCase();
        const name = _chatName(_chatId) || '對方';
        const list = _sorted(book).reverse().filter(function (it) {
            if (!q) return true;
            const hay = [it.title, it.body].concat((it.photos || []).map(function (p) { return p.desc; })).join(' ').toLowerCase();
            return hay.indexOf(q) >= 0;
        });
        const grid = _root.querySelector('.wxnb-grid');
        grid.innerHTML = list.map(function (it) {
            const ph = (it.photos || [])[0];
            const more = (it.photos || []).length > 1 ? '<span class="wxnb-more">+' + ((it.photos || []).length - 1) + '</span>' : '';
            return '<div class="wxnb-card' + (it.by === 'char' ? ' by-char' : '') + '" data-id="' + _esc(it.id) + '">' +
                (ph ? '<div class="wxnb-card-ph">' + _thumbHTML(ph) + more + '</div>' : '') +
                (it.title ? '<div class="wxnb-card-t">' + _esc(it.title) + '</div>' : '') +
                (it.body ? '<div class="wxnb-card-b">' + _esc(it.body) + '</div>' : '') +
                '<div class="wxnb-card-f"><span class="wxnb-who">' + _esc(it.by === 'char' ? name : '我') + '</span><span>' + _fmtDate(it.created) + '</span></div>' +
                '</div>';
        }).join('');
        const empty = _root.querySelector('.wxnb-empty');
        empty.hidden = list.length > 0 || !!q;
        try { const pi = _pi(); if (pi && pi.hydrate) pi.hydrate(grid); } catch (e) {}
    }

    function _openEditor(id) {
        if (!_root) return;
        const book = _cache[_chatId] || { items: [] };
        const src = id ? book.items.find(function (x) { return x.id === id; }) : null;
        if (id && !src) return;
        _draft = src ? JSON.parse(JSON.stringify(src)) : { id: '', by: 'me', title: '', body: '', photos: [], created: Date.now() };
        const name = _chatName(_chatId) || '對方';
        const sheet = d.createElement('div');
        sheet.className = 'wxnb-edit';
        sheet.innerHTML =
            '<div class="wxnb-edit-bar">' +
            '  <button class="wxnb-edit-x" type="button" data-act="cancel">取消</button>' +
            '  <div class="wxnb-edit-who">' + (src ? _esc(src.by === 'char' ? name : '我') + '記的 · ' + _fmtDate(src.created) : '記一筆') + '</div>' +
            '  <button class="wxnb-edit-ok" type="button" data-act="save">存</button>' +
            '</div>' +
            '<div class="wxnb-edit-body">' +
            '  <input class="wxnb-in-t" type="text" maxlength="' + TITLE_MAX + '" placeholder="標題" autocomplete="off">' +
            '  <textarea class="wxnb-in-b" maxlength="' + BODY_MAX + '" placeholder="寫點什麼"></textarea>' +
            '  <div class="wxnb-photos"></div>' +
            (src ? '  <button class="wxnb-del" type="button" data-act="del"><i class="fa-solid fa-trash-can"></i>刪掉這則</button>' : '') +
            '</div>';
        _root.appendChild(sheet);
        sheet.querySelector('.wxnb-in-t').value = _draft.title;
        sheet.querySelector('.wxnb-in-b').value = _draft.body;
        _renderPhotos(sheet);
        const bye = function () { try { sheet.remove(); } catch (e) {} _draft = null; _renderGrid(); };
        sheet.querySelector('[data-act="cancel"]').onclick = bye;
        sheet.querySelector('[data-act="save"]').onclick = async function () {
            const title = sheet.querySelector('.wxnb-in-t').value.trim();
            const body = sheet.querySelector('.wxnb-in-b').value.trim();
            const photos = _draft.photos;
            try {
                if (!src) {
                    if (title || body || photos.length) await add(_chatId, { by: 'me', title: title, body: body, photos: photos });
                } else {
                    await update(_chatId, src.id, { title: title, body: body, photos: photos });
                }
                bye();
            } catch (e) {
                console.warn('[記事本] 存不進去', e);
                const A = _aui(); if (A && A.toast) A.toast('存不進去，再試一次');
            }
        };
        const del = sheet.querySelector('[data-act="del"]');
        if (del) del.onclick = async function () {
            const A = _aui();
            const ok = A && A.confirm ? await A.confirm('刪掉這則？刪了就找不回來了。') : true;
            if (!ok) return;
            try { await remove(_chatId, src.id); bye(); }
            catch (e) { if (A && A.toast) A.toast('刪不掉，再試一次'); }
        };
    }

    function _renderPhotos(sheet) {
        const box = sheet.querySelector('.wxnb-photos');
        if (!box || !_draft) return;
        const pi = _pi();
        const tiles = _draft.photos.map(function (p, i) {
            let inner;
            if (p.src && pi) inner = pi.render(p.src, { fill: true });
            else if (pi) inner = pi.card(p.desc, { fill: true, app: 'wxnb', ref: _chatId + '|' + _draft.id + '|' + i });
            else inner = '<div class="wxnb-thumb-desc"><span>' + _esc(p.desc) + '</span></div>';
            return '<div class="wxnb-tile">' + inner + '<button class="wxnb-tile-x" type="button" data-rm="' + i + '"><i class="fa-solid fa-xmark"></i></button></div>';
        });
        if (_draft.photos.length < PHOTO_MAX) tiles.push('<button class="wxnb-tile wxnb-tile-add" type="button" data-act="addph"><i class="fa-solid fa-camera"></i><span>照片</span></button>');
        box.innerHTML = tiles.join('');
        try { if (pi && pi.hydrate) pi.hydrate(box); } catch (e) {}
        box.querySelectorAll('[data-rm]').forEach(function (b) {
            b.onclick = function (e) { e.stopPropagation(); _draft.photos.splice(parseInt(b.dataset.rm, 10), 1); _renderPhotos(sheet); };
        });
        const addBtn = box.querySelector('[data-act="addph"]');
        if (addBtn) addBtn.onclick = async function () {
            const db = _db();
            if (!pi || !pi.pickPhoto || !db || !db.saveImage) { const A = _aui(); if (A && A.toast) A.toast('這裡還不能放照片'); return; }
            let dataUrl = '';
            try { dataUrl = await pi.pickPhoto(); } catch (e) { const A = _aui(); if (A && A.toast) A.toast('照片讀不進來'); return; }
            if (!dataUrl || !_draft) return;
            addBtn.disabled = true;
            try {
                const blob = await (await fetch(dataUrl)).blob();
                const id = 'img_wxnb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
                await db.saveImage(id, blob);
                _draft.photos.push({ src: id, desc: '', tries: 0 });
                _renderPhotos(sheet);
            } catch (e) {
                console.warn('[記事本] 照片存不進去', e);
                const A = _aui(); if (A && A.toast) A.toast('照片存不進去');
                addBtn.disabled = false;
            }
        };
    }

    // 角色描述的照片按「展開圖片」生完 → 寫回那一則
    try {
        const pi = _pi();
        if (pi && pi.onDone) pi.onDone('wxnb', async function (ref, url) {
            const parts = String(ref || '').split('|');
            const chatId = parts[0], id = parts[1], idx = parseInt(parts[2], 10);
            if (!chatId || !id || isNaN(idx)) return;
            const book = await load(chatId);
            const it = book.items.find(function (x) { return x.id === id; });
            if (it && it.photos[idx]) { it.photos[idx].src = url; it.updated = Date.now(); await _write(chatId); }
            if (_draft && _draft.id === id && _draft.photos[idx]) _draft.photos[idx].src = url;
        });
    } catch (e) {}

    win.WX_NOTEBOOK = {
        open: open,
        close: close,
        load: load,
        add: add,
        update: update,
        remove: remove,
        removeChat: removeChat,
        brief: brief,
        addFromAi: addFromAi,
        editFromAi: editFromAi,
        photoOnceMessage: photoOnceMessage,
        rememberPhoto: rememberPhoto
    };
    if (win !== window) { try { window.WX_NOTEBOOK = win.WX_NOTEBOOK; } catch (e) {} }
})();
