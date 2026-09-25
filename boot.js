// ============================================================
// boot.js —— 乾淨的靜態 import 引導檔（給酒館助手/TauriTavern 用）
// ------------------------------------------------------------
// 用法（跟別的酒館腳本一樣，一行靜態 import、不用任何前言）：
//   import 'https://testingcf.jsdelivr.net/gh/nancywang3641/aurelia@<ref>/boot.js'
//
// 原理：本檔被「靜態 import」載入＝ES 模組，import.meta.url 就是自己的網址，
//   由它反推出 CDN base（含節點 testingcf + 鎖定的 commit），設給 index.js，
//   再動態載入 index.js + 全部模組 → 整包都跟 boot.js 同節點同 commit。
//   這樣使用者不必手寫 __AURELIA_CDN_BASE__ / __AURELIA_REF__ 前言，
//   也避開「cdn.jsdelivr.net 對巨型擴展+新commit限流」的坑（改走 boot.js 所在節點）。
// ============================================================
try {
    // 自己的目錄＝CDN base（例：https://testingcf.jsdelivr.net/gh/nancywang3641/aurelia@c9d62fa）
    const base = new URL('.', import.meta.url).href.replace(/\/+$/, '');
    // 🚨 主頁面已經有一份在跑：
    //    同一版 → 什麼都不做（以前每次都把「已啟動」旗標清掉，助手重跑腳本就整包再啟動一次：按鈕面板兩份、事件觸發兩次）
    //    換了版 → 重新整理頁面，重整後乾淨地載入新版（同 index.js 換 ref 的做法），不在舊版上面疊新版
    let P = window;
    try { if (window.parent && window.parent !== window) P = window.parent; } catch (e) {}
    let running = false, runningBase = '';
    try { running = !!P.__AURELIA_INITIALIZED__; runningBase = P.__AURELIA_LOADED_BASE__ || ''; } catch (e) {}
    if (running && runningBase === base) {
        console.log('[Aurelia boot] 同一版已經在跑，這次不再載入');
    } else if (running && runningBase && runningBase !== base) {
        // 同一個新版只重整一次：本地安裝那份跟 CDN 這份網址本來就不同，重整後本地那份又先跑起來的話，別一直重整下去
        let tried = '';
        try { tried = P.sessionStorage.getItem('aurelia_boot_reload') || ''; } catch (e) {}
        if (tried === base) {
            console.warn('[Aurelia boot] 已經有別的一份在跑（' + runningBase + '），重整過一次還是它 → 這份不載入');
        } else {
            try { P.sessionStorage.setItem('aurelia_boot_reload', base); } catch (e) {}
            console.log('[Aurelia boot] 換版（' + runningBase + ' → ' + base + '）→ 重新整理頁面載入新版');
            try { P.location.reload(); } catch (e) { console.warn('[Aurelia boot] 重新整理失敗', e); }
        }
    } else {
        // 清掉可能卡住的旗標 + 把 CDN base 傳給 index.js（主頁面 + 沙盒父頁都設）
        [window, window.parent].forEach(function (W) {
            try {
                W.__AURELIA_BOOTSTRAPPED__ = false;
                W.__AURELIA_REF__ = undefined;
                W.__AURELIA_FROM_CDN__ = undefined;
                W.__AURELIA_INITIALIZED__ = false;
                W.__AURELIA_CDN_BASE__ = base;   // index.js 會讀這個，整包模組都走同一節點同 commit
            } catch (e) {}
        });
        // 動態載入主程式（index.js 內部會用 __AURELIA_CDN_BASE__ 載全部模組 + CSS）
        import(base + '/index.js').catch(function (e) {
            console.error('[Aurelia boot] 主程式載入失敗（多半是 CDN 暫時連不上，重跑一次即可）', e);
            try { const A = P.AUI || window.AUI; if (A && A.toast) A.toast('奧瑞亞載入失敗，重新整理再試一次'); } catch (x) {}
        });
    }
} catch (e) {
    console.error('[Aurelia boot] 引導失敗', e);
}
