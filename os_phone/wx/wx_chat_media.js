// ----------------------------------------------------------------
// [檔案] wx_chat_media.js (V1)
// 路徑：os_phone/wx/wx_chat_media.js
// 職責：「聊天媒體」——把一間聊天室發過的圖片、影片、檔案、連結、位置攤出來看。
//   圖片那格點下去開看圖器（os_photo_viewer.js）：左右滑、縮放、還沒生成的也能在裡面展開。
//
// 資料不另外存：來源就是那間聊天室自己的訊息串（chat.messages），現掃現出。
//   所以它天然是「每間各自的」，也不會有第二份資料要跟著同步或清理；
//   刪訊息、清空聊天室，這頁跟著空掉，不會留孤兒。
//
// 🚨 標籤清單一律吃 WX_VIEW.MSG_TAG 那一份，不要在這裡另外手打。
//   以前媒體標籤散在五個地方各自維護，繁體那半全漏掉，訊息就變成裸文字。
//
// 相簿 app 是另一回事：那是全域圖庫（頭像快取那種），跟「這間聊天室發過什麼」不一樣。
// ----------------------------------------------------------------
(function () {
    'use strict';
    console.log('[WX] 載入聊天媒體模塊 (wx_chat_media V1)...');
    const win = window.parent || window;
    const doc = win.document;

    function _tags() {
        const V = win.WX_VIEW || window.WX_VIEW;
        return (V && V.MSG_TAG) ? V.MSG_TAG : null;
    }

    // 分頁：一格＝一種東西。順序就是她最常找的順序。
    const CATS = [
        { key: 'image', label: '圖片', icon: 'fa-image',    tags: ['IMAGE', 'VIDEO'] },
        { key: 'file',  label: '檔案', icon: 'fa-file',     tags: ['FILE'] },
        { key: 'link',  label: '連結', icon: 'fa-link',     tags: ['LINK', 'WBSHARE'] },
        { key: 'place', label: '位置', icon: 'fa-location-dot', tags: ['LOCATION'] },
    ];

    function _re(names) {
        const T = _tags();
        if (!T) return null;
        const parts = names.map(function (n) { return T[n]; }).filter(Boolean);
        if (!parts.length) return null;
        return new RegExp('\\[\\s*(?:' + parts.join('|') + ')\\s*[:：]\\s*([^\\]]*)\\]', 'gi');
    }

    function _msgs(chat) { return (chat && Array.isArray(chat.messages)) ? chat.messages : []; }

    // 掃出某一類的所有東西。回 [{ body, who, idx, when, kind }]
    function collect(chat, catKey) {
        const cat = CATS.find(function (c) { return c.key === catKey; });
        if (!cat) return [];
        const re = _re(cat.tags);
        if (!re) return [];
        const out = [];
        const list = _msgs(chat);
        const T = _tags();
        const videoRe = T && T.VIDEO ? new RegExp('^\\[\\s*(?:' + T.VIDEO + ')\\s*[:：]', 'i') : null;
        const taName = (chat && chat.name) || '對方';
        let me = '我';
        try { if (win.WX_USER && win.WX_USER.getInfo) me = win.WX_USER.getInfo().name || '我'; } catch (e) {}
        list.forEach(function (m, i) {
            if (!m || m.type === 'system' || m.isLoading) return;
            const text = String(m.content || m.raw || '');
            if (!text) return;
            re.lastIndex = 0;
            let hit;
            while ((hit = re.exec(text)) !== null) {
                const body = String(hit[1] || '').trim();
                if (!body) continue;
                out.push({
                    body: body,
                    who: m.isMe ? me : (m.senderName || m.sender || taName),
                    idx: i,
                    when: m.time || '',
                    kind: (videoRe && videoRe.test(hit[0])) ? 'video' : 'image'
                });
            }
        });
        return out.reverse();   // 新的在前
    }

    function counts(chat) {
        const o = {};
        CATS.forEach(function (c) { o[c.key] = collect(chat, c.key).length; });
        return o;
    }

    // ── 畫面 ─────────────────────────────────────────────
    const CSS = `
        .wxmed-page { position:absolute; inset:0; z-index:520; display:flex; flex-direction:column;
            background:#f2f2f2; color:#000; font-family:-apple-system,BlinkMacSystemFont,'Noto Sans TC',sans-serif; }
        .wxmed-page.wxmed-dark { background:#111; color:#f0f0f0; }
        .wxmed-head { flex:0 0 auto; display:flex; align-items:center; padding:0 8px;
            padding-top:env(safe-area-inset-top,0px); height:calc(50px + env(safe-area-inset-top,0px));
            background:#fff; border-bottom:1px solid #e5e5e5; }
        .wxmed-dark .wxmed-head { background:#1c1c1e; border-bottom-color:#2a2a2a; }
        .wxmed-back { width:44px; height:44px; display:flex; align-items:center; justify-content:center;
            font-size:18px; color:#576b95; cursor:pointer; }
        .wxmed-title { flex:1; text-align:center; font-size:17px; font-weight:600; }
        .wxmed-tabs { flex:0 0 auto; display:flex; background:#fff; border-bottom:1px solid #e5e5e5; }
        .wxmed-dark .wxmed-tabs { background:#1c1c1e; border-bottom-color:#2a2a2a; }
        .wxmed-tab { flex:1; padding:11px 0; text-align:center; font-size:14px; color:#888; cursor:pointer;
            border-bottom:2px solid transparent; }
        .wxmed-tab.on { color:#07c160; border-bottom-color:#07c160; font-weight:600; }
        .wxmed-body { flex:1; overflow-y:auto; padding:10px; }
        .wxmed-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; }
        .wxmed-cellimg { position:relative; aspect-ratio:1/1; border-radius:8px; overflow:hidden;
            background:#e6e6e6; cursor:pointer; }
        .wxmed-dark .wxmed-cellimg { background:#2a2a2a; }
        .wxmed-cellimg img { width:100%; height:100%; object-fit:cover; display:block; }
        .wxmed-celltx { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
            padding:8px; font-size:11px; color:#888; text-align:center; line-height:1.4; }
        .wxmed-cellic { position:absolute; top:7px; left:7px; font-size:12px; color:rgba(0,0,0,.35); }
        .wxmed-dark .wxmed-cellic { color:rgba(255,255,255,.4); }
        .wxmed-who { position:absolute; left:0; right:0; bottom:0; padding:3px 6px; font-size:10px;
            color:#fff; background:linear-gradient(transparent,rgba(0,0,0,.55)); }
        .wxmed-list { background:#fff; border-radius:12px; overflow:hidden; }
        .wxmed-dark .wxmed-list { background:#1c1c1e; }
        .wxmed-row { display:flex; align-items:center; gap:12px; padding:13px 14px; border-bottom:1px solid #f2f2f2; }
        .wxmed-dark .wxmed-row { border-bottom-color:#2a2a2a; }
        .wxmed-row:last-child { border-bottom:none; }
        .wxmed-ico { width:34px; height:34px; flex:0 0 auto; border-radius:8px; display:flex; align-items:center;
            justify-content:center; font-size:14px; background:#f2f2f2; color:#888; }
        .wxmed-dark .wxmed-ico { background:#2a2a2a; }
        .wxmed-txt { flex:1; min-width:0; }
        .wxmed-name { font-size:15px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .wxmed-sub { font-size:12px; color:#999; margin-top:3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .wxmed-empty { padding:56px 28px; text-align:center; color:#999; font-size:14px; line-height:1.9; }
        .wxmed-empty i { font-size:30px; display:block; margin-bottom:14px; color:#d8d8d8; }
    `;

    function _injectCss() {
        if (doc.getElementById('wx-chat-media-style')) return;
        const s = doc.createElement('style');
        s.id = 'wx-chat-media-style';
        s.textContent = CSS;
        (doc.head || doc.body).appendChild(s);
    }

    function _isDark() { try { return localStorage.getItem('wx_dark_mode') === '1'; } catch (e) { return false; } }
    function _esc(s) { return String(s == null ? '' : s).replace(/[<>&"]/g, function (c) { return ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]; }); }
    function _isUrl(s) { return /^(https?:\/\/|data:|blob:)/i.test(String(s || '').trim()); }

    // 圖片那格：是網址就直接放，是圖庫 id 就交給既有的載圖器，其餘（AI 只寫了描述）就顯示描述
    //   每格都帶 data-i（在這一類清單裡的位置），點下去從那張開看圖器
    function _imgCell(it, i) {
        const b = it.body;
        const who = '<div class="wxmed-who">' + _esc(it.who) + '</div>';
        const di = ' data-i="' + i + '"';
        if (_isUrl(b)) {
            return '<div class="wxmed-cellimg"' + di + '>'
                + '<img src="' + _esc(b) + '" loading="lazy">' + who + '</div>';
        }
        if (/^(img_|avt_)/.test(b)) {
            return '<div class="wxmed-cellimg db-load-target" data-db-bg="' + _esc(b) + '"' + di + '>' + who + '</div>';
        }
        const PI = win.OS_PHONE_IMAGE || window.OS_PHONE_IMAGE;
        const txt = PI && PI.displayText ? PI.displayText(b) : b;
        return '<div class="wxmed-cellimg"' + di + '>'
            + (it.kind === 'video' ? '<i class="fa-solid fa-video wxmed-cellic"></i>' : '')
            + '<div class="wxmed-celltx">' + _esc(txt.slice(0, 40)) + '</div>' + who + '</div>';
    }

    // 看圖器要的清單：圖庫 id 先換成網址；只有描述的圖給一個「展開圖片」——生完寫回那則訊息
    async function _viewerItems(chat, items) {
        const PI = win.OS_PHONE_IMAGE || window.OS_PHONE_IMAGE;
        return Promise.all(items.map(async function (it) {
            const o = { who: it.who, when: it.when, kind: it.kind };
            const b = it.body;
            if (_isUrl(b)) { o.src = b; return o; }
            if (/^(img_|avt_)/.test(b)) {
                try { o.src = await win.OS_DB.getImage(b); } catch (e) {}
                if (!o.src) o.desc = '這張圖找不到了';
                return o;
            }
            o.desc = b;
            if (it.kind !== 'video' && PI && PI.makeUrl && win.wxApp && win.wxApp.setImageUrl) {
                const chatId = _cur.chatId;
                o.gen = async function () {
                    const url = await PI.makeUrl(b);
                    await win.wxApp.setImageUrl(chatId, it.idx, b, url);
                    if (_cur.chatId === chatId) _render();   // 底下的格子也換成真的圖
                    return url;
                };
            }
            return o;
        }));
    }

    async function _openViewer(i) {
        const V = win.OS_PHOTO_VIEWER || window.OS_PHOTO_VIEWER;
        const chat = win.wxApp && win.wxApp.GLOBAL_CHATS ? win.wxApp.GLOBAL_CHATS[_cur.chatId] : null;
        if (!V || !chat) return;
        const items = await _viewerItems(chat, collect(chat, 'image'));
        const cellOf = function (k) { return doc.querySelector('#wx-chat-media-page .wxmed-cellimg[data-i="' + k + '"]'); };
        V.open(items, i, { fromEl: cellOf(i), thumbOf: cellOf });
    }

    function _rowsHtml(items, icon) {
        return '<div class="wxmed-list">' + items.map(function (it) {
            return '<div class="wxmed-row">'
                + '<div class="wxmed-ico"><i class="fa-solid ' + icon + '"></i></div>'
                + '<div class="wxmed-txt">'
                + '<div class="wxmed-name">' + _esc(it.body.slice(0, 60)) + '</div>'
                + '<div class="wxmed-sub">' + _esc(it.who) + (it.when ? ' · ' + _esc(it.when) : '') + '</div>'
                + '</div></div>';
        }).join('') + '</div>';
    }

    let _cur = { chatId: '', cat: '' };

    function _bodyHtml(chat, catKey) {
        const cat = CATS.find(function (c) { return c.key === catKey; });
        const items = collect(chat, catKey);
        if (!items.length) {
            return '<div class="wxmed-empty"><i class="fa-solid ' + cat.icon + '"></i>'
                + '這裡還沒有' + cat.label + '。</div>';
        }
        if (catKey === 'image') {
            return '<div class="wxmed-grid">' + items.map(function (it, i) { return _imgCell(it, i); }).join('') + '</div>';
        }
        return _rowsHtml(items, cat.icon);
    }

    function _render() {
        const el = doc.getElementById('wx-chat-media-page');
        if (!el) return;
        const chat = win.wxApp && win.wxApp.GLOBAL_CHATS ? win.wxApp.GLOBAL_CHATS[_cur.chatId] : null;
        const n = counts(chat);
        // 空的那幾類不佔位置：只列有東西的。
        const live = CATS.filter(function (c) { return n[c.key] > 0; });
        if (!live.some(function (c) { return c.key === _cur.cat; }) && live.length) _cur.cat = live[0].key;
        // 🚨 整間都空的時候不要只說「還沒有圖片」——那會讓人以為只是圖片沒有。
        //    分頁整排收起來，直接把話講完。
        const allEmpty = !live.length;

        el.innerHTML = '<div class="wxmed-head">'
            + '<div class="wxmed-back" data-wxmed="close"><i class="fa-solid fa-chevron-left"></i></div>'
            + '<div class="wxmed-title">聊天媒體</div>'
            + '<div style="width:44px"></div>'
            + '</div>'
            + (allEmpty ? '' : ('<div class="wxmed-tabs">' + live.map(function (c) {
                return '<div class="wxmed-tab' + (c.key === _cur.cat ? ' on' : '') + '" data-cat="' + c.key + '">'
                    + c.label + ' ' + n[c.key] + '</div>';
            }).join('') + '</div>'))
            + '<div class="wxmed-body">' + (allEmpty
                ? '<div class="wxmed-empty"><i class="fa-solid fa-box-open"></i>這間聊天室還沒有發過圖片、檔案或連結。<br>之後聊天裡發的都會收在這裡。</div>'
                : _bodyHtml(chat, _cur.cat)) + '</div>';

        el.querySelectorAll('[data-wxmed="close"]').forEach(function (b) { b.onclick = close; });
        el.querySelectorAll('[data-cat]').forEach(function (t) {
            t.onclick = function () { _cur.cat = t.getAttribute('data-cat'); _render(); };
        });
        el.querySelectorAll('.wxmed-cellimg[data-i]').forEach(function (c) {
            c.onclick = function () { _openViewer(parseInt(c.getAttribute('data-i'), 10) || 0); };
        });
        // 圖庫 id 那種自己貼底圖。wx_view 那支掃 .db-load-target 的動作寫死在它自己的 render 裡，
        // 這頁不在那條路上，掃不到。
        el.querySelectorAll('.db-load-target').forEach(async function (t) {
            const id = t.getAttribute('data-db-bg');
            if (!id) return;
            try {
                const url = await win.OS_DB.getImage(id);
                if (url) { t.style.backgroundImage = "url('" + url + "')"; t.style.backgroundSize = 'cover'; t.style.backgroundPosition = 'center'; }
            } catch (e) {}
        });
    }

    function _container() {
        try { if (win.wxApp && win.wxApp.APP_CONTAINER) return win.wxApp.APP_CONTAINER; } catch (e) {}
        return doc.body;
    }

    function open(chatId) {
        _injectCss();
        close();
        _cur = { chatId: chatId, cat: 'image' };
        const el = doc.createElement('div');
        el.id = 'wx-chat-media-page';
        el.className = 'wxmed-page' + (_isDark() ? ' wxmed-dark' : '');
        _container().appendChild(el);
        _render();
    }

    function close() {
        const el = doc.getElementById('wx-chat-media-page');
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    win.WX_CHAT_MEDIA = {
        CATS: CATS, collect: collect, counts: counts,
        open: open, close: close
    };
    if (win !== window) { try { window.WX_CHAT_MEDIA = win.WX_CHAT_MEDIA; } catch (e) {} }
})();
