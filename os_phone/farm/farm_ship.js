// ============================================================
// farm_ship.js — 出貨箱的畫面＋結算單（後院、牧場共用）
// ------------------------------------------------------------
// 規則在 farm_ship_core.js（放進去、拿回來、過一天結算）；位置檢查在 farm_walk_core.js 的 act。
// 這支管：場景裡那個箱子、走近後「放東西進去」的面板、過一天跳出來的結算單（也可以從右上再打開上一張）。
// 樣式在 farm_ship.css（木框，跟快捷列／背包同一套）。
// ============================================================
(function () {
    'use strict';

    function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function fa(icon) { return '<i class="fa-solid ' + icon + '"></i>'; }
    function money(n) { return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n) + 'G'; }
    // 收購商：諾瓦（09-29 她挑的圍裙店主、她取的名字）。長相在 FarmItemDraw.buyerSvg。
    // 之後接 AI 出價與評語時，評語放在 report.buyer.say；現在是照牌價收，評語那格不顯示（不假造內容）。
    var BUYER = { name: '諾瓦' };

    function iconOf(key) {
        var p = key.split(':');
        if (p[0] === 'harvest') return window.FarmItemDraw.svg({ kind: 'harvest', crop: p[1] });
        return window.FarmAnimalDraw ? window.FarmAnimalDraw.productSvg(p[1], p[2]) : '';
    }

    // 昨天發生的事：從農場、牧場過一天的回報翻成一句一句
    function eventLines(rep) {
        var out = [], f = rep.farm, r = rep.ranch;
        if (f) {
            if (f.grew) out.push({ icon: 'fa-seedling', text: f.grew + ' 塊田長大一階' });
            if (f.rescued) out.push({ icon: 'fa-hand-holding-droplet', text: f.rescued + ' 塊救回來的田在休養' });
            if (f.wilted) out.push({ icon: 'fa-triangle-exclamation', text: f.wilted + ' 塊田兩天沒澆水，枯萎了（今天澆還救得回來）', bad: true });
            if (f.died) out.push({ icon: 'fa-skull', text: f.died + ' 塊田枯死了', bad: true });
        }
        if (r) {
            if (r.thirsty) out.push({ icon: 'fa-droplet-slash', text: '水槽昨天是乾的，動物什麼都沒產', bad: true });
            else if (r.made) out.push({ icon: 'fa-egg', text: '牧場產了 ' + r.made + ' 樣東西（蛋在地上、奶和毛要去收）' });
            if (r.wasted && r.wasted.length) out.push({ icon: 'fa-hourglass-end', text: r.wasted.join('、') + '前一天的沒收，浪費了一份', bad: true });
            if (r.downgraded) out.push({ icon: 'fa-broom', text: '牧場太髒，' + r.downgraded + ' 樣上等品降成普通', bad: true });
            if (r.fellSick && r.fellSick.length) out.push({ icon: 'fa-face-dizzy', text: r.fellSick.join('、') + '生病了', bad: true });
            if (r.healed && r.healed.length) out.push({ icon: 'fa-heart', text: r.healed.join('、') + '病好了' });
            if (r.born && r.born.length) out.push({ icon: 'fa-baby', text: '生了' + r.born.map(function (b) { return b.name; }).join('、') });
            if (r.grown && r.grown.length) out.push({ icon: 'fa-arrow-up', text: r.grown.join('、') });
            var stillHungry = (r.hungry || 0) - ((r.ran && r.ran.length) || 0);
            if (stillHungry > 0) out.push({ icon: 'fa-wheat-awn', text: stillHungry + ' 隻昨天沒吃到東西', bad: true });
            if (r.ranNames && r.ranNames.length) out.push({ icon: 'fa-person-running', text: r.ranNames.join('、') + '餓了兩天，翻圍欄跑了', bad: true });
        }
        return out;
    }

    // opts：{ app, world, scene, state(), libs, toast(text), onChange() }
    function create(opts) {
        var ship = window.FarmShipCore, WC = window.FarmWalkCore;
        var app = opts.app, libs = opts.libs;
        var binKey = opts.scene === 'ranch' ? 'ranchbin' : 'yardbin';
        var spot = WC.SCENES[opts.scene].spots[binKey];

        // ── 場景裡的箱子 ──
        var binEl = document.createElement('button');
        binEl.type = 'button';
        binEl.className = 'fs-bin fs-bin-' + opts.scene;
        binEl.setAttribute('data-fw-key', binKey);
        binEl.setAttribute('aria-label', '出貨箱');
        opts.world.appendChild(binEl);
        var binFull = null;
        function renderBin() {
            var full = ship.binList(opts.state(), libs).length > 0;
            if (full === binFull) return;
            binFull = full;
            binEl.innerHTML = window.FarmItemDraw.binSvg(full);
        }

        // ── 「放東西進去」面板 ──
        var wrap = document.createElement('div');
        wrap.className = 'fs-wrap';
        wrap.hidden = true;
        wrap.setAttribute('data-fw-modal', '');
        app.appendChild(wrap);
        var mode = null;   // 'ship' | 'report'
        function close() { wrap.hidden = true; mode = null; }
        function openShip() { mode = 'ship'; wrap.hidden = false; renderShip(); }
        function renderShip() {
            var st = opts.state();
            var have = ship.sellables(st, libs), inBin = ship.binList(st, libs), total = ship.binTotal(st, libs);
            var rows = have.length ? have.map(function (i) {
                return '<div class="fs-row"><span class="fs-ico">' + iconOf(i.key) + '</span><div class="fs-name"><strong>' + esc(i.name) + '</strong><small>有 ' + i.have + ' ' + esc(i.unit) + ' · 一' + esc(i.unit) + ' ' + i.price + 'G</small></div>' +
                    '<button type="button" data-ship="' + esc(i.key) + '" data-n="1">放 1</button><button type="button" class="fs-all" data-ship="' + esc(i.key) + '">全部 +' + (i.price * i.have) + 'G</button></div>';
            }).join('') : '<p class="fs-empty">沒有能賣的東西。收成、撿蛋、擠奶、剪毛之後再來。</p>';
            var binRows = inBin.length ? inBin.map(function (b) {
                return '<li><span>' + esc(b.name) + ' × ' + b.qty + '</span><b>+' + b.amount + 'G</b></li>';
            }).join('') : '<li class="fs-none">箱子是空的</li>';
            wrap.innerHTML = '<section class="fs-card" role="dialog" aria-label="出貨箱">' +
                '<header class="fs-head"><strong>' + fa('fa-box-open') + '出貨箱</strong><button type="button" class="fs-close" aria-label="關上">' + fa('fa-xmark') + '</button></header>' +
                '<div class="fs-body"><h4>手上能賣的</h4><div class="fs-list">' + rows + '</div>' +
                '<h4>箱子裡</h4><ul class="fs-bin-list">' + binRows + '</ul></div>' +
                '<footer class="fs-foot"><span class="fs-nova-line"><span class="fs-nova sm">' + window.FarmItemDraw.buyerSvg() + '</span>明天早上' + BUYER.name + '來收，大約 <b>+' + total + 'G</b></span>' +
                (inBin.length ? '<button type="button" class="fs-back">全部拿回來</button>' : '') + '</footer></section>';
        }

        // ── 結算單 ──
        function openReport(rep) {
            rep = rep || (opts.state().ship && opts.state().ship.report);
            if (!rep) { if (opts.toast) opts.toast('還沒有結算單。過一天才會有。'); return; }
            mode = 'report';
            wrap.hidden = false;
            var sold = rep.sold.length ? rep.sold.map(function (s) {
                return '<li><span class="fs-ico sm">' + iconOf(s.key) + '</span><span>' + esc(s.name) + ' × ' + s.qty + '</span><em>' + s.price + 'G</em><b>+' + s.amount + 'G</b></li>';
            }).join('') : '<li class="fs-none">這天沒有出貨</li>';
            var spent = rep.spent.length ? rep.spent.map(function (s) {
                return '<li><span>' + esc(s.note) + '</span><b class="minus">' + money(s.amount) + '</b></li>';
            }).join('') : '<li class="fs-none">這天沒有花錢</li>';
            // 去別人家偷吃拿到的（沒有就整段不出現）
            var stolenHtml = rep.stolen && rep.stolen.length ? '<h4>偷吃來的<b>+' + rep.stolenTotal + 'G</b></h4><ul class="fs-spent">' + rep.stolen.map(function (s) {
                return '<li><span>' + esc(s.note) + '</span><b>+' + s.amount + 'G</b></li>';
            }).join('') + '</ul>' : '';
            var ev = eventLines(rep);
            var evHtml = ev.length ? '<h4>昨天發生的事</h4><ul class="fs-events">' + ev.map(function (e) {
                return '<li' + (e.bad ? ' class="bad"' : '') + '>' + fa(e.icon) + '<span>' + esc(e.text) + '</span></li>';
            }).join('') + '</ul>' : '';
            wrap.innerHTML = '<section class="fs-card fs-report" role="dialog" aria-label="結算單">' +
                '<header class="fs-head"><strong>' + fa('fa-receipt') + '第 ' + rep.day + ' 日結算</strong><button type="button" class="fs-close" aria-label="關上">' + fa('fa-xmark') + '</button></header>' +
                '<div class="fs-body">' +
                '<div class="fs-net ' + (rep.net >= 0 ? 'up' : 'down') + '"><span>這一天淨賺</span><strong>' + money(rep.net) + '</strong><small>金幣 ' + rep.coinsStart + ' → ' + rep.coinsEnd + '</small></div>' +
                '<h4>出貨<b>+' + rep.income + 'G</b></h4>' +
                '<div class="fs-buyer"><span class="fs-nova">' + window.FarmItemDraw.buyerSvg() + '</span><div><strong>' + BUYER.name + '</strong>' +
                (rep.buyer && rep.buyer.say ? '<p>' + esc(rep.buyer.say) + '</p>' : '<p>' + (rep.sold.length ? '照牌價收走了這些。' : '今天沒有收到貨。') + '</p>') + '</div></div>' +
                '<ul class="fs-sold">' + sold + '</ul>' + stolenHtml +
                '<h4>花掉的<b class="minus">' + money(rep.spentTotal) + '</b></h4><ul class="fs-spent">' + spent + '</ul>' +
                evHtml + '</div>' +
                '<footer class="fs-foot"><button type="button" class="fs-ok">知道了</button></footer></section>';
        }

        wrap.addEventListener('click', function (e) {
            e.stopPropagation();
            if (e.target === wrap || e.target.closest('.fs-close') || e.target.closest('.fs-ok')) { close(); return; }
            var b = e.target.closest('[data-ship]');
            var out = null;
            if (b) out = WC.act(opts.state(), { type: 'ship', item: b.getAttribute('data-ship'), quantity: b.getAttribute('data-n') ? Number(b.getAttribute('data-n')) : null }, libs);
            else if (e.target.closest('.fs-back')) out = WC.act(opts.state(), { type: 'unship' }, libs);
            if (!out) return;
            if (opts.toast) opts.toast(out.message);
            if (opts.onChange) opts.onChange();
            if (mode === 'ship') renderShip();
        });
        // Esc 關掉就標記處理過，底下的看板才不會跟著一起關
        function onKey(e) { if (e.key === 'Escape' && !wrap.hidden) { close(); e.preventDefault(); } }
        window.addEventListener('keydown', onKey);

        // 給走路舞台：箱子這個搆得到的東西
        function target() {
            var st = opts.state();
            return {
                key: binKey, x: spot.x, y: spot.y, reach: spot.reach, el: binEl,
                title: function () { return '出貨箱'; },
                info: function () {
                    var n = ship.binList(st, libs).length;
                    return n ? '箱子裡 ' + n + ' 樣，明天早上' + BUYER.name + '來收，大約 +' + ship.binTotal(st, libs) + 'G。' : '要賣的東西放進來，明天早上' + BUYER.name + '來收。';
                },
                actions: function () {
                    var list = [{ icon: 'fa-box-open', label: '放東西進去', cls: 'fav', sub: ship.sellables(st, libs).length ? null : '沒有能賣的', run: function () { openShip(); return null; } }];
                    if (ship.binList(st, libs).length) list.push({ icon: 'fa-rotate-left', label: '全部拿回來', run: function () { return WC.act(st, { type: 'unship' }, libs); } });
                    return list;
                }
            };
        }

        // 「結束今天」：提早結束這一天 → 跳結算單。今天已經提早結束過（比真的時間多走一天了）就擋下來跳一句，回 ok:false
        function endDay(extraOpts) {
            var out = ship.endEarly(opts.state(), libs, Date.now(), extraOpts);
            if (!out.ok) { if (opts.toast) opts.toast(out.message); return out; }
            binFull = null;
            renderBin();
            openReport(out.report);
            return out;
        }

        renderBin();
        return {
            render: renderBin, target: target, openShip: openShip, openReport: openReport, endDay: endDay, close: close,
            isOpen: function () { return !wrap.hidden; },
            destroy: function () { window.removeEventListener('keydown', onKey); }
        };
    }

    window.FarmShip = { create: create, eventLines: eventLines };
})();
