// ============================================================
// farm_yard.js — 後院場景（os_farm.js 開起來、在後院和牧場之間切換時掛上／拆下）
// ------------------------------------------------------------
// 09-29 她要：像大廳那樣自己走，走到田邊才能種／澆／收，不是點田就自動做完。
// 走路、鏡頭、頭上那個小窗在 farm_walk_ui.js；位置、走路體力、手上工具的規則在 farm_walk_core.js。
// 這支只管後院有哪些東西（田、池塘、工具棚、出貨箱、小圍欄、蜂箱）、各自能做什麼，還有上面那些資訊。
// 10-11 大件：田可以再開墾兩塊（下一塊沒開的畫成一圈繩子的草地，走過去按「開墾」）、右下角花叢邊可以放蜂箱；
//   商店最底下「大件」那段也買得到（棚屋擴建也在那裡，牧場的棚屋旁邊也有）。
// 澆水要先去工具棚拿水壺、壺空了去池塘裝（一壺三塊田）。
// ctx（os_farm.js 給的）：{ root, state(), setState(st), libs, save(), act(a), toast(t), goScene(name, arg), visit(slot, name), exit(), resync(), owner, look(), asset(name) }
// ============================================================
(function () {
    'use strict';

    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function template(ctx) {
        var A = ctx.asset;
        return '<section class="farm-stage" data-farm="stage" aria-label="' + esc(ctx.owner) + '的後院">' +
            '<img class="farm-bg" src="' + A('farm_base_v2.webp') + '" alt="">' +
            '<button class="yard-spot spot-pond" type="button" data-fw-key="pond" aria-label="池塘"></button>' +
            '<img class="farm-decor decor-pond" src="' + A('farm_obj_pond_v1.webp') + '" alt="">' +
            '<button class="yard-spot spot-shed" type="button" data-fw-key="shed" aria-label="工具棚"></button>' +
            '<img class="farm-decor decor-shed" src="' + A('farm_obj_shed_v1.webp') + '" alt="">' +
            '<a class="pen-gate" data-fw-key="gate:ranch" aria-label="進牧場" title="進牧場"></a>' +
            '<img class="farm-decor decor-pen" src="' + A('farm_obj_pen_v1.webp') + '" alt="">' +
            '<img class="farm-decor decor-bench" src="' + A('farm_obj_bench_v1.webp') + '" alt="">' +
            '<div class="farm-plots" data-farm="plots" aria-label="農田"></div>' +
            '<div class="yard-hive" data-farm="hive" data-fw-key="hive" hidden></div>' +
            '<div class="farm-shade"></div>' +
            '</section>' +
            '<header class="farm-title">' +
            '<button class="farm-exit" type="button" data-farm="exit" aria-label="離開後院" title="離開"><i class="fa-solid fa-xmark"></i></button>' +
            '<div><strong>' + esc(ctx.owner) + '的後院</strong><span data-farm="day">第 1 日</span></div>' +
            '</header>' +
            '<div class="farm-tools">' +
            '<button class="farm-tool economy" type="button" data-farm="shop-open"><i class="fa-solid fa-shop"></i>種子商店</button>' +
            '<button class="farm-tool" type="button" data-farm="board"><i class="fa-solid fa-chart-simple"></i>看板</button>' +
            '<button class="farm-tool" type="button" data-farm="report"><i class="fa-solid fa-receipt"></i>結算單</button>' +
            '<button class="farm-tool" type="button" data-farm="cloud" data-farm-cloud><i class="fa-solid fa-cloud"></i>雲端</button>' +
            '<button class="farm-tool" type="button" data-farm="residents"><i class="fa-solid fa-user-clock"></i>住戶</button>' +
            '<button class="farm-tool" type="button" data-farm="hire"><i class="fa-solid fa-handshake"></i>雇人</button>' +
            '<button class="farm-tool primary" type="button" data-farm="end-day"><i class="fa-solid fa-moon"></i>結束今天</button>' +
            '</div>' +
            '<aside class="farm-stats" aria-label="農場狀態">' +
            '<div class="farm-stat coin"><span>金幣</span><strong data-farm="coins"></strong></div>' +
            '<div class="farm-stat"><span>體力</span><strong data-farm="stamina"></strong></div>' +
            '<div class="farm-stat"><span>已種植</span><strong data-farm="planted"></strong></div>' +
            '<div class="farm-stat"><span>總收成</span><strong data-farm="harvested"></strong></div>' +
            '</aside>' +
            '<aside class="farm-log" aria-live="polite">' +
            '<div class="farm-log-head"><strong>後院日記</strong><span>完整的在看板</span></div>' +
            '<div data-farm="log"></div>' +
            '</aside>' +
            '<div class="farm-drawer-backdrop" data-farm="shop-backdrop" hidden></div>' +
            '<aside class="farm-shop" data-farm="shop" aria-label="種子商店" hidden>' +
            '<header class="shop-head">' +
            '<div><strong>種子商店</strong><span>要賣東西：放進出貨箱，隔天早上結算</span></div>' +
            '<button type="button" data-farm="shop-close" aria-label="關閉商店">×</button>' +
            '</header>' +
            '<div class="shop-wallet"><span>手上的金幣</span><strong data-farm="shop-coins"></strong></div>' +
            '<div class="shop-list" data-farm="shop-list"></div>' +
            '</aside>' +
            '<div class="farm-toast" data-farm="toast" role="status" aria-live="polite"></div>';
    }

    function mount(ctx) {
        var core = ctx.libs.farm, walkCore = ctx.libs.walk, ranch = ctx.libs.ranch;
        var root = ctx.root;
        root.innerHTML = template(ctx);
        var $ = function (k) { return root.querySelector('[data-farm="' + k + '"]'); };
        var plotsRoot = $('plots');
        var selectedCrop = 'stardew';
        var stage = null, shipUi = null, board = null, bag = null, cloud = null, people = null, hire = null;
        var S = function () { return ctx.state(); };
        var act = ctx.act;

        function plotLabel(plot) {
            if (core.isEmpty(plot)) return plot.wateredToday ? '濕潤空地，可以播種' : '乾燥空地';
            var crop = core.CROPS[plot.cropId];
            var fert = plot.fertilized ? '（施過肥）' : '';
            if (plot.stage === 'wilted') return crop.name + '已枯萎，今天必須澆水搶救' + fert;
            if (plot.stage === 'mature') return crop.name + '已成熟，可以收成' + fert;
            if (plot.wateredToday) return crop.name + '今天已澆水' + fert;
            return crop.name + '需要澆水' + fert;
        }
        // 種子小圖示也用程式畫（farm_item_draw.js）
        function seedIcon(id) { return window.FarmItemDraw.svg({ kind: 'seed', crop: id }); }
        // 田用程式畫（farm_plot_draw.js）；土的顏色照今天澆過沒
        function plotArt(plot) {
            var st = core.isEmpty(plot) ? (plot.wateredToday ? 'wet' : 'dry') : plot.stage;
            return window.FarmPlotDraw.svg({ state: st, crop: plot.cropId, wet: !!plot.wateredToday }).replace('class="fp-plot"', 'class="plot-art fp-plot"');
        }

        function renderPlots() {
            // 亮哪一塊問走路那支（現在搆得到的是哪一個）；別照抄畫面上原本誰在亮——舊的亮光會一直被抄下去
            var fk = stage ? stage.focusKey() : null;
            var st = S(), next = st.plots.length;
            // 下一塊還沒開墾的：排在田後面，第幾格就落在第幾塊田的位置（farm.css 照 nth-child 擺）
            var wild = core.plotPrice(st) != null
                ? '<button class="farm-plot wild' + (fk === 'plot:' + next ? ' fw-focus' : '') + '" type="button" data-fw-key="plot:' + next + '" aria-label="還沒開墾的草地">' +
                    window.FarmPlotDraw.wildSvg().replace('class="fp-plot', 'class="plot-art fp-plot') + '</button>' : '';
            plotsRoot.innerHTML = st.plots.map(function (plot, index) {
                var classes = ['farm-plot'];
                if (plot.wateredToday) classes.push('watered');
                if (plot.stage === 'mature') classes.push('mature');
                if (plot.stage === 'wilted') classes.push('wilted');
                if (fk === 'plot:' + index) classes.push('fw-focus');
                return '<button class="' + classes.join(' ') + '" type="button" data-plot="' + index + '" data-fw-key="plot:' + index + '" aria-label="' + esc(plotLabel(plot)) + '">' +
                    plotArt(plot) + '</button>';
            }).join('') + wild;
        }

        // 蜂箱：買了才出現；幾隻蜜蜂繞著飛，裡面有蜂蜜就冒一顆泡泡寫幾罐
        var hiveEl = $('hive'), hiveSig = '';
        function renderHive() {
            var h = S().ranch && S().ranch.hive;
            var sig = h ? 'h' + h.jars : '';
            if (sig === hiveSig) return;
            hiveSig = sig;
            hiveEl.hidden = !h;
            if (!h) { hiveEl.innerHTML = ''; return; }
            var bee = window.FarmAnimalDraw.beeSvg();
            hiveEl.innerHTML = '<img class="hive-img" src="' + ctx.asset('farm_obj_beehive_v1.webp') + '" alt="">' +
                '<span class="hive-bee hb1">' + bee + '</span><span class="hive-bee hb2">' + bee + '</span><span class="hive-bee hb3">' + bee + '</span>' +
                (h.jars ? '<span class="hive-jar">' + window.FarmAnimalDraw.productSvg('honey') + '<b>' + h.jars + '</b></span>' : '');
        }

        // 選的種子用完了就自動換成還有的那種，不然走到田邊只看到「沒種子了」
        function plantCrop() {
            var st = S();
            if (st.inventory.seeds[selectedCrop] > 0) return selectedCrop;
            var have = core.CROP_IDS.find(function (id) { return st.inventory.seeds[id] > 0; });
            return have || selectedCrop;
        }
        function bagCtx() {
            return {
                selectedCrop: plantCrop(),
                pickSeed: function (id) {
                    selectedCrop = id;
                    render();
                    ctx.toast('等一下種' + core.CROPS[id].name + '，種子 ' + S().inventory.seeds[id] + ' 顆。');
                }
            };
        }

        // 商店只「買」：種子、乾草。賣東西只有出貨箱（過一天結算，結算單上看錢從哪來、花去哪）。
        function renderShop() {
            var st = S();
            $('shop-coins').textContent = st.coins + ' G';
            var seeds = core.CROP_IDS.map(function (id) {
                var crop = core.CROPS[id];
                return '<article class="shop-card">' + seedIcon(id) +
                    '<div><h3>' + esc(crop.name) + '</h3><p>有 ' + st.inventory.seeds[id] + ' 顆 · ' + crop.growDays + ' 次澆水成熟<br>收成一份賣 ' + crop.sellPrice + 'G</p></div>' +
                    '<div class="shop-actions"><button type="button" data-buy="' + id + '"' + (st.coins < crop.buyPrice ? ' disabled' : '') + '>買一顆 ' + crop.buyPrice + 'G</button></div></article>';
            }).join('');
            var hay = ranch && st.ranch ? '<article class="shop-card"><span class="shop-fa"><i class="fa-solid fa-wheat-awn"></i></span>' +
                '<div><h3>乾草</h3><p>牧場裡 ' + st.ranch.hay + ' 捆<br>一捆餵一隻吃一天</p></div>' +
                '<div class="shop-actions"><button type="button" data-buy-hay="1"' + (st.coins < ranch.HAY_PRICE ? ' disabled' : '') + '>買一捆 ' + ranch.HAY_PRICE + 'G</button></div></article>' : '';
            $('shop-list').innerHTML = seeds + hay + bigItems(st);
        }
        // 大件：買一次就一直在（開墾、蜂箱、擴建棚屋）；買過的寫「已經有了」
        function bigItems(st) {
            var A = ctx.asset, r = st.ranch, out = '';
            var card = function (img, name, desc, btn, key, price, done) {
                return '<article class="shop-card shop-big">' + img + '<div><h3>' + esc(name) + '</h3><p>' + desc + '</p></div>' +
                    '<div class="shop-actions">' + (done
                        ? '<button type="button" disabled>' + esc(done) + '</button>'
                        : '<button type="button" data-big="' + key + '"' + (st.coins < price ? ' disabled' : '') + '>' + esc(btn) + ' ' + price + 'G</button>') + '</div></article>';
            };
            var pp = core.plotPrice(st);
            out += card('<span class="shop-big-art">' + window.FarmPlotDraw.wildSvg() + '</span>', '開墾新田',
                '現在 ' + st.plots.length + '/' + core.PLOT_MAX + ' 塊<br>' + (pp != null ? '下一塊在後院' + (st.plots.length === 6 ? '左邊' : '右邊') : '後院已經開滿了'),
                '開墾第 ' + (st.plots.length + 1) + ' 塊', 'plot', pp, pp == null ? '開滿了' : '');
            if (ranch && r) {
                out += card('<img class="shop-big-art" src="' + A('farm_obj_beehive_v1.webp') + '" alt="">', '蜂箱',
                    '放在後院右下角花叢邊<br>田裡有 ' + ranch.HIVE_FLOWERS + ' 塊以上在長就每天一罐蜂蜜，不然兩天一罐（一罐 ' + ranch.PRODUCTS.honey.price + 'G）',
                    '買蜂箱', 'hive', ranch.HIVE_PRICE, r.hive ? '已經有了' : '');
                var nb = ranch.barnNext(r);
                out += card('<img class="shop-big-art" src="' + A('ranch_obj_barn_v' + Math.min(ranch.BARN_TOP, r.barn + 1) + '.webp') + '" alt="">', '擴建棚屋',
                    nb ? '擴建後最多養：' + ranch.capsText(nb) + ' 隻<br>（現在 ' + ranch.capsText(ranch.BARN_LEVELS[r.barn]) + '）' : '已經擴建到最大了<br>最多養：' + ranch.capsText(ranch.BARN_LEVELS[r.barn]) + ' 隻',
                    '擴建', 'barn', nb ? nb.price : 0, nb ? '' : '最大了');
            }
            return '<h4 class="shop-sec">大件（買一次就一直在）</h4>' + out;
        }
        $('shop-list').addEventListener('click', function (e) {
            var b = e.target.closest('button');
            if (!b || b.disabled) return;
            if (b.getAttribute('data-buy')) ctx.toast(act({ type: 'buy_seed', crop: b.getAttribute('data-buy'), quantity: 1 }).message);
            else if (b.getAttribute('data-buy-hay')) ctx.toast(ranch.buyHay(S(), 1).message);
            else if (b.getAttribute('data-big')) ctx.toast(act({ type: ({ plot: 'buy_plot', hive: 'buy_hive', barn: 'upgrade_barn' })[b.getAttribute('data-big')] }).message);
            render();
        });

        function renderStamina() { $('stamina').textContent = S().stamina + ' / ' + core.STAMINA_MAX; }
        function render() {
            var st = S();
            $('day').textContent = '第 ' + st.day + ' 日';
            $('coins').textContent = st.coins + ' G';
            $('planted').textContent = st.plots.filter(function (plot) { return !core.isEmpty(plot); }).length + ' / ' + st.plots.length;
            $('harvested').textContent = st.stats.totalHarvested;
            renderStamina();
            $('log').innerHTML = st.logs.slice(0, 3).map(function (line) {
                return '<div class="farm-log-line">' + esc(line) + '</div>';
            }).join('');
            renderPlots();
            renderHive();
            if (bag) bag.render();
            if (!$('shop').hidden) renderShop();
            if (shipUi) shipUi.render();
            if (board) board.render();
            ctx.save();
            if (stage) stage.refresh();
        }

        // ── 後院裡搆得到的東西：田、池塘、工具棚、出貨箱 ──
        var SP = walkCore.SCENES.yard.spots;
        function plotActions(i) {
            var st = S(), plot = st.plots[i], w = st.walk, list = [];
            var canWhy = w.hand !== 'can' ? '先去工具棚拿水壺' : w.can <= 0 ? '水壺空了，去池塘裝' : null;
            var water = {
                icon: 'fa-droplet', label: plot.stage === 'wilted' ? '澆水搶救' : '澆水',
                sub: canWhy || '水壺 ' + w.can + '/' + walkCore.CAN_MAX, disabled: !!canWhy, why: canWhy,
                run: function () { return act({ type: 'water', plot: i, prefix: '' }); }
            };
            if (core.isMature(plot)) {
                list.push({ icon: 'fa-basket-shopping', label: '收成', sub: '體力 ' + core.COST.harvest, cls: 'fav', run: function () { return act({ type: 'harvest', plot: i }); } });
                if (!plot.wateredToday) list.push(water);
            } else if (core.isEmpty(plot)) {
                var cid = plantCrop(), crop = core.CROPS[cid], n = st.inventory.seeds[cid];
                list.push({
                    icon: 'fa-seedling', label: '種' + crop.name, sub: n > 0 ? '種子 × ' + n : '沒種子了', cls: 'fav',
                    disabled: n <= 0, why: '種子用完了，去商店買。',
                    run: function () { return act({ type: 'plant', plot: i, crop: cid }); }
                });
                if (!plot.wateredToday) { water.label = '先澆濕'; list.push(water); }
            } else {
                if (!plot.wateredToday) list.push(water);
                if (!plot.fertilized && plot.stage !== 'wilted') {
                    var fert = st.inventory.fertilizer || 0;
                    list.push({ icon: 'fa-poop', label: '施肥', sub: '剩 ' + fert + ' 份', disabled: !fert, why: '沒有肥料，去牧場清糞便就有。', run: function () { return act({ type: 'fertilize', plot: i }); } });
                }
            }
            return list;
        }
        function targets() {
            var w = S().walk;
            var list = S().plots.map(function (plot, i) {
                var s = SP['plot' + i];
                return {
                    key: 'plot:' + i, x: s.x, y: s.y, reach: s.reach, el: plotsRoot.children[i],
                    // 小窗對準田本身的圖（按鈕框比圖小一圈、位置也偏）
                    anchor: function () { var b = plotsRoot.children[i]; return b && b.querySelector('svg'); },
                    title: function () { return '第 ' + (i + 1) + ' 塊田'; },
                    info: function () { return plotLabel(S().plots[i]); },
                    actions: function () { return plotActions(i); }
                };
            });
            var st0 = S(), next = st0.plots.length, price = core.plotPrice(st0);
            if (price != null) {
                var ws = SP['plot' + next];
                list.push({
                    key: 'plot:' + next, x: ws.x, y: ws.y, reach: ws.reach, el: plotsRoot.children[next],
                    anchor: function () { var b = plotsRoot.children[next]; return b && b.querySelector('svg'); },
                    title: function () { return '第 ' + (next + 1) + ' 塊田（還沒開墾）'; },
                    info: function () { return '翻成田之後就能種東西'; },
                    actions: function () {
                        var short = S().coins < price;
                        return [{ icon: 'fa-trowel', label: '開墾', sub: price + 'G', cls: 'fav', disabled: short, why: '金幣不夠（要 ' + price + 'G）。', run: function () { return act({ type: 'buy_plot' }); } }];
                    }
                });
            }
            if (st0.ranch && st0.ranch.hive) {
                list.push({
                    key: 'hive', x: SP.hive.x, y: SP.hive.y, reach: SP.hive.reach, el: hiveEl,
                    anchor: function () { return hiveEl.querySelector('.hive-img'); },
                    title: function () { return '蜂箱'; },
                    info: function () {
                        var r = S().ranch, f = ranch.flowersOf(S());
                        return '裡面 ' + r.hive.jars + '/' + ranch.HIVE_MAX + ' 罐蜂蜜・田裡 ' + f + ' 塊在長（' + ranch.HIVE_FLOWERS + ' 塊以上每天一罐，不然兩天一罐）';
                    },
                    actions: function () {
                        var jars = S().ranch.hive.jars;
                        return [{ icon: 'fa-jar', label: '收蜂蜜', sub: jars ? jars + ' 罐・體力 ' + ranch.COST.honey : '還沒有', cls: 'fav', disabled: !jars, why: '蜂箱裡還沒有蜂蜜。', run: function () { return act({ type: 'honey' }); } }];
                    }
                });
            }
            list.push({
                key: 'pond', x: SP.pond.x, y: SP.pond.y, reach: SP.pond.reach, el: root.querySelector('.decor-pond'),
                title: function () { return '池塘'; },
                info: function () { return w.hand === 'can' ? '水壺裡還有 ' + w.can + '/' + walkCore.CAN_MAX + ' 份水' : '拿著水壺才裝得了水'; },
                actions: function () {
                    var why = w.hand !== 'can' ? '先去工具棚拿水壺' : w.can >= walkCore.CAN_MAX ? '水壺是滿的' : null;
                    return [{ icon: 'fa-bottle-water', label: '裝水', sub: why || '體力 1', disabled: !!why, why: why, run: function () { return act({ type: 'refill_can' }); } }];
                }
            });
            list.push({
                key: 'shed', x: SP.shed.x, y: SP.shed.y, reach: SP.shed.reach, el: root.querySelector('.decor-shed'),
                title: function () { return '工具棚'; },
                info: function () { return w.hand ? '手上拿著' + walkCore.TOOLS[w.hand].name : '水壺放在這裡'; },
                actions: function () {
                    if (w.hand === 'can') return [{ icon: 'fa-hand', label: '放下水壺', run: function () { return act({ type: 'drop' }); } }];
                    return [{ icon: 'fa-bottle-water', label: '拿水壺', sub: '水 ' + w.can + '/' + walkCore.CAN_MAX, cls: 'fav', run: function () { return act({ type: 'take', tool: 'can' }); } }];
                }
            });
            if (shipUi) list.push(shipUi.target());
            // 小圍欄＝牧場入口：點了走進圍欄裡（走進去就換到牧場）；搆得到的範圍給 -1，不會冒按鈕
            list.push({ key: 'gate:ranch', x: 87, y: 41, reach: -1, stand: function () { return { x: 87, y: 41 }; } });
            return list;
        }

        function openShop() { $('shop').hidden = false; $('shop-backdrop').hidden = false; renderShop(); }
        function closeShop() { $('shop').hidden = true; $('shop-backdrop').hidden = true; }
        $('shop-open').addEventListener('click', openShop);
        $('shop-close').addEventListener('click', closeShop);
        $('shop-backdrop').addEventListener('click', closeShop);
        // 結束今天：出貨箱結算 → 農場、牧場、走路各過一天 → 跳結算單（像星露谷上床睡覺，玩完自己結束這一天）
        $('end-day').addEventListener('click', function () { shipUi.endDay(); render(); });
        $('exit').addEventListener('click', function () { ctx.exit(); });

        renderPlots();
        var app = root;
        shipUi = window.FarmShip.create({ app: app, world: $('stage'), scene: 'yard', state: S, libs: ctx.libs, toast: ctx.toast, onChange: render });
        $('report').addEventListener('click', function () { shipUi.openReport(); });
        board = window.FarmBoard.create({ app: app, state: S, ship: shipUi, owner: ctx.owner, onVisit: ctx.visit });
        $('board').addEventListener('click', function () { board.open(); });
        cloud = window.FarmCloud.panel({ app: app, onConnected: ctx.resync });
        $('cloud').addEventListener('click', function () { cloud.open(); });
        people = window.FarmCloud.residentsPanel({ app: app, openCloud: function () { cloud.open(); } });
        $('residents').addEventListener('click', function () { people.open(); });
        hire = window.FarmHire.create({ app: app, state: S, ctx: ctx, openCloud: function () { cloud.open(); } });
        $('hire').addEventListener('click', function () { hire.open(); });
        bag = window.FarmBag.create({ app: app, scene: 'yard', state: S, ctx: bagCtx, toast: ctx.toast });
        stage = window.FarmWalkStage.create({
            app: app, world: $('stage'), scene: 'yard', state: S, targets: targets, zFixed: 17,
            look: ctx.look, toast: ctx.toast, onChange: render, onStamina: renderStamina,
            onDoor: function (to) { if (to === 'ranch') ctx.goScene('ranch'); }
        });
        render();

        return {
            stage: stage,
            render: render,
            destroy: function () {
                [stage, bag, shipUi, board, cloud, people, hire].forEach(function (c) { if (c && c.destroy) c.destroy(); });
                ctx.save();
            }
        };
    }

    window.FarmYard = { mount: mount };
})();
