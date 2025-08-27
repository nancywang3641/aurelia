/**
 * 奧瑞亞地圖面板 - 工具核心 (v5.0 - 官方API增强版)
 * 
 * 主要改進：
 * - 使用統一日志管理系統  
 * - 增强酒館官方API集成
 * - 優化錯誤處理和重試機制
 * - 清理調試代碼
 * - 改善性能監控
 */

// 工具模块核心

/**
 * 地图工具管理类
 * 封装所有通信、存储和工具函数
 */
class MapUtilsManager {
    constructor() {
        this.isInitialized = false;
        this.messageHandlers = new Map();
        this.retryQueues = new Map();
        this.performanceMetrics = {
            messagesSent: 0,
            messagesReceived: 0,
            apiCallsSuccess: 0,
            apiCallsFailure: 0
        };
        
        // API引用缓存
        this.apiCache = {
            tavernHelper: null,
            sillyTavern: null,
            lastCheck: 0,
            checkInterval: 5000 // 5秒检查一次
        };
    }

    /**
     * 初始化工具模块
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            // 初始化API引用
            await this.initializeAPIReferences();
            
            // 设置消息监听
            this.setupMessageListener();
            
            // 设置错误处理
            this.setupErrorHandler();
            
            // 初始化存储
            this.initializeStorage();
            
            this.isInitialized = true;
            
        } catch (error) {
            throw error;
        }
    }

    /**
     * 初始化API引用
     */
    async initializeAPIReferences() {
        this.refreshAPICache();
        
        // 如果有TavernHelper，设置相关监听
        if (this.apiCache.tavernHelper) {
            this.setupTavernHelperIntegration();
        }
        
        if (this.apiCache.sillyTavern) {
            this.setupSillyTavernIntegration();
        }
    }

    /**
     * 刷新API缓存
     */
    refreshAPICache() {
        const now = Date.now();
        if (now - this.apiCache.lastCheck < this.apiCache.checkInterval) {
            return; // 避免频繁检查
        }

        // 详细检测TavernHelper
        const parentTH = window.parent?.TavernHelper;
        const localTH = window.TavernHelper;
        this.apiCache.tavernHelper = parentTH || localTH || null;
        
        // 详细检测SillyTavern
        const parentST = window.parent?.SillyTavern;
        const localST = window.SillyTavern;
        this.apiCache.sillyTavern = parentST || localST || null;
        
        this.apiCache.lastCheck = now;
    }

    /**
     * 设置TavernHelper集成
     */
    setupTavernHelperIntegration() {
        const th = this.apiCache.tavernHelper;
        if (!th) return;

        try {
            // 监听系统事件
            if (typeof th.eventOn === 'function') {
                th.eventOn('GENERATION_STARTED', () => {
                    // AI生成开始
                });
                
                th.eventOn('GENERATION_ENDED', (text) => {
                    // AI生成结束
                });
            }
        } catch (error) {
            // 集成设置失败，忽略错误
        }
    }

    /**
     * 设置SillyTavern集成  
     */
    setupSillyTavernIntegration() {
        const st = this.apiCache.sillyTavern;
        if (!st) return;

        try {
            // 可以使用SillyTavern的API进行更深度的集成
        } catch (error) {
            // 集成设置失败，忽略错误
        }
    }

    /**
     * 处理窗口消息 (主要消息处理逻辑)
     */
    handleWindowMessage(event) {
        if (!event.data?.type) {
            return;
        }

        const { type, data, source } = event.data;
        
        this.performanceMetrics.messagesReceived++;

        try {
            // 处理需要转发到父级的消息
            if (this.shouldForwardToParent(type)) {
                this.sendMessageToParent(event.data);
                return;
            }

            // 处理需要转发到子iframe的消息
            if (this.shouldForwardToChild(type)) {
                this.handleChildForwarding(event.data);
        return;
    }

            // 处理地图面板内部消息
            this.handleInternalMessage(event.data);
            
        } catch (error) {
            // 处理消息时发生错误，忽略
        }
    }

    /**
     * 判断是否需要转发到父级
     */
    shouldForwardToParent(type) {
        const forwardTypes = [
        'VN_PROCESS_HISTORY_ITEM',
        'VN_COMMAND',
        'VN_CALL_ANSWERED',
        'VN_CALL_REJECTED', 
        'VN_CALL_ENDED',
        'VN_FETCH_LATEST_IMAGE',
        'VN_REQUEST_BACKGROUND_IMAGE',
        'VN_FIND_IMAGE_URL_IN_CHAT',
        'VN_PANEL_STARTUP_TEST',
        'VN_PANEL_TEST_RESPONSE',
        'VN_CHOICE_API',
            'REQUEST_FULL_CHAT_DATA',
            'SUMMARY_REQUEST',
            'SUMMARY_EXPORT_REQUEST',
            'FORWARD_TO_PROCESSOR'
        ];
        
        return forwardTypes.includes(type);
    }

    /**
     * 判断是否需要转发到子iframe
     */
    shouldForwardToChild(type) {
        const childForwardTypes = [
            'CHAT_DATA',
            'CHAT_DATA_STREAM', 
            'COMPLETE_RESET',
            'MESSAGE_DELETED'
        ];
        
        return childForwardTypes.includes(type);
    }

    /**
     * 处理子iframe转发
     */
    handleChildForwarding(messageData) {
        const { type } = messageData;
        
        // 聊天数据转发到聊天面板
        if (type === 'CHAT_DATA' || type === 'CHAT_DATA_STREAM') {
            this.sendMessageToChildIframe('chatPanelIframe', messageData);
            return;
        }
        
        // 其他消息的转发逻辑
        if (type === 'COMPLETE_RESET' || type === 'MESSAGE_DELETED') {
            this.sendMessageToChildIframe('chatPanelIframe', messageData);
        return;
        }
    }

    /**
     * 处理内部消息
     */
    handleInternalMessage(messageData) {
        const { type, data } = messageData;

        switch(type) {
        case 'MAP_LOCATION_DATA':
                // 修復：直接傳遞完整的messageData.data而不是從data取data
                this.handleLocationData(messageData.data);
            break;
        
        case 'VN_CHOICE':
                this.handleVNChoice(messageData.choice);
            break;
            
        case 'STORY_OPTIONS_DATA':
                this.handleStoryOptions(messageData.options);
            break;

        case 'CONTINUE_STORY':
                this.handleContinueStory();
            break;

        case 'OPEN_CHAT_PANEL':
                this.handleOpenChatPanel();
            break;

        case 'OPEN_ECHO_PANEL':
                this.handleOpenEchoPanel();
            break;

        case 'TEST_MESSAGE':
            break;

            default:
                // 未处理的内部消息类型
    }
}

    /**
     * 处理位置数据更新
     */
    handleLocationData(data) {
        if (window.MapCore && data) {
            window.MapCore.updateCharacterData(data);
            
            // 延迟更新显示，确保数据已处理
            setTimeout(() => {
                if (window.MapArea?.updateCurrentFacilityDisplay) {
                    window.MapArea.updateCurrentFacilityDisplay();
                }
            }, 100);
        }
    }

    /**
     * 处理VN选择
     */
    handleVNChoice(choice) {
        if (window.MapVN?.handleVNChoice) {
            window.MapVN.handleVNChoice(choice);
        }
    }

    /**
     * 处理故事选项
     */
    handleStoryOptions(options) {
        this.hideLoading();
        
        if (window.MapVN && options?.length > 0) {
            window.MapVN.showStorySelection(options);
        } else {
            this.showNotification('未能生成有效的故事选项，请重试。', 'warning');
        }
    }

    /**
     * 处理继续故事
     */
    handleContinueStory() {
        if (window.MapVN?.showVNPanel) {
            window.MapVN.showVNPanel({});
        }
    }

    /**
     * 处理打开聊天面板
     */
    handleOpenChatPanel() {
        if (typeof window.openChatPanel === 'function') {
            window.openChatPanel();
        }
    }

    /**
     * 处理打开Echo面板
     */
    handleOpenEchoPanel() {
        if (typeof window.openEchoPanel === 'function') {
            window.openEchoPanel();
        }
    }

    /**
     * 发送消息到父级窗口
     */
    sendMessageToParent(messageData) {
    try { 
        if (window.parent && window.parent !== window) {
            window.parent.postMessage(messageData, '*');
                this.performanceMetrics.messagesSent++;
                return true;
        }
            return false;
    } catch (error) { 
            return false;
    } 
}

/**
     * 向特定子iframe发送消息
 */
    sendMessageToChildIframe(iframeId, messageData) {
    try {
        const iframe = document.getElementById(iframeId);
            if (iframe?.contentWindow && iframe.src !== 'about:blank') {
            iframe.contentWindow.postMessage(messageData, '*');
                this.performanceMetrics.messagesSent++;
            return true;
        }
            
        return false;
    } catch (error) {
        return false;
    }
}

/**
     * 发送命令到聊天（使用官方API优先）
     */
    async sendCommandToChat(command) {
        if (!command) {
            return false;
        }

        this.refreshAPICache();
        
        try {
            // 方案1: 优先使用TavernHelper API
            if (this.apiCache.tavernHelper?.triggerSlash) {
                const result = await this.apiCache.tavernHelper.triggerSlash(command);
                this.performanceMetrics.apiCallsSuccess++;
                return true;
            }
            
            // 方案2: 尝试SillyTavern官方API
            if (this.apiCache.sillyTavern?.executeSlashCommandsWithOptions) {
                await this.apiCache.sillyTavern.executeSlashCommandsWithOptions(command);
                this.performanceMetrics.apiCallsSuccess++;
                return true;
        }
            
            // 方案3: 备用方案：通过消息转发
            const success = this.sendMessageToParent({
                type: 'SEND_CHAT_COMMAND', 
                command: command,
                source: 'MAP_PANEL'
            }); 
            
            if (success) {
                this.performanceMetrics.apiCallsSuccess++;
            } else {
                this.performanceMetrics.apiCallsFailure++;
            }
            
            return success;
            
    } catch (error) { 
            this.performanceMetrics.apiCallsFailure++;
            
            // 错误时的最后备用方案
            return this.sendMessageToParent({
            type: 'SEND_CHAT_COMMAND', 
            command: command,
                source: 'MAP_PANEL',
                fallback: true
        }); 
    } 
}

/**
 * 显示通知消息
 */
    showNotification(message, type = 'info', duration = 3000) {
    const notification = document.getElementById('notification'); 
        if (!notification) {
            // 如果没有通知元素，尝试使用官方API
            if (this.apiCache.sillyTavern?.callGenericPopup) {
                this.apiCache.sillyTavern.callGenericPopup(message, 1);
                return;
            }
            
            // 最后备用方案
            return;
        }

        notification.textContent = message; 
        notification.className = `notification show ${type}`;
        
        setTimeout(() => {
            notification.classList.remove('show');
        }, duration);
    }

    /**
     * 显示/隐藏加载状态
     */
    showLoading(show = true) {
        const loadingElement = document.getElementById('loading-overlay');
        if (loadingElement) {
            loadingElement.style.display = show ? 'flex' : 'none';
    } 
}

/**
     * 隐藏加载状态
     */
    hideLoading() {
        this.showLoading(false);
    }

    /**
     * 初始化存储
     */
    initializeStorage() {
        try {
            // 检查localStorage可用性
            const testKey = 'mapPanelTest';
            localStorage.setItem(testKey, 'test');
            localStorage.removeItem(testKey);
            // 延迟加载数据，确保MapArea已初始化
            setTimeout(() => {
                this.loadFromStorage();
            }, 1000);
        } catch (error) {
            // 存储系统不可用
        }
    }

    /**
     * 保存数据到localStorage
     */
    saveToStorage() {
        try {
            const dataToSave = {};
            
            // 保存设施位置数据
            if (window.MapArea?.getFacilityPositions) {
                dataToSave.facilityPositions = window.MapArea.getFacilityPositions();
            }
            
            // 保存自定义设施数据
            if (window.MapArea?.getCustomFacilities) {
                dataToSave.customFacilities = window.MapArea.getCustomFacilities();
            }
            
            // 保存已删除设施数据
            if (window.MapArea?.getDeletedFacilities) {
                dataToSave.deletedFacilities = window.MapArea.getDeletedFacilities();
            }
            
            localStorage.setItem('map_panel_data', JSON.stringify(dataToSave));
            
        } catch (error) {
            // 保存数据失败
        }
    }

    /**
     * 从localStorage加载数据
     */
    loadFromStorage() {
        try {
            const savedData = localStorage.getItem('map_panel_data');
            if (!savedData) {
                return;
            }
            
            const data = JSON.parse(savedData);
            
            // 恢复设施位置数据
            if (data.facilityPositions) {
                if (window.MapArea?.setFacilityPositions) {
                    window.MapArea.setFacilityPositions(data.facilityPositions);
                }
            }
            
            // 恢复自定义设施数据
            if (data.customFacilities) {
                if (window.MapArea?.setCustomFacilities) {
                    window.MapArea.setCustomFacilities(data.customFacilities);
                }
            }
            
            // 恢复已删除设施数据
            if (data.deletedFacilities) {
                if (window.MapArea?.setDeletedFacilities) {
                    window.MapArea.setDeletedFacilities(data.deletedFacilities);
                }
            }
            
        } catch (error) {
            // 从localStorage加载数据失败
        }
    }

    /**
     * 设置定期保存机制（恢复旧版功能）
     */
    setupPeriodicSave() {
        if (this.periodicSaveInterval) {
            clearInterval(this.periodicSaveInterval);
        }
        
        // 定期保存数据 (每分钟)
        this.periodicSaveInterval = setInterval(() => {
            this.saveToStorage();
        }, 60000);
        
        // 监听页面卸载事件，保存数据
        window.addEventListener('beforeunload', () => {
            this.saveToStorage();
        });
    }

    /**
     * 设置错误处理
     */
    setupErrorHandler() {
        window.addEventListener('error', (event) => {
            // 全局错误处理
        });

        window.addEventListener('unhandledrejection', (event) => {
            // 未处理的Promise拒绝
        });
    }

    /**
     * 设置消息监听器
     */
    setupMessageListener() {
        window.addEventListener('message', (event) => {
            this.handleWindowMessage(event);
        });
        
        // 立即测试消息监听是否工作
        setTimeout(() => {
            window.postMessage({ type: 'TEST_MESSAGE', data: 'test' }, '*');
        }, 100);
    }

    /**
     * 等待iframe准备就绪
     */
    async waitForIframe(iframeId, timeout = 5000) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            const iframe = document.getElementById(iframeId);
            if (iframe?.contentDocument?.readyState === 'complete') {
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        return false;
    }

    /**
     * 获取性能指标
     */
    getPerformanceMetrics() {
        return { ...this.performanceMetrics };
    }

    /**
     * 重置性能指标
     */
    resetPerformanceMetrics() {
        this.performanceMetrics = {
            messagesSent: 0,
            messagesReceived: 0,
            apiCallsSuccess: 0,
            apiCallsFailure: 0
        };
    }
}

// 创建全局实例
const mapUtilsInstance = new MapUtilsManager();

// 向后兼容的全局函数
window.handleWindowMessage = (event) => mapUtilsInstance.handleWindowMessage(event);
window.sendMessageToParent = (messageData) => mapUtilsInstance.sendMessageToParent(messageData);
window.sendMessageToChildIframe = (iframeId, messageData) => mapUtilsInstance.sendMessageToChildIframe(iframeId, messageData);
window.sendCommandToChat = (command) => mapUtilsInstance.sendCommandToChat(command);
window.showNotification = (message, type, duration) => mapUtilsInstance.showNotification(message, type, duration);
window.showLoading = (show) => mapUtilsInstance.showLoading(show);

// 全局MapUtils对象，供其他模块使用
window.MapUtils = { 
    ...mapUtilsInstance,
    saveToStorage: () => mapUtilsInstance.saveToStorage(),
    loadFromStorage: () => mapUtilsInstance.loadFromStorage(),
    showNotification: (message, type, duration) => mapUtilsInstance.showNotification(message, type, duration),
    showLoading: (show) => mapUtilsInstance.showLoading(show),
    sendCommandToChat: (command) => mapUtilsInstance.sendCommandToChat(command),
    sendMessageToParent: (messageData) => mapUtilsInstance.sendMessageToParent(messageData),
    sendMessageToChildIframe: (iframeId, messageData) => mapUtilsInstance.sendMessageToChildIframe(iframeId, messageData)
};

// 初始化函数
window.initializeMapPanel = async () => {
    try {
        await mapUtilsInstance.initialize();
        
        // 等待其他模块加载
        const initModules = async () => {
            const modules = [
                { name: 'MapCore', obj: window.MapCore },
                { name: 'MapArea', obj: window.MapArea },
                { name: 'MapVN', obj: window.MapVN }
            ];
            
            for (const module of modules) {
                if (module.obj?.init) {
                    try {
                        await module.obj.init();
                    } catch (error) {
                        // 模块初始化失败
                    }
                }
            }
        };
        
        await initModules();
        
        // 设置定期保存机制
        mapUtilsInstance.setupPeriodicSave();
        
    } catch (error) {
        // 地图面板初始化失败
    }
};

// 暴露实例供调试
if (typeof window !== 'undefined') {
    window.MapUtilsInstance = mapUtilsInstance;
}

// ===== 【關鍵修復】自動初始化 =====
if (!window.autoMapUtilsInitStarted) { 
    window.autoMapUtilsInitStarted = true; 
    
    // 確保DOM準備好後再初始化
    if (document.readyState === 'loading') { 
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => window.initializeMapPanel(), 100);
        }); 
    } else { 
        // DOM已加載，立即初始化
        setTimeout(() => window.initializeMapPanel(), 100);
    } 
}

// 工具模块已加载 v5.0 (官方API增强版)