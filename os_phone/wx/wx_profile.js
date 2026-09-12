// ----------------------------------------------------------------
// [微信] wx_profile.js —— 個人檔案卡（點頭像／點聊天室標題／點通訊錄的頭像都開得出來）
// 職責：
//   一個人長什麼樣、叫什麼、現在那一句話，攤成一整屏——就是 LINE 那種個人檔案頁。
//   「那一句話」＝聯絡人本來就有的個性簽名（contact.desc），不另外開欄位：
//   AI 在劇情裡改了 bio，這張卡就跟著變。
//   背景用那個人的聊天背景（微信那間設的那張）；沒設就用他的頭像放大模糊當底。
// 🚨 背景與頭像一律走 <img>.src / 既有的 hydrate，不塞進 CSS 變數——
//    圖庫拿回來的可能是很長的 dataURL，塞 CSS 變數會被瀏覽器整條丟掉。
// 對外：WX_PROFILE.open(idOrName) / close()
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const d = win.document;

    const NOTE_KEY = (id) => 'wx_note_' + id;
    const NOTE_MAX = 4000;

    function _esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function _contacts() {
        try {
            const C = win.WX_CONTACTS || window.WX_CONTACTS;
            return (C && C.getAllCustomContacts) ? (C.getAllCustomContacts() || []) : [];
        } catch (e) { return []; }
    }
    function _chats() {
        try { return (win.wxApp && win.wxApp.GLOBAL_CHATS) || {}; } catch (e) { return {}; }
    }

    // 給什麼都認：聯絡人 id、聊天室 id、或者就是一個名字
    function _resolve(key) {
        const k = String(key == null ? '' : key).trim();
        if (!k) return null;
        const list = _contacts();
        let c = list.find(function (x) { return x && x.id === k; });
        if (!c) c = list.find(function (x) { return x && !x.isGroup && x.name === k; });
        const chats = _chats();
        const chat = chats[k] || (c ? chats[c.id] : null) ||
            Object.keys(chats).map(function (i) { return chats[i]; }).find(function (x) { return x && x.name === k; });
        if (!c && !chat) return null;
        return {
            id: (c && c.id) || (chat && chat.id) || k,
            name: (c && c.name) || (chat && chat.name) || k,
            bio: (c && (c.desc || c.bio)) || (chat && chat.desc) || '',
            avatar: (c && c.customAvatar) || (chat && chat.customAvatar) || '',
            vnName: (c && c.realName) || (chat && chat.realName) || '',
            isGroup: !!((c && c.isGroup) || (chat && chat.isGroup))
        };
    }

    // 這個人的聊天背景（跟 VN 劇情手機吃的是同一張）
    async function _bgUrl(id) {
        try {
            const S = win.WX_CHAT_SETTINGS || window.WX_CHAT_SETTINGS;
            if (S && S.bgUrlFor) return (await S.bgUrlFor(id)) || '';
        } catch (e) {}
        return '';
    }
    async function _avatarUrl(p) {
        const raw = String(p.avatar || '');
        if (!raw) return '';
        if (raw.indexOf('img_') === 0 || raw.indexOf('avt_') === 0) {
            try { return (win.OS_DB && win.OS_DB.getImage) ? ((await win.OS_DB.getImage(raw)) || '') : ''; }
            catch (e) { return ''; }
        }
        return raw;
    }

    let _root = null;

    function close() {
        if (_root) { try { _root.remove(); } catch (e) {} _root = null; }
    }

    async function open(key) {
        const p = _resolve(key);
        if (!p) return false;
        const host = (win.wxApp && win.wxApp.APP_CONTAINER) || null;
        if (!host) return false;
        close();

        _root = d.createElement('div');
        _root.className = 'wxpf-root';
        _root.innerHTML =
            '<img class="wxpf-bg" alt="">' +
            '<div class="wxpf-scrim"></div>' +
            '<button class="wxpf-x" type="button" title="關閉"><i class="fa-solid fa-xmark"></i></button>' +
            '<div class="wxpf-main">' +
            '  <div class="wxpf-ring"><div class="wxpf-avatar' + (p.vnName && !p.avatar ? ' vn-load-target' : '') + '"' +
                 (p.vnName && !p.avatar ? ' data-vn-name="' + _esc(p.vnName) + '"' : '') + '></div></div>' +
            '  <div class="wxpf-name">' + _esc(p.name) + '</div>' +
            '  <div class="wxpf-bio">' + (p.bio ? _esc(p.bio) : '還沒寫什麼') + '</div>' +
            '</div>' +
            '<div class="wxpf-acts">' +
            '  <button class="wxpf-act" type="button" data-act="chat"><i class="fa-solid fa-comment"></i><span>發訊息</span></button>' +
            '  <button class="wxpf-act" type="button" data-act="note"><i class="fa-solid fa-note-sticky"></i><span>備忘錄</span></button>' +
            '</div>';
        host.appendChild(_root);

        // 背景：他的聊天背景 → 沒有就用頭像當底（CSS 會把它放大模糊）
        const bgEl = _root.querySelector('.wxpf-bg');
        const avEl = _root.querySelector('.wxpf-avatar');
        const [bg, av] = await Promise.all([_bgUrl(p.id), _avatarUrl(p)]);
        if (av) {
            // 單一屬性指派，跟 wx_view 貼頭像那條同一個做法（動態網址沒有別的路）
            avEl.style.backgroundImage = "url('" + av + "')";
        } else if (p.vnName) {
            try { const V = win.WX_VIEW || window.WX_VIEW; if (V && V.hydrateAvatars) V.hydrateAvatars(_root); } catch (e) {}
        }
        const bgSrc = bg || av;
        if (bgSrc) { bgEl.src = bgSrc; _root.classList.add('has-bg'); }
        if (!bg && av) _root.classList.add('bg-from-avatar');

        _root.querySelector('.wxpf-x').onclick = close;
        _root.onclick = function (e) { if (e.target === _root) close(); };
        _root.querySelectorAll('.wxpf-act').forEach(function (b) {
            b.onclick = function () {
                if (b.dataset.act === 'chat') {
                    close();
                    try { win.wxApp.openChat(p.id); } catch (e) {}
                } else {
                    _openNote(p);
                }
            };
        });
        return true;
    }

    // 備忘錄：先給最小的一張紙條——她說筆記比較像這間聊天室的備忘錄，所以按聊天室存。
    // 🚨 目前不進 AI 的上下文（她只說要先有一顆按鈕）；要給 AI 看是另一件事。
    function _openNote(p) {
        if (!_root) return;
        let cur = '';
        try { cur = localStorage.getItem(NOTE_KEY(p.id)) || ''; } catch (e) {}
        const sheet = d.createElement('div');
        sheet.className = 'wxpf-note';
        sheet.innerHTML =
            '<div class="wxpf-note-card">' +
            '  <div class="wxpf-note-h">關於 ' + _esc(p.name) + '</div>' +
            '  <textarea class="wxpf-note-ta" maxlength="' + NOTE_MAX + '" placeholder="記點什麼：他怕什麼、欠我多少、答應過我的事…"></textarea>' +
            '  <div class="wxpf-note-btns">' +
            '    <button class="wxpf-note-b" type="button" data-x>關閉</button>' +
            '    <button class="wxpf-note-b solid" type="button" data-ok>存起來</button>' +
            '  </div>' +
            '</div>';
        _root.appendChild(sheet);
        const ta = sheet.querySelector('textarea');
        ta.value = cur;
        setTimeout(function () { try { ta.focus(); } catch (e) {} }, 30);
        const bye = function () { try { sheet.remove(); } catch (e) {} };
        sheet.onclick = function (e) { if (e.target === sheet) bye(); };
        sheet.querySelector('[data-x]').onclick = bye;
        sheet.querySelector('[data-ok]').onclick = function () {
            try {
                const v = ta.value.slice(0, NOTE_MAX);
                if (v.trim()) localStorage.setItem(NOTE_KEY(p.id), v);
                else localStorage.removeItem(NOTE_KEY(p.id));
                bye();
            } catch (e) {
                // 🚨 localStorage 滿了是靜默失敗，要講出來
                try { (win.AUI || window.AUI).toastr.error('存不進去，瀏覽器的空間滿了'); } catch (e2) {}
            }
        };
    }

    win.WX_PROFILE = { open: open, close: close, noteOf: function (id) { try { return localStorage.getItem(NOTE_KEY(id)) || ''; } catch (e) { return ''; } } };
    if (win !== window) { try { window.WX_PROFILE = win.WX_PROFILE; } catch (e) {} }
})();
