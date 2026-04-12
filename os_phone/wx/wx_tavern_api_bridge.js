// ----------------------------------------------------------------
// wx_tavern_api_bridge.js (V1.0 - Direct API Communication)
// 功能：通过 TavernHelper API 直接获取消息，替代 DOM 监听
// 优势：
// 1. 不依赖 DOM 扫描，性能更好
// 2. 支持流式传输不掉消息
// 3. 实时获取消息，无延迟
// 4. 完全兼容 iframe 环境
// ----------------------------------------------------------------
(function() {
    console.log('[WX] 载入 Tavern API Bridge V1.0...');
    const win = window.parent || window;

    // ====== 状态管理 ======
    let LAST_MESSAGE_ID = -1;
    let LAST_CONTENT_HASH = ""; // 🔥 用于检测内容变化（流式传输）
    let IS_POLLING = false;
    let POLLING_INTERVAL = 500; // 500ms 轮询一次（比DOM扫描快3倍）
    let MESSAGE_CALLBACKS = [];
    let LAST_CHAT_ID = null; // 用于检测聊天室切换
    let IS_CHAT_MONITOR_ACTIVE = false;

    // ====== 核心函数：获取 TavernHelper ======
    function getHelper() {
        return win.TavernHelper ||
               (win.parent && win.parent.TavernHelper) ||
               (win.top && win.top.TavernHelper);
    }

    // ====== 核心函数：获取角色数据 ======
    function getCharacterData() {
        try {
            const ctx = win.SillyTavern && win.SillyTavern.getContext
                ? win.SillyTavern.getContext()
                : null;
            if (ctx && ctx.characters && ctx.characterId !== undefined) {
                const c = ctx.characters[ctx.characterId];
                if (c) return {
                    name: c.name,
                    description: c.description || "",
                    personality: c.personality || "",
                    scenario: c.scenario || "",
                    first_mes: c.first_mes || ""
                };
            }
        } catch (e) {
            console.warn('[Bridge] 无法获取角色数据:', e);
        }
        return { name: "AI", description: "", personality: "", scenario: "" };
    }

    // ====== 核心函数：解析 [wx_os] 协议 ======
    function parseWxProtocol(rawText) {
        const lines = rawText.split('\n');
        let chats = {};
        let currentId = "未分类";
        let currentObj = null;
        let lastRedPacket = null; // 追踪最後一個紅包消息

        lines.forEach(line => {
            line = line.trim();
            if (!line) return;

            // 检测 Chat 头
            const chatMatch = line.match(/^\[\s*Chat\s*[:：]\s*([^|\]\n]+)(?:\|\s*([^\]\n]+))?\s*\]/i);
            if (chatMatch) {
                let name = chatMatch[1].trim();
                let id = chatMatch[2] ? chatMatch[2].trim() : name;
                currentId = id;
                if (!chats[currentId]) {
                    chats[currentId] = {
                        name: name,
                        id: id,
                        messages: [],
                        lastTime: "",
                        members: [],
                        isGroup: false
                    };
                }
                currentObj = chats[currentId];
                lastRedPacket = null; // 重置紅包追蹤
                return;
            }

            if (!chats[currentId]) {
                chats[currentId] = {
                    name: currentId,
                    id: currentId,
                    messages: []
                };
                currentObj = chats[currentId];
            }

            // 时间标签
            if (line.match(/^\[\s*Time\s*\]/i)) {
                let timeStr = line.replace(/^\[\s*Time\s*\]/i, '').trim();
                currentObj.lastTime = timeStr;
                currentObj.messages.push({
                    type: "time",
                    content: timeStr,
                    isMe: false
                });
                lastRedPacket = null; // 時間標籤會打斷紅包追蹤
                return;
            }

            // 成员标签
            const withMatch = line.match(/^\[\s*With\s*[:：]\s*(.*?)\s*\]/i);
            if (withMatch) {
                currentObj.members = withMatch[1].split(/[,，、]/)
                    .map(s => s.trim())
                    .filter(s => s);
                currentObj.isGroup = currentObj.isGroup || currentObj.members.length > 2;
                return;
            }

            // 🔥 系统消息 - 檢測紅包領取記錄
            const sysMatch = line.match(/^\[\s*(?:系統|系统|System)\s*[:：]?\s*\]/i);
            if (sysMatch) {
                const content = line.replace(/^\[\s*(?:系統|系统|System)\s*[:：]?\s*\]/, '').trim();

                // 檢測是否為紅包領取記錄：包含「領取」且包含「紅包」
                // 格式: "角色名" 領取了紅包。(金額)
                const grabMatch = content.match(/[""]?(.*?)[""]?\s*領取了紅包.*?[（(](\d+(?:\.\d+)?)[）)]/i);

                if (grabMatch && lastRedPacket) {
                    const grabber = grabMatch[1].trim();
                    const amount = parseFloat(grabMatch[2]);

                    // 檢查是否已經存在（避免重複）
                    const exists = lastRedPacket.packet.list.some(item => item.name === grabber);
                    if (!exists) {
                        lastRedPacket.packet.list.push({
                            name: grabber,
                            amount: amount
                        });
                    }
                    return; // 吸附成功，不顯示為普通系統消息
                }

                // 普通系統消息
                if (content) {
                    currentObj.messages.push({
                        type: "system",
                        content: content,
                        isMe: false,
                        sender: "System"
                    });
                }
                lastRedPacket = null; // 普通系統消息會打斷紅包追蹤
                return;
            }

            // 消息内容
            const msgMatch = line.match(/^\[(.*?)(?:[:：])?\]/);
            if (msgMatch) {
                const role = msgMatch[1];
                let isMe = false;
                if (role.match(/^(You|Me|我|Self)$/i)) {
                    isMe = true;
                } else if (currentObj.members && currentObj.members.length > 0 &&
                          role === currentObj.members[0]) {
                    isMe = true;
                }
                let content = line.replace(/^\[.*?\]/, '').trim();

                // 🔥 檢測紅包消息：[RedPacket: 總金額 | 備註] 或 [紅包: 總金額] (備註: xxx)
                const redPacketMatch = content.match(/^\[\s*(?:紅包|红包|RedPacket)\s*[:：]\s*(\d+(?:\.\d+)?)\s*(?:\|\s*(.*?))?\s*\]/i);

                if (redPacketMatch) {
                    const total = parseFloat(redPacketMatch[1]);
                    let memo = redPacketMatch[2] ? redPacketMatch[2].trim() : "恭喜發財，大吉大利";

                    // 檢查是否有備註在括號中：(備註: xxx) 或 (备注: xxx)
                    const noteMatch = content.match(/[（(]\s*(?:備註|备注|Note)\s*[:：]\s*(.*?)[）)]/i);
                    if (noteMatch) {
                        memo = noteMatch[1].trim();
                    }

                    const packetMsg = {
                        type: "msg",
                        isMe: isMe,
                        content: `[RedPacket: ${memo}]`, // 顯示備註
                        sender: role,
                        packet: {
                            sender: role,
                            total: total,
                            memo: memo,
                            list: [] // 領取列表，會被後續的系統消息填充
                        }
                    };

                    currentObj.messages.push(packetMsg);
                    lastRedPacket = packetMsg; // 追蹤這個紅包
                    return;
                }

                // 普通消息
                if (content) {
                    currentObj.messages.push({
                        type: "msg",
                        isMe: isMe,
                        content: content,
                        sender: role
                    });
                    lastRedPacket = null; // 普通消息會打斷紅包追蹤
                }
            }
        });

        return chats;
    }

    // ====== 核心函数：检测聊天室切换 ======
    function checkChatChanged() {
        try {
            let currentChatId = null;

            // 方法1: 使用 getCurrentChatId
            if (win.SillyTavern && typeof win.SillyTavern.getCurrentChatId === 'function') {
                currentChatId = win.SillyTavern.getCurrentChatId();
            }
            // 方法2: 直接读取 chatId
            else if (win.SillyTavern && win.SillyTavern.chatId !== undefined) {
                currentChatId = win.SillyTavern.chatId;
            }
            // 方法3: 尝试从其他位置获取
            else if (win.chatId !== undefined) {
                currentChatId = win.chatId;
            }

            // 如果聊天室ID变更，强制重新加载
            if (currentChatId !== null && currentChatId !== undefined && currentChatId !== LAST_CHAT_ID) {
                console.log('[Bridge] 检测到聊天室切换:', LAST_CHAT_ID, '->', currentChatId);
                LAST_CHAT_ID = currentChatId;

                // 🔥 重置消息ID，强制重新加载所有消息
                LAST_MESSAGE_ID = -1;

                // 立即触发一次轮询
                pollNewMessages();
            }
        } catch (error) {
            console.warn('[Bridge] 检测聊天室切换时出错:', error);
        }
    }

    // ====== 核心函数：轮询新消息 ======
    async function pollNewMessages() {
        if (IS_POLLING) return; // 防止重复轮询
        IS_POLLING = true;

        try {
            const helper = getHelper();
            if (!helper || typeof helper.getLastMessageId !== 'function') {
                IS_POLLING = false;
                return;
            }

            const currentLastId = await helper.getLastMessageId();

            // 🔥 始终获取消息，检测内容变化（支持流式传输）
            if (currentLastId !== null && currentLastId !== undefined && currentLastId >= 0) {
                const messages = await helper.getChatMessages(`0-${currentLastId}`);
                if (!messages || !Array.isArray(messages)) {
                    IS_POLLING = false;
                    return;
                }

                // 只处理未隐藏的消息
                const cleanMessages = messages.filter(msg => msg.is_hidden !== true);

                // 提取所有 [wx_os] 内容
                let combinedContent = "";
                let wxMsgCount = 0;
                cleanMessages.forEach(msg => {
                    let txt = msg.message || msg.mes || "";
                    if (txt.includes('[wx_os]')) {
                        wxMsgCount++;
                        const matches = txt.match(/\[wx_os\]([\s\S]*?)(?:\[\/wx_os\]|$)/gi);
                        if (matches) {
                            matches.forEach(m => {
                                const content = m.replace(/\[wx_os\]/i, '')
                                                 .replace(/\[\/wx_os\]/i, '');
                                combinedContent += content + "\n";
                            });
                        }
                    }
                });

                // 🔥 计算内容哈希，检测变化
                const contentHash = combinedContent.length + "_" + combinedContent.substring(0, 100);
                const hasIdChanged = currentLastId !== LAST_MESSAGE_ID;
                const hasContentChanged = contentHash !== LAST_CONTENT_HASH;
                const isFirstLoad = LAST_MESSAGE_ID === -1;

                // 🔥 只有在有变化时才触发更新
                if (hasIdChanged || hasContentChanged || isFirstLoad) {
                    if (currentLastId < LAST_MESSAGE_ID) {
                        console.log(`[Bridge] 检测到消息减少（删除）: ${LAST_MESSAGE_ID} -> ${currentLastId}`);
                    } else if (currentLastId > LAST_MESSAGE_ID) {
                        console.log(`[Bridge] 检测到新消息: ${LAST_MESSAGE_ID} -> ${currentLastId}`);
                    } else if (hasContentChanged) {
                        console.log(`[Bridge] 检测到内容更新（流式传输）`);
                    } else {
                        console.log(`[Bridge] 首次加载，消息 ID: ${currentLastId}`);
                    }

                    console.log('[Bridge] 找到', wxMsgCount, '条 [wx_os] 消息');
                    console.log('[Bridge] 提取内容长度:', combinedContent.length);

                    // 🔥 无论内容是否为空，都要解析并通知（空内容会清空手机面板）
                    const parsedChats = combinedContent ? parseWxProtocol(combinedContent) : {};
                    console.log('[Bridge] 解析结果:', Object.keys(parsedChats).length, '个聊天室');

                    MESSAGE_CALLBACKS.forEach(callback => {
                        try {
                            callback(parsedChats, currentLastId);
                        } catch (e) {
                            console.error('[Bridge] 回调执行失败:', e);
                        }
                    });

                    if (!combinedContent) {
                        console.log('[Bridge] 当前聊天室无 [wx_os] 数据，已清空面板');
                    }

                    LAST_MESSAGE_ID = currentLastId;
                    LAST_CONTENT_HASH = contentHash;
                }
            }
        } catch (e) {
            console.error('[Bridge] 轮询失败:', e);
        } finally {
            IS_POLLING = false;
        }
    }

    // ====== 公开 API ======
    win.WX_TAVERN_API_BRIDGE = {
        /**
         * 启动消息轮询
         */
        start: function() {
            console.log('[Bridge] 启动消息轮询，间隔:', POLLING_INTERVAL, 'ms');

            // 🔥 立即执行一次轮询，加载已有的历史数据
            console.log('[Bridge] 正在加载历史数据...');
            pollNewMessages();

            // 🔥 使用 SillyTavern 全局事件系统（和"聊天內容處理器.js"相同方式）
            const tryRegisterEvents = () => {
                if (typeof eventOn === 'function' && typeof tavern_events !== 'undefined') {
                    console.log('[Bridge] 使用官方事件监听（eventOn）');

                    // 🔥 监听消息接收（非流式 + 流式结束）
                    eventOn(tavern_events.MESSAGE_RECEIVED, () => {
                        console.log('[Bridge] 檢測到 MESSAGE_RECEIVED 事件');
                        setTimeout(pollNewMessages, 200);
                    });

                    // 🔥 监听消息发送
                    eventOn(tavern_events.MESSAGE_SENT, () => {
                        console.log('[Bridge] 檢測到 MESSAGE_SENT 事件');
                        setTimeout(pollNewMessages, 200);
                    });

                    // 🔥 监听生成结束（包括流式和非流式）
                    eventOn(tavern_events.GENERATION_ENDED, () => {
                        console.log('[Bridge] 檢測到 GENERATION_ENDED 事件');
                        setTimeout(pollNewMessages, 200);
                    });

                    // 🔥 监听聊天室切换
                    eventOn(tavern_events.CHAT_CHANGED, () => {
                        console.log('[Bridge] 檢測到 CHAT_CHANGED 事件');
                        LAST_MESSAGE_ID = -1; // 重置
                        LAST_CONTENT_HASH = ""; // 重置
                        setTimeout(pollNewMessages, 100);
                    });

                    // 🔥 监听消息删除
                    eventOn(tavern_events.MESSAGE_DELETED, () => {
                        console.log('[Bridge] 檢測到 MESSAGE_DELETED 事件');
                        setTimeout(pollNewMessages, 200);
                    });

                    return true;
                }
                return false;
            };

            // 🔥 尝试注册事件（最多等待 10 秒）
            let attempts = 0;
            const maxAttempts = 20; // 20 次 × 500ms = 10 秒
            const checkInterval = setInterval(() => {
                attempts++;
                if (tryRegisterEvents()) {
                    clearInterval(checkInterval);
                    console.log('[Bridge] 事件系统注册成功（尝试次数: ' + attempts + '）');
                } else if (attempts >= maxAttempts) {
                    clearInterval(checkInterval);
                    console.warn('[Bridge] 找不到事件系統（已尝试 ' + attempts + ' 次），降级使用定時輪詢');
                    setInterval(pollNewMessages, 1000); // 1 秒轮询一次
                } else if (attempts % 5 === 0) {
                    console.log('[Bridge] 等待事件系统初始化... (尝试 ' + attempts + '/' + maxAttempts + ')');
                }
            }, 500);
        },

        /**
         * 设置轮询间隔
         * @param {number} ms - 毫秒数
         */
        setPollingInterval: function(ms) {
            POLLING_INTERVAL = Math.max(100, Math.min(5000, ms)); // 限制在 100ms-5s
            console.log('[Bridge] 轮询间隔已设置为:', POLLING_INTERVAL, 'ms');
        },

        /**
         * 手动触发一次轮询
         */
        poll: function() {
            pollNewMessages();
        },

        /**
         * 注册消息回调
         * @param {Function} callback - 回调函数 (chats, messageId) => void
         */
        onMessage: function(callback) {
            if (typeof callback === 'function') {
                MESSAGE_CALLBACKS.push(callback);
                console.log('[Bridge] 已注册消息回调，当前回调数:', MESSAGE_CALLBACKS.length);
            }
        },

        /**
         * 移除消息回调
         * @param {Function} callback - 要移除的回调函数
         */
        offMessage: function(callback) {
            const index = MESSAGE_CALLBACKS.indexOf(callback);
            if (index !== -1) {
                MESSAGE_CALLBACKS.splice(index, 1);
                console.log('[Bridge] 已移除消息回调，当前回调数:', MESSAGE_CALLBACKS.length);
            }
        },

        /**
         * 获取当前上下文（用于 API 模式）
         */
        getApiContext: async function() {
            const helper = getHelper();
            const charData = getCharacterData();

            // 获取世界书
            let loreData = "";
            try {
                if (win.WX_LOREBOOK && typeof win.WX_LOREBOOK.getPromptText === 'function') {
                    loreData = win.WX_LOREBOOK.getPromptText();
                }
            } catch (e) {
                console.warn('[Bridge] Lorebook 读取失败，跳过');
            }

            // 获取用户信息
            let userName = "User";
            let userDesc = "";
            try {
                if (helper && helper.getName) userName = helper.getName();
                if (win.SillyTavern && win.SillyTavern.getContext) {
                    const ctx = win.SillyTavern.getContext();
                    if (ctx && ctx.user && ctx.user.description) {
                        userDesc = ctx.user.description;
                    }
                }
            } catch (e) {
                console.warn('[Bridge] 用户信息读取失败');
            }

            // 获取历史消息
            let messages = [];
            try {
                const lastId = await helper.getLastMessageId();
                if (lastId >= 0) {
                    messages = await helper.getChatMessages(`0-${lastId}`);
                }
            } catch (e) {
                console.warn('[Bridge] 历史消息读取失败');
            }

            return {
                char: charData,
                user: { name: userName, description: userDesc },
                lore: loreData,
                history: messages || []
            };
        },

        /**
         * 手动触发一次轮询
         */
        poll: function() {
            pollNewMessages();
        },

        /**
         * 重置消息 ID（用于测试）
         */
        reset: function() {
            LAST_MESSAGE_ID = -1;
            console.log('[Bridge] 已重置消息 ID');
        }
    };

    console.log('[Bridge] Tavern API Bridge V1.0 就绪');
})();
