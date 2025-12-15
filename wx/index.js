// ----------------------------------------------------------------
// [檔案 4] index.js (加載器 / Loader)
// 職責：按順序遠程加載 Theme -> View -> Core，解決依賴問題。
// ----------------------------------------------------------------

(async function() {
    console.log('[WeChat Loader] 初始化...');

    // 🔴 這裡已經幫你填好你的用戶名和倉庫名了
    const GITHUB_USER = 'nancywang3641'; 
    const GITHUB_REPO = 'aurelia'; 
    const BRANCH = 'main'; 
    
    // 🔴 關鍵修改：路徑後面加上了 /wx/
    // 這樣它才會去 wx 資料夾裡面找其他三個檔案
    const BASE_URL = `https://cdn.jsdelivr.net/gh/${GITHUB_USER}/${GITHUB_REPO}@${BRANCH}/wx/`;

    function loadScript(fileName) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = BASE_URL + fileName;
            script.onload = () => { console.log(`[WeChat] ✅ ${fileName} OK`); resolve(); };
            script.onerror = () => { console.error(`[WeChat] ❌ ${fileName} Failed`); reject(); };
            document.head.appendChild(script);
        });
    }

    try {
        await loadScript('wx_theme.js');
        await loadScript('wx_view.js');
        await loadScript('wx_core.js');
        console.log('[WeChat] 啟動成功！');
    } catch (err) {
        console.error('[WeChat] 啟動失敗');
    }
})();