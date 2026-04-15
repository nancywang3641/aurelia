// ----------------------------------------------------------------
// [檔案] qb_core.js (V8.0 - 瀅瀅的書咖：純書本內頁與地圖引擎版)
// 職責：視差宇宙任務面板 (專注於書本內容、任務生成、地圖解析與組隊)
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入視差宇宙引擎 (V8.0 書本內頁與地圖解析版)...');
    const win = window.parent || window;

    // === 1. 樣式定義 (書本內頁與地圖特效) ===
    const appStyle = `
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&family=Noto+Sans+TC:wght@400;700&display=swap');

        /* 覆蓋在大廳之上的書本模態框 */
        #qb-inner-modal-root {
            position: absolute; inset: 0;
            background: rgba(15, 12, 10, 0.85); backdrop-filter: blur(8px);
            z-index: 2000; display: flex; justify-content: center; align-items: center;
            opacity: 0; pointer-events: none; transition: opacity 0.3s ease;
            font-family: 'Crimson Text', 'Noto Sans TC', serif;
        }
        #qb-inner-modal-root.active { opacity: 1; pointer-events: auto; }

        /* 書本主體 */
        .qb-modal-box { 
            width: 92%; height: 85%; background: #f4ecd8; 
            border: 2px solid #dcd0b8; border-radius: 4px 12px 12px 4px; 
            display: flex; flex-direction: column; overflow: hidden; 
            box-shadow: inset 20px 0 30px rgba(139,115,85,0.15), 0 20px 50px rgba(0,0,0,0.8); 
            transform: scale(0.95) translateY(10px); transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); 
            position: relative; 
        }
        #qb-inner-modal-root.active .qb-modal-box { transform: scale(1) translateY(0); }
        
        /* 書本中線陰影 */
        .qb-modal-box::before {
            content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 40px;
            background: linear-gradient(to right, rgba(0,0,0,0.15), transparent); pointer-events: none; z-index: 10;
        }
        
        .qb-header { position: relative; z-index: 2; flex-shrink: 0; padding: 15px 20px; background: transparent; color: #3e271a; border-bottom: 2px solid rgba(139,115,85,0.3); display: flex; justify-content: space-between; align-items: center; }
        .qb-header h1 { margin: 0; font-family: 'Cinzel', serif; font-size: 18px; font-weight: 700; letter-spacing: 1px; }
        .qb-close-btn { background: none; border: none; color: #716053; font-size: 20px; cursor: pointer; transition: 0.2s; padding: 0; line-height: 1; font-weight: bold; }
        .qb-close-btn:hover { color: #b91c1c; transform: scale(1.1); }
        
        .qb-content { flex: 1; overflow-y: auto; position: relative; z-index: 2; padding: 20px; display: flex; flex-direction: column; gap: 15px; color: #2c1e16; }
        .qb-content::-webkit-scrollbar { width: 6px; }
        .qb-content::-webkit-scrollbar-thumb { background: #bfa982; border-radius: 3px; }

        /* 任務列表 */
        .qb-quest-card { background: rgba(255,255,255,0.6); border: 1px solid #dcd0b8; border-radius: 4px; padding: 12px 12px 12px 20px; cursor: pointer; transition: all 0.2s; position: relative; margin-bottom: 10px; box-shadow: 0 2px 5px rgba(139,115,85,0.1); border-left: 4px solid #bfa982; }
        .qb-quest-card:hover { transform: translateX(5px); background: #fff; border-color: #bfa982; box-shadow: 0 4px 10px rgba(139,115,85,0.2); }
        .qb-quest-rank { position: absolute; top: 10px; right: 10px; font-family: 'Cinzel', serif; font-size: 24px; font-weight: 700; opacity: 0.15; }
        .qb-quest-title { font-size: 15px; font-weight: 700; color: #3e271a; margin-bottom: 4px; }
        .qb-quest-meta { display: flex; gap: 8px; font-size: 11px; color: #716053; margin-bottom: 6px; }
        .qb-quest-desc { font-size: 12px; color: #4a3f35; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

        /* 地圖系統 CSS */
        .qb-map-container { width: 100%; height: 220px; background: #e8e0cc; border: 2px solid #bfa982; border-radius: 6px; position: relative; overflow: hidden; margin-top: 15px; box-shadow: inset 0 0 20px rgba(139,115,85,0.3); }
        .qb-map-bg { position: absolute; inset: 0; background-size: cover; background-position: center; opacity: 0.4; filter: sepia(40%); transition: opacity 0.3s; }
        .qb-map-container:hover .qb-map-bg { opacity: 0.6; filter: sepia(20%); }
        .qb-map-grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(139,115,85,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(139,115,85,0.15) 1px, transparent 1px); background-size: 20% 20%; pointer-events: none; }
        .qb-map-marker { position: absolute; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; cursor: pointer; transition: 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275); z-index: 10; }
        .qb-map-marker:hover { z-index: 20; transform: translate(-50%, -50%) scale(1.2); }
        .qb-marker-icon { font-size: 18px; text-shadow: 0 2px 4px rgba(0,0,0,0.4); background: rgba(255,255,255,0.9); border: 2px solid #3e271a; border-radius: 50%; width: 30px; height: 30px; display: flex; justify-content: center; align-items: center; box-shadow: 0 4px 8px rgba(0,0,0,0.2); }
        .qb-marker-label { font-size: 10px; color: #fff; background: rgba(62, 39, 26, 0.9); padding: 2px 6px; border-radius: 4px; margin-top: 4px; white-space: nowrap; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.3); pointer-events: none; opacity: 0; transition: opacity 0.2s; }
        .qb-map-marker:hover .qb-marker-label { opacity: 1; }

        /* 通用按鈕與列 */
        .qb-bottom-bar { position: relative; z-index: 2; flex-shrink: 0; padding: 15px 20px; background: transparent; border-top: 1px solid rgba(139,115,85,0.3); display: flex; gap: 10px; }
        .qb-btn-back { flex: 1; padding: 10px; background: rgba(255,255,255,0.5); border: 1px solid #bfa982; color: #716053; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; transition: 0.2s; }
        .qb-btn-back:hover { background: #fff; color: #3e271a; border-color: #3e271a; }
        .qb-btn-action { flex: 2; padding: 10px; background: linear-gradient(135deg, #3e271a, #2c1e16); color: #FBDFA2; border: none; border-radius: 6px; font-size: 14px; font-weight: bold; cursor: pointer; transition: 0.2s; font-family: 'Cinzel', serif; letter-spacing: 1px; box-shadow: 0 4px 10px rgba(0,0,0,0.3); }
        .qb-btn-action:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 15px rgba(0,0,0,0.4); filter: brightness(1.1); }
        .qb-btn-action:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }

        .qb-loading { text-align: center; padding: 30px 10px; color: #3e271a; font-size: 13px; font-style: italic; display: flex; flex-direction: column; align-items: center; gap: 15px; }
        .qb-spinner { width: 30px; height: 30px; border: 3px solid rgba(139,115,85,0.3); border-top-color: #3e271a; border-radius: 50%; animation: qb-spin 1s linear infinite; }
        @keyframes qb-spin { to { transform: rotate(360deg); } }

        /* 瀅瀅對話框 (內頁版) */
        #yingying-rpg-dialog {
            position: absolute; bottom: 30px; left: 50%; transform: translateX(-50%) translateY(20px);
            width: 90%; max-width: 500px;
            background: rgba(255, 255, 255, 0.95); border: 2px solid #bfa982; border-radius: 8px;
            display: flex; align-items: flex-start; gap: 15px; padding: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3); z-index: 3000; cursor: pointer;
            opacity: 0; pointer-events: none; transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            font-family: 'Noto Sans TC', sans-serif;
        }
        #yingying-rpg-dialog.active { opacity: 1; pointer-events: auto; transform: translateX(-50%) translateY(0); }
        .ying-avatar { width: 70px; height: 70px; border-radius: 4px; border: 2px solid #bfa982; background: url('https://files.catbox.moe/l5hl69.png') center/cover; flex-shrink: 0; }
        .ying-content { flex: 1; display: flex; flex-direction: column; }
        .ying-name { color: #3e271a; font-size: 15px; font-weight: bold; margin-bottom: 5px; letter-spacing: 1px; border-bottom: 1px solid rgba(139,115,85,0.3); padding-bottom: 3px; }
        .ying-text { color: #4a3f35; font-size: 14px; line-height: 1.6; }
    `;

    if (!document.getElementById('qb-core-style')) {
        const style = document.createElement('style'); style.id = 'qb-core-style'; style.innerHTML = appStyle; document.head.appendChild(style);
    }

    // === 2. 狀態與常數 ===
    let STATE = {
        activeWorld: null,
        questList: [],
        activeQuest: null,
        activeMap: null, // 儲存當前任務解析出的地圖資料
        team: [],
        candidates: [],
        selectedMode: 'vn'
    };
    let isProcessing = false;

    // === 3. 核心 API 工具 ===
    async function callApi(promptKey, userMessage) {
        if (isProcessing) return null;
        isProcessing = true;
        try {
            console.log(`[QB] API Call: ${promptKey}`);
            if (win.OS_API_ENGINE && typeof win.OS_API_ENGINE.generateText === 'function') {
                const result = await win.OS_API_ENGINE.generateText(promptKey, userMessage);
                isProcessing = false;
                return result;
            }
            console.warn('[QB] 尚未掛載獨立 API 引擎 (OS_API_ENGINE)。');
            isProcessing = false;
            return null;
        } catch (e) {
            console.error("[QB] API 崩潰:", e);
            isProcessing = false;
            return null;
        }
    }

    // 瀅瀅專屬 RPG 對話框
    function showYingyingDialog(text) {
        if (!text || text.trim() === '') return;
        let box = document.getElementById('yingying-rpg-dialog');
        if (!box) {
            box = document.createElement('div');
            box.id = 'yingying-rpg-dialog';
            box.innerHTML = `<div class="ying-avatar"></div><div class="ying-content"><div class="ying-name">瀅瀅 (店長)</div><div class="ying-text"></div></div>`;
            const root = document.getElementById('qb-inner-modal-root') || document.body;
            root.appendChild(box);
            box.addEventListener('click', () => box.classList.remove('active'));
        }
        box.querySelector('.ying-text').innerText = text;
        box.classList.remove('active');
        void box.offsetWidth; 
        box.classList.add('active');
        clearTimeout(box._timer);
        box._timer = setTimeout(() => { if (box.classList.contains('active')) box.classList.remove('active'); }, 8000);
    }

    function parseNarrative(text) {
        if (!text) return;
        const cleanText = text.replace(/\[Quest\|.*?\]/g, '').replace(/\[Recruit\|.*?\]/g, '').replace(/<scene-map>[\s\S]*?<\/scene-map>/g, '').trim();
        if (cleanText === '') return;
        
        const match = cleanText.match(/\[Char\|([^|]+)\|([^|]+)\|([^\]]+)\]/);
        if (match && (match[1].includes('瀅') || match[1].toLowerCase().includes('ying'))) {
            let msg = match[3].trim();
            if (msg.startsWith('「') && msg.endsWith('」')) msg = msg.substring(1, msg.length - 1);
            showYingyingDialog(msg);
        }
    }

    // === 4. UI 注入與啟動 ===
    function injectInnerModal() {
        let root = document.getElementById('qb-inner-modal-root');
        if (!root) {
            const homeTab = document.getElementById('aurelia-home-tab');
            if (!homeTab) return null;
            homeTab.style.position = 'relative';
            root = document.createElement('div');
            root.id = 'qb-inner-modal-root';
            root.innerHTML = `
                <div class="qb-modal-box">
                    <div class="qb-header">
                        <h1 id="qb-modal-title">📖 讀取中...</h1>
                        <button class="qb-close-btn" onclick="window.QB_CORE.closeModal()">✕</button>
                    </div>
                    <div class="qb-content" id="qb-modal-content"></div>
                    <div class="qb-bottom-bar" id="qb-modal-bottom-bar" style="display:none;"></div>
                </div>
            `;
            homeTab.appendChild(root);
        }
        return root;
    }

    function closeModal() {
        const root = document.getElementById('qb-inner-modal-root');
        if (root) root.classList.remove('active');
    }

    // 自動綁定世界對應的變數包 + 煉丹爐面板
    async function _autoBindWorldPack(packId) {
        if (!packId || !win.OS_DB) return;
        try {
            // 1. 初始化 AVS 狀態
            const packs = await win.OS_DB.getAllVarPacks?.() || [];
            const pack  = packs.find(p => p.id === packId);
            if (pack && win.OS_AVS?.initFromPack) {
                win.OS_AVS.initFromPack(pack);
                console.log('[QB] 自動初始化 AVS 變數包:', pack.name);
            }
            // 2. 自動啟用對應煉丹爐模板（找第一個屬於這個 pack 的模板）
            const templates = await win.OS_DB.getAllUITemplates?.() || [];
            const target    = templates.find(t => t.packId === packId);
            if (target && !target.isActive) {
                // 先停用同包其他模板
                for (const t of templates) {
                    if (t.packId === packId && t.isActive && t.id !== target.id) {
                        t.isActive = false;
                        await win.OS_DB.saveUITemplate(t);
                    }
                }
                target.isActive = true;
                await win.OS_DB.saveUITemplate(target);
                const all = await win.OS_DB.getAllUITemplates();
                localStorage.setItem('avs_active_ui_templates',
                    JSON.stringify(all.filter(t => t.isActive)));
                console.log('[QB] 自動啟用煉丹爐面板:', target.id);
            }
        } catch(e) { console.warn('[QB] 自動綁定變數包失敗:', e); }
    }

    // 由大廳書櫃呼叫的入口點
    function openBook(worldId) {
        // 從全域讀取大廳建置好的世界資料
        let w = null;
        if (win.AURELIA_WORLDS && win.AURELIA_WORLDS[worldId]) w = win.AURELIA_WORLDS[worldId];
        else if (win.AURELIA_CUSTOM_WORLDS) w = win.AURELIA_CUSTOM_WORLDS.find(b => b.id === worldId);
        
        if (!w) {
            console.error(`[QB_CORE] 找不到世界 ID: ${worldId}`);
            return;
        }

        const root = injectInnerModal();
        if (!root) return;
        
        root.classList.add('active');

        // 初始化狀態
        if (!STATE.activeWorld || STATE.activeWorld.id !== worldId) {
            STATE.activeWorld = w;
            STATE.questList = [];
            // 記錄當前世界 ID，供 AVS 條件規則按世界過濾
            localStorage.setItem('vn_current_world_id', worldId);
            STATE.activeMap = null;
            STATE.team = [];
            STATE.candidates = [];
        }

        // 自動綁定變數包 + 煉丹爐面板（fire-and-forget）
        if (w.autoPackId) _autoBindWorldPack(w.autoPackId);

        document.getElementById('qb-modal-title').innerText = `${w.icon} 《${w.title}》`;
        document.querySelector('.qb-header').innerHTML = `
            <h1 id="qb-modal-title">${w.icon} 《${w.title}》</h1>
            <button class="qb-close-btn" onclick="window.QB_CORE.closeModal()">✕</button>
        `;

        const content = document.getElementById('qb-modal-content');
        const bottomBar = document.getElementById('qb-modal-bottom-bar');
        
        if (STATE.questList.length > 0) {
            renderQuestList();
        } else {
            bottomBar.style.display = 'none';
            content.innerHTML = `
                <div style="text-align:center; padding: 40px 20px;">
                    <div style="font-size:36px; margin-bottom:15px; text-shadow:0 2px 5px rgba(0,0,0,0.2);">${w.icon}</div>
                    <div style="font-family:'Cinzel', serif; font-size:22px; font-weight:bold; margin-bottom:20px; color:#3e271a; border-bottom:2px solid #bfa982; display:inline-block; padding-bottom:5px;">${w.title}</div>
                    <div style="color:#4a3f35; font-size:14px; line-height:1.8; margin-bottom:40px; padding:0 10px;">${w.desc}</div>
                    <button class="qb-btn-action" style="padding:15px 30px; font-size:16px;" onclick="window.QB_CORE.manualSearch()">📜 翻閱章節與勘查地圖</button>
                </div>
            `;
        }
    }

    // === 5. 自定義世界生成 API (供大廳呼叫) ===
    async function createCustomWorld(keyword, lorebookContext) {
        if (!keyword && !lorebookContext) return null;

        // 有世界書內容時，把它加進提示
        const loreBlock = lorebookContext
            ? `\n\n以下是已知的世界書資料，請參考融入設計：\n${lorebookContext.slice(0, 2000)}`
            : '';

        // 1. 生成世界觀描述
        const promptMsg = keyword
            ? `請根據關鍵字「${keyword}」設計一個視差宇宙的RPG世界。${loreBlock}\n請直接輸出一段50字以內的精簡描述，不要任何多餘的對話或格式。`
            : `請根據以下世界書資料，用50字以內總結這個世界的氛圍與背景，直接輸出描述，不要任何格式：${loreBlock}`;
        const desc = await callApi('general_assistant', promptMsg) || `這是一個由「${keyword || '世界書'}」構成的奇妙世界，充滿未知的挑戰與機遇。`;

        // 2. 自動生成 AVS 變數包
        let autoPackId = null;
        try {
            const varPrompt = `根據這個世界觀：「${desc}」${loreBlock}
請列出 5～8 個在這個世界跑團時最值得追蹤的數值變數，每行一個，格式為「變數名 = 預設值」。
規則：
- 變數名用英文或中文都可以，簡短清楚
- 預設值只能是數字或帶引號的字串
- 不要任何說明文字，直接輸出清單

範例格式：
hp = 100
gold = 0
好感度 = 0
status = "正常"`;

            const varRaw = await callApi('general_assistant', varPrompt) || '';

            const variables = [];
            varRaw.split('\n').forEach(line => {
                const m = line.trim().match(/^([^\s=]+)\s*=\s*(.+)$/);
                if (!m) return;
                const name = m[1].trim();
                const raw  = m[2].trim().replace(/^["']|["']$/g, '');
                if (name) variables.push({ name, defaultValue: raw });
            });

            if (variables.length > 0 && win.OS_DB?.saveVarPack) {
                autoPackId = 'pack_' + Date.now();
                const worldId = 'custom_' + Date.now(); // 先生成 worldId，後面建世界用同一個
                await win.OS_DB.saveVarPack({
                    id:        autoPackId,
                    name:      keyword || worldTitle || '自訂世界',
                    notes:     `由 AI 根據《${keyword || '世界書條目'}》世界觀自動生成`,
                    variables
                });
                console.log(`[AVS] 自動建立變數包「${keyword}」，共 ${variables.length} 個變數`);

                // 自動生成條件規則（按世界綁定）
                if (win.OS_AVS_RULES?.generateRulesForWorld) {
                    await win.OS_AVS_RULES.generateRulesForWorld({
                        worldId,
                        worldTitle: keyword || '自訂世界',
                        worldDesc:  desc.replace(/<[^>]*>/g, '').trim() + (loreBlock ? loreBlock.slice(0, 500) : ''),
                        variables,
                        callApi
                    });
                }
                // 把 worldId 記下來，等下建世界物件時用
                win._pendingAutoWorldId = worldId;
            }
        } catch(e) { console.warn('[AVS] 自動建立變數包失敗（不影響建世界）:', e); }

        // 3. 生成書本封面 (調用 OS_IMAGE_MANAGER)
        let coverUrl = '';
        if (win.OS_IMAGE_MANAGER && typeof win.OS_IMAGE_MANAGER.generateItem === 'function') {
            try {
                coverUrl = await win.OS_IMAGE_MANAGER.generateItem(`book cover, ${keyword}, cinematic lighting, highly detailed, masterpiece, no text`, { width: 512, height: 768 });
            } catch(e) { console.warn('書封生成失敗', e); }
        }

        // 沿用自動生成規則時建好的 worldId，確保規則與世界 ID 一致
        const newId = win._pendingAutoWorldId || ('custom_' + Date.now());
        delete win._pendingAutoWorldId;
        const worldTitle = keyword || desc.slice(0, 12).replace(/[，。！？\s]/g, '') || '自訂世界';
        const newWorld = {
            id: newId,
            title: worldTitle,
            icon: '📘',
            desc: desc.replace(/<[^>]*>/g, '').trim(),
            danger: Math.floor(Math.random() * 5) + 3,
            cover: coverUrl || 'https://files.catbox.moe/3ub4va.png',
            custom: true,
            autoPackId  // 記錄對應的自動變數包 ID，供以後快速初始化用
        };

        // 存入全域供大廳書櫃讀取
        win.AURELIA_CUSTOM_WORLDS = win.AURELIA_CUSTOM_WORLDS || [];
        win.AURELIA_CUSTOM_WORLDS.push(newWorld);
        // 持久化到 localStorage
        try { localStorage.setItem('aurelia_custom_worlds', JSON.stringify(win.AURELIA_CUSTOM_WORLDS)); } catch(e) {}

        const packNote = autoPackId ? '，變數包也幫你備好了！' : '！';
        showYingyingDialog(`「寫好了！這本《${worldTitle}》絕對是我本月的得意之作，快打開看看吧${packNote}」`);
        return newWorld;
    }

    // === 6. 任務與地圖解析引擎 ===
    async function manualSearch() {
        renderLoading('正在連線視差宇宙，擷取任務節點與地形特徵...');
        const world = STATE.activeWorld;
        
        const promptMsg = `[系統指令：任務與地圖過濾協議]
你是 NEXUS PARALLAX 系統導覽員，駐店小說家「瀅瀅」。
用戶已翻開世界書《${world.title}》(${world.desc})。
請生成 4 個該世界的冒險委託，以及 1 張周邊區域地圖。

【輸出規則：絕對禁止使用 JSON】
1. 導覽員對話：格式：[Char|瀅瀅|表情|「對話內容，帶入天然呆與小說家設定」]
2. 地圖標籤 (請務必包含 <scene-map> 開始和結束標籤)：
<scene-map>
[地標底板|區域名|英文環境提示詞 (如 city, forest, outdoor floor plan等)]
[地標|🗺️地標名|描述|x:0-100,y:0-100] (生成3-5個地標，x和y代表在平面上的百分比位置)
</scene-map>
3. 任務標籤：格式：[Quest|任務ID|任務標題|等級(S/A/B/C/D)|任務簡報說明|報酬|地點|危險度1-10]`;
        
        const res = await callApi('quest_list_gen', promptMsg);

        let quests = [];
        let parsedMap = { bg: '地圖區域', prompt: 'outdoor', markers: [] };
        
        if (res) {
            parseNarrative(res);

            // 解析地圖
            const mapMatch = res.match(/<scene-map>([\s\S]*?)<\/scene-map>/);
            if (mapMatch) {
                const mapData = mapMatch[1];
                const bgMatch = mapData.match(/\[地標底板\|([^|]+)\|([^\]]+)\]/);
                if (bgMatch) { parsedMap.bg = bgMatch[1].trim(); parsedMap.prompt = bgMatch[2].trim(); }
                
                const markerRegex = /\[地標\|([^|]+)\|([^|]+)\|x:(\d+),y:(\d+)\]/g;
                let mMatch;
                while ((mMatch = markerRegex.exec(mapData)) !== null) {
                    parsedMap.markers.push({
                        name: mMatch[1].trim(), desc: mMatch[2].trim(),
                        x: Math.max(5, Math.min(95, parseInt(mMatch[3], 10))),
                        y: Math.max(5, Math.min(95, parseInt(mMatch[4], 10)))
                    });
                }
            }
            STATE.activeMap = parsedMap.markers.length > 0 ? parsedMap : null;

            // 解析任務
            const questRegex = /\[Quest\|([^|\]]+)\|([^|\]]+)\|([^|\]]+)\|([^|\]]+)\|([^|\]]+)\|([^|\]]+)\|([^|\]]+)\]/g;
            let qMatch;
            while ((qMatch = questRegex.exec(res)) !== null) {
                quests.push({
                    id: qMatch[1].trim(), title: qMatch[2].trim(), rank: qMatch[3].trim(),
                    desc: qMatch[4].trim(), reward: qMatch[5].trim(), location: qMatch[6].trim(),
                    danger: parseInt(qMatch[7].trim()) || world.danger
                });
            }
        }

        if (quests.length > 0) { STATE.questList = quests; } 
        else { STATE.questList = [{ id:'fallback', title: `探索${world.title}`, rank: 'C', desc: '調查異常反應。', reward: '500G', location: '未知', danger: world.danger }]; }
        
        // 嘗試為地圖生成底板圖
        if (STATE.activeMap && win.OS_IMAGE_MANAGER && typeof win.OS_IMAGE_MANAGER.generateItem === 'function') {
            try { STATE.activeMap.bgUrl = await win.OS_IMAGE_MANAGER.generateItem(`overhead view, map background, ${STATE.activeMap.prompt}, highly detailed, no text`, { width: 512, height: 512 }); } 
            catch(e) {}
        }

        renderQuestList();
    }

    function renderQuestList() {
        document.querySelector('.qb-header').innerHTML = `
            <h1 id="qb-modal-title">📜 委託目錄</h1>
            <button class="qb-close-btn" onclick="window.QB_CORE.closeModal()">✕</button>
        `;
        const content = document.getElementById('qb-modal-content');
        const bottomBar = document.getElementById('qb-modal-bottom-bar');
        
        let html = ``;
        STATE.questList.forEach((q, i) => {
            html += `
                <div class="qb-quest-card" onclick="window.QB_CORE.openQuestDetail(${i})">
                    <div class="qb-quest-rank" style="color:${getRankColor(q.rank)}">${q.rank}</div>
                    <div class="qb-quest-title">${q.title}</div>
                    <div class="qb-quest-meta">
                        <span>🗺️ ${q.location}</span>
                        <span>⚠️ 危險度 ${q.danger}</span>
                        <span>💰 ${q.reward}</span>
                    </div>
                    <div class="qb-quest-desc">${q.desc}</div>
                </div>
            `;
        });
        content.innerHTML = html;

        bottomBar.style.display = 'flex';
        bottomBar.innerHTML = `
            <button class="qb-btn-back" onclick="window.QB_CORE.openBook('${STATE.activeWorld.id}')">‹ 返回扉頁</button>
            <button class="qb-btn-action" onclick="window.QB_CORE.manualSearch()">🔄 刷新章節</button>
        `;
    }

    function openQuestDetail(index) {
        document.querySelector('.qb-header').innerHTML = `
            <h1 id="qb-modal-title">📌 委託詳情</h1>
            <button class="qb-close-btn" onclick="window.QB_CORE.backToQuests()">‹ 返回</button>
        `;
        STATE.activeQuest = STATE.questList[index];
        const q = STATE.activeQuest;
        const content = document.getElementById('qb-modal-content');
        const bottomBar = document.getElementById('qb-modal-bottom-bar');

        let mapHtml = '';
        if (STATE.activeMap) {
            let markersHtml = STATE.activeMap.markers.map((m, i) => `
                <div class="qb-map-marker" style="left:${m.x}%; top:${m.y}%;" title="${m.desc}">
                    <div class="qb-marker-icon">${m.name.substring(0,2)}</div>
                    <div class="qb-marker-label">${m.name.substring(2)}</div>
                </div>
            `).join('');
            
            mapHtml = `
                <div style="font-weight:bold; color:#3e271a; margin-top:20px; font-size:14px; border-bottom:1px solid #dcd0b8; padding-bottom:5px;">📍 區域地圖勘查：${STATE.activeMap.bg}</div>
                <div class="qb-map-container">
                    <div class="qb-map-bg" style="background-image: url('${STATE.activeMap.bgUrl || ''}');"></div>
                    <div class="qb-map-grid"></div>
                    ${markersHtml}
                </div>
            `;
        }

        let teamHtml = STATE.team.map((m, i) => `
            <div style="display:flex; align-items:center; gap:10px; background:rgba(255,255,255,0.7); border:1px solid #dcd0b8; padding:8px 10px; border-radius:4px; position:relative; box-shadow:0 2px 4px rgba(139,115,85,0.1);">
                <div style="font-size:20px;">${m.gender === '女' ? '👩' : '👨'}</div>
                <div style="flex:1;"><div style="font-weight:bold; font-size:13px; color:#3e271a;">${m.name}</div><div style="font-size:11px; color:#716053;">${m.role}</div></div>
                <button style="background:transparent; border:none; color:#b91c1c; cursor:pointer; font-weight:bold;" onclick="window.QB_CORE.removeTeamMember(${i})">移除</button>
            </div>
        `).join('');

        let recruitBtns = STATE.team.length < 3 ? `
            <div style="display:flex; gap:10px; margin-top:10px;">
                <button class="qb-btn-back" style="flex:1; border-color:#bfa982; color:#3e271a; background:rgba(255,255,255,0.5);" onclick="window.QB_CORE.toggleRecruit()">➕ 招募 AI</button>
                <button class="qb-btn-back" style="flex:1; border-color:#bfa982; color:#3e271a; background:rgba(255,255,255,0.5);" onclick="window.QB_CORE.openInviteList()">💌 邀請好友</button>
            </div>
        ` : '';

        content.innerHTML = `
            <div style="font-size:18px; font-weight:bold; color:#3e271a; font-family:'Cinzel', serif; border-bottom:2px solid #bfa982; padding-bottom:8px; margin-bottom:10px;">
                ${q.title} <span style="float:right; font-size:14px; color:${getRankColor(q.rank)}">Rank ${q.rank}</span>
            </div>
            <div style="font-size:13px; color:#4a3f35; line-height:1.6; background:rgba(255,255,255,0.4); padding:10px; border-radius:4px;">${q.desc}</div>
            ${mapHtml}
            <div style="margin-top:20px; font-weight:bold; color:#3e271a; font-size:14px; border-bottom:1px solid #dcd0b8; padding-bottom:5px;">👥 探險小隊 (${STATE.team.length}/3)</div>
            <div style="display:flex; flex-direction:column; gap:8px; margin-top:10px;">${teamHtml}</div>
            ${recruitBtns}
        `;

        bottomBar.style.display = 'flex';
        bottomBar.innerHTML = `
            <button class="qb-btn-back" onclick="window.QB_CORE.backToQuests()">返回目錄</button>
            <button class="qb-btn-action" onclick="window.QB_CORE.confirmStart()">🚀 進入故事 (DIVE)</button>
        `;
    }

    function renderLoading(text) {
        const content = document.getElementById('qb-modal-content');
        const bottomBar = document.getElementById('qb-modal-bottom-bar');
        bottomBar.style.display = 'none';
        content.innerHTML = `
            <div class="qb-loading" style="height:100%; justify-content:center; background: transparent; border:none; box-shadow:none;">
                <div class="qb-spinner"></div>
                <span style="color:#3e271a; letter-spacing:1px; font-weight:bold;">${text}</span>
            </div>
        `;
    }

    function backToQuests() { renderQuestList(); }
    function backToDetail() { openQuestDetail(STATE.questList.indexOf(STATE.activeQuest)); }
    function getRankColor(r) { return {'S':'#b91c1c','A':'#7e22ce','B':'#1d4ed8'}[r] || '#716053'; }

    // === 7. 招募系統 ===
    async function toggleRecruit() {
        if (STATE.candidates && STATE.candidates.length > 0) renderRecruitUI(); 
        else await rerollRecruits();
    }

    async function rerollRecruits() {
        renderLoading('發布招募信號...');
        const q = STATE.activeQuest;
        const promptMsg = `[系統指令：組隊信號]
你是 NEXUS PARALLAX 系統導覽員「瀅瀅」。
用戶正在為任務「${q.title}」尋找隊友。生成 3 名潛在的 AI 隊友候選人。
【輸出規則：絕對禁止 JSON】
1. 導覽員對話：[Char|瀅瀅|smile|「對話」]
2. 數據標籤：[Recruit|名字|職業|等級|性別|主要技能|簡短背景]`;
        
        const res = await callApi('quest_recruit_gen', promptMsg);
        let recruits = [];
        if (res) {
            parseNarrative(res);
            const recruitRegex = /\[Recruit\|([^|\]]+)\|([^|\]]+)\|([^|\]]+)\|([^|\]]+)\|([^|\]]+)\|([^|\]]+)\]/g;
            let match;
            while ((match = recruitRegex.exec(res)) !== null) {
                recruits.push({ name: match[1].trim(), role: match[2].trim(), level: parseInt(match[3].trim())||1, gender: match[4].trim(), specialty: match[5].trim(), desc: match[6].trim() });
            }
        }
        STATE.candidates = recruits.length > 0 ? recruits : [{ name:'路人甲', role:'見習生', desc:'剛入行', level:1, gender:'男', specialty:'無' }];
        renderRecruitUI();
    }

    function renderRecruitUI() {
        document.querySelector('.qb-header').innerHTML = `
            <h1 id="qb-modal-title">🤝 招募隊友</h1>
            <button class="qb-close-btn" onclick="window.QB_CORE.backToDetail()">‹ 返回</button>
        `;
        const content = document.getElementById('qb-modal-content');
        const bottomBar = document.getElementById('qb-modal-bottom-bar');
        
        let html = ``;
        STATE.candidates.forEach((c, i) => {
            const inTeam = STATE.team.some(m => m.name === c.name);
            html += `
                <div style="background:${inTeam?'#fff':'rgba(255,255,255,0.6)'}; border:1px solid ${inTeam?'#3e271a':'#dcd0b8'}; padding:12px; border-radius:4px; margin-bottom:10px; cursor:pointer; box-shadow:0 2px 5px rgba(139,115,85,0.1);" onclick="window.QB_CORE.toggleRecruitCandidate(${i})">
                    <div style="font-weight:bold; color:#3e271a; font-size:14px;">${c.gender === '女' ? '👩' : '👨'} ${c.name} <span style="font-size:11px; color:#716053;">Lv.${c.level}</span> ${inTeam?'<span style="color:#b91c1c; float:right;">✓ 已入隊</span>':''}</div>
                    <div style="font-size:12px; color:#716053; margin-top:6px; border-bottom:1px solid #e8e0cc; padding-bottom:4px;">${c.role} | 技能: ${c.specialty}</div>
                    <div style="font-size:12px; color:#4a3f35; margin-top:4px;">${c.desc}</div>
                </div>
            `;
        });
        content.innerHTML = html;
        bottomBar.innerHTML = `<button class="qb-btn-back" onclick="window.QB_CORE.backToDetail()">確認隊伍</button><button class="qb-btn-action" onclick="window.QB_CORE.rerollRecruits()">🔄 換一批</button>`;
    }

    function toggleRecruitCandidate(index) {
        const c = STATE.candidates[index];
        const existIdx = STATE.team.findIndex(m => m.name === c.name);
        if (existIdx >= 0) STATE.team.splice(existIdx, 1);
        else { if (STATE.team.length >= 3) return alert("隊伍已滿"); STATE.team.push(JSON.parse(JSON.stringify(c))); }
        renderRecruitUI();
    }
    
    function removeTeamMember(index) { STATE.team.splice(index, 1); backToDetail(); }

    function openInviteList() {
        document.querySelector('.qb-header').innerHTML = `
            <h1 id="qb-modal-title">💌 邀請好友</h1>
            <button class="qb-close-btn" onclick="window.QB_CORE.backToDetail()">‹ 返回</button>
        `;
        const db = window.OS_DB || win.OS_DB;
        let contacts = [];
        if (win.OS_WORLDBOOK && typeof win.OS_WORLDBOOK.getEnabledEntries === 'function') {
            win.OS_WORLDBOOK.getEnabledEntries().then(entries => {
                contacts = entries.filter(e => e.category === '角色設定').map(e => ({ name: e.title }));
                _renderInviteUI(contacts);
            });
        } else { _renderInviteUI([{name:'測試好友'}]); }
    }

    function _renderInviteUI(contacts) {
        const content = document.getElementById('qb-modal-content');
        const bottomBar = document.getElementById('qb-modal-bottom-bar');
        
        let html = ``;
        if (contacts.length === 0) {
            html = `<div style="text-align:center; padding:30px; color:#716053; font-size:13px;">通訊錄中沒有可邀請的好友。</div>`;
        } else {
            contacts.forEach(c => {
                const inTeam = STATE.team.some(m => m.name === c.name);
                html += `<div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.7); border:1px solid #dcd0b8; padding:12px; border-radius:4px; margin-bottom:10px; box-shadow:0 2px 4px rgba(139,115,85,0.1);">
                    <div style="font-weight:bold; color:#3e271a;">👤 ${c.name}</div>
                    <button style="background:${inTeam?'transparent':'linear-gradient(135deg, #3e271a, #2c1e16)'}; border:${inTeam?'1px solid #dcd0b8':'none'}; border-radius:4px; padding:6px 12px; cursor:pointer; font-weight:bold; color:${inTeam?'#716053':'#FBDFA2'}; transition:0.2s;" ${inTeam?'disabled':''} onclick="window.QB_CORE.addFriendToTeam('${c.name}')">${inTeam?'已入隊':'發送邀請'}</button>
                </div>`;
            });
        }
        content.innerHTML = html;
        bottomBar.innerHTML = `<button class="qb-btn-back" style="flex:1;" onclick="window.QB_CORE.backToDetail()">確認隊伍</button>`;
    }

    function addFriendToTeam(name) {
        if (STATE.team.length >= 3) return alert("隊伍已滿");
        STATE.team.push({ name: name, role: '羈絆好友', level: '?', gender: '?', desc: '來自通訊錄', isFriend: true });
        openInviteList();
    }

    // === 8. 跳躍邏輯 (DIVE) ===
    function confirmStart() {
        document.querySelector('.qb-header').innerHTML = `
            <h1 id="qb-modal-title">⚠️ 系統確認</h1>
            <button class="qb-close-btn" onclick="window.QB_CORE.backToDetail()">‹ 返回</button>
        `;
        const content = document.getElementById('qb-modal-content');
        const bottomBar = document.getElementById('qb-modal-bottom-bar');
        
        content.innerHTML = `
            <div style="text-align:center; padding:40px 20px;">
                <div style="font-size:40px; margin-bottom:15px; text-shadow:0 2px 5px rgba(0,0,0,0.2);">📖</div>
                <div style="font-family:'Cinzel'; font-size:20px; font-weight:bold; color:#3e271a; margin-bottom:10px;">神經連接準備就緒</div>
                <div style="color:#716053; font-size:14px; margin-bottom:5px;">即將進入《${STATE.activeWorld.title}》</div>
                <div style="color:#b91c1c; font-size:13px; font-weight:bold;">目標任務：${STATE.activeQuest.title}</div>
            </div>
        `;
        bottomBar.innerHTML = `
            <button class="qb-btn-back" onclick="window.QB_CORE.backToDetail()">取消</button>
            <button class="qb-btn-action" onclick="window.QB_CORE.diveQuest()">✨ 開始閱讀 (LINK START)</button>
        `;
    }

    async function diveQuest() {
        const q = STATE.activeQuest;
        const w = STATE.activeWorld;
        const playerName = (window.VoidTerminal && window.VoidTerminal.getUserName) ? window.VoidTerminal.getUserName() : '體驗者';
        if (!STATE.team.find(m => m.name === playerName)) STATE.team.unshift({ name: playerName, role: '隊長', desc: '玩家本人' });

        let teamDetails = STATE.team.map(m => `- ${m.name} (${m.role})`).join('\n');

        // 給 VN generateStory 的請求文字（AI 會依此生成 VN 格式開場）
        const startPrompt = `世界背景：${w.title}（${w.desc}）\n任務：${q.title}\n目標：${q.desc}\n隊友：${teamDetails}\n\n請依上述情境生成 VN 視覺小說格式的開場章節，立即進入故事，不要前言。`;
        const storyTitle  = `任務：${q.title}`;

        const content   = document.getElementById('qb-modal-content');
        const bottomBar = document.getElementById('qb-modal-bottom-bar');
        bottomBar.style.display = 'none';
        content.innerHTML = `
            <div class="qb-loading" style="height:100%; justify-content:center;">
                <div class="qb-spinner"></div>
                <div style="font-family:'Cinzel'; font-weight:bold; font-size:18px; color:#3e271a; letter-spacing:2px; margin-top:20px;">LINK START</div>
                <div style="font-size:12px; color:#716053; margin-top:10px;">跳轉 VN 面板並觸發 AI 生成…</div>
            </div>
        `;

        // ── 獨立模式：直接交給 VN generateStory 生成，不存假章節 ──
        if (win.OS_API?.isStandalone?.() ?? false) {
            // 備援：若 VN 是首次啟動，launchApp 會讀 _pendingQBPayload
            window._pendingQBPayload = { startPrompt: startPrompt, title: storyTitle };

            setTimeout(() => {
                closeModal();
                if (window.AureliaControlCenter?.switchPage) window.AureliaControlCenter.switchPage('nav-story');

                // 給 VN 切換動畫時間，再注入 prompt 並觸發生成
                setTimeout(() => {
                    // 若 _pendingQBPayload 還沒被 launchApp 消費（VN 已在運行），手動觸發
                    if (window._pendingQBPayload) {
                        window._pendingQBPayload = null;
                        const genInput = document.getElementById('vn-gen-request');
                        const genTitle = document.getElementById('vn-gen-title');
                        if (genInput) genInput.value = startPrompt;
                        if (genTitle) genTitle.value = storyTitle;
                        // 直接觸發 VN 生成（QB Dive 獨立路徑，不借用首頁生成面板）
                        window.VN_Core?.generateStory?.();
                    }
                }, 500);
            }, 800);

        } else {
            // 酒館模式：保留原有廣播邏輯，不動
            try {
                const entityId = `qb_${Date.now()}`;
                const sessionPayload = { entityId: entityId, title: storyTitle, world: w.title, quest: q, team: STATE.team, mode: 'vn', startPrompt: startPrompt };
                if (win.OS_BRIDGE?.startSession) win.OS_BRIDGE.startSession(entityId, storyTitle);
                win.dispatchEvent(new CustomEvent('QB_START_STORY', { detail: sessionPayload }));
                setTimeout(() => {
                    closeModal();
                    if (window.AureliaControlCenter?.switchPage) window.AureliaControlCenter.switchPage('nav-story');
                }, 1500);
            } catch(e) {
                console.error('DIVE 失敗:', e);
                renderQuestList();
            }
        }
    }

    // === 9. 導出 API ===
    window.QB_CORE = {
        openBook: openBook,
        closeModal: closeModal,
        createCustomWorld: createCustomWorld,
        manualSearch: manualSearch,
        openQuestDetail: openQuestDetail,
        backToQuests: backToQuests,
        backToDetail: backToDetail,
        toggleRecruit: toggleRecruit,
        toggleRecruitCandidate: toggleRecruitCandidate,
        rerollRecruits: rerollRecruits,
        removeTeamMember: removeTeamMember,
        openInviteList: openInviteList,
        addFriendToTeam: addFriendToTeam,
        confirmStart: confirmStart,
        diveQuest: diveQuest
    };

})();