// =======================================================================
//                          核心初始化與事件處理
// =======================================================================

// 🔥 修改：延遲初始化，只在iframe真正顯示時才初始化
let isInitialized = false;
let initTimeout = null;

// 檢測iframe是否真正顯示
function checkIframeVisibility() {
    try {
        // 檢查iframe是否在視窗中可見
        const rect = document.body.getBoundingClientRect();
        const isVisible = rect.width > 0 && rect.height > 0;
        
        // 檢查父窗口是否為當前活動窗口
        const isParentActive = !window.parent.document.hidden;
        
        return isVisible && isParentActive;
    } catch (error) {
        // 如果無法檢測，默認認為可見
        return true;
    }
}

// 延遲初始化函數
function delayedInit() {
    if (isInitialized) return;
    
    if (checkIframeVisibility()) {
        isInitialized = true;
        if (initTimeout) {
            clearTimeout(initTimeout);
            initTimeout = null;
        }
        init();
    } else {
        // 如果還不可見，延遲檢查
        initTimeout = setTimeout(delayedInit, 1000);
    }
}

// 監聽iframe顯示事件
function setupVisibilityListener() {
    // 監聽父窗口的message事件，當iframe被顯示時觸發
    window.addEventListener('message', function(event) {
        if (event.data?.type === 'IFRAME_SHOWN' && event.data?.target === 'chat') {
            if (!isInitialized) {
                delayedInit();
            }
        }
    });
    
    // 監聽可見性變化
    document.addEventListener('visibilitychange', function() {
        if (!document.hidden && !isInitialized) {
            delayedInit();
        }
    });
    
    // 監聽窗口焦點
    window.addEventListener('focus', function() {
        if (!isInitialized) {
            delayedInit();
        }
    });
    
    // 初始檢查
    setTimeout(delayedInit, 100);
}

// 腳本入口點 - 只設置監聽器，不立即初始化
document.addEventListener('DOMContentLoaded', setupVisibilityListener);

// =======================================================================
//                    🔥 优化的内存和错误管理器
// =======================================================================

/**
 * 内存管理器 - 监控和优化内存使用
 */
const MemoryManager = {
    intervals: new Set(),
    timeouts: new Set(),
    eventListeners: new Map(),
    
    registerInterval(id) {
        this.intervals.add(id);
    },
    
    registerTimeout(id) {
        this.timeouts.add(id);
    },
    
    registerEventListener(element, event, handler) {
        const key = `${element.constructor.name}_${event}`;
        if (this.eventListeners.has(key)) {
            const old = this.eventListeners.get(key);
            element.removeEventListener(event, old);
        }
        this.eventListeners.set(key, handler);
        element.addEventListener(event, handler);
    },
    
    cleanup() {
        this.intervals.forEach(id => clearInterval(id));
        this.timeouts.forEach(id => clearTimeout(id));
        this.intervals.clear();
        this.timeouts.clear();
        
        this.eventListeners.forEach((handler, key) => {
            // 事件清理在页面卸载时自动处理
        });
        this.eventListeners.clear();
        
        if (window.advancedRenderer) {
            advancedRenderer.cleanup();
        }
        
        if (window.TavernAPI) {
            TavernAPI.clearCache();
        }
        
        if (CONFIG.DEBUG_MODE) console.log('[内存管理器] 资源清理完成');
    },
    
    getMemoryUsage() {
        if (performance.memory) {
            return {
                used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
                total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
                limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
            };
        }
        return null;
    }
};

/**
 * 错误处理器 - 统一错误处理和恢复
 */
const ErrorHandler = {
    errorCount: 0,
    maxErrors: 10,
    
    handle(error, context = '未知') {
        this.errorCount++;
        console.error(`[错误处理器] ${context}:`, error);
        
        if (this.errorCount < this.maxErrors) {
            this.attemptRecovery(context);
        } else {
            this.handleCriticalError();
        }
    },
    
    attemptRecovery(context) {
        switch (context) {
            case 'API调用':
                if (window.TavernAPI) TavernAPI.clearCache();
                break;
            case '消息渲染':
                if (window.advancedRenderer) advancedRenderer.clearCache();
                break;
            case '事件处理':
                setTimeout(() => setupEventListeners(), 1000);
                break;
        }
    },
    
    handleCriticalError() {
        console.error('[错误处理器] 达到错误上限，执行重置');
        showErrorToast('聊天面板遇到严重错误，正在重置...');
        setTimeout(() => location.reload(), 2000);
    },
    
    reset() {
        this.errorCount = 0;
    }
};

/**
 * 🔥 优化版初始化函数 - 基于官方 API 的增强版
 */
async function init() {
    try {
        if (CONFIG.DEBUG_MODE) console.log('[聊天面板] 🚀 开始优化初始化 (基于官方API)');
    
        // 重置错误计数
        ErrorHandler.reset();
        
        // 发送面板重载信号
        notifyPanelReloaded();
        
        // 🔥 新增：發送面板加載完成事件
        notifyPanelLoaded();
    
        // 🔥 修正：不依賴 localStorage 中的舊值，使用動態用戶名
        // const savedName = localStorage.getItem('chat_protagonist_name');
        // if (savedName) {
        //     protagonistName = savedName;
        // }
        // 讓 protagonistName 保持為 '{{user}}'，由具體的聊天設置決定
        
        // 🆕 更新聊天輸入框的顯示
        updateChatInputPlaceholder();
        
        // 设置事件监听器（防重复）
        if (!eventListenersAdded) {
            setupEventListeners();
            eventListenersAdded = true;
        }
    
        // 🔥 修正：檢查是否需要從localStorage載入數據
        // 如果收到重置信號，則跳過localStorage載入
        if (!window.skipLocalStorageLoad) {
            await loadSavedChatDataFromStorage();
        } else {
            window.skipLocalStorageLoad = false; // 重置標記
            if (CONFIG.DEBUG_MODE) console.log('[聊天面板] 跳過localStorage載入，等待處理器重新掃描');
        }
        
        // 🆕 初始化預設聊天室（在請求數據之前）
        await PresetChatManager.initializePresetChats();
        
        // 🆕 確保預設聊天室已載入到UI
        updateChatListView();
    
        // 请求当前数据
        requestDataFromProcessor();
    
        // 设置定期检查
        setupEventButtonHealthCheck();
        
        // 定期内存清理
        const cleanupInterval = setInterval(() => {
            try {
                if (window.advancedRenderer) advancedRenderer.clearCache();
                if (window.TavernAPI) TavernAPI.clearCache();
                
                const memory = MemoryManager.getMemoryUsage();
                if (memory && memory.used > 100 && window.gc) {
                    window.gc();
                }
            } catch (error) {
                ErrorHandler.handle(error, '内存清理');
            }
        }, 60000);
        
        MemoryManager.registerInterval(cleanupInterval);
        
        // 页面卸载时清理资源
        MemoryManager.registerEventListener(window, 'beforeunload', function() {
            MemoryManager.cleanup();
        });
        
        Logger.success('优化初始化完成');
        
    } catch (error) {
        ErrorHandler.handle(error, '初始化');
    }
}

/**
 * 🔥 新增：從localStorage載入已保存的聊天室數據
 */
async function loadSavedChatDataFromStorage() {
    try {
        if (CONFIG.DEBUG_MODE) console.log('[聊天面板] 開始從localStorage載入已保存的聊天室數據...');
        
        // 1. 載入聊天列表
        const savedChatList = localStorage.getItem('preset_chats');
        if (savedChatList) {
            try {
                const parsedChatList = JSON.parse(savedChatList);
                if (Array.isArray(parsedChatList) && parsedChatList.length > 0) {
                    chatData.chatList = parsedChatList;
                    if (CONFIG.DEBUG_MODE) console.log(`[聊天面板] ✅ 從localStorage載入 ${parsedChatList.length} 個聊天室`);
                }
            } catch (error) {
                console.error('[聊天面板] 解析localStorage聊天列表失敗:', error);
            }
        }
        
        // 2. 載入私聊數據
        const savedDmChats = localStorage.getItem('dm_chats');
        if (savedDmChats) {
            try {
                const parsedDmChats = JSON.parse(savedDmChats);
                if (parsedDmChats && typeof parsedDmChats === 'object') {
                    chatData.dmChats = parsedDmChats;
                    if (CONFIG.DEBUG_MODE) console.log(`[聊天面板] ✅ 從localStorage載入 ${Object.keys(parsedDmChats).length} 個私聊數據`);
                }
            } catch (error) {
                console.error('[聊天面板] 解析localStorage私聊數據失敗:', error);
            }
        }
        
        // 3. 載入群聊數據
        const savedGroupChats = localStorage.getItem('group_chats');
        if (savedGroupChats) {
            try {
                const parsedGroupChats = JSON.parse(savedGroupChats);
                if (parsedGroupChats && typeof parsedGroupChats === 'object') {
                    chatData.groupChats = parsedGroupChats;
                    if (CONFIG.DEBUG_MODE) console.log(`[聊天面板] ✅ 從localStorage載入 ${Object.keys(parsedGroupChats).length} 個群聊數據`);
                }
            } catch (error) {
                console.error('[聊天面板] 解析localStorage群聊數據失敗:', error);
            }
        }
        
        // 4. 載入劇情聊天數據
        const savedStoryChats = localStorage.getItem('story_chats');
        if (savedStoryChats) {
            try {
                const parsedStoryChats = JSON.parse(savedStoryChats);
                if (parsedStoryChats && typeof parsedStoryChats === 'object') {
                    chatData.storyChats = parsedStoryChats;
                    if (CONFIG.DEBUG_MODE) console.log(`[聊天面板] ✅ 從localStorage載入 ${Object.keys(parsedStoryChats).length} 個劇情聊天數據`);
                }
            } catch (error) {
                console.error('[聊天面板] 解析localStorage劇情聊天數據失敗:', error);
            }
        }
        
        // 5. 載入未讀狀態
        const savedUnreadState = localStorage.getItem('chat_unread_state');
        if (savedUnreadState) {
            try {
                const parsedUnreadState = JSON.parse(savedUnreadState);
                if (parsedUnreadState && typeof parsedUnreadState === 'object') {
                    chatUnreadState = parsedUnreadState;
                    if (CONFIG.DEBUG_MODE) console.log(`[聊天面板] ✅ 從localStorage載入未讀狀態數據`);
                }
            } catch (error) {
                console.error('[聊天面板] 解析localStorage未讀狀態失敗:', error);
            }
        }
        
        // 6. 載入聊天狀態
        const savedChatStates = localStorage.getItem('chat_message_states');
        if (savedChatStates) {
            try {
                const parsedChatStates = JSON.parse(savedChatStates);
                if (parsedChatStates && typeof parsedChatStates === 'object') {
                    // 將Set對象轉換回Set
                    Object.keys(parsedChatStates).forEach(key => {
                        const state = parsedChatStates[key];
                        if (state.systemTimes && Array.isArray(state.systemTimes)) {
                            state.systemTimes = new Set(state.systemTimes);
                        }
                    });
                    chatMessageStates = parsedChatStates;
                    if (CONFIG.DEBUG_MODE) console.log(`[聊天面板] ✅ 從localStorage載入聊天狀態數據`);
                }
            } catch (error) {
                console.error('[聊天面板] 解析localStorage聊天狀態失敗:', error);
            }
        }
        
        if (CONFIG.DEBUG_MODE) console.log('[聊天面板] ✅ localStorage數據載入完成');
        
    } catch (error) {
        console.error('[聊天面板] 載入localStorage數據失敗:', error);
    }
}

/**
 * 🔥 新增：保存聊天室數據到localStorage
 */
function saveChatDataToStorage() {
    try {
        // 1. 保存聊天列表
        if (chatData.chatList && chatData.chatList.length > 0) {
            localStorage.setItem('preset_chats', JSON.stringify(chatData.chatList));
        }
        
        // 2. 保存私聊數據
        if (chatData.dmChats && Object.keys(chatData.dmChats).length > 0) {
            localStorage.setItem('dm_chats', JSON.stringify(chatData.dmChats));
        }
        
        // 3. 保存群聊數據
        if (chatData.groupChats && Object.keys(chatData.groupChats).length > 0) {
            localStorage.setItem('group_chats', JSON.stringify(chatData.groupChats));
        }
        
        // 4. 保存劇情聊天數據
        if (chatData.storyChats && Object.keys(chatData.storyChats).length > 0) {
            localStorage.setItem('story_chats', JSON.stringify(chatData.storyChats));
        }
        
        // 5. 保存未讀狀態
        if (chatUnreadState && Object.keys(chatUnreadState).length > 0) {
            localStorage.setItem('chat_unread_state', JSON.stringify(chatUnreadState));
        }
        
        // 6. 保存聊天狀態
        if (chatMessageStates && Object.keys(chatMessageStates).length > 0) {
            // 將Set對象轉換為數組以便JSON序列化
            const serializableChatStates = {};
            Object.keys(chatMessageStates).forEach(key => {
                const state = chatMessageStates[key];
                serializableChatStates[key] = {
                    ...state,
                    systemTimes: state.systemTimes ? Array.from(state.systemTimes) : []
                };
            });
            localStorage.setItem('chat_message_states', JSON.stringify(serializableChatStates));
        }
        
        if (CONFIG.DEBUG_MODE) console.log('[聊天面板] ✅ 聊天室數據已保存到localStorage');
        
    } catch (error) {
        console.error('[聊天面板] 保存localStorage數據失敗:', error);
    }
}

/**
 * 🆕 更新聊天輸入框的顯示
 */
function updateChatInputPlaceholder() {
    const userInput = document.getElementById('userInput');
    if (!userInput) return;
    
    let currentUserName = protagonistName || '{{user}}';
    
    // 🆕 如果是群聊，使用群組創建者名稱
    if (currentChat && currentChat.type === 'group' && currentChat.admin) {
        currentUserName = currentChat.admin;
    }
    
    userInput.placeholder = `以「${currentUserName}」的身份發言...`;
}

// 🆕 暴露到全局
window.updateChatInputPlaceholder = updateChatInputPlaceholder;

/**
 * 显示错误提示
 */
function showErrorToast(message) {
    const toast = document.createElement('div');
    toast.className = 'error-toast';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed; top: 20px; right: 20px; background: #ff4444;
        color: white; padding: 12px 20px; border-radius: 6px; z-index: 10000;
    `;
    
    document.body.appendChild(toast);
    setTimeout(() => {
        if (toast.parentNode) toast.remove();
    }, 5000);
}

/**
 * 🔥 新增：通知外部處理器面板已重載
 */
function notifyPanelReloaded() {
    try {
        if (window.parent) {
            window.parent.postMessage({ 
                type: 'CHAT_PANEL_RELOADED',
                timestamp: Date.now()
            }, '*');
            if (CONFIG.DEBUG_MODE) console.log('[聊天面板] 已發送重載信號給處理器');
        }
    } catch (error) {
        console.error('[聊天面板] 發送重載信號失敗:', error);
    }
}

/**
 * 🔥 新增：通知外部處理器面板已加載完成
 */
function notifyPanelLoaded() {
    try {
        // 方法1：發送面板加載完成事件
        if (window.parent) {
            window.parent.postMessage({ 
                type: 'PANEL_LOADED',
                panelName: 'chat_panel',
                timestamp: Date.now()
            }, '*');
        }
        
        // 方法2：發送消息重新處理請求
        if (window.parent) {
            window.parent.postMessage({ 
                type: 'REQUEST_MESSAGE_REPROCESS',
                source: 'CHAT_PANEL',
                timestamp: Date.now()
            }, '*');
        }
        
        // 方法3：向頂層窗口發送
        if (window.top && window.top !== window) {
            window.top.postMessage({ 
                type: 'PANEL_LOADED',
                panelName: 'chat_panel',
                timestamp: Date.now()
            }, '*');
        }
        
        // 方法4：廣播到所有iframe
        const allIframes = document.querySelectorAll('iframe');
        allIframes.forEach(iframe => {
            try {
                if (iframe.contentWindow) {
                    iframe.contentWindow.postMessage({ 
                        type: 'PANEL_LOADED',
                        panelName: 'chat_panel',
                        timestamp: Date.now()
                    }, '*');
                }
            } catch (error) {
                // 忽略跨域錯誤
            }
        });
        
        if (CONFIG.DEBUG_MODE) console.log('[聊天面板] 已發送面板加載完成信號');
        
    } catch (error) {
        console.error('[聊天面板] 發送面板加載信號失敗:', error);
    }
}

/**
 * 🔥 新增：設置eventOnButton健康檢查
 */
function setupEventButtonHealthCheck() {
    // 延遲執行，確保處理器有時間重新註冊
    setTimeout(() => {
        requestEventButtonReregistration();
    }, 1000);
    
    // 每隔5秒檢查一次（可選）
    setInterval(() => {
        if (document.getElementById('chatDetailScreen').classList.contains('hidden')) {
            // 只在聊天列表頁面檢查
            requestEventButtonReregistration();
        }
    }, 5000);
}

/**
 * 🔥 新增：請求重新註冊eventOnButton
 */
function requestEventButtonReregistration() {
    try {
        if (window.parent) {
            window.parent.postMessage({ 
                type: 'REQUEST_EVENT_BUTTON_REREGISTRATION',
                timestamp: Date.now()
            }, '*');
            if (CONFIG.DEBUG_MODE) console.log('[聊天面板] 已請求重新註冊eventOnButton');
        }
    } catch (error) {
        console.error('[聊天面板] 請求重新註冊失敗:', error);
    }
}

/**
 * 請求處理器發送當前數據
 */
function requestDataFromProcessor() {
    try {
        if (window.parent) {
            window.parent.postMessage({ type: 'CHAT_PANEL_REQUEST_DATA' }, '*');
        }
    } catch (error) {
        console.error('[聊天面板] 請求數據失敗:', error);
    }
}

/**
 * 🔥 简化：生成數據哈希值（保持重复查看功能）
 */
function generateDataHash(data) {
    const dataString = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < dataString.length; i++) {
        const char = dataString.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash.toString();
}

/**
 * 🔥 新增：清理特定消息的缓存
 */
async function clearDeletedMessageCache(deletedMessageId) {
    if (CONFIG.DEBUG_MODE) console.log(`[聊天面板] 清理被删除消息的缓存: ${deletedMessageId}`);
    
    // 从当前消息中移除对应的消息
    const originalLength = currentMessages.length;
    currentMessages = currentMessages.filter(msg => parseInt(msg.id) !== parseInt(deletedMessageId));
    
    if (currentMessages.length < originalLength) {
        if (CONFIG.DEBUG_MODE) console.log(`[聊天面板] 从当前显示中移除了消息 ${deletedMessageId}`);
        
        // 如果当前在聊天详情页，重新渲染
        if (!document.getElementById('chatDetailScreen').classList.contains('hidden')) {
            await renderSavedMessages();
        }
    }
    
    // 清理聊天状态缓存中对应的消息
    Object.keys(chatMessageStates).forEach(chatKey => {
        const state = chatMessageStates[chatKey];
        if (state.currentMessages) {
            const originalStateLength = state.currentMessages.length;
            state.currentMessages = state.currentMessages.filter(msg => parseInt(msg.id) !== parseInt(deletedMessageId));
            if (state.currentMessages.length < originalStateLength) {
                Logger.debug(`从聊天状态 ${chatKey} 中移除了消息 ${deletedMessageId}`);
            }
        }
    });
}

function requestFullChatData() {
    Logger.info('❤️ 向直接上層(Mobile面板)發出數據請求...');
    try {
        // 🚀 使用統一通訊管理器
        if (window.CommunicationManager) {
            window.CommunicationManager.sendToParent({
                type: 'REQUEST_FULL_CHAT_DATA'
            });
        } else {
            // 備用方案：直接postMessage
            if (window.parent) {
                window.parent.postMessage({
                    type: 'FORWARD_TO_PROCESSOR',
                    payload: {
                        type: 'REQUEST_FULL_CHAT_DATA'
                    }
                }, '*');
            }
        }
    } catch (error) {
        console.error('[聊天面板] 發送轉發請求失敗:', error);
    }
}

/**
 * 🆕 新增：处理撤回消息功能
 */
async function handleMessageRecall(recallInfo) {
    if (CONFIG.DEBUG_MODE) console.log('[聊天面板] 🔄 处理消息撤回:', recallInfo);
    
    try {
        // 解析撤回信息：[撤回|#1 | ROLE A | Message_content | none | 2025-05-16 | 10:00 | 已讀 1]
        const parts = recallInfo.split('|').map(p => p.trim());
        if (parts.length < 2) {
            console.warn('[聊天面板] 撤回消息格式不正确');
            return false;
        }
        
        const messageIdPart = parts[1]; // #1
        const messageId = messageIdPart.replace('#', '').trim();
        
        if (CONFIG.DEBUG_MODE) console.log(`[聊天面板] 准备撤回消息ID: ${messageId}`);
        
        // 从DOM中查找并删除对应的消息元素
        const messageElements = currentChatBody.querySelectorAll('.message');
        let found = false;
        
        messageElements.forEach(element => {
            // 检查消息ID（可以通过data属性或其他方式识别）
            const elementId = element.dataset.messageId || 
                             element.id || 
                             extractMessageIdFromElement(element);
            
            if (elementId === messageId) {
                // 添加撤回动画
                element.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                element.style.opacity = '0';
                element.style.transform = 'scale(0.8)';
                
                // 延迟删除元素
                setTimeout(() => {
                    if (element.parentNode) {
                        element.parentNode.removeChild(element);
                    }
                }, 300);
                
                found = true;
                if (CONFIG.DEBUG_MODE) console.log(`[聊天面板] ✅ 已撤回消息 ${messageId}`);
            }
        });
        
        // 从缓存中删除消息
        if (found) {
            currentMessages = currentMessages.filter(msg => msg.id !== messageId);
            saveChatState(); // 保存状态
        }
        
        if (!found && CONFIG.DEBUG_MODE) {
            console.warn(`[聊天面板] ⚠️ 未找到要撤回的消息 ${messageId}`);
        }
        
        return found;
        
    } catch (error) {
        console.error('[聊天面板] 处理消息撤回时出错:', error);
        return false;
    }
}

/**
 * 🆕 辅助函数：从消息元素中提取消息ID
 */
function extractMessageIdFromElement(element) {
    try {
        // 尝试从消息内容中提取ID
        const messageInfo = element.querySelector('.message-info');
        if (messageInfo) {
            const infoText = messageInfo.textContent;
            // 可以根据实际情况调整提取逻辑
            return null;
        }
        
        // 可以通过其他方式识别消息ID
        return null;
    } catch (error) {
        return null;
    }
}

// ★★★【核心修改】★★★
/**
 * 🆕 新增：處理系統時間提示 (修改為創建並顯示UI元素)
 */
function handleSystemTimeNotice(timeInfo) {
    try {
        // 1. 解析時間內容
        const timeRegex = /\[SYSTEM\s*\|\s*([^\]]+)\]/;
        const match = timeInfo.match(timeRegex);
        if (!match || !match[1]) {
            if (CONFIG.DEBUG_MODE) console.log('[聊天面板] 無法解析時間格式:', timeInfo);
            return;
        }
        const timeString = match[1].trim();

        // 2. 更新內部的敘事時間 (保留原功能)
        // (此處邏輯與原版類似，確保後台時間同步)
        let finalDateTimeString;
        if (timeString.includes('-')) {
            finalDateTimeString = timeString;
        } else {
            const lastDatePart = lastSystemTime ? lastSystemTime.split(' ')[0] : new Date().toISOString().slice(0, 10);
            finalDateTimeString = `${lastDatePart} ${timeString}`;
        }
        lastSystemTime = finalDateTimeString;
        if (CONFIG.DEBUG_MODE) console.log(`[聊天面板] ✅ 內部敘事時間已更新為: ${lastSystemTime}`);

        // 3. 創建並顯示UI元素
        if (!currentChatBody) return; // 如果沒有聊天窗口，則不顯示

        // 防止完全相同的提示重複出現
        if (lastDisplayedSystemTimeContent === timeString) {
            if (CONFIG.DEBUG_MODE) console.log(`[聊天面板] 跳過重複的時間提示: ${timeString}`);
            return;
        }
        lastDisplayedSystemTimeContent = timeString; // 記錄本次顯示的內容

        // 創建提示元素
        const noticeElement = document.createElement('div');
        noticeElement.className = 'system-time-notice'; // 使用 CSS 中已有的樣式
        noticeElement.textContent = timeString;

        // 將提示元素添加到聊天窗口
        currentChatBody.appendChild(noticeElement);

        // 自動滾動到底部，確保用戶能看到新的提示
        currentChatBody.scrollTop = currentChatBody.scrollHeight;

    } catch (error) {
        console.error('[聊天面板] 顯示系統時間提示時出錯:', error);
    }
}

/**
 * 設定所有事件監聽器
 */
function setupEventListeners() {
    window.addEventListener('message', handleMessageEvent);
    // 标签切换事件监听器已移除 - 现在使用统一聊天列表
    document.querySelector('.back-button').addEventListener('click', showChatList);
    document.getElementById('sendButton').addEventListener('click', sendMessage);
    document.getElementById('addButton').addEventListener('click', toggleFunctionPanel);
    document.getElementById('bottomFunctionPanel').addEventListener('click', function(event) {
        if (event.target === this) {
            hideFunctionPanel();
        }
    });
    document.getElementById('userInput').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            sendMessage();
        }
    });
}

/**
 * 🔥 處理接收到的聊天數據
 * @param {Object} receivedData - 接收到的聊天數據
 * @param {string} dataSource - 數據來源
 * @param {boolean} forceRefresh - 是否強制刷新
 */
function handleReceivedChatData(receivedData, dataSource = 'AUTO', forceRefresh = false) {
    if (dataSource === 'MANUAL_HISTORY') {
        window.forceHistoryMode = true;
    }
    try {
        if (CONFIG.DEBUG_MODE) {
            console.log(`[聊天面板] 處理接收數據 - 來源: ${dataSource}, 強制刷新: ${forceRefresh}`);
        }
        
        // 1. 合併聊天數據
        mergeChatData(receivedData);
        
        // 🔥 修正：不依賴外部數據設置 protagonistName
        // 讓 protagonistName 保持為 '{{user}}'，由具體的聊天設置決定
        // if (receivedData.protagonistName) {
        //     protagonistName = receivedData.protagonistName;
        // }
        
        // 3. 處理未讀計數數據
        if (receivedData.unreadCounts) {
            Object.keys(receivedData.unreadCounts).forEach(chatId => {
                const unreadData = receivedData.unreadCounts[chatId];
                if (unreadData && unreadData.count > 0) {
                    if (!chatUnreadState[chatId]) {
                        initChatUnreadState(chatId);
                    }
                    chatUnreadState[chatId].unreadCount = unreadData.count;
                    chatUnreadState[chatId].hasNewMessages = true;
                }
            });
        }
        
        // 4. 更新聊天列表視圖
        updateChatListView();
        
        // 5. 如果當前有選中的聊天，更新詳細視圖
        if (currentChat) {
            updateChatDetailView();
        }
        
        // 6. 處理酒館聊天記錄（用於通話狀態檢查）
        if (receivedData.tavernChatHistory) {
            globalTavernChatHistory = receivedData.tavernChatHistory;
        }
        
        // 🔥 新增：保存數據到localStorage
        saveChatDataToStorage();
        
        if (CONFIG.DEBUG_MODE) {
            console.log(`[聊天面板] 數據處理完成 - 聊天室數量: ${chatData.chatList.length}`);
        }
        
    } catch (error) {
        Logger.error('處理接收數據失敗:', error);
    }
}

/**
 * 🔥 修復版：處理消息事件 - 正確處理新聊天創建 + 未读数字修复
 */
async function handleMessageEvent(event) {
    // 🔥 如果正在發送用戶消息，忽略COMPLETE_RESET
    if (event.data && event.data.type === 'COMPLETE_RESET') {
        if (isUserSendingMessage) {
            if (CONFIG.DEBUG_MODE) console.log('[聊天面板] 正在發送用戶消息，忽略COMPLETE_RESET信號');
            return;
        }
        
        if (CONFIG.DEBUG_MODE) console.log('[聊天面板] 收到完全重置通知，優雅處理數據更新');
        
        // 🔥 优化：保存当前滚动位置
        const chatContainer = document.querySelector('.chat-messages-container') || 
                            document.querySelector('.chat-body') ||
                            document.querySelector('.chat-content');
        
        let savedScrollPosition = null;
        if (chatContainer) {
            savedScrollPosition = {
                scrollTop: chatContainer.scrollTop,
                scrollHeight: chatContainer.scrollHeight
            };
        }
        
        // 🔥 优化：平滑隐藏所有消息，避免闪烁
        const allMessages = document.querySelectorAll('[data-message-id]');
        allMessages.forEach(msg => {
            if (!msg.hasAttribute('data-being-deleted')) {
                msg.style.transition = 'opacity 0.15s ease-out';
                msg.style.opacity = '0.5';
            }
        });
        
        // 🔥 修正：清理localStorage緩存數據
        try {
            localStorage.removeItem('preset_chats');
            localStorage.removeItem('dm_chats');
            localStorage.removeItem('group_chats');
            localStorage.removeItem('story_chats');
            localStorage.removeItem('chat_unread_state');
            localStorage.removeItem('chat_message_states');
            if (CONFIG.DEBUG_MODE) console.log('[聊天面板] 已清理localStorage緩存數據');
        } catch (error) {
            console.error('[聊天面板] 清理localStorage失敗:', error);
        }
        
        // 🔥 修正：重置所有聊天數據狀態
        chatData = { chatList: [], dmChats: {}, groupChats: {}, storyChats: {} };
        messageDisplayQueue = [];
        isDisplayingMessages = false;
        currentMessages = [];
        lastDisplayedDate = null;
        chatMessageStates = {};
        chatUnreadState = {};
        
        // 🆕 重置系统时间相关状态
        lastSystemTime = null;
        displayedSystemTimes.clear();
        
        // 🔥 优化：延迟清空消息显示，让用户看到平滑过渡
        setTimeout(() => {
            // 如果在聊天詳情頁，清空消息顯示
            if (currentChatBody) {
                currentChatBody.innerHTML = '';
            }
            
            // 🔥 新增：重置聊天列表顯示
            if (typeof updateChatListView === 'function') {
                updateChatListView();
            }
            
            // 🔥 优化：恢复滚动位置
            if (savedScrollPosition && chatContainer) {
                setTimeout(() => {
                    const newScrollHeight = chatContainer.scrollHeight;
                    const heightDifference = newScrollHeight - savedScrollPosition.scrollHeight;
                    chatContainer.scrollTop = savedScrollPosition.scrollTop + heightDifference;
                }, 100);
            }
            
            if (CONFIG.DEBUG_MODE) console.log('[聊天面板] 優雅重置完成，已清除所有消息緩存和localStorage數據');
        }, 150);
        
        return;
    }

    // 處理消息刪除通知
    if (event.data && event.data.type === 'MESSAGE_DELETED') {
        if (isUserSendingMessage) {
            if (CONFIG.DEBUG_MODE) console.log('[聊天面板] 正在發送用戶消息，忽略MESSAGE_DELETED信號');
            return;
        }
        
        const deletedMessageId = event.data.deletedMessageId;
        if (CONFIG.DEBUG_MODE) console.log(`[聊天面板] 收到消息删除通知: ${deletedMessageId}`);
        await clearDeletedMessageCache(deletedMessageId);
        return;
    }
    
    // 🔥 新增：處理消息刪除同步開始，優雅處理數據更新
    if (event.data && event.data.type === 'MESSAGE_DELETED_SYNC_START') {
        if (isUserSendingMessage) {
            if (CONFIG.DEBUG_MODE) console.log('[聊天面板] 正在發送用戶消息，忽略MESSAGE_DELETED_SYNC_START信號');
            return;
        }
        
        const deletedMessageId = event.data.deletedMessageId;
        if (CONFIG.DEBUG_MODE) console.log(`[聊天面板] 收到消息删除同步开始通知: ${deletedMessageId}`);
        
        try {
            // 优雅地处理即将到来的数据同步
            handleMessageDeleteSyncStart(deletedMessageId);
        } catch (error) {
            console.error('[聊天面板] 处理消息删除同步开始失败:', error);
        }
        return;
    }
    
    // 🔥 修復版：處理數據更新 - 特別處理新聊天創建 + ✅ 新增未读数字处理
    if (event.data && (event.data.type === 'CHAT_DATA' || event.data.type === 'CHAT_DATA_STREAM')) {
        const receivedData = event.data.data;

        // ✅ 新增：接收并设置未读计数数据
        if (event.data.unreadCounts) {
            chatUnreadState = event.data.unreadCounts;
            Logger.debug('接收到未读计数数据:', chatUnreadState);
            
            // 立即更新聊天列表显示
            setTimeout(() => updateChatListView(), 100);
        }

        // 🔥 修正：不依賴外部系統和 localStorage 設置 protagonistName
        // 讓 protagonistName 保持為 '{{user}}'，由具體的聊天設置決定
        // protagonistName = event.data.protagonistName || "";
        // const savedName = localStorage.getItem('chat_protagonist_name');
        // if (savedName) {
        //     protagonistName = savedName;
        // }

        // 3. 🔥 新增：檢查是否有新創建聊天的指示
        if (event.data.newChatCreated) {
            const newChatData = event.data.newChatCreated;
            newlyCreatedChatId = newChatData.id;
            if (CONFIG.DEBUG_MODE) console.log(`[聊天面板] 標記新創建聊天: ${newlyCreatedChatId}`);
        }

        // 4. 🔥 核心數據處理（簡化且防止重複處理）
        if (receivedData) {
            handleReceivedChatData(receivedData, event.data.dataSource || 'AUTO', event.data.forceRefresh);
        }

        if (CONFIG.DEBUG_MODE) console.log(`[聊天面板] 處理完數據更新，主角名：${protagonistName}`);
        return;
    }

    // 🔥 新增：處理新聊天快速創建回調
    if (event.data && event.data.type === 'NEW_CHAT_CREATED') {
        const newChatInfo = event.data.chatInfo;
        newlyCreatedChatId = newChatInfo.id;
        
        if (CONFIG.DEBUG_MODE) console.log(`[聊天面板] 收到新聊天創建通知: ${newChatInfo.name} (${newChatInfo.id})`);
        
        // 請求最新數據以包含新聊天
        if (window.parent) {
            try {
                window.parent.postMessage({ type: 'REQUEST_FULL_CHAT_DATA' }, '*');
            } catch (error) {
                console.log('請求更新數據失敗:', error);
            }
        }
        return;
    }
    
    // 🔥 新增：處理發送消息到聊天室的請求
    if (event.data && event.data.type === 'SEND_MESSAGE_TO_CHAT') {
        const messageToSend = event.data.message;
        const source = event.data.source;
        
        if (CONFIG.DEBUG_MODE) console.log('[聊天面板] 收到發送消息請求:', { message: messageToSend, source });
        
        try {
            // 🆕 使用現有的消息發送功能
            if (typeof sendMessage === 'function') {
                // 設置輸入框的值
                const userInput = document.getElementById('userInput');
                if (userInput) {
                    userInput.value = messageToSend;
                    // 調用發送函數
                    await sendMessage();
                    if (CONFIG.DEBUG_MODE) console.log('[聊天面板] 消息發送成功');
                } else {
                    throw new Error('找不到用戶輸入框');
                }
            } else {
                throw new Error('sendMessage函數不可用');
            }
        } catch (error) {
            console.error('[聊天面板] 發送消息失敗:', error);
        }
        return;
    }
    
    // 🔥 新增：確認eventButton已重新註冊的通知
    if (event.data && event.data.type === 'EVENT_BUTTON_REREGISTERED') {
        if (CONFIG.DEBUG_MODE) console.log('[聊天面板] 確認處理器已重新註冊eventOnButton');
        return;
    }
    
    // 🔥 新增：系統時間提示
    if (event.data && event.data.type === 'SYSTEM_TIME_NOTICE') {
        const timeString = event.data.timeString;
        if (timeString) {
            displaySystemTimeNotice(timeString);
        }
        return;
    }
    
    // 🔥 新增：處理選擇提示
    if (event.data && event.data.type === 'CHOICE_PROMPT') {
        const choices = event.data.choices;
        if (choices && Array.isArray(choices)) {
            displayChoicePrompt(choices);
        }
        return;
    }
}

/**
 * 🔥 修復版：強制重置面板 - 不清空聊天列表
 */
function forceResetPanel() {
    if (CONFIG.DEBUG_MODE) console.log('[聊天面板] 執行強制重置');
    
    // 🔥 清空所有可能造成污染的狀態
    messageDisplayQueue = [];           
    isDisplayingMessages = false;       
    currentMessages = [];               
    lastDisplayedDate = null;           
    isInitialChatLoad = false;
    chatUnreadState = {};
    
    // 🆕 重置系统时间相关状态
    lastSystemTime = null;
    displayedSystemTimes.clear();
    
    // 清空UI - 但不清空聊天列表
    if (currentChatBody) {
        currentChatBody.innerHTML = '';
    }
    
    // 重置語音播放狀態
    voicePlaybackStates = {};
    
    if (CONFIG.DEBUG_MODE) console.log('[聊天面板] 強制重置完成 - 保留聊天列表');
}

/**
 * 🔥 新增：調試用提示框
 */
function showDebugToast(message) {
    if (!CONFIG.DEBUG_MODE) return;
    
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        background-color: rgba(0,0,0,0.8);
        color: white;
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 12px;
        z-index: 2000;
        pointer-events: none;
    `;
    toast.textContent = `[調試] ${message}`;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 2000);
}

// =======================================================================
//                      🔥 优化的 API 管理器 (基于官方 types.d.ts)
// =======================================================================

/**
 * 统一的 TavernHelper API 调用管理器
 * 基于 types.d.ts 官方文档优化
 */
const TavernAPI = {
    // API 调用缓存
    _cache: new Map(),
    _cacheTimeout: 2000, // 2秒缓存

    /**
     * 通用 API 调用方法
     * @param {string} method - API 方法名
     * @param {...any} args - 参数
     * @returns {Promise<any>} API 调用结果
     */
    async call(method, ...args) {
        try {
            const helper = this.getTavernHelper();
            if (!helper || !helper[method]) {
                throw new Error(`TavernHelper.${method} 不可用`);
            }
            
            if (CONFIG.DEBUG_MODE) console.log(`[API] 调用 ${method}`, args);
            return await helper[method](...args);
        } catch (error) {
            console.error(`[API调用] ${method} 失败:`, error);
            throw error;
        }
    },

    /**
     * 获取 TavernHelper 实例
     */
    getTavernHelper() {
        // 多层级查找 TavernHelper
        const locations = [
            () => window.parent?.TavernHelper,
            () => window.top?.TavernHelper,
            () => window.TavernHelper
        ];

        for (const getHelper of locations) {
            try {
                const helper = getHelper();
                if (helper) return helper;
            } catch (error) {
                // 继续尝试下一个位置
            }
        }
        
        return null;
    },

    /**
     * 获取缓存的数据
     */
    getCached(key) {
        const cached = this._cache.get(key);
        if (cached && Date.now() - cached.time < this._cacheTimeout) {
            return cached.data;
        }
        return null;
    },

    /**
     * 设置缓存
     */
    setCache(key, data) {
        this._cache.set(key, { data, time: Date.now() });
    },

    /**
     * 清除缓存
     */
    clearCache() {
        this._cache.clear();
    },

    // === 基于 types.d.ts 的 API 方法 ===

    /**
     * 获取最后一条消息的ID
     * 基于 types.d.ts: function getLastMessageId(): number
     */
    async getLastMessageId() {
        const cacheKey = 'lastMessageId';
        const cached = this.getCached(cacheKey);
        if (cached !== null) return cached;
        
        const id = await this.call('getLastMessageId');
        this.setCache(cacheKey, id);
        return id;
    },

    /**
     * 获取聊天消息
     * 基于 types.d.ts: function getChatMessages(range, options?)
     */
    async getChatMessages(range, options = {}) {
        return await this.call('getChatMessages', range, options);
    },

    /**
     * 创建聊天消息
     * 基于 types.d.ts: async function createChatMessages(messages, options?)
     */
    async createChatMessages(messages, options = {}) {
        const defaultOptions = {
            insert_at: 'end',
            refresh: 'affected'
        };
        return await this.call('createChatMessages', messages, { ...defaultOptions, ...options });
    },

    /**
     * 删除聊天消息
     * 基于 types.d.ts: async function deleteChatMessages(message_ids, options?)
     */
    async deleteChatMessages(messageIds, options = {}) {
        const defaultOptions = {
            refresh: 'all'
        };
        return await this.call('deleteChatMessages', messageIds, { ...defaultOptions, ...options });
    },

    /**
     * 获取变量
     * 基于 types.d.ts: function getVariables(options?)
     */
    async getVariables(options = {}) {
        const defaultOptions = {
            type: 'chat'
        };
        return await this.call('getVariables', { ...defaultOptions, ...options });
    },

    /**
     * 设置变量
     * 基于 types.d.ts: async function replaceVariables(variables, options?)
     */
    async setVariables(variables, options = {}) {
        const defaultOptions = {
            type: 'chat'
        };
        return await this.call('replaceVariables', variables, { ...defaultOptions, ...options });
    },

    /**
     * 格式化显示消息
     * 基于 types.d.ts: function formatAsDisplayedMessage(text, options?)
     */
    formatAsDisplayedMessage(text, options = {}) {
        const defaultOptions = {
            message_id: 'last'
        };
        return this.call('formatAsDisplayedMessage', text, { ...defaultOptions, ...options });
    },

    /**
     * 生成文本
     * 基于 types.d.ts: async function generate(config)
     */
    async generate(config = {}) {
        const defaultConfig = {
            should_stream: false,
            max_chat_history: 'all'
        };
        return await this.call('generate', { ...defaultConfig, ...config });
    }
};

// === 兼容性包装函数 ===
async function callTavernHelperAPI(apiName, ...args) {
    return await TavernAPI.call(apiName, ...args);
}

async function getLastMessageId() {
    return await TavernAPI.getLastMessageId();
}

async function getChatMessages(range, options) {
    return await TavernAPI.getChatMessages(range, options);
}

async function createChatMessages(messages, options) {
    return await TavernAPI.createChatMessages(messages, options);
}

// =======================================================================
//                          🔥 修復版：多層iframe查找邏輯
// =======================================================================

/**
 * 🔥 修復版：查找酒館AI主環境窗口
 */
function findTavernMainWindow() {
    try {
        if (CONFIG.DEBUG_MODE) console.log('[聊天面板] 開始查找酒館AI主環境...');
        
        // 當前iframe結構：
        // 酒館AI (主環境) → Map面板 → Chat面板 (當前)
        
        let currentWindow = window;
        let depth = 0;
        
        // 向上遍歷iframe層級，直到找到酒館AI主環境
        while (currentWindow.parent && currentWindow.parent !== currentWindow && depth < 5) {
            currentWindow = currentWindow.parent;
            depth++;
            
            if (CONFIG.DEBUG_MODE) console.log(`[聊天面板] 向上查找第${depth}層:`, {
                hasDocument: !!currentWindow.document,
                hasTavernHelper: !!(currentWindow.TavernHelper),
                hasTextarea: !!(currentWindow.document && currentWindow.document.querySelector('#send_textarea')),
                hasTitle: currentWindow.document ? currentWindow.document.title : 'unknown'
            });
            
            // 檢查是否為酒館AI主環境
            if (currentWindow.document && 
                currentWindow.document.querySelector('#send_textarea') && 
                currentWindow.document.querySelector('#send_but')) {
                if (CONFIG.DEBUG_MODE) console.log(`[聊天面板] ✅ 找到酒館AI主環境 (深度: ${depth})`);
                return currentWindow;
            }
        }
        
        console.error('[聊天面板] ❌ 未找到酒館AI主環境');
        return null;
        
    } catch (error) {
        console.error('[聊天面板] 查找酒館AI主環境時出錯:', error);
        return null;
    }
}

// 🔥 新增：頁面可見性變化時的處理
document.addEventListener('visibilitychange', function() {
    if (!document.hidden) {
        // 頁面重新變為可見時，請求重新註冊
        setTimeout(() => {
            requestEventButtonReregistration();
        }, 500);
    }
});

// 🔥 新增：窗口焦點恢復時的處理  
window.addEventListener('focus', function() {
    setTimeout(() => {
        requestEventButtonReregistration();
    }, 500);
});

// 🔥 新增：調試函數
window.debugEventButton = function() {
    Logger.debug('=== EventOnButton 調試信息 ===');
    Logger.debug('當前iframe名稱:', window.name || 'unknown');
    Logger.debug('window.parent可用:', !!window.parent);
    Logger.debug('TavernHelper可用:', !!(window.parent && window.parent.TavernHelper));
    Logger.debug('eventOnButton可用:', typeof eventOnButton);

    // 手動觸發重新註冊
    requestEventButtonReregistration();
};

// 🔥 新增：觸發手動更新的函數
function triggerManualUpdate() {
    try {
        // 向父窗口發送更新請求
        if (window.parent) {
            window.parent.postMessage({ 
                type: 'TRIGGER_MANUAL_UPDATE',
                source: 'GROUP_CREATION',
                timestamp: Date.now()
            }, '*');
            if (CONFIG.DEBUG_MODE) console.log('[聊天面板] 已觸發手動更新請求');
        }
    } catch (error) {
        console.error('[聊天面板] 觸發手動更新失敗:', error);
    }
}

// 🔥 新增：通知處理器檢查新消息
function notifyProcessorToCheck() {
    try {
        if (window.parent) {
            window.parent.postMessage({ 
                type: 'REQUEST_PROCESSOR_CHECK',
                timestamp: Date.now()
            }, '*');
            if (CONFIG.DEBUG_MODE) console.log('[聊天面板] 已通知處理器檢查新消息');
        }
    } catch (error) {
        console.error('[聊天面板] 通知處理器失敗:', error);
    }
}

// 批量渲染模式同步修復
window.addEventListener('message', function(event) {
    if (event.data?.type === 'TRIGGER_MANUAL_UPDATE') {
        window.forceHistoryMode = true;
    }
});

// 显示成功提示
function showSuccessToast(message) {
    // 创建提示元素
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background-color: var(--primary-green);
        color: white;
        padding: 10px 20px;
        border-radius: 8px;
        font-size: 14px;
        z-index: 2000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        animation: slideDown 0.3s ease;
    `;
    toast.textContent = message;
    
    // 添加滑入动画
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideDown {
            0% { transform: translateX(-50%) translateY(-20px); opacity: 0; }
            100% { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(toast);
    
    // 3秒后自动移除
    setTimeout(() => {
        toast.style.animation = 'slideDown 0.3s ease reverse';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
            if (style.parentNode) {
                style.parentNode.removeChild(style);
            }
        }, 300);
    }, 3000);
}

// 🎨 檢測是否在iframe中，如果是則隱藏header避免雙重header
document.addEventListener('DOMContentLoaded', () => {
    if (window.parent !== window) {
        console.log('[Chat面板] 檢測到在iframe中運行，隱藏header避免雙重顯示');
        const chatHeader = document.getElementById('chatHeader');
        if (chatHeader) {
            chatHeader.style.display = 'none';
        }
        
        // 調整body樣式，讓內容填滿整個iframe
        document.body.style.paddingTop = '0';
        document.body.style.marginTop = '0';
        
        // 調整chat-list-body的樣式
        const chatListBody = document.querySelector('.chat-list-body');
        if (chatListBody) {
            chatListBody.style.height = '100vh';
            chatListBody.style.paddingTop = '0';
        }
        
        // 🎨 通知父窗口當前在聊天列表
        notifyParentWindowChange(false); // false = 不在聊天室，在聊天列表
    }
});

// 🔥 新增：面板加載完成時發送事件
window.addEventListener('load', function() {
    console.log('[Chat面板] 面板加載完成，發送加載事件');
    
    // 延遲發送，確保所有資源都已加載
    setTimeout(() => {
        notifyPanelLoaded();
    }, 500);
});

// 🎨 通知父窗口窗口狀態變化
function notifyParentWindowChange(inChatRoom) {
    if (window.parent && window.parent !== window) {
        // 發送原有的CHAT_WINDOW_CHANGE消息
        window.parent.postMessage({
            type: 'CHAT_WINDOW_CHANGE',
            inChatRoom: inChatRoom,
            timestamp: Date.now()
        }, '*');
        
        // 🆕 新增：發送CHAT_PAGE_STATE_CHANGE消息到主面板
        window.parent.postMessage({
            type: 'CHAT_PAGE_STATE_CHANGE',
            isInChatRoom: inChatRoom,
            timestamp: Date.now()
        }, '*');
        
        console.log('[Chat面板] 通知父窗口窗口狀態:', inChatRoom ? '聊天室' : '聊天列表');
    }
}

// 🔥 新增：处理消息删除同步开始，优化面板更新体验
function handleMessageDeleteSyncStart(deletedMessageId) {
    try {
        Logger.debug(`🔥 开始处理消息删除同步: ${deletedMessageId}`);
        
        // 查找要删除的消息元素
        const messageElement = document.querySelector(`[data-message-id="${deletedMessageId}"]`);
        
        if (messageElement) {
            // 保存滚动位置
            const chatContainer = document.querySelector('.chat-messages-container') || 
                                document.querySelector('.chat-body') ||
                                document.querySelector('.chat-content');
            
            let scrollTop = 0;
            let scrollHeight = 0;
            if (chatContainer) {
                scrollTop = chatContainer.scrollTop;
                scrollHeight = chatContainer.scrollHeight;
            }
            
            // 🔥 优化：立即隐藏被删除的消息，避免闪烁
            messageElement.style.transition = 'opacity 0.2s ease-out';
            messageElement.style.opacity = '0.3';
            messageElement.style.pointerEvents = 'none';
            
            // 添加删除标记，防止重复处理
            messageElement.setAttribute('data-being-deleted', 'true');
            
            // 保存滚动位置信息到全局变量
            window.lastScrollPosition = { scrollTop, scrollHeight };
            
            Logger.debug(`✅ 消息已标记为删除状态: ${deletedMessageId}`);
            
        } else {
            Logger.warn(`⚠️ 未找到消息元素: ${deletedMessageId}`);
        }
        
    } catch (error) {
        Logger.error('❌ 处理消息删除同步开始失败:', error);
    }
}

// 🔥 新增：更新聊天消息计数
function updateChatMessageCount(deletedMessageId) {
    try {
        // 更新当前聊天的消息计数
        if (currentChat && currentChat.messageCount) {
            currentChat.messageCount = Math.max(0, currentChat.messageCount - 1);
        }
        
        // 更新聊天列表中的消息计数
        if (chatData && chatData.chatList) {
            chatData.chatList.forEach(chat => {
                if (chat.messages && chat.messages.includes(deletedMessageId)) {
                    chat.messages = chat.messages.filter(id => id !== deletedMessageId);
                    if (chat.messageCount) {
                        chat.messageCount = Math.max(0, chat.messageCount - 1);
                    }
                }
            });
        }
        
        // 更新聊天列表显示
        if (typeof updateChatListView === 'function') {
            setTimeout(() => updateChatListView(), 100);
        }
        
        Logger.debug(`✅ 更新消息计数完成: ${deletedMessageId}`);
        
    } catch (error) {
        Logger.error('❌ 更新消息计数失败:', error);
    }
}