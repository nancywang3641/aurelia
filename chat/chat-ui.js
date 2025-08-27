// =======================================================================
//                          UI 更新與渲染
// =======================================================================

/**
 * 🔥 修復版：返回聊天列表時的處理
 */
window.showChatList = function() {
    document.getElementById('chatDetailScreen').classList.add('hidden');
    document.getElementById('chatListScreen').classList.remove('hidden');
    
    // 🎨 通知父窗口已返回聊天列表
    if (typeof notifyParentWindowChange === 'function') {
        notifyParentWindowChange(false); // false = 不在聊天室，在聊天列表
    }
    
    // 🔥 修復：保存當前聊天狀態，不要完全清空
    if (currentChat) {
        saveChatState();
    }
    
    // 🔥 只清理當前聊天相關的狀態，不影響全局數據
    currentChat = null;
    messageDisplayQueue = [];
    isDisplayingMessages = false;
    currentMessages = [];
    lastDisplayedDate = null;
    isInitialChatLoad = false;

    // ★ 新增：重置時間提示狀態
    lastDisplayedSystemTimeContent = null;
    

    // 🆕 重置系统时间相关状态
lastSystemTime = null;
displayedSystemTimes.clear();

// 🔥 重置时间显示系统状态
if (typeof window.resetSystemTimeState === 'function') {
    window.resetSystemTimeState();
} else {
    // 如果函数不存在，直接重置相关变量
    lastSystemTime = null;
}
    
    if (currentChatBody) {
        currentChatBody.innerHTML = ''; 
    }

    if (CONFIG.DEBUG_MODE) console.log('[聊天面板] �� 返回聊天列表，已保存聊天狀態');

    // 🆕 新增：返回聊天列表時自動隱藏所有下拉選單
    document.querySelectorAll('.options-menu').forEach(menu => menu.classList.add('hidden'));

    // 🔥 新增：确保浮动按钮显示
    setTimeout(() => {
        const floatingAssistant = document.getElementById('floatingAssistant');
        if (floatingAssistant) {
            floatingAssistant.style.display = 'block';
            floatingAssistant.style.visibility = 'visible';
        }
    }, 100);
}

/**
 * 保存當前聊天的消息狀態
 */
function saveChatState() {
    if (currentChat) {
        const chatKey = `${currentChat.type}_${currentChat.id}`;
        chatMessageStates[chatKey] = {
            currentMessages: [...currentMessages],
            lastDisplayedDate: lastDisplayedDate,
            displayedCount: currentMessages.length,
            systemTimes: new Set(displayedSystemTimes) // 🆕 保存系统时间状态
        };
        if (CONFIG.DEBUG_MODE) console.log(`[聊天面板] 保存聊天狀態: ${chatKey}, 消息數: ${currentMessages.length}`);
        
        // 🔥 新增：保存聊天狀態到localStorage
        try {
            localStorage.setItem('chat_message_states', JSON.stringify(chatMessageStates));
            if (CONFIG.DEBUG_MODE) console.log('[聊天面板] 聊天狀態已保存到localStorage');
        } catch (error) {
            console.error('[聊天面板] 保存聊天狀態到localStorage失敗:', error);
        }
    }
}

/**
 * 恢復聊天狀態
 */
function restoreChatState() {
    if (currentChat) {
        const chatKey = `${currentChat.type}_${currentChat.id}`;
        const savedState = chatMessageStates[chatKey];
        
        if (savedState) {
            currentMessages = [...savedState.currentMessages];
            lastDisplayedDate = savedState.lastDisplayedDate;
            
            // 🆕 恢复系统时间状态
            if (savedState.systemTimes && Array.isArray(savedState.systemTimes)) {
                displayedSystemTimes = new Set(savedState.systemTimes);
            } else {
                displayedSystemTimes = new Set();
            }
            
            if (CONFIG.DEBUG_MODE) console.log(`[聊天面板] 恢復聊天狀態: ${chatKey}, 消息數: ${currentMessages.length}`);
            return true;
        }
    }
    return false;
}

/**
 * 🔥 修復版：顯示聊天詳情視圖 - 正確處理新創建的聊天
 */
async function showChatDetail(chat) {
    if (CONFIG.DEBUG_MODE) console.log(`[聊天面板] 打開聊天詳情: ${chat.name} (ID: ${chat.id})`);
    

    // ✅ 关键：用户打开聊天室时，清除该聊天室的未读数字
    if (chatUnreadState[chat.id]) {
        chatUnreadState[chat.id].count = 0;
        chatUnreadState[chat.id].lastMessageTime = null;
        Logger.debug(`清除聊天室 ${chat.id} 的未读计数`);
        
        // 🔥 新增：清除未讀計數後保存到localStorage
        try {
            localStorage.setItem('chat_unread_state', JSON.stringify(chatUnreadState));
            Logger.debug(`未讀計數已保存到localStorage: ${chat.id}`);
        } catch (error) {
            console.error('保存未讀計數到localStorage失敗:', error);
        }
        
        // 立即更新聊天列表显示
        updateChatListView();
        
        // 通知处理器清除未读
        if (window.parent) {
            try {
                window.parent.postMessage({
                    type: 'CLEAR_UNREAD',
                    chatId: chat.id
                }, '*');
            } catch (error) {
                console.log('无法通知处理器清除未读:', error);
            }
        }
    }
    
    // 🔥 修正：從正確的聊天存儲中獲取完整的聊天信息
    const chatStore = chat.type === 'dm' ? chatData.dmChats : 
                     chat.type === 'story' ? chatData.storyChats :
                     chatData.groupChats;
    
    // 獲取完整的聊天信息
    const fullChatInfo = chatStore[chat.id];
    if (fullChatInfo) {
        // 合併聊天列表信息和存儲信息
        currentChat = { ...chat, ...fullChatInfo };
        console.log('[聊天詳情] 使用完整聊天信息:', currentChat);
    } else {
        currentChat = chat;
        console.log('[聊天詳情] 使用聊天列表信息:', currentChat);
    }
    
    // 🔥 修正：對於群聊，也要更新聊天列表中的群組信息
    if (chat.type === 'group' && fullChatInfo) {
        // 更新聊天列表中的群組信息，確保 groupAvatar 等屬性正確顯示
        const chatIndex = chatData.chatList.findIndex(c => c.id === chat.id);
        if (chatIndex !== -1) {
            chatData.chatList[chatIndex] = { ...chatData.chatList[chatIndex], ...fullChatInfo };
            console.log('[聊天詳情] 已更新聊天列表中的群組信息');
        }
    }
    
    // 載入聊天室背景圖片
    if (typeof loadChatBackground === 'function') {
        loadChatBackground();
    }
    // ===== header 切換與私聊資料填充 =====
    const privateHeader = document.getElementById('privateChatHeader');
    const defaultHeader = document.getElementById('defaultChatHeader');
    if (chat.type === 'dm') {
        // 顯示私聊 header，隱藏原 header
        privateHeader.style.display = '';
        defaultHeader.style.display = 'none';
        
        // 🆕 設置私聊頭部信息
        const avatarImg = document.getElementById('privateHeaderAvatarImg');
        const nameElement = document.getElementById('privateHeaderName');
        
        // 🔥 修正：使用 currentChat 而不是 chat，因為 currentChat 包含完整的參與者信息
        const targetChat = currentChat || chat;
        
        // 🆕 優先使用角色頭像（對方角色的頭像）
        if (targetChat.characterAvatar) {
            avatarImg.src = targetChat.characterAvatar;
            console.log('[私聊頭部] 使用角色頭像:', targetChat.characterAvatar.substring(0, 50) + '...');
        } else {
            // 🆕 嘗試從 IndexedDB 獲取角色頭像
            if (window.privateChatManager && targetChat.participant2) {
                try {
                    console.log('[私聊頭部] 嘗試獲取角色頭像:', { participant2: targetChat.participant2, chatId: targetChat.id });
                    const participant = await window.privateChatManager.getParticipant(targetChat.participant2, targetChat.id, 'character');
                    console.log('[私聊頭部] 獲取到參與者信息:', participant);
                    if (participant && participant.avatar) {
                        avatarImg.src = participant.avatar;
                        console.log('[私聊頭部] 從 IndexedDB 獲取角色頭像:', participant.avatar.substring(0, 50) + '...');
                    } else {
                        avatarImg.src = 'https://files.catbox.moe/ew2nex.png';
                        console.log('[私聊頭部] 使用預設頭像 - 沒有找到角色頭像');
                    }
                } catch (error) {
                    console.warn('[私聊頭部] 獲取角色頭像失敗:', error);
                    avatarImg.src = 'https://files.catbox.moe/ew2nex.png';
                }
            } else {
                console.log('[私聊頭部] 無法獲取角色頭像:', { 
                    hasPrivateChatManager: !!window.privateChatManager, 
                    participant2: targetChat.participant2 
                });
                avatarImg.src = 'https://files.catbox.moe/ew2nex.png';
            }
        }
        
        // 🆕 設置角色名稱（對方角色）
        const characterName = targetChat.participant2 || targetChat.name || '角色名稱';
        nameElement.textContent = characterName;
        console.log('[私聊頭部] 設置角色名稱:', characterName);
        
    } else {
        // 顯示原 header，隱藏私聊 header
        privateHeader.style.display = 'none';
        defaultHeader.style.display = '';
        document.getElementById('chatTitle').textContent = chat.name || '聊天室';
    }
    currentChatBody = document.querySelector('#chatDetailScreen .chat-body');
    currentChatType = chat.type;
    
    // 🔥 檢查用戶是否真正看過這個聊天室
    const hasUserViewed = userViewedChats.has(chat.id);
    isInitialChatLoad = !hasUserViewed; // 只有真正沒看過的才算初次加載
    
    // 🔥 新增：檢查是否為新創建的聊天
    const isNewlyCreated = (newlyCreatedChatId === chat.id);
    if (isNewlyCreated) {
        if (CONFIG.DEBUG_MODE) console.log(`[聊天面板] 🆕 這是新創建的聊天: ${chat.id}`);
        // 標記用戶已查看過這個新聊天
        userViewedChats.add(chat.id);
        // 清除新創建聊天的標記
        newlyCreatedChatId = null;
    }
    
    // 标记聊天为已读
    markChatAsRead(chat.id);
    
    document.getElementById('chatListScreen').classList.add('hidden');
    document.getElementById('chatDetailScreen').classList.remove('hidden');
    
    // 🎨 通知父窗口已切換到聊天室
    if (typeof notifyParentWindowChange === 'function') {
        notifyParentWindowChange(true); // true = 在聊天室
    }
    
    // 🆕 更新聊天輸入框的顯示
    if (window.updateChatInputPlaceholder) {
        window.updateChatInputPlaceholder();
    }

    // 載入背景設置...
    const storageKey = `chat_bg_${currentChat.id}`;
    const savedUrl = localStorage.getItem(storageKey);
    if (savedUrl) {
        currentChatBody.style.backgroundImage = `url('${savedUrl}')`;
        currentChatBody.style.backgroundSize = 'cover';
        currentChatBody.style.backgroundPosition = 'center';
        currentChatBody.style.backgroundRepeat = 'no-repeat';
    } else {
        currentChatBody.style.backgroundImage = 'none';
    }

    // 🔥 修復：對於新創建的聊天，直接清空並等待數據
    if (isNewlyCreated) {
        if (CONFIG.DEBUG_MODE) console.log(`[聊天面板] 新創建的聊天，清空顯示等待數據: ${chat.id}`);
        messageDisplayQueue = [];
        currentMessages = [];
        lastDisplayedDate = null;
        isDisplayingMessages = false;
        currentChatBody.innerHTML = '';
        
        // ★ 新增：重置時間提示狀態
        lastDisplayedSystemTimeContent = null;

        // 🆕 重置系统时间相关状态
        lastSystemTime = null;
        displayedSystemTimes.clear();
        
        // 🔥 新增：為新聊天顯示歡迎消息
        showNewChatWelcome(chat);
    } else {
        // 🔥 修正：添加延遲檢查機制，確保消息數據已準備好
        await ensureChatDataReady(chat);
        
        // 嘗試恢復狀態，如果沒有保存的狀態才清空
        const hasRestoredState = restoreChatState();
        if (!hasRestoredState) {
            messageDisplayQueue = [];
            currentMessages = [];
            lastDisplayedDate = null;
            isDisplayingMessages = false;
            currentChatBody.innerHTML = '';
            
            // ★ 新增：重置時間提示狀態
            lastDisplayedSystemTimeContent = null;
            
            // 🆕 重置系统时间相关状态
            lastSystemTime = null;
            displayedSystemTimes.clear();
        } else {
            await renderSavedMessages();
        }
    }

    updateChatDetailView();
}

/**
 * 🔥 新增：確保聊天數據已準備好
 */
async function ensureChatDataReady(chat) {
    if (CONFIG.DEBUG_MODE) console.log(`[聊天面板] 檢查聊天數據是否準備好: ${chat.id}`);
    
    // 檢查聊天存儲中是否有消息數據
    const chatStore = chat.type === 'dm' ? chatData.dmChats : 
                     chat.type === 'story' ? chatData.storyChats :
                     chatData.groupChats;
    
    const chatInfo = chatStore[chat.id];
    const hasMessages = chatInfo && chatInfo.messages && chatInfo.messages.length > 0;
    
    if (hasMessages) {
        if (CONFIG.DEBUG_MODE) console.log(`[聊天面板] ✅ 聊天數據已準備好，有 ${chatInfo.messages.length} 條消息`);
        return;
    }
    
    // 如果沒有消息數據，主動請求數據並等待
    if (CONFIG.DEBUG_MODE) console.log(`[聊天面板] ⏳ 聊天數據未準備好，主動請求數據...`);
    
    // 主動請求數據
    if (window.parent) {
        try {
            window.parent.postMessage({
                type: 'REQUEST_FULL_CHAT_DATA',
                source: 'CHAT_PANEL_DATA_REQUEST',
                chatId: chat.id
            }, '*');
            if (CONFIG.DEBUG_MODE) console.log(`[聊天面板] 已發送數據請求`);
        } catch (error) {
            console.error('[聊天面板] 發送數據請求失敗:', error);
        }
    }
    
    // 等待數據載入，最多5秒，每500ms檢查一次
    for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 重新檢查數據
        const updatedChatInfo = chatStore[chat.id];
        const updatedHasMessages = updatedChatInfo && updatedChatInfo.messages && updatedChatInfo.messages.length > 0;
        
        if (updatedHasMessages) {
            if (CONFIG.DEBUG_MODE) console.log(`[聊天面板] ✅ 數據已載入完成，有 ${updatedChatInfo.messages.length} 條消息`);
            return;
        }
        
        // 每2秒重新請求一次數據
        if (i % 4 === 1 && window.parent) {
            try {
                window.parent.postMessage({
                    type: 'REQUEST_FULL_CHAT_DATA',
                    source: 'CHAT_PANEL_RETRY_REQUEST',
                    chatId: chat.id
                }, '*');
                if (CONFIG.DEBUG_MODE) console.log(`[聊天面板] 重新發送數據請求 (第${Math.floor(i/4) + 1}次)`);
            } catch (error) {
                console.error('[聊天面板] 重新發送數據請求失敗:', error);
            }
        }
    }
    
    if (CONFIG.DEBUG_MODE) console.log(`[聊天面板] ⚠️ 等待超時，使用現有數據`);
}

/**
 * 🔥 新增：為新聊天顯示歡迎消息
 */
function showNewChatWelcome(chat) {
    if (CONFIG.DEBUG_MODE) console.log(`[聊天面板] 為新聊天顯示歡迎消息: ${chat.name}`);
    
    const welcomeDiv = document.createElement('div');
    welcomeDiv.className = 'new-chat-welcome';
    welcomeDiv.style.cssText = `
        padding: 40px 20px;
        text-align: center;
        color: #666;
        font-size: 16px;
        line-height: 1.6;
    `;
    
    let welcomeMessage = '';
    if (chat.type === 'group') {
        welcomeMessage = `
            <div style="font-size: 24px; margin-bottom: 16px;">🎉</div>
            <div style="font-weight: bold; margin-bottom: 8px;">群組「${chat.name}」已創建！</div>
            <div style="font-size: 14px; color: #888;">
                群組管理員：${chat.admin || '未知'}<br>
                成員：${chat.members ? chat.members.join(', ') : '無'}
            </div>
            <div style="margin-top: 20px; font-size: 14px; color: #999;">
                開始和群組成員聊天吧！
            </div>
        `;
    } else {
        welcomeMessage = `
            <div style="font-size: 24px; margin-bottom: 16px;">💬</div>
            <div style="font-weight: bold; margin-bottom: 8px;">歡迎來到「${chat.name}」</div>
            <div style="margin-top: 20px; font-size: 14px; color: #999;">
                開始對話吧！
            </div>
        `;
    }
    
    welcomeDiv.innerHTML = welcomeMessage;
    currentChatBody.appendChild(welcomeDiv);
    
    // 🔥 3秒後自動清除歡迎消息（如果還沒有真實消息的話）
    setTimeout(() => {
        if (currentMessages.length === 0 && currentChatBody.contains(welcomeDiv)) {
            welcomeDiv.style.opacity = '0.5';
        }
    }, 3000);
}

/**
 * 重新渲染已保存的消息
 */
async function renderSavedMessages() {
    if (currentMessages.length > 0) {
        currentChatBody.innerHTML = '';
        let lastDate = null;
        
        for (const msg of currentMessages) {
            // 添加日期分隔符
            if (msg.date && msg.date !== lastDate) {
                const dateSeparator = document.createElement('div');
                dateSeparator.className = 'date-separator';
                dateSeparator.textContent = formatDateForDisplay(msg.date);
                currentChatBody.appendChild(dateSeparator);
                lastDate = msg.date;
            }
            
            // 添加消息
            const msgElement = await createMessage(msg, currentChat.type, currentMessages);
            msgElement.classList.add('visible'); // 直接顯示，不需要動畫
            currentChatBody.appendChild(msgElement);
        }

        // 滾動到底部
        setTimeout(() => {
            // 已禁用自动滚动
        }, 100);
    }
}

/**
 * 更新聊天列表
 */
function updateChatListView() {
    const unifiedChatList = document.getElementById('unifiedChatList');
    unifiedChatList.innerHTML = '';

    if (!chatData.chatList || chatData.chatList.length === 0) {
        const noChatsMsg = '<div style="text-align:center; padding:40px 20px; color:#999; font-size:14px;">暂无聊天<br><span style="font-size:12px; color:#ccc;">点击右上角+号创建聊天</span></div>';
        unifiedChatList.innerHTML = noChatsMsg;
        return;
    }

    // 先分組：非預設聊天室在前，預設聊天室在後
    const nonPreset = chatData.chatList.filter(c => !c.isPreset);
    const preset = chatData.chatList.filter(c => c.isPreset);

    // 非預設按最後消息時間排序
    nonPreset.sort((a, b) => {
        const timeA = getLastMessageTime(a);
        const timeB = getLastMessageTime(b);
        return new Date(timeB || 0) - new Date(timeA || 0);
    });
    // 預設聊天室不排序，保持原順序

    // 合併
    const sortedChats = [...nonPreset, ...preset];

    sortedChats.forEach(chat => {
        const chatItem = createChatItem(chat);
        unifiedChatList.appendChild(chatItem);
        
        // 🔥 新增：異步更新私聊頭像
        if (chat.type === 'dm' && !chat.characterAvatar && window.privateChatManager) {
            console.log('[聊天列表] 開始異步更新私聊頭像:', chat.id, chat.name);
            
            // 🔥 修正：從聊天對象中獲取角色名稱
            let characterName = '';
            if (chat.participant2) {
                // 如果有 participant2，直接使用
                characterName = chat.participant2;
            } else if (chat.name && chat.name.includes('⇆')) {
                // 如果沒有 participant2，從名稱中解析
                const participants = chat.name.split('⇆');
                if (participants.length === 2) {
                    characterName = participants[1].trim();
                }
            } else {
                // 如果都沒有，使用聊天名稱作為角色名稱
                characterName = chat.name;
            }
            
            if (characterName) {
                console.log('[聊天列表] 嘗試獲取角色頭像:', characterName, 'chatId:', chat.id);
                // 異步獲取角色頭像
                window.privateChatManager.getParticipant(characterName, chat.id, 'character').then(participant => {
                    console.log('[聊天列表] 獲取到參與者信息:', participant);
                    if (participant && participant.avatar) {
                        console.log('[聊天列表] 異步更新角色頭像:', characterName);
                        const avatarElement = chatItem.querySelector('.chat-avatar img');
                        if (avatarElement) {
                            avatarElement.src = participant.avatar;
                            console.log('[聊天列表] 已更新現有頭像元素');
                        } else {
                            // 如果沒有 img 元素，創建一個
                            const avatarContainer = chatItem.querySelector('.chat-avatar');
                            if (avatarContainer) {
                                avatarContainer.innerHTML = `<img src="${participant.avatar}" alt="角色頭像">`;
                                avatarContainer.classList.add('has-image');
                                console.log('[聊天列表] 已創建新的頭像元素');
                            }
                        }
                    } else {
                        console.log('[聊天列表] 沒有找到角色頭像:', participant);
                    }
                }).catch(error => {
                    console.warn('[聊天列表] 異步獲取角色頭像失敗:', error);
                });
            } else {
                console.log('[聊天列表] 無法確定角色名稱:', chat);
            }
        }
        
        // 🔥 新增：異步更新群聊頭像（參考私聊的處理方式）
        if (chat.type === 'group' && !chat.groupAvatar) {
            console.log('[聊天列表] 開始異步更新群聊頭像:', chat.id, chat.name);
            
            // 🔥 參考私聊：從正確的存儲位置獲取群組頭像
            // 使用 setTimeout 模擬異步操作，就像私聊一樣
            setTimeout(() => {
                let groupAvatar = null;
                
                // 1. 從 user_preset_chats 獲取（預設群組）
                const userPresets = JSON.parse(localStorage.getItem('user_preset_chats') || '[]');
                const presetGroup = userPresets.find(p => p.id === chat.id && p.type === 'group');
                if (presetGroup && presetGroup.groupAvatar) {
                    groupAvatar = presetGroup.groupAvatar;
                    console.log('[聊天列表] 從 user_preset_chats 獲取群組頭像');
                }
                
                // 2. 從臨時群組獲取（備用方案）
                if (!groupAvatar && window.temporaryGroups) {
                    const tempGroup = window.temporaryGroups.find(g => g.id === chat.id);
                    if (tempGroup && tempGroup.groupAvatar) {
                        groupAvatar = tempGroup.groupAvatar;
                        console.log('[聊天列表] 從臨時群組獲取群組頭像');
                    }
                }
                
                if (groupAvatar) {
                    console.log('[聊天列表] 異步更新群聊頭像:', chat.name);
                    const avatarElement = chatItem.querySelector('.chat-avatar img');
                    if (avatarElement) {
                        avatarElement.src = groupAvatar;
                        console.log('[聊天列表] 已更新群聊頭像元素');
                    } else {
                        // 如果沒有 img 元素，創建一個
                        const avatarContainer = chatItem.querySelector('.chat-avatar');
                        if (avatarContainer) {
                            avatarContainer.innerHTML = `<img src="${groupAvatar}" alt="群組頭像">`;
                            avatarContainer.classList.add('has-image');
                            console.log('[聊天列表] 已創建新的群聊頭像元素');
                        }
                    }
                    
                    // 更新聊天列表中的群聊對象
                    const chatIndex = chatData.chatList.findIndex(c => c.id === chat.id);
                    if (chatIndex !== -1) {
                        chatData.chatList[chatIndex].groupAvatar = groupAvatar;
                        console.log('[聊天列表] 已更新聊天列表中的群聊頭像信息');
                    }
                } else {
                    console.log('[聊天列表] 沒有找到群組頭像');
                }
            }, 100); // 模擬異步延遲
        } else {
            if (chat.type === 'dm') {
                console.log('[聊天列表] 跳過異步更新:', {
                    hasCharacterAvatar: !!chat.characterAvatar,
                    hasPrivateChatManager: !!window.privateChatManager
                });
            } else if (chat.type === 'group') {
                console.log('[聊天列表] 跳過群聊異步更新:', {
                    hasGroupAvatar: !!chat.groupAvatar,
                    hasGroupMemberManager: !!window.groupMemberManager
                });
            }
        }
    });
}

// 获取聊天的最后消息时间
function getLastMessageTime(chat) {
    const chatStore = chat.type === 'dm' ? chatData.dmChats : chatData.groupChats;
    const messages = chatStore[chat.id]?.messages || [];
    
    if (messages.length === 0) return chat.createdAt || null;
    
    // 找到最新的消息时间
    const lastMessage = messages[messages.length - 1];
    return lastMessage.time || lastMessage.timestamp || null;
}

/**
 * 🔥 無緩存版：更新聊天詳情頁的內容
 */
function updateChatDetailView() {
    if (!currentChat) return;
    
    const chatStore = currentChat.type === 'dm' ? chatData.dmChats : 
                     currentChat.type === 'story' ? chatData.storyChats :
                     chatData.groupChats;
    const newMessages = chatStore[currentChat.id]?.messages || [];
    
    // 🔥 簡單去重：只比較當前顯示的消息
    const displayedIds = new Set(currentMessages.map(m => m.id));
    const messagesToAdd = newMessages.filter(msg => !displayedIds.has(msg.id));
    
    if (messagesToAdd.length > 0) {
        // 🔥 减少日志输出：使用限制性日志
        Logger.limited('消息添加', `添加 ${messagesToAdd.length} 條消息`);
        
        // 🔥 核心邏輯：純粹根據 forceHistoryMode 判斷
        if (window.forceHistoryMode) {
            if (CONFIG.DEBUG_MODE) console.log('[聊天面板] 使用批量渲染模式（手動歷史查看）');
            renderHistoryMessagesBatch(messagesToAdd);
        } else {
            if (CONFIG.DEBUG_MODE) console.log('[聊天面板] 使用逐條動畫模式（AI新內容）');
            messagesToAdd.forEach(msg => messageDisplayQueue.push(msg));
            if (!isDisplayingMessages) {
                processMessageQueue().catch(error => {
                    console.error('[聊天面板] processMessageQueue 錯誤:', error);
                });
            }
        }
    }
}

/**
 * 創建聊天列表中的單個項目
 */
function createChatItem(chat) {
    // 外層容器
    const container = document.createElement('div');
    container.className = 'chat-item-container';
    
    // 內容區
    const item = document.createElement('div');
    let chatTypeClass = 'group-chat';
    if (chat.type === 'dm') chatTypeClass = 'private-chat';
    else if (chat.type === 'story') chatTypeClass = 'story-chat';
    item.className = `chat-item-content chat-item ${chatTypeClass}`;

    const chatStore = chat.type === 'dm' ? chatData.dmChats : 
                     chat.type === 'story' ? chatData.storyChats :
                     chatData.groupChats;
    
    // 🆕 為預設聊天室初始化空的聊天存儲
    if (chat.isPreset && !chatStore[chat.id]) {
        chatStore[chat.id] = { messages: [] };
    }
    
    const messages = chatStore[chat.id]?.messages || [];
    const lastMsg = messages[messages.length - 1];
    initChatUnreadState(chat.id);
    const unreadState = chatUnreadState[chat.id];
    let lastMessageText = '暂无消息';
    
    // 🆕 為預設聊天室顯示特殊提示
    if (chat.isPreset && (!lastMsg || !lastMsg.content)) {
        lastMessageText = '暂无消息'; // 直接顯示暂无消息，不顯示[預設聊天室]
    } else if (lastMsg && lastMsg.content) {
        if (lastMsg.sender === '系統' || lastMsg.sender === '系统') {
            lastMessageText = '[系统消息]';
        } else {
            lastMessageText = lastMsg.content
                .replace(/\[[^\]]+:[^\]]+\]/gi, '')
                .trim()
                .substring(0, 20);
        }
        if (lastMessageText === '') lastMessageText = '[媒体消息]';
    } else if (lastMsg) {
        lastMessageText = '[特殊消息]';
    }
    
    const lastMessageTime = formatTimeForChatList(lastMsg ? (lastMsg.time || '') : '');
    let unreadBadge = '';
    const unreadInfo = chatUnreadState[chat.id];
    if (unreadInfo && unreadInfo.count > 0) {
        const count = unreadInfo.count > 99 ? '99+' : unreadInfo.count;
        const singleDigit = unreadInfo.count < 10 ? 'single-digit' : '';
        unreadBadge = `<div class="unread-count ${singleDigit}">${count}</div>`;
        item.classList.add('has-unread');
    } else {
        item.classList.remove('has-unread');
    }
    let avatarClass = 'group-avatar';
    let avatarContent = '';
    let displayName = chat.name;
    if (chat.type === 'dm') {
        avatarClass = 'private-avatar';
        // 🆕 私聊：優先使用角色頭像
        if (chat.characterAvatar) {
            // 如果有角色頭像，使用圖片
            console.log('[聊天列表] 使用私聊角色頭像:', chat.name, chat.characterAvatar.substring(0, 50) + '...');
            avatarContent = `<img src="${chat.characterAvatar}" alt="角色頭像">`;
            avatarClass += ' has-image'; // 🆕 添加圖片樣式類
        } else {
            // 🔥 新增：嘗試從 IndexedDB 獲取角色頭像
            if (window.privateChatManager && chat.id) {
                // 🔥 修正：從聊天對象中獲取角色名稱
                let characterName = '';
                if (chat.participant2) {
                    // 如果有 participant2，直接使用
                    characterName = chat.participant2;
                } else if (chat.name && chat.name.includes('⇆')) {
                    // 如果沒有 participant2，從名稱中解析
                    const participants = chat.name.split('⇆');
                    if (participants.length === 2) {
                        characterName = participants[1].trim();
                    }
                } else {
                    // 如果都沒有，使用聊天名稱作為角色名稱
                    characterName = chat.name;
                }
                
                if (characterName) {
                    // 異步獲取角色頭像
                    window.privateChatManager.getParticipant(characterName, chat.id, 'character').then(participant => {
                        if (participant && participant.avatar) {
                            console.log('[聊天列表] 從 IndexedDB 獲取角色頭像:', characterName);
                            const avatarElement = item.querySelector('.chat-avatar img');
                            if (avatarElement) {
                                avatarElement.src = participant.avatar;
                            } else {
                                // 如果沒有 img 元素，創建一個
                                const avatarContainer = item.querySelector('.chat-avatar');
                                if (avatarContainer) {
                                    avatarContainer.innerHTML = `<img src="${participant.avatar}" alt="角色頭像">`;
                                    avatarContainer.classList.add('has-image');
                                }
                            }
                        }
                    }).catch(error => {
                        console.warn('[聊天列表] 獲取角色頭像失敗:', error);
                    });
                }
            }
            
            // 如果沒有角色頭像，使用文字
            console.log('[聊天列表] 私聊無頭像，使用文字:', chat.name);
            avatarContent = chat.name.length > 0 ? chat.name.charAt(0).toUpperCase() : '👤';
        }
    } else if (chat.type === 'story') {
        avatarClass = 'story-avatar';
        avatarContent = '';
        // 劇情聊天室顯示POV角色名
        displayName = chat.narrator || chat.name;
    } else {
        // 🆕 群組聊天：優先使用群組頭像
        avatarClass = 'group-avatar';
        if (chat.groupAvatar) {
            // 如果有群組頭像，使用圖片
            console.log('[聊天列表] 使用群組頭像:', chat.name, chat.groupAvatar.substring(0, 50) + '...');
            avatarContent = `<img src="${chat.groupAvatar}" alt="群組頭像">`;
            avatarClass += ' has-image'; // 🆕 添加圖片樣式類
        } else {
            // 如果沒有群組頭像，使用文字
            console.log('[聊天列表] 群組無頭像，使用文字:', chat.name);
            avatarContent = chat.name.length > 0 ? chat.name.charAt(0).toUpperCase() : '👥';
        }
    }
    
    item.innerHTML = `
        <div class="chat-avatar ${avatarClass}">${avatarContent}</div>
        <div class="chat-info">
            <div class="chat-name">${displayName}</div>
            <div class="chat-last-message">${lastMessageText}</div>
        </div>
        ${unreadBadge}
    `;

    // 🆕 移除刪除按鈕區，改為長按觸發
    container.appendChild(item);

    // 🆕 長按刪除事件 - 替換左滑刪除
    let longPressTimer = null;
    let isLongPressed = false;
    const LONG_PRESS_DURATION = 800; // 800毫秒長按觸發
    
    // 長按開始
    function startLongPress(e) {
        if (longPressTimer) return;
        
        // 不阻止預設行為，讓點擊事件能正常工作
        // e.preventDefault();
        // e.stopPropagation();
        
        longPressTimer = setTimeout(() => {
            isLongPressed = true;
            showDeleteConfirmModal(chat);
            // 添加視覺反饋
            item.style.transform = 'scale(0.95)';
            item.style.opacity = '0.8';
        }, LONG_PRESS_DURATION);
    }
    
    // 長按結束
    function endLongPress() {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        if (isLongPressed) {
            isLongPressed = false;
            // 恢復視覺效果
            item.style.transform = '';
            item.style.opacity = '';
        }
    }
    
    // 支援 touch 長按
    item.addEventListener('touchstart', function(e) {
        // 不阻止預設行為，讓點擊事件能正常工作
        // e.preventDefault();
        // e.stopPropagation();
        startLongPress(e);
    }, { passive: true }); // 改為被動模式，不阻止預設行為
    
    item.addEventListener('touchend', function(e) {
        // 不阻止預設行為，讓點擊事件能正常工作
        // e.preventDefault();
        // e.stopPropagation();
        endLongPress();
    }, { passive: true }); // 改為被動模式，不阻止預設行為
    
    item.addEventListener('touchcancel', function(e) {
        // 不阻止預設行為，讓點擊事件能正常工作
        // e.preventDefault();
        // e.stopPropagation();
        endLongPress();
    }, { passive: true }); // 改為被動模式，不阻止預設行為
    
    // 支援 mouse 長按
    item.addEventListener('mousedown', function(e) {
        // 不阻止預設行為，讓點擊事件能正常工作
        // e.preventDefault();
        // e.stopPropagation();
        startLongPress(e);
    });
    
    item.addEventListener('mouseup', function(e) {
        // 不阻止預設行為，讓點擊事件能正常工作
        // e.preventDefault();
        // e.stopPropagation();
        endLongPress();
    });
    
    item.addEventListener('mouseleave', function(e) {
        // 不阻止預設行為，讓點擊事件能正常工作
        // e.preventDefault();
        // e.stopPropagation();
        endLongPress();
    });
    
    // 防止長按時觸發點擊事件
    item.addEventListener('click', async function(e) {
        if (isLongPressed) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        await showChatDetail(chat);
    });
    return container;
}

// 刪除確認彈窗
function showDeleteConfirmModal(chat) {
    const modal = document.getElementById('deleteConfirmModal');
    const nameSpan = document.getElementById('deleteConfirmChatName');
    nameSpan.textContent = chat.name;
    modal.classList.remove('hidden');
    // 暫存要刪除的chatId
    window._pendingDeleteChatId = chat.id;
}

// 確認刪除
window.confirmDeleteChat = async function() {
    const chatId = window._pendingDeleteChatId;
    if (!chatId) return;
    
    console.log(`[刪除聊天室] 開始刪除聊天室: ${chatId}`);
    // 找到對應container
    const unifiedChatList = document.getElementById('unifiedChatList');
    const containers = unifiedChatList.querySelectorAll('.chat-item-container');
    let targetContainer = null;
    containers.forEach(c => {
        const name = c.querySelector('.chat-name')?.textContent;
        if (name && chatData.chatList.find(chat => chat.id === chatId && chat.name === name)) {
            targetContainer = c;
        }
    });
    if (targetContainer) {
        targetContainer.classList.add('deleting');
        setTimeout(async () => {
            // 刪除資料
            chatData.chatList = chatData.chatList.filter(c => c.id !== chatId);
            delete chatData.dmChats[chatId];
            delete chatData.groupChats[chatId];
            delete chatData.storyChats[chatId];
            
            // 🆕 清理 IndexedDB 中的群組成員數據
            if (window.groupMemberManager) {
                try {
                    await window.groupMemberManager.removeGroupMembers(chatId);
                    console.log(`[刪除聊天室] 已清理 IndexedDB 中的群組成員數據: ${chatId}`);
                } catch (error) {
                    console.warn('[刪除聊天室] 清理 IndexedDB 數據失敗:', error);
                }
            }
            
            // 🔥 重要：清理 IndexedDB 中的私聊參與者數據
            if (window.privateChatManager) {
                try {
                    await window.privateChatManager.deleteChatParticipants(chatId);
                    console.log(`[刪除聊天室] 已清理 IndexedDB 中的私聊參與者數據: ${chatId}`);
                } catch (error) {
                    console.warn('[刪除聊天室] 清理私聊參與者數據失敗:', error);
                }
            }
            
            // 🔥 重要：從用戶自訂預設列表中移除
            try {
                let userPresets = JSON.parse(localStorage.getItem('user_preset_chats') || '[]');
                userPresets = userPresets.filter(preset => preset.id !== chatId);
                localStorage.setItem('user_preset_chats', JSON.stringify(userPresets));
            } catch (error) {
                console.error('刪除用戶預設聊天室失敗:', error);
            }
            
            // 🔥 清理聊天室相關的本地存儲
            try {
                // 清理聊天背景設置
                localStorage.removeItem(`chat_bg_${chatId}`);
                // 清理聊天狀態
                delete chatMessageStates[`dm_${chatId}`];
                delete chatMessageStates[`group_${chatId}`];
                delete chatMessageStates[`story_${chatId}`];
                // 清理未讀狀態
                delete chatUnreadState[chatId];
                
                // 🆕 清理更多相關數據
                // 清理用戶查看狀態
                userViewedChats.delete(chatId);
                // 清理新創建聊天標記
                if (newlyCreatedChatId === chatId) {
                    newlyCreatedChatId = null;
                }
                // 清理當前聊天（如果是被刪除的聊天）
                if (currentChat && currentChat.id === chatId) {
                    currentChat = null;
                    currentChatBody = null;
                    currentChatType = '';
                }
                // 清理消息佇列中的相關消息
                messageDisplayQueue = messageDisplayQueue.filter(msg => msg.chatId !== chatId);
                // 清理當前消息列表
                currentMessages = currentMessages.filter(msg => msg.chatId !== chatId);
                
                console.log(`[刪除聊天室] 已清理所有相關數據: ${chatId}`);
            } catch (error) {
                console.error('清理聊天室相關存儲失敗:', error);
            }
            
            // 🔥 重要：如果是預設聊天室，使用 PresetChatManager 的刪除方法
            if (window.presetChatManager) {
                if (window.presetChatManager.removePresetChat) {
                    window.presetChatManager.removePresetChat(chatId);
                } else if (window.presetChatManager.saveChatsToStorage) {
                    window.presetChatManager.saveChatsToStorage();
                }
            }
            
            // 🔥 重要：清理私聊ID映射表中的數據
            if (window.privateChatIdMap) {
                const keysToDelete = [];
                for (const [key, value] of Object.entries(window.privateChatIdMap)) {
                    if (value === chatId) {
                        keysToDelete.push(key);
                    }
                }
                keysToDelete.forEach(key => {
                    delete window.privateChatIdMap[key];
                });
                
                // 保存更新後的映射表到 localStorage
                localStorage.setItem('privateChatIdMap', JSON.stringify(window.privateChatIdMap));
                
                console.log(`[刪除聊天室] 已清理私聊ID映射表: ${chatId}`, {
                    deletedKeys: keysToDelete,
                    remainingMappings: Object.keys(window.privateChatIdMap).length
                });
            }
            
            // 🔥 新增：清理群聊ID映射表中的數據
            if (window.groupChatIdMap) {
                const keysToDelete = [];
                for (const [key, value] of Object.entries(window.groupChatIdMap)) {
                    if (value === chatId) {
                        keysToDelete.push(key);
                    }
                }
                keysToDelete.forEach(key => {
                    delete window.groupChatIdMap[key];
                });
                
                // 保存更新後的映射表到 localStorage
                localStorage.setItem('groupChatIdMap', JSON.stringify(window.groupChatIdMap));
                
                console.log(`[刪除聊天室] 已清理群聊ID映射表: ${chatId}`, {
                    deletedKeys: keysToDelete,
                    remainingMappings: Object.keys(window.groupChatIdMap).length
                });
            }
            
            // 🆕 強制刷新聊天列表
            updateChatListView();
            
            // 🆕 如果當前在聊天詳情頁面且刪除的是當前聊天，返回聊天列表
            if (currentChat && currentChat.id === chatId) {
                document.getElementById('chatDetailScreen').classList.add('hidden');
                document.getElementById('chatListScreen').classList.remove('hidden');
            }
            
            showSuccessToast('聊天室已永久刪除');
        }, 400);
    }
    document.getElementById('deleteConfirmModal').classList.add('hidden');
    window._pendingDeleteChatId = null;
}

// 取消刪除
window.cancelDeleteChat = function() {
    document.getElementById('deleteConfirmModal').classList.add('hidden');
    window._pendingDeleteChatId = null;
}

/**
 * 🔥 修復版：處理並依序顯示訊息佇列中的內容 - 修复未读数字显示问题
 */
async function processMessageQueue() {
    if (messageDisplayQueue.length === 0) {
        isDisplayingMessages = false;
        saveChatState();
        return;
    }
    isDisplayingMessages = true;
    
    const msg = messageDisplayQueue.shift();
    
    // 系统消息现在使用统一格式，直接正常处理
    
    if (msg.content && msg.content.startsWith('[撤回|')) {
        handleMessageRecall(msg.content);
        await processMessageQueue();
        return;
    }
    
    // 檢查重複...
    const msgKey = `${msg.id}_${msg.sender}_${msg.content.substring(0, 50)}`;
    const existingMessage = currentMessages.find(m => 
        `${m.id}_${m.sender}_${m.content.substring(0, 50)}` === msgKey
    );
    
    if (existingMessage) {
        if (CONFIG.DEBUG_MODE) console.log(`[聊天面板] 跳过重复消息: ${msg.id}`);
        await processMessageQueue();
        return;
    }
    
    currentMessages.push(msg);
        
    // 日期分隔符邏輯
    if (msg.date && msg.date !== lastDisplayedDate) {
        const dateSeparator = document.createElement('div');
        dateSeparator.className = 'date-separator';
        dateSeparator.textContent = formatDateForDisplay(msg.date);
        currentChatBody.appendChild(dateSeparator);
        lastDisplayedDate = msg.date;
    }

    // 🔥 修改：創建並顯示「正在輸入中」的指示器（現在會根據發送者顯示在正確位置）
    const indicatorElement = createTypingIndicatorElement(msg);
    currentChatBody.appendChild(indicatorElement);
    setTimeout(() => {
        indicatorElement.classList.add('visible');
    }, 50);

    // 🔥 修改：根據消息發送者調整延遲時間
    // 🆕 判斷是否為主角發送的消息
    function isMessageFromProtagonist(msg) {
        console.log('[processMessageQueue主角判斷] 開始判斷:', {
            sender: msg.sender,
            hasIsProtagonist: msg.hasOwnProperty('isProtagonist'),
            isProtagonist: msg.isProtagonist,
            currentChat: currentChat ? { id: currentChat.id, type: currentChat.type, admin: currentChat.admin } : null
        });
        
        // 🆕 最高优先级：使用消息对象中的 isProtagonist 标记
        if (msg.hasOwnProperty('isProtagonist')) {
            console.log('[processMessageQueue主角判斷] 使用 isProtagonist 標記:', msg.isProtagonist);
            return msg.isProtagonist;
        }
        
        // 🆕 群聊模式：使用群组管理员名称
        if (currentChat && currentChat.type === 'group' && currentChat.admin) {
            const isAdmin = msg.sender === currentChat.admin;
            console.log('[processMessageQueue主角判斷] 群聊判斷:', {
                sender: msg.sender,
                admin: currentChat.admin,
                isAdmin: isAdmin
            });
            return isAdmin;
        }
        
        // 🆕 其他情况：使用全局用户名
        const currentProtagonist = protagonistName || '{{user}}';
        const possibleProtagonistNames = [
            currentProtagonist,
            '{{user}}',
            'User',
            '主角'
        ];
        const isGlobalProtagonist = possibleProtagonistNames.some(name => 
            msg.sender === name || 
            (msg.sender && msg.sender.toLowerCase() === name.toLowerCase())
        );
        console.log('[processMessageQueue主角判斷] 全局用戶名判斷:', {
            sender: msg.sender,
            currentProtagonist: currentProtagonist,
            possibleNames: possibleProtagonistNames,
            isGlobalProtagonist: isGlobalProtagonist
        });
        return isGlobalProtagonist;
    }
    
    const isFromProtagonist = isMessageFromProtagonist(msg);
    const isLocalSentMessage = msg.id.toString().startsWith('local_');
    const baseDelay = getNextMessageDelay(messageDisplayQueue.length);
    const extraDelay = 500;
    
    // 🔥 用戶消息的延遲稍短，因為通常用戶剛發送完消息就想看到結果
    let delay;
    if (isFromProtagonist || isLocalSentMessage) {
        delay = 300; // 用戶消息更快顯示
    } else {
        delay = baseDelay + extraDelay; // AI消息保持原有延遲
    }
    
    // ✅ 修复：正确处理消息的 chatId，不盲目覆盖
    let originalChatId = msg.chatId; // 保存原始的chatId
    let isFromOtherChat = false; // 标记是否来自其他聊天室
    
    if (!msg.chatId) {
        // 优先从消息来源获取正确的chatId
        if (msg.originalChatId) {
            msg.chatId = msg.originalChatId;
        } else if (msg.sourceChatId) {
            msg.chatId = msg.sourceChatId;
        } else {
            // 仅在确实无法获取时，才使用当前聊天室ID作为默认值
            msg.chatId = currentChat ? currentChat.id : 'unknown';
            msg.isDefaultChatId = true; // 添加标记，表明这是默认值
        }
    }
    
    // 判断消息是否来自其他聊天室
    if (currentChat && msg.chatId && msg.chatId !== currentChat.id) {
        isFromOtherChat = true;
    }
    
    // 如果消息的chatId被设置为默认值，也认为是来自其他聊天室
    if (msg.isDefaultChatId && currentChat) {
        isFromOtherChat = true;
    }

    // 延遲後，移除指示器並顯示真實訊息
    setTimeout(async () => {
        const indicatorToRemove = document.getElementById(indicatorElement.id);
        if (indicatorToRemove) indicatorToRemove.remove();

        // 🔥 传递完整的消息列表，用于通话状态检测
        const allMessages = currentMessages || [];
        const msgElement = await createMessage(msg, currentChat ? currentChat.type : 'group', allMessages);
        if (msgElement) {
            msgElement.dataset.messageId = msg.id;
            currentChatBody.appendChild(msgElement);
        } else {
            console.error('[聊天面板] createMessage 返回了 undefined，消息:', msg);
        }

        // ✅ 修复：更新未讀狀態逻辑 - 修复未读数字显示问题
        function shouldUpdateUnreadCount(msg, isFromProtagonist, isFromOtherChat) {
            // 如果消息来自主角，不更新未读
            if (isFromProtagonist) {
                return false;
            }
            
            // 如果没有当前聊天室，总是更新未读
            if (!currentChat) {
                return true;
            }
            
            // 如果明确标识为来自其他聊天室，更新未读
            if (isFromOtherChat) {
                return true;
            }
            
            // 如果消息的chatId与当前聊天室不同，更新未读
            if (msg.chatId && msg.chatId !== currentChat.id) {
                return true;
            }
            
            return false;
        }
        
        // 使用新的判断逻辑
        if (shouldUpdateUnreadCount(msg, isFromProtagonist, isFromOtherChat)) {
            const targetChatId = msg.chatId || 'unknown';
            updateUnreadCount(targetChatId, msg.time || new Date().toISOString());
            updateChatListView(); // 更新聊天列表顯示
            
            // 调试信息
            if (CONFIG.DEBUG_MODE) {
                console.log(`[聊天面板] 更新未读数字: ${targetChatId}, 来自: ${msg.sender}, 当前聊天: ${currentChat ? currentChat.id : '无'}`);
            }
        }

        // 如果是劇情訊息，添加打字機效果
        if (msg.type === 'scene') {
            const sceneElement = msgElement.querySelector('.scene-content');
            if (sceneElement) {
                const originalText = sceneElement.textContent;
                addTypingEffect(sceneElement, originalText, 60);
            }
        }

        setTimeout(() => {
            msgElement.classList.add('visible');
        }, 50);

        await processMessageQueue();
    }, delay);
}

/**
 * 創建"正在輸入中"動畫元素 (修復版 - 系統消息無頭像)
 */
function createTypingIndicatorElement(msg) {
    const indicatorDiv = document.createElement('div');
    
    // 🔥 新增：判斷是否為主角發送的消息
    function isMessageFromProtagonist(msg) {
        console.log('[输入指示器层主角判斷] 開始判斷:', {
            sender: msg.sender,
            hasIsProtagonist: msg.hasOwnProperty('isProtagonist'),
            isProtagonist: msg.isProtagonist,
            currentChat: currentChat ? { id: currentChat.id, type: currentChat.type, admin: currentChat.admin } : null
        });
        
        // 🆕 最高优先级：使用消息对象中的 isProtagonist 标记
        if (msg.hasOwnProperty('isProtagonist')) {
            console.log('[输入指示器层主角判斷] 使用 isProtagonist 標記:', msg.isProtagonist);
            return msg.isProtagonist;
        }
        
        // 🆕 群聊模式：使用群组管理员名称
        if (currentChat && currentChat.type === 'group' && currentChat.admin) {
            const isAdmin = msg.sender === currentChat.admin;
            console.log('[输入指示器层主角判斷] 群聊判斷:', {
                sender: msg.sender,
                admin: currentChat.admin,
                isAdmin: isAdmin
            });
            return isAdmin;
        }
        
        // 🆕 其他情况：使用全局用户名
        const currentProtagonist = protagonistName || '{{user}}';
        const possibleProtagonistNames = [
            currentProtagonist,
            '{{user}}',
            'User',
            '主角'
        ];
        const isGlobalProtagonist = possibleProtagonistNames.some(name => 
            msg.sender === name || 
            (msg.sender && msg.sender.toLowerCase() === name.toLowerCase())
        );
        console.log('[输入指示器层主角判斷] 全局用戶名判斷:', {
            sender: msg.sender,
            currentProtagonist: currentProtagonist,
            possibleNames: possibleProtagonistNames,
            isGlobalProtagonist: isGlobalProtagonist
        });
        return isGlobalProtagonist;
    }
    
    const isFromProtagonist = isMessageFromProtagonist(msg);
    
    // 🔥 减少重复日志：只在DEBUG模式下显示指示器创建
    if (CONFIG.DEBUG_MODE) console.log(`[聊天面板] 創建輸入指示器: ${msg.sender} -> ${isFromProtagonist ? '右側' : '左側'}`);
    
    // 🔥 修复：系统通知消息和剧情消息不显示头像，直接置中
    if (msg.type === 'system_notification' || msg.sender === '系統' || msg.sender === '系统' || msg.type === 'scene') {
        indicatorDiv.className = msg.type === 'scene' ? 'message scene-message-typing' : 'message system-notification-typing';
        indicatorDiv.id = `typing-indicator-${msg.id}`;
        indicatorDiv.style.cssText = `
            align-self: center;
            max-width: 90%;
            margin: 15px auto;
            display: flex;
            justify-content: center;
        `;
        
        // 创建消息容器（无头像）
        const messageContainer = document.createElement('div');
        messageContainer.className = 'message-container';
        
        // 剧情消息使用特殊的样式
        const contentStyle = msg.type === 'scene' ? `
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            text-align: center;
            font-weight: bold;
            border-radius: 12px;
            padding: 12px 16px;
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
        ` : `
            background: linear-gradient(135deg, #ff6b6b, #ffa500);
            color: white;
            text-align: center;
            font-weight: bold;
            border-radius: 12px;
            padding: 12px 16px;
            box-shadow: 0 4px 12px rgba(255, 107, 107, 0.3);
        `;
        
        messageContainer.innerHTML = `
            <div class="message-content" style="${contentStyle}">
                <div class="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        `;

        indicatorDiv.appendChild(messageContainer);
        return indicatorDiv;
    }
    
    // 🔥 關鍵修改：根據發送者設置正確的CSS類，並應用當前bubble樣式
    indicatorDiv.className = `message ${isFromProtagonist ? 'sent' : 'received'} typing-indicator`;
    indicatorDiv.id = `typing-indicator-${msg.id}`;
    
    // 🔥 新增：為用戶發送的消息應用當前bubble樣式和sent-bubble類
    if (isFromProtagonist) {
        indicatorDiv.classList.add('sent-bubble');
        if (window.currentBubbleStyle) {
            indicatorDiv.classList.add(window.currentBubbleStyle);
        }
    } else {
        // 🔥 新增：為角色發送的消息應用當前bubble樣式和received-bubble類
        indicatorDiv.classList.add('received-bubble');
        if (window.currentBubbleStyle) {
            indicatorDiv.classList.add(window.currentBubbleStyle);
        }
    }

    // --- 🔥 修復版：安全的頭像邏輯 ---
    const characterName = msg.sender || '未知';
    const normalizedName = getNormalizedCharacterName(characterName);
    const avatarUrl = `https://nancywang3641.github.io/sound-files/avatar/${encodeURIComponent(normalizedName)}.jpg`;
    
    // 🆕 最終fallback：如果所有頭像都失敗，使用預設頭像
    const fallbackAvatarUrl = 'https://files.catbox.moe/ew2nex.png';
    
    // 創建頭像圖片元素
    const imgElement = document.createElement('img');
    imgElement.src = avatarUrl;
    imgElement.className = 'avatar';
    imgElement.title = characterName;
    
    // 創建備用頭像元素
    const fallbackElement = document.createElement('div');
    fallbackElement.className = 'avatar';
    fallbackElement.title = characterName;
    fallbackElement.textContent = characterName.charAt(0).toUpperCase();
    
    // 🔥 修復：添加安全檢查的錯誤處理
    imgElement.onerror = function() {
        try {
            // 如果當前URL不是fallback URL，先嘗試fallback
            if (this.src !== fallbackAvatarUrl) {
                this.src = fallbackAvatarUrl;
                return;
            }
            
            // 如果fallback也失敗，使用文字頭像
            if (this.parentNode && this.parentNode.contains && this.parentNode.contains(this)) {
                this.parentNode.replaceChild(fallbackElement, this);
            } else if (CONFIG.DEBUG_MODE) {
                console.warn('[聊天面板] 輸入指示器頭像替換失敗：元素已從DOM中移除');
            }
        } catch (error) {
            if (CONFIG.DEBUG_MODE) console.error('[聊天面板] 輸入指示器頭像替換時出錯:', error);
        }
    };

    // 創建消息容器
    const messageContainer = document.createElement('div');
    messageContainer.className = 'message-container';
    messageContainer.innerHTML = `
        <div class="message-content">
            <div class="typing-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;

    // 🔥 關鍵修改：根據發送者調整頭像和容器的順序
    if (isFromProtagonist) {
        // 用戶消息：容器在左，頭像在右
        indicatorDiv.appendChild(messageContainer);
        indicatorDiv.appendChild(imgElement);
    } else {
        // 其他角色消息：頭像在左，容器在右
        indicatorDiv.appendChild(imgElement);
        indicatorDiv.appendChild(messageContainer);
    }
    
    return indicatorDiv;
}

/**
 * 🔥 修改：获取下一条訊息的顯示延迟（调慢一些）
 */
function getNextMessageDelay(remainingCount) {
    if (remainingCount > 5) return 800;   // 🔥 從2500改為800ms
    if (remainingCount > 2) return 1500;  // 🔥 從3800改為1200ms  
    return 2300;                          // 🔥 從5500改為1800ms
}

// 添加打字机效果函数
function addTypingEffect(element, text, speed = 50) {
    if (!element) return;
    
    element.textContent = '';
    element.classList.add('typing');
    
    let i = 0;
    const typeInterval = setInterval(() => {
        if (i < text.length) {
            element.textContent += text.charAt(i);
            i++;
        } else {
            clearInterval(typeInterval);
            element.classList.remove('typing');
        }
    }, speed);
}

// =======================================================================
//                       🔥 选项选单与模态窗口逻辑
// =======================================================================

/**
 * 開關右上角的下拉選單
 */
function toggleChatOptionsMenu() {
    const menu = document.getElementById('chatOptionsMenu');
    menu.classList.toggle('hidden');
    
    // 🆕 根據聊天類型顯示相應的設置選項
    if (!menu.classList.contains('hidden')) {
        updateChatOptionsMenu();
    }
}

/**
 * 🆕 根據聊天類型更新選項菜單
 */
function updateChatOptionsMenu() {
    const groupSettingsOption = document.getElementById('groupSettingsOption');
    const privateChatSettingsOption = document.getElementById('privateChatSettingsOption');
    
    // 隱藏所有設置選項
    groupSettingsOption.style.display = 'none';
    privateChatSettingsOption.style.display = 'none';
    
    // 根據當前聊天類型顯示相應的設置選項
    if (currentChat) {
        if (currentChat.type === 'group' || currentChat.type === 'group_chat') {
            groupSettingsOption.style.display = 'block';
        } else if (currentChat.type === 'dm' || currentChat.type === 'dm_chat') {
            privateChatSettingsOption.style.display = 'block';
        }
    }
}

/**
 * 打開背景設置模態窗口
 */
async function openBackgroundModal() {
    document.getElementById('chatOptionsMenu').classList.add('hidden'); // 關閉下拉選單
    document.getElementById('backgroundSettingsModal').classList.remove('hidden'); // 顯示模態窗口
    document.getElementById('backgroundUrlInput').value = ''; // 清空輸入框
    
    // 初始化背景圖片上傳功能
    if (typeof initBackgroundUpload === 'function') {
        try {
            await initBackgroundUpload();
        } catch (error) {
            console.error('[背景設置] 初始化上傳功能失敗:', error);
        }
    }
}

/**
 * 關閉背景設置模態窗口
 */
function closeBackgroundModal() {
    document.getElementById('backgroundSettingsModal').classList.add('hidden');
}

/**
 * 應用背景圖片變更並保存
 */
function applyBackgroundChange() {
    const url = document.getElementById('backgroundUrlInput').value.trim();
    if (!currentChat) {
        alert('錯誤：沒有當前聊天室！');
        return;
    }

    const chatBody = document.querySelector('#chatDetailScreen .chat-body');
    if (!chatBody) return;

    // 使用 localStorage 保存背景，key 與聊天室 ID 綁定
    const storageKey = `chat_bg_${currentChat.id}`;

    if (url) {
        // 設置背景
        chatBody.style.backgroundImage = `url('${url}')`;
        chatBody.style.backgroundSize = 'cover';
        chatBody.style.backgroundPosition = 'center';
        chatBody.style.backgroundRepeat = 'no-repeat';
        // 保存到 localStorage
        localStorage.setItem(storageKey, url);
    } else {
        // 如果 URL 為空，則移除背景
        chatBody.style.backgroundImage = 'none';
        localStorage.removeItem(storageKey);
    }

    closeBackgroundModal();
}

// 将新的函数设为全局可用
window.toggleChatOptionsMenu = toggleChatOptionsMenu;
window.updateChatOptionsMenu = updateChatOptionsMenu;
window.openBackgroundModal = openBackgroundModal;
window.closeBackgroundModal = closeBackgroundModal;
window.applyBackgroundChange = applyBackgroundChange;

// 背景圖片上傳相關函數
window.selectBackgroundImage = selectBackgroundImage;
window.deleteBackgroundImageFromList = deleteBackgroundImageFromList;

// =======================================================================
//                       🔥 全域選取阻止邏輯
// =======================================================================

/**
 * 🆕 全域阻止選取效果
 */
function setupGlobalSelectionPrevention() {
    // 阻止全域的選取事件
    document.addEventListener('selectstart', function(e) {
        e.preventDefault();
        return false;
    }, { passive: false });
    
    // 阻止全域的拖拽事件
    document.addEventListener('dragstart', function(e) {
        e.preventDefault();
        return false;
    }, { passive: false });
    
    // 阻止全域的右鍵選單
    document.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        return false;
    }, { passive: false });
    
    // 阻止全域的觸摸選取
    document.addEventListener('touchstart', function(e) {
        // 只對聊天列表區域阻止選取
        if (e.target.closest('.chat-list-body') || e.target.closest('.chat-item-content')) {
            e.preventDefault();
            return false;
        }
    }, { passive: false });
    
    console.log('[聊天面板] 全域選取阻止已設置');
}

// 在頁面載入完成後設置全域選取阻止
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupGlobalSelectionPrevention);
} else {
    setupGlobalSelectionPrevention();
}

// =======================================================================
//                       🔥 智能文字顏色調整
// =======================================================================

/**
 * 🆕 智能文字顏色調整 - 確保在任何背景下都有最佳可讀性
 */
function setupSmartTextColorAdjustment() {
    // 將十六進制顏色轉換為RGB
    function hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }
    
    // 計算顏色對比度
    function getContrastRatio(color1, color2) {
        const getLuminance = (color) => {
            let r, g, b;
            
            // 處理十六進制顏色
            if (color.startsWith('#')) {
                const rgb = hexToRgb(color);
                if (!rgb) {
                    console.warn('[智能文字顏色] 無法解析十六進制顏色:', color);
                    return 0.5;
                }
                r = rgb.r;
                g = rgb.g;
                b = rgb.b;
            } else {
                // 處理RGB格式顏色
                const rgb = color.match(/\d+/g);
                if (!rgb || rgb.length < 3) {
                    console.warn('[智能文字顏色] 無法解析顏色:', color);
                    return 0.5; // 返回默認值
                }
                [r, g, b] = rgb.map(Number);
            }
            
            const [rNorm, gNorm, bNorm] = [r, g, b].map(c => {
                c = c / 255;
                return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
            });
            return 0.2126 * rNorm + 0.7152 * gNorm + 0.0722 * bNorm;
        };
        
        const l1 = getLuminance(color1);
        const l2 = getLuminance(color2);
        const lighter = Math.max(l1, l2);
        const darker = Math.min(l1, l2);
        return (lighter + 0.05) / (darker + 0.05);
    }
    
    // 根據背景色智能選擇文字顏色
    function getOptimalTextColor(backgroundColor) {
        const white = '#ffffff';
        const black = '#000000';
        const darkGray = '#333333';
        const lightGray = '#cccccc';
        
        const contrastWithWhite = getContrastRatio(backgroundColor, white);
        const contrastWithBlack = getContrastRatio(backgroundColor, black);
        const contrastWithDarkGray = getContrastRatio(backgroundColor, darkGray);
        const contrastWithLightGray = getContrastRatio(backgroundColor, lightGray);
        
        // 選擇對比度最高的顏色
        const contrasts = [
            { color: white, ratio: contrastWithWhite },
            { color: black, ratio: contrastWithBlack },
            { color: darkGray, ratio: contrastWithDarkGray },
            { color: lightGray, ratio: contrastWithLightGray }
        ];
        
        contrasts.sort((a, b) => b.ratio - a.ratio);
        return contrasts[0].color;
    }
    
    // 調整模態窗口文字顏色
    function adjustModalTextColors() {
        const modalContent = document.querySelector('.modal-content');
        if (!modalContent) return;
        
        // 跳過主題設置窗口，因為它有特殊的樣式
        if (modalContent.classList.contains('theme-settings-modal')) {
            return;
        }
        
        const computedStyle = getComputedStyle(modalContent);
        const backgroundColor = computedStyle.backgroundColor;
        
        // 如果背景是透明的，使用父元素的背景色
        let actualBgColor = backgroundColor;
        if (backgroundColor === 'rgba(0, 0, 0, 0)' || backgroundColor === 'transparent') {
            actualBgColor = getComputedStyle(document.body).backgroundColor;
        }
        
        // 檢查背景色是否有效
        if (!actualBgColor || actualBgColor === 'rgba(0, 0, 0, 0)' || actualBgColor === 'transparent') {
            console.warn('[智能文字顏色] 無法獲取有效背景色');
            return;
        }
        
        try {
            const optimalTextColor = getOptimalTextColor(actualBgColor);
            
            // 調整模態窗口中的文字顏色
            const textElements = modalContent.querySelectorAll('label, span, div');
            textElements.forEach(element => {
                // 跳過已經有特定樣式的元素
                if (element.classList.contains('checkbox-text') || 
                    element.classList.contains('hint-text') ||
                    element.style.color) {
                    return;
                }
                
                // 設置最佳文字顏色
                element.style.color = optimalTextColor;
                
                // 添加文字陰影以提高可讀性
                if (optimalTextColor === '#ffffff' || optimalTextColor === '#cccccc') {
                    element.style.textShadow = '0 1px 2px rgba(0,0,0,0.3)';
                } else {
                    element.style.textShadow = '0 1px 2px rgba(255,255,255,0.3)';
                }
            });
            
            console.log('[智能文字顏色] 已調整模態窗口文字顏色，背景色:', actualBgColor, '文字色:', optimalTextColor);
        } catch (error) {
            console.warn('[智能文字顏色] 調整文字顏色時發生錯誤:', error);
        }
    }
    
    // 監聽主題變更
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                // 延遲執行，確保樣式已更新
                setTimeout(adjustModalTextColors, 100);
            }
        });
    });
    
    // 監聽模態窗口的顯示
    const modalObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1 && node.classList && node.classList.contains('modal-overlay')) {
                        if (!node.classList.contains('hidden')) {
                            setTimeout(adjustModalTextColors, 200);
                        }
                    }
                });
            }
        });
    });
    
    // 開始監聽
    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['style']
    });
    
    modalObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    // 初始化調整
    setTimeout(adjustModalTextColors, 500);
    
    console.log('[智能文字顏色] 智能文字顏色調整已設置');
}

// 在頁面載入完成後設置智能文字顏色調整
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupSmartTextColorAdjustment);
} else {
    setupSmartTextColorAdjustment();
}