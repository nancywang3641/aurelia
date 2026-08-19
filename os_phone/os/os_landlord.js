// ----------------------------------------------------------------
// [檔案] os_landlord.js
// 路徑：os_phone/os/os_landlord.js
// 職責：包租婆系統①地基——物業/租客資料、離線補算收租、招租與定調。純邏輯無 UI。
//   成本哲學同書咖：日常收租全本地零 API；只有「租客定調(每人一次)」燒 API 且有本地退路。
//   UI 在 os_landlord_book.js（房產手帳窗口）；設計書 docs/landlord_design.md
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;

    // 🏢 出租生意長在玩家自己那塊地(plot:'player')上：空地 →(買)自宅 →(再花 PT)公寓,一層一層加上去。
    //    鄰居那幾棟(npc01~04)是鄰居自己的房子,跟生意無關。
    const LL_CFG = {
        baseRent: 12,           // 每戶每天固定基礎租金(PT)——①期不接係數
        catchUpDays: 7,         // 離線補算上限
        unitsPerFloor: 2,       // 一層隔成幾間出租(自己住的那間 home 不算在內)
        floorTypes: ['cozy', 'deep'],   // 一層各戶的房型(照 slot 順序)
        maxFloors: 4,
        floorPrice: 600,        // 加蓋一層要多少 PT
    };
    const SLOTS = 'abcdefgh';
    function _unitId(floor, slot) { return 'f' + floor + '-' + SLOTS[slot]; }

    const APP_ID = 'landlord';
    const K_STATE = 'state';
    const K_TUNE = 'tune';      // tune::<npcKey>
    const K_ROOM = 'room';      // room::<unitId>（房間圖另存一格,不塞進 state,免得每次讀房產都拖著幾 MB 的圖）

    function _db() { return win.OS_DB || window.OS_DB; }
    function _now() { try { return Date.now(); } catch (e) { return 0; } }
    // 以「天」為刻度(本地日期)，跟書咖同一招
    function _dayNum(ts) { return Math.floor(ts / 86400000); }

    // 還沒蓋公寓＝一戶都沒有(招租入口也跟著關)。蓋一層才長出那層的出租戶。
    function _defaultState() {
        return { floors: 0, units: [], lastSettleDay: null, createdAt: _now(), keysV: 2 };
    }

    // 一層樓長出來的出租戶(自住那間 home 另外存,不在 units 裡)
    function _makeFloorUnits(floor) {
        const units = [];
        for (let i = 0; i < LL_CFG.unitsPerFloor; i++) {
            units.push({
                id: _unitId(floor, i),
                floor: floor, slot: i,
                roomTypeKey: LL_CFG.floorTypes[i] || 'standard',
                tenantKey: null, tenantName: null,
                rent: LL_CFG.baseRent,
                movedInAt: null,
            });
        }
        return units;
    }

    // ── 舊存檔(平舖 u1/u2)→ 樓層制(f1-a/f1-b) ──
    // 🚨 房間圖是 key 在 unitId 上的(room::u1),改 id 不搬圖＝玩家布置好的房間憑空消失、要重燒一次生圖。
    //    所以搬 id 的同時把圖複製到新 key;舊 key 留著不刪(讀不到就不讀,刪錯反而危險)。
    async function _migrateToFloors(state) {
        if (state.floors != null) return false;            // 已經是樓層制
        const old = state.units || [];
        if (!old.length) { state.floors = 0; state.units = []; return true; }
        state.floors = 1;                                   // 已經有戶在收租＝當作一樓已經蓋好
        const moved = [];
        state.units = old.slice(0, LL_CFG.unitsPerFloor).map(function (u, i) {
            const nid = _unitId(1, i);
            if (u.id !== nid) moved.push({ from: u.id, to: nid });
            return Object.assign({}, u, { id: nid, floor: 1, slot: i });
        });
        for (const m of moved) {
            try {
                const room = await getRoom(m.from);
                if (room) await saveRoom(m.to, room);
            } catch (e) { console.warn('[Landlord] 搬房間圖失敗(那一戶要重新布置一次)', m, e); }
        }
        return true;
    }

    // 🚨區分「查無資料」與「讀取失敗」：前者安全(建預設值並寫入),後者危險(絕不可寫入,一律往外拋)。
    //   OS_DB.getAppData 的合約是:記錄真的不存在時回傳 null/undefined,讀取本身出錯則 reject。
    async function getState() {
        const db = _db();
        if (!db?.getAppData) throw new Error('OS_DB.getAppData 不存在');
        let v;
        try {
            v = await db.getAppData(APP_ID, K_STATE);
        } catch (e) {
            console.warn('[Landlord] getState 讀取失敗,拒絕以預設值覆蓋,原樣往外拋', e);
            throw e;
        }
        if (v && Array.isArray(v.units)) {
            let changed = await _migrateToFloors(v);
            try { if (await _migrateKeys(v)) changed = true; }
            catch (e) { console.warn('[Landlord] 身分搬家失敗,這次先照用', e); }
            if (changed) { try { await saveState(v); } catch (e) { console.warn('[Landlord] 遷移後存檔失敗,這次先照用', e); } }
            return v;
        }
        // 走到這裡代表「查無資料」(讀取本身沒出錯,只是還沒有記錄)→ 安全,建立預設值並寫入
        const fresh = _defaultState();
        await saveState(fresh);
        return fresh;
    }

    async function saveState(state) {
        const db = _db();
        if (!db?.saveAppData) throw new Error('OS_DB.saveAppData 不存在');
        await db.saveAppData(APP_ID, K_STATE, state);
    }

    // ── 🔔 看房訪客：掛招租的戶，每天骰一次有沒有人上門 ──
    // 誰來、想不想租都是本地算出來的（零 API，同書咖每日消費那套）；
    // 只有玩家點開想聽那位訪客怎麼說，才燒一次副模型。
    const VIEW_CFG = {
        baseChance: 0.45,   // 招租中的戶，一天有人來看的基礎機率
        keepDays: 14,       // 看房紀錄留幾天
        maxOpen: 5,         // 同一戶最多同時掛幾筆還沒處理的
    };
    function _h32(s) {
        let h = 2166136261;
        const t = String(s);
        for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = (h * 16777619) >>> 0; }
        return h >>> 0;
    }
    // 穩定亂數：同一個種子永遠同一個結果 → 同一天重跑結算不會生出不同訪客
    function _rand(seed) { const h = _h32(seed); return ((h ^ (h >>> 15)) >>> 0) % 100000 / 100000; }

    // 這位訪客對這間房滿不滿意（0~1，>=0.5 就想租）。房型、價格、家具口味三件事。
    // 🚨 基礎分刻意壓在門檻以下：空房要租不掉，布置才有意義（家具是玩家花 PT 買的）。
    function judgeFit(tuning, unit, suggest, roomTags, seed) {
        const t = tuning || {};
        let score = 0.38;
        if (t.idealTypeKey && t.idealTypeKey === unit.roomTypeKey) score += 0.18;
        // 價格：跟建議價比，開愈高愈嫌貴；容忍度低的人更在意
        const ratio = (unit.rent || suggest) / Math.max(1, suggest);
        const care = 2 - (typeof t.rentTolerance === 'number' ? t.rentTolerance : 0.6);
        score -= (ratio - 1) * 0.55 * care;
        // 家具對不對他的味
        const tags = roomTags || [];
        const hit = (t.habitTags || []).filter(function (x) { return tags.indexOf(x) >= 0; }).length;
        score += Math.min(0.24, hit * 0.12);
        if (!tags.length) score -= 0.2;                       // 空房沒什麼好看的
        else score += Math.min(0.1, tags.length * 0.03);      // 有布置就算不對味也加點分
        // 心情：同樣條件也別讓所有人給出一模一樣的結論（種子固定，重跑仍然穩定）
        if (seed) score += (_rand(seed + ':mood') - 0.5) * 0.16;
        return Math.max(0, Math.min(1, score));
    }

    // ── 🏃 續租／退租：住進去以後，房客每天回頭看一次這間房值不值得住 ──
    // 用的是跟看房同一把尺（judgeFit），差別在門檻放寬（都住下來了，有黏性）
    // 而且刻意不帶心情種子：住戶的評價要穩定，玩家重新布置、加家具才有明確的因果。
    const STAY_CFG = {
        badBelow: 0.42,   // 低於這個就開始累積不滿（看房的門檻是 0.5）
        goodAbove: 0.5,   // 高於這個就消一格不滿
        leaveAt: 5,       // 不滿累積到這個數就搬走——玩家有五天可以補救
        keepDays: 14,     // 退租紀錄留幾天
    };
    // 純函式：補算每一天，回 { state, left:[搬走的] }
    function settleTenants(state, todayDay, rooms, tunings) {
        const s = JSON.parse(JSON.stringify(state));
        s.moveOuts = Array.isArray(s.moveOuts) ? s.moveOuts : [];
        const last = (s.lastStayDay === null || s.lastStayDay === undefined) ? todayDay - 1 : s.lastStayDay;
        const left = [];
        let from = last + 1;
        if (todayDay - from > LL_CFG.catchUpDays) from = todayDay - LL_CFG.catchUpDays;

        for (let day = from; day <= todayDay; day++) {
            s.units.forEach(function (u) {
                if (!u.tenantKey) return;
                const info = (rooms && rooms[u.id]) || { tags: [], suggest: u.rent || 12 };
                const tuning = (tunings && tunings[u.tenantKey]) || _fallbackTuning({ key: u.tenantKey, name: u.tenantName });
                const fit = judgeFit(tuning, u, info.suggest, info.tags);
                u.fit = Math.round(fit * 100) / 100;
                if (fit < STAY_CFG.badBelow) u.unhappy = (u.unhappy || 0) + 1;
                else if (fit >= STAY_CFG.goodAbove) u.unhappy = Math.max(0, (u.unhappy || 0) - 1);

                if ((u.unhappy || 0) >= STAY_CFG.leaveAt) {
                    const rec = {
                        id: 'o' + day + '_' + u.id + '_' + u.tenantKey,
                        unitId: u.id, npcKey: u.tenantKey, name: u.tenantName || '房客',
                        day: day, rent: u.rent || 0, fit: u.fit, line: '', done: false,
                    };
                    if (!s.moveOuts.some(function (x) { return x.id === rec.id; })) { s.moveOuts.push(rec); left.push(rec); }
                    u.tenantKey = null; u.tenantName = null; u.movedInAt = null;
                    u.unhappy = 0; u.fit = null;
                    u.listed = false;   // 空出來要玩家自己重新掛招租（順便逼他先看看哪裡沒做好）
                }
            });
        }
        s.moveOuts = s.moveOuts.filter(function (o) { return o.day > todayDay - STAY_CFG.keepDays; });
        s.lastStayDay = todayDay;
        return { state: s, left: left };
    }
    // 房客現在的心情，給 UI 一句話（不是數字，玩家不需要看到分數）
    function stayMood(unit) {
        if (!unit || !unit.tenantKey) return '';
        const n = unit.unhappy || 0;
        if (n >= 4) return '快要搬走了';
        if (n >= 2) return '有點不滿';
        if (n >= 1) return '有些地方不合意';
        return (unit.fit != null && unit.fit >= 0.7) ? '住得很滿意' : '住得還安穩';
    }

    // 純函式：把「上次結算到今天」之間，每天每個招租中的戶各骰一次。
    // roster=候選名冊、rooms={unitId:{tags:[],suggest:N}}、tunings={npcKey:tuning}
    function settleViewings(state, todayDay, roster, rooms, tunings) {
        const s = JSON.parse(JSON.stringify(state));
        s.viewings = Array.isArray(s.viewings) ? s.viewings : [];
        const last = (s.lastViewDay === null || s.lastViewDay === undefined) ? todayDay - 1 : s.lastViewDay;
        const added = [];
        if (!Array.isArray(roster) || !roster.length) { s.lastViewDay = todayDay; return { state: s, added: added }; }

        let from = last + 1;
        if (todayDay - from > LL_CFG.catchUpDays) from = todayDay - LL_CFG.catchUpDays;   // 久沒開就別暴衝
        for (let day = from; day <= todayDay; day++) {
            s.units.forEach(function (u) {
                if (!u.listed || u.tenantKey) return;
                const info = (rooms && rooms[u.id]) || { tags: [], suggest: u.rent || 12 };
                const open = s.viewings.filter(function (v) { return v.unitId === u.id && !v.done; });
                if (open.length >= VIEW_CFG.maxOpen) return;
                // 開太貴，來看的人就少
                const ratio = (u.rent || info.suggest) / Math.max(1, info.suggest);
                const chance = VIEW_CFG.baseChance * Math.max(0.15, Math.min(1, 1.4 - ratio * 0.5));
                if (_rand(u.id + ':' + day + ':come') > chance) return;

                // 誰來：名冊裡挑一個，排除已經是房客的、以及這戶已經來看過的
                const busy = {};
                s.units.forEach(function (x) { if (x.tenantKey) busy[x.tenantKey] = true; });
                s.viewings.forEach(function (v) { if (v.unitId === u.id && !v.done) busy[v.npcKey] = true; });
                const pool = roster.filter(function (r) { return r && r.key && !busy[r.key]; });
                if (!pool.length) return;
                const npc = pool[_h32(u.id + ':' + day + ':who') % pool.length];

                const seed = u.id + ':' + day + ':' + npc.key;
                const fit = judgeFit((tunings && tunings[npc.key]) || _fallbackTuning(npc), u, info.suggest, info.tags, seed);
                const v = {
                    id: 'v' + day + '_' + u.id + '_' + npc.key,
                    unitId: u.id, npcKey: npc.key, name: npc.name || '看房的人',
                    day: day, rent: u.rent || info.suggest,
                    fit: Math.round(fit * 100) / 100,
                    want: fit >= 0.5,
                    line: '', done: false,
                };
                if (!s.viewings.some(function (x) { return x.id === v.id; })) { s.viewings.push(v); added.push(v); }
            });
        }
        // 太舊的收掉，免得無限長
        s.viewings = s.viewings.filter(function (v) { return v.day > todayDay - VIEW_CFG.keepDays; });
        s.lastViewDay = todayDay;
        return { state: s, added: added };
    }

    // ── 💰 定價：建議租金＝房間本身值多少 ＋ 你布置了多少 ──
    // 家具是玩家花 PT 買來的，會直接反映在建議租金上——布置得好就能收更貴。
    // 玩家仍可自己標價，但只能在建議價的一半到兩倍之間，免得標成天價或白送。
    function suggestRent(unit, orderCount) {
        const RT = (win.OS_ROOM_SVG && win.OS_ROOM_SVG.ROOM_TYPES) || {};
        const t = RT[unit && unit.roomTypeKey] || RT.standard || { w: 4.2, d: 4.0 };
        const area = (t.w || 4.2) * (t.d || 4.0);
        const base = 4 + area * 0.8;
        const furni = Math.min(14, Math.max(0, Number(orderCount) || 0) * 1.6);
        return Math.max(6, Math.round(base + furni));
    }
    function rentRange(suggest) {
        return { min: Math.max(3, Math.round(suggest * 0.5)), max: Math.round(suggest * 2) };
    }

    // 這一戶目前的定價資訊（含房間裡擺了幾件）——UI 直接拿這包畫
    async function getPricing(unitId) {
        const state = await getState();
        const unit = (state.units || []).find(function (u) { return u.id === unitId; });
        if (!unit) throw new Error('找不到這一戶。');
        let orderCount = 0;
        try { const room = await getRoom(unitId); orderCount = (room && Array.isArray(room.order)) ? room.order.length : 0; }
        catch (e) { console.warn('[Landlord] 讀房間布置失敗，當作空房估價', e); }
        const suggest = suggestRent(unit, orderCount);
        const range = rentRange(suggest);
        return {
            unit: unit, orderCount: orderCount, suggest: suggest,
            min: range.min, max: range.max,
            // 先夾進範圍再給 UI：舊戶還帶著預設的 12，布置過之後那個數字已經低於下限了
            rent: Math.max(range.min, Math.min(range.max, unit.rent || suggest)),
            listed: !!unit.listed,
        };
    }

    // 標價＋掛招租：兩件事一起存（玩家在同一個面板做完）
    async function setListing(unitId, rent, listed) {
        const state = await getState();
        const unit = (state.units || []).find(function (u) { return u.id === unitId; });
        if (!unit) return { ok: false, reason: 'gone' };
        if (unit.tenantKey) return { ok: false, reason: 'occupied' };   // 有房客就不能改價/撤租

        let orderCount = 0;
        try { const room = await getRoom(unitId); orderCount = (room && Array.isArray(room.order)) ? room.order.length : 0; } catch (e) {}
        const range = rentRange(suggestRent(unit, orderCount));
        const v = Math.round(Number(rent));
        if (!isFinite(v)) return { ok: false, reason: 'bad' };
        unit.rent = Math.max(range.min, Math.min(range.max, v));
        unit.listed = !!listed;
        try { await saveState(state); } catch (e) { console.warn('[Landlord] 存定價失敗', e); return { ok: false, reason: 'save' }; }
        return { ok: true, rent: unit.rent, listed: unit.listed, clamped: unit.rent !== v };
    }

    // 🏢 加蓋一層：扣 PT → 長出那一層的出租戶。第一層＝把自宅那棟變成公寓。
    //    狀態機照設計：空地 →(跟白兔買)自宅 →(這裡)公寓,所以沒有自宅不給蓋。
    async function addFloor() {
        const pt = win.OS_PT || window.OS_PT;
        if (!pt || typeof pt.spendPT !== 'function') return { ok: false, reason: 'nopt' };
        if (typeof pt.getPlotBuilt === 'function') {
            let built = false;
            try { built = await pt.getPlotBuilt('player'); } catch (e) { return { ok: false, reason: 'read' }; }
            if (!built) return { ok: false, reason: 'nohouse' };
        }
        let state;
        try { state = await getState(); } catch (e) { return { ok: false, reason: 'read' }; }
        if ((state.floors || 0) >= LL_CFG.maxFloors) return { ok: false, reason: 'max' };

        const r = await pt.spendPT(LL_CFG.floorPrice, '加蓋公寓樓層');
        if (!r || !r.ok) return { ok: false, reason: 'poor', short: (r && r.short) || LL_CFG.floorPrice };

        const floor = (state.floors || 0) + 1;
        state.floors = floor;
        state.units = (state.units || []).concat(_makeFloorUnits(floor));
        try {
            await saveState(state);
        } catch (e) {
            // 🚨 扣了錢卻沒存起來＝玩家白花：退回去,寧可讓他重按一次
            console.warn('[Landlord] 加蓋存檔失敗,退款', e);
            try { await pt.addPT(LL_CFG.floorPrice, { reason: '加蓋失敗退款' }); } catch (e2) { console.warn('[Landlord] 退款也失敗', e2); }
            return { ok: false, reason: 'save' };
        }
        return { ok: true, floors: floor, state: state };
    }

    async function getTuning(npcKey) {
        try {
            const db = _db();
            if (!db?.getAppData) return null;
            return (await db.getAppData(APP_ID, K_TUNE + '::' + String(npcKey))) || null;
        } catch (e) { return null; }
    }

    async function saveTuning(npcKey, tuning) {
        const db = _db();
        if (!db?.saveAppData) return;
        await db.saveAppData(APP_ID, K_TUNE + '::' + String(npcKey), tuning);
    }

    // ── 房間圖(包裹配送的成果)：一戶一格,生好就存,之後直接讀不重生 ──
    //   讀失敗一律當「還沒布置」處理:最壞情況是玩家再布置一次,不會弄丟房產資料。
    async function getRoom(unitId) {
        try {
            const db = _db();
            if (!db?.getAppData) return null;
            return (await db.getAppData(APP_ID, K_ROOM + '::' + String(unitId))) || null;
        } catch (e) { console.warn('[Landlord] 讀房間圖失敗', e); return null; }
    }

    async function saveRoom(unitId, room) {
        const db = _db();
        if (!db?.saveAppData) throw new Error('OS_DB.saveAppData 不存在');
        await db.saveAppData(APP_ID, K_ROOM + '::' + String(unitId), room);
    }

    // ── 離線補算(旅行青蛙式)：純函式,不碰 DB/DOM,好驗 ──
    function settleCore(state, todayDay) {
        const s = JSON.parse(JSON.stringify(state));
        if (s.lastSettleDay === null || s.lastSettleDay === undefined) {
            s.lastSettleDay = todayDay;
            return { state: s, days: 0, earned: 0, perUnit: [] };
        }
        let days = todayDay - s.lastSettleDay;
        if (days <= 0) return { state: s, days: 0, earned: 0, perUnit: [] };
        if (days > LL_CFG.catchUpDays) days = LL_CFG.catchUpDays;   // 封頂,防久未開啟爆量

        const perUnit = [];
        let earned = 0;
        s.units.forEach(function (u) {
            if (!u.tenantKey) return;                 // 空戶不收租
            const amount = (u.rent || 0) * days;
            if (amount <= 0) return;
            earned += amount;
            u.earnedTotal = (u.earnedTotal || 0) + amount;   // 這一戶到今天總共收了多少(手機那頁的帳)
            perUnit.push({ unitId: u.id, tenantName: u.tenantName || '房客', amount: amount });
        });
        s.lastSettleDay = todayDay;
        return { state: s, days: days, earned: earned, perUnit: perUnit };
    }

    // ── 招租：候選名冊(沿用書咖的顧客名冊來源) ──
    async function listCandidates() {
        const roster = await _roster();
        const out = [];
        for (const r of roster) {
            if (!r || !r.key) continue;
            out.push({ key: r.key, name: r.name || '無名', persona: r.persona || '', tuned: _isValidTuning(await getTuning(r.key)) });
        }
        return out;
    }

    // ── 🚨 名冊身分正規化（M-6）──
    // cafeRoster 的 key 帶 chatId＝「這一輪的他」，那是給對話歷史/裝扮用的。
    // 房東這邊要的是「這個人」：換一輪還是同一個房客，所以一律改用 stableKey。
    // 不然：換輪重燒一次定調、同一個人可以同時占兩戶、舊房客在新名冊裡查無此人變幽靈。
    function _normRoster(roster) {
        return (roster || [])
            .filter(function (r) { return r && (r.stableKey || r.key); })
            .map(function (r) { return { key: r.stableKey || r.key, name: r.name, persona: r.persona, rawKey: r.key }; });
    }
    async function _roster() {
        try {
            const ln = win.LobbyNpcs || window.LobbyNpcs;
            if (ln && typeof ln.cafeRoster === 'function') return _normRoster(await ln.cafeRoster());
        } catch (e) { console.warn('[Landlord] 讀名冊失敗', e); }
        return [];
    }

    // 舊資料搬到穩定身分：房客與看房紀錄裡帶 chatId 的 key 換掉，定調快取一併搬過去（省得重燒）。
    // 只跑一次（keysV 記在 state 裡）；對不上的保留原樣，不亂改。
    async function _migrateKeys(state) {
        if (state.keysV >= 2) return false;
        const roster = await _roster();
        const map = {};
        roster.forEach(function (r) { if (r.rawKey && r.rawKey !== r.key) map[r.rawKey] = r.key; });
        state.units = state.units || [];
        state.units.forEach(function (u) { if (u.tenantKey && map[u.tenantKey]) u.tenantKey = map[u.tenantKey]; });
        (state.viewings || []).forEach(function (v) { if (v.npcKey && map[v.npcKey]) v.npcKey = map[v.npcKey]; });
        for (const oldK of Object.keys(map)) {
            try {
                const t = await getTuning(oldK);
                if (!t) continue;
                if (!(await getTuning(map[oldK]))) await saveTuning(map[oldK], t);
            } catch (e) { console.warn('[Landlord] 搬定調失敗，那個人下次會重燒一次', oldK, e); }
        }
        state.keysV = 2;
        return true;
    }

    // 本地退路：沒 API 或解析失敗時,依名字雜湊穩定挑一款房型(同一人每次結果一致)
    function _fallbackTuning(npc) {
        const keys = Object.keys((win.OS_ROOM_SVG && win.OS_ROOM_SVG.ROOM_TYPES) || { standard: 1 });
        const name = String((npc && npc.key) || (npc && npc.name) || '');
        let h = 0;
        for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
        // 口味也用同一組雜湊挑：看房要拿它跟房裡的擺設比，空陣列的話等於誰都無所謂
        const pool = (win.OS_BLUEPRINTS && win.OS_BLUEPRINTS._cfg && win.OS_BLUEPRINTS._cfg.TAGS) || [];
        const habit = [];
        if (pool.length) {
            habit.push(pool[h % pool.length]);
            const second = pool[(Math.floor(h / 7) + 3) % pool.length];
            if (second !== habit[0]) habit.push(second);
        }
        return { idealTypeKey: keys[h % keys.length], rentTolerance: 0.6, habitTags: habit };
    }

    // ── 快取有效性判斷（修正#2）──
    // 檢查：t 存在、idealTypeKey 有值、房型清單存在時該 key 必須在清單內
    // 房型清單尚未載入時不判定為無效，防止重複燒 API
    function _isValidTuning(t) {
        if (!t || !t.idealTypeKey) return false;
        const RT = (win.OS_ROOM_SVG && win.OS_ROOM_SVG.ROOM_TYPES);
        if (!RT) return true;  // 房型清單還沒載入，保守判定為有效(不重複燒 API)
        return !!RT[t.idealTypeKey];
    }

    function _tuneMessages(npc) {
        const RT = (win.OS_ROOM_SVG && win.OS_ROOM_SVG.ROOM_TYPES) || {};
        const list = Object.keys(RT).map(k => '    ' + k + '　＝　' + (RT[k].desc || '')).join('\n');
        const sys = [
            '你是租客分析器。讀一份角色人設，判斷這位角色會想住哪一種房，只回傳純 JSON、不要解釋、不要 markdown：',
            '{"idealTypeKey":"<從下面清單挑一個 KEY>","rentTolerance":<0到1的小數，越高越付得起房租>,"habitTags":["<兩三個生活習性標籤>"]}',
            '房型清單（只准從中挑一個 KEY）：',
            list,
        ].join('\n');
        return [
            { role: 'system', content: sys },
            { role: 'user', content: '角色人設：\n' + String((npc && npc.persona) || (npc && npc.name) || '').slice(0, 800) },
        ];
    }

    // 定調：每人只燒一次 API；有快取先回快取；失敗一律回 fallback,不 throw
    async function tuneTenant(npc) {
        if (!npc || !npc.key) return _fallbackTuning(npc);
        const cached = await getTuning(npc.key);
        if (_isValidTuning(cached)) return cached;

        const api = win.OS_API || window.OS_API;
        const RT = (win.OS_ROOM_SVG && win.OS_ROOM_SVG.ROOM_TYPES) || {};
        let result = null;
        if (api && typeof api.chatSecondary === 'function' && npc.persona) {
            result = await new Promise(function (resolve) {
                let done = false;
                let timer = null;
                const finish = (v) => {
                    if (!done) {
                        done = true;
                        if (timer) clearTimeout(timer);
                        resolve(v);
                    }
                };
                // 修正#1：逾時保護（30秒）——防 chatSecondary 連線卡住招租流程
                timer = setTimeout(() => finish(null), 30000);
                try {
                    api.chatSecondary(_tuneMessages(npc), null,
                        function (text) {
                            try {
                                const t = String(text || '').replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
                                const m = t.match(/\{[\s\S]*\}/);
                                const o = m ? JSON.parse(m[0]) : null;
                                if (!o || !RT[o.idealTypeKey]) return finish(null);
                                let tol = parseFloat(o.rentTolerance);
                                if (!isFinite(tol)) tol = 0.6;
                                finish({
                                    idealTypeKey: o.idealTypeKey,
                                    rentTolerance: Math.max(0, Math.min(1, tol)),
                                    habitTags: Array.isArray(o.habitTags) ? o.habitTags.slice(0, 3).map(String) : [],
                                });
                            } catch (e) { finish(null); }
                        },
                        function () { finish(null); },
                        { label: '租客定調' });
                } catch (e) { finish(null); }
            });
        }
        const tuning = result || _fallbackTuning(npc);
        await saveTuning(npc.key, tuning);
        return tuning;
    }

    // 入住：純函式,回新 state
    function moveIn(state, unitId, npc) {
        // 修正#3：防 npc 為 null/undefined 導致拋錯
        if (!npc || !npc.key) {
            return JSON.parse(JSON.stringify(state));  // 無效 npc → 原樣回傳深拷貝
        }
        const s = JSON.parse(JSON.stringify(state));
        const u = s.units.find(x => x.id === unitId);
        if (!u || u.tenantKey) return s;                 // 找不到或已有人 → 原樣回
        u.tenantKey = npc.key; u.tenantName = npc.name || '房客'; u.movedInAt = _now();
        u.listed = false;   // 租掉了就把招租牌收起來
        return s;
    }

    // ── 打開房產（手帳窗口進來走這條）：先補算離線收租 ──
    // 🚨入帳與存檔綁定：有租金時,唯有 addPT 真的成功才可以把 lastSettleDay 推進到今天。
    //   否則存檔會讓這筆房租永久消失(下次開 app 誤以為已收過)。
    // 修正#4：入帳成功後若存檔失敗,需重試一次後回傳 saveFailed 旗標,避免重複入帳
    // 防重複跑：連點入口鈕時,第二次呼叫回傳「同一個進行中的 promise」,而不是靜默 return
    //   (靜默 return 會讓連點時後一次呼叫的畫面容器沒東西可畫,出現空白面板;參考 os_cafe.js 的 _settling 閂寫法)
    let _settling = null;
    async function _openAndSettle() {
        if (_settling) return _settling;
        _settling = _openAndSettleInner().finally(() => { _settling = null; });
        return _settling;
    }
    async function _openAndSettleInner() {
        const state = await getState();
        const r = settleCore(state, _dayNum(_now()));
        if (r.earned > 0) {
            const pt = win.OS_PT || window.OS_PT;
            try {
                if (!pt || typeof pt.addPT !== 'function') throw new Error('包租戶錢包尚未就緒');
                await pt.addPT(r.earned, { reason: '房租收入', items: r.perUnit });
            } catch (e) {
                console.warn('[Landlord] 入帳失敗,本次房租暫不結算,下次開啟再補算', e);
                // 不存檔 → lastSettleDay 保持原樣,下次開 app 會重新補算這段期間
                return { state: state, days: r.days, earned: r.earned, perUnit: r.perUnit, payFailed: true };
            }
            // 入帳成功後,存檔帶重試保護（兩次都失敗才算失敗）
            let saveFailed = false;
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    await saveState(r.state);
                    break;
                } catch (e) {
                    if (attempt === 0) {
                        console.warn('[Landlord] 存檔失敗,正在重試…', e);
                    } else {
                        console.warn('[Landlord] 存檔重試仍失敗,房租已入帳但結算紀錄未保存', e);
                        saveFailed = true;
                    }
                }
            }
            if (saveFailed) {
                return { state: r.state, days: r.days, earned: r.earned, perUnit: r.perUnit, saveFailed: true };
            }
        } else {
            // earned === 0 時正常存檔,無重試(維持既有行為)
            await saveState(r.state);
        }
        // 🔔 收租結算完才跑看房（本地擲骰，不燒 API）；失敗不影響已經收好的租
        let finalState = r.state, viewAdded = [], moveOut = [];
        try {
            const vr = await _runDaily(r.state);
            finalState = vr.state; viewAdded = vr.added; moveOut = vr.left;
        } catch (e) { console.warn('[Landlord] 每日結算失敗，這次先跳過', e); }
        return { state: finalState, days: r.days, earned: r.earned, perUnit: r.perUnit, payFailed: false, viewAdded: viewAdded, moveOut: moveOut };
    }

    // 把看房要用的資料備好（房裡有哪些口味的家具、建議價、名冊、已快取的定調）再跑純函式
    async function _runDaily(state) {
        const today = _dayNum(_now());
        // 要看的戶＝掛招租的(等人上門) ＋ 有房客的(住得爽不爽)
        const care = (state.units || []).filter(function (u) { return (u.listed && !u.tenantKey) || u.tenantKey; });
        if (!care.length) {
            // 什麼都沒有：日子照樣推到今天，免得哪天掛上招租就一口氣補算一堆人
            const s = JSON.parse(JSON.stringify(state));
            s.viewings = Array.isArray(s.viewings) ? s.viewings : [];
            s.moveOuts = Array.isArray(s.moveOuts) ? s.moveOuts : [];
            s.lastViewDay = today; s.lastStayDay = today;
            await saveState(s);
            return { state: s, added: [], left: [] };
        }
        const rooms = {};
        for (const u of care) {
            let order = [];
            try { const room = await getRoom(u.id); order = (room && Array.isArray(room.order)) ? room.order : []; }
            catch (e) { console.warn('[Landlord] 看房時讀房間失敗，當空房算', u.id, e); }
            const tags = [];
            order.forEach(function (it) {
                (it.tags || []).forEach(function (t) { if (tags.indexOf(t) < 0) tags.push(t); });
            });
            rooms[u.id] = { tags: tags, suggest: suggestRent(u, order.length) };
        }
        const roster = await _roster();
        const tunings = {};
        for (const r of roster) {
            if (!r || !r.key) continue;
            try { const t = await getTuning(r.key); if (_isValidTuning(t)) tunings[r.key] = t; } catch (e) {}
        }
        // 先算住戶：不滿累積夠了就搬走，那間房空出來(而且不會自動掛招租)
        const tr = settleTenants(state, today, rooms, tunings);
        // 再算看房：剛空出來的戶因為沒掛招租，今天不會有人來看
        const vr = settleViewings(tr.state, today, roster, rooms, tunings);

        // 新面孔補一次定調（照人設決定他的理想房型與口味），之後永久快取不再燒。
        // 一次結算最多兩個人，久沒開 app 不會一口氣燒一串；沒定調到的就先用雜湊退路。
        let budget = 2;
        for (const v of vr.added) {
            if (budget <= 0) break;
            if (tunings[v.npcKey]) continue;
            const npc = roster.find(function (r) { return r && r.key === v.npcKey; });
            if (!npc || !npc.persona) continue;
            budget--;
            try {
                const t = await tuneTenant(npc);
                if (!_isValidTuning(t)) continue;
                const u = vr.state.units.find(function (x) { return x.id === v.unitId; });
                const info = rooms[v.unitId];
                const rec = vr.state.viewings.find(function (x) { return x.id === v.id; });
                if (!u || !info || !rec) continue;
                const fit = judgeFit(t, u, info.suggest, info.tags, v.unitId + ':' + v.day + ':' + v.npcKey);   // 定調完重算一次合不合
                rec.fit = Math.round(fit * 100) / 100;
                rec.want = fit >= 0.5;
            } catch (e) { console.warn('[Landlord] 看房定調失敗，先用退路', v.npcKey, e); }
        }

        await saveState(vr.state);
        return { state: vr.state, added: vr.added, left: tr.left };
    }

    // 讓某位看房客入住：房子租出去，這戶其他還掛著的看房紀錄一起收掉
    async function moveInFromViewing(viewingId) {
        const state = await getState();
        const v = (state.viewings || []).find(function (x) { return x.id === viewingId; });
        if (!v) return { ok: false, reason: 'gone' };
        if (!v.want) return { ok: false, reason: 'notwant' };
        const unit = (state.units || []).find(function (u) { return u.id === v.unitId; });
        if (!unit) return { ok: false, reason: 'gone' };
        if (unit.tenantKey) return { ok: false, reason: 'occupied' };
        const s2 = moveIn(state, v.unitId, { key: v.npcKey, name: v.name });
        s2.viewings = (s2.viewings || []).map(function (x) {
            return x.unitId === v.unitId ? Object.assign({}, x, { done: true }) : x;
        });
        try { await saveState(s2); } catch (e) { console.warn('[Landlord] 入住存檔失敗', e); return { ok: false, reason: 'save' }; }
        return { ok: true, state: s2, name: v.name, unitId: v.unitId };
    }

    // 送走一筆看房紀錄（不租給他，或他本來就不想租）
    async function dismissViewing(viewingId) {
        const state = await getState();
        const v = (state.viewings || []).find(function (x) { return x.id === viewingId; });
        if (!v) return { ok: false, reason: 'gone' };
        v.done = true;
        try { await saveState(state); } catch (e) { return { ok: false, reason: 'save' }; }
        return { ok: true, state: state };
    }

    // 🎧 想聽這位訪客怎麼說：一筆只燒一次副模型，講完存回那筆紀錄
    // 共用：抓那一戶的背景（人設、房型、房裡有什麼），再問副模型要一句話。
    //   兩個入口（看完房的訪客／搬走的房客）差的只有 prompt。
    async function _npcContext(state, npcKey, unitId) {
        let persona = '';
        try {
            const roster = await _roster();
            const hit = roster.find(function (r) { return r && r.key === npcKey; });
            persona = (hit && hit.persona) || '';
        } catch (e) {}
        const unit = (state.units || []).find(function (u) { return u.id === unitId; }) || {};
        const RT = (win.OS_ROOM_SVG && win.OS_ROOM_SVG.ROOM_TYPES) || {};
        const typeLabel = (RT[unit.roomTypeKey] && RT[unit.roomTypeKey].label) || '房間';
        let stuff = [];
        try {
            const room = await getRoom(unitId);
            stuff = ((room && room.order) || []).map(function (it) { return it.name; }).filter(Boolean).slice(0, 10);
        } catch (e) {}
        return { persona: persona, typeLabel: typeLabel, stuff: stuff };
    }
    async function _askLine(sys, body, label) {
        const api = win.OS_API || window.OS_API;
        if (!api || !api.chat) throw new Error('找不到副模型接口。');
        let config = {};
        const OS = win.OS_SETTINGS || window.OS_SETTINGS;
        if (OS) {
            const sec = OS.getSecondaryConfig ? OS.getSecondaryConfig() : null;
            config = (sec && (sec.key || (sec.useSystemApi && sec.stProfileId))) ? sec : OS.getConfig();
        }
        config = config || {};
        config.route = 'landlord_line';
        const raw = await new Promise(function (resolve, reject) {
            api.chat([{ role: 'system', content: sys }, { role: 'user', content: body }],
                config, null, resolve, reject, { label: label, keepCodeFences: true });
        });
        let line = '';
        try {
            const t = String(raw || '').replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').replace(/```(?:[a-z]+)?/gi, '').replace(/```/g, '');
            const m = t.match(/\{[\s\S]*\}/);
            if (m) line = String((JSON.parse(m[0]) || {}).line || '').slice(0, 60);
        } catch (e) { console.warn('[Landlord] 留言解析失敗', e); }
        if (!line) throw new Error('他這次沒說什麼，等一下再問問。');
        return line;
    }

    async function hearViewing(viewingId) {
        const state = await getState();
        const v = (state.viewings || []).find(function (x) { return x.id === viewingId; });
        if (!v) throw new Error('找不到這筆看房紀錄。');
        if (v.line) return v.line;

        const c = await _npcContext(state, v.npcKey, v.unitId);
        const sys = [
            '你要扮演這位角色，剛看完一間出租房，對房東（玩家）說一句話。',
            '只回傳純 JSON：{"line":"{他口吻的一到兩句話，不超過 45 字}"}',
            '這是他的結論：' + (v.want ? '他想租下來。' : '他不打算租。') + '講話要跟這個結論一致，不要模稜兩可。',
            '可以提到房間的格局、擺設或租金，但不要報數字給房東聽，用感覺講。',
            '不要問候語、不要解釋、不要 markdown。語言：繁體中文。',
        ].join('\n');
        const body = [
            '角色人設：' + (c.persona ? String(c.persona).slice(0, 800) : '（沒有特別的設定，用中性口吻）'),
            '房間：' + c.typeLabel + (c.stuff.length ? ('，裡面有：' + c.stuff.join('、')) : '，空的什麼都沒有'),
            '租金：每日 ' + (v.rent || 0) + (v.rent > 0 ? '（他覺得' + (v.fit >= 0.5 ? '還可以' : '偏貴') + '）' : ''),
        ].join('\n');

        const line = await _askLine(sys, body, '看房訪客留言');
        v.line = line;
        try { await saveState(state); } catch (e) { console.warn('[Landlord] 存看房留言失敗', e); }
        return line;
    }

    // 🎧 想聽他為什麼搬走：一筆只燒一次
    async function hearMoveOut(id) {
        const state = await getState();
        const o = (state.moveOuts || []).find(function (x) { return x.id === id; });
        if (!o) throw new Error('找不到這筆紀錄。');
        if (o.line) return o.line;

        const c = await _npcContext(state, o.npcKey, o.unitId);
        const sys = [
            '你要扮演這位角色，剛退租搬走，對房東（玩家）留一句話說明為什麼。',
            '只回傳純 JSON：{"line":"{他口吻的一到兩句話，不超過 45 字}"}',
            '他是住了一陣子之後決定搬的，不是一開始就不喜歡：語氣要像「住下來才發現」，不要翻臉、也不要客套到看不出原因。',
            '可以提到房間的格局、擺設不合他的習慣，或租金與住起來的感覺不成正比，但不要報數字，用感覺講。',
            '不要問候語、不要解釋、不要 markdown。語言：繁體中文。',
        ].join('\n');
        const body = [
            '角色人設：' + (c.persona ? String(c.persona).slice(0, 800) : '（沒有特別的設定，用中性口吻）'),
            '他住的房間：' + c.typeLabel + (c.stuff.length ? ('，裡面有：' + c.stuff.join('、')) : '，空的什麼都沒有'),
            '他付的租金：每日 ' + (o.rent || 0),
        ].join('\n');

        const line = await _askLine(sys, body, '退租留言');
        o.line = line;
        try { await saveState(state); } catch (e) { console.warn('[Landlord] 存退租留言失敗', e); }
        return line;
    }

    // 知道了：把這筆退租通知收起來
    async function dismissMoveOut(id) {
        const state = await getState();
        const o = (state.moveOuts || []).find(function (x) { return x.id === id; });
        if (!o) return { ok: false, reason: 'gone' };
        o.done = true;
        try { await saveState(state); } catch (e) { return { ok: false, reason: 'save' }; }
        return { ok: true, state: state };
    }

    win.OS_LANDLORD = {
        _cfg: LL_CFG, _defaultState, getState, saveState, getTuning, saveTuning, getRoom, saveRoom, _dayNum, settleCore,
        listCandidates, tuneTenant, moveIn, _fallbackTuning, _openAndSettle,   // _openAndSettle=手帳窗口的結算入口
        addFloor, _makeFloorUnits, _unitId,   // 🏢 樓層制
        suggestRent, rentRange, getPricing, setListing,   // 💰 定價＋掛招租
        settleViewings, judgeFit, moveInFromViewing, dismissViewing, hearViewing,   // 🔔 看房訪客
        settleTenants, stayMood, hearMoveOut, dismissMoveOut, _cfgStay: STAY_CFG,   // 🏃 續租／退租
        _normRoster, _roster,   // 🚨 名冊身分正規化（M-6）
    };
    if (win !== window) { try { window.OS_LANDLORD = win.OS_LANDLORD; } catch (e) {} }
    console.log('[Landlord] 包租婆系統已載入');
})();
