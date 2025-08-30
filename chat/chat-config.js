// =======================================================================
//                            全域變數定義和配置
// =======================================================================

// 🔥 新增：角色名繁简体映射（简体->繁体）- 已清空，供朋友使用
const characterNameMap = {
    // 角色名映射已清空，用户可以根据需要自行添加
};

// 获取标准化的角色名（优先用繁体）
function getNormalizedCharacterName(name) {
    return characterNameMap[name] || name;
}

// 🆕 新增：預設聊天室管理系統
const PresetChatManager = {
    // 預設聊天室配置 - 已清空，供朋友使用
    defaultChats: [
        // 预设聊天室已清空，用户可以根据需要自行创建
    ],

    // 檢查並創建預設聊天室
    async initializePresetChats() {
        try {
            Logger.info('🆕 開始初始化預設聊天室...');
            // 讀取本地存儲
            const saved = localStorage.getItem('preset_chats');
            const userPresets = JSON.parse(localStorage.getItem('user_preset_chats') || '[]');
            const allPresets = [...this.defaultChats, ...userPresets];
            
            // 如果沒有預設聊天室且本地也無數據，則保持空白狀態
            if (allPresets.length === 0) {
                if (!saved || JSON.parse(saved).length === 0) {
                    chatData.chatList = [];
                    Logger.success('✅ 無預設聊天室，保持空白狀態供用戶自定義');
                    return;
                }
            }
            
            if (!saved || JSON.parse(saved).length === 0) {
                chatData.chatList = [];
                for (const chatConfig of allPresets) {
                    await this.createPresetChat(chatConfig);
                }
                this.saveChatsToStorage();
                Logger.success('✅ 本地無資料，自動補上所有預設聊天室');
            } else {
                const parsed = JSON.parse(saved);
                chatData.chatList = parsed;
                let added = 0;
                for (const chatConfig of allPresets) {
                    if (!parsed.find(c => c.id === chatConfig.id)) {
                        await this.createPresetChat(chatConfig);
                        added++;
                    }
                }
                if (added > 0) this.saveChatsToStorage();
                Logger.success(`✅ 合併補齊 ${added} 個預設聊天室`);
            }
        } catch (error) {
            Logger.error('❌ 初始化預設聊天室失敗:', error);
        }
    },

    // 創建單個預設聊天室
    async createPresetChat(chatConfig) {
        try {
            const currentDate = new Date().toISOString().slice(0, 10);
            const currentTime = new Date().toTimeString().slice(0, 5);
            
            // 構建聊天室對象
            const newChat = {
                id: chatConfig.id,
                type: chatConfig.type,
                name: chatConfig.name,
                createdAt: `${currentDate} ${currentTime}`,
                isPreset: true // 標記為預設聊天室
            };
            
            // 根據類型添加特定屬性
            if (chatConfig.type === 'group') {
                newChat.admin = chatConfig.admin;
                newChat.members = chatConfig.members;
                // 🆕 保存群組頭像
                if (chatConfig.groupAvatar) {
                    newChat.groupAvatar = chatConfig.groupAvatar;
                }
                // 🆕 保存群組創建者頭像
                if (chatConfig.adminAvatar) {
                    newChat.adminAvatar = chatConfig.adminAvatar;
                }
            } else if (chatConfig.type === 'dm') {
                newChat.participant1 = chatConfig.participant1;
                newChat.participant2 = chatConfig.participant2;
                // 🆕 保存私聊頭像
                if (chatConfig.userAvatar) {
                    newChat.userAvatar = chatConfig.userAvatar;
                }
                if (chatConfig.characterAvatar) {
                    newChat.characterAvatar = chatConfig.characterAvatar;
                }
            } else if (chatConfig.type === 'story') {
                newChat.narrator = chatConfig.narrator;
            }
            
            // 添加到聊天列表
            chatData.chatList.unshift(newChat);
            
            // 🆕 初始化對應的聊天存儲
            const chatStore = chatConfig.type === 'dm' ? chatData.dmChats : 
                             chatConfig.type === 'story' ? chatData.storyChats :
                             chatData.groupChats;
            
            if (!chatStore[chatConfig.id]) {
                if (chatConfig.type === 'group') {
                    // 🔥 修正：為群聊創建包含完整信息的對象
                    chatStore[chatConfig.id] = {
                        id: chatConfig.id,
                        name: chatConfig.name,
                        admin: chatConfig.admin,
                        messages: [],
                        groupAvatar: chatConfig.groupAvatar,
                        adminAvatar: chatConfig.adminAvatar,
                        members: chatConfig.members,
                        isPreset: true
                    };
                    console.log(`[createPresetChat] 創建群聊存儲: {id: '${chatConfig.id}', hasGroupAvatar: ${!!chatConfig.groupAvatar}}`);
                } else {
                    chatStore[chatConfig.id] = { messages: [] };
                }
            }
            
            Logger.debug(`✅ 創建預設聊天室: ${chatConfig.name}`);
            
        } catch (error) {
            Logger.error(`❌ 創建預設聊天室失敗 ${chatConfig.name}:`, error);
        }
    },

    // 保存聊天室到本地存儲
    saveChatsToStorage() {
        try {
            localStorage.setItem('preset_chats', JSON.stringify(chatData.chatList));
            Logger.debug('✅ 聊天室已保存到本地存儲');
        } catch (error) {
            Logger.error('❌ 保存聊天室失敗:', error);
        }
    },

    // 從本地存儲讀取聊天室
    loadSavedChats() {
        try {
            const saved = localStorage.getItem('preset_chats');
            if (saved) {
                const parsed = JSON.parse(saved);
                chatData.chatList = parsed;
                Logger.debug(`✅ 從本地存儲讀取 ${parsed.length} 個聊天室`);
                return parsed;
            }
        } catch (error) {
            Logger.error('❌ 讀取本地存儲失敗:', error);
        }
        return [];
    },

    // 添加新的預設聊天室
    async addPresetChat(chatConfig) {
        try {
            // 檢查是否已存在
            const exists = chatData.chatList.find(chat => chat.id === chatConfig.id);
            if (exists) {
                Logger.warn(`聊天室 ${chatConfig.id} 已存在`);
                return false;
            }
            
            // 🔥 修正：檢查localStorage配額，如果數據太大則不保存到localStorage
            let userPresets = JSON.parse(localStorage.getItem('user_preset_chats') || '[]');
            
            // 檢查新配置的大小
            const newConfigSize = JSON.stringify(chatConfig).length;
            const currentPresetsSize = JSON.stringify(userPresets).length;
            const totalSize = newConfigSize + currentPresetsSize;
            
            // 如果總大小超過5MB，則不保存到localStorage
            if (totalSize > 5 * 1024 * 1024) {
                Logger.warn(`❌ 聊天室配置太大 (${Math.round(totalSize / 1024)}KB)，跳過localStorage保存`);
                // 只創建聊天室，不保存到localStorage
                await this.createPresetChat(chatConfig);
                this.saveChatsToStorage();
                Logger.success(`✅ 成功添加預設聊天室（未保存到localStorage）: ${chatConfig.name}`);
                return true;
            }
            
            // 正常保存到localStorage
            userPresets.push(chatConfig);
            localStorage.setItem('user_preset_chats', JSON.stringify(userPresets));
            
            // 創建聊天室
            await this.createPresetChat(chatConfig);
            this.saveChatsToStorage();
            Logger.success(`✅ 成功添加預設聊天室: ${chatConfig.name}`);
            return true;
        } catch (error) {
            Logger.error('❌ 添加預設聊天室失敗:', error);
            // 🔥 修正：如果是配額超限錯誤，嘗試不保存到localStorage
            if (error.name === 'QuotaExceededError' || error.message.includes('quota')) {
                try {
                    Logger.warn('❌ localStorage配額超限，嘗試不保存到localStorage');
                    // 只創建聊天室，不保存到localStorage
                    await this.createPresetChat(chatConfig);
                    this.saveChatsToStorage();
                    Logger.success(`✅ 成功添加預設聊天室（跳過localStorage）: ${chatConfig.name}`);
                    return true;
                } catch (fallbackError) {
                    Logger.error('❌ 備用方案也失敗:', fallbackError);
                    return false;
                }
            }
            return false;
        }
    },

    // 刪除預設聊天室
    removePresetChat(chatId) {
        try {
            // 從聊天列表中移除
            chatData.chatList = chatData.chatList.filter(chat => chat.id !== chatId);
            
            // 從預設列表中移除
            this.defaultChats = this.defaultChats.filter(chat => chat.id !== chatId);
            
            // 保存到本地存儲
            this.saveChatsToStorage();
            
            Logger.success(`✅ 成功刪除預設聊天室: ${chatId}`);
            return true;
            
        } catch (error) {
            Logger.error('❌ 刪除預設聊天室失敗:', error);
            return false;
        }
    },

    // 🆕 更新預設聊天室
    async updatePresetChat(chatId, updatedConfig) {
        try {
            // 找到要更新的聊天室
            const chatIndex = chatData.chatList.findIndex(chat => chat.id === chatId);
            if (chatIndex === -1) {
                Logger.warn(`聊天室 ${chatId} 不存在`);
                return false;
            }

            // 更新聊天室配置
            const updatedChat = {
                ...chatData.chatList[chatIndex],
                ...updatedConfig
            };

            // 根據類型更新特定屬性
            if (updatedConfig.type === 'group') {
                if (updatedConfig.groupAvatar !== undefined) {
                    updatedChat.groupAvatar = updatedConfig.groupAvatar;
                }
                if (updatedConfig.adminAvatar !== undefined) {
                    updatedChat.adminAvatar = updatedConfig.adminAvatar;
                }
            } else if (updatedConfig.type === 'dm') {
                if (updatedConfig.userAvatar !== undefined) {
                    updatedChat.userAvatar = updatedConfig.userAvatar;
                }
                if (updatedConfig.characterAvatar !== undefined) {
                    updatedChat.characterAvatar = updatedConfig.characterAvatar;
                }
            }

            // 更新聊天列表
            chatData.chatList[chatIndex] = updatedChat;

            // 更新用戶自訂預設列表
            let userPresets = JSON.parse(localStorage.getItem('user_preset_chats') || '[]');
            const presetIndex = userPresets.findIndex(chat => chat.id === chatId);
            if (presetIndex !== -1) {
                userPresets[presetIndex] = updatedConfig;
                localStorage.setItem('user_preset_chats', JSON.stringify(userPresets));
            }

            // 保存到本地存儲
            this.saveChatsToStorage();
            
            Logger.success(`✅ 成功更新預設聊天室: ${chatId}`);
            return true;
            
        } catch (error) {
            Logger.error('❌ 更新預設聊天室失敗:', error);
            return false;
        }
    },

    // 🆕 清除所有預設聊天室數據（供朋友使用）
    clearAllPresetData() {
        try {
            // 清除本地存儲中的預設聊天室數據
            localStorage.removeItem('preset_chats');
            localStorage.removeItem('user_preset_chats');
            
            // 清空聊天數據
            chatData.chatList = [];
            chatData.dmChats = {};
            chatData.groupChats = {};
            chatData.storyChats = {};
            
            // 清空預設列表
            this.defaultChats = [];
            
            Logger.success('✅ 已清除所有預設聊天室數據，面板已重置為空白狀態');
            return true;
            
        } catch (error) {
            Logger.error('❌ 清除預設聊天室數據失敗:', error);
            return false;
        }
    }
};

// 🔥 聊天数据和状态变量
let chatData = { chatList: [], dmChats: {}, groupChats: {}, storyChats: {} };
let currentChat = null;
let protagonistName = "";
let newlyCreatedChatId = null;

// 🆕 暴露清除函数到全局，供朋友使用
window.clearAllPresetChats = function() {
    return PresetChatManager.clearAllPresetData();
};

// 消息显示佇列和状态
let messageDisplayQueue = [];
let isDisplayingMessages = false;
let userViewedChats = new Set();
let currentMessages = [];
let lastDisplayedDate = null;
let currentChatBody = null;
let currentChatType = '';
let chatUnreadState = {};

// ★ 新增：用於防止完全相同的時間提示被重複顯示
let lastDisplayedSystemTimeContent = null; 

// 用於存儲每個聊天的消息顯示狀態
let chatMessageStates = {};

// 防止重複事件監聽
let eventListenersAdded = false;

// 🔥 简化：只保留基本的去重机制，不阻止重复查看
let lastDataHash = '';

// 🔥 新增：調試模式控制和日志系统
const CONFIG = {
    DEBUG_MODE: false,           // 调试模式开关
    VERBOSE_LOGGING: false,      // 详细日志开关
    SILENT_MODE: true,           // 静默模式（减少日志输出）
    MAX_MESSAGE_LOGS: 2,         // 最多显示2条消息日志
    MAX_DEBUG_COUNT: 3           // 最多显示3条同类型调试日志
};

// 🔥 日志管理器
const Logger = {
    debugCounters: {},
    
    info(message, ...args) {
        if (!CONFIG.SILENT_MODE) {
            console.log(`[聊天面板] ${message}`, ...args);
        }
    },
    
    debug(message, ...args) {
        if (CONFIG.DEBUG_MODE) {
            console.log(`[聊天面板] ${message}`, ...args);
        }
    },
    
    verbose(message, ...args) {
        if (CONFIG.DEBUG_MODE && CONFIG.VERBOSE_LOGGING) {
            console.log(`[聊天面板] ${message}`, ...args);
        }
    },
    
    limited(type, message, ...args) {
        if (!this.debugCounters[type]) this.debugCounters[type] = 0;
        this.debugCounters[type]++;
        
        if (this.debugCounters[type] <= CONFIG.MAX_DEBUG_COUNT) {
            if (!CONFIG.SILENT_MODE) {
                console.log(`[聊天面板] ${message}`, ...args);
            }
        } else if (this.debugCounters[type] === CONFIG.MAX_DEBUG_COUNT + 1) {
            if (!CONFIG.SILENT_MODE) {
                console.log(`[聊天面板] 已显示${CONFIG.MAX_DEBUG_COUNT}条${type}日志，后续将不再显示...`);
            }
        }
    },
    
    success(message, ...args) {
        if (!CONFIG.SILENT_MODE) {
            console.log(`[聊天面板] ✅ ${message}`, ...args);
        }
    },
    
    error(message, ...args) {
        console.error(`[聊天面板] ❌ ${message}`, ...args);
    },
    
    warn(message, ...args) {
        if (!CONFIG.SILENT_MODE) {
            console.warn(`[聊天面板] ⚠️ ${message}`, ...args);
        }
    }
};

// 🔥 新增：標記是否為初次加載聊天
let isInitialChatLoad = false;

// 🔥 新增：强制历史渲染模式标识
window.forceHistoryMode = false;

// 🔥 新增：防止面板重置的標記
let isUserSendingMessage = false;
let userSendingDebounceTimer = null;

// 🆕 新增：系统时间提示管理
let lastSystemTime = null;
let displayedSystemTimes = new Set();

// 🆕 新增：日志计数器
let messageCreationLogCount = 0;

// 🔥 新增：存储酒馆聊天记录用于通话状态检查
let globalTavernChatHistory = [];

// 语音播放状态管理
let voicePlaybackStates = {};

// 选择提示相关
let currentChoicePrompt = null;
window.latestChoiceOptions = [];

// 🔥 新增：合併聊天數據函數，保留預設聊天室
function mergeChatData(newData) {
    try {
        chatData = {
            ...chatData,
            ...newData,
            chatList: newData.chatList || [],
            dmChats: newData.dmChats || {},
            groupChats: newData.groupChats || {},
            storyChats: newData.storyChats || {}
        };
        const userPresets = JSON.parse(localStorage.getItem('user_preset_chats') || '[]');
        const allPresets = [...PresetChatManager.defaultChats, ...userPresets];
        allPresets.forEach(presetChat => {
            if (!chatData.chatList.find(chat => chat.id === presetChat.id)) {
                chatData.chatList.unshift({
                    ...presetChat,
                    isPreset: true,
                    createdAt: new Date().toISOString().slice(0, 16).replace('T', ' ')
                });
                const chatStore = presetChat.type === 'dm' ? chatData.dmChats :
                                  presetChat.type === 'story' ? chatData.storyChats :
                                  chatData.groupChats;
                if (!chatStore[presetChat.id]) {
                    chatStore[presetChat.id] = { messages: [] };
                }
            }
        });
        
        // 🔥 新增：初始化所有聊天室的未讀狀態
        chatData.chatList.forEach(chat => {
            initChatUnreadState(chat.id);
        });
        
        Logger.debug('✅ 合併並補齊所有預設聊天室');
    } catch (error) {
        Logger.error('❌ 合併聊天數據失敗:', error);
    }
}

// 添加新的状态管理函数
function initChatUnreadState(chatId) {
    if (!chatUnreadState[chatId]) {
        chatUnreadState[chatId] = {
            lastViewTime: Date.now(),
            unreadCount: 0,
            hasNewMessages: false
        };
    }
}

function updateUnreadCount(chatId, messageTime) {
    if (!chatUnreadState[chatId]) {
        initChatUnreadState(chatId);
    }
    
    const state = chatUnreadState[chatId];
    const msgTimestamp = new Date(messageTime).getTime();
    
    if (msgTimestamp > state.lastViewTime) {
        state.unreadCount++;
        state.hasNewMessages = true;
    }
}

function markChatAsRead(chatId) {
    if (chatUnreadState[chatId]) {
        chatUnreadState[chatId].lastViewTime = Date.now();
        chatUnreadState[chatId].unreadCount = 0;
        chatUnreadState[chatId].hasNewMessages = false;
    }
}

// 🔥 新增：時間管理函數
function getCurrentDate() {
    // 檢查是否存在由[SYSTEM]指令設定的敘事時間
    if (lastSystemTime) {
        const parts = lastSystemTime.split(' ');
        // 檢查格式是否為 "YYYY-MM-DD HH:MM" 或 "YYYY-MM-DD"
        if (parts.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(parts[0])) {
            return parts[0];
        }
        // 如果[SYSTEM]指令只設定了時間，則沿用上一個日期
        if (lastDisplayedDate) {
            return lastDisplayedDate;
        }
    }
    // 如果沒有敘事時間，則回退到使用現實系統時間
    return new Date().toISOString().slice(0, 10);
}

/**
 * 获取当前时间 (HH:MM 格式) - 修复版本：优先使用系统时间
 */
function getCurrentTime() {
    // 🔥 优先检查是否存在系统时间设置
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
                    return `${String(adjustedDate.getHours()).padStart(2, '0')}:${String(adjustedDate.getMinutes()).padStart(2, '0')}`;
                } catch (error) {
                    console.error('[时间] 应用偏移量时出错:', error);
                    return timePart; // 出错时返回原时间
                }
            }
            
            return timePart;
        }
    }
    
    // 🔥 如果没有系统时间设置，则使用现实时间
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 格式化时间显示
function formatTimeForChatList(timeStr) {
    if (!timeStr) return '';
    let date = new Date(timeStr);
    if (isNaN(date.getTime())) {
        // 嘗試 yyyy-mm-dd hh:mm:ss 這種格式
        date = new Date(timeStr.replace(/-/g, '/'));
    }
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateForDisplay(dateStr) {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const messageDate = new Date(dateStr);
    if (messageDate.toDateString() === today.toDateString()) return "今天";
    if (messageDate.toDateString() === yesterday.toDateString()) return "昨天";
    return `${messageDate.getFullYear()}年${messageDate.getMonth() + 1}月${messageDate.getDate()}日`;
}

// 安全的轉義函數
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * 生成简洁的聊天室ID
 * @param {string} prefix - ID前缀 ('group', 'dm', 'story_list')
 * @returns {string} 简洁ID，例如：group_1, dm_2, story_list_3
 */
function generateShortId(prefix) {
    // 为每种类型维护独立的计数器
    const counterKey = `${prefix}_counter`;
    const counter = parseInt(localStorage.getItem(counterKey) || '1');
    
    // 保存下一个计数器值
    localStorage.setItem(counterKey, (counter + 1).toString());
    
    return `${prefix}_${counter}`;
}

// 将函数暴露到全局
window.generateShortId = generateShortId;