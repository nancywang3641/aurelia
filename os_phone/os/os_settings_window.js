// ----------------------------------------------------------------
// [檔案] os_settings_window.js — 「設置」窗口（2026-11-17）
// 職責：把以前分三處的設置收進同一個窗口——手機裡的系統設置、大廳齒輪的大廳設置、劇情裡的設定窗。
//       她：「設置功能太散了…全部歸列，不再放到手機框裡了…以後兩個捷徑可走? 大廳的這個設置窗口，
//       VN劇情裡的那個設置按鈕也能打開設置窗口?」。版面照 Claude Design 那份（本機 tmp/settings_window_design）。
// 這支只管殼：開關、左邊（手機是上面）那排分類、哪個分類畫哪一頁。每一頁的內容由原本管那些設定的檔案畫進來：
//       大廳＝LobbyStage.mountSettings(box)（core/void/lobby_stage.js）。
// 版面：開的那一格夠大＝浮在中間、四邊留空、後面壓暗（點暗處或右上 ✕ 關）；小（手機寬）＝鋪滿，上面一排分類、左上返回。
//       顏色一律白底藍字，不跟手機主題（樣式在 css/os_settings_window.css）。
// 入口：window.OS_SETTINGS_WINDOW.open(分類 id, { onClose })／close()／isOpen()／go(分類 id)。
//       分類 id：lobby（之後幾步會加 home／ai／img／voice／story／sys）。沒有那個分類就開第一個。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const doc = win.document;

    // 分類：順序就是畫面上的順序；name＝電腦左邊那排的字，short＝手機上面那排的字（340px 寬七個要排得下，所以短）
    //   mount(box, api)＝第一次切到這頁時畫一次；回傳的函式（有的話）在關窗時叫，讓那一頁收拾自己掛的東西
    const SECTIONS = [
        { id: 'lobby', name: '大廳', short: '大廳', mount: function (box) { const L = win.LobbyStage || window.LobbyStage; if (L && L.mountSettings) return L.mountSettings(box); box.textContent = '大廳還沒載入完整，請重新整理一次。'; } },
    ];
    const secOf = function (id) { return SECTIONS.find(function (s) { return s.id === id; }) || SECTIONS[0]; };

    let S = null;   // 開著的那一個窗：{ root, scrim, host, sec, pages:{id:el}, offs:[], onClose, onResize }

    function shown(el) { return !!(el && el.getClientRects().length && el.clientWidth > 0 && el.clientHeight > 0); }
    // 掛在哪：浮動手機開著（從手機的「設置」圖示來）或沒有主窗口那一格＝整個畫面；不然跟著奧瑞亞主窗口那一格（大廳、劇情都在裡面），
    //   不蓋到酒館自己的畫面。瀏覽器真的全螢幕時只有全螢幕那個元素裡面的東西看得到，所以掛進它裡面。
    function pickHost() {
        if (shown(doc.getElementById('aurelia-phone-shell'))) return null;
        const scr = doc.getElementById('aurelia-phone-screen');
        return shown(scr) ? scr : null;
    }

    function navHtml() {
        return SECTIONS.map(function (s) {
            return '<button type="button" class="asw-nav-item" role="tab" data-sec="' + s.id + '">'
                 +   '<span class="asw-nav-long">' + s.name + '</span><span class="asw-nav-short">' + s.short + '</span>'
                 + '</button>';
        }).join('');
    }

    function open(section, opts) {
        if (S) { go(section); return; }
        const host = pickHost();
        const root = doc.createElement('div');
        root.className = 'asw-root' + (host ? ' asw-in-screen' : '');
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', '設置');
        root.innerHTML =
            '<div class="asw-top sysh">'
          +   '<button type="button" class="sysh-back" data-act="close" aria-label="返回"></button>'
          +   '<div class="sysh-title">設置</div>'
          + '</div>'
          + '<div class="asw-frame">'
          +   '<aside class="asw-side">'
          +     '<div class="asw-side-title"><i class="fa-solid fa-gear"></i><span>設置</span></div>'
          +     '<nav class="asw-nav" role="tablist">' + navHtml() + '</nav>'
          +   '</aside>'
          +   '<main class="asw-main">'
          +     '<header class="asw-head"><h2 class="asw-title"></h2>'
          +       '<button type="button" class="asw-x" data-act="close" aria-label="關閉"><i class="fa-solid fa-xmark"></i></button></header>'
          +     '<div class="asw-body"></div>'
          +   '</main>'
          + '</div>';
        const scrim = doc.createElement('div');
        scrim.className = 'asw-scrim' + (host ? ' asw-in-screen' : '');
        scrim.addEventListener('click', function () { close(); });
        const parent = host || doc.fullscreenElement || doc.webkitFullscreenElement || doc.body;
        parent.appendChild(scrim);
        parent.appendChild(root);
        S = { root: root, scrim: scrim, host: host, sec: null, pages: {}, offs: [], onClose: (opts && opts.onClose) || null };
        S.onResize = function () { fit(); };
        try { win.addEventListener('resize', S.onResize); } catch (e) {}
        root.addEventListener('click', onClick);
        doc.addEventListener('keydown', onKey, true);
        fit();
        go(section);
    }

    // 夠大就浮在中間（左邊一排分類）；不夠大（手機寬，或視窗被拉小）就鋪滿（上面一排分類）。開的時候、視窗大小變的時候各量一次
    function fit() {
        if (!S) return;
        const w = S.host ? S.host.clientWidth : (win.innerWidth || 0), h = S.host ? S.host.clientHeight : (win.innerHeight || 0);
        const float = w >= 860 && h >= 560;
        S.root.classList.toggle('asw-float', float);
        S.root.classList.toggle('asw-full', !float);
        S.scrim.classList.toggle('asw-on', float);
    }

    function go(section) {
        if (!S) return;
        const sec = secOf(section);
        if (S.sec === sec.id) return;
        S.sec = sec.id;
        S.root.dataset.sec = sec.id;
        S.root.querySelectorAll('.asw-nav-item').forEach(function (b) {
            const on = b.dataset.sec === sec.id;
            b.classList.toggle('is-on', on);
            b.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        S.root.querySelector('.asw-title').textContent = sec.name;
        const body = S.root.querySelector('.asw-body');
        if (!S.pages[sec.id]) {
            const page = doc.createElement('div');
            page.className = 'asw-page';
            page.dataset.page = sec.id;
            body.appendChild(page);
            S.pages[sec.id] = page;
            try { const off = sec.mount(page, api); if (typeof off === 'function') S.offs.push(off); }
            catch (e) { console.warn('[設置窗口] 「' + sec.name + '」這頁畫不出來', e); page.textContent = '這一頁沒有載入完整，請重新整理一次。'; }
        }
        Object.keys(S.pages).forEach(function (k) { S.pages[k].hidden = k !== sec.id; });
        body.scrollTop = 0;
        // 手機那排：選到的那一個捲進看得到的地方（340px 排得下七個，這行是給字被系統放大的人）
        const cur = S.root.querySelector('.asw-nav-item.is-on');
        if (cur && cur.scrollIntoView) { try { cur.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {} }
    }

    function close() {
        if (!S) return;
        const st = S; S = null;
        doc.removeEventListener('keydown', onKey, true);
        try { win.removeEventListener('resize', st.onResize); } catch (e) {}
        st.offs.forEach(function (fn) { try { fn(); } catch (e) {} });
        st.root.remove();
        st.scrim.remove();
        if (typeof st.onClose === 'function') { try { st.onClose(); } catch (e) {} }
    }

    function onClick(ev) {
        const t = ev.target;
        if (!t || !t.closest) return;
        if (t.closest('[data-act="close"]')) { close(); return; }
        const nav = t.closest('.asw-nav-item');
        if (nav) { go(nav.dataset.sec); return; }
        const jump = t.closest('[data-asw-go]');   // 頁面裡「去接／去看」那種鈕：跳到別的分類
        if (jump) go(jump.dataset.aswGo);
    }
    function onKey(ev) {
        if (ev.key !== 'Escape' || !S) return;
        if (doc.querySelector('.aud-mask.on, .opv-root, .acg-root')) return;   // 上面還開著小窗、看圖、角色中心：先關那個
        ev.preventDefault();
        ev.stopPropagation();
        close();
    }

    const api = { open: open, close: close, go: go, isOpen: function () { return !!S; }, current: function () { return S ? S.sec : null; } };
    win.OS_SETTINGS_WINDOW = api;
    window.OS_SETTINGS_WINDOW = api;
})();
