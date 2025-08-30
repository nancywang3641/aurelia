/**
 * 聊天內容處理器 (V6.3 - 新格式支持)
 * 架构：酒館AI → Map面板 → Chat面板（直接）
 * 腳本名稱: 腳本-聊天內容處理器
 * 
 * 新格式支持：
 * - 聊天头部：[Chat|dm_6|陳彥庭⇆方亦楷]
 * - 消息内容：[1|dm_6|陳彥庭|我想養貓|18:47]
 * - 不再使用block标签
 */

(function() {
  // 🔥 配置和控制变量
  const CONFIG = {
    DEBUG_MODE: false,              // 调试模式开关
    VERBOSE_LOGGING: false,         // 详细日志开关
    SILENT_MODE: false,             // 静默模式
    MESSAGE_ID_CACHE_DURATION: 2000,
    STREAM_THROTTLE_DELAY: 100,
    PROCESSOR_CHECK_THROTTLE: 3000,
    MAX_LOG_COUNT: 2,               // 进一步限制日志数量
    PERIODIC_CHECK_INTERVAL: 10000  // 延长检查间隔
  };
  
  // === 核心數據結構 ===
  let chatData = { chatList: [], dmChats: {}, groupChats: {}, storyChats: {} };
  let currentTavernMessageId = null; 
  let protagonistName = "{{user}}"; // 🔥 修正：使用動態用戶名，不硬編碼
  
  // 🔥 新增：動態更新 protagonistName 的函數
  function updateProtagonistName() {
    try {
      Logger.debug('🔥 updateProtagonistName 開始執行:', {
        activeChatId: streamState.activeChatId,
        activeChatType: streamState.activeChatType,
        currentProtagonistName: protagonistName
      });
      
      // 1. 從當前活躍的聊天中獲取用戶名
      if (streamState.activeChatId && streamState.activeChatType === 'dm') {
        const actualUserName = getPrivateChatActualUserName(streamState.activeChatId);
        Logger.debug('🔥 私聊用戶名獲取結果:', {
          actualUserName: actualUserName,
          chatId: streamState.activeChatId
        });
        
        if (actualUserName && actualUserName !== '{{user}}') {
          protagonistName = actualUserName;
          Logger.debug('🔥 更新 protagonistName 為私聊用戶名:', protagonistName);
          return;
        }
      }
      
      // 2. 從群聊中獲取管理員名稱
      if (streamState.activeChatId && (streamState.activeChatType === 'group' || streamState.activeChatType === 'group_chat')) {
        const groupChat = chatData.groupChats[streamState.activeChatId];
        Logger.debug('🔥 群聊信息:', {
          groupChat: groupChat,
          admin: groupChat?.admin
        });
        
        if (groupChat && groupChat.admin) {
          protagonistName = groupChat.admin;
          Logger.debug('🔥 更新 protagonistName 為群聊管理員:', protagonistName);
          return;
        }
      }
      
      // 3. 保持默認值
      Logger.debug('🔥 protagonistName 保持默認值:', protagonistName);
      
    } catch (error) {
      Logger.error('🔥 更新 protagonistName 失敗:', error);
    }
  }
  let currentStoryDate = null;
  let currentStoryTime = null;

  // 🔥 新增：獲取私聊設置中的實際用戶名函數
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

  // === 狀態管理 ===
  let streamState = {
    activeChatId: null,
    activeChatType: null,
  };

  // === 缓存和优化变量 ===
  let messageIdCache = { id: -1, time: 0 };
  let logCounters = { parse: 0, send: 0, init: 0 };
  let timers = {
    chatIframeCheck: null,
    periodicCheck: null,
    debounceTimer: null
  };

  // === 状态标记 ===
  let flags = {
    periodicCheckRunning: false,
    eventSystemInitialized: false,
    hasPerformedInitialScan: false,
    isManualScanMode: false,
    isStreamThrottled: false
  };

  // === 数据缓存 ===
  let caches = {
    knownChatIds: new Set(),
    processedSystemMessages: new Set(),
    processedRecallMessages: new Set(),
    processedChoicePrompts: new Set(),
    lastValidChatContext: null,
    lastKnownChatId: null,
    pendingDataToSend: null
  };

  // === 🔥 优化：统一的日志管理器 ===
  const Logger = {
    info(message, ...args) {
      if (!CONFIG.SILENT_MODE) {
        console.log(`[聊天處理器] ${message}`, ...args);
      }
    },

    debug(message, ...args) {
      if (CONFIG.DEBUG_MODE) {
        console.log(`[聊天處理器] ${message}`, ...args);
      }
    },

    verbose(message, ...args) {
      if (CONFIG.VERBOSE_LOGGING) {
        console.log(`[聊天處理器] ${message}`, ...args);
      }
    },

    limited(type, message, ...args) {
      if (logCounters[type] < CONFIG.MAX_LOG_COUNT) {
        this.info(message, ...args);
        logCounters[type]++;
      } else if (logCounters[type] === CONFIG.MAX_LOG_COUNT) {
        this.info(`(${type}日志已限制...)`);
        logCounters[type]++;
      }
    },

    warn(message, ...args) {
      console.warn(`[聊天處理器] ${message}`, ...args);
    },

    error(message, error) {
      console.error(`[聊天處理器] ${message}`, error);
    },

    success(message, ...args) {
      if (!CONFIG.SILENT_MODE) {
        console.log(`[聊天處理器] ✅ ${message}`, ...args);
      }
    }
  };

  // 初始化日志
  Logger.success('V6.3已启动 (新格式支持版)');

  // === 🔥 优化：统一的 API 调用接口 ===
  const TavernAPI = {
    async call(method, ...args) {
      try {
        if (window.parent?.TavernHelper?.[method]) {
          return await window.parent.TavernHelper[method](...args);
        }
        throw new Error(`TavernHelper.${method} 不可用`);
      } catch (error) {
        Logger.debug(`API ${method} 调用失败:`, error);
        throw error;
      }
    },

    async getLastMessageId() {
      const currentTime = Date.now();
      if (currentTime - messageIdCache.time < CONFIG.MESSAGE_ID_CACHE_DURATION) {
        return messageIdCache.id;
      }
      
      const id = await this.call('getLastMessageId');
      messageIdCache = { id, time: currentTime };
      return id;
    },

    async getChatMessages(range, options = {}) {
      return await this.call('getChatMessages', range, options);
    },

    async createChatMessages(messages, options = {}) {
      return await this.call('createChatMessages', messages, options);
    }
  };

  // === 🔥 优化：清理和重置管理器 ===
  const StateManager = {
    forceResetAllStates() {
      Logger.debug('重置状态');
      
      chatData = { chatList: [], dmChats: {}, groupChats: {}, storyChats: {} };
      currentTavernMessageId = null;
      streamState.activeChatId = null;
      streamState.activeChatType = null;
      
      caches.lastValidChatContext = null;
      caches.lastKnownChatId = null;
      caches.processedSystemMessages.clear();
      caches.processedRecallMessages.clear();
      caches.processedChoicePrompts.clear();
      
      if (!flags.isManualScanMode) {
        caches.knownChatIds.clear();
      }
    },

    cleanup() {
      Logger.debug('清理资源');
      
      // 清理所有定时器
      Object.keys(timers).forEach(key => {
        if (timers[key]) {
          clearInterval(timers[key]);
          timers[key] = null;
        }
      });
      
      // 重置标记
      flags.periodicCheckRunning = false;
      flags.eventSystemInitialized = false;
      flags.hasPerformedInitialScan = false;
      
      // 清理缓存
      messageIdCache = { id: -1, time: 0 };
      Object.keys(logCounters).forEach(key => logCounters[key] = 0);
    }
  };

  // === 🔥 修正版：消息解析器 ===
  const MessageParser = {
    detectSpecialMessageTypes(content) {
      const specialTypes = [];
      
      // 检测撤回消息
      if (content.includes('[撤回|')) {
        const matches = content.match(/\[撤回\|([^\]]+)\]/g);
        if (matches) {
          matches.forEach(match => {
            specialTypes.push({ type: 'message_recall', content: match });
          });
        }
      }
      
      // 🔥 新增：检测旧格式的系统消息 [SYSTEM|...]
      if (content.includes('[SYSTEM|')) {
        const systemMatches = content.match(/\[SYSTEM\|([^\]]+)\]/g);
        if (systemMatches) {
          systemMatches.forEach(match => {
            specialTypes.push({ type: 'legacy_system_message', content: match });
          });
        }
      }
      
      // 🔥 新增：检测选择提示 <choice>...</choice>
      if (content.includes('<choice>')) {
        const choiceMatch = content.match(/<choice>([\s\S]*?)<\/choice>/);
        if (choiceMatch) {
          specialTypes.push({ type: 'choice_prompt', content: choiceMatch[1] });
        }
      }
      
      return specialTypes;
    },

    processSpecialMessages(specialMessages) {
      specialMessages.forEach(special => {
        const messageKey = `${special.type}_${special.content}`;
        
        // 处理撤回消息
        if (special.type === 'message_recall' && !caches.processedRecallMessages.has(messageKey)) {
          caches.processedRecallMessages.add(messageKey);
        }
        
        // 🔥 修正：处理旧格式的系统消息，只有在正确的 block 内才转换
        if (special.type === 'legacy_system_message' && !caches.processedSystemMessages.has(messageKey)) {
          // 🔥 關鍵修正：確保只在正確的 block 內才處理系統消息
          if (!streamState.activeChatId || streamState.activeChatId === 'Analysis') {
            Logger.warn(`跳過系統消息處理：activeChatId 不正確 (${streamState.activeChatId})`);
            return;
          }
          
          // 解析旧格式：[SYSTEM|内容]
          const systemRegex = /\[SYSTEM\|([^\]]+)\]/;
          const systemMatch = special.content.match(systemRegex);
          if (systemMatch) {
            const systemContent = systemMatch[1].trim();
            
            // 获取下一个消息ID
            const nextId = this.getNextSimpleMessageId();
            
            // 转换为新格式的系统消息
            const systemMessage = {
              id: nextId,
              sender: '系統',
              content: systemContent,
              type: 'system',
              date: Helpers.getCurrentDate(),
              time: Helpers.getCurrentTime(),
              status: '系统消息'
            };
            
            // 添加到当前消息流
            this.addMessageToActiveChat(systemMessage);
            
            Logger.verbose(`轉換舊系統消息: ${systemContent} -> ${streamState.activeChatId}`);
          }
          
          caches.processedSystemMessages.add(messageKey);
        }
        
        // 🔥 新增：处理选择提示
        if (special.type === 'choice_prompt' && !caches.processedChoicePrompts.has(messageKey)) {
          // 解析选择提示内容
          const choiceLines = special.content.split('\n').filter(line => line.trim());
          const choices = [];
          
          choiceLines.forEach(line => {
            const choiceMatch = line.match(/^#(\d+)\|(.+)$/);
            if (choiceMatch) {
              const choiceNumber = choiceMatch[1];
              const choiceText = choiceMatch[2].trim();
              choices.push({
                number: choiceNumber,
                text: choiceText
              });
            }
          });
          
          if (choices.length > 0) {
            // 发送选择提示到聊天面板
            DataSender.sendChoicePromptToPanel(choices);
            Logger.verbose(`解析选择提示: ${choices.length} 个选项`);
          }
          
          caches.processedChoicePrompts.add(messageKey);
        }
      });
    },

    addMessageToActiveChat(message) {
      // 🔥 關鍵修正：嚴格檢查 activeChatId 是否有效
      if (!streamState.activeChatId || !streamState.activeChatType) {
        Logger.warn(`無法添加消息：activeChatId 或 activeChatType 無效 (${streamState.activeChatId}, ${streamState.activeChatType})`);
        return;
      }
      
      // 🔥 額外檢查：確保 activeChatId 不是特殊值
      if (streamState.activeChatId === 'Analysis' || streamState.activeChatId === 'unknown') {
        Logger.warn(`跳過消息添加：activeChatId 為特殊值 (${streamState.activeChatId})`);
        return;
      }
      
      let chatHistory;
      if (streamState.activeChatType === 'dm') {
        chatHistory = chatData.dmChats[streamState.activeChatId];
      } else if (streamState.activeChatType === 'story') {
        chatHistory = chatData.storyChats[streamState.activeChatId];
      } else {
        chatHistory = chatData.groupChats[streamState.activeChatId];
      }
        
      if (chatHistory) {
        chatHistory.messages.push(message);
        Logger.verbose(`添加消息到聊天 ${streamState.activeChatId} (${streamState.activeChatType}): ${message.sender}`);
      } else {
        Logger.warn(`找不到聊天歷史：${streamState.activeChatId} (${streamState.activeChatType})`);
      }
    },

    parseStreamIncrementally(fullStreamContent) {
      Logger.limited('parse', `解析内容: ${fullStreamContent.substring(0, 50)}...`);
      
      let hasNewData = false;
      const lines = fullStreamContent.split('\n');

      // 🔥 修正：先處理 block 標籤和聊天標頭，確保 activeChatId 正確
      for (const line of lines) {
        if (this.processMessageLine(line.trim())) {
          hasNewData = true;
        }
      }

      // 🔥 修正：只有在 activeChatId 正確設置後，才處理特殊消息
      const specialMessages = this.detectSpecialMessageTypes(fullStreamContent);
      if (specialMessages.length > 0 && streamState.activeChatId && streamState.activeChatId !== 'Analysis') {
        this.processSpecialMessages(specialMessages);
        hasNewData = true;
      }
      
      Logger.verbose(`解析完成, 有新数据: ${hasNewData}`);
      return hasNewData;
    },

    processMessageLine(trimmedLine) {
      if (!trimmedLine) return false;
    
      // 🔥 新格式：处理聊天头部格式 [Chat|dm_6|陳彥庭⇆方亦楷]
      const chatMetaMatch = trimmedLine.match(/\[Chat\|(.+?)\]/i);
      if (chatMetaMatch) {
        return this.processChatHeader(chatMetaMatch[1]);
      }
    
      // 🔥 新格式：处理消息内容 [1|dm_6|陳彥庭|我想養貓|18:47]
      if (trimmedLine.startsWith('[') && trimmedLine.includes('|') && trimmedLine.endsWith(']')) {
        return this.parseMessageContent(trimmedLine);
      }
    
      return false;
    },

    setActiveChatContext(chatId) {
      streamState.activeChatId = chatId;
      
      // 识别聊天类型
      if (chatId.startsWith('story_list_')) {
        streamState.activeChatType = 'story';
      } else if (chatId.startsWith('group_')) {
        streamState.activeChatType = 'group_chat';
      } else {
        streamState.activeChatType = 'dm';
      }
      
      caches.knownChatIds.add(chatId);
      
      caches.lastValidChatContext = { 
        id: chatId, 
        type: streamState.activeChatType, 
        name: chatData.chatList.find(c => c.id === chatId)?.name || '未知'
      };
      
      Logger.debug(`设置活跃聊天: ${chatId} (类型: ${streamState.activeChatType})`);
    },

    // 🔥 修正版：正确处理不同格式的聊天头部
    processChatHeader(headerContent) {
      const parts = headerContent.split('|').map(p => p.trim());
      
      if (parts.length < 2) {
        Logger.warn('聊天头部格式错误:', headerContent);
        return false;
      }
      
      const listId = parts[0];
      let chatType, chatName, participantsInfo = '';
      let adminInfo = null; // 🔥 新增：admin信息
      
      // 根据ID前缀确定聊天类型
      if (listId.startsWith('story_list_')) {
        // 故事聊天室格式：[Chat|story_list_1|POV角色名]
        chatType = 'story';
        chatName = parts[1]; // 直接使用POV角色名作为聊天室名称
        participantsInfo = '';
      } else if (listId.startsWith('group_')) {
        // 🔥 修正：群聊格式：[Chat|groupId|groupName|adminName|members] 或 [Chat|groupId|groupName|adminName|members]
        chatType = 'group_chat';
        
        // 🔥 修正：檢查是否有4個部分（新格式）
        if (parts.length >= 4) {
          // 新格式：[Chat|groupId|groupName|adminName|members]
          chatName = parts[1]; // 群組名稱
          adminInfo = parts[2]; // 群組創建者
          const members = parts.length > 3 ? parts[3] : '';
          participantsInfo = `${adminInfo}|${members}`;
        } else if (parts.length >= 3) {
          // 舊格式：[Chat|group_1|群组名称|管理员|成员1,成员2,...]
          chatName = parts[1]; // 群组名称
          const admin = parts[2];
          const members = parts.length > 3 ? parts.slice(3).join('|') : '';
          participantsInfo = `${admin}|${members}`;
          adminInfo = admin; // 🔥 新增：提取admin信息
        } else {
          // 兼容其他格式
          chatName = parts[1] || '';
          adminInfo = '';
          participantsInfo = '';
        }
      } else {
        // 私聊格式：[Chat|dm_1|chatName|participantsInfo] 或 [Chat|dm_1|participantsInfo]
        chatType = 'dm';
        
        // 🔥 修正：檢查是否有4個部分（新格式）
        if (parts.length >= 4) {
          // 新格式：[Chat|dm_1|chatName|participantsInfo]
          chatName = parts[1]; // 聊天名稱
          participantsInfo = parts[2]; // 參與者信息
        } else if (parts.length >= 3) {
          // 舊格式：[Chat|dm_1|participantsInfo]
          if (parts[1].includes('⇆')) {
            chatName = parts[1]; // 參與者信息作為聊天名稱
            participantsInfo = parts[1]; // 參與者信息
          } else {
            chatName = parts[1];
            participantsInfo = parts[1];
          }
        } else {
          // 兼容其他格式
          chatName = parts[1] || '';
          participantsInfo = parts[1] || '';
        }
      }
      
      // 🔥 新增：私聊ID映射檢查，避免創建重複的聊天室
      if (chatType === 'dm' && window.privateChatIdMap) {
        // 🔥 修正：使用 participantsInfo 來解析參與者，而不是 chatName
        let participant1, participant2;
        
        if (participantsInfo && participantsInfo.includes('⇆')) {
          // 使用 participantsInfo 參數
          const participants = participantsInfo.split('⇆');
          participant1 = participants[0]?.trim();
          participant2 = participants[1]?.trim();
        } else if (chatName && chatName.includes('⇆')) {
          // 兼容舊格式：從 chatName 解析
          const participants = chatName.split('⇆');
          participant1 = participants[0]?.trim();
          participant2 = participants[1]?.trim();
        } else {
          // 如果都沒有，無法進行映射檢查
          console.log('[私聊標頭處理] 無法解析參與者信息，跳過映射檢查');
        }
        
        if (participant1 && participant2) {
          const key1 = `${participant1}⇆${participant2}`;
          const key2 = `${participant2}⇆${participant1}`;
          
          // 檢查是否有現有的私聊ID映射
          const existingChatId = window.privateChatIdMap[key1] || window.privateChatIdMap[key2];
          
          if (existingChatId && existingChatId !== listId) {
            console.log(`[私聊標頭處理] 發現現有私聊ID映射: ${key1} → ${existingChatId}`);
            console.log(`[私聊標頭處理] 使用現有ID而不是新ID: ${listId} → ${existingChatId}`);
            
            // 使用現有的ID而不是新的ID
            this.setActiveChatContext(existingChatId);
            ChatManager.updateChatList(existingChatId, chatType, chatName, participantsInfo);
            ChatManager.initializeChatHistory(existingChatId, chatType, chatName, participantsInfo, adminInfo);
            
            const isNewChat = !caches.knownChatIds.has(existingChatId);
            if (isNewChat) {
              DataSender.sendEmptyChatToPanel(existingChatId, chatType, chatName);
            }
            
            Logger.debug(`处理聊天头部(使用現有ID): ${existingChatId} | 类型: ${chatType} | 名称: ${chatName}`);
            return true;
          }
        }
      }
      
      // 🔥 新增：群聊ID映射檢查，避免創建重複的聊天室
      if (chatType === 'group_chat' && window.groupChatIdMap && adminInfo && chatName) {
        const key = `${chatName}⇆${adminInfo}`;
        
        // 檢查是否有現有的群聊ID映射
        const existingChatId = window.groupChatIdMap[key];
        
        if (existingChatId && existingChatId !== listId) {
          console.log(`[群聊標頭處理] 發現現有群聊ID映射: ${key} → ${existingChatId}`);
          console.log(`[群聊標頭處理] 使用現有ID而不是新ID: ${listId} → ${existingChatId}`);
          
          // 使用現有的ID而不是新的ID
          this.setActiveChatContext(existingChatId);
          ChatManager.updateChatList(existingChatId, chatType, chatName, participantsInfo);
          ChatManager.initializeChatHistory(existingChatId, chatType, chatName, participantsInfo, adminInfo);
          
          // 🔥 修正：確保群聊信息得到保留
          if (chatType === 'group_chat') {
            const existingGroupInfo = chatData.chatList.find(chat => chat.id === existingChatId && chat.type === 'group');
            if (existingGroupInfo && chatData.groupChats[existingChatId]) {
              // 保留原有的群組信息
              chatData.groupChats[existingChatId] = {
                ...chatData.groupChats[existingChatId],
                groupAvatar: existingGroupInfo.groupAvatar,
                adminAvatar: existingGroupInfo.adminAvatar,
                members: existingGroupInfo.members,
                isPreset: existingGroupInfo.isPreset
              };
              console.log(`[群聊標頭處理] 已保留群組信息: hasGroupAvatar=${!!existingGroupInfo.groupAvatar}`);
            }
          }
          
          const isNewChat = !caches.knownChatIds.has(existingChatId);
          if (isNewChat) {
            DataSender.sendEmptyChatToPanel(existingChatId, chatType, chatName);
          }
          
          Logger.debug(`处理群聊头部(使用現有ID): ${existingChatId} | 类型: ${chatType} | 名称: ${chatName}`);
          return true;
        }
      }
      
      this.setActiveChatContext(listId);
      ChatManager.updateChatList(listId, chatType, chatName, participantsInfo);
      // 🔥 修复：传递admin信息和participantsInfo
      console.log('[處理器] 調用 initializeChatHistory:', { listId, chatType, chatName, participantsInfo, adminInfo });
      ChatManager.initializeChatHistory(listId, chatType, chatName, participantsInfo, adminInfo);
      
      const isNewChat = !caches.knownChatIds.has(listId);
      if (isNewChat) {
        DataSender.sendEmptyChatToPanel(listId, chatType, chatName);
      }
      
      Logger.debug(`处理聊天头部: ${listId} | 类型: ${chatType} | 名称: ${chatName} | participantsInfo: ${participantsInfo} | admin: ${adminInfo}`);
      return true;
    },
      
    parseMessageContent(trimmedLine) {
      // 🔥 新格式：处理 [1|dm_6|陳彥庭|我想養貓] 格式（无时间）
      // 去掉开头和结尾的方括号
      const contentWithoutBrackets = trimmedLine.slice(1, -1);
      
      // 🔥 新增：獨立處理引用消息格式
      if (contentWithoutBrackets.includes('[引用:')) {
        Logger.debug('🔥 檢測到引用消息格式，開始獨立解析:', contentWithoutBrackets);
        return this.parseQuoteMessage(trimmedLine);
      }
      
      const parts = contentWithoutBrackets.split('|').map(p => p.trim());
      
      // 最新格式：ID|chatId|sender|content (4个字段，无时间)
      if (parts.length === 4) {
        return this.parseNewFormatMessage(parts);
      }
      // 兼容格式：ID|chatId|sender|content|time (5个字段)
      else if (parts.length === 5) {
        return this.parseOldFormatMessage(parts);
      }
      // 兼容格式：ID|chatId|sender|content|time|status (6个字段)
      else if (parts.length === 6) {
        return this.parseVeryOldFormatMessage(parts);
      }
      // 兼容更旧格式 (7个字段)
      else if (parts.length >= 7) {
        return this.parseVeryOldFormatMessage(parts);
      }
      
      Logger.debug(`无法识别的消息格式 (${parts.length}字段): ${trimmedLine}`);
      return false;
    },

    // 🔥 新增：獨立解析引用消息
    parseQuoteMessage(trimmedLine) {
      Logger.debug('🔥 開始獨立解析引用消息:', trimmedLine);
      
      // 去掉开头和结尾的方括号
      const contentWithoutBrackets = trimmedLine.slice(1, -1);
      
      // 引用消息格式：ID|chatId|sender|[引用: 引用內容] | 回應內容
      // 需要特殊處理，因為內容中包含 | 分隔符
      const firstPipeIndex = contentWithoutBrackets.indexOf('|');
      const secondPipeIndex = contentWithoutBrackets.indexOf('|', firstPipeIndex + 1);
      const thirdPipeIndex = contentWithoutBrackets.indexOf('|', secondPipeIndex + 1);
      
      if (firstPipeIndex === -1 || secondPipeIndex === -1 || thirdPipeIndex === -1) {
        Logger.warn('🔥 引用消息格式錯誤，無法找到足夠的分隔符:', contentWithoutBrackets);
        return false;
      }
      
      const msgId = contentWithoutBrackets.substring(0, firstPipeIndex).trim();
      const chatId = contentWithoutBrackets.substring(firstPipeIndex + 1, secondPipeIndex).trim();
      const sender = contentWithoutBrackets.substring(secondPipeIndex + 1, thirdPipeIndex).trim();
      const content = contentWithoutBrackets.substring(thirdPipeIndex + 1).trim();
      
      Logger.debug('🔥 引用消息解析結果:', { msgId, chatId, sender, content });
      
      // 創建消息對象
      const msgObject = {
        id: msgId,
        chatId: chatId,
        sender: sender,
        content: content,
        type: 'quote', // 直接設置為引用類型
        time: Helpers.getCurrentTime(),
        date: Helpers.getCurrentDate()
      };
      
      // 🔥 新增：動態更新 protagonistName
      updateProtagonistName();
      
      // 🔥 新增：設置 isProtagonist 字段，與 parseNewFormatMessage 保持一致
      Logger.debug('🔥 引用消息主角判斷開始:', {
        sender: sender,
        protagonistName: protagonistName,
        activeChatType: streamState.activeChatType,
        activeChatId: streamState.activeChatId,
        chatDataKeys: chatData ? Object.keys(chatData) : null
      });
      
      Logger.debug('🔥 引用消息主角判斷詳細信息:', {
        sender: sender,
        protagonistName: protagonistName,
        senderEqualsProtagonist: sender === protagonistName,
        senderLength: sender ? sender.length : 0,
        protagonistNameLength: protagonistName ? protagonistName.length : 0
      });
      
      if ((streamState.activeChatType === 'group' || streamState.activeChatType === 'group_chat') && streamState.activeChatId) {
        const groupChat = chatData.groupChats[streamState.activeChatId];
        Logger.debug('🔥 引用消息群聊信息:', {
          groupChat: groupChat,
          admin: groupChat?.admin,
          groupChatKeys: groupChat ? Object.keys(groupChat) : null
        });
        
        if (groupChat && groupChat.admin) {
          msgObject.isProtagonist = sender === groupChat.admin;
          Logger.debug('🔥 引用消息群聊主角判斷:', {
            sender: sender,
            admin: groupChat.admin,
            isProtagonist: msgObject.isProtagonist
          });
        } else {
          msgObject.isProtagonist = sender === protagonistName;
          Logger.debug('🔥 引用消息群聊使用全局用戶名:', {
            sender: sender,
            protagonistName: protagonistName,
            isProtagonist: msgObject.isProtagonist
          });
        }
      } else {
        msgObject.isProtagonist = sender === protagonistName;
        Logger.debug('🔥 引用消息非群聊使用全局用戶名:', {
          sender: sender,
          protagonistName: protagonistName,
          isProtagonist: msgObject.isProtagonist
        });
      }
      
      // 🔥 直接處理引用消息內容
      this.processQuoteMessage(msgObject);
      
      // 添加到聊天歷史
      return this.addParsedMessage(msgObject);
    },

    parseNewFormatMessage(parts) {
      const msgId = parts[0];
      const chatId = parts[1];
      const sender = parts[2];
      const content = parts[3];
      // 新格式没有时间字段，使用当前时间
      const time = Helpers.getCurrentTime();
      
      // 🔥 新格式：从内容自动识别类型
      let type = 'none';
      if (content.includes('[photo:')) type = 'photo';
      else if (content.includes('[voice:')) type = 'voice';
      else if (content.includes('[video:')) type = 'video';
      else if (content.includes('[file:')) type = 'file';
      else if (content.includes('[sticker:')) type = 'sticker';
      else if (content.includes('[location:')) type = 'location';
      else if (content.includes('[call_invitation:')) type = 'call_invitation';
      else if (content.includes('[call_accept:')) type = 'call_accept';
      else if (content.includes('[call_decline:')) type = 'call_decline';
      else if (content.includes('[call_ended:')) type = 'call_ended';
      else if (content.includes('[call:')) type = 'call';
      else if (content.includes('[meeting:')) type = 'meeting';
      else if (content.includes('[poll:')) type = 'poll';
      else if (content.includes('[scene:')) type = 'scene';
      else if (content.includes('[letter:')) type = 'letter';
      else if (content.includes('[system:')) type = 'text';
      else if (content.includes('[transfer:')) type = 'transfer';
      else if (content.includes('[transfer_response:')) type = 'transfer_response';
      else if (content.includes('[gift_response:')) type = 'gift_response';
      else if (content.includes('[gift:')) type = 'gift';
      else if (content.includes('[引用:')) type = 'quote'; // 🔥 新增：引用消息類型識別
      else if (content.includes('🧧') && /🧧[0-9.]+/.test(content)) type = 'red_envelope';
      else if (sender === '系统' || sender === '系統') type = 'text';
      else if (sender === '劇情') type = 'scene';
      
      // 🔥 调试信息：剧情消息识别
      if (type === 'scene' && CONFIG.DEBUG_MODE) {
              console.log('[消息解析器] 新格式识别为剧情消息:', msgId);
      console.log('[消息解析器] 剧情内容长度:', content.length);
    }
    
    // 🔥 关键：设置活跃聊天上下文
    if (chatId && chatId !== streamState.activeChatId) {
      // 🔥 新增：私聊識別邏輯，確保找到正確的私聊
      if (streamState.activeChatType === 'dm' || streamState.activeChatType === 'dm_chat') {
        // 檢查是否為私聊，如果是，嘗試找到正確的私聊ID
        const currentDmChat = chatData.dmChats[streamState.activeChatId];
        if (currentDmChat && currentDmChat.participant1 && currentDmChat.participant2) {
          // 檢查新消息的發送者是否為當前私聊的參與者
          if (sender === currentDmChat.participant1 || sender === currentDmChat.participant2) {
            console.log(`[私聊識別] 保持當前私聊: ${streamState.activeChatId} (${currentDmChat.participant1}⇆${currentDmChat.participant2})`);
            // 保持當前私聊，不切換
          } else {
            // 🔥 新增：檢查是否有私聊ID映射
            const participantsKey1 = `${currentDmChat.participant1}⇆${currentDmChat.participant2}`;
            const participantsKey2 = `${currentDmChat.participant2}⇆${currentDmChat.participant1}`;
            const mappedChatId = window.privateChatIdMap?.[participantsKey1] || window.privateChatIdMap?.[participantsKey2];
            
            if (mappedChatId && mappedChatId !== chatId) {
              console.log(`[私聊ID映射] 使用映射ID: ${chatId} → ${mappedChatId}`);
              // 使用映射的ID而不是新生成的ID
              chatId = mappedChatId;
            } else {
              this.setActiveChatContext(chatId);
            }
          }
        } else {
          this.setActiveChatContext(chatId);
        }
      } else {
        this.setActiveChatContext(chatId);
      }
    }
      
      // ⭐ 重要修复：在创建消息对象时就设置正确的 isProtagonist
      let isProtagonist = false;
      
      // 🔥 修复：根据聊天类型判断是否为主角消息
      if ((streamState.activeChatType === 'group' || streamState.activeChatType === 'group_chat') && streamState.activeChatId) {
        const groupChat = chatData.groupChats[streamState.activeChatId];
        if (groupChat && groupChat.admin) {
          isProtagonist = sender === groupChat.admin;
          console.log('[消息解析器] 群聊主角判断:', {
            sender: sender,
            admin: groupChat.admin,
            isProtagonist: isProtagonist
          });
        } else {
          isProtagonist = sender === protagonistName;
          console.log('[消息解析器] 群聊使用全局用户名:', {
            sender: sender,
            protagonistName: protagonistName,
            isProtagonist: isProtagonist
          });
        }
      } else if ((streamState.activeChatType === 'dm' || streamState.activeChatType === 'dm_chat') && streamState.activeChatId) {
        // 🆕 私聊模式：使用私聊參與者信息
        const dmChat = chatData.dmChats[streamState.activeChatId];
        if (dmChat && dmChat.participant1) {
          // 🔥 修正：如果 participant1 是占位符，從私聊設置中獲取實際用戶名
          let actualParticipant1 = dmChat.participant1;
          if (dmChat.participant1 === '{{user}}') {
            actualParticipant1 = getPrivateChatActualUserName(streamState.activeChatId) || dmChat.participant1;
          }
          
          isProtagonist = sender === actualParticipant1;
          console.log('[消息解析器] 私聊主角判断:', {
            sender: sender,
            participant1: dmChat.participant1,
            actualParticipant1: actualParticipant1,
            participant2: dmChat.participant2,
            isProtagonist: isProtagonist
          });
        } else {
          isProtagonist = sender === protagonistName;
          console.log('[消息解析器] 私聊使用全局用户名:', {
            sender: sender,
            protagonistName: protagonistName,
            isProtagonist: isProtagonist
          });
        }
      } else {
        isProtagonist = sender === protagonistName;
        console.log('[消息解析器] 其他聊天使用全局用户名:', {
          sender: sender,
          protagonistName: protagonistName,
          isProtagonist: isProtagonist
        });
      }
      
      const msgObject = { 
        id: msgId, 
        sender: sender, 
        content: content, 
        type: type, 
        date: Helpers.getCurrentDate(), 
        time: time, 
        status: '已读',
        isProtagonist: isProtagonist,  // ⭐ 关键：设置 isProtagonist 字段
        tavernMessageId: msgId  // 🔥 新增：设置酒馆AI消息ID
      };
      
      console.log('[消息解析器] 创建消息对象:', {
        id: msgId,
        sender: sender,
        isProtagonist: isProtagonist,
        chatId: chatId
      });
      
      return this.addParsedMessage(msgObject);
    },



    parseOldFormatMessage(parts) {
      const msgId = parts[0];
      const chatId = parts[1];
      const sender = parts[2];
      const content = parts[3];
      const time = parts[4];
      // 5字段格式没有status，使用默认值
      const status = '已读';
      
      // 🔥 关键：设置活跃聊天上下文
      if (chatId && chatId !== streamState.activeChatId) {
        // 🔥 新增：私聊識別邏輯，確保找到正確的私聊
        if (streamState.activeChatType === 'dm' || streamState.activeChatType === 'dm_chat') {
          // 檢查是否為私聊，如果是，嘗試找到正確的私聊ID
          const currentDmChat = chatData.dmChats[streamState.activeChatId];
          if (currentDmChat && currentDmChat.participant1 && currentDmChat.participant2) {
            // 檢查新消息的發送者是否為當前私聊的參與者
            if (sender === currentDmChat.participant1 || sender === currentDmChat.participant2) {
              console.log(`[私聊識別] 保持當前私聊: ${streamState.activeChatId} (${currentDmChat.participant1}⇆${currentDmChat.participant2})`);
              // 保持當前私聊，不切換
            } else {
              this.setActiveChatContext(chatId);
            }
          } else {
            this.setActiveChatContext(chatId);
          }
        } else {
          this.setActiveChatContext(chatId);
        }
      }
      
      // ⭐ 重要修复：设置正确的 isProtagonist
      let isProtagonist = false;
      
      if ((streamState.activeChatType === 'group' || streamState.activeChatType === 'group_chat') && streamState.activeChatId) {
        const groupChat = chatData.groupChats[streamState.activeChatId];
        if (groupChat && groupChat.admin) {
          isProtagonist = sender === groupChat.admin;
        } else {
          isProtagonist = sender === protagonistName;
        }
      } else if ((streamState.activeChatType === 'dm' || streamState.activeChatType === 'dm_chat') && streamState.activeChatId) {
        // 🆕 私聊模式：使用私聊參與者信息
        const dmChat = chatData.dmChats[streamState.activeChatId];
        if (dmChat && dmChat.participant1) {
          // 🔥 修正：如果 participant1 是占位符，從私聊設置中獲取實際用戶名
          let actualParticipant1 = dmChat.participant1;
          if (dmChat.participant1 === '{{user}}') {
            actualParticipant1 = getPrivateChatActualUserName(streamState.activeChatId) || dmChat.participant1;
          }
          
          isProtagonist = sender === actualParticipant1;
        } else {
          isProtagonist = sender === protagonistName;
        }
      } else {
        isProtagonist = sender === protagonistName;
      }
      
      const msgObject = { 
        id: msgId, 
        sender: sender, 
        content: content, 
        type: 'none', 
        date: Helpers.getCurrentDate(), 
        time: time, 
        status: status,
        isProtagonist: isProtagonist,  // ⭐ 关键：设置 isProtagonist 字段
        tavernMessageId: msgId  // 🔥 新增：设置酒馆AI消息ID
      };
      
      return this.addParsedMessage(msgObject);
    },

    parseVeryOldFormatMessage(parts) {
      const msgId = parts[0];
      const chatId = parts[1];
      const sender = parts[2];
      const content = parts[3];
      const time = parts[4];
      const status = parts[5] || '已读';
      
      // 🔥 关键：设置活跃聊天上下文
      if (chatId && chatId !== streamState.activeChatId) {
        // 🔥 新增：私聊識別邏輯，確保找到正確的私聊
        if (streamState.activeChatType === 'dm' || streamState.activeChatType === 'dm_chat') {
          // 檢查是否為私聊，如果是，嘗試找到正確的私聊ID
          const currentDmChat = chatData.dmChats[streamState.activeChatId];
          if (currentDmChat && currentDmChat.participant1 && currentDmChat.participant2) {
            // 檢查新消息的發送者是否為當前私聊的參與者
            if (sender === currentDmChat.participant1 || sender === currentDmChat.participant2) {
              console.log(`[私聊識別] 保持當前私聊: ${streamState.activeChatId} (${currentDmChat.participant1}⇆${currentDmChat.participant2})`);
              // 保持當前私聊，不切換
            } else {
              this.setActiveChatContext(chatId);
            }
          } else {
            this.setActiveChatContext(chatId);
          }
        } else {
          this.setActiveChatContext(chatId);
        }
      }
      
      // ⭐ 重要修复：设置正确的 isProtagonist
      let isProtagonist = false;
      
      if ((streamState.activeChatType === 'group' || streamState.activeChatType === 'group_chat') && streamState.activeChatId) {
        const groupChat = chatData.groupChats[streamState.activeChatId];
        if (groupChat && groupChat.admin) {
          isProtagonist = sender === groupChat.admin;
        } else {
          isProtagonist = sender === protagonistName;
        }
      } else if ((streamState.activeChatType === 'dm' || streamState.activeChatType === 'dm_chat') && streamState.activeChatId) {
        // 🆕 私聊模式：使用私聊參與者信息
        const dmChat = chatData.dmChats[streamState.activeChatId];
        if (dmChat && dmChat.participant1) {
          // 🔥 修正：如果 participant1 是占位符，從私聊設置中獲取實際用戶名
          let actualParticipant1 = dmChat.participant1;
          if (dmChat.participant1 === '{{user}}') {
            actualParticipant1 = getPrivateChatActualUserName(streamState.activeChatId) || dmChat.participant1;
          }
          
          isProtagonist = sender === actualParticipant1;
        } else {
          isProtagonist = sender === protagonistName;
        }
      } else {
        isProtagonist = sender === protagonistName;
      }
      
      const msgObject = { 
        id: msgId, 
        sender: sender, 
        content: content, 
        type: 'none', 
        date: Helpers.getCurrentDate(), 
        time: time, 
        status: status,
        isProtagonist: isProtagonist,  // ⭐ 关键：设置 isProtagonist 字段
        tavernMessageId: msgId  // 🔥 新增：设置酒馆AI消息ID
      };
      
      return this.addParsedMessage(msgObject);
    },

    addParsedMessage(msgObject) {
      // 1. 如果是時間系統消息，更新全局劇情時間
      if (
        msgObject.sender === '時間' &&
        typeof msgObject.content === 'string' &&
        msgObject.content.startsWith('[date:')
      ) {
        const match = msgObject.content.match(/\[date:([0-9\-]+)\s*time:([0-9:]+)\]/);
        if (match) {
          currentStoryDate = match[1];
          currentStoryTime = match[2];
          Logger.debug(`更新劇情時間: ${currentStoryDate} ${currentStoryTime}`);
        }
        // 時間系統消息也要添加到聊天歷史中，讓前端能顯示
      }
    
      // 2. 其他消息如果沒帶時間，賦值為當前劇情時間
      if (!msgObject.date) msgObject.date = currentStoryDate || Helpers.getCurrentDate();
      if (!msgObject.time) msgObject.time = currentStoryTime || Helpers.getCurrentTime();
    
      let chatHistory;
      if (streamState.activeChatType === 'dm') {
        chatHistory = chatData.dmChats[streamState.activeChatId];
      } else if (streamState.activeChatType === 'story') {
        chatHistory = chatData.storyChats[streamState.activeChatId];
      } else {
        chatHistory = chatData.groupChats[streamState.activeChatId];
      }
      
      if (!chatHistory) return false;
      
      // 檢測特殊消息類型
      if (msgObject.content?.includes('[transfer:')) {
        msgObject.type = 'transfer';
      } else if (msgObject.content?.includes('[transfer_response:')) {
        msgObject.type = 'transfer_response';
        // 處理轉賬回應
        this.processTransferResponse(msgObject);
      } else if (msgObject.content?.includes('[gift_response:')) {
        msgObject.type = 'gift_response';
        // 處理禮物回應
        this.processGiftResponse(msgObject);
      } else if (msgObject.content?.includes('[gift:')) {
        msgObject.type = 'gift';
      } else if (msgObject.content?.includes('[引用:')) {
        msgObject.type = 'quote';
        // 🔥 新增：處理引用消息，解析引用內容和回應內容
        Logger.debug('🔥 開始處理引用消息:', msgObject.content);
        this.processQuoteMessage(msgObject);
        Logger.debug('🔥 引用消息處理完成，displayContent:', msgObject.displayContent);
      } else if (msgObject.content?.includes('🧧') && /🧧[0-9.]+/.test(msgObject.content)) {
        msgObject.type = 'red_envelope';
      }
      
      // 检查是否为重复消息
      const isDuplicate = chatHistory.messages.some(existingMsg => {
        return existingMsg.id === msgObject.id;
      });
      
      if (isDuplicate) {
        Logger.verbose(`跳过重复消息: ${msgObject.id}`);
        return false;
      }
      
      // ✅ 新增：在添加消息时就计算未读数字
      const isUserMessage = this.isMessageFromUser(msgObject.sender);
      const chatId = streamState.activeChatId;
      
      // ⭐ 重要修复：只有在消息对象没有 isProtagonist 字段时才设置
      if (!msgObject.hasOwnProperty('isProtagonist')) {
        // 🔥 新增：動態更新 protagonistName
        updateProtagonistName();
        
        console.log('[處理器] 消息缺少 isProtagonist 字段，开始设置:', {
          activeChatType: streamState.activeChatType,
          activeChatId: streamState.activeChatId,
          sender: msgObject.sender,
          protagonistName: protagonistName
        });
        
        if ((streamState.activeChatType === 'group' || streamState.activeChatType === 'group_chat') && streamState.activeChatId) {
          const groupChat = chatData.groupChats[streamState.activeChatId];
          console.log('[處理器] 群聊信息:', {
            groupChat: groupChat,
            admin: groupChat?.admin,
            groupChatKeys: groupChat ? Object.keys(groupChat) : null,
            fullGroupChat: groupChat
          });
          
          if (groupChat && groupChat.admin) {
            msgObject.isProtagonist = msgObject.sender === groupChat.admin;
            console.log('[處理器] 群聊主角判斷:', {
              sender: msgObject.sender,
              admin: groupChat.admin,
              isProtagonist: msgObject.isProtagonist
            });
          } else {
            msgObject.isProtagonist = msgObject.sender === protagonistName;
            console.log('[處理器] 群聊使用全局用戶名:', {
              sender: msgObject.sender,
              protagonistName: protagonistName,
              isProtagonist: msgObject.isProtagonist
            });
          }
        } else {
          msgObject.isProtagonist = msgObject.sender === protagonistName;
          console.log('[處理器] 非群聊使用全局用戶名:', {
            sender: msgObject.sender,
            protagonistName: protagonistName,
            isProtagonist: msgObject.isProtagonist
          });
        }
      } else {
        console.log('[處理器] 消息已有 isProtagonist 字段，保持不变:', {
          sender: msgObject.sender,
          isProtagonist: msgObject.isProtagonist,
          chatId: streamState.activeChatId
        });
      }
      
      // 添加消息到聊天历史
      chatHistory.messages.push(msgObject);
      
      // ✅ 关键：如果不是用户消息，增加未读计数
      if (!isUserMessage && chatId) {
        this.updateUnreadCount(chatId, msgObject.time);
        Logger.debug(`未读计数+1: ${chatId}, 发送者: ${msgObject.sender}, 消息时间: ${msgObject.time}`);
        
        // 🔥 新增：顯示當前未讀計數狀態
        if (this.unreadCounts && this.unreadCounts[chatId]) {
          Logger.debug(`聊天室 ${chatId} 當前未讀計數: ${this.unreadCounts[chatId].count}`);
        }
      } else {
        Logger.debug(`不增加未读计数: ${chatId}, 发送者: ${msgObject.sender}, 是否用户消息: ${isUserMessage}`);
      }
      
      // 🔥 新增：添加消息後保存到localStorage
      try {
        if (streamState.activeChatType === 'dm') {
          localStorage.setItem('dm_chats', JSON.stringify(chatData.dmChats));
        } else if (streamState.activeChatType === 'story') {
          localStorage.setItem('story_chats', JSON.stringify(chatData.storyChats));
        } else {
          localStorage.setItem('group_chats', JSON.stringify(chatData.groupChats));
        }
        Logger.debug(`消息已保存到localStorage: ${streamState.activeChatId}`);
      } catch (error) {
        Logger.error('保存消息到localStorage失敗:', error);
      }
      
      Logger.verbose(`添加消息到活跃聊天 ${streamState.activeChatId}: ${msgObject.sender}`);
      return true;
    },

    // 🔥 新增：處理引用消息，解析引用內容和回應內容
    processQuoteMessage(msgObject) {
      try {
        const content = msgObject.content;
        
                // 解析引用格式：[引用: 引用內容] | 回應內容
        Logger.debug('🔥 開始解析引用消息:', content);
        Logger.debug('🔥 消息內容長度:', content.length);
        Logger.debug('🔥 消息內容字符編碼:', Array.from(content).map(c => c.charCodeAt(0)));
        
        const quoteMatch = content.match(/\[引用:\s*([^\]]+)\]\s*\|\s*(.+)/);
        Logger.debug('第一個正則匹配結果:', quoteMatch);
        
        // 🔥 修正：如果第一個正則失敗，嘗試更寬鬆的匹配
        let fallbackMatch = null;
        if (!quoteMatch) {
            fallbackMatch = content.match(/\[引用:\s*([^\]]+)\].*?\|\s*(.+)/);
            Logger.debug('備用正則匹配結果:', fallbackMatch);
            if (fallbackMatch) {
                Logger.debug('使用備用正則匹配引用消息:', fallbackMatch);
            }
        }
        
        // 🔥 新增：如果還是失敗，嘗試最寬鬆的匹配
        let ultraFallbackMatch = null;
        if (!quoteMatch && !fallbackMatch) {
            ultraFallbackMatch = content.match(/\[引用:\s*([^\]]+)\].*?\|(.*)/);
            Logger.debug('超寬鬆正則匹配結果:', ultraFallbackMatch);
            if (ultraFallbackMatch) {
                Logger.debug('使用超寬鬆正則匹配引用消息:', ultraFallbackMatch);
            }
        }
        
        const finalMatch = quoteMatch || fallbackMatch || ultraFallbackMatch;
        if (finalMatch) {
            const quotedContent = finalMatch[1].trim();
            const responseContent = finalMatch[2].trim();
            
            // 將解析後的內容存儲到消息對象中
            msgObject.quotedContent = quotedContent;
            msgObject.responseContent = responseContent;
            
            // 更新顯示內容為卡片格式
            msgObject.displayContent = this.createQuoteCardHTML(quotedContent, responseContent, msgObject);
            
            Logger.debug('引用消息解析成功:', {
                quotedContent: quotedContent,
                responseContent: responseContent
            });
        } else {
            Logger.warn('引用消息格式解析失敗:', content);
        }
      } catch (error) {
        Logger.error('處理引用消息時出錯:', error);
      }
    },
    
    // 🔥 新增：創建引用卡片HTML
    createQuoteCardHTML(quotedContent, responseContent, msgObject) {
      return `
        <div class="quote-message-bubble">
          <div class="quote-content">${quotedContent}</div>
          <div class="response-content">${responseContent}</div>
        </div>
      `;
    },

    // 新增：判断是否为用户消息的辅助函数
    isMessageFromUser(sender) {
      if (!sender) return false;
      
      // 🆕 根據聊天類型選擇用戶名
      let currentUserName = protagonistName || '{{user}}';
      if (streamState.activeChatType === 'group' && streamState.activeChatId) {
        const groupChat = chatData.groupChats[streamState.activeChatId];
        if (groupChat && groupChat.admin) {
          currentUserName = groupChat.admin;
        }
      }
      
      const userNames = [
        currentUserName,
        '{{user}}',
        'User', 
        '主角',
        'user'
      ];
      
      return userNames.some(name => 
        sender === name || 
        (sender && sender.toLowerCase() === name.toLowerCase())
      );
    },

    // 🔥 修復：更新未读计数的函数 - 簡化邏輯
    updateUnreadCount(chatId, messageTime) {
      // 確保未讀狀態對象存在
      if (!this.unreadCounts) {
        this.unreadCounts = {};
      }
      
      if (!this.unreadCounts[chatId]) {
        this.unreadCounts[chatId] = {
          count: 0,
          lastMessageTime: null,
          lastViewTime: 0, // 🔥 修復：初始化為0，這樣所有新消息都會增加未讀計數
          hasNewMessages: false
        };
      }
      
      const state = this.unreadCounts[chatId];
      const msgTimestamp = new Date(messageTime).getTime();
      
      // 🔥 簡化邏輯：只要消息時間晚於最後查看時間，就增加未讀計數
      // 注意：lastViewTime 只有在用戶點擊進入聊天室時才會更新
      if (msgTimestamp > state.lastViewTime) {
        state.count++;
        state.lastMessageTime = messageTime;
        state.hasNewMessages = true;
        
        Logger.debug(`聊天室 ${chatId} 未读数: ${state.count}, 消息时间: ${messageTime}`);
        
        // 🔥 新增：更新未讀計數後保存到localStorage
        try {
          localStorage.setItem('chat_unread_state', JSON.stringify(this.unreadCounts));
          Logger.debug(`未讀計數已保存到localStorage: ${chatId}`);
        } catch (error) {
          Logger.error('保存未讀計數到localStorage失敗:', error);
        }
      } else {
        Logger.debug(`聊天室 ${chatId} 消息时间 ${messageTime} 不晚于最后查看时间 ${state.lastViewTime}，不增加未读计数`);
      }
    },

    // 🔥 修復：清除指定聊天室的未读计数 - 與面板邏輯一致
    clearUnreadCount(chatId) {
      if (this.unreadCounts && this.unreadCounts[chatId]) {
        this.unreadCounts[chatId].count = 0;
        this.unreadCounts[chatId].lastViewTime = Date.now();
        this.unreadCounts[chatId].hasNewMessages = false;
        Logger.debug(`已清除聊天室 ${chatId} 的未读计数`);
        
        // 🔥 新增：清除未讀計數後保存到localStorage
        try {
          localStorage.setItem('chat_unread_state', JSON.stringify(this.unreadCounts));
          Logger.debug(`未讀計數清除後已保存到localStorage: ${chatId}`);
        } catch (error) {
          Logger.error('保存未讀計數到localStorage失敗:', error);
        }
      }
    },

    getNextSimpleMessageId() {
      if (!streamState.activeChatId || !streamState.activeChatType) {
        return 1; // 后备方案
      }
      
      let chatHistory;
      if (streamState.activeChatType === 'dm') {
        chatHistory = chatData.dmChats[streamState.activeChatId];
      } else if (streamState.activeChatType === 'story') {
        chatHistory = chatData.storyChats[streamState.activeChatId];
      } else {
        chatHistory = chatData.groupChats[streamState.activeChatId];
      }
      
      if (!chatHistory || !chatHistory.messages || chatHistory.messages.length === 0) {
        return 1; // 如果没有消息，从1开始
      }
      
      // 简单地找到最大ID，然后+1
      let maxId = 0;
      chatHistory.messages.forEach(msg => {
        const numId = parseInt(msg.id);
        if (!isNaN(numId) && numId > maxId) {
          maxId = numId;
        }
      });
      
      return maxId + 1;
    },

    extractChatIdFromContent(content) {
      // 从Chat标头提取 - 新格式：[Chat|dm_6|陳彥庭⇆方亦楷]
      const chatMatch = content.match(/\[Chat\|([\w_]+)\|/);
      if (chatMatch?.[1]) return chatMatch[1];
      
      // 从消息内容提取 - 新格式：[1|dm_6|陳彥庭|我想養貓|18:47]
      const messageMatch = content.match(/\[(\d+)\|([\w_]+)\|/);
      if (messageMatch?.[2]) return messageMatch[2];
      
      // 使用记忆的上下文
      if (caches.lastValidChatContext?.id && caches.lastValidChatContext.id !== 'Analysis') {
        return caches.lastValidChatContext.id;
      }
      
      return null;
    },

    removeMessageFromState(deletedMessageId) {
      // 從內部狀態中移除被刪除的消息
      if (chatData && chatData.chatList) {
        chatData.chatList.forEach(chat => {
          if (chat.messages && chat.messages.includes(deletedMessageId)) {
            chat.messages = chat.messages.filter(id => id !== deletedMessageId);
            // 更新消息计数
            if (chat.messageCount) {
              chat.messageCount = Math.max(0, chat.messageCount - 1);
            }
          }
        });
      }
    }
  };

  // === 🔥 修正版：聊天管理器 ===
  const ChatManager = {
    updateChatList(listId, chatType, chatName, participantsInfo) {
      const existingIndex = chatData.chatList.findIndex(c => c.id === listId);
      
      // 映射聊天类型
      let type;
      if (chatType === 'story') {
        type = 'story';
      } else if (chatType === 'group_chat') {
        type = 'group';
      } else {
        type = 'dm';
      }
      
      let newItem = { id: listId, type, name: chatName };
      
      if (type === 'dm') {
        // 🔥 修正：正确处理私聊参与者信息
        if (participantsInfo && participantsInfo.includes('⇆')) {
          const participants = participantsInfo.split('⇆').map(p => p.trim());
          newItem.participant1 = participants[0];
          newItem.participant2 = participants[1] || "";
        } else {
          // 兼容其他格式
          newItem.participant1 = participantsInfo || "";
          newItem.participant2 = "";
        }
      } else if (type === 'story') {
        // 劇情聊天室直接用 chatName 當作 POV角色名
        newItem.narrator = chatName;
      } else {
        // 群聊：解析管理员和成员信息
        if (participantsInfo) {
          const parts = participantsInfo.split('|');
          newItem.admin = parts[0]?.trim() || "";
          newItem.members = parts.length > 1 ? 
            parts[1].split(',').map(m => m.trim()).filter(Boolean) : [];
        } else {
          newItem.admin = "";
          newItem.members = [];
        }
      }
      
      // 🔥 新增：私聊識別邏輯，防止重複添加
      if (type === 'dm') {
        const participants = chatName.split('⇆');
        if (participants.length === 2) {
          const participant1 = participants[0].trim();
          const participant2 = participants[1].trim();
          
          // 檢查是否已存在相同的私聊（基於參與者）
          const existingChat = chatData.chatList.find(chat => {
            if (chat.type === 'dm' && chat.name) {
              const existingParticipants = chat.name.split('⇆');
              if (existingParticipants.length === 2) {
                const existingP1 = existingParticipants[0].trim();
                const existingP2 = existingParticipants[1].trim();
                return (existingP1 === participant1 && existingP2 === participant2) ||
                       (existingP1 === participant2 && existingP2 === participant1);
              }
            }
            return false;
          });
          
          if (existingChat) {
            console.log(`[私聊識別] 找到現有私聊列表項: ${existingChat.id} (${existingChat.name})`);
            console.log(`[私聊識別] 跳過添加新私聊列表項: ${listId} (${chatName})`);
            return; // 跳過添加新私聊列表項
          }
        }
      }
      
      if (existingIndex > -1) { 
        // 🔥 修正：更新時保留原有的額外信息（如群組頭像）
        const existingChat = chatData.chatList[existingIndex];
        const updatedChat = { ...existingChat, ...newItem };
        
        // 🔥 特別處理群聊：確保群組頭像等額外信息不丟失
        if (type === 'group') {
          updatedChat.groupAvatar = existingChat.groupAvatar || newItem.groupAvatar;
          updatedChat.adminAvatar = existingChat.adminAvatar || newItem.adminAvatar;
          updatedChat.isPreset = existingChat.isPreset || newItem.isPreset;
        }
        
        chatData.chatList[existingIndex] = updatedChat;
        console.log(`[updateChatList] 更新群聊列表項: {id: '${listId}', hasGroupAvatar: ${!!updatedChat.groupAvatar}}`);
      } else {
        chatData.chatList.push(newItem); 
      }
      
      // 🔥 新增：更新聊天列表後保存到localStorage
      try {
        localStorage.setItem('preset_chats', JSON.stringify(chatData.chatList));
        Logger.debug(`聊天列表已保存到localStorage: ${listId}`);
      } catch (error) {
        Logger.error('保存聊天列表到localStorage失敗:', error);
      }
      
      caches.knownChatIds.add(listId);
      Logger.debug(`更新聊天列表: ${listId} | ${type} | ${chatName}`);
    },

    initializeChatHistory(listId, chatType, chatName, participantsInfo = null, adminInfo = null) {
      if (chatType === 'dm' && !chatData.dmChats[listId]) {
        // 🔥 修正：使用 participantsInfo 參數來解析參與者
        console.log('[私聊歷史初始化] 開始解析參與者:', {
          listId, chatType, chatName, participantsInfo, adminInfo
        });
        
        let participant1, participant2;
        
        if (participantsInfo && participantsInfo.includes('⇆')) {
          // 使用 participantsInfo 參數
          const participants = participantsInfo.split('⇆');
          participant1 = participants[0]?.trim();
          participant2 = participants[1]?.trim();
          console.log('[私聊歷史初始化] 從 participantsInfo 解析:', { participant1, participant2 });
        } else if (chatName && chatName.includes('⇆')) {
          // 兼容舊格式：從 chatName 解析
          const participants = chatName.split('⇆');
          participant1 = participants[0]?.trim();
          participant2 = participants[1]?.trim();
          console.log('[私聊歷史初始化] 從 chatName 解析:', { participant1, participant2 });
        } else {
          // 🔥 修正：不依賴全局 protagonistName，直接使用占位符
          participant1 = '{{user}}';
          participant2 = chatName;
          console.log('[私聊歷史初始化] 使用占位符默認值:', { participant1, participant2 });
        }
        
        // 🔥 修正：移除對全局 protagonistName 的依賴
        // 讓私聊設置來決定實際的用戶名，而不是在這裡替換
          
          // 🔥 新增：檢查 protagonistName 的狀態
          console.log('[私聊歷史初始化] protagonistName 狀態:', {
            protagonistName,
            isPlaceholder: protagonistName === '{{user}}',
            participant1,
            participant2
          });
        
        // 🔥 新增：私聊識別邏輯，防止重複創建
        if (participant1 && participant2) {
          
          // 檢查是否已存在相同的私聊（基於參與者）
          const existingDmChat = Object.values(chatData.dmChats).find(chat => {
            if (chat.participant1 && chat.participant2) {
              return (chat.participant1 === participant1 && chat.participant2 === participant2) ||
                     (chat.participant1 === participant2 && chat.participant2 === participant1);
            }
            return false;
          });
          
          if (existingDmChat) {
            console.log(`[私聊識別] 找到現有私聊: ${existingDmChat.id} (${existingDmChat.participant1}⇆${existingDmChat.participant2})`);
            console.log(`[私聊識別] 跳過創建新私聊: ${listId} (${participant1}⇆${participant2})`);
            return; // 跳過創建新私聊
          }
        }
        
        chatData.dmChats[listId] = { 
          id: listId, 
          name: chatName, 
          participant1: participant1,  // 现在这里是实际用户名，不是占位符
          participant2: participant2,
          messages: [] 
        };
        console.log(`[私聊創建] 新私聊: ${listId} (${participant1}⇆${participant2})`);
        
        // 🔥 新增：創建私聊後保存到localStorage
        try {
          localStorage.setItem('dm_chats', JSON.stringify(chatData.dmChats));
          Logger.debug(`私聊數據已保存到localStorage: ${listId}`);
        } catch (error) {
          Logger.error('保存私聊數據到localStorage失敗:', error);
        }
              } else if (chatType === 'story' && !chatData.storyChats[listId]) {
          chatData.storyChats[listId] = { id: listId, name: chatName, messages: [] };
          
          // 🔥 新增：創建劇情聊天後保存到localStorage
          try {
            localStorage.setItem('story_chats', JSON.stringify(chatData.storyChats));
            Logger.debug(`劇情聊天數據已保存到localStorage: ${listId}`);
          } catch (error) {
            Logger.error('保存劇情聊天數據到localStorage失敗:', error);
          }
      } else if (chatType === 'group_chat') {
        // 🔥 修正：無論是否存在，都確保群組信息正確
        const existingGroupInfo = chatData.chatList.find(chat => chat.id === listId && chat.type === 'group');
        
        console.log('[聊天歷史初始化] 查找現有群組信息:', {
            listId,
            chatName,
            adminInfo,
            foundExistingGroupInfo: !!existingGroupInfo,
            existingGroupInfoKeys: existingGroupInfo ? Object.keys(existingGroupInfo) : [],
            hasGroupAvatar: existingGroupInfo ? !!existingGroupInfo.groupAvatar : false,
            groupAvatarLength: existingGroupInfo && existingGroupInfo.groupAvatar ? existingGroupInfo.groupAvatar.length : 0
        });
        
        if (!chatData.groupChats[listId]) {
          // 創建新的群聊對象
          chatData.groupChats[listId] = { 
            id: listId, 
            name: chatName, 
            admin: adminInfo,  // 🔥 關鍵：設置admin字段
            messages: [],
            // 🔥 保留原有的群組信息
            ...(existingGroupInfo && {
              groupAvatar: existingGroupInfo.groupAvatar,
              adminAvatar: existingGroupInfo.adminAvatar,
              members: existingGroupInfo.members,
              isPreset: existingGroupInfo.isPreset
            })
          };
          console.log(`[聊天歷史初始化] 創建群聊對象: {id: '${listId}', name: '${chatName}', admin: ${adminInfo ? `'${adminInfo}'` : 'null'}, hasGroupAvatar: ${!!existingGroupInfo?.groupAvatar}}`);
        } else {
          // 更新現有的群聊對象，確保群組信息不丟失
          const currentGroupChat = chatData.groupChats[listId];
          chatData.groupChats[listId] = {
            ...currentGroupChat,
            name: chatName,
            admin: adminInfo,
            // 🔥 保留原有的群組信息，如果沒有則從 chatData.chatList 中獲取
            groupAvatar: currentGroupChat.groupAvatar || (existingGroupInfo?.groupAvatar),
            adminAvatar: currentGroupChat.adminAvatar || (existingGroupInfo?.adminAvatar),
            members: currentGroupChat.members || (existingGroupInfo?.members),
            isPreset: currentGroupChat.isPreset || (existingGroupInfo?.isPreset)
          };
          console.log(`[聊天歷史初始化] 更新群聊對象: {id: '${listId}', name: '${chatName}', admin: ${adminInfo ? `'${adminInfo}'` : 'null'}, hasGroupAvatar: ${!!chatData.groupChats[listId].groupAvatar}}`);
        }
        
        // 🔥 新增：創建或更新群聊後保存到localStorage
        try {
          localStorage.setItem('group_chats', JSON.stringify(chatData.groupChats));
          Logger.debug(`群聊數據已保存到localStorage: ${listId}`);
        } catch (error) {
          Logger.error('保存群聊數據到localStorage失敗:', error);
        }
      }
    },
  };

  // === 🔥 优化：数据发送器 ===
  const DataSender = {
    findTargetChatIframe() {
      try {
        Logger.debug('🔥 开始查找chat面板iframe...');
        
        // 🔥 智能iframe查找机制（参考VN处理器）
        const possibleSelectors = [
          '.chat-panel-iframe',
          'iframe[src*="chat_panel.html"]',
          'iframe[src*="chat_panel"]', 
          '#chatPanelIframe',
          '.chat-iframe',
          '.panel-iframe'
        ];

        for (let selector of possibleSelectors) {
          const iframe = document.querySelector(selector);
          if (iframe) {
            Logger.debug(`🔥 通过选择器找到chat面板iframe: ${selector}`);
            return iframe;
          }
        }

        const allIframes = document.querySelectorAll('iframe');
        for (let iframe of allIframes) {
          if (iframe.src && (
            iframe.src.includes('chat_panel.html') || 
            iframe.src.includes('chat_panel') ||
            iframe.src.includes('chat') ||
            iframe.className.includes('chat') ||
            iframe.id.includes('chat')
          )) {
            Logger.debug(`🔥 通过src/class/id找到chat面板iframe: ${iframe.src}`);
            return iframe;
          }
        }

        if (window.parent && window.parent !== window) {
          const parentIframes = window.parent.document.querySelectorAll('iframe');
          for (let iframe of parentIframes) {
            if (iframe.src && iframe.src.includes('chat_panel')) {
              Logger.debug('🔥 在父窗口中找到chat面板iframe');
              return iframe;
            }
          }
        }

        Logger.warn('❌ 未找到chat面板iframe');
        return null;
      } catch (error) {
        Logger.error('❌ 查找Chat iframe失败', error);
        return null;
      }
    },

    isChatIframeReady(iframe) {
      try {
        return iframe && 
               iframe.contentWindow && 
               iframe.src && 
               iframe.src !== 'about:blank' &&
               typeof iframe.contentWindow.postMessage === 'function';
      } catch {
        return false;
      }
    },

    tryToSendData(payload) {
      try {
        Logger.debug('🔥 尝试发送数据到chat面板');
        
        // 添加来源标识
        const message = {
          ...payload,
          source: 'CHAT_PROCESSOR'
        };

        let sent = false;

        const chatIframe = this.findTargetChatIframe();
        if (chatIframe && chatIframe.contentWindow) {
          try {
            chatIframe.contentWindow.postMessage(message, '*');
            Logger.debug('🔥 ✅ 通过chat面板iframe发送成功');
            sent = true;
          } catch (e) {
            Logger.warn('🔥 chat面板iframe发送失败:', e);
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
            Logger.debug('🔥 ⚡ 已广播到所有iframe');
            sent = true;
          }
        }

        if (!sent && window.parent && window.parent !== window) {
          try {
            window.parent.postMessage(message, '*');
            Logger.debug('🔥 📤 发送到父窗口');
            sent = true;
          } catch (e) {
            Logger.warn('🔥 父窗口发送失败:', e);
          }
        }

        if (sent) {
          Logger.verbose(`🔥 数据已发送，包含 ${chatData.chatList.length} 个聊天室`);
          caches.pendingDataToSend = null;
        }

        return sent;
      } catch (error) {
        Logger.error('🔥 发送数据失败', error);
        return false;
      }
    },

    sendDataToChatPanel_Direct(customPayload = null) {
      const payload = customPayload || {
        type: 'CHAT_DATA',
        data: chatData,
        messageId: currentTavernMessageId,
        protagonistName: protagonistName,
        forceRefresh: true,
        // ✅ 新增：传递未读计数数据
        unreadCounts: MessageParser.unreadCounts || {}
      };
      
      // 🔥 新增：保存數據到localStorage
      this.saveDataToLocalStorage();
      
      caches.pendingDataToSend = payload;
      Logger.limited('send', '发送数据到Chat面板');
      
      if (this.tryToSendData(payload)) {
        Logger.limited('send', '数据发送成功');
        return;
      }
      
      this.startPolling(payload);
    },
    
    // 🔥 新增：保存數據到localStorage
    saveDataToLocalStorage() {
      try {
        // 保存聊天列表
        if (chatData.chatList && chatData.chatList.length > 0) {
          localStorage.setItem('preset_chats', JSON.stringify(chatData.chatList));
        }
        
        // 保存私聊數據
        if (chatData.dmChats && Object.keys(chatData.dmChats).length > 0) {
          localStorage.setItem('dm_chats', JSON.stringify(chatData.dmChats));
        }
        
        // 保存群聊數據
        if (chatData.groupChats && Object.keys(chatData.groupChats).length > 0) {
          localStorage.setItem('group_chats', JSON.stringify(chatData.groupChats));
        }
        
        // 保存劇情聊天數據
        if (chatData.storyChats && Object.keys(chatData.storyChats).length > 0) {
          localStorage.setItem('story_chats', JSON.stringify(chatData.storyChats));
        }
        
        // 保存未讀計數
        if (MessageParser.unreadCounts && Object.keys(MessageParser.unreadCounts).length > 0) {
          localStorage.setItem('chat_unread_state', JSON.stringify(MessageParser.unreadCounts));
        }
        
        Logger.debug('處理器數據已保存到localStorage');
      } catch (error) {
        Logger.error('保存localStorage數據失敗:', error);
      }
    },

    startPolling(payload) {
      if (timers.chatIframeCheck) clearInterval(timers.chatIframeCheck);
      
      let attempts = 0;
      const maxAttempts = 15;  // 减少轮询次数
      
      timers.chatIframeCheck = setInterval(() => {
        attempts++;
        
        if (this.tryToSendData(payload)) {
          Logger.debug('轮询发送成功');
          clearInterval(timers.chatIframeCheck);
          timers.chatIframeCheck = null;
          return;
        }
        
        if (attempts >= maxAttempts) {
          Logger.debug('轮询超时');
          clearInterval(timers.chatIframeCheck);
          timers.chatIframeCheck = null;
        }
      }, 1000);
    },

    sendEmptyChatToPanel(listId, chatType, chatName) {
      ChatManager.updateChatList(listId, chatType, chatName, '');
      // 🔥 修复：对于群聊，尝试从chatList中获取admin信息
      let adminInfo = null;
      if (chatType === 'group_chat') {
        const chatListItem = chatData.chatList.find(c => c.id === listId);
        if (chatListItem && chatListItem.admin) {
          adminInfo = chatListItem.admin;
        }
      }
      ChatManager.initializeChatHistory(listId, chatType, chatName, adminInfo);
      
      const isReallyNewChat = !caches.knownChatIds.has(listId) && !flags.isManualScanMode;
      
      if (isReallyNewChat) {
        Logger.debug(`检测到新聊天: ${listId}`);
        caches.knownChatIds.add(listId);
        
        const payload = {
          type: 'CHAT_DATA',
          data: chatData,
          messageId: currentTavernMessageId,
          protagonistName: protagonistName,
          isEmptyPlaceholder: true,
          newChatId: listId,
          dataSource: 'NEW_CHAT_CREATED',
          forceRefresh: false
        };
        
        this.sendDataToChatPanel_Direct(payload);
      } else {
        caches.knownChatIds.add(listId);
      }
    },

    async sendDataToChatPanel(isManualUpdate = false) {
      Helpers.prepareMessageDataForSending();
      
      const dataSource = isManualUpdate ? 'MANUAL_HISTORY' : 'STREAM_UPDATE';
      
      // 🔥 新增：获取完整的酒馆聊天记录用于通话状态检查
      let tavernChatHistory = [];
      try {
        const lastId = await TavernAPI.getLastMessageId();
        if (lastId >= 0) {
          const tavernMessages = await TavernAPI.getChatMessages(`0-${lastId}`);
          if (Array.isArray(tavernMessages)) {
            // 转换酒馆消息格式为通话系统需要的格式
            tavernChatHistory = tavernMessages.map(m => {
              const content = (m && (m.message || m.mes)) || '';
              
              // 检测通话相关消息类型
              let type = 'none';
              if (content.includes('[call_invitation:')) type = 'call_invitation';
              else if (content.includes('[call_accept:')) type = 'call_accept';
              else if (content.includes('[call_decline:')) type = 'call_decline';
              else if (content.includes('[call_ended:')) {
                type = 'call_ended';
                console.log('[处理器] 检测到通话结束消息:', content);
              }
              
              return {
                id: (m && m.message_id) ? m.message_id.toString() : '0',
                sender: (m && m.name) || '未知',
                content: content,
                type: type,
                time: ''
              };
            });
          }
        }
      } catch (error) {
        Logger.error('获取酒馆聊天记录失败', error);
        tavernChatHistory = [];
      }
      
      const payload = {
        type: 'CHAT_DATA',
        data: chatData,
        messageId: currentTavernMessageId,
        protagonistName: protagonistName,
        isManualRefresh: isManualUpdate,
        forceRefresh: true,
        dataSource: dataSource,
        tavernChatHistory: tavernChatHistory,  // 🔥 新增：完整聊天记录
        unreadCounts: this.unreadCounts || {}   // 🔥 新增：未讀計數數據
      };

      // 🔥 新增：調試未讀計數數據
      if (this.unreadCounts && Object.keys(this.unreadCounts).length > 0) {
        Logger.debug(`發送未讀計數數據:`, this.unreadCounts);
      } else {
        Logger.debug('沒有未讀計數數據需要發送');
      }

      Logger.debug(`发送数据 - 来源: ${dataSource}`);
      this.sendDataToChatPanel_Direct(payload);
    },

    // �� 新增：发送选择提示到聊天面板
    sendChoicePromptToPanel(choices) {
      const payload = {
        type: 'CHOICE_PROMPT',
        choices: choices,
        timestamp: Date.now()
      };
      
      Logger.debug(`发送选择提示: ${choices.length} 个选项`);
      
      if (this.tryToSendData(payload)) {
        Logger.debug('选择提示发送成功');
        return;
      }
      
      // 如果直接发送失败，尝试轮询发送
      this.startPolling(payload);
    }
  };

  // === 🔥 优化：辅助工具 ===
  const Helpers = {
    getCurrentDate() { 
      return new Date().toISOString().slice(0, 10); 
    },
    
    getCurrentTime() { 
      const d = new Date(); 
      return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; 
    },
    
    isValidDate(d) { 
      return /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(new Date(d)); 
    },

    prepareMessageDataForSending() {
      const today = this.getCurrentDate();
      const currentTime = this.getCurrentTime();
      
      // 处理所有聊天类型的消息数据
      const allChats = Object.values(chatData.dmChats)
        .concat(Object.values(chatData.groupChats))
        .concat(Object.values(chatData.storyChats));
        
      allChats.forEach(chat => {
        chat.messages.forEach(msg => {
          if (!msg.date || !this.isValidDate(msg.date)) msg.date = today;
          if (!msg.time) msg.time = currentTime;
          
          // ⭐ 重要修复：只有在消息没有 isProtagonist 字段时才设置
          if (!msg.hasOwnProperty('isProtagonist')) {
            console.log('[數據準備] 消息缺少 isProtagonist 字段，開始設置:', {
              msgId: msg.id,
              sender: msg.sender,
              chatType: chat.type,
              chatAdmin: chat.admin
            });
            
            // 🆕 根據聊天類型設置 isProtagonist
            if (chat.type === 'group' && chat.admin) {
              msg.isProtagonist = msg.sender === chat.admin;
              console.log('[數據準備] 群聊判斷:', {
                sender: msg.sender,
                admin: chat.admin,
                isProtagonist: msg.isProtagonist
              });
            } else {
              msg.isProtagonist = msg.sender === protagonistName;
              console.log('[數據準備] 非群聊判斷:', {
                sender: msg.sender,
                protagonistName: protagonistName,
                isProtagonist: msg.isProtagonist
              });
            }
          } else {
            // 已有 isProtagonist 字段，保持不变
            console.log('[數據準備] 消息已有 isProtagonist 字段，保持不變:', {
              msgId: msg.id,
              sender: msg.sender,
              isProtagonist: msg.isProtagonist
            });
          }
        });
      });
    },

    throttle(func, delay) {
      let timeoutId;
      let lastExecTime = 0;
      
      return function (...args) {
        const currentTime = Date.now();
        
        if (currentTime - lastExecTime > delay) {
          func.apply(this, args);
          lastExecTime = currentTime;
        } else {
          clearTimeout(timeoutId);
          timeoutId = setTimeout(() => {
            func.apply(this, args);
            lastExecTime = Date.now();
          }, delay - (currentTime - lastExecTime));
        }
      };
    }
  };

  // === 核心处理函数 ===
  function handleStreamedMessage(partialText) {
    if (flags.isStreamThrottled) return;
    
    flags.isStreamThrottled = true;
    setTimeout(() => { flags.isStreamThrottled = false; }, CONFIG.STREAM_THROTTLE_DELAY);

    if (MessageParser.parseStreamIncrementally(partialText)) {
      DataSender.sendDataToChatPanel(false);
    }
  }

  async function processFinalMessage(tavern_message_id) {
    Logger.debug(`处理消息 ID: ${tavern_message_id}`);
    
    if (!tavern_message_id) {
      try {
        tavern_message_id = await TavernAPI.getLastMessageId();
      } catch (error) {
        Logger.error('获取消息ID失败', error);
        return;
      }
    }
    
    currentTavernMessageId = tavern_message_id;

    try {
      const messagesInfo = await TavernAPI.getChatMessages(tavern_message_id);
      if (messagesInfo?.length > 0) {
        const messageContent = messagesInfo[0].message;
        
        if (MessageParser.parseStreamIncrementally(messageContent)) {
          DataSender.sendDataToChatPanel(false);
        }
      }
    } catch (error) {
      Logger.error('处理消息失败', error);
    }
  }

  async function scanAllHistoricalMessages() {
    Logger.debug('扫描历史消息');
    
    try {
      const lastMsgId = await TavernAPI.getLastMessageId();
      if (lastMsgId < 0) {
        flags.isManualScanMode = false;
        return;
      }
      
      // 🔥 修正：使用更安全的掃描方式，避免無效範圍錯誤
      await scanMessagesSafely(lastMsgId);
      
      // 🔥 新增：手動掃描完成後保存數據到localStorage
      DataSender.saveDataToLocalStorage();
      
      DataSender.sendDataToChatPanel(true);
      
      setTimeout(() => {
        flags.isManualScanMode = false;
      }, 1000);
    } catch (error) {
      Logger.error('扫描失败', error);
    }
  }
  
  // 🔥 新增：安全的消息掃描函數
  async function scanMessagesSafely(lastMsgId) {
    Logger.debug(`🔥 開始安全掃描消息，最後消息ID: ${lastMsgId}`);
    
    // 使用較小的批次進行掃描，避免無效範圍
    const batchSize = 50;
    let currentBatch = 0;
    
    while (currentBatch * batchSize <= lastMsgId) {
      const startId = currentBatch * batchSize;
      const endId = Math.min(startId + batchSize - 1, lastMsgId);
      
      try {
        Logger.debug(`🔥 掃描批次 ${currentBatch + 1}: ${startId}-${endId}`);
        const messages = await TavernAPI.getChatMessages(`${startId}-${endId}`);
        
        if (messages && messages.length > 0) {
          for (const msg of messages) {
            MessageParser.parseStreamIncrementally(msg.message);
          }
          Logger.debug(`🔥 批次 ${currentBatch + 1} 處理完成，處理了 ${messages.length} 條消息`);
        } else {
          Logger.debug(`🔥 批次 ${currentBatch + 1} 沒有消息`);
        }
      } catch (error) {
        Logger.warn(`🔥 批次 ${currentBatch + 1} (${startId}-${endId}) 掃描失敗，跳過: ${error.message}`);
        // 繼續下一個批次，不中斷整個掃描過程
      }
      
      currentBatch++;
      
      // 添加小延遲，避免過於頻繁的API調用
      if (currentBatch % 5 === 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    Logger.debug(`🔥 安全掃描完成，總共處理了 ${currentBatch} 個批次`);
  }

  // 🔥 新增：只處理數據請求，不重置面板
  function handleDataRequestOnly() {
    Logger.info('🔥 處理數據請求，不重置面板');
    
    flags.isManualScanMode = true;
    caches.lastKnownChatId = null;
    
    caches.knownChatIds.clear();
    chatData.chatList.forEach(chat => caches.knownChatIds.add(chat.id));
    
    // 🔥 不重置狀態，只掃描數據
    setTimeout(() => scanAllHistoricalMessages(), 500);
  }

  function handleManualUpdateChatPanel() {
    window.forceHistoryMode = true; // 批量渲染模式開關
    Logger.info('手动更新触发');
    
    // 发送重置信号
    const resetMessage = {
      type: 'COMPLETE_RESET',
      timestamp: Date.now(),
      reason: 'manual_update_button',
      source: 'CHAT_PROCESSOR'
    };
    DataSender.tryToSendData(resetMessage);
    
    flags.isManualScanMode = true;
    caches.lastKnownChatId = null;
    
    caches.knownChatIds.clear();
    chatData.chatList.forEach(chat => caches.knownChatIds.add(chat.id));
    
    StateManager.forceResetAllStates();
    
    setTimeout(() => scanAllHistoricalMessages(), 500);
  }

  function handleMessageDeleted(deletedMessageId) {
    Logger.debug(`🔥 消息删除: ${deletedMessageId}`);
    
    // 🔥 修正：处理器必须执行，但优化面板更新方式
    const syncMessage = {
      type: 'MESSAGE_DELETED_SYNC_START',
      deletedMessageId: deletedMessageId,
      timestamp: Date.now(),
      source: 'CHAT_PROCESSOR'
    };
    DataSender.tryToSendData(syncMessage);
    Logger.debug(`🔥 已发送同步开始标记: ${deletedMessageId}`);
    
    // 🔥 处理器必须执行：重置所有状态并重新扫描
    StateManager.forceResetAllStates();
    
    // 🔥 新增：清理localStorage中的緩存數據
    try {
      // 清理所有相關的localStorage數據
      localStorage.removeItem('preset_chats');
      localStorage.removeItem('dm_chats');
      localStorage.removeItem('group_chats');
      localStorage.removeItem('story_chats');
      localStorage.removeItem('chat_unread_state');
      localStorage.removeItem('chat_message_states');
      
      Logger.debug(`🔥 已清理localStorage緩存數據`);
    } catch (error) {
      Logger.error('🔥 清理localStorage緩存失敗:', error);
    }
    
    // 🔥 修正：重新掃描所有消息以確保數據同步
    setTimeout(() => {
      handleManualUpdateChatPanel();
    }, 300);
    
    Logger.debug(`🔥 消息删除處理完成: ${deletedMessageId}`);
  }
  
  // 🔥 已移除：不再使用逐個移除消息的方式，改為完全重置
  
  // 🔥 新增：處理MAIN面板的聊天內容掃描請求
  async function handleMainPanelChatRequest() {
    try {
      Logger.debug('🔥 開始處理MAIN面板的聊天內容掃描請求');
      
      // 1. 執行聊天內容掃描
      await scanAllHistoricalMessages();
      
      // 2. 準備聊天歷史列表數據
      const chatHistoryList = prepareChatHistoryListForMainPanel();
      
      // 3. 發送聊天歷史列表到MAIN面板
      sendChatHistoryListToMainPanel(chatHistoryList);
      
      Logger.debug('🔥 MAIN面板聊天內容掃描完成');
      
    } catch (error) {
      Logger.error('🔥 處理MAIN面板聊天請求失敗:', error);
    }
  }
  
  // 🔥 新增：準備聊天歷史列表數據
  function prepareChatHistoryListForMainPanel() {
    try {
      const chatList = [];
      
      // 處理聊天列表
      if (chatData.chatList && chatData.chatList.length > 0) {
        chatData.chatList.forEach(chat => {
          const chatInfo = {
            id: chat.id,
            type: chat.type,
            name: chat.name,
            createdAt: chat.createdAt || '',
            isPreset: chat.isPreset || false,
            unreadCount: 0,
            lastMessage: null
          };
          
          // 獲取未讀計數
          if (MessageParser.unreadCounts && MessageParser.unreadCounts[chat.id]) {
            chatInfo.unreadCount = MessageParser.unreadCounts[chat.id].count || 0;
          }
          
          // 獲取最後一條消息
          let chatHistory;
          if (chat.type === 'dm') {
            chatHistory = chatData.dmChats[chat.id];
          } else if (chat.type === 'story') {
            chatHistory = chatData.storyChats[chat.id];
          } else {
            chatHistory = chatData.groupChats[chat.id];
          }
          
          if (chatHistory && chatHistory.messages && chatHistory.messages.length > 0) {
            const lastMessage = chatHistory.messages[chatHistory.messages.length - 1];
            chatInfo.lastMessage = {
              id: lastMessage.id,
              sender: lastMessage.sender,
              content: lastMessage.content,
              time: lastMessage.time,
              date: lastMessage.date
            };
          }
          
          chatList.push(chatInfo);
        });
      }
      
      Logger.debug(`🔥 準備了 ${chatList.length} 個聊天室數據給MAIN面板`);
      return chatList;
      
    } catch (error) {
      Logger.error('🔥 準備聊天歷史列表數據失敗:', error);
      return [];
    }
  }
  
  // 🔥 新增：發送聊天歷史列表到MAIN面板
  function sendChatHistoryListToMainPanel(chatHistoryList) {
    try {
      const message = {
        type: 'CHAT_HISTORY_LIST',
        source: 'CHAT_PROCESSOR',
        data: {
          chatList: chatHistoryList,
          totalCount: chatHistoryList.length,
          timestamp: Date.now()
        }
      };
      
      // 方法1：向父窗口發送
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(message, '*');
      }
      
      // 方法2：向頂層窗口發送
      if (window.top && window.top !== window) {
        window.top.postMessage(message, '*');
      }
      
      // 方法3：廣播到所有iframe
      const allIframes = document.querySelectorAll('iframe');
      allIframes.forEach(iframe => {
        try {
          if (iframe.contentWindow) {
            iframe.contentWindow.postMessage(message, '*');
          }
        } catch (error) {
          // 忽略跨域錯誤
        }
      });
      
      Logger.debug('🔥 已發送聊天歷史列表到MAIN面板');
      
    } catch (error) {
      Logger.error('🔥 發送聊天歷史列表到MAIN面板失敗:', error);
    }
  }
  
  // 🔥 新增：處理面板加載完成事件
  function handlePanelLoadedEvent(data) {
    try {
      Logger.debug('🔥 處理面板加載完成事件:', data);
      
      // 延遲執行，確保面板完全加載
      setTimeout(() => {
        if (!flags.hasPerformedInitialScan) {
          Logger.debug('🔥 面板加載完成，執行初始掃描');
          performInitialScan();
        } else {
          Logger.debug('🔥 面板加載完成，重新處理消息');
          handleMessageReprocessRequest();
        }
      }, 500);
      
    } catch (error) {
      Logger.error('🔥 處理面板加載事件失敗:', error);
    }
  }
  
  // 🔥 新增：處理消息重新處理請求
  function handleMessageReprocessRequest() {
    try {
      Logger.debug('🔥 開始重新處理所有消息');
      
      // 重置狀態
      StateManager.forceResetAllStates();
      
      // 執行消息重新處理
      setTimeout(() => {
        scanAllHistoricalMessages();
      }, 300);
      
    } catch (error) {
      Logger.error('🔥 重新處理消息失敗:', error);
    }
  }
  
  // 🔥 新增：重新處理所有消息的函數
  async function reprocessAllMessages() {
    try {
      Logger.debug('🔥 開始重新處理所有消息');
      
      // 獲取最後一條消息ID
      const lastMsgId = await TavernAPI.getLastMessageId();
      if (lastMsgId < 0) {
        Logger.debug('🔥 沒有消息需要處理');
        return;
      }
      
      // 獲取所有聊天消息
      const allMessages = await TavernAPI.getChatMessages(`0-${lastMsgId}`);
      Logger.debug(`🔥 找到 ${allMessages.length} 條消息需要重新處理`);
      
      // 重置狀態
      StateManager.forceResetAllStates();
      
      // 處理每條消息
      for (let i = 0; i < allMessages.length; i++) {
        const message = allMessages[i];
        if (message?.message) {
          MessageParser.parseStreamIncrementally(message.message);
        }
      }
      
      // 發送處理完成的事件
      DataSender.sendDataToChatPanel(false);
      
      Logger.debug('🔥 消息重新處理完成');
      
    } catch (error) {
      Logger.error('🔥 重新處理消息時出錯:', error);
    }
  }

  // === 事件处理 ===
  function setupMessageListener() {
    window.addEventListener('message', function(event) {
      if (!event.data?.type) return;

      switch (event.data.type) {
        case 'REQUEST_FULL_CHAT_DATA':
          Logger.debug('收到数据请求');
          // 🔥 修正：不重置面板，只掃描數據
          handleDataRequestOnly();
          break;

        case 'CHAT_PANEL_REQUEST_DATA':
          Logger.debug('🔥 收到CHAT面板數據請求');
          // 處理CHAT面板的數據請求
          handleChatPanelDataRequest();
          break;

        case 'FORWARD_TO_PROCESSOR':
          if (event.data.payload?.type === 'REQUEST_FULL_CHAT_DATA') {
            handleManualUpdateChatPanel();
          }
          break;

        case 'CHAT_PANEL_RELOADED':
        case 'CHAT_PANEL_READY_IN_MOBILE':
          handlePanelReloadedMessage();
          break;

        case 'REQUEST_EVENT_BUTTON_REREGISTRATION':
          handlePanelReloadedMessage();
          break;

        case 'REQUEST_PROCESSOR_CHECK':
          handleProcessorCheckRequest();
          break;

        case 'TRIGGER_MANUAL_UPDATE':
          handleManualUpdateChatPanel();
          break;

        case 'CLEAR_UNREAD':
           if (event.data.chatId) {
            MessageParser.clearUnreadCount(event.data.chatId);
            Logger.debug(`收到清除未读请求: ${event.data.chatId}`);
           }
          break;

        case 'MANUAL_UNREAD_UPDATE':
          if (event.data.chatId && event.data.messageTime) {
            MessageParser.updateUnreadCount(event.data.chatId, event.data.messageTime);
            Logger.debug(`收到手动未读更新请求: ${event.data.chatId}, 时间: ${event.data.messageTime}`);
          }
          break;

        case 'CHAT_IFRAME_READY':
          if (caches.pendingDataToSend) {
            DataSender.tryToSendData(caches.pendingDataToSend);
          }
          if (!flags.hasPerformedInitialScan) {
            setTimeout(performInitialScan, 1000);
          }
          break;
          
        case 'CHAT_PROCESSOR_START':
          Logger.debug('🔥 收到聊天處理器啟動信號');
          if (!flags.hasPerformedInitialScan) {
            Logger.debug('🔥 執行初始掃描');
            performInitialScan();
          } else {
            Logger.debug('🔥 重新執行掃描以確保數據同步');
            handleManualUpdateChatPanel();
          }
          break;
          
        // 🔥 新增：监听Chat面板打开事件
        case 'PANEL_OPEN':
          if (event.data.panel === 'chat') {
            Logger.debug('🔥 收到Chat面板打開信號');
            if (!flags.hasPerformedInitialScan) {
              Logger.debug('🔥 Chat面板已打開，執行初始掃描');
              performInitialScan();
            } else {
              Logger.debug('🔥 Chat面板已打開，重新執行掃描以確保數據同步');
              handleManualUpdateChatPanel();
            }
          }
          break;
          
        // 🔥 新增：處理MAIN面板的聊天內容掃描請求
        case 'CHAT_FETCH_HISTORY_LIST':
          Logger.debug('🔥 收到MAIN面板的聊天內容掃描請求');
          handleMainPanelChatRequest();
          break;
          
        // 🔥 新增：處理面板加載完成事件
        case 'PANEL_LOADED':
          Logger.debug('🔥 收到面板加載完成事件');
          handlePanelLoadedEvent(event.data);
          break;
          
        // 🔥 新增：處理消息重新處理請求
        case 'REQUEST_MESSAGE_REPROCESS':
          Logger.debug('🔥 收到消息重新處理請求');
          handleMessageReprocessRequest();
          break;
      }
    });
  }

  function handlePanelReloadedMessage() {
    Logger.debug('面板重载');

    try {
      if (typeof eventOnButton === 'function') {
        eventOnButton('💬', handleManualUpdateChatPanel);
        notifyEventButtonReregistered();
      }
    } catch (error) {
      Logger.error('注册按钮失败', error);
    }

    // 🆕 延遲執行，確保iframe完全載入後再更新
    setTimeout(() => {
      handleManualUpdateChatPanel();
      
      // 🆕 額外觸發一次預設聊天室檢查，確保localStorage中的預設聊天室被載入
      setTimeout(() => {
        if (typeof window.forceHistoryMode !== 'undefined') {
          window.forceHistoryMode = true;
        }
        handleManualUpdateChatPanel();
      }, 500);
    }, 200);
  }

  // 🔥 新增：處理CHAT面板數據請求
  function handleChatPanelDataRequest() {
    Logger.debug('🔥 處理CHAT面板數據請求');
    
    try {
      // 立即執行數據掃描和發送
      handleManualUpdateChatPanel();
      
      // 確保數據被發送到CHAT面板
      setTimeout(() => {
        const message = {
          type: 'CHAT_DATA_READY',
          timestamp: Date.now(),
          source: 'CHAT_PROCESSOR'
        };
        
        // 使用新的通信策略
        DataSender.tryToSendData(message);
        Logger.debug('🔥 已發送CHAT數據就緒信號到面板');
      }, 500);
      
    } catch (error) {
      Logger.error('🔥 處理CHAT面板數據請求失敗:', error);
    }
  }

  function notifyEventButtonReregistered() {
    try {
      const message = {
        type: 'EVENT_BUTTON_REREGISTERED',
        timestamp: Date.now(),
        source: 'CHAT_PROCESSOR'
      };
      
      // 使用新的通信策略
      DataSender.tryToSendData(message);
    } catch (error) {
      Logger.error('🔥 发送确认失败', error);
    }
  }

  const handleProcessorCheckRequest = Helpers.throttle(async function() {
    try {
      const lastMsgId = await TavernAPI.getLastMessageId();
      Logger.verbose(`检查消息ID: ${lastMsgId}`);
      
      if (lastMsgId >= 0 && lastMsgId !== currentTavernMessageId) {
        await processFinalMessage(lastMsgId);
      }
    } catch (error) {
      Logger.error('检查失败', error);
    }
  }, CONFIG.PROCESSOR_CHECK_THROTTLE);

  function setupPeriodicCheck() {
    if (flags.periodicCheckRunning) return;
    
    flags.periodicCheckRunning = true;
    let lastCheckMessageId = -1;
    
    timers.periodicCheck = setInterval(async () => {
      try {
        const lastMsgId = await TavernAPI.getLastMessageId();
        
        if (lastMsgId !== lastCheckMessageId && 
            lastMsgId !== currentTavernMessageId && 
            lastMsgId >= 0) {
          Logger.verbose(`发现新消息: ${lastMsgId}`);
          lastCheckMessageId = lastMsgId;
          await processFinalMessage(lastMsgId);
        }
      } catch (error) {
        Logger.error('定期检查失败', error);
      }
    }, CONFIG.PERIODIC_CHECK_INTERVAL);
  }
  
  async function performInitialScan() {
    if (flags.hasPerformedInitialScan) return;
    
    try {
      Logger.limited('init', '执行初始扫描');
      
      const lastMsgId = await TavernAPI.getLastMessageId();
      Logger.debug(`消息ID: ${lastMsgId}`);
      
      if (lastMsgId >= 0) {
        flags.hasPerformedInitialScan = true;
        flags.isManualScanMode = false;
        
        const messages = await TavernAPI.getChatMessages(`0-${lastMsgId}`);
        Logger.verbose(`处理 ${messages.length} 条消息`);
        
        for (const msg of messages) {
          if (msg?.message) {
            MessageParser.parseStreamIncrementally(msg.message);
          }
        }
        
        // 🔥 新增：掃描完成後保存數據到localStorage
        DataSender.saveDataToLocalStorage();
        
        DataSender.sendDataToChatPanel(false);
        Logger.limited('init', '初始扫描完成');
      } else {
        flags.hasPerformedInitialScan = true;
      }
    } catch (error) {
      Logger.error('初始扫描失败', error);
    }
  }

  function setupEventSystem_Chat() {
    if (flags.eventSystemInitialized) return;
    
    Logger.debug('设置事件系统');
    
    // 监听酒馆事件
    if (typeof eventOn === 'function') {
      eventOn(tavern_events.STREAM_TOKEN_RECEIVED, handleStreamedMessage);
      eventOn(tavern_events.MESSAGE_UPDATED, processFinalMessage);
      eventOn(tavern_events.MESSAGE_RECEIVED, processFinalMessage);
      eventOn(tavern_events.MESSAGE_DELETED, handleMessageDeleted);
      
      eventOn(tavern_events.MESSAGE_SENT, function(messageId) {
        setTimeout(() => processFinalMessage(messageId), 300);
      });
      
      // 🔥 新增：監聽聊天變更事件，自動重新處理消息
      eventOn(tavern_events.CHAT_CHANGED, function(chatFileName) {
        Logger.debug('🔥 聊天已變更，重新處理消息:', chatFileName);
        flags.hasPerformedInitialScan = false;
        StateManager.forceResetAllStates();
        setTimeout(() => {
          reprocessAllMessages();
        }, 1000); // 延遲一秒確保聊天完全加載
      });

      eventOn(tavern_events.APP_READY, function() {
        Logger.debug('🔥 APP_READY事件，但不自動觸發掃描，等待用戶打開Chat面板');
      });

      eventOn(tavern_events.GENERATION_ENDED, function(messageId) {
        setTimeout(() => {
          streamState.activeChatId = null;
          streamState.activeChatType = null;
        }, 1000);
      });
      
      // 🔥 新增：監聽面板加載事件
      eventOn('panel_loaded', function(panel_name) {
        Logger.debug(`🔥 面板 ${panel_name} 已加載，開始重新處理消息`);
        reprocessAllMessages();
      });
      
      // 🔥 新增：監聽消息重新處理請求
      eventOn('request_message_reprocess', function() {
        Logger.debug('🔥 收到重新處理消息請求');
        reprocessAllMessages();
      });
    }
    
    setupPeriodicCheck();
    setupMessageListener();
    
    // 注册 EventOnButton
    try {
      if (typeof eventOnButton === 'function') {
        eventOnButton('💬', handleManualUpdateChatPanel);
        Logger.success('手动更新按钮已设置');
      }
    } catch (error) {
      Logger.error('设置按钮失败', error);
    }
    
    flags.eventSystemInitialized = true;
  }

  function init_Chat() {
    Logger.debug('开始初始化');
    
    StateManager.cleanup();
    
    // 重置状态
    caches.knownChatIds.clear();
    flags.isManualScanMode = false;
    flags.hasPerformedInitialScan = false;
    caches.processedSystemMessages.clear();
    caches.processedRecallMessages.clear();
    
    setupEventSystem_Chat();
    
    // 🔥 新增：完整的初始化流程
    initializeProcessor();
    
    // 🔥 新增：設置chat面板事件監聽器
    setupChatPanelEventListener();
    
    Logger.success('初始化完成，等待chat面板打開...');
  }
  
  // 🔥 新增：完整的初始化流程
  function initializeProcessor() {
    try {
      Logger.debug('🔥 開始完整初始化流程');
      
      // 監聽各種需要重新處理的事件
      if (typeof eventOn === 'function') {
        eventOn('panel_loaded', reprocessAllMessages);
        eventOn('request_message_reprocess', reprocessAllMessages);
        eventOn(tavern_events.CHAT_CHANGED, () => {
          setTimeout(reprocessAllMessages, 1000);
        });
      }
      
      // 🔥 等待用户打开Chat面板，不自动触发处理
      Logger.debug('🔥 等待用戶打開Chat面板...');
      
    } catch (error) {
      Logger.error('🔥 初始化流程失敗:', error);
    }
  }

  // 🔥 新增：設置事件監聽器，等待chat面板觸發
  function setupChatPanelEventListener() {
    try {
      if (typeof eventOn === 'function') {
        Logger.debug('🔥 設置chat面板事件監聽器...');
        
        // 監聽chat面板打開事件
        eventOn('chat_panel_opened', async (data) => {
          Logger.debug('🔥 收到chat面板打開事件:', data);
          
          try {
            // 執行初始化掃描
            Logger.debug('🔥 開始執行chat面板初始化掃描');
            await performInitialScan();
            Logger.debug('🔥 chat面板初始化掃描完成');
          } catch (error) {
            Logger.error('🔥 chat面板初始化掃描失敗:', error);
          }
        });
        
        Logger.debug('🔥 chat面板事件監聽器設置完成');
      } else {
        Logger.warn('🔥 eventOn不可用，無法設置chat面板事件監聽器');
      }
    } catch (error) {
      Logger.error('🔥 設置chat面板事件監聽器失敗:', error);
    }
  }
  
  // 🆕 處理轉賬回應
  function processTransferResponse(msgObject) {
    try {
      const content = msgObject.content;
      const responseRegex = /\[transfer_response:(accept|reject),([^\]]+)\]/;
      const match = content.match(responseRegex);
      
      if (match) {
        const action = match[1]; // accept 或 reject
        const transferId = match[2]; // 轉賬ID
        
        console.log('[轉賬回應處理] 解析成功:', {
          action: action,
          transferId: transferId
        });
        
        // 更新轉賬卡片狀態
        updateTransferStatus(transferId, action);
        
        // 從消息內容中移除回應標籤
        msgObject.content = content.replace(responseRegex, '').trim();
        
        console.log('[轉賬回應處理] 處理完成，更新後內容:', msgObject.content);
      } else {
        console.warn('[轉賬回應處理] 格式不匹配:', content);
      }
    } catch (error) {
      console.error('[轉賬回應處理] 處理失敗:', error);
    }
  }
  
  // 🆕 處理禮物回應
  function processGiftResponse(msgObject) {
    try {
      const content = msgObject.content;
      const responseRegex = /\[gift_response:(accept|reject),([^\]]+)\]/;
      const match = content.match(responseRegex);
      
      if (match) {
        const action = match[1]; // accept 或 reject
        const giftId = match[2];
        
        console.log('[禮物回應處理] 解析成功:', {
          action: action,
          giftId: giftId
        });
        
        // 更新禮物卡片狀態
        updateGiftStatus(giftId, action);
        
        // 從消息內容中移除回應標籤
        msgObject.content = content.replace(responseRegex, '').trim();
        
        console.log('[禮物回應處理] 處理完成，更新後內容:', msgObject.content);
      } else {
        console.warn('[禮物回應處理] 格式不匹配:', content);
      }
    } catch (error) {
      console.error('[禮物回應處理] 處理失敗:', error);
    }
  }
  
  // 🆕 更新禮物卡片狀態
  function updateGiftStatus(giftId, action) {
    try {
      // 查找對應的禮物卡片
      const giftElements = document.querySelectorAll(`[data-gift-id="${giftId}"]`);
      
      if (giftElements.length > 0) {
        giftElements.forEach(element => {
          const statusElement = element.closest('.gift-status');
          if (statusElement) {
            // 停止倒計時器
            if (window.transferTimerManager) {
              window.transferTimerManager.stopTimer(`gift_${giftId}`);
            }
            
            // 隱藏倒計時顯示
            const timerElement = statusElement.querySelector('.gift-timer');
            if (timerElement) {
              timerElement.style.display = 'none';
            }
            
            // 移除舊的狀態類
            statusElement.classList.remove('pending', 'accepted', 'rejected', 'expired');
            
            // 添加新的狀態類
            if (action === 'accept') {
              statusElement.classList.add('accepted');
              statusElement.querySelector('.gift-status-icon').textContent = '✓';
              statusElement.querySelector('.gift-status-text').textContent = '已接受';
            } else if (action === 'reject') {
              statusElement.classList.add('rejected');
              statusElement.querySelector('.gift-status-icon').textContent = '✗';
              statusElement.querySelector('.gift-status-text').textContent = '已拒絕';
            }
            
            console.log('[禮物狀態更新] 成功更新:', {
              giftId: giftId,
              action: action
            });
          }
        });
      } else {
        console.warn('[禮物狀態更新] 未找到對應的禮物卡片:', giftId);
      }
    } catch (error) {
      console.error('[禮物狀態更新] 更新失敗:', error);
    }
  }
  
  // 🆕 根據發送者名稱更新轉賬卡片狀態
  function updateTransferStatusBySender(senderName, amount, action, note) {
    try {
      // 查找對應的轉賬卡片（根據發送者名稱和金額匹配）
      const transferElements = document.querySelectorAll('.transfer-status.pending[data-transfer-amount]');
      
      let foundTransfer = null;
      transferElements.forEach(element => {
        const transferAmount = element.getAttribute('data-transfer-amount');
        const transferReceiver = element.getAttribute('data-transfer-receiver');
        
        // 匹配發送者、金額和接收者
        if (transferAmount === amount.toString() && transferReceiver) {
          foundTransfer = element;
        }
      });
      
      if (foundTransfer) {
        const statusElement = foundTransfer.closest('.transfer-status');
        if (statusElement) {
          const transferId = statusElement.getAttribute('data-transfer-id');
          
          // 停止倒計時器
          if (window.transferTimerManager) {
            window.transferTimerManager.stopTimer(`transfer_${transferId}`);
          }
          
          // 隱藏倒計時顯示
          const timerElement = statusElement.querySelector('.transfer-timer');
          if (timerElement) {
            timerElement.style.display = 'none';
          }
          
          // 移除舊的狀態類
          statusElement.classList.remove('pending', 'accepted', 'rejected', 'expired');
          
          // 添加新的狀態類
          if (action === 'accept') {
            statusElement.classList.add('accepted');
            statusElement.querySelector('.transfer-status-icon').textContent = '✓';
            statusElement.querySelector('.transfer-status-text').textContent = '已接受';
          } else if (action === 'reject') {
            statusElement.classList.add('rejected');
            statusElement.querySelector('.transfer-status-icon').textContent = '✗';
            statusElement.querySelector('.transfer-status-text').textContent = '已拒絕';
          }
          
          console.log('[轉賬狀態更新] 成功更新:', {
            senderName: senderName,
            amount: amount,
            action: action,
            note: note
          });
        }
      } else {
        console.warn('[轉賬狀態更新] 未找到對應的轉賬卡片:', {
          senderName: senderName,
          amount: amount
        });
      }
    } catch (error) {
      console.error('[轉賬狀態更新] 更新失敗:', error);
    }
  }
  
  // 🆕 更新轉賬卡片狀態
  function updateTransferStatus(transferId, action) {
    try {
      // 查找對應的轉賬卡片
      const transferElements = document.querySelectorAll(`[data-transfer-id="${transferId}"]`);
      
      if (transferElements.length > 0) {
        transferElements.forEach(element => {
          const statusElement = element.closest('.transfer-status');
          if (statusElement) {
            // 停止倒計時器
            if (window.transferTimerManager) {
              window.transferTimerManager.stopTimer(`transfer_${transferId}`);
            }
            
            // 隱藏倒計時顯示
            const timerElement = statusElement.querySelector('.transfer-timer');
            if (timerElement) {
              timerElement.style.display = 'none';
            }
            
            // 移除舊的狀態類
            statusElement.classList.remove('pending', 'accepted', 'rejected', 'expired');
            
            // 添加新的狀態類
            if (action === 'accept') {
              statusElement.classList.add('accepted');
              statusElement.querySelector('.transfer-status-icon').textContent = '✓';
              statusElement.querySelector('.transfer-status-text').textContent = '已接受';
            } else if (action === 'reject') {
              statusElement.classList.add('rejected');
              statusElement.querySelector('.transfer-status-icon').textContent = '✗';
              statusElement.querySelector('.transfer-status-text').textContent = '已拒絕';
            }
            
            console.log('[轉賬狀態更新] 成功更新:', {
              transferId: transferId,
              action: action
            });
          }
        });
      } else {
        console.warn('[轉賬狀態更新] 未找到對應的轉賬卡片:', transferId);
      }
    } catch (error) {
      console.error('[轉賬狀態更新] 更新失敗:', error);
    }
  }

  // 🔥 新增：導出函數到全局（類似直播間處理器）
  window.scanAndProcessAllChatLines = handleManualUpdateChatPanel;
  window.performInitialScan = performInitialScan;
  window.init_Chat = init_Chat;
  
  // 🔥 新增：導出處理器對象到全局（類似直播間處理器）
  window.ChatProcessor = {
    initializeProcessor: init_Chat,
    scanAndProcessAllChatLines: handleManualUpdateChatPanel,
    performInitialScan: performInitialScan,
    handleManualUpdateChatPanel: handleManualUpdateChatPanel
  };

  // 启动处理器（只初始化事件系統，不自動掃描）
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init_Chat);
  } else {
    init_Chat();
  }
  
  // 🔥 移除：不再自動觸發初始化掃描，等待chat面板打開事件
  Logger.debug('🔥 chat-processor_mapver.js 已載入，等待chat面板打開事件...');

})();