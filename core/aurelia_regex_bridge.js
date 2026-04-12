/**
 * ==========================================
 * Aurelia Regex Bridge & CSS Catcher (正則 CSS 捕捉與數據橋接器)
 * ==========================================
 * 專門解決：酒館正則「拆分注入」導致的 CSS 遺失問題，以及自動抓取終端機面板數據供 VN 面板使用。
 */
(function() {
    'use strict';

    console.log('✅ [Aurelia Bridge] 啟動正則 CSS 捕捉與數據橋接器...');

    // 1. 全局 CSS 捕捉器：抓取聊天室內所有的 <style>，同步到全局，確保移動到其他 TAB 也能正常顯示
    function syncRegexStyles() {
        const chatContainer = document.getElementById('chat');
        if (!chatContainer) return;

        // 抓取聊天室內所有被正則注入的 style
        const chatStyles = chatContainer.querySelectorAll('style');
        let combinedCSS = '/* Aurelia Auto-Captured Regex Styles */\n';

        chatStyles.forEach(style => {
            let cssText = style.innerHTML;
            // 移除酒館可能自動添加的範圍限制，讓 CSS 在 Extractor 的獨立 TAB 也能完全生效
            cssText = cssText.replace(/\.mes_text\s+/g, '');
            cssText = cssText.replace(/#chat\s+/g, '');
            combinedCSS += cssText + '\n';
        });

        // 注入到網頁頭部
        let globalStyleTag = document.getElementById('aurelia-regex-global-styles');
        if (!globalStyleTag) {
            globalStyleTag = document.createElement('style');
            globalStyleTag.id = 'aurelia-regex-global-styles';
            document.head.appendChild(globalStyleTag);
        }

        // 只有當 CSS 有變動時才更新，避免效能浪費
        if (globalStyleTag.innerHTML !== combinedCSS) {
            globalStyleTag.innerHTML = combinedCSS;
        }
    }

    // 2. 專屬數據提取器：抓取 Sys-Terminal 的數據給你的 VN 面板使用
    function extractSystemTerminalData() {
        // 尋找對話中所有的終端機面板 (注意酒館會自動加上 custom- 前綴)
        const terminals = document.querySelectorAll('.custom-sys-terminal-root');
        if (terminals.length === 0) return;

        // 取最新的一個面板
        const latestTerminal = terminals[terminals.length - 1];

        // 安全提取文字的工具函數
        const getText = (selector) => {
            const el = latestTerminal.querySelector(selector);
            return el ? el.innerText.trim() : '無數據';
        };

        // 封裝成乾淨的 JSON 數據
        const terminalData = {
            objective: getText('.custom-row-mission .custom-value'),
            timeLimit: getText('.custom-data-row:nth-child(2) .custom-value'),
            supplyDrop: getText('.custom-row-reward .custom-value'),
            penalty: getText('.custom-row-danger .custom-value'),
            tasksCompleted: getText('.custom-sub-data-item:nth-child(1) .custom-value'),
            taskPool: getText('.custom-sub-data-item:nth-child(2) .custom-value'),
            statusMouth: getText('.custom-status-item:nth-child(1) .custom-value'),
            statusBreasts: getText('.custom-status-item:nth-child(2) .custom-value'),
            statusSexOrgans: getText('.custom-status-item:nth-child(3) .custom-value'),
            statusAnus: getText('.custom-status-item:nth-child(4) .custom-value')
        };

        // 儲存到全局變數，讓你的 VN 面板或 os_api_engine 可以直接調用
        window.AURELIA_VN_DATA = window.AURELIA_VN_DATA || {};
        window.AURELIA_VN_DATA.latestTerminal = terminalData;
    }

    // 3. 設立自動監聽器
    const observer = new MutationObserver((mutations) => {
        let hasNewNodes = false;
        mutations.forEach(mut => {
            if (mut.addedNodes.length > 0) hasNewNodes = true;
        });

        if (hasNewNodes) {
            // 等待酒館 DOM 渲染完畢後執行
            setTimeout(() => {
                syncRegexStyles();
                extractSystemTerminalData();
            }, 300);
        }
    });

    function initObserver() {
        const chat = document.getElementById('chat');
        if (chat) {
            observer.observe(chat, { childList: true, subtree: true });
            syncRegexStyles(); // 啟動時先抓取一次
            extractSystemTerminalData();
        } else {
            // 如果聊天室還沒加載，1秒後重試
            setTimeout(initObserver, 1000);
        }
    }

    // 啟動監聽器
    initObserver();

    // 開放 API 給其他面板使用
    window.AureliaRegexBridge = {
        forceSyncCss: syncRegexStyles,
        getLatestTerminalData: () => window.AURELIA_VN_DATA?.latestTerminal || null
    };

})();