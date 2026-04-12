// ----------------------------------------------------------------
// [檔案] idol_core.js (V5.2 - 星夢工廠 / 無登入頁面版 + 個人檔案編輯)
// 職責：公司註冊、綁定 ChatID、AI批次星探、選項式排課、組團定位系統、團隊趣事(融洽度)、歷史回溯、宿舍副模型聊天
// 新增：移除登入頁面，改為主頁面直接編輯公司與經理人名稱 (預設 星光娛樂)
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入造星工廠引擎 (Idol Hub V5.2 Advanced Context & Profile Edit)...');
    const win = window.parent || window;

    // === 1. 背景與資源 ===
    const BG_MAP = {
        office: 'https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=1000&auto=format&fit=crop',
        practice: 'https://images.unsplash.com/photo-1518834107812-67b0b7c58434?q=80&w=1000&auto=format&fit=crop',
        stage: 'https://images.unsplash.com/photo-1470229722913-7c090be5e526?q=80&w=1000&auto=format&fit=crop',
        dorm: 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?q=80&w=1000&auto=format&fit=crop'
    };
    const MANAGER_AVATAR = 'https://files.catbox.moe/es8qlf.png';

    // === 2. 系統狀態與存檔邏輯 ===
    let STATE = {
        view: 'OFFICE',
        companyName: '星光娛樂',
        managerName: '製作人',
        managerAvatar: MANAGER_AVATAR,
        funds: 1000000,
        roster: [],       // 所有旗下藝人 (包含練習生與已出道)
        groups: [],       // 已成立的團體 (包含融洽度與事件歷史)
        candidates: [],   // 星探候選人
        
        // 互動系統變數
        vnQueue: [],
        isTyping: false,
        currentVnMsg: null,
        typingTimer: null,
        chatHistory: [],  // 公司辦公室系統對話
        currentEventContext: '',
        currentChatTargetId: null // 宿舍聊天對象
    };

    let currentContainer = null;
    let isProcessing = false;

    function getChatId() {
        if (win.SillyTavern && win.SillyTavern.getContext) {
            const ctx = win.SillyTavern.getContext();
            if (ctx.chatId) return ctx.chatId;
        }
        return 'default_idol_session';
    }

    function getStorageKey() { return `os_idol_db_${getChatId()}`; }

    async function saveState() {
        const stateToSave = { ...STATE, vnQueue: [], isTyping: false, currentVnMsg: null, timestamp: Date.now() };
        localStorage.setItem(getStorageKey(), JSON.stringify(stateToSave));
        console.log(`[IDOL_CORE] 娛樂公司進度已儲存至 ${getChatId()}`);
    }

    async function loadState() {
        try {
            const saved = localStorage.getItem(getStorageKey());
            if (saved) {
                const parsed = JSON.parse(saved);
                Object.assign(STATE, parsed);
                // 確保舊存檔相容
                if(!STATE.roster && STATE.idols) { STATE.roster = STATE.idols; delete STATE.idols; }
                if(!STATE.groups) STATE.groups = [];
                if(!STATE.companyName) STATE.companyName = '星光娛樂';
                if(!STATE.managerName) STATE.managerName = '製作人';
                
                STATE.roster.forEach(r => {
                    if(!r.status) r.status = 'trainee'; // 預設為練習生
                    if(!r.chatHistory) r.chatHistory = [];
                    if(!r.groupRole) r.groupRole = ''; // 確保定位欄位存在
                });

                STATE.groups.forEach(g => {
                    if(typeof g.harmony !== 'number') g.harmony = 50; // 預設融洽度
                    if(!g.events) g.events = []; // 團隊歷史事件紀錄
                });

                return true;
            }
        } catch(e) { console.warn("Load Idol DB Error:", e); }
        return false;
    }

    // 將頭像同步至世界書共用素材庫
    async function saveAvatarToLorebook(name, url) {
        if (!win.TavernHelper) return;
        const charLbs = win.TavernHelper.getCharLorebooks ? win.TavernHelper.getCharLorebooks() : null;
        const lorebookName = charLbs && charLbs.primary ? charLbs.primary : null;
        if (!lorebookName) { console.warn('[IDOL] 找不到當前角色主世界書，跳過頭像同步。'); return; }
        const entryComment = '【素材-隨機頭像素材】';
        const appendText = `${name}:${url}`;
        try {
            const entries = await win.TavernHelper.getLorebookEntries(lorebookName);
            const targetEntry = entries ? entries.find(e => e.comment === entryComment) : null;
            if (targetEntry) {
                if (targetEntry.content && targetEntry.content.includes(`${name}:`)) return;
                const newContent = targetEntry.content ? (targetEntry.content + '\n' + appendText) : appendText;
                await win.TavernHelper.setLorebookEntries(lorebookName, [{ uid: targetEntry.uid, content: newContent }]);
            } else {
                await win.TavernHelper.createLorebookEntries(lorebookName, [{
                    comment: entryComment, content: appendText,
                    key: ['隨機頭像素材_KEY_DO_NOT_TRIGGER'], enabled: true
                }]);
            }
            console.log(`[IDOL] ✅ 頭像已同步至世界書：${name}`);
        } catch (e) { console.error('[IDOL] 同步頭像至世界書失敗', e); }
    }

    // === 3. API 核心呼叫與 JSON 解析 ===
    async function callApi(userMessage, sysPrompt = '', tempOverride = 0.8, useSecondary = false) {
        if (isProcessing) return null;
        isProcessing = true;
        try {
            let messages = [];
            if (win.OS_API && typeof win.OS_API.buildContext === 'function') {
                try { messages = await win.OS_API.buildContext(userMessage, 'idol_hub'); } catch(e) {}
            }
            if (messages.length === 0) messages = [{ role: 'user', content: userMessage }];
            if (sysPrompt) messages.unshift({ role: 'system', content: sysPrompt });

            let config = {};
            if (win.OS_SETTINGS) {
                if (useSecondary && typeof win.OS_SETTINGS.getSecondaryConfig === 'function') {
                    const secConfig = win.OS_SETTINGS.getSecondaryConfig();
                    if (secConfig && (secConfig.key || (secConfig.useSystemApi && secConfig.stProfileId))) {
                        config = secConfig;
                    } else { config = win.OS_SETTINGS.getConfig(); }
                } else {
                    config = win.OS_SETTINGS.getConfig();
                }
            } else {
                config = { temperature: tempOverride };
            }
            config.temperature = tempOverride;
            config.route = useSecondary ? "idol_chat" : "idol_sys";

            return new Promise(resolve => {
                if (win.OS_API && win.OS_API.chat) {
                    win.OS_API.chat(messages, config, null, 
                        (txt) => { isProcessing = false; resolve(txt); },
                        (err) => { console.error(err); isProcessing = false; resolve(null); }
                    );
                } else {
                    isProcessing = false; resolve(null);
                }
            });
        } catch (e) { isProcessing = false; return null; }
    }

    function safeExtractJson(rawText) {
        if (!rawText) throw new Error("API 回傳為空");
        let cleanText = rawText.replace(/```[a-zA-Z]*\n/g, "").replace(/```/g, "").trim();
        const startIndex = cleanText.indexOf('{');
        const endIndex = cleanText.lastIndexOf('}');
        if (startIndex !== -1 && endIndex !== -1) {
            cleanText = cleanText.substring(startIndex, endIndex + 1);
        }
        return JSON.parse(cleanText);
    }

    // === 4. 樣式定義 ===
    const appStyle = `
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700;900&family=Noto+Sans+TC:wght@400;700;900&display=swap');

        .idol-container { width: 100%; height: 100%; background: #0f0c29; color: #fff; display: flex; flex-direction: column; overflow: hidden; font-family: 'Montserrat', 'Noto Sans TC', sans-serif; position: relative; }
        .idol-header { z-index: 30; padding: 15px 20px; background: rgba(15, 12, 41, 0.9); backdrop-filter: blur(10px); border-bottom: 2px solid #e100ff; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 5px 20px rgba(225, 0, 255, 0.2); flex-shrink:0; }
        .idol-title { font-weight: 900; font-size: 18px; letter-spacing: 2px; text-transform: uppercase; background: linear-gradient(to right, #7f00ff, #e100ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; display:flex; align-items:center; gap:8px; }
        
        .idol-input-group { margin-bottom: 20px; }
        .idol-label { font-size: 12px; margin-bottom: 8px; display: block; color: #d4afff; font-weight: bold; letter-spacing: 1px;}
        .idol-input { width: 100%; background: rgba(0,0,0,0.5); border: 1px solid #7f00ff; color: #fff; padding: 10px 12px; font-size: 14px; border-radius: 8px; outline: none; box-sizing: border-box; transition: 0.3s; }
        .idol-input:focus { border-color: #e100ff; box-shadow: 0 0 10px rgba(225, 0, 255, 0.3); background: rgba(20,0,40,0.8); }

        .idol-main-room { flex: 1; display: flex; flex-direction: column; position: relative; background-size: cover; background-position: center; transition: background 0.5s ease; }
        .idol-action-area { position: absolute; top: 20px; right: 15px; display: flex; flex-direction: column; gap: 12px; z-index: 25; }
        .idol-action-btn { width: 45px; height: 45px; background: rgba(0,0,0,0.6); border: 1px solid #e100ff; border-radius: 12px; font-size: 18px; display: flex; align-items: center; justify-content: center; color: #fff; cursor: pointer; transition: 0.3s; box-shadow: 0 0 10px rgba(225, 0, 255, 0.2); }
        .idol-action-btn:hover { background: linear-gradient(135deg, #7f00ff, #e100ff); transform: scale(1.1); }

        .idol-vn-wrapper { position: absolute; bottom: 70px; left: 15px; right: 15px; z-index: 10; pointer-events: none; }
        .idol-vn-box { background: rgba(10, 10, 15, 0.85); backdrop-filter: blur(15px); border: 1px solid #7f00ff; border-radius: 8px; padding: 25px 20px 15px 20px; min-height: 80px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); position: relative; pointer-events: auto; cursor: pointer; }
        .idol-vn-name { position: absolute; top: -14px; left: 20px; background: linear-gradient(to right, #7f00ff, #e100ff); color: white; padding: 4px 16px; border-radius: 4px; font-weight: bold; font-size: 14px; letter-spacing: 1px; }
        @keyframes idol-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        .idol-vn-next { display: none; position: absolute; bottom: 8px; right: 15px; font-size: 12px; color: #e100ff; animation: idol-blink 1.2s infinite; }
        
        .idol-chat-bar { position: absolute; bottom: 0; left: 0; width: 100%; height: 60px; background: rgba(15,12,41,0.95); border-top: 1px solid #7f00ff; display: flex; align-items: center; padding: 0 15px; z-index: 15; box-sizing: border-box; gap: 10px; }
        .idol-history-btn { font-size:22px; cursor:pointer; flex-shrink:0; transition:0.2s; color:#00ffcc; filter: drop-shadow(0 0 5px rgba(0,255,204,0.5)); }
        .idol-history-btn:hover { transform: scale(1.1); filter: drop-shadow(0 0 10px #00ffcc); }
        .idol-input-field { flex: 1; background: #000; border: 1px solid #555; color: #fff; padding: 10px 15px; border-radius: 20px; font-size: 14px; outline: none; }
        .idol-input-field:focus { border-color: #e100ff; }
        .idol-send-btn { width: 40px; height: 40px; background: linear-gradient(135deg, #7f00ff, #e100ff); border-radius: 50%; border: none; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; transition: 0.2s; }
        .idol-send-btn:active { transform: scale(0.9); }

        .idol-modal-layer { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); backdrop-filter: blur(5px); display: flex; justify-content: center; align-items: center; opacity: 0; pointer-events: none; transition: 0.3s; z-index: 100; }
        .idol-modal-layer.active { opacity: 1; pointer-events: auto; }
        .idol-modal { width: 85%; max-height: 80%; background: #1a1a2e; border: 1px solid #e100ff; border-radius: 16px; padding: 25px; color: #fff; display: flex; flex-direction: column; gap: 15px; box-shadow: 0 0 40px rgba(225, 0, 255, 0.1); overflow-y: auto; text-align: center; }
        
        .idol-modal::-webkit-scrollbar { width: 6px; }
        .idol-modal::-webkit-scrollbar-track { background: transparent; }
        .idol-modal::-webkit-scrollbar-thumb { background: rgba(225,0,255,0.3); border-radius: 3px; }

        .idol-btn { background: linear-gradient(135deg, #7f00ff, #e100ff); border: none; padding: 12px; color: #fff; font-weight: bold; border-radius: 8px; cursor: pointer; text-transform: uppercase; transition: 0.2s; text-align: center; }
        .idol-btn:hover { filter: brightness(1.2); transform: translateY(-2px); }
        
        /* 歷史對話 UI 樣式 */
        .idol-chat-msg { background: rgba(0,0,0,0.5); padding:10px; border-radius:8px; margin-bottom:8px; text-align:left; font-size:13px; display:flex; gap:10px; align-items:flex-start; border: 1px solid #444; cursor:pointer; }
        .idol-chat-msg:hover { border-color: #00ffcc; }
        .idol-checkbox { width:16px; height:16px; cursor:pointer; flex-shrink:0; margin-top:2px; accent-color:#00ffcc; }

        /* 選項樣式 */
        .idol-option-btn { padding: 12px; background: rgba(20,0,40,0.8); border: 1px solid #e100ff; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: bold; color: #fff; transition: 0.2s; text-align: left; display:flex; flex-direction:column; gap:4px; }
        .idol-option-btn:hover { background: #e100ff; color: #fff; transform: translateY(-2px); box-shadow: 0 4px 10px rgba(225, 0, 255, 0.3); }
        
        /* 標籤分類樣式 */
        .idol-tabs { display: flex; gap: 8px; margin-bottom: 10px; background: rgba(0,0,0,0.3); padding: 5px; border-radius: 10px; flex-shrink:0; }
        .idol-tab { flex: 1; padding: 10px 5px; background: transparent; color: #888; text-align: center; cursor: pointer; border-radius: 8px; font-size: 13px; font-weight: bold; transition: 0.2s; border: 1px solid transparent; }
        .idol-tab:hover { color: #fff; }
        .idol-tab.active { background: rgba(225,0,255,0.2); color: #fff; border-color: #e100ff; box-shadow: 0 0 10px rgba(225,0,255,0.2); }
        .idol-section-title { font-size: 13px; color: #00ffcc; margin: 15px 0 10px 0; border-bottom: 1px solid rgba(0,255,204,0.3); padding-bottom: 5px; text-align: left; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; }
        
        /* 網格列表 */
        .idol-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 10px; padding: 5px; }
        .idol-grid-item { background: rgba(0,0,0,0.6); border: 1px solid #555; border-radius: 8px; padding: 10px; text-align: center; cursor: pointer; transition: 0.2s; position: relative; }
        .idol-grid-item:hover, .idol-grid-item.selected { border-color: #e100ff; background: rgba(225,0,255,0.2); transform: translateY(-2px); }
        .idol-grid-img { width: 60px; height: 60px; border-radius: 50%; object-fit: cover; margin-bottom: 8px; border: 2px solid transparent; }
        .idol-grid-item.selected .idol-grid-img { border-color: #00ffcc; box-shadow: 0 0 10px #00ffcc; }
        .idol-role-badge { position:absolute; top:-5px; right:-5px; background:#e100ff; color:#fff; font-size:9px; padding:2px 5px; border-radius:4px; font-weight:bold; box-shadow: 0 2px 5px rgba(0,0,0,0.5); }
    `;

    // === 5. 主邏輯與渲染 ===
    async function launchApp(container) {
        currentContainer = container;
        const doc = window.parent.document || document;
        if (!doc.getElementById('idol-app-css')) {
            const s = doc.createElement('style'); s.id = 'idol-app-css'; s.innerHTML = appStyle; doc.head.appendChild(s);
        }

        const hasSavedData = await loadState();

        // 嘗試從大廳取得名字，如果尚未有存檔或名稱為預設
        if (!hasSavedData || STATE.managerName === '製作人') {
            if (window.VoidTerminal && window.VoidTerminal.getUserName) {
                const globalName = window.VoidTerminal.getUserName();
                if (globalName) STATE.managerName = globalName;
            }
        }
        
        if (!hasSavedData) {
            STATE.companyName = '星光娛樂';
            await saveState();
        }

        STATE.view = 'OFFICE';
        renderOffice();

        if (!hasSavedData) {
            playVnSequence(`[Char|${STATE.managerName}|smile|「歡迎來到星夢工廠，${STATE.companyName} 正式開始營業！」]`);
        } else {
            // 如果需要，可以開啟這行讓每次回來都有歡迎語
            // playVnSequence(`[Char|${STATE.managerName}|smile|「歡迎回到公司，今天也有很多通告和練習生等著處理呢。」]`);
        }
    }

    // 編輯公司檔案
    function openProfileEdit() {
        showModal(`
            <div class="idol-modal" style="background:#0a0514; border:1px solid #e100ff;">
                <h3 style="margin-top:0; color:#e100ff;">✏️ 編輯公司檔案</h3>
                <div class="idol-input-group" style="text-align:left;">
                    <span class="idol-label">經紀公司名稱</span>
                    <input class="idol-input" id="edit-company-name" type="text" value="${STATE.companyName}">
                </div>
                <div class="idol-input-group" style="text-align:left;">
                    <span class="idol-label">你的名字 / 稱呼</span>
                    <input class="idol-input" id="edit-manager-name" type="text" value="${STATE.managerName}">
                </div>
                <div class="idol-btn" style="background:linear-gradient(135deg, #00ffcc, #0099ff);" onclick="window.IDOL_CORE.saveProfileEdit()">儲存變更</div>
                <div class="idol-btn" style="background:transparent; border:1px solid #555; margin-top:10px;" onclick="window.IDOL_CORE.closeModal()">取消</div>
            </div>
        `);
    }

    function saveProfileEdit() {
        const cName = document.getElementById('edit-company-name').value.trim() || '星光娛樂';
        const mName = document.getElementById('edit-manager-name').value.trim() || '製作人';
        
        STATE.companyName = cName;
        STATE.managerName = mName;
        saveState();
        closeModal();
        renderOffice();
        playVnSequence(`[Char|${STATE.managerName}|smile|「公司檔案已更新，繼續努力吧！」]`);
    }

    // 🔥 獲取所有歷史紀錄用的工具函數 (掃描 localStorage)
    function getAllSaves() {
        let saves = [];
        for (let i = 0; i < localStorage.length; i++) {
            let key = localStorage.key(i);
            if (key.startsWith('os_idol_db_')) {
                try {
                    let data = JSON.parse(localStorage.getItem(key));
                    saves.push({
                        id: key.replace('os_idol_db_', ''),
                        companyName: data.companyName || '未知公司',
                        managerName: data.managerName || '未知經理',
                        funds: data.funds || 0,
                        rosterCount: (data.roster || []).length,
                        timestamp: data.timestamp || 0
                    });
                } catch(e) {}
            }
        }
        return saves.sort((a,b) => b.timestamp - a.timestamp); // 新的排前面
    }

    // 🔥 開啟歷史存檔管理器
    function openSaveManager() {
        const saves = getAllSaves();
        let html = `
            <div class="idol-modal" style="max-height:85vh; padding:25px 20px; background:#0a0514; border:1px solid #e100ff; text-align:left;">
                <h3 style="margin-top:0; color:#e100ff; border-bottom:1px dashed rgba(225,0,255,0.4); padding-bottom:10px;">📂 歷史檔案管理</h3>
                <div style="color:#aaa; font-size:12px; margin-bottom:15px; line-height:1.5;">
                    清理不再需要的娛樂公司資料，釋放系統空間。<br>
                    <span style="color:#ff0044;">注意：刪除後將無法恢復該對話的經營進度。</span>
                </div>
                <div style="margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                    <label style="font-size:12px; cursor:pointer; color:#e100ff; display:flex; align-items:center; gap:5px;">
                        <input type="checkbox" onchange="window.IDOL_CORE.toggleAllSaves(this)" style="accent-color:#e100ff;"> 全選
                    </label>
                    <button class="idol-btn" style="padding:5px 10px; font-size:12px; background:linear-gradient(135deg, #ff0044, #cc0000);" onclick="window.IDOL_CORE.deleteSelectedSaves()">🗑️ 刪除選定</button>
                </div>
                <div style="display:flex; flex-direction:column; gap:10px; overflow-y:auto; max-height:45vh; padding-right:5px;">
        `;

        if (saves.length === 0) {
            html += `<div style="text-align:center; color:#666; font-size:12px; padding:20px;">資料庫中尚無歷史檔案</div>`;
        } else {
            saves.forEach(s => {
                const dateStr = s.timestamp ? new Date(s.timestamp).toLocaleString() : '未知時間';
                html += `
                    <div style="background:rgba(255,255,255,0.05); border:1px solid #333; padding:10px; display:flex; align-items:flex-start; gap:10px; border-left:3px solid #e100ff; border-radius:4px;">
                        <input type="checkbox" class="save-cb" value="${s.id}" style="margin-top:4px; accent-color:#e100ff;">
                        <div style="flex:1; min-width:0;">
                            <div style="font-weight:bold; color:#fff; font-size:13px; word-break:break-all; margin-bottom:4px;">ID: ${s.id}</div>
                            <div style="font-size:11px; color:#ccc; margin-bottom:2px;">公司: <span style="color:#e100ff;">${s.companyName}</span> | 經理: ${s.managerName}</div>
                            <div style="font-size:10px; color:#666;">藝人數: ${s.rosterCount} | 資金: $${s.funds.toLocaleString()} | 時間: ${dateStr}</div>
                        </div>
                    </div>
                `;
            });
        }

        html += `</div><div class="idol-btn" style="background:transparent; border:1px solid #555; margin-top:15px;" onclick="window.IDOL_CORE.closeModal()">關閉</div></div>`;
        showModal(html);
    }

    function toggleAllSaves(checkbox) {
        document.querySelectorAll('.save-cb').forEach(cb => cb.checked = checkbox.checked);
    }

    function deleteSelectedSaves() {
        const checked = Array.from(document.querySelectorAll('.save-cb:checked')).map(cb => cb.value);
        if (checked.length === 0) {
            alert("請先勾選要刪除的檔案。");
            return;
        }
        if (confirm(`警告：確定要刪除這 ${checked.length} 筆歷史檔案嗎？此操作無法復原。`)) {
            checked.forEach(id => localStorage.removeItem('os_idol_db_' + id));
            openSaveManager(); // 刷新畫面
        }
    }

    function renderOffice() {
        STATE.currentChatTargetId = null; 
        currentContainer.innerHTML = `
            <div class="idol-container">
                <div class="idol-header">
                    <div style="font-size:32px; font-weight:bold; cursor:pointer; line-height:1; transition:0.2s;" onmouseover="this.style.color='#e100ff'" onmouseout="this.style.color='#fff'" onclick="window.PhoneSystem.goHome()" title="返回手機大廳">‹</div>
                    <div class="idol-title">
                        ${STATE.companyName}
                        <i class="fa-solid fa-pen" style="font-size:14px; cursor:pointer; color:#e100ff; transition:0.2s;" onmouseover="this.style.filter='brightness(1.5)'" onmouseout="this.style.filter='none'" onclick="window.IDOL_CORE.openProfileEdit()" title="編輯公司資料"></i>
                    </div>
                    <div style="font-size:12px; color:#e100ff; font-weight:bold;">💰 $${STATE.funds.toLocaleString()}</div>
                </div>
                
                <div class="idol-main-room" id="idol-main-room" style="background-image: url('${BG_MAP.office}');">
                    <div style="flex:1; display:flex; justify-content:center; align-items:flex-end; padding-bottom:120px; z-index: 1;">
                        <img src="${STATE.managerAvatar}" style="max-height:50%; max-width:350px; object-fit:contain; filter: drop-shadow(0 0 20px rgba(0,0,0,0.8));">
                    </div>

                    <div class="idol-action-area">
                        <div class="idol-action-btn" title="旗下檔案" onclick="window.IDOL_CORE.openRoster('trainee')">👥</div>
                        <div class="idol-action-btn" title="星探招募" onclick="window.IDOL_CORE.startScouting()">✨</div>
                        <div class="idol-action-btn" title="組團管理" onclick="window.IDOL_CORE.openGrouping()" style="border-color:#00ffcc;">🤝</div>
                        <div class="idol-action-btn" title="行程排課" onclick="window.IDOL_CORE.openTraining()">📅</div>
                        <div class="idol-action-btn" title="藝人宿舍" onclick="window.IDOL_CORE.openDorm('trainee')" style="border-color:#ffaa00;">🏠</div>
                        <div class="idol-action-btn" title="歷史檔案管理" onclick="window.IDOL_CORE.openSaveManager()" style="margin-top:20px; border-color:#e100ff; color:#e100ff;">📂</div>
                    </div>

                    <div class="idol-vn-wrapper">
                        <div class="idol-vn-box" onclick="window.IDOL_CORE.advanceVn()">
                            <div class="idol-vn-name" id="idol-vn-name">${STATE.managerName}</div>
                            <div id="idol-vn-text" style="font-size:14px; line-height:1.6; color:#ddd;">等待指示中...</div>
                            <div class="idol-vn-next" id="idol-vn-next">▼</div>
                        </div>
                    </div>
                    
                    <div class="idol-chat-bar">
                        <div class="idol-history-btn" title="歷史對話" onclick="window.IDOL_CORE.openChatHistory()">📜</div>
                        <input id="idol-chat-input" class="idol-input-field" placeholder="傳達公司指令..." onkeypress="if(event.key==='Enter') window.IDOL_CORE.sendSysMessage()">
                        <button class="idol-send-btn" onclick="window.IDOL_CORE.sendSysMessage()">➤</button>
                    </div>
                </div>
                <div id="idol-modal-layer" class="idol-modal-layer"></div>
            </div>
        `;
        
        if (STATE.isTyping || STATE.vnQueue.length > 0) advanceVn();
    }

    // === 6. AI 星探招募系統 ===
    async function startScouting() {
        showModal(`<div class="idol-modal"><h3 style="color:#e100ff;">星探出動中...</h3><div style="color:#888;">正在尋找潛力新星，請稍候...<br>(預計帶回 3 名練習生候選人)</div></div>`);
        
        const sysPrompt = `你是一個偶像娛樂公司的星探系統。請隨機生成【3位】具有特色的潛力練習生。
必須嚴格回傳純 JSON 格式，包含一個 candidates 陣列：
{
    "candidates": [
        {
            "name": "練習生姓名",
            "age": 16,
            "gender": "男/女",
            "stats": { "vocal": 10, "dance": 15, "charm": 30, "stress": 0 },
            "trait": "角色特質(如：天生鏡頭感、憂鬱氣質、活力四射)",
            "imgPrompt": "英文外觀描述詞，例如: 1girl, trendy idol outfit, confident smile"
        }
    ]
}`;

        try {
            const apiRes = await callApi("請幫我尋找 3 位新的練習生。", sysPrompt, 0.9, false);
            const parsedData = safeExtractJson(apiRes);
            let candidatesList = parsedData.candidates || [];
            if (!Array.isArray(candidatesList)) candidatesList = [parsedData]; 

            candidatesList.forEach((c, idx) => { 
                c.id = 'idol_' + Date.now() + '_' + idx; 
                c.status = 'trainee'; 
                c.groupRole = '';
                c.chatHistory = [];
                c.avatarUrl = "https://files.catbox.moe/k2n32k.png"; 
            });
            
            STATE.candidates = candidatesList;

            showModal(`<div class="idol-modal"><h3 style="color:#e100ff;">名單確認！</h3><div style="color:#888;">已找到 ${candidatesList.length} 名潛力股。<br>正在拍攝定裝照...</div></div>`);

            if (win.OS_IMAGE_MANAGER) {
                await Promise.all(STATE.candidates.map(async (c) => {
                    try {
                        c.avatarUrl = await win.OS_IMAGE_MANAGER.generateItem(c.imgPrompt, {width:512, height:512});
                        await saveAvatarToLorebook(c.name, c.avatarUrl);
                    } catch(e) { console.warn('Image Gen Failed for ' + c.name); }
                }));
            }

            renderScoutSelection();

        } catch(error) {
            console.error("Scouting Error:", error);
            closeModal();
            playVnSequence(`[Char|${STATE.managerName}|normal|「星探回報，今天沒有遇到合適的人選... (API連線失敗)」]`);
        }
    }

    function renderScoutSelection() {
        if (STATE.candidates.length === 0) { closeModal(); renderOffice(); return; }

        let html = `<div class="idol-modal" style="max-height:85vh; padding:25px 20px; background:#0a0514; border:1px solid #e100ff;">
            <h3 style="color:#fff; margin-top:0; border-bottom:1px dashed rgba(225,0,255,0.4); padding-bottom:15px;">✨ 星探回報：發現潛力股</h3>
            <div style="color:#aaa; font-size:12px; margin-bottom:15px;">請選擇簽約對象 (每人簽約金 $20,000，將成為練習生)</div>
            <div style="display:flex; flex-direction:column; gap:15px; overflow-y:auto; padding-right:5px; max-height:50vh;">`;

        STATE.candidates.forEach(c => {
            html += `
                <div style="display:flex; gap:15px; background:linear-gradient(145deg, rgba(30,15,45,0.9), rgba(10,5,20,0.8)); padding:15px; border-radius:16px; border:1px solid rgba(225,0,255,0.4); text-align:left;">
                    <img src="${c.avatarUrl}" style="width:70px; height:70px; border-radius:12px; object-fit:cover; border:2px solid #e100ff; flex-shrink:0;">
                    <div style="flex:1;">
                        <div style="font-weight:900; font-size:16px; color:#fff;">${c.name} <span style="font-size:11px; color:#aaa;">(${c.age}歲 / ${c.gender})</span></div>
                        <div style="font-size:11px; color:#d4afff; margin-top:4px; font-weight:bold;">✨ 特質: ${c.trait}</div>
                        <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:4px; margin-top:8px; font-size:10px;">
                            <span style="color:#00ffcc;">🎤 ${c.stats.vocal}</span>
                            <span style="color:#ff00cc;">💃 ${c.stats.dance}</span>
                            <span style="color:#ffcc00;">🌟 ${c.stats.charm}</span>
                        </div>
                    </div>
                    <button class="idol-btn" style="padding:10px; font-size:12px; border-radius:12px;" onclick="window.IDOL_CORE.hireIdol('${c.id}')">簽約</button>
                </div>
            `;
        });

        html += `</div><div class="idol-btn" style="background:transparent; border:1px solid #555; margin-top:15px;" onclick="window.IDOL_CORE.closeModal()">放棄剩餘名單</div></div>`;
        showModal(html);
    }

    function hireIdol(id) {
        const index = STATE.candidates.findIndex(c => c.id === id);
        if (index !== -1) {
            const target = STATE.candidates[index];
            if (STATE.funds < 20000) { alert("公司資金不足！"); return; }
            
            STATE.funds -= 20000;
            STATE.roster.push(target);
            STATE.candidates.splice(index, 1); 
            saveState();
            
            playVnSequence(`[Char|${STATE.managerName}|smile|「已成功與 ${target.name} 簽約，正式成為練習生！」]`);
            
            if (STATE.candidates.length > 0) renderScoutSelection(); 
            else { closeModal(); renderOffice(); }
        }
    }

    // === 7. 組團與定位分配系統 ===
    function assignGroupRoles(selectedIds) {
        const members = STATE.roster.filter(r => selectedIds.includes(r.id));
        let maxV = -1, maxD = -1, maxC = -1, maxTotal = -1;
        
        members.forEach(m => {
            let total = m.stats.vocal + m.stats.dance + m.stats.charm;
            if(total > maxTotal) maxTotal = total;
            if(m.stats.vocal > maxV) maxV = m.stats.vocal;
            if(m.stats.dance > maxD) maxD = m.stats.dance;
            if(m.stats.charm > maxC) maxC = m.stats.charm;
        });

        members.forEach(m => {
            let roles = [];
            let total = m.stats.vocal + m.stats.dance + m.stats.charm;
            
            if(total === maxTotal && total > 0) roles.push("全能ACE");
            if(m.stats.vocal === maxV && m.stats.vocal > 0) roles.push("主唱");
            if(m.stats.dance === maxD && m.stats.dance > 0) roles.push("主舞");
            if(m.stats.charm === maxC && m.stats.charm > 0) roles.push("門面");
            
            if(roles.length === 0) {
                if(m.stats.vocal >= m.stats.dance) roles.push("副唱");
                else roles.push("領舞");
            }
            m.groupRole = roles.join(" / ");
        });
    }

    function openGrouping() {
        const trainees = STATE.roster.filter(r => r.status === 'trainee');
        if (trainees.length === 0) {
            playVnSequence(`[Char|${STATE.managerName}|normal|「公司目前沒有閒置的練習生可以組團。」]`); return;
        }

        let gridHtml = trainees.map(t => `
            <div class="idol-grid-item" id="trainee-sel-${t.id}" onclick="window.IDOL_CORE.toggleTraineeSelect('${t.id}')">
                <img src="${t.avatarUrl}" class="idol-grid-img">
                <div style="font-size:11px; font-weight:bold;">${t.name}</div>
                <div style="font-size:9px; color:#aaa;">${t.gender}</div>
            </div>
        `).join('');

        showModal(`
            <div class="idol-modal" style="background:#0a0514; border:1px solid #00ffcc;">
                <h3 style="margin-top:0; color:#00ffcc;">🤝 成立新團體</h3>
                <div style="color:#aaa; font-size:12px; margin-bottom:10px;">請選擇要出道的練習生 (至少 2 名)</div>
                <div class="idol-grid" style="max-height: 40vh; overflow-y:auto;" id="group-selection-grid">${gridHtml}</div>
                <div style="margin-top:15px; text-align:left;">
                    <div class="idol-input-group">
                        <span class="idol-label">團體名稱</span>
                        <input class="idol-input" id="new-group-name" type="text" placeholder="例如: STARLIGHT">
                    </div>
                </div>
                <div class="idol-btn" style="background:linear-gradient(135deg, #00ffcc, #0099ff);" onclick="window.IDOL_CORE.confirmGroup()">宣佈出道並分配定位</div>
                <div class="idol-btn" style="background:transparent; border:1px solid #555; margin-top:10px;" onclick="window.IDOL_CORE.closeModal()">取消</div>
            </div>
        `);
        STATE._tempSelectedTrainees = [];
    }

    function toggleTraineeSelect(id) {
        const el = document.getElementById(`trainee-sel-${id}`);
        if(!el) return;
        const idx = STATE._tempSelectedTrainees.indexOf(id);
        if (idx === -1) {
            STATE._tempSelectedTrainees.push(id);
            el.classList.add('selected');
        } else {
            STATE._tempSelectedTrainees.splice(idx, 1);
            el.classList.remove('selected');
        }
    }

    function confirmGroup() {
        const gName = document.getElementById('new-group-name').value.trim();
        if(!gName) { alert("請輸入團體名稱！"); return; }
        if(STATE._tempSelectedTrainees.length < 2) { alert("一個團體至少需要 2 名成員！"); return; }

        assignGroupRoles(STATE._tempSelectedTrainees);

        const membersList = [];
        STATE.roster.forEach(r => {
            if (STATE._tempSelectedTrainees.includes(r.id)) {
                r.status = 'grouped';
                r.groupName = gName;
                membersList.push(`${r.name} (${r.groupRole})`);
            }
        });

        STATE.groups.push({
            id: 'group_' + Date.now(),
            name: gName,
            members: STATE._tempSelectedTrainees,
            popularity: 0,
            harmony: 50,  // 預設融洽度
            events: []    // 事件紀錄
        });

        saveState();
        closeModal();
        playVnSequence(`[Char|${STATE.managerName}|smile|「恭喜！全新團體 ${gName} 正式出道！\n成員名單：${membersList.join(', ')}。」]`);
    }

    // === 8. 檔案與團隊趣事 UI ===
    function openRoster(activeTab = 'trainee') {
        if (STATE.roster.length === 0) {
            showModal(`<div class="idol-modal"><h3>旗下空空如也</h3><div class="idol-btn" onclick="window.IDOL_CORE.closeModal()">返回大廳</div></div>`);
            return;
        }

        const isTrainee = activeTab === 'trainee';
        
        let contentHtml = '';
        if (isTrainee) {
            const males = STATE.roster.filter(r => r.status === 'trainee' && r.gender === '男');
            const females = STATE.roster.filter(r => r.status === 'trainee' && r.gender === '女');
            
            contentHtml += `<div class="idol-section-title">男練習生 (${males.length})</div>`;
            males.forEach(i => contentHtml += renderRosterCard(i));
            if(males.length===0) contentHtml += `<div style="color:#666; font-size:12px;">無資料</div>`;

            contentHtml += `<div class="idol-section-title">女練習生 (${females.length})</div>`;
            females.forEach(i => contentHtml += renderRosterCard(i));
            if(females.length===0) contentHtml += `<div style="color:#666; font-size:12px;">無資料</div>`;
        } else {
            STATE.groups.forEach(g => {
                const members = STATE.roster.filter(r => r.groupName === g.name);
                let harmonyColor = g.harmony < 0 ? '#ff0044' : (g.harmony > 70 ? '#00ffcc' : '#ffaa00');
                
                contentHtml += `
                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid rgba(0,255,204,0.3); padding-bottom: 5px; margin: 15px 0 10px 0;">
                        <div style="font-size: 13px; color: #00ffcc; font-weight: bold; text-transform: uppercase;">
                            ✨ ${g.name} (${members.length}人) | 融洽度: <span style="color:${harmonyColor}">${g.harmony||0}</span>
                        </div>
                        <button class="idol-btn" style="padding:4px 10px; font-size:10px; background:linear-gradient(135deg, #ffaa00, #ff0044);" onclick="window.IDOL_CORE.triggerGroupEvent('${g.id}')">🎲 團隊趣事</button>
                    </div>
                `;
                members.forEach(i => contentHtml += renderRosterCard(i));
            });
            if(STATE.groups.length===0) contentHtml += `<div style="color:#666; font-size:12px; text-align:center; padding:20px;">尚未成立任何團體</div>`;
        }

        showModal(`
            <div class="idol-modal" style="max-height:85vh; padding:25px 20px;">
                <h3 style="margin-top:0; color:#fff;">👥 旗下藝人檔案</h3>
                <div class="idol-tabs">
                    <div class="idol-tab ${isTrainee ? 'active':''}" onclick="window.IDOL_CORE.openRoster('trainee')">練習生</div>
                    <div class="idol-tab ${!isTrainee ? 'active':''}" onclick="window.IDOL_CORE.openRoster('group')">出道團體</div>
                </div>
                <div style="overflow-y:auto; padding-right:5px; margin-bottom:15px; max-height:50vh; text-align:left;">${contentHtml}</div>
                <div class="idol-btn" style="width:100%; box-sizing:border-box;" onclick="window.IDOL_CORE.closeModal()">關閉檔案</div>
            </div>
        `);
    }

    function renderRosterCard(i) {
        const stressColor = i.stats.stress > 70 ? '#ff0044' : (i.stats.stress > 30 ? '#ffaa00' : '#00ffcc');
        const roleTag = i.groupRole ? `<span style="background:rgba(225,0,255,0.2); border:1px solid #e100ff; color:#fff; font-size:9px; padding:2px 6px; border-radius:8px;">${i.groupRole}</span>` : '';
        return `
            <div style="display:flex; gap:15px; background:rgba(20,10,30,0.8); padding:15px; border-radius:12px; border:1px solid rgba(225,0,255,0.2); margin-bottom:10px;">
                <img src="${i.avatarUrl}" style="width:70px; height:70px; border-radius:12px; object-fit:cover; border:2px solid #e100ff; flex-shrink:0;">
                <div style="flex:1;">
                    <div style="display:flex; justify-content:space-between;">
                        <div style="font-weight:900; font-size:15px; color:#fff;">${i.name}</div>
                        ${roleTag}
                    </div>
                    <div style="font-size:11px; color:#d4afff; margin-top:4px;">✨ ${i.trait || '無'}</div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px; margin-top:8px; font-size:11px; font-weight:bold;">
                        <span style="color:#888;">🎤 V: <span style="color:#fff;">${i.stats.vocal}</span></span>
                        <span style="color:#888;">💃 D: <span style="color:#fff;">${i.stats.dance}</span></span>
                        <span style="color:#888;">🌟 C: <span style="color:#fff;">${i.stats.charm}</span></span>
                        <span style="color:#888;">💢 S: <span style="color:${stressColor};">${i.stats.stress}</span></span>
                    </div>
                </div>
            </div>
        `;
    }

    // === 9. 團隊趣事 (Group Events) ===
    async function triggerGroupEvent(groupId) {
        const g = STATE.groups.find(x => x.id === groupId);
        if(!g) return;
        const members = STATE.roster.filter(r => r.groupName === g.name);
        const memberNames = members.map(m => `${m.name}(${m.groupRole})`).join('、');
        
        closeModal();
        showModal(`<div class="idol-modal"><h3 style="color:#ffaa00;">🎲 發生了什麼事...</h3><div style="color:#888;">AI 正在生成 ${g.name} 的日常互動...</div></div>`);
        
        const sysPrompt = `你是一個偶像育成模擬器。
團隊名稱：${g.name}
成員：${memberNames}
當前團隊融洽度：${g.harmony || 0} (-100 到 100)

請隨機生成一個團隊內部的日常互動(可能是溫馨小事，也可能是引發爭執的摩擦事件)。
必須嚴格回傳純 JSON 格式：
{
    "eventDesc": "事件描述文字(包含成員的具體互動)...",
    "harmonyChange": -15到15的整數 (正數代表感情變好，負數代表產生矛盾)
}`;
        
        try {
            const apiRes = await callApi(`生成團隊趣事`, sysPrompt, 0.9, false);
            const result = safeExtractJson(apiRes);
            
            if(typeof g.harmony !== 'number') g.harmony = 50;
            g.harmony += (result.harmonyChange || 0);
            if(g.harmony > 100) g.harmony = 100;
            if(g.harmony < -100) g.harmony = -100;
            
            if(!g.events) g.events = [];
            g.events.push(result.eventDesc);
            if(g.events.length > 5) g.events.shift(); // 保留最近5筆
            saveState();

            const changeColor = result.harmonyChange >= 0 ? '#00ffcc' : '#ff0044';
            const sign = result.harmonyChange >= 0 ? '+' : '';

            showModal(`
                <div class="idol-modal" style="text-align:left;">
                    <h3 style="color:#ffaa00; margin-top:0;">🎲 團隊趣事 (${g.name})</h3>
                    <div style="background:rgba(255,255,255,0.05); padding:12px; border-radius:8px; margin-bottom:15px; font-size:14px; line-height:1.5;">${result.eventDesc}</div>
                    <div style="font-weight:bold; color:${changeColor}; text-align:center; margin-bottom:15px;">
                        團隊融洽度 ${sign}${result.harmonyChange} (當前總計: ${g.harmony})
                    </div>
                    <div class="idol-btn" style="width:100%; box-sizing:border-box;" onclick="window.IDOL_CORE.openRoster('group')">返回檔案</div>
                </div>
            `);
        } catch(e) {
            closeModal();
            alert("生成趣事失敗。");
        }
    }

    // === 10. 宿舍系統與副模型情報注入 ===
    function openDorm(activeTab = 'trainee') {
        if (STATE.roster.length === 0) {
            playVnSequence(`[Char|${STATE.managerName}|normal|「宿舍還是空的。」]`); return;
        }

        const isTrainee = activeTab === 'trainee';
        let contentHtml = '';

        if (isTrainee) {
            const males = STATE.roster.filter(r => r.status === 'trainee' && r.gender === '男');
            const females = STATE.roster.filter(r => r.status === 'trainee' && r.gender === '女');
            
            contentHtml += `<div class="idol-section-title">男練習生宿舍</div><div class="idol-grid">`;
            males.forEach(r => contentHtml += renderDormGridItem(r));
            contentHtml += `</div><div class="idol-section-title">女練習生宿舍</div><div class="idol-grid">`;
            females.forEach(r => contentHtml += renderDormGridItem(r));
            contentHtml += `</div>`;
        } else {
            STATE.groups.forEach(g => {
                const members = STATE.roster.filter(r => r.groupName === g.name);
                contentHtml += `<div class="idol-section-title">🏠 ${g.name} 專屬宿舍</div><div class="idol-grid">`;
                members.forEach(r => contentHtml += renderDormGridItem(r));
                contentHtml += `</div>`;
            });
            if(STATE.groups.length===0) contentHtml += `<div style="color:#666; font-size:12px; text-align:center; padding:20px;">尚未有團體入駐</div>`;
        }

        showModal(`
            <div class="idol-modal" style="background:#0a0514; border:1px solid #ffaa00;">
                <h3 style="margin-top:0; color:#ffaa00;">🏠 藝人宿舍大樓</h3>
                <div class="idol-tabs">
                    <div class="idol-tab ${isTrainee ? 'active':''}" onclick="window.IDOL_CORE.openDorm('trainee')">練習生樓層</div>
                    <div class="idol-tab ${!isTrainee ? 'active':''}" onclick="window.IDOL_CORE.openDorm('group')">團體樓層</div>
                </div>
                <div style="max-height: 45vh; overflow-y:auto; overflow-x:hidden;">${contentHtml}</div>
                <div class="idol-btn" style="background:transparent; border:1px solid #555; margin-top:15px;" onclick="window.IDOL_CORE.closeModal()">離開宿舍大樓</div>
            </div>
        `);
    }

    function renderDormGridItem(r) {
        const badge = r.groupRole ? `<div class="idol-role-badge">${r.groupRole.split('/')[0].trim()}</div>` : '';
        return `
            <div class="idol-grid-item" onclick="window.IDOL_CORE.enterDormRoom('${r.id}')">
                ${badge}
                <img src="${r.avatarUrl}" class="idol-grid-img">
                <div style="font-size:11px; font-weight:bold;">${r.name}</div>
            </div>
        `;
    }

    function enterDormRoom(targetId) {
        closeModal();
        STATE.currentChatTargetId = targetId;
        const target = STATE.roster.find(r => r.id === targetId);
        
        const room = document.getElementById('idol-main-room');
        if(room) room.style.backgroundImage = `url('${BG_MAP.dorm}')`;

        playVnSequence(`[Nar|你敲了敲門，走進了 ${target.name} 的房間。]`);
        
        const input = document.getElementById('idol-chat-input');
        const btn = document.querySelector('.idol-send-btn');
        if(input) {
            input.placeholder = `和 ${target.name} 聊聊...`;
            input.onkeypress = (e) => { if(e.key==='Enter') window.IDOL_CORE.sendDormMessage(); };
        }
        if(btn) {
            btn.onclick = () => window.IDOL_CORE.sendDormMessage();
        }
    }

    async function sendDormMessage() {
        const input = document.getElementById('idol-chat-input');
        const text = input.value.trim();
        if (!text || isProcessing || !STATE.currentChatTargetId) return;

        const target = STATE.roster.find(r => r.id === STATE.currentChatTargetId);
        if(!target) return;

        input.value = '';
        target.chatHistory.push({ role: 'user', content: text });
        saveState();

        const textBox = document.getElementById('idol-vn-text');
        const nameBox = document.getElementById('idol-vn-name');
        if(nameBox) nameBox.style.display = 'none';
        if(textBox) textBox.innerHTML = `<span style="color:#888; font-style:italic;">(${target.name} 回應中...)</span>`;

        // === 核心情報注入 (融洽度與歷史事件) ===
        let groupContext = "";
        if (target.status === 'grouped') {
            const g = STATE.groups.find(x => x.name === target.groupName);
            const harmony = g ? (g.harmony || 0) : 0;
            const events = (g && g.events && g.events.length > 0) ? g.events.join('；') : '無特別事件';

            const teammates = STATE.roster.filter(r => r.groupName === target.groupName && r.id !== target.id);
            const teammatesDesc = teammates.map(m => `${m.name} (定位: ${m.groupRole}, 特質: ${m.trait})`).join('、');
            
            groupContext = `\n所屬團體：【${target.groupName}】\n你在團內的定位：【${target.groupRole || '成員'}】\n你的隊友情報：${teammatesDesc || '無其他隊友'}。\n團隊當前融洽度：${harmony}/100 (正數高表示感情好，負數表示有很多矛盾與不滿。請根據此數值調整你對團隊與隊友的態度)。\n近期團隊發生的事：${events}\n(請在對話中自然地意識到團隊現狀與隊友)。`;
        }

        const sysPrompt = `你現在扮演偶像娛樂公司的成員「${target.name}」。
性別：${target.gender}，年齡：${target.age}。
目前身分：${target.status === 'trainee' ? '尚未出道的練習生' : '已出道偶像'}。${groupContext}
特質：${target.trait || '無'}。
壓力值：${target.stats.stress}/100 (壓力過高可能會抱怨或顯得疲憊)。
場景：在宿舍房間內與經紀人/老闆私下聊天。

【強制輸出格式】
[Nar|動作或心理描寫]
[Char|${target.name}|表情|「對話內容」]`;

        try {
            const recentHistory = target.chatHistory.slice(-6);
            const apiRes = await callApi(text, sysPrompt, 0.8, true);

            if (apiRes) {
                const cleanRes = apiRes.replace(/^"|"$/g, '').trim();
                target.chatHistory.push({ role: 'assistant', content: cleanRes });
                saveState();
                playVnSequence(cleanRes);
            } else {
                playVnSequence(`[Nar|(${target.name} 似乎沒聽懂...)]`);
            }
        } catch(e) {
            playVnSequence(`[Nar|(通訊錯誤)]`);
        }
    }

    // === 11. 歷史對話管理 (刪除與回溯) ===
    function openChatHistory() {
        let historySource = null;
        let title = "辦公室系統對話紀錄";
        if (STATE.currentChatTargetId) {
            const t = STATE.roster.find(r => r.id === STATE.currentChatTargetId);
            if(t) { historySource = t.chatHistory; title = `${t.name} 的私下對話紀錄`; }
        } else {
            historySource = STATE.chatHistory;
        }

        if (!historySource || historySource.length === 0) {
            alert("目前沒有歷史對話紀錄。"); return;
        }

        let listHtml = historySource.map((msg, idx) => `
            <label class="idol-chat-msg">
                <input type="checkbox" class="idol-checkbox history-cb" value="${idx}">
                <div style="flex:1;">
                    <span style="color:${msg.role==='user'?'#00ffcc':'#e100ff'}; font-weight:bold;">${msg.role==='user'?'你':'對方'}:</span>
                    <span style="color:#ddd;">${msg.content}</span>
                </div>
            </label>
        `).join('');

        showModal(`
            <div class="idol-modal" style="max-height:85vh; padding:25px 20px; background:#0a0514; border:1px solid #00ffcc;">
                <h3 style="margin-top:0; color:#00ffcc;">📜 ${title}</h3>
                <div style="color:#aaa; font-size:12px; margin-bottom:10px;">如果劇情發展不如預期，可以勾選並刪除錯誤的記憶對話。</div>
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                    <button class="idol-btn" style="padding:6px 12px; font-size:11px;" onclick="document.querySelectorAll('.history-cb').forEach(cb=>cb.checked=true)">全選</button>
                    <button class="idol-btn" style="padding:6px 12px; font-size:11px; background:linear-gradient(135deg, #ff0044, #cc0000);" onclick="window.IDOL_CORE.deleteSelectedHistory()">刪除勾選</button>
                </div>
                <div style="overflow-y:auto; max-height:50vh; padding-right:5px; margin-bottom:15px;">${listHtml}</div>
                <div class="idol-btn" style="background:transparent; border:1px solid #555;" onclick="window.IDOL_CORE.closeModal()">關閉</div>
            </div>
        `);
    }

    function deleteSelectedHistory() {
        const cbs = document.querySelectorAll('.history-cb:checked');
        if(cbs.length === 0) return;
        if(!confirm(`確定要刪除這 ${cbs.length} 條紀錄嗎？這將會從 AI 的記憶中抹除。`)) return;

        // 由大到小排序，確保 splice 不會影響前面元素的 index
        const indicesToRemove = Array.from(cbs).map(cb => parseInt(cb.value)).sort((a,b)=>b-a);
        
        let historySource = null;
        if (STATE.currentChatTargetId) {
            const t = STATE.roster.find(r => r.id === STATE.currentChatTargetId);
            if(t) historySource = t.chatHistory;
        } else {
            historySource = STATE.chatHistory;
        }

        if(historySource) {
            indicesToRemove.forEach(idx => historySource.splice(idx, 1));
            saveState();
            openChatHistory(); // 重新整理畫面
        }
    }

    // === 12. 排課系統 ===
    function openTraining() {
        if (STATE.roster.length === 0) {
            playVnSequence(`[Char|${STATE.managerName}|normal|「沒有任何人可以安排行程。」]`); return;
        }
        
        let rosterHtml = STATE.roster.map((r, idx) => `
            <option value="${r.id}">${r.name} [${r.status === 'trainee' ? '練習生' : r.groupName}] (壓力: ${r.stats.stress})</option>
        `).join('');

        showModal(`
            <div class="idol-modal" style="background:#0a0514;">
                <h3 style="margin-top:0; color:#fff;">📅 安排訓練行程</h3>
                <select id="train-target-select" style="padding:12px; background:rgba(0,0,0,0.8); color:#fff; border:1px solid #e100ff; width:100%; margin-bottom:15px; border-radius:8px;">
                    ${rosterHtml}
                </select>
                <div class="idol-btn" onclick="window.IDOL_CORE.startSchedule('聲樂課')">🎤 聲樂特訓</div>
                <div class="idol-btn" onclick="window.IDOL_CORE.startSchedule('舞蹈課')">💃 舞蹈地獄</div>
                <div class="idol-btn" onclick="window.IDOL_CORE.startSchedule('公關課')">📸 鏡頭與公關</div>
                <div class="idol-btn" style="background:transparent; border:1px solid #555;" onclick="window.IDOL_CORE.closeModal()">取消</div>
            </div>
        `);
    }

    async function startSchedule(courseType) {
        const targetId = document.getElementById('train-target-select').value;
        const target = STATE.roster.find(r => r.id === targetId);
        if (!target) return;
        closeModal();
        
        showModal(`<div class="idol-modal"><h3 style="color:#e100ff;">課程進行中...</h3><div style="color:#888;">AI 正在根據 ${target.name} 的狀態生成突發事件...</div></div>`);
        
        const sysPrompt = `你是一個偶像育成模擬器。
對象：${target.name} (狀態：${target.status === 'trainee' ? '練習生' : '已出道藝人'})
特質：${target.trait || '無'}
正在進行的課程：【${courseType}】

請根據課程生成一個合理的突發狀況，並提供 3 個應對選項。
必須嚴格回傳純 JSON 格式：
{
    "eventDesc": "事件描述文字...",
    "options": [
        { "text": "咬牙加練", "vocal": 0, "dance": 5, "charm": 0, "stress": 10, "conclusion": "雖然很累，但舞技確實進步了。" }
    ]
}`;

        try {
            const apiRes = await callApi(`開始執行【${courseType}】`, sysPrompt, 0.8, false);
            const result = safeExtractJson(apiRes);
            renderEventOptions(result, target, courseType);
        } catch(error) {
            console.error("Schedule Error:", error);
            closeModal();
            playVnSequence(`[Char|${STATE.managerName}|error|「排課系統連線中斷，請稍後再試。」]`);
        }
    }

    function renderEventOptions(eventData, target, courseType) {
        let optionsHtml = eventData.options.map((opt, index) => `
            <button class="idol-option-btn" onclick="window.IDOL_CORE.applyEventResult('${target.id}', ${index}, '${encodeURIComponent(JSON.stringify(eventData.options))}')">
                <div>${opt.text}</div>
                <div style="display:flex; gap:5px; font-size:10px;">
                    <span style="color:#00ffcc;">V:${opt.vocal||0}</span>
                    <span style="color:#ff00cc;">D:${opt.dance||0}</span>
                    <span style="color:#ffcc00;">C:${opt.charm||0}</span>
                    <span style="color:${(opt.stress||0)>0 ? '#ff0044':'#00ffcc'};">S:${opt.stress||0}</span>
                </div>
            </button>
        `).join('');
        
        showModal(`
            <div class="idol-modal" style="text-align:left;">
                <h3 style="color:#e100ff; margin-top:0;">❗ 突發狀況 (${courseType})</h3>
                <div style="background:rgba(255,255,255,0.05); padding:12px; border-radius:8px; margin-bottom:15px; font-size:14px; line-height:1.5;">${eventData.eventDesc}</div>
                <div style="display:flex; flex-direction:column; gap:10px;">${optionsHtml}</div>
            </div>
        `);
    }

    function applyEventResult(targetId, optIdx, optsStr) {
        const target = STATE.roster.find(r => r.id === targetId);
        const opts = JSON.parse(decodeURIComponent(optsStr));
        const opt = opts[optIdx];
        
        if (target) {
            target.stats.vocal += opt.vocal || 0;
            target.stats.dance += opt.dance || 0;
            target.stats.charm += opt.charm || 0;
            target.stats.stress += opt.stress || 0;
            if(target.stats.stress < 0) target.stats.stress = 0;
            saveState();
        }

        showModal(`
            <div class="idol-modal" style="text-align:left;">
                <h3 style="color:#e100ff; margin-top:0;">結算報告</h3>
                <div style="color:#aaa; font-size:13px; margin-bottom:10px;">選擇：「${opt.text}」</div>
                <div style="background:rgba(0,0,0,0.5); padding:15px; border-left:4px solid #e100ff; margin-bottom:15px; font-size:14px;">${opt.conclusion}</div>
                <div class="idol-btn" style="width:100%; box-sizing:border-box;" onclick="window.IDOL_CORE.closeModal()">確認</div>
            </div>
        `);
    }

    // === 公司系統聊天 ===
    async function sendSysMessage() {
        const input = document.getElementById('idol-chat-input');
        const text = input.value.trim();
        if (!text || isProcessing) return;
        
        input.value = '';
        STATE.chatHistory.push({ role: 'user', content: text });
        
        const textBox = document.getElementById('idol-vn-text');
        const nameBox = document.getElementById('idol-vn-name');
        if(nameBox) nameBox.style.display = 'none';
        if(textBox) textBox.innerHTML = `<span style="color:#888; font-style:italic;">(系統處理中...)</span>`;

        const sysPrompt = `你是系統 NPC。請根據玩家 (老闆) 的回覆給予適當的反應。
【強制輸出格式】
[Nar|動作或心理描寫]
[Char|角色名|表情|「對話內容」]`;

        try {
            const apiRes = await callApi(text, sysPrompt, 0.8, false);
            if (apiRes) {
                const cleanRes = apiRes.replace(/^"|"$/g, '').trim();
                STATE.chatHistory.push({ role: 'assistant', content: cleanRes });
                playVnSequence(cleanRes);
            } else {
                playVnSequence(`[Nar|(無回應)]`);
            }
        } catch(e) {
            playVnSequence(`[Nar|(通訊錯誤)]`);
        }
    }

    // --- VN 播放器 ---
    let vnFullText = '';
    function playVnSequence(rawText) {
        STATE.vnQueue = parseVnText(rawText);
        STATE.isTyping = false;
        if (STATE.typingTimer) clearInterval(STATE.typingTimer);
        advanceVn();
    }
    
    function parseVnText(rawText) {
        const queue = [];
        const regex = /\[(Nar|Char)\|([^\]]+)\]/g;
        let match;
        let found = false;
        while ((match = regex.exec(rawText)) !== null) {
            found = true;
            const type = match[1];
            const parts = match[2].split('|');
            if (type === 'Nar') queue.push({ type: 'Nar', text: parts[0] });
            else queue.push({ type: 'Char', name: parts[0], text: parts.slice(2).join('|') || parts[1] });
        }
        if (!found) queue.push({ type: 'Char', name: STATE.managerName || 'System', text: rawText });
        return queue;
    }

    function advanceVn() {
        const textBox = document.getElementById('idol-vn-text');
        const nameBox = document.getElementById('idol-vn-name');
        const nextInd = document.getElementById('idol-vn-next');
        if (!textBox || !nameBox) return;

        if (STATE.isTyping) {
            clearInterval(STATE.typingTimer);
            STATE.isTyping = false;
            if (STATE.currentVnMsg && STATE.currentVnMsg.type === 'Nar') textBox.innerHTML = `<span style="color:#888; font-style:italic;">${vnFullText}</span>`;
            else textBox.innerText = vnFullText;
            if (nextInd && STATE.vnQueue.length > 0) nextInd.style.display = 'block';
            return;
        }

        if (STATE.vnQueue.length === 0) {
            if (nextInd) nextInd.style.display = 'none';
            return;
        }

        const msg = STATE.vnQueue.shift();
        STATE.currentVnMsg = msg;
        if (nextInd) nextInd.style.display = 'none';
        
        if (msg.type === 'Nar') {
            nameBox.style.display = 'none';
            vnFullText = msg.text;
        } else {
            nameBox.style.display = 'block';
            nameBox.innerText = msg.name;
            vnFullText = msg.text;
        }

        STATE.isTyping = true;
        textBox.innerHTML = '';
        let i = 0; const speed = 30;
        
        STATE.typingTimer = setInterval(() => {
            if (i < vnFullText.length) {
                let partial = vnFullText.substring(0, i + 1);
                if (msg.type === 'Nar') textBox.innerHTML = `<span style="color:#888; font-style:italic;">${partial}</span>`;
                else textBox.innerText = partial;
                i++;
            } else {
                clearInterval(STATE.typingTimer);
                STATE.isTyping = false;
                if (nextInd && STATE.vnQueue.length > 0) nextInd.style.display = 'block';
            }
        }, speed);
    }

    // --- 工具 ---
    function showModal(html) {
        const layer = document.getElementById('idol-modal-layer');
        if (layer) { layer.innerHTML = html; layer.classList.add('active'); }
    }
    function closeModal() {
        const layer = document.getElementById('idol-modal-layer');
        if (layer) { layer.classList.remove('active'); setTimeout(()=>layer.innerHTML='', 300); }
    }

    // 導出模組 (包含編輯設定介面與歷史管理)
    window.IDOL_CORE = {
        launchApp, openProfileEdit, saveProfileEdit,
        openSaveManager, toggleAllSaves, deleteSelectedSaves,
        openRoster, startScouting, hireIdol, 
        openGrouping, toggleTraineeSelect, confirmGroup, triggerGroupEvent,
        openTraining, startSchedule, applyEventResult,
        openDorm, enterDormRoom, sendDormMessage, sendSysMessage,
        openChatHistory, deleteSelectedHistory,
        advanceVn, closeModal
    };

})();