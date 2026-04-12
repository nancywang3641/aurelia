/**
 * ============================================
 * 奧瑞亞擴展 - 酒館通信橋模組 (Tavern Bridge)
 * ============================================
 * 功能：處理與 SillyTavern 的所有通信交互
 * 版本：1.0.0
 * ============================================
 */

(function(AureliaTavernBridge) {
    'use strict';

    // ===== 模組狀態 =====
    let messageListeners = [];
    let eventListeners = {};
    let tavernWindow = null;
    let isInitialized = false;

    // ===== TavernHelper API 封裝 =====

    /**
     * 檢查 TavernHelper API 是否可用
     */
    AureliaTavernBridge.isTavernHelperAvailable = function() {
        return typeof window.TavernHelper !== 'undefined';
    };

    /**
     * 獲取 TavernHelper 實例
     */
    AureliaTavernBridge.getTavernHelper = function() {
        if (!AureliaTavernBridge.isTavernHelperAvailable()) {
            console.error('❌ TavernHelper API 不可用');
            return null;
        }
        return window.TavernHelper;
    };

    /**
     * 查找酒館主窗口
     */
    AureliaTavernBridge.findTavernMainWindow = function() {
        try {
            // 嘗試多種方式找到主窗口
            if (window.parent && window.parent !== window) {
                tavernWindow = window.parent;
                return tavernWindow;
            }
            if (window.top && window.top !== window) {
                tavernWindow = window.top;
                return tavernWindow;
            }
            tavernWindow = window;
            return tavernWindow;
        } catch (error) {
            console.error('查找主窗口失敗:', error);
            return null;
        }
    };

    /**
     * 獲取酒館元素
     */
    AureliaTavernBridge.getTavernElements = function(targetWindow) {
        try {
            const win = targetWindow || AureliaTavernBridge.findTavernMainWindow();
            if (!win) return null;

            const textarea = win.document.querySelector(
                'textarea[placeholder*="message"], textarea[placeholder*="Message"], #send_textarea, .send_textarea'
            );
            
            const sendButton = win.document.querySelector(
                'button[title*="Send"], button[title*="send"], #send_but, .send_but, button[type="submit"]'
            );
            
            return { textarea, sendButton };
        } catch (error) {
            console.error('獲取酒館元素失敗:', error);
            return null;
        }
    };

    // ===== 消息發送函數 =====

    /**
     * 發送消息到酒館（主函數）
     */
    AureliaTavernBridge.sendMessageToTavern = async function(message) {
        try {
            console.log('📤 開始發送消息到酒館:', message);

            // 優先使用 TavernHelper API
            if (AureliaTavernBridge.isTavernHelperAvailable() && 
                window.TavernHelper.createChatMessages) {
                
                await window.TavernHelper.createChatMessages([{
                    role: 'user',
                    name: '{{user}}',
                    message: message
                }], { refresh: 'affected' });
                
                console.log('✅ 消息已通過 TavernHelper API 發送');
                return true;
            }
            
            // 回退到 DOM 方式
            return await AureliaTavernBridge.sendMessageViaDOM(message);
            
        } catch (error) {
            console.error('TavernHelper API 發送失敗，回退到 DOM 方式:', error.message);
            return await AureliaTavernBridge.sendMessageViaDOM(message);
        }
    };

    /**
     * 通過 DOM 方式發送消息（備用方案）
     */
    AureliaTavernBridge.sendMessageViaDOM = async function(message) {
        try {
            const win = AureliaTavernBridge.findTavernMainWindow();
            if (!win) {
                console.error('找不到酒館 AI 主環境');
                return false;
            }
            
            const elements = AureliaTavernBridge.getTavernElements(win);
            if (!elements?.textarea || !elements?.sendButton) {
                console.error('找不到發送元素');
                return false;
            }
            
            // 執行發送
            elements.textarea.value = message;
            elements.textarea.dispatchEvent(new Event('input', { bubbles: true }));
            elements.sendButton.click();
            
            console.log('✅ 消息已通過 DOM 方式發送');
            return true;
            
        } catch (error) {
            console.error('DOM 方式發送失敗:', error);
            return false;
        }
    };

    // ===== Lorebook 操作 =====

    /**
     * 獲取 Lorebook 條目
     */
    AureliaTavernBridge.getLorebookEntries = async function(lorebookName) {
        try {
            if (!AureliaTavernBridge.isTavernHelperAvailable()) {
                throw new Error('TavernHelper API 不可用');
            }

            if (typeof window.TavernHelper.getLorebookEntries !== 'function') {
                throw new Error('getLorebookEntries 方法不可用');
            }

            console.log(`📚 獲取 Lorebook 條目: ${lorebookName}`);
            const entries = await window.TavernHelper.getLorebookEntries(lorebookName);
            
            console.log(`✅ 成功獲取 ${entries?.length || 0} 個條目`);
            return entries || [];
            
        } catch (error) {
            console.error(`❌ 獲取 Lorebook 條目失敗 (${lorebookName}):`, error);
            throw error;
        }
    };

    /**
     * 設置 Lorebook 條目
     */
    AureliaTavernBridge.setLorebookEntries = async function(lorebookName, entries) {
        try {
            if (!AureliaTavernBridge.isTavernHelperAvailable()) {
                throw new Error('TavernHelper API 不可用');
            }

            if (typeof window.TavernHelper.setLorebookEntries !== 'function') {
                throw new Error('setLorebookEntries 方法不可用');
            }

            console.log(`📝 設置 Lorebook 條目: ${lorebookName}, 數量: ${entries.length}`);
            await window.TavernHelper.setLorebookEntries(lorebookName, entries);
            
            console.log('✅ Lorebook 條目已更新');
            return true;
            
        } catch (error) {
            console.error(`❌ 設置 Lorebook 條目失敗 (${lorebookName}):`, error);
            throw error;
        }
    };

    /**
     * 刪除 Lorebook 條目
     */
    AureliaTavernBridge.deleteLorebookEntries = async function(lorebookName, uids) {
        try {
            if (!AureliaTavernBridge.isTavernHelperAvailable()) {
                throw new Error('TavernHelper API 不可用');
            }

            if (typeof window.TavernHelper.deleteLorebookEntries !== 'function') {
                throw new Error('deleteLorebookEntries 方法不可用');
            }

            console.log(`🗑️ 刪除 Lorebook 條目: ${lorebookName}, UIDs: ${uids.length}`);
            const result = await window.TavernHelper.deleteLorebookEntries(lorebookName, uids);
            
            if (result.delete_occurred) {
                console.log(`✅ 成功刪除 ${uids.length} 個條目`);
                return result;
            } else {
                console.warn('⚠️ 刪除操作未發生變化');
                return result;
            }
            
        } catch (error) {
            console.error(`❌ 刪除 Lorebook 條目失敗 (${lorebookName}):`, error);
            throw error;
        }
    };

    // ===== 聊天消息操作 =====

    /**
     * 創建聊天消息
     */
    AureliaTavernBridge.createChatMessages = async function(messages, options = {}) {
        try {
            if (!AureliaTavernBridge.isTavernHelperAvailable()) {
                throw new Error('TavernHelper API 不可用');
            }

            if (typeof window.TavernHelper.createChatMessages !== 'function') {
                throw new Error('createChatMessages 方法不可用');
            }

            console.log(`💬 創建聊天消息: ${messages.length} 條`);
            await window.TavernHelper.createChatMessages(messages, {
                refresh: 'affected',
                ...options
            });
            
            console.log('✅ 聊天消息已創建');
            return true;
            
        } catch (error) {
            console.error('❌ 創建聊天消息失敗:', error);
            throw error;
        }
    };

    /**
     * 刪除聊天消息
     */
    AureliaTavernBridge.deleteChatMessages = async function(messageIds, options = {}) {
        try {
            if (!AureliaTavernBridge.isTavernHelperAvailable()) {
                throw new Error('TavernHelper API 不可用');
            }

            if (typeof window.TavernHelper.deleteChatMessages !== 'function') {
                throw new Error('deleteChatMessages 方法不可用');
            }

            console.log(`🗑️ 刪除聊天消息: ${messageIds.length} 條`);
            await window.TavernHelper.deleteChatMessages(messageIds, {
                refresh: 'all',
                ...options
            });
            
            console.log('✅ 聊天消息已刪除');
            return true;
            
        } catch (error) {
            console.error('❌ 刪除聊天消息失敗:', error);
            throw error;
        }
    };

    /**
     * 觸發 Slash 命令
     */
    AureliaTavernBridge.triggerSlash = async function(command) {
        try {
            if (!AureliaTavernBridge.isTavernHelperAvailable()) {
                throw new Error('TavernHelper API 不可用');
            }

            if (typeof window.TavernHelper.triggerSlash !== 'function') {
                throw new Error('triggerSlash 方法不可用');
            }

            console.log(`🔮 觸發 Slash 命令: ${command}`);
            await window.TavernHelper.triggerSlash(command);
            
            console.log('✅ Slash 命令已觸發');
            return true;
            
        } catch (error) {
            console.error('❌ 觸發 Slash 命令失敗:', error);
            throw error;
        }
    };

    // ===== 業務邏輯封裝 =====

    /**
     * 處理 VN 劇情刪除
     */
    AureliaTavernBridge.handleVNHistoryDelete = async function(messageIds) {
        console.log('🗑️ 處理 VN 劇情刪除請求, 消息 ID:', messageIds);
        
        try {
            await AureliaTavernBridge.deleteChatMessages(messageIds);
            console.log('✅ VN 劇情刪除成功');
            
            return {
                success: true,
                messageIds: messageIds,
                count: messageIds.length
            };
            
        } catch (error) {
            console.error('❌ VN 劇情刪除失敗:', error);
            throw error;
        }
    };

    /**
     * 處理小說章節刪除
     */
    AureliaTavernBridge.handleNovelChapterDelete = async function(messageIds) {
        console.log('🗑️ 處理小說章節刪除請求, 消息 ID:', messageIds);
        
        try {
            await AureliaTavernBridge.deleteChatMessages(messageIds);
            console.log('✅ 小說章節刪除成功');
            
            return {
                success: true,
                messageIds: messageIds,
                count: messageIds.length
            };
            
        } catch (error) {
            console.error('❌ 小說章節刪除失敗:', error);
            throw error;
        }
    };

    /**
     * 處理上帝視角角色選擇
     */
    AureliaTavernBridge.handleGodViewCharacterSelection = async function(characterName) {
        console.log('🔮 處理上帝視角角色選擇請求, 角色名:', characterName);
        
        try {
            // 構建發送消息
            const messageToSend = `【記憶窺探】: 開始監控角色 "${characterName}"`;
            
            // 🔥 改為DOM方式發送（讓其他插件能正確觸發）
            const success = await AureliaTavernBridge.sendMessageToTavernViaDOM(messageToSend);
            
            if (success) {
                console.log('✅ 上帝視角角色選擇成功（DOM發送）');
                
                // DOM發送已經包含點擊發送按鈕，不需要額外觸發AI
                console.log('🔮 ✅ 消息已發送，等待AI響應...');
                
                return {
                    success: true,
                    characterName: characterName,
                    message: `已開始監控角色 "${characterName}"`
                };
            } else {
                console.error('❌ DOM發送失敗，嘗試API發送');
                // 回退到API發送
                await AureliaTavernBridge.createChatMessages([{
                    role: 'user',
                    name: '{{user}}',
                    message: messageToSend
                }]);
                
                console.log('✅ 上帝視角角色選擇成功（API發送）');
                
                // 等待一下讓消息發送完成
                await new Promise(resolve => setTimeout(resolve, 200));
                
                // 觸發 AI 生成新內容
                await AureliaTavernBridge.triggerSlash('/trigger');
                
                console.log('🔮 ✅ AI 已觸發，等待輸出...');
                
                return {
                    success: true,
                    characterName: characterName,
                    message: `已開始監控角色 "${characterName}"`
                };
            }
            
        } catch (error) {
            console.error('❌ 上帝視角角色選擇失敗:', error);
            throw error;
        }
    };

    /**
     * 🔥 DOM方式發送消息到酒館AI（讓其他插件能正確觸發）
     */
    AureliaTavernBridge.sendMessageToTavernViaDOM = async function(message) {
        try {
            console.log('🔮 使用DOM方式發送消息:', message);
            
            const tavernWindow = findTavernMainWindow();
            if (!tavernWindow) {
                console.error('❌ 找不到酒館AI主環境');
                return false;
            }
            
            const elements = getTavernElements(tavernWindow);
            if (!elements?.textarea || !elements?.sendButton) {
                console.error('❌ 找不到發送元素');
                return false;
            }
            
            // 執行發送
            console.log('🔮 設置輸入框內容:', message);
            elements.textarea.value = message;
            
            // 觸發input事件讓酒館AI知道內容已改變
            elements.textarea.dispatchEvent(new Event('input', { bubbles: true }));
            elements.textarea.dispatchEvent(new Event('change', { bubbles: true }));
            
            // 等待一下讓事件處理完成
            await new Promise(resolve => setTimeout(resolve, 200));
            
            console.log('🔮 點擊發送按鈕');
            elements.sendButton.click();
            console.log('✅ 消息通過DOM方式發送成功');
            
            return true;
            
        } catch (error) {
            console.error('❌ DOM方式發送失敗:', error);
            return false;
        }
    };

    /**
     * 查找酒館AI主環境
     */
    function findTavernMainWindow() {
        const candidates = [window.parent, window.top, window];
        
        for (const win of candidates) {
            try {
                if (win && validateTavernWindow(win)) {
                    return win;
                }
            } catch (error) {
                continue;
            }
        }
        
        return null;
    }

    /**
     * 驗證酒館AI窗口
     */
    function validateTavernWindow(win) {
        try {
            // 檢查是否有酒館AI的標識
            return win.document && (
                win.document.querySelector('#send_textarea') ||
                win.document.querySelector('textarea[placeholder*="message"]') ||
                win.document.querySelector('#send_textarea') ||
                win.document.querySelector('button[title*="Send"]') ||
                win.document.querySelector('button[aria-label*="Send"]')
            );
        } catch (error) {
            return false;
        }
    }

    /**
     * 獲取酒館AI元素
     */
    function getTavernElements(win) {
        try {
            const doc = win.document;
            
            // 嘗試多種選擇器
            const textarea = doc.querySelector('#send_textarea') ||
                           doc.querySelector('textarea[placeholder*="message"]') ||
                           doc.querySelector('textarea[placeholder*="Message"]') ||
                           doc.querySelector('textarea[data-testid*="message"]') ||
                           doc.querySelector('textarea');
            
            const sendButton = doc.querySelector('button[title*="Send"]') ||
                             doc.querySelector('button[aria-label*="Send"]') ||
                             doc.querySelector('button[data-testid*="send"]') ||
                             doc.querySelector('button[type="submit"]') ||
                             doc.querySelector('button:last-child');
            
            return { textarea, sendButton };
        } catch (error) {
            console.error('❌ 獲取酒館元素失敗:', error);
            return { textarea: null, sendButton: null };
        }
    }

    /**
     * 保存素材數據到世界書
     */
    AureliaTavernBridge.saveMaterialData = async function(entry, newContent) {
        try {
            console.log('💾 保存素材數據到世界書...');
            
            // 獲取所有系統世界書條目，只更新目標條目
            const allEntries = await AureliaTavernBridge.getLorebookEntries('系統');
            if (!allEntries) {
                throw new Error('無法獲取系統世界書條目');
            }
            
            // 找到目標條目並更新其內容
            const updatedEntries = allEntries.map(existingEntry => {
                if (existingEntry.uid === entry.uid) {
                    return {
                        ...existingEntry,
                        content: newContent
                    };
                }
                return existingEntry; // 保持其他條目不變
            });
            
            // 使用 setLorebookEntries 更新所有條目（保持其他條目不變）
            await AureliaTavernBridge.setLorebookEntries('系統', updatedEntries);
            
            console.log('✅ 素材數據已保存到世界書（保留其他條目）');
            return { success: true };
            
        } catch (error) {
            console.error('❌ 保存素材數據失敗:', error);
            throw error;
        }
    };

    /**
     * 清空系統數據條目（錢包、商城、背包、任務）
     */
    AureliaTavernBridge.clearSystemDataEntries = async function(systemItemUids) {
        try {
            console.log('🧹 清空系統數據條目...');
            
            // 獲取系統世界書條目
            const entries = await AureliaTavernBridge.getLorebookEntries('系統');
            if (!entries) {
                throw new Error('無法獲取系統世界書條目');
            }

            const entriesToUpdate = [];
            
            // 只處理特定的系統條目，保護其他重要數據
            const allowedKeys = ['[錢包]', '[商城]', '[背包]', '[任務]', '[任务]'];
            
            // 為每個要清空的系統條目準備清空內容
            for (const uid of systemItemUids) {
                const entry = entries.find(e => e.uid === uid);
                if (entry) {
                    // 檢查：只清空允許的條目類型
                    const hasAllowedKey = entry.keys && entry.keys.some(key => allowedKeys.includes(key));
                    
                    if (!hasAllowedKey) {
                        console.log(`🔒 保護重要數據，跳過條目: ${entry.keys ? entry.keys.join(', ') : '未知'}`);
                        continue;
                    }
                    
                    // 根據條目類型設置適當的空內容
                    let emptyContent = '';
                    if (entry.keys && entry.keys.includes('[錢包]')) {
                        emptyContent = '金幣：0';
                    } else if (entry.keys && entry.keys.includes('[商城]')) {
                        emptyContent = '商城暫無商品';
                    } else if (entry.keys && entry.keys.includes('[背包]')) {
                        emptyContent = '背包是空的';
                    } else if (entry.keys && (entry.keys.includes('[任務]') || entry.keys.includes('[任务]'))) {
                        emptyContent = '暫無任務';
                    }
                    
                    entriesToUpdate.push({
                        uid: uid,
                        content: emptyContent
                    });
                    
                    console.log(`🔧 準備清空系統條目: ${entry.keys ? entry.keys.join(', ') : '未知'} -> "${emptyContent}"`);
                }
            }

            // 批量更新條目內容
            if (entriesToUpdate.length > 0) {
                await AureliaTavernBridge.setLorebookEntries('系統', entriesToUpdate);
                console.log(`✅ 成功清空 ${entriesToUpdate.length} 個系統數據條目`);
                return { success: true, clearedCount: entriesToUpdate.length };
            } else {
                console.warn('⚠️ 沒有找到要清空的系統條目');
                return { success: false, error: '沒有找到要清空的系統條目' };
            }

        } catch (error) {
            console.error('❌ 清空系統數據失敗:', error);
            throw error;
        }
    };

    // ===== 事件系統 =====

    /**
     * 註冊事件監聽器
     */
    AureliaTavernBridge.on = function(eventName, handler) {
        if (!eventListeners[eventName]) {
            eventListeners[eventName] = [];
        }
        eventListeners[eventName].push(handler);
        
        console.log(`📝 已註冊事件監聽器: ${eventName}`);
    };

    /**
     * 移除事件監聽器
     */
    AureliaTavernBridge.off = function(eventName, handler) {
        if (!eventListeners[eventName]) return;
        
        const index = eventListeners[eventName].indexOf(handler);
        if (index > -1) {
            eventListeners[eventName].splice(index, 1);
            console.log(`📝 已移除事件監聽器: ${eventName}`);
        }
    };

    /**
     * 觸發事件
     */
    AureliaTavernBridge.emit = function(eventName, data) {
        if (!eventListeners[eventName]) return;
        
        console.log(`📡 觸發事件: ${eventName}`, data);
        
        eventListeners[eventName].forEach(handler => {
            try {
                handler(data);
            } catch (error) {
                console.error(`❌ 事件處理器錯誤 (${eventName}):`, error);
            }
        });
    };

    // ===== 消息監聽系統 =====

    /**
     * 設置消息監聽器
     */
    AureliaTavernBridge.setupMessageListener = function() {
        if (isInitialized) {
            console.warn('⚠️ 消息監聽器已初始化');
            return;
        }

        window.addEventListener('message', function(event) {
            // 安全檢查
            if (!event.data || typeof event.data !== 'object') return;
            
            const message = event.data;
            
            // 🔥 新增：處理上帝視角角色選擇消息
            if (message.type === 'GOD_VIEW_CHARACTER_SELECTED') {
                console.log('🔮 收到上帝視角角色選擇請求，來源:', message.source);
                if (message.source === 'god_view_panel' && message.data) {
                    const characterName = message.data.characterName;
                    console.log('✅ 來自上帝視角面板的角色選擇請求，角色名:', characterName);
                    AureliaTavernBridge.handleGodViewCharacterSelection(characterName);
                }
                return; // 處理完畢，不需要繼續處理
            }
            
            // 調用所有註冊的消息處理器
            messageListeners.forEach(listener => {
                try {
                    listener(message, event);
                } catch (error) {
                    console.error('❌ 消息處理器錯誤:', error);
                }
            });
            
            // 根據消息類型觸發對應事件
            if (message.type) {
                AureliaTavernBridge.emit(message.type, message.data);
            }
        });

        isInitialized = true;
        console.log('✅ 酒館通信橋消息監聽器已設置');
    };

    /**
     * 註冊消息處理器
     */
    AureliaTavernBridge.onMessage = function(handler) {
        messageListeners.push(handler);
        console.log('📝 已註冊消息處理器');
    };

    /**
     * 移除消息處理器
     */
    AureliaTavernBridge.offMessage = function(handler) {
        const index = messageListeners.indexOf(handler);
        if (index > -1) {
            messageListeners.splice(index, 1);
            console.log('📝 已移除消息處理器');
        }
    };

    /**
     * 發送消息到面板
     */
    AureliaTavernBridge.sendToPanel = function(panelId, message) {
        try {
            const panel = document.getElementById(panelId);
            if (!panel || !panel.contentWindow) {
                console.warn(`⚠️ 面板不存在或未加載: ${panelId}`);
                return false;
            }

            panel.contentWindow.postMessage({
                source: 'AURELIA_MAIN',
                timestamp: Date.now(),
                ...message
            }, '*');

            console.log(`📤 已發送消息到面板 ${panelId}:`, message.type);
            return true;
            
        } catch (error) {
            console.error(`❌ 發送消息到面板失敗 (${panelId}):`, error);
            return false;
        }
    };

    // 內建消息處理：處理面板章節/劇情刪除請求
    function handlePanelDeleteRequests(message, event) {
        try {
            const type = message?.type;
            if (!type) return;

            if (type === 'DELETE_NOVEL_CHAPTERS' || type === 'DELETE_VN_HISTORIES') {
                const ids = message?.data?.messageIds || message?.messageIds || [];
                if (!Array.isArray(ids) || ids.length === 0) {
                    console.warn('⚠️ 刪除請求缺少 messageIds');
                    return;
                }

                const doDelete = async () => {
                    try {
                        await AureliaTavernBridge.deleteChatMessages(ids, { refresh: 'all' });
                        const respond = {
                            type: type + '_RESULT',
                            data: { success: true, messageIds: ids, count: ids.length },
                            source: 'AURELIA_MAIN',
                            timestamp: Date.now()
                        };
                        try {
                            // 優先回覆給來源窗口
                            if (event?.source && event.source !== window) {
                                event.source.postMessage(respond, '*');
                            } else {
                                window.postMessage(respond, '*');
                            }
                        } catch {}
                        console.log('✅ 已處理刪除請求:', type, ids.length);
                    } catch (err) {
                        const respond = {
                            type: type + '_RESULT',
                            data: { success: false, error: err?.message || String(err), messageIds: ids },
                            source: 'AURELIA_MAIN',
                            timestamp: Date.now()
                        };
                        try {
                            if (event?.source && event.source !== window) {
                                event.source.postMessage(respond, '*');
                            } else {
                                window.postMessage(respond, '*');
                            }
                        } catch {}
                        console.error('❌ 刪除請求失敗:', err);
                    }
                };

                // 立即執行刪除
                doDelete();
            }
        } catch (e) {
            console.error('處理刪除請求時發生錯誤:', e);
        }
    }

    // ===== 初始化 =====
    
    /**
     * 初始化酒館通信橋
     */
    AureliaTavernBridge.initialize = function() {
        console.log('🌉 初始化酒館通信橋...');
        
        // 查找酒館主窗口
        AureliaTavernBridge.findTavernMainWindow();
        
        // 設置消息監聽器
        AureliaTavernBridge.setupMessageListener();
        
        // 內建刪除請求處理器
        AureliaTavernBridge.onMessage(handlePanelDeleteRequests);
        
        // 檢查 TavernHelper 可用性
        if (AureliaTavernBridge.isTavernHelperAvailable()) {
            console.log('✅ TavernHelper API 可用');
        } else {
            console.warn('⚠️ TavernHelper API 不可用，將使用備用方案');
        }
        
        console.log('✅ 酒館通信橋初始化完成');
    };

    /**
     * 清理資源
     */
    AureliaTavernBridge.cleanup = function() {
        console.log('🧹 清理酒館通信橋資源...');
        
        messageListeners = [];
        eventListeners = {};
        tavernWindow = null;
        isInitialized = false;
        
        console.log('✅ 酒館通信橋資源已清理');
    };

    // ===== 工具函數 =====

    /**
     * 安全執行異步操作
     */
    AureliaTavernBridge.safeAsync = async function(asyncFunc, fallback = null) {
        try {
            return await asyncFunc();
        } catch (error) {
            console.error('❌ 異步操作失敗:', error);
            return fallback;
        }
    };

    /**
     * 重試機制
     */
    AureliaTavernBridge.retry = async function(asyncFunc, maxRetries = 3, delay = 1000) {
        let lastError;
        
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await asyncFunc();
            } catch (error) {
                lastError = error;
                console.warn(`⚠️ 操作失敗，重試 ${i + 1}/${maxRetries}...`);
                
                if (i < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        
        throw lastError;
    };

    /**
     * 批量操作
     */
    AureliaTavernBridge.batch = async function(operations, batchSize = 5) {
        const results = [];
        
        for (let i = 0; i < operations.length; i += batchSize) {
            const batch = operations.slice(i, i + batchSize);
            const batchResults = await Promise.allSettled(batch);
            results.push(...batchResults);
            
            console.log(`📊 批量操作進度: ${Math.min(i + batchSize, operations.length)}/${operations.length}`);
        }
        
        return results;
    };

    // 自動初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            AureliaTavernBridge.initialize();
        });
    } else {
        AureliaTavernBridge.initialize();
    }

    console.log('✅ 酒館通信橋模組已加載');

})(window.AureliaTavernBridge = window.AureliaTavernBridge || {});