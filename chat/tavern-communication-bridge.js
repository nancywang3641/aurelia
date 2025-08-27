/**
 * 酒館AI通信橋接器
 * 用於接收來自GitHub Pages面板的postMessage消息
 * 此腳本需要在酒館AI中注入或作為酒館助手腳本使用
 */

(function() {
    'use strict';
    
    console.log('[酒館AI橋接器] 初始化通信橋接器...');
    
    // 允許的來源域名
    const ALLOWED_ORIGINS = [
        'https://nancywang3641.github.io',
        'http://127.0.0.1:8000',
        'http://localhost:8000',
        'http://localhost:3000'
    ];
    
    // 通信狀態
    let isConnected = false;
    let lastHeartbeat = Date.now();
    
    /**
     * 驗證消息來源
     */
    function isValidOrigin(origin) {
        return ALLOWED_ORIGINS.includes(origin);
    }
    
    /**
     * 發送消息到酒館AI界面
     */
    function sendMessageToTavern(message) {
        try {
            const textarea = document.querySelector('#send_textarea');
            const sendButton = document.querySelector('#send_but');
            
            if (!textarea || !sendButton) {
                throw new Error('找不到酒館AI發送界面元素');
            }
            
            // 設置消息內容
            textarea.value = message;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            
            // 發送消息
            setTimeout(() => {
                sendButton.click();
                console.log('[酒館AI橋接器] 消息已發送到酒館AI:', message.substring(0, 100) + '...');
            }, 100);
            
            return true;
        } catch (error) {
            console.error('[酒館AI橋接器] 發送消息失敗:', error);
            return false;
        }
    }
    
    /**
     * 獲取酒館AI狀態
     */
    function getTavernStatus() {
        try {
            const textarea = document.querySelector('#send_textarea');
            const sendButton = document.querySelector('#send_but');
            const isConnected = !!(textarea && sendButton);
            
            return {
                isConnected,
                hasTextarea: !!textarea,
                hasSendButton: !!sendButton,
                currentValue: textarea ? textarea.value : '',
                timestamp: Date.now()
            };
        } catch (error) {
            return {
                isConnected: false,
                error: error.message,
                timestamp: Date.now()
            };
        }
    }
    
    /**
     * 處理接收到的消息
     */
    function handleMessage(event) {
        // 驗證來源
        if (!isValidOrigin(event.origin)) {
            console.warn('[酒館AI橋接器] 拒絕來自未授權來源的消息:', event.origin);
            return;
        }
        
        try {
            const { type, data, id, timestamp } = event.data;
            
            console.log('[酒館AI橋接器] 收到消息:', { type, id, timestamp });
            
            let response = { success: false, error: '未知消息類型' };
            
            switch (type) {
                case 'SEND_MESSAGE':
                    const success = sendMessageToTavern(data.message);
                    response = {
                        success,
                        message: success ? '消息發送成功' : '消息發送失敗',
                        id,
                        timestamp: Date.now()
                    };
                    break;
                    
                case 'GET_STATUS':
                    response = {
                        success: true,
                        data: getTavernStatus(),
                        id,
                        timestamp: Date.now()
                    };
                    break;
                    
                case 'HEARTBEAT':
                    lastHeartbeat = Date.now();
                    response = {
                        success: true,
                        data: { isConnected: true, lastHeartbeat },
                        id,
                        timestamp: Date.now()
                    };
                    break;
                    
                case 'TEST_CONNECTION':
                    response = {
                        success: true,
                        data: { 
                            isConnected: true,
                            tavernStatus: getTavernStatus(),
                            bridgeVersion: '1.0.0'
                        },
                        id,
                        timestamp: Date.now()
                    };
                    break;
                    
                default:
                    response = {
                        success: false,
                        error: `不支持的消息類型: ${type}`,
                        id,
                        timestamp: Date.now()
                    };
            }
            
            // 發送回覆
            event.source.postMessage(response, event.origin);
            
        } catch (error) {
            console.error('[酒館AI橋接器] 處理消息時出錯:', error);
            
            // 發送錯誤回覆
            event.source.postMessage({
                success: false,
                error: error.message,
                id: event.data?.id,
                timestamp: Date.now()
            }, event.origin);
        }
    }
    
    /**
     * 初始化橋接器
     */
    function initBridge() {
        // 添加消息監聽器
        window.addEventListener('message', handleMessage);
        
        // 定期檢查連接狀態
        setInterval(() => {
            const now = Date.now();
            if (now - lastHeartbeat > 30000) { // 30秒無心跳
                isConnected = false;
            }
        }, 10000);
        
        console.log('[酒館AI橋接器] ✅ 通信橋接器已啟動');
        console.log('[酒館AI橋接器] 支持的來源:', ALLOWED_ORIGINS);
        
        // 廣播橋接器就緒消息
        window.postMessage({
            type: 'BRIDGE_READY',
            data: {
                version: '1.0.0',
                timestamp: Date.now(),
                allowedOrigins: ALLOWED_ORIGINS
            }
        }, '*');
    }
    
    // 等待DOM加載完成後初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBridge);
    } else {
        initBridge();
    }
    
    // 導出全局函數供調試使用
    window.TavernBridge = {
        sendMessage: sendMessageToTavern,
        getStatus: getTavernStatus,
        testConnection: () => getTavernStatus()
    };
    
})();
