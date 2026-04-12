// ----------------------------------------------------------------
// [檔案] os_barrage.js (V1.0)
// 路徑：scripts/os_phone/os/os_barrage.js
// 職責：彈幕/評論生成系統 (取代原有的 Map)
// 功能：讀取當前對話上下文，讓 AI 生成「網友/觀眾」的即時反應
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入彈幕助手系統 (V1.0 Barrage)...');
    const win = window.parent || window;

    // === 1. 樣式定義 (Cyber/Stream Style) ===
    const barrageStyle = `
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;700&display=swap');

        .ob-container { 
            width: 100%; height: 100%; 
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); 
            color: #fff; 
            display: flex; flex-direction: column; 
            overflow: hidden; 
            font-family: 'Noto Sans TC', sans-serif; 
            position: relative;
        }

        /* 頂部導航 */
        .ob-header { 
            padding: 15px; 
            background: rgba(0, 0, 0, 0.6); 
            border-bottom: 1px solid rgba(255, 64, 129, 0.3); 
            display: flex; align-items: center; justify-content: space-between; 
            backdrop-filter: blur(5px);
            z-index: 10;
        }
        .ob-title { 
            font-size: 16px; font-weight: bold; color: #FF4081; 
            display: flex; align-items: center; gap: 8px;
            text-shadow: 0 0 10px rgba(255, 64, 129, 0.4);
        }
        .ob-status { font-size: 10px; color: #aaa; background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px; }
        .ob-btn-icon { cursor: pointer; font-size: 18px; color: #fff; transition: 0.2s; width: 30px; text-align: center; }
        .ob-btn-icon:hover { color: #FF4081; transform: scale(1.1); }

        /* 彈幕列表區 */
        .ob-list-area { 
            flex: 1; 
            padding: 15px; 
            overflow-y: auto; 
            display: flex; flex-direction: column; gap: 12px;
            scroll-behavior: smooth;
        }
        
        /* 彈幕氣泡 */
        .ob-item { 
            background: rgba(255, 255, 255, 0.05); 
            border-radius: 12px; 
            padding: 10px 12px; 
            border-left: 3px solid #555;
            animation: slideIn 0.3s ease-out;
            transition: 0.2s;
            position: relative;
        }
        .ob-item:hover { background: rgba(255, 255, 255, 0.1); transform: translateX(2px); }
        
        /* 不同類型的彈幕樣式 */
        .ob-item.type-fan { border-left-color: #FF4081; background: linear-gradient(90deg, rgba(255, 64, 129, 0.1), transparent); }
        .ob-item.type-hater { border-left-color: #444; color: #ccc; }
        .ob-item.type-funny { border-left-color: #FFD700; }
        .ob-item.type-system { border-left-color: #00E5FF; background: rgba(0, 229, 255, 0.05); text-align: center; font-size: 12px; color: #00E5FF; border: 1px solid rgba(0, 229, 255, 0.2); }

        .ob-user-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
        .ob-username { font-size: 12px; font-weight: bold; color: #ddd; }
        .ob-time { font-size: 10px; color: #666; }
        .ob-content { font-size: 14px; line-height: 1.4; color: #fff; word-wrap: break-word; }

        /* 底部操作區 */
        .ob-footer { 
            padding: 15px; 
            background: rgba(0, 0, 0, 0.8); 
            border-top: 1px solid rgba(255, 255, 255, 0.1); 
            display: flex; gap: 10px;
            align-items: center;
        }
        
        .ob-btn-main {
            flex: 1;
            background: linear-gradient(90deg, #FF4081, #d81b60);
            border: none;
            color: white;
            padding: 10px;
            border-radius: 20px;
            font-weight: bold;
            font-size: 14px;
            cursor: pointer;
            box-shadow: 0 4px 15px rgba(255, 64, 129, 0.3);
            transition: 0.3s;
            display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .ob-btn-main:hover { filter: brightness(1.2); transform: translateY(-2px); }
        .ob-btn-main:active { transform: translateY(0); }
        .ob-btn-main:disabled { background: #444; color: #888; cursor: wait; box-shadow: none; transform: none; }

        .ob-btn-clear {
            width: 40px; height: 40px;
            border-radius: 50%;
            background: rgba(255,255,255,0.1);
            border: 1px solid rgba(255,255,255,0.1);
            color: #fff;
            cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            transition: 0.2s;
        }
        .ob-btn-clear:hover { background: rgba(255, 255, 255, 0.2); color: #FF4081; }

        /* 空狀態 */
        .ob-empty { 
            height: 100%; display: flex; flex-direction: column; 
            align-items: center; justify-content: center; 
            color: #666; text-align: center; gap: 10px;
        }
        .ob-empty-icon { font-size: 48px; opacity: 0.5; animation: float 3s infinite ease-in-out; }

        @keyframes slideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes float { 0% { transform: translateY(0); } 50% { transform: translateY(-10px); } 100% { transform: translateY(0); } }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    `;

    const doc = window.parent.document || document;
    if (!doc.getElementById('os-barrage-css')) {
        const s = doc.createElement('style'); s.id = 'os-barrage-css'; s.innerHTML = barrageStyle; doc.head.appendChild(s);
    }

    // === 2. 狀態管理 ===
    let STATE = {
        container: null,
        comments: [], // { user, content, type, time }
        isGenerating: false,
        autoScroll: true
    };

    // === 3. 核心邏輯 (API 串接) ===

    // 生成彈幕的 Prompt
    function getBarragePrompt() {
        return `[System Instruction: You are a Social Media Comment Generator]
你現在是虛擬世界(PhoneOS)的網路輿論生成引擎。
請根據當前劇情的上下文，生成 6-10 條「網友/觀眾」的即時評論或彈幕。

**當前情境：**
請讀取最近的對話歷史，分析當前發生的事件（例如：直播中、論壇討論、公開對峙、或單純的日常）。

**生成要求：**
1. **多樣性**：包含粉絲(Fan)、酸民(Hater)、路人(Neutral)、玩梗(Funny)等多種立場。
2. **真實感**：使用網路用語、表情符號(Emoji)、簡短句式。
3. **格式**：嚴格輸出 JSON Array。

**JSON 格式範例：**
[
  { "user": "吃瓜群眾", "content": "前排圍觀！這瓜保熟嗎？🍉", "type": "neutral" },
  { "user": "愛心發射", "content": "啊啊啊！這也太帥了吧！😍", "type": "fan" },
  { "user": "鍵盤俠3000", "content": "就這？我也會啊，笑死。", "type": "hater" },
  { "user": "系統", "content": "用戶 [神祕人] 送出了 🚀 火箭 x1", "type": "system" }
]

請只輸出 JSON 數組，不要輸出 Markdown 代碼塊或其他解釋。`;
    }

    async function generateBarrage() {
        if (STATE.isGenerating) return;
        
        const btn = document.getElementById('ob-gen-btn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<span style="display:inline-block; animation:spin 1s infinite linear">↻</span> 連線中...`;
        }
        STATE.isGenerating = true;

        try {
            console.log('[Barrage] 🚀 正在生成彈幕...');
            
            // 使用 OS_API.buildContext 自動抓取上下文
            if (!win.OS_API) throw new Error("OS_API 未載入");

            const prompt = getBarragePrompt();
            const messages = await win.OS_API.buildContext(prompt, 'os_barrage_gen');
            const config = win.OS_SETTINGS ? win.OS_SETTINGS.getConfig() : {};

            // 調用 API
            win.OS_API.chat(messages, config, null, (responseText) => {
                try {
                    // 清洗 JSON
                    let cleanText = responseText.replace(/```json|```/g, '').trim();
                    const arrayMatch = cleanText.match(/\[[\s\S]*\]/);
                    if (arrayMatch) cleanText = arrayMatch[0];
                    
                    const newComments = JSON.parse(cleanText);
                    
                    if (Array.isArray(newComments)) {
                        addCommentsSequence(newComments);
                    } else {
                        throw new Error("格式錯誤");
                    }
                } catch (e) {
                    console.error('[Barrage] 解析失敗:', e);
                    // 失敗時的備用數據
                    addCommentsSequence([
                        { user: "系統", content: "訊號不穩，彈幕加載失敗...", type: "system" },
                        { user: "路人A", content: "卡了嗎？", type: "neutral" }
                    ]);
                } finally {
                    resetButton();
                }
            }, (err) => {
                console.error('[Barrage] API 錯誤:', err);
                resetButton();
            });

        } catch (e) {
            console.error('[Barrage] 執行錯誤:', e);
            resetButton();
        }
    }

    function resetButton() {
        STATE.isGenerating = false;
        const btn = document.getElementById('ob-gen-btn');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<span>💬</span> 刷新彈幕`;
        }
    }

    // 模擬逐條顯示的效果
    async function addCommentsSequence(comments) {
        for (const comment of comments) {
            // 隨機延遲 200ms - 800ms，模擬真實彈幕速度
            await new Promise(r => setTimeout(r, Math.random() * 600 + 200));
            
            // 添加時間戳
            const now = new Date();
            comment.time = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
            
            STATE.comments.push(comment);
            renderOneComment(comment);
        }
    }

    // === 4. UI 渲染 ===

    function launch(container) {
        STATE.container = container;
        renderStructure();
        
        // 如果沒有歷史彈幕，顯示空狀態
        if (STATE.comments.length === 0) {
            renderEmptyState();
        } else {
            // 恢復歷史彈幕
            STATE.comments.forEach(c => renderOneComment(c));
        }
    }

    function renderStructure() {
        if (!STATE.container) return;
        
        STATE.container.innerHTML = `
            <div class="ob-container">
                <div class="ob-header">
                    <div class="ob-btn-icon" onclick="window.PhoneSystem.goHome()">‹</div>
                    <div class="ob-title">
                        <span>💬</span> 彈幕助手 <span class="ob-status">LIVE</span>
                    </div>
                    <div class="ob-btn-icon" onclick="window.OS_BARRAGE.toggleScroll()">⇩</div>
                </div>

                <div class="ob-list-area" id="ob-list">
                    </div>

                <div class="ob-footer">
                    <button class="ob-btn-clear" onclick="window.OS_BARRAGE.clearAll()" title="清空彈幕">🗑️</button>
                    <button class="ob-btn-main" id="ob-gen-btn" onclick="window.OS_BARRAGE.generate()">
                        <span>💬</span> 刷新彈幕
                    </button>
                </div>
            </div>
        `;
    }

    function renderEmptyState() {
        const list = document.getElementById('ob-list');
        if (list) {
            list.innerHTML = `
                <div class="ob-empty">
                    <div class="ob-empty-icon">📡</div>
                    <div>連接上輿論網絡...</div>
                    <div style="font-size:12px;">點擊下方按鈕獲取當前反應</div>
                </div>
            `;
        }
    }

    function renderOneComment(comment) {
        const list = document.getElementById('ob-list');
        if (!list) return;

        // 移除空狀態
        const empty = list.querySelector('.ob-empty');
        if (empty) empty.remove();

        const item = document.createElement('div');
        item.className = `ob-item type-${comment.type || 'neutral'}`;
        item.innerHTML = `
            <div class="ob-user-row">
                <span class="ob-username">${comment.user}</span>
                <span class="ob-time">${comment.time}</span>
            </div>
            <div class="ob-content">${comment.content}</div>
        `;
        
        list.appendChild(item);

        // 自動捲動
        if (STATE.autoScroll) {
            list.scrollTop = list.scrollHeight;
        }
    }

    function clearAll() {
        STATE.comments = [];
        const list = document.getElementById('ob-list');
        if (list) list.innerHTML = '';
        renderEmptyState();
    }

    function toggleScroll() {
        STATE.autoScroll = !STATE.autoScroll;
        const list = document.getElementById('ob-list');
        if (list && STATE.autoScroll) {
            list.scrollTop = list.scrollHeight;
            if (win.toastr) win.toastr.info('已開啟自動捲動');
        } else {
            if (win.toastr) win.toastr.info('已關閉自動捲動');
        }
    }

    // === 5. 導出接口 ===
    win.OS_BARRAGE = {
        launch,
        generate: generateBarrage,
        clearAll,
        toggleScroll
    };

})();