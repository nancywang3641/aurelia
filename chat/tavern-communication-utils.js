/**
 * 酒館AI通信工具函數
 * 統一處理與酒館AI的通信，支持本地和跨域兩種模式
 */

/**
 * 發送消息到酒館AI
 * @param {string} message - 要發送的消息
 * @param {Object} options - 選項
 * @returns {Promise<boolean>} 發送結果
 */
async function sendMessageToTavern(message, options = {}) {
    const { 
        timeout = 10000,
        retryCount = 3,
        showError = true 
    } = options;
    
    try {
        console.log('[酒館通信] 準備發送消息:', message.substring(0, 100) + '...');
        
        const tavernMainWindow = findTavernMainWindow();
        if (!tavernMainWindow) {
            throw new Error('找不到酒館AI主環境');
        }
        
        // 使用統一的發送方法
        const result = await tavernMainWindow.sendMessage(message);
        console.log('[酒館通信] ✅ 消息發送成功');
        return result;
        
    } catch (error) {
        console.error('[酒館通信] ❌ 消息發送失敗:', error);
        
        if (showError) {
            // 顯示錯誤提示
            if (typeof showErrorToast === 'function') {
                showErrorToast(`發送失敗: ${error.message}`);
            } else {
                alert(`發送失敗: ${error.message}`);
            }
        }
        
        throw error;
    }
}

/**
 * 檢查酒館AI連接狀態
 * @returns {Promise<Object>} 連接狀態
 */
async function checkTavernConnection() {
    try {
        const tavernMainWindow = findTavernMainWindow();
        if (!tavernMainWindow) {
            return { connected: false, error: '找不到酒館AI主環境' };
        }
        
        if (tavernMainWindow.type === 'cross-origin') {
            // 跨域模式：使用橋接器檢查狀態
            const status = await tavernMainWindow.comm.getTavernStatus();
            return { 
                connected: true, 
                type: 'cross-origin',
                status 
            };
        } else {
            // 本地模式：檢查DOM元素
            const textarea = tavernMainWindow.window.document.querySelector('#send_textarea');
            const sendButton = tavernMainWindow.window.document.querySelector('#send_but');
            return { 
                connected: !!(textarea && sendButton),
                type: 'local',
                hasTextarea: !!textarea,
                hasSendButton: !!sendButton
            };
        }
    } catch (error) {
        return { connected: false, error: error.message };
    }
}

/**
 * 等待酒館AI連接
 * @param {number} timeout - 超時時間（毫秒）
 * @returns {Promise<boolean>} 是否連接成功
 */
async function waitForTavernConnection(timeout = 30000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        const status = await checkTavernConnection();
        if (status.connected) {
            console.log('[酒館通信] ✅ 酒館AI連接成功');
            return true;
        }
        
        console.log('[酒館通信] 等待酒館AI連接...');
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error('等待酒館AI連接超時');
}

/**
 * 批量發送消息
 * @param {Array<string>} messages - 消息數組
 * @param {Object} options - 選項
 * @returns {Promise<Array>} 發送結果數組
 */
async function sendBatchMessages(messages, options = {}) {
    const { 
        delay = 1000, // 消息間隔
        stopOnError = false 
    } = options;
    
    const results = [];
    
    for (let i = 0; i < messages.length; i++) {
        try {
            const result = await sendMessageToTavern(messages[i], { showError: false });
            results.push({ success: true, message: messages[i], result });
            
            if (i < messages.length - 1) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        } catch (error) {
            results.push({ success: false, message: messages[i], error: error.message });
            
            if (stopOnError) {
                break;
            }
        }
    }
    
    return results;
}

/**
 * 創建消息發送器
 * @param {Object} options - 配置選項
 * @returns {Object} 消息發送器對象
 */
function createMessageSender(options = {}) {
    const {
        autoRetry = true,
        maxRetries = 3,
        retryDelay = 1000,
        showProgress = false
    } = options;
    
    return {
        /**
         * 發送單條消息
         */
        async send(message, messageOptions = {}) {
            let lastError;
            
            for (let attempt = 1; attempt <= (autoRetry ? maxRetries : 1); attempt++) {
                try {
                    if (showProgress && attempt > 1) {
                        console.log(`[酒館通信] 重試發送 (${attempt}/${maxRetries})...`);
                    }
                    
                    return await sendMessageToTavern(message, messageOptions);
                } catch (error) {
                    lastError = error;
                    
                    if (attempt < maxRetries) {
                        await new Promise(resolve => setTimeout(resolve, retryDelay));
                    }
                }
            }
            
            throw lastError;
        },
        
        /**
         * 發送多條消息
         */
        async sendBatch(messages, batchOptions = {}) {
            return await sendBatchMessages(messages, { ...options, ...batchOptions });
        },
        
        /**
         * 檢查連接狀態
         */
        async checkConnection() {
            return await checkTavernConnection();
        }
    };
}

// 導出函數
window.TavernCommunication = {
    sendMessage: sendMessageToTavern,
    checkConnection: checkTavernConnection,
    waitForConnection: waitForTavernConnection,
    sendBatch: sendBatchMessages,
    createSender: createMessageSender
};

// 創建默認發送器
window.tavernSender = createMessageSender({
    autoRetry: true,
    maxRetries: 3,
    retryDelay: 1000,
    showProgress: true
});
