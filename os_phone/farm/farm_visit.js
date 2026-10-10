// ============================================================
// farm_visit.js — 去別人家做客（偷菜）
// ------------------------------------------------------------
// 09-29 她：「能不能去你們的後院偷菜🤔」；接著問「我是不是能去你房間的後院看到丹在務農? 那感覺很酷欸」。
// 看板排行榜上阿洛、丹那行按「去他家」走進來：同一張後院，田是從伺服器拿的那份（唯讀，這裡什麼都不存給他）。
//   ・她照樣自己走（不扣體力）。走到成熟的田旁邊冒「偷吃一口」：拿那作物一半的錢、花她 1 點體力，主人的作物不會少；
//     每一株每個人只能偷一口。能不能偷只有伺服器判斷（relay /v1/farm-steal → VPS garden_admin.js steal），
//     伺服器說可以，錢和體力才加到她自己的存檔（farm_core.stealBite，住戶偷她也是同一支）。
//   ・主人站在他最後停下來的地方（在牧場那邊就看不到）。他在伺服器上每做成一步，garden.js 就在他存檔外層記一筆（garden.trail），
//     「看他上次怎麼顧」照那一串一步一步重播；她在這裡時他剛好醒來，新做的步驟會接著演出來（每幾秒看一次伺服器）。
//   ・沒有工具棚、池塘、出貨箱、商店、結束今天、雲端、住戶那些；牧場不開放參觀。
// 他的樣子：房間那支 ClawdPortrait 畫一格定格（丹＝小螃蟹、阿洛＝洛德）；房間沒載到就是一顆圓點。
// ctx 同 farm_yard.js；who：{ slot: 'dan'|'aluo', name }
// ============================================================
(function () {
    'use strict';

    var POLL_MS = 7000;
    var LIVE_MS = 3 * 60 * 1000;        // 他最後一步在這之內＝現在醒著
    var PLAY_SPEED = 1.6;               // 重播時他走得比她快一點（一趟二三十步，照原速要看好幾分鐘）
    var HOST_H = 11;                    // 他佔底圖高的 %（她 15%，小螃蟹、洛德本來就小一號）
    var BASE = { dan: 'crab', aluo: 'lorde' };
    // 他做的每一步頭上冒的圖示（跟她自己做事時同一套）
    var VERB_ICON = {
        water: 'fa-droplet', plant: 'fa-seedling', harvest: 'fa-basket-shopping', fertilize: 'fa-poop',
        fill: 'fa-bottle-water', take: 'fa-hand', drop: 'fa-hand', ship: 'fa-box-open', unship: 'fa-box-open',
        buy: 'fa-shop', steal: 'fa-hand', diary: 'fa-pen'
    };
    // 走進牧場／從牧場出來的點（後院小圍欄那個門）
    var PEN = { x: 87, y: 41 };

    function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function fa(icon) { return '<i class="fa-solid ' + icon + '"></i>'; }
    function when(sec) {
        var d = new Date(sec * 1000), now = new Date();
        var hm = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
        if (d.toDateString() === now.toDateString()) return '今天 ' + hm;
        var y = new Date(now); y.setDate(now.getDate() - 1);
        if (d.toDateString() === y.toDateString()) return '昨天 ' + hm;
        return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hm;
    }
    try {
        if (window.AUI && window.AUI.registerHelp) window.AUI.registerHelp({
            farm_visit: { title: '做客', body: '成熟的作物，每一株你只能偷吃一口：拿到那作物一半的錢、花 1 點體力，主人的作物不會少，照樣收得到。\n他下次醒來會在日記裡看到是你偷吃的。\n「看他上次怎麼顧」照他上次醒來做的每一步重播一次；你在這裡的時候他剛好醒來，也會直接看到他走來走去。' }
        });
    } catch (e) {}

    function template(ctx, who) {
        var A = ctx.asset;
        var help = (window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('farm_visit') : '';
        return '<section class="farm-stage" data-farm="stage" aria-label="' + esc(who.name) + '的後院">' +
            '<img class="farm-bg" src="' + A('farm_base_v2.webp') + '" alt="">' +
            '<img class="farm-decor decor-pond" src="' + A('farm_obj_pond_v1.webp') + '" alt="">' +
            '<img class="farm-decor decor-shed" src="' + A('farm_obj_shed_v1.webp') + '" alt="">' +
            '<img class="farm-decor decor-pen" src="' + A('farm_obj_pen_v1.webp') + '" alt="">' +
            '<img class="farm-decor decor-bench" src="' + A('farm_obj_bench_v1.webp') + '" alt="">' +
            // 他的出貨箱（只是擺著，他顧田時會走過去；做客不能碰）
            '<span class="fs-bin fs-bin-yard fv-deco" data-farm="bin" aria-hidden="true"></span>' +
            '<div class="farm-plots" data-farm="plots" aria-label="' + esc(who.name) + '的田"></div>' +
            // 他買了蜂箱就擺出來（10-11 大件；只看不能碰）
            '<div class="yard-hive fv-deco" data-farm="hive" hidden></div>' +
            '<div class="farm-shade"></div>' +
            '</section>' +
            '<header class="farm-title fv-title">' +
            '<button class="farm-exit" type="button" data-farm="home" aria-label="回家" title="回家">' + fa('fa-house') + '</button>' +
            '<div><strong>' + esc(who.name) + '的後院（做客）' + help + '</strong><span data-farm="where">走進來了</span></div>' +
            '</header>' +
            '<div class="farm-tools">' +
            '<button class="farm-tool" type="button" data-farm="replay" hidden>' + fa('fa-clock-rotate-left') + '<span data-farm="replay-label">看他上次怎麼顧</span></button>' +
            '</div>' +
            '<aside class="farm-stats" aria-label="我的狀態">' +
            '<div class="farm-stat coin"><span>我的金幣</span><strong data-farm="coins"></strong></div>' +
            '<div class="farm-stat"><span>我的體力</span><strong data-farm="stamina"></strong></div>' +
            '<div class="farm-stat"><span>在這裡偷吃</span><strong data-farm="bites"></strong></div>' +
            '</aside>' +
            '<aside class="farm-log" aria-live="polite">' +
            '<div class="farm-log-head"><strong>' + esc(who.name) + '的日記</strong></div>' +
            '<div data-farm="log"></div>' +
            '</aside>' +
            '<div class="farm-toast" data-farm="toast" role="status" aria-live="polite"></div>' +
            '<div class="farm-loading fv-loading" data-farm="loading">' + fa('fa-person-walking') + '<span>走去' + esc(who.name) + '家…</span></div>';
    }

    function mount(ctx, who) {
        var core = ctx.libs.farm, WC = ctx.libs.walk, Cloud = window.FarmCloud;
        var root = ctx.root;
        root.innerHTML = template(ctx, who);
        var $ = function (k) { return root.querySelector('[data-farm="' + k + '"]'); };
        var plotsRoot = $('plots');
        var mine = ctx.state;               // 她自己的存檔（錢、體力都算在這）
        var dead = false, doc = null, guest = null, stage = null, host = null, pollT = 0;
        var myBites = [];                   // 她在這家偷吃過的紀錄（伺服器那份）
        var busy = false;                   // 偷的那一下還在等伺服器
        var shown = null;                   // 重播中畫面上的田（當時的樣子）；平常 null＝照現在的
        var play = null;                    // 正在演的一串步驟 { steps, i, live }

        // ── 他的存檔 ──────────────────────────────────
        function trail() { return doc && doc.garden && doc.garden.trail; }
        function lastStepAt() { var t = trail(), s = t && t.steps; return s && s.length ? s[s.length - 1].at : 0; }
        function isLive() { var at = lastStepAt(); return !!at && Date.now() - at * 1000 < LIVE_MS; }
        function hostSpot() {
            var w = guest.__host;
            return w && w.scene === 'yard' ? { scene: 'yard', x: w.x, y: w.y } : { scene: 'ranch', x: PEN.x, y: PEN.y };
        }
        function takeDoc(d) {
            doc = d;
            var raw = d.state;
            var st = core.normalizeState(raw);
            ctx.libs.ranch.attach(st, raw);
            ctx.libs.ship.attach(st, raw);
            WC.attach(st, raw);
            st.__host = { scene: st.walk.scene, x: st.walk.x, y: st.walk.y };
            // walk 這一格給走路那支當「她站哪」：換新的存檔時照樣留著她現在的位置
            var S = WC.SCENES.yard;
            st.walk = guest ? guest.walk : { scene: 'yard', x: S.start.x, y: S.start.y, carry: 0, hand: null, can: 0, herd: st.walk.herd };
            guest = st;
        }
        function takeSteals(s) {
            myBites = ((s && s.recent) || []).filter(function (r) { return r.thief === 'rae' && r.owner === who.slot; });
        }
        function bitten(i) {
            var p = guest.plots[i];
            return myBites.some(function (r) { return r.plot === i && r.crop === p.cropId && r.plantedDay === p.plantedDay; });
        }

        // ── 畫面 ─────────────────────────────────────
        function plotsNow() { return shown || guest.plots; }
        function plotLabel(plot) {
            if (core.isEmpty(plot)) return '空地';
            var crop = core.CROPS[plot.cropId];
            if (plot.stage === 'mature') return crop.name + '成熟了';
            if (plot.stage === 'wilted') return crop.name + '枯萎了';
            return crop.name + '還在長' + (plot.wateredToday ? '（今天澆過）' : '');
        }
        function plotArt(plot) {
            var st = core.isEmpty(plot) ? (plot.wateredToday ? 'wet' : 'dry') : plot.stage;
            return window.FarmPlotDraw.svg({ state: st, crop: plot.cropId, wet: !!plot.wateredToday }).replace('class="fp-plot"', 'class="plot-art fp-plot"');
        }
        function renderPlots() {
            var fk = stage ? stage.focusKey() : null;
            plotsRoot.innerHTML = plotsNow().map(function (plot, i) {
                var cls = ['farm-plot'];
                if (plot.wateredToday) cls.push('watered');
                if (plot.stage === 'mature') cls.push('mature');
                if (plot.stage === 'wilted') cls.push('wilted');
                if (fk === 'plot:' + i) cls.push('fw-focus');
                return '<button class="' + cls.join(' ') + '" type="button" data-plot="' + i + '" data-fw-key="plot:' + i + '" aria-label="' + esc(plotLabel(plot)) + '">' + plotArt(plot) + '</button>';
            }).join('');
            var hv = $('hive'), has = !!(guest && guest.ranch && guest.ranch.hive);
            if (hv.hidden === has) {
                hv.hidden = !has;
                var bee = window.FarmAnimalDraw ? window.FarmAnimalDraw.beeSvg() : '';
                hv.innerHTML = has ? '<img class="hive-img" src="' + ctx.asset('farm_obj_beehive_v1.webp') + '" alt="">' +
                    '<span class="hive-bee hb1">' + bee + '</span><span class="hive-bee hb2">' + bee + '</span><span class="hive-bee hb3">' + bee + '</span>' : '';
            }
        }
        function whereLine() {
            var away = host && !host.visible() ? '・他在牧場那邊' : '';
            if (play && play.live) return who.name + '正在顧田' + away;
            if (play) return '重播' + who.name + '上次醒來（' + when(lastStepAt()) + '）' + away;
            if (hostSpot().scene === 'ranch') return who.name + '在牧場那邊';
            if (isLive()) return who.name + '剛剛還在顧田';
            return lastStepAt() ? who.name + '上次醒來：' + when(lastStepAt()) : who.name + '還沒醒來顧過田';
        }
        // 他自己寫的日記（「第 3 日｜丹：……」那種）
        function hisDiary() {
            var mark = '｜' + who.name + '：';
            return guest.logs.filter(function (l) { return l.indexOf(mark) >= 0; }).map(function (l) { return l.slice(l.indexOf(mark) + mark.length); });
        }
        function render() {
            if (!guest || dead) return;
            var me = mine();
            guest.stamina = me.stamina;     // 走路那支照這個決定她走起來累不累
            $('coins').textContent = me.coins + ' G';
            $('stamina').textContent = me.stamina + ' / ' + core.STAMINA_MAX;
            $('bites').textContent = myBites.length + ' 口';
            var full = !!(guest.ship && guest.ship.bin && guest.ship.bin.length);
            if ($('bin').getAttribute('data-full') !== String(full)) { $('bin').innerHTML = window.FarmItemDraw.binSvg(full); $('bin').setAttribute('data-full', String(full)); }
            $('where').textContent = whereLine();
            var d = hisDiary().slice(0, 3);
            $('log').innerHTML = d.length ? d.map(function (l) { return '<div class="farm-log-line">' + esc(l) + '</div>'; }).join('') : '<div class="farm-log-line">還沒寫過日記</div>';
            var rb = $('replay'), t = trail();
            rb.hidden = !(t && t.steps && t.steps.length);
            $('replay-label').textContent = play && !play.live ? '跳過' : '看他上次怎麼顧';
            rb.classList.toggle('primary', !!(play && !play.live));
            renderPlots();
            if (stage) stage.refresh();
        }

        // ── 偷吃一口 ─────────────────────────────────
        function stealActions(i) {
            var plot = plotsNow()[i];
            if (!core.isMature(plot)) return [];
            if (shown) return [{ icon: 'fa-hand', label: '偷吃一口', sub: '等重播完', disabled: true, why: '等他這趟演完再偷。' }];
            if (bitten(i)) return [{ icon: 'fa-face-smile', label: '已經偷吃過了', disabled: true, why: '這株你偷吃過了，等他收成、重新種下去才有新的。' }];
            var tired = !core.canSteal(mine()).ok;
            return [{
                icon: 'fa-hand', label: '偷吃一口', cls: 'fav',
                sub: tired ? '體力不夠' : '+' + core.stealValue(plot.cropId) + 'G・體力 ' + core.COST.steal,
                disabled: tired || busy, why: tired ? '體力不夠了，明天再來。' : '等一下…',
                run: function () { steal(i); return null; }
            }];
        }
        function steal(i) {
            if (busy) return;
            busy = true;
            if (stage) stage.refresh();
            Cloud.steal(who.slot, i).then(function (r) {
                busy = false;
                if (dead) return;
                if (!r || !r.ok) {
                    // 伺服器說偷過了：記下來，畫面才會改寫「已經偷吃過了」
                    if (r && r.record) myBites.push(r.record);
                    ctx.toast((r && r.message) || '沒偷到。');
                    render();
                    return;
                }
                var out = core.stealBite(mine(), r.crop, r.coins, who.name);
                if (r.record) myBites.push(r.record);
                ctx.save();
                ctx.toast(out.message);
                if (out.ok && stage) stage.happy();
                render();
            }, function (e) {
                busy = false;
                if (dead) return;
                ctx.toast('沒偷到：' + (Cloud.errText ? Cloud.errText(e) : String(e && e.message || e)));
                render();
            });
        }

        // ── 他（主人）──────────────────────────────────
        function makeHost() {
            var world = $('stage');
            // 他家買了蜂箱擋路的地方不一樣：每次照他現在的存檔拿
            var P = { plan: function (fx, fy, tx, ty) { return window.FarmWalkStage.planner('yard', guest).plan(fx, fy, tx, ty); } };
            var pos = document.createElement('div');
            pos.className = 'fw-pos fv-host-pos';
            pos.style.setProperty('--fw-h', HOST_H + '%');
            pos.style.zIndex = '17';
            var el = document.createElement('div');
            el.className = 'fw-player fv-host is-loading';
            el.innerHTML = '<div class="fw-body"></div><span class="fw-doing"></span><span class="fv-name">' + esc(who.name) + '</span><span class="fv-say" hidden></span>';
            pos.appendChild(el);
            world.appendChild(pos);
            var bodyEl = el.querySelector('.fw-body'), doingEl = el.querySelector('.fw-doing'), sayEl = el.querySelector('.fv-say');
            var spot = hostSpot();
            var h = { x: spot.x, y: spot.y, scene: spot.scene, path: [], dest: null, cb: null, walking: false, flip: false, speed: 1 };
            var drawn = {};

            // 樣子：房間的小方塊畫一格定格，裁掉四周的透明（不然腳底下、頭頂上空一大塊）
            (function drawLook() {
                var CP = window.ClawdPortrait;
                if (!CP || !CP.renderStill) { el.classList.add('is-dot'); el.classList.remove('is-loading'); return; }
                var cv = document.createElement('canvas');
                Promise.resolve(CP.renderStill(cv, null, 'idle', 0, BASE[who.slot] || 'crab')).then(function () {
                    if (dead) return;
                    var img = new Image();
                    img.className = 'fw-img';
                    img.alt = '';
                    img.onload = function () { if (!dead) { bodyEl.appendChild(img); el.classList.remove('is-loading'); } };
                    img.src = trim(cv);
                }).catch(function () { el.classList.add('is-dot'); el.classList.remove('is-loading'); });
            })();
            function trim(cv) {
                try {
                    var c = cv.getContext('2d'), d = c.getImageData(0, 0, cv.width, cv.height).data;
                    var x1 = cv.width, y1 = cv.height, x2 = -1, y2 = -1;
                    for (var y = 0; y < cv.height; y++) for (var x = 0; x < cv.width; x++) {
                        if (d[(y * cv.width + x) * 4 + 3] > 8) { if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y; }
                    }
                    if (x2 < 0) return cv.toDataURL();
                    var out = document.createElement('canvas');
                    out.width = x2 - x1 + 1; out.height = y2 - y1 + 1;
                    out.getContext('2d').drawImage(cv, x1, y1, out.width, out.height, 0, 0, out.width, out.height);
                    return out.toDataURL();
                } catch (e) { return cv.toDataURL(); }
            }

            function place() {
                var tf = 'translate(' + h.x.toFixed(3) + '%,' + h.y.toFixed(3) + '%)';
                if (drawn.tf !== tf) { pos.style.transform = tf; drawn.tf = tf; }
                var hide = h.scene !== 'yard';
                if (drawn.hide !== hide) { pos.hidden = hide; drawn.hide = hide; }
                if (drawn.walking !== h.walking) { el.classList.toggle('is-walking', h.walking); drawn.walking = h.walking; }
                if (drawn.flip !== h.flip) { el.classList.toggle('is-flip', h.flip); drawn.flip = h.flip; }
            }
            function walkTo(x, y, cb) {
                h.path = P.plan(h.x, h.y, x, y);
                h.dest = h.path.shift();
                h.cb = cb || null;
            }
            function arrive() {
                var cb = h.cb;
                h.dest = null; h.cb = null; h.path = []; h.walking = false;
                place();
                if (cb) cb();
            }
            function step(dt) {
                if (!h.dest) { if (h.walking) { h.walking = false; place(); } return; }
                var vx = h.dest.x - h.x, vy = (h.dest.y - h.y) * WC.ASPECT, d = Math.hypot(vx, vy);
                if (d < .4) {
                    h.x = h.dest.x; h.y = h.dest.y;
                    if (h.path.length) h.dest = h.path.shift(); else { arrive(); return; }
                    vx = h.dest.x - h.x; vy = (h.dest.y - h.y) * WC.ASPECT; d = Math.hypot(vx, vy) || 1;
                }
                var sp = window.FarmWalkStage.SPEED * h.speed * dt / 1000;
                if (sp >= d) { h.x = h.dest.x; h.y = h.dest.y; }
                else { h.x += vx / d * sp; h.y += vy / d * sp / WC.ASPECT; }
                if (Math.abs(vx) > .05) h.flip = vx > 0;
                h.walking = true;
                place();
            }
            // 照步驟走：這一步在後院就走過去；在牧場就走進小圍欄那個門、看不到他
            function go(s, cb) {
                if (s.s === 'ranch') {
                    if (h.scene !== 'yard') { cb(); return; }
                    walkTo(PEN.x, PEN.y, function () { h.scene = 'ranch'; place(); cb(); });
                    return;
                }
                if (h.scene !== 'yard') { h.scene = 'yard'; h.x = PEN.x; h.y = PEN.y; place(); }
                walkTo(s.x, s.y, cb);
            }
            var doingT = 0, sayT = 0;
            function doing(icon) {
                doingEl.innerHTML = fa(icon);
                el.classList.add('is-doing');
                clearTimeout(doingT);
                doingT = setTimeout(function () { el.classList.remove('is-doing'); }, 700);
            }
            function say(text, ms) {
                sayEl.textContent = text;
                sayEl.hidden = false;
                clearTimeout(sayT);
                sayT = setTimeout(function () { sayEl.hidden = true; }, ms || 4200);
            }

            // 自己的迴圈（跟她那支一樣：rAF＋背景時用計時器補，一步最多 60 毫秒）
            var last = performance.now(), raf = 0;
            function advance(now) {
                var left = Math.min(2000, now - last);
                last = now;
                while (left > 0 && !dead) { step(Math.min(60, left)); left -= 60; }
            }
            function tick(now) { if (dead) return; advance(now); raf = requestAnimationFrame(tick); }
            raf = requestAnimationFrame(tick);
            var backup = setInterval(function () { var now = performance.now(); if (!dead && now - last > 200) advance(now); }, 100);
            place();

            return {
                el: el,
                go: go,
                doing: doing,
                say: say,
                visible: function () { return h.scene === 'yard'; },
                // 直接站到某一點（重播從頭開始、演完回到他現在站的地方）
                put: function (s) { h.scene = s.scene || 'yard'; h.x = s.x; h.y = s.y; h.dest = null; h.cb = null; h.path = []; h.walking = false; place(); },
                speed: function (v) { h.speed = v; },
                // 她走到他旁邊：冒一個小窗（名字、他最近寫的日記、看他上次怎麼顧）
                target: function () {
                    return {
                        key: 'host', x: h.x, y: h.y, reach: 9, el: el,
                        anchor: function () { return bodyEl; },
                        title: function () { return who.name; },
                        info: function () { var d = hisDiary()[0]; return d ? '「' + d + '」' : whereLine(); },
                        actions: function () {
                            var t = trail();
                            if (!(t && t.steps && t.steps.length) || play) return [];
                            return [{ icon: 'fa-clock-rotate-left', label: '看他上次怎麼顧', sub: when(lastStepAt()), run: function () { replay(); return null; } }];
                        }
                    };
                },
                destroy: function () { cancelAnimationFrame(raf); clearInterval(backup); clearTimeout(doingT); clearTimeout(sayT); }
            };
        }

        // ── 看他顧田：一步一步演 ─────────────────────────
        function clonePlots(list) { return (list || []).map(function (p) { return JSON.parse(JSON.stringify(p)); }); }
        // 重播他上一趟：田先換回他醒來那時候的樣子，他站回起點，再照步驟走
        function replay() {
            var t = trail();
            if (!t || !t.steps || !t.steps.length || !host) return;
            shown = t.start && t.start.plots ? clonePlots(t.start.plots) : clonePlots(guest.plots);
            var s0 = t.start || t.steps[0];
            host.put({ scene: s0.s || 'yard', x: s0.x, y: s0.y });
            play = { steps: t.steps.slice(), i: 0, live: false };
            host.speed(PLAY_SPEED);
            render();
            next();
        }
        // 做客時他剛好醒著：新做的步驟接著演（田從剛才的樣子一步一步改）
        function playLive(steps, before) {
            if (!host) return;
            if (play) { play.steps = play.steps.concat(steps); return; }
            shown = before;
            play = { steps: steps.slice(), i: 0, live: true };
            host.speed(1);
            render();
            next();
        }
        function next() {
            if (dead || !play) return;
            if (play.i >= play.steps.length) { endPlay(); return; }
            var s = play.steps[play.i++];
            host.go(s, function () {
                if (dead || !play) return;
                if (shown && s.p && s.i != null) { shown[s.i] = core.normalizeState({ version: core.VERSION, plots: [s.p] }).plots[0]; renderPlots(); }
                if (VERB_ICON[s.v]) host.doing(VERB_ICON[s.v]);
                if (s.t) host.say(s.t, s.v === 'diary' ? 5200 : 2600);
                $('where').textContent = whereLine();
                setTimeout(next, s.v === 'diary' ? 2400 : (s.v === 'go' ? 150 : 650));
            });
        }
        function endPlay() {
            play = null;
            shown = null;
            if (host) { host.speed(1); host.put(hostSpot()); }
            render();
        }

        // ── 他醒著的話，隔幾秒看一次伺服器 ──────────────────
        function schedulePoll() { clearTimeout(pollT); if (!dead) pollT = setTimeout(poll, POLL_MS); }
        function poll() {
            if (dead) return;
            if (document.visibilityState !== 'visible') { schedulePoll(); return; }
            Cloud.peek(who.slot).then(function (d) {
                if (dead || !d || !d.state || !doc || d.rev === doc.rev) return;
                var oldT = trail(), oldN = oldT && oldT.steps ? oldT.steps.length : 0;
                var before = clonePlots(guest.plots);
                takeDoc(d);
                var t = trail();
                var fresh = [];
                if (t && t.steps) {
                    if (oldT && oldT.at0 === t.at0) fresh = t.steps.slice(oldN);
                    else { fresh = t.steps; if (t.start && t.start.plots) before = clonePlots(t.start.plots); }
                }
                if (fresh.length) playLive(fresh, before);
                else if (!play && host) host.go({ s: hostSpot().scene, x: hostSpot().x, y: hostSpot().y }, function () {});
                render();
            }, function () {}).then(schedulePoll, schedulePoll);
        }

        // ── 開場 ─────────────────────────────────────
        function begin() {
            var load = $('loading');
            if (load) load.remove();
            renderPlots();
            host = makeHost();
            stage = window.FarmWalkStage.create({
                app: root, world: $('stage'), scene: 'yard', zFixed: 17,
                state: function () { return guest; },
                targets: function () {
                    var SP = WC.SCENES.yard.spots;
                    var list = plotsNow().map(function (plot, i) {
                        var s = SP['plot' + i];
                        return {
                            key: 'plot:' + i, x: s.x, y: s.y, reach: s.reach, el: plotsRoot.children[i],
                            anchor: function () { var b = plotsRoot.children[i]; return b && b.querySelector('svg'); },
                            title: function () { return '第 ' + (i + 1) + ' 塊田'; },
                            info: function () { return plotLabel(plotsNow()[i]); },
                            actions: function () { return stealActions(i); }
                        };
                    });
                    if (host && host.visible()) list.push(host.target());
                    return list;
                },
                look: ctx.look, toast: ctx.toast, onChange: render, onStamina: function () {},
                onDoor: function () { ctx.toast('牧場是' + who.name + '的，沒開放參觀。'); }
            });
            render();
            schedulePoll();
        }
        function fail(msg) {
            var load = $('loading');
            if (!load) return;
            load.classList.add('is-error');
            load.innerHTML = fa('fa-triangle-exclamation') + '<span>' + esc(msg) + '</span><button type="button" data-farm="home2">回家</button>';
            load.querySelector('[data-farm="home2"]').addEventListener('click', goHome);
        }
        function goHome() { ctx.goScene(mine().walk && mine().walk.scene === 'ranch' ? 'ranch' : 'yard'); }
        $('home').addEventListener('click', goHome);
        $('replay').addEventListener('click', function () { if (play && !play.live) endPlay(); else replay(); });

        if (!Cloud || !Cloud.enabled()) fail('要先開雲端存檔，才找得到' + who.name + '家。');
        else Promise.all([Cloud.peek(who.slot), Cloud.steals().catch(function () { return null; })]).then(function (r) {
            if (dead) return;
            if (!r[0] || !r[0].state) { fail(who.name + '還沒有地。'); return; }
            takeDoc(r[0]);
            takeSteals(r[1]);
            begin();
        }, function (e) {
            if (!dead) fail('走不到' + who.name + '家：' + (Cloud.errText ? Cloud.errText(e) : String(e && e.message || e)));
        });

        return {
            render: render,
            destroy: function () {
                dead = true;
                clearTimeout(pollT);
                if (stage) stage.destroy();
                if (host) host.destroy();
            }
        };
    }

    window.FarmVisit = { mount: mount };
})();
