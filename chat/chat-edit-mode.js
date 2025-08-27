/**
 * 🔥 CHAT面板酒館ID綁定與刪除功能
 * 功能：為每條消息綁定酒館ID，支持刪除酒館消息
 */

(function() {
    'use strict';

    // === 配置常量 ===
    const CONFIG = {
        LONG_PRESS_DURATION: 300,
        DEBUG_MODE: true,
        SYNC_INTERVAL: 2000,
        DELETE_DELAY: 200
    };

    // === 狀態管理 ===
    let editModeState = {
        isEditMode: false,
        selectedMessages: new Set(),
        longPressTimer: null,
        toolbar: null,
        syncInterval: null,
        tavernMessageMapping: new Map()
    };

    // === 日誌管理器 ===
    const Logger = {
        debug(message, ...args) {
            // 完全關閉調試日誌
        },
        info(message, ...args) {
            // 完全關閉信息日誌
        },
        warn(message, ...args) {
            // 完全關閉警告日誌
        },
        error(message, ...args) {
            // 只保留錯誤日誌
            console.error(`[酒館ID綁定] ${message}`, ...args);
        }
    };

    // === 酒館ID綁定管理器 ===
    const TavernIdBindingManager = {
        async bindTavernIdsToMessages() {
            // Logger.info('開始綁定酒館ID到消息...');
            
            try {
                const tavernMessages = await this.getTavernMessages();
                if (!tavernMessages || tavernMessages.length === 0) {
                    // 沒有酒館消息時靜默返回
                    return;
                }

                const chatMessages = document.querySelectorAll('.editable-message');
                if (chatMessages.length === 0) {
                    // 沒有CHAT面板消息時靜默返回，不輸出警告
                    return;
                }

                // Logger.info(`酒館消息: ${tavernMessages.length}條, CHAT面板消息: ${chatMessages.length}條`);

                await this.buildMessageMapping(tavernMessages, chatMessages);
                this.updateMessageAttributes();

                // Logger.info('酒館ID綁定完成');

            } catch (error) {
                Logger.error('綁定酒館ID失敗:', error);
            }
        },

        async getTavernMessages() {
            const tavernHelper = this.findTavernHelper();
            if (!tavernHelper?.getChatMessages) {
                // TavernHelper不可用時靜默返回
                return [];
            }

            try {
                const lastMessageId = await tavernHelper.getLastMessageId();
                if (lastMessageId < 0) {
                    // 沒有找到消息時靜默返回
                    return [];
                }

                const messages = await tavernHelper.getChatMessages(`0-${lastMessageId}`, { 
                    include_swipes: true 
                });

                // Logger.debug(`獲取到${messages.length}條酒館消息`);
                return messages;

            } catch (error) {
                Logger.error('獲取酒館消息失敗:', error);
                return [];
            }
        },

        async buildMessageMapping(tavernMessages, chatMessages) {
            // Logger.info('建立消息映射關係...');
            
            editModeState.tavernMessageMapping.clear();

            const userMessages = tavernMessages.filter(msg => msg.role === 'user');
            const aiMessages = tavernMessages.filter(msg => msg.role === 'assistant');

            // Logger.debug(`用戶消息: ${userMessages.length}條, AI消息: ${aiMessages.length}條`);

            // 處理用戶消息（1對1映射）
            let userMessageIndex = 0;
            for (const chatMessage of chatMessages) {
                const isAIMessage = chatMessage.getAttribute('data-is-ai-message') === 'true';
                
                if (!isAIMessage && userMessageIndex < userMessages.length) {
                    const tavernMessage = userMessages[userMessageIndex];
                    const chatMessageId = this.getChatMessageId(chatMessage);
                    
                    editModeState.tavernMessageMapping.set(chatMessageId, {
                        tavernId: tavernMessage.message_id,
                        role: 'user',
                        messageIndex: 0
                    });
                    
                    // Logger.debug(`用戶消息映射: ${chatMessageId} → 酒館ID:${tavernMessage.message_id}`);
                    userMessageIndex++;
                }
            }

            // 處理AI消息（1對多映射）
            let aiMessageIndex = 0;
            for (const chatMessage of chatMessages) {
                const isAIMessage = chatMessage.getAttribute('data-is-ai-message') === 'true';
                
                if (isAIMessage && aiMessageIndex < aiMessages.length) {
                    const tavernMessage = aiMessages[aiMessageIndex];
                    const chatMessageId = this.getChatMessageId(chatMessage);
                    
                    const existingMapping = Array.from(editModeState.tavernMessageMapping.values())
                        .find(mapping => mapping.tavernId === tavernMessage.message_id);
                    
                    let messageIndex = 0;
                    if (existingMapping) {
                        const sameTavernIdCount = Array.from(editModeState.tavernMessageMapping.values())
                            .filter(mapping => mapping.tavernId === tavernMessage.message_id).length;
                        messageIndex = sameTavernIdCount;
                    }
                    
                    editModeState.tavernMessageMapping.set(chatMessageId, {
                        tavernId: tavernMessage.message_id,
                        role: 'assistant',
                        messageIndex: messageIndex
                    });
                    
                    // Logger.debug(`AI消息映射: ${chatMessageId} → 酒館ID:${tavernMessage.message_id}:${messageIndex}`);
                }
            }

            // Logger.info(`映射完成，共建立${editModeState.tavernMessageMapping.size}個映射關係`);
        },

        updateMessageAttributes() {
            const chatMessages = document.querySelectorAll('.editable-message');
            
            chatMessages.forEach(chatMessage => {
                const chatMessageId = this.getChatMessageId(chatMessage);
                const mapping = editModeState.tavernMessageMapping.get(chatMessageId);
                
                if (mapping) {
                    chatMessage.setAttribute('data-tavern-message-id', mapping.tavernId.toString());
                    chatMessage.setAttribute('data-tavern-role', mapping.role);
                    chatMessage.setAttribute('data-tavern-index', mapping.messageIndex.toString());
                    
                    // Logger.debug(`更新屬性: ${chatMessageId} → 酒館ID:${mapping.tavernId}`);
                } else {
                    chatMessage.removeAttribute('data-tavern-message-id');
                    chatMessage.removeAttribute('data-tavern-role');
                    chatMessage.removeAttribute('data-tavern-index');
                }
            });
        },

        getChatMessageId(element) {
            return element.getAttribute('data-message-id') || 
                   element.id || 
                   `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        },

        findTavernHelper() {
            const accessPaths = [
                () => window.TavernHelper,
                () => window.parent?.TavernHelper,
                () => window.parent?.parent?.TavernHelper,
                () => window.top?.TavernHelper
            ];
            
            for (const accessPath of accessPaths) {
                try {
                    const helper = accessPath();
                    if (helper && typeof helper === 'object') {
                        return helper;
                    }
                } catch (error) {
                    // Logger.debug('訪問路徑失敗:', error);
                }
            }
            
            return null;
        },

        async rebindAfterDeletion() {
            // Logger.info('刪除後重新綁定酒館ID...');
            
            setTimeout(async () => {
                await this.bindTavernIdsToMessages();
            }, 1000);
        }
    };

    // === 刪除管理器 ===
    const DeleteManager = {
        async deleteSelectedMessages() {
            const selectedMessages = Array.from(editModeState.selectedMessages);
            
            if (selectedMessages.length === 0) {
                // 沒有選中要刪除的消息時靜默返回
                return;
            }

            const confirmed = await this.showDeleteConfirmDialog(selectedMessages);
            if (!confirmed) return;

            try {
                // Logger.info(`開始刪除${selectedMessages.length}條消息`);

                const tavernIdsToDelete = new Set();
                
                selectedMessages.forEach(message => {
                    const tavernId = message.getAttribute('data-tavern-message-id');
                    if (tavernId) {
                        tavernIdsToDelete.add(parseInt(tavernId));
                        // Logger.debug(`準備刪除酒館ID: ${tavernId}`);
                    }
                });

                if (tavernIdsToDelete.size === 0) {
                    // 沒有找到有效的酒館ID時靜默返回
                    return;
                }

                await this.executeDeletion(Array.from(tavernIdsToDelete));
                this.removeSelectedMessagesFromDOM();
                await TavernIdBindingManager.rebindAfterDeletion();
                ChatEditMode.exitEditMode();

                // Logger.info('消息刪除完成');

            } catch (error) {
                Logger.error('刪除消息失敗:', error);
                this.showErrorDialog('刪除消息失敗，請重試');
            }
        },

        async executeDeletion(tavernIds) {
            const tavernHelper = TavernIdBindingManager.findTavernHelper();
            if (!tavernHelper?.triggerSlash) {
                throw new Error('TavernHelper.triggerSlash不可用');
            }

            // Logger.info(`執行刪除操作，酒館ID: ${tavernIds.join(', ')}`);

            for (const tavernId of tavernIds) {
                const deleteCommand = `/cut ${tavernId}`;
                
                try {
                    await tavernHelper.triggerSlash(deleteCommand);
                    // Logger.debug(`刪除命令已發送: ${deleteCommand}`);
                    
                    await new Promise(resolve => setTimeout(resolve, CONFIG.DELETE_DELAY));
                    
                } catch (error) {
                    Logger.error(`刪除酒館ID ${tavernId} 失敗:`, error);
                }
            }
        },

        removeSelectedMessagesFromDOM() {
            editModeState.selectedMessages.forEach(element => {
                const fullMessageElement = element.closest('.message');
                if (fullMessageElement) {
                    fullMessageElement.remove();
                    // Logger.debug('刪除完整消息元素');
                } else {
                    element.remove();
                    // Logger.debug('刪除消息容器元素');
                }
            });
        },

        async showDeleteConfirmDialog(selectedMessages) {
            return new Promise((resolve) => {
                const modal = document.createElement('div');
                modal.className = 'delete-confirm-modal';
                modal.innerHTML = `
                    <div class="delete-confirm-content">
                        <div class="delete-confirm-title">確認刪除</div>
                        <div class="delete-confirm-message">確定要刪除選中的 ${selectedMessages.length} 條消息嗎？</div>
                        <div class="delete-confirm-buttons">
                            <button class="cancel-btn" onclick="this.closest('.delete-confirm-modal').remove(); window._resolveDeleteConfirm(false);">取消</button>
                            <button class="confirm-btn" onclick="this.closest('.delete-confirm-modal').remove(); window._resolveDeleteConfirm(true);">刪除</button>
                        </div>
                    </div>
                `;

                document.body.appendChild(modal);
                window._resolveDeleteConfirm = resolve;

                modal.addEventListener('click', (e) => {
                    if (e.target === modal) {
                        modal.remove();
                        resolve(false);
                    }
                });
            });
        },

        showErrorDialog(message) {
            const modal = document.createElement('div');
            modal.className = 'delete-confirm-modal';
            modal.innerHTML = `
                <div class="delete-confirm-content">
                    <div class="delete-confirm-title">錯誤</div>
                    <div class="delete-confirm-message">${message}</div>
                    <div class="delete-confirm-buttons">
                        <button class="cancel-btn" onclick="this.closest('.delete-confirm-modal').remove();">確定</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.remove();
                }
            });
        }
    };

    // === 長按檢測管理器 ===
    const LongPressManager = {
        startTimer(element, event) {
            this.clearTimer();
            
            editModeState.longPressTimer = setTimeout(() => {
                this.triggerLongPress(element, event);
            }, CONFIG.LONG_PRESS_DURATION);
        },

        clearTimer() {
            if (editModeState.longPressTimer) {
                clearTimeout(editModeState.longPressTimer);
                editModeState.longPressTimer = null;
            }
        },

        triggerLongPress(element, event) {
            // Logger.debug('長按觸發');
            
            if (editModeState.isEditMode) {
                if (navigator.vibrate) {
                    navigator.vibrate(50);
                }
                
                setTimeout(() => {
                    ChatEditMode.enterEditMode(element);
                }, 200);
            } else {
                ChatEditMode.enterEditMode(element);
            }
        }
    };

    // === 編輯模式管理器 ===
    const EditModeManager = {
        enterEditMode(triggerElement) {
            if (editModeState.isEditMode) return;
            
            // Logger.info('進入編輯模式');
            editModeState.isEditMode = true;
            
            this.addEditModeToAllMessages();
            this.createToolbar();
            this.addEditModeEventListeners();
        },

        exitEditMode() {
            if (!editModeState.isEditMode) return;
            
            // Logger.info('退出編輯模式');
            editModeState.isEditMode = false;
            
            editModeState.selectedMessages.clear();
            this.removeEditModeFromAllMessages();
            this.removeToolbar();
            this.removeEditModeEventListeners();
        },

        addEditModeToAllMessages() {
            const messages = document.querySelectorAll('.editable-message');
            messages.forEach(message => {
                message.classList.add('edit-mode');
                this.addCheckboxToMessage(message);
            });
        },

        removeEditModeFromAllMessages() {
            const messages = document.querySelectorAll('.editable-message');
            messages.forEach(message => {
                message.classList.remove('edit-mode', 'selected');
                this.removeCheckboxFromMessage(message);
            });
        },

        createToolbar() {
            this.removeToolbar();
            
            editModeState.toolbar = document.createElement('div');
            editModeState.toolbar.className = 'edit-mode-toolbar';
            editModeState.toolbar.innerHTML = `
                <button class="select-all-btn" onclick="ChatEditMode.selectAllMessages()">
                    <span>全選</span>
                </button>
                <span class="selected-count">請選擇要操作的消息</span>
                <button class="delete-btn" onclick="ChatEditMode.deleteSelectedMessages()">
                    <span>🗑️</span>
                    <span>刪除</span>
                </button>
                <button class="cancel-btn" onclick="ChatEditMode.exitEditMode()">
                    <span>取消</span>
                </button>
            `;
            
            document.body.appendChild(editModeState.toolbar);
            this.updateToolbarCount();
        },

        removeToolbar() {
            if (editModeState.toolbar) {
                editModeState.toolbar.remove();
                editModeState.toolbar = null;
            }
        },

        updateToolbarCount() {
            if (editModeState.toolbar) {
                const countElement = editModeState.toolbar.querySelector('.selected-count');
                if (countElement) {
                    if (editModeState.selectedMessages.size === 0) {
                        countElement.textContent = '請選擇要操作的消息';
                    } else {
                        countElement.textContent = `已選擇 ${editModeState.selectedMessages.size} 條消息`;
                    }
                }
            }
        },

        addEditModeEventListeners() {
            document.addEventListener('click', this.handleEditModeClick);
            document.addEventListener('keydown', this.handleEditModeKeydown);
        },

        removeEditModeEventListeners() {
            document.removeEventListener('click', this.handleEditModeClick);
            document.removeEventListener('keydown', this.handleEditModeKeydown);
        },

        handleEditModeClick(event) {
            const messageElement = event.target.closest('.editable-message');
            if (messageElement) {
                event.preventDefault();
                event.stopPropagation();
                
                if (editModeState.selectedMessages.has(messageElement)) {
                    ChatEditMode.deselectMessage(messageElement);
                } else {
                    ChatEditMode.selectMessage(messageElement);
                }
            }
        },

        handleEditModeKeydown(event) {
            if (event.key === 'Escape') {
                ChatEditMode.exitEditMode();
            }
        },
        
        addCheckboxToMessage(message) {
            if (message.querySelector('.edit-mode-checkbox')) {
                return;
            }
            
            const checkboxContainer = document.createElement('div');
            checkboxContainer.className = 'edit-mode-checkbox-container';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'edit-mode-checkbox';
            checkbox.setAttribute('data-message-id', message.getAttribute('data-message-id'));
            
            checkbox.addEventListener('change', (event) => {
                event.stopPropagation();
                if (checkbox.checked) {
                    ChatEditMode.selectMessage(message);
                } else {
                    ChatEditMode.deselectMessage(message);
                }
            });
            
            checkboxContainer.appendChild(checkbox);
            message.insertBefore(checkboxContainer, message.firstChild);
        },
        
        removeCheckboxFromMessage(message) {
            const checkboxContainer = message.querySelector('.edit-mode-checkbox-container');
            if (checkboxContainer) {
                checkboxContainer.remove();
            }
        }
    };

    // === 消息選擇管理器 ===
    const MessageSelectionManager = {
        selectMessage(element) {
            if (!editModeState.isEditMode) return;
            
            editModeState.selectedMessages.add(element);
            element.classList.add('selected');
            
            const checkbox = element.querySelector('.edit-mode-checkbox');
            if (checkbox) {
                checkbox.checked = true;
            }
            
            if (navigator.vibrate) {
                navigator.vibrate(30);
            }
            
            // Logger.debug('選擇消息:', element.getAttribute('data-message-id'));
            EditModeManager.updateToolbarCount();
        },

        deselectMessage(element) {
            if (!editModeState.isEditMode) return;
            
            editModeState.selectedMessages.delete(element);
            element.classList.remove('selected');
            
            const checkbox = element.querySelector('.edit-mode-checkbox');
            if (checkbox) {
                checkbox.checked = false;
            }
            
            // Logger.debug('取消選擇消息:', element.getAttribute('data-message-id'));
            EditModeManager.updateToolbarCount();
        },

        selectAllMessages() {
            const messages = document.querySelectorAll('.editable-message');
            messages.forEach(message => {
                this.selectMessage(message);
            });
            
            // Logger.info('全選消息:', messages.length);
        }
    };

    // === 事件管理器 ===
    const EventManager = {
        init() {
            this.addGlobalEventListeners();
            this.startAutoSync();
            // Logger.info('事件管理器初始化完成');
        },

        addGlobalEventListeners() {
            document.addEventListener('mousedown', this.handleMouseDown);
            document.addEventListener('mouseup', this.handleMouseUp);
            document.addEventListener('mouseleave', this.handleMouseLeave);
            document.addEventListener('touchstart', this.handleTouchStart);
            document.addEventListener('touchend', this.handleTouchEnd);
            document.addEventListener('touchcancel', this.handleTouchCancel);
        },

        handleMouseDown(event) {
            const messageElement = event.target.closest('.editable-message');
            if (!messageElement || editModeState.isEditMode) return;

            LongPressManager.startTimer(messageElement, event);
        },

        handleMouseUp(event) {
            LongPressManager.clearTimer();
        },

        handleMouseLeave(event) {
            LongPressManager.clearTimer();
        },

        handleTouchStart(event) {
            const messageElement = event.target.closest('.editable-message');
            if (!messageElement || editModeState.isEditMode) return;

            LongPressManager.startTimer(messageElement, event);
        },

        handleTouchEnd(event) {
            LongPressManager.clearTimer();
        },

        handleTouchCancel(event) {
            LongPressManager.clearTimer();
        },

        startAutoSync() {
            // 🔥 修改：只在CHAT面板真正顯示且有消息時才開始自動同步
            if (!isEditModeInitialized) {
                // Logger.debug('CHAT面板未初始化，跳過自動同步');
                return;
            }
            
            if (editModeState.syncInterval) {
                clearInterval(editModeState.syncInterval);
            }
            
            editModeState.syncInterval = setInterval(async () => {
                if (isEditModeInitialized) {
                    // 檢查是否有CHAT面板消息，沒有就不執行
                    const chatMessages = document.querySelectorAll('.editable-message');
                    if (chatMessages.length > 0) {
                        await TavernIdBindingManager.bindTavernIdsToMessages();
                    }
                }
            }, CONFIG.SYNC_INTERVAL);
            
            // Logger.debug('自動同步已開始');
        }
    };

    // === 公共API ===
    window.ChatEditMode = {
        init() {
            EventManager.init();
            // 🔥 修改：只在有CHAT面板消息時才執行初始綁定
            const chatMessages = document.querySelectorAll('.editable-message');
            if (chatMessages.length > 0) {
                TavernIdBindingManager.bindTavernIdsToMessages();
            }
            // Logger.info('酒館ID綁定功能初始化完成');
            // 注意：不自動調用startAutoSync()，只在需要時手動調用
        },

        enterEditMode(triggerElement) {
            EditModeManager.enterEditMode(triggerElement);
        },

        exitEditMode() {
            EditModeManager.exitEditMode();
        },

        selectMessage(element) {
            MessageSelectionManager.selectMessage(element);
        },

        deselectMessage(element) {
            MessageSelectionManager.deselectMessage(element);
        },

        selectAllMessages() {
            MessageSelectionManager.selectAllMessages();
        },

        deleteSelectedMessages() {
            DeleteManager.deleteSelectedMessages();
        },

        async syncTavernIds() {
            await TavernIdBindingManager.bindTavernIdsToMessages();
            return '酒館ID同步完成';
        },

        getState() {
            return {
                isEditMode: editModeState.isEditMode,
                selectedCount: editModeState.selectedMessages.size,
                mappingSize: editModeState.tavernMessageMapping.size
            };
        },

        debug() {
            // Logger.info('當前狀態:', this.getState());
            // Logger.info('映射關係:', editModeState.tavernMessageMapping);
        }
    };

    // 🔥 修改：延遲初始化，只在CHAT面板真正顯示時才初始化
    let isEditModeInitialized = false;
    let editModeInitTimeout = null;

    // 檢測CHAT面板是否真正顯示
    function checkChatPanelVisibility() {
        try {
            const rect = document.body.getBoundingClientRect();
            const isVisible = rect.width > 0 && rect.height > 0;
            const isParentActive = !window.parent.document.hidden;
            return isVisible && isParentActive;
        } catch (error) {
            return true;
        }
    }

    // 延遲初始化函數
    function delayedEditModeInit() {
        if (isEditModeInitialized) return;
        
        if (checkChatPanelVisibility()) {
            isEditModeInitialized = true;
            if (editModeInitTimeout) {
                clearTimeout(editModeInitTimeout);
                editModeInitTimeout = null;
            }
            window.ChatEditMode.init();
            addStyles();
            
            // 🔥 新增：在初始化完成後啟動自動同步
            setTimeout(() => {
                EventManager.startAutoSync();
            }, 1000);
            
            // Logger.info('CHAT面板酒館ID綁定功能已啟動');
        } else {
            editModeInitTimeout = setTimeout(delayedEditModeInit, 1000);
        }
    }

    // 監聽CHAT面板顯示事件
    function setupEditModeVisibilityListener() {
        window.addEventListener('message', function(event) {
            if (event.data?.type === 'IFRAME_SHOWN' && event.data?.target === 'chat') {
                if (!isEditModeInitialized) {
                    delayedEditModeInit();
                }
            }
        });
        
        document.addEventListener('visibilitychange', function() {
            if (!document.hidden && !isEditModeInitialized) {
                delayedEditModeInit();
            }
        });
        
        window.addEventListener('focus', function() {
            if (!isEditModeInitialized) {
                delayedEditModeInit();
            }
        });
        
        setTimeout(delayedEditModeInit, 100);
    }

    // 自動初始化 - 只設置監聽器，不立即初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupEditModeVisibilityListener);
    } else {
        setupEditModeVisibilityListener();
    }

    // === 添加樣式 ===
    function addStyles() {
        const styleId = 'chat-edit-mode-styles';
        if (document.getElementById(styleId)) return;
        
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .editable-message.edit-mode {
                position: relative;
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .editable-message.edit-mode:hover {
                background: rgba(255, 255, 255, 0.1);
            }

            .editable-message.edit-mode.selected {
                background: rgba(76, 175, 80, 0.2);
                border: 2px solid #4CAF50;
            }

            .edit-mode-checkbox-container {
                position: absolute;
                top: 8px;
                left: 8px;
                z-index: 10;
            }

            .edit-mode-checkbox {
                width: 20px;
                height: 20px;
                cursor: pointer;
            }

            .edit-mode-toolbar {
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(0, 0, 0, 0.9);
                border-radius: 12px;
                padding: 12px 20px;
                display: flex;
                align-items: center;
                gap: 12px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                backdrop-filter: blur(10px);
                border: 1px solid rgba(255, 255, 255, 0.1);
                z-index: 10000;
            }

            .edit-mode-toolbar button {
                background: linear-gradient(135deg, #4CAF50, #45a049);
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 6px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 14px;
                font-weight: 500;
                transition: all 0.2s ease;
            }

            .edit-mode-toolbar button:hover {
                background: linear-gradient(135deg, #45a049, #3d8b40);
                transform: translateY(-1px);
            }

            .edit-mode-toolbar .delete-btn {
                background: linear-gradient(135deg, #f44336, #d32f2f);
            }

            .edit-mode-toolbar .delete-btn:hover {
                background: linear-gradient(135deg, #d32f2f, #b71c1c);
            }

            .edit-mode-toolbar .cancel-btn {
                background: linear-gradient(135deg, #9e9e9e, #757575);
            }

            .edit-mode-toolbar .cancel-btn:hover {
                background: linear-gradient(135deg, #757575, #616161);
            }

            .edit-mode-toolbar .selected-count {
                color: white;
                font-size: 14px;
                min-width: 120px;
                text-align: center;
            }

            .delete-confirm-modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10001;
            }

            .delete-confirm-content {
                background: white;
                border-radius: 12px;
                padding: 24px;
                max-width: 400px;
                width: 90%;
                text-align: center;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            }

            .delete-confirm-title {
                font-size: 18px;
                font-weight: bold;
                margin-bottom: 12px;
                color: #333;
            }

            .delete-confirm-message {
                font-size: 14px;
                color: #666;
                margin-bottom: 20px;
                line-height: 1.5;
            }

            .delete-confirm-buttons {
                display: flex;
                gap: 12px;
                justify-content: center;
            }

            .delete-confirm-buttons button {
                padding: 8px 20px;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                transition: all 0.2s ease;
            }

            .delete-confirm-buttons .cancel-btn {
                background: #9e9e9e;
                color: white;
            }

            .delete-confirm-buttons .cancel-btn:hover {
                background: #757575;
            }

            .delete-confirm-buttons .confirm-btn {
                background: #f44336;
                color: white;
            }

            .delete-confirm-buttons .confirm-btn:hover {
                background: #d32f2f;
            }

            @media (max-width: 768px) {
                .edit-mode-toolbar {
                    bottom: 10px;
                    padding: 10px 16px;
                    gap: 8px;
                }

                .edit-mode-toolbar button {
                    padding: 6px 12px;
                    font-size: 13px;
                }

                .edit-mode-toolbar .selected-count {
                    font-size: 13px;
                    min-width: 100px;
                }

                .edit-mode-checkbox {
                    width: 18px;
                    height: 18px;
                }
            }
        `;
        
        document.head.appendChild(style);
    }

})();
