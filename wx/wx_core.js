// ----------------------------------------------------------------
// [檔案 3] wx_core.js
// 模塊：核心邏輯 (Controller/Core)
// ----------------------------------------------------------------

(async function () {
    console.log('[WeChat] Core V72.0 (Interactive) Loaded');

    const ctx = (window.parent && window.parent.document) ? window.parent : window;
    const doc = ctx.document;

    // 1. 依賴檢查
    if (window.WX_THEME) { window.WX_THEME.inject(doc); }
    if (!window.WX_VIEW) { console.error('錯誤：未檢測到 wx_view.js'); return; }

    // 2. 狀態管理
    let GLOBAL_CHATS = {}; 
    let GLOBAL_ACTIVE_CHAT = null;
    let RENDER_QUEUE = []; 
    let PENDING_ACTION_TYPE = null; // 暫存當前正在進行的動作類型

    // 3. 核心解析器
    function parseChunk(cleanText, existingChats) {
        const lines = cleanText.split('\n');
        let currentChat = "未分類";

        lines.forEach(line => {
            line = line.trim();
            if (!line) return;

            const chatMatch = line.match(/^\[\s*Chat\s*[:：]\s*(.*?)\s*\]/i);
            if (chatMatch) {
                currentChat = chatMatch[1].replace(']', '').trim();
                if (!existingChats[currentChat]) {
                    existingChats[currentChat] = { messages: [], lastTime: '', unread: true, pushedCount: 0, renderedCount: 0 };
                }
                return;
            }

            if (!existingChats[currentChat]) existingChats[currentChat] = { messages: [], lastTime: '', unread: true, pushedCount: 0, renderedCount: 0 };

            if (line.match(/^\[\s*Time\s*\]/i)) {
                let timeStr = line.replace(/^\[\s*Time\s*\]/i, '').trim();
                if(timeStr) {
                    existingChats[currentChat].lastTime = timeStr;
                    existingChats[currentChat].messages.push({ type: 'time', content: timeStr, isMe: false });
                }
                return;
            }

            const nameMatch = line.match(/^\[(.*?)(?:[:：])?\]/); 
            if (nameMatch) {
                const tag = nameMatch[1];
                let isMe = false;
                if (!tag.match(/^(语音|Voice|图片|Img|红包|RedPacket|表情包|Sticker|转账|Transfer|位置|Location)$/i)) {
                    isMe = !!tag.match(/^(You|Me|我|Self)$/i);
                    let content = line.replace(/^\[.*?\]/, '').trim();
                    if (content) addMsg(existingChats, currentChat, isMe, content);
                    return; 
                }
            }
            addMsg(existingChats, currentChat, false, line);
        });
    }

    function addMsg(chats, chatName, isMe, content) {
        if (content.match(/^\[\s*(图片|Img|语音|Voice|红包|RedPacket)/i) && !content.includes(']')) return;

        const splitRegex = /(\[[:：]?\s*(?:图片|Img|语音|Voice|红包|RedPacket|表情包|Sticker|转账|Transfer|位置|Location).*?\])/gi;
        const parts = content.split(splitRegex);

        parts.forEach(part => {
            const trimmed = part.trim();
            if(!trimmed) return;

            let preview = trimmed;
            if (trimmed.match(/\[\s*(图片|Img)/i)) preview = '[圖片]';
            else if (trimmed.match(/\[\s*(语音|Voice)/i)) preview = '[語音]';
            else if (trimmed.match(/\[\s*(红包|RedPacket)/i)) preview = '[紅包]';
            else if (trimmed.match(/\[\s*(转账|Transfer)/i)) preview = '[轉帳]';
            else if (trimmed.match(/\[\s*(位置|Location)/i)) preview = '[位置]';
            
            chats[chatName].lastPreview = preview;
            chats[chatName].messages.push({ type: 'msg', isMe: isMe, content: trimmed });
        });
    }

    // 4. 隊列消費者
    setInterval(() => {
        if (RENDER_QUEUE.length > 0) {
            const nextItem = RENDER_QUEUE.shift(); 
            const roomContainer = doc.querySelector('#wxRoomContent');
            const roomPage = doc.querySelector('.wx-page-room');
            
            if (nextItem.chatName === GLOBAL_ACTIVE_CHAT && roomContainer) {
                const currentChat = GLOBAL_CHATS[GLOBAL_ACTIVE_CHAT];
                if (currentChat && nextItem.index >= currentChat.renderedCount) {
                    const d = doc.createElement('div');
                    d.innerHTML = window.WX_VIEW.renderBubble(nextItem.msg, nextItem.chatName, true); 
                    roomContainer.appendChild(d.firstChild);
                    if (roomPage) roomPage.scrollTop = roomPage.scrollHeight;
                    currentChat.renderedCount++; 
                }
            }
        }
    }, 800);

    // 5. 掃描循環
    function updateShellUI(shell) {
        const listContainer = shell.querySelector('.wx-page-list > div');
        const roomContainer = shell.querySelector('#wxRoomContent');
        
        if (listContainer) {
            listContainer.innerHTML = window.WX_VIEW.getListHTML(GLOBAL_CHATS, GLOBAL_ACTIVE_CHAT);
        }

        for (let chatName in GLOBAL_CHATS) {
            const chat = GLOBAL_CHATS[chatName];
            const targetCount = chat.messages.length;
            
            if (targetCount > chat.pushedCount) {
                for (let i = chat.pushedCount; i < targetCount; i++) {
                    RENDER_QUEUE.push({
                        msg: chat.messages[i],
                        chatName: chatName,
                        index: i 
                    });
                }
                chat.pushedCount = targetCount; 
            } 
            
            if (chatName === GLOBAL_ACTIVE_CHAT && roomContainer) {
                const lastIdx = targetCount - 1;
                if (lastIdx >= 0 && lastIdx < chat.renderedCount) {
                   const lastBubble = roomContainer.lastElementChild;
                   const lastMsg = chat.messages[lastIdx];
                   if (lastBubble) {
                       const contentDiv = lastBubble.querySelector('.wx-bubble-content');
                       if (contentDiv) {
                           const tempDiv = doc.createElement('div');
                           tempDiv.innerHTML = window.WX_VIEW.renderBubble(lastMsg, chatName, false);
                           const newContent = tempDiv.querySelector('.wx-bubble-content').innerHTML;
                           if (contentDiv.innerHTML !== newContent) {
                               contentDiv.innerHTML = newContent;
                           }
                       }
                   }
                }
            }
        }
    }

    function scanAndRender() {
        const blocks = Array.from(doc.querySelectorAll('.mes_text'));
        if (blocks.length === 0) return;

        let masterBlock = null;
        let masterIndex = -1;

        for (let i = blocks.length - 1; i >= 0; i--) {
            const rawText = blocks[i].textContent; 
            if (rawText.match(/\[\s*WECHAT\s*\]/i)) {
                masterBlock = blocks[i];
                masterIndex = i;
                break;
            }
        }

        if (!masterBlock) return;
        if (masterBlock.classList.contains('wx-hidden-source')) masterBlock.classList.remove('wx-hidden-source');
        
        const newChats = {};
        let combinedContent = "";

        for (let i = masterIndex; i < blocks.length; i++) {
            const block = blocks[i];
            const currentHTML = block.innerHTML;
            const currentText = block.textContent;
            
            const lastLen = parseInt(block.getAttribute('data-wx-len') || '0');
            const currentLen = currentText.length;
            let stableCount = parseInt(block.getAttribute('data-wx-stable') || '0');

            if (currentLen !== lastLen) {
                block.setAttribute('data-wx-len', String(currentLen));
                block.setAttribute('data-wx-stable', '0');
            } else {
                stableCount++;
                block.setAttribute('data-wx-stable', String(stableCount));
            }

            const isStable = currentText.includes('[/wx_os]') && (stableCount > 2);

            const regex = /\[wx_os\]([\s\S]*?)(?:\[\/wx_os\]|$)/gi;
            const matches = currentText.match(regex);
            
            if (matches) {
                matches.forEach(m => {
                    let clean = m.replace(/\[wx_os\]/i, '').replace(/\[\/wx_os\]/i, '');
                    combinedContent += clean + "\n";
                });

                if (i >= masterIndex && isStable && !currentHTML.includes('wx-source-details')) {
                     block.innerHTML = block.innerHTML.replace(
                        /(\[wx_os\][\s\S]*?(?:\[\/wx_os\]|$))/gi, 
                        '<details class="wx-source-details"><summary>🛠️ 微信源代碼 (點擊展開)</summary><div class="wx-code-content">$1</div></details>'
                    );
                }
            }
        }

        combinedContent = combinedContent.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<br\s*\/?>/gi, '\n');
        
        parseChunk(combinedContent, newChats);

        for (let name in newChats) {
            if (GLOBAL_CHATS[name]) {
                if (GLOBAL_CHATS[name].hasPlayed) newChats[name].hasPlayed = true;
                if (!GLOBAL_CHATS[name].unread) newChats[name].unread = false;
                newChats[name].pushedCount = GLOBAL_CHATS[name].pushedCount || 0;
                newChats[name].renderedCount = GLOBAL_CHATS[name].renderedCount || 0;
            }
        }
        GLOBAL_CHATS = newChats;

        const currentHash = Object.keys(GLOBAL_CHATS).length + (GLOBAL_ACTIVE_CHAT || 'list') + combinedContent.length;
        const shell = masterBlock.querySelector('.wx-shell');
        
        if (!shell) {
            const shellContainer = doc.createElement('div');
            shellContainer.innerHTML = window.WX_VIEW.renderShell(GLOBAL_ACTIVE_CHAT, GLOBAL_CHATS);
            masterBlock.appendChild(shellContainer.firstElementChild);
            masterBlock.setAttribute('data-wx-hash', String(currentHash));
        } else {
            updateShellUI(shell);
            masterBlock.setAttribute('data-wx-hash', String(currentHash));
        }
    }

    // 6. 全局交互 API (Action & Modal Logic)
    window.top.wxTriggerChat = async function(name) {
        GLOBAL_ACTIVE_CHAT = name;
        const shell = doc.querySelector('.wx-shell');
        if (!shell) return;
        
        if (name && GLOBAL_CHATS[name]) {
             const msgs = GLOBAL_CHATS[name].messages;
             const roomContainer = shell.querySelector('#wxRoomContent');
             if(roomContainer) {
                 roomContainer.innerHTML = msgs.map(msg => window.WX_VIEW.renderBubble(msg, name, false)).join('');
             }
             GLOBAL_CHATS[name].renderedCount = msgs.length;
             RENDER_QUEUE = [];
        }
        updateShellUI(shell);
        const room = shell.querySelector('.wx-page-room');
        const list = shell.querySelector('.wx-page-list');
        const footer = shell.querySelector('.wx-footer-wrapper');
        const back = shell.querySelector('.wx-back-btn');
        const title = shell.querySelector('.wx-header-title');
        
        if (name === null) {
            if(room) room.classList.remove('active');
            if(list) list.style.transform = 'translateX(0)';
            if(footer) footer.style.display = 'none';
            if(back) back.classList.remove('show');
            if(title) title.innerText = '微信';
        } else {
            if(room) room.classList.add('active');
            if(list) list.style.transform = 'translateX(-30%)';
            if(footer) footer.style.display = 'flex';
            if(back) back.classList.add('show');
            if(title) title.innerText = name;
            setTimeout(() => { if(room) room.scrollTop = room.scrollHeight; }, 100);
        }
    };

    window.top.wxToggleVoice = function(el, txt) {
        const box = el.querySelector('.wx-trans-box');
        if(box.style.display==='block') { box.style.display='none'; }
        else { 
            box.style.display='block'; 
            box.innerText = '';
            const t = decodeURIComponent(txt);
            let i=0; 
            const timer = setInterval(()=>{
                box.innerText += t.charAt(i); i++;
                if(i>=t.length) clearInterval(timer);
            }, 30);
        }
    };

    window.top.wxBigImg = function(src) { window.open(src, '_blank'); };
    window.top.wxCheckInput = function(el) {
        const btn = el.parentElement.querySelector('.wx-send-btn');
        const plus = el.parentElement.querySelector('.wx-icon-btn:nth-child(4)'); 
        if (el.value.trim()) { btn.classList.add('show'); plus.style.display = 'none'; } 
        else { btn.classList.remove('show'); plus.style.display = 'block'; }
    };
    window.top.wxTogglePanel = function() {
        const panel = doc.querySelector('.wx-action-panel');
        const room = doc.querySelector('.wx-page-room');
        if (panel) {
            panel.classList.toggle('open');
            if(panel.classList.contains('open') && room) { room.style.paddingBottom = '290px'; } 
            else if (room) { room.style.paddingBottom = '70px'; }
            if(room) setTimeout(()=> room.scrollTop = room.scrollHeight, 300);
        }
    };

    // --- 新增：動作處理邏輯 ---
    window.top.wxAction = function(type) {
        PENDING_ACTION_TYPE = type;
        const modal = doc.querySelector('#wxActionModal');
        const title = doc.querySelector('#wxModalTitle');
        const input = doc.querySelector('#wxModalInput');
        if (!modal || !input) return;

        input.value = '';
        let hint = "請輸入...";
        switch(type) {
            case 'photo': hint = "請輸入圖片描述或網址"; break;
            case 'camera': hint = "請輸入拍攝內容描述"; break;
            case 'video': hint = "請輸入視訊通話備註"; break;
            case 'voice': hint = "請輸入語音通話備註"; break;
            case 'location': hint = "請輸入位置名稱"; break;
            case 'redpacket': hint = "請輸入紅包祝福語"; break;
            case 'transfer': hint = "請輸入轉帳金額"; break;
            case 'gift': hint = "請輸入禮物名稱"; break;
        }
        title.innerText = hint;
        input.placeholder = hint;
        
        modal.classList.add('show');
        input.focus();
        
        // 綁定 Enter 鍵
        input.onkeydown = (e) => { if(e.key === 'Enter') window.top.wxConfirmModal(); };
        
        // 收起面板
        window.top.wxTogglePanel();
    };

    window.top.wxCloseModal = function() {
        const modal = doc.querySelector('#wxActionModal');
        if(modal) modal.classList.remove('show');
        PENDING_ACTION_TYPE = null;
    };

    window.top.wxConfirmModal = function() {
        const input = doc.querySelector('#wxModalInput');
        const val = input.value.trim();
        if (!val) { window.top.wxCloseModal(); return; }

        let content = "";
        switch(PENDING_ACTION_TYPE) {
            case 'photo': content = `[圖片: ${val}]`; break;
            case 'camera': content = `[圖片: 拍攝 ${val}]`; break;
            case 'video': content = `[語音: 發起視訊通話 - ${val}]`; break;
            case 'voice': content = `[語音: 發起語音通話 - ${val}]`; break;
            case 'location': content = `[位置: ${val}]`; break;
            case 'redpacket': content = `[紅包: ${val}]`; break;
            case 'transfer': content = `[轉帳: ${val}]`; break;
            case 'gift': content = `[圖片: 禮物 ${val}]`; break;
        }

        if(content) window.top.wxSend(null, content);
        window.top.wxCloseModal();
    };

    window.top.wxInput = function(e, el) { if(e.key==='Enter') window.top.wxSend(el); };
    
    window.top.wxSend = async function(el, contentOverride = null) {
        let text = contentOverride;
        let inputEl = null;

        if (!text) {
            const footer = doc.querySelector('.wx-footer-wrapper');
            if(footer) inputEl = footer.querySelector('.wx-input-real');
            if(inputEl) text = inputEl.value.trim();
        }
        if(!text) return;
        const name = GLOBAL_ACTIVE_CHAT;
        if (!name) return;
        if (!GLOBAL_CHATS[name]) { GLOBAL_CHATS[name] = { messages: [], lastTime: '', unread: false, hasPlayed: true, pushedCount:0, renderedCount:0 }; }
        
        // 立即顯示我方消息
        GLOBAL_CHATS[name].messages.push({type:'msg', isMe:true, content:text});
        
        const roomContent = doc.querySelector('#wxRoomContent');
        if(roomContent) {
            const d = doc.createElement('div');
            d.innerHTML = window.WX_VIEW.renderBubble({type:'msg', isMe:true, content:text}, name, true);
            roomContent.appendChild(d);
            doc.querySelector('.wx-page-room').scrollTop = 9999;
            GLOBAL_CHATS[name].pushedCount++;
            GLOBAL_CHATS[name].renderedCount++;
        }
        if(inputEl) { inputEl.value=''; window.top.wxCheckInput(inputEl); }

        // 發送給 AI
        if(window.TavernHelper) {
            await window.TavernHelper.createChatMessages([{role:'user', message:`\n[wx_os]\n[Chat: ${name}]\n[You] ${text}\n[/wx_os]`}]);
            await new Promise(r => setTimeout(r, 600));
            const sendBtn = doc.querySelector('#send_but');
            if (sendBtn) { sendBtn.click(); } else { window.TavernHelper.generate({}); }
        }
    };

    setInterval(scanAndRender, 300);

})();