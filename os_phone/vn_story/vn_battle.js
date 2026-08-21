// ----------------------------------------------------------------
// [檔案] vn_battle.js（獨立擴充模組 / 開發中，先在 LAB 驗）
// 職責：VN 回合制戰鬥面板 —— d20 檢定、純本地骰、零 API。
//       對外只有 start(spec, onEnd)：spec 是「這場仗是什麼」，
//       onEnd 收「這場仗的結果」，中間的數字全部關在這支裡面，
//       不進 AVS、不進 DB（結果由呼叫端寫回正文標籤）。
// ⚠️ 與酒館零耦合：不讀 chat、不呼叫 API、不碰 OS_DB。
// ----------------------------------------------------------------
(function () {
    'use strict';

    // ── 內建敵人表（同 vn_fx BUILTINS 的定位：基礎款寫死，之後由世界門擴充）──
    //    dmg:[骰數, 面數, 加值] / spd 影響出手順序 / ac 是被命中的門檻
    //    charge＝蓄力機率。這欄是「防禦」這個按鈕存在的理由：平時擋是虧的（少打一次的損失
    //    永遠大於減傷），只有敵人預告大招那一回合擋才划算——價值來自看懂時機，不是恆定收益。
    const ENEMIES = {
        slime:  { name: '黏液怪',   icon: 'fa-droplet',     hp: 12, ac: 10, atk: 2, dmg: [1, 4, 1],  spd: 0,  charge: 0 },
        goblin: { name: '哥布林',   icon: 'fa-hand-fist',   hp: 14, ac: 13, atk: 4, dmg: [1, 6, 2],  spd: 2,  charge: 0.12 },
        wolf:   { name: '野狼',     icon: 'fa-paw',         hp: 16, ac: 12, atk: 3, dmg: [1, 6, 1],  spd: 4,  charge: 0.1 },
        bandit: { name: '盜賊',     icon: 'fa-user-ninja',  hp: 20, ac: 14, atk: 5, dmg: [1, 6, 3],  spd: 3,  charge: 0.2 },
        golem:  { name: '石魔像',   icon: 'fa-cube',        hp: 36, ac: 16, atk: 6, dmg: [1, 8, 3],  spd: -1, charge: 0.34 },
    };

    // ── 技能表 ── 每招各有專長，不是「傷害更大的攻擊」：
    //    連擊吃低防禦、破防吃高防禦、橫掃吃數量、急救換命。氣力是唯一的取捨來源，
    //    不然最強的那招就會變成從頭按到尾。
    //    builtin＝招式效果寫在引擎裡（連擊打兩次、破防砍防禦這種特殊行為）；
    //    <BattleStart> 帶進來的招走通用 type（單體/群體/回復/削弱），效果由欄位描述。
    const SKILLS = {
        flurry: { name: '連擊', icon: 'fa-wind',        cost: 2, desc: '快攻兩次，每次七成傷害', builtin: 1 },
        pierce: { name: '破防', icon: 'fa-bullseye',    cost: 2, desc: '瞄準破綻，對方防禦減半', builtin: 1 },
        sweep:  { name: '橫掃', icon: 'fa-fan',         cost: 3, desc: '掃向所有敵人，各七成傷害', builtin: 1 },
        mend:   { name: '急救', icon: 'fa-kit-medical', cost: 3, desc: '回復三成體力', builtin: 1 },
    };

    // 技能類型 → 圖標（AI 不知道有哪些圖標可用，所以它只給類型，圖示由這裡配）
    const TYPE_ICON = { '單體': 'fa-khanda', '群體': 'fa-fan', '回復': 'fa-kit-medical', '削弱': 'fa-hand-sparkles' };

    // ── ⚔️ 隊友原型：從旅人的職業/擅長猜他在戰場上是哪種人（純關鍵字，零 API）──
    //    數值刻意比玩家略弱：戰鬥的主角還是玩家，隊友是「有人跟你並肩」不是代打。
    //    這格是「補師玩家被群毆」的解：入隊的旅人真的上場、真的行動，治療也終於有對象。
    const ALLY_ROLES = {
        striker: { hp: 24, ac: 12, atk: 5, dmg: [1, 8, 2], spd: 4, icon: 'fa-khanda' },
        tank:    { hp: 38, ac: 15, atk: 3, dmg: [1, 6, 1], spd: 1, icon: 'fa-shield-halved' },
        healer:  { hp: 22, ac: 12, atk: 2, dmg: [1, 4, 1], spd: 2, icon: 'fa-kit-medical' },
        fighter: { hp: 28, ac: 13, atk: 4, dmg: [1, 6, 2], spd: 2, icon: 'fa-hand-fist' },
    };
    const ROLE_HINTS = [
        [/醫|治|療|補|癒|藥|救|牧|聖|奶/,        'healer'],
        [/盾|守|坦|衛|鎧|壁|護/,                 'tank'],
        [/刺|斥候|影|弓|獵|快|迅|殺手|狙|攻/,     'striker'],
    ];
    // [Party] 點名的字串跟隊伍名單對得起來就算同一個人。
    //   比對要放寬：模型常寫簡稱（隊伍裡是「艾爾瑟·莫雷」，它只寫「艾爾瑟」），
    //   逐字比對會全部落空 → 明明點名了卻沒人上場，比不點名還難查。
    function _sameName(a, b) {
        a = String(a || '').trim(); b = String(b || '').trim();
        if (!a || !b) return false;
        if (a === b) return true;
        const head = (s) => s.split(/[·・.\s]/)[0];
        if (head(a).length >= 2 && head(a) === head(b)) return true;
        if (a.length >= 2 && b.indexOf(a) >= 0) return true;   // 至少兩個字才做包含比對，不然單字會亂中
        if (b.length >= 2 && a.indexOf(b) >= 0) return true;
        return false;
    }

    function allyRole(text) {
        for (const [re, r] of ROLE_HINTS) if (re.test(String(text || ''))) return r;
        return 'fighter';
    }
    // 呼叫端傳進來的旅人（{name,job,skill}）→ 戰鬥單位。純函式，不碰酒館。
    function allyFromInfo(t) {
        const role = allyRole((t.job || '') + ' ' + (t.skill || ''));
        const a = ALLY_ROLES[role];
        return { name: t.name || '同行者', role: role, icon: a.icon,
                 hp: a.hp, maxHp: a.hp, ac: a.ac, atk: a.atk, dmg: a.dmg.slice(), spd: a.spd };
    }
    // 敵人圖標：從名字猜，猜不到給通用款。純粹是為了不要每隻怪都長一樣
    const FOE_ICON_HINTS = [
        [/狼|獸|犬|虎|熊|貓|鼠/, 'fa-paw'],
        [/龍|蜥|蛇/,             'fa-dragon'],
        [/蟲|蜂|蛛|蟻/,          'fa-bug'],
        [/魚|蟹|章|水母|鮫/,      'fa-fish'],
        [/石|像|傀儡|機|甲|裝置/,  'fa-cube'],
        [/靈|魂|鬼|影|幽|亡/,     'fa-ghost'],
        [/史萊姆|黏|液|泥/,       'fa-droplet'],
        [/火|炎|焰/,             'fa-fire'],
        [/兵|衛|士|騎|將|盜|賊|人|徒|官|師/, 'fa-user-ninja'],
    ];
    function guessIcon(name) {
        for (const [re, ic] of FOE_ICON_HINTS) if (re.test(name)) return ic;
        return 'fa-skull';
    }

    const CHARGE_LV = { '無': 0, '低': 0.12, '中': 0.22, '高': 0.34 };
    const FLEE_LV = { '易': 8, '中': 12, '難': 16 };
    // AI 只說「這是什麼等級的仗」，實際數字由程式對著玩家現況調（見 calibrate）
    //   r      ＝血量池目標（打完全場、我方血量夠挨幾倍）。旁邊的百分比是模擬 4000 場量出來的
    //            「最笨打法」勝率——純攻擊、不用技能不防禦不換目標，也就是勝率下限。
    //   myHit  ＝玩家該打得中的機率下限。這欄是「一排未命中」的解藥：玩家的命中加值是固定的，
    //            AI 卻能把 ac 填到 22（＝15% 命中），而砍血砍傷害補不回打不中——敵人再薄，
    //            打不中就是拖長回合、多挨幾輪。
    //   foeHit ＝敵人打中玩家的機率上限。三隻圍毆時這欄比什麼都重要：一回合三次七成，
    //            等於每回合固定挨兩下。
    const AIM = {
        '輕鬆': { r: 2.0, myHit: 0.70, foeHit: 0.50 },   // 笨打法約九成勝
        '普通': { r: 1.3, myHit: 0.60, foeHit: 0.58 },   // 笨打法約六成半
        '硬仗': { r: 1.1, myHit: 0.52, foeHit: 0.65 },   // 笨打法五五波，會用招才穩贏
        '絕望': { r: 0.9, myHit: 0.45, foeHit: 0.72 },   // 笨打法約三成，逃跑是正解
    };

    const DEFAULT_PLAYER = { name: '你', maxHp: 34, hp: 34, ac: 13, atk: 4, dmg: [1, 8, 3], spd: 3,
                             maxSp: 6, sp: 4, skills: ['flurry', 'pierce', 'sweep', 'mend'] };

    // 節奏：每一步都要看得見，快了像作弊、慢了像卡住
    const T_DICE = 1050,      // 骰子動畫全長
          T_RESOLVE = 600,    // 骰子飛出去到結算的空檔（要夠久：骰子定格在 340ms，太早接手就看不清擲了幾點）
          T_NEXT = 620,       // 結算完到換下一位
          T_FOE_THINK = 560;  // 敵人「思考」的停頓

    const S = {
        root: null, host: null, onEnd: null,
        me: null, foes: [], allies: [], order: [], oi: 0,
        round: 1, target: null, busy: false, over: false,
        log: [], skills: null, fleeDC: 12, notes: [], gen: 0,
    };
    // 我方全員（玩家＋還站著的隊友）：敵人選目標、治療選對象都看這份
    const partyAlive = () => [S.me].concat(S.allies).filter(u => u && !u.dead);

    // ================================================================
    //  <BattleStart> 解析：AI 開場配一次數值，這裡負責讀懂它、擋住離譜值
    // ================================================================
    //  合法上下限。ac 是唯一會讓戰鬥「打不完」的欄位（玩家 d20+atk 有天花板），夾得最緊。
    //   mcXxx＝玩家自己的上下限，夾得比敵人窄：玩家的命中加值是整個系統的基準線，
    //   它一往上跑，敵人的 ac 就得跟著疊高才有挑戰，而 ac 一高就回到「一排未命中」那個老問題。
    const LIM = { hp: [1, 999], ac: [5, 22], atk: [0, 15], cost: [0, 9],
                  mcHp: [12, 80], mcAc: [8, 18], mcAtk: [0, 8],
                  dn: [1, 10], ds: [2, 100], db: [-5, 40] };
    const clamp = (v, [lo, hi], dft) => {
        const n = Number(v);
        return isNaN(n) ? dft : Math.min(hi, Math.max(lo, Math.round(n)));
    };

    const avgOf = ([n, s, b]) => n * (s + 1) / 2 + b;
    //  單項夾完還是可能組出 10d100（平均 505，一擊清場），所以再夾一次「期望值」
    function capDice(spec, maxAvg) {
        let out = spec.slice();
        for (let i = 0; i < 8 && avgOf(out) > maxAvg; i++) {
            const k = maxAvg / avgOf(out);
            out = [out[0], Math.max(2, Math.round(out[1] * k)), Math.max(0, Math.round(out[2] * k))];
            // 面數已經縮到底(d2)還超標＝骰數才是瓶頸（10d2 最少也有 15 點），連骰數一起減
            if (out[1] <= 2 && out[0] > 1 && avgOf(out) > maxAvg) out[0] = Math.max(1, Math.floor(out[0] * k));
        }
        return out;
    }

    // "2d6+3" / "1d8" / "d4-1" → [骰數, 面數, 加值]。AI 對這語法極熟，比拆三個欄位穩。
    function parseDice(str, dft) {
        const m = String(str || '').match(/(\d*)\s*d\s*(\d+)\s*([+-]\s*\d+)?/i);
        if (!m) {
            const flat = Number(str);   // 只給一個數字＝固定傷害，當成 1d1+(n-1)
            if (isNaN(flat)) return { spec: (dft || [1, 6, 0]), bad: String(str || '') !== '' };
            return { spec: [1, 1, clamp(flat - 1, [0, LIM.db[1]], 0)] };
        }
        const raw = [clamp(m[1] || 1, LIM.dn, 1), clamp(m[2], LIM.ds, 6),
                     clamp((m[3] || '0').replace(/\s/g, ''), LIM.db, 0)];
        const spec = capDice(raw, 60);
        return { spec: spec, capped: spec.join() !== raw.join() };
    }
    const diceTxt = ([n, s, b]) => n + 'd' + s + (b > 0 ? '+' + b : b < 0 ? b : '');
    // ['哥布林','哥布林','頭目'] → '哥布林×2、頭目'
    function tally(names, sep) {
        const c = new Map();
        (names || []).forEach(n => c.set(n, (c.get(n) || 0) + 1));
        return [...c].map(([n, k]) => n + (k > 1 ? '×' + k : '')).join(sep || '、');
    }
    // 難度校準要雙向：capDice 只會往下壓，敵人太弱時得往上加（加在固定值上，骰子的波動範圍不動）
    function scaleDice(spec, k) {
        const target = avgOf(spec) * k;
        if (k <= 1) return capDice(spec, target);
        return [spec[0], spec[1], clamp(spec[2] + Math.round(target - avgOf(spec)), LIM.db, spec[2])];
    }

    // 一行 [Tag|第一欄|k=v|k=v…] → { tag, name, k:v… }。漏欄位不連鎖崩掉，找不到就套預設。
    function parseLine(line) {
        const m = String(line).trim().match(/^\[([A-Za-z]+)\|([\s\S]*)\]$/);
        if (!m) return null;
        const out = { tag: m[1].toLowerCase(), name: '' };
        m[2].split('|').forEach((seg, i) => {
            seg = seg.trim();
            const kv = seg.match(/^([A-Za-z_]+)\s*=\s*([\s\S]*)$/);
            if (kv) out[kv[1].toLowerCase()] = kv[2].trim();
            else if (i === 0) out.name = seg;
            else if (!out._extra) out._extra = seg;   // 沒鍵名的多餘欄位：留著當備註，不猜它是什麼
        });
        return out;
    }

    function parseSpec(text) {
        const spec = { enemies: [], skills: [], allies: [], field: null, notes: [], party: null, mc: null };
        String(text || '').split(/\r?\n/).forEach((raw) => {
            const p = parseLine(raw);
            if (!p) return;
            if (p.tag === 'foe') {
                const hp = clamp(p.hp, LIM.hp, 12);
                const ac = clamp(p.ac, LIM.ac, 12);
                const atk = clamp(p.atk, LIM.atk, 3);
                if (String(p.ac || '') && ac !== Math.round(Number(p.ac)))
                    spec.notes.push(p.name + ' 的防禦 ' + p.ac + ' 夾到 ' + ac);
                if (String(p.hp || '') && hp !== Math.round(Number(p.hp)))
                    spec.notes.push(p.name + ' 的血量 ' + p.hp + ' 夾到 ' + hp);
                const want = Math.max(1, parseInt(p.count, 10) || 1);
                const n = Math.min(6, want);
                if (want > n) spec.notes.push(p.name + ' 要 ' + want + ' 隻，只放 ' + n + ' 隻（畫面排不下）');
                const dice = parseDice(p.dmg, [1, 6, 1]);
                if (dice.bad) spec.notes.push(p.name + ' 的傷害「' + p.dmg + '」看不懂，用預設 ' + diceTxt(dice.spec));
                if (dice.capped) spec.notes.push(p.name + ' 的傷害 ' + p.dmg + ' 太高，壓成 ' + diceTxt(dice.spec));
                for (let i = 0; i < n; i++) {
                    spec.enemies.push({
                        name: p.name || '無名怪物', icon: guessIcon(p.name || ''),
                        hp: hp, ac: ac, atk: atk, dmg: dice.spec,
                        spd: clamp(p.spd, [-5, 10], 1),
                        charge: CHARGE_LV[p.charge] != null ? CHARGE_LV[p.charge] : 0.12,
                        tagNo: n > 1 ? String.fromCharCode(65 + i) : '',
                    });
                }
            } else if (p.tag === 'skill') {
                const type = ['單體', '群體', '回復', '削弱'].includes(p.type) ? p.type : '單體';
                // 回復量也要夾：heal=9999% 會變成每回合一鍵回滿，戰鬥就結束不了
                let heal = null;
                if (p.heal != null) {
                    const pctM = String(p.heal).match(/^\s*(\d+(?:\.\d+)?)\s*%/);
                    heal = pctM ? Math.min(100, Math.max(1, parseFloat(pctM[1]))) + '%'
                                : String(clamp(p.heal, [1, 999], 10));
                    if (String(heal) !== String(p.heal).trim())
                        spec.notes.push((p.name || '回復招') + ' 的回復量 ' + p.heal + ' 夾到 ' + heal);
                }
                const sdice = type === '回復' ? null : parseDice(p.dmg, [1, 6, 2]);
                if (sdice && sdice.capped) spec.notes.push((p.name || '招式') + ' 的傷害 ' + p.dmg + ' 太高，壓成 ' + diceTxt(sdice.spec));
                spec.skills.push({
                    key: 'ai_' + spec.skills.length, name: p.name || '無名招式',
                    icon: TYPE_ICON[type] || 'fa-wand-sparkles', type: type,
                    cost: clamp(p.cost, LIM.cost, 2),
                    dmg: sdice ? sdice.spec : null,
                    heal: heal,
                    desc: p.desc || ({ '單體': '單體攻擊', '群體': '掃向所有敵人',
                                       '回復': '回復體力', '削弱': '使目標失衡' }[type]),
                });
            } else if (p.tag === 'ally') {
                // 劇情裡臨時助拳的 NPC（[Ally|名|role=…|hp=…]）。入隊旅人不用寫——程式會自動上場。
                const role = allyRole(p.role || p.name || '');
                const base = ALLY_ROLES[role];
                const dice = parseDice(p.dmg, base.dmg);
                const hp = clamp(p.hp, LIM.hp, base.hp);
                spec.allies.push({ name: p.name || '同行者', role: role, icon: base.icon,
                    hp: hp, maxHp: hp, ac: clamp(p.ac, LIM.ac, base.ac),
                    atk: clamp(p.atk, LIM.atk, base.atk), dmg: dice.spec,
                    spd: clamp(p.spd, [-5, 10], base.spd) });
            } else if (p.tag === 'mc') {
                // 玩家這一場的身手：職業、裝備、傷勢、有沒有被綁住，都靠這行反映。
                // 🚨命中加值(atk)夾得比敵人窄得多：玩家的 atk 是整個系統的基準線，
                //   它一高，敵人的 ac 就得跟著往上疊才有挑戰，而 ac 一高就回到「一排未命中」。
                const dice = parseDice(p.dmg, DEFAULT_PLAYER.dmg);
                if (dice.bad) spec.notes.push('你的傷害「' + p.dmg + '」看不懂，用預設 ' + diceTxt(dice.spec));
                // 玩家單擊的平均上限比敵人低得多：這個數字是校準敵人血量的分母，
                //   一膨脹，敵人就得跟著被灌成幾百血才撐得住一回合，數字全部失去手感。
                let mcDmg = dice.spec;
                if (avgOf(mcDmg) > 14) {
                    const was = diceTxt(mcDmg);
                    mcDmg = capDice(mcDmg, 14);
                    spec.notes.push('你的傷害 ' + was + ' 太高，壓成 ' + diceTxt(mcDmg));
                }
                spec.mc = {
                    maxHp: clamp(p.hp, LIM.mcHp, DEFAULT_PLAYER.maxHp),
                    ac:    clamp(p.ac, LIM.mcAc, DEFAULT_PLAYER.ac),
                    atk:   clamp(p.atk, LIM.mcAtk, DEFAULT_PLAYER.atk),
                    dmg:   mcDmg,
                    spd:   clamp(p.spd, [-5, 10], DEFAULT_PLAYER.spd),
                    maxSp: clamp(p.sp, [2, 9], DEFAULT_PLAYER.maxSp),
                };
                ['hp', 'ac', 'atk'].forEach((k) => {
                    const lim = LIM[k === 'hp' ? 'mcHp' : k === 'ac' ? 'mcAc' : 'mcAtk'];
                    const got = k === 'hp' ? spec.mc.maxHp : spec.mc[k];
                    if (String(p[k] || '') && got !== Math.round(Number(p[k])))
                        spec.notes.push('你的' + ({ hp: '體力', ac: '防禦', atk: '命中' })[k] + ' ' + p[k] + ' 夾到 ' + got);
                });
            } else if (p.tag === 'party') {
                // 🚨誰參戰只能由 AI 講。入隊 ≠ 在場，在場 ≠ 動手 ——
                //   程式這端看不出「這一幕跟隊友分頭走了」或「他在旁邊但沒插手」，
                //   猜錯就是把不該在的人擺上戰場，那一幕的劇情當場被砸掉。
                const raw = String(p.name || p._extra || '').trim();
                spec.party = /^(全部|全隊|所有人|all)$/i.test(raw) ? { all: true }
                           : /^(無|沒有|none|-)$/i.test(raw) || !raw ? { names: [] }
                           : { names: raw.split(/[、,，\/|]+/).map(x => x.trim()).filter(Boolean) };
            } else if (p.tag === 'field') {
                spec.field = { name: p.name || '', flee: FLEE_LV[p.flee] != null ? FLEE_LV[p.flee] : 12,
                               aim: AIM[p.difficulty] || AIM[p.aim] || null };
            }
        });
        return spec;
    }

    // ================================================================
    //  正文管線：抽出戰鬥 → 剪掉 AI 自己續寫的戰果 → 打完把結果寫回
    // ================================================================
    //  抽取走白名單（照 <worldfile> 那條的做法）：開標籤取最後一個、缺閉標籤照收，
    //  被 maxtoken 截在一半也還救得回來。
    const RE_OPEN = /<BattleStart>/gi;
    function extractBattle(text) {
        const s = String(text || '');
        let last = -1, m;
        RE_OPEN.lastIndex = 0;
        while ((m = RE_OPEN.exec(s))) last = m.index;
        if (last < 0) return null;
        const afterOpen = s.slice(last + '<BattleStart>'.length);
        const closeAt = afterOpen.search(/<\/BattleStart>/i);
        const body = closeAt >= 0 ? afterOpen.slice(0, closeAt) : afterOpen;
        const endsAt = closeAt >= 0 ? last + '<BattleStart>'.length + closeAt + '</BattleStart>'.length : s.length;
        return { raw: body, start: last, end: endsAt, closed: closeAt >= 0 };
    }

    //  剪掉 </BattleStart> 之後的一切：那段是 AI 沒等結果就自己寫好的戰果，
    //  留著會進歷史，下一輪它讀到自己寫的「主角贏了」跟真實結果打架。
    //  剪完若 <content> 沒閉合要補回去——VN 靠這個收尾渲染（照 void_terminal 那兩處的做法）。
    function cutAfterBattle(text) {
        const hit = extractBattle(text);
        if (!hit) return { text: String(text || ''), cut: '' };
        let head = String(text).slice(0, hit.end);
        const cut = String(text).slice(hit.end);
        const hasOpen = /<content>/i.test(head), hasClose = /<\/content>/i.test(head);
        if (hasOpen && !hasClose) head = head.replace(/\s*$/, '') + '\n</content>';
        return { text: head, cut: cut.trim(), closed: hit.closed };
    }

    //  戰鬥結果寫回：兩段都放 </content> 之後。
    //    敘事句不進 content —— 進去就會被 VN 當旁白播出來，「（戰鬥結果：…）」這種系統味的句子
    //    夾在劇情裡很突兀，而玩家該知道的結算頁已經給過了。它的用途只是讓 AI 下一輪讀得到。
    //    兩段用不同標籤，promptOnly 才能只剝數值、留敘事給 AI。
    function writeResult(text, result) {
        let s = String(text || '');
        // 打完把設定區塊撤掉：留著的話重播這章會再開一次戰鬥視窗，而且那串數值 AI 不需要再看一遍。
        //   這裡打過的事實已經記在下面的結果標籤裡。
        const hit = extractBattle(s);
        if (hit) s = (s.slice(0, hit.start) + s.slice(hit.end))
                      .replace(/\n{3,}/g, '\n\n')
                      .replace(/\n\s*\n(\s*<\/content>)/i, '\n$1');   // 撤掉區塊後留下的空行，別留在收尾前
        s = s.replace(/\s*$/, '');
        // 交棒訊息天生沒收尾（模型照規矩在 </BattleStart> 停筆）：寫回時補上 </content>，
        //   別讓歷史裡留一則沒閉合的正文——模型看多了會學壞。
        if (/<content>/i.test(s) && !/<\/content>/i.test(s)) s += '\n</content>';
        return s + '\n' + VN_Battle.toNarrative(result) + '\n' + VN_Battle.toTag(result);
    }

    // ── 難度校準 ──
    //  AI 配數值時看不到玩家現在多強，配出來常常一面倒。它只負責說「這是什麼等級的仗」，
    //  實際數字在這裡對著玩家當下的血量/命中/輸出調整，並保留敵人之間的相對強弱。
    //  兩段式：先把「打得中／被打中」的機率壓進合理帶，再用血量與傷害調整體強弱。
    //  順序不能反 —— 命中率是後面算強弱比的輸入，先修過才算得準。
    function calibrate(foes, me, aim, allies, notes) {
        if (!foes.length) return null;
        aim = aim || AIM['普通'];   // AI 漏寫 difficulty 也要校準：完全沒校準的那種仗才是會把人輪死的那種
        const hitRate = (ac, atk) => Math.min(0.95, Math.max(0.05, (21 - (ac - atk)) / 20));
        const avg = ([n, s, b]) => n * (s + 1) / 2 + b;

        // ── ① 命中率水位 ──
        //  整組平移而不是逐隻夾平：石魔像本來就該比黏液怪難打中，超標的是整體水位，
        //  不是敵人之間的相對差距。夾平會把 AI 配的強弱層次抹掉。
        const acFor = (hit) => me.atk + 21 - 20 * hit;              // 反解：想要這個命中率，ac 該是多少
        //  單挑放寬：一對一每回合只挨一下，磨得起 ——「這頭目很硬」的手感該留著。
        //  圍毆就不行了，多磨一回合就多挨 n 次，打不中直接滾成必死。
        const myHit = foes.length > 1 ? aim.myHit : aim.myHit - 0.08;
        const avgAc = foes.reduce((a, f) => a + f.ac, 0) / foes.length;
        const acDrop = Math.round(avgAc - acFor(myHit));
        if (acDrop > 0) {
            const hardest = acFor(Math.max(0.35, myHit - 0.15));       // 全場最硬的那隻也要打得中
            foes.forEach((f) => { f.ac = Math.min(hardest, clamp(f.ac - acDrop, LIM.ac, f.ac)); });
            notes.push('敵人防禦整組下調 ' + acDrop + '：你原本平均只有 '
                     + Math.round(hitRate(avgAc, me.atk) * 100) + '% 打得中');
        }
        // 敵人的命中加值同理，方向相反：太高＝你每回合固定挨滿，人數越多越致命。
        const atkFor = (hit) => me.ac - 21 + 20 * hit;
        const avgAtk = foes.reduce((a, f) => a + f.atk, 0) / foes.length;
        const atkDrop = Math.round(avgAtk - atkFor(aim.foeHit));
        if (atkDrop > 0) {
            foes.forEach((f) => { f.atk = clamp(f.atk - atkDrop, LIM.atk, f.atk); });
            notes.push('敵人命中整組下調 ' + atkDrop + '：原本每擊有 '
                     + Math.round(hitRate(me.ac, avgAtk) * 100) + '% 打中你');
        }

        // ── ② 整體強弱 ──
        // ⚔️ 隊友算進強弱比:他們貢獻輸出(六成命中概算)、也用血量幫全隊分攤傷害——
        //    不算的話,帶滿隊友的「硬仗」會被校準成白給
        const mates = allies || [];
        const allyDps = mates.reduce((a, u) => a + avg(u.dmg) * 0.6, 0);
        const allyHp = mates.reduce((a, u) => a + u.hp, 0);
        const myDps = avg(me.dmg) * (foes.reduce((a, f) => a + hitRate(f.ac, me.atk), 0) / foes.length) + allyDps;
        const foeHp = foes.reduce((a, f) => a + f.hp, 0);
        const foeDps = foes.reduce((a, f) => a + avg(f.dmg) * hitRate(me.ac, f.atk), 0);
        const R = foeHp / Math.max(1, myDps);                       // 我方要打幾回合才清場
        // 敵人是一隻一隻倒的，火力隨場上人數遞減 —— 全程總傷害不是「滿編火力 × 全部回合」。
        //   不打這個折，三隻雜兵會被算成滅團級，校準就把牠們砍成一刀一隻的紙片。
        const decay = (foes.length + 1) / (2 * foes.length);
        const incoming = foeDps * R * decay;                        // 打完這場，我方總共要挨多少
        const ratio = (me.hp + allyHp * 0.6) / Math.max(1, incoming);   // 血量池夠挨幾倍(隊友血打六折算,傷害會分攤)
        if (ratio >= aim.r * 0.75 && ratio <= aim.r * 1.5) return null;   // 合理帶：只有真的離譜才動手
        // 血量和傷害各調一半（開根號）：ratio 同時對兩者敏感，全壓在單一項上會把形狀弄壞
        //   —— 只砍血會讓哥布林變成一刀一隻的紙片，只砍傷害則敵人變成打不死的沙包。
        //   下限 0.3：三隻圍毆一個算出來要 0.29，夾在 0.5 等於只修一半 —— 修一半的校準比不修更難查，
        //   因為它照樣回報「已校準」，數字看起來動過了，人還是被輪死。
        const k = Math.min(2, Math.max(0.3, Math.sqrt(ratio / aim.r)));
        foes.forEach((f) => {
            f.hp = f.maxHp = clamp(f.hp * k, LIM.hp, f.hp);
            f.dmg = scaleDice(f.dmg, k);
        });
        const after = ratio / (k * k);
        return { ratio: +ratio.toFixed(2), aim: aim.r, k: +k.toFixed(2), after: +after.toFixed(2) };
    }

    // 流程用的延時一律走這裡：S.gen 是這一場的序號，關閉或重開就 +1，
    //   上一場還排在佇列裡的 nextTurn/結算就自動作廢。少了這道，兩場的鏈會同時操作
    //   同一份 S（模組單例），互相把 busy 踩來踩去，最後整個面板鎖死點不動。
    function later(fn, ms) {
        const g = S.gen;
        return setTimeout(function () { if (g === S.gen) fn(); }, ms);
    }

    // ── 骰子 ──
    const d = (sides) => Math.floor(Math.random() * sides) + 1;
    const rollDmg = (spec, extraDice) => {
        const [n, sides, bonus] = spec;
        let sum = 0;
        for (let i = 0; i < n + (extraDice || 0); i++) sum += d(sides);
        return Math.max(1, sum + bonus);
    };

    // ── DOM 小工具（樣式一律走 class，只有動態幾何才碰 style）──
    function el(tag, cls, html) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (html != null) e.innerHTML = html;
        return e;
    }

    // ================================================================
    //  建面板
    // ================================================================
    //  四條橫帶：順序條 / 舞台 / 戰鬥紀錄 / 你＋行動。
    //  只有舞台那層會換方向（寬＝左右對峙、窄＝上敵下我），其餘三條兩邊共用同一份 DOM。
    function build() {
        const root = el('div', 'vnb-root');
        const bg = el('div', 'vnb-bg');           // 當下那一幕的背景（開場時由 stageBg 填）
        root.appendChild(bg);

        // ① 回合數 + 出手順序
        const top = el('div', 'vnb-top');
        top.appendChild(el('span', 'vnb-round', '第 <b>1</b> 回合'));
        const order = el('div', 'vnb-order');
        top.appendChild(order);
        root.appendChild(top);

        // ② 舞台：敵人卡 / 我方（你＋隊友）/ 骰子 / 結算演出
        const stage = el('div', 'vnb-stage');
        const foes = el('div', 'vnb-foes');
        const side = el('div', 'vnb-side',
              '<div class="vnb-hero-art"><i class="fa-solid fa-user-large"></i></div>'
            + '<div class="vnb-hero-nm"></div>');
        const allies = el('div', 'vnb-allies');   // ⚔️ 隊友列（沒隊友時空著不占位）
        side.appendChild(allies);
        const dice = el('div', 'vnb-dice', '<div class="vnb-d20">20</div><div class="vnb-dcap"></div>');
        const fx = el('div', 'vnb-fx');
        [foes, side, dice, fx].forEach(n => stage.appendChild(n));
        root.appendChild(stage);

        // ③ 戰鬥紀錄
        const log = el('div', 'vnb-log', '<span class="vnb-log-h">戰鬥紀錄</span>');
        root.appendChild(log);

        // ④ 你的狀態 + 行動
        const foot = el('div', 'vnb-foot');
        const me = el('div', 'vnb-me');
        me.innerHTML =
            '<span class="vnb-me-nm"></span>'
          + '<span class="vnb-me-k">體力</span>'
          + '<span class="vnb-me-hp"><span class="vnb-bar"><i></i></span><span class="vnb-me-num"></span></span>'
          + '<span class="vnb-me-k">氣力</span><span class="vnb-sp"></span>'
          + '<span class="vnb-me-k vnb-k-tags">狀態</span><span class="vnb-me-tags"></span>';
        foot.appendChild(me);

        const skills = el('div', 'vnb-skills');   // 技能抽屜（浮在行動列上方，不擋敵人卡＝還能改選目標）
        foot.appendChild(skills);

        // 逃跑的成功率算得出來就寫出來：這顆按鈕的代價是結束整場仗，不能讓人瞎按
        const fleeOdds = Math.round(Math.min(95, Math.max(5, (21 - (S.fleeDC - (S.me ? S.me.spd : 0))) / 20 * 100)));
        const acts = el('div', 'vnb-acts');
        [
            ['attack', 'fa-hand-fist',      '攻擊', ''],
            ['heavy',  'fa-bolt',           '重擊', '難中高傷'],
            ['skill',  'fa-wand-sparkles',  '技能', '耗氣力'],
            ['guard',  'fa-shield-halved',  '防禦', '傷害減半'],
            ['flee',   'fa-person-running', '逃跑', fleeOdds + '% 成功'],
        ].forEach(([act, ic, label, sub]) => {
            const b = el('button', 'vnb-act' + (act === 'flee' ? ' flee' : ''),
                '<i class="fa-solid ' + ic + '"></i><span>' + label + '</span>'
                + (sub ? '<small>' + sub + '</small>' : ''));
            b.type = 'button';
            b.dataset.act = act;
            b.addEventListener('click', () => act === 'skill' ? toggleSkills() : playerAct(act));
            acts.appendChild(b);
        });
        foot.appendChild(acts);
        root.appendChild(foot);

        S.root = root;
        S.el = { order, foes, log, me, acts, dice, skills, allies, stage, fx, bg,
                 round: top.querySelector('.vnb-round b'),
                 heroNm: side.querySelector('.vnb-hero-nm'),
                 meNm: me.querySelector('.vnb-me-nm'),
                 meBar: me.querySelector('.vnb-me-hp'),
                 meBarI: me.querySelector('.vnb-me-hp i'),
                 meNum: me.querySelector('.vnb-me-num'),
                 meSp: me.querySelector('.vnb-sp'),
                 meKTags: me.querySelector('.vnb-k-tags'),
                 meTags: me.querySelector('.vnb-me-tags') };
        return root;
    }

    // ── 敵人卡片：點一下＝選為目標（多隻時才有意義，但一隻也照畫，免得規則不一致）──
    function renderFoes() {
        S.el.foes.innerHTML = '';
        S.foes.forEach((f) => {
            const card = el('div', 'vnb-foe' + (f.dead ? ' dead' : '') + (S.target === f ? ' target' : '')
                                            + (f.charging ? ' charging' : ''));
            card.innerHTML =
                (f.charging ? '<span class="vnb-cmark"><i class="fa-solid fa-triangle-exclamation"></i> 蓄力中</span>' : '')
              + '<span class="vnb-tmark"><i class="fa-solid fa-crosshairs"></i></span>'
              + '<i class="vnb-foe-ic fa-solid ' + f.icon + '"></i>'
              + '<div class="vnb-foe-nm">' + f.name + (f.tagNo ? '<span>' + f.tagNo + '</span>' : '') + '</div>'
              + '<div class="vnb-bar"><i></i></div>'
              + '<div class="vnb-foe-hp">' + Math.max(0, f.hp) + ' / ' + f.maxHp + '</div>';
            card.querySelector('.vnb-bar i').style.width = Math.max(0, f.hp / f.maxHp * 100) + '%';
            card.addEventListener('click', () => {
                if (S.busy || S.over || f.dead) return;
                S.target = f; renderFoes();
            });
            f.el = card;
            S.el.foes.appendChild(card);
        });
    }

    // ⚔️ 隊友列：一人一張小卡（名字＋血條）。倒下就灰掉,不移除——「他倒在那裡」是戰況的一部分
    function renderAllies() {
        if (!S.el || !S.el.allies) return;
        S.el.allies.innerHTML = '';
        S.allies.forEach((a) => {
            const card = el('div', 'vnb-ally' + (a.dead ? ' dead' : ''));
            card.innerHTML =
                '<i class="fa-solid ' + a.icon + '"></i>'
              + '<span class="vnb-ally-nm">' + a.name + '</span>'
              + '<span class="vnb-bar"><i></i></span>'
              + '<span class="vnb-ally-hp">' + Math.max(0, a.hp) + '</span>';
            card.querySelector('.vnb-bar i').style.width = Math.max(0, a.hp / a.maxHp * 100) + '%';
            a.el = card;
            S.el.allies.appendChild(card);
        });
    }

    function renderMe() {
        const m = S.me;
        S.el.meNm.textContent = m.name;
        S.el.heroNm.textContent = m.name;
        const pct = Math.max(0, m.hp / m.maxHp * 100);
        S.el.meBarI.style.width = pct + '%';
        S.el.meBar.classList.toggle('low', pct <= 33);
        S.el.meNum.textContent = Math.max(0, m.hp) + ' / ' + m.maxHp;
        // 氣力用點點不用數字：要一眼看出「還夠不夠放那招」，數字得先減一次
        let sp = '';
        for (let i = 0; i < m.maxSp; i++) sp += '<i class="' + (i < m.sp ? 'on' : '') + '"></i>';
        S.el.meSp.innerHTML = sp;
        const tags = m.guard ? '<span class="vnb-tag"><i class="fa-solid fa-shield-halved"></i> 防禦姿態</span>' : '';
        S.el.meTags.innerHTML = tags;
        // 沒有狀態時連「狀態」兩個字一起收掉 —— 光留一個空欄位比不顯示還費解
        S.el.meKTags.style.display = tags ? '' : 'none';
        S.el.meTags.style.display = tags ? '' : 'none';
    }

    // ── 結算演出：骰子落定後，這一擊的結果放大講一次 ──
    //  只演玩家自己的行動。敵人與隊友照舊走飄字＋日誌：一回合五個人各彈一次大數字，
    //  「這一下是我打的」就沒有份量了。
    function showFx(big, text, cls) {
        if (!S.el || !S.el.fx) return;
        const fx = S.el.fx;
        // 骰子讓位：兩個演出共用舞台正中，靠接力而不是並排 —— 並排在窄畫面根本擺不下
        if (S.el.dice) S.el.dice.className = 'vnb-dice out';
        fx.innerHTML = '<div class="vnb-fx-n">' + big + '</div>'
                     + '<div class="vnb-fx-t">' + text + '</div>';
        fx.className = 'vnb-fx show' + (cls ? ' ' + cls : '');
        const g = S.gen;
        clearTimeout(S._fxT);
        S._fxT = setTimeout(function () { if (g === S.gen) fx.className = 'vnb-fx'; }, 1500);
    }

    //  背景：借當下那一幕的 VN 背景（只取圖，不連立繪對話框一起透出來）。
    //  拿不到就是純色底，不是錯誤——開場白那種還沒生成背景的場合本來就沒有圖。
    function stageBg(el) {
        try {
            const src = document.getElementById('game-bg');
            if (!src || !el) return;
            const img = getComputedStyle(src).backgroundImage;
            // 直接設 style，不走 CSS 自訂屬性：背景可能是 dataURL，大圖塞進變數會被靜靜丟掉
            if (img && img !== 'none') el.style.backgroundImage = img;
        } catch (e) {}
    }

    // ── 技能抽屜 ──
    function closeSkills() { S.el.skills.classList.remove('open'); }
    function toggleSkills() {
        if (S.busy || S.over) return;
        const box = S.el.skills;
        if (box.classList.contains('open')) { closeSkills(); return; }
        box.innerHTML = '';
        Object.keys(S.skills || {}).forEach((key) => {
            const sk = S.skills[key]; if (!sk) return;
            const afford = S.me.sp >= sk.cost;
            const b = el('button', 'vnb-skill' + (afford ? '' : ' poor'),
                  '<i class="fa-solid ' + sk.icon + '"></i>'
                + '<span class="vnb-sk-nm">' + sk.name + '</span>'
                + '<span class="vnb-sk-ds">' + sk.desc + '</span>'
                + '<span class="vnb-sk-cost">' + sk.cost + '</span>');
            b.type = 'button';
            b.disabled = !afford;
            b.addEventListener('click', () => useSkill(key));
            box.appendChild(b);
        });
        box.classList.add('open');
    }

    function renderOrder() {
        S.el.order.innerHTML = '';
        S.order.forEach((u, i) => {
            const chip = el('div', 'vnb-ochip' + (i === S.oi ? ' now' : '') + (u.dead ? ' dead' : ''),
                '<i class="fa-solid ' + (u.side === 'me' ? 'fa-user' : u.icon) + '"></i>' + u.name);
            S.el.order.appendChild(chip);
        });
        S.el.round.textContent = S.round;
    }

    function say(html, cls) {
        const line = el('div', 'vnb-li' + (cls ? ' ' + cls : ''), html);
        S.el.log.appendChild(line);
        S.el.log.scrollTop = S.el.log.scrollHeight;
        S.log.push(String(html).replace(/<[^>]+>/g, ''));
    }

    function actsEnabled(on) {
        S.el.acts.querySelectorAll('.vnb-act').forEach(b => { b.disabled = !on; });
    }

    // ── 骰子浮層：d20 的數字要看得見，這是這套玩法的靈魂 ──
    function showDice(v, caption) {
        const dice = S.el.dice;
        // 上一擊的結算讓位：骰子跟結算數字同時在畫面上，會被讀成同一件事
        //   （敵人擲出 1，旁邊還留著你上一擊的「命中，9 點傷害」＝看起來像擲 1 也能打中）
        if (S.el.fx) S.el.fx.className = 'vnb-fx';
        dice.className = 'vnb-dice show' + (v === 20 ? ' c20' : v === 1 ? ' c1' : '');
        dice.querySelector('.vnb-d20').textContent = v;
        dice.querySelector('.vnb-dcap').textContent = caption || '';
        // 重播動畫：先抽掉 class 強制 reflow，否則連續兩次同結果不會再跑
        void dice.offsetWidth;
        dice.className = 'vnb-dice show' + (v === 20 ? ' c20' : v === 1 ? ' c1' : '');
        setTimeout(() => { dice.className = 'vnb-dice'; }, T_DICE);
    }

    function popNum(targetEl, text, cls) {
        if (!targetEl || !S.root) return;
        const r = targetEl.getBoundingClientRect(), rr = S.root.getBoundingClientRect();
        const p = el('div', 'vnb-pop' + (cls ? ' ' + cls : ''), text);
        p.style.left = (r.left - rr.left + r.width / 2) + 'px';
        p.style.top = (r.top - rr.top + 8) + 'px';
        S.root.appendChild(p);
        setTimeout(() => p.remove(), 1000);
    }

    // ================================================================
    //  一次攻擊 = 命中檢定 → 傷害骰
    // ================================================================
    function attackRoll(src, dst, opt) {
        opt = opt || {};
        const nat = d(20);
        const total = nat + src.atk + (opt.hitMod || 0);
        const ac = opt.acMul ? Math.ceil(dst.ac * opt.acMul) : dst.ac;
        const crit = nat === 20;
        const fumble = nat === 1;
        const hit = crit || (!fumble && total >= ac);
        return { nat, total, ac, crit, fumble, hit };
    }

    function applyDamage(src, dst, r, opt) {
        opt = opt || {};
        const dspec = opt.dmgSpec || src.dmg;   // 技能自帶傷害骰時用它的，不用武器的
        let dmg = rollDmg(dspec, (r.crit ? dspec[0] : 0) + (opt.extraDice || 0));
        if (opt.mul) dmg = Math.max(1, Math.round(dmg * opt.mul));
        // 防禦＝這回合受到的傷害砍半。原本做成「AC+4」，實測是負收益：
        //   放棄一次輸出只換到幾點迴避，拖長戰鬥反而多挨打，等於一個永遠不該按的按鈕。
        if (dst.guard) dmg = Math.max(1, Math.ceil(dmg / 2));
        dst.hp -= dmg;
        if (dst.el) {
            dst.el.classList.remove('hurt'); void dst.el.offsetWidth; dst.el.classList.add('hurt');
        }
        popNum(dst.el || S.el.meBar, '-' + dmg, r.crit ? 'crit' : '');
        if (dst.hp <= 0) { dst.hp = 0; dst.dead = true; }
        return dmg;
    }

    // ================================================================
    //  玩家行動
    // ================================================================
    function playerAct(act) {
        if (S.busy || S.over) return;
        const cur = S.order[S.oi];
        if (!cur || cur.side !== 'me') return;
        S.busy = true; actsEnabled(false); closeSkills();
        S.me.guard = false; renderMe();

        if (act === 'flee') {
            const nat = d(20), total = nat + S.me.spd;
            showDice(nat, total >= S.fleeDC ? '逃脫成功' : '沒能脫身');   // 門檻由場地決定（退路被封就難逃）
            later(() => {
                if (total >= S.fleeDC) { say('<b>你</b> 抓住空隙脫離了戰場。', 'sys'); finish('flee'); }
                else { say('<b>你</b> 想跑，但退路被堵住了。', 'miss'); nextTurn(); }
            }, T_DICE * 0.6);
            return;
        }

        if (act === 'guard') {
            // 只減傷、不回血：回血一加上去，低血防禦的淨收益就變正的，
            // 實測會滾成「站著磨三十回合必勝」的無限續航，戰鬥直接沒張力。
            S.me.guard = true;
            renderMe();
            say('<b>你</b> 沉下重心穩住架式。（這回合受到的傷害減半）', 'sys');
            later(nextTurn, T_NEXT);
            return;
        }

        // 攻擊 / 重擊：重擊難命中但多一顆傷害骰
        const heavy = act === 'heavy';
        S.actName = heavy ? '重擊' : '攻擊';   // 結算演出要講「你的什麼命中了」，verb 是動詞短語組不成句
        const t = S.target && !S.target.dead ? S.target : S.foes.find(f => !f.dead);
        if (!t) { finish('win'); return; }
        S.target = t; renderFoes();
        strike(t, { hitMod: heavy ? -4 : 0, extraDice: heavy ? 1 : 0 },
               heavy ? '蓄力一擊砸向' : '揮擊',
               () => later(checkOverThenNext, T_NEXT));
    }

    // ── 玩家的一次揮擊：命中檢定→骰子→結算→日誌。攻擊/重擊/技能全部共用這條 ──
    function strike(t, opt, verb, done) {
        const r = attackRoll(S.me, t, opt);
        if (r.crit && S.beats) S.beats.crits++;
        showDice(r.nat, r.crit ? '會心一擊！' : r.fumble ? '失手' : r.hit ? '命中' : '未命中');
        later(() => {
            const acTxt = opt.acMul ? '（' + r.total + ' vs 防禦 ' + r.ac + '·已破防）' : '（' + r.total + ' vs 防禦 ' + r.ac + '）';
            const act = S.actName || '攻擊';
            const tgtNm = t.name + (t.tagNo || '');
            if (r.hit) {
                const dmg = applyDamage(S.me, t, r, opt);
                showFx(dmg + '<small>DAMAGE</small>',
                       r.crit ? '<b>會心一擊！</b>' + act + '命中<b>' + tgtNm + '</b>'
                              : '你的<b>' + act + '</b>命中<b>' + tgtNm + '</b>',
                       r.crit ? 'crit' : '');
                say('<b>你</b> ' + verb + ' <b>' + t.name + '</b>' + acTxt
                  + (r.crit ? '<br>會心一擊！造成 <em>' + dmg + '</em> 點傷害' : '<br>命中，造成 <em>' + dmg + '</em> 點傷害'),
                  r.crit ? 'crit hit' : 'hit');
                if (opt.stun && !t.dead) { t.stunned = true; say('<b>' + t.name + '</b> 被打亂了節奏，下回合動不了。', 'sys'); }
                renderFoes();
                if (t.dead) say('<b>' + t.name + '</b> 倒下了。', 'dead');
            } else {
                showFx(r.fumble ? '落空' : '未命中',
                       r.fumble ? '你的<b>' + act + '</b>重心一歪'
                                : '你的<b>' + act + '</b>被<b>' + tgtNm + '</b>閃開了',
                       'miss');
                say('<b>你</b> ' + verb + ' <b>' + t.name + '</b>' + acTxt + '<br>'
                  + (r.fumble ? '重心一歪，完全落空。' : '被閃開了。'), 'miss');
            }
            done();
        }, T_RESOLVE);
    }

    // 連續揮擊（連擊/橫掃）：一擊一擊播完再收尾，中途目標死了就跳過
    function strikeSeq(list, i, done) {
        if (i >= list.length) return done();
        const it = list[i];
        if (it.t.dead) return strikeSeq(list, i + 1, done);
        strike(it.t, it.opt, it.verb, () => later(() => strikeSeq(list, i + 1, done), 340));
    }

    // ================================================================
    //  技能
    // ================================================================
    function useSkill(key) {
        const sk = S.skills && S.skills[key];
        if (!sk || S.busy || S.over || S.me.sp < sk.cost) return;
        S.busy = true; actsEnabled(false); closeSkills();
        S.me.guard = false;
        S.me.sp -= sk.cost;
        S.actName = sk.name;
        if (S.beats && S.beats.skills.indexOf(sk.name) < 0) S.beats.skills.push(sk.name);
        renderMe();
        const done = () => later(checkOverThenNext, T_NEXT);

        // ── 回復（內建急救 / AI 的回復型）──
        // ⚔️ 有隊友時治療找「血量比例最低的我方」（含自己）：補師帶隊友,治療才真的有對象
        if (key === 'mend' || sk.type === '回復') {
            const tgt = partyAlive().sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp)[0] || S.me;
            const pct = sk.heal && /%/.test(sk.heal) ? parseFloat(sk.heal) / 100 : null;
            const flat = sk.heal && !/%/.test(sk.heal) ? parseFloat(sk.heal) : null;
            const heal = Math.max(1, Math.round(flat != null && !isNaN(flat) ? flat
                                              : tgt.maxHp * (pct != null && !isNaN(pct) ? pct : 0.3)));
            const before = tgt.hp;
            tgt.hp = Math.min(tgt.maxHp, tgt.hp + heal);
            renderMe(); renderAllies();
            popNum(tgt === S.me ? S.el.meBar : tgt.el, '+' + (tgt.hp - before), 'heal');
            showFx('+' + (tgt.hp - before),
                   '<b>' + sk.name + '</b>　' + (tgt === S.me ? '你回復了體力' : '<b>' + tgt.name + '</b> 回復了體力'),
                   'heal');
            say('<b>你</b> 使出 <b>' + sk.name + '</b>，替 <b>' + (tgt === S.me ? '自己' : tgt.name) + '</b> 回復 <em>'
                + (tgt.hp - before) + '</em> 點體力。', 'sys');
            return done();
        }

        const alive = S.foes.filter(f => !f.dead);
        if (!alive.length) { finish('win'); return; }
        const t = S.target && !S.target.dead ? S.target : alive[0];

        // ── 內建四招：效果是特殊行為，寫在引擎裡 ──
        if (sk.builtin) {
            if (key === 'sweep') {
                say('<b>你</b> 橫著掃出一圈。', 'sys');
                return strikeSeq(alive.map(x => ({ t: x, opt: { mul: 0.7 }, verb: '掃過' })), 0, done);
            }
            S.target = t; renderFoes();
            if (key === 'flurry')
                return strikeSeq([{ t: t, opt: { mul: 0.7 }, verb: '快攻' },
                                  { t: t, opt: { mul: 0.7 }, verb: '追擊' }], 0, done);
            if (key === 'pierce')
                return strike(t, { acMul: 0.5 }, '看準破綻刺向', done);
            return done();
        }

        // ── AI 帶進來的招：效果由 type 決定，傷害用招式自己的骰 ──
        if (sk.type === '群體') {
            say('<b>你</b> 使出 <b>' + sk.name + '</b>。', 'sys');
            return strikeSeq(alive.map(x => ({ t: x, opt: { dmgSpec: sk.dmg }, verb: '轟中' })), 0, done);
        }
        S.target = t; renderFoes();
        if (sk.type === '削弱') {
            // 命中才生效：讓目標下回合動不了。跟「擋下大招」共用 stunned，效果一致好懂
            return strike(t, { dmgSpec: sk.dmg, mul: 0.4, stun: 1 }, '以 ' + sk.name + ' 擾亂', done);
        }
        return strike(t, { dmgSpec: sk.dmg }, '使出 ' + sk.name + ' 命中', done);
    }

    // ================================================================
    //  敵人行動（不做花俏 AI：挑玩家打；這一層之後要擴充也只動這裡）
    // ================================================================
    function foeAct(f) {
        S.busy = true; actsEnabled(false);
        later(() => {
            // 蓄力回合：不出手，只擺出架式並公告 —— 玩家看到這行就知道下一輪該擋
            if (!f.charging && f.charge && Math.random() < f.charge) {
                f.charging = true;
                renderFoes();
                say('<b>' + f.name + '</b> 收力後撤，肌肉繃緊——<b>下一擊會很重</b>。', 'sys');
                later(checkOverThenNext, T_NEXT);
                return;
            }
            const big = !!f.charging;
            f.charging = false;
            // ⚔️ 目標分散到全隊（加權隨機）：坦型最招仇恨、玩家其次、其他人一份——
            //    「只有玩家挨打」是單挑時代的遺產，補師被群毆的根源就在這行。
            const pool = partyAlive();
            const wOf = (u) => u.side === 'me' ? 2 : (u.role === 'tank' ? 3 : 1);
            let sum = 0; pool.forEach(u => { sum += wOf(u); });
            let pick = Math.random() * sum, tgt = pool[0] || S.me;
            for (const u of pool) { pick -= wOf(u); if (pick <= 0) { tgt = u; break; } }
            const isMe = tgt === S.me;
            const r = attackRoll(f, tgt, { hitMod: big ? 2 : 0 });
            showDice(r.nat, r.crit ? '會心一擊！' : r.hit ? '命中' : '未命中');
            later(() => {
                const verb = big ? '全力砸下' : '撲上來';
                const tName = isMe ? '你' : tgt.name;
                // 擋下大招＝敵人失衡，下回合跳過（防禦只有玩家會擺,隊友沒這個動作）
                if (big && isMe && S.me.guard) { f.stunned = true; if (S.beats) S.beats.guardedBig++; }
                if (r.hit) {
                    const dmg = applyDamage(f, tgt, r, { extraDice: big ? f.dmg[0] * 2 : 0 });
                    renderMe(); renderAllies();
                    say('<b>' + f.name + '</b> ' + verb + '向 <b>' + tName + '</b>（' + r.total + ' vs 防禦 ' + r.ac + '）<br>'
                      + (r.crit ? '會心一擊！' : '') + tName + '受到 <em>' + dmg + '</em> 點傷害'
                      + (isMe && S.me.guard ? '（已擋下一半）' : ''),
                      r.crit || big ? 'crit hit' : 'hit');
                    if (!isMe && tgt.dead) { if (S.beats) S.beats.allyDowns.push(tgt.name); say('<b>' + tgt.name + '</b> 撐不住倒下了。', 'dead'); }
                } else {
                    say('<b>' + f.name + '</b> ' + verb + '向 <b>' + tName + '</b>，落空了（' + r.total + ' vs 防禦 ' + r.ac + '）', 'miss');
                }
                if (f.stunned) { renderFoes(); say('你穩穩接下這一擊，<b>' + f.name + '</b> 收勢不及、露出破綻。', 'sys'); }
                later(checkOverThenNext, T_NEXT);
            }, T_RESOLVE);
        }, T_FOE_THINK);
    }

    // ⚔️ 隊友行動（自動,不用玩家指揮）：補型見傷先救,其他人打最弱的敵人補刀
    function allyAct(a) {
        S.busy = true; actsEnabled(false);
        later(() => {
            const hurt = partyAlive().filter(u => u.hp / u.maxHp < 0.6)
                                     .sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp)[0];
            if (a.role === 'healer' && hurt) {
                const heal = Math.max(1, Math.round(hurt.maxHp * 0.22));
                const before = hurt.hp;
                hurt.hp = Math.min(hurt.maxHp, hurt.hp + heal);
                renderMe(); renderAllies();
                popNum(hurt === S.me ? S.el.meBar : hurt.el, '+' + (hurt.hp - before), 'heal');
                say('<b>' + a.name + '</b> 替 <b>' + (hurt === S.me ? '你' : hurt.name) + '</b> 處置傷勢，回復 <em>'
                    + (hurt.hp - before) + '</em> 點體力。', 'sys');
                later(checkOverThenNext, T_NEXT);
                return;
            }
            const alive = S.foes.filter(x => !x.dead);
            if (!alive.length) { later(checkOverThenNext, T_NEXT); return; }
            const t = alive.slice().sort((x, y) => x.hp - y.hp)[0];   // 打最弱的:隊友的價值在收頭,不在搶戲
            const r = attackRoll(a, t);
            showDice(r.nat, a.name + (r.crit ? ' 會心！' : r.hit ? ' 命中' : ' 未命中'));
            later(() => {
                if (r.hit) {
                    const dmg = applyDamage(a, t, r);
                    say('<b>' + a.name + '</b> 攻向 <b>' + t.name + (t.tagNo || '') + '</b>（' + r.total + ' vs 防禦 ' + r.ac + '）<br>'
                      + (r.crit ? '會心一擊！' : '命中，') + '造成 <em>' + dmg + '</em> 點傷害', r.crit ? 'crit hit' : 'hit');
                    renderFoes();
                    if (t.dead) say('<b>' + t.name + (t.tagNo || '') + '</b> 倒下了。', 'dead');
                } else {
                    say('<b>' + a.name + '</b> 攻向 <b>' + t.name + (t.tagNo || '') + '</b>，被閃開了（' + r.total + ' vs 防禦 ' + r.ac + '）', 'miss');
                }
                later(checkOverThenNext, T_NEXT);
            }, T_RESOLVE);
        }, T_FOE_THINK);
    }

    // ================================================================
    //  回合推進
    // ================================================================
    function checkOverThenNext() {
        if (S.me.hp <= 0) { S.me.hp = 0; renderMe(); return finish('lose'); }
        if (S.foes.every(f => f.dead)) return finish('win');
        nextTurn();
    }

    function nextTurn() {
        if (S.over) return;
        let guard = 0;
        do {
            S.oi++;
            if (S.oi >= S.order.length) { S.oi = 0; S.round++; }
            guard++;
        } while (S.order[S.oi].dead && guard < 50);

        renderOrder(); renderFoes(); renderMe(); renderAllies();
        const cur = S.order[S.oi];
        if (cur.stunned) {   // 大招被擋下的那一回合：站著喘，直接跳過
            cur.stunned = false;
            say('<b>' + cur.name + '</b> 還在回身，這回合動不了。', 'sys');
            renderFoes();
            later(nextTurn, T_NEXT);
            return;
        }
        if (cur.side === 'me') {
            S.me.sp = Math.min(S.me.maxSp, S.me.sp + 1);   // 每輪回一點氣力：技能不是無限，但也不會用完就沒得玩
            renderMe();
            S.busy = false; actsEnabled(true);
            if (!S.target || S.target.dead) { S.target = S.foes.find(f => !f.dead) || null; renderFoes(); }
        } else if (cur.side === 'ally') {
            closeSkills();
            allyAct(cur);
        } else {
            closeSkills();
            foeAct(cur);
        }
    }

    // ================================================================
    //  結算：這裡是整支唯一的對外出口，數字到此為止
    // ================================================================
    function finish(outcome) {
        if (S.over) return;
        S.over = true; S.busy = true; actsEnabled(false);

        const killed = S.foes.filter(f => f.dead).map(f => f.name);
        const alive  = S.foes.filter(f => !f.dead).map(f => f.name);
        const hpPct  = S.me.hp / S.me.maxHp;
        // 傷勢只給「程度」，具體怎麼寫留給 AI —— 這一句是要餵回正文的，寫死描述會綁死它的筆
        const wound = outcome === 'lose' ? 'down' : hpPct >= 0.85 ? 'none' : hpPct >= 0.5 ? 'light' : hpPct >= 0.2 ? 'heavy' : 'critical';
        const result = {
            outcome: outcome,                       // win / lose / flee
            rounds: S.round,
            hp: S.me.hp, maxHp: S.me.maxHp,
            wound: wound,
            killed: killed,
            alive: alive,                                          // 還站著的：戰敗敘事要指名是誰打倒你
            escaped: outcome === 'flee' ? alive : [],
            skills: (S.beats && S.beats.skills.slice()) || [],     // 過程重點：橋接句用，AI 靠這些接續
            guardedBig: (S.beats && S.beats.guardedBig) || 0,
            crits: (S.beats && S.beats.crits) || 0,
            // ⚔️ 同行者戰後狀態:寫回正文,AI 才知道誰掛彩誰倒下(倒下=失去意識,生死歸主持人裁定)
            mates: S.allies.map(a => ({ name: a.name, hp: a.hp, maxHp: a.maxHp, down: !!a.dead })),
            log: S.log.slice(),
        };

        const panel = el('div', 'vnb-end');
        const title = outcome === 'win' ? '戰鬥勝利' : outcome === 'lose' ? '力竭倒下' : '脫離戰場';
        const sub = outcome === 'win'
                ? (killed.join('、') + ' 已被擊倒。')
                : outcome === 'lose' ? '你倒在地上，視野開始發黑。'
                : (alive.join('、') + ' 被甩在身後。');
        panel.innerHTML =
            '<div class="vnb-end-t ' + (outcome === 'lose' ? 'lose' : outcome === 'flee' ? 'flee' : '') + '">' + title + '</div>'
          + '<div class="vnb-end-sub">' + sub + '</div>'
          + '<div class="vnb-end-stats">'
          +   '<div class="vnb-st"><b>' + S.round + '</b><span>回合</span></div>'
          +   '<div class="vnb-st"><b>' + S.me.hp + ' / ' + S.me.maxHp + '</b><span>剩餘體力</span></div>'
          +   '<div class="vnb-st"><b>' + killed.length + '</b><span>擊倒</span></div>'
          +   (S.allies.length
                ? '<div class="vnb-st"><b>' + S.allies.filter(a => !a.dead).length + ' / ' + S.allies.length + '</b><span>同行者健在</span></div>'
                : '')
          + '</div>';

        // LAB 觀察窗：把「要寫回正文的東西」攤開給人看（正式模組不掛這塊）
        if (VN_Battle.showWire) {
            const w = el('div', 'vnb-wire');
            w.innerHTML = '<b>寫回正文（刪除線＝ promptOnly 剝掉、只給程式讀）</b>'
                + '<span class="strip">' + esc(VN_Battle.toTag(result)) + '</span><br>'
                + esc(VN_Battle.toNarrative(result));
            panel.appendChild(w);
        }

        const btn = el('button', 'vnb-end-btn', '繼續');
        btn.type = 'button';
        btn.addEventListener('click', () => close(result));
        panel.appendChild(btn);
        S.root.appendChild(panel);
    }

    function esc(s) { return String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }

    function close(result) {
        const cb = S.onEnd, root = S.root;
        S.gen++;            // 作廢這一場還排著的所有延時，免得它們回頭操作下一場的狀態
        S.onEnd = null;
        if (root) { root.classList.add('vnb-out'); setTimeout(() => root.remove(), 340); }
        S.root = null; S.over = true;
        if (cb) { try { cb(result || null); } catch (e) { console.warn('[VN_Battle] onEnd 失敗', e); } }
    }

    // ================================================================
    //  對外
    // ================================================================
    const VN_Battle = {
        ENEMIES: ENEMIES,
        showWire: false,     // LAB 才開：結算頁多一塊「回傳字串」預覽

        _debug: function () {
            const c = S.order[S.oi];
            return { gen: S.gen, oi: S.oi, busy: S.busy, over: S.over, round: S.round,
                     cur: c ? c.name + '/' + c.side + (c.dead ? '(死)' : '') + (c.stunned ? '(失衡)' : '') : null,
                     order: S.order.map(u => u.name + '/' + u.side + (u.dead ? '(死)' : '')),
                     meHp: S.me && S.me.hp, foes: S.foes.map(f => f.name + ':' + f.hp) };
        },
        parse: parseSpec,     // 給呼叫端先看解析結果（LAB 用；正式流程可直接丟 raw）
        // 正文管線三件套：抽出 → 剪掉續寫的戰果（補 </content>）→ 打完寫回
        extract: extractBattle,
        cut: cutAfterBattle,
        writeResult: writeResult,
        diceTxt: diceTxt,     // [1,6,2] → "1d6+2"
        notes: function () { return S.notes.slice(); },   // 這場開打前被夾/被校準了什麼

        // spec = { host, raw:'<BattleStart>…', player:{…} }
        //   raw＝AI 開場配的那份數值，走 parseSpec 讀進來（夾範圍＋難度校準都在裡面）。
        //   也接舊的 enemies:['goblin'] 內建表寫法，LAB 的按鈕還在用。
        start: function (spec, onEnd) {
            spec = spec || {};
            const host = spec.host || document.body;

            if (S.root) { try { S.root.remove(); } catch (e) {} }   // 上一場沒收乾淨就直接拆掉
            S.gen++;        // 新的一場：舊鏈全部作廢（沒這行，兩場的 nextTurn 會搶同一份 S）
            S.foes = []; S.allies = []; S.order = []; S.oi = 0; S.round = 1;
            S.busy = false; S.over = false; S.log = []; S.target = null;
            S.notes = []; S.fleeDC = 12; S.skills = null; S.actName = '';
            S.beats = { skills: [], guardedBig: 0, crits: 0, allyDowns: [] };   // 過程重點：寫回正文的橋接句要用（AI 靠這個接續）
            S.onEnd = onEnd || null; S.host = host;

            let list = spec.enemies || ['goblin'], aiSkills = null, field = null, tagAllies = [], party = null, mcCfg = null;
            if (spec.raw) {
                const p = parseSpec(spec.raw);
                list = p.enemies;
                if (p.skills.length) aiSkills = p.skills;
                field = p.field;
                tagAllies = p.allies || [];
                party = p.party;
                mcCfg = p.mc;
                S.notes = p.notes.slice();
            }

            list.forEach((e) => {
                if (typeof e === 'string' || e.id) {          // 內建表：只給名字
                    const base = ENEMIES[typeof e === 'string' ? e : e.id];
                    if (!base) { console.warn('[VN_Battle] 未知敵人 id:', e); return; }
                    const n = (typeof e === 'object' && e.count) || 1;
                    for (let i = 0; i < n; i++)
                        S.foes.push(Object.assign({}, base, { side: 'foe', maxHp: base.hp, hp: base.hp,
                            dead: false, tagNo: n > 1 ? String.fromCharCode(65 + i) : '' }));
                } else {                                      // 外面帶完整數值進來（AI 配的）
                    S.foes.push(Object.assign({ spd: 1, charge: 0.12, icon: 'fa-skull' }, e,
                        { side: 'foe', maxHp: e.hp, hp: e.hp, dead: false }));
                }
            });
            if (!S.foes.length) { console.warn('[VN_Battle] 沒有有效敵人，取消'); return null; }

            // 玩家：AI 用 [MC] 配這一場的身手（職業、裝備、有沒有帶傷、是不是被綁著），蓋掉那組寫死的預設。
            // 🚨但「還剩幾成血」必須從上一場延續，不能跟著新的 maxHp 一起重置 ——
            //    否則只要這一輪 AI 換了一套數值，上一場打到剩三滴血的傷勢就憑空痊癒了。
            //    所以血量走比例：上一場剩六成，這場就從六成開始。
            const prevHp = spec.player || {};
            S.me = Object.assign({}, DEFAULT_PLAYER, mcCfg || {}, { side: 'me', dead: false });
            if (prevHp.maxHp > 0 && prevHp.hp != null) {
                const pct = Math.max(0, Math.min(1, prevHp.hp / prevHp.maxHp));
                S.me.hp = Math.max(1, Math.round(S.me.maxHp * pct));
                if (mcCfg && prevHp.maxHp !== S.me.maxHp)
                    S.notes.push('體力上限 ' + prevHp.maxHp + ' → ' + S.me.maxHp + '，帶著上一場的 '
                               + Math.round(pct * 100) + '% 血開打');
            } else if (prevHp.hp != null && !mcCfg) {
                S.me.hp = prevHp.hp;   // 沒有 [MC] 也沒有上限資訊＝走舊路徑，行為同以往
            }
            if (S.me.hp == null) S.me.hp = S.me.maxHp;
            S.me.hp = Math.max(1, Math.min(S.me.hp, S.me.maxHp));   // 目前血高於上限＝血條撐爆容器，呼叫端給錯也要擋住
            S.me.sp = Math.max(0, Math.min(S.me.sp == null ? 4 : S.me.sp, S.me.maxSp));
            S.target = S.foes[0];

            // ⚔️ 隊友：<BattleStart> 自己帶了 [Ally|…]（劇情NPC助拳）就用它的，
            //    否則從呼叫端傳進來的入隊旅人裡挑 —— 挑誰由 [Party|…] 決定。
            // 🚨不能把整份入隊名單直接拉上場：入隊 ≠ 這一幕在場，在場 ≠ 這場動手。
            //    分頭行動的那一幕照樣把所有人擺上戰場，等於當場把劇情演爛。
            //    程式端沒有辦法判斷（劇本裡有沒有提到名字也不算數：有人在旁邊但沒參戰），
            //    只有寫 <BattleStart> 的模型知道，所以這件事一定要它明說。
            let mateSrc = spec.allies || [];
            if (!party) {
                if (mateSrc.length) console.warn('[VN_Battle] <BattleStart> 沒寫 [Party|…] → 這場當作沒有隊友（入隊 ' + mateSrc.length + ' 人）');
                mateSrc = [];
            } else if (!party.all) {
                const want = party.names || [];
                mateSrc = mateSrc.filter(m => want.some(n => _sameName(n, m && m.name)));
                const missed = want.filter(n => !(spec.allies || []).some(m => _sameName(n, m && m.name)));
                if (missed.length) S.notes.push('[Party] 點名了不在隊伍裡的人：' + missed.join('、'));
            }
            const allyInfos = tagAllies.length ? tagAllies : mateSrc.map(allyFromInfo);
            S.allies = allyInfos.slice(0, 4).map(a =>
                Object.assign({}, a, { side: 'ally', maxHp: a.maxHp || a.hp, hp: a.hp, dead: false, el: null }));

            // 相對玩家的最後一道：一擊打掉近半血就沒有反應餘地了（蓄力大招是三倍骰，擋下才活得成）。
            //   AI 想做必死的仗該用 difficulty=絕望 表達，而不是靠單擊 500 傷。
            const capAvg = Math.max(3, S.me.maxHp * 0.45);
            S.foes.forEach((f) => {
                if (avgOf(f.dmg) <= capAvg) return;
                const before = diceTxt(f.dmg);
                f.dmg = capDice(f.dmg, capAvg);
                S.notes.push(f.name + ' 單擊 ' + before + ' 對現在的體力太重，壓成 ' + diceTxt(f.dmg));
            });

            // 技能：AI 帶了就用它的，沒帶就給內建那組
            S.skills = {};
            if (aiSkills) aiSkills.forEach(sk => { S.skills[sk.key] = sk; });
            else (S.me.skills || []).forEach(k => { if (SKILLS[k]) S.skills[k] = SKILLS[k]; });

            // 場地：逃跑難度＋難度校準（AI 說等級，數字對著玩家現況調）
            //   校準無條件跑：綁在 [Field] 上的時候，AI 一漏寫這行整場就零校準，
            //   而漏寫最常發生在它忙著配一堆敵人的那種場合——正好是最需要校準的那種。
            if (field) S.fleeDC = field.flee;
            const cal = calibrate(S.foes, S.me, field && field.aim, S.allies, S.notes);
            if (cal) S.notes.push('難度校準：原本強弱比 ' + cal.ratio + '（目標 ' + cal.aim + '）'
                                + ' → 敵人血量與傷害 ×' + cal.k + '，校準後約 ' + cal.after);

            host.appendChild(build());
            stageBg(S.el.bg);      // 背景吃當下那一幕（拿不到就純色底）
            renderFoes(); renderMe(); renderAllies();

            // 先攻：d20 + 敏捷，同分玩家先（讓玩家握有主動權比較好玩）
            S.order = S.foes.concat([S.me]).concat(S.allies).map(u => Object.assign(u, { _init: d(20) + u.spd }));
            S.order.sort((a, b) => (b._init - a._init) || (a.side === 'me' ? -1 : 1));
            S.oi = -1;

            if (field && field.name) say('<b>' + field.name + '</b>', 'sys');
            say('遭遇 <b>' + S.foes.map(f => f.name + (f.tagNo || '')).join('、') + '</b>。', 'sys');
            if (S.allies.length) say('<b>' + S.allies.map(a => a.name).join('、') + '</b> 與你並肩迎敵。', 'sys');
            say('出手順序：' + S.order.map(u => u.name + (u.tagNo || '')).join(' → '), 'sys');
            if (S.notes.length) console.log('[VN_Battle] 開場調整：\n' + S.notes.join('\n'));
            renderOrder();
            actsEnabled(false);
            later(nextTurn, 500);
            return true;
        },

        close: function () { close(null); },

        // 要寫回正文的兩段：tag 給程式讀（會被 promptOnly 剝掉）、narrative 給 AI 讀
        //   同名的合併成「名×數量」：三隻哥布林列三次看起來像壞掉，AI 也會學著那樣寫
        tally: tally,
        toTag: function (r) {
            const parts = ['[BattleResult', r.outcome, 'hp:' + r.hp + '/' + r.maxHp, 'round:' + r.rounds];
            // down 不是 kill：HP 歸零只代表失去戰鬥能力，寫成 kill 模型會以為非死不可，
            //   還得自己開會討論「罪不致死」——生死本來就該由主持人按劇情分寸裁定
            if (r.killed.length) parts.push('down:' + tally(r.killed, '+'));
            if (r.escaped.length) parts.push('left:' + tally(r.escaped, '+'));
            if (r.mates && r.mates.length) parts.push('mates:' + r.mates.map(m => m.name + '@' + m.hp + '/' + m.maxHp).join('+'));
            return parts.join('|') + ']';
        },
        //   這句是 AI 下一輪唯一的戰鬥記憶（假戰果被剪掉了），寫太薄它會沒頭沒尾接不下去，
        //   所以把過程重點也帶上：打了幾回合、用過什麼招、有沒有擋下重擊——給它接續的材料，不是只給輸贏。
        toNarrative: function (r) {
            const w = { none: '毫髮無傷', light: '有些擦傷', heavy: '傷得不輕', critical: '傷勢很重，快撐不住了', down: '被打倒在地' }[r.wound];
            const bits = [];
            if (r.skills && r.skills.length) bits.push('期間使出了' + r.skills.slice(0, 3).join('、'));
            if (r.guardedBig) bits.push('穩穩擋下對方蓄力的重擊');
            if (r.crits) bits.push('打出過會心一擊');
            const mid = bits.length ? '，' + bits.join('，') : '';
            // ⚔️ 同行者也要進戰鬥記憶:誰並肩作戰、誰被打倒(失去意識非死亡),AI 下一輪才接得住
            let mateTxt = '';
            if (r.mates && r.mates.length) {
                const up = r.mates.filter(m => !m.down).map(m => m.name);
                const dn = r.mates.filter(m => m.down).map(m => m.name);
                mateTxt = '；' + (up.length ? tally(up) + '與你並肩作戰' : '')
                        + (dn.length ? (up.length ? '，' : '') + tally(dn) + '在戰鬥中被打倒（失去意識，並未死亡）' : '');
            }
            if (r.outcome === 'win')
                return '（戰鬥結果：與' + tally(r.killed) + '交手了' + r.rounds + '回合' + mid + '，最終將對方擊倒；你' + w + mateTxt + '。）';
            if (r.outcome === 'flee')
                return '（戰鬥結果：與' + tally(r.escaped) + '纏鬥了' + r.rounds + '回合' + mid + '，你抽身甩開對方脫離戰場；' + w + mateTxt + '。）';
            return '（戰鬥結果：與' + (tally(r.alive || []) || tally(r.killed || []) || '對手') + '纏鬥了' + r.rounds + '回合' + mid + '，你力竭被擊倒' + mateTxt + '。）';
        },
    };

    window.VN_Battle = VN_Battle;
    console.log('[VN_Battle] 戰鬥模組就緒（內建敵人', Object.keys(ENEMIES).length, '種）');
})();
