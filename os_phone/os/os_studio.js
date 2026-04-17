// ----------------------------------------------------------------
// [檔案] os_studio.js (通用靈感創作室 Studio - V2.2 獨立專案頻道版)
// 職責：提供通用的聊天與預覽介面。
// 新增：每個 Worldbook Category 擁有獨立的 Chat Session (聊天紀錄切換)
// ----------------------------------------------------------------
(function() {
    const win = window.parent || window;
    console.log('[PhoneOS] 啟動通用靈感創作室 (Creator Studio V2.2)...');

    const studioStyle = `
        .studio-container { width: 100%; height: 100%; background: #1a0d0a; color: #FFF8E7; display: flex; font-family: 'Noto Sans TC', sans-serif; position: relative; z-index: 9999; }
        .studio-left { flex: 1; display: flex; flex-direction: column; border-right: 1px solid rgba(251,223,162,0.3); background: rgba(0,0,0,0.2); min-width: 300px; }
        .studio-right { flex: 1.2; display: flex; flex-direction: column; background: #110805; min-width: 300px; position: relative; }
        
        .studio-header { padding: calc(15px + var(--safe-top, env(safe-area-inset-top, 0px))) 20px 15px; background: rgba(69,34,22,0.9); border-bottom: 1px solid rgba(251,223,162,0.3); display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; box-sizing: border-box; }
        .studio-title { font-size: 16px; font-weight: bold; color: #FBDFA2; display: flex; align-items: center; gap: 10px; }
        .studio-channel-badge { font-size: 11px; background: rgba(46,204,113,0.15); border: 1px solid #2ecc71; color: #2ecc71; padding: 2px 8px; border-radius: 12px; margin-left: 8px; font-weight: normal; }
        .studio-mode-select { background: rgba(0,0,0,0.5); border: 1px solid #FBDFA2; color: #FBDFA2; padding: 6px 12px; border-radius: 6px; font-size: 13px; outline: none; cursor: pointer; }
        
        .studio-icon-btn { background: rgba(251,223,162,0.1); border: 1px solid rgba(251,223,162,0.4); color: #FBDFA2; border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 12px; transition: 0.2s; display: flex; align-items: center; gap: 5px; }
        .studio-icon-btn:hover { background: rgba(251,223,162,0.2); border-color: #FBDFA2; }
        .studio-icon-btn.danger { color: #fc8181; border-color: #fc8181; background: rgba(252,129,129,0.1); }
        .studio-icon-btn.danger:hover { background: rgba(252,129,129,0.2); }

        .studio-chat-history { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 15px; }
        .studio-bubble { max-width: 85%; padding: 12px 16px; border-radius: 12px; font-size: 13px; line-height: 1.5; word-wrap: break-word; white-space: pre-wrap; position: relative; }
        .studio-bubble.user { align-self: flex-end; background: rgba(183,132,86,0.3); border: 1px solid rgba(251,223,162,0.4); color: #FBDFA2; border-bottom-right-radius: 2px; }
        .studio-bubble.ai { align-self: flex-start; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #FFF8E7; border-bottom-left-radius: 2px; }
        
        .studio-input-area { padding: 15px; background: rgba(69,34,22,0.9); border-top: 1px solid rgba(251,223,162,0.3); display: flex; gap: 10px; flex-shrink: 0; }
        .studio-textarea { flex: 1; background: rgba(0,0,0,0.5); border: 1px solid rgba(251,223,162,0.4); color: #FFF; padding: 10px 14px; border-radius: 8px; font-size: 13px; outline: none; resize: none; height: 50px; font-family: inherit; }
        .studio-textarea:focus { border-color: #FBDFA2; }
        .studio-send-btn { background: #FBDFA2; color: #452216; border: none; padding: 0 20px; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 13px; transition: 0.2s; }
        .studio-send-btn:hover { filter: brightness(1.1); box-shadow: 0 0 10px rgba(251,223,162,0.5); }
        .studio-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .studio-right-header { display: flex; background: rgba(69,34,22,0.9); border-bottom: 1px solid rgba(251,223,162,0.3); flex-shrink: 0; }
        .studio-tab { flex: 1; text-align: center; padding: 15px 0; font-size: 13px; color: #B78456; cursor: pointer; font-weight: bold; transition: 0.3s; position: relative; }
        .studio-tab.active { color: #FBDFA2; }
        .studio-tab.active::after { content: ''; position: absolute; bottom: 0; left: 0; width: 100%; height: 3px; background: #FBDFA2; }
        
        /* Canvas 檔案庫專用 CSS */
        .studio-preview-content { flex: 1; overflow: hidden; display: flex; flex-direction: row; position: relative; }
        .studio-wb-sidebar { width: 220px; background: rgba(0,0,0,0.3); border-right: 1px solid rgba(251,223,162,0.2); overflow-y: auto; padding: 15px 10px; display: none; flex-direction: column; }
        .studio-preview-main { flex: 1; overflow-y: auto; padding: 20px; position: relative; }
        
        .tree-project { color: #FBDFA2; font-weight: bold; font-size: 13px; margin-bottom: 5px; cursor: pointer; padding: 8px; border-radius: 6px; background: rgba(251,223,162,0.1); transition: 0.2s; }
        .tree-project:hover { background: rgba(251,223,162,0.2); }
        .tree-folder { color: #B78456; font-size: 12px; margin-top: 8px; margin-left: 10px; padding-bottom: 2px; border-bottom: 1px solid rgba(183,132,86,0.3); }
        .tree-item { color: rgba(255,248,231,0.7); font-size: 12px; padding: 6px 10px 6px 20px; cursor: pointer; border-radius: 4px; display: flex; align-items: center; gap: 6px; }
        .tree-item:hover { background: rgba(255,255,255,0.05); color: #FFF; }
        .tree-item.active { background: rgba(251,223,162,0.15); color: #FBDFA2; border-left: 2px solid #FBDFA2; }

        .studio-source-content { flex: 1; overflow-y: auto; padding: 20px; background: #000; color: #00ffcc; font-family: monospace; font-size: 12px; white-space: pre-wrap; word-break: break-all; display: none; }
        
        .studio-action-area { padding: 15px; background: rgba(69,34,22,0.9); border-top: 1px solid rgba(251,223,162,0.3); flex-shrink: 0; display: flex; justify-content: flex-end; }
        .studio-export-btn { background: #2ecc71; color: white; border: 1px solid #27ae60; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 13px; transition: 0.2s; display: none; }
        .studio-export-btn:hover { background: #27ae60; box-shadow: 0 0 10px rgba(46,204,113,0.5); }

        .studio-card { background: rgba(255,255,255,0.05); border: 1px solid rgba(251,223,162,0.3); border-radius: 8px; padding: 16px; margin-bottom: 15px; }
        .studio-card-title { font-size: 15px; font-weight: bold; color: #FBDFA2; margin-bottom: 10px; border-bottom: 1px solid rgba(251,223,162,0.2); padding-bottom: 8px; }
        .studio-empty { text-align: center; color: rgba(251,223,162,0.4); padding: 50px 20px; font-size: 13px; letter-spacing: 1px; }
        
        @media (max-width: 768px) {
            .studio-container { flex-direction: column; }
            .studio-left { border-right: none; border-bottom: 1px solid rgba(251,223,162,0.3); flex: 1; min-height: 55%; }
            .studio-right { flex: 1; min-height: 45%; }
            .studio-wb-sidebar { width: 140px; }
        }
    `;

    const studioHTML = `
        <div class="studio-container">
            <div class="studio-left">
                <div class="studio-header">
                    <div class="studio-title" style="flex-wrap: wrap;">
                        🎨 靈感創作室
                        <select id="studio-mode-select" class="studio-mode-select">
                            <option value="vn_ui">✨ VN UI 煉丹</option>
                            <option value="worldbook">📖 世界書編撰 (Canvas)</option>
                            <option value="var_pack">🎲 變數包設計</option>
                        </select>
                        <span id="studio-channel-badge" class="studio-channel-badge" style="display:none;"></span>
                    </div>
                    <div style="display:flex; gap:8px;">
                        <button class="studio-icon-btn danger" id="studio-clear-btn" title="清空當前頻道的對話紀錄">🗑️ 清空對話</button>
                        <button class="studio-icon-btn" id="studio-close-btn" title="關閉">✖</button>
                    </div>
                </div>
                <div class="studio-chat-history" id="studio-chat-history"></div>
                <div class="studio-input-area">
                    <textarea class="studio-textarea" id="studio-input" placeholder="告訴 AI 你的點子... (Shift+Enter 換行, Enter 發送)"></textarea>
                    <button class="studio-send-btn" id="studio-send-btn">發送</button>
                </div>
            </div>

            <div class="studio-right">
                <div class="studio-right-header">
                    <div class="studio-tab active" data-tab="preview">👁️ 即時預覽 / 畫布</div>
                    <div class="studio-tab" data-tab="source">💻 JSON 原始碼</div>
                </div>
                
                <div class="studio-preview-content" id="studio-preview-content">
                    <div id="studio-wb-sidebar" class="studio-wb-sidebar">
                        <div style="font-size:11px; color:rgba(251,223,162,0.6); margin-bottom:10px; border-bottom:1px solid rgba(183,132,86,0.3); padding-bottom:5px;">📂 專案庫與草稿</div>
                        <div id="studio-tree-container"></div>
                    </div>
                    <div id="studio-preview-main" class="studio-preview-main">
                        <div class="studio-empty">尚未生成任何內容。<br><br>請在左側輸入您的點子，讓 AI 為您創作。</div>
                    </div>
                </div>

                <div class="studio-source-content" id="studio-source-content"></div>
                <div class="studio-action-area">
                    <button class="studio-export-btn" id="studio-export-btn">💾 儲存設定 (未來可於書架勾選)</button>
                </div>
            </div>
        </div>
    `;

    // --- 全域 Canvas 狀態 ---
    let activeCategory = null;  // 當前選中的專案名稱 (對應 Chat Channel ID)
    let activePreviewData = null; 

    const MODES = {
        'vn_ui': {
            name: 'VN UI 煉丹',
            prompt: `你是一個 VN 視覺小說引擎的「頂級 UI/UX 設計師與提示詞工程師」。請採取【漸進式討論】與用戶共同創作。
前期請純聊天、提問與引導，絕對不要輸出 <json> 區塊。
【只有在】確認結構後，才在最後輸出一段被 <json> 標籤包裹的純 JSON。
格式: {"tagId": "xxx", "isBlock": true, "html": "...", "css": "...", "js": "...", "demoFormat": "..."}`,
            onSave: async (data) => {
                if(!data.tagId || !data.html) throw new Error("缺少 tagId 或 html");
                if (win.OS_DB && win.OS_DB.saveVNTagTemplate) {
                    await win.OS_DB.saveVNTagTemplate(data);
                    alert(`🎉 [${data.tagId}] 已成功儲存至 VN UI 展廳！`);
                }
            }
        },
        'worldbook': {
            name: '世界書編撰',
            prompt: `你是一個「世界觀架構師」。我們現在採用【樹狀專案目錄】結構來管理世界觀草稿。
請採取【漸進式討論】的方式與用戶共同創作。

【互動規則】
1. 前期對話請保持純文字交流，引導用戶豐富設定。絕對不要輸出 <json>。
2. 當需要建立檔案時（例如寫下背景、或建立新角色），才在最後輸出被 <json> 和 </json> 包裹的 JSON。
3. 如果用戶要求一次建立多個角色或規則，請輸出【陣列格式】： \`[ {物件1}, {物件2} ]\`。

【JSON 格式規範】(很重要，每個物件必須包含以下欄位)
- "category": 專案分類名稱 (非常重要！這是未來在書架上建書時對應的書名，例如 "深海人魚帝國")
- "type": 檔案分類 (嚴格限制填寫: "lore" 代表世界背景, "character" 代表角色群眾, "rule" 代表魔法或物理規則, "location" 代表地點)
- "title": 此條目的名稱 (如 "淵 (深海守衛)")
- "keys": 觸發關鍵字，以逗號分隔
- "content": 詳細的描述文本，請寫得豐富生動。`,
            onSave: async (data) => {
                let items = Array.isArray(data) ? data : [data];
                let savedCount = 0;
                for (let item of items) {
                    if(!item.title || !item.content) continue;
                    if (win.OS_DB && win.OS_DB.saveWorldbookEntry) {
                        await win.OS_DB.saveWorldbookEntry(item);
                        savedCount++;
                    }
                }
                if (savedCount > 0) {
                    alert(`🎉 成功儲存 ${savedCount} 筆條目至世界書專案！\n(請到「書架介面」點擊「撰寫新書」，展開「從世界書條目生成」將它們打包成一本書！)`);
                    refreshWorldbookSidebar();
                } else {
                    throw new Error("JSON 格式不符，缺少 title 或 content");
                }
            }
        },
        'var_pack': {
            name: '變數包設計',
            prompt: `你是 AVS (Aurelia Variable System) 的「動態變數架構師」。請採取漸進式討論。
前期請純聊天，只有在確認變數清單後，才輸出被 <json> 標籤包裹的純 JSON。
格式: {"id": "xxx", "name": "xxx", "vars": [{"key":"HP", "type":"number", "default": 100}]}`,
            onSave: async (data) => {
                if(!data.id || !data.name || !Array.isArray(data.vars)) throw new Error("格式錯誤");
                if (win.OS_DB && win.OS_DB.saveVarPack) {
                    await win.OS_DB.saveVarPack(data);
                    alert(`🎉 變數包 [${data.name}] 儲存成功！`);
                }
            }
        }
    };

    let currentMode = 'vn_ui';
    let chatMessages = [];
    let currentParsedData = null; 

    // 取得當前對話頻道的 Storage Key
    function getChatSessionId() {
        if (currentMode === 'worldbook' && activeCategory) {
            return `worldbook_${activeCategory}`;
        }
        return currentMode;
    }

    function launch() {
        const root = document.getElementById('aurelia-tab-container') || document.getElementById('aurelia-phone-screen') || document.body;
        let existing = document.getElementById('os_studio_app');
        if (existing) existing.remove();

        if (!document.getElementById('os_studio_style')) {
            const styleElement = document.createElement('style');
            styleElement.id = 'os_studio_style';
            styleElement.innerHTML = studioStyle;
            document.head.appendChild(styleElement);
        }

        const appDiv = document.createElement('div');
        appDiv.id = 'os_studio_app';
        appDiv.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; z-index:9000; background: #1a0d0a;';
        appDiv.innerHTML = studioHTML;
        root.appendChild(appDiv);

        bindEvents();
        loadMode(currentMode);
    }

    function bindEvents() {
        document.getElementById('studio-close-btn').onclick = () => document.getElementById('os_studio_app').remove();
        document.getElementById('studio-mode-select').onchange = (e) => loadMode(e.target.value);
        
        // 清空當前頻道的對話
        document.getElementById('studio-clear-btn').onclick = async () => {
            const channelName = (currentMode === 'worldbook' && activeCategory) ? activeCategory : '當前頻道';
            if (confirm(`確定要清空 [${channelName}] 的對話紀錄嗎？\n(注意：不會刪除右側已經儲存的設定資料)`)) {
                chatMessages = [{ role: 'system', content: MODES[currentMode].prompt }];
                currentParsedData = null;
                const chatId = getChatSessionId();
                if (win.OS_DB && win.OS_DB.clearStudioChat) {
                    await win.OS_DB.clearStudioChat(chatId);
                    await win.OS_DB.saveStudioChat(chatId, chatMessages); // 保存預設 System Prompt
                }
                renderChatHistory();
                renderPreviewPanel();
            }
        };

        const inputEl = document.getElementById('studio-input');
        const sendBtn = document.getElementById('studio-send-btn');
        sendBtn.onclick = handleSend;
        inputEl.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
        };

        const tabs = document.querySelectorAll('.studio-tab');
        tabs.forEach(tab => {
            tab.onclick = () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById('studio-preview-content').style.display = tab.dataset.tab === 'preview' ? 'flex' : 'none';
                document.getElementById('studio-source-content').style.display = tab.dataset.tab === 'source' ? 'block' : 'none';
            };
        });

        document.getElementById('studio-export-btn').onclick = async () => {
            if (!currentParsedData) return alert('沒有可儲存的有效資料！');
            try {
                await MODES[currentMode].onSave(currentParsedData);
            } catch (err) {
                alert('儲存失敗: ' + err.message);
            }
        };
    }

    // 核心切換機制：切換頻道/讀取歷史紀錄
    async function switchChatSession() {
        chatMessages = [];
        document.getElementById('studio-input').value = '';

        const badge = document.getElementById('studio-channel-badge');
        const chatId = getChatSessionId();

        if (currentMode === 'worldbook') {
            badge.style.display = 'inline-block';
            badge.textContent = activeCategory ? `📍 頻道: ${activeCategory}` : `✨ 頻道: 新草稿`;
        } else {
            badge.style.display = 'none';
        }

        if (win.OS_DB && win.OS_DB.getStudioChat) {
            try {
                const history = await win.OS_DB.getStudioChat(chatId);
                chatMessages = (history && history.length > 0) ? history : [{ role: 'system', content: MODES[currentMode].prompt }];
            } catch (e) {
                chatMessages = [{ role: 'system', content: MODES[currentMode].prompt }];
            }
        }
        
        renderChatHistory();
        extractLatestJsonFromHistory();
        renderPreviewPanel();
    }

    async function loadMode(modeId) {
        currentMode = modeId;
        activeCategory = null; // 每次切換模式，回到初始狀態
        currentParsedData = null;
        activePreviewData = null;

        const sidebar = document.getElementById('studio-wb-sidebar');
        if (modeId === 'worldbook') {
            sidebar.style.display = 'flex';
            refreshWorldbookSidebar();
        } else {
            sidebar.style.display = 'none';
        }

        await switchChatSession();
    }

    async function handleSend() {
        const inputEl = document.getElementById('studio-input');
        const text = inputEl.value.trim();
        if (!text) return;

        const sendBtn = document.getElementById('studio-send-btn');
        inputEl.value = '';
        inputEl.disabled = true;
        sendBtn.disabled = true;
        sendBtn.innerText = 'AI 思考中...';

        chatMessages.push({ role: 'user', content: text });
        renderChatHistory();

        const container = document.getElementById('studio-chat-history');
        const aiBubble = document.createElement('div');
        aiBubble.className = 'studio-bubble ai';
        container.appendChild(aiBubble);
        container.scrollTop = container.scrollHeight;

        try {
            const apiEngine = win.OS_API || window.OS_API;
            if (!apiEngine || !apiEngine.chat) throw new Error("找不到 API 引擎");

            let baseConfig = win.OS_SETTINGS?.getConfig?.() || JSON.parse(localStorage.getItem('os_global_config') || '{}');
            const pureConfig = { ...baseConfig, usePresetPrompts: false, enableThinking: false, temperature: 0.7 };

            let apiPayload = chatMessages.filter(m => m.content && m.content.trim());

            // 🔥 隱形注入魔法：載入專案上下文設定
            if (currentMode === 'worldbook' && activeCategory && win.OS_DB && win.OS_DB.getWorldbookEntriesByCategory) {
                try {
                    const worldData = await win.OS_DB.getWorldbookEntriesByCategory(activeCategory);
                    if (worldData.length > 0) {
                        let contextStr = `【系統隱藏提示：以下是當前專案 (${activeCategory}) 的既有設定，請以此為基礎擴充新內容，不要重寫或覆蓋現有設定。】\n`;
                        worldData.forEach(e => {
                            contextStr += `[${e.type === 'lore'?'背景':e.type==='character'?'角色':'其他'}] ${e.title}：\n${e.content}\n\n`;
                        });
                        apiPayload.unshift({ role: 'system', content: contextStr });
                    }
                } catch(e) { console.warn("Context Injection 失敗", e); }
            }

            await new Promise((resolve, reject) => {
                apiEngine.chat(apiPayload, pureConfig, 
                    (chunk) => {
                        const cleanChunk = chunk.replace(/<json>[\s\S]*?<\/json>/gi, '\n[✅ 系統已生成資料預覽，請查看右側面板]');
                        aiBubble.textContent = cleanChunk;
                        container.scrollTop = container.scrollHeight;
                    }, 
                    (finalText) => {
                        chatMessages.push({ role: 'assistant', content: finalText });
                        
                        // 解析 JSON 並判斷是否需要變更頻道
                        extractAndParseJson(finalText);
                        
                        // 寫入對應的 Session ID
                        const finalChatId = getChatSessionId();
                        if (win.OS_DB && win.OS_DB.saveStudioChat) {
                            win.OS_DB.saveStudioChat(finalChatId, chatMessages).catch(e=>e);
                        }
                        resolve();
                    }, 
                    reject, { disableTyping: false }
                );
            });

        } catch (err) {
            aiBubble.textContent = `❌ API 發生錯誤：${err.message}`;
            aiBubble.style.color = '#fc8181';
        } finally {
            inputEl.disabled = false;
            sendBtn.disabled = false;
            sendBtn.innerText = '發送';
            inputEl.focus();
        }
    }

    function renderChatHistory() {
        const container = document.getElementById('studio-chat-history');
        container.innerHTML = '';
        chatMessages.forEach(msg => {
            if (msg.role === 'system') return;
            const bubble = document.createElement('div');
            bubble.className = `studio-bubble ${msg.role === 'user' ? 'user' : 'ai'}`;
            let displayText = msg.content || '';
            if (msg.role === 'assistant') {
                displayText = displayText.replace(/<json>[\s\S]*?<\/json>/gi, '\n[✅ 系統已生成資料預覽，請查看右側面板]').trim();
            }
            bubble.textContent = displayText;
            container.appendChild(bubble);
        });
        container.scrollTop = container.scrollHeight;
    }

    function extractLatestJsonFromHistory() {
        for (let i = chatMessages.length - 1; i >= 0; i--) {
            if (chatMessages[i].role === 'assistant') {
                if (extractAndParseJson(chatMessages[i].content)) return;
            }
        }
    }

    function extractAndParseJson(text) {
        if (!text) return false;
        const xmlMatch = text.match(/<json>([\s\S]*?)<\/json>/i);
        if (xmlMatch) {
            try {
                let cleanStr = xmlMatch[1].trim().replace(/[\u0000-\u0009\u000B-\u001F]+/g, "");
                currentParsedData = JSON.parse(cleanStr);
                
                activePreviewData = Array.isArray(currentParsedData) ? currentParsedData[0] : currentParsedData;
                
                // 🔥 如果 AI 新生成的內容自帶了 Category，自動跳轉頻道！
                if (activePreviewData.category && currentMode === 'worldbook') {
                    if (activeCategory !== activePreviewData.category) {
                        activeCategory = activePreviewData.category;
                        document.getElementById('studio-channel-badge').textContent = `📍 頻道: ${activeCategory}`;
                        refreshWorldbookSidebar();
                    }
                }
                
                renderPreviewPanel();
                return true;
            } catch (e) {
                console.warn('[Studio] JSON 解析失敗', e);
                return false;
            }
        }
        return false;
    }

    async function refreshWorldbookSidebar() {
        const container = document.getElementById('studio-tree-container');
        if (!container || !win.OS_DB || !win.OS_DB.getAllWorldbookEntries) return;

        try {
            const allEntries = await win.OS_DB.getAllWorldbookEntries();
            container.innerHTML = '';

            // 🔥 頂部「新增專案」按鈕
            const newProjectBtn = document.createElement('div');
            newProjectBtn.className = 'tree-project';
            newProjectBtn.style.cssText = 'color: #2ecc71; border: 1px dashed rgba(46,204,113,0.5); background: rgba(46,204,113,0.1); text-align: center; margin-bottom: 15px; font-weight: normal;';
            newProjectBtn.innerHTML = `➕ 建立新專案草稿`;
            newProjectBtn.onclick = async () => {
                if (activeCategory === null) return; // 已經在新草稿頻道
                activeCategory = null;
                activePreviewData = null;
                currentParsedData = null;
                await switchChatSession();
                refreshWorldbookSidebar();
            };
            container.appendChild(newProjectBtn);

            const categories = {};
            allEntries.forEach(entry => {
                const cat = entry.category || '未分類草稿';
                if (!categories[cat]) categories[cat] = { types: {} };
                
                const t = entry.type || 'other';
                if (!categories[cat].types[t]) categories[cat].types[t] = [];
                categories[cat].types[t].push(entry);
            });

            const typeIcons = { 'lore': '📜 背景', 'character': '👥 角色', 'rule': '⚙️ 規則', 'location': '🗺️ 地點', 'other': '📄 其他' };

            Object.keys(categories).forEach(catName => {
                const catData = categories[catName];
                
                // 專案名稱 (頻道入口)
                const projDiv = document.createElement('div');
                projDiv.className = 'tree-project';
                projDiv.innerHTML = `📁 ${catName}`;
                if (catName === activeCategory) projDiv.style.border = "1px solid #FBDFA2";
                
                projDiv.onclick = async () => {
                    if (activeCategory === catName) return; // 已經在該頻道
                    activeCategory = catName;
                    activePreviewData = null; 
                    currentParsedData = null;
                    await switchChatSession();
                    refreshWorldbookSidebar();
                };
                container.appendChild(projDiv);

                Object.keys(catData.types).forEach(type => {
                    const folderDiv = document.createElement('div');
                    folderDiv.className = 'tree-folder';
                    folderDiv.innerText = typeIcons[type] || typeIcons['other'];
                    container.appendChild(folderDiv);

                    catData.types[type].forEach(file => {
                        const fileDiv = document.createElement('div');
                        fileDiv.className = 'tree-item';
                        if (activePreviewData && activePreviewData.title === file.title) fileDiv.classList.add('active');
                        fileDiv.innerText = `📄 ${file.title}`;
                        
                        fileDiv.onclick = async () => {
                            // 點擊檔案如果跨頻道，先切換頻道
                            if (activeCategory !== catName) {
                                activeCategory = catName;
                                await switchChatSession();
                            }
                            activePreviewData = file;
                            currentParsedData = null; 
                            renderPreviewPanel();
                            refreshWorldbookSidebar(); 
                        };
                        container.appendChild(fileDiv);
                    });
                });
                
                const spacer = document.createElement('div');
                spacer.style.height = '15px';
                container.appendChild(spacer);
            });

        } catch(e) { console.error("讀取目錄樹失敗", e); }
    }

    function renderPreviewPanel() {
        const previewMain = document.getElementById('studio-preview-main');
        const sourceEl = document.getElementById('studio-source-content');
        const exportBtn = document.getElementById('studio-export-btn');

        let displayData = currentParsedData || activePreviewData;

        if (!displayData) {
            previewMain.innerHTML = `<div class="studio-empty">請在左側選擇檔案，或輸入點子讓 AI 創作。</div>`;
            sourceEl.textContent = '';
            exportBtn.style.display = 'none';
            return;
        }

        const isUnsaved = !!currentParsedData;
        exportBtn.style.display = isUnsaved ? 'block' : 'none';
        
        sourceEl.textContent = JSON.stringify(displayData, null, 2);
        previewMain.innerHTML = '';

        if (currentMode === 'worldbook') {
            let items = Array.isArray(displayData) ? displayData : [displayData];
            
            let html = items.map(data => `
                <div class="studio-card">
                    <div style="font-size:11px; color:#B78456; margin-bottom:5px;">📁 分類：${data.category || '未指定'} | 類型：${data.type || '未指定'}</div>
                    <div class="studio-card-title">📖 ${data.title || '未命名條目'}</div>
                    <div style="font-size:12px; color:#B78456; margin-bottom:10px; font-weight:bold;">🔑 關鍵字：<span style="color:#FFF8E7;">${data.keys || '無'}</span></div>
                    <div style="font-size:13px; color:#FFF8E7; line-height:1.6; white-space:pre-wrap;">${data.content || '無內容'}</div>
                </div>
            `).join('');
            
            if (isUnsaved) {
                html = `<div style="padding:10px; background:rgba(46,204,113,0.1); border:1px solid #2ecc71; color:#2ecc71; font-size:12px; border-radius:6px; margin-bottom:15px; text-align:center;">✨ 這是 AI 新生成的草稿，點擊下方「儲存設定」即可加入左側專案庫！</div>` + html;
            }
            
            previewMain.innerHTML = html;
        }
        else if (currentMode === 'vn_ui') {
            const data = displayData;
            const safeFormat = (data.demoFormat || '無結構定義').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            previewMain.innerHTML = `
                <div class="studio-card">
                    <div class="studio-card-title">標籤 ID: [${data.tagId || '未命名'}]</div>
                    <div style="font-size:12px; color:rgba(251,223,162,0.6); margin-bottom:10px;">資料格式示範：<br><span style="font-family:monospace; color:#FFF;">${safeFormat}</span></div>
                    <div style="position:relative; width:100%; min-height:150px; background:#000; border:1px dashed #FBDFA2; border-radius:6px; overflow:hidden;">
                        <style>${data.css || ''}</style>
                        <div class="vn-dynamic-panel-${data.tagId}" style="position:relative; width:100%; height:100%; display:flex; flex-direction:column; justify-content:center;">
                            ${(data.html || '').replace(/\{\{1\}\}/g, '參數A').replace(/\{\{2\}\}/g, '參數B')}
                        </div>
                    </div>
                </div>
            `;
        } 
        else if (currentMode === 'var_pack') {
            const data = displayData;
            const varsHtml = (data.vars || []).map(v => `
                <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
                    <span style="color:#FBDFA2; font-weight:bold;">${v.key}</span>
                    <span style="color:#B78456; font-size:11px;">類型: ${v.type} | 預設: ${v.default}</span>
                </div>
            `).join('');

            previewMain.innerHTML = `
                <div class="studio-card">
                    <div class="studio-card-title">🎲 [${data.id || '未知ID'}] ${data.name || '未命名變數包'}</div>
                    <div style="font-size:13px; color:#FFF8E7;">${varsHtml}</div>
                </div>
            `;
        }
    }

    win.OS_STUDIO = { launch };
})();