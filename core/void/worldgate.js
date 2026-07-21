// ----------------------------------------------------------------
// [檔案] worldgate.js — 視差世界門 ②切書機制（2026-07-22）
// 職責：奧瑞亞卡的世界書自動切換。
//   主世界模式：主書=【奧瑞亞世界】(表世界) ＋ 附加【奧瑞亞-人物核心】
//   視差模式  ：主書卸下(null)            ＋ 附加【奧瑞亞-人物核心】+【奧瑞亞-視差】
//   人物核心永遠在場；她自己另掛的附加書一律原樣保留。
// 守衛：綁定裡出現任一本奧瑞亞書才動手——其他作者的卡一律不碰（跨卡隔離）。
// 對帳：載入/換聊天時檢查殘局（上次切到一半當機＝主書空但視差也不在→復原表世界）。
// 依賴：TavernHelper（getCharLorebooks/setCurrentCharLorebooks/getLorebooks），呼叫時才取用。
// 下游：③世界門面板 DIVE/撤離時呼叫 enterParallax()/exitParallax()。
// ----------------------------------------------------------------
(function () {
    'use strict';

    const BOOK_MAIN = '【奧瑞亞世界】';       // 表世界（角色卡主書）
    const BOOK_CORE = '【奧瑞亞-人物核心】';   // 永遠開
    const BOOK_PARA = '【奧瑞亞-視差】';       // 進視差開

    function _th() {
        return window.TavernHelper || (window.parent && window.parent.TavernHelper) || null;
    }

    // 讀當前卡的綁定快照；ours=這是奧瑞亞卡（綁了任一本奧瑞亞書）
    function _snapshot() {
        const TH = _th();
        if (!TH || typeof TH.getCharLorebooks !== 'function') return null;
        let c = null;
        try { c = TH.getCharLorebooks(); } catch (e) { return null; }
        const primary = (c && c.primary) || null;
        const additional = (c && Array.isArray(c.additional)) ? c.additional.slice() : [];
        const ours = primary === BOOK_MAIN ||
            additional.indexOf(BOOK_MAIN) >= 0 || additional.indexOf(BOOK_CORE) >= 0 || additional.indexOf(BOOK_PARA) >= 0;
        return { primary, additional, ours };
    }

    function isInParallax() {
        const s = _snapshot();
        return !!(s && s.ours && s.additional.indexOf(BOOK_PARA) >= 0 && s.primary !== BOOK_MAIN);
    }

    // 三本書都匯入了才准切（沒匯入就動手會把綁定指到不存在的書）
    function _missingBooks(TH) {
        let names = [];
        try { names = TH.getLorebooks() || []; } catch (e) { return null; }
        return [BOOK_MAIN, BOOK_CORE, BOOK_PARA].filter(b => names.indexOf(b) < 0);
    }

    // 進視差：表世界主書收起，掛核心＋視差
    async function enterParallax() {
        const TH = _th();
        const s = _snapshot();
        if (!TH || !s) return { ok: false, msg: '世界書 API 不可用' };
        if (!s.ours) return { ok: false, msg: '當前角色卡不是奧瑞亞卡，不動它的世界書' };
        const missing = _missingBooks(TH);
        if (missing === null) return { ok: false, msg: '世界書清單讀取失敗' };
        if (missing.length) return { ok: false, msg: '還沒匯入：' + missing.join('、') };
        if (s.primary !== BOOK_MAIN && s.additional.indexOf(BOOK_PARA) >= 0) return { ok: true, msg: '已在視差模式' };
        const add = s.additional.filter(b => b !== BOOK_PARA && b !== BOOK_CORE);
        add.push(BOOK_CORE, BOOK_PARA);
        try {
            await TH.setCurrentCharLorebooks({ primary: null, additional: add });
        } catch (e) {
            console.error('[Worldgate] 切入視差失敗:', e);
            return { ok: false, msg: '切書失敗：' + (e && e.message || e) };
        }
        console.log('[Worldgate] 🌌 已切入視差（表世界書收起）');
        return { ok: true, msg: '已切入視差' };
    }

    // 回主世界：表世界主書掛回，視差收起（核心保留）
    async function exitParallax() {
        const TH = _th();
        const s = _snapshot();
        if (!TH || !s) return { ok: false, msg: '世界書 API 不可用' };
        if (!s.ours) return { ok: false, msg: '當前角色卡不是奧瑞亞卡，不動它的世界書' };
        const add = s.additional.filter(b => b !== BOOK_PARA && b !== BOOK_CORE);
        add.push(BOOK_CORE);
        try {
            await TH.setCurrentCharLorebooks({ primary: BOOK_MAIN, additional: add });
        } catch (e) {
            console.error('[Worldgate] 返回主世界失敗:', e);
            return { ok: false, msg: '切書失敗：' + (e && e.message || e) };
        }
        console.log('[Worldgate] 🏙 已返回主世界（表世界書掛回）');
        return { ok: true, msg: '已返回主世界' };
    }

    // 殘局對帳：主書空、視差也不在＝上次切到一半當機 → 自動掛回表世界
    async function reconcile() {
        const s = _snapshot();
        if (!s || !s.ours) return;
        if (!s.primary && s.additional.indexOf(BOOK_PARA) < 0) {
            console.warn('[Worldgate] 偵測到殘局（主書空且非視差模式），自動復原表世界');
            await exitParallax();
        }
    }

    // 換聊天/開機時對帳（跨卡由 ours 守衛；事件不可用就只做開機對帳）
    function _hookEvents() {
        try {
            const ev = window.eventOn || (window.parent && window.parent.eventOn);
            const TE = window.tavern_events || (window.parent && window.parent.tavern_events);
            if (ev && TE && TE.CHAT_CHANGED) ev(TE.CHAT_CHANGED, () => { reconcile(); });
        } catch (e) {}
        setTimeout(() => { reconcile(); }, 4000);   // 開機晚點跑，等 TavernHelper 就緒
    }
    _hookEvents();

    window.AURELIA_WORLDGATE = {
        isInParallax, enterParallax, exitParallax, reconcile,
        BOOKS: { main: BOOK_MAIN, core: BOOK_CORE, para: BOOK_PARA },
    };
    console.log('[Worldgate] 視差切書模組已載入');
})();
