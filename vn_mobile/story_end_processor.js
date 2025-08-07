/**
 * STORY_END 劇情偵測器
 * 
 * 安裝位置：酒館AI腳本庫（與 mapver_mobile_vn`_processor.js 同級）
 * 
 * 功能：
 * 1. 偵測AI輸出中的章節開始標記
 * 2. 偵測AI輸出中的 [STORY_END] 標記  
 * 3. 記錄劇情ID範圍
 * 4. 發送消息給Core執行隱藏指令
 */

(function() {
    'use strict';
    
    // ===== 配置選項 =====
    const CONFIG = {
        DEBUG: true,                    // 調試模式
        STORY_START_MARKERS: [          // 劇情開始標記（優先級由高到低）
            /《第.*?章.*?[:：].*?》/,      // 《第一章:標題》格式
            /【第.*?章.*?[:：].*?】/,      // 【第一章:標題】格式  
            /第.*?章.*?[:：]/,           // 第一章:標題 格式
            /<gametext>/i               // 備用：VN標籤（兼容性）
        ],
        STORY_END_MARKER: '[STORY_END]', // 劇情結束標記
        MESSAGE_DELAY: 1000             // 發送消息延遲
    };
    
    // ===== 全局狀態 =====
    let storyState = {
        inProgress: false,      // 劇情進行中
        startId: null,          // 劇情開始ID
        lastProcessedId: null   // 最後處理的ID
    };
    
    /**
     * 日誌輸出函數
     */
    function log(message, type = 'info') {
        if (!CONFIG.DEBUG) return;
        const prefix = '[劇情偵測器]';
        const timestamp = new Date().toLocaleTimeString();
        
        switch(type) {
            case 'error':
                console.error(`${prefix} [${timestamp}] ❌`, message);
                break;
            case 'warn':
                console.warn(`${prefix} [${timestamp}] ⚠️`, message);
                break;
            case 'success':
                console.log(`${prefix} [${timestamp}] ✅`, message);
                break;
            default:
                console.log(`${prefix} [${timestamp}] ℹ️`, message);
        }
    }
    
    /**
     * 檢測劇情開始
     */
    function detectStoryStart(content, messageId) {
        if (storyState.inProgress) return false; // 已有劇情進行中
        
        // 按優先級檢查開始標記
        for (const marker of CONFIG.STORY_START_MARKERS) {
            let hasMarker = false;
            
            if (marker instanceof RegExp) {
                hasMarker = marker.test(content);
            } else {
                hasMarker = content.includes(marker);
            }
            
            if (hasMarker) {
                storyState.inProgress = true;
                storyState.startId = messageId;
                
                // 提取章節信息
                let chapterInfo = '';
                if (marker instanceof RegExp && marker.source.includes('章')) {
                    const match = content.match(marker);
                    if (match) {
                        chapterInfo = ` - ${match[0]}`;
                    }
                }
                
                log(`劇情開始偵測到${chapterInfo} - 起始ID: ${storyState.startId}`, 'success');
                
                // 通知Core劇情開始
                sendMessageToCore('STORY_START_DETECTED', {
                    startId: messageId,
                    chapterInfo: chapterInfo.replace(' - ', ''),
                    content: content
                });
                
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * 檢測劇情結束
     */
    function detectStoryEnd(content, messageId) {
        if (!content.includes(CONFIG.STORY_END_MARKER)) return false;
        
        if (!storyState.inProgress || !storyState.startId) {
            log('偵測到 STORY_END 但無有效的劇情起始ID', 'warn');
            return false;
        }
        
        const storyEndId = messageId;
        log(`劇情結束偵測到 - 結束ID: ${storyEndId}, 範圍: ${storyState.startId}-${storyEndId}`, 'success');
        
        // 延遲發送消息給Core（確保消息完全載入）
        setTimeout(() => {
            sendMessageToCore('STORY_END_DETECTED', {
                startId: storyState.startId,
                endId: storyEndId,
                range: `${storyState.startId}-${storyEndId}`,
                content: content
            });
            
            // 重置狀態
            resetStoryState();
        }, CONFIG.MESSAGE_DELAY);
        
        return true;
    }
    
    /**
     * 發送消息給Core
     */
    function sendMessageToCore(messageType, data) {
        try {
            // 方法1: 通過window.postMessage發送給所有iframe
            const message = {
                type: messageType,
                data: data,
                source: 'STORY_END_DETECTOR',
                timestamp: Date.now()
            };
            
            // 發送給所有iframe
            const iframes = document.querySelectorAll('iframe');
            iframes.forEach(iframe => {
                try {
                    if (iframe.contentWindow) {
                        iframe.contentWindow.postMessage(message, '*');
                    }
                } catch (error) {
                    // 跨域問題，忽略
                }
            });
            
            // 發送給window自身（如果Core在同一環境）
            window.postMessage(message, '*');
            
            log(`已發送消息給Core: ${messageType}`, 'info');
            
        } catch (error) {
            log(`發送消息給Core失敗: ${error.message}`, 'error');
        }
    }
    
    /**
     * 重置劇情狀態
     */
    function resetStoryState() {
        storyState.inProgress = false;
        storyState.startId = null;
        log('劇情狀態已重置', 'info');
    }
    
    /**
     * 處理新消息
     */
    async function processMessage(messageContent, messageId) {
        try {
            if (!messageContent || !messageId) return;
            
            // 避免重複處理同一消息
            if (messageId === storyState.lastProcessedId) return;
            storyState.lastProcessedId = messageId;
            
            // 檢測劇情開始
            detectStoryStart(messageContent, messageId);
            
            // 檢測劇情結束
            detectStoryEnd(messageContent, messageId);
            
        } catch (error) {
            log(`處理消息時出錯: ${error.message}`, 'error');
        }
    }
    
    /**
     * 設置消息監聽器
     */
    function setupMessageListener() {
        // 監聽DOM變化
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach(async (node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // 尋找新添加的消息
                        const messageElements = node.querySelectorAll ? 
                            node.querySelectorAll('.mes, .message, .chat-message') : 
                            (node.classList && (node.classList.contains('mes') || node.classList.contains('message')) ? [node] : []);
                        
                        for (const messageElement of messageElements) {
                            const content = messageElement.textContent || messageElement.innerHTML;
                            
                            // 嘗試獲取消息ID
                            let messageId = null;
                            try {
                                messageId = await getCurrentMessageId();
                            } catch (error) {
                                // 如果無法獲取當前ID，使用時間戳作為替代
                                messageId = Date.now();
                            }
                            
                            if (content && messageId) {
                                await processMessage(content, messageId);
                            }
                        }
                    }
                });
            });
        });
        
        // 開始觀察聊天容器
        const chatContainer = document.querySelector('#chat') || 
                             document.querySelector('.chat-container') || 
                             document.querySelector('#chat_container') ||
                             document.body;
                             
        observer.observe(chatContainer, {
            childList: true,
            subtree: true
        });
        
        log('消息監聽器已啟動', 'success');
    }
    
    /**
     * 監聽來自Core的消息
     */
    function setupCoreMessageListener() {
        window.addEventListener('message', (event) => {
            if (!event.data || !event.data.type) return;
            
            switch(event.data.type) {
                case 'STORY_STATE_REQUEST':
                    // Core請求當前劇情狀態
                    sendMessageToCore('STORY_STATE_RESPONSE', {
                        ...storyState
                    });
                    break;
                    
                case 'STORY_RESET_REQUEST':
                    // Core請求重置劇情狀態
                    resetStoryState();
                    sendMessageToCore('STORY_RESET_RESPONSE', {
                        success: true
                    });
                    break;
            }
        });
        
        log('Core消息監聽器已設置', 'info');
    }
    
    /**
     * 添加按鈕功能支持
     */
    function setupButtonSupport() {
        if (typeof eventOnButton === 'function') {
            // 手動觸發劇情結束
            eventOnButton('手動結束當前劇情', async () => {
                if (!storyState.inProgress || !storyState.startId) {
                    alert('當前沒有進行中的劇情');
                    return;
                }
                
                try {
                    const currentId = await getCurrentMessageId();
                    sendMessageToCore('STORY_END_DETECTED', {
                        startId: storyState.startId,
                        endId: currentId,
                        range: `${storyState.startId}-${currentId}`,
                        manual: true
                    });
                    resetStoryState();
                } catch (error) {
                    log(`手動結束劇情失敗: ${error.message}`, 'error');
                }
            });
            
            // 重置狀態按鈕
            eventOnButton('重置劇情偵測狀態', () => {
                resetStoryState();
                alert('劇情偵測狀態已重置');
            });
            
            // 狀態查詢按鈕
            eventOnButton('查看劇情偵測狀態', () => {
                const status = storyState.inProgress ? 
                    `劇情進行中\n起始ID: ${storyState.startId}` : 
                    '當前無劇情進行中';
                
                alert(`劇情偵測狀態：\n${status}`);
            });
            
            log('按鈕功能已綁定', 'info');
        }
    }
    
    /**
     * 初始化系統
     */
    function init() {
        log('STORY_END 劇情偵測器啟動中...', 'info');
        
        // 重置狀態
        resetStoryState();
        
        // 設置消息監聽器
        setupMessageListener();
        
        // 設置Core消息監聽器
        setupCoreMessageListener();
        
        // 設置按鈕支持
        setupButtonSupport();
        
        log('STORY_END 劇情偵測器已完全啟動', 'success');
        log('等待Core連接...', 'info');
    }
    
    /**
     * 暴露API到全局（用於調試和Core調用）
     */
    window.StoryEndDetector = {
        // 狀態查詢
        getStatus: () => ({ ...storyState }),
        
        // 手動控制
        resetState: resetStoryState,
        
        // 手動處理消息（用於測試）
        processMessage: processMessage,
        
        // 發送測試消息
        sendTestMessage: (type, data) => sendMessageToCore(type, data),
        
        // 配置
        config: CONFIG
    };
    
    // 自動初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // 延遲初始化，確保其他腳本載入完成
        setTimeout(init, 1000);
    }
    
})();