/**
 * Chat Type Listeners - Handles chat-type dialogues in a visual novel.
 *
 * Responsibilities:
 * - Processing chat-type dialogues.
 * - Managing a simple chat modal window.
 * - Parsing and rendering chat messages.
 * MODIFIED: Displays text content alongside stickers.
 * MODIFIED: Updated sticker URLs to use GitHub links.
 */

// ===== 動態獲取Sticker配置 =====
function getStickerBaseUrl() {
    if (window.VNMaterialProcessor?.getStickerSettings) {
        const settings = window.VNMaterialProcessor.getStickerSettings();
        return settings.baseUrl || 'https://nancywang3641.github.io/sound-files/sticker/';
    }
    return 'https://nancywang3641.github.io/sound-files/sticker/';
}

function getDefaultStickerUrl() {
    if (window.VNMaterialProcessor?.getStickerSettings) {
        const settings = window.VNMaterialProcessor.getStickerSettings();
        return settings.defaultUrl || 'https://nancywang3641.github.io/sound-files/sticker/default.jpg';
    }
    return 'https://nancywang3641.github.io/sound-files/sticker/default.jpg';
}

// ===== Global Chat-Related Variables =====
let chatStateMap = {}; // Stores data for all chat windows, keyed by chatId

let currentChatState = { // State of the currently active chat
    activeChatId: null,
    activeChatName: '',
    activeChatType: '', // 'dm' or 'group_chat'
    chatMessages: [],
    isVisible: false,
    currentMessageIndex: 0,
    allMessagesShown: false,
};

let isDisplayingMessage = false; // Lock to prevent concurrent message display
// let windowOpeningLock = false; // REMOVED - Replaced with more targeted locks

// Global variables for smart locking/debouncing
let lastChatAttemptedToOpenId = null;
let lastChatOpenAttemptTimestamp = 0;
// window._closedChatDetails will store { id: string, timestamp: number }

// Add these global variables near the other global variables (if not already present)
let pendingDialogRestore = false; // Potentially related to main dialog, review usage
let originalDialogState = null;   // Stores state of the main VN dialog
let consecutiveChatDetected = false; // For tracking consecutive chats logic
let lastProcessedChatId = null;    // ID of the last chat fully processed

// ===== DOM Element ID Constants =====
const SIMPLE_CHAT_MODAL_ID = 'simple-chat-modal';
const SIMPLE_CHAT_MESSAGES_ID = 'simple-chat-messages';
const SIMPLE_CHAT_MODAL_TITLE_ID = 'simple-chat-modal-title';
const CLOSE_SIMPLE_CHAT_BUTTON_ID = 'close-simple-chat';
const DIALOG_BOX_SELECTOR = '.dialog-box';
const NAME_TAG_SELECTOR = '.name-tag';

// ===== Helper Functions =====

/**
 * Extracts Chat ID and Type from dialogue content.
 */
function extractChatDetailsFromContent(content) {
    const tagConfigs = [
        { type: 'group_chat', regex: /<group_list_([^>]+)>/i, prefix: 'group_list_', name: '<group_list> start tag' },
        { type: 'dm', regex: /<dm_list_([^>]+)>/i, prefix: 'dm_list_', name: '<dm_list> start tag' },
        { type: 'group_chat', regex: /<\/group_list_([^>]+)>/i, prefix: 'group_list_', name: '</group_list> end tag' },
        { type: 'dm', regex: /<\/dm_list_([^>]+)>/i, prefix: 'dm_list_', name: '</dm_list> end tag' },
    ];

    for (const config of tagConfigs) {
        const match = content.match(config.regex);
        if (match && match[1]) {
            // For start tags, the ID is the captured group. For end tags, it confirms the block.
            // We are interested in the ID from the start tag primarily for identification.
            const idPart = match[1];
            const id = `${config.prefix}${idPart}`;
            // console.log(`[VN面板] Extracted ID from ${config.name}: ${id}, Type: ${config.type}`);
            return { id, type: config.type };
        }
    }

    const chatMatch = content.match(/\[Chat\|([^|]+)\|([^|]+)\|([^|]+)\|([^:]+):/);
    if (chatMatch) {
        const chatType = chatMatch[1].trim();
        const chatName = chatMatch[2].trim();
        const admin = chatMatch[3].trim();
        const participants = chatMatch[4].trim();
        // 從 block 標籤中提取 ID，如果沒有則使用默認值
        const blockMatch = content.match(/<(group_list_|dm_list_)([^>]+)>/i);
        if (blockMatch) {
            const id = `${blockMatch[1]}${blockMatch[2]}`;
            return { id, type: chatType, chatName, participants };
        } else {
            // 如果沒有 block 標籤，使用默認 ID
            const defaultId = chatType === 'group' ? 'group_list_1' : 'dm_list_1';
            return { id: defaultId, type: chatType, chatName, participants };
        }
    }
    return null;
}

/**
 * Determines chat type based on content indicators.
 */
function determineChatTypeFromContent(content, defaultType) {
    if (!content) return defaultType;
    if (content.includes('group_chat') || content.includes('group_list')) return 'group_chat';
    if (content.includes('dm|') || content.includes('dm_list')) return 'dm';
    return defaultType;
}

/**
 * Ensures chat ID has the correct prefix for its type.
 */
function ensureChatIdPrefix(chatId, chatType) {
    if (!chatId) return `unknown_${chatType}_${Date.now()}`; // Should not happen if ID logic is robust
    const dmPrefix = 'dm_list_';
    const groupPrefix = 'group_list_';
    const requiredPrefix = chatType === 'dm' ? dmPrefix : groupPrefix;

    if (!chatId.startsWith(requiredPrefix)) {
        const cleanId = chatId.replace(new RegExp(`^(${dmPrefix}|${groupPrefix})`), '');
        return `${requiredPrefix}${cleanId}`;
    }
    return chatId;
}

/**
 * Attempts to find the protagonist's name from various sources.
 */
function getProtagonistName(dialogueContent) {
    const sources = [
        { name: "VNCore narrator.main_perspective", getter: () => {
            try {
                return window.VNCore?.vnData?.narrator?.main_perspective;
            } catch (error) {
                console.warn('[VN面板] 無法訪問VNCore narrator.main_perspective:', error);
                return null;
            }
        }},
        { name: "VNCore currentDialogue (protagonist type)", getter: () => {
            try {
                return (window.VNCore?.vnData?.currentDialogue?.type === 'protagonist' ? window.VNCore.vnData.currentDialogue.name : null);
            } catch (error) {
                console.warn('[VN面板] 無法訪問VNCore currentDialogue:', error);
                return null;
            }
        }},
        { name: "VNCore dialogue history (protagonist type)", getter: () => {
            try {
                return window.VNCore?.vnData?.dialogues?.find(d => d.type === 'protagonist' && d.name)?.name;
            } catch (error) {
                console.warn('[VN面板] 無法訪問VNCore dialogue history:', error);
                return null;
            }
        }},
        { name: "Parent VNCore narrator.main_perspective", getter: () => {
            try {
                return window.parent?.VNCore?.vnData?.narrator?.main_perspective;
            } catch (error) {
                console.warn('[VN面板] 無法訪問Parent VNCore narrator.main_perspective:', error);
                return null;
            }
        }},
        { name: "Content hardcoded names", getter: () => ['林冬', '主角', 'Protagonist'].find(n => dialogueContent?.includes(`| ${n} |`)) },
        { name: "Content [Protagonist|...] tag", getter: () => dialogueContent?.match(/\[Protagonist\|[^|]*\|[^|]*\|[^|]*\|[^|]*\|([^|]+)\|/i)?.[1]?.trim() }
    ];

    for (const source of sources) {
        const name = source.getter();
        if (name) {
            // console.log(`[VN面板] Protagonist identified via ${source.name}: ${name}`);
            return name;
        }
    }
    // console.log(`[VN面板] Protagonist name not identified.`);
    return ''; // Default if not found
}

/**
 * 智能處理混亂的訊息內容格式
 */
function smartProcessMessageContent(message) {
    if (!message.content) return message;
    
    let content = message.content;
    let detectedType = message.type;
    
    // 處理表情符號和特殊符號（如😊等）
    const emojiPattern = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
    
    // 檢查是否有格式標籤在錯誤位置（包含 Image 格式）
    const formatTagPatterns = [
        { type: 'sticker', pattern: /\[sticker:\s*([^\]]+?)\]/gi },
        { type: 'photo', pattern: /\[photo:\s*([^\]]+?)\]/gi },
        { type: 'photo', pattern: /\[image:\s*([^\]]+?)\]/gi }, // 新增：支援 [Image: XXX] 格式
        { type: 'file', pattern: /\[file:\s*([^\]]+?)\]/gi },
        { type: 'poll', pattern: /\[poll:\s*([^\]]+?)\]/gi },
        { type: 'voice', pattern: /\[voice:\s*([^\]]+?)\]/gi }
    ];
    
    // 檢測格式標籤
    for (const tagConfig of formatTagPatterns) {
        const matches = content.match(tagConfig.pattern);
        if (matches && matches.length > 0) {
            detectedType = tagConfig.type;
            console.log(`[VN面板] 智能檢測到 ${tagConfig.type} 格式在訊息 #${message.number}，標籤：${matches[0]}`);
            break;
        }
    }
    
    // 處理紅包格式
    if (content.includes('🧧') || content.match(/-\s*🧧/) || content.toLowerCase().includes('star coins') || content.includes('星幣')) {
        detectedType = 'red_envelope';
        console.log(`[VN面板] 智能檢測到紅包格式在訊息 #${message.number}`);
    }
    
    // 處理特殊情況：如果content開頭就是格式標籤（包含Image格式）
    const contentStartsWithTag = content.match(/^\[(sticker|photo|image|file|poll|voice):[^\]]*\]/i);
    if (contentStartsWithTag) {
        detectedType = contentStartsWithTag[1].toLowerCase() === 'image' ? 'photo' : contentStartsWithTag[1].toLowerCase();
        console.log(`[VN面板] 內容開頭檢測到 ${detectedType} 標籤在訊息 #${message.number}`);
    }
    
    // 處理混合內容（文字+格式標籤）
    const hasText = content.replace(/\[(sticker|photo|image|file|poll|voice):[^\]]*\]/gi, '').trim().length > 0;
    const hasFormatTag = formatTagPatterns.some(config => config.pattern.test(content));
    
    if (hasText && hasFormatTag) {
        console.log(`[VN面板] 檢測到混合內容（文字+格式）在訊息 #${message.number}`);
        // 保持原有邏輯，在createSimpleChatMessage中處理
    }
    
    // 清理多餘的空格和換行
    content = content.replace(/\s+/g, ' ').trim();
    
    return {
        ...message,
        content: content,
        type: detectedType
    };
}

/**
 * Finalizes the message type based on content or known patterns.
 */
function finalizeMessageType(message) {
    // 首先進行智能處理
    message = smartProcessMessageContent(message);
    
    let type = message.type?.trim();
    const content = message.content || '';

    if (!type || type === 'none') { // Auto-detect if not set or 'none'
        if (content.includes('[sticker:')) type = 'sticker';
        else if (content.includes('[file:')) type = 'file';
        else if (content.includes('[photo:')) type = 'photo';
        else if (content.includes('[image:')) type = 'photo'; // 新增：支援 [Image: XXX] 格式
        else if (content.includes('[poll:')) type = 'poll';
        else if (content.includes('[voice:')) type = 'voice';
        else if (content.includes('🧧') || content.match(/-\s*🧧/)) type = 'red_envelope';
        else type = 'none';
    }

    // Correct types that might have been misparsed as date/time/status
    if (type && (/^\d{4}-\d{2}-\d{2}$/.test(type) || /^\d{2}:\d{2}$/.test(type) || ['已讀', '未讀'].includes(type))) {
        console.warn(`[VN面板] Correcting message #${message.number} erroneous type "${type}" to 'none'.`);
        type = 'none';
    }
    message.type = type;
}


// ===== Main Chat Handling Function =====
function handleChatDialogue(dialogue) {
    if (!dialogue) {
        console.error('[VN面板] Chat dialogue object is null! Cannot proceed.');
        return;
    }

    // --- Start: Determine definitive Chat ID and Type for locking and processing ---
    let definitiveChatId = dialogue.listId || dialogue.chatId;
    let definitiveChatType = dialogue.chatType || 'dm'; // Default type

    if (dialogue.content) {
        const extractedDetailsFromContent = extractChatDetailsFromContent(dialogue.content);
        if (extractedDetailsFromContent) {
            // If content has tags, these are usually more authoritative for ID and type
            definitiveChatId = extractedDetailsFromContent.id;
            definitiveChatType = extractedDetailsFromContent.type;
        } else {
            // If no tags in content, refine type based on keywords if ID was from dialogue obj
            definitiveChatType = determineChatTypeFromContent(dialogue.content, definitiveChatType);
        }
    }
    definitiveChatId = definitiveChatId || 'chat_' + Date.now(); // Ensure an ID if all else fails
    definitiveChatId = ensureChatIdPrefix(definitiveChatId, definitiveChatType); // Standardize prefix
    // --- End: Determine definitive Chat ID and Type ---


    // --- Start: Locking logic to prevent rapid/conflicting modal operations ---
    // Lock 1: Debounce - Prevent extremely rapid, repeated calls for the *exact same* chat ID.
    if (lastChatAttemptedToOpenId === definitiveChatId && (Date.now() - lastChatOpenAttemptTimestamp < 500)) {
        console.log(`[VN面板] Debouncing rapid open attempts for chat ID: ${definitiveChatId}. Ignoring call.`);
        return;
    }
    lastChatAttemptedToOpenId = definitiveChatId;
    lastChatOpenAttemptTimestamp = Date.now();

    // Lock 2: Recently Closed - Prevent re-opening the *exact same* chat ID if it was *just closed*.
    // This helps prevent flicker if the close->open sequence for the same chat happens too fast.
    if (window._closedChatDetails &&
        window._closedChatDetails.id === definitiveChatId &&
        (Date.now() - window._closedChatDetails.timestamp < 1000)) {
        console.log(`[VN面板] Chat window for ${definitiveChatId} was recently closed. Preventing re-open of the same chat ID too quickly. Ignoring call.`);
        return;
    }
    // --- End: Locking logic ---

    console.log(`[VN面板] Processing handleChatDialogue for ID: ${definitiveChatId}, Type: ${definitiveChatType}`);

    // Update the dialogue object with the definitive ID and Type.
    // This ensures the rest of the function and subsequent calls use the resolved values.
    dialogue.chatId = definitiveChatId;
    dialogue.chatType = definitiveChatType;


    // Check if this is a consecutive chat dialogue
    // This logic might need review based on how `pendingDialogRestore` and `consecutiveChatDetected` are managed.
    // For now, the primary concern is the modal opening lock.
    const isConsecutiveChat = (pendingDialogRestore === true || consecutiveChatDetected === true);
    console.log(`[VN面板] Starting chat dialogue processing: ${dialogue.chatId}, Consecutive: ${isConsecutiveChat}, Last Known: ${lastProcessedChatId}`);

    if (lastProcessedChatId && lastProcessedChatId !== dialogue.chatId && pendingDialogRestore) {
        console.log('[VN面板] Detected change in chat ID while pending dialog restore, marking as consecutive.');
        consecutiveChatDetected = true; // This flag might influence UI restoration later.
        pendingDialogRestore = false;
    }
    lastProcessedChatId = dialogue.chatId; // Update last processed ID

    if (pendingDialogRestore && dialogue.chatId) { // If a new chat is starting, clear pending restore for main dialog.
        console.log('[VN面板] Clearing pending dialog restore as new chat is starting.');
        pendingDialogRestore = false;
    }

    // Debug Print
    debugPrintChatContent(dialogue);

    currentChatState = { // Reset current chat state for the new chat
        activeChatId: null, activeChatName: '', activeChatType: '',
        chatMessages: [], isVisible: false, currentMessageIndex: 0, allMessagesShown: false
    };
    console.log(`[VN面板] Final chat info for display: ID=${dialogue.chatId}, Type=${dialogue.chatType}, Name=${dialogue.chatName || 'Unnamed'}`);

    if (!originalDialogState) { // Save main dialog state ONLY if it hasn't been saved yet (e.g., by a previous chat in a sequence)
        saveMainDialogState();
    }
    hideMainDialogBox(); // Hide the main VN dialogue box

    const simpleChatModal = document.getElementById(SIMPLE_CHAT_MODAL_ID);
    const chatMessagesContainer = document.getElementById(SIMPLE_CHAT_MESSAGES_ID);

    if (!simpleChatModal || !chatMessagesContainer) {
        console.error(`[VN面板] Chat modal (${!simpleChatModal ? 'missing' : 'found'}) or messages container (${!chatMessagesContainer ? 'missing' : 'found'}) critical error!`);
        if (!simpleChatModal) showChatModal(); // Attempt to create if modal missing
        if (chatMessagesContainer) chatMessagesContainer.innerHTML = '';
        else {
            console.error('[VN面板] Failed to ensure chat messages container. Aborting chat display.');
            // If the container is still missing after showChatModal tried, we can't proceed.
            // Consider restoring main UI if appropriate, or letting the VNCore proceed.
            // For now, simply returning might leave UI in an inconsistent state.
            if (originalDialogState) restoreMainDialogUI(); // Attempt to restore if state was saved
            if (window.VNCore && window.VNCore.proceedToNextDialogue) window.VNCore.proceedToNextDialogue();
            return;
        }
    } else {
        chatMessagesContainer.innerHTML = ''; // Clear existing messages
    }

    const rawMessages = extractChatMessages(dialogue);
    const processedMessages = rawMessages.map(msg => {
        const message = { ...msg };
        if (!message.chatId || message.chatId !== dialogue.chatId) message.chatId = dialogue.chatId;
        if (!message.chatType || message.chatType !== dialogue.chatType) message.chatType = dialogue.chatType;
        finalizeMessageType(message);
        return message;
    }).filter(msg => msg.chatId === dialogue.chatId && msg.chatType === dialogue.chatType);

    currentChatState = {
        activeChatId: dialogue.chatId,
        activeChatName: dialogue.chatName || '聊天',
        activeChatType: dialogue.chatType,
        chatMessages: processedMessages,
        isVisible: true,
        currentMessageIndex: 0,
        allMessagesShown: false
    };

    const chatStateKey = `${dialogue.chatType}_${dialogue.chatId}`;
    chatStateMap[chatStateKey] = {
        id: dialogue.chatId,
        chatName: dialogue.chatName || chatStateMap[chatStateKey]?.chatName || '聊天',
        chatType: dialogue.chatType,
        messages: [...processedMessages],
        isVisible: true,
        currentMessageIndex: 0,
        allMessagesShown: false
    };
    console.log(`[VN面板] Chat state for ${chatStateKey} (messages: ${processedMessages.length}) ${chatStateMap[chatStateKey]?.messages.length !== processedMessages.length ? 'updated' : 'created/current'}.`);

    isDisplayingMessage = false; // Reset message display lock for the new chat
    updateChatModalStyle(dialogue.chatType);
    showChatModal(); // This will also call updateChatModalContent
}


// Add this new function to save main dialog state
function saveMainDialogState() {
    console.log('[VN面板/聊天] Saving main dialog state');
    const dialogBox = document.querySelector(DIALOG_BOX_SELECTOR);
    const nameTag = document.querySelector(NAME_TAG_SELECTOR);

    originalDialogState = {
        dialogBox: dialogBox ? {
            display: dialogBox.style.display || (dialogBox.classList.contains('dialog-box') ? 'flex' : 'block'),
            visibility: dialogBox.style.visibility || 'visible',
            opacity: dialogBox.style.opacity || '1',
            classList: [...dialogBox.classList]
        } : null,
        nameTag: nameTag ? {
            display: nameTag.style.display || 'inline-block',
            visibility: nameTag.style.visibility || 'visible',
            opacity: nameTag.style.opacity || '1',
            classList: [...nameTag.classList]
        } : null
    };
}

/**
 * Hides the main VN dialog box and name tag.
 */
function hideMainDialogBox() {
    console.log('[VN面板/聊天] Hiding main dialog box.');
    [document.querySelector(DIALOG_BOX_SELECTOR), document.querySelector(NAME_TAG_SELECTOR)].forEach(el => {
        if (el) {
            // Store original styles if not already stored by saveMainDialogState
            // This is more about ensuring it's hidden than preserving for restore here.
            // saveMainDialogState should be the source of truth for restoration.
            if (!el.dataset.originalDisplaySourced) { // Check if we already stored it more formally
                 el.dataset.originalDisplay = el.style.display || (el.classList.contains('dialog-box') ? 'flex' : 'inline-block');
                 el.dataset.originalVisibility = el.style.visibility || 'visible';
                 el.dataset.originalOpacity = el.style.opacity || '1';
            }
            el.style.display = 'none';
            el.style.visibility = 'hidden';
            el.style.opacity = '0';
            el.classList.add('hiding'); // Add class for CSS transitions if any, or just as a state marker
        }
    });
}

/**
 * Extracts chat messages from the dialogue object.
 * @param {Object} dialogue Dialogue object.
 * @returns {Array} Array of chat message objects.
 */
function extractChatMessages(dialogue) {
    if (!dialogue || (!dialogue.content && (!dialogue.messagesList || dialogue.messagesList.length === 0))) {
        console.warn('[VN面板] Chat dialogue lacks content or messagesList.', dialogue);
        return [{
            id: '1', number: '1', sender: 'System', content: 'Cannot display messages; data missing.',
            type: 'none', date: new Date().toISOString().split('T')[0], time: new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
            status: '', isProtagonist: false, chatId: dialogue?.chatId || 'unknown', chatType: dialogue?.chatType || 'dm'
        }];
    }

    const protagonistName = getProtagonistName(dialogue.content);

    if (dialogue.messagesList && dialogue.messagesList.length > 0) {
        return dialogue.messagesList.map((msg, index) => ({
            ...msg,
            id: msg.number || msg.id || String(index + 1),
            content: msg.content || '(No message content)',
            isProtagonist: protagonistName && msg.sender === protagonistName,
            chatId: dialogue.chatId,
            chatType: dialogue.chatType
        }));
    }

    const messages = [];
    const today = new Date();
    const currentDate = String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    const currentTime = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
    const content = dialogue.content ? dialogue.content.trim() : "";

    const hasChatMark = content.includes('[Chat|');
    const hasDmListMark = /<dm_list_[^>]+>/i.test(content);
    const hasGroupListMark = /<group_list_[^>]+>/i.test(content);
    const hasMessageLines = /(?:\||^|\n)\s*#\d+\s*\|/.test(content);

    if (!content || !(hasChatMark || hasDmListMark || hasGroupListMark || hasMessageLines)) {
        console.warn('[VN面板] Content does not appear to be a valid chat dialogue format or is empty.');
        return [{
            id: '1', number: '1', sender: 'System', content: 'Invalid chat format or empty content.', type: 'none',
            date: currentDate, time: currentTime, status: '', isProtagonist: false,
            chatId: dialogue.chatId, chatType: dialogue.chatType
        }];
    }

    const messageLines = extractLinesFromBlock(content, dialogue.chatId);

    if (!messageLines || messageLines.length === 0) {
        console.warn('[VN面板] No message lines found in content.');
        return [{
            id: '1', number: '1', sender: 'System', content: 'Content format potentially correct, but no messages found (e.g., #1|Sender|Text).', type: 'none',
            date: currentDate, time: currentTime, status: '', isProtagonist: false,
            chatId: dialogue.chatId, chatType: dialogue.chatType
        }];
    }

    messageLines.forEach((line, index) => {
        try {
            const cleanedLine = line.trim().replace(/^\|/, '');
            let parts = cleanedLine.split('|').map(part => part.trim());
            const msgNumMatch = line.match(/#(\d+)\s*\|/);
            const messageNumber = msgNumMatch ? msgNumMatch[1] : (index + 1).toString();

            if (parts.length < 3) {
                console.warn(`[VN面板] Message line ${messageNumber} format incorrect, skipping: "${cleanedLine.substring(0, 50)}..."`);
                return;
            }

            parts = smartFixMessageFormat(parts, messageNumber);

            let sender = parts[1];
            let msgContent = parts[2];

            if (sender && (sender.includes('[照片:') || sender.includes('[文件:') || sender.includes('[功能:') || sender.includes('[语音:') || sender.includes('顺便请看') || sender.includes('设计不错'))) {
                console.log(`[VN面板] 檢測到格式異常，嘗試修復訊息 #${messageNumber}`);
                msgContent = sender;
                sender = messages.length > 0 ? messages[messages.length - 1].sender : 'Unknown Sender';
            }

            // ===== 中文格式类型检测（向后兼容英文） =====
            let messageType = 'none';

            // 检测语音 (中文优先，兼容英文)
            if (msgContent.includes('[语音:') || msgContent.includes('[語音:') || msgContent.includes('[voice:')) messageType = 'voice';
            // 检测图片/照片 (中文优先，兼容英文)
            else if (msgContent.includes('[照片:') || msgContent.includes('[圖片:') || msgContent.includes('[图片:') || msgContent.includes('[photo:') || msgContent.includes('[image:')) messageType = 'photo';
            // 检测文件 (中文优先，兼容英文)
            else if (msgContent.includes('[文件:') || msgContent.includes('[檔案:') || msgContent.includes('[file:')) messageType = 'file';
            // 检测投票 (中文优先，兼容英文)
            else if (msgContent.includes('[投票:') || msgContent.includes('[poll:')) messageType = 'poll';
            // 检测贴纸 (中文优先，兼容英文)
            else if (msgContent.includes('[贴纸:') || msgContent.includes('[貼紙:') || msgContent.includes('[sticker:')) messageType = 'sticker';
            // 检测红包
            else if (msgContent.includes('🧧') || msgContent.match(/-\s*🧧/)) messageType = 'red_envelope';
            // 其他中文功能格式 [xxx:yyy] 都识别为function
            else if (/\[[^:\]]+[:：][^\]]+\]/.test(msgContent)) messageType = 'function';

            const message = {
                id: messageNumber,
                number: messageNumber,
                sender: sender,
                content: msgContent,
                type: messageType,
                date: (parts.length > 3 && parts[3].trim().match(/^\d{2}-\d{2}$/)) ? 
                    `2025-${parts[3].trim()}` : 
                    new Date().toISOString().split('T')[0],
                time: (parts.length > 4 && parts[4].trim().match(/^\d{2}:\d{2}$/)) ? parts[4].trim() : currentTime,
                status: (parts.length > 5 && parts[5].trim()) ? parts[5].trim() : '',
                isProtagonist: protagonistName && sender === protagonistName,
                chatId: dialogue.chatId,
                chatType: dialogue.chatType
            };
            
            console.log(`[VN面板] 處理訊息 #${messageNumber}: sender="${sender}", type="${messageType}", content="${msgContent.substring(0, 50)}..."`);
            messages.push(message);
        } catch (error) {
            console.error(`[VN面板] Error processing chat line ${index + 1}: "${line.substring(0,50)}..."`, error);
        }
    });

    messages.sort((a, b) => parseInt(a.number) - parseInt(b.number));
    return messages.length > 0 ? messages : [{
        id: '1', number: '1', sender: dialogue.chatName || 'System', content: `No messages extracted for ${dialogue.chatName || 'this chat'}. Check format.`,
        type: 'none', date: currentDate, time: currentTime, status: '', isProtagonist: false, chatId: dialogue.chatId, chatType: dialogue.chatType
    }];
}

/**
 * Extracts individual message lines from a larger block of chat content.
 */
function extractLinesFromBlock(block, expectedChatId) {
    if (!block) return [];
    const normalizedBlock = block.replace(/\\n/g, '\n');

    if (expectedChatId) {
        // Optional validation, can be expanded if needed
    }

    const messageStartMarkers = [...normalizedBlock.matchAll(/(\|#\d+\s*\|)/g)];
    if (messageStartMarkers.length > 1) {
        const lines = [];
        for (let i = 0; i < messageStartMarkers.length; i++) {
            const start = messageStartMarkers[i].index;
            const end = (i + 1 < messageStartMarkers.length) ? messageStartMarkers[i+1].index : normalizedBlock.length;
            lines.push(normalizedBlock.substring(start, end).trim());
        }
        if (lines.length > 0) return lines.filter(line => line.startsWith("|#"));
    }

    let chatLines = normalizedBlock.match(/(?:(?:\n|^)\s*?)(\|?#\d+\s*\|(?:.|\n)*?)(?=\n\s*(?:\|?#\d+\s*\|)|$)/gs);
    if (chatLines && chatLines.length > 0) {
        return chatLines.map(line => line.trim()).filter(line => line);
    }

    if (normalizedBlock.includes('#')) {
        const lines = normalizedBlock.split('\n')
            .map(line => line.trim())
            .filter(line => line.match(/^\|?#\d+\s*\|/));
        if (lines.length > 0) return lines;
    }
    return [];
}

/**
 * 智能修復訊息格式 - 處理AI生成的不規範格式
 */
function smartFixMessageFormat(parts, messageNumber) {
    if (!Array.isArray(parts) || parts.length < 3) return parts;
    
    // 創建修復後的parts數組
    let fixedParts = [...parts];
    
    // 檢查是否有格式標籤（包含Image格式）被錯誤放置
    const formatTags = /\[(sticker|photo|image|file|poll|voice):[^\]]*\]/i;
    
    for (let i = 0; i < fixedParts.length; i++) {
        const part = fixedParts[i];
        if (typeof part !== 'string') continue;
        
        // 如果在sender位置發現格式標籤
        if (i === 1 && formatTags.test(part)) {
            console.log(`[VN面板] 檢測到格式標籤在sender位置，嘗試修復訊息 #${messageNumber}`);
            
            // 嘗試將格式標籤移動到content位置
            if (fixedParts.length >= 3) {
                // 如果content位置有內容，合併它們
                if (fixedParts[2]) {
                    fixedParts[2] = part + ' ' + fixedParts[2];
                } else {
                    fixedParts[2] = part;
                }
                // 清空sender位置，使用預設sender
                fixedParts[1] = 'Unknown';
            }
        }
        
        // 如果在非content位置發現格式標籤，移動到content
        if (i > 2 && formatTags.test(part)) {
            console.log(`[VN面板] 檢測到格式標籤在非content位置，移動到content位置，訊息 #${messageNumber}`);
            
            // 將標籤添加到content
            if (fixedParts[2]) {
                fixedParts[2] = fixedParts[2] + ' ' + part;
            } else {
                fixedParts[2] = part;
            }
            // 清空原位置
            fixedParts[i] = '';
        }
    }
    
    // 檢查content中是否有多個格式標籤，保持第一個並將其他作為文字
    if (fixedParts[2]) {
        const content = fixedParts[2];
        const tagMatches = content.match(/\[(sticker|photo|image|file|poll|voice):[^\]]*\]/gi);
        
        if (tagMatches && tagMatches.length > 1) {
            console.log(`[VN面板] 檢測到多個格式標籤，保留第一個，訊息 #${messageNumber}`);
            // 保留第一個標籤，其他當作普通文字
            let cleanContent = content;
            for (let j = 1; j < tagMatches.length; j++) {
                // 只移除額外的標籤格式，保留內容
                cleanContent = cleanContent.replace(tagMatches[j], tagMatches[j].replace(/[\[\]]/g, ''));
            }
            fixedParts[2] = cleanContent;
        }
    }
    
    return fixedParts;
}


// ===== Chat Window UI Operations =====

function updateChatModalContent() {
    if (isDisplayingMessage && currentChatState.currentMessageIndex > 0) { // Allow first message even if lock briefly on
        // console.log('[VN面板] updateChatModalContent: Display lock active, skipping.');
        return;
    }
    isDisplayingMessage = true;

    // console.log('[VN面板] Updating chat modal content for:', currentChatState.activeChatId);

    const chatModalTitleEl = document.getElementById(SIMPLE_CHAT_MODAL_TITLE_ID);
    if (chatModalTitleEl) {
        chatModalTitleEl.textContent = currentChatState.activeChatName;
        chatModalTitleEl.className = `simple-chat-modal-title ${currentChatState.activeChatType === 'group_chat' ? 'group-chat-title' : 'dm-chat-title'}`;
    }

    const messagesContainer = document.getElementById(SIMPLE_CHAT_MESSAGES_ID);
    if (!messagesContainer) {
        console.error('[VN面板] Messages container not found in updateChatModalContent!');
        isDisplayingMessage = false;
        return;
    }
    messagesContainer.innerHTML = '';
    messagesContainer.className = `simple-chat-messages ${currentChatState.activeChatType === 'group_chat' ? 'group-chat-messages' : 'dm-chat-messages'}`;

    const messagesToDisplay = currentChatState.chatMessages;

    if (!messagesToDisplay || messagesToDisplay.length === 0) {
        console.warn('[VN面板] No chat messages to display for:', currentChatState.activeChatId);
        messagesContainer.innerHTML = `<div class="simple-chat-instruction">No messages in this chat.</div>`;
        isDisplayingMessage = false;
        return;
    }

    const instructionDiv = document.createElement('div');
    instructionDiv.className = 'simple-chat-instruction';
    instructionDiv.textContent = 'Click window to display messages';
    messagesContainer.appendChild(instructionDiv);

    let isClickProcessing = false;
    messagesContainer.onclick = async (event) => {
        event.stopPropagation();
        if (isClickProcessing || currentChatState.allMessagesShown) return;

        isClickProcessing = true;
        if (instructionDiv.parentNode) instructionDiv.remove();

        await showNextMessage(messagesToDisplay, messagesContainer);

        setTimeout(() => { isClickProcessing = false; }, 200);
    };

    setTimeout(() => { isDisplayingMessage = false; }, 100); // Release initial lock
}

function updateChatModalStyle(chatType) {
    const modal = document.getElementById(SIMPLE_CHAT_MODAL_ID);
    const container = modal?.querySelector('.simple-chat-container');
    if (!container) return;

    container.classList.remove('dm-chat', 'group-chat');
    container.classList.add(chatType === 'group_chat' ? 'group-chat' : 'dm-chat');
}

function playMessagePopupSound() {
    try {
        // 動態獲取彈窗音效URL
        let popupSoundUrl = 'https://nancywang3641.github.io/sound-files/popup.wav';
        if (window.VNMaterialProcessor?.getSoundEffectSettings) {
            const settings = window.VNMaterialProcessor.getSoundEffectSettings();
            popupSoundUrl = settings.popupSoundUrl || popupSoundUrl;
        }
        
        const audio = new Audio(popupSoundUrl);
        audio.volume = 0.5;
        audio.play().catch(err => console.warn('[VN面板] Play sound failed:', err.message));
    } catch (error) {
        console.warn('[VN面板] Audio player creation failed:', error.message);
    }
}

async function showNextMessage(messages, container) {
    // Slightly relaxed lock: allow if it's the very first message (index 0)
    // or if the general isDisplayingMessage is false.
    if (isDisplayingMessage && currentChatState.currentMessageIndex > 0) {
        // console.log('[VN面板] showNextMessage: Display lock active, skipping.');
        return;
    }
    isDisplayingMessage = true; // Set lock for this operation

    if (currentChatState.currentMessageIndex >= messages.length) {
        currentChatState.allMessagesShown = true;
        if (!container.querySelector('.simple-chat-completion')) {
            container.innerHTML += `<div class="simple-chat-completion" style="text-align:center; padding:10px; color:#888;">All messages displayed.</div>`;
            const closeButton = document.createElement('button');
            closeButton.className = 'simple-chat-close-button actual-close-button'; // Added specific class
            closeButton.textContent = 'Close Chat';
            closeButton.onclick = (e) => { e.stopPropagation(); closeChatModal(); };
            container.appendChild(closeButton);
        }
        isDisplayingMessage = false; // Release lock
        return;
    }

    const msg = messages[currentChatState.currentMessageIndex];
    if (!msg) {
        console.error(`[VN面板] Message at index ${currentChatState.currentMessageIndex} is undefined.`);
        currentChatState.currentMessageIndex++;
        isDisplayingMessage = false; // Release lock
        setTimeout(() => showNextMessage(messages, container), 10);
        return;
    }

    finalizeMessageType(msg);

    const lastDateSeparator = [...container.querySelectorAll('.simple-chat-date-separator')].pop();
    let lastDate = lastDateSeparator?.dataset.dateValue;

    if (msg.date && msg.date !== lastDate) {
        const dateDiv = document.createElement('div');
        dateDiv.className = 'simple-chat-date-separator';
        dateDiv.textContent = msg.date === new Date().toISOString().split('T')[0] ? 'Today' : msg.date;
        dateDiv.dataset.dateValue = msg.date;
        container.appendChild(dateDiv);
    }

    try {
        const messageElement = await createSimpleChatMessage(msg);
        container.appendChild(messageElement);
        // Play sound for subsequent messages or if it's a single message chat
        if (currentChatState.currentMessageIndex > 0 || messages.length === 1) {
            playMessagePopupSound();
        }
    } catch (error) {
        console.error(`[VN面板] Error creating message element for msg #${msg.number}:`, error);
        container.innerHTML += `<div class="simple-chat-error">Error displaying message #${msg.number}.</div>`;
    }

    currentChatState.currentMessageIndex++;
    container.scrollTop = container.scrollHeight;

    setTimeout(() => { isDisplayingMessage = false; }, 50); // Release lock quickly for next message
}


async function createSimpleChatMessage(message) {
    const messageContainer = document.createElement('div');
    messageContainer.className = `simple-chat-message ${message.isProtagonist ? 'sent protagonist-message' : 'received'}`;

    if (!message.isProtagonist && message.sender) {
        messageContainer.innerHTML += `<div class="simple-chat-sender">${message.sender}</div>`;
    }

    const contentElement = document.createElement('div');
    contentElement.className = `simple-chat-content ${message.isProtagonist ? 'protagonist-content' : ''}`;

    const processRedEnvelope = () => {
        const match = message.content.match(/(.*?)(?:[-–—]\s*)?🧧\s*([\d.]+)\s*(?:Star Coins|星幣)?\s*(?:\[(.*?)\])?/i);
        if (match) {
            const baseContent = match[1]?.trim() || "恭喜發財，大吉大利！";
            const amount = match[2]?.trim();
            const statusRaw = match[3]?.trim();
            let statusText = statusRaw || '';
            let recipientsList = '';

            if (statusRaw?.toLowerCase().startsWith('received:') || statusRaw?.toLowerCase().startsWith('已領取:')) {
                const prefixLength = statusRaw.toLowerCase().startsWith('received:') ? 'received:'.length : '已領取:'.length;
                const recipients = statusRaw.substring(prefixLength).split(/[,、，]/).map(r => r.trim()).filter(r => r);
                statusText = recipients.length > 0 ? `${recipients.length}人已領取` : '已領取';
                if (recipients.length > 0) recipientsList = `<div class="red-envelope-recipients">${recipients.map(r => `<div class="recipient-item">• ${r}</div>`).join('')}</div>`;
            }
            return `<div class="simple-chat-red-envelope"><div class="red-envelope-header"><span class="red-envelope-icon">🧧</span><span class="red-envelope-amount">${amount} 星幣</span></div><div class="red-envelope-message">${baseContent}</div>${statusText ? `<div class="red-envelope-status">${statusText}</div>` : ''}${recipientsList}</div>`;
        }
        return `<div>${message.content}</div>`;
    };

    switch (message.type) {
    
    case 'photo':
    // 支持中文和英文格式
    let photoMatch = message.content.match(/\[照片:\s*([^\]]+?)\]/i) ||
                    message.content.match(/\[圖片:\s*([^\]]+?)\]/i) ||
                    message.content.match(/\[图片:\s*([^\]]+?)\]/i) ||
                    message.content.match(/\[photo:\s*([^\]]+?)\]/i) || // 向后兼容
                    message.content.match(/\[image:\s*([^\]]+?)\]/i);   // 向后兼容
    
    const photoDesc = photoMatch ? photoMatch[1].trim() : 'Photo';
    const photoBaseText = photoMatch ? message.content.replace(photoMatch[0], '').trim() : '';
    contentElement.innerHTML = `${photoBaseText ? `<div>${photoBaseText}</div>` : ''}<div class="simple-chat-photo"><div class="photo-description">📷 ${photoDesc}</div></div>`;
    break;

    case 'voice':
    // 处理中文和英文语音格式
    let voiceContent = message.content || '';
    let actualVoiceText = '';
    
    const voicePatterns = [
        /\[语音:\s*([^\]]+?)\]/i,
        /\[語音:\s*([^\]]+?)\]/i,
        /\[voice:\s*([^\]]+?)\]/i  // 向后兼容
    ];
    
    let voiceMatch = null;
    for (const pattern of voicePatterns) {
        voiceMatch = voiceContent.match(pattern);
        if (voiceMatch) {
            actualVoiceText = voiceMatch[1].trim();
            break;
        }
    }
    
    if (!actualVoiceText) {
        actualVoiceText = voiceContent;
    }
    
    let otherText = voiceContent;
    for (const pattern of voicePatterns) {
        otherText = otherText.replace(pattern, '').trim();
    }
    
    const voiceId = `voice-${message.id || Date.now()}`;
    
    contentElement.innerHTML = `
        <div class="simple-chat-voice">
            <div class="voice-message-header" onclick="toggleVoiceContent('${voiceId}')" style="cursor: pointer;">
                <span class="voice-icon">🔊</span>
                <div class="voice-pseudo-timeline">
                    <div class="voice-timeline-inner"></div>
                </div>
                <span class="voice-duration">Voice Message</span>
                <span class="voice-toggle-icon" id="${voiceId}-toggle">▼</span>
            </div>
            <div class="voice-content-container" id="${voiceId}" style="display: none;">
                ${actualVoiceText ? `<div class="voice-content">${actualVoiceText}</div>` : ''}
                ${otherText ? `<div class="voice-additional-text">${otherText}</div>` : ''}
            </div>
        </div>`;
    break;

        case 'file':
    // 支持中文和英文格式
    let fileMatch = message.content.match(/\[文件:\s*([^\]]+?)\]/i) ||
                   message.content.match(/\[檔案:\s*([^\]]+?)\]/i) ||
                   message.content.match(/\[file:\s*([^\]]+?)\]/i); // 向后兼容
    
    const fileName = fileMatch ? fileMatch[1].trim() : 'File';
    const fileBaseText = fileMatch ? message.content.replace(fileMatch[0], '').trim() : '';
    contentElement.innerHTML = `${fileBaseText ? `<div>${fileBaseText}</div>` : ''}<div class="simple-chat-file"><span class="file-icon">📄</span><span class="file-name">${fileName}</span></div>`;
    break;

        case 'poll':
    // 支持中文和英文格式
    let pollMatch = message.content.match(/\[投票:\s*([^\]]+?)\]/i);
    if (!pollMatch) {
        pollMatch = message.content.match(/\[poll:\s*([^\]]+?)\]/i); // 向后兼容
    }
    
    if (pollMatch) {
        const pollContent = pollMatch[1].trim();
        const pollBaseText = message.content.replace(pollMatch[0], '').trim();
        const options = pollContent.split(/[,、，]/).map(opt => {
            const optMatch = opt.trim().match(/^(.*?)(?:\s*\((\d+)(?:\s*票)?\s*\))?$/);
            return `<li>${optMatch ? `${optMatch[1].trim()} ${optMatch[2] ? `(${optMatch[2]}票)` : ''}` : opt.trim()}</li>`;
        });
        contentElement.innerHTML = `${pollBaseText ? `<div class="poll-title">${pollBaseText}</div>` : ''}<div class="simple-chat-poll"><ul class="poll-options">${options.join('')}</ul></div>`;
    } else { 
        contentElement.textContent = message.content; 
    }
    break;

    case 'sticker':
    // 支持中文和英文格式
    let stickerRegexMatch = message.content.match(/\[贴纸:\s*([^\]]+?)\]/i) || 
                           message.content.match(/\[貼紙:\s*([^\]]+?)\]/i) ||
                           message.content.match(/\[sticker:\s*([^\]]+?)\]/i); // 向后兼容
    
    let stickerId = null;
    let stickerTagText = null;
    let textBeforeSticker = message.content;

    if (stickerRegexMatch) {
        stickerId = stickerRegexMatch[1].trim();
        stickerTagText = stickerRegexMatch[0];
        textBeforeSticker = message.content.replace(stickerTagText, '').trim();
    } else {
        const contentWithoutSpaces = message.content.trim();
        if (contentWithoutSpaces && !contentWithoutSpaces.includes(' ') && !contentWithoutSpaces.includes('[')) {
            stickerId = contentWithoutSpaces;
            textBeforeSticker = '';
        } else {
            const words = message.content.split(/\s+/);
            const potentialStickerId = words.find(word => 
                word.length > 2 && 
                !word.includes('http') && 
                !/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]/gu.test(word)
            );
            if (potentialStickerId) {
                stickerId = potentialStickerId;
                textBeforeSticker = message.content.replace(potentialStickerId, '').trim();
            } else {
                stickerId = 'default';
                textBeforeSticker = message.content;
            }
        }
    }

    let stickerHtmlOutput = '';
    if (textBeforeSticker) {
        const processedText = textBeforeSticker
            .replace(/\n/g, '<br>')
            .replace(/😊/g, '😊')
            .replace(/😄/g, '😄')
            .replace(/🤔/g, '🤔')
            .replace(/👍/g, '👍');
        stickerHtmlOutput += `<div>${processedText}</div>`;
    }

    if (stickerId) {
        // 檢查是否使用上傳模式
        const savedSettings = JSON.parse(localStorage.getItem('vn_material_settings') || '{}');
        const isUploadMode = savedSettings.sourceMode === 'upload';
        
        let stickerUrl = `${getStickerBaseUrl()}${stickerId}.jpg`;
        const fallbackUrl = getDefaultStickerUrl();
        
        // 如果是上傳模式，嘗試從IndexedDB獲取圖片
        if (isUploadMode && window.materialImageManager) {
            try {
                const images = await window.materialImageManager.getImagesByCategory('sticker');
                
                // 查找匹配的貼圖
                const matchedImage = images.find(img => {
                    const imgName = img.name.replace(/\.[^/.]+$/, ''); // 移除文件擴展名
                    return imgName === stickerId || imgName.includes(stickerId);
                });
                
                if (matchedImage) {
                    console.log('[VN面板] 從IndexedDB找到貼圖:', matchedImage.name);
                    stickerUrl = matchedImage.url;
                } else {
                    console.warn('[VN面板] IndexedDB中未找到貼圖，使用預設URL:', stickerId);
                }
            } catch (error) {
                console.error('[VN面板] 從IndexedDB獲取貼圖失敗:', error);
            }
        }
        
        // 改进的贴纸显示，如果图片加载失败会显示一个带名称的方框
        stickerHtmlOutput += `
            <div class="simple-chat-sticker" style="margin-top: ${textBeforeSticker ? '5px' : '0'};">
                <img src="${stickerUrl}" 
                     alt="Sticker (${stickerId})" 
                     onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
                     style="max-width: 80px; max-height: 80px; border-radius: 8px;">
                <div class="sticker-fallback" style="display: none; width: 120px; height: 120px; background: rgba(255,255,255,0.1); border: 2px dashed rgba(255,255,255,0.3); border-radius: 8px; align-items: center; justify-content: center; flex-direction: column; color: #ccc; font-size: 12px; text-align: center; padding: 10px;">
                    <div style="font-size: 24px; margin-bottom: 8px;">🖼️</div>
                    <div>${stickerId}</div>
                </div>
            </div>`;
        
        console.log(`[VN面板] 渲染sticker: ID="${stickerId}", 文字="${textBeforeSticker.substring(0, 20)}...", URL="${stickerUrl}", 模式="${isUploadMode ? 'upload' : 'url'}"`);
    }
    contentElement.innerHTML = stickerHtmlOutput || `<div>${message.content.replace(/\n/g, '<br>')}</div>`;
    break;

case 'function':
    const functionContent = message.content || '';
    let functionName = '';
    let functionDescription = '';
    let functionOtherText = functionContent;
    
    const functionPatterns = [
        /\[功能:\s*([^\]]+?)\]/i,
        /\[([^:：]+)[:：]\s*([^\]]+?)\]/i
    ];
    
    let functionMatch = null;
    for (const pattern of functionPatterns) {
        functionMatch = functionContent.match(pattern);
        if (functionMatch) {
            if (pattern === functionPatterns[0]) {
                functionName = '⚙️ 功能';
                functionDescription = functionMatch[1].trim();
            } else {
                functionName = functionMatch[1].trim();
                functionDescription = functionMatch[2].trim();
            }
            functionOtherText = functionContent.replace(functionMatch[0], '').trim();
            break;
        }
    }
    
    if (!functionName && !functionDescription) {
        functionName = '⚙️ 功能';
        functionDescription = functionContent;
        functionOtherText = '';
    }
    
    // 智能识别功能类型并添加特殊样式
    const functionTypeInfo = getFunctionTypeInfo(functionName);
    
    contentElement.innerHTML = `
        <div class="simple-chat-function ${functionTypeInfo.cssClass}">
            <div class="function-card-header">
                <div class="function-icon-container ${functionTypeInfo.iconClass}">
                    <div class="function-icon">${functionTypeInfo.icon}</div>
                    <div class="function-decoration ${functionTypeInfo.decorationClass}"></div>
                </div>
                <div class="function-info">
                    <div class="function-name">${functionName}</div>
                    <div class="function-description">${functionDescription}</div>
                </div>
            </div>
            ${functionOtherText ? `<div class="function-additional-text">${functionOtherText}</div>` : ''}
        </div>`;
    break;

        case 'red_envelope':
            contentElement.innerHTML = processRedEnvelope();
            break;

        default:
            let processedContent = message.content;
            
            const formatTagRegex = /\[(sticker|photo|file|poll|voice):[^\]]*\]/gi;
            const hasFormatTag = formatTagRegex.test(processedContent);
            
            if (hasFormatTag) {
                console.log(`[VN面板] 在default類型中檢測到格式標籤，移除並作為文字處理，訊息 #${message.number}`);
                processedContent = processedContent.replace(formatTagRegex, (match) => {
                    return match.replace(/[\[\]]/g, '').replace(/^(sticker|photo|file|poll|voice):/, '');
                });
            }
            
            processedContent = processedContent
                .replace(/\n/g, '<br>')
                .replace(/😊/g, '😊')
                .replace(/😄/g, '😄') 
                .replace(/🤔/g, '🤔')
                .replace(/👍/g, '👍')
                .replace(/❤️/g, '❤️')
                .replace(/💕/g, '💕')
                .replace(/😘/g, '😘')
                .replace(/😂/g, '😂')
                .replace(/🎉/g, '🎉')
                .replace(/🎊/g, '🎊');
            
            contentElement.innerHTML = `<div>${processedContent}</div>`;
            break;
    }

    messageContainer.appendChild(contentElement);

    let metaText = '';
    if (message.date && message.time) metaText = `${message.date} ${message.time}`;
    else if (message.time) metaText = message.time;
    else if (message.date) metaText = message.date;
    if (message.status || message.readCount) metaText += ` · ${message.status || message.readCount}`;

    if(metaText) messageContainer.innerHTML += `<div class="simple-chat-meta">${metaText}</div>`;

    // 阻止消息容器内的点击事件冒泡，避免误触发跳转
messageContainer.addEventListener('click', function(event) {
    event.stopPropagation();
});

    return messageContainer;
}

function showChatModal() {
    let modal = document.getElementById(SIMPLE_CHAT_MODAL_ID);

    // Check against the targeted "recently closed" lock, not the old global windowOpeningLock
    if (window._closedChatDetails &&
        currentChatState.activeChatId && // Ensure we have an active chat ID to check against
        window._closedChatDetails.id === currentChatState.activeChatId &&
        (Date.now() - window._closedChatDetails.timestamp < 1000)) {
        console.log(`[VN面板] Chat modal for ${currentChatState.activeChatId} recently closed, preventing re-show.`);
        return;
    }

    if (modal) {
        if (modal.classList.contains('active')) {
             // console.log('[VN面板] Chat modal already active. Updating content if necessary.');
        } else {
            modal.classList.add('active');
            // console.log('[VN面板] Chat modal shown.');
        }
        currentChatState.isVisible = true;

        modal.onclick = (event) => {
            if (event.target === modal) event.stopPropagation();
        };
        // 移除这里的onclick绑定，让按钮依赖setupChatListeners中的设置
        // const closeButton = modal.querySelector(`#${CLOSE_SIMPLE_CHAT_BUTTON_ID}`);
        // if (closeButton) closeButton.onclick = ...

        setTimeout(() => {
             setupChatListeners(); // 确保每次显示modal时都重新设置监听器
             if (modal.classList.contains('active')) updateChatModalContent();
        }, 50);

    } else {
        console.warn('[VN面板] Chat modal not found, creating it.');
        modal = document.createElement('div'); // Assign to 'modal'
        modal.id = SIMPLE_CHAT_MODAL_ID;
        modal.className = 'simple-chat-modal active';
        modal.innerHTML = `
            <div class="simple-chat-container">
                <div class="simple-chat-header">
                    <div id="${SIMPLE_CHAT_MODAL_TITLE_ID}">${currentChatState.activeChatName || 'Chat'}</div>
                    <button class="close-simple-chat" id="${CLOSE_SIMPLE_CHAT_BUTTON_ID}" title="返回"></button>
                </div>
                <div id="${SIMPLE_CHAT_MESSAGES_ID}" class="simple-chat-messages">
                    <div class="simple-chat-loading">Loading...</div>
                </div>
                <div class="iphone-home-indicator"></div>
                <div class="dynamic-island-sensor"></div>
            </div>`;
        document.body.appendChild(modal);

        modal.onclick = (event) => { if (event.target === modal) event.stopPropagation(); };
        // 移除这里的onclick绑定，让按钮依赖setupChatListeners中的设置
        // const closeButton = modal.querySelector(`#${CLOSE_SIMPLE_CHAT_BUTTON_ID}`);
        // if (closeButton) closeButton.onclick = ...

        currentChatState.isVisible = true;
        console.log('[VN面板] Chat modal created and shown.');
        
        // 在modal创建后立即设置事件监听器
        setTimeout(() => {
            setupChatListeners();
            if (modal.classList.contains('active')) updateChatModalContent();
        }, 50);
    }
}


function closeChatModal() {
    const modal = document.getElementById(SIMPLE_CHAT_MODAL_ID);
    if (modal) {
        modal.classList.remove('active');
        const messagesContainer = document.getElementById(SIMPLE_CHAT_MESSAGES_ID);
        if (messagesContainer) {
            messagesContainer.innerHTML = '';
            messagesContainer.onclick = null;
        }
    }

    const closedChatIdForLock = currentChatState.activeChatId;
    const closedChatTypeForLock = currentChatState.activeChatType;

    console.log(`[VN面板] Chat modal closed for ${closedChatIdForLock}. Resetting state.`);

    currentChatState = {
        activeChatId: null, activeChatName: '', activeChatType: '',
        chatMessages: [], isVisible: false, currentMessageIndex: 0, allMessagesShown: false
    };

    if (closedChatIdForLock) {
        window._closedChatDetails = { id: closedChatIdForLock, timestamp: Date.now() };
    } else {
        window._closedChatDetails = null; // Should not happen if a chat was active
    }

    const chatStateKey = `${closedChatTypeForLock}_${closedChatIdForLock}`;
    if (chatStateMap[chatStateKey]) {
        chatStateMap[chatStateKey].isVisible = false;
    }

    isDisplayingMessage = false; // Reset this global as well

    // This is where the decision to restore main UI or proceed to another chat happens
    if (checkIfNextDialogueIsChat()) {
        console.log('[VN面板/聊天] Next dialogue is a chat, proceeding without restoring main UI fully.');
        // originalDialogState remains set, main UI stays hidden by hideMainDialogBox()
        proceedToNextDialogue(); // This will trigger VNCore.nextDialogue -> updateDialogue -> handleChatDialogue(nextChat)
    } else {
        console.log('[VN面板/聊天] Next dialogue is NOT a chat, restoring main UI and proceeding.');
        restoreMainDialogUI(); // Makes main VN dialog visible using originalDialogState
                               // and clears originalDialogState
        proceedToNextDialogue(); // This will trigger VNCore.nextDialogue for the next VN line
    }
}

function proceedToNextDialogue() {
    console.log('[VN面板/聊天] Proceeding to next dialogue after chat action.');
    setTimeout(() => {
        try {
            if (window.VNCore?.nextDialogue) {
                window.VNCore.nextDialogue();
            } else if (window.nextDialogue) {
                window.nextDialogue();
            } else if (window.VNCoreAPI?.nextDialogue) {
                window.VNCoreAPI.nextDialogue();
            } else {
                console.warn('[VN面板/聊天] nextDialogue function not found on VNCore, VNCoreAPI or window.');
            }
        } catch (error) {
            console.error('[VN面板/聊天] Error calling nextDialogue:', error);
        }
    }, 100); // Small delay for UI updates to settle, if necessary.
}

function restoreMainDialogUI() {
    console.log('[VN面板/聊天] Restoring main dialog UI.');

    // Use originalDialogState if available, otherwise fallback to datasets or sensible defaults
    const dialogBox = document.querySelector(DIALOG_BOX_SELECTOR);
    const nameTag = document.querySelector(NAME_TAG_SELECTOR);

    if (dialogBox) {
        dialogBox.classList.remove('hiding');
        if (originalDialogState && originalDialogState.dialogBox) {
            dialogBox.style.display = originalDialogState.dialogBox.display;
            dialogBox.style.visibility = originalDialogState.dialogBox.visibility;
            dialogBox.style.opacity = originalDialogState.dialogBox.opacity;
            // dialogBox.className = ''; // Clear all classes then add back
            // originalDialogState.dialogBox.classList.forEach(c => dialogBox.classList.add(c));
        } else { // Fallback if originalDialogState wasn't captured for some reason
            dialogBox.style.display = dialogBox.dataset.originalDisplay || 'flex';
            dialogBox.style.visibility = dialogBox.dataset.originalVisibility || 'visible';
            dialogBox.style.opacity = dialogBox.dataset.originalOpacity || '1';
        }
    }

    if (nameTag) {
        nameTag.classList.remove('hiding');
        if (originalDialogState && originalDialogState.nameTag) {
            nameTag.style.display = originalDialogState.nameTag.display;
            nameTag.style.visibility = originalDialogState.nameTag.visibility;
            nameTag.style.opacity = originalDialogState.nameTag.opacity;
        } else {
            nameTag.style.display = nameTag.dataset.originalDisplay || 'inline-block';
            nameTag.style.visibility = nameTag.dataset.originalVisibility || 'visible';
            nameTag.style.opacity = nameTag.dataset.originalOpacity || '1';
        }
    }
    originalDialogState = null; // Crucial: Clear the saved state after restoring
    console.log('[VN面板/聊天] Main dialog UI restored and originalDialogState cleared.');
}


function restoreMainDialogUIAndContinue() { // Legacy wrapper, ensure it aligns
    console.log('[VN面板/聊天] restoreMainDialogUIAndContinue called, using new flow.');
    restoreMainDialogUI();
    proceedToNextDialogue();
}

/**
 * Helper function to check if the next dialogue is a chat type
 * @returns {boolean} True if next dialogue is a chat type
 */
function checkIfNextDialogueIsChat() {
    let vnCoreData;
    let currentIndex;
    
    try {
        vnCoreData = window.VNCore?.vnData || window.VNCoreAPI?.vnData; // Access VNCore's direct vnData reference
        currentIndex = window.VNCore?.currentDialogueIdx ?? window.VNCoreAPI?.currentDialogueIndex ?? -1; // Get current index from VNCore
    } catch (error) {
        console.warn('[VN面板/聊天] Cannot access VN data due to cross-origin restriction:', error);
        return false; // Default to false if we can't determine
    }
    
    if (!vnCoreData || !vnCoreData.dialogues || !Array.isArray(vnCoreData.dialogues)) {
        console.warn('[VN面板/聊天] Cannot access VN data from VNCore to check next dialogue type');
        return false;
    }

    if (currentIndex < 0 || currentIndex + 1 >= vnCoreData.dialogues.length) {
        return false; // No next dialogue or invalid current index
    }

    const nextDialogue = vnCoreData.dialogues[currentIndex + 1];

    if (!nextDialogue) return false;

    if (nextDialogue.type === 'chat') return true;

    if (nextDialogue.content) {
        if (nextDialogue.content.includes('[Chat|') ||
            nextDialogue.content.includes('<dm_list_') ||
            nextDialogue.content.includes('<group_list_') ||
            /<(?:dm|group)_list_[^>]+>/i.test(nextDialogue.content)) {
            return true;
        }
    }
    return false;
}

/**
 * Sets up initial event listeners for chat controls.
 */
function setupChatListeners() {
    const setupButtonListener = (buttonId, actionFn, buttonText, buttonTitle, insertBeforeTargetInHeader) => {
        let button = document.getElementById(buttonId);
        if (button) {
            const newButton = button.cloneNode(true);
            button.parentNode.replaceChild(newButton, button);
            button = newButton;
        } else if (insertBeforeTargetInHeader && buttonText) {
            const header = document.querySelector('.simple-chat-header');
            if (header) {
                button = document.createElement('button');
                button.id = buttonId;
                button.className = `${buttonId}-button`;
                button.textContent = buttonText;
                if (buttonTitle) button.title = buttonTitle;
                button.style.cssText = 'background-color:#128C7E; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; margin-left:5px;';
                const targetNode = header.querySelector(insertBeforeTargetInHeader);
                header.insertBefore(button, targetNode || header.firstChild);
                // console.log(`[VN面板] Created button: ${buttonId}`);
            } else {
                // console.warn(`[VN面板] Cannot create button ${buttonId}, header not found.`);
                return;
            }
        } else {
            return;
        }

        button.addEventListener('click', (e) => {
            e.stopPropagation();
            actionFn();
            try {
                window.VNCore?.playSound?.('clickSound') || window.VNCoreAPI?.playSound?.('clickSound');
            } catch (error) {
                console.warn('[VN面板] Cannot play sound due to cross-origin restriction:', error);
            }
            // console.log(`[VN面板] Chat action via button ${buttonId}`);
        });
    };

    // 让叉叉按钮使用跳过并继续的完整逻辑（避免bug）
    setupButtonListener(CLOSE_SIMPLE_CHAT_BUTTON_ID, () => {
        closeChatModal(); // 使用和跳过并继续相同的逻辑，避免对话框消失bug
    });
    // 保留跳过并继续按钮的设置（虽然已隐藏，但保持代码完整性）
    setupButtonListener('continue-chat-story', () => {
        closeChatModal(); // This calls proceedToNextDialogue internally after UI restoration decisions
    }, 'Skip & Continue', 'Close chat and continue story', `#${CLOSE_SIMPLE_CHAT_BUTTON_ID}`);

    // console.log('[VN面板/聊天] Chat listeners checked/set up.');
}

// Public API
window.ChatType = {
    handleChatDialogue,
    showChatModal,
    closeChatModal,
    // currentChatState, // Expose for debugging if needed
    // chatStateMap
};

/**
 * Debug function: Prints details of the chat dialogue object.
 */
function debugPrintChatContent(dialogue) {
    if (!dialogue) return;
    console.groupCollapsed(`[VN面板-Debug] Chat Content Details for ${dialogue.chatId || 'New Chat'}`);
    try {
        console.log('Dialogue Object:', JSON.parse(JSON.stringify(dialogue))); // Log the whole object
        console.log('Type:', dialogue.type, 'ID:', dialogue.chatId, 'Name:', dialogue.chatName);
        const content = dialogue.content ? dialogue.content.trim() : "[No Content Field]";
        console.log('Content Length:', content.length);
        console.log('Has [Chat|:', content.includes('[Chat|'));
        console.log('Has <dm_list_>:', /<dm_list_[^>]*>/i.test(content));
        console.log('Has <group_list_>:', /<group_list_[^>]*>/i.test(content));
        const messageLines = content.match(/(?:^|\n|\|)\s*#\d+\s*\|/g) || [];
        console.log('Detected Message Lines in content:', messageLines.length);
        if (dialogue.messagesList) {
            console.log('messagesList length:', dialogue.messagesList.length);
        }
        if (content.length > 0 && content.length < 500) {
             console.log('Content Sample:', content);
        } else if (content.length >= 500) {
            console.log('Content Sample (first 500 chars):', content.substring(0, 500));
        }
    } catch (error) {
        console.error('[VN面板-Debug] Error in debug print:', error);
    }
    console.groupEnd();
}

// Initialize listeners when the script loads
// This might need to be called after the main DOM is fully ready,
// ensure it's called appropriately, e.g. from the main HTML's script block or a DOMContentLoaded listener.
// For now, calling it here. If DOM elements are not ready, it might partially fail.
// Consider moving this to an explicit init function called by the main panel.
// $(document).ready(setupChatListeners); // If using jQuery
document.addEventListener('DOMContentLoaded', setupChatListeners);


// 语音消息折叠/展开功能
function toggleVoiceContent(voiceId) {
    const contentContainer = document.getElementById(voiceId);
    const toggleIcon = document.getElementById(voiceId + '-toggle');
    
    if (!contentContainer || !toggleIcon) return;
    
    if (contentContainer.style.display === 'none') {
        // 展开
        contentContainer.style.display = 'block';
        toggleIcon.textContent = '▲';
        
        // 添加展开动画
        contentContainer.style.opacity = '0';
        contentContainer.style.transform = 'translateY(-10px)';
        
        setTimeout(() => {
            contentContainer.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            contentContainer.style.opacity = '1';
            contentContainer.style.transform = 'translateY(0)';
        }, 10);
        
    } else {
        // 收起
        contentContainer.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        contentContainer.style.opacity = '0';
        contentContainer.style.transform = 'translateY(-10px)';
        
        setTimeout(() => {
            contentContainer.style.display = 'none';
            toggleIcon.textContent = '▼';
        }, 300);
    }
    
    // 播放点击音效
    if (window.VNFeatures?.playSound) {
        window.VNFeatures.playSound('clickSound');
    }
}

// 将函数添加到全局作用域
window.toggleVoiceContent = toggleVoiceContent;

// 语音消息折叠/展开功能
function toggleVoiceContent(voiceId) {
    const contentContainer = document.getElementById(voiceId);
    const toggleIcon = document.getElementById(voiceId + '-toggle');
    
    if (!contentContainer || !toggleIcon) return;
    
    if (contentContainer.style.display === 'none') {
        contentContainer.style.display = 'block';
        toggleIcon.textContent = '▲';
        
        contentContainer.style.opacity = '0';
        contentContainer.style.transform = 'translateY(-10px)';
        
        setTimeout(() => {
            contentContainer.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            contentContainer.style.opacity = '1';
            contentContainer.style.transform = 'translateY(0)';
        }, 10);
        
    } else {
        contentContainer.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        contentContainer.style.opacity = '0';
        contentContainer.style.transform = 'translateY(-10px)';
        
        setTimeout(() => {
            contentContainer.style.display = 'none';
            toggleIcon.textContent = '▼';
        }, 300);
    }
    
    if (window.VNFeatures?.playSound) {
        window.VNFeatures.playSound('clickSound');
    }
}

// 功能卡片折叠/展开功能
function toggleFunctionContent(functionId) {
    const contentContainer = document.getElementById(functionId);
    const toggleIcon = document.getElementById(functionId + '-toggle');
    
    if (!contentContainer || !toggleIcon) return;
    
    if (contentContainer.style.display === 'none') {
        contentContainer.style.display = 'block';
        toggleIcon.textContent = '▲';
        
        setTimeout(() => {
            contentContainer.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            contentContainer.style.opacity = '1';
            contentContainer.style.transform = 'translateY(0)';
        }, 10);
        
    } else {
        contentContainer.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        contentContainer.style.opacity = '0';
        contentContainer.style.transform = 'translateY(-10px)';
        
        setTimeout(() => {
            contentContainer.style.display = 'none';
            toggleIcon.textContent = '▼';
        }, 300);
    }
    
    if (window.VNFeatures?.playSound) {
        window.VNFeatures.playSound('clickSound');
    }
}

// 将函数添加到全局作用域
window.toggleFunctionContent = toggleFunctionContent;



// =======================================================================
//                            通用訊息卡片設置[功能: 描述]
// =======================================================================

// 智能识别功能类型并返回样式信息
function getFunctionTypeInfo(functionName) {
    const cleanName = functionName.replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '').trim().toLowerCase();
    
    // 音乐相关
    if (cleanName.includes('音乐') || cleanName.includes('音樂') || cleanName.includes('歌') || cleanName.includes('播放') || functionName.includes('🎵') || functionName.includes('🎶')) {
        return {
            cssClass: 'function-music',
            iconClass: 'icon-music',
            decorationClass: 'decoration-cd',
            icon: '🎵'
        };
    }
    
    // 位置相关
    if (cleanName.includes('位置') || cleanName.includes('定位') || cleanName.includes('地点') || cleanName.includes('位址') || functionName.includes('📍') || functionName.includes('🗺️')) {
        return {
            cssClass: 'function-location',
            iconClass: 'icon-location',
            decorationClass: 'decoration-map',
            icon: '📍'
        };
    }
    
    // 转账/支付相关
    if (cleanName.includes('转账') || cleanName.includes('轉帳') || cleanName.includes('支付') || cleanName.includes('付款') || cleanName.includes('钱') || cleanName.includes('錢') || functionName.includes('💰') || functionName.includes('💳')) {
        return {
            cssClass: 'function-payment',
            iconClass: 'icon-payment',
            decorationClass: 'decoration-coin',
            icon: '💰'
        };
    }
    
    // 游戏相关
    if (cleanName.includes('游戏') || cleanName.includes('遊戲') || cleanName.includes('玩') || cleanName.includes('开黑') || functionName.includes('🎮') || functionName.includes('🎯')) {
        return {
            cssClass: 'function-game',
            iconClass: 'icon-game',
            decorationClass: 'decoration-controller',
            icon: '🎮'
        };
    }
    
    // 视频相关
    if (cleanName.includes('视频') || cleanName.includes('視頻') || cleanName.includes('影片') || cleanName.includes('录像') || functionName.includes('🎬') || functionName.includes('📹')) {
        return {
            cssClass: 'function-video',
            iconClass: 'icon-video',
            decorationClass: 'decoration-film',
            icon: '🎬'
        };
    }
    
    // 购物相关
    if (cleanName.includes('购物') || cleanName.includes('購物') || cleanName.includes('买') || cleanName.includes('買') || cleanName.includes('商品') || functionName.includes('🛒') || functionName.includes('🛍️')) {
        return {
            cssClass: 'function-shopping',
            iconClass: 'icon-shopping',
            decorationClass: 'decoration-cart',
            icon: '🛒'
        };
    }
    
    // 日程/时间相关
    if (cleanName.includes('日程') || cleanName.includes('日程') || cleanName.includes('时间') || cleanName.includes('時間') || cleanName.includes('会议') || cleanName.includes('會議') || functionName.includes('📅') || functionName.includes('⏰')) {
        return {
            cssClass: 'function-schedule',
            iconClass: 'icon-schedule',
            decorationClass: 'decoration-clock',
            icon: '📅'
        };
    }
    
    // 默认功能
    return {
        cssClass: 'function-default',
        iconClass: 'icon-default',
        decorationClass: 'decoration-gear',
        icon: '⚙️'
    };
}

// 将函数添加到全局作用域
window.getFunctionTypeInfo = getFunctionTypeInfo;
window.handleChatDialogue = handleChatDialogue;