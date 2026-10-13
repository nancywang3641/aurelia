// ----------------------------------------------------------------
// [檔案] core/void/lobby_workshop.js — 🎩 視差造物工坊（帽匠工坊裡點造物儀開的面板）
// 職責：四張卡的首頁 → 路由到創作室。面板本體只在這裡，兩個入口共用同一份：
//   舞台模式＝走進工坊、點中央的造物儀（lobby_stage 開浮窗）
//   立繪模式＝地點視圖的「造物工坊」窗格（lobby_places 的 openIn）
//
// 🚨 獨立成檔：面板跟舞台沒關係，塞進 lobby_stage 只是把那支撐得更大。
// 🚨 四張卡的行為跟手機應用工坊那份一模一樣（換皮不是重寫）：
//      製作互動面板／特效工坊／劇情主題 → OS_STUDIO.launch(容器, 模式)
//      VN 組件                        → OS_STUDIO.openVnComponents(容器)
//    匯入 HTML 不在這裡——它匯的是「手機上的應用」，入口留在手機的應用工坊。
// 🚨 卡片美術（標題／三個角落／每張卡的圖標與底紋）全部寫在 lobby_stage.css，
//    JS 只給 class；素材都是固定網址，不需要走 CSS 變數。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window;

    // 四張長條卡。
    // 🚨「匯入 HTML」2026-08-26 搬回手機的應用工坊：匯進來的是「手機上的應用」，
    //    做好的 app 住手機桌面、安裝流程也只有那一份，入口跟著東西走才不會兩邊都有一半。
    //    工坊這邊只留「做給劇情用的東西」。
    const CARDS = [
        { id: 'vn',    title: 'VN 組件',      desc: '整理、預覽與打包組件' },
        { id: 'panel', studio: 'vn_ui', title: '製作互動面板', desc: '狀態欄、角色卡與劇情面板' },
        { id: 'fx',    studio: 'fx',    title: '特效工坊',     desc: '下雪、滴血、劍光與畫面特效' },
        { id: 'theme', studio: 'theme', title: '劇情主題',     desc: '對話框、名牌與場景牌外觀' },
    ];

    function ready() { return !!(win.OS_STUDIO && win.OS_STUDIO.launch); }

    function _card(c) {
        return '<button class="lws-card lws-' + c.id + '" type="button" data-card="' + c.id + '">' +
                 '<span class="lws-card-art"></span>' +
                 '<span class="lws-card-tx">' +
                   '<span class="lws-card-t">' + c.title + '</span>' +
                   '<span class="lws-card-d">' + c.desc + '</span>' +
                   '<span class="lws-card-bar"></span>' +
                 '</span>' +
               '</button>';
    }

    // 🔧 開工具＝面板掛 is-tool，浮窗照這個放寬（見 lobby_stage.css）。
    //    創作室的「即時預覽」是看容器寬度決定要不要當側邊欄（>768px 兩欄、≤768px 才收成 👁 抽屜），
    //    五張卡的首頁不必那麼寬，所以是「開工具才放寬、收工自己縮回去」。
    // 🚨 工具是自己把覆蓋層 remove 掉走人的（不會通知我們）→ 用 MutationObserver 看那層還在不在，
    //    不在了就把 is-tool 拿掉；輪詢跟 rAF 都不適合（分頁在背景時 rAF 不會 fire）。
    let _toolObs = null;
    function _enterTool(root) {
        _resize(root, () => root.classList.add('is-tool'));
        if (_toolObs) { _toolObs.disconnect(); _toolObs = null; }
        if (!window.MutationObserver) return;
        _toolObs = new MutationObserver(() => {
            if (root.querySelector('#os_studio_app, .vncomp-app')) return;
            _resize(root, () => root.classList.remove('is-tool'));
            if (_toolObs) { _toolObs.disconnect(); _toolObs = null; }
        });
        _toolObs.observe(root, { childList: true, subtree: true });
    }

    // 🎞 浮窗放寬／縮回的過場（10-13 她：「伸縮窗口的時候常常掉幀」）
    //   以前是 CSS 在寬、高、左邊位置上跑 transition：每一幀創作室整片（聊天、預覽畫布）都要重排一次，
    //   創作室看容器寬度排版的那幾塊也跟著每幀重算；寬跟左邊是從 auto 起跳，根本不會動，只有高度在慢慢長。
    //   現在：窗口一次換成最後的大小（創作室只排一次版），再用 transform 從舊的框縮放過去——顯示卡做，不重排。
    //   大廳設置「演出動畫」關掉、或系統要求減少動態，就直接換、不演。手機版窗口大小不變，量到一樣就不演。
    function _canAnim() {
        try {
            if (localStorage.getItem('aurelia_reveal_fx') === '0') return false;
            if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
            return true;
        } catch (e) { return false; }
    }
    function _resize(root, change) {
        const box = root.closest && root.closest('.lstage-wswin');
        if (!box || typeof box.animate !== 'function' || !_canAnim()) { change(); return; }
        (box.getAnimations ? box.getAnimations() : []).forEach(a => { try { a.finish(); } catch (e) {} });   // 上一段還沒演完：先收尾，量到的才是真的框
        const a = box.getBoundingClientRect();
        change();
        const b = box.getBoundingClientRect();
        if (!b.width || !b.height || (Math.abs(a.left - b.left) < 1 && Math.abs(a.top - b.top) < 1 && Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1)) return;
        // 窗口本身有 translateY(-50%)（置中）：過場時接在它前後，以左上角為原點縮放
        let base = '';
        try { const t = getComputedStyle(box).transform; if (t && t !== 'none') base = t; } catch (e) {}
        const from = 'translate(' + (a.left - b.left) + 'px,' + (a.top - b.top) + 'px) ' + base + ' scale(' + (a.width / b.width) + ',' + (a.height / b.height) + ')';
        try {
            box.animate([{ transformOrigin: '0 0', transform: from }, { transformOrigin: '0 0', transform: base || 'none' }],
                { duration: 240, easing: 'cubic-bezier(.2,.7,.2,1)' });
        } catch (e) {}
    }

    // 卡片點下去＝那件事整個蓋上來（創作室與 VN 組件本來就是這個作法：
    // 自己生一層 absolute 覆蓋層蓋住容器，它們的返回鈕把自己移除，底下的五張卡就回來了）。
    function _openStudio(root, mode, label) {
        if (!win.OS_STUDIO || !win.OS_STUDIO.launch) return _fail(root, '創作室還沒載入');
        _enterTool(root);
        win.OS_STUDIO.launch(root, mode);
        // 標題改成「帽匠創作室 · 你點的那張卡」：在工坊裡就該講工坊的話，
        // 只改這一份的字（手機殼那份還是叫創作室），所以在這裡改 DOM、不動創作室的模板。
        const ttl = root.querySelector('#os_studio_app .studio-title');
        const tn = ttl && Array.prototype.find.call(ttl.childNodes, n => n.nodeType === 3 && n.textContent.trim());
        if (tn) tn.textContent = ' 帽匠創作室' + (label ? ' · ' + label : '');
    }
    function _openVnComponents(root) {
        if (!win.OS_STUDIO || !win.OS_STUDIO.openVnComponents) return _fail(root, '創作室還沒載入');
        _enterTool(root);
        win.OS_STUDIO.openVnComponents(root);
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
            '<div class="lws-body">' + CARDS.map(_card).join('') + '</div>' +
            '<div class="lws-note"></div>';

        root.addEventListener('click', (e) => {
            const b = e.target.closest('.lws-card');
            if (!b) return;
            const c = CARDS.find(x => x.id === b.dataset.card);
            if (!c) return;
            if (c.studio) _openStudio(root, c.studio, c.title);
            else if (c.id === 'vn') _openVnComponents(root);
        });
        if (opts.onClose) root.querySelector('.lws-x').addEventListener('click', opts.onClose);

        host.appendChild(root);
        return () => {
            if (_toolObs) { _toolObs.disconnect(); _toolObs = null; }
            try { root.remove(); } catch (e) {}
        };
    }

    win.LobbyWorkshop = { mount, ready, CARDS };
    console.log('✅ LobbyWorkshop（視差造物工坊面板）模組就緒');
})();
