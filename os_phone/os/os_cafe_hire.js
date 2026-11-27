// ----------------------------------------------------------------
// [檔案] os_cafe_hire.js
// 路徑：os_phone/os/os_cafe_hire.js
// 職責：☕🧑‍🍳 書咖員工（10-13 第二版）——貼徵人啟事、應徵者、面試、打電話錄取、早班／晚班店員。
//   玩家出錢，店員上班先看帳備料（10-13 定）；
//   每位店員有五個看不到的數字（看帳、手腳、勤快、嘴甜、誠實），好壞要上班後才看得出來。
//   規則全在這裡照表算、不叫模型；只有「履歷（一批三位一通）」和「面試每問一句一通」叫副模型（名冊 cafe_hire）。
//   店員上班、備料、補貨、薪水在 os_cafe.js 的結算裡跟客人照時間交錯跑（crewSession），這樣後面的客人買得到他剛備的料。
//   資料在 app_data book_cafe 的 staff2（舊的 staff 是小機值班，不碰）。設計書 docs/superpowers/specs/2026-10-13-cafe-staff-hiring-design.md（只在本機）。
// ⚠️ 排在 os_cafe.js 後面載入；寫 staff2、扣書咖帳戶一律走 OS_CAFE._b.locked（跟結算同一條排隊）
// 🧠 11-24 接共用大腦（os_npc_brain.js，要排在這支前面）：每位店員多一張性格卡 m.brain（個性、怪癖、體力、心情、好感、記憶、薪水三階）。
//   起因：店員好壞不影響經營，放著錢也會漲；愛偷懶、常請假的員工照樣讓帳戶慢慢累積到一萬多。
//   照小斐企劃 B.2：每班分 4 段，每段大腦挑一件事做（招呼、推薦、整理、滑手機…）；每班有服務分 Q，
//   Q 決定客人付多少（客單 ×0.85～1.15）、之後多常回來、書咖人氣漲跌；沒人在班＝客人一半直接走、留下的少付一成、人氣 −3、不能補貨。
//   小機值班開著（os_cafe_staff.js）＝有人顧店，不罰也不加。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;

    // ── 對照表（陣列索引＝分數 − 1）──
    const ERR = [0.6, 0.45, 0.3, 0.2, 0.1];     // 看帳：備料預估差多少（正負）
    const DELAY = [120, 90, 60, 45, 30];         // 手腳：賣完後幾分鐘補好
    const SWEET = [0, 0.05, 0.1, 0.18, 0.25];    // 嘴甜：賣完時客人改點的機率多加多少
    const ABSENT = [0.2, 0.12, 0.05, 0.02, 0];   // 勤快：這班請假或遲到的機率（一半一半）
    const SHIFT = {
        am: { start: 510, end: 930, label: '早班', share: 1 },     // 08:30 上班先把當天的料備好；做到 15:30
        pm: { start: 930, end: 1320, label: '晚班', share: 0.5 },  // 15:30 上班看剩多少、補到打烊
    };
    const OPEN = 540, CLOSE = 1320;
    const BATCH_MAX = 8;
    const NO_DATA_GUESTS = 6;   // 前三天都沒紀錄：當一天來 6 位、平均分給菜單

    // ── 應徵者的長相、名字、字卡（一般名字，不是任何人的遊玩內容）──
    // 長相＝大廳常客還沒用到的 6 張便服三視圖（素材庫 cafe_guests_v1/）；錄取後換書咖制服
    const LOOKS = { f: ['street-woman', 'trades-woman', 'wealthy-woman'], m: ['fashion-man', 'trades-man', 'traveler-man'] };
    const NAMES = {
        f: ['欣怡', '宜蓁', '雅雯', '思穎', '佳慧', '筱婷', '怡萱', '品妤', '芷涵', '子晴', '郁潔', '靜宜', '沛珊', '映彤'],
        m: ['家瑋', '承恩', '冠廷', '柏翰', '彥廷', '俊傑', '宇軒', '志豪', '建宏', '育誠', '品睿', '紹齊', '士豪', '哲維'],
    };
    const PERS = ['開朗', '內向', '急性子', '慢條斯理', '愛講話', '完美主義', '隨和', '好勝', '迷糊', '冷靜', '害羞', '大方'];
    // 自稱經歷：照等級（0～4）挑一張；等級跟真本事有關但不等於（誠實低的人會往上灌）
    const EXPS = [
        ['第一次打工', '剛畢業，還沒正式工作過'],
        ['做過手搖飲', '在便利商店打過工'],
        ['做過餐廳外場', '在早餐店幫忙過兩年'],
        ['待過連鎖咖啡店', '做過咖啡廳吧台'],
        ['自己開過小店', '在咖啡店當過店長'],
    ];

    const _clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    function _brain() { return win.NpcBrain || window.NpcBrain || (typeof globalThis !== 'undefined' ? globalThis.NpcBrain : null); }
    // 每班分 4 段：第 1 段一定先看帳備料，後 3 段大腦挑
    const SEGS = 4;
    const NOBODY = { leave: 0.5, price: 0.9, pop: -3, q: 37.5 };   // 沒人在班（小斐 B.2：到店 ×0.5、客單 ×0.9、人氣 −3、回頭率 −5 個百分點＝當成 Q 37.5）
    const TREAT_COST = 15;    // 請店員吃東西：從書咖帳戶出
    // 🧹 店況（11-25 NPC 大腦第三步）：店裡會髒、冰箱過期的料要有人倒、太髒會跑出老鼠蟑螂、客訴多了衛生局會來。
    //   全照規則算，不叫模型；老闆不用自己打掃——雇人（店員會挑擦桌、整理、清冰箱）、開小機值班，或按「叫清潔公司」
    const HYG = {
        perGuest: 3, perDay: 4,              // 每位坐下來的客人、每天打烊 店裡變髒多少（0～100）
        wipe: 15, shelf: 8,                  // 擦桌、整理書櫃 各清掉多少
        minderClean: 25, minderFridge: 0.7,  // 小機值班：打烊順手清掉多少、開店前看冰箱的機率
        qFrom: 40, qPer: 0.2,                // 髒度超過 40：服務分每點 −0.2
        pestFrom: 60, pestP: 0.2, pestPer: 0.01, pestGone: 3,   // 打烊時髒度 ≥60：20%＋每多 1 點 1% 跑出老鼠或蟑螂；連 3 天打烊髒度 ≤25 才自己搬走
        pestSeen: 0.25, pestLeave: 0.7,      // 有蟲鼠時：客人看到的機率、看到了直接走的機率
        poison: 0.08,                        // 冰箱裡過期的那樣沒倒：每份用到它的機率（吃壞肚子）
        complainN: 4, keep: 7, routine: 0.03, // 7 天內客訴滿 4 件 → 衛生局一兩天內來；平常每天 3% 抽查
        fineWarn: 100, fineFail: 300,
        cleanCost: 80, pestCost: 100,        // 叫清潔公司：基本 80，有蟲鼠再加 100
    };
    const PEST = { rat: '老鼠', roach: '蟑螂' };
    const INSP_RES = { good: '衛生優良', warn: '警告', fail: '不合格' };
    const HOPEN = 500, INSP_T = 840;   // 08:20 開店前看冰箱；衛生局 14:00 來
    function hygNorm(h) {
        h = Object.assign({ dirt: 20, pest: null, cleanStreak: 0, stale: [], complaints: [], insp: null, last: null, closed: null, rev: 0 }, h || {});
        h.stale = (h.stale || []).slice(); h.complaints = (h.complaints || []).slice();
        return h;
    }
    function hygLabel(d) { return d < 20 ? '乾淨' : d < 40 ? '還可以' : d < 60 ? '有點髒' : d < 80 ? '很髒' : '髒亂'; }
    // 店員一段時間能做的事（小斐 B.1；prep、restock 照舊由時間線觸發，不進抽籤）
    function cafeActs(c, open, quirk, hy) {
        return [
            { id: 'greet', cat: 'S', base: 40, ok: open },
            { id: 'recommend', cat: 'S', base: 30, ok: open },
            { id: 'shelf', cat: 'W', base: 25, ok: hy ? hy.dirt > 8 : true },
            { id: 'wipe', cat: 'W', base: 20 + (hy ? hy.dirt * 0.6 : 0), ok: hy ? hy.dirt > 15 : open },   // 越髒越想擦
            { id: 'fridge', cat: 'W', base: 30 + (hy ? hy.stale.length * 15 : 0), ok: !!(hy && hy.stale.length) },   // 冰箱有過期的料才會去清
            { id: 'phone', cat: 'M', base: 10 },
            { id: 'chat_regular', cat: 'S', base: 25, ok: open },
            { id: 'rest', cat: 'R', base: 15, ok: c.sta < 80 },
            { id: 'sing', cat: 'S', base: 12, ok: quirk === 'sing' },
        ];
    }
    const _pickOne = (rand, list) => list[Math.floor(rand() * list.length) % list.length];
    function _hm(t) { return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); }

    // 真本事（0～4）：看帳跟手腳的平均
    function skillOf(st) { return _clamp(Math.round((st.acct + st.hand) / 2) - 1, 0, 4); }
    // 面完拖太久才打電話：真本事越好越可能已經去別家（最多一半）
    function goneP(st) { const sum = st.acct + st.hand + st.dili + st.sweet + st.honest; return 0.5 * (sum - 5) / 20; }

    function rollApplicant(rand, taken, mkId) {
        const gender = rand() < 0.5 ? 'f' : 'm';
        const free = NAMES[gender].filter(n => !(taken || []).includes(n));
        const name = _pickOne(rand, free.length ? free : NAMES[gender]);
        const look = _pickOne(rand, LOOKS[gender]);
        const d = () => 1 + Math.floor(rand() * 5) % 5;
        const stats = { acct: d(), hand: d(), dili: d(), sweet: d(), honest: d() };
        // 🧠 個性跟數字要說得通：偷懶的勤快最多 3、勤奮的至少 3、老實的誠實至少 4、愛聊的嘴甜至少 3
        const NB = _brain();
        const brain = NB ? NB.newCard(rand, { role: 'cafe' }) : null;
        if (brain) {
            if (brain.pk === 'lazy') stats.dili = Math.min(stats.dili, 3);
            if (brain.pk === 'diligent') stats.dili = Math.max(stats.dili, 3);
            if (brain.pk === 'honest') stats.honest = Math.max(stats.honest, 4);
            if (brain.pk === 'chatty') stats.sweet = Math.max(stats.sweet, 3);
            if (brain.pk === 'perfect') stats.acct = Math.max(stats.acct, 3);
        }
        const skill = skillOf(stats);
        let claim = skill;
        if (stats.honest === 3) claim = skill + (rand() < 0.5 ? 1 : 0);
        else if (stats.honest <= 2) claim = skill + 1 + (rand() < 0.5 ? 1 : 0);
        claim = _clamp(claim, 0, 4);
        const pers = brain ? [NB.PERS[brain.pk].name] : [_pickOne(rand, PERS)];
        if (brain && brain.quirk) pers.push(NB.QUIRKS[brain.quirk].name);
        else if (rand() < 0.6) { const b = _pickOne(rand, PERS.filter(p => p !== pers[0])); pers.push(b); }
        const exp = _pickOne(rand, EXPS[claim]);
        const wage = 20 + claim * 5 + Math.floor(rand() * 6) % 6;
        const id = mkId ? mkId() : 'ap' + Math.floor(rand() * 1e9).toString(36);
        return { id, name, gender, look, cards: { pers, exp }, claim, stats, wage, brain };
    }

    // 前三天（day−3..day−1）每杯「賣出＋想點沒點到」的平均＝店員以為一天會有幾位要這杯
    function forecast(tally, menu, day) {
        const days = [day - 3, day - 2, day - 1].filter(d => tally && tally[d] && Object.keys(tally[d]).length);
        const out = {};
        if (!days.length) { for (const m of menu) out[m.id] = menu.length ? NO_DATA_GUESTS / menu.length : 0; return out; }
        for (const m of menu) {
            let sum = 0;
            for (const d of days) { const v = tally[d][m.id]; if (v) sum += (v[0] || 0) + (v[1] || 0); }
            out[m.id] = sum / days.length;
        }
        return out;
    }

    // 🧑‍🍳 店員的時間線：結算照客人到店先後，每位客人之前先 until(那一刻)，讓店員先上班、備料、補貨
    //   o = { staff2, tally, menu, stock, used, coins, today, nowMin, from, unitCost(m), avail(stock,used,id,day,t), mkId(), rand(), minder（小機值班開著）, qAvg }
    //   備的批直接放進 o.stock（同一次結算後面的客人買得到）；結果 result() 給結算寫回
    function crewSession(o) {
        const S2 = o.staff2 || {};
        const slots = Object.assign({ am: null, pm: null }, S2.slots || {});
        const duty = Object.assign({}, S2.duty || {});
        const dutyAdd = {};
        const diary = [], batches = [], quit = [];
        const unpaid = {};
        const came = {};   // 這次結算裡第一次（或又一次）來上班的那格 → 結算寫回 m.came
        const gone = {};   // 這次結算裡辭職的那格
        let coins = o.coins, spent = 0, seqN = 0;
        const rand = o.rand || Math.random;
        const menuById = new Map((o.menu || []).map(m => [m.id, m]));
        const fcCache = {};
        const fc = (day) => fcCache[day] || (fcCache[day] = forecast(o.tally || {}, o.menu || [], day));
        const capOf = {};   // 一天備料總花費 ≤ 當天第一次花錢時帳戶的一半（記在 duty[day+':cap']，同一天打開好幾次也照同一個上限）
        const setDuty = (k, v) => { duty[k] = v; dutyAdd[k] = v; };
        const memberOf = (slot, sid) => (!gone[slot] && slots[slot] && slots[slot].sid === sid) ? slots[slot] : null;
        const note = (day, t, slot, m, kind, text) => diary.push({ id: (o.mkId ? o.mkId() : 'd' + (seqN++)), day, t, slot, sid: m.sid, name: m.name, kind, text });
        const nameOf = (id) => (menuById.get(id) || {}).name || '那杯';
        // 🧠 性格卡（每位一張，結算寫回 m.brain）＋每班的紀錄（服務分、招呼推薦幾次…）
        const NB = _brain();
        const cards = {};
        const cardOf = (m) => {
            if (!NB) return null;
            if (!cards[m.sid]) cards[m.sid] = NB.normCard(m.brain, m.stats, _hash(String(m.sid)));
            return cards[m.sid];
        };
        const sh = {};   // day:slot → { q0, adj, greet, rec, recOk, addOn, phone, seen, chores, chat, acts }
        const bf = S2.brainFrom || { day: o.today, min: o.nowMin };   // 大腦第一次接上的那一刻：之前的班不回頭算人氣
        const bossDay = S2.bossDay != null ? S2.bossDay : null;
        let popAdd = 0, qAvg = o.qAvg != null ? o.qAvg : 50;
        const shiftLog = [];
        // 🧹 店況：結算寫回 shop.hyg（她途中按了清潔公司＝rev 變了，寫回時照她那份）
        const hy = hygNorm(o.hyg);
        const hygRev0 = hy.rev || 0;
        const shopLog = [];   // 給訪客手札的（衛生局來過）
        const shelfDays = o.shelfDays || 2;
        const shopM = { sid: '_shop', name: '店裡' }, minderM = { sid: '_minder', name: '小機' };
        const recent = {};   // day → 這天客人到店的時間（算同一時間有幾位在等）
        const closedSeen = {};
        const mineDay = (day, t) => !(day < bf.day || (day === bf.day && t <= bf.min)) && !(day === o.today && t > o.nowMin);
        const dirtPen = () => Math.max(0, hy.dirt - HYG.qFrom) * HYG.qPer;
        const staleNames = () => Array.from(new Set(hy.stale.map(x => nameOf(x.id)))).join('、');

        const events = [];
        const push = (ev) => events.push(ev);
        for (let day = o.from; day <= o.today; day++) for (const slot of ['am', 'pm']) {
            const m = slots[slot];
            if (!m || (m.startDay != null && m.startDay > day)) continue;
            if (duty[day + ':' + slot]) continue;
            const t = SHIFT[slot].start;
            if (day === o.today && t > o.nowMin) continue;
            push({ kind: 'start', day, t, slot, sid: m.sid });
        }
        // 每班下班那一刻：算這班的服務分 → 人氣、回頭率（沒人在班也算；大腦接上之前的班不算）
        for (let day = o.from; day <= o.today; day++) for (const slot of ['am', 'pm']) {
            const t = SHIFT[slot].end;
            if (duty[day + ':' + slot + ':e']) continue;
            if (day < bf.day || (day === bf.day && t <= bf.min)) continue;
            if (day === o.today && t > o.nowMin) continue;
            push({ kind: 'end', day, t, slot });
        }
        for (const q of (S2.crewQ || [])) push(Object.assign({}, q));
        for (let day = o.from; day <= o.today; day++) {
            if (!duty[day + ':open'] && mineDay(day, HOPEN)) push({ kind: 'open', day, t: HOPEN });
            if (!duty[day + ':close'] && mineDay(day, CLOSE)) push({ kind: 'close', day, t: CLOSE });
        }
        if (hy.insp && hy.insp.day < o.from) hy.insp.day = o.from;
        if (hy.insp && !duty[hy.insp.day + ':insp'] && mineDay(hy.insp.day, INSP_T)) push({ kind: 'insp', day: hy.insp.day, t: INSP_T });

        // 在班上的是誰（那班有記、有來、時間在班內、還是同一個人）
        function onDuty(day, t) {
            for (const slot of ['am', 'pm']) {
                const d = duty[day + ':' + slot];
                if (!d || d.off || t < d.from || t >= d.to) continue;
                const m = memberOf(slot, d.sid);
                if (m) return { slot, m };
            }
            return null;
        }
        function shOf(day, slot) { const k = day + ':' + slot; return sh[k] || (sh[k] = { q0: null, adj: 0, greet: 0, rec: 0, recOk: 0, addOn: 0, phone: 0, seen: 0, chores: 0, chat: 0, acts: {} }); }
        // 現在這班的服務分（開班算一次，班上發生的事再加減）
        function qNow(day, slot, m) {
            const x = shOf(day, slot), c = cardOf(m);
            if (x.q0 == null) x.q0 = c ? NB.serviceQ(c, m.stats.sweet) : 50;
            return _clamp(x.q0 + x.adj - dirtPen(), 0, 100);
        }
        // 大腦挑一件事做（每段一次）
        function segment(day, t, slot, m) {
            const c = cardOf(m);
            if (!c) return;
            const open = t >= OPEN && t < CLOSE;
            const a = NB.choose(c, cafeActs(c, open, c.quirk, hy), { shift: slot }, rand);
            const x = shOf(day, slot);
            const extra = c.pk === 'perfect' ? -1 : 0;
            x.acts[a.id] = (x.acts[a.id] || 0) + 1;
            if (a.id === 'greet') { NB.bump(c, { sta: -2 + extra, mood: 1 }); if (rand() >= 0.2) x.greet++; }
            else if (a.id === 'recommend') {
                NB.bump(c, { sta: -3 + extra, mood: 1 }); x.rec++;
                if (rand() < (_clamp(m.stats.sweet, 1, 5) * 10 + 20) / 100) { x.recOk++; x.addOn++; }
            }
            else if (a.id === 'shelf' || a.id === 'wipe') {
                NB.bump(c, { sta: (a.id === 'shelf' ? -4 : -3) + extra }); if (x.chores < 3) { x.chores++; x.adj += 2; }
                hy.dirt = Math.max(0, hy.dirt - (a.id === 'wipe' ? HYG.wipe : HYG.shelf));
            }
            else if (a.id === 'fridge') {
                NB.bump(c, { sta: -3 + extra });
                const names = staleNames();
                const miss = c.quirk === 'clumsy' && hy.stale.length > 1 && rand() < 0.3;   // 迷糊：漏一樣
                hy.stale = miss ? hy.stale.slice(-1) : [];
                x.fridge = names + (miss ? '，但漏了一樣' : '');
            }
            else if (a.id === 'phone') { NB.bump(c, { sta: 2, mood: 2 }); x.phone++; if (open && rand() < 0.3) { x.seen++; x.adj -= 5; } }
            else if (a.id === 'chat_regular') { NB.bump(c, { sta: -1 + extra, mood: c.pk === 'chatty' ? 5 : 3 }); x.chat++; if (rand() < 0.15) x.adj -= 2; }
            else if (a.id === 'rest') NB.bump(c, { sta: 8 });
            else if (a.id === 'sing') NB.bump(c, { sta: -1, mood: 5 });
        }
        // 下班：這班的人氣、回頭率；有上班的寫一行摘要
        function endShift(ev) {
            const key = ev.day + ':' + ev.slot;
            setDuty(key + ':e', 1);
            const d = duty[key];
            const m = d && !d.off ? memberOf(ev.slot, d.sid) : null;
            let q, pop;
            if (m) {
                const x = shOf(ev.day, ev.slot), c = cardOf(m);
                const qEnd = c ? _clamp(NB.serviceQ(c, m.stats.sweet) + x.adj - dirtPen(), 0, 100) : 50;
                q = Math.round((qNow(ev.day, ev.slot, m) + qEnd) / 2);
                pop = Math.round((q - 50) / 10) + Math.round((x.greet + x.recOk) / 4) - x.seen;
                const bits = [];
                if (x.greet) bits.push('招呼了 ' + x.greet + ' 次客人');
                if (x.rec) bits.push('推薦 ' + x.rec + ' 次（' + x.recOk + ' 次多賣出一份）');
                if (x.chores) bits.push('整理了店裡');
                if (x.fridge) bits.push('清了冰箱（倒掉過期的' + x.fridge + '）');
                if (x.review) bits.push(x.review + ' 位客人說很喜歡這裡');
                if (x.rude) bits.push('被客人抱怨 ' + x.rude + ' 次');
                if (x.chat) bits.push('跟熟客聊天');
                if (x.phone) bits.push('滑手機 ' + x.phone + ' 次' + (x.seen ? '（被客人看到 ' + x.seen + ' 次）' : ''));
                if (x.acts.rest) bits.push('坐下來喘口氣');
                if (x.acts.sing) bits.push('邊做邊哼歌');
                note(ev.day, ev.t, ev.slot, m, 'shift', SHIFT[ev.slot].label + '下班：' + (bits.length ? bits.join('、') : '沒做什麼特別的') + '。服務分 ' + q + '，人氣 ' + (pop >= 0 ? '+' : '') + pop);
            } else if (o.minder) { q = 50; pop = 0; }
            else { q = NOBODY.q; pop = NOBODY.pop; }
            if (hy.closed === ev.day) { q = 50; pop = 0; }   // 停業整頓那天沒客人，不算
            popAdd += pop;
            qAvg = qAvg * 0.7 + q * 0.3;
            shiftLog.push({ day: ev.day, slot: ev.slot, q, pop, who: m ? m.name : (o.minder ? 'minder' : '') });
        }
        // 照預估備料：share＝這次要備多少比例的一天；checkAt＝算「已經有多少」的那一刻
        function prep(day, t, slot, m, share, checkAt, onlyId) {
            const cb = cardOf(m);
            const err = Math.max(0.02, ERR[_clamp(m.stats.acct, 1, 5) - 1] * (cb && cb.pk === 'perfect' ? 0.5 : 1) + (cb && cb.quirk === 'clumsy' ? 0.1 : 0) + (cb && cb.sta < 20 ? 0.1 : 0));
            const f = fc(day);
            const ids = (onlyId ? [onlyId] : Object.keys(f)).filter(id => menuById.has(id)).sort((a, b) => (f[b] || 0) - (f[a] || 0));
            const want = [];
            for (const id of ids) {
                const noise = (rand() * 2 - 1) * err;
                const need = Math.round((f[id] || 0) * share * (1 + noise));
                const have = o.avail(o.stock, o.used, id, day, checkAt);
                const qty = _clamp(need - have, 0, BATCH_MAX);
                if (qty > 0) want.push({ id, qty });
            }
            if (!want.length) return { made: [], short: false, cost: 0 };
            const saved = duty[day + ':cap'];
            const cap = capOf[day] || (capOf[day] = saved ? { cap: saved.cap, used: saved.used } : { cap: Math.floor(Math.max(0, coins) / 2), used: 0 });
            const made = []; let short = false, cost = 0;
            for (const w of want) {
                const mi = menuById.get(w.id);
                const unit = Math.max(1, o.unitCost(mi));
                const q = Math.min(w.qty, Math.floor((cap.cap - cap.used) / unit), Math.floor(coins / unit));
                if (q < w.qty) short = true;
                if (q <= 0) continue;
                const batch = { id: o.mkId ? o.mkId() : 'cb' + (seqN++), qty: q, day, t, unit, by: m.sid };
                (o.stock[w.id] || (o.stock[w.id] = [])).push(batch);
                batches.push({ menuId: w.id, batch });
                cap.used += q * unit; coins -= q * unit; spent += q * unit; cost += q * unit;
                made.push({ id: w.id, qty: q });
            }
            setDuty(day + ':cap', { cap: cap.cap, used: cap.used });
            return { made, short, cost };
        }
        function work(day, t, slot, m) {
            const r = prep(day, t, slot, m, SHIFT[slot].share, Math.max(t, OPEN));
            const cw = cardOf(m); if (cw) NB.bump(cw, { sta: -4 });
            const lab = SHIFT[slot].label;
            if (hy.stale.length && ((cw && cw.pk === 'perfect') || rand() < _clamp(m.stats.acct, 1, 5) * 0.15)) {
                note(day, t, slot, m, 'fridge', '備料時看到冰箱有過期的' + staleNames() + '，順手倒了');
                hy.stale = [];
            }
            if (r.made.length) note(day, t, slot, m, 'prep', lab + '備了 ' + r.made.map(x => nameOf(x.id) + ' ×' + x.qty).join('、') + '（花 ' + r.cost + '）' + (r.short ? '；錢不夠，少備了一些' : ''));
            else note(day, t, slot, m, 'prep', r.short ? lab + '想備料，但帳戶錢不夠，沒備' : lab + '看了看帳，料夠，這班不用備');
        }
        function start(ev) {
            const m = memberOf(ev.slot, ev.sid);
            if (!m) return;
            const key = ev.day + ':' + ev.slot;
            if (duty[key]) return;
            const lab = SHIFT[ev.slot].label;
            // 🧠 過清晨（體力回、心情往 50 靠、記憶少一天、薪水高低影響好感；好感太低又心情差會想走）
            const c = cardOf(m);
            if (c) {
                const r = NB.dawn(c, ev.day, { bossDay, rand });
                if (r.notes.includes('want_quit')) note(ev.day, ev.t, ev.slot, m, 'mood', '看起來不太想做了（好感 ' + c.fav + '、心情 ' + c.mood + '）；誇獎或加薪可以留住他');
                if (r.quit) { gone[ev.slot] = true; quit.push({ slot: ev.slot, sid: m.sid }); setDuty(key, { sid: m.sid, off: 'quit' }); note(ev.day, ev.t, ev.slot, m, 'quit', '跟老闆說不做了，辭職走了'); return; }
                if (m.offDay === ev.day) { setDuty(key, { sid: m.sid, off: 'rest' }); note(ev.day, ev.t, ev.slot, m, 'rest', lab + '放假，今天這班沒人顧'); return; }
            }
            const pay = c ? Math.round(m.wage * ((NB.TIERS[c.tier] || NB.TIERS.mid).pay)) : m.wage;
            if (coins < pay) {
                const n = (m.unpaid || 0) + 1;
                m.unpaid = n;
                unpaid[ev.slot] = { sid: m.sid, n };
                setDuty(key, { sid: m.sid, off: 'nopay' });
                note(ev.day, ev.t, ev.slot, m, 'nopay', '帳戶不夠付' + lab + '的薪水（' + pay + '），今天沒來');
                if (c) NB.bump(c, { fav: -5, mood: -5 });
                if (n >= 3) { gone[ev.slot] = true; quit.push({ slot: ev.slot, sid: m.sid }); note(ev.day, ev.t, ev.slot, m, 'quit', '連 3 天沒領到薪水，辭職了'); }
                return;
            }
            // 第一次上班一定準時到（新人第一天就請假太怪），之後才照勤快抽
            const skip = !!m.came && rand() < ABSENT[_clamp(m.stats.dili, 1, 5) - 1];
            const late = skip && rand() >= 0.5;
            if (skip && !late) {
                setDuty(key, { sid: m.sid, off: 'absent' });
                note(ev.day, ev.t, ev.slot, m, 'absent', lab + '請假，沒來');
                return;
            }
            coins -= pay; spent += pay;
            m.unpaid = 0; unpaid[ev.slot] = { sid: m.sid, n: 0 };
            m.came = true; came[ev.slot] = m.sid;
            const from = late ? ev.t + 60 : ev.t;
            setDuty(key, { sid: m.sid, from, to: SHIFT[ev.slot].end });
            if (c) {
                NB.shiftStart(c);
                if (late) NB.bump(c, { fav: -1 });
                const len = (SHIFT[ev.slot].end - SHIFT[ev.slot].start) / SEGS;
                for (let k = 1; k < SEGS; k++) { const st = Math.round(SHIFT[ev.slot].start + len * k); if (st >= from) push({ kind: 'seg', day: ev.day, t: st, slot: ev.slot, sid: m.sid }); }
                qNow(ev.day, ev.slot, m);
            }
            if (late) { note(ev.day, from, ev.slot, m, 'late', lab + '遲到了一小時'); push({ kind: 'work', day: ev.day, t: from, slot: ev.slot, sid: m.sid }); return; }
            work(ev.day, ev.t, ev.slot, m);
        }
        function restock(ev) {
            const d = duty[ev.day + ':' + ev.slot];
            const m = memberOf(ev.slot, ev.sid);
            if (!m || !d || d.off || ev.t < d.from || ev.t >= d.to) return;
            const share = Math.max(0, (CLOSE - ev.t) / (CLOSE - OPEN));
            const r = prep(ev.day, ev.t, ev.slot, m, share, ev.t, ev.id);
            const cr = cardOf(m); if (cr && r.made.length) NB.bump(cr, { sta: -5 });
            if (r.made.length) note(ev.day, ev.t, ev.slot, m, 'restock', _hm(ev.soldAt != null ? ev.soldAt : ev.t) + ' ' + nameOf(ev.id) + '沒料了，' + _hm(ev.t) + ' 補了 ' + r.made[0].qty + ' 份（花 ' + r.cost + '）');
            else if (r.short) note(ev.day, ev.t, ev.slot, m, 'restock', nameOf(ev.id) + '沒料了，想補但帳戶錢不夠');
        }
        // 某杯賣完或有人撲空：在班上的店員過一陣子補（同一杯同一天只補一次）
        function trigger(id, day, t) {
            const on = onDuty(day, t);
            if (!on) return;
            const flag = day + ':r:' + id;
            if (duty[flag]) return;
            const at = t + DELAY[_clamp(on.m.stats.hand, 1, 5) - 1];
            if (at >= duty[day + ':' + on.slot].to) return;
            setDuty(flag, 1);
            push({ kind: 'restock', day, t: at, slot: on.slot, sid: on.m.sid, id, soldAt: t });
        }
        // 🧹 開店前：小機值班多半會看一眼冰箱
        function hOpen(ev) {
            setDuty(ev.day + ':open', 1);
            if (o.minder && hy.stale.length && rand() < HYG.minderFridge) {
                note(ev.day, ev.t, null, minderM, 'fridge', '開店前看了冰箱，把過期的' + staleNames() + '倒掉了');
                hy.stale = [];
            }
        }
        function schedInsp() { if (hy.insp && !duty[hy.insp.day + ':insp'] && mineDay(hy.insp.day, INSP_T)) push({ kind: 'insp', day: hy.insp.day, t: INSP_T }); }
        // 🧹 打烊：一天的灰、小機順手掃、蟲鼠來去、客訴多了叫衛生局
        function hClose(ev) {
            const day = ev.day;
            setDuty(day + ':close', 1);
            hy.dirt = _clamp(hy.dirt + HYG.perDay, 0, 100);
            // 今天是最後一天能賣、還剩的料：明天就過期了，記成「還在冰箱」，要有人倒（結算寫回時那批會從庫存消失，但冰箱裡的還在）
            for (const id of Object.keys(o.stock || {})) for (const b of (o.stock[id] || [])) {
                if (b.day + shelfDays - 1 !== day) continue;
                const left = (b.qty || 0) - ((o.used || {})[b.id] || 0);
                if (left > 0 && !hy.stale.some(x => x.bid === b.id)) hy.stale.push({ bid: b.id, id, day: day + 1, qty: left });
            }
            if (hy.stale.length > 12) hy.stale = hy.stale.slice(-12);
            if (o.minder) hy.dirt = Math.max(0, hy.dirt - HYG.minderClean);
            if (hy.closed === day) {
                hy.dirt = 10; hy.pest = null; hy.stale = []; hy.cleanStreak = 0;
                note(day, ev.t, null, shopM, 'shop', '停業這天整間大掃除過了，明天照常開門');
            } else if (hy.pest) {
                hy.cleanStreak = hy.dirt <= 25 ? (hy.cleanStreak || 0) + 1 : 0;
                if (hy.cleanStreak >= HYG.pestGone) { note(day, ev.t, null, shopM, 'shop', '店裡一直很乾淨，' + PEST[hy.pest] + '找不到吃的，搬走了'); hy.pest = null; hy.cleanStreak = 0; }
            } else if (hy.dirt >= HYG.pestFrom && rand() < HYG.pestP + (hy.dirt - HYG.pestFrom) * HYG.pestPer) {
                hy.pest = rand() < 0.5 ? 'rat' : 'roach'; hy.pestDay = day; hy.cleanStreak = 0;
                note(day, ev.t, null, shopM, 'pest', '打烊後發現有' + PEST[hy.pest] + '在角落跑（店裡太髒了，髒度 ' + Math.round(hy.dirt) + '）');
            }
            hy.complaints = hy.complaints.filter(c => c.day > day - HYG.keep);
            if (!hy.insp) {
                const n = hy.complaints.reduce((a, c) => a + (c.w || 1), 0);
                if (n >= HYG.complainN) {
                    hy.insp = { day: day + 1 + (rand() < 0.5 ? 0 : 1), why: 'complaints', told: true };
                    note(day, ev.t, null, shopM, 'insp', '這週客訴 ' + n + ' 件，衛生局打電話來說這一兩天會來檢查');
                } else if (rand() < HYG.routine) hy.insp = { day: day + 1 + Math.floor(rand() * 3), why: 'routine' };
                schedInsp();
            }
        }
        function hInsp(ev) {
            const day = ev.day;
            setDuty(day + ':insp', 1);
            if (!hy.insp || hy.insp.day !== day) return;
            if (hy.closed === day) { hy.insp.day = day + 1; schedInsp(); return; }   // 停業那天不來，隔天再來
            const why = hy.insp.why;
            hy.insp = null;
            const poisoned = hy.complaints.some(c => c.why === 'poison');
            const bits = ['店裡' + hygLabel(hy.dirt)];
            if (hy.pest) bits.push('有' + PEST[hy.pest]);
            if (hy.stale.length) bits.push('冰箱裡有過期的' + staleNames());
            if (poisoned) bits.push('這週有客人吃壞肚子');
            let res = 'good', fine = 0, pop = 5;
            if (hy.pest || hy.dirt >= 60 || poisoned) { res = 'fail'; fine = HYG.fineFail; pop = -15; }
            else if (hy.dirt >= 30 || hy.stale.length) { res = 'warn'; fine = HYG.fineWarn; pop = -5; }
            fine = Math.min(fine, Math.max(0, Math.floor(coins)));
            coins -= fine; spent += fine;
            popAdd += pop;
            if (res !== 'good') hy.stale = [];   // 過期的料當場叫我們倒掉
            if (res === 'fail') { hy.closed = day + 1; hy.complaints = []; }
            hy.last = { day, res, fine, why };
            const head = (why === 'routine' ? '衛生局突然來抽查：' : '衛生局來檢查：') + bits.join('、') + '。';
            const text = head + (res === 'good' ? '合格，門口貼了「衛生優良」，人氣 +5'
                : res === 'warn' ? '開了警告，罰 ' + fine + '，人氣 −5'
                : '不合格！罰 ' + fine + '，人氣 −15，明天停業整頓一天');
            note(day, ev.t, null, shopM, 'insp', text);
            shopLog.push({ day, t: ev.t, name: '衛生局', line: text.replace(/^衛生局(突然)?來/, '$1來'), insp: res });
        }
        const before = (a, day, t) => a.day < day || (a.day === day && a.t <= t);
        function until(day, t) {
            for (;;) {
                let best = -1;
                for (let i = 0; i < events.length; i++) {
                    const e = events[i];
                    if (!before(e, day, t)) continue;
                    if (best < 0 || e.day < events[best].day || (e.day === events[best].day && e.t < events[best].t)) best = i;
                }
                if (best < 0) return;
                const ev = events.splice(best, 1)[0];
                if (ev.kind === 'start') start(ev);
                else if (ev.kind === 'work') { const m = memberOf(ev.slot, ev.sid); if (m) work(ev.day, ev.t, ev.slot, m); }
                else if (ev.kind === 'restock') restock(ev);
                else if (ev.kind === 'seg') { const d = duty[ev.day + ':' + ev.slot], m = memberOf(ev.slot, ev.sid); if (m && d && !d.off && ev.t >= d.from && ev.t < d.to) segment(ev.day, ev.t, ev.slot, m); }
                else if (ev.kind === 'end') endShift(ev);
                else if (ev.kind === 'open') hOpen(ev);
                else if (ev.kind === 'close') hClose(ev);
                else if (ev.kind === 'insp') hInsp(ev);
            }
        }
        return {
            until,
            sold(id, day, t) { if (o.avail(o.stock, o.used, id, day, t) <= 0) trigger(id, day, t); },
            missed(id, day, t) { trigger(id, day, t); },
            sweet(day, t) { const on = onDuty(day, t); return on ? SWEET[_clamp(on.m.stats.sweet, 1, 5) - 1] : 0; },
            // 🧠 客人到店那一刻：有沒有人顧、這位付多少（小斐 B.2）
            //   回 { nobody, leave（這位直接走的機率）, mul（客單乘數）, addOn（店員剛推薦成功＝多點一份） }
            //   11-25 多回店況：closed（停業整頓，第一位才 first）、pest、dirt、stale（冰箱有過期料的那幾樣）、wait（要等幾分鐘）、soothe（被抱怨時安撫得了的機率）、poisonMul
            serve(day, t) {
                if (t < OPEN || t >= CLOSE) return { nobody: false, leave: 0, mul: 1 };
                const base = { closed: hy.closed === day, pest: hy.pest, dirt: hy.dirt, stale: new Set(hy.stale.map(x => x.id)), poisonMul: 1 };
                if (base.closed) { const first = !closedSeen[day]; closedSeen[day] = true; return Object.assign(base, { nobody: false, leave: 0, mul: 1, first }); }
                const rc = recent[day] || (recent[day] = []);
                const crowd = rc.filter(x => x > t - 20).length;
                rc.push(t);
                const on = onDuty(day, t);
                if (!on) return Object.assign(base, o.minder ? { nobody: false, leave: 0, mul: 1, q: 50, wait: 8 + crowd * 2, soothe: 0.4, who: '小機' } : { nobody: true, leave: NOBODY.leave, mul: NOBODY.price, poisonMul: 1.5 });
                const q = qNow(day, on.slot, on.m);
                const cw = cardOf(on.m);
                base.wait = Math.round(4 + (5 - _clamp(on.m.stats.hand, 1, 5)) * 2.5 + crowd * 2 + (cw && cw.sta < 40 ? 4 : 0));
                base.soothe = (_clamp(on.m.stats.sweet, 1, 5) * 10 + 20) / 100;
                base.poisonMul = cw ? (cw.pk === 'perfect' ? 0.5 : 1) * (cw.quirk === 'clumsy' ? 1.5 : 1) : 1;
                let mul = 0.85 + q / 100 * 0.3;
                mul *= on.slot === 'am' ? 1 + (_clamp(on.m.stats.hand, 1, 5) - 3) * 0.02 : 1 + (_clamp(on.m.stats.sweet, 1, 5) - 3) * 0.03;
                const x = shOf(day, on.slot);
                let addOn = false;
                if (x.addOn > 0) { x.addOn--; addOn = true; }
                return Object.assign(base, { nobody: false, leave: 0, mul, addOn, q, who: on.m.name });
            },
            mess(n) { hy.dirt = _clamp(hy.dirt + (n == null ? HYG.perGuest : n), 0, 100); },   // 客人坐過＝變髒
            complain(day, why, w) { hy.complaints.push({ day, why, w: w || 1 }); },             // 正式客訴（打電話給衛生局那種）
            popHit(n) { popAdd += n; },
            chatted(day, t) { const on = onDuty(day, t); if (!on) return; const c = cardOf(on.m); if (c) NB.bump(c, { mood: 2 }); },   // 客人跟店員聊兩句
            review(day, t) {   // 客人心情好，說很喜歡這裡＝店員記得「客人給好評」
                const on = onDuty(day, t); if (!on) return;
                const c = cardOf(on.m), x = shOf(day, on.slot);
                if (c) { NB.remember(c, 'great_review'); NB.bump(c, { mood: 5 }); }
                x.review = (x.review || 0) + 1;
            },
            rude(day, t) {     // 客人等太久、安撫不了＝店員記得「被客人罵」
                const on = onDuty(day, t); if (!on) return;
                const c = cardOf(on.m), x = shOf(day, on.slot);
                if (c) { NB.remember(c, 'rude_customer'); NB.bump(c, { mood: -8 }); }
                x.rude = (x.rude || 0) + 1;
            },
            earn(n) { coins += Number(n) || 0; },   // 客人付的錢：店員付薪水、算一半上限看的是「到這一刻」的帳
            result() {
                const later = events.filter(e => e.kind !== 'start').map(e => Object.assign({}, e));
                const brains = {};
                for (const slot of ['am', 'pm']) { const m = slots[slot]; if (m && cards[m.sid]) brains[slot] = { sid: m.sid, brain: cards[m.sid], rev: m.brainRev || 0 }; }
                return { spent, coins, batches: batches.slice(), diary: diary.slice(), duty: Object.assign({}, duty), dutyAdd: Object.assign({}, dutyAdd), unpaid: Object.assign({}, unpaid), came: Object.assign({}, came), quit: quit.slice(), crewQ: later,
                    brains, popAdd, qAvg, shiftLog: shiftLog.slice(), brainFrom: S2.brainFrom ? null : bf, hyg: hy, hygRev0, shopLog: shopLog.slice() };
            },
        };
    }

    // 結算要不要為了店員跑一次：有該上的班還沒上、或排著的事（遲到開工、補貨）時間到了
    function hasDue(S2, from, today, nowMin) {
        if (!S2 || !S2.brainFrom) return true;   // 大腦還沒接上：跑一次記下起點
        const slots = S2.slots || {}, duty = S2.duty || {};
        const bf = S2.brainFrom;
        for (let day = Math.max(from, bf.day); day <= today; day++) for (const slot of ['am', 'pm']) {
            const t = SHIFT[slot].end;
            if (duty[day + ':' + slot + ':e'] || (day === bf.day && t <= bf.min) || (day === today && t > nowMin)) continue;
            return true;
        }
        for (let day = from; day <= today; day++) for (const slot of ['am', 'pm']) {
            const m = slots[slot];
            if (!m || (m.startDay != null && m.startDay > day) || duty[day + ':' + slot]) continue;
            if (day === today && SHIFT[slot].start > nowMin) continue;
            return true;
        }
        return (S2.crewQ || []).some(q => q.day < today || (q.day === today && q.t <= nowMin));
    }

    const _pure = { ERR, DELAY, SWEET, ABSENT, SHIFT, SEGS, NOBODY, LOOKS, NAMES, PERS, EXPS, skillOf, goneP, rollApplicant, forecast, crewSession, hasDue, cafeActs, HYG, PEST, INSP_RES, hygNorm, hygLabel };

    // ── 📋 徵人、應徵者、面試、打電話、請走（寫 staff2 一律排進書咖那條隊）──
    const AD_COST = 15, AD_HOURS = 4, APPLY_N = 3, KEEP_DAYS = 3, ASK_MAX = 6, DAY_MS = 86400000;
    const ACCEPT = ['真的嗎？好，我{when} 就到！', '太好了，謝謝！那就{when} 見。', '好的，{when} 我會準時到。'];
    const DECLINE = ['啊……不好意思，我已經答應別家了。', '抱歉，我前天已經在別的地方上班了。'];
    const _fill = (s, o) => String(s).replace(/\{(\w+)\}/g, (_, k) => (o[k] == null ? '' : o[k]));
    function _B() { const C = win.OS_CAFE || window.OS_CAFE; return C && C._b; }
    function _blank() { return { slots: { am: null, pm: null }, ad: null, applicants: [], diary: [], duty: {}, crewQ: [] }; }
    function _norm(s) {
        const o = Object.assign(_blank(), s || {});
        o.slots = Object.assign({ am: null, pm: null }, o.slots || {});
        o.applicants = o.applicants || []; o.diary = o.diary || [];
        return o;
    }
    async function get() { const b = _B(); return b ? _norm(await b.get('staff2', null)) : _blank(); }
    // fn(s2, b) → [回傳值, 要不要存]；讀不到存檔就丟錯（不拿空的頂了再寫回）
    function _mut(fn) {
        const b = _B();
        if (!b || !b.locked) return Promise.resolve({ ok: false, why: '書咖還沒準備好，等一下再試' });
        return b.locked(async () => {
            const s2 = _norm(await b.getStrict('staff2', null));
            const [ret, save] = await fn(s2, b);
            if (save) await b.set('staff2', s2);
            return ret;
        });
    }
    function _log(s2, b, kind, who, text, slot) {
        const now = Date.now();
        s2.diary = [{ id: b.mkId(), day: b.dayNum(now), t: b.minOf(now), slot: slot || null, sid: who.sid || who.id, name: who.name, kind, text }].concat(s2.diary || []).slice(0, 60);
        s2.unread = true;
    }
    function postAd() {
        return _mut(async (s2, b) => {
            if (s2.ad) return [{ ok: false, why: '已經貼了一張，等應徵者來' }, false];
            const fd = await b.fundLoad();
            if (fd.coins < AD_COST) return [{ ok: false, why: '錢不夠（貼啟事要 ' + AD_COST + ' 元，帳戶剩 ' + fd.coins + ' 元）' }, false];
            fd.coins -= AD_COST;
            await b.set('fund', fd);
            const now = Date.now();
            s2.ad = { postedAt: now, readyAt: now + AD_HOURS * 3600000 };
            return [{ ok: true, ad: s2.ad }, true];
        });
    }
    // 啟事時間到了＝來三位（她打開員工頁才叫；大廳悄悄補算不叫模型）；履歷一通寫三份，失敗就照字卡寫模板
    async function arrive() {
        const now = Date.now();
        const fresh = await _mut(async (s2, b) => {
            if (!s2.ad || s2.ad.readyAt > now) return [null, false];
            const taken = s2.applicants.map(a => a.name).concat(['am', 'pm'].map(k => s2.slots[k] && s2.slots[k].name).filter(Boolean));
            const list = [];
            for (let i = 0; i < APPLY_N; i++) {
                const a = rollApplicant(Math.random, taken.concat(list.map(x => x.name)), b.mkId);
                Object.assign(a, { arrivedAt: s2.ad.readyAt, expireAt: s2.ad.readyAt + KEEP_DAYS * DAY_MS, state: 'new', interview: [] });
                a.resume = _tplResume(a); a.resumeTpl = true;   // 先放照字卡寫的，模型那通回來再換（中途關網頁也不會一直空白）
                list.push(a);
            }
            s2.applicants = s2.applicants.concat(list);
            s2.ad = null; s2.unread = true;
            return [list, true];
        });
        if (!fresh || !fresh.length) return false;
        const resumes = await _writeResumes(fresh);
        await _mut(async (s2) => {
            for (const a of s2.applicants) if (a.resumeTpl && fresh.some(f => f.id === a.id)) { if (resumes[a.id]) a.resume = resumes[a.id]; delete a.resumeTpl; }
            return [true, true];
        });
        return true;
    }
    function _tplResume(a) { return '我叫' + a.name + '，' + a.cards.exp + '。個性' + a.cards.pers.join('、') + '，想來書咖試試看。'; }
    function _endIv(x) { const now = Date.now(); x.state = 'waiting'; x.interviewedAt = now; x.expireAt = now + KEEP_DAYS * DAY_MS; }
    async function ask(appId, q) {
        q = String(q || '').trim().slice(0, 200);
        if (!q) return { ok: false, why: '先打一句要問的' };
        const a = (await get()).applicants.find(x => x.id === appId);
        if (!a) return { ok: false, why: '找不到這位應徵者' };
        if (a.state !== 'new' || (a.interview || []).length >= ASK_MAX) return { ok: false, why: '面試已經結束了' };
        const ans = await _interviewCall(a, q);
        if (!ans) return { ok: false, why: '他好像沒聽清楚，再問一次' };
        return _mut(async (s2) => {
            const x = s2.applicants.find(v => v.id === appId);
            if (!x || x.state !== 'new') return [{ ok: false, why: '面試已經結束了' }, false];
            x.interview = (x.interview || []).concat({ q, a: ans });
            if (x.interview.length >= ASK_MAX) _endIv(x);
            return [{ ok: true, a: ans, left: ASK_MAX - x.interview.length, ended: x.state === 'waiting' }, true];
        });
    }
    function endInterview(appId) {
        return _mut(async (s2) => {
            const x = s2.applicants.find(v => v.id === appId);
            if (!x || x.state !== 'new') return [false, false];
            _endIv(x);
            return [true, true];
        });
    }
    // 打電話錄取：沒面試或面完一天內＝一定來；拖太久，真本事越好越可能已經去別家
    function call(appId, slot) {
        return _mut(async (s2, b) => {
            const a = s2.applicants.find(x => x.id === appId);
            if (!a) return [{ ok: false, why: '找不到這位應徵者' }, false];
            if (!slot) slot = !s2.slots.am ? 'am' : (!s2.slots.pm ? 'pm' : null);
            if (!slot) return [{ ok: false, why: '早班晚班都有人了，先請一位走' }, false];
            if (s2.slots[slot]) return [{ ok: false, why: SHIFT[slot].label + '已經有人了' }, false];
            const now = Date.now();
            s2.applicants = s2.applicants.filter(x => x.id !== appId);
            if (a.interviewedAt && now - a.interviewedAt > DAY_MS && Math.random() < goneP(a.stats)) {
                _log(s2, b, 'declined', a, '打電話過去，他已經去別家上班了', slot);
                return [{ ok: true, accepted: false, line: _pickOne(Math.random, DECLINE), name: a.name }, true];
            }
            const today = b.dayNum(now), startDay = b.minOf(now) < SHIFT[slot].start ? today : today + 1;
            const m = { sid: a.id, name: a.name, gender: a.gender, look: a.look, cards: a.cards, claim: a.claim, stats: a.stats, wage: a.wage, resume: a.resume, hiredAt: now, startDay, unpaid: 0, brain: a.brain || null };
            s2.slots[slot] = m;
            const when = (startDay === today ? '今天' : '明天') + ' ' + _hm(SHIFT[slot].start);
            _log(s2, b, 'hire', m, '錄取了（' + SHIFT[slot].label + '，日薪 ' + a.wage + '），' + when + ' 開始上班', slot);
            return [{ ok: true, accepted: true, line: _fill(_pickOne(Math.random, ACCEPT), { when }), slot, startDay, name: a.name }, true];
        });
    }
    function fire(slot) {
        return _mut(async (s2, b) => {
            const m = s2.slots[slot];
            if (!m) return [false, false];
            s2.slots[slot] = null;
            _log(s2, b, 'fire', m, '被請走了（' + SHIFT[slot].label + '空出來）', slot);
            // 🧠 另一班的人記得同事被請走（7 天內比較認真、心情掉）
            const NB = _brain(), other = s2.slots[slot === 'am' ? 'pm' : 'am'];
            if (NB && other) { const c = NB.normCard(other.brain, other.stats, _hash(String(other.sid))); NB.coworkerFired(c); other.brain = c; other.brainRev = (other.brainRev || 0) + 1; }
            return [true, true];
        });
    }
    // 🧠 老闆的按鈕（11-24，小斐企劃 2.4）：誇獎、請他吃、加薪、扣薪、責備、放假一天。每顆每人一天按一次
    function bossAct(slot, act) {
        return _mut(async (s2, b) => {
            const NB = _brain(), m = s2.slots[slot];
            if (!NB || !m) return [{ ok: false, why: '這班沒人' }, false];
            const now = Date.now(), today = b.dayNum(now);
            m.bossLog = m.bossLog || {};
            if (m.bossLog[act] === today) return [{ ok: false, why: '今天已經' + (NB.BOSS[act] || {}).name + '過了，明天再說' }, false];
            const c = NB.normCard(m.brain, m.stats, _hash(String(m.sid)));
            if (act === 'treat') {
                const fd = await b.fundLoad();
                if (fd.coins < TREAT_COST) return [{ ok: false, why: '帳戶不夠（請吃要 ' + TREAT_COST + ' 元）' }, false];
                fd.coins -= TREAT_COST; await b.set('fund', fd);
            }
            if (act === 'rest') {
                const day = b.minOf(now) < SHIFT[slot].start ? today : today + 1;
                if (m.offDay != null && m.offDay >= day) return [{ ok: false, why: '已經排了放假' }, false];
                m.offDay = day;
            }
            const r = NB.boss(c, act);
            if (!r.ok) return [r, false];
            m.brain = c; m.brainRev = (m.brainRev || 0) + 1;
            m.bossLog[act] = today; s2.bossDay = today;
            const extra = act === 'rest' ? '（' + (m.offDay === today ? '今天' : '明天') + SHIFT[slot].label + '）' : act === 'treat' ? '（花 ' + TREAT_COST + '）' : '';
            _log(s2, b, 'boss', m, r.line + extra, slot);
            return [{ ok: true, line: r.line }, true];
        });
    }
    // 過期的應徵者消失（面過、在等通知的寫一行）
    function expire() {
        return _mut(async (s2, b) => {
            const now = Date.now();
            const keep = [];
            for (const a of s2.applicants) {
                if (a.expireAt > now) { keep.push(a); continue; }
                if (a.state === 'waiting') _log(s2, b, 'gone', a, '等不到通知，找到別的工作了');
            }
            const changed = keep.length !== s2.applicants.length;
            s2.applicants = keep;
            return [changed, changed];
        });
    }

    // ── 🗣 兩通模型（副模型，名冊 cafe_hire）：數字只拿來描述行為，不准講出來 ──
    const DESC = {
        acct: ['often guesses wrong when counting stock and money', 'a bit careless with counting', 'counts stock reasonably well', 'careful with numbers', 'very sharp with stock and accounts'],
        hand: ['slow and clumsy behind the counter', 'a little slow', 'works at an ordinary pace', 'quick', 'very quick and nimble'],
        dili: ['often late or skips shifts', 'sometimes late', 'usually on time', 'reliable', 'never misses a shift'],
        sweet: ['never tries to recommend anything', 'rarely recommends anything', 'sometimes suggests another drink', 'good at suggesting things customers end up liking', 'very persuasive with customers'],
        honest: ['makes up experience and lies smoothly', 'exaggerates a lot', 'exaggerates a little', 'mostly honest', 'completely straightforward and admits what they have not done'],
    };
    const _d = (k, v) => DESC[k][_clamp(v, 1, 5) - 1];
    function _truth(a) {
        return '- stock and accounts: ' + _d('acct', a.stats.acct) + '\n- speed: ' + _d('hand', a.stats.hand) + '\n- attendance: ' + _d('dili', a.stats.dili) +
            '\n- selling: ' + _d('sweet', a.stats.sweet) + '\n- honesty: ' + _d('honest', a.stats.honest);
    }
    function _cfg() {
        let config = {};
        const OS = win.OS_SETTINGS || window.OS_SETTINGS;
        if (OS) {
            const sec = OS.getSecondaryConfig ? OS.getSecondaryConfig() : null;
            config = (sec && (sec.key || (sec.useSystemApi && sec.stProfileId))) ? sec : (OS.getConfig ? OS.getConfig() : {});
        }
        config = Object.assign({}, config || {});
        config.route = 'cafe_hire';
        return config;
    }
    function _chat(msgs, label) {
        const api = win.OS_API || window.OS_API;
        if (!api || !api.chat) return Promise.resolve(null);
        return new Promise((res) => {
            try { api.chat(msgs, _cfg(), null, (r) => res(String(r == null ? '' : r)), () => res(null), { task: 'cafe_hire', label, keepCodeFences: true }); }
            catch (e) { res(null); }
        });
    }
    const RESUME_SYS =
        'You write short job applications for people applying to work at a small book café in a fictional city.\n' +
        'Each applicant has visible cards (personality, the experience they claim) and hidden true traits.\n' +
        'Write each application the way the applicant would write about themselves: first person, Traditional Chinese, plain everyday words, 2 to 3 sentences — who they are, what they say they have done, and why they want this job.\n' +
        'Rules:\n' +
        '- Never mention scores, numbers, or the names of the hidden traits.\n' +
        '- Honesty decides how they present themselves: an honest applicant describes the claimed experience modestly and accurately; a dishonest one exaggerates and sounds more capable than they really are.\n' +
        '- Let the personality cards set the tone.\n' +
        '- Do not invent names of other people or real brands.\n' +
        'Output one block per applicant and nothing else:\n' +
        '<applicant id="APPLICANT_ID"><resume>APPLICATION TEXT</resume></applicant>';
    async function _writeResumes(list) {
        const user = '<applicants>\n' + list.map(a =>
            '<applicant id="' + a.id + '">\nname: ' + a.name + '\ngender: ' + (a.gender === 'f' ? 'female' : 'male') +
            '\npersonality cards: ' + a.cards.pers.join('、') + '\nclaimed experience: ' + a.cards.exp + '\nhidden true traits:\n' + _truth(a) + '\n</applicant>').join('\n') + '\n</applicants>';
        const raw = await _chat([{ role: 'system', content: RESUME_SYS }, { role: 'user', content: user }], '書咖應徵者履歷');
        const out = {};
        if (!raw) return out;
        for (const m of raw.matchAll(/<applicant\s+id="([^"]+)"\s*>\s*<resume>([\s\S]*?)<\/resume>\s*<\/applicant>/g)) {
            const text = m[2].replace(/<[^>]+>/g, '').trim().slice(0, 160);
            if (text) out[m[1]] = text;
        }
        return out;
    }
    function _interviewSys(a) {
        return 'You are role-playing ' + a.name + ', a job applicant being interviewed by the owner of a small book café. Stay in character the whole time.\n' +
            '<who>\nname: ' + a.name + '\ngender: ' + (a.gender === 'f' ? 'female' : 'male') + '\npersonality cards: ' + a.cards.pers.join('、') +
            '\nexperience written on the application: ' + a.cards.exp + '\napplication text: ' + (a.resume || _tplResume(a)) + '\n</who>\n' +
            '<truth>\nThese are hidden. Never say these words or any numbers; let them show only through how you answer.\n' + _truth(a) + '\n</truth>\n' +
            'How to answer:\n' +
            '- Answer only the owner\'s latest question, the way ' + a.name + ' would say it out loud: Traditional Chinese, plain everyday words, at most three sentences.\n' +
            '- Stay consistent with the application. If you are dishonest, keep claiming the written experience, but when asked for concrete details you do not really know (exact steps, amounts, how long, what happened at the last job), your answer turns vague, contradicts itself, or changes the subject.\n' +
            '- If you are honest, admit what you have not done.\n' +
            '- Your true traits leak through the details: careless with numbers gives fuzzy answers about counting; often late is vague about schedules; persuasive people naturally pitch themselves.\n' +
            '- No narration, no stage directions, no lists.\n' +
            'Output: <answer>WHAT YOU SAY</answer>';
    }
    async function _interviewCall(a, q) {
        const msgs = [{ role: 'system', content: _interviewSys(a) }];
        for (const x of (a.interview || [])) { msgs.push({ role: 'user', content: x.q }); msgs.push({ role: 'assistant', content: '<answer>' + x.a + '</answer>' }); }
        msgs.push({ role: 'user', content: q });
        const raw = await _chat(msgs, '書咖面試');
        if (!raw) return null;
        const m = raw.match(/<answer>([\s\S]*?)<\/answer>/);
        const text = (m ? m[1] : raw).replace(/<[^>]+>/g, '').trim().slice(0, 200);
        return text || null;
    }

    // ── 🖼 員工頁（櫃台窗第七頁）：上面兩班、中間徵人、下面員工日記；面試和打電話在同一個窗裡切換／蓋上來 ──
    // 🚨 素材庫鎖 commit 抓：sound-files 超過 jsDelivr 的 50MB，用 @main 抓「還沒人抓過的圖」會被擋 403（10-13 便服圖、制服圖都遇到），鎖 commit 的網址照常給
    const ASSET_REF = '4fcd96437e54c72dca64ca1cf86ff38428f044b9';
    const LOOK_BASE = 'https://cdn.jsdelivr.net/gh/nancywang3641/sound-files@' + ASSET_REF + '/cafe_guests_v1/';
    const UNI_BASE = 'https://cdn.jsdelivr.net/gh/nancywang3641/sound-files@' + ASSET_REF + '/cafe_staff_v1/';
    // 建議問題（她不知道怎麼當 HR：旁邊一直有三句可以直接點）
    const ASK_POOL = [
        '為什麼想來書咖工作？', '之前的工作做了多久？為什麼離開？', '早上開店前，你覺得要先做哪些事？',
        '如果某杯賣完了，客人很失望，你會怎麼辦？', '如果今天備太多料，打烊時剩一堆，你會怎麼想？', '上一份工作的店長會怎麼形容你？',
        '排班的時候，你哪幾天比較不方便？', '算錢、點貨這種事，你拿手嗎？', '客人很多的時候，你通常怎麼應付？',
        '你覺得自己最大的缺點是什麼？', '客人猶豫不知道點什麼，你會怎麼推薦？', '說說你做過最忙的一天。',
    ];
    const KIND_ICON = { prep: 'fa-basket-shopping', restock: 'fa-rotate', absent: 'fa-bed', late: 'fa-clock', nopay: 'fa-coins', quit: 'fa-door-open', fire: 'fa-door-open', gone: 'fa-person-walking-arrow-right', declined: 'fa-phone-slash', hire: 'fa-handshake', shift: 'fa-mug-hot', boss: 'fa-user-tie', rest: 'fa-umbrella-beach', mood: 'fa-face-frown', fridge: 'fa-snowflake', shop: 'fa-broom', pest: 'fa-bug', insp: 'fa-clipboard-check' };
    const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    function _hash(str) { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0; return h; }
    function _ensureStyle(doc) {
        if (doc.getElementById('os-cafe-hire-style')) return;
        const st = doc.createElement('style');
        st.id = 'os-cafe-hire-style';
        const looks = LOOKS.f.concat(LOOKS.m).map(l => '.och-pic.och-look-' + l + '{background-image:url("' + LOOK_BASE + l + '.webp");background-size:300% auto;background-position:0 0;}').join('');
        st.textContent =
            '.och-wrap{display:flex;flex-direction:column;gap:2px;}.och-sec{margin-top:12px;}' +
            '.och-slots{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;}' +
            '.och-slot{position:relative;display:flex;flex-direction:column;gap:6px;padding:9px 10px;border:1px solid rgba(194,164,124,.56);border-radius:12px;background:rgba(255,253,248,.72);min-width:0;}' +
            '.och-slot.empty{border-style:dashed;background:rgba(255,253,248,.35);}' +
            '.och-slot-label{color:#8a6a4a;font-size:10px;font-weight:800;letter-spacing:.04em;}' +
            '.och-slot-main{display:flex;gap:8px;align-items:flex-start;min-width:0;}' +
            '.och-empty-slot{display:flex;flex-direction:column;align-items:center;gap:5px;padding:12px 0;color:#a58b70;font-size:11px;}.och-empty-slot i{font-size:20px;color:#c9ab84;}' +
            '.och-pic{display:block;flex:none;width:54px;height:80px;border-radius:10px;background-color:rgba(186,134,79,.12);background-repeat:no-repeat;}' +
            '.och-pic.och-sm{width:44px;height:64px;}' +
            '.och-pic.och-uni-f{background-image:url("' + UNI_BASE + 'female.webp");background-size:contain;background-position:center bottom;}' +
            '.och-pic.och-uni-m{background-image:url("' + UNI_BASE + 'male.webp");background-size:contain;background-position:center bottom;}' + looks +
            '.och-info{display:flex;flex-direction:column;gap:3px;min-width:0;}' +
            '.och-name{color:#573b26;font-weight:800;font-size:13px;}' +
            '.och-cards{display:flex;flex-wrap:wrap;gap:3px;}.och-card{padding:1px 6px;border-radius:9px;background:#efe3d2;color:#7d5f42;font-size:10px;font-style:normal;}.och-card.och-exp{background:rgba(122,79,45,.12);color:#6d4425;}' +
            '.och-wage{color:#9d6638;font-size:11px;font-weight:700;}' +
            '.och-status{align-self:flex-start;padding:1px 7px;border-radius:8px;font-size:10px;font-weight:700;background:#efe3d2;color:#7d5f42;}.och-status.on{background:rgba(78,139,87,.15);color:#3c6b44;}.och-status.bad{background:rgba(182,80,80,.13);color:#a14444;}.och-status.off{background:rgba(120,110,100,.12);color:#7a7068;}' +
            '.och-fire{align-self:flex-end;background:none;border:none;color:#a58b70;font-size:10px;cursor:pointer;padding:2px 4px;border-radius:6px;}.och-fire:hover{color:#a14444;background:rgba(182,80,80,.08);}' +
            '.och-ad{display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px dashed #c9a476;border-radius:11px;background:rgba(255,248,236,.85);color:#6d4425;font-size:12px;font-weight:700;}' +
            '.och-ap{display:flex;gap:10px;margin-top:8px;padding:10px;border:1px solid rgba(194,164,124,.56);border-radius:12px;background:rgba(255,253,248,.72);}' +
            '.och-ap-main{display:flex;flex-direction:column;gap:5px;min-width:0;flex:1;}' +
            '.och-ap-top{display:flex;align-items:baseline;gap:8px;}.och-ap-top .och-wage{margin-left:auto;}' +
            '.och-resume{margin:0;color:#6a5440;font-size:11.5px;line-height:1.6;}' +
            '.och-ap-ops{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:2px;}' +
            '.och-left{color:#a18465;font-size:10px;margin-right:auto;}' +
            '.och-btn{background:rgba(122,79,45,.08);border:1px solid #c9a476;color:#6d4425;border-radius:8px;padding:5px 10px;cursor:pointer;font-size:11px;font-weight:700;}.och-btn.och-main{background:#7a4f2d;border-color:#6d4425;color:#fff8ed;}.och-btn:disabled{opacity:.45;cursor:default;}' +
            '.och-log{display:flex;gap:7px;align-items:baseline;padding:6px 2px;border-bottom:1px dashed rgba(160,120,80,.2);color:#6a5440;font-size:11.5px;line-height:1.5;}.och-log i{color:#b08a62;width:14px;text-align:center;flex:none;}.och-log.bad i{color:#b65050;}' +
            '.och-log-time{color:#a58b70;font-size:10px;white-space:nowrap;flex:none;}.och-log-none{color:#a58b70;font-size:11px;padding:8px 2px;}' +
            /* 面試 */
            '.och-iv{display:flex;flex-direction:column;gap:8px;min-height:100%;}' +
            '.och-back{align-self:flex-start;background:none;border:none;color:#7a5a3c;cursor:pointer;font-size:12px;font-weight:700;padding:3px 4px;border-radius:7px;}.och-back:hover{background:rgba(122,79,45,.08);}' +
            '.och-iv-head{display:flex;gap:10px;padding:10px;border:1px solid rgba(194,164,124,.56);border-radius:12px;background:rgba(255,253,248,.72);}' +
            '.och-chat{display:flex;flex-direction:column;gap:7px;flex:1;padding:4px 0;}' +
            '.och-q,.och-a{max-width:84%;padding:7px 10px;border-radius:12px;font-size:12px;line-height:1.6;}' +
            '.och-q{align-self:flex-end;background:#7a4f2d;color:#fff8ed;border-bottom-right-radius:4px;}' +
            '.och-a{align-self:flex-start;background:rgba(255,253,248,.92);border:1px solid #dcc9aa;color:#4a3828;border-bottom-left-radius:4px;}.och-a.och-think{color:#a58b70;}' +
            '.och-chat-none{color:#a58b70;font-size:11px;text-align:center;padding:10px 0;}' +
            '.och-ask{display:flex;flex-direction:column;gap:6px;padding-top:6px;border-top:1px dashed rgba(160,120,80,.25);}' +
            '.och-sugs{display:flex;flex-direction:column;gap:4px;}.och-sug{text-align:left;background:rgba(255,255,255,.6);border:1px solid #d8c3a1;color:#5a4634;border-radius:9px;padding:6px 9px;cursor:pointer;font-size:11.5px;}.och-sug:hover{background:#f6ead8;}.och-sug:disabled{opacity:.45;cursor:default;}' +
            '.och-input-row{display:flex;gap:6px;}.och-input{flex:1;min-width:0;box-sizing:border-box;background:rgba(255,255,255,.8);border:1px solid #d3bf9f;border-radius:9px;color:#4a3a2a;padding:7px 9px;font-size:12px;}' +
            '.och-ask-foot{display:flex;align-items:center;gap:6px;}' +
            '.och-done{padding:9px 10px;border-radius:10px;background:rgba(186,134,79,.1);color:#7a5a3c;font-size:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;}' +
            /* 打電話 */
            '.och-call{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;background:rgba(60,40,25,.32);}' +
            '.och-call-card{width:min(290px,86%);box-sizing:border-box;display:flex;flex-direction:column;align-items:center;gap:9px;padding:16px 14px;background:#fffaf2;border:1px solid #d8c3a1;border-radius:14px;box-shadow:0 12px 30px rgba(69,46,27,.3);text-align:center;color:#4a3828;}' +
            '.och-call-icon{display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:#7a4f2d;color:#fff8ed;font-size:18px;}' +
            '.och-call-line{font-size:13px;line-height:1.6;}.och-call-note{color:#8a6a4a;font-size:11px;line-height:1.5;}.och-call-ops{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;}' +
            '@media (prefers-reduced-motion:no-preference){.och-ringing .och-call-icon{animation:och-ring .9s ease-in-out infinite;}}' +
            '@keyframes och-ring{0%,100%{transform:rotate(0)}20%{transform:rotate(-14deg)}40%{transform:rotate(12deg)}60%{transform:rotate(-8deg)}80%{transform:rotate(5deg)}}' +
            /* 🧠 狀態條、老闆按鈕 */
            '.och-bars{display:flex;flex-direction:column;gap:3px;margin-top:2px;}' +
            '.och-bar{display:grid;grid-template-columns:28px minmax(0,1fr) 22px;align-items:center;gap:5px;color:#8a6a4a;font-size:10px;}' +
            '.och-bar-track{height:6px;border-radius:4px;background:rgba(160,120,80,.16);overflow:hidden;}.och-bar-fill{display:block;height:100%;border-radius:4px;background:#b08a62;}' +
            '.och-bar-fill.lo{background:#c46a5a;}.och-bar-fill.hi{background:#6f9a5c;}.och-bar-num{text-align:right;color:#7d5f42;}' +
            '.och-mems{display:flex;flex-wrap:wrap;gap:3px;}.och-mem{padding:1px 6px;border-radius:9px;background:rgba(122,79,45,.08);color:#8a6a4a;font-size:10px;}' +
            '.och-boss{display:flex;flex-wrap:wrap;gap:4px;padding-top:6px;border-top:1px dashed rgba(160,120,80,.25);}' +
            '.och-boss button{flex:1 1 auto;min-width:0;background:rgba(122,79,45,.06);border:1px solid #d8c3a1;color:#6d4425;border-radius:8px;padding:4px 6px;cursor:pointer;font-size:10.5px;font-weight:700;white-space:nowrap;}.och-boss button:hover{background:#f6ead8;}.och-boss button:disabled{opacity:.4;cursor:default;}' +
            '.och-shop{display:flex;flex-wrap:wrap;gap:6px 12px;padding:8px 10px;border-radius:10px;background:rgba(186,134,79,.08);color:#6d4425;font-size:11.5px;margin-bottom:8px;}.och-shop b{font-weight:800;}' +
            '.och-hyg{align-items:center;}.och-red{color:#a14444;font-weight:700;}.och-clean{margin-left:auto;background:#fff;border:1px solid #d8c3a1;color:#6d4425;border-radius:8px;padding:4px 10px;cursor:pointer;font-size:11px;font-weight:800;white-space:nowrap;}.och-clean:hover{background:#f6ead8;}.och-clean:disabled{opacity:.45;cursor:default;}' +
            '@media (max-width:420px){.och-slot-main{flex-direction:column;}.och-pic{width:46px;height:68px;}}';
        doc.head.appendChild(st);
    }
    function _registerHelp() {
        const A = win.AUI || window.AUI;
        if (!A || !A.registerHelp || _registerHelp.done) return;
        _registerHelp.done = true;
        A.registerHelp({ cafe_crew: { title: '員工', body:
            '貼一張徵人啟事要花 ' + AD_COST + '，' + AD_HOURS + ' 小時後會來 ' + APPLY_N + ' 位應徵者，每位都會交一份履歷。\n' +
            '可以約面試：直接點旁邊的建議問題，或自己打字，最多問 ' + ASK_MAX + ' 句。每問一句會用到一次額度（對應設置裡「書咖應聘」那一列）；履歷則是一批一起產生，只算一次。\n' +
            '每個人都有一些當下看不到的本事：備料準不準、手腳快不快、會不會請假（第一班一定準時到）、會不會推銷、說話老不老實。履歷和面試只是他自己說的，要真正上班之後才看得出來。\n' +
            '想錄取就按「打電話錄取」，並選擇早班或晚班。面試結束後一天內打去，對方一定會來；拖太久，好的人可能已經去別家了。若一直不打，' + KEEP_DAYS + ' 天後他會自己去找別的工作。\n' +
            '早班 08:30 上班，會先看前幾天賣得怎樣，再把當天的材料備好；晚班 15:30 上班，會先看還剩多少再補。哪一杯在他班上賣完了，過一陣子他就會再補一些。備料一天最多只用掉帳戶裡的一半。\n' +
            '薪水會在他上班時從書咖帳戶支付。若那天付不出薪水，他就不會來；連續 ' + 3 + ' 天沒領到，他就會辭職。\n' +
            '你自己在菜單頁備好的材料，一樣要等到下一次 9 點開店才會上架。\n\n' +
            '店員有個性和三個會變的狀態：體力（連上三天開始累，放假一天回滿）、心情、對妳的好感。每班他會自己挑事做：招呼客人、推薦、整理店裡、跟熟客聊天，偷懶的會滑手機、坐著喘氣。\n' +
            '每班有一個服務分：嘴甜、心情好、有精神就高。服務分高，客人付得多、比較常回來、書咖人氣往上；被客人看到滑手機，服務分和人氣會掉。早班看手腳快不快，晚班看嘴甜。\n' +
            '沒人在班（沒雇人、請假、放假）時，一半客人看沒人顧就走了，留下的也少付一成，人氣每班 −3，賣完也沒人補。開著「值班」讓小機顧店，就不會被扣。\n' +
            '按鈕：誇獎、請他吃（花 ' + TREAT_COST + '）、加薪、扣薪、責備、放假一天，每顆每人一天按一次。薪水分低、平、高：給得低好感每天掉，給得高要多花錢。好感太低又心情差，他會說不想做，再不理他就辭職；誇獎或加薪可以留住他。\n\n' +
            '店況：客人坐過、每天打烊，店裡都會變髒；店員會自己挑時間擦桌、整理書櫃（越髒越會去擦），小機值班每天打烊會順手掃一次。太髒服務分會掉、客人心情變差；髒度 60 以上，晚上可能跑出老鼠或蟑螂，客人看到多半直接走，要連幾天保持乾淨才會搬走。\n' +
            '備的料放滿兩天就過期，要有人倒掉：店員備料時會看一眼冰箱，也會挑時間清冰箱。沒倒掉的話，偶爾會被拿去用，客人回家吃壞肚子。\n' +
            '客人等太久會抱怨（嘴甜的店員安撫得了），再久就走掉，之後一陣子比較少來；心情好的會多點一份、說很喜歡這裡（店員會記得）。\n' +
            '一週內客訴（等太久走掉、看到蟲鼠、吃壞肚子、嫌髒）累積 4 件，衛生局一兩天內會來檢查；平常也偶爾突然抽查。乾淨＝人氣 +5；有點髒或冰箱有過期的料＝警告罰 ' + HYG.fineWarn + '；有蟲鼠、很髒或有人吃壞肚子＝不合格罰 ' + HYG.fineFail + '，隔天停業整頓（那天會整間大掃除）。\n' +
            '不想等店員慢慢清，可以按「叫清潔公司」：' + HYG.cleanCost + '，有蟲鼠多 ' + HYG.pestCost + '，店裡、冰箱、蟲鼠一次處理好。' } });
    }
    function _picCls(x, uniform) { return uniform ? 'och-uni-' + (x.gender === 'm' ? 'm' : 'f') : 'och-look-' + x.look; }
    function _cardsHtml(x) { return '<span class="och-cards">' + (x.cards.pers || []).map(p => '<i class="och-card">' + _esc(p) + '</i>').join('') + '<i class="och-card och-exp">' + _esc(x.cards.exp) + '</i></span>'; }
    function _statusOf(s2, slot, m, b) {
        const now = Date.now(), today = b.dayNum(now), min = b.minOf(now);
        if (m.startDay > today) return { cls: '', text: '明天開始' };
        const d = (s2.duty || {})[today + ':' + slot];
        if (d && d.off === 'absent') return { cls: 'off', text: '今天請假' };
        if (d && d.off === 'nopay') return { cls: 'bad', text: '沒領到薪水，今天沒來' };
        if (d && min >= d.from && min < d.to) return { cls: 'on', text: '上班中' };
        if (min >= SHIFT[slot].end) return { cls: 'off', text: '下班了' };
        if (d && min < d.from) return { cls: 'bad', text: '遲到，' + _hm(d.from) + ' 才到' };
        return { cls: '', text: _hm(SHIFT[slot].start) + ' 上班' };
    }
    function _slotHtml(s2, slot, b) {
        const m = s2.slots[slot], lab = SHIFT[slot].label + ' ' + _hm(SHIFT[slot].start) + '–' + _hm(SHIFT[slot].end);
        if (!m) return '<div class="och-slot empty"><span class="och-slot-label">' + lab + '</span><div class="och-empty-slot"><i class="fa-solid fa-user-plus"></i>這班還沒人</div></div>';
        const st = _statusOf(s2, slot, m, b);
        const NB = _brain();
        const c = NB ? NB.normCard(m.brain, m.stats, _hash(String(m.sid))) : null;
        const v = c ? NB.view(c) : null;
        const tierPay = c ? Math.round(m.wage * ((NB.TIERS[c.tier] || NB.TIERS.mid).pay)) : m.wage;
        const bar = (lab2, n) => '<span class="och-bar">' + lab2 + '<span class="och-bar-track"><span class="och-bar-fill' + (n < 30 ? ' lo' : n >= 70 ? ' hi' : '') + '" style="width:' + n + '%"></span></span><span class="och-bar-num">' + n + '</span></span>';
        const today = b ? b.dayNum(Date.now()) : 0, bl = m.bossLog || {};
        const bossBtn = (act, icon, label) => '<button data-boss="' + act + '" data-slot="' + slot + '"' + (bl[act] === today ? ' disabled' : '') + '><i class="fa-solid ' + icon + '"></i> ' + label + '</button>';
        const persChip = v && !(m.cards.pers || []).includes(v.pers) ? '<i class="och-card">' + _esc(v.pers) + '</i>' : '';
        return '<div class="och-slot"><span class="och-slot-label">' + lab + '</span><div class="och-slot-main"><span class="och-pic och-sm ' + _picCls(m, true) + '"></span>' +
            '<div class="och-info"><b class="och-name">' + _esc(m.name) + '</b>' + (persChip ? '<span class="och-cards">' + persChip + '</span>' : '') + _cardsHtml(m) +
            '<span class="och-wage">日薪 ' + tierPay + (v ? '（薪水' + v.tier + '）' : '') + '</span>' +
            '<span class="och-status ' + st.cls + '">' + st.text + '</span>' + (m.unpaid ? '<span class="och-status bad">欠薪 ' + m.unpaid + ' 天</span>' : '') +
            (v && v.quitWarn ? '<span class="och-status bad">說不想做了</span>' : '') + (m.offDay != null && m.offDay >= today ? '<span class="och-status off">' + (m.offDay === today ? '今天' : '明天') + '放假</span>' : '') + '</div></div>' +
            (v ? '<div class="och-bars">' + bar('體力', v.sta) + bar('心情', v.mood) + bar('好感', v.fav) + '</div>' +
                (v.mem.length ? '<span class="och-mems">' + v.mem.map(x => '<i class="och-mem">記得：' + _esc(x.name) + '（' + x.left + ' 天）</i>').join('') + '</span>' : '') +
                '<div class="och-boss">' + bossBtn('praise', 'fa-thumbs-up', '誇獎') + bossBtn('treat', 'fa-cookie-bite', '請吃') + bossBtn('raise', 'fa-arrow-up', '加薪') +
                bossBtn('cut', 'fa-arrow-down', '扣薪') + bossBtn('scold', 'fa-bullhorn', '責備') + bossBtn('rest', 'fa-umbrella-beach', '放假') + '</div>' : '') +
            '<button class="och-fire" data-slot="' + slot + '"><i class="fa-solid fa-door-open"></i> 請他走</button></div>';
    }
    function _daysLeft(t) { return Math.max(1, Math.ceil((t - Date.now()) / DAY_MS)); }
    function _apHtml(a) {
        const asked = (a.interview || []).length;
        const ops = a.state === 'waiting'
            ? '<span class="och-left">等通知・還剩 ' + _daysLeft(a.expireAt) + ' 天</span><button class="och-btn" data-act="iv">看面試</button>'
            : '<span class="och-left">還剩 ' + _daysLeft(a.expireAt) + ' 天</span><button class="och-btn" data-act="iv">' + (asked ? '繼續面試' : '約面試') + '</button>';
        return '<div class="och-ap" data-id="' + _esc(a.id) + '"><span class="och-pic ' + _picCls(a, false) + '"></span><div class="och-ap-main">' +
            '<div class="och-ap-top"><b class="och-name">' + _esc(a.name) + '</b><span class="och-wage">要日薪 ' + a.wage + '</span></div>' + _cardsHtml(a) +
            '<p class="och-resume">' + _esc(a.resume || '（履歷還在路上）') + '</p>' +
            '<div class="och-ap-ops">' + ops + '<button class="och-btn och-main" data-act="call"><i class="fa-solid fa-phone"></i> 打電話錄取</button></div></div></div>';
    }
    function _logHtml(x, b) {
        const d = new Date((x.day * DAY_MS) + new Date().getTimezoneOffset() * 60000);
        const md = (d.getMonth() + 1) + '/' + d.getDate();
        const bad = ['nopay', 'quit', 'absent', 'late', 'gone', 'declined', 'pest'].includes(x.kind) || (x.kind === 'insp' && /不合格|警告|客訴/.test(x.text || ''));
        return '<div class="och-log' + (bad ? ' bad' : '') + '"><span class="och-log-time">' + md + ' ' + _hm(x.t || 0) + '</span><i class="fa-solid ' + (KIND_ICON[x.kind] || 'fa-circle') + '"></i>' +
            '<span><b>' + _esc(x.name) + '</b> ' + _esc(x.text) + '</span></div>';
    }
    let _openIv = null;   // 正在看哪位的面試（重畫時接著顯示，不跳回列表）
    let _renderSeq = 0;   // 每次重畫一個號碼：等存檔／等模型回來時她可能已經切頁、開了面試、或又重畫了一次，舊的那次就別寫畫面
    function _crewTabOn(body) { const w = body.closest && body.closest('.oc-win'); const on = w && w.querySelector('.oc-tab.on'); return !on || on.dataset.tab === 'crew'; }
    async function renderTab(body) {
        const doc = body.ownerDocument || win.document;
        _ensureStyle(doc); _registerHelp();
        if (_openIv) return _renderInterview(body, _openIv);
        const my = ++_renderSeq;
        const mine = () => my === _renderSeq && !_openIv && body.isConnected && _crewTabOn(body);
        const keepY = body.scrollTop;
        try { await expire(); } catch (e) {}
        let s2 = await get();
        if (s2.ad && s2.ad.readyAt <= Date.now()) {
            if (mine()) body.innerHTML = '<div class="oc-empty"><i class="fa-solid fa-spinner fa-spin"></i>應徵者來了，正在看履歷…</div>';
            let came = false;
            try { came = await arrive(); } catch (e) { console.warn('[CafeHire] 應徵者沒進來', e); }
            // 等模型這幾秒畫面被別次重畫接手了（先顯示模板履歷）：她還停在員工頁列表就再畫一次，換上模型寫的
            if (came && !mine() && body.isConnected && !_openIv && _crewTabOn(body)) return renderTab(body);
            s2 = await get();
        }
        if (s2.unread) { try { await _mut(async (x) => { x.unread = false; return [true, true]; }); } catch (e) {} }
        if (!mine()) return;
        const b = _B();
        const A = win.AUI || window.AUI;
        const ad = s2.ad;
        let adHtml;
        if (ad) {
            const mins = Math.max(1, Math.ceil((ad.readyAt - Date.now()) / 60000)), h = Math.floor(mins / 60), mi = mins % 60;
            adHtml = '<div class="och-ad"><i class="fa-solid fa-hourglass-half"></i>徵人啟事貼出去了，還要 ' + (h ? h + ' 小時 ' : '') + (mi || !h ? mi + ' 分' : '') + '才有人來</div>';
        } else adHtml = '<button class="oc-action och-post"><i class="fa-solid fa-bullhorn"></i> ' + (s2.applicants.length ? '再貼一張徵人啟事' : '貼徵人啟事') + '（' + AD_COST + '）</button>';
        let shopHtml = '';
        try {
            const shop = b && b.get ? await b.get('shop', null) : null;
            if (shop) {
                const last = (shop.shifts || [])[0];
                const nobodyNow = !s2.slots.am && !s2.slots.pm;
                shopHtml = '<div class="och-shop"><span>書咖人氣 <b>' + (shop.popularity || 0) + '</b></span>' +
                    (shop.qAvg != null ? '<span>最近的服務分 <b>' + Math.round(shop.qAvg) + '</b></span>' : '') +
                    (last ? '<span>上一班 ' + (last.slot === 'am' ? '早班' : '晚班') + '：' + (last.who === 'minder' ? '小機值班' : last.who ? _esc(last.who) + ' 服務分 ' + last.q : '沒人顧') + '，人氣 ' + (last.pop >= 0 ? '+' : '') + last.pop + '</span>' : '') +
                    (nobodyNow ? '<span style="color:#a14444">現在沒雇人：客人一半會走、人氣每班 −3</span>' : '') + '</div>';
                // 🧹 店況
                const h = hygNorm(shop.hyg), today = b.dayNum(Date.now());
                const nC = h.complaints.filter(c => c.day > today - HYG.keep).reduce((a, c) => a + (c.w || 1), 0);
                const cost = HYG.cleanCost + (h.pest ? HYG.pestCost : 0);
                const red = (t) => '<span class="och-red">' + t + '</span>';
                const md = (d) => { const x = new Date(d * DAY_MS + new Date().getTimezoneOffset() * 60000); return (x.getMonth() + 1) + '/' + x.getDate(); };
                shopHtml += '<div class="och-shop och-hyg"><span>店裡 <b>' + hygLabel(h.dirt) + '</b>（髒度 ' + Math.round(h.dirt) + '）</span>' +
                    (h.pest ? red('<i class="fa-solid fa-bug"></i> 有' + PEST[h.pest]) : '') +
                    (h.stale.length ? red('冰箱有 ' + new Set(h.stale.map(x => x.id)).size + ' 樣過期的料還沒倒') : '') +
                    (nC ? (nC >= HYG.complainN ? red('這週客訴 ' + nC + ' 件') : '<span>這週客訴 <b>' + nC + '</b> 件</span>') : '') +
                    (h.closed === today ? red('今天停業整頓') : '') +
                    (h.insp && h.insp.told ? red('衛生局這一兩天會來') : '') +
                    (h.last ? '<span>上次衛生檢查 ' + md(h.last.day) + '：<b>' + INSP_RES[h.last.res] + '</b>' + (h.last.fine ? '（罰 ' + h.last.fine + '）' : '') + '</span>' : '') +
                    ((h.dirt >= 30 || h.pest || h.stale.length) ? '<button class="och-clean"><i class="fa-solid fa-broom"></i> 叫清潔公司（' + cost + '）</button>' : '') + '</div>';
            }
        } catch (e) {}
        if (!mine()) return;
        body.innerHTML = '<div class="och-wrap">' +
            '<div class="oc-section-head"><span class="oc-section-title"><i class="fa-solid fa-id-card"></i> 班表</span>' + (A && A.helpBtn ? A.helpBtn('cafe_crew') : '') + '</div>' + shopHtml +
            '<div class="och-slots">' + _slotHtml(s2, 'am', b) + _slotHtml(s2, 'pm', b) + '</div>' +
            '<div class="oc-section-head och-sec"><span class="oc-section-title"><i class="fa-solid fa-bullhorn"></i> 徵人</span><span class="oc-section-note">' + (s2.applicants.length ? s2.applicants.length + ' 位應徵者' : '') + '</span></div>' +
            s2.applicants.map(_apHtml).join('') + adHtml +
            '<div class="oc-section-head och-sec"><span class="oc-section-title"><i class="fa-solid fa-book"></i> 員工日記</span></div>' +
            (s2.diary.length ? s2.diary.slice(0, 30).map(x => _logHtml(x, b)).join('') : '<div class="och-log-none">還沒有紀錄。</div>') +
            '</div>';
        body.scrollTop = keepY;
        const rerender = () => renderTab(body);
        body.querySelector('.och-post')?.addEventListener('click', async (e) => {
            e.currentTarget.disabled = true;
            const r = await postAd();
            if (!r.ok) { A && A.toast ? A.toast(r.why) : null; }
            try { b && b.refreshStats && b.refreshStats(); } catch (er) {}
            rerender();
        });
        body.querySelector('.och-clean')?.addEventListener('click', async (e) => {
            const btn = e.currentTarget;   // await 之後 e.currentTarget 會變 null
            const C = win.OS_CAFE || window.OS_CAFE;
            if (!C || !C.cleanShop) return;
            const ok = A && A.confirm ? await A.confirm('叫清潔公司來整間打掃（連冰箱、蟲鼠一起處理）？錢從書咖帳戶出。', { title: '叫清潔公司' }) : true;
            if (!ok) return;
            btn.disabled = true;
            const r = await C.cleanShop();
            if (A && A.toast) A.toast(r && r.ok ? '清潔公司來過了，花了 ' + r.cost + '，店裡乾乾淨淨' : ((r && r.why) || '沒叫成'));
            try { b && b.refreshStats && b.refreshStats(); } catch (er) {}
            rerender();
        });
        body.querySelectorAll('[data-boss]').forEach(btn => btn.addEventListener('click', async () => {
            const act = btn.dataset.boss, slot = btn.dataset.slot, m = s2.slots[slot];
            if (!m) return;
            if (act === 'cut' || act === 'scold') {
                const ok = A && A.confirm ? await A.confirm((act === 'cut' ? '要扣' + m.name + '的薪水嗎？他的好感會掉很多，可能會想走。' : '要罵' + m.name + '一頓嗎？心情和好感會掉。'), { title: act === 'cut' ? '扣薪' : '責備' }) : true;
                if (!ok) return;
            }
            btn.disabled = true;
            const r = await bossAct(slot, act);
            if (A && A.toast) A.toast(r && r.ok ? m.name + r.line : ((r && r.why) || '沒按成'));
            try { b && b.refreshStats && b.refreshStats(); } catch (er) {}
            rerender();
        }));
        body.querySelectorAll('.och-fire').forEach(btn => btn.addEventListener('click', async () => {
            const slot = btn.dataset.slot, m = s2.slots[slot];
            if (!m) return;
            const ok = A && A.confirm ? await A.confirm('請' + m.name + '走嗎？' + SHIFT[slot].label + '會空出來。', { title: '請他走' }) : true;
            if (!ok) return;
            await fire(slot);
            rerender();
        }));
        body.querySelectorAll('.och-ap').forEach(card => card.addEventListener('click', (e) => {
            const btn = e.target.closest('.och-btn');
            if (!btn) return;
            const id = card.dataset.id;
            if (btn.dataset.act === 'iv') { _openIv = id; _renderInterview(body, id); }
            else if (btn.dataset.act === 'call') _callFlow(body, id, s2);
        }));
    }
    function _sugsFor(a) {
        const asked = new Set((a.interview || []).map(x => x.q));
        const pool = ASK_POOL.filter(q => !asked.has(q));
        const h = _hash(a.id + ':' + (a.interview || []).length);
        const out = [];
        for (let i = 0; out.length < 3 && i < pool.length; i++) { const q = pool[(h + i * 7) % pool.length]; if (!out.includes(q)) out.push(q); }
        return out;
    }
    async function _renderInterview(body, id) {
        const my = ++_renderSeq;
        const s2 = await get();
        if (my !== _renderSeq || _openIv !== id || !body.isConnected || !_crewTabOn(body)) return;
        const a = s2.applicants.find(x => x.id === id);
        if (!a) { _openIv = null; return renderTab(body); }
        const live = a.state === 'new' && (a.interview || []).length < ASK_MAX;
        const left = ASK_MAX - (a.interview || []).length;
        body.innerHTML = '<div class="och-iv">' +
            '<button class="och-back"><i class="fa-solid fa-arrow-left"></i> 回員工頁</button>' +
            '<div class="och-iv-head"><span class="och-pic ' + _picCls(a, false) + '"></span><div class="och-info"><b class="och-name">' + _esc(a.name) + '</b>' + _cardsHtml(a) +
            '<span class="och-wage">要日薪 ' + a.wage + '</span><p class="och-resume">' + _esc(a.resume || '') + '</p></div></div>' +
            '<div class="och-chat">' + ((a.interview || []).length ? a.interview.map(x => '<div class="och-q">' + _esc(x.q) + '</div><div class="och-a">' + _esc(x.a) + '</div>').join('') : '<div class="och-chat-none">問他點什麼吧。</div>') + '</div>' +
            (live
                ? '<div class="och-ask"><div class="och-sugs">' + _sugsFor(a).map(q => '<button class="och-sug">' + _esc(q) + '</button>').join('') + '</div>' +
                  '<div class="och-input-row"><input class="och-input" maxlength="120" placeholder="自己問一句"><button class="och-btn och-main och-send"><i class="fa-solid fa-paper-plane"></i></button></div>' +
                  '<div class="och-ask-foot"><span class="och-left">還能問 ' + left + ' 句</span><button class="och-btn och-end">面試結束</button><button class="och-btn och-main" data-act="call"><i class="fa-solid fa-phone"></i> 打電話錄取</button></div></div>'
                : '<div class="och-done"><span class="och-left">面試結束了，他在等通知（還剩 ' + _daysLeft(a.expireAt) + ' 天）</span><button class="och-btn och-main" data-act="call"><i class="fa-solid fa-phone"></i> 打電話錄取</button></div>') +
            '</div>';
        body.scrollTop = body.scrollHeight;
        body.querySelector('.och-back').addEventListener('click', () => { _openIv = null; renderTab(body); });
        body.querySelectorAll('[data-act="call"]').forEach(btn => btn.addEventListener('click', () => _callFlow(body, id, s2)));
        if (!live) return;
        const input = body.querySelector('.och-input');
        const chat = body.querySelector('.och-chat');
        const ctrls = () => body.querySelectorAll('.och-sug, .och-send, .och-end, .och-input');
        const send = async (q) => {
            q = String(q || '').trim();
            if (!q) return;
            ctrls().forEach(x => { x.disabled = true; });
            chat.querySelector('.och-chat-none')?.remove();
            chat.insertAdjacentHTML('beforeend', '<div class="och-q och-pending">' + _esc(q) + '</div><div class="och-a och-think">他想了想…</div>');
            body.scrollTop = body.scrollHeight;
            const r = await ask(id, q);
            if (!body.isConnected || _openIv !== id) return;
            if (!r.ok) {
                chat.querySelector('.och-pending')?.remove(); chat.querySelector('.och-think')?.remove();
                const A = win.AUI || window.AUI; if (A && A.toast) A.toast(r.why);
                ctrls().forEach(x => { x.disabled = false; });
                if (input) input.value = q;
                return;
            }
            _renderInterview(body, id);
        };
        body.querySelectorAll('.och-sug').forEach(btn => btn.addEventListener('click', () => send(btn.textContent)));
        body.querySelector('.och-send').addEventListener('click', () => send(input.value));
        input.addEventListener('keydown', (e) => {
            const A = win.AUI || window.AUI;
            const go = A && A.enterSends ? A.enterSends(e) : (e.key === 'Enter' && !e.isComposing);
            if (go) { e.preventDefault(); send(input.value); }
        });
        body.querySelector('.och-end').addEventListener('click', async () => { await endInterview(id); _renderInterview(body, id); });
    }
    // 打電話：兩班都空就先挑哪班 → 嘟嘟 → 他接起來說一句
    function _callFlow(body, id, s2) {
        const host = body.closest('.oc-win') || body;
        const a = s2.applicants.find(x => x.id === id);
        if (!a) return;
        const A = win.AUI || window.AUI;
        const free = ['am', 'pm'].filter(k => !s2.slots[k]);
        if (!free.length) { if (A && A.toast) A.toast('早班晚班都有人了，先請一位走'); return; }
        host.querySelector('.och-call')?.remove();
        host.insertAdjacentHTML('beforeend', '<div class="och-call"><div class="och-call-card"></div></div>');
        const ov = host.querySelector('.och-call'), card = ov.querySelector('.och-call-card');
        const close = () => { ov.remove(); };
        const dial = (slot) => {
            ov.classList.add('och-ringing');
            card.innerHTML = '<span class="och-call-icon"><i class="fa-solid fa-phone"></i></span><div class="och-call-line">打給' + _esc(a.name) + '……</div><div class="och-call-note">嘟——嘟——</div>';
            setTimeout(async () => {
                const r = await call(id, slot);
                ov.classList.remove('och-ringing');
                if (!r || !r.ok) { card.innerHTML = '<div class="och-call-line">' + _esc((r && r.why) || '沒打通') + '</div><div class="och-call-ops"><button class="och-btn och-main och-ok">好</button></div>'; }
                else {
                    const note = r.accepted ? '錄取了！' + SHIFT[r.slot].label + '，' + (r.startDay === b0.dayNum(Date.now()) ? '今天' : '明天') + ' ' + _hm(SHIFT[r.slot].start) + ' 開始上班。' : '沒錄到，他已經在別的地方上班了。';
                    card.innerHTML = '<span class="och-call-icon"><i class="fa-solid ' + (r.accepted ? 'fa-handshake' : 'fa-phone-slash') + '"></i></span><div class="och-call-line">「' + _esc(r.line) + '」</div><div class="och-call-note">' + note + '</div><div class="och-call-ops"><button class="och-btn och-main och-ok">好</button></div>';
                }
                card.querySelector('.och-ok').addEventListener('click', () => { close(); _openIv = null; renderTab(body); });
            }, 1200);
        };
        const b0 = _B();
        if (free.length === 1) return dial(free[0]);
        card.innerHTML = '<span class="och-call-icon"><i class="fa-solid fa-phone"></i></span><div class="och-call-line">要請' + _esc(a.name) + '上哪一班？</div>' +
            '<div class="och-call-ops">' + free.map(k => '<button class="och-btn och-main" data-slot="' + k + '">' + SHIFT[k].label + ' ' + _hm(SHIFT[k].start) + '</button>').join('') + '<button class="och-btn och-cancel">先不要</button></div>';
        card.querySelectorAll('[data-slot]').forEach(btn => btn.addEventListener('click', () => dial(btn.dataset.slot)));
        card.querySelector('.och-cancel').addEventListener('click', close);
    }
    // 頁籤小紅點：有新日記、或應徵者到了
    async function hasNews() {
        const s2 = await get();
        return !!(s2.unread || (s2.ad && s2.ad.readyAt <= Date.now()));
    }
    function isBusy(root) { return !!(root && root.querySelector('.och-iv, .och-call')); }
    // 🏠 大廳書咖：現在是誰的班、他有來 → 穿制服站櫃台旁；點他跳一行（今天最近做的事）。先悄悄補算一次（不叫模型）
    async function onDutyNow() {
        const b = _B();
        if (!b) return null;
        try { if (b.settleQuiet) await b.settleQuiet(); } catch (e) {}
        const s2 = await get();
        const now = Date.now(), today = b.dayNum(now), min = b.minOf(now);
        for (const slot of ['am', 'pm']) {
            const m = s2.slots[slot], d = (s2.duty || {})[today + ':' + slot];
            if (!m || !d || d.off || d.sid !== m.sid || min < d.from || min >= d.to) continue;
            const last = (s2.diary || []).find(x => x.sid === m.sid && x.day === today && (x.kind === 'prep' || x.kind === 'restock'));
            const line = m.name + '（' + SHIFT[slot].label + '）：' + (last ? last.text.replace(/^(早班|晚班)/, '') : '歡迎光臨。');
            return { slot, label: SHIFT[slot].label, m, src: UNI_BASE + (m.gender === 'm' ? 'male' : 'female') + '.webp', line };
        }
        return null;
    }
    function leave() { _openIv = null; }

    const OS_CAFE_HIRE = { _pure, get, postAd, arrive, ask, endInterview, call, fire, bossAct, expire, renderTab, hasNews, isBusy, leave, onDutyNow, ASK_MAX, AD_COST, AD_HOURS,
        _lab: { writeResumes: _writeResumes, interviewSys: _interviewSys } };   // _lab＝提示詞實測用（tmp/cafe_hire_prompt_lab.cjs）
    win.OS_CAFE_HIRE = window.OS_CAFE_HIRE = OS_CAFE_HIRE;
})();
