// ----------------------------------------------------------------
// [檔案 2] wx_view.js (V108.6 - Contact List DB Fix)
// 功能：視圖渲染。
// 🚨 維修報告 (V108.6)：
// 1. [修復] 通訊錄 (Contacts Tab) 無法顯示自定義頭像的問題。
//    - 同步了 Chat List 的邏輯，讓通訊錄也能識別 'img_' 或 'avt_' 開頭的 DB ID。
// 2. [完整性] 確保聊天列表、通訊錄、對話氣泡都能正確從 IndexedDB 讀取圖片。
// ----------------------------------------------------------------
(function() {

    // VN 頭像串接查詢：lorebook → mem cache → VN IndexedDB（最多到第4步，不生成）
    async function _resolveVNAvatar(name) {
        const win = window.parent || window;
        const vn = win.VN_Core;
        if (!vn) return null;

        // 名字變體（處理全名/簡稱）
        const variants = [name, name.split(/[·\s·]/)[0]].filter((v, i, a) => v && a.indexOf(v) === i);

        // 1. Lorebook 頭像
        if (vn._lorebookAvatarCache) {
            for (const v of variants) {
                if (vn._lorebookAvatarCache[v]) return vn._lorebookAvatarCache[v];
            }
        }

        // 2. VN 記憶體快取（已生成的頭像）
        if (vn._avatarMemCache) {
            for (const v of variants) {
                if (vn._avatarMemCache[v]) return vn._avatarMemCache[v];
            }
        }

        // 3. VN IndexedDB 持久快取
        const VN_Cache = win.VN_Cache;
        if (VN_Cache) {
            for (const v of variants) {
                try {
                    const cached = await VN_Cache.get('avatar_cache', v);
                    if (cached?.url && !cached.url.startsWith('blob:')) return cached.url;
                } catch(e) {}
            }
        }

        return null; // 找不到，維持 DiceBear
    }

    window.WX_VIEW = {
        
        // --- 1. 氣泡渲染 (保持 V108.5 邏輯) ---
        renderBubble: function(msg, chatObj, withAnim, msgIndex) {
            const blockRegex = /(\[\s*(?:表情包|Sticker|图片|圖片|Img|视频|視頻|Video|文件|File|位置|Location|定位|转账|轉帳|Transfer|红包|RedPacket|礼品|礼物|Gift|语音|語音|Voice|WbShare).*?\])/gi;
            if (msg.content && typeof msg.content === 'string' && blockRegex.test(msg.content)) {
                const pureContent = msg.content.replace(blockRegex, '').trim();
                if (pureContent.length > 0 || msg.content.match(blockRegex).length > 1) {
                    const parts = msg.content.split(blockRegex).filter(p => p && p.trim().length > 0);
                    if (parts.length > 1) {
                        return parts.map(part => {
                            let subMsg = { ...msg, content: part.trim() };
                            return this.renderBubble(subMsg, chatObj, withAnim, msgIndex);
                        }).join('');
                    }
                }
            }

            const safeChat = chatObj || { name: 'Loading...', id: 'temp', isGroup: false };
            const chatName = safeChat.name || "Unknown";
            const chatId = safeChat.id || chatName; 
            const animClass = withAnim ? 'animate' : '';
            const opacityStyle = withAnim ? 'opacity:0;' : 'opacity:1;'; 
            const dataAttr = (typeof msgIndex === 'number') ? `data-msg-idx="${msgIndex}"` : '';
            
            if (msg.isLoading) {
                const senderLabel = msg.sender ? `<span class="wx-typing-label">${msg.sender}</span>` : '';
                return `<div class="wx-typing-indicator" data-loading="true"><div class="wx-typing-dots-wrap"><span></span><span></span><span></span></div>${senderLabel}</div>`;
            }

            if (msg.type === 'system') {
                let displayContent = msg.content || '';
                // 處理紅包領取系統消息：[系統: XXX領取了紅包 金額元|ID]，隱藏ID部分
                // 匹配格式：[系統: ...領取了紅包 ...元|ID] 或 "XXX"領取了紅包XX元|rp_ID
                if (displayContent.match(/領取.*?紅包.*?[|｜]/i)) {
                    // 先去掉 [系統: 和 ]（如果存在）
                    displayContent = displayContent.replace(/^\[\s*(系統|系统|System)\s*[:：]\s*/i, '').replace(/\s*\]$/, '');
                    // 移除 |ID 部分（匹配 |rp_xxx 或 |ID 格式，直到行尾或]）
                    displayContent = displayContent.replace(/\s*[|｜][a-zA-Z0-9_]+(\s*\]?)?\s*$/, '');
                }
                // 處理轉帳系統消息：Accept/Return 金額|ID 格式
                else if (displayContent.match(/^(Accept|Return|接收|退回)\s+(\d+(?:\.\d+)?)\s*[|｜]/i)) {
                    const transferMatch = displayContent.match(/^(Accept|Return|接收|退回)\s+(\d+(?:\.\d+)?)\s*[|｜](.+)$/i);
                    if (transferMatch) {
                        const action = transferMatch[1].trim().toLowerCase();
                        const amount = transferMatch[2].trim();
                        const isAccept = action === 'accept' || action === '接收';
                        displayContent = isAccept ? `對方已接收轉帳 ${amount}元` : `對方已拒絕轉帳 ${amount}元`;
                    }
                }
                return `<div class="wx-system-notice ${animClass}" style="${opacityStyle}" ${dataAttr}>${displayContent}</div>`;
            }
            if (msg.type === 'time') return `<div class="wx-time-stamp ${animClass}" style="${opacityStyle}" ${dataAttr}>${msg.content}</div>`;
            
            let html = msg.content || "";
            // 處理統一格式的系統消息：[系統: Accept/Return 物品名|ID] 或 [系統: Accept/Return 金額|ID]
            if (!msg.isMe && html.match(/^\[\s*系統|系统|System\s*[:：]\s*(Accept|Return|接收|退回)\s+/i)) {
                let display = html.replace(/^\[\s*(系統|系统|System)\s*[:：]\s*/i, '').replace(/\]$/, '');
                const actionMatch = display.match(/^(Accept|Return|接收|退回)\s+(.+?)\s*[|｜](.+)$/i);
                if (actionMatch) {
                    const action = actionMatch[1].trim().toLowerCase();
                    const item = actionMatch[2].trim();
                    let id = actionMatch[3].trim();
                    // 移除末尾可能存在的 ] 字符
                    id = id.replace(/\]+\s*$/, '').trim();
                    const isAccept = action === 'accept' || action === '接收';
                    // 判斷是轉帳還是禮物（轉帳通常是數字，禮物是文字）
                    if (item.match(/^\d+(?:\.\d+)?$/)) {
                        // 轉帳
                        display = isAccept ? `對方已接收轉帳 ${item}元` : `對方已拒絕轉帳 ${item}元`;
                    } else {
                        // 禮物
                        display = isAccept ? `對方已接收 ${item}` : `對方已拒絕 ${item}`;
                    }
                }
                return `<div class="wx-system-notice ${animClass}" style="${opacityStyle}" ${dataAttr}>${display}</div>`;
            }

            html = this.processModules(html, String(chatId), msg.isMe);
            
            let avatarSeed = chatName; 
            let avatarUrl = "";
            let avatarStyle = "";
            let dbDataAttr = ""; 

            if (msg.isMe) {
                avatarUrl = safeChat.userAvatar; 
                if (!avatarUrl) avatarSeed = 'MySelf';
            }
            else {
                if (safeChat.isGroup && msg.sender) avatarSeed = msg.sender;
                avatarUrl = safeChat.customAvatar;
            }
            if (!avatarSeed) avatarSeed = "User";

            let defaultUrl = `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(avatarSeed)}&backgroundColor=${msg.isMe?'c0ebd7':'e6e6e6'}`;
            avatarStyle = `background-image: url('${defaultUrl}')`;

            if (avatarUrl) {
                // 支援 img_ (Settings) 和 avt_ (Contacts) 兩種前綴
                if (avatarUrl.startsWith('img_') || avatarUrl.startsWith('avt_')) {
                    avatarStyle = `background-image: url('${defaultUrl}');`;
                    dbDataAttr = `data-db-bg="${avatarUrl}" class="wx-bubble-avatar db-load-target"`;
                } else {
                    avatarStyle = `background-image: url('${avatarUrl}')`;
                    dbDataAttr = `class="wx-bubble-avatar"`;
                }
            } else {
                // 沒有自定義頭像 → 嘗試從 VN 串接獲取
                const vnName = msg.isMe ? '' : (safeChat.isGroup && msg.sender ? msg.sender : safeChat.realName || '');
                if (vnName) {
                    dbDataAttr = `data-vn-name="${vnName}" class="wx-bubble-avatar vn-load-target"`;
                } else {
                    dbDataAttr = `class="wx-bubble-avatar"`;
                }
            }
            
            const side = msg.isMe ? 'me' : 'you';
            const isSpecial = msg.content.match(/^\[\s*(转账|轉帳|Transfer|位置|Location|定位|视频|Video|红包|RedPacket|文件|File|礼品|Gift|礼物|WbShare)/i);
            const isImageTag = msg.content.match(/^\[\s*(图片|Img).*?\]$/i); 
            const isSticker = msg.content.match(/^\[\s*(表情包|Sticker).*?\]$/i);
            const bubbleStyle = (isSpecial || isImageTag || isSticker) ? 'padding:0; border:none; background:transparent; box-shadow:none;' : '';
            
            let nameHTML = "";
            if (safeChat.isGroup && !msg.isMe && msg.sender) {
                nameHTML = `<div class="wx-group-name">${msg.sender}</div>`;
            }
            
            return `<div class="wx-msg-row ${side} ${animClass}" style="${opacityStyle}" ${dataAttr}><div style="${avatarStyle}" ${dbDataAttr}></div><div style="max-width: 70%;">${nameHTML}<div class="wx-bubble-content" style="${bubbleStyle}">${html}</div></div></div>`;
        },

        generateHash: function(str) { let hash = 0; const safeStr = String(str); for (let i = 0; i < safeStr.length; i++) { const char = safeStr.charCodeAt(i); hash = (hash << 5) - hash + char; hash |= 0; } return "wx_" + Math.abs(hash); },

        // --- 2. 模塊解析 ---
        processModules: function(html, chatId, isMe) {
            const app = "(window.parent.wxApp || window.wxApp)"; const safeId = String(chatId);
            html = html.replace(/\[\s*(转账|轉帳|Transfer)\s*[:：]?\s*(.*?)\s*\]/gi, (match, tag, content) => {
                // 解析新格式：[转账: 价格|指定人物|備註|Tnx_ID]
                // 兼容舊格式：[转账: 价格|備註|Tnx_ID] 或 [转账: 价格|Txn_ID]
                let amount = '0', targetName = '', memo = '', txnId = '';
                const parts = content.split(/[|｜]/).map(s => s.trim()).filter(s => s);
                
                if (parts.length >= 4) {
                    // 新格式：[价格|指定人物|備註|Tnx_ID]
                    amount = parts[0];
                    targetName = parts[1] || '';
                    memo = parts[2] || '';
                    txnId = parts[3];
                } else if (parts.length === 3) {
                    // 兼容舊格式：[价格|備註|Tnx_ID]
                    // 如果第三部分看起來像ID（Txn開頭或純字母數字），則認為是舊格式
                    amount = parts[0];
                    if (parts[2].match(/^(Txn|Tnx)[0-9]+$/i) || parts[2].match(/^[a-zA-Z0-9_]+$/)) {
                        // 舊格式：[价格|備註|Tnx_ID]
                        memo = parts[1] || '';
                        txnId = parts[2];
                    } else {
                        // 可能是其他格式，嘗試解析為新格式（缺少備註）
                        targetName = parts[1] || '';
                        txnId = parts[2];
                    }
                } else if (parts.length === 2) {
                    // 兼容：[价格|備註] 或 [价格|Txn_ID]
                    amount = parts[0];
                    if (parts[1].match(/^(Txn|Tnx)[0-9]+$/i) || parts[1].match(/^[a-zA-Z0-9_]+$/)) {
                        txnId = parts[1];
                    } else {
                        memo = parts[1];
                    }
                } else if (parts.length === 1) {
                    amount = parts[0];
                }
                
                // 如果沒有指定人物，使用聊天對象名稱
                if (!targetName && safeId) {
                    const win = window.parent || window;
                    if (win.wxApp && win.wxApp.GLOBAL_CHATS && win.wxApp.GLOBAL_CHATS[safeId]) {
                        targetName = win.wxApp.GLOBAL_CHATS[safeId].name || safeId;
                    }
                }
                
                // 如果沒有ID，生成一個
                if (!txnId) {
                    txnId = 'Txn' + Math.floor(Math.random() * 90 + 10);
                }
                const uniqueId = txnId.startsWith('ID_') ? txnId : ('ID_' + txnId);
                const displayId = txnId;
                const status = localStorage.getItem(uniqueId);
                let bgColor = "#fa9d3b";
                let textColor = "white";
                let borderColor = "white";
                let icon = "¥";
                let title = targetName ? `轉帳給${targetName}` : "轉帳給朋友";
                let sub = memo || "微信轉帳";
                let clickAction = `onclick="${app}.openTransfer('${amount}', '${uniqueId}', this)"`;
                
                if (isMe) {
                    if (status === 'accepted') {
                        bgColor = "#f6e3c8";
                        textColor = "#b8702b";
                        borderColor = "#d99a5e";
                        icon = "✔";
                        title = "已收款";
                        sub = `對方已收款`;
                        clickAction = "";
                    } else if (status === 'returned' || status === 'expired') {
                        bgColor = "#e6e6e6";
                        textColor = "#666";
                        borderColor = "#999";
                        icon = "↩";
                        title = status === 'expired' ? "已過期" : "已退還";
                        sub = status === 'expired' ? "轉帳已過期（10分鐘）" : "對方已退回";
                        clickAction = "";
                    }
                } else {
                    if (status === 'accepted') {
                        bgColor = "#f6e3c8";
                        textColor = "#b8702b";
                        borderColor = "#d99a5e";
                        icon = "✔";
                        title = "已收款";
                        sub = `已存入餘額`;
                        clickAction = "";
                    } else if (status === 'returned') {
                        bgColor = "#e6e6e6";
                        textColor = "#666";
                        borderColor = "#999";
                        icon = "↩";
                        title = "已退還";
                        sub = "轉帳已退回";
                        clickAction = "";
                    }
                }
                return `<div style="background:${bgColor}; padding:15px; border-radius:4px; color:${textColor}; min-width:210px; display:flex; flex-direction:column; gap:5px; cursor:pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.1);" ${clickAction}><div style="display:flex; align-items:center; gap:10px;"><div style="border:2px solid ${borderColor}; border-radius:50%; width:35px; height:35px; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:16px; flex-shrink:0;">${icon}</div><div style="overflow:hidden;"><div style="font-size:15px; font-weight:500; white-space:nowrap;">${title}</div><div style="font-size:12px; opacity:0.8; white-space:nowrap;">${sub}${(!isMe && !status) ? ' ¥' + amount : ''}</div></div></div><div style="font-size:10px; opacity:0.6; text-align:right; margin-top:4px; font-family:monospace; letter-spacing:1px; border-top:1px dashed rgba(255,255,255,0.3); padding-top:2px;">單號: ${displayId}</div></div>`; });
            html = html.replace(/\[\s*(礼品|礼物|Gift)\s*[:：]?\s*(.*?)\s*\]/gi, (m, t, content) => {
                // 解析新格式：[Gift: emoji+物品名|備註|Gft_ID] 或舊格式 [Gift: 物品名-价格]
                let giftName = '', memo = '', giftId = '', price = "心意無價";
                const parts = content.split(/[|｜]/).map(s => s.trim()).filter(s => s);
                
                if (parts.length >= 3) {
                    // 新格式：[emoji+物品名|備註|Gft_ID]
                    giftName = parts[0].trim();
                    memo = parts[1] || '';
                    giftId = parts[2];
                } else if (parts.length === 2) {
                    // 兼容：可能是 [物品名|備註] 或 [物品名|Gft_ID]
                    giftName = parts[0].trim();
                    if (parts[1].match(/^[a-zA-Z0-9_]+$/)) {
                        giftId = parts[1];
                    } else {
                        memo = parts[1];
                    }
                } else if (parts.length === 1) {
                    giftName = parts[0].trim();
                }
                
                // 兼容舊格式（用-分隔）
                if (!giftId && giftName.includes('-')) {
                    const oldParts = giftName.split('-');
                    giftName = oldParts[0].trim();
                    price = oldParts.length > 1 ? oldParts[1].trim() : price;
                }
                
                // 提取emoji和物品名
                let icon = "🎁";
                let name = giftName;
                const emojiMatch = giftName.match(/^([\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27FF])/);
                if (emojiMatch) {
                    icon = emojiMatch[0];
                    name = giftName.replace(icon, '').trim();
                }
                
                // 如果沒有ID，生成一個
                if (!giftId) {
                    giftId = 'gft_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                }
                const uniqueId = 'ID_' + giftId;
                const status = localStorage.getItem(uniqueId);
                
                let opacity = "1";
                let extraClass = "";
                let statusLabel = "微信禮物";
                let clickAction = `onclick="${app}.openGift('${encodeURIComponent(giftName)}', '${encodeURIComponent(price)}', '${uniqueId}', this)"`;
                
                if (isMe) {
                    if (status === 'accepted') {
                        opacity = "0.8";
                        extraClass = "grayscale";
                        statusLabel = "對方已收下";
                    } else if (status === 'returned') {
                        opacity = "0.5";
                        extraClass = "grayscale";
                        statusLabel = "對方已退回";
                    } else {
                        opacity = "0.9";
                        statusLabel = "已送出";
                    }
                    clickAction = `onclick="${app}.openGift('${encodeURIComponent(giftName)}', '${encodeURIComponent(price)}', 'VIEW_ONLY', this)"`;
                } else {
                    if (status === 'accepted') {
                        opacity = "0.8";
                        extraClass = "grayscale";
                        statusLabel = "已接收";
                    } else if (status === 'returned') {
                        opacity = "0.5";
                        extraClass = "grayscale";
                        statusLabel = "已退回";
                    }
                }
                return `<div class="wx-gift-card-blue ${extraClass}" style="opacity:${opacity}" ${clickAction}><div class="wx-gift-top"><div class="wx-gift-icon-gold">${icon}</div><div class="wx-gift-title-text">${memo || '送你一份心意'}</div></div><div class="wx-gift-footer">${statusLabel}</div></div>`;
            });
            html = html.replace(/\[\s*(图片|圖片|Img)\s*[:：]?\s*(.*?)\s*\]/gi, (m, t, content) => { content = content.trim(); if (content.match(/^(https?:\/\/|data:|blob:)/i)) { return `<img src="${content}" class="wx-img-block" onclick="${app}.bigImg(this.src)">`; } return `<div class="wx-img-placeholder"><span style="font-size:24px; display:block; margin-bottom:5px;">🖼️</span><span style="font-size:13px; line-height:1.4;">${content}</span></div>`; });
            html = html.replace(/\[\s*(语音|語音|Voice)\s*[:：]?\s*(.*?)\s*\]/gi, (m, t, txt) => { const cleanTxt = txt.replace(/['"]/g, ''); const sec = Math.min(60, Math.max(2, Math.ceil(cleanTxt.length/2))); return `<div class="wx-voice-wrapper" onclick="${app}.toggleVoice(this, '${encodeURIComponent(cleanTxt)}')"><div class="wx-voice-box" style="width:${60+sec*2}px"><span style="margin:0 5px">((</span><span>${sec}"</span></div><div class="wx-trans-box"></div></div>`; });
            html = html.replace(/\[\s*(红包|RedPacket)\s*[:：]?\s*(.*?)\s*\]/gi, (match, tag, content) => {
                // 解析內容：支持 [金額|備註|紅包ID] 或舊格式
                let amount = '0', memo = '恭喜發財，大吉大利', packetId = '';
                const parts = content.split(/[|｜]/).map(s => s.trim()).filter(s => s);
                
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
                const win = window.parent || window;
                if (win.wxApp && typeof win.wxApp._getRedPacketData === 'function') {
                    const existing = win.wxApp._getRedPacketData(packetId);
                    if (!existing) {
                        // 獲取發送者名稱
                        let senderName = "User";
                        if (isMe) {
                            if (win.WX_USER && typeof win.WX_USER.getInfo === 'function') {
                                senderName = win.WX_USER.getInfo().name || "User";
                            }
                        } else {
                            // 從聊天對象獲取名稱
                            if (win.wxApp && win.wxApp.GLOBAL_CHATS) {
                                const chat = win.wxApp.GLOBAL_CHATS[safeId];
                                if (chat) senderName = chat.name || safeId;
                            }
                        }
                        
                        const totalAmount = parseFloat(amount) || 0;
                        // 默認紅包數量：根據金額計算，最小1個，最大100個，每個至少0.01元
                        const maxCount = Math.floor(totalAmount / 0.01);
                        const totalCount = Math.min(100, Math.max(1, maxCount));
                        win.wxApp._saveRedPacketData(packetId, {
                            sender: senderName,
                            totalAmount: totalAmount,
                            totalCount: totalCount,
                            memo: memo,
                            list: []
                        });
                    }
                }
                
                return `<div style="width: 220px; border-radius: 6px; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,0.1); cursor: pointer; font-family: sans-serif;" onclick="${app}.openRedPacketById('${packetId}')"><div style="background: #fa9d3b; padding: 15px; display: flex; align-items: center;"><div style="width: 32px; height: 42px; background: #e64340; border-radius: 4px; position: relative; margin-right: 12px; flex-shrink: 0; display:flex; justify-content:center; align-items:center; border:1px solid #f8b97a;"><div style="width:18px; height:18px; background:#f6d147; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#e64340; font-weight:bold; font-size:11px;">¥</div></div><div style="color: white; flex: 1; overflow:hidden;"><div style="font-size: 15px; font-weight: 500; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${memo}</div><div style="font-size: 12px; opacity: 0.8;">領取紅包</div></div></div><div style="background: #fff; padding: 8px 15px; font-size: 11px; color: #999; display:flex; justify-content:space-between; align-items:center;"><span>微信紅包</span></div></div>`;
            });
            html = html.replace(/\[\s*(位置|Location|定位)\s*[:：]?\s*(.*?)\s*\]/gi, (match, tag, content) => { let parts = content.split(/[-－]/); let name = parts[0].trim(); let address = parts.length > 1 ? parts[1].trim() : name; return `<div style="width:230px; border-radius:6px; overflow:hidden; box-shadow:0 1px 2px rgba(0,0,0,0.1); background:#fff; cursor:default; font-family: sans-serif;"><div style="height:120px; background: url('https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/World_map_blank_without_borders.svg/640px-World_map_blank_without_borders.svg.png') center/cover no-repeat; position:relative; background-color:#e6e6e6;"><div style="width:100%; height:100%; background:rgba(0,0,0,0.05);"></div><div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -80%); font-size:32px; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.3));">📍</div></div><div style="background:#55d967; padding:10px 12px; color:white; display:flex; flex-direction:column; justify-content:center;"><div style="font-size:15px; font-weight:bold; margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${name}</div><div style="font-size:11px; opacity:0.9; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${address}</div></div></div>`; });
            html = html.replace(/\[\s*(视频|Video)\s*[:：]?\s*(.*?)\s*\]/gi, (m, t, content) => { var videoTitle = "Video Clip"; var isUrl = content.match(/^http/i); if (!isUrl) videoTitle = content; var vidClick = isUrl ? `onclick="window.open('${content}')"` : ''; return `<div ${vidClick} style="margin: 0; width: 230px; aspect-ratio: 16/9; background: #000; border-radius: 8px; position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; cursor: ${isUrl ? 'pointer' : 'default'}; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"><div style="position: absolute; width: 100%; height: 100%; background: linear-gradient(45deg, #111, #222); opacity: 0.8;"></div><div style="width: 44px; height: 44px; border-radius: 50%; background: rgba(255,255,255,0.2); backdrop-filter: blur(4px); border: 1px solid rgba(255,255,255,0.5); display: flex; align-items: center; justify-content: center; z-index: 2;"><div style="width: 0; height: 0; border-top: 8px solid transparent; border-bottom: 8px solid transparent; border-left: 14px solid #fff; margin-left: 4px;"></div></div><div style="position: absolute; bottom: 10px; left: 12px; color: #fff; font-size: 13px; font-weight: 500; z-index: 2; text-shadow: 0 1px 2px rgba(0,0,0,0.5); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70%;">📹 ${videoTitle}</div><div style="position: absolute; bottom: 10px; right: 12px; background: rgba(0,0,0,0.6); color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 11px; z-index: 2;">00:15</div></div>`; });
            html = html.replace(/\[\s*(文件|File)\s*[:：]?\s*(.*?)\s*\]/gi, (m, t, filename) => { filename = filename.trim(); let ext = filename.split('.').pop().toLowerCase(); let iconColor = '#999'; let iconText = '?'; if (ext.match(/ppt|pptx/)) { iconColor = '#f4511e'; iconText = 'P'; } else if (ext.match(/doc|docx/)) { iconColor = '#4b89dc'; iconText = 'W'; } else if (ext.match(/xls|xlsx/)) { iconColor = '#2e7d32'; iconText = 'X'; } else if (ext.match(/pdf/)) { iconColor = '#e53935'; iconText = '<span style="font-size:10px">PDF</span>'; } else if (ext.match(/txt/)) { iconColor = '#999'; iconText = 'T'; } let size = (Math.random() * 5 + 1).toFixed(1) + " MB"; return `<div class="wx-file-card"><div class="wx-file-info"><div class="wx-file-name">${filename}</div><div class="wx-file-size">${size}</div></div><div class="wx-file-icon" style="background:${iconColor}">${iconText}</div></div>`; });
            html = html.replace(/\[\s*(表情包|Sticker)\s*[:：]?\s*(.*?)\s*\]/gi, (match, tag, content) => {
                content = content.trim();
                const _w = window.parent || window;
                let src = null;
                if (content.match(/^(https?:\/\/|data:|blob:)/i)) {
                    src = content.replace(/[^\x00-\x7F]/g, c => encodeURIComponent(c));
                } else if (_w.WX_STICKER) {
                    src = _w.WX_STICKER.lookup(content);
                }
                const label = content.replace(/^.*\//, '') || content;
                const safeLabel = label.replace(/</g,'&lt;').replace(/"/g,'&quot;');
                if (src) {
                    return `<img src="${src}" class="wx-img-block" data-stk-label="${safeLabel}" style="max-width:120px; border-radius:4px;" alt="${safeLabel}" onerror="(function(el){el.style.display='none';var d=el.ownerDocument.createElement('div');d.className='wx-stk-fallback-box';d.textContent=el.dataset.stkLabel;el.parentNode.insertBefore(d,el.nextSibling);})(this)">`;
                }
                return `<div class="wx-stk-fallback-box">${safeLabel}</div>`;
            });
            html = html.replace(/\[\s*WbShare\s*[:：]?\s*(.*?)\s*\]/gi, (match, content) => {
                const parts = content.split('|');
                const author = (parts[0] || '').trim();
                const text   = (parts[1] || '').trim();
                const short  = text.length > 60 ? text.substring(0, 60) + '…' : text;
                return `<div class="wx-wb-share-card"><div class="wx-wb-share-top"><span class="wx-wb-share-logo">微博</span><span style="font-size:11px; opacity:0.8; margin-left:4px;">分享</span></div><div class="wx-wb-share-body"><div class="wx-wb-share-author">@${author}</div><div class="wx-wb-share-text">${short || '（查看原貼）'}</div></div></div>`;
            });
            html = html.replace(/\n/g, '<br>');
            return html;
        },

        // --- 3. 聊天列表渲染 (保持 V108.5 邏輯) ---
        getListHTML: function(chats, activeId) {
            const chatIds = Object.keys(chats).filter(k => k !== 'unknown_chat');
            if (chatIds.length === 0 && chats['unknown_chat'] && chats['unknown_chat'].messages.length > 0) chatIds.push('unknown_chat');
            return chatIds.map(id => {
                const c = chats[id];
                const displayName = c.name; 
                const showBadge = c.unread && (id !== activeId);
                const badgeHTML = showBadge ? '<div class="wx-badge">1</div>' : '';
                
                let avatarSeed = c.isGroup ? id : displayName;
                let defaultUrl = `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(avatarSeed)}&backgroundColor=e6e6e6`;
                let avatarStyle = `background-image: url('${defaultUrl}')`;
                let dataAttr = '';
                
                if (c.customAvatar) {
                    if (c.customAvatar.startsWith('img_') || c.customAvatar.startsWith('avt_')) {
                        avatarStyle = `background-image: url('${defaultUrl}');`;
                        dataAttr = `data-db-bg="${c.customAvatar}" class="wx-avatar db-load-target"`;
                    } else {
                        avatarStyle = `background-image: url('${c.customAvatar}')`;
                        dataAttr = `class="wx-avatar"`;
                    }
                } else if (!c.isGroup && c.realName) {
                    dataAttr = `data-vn-name="${c.realName}" class="wx-avatar vn-load-target"`;
                } else {
                    dataAttr = `class="wx-avatar"`;
                }
                
                return `<div class="wx-chat-item" id="chat-item-${id}" onclick="(window.parent.wxApp || window.wxApp).openChat('${id}')"><div style="${avatarStyle}" ${dataAttr}>${badgeHTML}</div><div class="wx-info"><div style="display:flex; justify-content:space-between;"><span class="wx-name">${displayName}</span><span class="wx-meta">${c.lastTime}</span></div><div class="wx-last-msg">${c.lastPreview || ''}</div></div></div>`;
            }).join('');
        },

        // --- 4. 聯絡人頁面 (🔥 修復：支援 DB 圖片) ---
        getContactListHTML: function(chats) {
            let html = `
                <div class="wx-contact-item" id="static-new-friend"><div class="wx-contact-icon icon-new-friend"><div class="wx-badge" style="top:-6px; right:-6px;">1</div><svg viewBox="0 0 24 24" width="20" height="20" fill="white"><path d="M15 12c2.2 0 4-1.8 4-4s-1.8-4-4-4-4 1.8-4 4 1.8 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z"/></svg></div><div class="wx-contact-name">新的朋友</div></div>
                <div class="wx-contact-item" id="static-chat-only"><div class="wx-contact-icon" style="background:#fa9d3b;"><svg viewBox="0 0 24 24" width="20" height="20" fill="white"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zM6 10h2v2H6zm0 4h2v2H6zm4-4h8v2h-8zm0 4h5v2h-5z"/></svg></div><div class="wx-contact-name">僅聊天的朋友</div></div>
                <div class="wx-contact-item" id="static-group"><div class="wx-contact-icon icon-group-chat"><svg viewBox="0 0 24 24" width="20" height="20" fill="white"><path d="M16 11c1.7 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3 1.3 3 3 3zm-8 0c1.7 0 3-1.3 3-3S9.7 5 8 5 5 6.3 5 8s1.3 3 3 3zm0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5c0-2.3-4.7-3.5-7-3.5zm8 0c-.3 0-.6 0-1 .1.5.5.9 1.1.9 1.9 0 2.3-4.7 3.5-7 3.5h7.1c2.3 0 6.9-1.2 6.9-3.5V13c0-2.3-4.6-3.5-6.9-3.5z"/></svg></div><div class="wx-contact-name">群組</div></div>
                <div class="wx-contact-item" id="static-tags"><div class="wx-contact-icon icon-tags"><svg viewBox="0 0 24 24" width="20" height="20" fill="white"><path d="M21.4 11.6l-9-9C12 2.2 11.5 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .5.2 1 .6 1.4l9 9c.4.4 1 .4 1.4 0l8.4-8.4c.4-.4.4-1 0-1.4zM5.5 7C4.7 7 4 6.3 4 5.5S4.7 4 5.5 4 7 4.7 7 5.5 6.3 7 5.5 7z"/></svg></div><div class="wx-contact-name">標籤</div></div>
                <div class="wx-contact-item" id="static-official"><div class="wx-contact-icon icon-official"><svg viewBox="0 0 24 24" width="20" height="20" fill="white"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-1 14h-2v-2h2v2zm0-4h-2V7h2v5z"/></svg></div><div class="wx-contact-name">官方帳號</div></div>
            `;
            let contacts = Object.keys(chats).filter(k => k !== 'unknown_chat').map(id => ({ id: id, name: chats[id].name, customAvatar: chats[id].customAvatar }));
            contacts.sort((a, b) => a.name.localeCompare(b.name));
            if (contacts.length > 0) {
                html += `<div class="wx-contact-section">A</div>`;
                contacts.forEach(c => {
                    // 🔥 修復邏輯：處理 img_ 和 avt_ 開頭的 DB ID
                    let defaultUrl = `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(c.name)}&backgroundColor=e6e6e6`;
                    let avatarStyle = `width:38px; height:38px; margin-right:12px; background-image: url('${defaultUrl}')`;
                    let dataAttr = '';

                    if (c.customAvatar) {
                        if (c.customAvatar.startsWith('img_') || c.customAvatar.startsWith('avt_')) {
                            // 這是 DB ID，使用異步標記
                            avatarStyle = `width:38px; height:38px; margin-right:12px; background-image: url('${defaultUrl}');`;
                            dataAttr = `data-db-bg="${c.customAvatar}" class="wx-avatar db-load-target"`;
                        } else if (c.customAvatar.startsWith('blob:') || c.customAvatar.startsWith('data:') || c.customAvatar.startsWith('http')) {
                            // 這是標準網址
                            avatarStyle = `width:38px; height:38px; margin-right:12px; background-image: url('${c.customAvatar}')`;
                            dataAttr = `class="wx-avatar"`;
                        }
                    } else {
                        dataAttr = `class="wx-avatar"`;
                    }

                    const contextAction = `oncontextmenu="(window.parent.WX_CONTACTS || window.WX_CONTACTS).showContextMenu(event, '${c.id}', '${c.name}'); return false;"`;
                    // 注意：這裡將 dataAttr 注入到 div class="wx-avatar..." 結構中
                    html += `<div class="wx-contact-item" id="contact-item-${c.id}" ${contextAction} onclick="(window.parent.wxApp || window.wxApp).openChat('${c.id}')"><div style="${avatarStyle}" ${dataAttr}></div><div class="wx-contact-name">${c.name}</div></div>`;
                });
            } else { html += `<div style="text-align:center; padding:30px; color:#ccc;">暫無聯絡人</div>`; }
            return html;
        },

        // --- 5. "我" 的頁面 ---
        getMePageHTML: function(isDark = false) {
            const win = window.parent || window;
            const profile = (win.WX_PROFILE && win.WX_PROFILE.get) ? win.WX_PROFILE.get() : { nickname: 'User', signature: '這個人很懶，什麼都沒寫', avatar: '' };

            // 修正 User 頭像讀取
            let avatarStyle = `background-image: url('https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(profile.nickname)}&backgroundColor=c0ebd7')`;
            let dataAttr = '';

            if (profile.avatar) {
                if (profile.avatar.startsWith('img_') || profile.avatar.startsWith('avt_')) {
                    dataAttr = `data-db-bg="${profile.avatar}" class="wx-me-avatar db-load-target"`;
                } else {
                    avatarStyle = `background-image: url('${profile.avatar}')`;
                    dataAttr = `class="wx-me-avatar"`;
                }
            } else {
                 dataAttr = `class="wx-me-avatar"`;
            }

            const wxId = 'wxid_' + profile.nickname.replace(/\s+/g, '_');

            const pageBg      = isDark ? '#111'    : '#f2f2f2';
            const headerBg    = isDark ? '#1c1c1e' : '#fff';
            const cellGroupBg = isDark ? '#1c1c1e' : '#fff';
            const borderColor = isDark ? '#2a2a2a' : '#f2f2f2';
            const nameColor   = isDark ? '#f0f0f0' : '#000';
            const idColor     = isDark ? '#888'    : '#666';
            const sigColor    = isDark ? '#666'    : '#999';
            const cellText    = isDark ? '#f0f0f0' : '#000';
            const arrowColor  = isDark ? '#555'    : '#ccc';
            const darkBadge   = isDark
                ? '<span style="background:#07c160; color:#fff; font-size:11px; padding:2px 8px; border-radius:10px;">已開啟</span>'
                : '<span style="background:#ddd; color:#999; font-size:11px; padding:2px 8px; border-radius:10px;">已關閉</span>';

            const style = `
                .wx-me-header { background: ${headerBg}; padding: 30px 25px 30px 20px; padding-top: calc(30px + env(safe-area-inset-top, 0px)); display: flex; align-items: center; margin-bottom: 10px; }
                .wx-me-avatar { width: 64px; height: 64px; border-radius: 6px; background-size: cover; margin-right: 15px; border: 1px solid ${borderColor}; }
                .wx-me-info { flex: 1; display: flex; flex-direction: column; gap: 5px; }
                .wx-me-name { font-size: 20px; font-weight: 600; color: ${nameColor}; }
                .wx-me-id { font-size: 14px; color: ${idColor}; display: flex; align-items: center; justify-content: space-between; }
                .wx-me-signature { font-size: 13px; color: ${sigColor}; margin-top: 3px; }
                .wx-me-qr { width: 18px; height: 18px; opacity: 0.6; }
                .wx-me-arrow { font-size: 20px; color: ${arrowColor}; margin-left: 10px; }
                .wx-cell-group { background: ${cellGroupBg}; margin-bottom: 10px; }
                .wx-cell { display: flex; align-items: center; padding: 15px 20px; border-bottom: 1px solid ${borderColor}; cursor: pointer; }
                .wx-cell:active { background: ${isDark ? '#2a2a2a' : '#f5f5f5'}; }
                .wx-cell-icon { width: 24px; height: 24px; margin-right: 15px; display: flex; align-items: center; justify-content: center; }
                .wx-cell-icon svg { width: 22px; height: 22px; }
                .wx-cell-text { flex: 1; font-size: 16px; color: ${cellText}; }
                .wx-cell-arrow { font-size: 18px; color: ${arrowColor}; }
            `;
            const iconPay = `<svg viewBox="0 0 24 24" fill="#07c160"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V19h-2.67v-1.07H9.27v-1.6h1.47v-1.73H9.41c-1.39 0-2.28-.96-2.28-2.31 0-1.44.97-2.33 2.6-2.33V9h2.67v1.07h1.47v1.6h-1.47v1.73h1.33c1.39 0 2.28.96 2.28 2.31 0 1.44-.97 2.38-2.6 2.38zM12 12.27c-.63 0-.93-.28-.93-.76 0-.49.33-.76.93-.76v1.52zm-1.33 2.53v1.52c.63 0 .93.28.93.76 0 .49-.33.76-.93.76z"/></svg>`;
            const iconFav = `<svg viewBox="0 0 24 24" fill="#fa9d3b"><path d="M19 5v14H5V5h14m0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/><path d="M7 7h10v2H7zm0 4h10v2H7zm0 4h7v2H7z"/></svg>`;
            const iconMoment = `<svg viewBox="0 0 24 24" fill="none"><path d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" fill="#576b95"/></svg>`;
            const iconCard = `<svg viewBox="0 0 24 24" fill="#2782d7"><path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/></svg>`;
            const iconFace = `<svg viewBox="0 0 24 24" fill="#fa9d3b"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/></svg>`;
            const iconSet = `<svg viewBox="0 0 24 24" fill="#576b95"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>`;

            return `
                <style>${style}</style>
                <div style="background:${pageBg}; min-height:100%;">
                <div class="wx-me-header">
                    <div style="${avatarStyle}" ${dataAttr}></div>
                    <div class="wx-me-info">
                        <div class="wx-me-name">${profile.nickname}</div>
                        <div class="wx-me-id"><span>微信號：${wxId}</span></div>
                        <div class="wx-me-signature">${profile.signature}</div>
                    </div>
                </div>
                <div class="wx-cell-group">
                    <div class="wx-cell"><div class="wx-cell-icon">${iconPay}</div><div class="wx-cell-text">服務</div><div class="wx-cell-arrow">›</div></div>
                </div>
                <div class="wx-cell-group">
                    <div class="wx-cell"><div class="wx-cell-icon">${iconFav}</div><div class="wx-cell-text">收藏</div><div class="wx-cell-arrow">›</div></div>
                    <div class="wx-cell"><div class="wx-cell-icon">${iconMoment}</div><div class="wx-cell-text">朋友圈</div><div class="wx-cell-arrow">›</div></div>
                    <div class="wx-cell"><div class="wx-cell-icon">${iconCard}</div><div class="wx-cell-text">卡包</div><div class="wx-cell-arrow">›</div></div>
                    <div class="wx-cell"><div class="wx-cell-icon">${iconFace}</div><div class="wx-cell-text">表情</div><div class="wx-cell-arrow">›</div></div>
                </div>
                <div class="wx-cell-group">
                    <div class="wx-cell" onclick="(window.parent.wxApp || window.wxApp).toggleDarkMode()"><div class="wx-cell-icon"><span style="font-size:20px;">🌙</span></div><div class="wx-cell-text">黑夜模式</div>${darkBadge}</div>
                    <div class="wx-cell" onclick="(window.parent.PhoneSystem || window.PhoneSystem).install('設置', '⚙️', '#4c4c4c', null); alert('請前往桌面點擊 [設置] App');"><div class="wx-cell-icon">${iconSet}</div><div class="wx-cell-text">設置</div><div class="wx-cell-arrow">›</div></div>
                </div>
                <div class="wx-cell-group" style="margin-top:10px;">
                    <div style="padding:8px 20px 4px; font-size:11px; color:#aaa;">數據管理</div>
                    <div class="wx-cell" onclick="(function(){
                        const w = window.parent || window;
                        if (!confirm('確定清空全部通訊錄？\\n（聊天記錄保留，但聯繫人及隱形成員全部刪除）')) return;
                        localStorage.removeItem('wx_custom_contacts_v1');
                        if (w.OS_CONTACTS && w.OS_CONTACTS.getAllContacts) {
                            const all = w.OS_CONTACTS.getAllContacts();
                            all.forEach(c => { if (w.OS_CONTACTS.deleteContact) w.OS_CONTACTS.deleteContact(c.id); });
                        }
                        if (w.wxApp && w.wxApp.GLOBAL_CHATS) {
                            Object.keys(w.wxApp.GLOBAL_CHATS).forEach(id => { delete w.wxApp.GLOBAL_CHATS[id]; });
                            if (w.wxApp.render) w.wxApp.render();
                        }
                        alert('✅ 通訊錄已清空');
                    })()">
                        <div class="wx-cell-icon"><svg viewBox="0 0 24 24" fill="#e74c3c"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></div>
                        <div class="wx-cell-text" style="color:#e74c3c;">清空通訊錄</div>
                        <div class="wx-cell-arrow">›</div>
                    </div>
                    <div class="wx-cell" onclick="(function(){
                        const w = window.parent || window;
                        if (!confirm('⚠️ 確定清空所有微信數據？\\n（通訊錄 + 全部聊天記錄將永久刪除）')) return;
                        localStorage.removeItem('wx_custom_contacts_v1');
                        if (w.OS_CONTACTS && w.OS_CONTACTS.getAllContacts) {
                            const all = w.OS_CONTACTS.getAllContacts();
                            all.forEach(c => { if (w.OS_CONTACTS.deleteContact) w.OS_CONTACTS.deleteContact(c.id); });
                        }
                        const ids = w.wxApp && w.wxApp.GLOBAL_CHATS ? Object.keys(w.wxApp.GLOBAL_CHATS) : [];
                        if (w.wxApp && w.wxApp.GLOBAL_CHATS) {
                            ids.forEach(id => { delete w.wxApp.GLOBAL_CHATS[id]; });
                            if (w.wxApp.render) w.wxApp.render();
                        }
                        if (w.WX_DB && w.WX_DB.deleteApiChat) {
                            ids.forEach(id => w.WX_DB.deleteApiChat(id));
                        }
                        alert('✅ 微信數據已全部清空');
                    })()">
                        <div class="wx-cell-icon"><svg viewBox="0 0 24 24" fill="#c0392b"><path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z"/></svg></div>
                        <div class="wx-cell-text" style="color:#c0392b;">清空全部微信數據</div>
                        <div class="wx-cell-arrow">›</div>
                    </div>
                </div>
                </div>
            `;
        },

        // --- 6. Shell 渲染 (核心 + 異步背景加載) ---
        renderShell: function(activeId, chats, activeTab = 'chat', isDark = false) {
            const win = window.parent || window;
            const doc = win.document;
            const transform = activeId ? 'translateX(-30%)' : 'translateX(0)';
            let totalUnread = 0;
            for (let id in chats) { if (chats[id].unread && id !== activeId) { totalUnread++; } }
            
            let headerTitle = totalUnread > 0 ? `微信(${totalUnread})` : '微信';
            if (activeTab === 'contacts') headerTitle = '通訊錄';
            if (activeTab === 'discover') headerTitle = '發現';
            if (activeTab === 'me') headerTitle = '我';
            
            // 列表內容
            let listContent = '';
            if (activeTab === 'contacts') listContent = this.getContactListHTML(chats);
            else if (activeTab === 'me') listContent = this.getMePageHTML(isDark);
            else listContent = this.getListHTML(chats, activeId);
            
            let roomContent = '';
            let headerRightBtn = '';
            let roomBgImageStyle = '';
            let hasBg = false;
            let bgDbId = null;

            if (activeId && chats[activeId]) {
                const c = chats[activeId];
                headerTitle = c.name + (c.isGroup ? ` (${c.members.length})` : '');
                const msgs = c.messages;
                roomContent = msgs.map((msg, index) => this.renderBubble(msg, c, false, index)).join('');

                // 嘗試讀取背景圖設定
                const storageKey = `wx_chat_settings_${activeId}`;
                try {
                    const savedSettings = JSON.parse(localStorage.getItem(storageKey));
                    if (savedSettings && savedSettings.bgImage) {
                        hasBg = true;
                        if (savedSettings.bgImage.startsWith('img_')) {
                            bgDbId = savedSettings.bgImage;
                        } else {
                            roomBgImageStyle = `background-image: url('${savedSettings.bgImage}')`;
                        }
                    }
                } catch(e) {}

                headerRightBtn = `
                    <div style="display:flex; align-items:center; gap:8px;">
                        <div id="wx-msg-delete-btn" style="display:block; font-size:16px; cursor:pointer; color:#ff453a; padding:4px 8px;"
                             onclick="event.stopPropagation(); const mm = (window.parent.WX_MESSAGE_MANAGER || window.WX_MESSAGE_MANAGER); if(mm) mm.enterMultiSelectMode();">🗑️</div>
                        <div id="wx-msg-menu-btn" style="display:block; font-size:22px; cursor:pointer; font-weight:bold; margin-top:-8px;"
                             onclick="event.stopPropagation(); const ws = (window.parent.WX_CHAT_SETTINGS || window.WX_CHAT_SETTINGS); if(ws) ws.open('${activeId}');">...</div>
                        <div id="wx-msg-cancel-btn" style="display:none; font-size:14px; cursor:pointer; color:#999; padding:4px 8px;"
                             onclick="event.stopPropagation(); const mm = (window.parent.WX_MESSAGE_MANAGER || window.WX_MESSAGE_MANAGER); if(mm) mm.exitMultiSelectMode();">取消</div>
                        <div id="wx-msg-confirm-btn" style="display:none; font-size:14px; cursor:pointer; color:#999; padding:4px 8px; font-weight:bold;"
                             onclick="event.stopPropagation(); const mm = (window.parent.WX_MESSAGE_MANAGER || window.WX_MESSAGE_MANAGER); if(mm) mm.deleteSelectedMessages();">刪除</div>
                    </div>
                `;
            } else {
                headerRightBtn = `<div style="width:30px; text-align:right; font-size:20px; cursor:pointer;" onclick="event.stopPropagation(); const wc = (window.parent.WX_CONTACTS || window.WX_CONTACTS); if(wc) wc.showMenu(this)">⊕</div>`;
            }
            
            const isInChat = !!activeId;
            const backBtnText = isInChat ? '微信' : '主頁';
            const backAction = "(window.parent.wxApp || window.wxApp).onBack()"; 
            const backBtnClass = 'wx-back-btn show'; 
            const inputDisplay = activeId ? 'flex' : 'none';
            const tabDisplay = activeId ? 'none' : 'flex';
            const app = "(window.parent.wxApp || window.wxApp)"; 
            const chatBadgeHTML = totalUnread > 0 ? `<div class="wx-tab-badge">${totalUnread}</div>` : '';

            // 觸發按鈕
            const triggerBtn = `<span class="wx-icon-btn" id="wx-trigger-btn" onclick="${app}.triggerReply()" style="font-size:24px; color:#07c160; margin-right:5px;" title="點擊召喚 AI 回覆">✨</span>`;

            const iconChat = `<svg viewBox="0 0 24 24"><path d="M18 13.5c0-2.2-2.3-4-5-4-2.8 0-5 1.8-5 4s2.2 4 5 4c.6 0 1.1-.1 1.6-.2l.1-.1 1.7.5-.4-1.6.1-.1c1.2-1 1.9-1.9 1.9-2.5zm-5 4.5c-3.1 0-5.5-2.1-5.5-4.5S9.9 9 13 9s5.5 2.1 5.5 4.5-2.4 4.5-5.5 4.5zM7.5 7.5h.1c3.1 0 5.8 1.8 6.4 4.3.4-.2.8-.2 1.2-.2 3.6 0 6.5 2.5 6.5 5.5 0 .8-.2 1.6-.6 2.3l.5 2.1-2.2-.6c-1.1.7-2.5 1.2-3.8 1.2-3.6 0-6.5-2.5-6.5-5.5 0-.4 0-.8.1-1.2C5.9 14.8 4 12.9 4 10.5c0-2.8 2.8-5 6.2-5h-2.7z"/></svg>`;
            const iconContact = `<svg viewBox="0 0 24 24"><path d="M4 19h16v-1c0-2.2-1.8-4-4-4h-8c-2.2 0-4 1.8-4 4v1z" opacity=".3"/><path d="M12 12c2.2 0 4-1.8 4-4s-1.8-4-4-4-4 1.8-4 4 1.8 4 4 4zm0 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z"/></svg>`;
            const iconDiscover = `<svg viewBox="0 0 24 24"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.4 0-8-3.6-8-8s3.6-8 8-8 8 3.6 8 8-3.6 8-8 8zm-2-4l-2-6 6 2 2 6-6-2z"/></svg>`;
            const iconMe = `<svg viewBox="0 0 24 24"><path d="M12 12c2.2 0 4-1.8 4-4s-1.8-4-4-4-4 1.8-4 4 1.8 4 4 4zm0 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z"/></svg>`;

            // 構建主介面
            const darkShellStyle = isDark ? 'background:#111;' : '';
            const darkHeaderStyle = isDark ? 'background:#1c1c1e; border-bottom:1px solid #2a2a2a;' : '';
            const darkTabStyle = isDark ? 'background:#1c1c1e; border-top:1px solid #2a2a2a;' : '';
            const darkListBg = isDark ? '#111' : (activeTab === 'me' ? '#f2f2f2' : '#fff');

            const html = `
                <div class="wx-shell${isDark ? ' wx-dark' : ''}" style="${darkShellStyle}">
                    <div class="wx-header" style="${darkHeaderStyle}">
                        <div class="${backBtnClass}" onclick="${backAction}">${backBtnText}</div>
                        <div class="wx-header-title">${headerTitle}</div>
                        ${headerRightBtn}
                    </div>
                    <div class="wx-page-container">
                        <div class="wx-page-list" style="transform: ${transform}">
                            <div style="padding:0; background:${darkListBg}; height:100%;">${listContent}</div>
                        </div>
                        
                        <div class="wx-page-room ${activeId ? 'active' : ''} ${hasBg ? 'has-bg' : ''}" id="wx-current-room-bg">
                            <div class="wx-room-bg" id="wx-room-bg-layer" ${roomBgImageStyle ? `style="${roomBgImageStyle}"` : ''}></div>
                            <div class="wx-room-bg-overlay"></div>
                            <div class="wx-room-scroll">
                                <div style="padding:10px;" id="wxRoomContent">${roomContent}</div>
                            </div>
                        </div>

                    </div>
                    
                    <div class="wx-modal-overlay" id="wxActionModal"><div class="wx-modal-box"><div class="wx-modal-title" id="wxModalTitle">輸入內容</div><input type="text" class="wx-modal-input" id="wxModalInput" autocomplete="off"><input type="text" class="wx-modal-input hidden" id="wxModalInput2" autocomplete="off" style="margin-top:5px;"><select class="wx-modal-input hidden" id="wxModalSelect" style="margin-top:5px;"></select><div class="wx-modal-footer"><button class="wx-btn wx-btn-cancel" onclick="${app}.closeModal()">取消</button><button class="wx-btn wx-btn-confirm" onclick="${app}.confirmModal()">發送</button></div></div></div>
                    <div class="wx-gift-overlay" id="wxGiftOverlay" onclick="this.classList.remove('show')"><div class="wx-receipt-box" onclick="event.stopPropagation()"><div class="wx-receipt-header"></div><div class="wx-receipt-content"><div class="wx-receipt-icon" id="wxGiftIcon">🎁</div><div class="wx-receipt-name" id="wxGiftName">禮物名稱</div><div class="wx-receipt-divider"></div><div class="wx-receipt-price-label">價值</div><div class="wx-receipt-price" id="wxGiftPrice">¥0</div><div class="wx-receipt-btn-group" id="wxGiftBtnGroup" style="display:none;"><div class="wx-receipt-btn-accept" id="wxGiftAccept">收下禮物</div><div class="wx-receipt-btn-refuse" id="wxGiftRefuse">殘忍拒絕</div></div><div class="wx-receipt-close" id="wxGiftClose" onclick="document.getElementById('wxGiftOverlay').classList.remove('show')">關閉</div></div></div></div>
                    <div class="wx-transfer-overlay" id="wxTransferOverlay" onclick="${app}.closeTransfer()"><div class="wx-transfer-box" onclick="event.stopPropagation()"><div class="wx-transfer-header"><div class="wx-transfer-icon">✔</div><div style="font-size:14px;">待收款金額</div><div class="wx-transfer-amount" id="wxTransferAmount">¥0.00</div></div><div class="wx-transfer-actions"><button class="wx-btn-receive" id="wxBtnReceive" onclick="">確認收款</button><button class="wx-btn-return" id="wxBtnReturn" onclick="">退回轉帳</button><div style="font-size:12px; color:#999; margin-top:5px;">收款後將存入餘額</div></div></div></div>
                    <div class="wx-rp-overlay" id="wxRedPacketOverlay" onclick="this.classList.remove('show')"><div class="wx-rp-box" onclick="event.stopPropagation()"><div class="wx-rp-header"><div class="wx-rp-avatar" id="wxRpAvatar"></div><div class="wx-rp-sender" id="wxRpSender">的紅包</div><div class="wx-rp-memo" id="wxRpMemo">恭喜發財，大吉大利</div></div><div class="wx-rp-divider"></div><div class="wx-rp-info" id="wxRpInfoBar">暫無人領取</div><div class="wx-rp-list" id="wxRpList"></div><div class="wx-rp-close" onclick="document.getElementById('wxRedPacketOverlay').classList.remove('show')">關閉</div></div></div>

                    <div class="wx-footer-wrapper" style="display:${inputDisplay}">
                        <div class="wx-input-bar">
                            ${triggerBtn}
                            <input class="wx-input-real" placeholder="" oninput="${app}.onInputCheck(this)" onkeydown="${app}.onInputKey(event, this)">
                            <span class="wx-icon-btn" onclick="${app}.toggleStickerPanel()">☺</span>
                            <span class="wx-icon-btn" onclick="${app}.togglePanel()">⊕</span>
                            <div class="wx-send-btn" onclick="${app}.sendMsg(this)">发送</div>
                        </div>
                        <div class="wx-sticker-panel">
                            <div class="wx-stk-panel-header">
                                <div class="wx-stk-tabs-wrap" id="wxStickerTabs"></div>
                                <span class="wx-stk-manage-toggle" title="管理庫" onclick="(function(t){var a=t.closest('.wx-sticker-panel').querySelector('.wx-stk-manage-area');a.classList.toggle('open');var w=window.parent||window;if(w.WX_STICKER)w.WX_STICKER.renderManage();})(this)">⚙</span>
                            </div>
                            <div class="wx-sticker-grid" id="wxStickerGrid"></div>
                            <div class="wx-stk-manage-area">
                                <div class="wx-stk-manage-inner">
                                    <div id="wxStickerManage"></div>
                                    <div class="wx-stk-import-row">
                                        <input class="wx-stk-url-input" id="wxStickerBaseUrl" placeholder="資料夾 URL（選填）如：https://cdn.com/stickers/">
                                        <label class="wx-stk-file-btn">📂 上傳 TXT<input type="file" accept=".txt" style="display:none" onchange="var w=window.parent||window;if(w.WX_STICKER)w.WX_STICKER.importFromFile(this)"></label>
                                    </div>
                                    <details style="margin-top:4px;">
                                        <summary style="font-size:11px; color:#aaa; cursor:pointer; user-select:none;">📄 TXT 格式說明</summary>
                                        <div style="font-size:11px; color:#999; line-height:1.7; margin-top:4px; padding:6px 8px; background:#f9f9f9; border-radius:4px; border:1px solid #eee;">
                                            第一行：<code>library:庫名稱</code><br>
                                            之後每行：<code>顯示名稱:檔名.gif</code>（有資料夾 URL 時只填檔名）<br>
                                            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;或：<code>顯示名稱:https://完整URL</code>
                                        </div>
                                    </details>
                                </div>
                            </div>
                        </div>

                        <div class="wx-action-panel">
                            <div class="wx-scroll-view" onscroll="${app}.onScrollDot(this)">
                                <div class="wx-grid-page">
                                    <div class="wx-grid-item" onclick="${app}.action('photo')"><div class="wx-grid-icon">🖼️</div><div class="wx-grid-label">照片</div></div>
                                    <div class="wx-grid-item" onclick="${app}.action('video_file')"><div class="wx-grid-icon">📹</div><div class="wx-grid-label">視頻</div></div>
                                    <div class="wx-grid-item" onclick="${app}.action('voice_msg')"><div class="wx-grid-icon">🎙️</div><div class="wx-grid-label">語音</div></div>
                                    <div class="wx-grid-item" onclick="${app}.action('call')"><div class="wx-grid-icon">📞</div><div class="wx-grid-label">通話</div></div>
                                    <div class="wx-grid-item" onclick="${app}.action('location')"><div class="wx-grid-icon">📍</div><div class="wx-grid-label">定位</div></div>
                                    <div class="wx-grid-item" onclick="${app}.action('redpacket')"><div class="wx-grid-icon">🧧</div><div class="wx-grid-label">紅包</div></div>
                                    <div class="wx-grid-item" onclick="${app}.action('transfer')"><div class="wx-grid-icon">💸</div><div class="wx-grid-label">轉帳</div></div>
                                    <div class="wx-grid-item" onclick="${app}.action('file_card')"><div class="wx-grid-icon">📂</div><div class="wx-grid-label">文件</div></div>
                                </div>
                                <div class="wx-grid-page">
                                    <div class="wx-grid-item" onclick="${app}.action('gift')"><div class="wx-grid-icon">🎁</div><div class="wx-grid-label">禮物</div></div>
                                </div>
                            </div>
                            <div class="wx-dots" id="wxPanelDots"><div class="wx-dot active"></div><div class="wx-dot"></div></div>
                        </div>
                    </div>

                    <div class="wx-bottom-nav" style="display:${tabDisplay}; ${darkTabStyle}">
                        <div class="wx-tab ${activeTab === 'chat' ? 'active' : ''}" onclick="${app}.switchTab('chat')">
                            <div class="wx-tab-icon-box">
                                ${chatBadgeHTML}
                                <div class="wx-tab-icon">${iconChat}</div>
                            </div>
                            <div class="wx-tab-txt">聊天</div>
                        </div>
                        <div class="wx-tab ${activeTab === 'contacts' ? 'active' : ''}" onclick="${app}.switchTab('contacts')">
                            <div class="wx-tab-icon-box">
                                <div class="wx-tab-icon">${iconContact}</div>
                            </div>
                            <div class="wx-tab-txt">通訊錄</div>
                        </div>
                        <div class="wx-tab ${activeTab === 'discover' ? 'active' : ''}" onclick="${app}.switchTab('discover')">
                            <div class="wx-tab-icon-box">
                                <div class="wx-tab-dot"></div>
                                <div class="wx-tab-icon">${iconDiscover}</div>
                            </div>
                            <div class="wx-tab-txt">發現</div>
                        </div>
                        <div class="wx-tab ${activeTab === 'me' ? 'active' : ''}" onclick="${app}.switchTab('me')">
                            <div class="wx-tab-icon-box">
                                <div class="wx-tab-icon">${iconMe}</div>
                            </div>
                            <div class="wx-tab-txt">我</div>
                        </div>
                    </div>

                </div>
            `;
            
            // --- 7. 啟動異步圖片加載 ---
            setTimeout(() => {
                const win = window.parent || window;
                if (!win.OS_DB) return;

                // A. 加載背景圖
                if (bgDbId) {
                    win.OS_DB.getImage(bgDbId).then(url => {
                        const bgLayer = doc.getElementById('wx-room-bg-layer');
                        if (bgLayer && url) {
                            bgLayer.style.backgroundImage = `url('${url}')`;
                            const room = doc.getElementById('wx-current-room-bg');
                            if (room) room.classList.add('has-bg');
                        }
                    });
                }
                
                // B. 加載列表/氣泡中的頭像（DB）
                const targets = doc.querySelectorAll('.db-load-target');
                targets.forEach(async el => {
                    const id = el.getAttribute('data-db-bg');
                    if (id) {
                        try {
                            const url = await win.OS_DB.getImage(id);
                            if (url) el.style.backgroundImage = `url('${url}')`;
                        } catch(e) {}
                    }
                });

                // C. 從 VN 串接獲取頭像：lorebook → mem cache → VN IndexedDB
                const vnTargets = doc.querySelectorAll('.vn-load-target');
                vnTargets.forEach(async el => {
                    const name = el.getAttribute('data-vn-name');
                    if (!name) return;
                    try {
                        const url = await _resolveVNAvatar(name);
                        if (url) el.style.backgroundImage = `url('${url}')`;
                    } catch(e) {}
                });
            }, 50);

            return html;
        }
    };
})();