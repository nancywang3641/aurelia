// ============================================================
// os_npc_brain.js — NPC 的共用大腦（11-24）
// ------------------------------------------------------------
// 11-24 定案：讓各種 NPC 腳本更靈活，大腦一顆共用，素材（性格卡、工作清單）各寫各的。
// 素材照小斐的企劃 npc-brain-1124.md（本機，工單 NPC-1124）。
// 這支只有規則、不碰畫面、不叫模型、不存檔：呼叫端把「性格卡」交進來，照規則改它、回傳結果。
//   分數 = 基本分 × 個性加成 × 狀態加成（體力×心情×好感） × 記憶加成，照分數比例抽一件（不是永遠挑最高）。
//   事分四類：W 工作、R 休息、S 社交、M 搗蛋。
// 第一步先接書咖店員（os_cafe_hire.js）；後院小精靈（VPS garden_elves.js）之後也接這一支，所以寫成瀏覽器和 node 都能用的純函式（同 farm_ship_core.js）。
// 卡片長這樣（存在呼叫端自己的存檔裡）：
//   { pk: 個性id, quirk: 怪癖id|null, sta: 體力, mood: 心情, fav: 好感(對老闆), streak: 連上幾天, mem: [{id, left}], day: 上次過清晨是哪天, worked: 那天有沒有上班, tier: 'low'|'mid'|'high', sulk: 心情差連幾個清晨, quitWarn: 想離開連幾天 }
// ============================================================
(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.NpcBrain = api;
    try { if (typeof window !== 'undefined') { window.NpcBrain = api; if (window.parent && window.parent !== window) window.parent.NpcBrain = api; } } catch (e) {}
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const CATS = ['W', 'R', 'S', 'M'];
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    // ── 十種個性（三種角色共用；W/R/S/M 加成）── 夜貓照班次：早班工作 ×0.8 休息 ×1.3，晚班反過來
    const PERS = {
        diligent: { name: '勤奮', desc: '閒不下來，做事優先', mul: { W: 1.3, R: 0.7, S: 0.9, M: 0.5 } },
        lazy:     { name: '偷懶', desc: '能歇就歇，偶爾惹事', mul: { W: 0.8, R: 1.6, S: 1.0, M: 1.3 } },
        quirky:   { name: '怪癖', desc: '有自己的一套，一定帶一個怪癖', mul: { W: 0.95, R: 1.0, S: 1.1, M: 1.2 } },
        foodie:   { name: '貪吃', desc: '眼睛永遠盯著吃的', mul: { W: 0.9, R: 1.1, S: 1.0, M: 1.5 } },
        chatty:   { name: '愛聊', desc: '話多，人緣好', mul: { W: 0.9, R: 0.9, S: 1.8, M: 1.0 } },
        timid:    { name: '膽小', desc: '怕事、怕動物、怕被罵', mul: { W: 1.0, R: 1.2, S: 0.8, M: 0.4 } },
        perfect:  { name: '完美主義', desc: '做得慢但很少錯', mul: { W: 1.2, R: 0.8, S: 0.8, M: 0.5 } },
        nightowl: { name: '夜貓', desc: '早上沒精神，晚上很行', mul: { W: 1, R: 1, S: 1.0, M: 1.0 } },
        honest:   { name: '老實', desc: '正直、不愛搗蛋', mul: { W: 1.1, R: 0.9, S: 1.0, M: 0.2 } },
        showoff:  { name: '愛現', desc: '愛被看見、愛被誇', mul: { W: 1.0, R: 0.8, S: 1.3, M: 1.0 } },
    };
    // ── 九個怪癖（前四個是後院原本就有的；店員只會抽到 roles 有 cafe 的）──
    const QUIRKS = {
        plant_own:    { name: '種東西不照老闆說的', roles: ['farm'] },
        animal_fear:  { name: '怕動物，不肯進牧場', roles: ['farm'] },
        double_water: { name: '每塊田要澆兩遍', roles: ['farm'] },
        dog_chat:     { name: '一上班先跟狗聊很久', roles: ['farm'] },
        pebbles:      { name: '愛撿石頭', roles: ['farm'] },
        sing:         { name: '愛唱歌', roles: ['farm', 'cafe'] },
        hoard:        { name: '偷藏食物', roles: ['farm'] },
        rain_fear:    { name: '怕下雨', roles: ['farm'] },
        clumsy:       { name: '迷糊（容易出包）', roles: ['farm', 'cafe'] },
    };

    // ── 狀態加成表（0.1）：[門檻, {W,R,S,M}]，由高到低找第一個 ≥ 門檻的 ──
    const BANDS = {
        sta:  [[70, { W: 1.0, R: 0.8, S: 1.0, M: 1.0 }], [40, { W: 0.9, R: 1.3, S: 1.0, M: 1.0 }], [20, { W: 0.6, R: 2.0, S: 0.8, M: 1.2 }], [-1, { W: 0.3, R: 3.0, S: 0.5, M: 1.2 }]],
        mood: [[80, { W: 1.15, R: 0.9, S: 1.3, M: 0.7 }], [50, { W: 1, R: 1, S: 1, M: 1 }], [30, { W: 0.95, R: 1.1, S: 0.9, M: 1.2 }], [-1, { W: 0.8, R: 1.2, S: 0.7, M: 1.5 }]],
        fav:  [[80, { W: 1.1, R: 1, S: 1, M: 0.6 }], [40, { W: 1, R: 1, S: 1, M: 1 }], [20, { W: 0.9, R: 1, S: 1, M: 1.3 }], [-1, { W: 0.7, R: 1, S: 1, M: 1.6 }]],
    };
    function band(k, v) { for (const [lo, m] of BANDS[k]) if (v >= lo) return m; return BANDS[k][BANDS[k].length - 1][1]; }

    // ── 記憶（最多 5 筆；同一種再發生只把天數重設滿）──
    const MEM = {
        coworker_fired: { name: '同事被請走', days: 7, mul: { W: 1.1, M: 0.5 } },
        boss_absent:    { name: '老闆好幾天沒來', days: 5, mul: { W: 0.95, R: 1.2, M: 1.3 } },
        praised:        { name: '被誇獎', days: 5, mul: { W: 1.15 } },
        wage_cut:       { name: '被扣薪', days: 7, mul: { W: 0.85, M: 1.3 } },
        gifted:         { name: '老闆請吃東西', days: 5, mul: { W: 1.05 } },
        caught_steal:   { name: '偷吃被抓到', days: 7, mul: { W: 1.05 } },
        scolded:        { name: '被罵', days: 3, mul: { W: 1.05, S: 0.9, M: 1.1 } },
        rude_customer:  { name: '被客人罵', days: 3, mul: { S: 0.8, M: 1.2 } },
        great_review:   { name: '客人給好評', days: 4, mul: { S: 1.2, W: 1.05 } },
    };
    const MEM_MAX = 5;
    const MEM_Q = { rude_customer: -5, great_review: 5 };   // 店員服務分

    // ── 薪水三階（店員）──
    const TIERS = { low: { name: '低', pay: 0.8, fav: -2, mood: -1 }, mid: { name: '平', pay: 1.0, fav: 0, mood: 0 }, high: { name: '高', pay: 1.3, fav: 2, mood: 1 } };

    // ── 數字（小斐第六節那幾個；要調改這裡）──
    const CFG = {
        start: { sta: 80, mood: 55, fav: 50 },
        tiredFrom: 3, tired: 10, tiredFrom2: 5, tired2: 15,   // 連上第 3 天起每班開頭 −10，第 5 天起 −15
        dawnWorked: 40,            // 昨天有上班：清晨體力 +40；沒上班：回滿
        moodPull: 10,              // 清晨心情往 50 靠 10 點
        quitFav: 20, quitMood: 40, quitP: 0.3,   // 好感 <20 且心情 <40 的清晨，30% 想離開；連兩天才真的走
        sulkMood: 30,              // 心情 <30 連兩個清晨＝鬧脾氣日（當天工作 ×0.7）
        bossAbsentDays: 3,
    };

    function newCard(rand, opts) {
        rand = rand || Math.random; opts = opts || {};
        const ids = Object.keys(PERS);
        const pk = opts.pk && PERS[opts.pk] ? opts.pk : ids[Math.floor(rand() * ids.length) % ids.length];
        const role = opts.role || 'cafe';
        const pool = Object.keys(QUIRKS).filter(q => QUIRKS[q].roles.includes(role));
        let quirk = null;
        if (pk === 'quirky' || rand() < 0.15) quirk = pool[Math.floor(rand() * pool.length) % pool.length] || null;
        return { pk, quirk, sta: CFG.start.sta, mood: CFG.start.mood, fav: CFG.start.fav, streak: 0, mem: [], day: null, worked: false, tier: 'mid', sulk: 0, quitWarn: 0 };
    }
    // 舊存檔沒有卡：照勤快、誠實、嘴甜猜一個說得通的個性（舊畫面上的「常請假」→ 偷懶）
    function cardFromStats(stats, seed) {
        const s = stats || {};
        let pk;
        if ((s.dili || 3) <= 2) pk = 'lazy';
        else if ((s.dili || 3) >= 5) pk = 'diligent';
        else if ((s.honest || 3) >= 5) pk = 'honest';
        else if ((s.sweet || 3) >= 5) pk = 'chatty';
        else if ((s.acct || 3) >= 5) pk = 'perfect';
        else pk = ['showoff', 'foodie', 'nightowl', 'timid', 'diligent'][Math.abs(seed || 0) % 5];
        const c = newCard(() => 0.99, { pk });
        return c;
    }
    function normCard(c, stats, seed) {
        const base = c && PERS[c.pk] ? c : cardFromStats(stats, seed);
        const o = Object.assign(newCard(() => 0.99, { pk: base.pk }), base);
        o.sta = clamp(Number(o.sta), 0, 100); o.mood = clamp(Number(o.mood), 0, 100); o.fav = clamp(Number(o.fav), 0, 100);
        if (!TIERS[o.tier]) o.tier = 'mid';
        o.mem = Array.isArray(o.mem) ? o.mem.filter(x => x && MEM[x.id]) : [];
        return o;
    }

    function persMul(c, cat, shift) {
        const p = PERS[c.pk] || PERS.diligent;
        if (c.pk === 'nightowl' && (cat === 'W' || cat === 'R')) {
            const am = shift === 'am';
            return cat === 'W' ? (am ? 0.8 : 1.3) : (am ? 1.3 : 0.8);
        }
        return p.mul[cat] == null ? 1 : p.mul[cat];
    }
    function stateMul(c, cat) { return band('sta', c.sta)[cat] * band('mood', c.mood)[cat] * band('fav', c.fav)[cat]; }
    function memMul(c, cat) { let m = 1; for (const x of c.mem || []) { const d = MEM[x.id]; if (d && d.mul[cat]) m *= d.mul[cat]; } return m; }
    function has(c, id) { return (c.mem || []).some(x => x.id === id); }

    // acts: [{ id, cat, base, ok(條件，可省), mul(單項加成，可省) }]
    function score(c, acts, ctx) {
        ctx = ctx || {};
        const out = [];
        for (const a of acts) {
            if (a.ok === false) continue;
            let s = a.base * persMul(c, a.cat, ctx.shift) * stateMul(c, a.cat) * memMul(c, a.cat) * (a.mul || 1);
            if (a.cat === 'W' && c.sulkToday) s *= 0.7;
            if (s > 0) out.push({ id: a.id, cat: a.cat, s });
        }
        return out;
    }
    function pick(list, rand) {
        rand = rand || Math.random;
        const tot = list.reduce((n, x) => n + x.s, 0);
        if (!tot) return null;
        let r = rand() * tot;
        for (const x of list) { r -= x.s; if (r <= 0) return x; }
        return list[list.length - 1];
    }
    function choose(c, acts, ctx, rand) { return pick(score(c, acts, ctx), rand) || { id: 'idle', cat: 'R', s: 10 }; }

    function bump(c, d) {
        if (!d) return c;
        if (d.sta) c.sta = clamp(Math.round(c.sta + d.sta), 0, 100);
        if (d.mood) c.mood = clamp(Math.round(c.mood + d.mood), 0, 100);
        if (d.fav) c.fav = clamp(Math.round(c.fav + d.fav), 0, 100);
        return c;
    }
    function remember(c, id) {
        const d = MEM[id];
        if (!d) return c;
        c.mem = c.mem || [];
        const cur = c.mem.find(x => x.id === id);
        if (cur) { cur.left = d.days; return c; }
        if (c.mem.length >= MEM_MAX) {
            const w = (x) => { const m = MEM[x.id].mul; return Object.keys(m).reduce((n, k) => n + Math.abs(m[k] - 1), 0); };
            c.mem.sort((a, b) => (a.left - b.left) || (w(a) - w(b)));
            c.mem.shift();
        }
        c.mem.push({ id, left: d.days });
        return c;
    }

    // ── 過清晨：從上次過到 day 為止每天一次（中間沒開也補算，最多補 14 天）──
    //   worked(d)＝那天有沒有上班；bossDay＝老闆最後一次按按鈕是哪天。回傳要寫日記的話（想離開、真的走了）
    function dawn(c, day, o) {
        o = o || {};
        const notes = [];
        if (c.day == null) { c.day = day; return { notes, quit: false }; }
        const from = Math.max(c.day + 1, day - 14);
        let quit = false;
        for (let d = from; d <= day; d++) {
            const workedY = o.worked ? !!o.worked(d - 1) : !!c.worked;
            c.streak = workedY ? (c.streak || 0) + 1 : 0;
            c.sta = workedY ? clamp(c.sta + CFG.dawnWorked, 0, 100) : 100;
            if (c.mood > 50) c.mood = Math.max(50, c.mood - CFG.moodPull); else if (c.mood < 50) c.mood = Math.min(50, c.mood + CFG.moodPull);
            const t = TIERS[c.tier] || TIERS.mid;
            if (workedY) bump(c, { fav: t.fav, mood: t.mood });
            c.mem = (c.mem || []).map(x => ({ id: x.id, left: x.left - 1 })).filter(x => x.left > 0);
            if (o.bossDay != null && d - o.bossDay >= CFG.bossAbsentDays && !has(c, 'boss_absent')) { remember(c, 'boss_absent'); bump(c, { mood: -3 }); }
            c.sulk = c.mood < CFG.sulkMood ? (c.sulk || 0) + 1 : 0;
            c.sulkToday = c.sulk >= 2;
            const want = c.fav < CFG.quitFav && c.mood < CFG.quitMood && (o.rand || Math.random)() < CFG.quitP * (has(c, 'wage_cut') ? 1.5 : 1);
            if (want) { c.quitWarn = (c.quitWarn || 0) + 1; if (c.quitWarn >= 2) { quit = true; break; } notes.push('want_quit'); }
            else c.quitWarn = 0;
            c.worked = false;
        }
        c.day = day;
        return { notes, quit };
    }
    // 開班：連上第 3 天起累
    function shiftStart(c) {
        const n = (c.streak || 0) + 1;
        if (n >= CFG.tiredFrom2) bump(c, { sta: -CFG.tired2 });
        else if (n >= CFG.tiredFrom) bump(c, { sta: -CFG.tired });
        c.worked = true;
    }

    // ── 店員的服務分 Q（0～100）：嘴甜、心情、體力，再加記憶 ──
    function serviceQ(c, sweet) {
        let q = 20 + clamp(sweet || 3, 1, 5) * 10 + (c.mood - 50) * 0.3 + (c.sta - 50) * 0.2;
        for (const x of c.mem || []) q += MEM_Q[x.id] || 0;
        return clamp(Math.round(q), 0, 100);
    }

    // ── 老闆的按鈕（店員、小精靈共用）：回傳一句給日記 ──
    const BOSS = {
        praise: { name: '誇獎' },
        treat:  { name: '請他吃' },
        raise:  { name: '加薪' },
        cut:    { name: '扣薪' },
        scold:  { name: '責備' },
        rest:   { name: '放假一天' },
    };
    function boss(c, act) {
        const wasWarn = c.quitWarn > 0;
        let line = '';
        if (act === 'praise') {
            bump(c, { mood: c.pk === 'showoff' ? 15 : 10, fav: c.pk === 'honest' ? 5 : 3 }); remember(c, 'praised'); line = '被誇獎了，心情變好';
        } else if (act === 'treat') {
            bump(c, { mood: c.pk === 'foodie' ? 25 : 15, sta: 10, fav: 3 }); remember(c, 'gifted'); line = '吃了老闆請的東西，有精神多了';
        } else if (act === 'raise') {
            if (c.tier === 'high') return { ok: false, why: '已經是最高的薪水了' };
            c.tier = c.tier === 'low' ? 'mid' : 'high'; bump(c, { mood: 10, fav: 5 }); line = '加薪了（' + TIERS[c.tier].name + '）';
        } else if (act === 'cut') {
            if (c.tier === 'low') return { ok: false, why: '已經是最低的薪水了' };
            c.tier = c.tier === 'high' ? 'mid' : 'low'; bump(c, { mood: -15, fav: -20 }); remember(c, 'wage_cut'); line = '被扣薪了（' + TIERS[c.tier].name + '），臉色很難看';
        } else if (act === 'scold') {
            bump(c, { mood: -8, fav: -6 }); remember(c, 'scolded'); line = '被罵了一頓';
        } else if (act === 'rest') {
            bump(c, { mood: 10, fav: 3 }); line = '放假一天';
        } else return { ok: false, why: '沒有這個按鈕' };
        if (wasWarn && (act === 'praise' || act === 'raise')) { c.quitWarn = 0; line += '，不想走了'; }
        return { ok: true, line };
    }
    function coworkerFired(c) { bump(c, { mood: -10, fav: -3 }); remember(c, 'coworker_fired'); }

    // 給畫面看的
    function view(c) {
        const p = PERS[c.pk] || PERS.diligent;
        return {
            pers: p.name, persDesc: p.desc, quirk: c.quirk && QUIRKS[c.quirk] ? QUIRKS[c.quirk].name : '',
            sta: c.sta, mood: c.mood, fav: c.fav, tier: (TIERS[c.tier] || TIERS.mid).name,
            mem: (c.mem || []).map(x => ({ name: MEM[x.id].name, left: x.left })), streak: c.streak || 0, quitWarn: c.quitWarn || 0, sulk: !!c.sulkToday,
        };
    }

    return { CATS, PERS, QUIRKS, BANDS, MEM, TIERS, CFG, BOSS, clamp, newCard, cardFromStats, normCard, persMul, stateMul, memMul, has, score, pick, choose, bump, remember, dawn, shiftStart, serviceQ, boss, coworkerFired, view };
});
