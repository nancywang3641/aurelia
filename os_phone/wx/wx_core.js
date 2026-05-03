// ----------------------------------------------------------------
// [檔案 4] wx_core.js (V117.8 - Name Snapshot Fix)
// 功能：核心邏輯 (無省略完整版)
// 包含：氣泡流 (Bubble Stream)、渲染隊列、API 回覆處理、刪除保護
// 🔥 修復：
// 1. sendMsg 新增 senderName 快照，解決切換人設後同步錯亂問題。
// 2. parseAndProcess 新增 senderName 快照，解決NPC改名後歷史錯亂問題。
// ----------------------------------------------------------------
(async function () {
    console.log('[WeChat] App Core V117.8 (Name Snapshot Fix) Loaded');
    const win = window.parent || window;
    const doc = win.document;

    // 1. 依賴檢查
    if (window.WX_THEME) { window.WX_THEME.inject(doc); }
    if (!window.WX_VIEW) { console.error('錯誤：未檢測到 wx_view.js'); return; }

    // 2. 狀態管理
    let GLOBAL_CHATS = {};
    let GLOBAL_ACTIVE_ID = null;
    let GLOBAL_TAB = 'chat';
    let RENDER_QUEUE = [];
    let APP_CONTAINER = null;
    let PENDING_ACTION_TYPE = null;
    let RENDER_QUEUE_PROCESSING = false; 
    let LAST_RENDER_TIME = 0; 
    let IS_STREAMING_REPLY = false; // 🔥 防止重複觸發
    let DARK_MODE = localStorage.getItem('wx_dark_mode') === 'true';

    // --- HTML 轉純文字核心 ---
    function cleanHtmlToText(htmlContent) {
        let temp = htmlContent;
        temp = temp.replace(/<br\s*\/?>/gi, '\n');
        temp = temp.replace(/<\/p>/gi, '\n');
        temp = temp.replace(/<p.*?>/gi, '');
        temp = temp.replace(/<div>/gi, '\n');
        temp = temp.replace(/<\/div>/gi, '');
        temp = temp.replace(/<[^>]+>/g, '');
        const textarea = doc.createElement('textarea');
        textarea.innerHTML = temp;
        let decoded = textarea.value;
        decoded = decoded.replace(/^[""]\s*/gm, '');
        return decoded;
    }

    // --- 紅包數據管理 (🔥 新增) ---
    function saveRedPacketData(packetId, data) {
        try {
            const key = `wx_redpacket_${packetId}`;
            localStorage.setItem(key, JSON.stringify(data));
        } catch(e) { console.error('[RedPacket] 保存失敗:', e); }
    }
    
    function getRedPacketData(packetId) {
        try {
            const key = `wx_redpacket_${packetId}`;
            const data = localStorage.getItem(key);
            const result = data ? JSON.parse(data) : null;
            return result;
        } catch(e) { console.error('[RedPacket] 讀取失敗:', e, { packetId }); return null; }
    }
    
    // 確保紅包數據已保存（從消息內容中提取並保存）
    function ensureRedPacketData(content, senderName) {
        // 檢測 [RedPacket: 金額|備註|ID] 格式
        const redPacketMatch = content.match(/\[\s*(?:紅包|RedPacket)\s*[:：]\s*(.+?)\s*\]/i);
        if (!redPacketMatch) {
            return null;
        }
        
        const redPacketContent = redPacketMatch[1].trim();
        const parts = redPacketContent.split(/[|｜]/).map(s => s.trim()).filter(s => s);
        
        let amount = '0', memo = '恭喜發財，大吉大利', packetId = '';
        
        if (parts.length >= 3) {
            // 新格式：[金額|備註|紅包ID]
            amount = parts[0];
            memo = parts[1] || memo;
            packetId = parts[2];
        } else if (parts.length === 2) {
            // 兼容格式：[金額|備註] 或 [金額|紅包ID]
            amount = parts[0];
            if (parts[1].match(/^[a-zA-Z0-9_]+$/)) {
                packetId = parts[1];
            } else {
                memo = parts[1];
            }
        } else if (parts.length === 1 && parts[0]) {
            amount = parts[0];
        }
        
        // 如果沒有ID，生成一個
        if (!packetId) {
            // 生成紅包ID（3位數字）
            const randomNum = Math.floor(Math.random() * 1000);
            packetId = 'rp_' + String(randomNum).padStart(3, '0');
        }
        
        // 保存紅包數據（如果還沒有保存過）
        const existing = getRedPacketData(packetId);
        if (!existing) {
            const totalAmount = parseFloat(amount) || 0;
            // 默認紅包數量：根據金額計算，最小1個，最大100個，每個至少0.01元
            const maxCount = Math.floor(totalAmount / 0.01);
            const totalCount = Math.min(100, Math.max(1, maxCount));
            const packetData = {
                sender: senderName || "User",
                totalAmount: totalAmount,
                totalCount: totalCount,
                memo: memo,
                list: []
            };
            saveRedPacketData(packetId, packetData);
        }
        
        return packetId;
    }
    
    function processRedPacketGrab(packetId, grabberName, specifiedAmount = null) {
        const data = getRedPacketData(packetId);
        if (!data) {
            console.warn('[RedPacket Grab] 紅包數據不存在:', packetId);
            return null;
        }
        
        // 清理領取者名稱（移除可能的引號等）
        const cleanGrabberName = grabberName.replace(/^["']+|["']+$/g, '').trim();
        
        // 檢查是否已經領取過
        const alreadyGrabbed = data.list.find(item => item.name === cleanGrabberName);
        if (alreadyGrabbed) return alreadyGrabbed.amount; // 返回已領取的金額
        
        // 計算剩餘金額和數量
        const totalGrabbed = data.list.reduce((sum, item) => sum + item.amount, 0);
        const remainingAmount = data.totalAmount - totalGrabbed;
        const remainingCount = data.totalCount - data.list.length;
        
        if (remainingAmount <= 0 || remainingCount <= 0) return null;
        
        // 決定領取金額：如果AI指定了金額則使用指定金額，否則隨機生成
        let grabAmount;
        if (specifiedAmount !== null && specifiedAmount > 0) {
            // AI指定了金額，使用指定金額（但不超過剩餘金額）
            grabAmount = Math.min(specifiedAmount, remainingAmount);
            grabAmount = Math.round(grabAmount * 100) / 100;
        } else {
            // 隨機分配金額（最後一個領取剩餘全部，其他隨機）
            if (remainingCount === 1) {
                grabAmount = Math.round(remainingAmount * 100) / 100; // 最後一個領取剩餘全部
            } else {
                // 隨機分配，最小0.01，最大不超過剩餘金額的90%（留給其他人）
                const maxAmount = Math.min(remainingAmount * 0.9, remainingAmount - (remainingCount - 1) * 0.01);
                const minAmount = 0.01;
                grabAmount = Math.round((Math.random() * (maxAmount - minAmount) + minAmount) * 100) / 100;
            }
        }
        
        // 添加到領取列表
        data.list.push({
            name: cleanGrabberName,
            amount: grabAmount,
            time: new Date().toLocaleString('zh-TW')
        });

        // 🔥 連動經濟系統（只有當前用戶領取時才增加餘額）
        // 獲取當前用戶名稱
        let currentUserName = "User";
        if (win.WX_USER && typeof win.WX_USER.getInfo === 'function') {
            const userInfo = win.WX_USER.getInfo();
            currentUserName = userInfo.name || "User";
        }
        
        // 只有當領取者是當前用戶時，才增加餘額
        if (win.OS_ECONOMY && grabAmount > 0 && cleanGrabberName === currentUserName) {
            const senderName = data.sender || '未知';
            win.OS_ECONOMY.transaction(grabAmount, `微信紅包 - 來自${senderName}`);
        }

        // 保存數據
        saveRedPacketData(packetId, data);
        return grabAmount; // 返回領取的金額
    }

    // --- 成員ID轉換為名稱 (🔥 修復With顯示問題) ---
    function convertMemberIdsToNames(memberIds) {
        if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
            return [];
        }
        
        const allContacts = (win.WX_CONTACTS && typeof win.WX_CONTACTS.getAllCustomContacts === 'function') 
            ? win.WX_CONTACTS.getAllCustomContacts() 
            : [];
        
        // 獲取當前用戶名稱
        let currentUserName = "User";
        if (win.WX_USER && typeof win.WX_USER.getInfo === 'function') {
            const userInfo = win.WX_USER.getInfo();
            currentUserName = userInfo.name || "User";
        }
        
        return memberIds.map(memberId => {
            // 特殊處理 "User" ID
            if (memberId === "User" || memberId === "user") {
                return currentUserName;
            }
            
            // 查找對應的聯繫人（根據ID查找）
            const contact = allContacts.find(c => c.id === memberId);
            if (contact && contact.name) {
                return contact.name;
            }
            
            // 如果找不到對應的聯繫人，返回memberId本身（可能是名稱，或無法轉換的ID）
            // 這樣可以兼容舊數據或已經存儲為名稱的情況
            return memberId;
        });
    }

    // --- 系統意圖處理器 ---
    // 返回處理後的系統消息對象，如果不需要處理則返回null
    function processSystemIntent(content, ctx) {
        if (!content || !ctx.chatId) return null;

        // 處理 [System: 更改簽名 to XXX]
        const bioMatch = content.match(/(?:更改|修改|更新|换|變更|changed?|updated?|set).{0,6}(?:簽名|签名|Bio|Signature|狀態|status).{0,6}[:：为為to]\s*(.*)/i);
        if (bioMatch) {
            let newBio = bioMatch[1].replace(/["']/g, "").trim();
            if (newBio.endsWith(']')) newBio = newBio.slice(0, -1);
            if (newBio && GLOBAL_CHATS[ctx.chatId]) {
                GLOBAL_CHATS[ctx.chatId].desc = newBio;
                GLOBAL_CHATS[ctx.chatId].bio = newBio;
                try {
                    const key = `wx_chat_settings_${ctx.chatId}`;
                    const settings = localStorage.getItem(key) ? JSON.parse(localStorage.getItem(key)) : {};
                    if (GLOBAL_CHATS[ctx.chatId].isGroup) settings.groupNotice = newBio;
                    else settings.targetBio = newBio;
                    localStorage.setItem(key, JSON.stringify(settings));
                } catch(e) {}
                return { type: 'system', content: `📝 ${ctx.chatName} 更新了簽名：${newBio}`, isMe: false }; 
            }
        }
        // 處理 [System: XXX領取了紅包|紅包ID] 或 [System: XXX領取了紅包 4.44元|紅包ID]
        // AI必須輸出金額，不執行JS隨機抽取（只有用戶點擊紅包時才執行JS隨機抽取）
        const redPacketGrabMatch1 = content.match(/(.*?)(?:領取|领取|領了|grabbed|received).*?(?:紅包|红包|RedPacket)([^|｜]*)[|｜](.+)/i);
        if (redPacketGrabMatch1) {
            const grabberName = redPacketGrabMatch1[1].trim();
            const amountText = redPacketGrabMatch1[2].trim(); // 可能包含金額，如 " 4.44元" 或空字符串
            let packetId = redPacketGrabMatch1[3].trim();
            // 移除末尾可能存在的 ] 字符（如果系統消息格式是 [系統: ...|ID]）
            packetId = packetId.replace(/\]+\s*$/, '').trim();
            
            // 嘗試從amountText中提取AI指定的金額（AI必須輸出金額）
            let specifiedAmount = null;
            const amountMatch = amountText.match(/([\d.]+)\s*元?/);
            if (amountMatch) {
                specifiedAmount = parseFloat(amountMatch[1]);
            }
            
            if (packetId) {
                // AI必須輸出金額，否則不處理（返回null，讓它作為普通系統消息處理）
                if (specifiedAmount === null || specifiedAmount <= 0) {
                    console.warn('[SystemIntent] AI未指定金額，不處理紅包領取（要求AI輸出金額）');
                    return null; // 返回null，讓它作為普通系統消息處理
                }
                
                // AI指定了金額，使用AI的金額更新紅包數據
                const grabAmount = processRedPacketGrab(packetId, grabberName, specifiedAmount);
                if (grabAmount !== null) {
                    // 保持AI的原始內容（包含AI指定的金額）
                    return { type: 'system', content: content, isMe: false };
                } else {
                    console.warn('[SystemIntent] processRedPacketGrab 返回 null，領取失敗');
                }
            } else {
                console.warn('[SystemIntent] packetId 為空，無法處理');
            }
        }
        // 兼容格式：[系統] XXX領取了紅包 (rp_12345) - 同樣要求AI輸出金額
        const redPacketGrabMatch2 = content.match(/(.*?)(?:領取|领取|領了|grabbed|received).*?(?:紅包|红包|RedPacket)(.*?)[\(（]([a-zA-Z0-9_]+)[\)）]/i);
        if (redPacketGrabMatch2) {
            const grabberName = redPacketGrabMatch2[1].trim();
            const amountText = redPacketGrabMatch2[2].trim();
            let packetId = redPacketGrabMatch2[3].trim();
            // 移除末尾可能存在的 ] 字符
            packetId = packetId.replace(/\]$/, '');
            
            // 嘗試從amountText中提取AI指定的金額（AI必須輸出金額）
            let specifiedAmount = null;
            const amountMatch = amountText.match(/([\d.]+)\s*元?/);
            if (amountMatch) {
                specifiedAmount = parseFloat(amountMatch[1]);
            }
            
            if (packetId) {
                // AI必須輸出金額，否則不處理
                if (specifiedAmount === null || specifiedAmount <= 0) {
                    console.warn('[SystemIntent] 兼容格式：AI未指定金額，不處理紅包領取');
                    return null;
                }
                
                const grabAmount = processRedPacketGrab(packetId, grabberName, specifiedAmount);
                if (grabAmount !== null) {
                    // 保持AI的原始內容
                    return { type: 'system', content: content, isMe: false };
                }
            }
        }
        
        // 處理 [System: Accept 物品名|Gft_ID] 或 [System: Return 物品名|Gft_ID]
        const giftActionMatch1 = content.match(/^\s*(Accept|Return|接收|接收了|收下|收下了|退回|退回了|拒绝|拒絕)\s+(.+?)\s*[|｜](.+)$/i);
        if (giftActionMatch1) {
            const action = giftActionMatch1[1].trim().toLowerCase();
            const itemName = giftActionMatch1[2].trim();
            const giftId = giftActionMatch1[3].trim();
            const isAccept = action === 'accept' || action === '接收' || action === '接收了' || action === '收下' || action === '收下了';
            const uniqueId = giftId.startsWith('ID_') ? giftId : ('ID_' + giftId);
            localStorage.setItem(uniqueId, isAccept ? 'accepted' : 'returned');
            return { type: 'system', content: content, isMe: false };
        }
        // 兼容格式：[系統] XXX接收了禮物 (Gft_423) 或 [系統] XXX拒絕了禮物 (Gft_423)
        const giftActionMatch2 = content.match(/(.*?)(?:接收|接收了|收下|收下了|Accept|退回|退回了|拒绝|拒絕|Return).*?(?:禮物|礼物|Gift).*?[\(（]([a-zA-Z0-9_]+)[\)）]/i);
        if (giftActionMatch2) {
            const actionText = giftActionMatch2[1].trim().toLowerCase();
            const giftId = giftActionMatch2[2].trim();
            const isAccept = actionText.includes('接收') || actionText.includes('收下') || actionText.includes('accept');
            const uniqueId = giftId.startsWith('ID_') ? giftId : ('ID_' + giftId);
            localStorage.setItem(uniqueId, isAccept ? 'accepted' : 'returned');
            return { type: 'system', content: content, isMe: false };
        }
        
        // 處理 [System: Accept 金額|Txn_ID] 或 [System: Return 金額|Txn_ID]
        // 先清理 content，移除可能的 ] 字符
        let cleanContent = content.trim().replace(/\]+\s*$/, '');
        const transferActionMatch1 = cleanContent.match(/^\s*(Accept|Return|接收|接收了|收下|收下了|退回|退回了|拒绝|拒絕)\s+(\d+(?:\.\d+)?)\s*[|｜](.+)$/i);
        if (transferActionMatch1) {
            const action = transferActionMatch1[1].trim().toLowerCase();
            const amount = transferActionMatch1[2].trim();
            let txnId = transferActionMatch1[3].trim();
            // 移除末尾可能存在的 ] 字符
            txnId = txnId.replace(/\]+\s*$/, '').trim();
            const isAccept = action === 'accept' || action === '接收' || action === '接收了' || action === '收下' || action === '收下了';
            const uniqueId = txnId.startsWith('ID_') ? txnId : ('ID_' + txnId);
            const transferKey = `wx_transfer_${txnId}`;
            
            // 🔥 檢查轉帳狀態和時效性
            const transferDataStr = localStorage.getItem(transferKey);
            if (transferDataStr) {
                const transferData = JSON.parse(transferDataStr);
                const now = Date.now();
                const elapsed = now - transferData.timestamp;
                const tenMinutes = 10 * 60 * 1000;
                
                if (isAccept) {
                    // 接收：檢查是否在10分鐘內且狀態為pending
                    if (transferData.status === 'pending' && elapsed <= tenMinutes) {
                        // 扣款並轉帳給對方
                        if (win.OS_ECONOMY) {
                            const amountNum = parseFloat(amount);
                            const success = win.OS_ECONOMY.transaction(-amountNum, `微信轉帳給 ${transferData.targetName}`);
                            if (success) {
                                // 更新轉帳狀態
                                transferData.status = 'accepted';
                                localStorage.setItem(transferKey, JSON.stringify(transferData));
                                localStorage.setItem(uniqueId, 'accepted');
                            } else {
                                // 餘額不足，視為拒絕
                                transferData.status = 'returned';
                                localStorage.setItem(transferKey, JSON.stringify(transferData));
                                localStorage.setItem(uniqueId, 'returned');
                                const displayContent = `轉帳失敗：餘額不足`;
                                return { type: 'system', content: displayContent, isMe: false };
                            }
                        } else {
                            // 沒有經濟系統，直接標記為接收
                            transferData.status = 'accepted';
                            localStorage.setItem(transferKey, JSON.stringify(transferData));
                            localStorage.setItem(uniqueId, 'accepted');
                        }
                    } else if (transferData.status === 'expired' || elapsed > tenMinutes) {
                        // 已過期，視為拒絕
                        transferData.status = 'expired';
                        localStorage.setItem(transferKey, JSON.stringify(transferData));
                        localStorage.setItem(uniqueId, 'expired');
                        const displayContent = `轉帳已過期（10分鐘）`;
                        return { type: 'system', content: displayContent, isMe: false };
                    } else if (transferData.status !== 'pending') {
                        // 已經處理過（accepted/returned），不重複處理
                        localStorage.setItem(uniqueId, transferData.status);
                    }
                } else {
                    // 拒絕：不扣款，只更新狀態
                    transferData.status = 'returned';
                    localStorage.setItem(transferKey, JSON.stringify(transferData));
                    localStorage.setItem(uniqueId, 'returned');
                }
            } else {
                // 沒有找到轉帳記錄，可能是舊格式或手動輸入，直接標記狀態
                localStorage.setItem(uniqueId, isAccept ? 'accepted' : 'returned');
            }
            
            // 更新系統消息內容，使用統一的顯示格式
            const displayContent = isAccept ? `對方已接收轉帳 ${amount}元` : `對方已拒絕轉帳 ${amount}元`;
            
            // 🔥 強制觸發重新渲染，以便更新轉帳卡片狀態
            setTimeout(() => {
                if (win.wxApp && typeof win.wxApp.render === 'function') {
                    win.wxApp.render();
                }
            }, 200);
            
            return { type: 'system', content: displayContent, isMe: false };
        }
        // 兼容格式：[系統] XXX接收了轉帳 (Tnx_123) 或 [系統] XXX退回轉帳 (Tnx_123)
        const transferActionMatch2 = content.match(/(.*?)(?:接收|接收了|收下|收下了|Accept|退回|退回了|拒绝|拒絕|Return).*?(?:轉帳|转账|Transfer).*?[\(（]([a-zA-Z0-9_]+)[\)）]/i);
        if (transferActionMatch2) {
            const actionText = transferActionMatch2[1].trim().toLowerCase();
            const txnId = transferActionMatch2[2].trim();
            const isAccept = actionText.includes('接收') || actionText.includes('收下') || actionText.includes('accept');
            const uniqueId = txnId.startsWith('ID_') ? txnId : ('ID_' + txnId);
            localStorage.setItem(uniqueId, isAccept ? 'accepted' : 'returned');
            return { type: 'system', content: content, isMe: false };
        }
        
        // 處理舊格式 [System: 領取紅包]（兼容）
        if (content.match(/(?:領取|领取|Received|Accepted).*(?:紅包|红包|RedPacket|轉帳|转账|Transfer)/i)) {
            return { type: 'system', content: content, isMe: false };
        }
        return null;
    }

    // --- 解析邏輯 (將長文本切成陣列) ---
    function parseAndProcess(fullText) {
        let cleanText = fullText.trim();
        cleanText = cleanText.replace(/\[\s*wx_os\s*\]/gi, '').replace(/\[\s*\/wx_os\s*\]/gi, '').trim();
        cleanText = cleanText.replace(/\[\s*(?:紅包|RedPacket)\s*[:：]\s*(\d+(?:\.\d+)?)\s*[\(（]\s*(?:備註|备注|Note)?\s*[:：]?\s*(.*?)\s*[\)）]/gi, '[RedPacket: $1 | $2]');

        // 🔥 關鍵：這裡會依照換行符號切割成多個泡泡
        const lines = cleanText.split('\n');
        const extractedMessages = [];
        
        let ctx = { chatName: "Unknown", chatId: "temp", members: [], lastTime: "" };
        if (GLOBAL_ACTIVE_ID && GLOBAL_CHATS[GLOBAL_ACTIVE_ID]) {
            const c = GLOBAL_CHATS[GLOBAL_ACTIVE_ID];
            ctx.chatName = c.name; ctx.chatId = c.id; ctx.members = c.members || [];
        }
        
        // 🔥 第一遍掃描：預先處理上下文信息（Chat, With, Time）並保存所有紅包數據
        let tempCtx = { chatName: ctx.chatName, chatId: ctx.chatId, members: ctx.members };
        lines.forEach(line => {
            line = line.trim();
            if (!line) return;
            
            // 處理 [Chat: ID] 標頭
            const chatMatch = line.match(/^\[\s*Chat\s*[:：]\s*([^|\]\n]+)(?:\|\s*([^\]\n]+))?\s*\]/i);
            if (chatMatch) {
                let name = chatMatch[1].trim();
                let id = chatMatch[2] ? chatMatch[2].trim() : name;
                tempCtx.chatName = name;
                tempCtx.chatId = id;
                return;
            }
            
            // 處理 [With: ...]
            const withMatch = line.match(/^\[\s*With\s*[:：]\s*(.*?)\s*\]/i);
            if (withMatch) {
                tempCtx.members = withMatch[1].split(/[,，、]/).map(s => s.trim()).filter(s => s);
                return;
            }
            
            // 處理普通消息中的紅包：預先保存紅包數據
            const nameMatch = line.match(/^\[(.*?)(?:[:：])?\]\s*(.*)/);
            if (nameMatch) {
                const tag = nameMatch[1];
                const content = nameMatch[2].trim();
                if (content && content.match(/\[\s*(?:紅包|RedPacket)\s*[:：]/i)) {
                    // 獲取發送者名稱
                    let senderName = tempCtx.chatName || "User";
                    if (!tag.match(/^(语音|Voice|图片|Img|红包|RedPacket|表情包|Sticker|转账|Transfer|位置|Location|定位|视频|Video|文件|File|礼品|Gift|礼物)$/i)) {
                        senderName = tag;
                    }
                    ensureRedPacketData(content, senderName);
                }
            }
        });

        lines.forEach(line => {
            line = line.trim(); 
            if (!line) return;

            // 處理 [Chat: ID] 標頭
            const chatMatch = line.match(/^\[\s*Chat\s*[:：]\s*([^|\]\n]+)(?:\|\s*([^\]\n]+))?\s*\]/i);
            if (chatMatch) {
                let name = chatMatch[1].trim(); 
                let id = chatMatch[2] ? chatMatch[2].trim() : name;
                ctx.chatName = name; ctx.chatId = id;
                if (!GLOBAL_CHATS[id]) { GLOBAL_CHATS[id] = { name: name, id: id, messages: [], lastTime: '', members: [], isGroup: false, unread: true, pushedCount: 0, renderedCount: 0 }; } 
                else { GLOBAL_CHATS[id].name = name; }
                return;
            }

            // 處理 [With: ...]
            const withMatch = line.match(/^\[\s*With\s*[:：]\s*(.*?)\s*\]/i);
            if (withMatch) {
                ctx.members = withMatch[1].split(/[,，、]/).map(s => s.trim()).filter(s => s);
                if (GLOBAL_CHATS[ctx.chatId]) { GLOBAL_CHATS[ctx.chatId].members = ctx.members; GLOBAL_CHATS[ctx.chatId].isGroup = GLOBAL_CHATS[ctx.chatId].isGroup || ctx.members.length > 2; }
                return;
            }

            // 處理 [Time]
            if (line.match(/^\[\s*Time\s*\]/i)) {
                let timeStr = line.replace(/^\[\s*Time\s*\]/i, '').trim();
                if (timeStr && GLOBAL_CHATS[ctx.chatId]) {
                    GLOBAL_CHATS[ctx.chatId].lastTime = timeStr;
                    // 添加到extractedMessages以保持順序
                    extractedMessages.push({ type: 'time', content: timeStr, isMe: false });
                }
                ctx.lastTime = timeStr; return;
            }

            // 處理 [System]
            const sysMatch = line.match(/^\[\s*(Notice|System|系統|系统)\s*([:：\]])\s*(.*)/i);
            if (sysMatch) {
                let content = sysMatch[3] || "";
                if (!content && !line.includes(':') && !line.includes('：')) { content = line.replace(/^\[\s*(Notice|System|系統|系统)\s*\]\s*/i, ''); }
                // 移除末尾的 ] 字符（如果存在）
                content = content.replace(/\]+\s*$/, '').trim();
                if (content) {
                    const sysMsgObj = processSystemIntent(content, ctx);
                    if (sysMsgObj) {
                        // 返回處理後的系統消息對象，加入到extractedMessages以保持順序
                        extractedMessages.push(sysMsgObj);
                    } else if (GLOBAL_CHATS[ctx.chatId]) {
                        // 如果沒有特殊處理，添加普通系統消息
                        extractedMessages.push({ type: 'system', content: content, isMe: false });
                    }
                }
                return; 
            }

            // 處理普通對話
            const nameMatch = line.match(/^\[(.*?)(?:[:：])?\]\s*(.*)/); 
            let sender = ctx.chatName; let content = line; let isMe = false;

            if (nameMatch) {
                const tag = nameMatch[1];
                if (!tag.match(/^(语音|Voice|图片|Img|红包|RedPacket|表情包|Sticker|转账|Transfer|位置|Location|定位|视频|Video|文件|File|礼品|Gift|礼物)$/i)) {
                    sender = tag; content = nameMatch[2].trim();
                    if (sender.match(/^(You|Me|我|Self|主角|User)$/i)) {
                        isMe = true;
                    } else if (ctx.members.length > 0) {
                        // With 清單 members[0] 永遠是主角（用戶），不論私聊還是群聊
                        isMe = (sender === ctx.members[0]);
                    } else {
                        // 沒有 With 清單時才用舊邏輯（sender 不是聊天室同名角色 = 用戶）
                        const chatObj = GLOBAL_CHATS[ctx.chatId];
                        isMe = (chatObj && !chatObj.isGroup) ? (sender !== ctx.chatName) : false;
                    }
                } else { content = line; }
            }

            if (!content) return;

            // 🔥 處理帶發送者標籤的系統消息：[丹] [系統: 丹領取了紅包|rp_leon_001]
            const embeddedSysMatch = content.match(/^\[\s*(Notice|System|系統|系统)\s*[:：]\s*(.*)/i);
            if (embeddedSysMatch) {
                let sysContent = embeddedSysMatch[2].trim();
                // 移除末尾的 ] 字符（如果存在）
                sysContent = sysContent.replace(/\]+\s*$/, '').trim();
                const sysMsgObj = processSystemIntent(sysContent, ctx);
                if (sysMsgObj) {
                    extractedMessages.push(sysMsgObj);
                    return;
                }
            }
            
            // 注意：紅包數據已在第一遍掃描時保存，這裡不需要再次保存
            
            const memberNames = convertMemberIdsToNames(ctx.members);
            const memberStr = memberNames.length > 0 ? memberNames.join(', ') : ctx.chatName;
            const singleRaw = `[Chat: ${ctx.chatName}|${ctx.chatId}]\n[With: ${memberStr}]\n[${sender}] ${content}`;

            if (GLOBAL_CHATS[ctx.chatId]) {
                // 🔥 [Fix] NPC 訊息也打上 senderName 快照，防止 NPC 改名後歷史錯亂
                const msgObj = { 
                    type: 'msg', 
                    isMe: isMe, 
                    content: content, 
                    sender: sender, 
                    senderName: sender, // <--- 新增
                    raw: singleRaw 
                };
                extractedMessages.push(msgObj); 
            }
        });
        return extractedMessages;
    }

    // --- 渲染隊列處理器 ---
    function processRenderQueue() {
        if (RENDER_QUEUE_PROCESSING || RENDER_QUEUE.length === 0 || !APP_CONTAINER) return;
        RENDER_QUEUE_PROCESSING = true;
        const batchSize = 5; let processed = 0;
        while (RENDER_QUEUE.length > 0 && processed < batchSize) {
            const nextItem = RENDER_QUEUE.shift();
            const roomContainer = APP_CONTAINER.querySelector('#wxRoomContent');
            if (nextItem.chatId === GLOBAL_ACTIVE_ID && roomContainer) {
                const currentChat = GLOBAL_CHATS[GLOBAL_ACTIVE_ID];
                if (currentChat) {
                    if (window.WX_VIEW && typeof window.WX_VIEW.renderBubble === 'function') {
                        try {
                            const html = window.WX_VIEW.renderBubble(nextItem.msg, currentChat, true, nextItem.index);
                            roomContainer.insertAdjacentHTML('beforeend', html);
                            currentChat.renderedCount = Math.max(currentChat.renderedCount, nextItem.index + 1);
                        } catch (e) { console.error('[Queue] 渲染失敗:', e); }
                    }
                }
            }
            processed++;
        }
        const now = Date.now();
        if (now - LAST_RENDER_TIME > 100) {
            const roomPage = APP_CONTAINER.querySelector('.wx-room-scroll');
            if (roomPage) { requestAnimationFrame(() => { roomPage.scrollTop = roomPage.scrollHeight; }); }
            LAST_RENDER_TIME = now;
        }
        RENDER_QUEUE_PROCESSING = false;
    }
    setInterval(processRenderQueue, 30);

    function handleNewMessages(chats, messageId) {
        const configStr = localStorage.getItem('wx_phone_api_config');
        if (configStr && JSON.parse(configStr).directMode) return;
        const hasNewData = Object.keys(chats).length > 0;
        
        const blockedStr = localStorage.getItem('wx_hidden_chat_ids');
        const blockedList = blockedStr ? JSON.parse(blockedStr) : [];

        GLOBAL_CHATS = {};
        for (let id in chats) { 
            if (blockedList.includes(id)) continue; 
            GLOBAL_CHATS[id] = { ...chats[id], unread: true, pushedCount: 0, renderedCount: 0 }; 
        }
        if (hasNewData && APP_CONTAINER) { updateAppUI(); }
    }

    function scanAndRender_DEPRECATED() {
        const configStr = localStorage.getItem('wx_phone_api_config');
        if (configStr && JSON.parse(configStr).directMode) return;
    }

    function updateAppUI() {
        if (!APP_CONTAINER) return;
        const shell = APP_CONTAINER.querySelector('.wx-shell'); if (!shell) return;
        if (GLOBAL_TAB === 'chat' && !shell.querySelector('.wx-page-list').contains(doc.activeElement)) {
             const listContainer = shell.querySelector('.wx-page-list > div');
             if (listContainer) listContainer.innerHTML = window.WX_VIEW.getListHTML(GLOBAL_CHATS, GLOBAL_ACTIVE_ID);
        }
        for (let chatId in GLOBAL_CHATS) {
            const chat = GLOBAL_CHATS[chatId]; const targetCount = chat.messages.length;
            if (targetCount > chat.pushedCount) {
                for (let i = chat.pushedCount; i < targetCount; i++) { RENDER_QUEUE.push({ msg: chat.messages[i], chatId: chatId, index: i }); }
                chat.pushedCount = targetCount;
                if (chat.messages.length > 0 && !chat.messages[targetCount-1].isMe) { if (win.PhoneSystem) win.PhoneSystem.show(); }
            }
        }
    }

    // ── DOM helpers：避免 this.render() 全量重建導致背景閃爍 ──
    function _getScrollEl()  { return APP_CONTAINER ? APP_CONTAINER.querySelector('.wx-room-scroll') : null; }
    function _getRoomContent(){ return APP_CONTAINER ? APP_CONTAINER.querySelector('#wxRoomContent') : null; }
    function _scrollToBottom(){ const r = _getScrollEl(); if (r) r.scrollTop = r.scrollHeight; }
    function _appendBubble(msg, chatObj) {
        const rc = _getRoomContent();
        if (rc && window.WX_VIEW) {
            const idx = chatObj.messages.length - 1;
            rc.insertAdjacentHTML('beforeend', window.WX_VIEW.renderBubble(msg, chatObj, true, idx));
            _scrollToBottom();
        }
    }
    function _removeLoadingBubble() {
        const rc = _getRoomContent();
        if (!rc) return;
        // 移除所有 loading 指示器（包括潛在重複）
        rc.querySelectorAll('[data-loading="true"]').forEach(el => el.remove());
    }
    // 從 data 重建 roomContent（不碰背景層，不閃爍）
    function _rebuildRoomContent(chatObj) {
        const rc = _getRoomContent();
        if (!rc || !window.WX_VIEW) return;
        rc.innerHTML = chatObj.messages.map((m, i) => window.WX_VIEW.renderBubble(m, chatObj, false, i)).join('');
        _scrollToBottom();
    }

    win.wxApp = {
        get GLOBAL_ACTIVE_ID() { return GLOBAL_ACTIVE_ID; },
        get APP_CONTAINER() { return APP_CONTAINER; },
        get GLOBAL_CHATS() { return GLOBAL_CHATS; },
        
        revealRecall: function(el, encodedContent) { const content = decodeURIComponent(encodedContent); if (el.dataset.revealed === 'true') { el.innerHTML = el.dataset.original; el.dataset.revealed = 'false'; el.style.color = ''; el.style.fontStyle = ''; } else { el.dataset.original = el.innerHTML; el.innerHTML = `[已撤回]: ${content}`; el.dataset.revealed = 'true'; el.style.color = '#fa5151'; el.style.fontStyle = 'italic'; } },
        
        openRedPacketById: function(packetId) {
            const data = getRedPacketData(packetId);
            if (!data) {
                alert('紅包數據不存在');
                return;
            }
            
            // 獲取當前用戶名稱
            let currentUserName = "User";
            if (win.WX_USER && typeof win.WX_USER.getInfo === 'function') {
                const userInfo = win.WX_USER.getInfo();
                currentUserName = userInfo.name || "User";
            }
            
            // 檢查用戶是否已經領取過
            const userAlreadyGrabbed = data.list && data.list.find(item => item.name === currentUserName);
            
            // 如果用戶還沒領取，且紅包還有剩餘，自動為用戶領取
            const totalAmount = data.totalAmount || 0;
            if (!userAlreadyGrabbed && totalAmount > 0) {
                const list = data.list || [];
                const totalGrabbed = list.reduce((sum, item) => sum + item.amount, 0);
                const remainingAmount = totalAmount - totalGrabbed;
                const totalCount = data.totalCount || 1;
                const remainingCount = totalCount - list.length;
                
                if (remainingAmount > 0 && remainingCount > 0) {
                    // 為用戶自動領取
                    const grabAmount = processRedPacketGrab(packetId, currentUserName);
                    if (grabAmount !== null) {
                        // 重新讀取數據（因為processRedPacketGrab已經更新了）
                        const updatedData = getRedPacketData(packetId);
                        
                        // 發送系統消息，通知用戶已領取（包含金額信息）
                        if (GLOBAL_ACTIVE_ID && GLOBAL_CHATS[GLOBAL_ACTIVE_ID]) {
                            const currentChat = GLOBAL_CHATS[GLOBAL_ACTIVE_ID];
                            const chatName = currentChat.name;
                            const chatId = currentChat.id;
                            const safeMembers = currentChat.members || [];
                            const memberNames = convertMemberIdsToNames(safeMembers);
                            const memberStr = memberNames.length > 0 ? memberNames.join(', ') : (chatName || "User");
                            
                            // 用戶領取後，發送系統消息給API（包含金額，讓AI知道剩餘金額）
                            // 格式：[系統: XXX領取了紅包97.42元|紅包ID]
                            const protocolContent = `[系統: ${currentUserName}領取了紅包${grabAmount.toFixed(2)}元|${packetId}]`;
                            const fullProtocolMessage = `\n[Chat: ${chatName}|${chatId}]\n[With: ${memberStr}]\n[System: ${protocolContent}]`;
                            
                            // 存入消息歷史的格式（包含金額，供下一輪AI查看）
                            const historyContent = `[系統: ${currentUserName}領取了紅包${grabAmount.toFixed(2)}元|${packetId}]`;
                            currentChat.messages.push({ type: 'system', content: historyContent, isMe: false });
                            this.render();
                            
                            const configStr = localStorage.getItem('wx_phone_api_config');
                            if (configStr) {
                                const conf = JSON.parse(configStr);
                                if (conf.directMode && win.WX_DB && typeof win.WX_DB.saveApiChat === 'function') {
                                    win.WX_DB.saveApiChat(GLOBAL_ACTIVE_ID, currentChat);
                                }
                            } else if (window.TavernHelper) {
                                window.TavernHelper.createChatMessages([{ role:'user', message: fullProtocolMessage }]);
                            }
                        }
                        
                        // 使用更新後的數據打開紅包
                        this.openRedPacket(updatedData);
                        return;
                    }
                }
            }
            
            // 如果已經領取過或無法領取，直接打開詳情
            this.openRedPacket(data);
        },
        
        openRedPacket: function(data) {
            try {
                const overlay = doc.getElementById('wxRedPacketOverlay');
                if (!overlay) return;
                
                // 兼容舊格式（encodedData）和新格式（直接傳對象）
                if (typeof data === 'string') {
                    data = JSON.parse(decodeURIComponent(data));
                }
                
                const senderName = data.sender || "未知";
                const memo = data.memo || "恭喜發財，大吉大利";
                const list = data.list || [];
                const totalAmount = data.totalAmount || 0;
                
                doc.getElementById('wxRpSender').innerText = senderName + " 的紅包";
                doc.getElementById('wxRpMemo').innerText = memo;
                doc.getElementById('wxRpAvatar').style.backgroundImage = `url('https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(senderName)}&backgroundColor=e6e6e6')`;
                
                const count = list.length;
                const totalGrabbed = list.reduce((acc, cur) => acc + cur.amount, 0);
                const remainingAmount = totalAmount - totalGrabbed;
                
                // 顯示紅包總金額、已領取金額、剩餘金額
                let infoText = `總金額: ¥${totalAmount.toFixed(2)}`;
                if (count > 0) {
                    infoText += ` | 已領取: ¥${totalGrabbed.toFixed(2)} (${count}個)`;
                }
                if (remainingAmount > 0) {
                    infoText += ` | 剩餘: ¥${remainingAmount.toFixed(2)}`;
                }
                doc.getElementById('wxRpInfoBar').innerText = infoText;
                
                const sortedList = [...list].sort((a, b) => b.amount - a.amount);
                const listContainer = doc.getElementById('wxRpList');
                if (sortedList.length === 0) {
                    listContainer.innerHTML = '<div style="text-align:center; padding:30px; color:#999; font-size:13px;">等待領取中...</div>';
                } else {
                    listContainer.innerHTML = sortedList.map(item => `<div class="wx-rp-item"><div class="wx-rp-item-avatar" style="background-image: url('https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(item.name)}&backgroundColor=e6e6e6')"></div><div class="wx-rp-item-info"><div class="wx-rp-item-name">${item.name}</div><div class="wx-rp-item-time">${item.time || '剛剛'}</div></div><div class="wx-rp-item-amount">${item.amount.toFixed(2)} 元</div></div>`).join('');
                }
                overlay.classList.add('show');
            } catch (e) {
                console.error("打開紅包失敗:", e);
                alert("紅包數據錯誤");
            }
        },
        
        _saveRedPacketData: saveRedPacketData,
        _getRedPacketData: getRedPacketData,
        
        onBack: function() { if (GLOBAL_ACTIVE_ID) { this.openChat(null); } else { if (win.PhoneSystem) win.PhoneSystem.goHome(); } },
        
        openChat: function(chatId) {
            GLOBAL_ACTIVE_ID = chatId;
            if (chatId) {
                GLOBAL_TAB = 'chat';
                if (!GLOBAL_CHATS[chatId]) {
                    const customs = win.WX_CONTACTS ? win.WX_CONTACTS.getAllCustomContacts() : [];
                    const target = customs.find(c => c.id === chatId);
                    if (target) { GLOBAL_CHATS[chatId] = { name: target.name, id: target.id, realName: target.realName || target.name, members: [target.name], isGroup: target.isGroup, messages: [], lastTime: '', unread: false, pushedCount: 0, renderedCount: 0, customAvatar: target.avatarId || null }; }
                    else { GLOBAL_CHATS[chatId] = { name: chatId, id: chatId, members: [], isGroup: false, messages: [], lastTime: '', unread: false, pushedCount: 0, renderedCount: 0 }; }
                }
                GLOBAL_CHATS[chatId].unread = false;
            }
            this.render();
        },
        
        switchTab: function(tabName) { GLOBAL_TAB = tabName; this.render(); },

        toggleDarkMode: function() {
            DARK_MODE = !DARK_MODE;
            localStorage.setItem('wx_dark_mode', DARK_MODE);
            this.render();
        },
        
        deleteChat: function(chatId) { if (GLOBAL_CHATS[chatId]) { delete GLOBAL_CHATS[chatId]; if (GLOBAL_ACTIVE_ID === chatId) { GLOBAL_ACTIVE_ID = null; } this.render(); } },
        
        reloadApiChats: async function() { /* ... */ },
        
        render: function() {
            if (!APP_CONTAINER) return;
            // 儲存滾動位置，避免重建後閃回頂部
            const prevScroll = APP_CONTAINER.querySelector('.wx-room-scroll');
            const atBottom = !prevScroll || (prevScroll.scrollHeight - prevScroll.scrollTop - prevScroll.clientHeight < 80);
            const savedTop = prevScroll ? prevScroll.scrollTop : 0;

            const html = window.WX_VIEW.renderShell(GLOBAL_ACTIVE_ID, GLOBAL_CHATS, GLOBAL_TAB, DARK_MODE);
            APP_CONTAINER.innerHTML = html;

            const room = APP_CONTAINER.querySelector('.wx-room-scroll');
            if (room && GLOBAL_ACTIVE_ID) {
                // 同步設定滾動位置，避免瀏覽器繪製空白頂部
                room.scrollTop = atBottom ? room.scrollHeight : savedTop;
                const chat = GLOBAL_CHATS[GLOBAL_ACTIVE_ID];
                if (chat) { chat.renderedCount = chat.messages.length; }
            }
            if (win.WX_MESSAGE_MANAGER && typeof win.WX_MESSAGE_MANAGER._updateUI === 'function') { setTimeout(() => win.WX_MESSAGE_MANAGER._updateUI(), 100); }
        },
        
        bigImg: function(src) { win.open(src, '_blank'); },
        
        toggleVoice: function(el, txt) { const box = el.querySelector('.wx-trans-box'); if(box.style.display==='block') { box.style.display='none'; } else { box.style.display='block'; box.innerText = ''; const t = decodeURIComponent(txt); let i=0; const timer = setInterval(()=>{ box.innerText += t.charAt(i); i++; if(i>=t.length) clearInterval(timer); }, 30); } },
        
        onInputCheck: function(el) { const btn = el.parentElement.querySelector('.wx-send-btn'); const plus = el.parentElement.querySelector('.wx-icon-btn:nth-child(4)'); if (el.value.trim()) { btn.classList.add('show'); plus.style.display = 'none'; } else { btn.classList.remove('show'); plus.style.display = 'block'; } },
        onInputKey: function(e, el) { if(e.key==='Enter') this.sendMsg(el); },
        
        togglePanel: function() {
            const panel = APP_CONTAINER.querySelector('.wx-action-panel');
            const scroll = APP_CONTAINER.querySelector('.wx-room-scroll');
            // 關閉表情包面板
            const stkPanel = APP_CONTAINER.querySelector('.wx-sticker-panel');
            if (stkPanel) stkPanel.classList.remove('open');
            if (panel) {
                panel.classList.toggle('open');
                if (panel.classList.contains('open') && scroll) { scroll.style.paddingBottom = '290px'; }
                else if (scroll) { scroll.style.paddingBottom = '70px'; }
            }
        },
        toggleStickerPanel: function() {
            const panel = APP_CONTAINER.querySelector('.wx-sticker-panel');
            const scroll = APP_CONTAINER.querySelector('.wx-room-scroll');
            // 關閉功能面板
            const actionPanel = APP_CONTAINER.querySelector('.wx-action-panel');
            if (actionPanel) actionPanel.classList.remove('open');
            if (!panel) return;
            panel.classList.toggle('open');
            if (panel.classList.contains('open') && scroll) {
                scroll.style.paddingBottom = '280px';
                if (win.WX_STICKER) { win.WX_STICKER.renderTabs(); win.WX_STICKER.renderGrid(win.WX_STICKER._currentLib); }
            } else if (scroll) {
                scroll.style.paddingBottom = '70px';
            }
        },
        onScrollDot: function(el) { const dots = APP_CONTAINER.querySelectorAll('.wx-dot'); const pageIndex = Math.round(el.scrollLeft / el.clientWidth); dots.forEach((d, i) => { if(i === pageIndex) d.classList.add('active'); else d.classList.remove('active'); }); },
        
        action: function(type) { PENDING_ACTION_TYPE = type; const modal = doc.querySelector('#wxActionModal'); const title = doc.querySelector('#wxModalTitle'); const input1 = doc.querySelector('#wxModalInput'); const input2 = doc.querySelector('#wxModalInput2'); const selectEl = doc.querySelector('#wxModalSelect'); if (!modal) return; if (title) title.style.display = 'block'; if (input1) input1.style.display = 'block'; const footer = modal.querySelector('.wx-modal-footer'); if (footer) footer.style.display = 'flex'; input1.value = ''; if(input2) { input2.value = ''; input2.classList.add('hidden'); } if(selectEl) { selectEl.innerHTML = ''; selectEl.classList.add('hidden'); } let hint = "請輸入..."; switch(type) { case 'photo': hint = "請輸入圖片網址"; break; case 'video_file': hint = "請輸入視頻描述或檔名"; break; case 'file_card': hint = "請輸入檔名"; break; case 'voice_msg': hint = "請輸入語音消息內容"; break; case 'call': hint = "請輸入通話備註"; break; case 'location': title.innerText = "發送位置"; input1.placeholder = "地點名稱"; input2.placeholder = "詳細地址"; input2.classList.remove('hidden'); break; case 'redpacket': title.innerText = "發送紅包"; input1.placeholder = "金額"; input2.placeholder = "備註（選填，如：恭喜發財）"; input2.classList.remove('hidden'); break; case 'transfer': hint = "請輸入轉帳金額"; title.innerText = "轉帳"; input1.placeholder = "金額"; input2.placeholder = "備註（選填）"; input2.classList.remove('hidden'); if(selectEl && GLOBAL_ACTIVE_ID && GLOBAL_CHATS[GLOBAL_ACTIVE_ID]) { const chat = GLOBAL_CHATS[GLOBAL_ACTIVE_ID]; const allContacts = (win.WX_CONTACTS && typeof win.WX_CONTACTS.getAllCustomContacts === 'function') ? win.WX_CONTACTS.getAllCustomContacts() : []; let currentUserName = "User"; if (win.WX_USER && typeof win.WX_USER.getInfo === 'function') { const userInfo = win.WX_USER.getInfo(); currentUserName = userInfo.name || "User"; } if (chat.isGroup && chat.members && chat.members.length > 0) { selectEl.innerHTML = '<option value="">選擇接收者</option>'; chat.members.forEach(memberId => { if (memberId === "User" || memberId === "user") return; const contact = allContacts.find(c => c.id === memberId); const memberName = contact ? contact.name : memberId; selectEl.innerHTML += `<option value="${memberName}">${memberName}</option>`; }); selectEl.classList.remove('hidden'); } else { selectEl.innerHTML = `<option value="${chat.name || chat.id}">${chat.name || chat.id}</option>`; selectEl.classList.remove('hidden'); } } break; case 'gift': title.innerText = "贈送禮物"; input1.placeholder = "格式: 🍗雞腿x1"; input2.placeholder = "價格: 50元"; input2.classList.remove('hidden'); break; } if (type !== 'location' && type !== 'gift' && type !== 'transfer') { title.innerText = hint; input1.placeholder = hint; } modal.classList.add('show'); input1.focus(); this.togglePanel(); },
        closeModal: function() { const modal = doc.querySelector('#wxActionModal'); if(modal) modal.classList.remove('show'); PENDING_ACTION_TYPE = null; },
        confirmModal: function() { 
            const input1 = doc.querySelector('#wxModalInput'); 
            const input2 = doc.querySelector('#wxModalInput2'); 
            const selectEl = doc.querySelector('#wxModalSelect'); 
            const val1 = input1.value.trim(); 
            const val2 = input2.value.trim(); 
            const selectVal = selectEl ? selectEl.value.trim() : ''; 
            if (!val1) { this.closeModal(); return; } 
            let content = ""; 
            switch(PENDING_ACTION_TYPE) { 
                case 'photo': content = `[Img: ${val1}]`; break; 
                case 'video_file': content = `[Video: ${val1}]`; break; 
                case 'file_card': content = `[File: ${val1}]`; break; 
                case 'voice_msg': content = `[Voice: ${val1}]`; break; 
                case 'call': content = `[Voice: 發起通話 - ${val1}]`; break; 
                case 'location': content = val2 ? `[定位: ${val1}-${val2}]` : `[定位: ${val1}]`; break; 
                case 'redpacket': 
                    const redPacketAmount = parseFloat(val1);
                    if (isNaN(redPacketAmount) || redPacketAmount <= 0) {
                        alert('請輸入有效的紅包金額！');
                        this.closeModal();
                        return;
                    }
                    // 🔥 檢查餘額並扣款
                    if (win.OS_ECONOMY) {
                        const currentBalance = win.OS_ECONOMY.getBalance();
                        if (currentBalance < redPacketAmount) {
                            alert('餘額不足，無法發送紅包！');
                            this.closeModal();
                            return;
                        }
                        // 立即扣款（紅包發送時就扣款）
                        win.OS_ECONOMY.transaction(-redPacketAmount, `微信紅包`);
                    }
                    // 生成紅包ID（3位數字）
                    const randomNum = Math.floor(Math.random() * 1000);
                    const packetId = 'rp_' + String(randomNum).padStart(3, '0');
                    // 默認紅包數量：根據金額計算，最小1個，最大100個，每個至少0.01元
                    const maxCount = Math.floor(redPacketAmount / 0.01);
                    const totalCount = Math.min(100, Math.max(1, maxCount));
                    // 新格式：[RedPacket: 金額|備註|紅包ID|數量]
                    const memo = val2 || '恭喜發財，大吉大利';
                    content = `[RedPacket: ${val1}|${memo}|${packetId}|${totalCount}]`;
                    break; 
                case 'transfer': 
                    const amountNum = parseFloat(val1);
                    if (isNaN(amountNum) || amountNum <= 0) {
                        alert('請輸入有效的轉帳金額！');
                        this.closeModal();
                        return;
                    }
                    // 🔥 檢查餘額（但不扣款，等接收時才扣）
                    if (win.OS_ECONOMY) {
                        const currentBalance = win.OS_ECONOMY.getBalance();
                        if (currentBalance < amountNum) {
                            alert('餘額不足，無法轉帳！');
                            this.closeModal();
                            return;
                        }
                    }
                    const txnId = "Txn" + Math.floor(Math.random() * 90 + 10);
                    const targetName = selectVal || (GLOBAL_ACTIVE_ID && GLOBAL_CHATS[GLOBAL_ACTIVE_ID] ? (GLOBAL_CHATS[GLOBAL_ACTIVE_ID].name || GLOBAL_ACTIVE_ID) : '');
                    // 🔥 保存轉帳信息（10分鐘時效性）
                    const transferData = {
                        amount: amountNum,
                        timestamp: Date.now(),
                        targetName: targetName,
                        status: 'pending',
                        memo: val2 || ''
                    };
                    const transferKey = `wx_transfer_${txnId}`;
                    localStorage.setItem(transferKey, JSON.stringify(transferData));
                    
                    // 🔥 設置10分鐘過期定時器
                    setTimeout(() => {
                        const stored = localStorage.getItem(transferKey);
                        if (stored) {
                            const data = JSON.parse(stored);
                            if (data.status === 'pending') {
                                data.status = 'expired';
                                localStorage.setItem(transferKey, JSON.stringify(data));
                                // 更新轉帳卡片狀態
                                const uniqueId = 'ID_' + txnId;
                                localStorage.setItem(uniqueId, 'expired');
                                // 觸發重新渲染
                                if (win.wxApp && typeof win.wxApp.render === 'function') {
                                    win.wxApp.render();
                                }
                            }
                        }
                    }, 10 * 60 * 1000); // 10分鐘
                    
                    content = val2 ? `[Transfer: ${val1}|${targetName}|${val2}|${txnId}]` : `[Transfer: ${val1}|${targetName}||${txnId}]`;
                    break; 
                case 'gift': content = val2 ? `[Gift: ${val1}-${val2}]` : `[Gift: ${val1}-無價]`; content += '\n(提示：你收到了一份禮物，請根據物品價值做出對應的反應，可接收或拒絕)'; break; 
            } 
            if(content) this.sendMsg(null, content); 
            this.closeModal(); 
        },
        
        openGift: function(info, price, hashId, el) { const overlay = doc.querySelector('#wxGiftOverlay'); const nameEl = doc.querySelector('#wxGiftName'); const priceEl = doc.querySelector('#wxGiftPrice'); const iconEl = doc.querySelector('#wxGiftIcon'); const btnGroup = doc.querySelector('#wxGiftBtnGroup'); const closeBtn = doc.querySelector('#wxGiftClose'); const acceptBtn = doc.querySelector('#wxGiftAccept'); const refuseBtn = doc.querySelector('#wxGiftRefuse'); if (overlay && nameEl) { let fullInfo = decodeURIComponent(info); let icon = "🎁"; let name = fullInfo; const emojiMatch = fullInfo.match(/^([\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27FF])/); if (emojiMatch) { icon = emojiMatch[0]; name = fullInfo.replace(icon, '').trim(); } nameEl.innerText = name; priceEl.innerText = decodeURIComponent(price); iconEl.innerText = icon; const status = localStorage.getItem(hashId); if (hashId === 'VIEW_ONLY' || status) { if(btnGroup) btnGroup.style.display = 'none'; if(closeBtn) closeBtn.style.display = 'block'; } else { if(btnGroup) btnGroup.style.display = 'flex'; if(closeBtn) closeBtn.style.display = 'block'; if(acceptBtn) acceptBtn.onclick = () => this.resolveGift('accepted', name, hashId); if(refuseBtn) refuseBtn.onclick = () => this.resolveGift('returned', name, hashId); } overlay.classList.add('show'); } },
        resolveGift: function(action, name, hashId) {
            localStorage.setItem(hashId, action);
            doc.querySelector('#wxGiftOverlay').classList.remove('show');
            
            // 提取Gift ID（去掉ID_前缀）
            const giftId = hashId.startsWith('ID_') ? hashId.substring(3) : hashId;
            const actionText = (action === 'accepted') ? 'Accept' : 'Return';
            const content = `[系統: ${actionText} ${name}|${giftId}]`;
            
            if (GLOBAL_ACTIVE_ID && GLOBAL_CHATS[GLOBAL_ACTIVE_ID]) {
                const currentChat = GLOBAL_CHATS[GLOBAL_ACTIVE_ID];
                currentChat.messages.push({ type: 'system', content: content, isMe: false });
                this.render();
                const chatName = currentChat.name;
                const chatId = currentChat.id;
                const safeMembers = currentChat.members || [];
                const memberNames = convertMemberIdsToNames(safeMembers);
                const memberStr = memberNames.length > 0 ? memberNames.join(', ') : (chatName || "User");
                const fullProtocolMessage = `\n[Chat: ${chatName}|${chatId}]\n[With: ${memberStr}]\n[System: ${content}]`;
                const configStr = localStorage.getItem('wx_phone_api_config');
                if (configStr) {
                    const conf = JSON.parse(configStr);
                    if (conf.directMode && win.WX_DB && typeof win.WX_DB.saveApiChat === 'function') {
                        win.WX_DB.saveApiChat(GLOBAL_ACTIVE_ID, currentChat);
                    }
                } else if (window.TavernHelper) {
                    window.TavernHelper.createChatMessages([{ role:'user', message: fullProtocolMessage }]);
                }
            }
        },
        
        openTransfer: function(amount, hashId, el) { const overlay = doc.querySelector('#wxTransferOverlay'); const amountEl = doc.querySelector('#wxTransferAmount'); const btnReceive = doc.querySelector('#wxBtnReceive'); const btnReturn = doc.querySelector('#wxBtnReturn'); if(overlay && amountEl) { amountEl.innerText = '¥' + amount; if(btnReceive) btnReceive.onclick = () => this.resolveTransfer('accepted', amount, hashId); if(btnReturn) btnReturn.onclick = () => this.resolveTransfer('returned', amount, hashId); overlay.classList.add('show'); } },
        closeTransfer: function() { doc.querySelector('#wxTransferOverlay').classList.remove('show'); },
        resolveTransfer: function(action, amount, hashId) {
            // 提取Transaction ID（去掉ID_前缀）
            const txnId = hashId.startsWith('ID_') ? hashId.substring(3) : hashId;
            const transferKey = `wx_transfer_${txnId}`;
            const transferDataStr = localStorage.getItem(transferKey);
            
            if (transferDataStr) {
                const transferData = JSON.parse(transferDataStr);
                const now = Date.now();
                const elapsed = now - transferData.timestamp;
                const tenMinutes = 10 * 60 * 1000;
                
                if (action === 'accepted') {
                    // 接收：檢查是否在10分鐘內且狀態為pending
                    if (transferData.status === 'pending' && elapsed <= tenMinutes) {
                        // 接收方收款（這裡是接收方，所以是加錢）
                        // 發送方扣款會在 processSystemIntent 中處理（當AI輸出Accept時）
                        if (win.OS_ECONOMY) {
                            const amountNum = parseFloat(amount);
                            if (!isNaN(amountNum)) {
                                const chatName = GLOBAL_ACTIVE_ID && GLOBAL_CHATS[GLOBAL_ACTIVE_ID]
                                    ? GLOBAL_CHATS[GLOBAL_ACTIVE_ID].name
                                    : '未知聊天';
                                win.OS_ECONOMY.transaction(amountNum, `微信收款 - ${chatName}`);
                            }
                        }
                        
                        // 更新轉帳狀態
                        transferData.status = 'accepted';
                        localStorage.setItem(transferKey, JSON.stringify(transferData));
                        localStorage.setItem(hashId, 'accepted');
                    } else if (transferData.status === 'expired' || elapsed > tenMinutes) {
                        // 已過期
                        alert('轉帳已過期（10分鐘）');
                        transferData.status = 'expired';
                        localStorage.setItem(transferKey, JSON.stringify(transferData));
                        localStorage.setItem(hashId, 'expired');
                        this.closeTransfer();
                        return;
                    } else {
                        // 已經處理過
                        localStorage.setItem(hashId, transferData.status);
                    }
                } else {
                    // 拒絕：不扣款，只更新狀態
                    transferData.status = 'returned';
                    localStorage.setItem(transferKey, JSON.stringify(transferData));
                    localStorage.setItem(hashId, 'returned');
                }
            } else {
                // 沒有找到轉帳記錄，可能是舊格式，直接標記狀態
                localStorage.setItem(hashId, action);
                // 舊格式：直接給接收方加錢（如果接收）
                if (win.OS_ECONOMY && action === 'accepted') {
                    const amountNum = parseFloat(amount);
                    if (!isNaN(amountNum)) {
                        const chatName = GLOBAL_ACTIVE_ID && GLOBAL_CHATS[GLOBAL_ACTIVE_ID]
                            ? GLOBAL_CHATS[GLOBAL_ACTIVE_ID].name
                            : '未知聊天';
                        win.OS_ECONOMY.transaction(amountNum, `微信收款 - ${chatName}`);
                    }
                }
            }
            
            this.closeTransfer();

            const actionText = (action === 'accepted') ? 'Accept' : 'Return';
            const content = `[系統: ${actionText} ${amount}|${txnId}]`;

            if (GLOBAL_ACTIVE_ID && GLOBAL_CHATS[GLOBAL_ACTIVE_ID]) {
                const currentChat = GLOBAL_CHATS[GLOBAL_ACTIVE_ID];
                currentChat.messages.push({ type: 'system', content: content, isMe: false });
                this.render();
                const chatName = currentChat.name;
                const chatId = currentChat.id;
                const safeMembers = currentChat.members || [];
                const memberNames = convertMemberIdsToNames(safeMembers);
                const memberStr = memberNames.length > 0 ? memberNames.join(', ') : (chatName || "User");
                const fullProtocolMessage = `\n[Chat: ${chatName}|${chatId}]\n[With: ${memberStr}]\n[System: ${content}]`;
                const configStr = localStorage.getItem('wx_phone_api_config');
                if (configStr) {
                    const conf = JSON.parse(configStr);
                    if (conf.directMode && win.WX_DB && typeof win.WX_DB.saveApiChat === 'function') {
                        win.WX_DB.saveApiChat(GLOBAL_ACTIVE_ID, currentChat);
                    }
                } else if (window.TavernHelper) {
                    window.TavernHelper.createChatMessages([{ role:'user', message: fullProtocolMessage }]);
                }
            }
        },
        
        // --- 發送消息 (🔥 關鍵修復點) ---
        sendMsg: async function(el, contentOverride = null) {
            let text = contentOverride; let inputEl = null;
            if (!text) { inputEl = APP_CONTAINER.querySelector('.wx-input-real'); if(inputEl) text = inputEl.value.trim(); }
            if(!text || !GLOBAL_ACTIVE_ID) return;
            
            if (!GLOBAL_CHATS[GLOBAL_ACTIVE_ID]) { GLOBAL_CHATS[GLOBAL_ACTIVE_ID] = { name: GLOBAL_ACTIVE_ID, id: GLOBAL_ACTIVE_ID, members:[], messages: [], lastTime: '', unread: false, pushedCount:0, renderedCount:0 }; }
            const currentChat = GLOBAL_CHATS[GLOBAL_ACTIVE_ID];
            
            // 強制獲取「我」的名字
            let myName = "User";
            if (win.WX_USER && typeof win.WX_USER.getInfo === 'function') {
                myName = win.WX_USER.getInfo().name || "User";
            }

            const chatName = currentChat.name; const chatId = currentChat.id;
            const safeMembers = (currentChat.members && Array.isArray(currentChat.members)) ? currentChat.members : [];
            const memberNames = convertMemberIdsToNames(safeMembers);
            const memberStr = memberNames.length > 0 ? memberNames.join(', ') : (chatName || "User");
            const fullProtocolMessage = `\n[Chat: ${chatName}|${chatId}]\n[With: ${memberStr}]\n[${myName}] ${text}`;

            const sentMsg = {
                type: 'msg',
                isMe: true,
                content: text,
                sender: myName,
                senderName: myName,
                timestamp: Date.now(),
                raw: fullProtocolMessage
            };
            currentChat.messages.push(sentMsg);
            _appendBubble(sentMsg, currentChat);
            if(inputEl) { inputEl.value=''; this.onInputCheck(inputEl); }

            const configStr = localStorage.getItem('wx_phone_api_config');
            if (configStr) {
                const conf = JSON.parse(configStr);
                if (conf.directMode && win.WX_DB && typeof win.WX_DB.saveApiChat === 'function') { await win.WX_DB.saveApiChat(GLOBAL_ACTIVE_ID, currentChat); }
            } else if (window.TavernHelper) {
                await window.TavernHelper.createChatMessages([{ role:'user', message: fullProtocolMessage }]);
            }
        },

        // --- 發送表情包 ---
        sendSticker: async function(name, url) {
            if (!GLOBAL_ACTIVE_ID) return;
            // 關閉面板
            const panel = APP_CONTAINER.querySelector('.wx-sticker-panel');
            const scroll = _getScrollEl();
            if (panel) panel.classList.remove('open');
            if (scroll) scroll.style.paddingBottom = '70px';
            // AI 看到名字，畫面顯示圖（processModules 從庫查 URL）
            await this.sendMsg(null, `[表情包:${name}]`);
        },

        // --- 觸發 AI 回覆 (含氣泡流) ---
        triggerReply: async function() {
            if(!GLOBAL_ACTIVE_ID || !GLOBAL_CHATS[GLOBAL_ACTIVE_ID]) return;
            if(IS_STREAMING_REPLY) return; // 鎖定
            IS_STREAMING_REPLY = true;

            const currentChat = GLOBAL_CHATS[GLOBAL_ACTIVE_ID];
            
            // 1. 顯示「對方正在輸入...」的臨時佔位符
            const loadingMsg = {type:'msg', isMe:false, content:'...', sender: currentChat.name, isLoading: true};
            currentChat.messages.push(loadingMsg);
            _appendBubble(loadingMsg, currentChat);

            const configStr = localStorage.getItem('wx_phone_api_config');
            let isApiMode = false; let apiConfig = {};
            if (configStr) { apiConfig = JSON.parse(configStr); isApiMode = apiConfig.directMode; }

            // 定義完成回調
            const onFinishReply = async (finalText) => {
                // 移除 Loading 佔位符（data）
                const loadingMsgIndex = currentChat.messages.findIndex(m => !m.isMe && m.isLoading);
                if (loadingMsgIndex !== -1) { currentChat.messages.splice(loadingMsgIndex, 1); }
                // 重建訊息區（可靠清除 loading，不碰背景層不閃爍）
                _rebuildRoomContent(currentChat);

                // 解析成多個訊息包 (Array)
                const newMsgs = parseAndProcess(finalText);
                
                // 如果解析失敗（空訊息），做保底處理
                if (newMsgs.length === 0 && finalText) {
                    const chatName = currentChat.name; const chatId = currentChat.id;
                    const memberNames = convertMemberIdsToNames(currentChat.members || []);
                    const memberStr = memberNames.length > 0 ? memberNames.join(', ') : chatName;
                    const rawPayload = `\n[Chat: ${chatName}|${chatId}]\n[With: ${memberStr}]\n[${chatName}] ${finalText}`;
                    newMsgs.push({ 
                        type:'msg', 
                        isMe:false, 
                        content: finalText, 
                        sender: chatName, 
                        senderName: chatName, // 🔥 這裡也補上快照
                        raw: rawPayload 
                    });
                }

                // 🔥 啟動氣泡流 (逐條顯示)
                await this.simulateTypingStream(newMsgs, currentChat);

                IS_STREAMING_REPLY = false; // 解鎖
                if (win.WX_DB && typeof win.WX_DB.saveApiChat === 'function') { await win.WX_DB.saveApiChat(GLOBAL_ACTIVE_ID, currentChat); }
            };

            if (isApiMode && win.WX_API) {
                // 如果 wx_phone_api_config 沒有 url/key，嘗試從主設定繼承
                if (!apiConfig.url || !apiConfig.key) {
                    try {
                        const mainCfg = JSON.parse(localStorage.getItem('os_global_config') || '{}');
                        if (mainCfg.url) apiConfig.url = mainCfg.url;
                        if (mainCfg.key) apiConfig.key = mainCfg.key;
                        if (!apiConfig.model && mainCfg.model) apiConfig.model = mainCfg.model;
                        if (!apiConfig.maxTokens && mainCfg.maxTokens) apiConfig.maxTokens = mainCfg.maxTokens;
                    } catch(e) {}
                }
                const messages = await win.WX_API.buildContext(null);
                await win.WX_API.chat(messages, apiConfig,
                    (chunk) => { /* 不做實時顯示，避免頻閃 */ },
                    onFinishReply,
                    (error) => {
                        // 移除 loading 泡泡並顯示錯誤
                        const idx = currentChat.messages.findIndex(m => m.isLoading);
                        if (idx !== -1) currentChat.messages.splice(idx, 1);
                        const errMsg = { type:'msg', isMe:false, content:`⚠️ AI 回應失敗：${error?.message || '未知錯誤'}`, sender: currentChat.name, senderName: currentChat.name };
                        currentChat.messages.push(errMsg);
                        IS_STREAMING_REPLY = false;
                        _rebuildRoomContent(currentChat);
                        console.error('[WX] API 錯誤:', error);
                    },
                    { disableTyping: apiConfig.disableTyping !== false }
                );
            } else if (window.TavernHelper) {
                const loadingMsgIndex = currentChat.messages.findIndex(m => !m.isMe && m.isLoading);
                if (loadingMsgIndex !== -1) { currentChat.messages.splice(loadingMsgIndex, 1); }
                this.render(); 
                IS_STREAMING_REPLY = false;
                setTimeout(() => {
                   const sendBtn = doc.querySelector('#send_but');
                   if (sendBtn) { sendBtn.click(); } else { window.TavernHelper.generate({}); }
                }, 100);
            }
        },

        // --- 模擬打字氣泡流 ---
        simulateTypingStream: async function(msgArray, chatObj) {
            for (let i = 0; i < msgArray.length; i++) {
                const msg = msgArray[i];

                // 1. 非第一條且非系統消息 → 先顯示「對方正在輸入...」
                if (i > 0 && msg.type !== 'system') {
                    const tempLoading = {type:'msg', isMe:false, content:'...', sender: msg.sender || chatObj.name, isLoading: true};
                    chatObj.messages.push(tempLoading);
                    _appendBubble(tempLoading, chatObj);

                    const waitTime = Math.min(2500, Math.max(800, (msg.content || "").length * 50));
                    await new Promise(r => setTimeout(r, waitTime));

                    // 移除 loading 泡泡（data + DOM）
                    chatObj.messages.pop();
                    _removeLoadingBubble();
                }

                // 2. 推入真實訊息並直接 append
                chatObj.messages.push(msg);
                _appendBubble(msg, chatObj);

                // 3. 轉帳卡片需要延遲全量刷新（更新轉帳狀態）
                if (msg.type === 'system' && msg.content && msg.content.includes('轉帳')) {
                    setTimeout(() => { this.render(); }, 300);
                }
            }
        },

        // --- 微博轉發接口 ---
        shareFromWeibo: async function(chatId, post) {
            if (!chatId || !post) return false;

            // 確保 chat 存在
            if (!GLOBAL_CHATS[chatId]) {
                const contact = win.OS_CONTACTS ? win.OS_CONTACTS.getById(chatId) : null;
                const chatName = contact ? (contact.wx?.nickname || contact.realName) : chatId;
                GLOBAL_CHATS[chatId] = {
                    id: chatId,
                    name: chatName,
                    members: [chatId],
                    messages: [],
                    lastTime: '',
                    unread: false,
                    pushedCount: 0,
                    renderedCount: 0
                };
            }

            let myName = "User";
            if (win.WX_USER && typeof win.WX_USER.getInfo === 'function') {
                myName = win.WX_USER.getInfo().name || "User";
            }

            // 格式：[WbShare: 作者|內容]
            const contentPreview = (post.content || '').replace(/\n/g, ' ').substring(0, 80);
            const shareContent = `[WbShare: ${post.user}|${contentPreview}]`;

            GLOBAL_CHATS[chatId].messages.push({
                type: 'msg',
                isMe: true,
                content: shareContent,
                sender: myName,
                senderName: myName,
                timestamp: Date.now()
            });
            GLOBAL_CHATS[chatId].lastTime = '剛剛';
            GLOBAL_CHATS[chatId].lastPreview = `[微博] @${post.user}`;

            if (win.WX_DB && typeof win.WX_DB.saveApiChat === 'function') {
                await win.WX_DB.saveApiChat(chatId, GLOBAL_CHATS[chatId]);
            }
            return true;
        },

        installToPhone: function() {
            if (win.PhoneSystem) {
                win.PhoneSystem.install('微信', '💬', '#07c160', async (container) => {
                    APP_CONTAINER = container;
                    console.log('[Core] 微信面板已打開');
                    try {
                        const config = localStorage.getItem('wx_phone_api_config');
                        if (config && JSON.parse(config).directMode && win.WX_DB) {
                            const savedChats = await win.WX_DB.getAllApiChats();
                            if (savedChats && Object.keys(savedChats).length > 0) { Object.assign(GLOBAL_CHATS, savedChats); }
                        }
                    } catch (e) { console.error(e); }
                    if (win.WX_TAVERN_API_BRIDGE) { setTimeout(() => { win.WX_TAVERN_API_BRIDGE.poll(); }, 100); }
                    win.wxApp.render();
                });
            } else { setTimeout(win.wxApp.installToPhone, 500); }
        }
    };
    // === WX_STICKER：表情包庫管理（與 VN 共用 os_sticker_libs）===
    const WX_STICKER = {
        // lib: { id, name, baseUrl, stickers:[{name, file}] }
        _libs: [], _currentLib: null,

        init() {
            try { this._libs = JSON.parse(localStorage.getItem('os_sticker_libs') || '[]'); } catch(e) { this._libs = []; }
            this._currentLib = this._libs[0]?.id || null;
        },
        _save() { localStorage.setItem('os_sticker_libs', JSON.stringify(this._libs)); },
        _resolveUrl(lib, file) {
            if (!file) return '';
            if (/^https?:\/\//i.test(file)) return file;
            return (lib.baseUrl || '').replace(/\/?$/, '/') + file;
        },
        _parseText(text) {
            const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
            let libName = '表情包'; const stickers = [];
            lines.forEach((line, i) => {
                if (i === 0 && line.startsWith('library:')) { libName = line.slice(8).trim(); return; }
                const sep = line.indexOf(':');
                if (sep > 0) { const name = line.slice(0, sep).trim(); const file = line.slice(sep+1).trim(); if (name && file) stickers.push({name, file}); }
            });
            return { name: libName, stickers };
        },
        lookup(name) {
            const key = name.replace(/\.(gif|jpg|jpeg|png)$/i, '').toLowerCase();
            for (const lib of this._libs) {
                for (const s of lib.stickers)
                    if (s.name.toLowerCase() === key || s.file.replace(/\.(gif|jpg|jpeg|png)$/i,'').toLowerCase() === key)
                        return this._resolveUrl(lib, s.file);
                if (lib.baseUrl && name.match(/\.(gif|jpg|jpeg|png)$/i))
                    return this._resolveUrl(lib, name);
            }
            return null;
        },
        importFromFile(inputEl) {
            const file = inputEl.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                const data = this._parseText(e.target.result);
                const baseInput = document.getElementById('wxStickerBaseUrl');
                const baseUrl = (baseInput?.value || '').trim();
                const existing = this._libs.find(l => l.name === data.name);
                if (existing) {
                    existing.stickers = data.stickers;
                    if (baseUrl) existing.baseUrl = baseUrl.replace(/\/?$/, '/');
                    this._currentLib = existing.id;
                } else {
                    const id = 'stk_' + Date.now();
                    this._libs.push({ id, name: data.name, baseUrl: baseUrl ? baseUrl.replace(/\/?$/, '/') : '', stickers: data.stickers });
                    this._currentLib = id;
                }
                this._save(); this.renderTabs(); this.renderGrid(this._currentLib); this.renderManage();
                if (baseInput) baseInput.value = '';
            };
            reader.readAsText(file, 'utf-8'); inputEl.value = '';
        },
        deleteLib(id) {
            this._libs = this._libs.filter(l => l.id !== id);
            if (this._currentLib === id) this._currentLib = this._libs[0]?.id || null;
            this._save(); this.renderTabs(); this.renderGrid(this._currentLib); this.renderManage();
        },
        switchLib(id) { this._currentLib = id; this.renderTabs(); this.renderGrid(id); },
        renderTabs() {
            const el = document.getElementById('wxStickerTabs'); if (!el) return;
            el.innerHTML = this._libs.map(lib =>
                `<button class="wx-stk-tab${lib.id === this._currentLib ? ' active' : ''}" onclick="(window.parent||window).WX_STICKER.switchLib('${lib.id}')">${lib.name}</button>`
            ).join('');
        },
        renderGrid(id) {
            const lib = id ? this._libs.find(l => l.id === id) : null;
            const grid = document.getElementById('wxStickerGrid'); if (!grid) return;
            if (!lib || !lib.stickers.length) { grid.innerHTML = `<div class="wx-stk-empty">尚無表情包，點 ⚙ 匯入 TXT</div>`; return; }
            grid.innerHTML = lib.stickers.map(s => {
                const url = this._resolveUrl(lib, s.file).replace(/[^\x00-\x7F]/g, c => encodeURIComponent(c));
                const safe = url.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
                const nameSafe = s.name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
                return `<div class="wx-stk-item" title="${s.name}" onclick="(window.parent||window).WX_STICKER.pickSticker('${nameSafe}','${safe}')"><img src="${url}" alt="${s.name}" loading="lazy" onerror="this.outerHTML='<span class=\\'wx-stk-fallback\\'>${s.name}</span>'"></div>`;
            }).join('');
        },
        renderManage() {
            const el = document.getElementById('wxStickerManage'); if (!el) return;
            el.innerHTML = this._libs.length
                ? this._libs.map(lib => `<div class="wx-stk-lib-row"><span class="wx-stk-lib-name">${lib.name}</span><span class="wx-stk-lib-count">${lib.stickers.length}張</span><button class="wx-stk-lib-del" onclick="(window.parent||window).WX_STICKER.deleteLib('${lib.id}')">✕</button></div>`).join('')
                : '<div class="wx-stk-empty">尚無庫</div>';
        },
        pickSticker(name, url) {
            if (win.wxApp && typeof win.wxApp.sendSticker === 'function') win.wxApp.sendSticker(name, url);
        }
    };
    WX_STICKER.init();
    win.WX_STICKER = WX_STICKER;

    win.wxApp.installToPhone();

    setTimeout(() => {
        const configStr = localStorage.getItem('wx_phone_api_config');
        let isApiMode = false;
        if (configStr) { isApiMode = JSON.parse(configStr).directMode; }
        if (isApiMode) { console.log('✅ [Core] 檢測到 API 模式：已強制阻斷 DOM 掃描'); return; }
        if (win.WX_TAVERN_API_BRIDGE) { win.WX_TAVERN_API_BRIDGE.onMessage(handleNewMessages); win.WX_TAVERN_API_BRIDGE.setPollingInterval(500); win.WX_TAVERN_API_BRIDGE.start(); } 
        else { setInterval(scanAndRender_DEPRECATED, 1500); }
    }, 1000);
})();