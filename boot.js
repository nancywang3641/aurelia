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
    import(base + '/index.js');
} catch (e) {
    console.error('[Aurelia boot] 引導失敗', e);
}
