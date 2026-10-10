(function (root, factory) {
    'use strict';
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.AureliaFarmCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var VERSION = 2;
    var PLOT_COUNT = 6;
    var ACTIVE_STAGES = ['seeded', 'emerging', 'seedling', 'growing', 'mature'];
    var CROPS = {
        stardew:    { id: 'stardew',    name: '星露豆',   buyPrice: 12, sellPrice: 28, growDays: 4 },
        sunroot:    { id: 'sunroot',    name: '曦根',     buyPrice: 15, sellPrice: 36, growDays: 4 },
        moonleaf:   { id: 'moonleaf',   name: '月葉菜',   buyPrice: 24, sellPrice: 62, growDays: 5 },
        emberpepper:{ id: 'emberpepper',name: '燼火椒',   buyPrice: 32, sellPrice: 86, growDays: 6 },
        cloudberry: { id: 'cloudberry', name: '雲莓',     buyPrice: 26, sellPrice: 72, growDays: 5 },
        frostbell:  { id: 'frostbell',  name: '霜鈴瓜',   buyPrice: 36, sellPrice: 98, growDays: 6 },
        nightstar:  { id: 'nightstar',  name: '夜星茄',   buyPrice: 42, sellPrice: 118, growDays: 7 },
        honeycorn:  { id: 'honeycorn',  name: '蜜光玉米', buyPrice: 30, sellPrice: 82, growDays: 5 },
        dawnberry:  { id: 'dawnberry',  name: '晨露莓',   buyPrice: 22, sellPrice: 58, growDays: 4 },
        silverwheat:{ id: 'silverwheat',name: '銀穗麥',   buyPrice: 18, sellPrice: 45, growDays: 5 }
    };
    var CROP_IDS = Object.keys(CROPS);
    // 體力：一天 50，做事扣、AI 下指令走路也扣（farm_walk_core；她在畫面上走不扣），過一天回滿。買賣不花體力。
    //   目的是讓「住戶醒來一次能做的事」有上限，不然 AI 會把能做的全做完、比不出誰會顧（她 09-29 擔心的「一鍵收取」）。
    //   農場的動作在這支裡扣，牧場的動作在 ranch_core 扣，同一個 state.stamina。
    //   中午休息回一半（noonRest，住戶的地由 VPS 那支每天台灣中午叫一次）：不然早班用完、晚班醒來只剩 0～2 點，
    //   丹寫了四次「晚班沒得做」最後自己把晚班刪了（10-10 她：「回復確實是個好辦法」）。
    //   回復卷（inventory.scroll）：用了體力回滿。10-10 她送住戶的賠禮——之前只有她走路不扣體力，住戶一直吃虧。
    var STAMINA_MAX = 50;
    var NOON_REST = 25;
    var COST = { water: 2, plant: 2, harvest: 2, fertilize: 1, steal: 1 };

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function emptyCounts() {
        var counts = {};
        CROP_IDS.forEach(function (id) { counts[id] = 0; });
        return counts;
    }

    function emptyPlot() {
        return {
            cropId: null,
            progress: 0,
            stage: 'empty',
            wateredToday: false,
            dryDays: 0,
            wiltedDay: null,
            preWiltStage: null,
            rescuedToday: false,
            plantedDay: null,
            fertilized: false
        };
    }

    function createState(options) {
        var opts = options || {};
        var seeds = emptyCounts();
        var harvest = emptyCounts();
        seeds.stardew = 2;
        seeds.sunroot = 1;
        return {
            version: VERSION,
            day: 1,
            coins: typeof opts.coins === 'number' ? Math.max(0, Math.floor(opts.coins)) : 160,
            nextWakeAt: null,
            stamina: STAMINA_MAX,
            plots: Array.from({ length: PLOT_COUNT }, emptyPlot),
            inventory: { seeds: seeds, harvest: harvest, fertilizer: 0, scroll: 0 },
            stats: { totalHarvested: 0, deadCrops: 0 },
            ledger: [],
            logs: ['後院剛整理好。六塊土地都在等第一顆種子。']
        };
    }

    function cropStage(cropId, progress) {
        var crop = CROPS[cropId];
        if (!crop) return 'empty';
        var value = Math.max(0, Math.floor(Number(progress) || 0));
        if (value === 0) return 'seeded';
        if (value === 1) return 'emerging';
        if (value === 2) return 'seedling';
        if (value >= crop.growDays) return 'mature';
        return 'growing';
    }

    function isMature(plot) {
        return !!plot && !!plot.cropId && plot.stage === 'mature';
    }

    function isEmpty(plot) {
        return !plot || !plot.cropId || plot.stage === 'empty';
    }

    // 日記留 LOG_KEEP 行（09-29 看板要看完整日記，從 30 加到 300；牧場那支用同一個數）
    var LOG_KEEP = 300;
    function addLog(state, text) {
        state.logs.unshift('第 ' + state.day + ' 日｜' + text);
        state.logs = state.logs.slice(0, LOG_KEEP);
    }

    function addLedger(state, type, cropId, quantity, amount, note) {
        state.ledger.unshift({
            day: state.day,
            type: type,
            cropId: cropId || null,
            quantity: quantity || 0,
            amount: amount || 0,
            note: note || ''
        });
        state.ledger = state.ledger.slice(0, 40);
    }

    function result(ok, code, message, extra) {
        var output = { ok: ok, code: code, message: message };
        if (extra) Object.keys(extra).forEach(function (key) { output[key] = extra[key]; });
        return output;
    }

    function staminaOf(state) { return state.stamina == null ? STAMINA_MAX : state.stamina; }
    function tired(state, cost) { return staminaOf(state) < cost; }
    function spend(state, cost) { state.stamina = Math.max(0, staminaOf(state) - cost); }
    function tiredResult(cost) { return result(false, 'tired', '體力不夠了（這件事要 ' + cost + ' 點），明天再做。'); }

    // 中午休息：體力回 NOON_REST（不超過上限）。一天叫一次是叫的那邊管（VPS 的 garden_admin 記著哪天叫過）
    function noonRest(state) {
        var before = staminaOf(state);
        state.stamina = Math.min(STAMINA_MAX, before + NOON_REST);
        var gained = state.stamina - before;
        // 頂到上限要講「回滿了」：只寫「回了 2 點」會被當成休息沒用（10-10 試玩）
        var full = state.stamina >= STAMINA_MAX && gained < NOON_REST ? '，回滿了' : '';
        if (gained > 0) addLog(state, '中午吃過飯歇了一下，體力回了 ' + gained + ' 點' + full + '（' + state.stamina + '/' + STAMINA_MAX + '）。');
        return result(true, 'rested', gained > 0 ? '中午休息過，體力回了 ' + gained + ' 點' + full + '。' : '體力本來就是滿的。', { gained: gained });
    }
    // 回復卷：用一張體力回滿
    function giveScroll(state, n, note) {
        n = Math.max(0, Math.floor(Number(n) || 0));
        if (!n) return result(false, 'invalid_quantity', '要送幾張？');
        state.inventory.scroll = (state.inventory.scroll || 0) + n;
        addLog(state, note || ('收到 ' + n + ' 張回復卷。'));
        return result(true, 'got_scroll', '收到 ' + n + ' 張回復卷（現在 ' + state.inventory.scroll + ' 張）。');
    }
    function useScroll(state) {
        if (!(state.inventory.scroll > 0)) return result(false, 'no_scroll', '沒有回復卷了。');
        if (staminaOf(state) >= STAMINA_MAX) return result(false, 'stamina_full', '體力已經是滿的，先留著。');
        var before = staminaOf(state);
        state.inventory.scroll -= 1;
        state.stamina = STAMINA_MAX;
        addLog(state, '用了一張回復卷，體力從 ' + before + ' 回滿到 ' + STAMINA_MAX + '。');
        return result(true, 'used_scroll', '用了一張回復卷，體力回滿（' + STAMINA_MAX + '/' + STAMINA_MAX + '），還剩 ' + state.inventory.scroll + ' 張。');
    }

    function validPlotIndex(state, index) {
        return Number.isInteger(index) && index >= 0 && index < state.plots.length;
    }

    function normalizeCountMap(source) {
        var out = emptyCounts();
        CROP_IDS.forEach(function (id) {
            var value = source && Number(source[id]);
            out[id] = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
        });
        return out;
    }

    function migrateLegacyPlot(plot) {
        if (!plot || !plot.crop) return emptyPlot();
        var cropId = plot.crop === 'bean' ? 'stardew' : plot.crop;
        if (!CROPS[cropId]) return emptyPlot();
        var progress = Math.max(0, Math.floor(Number(plot.age) || 0));
        return {
            cropId: cropId,
            progress: progress,
            stage: cropStage(cropId, progress),
            wateredToday: !!plot.watered,
            dryDays: 0,
            wiltedDay: null,
            preWiltStage: null,
            rescuedToday: false,
            plantedDay: null
        };
    }

    function normalizePlot(plot) {
        if (!plot || !CROPS[plot.cropId]) {
            var empty = emptyPlot();
            empty.wateredToday = !!(plot && plot.wateredToday);
            return empty;
        }
        var progress = Math.max(0, Math.floor(Number(plot.progress) || 0));
        var computedStage = cropStage(plot.cropId, progress);
        var stage = plot.stage === 'wilted' ? 'wilted' : computedStage;
        return {
            cropId: plot.cropId,
            progress: progress,
            stage: stage,
            wateredToday: !!plot.wateredToday,
            dryDays: Math.max(0, Math.floor(Number(plot.dryDays) || 0)),
            wiltedDay: Number.isFinite(Number(plot.wiltedDay)) ? Number(plot.wiltedDay) : null,
            preWiltStage: ACTIVE_STAGES.indexOf(plot.preWiltStage) >= 0 ? plot.preWiltStage : null,
            rescuedToday: !!plot.rescuedToday,
            plantedDay: Number.isFinite(Number(plot.plantedDay)) ? Number(plot.plantedDay) : null,
            fertilized: !!plot.fertilized
        };
    }

    function normalizeState(raw) {
        if (!raw || !Array.isArray(raw.plots)) return createState();
        var state = createState();
        var legacy = !raw.version || Number(raw.version) < VERSION;
        state.day = Math.max(1, Math.floor(Number(raw.day) || 1));
        state.coins = Number.isFinite(Number(raw.coins)) ? Math.max(0, Math.floor(Number(raw.coins))) : state.coins;
        state.nextWakeAt = typeof raw.nextWakeAt === 'string' ? raw.nextWakeAt : null;
        state.plots = Array.from({ length: PLOT_COUNT }, function (_, index) {
            return legacy ? migrateLegacyPlot(raw.plots[index]) : normalizePlot(raw.plots[index]);
        });
        if (!legacy && raw.inventory) {
            state.inventory.seeds = normalizeCountMap(raw.inventory.seeds);
            state.inventory.harvest = normalizeCountMap(raw.inventory.harvest);
            state.inventory.fertilizer = Math.max(0, Math.floor(Number(raw.inventory.fertilizer) || 0));
            state.inventory.scroll = Math.max(0, Math.floor(Number(raw.inventory.scroll) || 0));
        }
        state.stamina = raw.stamina == null ? STAMINA_MAX : Math.max(0, Math.min(STAMINA_MAX, Math.floor(Number(raw.stamina) || 0)));
        state.stats.totalHarvested = raw.stats && Number.isFinite(Number(raw.stats.totalHarvested))
            ? Math.max(0, Math.floor(Number(raw.stats.totalHarvested)))
            : Math.max(0, Math.floor(Number(raw.harvested) || 0));
        state.stats.deadCrops = raw.stats && Number.isFinite(Number(raw.stats.deadCrops))
            ? Math.max(0, Math.floor(Number(raw.stats.deadCrops))) : 0;
        state.ledger = Array.isArray(raw.ledger) ? raw.ledger.slice(0, 40) : [];
        state.logs = Array.isArray(raw.logs) && raw.logs.length ? raw.logs.slice(0, LOG_KEEP) : state.logs;
        if (legacy) addLog(state, '舊版 LAB 存檔已搬進新版農場，原本田裡的作物有保留下來。');
        return state;
    }

    function buySeed(state, cropId, quantity) {
        var crop = CROPS[cropId];
        var qty = quantity == null ? 1 : Math.floor(Number(quantity));
        if (!crop) return result(false, 'unknown_crop', '找不到這種種子。');
        if (!Number.isFinite(qty) || qty <= 0) return result(false, 'invalid_quantity', '購買數量必須大於零。');
        var cost = crop.buyPrice * qty;
        if (state.coins < cost) return result(false, 'insufficient_coins', '金幣不夠，還差 ' + (cost - state.coins) + '。');
        state.coins -= cost;
        state.inventory.seeds[cropId] += qty;
        addLedger(state, 'buy', cropId, qty, -cost, '購買種子');
        addLog(state, '在種子商店買了 ' + qty + ' 顆' + crop.name + '種子，花費 ' + cost + ' 金幣。');
        return result(true, 'bought', '買到 ' + qty + ' 顆' + crop.name + '種子。', { cost: cost });
    }

    function plant(state, index, cropId, prefix) {
        var crop = CROPS[cropId];
        if (!validPlotIndex(state, index)) return result(false, 'invalid_plot', '找不到這塊田。');
        if (!crop) return result(false, 'unknown_crop', '找不到這種作物。');
        if (!isEmpty(state.plots[index])) return result(false, 'plot_occupied', '這塊田已經有作物。');
        if (state.inventory.seeds[cropId] <= 0) return result(false, 'no_seed', crop.name + '種子用完了。');
        if (tired(state, COST.plant)) return tiredResult(COST.plant);
        spend(state, COST.plant);
        state.inventory.seeds[cropId] -= 1;
        // 種下去不會順便澆水（09-29 她抓到：種完地變深色、水壺卻沒少）。
        // 以前澆水不用拿水壺，順便澆沒差；現在澆水要水壺、會用掉水，順便澆等於免費多澆一塊。
        // 先澆濕再種的，土照樣是濕的。
        var wasWet = !!state.plots[index].wateredToday;
        state.plots[index] = {
            cropId: cropId,
            progress: 0,
            stage: 'seeded',
            wateredToday: wasWet,
            dryDays: 0,
            wiltedDay: null,
            preWiltStage: null,
            rescuedToday: false,
            plantedDay: state.day,
            fertilized: false
        };
        addLedger(state, 'plant', cropId, 1, 0, '播種');
        addLog(state, (prefix || '') + '在第 ' + (index + 1) + ' 塊地種下' + crop.name + (wasWet ? '，土是濕的。' : '，還沒澆水。'));
        return result(true, 'planted', '種下' + crop.name + (wasWet ? '，土是濕的。' : '，記得澆水。'));
    }

    function water(state, index, prefix) {
        if (!validPlotIndex(state, index)) return result(false, 'invalid_plot', '找不到這塊田。');
        var plot = state.plots[index];
        // 已經澆過的會在下面被擋掉、不扣體力；只有真的要澆才扣
        if (!plot.wateredToday) {
            if (tired(state, COST.water)) return tiredResult(COST.water);
            spend(state, COST.water);
        }
        if (isEmpty(plot)) {
            if (plot.wateredToday) return result(false, 'already_watered', '這塊空地今天已經澆濕了。');
            plot.wateredToday = true;
            addLog(state, (prefix || '') + '先把第 ' + (index + 1) + ' 塊空地澆濕，準備播種。');
            return result(true, 'prepared', '土地澆濕了，可以播種。');
        }
        var crop = CROPS[plot.cropId];
        if (plot.wateredToday) return result(false, 'already_watered', '土還是濕的，今天不用再澆。');
        if (plot.stage === 'wilted') {
            plot.stage = plot.preWiltStage || cropStage(plot.cropId, plot.progress);
            plot.preWiltStage = null;
            plot.wiltedDay = null;
            plot.dryDays = 0;
            plot.wateredToday = true;
            plot.rescuedToday = true;
            addLog(state, (prefix || '') + '及時替第 ' + (index + 1) + ' 塊地的' + crop.name + '補水，從枯萎邊緣救回來了。');
            return result(true, 'rescued', crop.name + '救回來了。');
        }
        plot.wateredToday = true;
        plot.dryDays = 0;
        addLog(state, (prefix || '') + '替第 ' + (index + 1) + ' 塊地的' + crop.name + '澆水。');
        return result(true, 'watered', crop.name + '喝到水了。');
    }

    function harvest(state, index, prefix) {
        if (!validPlotIndex(state, index)) return result(false, 'invalid_plot', '找不到這塊田。');
        var plot = state.plots[index];
        if (!isMature(plot)) return result(false, 'not_mature', '作物還不能收成。');
        if (tired(state, COST.harvest)) return tiredResult(COST.harvest);
        spend(state, COST.harvest);
        var cropId = plot.cropId;
        var crop = CROPS[cropId];
        // 施過肥的田多收一份
        var qty = plot.fertilized ? 2 : 1;
        state.inventory.harvest[cropId] += qty;
        state.stats.totalHarvested += 1;
        state.plots[index] = emptyPlot();
        addLedger(state, 'harvest', cropId, qty, 0, qty > 1 ? '收成入庫（有施肥，多收一份）' : '收成入庫');
        addLog(state, (prefix || '') + '收成第 ' + (index + 1) + ' 塊地的' + crop.name + (qty > 1 ? '，施過肥，多收了一份' : '') + '，果實已放進倉庫。');
        return result(true, 'harvested', crop.name + '收成完成' + (qty > 1 ? '，施過肥多收一份！' : '。'), { quantity: qty });
    }

    // 施肥：牧場清出來的糞便變成肥料（state.inventory.fertilizer），施在一塊還沒收的田上，收成多一份
    function fertilize(state, index, prefix) {
        if (!validPlotIndex(state, index)) return result(false, 'invalid_plot', '找不到這塊田。');
        var plot = state.plots[index];
        if (isEmpty(plot)) return result(false, 'plot_empty', '先種東西再施肥。');
        if (plot.fertilized) return result(false, 'already_fertilized', '這塊田已經施過肥了。');
        if (!(state.inventory.fertilizer > 0)) return result(false, 'no_fertilizer', '沒有肥料了，去牧場清糞便就有。');
        if (tired(state, COST.fertilize)) return tiredResult(COST.fertilize);
        spend(state, COST.fertilize);
        state.inventory.fertilizer -= 1;
        plot.fertilized = true;
        var crop = CROPS[plot.cropId];
        addLog(state, (prefix || '') + '替第 ' + (index + 1) + ' 塊地的' + crop.name + '施肥，收成時會多一份。');
        return result(true, 'fertilized', crop.name + '施好肥了，收成會多一份。');
    }

    // 偷吃一口（09-29 她要的偷菜）：別人家成熟的作物，每個人每一株只能偷吃一口；主人的作物不會少。
    //   「能不能偷」（熟了沒、這株偷過沒）只在伺服器判斷（VPS 的 garden/steal.js 看主人那份存檔和偷吃紀錄），
    //   這裡只管小偷自己這邊：拿半價的錢、花體力、記帳、寫日記——她的瀏覽器和 VPS 上的住戶用同一支。
    //   先問 canSteal 再去伺服器登記，登記成功才叫 stealBite（不然伺服器記了一口、這邊卻沒體力收錢）。
    function stealValue(cropId) { var c = CROPS[cropId]; return c ? Math.floor(c.sellPrice / 2) : 0; }
    function canSteal(state) { return tired(state, COST.steal) ? tiredResult(COST.steal) : result(true, 'can_steal', ''); }
    function stealBite(state, cropId, coins, whose) {
        var crop = CROPS[cropId];
        if (!crop) return result(false, 'unknown_crop', '找不到這種作物。');
        if (tired(state, COST.steal)) return tiredResult(COST.steal);
        spend(state, COST.steal);
        var got = Math.max(0, Math.floor(Number(coins) || 0));
        state.coins += got;
        addLedger(state, 'steal', cropId, 1, got, '去' + whose + '家偷吃');
        addLog(state, '去' + whose + '家偷吃了一口' + crop.name + '，拿到 ' + got + ' 金幣。');
        return result(true, 'stole', '去' + whose + '家偷吃了一口' + crop.name + '，拿到 ' + got + ' 金幣。', { coins: got });
    }
    // 被偷的那邊：主人下次打開後院（住戶是下次醒來或結算）時寫進日記。作物照樣在田裡。
    function bitten(state, thief, cropId, plotIndex) {
        var crop = CROPS[cropId];
        addLog(state, thief + '偷吃了你第 ' + (plotIndex + 1) + ' 塊田的一口' + (crop ? crop.name : '作物') + '。');
    }

    function sellHarvest(state, cropId, quantity) {
        var crop = CROPS[cropId];
        var qty = quantity == null ? 1 : Math.floor(Number(quantity));
        if (!crop) return result(false, 'unknown_crop', '找不到這種收成品。');
        if (!Number.isFinite(qty) || qty <= 0) return result(false, 'invalid_quantity', '出售數量必須大於零。');
        if (state.inventory.harvest[cropId] < qty) return result(false, 'insufficient_harvest', crop.name + '庫存不足。');
        var income = crop.sellPrice * qty;
        state.inventory.harvest[cropId] -= qty;
        state.coins += income;
        addLedger(state, 'sell', cropId, qty, income, '出售收成');
        addLog(state, '賣出 ' + qty + ' 份' + crop.name + '，收入 ' + income + ' 金幣。');
        return result(true, 'sold', '賣出' + crop.name + '，收入 ' + income + '。', { income: income });
    }

    function advanceDay(state) {
        state.day += 1;
        state.nextWakeAt = null;
        state.stamina = STAMINA_MAX;
        var report = { grew: 0, wilted: 0, died: 0, rested: 0, rescued: 0 };
        state.plots.forEach(function (plot, index) {
            if (isEmpty(plot)) {
                plot.wateredToday = false;
                return;
            }
            var crop = CROPS[plot.cropId];
            if (plot.stage === 'wilted') {
                report.died += 1;
                state.stats.deadCrops += 1;
                addLog(state, '第 ' + (index + 1) + ' 塊地的' + crop.name + '枯萎太久，只能清掉重新種植。');
                state.plots[index] = emptyPlot();
                return;
            }
            if (plot.wateredToday) {
                plot.dryDays = 0;
                if (plot.rescuedToday) {
                    report.rescued += 1;
                } else if (plot.stage !== 'mature') {
                    plot.progress = Math.min(crop.growDays, plot.progress + 1);
                    plot.stage = cropStage(plot.cropId, plot.progress);
                    report.grew += 1;
                } else {
                    report.rested += 1;
                }
            } else {
                plot.dryDays += 1;
                report.rested += 1;
                if (plot.dryDays >= 2) {
                    plot.preWiltStage = plot.stage;
                    plot.stage = 'wilted';
                    plot.wiltedDay = state.day;
                    report.wilted += 1;
                }
            }
            plot.wateredToday = false;
            plot.rescuedToday = false;
        });
        var parts = [];
        if (report.grew) parts.push(report.grew + ' 塊作物長大一階');
        if (report.wilted) parts.push(report.wilted + ' 塊作物枯萎');
        if (report.died) parts.push(report.died + ' 塊作物死亡');
        if (report.rescued) parts.push(report.rescued + ' 塊作物休養成功');
        if (!parts.length) parts.push('今天沒有作物生長');
        addLog(state, parts.join('、') + '。');
        return result(true, 'day_advanced', '來到第 ' + state.day + ' 日。', { report: report });
    }

    function scheduleNextWake(state, hours, nowMs) {
        var value = Math.max(1, Math.floor(Number(hours) || 12));
        var base = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
        state.nextWakeAt = new Date(base + value * 60 * 60 * 1000).toISOString();
        return state.nextWakeAt;
    }

    function chooseAutonomousAction(state) {
        var index = state.plots.findIndex(isMature);
        if (index >= 0) return { type: 'harvest', plotIndex: index };
        index = state.plots.findIndex(function (plot) { return plot.stage === 'wilted'; });
        if (index >= 0) return { type: 'water', plotIndex: index };
        index = state.plots.findIndex(function (plot) { return !isEmpty(plot) && !plot.wateredToday; });
        if (index >= 0) return { type: 'water', plotIndex: index };
        index = state.plots.findIndex(isEmpty);
        if (index >= 0) {
            var owned = CROP_IDS.filter(function (id) { return state.inventory.seeds[id] > 0; });
            if (owned.length) return { type: 'plant', plotIndex: index, cropId: owned[(state.day + index) % owned.length] };
            var affordable = CROP_IDS.filter(function (id) { return state.coins >= CROPS[id].buyPrice; });
            if (affordable.length) return { type: 'buy', cropId: affordable[0], quantity: 1 };
        }
        var sellable = CROP_IDS.find(function (id) { return state.inventory.harvest[id] > 0; });
        if (sellable) return { type: 'sell', cropId: sellable, quantity: 1 };
        return { type: 'idle' };
    }

    function applyAction(state, action, prefix) {
        if (!action || typeof action.type !== 'string') return result(false, 'invalid_action', '行動格式不完整。');
        switch (action.type) {
            case 'buy': return buySeed(state, action.cropId, action.quantity);
            case 'plant': return plant(state, Number(action.plotIndex), action.cropId, prefix);
            case 'water': return water(state, Number(action.plotIndex), prefix);
            case 'harvest': return harvest(state, Number(action.plotIndex), prefix);
            case 'fertilize': return fertilize(state, Number(action.plotIndex), prefix);
            case 'sell': return sellHarvest(state, action.cropId, action.quantity);
            case 'idle':
                addLog(state, (prefix || '') + '巡過後院，沒有急事，決定去池邊發呆。');
                return result(true, 'idle', '今天沒有急事。');
            default: return result(false, 'unknown_action', '農場拒絕了不認識的行動：' + action.type);
        }
    }

    function plotImage(plot) {
        if (isEmpty(plot)) return plot && plot.wateredToday ? 'farm_obj_plot_wet_v1.png' : 'farm_obj_plot_dry_v1.png';
        return 'farm_obj_plot_' + plot.cropId + '_' + plot.stage + '_v1.png';
    }

    function snapshot(state) {
        return {
            version: state.version,
            day: state.day,
            coins: state.coins,
            nextWakeAt: state.nextWakeAt,
            plots: state.plots.map(function (plot, index) {
                return {
                    plotIndex: index,
                    cropId: plot.cropId,
                    stage: plot.stage,
                    wateredToday: plot.wateredToday,
                    dryDays: plot.dryDays
                };
            }),
            inventory: clone(state.inventory)
        };
    }

    return {
        VERSION: VERSION,
        PLOT_COUNT: PLOT_COUNT,
        ACTIVE_STAGES: ACTIVE_STAGES.slice(),
        CROPS: CROPS,
        CROP_IDS: CROP_IDS.slice(),
        STAMINA_MAX: STAMINA_MAX,
        NOON_REST: NOON_REST,
        LOG_KEEP: LOG_KEEP,
        COST: COST,
        noonRest: noonRest,
        giveScroll: giveScroll,
        useScroll: useScroll,
        tired: tired,
        spend: spend,
        tiredResult: tiredResult,
        fertilize: fertilize,
        clone: clone,
        emptyPlot: emptyPlot,
        createState: createState,
        normalizeState: normalizeState,
        cropStage: cropStage,
        isMature: isMature,
        isEmpty: isEmpty,
        buySeed: buySeed,
        plant: plant,
        water: water,
        harvest: harvest,
        sellHarvest: sellHarvest,
        stealValue: stealValue,
        canSteal: canSteal,
        stealBite: stealBite,
        bitten: bitten,
        advanceDay: advanceDay,
        scheduleNextWake: scheduleNextWake,
        chooseAutonomousAction: chooseAutonomousAction,
        applyAction: applyAction,
        plotImage: plotImage,
        snapshot: snapshot
    };
});
