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

    const doc = window.parent.document || document;
    if (!doc.getElementById('os-barrage-css')) {
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