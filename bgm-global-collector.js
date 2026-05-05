/**
 * BGM Global Collector
 * 作用：全局監聽聊天消息，解析 [BGM|name]，建立 messageId -> bgmName 的映射，
 *      供任何面板（如 VN 面板）在當前 BGM 無效時回退查詢。
 * 注意：只讀、無副作用，不修改任何面板狀態，避免數據污染。
 */

(function () {
    if (window.BGMGlobalStore) return; // 單例

    const bgmByMessageId = new Map();
    let lastValidBgm = '';

    const isValidBgmName = (name) => {
        if (!name || typeof name !== 'string') return false;
        const s = name.trim().toLowerCase();
        return s !== '' && s !== 'none' && s !== 'null' && s !== 'auto';
    };

    async function recordFromMessageId(messageId) {
        try {
            console.log('[BGMGlobalStore] 🔥 嘗試記錄消息ID:', messageId);
            
            // 嘗試多個API來源
            let messages = null;
            if (window.TavernAPI?.getChatMessages) {
                messages = await window.TavernAPI.getChatMessages(messageId);
            } else if (window.TavernHelper?.getChatMessages) {
                messages = await window.TavernHelper.getChatMessages(messageId);
            } else if (window.getChatMessages) {
                messages = await window.getChatMessages(messageId);
            }
            
            if (!messages || messages.length === 0) {
                console.log('[BGMGlobalStore] 沒有獲取到消息內容');
                return;
            }
            
            const content = messages[0].message || '';
            const id = messages[0].message_id || messageId;
            
            console.log('[BGMGlobalStore] 檢查消息內容:', content.substring(0, 100) + '...');

            const m = content.match(/\[BGM\|([^\]]+)\]/i);
            if (m) {
                const bgmName = m[1].trim();
                console.log('[BGMGlobalStore] 🔥 找到BGM標籤:', bgmName);
                if (isValidBgmName(bgmName)) {
                    bgmByMessageId.set(id, bgmName);
                    lastValidBgm = bgmName;
                    console.log('[BGMGlobalStore] ✅ 記錄BGM成功:', id, bgmName);
                } else {
                    console.log('[BGMGlobalStore] ❌ BGM名稱無效:', bgmName);
                }
            } else {
                console.log('[BGMGlobalStore] 消息中沒有BGM標籤');
            }
        } catch (err) {
            console.warn('[BGMGlobalStore] ❌ 記錄失敗:', err);
        }
    }

    function getPrevValidBgm(currentMessageId) {
        if (typeof currentMessageId !== 'number') return lastValidBgm || null;
        let best = null;
        let bestDelta = Number.POSITIVE_INFINITY;
        for (const [mid, name] of bgmByMessageId.entries()) {
            if (mid < currentMessageId && isValidBgmName(name)) {
                const d = currentMessageId - mid;
                if (d < bestDelta) { bestDelta = d; best = name; }
            }
        }
        return best || lastValidBgm || null;
    }

    // 🔥 新增：預先載入所有歷史BGM數據
    async function preloadAllBGMData() {
        try {
            console.log('[BGMGlobalStore] 🔥 開始預先載入所有歷史BGM數據');
            
            // 獲取最後一條消息ID
            let lastMsgId = null;
            if (window.TavernAPI?.getLastMessageId) {
                lastMsgId = await window.TavernAPI.getLastMessageId();
            } else if (window.TavernHelper?.getLastMessageId) {
                lastMsgId = await window.TavernHelper.getLastMessageId();
            } else if (window.getLastMessageId) {
                lastMsgId = await window.getLastMessageId();
            }
            
            if (lastMsgId == null || lastMsgId < 0) {
                console.log('[BGMGlobalStore] 沒有找到有效的消息ID');
                return;
            }
            
            console.log('[BGMGlobalStore] 最後消息ID:', lastMsgId);
            
            // 獲取所有歷史消息
            let allMessages = null;
            if (window.TavernAPI?.getChatMessages) {
                allMessages = await window.TavernAPI.getChatMessages(`0-${lastMsgId}`);
            } else if (window.TavernHelper?.getChatMessages) {
                allMessages = await window.TavernHelper.getChatMessages(`0-${lastMsgId}`);
            } else if (window.getChatMessages) {
                allMessages = await window.getChatMessages(`0-${lastMsgId}`);
            }
            
            if (!allMessages || allMessages.length === 0) {
                console.log('[BGMGlobalStore] 沒有獲取到歷史消息');
                return;
            }
            
            console.log('[BGMGlobalStore] 獲取到歷史消息數量:', allMessages.length);
            
            // 按消息ID排序（從小到大）
            allMessages.sort((a, b) => (a.message_id || 0) - (b.message_id || 0));
            
            // 解析每條消息中的BGM
            let bgmCount = 0;
            for (const msg of allMessages) {
                const content = msg.message || '';
                const id = msg.message_id;
                
                const m = content.match(/\[BGM\|([^\]]+)\]/i);
                if (m) {
                    const bgmName = m[1].trim();
                    if (isValidBgmName(bgmName)) {
                        bgmByMessageId.set(id, bgmName);
                        lastValidBgm = bgmName; // 最後一個有效BGM
                        bgmCount++;
                        console.log('[BGMGlobalStore] ✅ 預載BGM:', id, bgmName);
                    }
                }
            }
            
            console.log('[BGMGlobalStore] 🔥 預載完成，共載入', bgmCount, '個BGM');
            console.log('[BGMGlobalStore] 最後有效BGM:', lastValidBgm);
            
        } catch (err) {
            console.warn('[BGMGlobalStore] ❌ 預載BGM數據失敗:', err);
        }
    }

    window.BGMGlobalStore = {
        put: (id, name) => { if (typeof id === 'number' && isValidBgmName(name)) { bgmByMessageId.set(id, name); lastValidBgm = name; } },
        get: (id) => bgmByMessageId.get(id) || null,
        getPrevValidBgm,
        // 取得候選清單：比 currentMessageId 小的 messageId，降序排列後取前 limit 個，返回對應的 BGM 名稱（可能重複）
        getPrevValidBGMCandidates: (currentMessageId, limit = 1000) => {
            if (typeof currentMessageId !== 'number') return [];
            const sorted = Array.from(bgmByMessageId.keys())
                .filter(mid => typeof mid === 'number' && mid < currentMessageId)
                .sort((a, b) => b - a)
                .slice(0, limit);
            return sorted.map(mid => bgmByMessageId.get(mid)).filter(Boolean);
        },
        getLastValid: () => lastValidBgm || null,
        size: () => bgmByMessageId.size,
        preloadAllBGMData // 導出預載函數
    };

    // 綁定事件：接收、更新、發送後都嘗試記錄
    console.log('[BGMGlobalStore] 🔥 初始化BGM全局收集器');
    console.log('[BGMGlobalStore] eventOn存在:', typeof eventOn === 'function');
    console.log('[BGMGlobalStore] tavern_events存在:', typeof tavern_events !== 'undefined');
    
    if (typeof eventOn === 'function' && typeof tavern_events !== 'undefined') {
        console.log('[BGMGlobalStore] ✅ 綁定事件監聽器');
        eventOn(tavern_events.MESSAGE_RECEIVED, (id) => {
            console.log('[BGMGlobalStore] 📨 收到MESSAGE_RECEIVED事件:', id);
            recordFromMessageId(id);
        });
        eventOn(tavern_events.MESSAGE_UPDATED, (id) => {
            console.log('[BGMGlobalStore] 📝 收到MESSAGE_UPDATED事件:', id);
            recordFromMessageId(id);
        });
        eventOn(tavern_events.MESSAGE_SENT, (id) => {
            console.log('[BGMGlobalStore] 📤 收到MESSAGE_SENT事件:', id);
            setTimeout(() => recordFromMessageId(id), 100);
        });
    } else {
        console.warn('[BGMGlobalStore] ❌ 事件系統未就緒，無法綁定監聽器');
        // 延遲重試
        setTimeout(() => {
            if (typeof eventOn === 'function' && typeof tavern_events !== 'undefined') {
                console.log('[BGMGlobalStore] 🔄 延遲綁定事件監聽器');
                eventOn(tavern_events.MESSAGE_RECEIVED, (id) => recordFromMessageId(id));
                eventOn(tavern_events.MESSAGE_UPDATED, (id) => recordFromMessageId(id));
                eventOn(tavern_events.MESSAGE_SENT, (id) => setTimeout(() => recordFromMessageId(id), 100));
            }
        }, 2000);
    }
})();


