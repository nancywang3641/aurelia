// ----------------------------------------------------------------
// [檔案] os_settings_window.js — 「設置」窗口（2026-11-17）
// 職責：把以前分三處的設置收進同一個窗口——手機裡的系統設置、大廳齒輪的大廳設置、劇情裡的設定窗。
//       她：「設置功能太散了…全部歸列，不再放到手機框裡了…以後兩個捷徑可走? 大廳的這個設置窗口，
//       VN劇情裡的那個設置按鈕也能打開設置窗口?」。版面照 Claude Design 那份（本機 tmp/settings_window_design）。
// 這支只管殼：開關、左邊（手機是上面）那排分類、哪個分類畫哪一頁。每一頁的內容由原本管那些設定的檔案畫進來：
//       大廳＝LobbyStage.mountSettings(box)（core/void/lobby_stage.js）。
//       AI 模型／圖片／語音／備份與系統＋劇情底下的面板、素材資料夾、記得多少章、外語角色、後台
//         ＝原本的系統設置頁整頁掛進來（OS_SETTINGS.launchApp，一個窗只掛一次），它自己那排主分頁和標題列藏起來，
//           由這裡的分類去按它對應的那一顆（.set-tab[data-tab]／.gen-subtab[data-gentab]）。
//           欄位 id、綁定、底部「保存所有設定」都是它原本那一套，這支不碰。
// 版面：開的那一格夠大＝浮在中間、四邊留空、後面壓暗（點暗處或右上 ✕ 關）；小（手機寬）＝鋪滿，上面一排分類、左上返回。
//       顏色一律白底藍字，不跟手機主題（樣式在 css/os_settings_window.css）。
// 入口：window.OS_SETTINGS_WINDOW.open(分類 id, { onClose, sub })／close()／isOpen()／go(分類 id, 小分頁 id)。
//       分類 id：ai／img／voice／story／lobby／sys（之後會加 home）。沒有那個分類就開第一個。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const doc = win.document;

    const isStandalone = function () { try { const A = win.OS_API || window.OS_API; return !!(A && typeof A.isStandalone === 'function' && A.isStandalone()); } catch (e) { return false; } };

    // 分類：順序就是畫面上的順序；name＝電腦左邊那排的字，short＝手機上面那排的字（340px 寬七個要排得下，所以短）
    //   一頁怎麼來，三種寫法擇一（分類本身，或分類底下的小分頁 subs 各寫各的）：
    //     mount(box, api)＝自己畫的一頁：第一次切到時畫一次；回傳的函式（有的話）在關窗時叫，讓那一頁收拾自己掛的東西
    //     sys＝系統設置頁的哪個主分頁（api／img／voice／vn／sys）；gen＝再按「一般」裡的哪個小分頁
    //     only＝'st' 只有酒館有、'pwa' 只有網頁版有（跟系統設置頁原本藏的一樣）
    const SECTIONS = [
        { id: 'ai', name: 'AI 模型', short: '模型', sys: 'api' },
        { id: 'img', name: '圖片', short: '圖片', sys: 'img' },
        { id: 'voice', name: '語音', short: '語音', sys: 'voice' },
        { id: 'story', name: '劇情', short: '劇情', subs: [
            { id: 'panel', name: '面板', sys: 'vn', gen: 'panel', only: 'st' },
            { id: 'asset', name: '素材資料夾', sys: 'vn', gen: 'asset' },
            { id: 'ctx', name: '記得多少章', sys: 'vn', gen: 'ctx' },
            { id: 'foreign', name: '外語角色', sys: 'vn', gen: 'foreign' },
            { id: 'back', name: '後台', sys: 'vn', gen: 'back', only: 'pwa' },
        ] },
        { id: 'lobby', name: '大廳', short: '大廳', mount: function (box) { const L = win.LobbyStage || window.LobbyStage; if (L && L.mountSettings) return L.mountSettings(box); box.textContent = '大廳還沒載入完整，請重新整理一次。'; } },
        { id: 'sys', name: '備份與系統', short: '備份', sys: 'sys' },
    ];
    const secOf = function (id) { return SECTIONS.find(function (s) { return s.id === id; }) || SECTIONS[0]; };
    const subsOf = function (sec) {
        if (!sec.subs) return null;
        const st = isStandalone();
        return sec.subs.filter(function (x) { return !x.only || (x.only === 'pwa') === st; });
    };

    let S = null;   // 開著的那一個窗：{ root, scrim, host, sec, sub:{分類:小分頁}, pages:{鍵:el}, sysBox, offs:[], onClose, onResize }

    function shown(el) { return !!(el && el.getClientRects().length && el.clientWidth > 0 && el.clientHeight > 0); }
    // 掛在哪：浮動手機開著（從手機的「設置」圖示來）或沒有主窗口那一格＝整個畫面；不然跟著奧瑞亞主窗口那一格（大廳、劇情都在裡面），
    //   不蓋到酒館自己的畫面。瀏覽器真的全螢幕時只有全螢幕那個元素裡面的東西看得到，所以掛進它裡面。
    //   🚨 掛在那一格的「外框」（#aurelia-phone-screen 的上一層，兩個一樣大），不掛進那一格裡面：
    //      404 房會在那一格掛 .mode-404，全站樣式有幾十條「#aurelia-phone-screen.mode-404 .set-group…!important」把設置頁染成黑底綠字，
    //      掛在裡面這個窗就跟著變黑綠；這個窗在哪裡開都是白底藍字。
    function pickHost() {
        if (shown(doc.getElementById('aurelia-phone-shell'))) return null;
        const scr = doc.getElementById('aurelia-phone-screen');
        return (shown(scr) && scr.parentElement && scr.parentElement !== doc.body) ? scr.parentElement : null;
    }

    function navHtml() {
        return SECTIONS.map(function (s) {
            return '<button type="button" class="asw-nav-item" role="tab" data-sec="' + s.id + '">'
                 +   '<span class="asw-nav-long">' + s.name + '</span><span class="asw-nav-short">' + s.short + '</span>'
                 + '</button>';
        }).join('');
    }

    function open(section, opts) {
        if (S) { go(section, opts && opts.sub); return; }
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
          +     '<div class="asw-subtabs" role="tablist" hidden></div>'
          +     '<div class="asw-body"></div>'
          +     '<div class="asw-sys" hidden></div>'
          +   '</main>'
          + '</div>';
        const scrim = doc.createElement('div');
        scrim.className = 'asw-scrim' + (host ? ' asw-in-screen' : '');
        scrim.addEventListener('click', function () { close(); });
        const parent = host || doc.fullscreenElement || doc.webkitFullscreenElement || doc.body;
        parent.appendChild(scrim);
        parent.appendChild(root);
        S = { root: root, scrim: scrim, host: host, sec: null, sub: {}, pages: {}, sysBox: null, offs: [], onClose: (opts && opts.onClose) || null };
        S.onResize = function () { fit(); };
        try { win.addEventListener('resize', S.onResize); } catch (e) {}
        root.addEventListener('click', onClick);
        doc.addEventListener('keydown', onKey, true);
        fit();
        go(section, opts && opts.sub);
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

    // 系統設置整頁：第一次用到才掛（一個窗只掛一次，關窗時跟著整個窗一起拆掉）
    function sysBox() {
        if (S.sysBox) return S.sysBox;
        const box = S.root.querySelector('.asw-sys');
        const OS = win.OS_SETTINGS || window.OS_SETTINGS;
        try {
            if (!OS || !OS.launchApp) throw new Error('OS_SETTINGS 未載入');
            OS.launchApp(box);
        } catch (e) {
            console.warn('[設置窗口] 系統設置頁掛不上來', e);
            if (!box.querySelector('.set-container')) box.textContent = '這一頁沒有載入完整，請重新整理一次。';
        }
        S.sysBox = box;
        return box;
    }
    function showSys(tab, gen) {
        const box = sysBox();
        const t = box.querySelector('.set-tab[data-tab="' + tab + '"]');
        if (t && !t.classList.contains('active')) t.click();
        if (gen) { const g = box.querySelector('.gen-subtab[data-gentab="' + gen + '"]'); if (g && !g.classList.contains('active')) g.click(); }
        const sc = box.querySelector('.set-content');
        if (sc) sc.scrollTop = 0;
    }
    function showPage(key, mount, name) {
        const body = S.root.querySelector('.asw-body');
        if (!S.pages[key]) {
            const page = doc.createElement('div');
            page.className = 'asw-page';
            page.dataset.page = key;
            body.appendChild(page);
            S.pages[key] = page;
            try { const off = mount(page, api); if (typeof off === 'function') S.offs.push(off); }
            catch (e) { console.warn('[設置窗口] 「' + name + '」這頁畫不出來', e); page.textContent = '這一頁沒有載入完整，請重新整理一次。'; }
        }
        Object.keys(S.pages).forEach(function (k) { S.pages[k].hidden = k !== key; });
        body.scrollTop = 0;
    }

    function go(section, sub) {
        if (!S) return;
        const sec = secOf(section);
        const subs = subsOf(sec);
        const secChanged = S.sec !== sec.id;
        let cur = null;
        if (subs && subs.length) {
            const want = sub || S.sub[sec.id];
            cur = subs.find(function (x) { return x.id === want; }) || subs[0];
            S.sub[sec.id] = cur.id;
        }
        S.sec = sec.id;
        S.root.dataset.sec = sec.id;
        if (secChanged) {
            S.root.querySelectorAll('.asw-nav-item').forEach(function (b) {
                const on = b.dataset.sec === sec.id;
                b.classList.toggle('is-on', on);
                b.setAttribute('aria-selected', on ? 'true' : 'false');
            });
            S.root.querySelector('.asw-title').textContent = sec.name;
        }
        const bar = S.root.querySelector('.asw-subtabs');
        bar.hidden = !cur;
        if (cur) {
            if (secChanged) bar.innerHTML = subs.map(function (x) { return '<button type="button" class="asw-subtab" role="tab" data-sub="' + x.id + '">' + x.name + '</button>'; }).join('');
            bar.querySelectorAll('.asw-subtab').forEach(function (b) { b.classList.toggle('is-on', b.dataset.sub === cur.id); });
        }
        const target = cur || sec;
        const useSys = !!target.sys;
        S.root.querySelector('.asw-body').hidden = useSys;
        S.root.querySelector('.asw-sys').hidden = !useSys;
        if (useSys) showSys(target.sys, target.gen);
        else showPage(sec.id + (cur ? '/' + cur.id : ''), target.mount, target.name);
        // 手機那排：選到的那一個捲進看得到的地方（340px 排得下七個，這行是給字被系統放大的人）
        if (secChanged) {
            const on = S.root.querySelector('.asw-nav-item.is-on');
            if (on && on.scrollIntoView) { try { on.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {} }
        }
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
        const sub = t.closest('.asw-subtab');
        if (sub) { go(S.sec, sub.dataset.sub); return; }
        const jump = t.closest('[data-asw-go]');   // 頁面裡「去接／去看」那種鈕：跳到別的分類
        if (jump) go(jump.dataset.aswGo);
    }
    function onKey(ev) {
        if (ev.key !== 'Escape' || !S) return;
        // 上面還開著小窗、看圖、角色中心，或系統設置頁自己蓋上來的那幾層：先關那個
        if (doc.querySelector('.aud-mask.on, .opv-root, .acg-root')) return;
        ev.preventDefault();
        ev.stopPropagation();
        close();
    }

    const api = { open: open, close: close, go: go, isOpen: function () { return !!S; }, current: function () { return S ? S.sec : null; } };
    win.OS_SETTINGS_WINDOW = api;
    window.OS_SETTINGS_WINDOW = api;
})();
