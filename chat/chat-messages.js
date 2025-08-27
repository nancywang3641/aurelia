/**
 * 🔥 聊天消息时间显示处理函数
 * 功能：根据系统时间消息自动调整用户消息的时间显示
 */

// 全局变量存储系统时间状态（使用现有的lastSystemTime变量）
// let lastSystemTime = null; // 这个变量已存在，不再重复定义
let lastSystemTimeUpdateId = null;
let systemTimeOffset = 0; // 系统时间与现实时间的偏移量（分钟）

/**
 * 获取显示时间 - 主函数
 * @param {Object} message - 消息对象
 * @param {Array} allMessages - 所有消息数组（用于查找系统时间）
 * @returns {string} 格式化的时间显示
 */
function getDisplayTime(message, allMessages = []) {
    try {
        // 1. 检查并更新系统时间状态
        updateSystemTimeFromMessages(allMessages, message.id);
        
        // 2. 如果是系统时间消息，返回空（不显示时间）
        if (isSystemTimeMessage(message)) {
            return '';
        }
        
        // 3. 获取要显示的时间
        let displayTime = '';
        
        if (lastSystemTime) {
            // 有系统时间 - 使用系统时间进行计算
            displayTime = calculateTimeWithSystemOffset(message);
        } else {
            // 没有系统时间 - 使用现实时间
            displayTime = getRealTime(message);
        }
        
        return displayTime;
        
    } catch (error) {
        console.error('[时间显示] 处理时间显示时出错:', error);
        // 出错时返回现实时间作为备用
        return getRealTime(message);
    }
}

// 🔥 将主函数设为全局可访问
window.getDisplayTime = getDisplayTime;

/**
 * 检查消息是否为系统时间消息
 * @param {Object} message - 消息对象
 * @returns {boolean} 是否为系统时间消息
 */
function isSystemTimeMessage(message) {
    if (!message || !message.content) return false;
    
    // 检查多种系统时间格式
    return (
        message.sender === '系統' ||
        message.sender === '系统' ||
        message.sender === '時間' ||
        message.status === '系统消息' ||
        (typeof message.content === 'string' && message.content.startsWith('[system:')) ||
        (typeof message.content === 'string' && message.content.includes('[SYSTEM |'))
    );
}

/**
 * 从消息数组中更新系统时间状态
 * @param {Array} messages - 消息数组
 * @param {string} currentMessageId - 当前消息ID
 */
function updateSystemTimeFromMessages(messages, currentMessageId) {
    if (!messages || messages.length === 0) return;
    
    // 找到当前消息之前的最新系统时间消息
    let latestSystemTimeMessage = null;
    
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        
        // 只查找当前消息之前的消息
        if (parseInt(msg.id) >= parseInt(currentMessageId)) continue;
        
        if (isSystemTimeMessage(msg)) {
            const extractedTime = extractSystemTime(msg);
            if (extractedTime) {
                latestSystemTimeMessage = {
                    time: extractedTime,
                    messageId: msg.id,
                    realTime: msg.time || getCurrentRealTime()
                };
                break;
            }
        }
    }
    
    // 更新系统时间状态
    if (latestSystemTimeMessage && latestSystemTimeMessage.messageId !== lastSystemTimeUpdateId) {
        lastSystemTime = latestSystemTimeMessage.time;
        lastSystemTimeUpdateId = latestSystemTimeMessage.messageId;
        
        // 计算时间偏移量
        calculateTimeOffset(latestSystemTimeMessage.time, latestSystemTimeMessage.realTime);
        
        console.log('[时间显示] 更新系统时间:', lastSystemTime, '偏移量:', systemTimeOffset, '分钟');
    }
}

/**
 * 从系统消息中提取时间
 * @param {Object} message - 系统消息对象
 * @returns {string|null} 提取的时间字符串
 */
function extractSystemTime(message) {
    if (!message || !message.content) return null;
    
    const content = message.content;
    
    // 格式1: [system:13:30] 或 [system:2024-01-01 13:30]
    if (content.includes('[system:')) {
        const systemMatch = content.match(/\[system:(.*?)\]/);
        if (systemMatch) {
            return systemMatch[1].trim();
        }
    }
    
    // 格式2: [SYSTEM | 13:30] 或 [SYSTEM | 2024-01-01 13:30]
    if (content.includes('[SYSTEM |')) {
        const systemMatch = content.match(/\[SYSTEM\s*\|\s*([^\]]+)\]/);
        if (systemMatch) {
            return systemMatch[1].trim();
        }
    }
    
    // 格式3: [date:YYYY-MM-DD time:HH:MM]
    if (content.includes('[date:')) {
        const timeMatch = content.match(/\[date:([0-9\-]+)\s*time:([0-9:]+)\]/);
        if (timeMatch) {
            const date = timeMatch[1];
            const time = timeMatch[2];
            return `${date} ${time}`;
        }
    }
    
    // 格式4: 纯时间内容（当sender为"時間"时）
    if (message.sender === '時間') {
        // 尝试匹配时间格式
        const timeOnlyMatch = content.match(/^(\d{1,2}:\d{2})$/);
        if (timeOnlyMatch) {
            return timeOnlyMatch[1];
        }
        
        const dateTimeMatch = content.match(/^(\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2})$/);
        if (dateTimeMatch) {
            return dateTimeMatch[1];
        }
    }
    
    return null;
}

/**
 * 计算系统时间与现实时间的偏移量
 * @param {string} systemTime - 系统时间字符串
 * @param {string} realTime - 现实时间字符串
 */
function calculateTimeOffset(systemTime, realTime) {
    try {
        const systemDateTime = parseTimeString(systemTime);
        const realDateTime = parseTimeString(realTime);
        
        if (systemDateTime && realDateTime) {
            // 计算偏移量（分钟）
            systemTimeOffset = Math.round((systemDateTime.getTime() - realDateTime.getTime()) / (1000 * 60));
        } else {
            systemTimeOffset = 0;
        }
    } catch (error) {
        console.error('[时间显示] 计算时间偏移量时出错:', error);
        systemTimeOffset = 0;
    }
}

/**
 * 解析时间字符串为Date对象
 * @param {string} timeStr - 时间字符串
 * @returns {Date|null} Date对象或null
 */
function parseTimeString(timeStr) {
    if (!timeStr) return null;
    
    try {
        // 格式1: HH:MM (假设为今天)
        if (/^\d{1,2}:\d{2}$/.test(timeStr)) {
            const [hours, minutes] = timeStr.split(':').map(Number);
            const date = new Date();
            date.setHours(hours, minutes, 0, 0);
            return date;
        }
        
        // 格式2: YYYY-MM-DD HH:MM
        if (/^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}$/.test(timeStr)) {
            const [datePart, timePart] = timeStr.split(' ');
            const [year, month, day] = datePart.split('-').map(Number);
            const [hours, minutes] = timePart.split(':').map(Number);
            return new Date(year, month - 1, day, hours, minutes);
        }
        
        // 格式3: 标准日期格式
        const parsed = new Date(timeStr);
        if (!isNaN(parsed.getTime())) {
            return parsed;
        }
        
        return null;
    } catch (error) {
        console.error('[时间显示] 解析时间字符串出错:', error);
        return null;
    }
}

/**
 * 基于系统时间偏移量计算显示时间
 * @param {Object} message - 消息对象
 * @returns {string} 计算后的时间显示
 */
function calculateTimeWithSystemOffset(message) {
    try {
        // 获取消息的现实时间
        const realTime = message.time || getCurrentRealTime();
        const realDateTime = parseTimeString(realTime);
        
        if (!realDateTime) {
            return realTime; // 无法解析则返回原时间
        }
        
        // 应用系统时间偏移量
        const adjustedDateTime = new Date(realDateTime.getTime() + (systemTimeOffset * 60 * 1000));
        
        // 格式化返回
        return formatTime(adjustedDateTime);
        
    } catch (error) {
        console.error('[时间显示] 计算系统偏移时间出错:', error);
        return message.time || getCurrentRealTime();
    }
}

/**
 * 获取现实时间
 * @param {Object} message - 消息对象
 * @returns {string} 现实时间显示
 */
function getRealTime(message) {
    if (message.time) {
        return message.time;
    }
    return getCurrentRealTime();
}

/**
 * 获取当前现实时间
 * @returns {string} 当前时间 (HH:MM 格式)
 */
function getCurrentRealTime() {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

/**
 * 格式化时间显示
 * @param {Date} dateTime - Date对象
 * @returns {string} 格式化的时间字符串
 */
function formatTime(dateTime) {
    if (!dateTime || isNaN(dateTime.getTime())) {
        return getCurrentRealTime();
    }
    
    const hours = String(dateTime.getHours()).padStart(2, '0');
    const minutes = String(dateTime.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

/**
 * 重置系统时间状态（用于切换聊天时）
 */
function resetSystemTimeState() {
    lastSystemTime = null;
    lastSystemTimeUpdateId = null;
    systemTimeOffset = 0;
    console.log('[时间显示] 系统时间状态已重置');
}

// 🔥 将重置函数设为全局可访问
window.resetSystemTimeState = resetSystemTimeState;

/**
 * 获取当前系统时间状态（用于调试）
 * @returns {Object} 系统时间状态信息
 */
function getSystemTimeStatus() {
    return {
        lastSystemTime,
        lastSystemTimeUpdateId,
        systemTimeOffset,
        hasSystemTime: !!lastSystemTime
    };
}






// =======================================================================
//                          消息创建和渲染功能
// =======================================================================

/**
 * 🆕 增强版：創建單條對話泡泡 - 完整替换版本（包含通话交互按钮）
 */
async function createMessage(msg, chatType, allMessages = null) {
    // DEBUG: 輸出消息類型和內容
    console.log('DEBUG: msg.type', msg.type, msg);
    try {
        // === 劇情卡片特判：不包泡泡、不加avatar/sender-name ===
        if (msg.type === 'scene') {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message scene-message';
            messageDiv.style.alignSelf = 'center';
            messageDiv.style.maxWidth = '90%';
            messageDiv.style.margin = '20px auto';
            messageDiv.style.display = 'flex';
            messageDiv.style.justifyContent = 'center';
            // 直接插入劇情卡片內容
            let messageTextPortion = msg.content || "";
            let attachmentElement = '';
            // 保留原有劇情卡片 attachmentElement 處理
            const sceneResult = extractSceneContent(messageTextPortion);
            if (sceneResult && sceneResult.content) {
                let sceneDescription = sceneResult.content;
                messageTextPortion = messageTextPortion.replace(sceneResult.fullMatch, '').trim();
                const sceneId = `scene-${msg.id || Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                storyManager.addStory(sceneId, sceneDescription, msg.sender || '劇情', msg.time || getCurrentTime());
                attachmentElement = `
                    <div class="story-card-button" onclick="openStoryModal('${sceneId}')">
                        <div class="story-card-icon">📖</div>
                        <div class="story-card-content">
                            <div class="story-card-title">${escapeHtml(msg.sender || '劇情')}</div>
                            <div class="story-card-preview">${escapeHtml(sceneDescription.substring(0, 15))}...</div>
                        </div>
                    </div>
                `;
            }
            messageDiv.innerHTML = attachmentElement;
            return messageDiv;
        }
        // === 其餘訊息照原本邏輯 ===
        const messageDiv = document.createElement('div');
        
        // 🔧 修复主角判断逻辑
        function isMessageFromProtagonist(msg) {
            console.log('[UI层消息主角判斷] 開始判斷:', {
                sender: msg.sender,
                hasIsProtagonist: msg.hasOwnProperty('isProtagonist'),
                isProtagonist: msg.isProtagonist,
                currentChat: currentChat ? { id: currentChat.id, type: currentChat.type, admin: currentChat.admin } : null
            });
            
            // 🆕 最高优先级：使用消息对象中的 isProtagonist 标记
            if (msg.hasOwnProperty('isProtagonist')) {
                console.log('[UI层消息主角判斷] 使用 isProtagonist 標記:', msg.isProtagonist);
                return msg.isProtagonist;
            }
            
            // 🆕 群聊模式：使用群组管理员名称
            if (currentChat && currentChat.type === 'group' && currentChat.admin) {
                const isAdmin = msg.sender === currentChat.admin;
                console.log('[UI层消息主角判斷] 群聊判斷:', {
                    sender: msg.sender,
                    admin: currentChat.admin,
                    isAdmin: isAdmin
                });
                return isAdmin;
            }
            
            // 🆕 私聊模式：使用私聊參與者信息
            if (currentChat && (currentChat.type === 'dm' || currentChat.type === 'dm_chat')) {
                const isUser = msg.sender === currentChat.participant1;
                console.log('[UI层消息主角判斷] 私聊判斷:', {
                    sender: msg.sender,
                    participant1: currentChat.participant1,
                    participant2: currentChat.participant2,
                    isUser: isUser
                });
                return isUser;
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
            console.log('[UI层消息主角判斷] 全局用戶名判斷:', {
                sender: msg.sender,
                currentProtagonist: currentProtagonist,
                possibleNames: possibleProtagonistNames,
                isGlobalProtagonist: isGlobalProtagonist
            });
            return isGlobalProtagonist;
        }
        
        
        const isFromProtagonist = isMessageFromProtagonist(msg);
        
        // 系统消息特殊处理：sender为"系統"、"系统"、"時間"，或 status 为 "系统消息"，或内容以 [system: 开头，或标记为系统消息
        if (
            msg.sender === '系統' ||
            msg.sender === '系统' ||
            msg.sender === '時間' ||
            msg.status === '系统消息' ||
            msg.isSystemMessage ||
            (typeof msg.content === 'string' && msg.content.startsWith('[system:'))
        ) {
            messageDiv.className = 'message system-message';
            messageDiv.style.alignSelf = 'center';
            messageDiv.style.maxWidth = '90%';
            messageDiv.style.margin = '15px auto';
            messageDiv.style.display = 'flex';
            messageDiv.style.justifyContent = 'center';
            
            // 🔥 處理 [system:...] 標籤，提取實際內容
            let displayContent = msg.content;
            if (typeof msg.content === 'string' && msg.content.includes('[system:')) {
                const systemMatch = msg.content.match(/\[system:(.*?)\]/);
                if (systemMatch) {
                    displayContent = systemMatch[1].trim();
                }
            }
            
            // 🔥 處理時間系統消息的特殊格式 [date:YYYY-MM-DD time:HH:MM]
            if (msg.sender === '時間' && typeof msg.content === 'string' && msg.content.startsWith('[date:')) {
                const timeMatch = msg.content.match(/\[date:([0-9\-]+)\s*time:([0-9:]+)\]/);
                if (timeMatch) {
                    const date = timeMatch[1];
                    const time = timeMatch[2];
                    displayContent = `${date} ${time}`;
                }
            }
            
            // 🔥 修正：處理通話相關的系統消息
            if (typeof msg.content === 'string') {
                if (msg.content.includes('[call_decline:')) {
                    const declineRegex = /\[call_decline:(.*?)\]/;
                    const declineMatch = msg.content.match(declineRegex);
                    if (declineMatch) {
                        const decliner = declineMatch[1].trim();
                        displayContent = `❌ ${decliner} 拒絕了視訊通話`;
                    }
                } else if (msg.content.includes('[call_accept:')) {
                    const acceptRegex = /\[call_accept:(.*?)\]/;
                    const acceptMatch = msg.content.match(acceptRegex);
                    if (acceptMatch) {
                        let accepter = acceptMatch[1].trim();
                        
                        // 🔥 修正：如果接受者是 "用戶"，替換為實際用戶名
                        if (accepter === '用戶') {
                            let actualUserName = '{{user}}';
                            
                            // 1. 從私聊設置中獲取用戶名
                            if (currentChat && currentChat.type === 'dm') {
                                const actualName = getPrivateChatActualUserName(currentChat.id);
                                if (actualName && actualName !== '{{user}}') {
                                    actualUserName = actualName;
                                }
                            }
                            
                            // 2. 如果沒有找到，使用 protagonistName
                            if (actualUserName === '{{user}}' && protagonistName && protagonistName !== '{{user}}') {
                                actualUserName = protagonistName;
                            }
                            
                            // 3. 如果還是占位符，使用默認值
                            if (actualUserName === '{{user}}') {
                                actualUserName = '用戶';
                            }
                            
                            accepter = actualUserName;
                            console.log('[接受通話] 替換用戶為實際用戶名:', { original: '用戶', actual: actualUserName });
                        }
                        
                        displayContent = `✅ ${accepter} 接受了視訊通話`;
                    }
                } else if (msg.content.includes('[call_ended:')) {
                    const endedRegex = /\[call_ended:(.*?)\]/;
                    const endedMatch = msg.content.match(endedRegex);
                    if (endedMatch) {
                        let ender = endedMatch[1].trim();
                        
                        // 🔥 修正：如果結束者是 "主角"，替換為實際用戶名
                        if (ender === '主角') {
                            let actualUserName = '{{user}}';
                            
                            // 1. 從私聊設置中獲取用戶名
                            if (currentChat && currentChat.type === 'dm') {
                                const actualName = getPrivateChatActualUserName(currentChat.id);
                                if (actualName && actualName !== '{{user}}') {
                                    actualUserName = actualName;
                                }
                            }
                            
                            // 2. 如果沒有找到，使用 protagonistName
                            if (actualUserName === '{{user}}' && protagonistName && protagonistName !== '{{user}}') {
                                actualUserName = protagonistName;
                            }
                            
                            // 3. 如果還是占位符，使用默認值
                            if (actualUserName === '{{user}}') {
                                actualUserName = '用戶';
                            }
                            
                            ender = actualUserName;
                            console.log('[結束通話] 替換主角為實際用戶名:', { original: '主角', actual: actualUserName });
                        }
                        
                        displayContent = `📞 ${ender} 結束了視訊通話`;
                    }
                }
            }
            
            messageDiv.innerHTML = `
                <div class="message-content system-content">
                    <div class="system-text">${displayContent}</div>
                </div>
            `;
            
            return messageDiv; // 直接返回，不執行後面的頭像邏輯
        }
        // === 旁白消息特殊处理 ===
        if (
            msg.sender === '旁白' &&
            typeof msg.content === 'string' &&
            msg.content.startsWith('[narrator:')
        ) {
            messageDiv.className = 'message narrator-message';
            messageDiv.style.alignSelf = 'center';
            messageDiv.style.maxWidth = '90%';
            messageDiv.style.margin = '15px auto';
            messageDiv.style.display = 'flex';
            messageDiv.style.justifyContent = 'center';
            // 提取描述内容
            let displayContent = msg.content;
            const narratorMatch = msg.content.match(/\[narrator:(.*)\]/);
            if (narratorMatch) {
                displayContent = narratorMatch[1].trim();
            }
            messageDiv.innerHTML = `
                <div class="message-content narrator-content">
                    <div class="narrator-text">${escapeHtml(displayContent)}</div>
                </div>
            `;
            return messageDiv;
        }
        
        // 🔥 减少重复日志：使用统一的日志管理器
        Logger.limited('消息创建', `消息创建: ${msg.sender} -> ${isFromProtagonist ? '右侧绿泡泡' : '左侧灰泡泡'}`);
        
        // === 統一頭像與名字 ===
        let imgElement = null;
        let fallbackElement = null;
        let characterName = msg.sender || '未知';
        let normalizedName = getNormalizedCharacterName(characterName);
        
        // 🆕 優先從IndexedDB獲取頭像
        let avatarUrl = null;
        try {
            if (currentChat && currentChat.id) {
                // 🔥 修正：根據聊天類型選擇正確的頭像管理器
                if (currentChat.type === 'dm' && window.privateChatManager) {
                    // 私聊：從 privateChatManager 獲取頭像
                    const participant = await window.privateChatManager.getParticipant(characterName, currentChat.id, isFromProtagonist ? 'user' : 'character');
                    if (participant && participant.avatar) {
                        avatarUrl = participant.avatar;
                        console.log('[消息創建] 從私聊管理器獲取頭像:', { characterName, role: isFromProtagonist ? 'user' : 'character', hasAvatar: !!avatarUrl });
                    }
                } else if (window.groupMemberManager) {
                    // 群聊：從 groupMemberManager 獲取頭像
                    const member = await window.groupMemberManager.getMember(characterName, currentChat.id);
                    if (member && member.avatar) {
                        avatarUrl = member.avatar;
                    }
                }
            }
        } catch (error) {
            console.warn('[消息創建] 獲取IndexedDB頭像失敗:', error);
        }
        
        // 如果沒有IndexedDB頭像，使用默認URL
        if (!avatarUrl) {
            avatarUrl = `https://nancywang3641.github.io/sound-files/avatar/${encodeURIComponent(normalizedName)}.jpg`;
        }
        
        // 🆕 最終fallback：如果所有頭像都失敗，使用預設頭像
        const fallbackAvatarUrl = 'https://files.catbox.moe/ew2nex.png';
        
        imgElement = document.createElement('img');
        imgElement.src = avatarUrl;
        imgElement.className = 'avatar';
        imgElement.title = characterName;
        fallbackElement = document.createElement('div');
        fallbackElement.className = 'avatar';
        fallbackElement.title = characterName;
        fallbackElement.textContent = characterName.charAt(0).toUpperCase();
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
                    Logger.debug('頭像替換失敗：元素已從DOM中移除');
                }
            } catch (error) {
                if (CONFIG.DEBUG_MODE) console.error('[聊天面板] 頭像替換時出錯:', error);
            }
        };
        let senderNameElement = '';
        if (msg.sender && msg.type !== 'scene' && msg.sender !== '系統' && msg.sender !== '系统') {
            senderNameElement = `<div class="sender-name">${escapeHtml(msg.sender)}</div>`;
        }
        let messageTextPortion = msg.content || "";
        let attachmentElement = '';
        // ===================================================================
        // 🆕 通话系统：优先检测通话相关消息
        // ===================================================================
        
        // 1. 🔥 改进：检测通话邀请并添加交互按钮
        if (messageTextPortion.includes('[call_invitation:')) {
            const invitationRegex = /\[call_invitation:(.*?)\]/;
            const invitationMatch = messageTextPortion.match(invitationRegex);
            if (invitationMatch) {
                const invitationNote = invitationMatch[1].trim();
                const callId = `call-${msg.id}-${Date.now()}`;
                messageTextPortion = messageTextPortion.replace(invitationRegex, '').trim();
                
                // 🔥 修复：检查聊天记录中是否已有此通话的响应
                // 不仅检查已显示的消息，还要检查原始聊天数据（用于面板重启场景）
                let messagesToCheck = allMessages || [];
                
                // 如果已显示的消息不完整（面板重启场景），则使用完整聊天数据
                if (currentChat) {
                    const chatStore = currentChat.type === 'dm' ? chatData.dmChats : 
                                     currentChat.type === 'story' ? chatData.storyChats :
                                     chatData.groupChats;
                    const allChatMessages = chatStore[currentChat.id]?.messages || [];
                    
                    // 如果原始数据比已显示的多，使用原始数据
                    if (allChatMessages.length > messagesToCheck.length) {
                        messagesToCheck = allChatMessages;
                        console.log(`[通话邀请检测] 使用完整聊天数据: ${allChatMessages.length} 条消息`);
                    }
                }
                
                // 如果还是没有足够数据，尝试使用全局酒馆聊天记录
                if (messagesToCheck.length === 0 && globalTavernChatHistory && globalTavernChatHistory.length > 0) {
                    messagesToCheck = globalTavernChatHistory;
                    console.log(`[通话邀请检测] 使用全局酒馆聊天记录: ${globalTavernChatHistory.length} 条消息`);
                }
                
                const callResponse = findCallResponse(msg.id, msg.sender, messagesToCheck);
                console.log(`[通话邀请检测] 邀请ID=${msg.id}, 发起者=${msg.sender}, 检查${messagesToCheck.length}条消息, 响应结果:`, callResponse);
                
                if (callResponse) {
                    // 如果已有响应，显示响应状态
                    if (callResponse.type === 'accepted') {
                        attachmentElement = `
                            <div class="call-invitation-container" data-call-id="${callId}">
                                <div class="call-invitation-header">
                                    <span class="call-invitation-icon">📹</span>
                                    <div class="call-invitation-info">
                                        <div class="call-invitation-title">視訊通話邀請</div>
                                        <div class="call-invitation-note">${invitationNote}</div>
                                    </div>
                                </div>
                                <div class="call-invitation-status accepted">
                                    <span class="call-status-icon">✅</span>
                                    <span class="call-status-text">已接听</span>
                                </div>
                            </div>
                        `;
                    } else if (callResponse.type === 'declined') {
                        attachmentElement = `
                            <div class="call-invitation-container" data-call-id="${callId}">
                                <div class="call-invitation-header">
                                    <span class="call-invitation-icon">📹</span>
                                    <div class="call-invitation-info">
                                        <div class="call-invitation-title">視訊通話邀請</div>
                                        <div class="call-invitation-note">${invitationNote}</div>
                                    </div>
                                </div>
                                <div class="call-invitation-status declined">
                                    <span class="call-status-icon">❌</span>
                                    <span class="call-status-text">已拒绝</span>
                                </div>
                            </div>
                        `;
                    } else if (callResponse.type === 'ended') {
                        attachmentElement = `
                            <div class="call-invitation-container" data-call-id="${callId}">
                                <div class="call-invitation-header">
                                    <span class="call-invitation-icon">📹</span>
                                    <div class="call-invitation-info">
                                        <div class="call-invitation-title">視訊通話邀請</div>
                                        <div class="call-invitation-note">${invitationNote}</div>
                                    </div>
                                </div>
                                <div class="call-invitation-status ended">
                                    <span class="call-status-icon">📹</span>
                                    <span class="call-status-text">視訊通話已結束</span>
                                </div>
                            </div>
                        `;
                    }
                } else {
                    // 如果没有响应，显示待处理的邀请按钮
                    attachmentElement = `
                        <div class="call-invitation-container" data-call-id="${callId}">
                            <div class="call-invitation-header">
                                <span class="call-invitation-icon">📹</span>
                                <div class="call-invitation-info">
                                    <div class="call-invitation-title">視訊通話邀請</div>
                                    <div class="call-invitation-note">${invitationNote}</div>
                                </div>
                            </div>
                            <div class="call-invitation-actions">
                                <button class="call-action-btn call-accept-btn" onclick="respondToCall('${callId}', 'accept', '${msg.sender}')">
                                    <span>📹</span>
                                    <span>接听</span>
                                </button>
                                <button class="call-action-btn call-decline-btn" onclick="respondToCall('${callId}', 'decline', '${msg.sender}')">
                                    <span>❌</span>
                                    <span>拒绝</span>
                                </button>
                            </div>
                        </div>
                    `;
                }
            }
        }
        // 2. 检测AI接听 [call_accept:接听者]
        else if (messageTextPortion.includes('[call_accept:')) {
            const acceptRegex = /\[call_accept:(.*?)\]/;
            const acceptMatch = messageTextPortion.match(acceptRegex);
            if (acceptMatch) {
                const accepter = acceptMatch[1].trim();
                messageTextPortion = messageTextPortion.replace(acceptRegex, '').trim();
                
                attachmentElement = `
                    <div class="call-response-container accepted">
                        <span class="call-response-icon">✅</span>
                        <div class="call-response-text">${accepter} 接听了視訊通話</div>
                    </div>
                `;
                
                // 🔥 关键：检查是否已有 call_ended 消息，避免重复触发通话iframe
                // 不仅检查已显示的消息，还要检查原始聊天数据（用于面板重启场景）
                let hasCallEnded = false;
                let totalMessages = 0;
                
                // 1. 检查已显示的消息
                if (allMessages && allMessages.some(m => m.content && m.content.includes('[call_ended:'))) {
                    hasCallEnded = true;
                }
                
                // 2. 检查原始聊天数据（处理逐条显示时的情况）
                if (!hasCallEnded && currentChat) {
                    const chatStore = currentChat.type === 'dm' ? chatData.dmChats : 
                                     currentChat.type === 'story' ? chatData.storyChats :
                                     chatData.groupChats;
                    const allChatMessages = chatStore[currentChat.id]?.messages || [];
                    totalMessages = allChatMessages.length;
                    
                    hasCallEnded = allChatMessages.some(m => 
                        m.content && m.content.includes('[call_ended:')
                    );
                }
                
                console.log(`[通话检测] call_accept 检测结果: hasCallEnded=${hasCallEnded}, 已显示=${allMessages?.length || 0}条, 总消息=${totalMessages}条`);
                if (hasCallEnded) {
                    console.log('[通话检测] 发现 call_ended 消息，跳过通话触发');
                }
                
                if (!hasCallEnded) {
                    // AI接听后才触发通话iframe（仅当通话未结束时）
                    setTimeout(() => {
                        if (typeof startVideoCall === 'function') {
                            startVideoCall({
                                callerName: '{{user}}',
                                receiverName: accepter,
                                isIncoming: false, // 用户发起的視訊通話
                                note: '視訊通話進行中'
                            });
                        }
                    }, 1000);
                }
            }
        }
        // 3. 检测AI拒绝 [call_decline:拒绝者] - 改為系統消息
        else if (messageTextPortion.includes('[call_decline:')) {
            const declineRegex = /\[call_decline:(.*?)\]/;
            const declineMatch = messageTextPortion.match(declineRegex);
            if (declineMatch) {
                const decliner = declineMatch[1].trim();
                messageTextPortion = messageTextPortion.replace(declineRegex, '').trim();
                
                // 🔥 修正：改為系統消息，不顯示用戶泡泡
                msg.sender = '系統';
                msg.content = `❌ ${decliner} 拒絕了視訊通話`;
                msg.isSystemMessage = true;
                
                // 清空附件元素，讓系統消息處理邏輯接管
                attachmentElement = '';
            }
        }
        // 4. 检测通话结束 [call_ended:结束者]
        else if (messageTextPortion.includes('[call_ended:')) {
            const endedRegex = /\[call_ended:(.*?)\]/;
            const endedMatch = messageTextPortion.match(endedRegex);
            if (endedMatch) {
                const ender = endedMatch[1].trim();
                messageTextPortion = messageTextPortion.replace(endedRegex, '').trim();
                
                attachmentElement = `
                    <div class="call-response-container ended">
                        <span class="call-response-icon">📞</span>
                        <div class="call-response-text">${ender} 结束了視訊通話</div>
                    </div>
                `;
            }
        }
        // 5. 检测AI主动来电 [INCOMING_CALL | caller | receiver]（系统消息，不显示泡泡）
        else if (messageTextPortion.includes('[INCOMING_CALL |')) {
            const incomingCallRegex = /\[INCOMING_CALL\s*\|\s*([^|]+)\s*\|\s*([^|]+)\]/;
            const callMatch = messageTextPortion.match(incomingCallRegex);
            if (callMatch) {
                const caller = callMatch[1].trim();
                const receiver = callMatch[2].trim();
                
                messageTextPortion = messageTextPortion.replace(incomingCallRegex, '').trim();
                
                // 如果是AI打给用户，触发来电界面
                if (receiver === '{{user}}' || receiver === protagonistName) {
                    setTimeout(() => {
                        if (typeof startVideoCall === 'function') {
                            startVideoCall({
                                callerName: caller,
                                receiverName: receiver,
                                isIncoming: true,
                                note: '視訊來電'
                            });
                        }
                    }, 1000);
                }
                
                // 不显示任何消息泡泡
                messageTextPortion = '';
                attachmentElement = '';
            }
        }
        // ===================================================================
        // 现有的其他消息类型检测逻辑
        // ===================================================================
        // --- 🔥 新增：引用消息处理 ---
        else if (msg.type === 'quote' || messageTextPortion.includes('[引用:')) {
            console.log('[引用消息檢測] 檢測到引用消息:', {
                msgType: msg.type,
                content: messageTextPortion,
                hasDisplayContent: !!msg.displayContent
            });
            
            // 設置引用消息的附件元素，但不直接返回，讓後續邏輯處理頭像
            if (msg.displayContent) {
                console.log('[引用消息檢測] 使用displayContent:', msg.displayContent);
                attachmentElement = msg.displayContent;
            } else {
                // 否則解析引用格式
                const quoteMatch = messageTextPortion.match(/\[引用:\s*([^\]]+)\]\s*\|\s*(.+)/);
                if (quoteMatch) {
                    const quotedContent = quoteMatch[1].trim();
                    const responseContent = quoteMatch[2].trim();
                    
                    attachmentElement = `
                        <div class="quote-message-bubble">
                            <div class="quote-content">${quotedContent}</div>
                            <div class="response-content">${responseContent}</div>
                        </div>
                    `;
                }
            }
            
            // 清空消息文本，只顯示引用卡片
            messageTextPortion = '';
        }
        // --- 🆕 转账功能处理 ---
        else if (msg.type === 'transfer' || messageTextPortion.includes('[transfer:')) {
            console.log('[轉賬檢測] 檢測到轉賬消息:', {
                msgType: msg.type,
                content: messageTextPortion,
                hasTransferTag: messageTextPortion.includes('[transfer:')
            });
            
            // 使用逗號分隔的格式：轉賬ID,接收者,描述,金額,貨幣
            const transferRegex = /\[transfer:([^,]+),([^,]+),([^,]+),([^,]+),([^\]]+)\]/;
            const transferMatch = messageTextPortion.match(transferRegex);
            if (transferMatch) {
                console.log('[轉賬檢測] 正則匹配成功:', transferMatch);
                const transferId = transferMatch[1].trim();
                const receiver = transferMatch[2].trim();
                const note = transferMatch[3].trim();
                const amount = transferMatch[4].trim();
                const currency = transferMatch[5].trim();
                attachmentElement = `
                    <div class="transfer-container">
                        <div class="transfer-header">
                            <div class="transfer-header-icon"><img src="https://files.catbox.moe/jeoe1l.png" alt="轉賬" style="width: 20px; height: 20px; vertical-align: middle;"></div>
                            <div class="transfer-header-title">轉帳 | 轉給 ${receiver}</div>
                        </div>
                        <div class="transfer-content">
                            <div class="transfer-info">
                                <div class="transfer-amount">$${amount}</div>
                                <div class="transfer-note">${note}</div>
                            </div>
                        </div>
                        <div class="transfer-status pending" data-transfer-id="${transferId}" data-transfer-amount="${amount}" data-transfer-receiver="${receiver}" data-expire-time="${Date.now() + 180000}">
                            <div class="transfer-status-icon">⏳</div>
                            <div class="transfer-timer">
                                <span class="timer-label">剩餘處理時間</span>
                                <div class="timer-display">
                                    <span class="timer-minutes">03</span>
                                    <span class="timer-separator">:</span>
                                    <span class="timer-seconds">00</span>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                messageTextPortion = messageTextPortion.replace(transferRegex, '').trim();
                console.log('[轉賬檢測] 轉賬卡片已創建，剩餘文本:', messageTextPortion);
                
                // 啟動倒計時器
                console.log('[轉賬檢測] 準備啟動倒計時器:', transferId);
                if (window.transferTimerManager) {
                    console.log('[轉賬檢測] 倒計時管理器已載入');
                } else {
                    console.log('[轉賬檢測] 倒計時管理器未載入');
                }
            } else {
                console.log('[轉賬檢測] 正則匹配失敗');
            }
        } 
        // --- 通話記錄處理（标准格式）---
        else if (messageTextPortion.startsWith('[call:')) {
            const callRegex = /\[call:(.*?)\s*\((\d+\s*分鐘)\)\]/;
            const callMatch = messageTextPortion.match(callRegex);
            if (callMatch) {
                const note = callMatch[1].trim();
                const duration = callMatch[2].trim();
                messageTextPortion = messageTextPortion.replace(callRegex, '').trim();
                attachmentElement = `
                    <div class="call-record-container">
                        <span class="call-record-icon"><img src="https://files.catbox.moe/9dh2gw.png" alt="通話" style="width: 20px; height: 20px; vertical-align: middle;"></span>
                        <div class="call-record-details">
                            <div class="call-record-note">${note || '視訊通話'}</div>
                            <div class="call-record-duration">通話時長: ${duration}</div>
                        </div>
                    </div>
                `;
            }
        } else if (msg.type === 'location') {
            const locationRegex = /\[location:(.*?)\]/;
            const locationMatch = messageTextPortion.match(locationRegex);
            if (locationMatch) {
                const locationName = locationMatch[1].trim();
                messageTextPortion = messageTextPortion.replace(locationRegex, '').trim();
                // 將名字顯示在卡片上方
                attachmentElement = `
                    <div class="location-card-outer">
                        ${senderNameElement ? `<div class='sender-name location-sender'>${escapeHtml(msg.sender)}</div>` : ''}
                        <div class="location-card-container">
                            <div class="location-card-details">
                                <div class="location-card-name">${locationName}</div>
                            </div>
                            <div class="location-card-icon">
                                <span><a href="#" onclick="event.preventDefault(); alert('正在打開地圖...');"><img src="https://files.catbox.moe/j3w9n2.png" alt="地圖" style="width: 24px; height: 24px; vertical-align: middle;"></a></span>
                            </div>
                        </div>
                    </div>
                `;
                // 避免下方重複顯示 senderNameElement
                senderNameElement = '';
            }
        }
        // --- 語音訊息類型判斷 ---
        else if (msg.type === 'voice') {
            const voiceTagRegex = /\[voice:\s*([^\]]+?)\]/i;
            const voiceMatch = messageTextPortion.match(voiceTagRegex);
            if (voiceMatch && voiceMatch[1]) {
                const voiceId = `voice-${msg.id || Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                const fullVoiceText = voiceMatch[1].trim();
                messageTextPortion = messageTextPortion.replace(voiceTagRegex, '').trim();
                attachmentElement = `<div class="voice-message-container" data-voice-id="${voiceId}" data-voice-playing="false"><div class="voice-message-header"><span class="voice-icon"><img src="https://files.catbox.moe/vsdtgj.png" alt="語音" style="width: 20px; height: 20px; vertical-align: middle;"></span><div class="voice-pseudo-timeline-container"><div class="voice-pseudo-timeline"><div class="voice-wave-animation"><span></span><span></span><span></span><span></span><span></span></div></div></div><button class="voice-play-button" onclick="toggleVoicePlayback('${voiceId}')" title="播放語音"><span class="play-icon">▶</span></button></div><div class="voice-text-content" id="voice-text-content-${voiceId}" style="display: none;"><div class="voice-text" id="voice-text-${voiceId}">${fullVoiceText}</div></div></div>`;
            }
        } else if (msg.type === 'photo') {
            const photoTagRegex = /\[photo:\s*([^\]]+?)\]/i;
            const photoMatch = messageTextPortion.match(photoTagRegex);
            if (photoMatch && photoMatch[1]) {
                let imageDescription = photoMatch[1].trim();
                messageTextPortion = messageTextPortion.replace(photoTagRegex, '').trim();
                attachmentElement = `<div class="photo-attachment"><div class="photo-description">${imageDescription}</div></div>`;
            }
        } else if (msg.type === 'video') {
            const videoTagRegex = /\[video:\s*([^\]]+?)\]/i;
            const videoMatch = messageTextPortion.match(videoTagRegex);
            if (videoMatch && videoMatch[1]) {
                let videoDescription = videoMatch[1].trim();
                messageTextPortion = messageTextPortion.replace(videoTagRegex, '').trim();
                attachmentElement = `<div class="video-attachment"><div class="video-description">${videoDescription}</div></div>`;
            }
        } else if (msg.type === 'file') {
            const fileTagRegex = /\[file:\s*([^\]]+?)\]/i;
            const fileMatch = messageTextPortion.match(fileTagRegex);
            if (fileMatch && fileMatch[1]) {
                let fileName = fileMatch[1].trim();
                messageTextPortion = messageTextPortion.replace(fileTagRegex, '').trim();
                attachmentElement = `<div class="file-attachment"><span class="file-icon"></span><div class="file-info"><div class="file-name">${fileName}</div></div></div>`;
            }
        } else if (msg.type === 'poll') {
            const pollTagRegex = /\[poll:\s*([^\]]+?)\]/i;
            const pollMatch = messageTextPortion.match(pollTagRegex);
            if (pollMatch && pollMatch[1]) {
                messageTextPortion = messageTextPortion.replace(pollTagRegex, '').trim();
                const options = pollMatch[1].split(/[,、，]/).map(optStr => { const optVoteMatch = optStr.trim().match(/^(.*?)(?:\s*\((\d+)\s*\票?\s*\))?$/); if (optVoteMatch) return { name: optVoteMatch[1].trim(), votes: optVoteMatch[2] ? parseInt(optVoteMatch[2]) : null }; return { name: optStr.trim(), votes: null }; }).filter(opt => opt.name);
                let optionsHtml = '';
                if (options.length > 0) {
                    optionsHtml = '<ul class="poll-options">';
                    options.forEach(opt => { optionsHtml += `<li class="poll-option">${opt.name}${opt.votes !== null ? ` <span class="poll-vote-count">(${opt.votes}票)</span>` : ''}</li>`; });
                    optionsHtml += '</ul>';
                }
                attachmentElement = `<div class="poll-attachment">${optionsHtml}</div>`;
            }
        } else if (msg.type === 'sticker') {
            const stickerNameRegex = /\[sticker:\s*([^\]]+?)\]/i;
            const stickerMatch = messageTextPortion.match(stickerNameRegex);
            if (stickerMatch && stickerMatch[1]) {
                let stickerName = stickerMatch[1].trim();
                messageTextPortion = messageTextPortion.replace(stickerMatch[0], '').trim();
                const stickerUrl = `https://nancywang3641.github.io/sound-files/sticker/${encodeURIComponent(stickerName)}.jpg`;
                const safeStickerName = escapeHtml(stickerName);
                const fallbackContent = `<img src="https://files.catbox.moe/alx3ou.png" alt="表情包" style="width: 20px; height: 20px; vertical-align: middle;"> ${safeStickerName}`;
                const onErrorScript = `this.parentElement.classList.add('fallback'); this.parentElement.innerHTML = '${fallbackContent}';`;
                attachmentElement = `<div class="sticker-attachment"><img src="${stickerUrl}" alt="表情包: ${safeStickerName}" title="${safeStickerName}" onerror="${onErrorScript.replace(/"/g, '&quot;')}"></div>`;
            }
        } 
        
        else if (msg.type === 'red_envelope' || (messageTextPortion && messageTextPortion.includes('🧧'))) {
            const currencyPattern = /(?:Star Coins|星幣|星币)?/;
            
            // 🔧 修复：支持简繁体货币单位，准确匹配祝福语
            let envelopeMatch = messageTextPortion.match(new RegExp(`(.*?)🧧\\s*([\\d.]+)\\s*${currencyPattern.source}\\s*\\[(.*?)\\]`, 'i')) || 
                               messageTextPortion.match(new RegExp(`(.*?)[-–—]\\s*🧧\\s*([\\d.]+)\\s*${currencyPattern.source}\\s*\\[(.*?)\\]`, 'i'));
            
            if (envelopeMatch) {
                // ✅ 修复：提取用户真实祝福语，不强制替换
                const userBlessing = envelopeMatch[1] ? envelopeMatch[1].trim() : "";
                const amount = envelopeMatch[2]; 
                const recipientsData = envelopeMatch[3]; 
                const currencyText = envelopeMatch[0].includes("Star Coins") ? " Star Coins" : " 星幣"; 
                
                let recipients = []; 
                let receivedStatus = ''; 
                
                // ✅ 关键修复：保留用户输入的祝福语，而不是强制使用默认值
                const envelopeMessageItself = userBlessing || "红包祝福";
                
                if (recipientsData.toLowerCase().startsWith('received:') || recipientsData.toLowerCase().startsWith('已領取:')) { 
                    const prefix = recipientsData.toLowerCase().startsWith('received:') ? 'received:' : '已領取:'; 
                    recipients = recipientsData.substring(prefix.length).split(/[,、，]/).map(r => r.trim()).filter(r => r); 
                    receivedStatus = recipients.length > 0 ? `${recipients.length}人已領取` : '已領取'; 
                }
                else if (['received', '已領取', '領取'].includes(recipientsData.toLowerCase())) { 
                    receivedStatus = '已領取'; 
                } 
                else if (['not_received', '未領取'].includes(recipientsData.toLowerCase())) { 
                    receivedStatus = '未領取'; 
                } 
                else { 
                    receivedStatus = '點擊查看'; 
                }
                
                const redEnvelopeId = `red-envelope-${msg.id || Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                
                attachmentElement = `<div class="red-envelope-container" onclick="toggleExpandableContent(this, '${redEnvelopeId}')">
                    <div class="red-envelope-header">
                        <span class="red-envelope-icon"><img src="https://files.catbox.moe/b8zlv1.png" alt="紅包" style="width: 24px; height: 24px; vertical-align: middle;"></span>
                        <span class="red-envelope-amount">${amount}${currencyText}</span>
                    </div>
                    <div class="red-envelope-message">${envelopeMessageItself}</div>
                    <div class="red-envelope-recipients">
                        <div class="recipients-toggle">
                            <span>${receivedStatus}</span>
                            ${(recipients.length > 0 || receivedStatus === '點擊查看') ? `<span class="expandable-arrow recipients-arrow" id="arrow-${redEnvelopeId}">▼</span>` : ''}
                        </div>
                        ${recipients.length > 0 ? `<div class="recipients-list expandable-content" id="content-${redEnvelopeId}">${recipients.map(r => `<div class="recipient-item">• ${r}</div>`).join('')}</div>` : ''}
                    </div>
                </div>`;
                
                messageTextPortion = '';
            } else {
                // 🔧 简单红包格式的fallback处理
                const simpleMatch = messageTextPortion.match(/🧧\s*([\d.]+)\s*(?:Star Coins|星幣|星币)?/i);
                if (simpleMatch) { 
                    messageTextPortion = messageTextPortion.replace(/🧧[\d.]+\s*(?:Star Coins|星幣|星币)?/i,'').trim(); 
                    const currencyText = simpleMatch[0].includes("Star Coins") ? " Star Coins" : " 星幣"; 
                    
                    attachmentElement = `<div class="red-envelope-container">
                        <div class="red-envelope-header">
                            <span class="red-envelope-icon"><img src="https://files.catbox.moe/b8zlv1.png" alt="紅包" style="width: 24px; height: 24px; vertical-align: middle;"></span>
                            <span class="red-envelope-amount">${simpleMatch[1]}${currencyText}</span>
                        </div>
                        <div class="red-envelope-message">红包祝福</div>
                    </div>`; 
                    
                    messageTextPortion = ''; 
                }
            }
        }
        
        else if (msg.type === 'gift' || messageTextPortion.includes('[gift:')) {
            console.log('[禮物檢測] 檢測到禮物消息:', {
                msgType: msg.type,
                content: messageTextPortion,
                hasGiftTag: messageTextPortion.includes('[gift:')
            });
            
            const giftRegex = /\[gift:([^,]+),([^,]+),([^,]+),([^,]+),([^\]]+)\]/;
            const giftMatch = messageTextPortion.match(giftRegex);
            if (giftMatch) {
                console.log('[禮物檢測] 正則匹配成功:', giftMatch);
                const giftId = giftMatch[1].trim();
                const recipient = giftMatch[2].trim();
                const giftName = giftMatch[3].trim();
                const giftDescription = giftMatch[4].trim();
                const giftValue = giftMatch[5].trim();
                messageTextPortion = messageTextPortion.replace(giftRegex, '').trim();
                
                attachmentElement = `
                    <div class="gift-container">
                        <div class="gift-header">
                            <span class="gift-icon"><img src="https://files.catbox.moe/gift-icon.png" alt="禮物" style="width: 24px; height: 24px; vertical-align: middle;"></span>
                            <span class="gift-title">禮物 | 送給 ${recipient}</span>
                        </div>
                        <div class="gift-content">
                            <div class="gift-info">
                                <div class="gift-sender">來自${msg.sender || '用戶'}的禮物</div>
                                <div class="gift-name">${giftName}</div>
                                <div class="gift-description">${giftDescription}</div>
                                <div class="gift-value">¥${giftValue}</div>
                            </div>
                        </div>
                        <div class="gift-status pending" data-gift-id="${giftId}" data-gift-recipient="${recipient}" data-gift-name="${giftName}" data-gift-value="${giftValue}" data-expire-time="${Date.now() + 180000}">
                            <div class="gift-status-icon">⏳</div>
                            <div class="gift-timer">
                                <span class="timer-label">剩餘處理時間</span>
                                <div class="timer-display">
                                    <span class="timer-minutes">03</span>
                                    <span class="timer-separator">:</span>
                                    <span class="timer-seconds">00</span>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                messageTextPortion = '';
            }
        }
        
        else if (msg.type === 'letter' || messageTextPortion.includes('[letter:')) {
            const letterRegex = /\[letter:\s*From:([^|]+)\s*To:\s*([^|]+)\s*內容:\s*([^|]+)\s*日期:\s*([^\]]+)\]/i;
            const letterMatch = messageTextPortion.match(letterRegex);
            if (letterMatch) {
                const from = letterMatch[1].trim();
                const to = letterMatch[2].trim();
                const content = letterMatch[3].trim();
                const date = letterMatch[4].trim();
                messageTextPortion = messageTextPortion.replace(letterRegex, '').trim();
                
                const letterId = `letter-${msg.id || Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                
                attachmentElement = `
                    <div class="letter-container" onclick="toggleLetterOpen('${letterId}')" data-letter-id="${letterId}">
                        <div class="letter-envelope">
                            <div class="letter-envelope-front">
                                <div class="letter-seal"><img src="https://files.catbox.moe/op34fv.png" alt="信封" style="width: 24px; height: 24px; vertical-align: middle;"></div>
                                <div class="letter-address">
                                    <div class="letter-to">To: ${to}</div>
                                    <div class="letter-from">From: ${from}</div>
                                </div>
                            </div>
                        </div>
                        <div class="letter-content" id="letter-content-${letterId}" style="display: none;">
                            <div class="letter-header">
                                <div class="letter-date">${date}</div>
                            </div>
                            <div class="letter-body">
                                <div class="letter-sender">From: ${from}</div>
                                <div class="letter-recipient">To: ${to}</div>
                                <div class="letter-text">${content.replace(/\n/g, '<br>')}</div>
                            </div>
                        </div>
                    </div>
                `;
                messageTextPortion = '';
            }
        } else if (msg.type === 'meeting') {
            const meetingRegex = /\[meeting:(.*?)(?:\[br\](.*))?\]/is;
            const meetingMatch = messageTextPortion.match(meetingRegex);

            if (meetingMatch) {
                messageDiv.classList.add('system-message-full-width');
                const metaDataString = meetingMatch[1] ? meetingMatch[1].trim() : '';
                const dialogueString = meetingMatch[2] ? meetingMatch[2].trim() : '';
                const meta = metaDataString.split(';').map(s => s.trim());
                
                if (meta.length >= 5) {
                    const meetingTitle = meta[0];
                    const participantsStr = meta[1];
                    const status = meta[2];
                    const duration = meta[3];
                    const startTime = meta[4];
                    const participants = participantsStr.split(',').map(p => p.trim()).filter(p => p);
                    const maxDisplayParticipants = 6;
                    const displayParticipants = participants.slice(0, maxDisplayParticipants);
                    const extraCount = Math.max(0, participants.length - maxDisplayParticipants);
                    const isActive = status === '進行中';
                    const statusClass = isActive ? 'active' : 'ended';
                    const statusIcon = isActive ? '🟢' : '⚫';
                    
                    let participantsHTML = '';
                    displayParticipants.forEach((p, index) => {
                        const normalizedName = getNormalizedCharacterName(p);
                        const avatarUrl = `https://nancywang3641.github.io/sound-files/avatar/${encodeURIComponent(normalizedName)}.jpg`;
                        participantsHTML += `<div class="meeting-participant-avatar" style="z-index: ${displayParticipants.length - index};"><img src="${avatarUrl}" alt="${p}" title="${p}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"><div class="meeting-participant-fallback" style="display: none;">${p.charAt(0).toUpperCase()}</div></div>`;
                    });
                    if (extraCount > 0) { participantsHTML += `<div class="meeting-participant-avatar meeting-extra-count"><div class="meeting-participant-fallback">+${extraCount}</div></div>`; }

                    let dialogueHtml = '';
                    if (dialogueString) {
                        const dialogueLines = dialogueString.split('[br]').map(line => line.trim()).filter(line => line);
                        dialogueLines.forEach(line => {
                            const colonIndex = line.indexOf(':');
                            if (colonIndex > 0) {
                                const speaker = line.substring(0, colonIndex).trim();
                                const dialogue = line.substring(colonIndex + 1).trim();
                                if(speaker && dialogue) {
                                    dialogueHtml += `<div class="transcript-line"><strong class="transcript-speaker">${speaker}:</strong> <span class="transcript-dialogue">${dialogue}</span></div>`;
                                }
                            }
                        });
                    }
                    
                    const meetingId = `meeting-${msg.id || Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    attachmentElement = `
                        <div class="meeting-container ${statusClass}" data-meeting-id="${meetingId}">
                            <div class="meeting-header"><div class="meeting-icon">📹</div><div class="meeting-info"><div class="meeting-title">${meetingTitle}</div><div class="meeting-status"><span class="meeting-status-indicator">${statusIcon}</span><span class="meeting-status-text">${status}</span><span class="meeting-duration">• ${duration}</span></div></div><div class="meeting-time">${startTime}</div></div>
                            <div class="meeting-participants"><div class="meeting-participants-avatars">${participantsHTML}</div><div class="meeting-participants-info"><span class="meeting-participants-count">${participants.length} 位參與者</span></div></div>
                            <div class="meeting-actions">
                                ${isActive ? `<button class="meeting-join-btn"><span class="meeting-btn-icon">📹</span><span>加入會議</span></button>` : ''}
                                ${dialogueHtml ? `<button class="meeting-details-btn" onclick="toggleExpandableContent(this, 'transcript-${meetingId}')"><span class="meeting-btn-icon">📄</span><span>查看記錄</span><span class="expandable-arrow meeting-arrow" id="arrow-transcript-${meetingId}">▼</span></button>` : ''}
                            </div>
                            ${dialogueHtml ? `<div class="transcript-body expandable-content" id="content-transcript-${meetingId}">${dialogueHtml}</div>` : ''}
                        </div>
                    `;
                    messageTextPortion = '';
                }
            }
        }
        
        // --- 組合最終內容 ---
        const finalContentHtml = `
            ${messageTextPortion ? `<div>${messageTextPortion.replace(/\n/g, '<br>')}</div>` : ''}
            ${attachmentElement}
        `;

        // === 新增：功能卡片不包泡泡 ===
        const isFunctionCardOnly = !!attachmentElement && !messageTextPortion && (
            msg.type === 'transfer' || msg.type === 'gift' || msg.type === 'red_envelope' || msg.type === 'location' || msg.type === 'meeting' || msg.type === 'call' || msg.type === 'photo' || msg.type === 'video' || msg.type === 'file' || msg.type === 'poll' || msg.type === 'sticker'
        );

        let timeDisplay = '';
        try {
            // 🔥 使用新的时间显示函数
            if (typeof window.getDisplayTime === 'function') {
                timeDisplay = window.getDisplayTime(msg, allMessages || []);
                console.log('[时间显示] 使用新函数，消息:', msg.id, '时间:', timeDisplay, '系统时间:', lastSystemTime);
            } else {
                console.warn('[时间显示] getDisplayTime 函数未找到，使用旧逻辑');
                timeDisplay = msg.time || '';
            }
        } catch (e) {
            if (CONFIG.DEBUG_MODE) console.error('Error formatting date/time:', e);
            timeDisplay = msg.time || '';
        }

        const readStatusText = chatType === 'group' ? (msg.readCount || '') : (msg.status || '');

        // === 統一訊息結構 ===
        const messageContainer = document.createElement('div');
        messageContainer.className = 'message-container';
        messageContainer.innerHTML = `
            ${senderNameElement}
            <div class="message-content">
                ${finalContentHtml}
            </div>
        `;
        
        // 🔥 新增：为消息泡泡添加唯一标识符和编辑功能属性
        const messageId = msg.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const tavernMessageId = msg.tavernMessageId || null; // 酒馆AI的消息ID
        const isAIMessage = !isFromProtagonist; // 是否为AI消息
        
        // 为消息容器添加数据属性
        messageContainer.setAttribute('data-message-id', messageId);
        messageContainer.setAttribute('data-tavern-message-id', tavernMessageId || '');
        messageContainer.setAttribute('data-is-ai-message', isAIMessage.toString());
        messageContainer.setAttribute('data-sender', msg.sender || '');
        messageContainer.setAttribute('data-message-type', msg.type || 'text');
        
        // 添加长按编辑功能的CSS类
        messageContainer.classList.add('editable-message');
        // 新增：一般訊息的時間/已讀也放到泡泡外
        const infoDiv = document.createElement('div');
        infoDiv.className = 'message-info message-info-outside';
        infoDiv.innerHTML = `<span>${timeDisplay}</span><span>${readStatusText}</span>`;
        // === 橫向排列：頭像在左，內容在右 ===
        messageDiv.className = `message ${isFromProtagonist ? 'sent' : 'received'}`;
        if (!isFromProtagonist) {
            messageDiv.classList.add('received-bubble');
        } else {
            messageDiv.classList.add('sent-bubble');
        }
        const bubbleStyles = [
            'style-classic', 'style-emboss', 'style-neon', 'style-glass', 'style-metal', 'style-soft'
        ];
        messageDiv.classList.remove(...bubbleStyles);
        if (window.currentBubbleStyle) messageDiv.classList.add(window.currentBubbleStyle);
        // === 功能卡片也要有頭像與名字 ===
        if (isFunctionCardOnly) {
            messageDiv.classList.add('function-card-message');
            messageDiv.style.display = 'flex';
            messageDiv.style.alignItems = 'flex-start';
            messageDiv.innerHTML = '';
            messageDiv.appendChild(imgElement);
            const cardContainer = document.createElement('div');
            cardContainer.className = 'function-card-container';
            cardContainer.innerHTML = `
                ${senderNameElement}
                ${attachmentElement}
            `;
            messageDiv.appendChild(cardContainer);
            // infoDiv插入到卡片內容下方
            cardContainer.appendChild(infoDiv);
            return messageDiv;
        }
        // === 一般訊息 ===
        messageDiv.style.display = 'flex';
        messageDiv.style.alignItems = 'flex-start';
        if (isFromProtagonist) {
            messageDiv.appendChild(messageContainer);
            messageDiv.appendChild(imgElement);
        } else {
            messageDiv.appendChild(imgElement);
            messageDiv.appendChild(messageContainer);
        }
        // 將 .message-info 移到泡泡內容下方
        messageContainer.appendChild(infoDiv);
        return messageDiv;

    } catch (error) {
        console.error(`創建消息元素時出錯: ${error.message}`, msg);
        const errorDiv = document.createElement('div');
        errorDiv.className = 'message';
        errorDiv.innerHTML = `<div class="message-content error-message">消息顯示錯誤，請檢查控制台日誌。</div>`;
        return errorDiv;
    }
}

// =======================================================================
//                          通话功能相关
// =======================================================================

/**
 * 🆕 用户回应通话邀请的完整函数
 */

/**
 * 查找特定通话邀请是否已有响应 (call_accept 或 call_decline)
 * @param {string} invitationMessageId - 通话邀请消息的ID
 * @param {string} callerName - 通话发起者名称
 * @returns {Object|null} - 返回响应信息或null
 */
function findCallResponse(invitationMessageId, callerName, allMessages) {
    if (!allMessages || !Array.isArray(allMessages)) {
        return null;
    }
    
    const responses = [];
    
    for (const message of allMessages) {
        let foundResponse = null;
        
        // 检查 call_accept 消息
        if (message.content && message.content.includes('[call_accept:')) {
            const acceptRegex = /\[call_accept:(.*?)\]/;
            const match = message.content.match(acceptRegex);
            if (match) {
                const responder = match[1].trim();
                foundResponse = { 
                    type: 'accepted', 
                    responder, 
                    messageId: message.id, 
                    time: message.time,
                    tavernMessageId: message.id
                };
            }
        }
        
        // 检查 call_decline 消息
        else if (message.content && message.content.includes('[call_decline:')) {
            const declineRegex = /\[call_decline:(.*?)\]/;
            const match = message.content.match(declineRegex);
            if (match) {
                const responder = match[1].trim();
                foundResponse = { 
                    type: 'declined', 
                    responder, 
                    messageId: message.id, 
                    time: message.time,
                    tavernMessageId: message.id
                };
            }
        }
        
        // 检查 call_ended 消息
        else if (message.content && message.content.includes('[call_ended:')) {
            const endedRegex = /\[call_ended:(.*?)\]/;
            const match = message.content.match(endedRegex);
            if (match) {
                const responder = match[1].trim();
                foundResponse = { 
                    type: 'ended', 
                    responder, 
                    messageId: message.id, 
                    time: message.time,
                    tavernMessageId: message.id
                };
            }
        }
        
        if (foundResponse) {
            responses.push(foundResponse);
        }
    }
    
    if (responses.length > 0) {
        // 返回最新的响应（按酒馆消息ID排序）
        const latestResponse = responses.sort((a, b) => 
            parseInt(b.tavernMessageId) - parseInt(a.tavernMessageId)
        )[0];
        
        return latestResponse;
    }
    
    return null;
}

/**
 * 响应通话邀请
 */
async function respondToCall(callId, action, callerName) {
    const container = document.querySelector(`[data-call-id="${callId}"]`);
    if (!container || container.dataset.isProcessing) return; // 防止重複點擊

    container.dataset.isProcessing = 'true'; // 標記為處理中

    try {
        // 🔥 新逻辑：立即更新卡片显示状态
        const actionsDiv = container.querySelector('.call-invitation-actions');
        if (actionsDiv) {
            // 隐藏按钮
            actionsDiv.style.display = 'none';
            
            // 创建状态显示
            const statusDiv = document.createElement('div');
            statusDiv.className = 'call-invitation-status';
            
            if (action === 'accept') {
                statusDiv.classList.add('accepted');
                statusDiv.innerHTML = '✅ 已接听';
                
                // 启动視訊通話面板
                setTimeout(() => {
                    if (typeof startVideoCall === 'function') {
                        const callNote = container.querySelector('.call-invitation-note');
                        const note = callNote ? callNote.textContent : '視訊通話';
                        
                        startVideoCall({
                            callerName: callerName || '对方',
                            receiverName: protagonistName || '{{user}}',
                            isIncoming: false,
                            note: note
                        });
                    }
                }, 500);
            } else { // decline
                statusDiv.classList.add('declined');
                statusDiv.innerHTML = '❌ 已拒绝';
            }
            
            // 添加状态显示
            container.appendChild(statusDiv);
        }

        // 🔥 修正：從當前聊天室獲取實際的用戶名
        let actualUserName = '{{user}}';
        
        // 1. 從私聊設置中獲取用戶名
        if (currentChat && currentChat.type === 'dm') {
            const actualName = getPrivateChatActualUserName(currentChat.id);
            if (actualName && actualName !== '{{user}}') {
                actualUserName = actualName;
            }
        }
        // 2. 從群組成員管理器中獲取用戶名
        else if (currentChat && currentChat.type === 'group' && window.groupMemberManager) {
            try {
                // 嘗試從群組成員管理器中獲取用戶名
                const members = await window.groupMemberManager.getGroupMembers(currentChat.id);
                if (members && members.length > 0) {
                    // 🔥 修正：優先使用群組管理員作為用戶名
                    let userMember = null;
                    
                    // 1. 優先尋找與群組管理員同名的成員
                    if (currentChat.admin) {
                        userMember = members.find(m => m.name === currentChat.admin);
                        if (userMember) {
                            console.log('[通話回應] 找到群組管理員成員:', userMember.name);
                        }
                    }
                    
                    // 2. 如果沒有找到管理員，尋找用戶角色的成員
                    if (!userMember) {
                        userMember = members.find(m => m.role === 'user');
                        if (userMember) {
                            console.log('[通話回應] 找到用戶角色成員:', userMember.name);
                        }
                    }
                    
                    // 3. 如果還是沒有找到，使用第一個成員
                    if (!userMember) {
                        userMember = members[0];
                        console.log('[通話回應] 使用第一個成員:', userMember.name);
                    }
                    
                    if (userMember && userMember.name) {
                        actualUserName = userMember.name;
                        console.log('[通話回應] 從群組成員管理器獲取用戶名:', actualUserName);
                    }
                }
            } catch (error) {
                console.warn('[通話回應] 從群組成員管理器獲取用戶名失敗:', error);
            }
        }
        
        // 3. 如果沒有找到，使用 protagonistName
        if (actualUserName === '{{user}}' && protagonistName && protagonistName !== '{{user}}') {
            actualUserName = protagonistName;
        }
        
        // 4. 如果還是占位符，使用默認值
        if (actualUserName === '{{user}}') {
            actualUserName = '用戶';
        }
        
        console.log('[通話回應] 使用用戶名:', { actualUserName, protagonistName, currentChatId: currentChat?.id });
        
        let responseMessage = '';
        
        if (action === 'accept') {
            responseMessage = `[call_accept:${actualUserName}]`;
        } else {
            responseMessage = `[call_decline:${actualUserName}]`;
        }
        
        // 🔥 修正：創建系統消息格式，而不是用戶消息
        const nextMessageId = await getNextMessageId();
        const systemMessageLine = `[${nextMessageId}|${currentChat.id}|系統|${responseMessage}]`;
        
        // 判斷是否為新聊天室
        let isFirstMessage = false;
        let chatStore = currentChat.type === 'dm' ? chatData.dmChats : 
                        currentChat.type === 'story' ? chatData.storyChats :
                        chatData.groupChats;
        if (chatStore && chatStore[currentChat.id] && Array.isArray(chatStore[currentChat.id].messages)) {
            isFirstMessage = chatStore[currentChat.id].messages.length === 0;
        } else {
            isFirstMessage = true;
        }
        
        let wrappedMessage;
        if (isFirstMessage) {
            // 新聊天室，補標頭
            const chatName = currentChat.name || '';
            const admin = currentChat.admin || '';
            const members = currentChat.members || '';
            const chatInfo = `${currentChat.id}|${chatName}|${admin}|${members}`;
            wrappedMessage = `[Chat|${chatInfo}]\n${systemMessageLine}`;
        } else {
            // 已有聊天室，只發送消息
            wrappedMessage = systemMessageLine;
        }
        
        // 🔥 新增：立即更新全局聊天记录，避免时序问题
        updateGlobalChatHistoryAfterResponse(action, actualUserName, responseMessage, `call_${action}`);
        
        // 发送到酒馆
        const tavernWindow = findTavernMainWindow();
        if (tavernWindow) {
            const stInput = tavernWindow.document.querySelector('#send_textarea');
            const sendButton = tavernWindow.document.querySelector('#send_but');
            
            if (stInput && sendButton) {
                stInput.value = wrappedMessage;
                stInput.dispatchEvent(new Event('input', { bubbles: true }));
                
                setTimeout(() => {
                    sendButton.click();
                }, 100);
            }
        }

    } catch (error) {
        console.error('[視訊通話系統] 回應視訊通話時出錯:', error);
        showErrorToast('視訊通話操作失败');
        container.dataset.isProcessing = 'false'; // 失敗時解除鎖定
    }
}

/**
 * 🔥 立即更新全局聊天记录，避免通话响应时序问题
 */
function updateGlobalChatHistoryAfterResponse(action, userName, responseMessage, messageType) {
    try {
        if (!globalTavernChatHistory) {
            return;
        }

        // 🔥 修正：創建系統消息格式
        const mockResponseMessage = {
            id: (globalTavernChatHistory.length).toString(),
            sender: '系統', // 修正：使用系統作為發送者
            content: responseMessage,
            type: messageType,
            time: new Date().toLocaleTimeString(),
            isSystemMessage: true // 標記為系統消息
        };

        // 添加到全局聊天记录
        globalTavernChatHistory.push(mockResponseMessage);

    } catch (error) {
        console.error('[視訊通話系統] 更新聊天记录失败:', error);
    }
}

/**
 * 触发来电界面
 */
function triggerIncomingCall(callInfo) {
    if (CONFIG.DEBUG_MODE) console.log('[視訊來電觸發] 收到視訊來電:', callInfo);
    
    // 延迟一点时间触发，让消息先显示
    setTimeout(() => {
        if (typeof startVideoCall === 'function') {
            startVideoCall({
                ...callInfo,
                isIncoming: true,
                note: '視訊來電'
            });
        } else {
            console.error('[視訊來電觸發] startVideoCall 函数未找到');
        }
    }, 1000);
}

// 设为全局可用
window.triggerIncomingCall = triggerIncomingCall;
window.respondToCall = respondToCall;

// =======================================================================
//                          选择提示功能
// =======================================================================

/**
 * 显示选择提示
 */
function displayChoicePrompt(choicesOrRaw) {
    // 支援傳入原始AI輸出全文或已解析選項
    let choices = [];
    if (typeof choicesOrRaw === 'string') {
        // 原始AI全文，先提取最新<choice>
        const latest = extractLatestChoiceBlock(choicesOrRaw);
        if (latest) {
            choices = latest.split('\n').map(line => {
                const match = line.match(/^#(\d+)\|(.*)$/);
                if (match) {
                    return { number: match[1], text: match[2].trim() };
                }
                return null;
            }).filter(Boolean);
        }
    } else if (Array.isArray(choicesOrRaw)) {
        choices = choicesOrRaw;
    }
    // 僅在聊天詳情頁才設置選項
    if (typeof currentChat !== 'undefined' && currentChat) {
        window.latestChoiceOptions = choices.slice(0, 3); // 最多三個
        updateChoiceDropdownButton();
        renderChoiceButtonOptions();
    }
}

/**
 * 移除选择提示
 */
function removeChoicePrompt() {
    if (currentChoicePrompt && currentChoicePrompt.container) {
        currentChoicePrompt.container.style.opacity = '0';
        currentChoicePrompt.container.style.transform = 'translateY(-20px)';
        
        setTimeout(() => {
            if (currentChoicePrompt.container.parentNode) {
                currentChoicePrompt.container.parentNode.removeChild(currentChoicePrompt.container);
            }
            currentChoicePrompt = null;
        }, 300);
    }
}

/**
 * 使用选择选项
 */
function useChoiceOption(choiceText) {
    // 解码 HTML 实体
    const decodedText = choiceText
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
    
    // 查找输入框
    const inputElement = document.querySelector('#send_textarea');
    if (inputElement) {
        inputElement.value = decodedText;
        inputElement.focus();
        
        // 触发输入事件
        const event = new Event('input', { bubbles: true });
        inputElement.dispatchEvent(event);
        
        if (CONFIG.DEBUG_MODE) {
            console.log('[选择提示] 已填入选项:', decodedText);
        }
    }
    
    // 移除选择提示
    removeChoicePrompt();
}

// 将函数暴露到全局
window.displayChoicePrompt = displayChoicePrompt;
window.removeChoicePrompt = removeChoicePrompt;
window.useChoiceOption = useChoiceOption;

// === AI选项下拉选单功能 ===
function extractLatestChoiceBlock(fullText) {
    // 取最新一個 <choice>...</choice> 區塊
    const matches = fullText.match(/<choice>([\s\S]*?)<\/choice>/g);
    if (matches && matches.length > 0) {
        const last = matches[matches.length - 1];
        return last.replace(/<\/?choice>/g, '').trim();
    }
    return null;
}

function updateChoiceDropdownButton() {
    const btn = document.getElementById('choiceDropdownButton');
    if (!btn) return;
    if (window.latestChoiceOptions && window.latestChoiceOptions.length > 0) {
        btn.disabled = false;
        btn.style.opacity = '1';
    } else {
        btn.disabled = true;
        btn.style.opacity = '0.5';
    }
}

function renderChoiceButtonOptions() {
    // 直接在燈泡按鈕下方顯示三個選項，不再彈出浮窗
    let container = document.getElementById('choiceButtonOptions');
    if (!container) {
        container = document.createElement('div');
        container.id = 'choiceButtonOptions';
        container.style.position = 'absolute';
        container.style.zIndex = '1001';
        container.style.right = '0';
        container.style.bottom = '48px';
        container.style.background = 'white';
        container.style.borderRadius = '10px';
        container.style.boxShadow = '0 2px 12px #0002';
        container.style.padding = '6px 0';
        container.style.minWidth = '180px';
        container.style.display = 'none';
        container.style.border = '1px solid #eee';
        document.body.appendChild(container);
    }
    container.innerHTML = '';
    if (!window.latestChoiceOptions || window.latestChoiceOptions.length === 0) {
        container.style.display = 'none';
        return;
    }
    window.latestChoiceOptions.forEach(opt => {
        const item = document.createElement('div');
        item.className = 'choice-item';
        item.textContent = `#${opt.number}  ${opt.text}`;
        item.style.cursor = 'pointer';
        item.style.padding = '10px 18px';
        item.style.fontSize = '15px';
        item.style.color = '#333';
        item.style.borderRadius = '6px';
        item.onmouseenter = () => item.style.background = '#f0f0f0';
        item.onmouseleave = () => item.style.background = 'white';
        item.onclick = () => {
            document.getElementById('userInput').value = opt.text;
            container.style.display = 'none';
        };
        container.appendChild(item);
    });
}

// 綁定燈泡按鈕點擊事件
window.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('choiceDropdownButton');
    if (btn) {
        btn.onclick = (e) => {
            e.stopPropagation();
            if (btn.disabled) return;
            const container = document.getElementById('choiceButtonOptions');
            if (!container) return;
            if (container.style.display === 'none' || container.style.display === '') {
                // 定位到按鈕下方
                const rect = btn.getBoundingClientRect();
                container.style.right = (window.innerWidth - rect.right + 4) + 'px';
                container.style.bottom = (window.innerHeight - rect.top - 36) + 'px';
                container.style.display = 'block';
            } else {
                container.style.display = 'none';
            }
        };
    }
    // 點擊外部自動關閉
    document.body.addEventListener('click', (e) => {
        const container = document.getElementById('choiceButtonOptions');
        if (!container) return;
        if (container.style.display !== 'none') {
            if (!container.contains(e.target) && e.target.id !== 'choiceDropdownButton') {
                container.style.display = 'none';
            }
        }
    });
    updateChoiceDropdownButton();
});

// 添加选择提示的 CSS 样式
const choicePromptStyle = document.createElement('style');
choicePromptStyle.textContent = `
    .choice-prompt-container {
        position: fixed;
        bottom: 100px;
        right: 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 12px;
        padding: 16px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        color: white;
        max-width: 350px;
        z-index: 1000;
        opacity: 0;
        transform: translateY(-20px);
        transition: all 0.3s ease;
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.2);
    }
    
    .choice-prompt-title {
        font-size: 14px;
        font-weight: 600;
        margin-bottom: 12px;
        text-align: center;
        color: rgba(255, 255, 255, 0.9);
    }
    
    .choice-options-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    
    .choice-option {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        transition: all 0.2s ease;
    }
    
    .choice-option:hover {
        background: rgba(255, 255, 255, 0.2);
        transform: translateX(4px);
    }
    
    .choice-number {
        font-size: 12px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.8);
        min-width: 20px;
    }
    
    .choice-text {
        flex: 1;
        font-size: 13px;
        line-height: 1.4;
        color: white;
    }
    
    .choice-use-btn {
        background: rgba(255, 255, 255, 0.2);
        border: 1px solid rgba(255, 255, 255, 0.3);
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 11px;
        cursor: pointer;
        transition: all 0.2s ease;
    }
    
    .choice-use-btn:hover {
        background: rgba(255, 255, 255, 0.3);
        transform: scale(1.05);
    }
    
    .choice-use-btn:active {
        transform: scale(0.95);
    }
`;

document.head.appendChild(choicePromptStyle);

// 添加输入框点击事件监听器
document.addEventListener('DOMContentLoaded', function() {
    // 监听输入框点击事件
    document.addEventListener('click', function(event) {
        if (event.target.id === 'send_textarea' || event.target.closest('#send_textarea')) {
            // 如果有选择提示，确保它可见
            if (currentChoicePrompt && currentChoicePrompt.container) {
                currentChoicePrompt.container.style.opacity = '1';
                currentChoicePrompt.container.style.transform = 'translateY(0)';
            }
        }
    });
    
    // 监听页面点击事件，点击其他地方时隐藏选择提示
    document.addEventListener('click', function(event) {
        if (currentChoicePrompt && currentChoicePrompt.container) {
            const container = currentChoicePrompt.container;
            if (!container.contains(event.target) && 
                event.target.id !== 'send_textarea' && 
                !event.target.closest('#send_textarea')) {
                // 点击了选择提示外部，隐藏它
                container.style.opacity = '0.5';
                container.style.transform = 'translateY(-10px)';
            }
        }
    });
    
    // 绑定按钮事件
    const btn = document.getElementById('choiceDropdownButton');
    if (btn) {
        btn.onclick = (e) => {
            e.stopPropagation();
            if (btn.disabled) return;
            const menu = document.getElementById('choiceDropdownMenu');
            if (menu.classList.contains('hidden')) {
                showChoiceDropdownMenu();
            } else {
                hideChoiceDropdownMenu();
            }
        };
    }
    // 点击外部自动关闭
    document.body.addEventListener('click', (e) => {
        const menu = document.getElementById('choiceDropdownMenu');
        if (!menu) return;
        if (!menu.classList.contains('hidden')) {
            if (!menu.contains(e.target) && e.target.id !== 'choiceDropdownButton') {
                hideChoiceDropdownMenu();
            }
        }
    });
    updateChoiceDropdownButton();
});

// 添加通话系统样式
document.addEventListener('DOMContentLoaded', function() {
    // 检查是否已经添加过样式
    if (document.getElementById('call-system-styles')) {
        return;
    }
    
    const style = document.createElement('style');
    style.id = 'call-system-styles';
    style.textContent = `
        /* 通话邀请样式 */
        .call-invitation-actions {
            display: flex;
            gap: 12px;
            margin-top: 15px;
            justify-content: center;
        }

        .call-action-btn {
            flex: 1;
            padding: 12px 16px;
            border: none;
            border-radius: 25px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            transition: all 0.3s ease;
            max-width: 120px;
            user-select: none;
        }

        .call-accept-btn {
            background: linear-gradient(135deg, #4CAF50, #45a049);
            color: white;
            box-shadow: 0 2px 8px rgba(76, 175, 80, 0.3);
        }

        .call-accept-btn:hover {
            background: linear-gradient(135deg, #45a049, #3d8b40);
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(76, 175, 80, 0.4);
        }

        .call-accept-btn:active {
            transform: translateY(0);
        }

        .call-decline-btn {
            background: linear-gradient(135deg, #f44336, #d32f2f);
            color: white;
            box-shadow: 0 2px 8px rgba(244, 67, 54, 0.3);
        }

        .call-decline-btn:hover {
            background: linear-gradient(135deg, #d32f2f, #b71c1c);
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(244, 67, 54, 0.4);
        }

        .call-decline-btn:active {
            transform: translateY(0);
        }

        /* 已回应状态 */
        .call-invitation-container.responded .call-invitation-actions {
            display: none;
        }

        .call-invitation-container.responded::after {
            content: "✓ 已回应";
            display: block;
            text-align: center;
            color: #4CAF50;
            font-size: 14px;
            font-weight: 600;
            margin-top: 10px;
            padding: 8px;
            background: rgba(76, 175, 80, 0.1);
            border-radius: 8px;
        }

        /* 通话回应容器样式 */
        .call-response-container {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 16px;
            border-radius: 12px;
            margin: 8px 0;
            font-weight: 500;
        }

        .call-response-container.accepted {
            background: linear-gradient(135deg, rgba(76, 175, 80, 0.15), rgba(76, 175, 80, 0.05));
            border: 1px solid rgba(76, 175, 80, 0.3);
            color: #2e7d32;
        }

        .call-response-container.declined {
            background: linear-gradient(135deg, rgba(244, 67, 54, 0.15), rgba(244, 67, 54, 0.05));
            border: 1px solid rgba(244, 67, 54, 0.3);
            color: #c62828;
        }

        .call-response-icon {
            font-size: 20px;
        }

        .call-response-text {
            font-size: 15px;
        }

        /* 通话邀请容器样式优化 */
        .call-invitation-container {
            background: linear-gradient(135deg, rgba(33, 150, 243, 0.1), rgba(33, 150, 243, 0.05));
            border: 1px solid rgba(33, 150, 243, 0.2);
            border-radius: 16px;
            padding: 16px;
            margin: 8px 0;
            transition: all 0.3s ease;
        }

        .call-invitation-container:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(33, 150, 243, 0.2);
        }

        .call-invitation-header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 8px;
        }

        .call-invitation-icon {
            font-size: 24px;
            color: #2196F3;
        }

        .call-invitation-info {
            flex: 1;
        }

        .call-invitation-title {
            font-size: 16px;
            font-weight: 600;
            color: #333;
            margin-bottom: 4px;
        }

        .call-invitation-note {
            font-size: 14px;
            color: #666;
        }
        
        /* 🆕 通话邀请状态样式 */
        .call-invitation-status {
            text-align: center;
            padding: 12px;
            margin-top: 10px;
            border-radius: 8px;
            font-weight: 600;
            font-size: 14px;
            transition: all 0.3s ease;
        }
        
        .call-invitation-status.accepted {
            background: rgba(76, 175, 80, 0.1);
            color: #2e7d32;
            border: 1px solid rgba(76, 175, 80, 0.3);
        }
        
        .call-invitation-status.declined {
            background: rgba(244, 67, 54, 0.1);
            color: #c62828;
            border: 1px solid rgba(244, 67, 54, 0.3);
        }

        .call-invitation-status.ended {
            background: rgba(158, 158, 158, 0.1);
            color: #424242;
            border: 1px solid rgba(158, 158, 158, 0.3);
        }

        /* 🆕 信封功能樣式 */
        .letter-container {
            cursor: pointer;
            transition: all 0.3s ease;
            margin: 8px 0;
        }

        .letter-container:hover {
            transform: translateY(-2px);
        }

        .letter-envelope {
            background: linear-gradient(135deg, #f5f5f5, #e0e0e0);
            border: 2px solid #d0d0d0;
            border-radius: 12px;
            padding: 16px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            position: relative;
            overflow: hidden;
        }

        .letter-envelope::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 4px;
            background: linear-gradient(90deg, #ff6b6b, #4ecdc4, #45b7d1, #96ceb4);
        }

        .letter-envelope-front {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .letter-seal {
            font-size: 32px;
            filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
        }

        .letter-address {
            flex: 1;
        }

        .letter-to {
            font-size: 14px;
            font-weight: 600;
            color: #333;
            margin-bottom: 4px;
        }

        .letter-from {
            font-size: 12px;
            color: #666;
        }

        .letter-content {
            background: linear-gradient(135deg, #fff9f0, #fff5e6);
            border: 1px solid #e6d7c3;
            border-radius: 8px;
            margin-top: 12px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            overflow: hidden;
        }

        .letter-header {
            background: linear-gradient(135deg, #8b4513, #a0522d);
            color: white;
            padding: 12px 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .letter-date {
            font-size: 14px;
            font-weight: 600;
        }

        .letter-close-btn {
            cursor: pointer;
            font-size: 18px;
            padding: 4px 8px;
            border-radius: 4px;
            transition: background-color 0.2s ease;
        }

        .letter-close-btn:hover {
            background-color: rgba(255, 255, 255, 0.2);
        }

        .letter-body {
            padding: 16px;
        }

        .letter-sender,
        .letter-recipient {
            font-size: 14px;
            font-weight: 600;
            color: #8b4513;
            margin-bottom: 8px;
        }

        .letter-text {
            font-size: 15px;
            line-height: 1.6;
            color: #333;
            white-space: pre-wrap;
        }

        .letter-container.letter-opened .letter-envelope {
            border-color: #8b4513;
            box-shadow: 0 6px 20px rgba(139, 69, 19, 0.2);
        }

        .letter-container.letter-closed .letter-envelope {
            border-color: #d0d0d0;
        }
    `;
    
    document.head.appendChild(style);
    Logger.debug('通话系统：CSS样式已加载');
});

Logger.debug('通话系统：respondToCall 函数已加载');