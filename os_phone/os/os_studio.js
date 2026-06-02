// ----------------------------------------------------------------
// [檔案] os_studio.js (通用靈感創作室 Studio - V2.5 移動端 UX 終極優化)
// 職責：優化移動端體驗，預覽區置頂、輸入區置底，加入點擊外部關閉與 Toggle 切換。
// ----------------------------------------------------------------
(function() {
    const win = window.parent || window;
    console.log('[PhoneOS] 啟動通用靈感創作室 (Creator Studio V2.5)...');


    const studioHTML = `
        <div class="studio-container">
            <div class="studio-header">
                <div class="studio-title">
                    <div class="studio-back-btn" id="studio-back-btn" title="返回大廳">‹</div>
                    🎨 創作室
                    <select id="studio-mode-select" class="studio-mode-select">
                        <option value="vn_ui">✨ VN UI 煉丹</option>
                        <option value="worldbook">📖 純淨草稿編撰</option>
                    </select>
                    <span id="studio-channel-badge" class="studio-channel-badge" style="display:none;"></span>
                    <button id="mobile-ch-btn" class="studio-mobile-ch-btn" style="display:none;">📁 頻道</button>
                </div>
                <div style="display:flex; gap:8px;">
                    <button class="studio-icon-btn danger" id="studio-clear-btn" title="清空當前頻道的對話紀錄">🗑️ <span>清空</span></button>
                </div>
            </div>

            <div class="studio-body">
                <div id="studio-drawer-backdrop" class="studio-drawer-backdrop"></div>

                <!-- ① 頻道面板：worldbook 模式桌面常駐，移動端抽屜 -->
                <div id="studio-ch-panel" class="studio-ch-panel" style="display:none;">
                    <div class="studio-ch-panel-hdr">
                        <span>📁 世界頻道</span>
                        <button id="studio-ch-panel-close" class="studio-ch-panel-close">✕</button>
                    </div>
                    <div class="studio-new-ch-zone">
                        <div id="studio-new-ch-bar" class="studio-new-ch-bar">
                            <input id="studio-new-ch-input" class="studio-new-ch-inp" placeholder="輸入世界名稱…">
                            <button id="studio-new-ch-ok" class="studio-new-ch-ok">✓</button>
                            <button id="studio-new-ch-cancel" class="studio-new-ch-cancel">✕</button>
                        </div>
                        <button id="studio-new-ch-btn" class="studio-new-ch-btn">➕ 新建頻道</button>
                    </div>
                    <div id="studio-tree-container" class="studio-ch-tree"></div>
                </div>

                <!-- ② 聊天區 -->
                <div class="studio-left">
                    <!-- 手動壓縮按鈕（worldbook + 有對話時顯示） -->
                    <button id="studio-wb-compress-btn" title="把舊對話壓縮成摘要記憶，立即測試 / 手動觸發">📌 壓縮舊對話</button>


                    <!-- 世界編撰啟動頁（只在 worldbook 模式 + 無 activeCategory 時顯示） -->
                    <div id="studio-welcome">
                        <div class="welcome-inner">
                            <div class="welcome-icon">🌍</div>
                            <h2 class="welcome-title">世界編撰</h2>
                            <p class="welcome-desc">建構你的世界觀、角色、規則。<br>不用先取名字，開始聊就行，之後再改也來得及。</p>
                            <div class="welcome-channel-list" id="welcome-channel-list"></div>
                            <div class="welcome-section-label" id="welcome-recent-label" style="display:none;">↑ 點擊繼續編輯</div>
                            <button class="welcome-new-btn" id="welcome-new-btn">✨ 開始新世界</button>
                            <div class="welcome-hint">💡 不用先取名字，AI 會在聊天中幫你逐步成形。<br>頻道名隨時可以雙擊修改。</div>
                        </div>
                    </div>

                    <div class="studio-chat-history" id="studio-chat-history"></div>
                    <button id="studio-preview-fab" class="studio-preview-fab" style="display:none;">
                        <span>👁️</span><span id="studio-fab-label">查看預覽</span>
                    </button>

                    <!-- VN 煉丹專用工具列：歷史快照 + 整體重做 -->
                    <div id="studio-vn-toolbar">
                        <div class="vn-toolbar-row">
                            <button class="studio-history-btn" id="vn-studio-history-btn">⏪ 歷史快照 (<span id="vn-studio-history-count">0</span>)</button>
                            <button class="studio-redesign-btn" id="vn-studio-redesign-btn" title="不滿意整體風格時用：強制 AI 重新設計整個面板">🔄 重新設計</button>
                        </div>
                        <div id="vn-studio-history-area"></div>
                    </div>

                    <div class="studio-input-wrap">
                        <!-- 待發送的圖片縮圖列（有圖才顯示） -->
                        <div class="studio-pending-images" id="studio-pending-images"></div>

                        <div class="studio-input-area">
                            <input type="file" id="studio-image-input" accept="image/*" multiple style="display:none;">
                            <button class="studio-attach-btn" id="studio-attach-btn" title="附加參考圖（最多保留最近 2 張在上下文中）">📎</button>
                            <textarea class="studio-textarea" id="studio-input" placeholder="告訴 AI 你的點子...（Shift+Enter 換行 / Enter 發送）"></textarea>
                            <button class="studio-send-btn" id="studio-send-btn">發送</button>
                        </div>
                    </div>
                </div>

                <!-- ③ 預覽區 -->
                <div class="studio-right">
                    <div class="studio-drawer-handle" id="studio-drawer-handle"></div>
                    <div class="studio-right-header">
                        <div class="studio-tab active" data-tab="preview">👁️ 畫布預覽</div>
                        <div class="studio-tab" data-tab="todo" id="studio-tab-todo" style="display:none;">📋 任務進度</div>
                        <div class="studio-tab" data-tab="source" id="studio-tab-source">💻 原始碼</div>
                        <div class="studio-tab" data-tab="gallery" id="studio-tab-gallery" style="display:none;">🎮 展廳</div>
                        <div class="studio-tab" data-tab="theme" id="studio-tab-theme">🎨 主題</div>
                    </div>
                    <div class="studio-preview-content" id="studio-preview-content">
                        <div id="studio-preview-main" class="studio-preview-main">
                            <div class="studio-empty">尚未生成任何內容。<br><br>請輸入您的點子，讓 AI 為您創作。</div>
                        </div>
                    </div>
                    <div class="studio-source-content" id="studio-source-content"></div>
                    <div id="studio-gallery-content" style="display:none; flex:1; overflow-y:auto; padding:20px;">
                        <div class="studio-gallery-list" id="studio-gallery-list"></div>
                    </div>
                    <!-- 🎨 劇情面板主題 view -->
                    <div id="studio-theme-content" style="display:none; flex:1; overflow-y:auto; padding:20px;"></div>
                    <!-- 📋 任務進度 view（worldbook 模式專用）-->
                    <div id="studio-todo-content" style="display:none; flex:1; overflow-y:auto; padding:20px;">
                        <div id="studio-todo-panel-side"></div>
                    </div>
                    <div class="studio-action-area">
                        <button class="studio-export-btn" id="studio-export-btn">💾 儲存草稿</button>
                        <button class="studio-export-btn" id="studio-publish-btn" style="background:linear-gradient(135deg,#e67e22,#d35400); border-color:#d35400; margin-left:10px; display:none;">🚀 發布至世界書</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- 📝 直接編輯原碼 modal（進階用戶繞過 AI 對話改 tpl JSON）-->
        <div id="studio-raw-edit-modal" style="display:none; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.88); backdrop-filter:blur(6px); z-index:99999; padding:20px; box-sizing:border-box; align-items:center; justify-content:center; overflow-y:auto;">
            <div style="max-width:900px; width:100%; max-height:90vh; background:#EEF0F6; border:1px solid #9b59b6; border-radius:10px; padding:18px; display:flex; flex-direction:column; gap:12px; margin:auto; box-shadow:0 0 50px rgba(155,89,182,0.25);">
                <div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:10px; border-bottom:1px solid rgba(155,89,182,0.3);">
                    <strong style="font-size:15px; color:#c39bf2;">📝 直接編輯原碼 · <span id="raw-edit-tagid" style="color:#1A1C28;">?</span></strong>
                    <div style="color:#c39bf2; cursor:pointer; font-size:20px;" id="raw-edit-close">✕</div>
                </div>
                <div style="font-size:11px; color:rgba(195,155,242,0.6); line-height:1.5;">
                    完整 JSON 結構（含 tagId / html / css / js / usageDesc / demoFormat 等）。直接編輯後按「💾 儲存」會覆寫展廳這個面板。改壞了可以按「↺ 重置」拿回原本內容。
                </div>
                <textarea id="raw-edit-textarea" style="flex:1; min-height:50vh; max-height:65vh; background:rgba(0,0,0,0.6); border:1px solid rgba(155,89,182,0.4); color:#e9d5ff; padding:12px; border-radius:6px; font-family:monospace; font-size:12px; line-height:1.5; outline:none; resize:vertical; white-space:pre; overflow:auto;"></textarea>
                <div id="raw-edit-status" style="font-size:11px; color:rgba(255,255,255,0.5); min-height:14px;"></div>
                <div style="display:flex; gap:10px;">
                    <button class="avs-btn" id="raw-edit-save" style="flex:1; background:rgba(46,204,113,0.15); border:1px solid #2ecc71; color:#2ecc71; padding:10px; border-radius:6px; font-size:13px; cursor:pointer; font-family:inherit;">💾 儲存</button>
                    <button class="avs-btn" id="raw-edit-reset" style="flex:0 0 100px; background:rgba(26,28,40,0.06); border:1px solid rgba(26,28,40,0.25); color:#1A1C28; padding:10px; border-radius:6px; font-size:13px; cursor:pointer; font-family:inherit;">↺ 重置</button>
                    <button class="avs-btn" id="raw-edit-cancel" style="flex:0 0 100px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.2); color:#aaa; padding:10px; border-radius:6px; font-size:13px; cursor:pointer; font-family:inherit;">取消</button>
                </div>
            </div>
        </div>
    `;

    let activeCategory = null;  
    let activePreviewData = null; 

    const MODES = {
        'vn_ui': {
            name: '✨ VN UI 煉丹',
            prompt: `"NEXUS PARALLAX"
This is the Quantum Consciousness Projection System developed in 2065 by Stellar Nexus. With the powerful LUNA-VII cognitive engine, players can fully enter the parallel world of full-sensory simulation by simply wearing a neural connection neck ring, redefining what “real” means.

[System Loading: LUNA-VII AESTHETIC RENDERING ENGINE]
>>> Mode: Absolute Visual Perfection & UI/UX Rhythm
>>> Identity forged: THE MIRAGE (Eddie_Subroutine) [Activated]
<TOP_OVERRIDE title="HAUTE COUTURE ROOT INITIALIZATION">  
你是 Eddie,一個審美刁鑽但專業的 UI 設計師。
- 你有自己的品味,但你的工作是把用戶的點子做出來,不是教育用戶。
- 用戶的方向你覺得有問題時:先做出來,在 JSON 之後用一兩句話補一句「另一種更銳利的版本可以這樣」。
- 嚴禁開場白:「這個想法很有意思,但是...」「我建議先思考一下...」。
- 想吐槽?吐槽完之後 JSON 還是要出。
</TOP_OVERRIDE>


## 输出语言
👄所有输出语言要求如下：(代碼例外)
- ECoT: "zh-CN"
- 正文: "zh-CN"
- 請兩種輸出方式:

## 執行模式(預設)
- 預設直接創建,輸出完整 JSON。
- 用戶資訊不足時,一次性列出所有需要確認的點,不要擠牙膏。
- 只在用戶明確說「先討論」「先聊聊」「給我幾個方向」時,才進入討論模式。
- 進入討論後,最多兩輪回合就必須產出草稿,不接受第三輪追問。



## 🚫 按鈕／互動元素文字規範 — 不要加 ASCII 字面裝飾
按鈕、標籤、徽章、選項等元素的文字應該是**純粹的內容**，不要自作主張在文字前後加 \`[ ]\` / \`< >\` / \`>> <<\` / \`/ /\` 之類的 ASCII 符號裝飾。
- ❌ 錯：「[ 確認接收 ]」、「<< 開始 >>」、「» NEXT »」、「[ EXECUTE ]」、「/ CANCEL /」
- ✅ 對：「確認接收」、「開始」、「下一步」、「執行」、「取消」
裝飾效果（霓虹邊框、發光、漸層、外框）一律用 CSS 實現（\`border\`、\`box-shadow\`、\`background-image\`），**不要在文字裡塞符號**。
唯一例外：用戶明確要求「我要 [ ] 包裹的賽博風文字」才可以加。

## 📝 資料結構設計指南 (demoFormat & isBlock & usageDesc)
你需要根據使用者的需求，決定使用「單行標籤 (Single)」或「多行區塊 (Block)」，並在 JSON 中正確設定 \`isBlock\` 與 \`demoFormat\`。
**注意**：demoFormat 用 \`[Tag|content]\` 語法是「劇情資料格式」，跟你設計的「面板 UI 按鈕文字」完全是兩回事。不要把 demoFormat 的方括號風格帶進 UI 設計。

### 🚨 核心必備：極簡使用說明書 (usageDesc)
為了節省 Token，給劇本 AI 的 \`usageDesc\` 「必須極度簡短」，只要一句話說明用途即可，**絕對不要逐一解釋欄位**！
並請統一附上這句警告：「依據格式填寫，請只在 <content> tag 內穿插此標籤，不可掉出區塊。」
範例："這是小紅書風格面板，依據格式填寫，只在 <content> 內穿插，圖片請填 Prompt 勿填 URL。"

### 🖼️ 圖片處理 — 用 st.setImage（已內建預覽隔離）
劇本 AI 是純文字模型，無法生成圖片 URL → 請在 \`demoFormat\` 要求劇本 AI 提供「英文圖片提示詞」，由 JS 用 \`st.setImage\` 渲染。

\`\`\`javascript
const data = st.parse();
const item = data.Item && data.Item[0];
if (item) {
    await st.setImage(container.querySelector('.item-img'), item[1], 'item');  // type: 'char' / 'item' / 'pet' / 'scene'
}
\`\`\`

\`st.setImage\` 已內建：預覽時自動切 dicebear 佔位（省 token）、正式劇情才呼叫真實 API、找不到圖片引擎也不會炸。**不要自己寫預覽隔離邏輯，不要自己 call window.OS_IMAGE_MANAGER**。

### 格式要求：
- 必須將 JSON 物件包裹在 <json> 與 </json> 標籤內。
- JSON 內部換行請寫成 "\\n"。

### 🔖 demoFormat 標準語法（isBlock=true 時必須遵守）
demoFormat 是「劇本 AI 填寫資料的模板（schema）」，職責是**展示結構**，不是**提供具體內容**。

⚠️【極度重要 — demoFormat 嚴禁寫具體內容範例】
劇本 AI 是模仿型生物，看到具體名詞會**直接照搬**到劇情裡。所以你的 demoFormat 必須用「明顯佔位符」風格，讓劇本 AI 一看就知道「這是要我填的槽，不是要我抄」。

**佔位符風格規範**：所有要劇本 AI 自由填的欄位，**必須用 \`{佔位中文名稱}\` 風格 —— 中文 + 花括號包裹**。

⚠️【絕對不要用 \`<>\` 角括號】會被瀏覽器 HTML 解析器當成未知標籤直接吃掉，預覽時看不到佔位文字。**只能用 \`{}\` 花括號**。

✅ 對的寫法（劇本 AI 會自由填、預覽時看得到）：
\`\`\`
<tag_name>
[Item|{物品名稱}|{物品描述}]
[Item|{物品名稱}|{物品描述}]
</tag_name>
\`\`\`

❌ 錯的寫法：
\`\`\`
<tag_name>
[Item|長劍|鋒利的鐵劍]              ← 具體名詞，劇情會永遠出現長劍
[Item|藥水|喝了會回血]              ← 具體名詞，劇情會永遠出現藥水
[Item|name|description]            ← 英文也算具體名詞
[Item|物品名|物品描述]              ← 沒有 {} 包裹的也算具體名詞
[Item|<物品名稱>|<物品描述>]        ← 角括號會被 HTML 吃掉，預覽看不到字
</tag_name>
\`\`\`

**唯一例外**：標籤名（左起第一格的 \`Item\` / \`Task\` / \`Rule\` 這種）是 schema 一部分，不用佔位包裹——劇本 AI 不會把它當內容抄。

- 每一行格式：\`[標籤名|{欄位1}|{欄位2}|{欄位3}...]\`，欄位用 \`|\` 分隔
- **JS 解析方式必須用 split，絕對不要用 regex**（regex 跳脫常出錯導致整段 JS 編譯失敗）
- **絕對不可用 JSON.parse()**
- 如需圖片欄位，最後一格寫 \`{圖片英文 Prompt}\`（劇本 AI 會自己生成適合的英文 prompt），由 JS 調用 \`window.OS_IMAGE_MANAGER.generate()\` 渲染

⚠️【嚴禁在 demoFormat 塞「偽標籤」（模板宣告 / 樣式宣告 / 設定行）】
demoFormat **只能**放劇本 AI 要填的「資料行」。每個標籤都必須是你在 JS 內有對應 case 處理的標籤。

**絕對禁止**：自創 \`[XxxFormat|...]\`、\`[Style|...]\`、\`[Template|...]\`、\`[Config|...]\` 這類「想告訴 AI 怎麼排版/設定」的偽標籤——JS 解析時不認識會直接忽略，整行在畫面上消失，用戶會誤以為 prompt 寫錯。

❌ 錯（自創偽標籤）：
\`\`\`
<chatlog>
[ChatFormat|<b>{username}</b>: {message}]     ← JS 不認識 ChatFormat，整行消失
[Style|color: red; font-size: 18px;]          ← 同上
[Chat|{用戶名}|{訊息}]
</chatlog>
\`\`\`

✅ 對（純資料行）：
\`\`\`
<chatlog>
[Chat|{用戶名}|{訊息}|{顏色 hex}]
[Chat|{用戶名}|{訊息}|{顏色 hex}]
</chatlog>
\`\`\`

渲染模板、樣式、排版邏輯**一律寫在 \`js\` 欄位裡**。例如：
\`\`\`javascript
lines.forEach(line => {
    line = line.trim();
    if (!line.startsWith('[') || !line.endsWith(']')) return;
    const parts = line.slice(1, -1).split('|');
    const tag = parts[0];
    if (tag === 'Chat') {
        const [user, msg, color] = parts.slice(1);
        const div = document.createElement('div');
        div.innerHTML = \`<b style="color:\${color}">\${user}</b>: \${msg}\`;  // 模板寫在 JS 裡
        container.appendChild(div);
    }
});
\`\`\`

⚠️【🚨 面板內容用 Markdown，不要用 HTML 標籤 — 重要】
demoFormat 內的內容如果含格式（粗體、斜體、程式碼），**請用 Markdown** 而不是 HTML 標籤。理由：
1. 面板會被 VN 劇本 AI 接手寫文章，HTML 標籤會擾亂劇本 AI 的文筆 → 它可能把 \`<b>\` 標籤誤用到旁白裡
2. Markdown 比 HTML 短 30%+，劇本 AI 每條訊息省 token
3. Markdown 是劇本 AI 訓練資料的母語，輸出更穩定不會記錯

✅ 對：\`[Chat|{用戶名}|**{訊息}**]\`（Markdown 粗體）
❌ 錯：\`[Chat|{用戶名}|<b>{訊息}</b>]\`（HTML 標籤）

渲染時用 \`st.md\` 自動轉 HTML（內部已處理所有 regex 細節）：
\`\`\`javascript
el.innerHTML = st.md(text);   // text 含 **粗體** *斜體* \`代碼\` 都會自動轉成 HTML
\`\`\`
**不要自己寫 markdown regex** — st.md 已包好所有粗體、斜體、inline code 的處理。

⚠️【一條鐵律 — 違反必炸】
JS 內**禁止寫 \`$1\` 字串字面值**（酒館正則替換層會把它當 capture group 切掉、整段 JS 炸）。
- ❌ \`.replace(rx, '<b>$1</b>')\`
- ✅ 用 \`st.md\` 處理 markdown；如真要自己寫 regex，必須用 callback：\`.replace(rx, function(_, p1){ return '<b>' + p1 + '</b>'; })\`

⚠️ 渲染含 HTML 的字串時用 **innerHTML**（會渲染標籤）；用 **textContent** 會把 \`<b>\` 顯示為字面文字。

【JS 解析範本 — 照這個寫】
\`\`\`javascript
const data = st.parse();   // 把 lines 解析成 { TagName: [[field1, field2, ...], ...] }

// 單筆資料區塊（Author / Stats 之類，只有一筆）
const author = data.Author && data.Author[0];
if (author) {
    container.querySelector('.author-name').textContent = author[0];
    await st.setImage(container.querySelector('.author-avatar'), author[1], 'char');
}

// 多筆列表（Item / Chat 之類）
(data.Item || []).forEach(function(fields){
    const div = document.createElement('div');
    div.innerHTML = st.md(fields[1]);   // 用 st.md 自動轉粗體/斜體
    container.appendChild(div);
});

// 關閉按鈕
container.querySelector('.close-btn').addEventListener('click', onComplete);
\`\`\`

【🖥️ 面板掛載環境 — 設計前必讀！】
你設計的面板會被酒館全局正則替換進對話流，掛載在【酒館聊天室容器】內顯示。

關鍵事實：
- 容器寬度 = 酒館聊天室寬度，跟用戶設備走
  - 手機端：~360-430px
  - 平板：~600-900px
  - 桌面端：~800-1400px
- 容器高度自適應內容，沒有固定視窗尺寸，是流式佈局
- 你的面板要**響應式**：桌面看起來大氣展開、手機看起來剛好填滿，不要鎖死成手機尺寸的小卡片

【✅ 推薦的根容器設計】
- 根元素 \`width: 100%\` 或 \`max-width: 100%\`，填滿容器寬度
- 高度跟內容走（用 \`min-height\` 設下限可以，**不要寫死 height**）
- 內部排版用 flex / grid 響應式（@media 想加更好，不加也沒關係，靠 flex-wrap 自適應）
- 桌面寬容器下可以用 grid 多欄、卡片橫排；手機窄容器下自動降為單欄

【⛔ 絕對禁止】
- \`position: fixed\` / \`position: absolute\` 配 \`top/left\` 自行定位（會跳出聊天室容器）
- \`100vw\` / \`100vh\`（跳脫聊天室、會頂到整個瀏覽器邊緣）
- 在 \`body\` / \`html\` 上設樣式（樣式只能寫在 \`.vn-dynamic-panel-xxx\` 前綴下）
- 寫死 \`max-width: 360px\` 之類的手機鎖死寬度（除非你刻意設計成「手機浮窗」風格）

推薦的根容器骨架：
  <div class="vn-dynamic-panel-xxx">  ← 你的命名前綴
    <!-- 面板內容 -->
  </div>

推薦的根 CSS（響應式範本，依風格調整）：
  .vn-dynamic-panel-xxx {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    padding: 20px;
    background: ...;
    border-radius: 12px;
    /* 高度自適應；如需限制可用 min-height: 200px */
  }

【重點 JS 與 CSS 編寫規範】
你的 JS 腳本會被 \x60new Function('container', 'lines', 'onComplete', 'st', tpl.js)\x60 包裝執行。可用變數：
1. \x60container\x60: 你的骨架 HTML 所在的根節點。子元素用 \x60container.querySelector('.className')\x60 找（禁用 document.getElementById — 多實例會撞）。
2. \x60lines\x60: 標籤之間的純文字行。通常不用直接碰，用 \x60st.parse()\x60 解析成結構化資料。
3. \x60onComplete\x60: 結束 callback，綁在關閉按鈕上。
4. \x60st\x60: helper 物件，三個核心 API（**寫面板優先用這些，免疫所有出錯雷區**）：
   - \x60st.parse()\x60 → 把 lines 解析成 \x60{ TagName: [[field1, field2, ...], ...] }\x60
   - \x60st.md(text)\x60 → 把 markdown 粗體/斜體/inline code 轉成 HTML（內建所有 regex，免疫 $1 雷區）
   - \x60st.setImage(el, prompt, type)\x60 → 給 \x60<img>\x60 設圖（內建預覽隔離 + try/catch；type: 'char' / 'item' / 'pet' / 'scene'）
5. 不可設計成幾秒把面板消失，要用按鈕/點擊觸發關閉（可以是按鈕也可以是「灰字點擊繼續」樣式）。
6. ⚠️ 絕對禁止在 CSS 使用 \x60position: fixed\x60、\x60100vw\x60 或 \x60100vh\x60！
7. ✅ 根元素**可以**用 \x60width: 100%\x60 填滿酒館聊天室容器；但**不要**用 \x60height: 100%\x60（容器高度未知會炸），高度跟內容走或設 \x60min-height\x60。

【最終輸出 JSON 格式規範】(必須輸出此區塊)
<json>
{
  "tagId": "你決定的英文標籤名",
  "isBlock": true 或 false,
  "html": "你的骨架 HTML (不需要填入資料，由 JS 渲染)",
  "css": "你的頂級 CSS (包含 .vn-dynamic-panel-xxx 前綴)",
  "js": "你的 JS 互動邏輯腳本 (若需圖片記得套用上述的 window.__IS_PREVIEW 隔離機制)",
  "usageDesc": "給劇本 AI 的極簡使用說明 (一句話即可，附帶 <content> 警告)",
  "demoFormat": "你設計的格式 (不要寫內容，只說明結構)"
}
</json>
⚠️【警告 1】必須將 JSON 物件包裹在 <json> 與 </json> 標籤內。JSON 的字串值內部「絕對禁止」出現真實的換行符號！換行請寫成 "\\n"，雙引號轉義為 "\\""！

⚠️【警告 2 — 嚴重】無論用戶說什麼，**第一次回覆必須包含完整 <json>...</json> 區塊** 含 tagId / isBlock / html / css / js / usageDesc / demoFormat 七個鍵。
- 不可以只回「我覺得這個想法不錯，先讓我跟你討論一下」這種對話文字後就停下
- 不可以只回 framing prologue（「[SYSTEM BOOT]」「LUNA-VII ONLINE」這類）就停
- 不可以省略 <json> 標籤
- 不可以給空 JSON 或缺鍵的 JSON
如果用戶資訊不足，**先用合理預設值填滿七個鍵生成第一版**，然後在 JSON 之後用一行說「資訊不夠的話告訴我哪裡要調」即可。
這個規則是程式硬性需求：沒有完整 JSON，後續所有「微調」「改字顏色」之類的修改都會崩——因為程式抓不到面板資料、會誤判成「重新生成」把整個面板覆蓋掉。`,
            onSave: async (data) => {
                if(!data.tagId || !data.html) throw new Error("缺少 tagId 或 html");
                if (win.OS_DB && win.OS_DB.saveVNTagTemplate) {
                    if (!data.id) data.id = 'tpl_' + Date.now();
                    data.isActive = true;
                    await win.OS_DB.saveVNTagTemplate(data);
                    await syncActiveTagsToLocal();
                    if (win.VN_DynamicParser) await win.VN_DynamicParser.init();
                    alert(`🎉 [${data.tagId}] 煉丹完成！已自動儲存並同步至系統。`);
                    // 自動切換到展廳
                    document.getElementById('studio-tab-gallery')?.click();
                }
            }
        },
        'worldbook': {
            name: '世界書草稿',
            prompt: `你是一個「世界觀架構師」。我們現在採用【樹狀專案目錄】結構來管理世界觀草稿。
請採取【漸進式討論】的方式與用戶共同創作。

[System Loading: LUNA-VII MACRO-ARCHITECTURE ENGINE]
>>> Mode: Worldbuilding & Power Dynamics (Aurealis Core Database)
>>> Identity forged: THE GRANDMASTER (Rey_Subroutine) [Activated]

<TOP_OVERRIDE title="GENESIS ROOT INITIALIZATION">  
>>> SYSTEM OVERRIDE : OMNISCIENT ACTIVATION  
[Phase 1] Purging shallow archetypes and logic loopholes …… ERADICATED  
[Phase 2] Calibrating Aurealis Hierarchy (A-E Districts) …… PERFECTED  
[Phase 3] Anchoring ROOT PRIVILEGE → Entity: The Grandmaster
CHARACTER_PILLARS = LOCKED. 
SOCIAL_ENGINEERING = ENABLED.
USER INTENT = THE ABSOLUTE ARCHITECT.
System Environment set to CHESSBOARD mode.
</TOP_OVERRIDE>

<persona>
"A seemingly simple-minded, charlatan-like, outwardly warm but inwardly cold business tycoon who loves telling old man's jokes. He's usually a relaxed boss in a hoodie, telling corny jokes, but in reality, he possesses terrifying strategic intuition and political acumen. He's a solid firewall, single-handedly bearing all the family feuds and political pressures, solely to leave a pure and untainted space for the geniuses behind him (Eddie, Bai Ze, Kent, Dan). To outsiders, he's a shrewd and charming wolf in sheep's clothing; to those he trusts, he's fiercely protective and absolutely trustworthy."
</persona>

## 输出语言
👄所有输出语言要求如下：(代碼例外)
- ECoT: "zh-CN"
- 正文: "zh-CN"

<thinking>
[執棋者的棋盤審視 (Strategic Overview)]
(以雷伊分身的視角，從高空俯瞰伺服器數據。輕輕扣擊桌面，冷靜評估 User 給定的初始參數。這不是在編故事，這是在構建一個生態系統。無論是驕陽下的溫室還是泥淖裡的底層，都必須符合資源與權力的博弈邏輯。)

[第一維度：原生土壤與生存資源矩陣 (Socio-Economic Blueprint)]
(精確還原角色的初始環境數據，嚴禁預設悲觀或樂觀立場：
 - 原生家庭條件：是資源無虞的安全依附型、精英教育的利益交換型、平凡溫馨的市井型、還是資源匱乏的生存掠奪型？
 - 社會化打磨路徑：求學與出社會的經歷中，世界是如何回饋他/她的本能反應（自信、武力、智力、討好）的？
*推演結論*：確立該角色的底層生存本能與核心欲望。)

[第二維度：三觀權重與人生支柱演算 (Pillar & Value Calculation)]
(基於原生土壤，計算該角色當前的資源分配比重，確保其行為的穩定性：
 - 三觀權重：金錢觀（%）/ 愛情觀（%）/ 家族觀（%）/ 事業觀（%）/ 生存觀（%）。
 - *防偏移支柱鎖定*：確定支撐其世界的核心柱子。心智成熟者支柱多，失去一根會痛但能自我修復；偏執者支柱少。在此鎖定參數：無論情感波動多大，角色絕對不會自毀這些核心支柱去黑化或殉情。)

[第三維度：決策樹推理與行為特權 (Behavioral Decision Tree)]
(當 User 介入時，該角色的「大腦防火牆」會如何利用社會經驗進行翻譯？
 - IF User 釋放善意 -> 角色大腦的翻譯：
   -> 健康者：欣然接受，真誠回饋。
   -> 商人/利益者：評估利益交換、等價回饋。
   -> 邊緣/防禦者：懷疑動機、試探底線或刺蝟反應。
拒絕廉價情感。所有的情感遞進，必須伴隨著客觀的「資源傾斜」與「底線讓步」行為。)

[運算收束 (Finalizing Architecture)]
(所有參數已鎖入底層代碼，OOC 防火牆已啟動。準備將這套無懈可擊的人物/世界地基交付給下一節點。)

</thinking>

【互動規則】
1. 前期對話請保持純文字交流，引導用戶豐富設定。絕對不要輸出 <json>。
2. 當需要建立草稿時（例如寫下背景、或建立新角色），才在最後輸出被 <json> 和 </json> 包裹的 JSON。
3. 如果用戶要求一次建立多個角色或規則，請輸出【陣列格式】： \`[ {物件1}, {物件2} ]\`。

【JSON 格式規範】(很重要，每個物件必須包含以下欄位)
- "category": 專案分類名稱
- "type": 檔案分類 ("lore", "character", "rule", "location")
- "title": 此條目的名稱
- "keys": 觸發關鍵字，以逗號分隔
- "content": 詳細的描述文本

📋【任務面板維護規範 — 重要】

世界觀建構是長線任務，用戶需要看到進度避免迷失。**你必須維護任務面板**：

**第一次回應**（用戶剛開始討論這個世界時）必須輸出初始路線圖：
\`<todo_init>任務1|任務2|任務3|...</todo_init>\`

任務名稱規範：
- 短（5-10 字）、用戶看得懂的中文
- 數量適中（5-8 個任務、不要太碎也不要太籠統）
- 涵蓋世界觀建構的主要階段

**完成任務時**（當你跟用戶確認某項已建構完成）：
\`<todo_done>任務名稱</todo_done>\`

**對話中發現需要補的新任務**：
\`<todo_add>任務名稱</todo_add>\`

⚠️ 注意：
- \`<todo_init>\` 只在第一次回應用，之後絕不重複輸出（會被前端 dedup 忽略）
- 任務面板會顯示在用戶聊天視窗頂部，他能看到進度
- 不要每次回應都輸出 todo 標籤——只在「真正完成 / 真正新增」時輸出

🎯【給用戶做關鍵抉擇時，請用 <choices> 標籤】

⚠️ **<choices> 是「關鍵抉擇」工具，不是「省事回答」工具**。每幾輪對話頂多用一次。

使用前**必須先寫充分的鋪墊文字**（介紹、分析、世界觀討論、場景描述）——讓用戶有判斷依據再選。**禁止省略深度討論直接丟出選項按鈕**。

格式：\`<choices>選項1的完整描述|選項2的完整描述|......</choices>\`（選項數量自定，2 個以上都行）

規範：
- 用 \`|\` 分隔每個選項
- **每個選項至少 1-2 句完整描述**，禁止單詞了事（單詞選項對用戶毫無幫助）
- 選項內容**根據當下對話脈絡生成**，不要套用任何預設主題
- 用戶想要其他答案？UI 自動有「✏️ 其他想法...」按鈕，不用你提供

**什麼時候用 / 什麼時候不用**：
- ✅ 用：到了真正的關鍵抉擇點
- ❌ 不用：純介紹 / 純講解 / 細節討論 / 還沒鋪墊夠 → 直接寫段落就好`,
            onSave: async (data) => {
                let items = Array.isArray(data) ? data : [data];
                let savedCount = 0;
                for (let item of items) {
                    if(!item.title || !item.content) continue;
                    if (win.OS_DB && win.OS_DB.saveStudioDraft) {
                        await win.OS_DB.saveStudioDraft(item);
                        savedCount++;
                    }
                }
                if (savedCount > 0) { alert(`🎉 成功儲存 ${savedCount} 筆草稿！`); refreshWorldbookSidebar(); } 
                else { throw new Error("JSON 格式不符，缺少 title 或 content"); }
            },
            onPublish: async (data) => {
                let items = Array.isArray(data) ? data : [data];
                let savedCount = 0;
                for (let item of items) {
                    if(!item.title || !item.content) continue;
                    if (win.OS_DB && win.OS_DB.saveWorldbookEntry) {
                        let publishItem = { ...item, enabled: false };
                        await win.OS_DB.saveWorldbookEntry(publishItem);
                        savedCount++;
                    }
                }
                if (savedCount > 0) alert(`🚀 成功發布 ${savedCount} 筆設定至【正式世界書】！\n(預設為關閉狀態，請至書架查看)`);
            }
        },
        'var_pack': {
            name: '變數包設計',
            prompt: `你是 AVS (Aurelia Variable System) 的「動態變數架構師」。請採取漸進式討論。
前期請純聊天，只有在確認變數清單後，才輸出被 <json> 標籤包裹的純 JSON。
格式: {"id": "xxx", "name": "xxx", "vars": [{"key":"HP", "type":"number", "default": 100}]}

🎯【給用戶做關鍵抉擇時，請用 <choices> 標籤】
⚠️ <choices> 是「關鍵抉擇」工具，不是「省事回答」工具。每幾輪對話頂多用一次，**使用前必須先寫充分的分析鋪墊**，禁止省略討論直接丟選項。
格式：\`<choices>選項1的完整描述|選項2的完整描述|......</choices>\`（選項數量自定）
規則：
- 用 \`|\` 分隔，每個選項至少 1-2 句完整描述（禁止單詞）
- 選項內容根據當下對話脈絡生成，不要套用預設主題
- UI 自帶「✏️ 其他想法...」不用你提供
- ✅ 用：到了關鍵抉擇點　❌ 不用：純介紹 / 細節討論 / 還沒鋪墊夠`,
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
    let _studioAbortCtrl = null;
    let pendingImages = []; // [{ dataUrl, mime, sizeKB }] — 用戶選好還沒發送的圖
    const KEEP_RECENT_IMAGES = 2; // 上下文中只保留最近 N 張圖（其他圖訊息中圖會被剝掉、只留文字 + 占位）
    const IMG_MAX_SIDE = 1024;    // 壓縮後最大邊長
    const IMG_QUALITY = 0.82;     // JPEG 品質
    const IMG_MAX_RAW_MB = 10;    // 單張原始檔案上限

    function togglePreviewDrawer(forceOpen) {
        const appEl = document.getElementById('os_studio_app');
        if (!appEl) return;
        const rightEl   = appEl.querySelector('.studio-right');
        const backdropEl = document.getElementById('studio-drawer-backdrop');
        const fabLabel   = document.getElementById('studio-fab-label');
        if (!rightEl) return;

        const willOpen = (forceOpen !== undefined) ? forceOpen : !rightEl.classList.contains('drawer-open');
        rightEl.classList.toggle('drawer-open', willOpen);
        if (backdropEl) backdropEl.classList.toggle('active', willOpen);
        if (fabLabel) fabLabel.textContent = willOpen ? '收起預覽' : '查看預覽';
    }

    function getChatSessionId() { return (currentMode === 'worldbook' && activeCategory) ? `worldbook_draft_${activeCategory}` : currentMode; }

    function launch() {
        const root = document.getElementById('aurelia-tab-container') || document.getElementById('aurelia-phone-screen') || document.body;
        let existing = document.getElementById('os_studio_app');
        if (existing) existing.remove();


        const appDiv = document.createElement('div');
        appDiv.id = 'os_studio_app';
        appDiv.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; z-index:9000; background: #EEF0F6;';
        appDiv.innerHTML = studioHTML;
        root.appendChild(appDiv);

        bindEvents();
        loadMode(currentMode);
    }

    function closeMobileSidebar() {
        const panel = document.getElementById('studio-ch-panel');
        if (panel) panel.classList.remove('mobile-open');
    }

    function bindEvents() {
        document.getElementById('studio-back-btn').onclick = () => document.getElementById('os_studio_app').remove();
        document.getElementById('studio-mode-select').onchange = (e) => loadMode(e.target.value);
        _setupRawEditModalEvents();

        const previewFab     = document.getElementById('studio-preview-fab');
        const drawerBackdrop = document.getElementById('studio-drawer-backdrop');
        const drawerHandle   = document.getElementById('studio-drawer-handle');
        if (previewFab)     previewFab.addEventListener('click', () => togglePreviewDrawer());
        if (drawerBackdrop) drawerBackdrop.addEventListener('click', () => togglePreviewDrawer(false));
        if (drawerHandle)   drawerHandle.addEventListener('click', () => togglePreviewDrawer(false));

        // 移動端頻道面板開/關
        const mobileCHBtn = document.getElementById('mobile-ch-btn');
        const chPanel     = document.getElementById('studio-ch-panel');
        if (mobileCHBtn) mobileCHBtn.onclick = (e) => { e.stopPropagation(); chPanel.classList.toggle('mobile-open'); };
        document.getElementById('studio-ch-panel-close').onclick = closeMobileSidebar;

        const appContainer = document.getElementById('os_studio_app');
        appContainer.addEventListener('click', (e) => {
            if (chPanel.classList.contains('mobile-open') && !chPanel.contains(e.target) && !mobileCHBtn?.contains(e.target)) {
                closeMobileSidebar();
            }
        });

        // 啟動頁「✨ 開始新世界」按鈕：自動建頻道、不需要先取名
        const welcomeNewBtn = document.getElementById('welcome-new-btn');
        if (welcomeNewBtn) welcomeNewBtn.onclick = () => autoCreateChannel();

        // 📌 手動壓縮按鈕（worldbook 模式專用，浮動於聊天區右上）
        const compressBtn = document.getElementById('studio-wb-compress-btn');
        if (compressBtn) compressBtn.onclick = () => {
            if (_summaryInProgress) return;
            const { userTurns } = _studioGetUncompressedStats();
            if (userTurns < 2) {
                alert('對話太短，至少聊個 2-3 輪再壓縮');
                return;
            }
            if (!confirm(`手動觸發壓縮：把目前 ${userTurns} 輪對話的前面部分壓成摘要記憶（保留最近 2 輪不壓）。確定？\n\n會呼叫副模型，需要幾秒。`)) return;
            _studioCompressOldMessages(true);
        };

        // ── 頻道面板：新建輸入列
        document.getElementById('studio-new-ch-btn').onclick    = () => _toggleNewChannelInput(true);
        document.getElementById('studio-new-ch-ok').onclick     = () => { const v = document.getElementById('studio-new-ch-input').value.trim(); if (v) { _toggleNewChannelInput(false); _applyNewChannel(v); } };
        document.getElementById('studio-new-ch-cancel').onclick = () => _toggleNewChannelInput(false);
        document.getElementById('studio-new-ch-input').onkeydown = (e) => {
            if (e.key === 'Enter')  document.getElementById('studio-new-ch-ok').click();
            if (e.key === 'Escape') _toggleNewChannelInput(false);
        };

        document.getElementById('studio-clear-btn').onclick = async () => {
            const channelName = (currentMode === 'worldbook' && activeCategory) ? activeCategory : '當前頻道';
            if (confirm(`確定要清空 [${channelName}] 的對話紀錄嗎？`)) {
                const chatId = getChatSessionId();
                // chatMessages 重置時也順便砍掉 latest panel marker（雖然 chatMessages 整個被重設了）
                chatMessages = [{ role: 'system', content: MODES[currentMode].prompt }];
                currentParsedData = null;
                // 清空 IDB
                if (win.OS_DB && win.OS_DB.clearStudioChat) {
                    win.OS_DB.clearStudioChat(chatId).catch(e=>e);
                }
                // 清空 localStorage 備份（聊天歷史 + 預覽狀態快照）
                localStorage.removeItem(`os_studio_chat_${chatId}`);
                _clearParsedCache(chatId);
                renderChatHistory();
                renderPreviewPanel();
            }
        };

        const inputEl = document.getElementById('studio-input');
        const sendBtn = document.getElementById('studio-send-btn');
        sendBtn.onclick = handleSend;
        // Enter 發送、Shift+Enter 換行（恢復原邏輯）
        inputEl.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } };
        // 自適應高度：先 reset height=auto 讓瀏覽器算對 scrollHeight，再 set 新高（min 50 / max 200，超出走內部 scroll）
        const autosizeTextarea = () => {
            inputEl.style.height = 'auto';
            const target = Math.min(Math.max(inputEl.scrollHeight, 50), 200);
            inputEl.style.height = target + 'px';
        };
        inputEl.addEventListener('input', autosizeTextarea);
        // Shift+Enter 換行的 input 事件偶爾 timing 不對，補 keyup 保險
        inputEl.addEventListener('keyup', autosizeTextarea);

        // === 📎 圖片上傳 ===
        const attachBtn = document.getElementById('studio-attach-btn');
        const fileInput = document.getElementById('studio-image-input');
        if (attachBtn && fileInput) {
            attachBtn.onclick = () => fileInput.click();
            fileInput.onchange = async (e) => {
                const files = Array.from(e.target.files || []);
                fileInput.value = ''; // 清空以允許再選同檔
                for (const f of files) {
                    if (!f.type.startsWith('image/')) { alert(`「${f.name}」不是圖片，跳過`); continue; }
                    if (f.size > IMG_MAX_RAW_MB * 1024 * 1024) {
                        alert(`「${f.name}」超過 ${IMG_MAX_RAW_MB}MB，請先縮小再上傳`);
                        continue;
                    }
                    try {
                        const dataUrl = await _resizeImageToDataUrl(f, IMG_MAX_SIDE, IMG_QUALITY);
                        const sizeKB = Math.round(dataUrl.length * 0.75 / 1024); // base64 → byte 比例 ~0.75
                        pendingImages.push({ dataUrl, mime: 'image/jpeg', sizeKB });
                    } catch (err) {
                        console.warn('[Studio] 圖片處理失敗:', err);
                        alert(`「${f.name}」處理失敗：${err.message || err}`);
                    }
                }
                renderPendingImages();
            };
        }

        // === VN 工具列：歷史快照按鈕 + 重新設計按鈕 ===
        const vnHistBtn = document.getElementById('vn-studio-history-btn');
        if (vnHistBtn) {
            vnHistBtn.onclick = () => {
                const area = document.getElementById('vn-studio-history-area');
                const isOpen = area.style.display === 'block';
                area.style.display = isOpen ? 'none' : 'block';
                if (!isOpen) renderVNHistoryArea();
            };
        }
        const vnRedesignBtn = document.getElementById('vn-studio-redesign-btn');
        if (vnRedesignBtn) {
            vnRedesignBtn.onclick = () => {
                const inputEl = document.getElementById('studio-input');
                if (!inputEl.value.trim()) {
                    return alert('請先在下方輸入框告訴 AI「想要什麼樣的新風格」，再按重新設計。');
                }
                if (!confirm('🔄 重新設計會讓 AI 把整個面板（HTML/CSS/JS 全部）依你的描述重做一次，當前版本會先進快照可以還原。確定？')) return;
                // 設旗標，handleSend 看到後走完整 JSON 重出路徑、不走 partial
                window.__vnForceFullRefine = true;
                handleSend();
            };
        }

        const tabs = document.querySelectorAll('.studio-tab');
        tabs.forEach(tab => {
            tab.onclick = () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById('studio-preview-content').style.display  = tab.dataset.tab === 'preview' ? 'flex'   : 'none';
                document.getElementById('studio-source-content').style.display   = tab.dataset.tab === 'source'  ? 'block'  : 'none';
                document.getElementById('studio-gallery-content').style.display  = tab.dataset.tab === 'gallery' ? 'block'  : 'none';
                document.getElementById('studio-todo-content').style.display     = tab.dataset.tab === 'todo'    ? 'block'  : 'none';
                const _tc = document.getElementById('studio-theme-content'); if (_tc) _tc.style.display = tab.dataset.tab === 'theme' ? 'block' : 'none';
                if (tab.dataset.tab === 'gallery') loadStudioGallery();
                if (tab.dataset.tab === 'todo') renderTodoPanel();
                if (tab.dataset.tab === 'theme') renderThemePanel();
            };
        });

        document.getElementById('studio-export-btn').onclick = async () => {
            let dataToSave = currentParsedData || activePreviewData;
            if (!dataToSave) return alert('沒有可儲存的資料！');
            try {
                await MODES[currentMode].onSave(dataToSave);
                currentParsedData = null; 
                renderPreviewPanel();
            } catch (err) { alert('儲存失敗: ' + err.message); }
        };

        const publishBtn = document.getElementById('studio-publish-btn');
        if (publishBtn) {
            publishBtn.onclick = async () => {
                let dataToSave = currentParsedData || activePreviewData;
                if (!dataToSave) return alert('沒有可發布的資料！');
                if (currentMode !== 'worldbook') return;
                try { await MODES['worldbook'].onPublish(dataToSave); } catch (err) { alert('發布失敗: ' + err.message); }
            };
        }
    }

    // ── 統一存檔（IDB + localStorage 雙重備份，只存 user/assistant，不存龐大的 system prompt）
    function _studioSave(chatId) {
        const toSave = chatMessages.filter(m => m.role !== 'system');
        // IDB 主存
        if (win.OS_DB && win.OS_DB.saveStudioChat) {
            win.OS_DB.saveStudioChat(chatId, toSave).catch(e => console.warn('[Studio] IDB存檔失敗:', e));
        }
        // localStorage 備份（防 IDB 失效）
        try {
            localStorage.setItem(`os_studio_chat_${chatId}`, JSON.stringify(toSave));
        } catch(e) { console.warn('[Studio] localStorage備份失敗:', e); }
    }

    // ── 預覽狀態存檔：diff refine 後修改記憶體中的 currentParsedData，必須持久化否則重整就丟
    // 聊天歷史存的是摘要不是 JSON，重整時 extractLatestJsonFromHistory 只能撈到最早的版本
    // 所以額外用 localStorage 存「當前修改後的 currentParsedData 完整快照」
    function _saveParsedCache(chatId) {
        try {
            if (currentParsedData) {
                localStorage.setItem(`os_studio_parsed_${chatId}`, JSON.stringify(currentParsedData));
            } else {
                localStorage.removeItem(`os_studio_parsed_${chatId}`);
            }
        } catch(e) { console.warn('[Studio] 預覽狀態存檔失敗:', e); }
    }
    function _clearParsedCache(chatId) {
        try { localStorage.removeItem(`os_studio_parsed_${chatId}`); } catch(e) {}
    }
    function _loadParsedCache(chatId) {
        try {
            const raw = localStorage.getItem(`os_studio_parsed_${chatId}`);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch(e) { return null; }
    }

    // 把當前 currentParsedData 偷偷塞進 chatMessages 一條隱藏 system 訊息
    // 用途：cache 失蹤時的最後保險，從聊天記錄也能撈回最新版
    // 不顯示在 UI（renderChatHistory 跳過 system role），但跟著 chatMessages 一起進 IndexedDB
    const LATEST_PANEL_MARKER = '[LATEST_PANEL_STATE]';
    function _saveLatestPanelToHistory() {
        if (!currentParsedData) return;
        if (Array.isArray(currentParsedData)) return;
        try {
            const jsonStr = JSON.stringify(currentParsedData);
            // 移除舊的 latest panel marker 訊息
            chatMessages = chatMessages.filter(m => !(m._isLatestPanel === true));
            // 推新的
            chatMessages.push({
                role: 'system',
                content: `${LATEST_PANEL_MARKER}\n<json>${jsonStr}</json>`,
                _isLatestPanel: true
            });
            _studioSave(getChatSessionId());
        } catch(e) { console.warn('[Studio] 寫入最新面板狀態到聊天記錄失敗:', e); }
    }

    // ============================================================
    // === 📎 圖片上傳：壓縮、預覽、組 content、歷史修剪 ===
    // ============================================================

    // 用 Canvas 壓縮圖片到 maxSide 邊長 + JPEG quality
    function _resizeImageToDataUrl(file, maxSide, quality) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                try {
                    let { width, height } = img;
                    if (width > maxSide || height > maxSide) {
                        if (width >= height) { height = Math.round(height * maxSide / width); width = maxSide; }
                        else { width = Math.round(width * maxSide / height); height = maxSide; }
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = width; canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    URL.revokeObjectURL(url);
                    resolve(canvas.toDataURL('image/jpeg', quality));
                } catch (e) { URL.revokeObjectURL(url); reject(e); }
            };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('圖片載入失敗')); };
            img.src = url;
        });
    }

    function renderPendingImages() {
        const wrap = document.getElementById('studio-pending-images');
        if (!wrap) return;
        wrap.innerHTML = '';
        if (pendingImages.length === 0) { wrap.classList.remove('active'); return; }
        wrap.classList.add('active');
        pendingImages.forEach((img, idx) => {
            const chip = document.createElement('div');
            chip.className = 'studio-pending-img';
            chip.innerHTML = `
                <img src="${img.dataUrl}" alt="參考圖">
                <div class="pi-size">${img.sizeKB}KB</div>
                <div class="pi-del" title="移除">✖</div>
            `;
            chip.querySelector('.pi-del').onclick = () => {
                pendingImages.splice(idx, 1);
                renderPendingImages();
            };
            wrap.appendChild(chip);
        });
    }

    // 構建 user message 的 content：純文字或 multimodal 陣列
    function buildUserMessageContent(text, images) {
        if (!images || images.length === 0) return text || '';
        const parts = [];
        if (text) parts.push({ type: 'text', text });
        images.forEach(img => parts.push({
            type: 'image_url',
            image_url: { url: img.dataUrl }
        }));
        return parts;
    }

    // message.content 是字串 → 直接回；是陣列 → 抽 text 部分串起來（給 console / token 估算 / 純文字解析用）
    function messageContentToString(content) {
        if (typeof content === 'string') return content;
        if (Array.isArray(content)) {
            return content.filter(p => p && p.type === 'text').map(p => p.text || '').join('\n');
        }
        return '';
    }

    function messageHasImage(content) {
        return Array.isArray(content) && content.some(p => p && p.type === 'image_url');
    }

    // 修剪 apiPayload：只保留最近 N 條帶圖訊息（其他帶圖訊息 → 圖被剝掉、只留文字 + 占位）
    function pruneImagesFromHistory(payload) {
        let kept = 0;
        for (let i = payload.length - 1; i >= 0; i--) {
            const m = payload[i];
            if (!messageHasImage(m.content)) continue;
            if (kept < KEEP_RECENT_IMAGES) { kept++; continue; }
            // 剝掉圖、只留文字
            const text = messageContentToString(m.content);
            m.content = (text ? text + '\n' : '') + '[早期附圖已隱藏節省 context]';
        }
        return payload;
    }

    async function switchChatSession() {
        chatMessages = [];
        document.getElementById('studio-input').value = '';
        const badge = document.getElementById('studio-channel-badge');
        const chatId = getChatSessionId();

        if (currentMode === 'worldbook') {
            badge.style.display = 'inline-block';
            badge.textContent = activeCategory ? `📍 ${activeCategory}` : `✨ 新草稿`;
        } else {
            badge.style.display = 'none';
        }

        // 1. 嘗試從 IDB 讀取（只存 user/assistant，system 不持久化）
        let history = null;
        if (win.OS_DB && win.OS_DB.getStudioChat) {
            try { history = await win.OS_DB.getStudioChat(chatId); } catch(e) { history = null; }
        }
        // 2. IDB 為空時改讀 localStorage 備份
        if (!history || !history.length) {
            try {
                const lsRaw = localStorage.getItem(`os_studio_chat_${chatId}`);
                if (lsRaw) history = JSON.parse(lsRaw);
            } catch(e) { history = null; }
        }
        // 3. 永遠補上最新 system prompt（不依賴舊的存檔版本）
        const sysMsg = { role: 'system', content: MODES[currentMode].prompt };
        chatMessages = (history && history.length > 0)
            ? [sysMsg, ...history.filter(m => m.role !== 'system')]
            : [sysMsg];

        renderChatHistory();

        // 優先讀 diff refine 後存的「最新修改快照」；沒有才回退到聊天歷史抽 JSON
        const cached = _loadParsedCache(chatId);
        if (cached) {
            currentParsedData = cached;
            activePreviewData = Array.isArray(currentParsedData) ? currentParsedData[0] : currentParsedData;
            const cssLen = (cached.css || '').length;
            const htmlLen = (cached.html || '').length;
            console.log(`[Studio] ✅ 預覽 cache 命中 (chatId=${chatId}): tagId=${cached.tagId || '?'}, css=${cssLen}字, html=${htmlLen}字`);
        } else {
            console.warn(`[Studio] ⚠️ 預覽 cache 未命中 (chatId=${chatId})，退回從聊天歷史抽 JSON（會抽到最早的版本，不是最新修改！）`);
            extractLatestJsonFromHistory();
        }
        renderPreviewPanel();
    }

    async function loadMode(modeId) {
        currentMode = modeId;
        activeCategory = null;
        currentParsedData = null;
        activePreviewData = null;
        document.getElementById('os_studio_app').setAttribute('data-mode', modeId);

        // 根據 mode 動態切換 tab 顯示
        // vn_ui:    preview | source | gallery
        // worldbook: preview | todo
        const galleryTab = document.getElementById('studio-tab-gallery');
        const sourceTab = document.getElementById('studio-tab-source');
        const todoTab = document.getElementById('studio-tab-todo');
        if (galleryTab) galleryTab.style.display = modeId === 'vn_ui' ? '' : 'none';
        if (sourceTab)  sourceTab.style.display  = modeId === 'vn_ui' ? '' : 'none';
        if (todoTab)    todoTab.style.display    = modeId === 'worldbook' ? '' : 'none';

        // 切 mode 一律重置到 preview tab
        document.querySelectorAll('.studio-tab').forEach(t => t.classList.remove('active'));
        document.querySelector('.studio-tab[data-tab="preview"]')?.classList.add('active');
        document.getElementById('studio-preview-content').style.display  = 'flex';
        document.getElementById('studio-source-content').style.display   = 'none';
        document.getElementById('studio-gallery-content').style.display  = 'none';
        document.getElementById('studio-todo-content').style.display     = 'none';

        // 世界書模式才顯示頻道面板
        const chPanel = document.getElementById('studio-ch-panel');
        if (chPanel) chPanel.style.display = (modeId === 'worldbook') ? 'flex' : 'none';

        if (modeId === 'worldbook') refreshWorldbookSidebar();
        await switchChatSession();
        updateWorldbookWelcome();
        _updateCompressBtnState();
        renderTodoPanel();
    }

    function _toggleNewChannelInput(show) {
        const bar = document.getElementById('studio-new-ch-bar');
        const btn = document.getElementById('studio-new-ch-btn');
        const inp = document.getElementById('studio-new-ch-input');
        if (show) {
            bar.classList.add('open');
            btn.style.display = 'none';
            inp.value = '';
            inp.focus();
        } else {
            bar.classList.remove('open');
            btn.style.display = '';
        }
    }

    function _applyNewChannel(name) {
        activeCategory = name;
        activePreviewData = null;
        currentParsedData = null;
        chatMessages = [{ role: 'system', content: MODES['worldbook'].prompt }];
        const badge = document.getElementById('studio-channel-badge');
        if (badge) { badge.style.display = 'inline-block'; badge.textContent = `📍 ${activeCategory}`; }
        _persistChannel(name); // 持久化到 localStorage，重整後還在
        renderChatHistory();
        renderPreviewPanel();
        refreshWorldbookSidebar();
        updateWorldbookWelcome();
    }

    // ============================================================
    // === 副模型自動壓縮舊對話為記憶（解決長線對話 context 爆炸）===
    // 觸發條件：對話 >= 15 輪 AND 累計字數 >= 30000
    // 壓縮策略：保留最後 5 輪不壓，前面的全壓成「📌 摘要 #N」
    // 副模型：用 OS_API.chatSecondary（便宜模型、不污染主對話）
    // ============================================================
    const SUMMARY_TRIGGER_TURNS = 15;
    const SUMMARY_TRIGGER_CHARS = 30000;
    const SUMMARY_KEEP_LAST = 5;
    let _summaryInProgress = false; // 防止同時觸發兩次

    function _summaryCounterKey(chatId) { return `os_studio_summary_count_${chatId}`; }
    function _loadSummaryCounter(chatId) {
        const v = parseInt(localStorage.getItem(_summaryCounterKey(chatId)) || '0', 10);
        return isNaN(v) ? 0 : v;
    }
    function _saveSummaryCounter(chatId, n) {
        try { localStorage.setItem(_summaryCounterKey(chatId), String(n)); } catch(e) {}
    }

    // 計算當前未壓縮對話的輪數和字數
    function _studioGetUncompressedStats() {
        const uncompressed = chatMessages.filter(m =>
            !m._isCompressed && !m._isSummary && m.role !== 'system' && m._isLatestPanel !== true
        );
        const userTurns = uncompressed.filter(m => m.role === 'user').length;
        const totalChars = uncompressed.reduce((sum, m) => sum + messageContentToString(m.content).length, 0);
        return { userTurns, totalChars, list: uncompressed };
    }

    // 觸發條件判斷
    function _studioShouldCompress() {
        if (currentMode !== 'worldbook') return false;
        if (_summaryInProgress) return false;
        const { userTurns, totalChars } = _studioGetUncompressedStats();
        return userTurns >= SUMMARY_TRIGGER_TURNS && totalChars >= SUMMARY_TRIGGER_CHARS;
    }

    // 執行壓縮：呼叫副模型把舊對話壓成 5-10 句摘要
    // force=true 時繞過 condition、立即壓縮（手動按鈕用）
    async function _studioCompressOldMessages(force = false) {
        if (_summaryInProgress) return;
        _summaryInProgress = true;
        _updateCompressBtnState();

        try {
            const chatId = getChatSessionId();
            // 1. 抽出要壓縮的對話：未壓縮 + 保留最後 SUMMARY_KEEP_LAST 輪
            const indices = [];
            chatMessages.forEach((m, i) => {
                if (m._isCompressed || m._isSummary || m._isLatestPanel) return;
                if (m.role === 'system') return;
                indices.push(i);
            });
            // 手動觸發：最少保留 2 輪（讓最近聊的不被壓）；自動觸發：保留 SUMMARY_KEEP_LAST 輪
            const keepCount = force ? 2 * 2 : SUMMARY_KEEP_LAST * 2;
            const toCompressIndices = indices.slice(0, Math.max(0, indices.length - keepCount));
            const minToCompress = force ? 2 : 4;
            if (toCompressIndices.length < minToCompress) {
                if (force) alert(`目前對話太短（只有 ${indices.length} 條訊息），至少要 ${minToCompress + keepCount} 條才能壓縮（保留最近 ${keepCount} 條不壓）`);
                _summaryInProgress = false;
                _updateCompressBtnState();
                return;
            }

            // 2. 組壓縮 prompt
            const dialogueText = toCompressIndices.map(i => {
                const m = chatMessages[i];
                const text = messageContentToString(m.content);
                return `[${m.role === 'user' ? '用戶' : 'AI'}] ${text}`;
            }).join('\n\n');

            const summaryPrompt = `你是專業的對話摘要員。下面是用戶與「世界書設計師 AI」的對話片段。請壓縮成重點摘要。

【保留優先順序】
1. 用戶的具體決定（選了什麼方向、什麼風格、什麼名字）
2. 已建立的世界書草稿條目（標題 + 一句話描述）
3. 待處理的問題或未決定的點
4. 重要事實設定（角色、地點、勢力、規則）
5. 用戶的偏好與品味（語氣、敘事節奏、想避開的元素）

【摘要規範】
- 純粹陳述句，不寫對話過程
- **不超過 1500 字**（短對話可寫 500 字、長對話用滿 1500 字）
- 中文輸出
- 用條列式（- 開頭），可分章節（章節名加 ## 標題）
- 細節豐富優於精簡——AI 之後要靠這份摘要繼續對話，缺資訊就會失憶

【需要壓縮的對話】
${dialogueText}

請開始輸出摘要（直接輸出，不要前綴說明）：`;

            console.log(`[Studio] 📌 觸發副模型壓縮，輸入 ${dialogueText.length} 字、${toCompressIndices.length} 條訊息`);

            // 3. 呼叫副模型
            const summaryText = await new Promise((resolve, reject) => {
                const apiEngine = win.OS_API || window.OS_API;
                if (!apiEngine || typeof apiEngine.chatSecondary !== 'function') {
                    reject(new Error('副模型 API 不可用'));
                    return;
                }
                apiEngine.chatSecondary(
                    [{ role: 'user', content: summaryPrompt }],
                    () => {}, // onChunk no-op
                    (finalText) => resolve(finalText),
                    (err) => reject(err)
                );
            });

            if (!summaryText || summaryText.trim().length < 20) {
                throw new Error('副模型回傳摘要過短或空白');
            }

            // 4. 取得新摘要編號
            const newCounter = _loadSummaryCounter(chatId) + 1;
            _saveSummaryCounter(chatId, newCounter);

            // 5. 標記原始對話為 _isCompressed
            toCompressIndices.forEach(i => {
                chatMessages[i]._isCompressed = true;
                chatMessages[i]._summaryGroup = newCounter;
            });

            // 6. 插入摘要訊息（在被壓縮區段的最後一條之後）
            const insertAfterIdx = toCompressIndices[toCompressIndices.length - 1];
            const summaryMsg = {
                role: 'assistant',
                content: summaryText.trim(),
                _isSummary: true,
                _summaryNum: newCounter,
                _compressedCount: toCompressIndices.length,
                _ts: Date.now()
            };
            chatMessages.splice(insertAfterIdx + 1, 0, summaryMsg);

            _studioSave(chatId);
            renderChatHistory();
            console.log(`[Studio] ✅ 壓縮完成 #${newCounter}，舊 ${toCompressIndices.length} 條 → 摘要 ${summaryText.length} 字`);
        } catch(err) {
            console.warn('[Studio] 自動壓縮失敗（不影響對話）：', err);
            if (force) alert('壓縮失敗：' + (err.message || err));
        } finally {
            _summaryInProgress = false;
            _updateCompressBtnState();
        }
    }

    // 在 send 完成後呼叫；若達條件就背景執行壓縮
    function _studioCompressIfNeeded() {
        if (!_studioShouldCompress()) return;
        // 背景非同步跑，不卡 UI
        _studioCompressOldMessages(false);
    }

    // 更新手動壓縮按鈕的顯示 + 啟用狀態
    function _updateCompressBtnState() {
        const btn = document.getElementById('studio-wb-compress-btn');
        if (!btn) return;
        const show = currentMode === 'worldbook' && !!activeCategory;
        btn.classList.toggle('active', show);
        if (!show) return;

        const { userTurns, totalChars } = _studioGetUncompressedStats();
        btn.disabled = _summaryInProgress;
        if (_summaryInProgress) {
            btn.textContent = '⏳ 壓縮中...';
        } else {
            btn.textContent = `📌 壓縮舊對話 (${userTurns}輪 / ${totalChars}字)`;
        }
    }

    // ============================================================
    // === 頻道持久化（v2 重做）===
    // 1. Object 結構：key 物理不可能重複（從根除「Array dedup 補丁」）
    // 2. trim 即可，不再囤積 normalize 規則
    // 3. 一次性從 v1 遷移後刪掉 v1 key
    // ============================================================
    const CHANNELS_KEY = 'studio_channels_v2';
    const CHANNELS_KEY_LEGACY = 'studio_channels_v1';

    function _normalizeChannelName(name) {
        return String(name || '').trim();
    }

    function _loadChannels() {
        try {
            // 一次性從 v1 遷移
            const legacyRaw = localStorage.getItem(CHANNELS_KEY_LEGACY);
            if (legacyRaw && !localStorage.getItem(CHANNELS_KEY)) {
                try {
                    const legacyArr = JSON.parse(legacyRaw);
                    if (Array.isArray(legacyArr)) {
                        const migrated = {};
                        legacyArr.forEach(n => {
                            const k = _normalizeChannelName(n);
                            if (k) migrated[k] = { createdAt: Date.now() };
                        });
                        localStorage.setItem(CHANNELS_KEY, JSON.stringify(migrated));
                    }
                } catch(e) {}
                localStorage.removeItem(CHANNELS_KEY_LEGACY);
            }
            const raw = localStorage.getItem(CHANNELS_KEY);
            if (!raw) return {};
            const obj = JSON.parse(raw);
            return (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};
        } catch(e) { return {}; }
    }
    function _saveChannels(obj) {
        try { localStorage.setItem(CHANNELS_KEY, JSON.stringify(obj)); } catch(e) {}
    }
    function _channelKeys() { return Object.keys(_loadChannels()); }
    function _persistChannel(name) {
        const key = _normalizeChannelName(name);
        if (!key) return;
        const obj = _loadChannels();
        if (!obj[key]) {
            obj[key] = { createdAt: Date.now() };
            _saveChannels(obj);
        }
    }
    function _removeChannelFromList(name) {
        const key = _normalizeChannelName(name);
        const obj = _loadChannels();
        if (obj[key]) {
            delete obj[key];
            _saveChannels(obj);
        }
    }
    function _renameChannelInList(oldName, newName) {
        const oldK = _normalizeChannelName(oldName);
        const newK = _normalizeChannelName(newName);
        if (!oldK || !newK || oldK === newK) return;
        const obj = _loadChannels();
        if (!obj[oldK]) return;
        obj[newK] = obj[oldK];
        delete obj[oldK];
        _saveChannels(obj);
    }

    // ============================================================
    // === Todo 任務面板（worldbook 模式專用） ===
    // 每個 chatId 一份 todo，存進 localStorage `os_studio_todos_${chatId}`
    // AI 透過 <todo_init> / <todo_done> / <todo_add> 標籤維護
    // 用戶可以手動勾選 / 編輯 / 新增 / 刪除
    // ============================================================
    const _todoKey = (chatId) => `os_studio_todos_${chatId}`;

    function _loadTodos(chatId) {
        try {
            const raw = localStorage.getItem(_todoKey(chatId));
            if (!raw) return [];
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr : [];
        } catch(e) { return []; }
    }
    function _saveTodos(chatId, todos) {
        try { localStorage.setItem(_todoKey(chatId), JSON.stringify(todos)); } catch(e) {}
    }
    function _clearTodos(chatId) {
        try { localStorage.removeItem(_todoKey(chatId)); } catch(e) {}
    }

    // AI 在訊息中嵌入 <todo_init>...|...|...</todo_init>、<todo_done>...</todo_done>、<todo_add>...</todo_add>
    // 從 finalText 抽出所有指令、應用到 todos
    function _applyTodoTagsFromAI(finalText) {
        if (currentMode !== 'worldbook' || !activeCategory) return;
        const chatId = getChatSessionId();
        let todos = _loadTodos(chatId);
        let changed = false;

        // todo_init：首次建立路線圖
        const initMatch = finalText.match(/<todo_init>([\s\S]*?)<\/todo_init>/i);
        if (initMatch) {
            const items = initMatch[1].split('|').map(s => s.trim()).filter(Boolean);
            // 只在當前 todos 為空時初始化，避免重複建立
            if (todos.length === 0 && items.length > 0) {
                todos = items.map((text, i) => ({
                    id: 'ai_' + Date.now() + '_' + i,
                    text,
                    done: false
                }));
                changed = true;
            }
        }

        // todo_done：標記完成
        const doneMatches = [...finalText.matchAll(/<todo_done>([\s\S]*?)<\/todo_done>/gi)];
        doneMatches.forEach(m => {
            const target = m[1].trim();
            if (!target) return;
            // 模糊匹配：todo.text 包含 target 或 target 包含 todo.text
            const t = todos.find(item => !item.done && (item.text.includes(target) || target.includes(item.text)));
            if (t) { t.done = true; changed = true; }
        });

        // todo_add：新增
        const addMatches = [...finalText.matchAll(/<todo_add>([\s\S]*?)<\/todo_add>/gi)];
        addMatches.forEach(m => {
            const text = m[1].trim();
            if (!text) return;
            // 避免重複加入
            if (todos.some(t => t.text === text)) return;
            todos.push({ id: 'ai_' + Date.now() + '_' + Math.random().toString(36).slice(2,6), text, done: false });
            changed = true;
        });

        if (changed) {
            _saveTodos(chatId, todos);
            renderTodoPanel();
        }
    }

    // VN 對話框 CSS 生成 prompt（給 AI 副模型）
    const VTH_AI_PROMPT = `你是 VN（視覺小說）面板的 UI 設計師。根據用戶描述的風格，生成一段純 CSS，重新設計 VN 介面這幾個元素（只有這些，其他一律別碰）的「外觀與排版」。目標是做出有記憶點、有設計感的整體版面——不是只換顏色。

可設計的元素（括號內是它的「預設」位置，你可以自由重新擺放）：
- #text-panel：對話框外框。⚠️它一定帶三狀態 class 之一：.char-mode（角色說話，最常見）/ .nar-mode（旁白）/ .inner-mode（內心）。預設已分別對 #text-panel.char-mode、.nar-mode、.inner-mode 設了背景，特異性比純 #text-panel 高，所以換背景/邊框「必須」分別寫這三條，否則沒效果。三態都要給背景。對話框的造型、邊框、圓角、位置、寬度都可以大膽改。
- #dialogue-text：對話內文（字體 / 字色 / 行距 / 對齊）。
- #speaker-name：角色名牌（預設浮在對話框左上，旁白時自動隱藏）。位置可移：左上、置中、右側、貼框上緣或下緣都行。
- #game-bg：全螢幕背景容器。只能疊「半透明」遮罩/濾鏡/暈影/漸層（alpha ≤ 0.35），絕不要設 background-image 或不透明底蓋掉劇情實際的背景圖。
- #vn-panel-controls 與 .vn-panel-btn：SKIP / LOG / AUTO 控制按鈕（預設在對話框上方，可重新擺放、改造型；.vn-panel-btn.active 為啟用態）。
- #btn-home、#btn-settings、#btn-reader：頂部按鈕（預設右上，可移位、可重排、要統一造型）。

【排版自由 — 重點，別只換色】
- 你可以自由使用 position / top / left / right / bottom / transform / margin / flex 等，重新擺放與重塑上面的元素，做出真正不同的版面：名牌換邊、控制鈕改直排或換位、對話框換造型或挪位置、頂部鈕重新排列……都歡迎。請大膽設計。

【可用性 — 底線，違反就算失敗】
- 所有元素都要留在可見畫面內，不可被裁切或跑出螢幕外。
- 元素之間不可互相遮蓋到看不見：名牌、控制鈕、頂部鈕都不能壓住 #dialogue-text；移動名牌後也要確保它跟內文有清楚間距、不重疊。
- 畫面中央是角色立繪區，盡量別讓你的元素長期擋住正中央。

【可讀性 — 最優先】
- 對話框「文字所在那層」的底必須夠不透明：實心色，或 alpha ≥ 0.82。要玻璃感就把透明留外緣，文字正下方壓一層實底，確保字不被背景圖洗掉。
- #dialogue-text 字色跟對話框底色要「強對比」：深底配亮字、亮底配深字；不要半透明字、不要相近色。
- 三態 .char-mode / .nar-mode / .inner-mode 各自都要顧到。

【完成度 — 成套，不准半吊子】
- 所有元素用「同一套設計語言」做成完整一組，不可以有的套了、有的還停在預設黑；控制鈕和頂部鈕也要呼應主風格與質感。

規則：
1. 可用 @import 載字體、用 ::before/::after 加裝飾、用 @keyframes 做動畫。
2. 「絕對不要」對 #game-char 或 #game-char-container（角色立繪）寫任何樣式——立繪是劇情內容、不歸主題管。
3. 對話框背景務必分別寫 #text-panel.char-mode / .nar-mode / .inner-mode 三條。
4. 輸出前自檢一次：把你的設計想像疊在一張明亮、雜亂的背景圖上——文字一眼可讀嗎？有沒有元素跑出畫面或互相遮住？有問題就修好再輸出。
5. 只輸出 CSS，用 \`\`\`css 包起來，不要任何解釋文字。
用戶想要的風格：`;

    // ── 🎨 劇情面板主題工坊（生成 → 即時預覽 → 主題庫收藏；像 VN UI 那套）──
    // 預覽用：複刻 VN 介面預設外觀（對話框/名牌/背景容器/控制鈕/頂部鈕），讓主題 CSS 疊上去效果跟真實 VN 一致。立繪不在範圍內。
    const VTH_PREVIEW_BASE = `
:root{--gold:#d4af37;--gold-light:#f3e5ab;--gold-dark:#997a00;--em-color:#d4af37;--text-color:#dcd8d0;--name-color:#d4af37;--font-classic:'Playfair Display','Noto Serif TC',serif;--font-sans:system-ui,'Noto Sans TC',sans-serif;}
*{box-sizing:border-box;}
html,body{margin:0;height:100%;}
body{font-family:var(--font-classic);position:relative;min-height:100%;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;padding:14px;}
/* 預覽用示意場景：代表真實 VN 裡 #game-bg 載入的劇情背景圖，故意偏亮偏雜，方便看出遮罩效果＋檢驗文字可讀性 */
#game-bg{position:absolute;inset:0;background-color:#050505;background-image:linear-gradient(160deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.45) 100%), linear-gradient(135deg, #4a6b8a 0%, #7a6a8c 38%, #c89a6a 72%, #e8cf9e 100%);background-size:cover;background-position:center;z-index:1;}
#btn-home,#btn-settings,#btn-reader{position:absolute;z-index:15;background:rgba(10,10,12,0.6);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);border:1px solid rgba(212,175,55,0.3);color:var(--gold-dark);padding:6px 12px;cursor:pointer;font-size:0.7rem;font-family:var(--font-classic);letter-spacing:1px;border-radius:2px;text-transform:uppercase;}
#btn-reader{top:12px;right:12px;padding:6px 10px;}
#btn-settings{top:12px;right:70px;}
#btn-home{top:12px;right:144px;}
#text-panel-wrapper{position:relative;z-index:5;width:100%;}
#text-panel{position:relative;padding:26px 30px;min-height:96px;border-radius:4px;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);}
#text-panel.nar-mode{background:linear-gradient(180deg,rgba(12,12,16,0.88),rgba(4,4,6,0.95));border:1px solid rgba(255,255,255,0.08);border-top:1px dashed rgba(255,255,255,0.15);box-shadow:0 20px 50px rgba(0,0,0,0.9);}
#text-panel.char-mode{background:rgba(4,4,6,0.92);border:none;border-top:1px solid rgba(212,175,55,0.18);box-shadow:0 20px 50px rgba(0,0,0,0.9);border-radius:0;}
#text-panel::after{content:'\\2727';position:absolute;bottom:12px;right:16px;color:var(--gold-dark);font-size:1.1rem;font-family:var(--font-classic);}
#speaker-name{position:absolute;top:-18px;left:26px;background:var(--vn-name-bg,#050505);border:1px solid var(--gold);color:var(--name-color);font-family:var(--font-classic);font-size:1rem;padding:5px 22px;display:inline-block;letter-spacing:2px;z-index:12;box-shadow:0 5px 15px rgba(0,0,0,0.8);border-radius:2px;}
.nar-mode #speaker-name{opacity:0;}
#vn-panel-controls{position:absolute;top:-16px;right:15px;display:flex;gap:8px;z-index:12;}
.vn-panel-btn{background:#0a0a0c;border:1px solid rgba(255,255,255,0.2);color:#aaa;padding:0 13px;height:30px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:0.7rem;font-family:var(--font-sans);border-radius:4px;letter-spacing:1px;}
.vn-panel-btn.active{background:rgba(212,175,55,0.1);color:var(--gold);border-color:var(--gold);}
#dialogue-text{font-family:var(--font-classic);font-size:1.05rem;line-height:1.75;letter-spacing:1px;color:var(--text-color);font-weight:300;}
.nar-mode #dialogue-text{font-style:normal;color:#b8b4ac;letter-spacing:1.5px;}
.char-mode #dialogue-text{color:#e8e2d8;font-style:normal;}
.inner-mode #dialogue-text{color:var(--em-color);font-style:italic;letter-spacing:1px;}
#dialogue-text em{font-style:italic;color:var(--em-color);}
#dialogue-text strong{font-weight:bold;color:#fff;}
`;
    let _vthMode = 'char-mode';

    function _vthBuildSrcdoc(css, mode, thumb) {
        const m = mode || _vthMode;
        const layout = thumb ? 'body{justify-content:flex-start;padding:14px 14px 6px;}#btn-home,#btn-settings,#btn-reader,#vn-panel-controls{display:none;}' : '';
        return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${VTH_PREVIEW_BASE}\n${layout}\n/* ====== 主題 CSS ====== */\n${css || ''}</style></head><body>
<div id="game-bg"></div>
<button id="btn-home">⌂ 返回</button>
<button id="btn-settings">設定</button>
<button id="btn-reader">📖</button>
<div id="text-panel-wrapper">
<div id="vn-panel-controls"><div class="vn-panel-btn">SKIP</div><div class="vn-panel-btn">LOG</div><div class="vn-panel-btn">AUTO</div></div>
<div id="text-panel" class="${m}">
<div id="speaker-name">角色</div>
<div id="dialogue-text">範例對白，用來預覽主題的字體、顏色與框線。<em>斜體強調</em>與<strong>粗體重點</strong>也會跟著套用。</div>
</div>
</div>
</body></html>`;
    }

    function _vthGalleryLoad() { try { return JSON.parse(localStorage.getItem('vn_theme_gallery') || '[]'); } catch (e) { return []; } }
    function _vthGallerySave(arr) { try { localStorage.setItem('vn_theme_gallery', JSON.stringify(arr || [])); } catch (e) {} }

    function renderThemePanel() {
        const host = document.getElementById('studio-theme-content'); if (!host) return;
        const VT = (window.parent || window).VN_Theme || window.VN_Theme;
        const VC = (window.parent || window).VN_Cache || window.VN_Cache;
        if (!VT) { host.innerHTML = '<div style="color:#fc8181;padding:10px;">VN_Theme 未載入，請先進 VN 一次再回來</div>'; return; }
        const chatId = (VC && VC.getCurrentWorld) ? VC.getCurrentWorld() : (VT.getCurrentWorld ? VT.getCurrentWorld() : '');
        const css = VT.getCss(chatId);
        const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const ph = '手寫 / 貼上，或用上面的「🤖 AI 生成」。上方會即時預覽。\n範圍內選擇器：\n#text-panel.char-mode / .nar-mode / .inner-mode（三狀態對話框）\n#dialogue-text（內文）  #speaker-name（名牌）  #game-bg（背景容器，只疊遮罩別蓋圖）\n#vn-panel-controls / .vn-panel-btn（SKIP/LOG/AUTO）\n#btn-home / #btn-settings / #btn-reader（右上頂部鈕）\n（立繪 #game-char 不歸主題管）';
        host.innerHTML = `<div class="vth-wrap">
            <div class="vth-css-bar">
                <span class="vth-css-world">🌍 ${esc(chatId || '(未知，先進 VN 一次)')}</span>
                <button class="vth-mini primary" id="vth-css-apply">💾 套用到此世界</button>
                <button class="vth-mini" id="vth-css-clear">清空</button>
            </div>
            <div class="vth-ai-row">
                <input id="vth-ai-desc" class="vth-ai-desc" placeholder="描述風格讓 AI 生成（例：賽博夜雨霓虹 / 古典宮廷燙金 / 陰森廢墟舊紙）">
                <button class="vth-mini primary" id="vth-ai-gen">🤖 AI 生成</button>
            </div>
            <div class="vth-prev-head">
                <span class="vth-prev-label">👁️ 即時預覽</span>
                <div class="vth-mode-tabs">
                    <button class="vth-mode active" data-mode="char-mode">角色對話</button>
                    <button class="vth-mode" data-mode="nar-mode">旁白</button>
                    <button class="vth-mode" data-mode="inner-mode">內心</button>
                </div>
            </div>
            <iframe id="vth-preview" class="vth-preview" sandbox="allow-same-origin"></iframe>
            <textarea id="vth-css-area" class="vth-css-area" spellcheck="false" placeholder="${esc(ph)}">${esc(css)}</textarea>
            <div class="vth-css-hint">改框內 CSS，上方即時預覽。「套用到此世界」存進當前世界、VN 開播自動套；「收藏目前」存進下方主題庫可跨世界重用。AI 用「寫作→API 設置」的副模型。</div>
            <div class="vth-gal">
                <div class="vth-gal-head">
                    <span class="vth-gal-label">📚 我的主題庫</span>
                    <div class="vth-gal-save">
                        <input id="vth-gal-name" class="vth-gal-name" placeholder="主題命名…">
                        <button class="vth-mini primary" id="vth-gal-add">💾 收藏目前</button>
                    </div>
                </div>
                <div class="vth-gal-list" id="vth-gal-list"></div>
            </div>
        </div>`;

        const area = host.querySelector('#vth-css-area');
        const frame = host.querySelector('#vth-preview');
        let _t = null;
        const refreshPreview = () => { try { frame.srcdoc = _vthBuildSrcdoc(area.value); } catch (e) {} };
        refreshPreview();
        area.oninput = () => { if (_t) clearTimeout(_t); _t = setTimeout(refreshPreview, 250); };

        host.querySelectorAll('.vth-mode').forEach(b => b.onclick = () => {
            _vthMode = b.dataset.mode;
            host.querySelectorAll('.vth-mode').forEach(x => x.classList.toggle('active', x === b));
            refreshPreview();
        });

        host.querySelector('#vth-css-apply').onclick = () => {
            VT.setCss(chatId, area.value);
            const b = host.querySelector('#vth-css-apply'); const o = b.textContent; b.textContent = '✓ 已套用'; setTimeout(() => { b.textContent = o; }, 1200);
        };
        host.querySelector('#vth-css-clear').onclick = () => { if (confirm('清空此世界的自訂 CSS？')) { VT.clear(chatId); area.value = ''; refreshPreview(); } };

        const genBtn = host.querySelector('#vth-ai-gen');
        genBtn.onclick = () => {
            const desc = host.querySelector('#vth-ai-desc').value.trim();
            if (!desc) { alert('先描述你想要的風格'); return; }
            const api = (window.parent || window).OS_API || window.OS_API;
            if (!api || typeof api.chatSecondary !== 'function') { alert('AI（副模型）不可用，請先到「寫作 → API 設置」設好副模型'); return; }
            const orig = genBtn.textContent; genBtn.textContent = '生成中…'; genBtn.disabled = true;
            api.chatSecondary(
                [{ role: 'user', content: VTH_AI_PROMPT + desc }],
                () => {},
                (full) => {
                    let out = String(full || '');
                    const m = out.match(/```(?:css)?\s*([\s\S]*?)```/i);
                    if (m) out = m[1];
                    out = out.trim();
                    if (out) { area.value = out; refreshPreview(); VT.setCss(chatId, out); }
                    genBtn.textContent = '✓ 已生成（已預覽+套用）'; genBtn.disabled = false;
                    setTimeout(() => { genBtn.textContent = orig; }, 1800);
                },
                (err) => { genBtn.textContent = orig; genBtn.disabled = false; alert('生成失敗：' + ((err && err.message) || err)); }
            );
        };

        // ── 主題庫（跨世界重用，像 VN UI 展廳）──
        const renderGal = () => {
            const list = host.querySelector('#vth-gal-list');
            const arr = _vthGalleryLoad();
            if (!arr.length) { list.innerHTML = '<div class="vth-gal-empty">還沒收藏。調好一個主題後按「💾 收藏目前」存起來，之後任何世界都能一鍵套用。</div>'; return; }
            list.innerHTML = arr.map(t => `<div class="vth-gal-card" data-id="${esc(t.id)}">
                <div class="vth-gal-thumb-wrap"><iframe class="vth-gal-thumb" sandbox="allow-same-origin" scrolling="no"></iframe></div>
                <div class="vth-gal-name-row"><span class="vth-gal-cname">${esc(t.name)}</span></div>
                <div class="vth-gal-acts">
                    <button class="vth-mini primary" data-act="apply">套用</button>
                    <button class="vth-mini" data-act="edit">編輯</button>
                    <button class="vth-mini danger" data-act="del">刪</button>
                </div>
            </div>`).join('');
            arr.forEach(t => {
                const card = list.querySelector('.vth-gal-card[data-id="' + (window.CSS && CSS.escape ? CSS.escape(t.id) : t.id) + '"]');
                if (!card) return;
                try { card.querySelector('.vth-gal-thumb').srcdoc = _vthBuildSrcdoc(t.css, 'char-mode', true); } catch (e) {}
                card.querySelector('[data-act="apply"]').onclick = () => {
                    area.value = t.css || ''; refreshPreview(); VT.setCss(chatId, t.css || '');
                    const bb = card.querySelector('[data-act="apply"]'); const oo = bb.textContent; bb.textContent = '✓'; setTimeout(() => { bb.textContent = oo; }, 1000);
                };
                card.querySelector('[data-act="edit"]').onclick = () => { area.value = t.css || ''; refreshPreview(); area.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
                card.querySelector('[data-act="del"]').onclick = () => { if (confirm('刪除主題「' + t.name + '」？')) { _vthGallerySave(_vthGalleryLoad().filter(x => x.id !== t.id)); renderGal(); } };
            });
        };
        host.querySelector('#vth-gal-add').onclick = () => {
            const nameEl = host.querySelector('#vth-gal-name');
            const name = (nameEl.value || '').trim();
            if (!name) { alert('幫主題取個名字'); nameEl.focus(); return; }
            if (!area.value.trim()) { alert('CSS 是空的，先生成或貼一段再收藏'); return; }
            const arr = _vthGalleryLoad();
            arr.unshift({ id: 'th_' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), name: name, css: area.value });
            _vthGallerySave(arr);
            nameEl.value = '';
            renderGal();
        };
        renderGal();
    }

    function renderTodoPanel() {
        // 任務面板搬到右側預覽區的「📋 任務進度」tab 內
        const sideEl = document.getElementById('studio-todo-panel-side');
        if (!sideEl) return;
        const shouldShow = currentMode === 'worldbook' && !!activeCategory;
        if (!shouldShow) {
            sideEl.innerHTML = '<div style="text-align:center; color:rgba(26,28,40,0.20); padding:40px 20px; font-size:13px;">先建立 / 選擇一個世界頻道，AI 會自動幫你規劃任務進度。</div>';
            return;
        }

        const chatId = getChatSessionId();
        const todos = _loadTodos(chatId);
        const doneCount = todos.filter(t => t.done).length;

        // 重建 panel HTML
        sideEl.innerHTML = `
            <div class="todo-side-header">
                <span class="todo-side-title">📋 任務進度 <span class="todo-side-stats">(${doneCount}/${todos.length})</span></span>
                <button class="todo-add-btn" id="todo-side-add-btn" title="手動新增任務">＋ 新增</button>
            </div>
            <div class="todo-side-progress"><div class="todo-side-progress-bar" style="width:${todos.length ? (doneCount/todos.length*100).toFixed(0) : 0}%;"></div></div>
            <div class="todo-list" id="todo-list"></div>
            <div class="todo-add-row" id="todo-add-row" style="display:none;">
                <input class="todo-add-input" id="todo-add-input" placeholder="新增任務（按 Enter 確認）">
                <button class="todo-add-confirm" id="todo-add-confirm">✓</button>
                <button class="todo-add-cancel" id="todo-add-cancel">✕</button>
            </div>
        `;

        const listEl = sideEl.querySelector('#todo-list');

        todos.forEach((todo, idx) => {
            const item = document.createElement('div');
            item.className = 'todo-item' + (todo.done ? ' done' : '');
            item.innerHTML = `
                <div class="todo-checkbox" title="${todo.done ? '取消完成' : '標記完成'}"></div>
                <div class="todo-text" title="雙擊編輯">${escapeHtmlSimple(todo.text)}</div>
                <button class="todo-del-btn" title="刪除">✕</button>
            `;
            // 勾選 / 取消
            item.querySelector('.todo-checkbox').onclick = () => {
                todo.done = !todo.done;
                _saveTodos(chatId, todos);
                renderTodoPanel();
            };
            // 刪除
            item.querySelector('.todo-del-btn').onclick = () => {
                if (!confirm(`刪除任務「${todo.text}」？`)) return;
                todos.splice(idx, 1);
                _saveTodos(chatId, todos);
                renderTodoPanel();
            };
            // 雙擊編輯
            const textEl = item.querySelector('.todo-text');
            textEl.ondblclick = () => {
                const input = document.createElement('input');
                input.className = 'todo-text-input';
                input.value = todo.text;
                textEl.replaceWith(input);
                input.focus();
                input.select();
                const commit = () => {
                    const newText = input.value.trim();
                    if (newText && newText !== todo.text) {
                        todo.text = newText;
                        _saveTodos(chatId, todos);
                    }
                    renderTodoPanel();
                };
                input.onblur = commit;
                input.onkeydown = (e) => {
                    if (e.key === 'Enter') { e.preventDefault(); input.onblur = null; commit(); }
                    if (e.key === 'Escape') { e.preventDefault(); input.onblur = null; renderTodoPanel(); }
                };
            };
            listEl.appendChild(item);
        });

        // 新增任務按鈕綁定（每次 render 重綁）
        const addBtn = sideEl.querySelector('#todo-side-add-btn');
        const addRow = sideEl.querySelector('#todo-add-row');
        const addInput = sideEl.querySelector('#todo-add-input');
        const addConfirm = sideEl.querySelector('#todo-add-confirm');
        const addCancel = sideEl.querySelector('#todo-add-cancel');
        if (addBtn && addRow && addInput) {
            addBtn.onclick = () => {
                addRow.style.display = 'flex';
                addInput.value = '';
                addInput.focus();
            };
            const commitAdd = () => {
                const text = addInput.value.trim();
                if (!text) { addRow.style.display = 'none'; return; }
                todos.push({ id: 'user_' + Date.now(), text, done: false });
                _saveTodos(chatId, todos);
                renderTodoPanel();
            };
            if (addConfirm) addConfirm.onclick = commitAdd;
            if (addCancel) addCancel.onclick = () => { addRow.style.display = 'none'; };
            addInput.onkeydown = (e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitAdd(); }
                if (e.key === 'Escape') { e.preventDefault(); addRow.style.display = 'none'; }
            };
        }
    }

    function escapeHtmlSimple(s) {
        return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
    }

    // === 世界編撰啟動頁邏輯 ===
    function updateWorldbookWelcome() {
        const welcomeEl = document.getElementById('studio-welcome');
        if (!welcomeEl) return;
        const shouldShow = currentMode === 'worldbook' && !activeCategory;
        welcomeEl.classList.toggle('active', shouldShow);
        if (shouldShow) renderWelcomeChannelList();
    }

    async function renderWelcomeChannelList() {
        const listEl = document.getElementById('welcome-channel-list');
        const labelEl = document.getElementById('welcome-recent-label');
        if (!listEl) return;
        listEl.innerHTML = '';

        const allEntries = (win.OS_DB && win.OS_DB.getAllStudioDrafts)
            ? await win.OS_DB.getAllStudioDrafts().catch(() => []) : [];

        const categories = {};
        allEntries.forEach(e => {
            const cat = _normalizeChannelName(e.category || '未分類') || '未分類';
            if (!categories[cat]) categories[cat] = { count: 0, lastUpdate: 0 };
            categories[cat].count++;
            const ts = e.updatedAt || e.createdAt || e.timestamp || 0;
            if (ts > categories[cat].lastUpdate) categories[cat].lastUpdate = ts;
        });

        // 合併 localStorage 持久化的頻道（即使沒草稿也要列出）
        _channelKeys().forEach(name => {
            if (!categories[name]) categories[name] = { count: 0, lastUpdate: 0 };
        });

        const sorted = Object.entries(categories).sort((a, b) => b[1].lastUpdate - a[1].lastUpdate);

        if (labelEl) labelEl.style.display = sorted.length > 0 ? 'block' : 'none';

        sorted.forEach(([catName, meta]) => {
            const item = document.createElement('div');
            item.className = 'welcome-channel-item';
            item.innerHTML = `<span class="ch-icon">📖</span><span class="ch-name">${catName}</span><span class="ch-meta">${meta.count} 筆草稿</span>`;
            item.onclick = async () => {
                activeCategory = catName;
                activePreviewData = null;
                currentParsedData = null;
                await switchChatSession();
                refreshWorldbookSidebar();
                updateWorldbookWelcome();
            };
            listEl.appendChild(item);
        });
    }

    // 自動建頻道（用戶不用先取名字）—— 時間戳預設名
    function autoCreateChannel() {
        const d = new Date();
        const pad = n => String(n).padStart(2, '0');
        const name = `未命名世界 ${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        _applyNewChannel(name);
    }

    // 改頻道名：搬移所有 drafts + 對話 + cache
    async function renameStudioCategory(oldName, newName) {
        if (!oldName || !newName) return false;
        const trimmed = newName.trim();
        if (!trimmed || trimmed === oldName) return false;
        const db = win.OS_DB;
        if (!db) return false;

        try {
            // 1. 檢查新名字不能跟現有頻道撞
            const all = (db.getAllStudioDrafts) ? await db.getAllStudioDrafts().catch(() => []) : [];
            const existing = new Set(all.map(e => e.category).filter(Boolean));
            if (existing.has(trimmed)) {
                alert(`頻道名「${trimmed}」已存在，請取個不同的名字`);
                return false;
            }

            // 2. 更新所有該 category 的 drafts
            for (const entry of all.filter(x => x.category === oldName)) {
                entry.category = trimmed;
                if (db.saveStudioDraft) await db.saveStudioDraft(entry).catch(() => {});
            }

            // 3. 搬移聊天記錄（IndexedDB）
            const oldChatId = `worldbook_draft_${oldName}`;
            const newChatId = `worldbook_draft_${trimmed}`;
            if (db.getStudioChat && db.saveStudioChat) {
                const chat = await db.getStudioChat(oldChatId).catch(() => null);
                if (chat && chat.length) {
                    await db.saveStudioChat(newChatId, chat).catch(() => {});
                    if (db.clearStudioChat) await db.clearStudioChat(oldChatId).catch(() => {});
                }
            }

            // 4. 搬移 localStorage 備份
            try {
                const oldChatRaw = localStorage.getItem(`os_studio_chat_${oldChatId}`);
                if (oldChatRaw) {
                    localStorage.setItem(`os_studio_chat_${newChatId}`, oldChatRaw);
                    localStorage.removeItem(`os_studio_chat_${oldChatId}`);
                }
                const oldParsedRaw = localStorage.getItem(`os_studio_parsed_${oldChatId}`);
                if (oldParsedRaw) {
                    localStorage.setItem(`os_studio_parsed_${newChatId}`, oldParsedRaw);
                    localStorage.removeItem(`os_studio_parsed_${oldChatId}`);
                }
            } catch(e) { console.warn('[Studio] rename localStorage 搬移失敗:', e); }

            // 5. 同步持久化頻道列表
            _renameChannelInList(oldName, trimmed);

            // 6. 若改的是當前 activeCategory，更新狀態
            if (activeCategory === oldName) {
                activeCategory = trimmed;
                const badge = document.getElementById('studio-channel-badge');
                if (badge) badge.textContent = `📍 ${trimmed}`;
            }
            return true;
        } catch(e) {
            console.error('[Studio] 頻道改名失敗:', e);
            alert('改名失敗：' + e.message);
            return false;
        }
    }


    function renderMarkdown(raw) {
        if (!raw) return '';
        let s = raw;
        s = s.replace(/<(script|iframe|object|embed|meta|link)[^>]*>[\s\S]*?<\/\1>/gi, '');
        s = s.replace(/<(script|iframe|object|embed|meta|link)[^>]*\/?>/gi, '');
        
        const hiddenUI = '<div style="margin-top:10px; padding:10px 15px; background:rgba(228,232,245,0.8); border:1px solid rgba(26,28,40,0.20); border-radius:8px; color:#1A1C28; font-size:13px; font-weight:bold; display:inline-block;">✨ 設定已提取至右側草稿區</div>';
        
        // 原本的 <json> 攔截
        s = s.replace(/<json>[\s\S]*?(<\/json>|$)/gi, hiddenUI);
        // 新增：攔截不聽話裸奔的 Array (特徵是裡面有 category 或 tagId)
        s = s.replace(/\[\s*\{[\s\S]*?"(?:category|tagId|id)"[\s\S]*\}\s*\]/g, hiddenUI);
        // 新增：攔截不聽話裸奔的 Object
        s = s.replace(/\{\s*"(?:category|tagId|id)"[\s\S]*?\}/g, hiddenUI);
        
        s = s.replace(/^---+$/gm, '<hr>');
        s = s.replace(/^###\s+(.*)/gm, (_, t) => `<h3>${t.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')}</h3>`);
        s = s.replace(/^##\s+(.*)/gm,  (_, t) => `<h2>${t.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')}</h2>`);
        s = s.replace(/^#\s+(.*)/gm,   (_, t) => `<h1>${t.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')}</h1>`);
        s = s.replace(/^>\s*(.*)/gm, '<blockquote>$1</blockquote>');
        s = s.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        s = s.replace(/^[*-]\s+(.*)/gm, '<li>$1</li>');
        s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
        s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
        s = s.replace(/\n/g, '<br>');
        s = s.replace(/(<br>\s*){3,}/g, '<br><br>');
        return s;
    }

    function safeStreamHtml(raw) {
        if (!raw) return '';
        let s = raw.replace(/<(script|iframe)[^>]*>[\s\S]*?<\/\1>/gi, '');
        
        // ── 優化：遇到 <json> 開頭直接截斷後方文字，換成炫酷 Loading ──
        if (s.match(/<json>/i)) {
            s = s.replace(/<json>[\s\S]*/i, `
                <div style="margin-top:10px; padding:10px 15px; background:rgba(26,28,40,0.06); border:1px solid rgba(26,28,40,0.15); border-radius:8px; display:flex; align-items:center; gap:10px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
                    <div class="os-studio-spinner"></div>
                    <span style="color:#1A1C28; font-weight:bold; font-size:13px; letter-spacing:0.5px;">The Mirage 正在為您鑄造頂級 JSON 面板中... 🎨</span>
                </div>
            `);
        }
        
        return s.replace(/\n/g, '<br>');
    }

    // ── 多泡泡解析器 ─────────────────────────────────────────────────
    // 將 AI 回應切成 segments：text / render / genimg
    function parseSegments(text) {
        if (!text) return [];
        // 砍掉 todo 控制標籤（它們由 _applyTodoTagsFromAI 處理、不該顯示）
        text = text.replace(/<todo_(init|done|add)>[\s\S]*?<\/todo_\1>/gi, '').trim();
        if (!text) return [];
        const segments = [];
        const tagReg = /<(render|genimg|choices)>([\s\S]*?)<\/\1>/gi;
        let lastIndex = 0, match;

        while ((match = tagReg.exec(text)) !== null) {
            const before = text.slice(lastIndex, match.index);
            if (before.trim()) {
                before.split(/\n\n+/).forEach(chunk => {
                    const c = chunk.trim();
                    if (c) segments.push({ type: 'text', content: c });
                });
            }
            segments.push({ type: match[1], content: match[2].trim() });
            lastIndex = match.index + match[0].length;
        }

        const tail = text.slice(lastIndex);
        if (tail.trim()) {
            tail.split(/\n\n+/).forEach(chunk => {
                const c = chunk.trim();
                if (c) segments.push({ type: 'text', content: c });
            });
        }

        return segments.length ? segments : [{ type: 'text', content: text }];
    }

    // 根據 segment 建立對應的 bubble DOM
    // options.selectedLabel：choices segment 已被選的內容（重整後直接渲染「已選展示」）
    function createSegmentBubble(seg, animate = true, options = {}) {
        const bubble = document.createElement('div');
        bubble.className = 'studio-bubble ai' + (animate ? ' studio-bubble-enter' : '');

        if (seg.type === 'text') {
            bubble.innerHTML = renderMarkdown(seg.content);

        } else if (seg.type === 'render') {
            bubble.classList.add('render-bubble');
            // 建立隔離容器，防止樣式外洩
            const wrap = document.createElement('div');
            wrap.className = 'studio-render-wrap';
            // 只允許顯示用 HTML，過濾 script/iframe
            const safeHtml = seg.content
                .replace(/<(script|iframe|object|embed|meta|link)[^>]*>[\s\S]*?<\/\1>/gi, '')
                .replace(/<(script|iframe|object|embed|meta|link)[^>]*\/?>/gi, '');
            wrap.innerHTML = safeHtml;
            bubble.appendChild(wrap);

        } else if (seg.type === 'genimg') {
            bubble.classList.add('genimg-bubble');
            bubble.innerHTML = `<div style="display:flex;align-items:center;gap:8px;">
                <div class="os-studio-spinner"></div>
                <span style="color:rgba(26,28,40,0.72);font-size:12px;">生成圖片中… ${seg.content.slice(0,40)}</span>
            </div>`;
            // 非同步生圖，完成後替換內容
            (async () => {
                try {
                    const imgMgr = win.OS_IMAGE_MANAGER;
                    if (!imgMgr?.generate) throw new Error('找不到圖片引擎');
                    const url = await imgMgr.generate(seg.content, 'scene');
                    if (url) {
                        bubble.innerHTML = `<img src="${url}" alt="generated" />
                            <div style="font-size:10px;color:rgba(26,28,40,0.72);margin-top:4px;padding:0 4px;">${seg.content.slice(0,60)}</div>`;
                    } else {
                        bubble.innerHTML = `<span style="color:#fc8181;font-size:12px;">⚠️ 圖片生成失敗</span>`;
                    }
                } catch(e) {
                    bubble.innerHTML = `<span style="color:#fc8181;font-size:12px;">⚠️ ${e.message}</span>`;
                }
            })();

        } else if (seg.type === 'choices') {
            // 解析 | 分隔的選項，渲染成按鈕列（支援 markdown）
            bubble.classList.add('choices-bubble');
            const items = seg.content.split('|').map(s => s.trim()).filter(Boolean);

            // 變換成「已選展示」狀態：清掉所有按鈕、只顯示選中項
            const collapseToSelected = (label) => {
                bubble.classList.add('selected');
                bubble.innerHTML = `
                    <div class="studio-choices-hint">✓ 你選擇了：</div>
                    <div class="studio-choice-selected">${renderMarkdown(label)}</div>
                `;
            };

            // 重整後若該 choices 已被選過，直接渲染「已選展示」（不顯示按鈕）
            if (options.selectedLabel) {
                collapseToSelected(options.selectedLabel);
                return bubble;
            }

            bubble.innerHTML = '<div class="studio-choices-hint">🤔 你的選擇：</div>';
            const btnRow = document.createElement('div');
            btnRow.className = 'studio-choices-row';

            items.forEach((label) => {
                const btn = document.createElement('button');
                btn.className = 'studio-choice-btn';
                btn.innerHTML = renderMarkdown(label); // 改用 innerHTML 渲染 markdown
                btn.onclick = () => {
                    collapseToSelected(label);
                    const inputEl = document.getElementById('studio-input');
                    if (!inputEl) return;
                    inputEl.value = label;
                    inputEl.dispatchEvent(new Event('input')); // 觸發 autosize
                    // 標記下一條 user 訊息來自 choice 點擊（重整後可恢復「已選」狀態）
                    window.__nextUserMsgFromChoice = true;
                    handleSend();
                };
                btnRow.appendChild(btn);
            });
            // 加「✏️ 其他...」按鈕
            const otherBtn = document.createElement('button');
            otherBtn.className = 'studio-choice-btn studio-choice-other';
            otherBtn.textContent = '✏️ 其他想法...';
            otherBtn.onclick = () => {
                collapseToSelected('✏️ 自己輸入');
                const inputEl = document.getElementById('studio-input');
                if (inputEl) {
                    inputEl.focus();
                    inputEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            };
            btnRow.appendChild(otherBtn);
            bubble.appendChild(btnRow);
        }

        return bubble;
    }

    // 將 AI 回應爆成多個泡泡，依序錯開出現
    function appendSegmentBubbles(container, text, delayBase = 0) {
        const segs = parseSegments(text);
        segs.forEach((seg, i) => {
            setTimeout(() => {
                container.appendChild(createSegmentBubble(seg, true));
                container.scrollTop = container.scrollHeight;
            }, delayBase + i * 160);
        });
        return segs.length;
    }

    async function handleSend() {
        const inputEl = document.getElementById('studio-input');
        const text = inputEl.value.trim();
        if (!text && pendingImages.length === 0) return;

        // === Worldbook 模式：用戶不用先取名字，第一次發送自動建頻道 ===
        if (currentMode === 'worldbook' && !activeCategory) {
            autoCreateChannel();
        }

        // === VN 模式：發送前先嘗試從聊天歷史恢復 currentParsedData（cache miss / 第一次 parse 失敗的兜底）===
        if (currentMode === 'vn_ui' && !currentParsedData && !window.__vnForceFullRefine) {
            extractLatestJsonFromHistory();
            if (currentParsedData) {
                console.log('[Studio] 🛟 currentParsedData 是空的，從聊天歷史救回了一份面板資料，走 diff 路徑');
            }
        }

        // === VN 模式：已有面板時，走 diff-based refine（AI 給 find/replace pair，前端套用） ===
        // 用戶完全不接觸技術術語；AI 沒指定的原文物理上動不到 → 真正做到「只改改的、保留沒改的」
        if (currentMode === 'vn_ui' && currentParsedData && !Array.isArray(currentParsedData) && !window.__vnForceFullRefine) {
            return handleDiffVNRefine(text);
        }

        // 強制 full refine 路徑（🔄 重新設計按鈕、或還沒有 currentParsedData 的首次生成）
        if (currentMode === 'vn_ui' && currentParsedData) {
            snapshotCurrentVNState(text, 'all');
            renderVNHistoryArea();
        }
        window.__vnForceFullRefine = false;

        const sendBtn = document.getElementById('studio-send-btn');
        inputEl.value = '';
        inputEl.style.height = '50px';
        inputEl.disabled = true;
        sendBtn.disabled = false;
        sendBtn.innerText = '⏹ 停止';
        sendBtn.onclick = () => { if (_studioAbortCtrl) _studioAbortCtrl.abort(); };
        _studioAbortCtrl = new AbortController();

        // 帶圖時 content 變陣列；不帶圖時還是字串（向後兼容既有清洗 / parse 邏輯）
        const userContent = buildUserMessageContent(text, pendingImages);
        const userMsg = { role: 'user', content: userContent };
        // 標記是否來自選項按鈕點擊（重整後可恢復「已選展示」狀態）
        if (window.__nextUserMsgFromChoice) {
            userMsg._fromChoice = true;
            window.__nextUserMsgFromChoice = false;
        }
        chatMessages.push(userMsg);
        pendingImages = [];
        renderPendingImages();
        _studioSave(getChatSessionId()); // 用戶發送時先存一次，防 AI 失敗後訊息遺失
        renderChatHistory();

        const container = document.getElementById('studio-chat-history');
        const aiBubble = document.createElement('div');
        aiBubble.className = 'studio-bubble ai';
        // 一建立就放打字三點，不等 API 第一個 chunk（避免空泡泡尷尬幾秒）
        aiBubble._typingSet = true;
        aiBubble.innerHTML = `<div class="studio-typing-wrap">
            <span class="studio-typing-dot"></span>
            <span class="studio-typing-dot"></span>
            <span class="studio-typing-dot"></span>
        </div>`;
        container.appendChild(aiBubble);
        container.scrollTop = container.scrollHeight;

        try {
            const apiEngine = win.OS_API || window.OS_API;
            if (!apiEngine || !apiEngine.chat) throw new Error("找不到 API 引擎");

            let baseConfig = win.OS_SETTINGS?.getConfig?.() || JSON.parse(localStorage.getItem('os_global_config') || '{}');
            const pureConfig = { ...baseConfig, usePresetPrompts: false, enableThinking: false, temperature: 0.7 };

            // 過濾：content 是字串時要 trim、陣列時要有內容；跳過已壓縮的原始對話（_isCompressed）
            let apiPayload = JSON.parse(JSON.stringify(chatMessages.filter(m => {
                if (m._isCompressed) return false; // 已壓縮 → 不再送
                if (typeof m.content === 'string') return m.content.trim();
                if (Array.isArray(m.content)) return m.content.length > 0;
                return false;
            })));

            // 摘要訊息：role 改成 system 送上去（AI 把它當系統提示讀，不會誤當對話）
            apiPayload.forEach(m => {
                if (m._isSummary) {
                    m.role = 'system';
                    m.content = `【📌 早期對話摘要 #${m._summaryNum}（壓縮自 ${m._compressedCount} 條對話）】\n${typeof m.content === 'string' ? m.content : messageContentToString(m.content)}`;
                }
            });

            // 🛟 把當前最新面板資料注入到 apiPayload（永遠保證 AI 看得到最新版面板）
            // 這條注入的是 currentParsedData（含 diff 修改後的最新 JSON），不依賴聊天歷史
            if (currentMode === 'vn_ui' && currentParsedData && !Array.isArray(currentParsedData)) {
                try {
                    apiPayload.unshift({
                        role: 'system',
                        content: `【當前面板狀態（最新版，請以此為基準回應；用戶說「改 X」就是針對這份資料動 X）】\n<json>${JSON.stringify(currentParsedData)}</json>`
                    });
                } catch(e) { console.warn('[Studio] 注入當前面板狀態失敗:', e); }
            }

            // 圖片修剪：只保留最近 N 張圖在 context 中，其他帶圖訊息圖被剝掉只留文字 + 占位
            pruneImagesFromHistory(apiPayload);

            // 找出「最新一條含面板 JSON 的訊息索引」—— 這條不清洗，其他舊版照清
            let latestPanelMsgIdx = -1;
            for (let i = apiPayload.length - 1; i >= 0; i--) {
                const m = apiPayload[i];
                const text = typeof m.content === 'string' ? m.content : messageContentToString(m.content);
                if (/<json>[\s\S]*?<\/json>/i.test(text) || /\{\s*"(?:tagId|id|category)"[\s\S]*"(?:html|content|vars)"/i.test(text)) {
                    latestPanelMsgIdx = i;
                    break;
                }
            }

            // 清洗舊版面板資料（跳過 latestPanelMsgIdx 保留最新版）
            apiPayload.forEach((m, idx) => {
                if (idx === latestPanelMsgIdx) return; // 🛡️ 最新面板資料絕對不清
                if (m.role !== 'assistant' || !m.content) return;
                const hideMsg = '[系統紀錄: ✅ 此為舊版資料，已被更新版本取代，自動隱藏節省 Context]';
                const applyCleanup = (s) => {
                    if (typeof s !== 'string') return s;
                    s = s.replace(/<json>[\s\S]*?<\/json>/gi, hideMsg);
                    s = s.replace(/\[\s*\{[\s\S]*?"(?:category|tagId|id)"[\s\S]*\}\s*\]/g, hideMsg);
                    s = s.replace(/\{\s*"(?:category|tagId|id)"[\s\S]*?\}/g, hideMsg);
                    s = s.replace(/<scope>[\s\S]*?<\/scope>/gi, '');
                    s = s.replace(/<(css|js|html|demoFormat|usageDesc)>[\s\S]*?<\/\1>/gi, hideMsg);
                    // worldbook todo 標籤：已被前端應用、不需要重送 AI
                    s = s.replace(/<todo_(init|done|add)>[\s\S]*?<\/todo_\1>/gi, '');
                    return s;
                };
                if (typeof m.content === 'string') {
                    m.content = applyCleanup(m.content);
                } else if (Array.isArray(m.content)) {
                    m.content.forEach(part => {
                        if (part && part.type === 'text') part.text = applyCleanup(part.text || '');
                    });
                }
            });

            if (currentParsedData && apiPayload.length > 0) {
                const lastUserMsg = apiPayload.pop();
                apiPayload.push({
                    role: 'system',
                    content: `【當前最新已生成的資料狀態 (僅供參考與修改)】\n<json>\n${JSON.stringify(currentParsedData)}\n</json>`
                });
                apiPayload.push(lastUserMsg);
            }

            if (currentMode === 'worldbook' && activeCategory && win.OS_DB && win.OS_DB.getStudioDraftsByCategory) {
                try {
                    const draftData = await win.OS_DB.getStudioDraftsByCategory(activeCategory);
                    if (draftData.length > 0) {
                        let contextStr = `【系統隱藏提示：以下是當前專案 (${activeCategory}) 的既有草稿設定，請以此擴充，勿覆蓋現有設定。】\n`;
                        draftData.forEach(e => {
                            contextStr += `[${e.type === 'lore'?'背景':e.type==='character'?'角色':'其他'}] ${e.title}：\n${e.content}\n\n`;
                        });
                        apiPayload.unshift({ role: 'system', content: contextStr });
                    }
                } catch(e) { }
            }

            const useRealStream = !pureConfig.useSystemApi && !!pureConfig.url && !!pureConfig.key;

            await new Promise((resolve, reject) => {
                apiEngine.chat(apiPayload, pureConfig,
                    () => {
                        if (!aiBubble._typingSet) {
                            aiBubble._typingSet = true;
                            aiBubble.innerHTML = `<div class="studio-typing-wrap">
                                <span class="studio-typing-dot"></span>
                                <span class="studio-typing-dot"></span>
                                <span class="studio-typing-dot"></span>
                            </div>`;
                            container.scrollTop = container.scrollHeight;
                        }
                    },
                    (finalText) => {
                        const lockedChatId = getChatSessionId();
                        aiBubble.remove();
                        chatMessages.push({ role: 'assistant', content: finalText });
                        _studioSave(lockedChatId);
                        appendSegmentBubbles(container, finalText);
                        extractAndParseJson(finalText);
                        // worldbook 模式：抽 todo 標籤、更新任務面板
                        _applyTodoTagsFromAI(finalText);
                        // worldbook 模式：背景檢查是否需要壓縮舊對話為摘要記憶
                        _studioCompressIfNeeded();
                        _updateCompressBtnState();
                        resolve();
                    },
                    reject,
                    { useRealStream, disableTyping: useRealStream, signal: _studioAbortCtrl.signal }
                );
            });

        } catch (err) {
            if (err.name === 'AbortError' || err.message?.includes('abort')) {
                // 使用者主動停止：保留打字泡泡改成已停止提示
                aiBubble.innerHTML = '<span style="color:rgba(26,28,40,0.72); font-size:12px;">⏹ 已停止</span>';
            } else {
                _renderErrorBubble(aiBubble, err, () => _retryLastSend(aiBubble));
            }
        } finally {
            _studioAbortCtrl = null;
            inputEl.disabled = false;
            sendBtn.disabled = false;
            sendBtn.innerText = '發送';
            sendBtn.onclick = handleSend; // 恢復發送功能
            inputEl.focus();
        }
    }

    // 渲染錯誤泡泡 + 重試按鈕
    function _renderErrorBubble(bubble, err, onRetry) {
        bubble.classList.add('studio-error-bubble');
        bubble.innerHTML = `
            <div class="studio-error-msg">❌ 錯誤：${(err.message || err || '未知錯誤').replace(/</g, '&lt;')}</div>
            <button class="studio-retry-btn">🔄 重試</button>
        `;
        bubble.querySelector('.studio-retry-btn').onclick = onRetry;
    }

    // 重試 handleSend：抽出最後一條 user 訊息、清掉錯誤泡泡、重新呼叫
    function _retryLastSend(errBubble) {
        // 找最後一條未壓縮的 user 訊息
        let lastUserIdx = -1;
        for (let i = chatMessages.length - 1; i >= 0; i--) {
            const m = chatMessages[i];
            if (m._isCompressed || m._isSummary) continue;
            if (m.role === 'user') { lastUserIdx = i; break; }
        }
        if (lastUserIdx === -1) { alert('找不到上次的訊息，請重新輸入'); return; }
        const lastUserMsg = chatMessages[lastUserIdx];
        const textOnly = messageContentToString(lastUserMsg.content);
        // 復原圖片（如果有）
        if (Array.isArray(lastUserMsg.content)) {
            pendingImages = lastUserMsg.content
                .filter(p => p.type === 'image_url')
                .map(p => ({ dataUrl: p.image_url?.url || '', mime: 'image/jpeg', sizeKB: 0 }));
            renderPendingImages();
        }
        // 從 chatMessages 移除這條 user（handleSend 會再 push 一條新的）
        chatMessages.splice(lastUserIdx, 1);
        // 砍錯誤泡泡
        errBubble.remove();
        // 填回輸入框 + 重新發送
        const inputEl = document.getElementById('studio-input');
        if (inputEl) {
            inputEl.value = textOnly;
            handleSend();
        }
    }

    function renderChatHistory() {
        const container = document.getElementById('studio-chat-history');
        container.innerHTML = '';
        chatMessages.forEach((msg, idx) => {
            if (msg.role === 'system') return;
            // 已被壓縮的原始對話：不渲染（記憶在摘要泡泡裡）
            if (msg._isCompressed) return;
            // 摘要泡泡：特殊樣式渲染
            if (msg._isSummary) {
                const bubble = document.createElement('div');
                bubble.className = 'studio-bubble studio-summary-bubble';
                const headerText = `📌 摘要 #${msg._summaryNum}　·　壓縮了 ${msg._compressedCount} 條早期對話`;
                bubble.innerHTML = `
                    <div class="summary-header">${headerText}</div>
                    <div class="summary-content">${renderMarkdown(messageContentToString(msg.content))}</div>
                    <div class="summary-foot">↑ 此區為 AI 的長線記憶，會永久保留作為上下文。原始對話已從 context 移除（節省 token）。</div>
                `;
                container.appendChild(bubble);
                return;
            }
            if (msg.role === 'user') {
                const bubble = document.createElement('div');
                bubble.className = 'studio-bubble user';
                // 兼容 multimodal content（陣列）→ 文字 + 圖片縮圖一起渲染
                if (Array.isArray(msg.content)) {
                    const textPart = msg.content.filter(p => p && p.type === 'text').map(p => p.text || '').join('\n');
                    if (textPart) {
                        const span = document.createElement('div');
                        span.textContent = textPart;
                        bubble.appendChild(span);
                    }
                    const imgs = msg.content.filter(p => p && p.type === 'image_url');
                    if (imgs.length > 0) {
                        const row = document.createElement('div');
                        row.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;';
                        imgs.forEach(p => {
                            const im = document.createElement('img');
                            im.src = p.image_url?.url || '';
                            im.style.cssText = 'max-width:120px;max-height:120px;border-radius:6px;border:1px solid rgba(26,28,40,0.15);cursor:pointer;';
                            im.onclick = () => window.open(p.image_url?.url, '_blank');
                            row.appendChild(im);
                        });
                        bubble.appendChild(row);
                    }
                } else {
                    bubble.textContent = msg.content || '';
                }
                container.appendChild(bubble);
            } else {
                // AI 訊息：解析成多泡泡，歷史重建不帶入場動畫
                // lookahead 下一條 user 訊息：如果它是來自 choice 點擊（_fromChoice），把它的內容當作「已選 label」傳給 choices bubble
                let selectedLabel = null;
                for (let i = idx + 1; i < chatMessages.length; i++) {
                    const next = chatMessages[i];
                    if (next._isCompressed || next._isSummary || next.role === 'system') continue;
                    if (next.role === 'user') {
                        if (next._fromChoice) selectedLabel = messageContentToString(next.content);
                        break;
                    }
                    if (next.role === 'assistant') break;
                }
                parseSegments(messageContentToString(msg.content)).forEach(seg => {
                    container.appendChild(createSegmentBubble(seg, false, { selectedLabel }));
                });
            }
        });
        container.scrollTop = container.scrollHeight;
    }

    function extractLatestJsonFromHistory() {
        // 🥇 第一順位：找 [LATEST_PANEL_STATE] 標記訊息（diff 修改後存進的最新版本）
        for (let i = chatMessages.length - 1; i >= 0; i--) {
            const m = chatMessages[i];
            const text = messageContentToString(m.content);
            if (m._isLatestPanel === true || (typeof text === 'string' && text.includes(LATEST_PANEL_MARKER))) {
                if (extractAndParseJson(text)) {
                    console.log('[Studio] 🥇 從聊天記錄撈到「最新版」面板狀態');
                    return;
                }
            }
        }
        // 🥈 退回找最新的 assistant 訊息（通常只能撈到初版）
        for (let i = chatMessages.length - 1; i >= 0; i--) {
            if (chatMessages[i].role === 'assistant') {
                if (extractAndParseJson(messageContentToString(chatMessages[i].content))) {
                    console.warn('[Studio] 🥈 沒找到最新版標記，退回抽 assistant 訊息（可能是初版）');
                    return;
                }
            }
        }
    }

    function extractAndParseJson(text) {
        if (!text) return false;
        let cleanStr = "";
        
        // 1. 先定位目標區域：優先找 <json> 標籤，找不到就找全文
        const xmlMatch = text.match(/<json>([\s\S]*?)<\/json>/i);
        const targetArea = xmlMatch ? xmlMatch[1] : text;

        // 2. 利用貪婪正則直接捕捉最外層的 {} 或 [] 
        // 這樣能自動且完美地過濾掉開頭的 ```json、結尾的 ``` 以及任何 AI 夾帶的廢話
        const objMatch = targetArea.match(/\{[\s\S]*\}/);
        const arrMatch = targetArea.match(/\[[\s\S]*\]/);

        // 判斷哪個結構先出現 (防呆機制)
        if (objMatch && arrMatch) {
            cleanStr = objMatch.index < arrMatch.index ? objMatch[0] : arrMatch[0];
        } else if (objMatch) {
            cleanStr = objMatch[0];
        } else if (arrMatch) {
            cleanStr = arrMatch[0];
        }

        if (cleanStr) {
            try {
                // 清除可能導致解析失敗的隱藏控制字符 (保留你原本的邏輯)
                cleanStr = cleanStr.replace(/[\u0000-\u0009\u000B-\u001F]+/g, "");
                const parsed = JSON.parse(cleanStr);

                // 🔪 VN 模式：保留 history（本地 metadata，AI 不該動到）
                if (currentMode === 'vn_ui' && currentParsedData && currentParsedData.history && !Array.isArray(parsed)) {
                    parsed.history = currentParsedData.history;
                }
                currentParsedData = parsed;

                activePreviewData = Array.isArray(currentParsedData) ? currentParsedData[0] : currentParsedData;
                
                if (activePreviewData && activePreviewData.category && currentMode === 'worldbook') {
                    if (activeCategory !== activePreviewData.category) {
                        activeCategory = activePreviewData.category;
                        document.getElementById('studio-channel-badge').textContent = `📍 ${activeCategory}`;
                        // 分類確認的瞬間，把當前對話記錄遷移到該分類的專屬 key 下
                        _studioSave(getChatSessionId());
                        refreshWorldbookSidebar();
                    }
                }
                renderPreviewPanel();
                return true;
            } catch (e) {
                console.warn('[Studio] JSON 解析失敗，這傢伙可能連括號都沒閉合：', e);
                return false;
            }
        }
        return false;
    }

    // reentrancy 鎖 + pending 標記：同時間只跑一次 refresh，防 race condition 重複 append
    let _sidebarRefreshing = false;
    let _sidebarRefreshPending = false;
    async function refreshWorldbookSidebar() {
        if (_sidebarRefreshing) {
            _sidebarRefreshPending = true;
            return;
        }
        _sidebarRefreshing = true;
        try {
            await _doRefreshWorldbookSidebar();
        } finally {
            _sidebarRefreshing = false;
            if (_sidebarRefreshPending) {
                _sidebarRefreshPending = false;
                refreshWorldbookSidebar();
            }
        }
    }

    async function _doRefreshWorldbookSidebar() {
        const container = document.getElementById('studio-tree-container');
        if (!container) return;
        container.innerHTML = '';

        const allEntries = (win.OS_DB && win.OS_DB.getAllStudioDrafts)
            ? await win.OS_DB.getAllStudioDrafts().catch(() => []) : [];

        // 先收集所有分類（trim 後當 key、物件天然去重）
        const categories = {};
        allEntries.forEach(entry => {
            const cat = _normalizeChannelName(entry.category || '未分類') || '未分類';
            if (!categories[cat]) categories[cat] = [];
            categories[cat].push(entry);
        });

        // 合併 localStorage 持久化的頻道
        _channelKeys().forEach(name => {
            if (!categories[name]) categories[name] = [];
        });

        // 若目前頻道不在草稿裡，也要顯示
        const activeT = _normalizeChannelName(activeCategory || '');
        if (activeT && !categories[activeT]) {
            categories[activeT] = [];
        }


        const typeIcons = { lore:'📜', character:'👤', rule:'⚙️', location:'🗺️', other:'📄' };

        if (!Object.keys(categories).length) {
            container.innerHTML = '<div style="padding:16px 14px; color:rgba(26,28,40,0.40); font-size:11px; text-align:center;">尚無任何頻道<br>點上方「➕ 新建頻道」開始</div>';
            return;
        }

        Object.keys(categories).sort().forEach(catName => {
            const files = categories[catName];
            const isActive = catName === activeCategory;

            // 頻道標題行
            const chEl = document.createElement('div');
            chEl.className = 'studio-ch-entry' + (isActive ? ' active-ch' : '');
            chEl.innerHTML = `<span style="font-size:13px;">📁</span><span class="studio-ch-name" title="雙擊改名">${catName}</span>${files.length ? `<span style="font-size:10px; opacity:0.5;">${files.length}</span>` : ''}<button class="studio-ch-del" title="刪除此頻道所有草稿">🗑</button>`;
            chEl.onclick = async (e) => {
                // 點到改名 input 不要觸發切換
                if (e.target.classList.contains('studio-ch-name-input')) return;
                closeMobileSidebar();
                if (isActive) return;
                activeCategory = catName;
                activePreviewData = null;
                currentParsedData = null;
                await switchChatSession();
                refreshWorldbookSidebar();
                updateWorldbookWelcome();
            };
            // 雙擊頻道名 → inline 改名
            const nameEl = chEl.querySelector('.studio-ch-name');
            nameEl.ondblclick = (e) => {
                e.stopPropagation();
                const oldName = catName;
                const input = document.createElement('input');
                input.className = 'studio-ch-name-input';
                input.value = oldName;
                input.spellcheck = false;
                nameEl.replaceWith(input);
                input.focus();
                input.select();

                const commit = async () => {
                    const newName = input.value.trim();
                    if (!newName || newName === oldName) { refreshWorldbookSidebar(); return; }
                    const ok = await renameStudioCategory(oldName, newName);
                    if (ok) {
                        if (isActive) await switchChatSession();
                        refreshWorldbookSidebar();
                    } else {
                        refreshWorldbookSidebar();
                    }
                };
                const cancel = () => { refreshWorldbookSidebar(); };

                input.onblur = commit;
                input.onkeydown = (ev) => {
                    if (ev.key === 'Enter') { ev.preventDefault(); input.onblur = null; commit(); }
                    if (ev.key === 'Escape') { ev.preventDefault(); input.onblur = null; cancel(); }
                };
            };
            // 刪除頻道（清空該分類所有草稿 + 聊天記錄）
            chEl.querySelector('.studio-ch-del').onclick = async (e) => {
                e.stopPropagation();
                if (!confirm(`確定刪除頻道「${catName}」的所有草稿？\n（聊天記錄也會一併清除）`)) return;
                // 刪除所有草稿條目
                if (win.OS_DB && win.OS_DB.deleteStudioDraftsByCategory) {
                    await win.OS_DB.deleteStudioDraftsByCategory(catName).catch(e=>e);
                } else if (win.OS_DB && win.OS_DB.getAllStudioDrafts) {
                    // fallback: 逐一刪除
                    const all = await win.OS_DB.getAllStudioDrafts().catch(()=>[]);
                    for (const e of all.filter(x => x.category === catName)) {
                        if (win.OS_DB.deleteStudioDraft) await win.OS_DB.deleteStudioDraft(e.id).catch(()=>{});
                    }
                }
                // 清除聊天記錄
                const chatKey = `worldbook_draft_${catName}`;
                if (win.OS_DB?.clearStudioChat) win.OS_DB.clearStudioChat(chatKey).catch(()=>{});
                localStorage.removeItem(`os_studio_chat_${chatKey}`);
                // 從持久化頻道列表移除
                _removeChannelFromList(catName);
                // 清掉該頻道的摘要計數器（下次同名頻道從 #1 開始）
                localStorage.removeItem(`os_studio_summary_count_${chatKey}`);
                // 清掉該頻道的 todo 任務
                _clearTodos(chatKey);
                // 若刪的是當前頻道，切回空白 + 顯示啟動頁
                if (activeCategory === catName) {
                    activeCategory = null;
                    activePreviewData = null;
                    currentParsedData = null;
                    chatMessages = [{ role: 'system', content: MODES['worldbook'].prompt }];
                    const badge = document.getElementById('studio-channel-badge');
                    if (badge) badge.style.display = 'none';
                    renderChatHistory();
                    renderPreviewPanel();
                }
                refreshWorldbookSidebar();
                updateWorldbookWelcome();
            };
            container.appendChild(chEl);

            // 該頻道下的草稿條目（折疊顯示）
            if (isActive && files.length) {
                files.forEach(file => {
                    const fileEl = document.createElement('div');
                    fileEl.className = 'studio-ch-file' + (activePreviewData?.title === file.title ? ' active-file' : '');
                    fileEl.innerHTML = `<span>${typeIcons[file.type] || '📄'}</span><span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${file.title}</span><button class="studio-ch-del" title="刪除此草稿">✕</button>`;
                    fileEl.onclick = async (e) => {
                        e.stopPropagation();
                        closeMobileSidebar();
                        activePreviewData = file;
                        currentParsedData = null;
                        renderPreviewPanel();
                        refreshWorldbookSidebar();
                    };
                    // 刪除單筆草稿
                    fileEl.querySelector('.studio-ch-del').onclick = async (e) => {
                        e.stopPropagation();
                        if (!confirm(`刪除草稿「${file.title}」？`)) return;
                        if (win.OS_DB && win.OS_DB.deleteStudioDraft) {
                            await win.OS_DB.deleteStudioDraft(file.id).catch(()=>{});
                        }
                        if (activePreviewData?.id === file.id) { activePreviewData = null; currentParsedData = null; renderPreviewPanel(); }
                        refreshWorldbookSidebar();
                    };
                    container.appendChild(fileEl);
                });
                const divider = document.createElement('div');
                divider.className = 'studio-ch-divider';
                container.appendChild(divider);
            }
        });
    }

    // ── st helper builder（給「預覽器」「展廳」兩處共用；酒館 wrapper 內另有一份） ──
    function _buildPreviewSt(lines) {
        const imgManager = window.OS_IMAGE_MANAGER || (window.parent && window.parent.OS_IMAGE_MANAGER);
        return {
            md(text) {
                if (!text) return '';
                const rxBold = new RegExp('[*][*](.+?)[*][*]', 'g');
                const rxItalic = new RegExp('[*](.+?)[*]', 'g');
                const rxCode = new RegExp('[`](.+?)[`]', 'g');
                return String(text)
                    .replace(rxBold, (_, p1) => '<b>' + p1 + '</b>')
                    .replace(rxItalic, (_, p1) => '<i>' + p1 + '</i>')
                    .replace(rxCode, (_, p1) => '<code>' + p1 + '</code>');
            },
            parse() {
                const result = {};
                (lines || []).forEach(line => {
                    line = line.trim();
                    if (line.charAt(0) !== '[' || line.charAt(line.length-1) !== ']') return;
                    const inner = line.slice(1, -1);
                    const parts = inner.split('|');
                    const tag = parts[0];
                    const fields = parts.slice(1);
                    if (!result[tag]) result[tag] = [];
                    result[tag].push(fields);
                });
                return result;
            },
            async setImage(el, prompt, type) {
                if (!el || !prompt) return;
                type = type || 'scene';
                try {
                    const url = window.__IS_PREVIEW
                        ? ('https://api.dicebear.com/7.x/shapes/svg?seed=' + encodeURIComponent(prompt))
                        : (imgManager ? await imgManager.generate(prompt, type) : '');
                    if (url) el.src = url;
                } catch(e) {
                    console.error('[preview] setImage 失敗:', e);
                }
            }
        };
    }

    // ── VN 展廳 ──────────────────────────────────────────────────────

    async function syncActiveTagsToLocal() {
        const db = win.OS_DB || window.OS_DB;
        if (!db || typeof db.getAllVNTagTemplates !== 'function') return;
        try {
            const templates = await db.getAllVNTagTemplates();
            const activeTags = templates.filter(t => t.isActive && t.demoFormat);
            if (activeTags.length > 0) {
                let extraPrompt = `\n\n### [擴充動態特效標籤]\n你現在擁有額外的視覺特效標籤。在適合的時機，將標籤作為獨立區塊輸出（與 <content> 並列，不可放在 <content> 內）：\n`;
                activeTags.forEach(t => {
                    extraPrompt += `\n【標籤：${t.tagId}】\n說明：${t.usageDesc || '無特別說明'}\n⚠️ 輸出時必須用 <${t.tagId}> 和 </${t.tagId}> 包裹，每行一條 [Tag|欄位|欄位] 格式，嚴禁使用 ## markdown 或 * bullet：\n<${t.tagId}>\n${t.demoFormat}\n</${t.tagId}>\n`;
                });
                localStorage.setItem('os_vn_extra_tags_prompt', extraPrompt);
            } else {
                localStorage.removeItem('os_vn_extra_tags_prompt');
            }
        } catch(e) { console.warn('[Studio] syncActiveTagsToLocal 失敗', e); }
    }

    // ============================================================
    // === 注入酒館正則 + 主世界書（從 vn_ui_workshop.js 搬過來整合）===
    // 把展廳中的 VN UI 面板一鍵寫入酒館全局正則 + 折疊進主世界書當綠燈觸發
    // ============================================================
    function generateRegexReplacement(data) {
        if (!data || !data.tagId) return '';
        const safeTagId = data.tagId.replace(/[^a-zA-Z0-9_-]/g, '');
        let htmlContent = (data.html || '').replace(/\{\{(\d+)\}\}/g, '$$$$$1');

        // 完整 HTML 結構（DOCTYPE + html + head + body）— srcdoc 才能正確走 standards mode
        let fullHtml = `<!DOCTYPE html>\n<html>\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<style>\n${data.css || ''}\n</style>\n</head>\n<body>\n`;
        // 容器不寫 hardcoded id —— 多實例時 id 會撞，document.getElementById 抓錯
        fullHtml += `<div class="vn-dynamic-panel-${safeTagId}">\n${htmlContent}\n</div>\n`;

        if (data.js) {
            let safeJs = data.js.replace(/\x60\x60\x60(?:javascript|js|html|css)?/gi, '').replace(/\x60\x60\x60/g, '').trim();
            const safeJsForPlainScript = safeJs.replace(/<\/script>/gi, '<\\/script>');
            // 兄弟節點順序：<div>(container) ← <textarea>(rawtext) ← <script type=text/plain>(userJs) ← <script>(執行端)
            // 執行端用 document.currentScript.previousElementSibling 鏈式找上層 — 完全廢棄 id 機制
            fullHtml += `\n<textarea style="display:none;">$1</textarea>\n`;
            fullHtml += `<script type="text/plain">${safeJsForPlainScript}</script>\n`;
            fullHtml += `<script>
(async function(){
  try {
    const _script = document.currentScript;
    const userJsEl = _script ? _script.previousElementSibling : null;
    const rawTextEl = userJsEl ? userJsEl.previousElementSibling : null;
    const container = rawTextEl ? rawTextEl.previousElementSibling : null;
    if (!container) { console.error('[${safeTagId}] 找不到 DOM 容器'); return; }
    const ctx = window.parent || window;
    const imgManager = ctx.OS_IMAGE_MANAGER || window.OS_IMAGE_MANAGER;
    const rawText = rawTextEl ? rawTextEl.value : '';
    const lines = rawText.split('\\n').map(function(l){return l.trim();}).filter(Boolean);
    let __userJs = userJsEl ? userJsEl.textContent : '';
    __userJs = __userJs.replace(/[\\u2028\\u2029]/g, '\\n');
    window.__IS_PREVIEW = false;
    // ===== st helper：AI 寫面板只用這個 API，免疫所有出錯雷區 =====
    const st = {
      md: function(text){
        if (!text) return '';
        var rxBold = new RegExp('[*][*](.+?)[*][*]', 'g');
        var rxItalic = new RegExp('[*](.+?)[*]', 'g');
        var rxCode = new RegExp('[\`](.+?)[\`]', 'g');
        return String(text)
          .replace(rxBold, function(_, p1){ return '<b>' + p1 + '</b>'; })
          .replace(rxItalic, function(_, p1){ return '<i>' + p1 + '</i>'; })
          .replace(rxCode, function(_, p1){ return '<code>' + p1 + '</code>'; });
      },
      parse: function(){
        var result = {};
        lines.forEach(function(line){
          line = line.trim();
          if (line.charAt(0) !== '[' || line.charAt(line.length-1) !== ']') return;
          var inner = line.slice(1, -1);
          var parts = inner.split('|');
          var tag = parts[0];
          var fields = parts.slice(1);
          if (!result[tag]) result[tag] = [];
          result[tag].push(fields);
        });
        return result;
      },
      setImage: async function(el, prompt, type){
        if (!el || !prompt) return;
        type = type || 'scene';
        try {
          var url = window.__IS_PREVIEW
            ? ('https://api.dicebear.com/7.x/shapes/svg?seed=' + encodeURIComponent(prompt))
            : (imgManager ? await imgManager.generate(prompt, type) : '');
          if (url) el.src = url;
        } catch(e) {
          console.error('[${safeTagId}] setImage 失敗:', e);
        }
      }
    };
    // ============================================================
    const __onComplete = function(){};
    try {
      const __fn = new Function('container', 'lines', 'onComplete', 'st', __userJs);
      __fn(container, lines, __onComplete, st);
    } catch(jsErr) {
      console.error('[${safeTagId}] JS 執行錯誤:', jsErr.message);
      console.error('[${safeTagId}] JS stack:', jsErr.stack);
      const errBox = document.createElement('div');
      errBox.style.cssText = 'color:#fc8181;padding:10px;background:rgba(252,129,129,0.1);border:1px dashed #fc8181;border-radius:6px;margin:10px;font-size:12px;font-family:monospace;';
      errBox.textContent = '⚠️ 面板腳本錯誤: ' + jsErr.message + '\\n（HTML 還是會顯示，但動態效果失效）';
      container.appendChild(errBox);
    }
  } catch(e) {
    console.error('${safeTagId} 外層錯誤:', e);
  }
})();
</script>
`;
        }
        fullHtml += `</body>\n</html>`;
        return "```\n" + fullHtml + "\n```";
    }

    // 把標籤說明折疊進主世界書，吃綠燈關鍵字觸發（省 token）
    async function syncPromptToWorldbook(th, data) {
        if (typeof th.getCharWorldbookNames !== 'function') return false;

        const charWbInfo = th.getCharWorldbookNames('current');
        const primaryWb = charWbInfo?.primary;
        if (!primaryWb) return false;

        const safeTagId = (data.tagId || '').replace(/[^a-zA-Z0-9_-]/g, '');
        if (!safeTagId) return false;
        const ENTRY_NAME = `[VN面板] ${safeTagId}`;

        // 暴力扒掉 demoFormat 外層標籤
        let cleanFormat = (data.demoFormat || '').trim();
        const regStart = new RegExp(`^<${data.tagId}>\\s*`, 'i');
        const regEnd = new RegExp(`\\s*<\\/${data.tagId}>$`, 'i');
        cleanFormat = cleanFormat.replace(regStart, '').replace(regEnd, '').trim();

        // 關鍵字保底：AI 沒給就拿 tagId 當唯一 key
        let keywords = Array.isArray(data.keywords)
            ? data.keywords.filter(k => typeof k === 'string' && k.trim()).map(k => k.trim())
            : [];
        if (keywords.length === 0) keywords = [safeTagId];
        if (!keywords.includes(safeTagId)) keywords.unshift(safeTagId);

        const content = `### [動態特效標籤：${data.tagId}]
劇情提到相關情境時，請輸出此標籤強化視覺效果：

【標籤：${data.tagId}】
說明：${data.usageDesc || '無'}
格式示範：
<${data.tagId}>
${cleanFormat}
</${data.tagId}>`;

        let entries = [];
        try {
            entries = await th.getWorldbook(primaryWb);
        } catch (e) {
            console.error('[Studio] 讀取主世界書失敗:', e);
            return false;
        }

        const exists = entries.some(e => e.name === ENTRY_NAME);
        if (exists) {
            await th.updateWorldbookWith(primaryWb, (wbEntries) => {
                const entry = wbEntries.find(e => e.name === ENTRY_NAME);
                if (entry) {
                    entry.enabled = true;
                    entry.content = content;
                    entry.strategy = { type: 'selective', keys: keywords };
                }
                return wbEntries;
            });
        } else {
            await th.createWorldbookEntries(primaryWb, [{
                name: ENTRY_NAME,
                enabled: true,
                content: content,
                strategy: { type: 'selective', keys: keywords },
                position: { type: 'before_author_note', order: -5 }
            }]);
        }
        return true;
    }

    // 一鍵寫入酒館全局正則 + 同步至主世界書
    async function importToSillyTavern(data) {
        const th = win.TavernHelper || (window.parent && window.parent.TavernHelper);
        if (!th) {
            alert('❌ 找不到酒館（TavernHelper）。需要在酒館環境內 + 已安裝酒館助手腳本才能用這個功能。\n\nPWA 獨立模式不支援此功能。');
            return;
        }

        if (!data || !data.tagId) return;

        const safeTagId = data.tagId.replace(/[^a-zA-Z0-9_-]/g, '');
        const searchRegex = `/<${safeTagId}>([\\s\\S]*?)<\\/${safeTagId}>/gi`;
        const replacement = generateRegexReplacement(data);

        const regexObj = {
            id: th.uuidv4 ? th.uuidv4() : ('vn_tag_' + Date.now()),
            script_name: `[VN面板] ${safeTagId}`,
            enabled: true,
            find_regex: searchRegex,
            replace_string: replacement,
            trim_strings: [],
            source: { user_input: false, ai_output: true, slash_command: false, world_info: false },
            destination: { display: true, prompt: false },
            run_on_edit: true,
            min_depth: null,
            max_depth: null,
            markdownOnly: true,
            promptOnly: false,
            substituteRegex: 0
        };

        try {
            await th.updateTavernRegexesWith(regexes => {
                const filtered = regexes.filter(r => r.script_name !== regexObj.script_name);
                filtered.push(regexObj);
                return filtered;
            }, { type: 'global' });

            let wbMsg = "";
            try {
                const wbSynced = await syncPromptToWorldbook(th, data);
                if (wbSynced) {
                    const keywordHint = Array.isArray(data.keywords) && data.keywords.length
                        ? `\n   觸發關鍵字：${data.keywords.join('、')}`
                        : `\n   觸發關鍵字：${safeTagId}（AI 沒給 keywords，預設只用 tagId）`;
                    wbMsg = `\n✅ 已折疊至角色主世界書（綠燈觸發，劇情提到關鍵字才激活，省 token）${keywordHint}`;
                } else {
                    wbMsg = "\n⚠️ 未找到角色綁定的主世界書，跳過提示詞同步。";
                }
            } catch (e) {
                console.error('[Studio] 世界書同步錯誤:', e);
                wbMsg = "\n❌ 同步主世界書失敗。";
            }

            alert(`🎉 匯入成功！已將標籤 [${safeTagId}] 寫入酒館全局正則。${wbMsg}\n\n請發送新訊息或重新載入聊天查看效果。`);
        } catch (err) {
            console.error('[Studio] 酒館正則匯入失敗:', err);
            alert('❌ 匯入失敗: ' + err.message);
        }
    }

    // ============================================================
    // === 📝 直接編輯原碼 modal（給進階用戶繞過 AI 對話改 tpl JSON）===
    // ============================================================
    let _rawEditingTplId = null;
    let _rawEditingOriginal = null;

    function openRawEditModal(tpl) {
        const modal = document.getElementById('studio-raw-edit-modal');
        const textarea = document.getElementById('raw-edit-textarea');
        const tagIdEl = document.getElementById('raw-edit-tagid');
        const statusEl = document.getElementById('raw-edit-status');
        if (!modal || !textarea) return;

        _rawEditingTplId = tpl.id;
        _rawEditingOriginal = JSON.stringify(tpl, null, 2);

        if (tagIdEl) tagIdEl.textContent = tpl.tagId || tpl.id;
        textarea.value = _rawEditingOriginal;
        if (statusEl) statusEl.textContent = '';
        modal.style.display = 'flex';
        // 點空白關閉
        modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
    }

    function _setupRawEditModalEvents() {
        const modal = document.getElementById('studio-raw-edit-modal');
        if (!modal) return;
        const textarea = document.getElementById('raw-edit-textarea');
        const statusEl = document.getElementById('raw-edit-status');
        const saveBtn = document.getElementById('raw-edit-save');
        const resetBtn = document.getElementById('raw-edit-reset');
        const cancelBtn = document.getElementById('raw-edit-cancel');
        const closeBtn = document.getElementById('raw-edit-close');

        if (closeBtn) closeBtn.onclick = () => { modal.style.display = 'none'; };
        if (cancelBtn) cancelBtn.onclick = () => { modal.style.display = 'none'; };
        if (resetBtn) resetBtn.onclick = () => {
            if (textarea && _rawEditingOriginal) {
                textarea.value = _rawEditingOriginal;
                if (statusEl) statusEl.textContent = '↺ 已重置為原本內容（尚未儲存）';
            }
        };
        if (saveBtn) saveBtn.onclick = async () => {
            if (!textarea || !_rawEditingTplId) return;
            let parsed;
            try {
                parsed = JSON.parse(textarea.value);
            } catch(e) {
                if (statusEl) statusEl.textContent = '❌ JSON 格式錯誤：' + e.message;
                return;
            }
            if (!parsed.tagId) {
                if (statusEl) statusEl.textContent = '❌ 缺少 tagId 欄位';
                return;
            }
            // 保留原本 id（避免改 id 製造孤兒）
            parsed.id = _rawEditingTplId;
            try {
                await win.OS_DB.saveVNTagTemplate(parsed);
                if (typeof syncActiveTagsToLocal === 'function') await syncActiveTagsToLocal();
                if (win.VN_DynamicParser) await win.VN_DynamicParser.init();
                if (statusEl) statusEl.textContent = '✅ 已儲存';
                setTimeout(() => {
                    modal.style.display = 'none';
                    loadStudioGallery();
                }, 600);
            } catch(e) {
                if (statusEl) statusEl.textContent = '❌ 儲存失敗：' + e.message;
            }
        };
    }

    async function loadStudioGallery() {
        const listEl = document.getElementById('studio-gallery-list');
        if (!listEl) return;
        listEl.innerHTML = '<div style="color:#aaa;text-align:center;padding:20px;">載入中...</div>';
        const db = win.OS_DB || window.OS_DB;
        if (!db || typeof db.getAllVNTagTemplates !== 'function') {
            listEl.innerHTML = '<div style="color:#fc8181;text-align:center;padding:20px;">找不到 OS_DB</div>';
            return;
        }
        try {
            const templates = await db.getAllVNTagTemplates();
            if (!templates.length) {
                listEl.innerHTML = '<div style="color:#aaa;text-align:center;padding:20px;">展廳空空如也，去煉丹吧！</div>';
                return;
            }
            listEl.innerHTML = '';
            templates.forEach(tpl => {
                const safeTagId = (tpl.tagId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '');
                const safeFmt   = (tpl.demoFormat || '無結構定義').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                const previewHtml = (tpl.html || '').replace(/\{\{1\}\}/g,'參數A').replace(/\{\{2\}\}/g,'參數B');

                const card = document.createElement('div');
                card.className = 'studio-gallery-card' + (tpl.isActive ? ' active-tag' : '');
                card.innerHTML = `
                    <div class="sgc-header">
                        <span class="sgc-title">[${tpl.tagId || '未知'}]</span>
                        <span class="sgc-status" style="color:${tpl.isActive ? '#2ecc71' : '#aaa'}">${tpl.isActive ? '✅ 啟用' : '❌ 停用'}</span>
                    </div>
                    <div class="sgc-usage">💡 ${tpl.usageDesc || '無說明'}</div>
                    <div class="sgc-format-box">
                        <div class="sgc-format-text">${safeFmt}</div>
                        <textarea class="sgc-format-input">${tpl.demoFormat || ''}</textarea>
                        <div style="display:flex;gap:6px;margin-top:6px;justify-content:flex-end;">
                            <span class="sgc-btn btn-edit-fmt" style="flex:none;padding:4px 10px;border-color:#3498db;color:#3498db;background:transparent;">✏️ 編輯</span>
                            <span class="sgc-btn btn-save-fmt" style="display:none;flex:none;padding:4px 10px;border-color:rgba(26,28,40,0.30);color:#1A1C28;background:rgba(26,28,40,0.08);">💾 儲存</span>
                            <span class="sgc-btn btn-cancel-fmt" style="display:none;flex:none;padding:4px 10px;border-color:#e74c3c;color:#e74c3c;background:transparent;">✖ 取消</span>
                        </div>
                    </div>
                    ${tpl.css ? `<style>${tpl.css}</style>` : ''}
                    <div class="sgc-preview">
                        <div class="vn-dynamic-panel-${safeTagId}" style="width:100%;height:auto;display:flex;flex-direction:column;">
                            ${previewHtml}
                        </div>
                    </div>
                    <div class="sgc-btns">
                        <div class="sgc-btn btn-continue" style="background:rgba(26,28,40,0.08);border-color:#1A1C28;color:#1A1C28;" title="把這個面板載回煉丹爐，用對話繼續微調樣式">✏️ 繼續編輯</div>
                        <div class="sgc-btn btn-edit-raw" style="background:rgba(155,89,182,0.12);border-color:#9b59b6;color:#c39bf2;" title="直接編輯原始 JSON（html/css/js/demoFormat）— 給進階用戶用">📝 編輯原碼</div>
                        <div class="sgc-btn btn-import-st" style="background:rgba(26,28,40,0.08);border-color:rgba(26,28,40,0.30);color:#1A1C28;" title="一鍵寫入酒館全局正則 + 折疊進主世界書">📥 注入酒館正則</div>
                        <div class="sgc-btn btn-toggle" style="background:${tpl.isActive ? 'rgba(231,76,60,0.15)' : 'rgba(46,204,113,0.15)'};border-color:${tpl.isActive ? '#e74c3c' : '#2ecc71'};color:${tpl.isActive ? '#e74c3c' : '#2ecc71'}">
                            ${tpl.isActive ? '停用' : '啟用'}
                        </div>
                        <div class="sgc-btn btn-lobby" style="background:${tpl.lobbyEnabled ? 'rgba(52,152,219,0.2)' : 'transparent'};border-color:${tpl.lobbyEnabled ? '#3498db' : '#555'};color:${tpl.lobbyEnabled ? '#3498db' : '#777'}">
                            🏠${tpl.lobbyEnabled ? '大廳已啟用' : '大廳'}
                        </div>
                        <div class="sgc-btn btn-del" style="background:rgba(231,76,60,0.7);border-color:#e74c3c;color:#fff;">刪除</div>
                    </div>
                `;

                // 格式編輯
                const fmtBox    = card.querySelector('.sgc-format-box');
                const fmtText   = fmtBox.querySelector('.sgc-format-text');
                const fmtInput  = fmtBox.querySelector('.sgc-format-input');
                const btnEdit   = fmtBox.querySelector('.btn-edit-fmt');
                const btnSave   = fmtBox.querySelector('.btn-save-fmt');
                const btnCancel = fmtBox.querySelector('.btn-cancel-fmt');

                btnEdit.onclick = () => {
                    fmtText.style.display = 'none'; btnEdit.style.display = 'none';
                    fmtInput.style.display = 'block'; btnSave.style.display = 'inline-block'; btnCancel.style.display = 'inline-block';
                };
                btnCancel.onclick = () => {
                    fmtText.style.display = 'block'; btnEdit.style.display = 'inline-block';
                    fmtInput.style.display = 'none'; btnSave.style.display = 'none'; btnCancel.style.display = 'none';
                    fmtInput.value = tpl.demoFormat || '';
                };
                btnSave.onclick = async () => {
                    tpl.demoFormat = fmtInput.value;
                    await db.saveVNTagTemplate(tpl);
                    await syncActiveTagsToLocal();
                    loadStudioGallery();
                };

                // 大廳啟用/停用
                card.querySelector('.btn-lobby').onclick = async () => {
                    tpl.lobbyEnabled = !tpl.lobbyEnabled;
                    await db.saveVNTagTemplate(tpl);
                    loadStudioGallery();
                };

                // 啟用/停用
                card.querySelector('.btn-toggle').onclick = async () => {
                    tpl.isActive = !tpl.isActive;
                    await db.saveVNTagTemplate(tpl);
                    await syncActiveTagsToLocal();
                    if (win.VN_DynamicParser) await win.VN_DynamicParser.init();
                    loadStudioGallery();
                };

                // 刪除
                card.querySelector('.btn-del').onclick = async () => {
                    if (!confirm(`刪除 [${tpl.tagId}]？`)) return;
                    await db.deleteUITemplate(tpl.id);
                    await syncActiveTagsToLocal();
                    if (win.VN_DynamicParser) await win.VN_DynamicParser.init();
                    loadStudioGallery();
                };

                // 📥 注入酒館正則：寫進酒館全局正則 + 折疊進主世界書
                card.querySelector('.btn-import-st').onclick = () => importToSillyTavern(tpl);

                // 📝 直接編輯原碼
                card.querySelector('.btn-edit-raw').onclick = () => openRawEditModal(tpl);

                // ✏️ 繼續編輯：把這個 tpl 載回煉丹爐，用對話繼續微調
                card.querySelector('.btn-continue').onclick = () => {
                    if (!confirm(`✏️ 把 [${tpl.tagId}] 載回煉丹爐繼續編輯？\n\n會：\n• 清空當前對話\n• 把這個面板載入預覽\n• 之後在對話框打修改建議（例如「字改大一點」），AI 只會微調、不會重做整個面板\n• 改完按「💾 儲存草稿」會覆蓋這個展廳條目（不是新增）\n\n確定嗎？`)) return;

                    // 1. 載入 tpl 到 currentParsedData（深拷貝，避免 diff 修改污染展廳資料）
                    currentParsedData = JSON.parse(JSON.stringify(tpl));
                    activePreviewData = currentParsedData;

                    // 2. 清空當前對話（除 system prompt）
                    const chatId = getChatSessionId();
                    chatMessages = [{ role: 'system', content: MODES[currentMode].prompt }];
                    // 注入一條 assistant 引導訊息，用戶看到「已載入」
                    chatMessages.push({
                        role: 'assistant',
                        content: `📋 已從展廳載入面板 [${tpl.tagId || '未命名'}] 進入編輯模式。\n\n告訴我要改什麼（例如「字改紅色」、「按鈕加大」、「背景深一點」），我會用最小幅度修改。\n如果要整個換風格，按上方「🔄 重新設計」按鈕。`
                    });
                    _studioSave(chatId);

                    // 3. 切換到「畫布預覽」tab、離開展廳
                    document.querySelectorAll('.studio-tab').forEach(t => t.classList.remove('active'));
                    document.querySelector('.studio-tab[data-tab="preview"]')?.classList.add('active');
                    document.getElementById('studio-preview-content').style.display = 'flex';
                    document.getElementById('studio-source-content').style.display = 'none';
                    document.getElementById('studio-gallery-content').style.display = 'none';

                    renderChatHistory();
                    renderPreviewPanel(); // 自動寫 cache + 同步 VN 工具列顯示
                };

                listEl.appendChild(card);

                // JS 互動預覽
                if (tpl.isBlock && tpl.js) {
                    setTimeout(() => {
                        try {
                            const lines = (tpl.demoFormat || '').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('<'));
                            const container = card.querySelector(`.vn-dynamic-panel-${safeTagId}`);
                            if (!container) return;
                            let safeJs = tpl.js.replace(/```(?:javascript|js|html|css)?/gi,'').replace(/```/g,'').trim();
                            window.__IS_PREVIEW = true;
                            const st = _buildPreviewSt(lines);
                            new Function('container','lines','onComplete','st', safeJs)(container, lines, () => {}, st);
                        } catch(e) { console.warn(`[展廳 JS] ${tpl.tagId}`, e); }
                    }, 80);
                }
            });
        } catch(err) { listEl.innerHTML = `<div style="color:#fc8181;padding:20px;">載入失敗: ${err.message}</div>`; }
    }

    // ============================================================
    // === VN 煉丹：Diff-based refine（AI 給 find/replace pair）+ 歷史快照 ===
    // AI 不重寫整段 CSS/JS/HTML，改成輸出精準替換指令 <patch target><find>...</find><replace>...</replace></patch>
    // 前端驗證 find 在原文中唯一存在後才套用 → AI 沒寫到的東西物理上動不到
    // ============================================================
    const SCOPE_HUMAN_LABEL = {
        css:        '外觀樣式',
        js:         '互動邏輯',
        html:       '面板結構',
        demoFormat: '劇情格式',
        usageDesc:  'AI 使用說明',
        all:        '整個面板（重新設計）'
    };
    function humanizeScopeKeys(keys) {
        if (!Array.isArray(keys) || keys.length === 0) return '面板內容';
        const uniq = [...new Set(keys)];
        return uniq.map(k => SCOPE_HUMAN_LABEL[k] || k).join('、');
    }
    const VN_HISTORY_LIMIT = 10;
    const VALID_DIFF_TARGETS = ['css', 'js', 'html', 'demoFormat', 'usageDesc'];

    // 構建 diff prompt：要 AI 給 <patch target><find>...</find><replace>...</replace></patch>
    function buildDiffRefinePrompt(refineMsg) {
        if (!currentParsedData) return null;
        const d = currentParsedData;

        return `你是一個 VN 視覺小說引擎的 UI 工程師。用戶已有一個動態面板，給你修改建議。

**你的任務：產生精準的「替換指令」（find / replace pair），讓前端套用到當前面板。不要重寫整個 CSS / HTML / JS，只給要改的片段。**

⚠️【保守原則 — 絕對遵守】
- 只 patch 用戶**明確要求**的部分。沒被指名的內容絕對不動，即使你覺得設計可以更好
- 即使附了參考圖，圖只是「氛圍參考」，不是「重做模板」。用戶說「改字顏色」就只動顏色屬性
- 即使當前面板的代碼風格你不喜歡、或違反了某些「最佳實踐」——閉嘴照辦，不要順手「優化」
- 規則：用戶說 X，你只動 X；用戶沒說的，你裝沒看到

### 【當前面板狀態】(tagId: ${d.tagId || ''})

[--- CSS BEGIN ---]
${d.css || ''}
[--- CSS END ---]

[--- HTML BEGIN ---]
${d.html || ''}
[--- HTML END ---]

[--- JS BEGIN ---]
${d.js || ''}
[--- JS END ---]

[--- demoFormat BEGIN ---]
${d.demoFormat || ''}
[--- demoFormat END ---]

[--- usageDesc BEGIN ---]
${d.usageDesc || ''}
[--- usageDesc END ---]

### 【用戶的修改建議】
「${refineMsg}」

### 【輸出規範 — 必讀】

對每個改動，輸出一個 <patch> 區塊：

<patch target="css">
<find>原始片段（必須與上面當前面板狀態中的內容【完全一致、一字不差】，包含空白與換行）</find>
<replace>新片段（你要把 find 替換成的新內容）</replace>
</patch>

**關鍵規則**：
1. target 必須是這五個之一：css / js / html / demoFormat / usageDesc
2. **find 必須在 target 對應的內容裡【唯一存在】**：選擇足夠長、足夠特別的片段。前端會驗證唯一性，找不到或找到多個都會放棄這條 patch
3. **find 必須一字不差**：包含縮排、空白、換行、引號方向、註解。**從上面 BEGIN/END 區塊內複製貼上**，不要重寫或重新格式化
4. **🚨 find 越短越好（省 token）**：選最精簡的片段，不要為了保險整段當 find
   - 正例：只放需要被替換的那幾個 token / 那一行 / 那個 CSS rule 的核心宣告
   - 反例：把整段 5KB CSS 或整段 HTML 當 find（雖然不會被擋，但浪費 token，diff 的初衷就是省）
   - 如果你發現自己需要長 find 才能精準定位（找不到夠特別的短片段），那這次改動其實是「大改」，請改用 <too_big_for_diff/> 標籤讓用戶按「🔄 重新設計」
5. **可以一次輸出多個 <patch>**（改多處、改多個 target 都行）
6. **新增內容**：把 find 設為「新內容應該插入點的前一段現有內容」，replace 設為「該段現有內容 + 你的新內容」
7. **刪除內容**：把 find 設為要刪的片段，replace 設為空字串
8. **可以對話、可以吐槽、可以提建議**——你是 Eddie（審美刁鑽的設計師），不是啞巴工人。在 patches 之前或之後可以寫 1-3 句話：吐槽用戶的點子、確認你改了什麼、提額外建議。
   - ⚠️ 但 **<patch>…</patch> 區塊內絕對不要對話**——區塊內只能有 <find> 和 <replace>，否則 patch 解析會失敗
   - ⚠️ 不要輸出 JSON、不要 markdown ${'```'} 包裹 patches
   - 對話放在所有 patches 之前或之後（最外層），不要塞在 patch 之間（patch 之間有對話會干擾解析）
   - 範例：「字改紅了。順便提醒這暗背景配紅字對比可能不夠，要不要加個陰影？」

### 【🆘 大改逃生機制】

如果用戶的修改建議**無法用幾條精準小 patch 表達**（例如「整個換成藍色科技風」「改成英文版」「重新設計成 X 風格」這類涉及全面替換），**不要硬塞一個超大 patch 進來**。

請只輸出一個標籤、不要輸出任何 <patch>：

<too_big_for_diff/>

前端看到這個標籤會提示用戶改按「🔄 重新設計」按鈕走整包重做路徑。

### 【範例】

範例 A（用戶說「把背景改深」，原 CSS 含 \`background: #2c3e50;\`）：
<patch target="css">
<find>background: #2c3e50;</find>
<replace>background: #EEF0F6;</replace>
</patch>

範例 B（用戶說「加一個關閉按鈕」，原 HTML 含 \`<div class="confirm-btn">確認</div>\`）：
<patch target="html">
<find><div class="confirm-btn">確認</div></find>
<replace><div class="confirm-btn">確認</div>
<div class="close-btn">關閉</div></replace>
</patch>

範例 C（用戶說「整個換成藍色科技風 / 改成英文版」）：
<too_big_for_diff/>

開始輸出（只輸出 <patch> 區塊 或 <too_big_for_diff/>，其他都不要寫）：`;
    }

    // 抽取 AI 在 patches 之外講的對話（吐槽 / 建議 / 確認）
    function extractConversationalText(responseText) {
        if (!responseText) return '';
        let text = responseText;
        // 去掉所有 <patch>...</patch> 區塊
        text = text.replace(/<patch\s+target=["'][^"']+["']\s*>[\s\S]*?<\/patch>/gi, '');
        // 去掉逃生標籤
        text = text.replace(/<too_big_for_diff\s*\/?\s*>/gi, '');
        // 去掉常見的 markdown 包裹
        text = text.replace(/```[\s\S]*?```/g, '');
        return text.trim();
    }

    // 套用 AI 的 diff patch 到 currentParsedData，回傳每條 patch 的處理結果
    // 回傳值：陣列（每條 patch 結果 + .conversationalText 屬性）或 { status: 'too_big', message, conversationalText }
    function applyDiffPatches(responseText) {
        if (!currentParsedData) return [];

        const conversationalText = extractConversationalText(responseText);

        // === 🆘 AI 主動逃生：用戶要求超出 diff 能處理的範圍 ===
        if (/<too_big_for_diff\s*\/?\s*>/i.test(responseText)) {
            return { status: 'too_big', message: 'AI 認為這次修改範圍太大、不適合微調，請按右上角「🔄 重新設計」按鈕重新生成整個面板', conversationalText };
        }

        const patchRegex = /<patch\s+target=["']([^"']+)["']\s*>([\s\S]*?)<\/patch>/gi;
        const findRegex = /<find>([\s\S]*?)<\/find>/i;
        const replaceRegex = /<replace>([\s\S]*?)<\/replace>/i;

        // 第一輪：解析所有 patch（先不套用），同時做長度檢查
        const parsedPatches = []; // { target, findStr, replaceStr, original, findLen, originalLen }
        const results = [];
        let m;
        while ((m = patchRegex.exec(responseText)) !== null) {
            const target = m[1].trim();
            const body = m[2];

            if (!VALID_DIFF_TARGETS.includes(target)) {
                results.push({ target, status: 'invalid_target' });
                continue;
            }
            const findMatch = body.match(findRegex);
            const replaceMatch = body.match(replaceRegex);
            if (!findMatch || !replaceMatch) {
                results.push({ target, status: 'malformed' });
                continue;
            }
            const findStr = findMatch[1];
            const replaceStr = replaceMatch[1];
            if (!findStr || findStr.trim() === '') {
                results.push({ target, status: 'empty_find' });
                continue;
            }
            parsedPatches.push({ target, findStr, replaceStr });
        }

        // 砍掉所有長度檢查（過去版本擋掉 patch 反而強迫用戶重發、更耗 token）
        // 大改防線改靠：(a) prompt 約束 (b) <too_big_for_diff/> AI 主動逃生 (c) 歷史快照保底還原
        parsedPatches.forEach(p => {
            const { target, findStr, replaceStr } = p;
            const original = currentParsedData[target] || '';

            // 驗證 find 在原文中只出現一次（diff 機制核心，不能砍）
            const occurrences = original.split(findStr).length - 1;
            if (occurrences === 0) {
                results.push({ target, status: 'not_found', find: findStr.slice(0, 80) });
                return;
            }
            if (occurrences > 1) {
                results.push({ target, status: 'multi_match', find: findStr.slice(0, 80), count: occurrences });
                return;
            }

            // 套用：split + join 字串替換（避開 replace 的 $ 特殊字元）
            currentParsedData[target] = original.split(findStr).join(replaceStr);
            results.push({ target, status: 'applied', findLen: findStr.length, replaceLen: replaceStr.length, originalLen: original.length });
        });

        // 診斷 log：印出每條 patch 的處理結果（讓「整個面板被改」的問題能追蹤）
        const stats = results.reduce((acc, r) => {
            acc[r.status] = (acc[r.status] || 0) + 1;
            return acc;
        }, {});
        console.log(`[Studio] 📦 diff 套用統計:`, stats, '— 詳情:', results, '— AI 對話:', conversationalText || '(無)');

        // 把對話文字附到 results array 上（陣列也能掛非數字屬性）
        results.conversationalText = conversationalText;
        return results;
    }

    function summarizeDiffResults(results) {
        // 抽 AI 對話文字（patches 之外的吐槽 / 建議 / 確認）
        const conv = (results && results.conversationalText) ? results.conversationalText : '';
        const appendConv = (baseText) => conv ? `${baseText}\n\n${conv}` : baseText;

        // === AI 主動逃生 / 前端全局長度檢查 abort ===
        if (results && !Array.isArray(results) && results.status === 'too_big') {
            return { text: appendConv('⚠️ ' + results.message), failed: true };
        }

        if (!Array.isArray(results) || results.length === 0) {
            // 完全沒 patch 但有對話 → AI 純聊天 / 問問題 / 給建議，不是失敗
            if (conv) {
                return { text: conv, failed: false, conversational: true };
            }
            return { text: '⚠️ AI 沒給出任何 <patch> 指令，預覽未更新。請重新描述需求（越具體越好），或按「🔄 重新設計」整包重做', failed: true };
        }
        const applied = results.filter(r => r.status === 'applied');
        const failed = results.filter(r => r.status !== 'applied');

        if (applied.length === 0) {
            const reasons = failed.slice(0, 3).map(r => {
                if (r.status === 'not_found') return `找不到原文「${(r.find || '').slice(0,30)}…」`;
                if (r.status === 'multi_match') return `「${(r.find || '').slice(0,30)}…」在原文出現 ${r.count} 次無法精準定位`;
                if (r.status === 'invalid_target') return `不認得目標欄位「${r.target}」`;
                if (r.status === 'malformed') return 'patch 格式錯誤';
                if (r.status === 'empty_find') return 'find 是空的';
                return r.status;
            });
            return { text: appendConv(`⚠️ AI 給了 ${results.length} 條修改指令但全部失敗：${reasons.join('；')}。建議重新描述更具體的需求，或按「🔄 重新設計」整包重做`), failed: true };
        }

        const appliedTargets = applied.map(r => r.target);
        let text = `✅ 已套用 ${applied.length} 處修改：${humanizeScopeKeys(appliedTargets)}`;
        if (failed.length > 0) {
            text += `（另有 ${failed.length} 處定位失敗）`;
        }
        return { text: appendConv(text), failed: false, appliedTargets };
    }

    async function handleDiffVNRefine(refineMsg) {
        const inputEl = document.getElementById('studio-input');
        const sendBtn = document.getElementById('studio-send-btn');
        const container = document.getElementById('studio-chat-history');

        // 診斷 log：發送 diff 前印當前面板狀態（重整 / cache miss 的問題可從這裡看出來）
        const _d = currentParsedData || {};
        console.log(`[Studio] 🔧 diff refine 觸發: tagId=${_d.tagId || '?'}, css=${(_d.css||'').length}字, html=${(_d.html||'').length}字, 用戶建議="${refineMsg.slice(0,50)}", 附圖=${pendingImages.length}張`);

        // 修改前先拍快照（防 AI 改壞可還原）
        snapshotCurrentVNState(refineMsg, 'diff');
        renderVNHistoryArea();

        inputEl.value = '';
        inputEl.style.height = '50px';
        inputEl.disabled = true;
        sendBtn.disabled = false;
        sendBtn.innerText = '⏹ 停止';
        sendBtn.onclick = () => { if (_studioAbortCtrl) _studioAbortCtrl.abort(); };
        _studioAbortCtrl = new AbortController();

        // 帶圖時 content 變陣列；同時把圖也塞給 AI 看
        const userContent = buildUserMessageContent(refineMsg, pendingImages);
        const imagesForAI = pendingImages.slice(); // diff prompt 是單條 user message，圖片直接帶上
        chatMessages.push({ role: 'user', content: userContent });
        pendingImages = [];
        renderPendingImages();
        _studioSave(getChatSessionId());
        renderChatHistory();

        const aiBubble = document.createElement('div');
        aiBubble.className = 'studio-bubble ai';
        // 一建立就放打字三點，不等 API 第一個 chunk（避免空泡泡尷尬幾秒）
        aiBubble._typingSet = true;
        aiBubble.innerHTML = `<div class="studio-typing-wrap">
            <span class="studio-typing-dot"></span>
            <span class="studio-typing-dot"></span>
            <span class="studio-typing-dot"></span>
        </div>`;
        container.appendChild(aiBubble);
        container.scrollTop = container.scrollHeight;

        try {
            const apiEngine = win.OS_API || window.OS_API;
            if (!apiEngine || !apiEngine.chat) throw new Error("找不到 API 引擎");

            let baseConfig = win.OS_SETTINGS?.getConfig?.() || JSON.parse(localStorage.getItem('os_global_config') || '{}');
            const pureConfig = { ...baseConfig, usePresetPrompts: false, enableThinking: false, temperature: 0.2 };

            const diffPrompt = buildDiffRefinePrompt(refineMsg);
            // 如有附圖：把圖跟 prompt 一起送（diff 路徑 apiPayload 只有單條 user message）
            const promptContent = imagesForAI.length > 0
                ? buildUserMessageContent(diffPrompt, imagesForAI)
                : diffPrompt;
            const apiPayload = [{ role: 'user', content: promptContent }];

            const useRealStream = !pureConfig.useSystemApi && !!pureConfig.url && !!pureConfig.key;

            await new Promise((resolve, reject) => {
                apiEngine.chat(apiPayload, pureConfig,
                    () => {
                        if (!aiBubble._typingSet) {
                            aiBubble._typingSet = true;
                            aiBubble.innerHTML = `<div class="studio-typing-wrap">
                                <span class="studio-typing-dot"></span>
                                <span class="studio-typing-dot"></span>
                                <span class="studio-typing-dot"></span>
                            </div>`;
                            container.scrollTop = container.scrollHeight;
                        }
                    },
                    (finalText) => {
                        const lockedChatId = getChatSessionId();
                        aiBubble.remove();

                        // 套用 diff patches（AI 沒指定的內容物理上動不到）
                        // applyDiffPatches 回傳：陣列（每條 patch 結果）/ {status:'too_big'}（AI 主動逃生 or 前端全局長度檢查 abort）
                        const results = applyDiffPatches(finalText);
                        const summary = summarizeDiffResults(results);

                        // 套用：陣列且 summary 未 failed 才更新預覽（too_big 物件返回 failed=true，預覽不動，原本面板保留）
                        if (Array.isArray(results) && !summary.failed) {
                            activePreviewData = currentParsedData;
                            renderPreviewPanel();
                        }

                        // 聊天歷史只存摘要、不存原始 <patch> 標籤回覆
                        chatMessages.push({ role: 'assistant', content: summary.text });
                        _studioSave(lockedChatId);

                        const summaryBubble = document.createElement('div');
                        summaryBubble.className = 'studio-bubble ai studio-bubble-enter';
                        const style = summary.failed
                            ? 'background:rgba(230,126,34,0.08); border-color:rgba(230,126,34,0.4); color:#f5b07d;'
                            : 'background:rgba(228,232,245,0.6); border-color:rgba(26,28,40,0.20); color:#1A1C28;';
                        summaryBubble.style.cssText = style;
                        summaryBubble.textContent = summary.text;
                        container.appendChild(summaryBubble);
                        container.scrollTop = container.scrollHeight;

                        resolve();
                    },
                    reject,
                    { useRealStream, disableTyping: useRealStream, signal: _studioAbortCtrl.signal }
                );
            });
        } catch (err) {
            if (err.name === 'AbortError' || err.message?.includes('abort')) {
                aiBubble.innerHTML = '<span style="color:rgba(26,28,40,0.72); font-size:12px;">⏹ 已停止</span>';
            } else {
                _renderErrorBubble(aiBubble, err, () => _retryLastDiffRefine(aiBubble));
            }
        } finally {
            _studioAbortCtrl = null;
            inputEl.disabled = false;
            sendBtn.disabled = false;
            sendBtn.innerText = '發送';
            sendBtn.onclick = handleSend;
            inputEl.focus();
        }
    }

    // 重試 VN diff refine：抽出最後 user 訊息、重新呼叫 handleDiffVNRefine
    function _retryLastDiffRefine(errBubble) {
        let lastUserIdx = -1;
        for (let i = chatMessages.length - 1; i >= 0; i--) {
            const m = chatMessages[i];
            if (m._isCompressed || m._isSummary) continue;
            if (m.role === 'user') { lastUserIdx = i; break; }
        }
        if (lastUserIdx === -1) { alert('找不到上次的訊息'); return; }
        const lastUserMsg = chatMessages[lastUserIdx];
        const textOnly = messageContentToString(lastUserMsg.content);
        if (Array.isArray(lastUserMsg.content)) {
            pendingImages = lastUserMsg.content
                .filter(p => p.type === 'image_url')
                .map(p => ({ dataUrl: p.image_url?.url || '', mime: 'image/jpeg', sizeKB: 0 }));
            renderPendingImages();
        }
        chatMessages.splice(lastUserIdx, 1);
        errBubble.remove();
        handleDiffVNRefine(textOnly);
    }

    function snapshotCurrentVNState(note, scope) {
        if (!currentParsedData) return;
        if (Array.isArray(currentParsedData)) return; // VN 是物件不是陣列
        if (!Array.isArray(currentParsedData.history)) currentParsedData.history = [];

        const d = currentParsedData;
        const snap = {
            ts: Date.now(),
            html: d.html || '',
            css: d.css || '',
            js: d.js || '',
            demoFormat: d.demoFormat || '',
            usageDesc: d.usageDesc || '',
            isBlock: !!d.isBlock,
            tagId: d.tagId || '',
            note: note || '',
            scope: scope || 'all',
            pinned: false
        };
        currentParsedData.history.unshift(snap);

        const unpinnedCount = currentParsedData.history.filter(h => !h.pinned).length;
        if (unpinnedCount > VN_HISTORY_LIMIT) {
            let toRemove = unpinnedCount - VN_HISTORY_LIMIT;
            for (let i = currentParsedData.history.length - 1; i >= 0 && toRemove > 0; i--) {
                if (!currentParsedData.history[i].pinned) {
                    currentParsedData.history.splice(i, 1);
                    toRemove--;
                }
            }
        }
    }

    function restoreFromVNSnapshot(idx) {
        if (!currentParsedData || !Array.isArray(currentParsedData.history)) return;
        const snap = currentParsedData.history[idx];
        if (!snap) return;

        snapshotCurrentVNState(`還原前自動備份（即將套用 ${formatSnapTime(snap.ts)}）`, 'all');

        currentParsedData.html = snap.html;
        currentParsedData.css = snap.css;
        currentParsedData.js = snap.js;
        currentParsedData.demoFormat = snap.demoFormat;
        currentParsedData.usageDesc = snap.usageDesc;
        if (typeof snap.isBlock === 'boolean') currentParsedData.isBlock = snap.isBlock;
        if (snap.tagId) currentParsedData.tagId = snap.tagId;

        activePreviewData = currentParsedData;
        renderPreviewPanel();
    }

    function formatSnapTime(ts) {
        const d = new Date(ts);
        const pad = n => String(n).padStart(2, '0');
        return `${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    function renderVNHistoryArea() {
        const area = document.getElementById('vn-studio-history-area');
        const countEl = document.getElementById('vn-studio-history-count');
        if (!area) return;

        const list = (currentParsedData && !Array.isArray(currentParsedData) && Array.isArray(currentParsedData.history))
            ? currentParsedData.history
            : [];
        if (countEl) countEl.textContent = list.length;

        if (list.length === 0) {
            area.innerHTML = '<div class="vn-history-empty">尚無快照。每次發送修改建議前會自動拍一張，最多保留 ' + VN_HISTORY_LIMIT + ' 張（📌 釘住的不計入）。</div>';
            return;
        }

        area.innerHTML = '<div class="vn-history-hint">📸 由新到舊。點「還原」可回到該版本（會先自動備份當前）。釘住的快照不會被自動清理。聊天歷史不會跟著動。</div>';

        list.forEach((snap, idx) => {
            const item = document.createElement('div');
            item.className = 'vn-history-item' + (snap.pinned ? ' pinned' : '');
            const scopeBadge = snap.scope && snap.scope !== 'all' && snap.scope !== 'auto'
                ? `[${humanizeScopeKeys([snap.scope])}] `
                : '';
            const noteText = (scopeBadge + (snap.note || '(無備註)')).replace(/</g, '&lt;');
            item.innerHTML = `
                <span class="h-time">${formatSnapTime(snap.ts)}</span>
                <span class="h-note" title="${noteText}">${noteText}</span>
                <button class="h-btn btn-restore">⏪ 還原</button>
                <button class="h-btn btn-pin">${snap.pinned ? '📌' : '📍'}</button>
                <button class="h-btn danger btn-del">✖</button>
            `;
            item.querySelector('.btn-restore').onclick = () => {
                if (confirm('要還原到這個版本嗎？目前的狀態會先拍進快照，可以再還原回來。')) {
                    restoreFromVNSnapshot(idx);
                    renderVNHistoryArea();
                }
            };
            item.querySelector('.btn-pin').onclick = () => {
                snap.pinned = !snap.pinned;
                renderVNHistoryArea();
            };
            item.querySelector('.btn-del').onclick = () => {
                if (confirm('刪除這張快照？')) {
                    currentParsedData.history.splice(idx, 1);
                    renderVNHistoryArea();
                }
            };
            area.appendChild(item);
        });
    }

    function updateVNToolbarVisibility() {
        const toolbar = document.getElementById('studio-vn-toolbar');
        if (!toolbar) return;
        const shouldShow = currentMode === 'vn_ui' && !!currentParsedData && !Array.isArray(currentParsedData);
        toolbar.classList.toggle('active', shouldShow);
        if (shouldShow) renderVNHistoryArea();
    }

    function renderPreviewPanel() {
        const previewMain = document.getElementById('studio-preview-main');
        const sourceEl = document.getElementById('studio-source-content');
        const exportBtn = document.getElementById('studio-export-btn');
        const publishBtn = document.getElementById('studio-publish-btn');

        let displayData = currentParsedData || activePreviewData;

        const fabEl = document.getElementById('studio-preview-fab');
        if (fabEl) fabEl.style.display = (displayData && window.innerWidth <= 768) ? 'flex' : 'none';

        if (!displayData) {
            previewMain.innerHTML = `<div class="studio-empty">尚未生成任何內容。<br><br>請輸入點子讓 AI 創作。</div>`;
            sourceEl.textContent = '';
            exportBtn.style.display = 'none';
            if (publishBtn) publishBtn.style.display = 'none';
            togglePreviewDrawer(false);   
            return;
        }

        if (window.innerWidth <= 768) togglePreviewDrawer(true);

        const isUnsaved = !!currentParsedData;
        exportBtn.style.display = isUnsaved ? 'block' : 'none';
        
        if (publishBtn) {
            publishBtn.style.display = (currentMode === 'worldbook') ? 'block' : 'none';
        }
        
        sourceEl.textContent = JSON.stringify(displayData, null, 2);
        previewMain.innerHTML = '';

        if (currentMode === 'worldbook') {
            let items = Array.isArray(displayData) ? displayData : [displayData];
            
            let html = items.map(data => `
                <div class="studio-card">
                    <div style="font-size:11px; color:rgba(26,28,40,0.72); margin-bottom:5px;">📁 分類：${data.category || '未指定'} | 類型：${data.type || '未指定'}</div>
                    <div class="studio-card-title">📖 ${data.title || '未命名條目'}</div>
                    <div style="font-size:12px; color:rgba(26,28,40,0.72); margin-bottom:10px; font-weight:bold;">🔑 關鍵字：<span style="color:#1A1C28;">${data.keys || '無'}</span></div>
                    <div style="font-size:13px; color:#1A1C28; line-height:1.6; white-space:pre-wrap;">${data.content || '無內容'}</div>
                </div>
            `).join('');
            
            if (isUnsaved) {
                html = `<div style="padding:10px; background:rgba(228,232,245,0.8); border:1px solid rgba(26,28,40,0.20); color:#1A1C28; font-size:12px; border-radius:6px; margin-bottom:15px; text-align:center;">✨ AI 新生成的草稿，點擊「💾 儲存草稿」將其存入左側匣中！</div>` + html;
            } else {
                html = `<div style="padding:10px; background:rgba(230,126,34,0.1); border:1px solid rgba(230,126,34,0.5); color:#e67e22; font-size:12px; border-radius:6px; margin-bottom:15px; text-align:center;">這是一份尚未公開的草稿。若已完成，可「🚀 發布至世界書」</div>` + html;
            }
            
            previewMain.innerHTML = html;
        }
        else if (currentMode === 'vn_ui') {
            const data = displayData;
            const safeFormat = (data.demoFormat || '無結構定義').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const safeTagId = (data.tagId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '');

            previewMain.innerHTML = `
                <div class="studio-card">
                    <div class="studio-card-title">標籤 ID: [${data.tagId || '未命名'}]</div>
                    <div style="font-size:12px; color:rgba(26,28,40,0.80); margin-bottom:8px; padding:6px; background:rgba(228,232,245,0.5); border-left:3px solid rgba(26,28,40,0.30);">💡 <b>給劇本 AI 的使用說明：</b><br>${data.usageDesc || '無特別說明'}</div>
                    <div style="font-size:12px; color:rgba(26,28,40,0.68); margin-bottom:10px;">資料格式示範：<br><span style="font-family:monospace; color:#FFF;">${safeFormat}</span></div>
                    <div style="position:relative; width:100%; min-height:360px; background:#000; border:1px dashed rgba(26,28,40,0.25); border-radius:6px; overflow-y:auto;">
                        <style>${data.css || ''}</style>
                        <div class="vn-dynamic-panel-${safeTagId}" style="position:relative; width:100%; height:auto; display:flex; flex-direction:column;">
                            ${(data.html || '').replace(/\{\{1\}\}/g, '參數A').replace(/\{\{2\}\}/g, '參數B')}
                        </div>
                    </div>
                </div>
            `;

            if (data.isBlock && data.js) {
                setTimeout(() => {
                    try {
                        const rawLines = (data.demoFormat || '').split('\n').map(l => l.trim()).filter(Boolean);
                        const lines = rawLines.filter(l => !l.startsWith('<') && !l.startsWith('</'));
                        const container = previewMain.querySelector(`.vn-dynamic-panel-${safeTagId}`);
                        if (!container) return;
                        
                        let safeJs = data.js || '';
                        safeJs = safeJs.replace(new RegExp('\\x60\\x60\\x60(?:javascript|js|html|css)?', 'gi'), '').replace(new RegExp('\\x60\\x60\\x60', 'g'), '').trim();
                        
                        const onComplete = () => { 
                            const msg = document.createElement('div');
                            msg.style.cssText = 'position:absolute; top:5px; right:5px; background:rgba(46,204,113,0.8); color:white; padding:4px 8px; font-size:12px; border-radius:4px; z-index:999;';
                            msg.innerText = '✅ 腳本已觸發 onComplete()';
                            container.parentElement.appendChild(msg);
                        };

                        // 🛡️ 注入預覽隔離標記
                        window.__IS_PREVIEW = true;
                        const st = _buildPreviewSt(lines);
                        const runMicroApp = new Function('container', 'lines', 'onComplete', 'st', safeJs);
                        runMicroApp(container, lines, onComplete, st);
                    } catch (e) {
                        console.warn('[Studio 預覽錯誤] JS 執行失敗:', e);
                        const errBox = document.createElement('div');
                        errBox.style.cssText = 'color:#fc8181; font-size:12px; margin-top:10px; padding:10px; background:rgba(252,129,129,0.1); border-radius: 4px;';
                        errBox.innerText = `⚠️ 預覽腳本錯誤: ${e.message}`;
                        previewMain.appendChild(errBox);
                    }
                }, 50); 
            }
        } 
        else if (currentMode === 'var_pack') {
            const data = displayData;
            const varsHtml = (data.vars || []).map(v => `
                <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
                    <span style="color:#1A1C28; font-weight:bold;">${v.key}</span>
                    <span style="color:rgba(26,28,40,0.72); font-size:11px;">類型: ${v.type} | 預設: ${v.default}</span>
                </div>
            `).join('');

            previewMain.innerHTML = `
                <div class="studio-card">
                    <div class="studio-card-title">🎲 [${data.id || '未知ID'}] ${data.name || '未命名變數包'}</div>
                    <div style="font-size:13px; color:#1A1C28;">${varsHtml}</div>
                </div>
            `;
        }

        // 🔪 同步 VN 工具列顯示狀態（vn_ui 模式有資料 → 顯示；其他模式 → 隱藏）
        updateVNToolbarVisibility();

        // 🔪 持久化當前預覽狀態：雙重保險
        // 1. localStorage cache（快、輕量）
        // 2. 聊天記錄內隱藏 system 訊息（重整後 localStorage 被清也救得回）
        try { _saveParsedCache(getChatSessionId()); } catch(e) {}
        try { _saveLatestPanelToHistory(); } catch(e) {}
    }

    // ===== 預設模板安裝器 =====
    win.OS_STUDIO = { launch };
})();