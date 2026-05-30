// ============================================================
// Aurelia API — 統一的酒館資料入口（備用版插座）
// ------------------------------------------------------------
// 職責：所有「跟酒館要資料」的方法集中在這一個檔，不散落各處。
//   • 酒館助手(TavernHelper)在    → 用助手（享受它幫你擋酒館改版）。
//   • 助手不在 / 被關掉 / 爆掉     → 自動用酒館「原生」getContext() 頂上，功能照常。
//
// 用法：
//   • 未來新程式 → 直接呼叫 window.AureliaAPI.getChatMessages(...) 等。
//   • 舊的 28 個檔用 window.TavernHelper.xxx → 照常相容（助手不在時自動指向這裡）。
//
// 要新增「助手某方法的原生備用」時，只改這一個檔的 native 物件即可。
// ============================================================
(function () {
    'use strict';
    if (window.AureliaAPI) return; // 單例

    // —— 小工具：拿酒館原生的 chat 陣列（助手不在時的資料來源）——
    const _chatArr = () => {
        const ctx = (window.SillyTavern && window.SillyTavern.getContext) ? window.SillyTavern.getContext() : null;
        return (ctx && ctx.chat) || window.chat || [];
    };
    const _ctx = () => (window.SillyTavern && window.SillyTavern.getContext) ? window.SillyTavern.getContext() : null;

    // =========================================================
    // 原生備用實作（助手不在時，用酒館原生 getContext 自己組）
    //   ↓↓↓ 以後要補更多方法的原生退路，就加在這個 native 物件裡 ↓↓↓
    // =========================================================
    const native = {
        // 讀訊息：形狀對齊 TavernHelper 的 ChatMessage（同步回陣列）
        getChatMessages: function (range, opts) {
            let arr = _chatArr().map((m, i) => ({
                message_id: i,
                name: m.name,
                role: m.is_user ? 'user' : (m.is_system ? 'system' : 'assistant'),
                is_hidden: !!m.is_system,
                message: m.mes || '',
                data: m.variables || {},
                extra: m.extra || {}
            }));
            // 解析 range：數字 / "A-B" / 負數(從尾算)
            if (range !== undefined && range !== null && range !== '') {
                const last = arr.length - 1;
                const norm = (n) => { n = parseInt(n, 10); return isNaN(n) ? null : (n < 0 ? last + 1 + n : n); };
                const mm = String(range).match(/^(-?\d+)\s*-\s*(-?\d+)$/);
                if (mm) { let a = norm(mm[1]), b = norm(mm[2]); if (a !== null && b !== null) { if (a > b) { const t = a; a = b; b = t; } arr = arr.slice(a, b + 1); } }
                else { const one = norm(String(range)); if (one !== null) arr = arr[one] ? [arr[one]] : []; }
            }
            // opts.role / hide_state 篩選
            if (opts && opts.role && opts.role !== 'all') arr = arr.filter(x => x.role === opts.role);
            if (opts && opts.hide_state === 'unhidden') arr = arr.filter(x => !x.is_hidden);
            else if (opts && opts.hide_state === 'hidden') arr = arr.filter(x => x.is_hidden);
            return arr;
        },
        getLastMessageId: function () { return _chatArr().length - 1; },
        getLorebookEntries: async function (lorebookName) {
            if (!window.world_info) await new Promise(r => setTimeout(r, 500));
            if (window.world_info && window.world_info.globalSelect) return window.world_info.globalSelect;
            const ctx = _ctx();
            if (ctx && ctx.worldInfo && ctx.worldInfo.globalSelect) return ctx.worldInfo.globalSelect;
            return [];
        },
        setLorebookEntries: async function (lorebookName, entries) {
            try {
                const context = _ctx();
                let sourceData = (context && context.worldInfos) || window.world_info;
                let booksArray = Array.isArray(sourceData) ? sourceData
                    : (sourceData && typeof sourceData === 'object' ? Object.values(sourceData) : []);
                const lorebook = booksArray.find(wi => wi.name === lorebookName);
                if (lorebook) {
                    lorebook.entries = entries;
                    if (context && context.saveWorldInfo) await context.saveWorldInfo(lorebookName);
                    else if (window.saveWorldInfo) window.saveWorldInfo(lorebookName);
                    return true;
                }
                return false;
            } catch (e) { return false; }
        }
    };

    // =========================================================
    // 對外統一入口：每個方法「助手在用助手、不在走原生」（呼叫時即時判斷）
    // =========================================================
    const AureliaAPI = {};
    Object.keys(native).forEach(function (k) {
        AureliaAPI[k] = function () {
            const th = window.TavernHelper;
            // th 是「真助手」(不是我們自己) 且有這方法 → 用助手；否則走原生
            if (th && th !== AureliaAPI && typeof th[k] === 'function') return th[k].apply(th, arguments);
            return native[k].apply(native, arguments);
        };
    });
    window.AureliaAPI = AureliaAPI;

    // =========================================================
    // 插座：保住舊的 window.TavernHelper.xxx 呼叫（28 個檔不用改）
    // =========================================================
    const realTH = window.TavernHelper;
    if (realTH && typeof realTH.getChatMessages === 'function') {
        // 真助手在 → 不蓋它，只補它「沒有」的方法
        ['getLorebookEntries', 'setLorebookEntries'].forEach(function (k) {
            if (typeof realTH[k] !== 'function') realTH[k] = native[k];
        });
    } else {
        // 助手不在 → 讓舊的 window.TavernHelper 呼叫走 AureliaAPI(= 原生備用)
        window.TavernHelper = AureliaAPI;
    }
    window.getLorebookEntries = function (n) { return (window.TavernHelper.getLorebookEntries || native.getLorebookEntries)(n); };
    if (window.top && window.top !== window && !window.top.TavernHelper) window.top.TavernHelper = window.TavernHelper;

    console.log('[AureliaAPI] ✅ 統一資料入口就緒（助手在用助手、不在走原生備用）');
})();
