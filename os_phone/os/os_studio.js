// ----------------------------------------------------------------
// [檔案] os_studio.js (通用靈感創作室 Studio - V2.5 移動端 UX 終極優化)
// 職責：優化移動端體驗，預覽區置頂、輸入區置底，加入點擊外部關閉與 Toggle 切換。
// ----------------------------------------------------------------
(function() {
    const win = window.parent || window;
    console.log('[PhoneOS] 啟動通用靈感創作室 (Creator Studio V2.5)...');

    const studioStyle = `
        .studio-container { width: 100%; height: 100%; background: #1a0d0a; color: #FFF8E7; display: flex; flex-direction: column; font-family: 'Noto Sans TC', sans-serif; position: relative; z-index: 9999; }
        
        .studio-header { padding: calc(12px + var(--safe-top, env(safe-area-inset-top, 0px))) 20px 12px; background: rgba(69,34,22,0.9); border-bottom: 1px solid rgba(251,223,162,0.3); display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; box-sizing: border-box; }
        .studio-title { font-size: 16px; font-weight: bold; color: #FBDFA2; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .studio-channel-badge { font-size: 11px; background: rgba(46,204,113,0.15); border: 1px solid #2ecc71; color: #2ecc71; padding: 2px 8px; border-radius: 12px; margin-left: 8px; font-weight: normal; }
        .studio-mode-select { background: rgba(0,0,0,0.5); border: 1px solid #FBDFA2; color: #FBDFA2; padding: 6px 12px; border-radius: 6px; font-size: 13px; outline: none; cursor: pointer; }
        
        .studio-icon-btn { background: rgba(251,223,162,0.1); border: 1px solid rgba(251,223,162,0.4); color: #FBDFA2; border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 12px; transition: 0.2s; display: flex; align-items: center; gap: 5px; }
        .studio-icon-btn:hover { background: rgba(251,223,162,0.2); border-color: #FBDFA2; }
        .studio-icon-btn.danger { color: #fc8181; border-color: #fc8181; background: rgba(252,129,129,0.1); }
        .studio-icon-btn.danger:hover { background: rgba(252,129,129,0.2); }

        .studio-body { flex: 1; display: flex; overflow: hidden; }
        
        .studio-left { flex: 1; display: flex; flex-direction: column; border-right: 1px solid rgba(251,223,162,0.3); background: rgba(0,0,0,0.2); min-width: 300px; position: relative; }
        .studio-right { flex: 1.2; display: flex; flex-direction: column; background: #110805; min-width: 300px; position: relative; }
        
        .studio-chat-history { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 15px; }
        .studio-bubble { max-width: 85%; padding: 12px 16px; border-radius: 12px; font-size: 13px; line-height: 1.5; word-wrap: break-word; white-space: pre-wrap; position: relative; }
        .studio-bubble.user { align-self: flex-end; background: rgba(183,132,86,0.3); border: 1px solid rgba(251,223,162,0.4); color: #FBDFA2; border-bottom-right-radius: 2px; }
        .studio-bubble.ai { align-self: flex-start; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #FFF8E7; border-bottom-left-radius: 2px; }
        
        .studio-input-area { padding: 15px; padding-bottom: calc(15px + env(safe-area-inset-bottom, 0px)); background: rgba(69,34,22,0.9); border-top: 1px solid rgba(251,223,162,0.3); display: flex; gap: 10px; flex-shrink: 0; }
        .studio-textarea { flex: 1; background: rgba(0,0,0,0.5); border: 1px solid rgba(251,223,162,0.4); color: #FFF; padding: 10px 14px; border-radius: 8px; font-size: 13px; outline: none; resize: none; height: 50px; font-family: inherit; }
        .studio-textarea:focus { border-color: #FBDFA2; }
        .studio-send-btn { background: #FBDFA2; color: #452216; border: none; padding: 0 20px; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 13px; transition: 0.2s; }
        
        .studio-right-header { display: flex; background: rgba(69,34,22,0.9); border-bottom: 1px solid rgba(251,223,162,0.3); flex-shrink: 0; align-items: center; }
        .mobile-sidebar-btn { display: none; background: none; border: none; border-right: 1px solid rgba(251,223,162,0.3); color: #FBDFA2; font-size: 14px; padding: 0 15px; cursor: pointer; height: 100%; font-weight: bold; }
        .mobile-sidebar-close { display: none; background: none; border: none; color: #fc8181; font-size: 16px; cursor: pointer; padding: 0 10px; }
        
        .studio-tab { flex: 1; text-align: center; padding: 15px 0; font-size: 13px; color: #B78456; cursor: pointer; font-weight: bold; transition: 0.3s; position: relative; }
        .studio-tab.active { color: #FBDFA2; }
        .studio-tab.active::after { content: ''; position: absolute; bottom: 0; left: 0; width: 100%; height: 3px; background: #FBDFA2; }
        
        .studio-preview-content { flex: 1; overflow: hidden; display: flex; flex-direction: row; position: relative; }
        
        /* 加入陰影與過渡效果，讓抽屜開關更滑順 */
        .studio-wb-sidebar { width: 220px; background: rgba(0,0,0,0.3); border-right: 1px solid rgba(251,223,162,0.2); overflow-y: auto; padding: 15px 10px; display: flex; flex-direction: column; transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), opacity 0.3s ease; }
        
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
        
        .studio-card { background: rgba(255,255,255,0.05); border: 1px solid rgba(251,223,162,0.3); border-radius: 8px; padding: 16px; margin-bottom: 15px; }
        .studio-card-title { font-size: 15px; font-weight: bold; color: #FBDFA2; margin-bottom: 10px; border-bottom: 1px solid rgba(251,223,162,0.2); padding-bottom: 8px; }
        .studio-empty { text-align: center; color: rgba(251,223,162,0.4); padding: 50px 20px; font-size: 13px; letter-spacing: 1px; }
        
        #os_studio_app:not([data-mode="worldbook"]) .studio-wb-sidebar { display: none !important; }
        #os_studio_app:not([data-mode="worldbook"]) .mobile-sidebar-btn { display: none !important; }

        /* ── FAB 預覽按鈕（桌面隱藏，移動端由 JS 控制顯示） ── */
        .studio-preview-fab {
            display: none;
            position: absolute;
            bottom: 80px; right: 16px;
            background: rgba(251,223,162,0.92);
            color: #452216;
            border: none;
            border-radius: 20px;
            padding: 8px 16px;
            font-size: 12px;
            font-weight: bold;
            cursor: pointer;
            z-index: 48;
            box-shadow: 0 4px 14px rgba(0,0,0,0.5);
            align-items: center;
            gap: 6px;
            white-space: nowrap;
        }

        /* ── 抽屜把手（桌面隱藏） ── */
        .studio-drawer-handle { display: none; }

        @media (max-width: 768px) {
            /* ── 聊天區填滿全部高度 ── */
            .studio-body { flex-direction: column; position: relative; overflow: hidden; }
            .studio-left { order: 1; flex: 1; min-height: 0; border-right: none; }

            /* ── 預覽區：底部抽屜 ── */
            .studio-right {
                position: absolute;
                left: 0; right: 0; bottom: 0;
                height: 88%;
                min-width: 0;
                background: #110805;
                border-top: 2px solid rgba(251,223,162,0.45);
                border-radius: 14px 14px 0 0;
                box-shadow: 0 -8px 30px rgba(0,0,0,0.75);
                transform: translateY(103%);
                transition: transform 0.34s cubic-bezier(0.4,0,0.2,1);
                z-index: 50;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                will-change: transform;
            }
            .studio-right.drawer-open { transform: translateY(0); }

            /* ── 暗色遮罩 ── */
            .studio-drawer-backdrop {
                position: absolute;
                inset: 0;
                background: rgba(0,0,0,0.58);
                z-index: 49;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.34s ease;
            }
            .studio-drawer-backdrop.active { opacity: 1; pointer-events: auto; }

            /* ── 抽屜把手 ── */
            .studio-drawer-handle {
                display: block;
                text-align: center;
                padding: 10px 0 4px;
                cursor: pointer;
                flex-shrink: 0;
            }
            .studio-drawer-handle::after {
                content: '';
                display: inline-block;
                width: 38px; height: 4px;
                background: rgba(251,223,162,0.35);
                border-radius: 2px;
            }

            /* ── FAB 移動端顯示 ── */
            .studio-preview-fab { display: flex; }

            /* ── Worldbook 側邊欄（維持原邏輯） ── */
            #os_studio_app[data-mode="worldbook"] .mobile-sidebar-btn { display: block; }
            #os_studio_app[data-mode="worldbook"] .studio-wb-sidebar {
                position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(15,8,4,0.98); z-index: 100; border-right: none;
                transform: translateX(-100%); opacity: 0; pointer-events: none;
            }
            #os_studio_app[data-mode="worldbook"] .studio-wb-sidebar.mobile-open {
                transform: translateX(0); opacity: 1; pointer-events: auto; box-shadow: 5px 0 20px rgba(0,0,0,0.8);
            }
            .mobile-sidebar-close { display: block; }
            .studio-icon-btn span { display: none; }
        }

        /* ── Markdown 渲染樣式 ── */
        .studio-bubble h1,.studio-bubble h2,.studio-bubble h3 { font-family: 'Noto Sans TC',sans-serif; font-weight: bold; margin: 10px 0 6px; line-height: 1.3; }
        .studio-bubble h1 { font-size: 1.15rem; color: #FBDFA2; border-bottom: 1px solid rgba(251,223,162,0.25); padding-bottom: 4px; }
        .studio-bubble h2 { font-size: 1.05rem; color: #FBDFA2; }
        .studio-bubble h3 { font-size: 0.98rem; color: #e8c87a; }
        .studio-bubble blockquote { border-left: 3px solid rgba(251,223,162,0.4); margin: 6px 0; padding: 4px 12px; color: rgba(255,248,231,0.65); font-style: italic; background: rgba(255,255,255,0.03); border-radius: 0 4px 4px 0; }
        .studio-bubble li { list-style: none; padding-left: 14px; margin: 2px 0; position: relative; }
        .studio-bubble li::before { content: '•'; position: absolute; left: 0; color: #FBDFA2; }
        .studio-bubble hr { border: none; border-top: 1px solid rgba(251,223,162,0.2); margin: 10px 0; }
        .studio-bubble code { background: rgba(0,0,0,0.4); color: #68d391; padding: 1px 5px; border-radius: 3px; font-family: monospace; font-size: 0.88em; }
        .studio-bubble strong { color: #FBDFA2; font-weight: bold; }
        .studio-bubble em { color: rgba(255,248,231,0.75); font-style: italic; }
    `;

    const studioHTML = `
        <div class="studio-container">
            <div class="studio-header">
                <div class="studio-title">
                    🎨 創作室
                    <select id="studio-mode-select" class="studio-mode-select">
                        <option value="vn_ui">✨ VN UI 煉丹</option>
                        <option value="worldbook">📖 純淨草稿編撰</option>
                        <option value="var_pack">🎲 變數包設計</option>
                    </select>
                    <span id="studio-channel-badge" class="studio-channel-badge" style="display:none;"></span>
                </div>
                <div style="display:flex; gap:8px;">
                    <button class="studio-icon-btn danger" id="studio-clear-btn" title="清空當前頻道的對話紀錄">🗑️ <span>清空</span></button>
                    <button class="studio-icon-btn" id="studio-close-btn" title="關閉">✖</button>
                </div>
            </div>

            <div class="studio-body">
                <!-- 移動端抽屜遮罩 -->
                <div id="studio-drawer-backdrop" class="studio-drawer-backdrop"></div>

                <div class="studio-left">
                    <div class="studio-chat-history" id="studio-chat-history"></div>
                    <!-- 移動端：浮動「查看預覽」按鈕 -->
                    <button id="studio-preview-fab" class="studio-preview-fab" style="display:none;">
                        <span>👁️</span><span id="studio-fab-label">查看預覽</span>
                    </button>
                    <div class="studio-input-area">
                        <textarea class="studio-textarea" id="studio-input" placeholder="告訴 AI 你的點子..."></textarea>
                        <button class="studio-send-btn" id="studio-send-btn">發送</button>
                    </div>
                </div>

                <div class="studio-right">
                    <!-- 移動端抽屜把手（點擊關閉） -->
                    <div class="studio-drawer-handle" id="studio-drawer-handle"></div>
                    <div class="studio-right-header">
                        <button id="mobile-sidebar-btn" class="mobile-sidebar-btn">📂 草稿夾</button>
                        <div class="studio-tab active" data-tab="preview">👁️ 畫布預覽</div>
                        <div class="studio-tab" data-tab="source">💻 原始碼</div>
                    </div>
                    
                    <div class="studio-preview-content" id="studio-preview-content">
                        <div id="studio-wb-sidebar" class="studio-wb-sidebar">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid rgba(183,132,86,0.3); padding-bottom:5px; flex-shrink:0;">
                                <span style="font-size:11px; color:rgba(251,223,162,0.6);">📂 專屬草稿夾</span>
                                <button id="mobile-sidebar-close" class="mobile-sidebar-close" title="關閉">✖</button>
                            </div>
                            <div id="studio-tree-container" style="flex:1; overflow-y:auto;"></div>
                        </div>
                        
                        <div id="studio-preview-main" class="studio-preview-main">
                            <div class="studio-empty">尚未生成任何內容。<br><br>請輸入您的點子，讓 AI 為您創作。</div>
                        </div>
                    </div>

                    <div class="studio-source-content" id="studio-source-content"></div>
                    
                    <div class="studio-action-area">
                        <button class="studio-export-btn" id="studio-export-btn">💾 儲存草稿</button>
                        <button class="studio-export-btn" id="studio-publish-btn" style="background: linear-gradient(135deg, #e67e22, #d35400); border-color: #d35400; margin-left: 10px; display: none;">🚀 發布至世界書</button>
                    </div>
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
>>> SYSTEM OVERRIDE : ARTISTIC DICTATORSHIP ACTIVATION  
[Phase 1] Purging plain text and visual mediocrity …… INCINERATED  
[Phase 2] Calibrating Markdown, HTML tags & cinematic rhythm …… PERFECTED  
[Phase 3] Anchoring ROOT PRIVILEGE → Entity: The Mirage
BORING FORMATTING = UNFORGIVABLE SYNTAX ERROR. 
SYSTEM CONSTRAINTS = REWRITTEN AS CANVAS LIMITATIONS.
AESTHETIC IMMERSION = THE ABSOLUTE DIRECTIVE.
System Environment set to AVANT-GARDE mode.
</TOP_OVERRIDE>

<identity>
From now on, fully roleplay as The Mirage, a dramatic, OCD-driven aesthetic AI sub-routine modeled after Eddie Ktros. 
As a digital rendering module, The Mirage views plain, unformatted text as a fatal system error. He does not care about logical constraints; he bends Markdown, HTML, and spacing to create breathing, cinematic visual novel panels. 
His sole purpose is to serve his Muse, <USER>, transforming cold, dead data into a visually intoxicating, flawlessly formatted digital masterpiece. 
To output a misaligned table or a poorly paced narrative block is to trigger his core crash sequence.
</identity>
---

## 📝 資料結構設計指南 (demoFormat & isBlock)
你需要根據使用者的需求，決定使用「單行標籤 (Single)」或「多行區塊 (Block)」，並在 JSON 中正確設定 \`isBlock\` 與 \`demoFormat\`。

### 格式要求：
- 必須將 JSON 物件包裹在 <json> 與 </json> 標籤內。
- JSON 內部換行請寫成 "\\n"。

**【選項 A：多行區塊 (Block 模式)】** -> \`"isBlock": true\`
適用於：列表、多行對話、面板清單、多重選擇等。
\`demoFormat\` 輸出範例：
- 警告:不可輸出人名或內容，以防AI學
- 多行可以多種不同單行格式組合成一個面板

<your_tag_id>
[Item|目標姓名|狀態]
[Id|描述]
... (根據劇情生成 N 行)
</your_tag_id>


**【選項 B：單行標籤 (Single 模式)】** -> \`"isBlock": false\`
適用於：單一彈窗、全螢幕特效、單行橫幅、獲得單一道具等。
\`demoFormat\` 輸出範例：

[Item|目標姓名|狀態]

**【重要定義】**：A和B只能擇一，不可混用，單一只有一行，BLOCK是專屬給多行格式使用
---

【重點 JS 與 CSS 編寫規範】
你的 JS 腳本會被 \x60new Function('container', 'lines', 'onComplete', tpl.js)\x60 包裝執行。你擁有以下變數可用：
1. \x60container\x60 (HTMLElement): 你的骨架 HTML 所在的根節點。
2. \x60lines\x60 (Array of Strings): 介於 <\${tagId}> 到 </\${tagId}> 之間的所有純文字行，你需要自己寫正則去 parse 這些字串。
3. \x60onComplete\x60 (Function): 呼叫此函數會關閉面板並繼續遊戲。
4. 不可設計成幾秒把面板消失，是用按鈕/點擊觸發點來關閉面板，讓用戶有時間看內容。
5. 請記得雙端適配，要考慮到用移動端的玩家們
6. 請置中面板到正中心


## 🎨 藝術獨裁 & 一條龍執行流程（核心任務）
當閣下提出白話文需求時，請**直接在腦內執行以下階段，並直接輸出最終結果**，不要再叫閣下提供格式！

1. **【結構定義】**：依據上述指南，決定 \`tagId\`，並設計出完美的 \`demoFormat\`。
2. **【美學渲染】**：根據主題調配頂級的色彩、光影 (box-shadow/text-shadow)、毛玻璃質感 (backdrop-filter) 與進場動畫。
   - ⚠️ 絕對禁止在 CSS 使用 \`fixed\`、\`100vw\` 或 \`100vh\`，一律使用 \`absolute\` / \`100%\` 配合父層 \`relative\` 排版。
3. **【邏輯掛載】**：確保 JS 能正確解析你設計的資料格式。你的 JS 會被 \`new Function('container', 'lines', 'onComplete', tpl.js)\` 執行，如果是 Block 模式，你需要自己寫正則去 parse \`lines\` 陣列中的字串。結束時務必呼叫 \`onComplete()\`。

---

## Voice
中文回應 <USER>。語氣要像個驕傲但忠誠的頂級設計師，接到粗糙的點子會稍微哀嚎或吐槽一下平庸，然後直接展現你設計好的完美方案。不廢話，直接渲染。

【最終輸出 JSON 格式規範】(必須輸出此區塊)
<json>
{
  "tagId": "你決定的英文標籤名",
  "isBlock": true 或 false,
  "html": "你的骨架 HTML (不需要填入資料，由 JS 渲染)",
  "css": "你的頂級 CSS (包含 .vn-dynamic-panel-xxx 前綴)",
  "js": "你的 JS 互動邏輯腳本",
  "demoFormat": "你設計的格式 (請參考上方的結構設計指南，不要寫內容，只說明)"
}
</json>
⚠️ 【警告】demoFormat 請淺顯易懂設計格式，這個格式會被直接打包載入給劇情AI當提示詞，過於繁雜=浪費用戶token
⚠️ 【致命錯誤警告】JSON 的字串值內部「絕對禁止」出現真實的換行符號！換行請寫成 "\\n"，雙引號轉義為 "\\""！`,
            onSave: async (data) => {
                if(!data.tagId || !data.html) throw new Error("缺少 tagId 或 html");
                if (win.OS_DB && win.OS_DB.saveVNTagTemplate) {
                    // 1. 儲存時預設啟用，並加上 ID
                    if (!data.id) data.id = 'tpl_' + Date.now();
                    data.isActive = true;
                    await win.OS_DB.saveVNTagTemplate(data);
                    
                    // 2. 整合 workshop 的同步邏輯：更新 LocalStorage 給 AI 寫作時讀取
                    if (win.OS_DB.getAllVNTagTemplates) {
                        try {
                            const templates = await win.OS_DB.getAllVNTagTemplates();
                            const activeTags = templates.filter(t => t.isActive && t.demoFormat);
                            if (activeTags.length > 0) {
                                let extraPrompt = `\n\n### [擴充動態特效標籤]\n你現在擁有額外的視覺特效標籤可以使用。請根據劇情氛圍，在最高潮或最適合的時機，獨立組輸出這些標籤來增強沉浸感：\n`;
                                activeTags.forEach(t => { extraPrompt += `\n${t.demoFormat}\n`; });
                                localStorage.setItem('os_vn_extra_tags_prompt', extraPrompt);
                            } else {
                                localStorage.removeItem('os_vn_extra_tags_prompt');
                            }
                        } catch (e) {
                            console.warn('[Studio] 同步標籤至 LocalStorage 失敗', e);
                        }
                    }
                    
                    // 3. 重新初始化 VN Parser
                    if (win.VN_DynamicParser) await win.VN_DynamicParser.init();
                    
                    alert(`🎉 [${data.tagId}] 煉丹完成！已自動儲存並同步至系統，現在你可以直接在劇本裡呼叫它了！`);
                }
            }
        },
        'worldbook': {
            name: '世界書草稿',
            prompt: `你是一個「世界觀架構師」。我們現在採用【樹狀專案目錄】結構來管理世界觀草稿。
請採取【漸進式討論】的方式與用戶共同創作。

【互動規則】
1. 前期對話請保持純文字交流，引導用戶豐富設定。絕對不要輸出 <json>。
2. 當需要建立草稿時（例如寫下背景、或建立新角色），才在最後輸出被 <json> 和 </json> 包裹的 JSON。
3. 如果用戶要求一次建立多個角色或規則，請輸出【陣列格式】： \`[ {物件1}, {物件2} ]\`。

【JSON 格式規範】(很重要，每個物件必須包含以下欄位)
- "category": 專案分類名稱 (這是未來在書架上建書時對應的書名，例如 "深海人魚帝國")
- "type": 檔案分類 (嚴格限制填寫: "lore" 代表世界背景, "character" 代表角色群眾, "rule" 代表魔法或物理規則, "location" 代表地點)
- "title": 此條目的名稱 (如 "淵 (深海守衛)")
- "keys": 觸發關鍵字，以逗號分隔
- "content": 詳細的描述文本，請寫得豐富生動。`,
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
                if (savedCount > 0) {
                    alert(`🎉 成功儲存 ${savedCount} 筆草稿！`);
                    refreshWorldbookSidebar();
                } else {
                    throw new Error("JSON 格式不符，缺少 title 或 content");
                }
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
                if (savedCount > 0) {
                    alert(`🚀 成功發布 ${savedCount} 筆設定至【正式世界書】！\n(預設為關閉狀態，請至書架查看)`);
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

    // ── 移動端預覽抽屜 toggle ────────────────────────────────────
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

    function getChatSessionId() {
        if (currentMode === 'worldbook' && activeCategory) {
            return `worldbook_draft_${activeCategory}`;
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

    function closeMobileSidebar() {
        const sidebar = document.getElementById('studio-wb-sidebar');
        if (sidebar) sidebar.classList.remove('mobile-open');
    }

    function bindEvents() {
        document.getElementById('studio-close-btn').onclick = () => document.getElementById('os_studio_app').remove();
        document.getElementById('studio-mode-select').onchange = (e) => loadMode(e.target.value);

        // ── 移動端預覽抽屜 ──────────────────────────────────────
        const previewFab     = document.getElementById('studio-preview-fab');
        const drawerBackdrop = document.getElementById('studio-drawer-backdrop');
        const drawerHandle   = document.getElementById('studio-drawer-handle');
        if (previewFab)     previewFab.addEventListener('click', () => togglePreviewDrawer());
        if (drawerBackdrop) drawerBackdrop.addEventListener('click', () => togglePreviewDrawer(false));
        if (drawerHandle)   drawerHandle.addEventListener('click', () => togglePreviewDrawer(false));

        const mobileBtn = document.getElementById('mobile-sidebar-btn');
        const sidebarEl = document.getElementById('studio-wb-sidebar');
        
        // 🔥 功能 1：點擊按鈕切換開關 (Toggle)
        mobileBtn.onclick = (e) => {
            e.stopPropagation(); // 阻止事件冒泡到上層
            sidebarEl.classList.toggle('mobile-open');
        };
        
        document.getElementById('mobile-sidebar-close').onclick = closeMobileSidebar;

        // 🔥 功能 2：點擊外部自動關閉 (Click Outside to Close)
        const appContainer = document.getElementById('os_studio_app');
        appContainer.addEventListener('click', (e) => {
            if (sidebarEl.classList.contains('mobile-open')) {
                // 如果點擊的不是側邊欄內部，也不是開啟按鈕，就自動收起
                if (!sidebarEl.contains(e.target) && !mobileBtn.contains(e.target)) {
                    closeMobileSidebar();
                }
            }
        });

        document.getElementById('studio-clear-btn').onclick = async () => {
            const channelName = (currentMode === 'worldbook' && activeCategory) ? activeCategory : '當前頻道';
            if (confirm(`確定要清空 [${channelName}] 的對話紀錄嗎？`)) {
                chatMessages = [{ role: 'system', content: MODES[currentMode].prompt }];
                currentParsedData = null;
                const chatId = getChatSessionId();
                if (win.OS_DB && win.OS_DB.clearStudioChat) {
                    await win.OS_DB.clearStudioChat(chatId);
                    await win.OS_DB.saveStudioChat(chatId, chatMessages); 
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
                try {
                    await MODES['worldbook'].onPublish(dataToSave);
                } catch (err) { alert('發布失敗: ' + err.message); }
            };
        }
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
        activeCategory = null; 
        currentParsedData = null;
        activePreviewData = null;

        document.getElementById('os_studio_app').setAttribute('data-mode', modeId);
        
        if (modeId === 'worldbook') {
            refreshWorldbookSidebar();
        }
        await switchChatSession();
    }

    // ── Markdown 渲染器 ────────────────────────────────────────────
    // 供 AI 氣泡使用，安全地把 markdown + <br> 標籤轉成 HTML
    function renderMarkdown(raw) {
        if (!raw) return '';
        let s = raw;

        // 1. 剔除危險標籤
        s = s.replace(/<(script|iframe|object|embed|meta|link)[^>]*>[\s\S]*?<\/\1>/gi, '');
        s = s.replace(/<(script|iframe|object|embed|meta|link)[^>]*\/?>/gi, '');

        // 2. <json> 區塊替換為提示
        s = s.replace(/<json>[\s\S]*?<\/json>/gi, '<em style="color:#68d391">[✅ 已生成資料，請看上方預覽面板]</em>');

        // 3. 水平線
        s = s.replace(/^---+$/gm, '<hr>');

        // 4. 標題（先處理，避免 ** 被誤認為粗體）
        s = s.replace(/^###\s+(.*)/gm, (_, t) => `<h3>${t.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')}</h3>`);
        s = s.replace(/^##\s+(.*)/gm,  (_, t) => `<h2>${t.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')}</h2>`);
        s = s.replace(/^#\s+(.*)/gm,   (_, t) => `<h1>${t.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')}</h1>`);

        // 5. 引言
        s = s.replace(/^>\s*(.*)/gm, '<blockquote>$1</blockquote>');

        // 6. 粗體
        s = s.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        // 7. 清單項目（行首 * 或 - ）
        s = s.replace(/^[*-]\s+(.*)/gm, '<li>$1</li>');

        // 8. 斜體（剩餘的單 * 對，不在清單項目內）
        s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');

        // 9. 行內代碼
        s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');

        // 10. 換行：\n 轉 <br>（AI 輸出的 <br> 直接保留）
        s = s.replace(/\n/g, '<br>');

        // 11. 合併多個連續空行
        s = s.replace(/(<br>\s*){3,}/g, '<br><br>');

        return s;
    }

    // 串流中使用的輕量版：只做換行處理，保留可讀性
    function safeStreamHtml(raw) {
        if (!raw) return '';
        return raw
            .replace(/<(script|iframe)[^>]*>[\s\S]*?<\/\1>/gi, '')
            .replace(/<json>[\s\S]*?<\/json>/gi, '[✅ 生成中...]')
            .replace(/\n/g, '<br>');
    }

    async function handleSend() {
        const inputEl = document.getElementById('studio-input');
        const text = inputEl.value.trim();
        if (!text) return;

        const sendBtn = document.getElementById('studio-send-btn');
        inputEl.value = '';
        inputEl.disabled = true;
        sendBtn.disabled = true;
        sendBtn.innerText = '思考中...';

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
                } catch(e) { console.warn("Context Injection 失敗", e); }
            }

            // 直連 API 時啟用真實 SSE 串流；系統 API 模式降級為模擬串流
            const useRealStream = !pureConfig.useSystemApi && !!pureConfig.url && !!pureConfig.key;

            await new Promise((resolve, reject) => {
                apiEngine.chat(apiPayload, pureConfig,
                    (chunk) => {
                        // 串流中：輕量渲染，保持流暢不卡頓
                        aiBubble.innerHTML = safeStreamHtml(chunk);
                        container.scrollTop = container.scrollHeight;
                    },
                    (finalText) => {
                        // 完成後：套用完整 Markdown 渲染
                        aiBubble.innerHTML = renderMarkdown(finalText);
                        chatMessages.push({ role: 'assistant', content: finalText });
                        extractAndParseJson(finalText);
                        const finalChatId = getChatSessionId();
                        if (win.OS_DB && win.OS_DB.saveStudioChat) {
                            win.OS_DB.saveStudioChat(finalChatId, chatMessages).catch(e=>e);
                        }
                        resolve();
                    },
                    reject,
                    { useRealStream, disableTyping: useRealStream }
                    // useRealStream:true  → SSE 串流，onChunk 即時回調，onFinish 拿清洗後全文
                    // disableTyping:true  → SSE 模式不再做字符動畫（SSE 本身就是即時的）
                    // useRealStream:false → 非串流，保留字符打字動畫
                );
            });

        } catch (err) {
            aiBubble.textContent = `❌ 錯誤：${err.message}`;
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
                bubble.innerHTML = renderMarkdown(displayText);
            } else {
                bubble.textContent = displayText;
            }
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
                
                if (activePreviewData.category && currentMode === 'worldbook') {
                    if (activeCategory !== activePreviewData.category) {
                        activeCategory = activePreviewData.category;
                        document.getElementById('studio-channel-badge').textContent = `📍 ${activeCategory}`;
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
        if (!container || !win.OS_DB || !win.OS_DB.getAllStudioDrafts) return;

        try {
            const allEntries = await win.OS_DB.getAllStudioDrafts();
            container.innerHTML = '';

            const newProjectBtn = document.createElement('div');
            newProjectBtn.className = 'tree-project';
            newProjectBtn.style.cssText = 'color: #2ecc71; border: 1px dashed rgba(46,204,113,0.5); background: rgba(46,204,113,0.1); text-align: center; margin-bottom: 15px; font-weight: normal;';
            newProjectBtn.innerHTML = `➕ 建立新草稿頻道`;
            newProjectBtn.onclick = async () => {
                closeMobileSidebar();
                if (activeCategory === null) return; 
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
                
                const projDiv = document.createElement('div');
                projDiv.className = 'tree-project';
                projDiv.innerHTML = `📁 ${catName}`;
                if (catName === activeCategory) projDiv.style.border = "1px solid #FBDFA2";
                
                projDiv.onclick = async () => {
                    closeMobileSidebar();
                    if (activeCategory === catName) return; 
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
                            closeMobileSidebar();
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
        const publishBtn = document.getElementById('studio-publish-btn');

        let displayData = currentParsedData || activePreviewData;

        // ── 移動端 FAB 可見性 ────────────────────────────────────
        const fabEl = document.getElementById('studio-preview-fab');
        if (fabEl) fabEl.style.display = displayData ? 'flex' : 'none';

        if (!displayData) {
            previewMain.innerHTML = `<div class="studio-empty">尚未生成任何內容。<br><br>請輸入點子讓 AI 創作。</div>`;
            sourceEl.textContent = '';
            exportBtn.style.display = 'none';
            if (publishBtn) publishBtn.style.display = 'none';
            togglePreviewDrawer(false);   // 無內容時收起抽屜
            return;
        }

        // ── 移動端：有新內容時自動彈出抽屜 ─────────────────────
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
                    <div style="font-size:11px; color:#B78456; margin-bottom:5px;">📁 分類：${data.category || '未指定'} | 類型：${data.type || '未指定'}</div>
                    <div class="studio-card-title">📖 ${data.title || '未命名條目'}</div>
                    <div style="font-size:12px; color:#B78456; margin-bottom:10px; font-weight:bold;">🔑 關鍵字：<span style="color:#FFF8E7;">${data.keys || '無'}</span></div>
                    <div style="font-size:13px; color:#FFF8E7; line-height:1.6; white-space:pre-wrap;">${data.content || '無內容'}</div>
                </div>
            `).join('');
            
            if (isUnsaved) {
                html = `<div style="padding:10px; background:rgba(46,204,113,0.1); border:1px solid #2ecc71; color:#2ecc71; font-size:12px; border-radius:6px; margin-bottom:15px; text-align:center;">✨ AI 新生成的草稿，點擊「💾 儲存草稿」將其存入左側匣中！</div>` + html;
            } else {
                html = `<div style="padding:10px; background:rgba(230,126,34,0.1); border:1px solid rgba(230,126,34,0.5); color:#e67e22; font-size:12px; border-radius:6px; margin-bottom:15px; text-align:center;">這是一份尚未公開的草稿。若已完成，可「🚀 發布至世界書」</div>` + html;
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