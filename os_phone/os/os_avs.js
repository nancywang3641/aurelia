// ----------------------------------------------------------------
// [檔案] os_avs.js (V1.1 - AVS Variable Workshop & SYS Menu Added)
// 路徑：os_phone/os/os_avs.js
// 職責：變數工坊 App，管理動態變數包 (VarPacks) 與 煉丹爐 (UI Templates)
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入 AVS 變數工坊系統 (V1.1)...');
    const win = window.parent || window;

    // --- 樣式定義 ---
    const avsStyle = `
        .avs-container { width: 100%; height: 100%; background: #0f0f13; color: #fff; display: flex; flex-direction: column; overflow: hidden; font-family: 'Noto Sans TC', sans-serif; }
        .avs-header { padding: calc(15px + env(safe-area-inset-top, 0px)) 20px 15px; background: #1a1a24; border-bottom: 1px solid #2d2d3d; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
        .avs-title { font-size: 18px; font-weight: bold; letter-spacing: 1px; color: #e67e22; display: flex; align-items: center; gap: 8px; }
        .avs-back-btn { font-size: 24px; color: #e67e22; cursor: pointer; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: 0.2s; }
        .avs-back-btn:hover { background: rgba(230, 126, 34, 0.1); }
        
        /* SYS 下拉選單樣式 */
        .avs-sys-dropdown { position: absolute; right: 0; top: 40px; background: #1e1e2a; border: 1px solid #3d3d4d; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); width: 140px; z-index: 100; animation: fadeIn 0.15s ease; }
        .avs-sys-item { padding: 12px 14px; font-size: 13px; color: #a0a0b0; cursor: pointer; border-bottom: 1px solid #2d2d3d; transition: 0.2s; display: flex; align-items: center; gap: 8px; }
        .avs-sys-item:last-child { border-bottom: none; }
        .avs-sys-item:hover { background: rgba(230,126,34,0.1); color: #e67e22; }

        .avs-tabs { display: flex; background: #1a1a24; border-bottom: 1px solid #2d2d3d; flex-shrink: 0; }
        .avs-tab { flex: 1; text-align: center; padding: 12px 0; font-size: 14px; color: #888; cursor: pointer; position: relative; transition: 0.3s; font-weight: 500; }
        .avs-tab.active { color: #e67e22; font-weight: bold; }
        .avs-tab.active::after { content: ''; position: absolute; bottom: 0; left: 0; width: 100%; height: 3px; background: #e67e22; border-radius: 3px 3px 0 0; }
        
        .avs-content { flex: 1; overflow-y: auto; padding: 20px; position: relative; }
        .avs-view { display: none; animation: fadeIn 0.3s; flex-direction: column; gap: 20px; }
        .avs-view.active { display: flex; }
        
        /* 元件樣式 */
        .avs-card { background: #1e1e2a; border-radius: 12px; padding: 16px; border: 1px solid #2d2d3d; box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
        .avs-label { font-size: 13px; color: #a0a0b0; margin-bottom: 8px; display: block; font-weight: 600; }
        .avs-input, .avs-select, .avs-textarea { background: #121218; border: 1px solid #3d3d4d; color: #fff; padding: 10px 12px; border-radius: 8px; font-size: 14px; outline: none; width: 100%; box-sizing: border-box; transition: 0.2s; }
        .avs-input:focus, .avs-textarea:focus { border-color: #e67e22; }
        .avs-textarea { resize: vertical; min-height: 80px; }
        
        .avs-btn { padding: 12px; border-radius: 8px; text-align: center; font-weight: bold; cursor: pointer; transition: 0.2s; display: inline-flex; justify-content: center; align-items: center; gap: 8px; user-select: none; }
        .avs-btn-primary { background: linear-gradient(135deg, #d35400 0%, #e67e22 100%); color: white; border: none; box-shadow: 0 4px 15px rgba(230, 126, 34, 0.3); }
        .avs-btn-primary:active { transform: scale(0.98); }
        .avs-btn-outline { background: transparent; color: #e67e22; border: 1px solid #e67e22; }
        .avs-btn-danger { background: rgba(231, 76, 60, 0.1); color: #e74c3c; border: 1px solid rgba(231, 76, 60, 0.3); }

        /* 變數列表列 */
        .avs-var-row { display: flex; gap: 10px; align-items: center; margin-bottom: 10px; background: #252533; padding: 10px; border-radius: 8px; }
        .avs-var-row-delete { color: #e74c3c; cursor: pointer; padding: 5px; }

        /* 煉丹爐特殊樣式 */
        .furnace-log { background: #0a0a0f; border: 1px solid #3d3d4d; border-radius: 8px; padding: 12px; font-family: monospace; font-size: 12px; color: #a0a0b0; max-height: 200px; overflow-y: auto; white-space: pre-wrap; word-wrap: break-word; }
        
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulseGlow { 0% { box-shadow: 0 0 10px rgba(230,126,34,0.2); } 50% { box-shadow: 0 0 20px rgba(230,126,34,0.6); } 100% { box-shadow: 0 0 10px rgba(230,126,34,0.2); } }
        .furnace-active { animation: pulseGlow 2s infinite; border-color: #e67e22 !important; }
    `;

    const targetDoc = (win.document);
    if (!targetDoc.getElementById('avs-app-css')) {
        const s = targetDoc.createElement('style'); s.id = 'avs-app-css'; s.innerHTML = avsStyle; targetDoc.head.appendChild(s);
    }

    // --- 內部狀態 ---
    let currentPacks = [];
    let currentTemplates = [];
    let activeEditingPack = null;

    // --- 初始化 UI ---
    async function launchApp(container) {
        container.innerHTML = `
            <div class="avs-container">
                <div class="avs-header">
                    <div class="avs-back-btn" id="avs-nav-home" title="返回大廳">‹</div>
                    <div class="avs-title">🎲 變數工坊 AVS</div>
                    
                    <div id="avs-sys-menu" style="position:relative;">
                        <div class="avs-back-btn" id="avs-sys-btn" title="系統選單" style="font-size:18px;">
                            <i class="fa-solid fa-sliders"></i>
                        </div>
                        <div class="avs-sys-dropdown" id="avs-sys-dropdown" style="display:none;">
                            <div class="avs-sys-item" data-app="設置"><i class="fa-solid fa-gear" style="width:16px;"></i> 設置</div>
                            <div class="avs-sys-item" data-app="提示詞"><i class="fa-solid fa-pen-nib" style="width:16px;"></i> 提示詞</div>
                            <div class="avs-sys-item" data-app="worldbook"><i class="fa-solid fa-book" style="width:16px;"></i> 世界書</div>
                            <div class="avs-sys-item" data-app="think"><i class="fa-solid fa-brain" style="width:16px;"></i> 思考記錄</div>
                        </div>
                    </div>
                </div>
                
                <div class="avs-tabs">
                    <div class="avs-tab active" data-tab="packs">📦 變數包</div>
                    <div class="avs-tab" data-tab="furnace">🔥 煉丹爐</div>
                    <div class="avs-tab" data-tab="gallery">🖼️ 展廳</div>
                </div>

                <div class="avs-content">
                    <div id="avs-view-packs" class="avs-view active">
                        <div class="avs-btn avs-btn-primary" id="avs-btn-new-pack">＋ 創建新變數包</div>
                        <div id="avs-pack-list" style="display:flex; flex-direction:column; gap:10px;"></div>
                        
                        <div id="avs-pack-editor" class="avs-card" style="display:none;">
                            <div class="avs-label">變數包名稱</div>
                            <input class="avs-input" id="avs-pack-name" placeholder="例如：RPG戰鬥狀態、戀愛好感度" style="margin-bottom:15px;">
                            
                            <div class="avs-label">備註/世界觀說明 (AI 煉丹時的參考)</div>
                            <textarea class="avs-textarea" id="avs-pack-notes" placeholder="描述這個變數包的用途，例如：這是一個賽博龐克風格的黑客入侵進度系統..." style="margin-bottom:15px;"></textarea>
                            
                            <div class="avs-label" style="display:flex; justify-content:space-between;">
                                <span>變數清單 (Variables)</span>
                                <span id="avs-btn-add-var" style="color:#e67e22; cursor:pointer;">＋ 新增一項</span>
                            </div>
                            <div id="avs-var-rows-container" style="margin-bottom:15px;"></div>
                            
                            <div style="display:flex; gap:10px;">
                                <div class="avs-btn avs-btn-primary" id="avs-btn-save-pack" style="flex:1;">💾 儲存包裹</div>
                                <div class="avs-btn avs-btn-outline" id="avs-btn-cancel-pack" style="flex:1;">取消</div>
                            </div>
                        </div>
                    </div>

                    <div id="avs-view-furnace" class="avs-view">
                        <div class="avs-card" id="furnace-card">
                            <div class="avs-label">1. 選擇要煉製的變數包</div>
                            <select class="avs-select" id="furnace-pack-select" style="margin-bottom:15px;"></select>

                            <div class="avs-label">2. 視覺風格與額外要求</div>
                            <textarea class="avs-textarea" id="furnace-style-prompt" placeholder="例如：\n- 賽博龐克風格，霓虹發光邊框\n- 生命值用紅色血條顯示\n- 整體背景為半透明黑色玻璃" style="margin-bottom:15px;"></textarea>

                            <div class="avs-btn avs-btn-primary" id="furnace-start-btn" style="width:100%; margin-bottom:15px;">🔥 開始煉丹 (呼叫 AI)</div>
                            
                            <div class="avs-label">煉丹進度日誌</div>
                            <div class="furnace-log" id="furnace-log-output">等待投入材料...</div>
                        </div>
                    </div>

                    <div id="avs-view-gallery" class="avs-view">
                        <div class="avs-card" style="background:rgba(230,126,34,0.1); border-color:#e67e22; margin-bottom:10px;">
                            <div style="font-size:13px; color:#f39c12;">💡 啟用的面板將會在 VN 閱讀器攔截到 &lt;vars&gt; 標籤時自動渲染出對應的視覺卡片。</div>
                        </div>
                        <div id="avs-template-list" style="display:flex; flex-direction:column; gap:15px;"></div>
                    </div>
                </div>
            </div>
        `;

        // 綁定導航與按鈕
        const backBtn = container.querySelector('#avs-nav-home');
        backBtn.onclick = () => { if (win.PhoneSystem) win.PhoneSystem.goHome(); };

        // --- 綁定 SYS 下拉選單邏輯 ---
        const sysBtn = container.querySelector('#avs-sys-btn');
        const sysDropdown = container.querySelector('#avs-sys-dropdown');
        if (sysBtn && sysDropdown) {
            sysBtn.onclick = (e) => {
                e.stopPropagation();
                const isOpen = sysDropdown.style.display !== 'none';
                sysDropdown.style.display = isOpen ? 'none' : 'block';
            };

            sysDropdown.querySelectorAll('.avs-sys-item').forEach(item => {
                item.onclick = () => {
                    sysDropdown.style.display = 'none';
                    const appName = item.dataset.app;
                    // 使用 ControlCenter 開啟指定的系統 App
                    if (appName && win.AureliaControlCenter) {
                        win.AureliaControlCenter.showOsApp(appName);
                    }
                };
            });

            // 點擊空白處關閉選單
            targetDoc.addEventListener('click', (e) => {
                const sysMenuBlock = container.querySelector('#avs-sys-menu');
                if (sysMenuBlock && !sysMenuBlock.contains(e.target)) {
                    sysDropdown.style.display = 'none';
                }
            });
        }

        // 綁定頁籤切換
        const tabs = container.querySelectorAll('.avs-tab');
        const views = container.querySelectorAll('.avs-view');
        tabs.forEach(tab => {
            tab.onclick = () => {
                tabs.forEach(t => t.classList.remove('active'));
                views.forEach(v => v.classList.remove('active'));
                tab.classList.add('active');
                container.querySelector(`#avs-view-${tab.dataset.tab}`).classList.add('active');
                if (tab.dataset.tab === 'furnace') refreshFurnacePackSelect(container);
                if (tab.dataset.tab === 'gallery') renderTemplateList(container);
            };
        });

        // 載入資料
        await loadAllData(container);
        bindPackEditorEvents(container);
        bindFurnaceEvents(container);
    }

    // --- 資料加載與渲染 ---
    async function loadAllData(container) {
        if (!win.OS_DB) return;
        currentPacks = await win.OS_DB.getAllVarPacks();
        currentTemplates = await win.OS_DB.getAllUITemplates();
        renderPackList(container);
    }

    function renderPackList(container) {
        const listEl = container.querySelector('#avs-pack-list');
        listEl.innerHTML = '';
        if (currentPacks.length === 0) {
            listEl.innerHTML = '<div style="color:#666; text-align:center; padding:20px;">目前沒有任何變數包，請點擊上方按鈕創建。</div>';
            return;
        }

        currentPacks.forEach(pack => {
            const card = document.createElement('div');
            card.className = 'avs-card';
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <strong style="color:#e67e22; font-size:15px;">${pack.name}</strong>
                    <span style="font-size:11px; color:#666;">${pack.variables.length} 個變數</span>
                </div>
                <div style="font-size:12px; color:#888; margin-bottom:10px; line-height:1.4;">${pack.notes || '無備註'}</div>
                <div style="display:flex; gap:8px;">
                    <div class="avs-btn avs-btn-outline btn-edit" style="flex:1; padding:6px; font-size:12px;">編輯</div>
                    <div class="avs-btn avs-btn-danger btn-del" style="padding:6px 12px; font-size:12px;">刪除</div>
                </div>
            `;
            card.querySelector('.btn-edit').onclick = () => openPackEditor(container, pack);
            card.querySelector('.btn-del').onclick = async () => {
                if (confirm(`確定刪除變數包「${pack.name}」？這將無法復原。`)) {
                    await win.OS_DB.deleteVarPack(pack.id);
                    await loadAllData(container);
                }
            };
            listEl.appendChild(card);
        });
    }

    // --- 編輯器邏輯 ---
    function bindPackEditorEvents(container) {
        const editor = container.querySelector('#avs-pack-editor');
        const list = container.querySelector('#avs-pack-list');
        const btnNew = container.querySelector('#avs-btn-new-pack');
        const btnCancel = container.querySelector('#avs-btn-cancel-pack');
        const btnSave = container.querySelector('#avs-btn-save-pack');
        const btnAddVar = container.querySelector('#avs-btn-add-var');
        const rowsContainer = container.querySelector('#avs-var-rows-container');

        btnNew.onclick = () => { activeEditingPack = null; openPackEditor(container, null); };
        btnCancel.onclick = () => { editor.style.display = 'none'; list.style.display = 'flex'; btnNew.style.display = 'inline-flex'; };

        btnAddVar.onclick = () => {
            const row = document.createElement('div');
            row.className = 'avs-var-row';
            row.innerHTML = `
                <input class="avs-input var-name" placeholder="變數名稱 (如: HP)" style="flex:2;">
                <input class="avs-input var-default" placeholder="預設值 (如: 100)" style="flex:1;">
                <div class="avs-var-row-delete" title="移除">✖</div>
            `;
            row.querySelector('.avs-var-row-delete').onclick = () => row.remove();
            rowsContainer.appendChild(row);
        };

        btnSave.onclick = async () => {
            const name = container.querySelector('#avs-pack-name').value.trim();
            const notes = container.querySelector('#avs-pack-notes').value.trim();
            if (!name) return alert('請填寫變數包名稱');

            const variables = [];
            rowsContainer.querySelectorAll('.avs-var-row').forEach(row => {
                const vName = row.querySelector('.var-name').value.trim();
                const vDef = row.querySelector('.var-default').value.trim();
                if (vName) variables.push({ name: vName, defaultValue: vDef });
            });

            if (variables.length === 0) return alert('請至少添加一個變數');

            const packData = activeEditingPack ? { ...activeEditingPack } : { id: 'avs_pack_' + Date.now() };
            packData.name = name;
            packData.notes = notes;
            packData.variables = variables;

            await win.OS_DB.saveVarPack(packData);
            editor.style.display = 'none';
            list.style.display = 'flex';
            btnNew.style.display = 'inline-flex';
            await loadAllData(container);
        };
    }

    function openPackEditor(container, pack) {
        activeEditingPack = pack;
        container.querySelector('#avs-pack-list').style.display = 'none';
        container.querySelector('#avs-btn-new-pack').style.display = 'none';
        
        const editor = container.querySelector('#avs-pack-editor');
        const rowsContainer = container.querySelector('#avs-var-rows-container');
        
        container.querySelector('#avs-pack-name').value = pack ? pack.name : '';
        container.querySelector('#avs-pack-notes').value = pack ? pack.notes : '';
        rowsContainer.innerHTML = '';

        const vars = pack ? pack.variables : [{name: '', defaultValue: ''}];
        vars.forEach(v => {
            const row = document.createElement('div');
            row.className = 'avs-var-row';
            row.innerHTML = `
                <input class="avs-input var-name" placeholder="變數名稱" value="${v.name}" style="flex:2;">
                <input class="avs-input var-default" placeholder="預設值" value="${v.defaultValue}" style="flex:1;">
                <div class="avs-var-row-delete" title="移除">✖</div>
            `;
            row.querySelector('.avs-var-row-delete').onclick = () => row.remove();
            rowsContainer.appendChild(row);
        });

        editor.style.display = 'block';
    }

    // --- 煉丹爐邏輯 (Furnace) ---
    function refreshFurnacePackSelect(container) {
        const select = container.querySelector('#furnace-pack-select');
        select.innerHTML = '<option value="">-- 請選擇變數包 --</option>';
        currentPacks.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = `${p.name} (${p.variables.length} 個變數)`;
            select.appendChild(opt);
        });
    }

    function logFurnace(container, msg, color = '#a0a0b0') {
        const logEl = container.querySelector('#furnace-log-output');
        const time = new Date().toLocaleTimeString('en-US', {hour12:false});
        logEl.innerHTML += `\n<span style="color:#555">[${time}]</span> <span style="color:${color}">${msg}</span>`;
        logEl.scrollTop = logEl.scrollHeight;
    }

    function bindFurnaceEvents(container) {
        const btnStart = container.querySelector('#furnace-start-btn');
        const card = container.querySelector('#furnace-card');

        btnStart.onclick = async () => {
            const packId = container.querySelector('#furnace-pack-select').value;
            const stylePrompt = container.querySelector('#furnace-style-prompt').value.trim();
            if (!packId) return alert('請先選擇一個變數包');

            const pack = currentPacks.find(p => p.id === packId);
            if (!pack) return;

            const varListText = pack.variables.map(v => `- ${v.name} (預設: ${v.defaultValue})`).join('\n');

            // 構建絕對嚴格的煉丹 Prompt
            const sysInstruction = `你是一個頂級的前端 UI 視覺設計師與魔法工程師。
使用者將提供一組「狀態變數」與「視覺風格要求」，請你為這些變數設計一個專屬的 HTML/CSS 狀態面板。

【變數清單】
${varListText}
使用者額外備註世界觀：${pack.notes || '無'}

【嚴格輸出規則 - 攸關系統存亡，請絕對遵守】
1. 你只能輸出純 HTML 與 CSS，絕對禁止包含任何 JavaScript 或 markdown 說明文字。
2. 所有 CSS 必須使用 .custom-status-panel 作為頂層父 class，防止污染全域樣式。
3. HTML 結構的最外層必須是 <div class="custom-status-panel">。
4. 變數的值必須使用雙大括號包覆作為佔位符，例如：{{變數名稱}}。
5. 你可以使用 CSS 漸層、box-shadow、自訂字體等高級技巧來極致美化面板，讓它符合使用者要求的風格。可以設計血條、進度條或發光的數字框。
6. 請將最終代碼用以下格式包裝，不要有多餘的廢話：
<ui_template>
<style>
/* 你的炫酷 CSS 寫在這裡 */
.custom-status-panel { ... }
</style>
<div class="custom-status-panel">
</div>
</ui_template>`;

            const userInstruction = `請根據以上變數，幫我生成 UI 模板。
我期望的視覺風格：
${stylePrompt || '現代簡約風格，清晰易讀，帶有一點遊戲 UI 的感覺。'}`;

            // UI 狀態更新
            btnStart.style.pointerEvents = 'none';
            btnStart.textContent = '🔥 煉製中... (請稍候)';
            card.classList.add('furnace-active');
            container.querySelector('#furnace-log-output').innerHTML = '';
            logFurnace(container, `初始化煉丹爐... 載入變數包 [${pack.name}]`, '#3498db');
            logFurnace(container, '配置材料中，準備點火...', '#3498db');

            try {
                // 讀取 OS_SETTINGS 的 API 配置 (主模型通常較聰明，適合寫代碼)
                let apiConfig = {};
                if (win.OS_SETTINGS && typeof win.OS_SETTINGS.getConfig === 'function') {
                    apiConfig = win.OS_SETTINGS.getConfig();
                } else {
                    throw new Error("無法讀取 API 配置，請確保已在「設置」中填寫 API 資訊。");
                }
                // 強制覆蓋一些設定以確保代碼生成穩定
                apiConfig.temperature = 0.5; 
                apiConfig.enableStreaming = false;

                const messages = [
                    { role: 'system', content: sysInstruction },
                    { role: 'user', content: userInstruction }
                ];

                logFurnace(container, `向 AI 模型發送煉製請求... (${apiConfig.model || 'System Default'})`, '#f1c40f');

                await new Promise((resolve, reject) => {
                    if (!win.OS_API || !win.OS_API.chat) return reject(new Error('OS_API 模組未載入'));
                    
                    win.OS_API.chat(messages, apiConfig, 
                        (chunk) => { /* streaming is off */ },
                        async (fullText) => {
                            logFurnace(container, 'AI 回覆接收完畢，開始萃取精華代碼...', '#f1c40f');
                            
                            // 萃取 <ui_template>
                            const match = fullText.match(/<ui_template>([\s\S]*?)<\/ui_template>/i);
                            if (!match) {
                                logFurnace(container, '煉丹失敗：AI 未按格式輸出 <ui_template> 標籤。', '#e74c3c');
                                console.warn('[AVS Furnace] Raw AI Output:', fullText);
                                reject(new Error('解析失敗'));
                                return;
                            }

                            const rawCode = match[1].trim();
                            // 分離 style 和 html (簡單切分)
                            const styleMatch = rawCode.match(/<style>([\s\S]*?)<\/style>/i);
                            const cssContent = styleMatch ? styleMatch[1].trim() : '';
                            const htmlContent = rawCode.replace(/<style>[\s\S]*?<\/style>/gi, '').trim();

                            const templateData = {
                                packId: pack.id,
                                stylePrompt: stylePrompt,
                                cssContent: cssContent,
                                htmlContent: htmlContent,
                                isActive: false // 預設不啟用
                            };

                            const tplId = await win.OS_DB.saveUITemplate(templateData);
                            logFurnace(container, `🎉 煉丹成功！已儲存模板 ID: ${tplId}`, '#2ecc71');
                            resolve();
                        },
                        (err) => {
                            logFurnace(container, `煉丹爐炸鍋了：${err.message}`, '#e74c3c');
                            reject(err);
                        }
                    );
                });

                // 重新載入資料
                currentTemplates = await win.OS_DB.getAllUITemplates();

            } catch (error) {
                console.error('[AVS Furnace Error]', error);
            } finally {
                btnStart.style.pointerEvents = '';
                btnStart.textContent = '🔥 開始煉丹 (呼叫 AI)';
                card.classList.remove('furnace-active');
            }
        };
    }

    // --- 展廳邏輯 (Gallery) ---
    function renderTemplateList(container) {
        const listEl = container.querySelector('#avs-template-list');
        listEl.innerHTML = '';
        if (currentTemplates.length === 0) {
            listEl.innerHTML = '<div style="color:#666; text-align:center; padding:20px;">展廳空空如也，請先去煉丹爐製作面板。</div>';
            return;
        }

        currentTemplates.forEach(tpl => {
            const pack = currentPacks.find(p => p.id === tpl.packId);
            const packName = pack ? pack.name : '未知變數包 (可能已刪除)';
            const timeStr = new Date(tpl.createdAt).toLocaleString();

            const card = document.createElement('div');
            card.className = 'avs-card';
            card.style.borderColor = tpl.isActive ? '#2ecc71' : '#2d2d3d';
            if (tpl.isActive) card.style.boxShadow = '0 0 15px rgba(46, 204, 113, 0.2)';

            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
                    <div>
                        <div style="color:${tpl.isActive ? '#2ecc71' : '#fff'}; font-weight:bold; font-size:15px; margin-bottom:4px;">
                            ${tpl.isActive ? '✅ 啟用中' : '📄 靜置中'}
                        </div>
                        <div style="font-size:11px; color:#888;">綁定：${packName} | 煉製於 ${timeStr}</div>
                    </div>
                    <div class="avs-btn avs-btn-danger btn-del-tpl" style="padding:4px 8px; font-size:11px;">刪除</div>
                </div>
                
                <div style="font-size:12px; color:#a0a0b0; background:#121218; padding:8px; border-radius:6px; margin-bottom:15px; max-height:60px; overflow:hidden; text-overflow:ellipsis;">
                    風格要求：${tpl.stylePrompt || '無'}
                </div>

                <div style="display:flex; gap:10px; margin-bottom:15px;">
                    <div class="avs-btn avs-btn-outline btn-preview" style="flex:1; padding:8px; font-size:12px;">👁️ 預覽面板</div>
                    <div class="avs-btn ${tpl.isActive ? 'avs-btn-outline' : 'avs-btn-primary'} btn-toggle-active" style="flex:1; padding:8px; font-size:12px;">
                        ${tpl.isActive ? '暫停使用' : '🚀 設為啟用'}
                    </div>
                </div>

                <div class="preview-container" style="display:none; background:#000; padding:15px; border-radius:8px; border:1px dashed #555;"></div>
            `;

            // 預覽邏輯
            const btnPreview = card.querySelector('.btn-preview');
            const previewContainer = card.querySelector('.preview-container');
            btnPreview.onclick = () => {
                if (previewContainer.style.display === 'block') {
                    previewContainer.style.display = 'none';
                    return;
                }
                
                // 替換假資料
                let finalHtml = tpl.htmlContent;
                if (pack) {
                    pack.variables.forEach(v => {
                        const regex = new RegExp(`{{${v.name}}}`, 'g');
                        finalHtml = finalHtml.replace(regex, v.defaultValue);
                    });
                }
                
                // 為了避免 CSS 污染，我們使用 Shadow DOM
                previewContainer.innerHTML = '';
                const shadow = previewContainer.attachShadow({mode: 'open'});
                shadow.innerHTML = `<style>${tpl.cssContent}</style> ${finalHtml}`;
                previewContainer.style.display = 'block';
            };

            // 啟用切換邏輯
            const btnToggle = card.querySelector('.btn-toggle-active');
            btnToggle.onclick = async () => {
                // 如果是啟用，先將同變數包的其他模板設為不啟用
                if (!tpl.isActive) {
                    for (let otherTpl of currentTemplates) {
                        if (otherTpl.packId === tpl.packId && otherTpl.isActive) {
                            otherTpl.isActive = false;
                            await win.OS_DB.saveUITemplate(otherTpl);
                        }
                    }
                }
                
                tpl.isActive = !tpl.isActive;
                await win.OS_DB.saveUITemplate(tpl);
                currentTemplates = await win.OS_DB.getAllUITemplates();
                
                // 寫入 localStorage 供 vn_core 快速讀取渲染
                updateActiveTemplatesCache();
                renderTemplateList(container);
            };

            // 刪除邏輯
            const btnDel = card.querySelector('.btn-del-tpl');
            btnDel.onclick = async () => {
                if (confirm('確定要銷毀這個精美的 UI 模板嗎？')) {
                    await win.OS_DB.deleteUITemplate(tpl.id);
                    currentTemplates = await win.OS_DB.getAllUITemplates();
                    updateActiveTemplatesCache();
                    renderTemplateList(container);
                }
            };

            listEl.appendChild(card);
        });
    }

    // 將所有啟用的模板快取到 localStorage，讓閱讀器攔截變數時能毫秒級渲染
    function updateActiveTemplatesCache() {
        const activeTpls = currentTemplates.filter(t => t.isActive);
        localStorage.setItem('avs_active_ui_templates', JSON.stringify(activeTpls));
        console.log('[AVS] 已更新全域活動模板快取。');
    }

    // --- 導出模組 ---
    win.OS_AVS = {
        launch: function(container) {
            launchApp(container);
        }
    };

})();