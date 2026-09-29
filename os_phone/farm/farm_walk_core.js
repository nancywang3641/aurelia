// ============================================================
// farm_walk_core.js — 小人站在哪、走路花體力、手上拿什麼（後院＋牧場共用，存在 state.walk）
// ------------------------------------------------------------
// 她 09-29 要的：做成大廳那種自己走的舞台，而且「對 AI 也要有難度」。
// 畫面怎麼操作只影響她自己玩的手感；AI 在 VPS 上是下指令，所以難度一定要寫在規則裡：
//   ① 位置：小人在哪一區（yard 後院／ranch 牧場）、哪個座標。做事要先走到旁邊（near），不然擋。
//   ② 走路花體力：走多遠照直線距離算，累積滿 STEP 扣 1 點（不滿的留著下次一起算）；跨區要先走到圍欄門口。
//   ③ 工具要去拿：一次只拿得動一樣。水壺在後院工具棚、桶子剪刀在牧場棚屋（買過才有）；拿新的，手上那樣自動放回原位。
//      澆水要手上拿水壺、壺裡有水（CAN_MAX 份，一塊田一份），空了去池塘裝。
// 所以 AI 要自己排路線：先拿什麼、先去哪；排爛了繞一大圈，體力就不夠做完。她打開畫面時，小人照同一套規則走。
// 買種子不用走（商店是選單）；棚屋買工具／藥／動物、乾草堆買乾草要站在旁邊。
// 賣東西只有一條路：走到出貨箱（後院、牧場各一個）放進去，過一天結算（farm_ship_core.js）。
//
// 座標：跟畫面同一套，佔底圖寬高的百分比（兩張底圖都是 1672×941），指腳底那一點。
//   距離一律 hypot(dx, dy × 941/1672)——上下的百分比比較短。
// 牧場動物的位置也記在這裡（state.walk.herd）：畫面上動物走動時回寫，AI 看到的是最後停下來的地方；過一天重新散開。
// 地上的東西（蛋、糞、雜草）位置照各自的編號算（itemSpot），畫面和 AI 看到的是同一個點。
// ⚠️ farm_core.normalizeState 只保留農場認得的欄位——載入存檔後要 attach(state, raw)（跟 RanchCore.attach 一樣）。
// 規則函式原本的（farm_core／ranch_core）不動，位置檢查在這層的 act() 包一圈：AI 和畫面都走 act()。
// ============================================================
(function (root, factory) {
    'use strict';
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.FarmWalkCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var ASPECT = 941 / 1672;
    var STEP = 30;          // 走「畫面寬的 30%」花 1 點體力
    var CAN_MAX = 3;        // 水壺一次裝幾份（一塊田一份）
    var COST_REFILL_CAN = 1;

    // 每一區：能走的範圍（walk）、擋路的東西（blocks）、門口（gate：從別區進來站的點、要離開走去的點）
    // 還有各個東西「站哪裡做事」（spots）與搆得到的距離（reach）。畫面和 AI 用同一份。
    var SCENES = {
        yard: {
            name: '後院',
            walk: { x1: 8, x2: 92, y1: 31, y2: 84 },
            blocks: [
                { x1: 8, x2: 23, y1: 20, y2: 38 },    // 池塘
                { x1: 9, x2: 18, y1: 40, y2: 48 }     // 出貨箱
            ],
            // 小圍欄（牧場入口）：走進去就到牧場
            door: { x1: 81, x2: 95, y1: 33, y2: 49, to: 'ranch' },
            gate: { x: 78, y: 42 },
            start: { x: 50, y: 78 },
            spots: {
                pond: { x: 24, y: 40, reach: 9, name: '池塘' },
                shed: { x: 76, y: 34, reach: 9, name: '工具棚' },
                yardbin: { x: 20, y: 47.5, reach: 9, name: '出貨箱' },   // 站在箱子右邊（站前面會把箱子整個擋住）
                plot0: { x: 30, y: 56.5, reach: 10, name: '第 1 塊田' },
                plot1: { x: 49, y: 56.5, reach: 10, name: '第 2 塊田' },
                plot2: { x: 67, y: 56.5, reach: 10, name: '第 3 塊田' },
                plot3: { x: 29, y: 75, reach: 10, name: '第 4 塊田' },
                plot4: { x: 49, y: 75, reach: 10, name: '第 5 塊田' },
                plot5: { x: 67, y: 75, reach: 10, name: '第 6 塊田' }
            }
        },
        ranch: {
            name: '牧場',
            walk: { x1: 8, x2: 92, y1: 20, y2: 84 },
            // 下面圍欄中間的缺口：再往下走就回後院
            corridor: { x1: 41, x2: 58, y1: 84, y2: 97 },
            blocks: [
                { x1: 66, x2: 86, y1: 6, y2: 37 },    // 棚屋
                { x1: 13, x2: 27, y1: 12, y2: 31 },   // 飼料槽
                { x1: 27, x2: 39, y1: 10, y2: 28 },   // 水槽
                { x1: 8, x2: 20, y1: 56, y2: 68 },    // 乾草堆
                { x1: 62, x2: 70, y1: 72, y2: 80 }    // 出貨箱
            ],
            door: { x1: 41, x2: 58, y1: 91, y2: 100, to: 'yard' },
            gate: { x: 50, y: 85 },
            start: { x: 50, y: 85 },
            spots: {
                trough: { x: 21, y: 35, reach: 9, name: '飼料槽' },
                water: { x: 34, y: 32, reach: 9, name: '水槽' },
                hay: { x: 23, y: 66, reach: 9, name: '乾草堆' },
                barn: { x: 76, y: 42, reach: 9, name: '棚屋' },
                ranchbin: { x: 59.5, y: 80, reach: 9, name: '出貨箱' }   // 站在箱子左邊
            },
            // 動物自己晃的範圍（比小人能走的小一圈，身體比腳寬）與禁區
            area: { x1: 11, x2: 89, y1: 24, y2: 80 },
            animalBlocks: [
                { x1: 63, x2: 88, y1: 8, y2: 40 },
                { x1: 12, x2: 29, y1: 14, y2: 33 },
                { x1: 26, x2: 41, y1: 12, y2: 29 },
                { x1: 5, x2: 25, y1: 50, y2: 74 },
                { x1: 59, x2: 73, y1: 68, y2: 84 }
            ],
            eggArea: { x1: 58, x2: 84, y1: 42, y2: 54 }
        }
    };
    var ANIMAL_REACH = { cow: 11, sheep: 9, chicken: 7 };
    var ITEM_REACH = 6;
    // 工具放哪裡：水壺在後院工具棚，桶子剪刀在牧場棚屋
    var TOOLS = {
        can: { name: '水壺', scene: 'yard', spot: 'shed', icon: 'fa-bottle-water' },
        bucket: { name: '桶子', scene: 'ranch', spot: 'barn', icon: 'fa-bucket' },
        shears: { name: '剪刀', scene: 'ranch', spot: 'barn', icon: 'fa-scissors' }
    };

    function result(ok, code, message, extra) {
        var out = { ok: ok, code: code, message: message };
        if (extra) Object.keys(extra).forEach(function (k) { out[k] = extra[k]; });
        return out;
    }
    function num(v, d) { var n = Number(v); return Number.isFinite(n) ? n : d; }
    function dist(a, b) { return Math.hypot(a.x - b.x, (a.y - b.y) * ASPECT); }
    function inRect(r, x, y) { return x > r.x1 && x < r.x2 && y > r.y1 && y < r.y2; }

    // ── 能不能站 ──────────────────────────────────────
    function walkable(scene, x, y) {
        var S = SCENES[scene];
        if (!S) return false;
        var inside = inRect({ x1: S.walk.x1 - .01, x2: S.walk.x2 + .01, y1: S.walk.y1 - .01, y2: S.walk.y2 + .01 }, x, y)
            || (S.corridor && inRect(S.corridor, x, y))
            || (S.door && inRect(S.door, x, y));
        if (!inside) return false;
        return !S.blocks.some(function (b) { return inRect(b, x, y); });
    }

    // ── 亂數：照字串算，同一個編號永遠落在同一個點 ──
    function seeded(str) {
        var h = 2166136261;
        for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
        return function () { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
    }
    function animalBlocked(x, y) { return SCENES.ranch.animalBlocks.some(function (r) { return inRect(r, x, y); }); }
    function pickSpot(rnd, box) {
        rnd = rnd || Math.random;
        box = box || SCENES.ranch.area;
        for (var i = 0; i < 40; i++) {
            var x = box.x1 + rnd() * (box.x2 - box.x1), y = box.y1 + rnd() * (box.y2 - box.y1);
            if (!animalBlocked(x, y)) return { x: x, y: y };
        }
        return { x: 50, y: 60 };
    }
    // 地上的東西：蛋掉在棚屋前，雜草和糞散在草地
    function itemSpot(id, kind) {
        var r = seeded(String(id));
        var E = SCENES.ranch.eggArea;
        if (kind === 'drop') return { x: E.x1 + r() * (E.x2 - E.x1), y: E.y1 + r() * (E.y2 - E.y1) };
        return pickSpot(r);
    }

    // ── 存檔 ──────────────────────────────────────────
    function createWalk() {
        var s = SCENES.yard.start;
        return { scene: 'yard', x: s.x, y: s.y, carry: 0, hand: null, can: CAN_MAX, herd: {} };
    }
    function normalizeWalk(raw) {
        var w = createWalk();
        if (!raw || !SCENES[raw.scene]) return w;
        w.scene = raw.scene;
        w.x = num(raw.x, w.x);
        w.y = num(raw.y, w.y);
        if (!walkable(w.scene, w.x, w.y)) { var s = SCENES[w.scene].start; w.x = s.x; w.y = s.y; }
        w.carry = Math.max(0, Math.min(STEP, num(raw.carry, 0)));
        w.hand = TOOLS[raw.hand] ? raw.hand : null;
        w.can = Math.max(0, Math.min(CAN_MAX, Math.floor(num(raw.can, CAN_MAX))));
        if (raw.herd && typeof raw.herd === 'object') {
            Object.keys(raw.herd).forEach(function (id) {
                var p = raw.herd[id];
                if (p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y))) w.herd[id] = { x: Number(p.x), y: Number(p.y) };
            });
        }
        return w;
    }
    function attach(state, raw) {
        state.walk = normalizeWalk(raw && raw.walk);
        return state;
    }
    function W(state) { if (!state.walk) state.walk = createWalk(); return state.walk; }

    // ── 體力（跟農場同一份）──
    function staminaOf(state) { return state.stamina == null ? 0 : state.stamina; }
    function spend(state, n) { state.stamina = Math.max(0, staminaOf(state) - n); }

    // ── 走路 ──────────────────────────────────────────
    // 走到 (scene, x, y)：照距離扣體力。跨區＝先走到這區門口、從那區門口走進來。
    // 體力用完了還是走得動（不扣），只是什麼都做不了。回傳這一趟扣了幾點。
    function pathLength(state, scene, x, y) {
        var w = W(state), to = { x: x, y: y };
        if (scene === w.scene) return dist(w, to);
        return dist(w, SCENES[w.scene].gate) + dist(SCENES[scene].gate, to);
    }
    function moveTo(state, scene, x, y) {
        if (!SCENES[scene]) return result(false, 'unknown_scene', '沒有這個地方。');
        var w = W(state);
        var len = pathLength(state, scene, x, y);
        w.carry += len;
        var cost = Math.floor(w.carry / STEP);
        w.carry -= cost * STEP;
        var paid = Math.min(cost, staminaOf(state));
        spend(state, paid);
        w.scene = scene;
        w.x = x;
        w.y = y;
        return result(true, 'moved', '', { cost: paid, length: len });
    }

    // 某個東西站哪裡做事：'pond' 'shed' 'trough' 'water' 'hay' 'barn' 'gate'、'plot:3'、動物編號、地上東西的編號
    function targetOf(state, key) {
        if (key == null) return null;
        key = String(key);
        var m = /^plot:(\d)$/.exec(key);
        if (m) key = 'plot' + m[1];
        var sc = Object.keys(SCENES);
        for (var i = 0; i < sc.length; i++) {
            var sp = SCENES[sc[i]].spots[key];
            if (sp) return { scene: sc[i], x: sp.x, y: sp.y, reach: sp.reach, name: sp.name };
        }
        if (key === 'gate:yard' || key === 'gate:ranch') {
            var g = SCENES[key.slice(5)].gate;
            return { scene: key.slice(5), x: g.x, y: g.y, reach: 6, name: SCENES[key.slice(5)].name + '門口' };
        }
        var r = state.ranch;
        if (r) {
            var a = r.animals.find(function (x) { return x.id === key; });
            if (a) {
                var p = herdPos(state, a.id);
                return { scene: 'ranch', x: p.x, y: p.y, reach: ANIMAL_REACH[a.kind] || 8, name: a.kind, animal: a };
            }
            var kinds = [['drops', 'drop'], ['poops', 'poop'], ['weeds', 'weed']];
            for (var k = 0; k < kinds.length; k++) {
                var it = r[kinds[k][0]].find(function (x) { return x.id === key; });
                if (it) { var s = itemSpot(it.id, kinds[k][1]); return { scene: 'ranch', x: s.x, y: s.y, reach: ITEM_REACH, name: kinds[k][1] }; }
            }
        }
        return null;
    }
    // AI 用：走到某個東西旁邊（站在它前面一點，不踩在上面）
    function goTo(state, key) {
        var t = targetOf(state, key);
        if (!t) return result(false, 'unknown_target', '找不到那個地方或東西。');
        var stand = { x: t.x, y: t.y };
        if (t.animal) stand.x += (t.x > 50 ? -1 : 1) * (t.reach - 3);
        else if (!SCENES[t.scene].spots[String(key).replace(/^plot:/, 'plot')]) stand.x += 2.5;   // 地上的東西：站旁邊
        var out = moveTo(state, t.scene, stand.x, stand.y);
        return result(true, 'arrived', '走到' + t.name + '旁邊' + (out.cost ? '（走路花了 ' + out.cost + ' 點體力）' : '') + '。', { cost: out.cost });
    }
    function near(state, key) {
        var t = targetOf(state, key), w = W(state);
        if (!t || t.scene !== w.scene) return false;
        return dist(w, t) <= t.reach;
    }

    // ── 動物的位置 ──
    function herdPos(state, id) {
        var w = W(state);
        if (!w.herd[id]) w.herd[id] = pickSpot(seeded(id + ':' + (state.day || 1)));
        return w.herd[id];
    }
    function setHerdPos(state, id, x, y) {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        W(state).herd[id] = { x: x, y: y };
    }

    // ── 工具 ──
    function hasTool(state, tool) {
        if (tool === 'can') return true;
        return !!(state.ranch && state.ranch.tools && state.ranch.tools[tool]);
    }
    function takeTool(state, tool) {
        var t = TOOLS[tool];
        if (!t) return result(false, 'unknown_tool', '沒有這種工具。');
        var w = W(state);
        if (w.hand === tool) return result(false, 'holding', '手上已經拿著' + t.name + '了。');
        if (!near(state, t.spot)) return result(false, 'too_far', t.name + '放在' + SCENES[t.scene].spots[t.spot].name + '，要先走過去。');
        if (!hasTool(state, tool)) return result(false, 'no_tool', '還沒有' + t.name + '，在棚屋買。');
        var back = w.hand ? TOOLS[w.hand].name : '';
        w.hand = tool;
        return result(true, 'took', '拿起' + t.name + (back ? '，' + back + '放回原位' : '') + '。');
    }
    function dropTool(state) {
        var w = W(state);
        if (!w.hand) return result(false, 'empty_hand', '手上沒拿東西。');
        var t = TOOLS[w.hand];
        w.hand = null;
        return result(true, 'dropped', t.name + '放回' + SCENES[t.scene].spots[t.spot].name + '。');
    }
    function refillCan(state, farm) {
        var w = W(state);
        if (w.hand !== 'can') return result(false, 'need_can', '手上要拿著水壺（在工具棚）。');
        if (!near(state, 'pond')) return result(false, 'too_far', '要走到池塘邊才裝得到水。');
        if (w.can >= CAN_MAX) return result(false, 'can_full', '水壺是滿的。');
        if (staminaOf(state) < COST_REFILL_CAN) return farm.tiredResult(COST_REFILL_CAN);
        spend(state, COST_REFILL_CAN);
        w.can = CAN_MAX;
        return result(true, 'can_filled', '水壺裝滿了，夠澆 ' + CAN_MAX + ' 塊田。');
    }

    // ── 做事：先檢查站的位置與手上的東西，再交給原本的規則 ──
    // action：{ type, plot, crop, animal, food, item, tool, kind, quantity }
    // libs：{ farm: AureliaFarmCore, ranch: RanchCore }
    function nameOf(state, t, ranch) {
        if (t.animal) return ranch ? ranch.label(t.animal, state.ranch.animals) : '牠';
        return ({ drop: '那個產出', poop: '那坨糞', weed: '那叢草' })[t.name] || t.name;
    }

    function act(state, action, libs) {
        var farm = libs.farm, ranch = libs.ranch;
        var tooFar = function (st, key) {
            var t = targetOf(st, key);
            return result(false, 'too_far', '要先走到' + (t ? nameOf(st, t, ranch) : '那裡') + '旁邊。');
        };
        var a = action || {};
        var w = W(state);
        var plotKey = 'plot' + a.plot;
        switch (a.type) {
            case 'take': return takeTool(state, a.tool);
            case 'drop': return dropTool(state);
            case 'refill_can': return refillCan(state, farm);
            case 'water': {
                if (!near(state, plotKey)) return tooFar(state, plotKey);
                if (w.hand !== 'can') return result(false, 'need_can', '手上要拿著水壺（在工具棚）。');
                if (w.can <= 0) return result(false, 'can_empty', '水壺空了，去池塘裝水。');
                var o = farm.water(state, Number(a.plot), a.prefix);
                if (o.ok) w.can -= 1;
                return o;
            }
            case 'plant':
                if (!near(state, plotKey)) return tooFar(state, plotKey);
                return farm.plant(state, Number(a.plot), a.crop, a.prefix);
            case 'harvest':
                if (!near(state, plotKey)) return tooFar(state, plotKey);
                return farm.harvest(state, Number(a.plot), a.prefix);
            case 'fertilize':
                if (!near(state, plotKey)) return tooFar(state, plotKey);
                return farm.fertilize(state, Number(a.plot), a.prefix);
            case 'buy_seed': return farm.buySeed(state, a.crop, a.quantity);
            // 賣東西：只有出貨箱（09-29 起商店不收東西）
            case 'ship':
            case 'unship':
                if (!libs.ship) return result(false, 'no_ship', '出貨箱還沒裝好。');
                if (!near(state, 'yardbin') && !near(state, 'ranchbin')) return result(false, 'too_far', '要先走到出貨箱旁邊（後院左邊、牧場門口右邊）。');
                return a.type === 'ship' ? libs.ship.ship(state, a.item, a.quantity, libs) : libs.ship.unshipAll(state, libs);
            case 'feed':
                if (!near(state, a.animal)) return tooFar(state, a.animal);
                return ranch.feed(state, a.animal, a.food);
            case 'feed_all':
                if (!near(state, 'trough')) return tooFar(state, 'trough');
                return ranch.feedAllHay(state);
            case 'refill':
                if (!near(state, 'water')) return tooFar(state, 'water');
                return ranch.refillWater(state);
            case 'buy_hay':
                if (!near(state, 'hay')) return tooFar(state, 'hay');
                return ranch.buyHay(state, a.quantity == null ? 5 : a.quantity);
            case 'milk':
            case 'shear': {
                var tool = a.type === 'milk' ? 'bucket' : 'shears';
                if (!near(state, a.animal)) return tooFar(state, a.animal);
                if (w.hand !== tool) return result(false, 'need_' + tool, '手上要拿著' + TOOLS[tool].name + '（在棚屋拿）。');
                return a.type === 'milk' ? ranch.milk(state, a.animal) : ranch.shear(state, a.animal);
            }
            case 'medicine':
                if (!near(state, a.animal)) return tooFar(state, a.animal);
                return ranch.giveMedicine(state, a.animal);
            case 'collect':
            case 'pull':
            case 'clean':
                if (!near(state, a.item)) return tooFar(state, a.item);
                return a.type === 'collect' ? ranch.collect(state, a.item) : a.type === 'pull' ? ranch.pullWeed(state, a.item) : ranch.cleanPoop(state, a.item);
            case 'buy_tool':
                if (!near(state, 'barn')) return tooFar(state, 'barn');
                return ranch.buyTool(state, a.tool);
            case 'buy_medicine':
                if (!near(state, 'barn')) return tooFar(state, 'barn');
                return ranch.buyMedicine(state, a.quantity);
            case 'buy_animal':
                if (!near(state, 'barn')) return tooFar(state, 'barn');
                return ranch.buyAnimal(state, a.kind);
            default:
                return result(false, 'unknown_action', '不認識的行動：' + a.type);
        }
    }

    // 過一天（在 farm_core、ranch_core 的 advanceDay 之後叫）：沒走完的零頭歸零、動物重新散開。
    // 小人站的地方和手上的東西不變。
    function advanceDay(state, opts) {
        var rand = (opts && opts.rand) || Math.random;
        var w = W(state);
        w.carry = 0;
        w.herd = {};
        if (state.ranch) state.ranch.animals.forEach(function (a) { w.herd[a.id] = pickSpot(rand); });
        return result(true, 'walk_day', '');
    }

    return {
        ASPECT: ASPECT, STEP: STEP, CAN_MAX: CAN_MAX, SCENES: SCENES, TOOLS: TOOLS, ANIMAL_REACH: ANIMAL_REACH, ITEM_REACH: ITEM_REACH,
        dist: dist, walkable: walkable, seeded: seeded, pickSpot: pickSpot, itemSpot: itemSpot, animalBlocked: animalBlocked,
        createWalk: createWalk, normalizeWalk: normalizeWalk, attach: attach,
        pathLength: pathLength, moveTo: moveTo, targetOf: targetOf, goTo: goTo, near: near,
        herdPos: herdPos, setHerdPos: setHerdPos, hasTool: hasTool, takeTool: takeTool, dropTool: dropTool, refillCan: refillCan,
        act: act, advanceDay: advanceDay
    };
});
