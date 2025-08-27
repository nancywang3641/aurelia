/**
 * 🚀 奧瑞亞統一通訊核心 v2.0
 * 整合所有面板間的通訊邏輯到單一文件
 * 
 * 功能整合：
 * - 統一通訊管理器
 * - Chat面板通訊
 * - VN面板通訊  
 * - Echo面板通訊
 * - News新聞通訊
 * - 面板控制邏輯
 * - 錯誤處理和重試機制
 * - 性能監控和日誌
 */

class UnifiedCommunicationCore {
    constructor() {
        this.metadata = {
            version: '2.0',
            lastUpdated: '2025-01-15',
            author: 'MAP System',
            description: '統一通訊核心 - 整合版'
        };
        
        this.isInitialized = false;
        this.messageHandlers = new Map();
        this.retryQueue = new Map();
        
        // 性能統計
        this.performance = {
            startTime: Date.now(),
            counters: {
                messagesSent: 0,
                messagesReceived: 0,
                errors: 0,
                retries: 0,
                panelOperations: 0,
                newsOperations: 0,
                vnOperations: 0,
                chatOperations: 0,
                livestreamOperations: 0
            }
        };
        
        // 通訊配置
        this.config = {
            retryAttempts: 3,
            retryDelay: 1000,
            timeout: 5000,
            debugMode: false
        };
        
        // 面板狀態管理
        this.panelStates = {
            chat: { loaded: false, active: false },
            echo: { loaded: false, active: false },
            livestream: { loaded: false, active: false },
            vn: { loaded: false, active: false },
            news: { loaded: false, active: false }
        };
        
        // 面板識別
        this.panelInfo = {
            currentPanel: this.detectCurrentPanel(),
            parentPanel: null,
            childPanels: new Set()
        };
        
        // 新架構：main_panel.html 是主面板，管理所有子iframe
        this.isMainPanel = this.detectCurrentPanel() === 'MAIN_PANEL';
        this.childPanelTypes = ['map', 'chat', 'echo', 'livestream', 'vn'];
        
        // === 消息類型定義 ===
        this.messageTypes = {
            // === 數據請求類 ===
            REQUEST_FULL_CHAT_DATA: 'REQUEST_FULL_CHAT_DATA',
            REQUEST_FULL_VN_DATA: 'REQUEST_FULL_VN_DATA', 
            REQUEST_FULL_ECHO_DATA: 'REQUEST_FULL_ECHO_DATA',
            REQUEST_FULL_LIVESTREAM_DATA: 'REQUEST_FULL_LIVESTREAM_DATA', // 🔥 新增
            REQUEST_PROCESSOR_CHECK: 'REQUEST_PROCESSOR_CHECK',
            
            // === 數據響應類 ===
            CHAT_DATA_RESPONSE: 'CHAT_DATA_RESPONSE',
            VN_DATA_RESPONSE: 'VN_DATA_RESPONSE',
            ECHO_DATA_RESPONSE: 'ECHO_DATA_RESPONSE',
            LIVESTREAM_DATA_RESPONSE: 'LIVESTREAM_DATA_RESPONSE', // 🔥 新增
            
            // === 面板控制類 ===
            PANEL_OPEN: 'PANEL_OPEN',
            PANEL_CLOSE: 'PANEL_CLOSE',
            PANEL_READY: 'PANEL_READY',
            CHAT_WINDOW_CHANGE: 'CHAT_WINDOW_CHANGE',
            
            // === 功能操作類 ===
            FORWARD_TO_PROCESSOR: 'FORWARD_TO_PROCESSOR',
            SEND_USER_MESSAGE: 'SEND_USER_MESSAGE',
            SEND_CHAT_COMMAND: 'SEND_CHAT_COMMAND',
            
            // === 摘要功能類 ===
            SUMMARY_REQUEST: 'SUMMARY_REQUEST',
            SUMMARY_EXPORT_REQUEST: 'SUMMARY_EXPORT_REQUEST',
            SUMMARY_COPY_REQUEST: 'SUMMARY_COPY_REQUEST',
            
            // === VN功能類 ===
            VN_CALL_START: 'VN_CALL_START',
            VN_CALL_END: 'VN_CALL_END',
            VN_STORY_INIT: 'VN_STORY_INIT',
            VN_FETCH_HISTORY_LIST: 'VN_FETCH_HISTORY_LIST',
            
            // === 🔥 直播間功能類 ===
            LIVESTREAM_EVENT: 'LIVESTREAM_EVENT',
            LIVESTREAM_MESSAGE: 'LIVESTREAM_MESSAGE',
            LIVESTREAM_UPDATE: 'LIVESTREAM_UPDATE',
            LIVESTREAM_PANEL_READY: 'LIVESTREAM_PANEL_READY',
            LIVESTREAM_IFRAME_READY: 'LIVESTREAM_IFRAME_READY',
            LIVESTREAM_SESSION_START: 'LIVESTREAM_SESSION_START',
            LIVESTREAM_SESSION_END: 'LIVESTREAM_SESSION_END',
            LIVESTREAM_DATA: 'LIVESTREAM_DATA',
            
            // === Echo功能類 ===
            ECHO_PANEL_READY: 'ECHO_PANEL_READY',
            
            // === 新聞功能類 ===
            NEWS_BROADCAST_DATA: 'NEWS_BROADCAST_DATA',
            NEWS_REQUEST_UPDATE: 'NEWS_REQUEST_UPDATE',
            NEWS_REQUEST_SCAN: 'NEWS_REQUEST_SCAN',
            NEWS_SCAN_COMPLETE: 'NEWS_SCAN_COMPLETE',
            
            STORY_END_DETECTED: 'STORY_END_DETECTED'
        };
        
        // 日誌系統
        this.logger = this.createLogger();
        
        // VN相關狀態
        this.vnState = {
            panelActive: false,
            currentStoryData: null,
            currentDialogueIdx: 0
        };
        
        // 新聞相關狀態
        this.newsState = {
            lastProcessedId: null,
            currentNewsData: []
        };
    }

    /**
     * 創建統一日誌系統
     */
    createLogger() {
        const prefix = '[統一通訊核心]';
        return {
            debug: (...args) => this.config.debugMode && console.log(`${prefix}[DEBUG]`, ...args),
            info: (...args) => this.config.debugMode && console.log(`${prefix}[INFO]`, ...args),
            warn: (...args) => console.warn(`${prefix}[WARN]`, ...args),
            error: (...args) => console.error(`${prefix}[ERROR]`, ...args),
            api: (...args) => this.config.debugMode && console.log(`${prefix}[API]`, ...args),
            perf: (label, startTime) => {
                if (this.config.debugMode) {
                    const duration = Date.now() - startTime;
                    console.log(`${prefix}[PERF] ${label}: ${duration}ms`);
                }
            }
        };
    }

    /**
     * 初始化統一通訊核心
     */
    async initialize() {
        if (this.isInitialized) return;

        try {
            this.logger.info('🚀 初始化統一通訊核心...', this.metadata);
            
            // 設置訊息監聽器
            this.setupUnifiedMessageListener();
            
            // 註冊所有訊息處理器
            this.registerAllHandlers();
            
            // 檢測面板層級關係
            this.detectPanelHierarchy();
            
            // 設置錯誤處理
            this.setupErrorHandler();
            
            // 初始化面板管理
            this.initializePanelManagement();
            
            this.isInitialized = true;
            this.logger.info('✅ 統一通訊核心初始化完成');
            
        } catch (error) {
            this.incrementCounter('errors');
            this.logger.error('❌ 統一通訊核心初始化失敗:', error);
            throw error;
        }
    }

    /**
     * 性能計數器增量
     */
    incrementCounter(counter) {
        if (this.performance.counters.hasOwnProperty(counter)) {
            this.performance.counters[counter]++;
        }
    }

    /**
     * 檢測當前面板類型
     */
    detectCurrentPanel() {
        const url = window.location.href;
        const path = window.location.pathname;
        
        if (path.includes('main_panel.html')) return 'MAIN_PANEL';
        if (path.includes('chat_panel.html')) return 'CHAT_PANEL';
        if (path.includes('echo_panel.html')) return 'ECHO_PANEL';
        if (path.includes('vn_panel.html') || path.includes('vn_story')) return 'VN_PANEL';
        if (path.includes('map-panel.html')) return 'MAP_PANEL';
        return 'UNKNOWN_PANEL';
    }

    /**
     * 檢測面板層級關係
     */
    detectPanelHierarchy() {
        try {
            // 檢測父面板
            if (window.parent && window.parent !== window) {
                try {
                    const parentUrl = window.parent.location.href;
                    if (parentUrl.includes('main_panel.html')) {
                        this.panelInfo.parentPanel = 'MAIN_PANEL';
                    } else if (parentUrl.includes('map-panel.html')) {
                        this.panelInfo.parentPanel = 'MAP_PANEL';
                    }
                } catch (e) {
                    // 跨域無法訪問
                }
            }
            
            // 檢測子面板
            const iframes = document.querySelectorAll('iframe');
            iframes.forEach(iframe => {
                try {
                    const iframeUrl = iframe.src;
                    if (iframeUrl.includes('chat_panel.html')) {
                        this.panelInfo.childPanels.add('CHAT_PANEL');
                    } else if (iframeUrl.includes('echo_panel.html')) {
                        this.panelInfo.childPanels.add('ECHO_PANEL');
                    } else if (iframeUrl.includes('vn_panel.html')) {
                        this.panelInfo.childPanels.add('VN_PANEL');
                    } else if (iframeUrl.includes('map-panel.html')) {
                        this.panelInfo.childPanels.add('MAP_PANEL');
                    } else if (iframeUrl.includes('livestream_panel.html')) {
                        this.panelInfo.childPanels.add('LIVESTREAM_PANEL');
                    }
                } catch (e) {
                    // 跨域iframe無法訪問
                }
            });
            
            this.logger.debug('📊 面板層級檢測完成:', this.panelInfo);
            
        } catch (error) {
            this.logger.warn('⚠️ 面板層級檢測失敗:', error);
        }
    }

    /**
     * 設置統一訊息監聽器
     */
    setupUnifiedMessageListener() {
        window.addEventListener('message', (event) => {
            try {
                this.handleIncomingMessage(event);
            } catch (error) {
                this.incrementCounter('errors');
                this.logger.error('❌ 處理接收訊息時出錯:', error);
            }
        });
        
        this.logger.info('👂 統一訊息監聽器已設置');
    }

    /**
     * 處理接收到的訊息
     */
    handleIncomingMessage(event) {
        const { data, source } = event;
        
        if (!data || !data.type) return;
        
        this.incrementCounter('messagesReceived');
        this.logger.debug(`📨 收到訊息: ${data.type}`, { source: source?.origin, data });
        
        // 新架構：主面板路由邏輯
        if (this.isMainPanel) {
            this.routeMessageToChildPanel(data, event);
            return;
        }
        
        // 查找對應的處理器
        const handler = this.messageHandlers.get(data.type);
        if (handler) {
            try {
                handler(data, event);
            } catch (error) {
                this.incrementCounter('errors');
                this.logger.error(`❌ 處理訊息 ${data.type} 時出錯:`, error);
            }
        } else {
            this.logger.debug(`⚠️ 未找到訊息處理器: ${data.type}`);
        }
    }
    
    /**
     * 主面板消息路由邏輯
     */
    routeMessageToChildPanel(data, event) {
        const { targetPanel, type } = data;
        
        if (!targetPanel) {
            this.logger.debug(`📨 主面板收到訊息: ${type}`);
            // 處理主面板自己的消息
            const handler = this.messageHandlers.get(type);
            if (handler) {
                try {
                    handler(data, event);
                } catch (error) {
                    this.incrementCounter('errors');
                    this.logger.error(`❌ 處理訊息 ${type} 時出錯:`, error);
                }
            }
            return;
        }
        
        // 路由到對應的子面板
        const iframeId = this.getIframeIdByPanelType(targetPanel);
        if (iframeId) {
            const iframe = document.getElementById(iframeId);
            if (iframe && iframe.contentWindow) {
                this.logger.debug(`📨 路由訊息到 ${targetPanel}: ${type}`);
                iframe.contentWindow.postMessage(data, '*');
            } else {
                this.logger.warn(`⚠️ 找不到目標iframe: ${iframeId}`);
            }
        } else {
            this.logger.warn(`⚠️ 未知的面板類型: ${targetPanel}`);
        }
    }
    
    /**
     * 根據面板類型獲取iframe ID
     */
    getIframeIdByPanelType(panelType) {
        const iframeMap = {
            'map': 'mapPanelIframe',
            'chat': 'chatPanelIframe',
            'echo': 'echoPanelIframe',
            'livestream': 'livestreamPanelIframe',
            'vn': 'vnPanelIframe'
        };
        return iframeMap[panelType];
    }

    /**
     * 註冊訊息處理器
     */
    registerMessageHandler(messageType, handler) {
        this.messageHandlers.set(messageType, handler);
        this.logger.debug(`📝 註冊訊息處理器: ${messageType}`);
    }

    /**
     * 註冊所有訊息處理器
     */
    registerAllHandlers() {
        // === 通用處理器 ===
        this.registerMessageHandler(this.messageTypes.FORWARD_TO_PROCESSOR, (data, event) => {
            this.logger.debug('🔄 處理轉發請求:', data);
            this.forwardToProcessor(data);
        });
        
        this.registerMessageHandler(this.messageTypes.PANEL_READY, (data, event) => {
            this.logger.info('✅ 面板就緒:', data);
            this.handlePanelReady(data);
        });

        // === Chat相關處理器 ===
        this.registerChatHandlers();
        
        // === VN相關處理器 ===
        this.registerVNHandlers();
        
        // === 新聞相關處理器 ===
        this.registerNewsHandlers();
        
        // === Echo相關處理器 ===
        this.registerEchoHandlers();
        
        this.logger.info('📝 所有訊息處理器註冊完成');
    }

    /**
     * 註冊Chat相關處理器
     */
    registerChatHandlers() {
        this.registerMessageHandler(this.messageTypes.REQUEST_FULL_CHAT_DATA, (data, event) => {
            this.incrementCounter('chatOperations');
            this.logger.debug('📊 處理Chat數據請求');
            if (this.panelInfo.currentPanel === 'MAP_PANEL') {
                this.forwardToProcessor(data);
            }
        });
        
        this.registerMessageHandler(this.messageTypes.CHAT_DATA_RESPONSE, (data, event) => {
            this.incrementCounter('chatOperations');
            this.logger.debug('📊 處理Chat數據響應');
            this.sendToChild('CHAT_PANEL', data);
        });
        
        this.registerMessageHandler(this.messageTypes.CHAT_WINDOW_CHANGE, (data, event) => {
            this.incrementCounter('chatOperations');
            this.logger.debug('🔄 Chat窗口狀態變更:', data.inChatRoom ? '聊天室' : '聊天列表');
            this.handleChatWindowChange(data);
        });
        
        this.registerMessageHandler(this.messageTypes.SEND_USER_MESSAGE, (data, event) => {
            this.incrementCounter('chatOperations');
            this.logger.api('💬 發送用戶消息:', data.message);
            this.handleSendUserMessage(data);
        });
        
        this.registerMessageHandler(this.messageTypes.SEND_CHAT_COMMAND, (data, event) => {
            this.incrementCounter('chatOperations');
            this.logger.api('⚡ 發送聊天命令:', data.command);
            this.handleSendChatCommand(data);
        });
    }

    /**
     * 註冊VN相關處理器
     */
    registerVNHandlers() {
        this.registerMessageHandler(this.messageTypes.VN_STORY_INIT, (data, event) => {
            this.incrementCounter('vnOperations');
            this.logger.debug('📖 VN故事初始化:', data.storyData);
            this.sendToChild('VN_PANEL', data);
        });
        
        this.registerMessageHandler(this.messageTypes.VN_FETCH_HISTORY_LIST, (data, event) => {
            this.incrementCounter('vnOperations');
            this.logger.debug('📚 VN歷史記錄請求');
            this.forwardToProcessor(data);
        });
        
        this.registerMessageHandler(this.messageTypes.VN_CALL_START, (data, event) => {
            this.incrementCounter('vnOperations');
            this.logger.debug('📞 VN通話開始');
            this.vnState.panelActive = true;
        });
        
        this.registerMessageHandler(this.messageTypes.VN_CALL_END, (data, event) => {
            this.incrementCounter('vnOperations');
            this.logger.debug('📞 VN通話結束');
            this.vnState.panelActive = false;
        });
        
        this.registerMessageHandler(this.messageTypes.STORY_END_DETECTED, (data, event) => {
            this.incrementCounter('vnOperations');
            this.logger.debug('📖 故事結束檢測');
            this.handleStoryEndDetected(data);
        });
    }

    /**
     * 註冊新聞相關處理器
     */
    registerNewsHandlers() {
        this.registerMessageHandler(this.messageTypes.NEWS_BROADCAST_DATA, (data, event) => {
            this.incrementCounter('newsOperations');
            this.logger.debug('📺 處理新聞廣播數據');
            this.handleNewsData(data);
        });
        
        this.registerMessageHandler(this.messageTypes.NEWS_REQUEST_UPDATE, (data, event) => {
            this.incrementCounter('newsOperations');
            this.logger.debug('🔄 新聞更新請求');
            this.handleNewsUpdateRequest(data);
        });
        
        this.registerMessageHandler(this.messageTypes.NEWS_REQUEST_SCAN, (data, event) => {
            this.incrementCounter('newsOperations');
            this.logger.debug('🔍 新聞掃描請求');
            this.forwardToProcessor(data);
        });
        
        this.registerMessageHandler(this.messageTypes.NEWS_SCAN_COMPLETE, (data, event) => {
            this.incrementCounter('newsOperations');
            this.logger.debug('✅ 新聞掃描完成');
            this.handleNewsScanComplete(data);
        });
    }

    /**
     * 註冊Echo相關處理器
     */
    registerEchoHandlers() {
        this.registerMessageHandler(this.messageTypes.ECHO_PANEL_READY, (data, event) => {
            this.logger.debug('🎵 Echo面板就緒');
            this.panelStates.echo.loaded = true;
        });
        
        this.registerMessageHandler(this.messageTypes.REQUEST_FULL_ECHO_DATA, (data, event) => {
            this.logger.debug('📊 處理Echo數據請求');
            if (this.panelInfo.currentPanel === 'MAP_PANEL') {
                this.forwardToProcessor(data);
            }
        });
        
        this.registerMessageHandler(this.messageTypes.REQUEST_FULL_LIVESTREAM_DATA, (data, event) => {
            this.logger.debug('📊 處理直播間數據請求');
            if (this.panelInfo.currentPanel === 'MAP_PANEL') {
                this.forwardToProcessor(data);
            }
        });
        
        this.registerMessageHandler(this.messageTypes.LIVESTREAM_DATA_RESPONSE, (data, event) => {
            this.logger.debug('📊 處理直播間數據響應');
            this.handleLivestreamData(data);
        });
        
        this.registerMessageHandler(this.messageTypes.LIVESTREAM_EVENT, (data, event) => {
            this.logger.debug('🎥 處理直播間事件');
            this.handleLivestreamEvent(data);
        });
    }

    /**
     * === 面板管理功能 ===
     */
    initializePanelManagement() {
        if (this.panelInfo.currentPanel === 'MAP_PANEL') {
            this.setupPanelControls();
        }
    }

    /**
     * 設置面板控制
     */
    setupPanelControls() {
        // Chat面板控制
        const chatNavButton = document.getElementById('chatNavButton');
        if (chatNavButton) {
            chatNavButton.addEventListener('click', () => this.openChatPanel());
            this.logger.debug('Chat導航按鈕已綁定');
        }
        
        // Echo面板控制
        const echoNavButton = document.getElementById('echoNavButton');
        if (echoNavButton) {
            echoNavButton.addEventListener('click', () => this.openEchoPanel());
            this.logger.debug('Echo導航按鈕已綁定');
        }
        
        // 直播間面板控制
        const livestreamNavButton = document.getElementById('livestreamNavButton');
        if (livestreamNavButton) {
            livestreamNavButton.addEventListener('click', () => this.openLivestreamPanel());
            this.logger.debug('直播間導航按鈕已綁定');
        }
        
        // VN面板控制（通過其他模塊觸發）
        this.logger.debug('面板控制設置完成');
    }

    /**
     * 打開Chat面板
     */
    openChatPanel() {
        this.incrementCounter('panelOperations');
        this.logger.info('📱 打開Chat面板');
        
        // 新架構：主面板控制邏輯
        if (this.isMainPanel) {
            this.openMainPanelModal('chatRoomModal');
            return;
        }
        
        const container = document.getElementById('chatPanelContainer');
        const iframe = document.getElementById('chatPanelIframe');
        
        if (!container || !iframe) {
            this.logger.error('找不到Chat面板元素');
            return;
        }
        
        // 關閉其他面板
        this.closeEchoPanel();
        this.closeLivestreamPanel();
        this.closeVNPanel();
        
        // 顯示容器
        container.classList.add('active');
        this.panelStates.chat.active = true;
        
        // 確保浮動關閉按鈕一開始就顯示
        this.toggleChatPanelCloseButton(true);
        
        // 🔥 新增：觸發聊天處理器啟動（類似直播間處理器）
        this.triggerChatProcessor();
        
        // 如果是第一次加載，設置iframe src
        if (!this.panelStates.chat.loaded) {
            iframe.src = '/MAP/chat/chat_panel.html';
            this.panelStates.chat.loaded = true;
            
            iframe.onload = () => {
                this.logger.debug('Chat iframe已加載完成，發送數據請求');
                setTimeout(() => {
                    this.sendToTop({ 
                        type: 'REQUEST_FULL_CHAT_DATA',
                        source: 'MAP_PANEL_CHAT_OPEN'
                    });
                }, 100);
            };
        } else {
            // 重新請求數據以確保同步
            setTimeout(() => {
                this.sendToTop({ 
                    type: 'REQUEST_FULL_CHAT_DATA',
                    source: 'MAP_PANEL_CHAT_REOPEN'
                });
            }, 100);
        }
    }
    
    /**
     * 主面板模態窗口控制
     */
    openMainPanelModal(modalId) {
        this.logger.info(`📱 打開主面板模態窗口: ${modalId}`);
        
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('show');
        }
    }
    
    /**
     * 🔥 新增：面板開啟通知
     */
    notifyPanelOpened(panelType) {
        this.logger.info(`📱 面板開啟通知: ${panelType}`);
        
        // 更新面板狀態
        if (this.panelStates[panelType]) {
            this.panelStates[panelType].active = true;
        }
        
        // 發送面板開啟事件
        this.sendToTop({
            type: 'PANEL_OPEN',
            panel: panelType,
            timestamp: Date.now(),
            source: 'MAIN_PANEL'
        });
        
        // 觸發相應的處理器
        switch (panelType) {
            case 'echo':
                this.triggerEchoProcessor();
                break;
            case 'chat':
                this.triggerChatProcessor();
                break;
            case 'livestream':
                this.triggerLivestreamProcessor();
                break;
            case 'vn':
                this.triggerVNProcessor();
                break;
            default:
                this.logger.debug(`未找到面板類型 ${panelType} 的處理器觸發方法`);
        }
    }
    
    /**
     * 🔥 新增：觸發聊天處理器啟動
     */
    triggerChatProcessor() {
        this.logger.info('🔥 觸發聊天處理器啟動');
        
        try {
            // 🔥 使用MAP面板的sendMessageToChatProcessor函數
            if (window.sendMessageToChatProcessor) {
                this.logger.debug('🔥 使用MAP面板的sendMessageToChatProcessor函數');
                const success = window.sendMessageToChatProcessor({
                    type: 'CHAT_PROCESSOR_START',
                    source: 'MAP_PANEL_CHAT_OPEN',
                    timestamp: Date.now()
                });
                
                if (success) {
                    this.logger.debug('🔥 聊天處理器觸發成功');
                    return;
                }
            }
            
            // 備用方法1：直接調用頂級窗口的聊天處理器
            if (window.top && window.top.ChatProcessor) {
                this.logger.debug('🔥 通過ChatProcessor對象觸發');
                if (typeof window.top.ChatProcessor.initializeProcessor === 'function') {
                    window.top.ChatProcessor.initializeProcessor();
                    return;
                }
            }
            
            // 備用方法2：直接調用處理器函數（如果存在）
            if (window.top && window.top.scanAndProcessAllChatLines) {
                this.logger.debug('🔥 直接調用scanAndProcessAllChatLines');
                window.top.scanAndProcessAllChatLines();
                return;
            }
            
            // 備用方法3：使用postMessage觸發
            this.logger.debug('🔥 使用postMessage觸發聊天處理器');
            this.sendToTop({
                type: 'CHAT_PROCESSOR_START',
                source: 'MAP_PANEL_CHAT_OPEN',
                timestamp: Date.now()
            });
            
        } catch (error) {
            this.logger.error('🔥 觸發聊天處理器失敗:', error);
        }
    }
    
    /**
     * 🔥 新增：觸發Echo處理器啟動
     */
    triggerEchoProcessor() {
        this.logger.info('🔥 觸發Echo處理器啟動');
        
        try {
            // 使用postMessage觸發
            this.sendToTop({
                type: 'ECHO_PROCESSOR_START',
                source: 'MAIN_PANEL_ECHO_OPEN',
                timestamp: Date.now()
            });
            
            // 備用方法：直接調用處理器函數（如果存在）
            if (window.top && window.top.scanAndProcessAllEchoLines) {
                this.logger.debug('🔥 直接調用scanAndProcessAllEchoLines');
                window.top.scanAndProcessAllEchoLines();
            }
            
        } catch (error) {
            this.logger.error('🔥 觸發Echo處理器失敗:', error);
        }
    }
    
    /**
     * 🔥 新增：觸發VN處理器啟動
     */
    triggerVNProcessor() {
        this.logger.info('🔥 觸發VN處理器啟動');
        
        try {
            // 使用postMessage觸發
            this.sendToTop({
                type: 'VN_PROCESSOR_START',
                source: 'MAIN_PANEL_VN_OPEN',
                timestamp: Date.now()
            });
            
            // 備用方法：直接調用處理器函數（如果存在）
            if (window.top && window.top.scanAndProcessAllVNLines) {
                this.logger.debug('🔥 直接調用scanAndProcessAllVNLines');
                window.top.scanAndProcessAllVNLines();
            }
            
        } catch (error) {
            this.logger.error('🔥 觸發VN處理器失敗:', error);
        }
    }
    
    /**
     * 🔥 新增：觸發Livestream處理器啟動
     */
    triggerLivestreamProcessor() {
        this.logger.info('🔥 觸發Livestream處理器啟動');
        
        try {
            // 使用postMessage觸發
            this.sendToTop({
                type: 'LIVESTREAM_PROCESSOR_START',
                source: 'MAIN_PANEL_LIVESTREAM_OPEN',
                timestamp: Date.now()
            });
            
            // 備用方法：直接調用處理器函數（如果存在）
            if (window.top && window.top.scanAndProcessAllLivestreamLines) {
                this.logger.debug('🔥 直接調用scanAndProcessAllLivestreamLines');
                window.top.scanAndProcessAllLivestreamLines();
            }
            
        } catch (error) {
            this.logger.error('🔥 觸發Livestream處理器失敗:', error);
        }
    }

    /**
     * 關閉Chat面板
     */
    closeChatPanel() {
        this.incrementCounter('panelOperations');
        this.logger.info('📱 關閉Chat面板');
        
        const container = document.getElementById('chatPanelContainer');
        if (container) {
            container.classList.remove('active');
            this.panelStates.chat.active = false;
            this.resetChatPanelCloseButton();
        }
    }

    /**
     * 智能控制Chat面板關閉按鈕顯示
     */
    toggleChatPanelCloseButton(showInChatList = true) {
        const closeButton = document.querySelector('#chatPanelContainer .app-panel-close-floating');
        if (closeButton) {
            this.logger.debug('切換Chat面板關閉按鈕:', showInChatList ? '顯示' : '隱藏');
            if (showInChatList) {
                closeButton.classList.add('show-in-chat-list');
            } else {
                closeButton.classList.remove('show-in-chat-list');
            }
        }
    }

    /**
     * 重置Chat面板關閉按鈕狀態
     */
    resetChatPanelCloseButton() {
        this.toggleChatPanelCloseButton(true);
    }

    /**
     * 打開Echo面板
     */
    openEchoPanel() {
        this.incrementCounter('panelOperations');
        this.logger.info('🎵 打開Echo面板');
        
        // 新架構：主面板控制邏輯
        if (this.isMainPanel) {
            this.openMainPanelModal('cpActivityModal');
            return;
        }
        
        const container = document.getElementById('echoPanelContainer');
        const iframe = document.getElementById('echoPanelIframe');
        
        if (!container || !iframe) {
            this.logger.error('找不到Echo面板元素');
            return;
        }
        
        // 關閉其他面板
        this.closeChatPanel();
        this.closeLivestreamPanel();
        this.closeVNPanel();
        
        // 顯示容器
        container.classList.add('active');
        this.panelStates.echo.active = true;
        
        this.toggleEchoPanelCloseButton(true);
        
        if (!this.panelStates.echo.loaded) {
            iframe.src = '/MAP/echo/echo_panel.html';
            this.panelStates.echo.loaded = true;
            
            iframe.onload = () => {
                this.logger.debug('Echo iframe已加載完成');
            };
        }
    }

    /**
     * 關閉Echo面板
     */
    closeEchoPanel() {
        this.incrementCounter('panelOperations');
        this.logger.info('🎵 關閉Echo面板');
        
        const container = document.getElementById('echoPanelContainer');
        if (container) {
            container.classList.remove('active');
            this.panelStates.echo.active = false;
            this.resetEchoPanelCloseButton();
        }
    }

    /**
     * 智能控制Echo面板關閉按鈕顯示
     */
    toggleEchoPanelCloseButton(showInEchoList = true) {
        const closeButton = document.querySelector('#echoPanelContainer .app-panel-close-floating');
        if (closeButton) {
            if (showInEchoList) {
                closeButton.classList.add('show-in-chat-list');
            } else {
                closeButton.classList.remove('show-in-chat-list');
            }
        }
    }

    /**
     * 重置Echo面板關閉按鈕狀態
     */
    resetEchoPanelCloseButton() {
        this.toggleEchoPanelCloseButton(true);
    }

    /**
     * 打開直播間面板
     */
    openLivestreamPanel() {
        this.incrementCounter('panelOperations');
        this.logger.info('🎥 打開直播間面板');
        
        // 新架構：主面板控制邏輯
        if (this.isMainPanel) {
            this.openMainPanelModal('liveRoomModal');
            return;
        }
        
        const container = document.getElementById('livestreamPanelContainer');
        const iframe = document.getElementById('livestreamPanelIframe');
        
        if (!container || !iframe) {
            this.logger.error('找不到直播間面板元素');
            return;
        }
        
        // 關閉其他面板
        this.closeChatPanel();
        this.closeEchoPanel();
        this.closeLivestreamPanel();
        this.closeVNPanel();
        
        // 顯示容器
        container.classList.add('active');
        this.panelStates.livestream.active = true;
        
        this.toggleLivestreamPanelCloseButton(true);
        
        if (!this.panelStates.livestream.loaded) {
            iframe.src = '/MAP/livestream/livestream_panel.html';
            this.panelStates.livestream.loaded = true;
            
            iframe.onload = () => {
                this.logger.debug('直播間 iframe已加載完成');
                setTimeout(() => {
                    this.sendToTop({ 
                        type: 'REQUEST_FULL_LIVESTREAM_DATA',
                        source: 'MAP_PANEL_LIVESTREAM_OPEN'
                    });
                }, 100);
            };
        } else {
            // 重新請求數據以確保同步
            setTimeout(() => {
                this.sendToTop({ 
                    type: 'REQUEST_FULL_LIVESTREAM_DATA',
                    source: 'MAP_PANEL_LIVESTREAM_REOPEN'
                });
            }, 100);
        }
    }

    /**
     * 關閉直播間面板
     */
    closeLivestreamPanel() {
        this.incrementCounter('panelOperations');
        this.logger.info('🎥 關閉直播間面板');
        
        const container = document.getElementById('livestreamPanelContainer');
        if (container) {
            container.classList.remove('active');
            this.panelStates.livestream.active = false;
            this.resetLivestreamPanelCloseButton();
        }
    }

    /**
     * 智能控制直播間面板關閉按鈕顯示
     */
    toggleLivestreamPanelCloseButton(showInLivestreamList = true) {
        const closeButton = document.querySelector('#livestreamPanelContainer .app-panel-close-floating');
        if (closeButton) {
            if (showInLivestreamList) {
                closeButton.classList.add('show-in-chat-list');
            } else {
                closeButton.classList.remove('show-in-chat-list');
            }
        }
    }

    /**
     * 重置直播間面板關閉按鈕狀態
     */
    resetLivestreamPanelCloseButton() {
        this.toggleLivestreamPanelCloseButton(true);
    }

    /**
     * 打開VN面板
     */
    openVNPanel() {
        this.incrementCounter('panelOperations');
        this.incrementCounter('vnOperations');
        this.logger.info('📖 打開VN面板');
        
        // 新架構：主面板控制邏輯
        if (this.isMainPanel) {
            // VN面板在新功能面板中，需要特殊處理
            this.logger.info('🎭 主面板VN面板已在新功能面板中');
            return;
        }
        
        const container = document.getElementById('vnPanelContainer');
        const iframe = document.getElementById('vnPanelIframe');
        
        if (!container || !iframe) {
            this.logger.error('找不到VN面板元素');
            return;
        }
        
        // 關閉其他面板
        this.closeChatPanel();
        this.closeEchoPanel();
        
        // 顯示容器
        container.classList.add('active');
        this.panelStates.vn.active = true;
        this.vnState.panelActive = true;
        
        // 🚀 初始化時不顯示關閉鍵，等待VN面板通知
        this.toggleVNPanelCloseButton(false);
        
        if (!this.panelStates.vn.loaded) {
            iframe.src = '/MAP/vn_story_1/vn_panel.html';
            this.panelStates.vn.loaded = true;
            
            iframe.onload = () => {
                this.logger.debug('VN iframe已加載完成');
            };
        } else {
            // 🚀 如果iframe已經加載過，發送重新激活消息
            setTimeout(() => {
                try {
                    if (iframe.contentWindow) {
                        iframe.contentWindow.postMessage({
                            type: 'VN_PANEL_REACTIVATE',
                            timestamp: Date.now()
                        }, '*');
                        this.logger.debug('已發送VN面板重新激活消息');
                    }
                } catch (error) {
                    this.logger.error('發送VN面板重新激活消息失敗:', error);
                }
            }, 100);
        }
    }

    /**
     * 關閉VN面板
     */
    closeVNPanel() {
        this.incrementCounter('panelOperations');
        this.incrementCounter('vnOperations');
        this.logger.info('📖 關閉VN面板');
        
        const container = document.getElementById('vnPanelContainer');
        if (container) {
            // 🚀 在關閉VN面板前，先停止iframe內的BGM
            const vnIframe = container.querySelector('#vnPanelIframe');
            if (vnIframe && vnIframe.contentWindow) {
                try {
                    // 直接調用iframe內的BGM停止函數
                    if (vnIframe.contentWindow.window.VNFeatures?.forceStopBGM) {
                        vnIframe.contentWindow.window.VNFeatures.forceStopBGM();
                        this.logger.debug('已停止VN面板BGM');
                    }
                    if (vnIframe.contentWindow.window.VNFeatures?.stopAllSounds) {
                        vnIframe.contentWindow.window.VNFeatures.stopAllSounds();
                        this.logger.debug('已停止VN面板所有音效');
                    }
                } catch (error) {
                    this.logger.error('停止VN面板BGM失敗:', error);
                }
            }
            
            container.classList.remove('active');
            this.panelStates.vn.active = false;
            this.vnState.panelActive = false;
            this.resetVNPanelCloseButton();
        }
    }

    /**
     * 智能控制VN面板關閉按鈕顯示
     */
    toggleVNPanelCloseButton(showInVNList = true) {
        const closeButton = document.querySelector('#vnPanelContainer .app-panel-close-floating');
        if (closeButton) {
            this.logger.debug('切換VN面板關閉按鈕:', showInVNList ? '顯示' : '隱藏');
            if (showInVNList) {
                closeButton.classList.add('show-in-chat-list');
            } else {
                closeButton.classList.remove('show-in-chat-list');
            }
        }
    }

    /**
     * 重置VN面板關閉按鈕狀態
     */
    resetVNPanelCloseButton() {
        this.toggleVNPanelCloseButton(true);
    }

    /**
     * === 通訊功能 ===
     */

    /**
     * 發送訊息到父面板
     */
    sendToParent(messageData) {
        try {
            if (window.parent && window.parent !== window) {
                const message = this.createMessage(messageData);
                window.parent.postMessage(message, '*');
                this.incrementCounter('messagesSent');
                this.logger.debug(`📤 發送到父面板: ${messageData.type}`);
                return true;
            }
            return false;
        } catch (error) {
            this.incrementCounter('errors');
            this.logger.error('❌ 發送到父面板失敗:', error);
            return false;
        }
    }

    /**
     * 發送訊息到子面板
     */
    sendToChild(panelType, messageData) {
        try {
            const iframe = this.findChildIframe(panelType);
            if (iframe && iframe.contentWindow) {
                const message = this.createMessage(messageData);
                iframe.contentWindow.postMessage(message, '*');
                this.incrementCounter('messagesSent');
                this.logger.debug(`📤 發送到子面板 ${panelType}: ${messageData.type}`);
                return true;
            }
            return false;
        } catch (error) {
            this.incrementCounter('errors');
            this.logger.error(`❌ 發送到子面板 ${panelType} 失敗:`, error);
            return false;
        }
    }

    /**
     * 發送訊息到頂層
     */
    sendToTop(messageData) {
        try {
            if (window.top && window.top !== window) {
                const message = this.createMessage(messageData);
                window.top.postMessage(message, '*');
                this.incrementCounter('messagesSent');
                this.logger.debug(`📤 發送到頂層: ${messageData.type}`);
                return true;
            } else if (window.parent && window.parent !== window) {
                // 備用方案：發送到父面板
                return this.sendToParent(messageData);
            }
            return false;
        } catch (error) {
            this.incrementCounter('errors');
            this.logger.error('❌ 發送到頂層失敗:', error);
            return false;
        }
    }

    /**
     * 廣播訊息到所有相關面板
     */
    broadcast(messageData, targetPanels = null) {
        const panels = targetPanels || ['CHAT_PANEL', 'VN_PANEL', 'ECHO_PANEL'];
        let successCount = 0;
        
        panels.forEach(panelType => {
            if (this.sendToChild(panelType, messageData)) {
                successCount++;
            }
        });
        
        this.logger.debug(`📢 廣播完成: ${successCount}/${panels.length} 個面板`);
        return successCount;
    }

    /**
     * 創建標準訊息格式
     */
    createMessage(messageData) {
        return {
            ...messageData,
            source: this.panelInfo.currentPanel,
            timestamp: Date.now(),
            messageId: this.generateMessageId()
        };
    }

    /**
     * 生成唯一訊息ID
     */
    generateMessageId() {
        return `${this.panelInfo.currentPanel}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 查找子面板iframe
     */
    findChildIframe(panelType) {
        const iframes = document.querySelectorAll('iframe');
        for (const iframe of iframes) {
            try {
                const src = iframe.src || '';
                if (panelType === 'CHAT_PANEL' && src.includes('chat_panel.html')) {
                    return iframe;
                } else if (panelType === 'ECHO_PANEL' && src.includes('echo_panel.html')) {
                    return iframe;
                } else if (panelType === 'VN_PANEL' && (src.includes('vn_panel.html') || src.includes('vn_story'))) {
                    return iframe;
                }
            } catch (e) {
                // 跨域iframe無法訪問
            }
        }
        return null;
    }

    /**
     * === 業務邏輯處理器 ===
     */

    /**
     * 轉發到處理器
     */
    forwardToProcessor(data) {
        this.logger.debug('🔄 轉發到處理器:', data);
        this.sendToTop(data);
    }

    /**
     * 處理面板就緒
     */
    handlePanelReady(data) {
        this.logger.info('✅ 面板就緒處理:', data);
        // 可以添加面板就緒後的初始化邏輯
    }

    /**
     * 處理Chat窗口變更
     */
    handleChatWindowChange(data) {
        const isInChatRoom = data.inChatRoom;
        this.logger.debug('🔄 Chat窗口切換:', isInChatRoom ? '聊天室' : '聊天列表');
        
        // 只在聊天列表時顯示關閉按鈕，在聊天室時隱藏
        this.toggleChatPanelCloseButton(!isInChatRoom);
    }

    /**
     * 處理發送用戶消息
     */
    handleSendUserMessage(data) {
        try {
            // 直接操作DOM發送消息
            if (window.parent && window.parent.document) {
                const stInput = window.parent.document.querySelector('#send_textarea');
                const sendButton = window.parent.document.querySelector('#send_but');
                
                if (stInput && sendButton) {
                    stInput.value = data.message;
                    stInput.dispatchEvent(new Event('input', { bubbles: true }));
                    setTimeout(() => sendButton.click(), 200);
                    this.logger.api('💬 用戶消息已發送:', data.message);
                } else {
                    this.logger.error('找不到聊天輸入元素');
                }
            }
        } catch (error) {
            this.incrementCounter('errors');
            this.logger.error('發送用戶消息失敗:', error);
        }
    }

    /**
     * 處理發送聊天命令
     */
    async handleSendChatCommand(data) {
        try {
            const officialAPI = this.getOfficialAPI();
            
            // 優先使用官方API
            if (officialAPI.TavernHelper?.triggerSlash) {
                await officialAPI.TavernHelper.triggerSlash(data.command);
                this.logger.api('⚡ 命令已通過官方API發送:', data.command);
                return true;
            }
            
            // 備用方案：模擬輸入
            if (window.parent && window.parent.document) {
                const stInput = window.parent.document.querySelector('#send_textarea');
                const sendButton = window.parent.document.querySelector('#send_but');
                
                if (stInput && sendButton) {
                    stInput.value = data.command;
                    stInput.dispatchEvent(new Event('input', { bubbles: true }));
                    setTimeout(() => sendButton.click(), 200);
                    this.logger.api('⚡ 命令已通過模擬輸入發送:', data.command);
                    return true;
                }
            }
            
            this.logger.error('無法發送聊天命令，缺少父窗口和官方API');
            return false;
            
        } catch (error) {
            this.incrementCounter('errors');
            this.logger.error('發送聊天命令失敗:', error);
            return false;
        }
    }

    /**
     * 處理故事結束檢測
     */
    handleStoryEndDetected(data) {
        this.logger.debug('📖 故事結束檢測:', data);
        // 可以添加故事結束後的處理邏輯
    }

    /**
     * 處理新聞數據
     */
    handleNewsData(eventData) {
        const perfStart = Date.now();
        this.incrementCounter('newsOperations');
        
        try {
            const messageId = eventData.messageId;
            
            this.logger.debug('📺 處理新聞數據', { 
                messageId, 
                itemCount: eventData.data?.items?.length || 0 
            });
            
            if (window.MapNews && typeof window.MapNews.updateNewsData === 'function') {
                window.MapNews.updateNewsData(eventData.data.items);
                this.logger.info('📺 新聞數據已更新', { 
                    itemCount: eventData.data.items.length,
                    messageId
                });
                
                if (messageId) {
                    this.newsState.lastProcessedId = messageId;
                }
                
                this.showNotification(`📺 新聞已更新 (${eventData.data.items.length}條)`);
            } else {
                this.logger.warn('MapNews模塊不可用，無法更新新聞數據');
            }
            
            this.logger.perf('新聞數據處理', perfStart);
        } catch (error) {
            this.incrementCounter('errors');
            this.logger.error('處理新聞數據失敗:', error);
        }
    }

    /**
     * 處理新聞更新請求
     */
    handleNewsUpdateRequest(eventData) {
        const perfStart = Date.now();
        this.incrementCounter('newsOperations');
        
        try {
            this.logger.info('🔄 收到新聞更新請求');
            
            this.sendToTop({
                type: 'NEWS_REQUEST_SCAN',
                source: 'news_utils',
                timestamp: Date.now()
            });
            
            this.logger.api('📤 新聞掃描請求已發送');
            this.logger.perf('新聞更新請求處理', perfStart);
        } catch (error) {
            this.incrementCounter('errors');
            this.logger.error('處理新聞更新請求失敗:', error);
        }
    }

    /**
     * 處理新聞掃描完成
     */
    handleNewsScanComplete(eventData) {
        try {
            this.logger.info('✅ 新聞掃描完成', { found: eventData.found });
            
            if (eventData.found) {
                this.showNotification('✅ 新聞掃描完成，找到新內容');
            } else {
                this.showNotification('ℹ️ 新聞掃描完成，暫無新內容');
            }
        } catch (error) {
            this.incrementCounter('errors');
            this.logger.error('處理新聞掃描完成失敗:', error);
        }
    }

    /**
     * === 工具函數 ===
     */

    /**
     * 獲取酒館官方API
     */
    getOfficialAPI() {
        const parentTH = window.parent?.TavernHelper;
        const localTH = window.TavernHelper;
        
        const api = {
            TavernHelper: parentTH || localTH || null
        };
        
        this.logger.debug('API檢測結果', {
            parentTavernHelper: !!parentTH,
            localTavernHelper: !!localTH,
            triggerSlash: !!(api.TavernHelper?.triggerSlash)
        });
        
        return api;
    }

    /**
     * 顯示通知
     */
    showNotification(message, duration = 3000) {
        try {
            const notification = document.getElementById('notification');
            if (!notification) {
                this.logger.warn('找不到通知元素');
                return;
            }
            
            notification.textContent = message;
            notification.classList.add('show');
            
            setTimeout(() => {
                notification.classList.remove('show');
            }, duration);
            
            this.logger.debug('📢 通知已顯示:', message);
        } catch (error) {
            this.incrementCounter('errors');
            this.logger.error('顯示通知失敗:', error);
        }
    }

    /**
     * 設置錯誤處理
     */
    setupErrorHandler() {
        window.addEventListener('error', (event) => {
            this.incrementCounter('errors');
            this.logger.error('❌ 全局錯誤:', event.error);
        });
        
        window.addEventListener('unhandledrejection', (event) => {
            this.incrementCounter('errors');
            this.logger.error('❌ 未處理的Promise拒絕:', event.reason);
        });
    }

    /**
     * 處理直播間數據
     */
    handleLivestreamData(data) {
        this.incrementCounter('livestreamOperations');
        this.logger.info('🎥 處理直播間數據');
        
        try {
            // 轉發數據到直播間面板
            const livestreamIframe = document.getElementById('livestreamPanelIframe');
            if (livestreamIframe && livestreamIframe.contentWindow) {
                livestreamIframe.contentWindow.postMessage({
                    type: 'LIVESTREAM_DATA',
                    data: data,
                    source: 'COMMUNICATION_MANAGER'
                }, '*');
                this.logger.debug('直播間數據已轉發到面板', data);
            } else {
                this.logger.warn('直播間面板iframe未找到或未準備好');
            }
        } catch (error) {
            this.incrementCounter('errors');
            this.logger.error('處理直播間數據失敗:', error);
        }
    }

    /**
     * 處理直播間事件
     */
    handleLivestreamEvent(data) {
        this.incrementCounter('livestreamOperations');
        this.logger.info('🎥 處理直播間事件');
        
        try {
            // 轉發事件到直播間面板
            const livestreamIframe = document.getElementById('livestreamPanelIframe');
            if (livestreamIframe && livestreamIframe.contentWindow) {
                livestreamIframe.contentWindow.postMessage({
                    type: 'LIVESTREAM_EVENT',
                    data: data,
                    source: 'COMMUNICATION_MANAGER'
                }, '*');
                this.logger.debug('直播間事件已轉發到面板', data);
            } else {
                this.logger.warn('直播間面板iframe未找到或未準備好');
            }
        } catch (error) {
            this.incrementCounter('errors');
            this.logger.error('處理直播間事件失敗:', error);
        }
    }

    /**
     * 獲取性能指標
     */
    getPerformanceMetrics() {
        return {
            uptime: Date.now() - this.performance.startTime,
            ...this.performance.counters,
            panelStates: this.panelStates,
            vnState: this.vnState,
            newsState: this.newsState,
            panelInfo: this.panelInfo,
            isInitialized: this.isInitialized
        };
    }

    /**
     * 重置性能指標
     */
    resetPerformanceMetrics() {
        this.performance.counters = {
            messagesSent: 0,
            messagesReceived: 0,
            errors: 0,
            retries: 0,
            panelOperations: 0,
            newsOperations: 0,
            vnOperations: 0,
            chatOperations: 0,
            livestreamOperations: 0
        };
        this.performance.startTime = Date.now();
        this.logger.info('📊 性能指標已重置');
    }

    /**
     * 啟用調試模式
     */
    enableDebugMode() {
        this.config.debugMode = true;
        this.logger.info('🔍 調試模式已啟用');
    }

    /**
     * 禁用調試模式
     */
    disableDebugMode() {
        this.config.debugMode = false;
        this.logger.info('🔇 調試模式已禁用');
    }

    /**
     * 獲取狀態信息
     */
    getStatus() {
        return {
            metadata: this.metadata,
            initialized: this.isInitialized,
            timestamp: Date.now(),
            performance: this.getPerformanceMetrics(),
            config: this.config,
            panelStates: this.panelStates,
            vnState: this.vnState,
            newsState: this.newsState
        };
    }

    /**
     * 銷毀通訊核心
     */
    destroy() {
        try {
            this.logger.info('💥 統一通訊核心正在銷毀');
            this.isInitialized = false;
            this.messageHandlers.clear();
            this.retryQueue.clear();
            this.logger.info('✅ 統一通訊核心銷毀完成');
        } catch (error) {
            this.logger.error('❌ 統一通訊核心銷毀失敗:', error);
        }
    }
}

// ===============================
// === 全局實例和API暴露 ===
// ===============================

// 創建全局實例
const UnifiedCommCore = new UnifiedCommunicationCore();

// === 暴露主要API ===
window.UnifiedCommCore = UnifiedCommCore;

// === 向後兼容：暴露舊的API ===
window.CommunicationManager = {
    // 基本功能
    initialize: () => UnifiedCommCore.initialize(),
    isInitialized: () => UnifiedCommCore.isInitialized,
    
    // 消息處理
    registerMessageHandler: (type, handler) => UnifiedCommCore.registerMessageHandler(type, handler),
    sendToParent: (data) => UnifiedCommCore.sendToParent(data),
    sendToChild: (panelType, data) => UnifiedCommCore.sendToChild(panelType, data),
    sendToTop: (data) => UnifiedCommCore.sendToTop(data),
    broadcast: (data, panels) => UnifiedCommCore.broadcast(data, panels),
    
    // 狀態查詢
    getPerformanceMetrics: () => UnifiedCommCore.getPerformanceMetrics(),
    getStatus: () => UnifiedCommCore.getStatus(),
    
    // 配置
    enableDebugMode: () => UnifiedCommCore.enableDebugMode(),
    disableDebugMode: () => UnifiedCommCore.disableDebugMode(),
    
    // 實例引用
    instance: UnifiedCommCore
};

// === VN相關API ===
window.MapVN = {
    init: () => UnifiedCommCore.initialize(),
    showVNPanel: (storyData) => UnifiedCommCore.openVNPanel(),
    hideVNPanel: () => UnifiedCommCore.closeVNPanel(),
    getCurrentStoryData: () => UnifiedCommCore.vnState.currentStoryData,
    isPanelActive: () => UnifiedCommCore.vnState.panelActive
};

window.VNCore = {
    requestVNHistory: () => {
        UnifiedCommCore.sendToTop({
            type: 'VN_FETCH_HISTORY_LIST',
            source: 'VN_PANEL_MOBILE_HISTORY_BUTTON',
            timestamp: Date.now()
        });
    },
    currentDialogueIdx: 0,
    getCurrentStoryData: () => UnifiedCommCore.vnState.currentStoryData,
    isPanelActive: () => UnifiedCommCore.vnState.panelActive
};

// === 新聞相關API ===
window.NewsUtils = {
    init: () => UnifiedCommCore.initialize(),
    isInitialized: () => UnifiedCommCore.isInitialized,
    sendNewsCommandToChat: (command) => UnifiedCommCore.handleSendChatCommand({ command }),
    requestNewsUpdate: () => UnifiedCommCore.handleNewsUpdateRequest({}),
    showNewsNotification: (message, duration) => UnifiedCommCore.showNotification(message, duration),
    handleNewsData: (eventData) => UnifiedCommCore.handleNewsData(eventData),
    getStatus: () => UnifiedCommCore.getStatus(),
    getPerformanceStats: () => UnifiedCommCore.getPerformanceMetrics(),
    
    // 新聞解析功能
    parseNewsBlock: function(content) {
        const newsItems = [];
        
        const newsBlockMatch = content.match(/<news>[\s\S]*?<\/news>/i);
        if (!newsBlockMatch) return newsItems;
        
        const newsBlock = newsBlockMatch[0];
        if (!newsBlock.includes('[新聞播報]:')) return newsItems;
        
        const newsSectionRaw = newsBlock.split('[新聞播報]:')[1];
        if (!newsSectionRaw) return newsItems;
        
        const newsSection = newsSectionRaw.replace(/<\/news>\s*$/i, '').trim();
        
        const newsRegex = /【([^】]+)】([\s\S]*?)(?=【[^】]+】|$)/g;
        let match;
        let matchCount = 0;
        
        while ((match = newsRegex.exec(newsSection)) !== null) {
            matchCount++;
            const category = match[1].trim();
            let newsContent = match[2].trim();
            
            newsContent = newsContent.replace(/<\/?news>/gi, '').trim();
            newsContent = newsContent.replace(/\s+$/, '');
            
            if (category && newsContent) {
                newsItems.push({
                    category: category,
                    content: newsContent,
                    timestamp: Date.now(),
                    id: `news_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
                });
            }
            
            if (matchCount > 20) break;
        }
        
        return newsItems;
    }
};

    // === 面板控制函數（向後兼容） ===
    window.openChatPanel = () => UnifiedCommCore.openChatPanel();
    window.closeChatPanel = () => UnifiedCommCore.closeChatPanel();
    window.openEchoPanel = () => UnifiedCommCore.openEchoPanel();
    window.closeEchoPanel = () => UnifiedCommCore.closeEchoPanel();
    window.openLivestreamPanel = () => UnifiedCommCore.openLivestreamPanel();
    window.closeLivestreamPanel = () => UnifiedCommCore.closeLivestreamPanel();
    window.openVNPanel = () => UnifiedCommCore.openVNPanel();
    window.closeVNPanel = () => UnifiedCommCore.closeVNPanel();
    
    // 🔥 新增：面板開啟通知函數
    window.notifyPanelOpened = (panelType) => {
        if (UnifiedCommCore && typeof UnifiedCommCore.notifyPanelOpened === 'function') {
            UnifiedCommCore.notifyPanelOpened(panelType);
        } else {
            console.warn('[統一通訊核心] notifyPanelOpened 函數未實現');
        }
    };

// === 通訊處理函數（向後兼容） ===
window.handleChatMessage = (event) => UnifiedCommCore.handleIncomingMessage(event);

// ===============================
// === 自動初始化 ===
// ===============================

// 文檔準備就緒時自動初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        UnifiedCommCore.initialize().catch(error => {
            console.error('統一通訊核心初始化失敗:', error);
        });
    });
} else {
    UnifiedCommCore.initialize().catch(error => {
        console.error('統一通訊核心初始化失敗:', error);
    });
}

// 導出給其他模塊使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UnifiedCommunicationCore;
}

// 日誌輸出
console.log('[統一通訊核心] 模塊已載入', UnifiedCommCore.metadata);