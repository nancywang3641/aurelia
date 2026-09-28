// ============================================================
// ranch_core.js — 牧場規則（跟 farm_core.js 共用同一份存檔，資料放在 state.ranch）
// ------------------------------------------------------------
// 餵食：每隻動物一天吃一份。乾草（便宜、產出普通）或牠最愛的作物（產出上等）。
//       一份作物收成可以切成 4 份飼料。
// 喝水：水槽最多裝 3 天份，每天喝掉一格；喝乾的那天大家都不產出。加水不用錢。
// 生產：當天吃飽、有水、沒生病的大動物，一天結束時產出：
//       雞＝蛋掉在地上，要去撿；牛＝奶好了（ready），要拿桶子去擠；羊＝吃飽 3 天毛長好（ready），要拿剪刀去剪。
//       牛奶／羊毛沒收走就不會再多一份（浪費）。上等的賣價是普通的 2 倍。
// 工具：桶子、剪刀在棚屋買，買一次就有。
// 體力：每個動作扣 state.stamina（跟農場同一份，一天 50，過一天回滿）。買賣、摸寵物不花。
// 髒亂：吃飽的動物偶爾拉一坨（牛最常拉）。一天結束時地上有 4 坨以上＝太髒：
//       當天的上等產出降成普通，而且每隻有機會生病。清掉的糞便變成肥料（state.inventory.fertilizer），拿去後院施肥。
// 生病：病了不產出、不生小孩；打一針藥馬上好，或牧場乾淨連兩天自己好。只有這一種病。
// 生小孩：同種兩隻大的都連續 3 天吃飽喝足、沒生病，就有機會生一隻小的（一種一天最多一隻，有數量上限）。
//        小的也要吃，吃飽幾天才長大；長大前不產出。
// 雜草：牧場偶爾冒雜草（最多 6 叢）。拔起來變成 1 捆乾草。
// 逃跑：連餓兩天（hungryDays 到 2）就翻圍欄跑了。可以在棚屋再買。
// 寵物（貓、狗）不吃飼料、不產出，只在牧場晃。
// 隨機的部分都走 advanceDay 的 opts.rand，測試可以塞固定值。
// ⚠️ farm_core.normalizeState 只保留農場認得的欄位——載入存檔後一定要呼叫 attach(state, raw)，
//    不然牧場整份會在下一次存檔時被洗掉。
// ============================================================
(function (root, factory) {
    'use strict';
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.RanchCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var ANIMALS = {
        chicken: { name: '雞', baby: '小雞', fav: 'silverwheat', product: 'egg', every: 1, collect: 'drop', price: 30, max: 6, poop: 0.25, grow: 2 },
        sheep: { name: '羊', baby: '小羊', fav: 'moonleaf', product: 'wool', every: 3, collect: 'shears', price: 80, max: 4, poop: 0.4, grow: 4 },
        cow: { name: '牛', baby: '小牛', fav: 'honeycorn', product: 'milk', every: 1, collect: 'bucket', price: 150, max: 2, poop: 0.6, grow: 5 }
    };
    var ANIMAL_IDS = Object.keys(ANIMALS);
    var PETS = { cat: { name: '貓' }, dog: { name: '狗' } };
    var PRODUCTS = {
        egg: { name: '雞蛋', unit: '顆', price: 10 },
        wool: { name: '羊毛', unit: '團', price: 40 },
        milk: { name: '牛奶', unit: '瓶', price: 22 }
    };
    var PRODUCT_IDS = Object.keys(PRODUCTS);
    var TOOLS = {
        bucket: { name: '桶子', use: '擠牛奶', price: 50 },
        shears: { name: '剪刀', use: '剪羊毛', price: 80 }
    };
    var MEDICINE_PRICE = 15;
    var HAY_PRICE = 4;
    var PORTIONS_PER_CROP = 4;
    var GOOD_MULT = 2;
    var WATER_MAX = 3;
    var DIRTY_AT = 4;         // 地上幾坨以上算太髒
    var POOP_CAP = 10;
    var WEED_CAP = 6;
    var WEED_CHANCE = 0.35;
    var SICK_CHANCE = 0.25;   // 太髒那天，每隻生病的機率
    var HEAL_DAYS = 2;        // 牧場乾淨連幾天自己好
    var BREED_STREAK = 3;     // 連續幾天吃飽喝足才可能生
    var BREED_CHANCE = 0.3;
    var RUNAWAY_DAYS = 2;
    var COST = { feed: 1, refill: 3, pull: 2, clean: 2, collect: 1, milk: 3, shear: 4, medicine: 1 };
    var STAMINA_MAX_FALLBACK = 50;
    var START_HERD = ['cow', 'sheep', 'sheep', 'chicken', 'chicken', 'chicken'];
    var START_PETS = ['cat', 'dog'];
    var CROP_NAMES = {
        silverwheat: '銀穗麥', moonleaf: '月葉菜', honeycorn: '蜜光玉米'
    };

    function result(ok, code, message, extra) {
        var out = { ok: ok, code: code, message: message };
        if (extra) Object.keys(extra).forEach(function (k) { out[k] = extra[k]; });
        return out;
    }
    function int(v, d) { var n = Math.floor(Number(v)); return Number.isFinite(n) ? n : (d || 0); }
    function addLog(state, text) {
        state.logs.unshift('第 ' + state.day + ' 日｜' + text);
        state.logs = state.logs.slice(0, 300);   // 跟 farm_core 的 LOG_KEEP 同一個數
    }
    function addLedger(state, type, qty, amount, note) {
        state.ledger.unshift({ day: state.day, type: type, cropId: null, quantity: qty, amount: amount, note: note });
        state.ledger = state.ledger.slice(0, 40);
    }
    function emptyProducts() {
        var out = {};
        PRODUCT_IDS.forEach(function (p) { out[p] = { normal: 0, good: 0 }; });
        return out;
    }
    // 體力跟農場同一份（state.stamina）
    function staminaOf(state) { return state.stamina == null ? STAMINA_MAX_FALLBACK : state.stamina; }
    function tired(state, cost) { return staminaOf(state) < cost; }
    function spend(state, cost) { state.stamina = Math.max(0, staminaOf(state) - cost); }
    function tiredResult(cost) { return result(false, 'tired', '體力不夠了（這件事要 ' + cost + ' 點），明天再做。'); }

    function label(animal, list) {
        var info = ANIMALS[animal.kind];
        if (animal.baby > 0) return info.baby;
        var same = list.filter(function (a) { return a.kind === animal.kind && !(a.baby > 0); });
        return info.name + (same.length > 1 ? ' ' + (same.indexOf(animal) + 1) + ' 號' : '');
    }
    function newAnimal(r, kind, baby) {
        return {
            id: 'a' + (r.nextId++), kind: kind, fedToday: false, fedWith: null, hungryDays: 0, fullDays: 0,
            ready: null, baby: baby || 0, streak: 0, sick: false, cleanDays: 0
        };
    }

    function createRanch() {
        var r = {
            nextId: 1,
            animals: [],
            pets: START_PETS.slice(),
            hay: 5,
            water: WATER_MAX,
            medicine: 0,
            tools: { bucket: false, shears: false },
            feed: { silverwheat: 0, moonleaf: 0, honeycorn: 0 },
            drops: [],
            poops: [],
            weeds: [],
            products: emptyProducts(),
            stats: { produced: 0, runaway: 0, born: 0 }
        };
        START_HERD.forEach(function (kind) { r.animals.push(newAnimal(r, kind)); });
        return r;
    }

    function idList(list) {
        return Array.isArray(list) ? list.filter(function (x) { return x && x.id; }).map(function (x) { return { id: String(x.id) }; }) : [];
    }
    function normalizeRanch(raw) {
        if (!raw || !Array.isArray(raw.animals)) return createRanch();
        var r = createRanch();
        r.animals = raw.animals.filter(function (a) { return a && ANIMALS[a.kind]; }).map(function (a, i) {
            return {
                id: String(a.id || ('a' + (i + 1))), kind: a.kind,
                fedToday: !!a.fedToday, fedWith: a.fedWith === 'fav' || a.fedWith === 'hay' ? a.fedWith : null,
                hungryDays: Math.max(0, int(a.hungryDays)), fullDays: Math.max(0, int(a.fullDays)),
                ready: a.ready === 'good' || a.ready === 'normal' ? a.ready : null,
                baby: Math.max(0, int(a.baby)), streak: Math.max(0, int(a.streak)),
                sick: !!a.sick, cleanDays: Math.max(0, int(a.cleanDays))
            };
        });
        r.nextId = Math.max(int(raw.nextId, 1), r.animals.length + 1);
        r.pets = Array.isArray(raw.pets) ? raw.pets.filter(function (p) { return PETS[p]; }) : r.pets;
        r.hay = Math.max(0, int(raw.hay));
        r.water = raw.water == null ? WATER_MAX : Math.max(0, Math.min(WATER_MAX, int(raw.water)));
        r.medicine = Math.max(0, int(raw.medicine));
        r.tools = { bucket: !!(raw.tools && raw.tools.bucket), shears: !!(raw.tools && raw.tools.shears) };
        Object.keys(r.feed).forEach(function (c) { r.feed[c] = Math.max(0, int(raw.feed && raw.feed[c])); });
        r.drops = Array.isArray(raw.drops) ? raw.drops.filter(function (d) { return d && PRODUCTS[d.product]; }).map(function (d) {
            return { id: String(d.id), product: d.product, quality: d.quality === 'good' ? 'good' : 'normal', from: String(d.from || '') };
        }) : [];
        r.poops = idList(raw.poops).slice(0, POOP_CAP);
        r.weeds = idList(raw.weeds).slice(0, WEED_CAP);
        PRODUCT_IDS.forEach(function (p) {
            var s = raw.products && raw.products[p];
            r.products[p] = { normal: Math.max(0, int(s && s.normal)), good: Math.max(0, int(s && s.good)) };
        });
        r.stats.produced = Math.max(0, int(raw.stats && raw.stats.produced));
        r.stats.runaway = Math.max(0, int(raw.stats && raw.stats.runaway));
        r.stats.born = Math.max(0, int(raw.stats && raw.stats.born));
        return r;
    }

    // 載入存檔後掛回牧場（raw＝剛 JSON.parse 出來、還沒被 farm_core 洗過的那份）
    function attach(state, raw) {
        state.ranch = normalizeRanch(raw && raw.ranch);
        if (!state.inventory) state.inventory = {};
        if (!(state.inventory.fertilizer >= 0)) state.inventory.fertilizer = 0;
        return state;
    }

    function findAnimal(state, id) {
        return state.ranch.animals.find(function (a) { return a.id === id; }) || null;
    }
    function countKind(r, kind) { return r.animals.filter(function (a) { return a.kind === kind; }).length; }

    // 餵一隻：food 是 'hay' 或 'fav'（牠最愛的作物）
    function feed(state, id, food) {
        var r = state.ranch;
        var a = findAnimal(state, id);
        if (!a) return result(false, 'unknown_animal', '找不到這隻動物。');
        var info = ANIMALS[a.kind];
        var name = label(a, r.animals);
        if (a.fedToday) return result(false, 'already_fed', name + '今天已經吃飽了。');
        if (food !== 'hay' && food !== 'fav') return result(false, 'unknown_food', '不認識這種飼料。');
        if (food === 'hay' && r.hay <= 0) return result(false, 'no_hay', '乾草用完了。');
        var c = info.fav;
        if (food === 'fav' && r.feed[c] <= 0 && !state.inventory.harvest[c]) return result(false, 'no_fav', '倉庫裡沒有' + CROP_NAMES[c] + '。');
        if (tired(state, COST.feed)) return tiredResult(COST.feed);
        spend(state, COST.feed);
        if (food === 'hay') {
            r.hay -= 1;
        } else {
            if (r.feed[c] <= 0) { state.inventory.harvest[c] -= 1; r.feed[c] += PORTIONS_PER_CROP; }
            r.feed[c] -= 1;
        }
        a.fedToday = true;
        a.fedWith = food;
        a.hungryDays = 0;
        var what = food === 'hay' ? '乾草' : CROP_NAMES[info.fav];
        addLog(state, '餵' + name + '吃' + what + '。');
        return result(true, 'fed', name + '吃了' + what + '。');
    }

    // 飼料槽：沒吃的全部餵乾草，乾草或體力不夠就餵到沒有為止
    function feedAllHay(state) {
        var r = state.ranch;
        var hungry = r.animals.filter(function (a) { return !a.fedToday; });
        if (!hungry.length) return result(false, 'all_fed', '大家今天都吃飽了。');
        if (r.hay <= 0) return result(false, 'no_hay', '乾草用完了。');
        if (tired(state, COST.feed)) return tiredResult(COST.feed);
        var n = 0;
        hungry.forEach(function (a) { if (r.hay > 0 && !tired(state, COST.feed) && feed(state, a.id, 'hay').ok) n++; });
        var left = hungry.length - n;
        var why = r.hay <= 0 ? '乾草不夠' : '體力不夠';
        return result(true, 'fed_all', '倒了乾草，' + n + ' 隻吃到了' + (left ? '，還有 ' + left + ' 隻沒吃到（' + why + '）。' : '。'), { fed: n, left: left });
    }

    function buyHay(state, qty) {
        var n = qty == null ? 1 : int(qty);
        if (n <= 0) return result(false, 'invalid_quantity', '購買數量必須大於零。');
        var cost = HAY_PRICE * n;
        if (state.coins < cost) return result(false, 'insufficient_coins', '金幣不夠，還差 ' + (cost - state.coins) + '。');
        state.coins -= cost;
        state.ranch.hay += n;
        addLedger(state, 'buy', n, -cost, '買乾草 ' + n + ' 捆');
        addLog(state, '買了 ' + n + ' 捆乾草，花費 ' + cost + ' 金幣。');
        return result(true, 'bought_hay', '買到 ' + n + ' 捆乾草。', { cost: cost });
    }

    function refillWater(state) {
        var r = state.ranch;
        if (r.water >= WATER_MAX) return result(false, 'water_full', '水槽已經是滿的。');
        if (tired(state, COST.refill)) return tiredResult(COST.refill);
        spend(state, COST.refill);
        r.water = WATER_MAX;
        addLog(state, '把水槽加滿了。');
        return result(true, 'refilled', '水槽加滿了，夠喝 ' + WATER_MAX + ' 天。');
    }

    function pullWeed(state, id) {
        var r = state.ranch;
        var i = r.weeds.findIndex(function (w) { return w.id === id; });
        if (i < 0) return result(false, 'no_weed', '那叢草已經拔掉了。');
        if (tired(state, COST.pull)) return tiredResult(COST.pull);
        spend(state, COST.pull);
        r.weeds.splice(i, 1);
        r.hay += 1;
        return result(true, 'pulled', '拔起一叢草，曬成 1 捆乾草。');
    }

    // 清糞：一坨變一份肥料，拿去後院施肥
    function cleanPoop(state, id) {
        var r = state.ranch;
        var i = r.poops.findIndex(function (p) { return p.id === id; });
        if (i < 0) return result(false, 'no_poop', '那裡已經清乾淨了。');
        if (tired(state, COST.clean)) return tiredResult(COST.clean);
        spend(state, COST.clean);
        r.poops.splice(i, 1);
        state.inventory.fertilizer = (state.inventory.fertilizer || 0) + 1;
        return result(true, 'cleaned', '清起來當肥料（肥料 ' + state.inventory.fertilizer + ' 份）' + (r.poops.length ? '，地上還剩 ' + r.poops.length + ' 坨。' : '，牧場乾淨了。'));
    }

    function collect(state, dropId) {
        var r = state.ranch;
        var i = r.drops.findIndex(function (d) { return d.id === dropId; });
        if (i < 0) return result(false, 'no_drop', '那裡已經沒東西了。');
        if (tired(state, COST.collect)) return tiredResult(COST.collect);
        spend(state, COST.collect);
        var d = r.drops.splice(i, 1)[0];
        r.products[d.product][d.quality] += 1;
        var p = PRODUCTS[d.product];
        return result(true, 'collected', '撿到一' + p.unit + p.name + (d.quality === 'good' ? '（上等）' : '') + '。', { drop: d });
    }

    // 擠奶／剪毛：要工具，牛奶或羊毛要「好了」
    function harvestAnimal(state, id, tool) {
        var r = state.ranch;
        var a = findAnimal(state, id);
        if (!a) return result(false, 'unknown_animal', '找不到這隻動物。');
        var info = ANIMALS[a.kind];
        if (info.collect !== tool) return result(false, 'wrong_tool', info.name + '不是這樣收的。');
        var t = TOOLS[tool];
        if (!r.tools[tool]) return result(false, 'no_tool', '還沒有' + t.name + '，去棚屋買。');
        if (!a.ready) return result(false, 'not_ready', label(a, r.animals) + (tool === 'bucket' ? '現在沒有奶。' : '的毛還沒長好。'));
        var cost = tool === 'bucket' ? COST.milk : COST.shear;
        if (tired(state, cost)) return tiredResult(cost);
        spend(state, cost);
        var q = a.ready;
        a.ready = null;
        r.products[info.product][q] += 1;
        var p = PRODUCTS[info.product];
        addLog(state, (tool === 'bucket' ? '替' : '幫') + label(a, r.animals) + (tool === 'bucket' ? '擠奶' : '剪毛') + '，收到一' + p.unit + p.name + (q === 'good' ? '（上等）' : '') + '。');
        return result(true, 'collected', (tool === 'bucket' ? '擠到一瓶' : '剪下一團') + p.name + (q === 'good' ? '（上等）' : '') + '。');
    }
    function milk(state, id) { return harvestAnimal(state, id, 'bucket'); }
    function shear(state, id) { return harvestAnimal(state, id, 'shears'); }

    function buyTool(state, tool) {
        var t = TOOLS[tool];
        if (!t) return result(false, 'unknown_tool', '沒賣這種工具。');
        if (state.ranch.tools[tool]) return result(false, 'have_tool', '已經有' + t.name + '了。');
        if (state.coins < t.price) return result(false, 'insufficient_coins', '金幣不夠，還差 ' + (t.price - state.coins) + '。');
        state.coins -= t.price;
        state.ranch.tools[tool] = true;
        addLedger(state, 'buy', 1, -t.price, '買了' + t.name);
        addLog(state, '買了' + t.name + '，之後可以' + t.use + '了。');
        return result(true, 'bought_tool', '買到' + t.name + '，可以' + t.use + '了。', { cost: t.price });
    }

    function buyMedicine(state, qty) {
        var n = qty == null ? 1 : int(qty);
        if (n <= 0) return result(false, 'invalid_quantity', '購買數量必須大於零。');
        var cost = MEDICINE_PRICE * n;
        if (state.coins < cost) return result(false, 'insufficient_coins', '金幣不夠，還差 ' + (cost - state.coins) + '。');
        state.coins -= cost;
        state.ranch.medicine += n;
        addLedger(state, 'buy', n, -cost, '買藥 ' + n + ' 份');
        return result(true, 'bought_medicine', '買到 ' + n + ' 份藥。', { cost: cost });
    }

    function giveMedicine(state, id) {
        var r = state.ranch;
        var a = findAnimal(state, id);
        if (!a) return result(false, 'unknown_animal', '找不到這隻動物。');
        if (!a.sick) return result(false, 'not_sick', label(a, r.animals) + '沒生病。');
        if (r.medicine <= 0) return result(false, 'no_medicine', '沒有藥了，去棚屋買。');
        if (tired(state, COST.medicine)) return tiredResult(COST.medicine);
        spend(state, COST.medicine);
        r.medicine -= 1;
        a.sick = false;
        a.cleanDays = 0;
        addLog(state, '替' + label(a, r.animals) + '打了一針，病好了。');
        return result(true, 'healed', label(a, r.animals) + '打完針，精神回來了。');
    }

    function buyAnimal(state, kind) {
        var info = ANIMALS[kind];
        if (!info) return result(false, 'unknown_animal', '牧場沒賣這種動物。');
        var r = state.ranch;
        if (countKind(r, kind) >= info.max) return result(false, 'ranch_full', info.name + '已經 ' + info.max + ' 隻了，棚屋住不下。');
        if (state.coins < info.price) return result(false, 'insufficient_coins', '金幣不夠，還差 ' + (info.price - state.coins) + '。');
        state.coins -= info.price;
        var a = newAnimal(r, kind);
        r.animals.push(a);
        addLedger(state, 'buy', 1, -info.price, '買了一隻' + info.name);
        addLog(state, '牧場來了一隻新的' + info.name + '。');
        return result(true, 'bought_animal', '牧場來了一隻新的' + info.name + '。', { animal: a, cost: info.price });
    }

    // 一天結束。跟 farm_core.advanceDay 一起叫（先叫農場，day 已經 +1、體力也回滿了）。
    // opts.rand：0～1 的亂數函式，測試時可以塞固定值
    function advanceDay(state, opts) {
        var rand = (opts && opts.rand) || Math.random;
        var r = state.ranch;
        var thirsty = r.water <= 0;
        var dirty = r.poops.length >= DIRTY_AT;
        var made = [], hungry = 0, ran = [], newPoops = 0, newWeeds = 0, downgraded = 0;
        var fellSick = [], healed = [], grown = [], born = [], wasted = [];
        var before = r.animals.slice();
        r.animals.forEach(function (a) {
            var info = ANIMALS[a.kind];
            var name = label(a, before);
            var ok = a.fedToday && !thirsty;
            if (a.fedToday) {
                if (ok && a.baby > 0) {
                    a.baby -= 1;
                    if (a.baby === 0) grown.push(info.baby + '長大成' + info.name);
                } else if (ok && !a.sick) {
                    a.fullDays += 1;
                    if (a.fullDays >= info.every) {
                        a.fullDays = 0;
                        var q = a.fedWith === 'fav' ? 'good' : 'normal';
                        if (q === 'good' && dirty) { q = 'normal'; downgraded += 1; }
                        if (info.collect === 'drop') {
                            r.drops.push({ id: 'd' + (r.nextId++), product: info.product, quality: q, from: a.id });
                            made.push(PRODUCTS[info.product].name + (q === 'good' ? '（上等）' : ''));
                            r.stats.produced += 1;
                        } else if (a.ready) {
                            wasted.push(name);   // 昨天的還沒收，今天這份就浪費了
                        } else {
                            a.ready = q;
                            made.push(name + (info.collect === 'bucket' ? '的奶' : '的毛') + (q === 'good' ? '（上等）' : ''));
                            r.stats.produced += 1;
                        }
                    }
                }
                if (r.poops.length < POOP_CAP && rand() < info.poop) { r.poops.push({ id: 'p' + (r.nextId++) }); newPoops += 1; }
            } else {
                a.hungryDays += 1;
                hungry += 1;
                if (a.hungryDays >= RUNAWAY_DAYS) ran.push(a);
            }
            a.streak = ok && !a.sick ? a.streak + 1 : 0;
            // 生病：太髒那天有機會病；病了的在牧場乾淨時慢慢好
            if (a.sick) {
                if (!dirty) { a.cleanDays += 1; if (a.cleanDays >= HEAL_DAYS) { a.sick = false; a.cleanDays = 0; healed.push(name); } }
                else a.cleanDays = 0;
            } else if (dirty && rand() < SICK_CHANCE) {
                a.sick = true;
                a.cleanDays = 0;
                a.streak = 0;
                fellSick.push(name);
            }
            a.fedToday = false;
            a.fedWith = null;
        });
        if (ran.length) {
            r.animals = r.animals.filter(function (a) { return ran.indexOf(a) < 0; });
            r.stats.runaway += ran.length;
        }
        // 生小孩：同種兩隻大的都連續吃飽喝足、沒生病
        ANIMAL_IDS.forEach(function (kind) {
            var info = ANIMALS[kind];
            var parents = r.animals.filter(function (a) { return a.kind === kind && !(a.baby > 0) && !a.sick && a.streak >= BREED_STREAK; });
            if (parents.length < 2 || countKind(r, kind) >= info.max) return;
            if (rand() >= BREED_CHANCE) return;
            parents[0].streak = 0;
            parents[1].streak = 0;
            var baby = newAnimal(r, kind, info.grow);
            r.animals.push(baby);
            r.stats.born += 1;
            born.push({ id: baby.id, name: info.baby });
        });
        if (!thirsty) r.water -= 1;
        if (r.weeds.length < WEED_CAP && rand() < WEED_CHANCE) { r.weeds.push({ id: 'w' + (r.nextId++) }); newWeeds += 1; }

        if (thirsty) addLog(state, '水槽昨天是乾的，動物們渴了一整天，什麼都沒產。');
        if (made.length) addLog(state, '牧場昨天產出：' + made.join('、') + '。');
        if (wasted.length) addLog(state, wasted.join('、') + '昨天的還沒收，這一份浪費掉了。');
        if (downgraded) addLog(state, '牧場太髒了，' + downgraded + ' 樣上等產出降成普通。');
        if (fellSick.length) addLog(state, '牧場太髒，' + fellSick.join('、') + '生病了。');
        if (healed.length) addLog(state, healed.join('、') + '的病自己好了。');
        if (grown.length) addLog(state, grown.join('、') + '了！');
        if (born.length) addLog(state, '牧場生了' + born.map(function (b) { return '一隻' + b.name; }).join('、') + '！');
        if (hungry - ran.length > 0) addLog(state, '牧場有 ' + (hungry - ran.length) + ' 隻動物昨天餓肚子，什麼都沒產。');
        var ranNames = ran.map(function (a) { return label(a, before); });
        if (ranNames.length) addLog(state, ranNames.join('、') + '連著餓了兩天，翻過圍欄跑掉了。');
        return result(true, 'ranch_day', '', {
            made: made.length, hungry: hungry, thirsty: thirsty, dirty: dirty, downgraded: downgraded,
            ran: ran.map(function (a) { return a.id; }), ranNames: ranNames, newPoops: newPoops, newWeeds: newWeeds,
            fellSick: fellSick, healed: healed, grown: grown, born: born, wasted: wasted
        });
    }

    function priceOf(product, quality) {
        return PRODUCTS[product].price * (quality === 'good' ? GOOD_MULT : 1);
    }

    function sellProduct(state, product, quality, qty) {
        var p = PRODUCTS[product];
        if (!p) return result(false, 'unknown_product', '找不到這種產品。');
        var q = quality === 'good' ? 'good' : 'normal';
        var n = qty == null ? 1 : int(qty);
        if (n <= 0) return result(false, 'invalid_quantity', '出售數量必須大於零。');
        if (state.ranch.products[product][q] < n) return result(false, 'insufficient_product', p.name + '不夠。');
        var income = priceOf(product, q) * n;
        state.ranch.products[product][q] -= n;
        state.coins += income;
        var nm = p.name + (q === 'good' ? '（上等）' : '');
        addLedger(state, 'sell', n, income, '賣出' + nm);
        addLog(state, '賣出 ' + n + p.unit + nm + '，收入 ' + income + ' 金幣。');
        return result(true, 'sold', '賣出' + nm + '，收入 ' + income + '。', { income: income });
    }

    return {
        ANIMALS: ANIMALS, ANIMAL_IDS: ANIMAL_IDS, PETS: PETS, PRODUCTS: PRODUCTS, PRODUCT_IDS: PRODUCT_IDS, CROP_NAMES: CROP_NAMES,
        TOOLS: TOOLS, MEDICINE_PRICE: MEDICINE_PRICE, HAY_PRICE: HAY_PRICE, PORTIONS_PER_CROP: PORTIONS_PER_CROP, GOOD_MULT: GOOD_MULT,
        WATER_MAX: WATER_MAX, DIRTY_AT: DIRTY_AT, WEED_CAP: WEED_CAP, RUNAWAY_DAYS: RUNAWAY_DAYS, BREED_STREAK: BREED_STREAK, COST: COST,
        createRanch: createRanch, normalizeRanch: normalizeRanch, attach: attach,
        label: label, findAnimal: findAnimal,
        feed: feed, feedAllHay: feedAllHay, buyHay: buyHay, refillWater: refillWater,
        pullWeed: pullWeed, cleanPoop: cleanPoop, collect: collect, milk: milk, shear: shear,
        buyTool: buyTool, buyMedicine: buyMedicine, giveMedicine: giveMedicine, buyAnimal: buyAnimal,
        advanceDay: advanceDay, priceOf: priceOf, sellProduct: sellProduct
    };
});
