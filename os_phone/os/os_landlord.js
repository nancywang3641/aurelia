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

    win.OS_LANDLORD = {
        _cfg: LL_CFG, _defaultState, getState, saveState, getTuning, saveTuning, _dayNum,
    };
    if (win !== window) { try { window.OS_LANDLORD = win.OS_LANDLORD; } catch (e) {} }
    console.log('[Landlord] 包租婆系統已載入');
})();
