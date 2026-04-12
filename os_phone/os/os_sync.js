// ----------------------------------------------------------------
// [檔案] os_sync.js (V3.2 - Safe Update Fix)
// 路徑：os_phone/os/os_sync.js
// 職責：同步聊天記錄。
// 🔥 緊急修復：修正 updateLorebookEntriesWith 誤將其他條目洗白的問題。
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入安全同步模組 (Sync V3.2)...');
    const win = window.parent || window;

    const TARGET_ENTRY_COMMENT = "[wx_app] 手機聊天備份";
    const ENTRY_KEYS = ['聊天', '聊天室', 'wx_os', '手机', '短信', 'message'];
    const ENTRY_CONSTANT = true;

    win.OS_SYNC = {
        // --- 輔助：解析名字 ---
        resolveChatName: function(id) {
            try {
                const raw = localStorage.getItem('wx_custom_contacts_v1');
                if (raw) {
                    const contacts = JSON.parse(raw);
                    if (contacts[id] && contacts[id].name) return contacts[id].name;
                }
            } catch(e) {}
            try {
                if (win.wxApp && win.wxApp.GLOBAL_CHATS && win.wxApp.GLOBAL_CHATS[id]) {
                    return win.wxApp.GLOBAL_CHATS[id].name;
                }
            } catch(e) {}
            return id;
        },

        // --- 核心功能：執行同步 ---
        run: async function() {
            try {
                if (!win.TavernHelper) { alert("❌ 找不到 TavernHelper"); return; }

                const bookName = win.TavernHelper.getCurrentCharPrimaryLorebook();
                if (!bookName) { alert("⚠️ 請先綁定世界書 (點擊地球儀)"); return; }

                const allChats = await win.OS_DB.getAllApiChats();
                if (!allChats || Object.keys(allChats).length === 0) { alert("📱 手機內尚無記錄"); return; }

                // 1. 準備當前用戶名 (備案)
                let currentUserFallback = "User";
                if (win.OS_USER && win.OS_USER.getInfo) {
                    const info = win.OS_USER.getInfo();
                    if (info.name && info.name !== 'User') currentUserFallback = info.name;
                }

                let syncContent = "【📱 PhoneOS 聊天記錄備份】\n系統提示：以下是手機內的對話歷史。請注意說話者的身分。\n";

                // 2. 遍歷聊天室
                for (const chatId in allChats) {
                    const chatData = allChats[chatId];
                    const chatTargetName = this.resolveChatName(chatId);
                    
                    syncContent += `\n=== [Chat: ${chatTargetName} | ${chatId}] ===\n`;

                    if (chatData.messages && Array.isArray(chatData.messages)) {
                        chatData.messages.forEach(msg => {
                            if (msg.role === 'system') return;

                            let sender = "";
                            if (msg.role === 'user' || msg.isMe) {
                                if (msg.senderName) sender = `[${msg.senderName}]`;
                                else sender = `[${currentUserFallback}]`;
                            } else {
                                if (msg.senderName) sender = `[${msg.senderName}]`;
                                else sender = `[${chatTargetName}]`;
                            }
                            
                            let cleanText = (msg.content || "").replace(/<[^>]+>/g, "").trim();
                            if (cleanText) {
                                syncContent += `${sender} ${cleanText}\n`;
                            }
                        });
                    }
                }

                // 3. 寫入世界書 (🔥 關鍵修復點)
                const entries = await win.TavernHelper.getLorebookEntries(bookName);
                const existEntry = entries.find(e => e.comment === TARGET_ENTRY_COMMENT);

                const newEntryData = {
                    comment: TARGET_ENTRY_COMMENT,
                    keys: ENTRY_KEYS,
                    content: syncContent,
                    constant: ENTRY_CONSTANT,
                    enabled: true,
                    position: 'before_char_defs',
                    order: 100
                };

                if (existEntry) {
                    console.log("[OS_SYNC] 更新現有條目...");
                    await win.TavernHelper.updateLorebookEntriesWith(bookName, (list) => {
                        return list.map(entry => {
                            // 🔥 如果是目標條目，更新它
                            if (entry.comment === TARGET_ENTRY_COMMENT) {
                                return { ...entry, ...newEntryData };
                            }
                            // 🔥🔥🔥 重點：如果不是目標，原封不動還回去！(之前這裡錯寫成 return {})
                            return entry; 
                        });
                    });
                    alert(`✅ 同步完成！\n聊天記錄已更新，其他條目保持不變。`);
                } else {
                    console.log("[OS_SYNC] 創建新條目...");
                    await win.TavernHelper.createLorebookEntries(bookName, [newEntryData]);
                    alert(`✅ 同步完成！已創建新條目。`);
                }

            } catch (e) {
                console.error("[OS_SYNC] Error:", e);
                alert("❌ 同步失敗: " + e.message);
            }
        }
    };
})();