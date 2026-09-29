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
        'farm_walk_ui.js', 'farm_bag.js', 'farm_ship.js', 'farm_board.js', 'farm_cloud.js',
        'farm_yard.js', 'farm_ranch.js', 'farm_visit.js'
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
        if (window.FarmYard && window.FarmRanch && window.FarmVisit) return Promise.resolve();
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
    function localRaw() {
        try {
            var raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
            // 以前在測試頁玩過：第一次打開就接著那塊田玩（只接一次，之後各存各的）
            if (!raw) raw = JSON.parse(localStorage.getItem(LAB_KEY) || 'null');
            return raw;
        } catch (e) { return null; }
    }
    // raw：這次要用的那份（雲端存檔開著時可能是伺服器上的；見 farm_cloud.js）
    function loadState(L, raw) {
        try { return attachAll(L, L.farm.normalizeState(raw), raw); }
        catch (e) { return attachAll(L, L.farm.createState(), null); }
    }

    // ── 酒館本體的兩條 :has([style…]) 規則：後院開著時先拿下來 ─────
    // 🚨 酒館 css/toggle-dependent.css 有 `…:has(> .del_checkbox[style*="display: block"])…`、
    //    `#adaptive_p_block:has([…][style*="display: none"])…`。:has() 裡面看 style 屬性＝頁面上「任何」元素的 style 一改，
    //    瀏覽器就把 body 的 :has() 全部重查、整頁掃一遍：她的酒館（七萬多個元素）一次約 5ms。
    //    後院每一格都在改小人和鏡頭的位置 → 每格多 5ms 以上，鏡頭一動就一頓一頓；手機版沒有這兩條，所以不卡。
    //    在她的酒館實測同一段走路：拿掉 0 格掉幀、放回去 26 格。
    //    那兩條管的是「文件模式刪訊息的勾選框」「取樣器設定頁」，後院開著時用不到；關掉後院原樣放回原位。
    var parked = [];
    function parkHasStyleRules() {
        if (parked.length) return;
        function walk(list) {
            for (var i = list.length - 1; i >= 0; i--) {
                var r = list[i];
                if (r.cssRules && !r.selectorText) walk(r.cssRules);
                else if (r.selectorText && r.selectorText.indexOf(':has(') >= 0 && r.selectorText.indexOf('[style') >= 0) {
                    var owner = r.parentRule || r.parentStyleSheet;
                    parked.push({ owner: owner, i: i, text: r.cssText });
                    owner.deleteRule(i);
                }
            }
        }
        Array.prototype.forEach.call(document.styleSheets, function (ss) {
            try { walk(ss.cssRules); } catch (e) { /* 跨網域的樣式表讀不到，本來就不是它 */ }
        });
    }
    function unparkHasStyleRules() {
        // 拿的時候是從後面往前拿，放回去從前面往後放，位置才會跟原本一樣
        parked.slice().reverse().forEach(function (x) {
            try { x.owner.insertRule(x.text, Math.min(x.i, x.owner.cssRules.length)); } catch (e) {}
        });
        parked = [];
    }

    // ── 一次打開＝一個 session ────────────────────────
    var session = null;
    function start(root, raw, note) {
        var L = libs();
        var state = loadState(L, raw);
        var scene = null, toastTimer = 0, watch = 0;
        var Cloud = window.FarmCloud;
        // 存在這台；雲端存檔開著的話順便送上去（停手一下才送）
        function save() {
            try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
            if (Cloud) Cloud.changed(state);
        }
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
            goScene: function (name, arg) { go(name, arg); },
            // 去別人家做客（看板排行榜上「去他家」）：slot＝他在伺服器上那塊地（dan／aluo）
            visit: function (slot, name) { go('visit', { slot: slot, name: name }); },
            exit: function () { end(); if (window.PhoneSystem && window.PhoneSystem.goHome) window.PhoneSystem.goHome(); },
            // 雲端存檔剛連上、按了立即同步：這一格重開一次，開的時候就會跟伺服器對一次
            //   這裡只存這台、不先送：送上去跟重開時的比對會撞在一起，讓重開那一次自己決定要送還是要拿
            resync: function () { var c = root.parentNode; end('local'); if (c) launch(c); }
        };
        function go(name, arg) {
            if (scene) scene.destroy();
            clearTimeout(toastTimer);
            if (name === 'visit') scene = window.FarmVisit.mount(ctx, arg);
            else scene = (name === 'ranch' ? window.FarmRanch : window.FarmYard).mount(ctx);
        }
        function onHide() {
            save();
            // 切出去／關掉：手上還沒送的立刻送（keepalive，頁面關了也送得出去）
            if (Cloud && document.visibilityState === 'hidden') Cloud.flush(true);
        }
        // how：不給＝存這台＋送上去；'local'＝只存這台；'drop'＝什麼都不存（手上這份已經過時，換成伺服器上的）
        function end(how) {
            if (!session) return;
            clearInterval(watch);
            if (scene) scene.destroy();
            scene = null;
            if (how === 'local') { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {} }
            else if (how !== 'drop') { save(); if (Cloud) Cloud.flush(); }
            window.removeEventListener('pagehide', onHide);
            document.removeEventListener('visibilitychange', onHide);
            unparkHasStyleRules();
            session = null;
        }
        parkHasStyleRules();
        window.addEventListener('pagehide', onHide);
        document.addEventListener('visibilitychange', onHide);
        // 農場那一格被關掉（藏起來或換成別的 app）就拆掉：走路那支在攔方向鍵，不能留著
        watch = setInterval(function () { if (!root.isConnected || root.offsetParent === null) end(); }, 800);
        session = { end: end, ctx: ctx, state: function () { return state; }, scene: function () { return scene; } };
        // 玩到一半另一台裝置存過了：這台手上這份不能再蓋上去，換成最新的重開
        if (Cloud) Cloud.setOnNewer(function (remote) {
            var c = root.parentNode;
            try { localStorage.setItem(STORE_KEY, JSON.stringify(remote)); } catch (e) {}
            end('drop');
            if (c) launch(c, { raw: remote, note: '另一台裝置剛存過這塊田，換成最新的了' });
        });
        go(state.walk && state.walk.scene === 'ranch' ? 'ranch' : 'yard');
        if (note) toast(note);
        claimSteals();
        return session;
    }

    // 別人偷吃她的田：打開後院時去伺服器拿還沒看過的那幾筆，寫進她的日記、跳一句（伺服器同時記成看過了）
    var NAMES = { dan: '丹', aluo: '阿洛', rae: '我' };
    function claimSteals() {
        var C = window.FarmCloud;
        if (!C || !C.enabled() || !C.claimSteals) return;
        C.claimSteals().then(function (r) {
            var list = (r && r.list) || [], s = session;
            if (!list.length || !s) return;
            var L = libs(), st = s.state();
            // 舊的先寫：日記新的在上面
            list.slice().sort(function (a, b) { return a.at - b.at; }).forEach(function (x) { L.farm.bitten(st, NAMES[x.thief] || x.thief, x.crop, x.plot); });
            s.ctx.save();
            var one = list[0], crop = L.farm.CROPS[one.crop];
            s.ctx.toast(list.length === 1 ? (NAMES[one.thief] || one.thief) + '偷吃了你一口' + (crop ? crop.name : '作物') + '（寫在日記裡了）' : '有 ' + list.length + ' 口作物被偷吃了，寫在日記裡');
            var sc = s.scene();
            if (sc && sc.render) sc.render();
        }, function () {});
    }

    // given：{ raw, note } 已經決定好用哪份（另一台剛存過、換成最新的那種），就不再問伺服器
    function launch(container, given) {
        if (session) session.end();
        container.innerHTML = '';
        var root = document.createElement('div');
        root.className = 'aurelia-farm farm-app';
        root.innerHTML = '<div class="farm-loading"><i class="fa-solid fa-seedling"></i><span>正在走去後院…</span></div>';
        container.appendChild(root);
        ensureLoaded().then(function () {
            if (given) return given;
            var mine = localRaw();
            return window.FarmCloud ? window.FarmCloud.openSync(mine) : { raw: mine };
        }).then(function (pick) {
            if (!root.isConnected) return;
            if (pick.raw) try { localStorage.setItem(STORE_KEY, JSON.stringify(pick.raw)); } catch (e) {}
            start(root, pick.raw, pick.note);
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
