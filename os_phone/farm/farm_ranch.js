// ============================================================
// farm_ranch.js — 牧場場景（os_farm.js 開起來、在後院和牧場之間切換時掛上／拆下）
// ------------------------------------------------------------
// 規則在 ranch_core.js；位置、走路體力、手上工具在 farm_walk_core.js；存檔跟後院同一份（os_farm.js 管）。
// 09-29 她要：像大廳那樣自己走。點動物不會自己走去做完——走到牠旁邊，頭上才冒出能做的事。
// 擠奶要先去棚屋拿桶子、剪毛要拿剪刀（一次只拿得動一樣）。
// 走路、鏡頭、頭上那個小窗在 farm_walk_ui.js；這支管牧場有哪些東西、各自能做什麼、動物怎麼晃。
// 座標一律用「佔底圖的百分比」，指的是腳底那一點。
// ctx（os_farm.js 給的）：{ root, state(), libs, save(), act(a), toast(t), goScene(name), exit(), owner, look(), asset(name) }
// ============================================================
(function () {
    'use strict';

    function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

    function template(ctx) {
        var A = ctx.asset;
        return '<section class="farm-stage ranch-stage" data-farm="ranch-stage" aria-label="牧場">' +
            '<img class="farm-bg" src="' + A('ranch_base_v1.webp') + '" alt="">' +
            '<button class="ranch-gate gate-barn" type="button" data-fw-key="barn" aria-label="棚屋" title="棚屋"></button>' +
            '<img class="ranch-obj obj-barn" src="' + A('ranch_obj_barn_v1.webp') + '" alt="">' +
            '<button class="ranch-gate gate-trough" type="button" data-fw-key="trough" aria-label="飼料槽" title="飼料槽"></button>' +
            '<img class="ranch-obj obj-trough" src="' + A('ranch_obj_trough_v1.webp') + '" alt="">' +
            '<div class="trough-hay" data-farm="trough-hay" aria-hidden="true"></div>' +
            '<button class="ranch-gate gate-water" type="button" data-fw-key="water" aria-label="水槽" title="水槽"></button>' +
            '<img class="ranch-obj obj-water" src="' + A('ranch_obj_water_empty_v1.webp') + '" alt="">' +
            '<div class="water-fill" data-farm="water-fill" aria-hidden="true"><img src="' + A('ranch_obj_water_surface_v1.webp') + '" alt=""></div>' +
            '<button class="ranch-gate gate-hay" type="button" data-fw-key="hay" aria-label="乾草堆" title="乾草堆"></button>' +
            '<img class="ranch-obj obj-hay" src="' + A('ranch_obj_hay_v1.webp') + '" alt="">' +
            '<div class="ranch-drops" data-farm="ranch-drops"></div>' +
            '<div class="ranch-animals" data-farm="ranch-animals"></div>' +
            '<div class="farm-shade"></div>' +
            '</section>' +
            '<div class="ranch-lead">' +
            '<button class="ranch-back" type="button" data-farm="exit" aria-label="離開" title="離開"><i class="fa-solid fa-xmark"></i></button>' +
            '<button class="ranch-back" type="button" data-farm="ranch-back"><i class="fa-solid fa-arrow-left"></i><span>回後院</span></button>' +
            '</div>' +
            '<div class="ranch-hud">' +
            '<span class="ranch-chip" data-farm="ranch-day">第 1 日</span>' +
            '<span class="ranch-chip coin" data-farm="ranch-coins"></span>' +
            '<span class="ranch-chip" data-farm="ranch-stamina"></span>' +
            '<span class="ranch-chip" data-farm="ranch-hay"></span>' +
            '<span class="ranch-chip" data-farm="ranch-water"></span>' +
            '<span class="ranch-chip" data-farm="ranch-fert"></span>' +
            '<button class="ranch-chip" type="button" data-farm="ranch-board"><i class="fa-solid fa-chart-simple"></i> 看板</button>' +
            '<button class="ranch-chip" type="button" data-farm="ranch-report"><i class="fa-solid fa-receipt"></i> 結算單</button>' +
            '<button class="ranch-chip ranch-btn" type="button" data-farm="ranch-next-day"><i class="fa-solid fa-moon"></i> 結束今天</button>' +
            '</div>' +
            '<div class="farm-toast" data-farm="toast" role="status" aria-live="polite"></div>';
    }

    function mount(ctx) {
        var root = ctx.root;
        root.innerHTML = template(ctx);
        var $ = function (k) { return root.querySelector('[data-farm="' + k + '"]'); };
    var core = ctx.libs.farm, ranch = ctx.libs.ranch, draw = window.FarmAnimalDraw, WC = ctx.libs.walk;
    var stageEl = $('ranch-stage');
    var layer = $('ranch-animals');
    var itemsLayer = $('ranch-drops');

    var state = ctx.state();
    function saveState() { ctx.save(); }
    var act = ctx.act;
    var toast = ctx.toast;
    var stage = null;

    // ── 動物走動 ─────────────────────────────────────
    var RS = WC.SCENES.ranch;
    var AREA = RS.area;
    var KIND = {
        cow: { w: 12, speed: 2.2, rest: [3000, 8000] },
        sheep: { w: 8.5, speed: 2.8, rest: [2500, 7000] },
        chicken: { w: 4.6, speed: 4.2, rest: [1200, 4500] },
        cat: { w: 5.4, speed: 5, rest: [2000, 9000] },
        dog: { w: 6.2, speed: 6, rest: [1200, 5000] }   // 狗閒不下來：停得短、跑得快
    };
    var BABY_SCALE = 0.62;
    var BARN_DOOR = { x: 74, y: 44 };

    function rand(a, b) { return a + Math.random() * (b - a); }
    // 越下面越前面，跟 ranch_ui.css 裡物件的 z-index 同一把尺
    function zOf(y) { return Math.round(y); }
    // 位置寫在外面那層 ra-pos 的 transform（跟畫面一樣大，% ＝畫面的 %）：走路是 transform 的過場，不重排版面
    function place(a, x, y) {
        a.x = x; a.y = y;
        a.pos.style.transform = 'translate(' + x.toFixed(3) + '%,' + y.toFixed(3) + '%)';
        a.pos.style.zIndex = zOf(y);
    }
    function walkTo(a, x, y, speedMul, maxMs) {
        var k = KIND[a.kind];
        // 畫面是扁的：同樣的百分比，上下走起來比左右短，時間照實際距離算
        var len = Math.hypot(x - a.x, (y - a.y) * WC.ASPECT);
        var ms = Math.max(500, len / (k.speed * (speedMul || 1)) * 1000);
        if (maxMs) ms = Math.min(ms, maxMs);
        a.el.classList.toggle('to-left', x < a.x);
        a.el.classList.remove('ra-idle');
        a.el.classList.add('ra-walk');
        a.pos.style.transitionDuration = ms + 'ms';
        a.goal = { x: x, y: y };
        place(a, x, y);
        return ms;
    }
    function wander(a) {
        if (a.held || a.gone) return;
        var to = WC.pickSpot();
        var dx = to.x - a.x, dy = to.y - a.y, dist = Math.hypot(dx, dy);
        if (dist > 22) { to.x = a.x + dx / dist * 22; to.y = a.y + dy / dist * 22; }
        if (WC.animalBlocked(to.x, to.y)) { rest(a); return; }
        var ms = walkTo(a, to.x, to.y);
        clearTimeout(a.timer);
        a.timer = setTimeout(function () { rest(a); }, ms);
    }
    function rest(a) {
        if (a.gone) return;
        var k = KIND[a.kind];
        a.el.classList.remove('ra-walk');
        a.el.classList.add('ra-idle');
        // 停下來的地方記進規則：AI 看到的動物位置就是這裡
        if (a.id) WC.setHerdPos(state, a.id, a.x, a.y);
        clearTimeout(a.timer);
        if (!a.held) a.timer = setTimeout(function () { wander(a); }, rand(k.rest[0], k.rest[1]));
    }
    // 小人走到旁邊時站住（不然按鈕按下去牠已經走遠了）
    function hold(a) {
        a.held = (a.held || 0) + 1;
        clearTimeout(a.timer);
        // 走到一半就停：從畫面上量牠現在真正在哪。頁面縮到看不見時量到 0，就沿用目的地，不然會算出 NaN
        var r = a.el.getBoundingClientRect(), s = stageEl.getBoundingClientRect();
        a.pos.style.transitionDuration = '0ms';
        if (s.width > 0 && s.height > 0) place(a, (r.left + r.width / 2 - s.left) / s.width * 100, (r.top + r.height * 0.92 - s.top) / s.height * 100);
        a.el.classList.remove('ra-walk');
        a.el.classList.add('ra-idle');
        if (a.id) WC.setHerdPos(state, a.id, a.x, a.y);
    }
    function release(a) {
        if (!a || !a.el) return;
        a.held = Math.max(0, (a.held || 0) - 1);
        if (!a.held) rest(a);
    }

    // 跑掉：先衝到最近的圍欄邊，跳一下翻過去、變淡消失
    function runAway(a) {
        if (!a || a.gone) return;
        a.gone = true;
        clearTimeout(a.timer);
        var sides = [
            { x: a.x, y: 19, d: a.y - 19 }, { x: a.x, y: 86, d: 86 - a.y },
            { x: 6, y: a.y, d: (a.x - 6) * 0.56 }, { x: 94, y: a.y, d: (94 - a.x) * 0.56 }
        ].sort(function (p, q) { return p.d - q.d; });
        var ms = walkTo(a, sides[0].x, sides[0].y, 3, 2000);   // 用衝的，最慢 2 秒到圍欄邊
        setTimeout(function () {
            a.el.classList.remove('ra-walk');
            a.el.classList.add('is-leaving');
            setTimeout(function () { a.pos.remove(); }, 900);
        }, ms);
        herd = herd.filter(function (h) { return h !== a; });
    }

    var herd = [];
    function spawn(kind, id, i, from) {
        var el = document.createElement('div');
        el.className = 'ranch-animal ra-idle ra-' + kind;
        el.style.setProperty('--w', KIND[kind].w + '%');
        el.setAttribute('data-fw-key', id || 'pet:' + kind);
        el.innerHTML = '<span class="ra-face">' + draw.svg({ kind: kind }) + '</span>' + (id ? '<span class="ra-bubble"></span>' : '');
        var pos = document.createElement('div');
        pos.className = 'ra-pos';
        pos.appendChild(el);
        layer.appendChild(pos);
        var a = { kind: kind, id: id, el: el, pos: pos, x: 0, y: 0, timer: 0, held: 0, gone: false };
        var s = from || (id ? WC.herdPos(state, id) : WC.pickSpot());
        pos.style.transitionDuration = '0ms';
        place(a, s.x, s.y);
        if (Math.random() < 0.5) el.classList.add('to-left');
        a.timer = setTimeout(function () { wander(a); }, 400 + i * 600 + rand(0, 1500));
        herd.push(a);
        return a;
    }
    state.ranch.animals.forEach(function (an, i) { spawn(an.kind, an.id, i); });
    state.ranch.pets.forEach(function (kind, i) { spawn(kind, null, state.ranch.animals.length + i); });

    function heart(a) {
        var h = document.createElement('i');
        h.className = 'fa-solid fa-heart ra-heart';
        a.el.appendChild(h);
        setTimeout(function () { h.remove(); }, 1000);
    }

    // ── 走到動物旁邊能做的事 ─────────────────────────
    function animalInfo(an) {
        var r = state.ranch;
        var info = ranch.ANIMALS[an.kind];
        var favName = ranch.CROP_NAMES[info.fav];
        var lines = [];
        if (an.baby > 0) lines.push('還小，再吃飽 ' + an.baby + ' 天就長大，長大前不產東西。');
        if (an.sick) lines.push('生病了，不會產東西。打一針馬上好，或牧場乾淨兩天自己好。');
        if (an.fedToday) lines.push('今天吃飽了（' + (an.fedWith === 'fav' ? favName : '乾草') + '）。');
        else if (an.hungryDays >= ranch.RUNAWAY_DAYS - 1) lines.push('已經餓了 ' + an.hungryDays + ' 天，今天再不吃就要翻圍欄跑了！');
        else lines.push('肚子餓了。');
        if (an.ready) lines.push((info.collect === 'bucket' ? '奶好了' : '毛長好了') + (an.ready === 'good' ? '（上等）' : '') + '，今天沒收的話明天那份就浪費。');
        else if (an.kind === 'sheep' && !(an.baby > 0)) lines.push('吃飽 3 天剪一次毛（' + an.fullDays + '/3）。');
        if (r.water <= 0) lines.push('水槽沒水了，今天吃飽也不會產出。');
        return lines.join('');
    }
    function animalActions(a) {
        var an = ranch.findAnimal(state, a.id);
        if (!an) return [];
        var r = state.ranch, C = ranch.COST, w = state.walk;
        var info = ranch.ANIMALS[an.kind];
        var favName = ranch.CROP_NAMES[info.fav];
        var portions = r.feed[info.fav], stock = state.inventory.harvest[info.fav] || 0;
        var favLeft = portions ? '剩 ' + portions + ' 份' : (stock ? '倉庫 ' + stock + ' 份收成' : '倉庫沒有');
        var done = function (out) { if (out && out.ok) heart(a); return out; };
        var list = [
            { icon: 'fa-wheat-awn', label: '餵乾草', sub: '剩 ' + r.hay + ' 捆', disabled: an.fedToday || !r.hay,
                why: an.fedToday ? '今天吃飽了。' : '乾草用完了，去乾草堆買。', run: function () { return done(act({ type: 'feed', animal: a.id, food: 'hay' })); } },
            { icon: 'fa-star', label: '餵' + favName, sub: favLeft, cls: 'fav', disabled: an.fedToday || (!portions && !stock),
                why: an.fedToday ? '今天吃飽了。' : '倉庫沒有' + favName + '，要在後院種。', run: function () { return done(act({ type: 'feed', animal: a.id, food: 'fav' })); } }
        ];
        if (info.collect !== 'drop' && an.ready) {
            var tool = info.collect, t = WC.TOOLS[tool], milk = tool === 'bucket';
            var why = !r.tools[tool] ? '還沒有' + t.name + '，在棚屋買。' : w.hand !== tool ? '手上要拿著' + t.name + '，去棚屋拿。' : null;
            list.unshift({
                icon: t.icon, label: milk ? '擠奶' : '剪毛', sub: why ? (r.tools[tool] ? '先拿' + t.name : '要先買' + t.name) : '體力 ' + (milk ? C.milk : C.shear),
                cls: 'fav', disabled: !!why, why: why,
                run: function () { return done(act({ type: milk ? 'milk' : 'shear', animal: a.id })); }
            });
        }
        if (an.sick) list.push({ icon: 'fa-syringe', label: '打針', sub: '藥 ' + r.medicine + ' 份', disabled: !r.medicine, why: '沒有藥了，在棚屋買。',
            run: function () { return done(act({ type: 'medicine', animal: a.id })); } });
        return list;
    }
    function barnActions() {
        var r = state.ranch, w = state.walk, list = [];
        ['bucket', 'shears'].forEach(function (k) {
            var t = WC.TOOLS[k], rt = ranch.TOOLS[k];
            if (!r.tools[k]) {
                list.push({ icon: t.icon, label: '買' + t.name, sub: rt.price + 'G · ' + rt.use, disabled: state.coins < rt.price, why: '金幣不夠。',
                    run: function () { return act({ type: 'buy_tool', tool: k }); } });
            } else if (w.hand === k) {
                list.push({ icon: 'fa-hand', label: '放下' + t.name, run: function () { return act({ type: 'drop' }); } });
            } else {
                list.push({ icon: t.icon, label: '拿' + t.name, sub: rt.use, cls: 'fav', run: function () { return act({ type: 'take', tool: k }); } });
            }
        });
        list.push({ icon: 'fa-syringe', label: '買藥', sub: ranch.MEDICINE_PRICE + 'G · 有 ' + r.medicine, disabled: state.coins < ranch.MEDICINE_PRICE, why: '金幣不夠。',
            run: function () { return act({ type: 'buy_medicine', quantity: 1 }); } });
        ranch.ANIMAL_IDS.forEach(function (k) {
            var info = ranch.ANIMALS[k];
            var have = r.animals.filter(function (x) { return x.kind === k; }).length;
            list.push({
                icon: 'fa-plus', label: '買一隻' + info.name, sub: info.price + 'G · ' + have + '/' + info.max,
                disabled: have >= info.max || state.coins < info.price, why: have >= info.max ? info.name + '已經滿了，棚屋住不下。' : '金幣不夠。',
                run: function () {
                    var o = act({ type: 'buy_animal', kind: k });
                    if (o.ok) heart(spawn(k, o.animal.id, 0, BARN_DOOR));   // 從棚屋門口走出來
                    return o;
                }
            });
        });
        return list;
    }

    // ── 地上的東西：蛋（撿）、雜草（拔）、糞便（清）──
    // 位置照各自的編號算（WC.itemSpot），AI 看到的是同一個點
    function itemList() {
        var r = state.ranch;
        return r.drops.map(function (d) { return { key: d.id, kind: 'drop', d: d }; })
            .concat(r.weeds.map(function (w) { return { key: w.id, kind: 'weed' }; }))
            .concat(r.poops.map(function (p) { return { key: p.id, kind: 'poop' }; }));
    }
    var ITEM = {
        drop: { icon: 'fa-hand', label: '撿起來', type: 'collect' },
        weed: { icon: 'fa-seedling', label: '拔草', type: 'pull', sub: '變 1 捆乾草' },
        poop: { icon: 'fa-broom', label: '清掉', type: 'clean', sub: '變 1 份肥料' }
    };
    function renderItems() {
        var have = {};
        itemsLayer.querySelectorAll('.ranch-item').forEach(function (n) { have[n.dataset.id] = n; });
        itemList().forEach(function (it) {
            if (have[it.key]) { delete have[it.key]; return; }
            var spot = WC.itemSpot(it.key, it.kind);
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'ranch-item ranch-drop is-' + it.kind;
            b.dataset.id = it.key;
            b.setAttribute('data-fw-key', it.key);
            b.setAttribute('aria-label', it.kind === 'weed' ? '雜草' : it.kind === 'poop' ? '糞便' : ranch.PRODUCTS[it.d.product].name);
            b.style.setProperty('--x', spot.x + '%');
            b.style.setProperty('--y', spot.y + '%');
            b.style.zIndex = zOf(spot.y);
            b.innerHTML = it.kind === 'drop' ? draw.productSvg(it.d.product, it.d.quality) : draw.litterSvg(it.kind);
            itemsLayer.appendChild(b);
        });
        Object.keys(have).forEach(function (k) {
            var n = have[k];
            n.classList.add('is-picked');
            n.removeAttribute('data-fw-key');
            setTimeout(function () { n.remove(); }, 360);
        });
    }

    // ── 牧場裡搆得到的東西 ───────────────────────────
    var SPOT = RS.spots;
    function spotTarget(key, el, title, info, actions) {
        var s = SPOT[key];
        return { key: key, x: s.x, y: s.y, reach: s.reach, el: el, title: function () { return title; }, info: info, actions: actions };
    }
    function targets() {
        var r = state.ranch, list = [];
        herd.forEach(function (a) {
            if (a.gone) return;
            if (!a.id) {
                list.push({
                    key: 'pet:' + a.kind, x: a.x, y: a.y, reach: 7, el: a.el,
                    stand: function () { return { x: a.x + (a.x > 50 ? -5 : 5), y: a.y + .5 }; },
                    hold: function () { hold(a); }, release: function () { release(a); },
                    title: function () { return ranch.PETS[a.kind].name; },
                    info: function () { return '牧場的寵物，不吃飼料、也不產東西，就是陪大家。'; },
                    actions: function () { return [{ icon: 'fa-hand', label: '摸摸', sub: '不花體力', run: function () { heart(a); return { ok: true, message: ranch.PETS[a.kind].name + '很開心。' }; } }]; }
                });
                return;
            }
            var an = ranch.findAnimal(state, a.id);
            if (!an) return;
            var reach = WC.ANIMAL_REACH[a.kind] || 8;
            list.push({
                key: a.id, x: a.x, y: a.y, reach: reach, el: a.el,
                stand: function () { return { x: a.x + (a.x > 50 ? -1 : 1) * (reach - 3), y: a.y + .5 }; },
                hold: function () { hold(a); }, release: function () { release(a); },
                title: function () { return ranch.label(an, r.animals); },
                info: function () { return animalInfo(an); },
                actions: function () { return animalActions(a); }
            });
        });
        list.push(spotTarget('trough', root.querySelector('.obj-trough'), '飼料槽',
            function () { var n = r.animals.filter(function (x) { return !x.fedToday; }).length; return n ? '還有 ' + n + ' 隻沒吃，乾草 ' + r.hay + ' 捆。' : '大家今天都吃飽了。'; },
            function () {
                var n = r.animals.filter(function (x) { return !x.fedToday; }).length;
                return [{
                    icon: 'fa-wheat-awn', label: '倒乾草給大家', sub: n ? n + ' 隻 · 體力 ' + n * ranch.COST.feed : '都吃飽了', cls: 'fav',
                    disabled: !n || !r.hay, why: !n ? '大家今天都吃飽了。' : '乾草用完了，去乾草堆買。',
                    run: function () {
                        var hungry = herd.filter(function (a) { var an = a.id && ranch.findAnimal(state, a.id); return an && !an.fedToday; });
                        var out = act({ type: 'feed_all' });
                        hungry.forEach(function (a) { var an = ranch.findAnimal(state, a.id); if (an && an.fedToday) heart(a); });
                        return out;
                    }
                }];
            }));
        list.push(spotTarget('water', root.querySelector('.obj-water'), '水槽',
            function () { return '還夠喝 ' + r.water + ' 天（最多 ' + ranch.WATER_MAX + ' 天）。'; },
            function () {
                return [{ icon: 'fa-droplet', label: '加滿水', sub: r.water >= ranch.WATER_MAX ? '是滿的' : '體力 ' + ranch.COST.refill,
                    disabled: r.water >= ranch.WATER_MAX, why: '水槽已經是滿的。', run: function () { return act({ type: 'refill' }); } }];
            }));
        list.push(spotTarget('hay', root.querySelector('.obj-hay'), '乾草堆',
            function () { return '牧場裡有 ' + r.hay + ' 捆乾草。'; },
            function () {
                var cost = ranch.HAY_PRICE * 5;
                return [{ icon: 'fa-coins', label: '買 5 捆乾草', sub: cost + 'G', disabled: state.coins < cost, why: '金幣不夠。',
                    run: function () { return act({ type: 'buy_hay', quantity: 5 }); } }];
            }));
        list.push(spotTarget('barn', root.querySelector('.obj-barn'), '棚屋',
            function () {
                var w = state.walk;
                return (w.hand ? '手上拿著' + WC.TOOLS[w.hand].name + '。' : '') + '桶子、剪刀放這裡，一次只拿得動一樣。';
            }, barnActions));
        itemList().forEach(function (it) {
            var s = WC.itemSpot(it.key, it.kind), I = ITEM[it.kind];
            var el = itemsLayer.querySelector('[data-id="' + it.key + '"]');
            list.push({
                key: it.key, x: s.x, y: s.y, reach: WC.ITEM_REACH, el: el,
                stand: function () { return { x: s.x + 2.5, y: s.y + 1 }; },
                title: function () {
                    if (it.kind !== 'drop') return it.kind === 'weed' ? '雜草' : '糞便';
                    var p = ranch.PRODUCTS[it.d.product];
                    return p.name + (it.d.quality === 'good' ? '（上等）' : '');
                },
                info: function () { return ''; },
                actions: function () { return [{ icon: I.icon, label: I.label, sub: I.sub || '體力 ' + ranch.COST[I.type === 'collect' ? 'collect' : I.type === 'pull' ? 'pull' : 'clean'], run: function () { return act({ type: I.type, item: it.key }); } }]; }
            });
        });
        // 下面圍欄的缺口＝回後院：點了走出去（走到缺口就換回後院）；不冒按鈕
        if (shipUi) list.push(shipUi.target());
        list.push({ key: 'gate:yard', x: 50, y: 95, reach: -1, stand: function () { return { x: 50, y: 95 }; } });
        return list;
    }

    // ── 結束今天（跟後院那顆同一件事）：出貨箱結算 → 農場、牧場、走路各過一天 → 跳結算單 ──
    $('ranch-next-day').addEventListener('click', function (ev) {
        ev.stopPropagation();
        var out = shipUi.endDay().report.ranch;
        out.ran.forEach(function (id) { runAway(herd.find(function (a) { return a.id === id; })); });
        // 過一天動物重新散開：走到規則排的新位置
        herd.forEach(function (a) {
            if (!a.id || a.gone || a.held) return;
            var p = WC.herdPos(state, a.id);
            clearTimeout(a.timer);
            var ms = walkTo(a, p.x, p.y, 2.5, 2500);
            a.timer = setTimeout(function () { rest(a); }, ms);
        });
        out.born.forEach(function (b, i) {
            var baby = ranch.findAnimal(state, b.id);
            var a = spawn(baby.kind, baby.id, i, BARN_DOOR);
            setTimeout(function () { heart(a); }, 300);
        });
        render();
    });

    // 「回後院」：走到下面圍欄的缺口，走出去就換回後院
    $('ranch-back').addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (stage) stage.approach('gate:yard');
    });

    function bubbleFor(an) {
        if (!an.fedToday && an.hungryDays >= ranch.RUNAWAY_DAYS - 1) return { cls: 'b-starving', html: '<i class="fa-solid fa-wheat-awn"></i>' };
        if (!an.fedToday) return { cls: 'b-hungry', html: '<i class="fa-solid fa-wheat-awn"></i>' };
        if (an.sick) return { cls: 'b-sick', html: '<i class="fa-solid fa-face-dizzy"></i>' };
        if (an.ready) return { cls: 'b-ready', html: draw.productSvg(ranch.ANIMALS[an.kind].product, an.ready) };
        return null;
    }
    function renderStamina() {
        var st = $('ranch-stamina');
        st.innerHTML = '<i class="fa-solid fa-bolt"></i> 體力 ' + state.stamina + '/' + core.STAMINA_MAX;
        st.classList.toggle('is-low', state.stamina < 8);
    }
    function render() {
        var r = state.ranch;
        $('ranch-day').textContent = '第 ' + state.day + ' 日';
        $('ranch-coins').textContent = state.coins + ' G';
        renderStamina();
        $('ranch-hay').innerHTML = '<i class="fa-solid fa-wheat-awn"></i> 乾草 ' + r.hay;
        $('ranch-fert').innerHTML = '<i class="fa-solid fa-poop"></i> 肥料 ' + (state.inventory.fertilizer || 0);
        var w = $('ranch-water');
        w.innerHTML = '<i class="fa-solid fa-droplet"></i> 水 ' + r.water + '/' + ranch.WATER_MAX;
        w.classList.toggle('is-low', r.water <= 1);
        // 水槽的水：剩幾天就沉多少、透多少（滿＝阿洛原本畫的樣子）；喝乾＝空槽
        var fill = $('water-fill');
        var WATER_LOOK = { 3: [0, 1], 2: [.9, .9], 1: [1.8, .72] };   // [往下沉幾 %（768 的圖上 7px≈0.9%）, 不透明度]
        var look = WATER_LOOK[Math.min(3, r.water)] || null;
        fill.classList.toggle('is-dry', !look);
        if (look) { fill.style.setProperty('--sink', look[0] + '%'); fill.style.setProperty('--clear', look[1]); }
        // 飼料槽：今天從槽裡倒了幾隻份的乾草就堆多高（全部都倒＝滿），隔天大家吃完變空槽
        var big = r.animals.length || 1;
        var hayFed = r.animals.filter(function (x) { return x.fedToday && x.fedWith === 'hay'; }).length;
        var hayAmt = hayFed ? Math.round((.2 + .8 * hayFed / big) * 10) / 10 : 0;
        var hayEl = $('trough-hay');
        if (hayEl.dataset.amt !== String(hayAmt)) { hayEl.dataset.amt = String(hayAmt); hayEl.innerHTML = draw.troughHaySvg(hayAmt); }
        herd.forEach(function (a) {
            if (!a.id) return;
            var an = ranch.findAnimal(state, a.id);
            if (!an) return;
            a.el.classList.toggle('is-baby', an.baby > 0);
            a.el.style.setProperty('--w', (KIND[a.kind].w * (an.baby > 0 ? BABY_SCALE : 1)) + '%');
            a.el.classList.toggle('is-sick', !!an.sick);
            var bub = a.el.querySelector('.ra-bubble');
            var b = bubbleFor(an);
            bub.className = 'ra-bubble' + (b ? ' ' + b.cls : ' is-none');
            bub.innerHTML = b ? b.html : '';
        });
        renderItems();
        saveState();
        if (bag) bag.render();
        if (shipUi) shipUi.render();
        if (board) board.render();
        if (stage) stage.refresh();
    }

    // 底部快捷列＋背包（跟後院同一套 farm_bag.js）：牧場這邊放手上的、乾草、藥、動物愛吃的、撿到的產品
    var shipUi = window.FarmShip.create({ app: root, world: stageEl, scene: 'ranch', state: function () { return state; }, libs: ctx.libs, toast: toast, onChange: render });
    $('ranch-report').addEventListener('click', function (ev) { ev.stopPropagation(); shipUi.openReport(); });
    var board = window.FarmBoard.create({ app: root, state: function () { return state; }, ship: shipUi, owner: ctx.owner });
    $('ranch-board').addEventListener('click', function (ev) { ev.stopPropagation(); board.open(); });
    var bag = window.FarmBag.create({ app: root, scene: 'ranch', state: function () { return state; }, toast: toast });
    render();
    stage = window.FarmWalkStage.create({
        app: root,
        world: stageEl,
        scene: 'ranch',
        state: function () { return state; },
        targets: targets,
        look: ctx.look,
        toast: toast,
        onChange: render,
        onStamina: renderStamina,
        onDoor: function (to) { if (to === 'yard') ctx.goScene('yard'); }
    });
    $('exit').addEventListener('click', function (ev) { ev.stopPropagation(); ctx.exit(); });

    return {
        stage: stage,
        render: render,
        destroy: function () {
            // 動物各自有停一下再走的計時器：全部停掉，不然換場景後還在背景亂跑
            herd.forEach(function (a) { clearTimeout(a.timer); a.gone = true; });
            [stage, bag, shipUi, board].forEach(function (c) { if (c && c.destroy) c.destroy(); });
            saveState();
        }
    };
    }

    window.FarmRanch = { mount: mount };
})();
