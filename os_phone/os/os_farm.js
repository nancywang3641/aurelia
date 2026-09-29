// ============================================================
// os_farm.js — 後院（農場＋牧場）的入口：手機殼「後院」app → 全螢幕打開
// ------------------------------------------------------------
// 09-29 從 參考資料/farm_lab 搬進奧瑞亞。這支只做入口該做的事：
//   ① 第一次打開才載入 os_phone/farm/ 那十幾支檔與 farm.css（兩份載入清單只登記這一支，奧瑞亞開機不變慢）
//   ② 存檔（localStorage aurelia_farm_v1；以前在測試頁玩過的 aurelia_farm_lab_v1 第一次會接過來）
//   ③ 後院、牧場兩個場景切換（走進小圍欄／走出牧場缺口）
//   ④ 關掉時把場景拆乾淨：走路那支在捕獲階段攔方向鍵，不拆的話關掉之後大廳和酒館都收不到方向鍵
// 規則、畫面各在 os_phone/farm/ 自己那支，說明寫在各支開頭。
// 之後：存檔搬到 VPS（手機、電腦同一塊田）、住戶關電腦時也能顧田——見記憶 project_farm_walk_stage_2026_09_29。
// ============================================================
(function () {
    'use strict';

    var SCRIPT = (document.currentScript && document.currentScript.src) || '';
    // 這支在 os_phone/os/，農場那批在 os_phone/farm/；網址後面的版本號（?v=…）照抄，換版時一起換
    var BASE = SCRIPT ? SCRIPT.replace(/[?#].*$/, '').replace(/os\/os_farm\.js$/, 'farm/') : 'os_phone/farm/';
    var QS = SCRIPT.indexOf('?') >= 0 ? SCRIPT.slice(SCRIPT.indexOf('?')) : '';
    var FILES = [
        'farm_core.js', 'ranch_core.js', 'farm_walk_core.js', 'farm_ship_core.js',
        'farm_plot_draw.js', 'farm_item_draw.js', 'ranch_draw.js',
        'farm_walk_ui.js', 'farm_bag.js', 'farm_ship.js', 'farm_board.js',
        'farm_yard.js', 'farm_ranch.js'
    ];
    // 素材圖放 sound-files 的 farm/（跟大廳舞台同一個圖庫，走 jsdelivr）
    var ASSET = 'https://cdn.jsdelivr.net/gh/nancywang3641/sound-files@main/farm/';
    var STORE_KEY = 'aurelia_farm_v1';
    var LAB_KEY = 'aurelia_farm_lab_v1';
    var OWNER = '我';                   // 這塊地是她的；阿洛和丹之後在 VPS 各有一塊，排行榜上比
    // 走的人是她自己＝大廳裡「你」那個小人：裝扮室換過就是那個樣子，沒換過是剪影（大廳沒載到也用剪影）
    var LOBBY_MC = 'https://cdn.jsdelivr.net/gh/nancywang3641/sound-files@main/lobby_mc_';
    function look() {
        var L = window.LobbyStage;
        if (L && L.playerLook) return L.playerLook();
        var m = false;
        try { m = localStorage.getItem('lobby_stage_mc') === 'm'; } catch (e) {}
        return Promise.resolve({ src: LOBBY_MC + (m ? 'm' : 'f') + '_silhouette.png' });
    }

    // ── 載入 ─────────────────────────────────────────
    var loading = null;
    function loadCss() {
        if (document.getElementById('aurelia-farm-css')) return Promise.resolve();
        // 跟 index.js 的 loadCSS 同一招：fetch 進來塞 <style>（有些酒館版本把 .css 回成 text/plain，<link> 會被擋）
        return fetch(BASE + 'farm.css' + QS).then(function (r) {
            if (!r.ok) throw new Error('farm.css ' + r.status);
            return r.text();
        }).then(function (t) {
            var st = document.createElement('style');
            st.id = 'aurelia-farm-css';
            st.textContent = t;
            document.head.appendChild(st);
        });
    }
    function loadScripts() {
        // 一次全部插進去、async=false：平行下載、照順序執行（有相依）
        return Promise.all(FILES.map(function (f) {
            return new Promise(function (resolve, reject) {
                var s = document.createElement('script');
                s.src = BASE + f + QS;
                s.async = false;
                s.onload = resolve;
                s.onerror = function () { reject(new Error('載不到 ' + f)); };
                document.head.appendChild(s);
            });
        }));
    }
    function ensureLoaded() {
        if (window.FarmYard && window.FarmRanch) return Promise.resolve();
        if (!loading) loading = Promise.all([loadCss(), loadScripts()]).catch(function (e) { loading = null; throw e; });
        return loading;
    }

    // ── 存檔 ─────────────────────────────────────────
    function libs() {
        return { farm: window.AureliaFarmCore, ranch: window.RanchCore, walk: window.FarmWalkCore, ship: window.FarmShipCore };
    }
    function attachAll(L, st, raw) {
        L.ranch.attach(st, raw);
        L.ship.attach(st, raw);
        return L.walk.attach(st, raw);
    }
    function loadState(L) {
        var raw = null;
        try {
            raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
            // 以前在測試頁玩過：第一次打開就接著那塊田玩（只接一次，之後各存各的）
            if (!raw) raw = JSON.parse(localStorage.getItem(LAB_KEY) || 'null');
        } catch (e) { raw = null; }
        try { return attachAll(L, L.farm.normalizeState(raw), raw); }
        catch (e) { return attachAll(L, L.farm.createState(), null); }
    }

    // ── 一次打開＝一個 session ────────────────────────
    var session = null;
    function start(root) {
        var L = libs();
        var state = loadState(L);
        var scene = null, toastTimer = 0, watch = 0;
        function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {} }
        function toast(text) {
            var t = root.querySelector('[data-farm="toast"]');
            if (!t) return;
            t.textContent = text;
            t.classList.add('show');
            clearTimeout(toastTimer);
            toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
        }
        var ctx = {
            root: root, libs: L, owner: OWNER, look: look,
            state: function () { return state; },
            save: save,
            act: function (a) { return L.walk.act(state, a, L); },
            toast: toast,
            asset: function (name) { return ASSET + name; },
            goScene: function (name) { go(name); },
            exit: function () { end(); if (window.PhoneSystem && window.PhoneSystem.goHome) window.PhoneSystem.goHome(); }
        };
        function go(name) {
            if (scene) scene.destroy();
            clearTimeout(toastTimer);
            scene = (name === 'ranch' ? window.FarmRanch : window.FarmYard).mount(ctx);
        }
        function onHide() { save(); }
        function end() {
            if (!session) return;
            clearInterval(watch);
            if (scene) scene.destroy();
            scene = null;
            save();
            window.removeEventListener('pagehide', onHide);
            document.removeEventListener('visibilitychange', onHide);
            session = null;
        }
        window.addEventListener('pagehide', onHide);
        document.addEventListener('visibilitychange', onHide);
        // 農場那一格被關掉（藏起來或換成別的 app）就拆掉：走路那支在攔方向鍵，不能留著
        watch = setInterval(function () { if (!root.isConnected || root.offsetParent === null) end(); }, 800);
        session = { end: end, ctx: ctx, state: function () { return state; }, scene: function () { return scene; } };
        go(state.walk && state.walk.scene === 'ranch' ? 'ranch' : 'yard');
        return session;
    }

    function launch(container) {
        if (session) session.end();
        container.innerHTML = '';
        var root = document.createElement('div');
        root.className = 'aurelia-farm farm-app';
        root.innerHTML = '<div class="farm-loading"><i class="fa-solid fa-seedling"></i><span>正在走去後院…</span></div>';
        container.appendChild(root);
        ensureLoaded().then(function () {
            if (!root.isConnected) return;
            start(root);
        }).catch(function (e) {
            root.innerHTML = '<div class="farm-loading is-error"><i class="fa-solid fa-triangle-exclamation"></i><span>後院的檔案沒載到（' + String(e && e.message || e) + '）。</span>' +
                '<button type="button" data-farm-retry>再試一次</button></div>';
            var b = root.querySelector('[data-farm-retry]');
            if (b) b.addEventListener('click', function () { launch(container); });
        });
    }

    window.OS_FARM = {
        launch: launch,
        // 除錯用：看存檔、叫場景（DEBUG.js 或主控台）
        session: function () { return session; }
    };
})();
