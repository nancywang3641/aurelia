/**
 * 主面板內容處理器 - v1.4 (官方API适配版)
 * 腳本名稱: 腳本-主面板內容處理器
 * 適配格式: Scene status Schedule
 * 架構：酒館AI → Main面板（主iframe）
 * 
 * 支持格式：
 * [Area|AREA_D_DAY]
 * [Scene|2025-06-26|08:15|維斯頓豪宅_黎昂臥室|PROMPT]
 * [Main_role|用戶名|名聲|能力值]
 * [Schedule_1|14:00-17:00-导师示范表演]
 * [Schedule_2|19:00-21:00-公司组排练]
 * [Reminder|近期重要安排]
 * [Status_1|角色名|身份|性格|居住地|评级:待定|特質TAG|好感|CP值|当前状态|当前心声|当前着装]
 * [Action|描述內容]
 */

(function() {
    console.log('[主面板處理器] 已啟動 v1.4 (官方API适配版)');

    // ===== 配置項 =====
    const CONFIG = {
        AUTO_SEND: true,
        AUTO_SEND_DELAY: 200,
        DEBUG: true,
        PROCESSOR_ENABLED: true
    };

    // ===== 數據結構 =====
    let mainPanelData = {
        area: {
            current: '',
            time: '',
            day: ''
        },
        scene: {
            date: '',
            time: '',
            location: '',
            prompt: ''
        },
        mainRole: {
            name: '',
            reputation: '',
            level: '',
            statusBtn: '',
            levelBtn: ''
        },
        schedules: [],
        reminder: '',
        teammates: [],
        action: ''
    };

    let currentTavernMessageId_Main = null;
    let hasPerformedInitialMainScan = false;
    let mainProcessorEnabled = CONFIG.PROCESSOR_ENABLED;

    // ===== 智能iframe查找機制 =====
    function findMainPanelIframe() {
        try {
            if (CONFIG.DEBUG) console.log('[主面板處理器] 开始查找主面板iframe');
            
            const possibleSelectors = [
                '.main-panel-iframe',
                'iframe[src*="main_panel.html"]',
                'iframe[src*="main_panel"]', 
                '#mainPanelIframe',
                '.phone-iframe',
                '.panel-iframe'
            ];

            for (let selector of possibleSelectors) {
                const iframe = document.querySelector(selector);
                if (iframe) {
                    if (CONFIG.DEBUG) console.log(`[主面板處理器] 通过选择器找到主面板iframe: ${selector}`);
                    return iframe;
                }
            }

            const allIframes = document.querySelectorAll('iframe');
            for (let iframe of allIframes) {
                if (iframe.src && (
                    iframe.src.includes('main_panel.html') || 
                    iframe.src.includes('main_panel') ||
                    iframe.src.includes('phone') ||
                    iframe.className.includes('main') ||
                    iframe.id.includes('main')
                )) {
                    if (CONFIG.DEBUG) console.log(`[主面板處理器] 通过src/class/id找到主面板iframe: ${iframe.src}`);
                    return iframe;
                }
            }

            if (window.parent && window.parent !== window) {
                const parentIframes = window.parent.document.querySelectorAll('iframe');
                for (let iframe of parentIframes) {
                    if (iframe.src && iframe.src.includes('main_panel')) {
                        if (CONFIG.DEBUG) console.log('[主面板處理器] 在父窗口中找到主面板iframe');
                        return iframe;
                    }
                }
            }

            if (CONFIG.DEBUG) console.log('[主面板處理器] 未找到主面板iframe');
            return null;
        } catch (error) {
            console.error('[主面板處理器] 查找iframe失敗:', error);
            return null;
        }
    }

    // ===== 数据传输函数 =====
    function sendDataToMainPanel() {
        try {
            const message = {
                type: 'MAIN_PANEL_DATA',
                data: mainPanelData,
                timestamp: Date.now(),
                source: 'MAIN_PROCESSOR'
            };

            let sent = false;

            const mainIframe = findMainPanelIframe();
            if (mainIframe && mainIframe.contentWindow) {
                try {
                    mainIframe.contentWindow.postMessage(message, '*');
                    if (CONFIG.DEBUG) console.log('[主面板處理器] ✅ 通过主面板iframe发送成功');
                    sent = true;
                } catch (e) {
                    console.warn('[主面板處理器] 主面板iframe发送失败:', e);
                }
            }

            if (!sent) {
                const allIframes = document.querySelectorAll('iframe');
                for (let iframe of allIframes) {
                    try {
                        if (iframe.contentWindow) {
                            iframe.contentWindow.postMessage(message, '*');
                        }
                    } catch (e) {
                        // 忽略跨域错误
                    }
                }
                if (allIframes.length > 0) {
                    if (CONFIG.DEBUG) console.log('[主面板處理器] ⚡ 已广播到所有iframe');
                    sent = true;
                }
            }

            if (!sent && window.parent && window.parent !== window) {
                try {
                    window.parent.postMessage(message, '*');
                    if (CONFIG.DEBUG) console.log('[主面板處理器] 📤 发送到父窗口');
                    sent = true;
                } catch (e) {
                    console.warn('[主面板處理器] 父窗口发送失败:', e);
                }
            }

        } catch (error) {
            console.error('[主面板處理器] 發送數據失敗:', error);
        }
    }

    // ===== 解析函數 =====
    function parseMainPanelLines(lines) {
        try {
            mainPanelData = {
                area: { current: '', time: '', day: '' },
                scene: { date: '', time: '', location: '', prompt: '' },
                mainRole: { name: '', reputation: '', level: '', statusBtn: '', levelBtn: '' },
                schedules: [],
                reminder: '',
                teammates: [],
                action: ''
            };

            for (let line of lines) {
                if (!line || line.trim() === '') continue;

                if (line.startsWith('[Area|')) {
                    const match = line.match(/\[Area\|([^\]]+)\]/);
                    if (match) {
                        const areaParts = match[1].split('_');
                        mainPanelData.area = {
                            current: areaParts[0] || '',
                            time: areaParts[1] || '',
                            day: areaParts[2] || ''
                        };
                    }
                }
                else if (line.startsWith('[Scene|')) {
                    const match = line.match(/\[Scene\|([^|]+)\|([^|]+)\|([^|]+)\|([^\]]+)\]/);
                    if (match) {
                        mainPanelData.scene = {
                            date: match[1] || '',
                            time: match[2] || '',
                            location: match[3] || '',
                            prompt: match[4] || ''
                        };
                    }
                }
                else if (line.startsWith('[Main_role|')) {
                    const match = line.match(/\[Main_role\|([^|]+)\|([^|]+)\|([^\]]+)\]/);
                    if (match) {
                        mainPanelData.mainRole = {
                            name: match[1] || '',
                            reputation: match[2] || '',
                            level: match[3] || '',
                            statusBtn: match[2] || '',
                            levelBtn: match[3] || ''
                        };
                    }
                }
                else if (line.startsWith('[Schedule_')) {
                    const match = line.match(/\[Schedule_\d+\|([^|]+)-([^|]+)-([^\]]+)\]/);
                    if (match) {
                        const schedule = {
                            startTime: match[1] || '',
                            endTime: match[2] || '',
                            activity: match[3] || ''
                        };
                        mainPanelData.schedules.push(schedule);
                    }
                }
                else if (line.startsWith('[Reminder|')) {
                    const match = line.match(/\[Reminder\|([^\]]+)\]/);
                    if (match) {
                        mainPanelData.reminder = match[1] || '';
                    }
                }
                else if (line.startsWith('[Status_')) {
                    const match = line.match(/\[Status_\d+\|([^\]]+)\]/);
                    if (match) {
                        const statusData = match[1].split('|');
                        if (CONFIG.DEBUG) {
                            console.log('[主面板處理器] 🔍 解析Status數據:', statusData);
                        }
                        if (statusData.length >= 11) {
                            const teammate = {
                                name: statusData[0] || '',
                                role: statusData[1] || '',
                                tag: statusData[2] || '',
                                location: statusData[3] || '',
                                level: statusData[4] || '',
                                traits: statusData[5] || '',
                                favor: statusData[6] || '',
                                cp: statusData[7] || '',
                                status: statusData[8] || '',
                                mood: statusData[9] || '',
                                outfit: statusData[10] || ''
                            };
                            mainPanelData.teammates.push(teammate);
                            if (CONFIG.DEBUG) {
                                console.log('[主面板處理器] ✅ 解析隊友數據:', teammate);
                            }
                        } else {
                            if (CONFIG.DEBUG) {
                                console.log('[主面板處理器] ⚠️ 隊友數據字段不足:', statusData.length, '個字段，需要11個');
                            }
                        }
                    }
                }
                else if (line.startsWith('[Action|')) {
                    const match = line.match(/\[Action\|([^\]]+)\]/);
                    if (match) {
                        mainPanelData.action = match[1] || '';
                    }
                }
            }


        } catch (error) {
            console.error('[主面板處理器] 解析失敗:', error);
        }
    }

    // ===== 主掃描函數 =====
    async function scanAndProcessAllMainLines() {
        try {
            let allLines = [];
            const lastMsgId = await getLastMessageId();
            
            if (lastMsgId === undefined || lastMsgId === null || lastMsgId < 0) {
                mainPanelData = {
                    area: { current: '', time: '', day: '' },
                    scene: { date: '', time: '', location: '', prompt: '' },
                    mainRole: { name: '', reputation: '', level: '', statusBtn: '', levelBtn: '' },
                    schedules: [],
                    reminder: '',
                    teammates: [],
                    action: ''
                };
                sendDataToMainPanel();
                return;
            }

            const historicalTavernMessages = await getChatMessages(`0-${lastMsgId}`);
            if (historicalTavernMessages && historicalTavernMessages.length > 0) {
                for (let i = 0; i < historicalTavernMessages.length; i++) {
                    const msg = historicalTavernMessages[i].message;
                    allLines.push(...msg.split(/\n+/).map(l => l.trim()).filter(Boolean));
                }
            }

            parseMainPanelLines(allLines);
            sendDataToMainPanel();
        } catch (error) {
            console.error('[主面板處理器] 掃描失敗:', error);
        }
    }

    // ===== 處理新消息 =====
    async function processNewMessage(messageId, eventType) {
        if (!mainProcessorEnabled) {
            return;
        }
        
        try {
            if (CONFIG.DEBUG) {
                console.log(`[主面板處理器] 處理事件: ${eventType}, 消息ID: ${messageId}`);
            }
            
            const messages = await getChatMessages(`${messageId}-${messageId}`);
            if (messages && messages.length > 0) {
                const newMsg = messages[0].message;
                
                if (/\[Area\|/i.test(newMsg) || 
                    /\[Scene\|/i.test(newMsg) || 
                    /\[Main_role\|/i.test(newMsg) || 
                    /\[Schedule_/i.test(newMsg) || 
                    /\[Reminder\|/i.test(newMsg) || 
                    /\[Status_/i.test(newMsg) || 
                    /\[Action\|/i.test(newMsg)) {
                    
                    if (CONFIG.DEBUG) {
                        console.log('[主面板處理器] 檢測到主面板相關內容，開始處理');
                    }
                    
                    await scanAndProcessAllMainLines();
                    
                    if (CONFIG.AUTO_SEND) {
                        setTimeout(() => {
                            sendDataToMainPanel();
                        }, CONFIG.AUTO_SEND_DELAY);
                    }
                }
            }
        } catch (error) {
            console.error(`[主面板處理器] 處理事件 ${eventType}, message_id: ${messageId} 時出錯:`, error);
        }
    }

    // ===== 事件監聽器設置函數 =====
    function initializeEventListeners() {
        try {
            if (CONFIG.DEBUG) {
                console.log('[主面板處理器] 開始設置事件監聽器...');
            }

            if (typeof eventOn === 'undefined' || typeof tavern_events === 'undefined') {
                console.error('[主面板處理器] eventOn 或 tavern_events 不可用');
                return;
            }

            eventOn(tavern_events.MESSAGE_RECEIVED, async (message_id) => {
                if (CONFIG.DEBUG) {
                    console.log('[主面板處理器] 📞 收到新消息事件', { messageId: message_id });
                }
                await processNewMessage(message_id, '監聽-收到新消息');
            });

            eventOn(tavern_events.MESSAGE_UPDATED, async (message_id) => {
                if (CONFIG.DEBUG) {
                    console.log('[主面板處理器] 📄 消息更新事件', { messageId: message_id });
                }
                await processNewMessage(message_id, '監聽-消息更新');
            });

            eventOn(tavern_events.CHAT_CHANGED, async () => {
                if (CONFIG.DEBUG) {
                    console.log('[主面板處理器] 💬 聊天改變事件');
                }
                
                if (!hasPerformedInitialMainScan) {
                    await scanAndProcessAllMainLines();
                    hasPerformedInitialMainScan = true;
                }
            });

            console.log('[主面板處理器] ✅ 事件監聽器設置完成');

        } catch (error) {
            console.error('[主面板處理器] ❌ 設置事件監聽器失敗:', error);
        }
    }

    // ===== 🔧 修复：正确的按钮事件设置 =====
    function setupManualUpdateButton() {
        try {
            if (CONFIG.DEBUG) {
                console.log('[主面板處理器] 开始设置按钮事件...');
            }
    
            if (typeof eventOnButton !== 'function') {
                console.warn('[主面板處理器] ⚠️ eventOnButton 函数不可用');
                return;
            }
    
            // 🎯 修复方案1：使用简单的表情符号（参考call_processor的成功做法）
            try {
                eventOnButton('🏠', handleManualUpdateMainPanel);      // 主面板更新
                eventOnButton('📋', showMainPanelHistory);           // 显示历史
                eventOnButton('🧪', testMainPanelCommunication);     // 测试通信
                eventOnButton('🔄', resetMainPanelData);             // 重置数据
                eventOnButton('✅', enableMainProcessor);            // 启用处理器
                eventOnButton('❌', disableMainProcessor);           // 禁用处理器
                
                console.log('[主面板處理器] ✅ 按钮事件设置完成 (表情符号版本)');
            } catch (error) {
                console.error('[主面板處理器] 表情符号按钮设置失败，尝试备用方案:', error);
                
                // 🎯 修复方案2：使用单个字符标识符
                try {
                    eventOnButton('M', handleManualUpdateMainPanel);   // M = Main update
                    eventOnButton('H', showMainPanelHistory);          // H = History  
                    eventOnButton('T', testMainPanelCommunication);    // T = Test
                    eventOnButton('R', resetMainPanelData);            // R = Reset
                    eventOnButton('E', enableMainProcessor);           // E = Enable
                    eventOnButton('D', disableMainProcessor);          // D = Disable
                    
                    console.log('[主面板處理器] ✅ 备用按钮事件设置完成 (字符版本)');
                } catch (error2) {
                    console.error('[主面板處理器] 所有按钮设置方案都失败:', error2);
                    
                    // 🎯 修复方案3：使用数字标识符
                    try {
                        eventOnButton('1', handleManualUpdateMainPanel);
                        eventOnButton('2', showMainPanelHistory);
                        eventOnButton('3', testMainPanelCommunication);
                        eventOnButton('4', resetMainPanelData);
                        eventOnButton('5', enableMainProcessor);
                        eventOnButton('6', disableMainProcessor);
                        
                        console.log('[主面板處理器] ✅ 数字按钮事件设置完成');
                    } catch (error3) {
                        console.error('[主面板處理器] 最终方案也失败，可能需要检查API兼容性:', error3);
                    }
                }
            }
    
            // 🔧 调试信息：显示按钮设置状态
            if (CONFIG.DEBUG) {
                console.log('[主面板處理器] 📋 按钮设置总结:');
                console.log('1. 如果看到"表情符号版本"成功 -> 使用 🏠📋🧪🔄✅❌');
                console.log('2. 如果看到"字符版本"成功 -> 使用 M H T R E D');  
                console.log('3. 如果看到"数字版本"成功 -> 使用 1 2 3 4 5 6');
                console.log('4. 确保在酒馆AI脚本库中创建了对应的按钮脚本');
            }
    
        } catch (error) {
            console.error('[主面板處理器] ❌ 設置按钮失敗:', error);
        }
    }
    

    // ===== 手動功能函數 =====
    async function handleManualUpdateMainPanel() {
        try {
            await scanAndProcessAllMainLines();
        } catch (error) {
            console.error('[主面板處理器] ❌ 手動更新失敗:', error);
        }
    }

    async function showMainPanelHistory() {
        try {
            const lastMsgId = await getLastMessageId();
            const recentMessages = await getChatMessages(`0-${lastMsgId}`);
            
            const mainPanelMessages = recentMessages.filter(msg => {
                const content = msg.message || '';
                return content.includes('[Area|') || 
                       content.includes('[Scene|') || 
                       content.includes('[Main_role|') || 
                       content.includes('[Schedule_') || 
                       content.includes('[Reminder|') || 
                       content.includes('[Status_') || 
                       content.includes('[Action|');
            });
            
            console.log(`[主面板處理器] 📊 發現 ${mainPanelMessages.length} 條主面板相關消息`);
            console.log('[主面板處理器] 📊 當前主面板數據:', mainPanelData);
        } catch (error) {
            console.error('[主面板處理器] ❌ 顯示歷史數據失敗:', error);
        }
    }

    function testMainPanelCommunication() {
        try {
            const testData = {
                area: { current: 'TEST_AREA', time: 'TEST_TIME', day: 'TEST_DAY' },
                scene: { date: '2025-01-01', time: '12:00', location: '測試位置', prompt: '測試提示' },
                mainRole: { name: '測試角色', reputation: '測試名聲', level: '測試等級', statusBtn: '測試状态', levelBtn: '測試等级' },
                schedules: [{ startTime: '09:00', endTime: '12:00', activity: '測試活動' }],
                reminder: '測試提醒',
                teammates: [{ name: '測試隊友', role: '測試身份', residence: '測試位置' }],
                action: '測試行動'
            };
            
            mainPanelData = testData;
            sendDataToMainPanel();
        } catch (error) {
            console.error('[主面板處理器] ❌ 測試通信失敗:', error);
        }
    }

    function resetMainPanelData() {
        try {
            mainPanelData = {
                area: { current: '', time: '', day: '' },
                scene: { date: '', time: '', location: '', prompt: '' },
                mainRole: { name: '', reputation: '', level: '', statusBtn: '', levelBtn: '' },
                schedules: [],
                reminder: '',
                teammates: [],
                action: ''
            };
            
            sendDataToMainPanel();
        } catch (error) {
            console.error('[主面板處理器] ❌ 重置數據失敗:', error);
        }
    }

    function enableMainProcessor() {
        mainProcessorEnabled = true;
        console.log('[主面板處理器] 已啟用');
    }

    function disableMainProcessor() {
        mainProcessorEnabled = false;
        console.log('[主面板處理器] 已禁用');
    }

    // ===== 初始化函數 =====
    async function initializeMainProcessor() {
        try {
            if (typeof getLastMessageId !== 'function' || typeof getChatMessages !== 'function') {
                console.error('[主面板處理器] 必要的API函數不可用，等待5秒後重試...');
                setTimeout(initializeMainProcessor, 5000);
                return;
            }

            if (typeof eventOn === 'undefined') {
                console.error('[主面板處理器] eventOn 不可用，等待5秒後重試...');
                setTimeout(initializeMainProcessor, 5000);
                return;
            }

            await scanAndProcessAllMainLines();
            hasPerformedInitialMainScan = true;

            initializeEventListeners();
            setupManualUpdateButton();

            const mainIframe = findMainPanelIframe();
            if (mainIframe) {
                console.log('[主面板處理器] ✅ 已找到主面板iframe');
            } else {
                console.warn('[主面板處理器] ⚠️ 未找到主面板iframe');
                setTimeout(() => {
                    const retryIframe = findMainPanelIframe();
                    if (retryIframe) {
                        console.log('[主面板處理器] ✅ 延迟查找成功');
                        sendDataToMainPanel();
                    }
                }, 3000);
            }

        } catch (error) {
            console.error('[主面板處理器] ❌ 初始化失敗:', error);
            setTimeout(initializeMainProcessor, 10000);
        }
    }

    // ===== 暴露函數到全局作用域 =====
    window.scanAndProcessAllMainLines = scanAndProcessAllMainLines;
    window.enableMainProcessor = enableMainProcessor;
    window.disableMainProcessor = disableMainProcessor;
    window.getMainPanelData = () => mainPanelData;
    window.handleManualUpdateMainPanel = handleManualUpdateMainPanel;
    window.showMainPanelHistory = showMainPanelHistory;
    window.testMainPanelCommunication = testMainPanelCommunication;
    window.resetMainPanelData = resetMainPanelData;
    window.findMainPanelIframe = findMainPanelIframe;

    // ===== 自動初始化 =====
    if (typeof getLastMessageId === 'function' && typeof getChatMessages === 'function') {
        initializeMainProcessor();
    } else {
        const checkInterval = setInterval(() => {
            if (typeof getLastMessageId === 'function' && typeof getChatMessages === 'function') {
                clearInterval(checkInterval);
                initializeMainProcessor();
            }
        }, 1000);
    }

})();