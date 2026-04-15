// ----------------------------------------------------------------
// [檔案] os_avs.js (V1.2 - Dual-Mode AVS Workshop)
// 路徑：os_phone/os/os_avs.js
// 職責：變數工坊 App。管理變數包與煉丹爐。支援酒館/獨立雙通向。
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入 AVS 變數工坊系統 (V1.2)...');
    const win = window.parent || window; // 🔥 絕對保留雙通向核心

    // --- 樣式定義 ---
    const avsStyle = `
        .avs-container { width: 100%; height: 100%; background: #1a0d0a; color: #FFF8E7; display: flex; flex-direction: column; overflow: hidden; font-family: 'Noto Sans TC', sans-serif; position: relative; }
        .avs-header { padding: 15px 20px; background: rgba(69,34,22,0.85); border-bottom: 1px solid rgba(251,223,162,0.3); display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
        .avs-header { padding-top: calc(15px + env(safe-area-inset-top, 0px)); }
        body.layout-pad-ios .avs-header { padding-top: 55px !important; }
        .avs-title { font-size: 18px; font-weight: 800; letter-spacing: 2px; color: #FBDFA2; display: flex; align-items: center; gap: 8px; }
        .avs-back-btn { font-size: 24px; color: #B78456; cursor: pointer; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: all 0.2s; }
        .avs-back-btn:hover { background: rgba(251,223,162,0.1); }
        .avs-tabs { display: flex; background: rgba(69,34,22,0.9); border-bottom: 1px solid rgba(251,223,162,0.3); flex-shrink: 0; overflow-x: auto; scrollbar-width: none; }
        .avs-tabs::-webkit-scrollbar { display: none; }
        .avs-tab { flex: 1; text-align: center; padding: 12px 0; font-size: 13px; color: #B78456; cursor: pointer; position: relative; transition: 0.3s; font-weight: 600; white-space: nowrap; }
        .avs-tab.active { color: #FBDFA2; font-weight: 800; }
        .avs-tab.active::after { content: ''; position: absolute; bottom: 0; left: 0; width: 100%; height: 3px; background: #FBDFA2; border-radius: 3px 3px 0 0; box-shadow: 0 -2px 8px rgba(251,223,162,0.5); }
        .avs-content { flex: 1; overflow-y: auto; padding: 20px; position: relative; }
        .avs-view { display: none; animation: avsFadeIn 0.3s; flex-direction: column; gap: 20px; }
        .avs-view.active { display: flex; }
        .avs-card { background: rgba(120,55,25,0.85); border-radius: 8px; padding: 16px; border: 1px solid rgba(251,223,162,0.3); box-shadow: 0 4px 12px rgba(0,0,0,0.3); backdrop-filter: blur(10px); }
        .avs-label { font-size: 13px; color: rgba(251,223,162,0.6); margin-bottom: 8px; display: block; font-weight: 600; }
        .avs-input, .avs-textarea, .avs-select { background: rgba(69,34,22,0.8); border: 1px solid rgba(251,223,162,0.4); color: #FFF8E7; padding: 10px 12px; border-radius: 4px; font-size: 14px; outline: none; width: 100%; box-sizing: border-box; transition: all 0.2s; }
        .avs-input:focus, .avs-textarea:focus, .avs-select:focus { border-color: #FBDFA2; background: #452216; box-shadow: 0 0 0 2px rgba(251,223,162,0.2); }
        .avs-btn { padding: 12px; border-radius: 4px; text-align: center; font-weight: bold; cursor: pointer; transition: 0.2s; display: inline-flex; justify-content: center; align-items: center; gap: 8px; user-select: none; }
        .avs-btn-primary { background: linear-gradient(135deg,#FBDFA2,#c8a030); color: #1a0a04; border: none; }
        .avs-btn-outline { background: transparent; color: rgba(251,223,162,0.85); border: 1px solid rgba(251,223,162,0.4); }
        .avs-btn-danger { background: rgba(231,76,60,0.1); color: #e74c3c; border: 1px solid rgba(231,76,60,0.3); }
        .avs-var-row { display: flex; gap: 10px; align-items: center; margin-bottom: 10px; background: rgba(69,34,22,0.5); padding: 10px; border-radius: 4px; }
        .furnace-log { background: rgba(0,0,0,0.4); border: 1px solid rgba(251,223,162,0.15); border-radius: 4px; padding: 12px; font-family: monospace; font-size: 12px; color: rgba(251,223,162,0.5); max-height: 200px; overflow-y: auto; white-space: pre-wrap; }
        @keyframes avsFadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        .furnace-active { animation: avsGlow 2s infinite; border-color: rgba(251,223,162,0.8) !important; }
        @keyframes avsGlow { 0% { box-shadow: 0 0 10px rgba(251,223,162,0.2); } 50% { box-shadow: 0 0 20px rgba(251,223,162,0.5); } 100% { box-shadow: 0 0 10px rgba(251,223,162,0.2); } }
    `;

    if (!document.getElementById('avs-app-css')) {
        const s = document.createElement('style'); s.id = 'avs-app-css'; s.innerHTML = avsStyle; document.head.appendChild(s);
    }

    let currentPacks = [];
    let currentTemplates = [];
    let activeEditingPack = null;

    async function launchApp(container) {
        container.innerHTML = `
            <div class="avs-container">
                <div class="avs-header">
                    <div class="avs-back-btn" id="avs-nav-home">‹</div>
                    <div class="avs-title">🎲 變數工坊 AVS</div>
                    <div class="avs-back-btn" id="avs-btn-help" style="font-size:16px;font-weight:bold;">?</div>
                </div>
                <!-- 使用說明遮罩 -->
                <div id="avs-help-overlay" style="display:none;position:absolute;inset:0;background:rgba(26,13,10,0.97);z-index:200;overflow-y:auto;padding:20px 18px 80px;box-sizing:border-box;">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
                        <div style="font-size:16px;font-weight:bold;color:#FBDFA2;">📖 使用說明</div>
                        <div id="avs-help-close" style="font-size:22px;color:rgba(251,223,162,0.45);cursor:pointer;padding:4px 8px;">✕</div>
                    </div>
                    <div style="font-size:13px;color:#ccc;line-height:1.9;">

                        <div style="color:#FBDFA2;font-weight:bold;margin-bottom:6px;">🎲 變數工坊是什麼？</div>
                        <p style="color:#aaa;margin:0 0 16px;">
                            變數工坊讓你在跑團時，自動幫你記錄角色的各種數值，像是血量、金幣、好感度等等。<br>
                            AI 每次回覆時，會一起更新這些數字，你不用自己手動記。
                        </p>

                        <div style="color:#FBDFA2;font-weight:bold;margin-bottom:6px;">📦 第一步：建立「變數包」</div>
                        <p style="color:#aaa;margin:0 0 6px;">先決定你的故事要追蹤哪些東西，給它們取個名字和初始值。</p>
                        <div style="background:rgba(212,175,55,0.07);border-left:3px solid rgba(251,223,162,0.5);padding:10px 12px;border-radius:4px;margin-bottom:16px;font-family:monospace;font-size:12px;color:#d4af37;">
                            hp = 100　　← 血量，從100開始<br>
                            gold = 0　　← 金幣，從0開始<br>
                            好感度 = 0　← 名字可以用中文
                        </div>

                        <div style="color:#FBDFA2;font-weight:bold;margin-bottom:6px;">🔥 第二步：用「煉丹爐」做美化面板（可選）</div>
                        <p style="color:#aaa;margin:0 0 16px;">
                            選好變數包後，描述你想要的風格（例如「暗黑奇幻、血紅色」），讓 AI 自動幫你做一個好看的狀態面板。做好後到「展廳」開啟它，跑團時就會顯示漂亮的面板而不是純數字。
                        </p>

                        <div style="color:#FBDFA2;font-weight:bold;margin-bottom:6px;">⚡ 第三步：設定「條件規則」（可選）</div>
                        <p style="color:#aaa;margin:0 0 6px;">
                            你可以設定「當某個數值達到某個條件時，自動告訴 AI 要怎麼做」。
                        </p>
                        <div style="background:rgba(212,175,55,0.07);border-left:3px solid rgba(251,223,162,0.5);padding:10px 12px;border-radius:4px;margin-bottom:6px;font-size:12px;color:#d4af37;">
                            好感度 ≥ 80 → 告訴 AI：「這個角色現在對你非常親密，說話語氣要溫柔」
                        </div>
                        <p style="color:#aaa;margin:0 0 16px;font-size:12px;">
                            這樣你就不用在每次對話裡重複解釋角色行為，系統會自動根據數值切換說明，省下很多字數。
                        </p>

                        <div style="color:#FBDFA2;font-weight:bold;margin-bottom:6px;">📊 跑團中：看目前狀態</div>
                        <p style="color:#aaa;margin:0 0 16px;">
                            跑團時打開右側「資料中心」→「📊 狀態」，就可以看到目前所有數值，以及每一章改了什麼。<br>
                            如果 AI 這章亂改了數值，也可以點「↩ 回朔上一章節」撤銷。
                        </p>

                        <div style="color:#FBDFA2;font-weight:bold;margin-bottom:6px;">💡 提示：告訴 AI 怎麼更新數值</div>
                        <p style="color:#aaa;margin:0 0 6px;">在你的 Prompt 裡加上這段說明，AI 就知道要輸出數值變化了：</p>
                        <div style="background:rgba(212,175,55,0.07);border-left:3px solid rgba(251,223,162,0.5);padding:10px 12px;border-radius:4px;font-family:monospace;font-size:12px;color:#d4af37;">
                            每次回覆結束後，如果有數值改變，請在最後加上：<br>
                            &lt;vars&gt;<br>
                            hp -= 20<br>
                            gold += 100<br>
                            好感度 += 5<br>
                            &lt;/vars&gt;
                        </div>

                    </div>
                </div>
                <div class="avs-tabs">
                    <div class="avs-tab active" data-tab="state">📊 目前狀態</div>
                    <div class="avs-tab" data-tab="packs">📦 變數包</div>
                    <div class="avs-tab" data-tab="furnace">🔥 煉丹爐</div>
                    <div class="avs-tab" data-tab="gallery">🖼️ 展廳</div>
                    <div class="avs-tab" data-tab="rules">⚡ 條件規則</div>
                    <div class="avs-tab" data-tab="modes">🎭 模式</div>
                </div>
                <div class="avs-content">
                    <div id="avs-view-state" class="avs-view active"></div>
                    <div id="avs-view-rules" class="avs-view"></div>
                    <div id="avs-view-modes" class="avs-view"></div>
                    <div id="avs-view-packs" class="avs-view">
                        <div class="avs-btn avs-btn-primary" id="avs-btn-new-pack">＋ 創建新變數包</div>
                        <div id="avs-pack-list" style="display:flex; flex-direction:column; gap:10px;"></div>
                        <div id="avs-pack-editor" class="avs-card" style="display:none;">
                            <div class="avs-label">變數包名稱</div>
                            <input class="avs-input" id="avs-pack-name" style="margin-bottom:15px;">
                            <div class="avs-label">說明</div>
                            <textarea class="avs-textarea" id="avs-pack-notes" style="margin-bottom:15px;"></textarea>
                            <div id="avs-var-rows-container" style="margin-bottom:15px;"></div>
                            <div class="avs-btn avs-btn-outline" id="avs-btn-add-var" style="width:100%; margin-bottom:15px;">＋ 新增變數</div>
                            <div style="display:flex; gap:10px;">
                                <div class="avs-btn avs-btn-primary" id="avs-btn-save-pack" style="flex:1;">儲存</div>
                                <div class="avs-btn avs-btn-outline" id="avs-btn-cancel-pack" style="flex:1;">取消</div>
                            </div>
                        </div>
                    </div>
                    <div id="avs-view-furnace" class="avs-view">
                        <div class="avs-card" id="furnace-card">
                            <div class="avs-label">選擇變數包</div>
                            <select class="avs-select" id="furnace-pack-select" style="margin-bottom:15px;"></select>

                            <!-- 風格建議下拉（有建議時才顯示） -->
                            <div id="furnace-presets-wrap" style="display:none;margin-bottom:14px;">
                                <div class="avs-label" style="margin-bottom:6px;">💡 載入風格建議</div>
                                <div id="furnace-presets-list" style="display:flex;flex-direction:column;gap:6px;"></div>
                            </div>

                            <div class="avs-label">視覺風格要求</div>
                            <textarea class="avs-textarea" id="furnace-style-prompt" placeholder="例如：賽博龐克風格、霓虹發光、半透明玻璃&#10;或點上方「載入風格建議」快速填入" style="margin-bottom:15px;"></textarea>
                            <div class="avs-btn avs-btn-primary" id="furnace-start-btn" style="width:100%;">🔥 開始煉丹</div>
                            <div class="furnace-log" id="furnace-log-output" style="margin-top:15px;">等待點火...</div>
                        </div>
                    </div>
                    <div id="avs-view-gallery" class="avs-view">
                        <div id="avs-template-list" style="display:flex; flex-direction:column; gap:15px;"></div>
                    </div>
                </div>
            </div>
        `;

        container.querySelector('#avs-nav-home').onclick = () => { if (win.PhoneSystem) win.PhoneSystem.goHome(); };

        const helpOverlay = container.querySelector('#avs-help-overlay');
        container.querySelector('#avs-btn-help').onclick  = () => { helpOverlay.style.display = 'block'; };
        container.querySelector('#avs-help-close').onclick = () => { helpOverlay.style.display = 'none'; };

        const tabs = container.querySelectorAll('.avs-tab');
        tabs.forEach(tab => {
            tab.onclick = () => {
                tabs.forEach(t => t.classList.remove('active'));
                container.querySelectorAll('.avs-view').forEach(v => v.classList.remove('active'));
                tab.classList.add('active');
                container.querySelector(`#avs-view-${tab.dataset.tab}`).classList.add('active');
                if (tab.dataset.tab === 'furnace') refreshFurnacePackSelect(container);
                if (tab.dataset.tab === 'gallery') {
                    win.OS_DB?.getAllUITemplates?.().then(tpls => {
                        currentTemplates = tpls || [];
                        renderTemplateList(container);
                    });
                }
                if (tab.dataset.tab === 'state') renderStateView(container);
                if (tab.dataset.tab === 'rules') win.OS_AVS_RULES?.renderTab?.(container);
                if (tab.dataset.tab === 'modes') win.OS_AVS_RULES?.renderModesTab?.(container);
            };
        });

        await loadAllData(container);
        bindPackEditorEvents(container);
        bindFurnaceEvents(container);
        renderStateView(container); // 預設顯示目前狀態

        // 監聽 AVS 更新事件，自動刷新狀態頁
        win.addEventListener('AVS_VARS_UPDATED', () => {
            const stateView = container.querySelector('#avs-view-state');
            if (stateView && stateView.classList.contains('active')) renderStateView(container);
        });
    }

    async function loadAllData(container) {
        if (!win.OS_DB) return;
        currentPacks = await win.OS_DB.getAllVarPacks();
        currentTemplates = await win.OS_DB.getAllUITemplates();
        renderPackList(container);
    }

    function renderPackList(container) {
        const listEl = container.querySelector('#avs-pack-list');
        listEl.innerHTML = '';
        currentPacks.forEach(pack => {
            const card = document.createElement('div');
            card.className = 'avs-card';
            card.innerHTML = `
                <strong style="color:#FBDFA2;">${pack.name}</strong>
                <p style="font-size:12px; color:rgba(251,223,162,0.45);">${pack.variables.length} 個變數</p>
                <div style="display:flex; gap:10px; margin-top:10px;">
                    <div class="avs-btn avs-btn-outline btn-edit" style="flex:1; padding:6px;">編輯</div>
                    <div class="avs-btn avs-btn-danger btn-del" style="padding:6px 12px;">刪除</div>
                </div>
            `;
            card.querySelector('.btn-edit').onclick = () => openPackEditor(container, pack);
            card.querySelector('.btn-del').onclick = async () => {
                if (confirm('刪除？')) { await win.OS_DB.deleteVarPack(pack.id); await loadAllData(container); }
            };
            listEl.appendChild(card);
        });
    }

    function bindPackEditorEvents(container) {
        const btnNew = container.querySelector('#avs-btn-new-pack');
        const btnSave = container.querySelector('#avs-btn-save-pack');
        const btnCancel = container.querySelector('#avs-btn-cancel-pack');
        const btnAddVar = container.querySelector('#avs-btn-add-var');
        const rowsContainer = container.querySelector('#avs-var-rows-container');

        btnNew.onclick = () => openPackEditor(container, null);
        btnCancel.onclick = () => { container.querySelector('#avs-pack-editor').style.display = 'none'; container.querySelector('#avs-pack-list').style.display = 'flex'; btnNew.style.display = 'inline-flex'; };
        btnAddVar.onclick = () => addVarRow(rowsContainer, '', '');

        btnSave.onclick = async () => {
            const name = container.querySelector('#avs-pack-name').value;
            if (!name) return;
            const variables = [];
            rowsContainer.querySelectorAll('.avs-var-row').forEach(row => {
                const vn = row.querySelector('.var-name').value;
                if (vn) variables.push({ name: vn, defaultValue: row.querySelector('.var-default').value });
            });
            const pack = activeEditingPack ? { ...activeEditingPack } : { id: 'pack_' + Date.now() };
            pack.name = name; pack.notes = container.querySelector('#avs-pack-notes').value; pack.variables = variables;
            await win.OS_DB.saveVarPack(pack);
            btnCancel.onclick(); await loadAllData(container);
        };
    }

    function addVarRow(container, name, val) {
        const row = document.createElement('div');
        row.className = 'avs-var-row';
        row.innerHTML = `<input class="avs-input var-name" placeholder="名" value="${name}" style="flex:2;"><input class="avs-input var-default" placeholder="值" value="${val}" style="flex:1;"><div style="color:red; cursor:pointer;" onclick="this.parentElement.remove()">✖</div>`;
        container.appendChild(row);
    }

    function openPackEditor(container, pack) {
        activeEditingPack = pack;
        container.querySelector('#avs-pack-list').style.display = 'none';
        container.querySelector('#avs-btn-new-pack').style.display = 'none';
        const editor = container.querySelector('#avs-pack-editor');
        editor.style.display = 'block';
        container.querySelector('#avs-pack-name').value = pack ? pack.name : '';
        container.querySelector('#avs-pack-notes').value = pack ? pack.notes : '';
        const rows = container.querySelector('#avs-var-rows-container');
        rows.innerHTML = '';
        if (pack) pack.variables.forEach(v => addVarRow(rows, v.name, v.defaultValue));
        else addVarRow(rows, '', '');
    }

    function refreshFurnacePackSelect(container) {
        const select = container.querySelector('#furnace-pack-select');
        select.innerHTML = currentPacks.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    }

    // 更新煉丹爐風格建議列表（根據選中的 packId）
    function _refreshFurnacePresets(container, packId) {
        const wrap = container.querySelector('#furnace-presets-wrap');
        const list = container.querySelector('#furnace-presets-list');
        const styleInput = container.querySelector('#furnace-style-prompt');
        if (!wrap || !list) return;

        let presets = [];
        try { presets = JSON.parse(localStorage.getItem('avs_furnace_presets') || '[]'); } catch(e) {}
        const matched = presets.filter(p => p.packId === packId);

        if (matched.length === 0) { wrap.style.display = 'none'; return; }
        wrap.style.display = 'block';
        list.innerHTML = matched.map(p => `
            <div data-preset-id="${p.id}" style="
                display:flex;align-items:flex-start;gap:8px;
                background:rgba(212,175,55,0.06);border:1px solid rgba(212,175,55,0.18);
                border-radius:6px;padding:9px 10px;cursor:pointer;
                transition:background 0.15s;" class="furnace-preset-card">
                <div style="flex:1;font-size:12px;color:rgba(255,248,231,0.8);line-height:1.5;">
                    ${p.suggestion}
                </div>
                <button data-del-preset="${p.id}" style="
                    background:none;border:none;color:rgba(251,223,162,0.4);cursor:pointer;
                    font-size:13px;padding:0 2px;flex-shrink:0;"
                    title="刪除建議">✕</button>
            </div>
        `).join('');

        // 點卡片 → 填入風格輸入框
        list.querySelectorAll('.furnace-preset-card').forEach(card => {
            card.onclick = (e) => {
                if (e.target.closest('[data-del-preset]')) return;
                styleInput.value = card.querySelector('div').textContent.trim();
                card.style.border = '1px solid rgba(212,175,55,0.5)';
                card.style.background = 'rgba(212,175,55,0.12)';
                setTimeout(() => {
                    card.style.border = '1px solid rgba(212,175,55,0.18)';
                    card.style.background = 'rgba(212,175,55,0.06)';
                }, 600);
            };
        });

        // 刪除建議
        list.querySelectorAll('[data-del-preset]').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const id = btn.dataset.delPreset;
                let all = [];
                try { all = JSON.parse(localStorage.getItem('avs_furnace_presets') || '[]'); } catch(e) {}
                localStorage.setItem('avs_furnace_presets', JSON.stringify(all.filter(p => p.id !== id)));
                _refreshFurnacePresets(container, packId);
            };
        });
    }

    function bindFurnaceEvents(container) {
        // 選包時更新風格建議列表
        const packSelect = container.querySelector('#furnace-pack-select');
        packSelect.onchange = () => _refreshFurnacePresets(container, packSelect.value);
        // 初始載入
        _refreshFurnacePresets(container, packSelect.value);

        container.querySelector('#furnace-start-btn').onclick = async () => {
            const packId = container.querySelector('#furnace-pack-select').value;
            const pack = currentPacks.find(p => p.id === packId);
            if (!pack) return;
            const log = container.querySelector('#furnace-log-output');
            const stylePromptVal = container.querySelector('#furnace-style-prompt').value.trim();
            if (!stylePromptVal) { log.innerHTML = '⚠️ 請先填寫風格要求'; return; }

            log.innerHTML = '🔥 火力全開，煉製中…';
            const btn = container.querySelector('#furnace-start-btn');
            btn.disabled = true;

            try {
                const varList = pack.variables.map(v => `{{${v.name}}}`).join('、');
                const fullPrompt =
                    `你是一個頂級 UI 設計師。嚴格遵守以下規則，不得輸出任何解釋或說明文字，只輸出指定格式。\n\n` +
                    `輸出格式（不得更改標籤名稱，不得輸出標籤外的任何內容）：\n` +
                    `<ui_template>\n` +
                    `<style>\n/* 所有 CSS，父類必須是 .custom-status-panel */\n</style>\n` +
                    `<!-- HTML 結構，使用 ${varList} 作為數值佔位符 -->\n` +
                    `</ui_template>\n\n` +
                    `風格要求：${stylePromptVal}\n` +
                    `變數清單：${pack.variables.map(v => v.name).join('、')}`;

                // 使用與其他模組一致的 generateText 介面
                const full = await (
                    win.OS_API_ENGINE?.generateText?.('general_assistant', fullPrompt) ||
                    Promise.reject(new Error('API 引擎未就緒'))
                );

                if (!full) throw new Error('AI 回傳空白');

                // 提取 <ui_template> block（AI 可能在前面輸出 COT，用 greedy 找最後一個完整塊）
                const matches = [...full.matchAll(/<ui_template>([\s\S]*?)<\/ui_template>/gi)];
                const raw = matches.length ? matches[matches.length - 1][1] : null;

                // fallback：若沒有 <ui_template> 標籤，嘗試直接抓 HTML 內容
                const htmlFallback = !raw && full.includes('<div') ? full : null;
                const content = raw || htmlFallback;

                if (!content) throw new Error('AI 未輸出 <ui_template> 格式，請重試');

                const styleMatch = content.match(/<style>([\s\S]*?)<\/style>/i);
                await win.OS_DB.saveUITemplate({
                    id: 'tpl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                    packId: pack.id,
                    packName: pack.name,
                    stylePrompt: stylePromptVal,
                    cssContent: styleMatch ? styleMatch[1].trim() : '',
                    htmlContent: content.replace(/<style>[\s\S]*?<\/style>/gi, '').trim(),
                    isActive: false,
                    createdAt: Date.now(),
                });

                log.innerHTML = '🎉 煉丹完成！已存入展廳，切換到展廳 tab 即可查看。';

                // 若目前就在 gallery tab 則立即刷新
                if (container.querySelector('#avs-view-gallery')?.classList.contains('active')) {
                    win.OS_DB.getAllUITemplates().then(tpls => {
                        currentTemplates = tpls || [];
                        renderTemplateList(container);
                    });
                }
            } catch (e) {
                console.error('[AVS Furnace]', e);
                log.innerHTML = `❌ 炸鍋了：${e.message}`;
            } finally {
                btn.disabled = false;
            }
        };
    }

    function renderStateView(container) {
        const el = container.querySelector('#avs-view-state');
        if (!el) return;

        const eng = win._AVS_ENGINE;
        const storyId = localStorage.getItem('vn_current_story_id') || '';
        const stateKey = eng ? eng.getKey() : (storyId ? `avs_state_${storyId}` : 'avs_current_state');
        let state = {};
        try { state = JSON.parse(localStorage.getItem(stateKey) || '{}'); } catch(e) {}

        const entries = Object.entries(state);
        const storyLabel = storyId
            ? `<span style="color:#FBDFA2;">${localStorage.getItem('vn_current_story_title') || storyId}</span>`
            : '<span style="color:rgba(251,223,162,0.45);">（未開啟故事）</span>';

        // 快照數量
        let snapCount = 0;
        try { snapCount = JSON.parse(localStorage.getItem(`avs_snap_${stateKey}`) || '[]').length; } catch(e) {}

        el.innerHTML = `
            <div class="avs-card" style="margin-bottom:12px;">
                <div style="font-size:12px;color:rgba(251,223,162,0.45);margin-bottom:6px;">當前故事</div>
                <div style="font-size:14px;font-weight:bold;">${storyLabel}</div>
                <div style="font-size:11px;color:rgba(251,223,162,0.35);margin-top:4px;">key: ${stateKey} | 快照 ${snapCount} 步</div>
            </div>

            <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
                <div class="avs-btn avs-btn-outline" id="avs-btn-rollback" style="flex:1;padding:8px;font-size:12px;${snapCount === 0 ? 'opacity:0.4;pointer-events:none;' : ''}">
                    ↩ 還原上一步 (${snapCount})
                </div>
                <div class="avs-btn avs-btn-danger" id="avs-btn-clear-state" style="padding:8px;font-size:12px;">清空狀態</div>
            </div>

            <div style="display:flex;gap:8px;margin-bottom:16px;align-items:center;">
                <select class="avs-select" id="avs-init-pack-select" style="flex:1;font-size:12px;">
                    <option value="">從變數包初始化…</option>
                    ${currentPacks.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                </select>
                <div class="avs-btn avs-btn-primary" id="avs-btn-init-pack" style="padding:8px 14px;font-size:12px;white-space:nowrap;">套用</div>
            </div>

            <div style="padding:16px;text-align:center;color:rgba(251,223,162,0.4);font-size:12px;border:1px dashed rgba(251,223,162,0.15);border-radius:6px;">
                📊 當前數值與歷史紀錄<br>
                <span style="font-size:11px;color:rgba(251,223,162,0.3);">請在 VN 資料中心的「狀態」tab 查看</span>
            </div>
        `;

        // 還原快照
        const rollbackBtn = el.querySelector('#avs-btn-rollback');
        if (rollbackBtn && snapCount > 0) {
            rollbackBtn.onclick = () => {
                if (!eng) return;
                const restored = eng.restore();
                if (restored) { renderStateView(container); }
            };
        }

        // 清空狀態
        el.querySelector('#avs-btn-clear-state').onclick = () => {
            if (!confirm('確定清空當前故事的所有變數狀態？')) return;
            localStorage.removeItem(stateKey);
            localStorage.removeItem(`avs_snap_${stateKey}`);
            renderStateView(container);
        };

        // 從 Pack 初始化
        el.querySelector('#avs-btn-init-pack').onclick = () => {
            const packId = el.querySelector('#avs-init-pack-select').value;
            if (!packId) return;
            const pack = currentPacks.find(p => p.id === packId);
            if (!pack || !eng) return;
            if (!confirm(`以「${pack.name}」的預設值初始化當前故事狀態？原有數值將被覆蓋。`)) return;
            eng.initFromPack(pack);
            renderStateView(container);
        };
    }

    function renderTemplateList(container) {
        const list = container.querySelector('#avs-template-list');
        list.innerHTML = '';
        currentTemplates.forEach(tpl => {
            const pack = currentPacks.find(p => p.id === tpl.packId);
            const card = document.createElement('div');
            card.className = 'avs-card';
            card.style.borderColor = tpl.isActive ? 'rgba(251,223,162,0.8)' : 'rgba(251,223,162,0.3)';

            // 用當前狀態（或假值）替換佔位符做預覽
            const previewState = win._AVS_ENGINE?.read?.() || {};
            let previewHtml = tpl.htmlContent || '';
            let previewCss  = tpl.cssContent  || '';
            // 先用真實狀態替換
            Object.entries(previewState).forEach(([k, v]) => {
                previewHtml = previewHtml.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
            });
            // 剩餘未替換的佔位符用假值（變數名本身）填充
            if (pack) {
                (pack.variables || []).forEach(v => {
                    previewHtml = previewHtml.replace(new RegExp(`\\{\\{${v.name}\\}\\}`, 'g'), v.defaultValue ?? '0');
                });
            }
            previewHtml = previewHtml.replace(/\{\{[\w.]+\}\}/g, '—');

            const scopeId = `tpl-preview-${tpl.id}`;
            // 逐條 selector 前綴 #scopeId，避免 CSS nesting 問題
            let scopedCssText = '';
            if (previewCss) {
                scopedCssText = previewCss.replace(/([^{}@][^{}]*)\{/g, (match, selector) => {
                    const scoped = selector.trim().split(',')
                        .map(s => `#${scopeId} ${s.trim()}`).join(', ');
                    return `${scoped} {`;
                });
            }
            const scopedCss = scopedCssText ? `<style>${scopedCssText}</style>` : '';

            card.innerHTML = `
                ${scopedCss}
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                    <strong style="font-size:13px;color:#d4af37;">${pack ? pack.name : (tpl.packName || '未知')} - 面板</strong>
                    ${tpl.isActive ? '<span style="font-size:10px;color:#FBDFA2;border:1px solid rgba(251,223,162,0.4);padding:2px 7px;border-radius:3px;">啟用中</span>' : ''}
                </div>
                <div id="${scopeId}" style="margin-bottom:12px;padding:10px;background:rgba(0,0,0,0.3);border-radius:6px;min-height:60px;overflow:hidden;">
                    ${previewHtml || '<span style="color:rgba(251,223,162,0.4);font-size:12px;">（無預覽內容）</span>'}
                </div>
                <div style="display:flex; gap:10px;">
                    <div class="avs-btn avs-btn-primary btn-toggle" style="flex:1;">${tpl.isActive ? '取消啟用' : '設為啟用'}</div>
                    <div class="avs-btn avs-btn-danger btn-del">✖</div>
                </div>
            `;
            
            card.querySelector('.btn-toggle').onclick = async () => {
                // 如果是啟用操作，確保同一包的舊模板被取消
                if (!tpl.isActive) {
                    const samePackActive = currentTemplates.find(t => t.packId === tpl.packId && t.isActive && t.id !== tpl.id);
                    if (samePackActive) {
                        samePackActive.isActive = false;
                        await win.OS_DB.saveUITemplate(samePackActive);
                    }
                }
                
                tpl.isActive = !tpl.isActive;
                await win.OS_DB.saveUITemplate(tpl);
                currentTemplates = await win.OS_DB.getAllUITemplates();
                
                updateActiveTemplatesCache();
                renderTemplateList(container);
            };

            card.querySelector('.btn-del').onclick = async () => {
                if (confirm('確定要銷毀這個精美的 UI 模板嗎？')) {
                    await win.OS_DB.deleteUITemplate(tpl.id); 
                    currentTemplates = await win.OS_DB.getAllUITemplates();
                    updateActiveTemplatesCache();
                    renderTemplateList(container);
                }
            };
            list.appendChild(card);
        });
    }

    function updateActiveTemplatesCache() {
        const activeTpls = currentTemplates.filter(t => t.isActive);
        localStorage.setItem('avs_active_ui_templates', JSON.stringify(activeTpls));
        console.log('[AVS] 已更新全域活動模板快取。');
    }

    /**
     * 依 packId 自動啟用對應的 UI 模板（供角色卡進入故事時呼叫）
     * 若該包已有 isActive 的模板則不重複操作。
     */
    async function activateTemplateForPack(packId) {
        if (!packId || !win.OS_DB) return;
        try {
            const allTpls = await win.OS_DB.getAllUITemplates?.() || [];
            const packTpls = allTpls.filter(t => t.packId === packId);
            if (!packTpls.length) return;                           // 此包無模板
            if (packTpls.some(t => t.isActive)) return;            // 已有啟用的，不覆蓋

            // 取最新的模板（createdAt 最大）啟用
            packTpls.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            packTpls[0].isActive = true;
            await win.OS_DB.saveUITemplate(packTpls[0]);

            // 更新 localStorage 快取
            const updated = await win.OS_DB.getAllUITemplates?.() || [];
            localStorage.setItem('avs_active_ui_templates', JSON.stringify(updated.filter(t => t.isActive)));
            console.log(`[AVS] 自動啟用展廳面板：packId=${packId}`);
        } catch(e) {
            console.warn('[AVS] activateTemplateForPack 失敗:', e);
        }
    }

    win.OS_AVS = {
        launch: launchApp,
        activateTemplateForPack,
        /** 還原上一個 AVS 快照（可在 reroll/重試 時外部呼叫） */
        restoreSnapshot: () => win._AVS_ENGINE?.restore?.() ?? null,
        /** 取當前故事的 AVS 狀態 */
        getState: () => win._AVS_ENGINE?.read?.() ?? {},
        /** 以指定 pack 初始化當前故事狀態 */
        initFromPack: (pack) => win._AVS_ENGINE?.initFromPack?.(pack),
    };
})();