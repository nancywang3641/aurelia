/**
 * 奧瑞亞主面板注入器 - 簡化版
 * 負責主面板的注入與基本管理
 */

(function() {
    console.log('[主面板] 簡化版注入器已啟動');
    
    // 配置項目
    const CONFIG = {
        IFRAME_SELECTOR: '.main-panel-iframe',
        PANEL_SRC: '/main_panel.html',
        DESIRED_HEIGHT: '800px'
    };

    // ===== 核心注入系統 =====
    
    /**
     * 設置佔位符觀察器
     */
    function setupPlaceholderObserver() {
        console.log('[主面板] 設置佔位符觀察器...');
        
        const targetNode = window.parent.document.getElementById('chat');
        const placeholderId = 'main-panel-placeholder';
        
        if (!targetNode) {
            console.warn('[主面板] 找不到聊天容器，2秒後重試');
            setTimeout(setupPlaceholderObserver, 2000);
            return;
        }

        const config = { childList: true, subtree: true };

        const callback = function(mutationsList, observer) {
            for(const mutation of mutationsList) {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(node => {
                        // 檢查新增的佔位符
                        if (node.nodeType === 1 && node.id === placeholderId) {
                            console.log('[主面板] 檢測到佔位符，開始替換');
                            replacePlaceholderWithIframe(node);
                            return;
                        }
                        // 檢查節點內部的佔位符
                        if (node.nodeType === 1 && node.querySelector) {
                            const placeholder = node.querySelector(`#${placeholderId}`);
                            if (placeholder) {
                                console.log('[主面板] 檢測到內部佔位符，開始替換');
                                replacePlaceholderWithIframe(placeholder);
                                return;
                            }
                        }
                    });
                }
            }
        };

        const observer = new MutationObserver(callback);
        observer.observe(targetNode, config);

        // 檢查已存在的佔位符
        const existingPlaceholder = targetNode.querySelector(`#${placeholderId}`);
        if (existingPlaceholder) {
            console.log('[主面板] 發現已存在的佔位符');
            replacePlaceholderWithIframe(existingPlaceholder);
        }

        console.log('[主面板] 佔位符觀察器已啟動');
    }

    /**
     * 替換佔位符為iframe
     */
    function replacePlaceholderWithIframe(placeholderElement) {
        if (!placeholderElement || placeholderElement.querySelector(`iframe${CONFIG.IFRAME_SELECTOR}`)) {
            console.log('[主面板] 佔位符無效或已包含iframe，跳過');
            return;
        }

        console.log('[主面板] 開始替換佔位符為iframe');
        
        // 清空並設置佔位符樣式
        placeholderElement.innerHTML = '';
        Object.assign(placeholderElement.style, {
            border: 'none',
            background: 'transparent',
            display: 'block',
            height: CONFIG.DESIRED_HEIGHT,
            minHeight: 'auto',
            padding: '0',
            overflow: 'hidden',
            borderRadius: '15px'
        });

        // 創建iframe
        const iframe = document.createElement('iframe');
        Object.assign(iframe, {
            src: CONFIG.PANEL_SRC,
            title: '奧瑞亞主面板'
        });
        
        Object.assign(iframe.style, {
            width: '100%',
            height: '100%',
            border: 'none',
            display: 'block',
            borderRadius: '15px'
        });
        
        iframe.classList.add(CONFIG.IFRAME_SELECTOR.substring(1)); // 移除點號

        // 設置載入完成回調
        iframe.onload = function() {
            console.log('[主面板] iframe載入完成');
            
            // 發送初始化消息
            try {
                iframe.contentWindow.postMessage({
                    type: 'MAIN_PANEL_READY',
                    timestamp: Date.now()
                }, '*');
                console.log('[主面板] 初始化消息已發送');
            } catch (error) {
                console.warn('[主面板] 發送初始化消息失敗:', error);
            }
        };

        // 添加iframe到佔位符
        try {
            placeholderElement.appendChild(iframe);
            console.log('[主面板] iframe替換成功');
        } catch (error) {
            console.error('[主面板] iframe替換失敗:', error);
        }
    }

    /**
     * 手動插入主面板佔位符
     */
    function insertMainPanelPlaceholder(targetElement = null) {
        const chatContainer = window.parent.document.getElementById('chat');
        if (!chatContainer) {
            console.error('[主面板] 找不到聊天容器');
            return;
        }

        // 檢查是否已存在佔位符
        if (chatContainer.querySelector('#main-panel-placeholder')) {
            console.log('[主面板] 主面板已存在');
            return;
        }

        console.log('[主面板] 創建主面板佔位符');
        
        const placeholder = document.createElement('div');
        placeholder.id = 'main-panel-placeholder';
        
        // 設置佔位符樣式
        Object.assign(placeholder.style, {
            width: '100%',
            height: '70vh',
            minHeight: '600px',
            border: '2px dashed #ff6b9d',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ff6b9d',
            fontFamily: "'Microsoft YaHei', sans-serif",
            background: 'linear-gradient(135deg, rgba(26, 26, 46, 0.8), rgba(22, 33, 62, 0.8))',
            borderRadius: '15px',
            backdropFilter: 'blur(5px)',
            margin: '10px 0'
        });

        // 設置載入動畫內容
        placeholder.innerHTML = `
            <div style="text-align:center">
                <div style="font-size: 48px; margin-bottom: 20px; animation: mainPanelPulse 2s infinite;">🏰</div>
                <div style="font-size: 22px; margin-bottom: 15px; font-weight: bold; text-shadow: 0 0 10px rgba(255, 107, 157, 0.5);">奧瑞亞主面板載入中...</div>
                <div style="font-size: 16px; opacity: 0.8; margin-bottom: 10px;">正在初始化主面板系統</div>
                <div style="font-size: 14px; opacity: 0.6;">請稍候，即將進入奧瑞亞世界</div>
                <div style="margin-top: 20px;">
                    <div style="width: 200px; height: 4px; background: rgba(255, 107, 157, 0.2); border-radius: 2px; margin: 0 auto; overflow: hidden;">
                        <div style="width: 100%; height: 100%; background: linear-gradient(90deg, #ff6b9d, #e55982); border-radius: 2px; animation: mainPanelLoading 2s infinite;"></div>
                    </div>
                </div>
            </div>
            
            <style>
                @keyframes mainPanelPulse {
                    0%, 100% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.1); opacity: 0.8; }
                }
                
                @keyframes mainPanelLoading {
                    0% { transform: translateX(-100%); }
                    50% { transform: translateX(0%); }
                    100% { transform: translateX(100%); }
                }
            </style>
        `;

        // 插入佔位符
        if (targetElement && targetElement.parentNode) {
            targetElement.parentNode.insertBefore(placeholder, targetElement.nextSibling);
        } else {
            chatContainer.appendChild(placeholder);
        }

        console.log('[主面板] 佔位符已插入');
    }

    // ===== 手動控制按鈕 =====

    function setupManualControls() {
        if (typeof eventOnButton === 'function') {
            
            // 顯示主面板
            eventOnButton('顯示主面板', function() {
                console.log('[主面板] 手動觸發主面板顯示');
                insertMainPanelPlaceholder();
            });

            // 奧瑞亞主面板
            eventOnButton('奧瑞亞主面板', function() {
                console.log('[主面板] 奧瑞亞主面板按鈕觸發');
                insertMainPanelPlaceholder();
            });

            // 刷新主面板
            eventOnButton('刷新主面板', function() {
                console.log('[主面板] 刷新主面板');
                const existingIframe = window.parent.document.querySelector(CONFIG.IFRAME_SELECTOR);
                if (existingIframe) {
                    existingIframe.src = existingIframe.src; // 重新載入
                } else {
                    insertMainPanelPlaceholder();
                }
            });

            console.log('[主面板] 手動控制按鈕已設置');
        }
    }

    // ===== 消息監聽 =====

    function setupMessageListener() {
        window.addEventListener('message', function(event) {
            if (!event.data || !event.data.type) return;

            switch(event.data.type) {
                case 'MAIN_PANEL_READY':
                    console.log('[主面板] 收到面板準備就緒消息');
                    break;
                    
                case 'SHOW_MAIN_PANEL':
                    console.log('[主面板] 收到顯示面板請求');
                    insertMainPanelPlaceholder();
                    break;
                    
                case 'START_VN_STORY':
                    console.log('[主面板] 轉發VN劇情請求:', event.data.data);
                    // 轉發到VN面板
                    try {
                        const vnIframe = window.parent.document.querySelector('.vn-panel-iframe');
                        if (vnIframe && vnIframe.contentWindow) {
                            vnIframe.contentWindow.postMessage({
                                type: 'START_STORY_FROM_MAIN',
                                data: event.data.data
                            }, '*');
                        }
                    } catch (error) {
                        console.error('[主面板] 轉發VN劇情失敗:', error);
                    }
                    break;
                    
                case 'MAIN_PANEL_COMMAND':
                    console.log('[主面板] 收到主面板命令:', event.data.command);
                    break;
            }
        });

        console.log('[主面板] 消息監聽器已設置');
    }

    // ===== 初始化 =====

    function init() {
        console.log('[主面板] 開始初始化簡化版注入器...');
        
        setupPlaceholderObserver();
        setupManualControls();
        setupMessageListener();
        
        console.log('[主面板] 簡化版初始化完成');
    }

    // ===== 全域API =====

    window.MainPanelInjector = {
        // 手動控制
        insertMainPanel: insertMainPanelPlaceholder,
        showMainPanel: insertMainPanelPlaceholder,
        
        // 配置
        getConfig: () => ({ ...CONFIG }),
        
        // 狀態檢查
        isMainPanelVisible: () => {
            return !!window.parent.document.querySelector('#main-panel-placeholder');
        },
        
        // 工具方法
        refreshMainPanel: () => {
            const existingIframe = window.parent.document.querySelector(CONFIG.IFRAME_SELECTOR);
            if (existingIframe) {
                existingIframe.src = existingIframe.src;
            }
        }
    };

    // 啟動初始化
    $(document).ready(function() {
        console.log('[主面板] Document ready，開始初始化');
        init();
    });

})();