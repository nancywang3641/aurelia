// ----------------------------------------------------------------
// [檔案 5] os_lorebook.js (V3.0 - Auto World Book Reader)
// 原檔案：wx_lorebook.js
// 職責：讀取酒館 (SillyTavern) 的世界書數據 (World Info)。
// V3.0 升級點：
// 1. 移除 UI 面板，直接讀取當前角色主世界書。
// 2. 使用新版 API: getCharWorldbookNames / getWorldbook。
// 3. 兼容層：同時導出 WX_LOREBOOK。
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入世界書讀取器 (Lorebook Reader V3.0)...');
    const win = window.parent || window;

    // --- 背景數據提供者 ---
    let CACHED_API_TEXT = "";
    let CACHED_ENTRY_LIST = [];
    let CURRENT_TARGET_BOOK = null;

    async function updateApiCache() {
        try {
            const helper = win.TavernHelper
                || (win.parent && win.parent.TavernHelper)
                || (win.top && win.top.TavernHelper);
            if (!helper) return;

            // 直接獲取當前角色的主世界書
            let targetBook = null;

            if (typeof helper.getCharWorldbookNames === 'function') {
                const charBooks = helper.getCharWorldbookNames('current');
                targetBook = (charBooks && charBooks.primary) ? charBooks.primary : null;
            } else if (typeof helper.getCurrentCharPrimaryLorebook === 'function') {
                targetBook = helper.getCurrentCharPrimaryLorebook();
            }

            if (!targetBook) {
                CACHED_API_TEXT = "";
                CACHED_ENTRY_LIST = [];
                return;
            }

            if (CURRENT_TARGET_BOOK !== targetBook) {
                console.log(`[OS_LOREBOOK] 讀取主世界書: ${targetBook}`);
                CURRENT_TARGET_BOOK = targetBook;
            }

            // 抓取世界書內容
            let tempText = "";
            let tempList = [];

            let entries = null;
            if (typeof helper.getWorldbook === 'function') {
                entries = await helper.getWorldbook(targetBook);
            } else if (typeof helper.getLorebookEntries === 'function') {
                entries = await helper.getLorebookEntries(targetBook);
            }

            if (entries && Array.isArray(entries)) {
                entries.forEach(entry => {
                    // 新版 API: entry.strategy.type；舊版: entry.constant
                    const isConstant = (entry.strategy && entry.strategy.type === 'constant')
                        || (entry.constant === true)
                        || (entry.type === 'constant');
                    const isEnabled = entry.enabled !== false;

                    if (isConstant && isEnabled && entry.content) {
                        const title = entry.name || entry.comment || `Entry #${entry.uid}`;
                        tempText += `[World Info: ${title}]\n${entry.content}\n\n`;
                        tempList.push(`[#${entry.uid}] ${title}`);
                    }
                });
            }

            CACHED_API_TEXT = tempText;
            CACHED_ENTRY_LIST = tempList;

        } catch (e) {
            console.warn("[OS_LOREBOOK] Sync Error:", e);
        }
    }

    // 啟動定時同步
    setInterval(updateApiCache, 3000);
    setTimeout(updateApiCache, 1000);

    // --- 導出全域接口 ---
    win.OS_LOREBOOK = {
        getPromptText: function() {
            if (!CACHED_API_TEXT) { updateApiCache(); }
            return CACHED_API_TEXT;
        },
        getActiveList: function() {
            return CACHED_ENTRY_LIST || [];
        },
        refresh: updateApiCache,
    };

    // --- 兼容層 ---
    win.WX_LOREBOOK = win.OS_LOREBOOK;
})();
