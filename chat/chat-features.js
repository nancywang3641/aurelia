// =======================================================================
//                          用戶互動函數
// =======================================================================

/**
 * 🔥 优化版：智能消息发送器 - 基于官方 API
 */
async function sendMessage() {
    const userInput = document.getElementById('userInput');
    const messageText = userInput.value.trim();
    
    // === 验证和预处理 ===
    const validationResult = MessageValidator.validate(messageText);
    if (!validationResult.isValid) {
        if (CONFIG.DEBUG_MODE) console.log('[聊天面板] 消息验证失败:', validationResult.reason);
        return;
    }

    if (CONFIG.DEBUG_MODE) console.log('[聊天面板] 🚀 开始发送消息:', messageText);

    try {
        // 使用优化的消息构建器
        const messageBuilder = new MessageBuilder(messageText, currentChat);
        const wrappedMessage = await messageBuilder.build();
        
        if (CONFIG.DEBUG_MODE) console.log('[聊天面板] 📦 构建的消息:', wrappedMessage);

        // 使用改进的发送器
        const success = await MessageSender.send(wrappedMessage);
        
        if (success) {
            MessageSender.cleanup(userInput);
            MessageSender.notifyProcessor();
        } else {
            throw new Error('消息发送失败');
        }
        
    } catch (error) {
        console.error('[聊天面板] ❌ 发送失败:', error);
        showErrorToast('消息发送失败: ' + error.message);
    }
}

// === 🔥 新增：消息验证器 ===
const MessageValidator = {
    validate(messageText) {
        // 檢查是否有內容或附件
        const hasContent = messageText && messageText.trim() !== '';
        const hasAttachments = window.currentAttachments && window.currentAttachments.length > 0;
        
        // 修正：只要有附件就允許發送
        if (!hasContent && !hasAttachments) {
            return { isValid: false, reason: '没有内容或附件' };
        }
        
        // 检查是否有当前聊天
        if (!currentChat) {
            return { isValid: false, reason: '没有选择聊天室' };
        }
        
        // 检查消息长度
        if (hasContent && messageText.length > 8000) {
            return { isValid: false, reason: '消息内容过长' };
        }
        
        return { isValid: true };
    }
};

// === 🔥 新增：智能消息构建器 ===
class MessageBuilder {
    constructor(messageText, chat) {
        this.messageText = messageText;
        
        // 🔥 修正：從正確的聊天存儲中獲取完整的聊天信息
        const chatStore = chat.type === 'dm' ? chatData.dmChats : 
                         chat.type === 'story' ? chatData.storyChats :
                         chatData.groupChats;
        
        // 獲取完整的聊天信息
        const fullChatInfo = chatStore[chat.id];
        console.log('[MessageBuilder] 檢查聊天信息:', {
            chatId: chat.id,
            chatType: chat.type,
            hasFullChatInfo: !!fullChatInfo,
            fullChatInfo: fullChatInfo,
            originalChat: chat
        });
        
        if (fullChatInfo) {
            // 合併聊天列表信息和存儲信息
            this.chat = { ...chat, ...fullChatInfo };
            console.log('[MessageBuilder] 使用完整聊天信息:', this.chat);
        } else {
            this.chat = chat;
            console.log('[MessageBuilder] 使用聊天列表信息:', this.chat);
        }
        
        // 🔥 修正：直接使用傳入的 chat.id，不進行ID修正
        // 避免因為參與者信息不正確而生成錯誤的ID
        console.log('[MessageBuilder] 使用傳入的聊天ID:', this.chat.id);
        
        this.messageType = 'none';
        
        this.messageType = 'none';
    }
    
    async build() {
        // 处理附件和特殊内容
        const processedContent = this.processContent();
        
        // 获取消息ID
        const messageId = await this.getNextMessageId();
        
        // 构建消息对象
        const messageObject = this.createMessageObject(messageId, processedContent);
        
        // 包装消息
        return this.wrapMessage(messageObject);
    }
    
    processContent() {
        let content = this.messageText;
        let type = 'none';
        
        // 处理附件标签
        if (typeof processMessageForSending === 'function') {
            const processed = processMessageForSending(content);
            content = processed.message;
            type = processed.type;
        }
        
        // 检测特殊消息类型
        if (content.includes('$') && /\$[0-9.]+/.test(content)) {
            type = 'transfer';
        }
        
        return { message: content, type: type };
    }
    
    async getNextMessageId() {
        try {
            // 🔥 修正：使用 this.chat.id 而不是 currentChat.id
            if (!this.chat || !this.chat.id) {
                return 1;
            }
            
            const chatStore = this.chat.type === 'dm' ? chatData.dmChats : 
                             this.chat.type === 'story' ? chatData.storyChats :
                             chatData.groupChats;
            
            const chatHistory = chatStore[this.chat.id];
            
            if (chatHistory && chatHistory.messages && chatHistory.messages.length > 0) {
                const numericIds = chatHistory.messages
                    .map(m => parseInt(m.id))
                    .filter(id => !isNaN(id));
                
                if (numericIds.length > 0) {
                    const maxId = Math.max(...numericIds);
                    return maxId + 1;
                }
            }
            
            return 1;
            
        } catch (error) {
            console.warn('[消息构建器] 无法获取最新消息ID，使用备用方案');
            return Date.now() % 10000;
        }
    }
    
/**
 * 🔥 createMessageObject 方法 - 修复版本：正确处理时间
 */
createMessageObject(messageId, processedContent) {
    // 🔥 修正：根據聊天類型選擇用戶名
    let userName;
    if (this.chat.type === 'group') {
        // 群聊使用群組創建者名稱
        userName = this.chat.admin || '{{user}}';
    } else if (this.chat.type === 'dm') {
        // 🔥 私聊優先使用聊天對象中的參與者信息
        if (this.chat.participant1 && this.chat.participant1 !== '{{user}}') {
            // 如果參與者信息不是占位符，直接使用
            userName = this.chat.participant1;
            console.log('[MessageBuilder] 私聊使用參與者信息:', { userName, participant1: this.chat.participant1 });
        } else {
            // 如果是占位符，嘗試從私聊設置中獲取實際用戶名
            const actualUserName = getPrivateChatActualUserName(this.chat.id);
            if (actualUserName) {
                userName = actualUserName;
                console.log('[MessageBuilder] 私聊使用設置中的用戶名:', { userName, chatId: this.chat.id });
            } else {
                // 如果沒有設置，使用全局用戶名
                userName = protagonistName && protagonistName.trim() !== '' ? protagonistName : '{{user}}';
                console.log('[MessageBuilder] 私聊使用全局用戶名:', { userName, protagonistName });
            }
        }
    } else {
        // 其他聊天使用全局用戶名
        userName = protagonistName && protagonistName.trim() !== '' ? protagonistName : '{{user}}';
    }
    const statusField = (this.chat.type === 'group') ? '已读' : '已读';
    
    // 🔥 修复：使用与buildWrappedMessage相同的时间获取逻辑
    let time;
    if (typeof lastSystemTime !== 'undefined' && lastSystemTime) {
        const parts = lastSystemTime.split(' ');
        let timePart = '';
        
        // 处理只有时间 "HH:MM" 的情况
        if (parts.length === 1 && /^\d{2}:\d{2}$/.test(parts[0])) {
            timePart = parts[0];
        } 
        // 处理 "YYYY-MM-DD HH:MM" 的情况
        else if (parts.length > 1 && /^\d{2}:\d{2}$/.test(parts[1])) {
            timePart = parts[1];
        }
        
        if (timePart) {
            // 🔥 如果设置了时间偏移量，应用偏移
            if (typeof systemTimeOffset !== 'undefined' && systemTimeOffset !== 0) {
                try {
                    const [hours, minutes] = timePart.split(':').map(Number);
                    const systemDate = new Date();
                    systemDate.setHours(hours, minutes, 0, 0);
                    
                    // 应用偏移量
                    const adjustedDate = new Date(systemDate.getTime() + (systemTimeOffset * 60 * 1000));
                    time = `${String(adjustedDate.getHours()).padStart(2, '0')}:${String(adjustedDate.getMinutes()).padStart(2, '0')}`;
                } catch (error) {
                    console.error('[MessageBuilder] 应用偏移量时出错:', error);
                    time = timePart; // 出错时返回原时间
                }
            } else {
                time = timePart;
            }
        } else {
            // 无法解析系统时间，使用现实时间
            time = getCurrentTime();
        }
    } else {
        // 没有系统时间设置，使用现实时间
        time = getCurrentTime();
    }
    
    return {
        id: messageId,
        sender: userName,
        content: processedContent.message,
        type: processedContent.type,
        time: time, // 🔥 使用修复后的时间
        status: statusField
    };
}
    
    wrapMessage(messageObject) {
        // 🔥 新格式：[id|chatId|sender|content]（去掉時間）
        const messageLine = `[${messageObject.id}|${this.chat.id}|${messageObject.sender}|${messageObject.content}]`;
        const chatId = this.chat.id;
        
        // 🔥 修正：使用現有的聊天ID生成標頭，而不是生成新的ID
        let chatInfo;
        if (this.chat.type === 'dm') {
            // 使用現有的參與者信息，但保持現有的聊天ID
            const participant1 = this.chat.participant1 || '{{user}}';
            const participant2 = this.chat.participant2 || this.chat.name || '{{char}}';
            chatInfo = `${chatId}|${participant2}|${participant1}⇆${participant2}`;
        } else if (this.chat.type === 'group') {
            const chatName = this.chat.name || '';
            const admin = this.chat.admin || '';
            const members = this.chat.members || '';
            chatInfo = `${chatId}|${chatName}|${admin}|${members}`;
        } else {
            chatInfo = `${chatId}|${this.chat.name || ''}`;
        }
        
        // 判斷是否為新聊天室（無任何消息）
        let isFirstMessage = false;
        let chatStore = this.chat.type === 'dm' ? chatData.dmChats : 
                        this.chat.type === 'story' ? chatData.storyChats :
                        chatData.groupChats;
        if (chatStore && chatStore[chatId] && Array.isArray(chatStore[chatId].messages)) {
            isFirstMessage = chatStore[chatId].messages.length === 0;
        } else {
            isFirstMessage = true;
        }
        
        if (isFirstMessage) {
            // 🔥 新格式：新聊天室，補 [Chat|...] 標頭（不再使用block標籤）
            return `[Chat|${chatInfo}]\n${messageLine}`;
        } else {
            // 🔥 新格式：已有聊天室，只發送消息（不再使用block標籤）
            return messageLine;
        }
    }
    
    getChatInfo() {
        const chatId = this.chat.id;
        if (this.chat.type === 'dm') {
            // 🔥 修正：確保與私聊創建時的參與者順序一致
            let participant1 = '';
            let participant2 = '';
            
            // 🔥 優先使用聊天對象中的參與者信息（包括私聊設置更新的信息）
            if (this.chat.participant1 && this.chat.participant2) {
                participant1 = this.chat.participant1;
                participant2 = this.chat.participant2;
                console.log('[MessageBuilder] 使用聊天對象中的參與者信息:', { participant1, participant2 });
            } else {
                // 如果沒有參與者信息，使用默認值
                participant1 = (typeof protagonistName !== 'undefined' && protagonistName && protagonistName !== '{{user}}') ? protagonistName : '{{user}}';
                participant2 = this.chat.name || '{{char}}';
                console.log('[MessageBuilder] 使用默認參與者信息:', { participant1, participant2 });
            }
            
            console.log('[MessageBuilder] 生成私聊標頭:', { participant1, participant2, chatId });
            console.log('[MessageBuilder] 聊天對象信息:', {
                participant1: this.chat.participant1,
                participant2: this.chat.participant2,
                name: this.chat.name,
                type: this.chat.type
            });
            
            // 🔥 使用與私聊創建時相同的參與者順序
            const chatHeader = window.generatePrivateChatHeader(participant1, participant2);
            
            // 從生成的標頭中提取聊天信息部分
            const match = chatHeader.match(/\[Chat\|(.+?)\]/);
            if (match) {
                return match[1]; // 返回 Chat| 後面的部分
            }
            
            // 如果解析失敗，使用原有邏輯
            return `${chatId}|${participant1}⇆${participant2}`;
        }
        
        // 🔥 修正：群聊也使用 generateGroupChatHeader 函數
        const chatName = this.chat.name || '';
        const admin = this.chat.admin || '';
        const members = this.chat.members || '';
        
        // 使用 generateGroupChatHeader 函數
        const chatHeader = window.generateGroupChatHeader(chatName, admin, members);
        
        // 從生成的標頭中提取聊天信息部分
        const match = chatHeader.match(/\[Chat\|(.+?)\]/);
        if (match) {
            return match[1]; // 返回 Chat| 後面的部分
        }
        
        // 如果解析失敗，使用原有邏輯
        return `${chatId}|${chatName}|${admin}|${members}`;
    }
}

// === 🔥 新增：智能消息发送器 ===
const MessageSender = {
    async send(wrappedMessage) {
        const tavernWindow = this.findTavernWindow();
        if (!tavernWindow) {
            throw new Error('找不到酒馆AI主环境');
        }
        
        const elements = this.getTavernElements(tavernWindow);
        if (!elements.textarea || !elements.sendButton) {
            throw new Error('找不到发送元素');
        }
        
        return await this.performSend(elements, wrappedMessage);
    },
    
    findTavernWindow() {
        // 优化的窗口查找逻辑
        const candidates = [
            () => findTavernMainWindow(), // 使用现有函数
            () => window.parent,
            () => window.top
        ];
        
        for (const getWindow of candidates) {
            try {
                const win = getWindow();
                if (win && this.validateTavernWindow(win)) {
                    return win;
                }
            } catch (error) {
                // 继续尝试
            }
        }
        
        return null;
    },
    
    validateTavernWindow(win) {
        try {
            return win.document && 
                   win.document.querySelector('#send_textarea') &&
                   win.document.querySelector('#send_but');
        } catch {
            return false;
        }
    },
    
    getTavernElements(tavernWindow) {
        return {
            textarea: tavernWindow.document.querySelector('#send_textarea'),
            sendButton: tavernWindow.document.querySelector('#send_but')
        };
    },
    
    async performSend(elements, wrappedMessage) {
        return new Promise((resolve, reject) => {
            try {
                // 设置消息内容
                elements.textarea.value = wrappedMessage;
                elements.textarea.dispatchEvent(new Event('input', { bubbles: true }));
                
                // 延迟发送，确保内容已设置
                setTimeout(() => {
                    try {
                        elements.sendButton.click();
                        if (CONFIG.DEBUG_MODE) console.log('[消息发送器] ✅ 消息发送成功');
                        resolve(true);
                    } catch (error) {
                        reject(new Error('点击发送按钮失败: ' + error.message));
                    }
                }, 100);

            } catch (error) {
                reject(new Error('设置消息内容失败: ' + error.message));
            }
        });
    },
    
    cleanup(userInput) {
        // 清空输入框
        if (userInput) {
            userInput.value = '';
        }
        
        // 清空附件
        if (typeof clearAllAttachments === 'function') {
            clearAllAttachments();
        }
        
        // 清除 API 缓存
        TavernAPI.clearCache();
    },
    
    notifyProcessor() {
        setTimeout(() => {
            if (typeof notifyProcessorToCheck === 'function') {
                notifyProcessorToCheck();
            }
        }, 500);
    }
};

/**
 * 🔥 获取下一个消息序号（简化版）
 */
async function getNextMessageId() {
    if (!currentChat || !currentChat.id) {
        return 1;
    }
    
    try {
        // 🔥 修复：获取当前聊天室的完整消息数据来计算ID
        const chatStore = currentChat.type === 'dm' ? chatData.dmChats : 
                         currentChat.type === 'story' ? chatData.storyChats :
                         chatData.groupChats;
        
        const chatHistory = chatStore[currentChat.id];
        
        if (chatHistory && chatHistory.messages && chatHistory.messages.length > 0) {
            // 🔥 关键修复：获取所有数字ID的最大值
            const numericIds = chatHistory.messages
                .map(m => parseInt(m.id))
                .filter(id => !isNaN(id));
            
            if (numericIds.length > 0) {
                const maxId = Math.max(...numericIds);
                const nextId = maxId + 1;
                
                if (CONFIG.DEBUG_MODE) console.log(`[聊天面板] 当前聊天 ${currentChat.id} 最大ID: ${maxId}, 下一个ID: ${nextId}`);
                return nextId;
            }
        }
        
        // 如果没有消息，从1开始
        if (CONFIG.DEBUG_MODE) console.log(`[聊天面板] 聊天室 ${currentChat.id} 无消息，从1开始`);
        return 1;
        
    } catch (error) {
        console.error('[聊天面板] 获取下一个消息ID时出错:', error);
        return Date.now() % 1000; // 备用方案
    }
}

/**
 * 🔥 构建包装消息（修复版本：正确处理时间）
 */
async function buildWrappedMessage(userMessage, messageType = 'none') {
    if (!currentChat) {
        throw new Error('没有当前聊天室');
    }
    try {
        const nextMessageId = await getNextMessageId();
        const userName = protagonistName && protagonistName.trim() !== '' ? protagonistName : '{{user}}';
        
        // 🔥 省token：去掉时间字段
        const messageLine = `[${nextMessageId}|${currentChat.id}|${userName}|${userMessage}]`;
        
        const chatId = currentChat.id;
        // 判斷是否為新聊天室
        let isFirstMessage = false;
        let chatStore = currentChat.type === 'dm' ? chatData.dmChats : 
                        currentChat.type === 'story' ? chatData.storyChats :
                        chatData.groupChats;
        if (chatStore && chatStore[chatId] && Array.isArray(chatStore[chatId].messages)) {
            isFirstMessage = chatStore[chatId].messages.length === 0;
        } else {
            isFirstMessage = true;
        }
        if (isFirstMessage) {
            // 🔥 新格式：新聊天室，補 [Chat|...] 標頭（不再使用block標籤）
            const chatName = currentChat.name || '';
            const admin = currentChat.admin || '';
            const members = currentChat.members || '';
            const chatInfo = `${chatId}|${chatName}|${admin}|${members}`;
            return `[Chat|${chatInfo}]\n${messageLine}`;
        } else {
            // 🔥 新格式：已有聊天室，只發送消息（不再使用block標籤）
            return messageLine;
        }
    } catch (error) {
        console.error('[聊天面板] 构建包装消息时出错:', error);
        const nextId = Date.now() % 10000;
        const userName = protagonistName && protagonistName.trim() !== '' ? protagonistName : '{{user}}';
        
        // 🔥 错误情况下也省token：去掉时间字段
        return `[${nextId}|${currentChat.id}|${userName}|${userMessage}]`;
    }
}


// =======================================================================
//                    🔥 优化版消息渲染器
// =======================================================================

/**
 * 🔥 优化版：高性能消息渲染器 - 基于官方 API 和虚拟DOM
 */
class AdvancedMessageRenderer {
    constructor() {
        this.batchSize = 50;
        this.messageCache = new Map();
        this.fragmentCache = new Map();
        this.renderQueue = [];
        this.isRendering = false;
        this.observedElements = new Set();
    }

    /**
     * 批量渲染历史消息 - 主入口
     */
    renderHistoryMessagesBatch(messages) {
        if (!messages || messages.length === 0) {
            if (CONFIG.DEBUG_MODE) console.log('[消息渲染器] 没有消息需要渲染');
            return;
        }

        if (CONFIG.DEBUG_MODE) console.log(`[消息渲染器] 🎨 开始优化渲染 ${messages.length} 条消息`);

        // 使用 requestAnimationFrame 进行非阻塞渲染
        requestAnimationFrame(async () => {
            await this.performBatchRender(messages);
        });
    }

    /**
     * 执行批量渲染
     */
    async performBatchRender(messages) {
        try {
            // 预处理消息
            const processedMessages = this.preprocessMessages(messages);
            
            // 使用文档片段进行批量DOM操作
            const fragment = await this.createOptimizedFragment(processedMessages);
            
            // 一次性添加到DOM
            this.appendToContainer(fragment);
            
            // 优化滚动和状态更新
            this.finalizeRender(processedMessages);
            
        } catch (error) {
            console.error('[消息渲染器] 渲染失败:', error);
            // 降级到简单渲染
            this.fallbackRender(messages);
        }
    }

    /**
     * 预处理消息
     */
    preprocessMessages(messages) {
        const processed = [];
        
        for (const msg of messages) {
            // 处理撤回消息
            if (this.isRecallMessage(msg)) {
                handleMessageRecall(msg.content);
                continue;
            }
            
            // 添加到处理列表
            processed.push(msg);
        }
        
        // 更新消息列表
        currentMessages.push(...processed);
        
        return processed;
    }

    /**
     * 创建优化的文档片段
     */
    async createOptimizedFragment(messages) {
        // 🔥 存储消息数组供createOptimizedMessage使用
        this.currentRenderingMessages = messages;
        
        const fragment = document.createDocumentFragment();
        let lastDate = lastDisplayedDate;
        
        for (const msg of messages) {
            // 处理日期分隔符
            if (msg.date && msg.date !== lastDate) {
                const dateElement = this.createDateSeparator(msg.date);
                fragment.appendChild(dateElement);
                lastDate = msg.date;
                lastDisplayedDate = msg.date;
            }
            
            // 创建消息元素
            const msgElement = await this.createOptimizedMessage(msg);
            if (msgElement) {
                fragment.appendChild(msgElement);
            }
        }
        
        // 🔥 清理临时存储的消息数组
        this.currentRenderingMessages = null;
        
        return fragment;
    }

    /**
     * 创建优化的消息元素
     */
    async createOptimizedMessage(msg) {
        // 检查缓存
        const cacheKey = this.generateCacheKey(msg);
        if (this.messageCache.has(cacheKey)) {
            const cached = this.messageCache.get(cacheKey);
            return cached.cloneNode(true);
        }
        
        // 创建新元素
        const msgElement = await createMessage(msg, currentChat.type, this.currentRenderingMessages);
        if (!msgElement) return null;
        
        // 设置属性
        msgElement.classList.add('visible');
        msgElement.dataset.messageId = msg.id;
        
        // 缓存较小的元素
        if (msg.content && msg.content.length < 1000) {
            this.messageCache.set(cacheKey, msgElement.cloneNode(true));
        }
        
        return msgElement;
    }

    /**
     * 创建日期分隔符
     */
    createDateSeparator(date) {
        const cacheKey = `date_${date}`;
        if (this.fragmentCache.has(cacheKey)) {
            return this.fragmentCache.get(cacheKey).cloneNode(true);
        }
        
        const separator = document.createElement('div');
        separator.className = 'date-separator';
        separator.textContent = formatDateForDisplay(date);
        
        this.fragmentCache.set(cacheKey, separator.cloneNode(true));
        return separator;
    }

    /**
     * 添加到容器
     */
    appendToContainer(fragment) {
        if (!currentChatBody) {
            console.error('[消息渲染器] 找不到聊天容器');
            return;
        }
        
        currentChatBody.appendChild(fragment);
    }

    /**
     * 完成渲染
     */
    finalizeRender(messages) {
        // 优化滚动
        this.optimizedScroll();
        
        // 保存状态
        setTimeout(() => saveChatState(), 50);
        
        if (CONFIG.DEBUG_MODE) console.log(`[消息渲染器] ✅ 完成渲染 ${messages.length} 条消息`);
    }

    /**
     * 优化滚动
     */
    optimizedScroll() {
        if (!currentChatBody) return;
        
        requestAnimationFrame(() => {
            currentChatBody.scrollTop = currentChatBody.scrollHeight;
        });
    }

    /**
     * 降级渲染
     */
    fallbackRender(messages) {
        if (CONFIG.DEBUG_MODE) console.log('[消息渲染器] 使用降级渲染');
        
        let lastDate = lastDisplayedDate;
        
        for (const msg of messages) {
            if (this.isSystemMessage(msg)) {
                this.handleSystemMessage(msg);
                continue;
            }
            
            if (this.isRecallMessage(msg)) {
                handleMessageRecall(msg.content);
                continue;
            }
            
            // 添加日期分隔符
            if (msg.date && msg.date !== lastDate) {
                const separator = this.createDateSeparator(msg.date);
                currentChatBody.appendChild(separator);
                lastDate = msg.date;
                lastDisplayedDate = msg.date;
            }
            
            // 创建消息元素
            const msgElement = createMessage(msg, currentChat.type, messages);
            if (msgElement) {
                msgElement.classList.add('visible');
                msgElement.dataset.messageId = msg.id;
                currentChatBody.appendChild(msgElement);
            }
        }
        
        currentMessages.push(...messages.filter(msg => 
            !this.isSystemMessage(msg) && !this.isRecallMessage(msg)
        ));
        
        this.optimizedScroll();
        saveChatState();
    }

    /**
     * 工具方法
     */
    isSystemMessage(msg) {
        // 🔥 修正：檢查多種系統消息標記
        // 1. 檢查 isSystemMessage 標記
        if (msg.isSystemMessage) {
            return true;
        }
        // 2. 檢查發送者是否為系統
        if (msg.sender === '系統' || msg.sender === '系统') {
            return true;
        }
        // 3. 檢查消息類型是否為系統相關
        if (msg.type === 'system' || msg.type === 'call_decline' || msg.type === 'call_accept' || msg.type === 'call_ended') {
            return true;
        }
        return false;
    }

    isRecallMessage(msg) {
        return msg.content && msg.content.startsWith('[撤回|');
    }

    handleSystemMessage(msg) {
        // 🔥 修正：系統消息需要特殊處理，不顯示用戶泡泡
        if (CONFIG.DEBUG_MODE) console.log('[系統消息處理] 處理系統消息:', msg);
        
        // 創建系統消息元素
        const systemElement = document.createElement('div');
        systemElement.className = 'message system-message';
        systemElement.dataset.messageId = msg.id;
        
        // 🔥 修正：根據消息類型和內容設置不同的顯示文本
        let systemContent = '';
        
        // 1. 檢查消息類型
        if (msg.type === 'call_decline' || (msg.content && msg.content.includes('[call_decline:'))) {
            const declineRegex = /\[call_decline:(.*?)\]/;
            const declineMatch = msg.content.match(declineRegex);
            if (declineMatch) {
                const decliner = declineMatch[1].trim();
                systemContent = `❌ ${decliner} 拒絕了視訊通話`;
            }
        } else if (msg.type === 'call_accept' || (msg.content && msg.content.includes('[call_accept:'))) {
            const acceptRegex = /\[call_accept:(.*?)\]/;
            const acceptMatch = msg.content.match(acceptRegex);
            if (acceptMatch) {
                const accepter = acceptMatch[1].trim();
                systemContent = `✅ ${accepter} 接受了視訊通話`;
            }
        } else if (msg.type === 'call_ended' || (msg.content && msg.content.includes('[call_ended:'))) {
            const endedRegex = /\[call_ended:(.*?)\]/;
            const endedMatch = msg.content.match(endedRegex);
            if (endedMatch) {
                const ender = endedMatch[1].trim();
                systemContent = `📞 ${ender} 結束了視訊通話`;
            }
        } else {
            // 其他系統消息
            systemContent = msg.content;
        }
        
        // 🔥 修正：如果沒有解析到內容，使用默認文本
        if (!systemContent || systemContent === msg.content) {
            systemContent = '系統通知';
        }
        
        systemElement.innerHTML = `
            <div class="system-content">
                <span class="system-text">${systemContent}</span>
            </div>
        `;
        
        // 添加到聊天界面
        if (currentChatBody) {
            currentChatBody.appendChild(systemElement);
        }
    }

    generateCacheKey(msg) {
        return `${msg.id}_${msg.sender}_${msg.content ? msg.content.substring(0, 50) : ''}_${msg.time}`;
    }

    /**
     * 清理缓存
     */
    clearCache() {
        this.messageCache.clear();
        this.fragmentCache.clear();
    }

    /**
     * 内存清理
     */
    cleanup() {
        this.clearCache();
        this.renderQueue = [];
        this.observedElements.clear();
    }
}

// 创建全局渲染器实例
const advancedRenderer = new AdvancedMessageRenderer();

/**
 * 兼容性包装函数
 */
function renderHistoryMessagesBatch(messages) {
    const result = advancedRenderer.renderHistoryMessagesBatch(messages);
    window.forceHistoryMode = false; // 批量渲染結束後自動關閉
    return result;
}

// =======================================================================
//                       🔥 底部功能面板完整代码
// =======================================================================

// 设置全局函数
window.toggleFunctionPanel = toggleFunctionPanel;
window.hideFunctionPanel = hideFunctionPanel;
window.selectFunction = selectFunction;

/**
 * 切换功能面板的显示状态
 */
function toggleFunctionPanel() {
    const panel = document.getElementById('bottomFunctionPanel');
    const addButton = document.getElementById('addButton');
    
    if (panel.classList.contains('show')) {
        hideFunctionPanel();
    } else {
        showFunctionPanel();
    }
}

/**
 * 显示功能面板
 */
function showFunctionPanel() {
    const panel = document.getElementById('bottomFunctionPanel');
    const addButton = document.getElementById('addButton');
    
    panel.classList.remove('hidden');
    addButton.classList.add('active');
    
    setTimeout(() => {
        panel.classList.add('show');
        // (新增) 在面板顯示後，初始化或刷新分頁圓點
        setupPagination(); 
    }, 10);
    
    if (CONFIG.DEBUG_MODE) console.log('[聊天面板] 功能面板已显示');
}

/**
 * 隐藏功能面板
 */
function hideFunctionPanel() {
    const panel = document.getElementById('bottomFunctionPanel');
    const addButton = document.getElementById('addButton');
    
    panel.classList.remove('show');
    addButton.classList.remove('active');
    
    // 动画结束后隐藏元素
    setTimeout(() => {
        panel.classList.add('hidden');
    }, 300);
    
    if (CONFIG.DEBUG_MODE) console.log('[聊天面板] 功能面板已隐藏');
}

/**
 * 处理功能选择
 */
function selectFunction(functionType) {
    if (CONFIG.DEBUG_MODE) console.log(`[聊天面板] 选择功能: ${functionType}`);
    
    // 🆕 添加时间调节功能处理
    if (functionType === 'time_adjustment') {
        // 调用时间调节的模态窗口系统
        selectFunctionWithModal(functionType);
        
        // 选择功能后隐藏面板
        hideFunctionPanel();
        return;
    }
    
    // 调用新的模态窗口系统处理其他功能
    selectFunctionWithModal(functionType);
    
    // 选择功能后隐藏面板
    hideFunctionPanel();
}

// =======================================================================
//                       (新增) 功能面板分頁邏輯
// =======================================================================
function setupPagination() {
    const container = document.querySelector('.function-grid-container');
    const grid = document.querySelector('.function-grid');
    const dotsContainer = document.querySelector('.pagination-dots');

    if (!container || !grid || !dotsContainer) return;

    // 清空舊的圓點
    dotsContainer.innerHTML = '';

    // 計算需要多少頁
    const containerWidth = container.clientWidth;
    const scrollWidth = grid.scrollWidth;
    const pageCount = Math.ceil(scrollWidth / containerWidth);

    // 如果只有一頁或沒有內容，則不顯示圓點
    if (pageCount <= 1) {
        return;
    }

    // 創建分頁圓點
    for (let i = 0; i < pageCount; i++) {
        const dot = document.createElement('div');
        dot.className = 'dot';
        dot.addEventListener('click', () => {
            // 點擊圓點時，滾動到對應頁面
            container.scrollTo({
                left: i * containerWidth,
                behavior: 'smooth'
            });
        });
        dotsContainer.appendChild(dot);
    }

    const dots = dotsContainer.querySelectorAll('.dot');
    if (dots.length > 0) {
        dots[0].classList.add('active'); // 預設第一個為選中
    }

    // 監聽滾動事件，以更新圓點的選中狀態
    container.addEventListener('scroll', () => {
        const currentPage = Math.round(container.scrollLeft / containerWidth);
        dots.forEach((dot, index) => {
            dot.classList.toggle('active', index === currentPage);
        });
    });
}

// =======================================================================
//                       🔥 語音播放功能
// =======================================================================

/**
 * 切換語音播放狀態（簡化版 - 同時控制文字顯示）
 */
function toggleVoicePlayback(voiceId) {
    const container = document.querySelector(`[data-voice-id="${voiceId}"]`);
    if (!container) return;

    const playButton = container.querySelector('.voice-play-button .play-icon');
    const waveAnimation = container.querySelector('.voice-wave-animation');
    const voiceTextElement = container.querySelector(`#voice-text-${voiceId}`);
    const textContent = container.querySelector(`#voice-text-content-${voiceId}`);
    
    // 獲取當前播放狀態
    const isCurrentlyPlaying = voicePlaybackStates[voiceId]?.isPlaying || false;
    
    if (!isCurrentlyPlaying) {
        // 開始播放：顯示文字泡泡 + 開始動畫 + 打字機效果
        startVoicePlayback(voiceId, playButton, waveAnimation, voiceTextElement, textContent);
    } else {
        // 停止播放：停止動畫，保持文字泡泡顯示
        stopVoicePlayback(voiceId, playButton, waveAnimation, textContent);
    }
}

/**
 * 開始語音播放（集成文字顯示）
 */
function startVoicePlayback(voiceId, playButton, waveAnimation, voiceTextElement, textContent) {
    // 停止其他正在播放的語音
    Object.keys(voicePlaybackStates).forEach(id => {
        if (id !== voiceId && voicePlaybackStates[id]?.isPlaying) {
            const otherContainer = document.querySelector(`[data-voice-id="${id}"]`);
            if (otherContainer) {
                const otherPlayButton = otherContainer.querySelector('.voice-play-button .play-icon');
                const otherWaveAnimation = otherContainer.querySelector('.voice-wave-animation');
                const otherTextContent = otherContainer.querySelector(`#voice-text-content-${id}`);
                stopVoicePlayback(id, otherPlayButton, otherWaveAnimation, otherTextContent);
            }
        }
    });

    // 更新播放狀態
    voicePlaybackStates[voiceId] = { isPlaying: true };
    
    // 更新容器的播放狀態屬性
    const container = document.querySelector(`[data-voice-id="${voiceId}"]`);
    if (container) {
        container.setAttribute('data-voice-playing', 'true');
    }
    
    // 更新按鈕圖標
    playButton.textContent = '⏸';
    playButton.parentElement.title = '暫停播放';
    
    // 啟動波形動畫
    waveAnimation.classList.add('playing');
    
    // 🔥 顯示文字泡泡
    if (textContent) {
        textContent.style.display = 'block';
    }
    
    // 開始打字機效果輸出語音內容
    if (voiceTextElement) {
        const originalText = voiceTextElement.textContent;
        // 🔥 保存原始文字，以便停止時恢復
        voicePlaybackStates[voiceId].originalText = originalText;
        // 🔥 先清空內容再開始打字效果
        voiceTextElement.textContent = '';
        startVoiceTypingEffect(voiceId, voiceTextElement, originalText);
    }
    
    if (CONFIG.DEBUG_MODE) console.log(`[語音播放] 開始播放語音: ${voiceId}`);
}

/**
 * 停止語音播放（保持文字顯示）
 */
function stopVoicePlayback(voiceId, playButton, waveAnimation, textContent) {
    // 更新播放狀態
    voicePlaybackStates[voiceId] = { isPlaying: false };
    
    // 更新容器的播放狀態屬性
    const container = document.querySelector(`[data-voice-id="${voiceId}"]`);
    if (container) {
        container.setAttribute('data-voice-playing', 'false');
    }
    
    // 更新按鈕圖標
    playButton.textContent = '▶';
    playButton.parentElement.title = '播放語音';
    
    // 停止波形動畫
    waveAnimation.classList.remove('playing');
    
    // 停止打字機效果
    if (voicePlaybackStates[voiceId]?.typingInterval) {
        clearInterval(voicePlaybackStates[voiceId].typingInterval);
        voicePlaybackStates[voiceId].typingInterval = null;
        
        // 🔥 恢復完整的語音文字內容
        const voiceTextElement = container.querySelector(`#voice-text-${voiceId}`);
        if (voiceTextElement && voicePlaybackStates[voiceId]?.originalText) {
            voiceTextElement.textContent = voicePlaybackStates[voiceId].originalText;
            voiceTextElement.classList.remove('voice-typing');
        }
    }
    
    if (CONFIG.DEBUG_MODE) console.log(`[語音播放] 停止播放語音: ${voiceId}`);
}

/**
 * 語音打字機效果
 */
function startVoiceTypingEffect(voiceId, element, text, speed = 100) {
    if (!element || !text) return;
    
    // 清空內容並開始打字效果
    element.textContent = '';
    element.classList.add('voice-typing');
    
    let i = 0;
    const typingInterval = setInterval(() => {
        if (i < text.length && voicePlaybackStates[voiceId]?.isPlaying) {
            element.textContent += text.charAt(i);
            i++;
        } else {
            // 打字完成或播放停止
            clearInterval(typingInterval);
            element.classList.remove('voice-typing');
            
            if (voicePlaybackStates[voiceId]) {
                voicePlaybackStates[voiceId].typingInterval = null;
                
                // 如果是正常播放完成，自動停止播放狀態
                if (i >= text.length && voicePlaybackStates[voiceId].isPlaying) {
                    setTimeout(() => {
                        const container = document.querySelector(`[data-voice-id="${voiceId}"]`);
                        if (container) {
                            const playButton = container.querySelector('.voice-play-button .play-icon');
                            const waveAnimation = container.querySelector('.voice-wave-animation');
                            stopVoicePlayback(voiceId, playButton, waveAnimation);
                        }
                    }, 500);
                }
            }
        }
    }, speed);
    
    // 保存定時器引用
    if (!voicePlaybackStates[voiceId]) {
        voicePlaybackStates[voiceId] = {};
    }
    voicePlaybackStates[voiceId].typingInterval = typingInterval;
}

// 將新的函數設為全域可用
window.toggleVoicePlayback = toggleVoicePlayback; // 🔥 語音播放控制（簡化版）

// =======================================================================
//                       🔥 新增：劇情窗口管理系统
// =======================================================================

// 劇情管理器
const storyManager = {
    stories: new Map(),
    currentStoryId: null,
    currentPage: 0,
    displayedPages: new Set(), // 新增：记录已显示过的页面
    currentTypingInterval: null, // 🔥 新增：跟踪当前打字机定时器
    
    // 添加劇情
    addStory(id, content, narrator = '劇情', time = '') {
        // 🔥 调试信息
        if (CONFIG.DEBUG_MODE) {
            console.log(`[劇情管理器] 开始处理劇情: ${id}`);
            console.log(`[劇情管理器] 原始内容长度: ${content.length}`);
            console.log(`[劇情管理器] 内容预览: ${content.substring(0, 100)}...`);
        }
        
        // 预处理内容：将<br>标签转换为换行符以便分页处理
        let processedContent = content.replace(/<br\s*\/?>/gi, '\n');
        
        // 将长文本分页处理
        const pages = this.splitTextIntoPages(processedContent, 250); // 每页约250字符，适合手机阅读
        
        // 将分页后的内容重新转换为HTML格式
        const htmlPages = pages.map(page => page.replace(/\n/g, '<br>'));
        
        this.stories.set(id, {
            id: id,
            narrator: narrator,
            time: time,
            content: content, // 保留原始内容
            pages: htmlPages, // 使用HTML格式的页面
            totalPages: htmlPages.length
        });
        
        if (CONFIG.DEBUG_MODE) {
            console.log(`[劇情管理器] 添加劇情: ${id}, 共${htmlPages.length}页`);
            console.log(`[劇情管理器] 第一页预览: ${htmlPages[0].substring(0, 100)}...`);
        }
    },
    
    // 文本分页 - 改进版：按字数智能分页，支持HTML标签
    splitTextIntoPages(text, maxCharsPerPage = 300) {
        // 如果文本很短，直接返回一页
        if (text.length <= maxCharsPerPage) {
            return [text];
        }
        
        const pages = [];
        let remainingText = text;
        
        while (remainingText.length > 0) {
            if (remainingText.length <= maxCharsPerPage) {
                // 剩余文本不足一页，直接添加
                pages.push(remainingText);
                break;
            }
            
            // 在最大字数范围内寻找合适的分页点
            let cutPoint = maxCharsPerPage;
            let bestCutPoint = cutPoint;
            
            // 优先级1：寻找句号、问号、感叹号
            for (let i = cutPoint; i >= Math.max(0, cutPoint - 50); i--) {
                const char = remainingText[i];
                if (char === '。' || char === '？' || char === '！' || 
                    char === '.' || char === '?' || char === '!') {
                    bestCutPoint = i + 1;
                    break;
                }
            }
            
            // 优先级2：如果没找到句末标点，寻找逗号、分号
            if (bestCutPoint === cutPoint) {
                for (let i = cutPoint; i >= Math.max(0, cutPoint - 30); i--) {
                    const char = remainingText[i];
                    if (char === '，' || char === '；' || char === '、' || 
                        char === ',' || char === ';') {
                        bestCutPoint = i + 1;
                        break;
                    }
                }
            }
            
            // 优先级3：如果还没找到，寻找空格
            if (bestCutPoint === cutPoint) {
                for (let i = cutPoint; i >= Math.max(0, cutPoint - 20); i--) {
                    if (remainingText[i] === ' ') {
                        bestCutPoint = i + 1;
                        break;
                    }
                }
            }
            
            // 优先级4：如果还没找到，寻找<br>标签
            if (bestCutPoint === cutPoint) {
                const brIndex = remainingText.lastIndexOf('<br>', cutPoint);
                if (brIndex > cutPoint - 50 && brIndex > 0) {
                    bestCutPoint = brIndex + 4; // <br> 长度为4
                }
            }
            
            // 提取当前页内容
            const currentPageText = remainingText.substring(0, bestCutPoint).trim();
            if (currentPageText.length > 0) {
                pages.push(currentPageText);
            }
            
            // 更新剩余文本
            remainingText = remainingText.substring(bestCutPoint).trim();
        }
        
        return pages.length > 0 ? pages : [text];
    },
    
    // 获取劇情
    getStory(id) {
        return this.stories.get(id);
    },
    
    // 获取所有劇情列表
    getAllStories() {
        return Array.from(this.stories.values()).sort((a, b) => a.time.localeCompare(b.time));
    }
};

// 打开劇情窗口
function openStoryModal(storyId) {
    // 🔥 如果当前有打字机效果在运行，先停止它
    if (storyManager.currentTypingInterval) {
        clearInterval(storyManager.currentTypingInterval);
        storyManager.currentTypingInterval = null;
        
        // 移除打字机样式
        const storyContent = document.getElementById('storyContent');
        if (storyContent) {
            storyContent.classList.remove('story-typing');
        }
    }
    
    const story = storyManager.getStory(storyId);
    if (!story) {
        console.error('[劇情窗口] 未找到劇情:', storyId);
        return;
    }
    
    storyManager.currentStoryId = storyId;
    storyManager.currentPage = 0;
    storyManager.displayedPages.clear(); // 重置显示状态
    
    const modal = document.getElementById('storyModal');
    const storyTitle = document.getElementById('storyTitle');
    const storyContent = document.getElementById('storyContent');
    const pageInfo = document.getElementById('storyPageInfo');
    const prevBtn = document.getElementById('storyPrevBtn');
    const nextBtn = document.getElementById('storyNextBtn');
    
    // 设置标题和内容
    storyTitle.textContent = `${story.narrator} - ${story.time}`;
    updateStoryPage();
    
    // 显示窗口
    modal.classList.remove('hidden');
    
    if (CONFIG.DEBUG_MODE) console.log(`[劇情窗口] 打开劇情: ${storyId}, 共${story.totalPages}页`);
}

// 更新劇情页面内容
function updateStoryPage() {
    const story = storyManager.getStory(storyManager.currentStoryId);
    if (!story) return;
    
    const storyContent = document.getElementById('storyContent');
    const pageInfo = document.getElementById('storyPageInfo');
    const prevBtn = document.getElementById('storyPrevBtn');
    const nextBtn = document.getElementById('storyNextBtn');
    
    // 创建页面标识符
    const pageKey = `${storyManager.currentStoryId}-${storyManager.currentPage}`;
    const isFirstTime = !storyManager.displayedPages.has(pageKey);
    
    // 更新内容 - 页面内容已经是HTML格式
    storyContent.innerHTML = story.pages[storyManager.currentPage];
    
    // 更新页码
    pageInfo.textContent = `${storyManager.currentPage + 1} / ${story.totalPages}`;
    
    // 更新按钮状态
    prevBtn.disabled = storyManager.currentPage === 0;
    nextBtn.disabled = storyManager.currentPage === story.totalPages - 1;
    
    // 只在首次显示时添加打字机效果
    if (isFirstTime) {
        storyManager.displayedPages.add(pageKey);
        // 在打字机效果期间禁用翻页按钮
        prevBtn.disabled = true;
        nextBtn.disabled = true;
        addStoryTypingEffect(storyContent, prevBtn, nextBtn, storyManager.currentPage, story.totalPages);
    }
}

// 劇情翻页
function storyPrevPage() {
    // 🔥 如果当前有打字机效果在运行，先停止它
    if (storyManager.currentTypingInterval) {
        clearInterval(storyManager.currentTypingInterval);
        storyManager.currentTypingInterval = null;
        
        // 移除打字机样式
        const storyContent = document.getElementById('storyContent');
        if (storyContent) {
            storyContent.classList.remove('story-typing');
        }
    }
    
    if (storyManager.currentPage > 0) {
        storyManager.currentPage--;
        updateStoryPage();
    }
}

function storyNextPage() {
    // 🔥 如果当前有打字机效果在运行，先停止它
    if (storyManager.currentTypingInterval) {
        clearInterval(storyManager.currentTypingInterval);
        storyManager.currentTypingInterval = null;
        
        // 移除打字机样式
        const storyContent = document.getElementById('storyContent');
        if (storyContent) {
            storyContent.classList.remove('story-typing');
        }
    }
    
    const story = storyManager.getStory(storyManager.currentStoryId);
    if (story && storyManager.currentPage < story.totalPages - 1) {
        storyManager.currentPage++;
        updateStoryPage();
    }
}

// 关闭劇情窗口
function closeStoryModal() {
    // 🔥 停止当前打字机效果
    if (storyManager.currentTypingInterval) {
        clearInterval(storyManager.currentTypingInterval);
        storyManager.currentTypingInterval = null;
        
        // 移除打字机样式
        const storyContent = document.getElementById('storyContent');
        if (storyContent) {
            storyContent.classList.remove('story-typing');
        }
        
        // 重新启用翻页按钮
        const prevBtn = document.getElementById('storyPrevBtn');
        const nextBtn = document.getElementById('storyNextBtn');
        const story = storyManager.getStory(storyManager.currentStoryId);
        
        if (prevBtn) prevBtn.disabled = storyManager.currentPage === 0;
        if (nextBtn && story) nextBtn.disabled = storyManager.currentPage === story.totalPages - 1;
    }
    
    const modal = document.getElementById('storyModal');
    modal.classList.add('hidden');
    storyManager.currentStoryId = null;
    storyManager.currentPage = 0;
    storyManager.displayedPages.clear(); // 🔥 重置显示状态
}

// 劇情打字机效果
function addStoryTypingEffect(element, prevBtn, nextBtn, currentPage, totalPages) {
    const text = element.innerHTML; // 使用innerHTML获取包含HTML标签的内容
    
    // 清空内容，准备打字机效果
    element.innerHTML = '';
    element.classList.add('story-typing');
    
    // 将HTML内容转换为字符数组，但保留HTML标签的位置信息
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = text;
    const textContent = tempDiv.textContent;
    
    // 创建字符数组，标记哪些位置是HTML标签
    const chars = [];
    let textIndex = 0;
    let htmlIndex = 0;
    
    while (htmlIndex < text.length) {
        if (text[htmlIndex] === '<') {
            // 找到HTML标签的结束位置
            const tagEnd = text.indexOf('>', htmlIndex);
            if (tagEnd !== -1) {
                const tag = text.substring(htmlIndex, tagEnd + 1);
                chars.push({ type: 'tag', content: tag });
                htmlIndex = tagEnd + 1;
            } else {
                chars.push({ type: 'char', content: text[htmlIndex] });
                htmlIndex++;
            }
        } else {
            chars.push({ type: 'char', content: text[htmlIndex] });
            htmlIndex++;
        }
    }
    
    let i = 0;
    const typeInterval = setInterval(() => {
        if (i < chars.length) {
            // 重建HTML内容
            let currentHtml = '';
            for (let j = 0; j <= i; j++) {
                currentHtml += chars[j].content;
            }
            element.innerHTML = currentHtml;
            i++;
        } else {
            clearInterval(typeInterval);
            storyManager.currentTypingInterval = null; // 🔥 清除定时器引用
            element.classList.remove('story-typing');
            
            // 打字机效果完成后，重新启用翻页按钮
            if (prevBtn) prevBtn.disabled = currentPage === 0;
            if (nextBtn) nextBtn.disabled = currentPage === totalPages - 1;
        }
    }, 30); // 打字速度：30ms一个字符
    
    // 🔥 保存定时器引用，以便后续可以停止
    storyManager.currentTypingInterval = typeInterval;
}

// 设为全局可用
window.openStoryModal = openStoryModal;
window.closeStoryModal = closeStoryModal;
window.storyPrevPage = storyPrevPage;
window.storyNextPage = storyNextPage;
window.storyManager = storyManager;

// ====== 劇情內容提取工具 ======
function extractSceneContent(text) {
    const start = text.indexOf('[scene:');
    if (start === -1) return null;
    let bracketCount = 0;
    let end = -1;
    let fallbackEnd = -1;
    for (let i = start; i < text.length; i++) {
        if (text[i] === '[') bracketCount++;
        if (text[i] === ']') bracketCount--;
        // fallback: 如果遇到 |劇情消息 或行尾也算結束
        if (bracketCount === 0) {
            end = i;
            break;
        }
        if (text.slice(i, i+5) === '|劇情消息') {
            fallbackEnd = i + 5;
            break;
        }
    }
    // 如果沒找到正常結尾 ]，但有 fallbackEnd，則用 fallbackEnd
    if (end === -1 && fallbackEnd !== -1) {
        end = fallbackEnd - 1;
    }
    if (end === -1) return null;
    // 取出 [scene: ... ] 之間的內容，或 [scene: ...|劇情消息
    const content = text.substring(start + 7, end + 1 - (fallbackEnd !== -1 ? 5 : 0)).trim();
    // fullMatch 也自動補 ]
    let fullMatch = text.substring(start, end + 1);
    if (fallbackEnd !== -1 && !fullMatch.endsWith(']')) fullMatch += ']';
    return { content, fullMatch };
}

// =======================================================================
//                          创建群组和私聊功能
// =======================================================================

/**
 * 显示添加菜单
 */
function showAddGroupMenu() {
    const menu = document.getElementById('addGroupMenu');
    // 如果菜单已显示则隐藏，否则显示
    menu.classList.toggle('hidden');
    
    // 点击其他地方时隐藏菜单
    if (!menu.classList.contains('hidden')) {
        setTimeout(() => {
            document.addEventListener('click', hideAddGroupMenuOnClickOutside);
        }, 100);
    }
}

/**
 * 点击外部隐藏菜单
 */
function hideAddGroupMenuOnClickOutside(event) {
    if (!event || !event.target) {
        console.warn('[Add Group Menu] 事件對象無效');
        return;
    }
    
    const menu = document.getElementById('addGroupMenu');
    if (!menu) {
        console.warn('[Add Group Menu] 找不到菜單元素');
        return;
    }
    
    if (!menu.contains(event.target) && !event.target.closest('[onclick="showAddGroupMenu()"]')) {
        menu.classList.add('hidden');
        document.removeEventListener('click', hideAddGroupMenuOnClickOutside);
    }
}

/**
 * 打开添加群組模态窗口
 */
function openAddGroupModal() {
    document.getElementById('addGroupMenu').classList.add('hidden');
    document.getElementById('addGroupModal').classList.remove('hidden');
    
    // 清空输入框
    document.getElementById('groupNameInput').value = '';
    document.getElementById('adminNameInput').value = '';
    
    // 🆕 清空成員列表
    window.currentGroupMembers = [];
    if (window.updateMemberAvatarDisplay) {
        window.updateMemberAvatarDisplay();
    }
    
    // 🆕 重置群組頭像
    window.groupAvatarData = null;
    const groupAvatarPreview = document.getElementById('groupAvatarPreview');
    if (groupAvatarPreview) {
        groupAvatarPreview.src = 'https://files.catbox.moe/ew2nex.png';
    }
    
    // 🆕 清空群組頭像上傳輸入框
    const groupAvatarInput = document.getElementById('groupAvatarInput');
    if (groupAvatarInput) {
        groupAvatarInput.value = '';
    }
    
    // 🆕 重置群組創建者頭像
    window.adminAvatarData = null;
    const adminAvatarPreview = document.getElementById('adminAvatarPreview');
    if (adminAvatarPreview) {
        adminAvatarPreview.src = 'https://files.catbox.moe/ew2nex.png';
    }
    
    // 🆕 清空頭像上傳輸入框
    const adminAvatarInput = document.getElementById('adminAvatarInput');
    if (adminAvatarInput) {
        adminAvatarInput.value = '';
    }
    
    // 🆕 重置成員管理器的臨時數據
    if (window.currentGroupId) {
        window.currentGroupId = null;
    }
    
    // (新增) 為日期和時間輸入框預填當前現實時間，方便用戶修改
    const now = new Date();
    const currentDate = now.toISOString().slice(0, 10);
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    document.getElementById('groupDateInput').value = currentDate;
    document.getElementById('groupTimeInput').value = currentTime;

    // 聚焦到第一个输入框
    document.getElementById('groupNameInput').focus();
    
    // 🆕 設置群組頭像上傳監聽器
    setupGroupAvatarUpload();
    
    // 🆕 設置群組創建者頭像上傳監聽器
    setupAdminAvatarUpload();
}

/**
 * 🆕 設置群組頭像上傳監聽器
 */
function setupGroupAvatarUpload() {
    const groupAvatarInput = document.getElementById('groupAvatarInput');
    const groupAvatarPreview = document.getElementById('groupAvatarPreview');
    
    groupAvatarInput.onchange = function(event) {
        const file = event.target.files[0];
        if (file) {
            try {
                // 驗證文件
                if (window.groupMemberManager) {
                    window.groupMemberManager.validateImageFile(file);
                }
                
                // 創建預覽
                const reader = new FileReader();
                reader.onload = function(e) {
                    groupAvatarPreview.src = e.target.result;
                    // 保存到全局變量
                    window.groupAvatarData = e.target.result;
                };
                reader.readAsDataURL(file);
                
            } catch (error) {
                alert(error.message);
                groupAvatarInput.value = '';
            }
        }
    };
}

/**
 * 🆕 設置群組創建者頭像上傳監聽器
 */
function setupAdminAvatarUpload() {
    const adminAvatarInput = document.getElementById('adminAvatarInput');
    const adminAvatarPreview = document.getElementById('adminAvatarPreview');
    
    adminAvatarInput.onchange = function(event) {
        const file = event.target.files[0];
        if (file) {
            try {
                // 驗證文件
                if (window.groupMemberManager) {
                    window.groupMemberManager.validateImageFile(file);
                }
                
                // 創建預覽
                const reader = new FileReader();
                reader.onload = function(e) {
                    adminAvatarPreview.src = e.target.result;
                    // 保存到全局變量
                    window.adminAvatarData = e.target.result;
                };
                reader.readAsDataURL(file);
                
            } catch (error) {
                alert(error.message);
                adminAvatarInput.value = '';
            }
        }
    };
}

/**
 * 關閉添加群組模态窗口
 */
function closeAddGroupModal() {
    document.getElementById('addGroupModal').classList.add('hidden');
}

/**
 * 打開創建私訊的彈出視窗
 */
function openAddPrivateChatModal() {
    document.getElementById('addGroupMenu').classList.add('hidden');
    document.getElementById('addPrivateChatModal').classList.remove('hidden');
    
    // 自動填入當前用戶名稱
    const yourNameInput = document.getElementById('yourNameInput');
    if (protagonistName) {
        yourNameInput.value = protagonistName;
    } else {
        yourNameInput.value = '{{user}}';
    }
    
    document.getElementById('otherPersonNameInput').value = '';

    // 🆕 重置用戶頭像
    window.userAvatarData = null;
    const userAvatarPreview = document.getElementById('userAvatarPreview');
    if (userAvatarPreview) {
        userAvatarPreview.src = 'https://files.catbox.moe/ew2nex.png';
    }
    
    // 🆕 清空用戶頭像上傳輸入框
    const userAvatarInput = document.getElementById('userAvatarInput');
    if (userAvatarInput) {
        userAvatarInput.value = '';
    }
    
    // 🆕 重置角色頭像
    window.characterAvatarData = null;
    const characterAvatarPreview = document.getElementById('characterAvatarPreview');
    if (characterAvatarPreview) {
        characterAvatarPreview.src = 'https://files.catbox.moe/ew2nex.png';
    }
    
    // 🆕 清空角色頭像上傳輸入框
    const characterAvatarInput = document.getElementById('characterAvatarInput');
    if (characterAvatarInput) {
        characterAvatarInput.value = '';
    }

    // 預填當前現實時間
    const now = new Date();
    const currentDate = now.toISOString().slice(0, 10);
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    document.getElementById('privateChatDateInput').value = currentDate;
    document.getElementById('privateChatTimeInput').value = currentTime;

    // 🆕 設置頭像上傳監聽器
    setupPrivateChatAvatarUploads();

    document.getElementById('otherPersonNameInput').focus();
}

/**
 * 🆕 設置私聊頭像上傳監聽器
 */
function setupPrivateChatAvatarUploads() {
    // 設置用戶頭像上傳監聽器
    const userAvatarInput = document.getElementById('userAvatarInput');
    const userAvatarPreview = document.getElementById('userAvatarPreview');
    
                userAvatarInput.onchange = function(event) {
                const file = event.target.files[0];
                if (file) {
                    try {
                        // 驗證文件
                        if (window.privateChatManager) {
                            window.privateChatManager.validateImageFile(file);
                        }
                        
                        // 創建預覽
                        const reader = new FileReader();
                        reader.onload = function(e) {
                            userAvatarPreview.src = e.target.result;
                            // 保存到全局變量
                            window.userAvatarData = e.target.result;
                        };
                        reader.readAsDataURL(file);
                        
                    } catch (error) {
                        alert(error.message);
                        userAvatarInput.value = '';
                    }
                }
            };
    
    // 設置角色頭像上傳監聽器
    const characterAvatarInput = document.getElementById('characterAvatarInput');
    const characterAvatarPreview = document.getElementById('characterAvatarPreview');
    
                characterAvatarInput.onchange = function(event) {
                const file = event.target.files[0];
                if (file) {
                    try {
                        // 驗證文件
                        if (window.privateChatManager) {
                            window.privateChatManager.validateImageFile(file);
                        }
                        
                        // 創建預覽
                        const reader = new FileReader();
                        reader.onload = function(e) {
                            characterAvatarPreview.src = e.target.result;
                            // 保存到全局變量
                            window.characterAvatarData = e.target.result;
                        };
                        reader.readAsDataURL(file);
                        
                    } catch (error) {
                        alert(error.message);
                        characterAvatarInput.value = '';
                    }
                }
            };
}

/**
 * 關閉創建私訊的彈出視窗
 */
function closeAddPrivateChatModal() {
    document.getElementById('addPrivateChatModal').classList.add('hidden');
}

/**
 * 打開創建劇情聊天室模態窗口
 */
function openAddStoryChatModal() {
    // 直接隱藏菜單，不需要事件對象
    const menu = document.getElementById('addGroupMenu');
    if (menu) {
        menu.classList.add('hidden');
    }
    
    const modal = document.getElementById('addStoryChatModal');
    const currentDate = getCurrentDate();
    const currentTime = getCurrentTime();
    
    document.getElementById('storyChatDateInput').value = currentDate;
    document.getElementById('storyChatTimeInput').value = currentTime;
    document.getElementById('storyNameInput').value = '';
    document.getElementById('storyDescriptionInput').value = '';
    
    modal.classList.remove('hidden');
    setTimeout(() => document.getElementById('storyNameInput').focus(), 100);
}

/**
 * 關閉創建劇情聊天室模態窗口
 */
function closeAddStoryChatModal() {
    document.getElementById('addStoryChatModal').classList.add('hidden');
}

/**
 * 創建新群組
 */
async function createNewGroup() {
    const groupName = document.getElementById('groupNameInput').value.trim();
    const adminName = document.getElementById('adminNameInput').value.trim();
    
    const customDate = document.getElementById('groupDateInput').value;
    const customTime = document.getElementById('groupTimeInput').value;
    
    if (!groupName || !adminName) {
        alert('請填寫群組名稱和管理員名稱！');
        return;
    }
    
    // 🆕 使用新的成員管理系統
    const currentGroupMembers = window.currentGroupMembers || [];
    if (currentGroupMembers.length === 0) {
        alert('請至少添加一個群組成員');
        return;
    }
    
    const members = currentGroupMembers.map(m => m.name);
    
    if (CONFIG.DEBUG_MODE) console.log('[聊天面板] 🏗️ 開始創建群組 (使用簡化格式)...');

    const finalDate = (customDate && customTime) ? customDate : new Date().toISOString().slice(0, 10);
    const finalTime = (customDate && customTime) ? customTime : (() => {
        const d = new Date();
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    })();
    
    isUserSendingMessage = true;
    
    // 🔥 修正：使用群聊ID映射機制
    const groupId = getOrCreateGroupChatId(groupName, adminName);

    // 🔥 修正：使用 generateGroupChatHeader 函數生成群聊標頭
    const chatMetaMessage = window.generateGroupChatHeader(groupName, adminName, members.join(','));
    
    // 🔥 使用簡化格式
    const systemTimeCommand = `\n[SYSTEM|${finalDate} ${finalTime}]`;
    const systemCreateMessage = `\n[SYSTEM|群組「${groupName}」已創建！]`;
    const fullMessage = `<${groupId}>\n${chatMetaMessage}${systemTimeCommand}${systemCreateMessage}\n</${groupId}>`;
    
    if (CONFIG.DEBUG_MODE) console.log('[聊天面板] 準備發送的消息:', fullMessage);
    
    try {
        // 🆕 檢查是否選擇保存為預設聊天室
        const saveAsPreset = document.getElementById('saveAsPresetCheckbox')?.checked || false;
        
        if (saveAsPreset) {
            const presetChatConfig = {
                id: groupId,
                type: 'group',
                name: groupName,
                admin: adminName,
                groupAvatar: window.groupAvatarData || null, // 🆕 保存群組頭像
                adminAvatar: window.adminAvatarData || null, // 🆕 保存群組創建者頭像
                members: members,
                description: `用戶創建的群組: ${groupName}`
            };
            
            // 🆕 添加調試信息
            console.log('[群組創建] 預設聊天配置:', presetChatConfig);
            console.log('[群組創建] 群組頭像數據:', window.groupAvatarData ? '存在' : '不存在');
            if (window.groupAvatarData) {
                console.log('[群組創建] 群組頭像數據長度:', window.groupAvatarData.length);
            }
            
            // 🆕 清理舊的臨時群組數據
            if (window.groupMemberManager) {
                try {
                    const cleanedCount = await window.groupMemberManager.cleanupTempGroupMembers();
                    console.log(`[群組創建] 已清理 ${cleanedCount} 個臨時群組成員`);
                } catch (error) {
                    console.warn('[群組創建] 清理臨時群組成員失敗:', error);
                }
            }
            
            // 🆕 保存群組創建者頭像到IndexedDB
            if (window.adminAvatarData && window.groupMemberManager) {
                try {
                    await window.groupMemberManager.addMember(
                        groupId,
                        adminName,
                        window.adminAvatarData,
                        adminName
                    );
                } catch (error) {
                    console.warn('[群組創建] 保存群組創建者頭像失敗:', error);
                }
            }
            
            // 🆕 保存其他群組成員到IndexedDB
            if (window.groupMemberManager && currentGroupMembers.length > 0) {
                try {
                    for (const member of currentGroupMembers) {
                        // 🆕 使用實際的群組ID，而不是臨時的ID
                        await window.groupMemberManager.addMember(
                            groupId,
                            member.name,
                            member.avatar,
                            member.displayName
                        );
                    }
                    console.log(`[群組創建] 已保存 ${currentGroupMembers.length} 個成員到 IndexedDB`);
                } catch (error) {
                    console.warn('[群組創建] 保存群組成員失敗:', error);
                }
            }
            
            console.log('[群組創建] 準備保存到 PresetChatManager:', {
                groupId,
                groupName,
                hasGroupAvatar: !!presetChatConfig.groupAvatar,
                groupAvatarLength: presetChatConfig.groupAvatar ? presetChatConfig.groupAvatar.length : 0
            });
            
            const success = await PresetChatManager.addPresetChat(presetChatConfig);
            
            if (success) {
                // 🔥 驗證群組頭像是否正確保存
                const userPresets = JSON.parse(localStorage.getItem('user_preset_chats') || '[]');
                const savedGroup = userPresets.find(p => p.id === groupId);
                console.log('[群組創建] 保存後驗證:', {
                    foundInUserPresets: !!savedGroup,
                    hasGroupAvatar: savedGroup ? !!savedGroup.groupAvatar : false,
                    groupAvatarLength: savedGroup && savedGroup.groupAvatar ? savedGroup.groupAvatar.length : 0
                });
                
                Logger.success(`✅ 群組 "${groupName}" 已保存為預設聊天室`);
                
                // 🆕 設置新創建聊天的ID，確保類型正確設置
                newlyCreatedChatId = groupId;
                
                // 🔥 重要：立即更新 UI
                updateChatListView();
                
                // 🆕 自動觸發重新載入，確保預設聊天室顯示
                setTimeout(() => {
                    if (window.parent) {
                        window.parent.postMessage({ 
                            type: 'REQUEST_EVENT_BUTTON_REREGISTRATION',
                            timestamp: Date.now()
                        }, '*');
                    }
                }, 300);
                
                closeAddGroupModal();
                showSuccessToast(`群組 "${groupName}" 已創建並保存為預設！`);
            } else {
                // 🔥 新增：如果失敗，給用戶提示
                alert('創建預設群組失敗，可能已存在同名聊天室');
                return;
            }
        } else {
            // 🆕 即使不保存為預設，也要保存群組信息到本地，以便使用群聊設置功能
            const tempGroupConfig = {
                id: groupId,
                type: 'group',
                name: groupName,
                admin: adminName,
                groupAvatar: window.groupAvatarData || null, // 🆕 保存群組頭像
                adminAvatar: window.adminAvatarData || null,
                members: members,
                description: `臨時群組: ${groupName}`,
                isTemporary: true // 🆕 標記為臨時群組
            };
            
            console.log('[群組創建] 臨時群組配置:', tempGroupConfig);
            
            // 🆕 保存群組創建者頭像到IndexedDB
            if (window.adminAvatarData && window.groupMemberManager) {
                try {
                    await window.groupMemberManager.addMember(
                        groupId,
                        adminName,
                        window.adminAvatarData,
                        adminName
                    );
                } catch (error) {
                    console.warn('[群組創建] 保存群組創建者頭像失敗:', error);
                }
            }
            
            // 🆕 保存其他群組成員到IndexedDB
            if (window.groupMemberManager && currentGroupMembers.length > 0) {
                try {
                    for (const member of currentGroupMembers) {
                        await window.groupMemberManager.addMember(
                            groupId,
                            member.name,
                            member.avatar,
                            member.displayName
                        );
                    }
                    console.log(`[群組創建] 已保存 ${currentGroupMembers.length} 個成員到 IndexedDB`);
                } catch (error) {
                    console.warn('[群組創建] 保存群組成員失敗:', error);
                }
            }
            
            // 🆕 保存到臨時群組列表（不保存到 PresetChatManager）
            if (!window.temporaryGroups) {
                window.temporaryGroups = [];
            }
            window.temporaryGroups.push(tempGroupConfig);
            
            // 🆕 設置新創建聊天的ID
            newlyCreatedChatId = groupId;
            
            // 🔥 立即更新 UI
            updateChatListView();
            
            // 發送到酒館AI
            const tavernMainWindow = findTavernMainWindow();
            if (!tavernMainWindow) {
                throw new Error('找不到酒館AI主環境');
            }
            
            const stInput = tavernMainWindow.document.querySelector('#send_textarea');
            const sendButton = tavernMainWindow.document.querySelector('#send_but');
            
            if (!stInput || !sendButton) {
                throw new Error('找不到發送介面元素');
            }
            
            stInput.value = fullMessage;
            stInput.dispatchEvent(new Event('input', { bubbles: true }));
            
            setTimeout(() => {
                sendButton.click();
                if (CONFIG.DEBUG_MODE) console.log('[聊天面板] ✅ 群組創建消息已發送');
                closeAddGroupModal();
                showSuccessToast(`群組 "${groupName}" 已創建！（臨時群組）`);
                setTimeout(() => {
                    triggerManualUpdate();
                    // 🆕 自動觸發重新載入
                    setTimeout(() => {
                        if (window.parent) {
                            window.parent.postMessage({ 
                                type: 'REQUEST_EVENT_BUTTON_REREGISTRATION',
                                timestamp: Date.now()
                            }, '*');
                        }
                    }, 500);
                }, 1000);
            }, 100);
        }
        
        clearTimeout(userSendingDebounceTimer);
        userSendingDebounceTimer = setTimeout(() => {
            isUserSendingMessage = false;
        }, 5000);
        
    } catch (error) {
        console.error('[聊天面板] ❌ 群組創建失敗:', error);
        alert(`群組創建失敗: ${error.message}`);
        isUserSendingMessage = false;
    }
}

/**
 * 創建新的私訊聊天
 */
async function createNewPrivateChat() {
    const yourName = document.getElementById('yourNameInput').value.trim();
    const otherPersonName = document.getElementById('otherPersonNameInput').value.trim();
    const saveAsPreset = document.getElementById('savePrivateAsPresetCheckbox')?.checked || false;
    
    const customDate = document.getElementById('privateChatDateInput').value;
    const customTime = document.getElementById('privateChatTimeInput').value;
    
    if (!yourName || !otherPersonName) {
        alert('請填寫你的名稱和對方名稱！');
        return;
    }

    if (CONFIG.DEBUG_MODE) console.log('[聊天面板] 💬 開始創建私訊...');

    const finalDate = (customDate && customTime) ? customDate : new Date().toISOString().slice(0, 10);
    const finalTime = (customDate && customTime) ? customTime : (() => {
        const d = new Date();
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    })();

    isUserSendingMessage = true; // 防止面板重置

    // 🔥 使用新的私聊ID映射函數
    const chatId = getOrCreatePrivateChatId(yourName, otherPersonName);

    // 格式: 你的名稱⇆對方名稱
    const participantsInfo = `${yourName}⇆${otherPersonName}`;
    // 聊天標題直接用對方名稱
    const chatName = otherPersonName;

    // 構建私訊(dm)的標頭
            const chatMetaMessage = `[Chat|${chatId}|${chatName}|${participantsInfo}]`;
    
    // 構建系統訊息
    const systemTimeCommand = `\n[SYSTEM|${finalDate} ${finalTime}]`;
    const systemCreateMessage = `\n[SYSTEM|與「${otherPersonName}」的私訊已建立！]`;
    
    // 組合成最終要發送的完整訊息
    const fullMessage = `<${chatId}>\n${chatMetaMessage}${systemTimeCommand}${systemCreateMessage}\n</${chatId}>`;
    
    if (CONFIG.DEBUG_MODE) console.log('[聊天面板] 準備發送的私訊創建消息:', fullMessage);
    
    try {
        // 🆕 如果選擇保存為預設聊天室，直接創建預設聊天室
        if (saveAsPreset) {
            const presetChatConfig = {
                id: chatId,
                type: 'dm',
                name: chatName,
                participant1: yourName,
                participant2: otherPersonName,
                userAvatar: window.userAvatarData || null, // 🆕 保存用戶頭像
                characterAvatar: window.characterAvatarData || null, // 🆕 保存角色頭像
                description: `用戶創建的私訊: ${yourName} ⇆ ${otherPersonName}`
            };
            
            // 🆕 保存頭像到IndexedDB
            if (window.privateChatManager) {
                try {
                    // 保存用戶頭像
                    if (window.userAvatarData) {
                        await window.privateChatManager.addParticipant(
                            chatId,
                            yourName,
                            window.userAvatarData,
                            'user',
                            yourName
                        );
                    }
                    
                    // 保存角色頭像
                    if (window.characterAvatarData) {
                        await window.privateChatManager.addParticipant(
                            chatId,
                            otherPersonName,
                            window.characterAvatarData,
                            'character',
                            otherPersonName
                        );
                    }
                    
                    console.log('[私訊創建] 已保存頭像到 IndexedDB');
                } catch (error) {
                    console.warn('[私訊創建] 保存頭像失敗:', error);
                }
            }
            
            const success = await PresetChatManager.addPresetChat(presetChatConfig);
            
            // 🔥 新增：立即更新聊天列表中的頭像信息
            if (success && window.privateChatManager) {
                try {
                    // 獲取角色頭像並更新聊天對象
                    const characterParticipant = await window.privateChatManager.getParticipant(otherPersonName, chatId, 'character');
                    if (characterParticipant && characterParticipant.avatar) {
                        // 更新聊天對象的頭像信息
                        presetChatConfig.characterAvatar = characterParticipant.avatar;
                        console.log('[私訊創建] 已更新聊天對象頭像信息');
                    }
                } catch (error) {
                    console.warn('[私訊創建] 更新聊天對象頭像失敗:', error);
                }
            }
            
            if (success) {
                Logger.success(`✅ 私訊 "${chatName}" 已保存為預設聊天室`);
                
                // 🔥 重要：立即更新 UI
                updateChatListView();
                
                // 🆕 自動觸發重新載入，確保預設聊天室顯示
                setTimeout(() => {
                    if (window.parent) {
                        window.parent.postMessage({ 
                            type: 'REQUEST_EVENT_BUTTON_REREGISTRATION',
                            timestamp: Date.now()
                        }, '*');
                    }
                }, 300);
                
                closeAddPrivateChatModal();
                showSuccessToast(`與 "${chatName}" 的私訊已創建並保存為預設！`);
            } else {
                // 🔥 新增：如果失敗，給用戶提示
                alert('創建預設私訊失敗，可能已存在同名聊天室');
                return;
            }
        } else {
            // 🆕 即使不保存為預設，也要保存私訊信息到本地，以便使用私訊設置功能
            const tempPrivateChatConfig = {
                id: chatId,
                type: 'dm',
                name: chatName,
                participant1: yourName,
                participant2: otherPersonName,
                userAvatar: window.userAvatarData || null,
                characterAvatar: window.characterAvatarData || null,
                description: `臨時私訊: ${yourName} ⇆ ${otherPersonName}`,
                isTemporary: true // 🆕 標記為臨時私訊
            };
            
            console.log('[私訊創建] 臨時私訊配置:', tempPrivateChatConfig);
            
            // 🆕 保存頭像到IndexedDB
            if (window.privateChatManager) {
                try {
                    // 保存用戶頭像
                    if (window.userAvatarData) {
                        await window.privateChatManager.addParticipant(
                            chatId,
                            yourName,
                            window.userAvatarData,
                            'user',
                            yourName
                        );
                    }
                    
                    // 保存角色頭像
                    if (window.characterAvatarData) {
                        await window.privateChatManager.addParticipant(
                            chatId,
                            otherPersonName,
                            window.characterAvatarData,
                            'character',
                            otherPersonName
                        );
                    }
                    
                    console.log('[私訊創建] 已保存頭像到 IndexedDB');
                } catch (error) {
                    console.warn('[私訊創建] 保存頭像失敗:', error);
                }
            }
            
            // 🆕 保存到臨時私訊列表（不保存到 PresetChatManager）
            if (!window.temporaryPrivateChats) {
                window.temporaryPrivateChats = [];
            }
            window.temporaryPrivateChats.push(tempPrivateChatConfig);
            
            // 🆕 設置新創建聊天的ID
            newlyCreatedChatId = chatId;
            
            // 🔥 立即更新 UI
            updateChatListView();
            
            // 發送到酒館AI
            const tavernMainWindow = findTavernMainWindow();
            if (!tavernMainWindow) {
                throw new Error('找不到酒館AI主環境');
            }
            
            const stInput = tavernMainWindow.document.querySelector('#send_textarea');
            const sendButton = tavernMainWindow.document.querySelector('#send_but');
            
            if (!stInput || !sendButton) {
                throw new Error('找不到發送介面元素');
            }
            
            stInput.value = fullMessage;
            stInput.dispatchEvent(new Event('input', { bubbles: true }));
            
            setTimeout(() => {
                sendButton.click();
                if (CONFIG.DEBUG_MODE) console.log('[聊天面板] ✅ 私訊創建消息已發送');
                closeAddPrivateChatModal();
                showSuccessToast(`與 "${chatName}" 的私訊已創建！（臨時私訊）`);
                setTimeout(() => {
                    triggerManualUpdate();
                    // 🆕 自動觸發重新載入
                    setTimeout(() => {
                        if (window.parent) {
                            window.parent.postMessage({ 
                                type: 'REQUEST_EVENT_BUTTON_REREGISTRATION',
                                timestamp: Date.now()
                            }, '*');
                        }
                    }, 500);
                }, 1000);
            }, 100);
        }

    } catch (error) {
        console.error('[聊天面板] ❌ 私訊創建失敗:', error);
        alert(`私訊創建失敗: ${error.message}`);
    } finally {
        setTimeout(() => { isUserSendingMessage = false; }, 5000);
    }
}

/**
 * 創建新的劇情聊天室
 */
async function createNewStoryChat() {
    const storyName = document.getElementById('storyNameInput').value.trim();
    const storyDescription = document.getElementById('storyDescriptionInput').value.trim();
    const saveAsPreset = document.getElementById('saveStoryAsPresetCheckbox')?.checked || false;
    const customDate = document.getElementById('storyChatDateInput').value;
    const customTime = document.getElementById('storyChatTimeInput').value;

    if (!storyName) {
        alert('請填寫劇情標題！');
        return;
    }

    if (CONFIG.DEBUG_MODE) console.log('[聊天面板] 📖 開始創建劇情聊天室...');

    const finalDate = (customDate && customTime) ? customDate : new Date().toISOString().slice(0, 10);
    const finalTime = (customDate && customTime) ? customTime : (() => {
        const d = new Date();
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    })();

    isUserSendingMessage = true; // 防止面板重置

    // 🔥 修正：生成唯一的劇情聊天室ID
    const chatId = generateShortId('story_list');

    // 只用POV角色名作為聊天室名稱（這裡暫用輸入框內容，後續可擴展選擇POV角色）
    const povName = storyName; // 目前用劇情標題欄作為POV角色名，後續可擴展
    const storyTitle = storyName; // 保留劇情標題

    // 構建劇情聊天室的標頭（只用POV角色名）
    // 🔥 新格式：構建聊天室元數據訊息
    const chatMetaMessage = `[Chat|${chatId}|${povName}]`;
    
    // 🔥 新格式：構建系統訊息
    const systemTimeCommand = `\n[SYSTEM|${finalDate} ${finalTime}]`;
    const systemCreateMessage = `\n[SYSTEM|劇情聊天室「${storyTitle}」已建立！]`;
    
    // 🔥 新格式：如果有劇情描述，添加初始場景
    const initialScene = storyDescription ? 
        `\n[1|${chatId}|${storyTitle}|[scene: ${storyDescription}]|${finalTime}]` : '';
    
    // 🔥 新格式：組合成最終要發送的完整訊息（不再使用block標籤）
    const fullMessage = `${chatMetaMessage}${systemTimeCommand}${systemCreateMessage}${initialScene}`;
    
    if (CONFIG.DEBUG_MODE) console.log('[聊天面板] 準備發送的劇情聊天室創建消息:', fullMessage);
    
    try {
        // 🆕 如果選擇保存為預設聊天室，直接創建預設聊天室
        if (saveAsPreset) {
            const presetChatConfig = {
                id: chatId,
                type: 'story',
                name: storyTitle,
                narrator: povName,
                description: `用戶創建的劇情聊天室: ${storyTitle}`
            };
            
            const success = await PresetChatManager.addPresetChat(presetChatConfig);
            
            if (success) {
                Logger.success(`✅ 劇情聊天室 "${storyTitle}" 已保存為預設聊天室`);
                
                // 🔥 重要：立即更新 UI
                updateChatListView();
                
                // 🆕 自動觸發重新載入，確保預設聊天室顯示
                setTimeout(() => {
                    if (window.parent) {
                        window.parent.postMessage({ 
                            type: 'REQUEST_EVENT_BUTTON_REREGISTRATION',
                            timestamp: Date.now()
                        }, '*');
                    }
                }, 300);
                
                closeAddStoryChatModal();
                showSuccessToast(`劇情聊天室 "${storyName}" 已創建並保存為預設！`);
            } else {
                // 🔥 新增：如果失敗，給用戶提示
                alert('創建預設劇情聊天室失敗，可能已存在同名聊天室');
                return;
            }
        } else {
            // 如果不保存為預設，則發送到酒館AI
            const tavernMainWindow = findTavernMainWindow();
            if (!tavernMainWindow) {
                throw new Error('找不到酒館AI主環境');
            }
            
            const stInput = tavernMainWindow.document.querySelector('#send_textarea');
            const sendButton = tavernMainWindow.document.querySelector('#send_but');
            
            if (!stInput || !sendButton) {
                throw new Error('找不到發送介面元素');
            }
            
            stInput.value = fullMessage;
            stInput.dispatchEvent(new Event('input', { bubbles: true }));
            
            setTimeout(() => {
                sendButton.click();
                if (CONFIG.DEBUG_MODE) console.log('[聊天面板] ✅ 劇情聊天室創建消息已發送');
                closeAddStoryChatModal();
                showSuccessToast(`劇情聊天室 "${storyName}" 已創建！`);
                setTimeout(() => {
                    triggerManualUpdate(); // 觸發處理器更新
                    // 🆕 自動觸發重新載入，確保預設聊天室顯示
                    setTimeout(() => {
                        if (window.parent) {
                            window.parent.postMessage({ 
                                type: 'REQUEST_EVENT_BUTTON_REREGISTRATION',
                                timestamp: Date.now()
                            }, '*');
                        }
                    }, 500);
                }, 1000);
            }, 100);
        }

    } catch (error) {
        console.error('[聊天面板] ❌ 劇情聊天室創建失敗:', error);
        alert(`劇情聊天室創建失敗: ${error.message}`);
    } finally {
        setTimeout(() => { isUserSendingMessage = false; }, 5000);
    }
}

// 將新函數設為全域可用
window.showAddGroupMenu = showAddGroupMenu;
window.openAddGroupModal = openAddGroupModal;
window.closeAddGroupModal = closeAddGroupModal;
window.createNewGroup = createNewGroup;
window.setupGroupAvatarUpload = setupGroupAvatarUpload;
window.openAddPrivateChatModal = openAddPrivateChatModal;
window.closeAddPrivateChatModal = closeAddPrivateChatModal;
window.createNewPrivateChat = createNewPrivateChat;

/**
 * 🔥 新增：獲取私聊ID的函數
 * @param {string} participant1 - 參與者1
 * @param {string} participant2 - 參與者2
 * @returns {string|null} 私聊ID，如果不存在則返回null
 */
function getPrivateChatId(participant1, participant2) {
    if (!window.privateChatIdMap) return null;
    
    const key1 = `${participant1}⇆${participant2}`;
    const key2 = `${participant2}⇆${participant1}`;
    
    return window.privateChatIdMap[key1] || window.privateChatIdMap[key2] || null;
}

/**
 * 🔥 新增：創建或獲取私聊ID的函數
 * @param {string} participant1 - 參與者1
 * @param {string} participant2 - 參與者2
 * @returns {string} 私聊ID
 */
function getOrCreatePrivateChatId(participant1, participant2) {
    const existingId = getPrivateChatId(participant1, participant2);
    if (existingId) {
        console.log(`[私聊ID映射] 使用現有ID: ${participant1}⇆${participant2} → ${existingId}`);
        return existingId;
    }
    
    // 如果不存在，創建新的ID
    const newId = generateShortId('dm');
    if (!window.privateChatIdMap) window.privateChatIdMap = {};
    
    // 🔥 修正：同時保存兩個方向的鍵值，確保一致性
    const key1 = `${participant1}⇆${participant2}`;
    const key2 = `${participant2}⇆${participant1}`;
    window.privateChatIdMap[key1] = newId;
    window.privateChatIdMap[key2] = newId;
    
    // 🔥 立即保存到 localStorage
    try {
        localStorage.setItem('privateChatIdMap', JSON.stringify(window.privateChatIdMap));
        console.log('[私聊ID映射] 已保存映射到 localStorage:', Object.keys(window.privateChatIdMap).length, '個映射');
    } catch (error) {
        console.warn('[私聊ID映射] 保存映射失敗:', error);
    }
    
    console.log(`[私聊ID映射] 創建新ID: ${participant1}⇆${participant2} → ${newId}`);
    return newId;
}

// 暴露到全局
window.getPrivateChatId = getPrivateChatId;
window.getOrCreatePrivateChatId = getOrCreatePrivateChatId;

/**
 * 🔥 新增：獲取群聊ID的函數
 * @param {string} groupName - 群組名稱
 * @param {string} adminName - 群組創建者名稱
 * @returns {string|null} 群聊ID，如果不存在則返回null
 */
function getGroupChatId(groupName, adminName) {
    if (!window.groupChatIdMap) return null;
    
    const key = `${groupName}⇆${adminName}`;
    return window.groupChatIdMap[key] || null;
}

/**
 * 🔥 新增：創建或獲取群聊ID的函數（持久化版本）
 * @param {string} groupName - 群組名稱
 * @param {string} adminName - 群組創建者名稱
 * @returns {string} 群聊ID
 */
function getOrCreateGroupChatId(groupName, adminName) {
    const existingId = getGroupChatId(groupName, adminName);
    if (existingId) {
        console.log(`[群聊ID映射] 使用現有ID: ${groupName}⇆${adminName} → ${existingId}`);
        return existingId;
    }
    
    // 如果不存在，創建新的ID
    const newId = generateShortId('group');
    if (!window.groupChatIdMap) window.groupChatIdMap = {};
    window.groupChatIdMap[`${groupName}⇆${adminName}`] = newId;
    
    // 🔥 立即保存到 localStorage
    try {
        localStorage.setItem('groupChatIdMap', JSON.stringify(window.groupChatIdMap));
        console.log('[群聊ID映射] 已保存映射到 localStorage:', Object.keys(window.groupChatIdMap).length, '個映射');
    } catch (error) {
        console.warn('[群聊ID映射] 保存映射失敗:', error);
    }
    
    console.log(`[群聊ID映射] 創建新ID: ${groupName}⇆${adminName} → ${newId}`);
    return newId;
}

/**
 * 🔥 新增：生成群聊標頭的函數
 * @param {string} groupName - 群組名稱
 * @param {string} adminName - 群組創建者名稱
 * @param {string} members - 群組成員（可選）
 * @returns {string} 群聊標頭格式
 */
function generateGroupChatHeader(groupName, adminName, members = '') {
    // 🔥 修改：優先使用現有的群聊ID，避免創建新的聊天室
    console.log('[群聊標頭] 開始生成標頭:', `${groupName}⇆${adminName}`);
    console.log('[群聊標頭] 當前映射表:', window.groupChatIdMap);
    
    let chatId = getGroupChatId(groupName, adminName);
    
    if (!chatId) {
        // 如果沒有現有的ID，才創建新的
        chatId = getOrCreateGroupChatId(groupName, adminName);
        console.log('[群聊標頭] 創建新ID:', `${groupName}⇆${adminName} → ${chatId}`);
    } else {
        console.log('[群聊標頭] 使用現有ID:', `${groupName}⇆${adminName} → ${chatId}`);
    }
    
    const header = `[Chat|${chatId}|${groupName}|${adminName}|${members}]`;
    console.log('[群聊標頭] 生成的標頭:', header);
    
    return header;
}

/**
 * 🔥 新增：生成私聊標頭的函數
 * @param {string} participant1 - 參與者1
 * @param {string} participant2 - 參與者2
 * @returns {string} 私聊標頭格式
 */
function generatePrivateChatHeader(participant1, participant2) {
    // 🔥 修改：優先使用現有的私聊ID，避免創建新的聊天室
    console.log('[私聊標頭] 開始生成標頭:', `${participant1}⇆${participant2}`);
    console.log('[私聊標頭] 當前映射表:', window.privateChatIdMap);
    
    let chatId = getPrivateChatId(participant1, participant2);
    
    if (!chatId) {
        // 如果沒有現有的ID，才創建新的
        chatId = getOrCreatePrivateChatId(participant1, participant2);
        console.log('[私聊標頭] 創建新ID:', `${participant1}⇆${participant2} → ${chatId}`);
    } else {
        console.log('[私聊標頭] 使用現有ID:', `${participant1}⇆${participant2} → ${chatId}`);
    }
    
    const participantsInfo = `${participant1}⇆${participant2}`;
    const chatName = participant2; // 使用對方名稱作為聊天標題
    
    const header = `[Chat|${chatId}|${chatName}|${participantsInfo}]`;
    console.log('[私聊標頭] 生成的標頭:', header);
    
    return header;
}

// 🔥 新增：調試函數，檢查私聊ID映射狀態
window.debugPrivateChatMapping = function() {
    console.log('[調試] 私聊ID映射狀態:', {
        privateChatIdMap: window.privateChatIdMap,
        privateChatManager: !!window.privateChatManager,
        chatData: chatData?.chatList?.filter(c => c.type === 'dm')
    });
    
    // 🔥 新增：詳細檢查私聊ID映射的鍵值
    if (window.privateChatIdMap) {
        console.log('[調試] 私聊ID映射詳細信息:');
        Object.keys(window.privateChatIdMap).forEach(key => {
            console.log(`  ${key} → ${window.privateChatIdMap[key]}`);
        });
    }
};

// 🔥 新增：調試函數，檢查群聊ID映射狀態
window.debugGroupChatMapping = function() {
    console.log('[調試] 群聊ID映射狀態:', {
        groupChatIdMap: window.groupChatIdMap,
        groupMemberManager: !!window.groupMemberManager,
        chatData: chatData?.chatList?.filter(c => c.type === 'group')
    });
};

// 🔥 新增：初始化私聊ID映射（從 localStorage 恢復）
function initializePrivateChatIdMap() {
    try {
        const savedMap = localStorage.getItem('privateChatIdMap');
        if (savedMap) {
            window.privateChatIdMap = JSON.parse(savedMap);
            console.log('[私聊ID映射] 已從 localStorage 恢復映射:', Object.keys(window.privateChatIdMap).length, '個映射');
        } else {
            window.privateChatIdMap = {};
            console.log('[私聊ID映射] 初始化新的映射表');
        }
    } catch (error) {
        console.warn('[私聊ID映射] 恢復映射失敗:', error);
        window.privateChatIdMap = {};
    }
}

// 🔥 新增：初始化群聊ID映射（從 localStorage 恢復）
function initializeGroupChatIdMap() {
    try {
        const savedMap = localStorage.getItem('groupChatIdMap');
        if (savedMap) {
            window.groupChatIdMap = JSON.parse(savedMap);
            console.log('[群聊ID映射] 已從 localStorage 恢復映射:', Object.keys(window.groupChatIdMap).length, '個映射');
        } else {
            window.groupChatIdMap = {};
            console.log('[群聊ID映射] 初始化新的映射表');
        }
    } catch (error) {
        console.warn('[群聊ID映射] 恢復映射失敗:', error);
        window.groupChatIdMap = {};
    }
}

// 🔥 頁面加載時初始化ID映射
initializePrivateChatIdMap();
initializeGroupChatIdMap();

// 🔥 新增：頁面加載時清理過期ID映射
if (typeof window.cleanupExpiredChatIdMappings === 'function') {
    window.cleanupExpiredChatIdMappings();
    console.log('[初始化] 已清理過期ID映射');
}

// 🔥 新增：重建私聊ID映射的函數（解決不一致問題）
window.rebuildPrivateChatIdMappings = function() {
    try {
        console.log('[重建] 開始重建私聊ID映射...');
        
        if (!chatData || !chatData.chatList) {
            console.log('[重建] 沒有聊天數據，跳過重建');
            return;
        }
        
        const privateChats = chatData.chatList.filter(c => c.type === 'dm');
        console.log('[重建] 找到私聊數量:', privateChats.length);
        
        // 清理現有的私聊ID映射
        window.privateChatIdMap = {};
        
        // 重新建立私聊ID映射
        privateChats.forEach(chat => {
            if (chat.participant1 && chat.participant2) {
                const key1 = `${chat.participant1}⇆${chat.participant2}`;
                const key2 = `${chat.participant2}⇆${chat.participant1}`;
                
                window.privateChatIdMap[key1] = chat.id;
                window.privateChatIdMap[key2] = chat.id;
                
                console.log(`[重建] 重建映射: ${key1} → ${chat.id}`);
                console.log(`[重建] 重建映射: ${key2} → ${chat.id}`);
            }
        });
        
        // 保存到 localStorage
        localStorage.setItem('privateChatIdMap', JSON.stringify(window.privateChatIdMap));
        console.log('[重建] 私聊ID映射重建完成，已保存到 localStorage');
        
    } catch (error) {
        console.warn('[重建] 重建私聊ID映射失敗:', error);
    }
};

// 🔥 新增：清理過期ID映射的函數
window.cleanupExpiredChatIdMappings = function() {
    try {
        // 清理私聊ID映射
        if (window.privateChatIdMap) {
            const privateChatIds = new Set();
            if (chatData && chatData.chatList) {
                chatData.chatList.forEach(chat => {
                    if (chat.type === 'dm') {
                        privateChatIds.add(chat.id);
                    }
                });
            }
            
            const originalPrivateCount = Object.keys(window.privateChatIdMap).length;
            Object.keys(window.privateChatIdMap).forEach(key => {
                const chatId = window.privateChatIdMap[key];
                if (!privateChatIds.has(chatId)) {
                    delete window.privateChatIdMap[key];
                }
            });
            
            if (originalPrivateCount !== Object.keys(window.privateChatIdMap).length) {
                localStorage.setItem('privateChatIdMap', JSON.stringify(window.privateChatIdMap));
                console.log('[清理] 已清理過期私聊ID映射');
            }
        }
        
        // 清理群聊ID映射
        if (window.groupChatIdMap) {
            const groupChatIds = new Set();
            if (chatData && chatData.chatList) {
                chatData.chatList.forEach(chat => {
                    if (chat.type === 'group') {
                        groupChatIds.add(chat.id);
                    }
                });
            }
            
            const originalGroupCount = Object.keys(window.groupChatIdMap).length;
            Object.keys(window.groupChatIdMap).forEach(key => {
                const chatId = window.groupChatIdMap[key];
                if (!groupChatIds.has(chatId)) {
                    delete window.groupChatIdMap[key];
                }
            });
            
            if (originalGroupCount !== Object.keys(window.groupChatIdMap).length) {
                localStorage.setItem('groupChatIdMap', JSON.stringify(window.groupChatIdMap));
                console.log('[清理] 已清理過期群聊ID映射');
            }
        }
        
        console.log('[清理] ID映射清理完成');
    } catch (error) {
        console.warn('[清理] 清理ID映射失敗:', error);
    }
};

// 暴露到全局
window.generatePrivateChatHeader = generatePrivateChatHeader;
window.generateGroupChatHeader = generateGroupChatHeader;
window.getGroupChatId = getGroupChatId;
window.getOrCreateGroupChatId = getOrCreateGroupChatId;
window.setupPrivateChatAvatarUploads = setupPrivateChatAvatarUploads;
window.openAddStoryChatModal = openAddStoryChatModal;
window.closeAddStoryChatModal = closeAddStoryChatModal;
window.createNewStoryChat = createNewStoryChat;

// 🔥 新增：手動清理ID映射的函數（供調試使用）
window.manualCleanupIdMappings = function() {
    console.log('[手動清理] 開始清理ID映射...');
    
    if (typeof window.cleanupExpiredChatIdMappings === 'function') {
        window.cleanupExpiredChatIdMappings();
        console.log('[手動清理] ID映射清理完成');
        alert('ID映射清理完成！');
    } else {
        console.error('[手動清理] cleanupExpiredChatIdMappings 函數不存在');
        alert('清理函數不存在！');
    }
};

// =======================================================================
//                       🔥 测试和辅助功能
// =======================================================================

/**
 * 🔥 新增：測試未讀功能
 * 用於調試和驗證未讀功能是否正常工作
 */
function testUnreadFeature() {
    console.log('[測試] 開始測試未讀功能...');
    
    // 測試初始化未讀狀態
    const testChatId = 'test_chat_1';
    initChatUnreadState(testChatId);
    console.log('[測試] 初始化未讀狀態:', chatUnreadState[testChatId]);
    
    // 測試更新未讀數量
    updateUnreadCount(testChatId, new Date().toISOString());
    console.log('[測試] 更新未讀數量後:', chatUnreadState[testChatId]);
    
    // 測試標記為已讀
    markChatAsRead(testChatId);
    console.log('[測試] 標記為已讀後:', chatUnreadState[testChatId]);
    
    console.log('[測試] 未讀功能測試完成');
}

// 將測試函數暴露到全局，方便在控制台調用
window.testUnreadFeature = testUnreadFeature;

// 🔥 新增：測試選擇提示功能
window.testChoicePrompt = function() {
    const testChoices = [
        { number: '1', text: '有人能借我點錢嗎...手機和錢包都沒了' },
        { number: '2', text: '算了，還是先處理傷口吧...' },
        { number: '3', text: '媽的，越想越氣' }
    ];
    
    console.log('[測試] 顯示選擇提示:', testChoices);
    displayChoicePrompt(testChoices);
};

// 将切换标签功能设为兼容函数（现在不执行任何操作）
function switchTab(tabName) {
    console.log('标签切换已禁用 - 使用统一聊天列表');
}

/**
 * 全局可用的展開/收起函數
 */
window.toggleExpandableContent = function(triggerElement, contentIdBase) {
    const contentElement = document.getElementById(`content-${contentIdBase}`);
    const arrowElement = document.getElementById(`arrow-${contentIdBase}`);
    if (contentElement) contentElement.classList.toggle('expanded');
    if (arrowElement) arrowElement.classList.toggle('expanded');
};

/**
 * 加入會議
 */
window.joinMeeting = function(meetingId) {
    if (CONFIG.DEBUG_MODE) console.log(`[會議功能] 加入會議: ${meetingId}`);
    // 這裡可以整合實際的會議系統
    alert('正在加入會議...\n(此處可整合 Zoom、Teams 等會議平台)');
};

/**
 * 查看會議詳情
 */
window.showMeetingDetails = function(meetingId) {
    if (CONFIG.DEBUG_MODE) console.log(`[會議功能] 查看會議詳情: ${meetingId}`);
    alert('會議詳情:\n• 會議已結束\n• 可查看會議記錄\n• 下載會議錄影');
};

/**
 * 切換參與者列表顯示
 */
window.toggleMeetingParticipants = function(meetingId) {
    const contentElement = document.getElementById(`meeting-content-${meetingId}`);
    const arrowElement = document.getElementById(`meeting-arrow-${meetingId}`);
    
    if (contentElement) {
        contentElement.classList.toggle('expanded');
    }
    if (arrowElement) {
        arrowElement.classList.toggle('expanded');
    }
};

// =======================================================================
// 🆕 信封功能：展開/收起信件
// =======================================================================

/**
 * 切換信封的展開/收起狀態
 */
function toggleLetterOpen(letterId) {
    const letterContainer = document.querySelector(`[data-letter-id="${letterId}"]`);
    const letterContent = document.getElementById(`letter-content-${letterId}`);
    
    if (!letterContainer || !letterContent) {
        console.error(`[信封功能] 找不到信封元素: ${letterId}`);
        return;
    }
    
    const isOpen = letterContent.style.display !== 'none';
    
    if (isOpen) {
        // 收起信封
        letterContent.style.display = 'none';
        letterContainer.classList.remove('letter-opened');
        letterContainer.classList.add('letter-closed');
    } else {
        // 展開信封
        letterContent.style.display = 'block';
        letterContainer.classList.remove('letter-closed');
        letterContainer.classList.add('letter-opened');
        
        // 添加展開動畫效果
        letterContent.style.opacity = '0';
        letterContent.style.transform = 'scale(0.8)';
        
        setTimeout(() => {
            letterContent.style.transition = 'all 0.3s ease';
            letterContent.style.opacity = '1';
            letterContent.style.transform = 'scale(1)';
        }, 10);
    }
    
    console.log(`[信封功能] 信封 ${letterId} ${isOpen ? '收起' : '展開'}`);
}

// 設為全局可用
window.toggleLetterOpen = toggleLetterOpen;

// =======================================================================
// 🔥 IndexedDB 清理工具
// =======================================================================

/**
 * 清理所有 IndexedDB 中的遺留數據
 */
async function cleanupAllIndexedDBData() {
    console.log('[IndexedDB 清理] 開始清理所有遺留數據...');
    
    try {
        // 1. 清理私聊參與者數據
        if (window.privateChatManager) {
            console.log('[IndexedDB 清理] 清理私聊參與者數據...');
            
            // 獲取所有私聊參與者
            const allParticipants = await getAllPrivateChatParticipants();
            console.log('[IndexedDB 清理] 找到私聊參與者:', allParticipants.length);
            
            // 檢查哪些聊天室已經不存在
            const existingChatIds = new Set();
            if (chatData && chatData.chatList) {
                chatData.chatList.forEach(chat => {
                    if (chat.type === 'dm') {
                        existingChatIds.add(chat.id);
                    }
                });
            }
            
            // 刪除不存在聊天室的參與者數據
            let deletedCount = 0;
            for (const participant of allParticipants) {
                if (!existingChatIds.has(participant.chatId)) {
                    await window.privateChatManager.deleteParticipant(
                        participant.name, 
                        participant.chatId, 
                        participant.role
                    );
                    deletedCount++;
                    console.log(`[IndexedDB 清理] 已刪除遺留參與者: ${participant.name} (${participant.chatId})`);
                }
            }
            
            console.log(`[IndexedDB 清理] 私聊參與者清理完成，刪除 ${deletedCount} 個遺留數據`);
        }
        
        // 2. 清理群組成員數據
        if (window.groupMemberManager) {
            console.log('[IndexedDB 清理] 清理群組成員數據...');
            
            // 獲取所有群組成員
            const allMembers = await window.groupMemberManager.getAllMembers();
            console.log('[IndexedDB 清理] 找到群組成員:', allMembers.length);
            
            // 檢查哪些群組已經不存在
            const existingGroupIds = new Set();
            if (chatData && chatData.chatList) {
                chatData.chatList.forEach(chat => {
                    if (chat.type === 'group') {
                        existingGroupIds.add(chat.id);
                    }
                });
            }
            
            // 刪除不存在群組的成員數據
            let deletedCount = 0;
            for (const member of allMembers) {
                if (!existingGroupIds.has(member.groupId)) {
                    await window.groupMemberManager.removeMember(member.name, member.groupId);
                    deletedCount++;
                    console.log(`[IndexedDB 清理] 已刪除遺留成員: ${member.name} (${member.groupId})`);
                }
            }
            
            console.log(`[IndexedDB 清理] 群組成員清理完成，刪除 ${deletedCount} 個遺留數據`);
        }
        
        // 3. 清理私聊ID映射表中的遺留數據
        if (window.privateChatIdMap) {
            console.log('[IndexedDB 清理] 清理私聊ID映射表...');
            
            const existingChatIds = new Set();
            if (chatData && chatData.chatList) {
                chatData.chatList.forEach(chat => {
                    if (chat.type === 'dm') {
                        existingChatIds.add(chat.id);
                    }
                });
            }
            
            const keysToDelete = [];
            for (const [key, value] of Object.entries(window.privateChatIdMap)) {
                if (!existingChatIds.has(value)) {
                    keysToDelete.push(key);
                }
            }
            
            keysToDelete.forEach(key => {
                delete window.privateChatIdMap[key];
            });
            
            // 保存更新後的映射表
            localStorage.setItem('privateChatIdMap', JSON.stringify(window.privateChatIdMap));
            
            console.log(`[IndexedDB 清理] 私聊ID映射表清理完成，刪除 ${keysToDelete.length} 個遺留映射`);
        }
        
        console.log('[IndexedDB 清理] 所有遺留數據清理完成！');
        
        // 顯示清理結果
        showSuccessToast('IndexedDB 遺留數據清理完成！');
        
    } catch (error) {
        console.error('[IndexedDB 清理] 清理過程中發生錯誤:', error);
        alert('清理 IndexedDB 數據時發生錯誤: ' + error.message);
    }
}

/**
 * 獲取所有私聊參與者（用於清理工具）
 */
async function getAllPrivateChatParticipants() {
    try {
        if (!window.privateChatManager) {
            return [];
        }
        
        await window.privateChatManager.initDB();
        
        return new Promise((resolve, reject) => {
            const transaction = window.privateChatManager.db.transaction(['participants'], 'readonly');
            const store = transaction.objectStore('participants');
            const request = store.getAll();
            
            request.onsuccess = () => {
                resolve(request.result || []);
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        });
        
    } catch (error) {
        console.error('[IndexedDB 清理] 獲取所有私聊參與者失敗:', error);
        return [];
    }
}

/**
 * 顯示 IndexedDB 數據統計
 */
async function showIndexedDBStats() {
    console.log('[IndexedDB 統計] 開始統計數據...');
    
    try {
        let stats = {
            privateParticipants: 0,
            groupMembers: 0,
            privateChatMappings: 0,
            existingChats: 0
        };
        
        // 統計私聊參與者
        if (window.privateChatManager) {
            const participants = await getAllPrivateChatParticipants();
            stats.privateParticipants = participants.length;
        }
        
        // 統計群組成員
        if (window.groupMemberManager) {
            const members = await window.groupMemberManager.getAllMembers();
            stats.groupMembers = members.length;
        }
        
        // 統計私聊ID映射
        if (window.privateChatIdMap) {
            stats.privateChatMappings = Object.keys(window.privateChatIdMap).length;
        }
        
        // 統計現有聊天室
        if (chatData && chatData.chatList) {
            stats.existingChats = chatData.chatList.length;
        }
        
        console.log('[IndexedDB 統計] 數據統計結果:', stats);
        
        // 顯示統計結果
        const message = `IndexedDB 數據統計：
私聊參與者: ${stats.privateParticipants}
群組成員: ${stats.groupMembers}
私聊ID映射: ${stats.privateChatMappings}
現有聊天室: ${stats.existingChats}`;
        
        alert(message);
        
    } catch (error) {
        console.error('[IndexedDB 統計] 統計過程中發生錯誤:', error);
        alert('統計 IndexedDB 數據時發生錯誤: ' + error.message);
    }
}

/**
 * 🔥 獲取私聊設置中的實際用戶名
 */
function getPrivateChatActualUserName(chatId) {
    try {
        // 1. 從 user_preset_chats 中獲取
        const userPresets = JSON.parse(localStorage.getItem('user_preset_chats') || '[]');
        const preset = userPresets.find(p => p.id === chatId);
        if (preset && preset.participant1) {
            console.log('[私聊用戶名] 從 user_preset_chats 獲取:', preset.participant1);
            return preset.participant1;
        }
        
        // 2. 從 window.temporaryPrivateChats 中獲取
        if (window.temporaryPrivateChats) {
            const tempChat = window.temporaryPrivateChats.find(p => p.id === chatId);
            if (tempChat && tempChat.participant1) {
                console.log('[私聊用戶名] 從 temporaryPrivateChats 獲取:', tempChat.participant1);
                return tempChat.participant1;
            }
        }
        
        // 3. 從 chatData.dmChats 中獲取（如果已經被私聊設置更新過）
        if (chatData && chatData.dmChats && chatData.dmChats[chatId]) {
            const dmChat = chatData.dmChats[chatId];
            if (dmChat.participant1 && dmChat.participant1 !== '{{user}}') {
                console.log('[私聊用戶名] 從 chatData.dmChats 獲取:', dmChat.participant1);
                return dmChat.participant1;
            }
        }
        
        console.log('[私聊用戶名] 未找到實際用戶名，使用占位符');
        return null;
        
    } catch (error) {
        console.error('[私聊用戶名] 獲取用戶名失敗:', error);
        return null;
    }
}

// 將清理工具設為全域可用
window.cleanupAllIndexedDBData = cleanupAllIndexedDBData;
window.showIndexedDBStats = showIndexedDBStats;
window.getPrivateChatActualUserName = getPrivateChatActualUserName;