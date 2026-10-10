// ============================================================
// farm_board.js — 看板（後院、牧場共用）
// ------------------------------------------------------------
// 09-29 她：「我好奇要在哪看 DASHBOARD? 這樣我能看到日誌」「是不是會累積? 看排行榜?」
// 一整頁，由上到下：累積的大數字 → 排行榜（現在只有一塊地，另一行寫還沒有）→ 每天的結算單（點了打開那一張）→ 日記（照日期分段）。
// 資料：結算單歷史與累積總額在 state.ship（farm_ship_core），日記是 state.logs，次數在 state.stats／state.ranch.stats。
// 樣式在 farm_board.css（木框，跟背包、結算單同一套）。
// ============================================================
(function () {
    'use strict';

    function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function fa(icon) { return '<i class="fa-solid ' + icon + '"></i>'; }
    function money(n) { return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n) + 'G'; }

    // 日記照日期分段：'第 3 日｜……' → { day: 3, lines: [...] }，新的在前
    function diaryByDay(logs) {
        var out = [], cur = null;
        (logs || []).forEach(function (line) {
            var m = /^第\s*(\d+)\s*日｜(.*)$/.exec(line);
            var day = m ? Number(m[1]) : null, text = m ? m[2] : line;
            if (!cur || cur.day !== day) { cur = { day: day, lines: [] }; out.push(cur); }
            cur.lines.push(text);
        });
        return out;
    }

    // opts：{ app, state(), ship: FarmShip 那個畫面物件, owner: '我', onVisit(slot, name)：按「去他家」 }
    var OTHERS = [{ slot: 'aluo', name: '阿洛' }, { slot: 'dan', name: '丹' }];
    function create(opts) {
        var others = {}, loading = false, bites = null;   // bites：每個人一共偷吃幾口（伺服器那份，雲端存檔開著才有）
        var wrap = document.createElement('div');
        wrap.className = 'fd-wrap';
        wrap.hidden = true;
        wrap.setAttribute('data-fw-modal', '');
        opts.app.appendChild(wrap);

        function tile(label, big, sub, cls) {
            return '<div class="fd-tile' + (cls ? ' ' + cls : '') + '"><span>' + esc(label) + '</span><strong>' + big + '</strong><small>' + sub + '</small></div>';
        }
        function render() {
            var st = opts.state(), sh = st.ship || { history: [], totals: { days: 0, income: 0, spent: 0 } };
            var T = sh.totals, net = T.income + T.spent + (T.stolen || 0);
            var rs = (st.ranch && st.ranch.stats) || { produced: 0, runaway: 0, born: 0 };
            var tiles =
                tile('總共淨賺', money(net), '出貨 +' + T.income + 'G · 花掉 ' + money(T.spent) + (T.stolen ? ' · 偷吃 +' + T.stolen + 'G' : '') + ' · ' + T.days + ' 天', net >= 0 ? 'up' : 'down') +
                tile('現在金幣', st.coins + 'G', '明天早上諾瓦來收的另外算') +
                tile('收成', st.stats.totalHarvested + ' 次', '牧場產出 ' + rs.produced + ' 樣') +
                tile('損失', st.stats.deadCrops + ' 株枯死', '跑掉 ' + rs.runaway + ' 隻' + (rs.eaten ? ' · 野狼叼走 ' + rs.eaten + ' 隻' : '') + ' · 生了 ' + rs.born + ' 隻', (st.stats.deadCrops || rs.runaway || rs.eaten) ? 'down' : '');
            // 排行榜：她這塊＋阿洛、丹在 VPS 上顧的兩塊（雲端存檔開著、打開看板時去伺服器拿；拿不到就寫還沒有）
            var rows = [{ slot: 'rae', name: opts.owner, net: net, harvested: st.stats.totalHarvested, dead: st.stats.deadCrops, me: true }];
            OTHERS.forEach(function (o) {
                var got = others[o.slot];
                rows.push(got ? Object.assign({ slot: o.slot, name: o.name }, got) : { name: o.name, empty: true });
            });
            var ranked = rows.filter(function (r) { return !r.empty; }).sort(function (a, b) { return b.net - a.net; });
            var rank = '<div class="fd-rank">' + ranked.map(function (r, i) {
                var bite = bites ? '<span>偷吃 ' + (bites[r.slot] || 0) + ' 口</span>' : '';
                // 別人那行：走進他家做客（偷吃一口、看他顧田）
                var go = !r.me && opts.onVisit ? '<button type="button" class="fd-visit" data-visit="' + esc(r.slot) + '" data-name="' + esc(r.name) + '">' + fa('fa-person-walking') + '去他家</button>' : '<i></i>';
                return '<div class="fd-rank-row' + (r.me ? ' is-me' : '') + '"><b>' + (i + 1) + '</b><strong>' + esc(r.name) + '</strong><span>淨賺 ' + money(r.net) + '</span><span>收成 ' + r.harvested + '</span><span>枯死 ' + r.dead + '</span>' + bite + go + '</div>';
            }).join('') + rows.filter(function (r) { return r.empty; }).map(function (r) {
                return '<div class="fd-rank-row is-empty"><b>–</b><strong>' + esc(r.name) + '</strong><span class="fd-wait">' + (loading ? '讀取中…' : '還沒有地，雲端存檔開著才看得到') + '</span></div>';
            }).join('') + '</div>';
            var hist = sh.history && sh.history.length ? '<ul class="fd-days">' + sh.history.map(function (r, i) {
                var bad = window.FarmShip ? window.FarmShip.eventLines(r).filter(function (e) { return e.bad; }).length : 0;
                return '<li><button type="button" data-rep="' + i + '"><strong>第 ' + r.day + ' 日</strong>' +
                    '<span class="' + (r.net >= 0 ? 'up' : 'down') + '">' + money(r.net) + '</span>' +
                    '<small>出貨 ' + r.sold.length + ' 樣' + (bad ? ' · ' + bad + ' 件壞消息' : '') + '</small>' + fa('fa-chevron-right') + '</button></li>';
            }).join('') + '</ul>' : '<p class="fd-empty">還沒有結算單，過一天就有第一張。</p>';
            var diary = diaryByDay(st.logs);
            var diaryHtml = diary.length ? diary.map(function (d) {
                return '<div class="fd-diary-day"><h5>' + (d.day != null ? '第 ' + d.day + ' 日' : '更早') + '</h5><ul>' +
                    d.lines.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul></div>';
            }).join('') : '<p class="fd-empty">還沒有日記。</p>';
            wrap.innerHTML = '<section class="fd-card" role="dialog" aria-label="看板">' +
                '<header class="fd-head"><strong>' + fa('fa-chart-simple') + esc(opts.owner) + '的農場看板</strong><button type="button" class="fd-close" aria-label="關上">' + fa('fa-xmark') + '</button></header>' +
                '<div class="fd-body">' +
                '<div class="fd-tiles">' + tiles + '</div>' +
                '<h4>' + fa('fa-ranking-star') + '排行榜</h4>' + rank +
                '<h4>' + fa('fa-receipt') + '每天的結算單</h4>' + hist +
                '<h4>' + fa('fa-book-open') + '日記</h4><div class="fd-diary">' + diaryHtml + '</div>' +
                '</div></section>';
        }
        // 阿洛、丹的地在伺服器上（farm_cloud 的 peek）；數字從存檔原樣算，不用整份載入
        function sum(doc) {
            var s = doc && doc.state;
            if (!s) return null;
            var T = (s.ship && s.ship.totals) || { income: 0, spent: 0 };
            return { net: (T.income || 0) + (T.spent || 0) + (T.stolen || 0), harvested: (s.stats && s.stats.totalHarvested) || 0, dead: (s.stats && s.stats.deadCrops) || 0 };
        }
        function fetchOthers() {
            var C = window.FarmCloud;
            if (!C || !C.enabled()) return;
            loading = true;
            var jobs = OTHERS.map(function (o) {
                return C.peek(o.slot).then(function (doc) { others[o.slot] = sum(doc); }, function () {});
            });
            if (C.steals) jobs.push(C.steals().then(function (d) { bites = (d && d.total) || {}; }, function () {}));
            Promise.all(jobs).then(function () { loading = false; if (!wrap.hidden) render(); });
        }
        function open() { render(); wrap.hidden = false; fetchOthers(); }
        function close() { wrap.hidden = true; }

        wrap.addEventListener('click', function (e) {
            e.stopPropagation();
            if (e.target === wrap || e.target.closest('.fd-close')) { close(); return; }
            var v = e.target.closest('[data-visit]');
            if (v) { close(); opts.onVisit(v.getAttribute('data-visit'), v.getAttribute('data-name')); return; }
            var b = e.target.closest('[data-rep]');
            if (!b) return;
            var rep = (opts.state().ship.history || [])[Number(b.getAttribute('data-rep'))];
            if (rep && opts.ship) opts.ship.openReport(rep);   // 結算單疊在看板上面，關掉回到看板
        });
        function onKey(e) {
            // 上面疊著的結算單先收到 Esc 並關掉（它會標記處理過），這次就不關看板
            if (e.key !== 'Escape' || wrap.hidden || e.defaultPrevented) return;
            close();
        }
        window.addEventListener('keydown', onKey);

        return {
            open: open, close: close, render: function () { if (!wrap.hidden) render(); }, isOpen: function () { return !wrap.hidden; },
            destroy: function () { window.removeEventListener('keydown', onKey); }
        };
    }

    window.FarmBoard = { create: create, diaryByDay: diaryByDay };
})();
