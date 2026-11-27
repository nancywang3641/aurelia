// ============================================================
// os_npc_life.js — NPC 在家的生活清單（11-26）
// ------------------------------------------------------------
// 11-26：腳本 NPC 已經有小精靈和書咖兩份工作清單，這支補上生活類。
// 照 11-24 定的做法（大腦一顆共用、清單分開寫）：這支是「在家生活」那份清單，挑事照舊交給 os_npc_brain.js（要排在它後面載入）。
// 只有規則、不碰畫面、不叫模型、不存檔：呼叫端把性格卡和房間交進來，問「現在這個時間他在做什麼」。
//   分數 = 基本分 × 需求（餓、睏、髒、想上廁所、無聊，越高越想做）× 時間（三餐、晚上洗澡睡覺）× 個性 × 大腦的狀態加成，照比例抽。
//   房間裡沒有那件家具就不會挑；那件事隔壁還沒做動作（READY 沒列）也不會挑。
//   房間裡解決不了的需求（沒廚房、沒廁所、沒事做）頂到快受不了，他會「出門一下」（回傳 away: true，畫面自己決定人不在還是站著）。
// 家具名（type）、動作名（kind）跟小人專案的房間工作台同一套（tmp/房產空房間/房間工作台.html 的 CAT、room-furniture.js），
//   房間就是工作台「匯出擺法」那份的 furniture：[{ id, type, parent }]。
// 生活的東西存在卡片的 life 裡（跟著呼叫端的存檔走）：
//   { hunger, sleepy, bladder, dirty, bored, social（11-27 加，舊存檔沒有就從 0 起）, t: 算到哪一分鐘, cur: 正在做的事, hands: 上完廁所還沒洗手, wet: 手還濕的, meal: 飯幾點煮好的, up: 剛起床還沒做的事, brPM: 哪一天睡前刷過牙 }
// 體力、心情用的是大腦卡片上那兩格：睡覺回體力、醒著慢慢掉、睡醒心情往 50 靠。
//   🚨 之後同一張卡又上班又在家（店員回家）：大腦的 dawn 也會回體力、拉心情，兩邊要只留一邊，接的時候再定。
// 時間一律是「第幾分鐘」（NpcLife.clock() 給現在；用故事時間的自己換算），一天從清晨 5 點起算。
// 還沒接任何畫面：等小人專案的房間做好再接。
// 📦 內容包（11-27）：新的事、新動作名、個性偏好、台詞都可以用內容包加進來，不用改這支。
//   NpcLife.addPack(包) 掛上、removePack(id) 拿掉、packs() 列出；check(包) 只驗不掛。內建台詞在 os_npc_life_lines.js（內建包）。
//   包只收資料（數字、名字、台詞），check 會丟掉不認得的欄位、把數字夾在範圍內，所以匯入別人分享的包也不會跑到程式。
//   包裡的事不能跟上面 ACTS 同名（內建那幾件有自己的判斷，包改不到）；同 id 的包再掛一次＝換掉舊的。
//   要多一種「機制」（新的需求、骰子、家具壞掉）才要改這支；用現有需求和家具組出來的新事都只是內容。
//   包的格式：
//     { id, name,
//       acts:  { 事的id: { name, furn: 家具type或陣列, kind: 動作名, cat: 'W'|'R'|'', base, dur, fx: {需求: ±}, card: { sta, mood }, asleep, furnOptional,
//                         fixes: 解決哪個需求（房間有這件事，那個需求就不會逼他出門）,
//                         when: { need: 看哪個需求, min: 至少多少才做, hours: [[從幾點, 到幾點, 倍率]…]（照他自己的作息，夜貓會往後挪）, other: 不在這些時段的倍率 },
//                         pers: { 個性: 倍率 } } },
//       kinds: ['這個包帶來的動作名'…]（畫面做得出來的動作；沒列在 READY 也沒列在這裡的事不會挑）,
//       pers:  { 個性: { 事的id: 倍率 } }（也可以調內建那幾件）,
//       mbti:  { MBTI字母: { 事的id: 倍率 } }（例如 { I: { writeDesk: 1.4 } }：卡片的 MBTI 有 I 就加乘）,
//       lines: [{ topic: 事的id或情境名, pers: 個性或''（通用）或 MBTI 字母, pers2: 雙人時另一位, when: 'start'|'end'|''|情境標籤, text, text2: 雙人時另一位那句,
//                 who: 只給這個角色說（卡片的 who 或 name；玩家替自己的角色寫的台詞，比個性台詞優先） }] }
// ============================================================
(function (root, factory) {
    'use strict';
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.NpcLife = api;
    try { if (typeof window !== 'undefined') { window.NpcLife = api; if (window.parent && window.parent !== window) window.parent.NpcLife = api; } } catch (e) {}
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const DAY = 1440;
    function _brain() {
        let b = root && root.NpcBrain;
        try { if (!b && typeof window !== 'undefined') b = window.NpcBrain || (window.parent && window.parent.NpcBrain); } catch (e) {}
        if (!b) throw new Error('os_npc_life.js 要排在 os_npc_brain.js 後面載入');
        return b;
    }

    // ── 六個需求（0～100，越高越急）：up＝醒著每分鐘漲多少；asleep＝睡著時漲的倍率 ──
    //   跟模擬市民 4 的六格對得上：飢餓＝hunger、精力＝sleepy、膀胱＝bladder、衛生＝dirty、娛樂＝bored、社交＝social
    const NEEDS = {
        hunger:  { name: '餓',       up: 100 / 420,  asleep: 0.4 },   // 7 小時沒吃到頂
        sleepy:  { name: '睏',       up: 100 / 960,  asleep: 0 },     // 醒 16 小時到頂
        bladder: { name: '想上廁所', up: 100 / 300,  asleep: 0.3 },
        dirty:   { name: '髒',       up: 100 / 1440, asleep: 0.5 },   // 一天沒洗到頂
        bored:   { name: '無聊',     up: 100 / 360,  asleep: 0 },
        social:  { name: '想講話',   up: 100 / 720,  asleep: 0 },     // 11-27：醒 12 小時沒跟人說話到頂（一般人一天出門串門一次左右，愛聊的兩次）；房間裡還沒有能解的事，頂到就出門串門子（包可以加 fixes:'social' 的事）
    };
    // 需求多高→多想做：[門檻, 倍率]
    const URGE = [[85, 6], [60, 2.5], [30, 1], [-1, 0.2]];
    function urge(v) { for (const [lo, m] of URGE) if (v >= lo) return m; return 0.2; }
    const LEVEL = [[85, '快受不了'], [60, '很'], [30, '有點'], [-1, '還好']];

    // ── 生活清單 ──
    //   furn＝要哪件家具（陣列＝其中一件就行）；kind＝小人專案那邊的動作名；cat＝交給大腦算個性和狀態的類別（W 該做的事、R 休息；沒寫＝生理需求，不看個性）
    //   dur＝做幾分鐘；fx＝做完需求加減；card＝做完體力心情加減
    const ACTS = {
        sleep:  { name: '睡覺',         furn: 'singleBed',      kind: 'lie',    cat: 'R', base: 10, asleep: true },
        nap:    { name: '躺一下',       furn: 'singleBed',      kind: 'lie',    cat: 'R', base: 4,  dur: 40, asleep: true, fx: { sleepy: -30 }, card: { sta: 8 } },
        cook:   { name: '煮東西',       furn: 'kitchenCounter', kind: 'cook',   cat: 'W', base: 10, dur: 25, fx: { dirty: 2, bored: -15 }, card: { sta: -3 } },
        eat:    { name: '坐下吃飯',     furn: 'diningChair',    kind: 'sit',    base: 10, dur: 20, furnOptional: true, fx: { hunger: -90, bored: -10 }, card: { mood: 1 } },
        snack:  { name: '開冰箱找吃的', furn: 'fridge',         kind: 'fridge', base: 5,  dur: 5,  fx: { hunger: -15 } },
        sit:    { name: '坐著發呆',     furn: 'diningChair',    kind: 'sit',    cat: 'R', base: 4,  dur: 30, fx: { bored: -8 }, card: { sta: 2 } },
        toilet: { name: '上廁所',       furn: 'toilet',         kind: 'toilet', base: 10, dur: 5,  fx: { bladder: -100 } },
        wash:   { name: '洗手',         furn: 'bathSink',       kind: 'wash',   cat: 'W', base: 3,  dur: 2 },
        dry:    { name: '擦手',         furn: 'towelRack',      kind: 'dry',    base: 30, dur: 1 },
        brush:  { name: '刷牙',         furn: 'bathSink',       kind: 'brush',  cat: 'W', base: 8,  dur: 4 },
        shower: { name: '淋浴',         furn: 'bathtub',        kind: 'shower', cat: 'W', base: 8,  dur: 12, fx: { dirty: -100 }, card: { mood: 1 } },
        soak:   { name: '泡澡',         furn: 'bathtub',        kind: 'soak',   cat: 'R', base: 5,  dur: 30, fx: { dirty: -100, sleepy: 8, bored: -10 }, card: { mood: 3, sta: 5 } },
        // 下面三件家具有了、小人還沒有動作（READY 沒列），所以現在不會被挑；隔壁做好動作就把 kind 加進 READY
        read:   { name: '看書',         furn: ['bigBookcase', 'bookshelf'], kind: 'read',  cat: 'R', base: 6, dur: 40, fx: { bored: -60 }, card: { mood: 3 } },
        game:   { name: '打電動',       furn: 'gamingChair',    kind: 'game',   cat: 'R', base: 6,  dur: 60, fx: { bored: -80 }, card: { mood: 5 } },
        dress:  { name: '換衣服',       furn: 'wardrobe',       kind: 'dress',  cat: 'W', base: 8,  dur: 5 },
        idle:   { name: '站著發呆',     kind: null, base: 2, dur: 20 },
        // 房間裡解決不了的需求快受不了：出門解決（away＝人不在房間）
        out:    { name: '出門一下',     kind: null, base: 10, dur: 40, away: true },
    };
    // 小人專案已經做好的動作（11-26 房間工作台有的）
    const READY = ['lie', 'cook', 'fridge', 'sit', 'brush', 'wash', 'dry', 'toilet', 'soak', 'shower'];

    // ── 個性在生活上的偏好（大腦那十種；沒寫＝1）──
    const PERS_LIFE = {
        diligent: { cook: 1.3, brush: 1.2, nap: 0.6 },
        lazy:     { nap: 1.6, sit: 1.4, cook: 0.6, snack: 1.5, shower: 0.7, wash: 0.5 },
        quirky:   { soak: 1.5, idle: 1.5 },
        foodie:   { snack: 2.2, cook: 1.4, eat: 1.2 },
        chatty:   { sit: 1.2, out: 1.3 },
        timid:    { soak: 1.2, out: 0.7 },
        perfect:  { wash: 2, brush: 1.5, shower: 1.4 },
        nightowl: { game: 1.4 },
        honest:   { wash: 1.3 },
        showoff:  { dress: 1.6, shower: 1.3, brush: 1.3 },
    };
    // 個性讓哪個需求漲得快
    const PERS_NEED = { foodie: { hunger: 1.25 }, lazy: { sleepy: 1.15 }, diligent: { bored: 1.2 },
        chatty: { social: 1.5 }, showoff: { social: 1.25 }, timid: { social: 0.7 }, nightowl: { social: 0.7 }, quirky: { social: 0.7 } };
    // 個性的作息往後挪幾分鐘（夜貓晚睡晚起）
    const PERS_SHIFT = { nightowl: 150, lazy: 45, diligent: -30 };
    // 每個需求在房間裡靠哪件事解決（都做不到＝只能出門）、出門的原因
    const NEED_FIX = {
        hunger:  { acts: ['cook', 'snack'],  why: '家裡沒得吃，出門吃' },
        sleepy:  { acts: ['sleep'],          why: '沒有床，出去睡' },
        bladder: { acts: ['toilet'],         why: '房間沒廁所，出去上' },
        dirty:   { acts: ['shower', 'soak'], why: '房間沒得洗，出去洗' },
        bored:   { acts: ['read', 'game'],   why: '太無聊，出門晃晃' },
        social:  { acts: [],                 why: '想找人說話，出門串門子' },
    };

    // ── 數字（要調改這裡）──
    const CFG = {
        rest: 100 / 480,           // 睡覺每分鐘消多少睏（8 小時消完）
        sleepMin: 120, sleepMax: 600,
        wakeHs: 1,                 // 晚上睡的至少睡到清晨 5 點後幾小時（1＝6 點；個性會往後挪）
        sleepSta: 0.9,             // 睡滿 8 小時，體力補回離滿格差距的幾成（睡少照比例）
        awakeSta: 2,               // 醒著每小時掉多少體力
        moodPull: 5,               // 睡醒心情往 50 靠幾點
        snackLow: 0.4,             // 還沒很餓時開冰箱的倍率
        noBrush: 0.25, noBrushLazy: 0.7,   // 睡前還沒刷牙：想睡的分數打幾折
        handsMul: 10,              // 上完廁所：洗手的分數 ×10
        mealMul: 15,               // 飯煮好了：去吃的分數 ×15
        mealCold: 180,             // 飯放幾分鐘沒吃就不算了
        outAt: 85, outAlso: 45, outLeft: 10,   // 解決不了的需求到多少就出門、順便解決到多少以上的、回來剩多少
        grump: 2,                  // 有需求頂到 95 以上：每小時心情 −2（每個需求各算）
        maxGap: 7 * DAY,           // 超過這麼久沒看：只補最近一天
    };

    // ── 🧭 MBTI 當底（11-27，照 Nova 點子.md「補充二」）：卡片有 c.mbti（例如 'INTJ'）就拆成四個字母各自加乘 ──
    //   劇本 AI 本來就熟 MBTI，標四個字母就好，不用教它我們自己的十種個性；十種個性（c.pk）照舊當副標籤疊上去。
    //   沒有 c.pk 只有 MBTI：照 MBTI_PK 自動配一個（ensure 時補）。沒有 c.mbti＝照舊，一點都不變。
    //   need＝需求漲速；acts＝哪些事比較想做；W／R＝該做的事／休息的事整類倍率；fixSocial＝能解想講話的事；mood＝做完事心情加減的幅度；shift＝作息往後挪幾分鐘
    const MBTI = {
        E: { need: { social: 1.4 }, acts: { idle: 0.6, out: 1.3 }, fixSocial: 1.5 },
        I: { need: { social: 0.6 }, acts: { read: 1.4, game: 1.4, soak: 1.4, writeDesk: 1.4, out: 0.6 } },
        S: { acts: { cook: 1.3, eat: 1.3, brewDrink: 1.3, tv: 1.3, napSofa: 1.3, shower: 1.3, idle: 0.5 } },
        N: { acts: { read: 1.4, writeDesk: 1.4, sit: 1.4, idle: 1.4 } },
        T: { mood: 0.7 },
        F: { mood: 1.4 },
        J: { W: 1.5, shift: -30 },
        P: { W: 0.6, R: 1.3, acts: { snack: 1.3, napSofa: 1.5, game: 1.5 }, shift: 60 },
    };
    // 只給 MBTI 時自動配的十種個性（Nova 的 16 型對照表第一欄）
    const MBTI_PK = {
        ISTJ: 'honest', ISFJ: 'diligent', INFJ: 'perfect', INTJ: 'perfect', ISTP: 'lazy', ISFP: 'foodie', INFP: 'timid', INTP: 'nightowl',
        ESTP: 'showoff', ESFP: 'showoff', ENFP: 'chatty', ENTP: 'quirky', ESTJ: 'diligent', ESFJ: 'chatty', ENFJ: 'honest', ENTJ: 'diligent',
    };
    const _mbti = (c) => { const m = String((c && c.mbti) || '').toUpperCase(); return /^[EI][SN][TF][JP]$/.test(m) ? m : ''; };
    function _mbtiNeed(c, k) { let m = 1; for (const x of _mbti(c)) m *= (MBTI[x].need && MBTI[x].need[k]) || 1; return m; }
    function _mbtiAct(c, id, a) {
        let m = 1;
        for (const x of _mbti(c)) {
            const d = MBTI[x];
            m *= (d.acts && d.acts[id]) || 1;
            if (a.cat && d[a.cat]) m *= d[a.cat];
            if (d.fixSocial && a.fixes === 'social') m *= d.fixSocial;
            m *= _or1((PACK_MBTI[x] || {})[id]);
        }
        return m;
    }
    function _mbtiMood(c) { let m = 1; for (const x of _mbti(c)) m *= MBTI[x].mood || 1; return m; }
    function _mbtiShift(c) { let m = 0; for (const x of _mbti(c)) m += MBTI[x].shift || 0; return m; }

    // ── 📦 內容包 ──
    const PACKS = [];                                   // 掛上的順序；內建包排最前
    let PACK_ACTS = {}, PACK_KINDS = [], PACK_PERS = {}, PACK_MBTI = {}, LINES = [];
    function _rebuild() {
        PACK_ACTS = {}; PACK_KINDS = []; PACK_PERS = {}; PACK_MBTI = {}; LINES = [];
        for (const p of PACKS) {
            for (const id of Object.keys(p.acts || {})) PACK_ACTS[id] = p.acts[id];
            for (const k of p.kinds || []) if (!PACK_KINDS.includes(k)) PACK_KINDS.push(k);
            for (const pk of Object.keys(p.pers || {})) {
                const t = PACK_PERS[pk] || (PACK_PERS[pk] = {});
                for (const id of Object.keys(p.pers[pk])) t[id] = (t[id] == null ? 1 : t[id]) * p.pers[pk][id];
            }
            for (const x of Object.keys(p.mbti || {})) {
                const t = PACK_MBTI[x] || (PACK_MBTI[x] = {});
                for (const id of Object.keys(p.mbti[x])) t[id] = (t[id] == null ? 1 : t[id]) * p.mbti[x][id];
            }
            for (const ln of p.lines || []) LINES.push(ln);
        }
    }
    const _own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);   // 「constructor」這種名字不能拿到物件本身的東西
    const _act = (id) => (_own(ACTS, id) && ACTS[id]) || (_own(PACK_ACTS, id) && PACK_ACTS[id]) || null;
    const _ids = () => Object.keys(ACTS).concat(Object.keys(PACK_ACTS));
    const _ready = () => PACK_KINDS.length ? READY.concat(PACK_KINDS.filter(k => !READY.includes(k))) : READY;
    const _or1 = (v) => (typeof v === 'number' ? v : 1);   // 包可以把倍率設成 0（這個個性不做），不能用 || 1
    function _pl(pk, id) {
        const a = _act(id);
        return ((PERS_LIFE[pk] || {})[id] || 1) * _or1((PACK_PERS[pk] || {})[id]) * _or1(a && a.pers && a.pers[pk]);
    }
    function _fixActs(need) {
        const out = NEED_FIX[need].acts.slice();
        for (const id of Object.keys(PACK_ACTS)) if (PACK_ACTS[id].fixes === need) out.push(id);
        return out;
    }

    // 驗包：只留認得的欄位、數字夾在範圍內、字串截長度。回 { ok, pack, warn: [說明…] }
    const RE_ID = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/;
    const _RE_NAME = /^[A-Za-z0-9_-]{1,40}$/;
    const RE_NAME = { test: (v) => typeof v === 'string' && _RE_NAME.test(v) };   // 數字不算名字
    const _num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? clamp(n, lo, hi) : d; };
    const _str = (v, n) => (typeof v === 'string' ? v : v == null ? '' : String(v)).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
    const PKS = Object.keys(PERS_LIFE);
    const _pkOk = (s) => s === '' || PKS.includes(s) || /^[EINSTFJP]$/.test(s);
    function check(raw) {
        const warn = [];
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, pack: null, warn: ['不是內容包'] };
        const id = _str(raw.id, 40);
        if (!RE_ID.test(id)) return { ok: false, pack: null, warn: ['包的 id 要是英文開頭的英數字'] };
        const pack = { id, name: _str(raw.name, 40) || id, acts: {}, kinds: [], pers: {}, mbti: {}, lines: [] };
        const acts = (raw.acts && typeof raw.acts === 'object') ? raw.acts : {};
        for (const aid of Object.keys(acts).slice(0, 200)) {
            const a = acts[aid];
            if (!RE_ID.test(aid) || !a || typeof a !== 'object') { warn.push('事「' + aid + '」格式不對，略過'); continue; }
            if (_own(ACTS, aid)) { warn.push('事「' + aid + '」跟內建的同名，略過'); continue; }
            const furn = Array.isArray(a.furn) ? a.furn.filter(f => RE_NAME.test(f)).slice(0, 5) : (RE_NAME.test(a.furn || '') ? a.furn : null);
            const o = {
                name: _str(a.name, 20) || aid,
                furn: Array.isArray(furn) && !furn.length ? null : furn,
                kind: RE_NAME.test(a.kind || '') ? a.kind : null,
                base: _num(a.base, 0, 30, 4),
                dur: Math.round(_num(a.dur, 1, 600, 20)),
            };
            if (a.cat === 'W' || a.cat === 'R') o.cat = a.cat;
            if (a.asleep === true) o.asleep = true;
            if (a.furnOptional === true) o.furnOptional = true;
            if (NEEDS[a.fixes]) o.fixes = a.fixes;
            if (a.fx && typeof a.fx === 'object') { o.fx = {}; for (const k of Object.keys(a.fx)) if (NEEDS[k]) o.fx[k] = _num(a.fx[k], -100, 100, 0); }
            if (a.card && typeof a.card === 'object') { o.card = {}; for (const k of ['sta', 'mood']) if (a.card[k] != null) o.card[k] = _num(a.card[k], -20, 20, 0); }
            const w = a.when && typeof a.when === 'object' ? a.when : {};
            o.when = { need: NEEDS[w.need] ? w.need : null, min: _num(w.min, 0, 100, 30), other: _num(w.other, 0, 10, 1),
                hours: (Array.isArray(w.hours) ? w.hours : []).slice(0, 6).filter(h => Array.isArray(h) && h.length >= 2).map(h => [_num(h[0], 0, 24, 0), _num(h[1], 0, 24, 24), _num(h[2], 0, 10, 1)]) };
            if (a.pers && typeof a.pers === 'object') { o.pers = {}; for (const pk of Object.keys(a.pers)) if (PKS.includes(pk)) o.pers[pk] = _num(a.pers[pk], 0, 5, 1); }
            pack.acts[aid] = o;
        }
        for (const k of (Array.isArray(raw.kinds) ? raw.kinds : []).slice(0, 100)) if (RE_NAME.test(k) && !pack.kinds.includes(k)) pack.kinds.push(k);
        const mb = (raw.mbti && typeof raw.mbti === 'object') ? raw.mbti : {};
        for (const x of Object.keys(mb)) {
            if (!/^[EINSTFJP]$/.test(x) || !mb[x] || typeof mb[x] !== 'object') continue;
            pack.mbti[x] = {};
            for (const aid of Object.keys(mb[x]).slice(0, 200)) if (RE_ID.test(aid)) pack.mbti[x][aid] = _num(mb[x][aid], 0, 5, 1);
        }
        const pers = (raw.pers && typeof raw.pers === 'object') ? raw.pers : {};
        for (const pk of Object.keys(pers)) {
            if (!PKS.includes(pk) || !pers[pk] || typeof pers[pk] !== 'object') continue;
            pack.pers[pk] = {};
            for (const aid of Object.keys(pers[pk]).slice(0, 200)) if (RE_ID.test(aid)) pack.pers[pk][aid] = _num(pers[pk][aid], 0, 5, 1);
        }
        for (const l of (Array.isArray(raw.lines) ? raw.lines : []).slice(0, 5000)) {
            if (!l || typeof l !== 'object') continue;
            const ln = { topic: _str(l.topic, 30), pers: _str(l.pers, 10), when: _str(l.when, 20), text: _str(l.text, 80) };
            if (!ln.topic || !ln.text || !_pkOk(ln.pers)) continue;
            if (l.pers2 != null) { const p2 = _str(l.pers2, 10); if (_pkOk(p2)) ln.pers2 = p2; }
            if (l.text2) ln.text2 = _str(l.text2, 80);
            if (l.who) ln.who = _str(l.who, 40);
            pack.lines.push(ln);
        }
        return { ok: true, pack, warn };
    }
    function addPack(raw) {
        const r = check(raw);
        if (!r.ok) return r;
        const i = PACKS.findIndex(p => p.id === r.pack.id);
        if (i >= 0) PACKS[i] = r.pack; else PACKS.push(r.pack);
        _rebuild();
        return r;
    }
    function removePack(id) {
        const i = PACKS.findIndex(p => p.id === id);
        if (i < 0) return false;
        PACKS.splice(i, 1); _rebuild();
        return true;
    }
    function packs() { return PACKS.map(p => ({ id: p.id, name: p.name, acts: Object.keys(p.acts).length, kinds: p.kinds.length, lines: p.lines.length })); }

    // 一天從清晨 5 點起算；hs＝從 5 點起過了幾小時（0～24），dn＝第幾天
    function _shift(c) { return (PERS_SHIFT[c.pk] || 0) + _mbtiShift(c); }
    function _hs(c, t) { return ((((t - 300 - _shift(c)) % DAY) + DAY) % DAY) / 60; }
    function _dn(c, t) { return Math.floor((t - 300 - _shift(c)) / DAY); }
    const _in = (h, a, b) => h >= a && h < b;
    // 三餐：6:30～9、11:30～13:30、17:30～20
    function _mealT(hs) { return (_in(hs, 1.5, 4) || _in(hs, 6.5, 8.5) || _in(hs, 12.5, 15)) ? 2 : (hs >= 19 ? 0.2 : 0.5); }
    // 睡覺：23 點後最想睡，白天幾乎不睡
    function _sleepT(hs) { return hs >= 18 ? 3 : hs >= 17 ? 1.5 : hs >= 16 ? 0.4 : hs < 2 ? 1 : hs < 4 ? 0.3 : 0.1; }

    function newLife(c, now) {
        const hs = _hs(c, now);
        return {
            hunger: 50, bladder: 30, bored: 30, social: 30,
            // 第一次看到他：照時間猜一個說得通的睏度（半夜＝11 點睡下、睡到一半；清晨＝剛起床）
            sleepy: hs >= 18 ? clamp(Math.round(100 - (hs - 18) * 60 * CFG.rest), 0, 100) : hs >= 1 ? clamp(Math.round((hs - 1) * 100 / 17), 0, 100) : 5,
            dirty: hs >= 14 ? 60 : 40,
            t: now, cur: null, hands: false, wet: false, meal: 0, grump: 0,
            up: hs < 1 ? { brush: true, dress: true } : {}, brPM: null,
        };
    }
    function ensure(c, now) {
        if (!c.pk && _mbti(c)) c.pk = MBTI_PK[_mbti(c)];   // 只有 MBTI：自動配副標籤（之後可以自己改）
        if (!c.life || typeof c.life.t !== 'number') c.life = newLife(c, now);
        const L = c.life;
        for (const k of Object.keys(NEEDS)) L[k] = clamp(Number(L[k]) || 0, 0, 100);
        if (L.cur && !_act(L.cur.id)) L.cur = null;   // 那件事的包被拿掉了
        if (!L.up || typeof L.up !== 'object') L.up = {};
        return L;
    }

    // 過了 min 分鐘：需求往上漲；有需求頂到底就扣心情
    function _grow(c, min, asleep, away) {
        if (!(min > 0)) return;
        const L = c.life, pn = PERS_NEED[c.pk] || {};
        let maxed = 0;
        if (!asleep) {
            L.tire = (L.tire || 0) + CFG.awakeSta * min / 60;
            const d = Math.floor(L.tire);
            if (d >= 1) { L.tire -= d; _brain().bump(c, { sta: -d }); }
        }
        for (const k of Object.keys(NEEDS)) {
            const d = NEEDS[k];
            L[k] = clamp(L[k] + d.up * (pn[k] || 1) * _mbtiNeed(c, k) * (asleep ? d.asleep : 1) * min, 0, 100);
            if (L[k] >= 95 && !asleep && !away) maxed++;
        }
        if (maxed) {
            L.grump = (L.grump || 0) + maxed * CFG.grump * min / 60;
            const n = Math.floor(L.grump);
            if (n >= 1) { L.grump -= n; _brain().bump(c, { mood: -n }); }
        }
    }

    function _furn(room, want, busy) {
        const list = (room && room.furniture) || [];
        const types = Array.isArray(want) ? want : [want];
        for (const f of list) if (f && types.includes(f.type) && !(busy && busy[f.id])) return f;
        return null;
    }
    function _has(room, type) { return ((room && room.furniture) || []).some(f => f && f.type === type); }
    // 這個需求在這個房間、這個畫面解決得了嗎
    function _fixable(need, room, can) {
        return _fixActs(need).some(id => { const a = _act(id); return (!a.kind || can.includes(a.kind)) && (!a.furn || !!_furn(room, a.furn)); });
    }

    // 這件事現在的倍率和原因；回 null＝現在不會做
    function _mul(id, c, t, room, can) {
        const L = c.life, hs = _hs(c, t), dn = _dn(c, t);
        switch (id) {
            case 'sleep': {
                // 晚上 9 點後才睡；熬到早上還沒睡、或累到快受不了才會白天睡（白天睏了是午睡）
                if (!(hs >= 16 || (hs < 2 && L.sleepy >= 60) || L.sleepy >= 85)) return null;
                if (L.sleepy < 40 && hs < 18) return null;
                let m = urge(L.sleepy) * Math.max(_sleepT(hs), L.sleepy >= 85 ? 1 : 0);
                if (hs >= 15 && L.brPM !== dn && _has(room, 'bathSink')) m *= c.pk === 'lazy' ? CFG.noBrushLazy : CFG.noBrush;
                return { m, why: '睏了' };
            }
            case 'nap':
                if (L.sleepy < 25 || !_in(hs, 6, 13)) return null;   // 11 點～18 點才午睡
                return { m: urge(L.sleepy) * (_in(hs, 8, 11) ? 1.5 : 0.5), why: '有點睏' };
            case 'cook':
                if (L.meal || L.hunger < 50) return null;
                return { m: urge(L.hunger) * _mealT(hs), why: '餓了，煮點東西' };
            case 'eat':
                if (!L.meal) return null;
                return { m: CFG.mealMul * Math.max(1, urge(L.hunger)), why: '飯煮好了' };
            case 'snack':
                if (L.hunger < 50) return null;
                return { m: urge(L.hunger) * (L.meal ? 0.1 : 1) * (L.hunger >= 60 ? 1 : CFG.snackLow), why: L.hunger >= 60 ? '餓了' : '嘴饞' };
            case 'sit': return { m: 1, why: '沒什麼事' };
            case 'toilet':
                if (L.bladder < 45) return null;
                return { m: urge(L.bladder), why: '想上廁所' };
            case 'wash':
                if (L.hands) return { m: CFG.handsMul, why: '剛上完廁所' };
                return (c.pk === 'perfect' && !L.wet) ? { m: 0.05, why: '愛乾淨，再洗一次手' } : null;
            case 'dry': return L.wet ? { m: 1, why: '手還濕的' } : null;
            case 'brush':
                if (L.up.brush) return { m: 6, why: '起床刷牙' };
                if (hs >= 15 && L.brPM !== dn) return { m: 1.5 * (L.sleepy >= 60 ? 3 : 1), why: '睡前刷牙' };
                return null;
            case 'shower':
                if (L.dirty < 55) return null;
                return { m: urge(L.dirty) * (_in(hs, 13, 19) ? 1.6 : hs < 4 ? 1 : 0.4), why: '該洗澡了' };
            case 'soak':
                if (L.dirty < 55) return null;
                return { m: urge(L.dirty) * (_in(hs, 14, 19) ? 1.5 : 0.2), why: '泡個澡' };
            case 'read': return L.bored < 30 ? null : { m: urge(L.bored), why: '找本書看' };
            case 'game': return L.bored < 30 ? null : { m: urge(L.bored) * (hs >= 14 ? 1.5 : 1), why: '想玩一下' };
            case 'dress': return L.up.dress ? { m: 5, why: '起床換衣服' } : null;
            case 'idle': return { m: 1, why: '沒什麼事' };
            case 'out': {
                let m = 0, top = null;
                for (const k of Object.keys(NEED_FIX)) {
                    if (L[k] < CFG.outAt || _fixable(k, room, can)) continue;
                    m += urge(L[k]);
                    if (!top || L[k] > L[top]) top = k;
                }
                return top ? { m, why: NEED_FIX[top].why, need: top } : null;
            }
        }
        const pa = PACK_ACTS[id];
        return pa ? _packMul(pa, L, hs) : null;
    }
    // 包裡的事：看 when 那一格（哪個需求多高才做、哪些時段比較想做）
    function _packMul(a, L, hs) {
        const w = a.when || {};
        let m = 1;
        if (w.need) { if (L[w.need] < w.min) return null; m = urge(L[w.need]); }
        if (w.hours && w.hours.length) {
            const h = (hs + 5) % 24;   // 換回時鐘的幾點（已照他的作息挪過）
            const hit = w.hours.find(([a0, a1]) => a0 <= a1 ? (h >= a0 && h < a1) : (h >= a0 || h < a1));
            m *= hit ? hit[2] : w.other;
        }
        return m > 0 ? { m, why: a.name } : null;
    }

    // 現在能做的事和分數（給畫面除錯看也行）
    function options(c, room, t, opts) {
        opts = opts || {};
        const B = _brain(), can = opts.can || _ready(), out = [];
        const shift = _hs(c, t) < 9 ? 'am' : 'pm';
        for (const id of _ids()) {
            const a = _act(id);
            if (a.kind && !can.includes(a.kind)) continue;
            let f = null;
            if (a.furn) { f = _furn(room, a.furn, opts.busy); if (!f && !a.furnOptional) continue; }
            const r = _mul(id, c, t, room, can);
            if (!r || !(r.m > 0)) continue;
            const pl = _pl(c.pk, id) * _mbtiAct(c, id, a);
            const bm = a.cat ? B.persMul(c, a.cat, shift) * B.stateMul(c, a.cat) * B.memMul(c, a.cat) : 1;
            const s = a.base * r.m * pl * bm;
            if (s > 0) out.push({ id, cat: a.cat || '', s, why: r.why, need: r.need || null, fid: f ? f.id : null, furn: f ? f.type : null });
        }
        return out;
    }
    // 睡多久：照多睏；晚上睡的至少睡到早上
    function _sleepDur(c, t) {
        const hs = _hs(c, t);
        const toWake = hs >= 15 ? (24 + CFG.wakeHs - hs) * 60 : hs < CFG.wakeHs ? (CFG.wakeHs - hs) * 60 : 0;
        // 白天累到倒下去：最多睡三小時，不算過了一夜
        if (hs >= 2 && hs < 16) return Math.round(clamp(c.life.sleepy / CFG.rest, CFG.sleepMin, 180));
        return Math.round(clamp(Math.max(c.life.sleepy / CFG.rest, toWake), CFG.sleepMin, CFG.sleepMax)) + (c.pk === 'lazy' ? 45 : 0);
    }
    function _choose(c, room, t, opts) {
        const list = options(c, room, t, opts);
        const p = _brain().pick(list, opts.rand) || { id: 'idle', why: '沒什麼事', fid: null, furn: null };
        const a = _act(p.id);
        // 沒椅子就站著吃
        const kind = (p.id === 'eat' && !p.fid) ? null : a.kind;
        const dur = (p.id === 'sleep' || (p.id === 'out' && p.need === 'sleepy')) ? _sleepDur(c, t) : a.dur;
        const cur = { id: p.id, kind, fid: p.fid, furn: p.furn, t0: t, until: t + dur, why: p.why };
        if (a.away) cur.away = true;
        return cur;
    }
    // 一件事做完：需求照時間漲、照這件事加減，記下做過什麼
    function _finish(c, cur, room, can) {
        const L = c.life, a = _act(cur.id), B = _brain(), dur = cur.until - cur.t0, dn = _dn(c, cur.t0);
        _grow(c, dur, !!a.asleep, !!a.away);
        const rested = () => B.bump(c, { sta: Math.round((100 - c.sta) * CFG.sleepSta * Math.min(1, dur / 480)) });
        if (cur.id === 'sleep') {
            L.sleepy = clamp(L.sleepy - dur * CFG.rest, 0, 100);
            rested();
            // 睡了一覺醒來：要刷牙換衣服，心情往平常靠
            if (dur >= 240) {
                L.up = { brush: true, dress: true };
                if (c.mood > 50) c.mood = Math.max(50, c.mood - CFG.moodPull); else if (c.mood < 50) c.mood = Math.min(50, c.mood + CFG.moodPull);
            }
        }
        // 出門：房間裡解決不了的那幾個需求在外面解決了（出去睡的連體力一起回）
        if (cur.id === 'out') {
            for (const k of Object.keys(NEED_FIX)) {
                if (L[k] < CFG.outAlso || _fixable(k, room, can || _ready())) continue;
                L[k] = Math.min(L[k], CFG.outLeft);
                if (k === 'sleepy' && dur >= 240) rested();
            }
        }
        for (const k of Object.keys(a.fx || {})) L[k] = clamp(L[k] + a.fx[k], 0, 100);
        if (a.card) {
            const mm = _mbtiMood(c);
            if (mm !== 1 && a.card.mood) {   // T 心情起伏小、F 大；小數留著下次再加（不然 1×0.7、1×1.4 都捨成 1）
                const amt = a.card.mood * mm + (L.moodFrac || 0), give = Math.trunc(amt);
                L.moodFrac = amt - give;
                B.bump(c, Object.assign({}, a.card, { mood: give }));
            } else B.bump(c, a.card);
        }
        // 上完廁所只有下一件事會記得洗手、洗完只有下一件事會記得擦
        if (cur.id !== 'toilet' && cur.id !== 'wash') L.hands = false;
        if (cur.id !== 'wash') L.wet = false;
        if (cur.id === 'toilet') L.hands = true;
        if (cur.id === 'wash') { L.hands = false; L.wet = true; }
        if (cur.id === 'cook') L.meal = cur.until;
        if (cur.id === 'eat') L.meal = 0;
        if (L.meal && cur.until - L.meal > CFG.mealCold) L.meal = 0;
        if (cur.id === 'brush') { if (L.up.brush) L.up.brush = false; else L.brPM = dn; }
        if (cur.id === 'dress') L.up.dress = false;
    }
    function _out(c) {
        const cur = c.life.cur;
        return cur ? Object.assign({ name: _act(cur.id).name }, cur) : null;
    }

    // ── 主要入口：now 這一分鐘他在做什麼 ──
    //   沒看的這段時間照規則補算到 now（超過七天沒看只補最近一天）；opts.log 給一個陣列就把這段做完的事依序放進去
    //   opts.busy＝{ 家具id: true } 別人正在用的；opts.can＝這個畫面做得出來的動作名（預設 READY）；opts.rand＝亂數
    //   回 { id, name, kind, fid, furn, t0, until, why, away }：kind／fid 直接對小人專案的動作和那件家具，t0 是幾分開始的（動作演到哪照 now − t0）
    function at(c, room, now, opts) {
        opts = opts || {};
        const L = ensure(c, now);
        if (now - L.t > CFG.maxGap && !opts.noSkip) c.life = newLife(c, now - DAY);
        const S = c.life;
        // 正在用的家具被搬走：停下來，從現在重新挑
        if (S.cur && S.cur.until > now && S.cur.fid != null && !((room && room.furniture) || []).some(f => f && f.id === S.cur.fid)) {
            _grow(c, Math.max(0, now - S.cur.t0), false); S.t = now; S.cur = null;
        }
        for (let guard = 0; guard < 4000; guard++) {
            if (S.cur && S.cur.until > now) break;
            if (S.cur) {
                _finish(c, S.cur, room, opts.can);
                if (opts.log) opts.log.push(Object.assign({ name: _act(S.cur.id).name }, S.cur));
                S.t = S.cur.until; S.cur = null;
            }
            S.cur = _choose(c, room, S.t, opts);
        }
        return _out(c);
    }
    // 從 from 跑到 to，回這段做過的事（測試、看一整天用）
    function run(c, room, from, to, opts) {
        const o = Object.assign({}, opts || {}, { log: [], noSkip: true });
        if (!c.life || typeof c.life.t !== 'number') c.life = newLife(c, from);
        at(c, room, from, Object.assign({}, o, { log: null }));
        const cur = at(c, room, to, o);
        return { log: o.log, cur };
    }
    // 不做了（被叫走、畫面關掉）：需求照已經過的時間漲，這件事不算做完
    function drop(c, now) {
        const L = c.life;
        if (!L || !L.cur) return;
        const end = Math.max(L.cur.t0, Math.min(now, L.cur.until));
        _grow(c, end - L.cur.t0, false);
        L.t = end; L.cur = null;
    }
    // 💬 挑一句台詞：topic＝事的 id 或情境名（'很餓'、'房東點他'…），opts.phase＝'start'｜'end'｜''（做到一半），
    //   opts.tags＝額外符合的情境標籤（'心情好'、'電燈壞'…），opts.t＝第幾分鐘（給了會自動加「早上」或「晚上」），
    //   opts.partner＝雙人台詞的另一位卡片，opts.rand＝亂數。回 { text, text2 } 或 null（沒有合的句子）。
    //   個性對得上的句子比通用的容易抽到；c.mbti（例如 'INFP'）有的話，MBTI 字母的句子也算對得上。
    function line(c, topic, opts) {
        opts = opts || {};
        const tags = (opts.tags || []).slice();
        if (typeof opts.t === 'number') { const h = (_hs(c, opts.t) + 5) % 24; if (h >= 5 && h < 11) tags.push('早上'); if (h >= 18 || h < 5) tags.push('晚上'); }
        const phase = opts.phase || '';
        const fits = (p, card) => p === '' || (card && p === card.pk) || (p.length === 1 && String((card && card.mbti) || '').toUpperCase().includes(p));
        const pool = [];
        const me = String((c && (c.who || c.name)) || '');
        for (const ln of LINES) {
            if (ln.topic !== topic) continue;
            if (ln.who && ln.who !== me) continue;
            if (!fits(ln.pers, c)) continue;
            if (ln.pers2 != null && !(opts.partner && fits(ln.pers2, opts.partner))) continue;
            const w0 = ln.when;
            const okWhen = w0 === phase || (w0 !== '' && w0 !== 'start' && w0 !== 'end' && tags.includes(w0));
            if (!okWhen) continue;
            let w = ln.pers === '' ? 1 : 3;
            if (ln.who) w *= 6;   // 這個角色自己的台詞最優先
            if (ln.pers2) w *= 2;
            if (w0 && w0 !== phase) w *= 2;
            pool.push([ln, w]);
        }
        if (!pool.length) return null;
        const rnd = opts.rand || Math.random;
        let r = rnd() * pool.reduce((s, x) => s + x[1], 0);
        for (const [ln, w] of pool) { r -= w; if (r <= 0) return { text: ln.text, text2: ln.text2 || null }; }
        const ln = pool[pool.length - 1][0];
        return { text: ln.text, text2: ln.text2 || null };
    }

    // 現在是第幾分鐘（照這台裝置的時間）
    function clock(d) { d = d || new Date(); return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 60000); }
    // 給畫面看的
    function view(c) {
        const L = c.life;
        if (!L) return null;
        const lv = (v) => { for (const [lo, s] of LEVEL) if (v >= lo) return s; return '還好'; };
        return {
            needs: Object.keys(NEEDS).map(k => ({ id: k, name: NEEDS[k].name, v: Math.round(L[k]), level: lv(L[k]) })),
            cur: _out(c),
        };
    }

    return { NEEDS, URGE, ACTS, READY, PERS_LIFE, PERS_NEED, PERS_SHIFT, NEED_FIX, CFG, urge, newLife, ensure, options, at, run, drop, clock, view,
        check, addPack, removePack, packs, line, act: _act, ready: _ready, MBTI, MBTI_PK, pkOfMbti: (m) => MBTI_PK[_mbti({ mbti: m })] || null };
});
