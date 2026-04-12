// ----------------------------------------------------------------
// [檔案] wx_contacts.js (V3.8 - Global Delete Sync)
// 路徑：os_phone/wx/wx_contacts.js
// 職責：管理通訊錄、AI 搜尋好友、右鍵菜單、群聊創建、邀請成員。
// 🚨 優化報告 (V3.8)：
// 1. [修復] 刪除聯繫人時，同步通知 `OS_CONTACTS` 刪除全局數據，徹底解決「幽靈帳號」在微博轉發列表出現的問題。
// 2. [保留] V3.7 的 Debug 輸出與 AI JSON 解析功能。
// ----------------------------------------------------------------
(function() {
    console.log('[WeChat] 載入通訊錄模塊 V3.8 (Global Delete Sync)...');
    const win = window.parent || window;
    const targetDoc = win.document;
    const CONTACTS_STORAGE_KEY = 'wx_custom_contacts_v1';

    win.WX_CONTACTS = {
        init: function(globalChats) {
            const saved = localStorage.getItem(CONTACTS_STORAGE_KEY);
            if (saved) {
                try {
                    const customs = JSON.parse(saved);
                    customs.forEach(c => {
                        if (!globalChats[c.id]) {
                            globalChats[c.id] = {
                                name: c.name, id: c.id, members: c.members || [c.id], isGroup: !!c.isGroup,
                                messages: [], lastTime: '', unread: false, customAvatar: c.avatarId || null, desc: c.desc || c.bio || '...'
                            };
                        }
                    });
                } catch(e) { console.error("通訊錄讀取錯誤", e); }
            }
        },

        // --- ID 管理 ---
        getOrCreateContactID: function(input, avatarKeyword, saveToStorage = true, forcedId = null) {
            if (input === 'User' || input === '我') return 'User';
            
            let list = this.getAllCustomContacts();
            
            // 1. 檢查 input 是否已是 ID
            let existById = list.find(c => c.id === input);
            if (existById) return existById.id;

            // 2. 檢查名字
            let existByName = list.find(c => !c.isGroup && (c.name === input));
            if (existByName) return existByName.id; 

            if (!saveToStorage) return input; 

            // 3. 創建新聯絡人 (隱形註冊)
            let newId = forcedId || ('char_' + (Math.floor(Math.random() * 900) + 100));
            while(list.find(c => c.id === newId)) {
                newId = 'char_' + (Math.floor(Math.random() * 900) + 100);
            }
            
            const newContact = {
                id: newId, name: input, desc: '這個人很懶，什麼都沒寫', 
                avatarId: null, aiKeyword: avatarKeyword || 'user', isGroup: false
            };
            list.push(newContact);
            localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(list));
            console.log(`[WX_CONTACTS] 自動註冊新成員: ${input} (ID: ${newId})`);
            return newId;
        },

        // --- AI 搜尋核心 ---
        openSearchWindow: async function() {
            if (!win.OS_API) { alert('錯誤：OS_API 未載入'); return; }
            let metaInfo = { charName: "系統", bookName: "無", userName: "User" };

            const html = `<div class="wx-modal-title">AI 搜尋好友</div><div style="background:#f0f9eb; border:1px solid #e1f3d8; border-radius:4px; padding:8px; margin-bottom:10px; font-size:11px; color:#2e7d32;"><div style="display:flex; justify-content:space-between;"><span>👤 鎖定角色: <b id="wx-meta-char">...</b></span></div><div style="display:flex; justify-content:space-between; margin-top:2px;"><span>😎 當前扮演: <b id="wx-meta-user">...</b></span></div><div style="margin-top:2px;"><span>📖 世界觀: <b id="wx-meta-book">...</b></span></div></div><div style="font-size:12px; color:#666; margin-bottom:5px;">AI 將根據世界觀與您的人設，推薦潛在好友。</div><div id="wx-search-status" style="padding:10px; background:#f2f2f2; border-radius:4px; min-height:50px; font-size:12px; color:#333;">準備中...</div><div id="wx-token-status" style="margin-top:5px; font-size:11px; color:#888; text-align:right;">📊 計算中...</div><div class="wx-modal-footer"><button class="wx-btn wx-btn-cancel" id="wx-btn-close">關閉</button><button class="wx-btn wx-btn-confirm" id="wx-btn-search-start" disabled>加載中...</button></div>`;
            this.showModal(html);
            targetDoc.getElementById('wx-btn-close').onclick = () => targetDoc.getElementById('wxActionModal').classList.remove('show');
            const statusEl = targetDoc.getElementById('wx-search-status');
            const tokenEl  = targetDoc.getElementById('wx-token-status');
            const btn      = targetDoc.getElementById('wx-btn-search-start');

            try {
                // --- 讀取顯示資訊 ---
                const userMod = win.WX_USER || win.OS_USER;
                if (userMod) {
                    const u = userMod.getInfo();
                    if (u.name && u.name !== 'User') metaInfo.userName = u.name;
                }
                const th = window.TavernHelper;
                if (th) {
                    const charData = th.getCharData?.();
                    if (charData?.name) metaInfo.charName = charData.name;
                    const activeBook = typeof th.getCharWorldbookNames === 'function'
                        ? (th.getCharWorldbookNames('current')?.primary || null)
                        : (typeof th.getCurrentCharPrimaryLorebook === 'function' ? th.getCurrentCharPrimaryLorebook() : null);
                    if (activeBook) metaInfo.bookName = activeBook;
                }
                targetDoc.getElementById('wx-meta-char').innerText = metaInfo.charName;
                targetDoc.getElementById('wx-meta-book').innerText = metaInfo.bookName;
                targetDoc.getElementById('wx-meta-user').innerText = metaInfo.userName;

                // --- 用 buildContext 組裝完整 messages（與 child/host/qb 同架構）---
                // contact_search_user 含 JSON 格式規範，拼入 userMessage 一起送
                const formatPrompt = win.OS_PROMPTS?.get('contact_search_user') || '';
                const userMessage = `【搜尋指令】\n當前用戶：${metaInfo.userName}\n請為 ${metaInfo.userName} 推薦潛在好友或群組，嚴禁將 ${metaInfo.userName} 本人列入名單。\n\n${formatPrompt}`.replace(/\{\{user\}\}/g, metaInfo.userName);
                const messages = await win.OS_API.buildContext(userMessage, 'contact_search_sys');

                // Token 估算
                const fullText = messages.map(m => m.content).join('\n');
                let count = win.SillyTavern?.getTokenCountAsync
                    ? await win.SillyTavern.getTokenCountAsync(fullText)
                    : Math.ceil(fullText.length * 0.7);
                tokenEl.innerHTML = `<span style="color:#07c160">📊 預估 Token: ${count} (完整上下文)</span>`;
                statusEl.innerText = `準備就緒 (為 ${metaInfo.userName} 搜尋)`;
                btn.innerText = '開始搜尋';
                btn.disabled = false;

                btn.onclick = async () => {
                    btn.disabled = true;
                    statusEl.innerText = '📡 正在連線 AI...';
                    const config = win.OS_SETTINGS?.getConfig?.()
                        || (localStorage.getItem('wx_phone_api_config') ? JSON.parse(localStorage.getItem('wx_phone_api_config')) : {});
                    const apiModule = win.OS_API || win.WX_API;

                    if (apiModule) {
                        await apiModule.chat(messages, { ...config, enableStreaming: false }, null, (finalText) => {
                            
                            // 🔥 [關鍵新增] 打印原始 JSON，方便調試！
                            console.log("🔥 [AI Raw Output]:", finalText);

                            try {
                                let contacts = null;

                                // --- 方案 A：標籤格式 ---
                                // 私聊：[Contact|id|private|name|bio]
                                // 群組：[Contact|id|group|name|bio|member_id1,member_id2]
                                const tagRegex = /\[Contact\|([^\|\]]+)\|([^\|\]]+)\|([^\|\]]+)\|([^\|\]]*)\|?([^\]]*)\]/g;
                                const tagMatches = [...finalText.matchAll(tagRegex)];
                                if (tagMatches.length > 0) {
                                    contacts = tagMatches.map(m => {
                                        const type = m[2].trim();
                                        const rawMembers = m[5] ? m[5].trim() : '';
                                        const members = rawMembers
                                            ? rawMembers.split(',').map(s => s.trim()).filter(Boolean)
                                            : [];
                                        return {
                                            id:       m[1].trim(),
                                            type,
                                            name:     m[3].trim(),
                                            realName: m[3].trim(),
                                            bio:      m[4].trim(),
                                            members   // 群組成員 id 列表（私聊為空）
                                        };
                                    });
                                    statusEl.innerHTML += `<br><span style="color:#888;font-size:10px">(標籤格式)</span>`;
                                }

                                // --- 方案 B：JSON 格式（備用）---
                                if (!contacts) {
                                    const startIdx = finalText.indexOf('[');
                                    if (startIdx === -1) throw new Error("無效格式 (找不到 [ 或 [Contact|)");
                                    let candidate = finalText.substring(startIdx);
                                    try { const match = candidate.match(/\[[\s\S]*\]/); contacts = JSON.parse(match ? match[0] : candidate); } catch (e1) { const lastComma = candidate.lastIndexOf('},'); if (lastComma !== -1) { contacts = JSON.parse(candidate.substring(0, lastComma + 1) + "]"); statusEl.innerHTML += `<br><span style="color:#ff9800">(自動修復 JSON)</span>`; } else throw e1; }
                                }

                                console.log("🔥 [Parsed Contacts]:", contacts);

                                if (contacts && Array.isArray(contacts)) {
                                    const filtered = contacts.filter(c => c.name !== metaInfo.userName && c.id !== 'User' && c.name !== '我');

                                    // 群組成員自動填充：將同批私聊 id 填入 members 為空的群組
                                    const batchPrivateIds = filtered.filter(c => c.type === 'private').map(c => c.id);
                                    filtered.forEach(c => {
                                        if (c.type === 'group' && (!c.members || c.members.length === 0)) {
                                            c.members = [...batchPrivateIds];
                                        }
                                    });

                                    statusEl.innerHTML = `<div style="color:#07c160">✅ 成功找到 ${filtered.length} 位好友！</div>`;

                                    const createdChats = [];
                                    filtered.forEach(c => {
                                        const isPrivate = c.type === 'private';
                                        const aiId = (c.id && c.id.length < 25) ? c.id : null;

                                        const existingId = this.getOrCreateContactID(c.name, c.avatar, true, aiId);
                                        const contactData = { id: existingId, name: c.name, desc: c.bio || c.desc, avatarId: null, aiKeyword: c.avatar, isGroup: !isPrivate };

                                        // 🔥 [新增] 保存到统一联系人系统
                                        if (isPrivate && win.OS_CONTACTS) {
                                            win.OS_CONTACTS.upsert({
                                                id: existingId,
                                                realName: c.realName || c.name,  // 使用 AI 提供的真名
                                                isNPC: false,
                                                wx: {
                                                    nickname: c.name,
                                                    bio: c.bio || c.desc || '这个人很懒，什么都没写',
                                                    avatarId: c.avatar
                                                }
                                            });
                                        }

                                        // 🔥 群組成員解析 (物件/字串雙支援)
                                        if (!isPrivate) {
                                            contactData.members = (c.members || []).map(m => {
                                                // 情況 A: AI 聽話了，給了 {id, name}
                                                if (typeof m === 'object' && m.name && m.id) {
                                                    // 自動註冊 (saveToStorage=true)，但不加入聊天列表 (隱形)
                                                    const memberId = this.getOrCreateContactID(m.name, 'user', true, m.id);

                                                    // 🔥 [新增] NPC 也保存到 OS_CONTACTS（标记为 NPC）
                                                    if (win.OS_CONTACTS) {
                                                        win.OS_CONTACTS.upsert({
                                                            id: memberId,
                                                            realName: m.name,  // NPC 真名 = 显示名
                                                            isNPC: true,
                                                            wx: { nickname: m.name, bio: '群组成员' }
                                                        });
                                                    }

                                                    return memberId;
                                                }
                                                // 情況 B: 字串視為已知 id（標籤格式成員欄就是 id）
                                                return m;
                                            });
                                        }

                                        this.addContactToStorage(contactData);
                                        createdChats.push(contactData);
                                    });

                                    if (win.wxApp && win.wxApp.GLOBAL_CHATS) {
                                        createdChats.forEach(chat => {
                                            if (!win.wxApp.GLOBAL_CHATS[chat.id]) {
                                                win.wxApp.GLOBAL_CHATS[chat.id] = { id: chat.id, name: chat.name, desc: chat.desc, aiKeyword: chat.aiKeyword, members: chat.members || [chat.id], isGroup: chat.isGroup, messages: [], unread: false, lastTime: Date.now() };
                                            }
                                        });
                                        win.wxApp.render();
                                    }
                                    
                                    (async () => { if (win.WX_DB) { for (const chat of createdChats) { await win.WX_DB.saveApiChat(chat.id, { name: chat.name, id: chat.id, members: chat.members || [chat.name], isGroup: chat.isGroup, messages: [], lastTime: '', unread: false, desc: chat.desc }); } } })();
                                    setTimeout(() => targetDoc.getElementById('wxActionModal').classList.remove('show'), 800);
                                }
                            } catch (e) { 
                                console.error("[WX_CONTACTS] JSON Parse Error:", e);
                                statusEl.innerText = "❌ 解析失敗: " + e.message; 
                            }
                            btn.disabled = false;
                        }, (err) => { statusEl.innerText = "❌ 連線失敗: " + err.message; btn.disabled = false; }, { disableTyping: true });
                    } else { statusEl.innerText = "❌ 錯誤: API 模塊未加載"; }
                };
            } catch (e) { targetDoc.getElementById('wx-search-status').innerText = "❌ 初始化失敗: " + e.message; }
        },

        addContactToStorage: function(contactObj) {
            let saved = localStorage.getItem(CONTACTS_STORAGE_KEY); let list = saved ? JSON.parse(saved) : [];
            const idx = list.findIndex(c => c.id === contactObj.id);
            if (idx >= 0) { list[idx] = { ...list[idx], ...contactObj }; } else { list.push(contactObj); }
            localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(list));
        },
        getAllCustomContacts: function() { const saved = localStorage.getItem(CONTACTS_STORAGE_KEY); return saved ? JSON.parse(saved) : []; },
        updateContactInfo: function(id, data) {
            let list = this.getAllCustomContacts(); const idx = list.findIndex(c => c.id === id);
            if (idx >= 0) { Object.assign(list[idx], data); localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(list)); }
        },
        openInviteWindow: function(chatId, currentMemberIds, callback) {
            const allContacts = this.getAllCustomContacts().filter(c => !c.isGroup);
            const candidates = allContacts.filter(c => !currentMemberIds.includes(c.id));
            if (candidates.length === 0) { alert('通訊錄裡沒有其他好友可邀請了！'); return; }
            let listHtml = candidates.map(c => `<label style="display:flex; align-items:center; padding:10px; border-bottom:1px solid #eee; cursor:pointer;"><input type="checkbox" class="wx-invite-check" value="${c.id}" style="margin-right:10px;"><div style="font-weight:bold;">${c.name}</div></label>`).join('');
            const html = `<div class="wx-modal-title">邀請成員</div><div style="padding:10px;"><div style="max-height:250px; overflow-y:auto; border:1px solid #eee; border-radius:4px;">${listHtml}</div></div><div class="wx-modal-footer"><button class="wx-btn wx-btn-cancel" id="wx-btn-cancel">取消</button><button class="wx-btn wx-btn-confirm" id="wx-btn-invite-confirm">邀請</button></div>`;
            this.showModal(html);
            targetDoc.getElementById('wx-btn-cancel').onclick = () => targetDoc.getElementById('wxActionModal').classList.remove('show');
            targetDoc.getElementById('wx-btn-invite-confirm').onclick = () => {
                const checks = targetDoc.querySelectorAll('.wx-invite-check:checked'); if (checks.length === 0) { alert('請至少選擇一位好友'); return; }
                const newIds = Array.from(checks).map(c => c.value); const finalMembers = [...currentMemberIds, ...newIds];
                if (win.wxApp && win.wxApp.GLOBAL_CHATS[chatId]) {
                    const chat = win.wxApp.GLOBAL_CHATS[chatId];
                    chat.members = finalMembers;
                    
                    // 🔥 為每個新成員添加系統消息
                    newIds.forEach(memberId => {
                        // 獲取成員名稱
                        let memberName = memberId;
                        const contact = allContacts.find(c => c.id === memberId);
                        if (contact && contact.name) {
                            memberName = contact.name;
                        }
                        
                        // 添加系統消息：XXX加入了群聊
                        const sysMsg = { type: 'system', content: `${memberName}加入了群聊`, isMe: false };
                        chat.messages.push(sysMsg);
                    });
                    
                    // 渲染更新
                    if (win.wxApp.GLOBAL_ACTIVE_ID === chatId && win.wxApp.render) {
                        win.wxApp.render();
                    }
                }
                this.updateContactInfo(chatId, { members: finalMembers });
                if (win.WX_DB && win.WX_DB.saveApiChat && win.wxApp.GLOBAL_CHATS[chatId]) { win.WX_DB.saveApiChat(chatId, win.wxApp.GLOBAL_CHATS[chatId]); }
                
                // 如果有 API 配置，發送系統消息到 API
                if (win.wxApp && win.wxApp.GLOBAL_CHATS[chatId]) {
                    const chat = win.wxApp.GLOBAL_CHATS[chatId];
                    const configStr = localStorage.getItem('wx_phone_api_config');
                    if (configStr) {
                        const conf = JSON.parse(configStr);
                        if (!conf.directMode && window.TavernHelper) {
                            // 獲取所有成員名稱（使用更新後的成員列表）
                            const allContactsForNames = this.getAllCustomContacts();
                            const memberNames = (finalMembers || []).map(id => {
                                if (id === "User" || id === "user") {
                                    if (win.WX_USER && typeof win.WX_USER.getInfo === 'function') {
                                        return win.WX_USER.getInfo().name || "User";
                                    }
                                    return "User";
                                }
                                const c = allContactsForNames.find(contact => contact.id === id);
                                return c ? c.name : id;
                            }).filter(name => name);
                            
                            const chatName = chat.name || chatId;
                            const memberStr = memberNames.length > 0 ? memberNames.join(', ') : chatName;
                            
                            // 為每個新成員發送系統消息到 API
                            newIds.forEach(memberId => {
                                let memberName = memberId;
                                const contact = allContacts.find(c => c.id === memberId);
                                if (contact && contact.name) {
                                    memberName = contact.name;
                                }
                                
                                const content = `${memberName}加入了群聊`;
                                const fullProtocolMessage = `\n[Chat: ${chatName}|${chatId}]\n[With: ${memberStr}]\n[System: ${content}]`;
                                window.TavernHelper.createChatMessages([{ role:'user', message: fullProtocolMessage }]);
                            });
                        }
                    }
                }
                
                alert(`成功邀請 ${newIds.length} 位成員！`); targetDoc.getElementById('wxActionModal').classList.remove('show'); if (callback) callback(finalMembers);
            };
        },
        showContextMenu: function(e, contactId, contactName) {
            e.preventDefault(); e.stopPropagation();
            const existing = targetDoc.getElementById('wx-context-menu'); if (existing) existing.remove();
            const menu = targetDoc.createElement('div'); menu.id = 'wx-context-menu'; menu.className = 'wx-context-menu';
            menu.innerHTML = `<div class="wx-context-item danger" id="wx-ctx-delete">刪除 (永久)</div>`;
            let x = e.clientX; let y = e.clientY; if (x + 120 > win.innerWidth) x = win.innerWidth - 130; if (y + 100 > win.innerHeight) y = win.innerHeight - 110;
            menu.style.left = x + 'px'; menu.style.top = y + 'px'; targetDoc.body.appendChild(menu);
            menu.querySelector('#wx-ctx-delete').onclick = () => { if(confirm(`⚠️ 確定要永久刪除「${contactName}」嗎？\nID: ${contactId}`)) { this.deleteContact(contactId); } menu.remove(); };
            setTimeout(() => { targetDoc.addEventListener('click', function closeCtx() { menu.remove(); targetDoc.removeEventListener('click', closeCtx); }); }, 0);
        },
        
        // 🔥 核心修復點：刪除聯絡人時，同步清空全局的 OS_CONTACTS 數據
        deleteContact: async function(id) {
            // 1. 刪除微信本地儲存的聯絡人
            let saved = localStorage.getItem(CONTACTS_STORAGE_KEY);
            if (saved) { 
                let list = JSON.parse(saved); 
                const newList = list.filter(c => c.id !== id); 
                localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(newList)); 
            }
            
            // 2. 刪除資料庫中的聊天歷史紀錄
            if (win.WX_DB && typeof win.WX_DB.deleteApiChat === 'function') { 
                await win.WX_DB.deleteApiChat(id); 
            }
            
            // 3. 刪除當前畫面上渲染的聊天對象
            if (win.wxApp && win.wxApp.GLOBAL_CHATS) { 
                if (win.wxApp.GLOBAL_ACTIVE_ID === id) win.wxApp.goBack(); 
                delete win.wxApp.GLOBAL_CHATS[id]; 
                win.wxApp.render(); 
            }

            // 4. 🔥 同步刪除全局的 OS_CONTACTS (解決微博與其他模組抓到幽靈帳號的問題)
            if (win.OS_CONTACTS && typeof win.OS_CONTACTS.deleteContact === 'function') {
                win.OS_CONTACTS.deleteContact(id);
                console.log(`[WX_CONTACTS] 已同步刪除全局聯繫人: ${id}`);
            }
        },
        
        showMenu: function(btn) {
            const existing = targetDoc.getElementById('wx-plus-menu'); if (existing) { existing.remove(); return; }
            const menu = targetDoc.createElement('div'); menu.id = 'wx-plus-menu'; menu.className = 'wx-plus-menu-pop';
            menu.innerHTML = `<div class="wx-menu-item" id="wx-menu-create-group"><span class="icon">💬</span> 發起群聊</div><div class="wx-menu-item" id="wx-menu-add"><span class="icon">➕</span> 添加朋友</div><div class="wx-menu-item" id="wx-menu-search"><span class="icon">🔍</span> AI 搜尋</div>`;
            const rect = btn.getBoundingClientRect(); menu.style.top = (rect.bottom + 5) + 'px'; menu.style.right = (win.innerWidth - rect.right) + 'px'; targetDoc.body.appendChild(menu);
            menu.querySelector('#wx-menu-create-group').onclick = () => this.openCreateGroupWindow();
            menu.querySelector('#wx-menu-add').onclick = () => this.openAddWindow();
            menu.querySelector('#wx-menu-search').onclick = () => this.openSearchWindow();
            setTimeout(() => { targetDoc.addEventListener('click', function closeMenu(e) { if (!menu.contains(e.target) && e.target !== btn) { menu.remove(); targetDoc.removeEventListener('click', closeMenu); } }); }, 0);
        },
        openCreateGroupWindow: function() {
            const allContacts = this.getAllCustomContacts().filter(c => !c.isGroup);
            if (allContacts.length === 0) { alert('通訊錄目前沒有好友，無法建群！'); return; }
            let listHtml = allContacts.map(c => `<label style="display:flex; align-items:center; padding:10px; border-bottom:1px solid #eee; cursor:pointer;"><input type="checkbox" class="wx-group-check" value="${c.id}" style="margin-right:10px;"><div style="font-weight:bold;">${c.name}</div></label>`).join('');
            const html = `<div class="wx-modal-title">發起群聊</div><div style="padding:10px;"><input type="text" id="wx-group-create-name" class="wx-modal-input" placeholder="請輸入群聊名稱"><div style="margin-top:10px; font-size:12px; color:#888;">選擇群成員:</div><div style="max-height:200px; overflow-y:auto; border:1px solid #eee; border-radius:4px; margin-top:5px;">${listHtml}</div></div><div class="wx-modal-footer"><button class="wx-btn wx-btn-cancel" id="wx-btn-cancel">取消</button><button class="wx-btn wx-btn-confirm" id="wx-btn-create-group">創建</button></div>`;
            this.showModal(html);
            targetDoc.getElementById('wx-btn-cancel').onclick = () => targetDoc.getElementById('wxActionModal').classList.remove('show');
            targetDoc.getElementById('wx-btn-create-group').onclick = () => {
                const name = targetDoc.getElementById('wx-group-create-name').value.trim(); const checks = targetDoc.querySelectorAll('.wx-group-check:checked');
                if (!name) { alert('群名不能為空'); return; } if (checks.length === 0) { alert('至少選擇一個成員'); return; }
                const groupId = 'group_' + Date.now(); const memberIds = Array.from(checks).map(c => c.value); memberIds.push("User");
                this.addContactToStorage({ id: groupId, name: name, isGroup: true, members: memberIds });
                if (win.wxApp && win.wxApp.GLOBAL_CHATS) { win.wxApp.GLOBAL_CHATS[groupId] = { id: groupId, name: name, isGroup: true, members: memberIds, messages: [], lastTime: Date.now(), unread: false }; win.wxApp.render(); }
                targetDoc.getElementById('wxActionModal').classList.remove('show');
            };
        },
        openAddWindow: function() {
            const html = `
<div class="wx-modal-title">手動添加好友</div>
<div style="display:flex;flex-direction:column;gap:10px;align-items:center;width:100%;">
  <label for="wx-upload-avatar" class="wx-avatar-upload" id="wx-avatar-preview" title="點擊上傳頭像"><span>📷</span></label>
  <input type="file" id="wx-upload-avatar" accept="image/*" style="display:none;">
  <input type="text" id="wx-add-name" class="wx-modal-input" placeholder="輸入名稱 (例: 林黛玉)">
  <input type="text" id="wx-add-desc" class="wx-modal-input" placeholder="個性簽名 (選填)">
  <textarea id="wx-add-persona" class="wx-modal-input" placeholder="角色設定 (選填，AI 會帶入 System Prompt)" style="resize:vertical;min-height:80px;width:100%;font-family:inherit;font-size:13px;padding:8px 12px;border:1px solid #e0e0e0;border-radius:6px;box-sizing:border-box;"></textarea>
  <button id="wx-load-worldbook-btn" style="width:100%;padding:8px;background:#f0f9f0;border:1px solid #07c160;border-radius:6px;color:#07c160;font-size:13px;cursor:pointer;font-weight:600;">📖 從世界書載入角色設定</button>
  <div id="wx-worldbook-list" style="display:none;width:100%;max-height:180px;overflow-y:auto;border:1px solid #e0e0e0;border-radius:6px;background:#fff;"></div>
</div>
<div class="wx-modal-footer"><button class="wx-btn wx-btn-cancel" id="wx-btn-cancel">取消</button><button class="wx-btn wx-btn-confirm" id="wx-btn-add-confirm">添加</button></div>`;
            this.showModal(html);

            const fileInput = targetDoc.getElementById('wx-upload-avatar');
            const preview   = targetDoc.getElementById('wx-avatar-preview');
            let selectedFile = null;

            fileInput.onchange = (e) => {
                const file = e.target.files[0];
                if (file) { selectedFile = file; preview.style.backgroundImage = `url('${URL.createObjectURL(file)}')`; preview.style.backgroundSize = 'cover'; preview.innerHTML = ''; }
            };

            // ── 從世界書載入 ──
            targetDoc.getElementById('wx-load-worldbook-btn').onclick = async () => {
                const listEl = targetDoc.getElementById('wx-worldbook-list');
                if (listEl.style.display !== 'none') { listEl.style.display = 'none'; return; }
                listEl.innerHTML = '<div style="padding:8px 12px;color:#999;font-size:12px;">載入中...</div>';
                listEl.style.display = 'block';
                try {
                    const entries = win.OS_WORLDBOOK
                        ? await win.OS_WORLDBOOK.getEnabledEntries()
                        : (win.OS_DB ? await win.OS_DB.getAllWorldbookEntries() : []);
                    if (!entries || entries.length === 0) {
                        listEl.innerHTML = '<div style="padding:8px 12px;color:#999;font-size:12px;">世界書裡沒有啟用的條目</div>';
                        return;
                    }
                    listEl.innerHTML = entries.map(e => `
                        <div data-id="${e.id}" data-title="${(e.title||'').replace(/"/g,'&quot;')}" data-content="${(e.content||'').replace(/"/g,'&quot;')}"
                             style="padding:10px 14px;border-bottom:1px solid #f0f0f0;cursor:pointer;font-size:13px;">
                            <div style="font-weight:600;color:#1a1a1a;">${e.title || '(無標題)'}</div>
                            <div style="color:#999;font-size:11px;margin-top:2px;">${e.category || ''} · ${(e.content||'').length} 字</div>
                        </div>`).join('');
                    listEl.querySelectorAll('[data-id]').forEach(item => {
                        item.onmouseenter = () => item.style.background = '#f5fff5';
                        item.onmouseleave = () => item.style.background = '';
                        item.onclick = () => {
                            const title   = item.dataset.title;
                            const content = item.dataset.content;
                            // 填入名稱（若空）和角色設定
                            const nameEl = targetDoc.getElementById('wx-add-name');
                            if (!nameEl.value) nameEl.value = title;
                            targetDoc.getElementById('wx-add-persona').value = content;
                            listEl.style.display = 'none';
                        };
                    });
                } catch(e) {
                    listEl.innerHTML = `<div style="padding:8px 12px;color:#e06060;font-size:12px;">載入失敗：${e.message}</div>`;
                }
            };

            targetDoc.getElementById('wx-btn-cancel').onclick = () => targetDoc.getElementById('wxActionModal').classList.remove('show');
            targetDoc.getElementById('wx-btn-add-confirm').onclick = async () => {
                const name    = targetDoc.getElementById('wx-add-name').value.trim();
                const desc    = targetDoc.getElementById('wx-add-desc').value.trim();
                const persona = targetDoc.getElementById('wx-add-persona').value.trim();
                if (!name) { alert('名稱不能為空'); return; }
                let avatarId = null;
                if (selectedFile && win.WX_DB) { avatarId = 'avt_' + Date.now(); await win.WX_DB.saveImage(avatarId, selectedFile); }
                const newContact = { id: 'char_' + Date.now(), name, desc: desc || '這個人很懶，什麼都沒寫', avatarId, isGroup: false, persona: persona || '' };
                this.addContactToStorage(newContact);
                if (win.wxApp && win.wxApp.GLOBAL_CHATS) {
                    win.wxApp.GLOBAL_CHATS[newContact.id] = { id: newContact.id, name: newContact.name, desc: newContact.desc, customAvatar: newContact.avatarId, persona: newContact.persona, isGroup: false, members: [newContact.id], messages: [], lastTime: Date.now(), unread: false };
                    win.wxApp.render();
                }
                targetDoc.getElementById('wxActionModal').classList.remove('show');
            };
        },
        showModal: function(innerHtml) {
            const modal = targetDoc.getElementById('wxActionModal'); if(!modal) return;
            const customContainer = targetDoc.getElementById('wx-custom-modal-content') || this.createModalContainer();
            ['wxModalTitle', 'wxModalInput', 'wxModalInput2'].forEach(id => { const el = targetDoc.getElementById(id); if(el) el.style.display = 'none'; });
            const footer = modal.querySelector('.wx-modal-footer'); if(footer) footer.style.display = 'none';
            customContainer.innerHTML = innerHtml; customContainer.style.display = 'block'; modal.classList.add('show');
        },
        createModalContainer: function() { const div = targetDoc.createElement('div'); div.id = 'wx-custom-modal-content'; const box = targetDoc.querySelector('.wx-modal-box'); if(box) box.appendChild(div); return div; }
    };
})();