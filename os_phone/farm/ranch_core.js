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
// 寵物（貓、狗）不吃飼料、不產出。貓只給摸。
// 狗有好感（最多 5 顆心）：摸摸（不花體力）、到狗屋裝飯碗（不花錢、體力 1），一天各一次、各加 1 顆。
//   一天都沒摸也沒裝飯碗，結算時掉 1 顆；掉光就離家出走一天（狗屋空的），隔天結算時自己回來、剩 2 顆。
// 野狼：每晚都可能來。狗在家就被趕跑；狗不在家那晚很可能來，叼走一隻雞（一晚最多一隻，牛羊太大叼不走）。
//   妳沒開後院的日子也照算（10-11 她：「照掉」），住戶兩塊地同一套（她：「一樣的」）。
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
        milk: { name: '牛奶', unit: '瓶', price: 22 },
        honey: { name: '蜂蜜', unit: '罐', price: 35 }
    };
    // ── 大件（10-11 她：「開搞大件項目」，錢屯著沒地方花）──
    // 棚屋擴建：一級加一間側屋（雞窩）、二級再加穀倉塔，每種動物住得下更多隻（生小孩也照這個上限）。
    //   圖是阿洛照原本那間畫的（ranch_obj_barn_v2／v3），原本那間的位置一格都沒動。
    var BARN_LEVELS = {
        1: { name: '棚屋', max: { chicken: 6, sheep: 4, cow: 2 } },
        2: { name: '棚屋（加了側屋）', price: 600, max: { chicken: 9, sheep: 6, cow: 3 } },
        3: { name: '棚屋（加了側屋和穀倉塔）', price: 1200, max: { chicken: 12, sheep: 8, cow: 4 } }
    };
    var BARN_TOP = 3;
    // 蜂箱：放在後院右下角花叢邊。田裡有 HIVE_FLOWERS 塊以上在長東西（蜜蜂有花採）就每天一罐，不然兩天一罐；
    //   沒收就在蜂箱裡放著，存到 HIVE_MAX 罐就不再多（浪費）。要走到蜂箱旁邊收，體力 COST.honey。
    //   資料放 state.ranch.hive（產品跟雞蛋牛奶同一套：倉庫、出貨箱、結算單、背包都不用另外接）。
    var HIVE_PRICE = 400;
    var HIVE_MAX = 3;
    var HIVE_FLOWERS = 3;
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
    var COST = { feed: 1, refill: 3, pull: 2, clean: 2, collect: 1, milk: 3, shear: 4, medicine: 1, bowl: 1, honey: 1 };
    var DOG_LOVE_MAX = 5;
    var DOG_BACK_LOVE = 2;        // 離家一天自己回來時剩幾顆心
    var WOLF_CHANCE = 0.25;       // 狗在家：野狼來的機率（來了會被趕跑）
    var WOLF_AWAY_CHANCE = 0.75;  // 狗不在家那晚
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

    // 幾號照同一種的先來後到算，小的也算一個號（10-10 試玩：小雞長大那天插進大雞的號，後面的大雞全部往後挪一號）
    function label(animal, list) {
        var info = ANIMALS[animal.kind];
        var same = list.filter(function (a) { return a.kind === animal.kind; });
        var no = same.length > 1 ? ' ' + (same.indexOf(animal) + 1) + ' 號' : '';
        return (animal.baby > 0 ? info.baby : info.name) + no;
    }
    function newAnimal(r, kind, baby) {
        return {
            id: 'a' + (r.nextId++), kind: kind, fedToday: false, fedWith: null, hungryDays: 0, fullDays: 0,
            ready: null, baby: baby || 0, streak: 0, sick: false, cleanDays: 0
        };
    }

    // 狗的好感：pet／bowl＝今天摸過／飯碗裝過；away＝離家出走中（隔天結算回來）
    function newDog() { return { love: DOG_LOVE_MAX, pet: false, bowl: false, away: false }; }

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
            dog: newDog(),
            barn: 1,                   // 棚屋等級（1～BARN_TOP）
            hive: null,                // 蜂箱：沒買是 null；買了 { jars（裡面幾罐還沒收）, days（離上一罐過了幾天） }
            wolf: null,                // 最近一次野狼來的那晚：{ day（結算後那天）, took（叼走誰，沒有就 null）, chased }
            stats: { produced: 0, runaway: 0, born: 0, eaten: 0 }
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
        r.stats.eaten = Math.max(0, int(raw.stats && raw.stats.eaten));
        var dg = raw.dog;
        if (dg) r.dog = {
            love: dg.love == null ? DOG_LOVE_MAX : Math.max(0, Math.min(DOG_LOVE_MAX, int(dg.love))),
            pet: !!dg.pet, bowl: !!dg.bowl, away: !!dg.away
        };
        r.wolf = raw.wolf && raw.wolf.day ? { day: int(raw.wolf.day), took: raw.wolf.took ? String(raw.wolf.took) : null, chased: !!raw.wolf.chased } : null;
        r.barn = Math.max(1, Math.min(BARN_TOP, int(raw.barn, 1)));
        r.hive = raw.hive && typeof raw.hive === 'object'
            ? { jars: Math.max(0, Math.min(HIVE_MAX, int(raw.hive.jars))), days: Math.max(0, int(raw.hive.days)) } : null;
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
    // 這種動物現在最多養幾隻（看棚屋等級）
    function capOf(r, kind) {
        var lv = BARN_LEVELS[(r && r.barn) || 1] || BARN_LEVELS[1];
        return lv.max[kind] || 0;
    }

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

    // 一次撿完／清完／拔完（10-10 她要的：「一次撿完蛋、一次清完糞」）：每件的體力減半（加起來的零頭進位），
    //   體力不夠就做到哪算哪、剩下的留著。一顆一顆撿的時候，住戶地上堆了十幾二十顆蛋、十坨糞，牧場一髒動物就天天生病。
    function _batchCount(state, n, unit) {
        var half = unit / 2;
        var k = Math.min(n, Math.floor(staminaOf(state) / half + 1e-9));
        return { k: k, cost: Math.ceil(k * half - 1e-9) };
    }
    function collectAll(state) {
        var r = state.ranch;
        if (!r.drops.length) return result(false, 'no_drop', '地上沒有東西可以撿。');
        var b = _batchCount(state, r.drops.length, COST.collect);
        if (!b.k) return tiredResult(Math.ceil(COST.collect / 2));
        var got = {};
        r.drops.splice(0, b.k).forEach(function (d) {
            r.products[d.product][d.quality] += 1;
            var p = PRODUCTS[d.product], key = p.name + (d.quality === 'good' ? '（上等）' : '');
            got[key] = (got[key] || 0) + 1;
        });
        spend(state, b.cost);
        var left = r.drops.length;
        return result(true, 'collected_all', '一次撿了 ' + b.k + ' 樣：' + Object.keys(got).map(function (k) { return k + ' × ' + got[k]; }).join('、') +
            '（體力 -' + b.cost + '）' + (left ? '，地上還有 ' + left + ' 樣（體力不夠）。' : '。'), { n: b.k, cost: b.cost, left: left });
    }
    function cleanAll(state) {
        var r = state.ranch;
        if (!r.poops.length) return result(false, 'no_poop', '牧場已經是乾淨的。');
        var b = _batchCount(state, r.poops.length, COST.clean);
        if (!b.k) return tiredResult(Math.ceil(COST.clean / 2));
        r.poops.splice(0, b.k);
        state.inventory.fertilizer = (state.inventory.fertilizer || 0) + b.k;
        spend(state, b.cost);
        var left = r.poops.length;
        return result(true, 'cleaned_all', '一次清了 ' + b.k + ' 坨，換成 ' + b.k + ' 份肥料（肥料 ' + state.inventory.fertilizer + ' 份；體力 -' + b.cost + '）' +
            (left ? '，地上還剩 ' + left + ' 坨（體力不夠）。' : '，牧場乾淨了。'), { n: b.k, cost: b.cost, left: left });
    }
    function pullAll(state) {
        var r = state.ranch;
        if (!r.weeds.length) return result(false, 'no_weed', '沒有雜草。');
        var b = _batchCount(state, r.weeds.length, COST.pull);
        if (!b.k) return tiredResult(Math.ceil(COST.pull / 2));
        r.weeds.splice(0, b.k);
        r.hay += b.k;
        spend(state, b.cost);
        var left = r.weeds.length;
        return result(true, 'pulled_all', '一次拔了 ' + b.k + ' 叢草，曬成 ' + b.k + ' 捆乾草（體力 -' + b.cost + '）' + (left ? '，還剩 ' + left + ' 叢（體力不夠）。' : '。'), { n: b.k, cost: b.cost, left: left });
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
        var r = state.ranch, cap = capOf(r, kind);
        if (countKind(r, kind) >= cap) return result(false, 'ranch_full', info.name + '已經 ' + cap + ' 隻了，棚屋住不下' + (r.barn < BARN_TOP ? '（擴建棚屋就住得下更多）' : '') + '。');
        if (state.coins < info.price) return result(false, 'insufficient_coins', '金幣不夠，還差 ' + (info.price - state.coins) + '。');
        state.coins -= info.price;
        var a = newAnimal(r, kind);
        r.animals.push(a);
        addLedger(state, 'buy', 1, -info.price, '買了一隻' + info.name);
        addLog(state, '牧場來了一隻新的' + info.name + '。');
        return result(true, 'bought_animal', '牧場來了一隻新的' + info.name + '。', { animal: a, cost: info.price });
    }

    // ── 大件：擴建棚屋、蜂箱 ──
    function barnNext(r) { return r.barn < BARN_TOP ? BARN_LEVELS[r.barn + 1] : null; }
    function capsText(lv) { return ANIMAL_IDS.map(function (k) { return ANIMALS[k].name + ' ' + lv.max[k]; }).join('、'); }
    function upgradeBarn(state) {
        var r = state.ranch, next = barnNext(r);
        if (!next) return result(false, 'barn_top', '棚屋已經擴建到最大了。');
        if (state.coins < next.price) return result(false, 'insufficient_coins', '金幣不夠，還差 ' + (next.price - state.coins) + '。');
        state.coins -= next.price;
        r.barn += 1;
        addLedger(state, 'build', 1, -next.price, '擴建棚屋（' + (r.barn - 1) + ' 級）');
        addLog(state, '棚屋擴建好了，' + (r.barn === 2 ? '旁邊多了一間側屋' : '後面多了一座穀倉塔') + '，花費 ' + next.price + ' 金幣。現在最多養：' + capsText(next) + ' 隻。');
        return result(true, 'barn_up', '棚屋擴建好了！現在最多養：' + capsText(next) + ' 隻。', { cost: next.price, level: r.barn });
    }
    function buyHive(state) {
        var r = state.ranch;
        if (r.hive) return result(false, 'have_hive', '後院已經有蜂箱了。');
        if (state.coins < HIVE_PRICE) return result(false, 'insufficient_coins', '金幣不夠，還差 ' + (HIVE_PRICE - state.coins) + '。');
        state.coins -= HIVE_PRICE;
        r.hive = { jars: 0, days: 0 };
        addLedger(state, 'build', 1, -HIVE_PRICE, '買了蜂箱');
        addLog(state, '在後院右下角的花叢邊放了蜂箱，蜜蜂住進去了，花費 ' + HIVE_PRICE + ' 金幣。');
        return result(true, 'bought_hive', '蜂箱放好了！田裡有 ' + HIVE_FLOWERS + ' 塊以上在長東西就每天一罐蜂蜜，不然兩天一罐。', { cost: HIVE_PRICE });
    }
    function collectHoney(state) {
        var r = state.ranch, h = r.hive;
        if (!h) return result(false, 'no_hive', '還沒有蜂箱。');
        if (!h.jars) return result(false, 'no_honey', '蜂箱裡還沒有蜂蜜。');
        if (tired(state, COST.honey)) return tiredResult(COST.honey);
        spend(state, COST.honey);
        var n = h.jars;
        h.jars = 0;
        r.products.honey.normal += n;
        addLog(state, '從蜂箱收了 ' + n + ' 罐蜂蜜。');
        return result(true, 'collected_honey', '收了 ' + n + ' 罐蜂蜜。', { n: n });
    }
    // 田裡現在有幾塊在長東西（枯萎的不算）：蜜蜂採得到的花
    function flowersOf(state) {
        return (state.plots || []).filter(function (p) { return p && p.cropId && p.stage !== 'empty' && p.stage !== 'wilted'; }).length;
    }

    // ── 狗：摸摸、裝飯碗 ──
    function hasDog(r) { return r.pets.indexOf('dog') >= 0; }
    function hearts(n) { return '好感 ' + n + '/' + DOG_LOVE_MAX; }
    function petDog(state) {
        var r = state.ranch, d = r.dog;
        if (!hasDog(r)) return result(false, 'no_dog', '牧場沒有狗。');
        if (d.away) return result(false, 'dog_away', '狗離家出走了，明天清晨結算時會自己回來。');
        if (d.pet) return result(false, 'already_pet', '今天已經摸過狗了（' + hearts(d.love) + '）。');
        var full = d.love >= DOG_LOVE_MAX;
        d.pet = true;
        d.love = Math.min(DOG_LOVE_MAX, d.love + 1);
        return result(true, 'pet', '摸了摸狗，尾巴搖個不停（' + hearts(d.love) + (full ? '，本來就滿了' : '') + '）。', { love: d.love });
    }
    function fillBowl(state) {
        var r = state.ranch, d = r.dog;
        if (!hasDog(r)) return result(false, 'no_dog', '牧場沒有狗。');
        if (d.away) return result(false, 'dog_away', '狗離家出走了，飯碗裝了也沒人吃；明天清晨結算時牠會自己回來。');
        if (d.bowl) return result(false, 'bowl_full', '飯碗今天裝過了（' + hearts(d.love) + '）。');
        if (tired(state, COST.bowl)) return tiredResult(COST.bowl);
        spend(state, COST.bowl);
        var full = d.love >= DOG_LOVE_MAX;
        d.bowl = true;
        d.love = Math.min(DOG_LOVE_MAX, d.love + 1);
        return result(true, 'bowl', '把狗的飯碗裝滿了，牠埋頭吃得很香（' + hearts(d.love) + (full ? '，本來就滿了' : '') + '）。', { love: d.love });
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
            if (parents.length < 2 || countKind(r, kind) >= capOf(r, kind)) return;
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

        // 蜂箱：花多（田裡有 HIVE_FLOWERS 塊以上在長）每天一罐，不然兩天一罐；滿了就不再多
        var hiveOut = null;
        if (r.hive) {
            var flowers = flowersOf(state), need = flowers >= HIVE_FLOWERS ? 1 : 2;
            hiveOut = { made: 0, full: false, flowers: flowers };
            r.hive.days += 1;
            if (r.hive.days >= need) {
                r.hive.days = 0;
                if (r.hive.jars < HIVE_MAX) { r.hive.jars += 1; hiveOut.made = 1; }
                else hiveOut.full = true;
            }
            hiveOut.jars = r.hive.jars;
        }

        // 狗與野狼：先看昨晚狗在不在家，再算好感
        var dogOut = null, wolf = null;
        if (hasDog(r)) {
            var d = r.dog, home = !d.away;
            if (rand() < (home ? WOLF_CHANCE : WOLF_AWAY_CHANCE)) {
                wolf = { day: state.day, took: null, chased: home };
                if (!home) {
                    var hens = r.animals.filter(function (a) { return a.kind === 'chicken'; });
                    if (hens.length) {
                        var prey = hens[Math.min(hens.length - 1, Math.floor(rand() * hens.length))];
                        wolf.took = label(prey, r.animals);
                        wolf.id = prey.id;
                        r.animals = r.animals.filter(function (a) { return a !== prey; });
                        r.stats.eaten += 1;
                    }
                }
                r.wolf = { day: wolf.day, took: wolf.took, chased: wolf.chased };
            }
            dogOut = { left: false, back: false, lost: false };
            if (d.away) {
                d.away = false;
                d.love = DOG_BACK_LOVE;
                dogOut.back = true;
            } else {
                if (!d.pet && !d.bowl && d.love > 0) { d.love -= 1; dogOut.lost = true; }
                if (d.love <= 0) { d.away = true; dogOut.left = true; }
            }
            d.pet = false;
            d.bowl = false;
            dogOut.love = d.love;
        }

        if (thirsty) addLog(state, '水槽昨天是乾的，動物們渴了一整天，什麼都沒產。');
        if (made.length) addLog(state, '牧場昨天產出：' + made.join('、') + '。');
        if (hiveOut && hiveOut.made) addLog(state, '蜂箱多了一罐蜂蜜（裡面 ' + hiveOut.jars + '/' + HIVE_MAX + ' 罐）。');
        if (hiveOut && hiveOut.full) addLog(state, '蜂箱裡的 ' + HIVE_MAX + ' 罐蜂蜜一直沒收，裝滿了，這一罐浪費掉了。');
        if (wasted.length) addLog(state, wasted.join('、') + '昨天的還沒收，這一份浪費掉了。');
        if (downgraded) addLog(state, '牧場太髒了，' + downgraded + ' 樣上等產出降成普通。');
        if (fellSick.length) addLog(state, '牧場太髒，' + fellSick.join('、') + '生病了。');
        if (healed.length) addLog(state, healed.join('、') + '的病自己好了。');
        if (grown.length) addLog(state, grown.join('、') + '了！');
        if (born.length) addLog(state, '牧場生了' + born.map(function (b) { return '一隻' + b.name; }).join('、') + '！');
        if (hungry - ran.length > 0) addLog(state, '牧場有 ' + (hungry - ran.length) + ' 隻動物昨天餓肚子，什麼都沒產。');
        var ranNames = ran.map(function (a) { return label(a, before); });
        if (ranNames.length) addLog(state, ranNames.join('、') + '連著餓了兩天，翻過圍欄跑掉了。');
        if (wolf && wolf.chased) addLog(state, '半夜野狼摸到圍欄邊，被狗吠跑了。');
        else if (wolf && wolf.took) addLog(state, '狗不在家，半夜野狼摸進牧場叼走了' + wolf.took + '，地上剩一撮雞毛。');
        else if (wolf) addLog(state, '狗不在家，半夜野狼在牧場繞了一圈，沒找到雞，走了。');
        if (dogOut && dogOut.back) addLog(state, '離家出走的狗自己回來了，看起來還有點不開心（' + hearts(r.dog.love) + '）。');
        if (dogOut && dogOut.lost && !dogOut.left) addLog(state, '狗昨天整天沒人摸、也沒人裝飯碗，好感掉到 ' + r.dog.love + '/' + DOG_LOVE_MAX + '。');
        if (dogOut && dogOut.left) addLog(state, '狗好幾天沒人摸、也沒人裝飯碗，離家出走了；牠不在的這一晚，野狼可能會來叼雞。');
        return result(true, 'ranch_day', '', {
            made: made.length, hungry: hungry, thirsty: thirsty, dirty: dirty, downgraded: downgraded,
            ran: ran.map(function (a) { return a.id; }), ranNames: ranNames, newPoops: newPoops, newWeeds: newWeeds,
            fellSick: fellSick, healed: healed, grown: grown, born: born, wasted: wasted,
            dog: dogOut, wolf: wolf, hive: hiveOut
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
        DOG_LOVE_MAX: DOG_LOVE_MAX, DOG_BACK_LOVE: DOG_BACK_LOVE, WOLF_CHANCE: WOLF_CHANCE, WOLF_AWAY_CHANCE: WOLF_AWAY_CHANCE,
        BARN_LEVELS: BARN_LEVELS, BARN_TOP: BARN_TOP, HIVE_PRICE: HIVE_PRICE, HIVE_MAX: HIVE_MAX, HIVE_FLOWERS: HIVE_FLOWERS,
        createRanch: createRanch, normalizeRanch: normalizeRanch, attach: attach,
        label: label, findAnimal: findAnimal, countKind: countKind, capOf: capOf, barnNext: barnNext, capsText: capsText,
        upgradeBarn: upgradeBarn, buyHive: buyHive, collectHoney: collectHoney, flowersOf: flowersOf,
        feed: feed, feedAllHay: feedAllHay, buyHay: buyHay, refillWater: refillWater,
        pullWeed: pullWeed, cleanPoop: cleanPoop, collect: collect, collectAll: collectAll, cleanAll: cleanAll, pullAll: pullAll, milk: milk, shear: shear,
        buyTool: buyTool, buyMedicine: buyMedicine, giveMedicine: giveMedicine, buyAnimal: buyAnimal, petDog: petDog, fillBowl: fillBowl,
        advanceDay: advanceDay, priceOf: priceOf, sellProduct: sellProduct
    };
});
