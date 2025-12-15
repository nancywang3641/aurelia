// ----------------------------------------------------------------
// [檔案 3] wx_core.js
// 模塊：核心邏輯 (Controller/Core)
// 職責：整合 Theme 與 View，執行掃描、解析、隊列管理與 DOM 操作。
// ----------------------------------------------------------------

(async function () {
    console.log('[WeChat] Core V71.8 (Modular) Loaded');

    const ctx = (window.parent && window.parent.document) ? window.parent : window;
    const doc = ctx.document;

    // 1. 依賴檢查與樣式注入
    if (window.WX_THEME) {
        window.WX_THEME.inject(doc);
    } else {
        console.error('錯誤：未檢測到 wx_theme.js，請確保先加載樣式模塊。');
    }

    if (!window.WX_VIEW) {
        console.error('錯誤：未檢測到 wx_view.js，請確保先加載視圖模塊。');
        return;
    }

    // ----------------------------------------------------------------
    // 2. 狀態管理
    // ----------------------------------------------------------------
    let GLOBAL_CHATS = {}; 
    let GLOBAL_ACTIVE_CHAT = null;
    let RENDER_QUEUE = []; 

    // ----------------------------------------------------------------
    // 3. 核心解析器 (Parser)
    // ----------------------------------------------------------------
    function parseChunk(cleanText, existingChats) {
        const lines = cleanText.split('\n');
        let currentChat = "未分類";

        lines.forEach(line => {
            line = line.trim();
            if (!line) return;

            // [Chat: XXX]
            const chatMatch = line.match(/^\[\s*Chat\s*[:：]\s*(.*?)\s*\]/i);
            if (chatMatch) {
                currentChat = chatMatch[1].replace(']', '').trim();
                if (!existingChats[currentChat]) {
                    existingChats[currentChat] = { messages: [], lastTime: '', unread: true, pushedCount: 0, renderedCount: 0 };
                }
                return;
            }

            if (!existingChats[currentChat]) existingChats[currentChat] = { messages: [], lastTime: '', unread: true, pushedCount: 0, renderedCount: 0 };

            // [Time]
            if (line.match(/^\[\s*Time\s*\]/i)) {
                let timeStr = line.replace(/^\[\s*Time\s*\]/i, '').trim();
                if(timeStr) {
                    existingChats[currentChat].lastTime = timeStr;
                    existingChats[currentChat].messages.push({ type: 'time', content: timeStr, isMe: false });
                }
                return;
            }

            // [Name] & Content
            const nameMatch = line.match(/^\[(.*?)(?:[:：])?\]/); 
            if (nameMatch) {
                const tag = nameMatch[1];
                let isMe = false;
                if (!tag.match(/^(语音|Voice|图片|Img|红包|RedPacket|表情包|Sticker)$/i)) {
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
        // 過濾未完成標籤
        if (content.match(/^\[\s*(图片|圖片|Img|语音|語音|Voice|红包|RedPacket)/i) && !content.includes(']')) return;

        const splitRegex = /(\[[:：]?\s*(?:图片|圖片|Img|语音|語音|Voice|红包|RedPacket|表情包|Sticker).*?\])/gi;
        const parts = content.split(splitRegex);

        parts.forEach(part => {
            const trimmed = part.trim();
            if(!trimmed) return;

            let preview = trimmed;
            if (trimmed.match(/\[\s*(图片|圖片|Img)/i)) preview = '[圖片]';
            else if (trimmed.match(/\[\s*(语音|語音|Voice)/i)) preview = '[語音]';
            else if (trimmed.match(/\[\s*(红包|RedPacket)/i)) preview = '[紅包]';
            
            chats[chatName].lastPreview = preview;
            chats[chatName].messages.push({ type: 'msg', isMe: isMe, content: trimmed });
        });
    }

    // ----------------------------------------------------------------
    // 4. 隊列消費者 (Consumer) - 負責彈出動畫
    // ----------------------------------------------------------------
    setInterval(() => {
        if (RENDER_QUEUE.length > 0) {
            const nextItem = RENDER_QUEUE.shift(); 
            const roomContainer = doc.querySelector('#wxRoomContent');
            const roomPage = doc.querySelector('.wx-page-room');
            
            if (nextItem.chatName === GLOBAL_ACTIVE_CHAT && roomContainer) {
                const currentChat = GLOBAL_CHATS[GLOBAL_ACTIVE_CHAT];
                if (currentChat && nextItem.index >= currentChat.renderedCount) {
                    const d = doc.createElement('div');
                    // 調用 View 模塊生成 HTML
                    d.innerHTML = window.WX_VIEW.renderBubble(nextItem.msg, nextItem.chatName, true); 
                    roomContainer.appendChild(d.firstChild);
                    if (roomPage) roomPage.scrollTop = roomPage.scrollHeight;
                    currentChat.renderedCount++; 
                }
            }
        }
    }, 800);

    // ----------------------------------------------------------------
    // 5. 掃描與更新循環 (Main Loop)
    // ----------------------------------------------------------------
    function updateShellUI(shell) {
        const listContainer = shell.querySelector('.wx-page-list > div');
        const roomContainer = shell.querySelector('#wxRoomContent');
        
        // 更新列表 (調用 View)
        if (listContainer) {
            listContainer.innerHTML = window.WX_VIEW.getListHTML(GLOBAL_CHATS, GLOBAL_ACTIVE_CHAT);
        }

        // 推送隊列 (Producer)
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
            
            // 即時更新最後一條內容 (防閃爍)
            if (chatName === GLOBAL_ACTIVE_CHAT && roomContainer) {
                const lastIdx = targetCount - 1;
                if (lastIdx >= 0 && lastIdx < chat.renderedCount) {
                   const lastBubble = roomContainer.lastElementChild;
                   const lastMsg = chat.messages[lastIdx];
                   if (lastBubble) {
                       const contentDiv = lastBubble.querySelector('.wx-bubble-content');
                       if (contentDiv) {
                           const tempDiv = doc.createElement('div');
                           // 調用 View
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

        // DOM 操作與摺疊邏輯 (Stability Lock)
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

            const isFinished = currentText.includes('[/wx_os]');
            const isStable = isFinished && (stableCount > 2);

            const regex = /\[wx_os\]([\s\S]*?)(?:\[\/wx_os\]|$)/gi;
            const matches = currentText.match(regex);
            
            if (matches) {
                matches.forEach(m => {
                    let clean = m.replace(/\[wx_os\]/i, '').replace(/\[\/wx_os\]/i, '');
                    combinedContent += clean + "\n";
                });

                // 摺疊操作
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

        // 狀態繼承 (Persistence)
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
            // 調用 View 生成初始殼
            shellContainer.innerHTML = window.WX_VIEW.renderShell(GLOBAL_ACTIVE_CHAT, GLOBAL_CHATS);
            masterBlock.appendChild(shellContainer.firstElementChild);
            masterBlock.setAttribute('data-wx-hash', String(currentHash));
        } else {
            updateShellUI(shell);
            masterBlock.setAttribute('data-wx-hash', String(currentHash));
        }
    }

    // ----------------------------------------------------------------
    // 6. 全局 API 接口 (交互功能)
    // ----------------------------------------------------------------
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
        const panel = shell.querySelector('.wx-action-panel');
        if (panel) panel.classList.remove('open');
        room.style.paddingBottom = '70px'; 

        if (name === null) {
            room.classList.remove('active');
            list.style.transform = 'translateX(0)';
            footer.style.display = 'none';
            back.classList.remove('show');
            title.innerText = '微信';
        } else {
            room.classList.add('active');
            list.style.transform = 'translateX(-30%)';
            footer.style.display = 'flex';
            back.classList.add('show');
            title.innerText = name;
            if(room) room.scrollTop = room.scrollHeight;
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
            if(panel.classList.contains('open')) { room.style.paddingBottom = '290px'; } else { room.style.paddingBottom = '70px'; }
            if(room) setTimeout(()=> room.scrollTop = room.scrollHeight, 300);
        }
    };

    window.top.wxAction = function(type) {
        let content = "";
        switch(type) {
            case 'photo': content = "[圖片: 照片]"; break;
            case 'camera': content = "[圖片: 拍攝照片]"; break;
            case 'video': content = "[語音: 發起視訊通話]"; break;
            case 'voice': content = "[語音: 發起語音通話]"; break;
            case 'location': content = "[位置: 我的位置]"; break;
            case 'redpacket': content = "[紅包: 恭喜發財]"; break;
            case 'transfer': content = "[轉帳: 100元]"; break;
            case 'gift': content = "[圖片: 禮物]"; break;
        }
        if(content) window.top.wxSend(null, content);
        window.top.wxTogglePanel();
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

        if(window.TavernHelper) {
            await window.TavernHelper.createChatMessages([{role:'user', message:`\n[wx_os]\n[Chat: ${name}]\n[You] ${text}\n[/wx_os]`}]);
            await new Promise(r => setTimeout(r, 600));
            const sendBtn = doc.querySelector('#send_but');
            if (sendBtn) { sendBtn.click(); } else { window.TavernHelper.generate({}); }
        }
    };

    setInterval(scanAndRender, 300);

})();