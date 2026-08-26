// ----------------------------------------------------------------
// [檔案] core/void/lobby_workshop.js — 🎩 視差造物工坊（帽匠工坊裡點造物儀開的面板）
// 職責：五張卡的首頁 → 路由到創作室與匯入流程。面板本體只在這裡，兩個入口共用同一份：
//   舞台模式＝走進工坊、點中央的造物儀（lobby_stage 開浮窗）
//   立繪模式＝地點視圖的「造物工坊」窗格（lobby_places 的 openIn）
//
// 🚨 獨立成檔：面板跟舞台沒關係，塞進 lobby_stage 只是把那支撐得更大。
// 🚨 五張卡的行為跟手機應用工坊那份一模一樣（換皮不是重寫）：
//      製作互動面板／特效工坊／劇情主題 → OS_STUDIO.launch(容器, 模式)
//      VN 組件                        → OS_STUDIO.openVnComponents(容器)
//      匯入 HTML                      → APP_STORE.launch(容器, { view:'import' })
//    安裝流程仍然只有手機那一份——做好的 app 本來就住手機桌面，這裡搬的是入口不是流程。
// 🚨 卡片美術（標題／三個角落／五張卡的圖標與底紋）全部寫在 lobby_stage.css，
//    JS 只給 class；素材都是固定網址，不需要走 CSS 變數。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window;

    // 五張卡：上排兩張並排小卡，下面三張長條卡（照阿洛的稿）
    const CARDS = [
        { id: 'import', mini: true,  title: '匯入 HTML', desc: '貼上或載入已有應用' },
        { id: 'vn',     mini: true,  title: 'VN 組件',   desc: '整理、預覽與打包組件' },
        { id: 'panel',  studio: 'vn_ui', title: '製作互動面板', desc: '狀態欄、角色卡與劇情面板' },
        { id: 'fx',     studio: 'fx',    title: '特效工坊',     desc: '下雪、滴血、劍光與畫面特效' },
        { id: 'theme',  studio: 'theme', title: '劇情主題',     desc: '對話框、名牌與場景牌外觀' },
    ];

    function ready() { return !!(win.OS_STUDIO && win.OS_STUDIO.launch); }

    function _card(c) {
        return '<button class="lws-card' + (c.mini ? ' is-mini' : '') + ' lws-' + c.id + '" type="button" data-card="' + c.id + '">' +
                 '<span class="lws-card-art"></span>' +
                 '<span class="lws-card-tx">' +
                   '<span class="lws-card-t">' + c.title + '</span>' +
                   '<span class="lws-card-d">' + c.desc + '</span>' +
                   '<span class="lws-card-bar"></span>' +
                 '</span>' +
               '</button>';
    }

    // 卡片點下去＝那件事整個蓋上來（創作室與 VN 組件本來就是這個作法：
    // 自己生一層 absolute 覆蓋層蓋住容器，它們的返回鈕把自己移除，底下的五張卡就回來了）。
    function _openStudio(root, mode) {
        if (!win.OS_STUDIO || !win.OS_STUDIO.launch) return _fail(root, '創作室還沒載入');
        win.OS_STUDIO.launch(root, mode);
    }
    function _openVnComponents(root) {
        if (!win.OS_STUDIO || !win.OS_STUDIO.openVnComponents) return _fail(root, '創作室還沒載入');
        win.OS_STUDIO.openVnComponents(root);
    }
    // 匯入：借手機應用工坊那份的匯入頁（安裝到桌面的流程只有那一份）。
    // APP_STORE.launch 會把容器內容整個換掉 → 給它一層自己的覆蓋層，返回時整層移除。
    function _openImport(root) {
        if (!win.APP_STORE || !win.APP_STORE.launch) return _fail(root, '應用工坊還沒載入');
        const ov = document.createElement('div');
        ov.className = 'lws-overlay';
        root.appendChild(ov);
        win.APP_STORE.launch(ov, { view: 'import', onExit: () => ov.remove() });
    }
    function _fail(root, msg) {
        const t = root.querySelector('.lws-note');
        if (t) { t.textContent = msg; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 2400); }
        console.warn('[LobbyWorkshop] ' + msg);
    }

    // host＝浮窗內容區／地點視圖窗格；面板自己吃滿它。
    // opts.onClose 有給才畫右上角那顆 ✕（地點視圖自己有標題列的返回與離開，一頁只留一顆）。
    function mount(host, opts) {
        if (!host) return () => {};
        opts = opts || {};
        host.innerHTML = '';
        const root = document.createElement('div');
        root.className = 'lws';
        root.innerHTML =
            // 框整個是 CSS 畫的（見 lobby_stage.css 那段的說明），這裡只有兩片點陣裝飾
            '<div class="lws-dots lws-dots-l"></div>' +
            '<div class="lws-dots lws-dots-r"></div>' +
            // 角落玩偶的空位：素材（阿洛畫的貓／高帽／徽章）補進 CSS 就會出現，沒有時是空的
            '<div class="lws-doll lws-doll-tr"></div>' +
            '<div class="lws-doll lws-doll-bl"></div>' +
            '<div class="lws-doll lws-doll-br"></div>' +
            '<div class="lws-hd">' +
              '<div class="lws-title" role="heading" aria-level="2" aria-label="視差造物工坊"></div>' +
              (opts.onClose ? '<button class="lws-x" type="button" aria-label="離開"><i class="fa-solid fa-xmark"></i></button>' : '') +
            '</div>' +
            '<div class="lws-body">' +
              '<div class="lws-row">' + CARDS.filter(c => c.mini).map(_card).join('') + '</div>' +
              CARDS.filter(c => !c.mini).map(_card).join('') +
            '</div>' +
            '<div class="lws-note"></div>';

        root.addEventListener('click', (e) => {
            const b = e.target.closest('.lws-card');
            if (!b) return;
            const c = CARDS.find(x => x.id === b.dataset.card);
            if (!c) return;
            if (c.studio) _openStudio(root, c.studio);
            else if (c.id === 'vn') _openVnComponents(root);
            else if (c.id === 'import') _openImport(root);
        });
        if (opts.onClose) root.querySelector('.lws-x').addEventListener('click', opts.onClose);

        host.appendChild(root);
        return () => { try { root.remove(); } catch (e) {} };
    }

    win.LobbyWorkshop = { mount, ready, CARDS };
    console.log('✅ LobbyWorkshop（視差造物工坊面板）模組就緒');
})();
