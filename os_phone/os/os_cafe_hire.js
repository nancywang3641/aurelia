// ----------------------------------------------------------------
// [檔案] os_cafe_hire.js
// 路徑：os_phone/os/os_cafe_hire.js
// 職責：☕🧑‍🍳 書咖員工（10-13 第二版）——貼徵人啟事、應徵者、面試、打電話錄取、早班／晚班店員。
//   她出錢，店員上班先看帳備料（10-13 她：「我出資備料，店員上班要自己先備齁」）；
//   每位店員有五個看不到的數字（看帳、手腳、勤快、嘴甜、誠實），好壞要上班後才看得出來。
//   規則全在這裡照表算、不叫模型；只有「履歷（一批三位一通）」和「面試每問一句一通」叫副模型（名冊 cafe_hire）。
//   店員上班、備料、補貨、薪水在 os_cafe.js 的結算裡跟客人照時間交錯跑（crewSession），這樣後面的客人買得到他剛備的料。
//   資料在 app_data book_cafe 的 staff2（舊的 staff 是小機值班，不碰）。設計書 docs/superpowers/specs/2026-10-13-cafe-staff-hiring-design.md（只在本機）。
// ⚠️ 排在 os_cafe.js 後面載入；寫 staff2、扣書咖帳戶一律走 OS_CAFE._b.locked（跟結算同一條排隊）
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
        const skill = skillOf(stats);
        let claim = skill;
        if (stats.honest === 3) claim = skill + (rand() < 0.5 ? 1 : 0);
        else if (stats.honest <= 2) claim = skill + 1 + (rand() < 0.5 ? 1 : 0);
        claim = _clamp(claim, 0, 4);
        const pers = [_pickOne(rand, PERS)];
        if (rand() < 0.6) { const b = _pickOne(rand, PERS.filter(p => p !== pers[0])); pers.push(b); }
        const exp = _pickOne(rand, EXPS[claim]);
        const wage = 20 + claim * 5 + Math.floor(rand() * 6) % 6;
        const id = mkId ? mkId() : 'ap' + Math.floor(rand() * 1e9).toString(36);
        return { id, name, gender, look, cards: { pers, exp }, claim, stats, wage };
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
    //   o = { staff2, tally, menu, stock, used, coins, today, nowMin, from, unitCost(m), avail(stock,used,id,day,t), mkId(), rand() }
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
        for (const q of (S2.crewQ || [])) push(Object.assign({}, q));

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
        // 照預估備料：share＝這次要備多少比例的一天；checkAt＝算「已經有多少」的那一刻
        function prep(day, t, slot, m, share, checkAt, onlyId) {
            const err = ERR[_clamp(m.stats.acct, 1, 5) - 1];
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
            const lab = SHIFT[slot].label;
            if (r.made.length) note(day, t, slot, m, 'prep', lab + '備了 ' + r.made.map(x => nameOf(x.id) + ' ×' + x.qty).join('、') + '（花 ' + r.cost + '）' + (r.short ? '；錢不夠，少備了一些' : ''));
            else note(day, t, slot, m, 'prep', r.short ? lab + '想備料，但帳戶錢不夠，沒備' : lab + '看了看帳，料夠，這班不用備');
        }
        function start(ev) {
            const m = memberOf(ev.slot, ev.sid);
            if (!m) return;
            const key = ev.day + ':' + ev.slot;
            if (duty[key]) return;
            const lab = SHIFT[ev.slot].label;
            if (coins < m.wage) {
                const n = (m.unpaid || 0) + 1;
                m.unpaid = n;
                unpaid[ev.slot] = { sid: m.sid, n };
                setDuty(key, { sid: m.sid, off: 'nopay' });
                note(ev.day, ev.t, ev.slot, m, 'nopay', '帳戶不夠付' + lab + '的薪水（' + m.wage + '），今天沒來');
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
            coins -= m.wage; spent += m.wage;
            m.unpaid = 0; unpaid[ev.slot] = { sid: m.sid, n: 0 };
            m.came = true; came[ev.slot] = m.sid;
            const from = late ? ev.t + 60 : ev.t;
            setDuty(key, { sid: m.sid, from, to: SHIFT[ev.slot].end });
            if (late) { note(ev.day, from, ev.slot, m, 'late', lab + '遲到了一小時'); push({ kind: 'work', day: ev.day, t: from, slot: ev.slot, sid: m.sid }); return; }
            work(ev.day, ev.t, ev.slot, m);
        }
        function restock(ev) {
            const d = duty[ev.day + ':' + ev.slot];
            const m = memberOf(ev.slot, ev.sid);
            if (!m || !d || d.off || ev.t < d.from || ev.t >= d.to) return;
            const share = Math.max(0, (CLOSE - ev.t) / (CLOSE - OPEN));
            const r = prep(ev.day, ev.t, ev.slot, m, share, ev.t, ev.id);
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
            }
        }
        return {
            until,
            sold(id, day, t) { if (o.avail(o.stock, o.used, id, day, t) <= 0) trigger(id, day, t); },
            missed(id, day, t) { trigger(id, day, t); },
            sweet(day, t) { const on = onDuty(day, t); return on ? SWEET[_clamp(on.m.stats.sweet, 1, 5) - 1] : 0; },
            earn(n) { coins += Number(n) || 0; },   // 客人付的錢：店員付薪水、算一半上限看的是「到這一刻」的帳
            result() {
                const later = events.filter(e => e.kind !== 'start').map(e => Object.assign({}, e));
                return { spent, coins, batches: batches.slice(), diary: diary.slice(), duty: Object.assign({}, duty), dutyAdd: Object.assign({}, dutyAdd), unpaid: Object.assign({}, unpaid), came: Object.assign({}, came), quit: quit.slice(), crewQ: later };
            },
        };
    }

    // 結算要不要為了店員跑一次：有該上的班還沒上、或排著的事（遲到開工、補貨）時間到了
    function hasDue(S2, from, today, nowMin) {
        if (!S2) return false;
        const slots = S2.slots || {}, duty = S2.duty || {};
        for (let day = from; day <= today; day++) for (const slot of ['am', 'pm']) {
            const m = slots[slot];
            if (!m || (m.startDay != null && m.startDay > day) || duty[day + ':' + slot]) continue;
            if (day === today && SHIFT[slot].start > nowMin) continue;
            return true;
        }
        return (S2.crewQ || []).some(q => q.day < today || (q.day === today && q.t <= nowMin));
    }

    const _pure = { ERR, DELAY, SWEET, ABSENT, SHIFT, LOOKS, NAMES, PERS, EXPS, skillOf, goneP, rollApplicant, forecast, crewSession, hasDue };

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
            if (fd.coins < AD_COST) return [{ ok: false, why: '錢不夠（貼啟事要 ' + AD_COST + '，帳戶剩 ' + fd.coins + '）' }, false];
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
            const m = { sid: a.id, name: a.name, gender: a.gender, look: a.look, cards: a.cards, claim: a.claim, stats: a.stats, wage: a.wage, resume: a.resume, hiredAt: now, startDay, unpaid: 0 };
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
            return [true, true];
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
    const KIND_ICON = { prep: 'fa-basket-shopping', restock: 'fa-rotate', absent: 'fa-bed', late: 'fa-clock', nopay: 'fa-coins', quit: 'fa-door-open', fire: 'fa-door-open', gone: 'fa-person-walking-arrow-right', declined: 'fa-phone-slash', hire: 'fa-handshake' };
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
            '@media (max-width:420px){.och-slot-main{flex-direction:column;}.och-pic{width:46px;height:68px;}}';
        doc.head.appendChild(st);
    }
    function _registerHelp() {
        const A = win.AUI || window.AUI;
        if (!A || !A.registerHelp || _registerHelp.done) return;
        _registerHelp.done = true;
        A.registerHelp({ cafe_crew: { title: '員工', body:
            '貼一張徵人啟事（' + AD_COST + '），' + AD_HOURS + ' 小時後會來 ' + APPLY_N + ' 位應徵者，每位寫了一份履歷。\n' +
            '可以約面試：直接點旁邊的建議問題，或自己打，最多問 ' + ASK_MAX + ' 句。每問一句會叫一次模型（設置裡「書咖應聘」那一列）；履歷是一批一次。\n' +
            '每個人都有看不到的本事：備料準不準、手腳快不快、會不會請假（第一班一定準時到）、會不會推銷、說話老不老實。履歷跟面試只是他說的，要上班之後才看得出來。\n' +
            '想要就「打電話錄取」，挑早班或晚班。面完一天內打一定會來；拖太久，好的人可能已經去別家了。不打的話，' + KEEP_DAYS + ' 天後他會自己去找別的工作。\n' +
            '早班 08:30 上班，先看前幾天賣得怎樣，把當天的料備好；晚班 15:30 上班，看剩多少再補。哪杯在他班上賣完了，他會過一陣子補一些。備料一天最多花帳戶的一半。\n' +
            '薪水在他上班時從書咖帳戶付；付不起那天他就不來，連 ' + 3 + ' 天沒領到就辭職。\n' +
            '你自己在菜單頁備的料，一樣等下一次 9 點開店才上架。' } });
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
        return '<div class="och-slot"><span class="och-slot-label">' + lab + '</span><div class="och-slot-main"><span class="och-pic och-sm ' + _picCls(m, true) + '"></span>' +
            '<div class="och-info"><b class="och-name">' + _esc(m.name) + '</b>' + _cardsHtml(m) + '<span class="och-wage">日薪 ' + m.wage + '</span>' +
            '<span class="och-status ' + st.cls + '">' + st.text + '</span>' + (m.unpaid ? '<span class="och-status bad">欠薪 ' + m.unpaid + ' 天</span>' : '') + '</div></div>' +
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
        const bad = ['nopay', 'quit', 'absent', 'late', 'gone', 'declined'].includes(x.kind);
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
        body.innerHTML = '<div class="och-wrap">' +
            '<div class="oc-section-head"><span class="oc-section-title"><i class="fa-solid fa-id-card"></i> 班表</span>' + (A && A.helpBtn ? A.helpBtn('cafe_crew') : '') + '</div>' +
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

    const OS_CAFE_HIRE = { _pure, get, postAd, arrive, ask, endInterview, call, fire, expire, renderTab, hasNews, isBusy, leave, onDutyNow, ASK_MAX, AD_COST, AD_HOURS,
        _lab: { writeResumes: _writeResumes, interviewSys: _interviewSys } };   // _lab＝提示詞實測用（tmp/cafe_hire_prompt_lab.cjs）
    win.OS_CAFE_HIRE = window.OS_CAFE_HIRE = OS_CAFE_HIRE;
})();
