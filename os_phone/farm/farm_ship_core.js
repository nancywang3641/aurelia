// ============================================================
// farm_ship_core.js — 出貨箱＋每天的結算單（後院、牧場共用，存在 state.ship）
// ------------------------------------------------------------
// 09-29 她：「現金流正確嗎，我都不知道錢哪來錢哪去」→ 照星露谷做出貨箱：
//   賣東西＝走到出貨箱旁邊把東西放進去（可以一次放一整疊、當天還能拿回來），
//   過一天時統一結算，出一張結算單：賣了什麼、各賣多少、今天花了什麼、淨賺多少、金幣從多少變多少，
//   還有昨天農場牧場發生的事（長大、枯萎、產出、跑掉…）。
// 商店從此只「買」不「賣」：錢只從出貨箱進來，看結算單就知道錢從哪來、花去哪。
// 箱子有兩個（後院、牧場各一），裡面的東西是同一箱（state.ship.bin）。
// 結算時把箱子裡的東西放回倉庫、再用原本的 sellHarvest／sellProduct 賣掉：價格、帳本、日記只有一份規則。
// 一天結束一律叫 endDay（它會依序：結算出貨箱 → 農場過一天 → 牧場過一天 → 走路那層過一天）。
// 09-30 起照真的時間過日子（catchUp／endEarly，見下面那段）：住戶那兩塊地在 VPS 每天清晨 4 點結算，
//   她這塊以前只有按「結束今天」才過一天，沒按時間就停住（打開還是上次的樣子）。
// 🚨 收購商（之後 Gemini 出價、寫評語）接在 report.buyer，現在是空的。
// ============================================================
(function (root, factory) {
    'use strict';
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.FarmShipCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function result(ok, code, message, extra) {
        var out = { ok: ok, code: code, message: message };
        if (extra) Object.keys(extra).forEach(function (k) { out[k] = extra[k]; });
        return out;
    }
    function int(v) { var n = Math.floor(Number(v)); return Number.isFinite(n) ? n : 0; }

    // 箱子裡一格：{ key, qty }。key＝'harvest:作物' 或 'product:產品:good|normal'
    // history：以前的結算單（新的在前，留 HISTORY_KEEP 天）；totals：從第一天一路加上來的（看板最上面那幾格）
    var HISTORY_KEEP = 60;
    // settledTo：這塊地「現在這一天」在哪個時間點結束（毫秒）；0＝照真時間以前的舊存檔
    function createShip() { return { bin: [], report: null, history: [], totals: { days: 0, income: 0, spent: 0, stolen: 0 }, settledTo: 0 }; }
    function normalizeShip(raw) {
        var s = createShip();
        if (!raw) return s;
        if (Array.isArray(raw.bin)) {
            raw.bin.forEach(function (b) {
                if (b && typeof b.key === 'string' && int(b.qty) > 0 && /^(harvest:\w+|product:\w+:(good|normal))$/.test(b.key)) s.bin.push({ key: b.key, qty: int(b.qty) });
            });
        }
        if (raw.report && typeof raw.report === 'object') s.report = raw.report;
        if (Array.isArray(raw.history)) s.history = raw.history.filter(function (r) { return r && typeof r === 'object' && Number.isFinite(Number(r.day)); }).slice(0, HISTORY_KEEP);
        if (raw.totals) ['days', 'income', 'spent', 'stolen'].forEach(function (k) { s.totals[k] = int(raw.totals[k]); });
        if (Number(raw.settledTo) > 0) s.settledTo = Number(raw.settledTo);
        // 看板之前的舊存檔只有上一張：先放進歷史，總額從那張開始算
        if (!s.history.length && s.report) {
            s.history = [s.report];
            if (!raw.totals) s.totals = { days: 1, income: int(s.report.income), spent: int(s.report.spentTotal) };
        }
        return s;
    }
    function attach(state, raw) { state.ship = normalizeShip(raw && raw.ship); return state; }
    function S(state) { if (!state.ship) state.ship = createShip(); return state.ship; }

    // ── 東西的名字、單價、手上有幾個 ──
    function parse(key) {
        var p = String(key).split(':');
        if (p[0] === 'harvest') return { kind: 'harvest', id: p[1] };
        if (p[0] === 'product') return { kind: 'product', id: p[1], quality: p[2] === 'good' ? 'good' : 'normal' };
        return null;
    }
    function info(state, key, libs) {
        var k = parse(key);
        if (!k) return null;
        if (k.kind === 'harvest') {
            var c = libs.farm.CROPS[k.id];
            if (!c) return null;
            return { key: key, name: c.name, unit: '份', price: c.sellPrice, have: state.inventory.harvest[k.id] || 0 };
        }
        var r = libs.ranch, P = r && r.PRODUCTS[k.id];
        if (!P || !state.ranch) return null;
        return { key: key, name: P.name + (k.quality === 'good' ? '（上等）' : ''), unit: P.unit, price: r.priceOf(k.id, k.quality), have: state.ranch.products[k.id][k.quality] || 0 };
    }
    function take(state, key, n) {
        var k = parse(key);
        if (k.kind === 'harvest') state.inventory.harvest[k.id] -= n;
        else state.ranch.products[k.id][k.quality] -= n;
    }
    function giveBack(state, key, n) {
        var k = parse(key);
        if (k.kind === 'harvest') state.inventory.harvest[k.id] += n;
        else state.ranch.products[k.id][k.quality] += n;
    }
    // 能賣的：倉庫裡有的收成與牧場產品
    function sellables(state, libs) {
        var out = [];
        libs.farm.CROP_IDS.forEach(function (id) { var i = info(state, 'harvest:' + id, libs); if (i && i.have > 0) out.push(i); });
        if (libs.ranch && state.ranch) libs.ranch.PRODUCT_IDS.forEach(function (p) {
            ['good', 'normal'].forEach(function (q) { var i = info(state, 'product:' + p + ':' + q, libs); if (i && i.have > 0) out.push(i); });
        });
        return out;
    }
    function binList(state, libs) {
        return S(state).bin.map(function (b) { var i = info(state, b.key, libs); return i ? { key: b.key, name: i.name, unit: i.unit, price: i.price, qty: b.qty, amount: i.price * b.qty } : null; }).filter(Boolean);
    }
    function binTotal(state, libs) { return binList(state, libs).reduce(function (s, b) { return s + b.amount; }, 0); }

    // 放進箱子（qty 不給＝那一疊全部）。位置檢查在 farm_walk_core 的 act 那層。
    function ship(state, key, qty, libs) {
        var i = info(state, key, libs);
        if (!i) return result(false, 'unknown_item', '這個不能賣。');
        var n = qty == null ? i.have : int(qty);
        if (n <= 0) return result(false, 'invalid_quantity', '數量要大於零。');
        if (i.have < n) return result(false, 'not_enough', i.name + '不夠（只有 ' + i.have + ' ' + i.unit + '）。');
        take(state, key, n);
        var bin = S(state).bin, b = bin.find(function (x) { return x.key === key; });
        if (b) b.qty += n; else bin.push({ key: key, qty: n });
        return result(true, 'shipped', '放進出貨箱：' + i.name + ' × ' + n + '，明天早上結算。', { qty: n });
    }
    // 當天還沒結算的，全部拿回來
    function unshipAll(state, libs) {
        var bin = S(state).bin;
        if (!bin.length) return result(false, 'bin_empty', '出貨箱是空的。');
        var n = 0;
        bin.forEach(function (b) { if (info(state, b.key, libs)) { giveBack(state, b.key, b.qty); n += b.qty; } });
        S(state).bin = [];
        return result(true, 'unshipped', '把出貨箱裡的 ' + n + ' 樣東西拿回來了。');
    }

    // ── 一天結束：結算出貨箱，再讓農場、牧場、走路各過一天 ──
    // opts.rand 傳給牧場與走路（測試用）。回傳這張結算單（也存在 state.ship.report，打開頁面看得到上一張）。
    function endDay(state, libs, opts) {
        var day = state.day, coinsBefore = state.coins;
        var sold = [];
        binList(state, libs).forEach(function (b) {
            var k = parse(b.key);
            giveBack(state, b.key, b.qty);
            var out = k.kind === 'harvest' ? libs.farm.sellHarvest(state, k.id, b.qty) : libs.ranch.sellProduct(state, k.id, k.quality, b.qty);
            if (out.ok) sold.push({ key: b.key, name: b.name, unit: b.unit, qty: b.qty, price: b.price, amount: out.income });
            else take(state, b.key, b.qty);   // 賣不掉（照理不會）：別讓東西憑空多出來
        });
        S(state).bin = [];
        var income = sold.reduce(function (s, x) { return s + x.amount; }, 0);
        // 今天花的錢：帳本裡今天、金額是負的那幾筆（買種子、乾草、工具、藥、動物）
        var spent = (state.ledger || []).filter(function (e) { return e.day === day && e.amount < 0; }).map(function (e) {
            var crop = e.cropId && libs.farm.CROPS[e.cropId];
            return { note: crop ? e.note + '：' + crop.name + ' × ' + e.quantity : e.note, amount: e.amount };
        }).reverse();
        var spentTotal = spent.reduce(function (s, x) { return s + x.amount; }, 0);
        // 今天去別人家偷吃拿到的（farm_core.stealBite 當下就加進金幣、記一筆 type 'steal'）：也要上結算單，金幣起訖才對得上
        var stolen = (state.ledger || []).filter(function (e) { return e.day === day && e.type === 'steal' && e.amount > 0; }).map(function (e) {
            var crop = e.cropId && libs.farm.CROPS[e.cropId];
            return { note: crop ? e.note + '：' + crop.name : e.note, amount: e.amount };
        }).reverse();
        var stolenTotal = stolen.reduce(function (s, x) { return s + x.amount; }, 0);
        var farmOut = libs.farm.advanceDay(state);
        var ranchOut = libs.ranch ? libs.ranch.advanceDay(state, opts) : null;
        if (libs.walk) libs.walk.advanceDay(state, opts);
        var report = {
            day: day, sold: sold, income: income, spent: spent, spentTotal: spentTotal,
            stolen: stolen, stolenTotal: stolenTotal, net: income + spentTotal + stolenTotal,
            coinsStart: coinsBefore - spentTotal - stolenTotal, coinsEnd: state.coins,
            farm: farmOut.report, ranch: ranchOut, buyer: null
        };
        var sh = S(state);
        sh.report = report;
        sh.history.unshift(report);
        sh.history = sh.history.slice(0, HISTORY_KEEP);
        sh.totals.days += 1;
        sh.totals.income += income;
        sh.totals.spent += spentTotal;
        sh.totals.stolen += stolenTotal;
        return result(true, 'day_ended', '第 ' + day + ' 日結算完成。', { report: report });
    }

    // ── 照真的時間過日子：每天台灣時間清晨 4 點結算一天 ──
    //   跟 VPS 上住戶那兩塊地同一個時間（garden_admin.js 的 SETTLE_MIN，台灣 04:00），不跟著裝置的時區走。
    //   catchUp：打開後院（或開著跨過清晨 4 點）時，把已經過了的每一個清晨 4 點各結算一次。
    //     這幾天沒人照顧就照規則走（沒澆水不長、連兩天沒澆枯萎），跟住戶的地同一套。
    //     太久沒來（超過 CATCH_MAX 天）只補那幾天，多的不再一天一天算。
    //     舊存檔（settledTo 0）：停在那一天沒結束，當成上一個清晨 4 點就該結束，先結算這一天。
    //   endEarly：「結束今天」＝提早收工，順便把接下來那個清晨 4 點用掉，
    //     所以最多只能比真的時間多走一天（今晚按過，清晨 4 點不會再過一次；再按一次會被擋下來）。
    var DAY_MS = 86400000;
    var SETTLE_UTC_MS = 20 * 3600000;   // 台灣 04:00＝UTC 前一天 20:00（台灣沒有日光節約）
    var CATCH_MAX = 60;
    function nextSettle(ms) {
        var t = Math.floor((ms - SETTLE_UTC_MS) / DAY_MS) * DAY_MS + SETTLE_UTC_MS;
        return t > ms ? t : t + DAY_MS;
    }
    function now_(nowMs) { var n = Number(nowMs); return Number.isFinite(n) && n > 0 ? n : Date.now(); }
    // 全新沒動過的田（第 1 日、沒結算過、田都空的）：從現在開始算，不補那一天
    function untouched(state) {
        return (Number(state.day) || 1) <= 1 && !S(state).totals.days &&
            !(state.plots || []).some(function (p) { return p && p.cropId; });
    }
    function catchUp(state, libs, nowMs, opts) {
        var sh = S(state), now = now_(nowMs), reports = [];
        if (!(sh.settledTo > 0)) sh.settledTo = untouched(state) ? nextSettle(now) : nextSettle(now) - DAY_MS;
        else sh.settledTo = nextSettle(sh.settledTo - 1);   // 對齊到清晨 4 點（本來就是的不變）
        while (sh.settledTo <= now && reports.length < CATCH_MAX) {
            reports.push(endDay(state, libs, opts).report);
            sh.settledTo += DAY_MS;
        }
        if (sh.settledTo <= now) sh.settledTo = nextSettle(now);
        return { days: reports.length, reports: reports };
    }
    // 現在按「結束今天」會不會被擋（今天已經提早結束過了）
    function canEndEarly(state, nowMs) {
        var sh = S(state), now = now_(nowMs);
        return !(sh.settledTo > 0) || sh.settledTo - now <= DAY_MS;
    }
    function endEarly(state, libs, nowMs, opts) {
        var sh = S(state), now = now_(nowMs);
        // 開著跨過了清晨 4 點、還沒補：按一下＝補上那幾天（不再多過一天）
        if (!(sh.settledTo > 0) || sh.settledTo <= now) {
            var cu = catchUp(state, libs, now, opts);
            if (cu.days) return result(true, 'day_ended', '結算了 ' + cu.days + ' 天。', { report: cu.reports[cu.reports.length - 1], days: cu.days });
        }
        if (sh.settledTo - now > DAY_MS) return result(false, 'already_ended', '今天已經提早結束了，清晨 4 點過後才能再結束一天。');
        var out = endDay(state, libs, opts);
        sh.settledTo += DAY_MS;
        out.days = 1;
        return out;
    }

    return {
        HISTORY_KEEP: HISTORY_KEEP, CATCH_MAX: CATCH_MAX,
        createShip: createShip, normalizeShip: normalizeShip, attach: attach,
        info: info, sellables: sellables, binList: binList, binTotal: binTotal,
        ship: ship, unshipAll: unshipAll, endDay: endDay,
        nextSettle: nextSettle, catchUp: catchUp, canEndEarly: canEndEarly, endEarly: endEarly
    };
});
