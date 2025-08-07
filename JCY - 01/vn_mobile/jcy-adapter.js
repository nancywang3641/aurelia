/**
 * JCY適配器模塊
 * 統一處理VN面板與JCY_AI_小手機.html系統的通信
 */

const JCYAdapter = {
    // 檢測是否在JCY系統中運行 - 改為使用postMessage檢測
    isJCYSystem() {
        try {
            // 檢查是否有父窗口
            if (!window.parent || window.parent === window) {
                return false;
            }
            
            // 嘗試發送檢測消息
            const messageData = {
                type: 'JCY_SYSTEM_DETECT',
                timestamp: Date.now()
            };
            
            window.parent.postMessage(messageData, '*');
            
            // 設置一個標記，表示我們已經嘗試檢測
            this._detectionAttempted = true;
            
            // 默認返回true，因為我們在iframe中
            return true;
        } catch (error) {
            console.warn('[JCY適配器] 無法檢查JCY系統狀態:', error);
            return false;
        }
    },

    // 獲取JCY系統的聊天輸入元素 - 改為通過postMessage請求
    getChatInput() {
        if (this.isJCYSystem()) {
            try {
                // 通過postMessage請求聊天輸入元素信息
                const messageData = {
                    type: 'JCY_GET_CHAT_INPUT',
                    timestamp: Date.now()
                };
                
                window.parent.postMessage(messageData, '*');
                return null; // 異步獲取，返回null
            } catch (error) {
                console.warn('[JCY適配器] 無法獲取聊天輸入元素:', error);
                return null;
            }
        }
        return null;
    },

    // 獲取JCY系統的發送按鈕 - 改為通過postMessage請求
    getSendButton() {
        if (this.isJCYSystem()) {
            try {
                // 通過postMessage請求發送按鈕信息
                const messageData = {
                    type: 'JCY_GET_SEND_BUTTON',
                    timestamp: Date.now()
                };
                
                window.parent.postMessage(messageData, '*');
                return null; // 異步獲取，返回null
            } catch (error) {
                console.warn('[JCY適配器] 無法獲取發送按鈕:', error);
                return null;
            }
        }
        return null;
    },

    // 發送消息到JCY聊天系統 - 改為通過postMessage
    sendMessageToJCY(message) {
        if (!this.isJCYSystem()) {
            console.warn('[JCY適配器] 不在JCY系統中，無法發送消息');
            return false;
        }

        try {
            const messageData = {
                type: 'JCY_SEND_MESSAGE',
                data: {
                    message: message
                },
                timestamp: Date.now()
            };
            
            window.parent.postMessage(messageData, '*');
            console.log('[JCY適配器] 消息已發送到JCY系統:', message);
            return true;
        } catch (error) {
            console.error('[JCY適配器] 發送消息時出錯:', error);
            return false;
        }
    },

    // 通過postMessage與JCY系統通信
    sendMessageToJCYViaPostMessage(messageData) {
        if (window.parent && window.parent !== window) {
            try {
                window.parent.postMessage(messageData, '*');
                console.log('[JCY適配器] postMessage已發送:', messageData);
                return true;
            } catch (error) {
                console.error('[JCY適配器] postMessage發送失敗:', error);
                return false;
            }
        }
        return false;
    },

    // 發送AI請求到JCY系統（替代trigger命令）
    sendAIRequest(message, source = 'VN_PANEL') {
        if (!this.isJCYSystem()) {
            console.warn('[JCY適配器] 不在JCY系統中，無法發送AI請求');
            return false;
        }

        try {
            const messageData = {
                type: 'JCY_AI_REQUEST',
                data: {
                    message: message,
                    source: source
                },
                timestamp: Date.now()
            };
            
            return this.sendMessageToJCYViaPostMessage(messageData);
        } catch (error) {
            console.error('[JCY適配器] 發送AI請求時出錯:', error);
            return false;
        }
    },

    // 兼容舊版本的triggerJCYAI函數
    triggerJCYAI(command) {
        console.warn('[JCY適配器] triggerJCYAI已棄用，請使用sendAIRequest');
        return this.sendAIRequest(command, 'VN_PANEL_LEGACY');
    },

    // 獲取JCY系統的資源（角色圖片等）
    getJCYResource(resourceType, ...params) {
        if (!this.isJCYSystem()) {
            return null;
        }

        try {
            // 通過postMessage請求資源
            const messageData = {
                type: 'JCY_GET_RESOURCE',
                resourceType: resourceType,
                params: params,
                timestamp: Date.now()
            };
            
            this.sendMessageToJCYViaPostMessage(messageData);
            return null; // 異步獲取，返回null
        } catch (error) {
            console.error('[JCY適配器] 獲取資源時出錯:', error);
            return null;
        }
    },

    // 設置JCY系統的資源
    setJCYResource(resourceType, data) {
        if (!this.isJCYSystem()) {
            return false;
        }

        try {
            const messageData = {
                type: 'JCY_SET_RESOURCE',
                resourceType: resourceType,
                data: data,
                timestamp: Date.now()
            };
            
            return this.sendMessageToJCYViaPostMessage(messageData);
        } catch (error) {
            console.error('[JCY適配器] 設置資源時出錯:', error);
            return false;
        }
    },

    // 監聽JCY系統的消息
    setupJCYMessageListener(callback) {
        if (typeof callback !== 'function') {
            console.error('[JCY適配器] 回調函數無效');
            return;
        }

        window.addEventListener('message', (event) => {
            // 檢查消息是否來自JCY系統（移除跨域檢查）
            if (event.data && event.data.type) {
                console.log('[JCY適配器] 收到JCY系統消息:', event.data);
                callback(event.data);
            }
        });
    },

    // 初始化JCY適配器
    init() {
        console.log('[JCY適配器] 初始化中...');
        
        // 設置消息監聽器
        this.setupJCYMessageListener((data) => {
            console.log('[JCY適配器] 處理JCY系統消息:', data);
            // 這裡可以添加具體的消息處理邏輯
        });
        
        // 延遲檢測JCY系統狀態，避免初始化時的跨域錯誤
        setTimeout(() => {
            console.log('[JCY適配器] 是否在JCY系統中:', this.isJCYSystem());
        }, 100);
        
        console.log('[JCY適配器] 初始化完成');
    }
};

// 自動初始化
if (typeof window !== 'undefined') {
    window.JCYAdapter = JCYAdapter;
    JCYAdapter.init();
} 