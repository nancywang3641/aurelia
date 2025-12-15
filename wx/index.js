// ----------------------------------------------------------------
// [檔案 4] index.js (加載器 / Loader)
// Update: V71.11 - 增加防快取機制 (Anti-Cache Timestamp)
// ----------------------------------------------------------------

(async function() {
    console.log('[WeChat Loader] 初始化...');

    const GITHUB_USER = 'nancywang3641'; 
    const GITHUB_REPO = 'aurelia'; 
    const BRANCH = 'main'; 
    
    const BASE_URL = `https://cdn.jsdelivr.net/gh/${GITHUB_USER}/${GITHUB_REPO}@${BRANCH}/wx/`;

    // 生成時間戳，防止 CDN 快取舊檔案
    const CACHE_BUSTER = '?v=' + Date.now();

    function loadScript(fileName) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            // 🔴 關鍵：加上時間戳，強制讀取最新版
            script.src = BASE_URL + fileName + CACHE_BUSTER;
            script.onload = () => { console.log(`[WeChat] ✅ ${fileName} OK`); resolve(); };
            script.onerror = () => { console.error(`[WeChat] ❌ ${fileName} Failed`); reject(); };
            document.head.appendChild(script);
        });
    }

    try {
        await loadScript('wx_theme.js');
        await loadScript('wx_view.js');
        await loadScript('wx_core.js');
        console.log('[WeChat] 啟動成功！所有模塊已更新至最新。');
    } catch (err) {
        console.error('[WeChat] 啟動失敗');
    }
})();