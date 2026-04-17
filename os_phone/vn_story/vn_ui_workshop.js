// ----------------------------------------------------------------
// [檔案] vn_ui_workshop.js (VN 動態標籤煉丹爐 - 終極完美版 + 💡點子AI助手)
// 職責：透過獨立 API 引擎生成 VN 美化標籤配置，並存入 OS_DB。
// ----------------------------------------------------------------
(function() {
    const win = window.parent || window;
    console.log('[PhoneOS] 啟動 VN 標籤煉丹爐 (支援微型App、設計師人格、展廳同步、點子AI)...');

    const workshopStyle = `
        .vn-ws-container { width: 100%; height: 100%; background: #1a0d0a; color: #FFF8E7; display: flex; flex-direction: column; font-family: 'Noto Sans TC', sans-serif; position: relative; z-index: 9999; }
        .vn-ws-header { padding: 15px 20px; background: rgba(69,34,22,0.9); border-bottom: 1px solid rgba(251,223,162,0.3); display: flex; justify-content: space-between; align-items: center; }
        .vn-ws-title { font-size: 18px; font-weight: bold; color: #FBDFA2; display: flex; align-items: center; gap: 10px; }
        .vn-ws-close { background: none; border: none; color: #FBDFA2; font-size: 20px; cursor: pointer; }
        .vn-ws-idea-btn { background: rgba(251,223,162,0.2); border: 1px solid #FBDFA2; color: #FBDFA2; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 14px; transition: 0.2s; }
        .vn-ws-idea-btn:hover { background: #FBDFA2; color: #1a0d0a; box-shadow: 0 0 10px rgba(251,223,162,0.8); }
        .vn-ws-tabs { display: flex; background: rgba(69,34,22,0.9); border-bottom: 1px solid rgba(251,223,162,0.3); flex-shrink: 0; }
        .vn-ws-tab { flex: 1; text-align: center; padding: 12px 0; font-size: 14px; color: #B78456; cursor: pointer; font-weight: bold; transition: 0.3s; position: relative; }
        .vn-ws-tab.active { color: #FBDFA2; }
        .vn-ws-tab.active::after { content: ''; position: absolute; bottom: 0; left: 0; width: 100%; height: 3px; background: #FBDFA2; }
        .vn-ws-body { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 15px; }
        .vn-ws-view { display: none; flex-direction: column; gap: 15px; }
        .vn-ws-view.active { display: flex; }
        .vn-ws-group { display: flex; flex-direction: column; gap: 8px; }
        .vn-ws-group label { font-size: 14px; color: #FBDFA2; font-weight: bold; }
        .vn-ws-input, .vn-ws-textarea { width: 100%; background: rgba(0,0,0,0.3); border: 1px solid rgba(251,223,162,0.4); color: #FFF; padding: 10px; border-radius: 6px; font-size: 14px; outline: none; }
        .vn-ws-input:focus, .vn-ws-textarea:focus { border-color: #FBDFA2; }
        .vn-ws-textarea { resize: vertical; min-height: 80px; }
        .vn-ws-btn { background: #452216; color: #FBDFA2; border: 1px solid #FBDFA2; padding: 12px; border-radius: 6px; cursor: pointer; font-weight: bold; text-align: center; transition: all 0.2s; }
        .vn-ws-btn:hover { background: #FBDFA2; color: #452216; }
        .vn-ws-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .vn-ws-preview-box { border: 1px dashed rgba(251,223,162,0.5); padding: 15px; border-radius: 6px; min-height: 120px; position: relative; background: #000; overflow: hidden;}
        .vn-ws-code-box { background: #0d0d0d; color: #00ffcc; padding: 10px; border-radius: 6px; font-family: monospace; font-size: 12px; white-space: pre-wrap; word-break: break-all; max-height: 200px; overflow-y: auto; border: 1px solid #333; }
        #vn-ws-loading { display: none; text-align: center; color: #00ffcc; font-size: 14px; margin-top: 10px; }
        .vn-ws-card { background: rgba(120,55,25,0.85); border-radius: 8px; padding: 16px; border: 1px solid rgba(251,223,162,0.3); margin-bottom: 15px; }
        #vn-ws-refine-area { display: none; margin-top: 15px; padding-top: 15px; border-top: 1px dashed rgba(251,223,162,0.4); animation: fadeIn 0.5s; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        
        /* 💡 點子 AI 專屬彈窗樣式 */
        #vn-ws-idea-overlay { display: none; position: absolute; inset: 0; background: rgba(0,0,0,0.85); z-index: 10000; align-items: center; justify-content: center; backdrop-filter: blur(3px); }
        .vn-ws-idea-modal { background: #1a0d0a; border: 1px solid #FBDFA2; border-radius: 12px; width: 85%; max-width: 400px; padding: 25px; display: flex; flex-direction: column; gap: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.8); }
    `;

    const workshopHTML = `
        <div class="vn-ws-container">
            <div class="vn-ws-header">
                <div class="vn-ws-title">
                    ✨ VN 標籤煉丹爐
                    <button class="vn-ws-idea-btn" id="vn-ws-btn-idea" title="呼叫點子 AI 幫你配藥材">💡</button>
                </div>
                <button class="vn-ws-close" id="vn-ws-btn-close">✖</button>
            </div>
            <div class="vn-ws-tabs">
                <div class="vn-ws-tab active" data-tab="furnace">🔥 煉丹爐</div>
                <div class="vn-ws-tab" data-tab="gallery">🖼️ 標籤展廳</div>
            </div>

            <div class="vn-ws-body">
                <div id="vn-ws-view-furnace" class="vn-ws-view active">
                    <div class="vn-ws-group">
                        <label>1. 標籤名稱 (限英數字)</label>
                        <input type="text" class="vn-ws-input" id="vn-ws-tag-id" placeholder="例如: auction">
                    </div>
                    <div class="vn-ws-group">
                        <label>2. 劇情格式定義 (支援單行與多行區塊)</label>
                        <textarea class="vn-ws-textarea" id="vn-ws-format" placeholder="格式定義..." style="min-height: 120px; font-family: monospace; line-height: 1.4;"></textarea>
                    </div>
                    <div class="vn-ws-group">
                        <label>3. 外觀與動畫描述 (交給 AI 設計師)</label>
                        <textarea class="vn-ws-textarea" id="vn-ws-desc" placeholder="UI描述..." style="min-height: 100px;"></textarea>
                    </div>
                    <button class="vn-ws-btn" id="vn-ws-btn-generate">讓 AI 開始煉丹 (全新生成)</button>
                    <div id="vn-ws-loading">AI 正在撰寫特效代碼，請稍候...</div>
                    
                    <div class="vn-ws-group" style="margin-top: 10px;">
                        <label>預覽效果 (可以直接點擊互動！)</label>
                        <div class="vn-ws-preview-box" id="vn-ws-preview"></div>
                    </div>

                    <div id="vn-ws-refine-area">
                        <div class="vn-ws-group">
                            <label style="color:#e67e22;">💡 效果不滿意？告訴 AI 怎麼修改：</label>
                            <textarea class="vn-ws-textarea" id="vn-ws-refine-desc" placeholder="例如：背景顏色改暗一點..."></textarea>
                            <button class="vn-ws-btn" id="vn-ws-btn-refine" style="background: rgba(230,126,34,0.1); color:#e67e22; border-color:#e67e22;">🛠️ 根據建議進行微調</button>
                        </div>
                    </div>

                    <div class="vn-ws-group">
                        <label>底層代碼 (JSON)</label>
                        <div class="vn-ws-code-box" id="vn-ws-code">等待生成...</div>
                    </div>
                    <button class="vn-ws-btn" id="vn-ws-btn-save" style="display: none; background: #27ae60; color: white; border-color: #2ecc71;">儲存並啟用此標籤</button>
                </div>

                <div id="vn-ws-view-gallery" class="vn-ws-view">
                    <div id="vn-ws-gallery-list" style="display:flex; flex-direction:column;"></div>
                </div>
            </div>

            <div id="vn-ws-idea-overlay">
                <div class="vn-ws-idea-modal">
                    <h3 style="color:#FBDFA2; margin:0; display:flex; align-items:center; gap:8px;">💡 點子 AI 助手</h3>
                    <p style="font-size:12px; color:#aaa; margin:0; line-height:1.5;">不會寫 UI 指令嗎？直接用大白話許願！<br>例如：「我想做一個醫院排班表，要有護理師名字、時段，點擊可以確認排班。」</p>
                    <textarea id="vn-ws-idea-input" class="vn-ws-textarea" placeholder="請用白話文描述你想做的介面..." style="min-height: 100px;"></textarea>
                    <div style="display:flex; flex-direction:column; gap:10px; margin-top:5px;">
                        <button id="vn-ws-idea-submit" class="vn-ws-btn" style="background:#2c3e50; border-color:#3498db; color:#3498db;">🤖 幫我生成煉丹配方</button>
                        <button id="vn-ws-idea-cancel" class="vn-ws-btn" style="background:transparent; border-color:#666; color:#aaa;">取消</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    let generatedData = null;
    let basePrompt = ""; 

    function launchWorkshop() {
        const root = document.getElementById('aurelia-phone-screen') || document.body;
        let existing = document.getElementById('vn_workshop_app');
        if (existing) existing.remove();

        if (!document.getElementById('vn_workshop_style')) {
            const styleElement = document.createElement('style');
            styleElement.id = 'vn_workshop_style';
            styleElement.innerHTML = workshopStyle;
            document.head.appendChild(styleElement);
        }

        const appDiv = document.createElement('div');
        appDiv.id = 'vn_workshop_app';
        appDiv.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; z-index:9000;';
        appDiv.innerHTML = workshopHTML;
        root.appendChild(appDiv);

        bindEvents();
    }

    function bindEvents() {
        document.getElementById('vn-ws-btn-close').onclick = () => document.getElementById('vn_workshop_app').remove();

        const tabs = document.querySelectorAll('.vn-ws-tab');
        tabs.forEach(tab => {
            tab.onclick = () => {
                tabs.forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.vn-ws-view').forEach(v => v.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(`vn-ws-view-${tab.dataset.tab}`).classList.add('active');
                if (tab.dataset.tab === 'gallery') loadGallery();
            };
        });

        // --- 💡 點子 AI 相關綁定 ---
        document.getElementById('vn-ws-btn-idea').onclick = () => {
            document.getElementById('vn-ws-idea-overlay').style.display = 'flex';
        };

        document.getElementById('vn-ws-idea-cancel').onclick = () => {
            document.getElementById('vn-ws-idea-overlay').style.display = 'none';
        };

        document.getElementById('vn-ws-idea-submit').onclick = async () => {
            const ideaInput = document.getElementById('vn-ws-idea-input').value.trim();
            if (!ideaInput) return alert('請先輸入你的點子！');

            const btn = document.getElementById('vn-ws-idea-submit');
            const originalText = btn.innerHTML;
            btn.innerHTML = '配方調製中...';
            btn.disabled = true;

            await requestIdeaTranslation(ideaInput);

            btn.innerHTML = originalText;
            btn.disabled = false;
        };

        // --- 原本的煉丹按鈕 ---
        document.getElementById('vn-ws-btn-generate').onclick = async () => {
            let rawTagId = document.getElementById('vn-ws-tag-id').value.trim();
            const tagId = rawTagId.replace(/[^a-zA-Z0-9_-]/g, '');
            if (rawTagId !== tagId) document.getElementById('vn-ws-tag-id').value = tagId;

            const format = document.getElementById('vn-ws-format').value.trim();
            const desc = document.getElementById('vn-ws-desc').value.trim();
            if (!tagId || !format || !desc) return alert('請完整填寫資訊');

            document.getElementById('vn-ws-loading').style.display = 'block';
            document.getElementById('vn-ws-btn-generate').disabled = true;
            document.getElementById('vn-ws-refine-area').style.display = 'none';

            await requestAIGeneration(tagId, format, desc, false);

            document.getElementById('vn-ws-loading').style.display = 'none';
            document.getElementById('vn-ws-btn-generate').disabled = false;
        };

        document.getElementById('vn-ws-btn-refine').onclick = async () => {
            const refineMsg = document.getElementById('vn-ws-refine-desc').value.trim();
            if (!refineMsg) return alert('請輸入修改建議！');

            document.getElementById('vn-ws-loading').style.display = 'block';
            document.getElementById('vn-ws-btn-refine').disabled = true;

            await requestAIGeneration(null, null, refineMsg, true);

            document.getElementById('vn-ws-loading').style.display = 'none';
            document.getElementById('vn-ws-btn-refine').disabled = false;
        };

        document.getElementById('vn-ws-btn-save').onclick = async () => {
            if (!generatedData || !generatedData.tagId) return alert('❌ 無法儲存：缺少標籤 ID！請重新生成。');
            const db = win.OS_DB || window.OS_DB;
            if (db && typeof db.saveVNTagTemplate === 'function') {
                try {
                    if (!generatedData.id) generatedData.id = 'tpl_' + Date.now();
                    generatedData.isActive = true;
                    
                    const formatText = document.getElementById('vn-ws-format').value.trim();
                    generatedData.demoFormat = formatText;
                    
                    await db.saveVNTagTemplate(generatedData);
                    await syncActiveTagsToLocal(); // ✨ 新增同步這行
                    if (win.VN_DynamicParser) await win.VN_DynamicParser.init();
                    alert('🎉 標籤已成功儲存！請切換至「展廳」查看。');
                    document.querySelector('.vn-ws-tab[data-tab="gallery"]').click();
                } catch (err) {
                    alert('❌ 儲存失敗: ' + err.message);
                }
            }
        };
    }

    // --- 💡 呼叫 API 幫忙填寫煉丹爐的三個格子 (優化版：使用 Schema 佔位符) ---
    async function requestIdeaTranslation(ideaText) {
        const apiEngine = win.OS_API || window.OS_API;
        if (!apiEngine || typeof apiEngine.chat !== 'function') {
            return alert("找不到獨立 API 引擎 (OS_API.chat)");
        }

        const prompt = `你是一個 VN 視覺小說引擎的「提示詞工程師 (Prompt Engineer)」。
用戶是一個不會寫程式的玩家，他會用大白話描述想要的遊戲面板。
你的任務是將點子轉化為給「下一個 AI (UI設計師)」看的標準指令。

用戶的點子：「${ideaText}」

### 輸出指令規範：
1. **tagId**: 適合點子的英文標籤名 (如 hospital_list)。
2. **format**: 
   - ⚠️ **絕對不要輸出具體的資料內容** (例如不要寫出特定的道具名或人名，不僅生成劇本時浪費Token，劇本AI還會產生「過度擬合（Overfitting）」)。
   - 請使用 **{變數名稱}** 作為佔位符 (例如：[Item|{name}|{rarity}] )。
   - 若為列表，請輸出一行標準格式後，下方加上 "... (根據劇情生成 N 行)"。
3. **desc**: 詳細的風格與互動描述。

### 格式要求：
- 必須將 JSON 物件包裹在 <json> 與 </json> 標籤內。
- JSON 內部換行請寫成 "\\n"。

範例格式思維 (僅供參考邏輯)：
<my_tag>
[Slot|{title}|{value}]
... (根據劇情生成 3 行)
</my_tag>

請開始轉換：`;

        try {
            let baseConfig = win.OS_SETTINGS?.getConfig?.() || JSON.parse(localStorage.getItem('os_global_config') || '{}');
            const pureConfig = { ...baseConfig, usePresetPrompts: false, enableThinking: false, temperature: 0.3 };

            const responseText = await new Promise((resolve, reject) => {
                apiEngine.chat([{ role: 'user', content: prompt }], pureConfig, null, resolve, reject, { disableTyping: true });
            });

            if (!responseText) throw new Error('AI 回傳空白');

            // 萃取 <json> 標籤內的純淨內容
            let cleanJsonStr = responseText;
            const xmlMatch = cleanJsonStr.match(/<json>([\s\S]*?)<\/json>/i);
            if (xmlMatch) {
                cleanJsonStr = xmlMatch[1].trim();
            } else {
                // 防禦性處理：如果沒有標籤，嘗試尋找大括號
                const jsonMatch = cleanJsonStr.match(/\{[\s\S]*\}/);
                if (jsonMatch) cleanJsonStr = jsonMatch[0];
            }

            // 移除非法控制字元並解析
            cleanJsonStr = cleanJsonStr.replace(/[\u0000-\u0009\u000B-\u001F]+/g, "");
            const resultObj = JSON.parse(cleanJsonStr);

            // 自動填入煉丹爐格子
            document.getElementById('vn-ws-tag-id').value = resultObj.tagId || 'custom_tag';
            document.getElementById('vn-ws-format').value = resultObj.format || '';
            document.getElementById('vn-ws-desc').value = resultObj.desc || '';

            // 關閉點子彈窗
            document.getElementById('vn-ws-idea-overlay').style.display = 'none';

        } catch (error) {
            console.error('[Idea AI] 轉換失敗:', error);
            alert('點子轉換失敗，請檢查 API 連線。\n錯誤: ' + error.message);
        }
    }

    // --- (以下原封不動保留) loadGallery, requestAIGeneration, renderPreview ---
    async function loadGallery() {
        const listEl = document.getElementById('vn-ws-gallery-list');
        listEl.innerHTML = '<div style="color:#aaa; text-align:center;">載入中...</div>';
        const db = win.OS_DB || window.OS_DB;
        if (!db || typeof db.getAllVNTagTemplates !== 'function') return;

        try {
            const templates = await db.getAllVNTagTemplates();
            if (templates.length === 0) {
                listEl.innerHTML = '<div style="color:#aaa; text-align:center; padding: 20px;">展廳空空如也。</div>';
                return;
            }
            listEl.innerHTML = '';
            
            templates.forEach(tpl => {
                const card = document.createElement('div');
                card.className = 'vn-ws-card';
                card.style.borderColor = tpl.isActive ? '#2ecc71' : 'rgba(251,223,162,0.3)';
                const previewHtml = (tpl.html || '').replace(/\{\{1\}\}/g, '參數A').replace(/\{\{2\}\}/g, '參數B');
                const scopedCss = tpl.css ? `<style>${tpl.css}</style>` : '';
                
                // 將 HTML 標籤轉義，避免在畫面上跑版
                const safeTagId = (tpl.tagId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '');
                const safeDemoFormat = (tpl.demoFormat || '無結構定義').replace(/</g, '&lt;').replace(/>/g, '&gt;');

                card.innerHTML = `
                    ${scopedCss}
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                        <strong style="color:#FBDFA2; font-size:16px;">[${tpl.tagId || '未知'}] 標籤</strong>
                        <span style="font-size:12px; color:${tpl.isActive ? '#2ecc71' : '#aaa'}">${tpl.isActive ? '✅ 已啟用' : '❌ 已停用'}</span>
                    </div>
                    
                    <div class="format-display-box" style="margin-bottom:10px; padding:10px; background:rgba(0,0,0,0.4); border-left:3px solid #B78456; border-radius:4px; position:relative;">
                        <div class="format-text" style="font-family:monospace; font-size:12px; color:#E0D8C8; white-space:pre-wrap; word-break:break-all;">${safeDemoFormat}</div>
                        <textarea class="format-input" style="display:none; width:100%; min-height:100px; background:rgba(0,0,0,0.8); color:#FFF; border:1px solid #FBDFA2; font-family:monospace; line-height:1.4; font-size:12px; padding:8px; border-radius:4px; box-sizing:border-box;">${tpl.demoFormat || ''}</textarea>
                        
                        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:8px;">
                            <button class="vn-ws-btn btn-edit-format" style="padding:4px 10px; font-size:12px; background:transparent; border-color:#3498db; color:#3498db;">✏️ 編輯格式</button>
                            <button class="vn-ws-btn btn-save-format" style="display:none; padding:4px 10px; font-size:12px; background:rgba(46,204,113,0.2); border-color:#2ecc71; color:#2ecc71;">💾 儲存</button>
                            <button class="vn-ws-btn btn-cancel-format" style="display:none; padding:4px 10px; font-size:12px; background:transparent; border-color:#e74c3c; color:#e74c3c;">❌ 取消</button>
                        </div>
                    </div>
                    
                    <div style="margin-bottom:12px; padding:10px; background:rgba(0,0,0,0.5); border-radius:6px; min-height:150px; position:relative; overflow:hidden;">
                        <div class="vn-dynamic-panel-${safeTagId}" style="position:relative; transform:none; left:0; top:0; width:100%; height:100%; min-height:150px; display:flex; flex-direction:column; justify-content:center;">
                            ${previewHtml}
                        </div>
                    </div>
                    <div style="display:flex; gap:10px;">
                        <div class="vn-ws-btn btn-toggle" style="flex:1; background:${tpl.isActive ? 'rgba(231,76,60,0.2)' : 'rgba(46,204,113,0.2)'}; border-color:${tpl.isActive ? '#e74c3c' : '#2ecc71'}; color:${tpl.isActive ? '#e74c3c' : '#2ecc71'}">
                            ${tpl.isActive ? '停用此標籤' : '啟用此標籤'}
                        </div>
                        <div class="vn-ws-btn btn-del" style="background:rgba(231,76,60,0.8); border:none; color:white;">刪除</div>
                    </div>
                `;
                
                // --- 綁定編輯格式事件 ---
                const box = card.querySelector('.format-display-box');
                const textEl = box.querySelector('.format-text');
                const inputEl = box.querySelector('.format-input');
                const btnEdit = box.querySelector('.btn-edit-format');
                const btnSave = box.querySelector('.btn-save-format');
                const btnCancel = box.querySelector('.btn-cancel-format');

                btnEdit.onclick = () => {
                    textEl.style.display = 'none';
                    btnEdit.style.display = 'none';
                    inputEl.style.display = 'block';
                    btnSave.style.display = 'block';
                    btnCancel.style.display = 'block';
                };

                btnCancel.onclick = () => {
                    textEl.style.display = 'block';
                    btnEdit.style.display = 'block';
                    inputEl.style.display = 'none';
                    btnSave.style.display = 'none';
                    btnCancel.style.display = 'none';
                    inputEl.value = tpl.demoFormat || ''; // 恢復原狀
                };

                btnSave.onclick = async () => {
                    tpl.demoFormat = inputEl.value;
                    await db.saveVNTagTemplate(tpl);
                    if (typeof syncActiveTagsToLocal === 'function') await syncActiveTagsToLocal(); // 同步給系統提示詞
                    loadGallery(); // 重新整理展廳
                };

                // --- 綁定原有的啟用與刪除事件 ---
                card.querySelector('.btn-toggle').onclick = async () => {
                    tpl.isActive = !tpl.isActive;
                    await db.saveVNTagTemplate(tpl);
                    if (typeof syncActiveTagsToLocal === 'function') await syncActiveTagsToLocal();
                    if (win.VN_DynamicParser) await win.VN_DynamicParser.init();
                    loadGallery();
                };
                
                card.querySelector('.btn-del').onclick = async () => {
                    if (confirm(`刪除 [${tpl.tagId}] 標籤？`)) {
                        await db.deleteUITemplate(tpl.id);
                        if (typeof syncActiveTagsToLocal === 'function') await syncActiveTagsToLocal();
                        if (win.VN_DynamicParser) await win.VN_DynamicParser.init();
                        loadGallery();
                    }
                };
                
                listEl.appendChild(card);

                if (tpl.isBlock && tpl.js) {
                    setTimeout(() => {
                        try {
                            const rawLines = (tpl.demoFormat || '').split('\n').map(l => l.trim()).filter(Boolean);
                            const lines = rawLines.filter(l => !l.startsWith('<') && !l.startsWith('</'));
                            const container = card.querySelector(`.vn-dynamic-panel-${safeTagId}`);
                            if (!container) return;
                            
                            let safeJs = tpl.js || '';
                            safeJs = safeJs.replace(new RegExp('\\x60\\x60\\x60(?:javascript|js|html|css)?', 'gi'), '').replace(new RegExp('\\x60\\x60\\x60', 'g'), '').trim();
                            
                            const runMicroApp = new Function('container', 'lines', 'onComplete', safeJs);
                            runMicroApp(container, lines, () => {
                                console.log(`[展廳] ${tpl.tagId} 互動完畢`);
                            });
                        } catch (e) {
                            console.warn('[展廳預覽 JS 錯誤]', e);
                        }
                    }, 50);
                }
            });
        } catch (err) {
            console.error('[展廳載入失敗]', err);
        }
    }

    async function requestAIGeneration(tagId, format, desc, isRefine) {
        document.getElementById('vn-ws-code').innerText = isRefine ? "正在請 AI 進行修改..." : "開始呼叫底層 API (純淨模式)...";
        
        let messages = [];

        if (!isRefine) {
            basePrompt = `你是一個擁有頂級美學的 UI/UX 設計師、資深前端工程師與 VN 引擎架構師。
使用者需要建立一個全新的動態面板，它會以「區塊（Block）」模式攔截多行文本，並由你編寫的 JS 來解析與呈現這些文本。

標籤名（Tag）：${tagId}
資料格式範例：
${format}

情境與風格描述：
${desc}

【✨ 頂級 UI/UX 設計指令】
即使使用者的描述非常簡單或抽象，你也「必須」發揮頂級設計師的實力，自動幫他腦補並設計出極致美觀、現代化、有沉浸感的遊戲介面。
1. 排版與留白：善用 Flexbox / Grid，確保元素之間有完美的比例與呼吸感。
2. 色彩與質感：根據使用者描述的主題（如科幻、魔法、現代手機等），調配出具備高級感的色彩計畫。廣泛使用精緻的漸層 (linear-gradient)、半透明玻璃質感 (backdrop-filter) 或材質感。
3. 深度與光影：使用多層次的 box-shadow 創造立體感，使用 text-shadow 讓文字發光或提高對比。
4. 現代化細節：適當的圓角 (border-radius)、精緻的字體大小層次 (font-weight, font-size)、細膩的邊框。
5. 流暢動畫：必須包含優雅的進場動畫 (@keyframes，如滑入、淡入、彈跳) 以及互動時的懸停過渡效果 (transition)。

請嚴格輸出一個純 JSON 對象，包含以下 key:
- "tagId": (字串) 英文 ID，例如 "${tagId}"
- "isBlock": true  (必須為 true，代表這是一個多行互動區塊)
- "html": (字串) 面板的初始骨架 HTML（不需要填入資料，資料由 JS 渲染）。
- "css": (字串) 專屬的 CSS 樣式。請加上 .vn-dynamic-panel-${tagId} 前綴。
- "js": (字串) 核心互動邏輯腳本。

【重點 JS 與 CSS 編寫規範】
你的 JS 腳本會被 \x60new Function('container', 'lines', 'onComplete', tpl.js)\x60 包裝執行。你擁有以下變數可用：
1. \x60container\x60 (HTMLElement): 你的骨架 HTML 所在的根節點。
2. \x60lines\x60 (Array of Strings): 介於 <\${tagId}> 到 </\${tagId}> 之間的所有純文字行，你需要自己寫正則去 parse 這些字串。
3. \x60onComplete\x60 (Function): 呼叫此函數會關閉面板並繼續遊戲。

你的任務必須做到：
1. 分析 \x60lines\x60 陣列中的字串，提取出所需資料。
2. 實現「步進（Step）」或「滾動」互動。
3. 當所有互動結束時（例如點擊完最後一筆），必須呼叫 \x60onComplete()\x60。
4. ⚠️ 絕對禁止在 CSS 使用 \x60position: fixed\x60、\x60100vw\x60 或 \x60100vh\x60！因為面板會被放在一個局部的預覽框中，使用 fixed 會導致元素飛出畫面。請一律使用 \x60position: absolute\x60、\x60width: 100%\x60、\x60height: 100%\x60 配合父層的 \x60position: relative\x60 來排版。

⚠️ 絕對禁止輸出 Markdown 代碼塊（不要有 \x60\x60\x60json ）。
⚠️ 【致命錯誤警告】JSON 的字串值 (如 html, css, js) 內部「絕對禁止」出現真實的換行符號 (Enter) 或 Tab！所有的換行請務必寫成 "\\n"，雙引號必須轉義為 "\\\""，否則會引發 Bad control character 導致系統崩潰！
⚠️ 保持 JS 程式碼簡潔穩定，使用 vanilla JS。`;
            messages = [{ role: 'user', content: basePrompt }];
        } else {
            messages = [
                { role: 'user', content: basePrompt },
                { role: 'assistant', content: JSON.stringify(generatedData) },
                { role: 'user', content: `請根據以下建議，修改你剛才生成的 JSON 結構：\n\n修改建議：【${desc}】\n\n⚠️ 必須輸出「完整」的 JSON 對象（包含 tagId, isBlock, html, css, js），絕不能只輸出修改的部分。保持純 JSON 格式，不要加 markdown 代碼塊。` }
            ];
        }

        try {
            const apiEngine = win.OS_API || window.OS_API;
            if (!apiEngine || typeof apiEngine.chat !== 'function') throw new Error("找不到獨立 API 引擎 (OS_API.chat)");

            let baseConfig = win.OS_SETTINGS?.getConfig?.() || JSON.parse(localStorage.getItem('os_global_config') || '{}');
            const pureConfig = { ...baseConfig, usePresetPrompts: false, enableThinking: false, temperature: 0.2 };

            const responseText = await new Promise((resolve, reject) => {
                apiEngine.chat(messages, pureConfig, null, resolve, reject, { disableTyping: true });
            });

            if (!responseText) throw new Error('AI 回傳空白');

            let cleanJsonStr = responseText.replace(new RegExp('\\x60\\x60\\x60json', 'gi'), '').replace(new RegExp('\\x60\\x60\\x60', 'g'), '').trim();
            const jsonMatch = cleanJsonStr.match(/\{[\s\S]*\}/);
            if (jsonMatch) cleanJsonStr = jsonMatch[0];

            cleanJsonStr = cleanJsonStr.replace(/[\u0000-\u0009\u000B-\u001F]+/g, "");
            const resultObj = JSON.parse(cleanJsonStr);

            if (isRefine && generatedData) {
                generatedData = {
                    tagId: resultObj.tagId || generatedData.tagId,
                    isBlock: resultObj.isBlock !== undefined ? resultObj.isBlock : generatedData.isBlock,
                    html: resultObj.html || generatedData.html,
                    css: resultObj.css || generatedData.css,
                    js: resultObj.js || generatedData.js
                };
            } else {
                generatedData = resultObj;
            }

            renderPreview(generatedData);

            document.getElementById('vn-ws-refine-area').style.display = 'block';

        } catch (error) {
            console.error('[Workshop] 生成失敗:', error);
            document.getElementById('vn-ws-code').innerText = 'API 調用失敗:\n' + error.message;
            alert('API 調用失敗: ' + error.message);
        }
    }

    function renderPreview(data) {
        document.getElementById('vn-ws-code').innerText = JSON.stringify(data, null, 2);
        const previewBox = document.getElementById('vn-ws-preview');
        
        let styleTag = document.getElementById(`preview-style-${data.tagId}`);
        if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = `preview-style-${data.tagId}`;
            document.head.appendChild(styleTag);
        }
        styleTag.innerHTML = data.css || '';

        let mockHtml = (data.html || '').replace(/\{\{1\}\}/g, '預覽參數 A').replace(/\{\{2\}\}/g, '預覽參數 B');
        previewBox.innerHTML = `<div class="vn-dynamic-panel-${data.tagId}" style="position:relative; transform:none; left:0; top:0; width:100%; height:100%; min-height: 150px; display: flex; flex-direction: column; justify-content: center; overflow: hidden;">${mockHtml}</div>`;
        document.getElementById('vn-ws-btn-save').style.display = 'block';

        if (data.isBlock && data.js) {
            try {
                const formatText = document.getElementById('vn-ws-format').value.trim();
                const rawLines = formatText.split('\n').map(l => l.trim()).filter(l => l);
                const lines = rawLines.filter(l => !l.startsWith('<') && !l.startsWith('</'));

                const container = previewBox.querySelector(`.vn-dynamic-panel-${data.tagId}`);
                
                const onComplete = () => { 
                    const msg = document.createElement('div');
                    msg.style.cssText = 'position:absolute; top:5px; right:5px; background:rgba(46,204,113,0.8); color:white; padding:4px 8px; font-size:12px; border-radius:4px; z-index:999;';
                    msg.innerText = '✅ 腳本已觸發 onComplete()';
                    previewBox.appendChild(msg);
                };

                let safeJs = data.js || '';
                safeJs = safeJs.replace(new RegExp('\\x60\\x60\\x60(?:javascript|js|html|css)?', 'gi'), '').replace(new RegExp('\\x60\\x60\\x60', 'g'), '').trim();

                const runMicroApp = new Function('container', 'lines', 'onComplete', safeJs);
                runMicroApp(container, lines, onComplete);

            } catch (e) {
                console.warn('[預覽錯誤] JS 執行失敗:', e);
                previewBox.innerHTML += `<div style="color:red; font-size:12px; margin-top:10px;">預覽腳本錯誤: ${e.message}</div>`;
            }
        }
    }

    // --- 📦 同步啟用標籤至 LocalStorage 供 AI 讀取 ---
    async function syncActiveTagsToLocal() {
        const db = win.OS_DB || window.OS_DB;
        if (!db || typeof db.getAllVNTagTemplates !== 'function') return;
        try {
            const templates = await db.getAllVNTagTemplates();
            // 只篩選出已啟用且有定義格式的標籤
            const activeTags = templates.filter(t => t.isActive && t.demoFormat);
            
            if (activeTags.length > 0) {
                let extraPrompt = `\n\n### [擴充動態特效標籤]\n你現在擁有額外的視覺特效標籤可以使用。請根據劇情氛圍，在最高潮或最適合的時機，獨立組輸出這些標籤來增強沉浸感：\n`;
                activeTags.forEach(t => {
                    extraPrompt += `\n${t.demoFormat}\n`;
                });
                localStorage.setItem('os_vn_extra_tags_prompt', extraPrompt);
            } else {
                localStorage.removeItem('os_vn_extra_tags_prompt');
            }
        } catch (e) {
            console.warn('[VN Workshop] 同步標籤至 LocalStorage 失敗', e);
        }
    }

    win.VN_UI_Workshop = { launch: launchWorkshop };
})();