// ----------------------------------------------------------------
// [檔案] os_landlord.js
// 路徑：os_phone/os/os_landlord.js
// 職責：包租婆系統①地基——物業/租客資料、離線補算收租、招租與定調、app 主畫面。
//   成本哲學同書咖：日常收租全本地零 API；只有「租客定調(每人一次)」燒 API 且有本地退路。
//   設計書 docs/landlord_design.md
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;

    const LL_CFG = {
        initialUnits: 2,        // ①期固定 2 戶
        baseRent: 12,           // 每戶每天固定基礎租金(PT)——①期不接係數
        catchUpDays: 7,         // 離線補算上限
        initialTypes: ['cozy', 'deep'],   // 初始兩戶的房型
    };

    const APP_ID = 'landlord';
    const K_STATE = 'state';
    const K_TUNE = 'tune';      // tune::<npcKey>

    function _db() { return win.OS_DB || window.OS_DB; }
    function _now() { try { return Date.now(); } catch (e) { return 0; } }
    // 以「天」為刻度(本地日期)，跟書咖同一招
    function _dayNum(ts) { return Math.floor(ts / 86400000); }

    function _defaultState() {
        const units = [];
        for (let i = 0; i < LL_CFG.initialUnits; i++) {
            units.push({
                id: 'u' + (i + 1),
                roomTypeKey: LL_CFG.initialTypes[i] || 'standard',
                tenantKey: null, tenantName: null,
                rent: LL_CFG.baseRent,
                movedInAt: null,
            });
        }
        return { units: units, lastSettleDay: null, createdAt: _now() };
    }

    async function getState() {
        try {
            const db = _db();
            if (!db?.getAppData) return _defaultState();
            const v = await db.getAppData(APP_ID, K_STATE);
            if (v && Array.isArray(v.units) && v.units.length) return v;
            const fresh = _defaultState();
            await saveState(fresh);
            return fresh;
        } catch (e) { console.warn('[Landlord] getState 失敗', e); return _defaultState(); }
    }

    async function saveState(state) {
        const db = _db();
        if (!db?.saveAppData) throw new Error('OS_DB.saveAppData 不存在');
        await db.saveAppData(APP_ID, K_STATE, state);
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
            perUnit.push({ unitId: u.id, tenantName: u.tenantName || '房客', amount: amount });
        });
        s.lastSettleDay = todayDay;
        return { state: s, days: days, earned: earned, perUnit: perUnit };
    }

    // ── 招租：候選名冊(沿用書咖的顧客名冊來源) ──
    async function listCandidates() {
        let roster = [];
        try {
            const ln = win.LobbyNpcs || window.LobbyNpcs;
            if (ln && typeof ln.cafeRoster === 'function') roster = (await ln.cafeRoster()) || [];
        } catch (e) { console.warn('[Landlord] 讀名冊失敗', e); }
        const out = [];
        for (const r of roster) {
            if (!r || !r.key) continue;
            out.push({ key: r.key, name: r.name || '無名', persona: r.persona || '', tuned: !!(await getTuning(r.key)) });
        }
        return out;
    }

    // 本地退路：沒 API 或解析失敗時,依名字雜湊穩定挑一款房型(同一人每次結果一致)
    function _fallbackTuning(npc) {
        const keys = Object.keys((win.OS_ROOM_SVG && win.OS_ROOM_SVG.ROOM_TYPES) || { standard: 1 });
        const name = String((npc && npc.key) || (npc && npc.name) || '');
        let h = 0;
        for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
        return { idealTypeKey: keys[h % keys.length], rentTolerance: 0.6, habitTags: [] };
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
            { role: 'user', content: '角色人設：\n' + String((npc && npc.persona) || (npc && npc.name) || '') },
        ];
    }

    // 定調：每人只燒一次 API；有快取先回快取；失敗一律回 fallback,不 throw
    async function tuneTenant(npc) {
        if (!npc || !npc.key) return _fallbackTuning(npc);
        const cached = await getTuning(npc.key);
        if (cached && cached.idealTypeKey) return cached;

        const api = win.OS_API || window.OS_API;
        const RT = (win.OS_ROOM_SVG && win.OS_ROOM_SVG.ROOM_TYPES) || {};
        let result = null;
        if (api && typeof api.chatSecondary === 'function' && npc.persona) {
            result = await new Promise(function (resolve) {
                let done = false;
                const finish = (v) => { if (!done) { done = true; resolve(v); } };
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
        const s = JSON.parse(JSON.stringify(state));
        const u = s.units.find(x => x.id === unitId);
        if (!u || u.tenantKey) return s;                 // 找不到或已有人 → 原樣回
        u.tenantKey = npc.key; u.tenantName = npc.name || '房客'; u.movedInAt = _now();
        return s;
    }

    win.OS_LANDLORD = {
        _cfg: LL_CFG, _defaultState, getState, saveState, getTuning, saveTuning, _dayNum, settleCore,
        listCandidates, tuneTenant, moveIn, _fallbackTuning,
    };
    if (win !== window) { try { window.OS_LANDLORD = win.OS_LANDLORD; } catch (e) {} }
    console.log('[Landlord] 包租婆系統已載入');
})();
