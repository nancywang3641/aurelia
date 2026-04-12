// ----------------------------------------------------------------
// [檔案] summary_core.js (V13 - No Hidden Limit)
// 路徑：os_phone/rpg/summary_core.js
// 職責：
// 1. [自動/手動] 掃描並同步摘要。
// 2. [解除限制] 不再依賴 is_hidden，只要有 <summary> 標籤就會抓取。
// 3. [保存] 確保 Reroll/編輯 後可透過手動刷新校正數據。
// ----------------------------------------------------------------
(function() {
    console.log('📜 [Summary Core] V13 全域掃描版 初始化...');

    const SUMMARY_REGEX = /<summary>([\s\S]*?)<\/summary>/i;
    const STORAGE_PREFIX = 'os_summary_processed_';

    // --- 基礎工具 ---
    function getChatIdentifier() {
        if (window.SillyTavern && window.SillyTavern.getContext) {
            const ctx = window.SillyTavern.getContext();
            if (ctx && ctx.chatId) {
                let fileName = ctx.chatId.split(/[\\/]/).pop();
                fileName = fileName.replace(/\.jsonl?$/i, '');
                return fileName.trim().replace(/\s+/g, '_');
            }
        }
        return "Default_Chat";
    }

    function getProcessedIds(chatId) {
        try {
            const key = STORAGE_PREFIX + chatId;
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : [];
        } catch (e) { return []; }
    }

    function saveProcessedIds(chatId, ids) {
        try {
            const key = STORAGE_PREFIX + chatId;
            // 只保留最近 1000 條記錄，避免 localStorage 爆炸
            const saveList = ids.length > 1000 ? ids.slice(ids.length - 1000) : ids;
            localStorage.setItem(key, JSON.stringify(saveList));
        } catch (e) {}
    }

    function getLogEntryComment() { return `[RPG_LOG] - ${getChatIdentifier()}`; }
    function getDynamicKey() { return `[LOG_${getChatIdentifier()}]`; }

    // --- 核心功能：同步邏輯 ---
    // isSilent = true (自動模式，不彈窗)
    // isSilent = false (手動模式，彈窗提示)
    async function syncLogic(isSilent = false) {
        // 暴力尋找 Helper
        const helper = window.TavernHelper || window.parent.TavernHelper || window.top.TavernHelper;
        if (!helper) {
            if (!isSilent) alert("❌ 無法連接 TavernHelper (請刷新頁面)");
            return;
        }

        const chatId = getChatIdentifier();
        const processedIds = getProcessedIds(chatId);
        const newIdsToSave = [...processedIds];
        
        console.log(`📜 [Summary] 掃描中 (${isSilent ? '自動' : '手動'})... ID: ${chatId}`);

        try {
            // 獲取聊天記錄
            // 使用 '0-{{lastMessageId}}' 確保拿到最新範圍
            const allMessages = await helper.getChatMessages('0-{{lastMessageId}}'); 
            
            if (!allMessages || allMessages.length === 0) {
                if (!isSilent) alert("📭 聊天記錄為空");
                return;
            }

            let newSummariesText = "";
            let count = 0;

            for (const msg of allMessages) {
                // 🔥 V13 修改：移除隱藏判斷，對所有訊息一視同仁
                // if (msg.is_hidden !== true) continue; <--- 已移除
                
                let content = msg.message || msg.mes || msg.content || "";
                
                // 檢查是否包含 summary 標籤
                const match = content.match(SUMMARY_REGEX);
                if (!match) continue; // 沒有標籤就跳過

                const msgId = parseInt(msg.message_id);
                
                // 檢查是否已處理過 (防重複)
                if (newIdsToSave.includes(msgId)) continue;

                const summaryContent = match[1].trim();
                const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                
                // 格式化追加的文本
                newSummariesText += `\n\n🔹 [${timestamp} | ID:${msgId}] ${summaryContent}`;
                
                newIdsToSave.push(msgId);
                count++;
            }

            if (count === 0) {
                if (!isSilent) alert("✅ 沒有新摘要 (所有項目已歸檔)");
                return;
            }

            // 寫入世界書 (追加模式)
            const success = await appendToLorebook(helper, newSummariesText);

            if (success) {
                saveProcessedIds(chatId, newIdsToSave);
                
                // 廣播事件，通知 Panel 更新畫面
                const emit = window.eventEmit || window.parent.eventEmit || window.top.eventEmit;
                if (emit) emit('RPG_LOG_UPDATED');
                
                if (!isSilent) alert(`✅ 同步完成！新增 ${count} 條記錄。`);
                else console.log(`📜 [Summary] 自動同步完成，新增 ${count} 條`);
            } else {
                if (!isSilent) alert("❌ 寫入失敗");
            }
        } catch (e) {
            console.error("API Error:", e);
            if (!isSilent) alert("執行錯誤: " + e.message);
        }
    }

    async function appendToLorebook(helper, textToAppend) {
        try {
            const bookName = helper.getCurrentCharPrimaryLorebook();
            if (!bookName) return false;

            const targetComment = getLogEntryComment();
            const targetKey = getDynamicKey();
            
            const entries = await helper.getLorebookEntries(bookName);
            const existEntry = entries.find(e => e.comment === targetComment);

            if (existEntry) {
                const newContent = existEntry.content + textToAppend;
                await helper.updateLorebookEntriesWith(bookName, (list) => {
                    return list.map(entry => {
                        if (entry.comment === targetComment) {
                            return { ...entry, content: newContent, keys: [targetKey] };
                        }
                        return entry;
                    });
                });
            } else {
                const entryData = {
                    comment: targetComment,
                    keys: [targetKey],
                    content: `[冒險日誌 - ${getChatIdentifier()}]${textToAppend}`,
                    constant: false,
                    enabled: true,
                    position: 'before_char_defs',
                    order: 101
                };
                await helper.createLorebookEntries(bookName, [entryData]);
            }
            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    }

    // 🔥 新增：替換 log 條目內容（用於重置模式）
    async function replaceLogEntry(helper, newContent) {
        try {
            const bookName = helper.getCurrentCharPrimaryLorebook();
            if (!bookName) return false;

            const targetComment = getLogEntryComment();
            const targetKey = getDynamicKey();
            const entries = await helper.getLorebookEntries(bookName);
            const existEntry = entries.find(e => e.comment === targetComment);

            if (existEntry) {
                // 直接替換內容
                await helper.updateLorebookEntriesWith(bookName, (list) => {
                    return list.map(entry => {
                        if (entry.comment === targetComment) {
                            return { ...entry, content: newContent, keys: [targetKey] };
                        }
                        return entry;
                    });
                });
            } else {
                // 如果不存在，創建新條目
                const entryData = {
                    comment: targetComment,
                    keys: [targetKey],
                    content: newContent,
                    constant: false,
                    enabled: true,
                    position: 'before_char_defs',
                    order: 101
                };
                await helper.createLorebookEntries(bookName, [entryData]);
            }
            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    }

    // 🔥 新增：重置模式同步邏輯（清空當前聊天的 log 並重新掃描所有摘要）
    async function syncLogicReset(isSilent = false) {
        // 暴力尋找 Helper
        const helper = window.TavernHelper || window.parent.TavernHelper || window.top.TavernHelper;
        if (!helper) {
            if (!isSilent) alert("❌ 無法連接 TavernHelper (請刷新頁面)");
            return;
        }

        const chatId = getChatIdentifier();
        const targetComment = getLogEntryComment(); // 當前聊天的 log 條目標識
        
        console.log(`📜 [Summary] 重置模式掃描中 (${isSilent ? '自動' : '手動'})... 聊天ID: ${chatId}`);
        console.log(`📜 [Summary] 將清空當前條目: ${targetComment}`);

        try {
            // 1. 清空當前聊天的已處理 ID 列表
            saveProcessedIds(chatId, []);
            console.log(`📜 [Summary] 已清空當前聊天(${chatId})的處理記錄`);

            // 2. 清空當前聊天的 log 條目內容
            const bookName = helper.getCurrentCharPrimaryLorebook();
            if (bookName) {
                const entries = await helper.getLorebookEntries(bookName);
                const existEntry = entries.find(e => e.comment === targetComment);
                if (existEntry) {
                    // 只清空當前條目的內容，保留條目結構
                    await helper.updateLorebookEntriesWith(bookName, (list) => {
                        return list.map(entry => {
                            if (entry.comment === targetComment) {
                                console.log(`📜 [Summary] 正在清空條目: ${targetComment}`);
                                return { ...entry, content: `[冒險日誌 - ${chatId}]` };
                            }
                            return entry; // 其他條目保持不變
                        });
                    });
                    console.log(`📜 [Summary] 已清空當前條目的 log 內容`);
                } else {
                    console.log(`📜 [Summary] 當前條目不存在，將創建新條目`);
                }
            }

            // 3. 獲取所有聊天記錄（從 0 到最後）
            const allMessages = await helper.getChatMessages('0-{{lastMessageId}}'); 
            
            if (!allMessages || allMessages.length === 0) {
                if (!isSilent) alert("📭 聊天記錄為空");
                return;
            }

            let allSummariesText = `[冒險日誌 - ${chatId}]`;
            let count = 0;
            const newIdsToSave = [];

            // 4. 重新掃描所有消息（從 ID 0 到最後）
            console.log(`📜 [Summary] 開始掃描所有消息（從 ID 0 開始）...`);
            for (const msg of allMessages) {
                let content = msg.message || msg.mes || msg.content || "";
                
                // 檢查是否包含 summary 標籤
                const match = content.match(SUMMARY_REGEX);
                if (!match) continue; // 沒有標籤就跳過

                const msgId = parseInt(msg.message_id);
                const summaryContent = match[1].trim();
                const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                
                // 格式化追加的文本
                allSummariesText += `\n\n🔹 [${timestamp} | ID:${msgId}] ${summaryContent}`;
                
                newIdsToSave.push(msgId);
                count++;
            }

            if (count === 0) {
                if (!isSilent) alert("✅ 沒有找到任何摘要");
                console.log(`📜 [Summary] 未找到任何摘要`);
                return;
            }

            // 5. 直接替換當前條目的 log 內容（重置模式）
            console.log(`📜 [Summary] 正在替換當前條目的 log 內容，共 ${count} 條摘要...`);
            const success = await replaceLogEntry(helper, allSummariesText);

            if (success) {
                saveProcessedIds(chatId, newIdsToSave);
                
                // 廣播事件，通知 Panel 更新畫面
                const emit = window.eventEmit || window.parent.eventEmit || window.top.eventEmit;
                if (emit) emit('RPG_LOG_UPDATED');
                
                if (!isSilent) alert(`✅ 重置完成！已清空當前條目的 log，重新獲取 ${count} 條記錄。`);
                else console.log(`📜 [Summary] 重置模式完成，當前條目已更新，重新獲取 ${count} 條`);
            } else {
                if (!isSilent) alert("❌ 寫入失敗");
                console.error(`📜 [Summary] 替換 log 條目失敗`);
            }
        } catch (e) {
            console.error("API Error:", e);
            if (!isSilent) alert("執行錯誤: " + e.message);
        }
    }

    // --- 監聽器與接口掛載 ---
    
    // 1. 手動觸發 (供 Panel 按鈕呼叫)
    const API = { 
        sync: () => syncLogic(false), // false 代表手動，會彈窗
        syncReset: () => syncLogicReset(false) // 🔥 新增：重置模式同步
    };

    // 2. 自動監聽 (收到訊息時自動觸發)
    function initAutoListener() {
        // 如果 Tavern 環境還沒好，等一下
        if (!window.eventOn || !window.tavern_events) {
            setTimeout(initAutoListener, 1000);
            return;
        }
        
        // 監聽訊息接收事件
        window.eventOn(window.tavern_events.MESSAGE_RECEIVED, (id) => {
            // 延遲一點點確保數據已寫入
            setTimeout(() => {
                syncLogic(true); // true 代表靜默，不彈窗
            }, 800);
        });
        console.log('📜 [Summary Core] 自動監聽器已啟動');
    }

    try {
        window.OS_SUMMARY_CORE = API;
        if (window.parent && window.parent !== window) window.parent.OS_SUMMARY_CORE = API;
        if (window.top && window.top !== window) window.top.OS_SUMMARY_CORE = API;
        
        initAutoListener(); // 啟動監聽
        console.log('✅ [Summary Core] V13 掛載完成 (無 Hidden 限制)');
    } catch (e) {}

})();