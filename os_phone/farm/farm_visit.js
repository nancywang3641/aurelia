// ============================================================
// farm_visit.js — 去別人家做客（偷菜）
// ------------------------------------------------------------
// 09-29 加：可以去住戶的後院偷菜、看他們在務農。
// 看板排行榜上阿洛、丹那行按「去他家」走進來：同一張後院，田是從伺服器拿的那份（唯讀，這裡什麼都不存給他）。
//   ・她照樣自己走（不扣體力）。走到成熟的田旁邊冒「偷吃一口」：拿那作物一半的錢、花她 1 點體力，主人的作物不會少；
//     每一株每個人只能偷一口。能不能偷只有伺服器判斷（relay /v1/farm-steal → VPS garden_admin.js steal），
//     伺服器說可以，錢和體力才加到她自己的存檔（farm_core.stealBite，住戶偷她也是同一支）。
//   ・主人站在他最後停下來的地方（在牧場那邊就看不到）。他在伺服器上每做成一步，garden.js 就在他存檔外層記一筆（garden.trail），
//     「看他上次怎麼顧」照那一串一步一步重播；她在這裡時他剛好醒來，新做的步驟會接著演出來（每幾秒看一次伺服器）。
//   ・沒有工具棚、池塘、出貨箱、商店、結束今天、雲端、住戶那些；牧場 11-23 起進得去、只能看（farm_ranch.js 的 ctx.guest）。
// 他的樣子：房間那支 ClawdPortrait 畫一格定格（丹＝小螃蟹、阿洛＝洛德）；房間沒載到就是一顆圓點。
// 11-23 小精靈：他雇的小精靈站在田裡（勤奮的一彈一彈在做、打瞌睡的坐著冒 zzz、請假的不在、夜裡在工具棚邊睡），
//   走近看牠今天做了什麼；右上「小精靈」一頁看他雇了誰、他交代什麼、這幾天每天賺多少賣了什麼、哪隻偷懶出包（小斐企劃：「回來一個畫面就看得到」）。
//   資料 FarmCloud.elves()（relay /v1/farm-elves，規則在 VPS garden_elves.js），一分鐘拿一次。
// 11-23 改版公告：右上「改版」看這週花園改了什麼（MUSE 每週寄的：種子攤上架哪幾種、哪種作物加強削弱、災難機率；FarmCloud.patch()）。
//   颱風要來時那顆變紅、寫「颱風警報」，公告最上面寫哪天、這家準備了沒；過境後寫兩家各損失什麼（規則在 VPS garden_patch.js）。
// 11-23 天氣（MUSE 可以規畫這周天氣機率）：今天晴／陰／雨／颱風（伺服器每天抽一次，MUSE 的改版定機率）；
//   陰天整片灰一點、下雨蓋一層雨絲（颱風雨更大更斜）；上面那行「丹在牧場那邊・下雨」、左邊「今天天氣」、改版公告裡「這週天氣」。
//   明天只發預報（降雨機率，不一定準），實際天氣到那天才抽。
// 11-23 只看他們（who.watch）：她不種田了，打開後院就是這個畫面——沒有偷吃（她沒有自己的田）、左上是關掉、
//   右上多「去丹家／去阿洛家」、住戶（醒來時間）、雲端；左邊那排寫他的金幣、第幾日、雇了幾隻小精靈。
// ctx 同 farm_yard.js；who：{ slot: 'dan'|'aluo', name, watch }
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
    // 只看他們時右上那顆「去另一家」
    var OTHER = { dan: { slot: 'aluo', name: '阿洛' }, aluo: { slot: 'dan', name: '丹' } };

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
            farm_watch: { title: '看他們顧田', body: '你現在不種田了，後院是去看丹和阿洛怎麼顧他們的田。\n田裡站著他們雇的小精靈：在做事的一彈一彈、打瞌睡的坐著冒 zzz、請假的不在。走近看牠今天做了什麼；右上「小精靈」看這幾天每天賺多少、賣了什麼、哪隻偷懶出包。\n「看他上次怎麼顧」照他上次醒來做的每一步重播；右上可以換去另一家。想跟他們收東西，到書咖研發頁貼收購單。' },
            farm_visit: { title: '做客', body: '成熟的作物，每一株你只能偷吃一口：拿到那作物一半的錢、花 1 點體力，主人的作物不會少，照樣收得到。\n他下次醒來會在日記裡看到是你偷吃的。\n「看他上次怎麼顧」照他上次醒來做的每一步重播一次；你在這裡的時候他剛好醒來，也會直接看到他走來走去。' }
        });
    } catch (e) {}

    function template(ctx, who) {
        var A = ctx.asset;
        var W = !!who.watch;
        var help = (window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn(W ? 'farm_watch' : 'farm_visit') : '';
        var other = W ? OTHER[who.slot] : null;
        return '<section class="farm-stage" data-farm="stage" aria-label="' + esc(who.name) + '的後院">' +
            '<img class="farm-bg" src="' + A('farm_base_v2_svg.svg') + '" alt="">' +
            '<img class="farm-decor decor-pond" src="' + A('farm_obj_pond_v1_svg.svg') + '" alt="">' +
            '<img class="farm-decor decor-shed" src="' + A('farm_obj_shed_v1_svg.svg') + '" alt="">' +
            '<img class="farm-decor decor-pen" src="' + A('farm_obj_pen_v1_svg.svg') + '" alt="">' +
            '<img class="farm-decor decor-bench" src="' + A('farm_obj_bench_v1_svg.svg') + '" alt="">' +
            // 他的出貨箱（只是擺著，他顧田時會走過去；做客不能碰）
            '<span class="fs-bin fs-bin-yard fv-deco" data-farm="bin" aria-hidden="true"></span>' +
            '<div class="farm-plots" data-farm="plots" aria-label="' + esc(who.name) + '的田"></div>' +
            // 他買了蜂箱就擺出來（10-11 大件；只看不能碰）
            '<div class="yard-hive fv-deco" data-farm="hive" hidden></div>' +
            '<div class="farm-shade"></div>' +
            '<div class="farm-weather" data-farm="weather" aria-hidden="true"></div>' +
            '</section>' +
            '<header class="farm-title fv-title' + (W ? ' fv-watch' : '') + '">' +
            (W ? '<button class="farm-exit" type="button" data-farm="exit" aria-label="離開後院" title="離開">' + fa('fa-xmark') + '</button>'
               : '<button class="farm-exit" type="button" data-farm="home" aria-label="回家" title="回家">' + fa('fa-house') + '</button>') +
            '<div><strong>' + esc(who.name) + '的後院' + (W ? '' : '（做客）') + help + '</strong><span data-farm="where">走進來了</span></div>' +
            '</header>' +
            '<div class="farm-tools">' +
            (W ? '<button class="farm-tool economy" type="button" data-farm="swap">' + fa('fa-person-walking-arrow-right') + '<span>去' + esc(other.name) + '家</span></button>' : '') +
            '<button class="farm-tool" type="button" data-farm="replay" hidden>' + fa('fa-clock-rotate-left') + '<span data-farm="replay-label">看他上次怎麼顧</span></button>' +
            '<button class="farm-tool" type="button" data-farm="diary" hidden>' + fa('fa-book-open') + '<span>日記本</span></button>' +
            '<button class="farm-tool" type="button" data-farm="elves" hidden>' + fa('fa-people-group') + '<span>小精靈</span></button>' +
            '<button class="farm-tool" type="button" data-farm="patch">' + fa('fa-scroll') + '<span>改版</span></button>' +
            (W ? '<button class="farm-tool" type="button" data-farm="residents">' + fa('fa-user-clock') + '<span>住戶</span></button>' +
                 '<button class="farm-tool" type="button" data-farm="cloud">' + fa('fa-cloud') + '<span>雲端</span></button>' : '') +
            '</div>' +
            (W ? '<aside class="farm-stats" aria-label="他的狀態">' +
                 '<div class="farm-stat coin"><span>他的金幣</span><strong data-farm="coins"></strong></div>' +
                 '<div class="farm-stat"><span>他家</span><strong data-farm="day"></strong></div>' +
                 '<div class="farm-stat"><span>小精靈</span><strong data-farm="elfn"></strong></div>' +
                 '<div class="farm-stat"><span>今天天氣</span><strong data-farm="wx">—</strong></div>' +
                 '</aside>'
               : '<aside class="farm-stats" aria-label="我的狀態">' +
                 '<div class="farm-stat coin"><span>我的金幣</span><strong data-farm="coins"></strong></div>' +
                 '<div class="farm-stat"><span>我的體力</span><strong data-farm="stamina"></strong></div>' +
                 '<div class="farm-stat"><span>在這裡偷吃</span><strong data-farm="bites"></strong></div>' +
                 '</aside>') +
            '<aside class="farm-log" aria-live="polite">' +
            '<div class="farm-log-head"><strong>' + esc(who.name) + '的日記</strong><span>完整的在日記本</span></div>' +
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
        var W = !!who.watch;                // 只看他們（11-23）：她沒有自己的田
        var cloudP = null, people = null;

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
                hv.innerHTML = has ? '<img class="hive-img" src="' + ctx.asset('farm_obj_beehive_v1_svg.svg') + '" alt="">' +
                    '<span class="hive-bee hb1">' + bee + '</span><span class="hive-bee hb2">' + bee + '</span><span class="hive-bee hb3">' + bee + '</span>' : '';
            }
        }
        function whereLine() { return whereNow() + wxTag(); }
        function whereNow() {
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
            if (W) {
                guest.stamina = core.STAMINA_MAX;   // 她自己走不扣體力，走路那支看這個決定累不累
                $('coins').textContent = guest.coins + ' G';
                $('day').textContent = '第 ' + guest.day + ' 日';
                $('elfn').textContent = myElves().elves.length ? myElves().elves.length + ' 隻' : '還沒雇';
            } else {
                var me = mine();
                guest.stamina = me.stamina;     // 走路那支照這個決定她走起來累不累
                $('coins').textContent = me.coins + ' G';
                $('stamina').textContent = me.stamina + ' / ' + core.STAMINA_MAX;
                $('bites').textContent = myBites.length + ' 口';
            }
            var full = !!(guest.ship && guest.ship.bin && guest.ship.bin.length);
            if ($('bin').getAttribute('data-full') !== String(full)) { $('bin').innerHTML = window.FarmItemDraw.binSvg(full); $('bin').setAttribute('data-full', String(full)); }
            $('where').textContent = whereLine();
            var d = hisDiary().slice(0, 3);
            $('log').innerHTML = d.length ? d.map(function (l) { return '<div class="farm-log-line">' + esc(l) + '</div>'; }).join('') : '<div class="farm-log-line">還沒寫過日記</div>';
            var rb = $('replay'), t = trail();
            rb.hidden = !(t && t.steps && t.steps.length);
            $('replay-label').textContent = play && !play.live ? '跳過' : '看他上次怎麼顧';
            rb.classList.toggle('primary', !!(play && !play.live));
            $('diary').hidden = false;
            if (diaryWrap && !diaryWrap.hidden) renderDiary();
            renderPlots();
            if (stage) stage.refresh();
        }
        // 他的日記本（整本，照日期分段，跟她自己看板裡的日記同一套）：右下角那格只放最近三行、一行太長會被切掉，手機上整格不顯示（10-14 起整本另開來看）
        var diaryWrap = null, diarySig = '';
        function renderDiary() {
            var logs = guest.logs || [], sig = logs.length + '|' + (logs[0] || '');
            if (sig === diarySig && diaryWrap.firstChild) return;   // 開著的時候每次拉他存檔都會叫到：日記沒變就不重畫，捲到一半不會跳回最上面
            diarySig = sig;
            var days = window.FarmBoard.diaryByDay(logs);
            var body = days.length ? days.map(function (d) {
                return '<div class="fd-diary-day"><h5>' + (d.day != null ? '第 ' + d.day + ' 日' : '更早') + '</h5><ul>' +
                    d.lines.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul></div>';
            }).join('') : '<p class="fd-empty">還沒有日記。</p>';
            diaryWrap.innerHTML = '<section class="fd-card" role="dialog" aria-label="' + esc(who.name) + '的日記本">' +
                '<header class="fd-head"><strong>' + fa('fa-book-open') + esc(who.name) + '的日記本</strong><button type="button" class="fd-close" aria-label="關上">' + fa('fa-xmark') + '</button></header>' +
                '<div class="fd-body"><div class="fd-diary">' + body + '</div></div></section>';
        }
        function openDiary() {
            if (!guest) return;
            if (!diaryWrap) {
                diaryWrap = document.createElement('div');
                diaryWrap.className = 'fd-wrap';
                diaryWrap.setAttribute('data-fw-modal', '');
                diaryWrap.addEventListener('click', function (e) {
                    e.stopPropagation();
                    if (e.target === diaryWrap || e.target.closest('.fd-close')) diaryWrap.hidden = true;
                });
                root.appendChild(diaryWrap);
            }
            diarySig = '';
            renderDiary();
            diaryWrap.hidden = false;
        }
        function onDiaryKey(e) {
            if (e.key !== 'Escape') return;
            if (patchWrap && !patchWrap.hidden) { e.preventDefault(); patchWrap.hidden = true; return; }
            if (elvesWrap && !elvesWrap.hidden) { e.preventDefault(); elvesWrap.hidden = true; return; }
            if (diaryWrap && !diaryWrap.hidden) { e.preventDefault(); diaryWrap.hidden = true; }
        }
        window.addEventListener('keydown', onDiaryKey);

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

        // ── 小精靈（11-23）──────────────────────────────
        var elvesDoc = null, elfT = 0, elfEls = [], elvesWrap = null;
        var ELF_MS = 60000;
        var SLOTN = { am: '早班', pm: '晚班' };
        function myElves() { var o = elvesDoc && elvesDoc.owners && elvesDoc.owners[who.slot]; return o || { elves: [], log: [], plan: {} }; }
        function elfLog() { return myElves().log || []; }
        // 牠現在在哪、什麼樣子：跟牧場那邊同一套（farm_elf_draw.js 的 view）；在牧場的不畫在這裡
        function elfView(e) { return window.FarmElfDraw.view(e, elfLog(), guest && guest.day, !!(ctx.night && ctx.night()), !!(guest && guest.ranch && guest.ranch.animals.length)); }
        var seedOf = window.FarmElfDraw.seedOf;
        function elfSpot(e, i, pose) {
            var SP = WC.SCENES.yard.spots;
            if (pose === 'wait' || pose === 'sleep') return { x: SP.shed.x - 7 + i * 6, y: SP.shed.y + 9 };
            var k = seedOf(e.id + ':' + guest.day) % guest.plots.length, sp = SP['plot' + k];
            return { x: sp.x + (i ? 5 : -5), y: sp.y + 6 };
        }
        function elfSay(e) { return window.FarmElfDraw.say(e, elfView(e)); }
        function renderElves() {
            elfEls.forEach(function (x) { x.pos.remove(); });
            elfEls = [];
            if (!guest || dead) return;
            var world = $('stage');
            myElves().elves.forEach(function (e, i) {
                var v = elfView(e), pose = v.pose;
                if (pose === 'away' || v.where === 'ranch') return;   // 在牧場那邊做事的，走進圍欄門才看得到
                var at = elfSpot(e, i, pose);
                var n = window.FarmElfDraw.node(e, pose, at);
                world.appendChild(n.pos);
                elfEls.push({ pos: n.pos, el: n.el, e: e, at: at });
            });
            $('elves').hidden = !myElves().elves.length && !elfLog().length;
            if (W && $('elfn')) $('elfn').textContent = myElves().elves.length ? myElves().elves.length + ' 隻' : '還沒雇';
        }
        function elfTargets() {
            return elfEls.map(function (x) {
                return {
                    key: 'elf:' + x.e.id, x: x.at.x, y: x.at.y, reach: 8, el: x.el,
                    anchor: function () { return x.el.querySelector('svg'); },
                    title: function () { return window.FarmElfDraw.title(x.e); },
                    info: function () { return elfSay(x.e); },
                    actions: function () { return [{ icon: 'fa-people-group', label: '看牠們這幾天', run: function () { openElves(); return null; } }]; }
                };
            });
        }
        function loadElves() {
            clearTimeout(elfT);
            if (dead || !Cloud.elves) return;
            Cloud.elves().then(function (d) {
                if (dead) return;
                elvesDoc = d;
                renderElves();
                if (stage) stage.refresh();
                if (elvesWrap && !elvesWrap.hidden) renderElvesPanel();
            }, function () {}).then(function () { if (!dead) elfT = setTimeout(loadElves, ELF_MS); });
        }
        // 「回來一個畫面就看得到」：他雇了誰、交代什麼、今天和前三天每天賺多少賣了什麼、小精靈每班做了什麼
        function dayReport(d) { return ((guest.ship && guest.ship.history) || []).find(function (r) { return r.day === d; }) || null; }
        // 🧠 11-24 小精靈接共用大腦：體力、心情、對老闆的好感、記得的事（伺服器 publicDoc 的 mind）
        function mindHtml(m) {
            if (!m) return '';
            var bar = function (lab, n) { return '<span class="fe-bar">' + lab + '<i><b class="' + (n < 30 ? 'lo' : n >= 70 ? 'hi' : '') + '" style="width:' + Math.max(0, Math.min(100, n)) + '%"></b></i>' + n + '</span>'; };
            return '<div class="fe-bars">' + bar('體力', m.sta) + bar('心情', m.mood) + bar('好感', m.fav) + '</div>' +
                '<small>薪水' + esc(m.tier) + (m.streak >= 2 ? '・連上 ' + m.streak + ' 天' : '') + (m.off ? '・排了放假' : '') + (m.mem && m.mem.length ? '・記得：' + esc(m.mem.join('、')) : '') + '</small>' +
                (m.quitWarn ? '<small class="fe-warn">說不想做了</small>' : '');
        }
        var BOSS_NAME = { praise: '誇獎了', treat: '請吃東西給', raise: '幫忙加薪：', cut: '扣了薪水：', scold: '罵了', rest: '讓這位放假：' };
        function renderElvesPanel() {
            var M = myElves(), es = M.elves || [], plan = M.plan || {};
            var cards = es.length ? es.map(function (e) {
                return '<div class="fe-card"><span class="fe-mini">' + window.FarmElfDraw.svg({ color: e.color, acc: e.acc, pose: 'work' }) + '</span><div><strong>' + esc(e.name) + '</strong>' +
                    '<small>' + esc(e.kindName + '・' + SLOTN[e.slot] + '・一天 ' + e.wage + 'G・上過 ' + e.shifts + ' 班' + (e.unpaid ? '・欠薪 ' + e.unpaid + ' 天' : '')) + '</small>' +
                    (e.quirk ? '<small>怪毛病：' + esc(e.quirk) + '</small>' : '') + mindHtml(e.mind) + '</div></div>';
            }).join('') : '<p class="fd-empty">' + esc(who.name) + '現在沒有雇小精靈，雜事他自己做。</p>';
            var crop = plan.crop && plan.crop !== 'same' && core.CROPS[plan.crop] ? '空地種' + core.CROPS[plan.crop].name : '收完照原本那種補種';
            var orders = '<p class="fe-plan">' + esc(who.name) + '的交代：' + esc(crop) + '；收成' + (plan.sell === 'merchant' ? '晚班全部放進出貨箱賣給商人' : '留在倉庫，他自己決定賣給誰') + '</p>';
            var days = [];
            for (var d = guest.day; d >= Math.max(1, guest.day - 3); d--) days.push(d);
            var body = days.map(function (d) {
                var rep = dayReport(d), recs = elfLog().filter(function (r) { return r.day === d; });
                var lines = recs.map(function (r) {
                    if (r.kind === 'hire') return { bad: false, t: '雇了' + r.name + '（' + SLOTN[r.slot] + '）' };
                    if (r.kind === 'fire') return { bad: true, t: '請' + r.name + '走了' };
                    if (r.kind === 'quit') return { bad: true, t: r.name + '不做了，走了' };
                    if (r.kind === 'boss') return { bad: r.act === 'cut' || r.act === 'scold', t: who.name + (BOSS_NAME[r.act] || '對') + r.name };
                    return { bad: r.status === 'absent' || r.status === 'quit' || !!r.slept || !!(r.oops && r.oops.length) || !!r.ate, t: r.name + '　' + String(r.text || '').replace(/^第 \d+ 日/, '') };
                });
                var money = rep
                    ? '<span class="' + (rep.net >= 0 ? 'up' : 'down') + '">那天淨賺 ' + (rep.net >= 0 ? '+' : '−') + Math.abs(rep.net) + 'G</span>' +
                      '<small>' + (rep.sold && rep.sold.length ? '賣了：' + esc(rep.sold.map(function (x) { return x.name + '×' + x.qty; }).join('、')) : '那天沒賣東西') + '</small>'
                    : (d === guest.day ? '<small>今天還沒結算（清晨 4 點）</small>' : '');
                return '<div class="fd-diary-day fe-day"><h5>第 ' + d + ' 日' + (d === guest.day ? '（今天）' : '') + '</h5><div class="fe-money">' + money + '</div>' +
                    (lines.length ? '<ul>' + lines.map(function (l) { return '<li' + (l.bad ? ' class="bad"' : '') + '>' + esc(l.t) + '</li>'; }).join('') + '</ul>' : '<p class="fd-empty">小精靈沒有紀錄。</p>') + '</div>';
            }).join('');
            elvesWrap.innerHTML = '<section class="fd-card" role="dialog" aria-label="' + esc(who.name) + '的小精靈">' +
                '<header class="fd-head"><strong>' + fa('fa-people-group') + esc(who.name) + '的小精靈和這幾天</strong><button type="button" class="fd-close" aria-label="關上">' + fa('fa-xmark') + '</button></header>' +
                '<div class="fd-body"><div class="fe-cards">' + cards + '</div>' + orders + '<h4>' + fa('fa-calendar-days') + '這幾天</h4><div class="fd-diary">' + body + '</div></div></section>';
        }
        function openElves() {
            if (!guest) return;
            if (!elvesWrap) {
                elvesWrap = document.createElement('div');
                elvesWrap.className = 'fd-wrap';
                elvesWrap.setAttribute('data-fw-modal', '');
                elvesWrap.addEventListener('click', function (e) {
                    e.stopPropagation();
                    if (e.target === elvesWrap || e.target.closest('.fd-close')) elvesWrap.hidden = true;
                });
                root.appendChild(elvesWrap);
            }
            renderElvesPanel();
            elvesWrap.hidden = false;
        }

        // ── 改版公告（11-23）──────────────────────────────
        var patchWrap = null, patchDoc = null, patchT = 0;
        // ── 天氣（11-23）：伺服器每天抽一次（FarmCloud.patch() 的 weather）──
        var WX = { sun: ['fa-sun', '晴'], cloud: ['fa-cloud', '陰'], rain: ['fa-cloud-rain', '雨'], typhoon: ['fa-hurricane', '颱風'] };
        function wxNow() { return patchDoc && patchDoc.weather && WX[patchDoc.weather.today] ? patchDoc.weather.today : ''; }
        function wxWet(k) { return k === 'rain' || k === 'typhoon'; }
        // 明天的預報：只有機率，實際到那天才抽（早一天預告，可能不會中）
        //   { date, label, typhoon, odds: { sun, cloud, rain } }
        function wxTmr() { var t = patchDoc && patchDoc.weather && patchDoc.weather.tomorrow; return t && t.odds ? t : null; }
        function wxRain(t) { return t ? (t.typhoon ? 100 : t.odds.rain | 0) : 0; }
        function wxTag() {
            var k = wxNow(), t = wxTmr();
            return (k && k !== 'sun' ? '・' + (k === 'typhoon' ? '颱風天' : WX[k][1] + '天') : '') +
                (t && t.typhoon ? '・明天颱風' : t && wxRain(t) >= 30 ? '・明天降雨機率 ' + wxRain(t) + '%' : '');
        }
        function applyWeather() {
            var el = $('weather'), k = wxNow();
            if (!el) return;
            var cls = 'farm-weather' + (k ? ' wx-' + k : '');
            if (el.className !== cls) {
                el.className = cls;
                var n = k === 'typhoon' ? 160 : k === 'rain' ? 110 : 0, html = '';
                for (var i = 0; i < n; i++) {
                    html += '<i class="fwx-drop" style="--x:' + (Math.random() * 104 - 2).toFixed(1) + '%;--t:-' + (Math.random() * 1.2).toFixed(2) + 's;--d:' +
                        ((k === 'typhoon' ? .45 : .75) + Math.random() * .35).toFixed(2) + 's;--o:' + (.55 + Math.random() * .45).toFixed(2) + '"></i>';
                }
                el.innerHTML = html;
            }
            var w = $('wx');
            var t = wxTmr();
            if (w) w.innerHTML = k ? fa(WX[k][0]) + ' ' + WX[k][1] + (t ? '｜明天' + (t.typhoon ? '颱風' : '雨 ' + wxRain(t) + '%') : '') : '—';
            var wh = $('where');
            if (wh && guest) wh.textContent = whereLine();
        }
        function weatherHtml(w) {
            if (!w || !WX[w.today]) return '';
            var o = w.odds || {};
            var days = (w.recent || []).map(function (d) {
                var it = WX[d.kind] || WX.sun;
                return '<li class="' + (wxWet(d.kind) ? 'wet' : '') + (d.kind === w.today && d === w.recent[w.recent.length - 1] ? ' today' : '') + '">' + fa(it[0]) +
                    '<span>' + esc(String(d.label).replace(/（.*/, '')) + '</span><b>' + it[1] + '</b></li>';
            }).join('');
            var tw = w.tomorrow && w.tomorrow.odds ? w.tomorrow : null, to = tw ? tw.odds : null;
            // 明天那格：畫最可能的那種，寫降雨機率
            var tk = !tw ? '' : tw.typhoon ? 'typhoon' : to.rain >= to.sun && to.rain >= to.cloud ? 'rain' : to.cloud > to.sun ? 'cloud' : 'sun';
            if (tw) days += '<li class="tmr' + (tw.typhoon || to.rain >= 50 ? ' wet' : '') + '">' + fa(WX[tk][0]) + '<span>明天</span><b>' + (tw.typhoon ? '颱風' : '雨 ' + (to.rain | 0) + '%') + '</b></li>';
            return '<h4>' + fa('fa-cloud-sun-rain') + '天氣</h4>' +
                '<p class="fe-plan">今天' + WX[w.today][1] + (wxWet(w.today) ? '：田都被雨澆濕了，今天不用澆水。' : '。') +
                (tw ? '明天預報：' + (tw.typhoon ? '颱風。' : '降雨機率 ' + (to.rain | 0) + '%（晴 ' + (to.sun | 0) + '%、陰 ' + (to.cloud | 0) + '%），預報不一定準。') : '') +
                '這週的機率：晴 ' + (o.sun | 0) + '%、陰 ' + (o.cloud | 0) + '%、雨 ' + (o.rain | 0) + '%' + (w.set ? '（這版改的，MUSE 也可以每天各自定）' : '（原本的）') + '。天氣當天才揭曉，下雨那天田自己濕。</p>' +
                (days ? '<ul class="fe-wx">' + days + '</ul>' : '');
        }
        var NAMEN = { dan: '丹', aluo: '阿洛' };
        // 颱風那一段：警報（哪天、還有幾天、這家準備了沒）或過境後的結果
        function typhoonHtml(t) {
            if (!t) return '';
            var mine = (t.prep && t.prep[who.slot]) || {}, done = t.applied && t.applied[who.slot];
            if (t.left >= 0 && !done) {
                return '<div class="fe-typhoon"><strong>' + fa('fa-hurricane') + '颱風警報：' + esc(t.label) + '晚上過境（' + (t.left === 0 ? '就是今天晚上' : '還有 ' + t.left + ' 天') + '）</strong>' +
                    '<small>沒準備的：田裡的作物會被吹爛、沒關進棚屋的動物會受傷或嚇跑、沒綁的蜂箱蜂蜜會沒了。前兩天可以搶收、前一天或當天要關動物和綁蜂箱' + (myElves().elves.length ? '，' + esc(who.name) + '雇了小精靈，牠們上班會先做這些。' : '。') + '</small>' +
                    '<small>' + esc(who.name) + '現在：動物' + (mine.shelter ? '關好了' : '還沒關') + '、蜂箱' + (mine.tie ? '綁好了' : '還沒綁（沒有蜂箱就不用）') + '</small></div>';
            }
            var res = Object.keys(t.result || {}).map(function (k) { return '<li>' + esc((NAMEN[k] || k) + '：' + String(t.result[k]).replace(/^.*?颱風過境：/, '')) + '</li>'; }).join('');
            return res ? '<div class="fe-typhoon past"><strong>' + fa('fa-hurricane') + esc(t.label) + '颱風過境了</strong><ul>' + res + '</ul></div>' : '';
        }
        // 右上那顆：颱風要來時變紅、寫「颱風警報」
        function patchBtn() {
            var b = $('patch'), t = patchDoc && patchDoc.typhoon, warn = !!(t && t.left >= 0 && !(t.applied && t.applied[who.slot]));
            if (!b) return;
            b.classList.toggle('fe-alert', warn);
            b.querySelector('span').textContent = warn ? '颱風警報' : '改版';
        }
        function loadPatch() {
            clearTimeout(patchT);
            if (dead || !Cloud || !Cloud.patch || !Cloud.enabled()) return;
            Cloud.patch().then(function (d) { if (dead) return; patchDoc = d; patchBtn(); applyWeather(); if (patchWrap && !patchWrap.hidden) renderPatch(d); }, function () {})
                .then(function () { if (!dead) patchT = setTimeout(loadPatch, 5 * 60000); });
        }
        function renderPatch(d, err) {
            var p = d && d.patch, body;
            if (err) body = '<p class="fd-empty">' + esc(err) + '</p>';
            else if (!d) body = '<p class="fd-empty">讀取中…</p>';
            else if (!p) body = '<p class="fd-empty">還沒有改版。種子攤十種都賣，價錢、災難和天氣機率都是原本的。MUSE 寄來第一版之後，這裡會寫這週改了什麼。</p>';
            else {
                var dt = new Date(p.at);
                body = '<p class="fe-plan">' + esc(p.from) + '，' + (dt.getMonth() + 1) + '/' + dt.getDate() + ' 收到' + (p.note ? '：「' + esc(p.note) + '」' : '') + '。下一版到之前都照這版。</p>' +
                    '<h4>' + fa('fa-seedling') + '這週種子攤</h4><p class="fe-plan">' + (p.shop ? esc(p.shop.join('、')) + '（只買得到這幾種）' : '十種都賣') + '</p>' +
                    '<h4>' + fa('fa-scale-balanced') + '加強和削弱</h4>' +
                    (p.changes && p.changes.length ? '<ul class="fe-patch">' + p.changes.map(function (c) { return '<li class="' + (c.up ? 'up' : 'down') + '">' + fa(c.up ? 'fa-arrow-up' : 'fa-arrow-down') + esc(c.text) + '</li>'; }).join('') + '</ul>' : '<p class="fd-empty">這版沒有調數值。</p>') +
                    (p.skipped && p.skipped.length ? '<h4>' + fa('fa-circle-info') + '沒採用的</h4><ul class="fe-patch skip">' + p.skipped.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '');
            }
            if (d) body = typhoonHtml(d.typhoon) + body + weatherHtml(d.weather);
            patchWrap.innerHTML = '<section class="fd-card" role="dialog" aria-label="花園改版"><header class="fd-head"><strong>' + fa('fa-scroll') + '花園這週的改版</strong><button type="button" class="fd-close" aria-label="關上">' + fa('fa-xmark') + '</button></header>' +
                '<div class="fd-body">' + body + '</div></section>';
        }
        function openPatch() {
            if (!patchWrap) {
                patchWrap = document.createElement('div');
                patchWrap.className = 'fd-wrap';
                patchWrap.setAttribute('data-fw-modal', '');
                patchWrap.addEventListener('click', function (e) {
                    e.stopPropagation();
                    if (e.target === patchWrap || e.target.closest('.fd-close')) patchWrap.hidden = true;
                });
                root.appendChild(patchWrap);
            }
            renderPatch(null);
            patchWrap.hidden = false;
            if (!Cloud || !Cloud.patch) { renderPatch(null, '要先連上雲端才看得到。'); return; }
            Cloud.patch().then(function (d) { if (!dead) { patchDoc = d; patchBtn(); renderPatch(d); } }, function (e) { if (!dead) renderPatch(null, '沒讀到：' + (Cloud.errText ? Cloud.errText(e) : String(e && e.message || e))); });
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
                var dayWas = guest && guest.day;
                takeDoc(d);
                if (guest.day !== dayWas) renderElves();   // 過了一天：小精靈換位置、換今天的紀錄
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
                            actions: function () { return W ? [] : stealActions(i); }
                        };
                    });
                    if (host && host.visible()) list.push(host.target());
                    list.push.apply(list, elfTargets());
                    return list;
                },
                look: ctx.look, toast: ctx.toast, onChange: render, onStamina: function () {},
                // 11-23 以前進不了他們的牧場 → 走進圍欄門＝進他的牧場（只能看，os_farm.js 的 visitRanch）
                onDoor: function () {
                    if (ctx.visitRanch && guest) ctx.visitRanch({ slot: who.slot, name: who.name, state: guest });
                    else ctx.toast('牧場是' + who.name + '的，沒開放參觀。');
                }
            });
            render();
            schedulePoll();
            loadElves();
            loadPatch();
        }
        function fail(msg) {
            var load = $('loading');
            if (!load) return;
            load.classList.add('is-error');
            if (W) {
                // 只看他們：沒有自己家可以回，給「連雲端」和「關掉」
                load.innerHTML = fa('fa-triangle-exclamation') + '<span>' + esc(msg) + '</span>' +
                    '<button type="button" data-farm="cloud2">連雲端</button><button type="button" data-farm="exit2">關掉</button>';
                load.querySelector('[data-farm="cloud2"]').addEventListener('click', function () { cloudP.open(); });
                load.querySelector('[data-farm="exit2"]').addEventListener('click', function () { ctx.exit(); });
                return;
            }
            load.innerHTML = fa('fa-triangle-exclamation') + '<span>' + esc(msg) + '</span><button type="button" data-farm="home2">回家</button>';
            load.querySelector('[data-farm="home2"]').addEventListener('click', goHome);
        }
        function goHome() { ctx.goScene(mine().walk && mine().walk.scene === 'ranch' ? 'ranch' : 'yard'); }
        if (W) {
            $('exit').addEventListener('click', function () { ctx.exit(); });
            $('swap').addEventListener('click', function () { var o = OTHER[who.slot]; ctx.visit(o.slot, o.name); });
            cloudP = Cloud.panel({ app: root, onConnected: ctx.resync });
            $('cloud').addEventListener('click', function () { cloudP.open(); });
            people = Cloud.residentsPanel({ app: root, openCloud: function () { cloudP.open(); } });
            $('residents').addEventListener('click', function () { people.open(); });
        } else $('home').addEventListener('click', goHome);
        $('replay').addEventListener('click', function () { if (play && !play.live) endPlay(); else replay(); });
        $('diary').addEventListener('click', openDiary);
        $('elves').addEventListener('click', openElves);
        $('patch').addEventListener('click', openPatch);

        if (!Cloud || !Cloud.enabled()) fail('要先' + (W ? '連上雲端' : '開雲端存檔') + '，才找得到' + who.name + '家。');
        else Promise.all([Cloud.peek(who.slot), W ? null : Cloud.steals().catch(function () { return null; })]).then(function (r) {
            if (dead) return;
            if (!r[0] || !r[0].state) { fail(who.name + '還沒有地。'); return; }
            takeDoc(r[0]);
            if (!W) takeSteals(r[1]);
            begin();
        }, function (e) {
            if (!dead) fail('走不到' + who.name + '家：' + (Cloud.errText ? Cloud.errText(e) : String(e && e.message || e)));
        });

        return {
            render: render,
            destroy: function () {
                dead = true;
                clearTimeout(pollT);
                clearTimeout(elfT);
                clearTimeout(patchT);
                [cloudP, people].forEach(function (c) { if (c && c.destroy) c.destroy(); });
                window.removeEventListener('keydown', onDiaryKey);
                if (stage) stage.destroy();
                if (host) host.destroy();
            }
        };
    }

    window.FarmVisit = { mount: mount };
})();
