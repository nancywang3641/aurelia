// ----------------------------------------------------------------
// [檔案] os_settings_window.js — 「設置」窗口（2026-11-17）
// 職責：把以前分三處的設置收進同一個窗口——手機裡的系統設置、大廳齒輪的大廳設置、劇情裡的設定窗。
//       她：「設置功能太散了…全部歸列，不再放到手機框裡了…以後兩個捷徑可走? 大廳的這個設置窗口，
//       VN劇情裡的那個設置按鈕也能打開設置窗口?」。版面照 Claude Design 那份（本機 tmp/settings_window_design）。
// 這支只管殼：開關、左邊（手機是上面）那排分類、哪個分類畫哪一頁。每一頁的內容由原本管那些設定的檔案畫進來：
//       大廳＝LobbyStage.mountSettings(box)（core/void/lobby_stage.js）。
//       劇情→畫面與聲音＝VN_Settings.mountInto(box)（os_phone/vn_story/vn_panels.js；劇情右上「設定」鈕開的就是這頁）。
//       劇情→導演＝OS_AVS_STATE.mountDirector(box)（os_phone/os/os_avs_state.js）。
//       AI 模型／圖片／語音／備份與系統＋劇情底下的面板、素材資料夾、記得多少章、後台
//         ＝原本的系統設置頁整頁掛進來（OS_SETTINGS.launchApp，一個窗只掛一次），它自己那排主分頁和標題列藏起來，
//           由這裡的分類去按它對應的那一顆（.set-tab[data-tab]／.gen-subtab[data-gentab]）。
//           欄位 id、綁定、底部「保存所有設定」都是它原本那一套，這支不碰。
// 長相兩套，看打開那一下人在哪（skinNow，寫在最外層的 data-skin；開著窗口時不會換場，所以只在打開時決定）：
//       她：「c在大廳，b在vn劇情。因為vn劇情是黑金，大廳是白藍…不然在黑金 vn劇情面板那裏打開白藍設置窗口，會很突兀」
//       lobby＝人在大廳：圓潤的白藍浮窗（夠大時浮在中間、四邊留空、後面壓暗，點暗處或右上 ✕ 關）
//       story＝劇情畫面開著（不管是按劇情的「設定」還是從手機圖示進來）：黑金、鋪滿整個畫面，左下「回到劇情」
//       手機寬兩套都鋪滿，上面一排分類、左上返回，只差顏色和字級。內容的 HTML 只有一份。
//       顏色、圓角、字級、間距全在 css/os_settings_window.css 最上面那幾組變數，不跟手機主題。
// 入口：window.OS_SETTINGS_WINDOW.open(分類 id, { onClose, sub })／close()／isOpen()／go(分類 id, 小分頁 id)。
//       分類 id：home（總覽）／ai／img／voice／story／lobby／sys。沒有那個分類就開第一個。
//       總覽＝這支自己畫（mountHome）：四列現況——寫故事的模型接了沒、圖片還有幾個地方沒選、角色語音開沒開、上次什麼時候備份；
//         每次切回來都重看一次（改完設定回來就是新的）。
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
        { id: 'home', name: '總覽', short: '總覽', icon: 'fa-table-cells-large', fresh: true, mount: function (box) { mountHome(box); } },   // fresh＝每次切到都重畫
        { id: 'ai', name: 'AI 模型', short: '模型', icon: 'fa-plug', sys: 'api' },
        { id: 'img', name: '圖片', short: '圖片', icon: 'fa-image', sys: 'img' },
        { id: 'voice', name: '語音', short: '語音', icon: 'fa-volume-high', sys: 'voice' },
        { id: 'story', name: '劇情', short: '劇情', icon: 'fa-book-open', subs: [
            { id: 'view', name: '畫面與聲音', mount: function (box) { const V = win.VN_Settings || window.VN_Settings; if (V && V.mountInto) return V.mountInto(box); box.textContent = '劇情還沒載入完整，請重新整理一次。'; } },
            { id: 'asset', name: '素材資料夾', sys: 'vn', gen: 'asset' },
            { id: 'ctx', name: '記得多少章', sys: 'vn', gen: 'ctx' },
            // 🎬 導演（11-18 從變數工坊搬來：她「導演模式 是不是放到 設置好點啊?」）；fresh＝每次切到都重畫，換了故事才讀得到那個故事的導演重點
            { id: 'director', name: '導演', fresh: true, mount: function (box) { const A = win.OS_AVS_STATE || window.OS_AVS_STATE; if (A && A.mountDirector) return A.mountDirector(box); box.textContent = '劇情狀態那支還沒載好，請重新整理一次。'; } },
            { id: 'panel', name: '面板', sys: 'vn', gen: 'panel', only: 'st' },
            { id: 'back', name: '後台', sys: 'vn', gen: 'back', only: 'pwa' },
        ] },
        { id: 'lobby', name: '大廳', short: '大廳', icon: 'fa-house', mount: function (box) { const L = win.LobbyStage || window.LobbyStage; if (L && L.mountSettings) return L.mountSettings(box); box.textContent = '大廳還沒載入完整，請重新整理一次。'; } },
        { id: 'sys', name: '備份與系統', short: '備份', icon: 'fa-database', sys: 'sys' },
    ];
    const secOf = function (id) { return SECTIONS.find(function (s) { return s.id === id; }) || SECTIONS[0]; };
    const subsOf = function (sec) {
        if (!sec.subs) return null;
        const st = isStandalone();
        return sec.subs.filter(function (x) { return !x.only || (x.only === 'pwa') === st; });
    };

    // ── 總覽：四列現況 ──────────────────────────────────────────────
    const esc = function (t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
    // 寫故事的模型接了沒：酒館裡選「用酒館的連線」也算接好；不然看有沒有填網址和模型
    function llmState() {
        try {
            const OS = win.OS_SETTINGS || window.OS_SETTINGS;
            const c = (OS && OS.getConfig) ? OS.getConfig() : null;
            if (!c) return { ok: false };
            if (!isStandalone() && (c.useSystemApi || c.useGenerateRaw)) return { ok: true, via: 'tavern' };
            if (c.url && c.model) return { ok: true, model: c.model };
            return { ok: false };
        } catch (e) { return { ok: false }; }
    }
    function imgState() {
        try {
            const M = win.OS_IMAGE_MANAGER || window.OS_IMAGE_MANAGER;
            if (!M || !M.USES || !M.serviceForUse) return null;
            return { total: M.USES.length, unset: M.USES.filter(function (u) { return !M.serviceForUse(u.id); }).length };
        } catch (e) { return null; }
    }
    function voiceOn() { try { const V = win.OS_VOICE_CAST || window.OS_VOICE_CAST; return !!(V && V.isOn && V.isOn()); } catch (e) { return false; } }
    // 上次備份：本地匯出（lastExportAt）和自動備份（lastAt）取比較近的那一次；兩個都沒有＝還沒備份過
    function backupLast() {
        try {
            const B = win.OS_BACKUP || window.OS_BACKUP;
            if (!B) return null;
            const a = (B.getSettings && B.getSettings().lastExportAt) || 0, b = (B.autoGet && B.autoGet().lastAt) || 0;
            return { at: Math.max(a, b) };
        } catch (e) { return null; }
    }
    const fmtT = function (t) { const d = new Date(t); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
    // 一列＝一顆大按鈕（整列都能點）：名字＋小牌子＋一句現況，右邊「去接／去看」（手機上是箭頭）
    function card(go, name, tag, tagKind, desc, need) {
        return '<button type="button" class="asw-card' + (need ? ' is-need' : '') + '" data-asw-go="' + go + '">'
             +   '<span class="asw-card-main">'
             +     '<span class="asw-card-head"><b class="asw-card-name">' + name + '</b><span class="asw-tag' + (tagKind ? ' is-' + tagKind : '') + '">' + esc(tag) + '</span></span>'
             +     '<span class="asw-card-desc">' + esc(desc) + '</span>'
             +   '</span>'
             +   '<span class="asw-btn asw-card-go' + (need ? ' is-main' : '') + '">' + (need ? '去接' : '去看') + '</span>'
             +   '<i class="fa-solid fa-chevron-right asw-card-chev"></i>'
             + '</button>';
    }
    function mountHome(box) {
        const llm = llmState(), img = imgState(), vo = voiceOn(), bk = backupLast(), st = isStandalone();
        let h = '<p class="asw-lead">要開始玩，只有第一項一定要接。其他的想用再接。</p><div class="asw-cards">';
        h += llm.ok
            ? card('ai', '寫故事的模型', '已接好', 'ok', '劇情、聊天、電話都靠它。' + (llm.via === 'tavern' ? '現在用酒館的連線。' : '現在用的是 ' + llm.model + '。'))
            : card('ai', '寫故事的模型', '還沒接', 'warn', '劇情、聊天、電話都靠它。沒接的話，按什麼都不會有回應。', true);
        if (img) {
            const head = '接了才會有頭像、立繪、背景、插圖。';
            if (img.unset >= img.total) h += card('img', '圖片', '沒接也能玩', '', head + img.total + ' 個會出圖的地方現在都還沒選。');
            else if (img.unset > 0) h += card('img', '圖片', '接了一部分', '', head + img.total + ' 個會出圖的地方，還有 ' + img.unset + ' 個沒選。');
            else h += card('img', '圖片', '已接好', 'ok', img.total + ' 個會出圖的地方都選好了。');
        } else h += card('img', '圖片', '沒接也能玩', '', '接了才會有頭像、立繪、背景、插圖。');
        h += vo ? card('voice', '角色語音', '會念出來', 'ok', '現在角色會念台詞。不想聽可以關掉。')
                : card('voice', '角色語音', '不用語音', '', '現在角色不會念台詞。想聽聲音再打開。');
        const where = st ? '故事存在這台裝置的瀏覽器裡。' : '手機 app、設定這些存在這台裝置裡。';
        const before = st ? '換裝置或清瀏覽器之前' : '換裝置或清資料之前';
        if (bk && bk.at) h += card('sys', '備份', '備份過了', 'ok', '上次備份 ' + fmtT(bk.at) + '。' + before + '再存一份。');
        else if (bk) h += card('sys', '備份', '還沒備份過', '', where + before + '先存一份。');
        else h += card('sys', '備份', '', '', where + before + '先存一份。');
        h += '</div>'
           + '<div class="asw-foot">'
           +   '<span>想調字的大小、音量：<span class="asw-on-wide">左邊</span><span class="asw-on-full">上面</span>「劇情」</span>'
           +   '<span>想關音效、小劇場：<span class="asw-on-wide">左邊</span><span class="asw-on-full">上面</span>「大廳」</span>'
           + '</div>';
        box.classList.add('asw-home');
        box.innerHTML = h;
    }
    // 左邊那排「AI 模型」旁邊的小牌子：還沒接才掛。開窗、換分類、按了保存之後各看一次
    function updateTags() {
        if (!S) return;
        const b = S.root.querySelector('.asw-nav-item[data-sec="ai"]');
        if (!b) return;
        const need = !llmState().ok;
        let tag = b.querySelector('.asw-nav-tag');
        if (need && !tag) { tag = doc.createElement('span'); tag.className = 'asw-nav-tag'; tag.textContent = '還沒接'; b.appendChild(tag); }
        else if (!need && tag) tag.remove();
    }

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

    // 用哪套長相：劇情畫面真的開著（那一整格看得到）＝story，不然＝lobby。看畫面的狀態，不看是誰叫的
    function skinNow() {
        return (shown(doc.getElementById('aurelia-vn-panel')) || shown(doc.getElementById('page-game'))) ? 'story' : 'lobby';
    }

    function navHtml() {
        return SECTIONS.map(function (s) {
            return '<button type="button" class="asw-nav-item" role="tab" data-sec="' + s.id + '">'
                 +   '<i class="fa-solid ' + s.icon + ' asw-nav-ic"></i>'
                 +   '<span class="asw-nav-long">' + s.name + '</span><span class="asw-nav-short">' + s.short + '</span>'
                 + '</button>';
        }).join('');
    }

    function open(section, opts) {
        if (S) { go(section, opts && opts.sub); return; }
        const host = pickHost();
        const skin = skinNow();
        const root = doc.createElement('div');
        root.className = 'asw-root' + (host ? ' asw-in-screen' : '');
        root.dataset.skin = skin;
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
          +     '<div class="asw-side-title"><span class="asw-side-badge"><i class="fa-solid fa-gear"></i></span>'
          +       '<span class="asw-side-tx"><span class="asw-side-name">設置</span><b class="asw-side-ask">想調哪裡？</b></span></div>'
          +     '<nav class="asw-nav" role="tablist">' + navHtml() + '</nav>'
          +     '<button type="button" class="asw-leave" data-act="close"><i class="fa-solid fa-chevron-left"></i><span>回到劇情</span></button>'
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
        scrim.dataset.skin = skin;
        scrim.addEventListener('click', function () { close(); });
        const parent = host || doc.fullscreenElement || doc.webkitFullscreenElement || doc.body;
        parent.appendChild(scrim);
        parent.appendChild(root);
        S = { root: root, scrim: scrim, host: host, skin: skin, sec: null, sub: {}, pages: {}, sysBox: null, offs: [], onClose: (opts && opts.onClose) || null };
        S.onResize = function () { fit(); };
        try { win.addEventListener('resize', S.onResize); } catch (e) {}
        root.addEventListener('click', onClick);
        doc.addEventListener('keydown', onKey, true);
        fit();
        go(section, opts && opts.sub);
    }

    // 夠大＝分類在左邊一排（asw-wide）；大廳那套這時浮在中間、後面壓暗（asw-float），劇情那套鋪滿。
    //   不夠大（手機寬，或視窗被拉小）＝鋪滿、上面一排分類（asw-full）。開的時候、視窗大小變的時候各量一次
    function fit() {
        if (!S) return;
        const w = S.host ? S.host.clientWidth : (win.innerWidth || 0), h = S.host ? S.host.clientHeight : (win.innerHeight || 0);
        const wide = w >= 860 && h >= 560, float = wide && S.skin === 'lobby';
        S.root.classList.toggle('asw-wide', wide);
        S.root.classList.toggle('asw-float', float);
        S.root.classList.toggle('asw-full', !wide);
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
    function showPage(key, mount, name, fresh) {
        const body = S.root.querySelector('.asw-body');
        if (S.pages[key] && fresh) {
            try { mount(S.pages[key], api); } catch (e) { console.warn('[設置窗口] 「' + name + '」這頁重畫不出來', e); }
        }
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
        else showPage(sec.id + (cur ? '/' + cur.id : ''), target.mount, target.name, !!target.fresh);
        updateTags();
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
        if (jump) { go(jump.dataset.aswGo); return; }
        // 按了系統設置頁的「保存所有設定」：存完再看一次模型接了沒（左邊「AI 模型」旁的小牌子）
        if (t.closest('#os-save-btn')) win.setTimeout(updateTags, 700);
    }
    function onKey(ev) {
        if (ev.key !== 'Escape' || !S) return;
        // 上面還開著小窗、看圖、角色中心，或系統設置頁自己蓋上來的那幾層：先關那個
        if (doc.querySelector('.aud-mask.on, .opv-root, .acg-root')) return;
        ev.preventDefault();
        ev.stopPropagation();
        close();
    }

    const api = { open: open, close: close, go: go, isOpen: function () { return !!S; }, current: function () { return S ? S.sec : null; }, skin: function () { return S ? S.skin : null; } };
    win.OS_SETTINGS_WINDOW = api;
    window.OS_SETTINGS_WINDOW = api;
})();
