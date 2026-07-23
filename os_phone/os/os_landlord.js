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

    win.OS_LANDLORD = {
        _cfg: LL_CFG, _defaultState, getState, saveState, getTuning, saveTuning, _dayNum, settleCore,
    };
    if (win !== window) { try { window.OS_LANDLORD = win.OS_LANDLORD; } catch (e) {} }
    console.log('[Landlord] 包租婆系統已載入');
})();
