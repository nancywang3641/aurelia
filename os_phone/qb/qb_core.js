// ----------------------------------------------------------------
// [檔案] qb_core.js (V5.8 - 終極版：獨立對話浮窗回歸)
// 職責：視差宇宙任務面板 (解決對話被遮擋問題，完美還原 V4.6 敘事體驗)
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入視差宇宙引擎 (V5.8 獨立對話浮窗回歸版)...');
    const win = window.parent || window;

    // === 1. 樣式定義 ===
    const appStyle = `
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap');

        #qb-inner-modal-root {
            position: absolute; inset: 0;
            background: rgba(0, 0, 0, 0.65); backdrop-filter: blur(6px);
            z-index: 1000; display: flex; justify-content: center; align-items: center;
            opacity: 0; pointer-events: none; transition: opacity 0.25s ease;
            font-family: 'Crimson Text', serif;
        }
        #qb-inner-modal-root.active { opacity: 1; pointer-events: auto; }

        .qb-modal-box { 
            width: 90%; height: 85%; background: #f9fafb; 
            border: 2px solid #D4AF37; border-radius: 12px; 
            display: flex; flex-direction: column; overflow: hidden; 
            box-shadow: 0 10px 40px rgba(0,0,0,0.5); 
            transform: scale(0.95); transition: transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275); 
            position: relative; 
        }
        #qb-inner-modal-root.active .qb-modal-box { transform: scale(1); }
        
        .qb-bg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-image: url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cg stroke='%23d4af37' stroke-width='0.5' fill='none' stroke-opacity='0.15'%3E%3Cpath d='M50 0 L100 50 L50 100 L0 50 Z'/%3E%3C/g%3E%3C/svg%3E"); background-size: 80px 80px; opacity: 0.6; pointer-events: none; z-index: 0; }
        
        .qb-header { position: relative; z-index: 2; flex-shrink: 0; padding: 12px 15px; background: linear-gradient(135deg, #1a1a1a, #2d3748); color: #D4AF37; border-bottom: 2px solid #D4AF37; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 15px rgba(0,0,0,0.2); }
        .qb-header h1 { margin: 0; font-family: 'Cinzel', serif; font-size: 16px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
        .qb-close-btn { background: none; border: none; color: #a0aec0; font-size: 16px; font-weight: bold; cursor: pointer; transition: 0.2s; padding: 0; line-height: 1; letter-spacing: 1px; }
        .qb-close-btn:hover { color: #fff; transform: scale(1.05); }
        .qb-close-btn.danger:hover { color: #fc8181; }
        
        .qb-content { flex: 1; overflow-y: auto; position: relative; z-index: 2; padding: 15px; display: flex; flex-direction: column; gap: 15px; }
        .qb-content::-webkit-scrollbar { width: 4px; }
        .qb-content::-webkit-scrollbar-thumb { background: #cbd5e0; border-radius: 2px; }

        .qb-manual-search { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center; gap: 20px; color: #4a5568; }
        .qb-manual-search p { font-size: 15px; font-weight: bold; margin: 0; font-family: 'Cinzel', serif; }
        .qb-search-btn { background: linear-gradient(135deg, #D4AF37, #b08d29); color: #fff; border: none; padding: 12px 24px; font-size: 14px; font-family: 'Cinzel', serif; font-weight: bold; border-radius: 8px; cursor: pointer; transition: all 0.3s ease; box-shadow: 0 4px 15px rgba(212,175,55,0.4); }
        .qb-search-btn:hover { transform: translateY(-3px); box-shadow: 0 6px 20px rgba(212,175,55,0.6); filter: brightness(1.1); }

        .qb-quest-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; cursor: pointer; transition: all 0.2s; position: relative; overflow: hidden; box-shadow: 0 2px 5px rgba(0,0,0,0.02); }
        .qb-quest-card:hover { transform: translateY(-2px); box-shadow: 0 6px 15px rgba(0,0,0,0.08); border-color: #cbd5e0; }
        .qb-quest-rank { position: absolute; top: -5px; right: -10px; font-family: 'Cinzel', serif; font-size: 40px; font-weight: 700; opacity: 0.1; line-height: 1; pointer-events: none; }
        .qb-quest-title { font-size: 15px; font-weight: 600; color: #1a202c; margin-bottom: 6px; padding-right: 30px; }
        .qb-quest-meta { display: flex; gap: 8px; font-size: 11px; color: #718096; margin-bottom: 8px; }
        .qb-quest-tag { background: #edf2f7; padding: 2px 6px; border-radius: 4px; border: 1px solid #e2e8f0; }
        .qb-quest-desc { font-size: 12px; color: #4a5568; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

        .qb-detail-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin-bottom: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
        .qb-detail-title { font-size: 16px; font-weight: 700; color: #1a202c; margin-bottom: 12px; border-bottom: 2px solid #edf2f7; padding-bottom: 8px; font-family: 'Cinzel', serif; }
        .qb-detail-section { margin-bottom: 12px; }
        .qb-detail-label { font-size: 10px; font-weight: 700; color: #a0aec0; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
        .qb-detail-text { font-size: 13px; color: #2d3748; line-height: 1.5; }
        .qb-detail-reward { display: inline-block; background: #ebf8ff; color: #3182ce; border: 1px solid #90cdf4; padding: 3px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; }

        .qb-team-list { display: flex; flex-direction: column; gap: 8px; }
        .qb-team-member { display: flex; align-items: center; gap: 10px; background: #fff; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 8px; position: relative; }
        .qb-team-avatar { width: 32px; height: 32px; border-radius: 50%; background: #edf2f7; border: 2px solid #cbd5e0; display: flex; justify-content: center; align-items: center; font-size: 16px; overflow: hidden; }
        .qb-team-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .qb-team-info { flex: 1; min-width: 0; }
        .qb-team-name { font-size: 13px; font-weight: 600; color: #2d3748; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .qb-team-role { font-size: 11px; color: #718096; }
        .qb-team-remove { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: #fff5f5; color: #e53e3e; border: 1px solid #feb2b2; border-radius: 4px; padding: 3px 6px; font-size: 10px; cursor: pointer; transition: 0.2s; }
        .qb-team-remove:hover { background: #e53e3e; color: #fff; }

        .qb-recruit-btn { width: 100%; padding: 10px; background: #edf2f7; border: 1px dashed #a0aec0; color: #4a5568; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: 0.2s; margin-top: 5px; display: flex; justify-content: center; align-items: center; gap: 8px; }
        .qb-recruit-btn:hover { background: #e2e8f0; color: #2d3748; border-color: #718096; }

        .qb-bottom-bar { position: relative; z-index: 2; flex-shrink: 0; padding: 12px 15px; background: #fff; border-top: 1px solid #e2e8f0; display: flex; gap: 10px; box-shadow: 0 -4px 15px rgba(0,0,0,0.03); }
        .qb-btn-back { flex: 1; padding: 10px; background: #f8f9fa; border: 1px solid #cbd5e0; color: #4a5568; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: 0.2s; }
        .qb-btn-back:hover { background: #edf2f7; color: #2d3748; }
        .qb-btn-action { flex: 2; padding: 10px; background: linear-gradient(135deg, #1a1a1a, #2d3748); color: #D4AF37; border: none; border-radius: 8px; font-size: 13px; font-weight: bold; cursor: pointer; transition: 0.2s; font-family: 'Cinzel', serif; letter-spacing: 1px; box-shadow: 0 4px 10px rgba(0,0,0,0.15); }
        .qb-btn-action:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 15px rgba(0,0,0,0.2); }
        .qb-btn-action:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }

        .qb-loading { text-align: center; padding: 30px 10px; color: #a0aec0; font-size: 13px; font-style: italic; display: flex; flex-direction: column; align-items: center; gap: 10px; }
        .qb-spinner { width: 24px; height: 24px; border: 3px solid #edf2f7; border-top-color: #D4AF37; border-radius: 50%; animation: qb-spin 1s linear infinite; }
        @keyframes qb-spin { to { transform: rotate(360deg); } }

        .qb-recruit-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 8px; display: flex; align-items: center; gap: 12px; cursor: pointer; transition: 0.2s; position: relative; }
        .qb-recruit-card:hover { border-color: #90cdf4; background: #ebf8ff; }
        .qb-recruit-card.selected { border-color: #D4AF37; background: #fffdf5; box-shadow: 0 0 0 1px #D4AF37; }
        
        .qb-invite-list { display: flex; flex-direction: column; gap: 8px; }
        .qb-invite-item { display: flex; align-items: center; gap: 10px; background: #fff; border: 1px solid #e2e8f0; padding: 8px; border-radius: 8px; transition: 0.2s; }
        .qb-invite-item:hover { background: #fafafa; border-color: #cbd5e0; }
        .qb-invite-avatar { width: 32px; height: 32px; border-radius: 50%; overflow: hidden; border: 1px solid #e2e8f0; background: #edf2f7; display:flex; justify-content:center; align-items:center; font-size:16px;}
        .qb-invite-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .qb-invite-info { flex: 1; }
        .qb-invite-name { font-size: 13px; font-weight: 600; color: #2d3748; }
        .qb-invite-btn { background: #edf2f7; border: 1px solid #cbd5e0; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 600; color: #4a5568; cursor: pointer; transition: 0.2s; }
        .qb-invite-btn:hover:not(:disabled) { background: #D4AF37; color: #fff; border-color: #D4AF37; }
        .qb-invite-btn:disabled { opacity: 0.7; cursor: default; background: #ebf8ff; color: #2b6cb0; border-color: #90cdf4; }

        .qb-mode-select { display: flex; gap: 10px; margin-top: 10px; }
        .qb-mode-opt { flex: 1; padding: 15px 10px; border: 2px solid #e2e8f0; border-radius: 8px; text-align: center; cursor: pointer; font-size: 13px; font-weight: bold; color: #4a5568; transition: all 0.2s; background: #f8f9fa; }
        .qb-mode-opt:hover { border-color: #cbd5e0; background: #edf2f7; }
        .qb-mode-opt.active { background: #fffdf5; color: #D4AF37; border-color: #D4AF37; box-shadow: 0 4px 10px rgba(212,175,55,0.15); }

        /* 🔥 新增：獨立對話浮窗 (重置為從上方彈出，不擋按鈕) */
        #qb-narrative-box { 
            position: absolute; top: 20px; left: 50%; transform: translateX(-50%) translateY(-20px); 
            opacity: 0; pointer-events: none; width: 90%; max-width: 450px; 
            background: rgba(10, 10, 14, 0.95); border: 1px solid #D4AF37; border-radius: 8px; 
            display: flex; align-items: flex-start; gap: 12px; padding: 15px; 
            box-shadow: 0 8px 30px rgba(0,0,0,0.6); z-index: 2000; 
            transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); backdrop-filter: blur(10px); 
        }
        #qb-narrative-box.active { transform: translateX(-50%) translateY(0); opacity: 1; pointer-events: auto; }
        .qb-narrative-avatar { width: 45px; height: 45px; border-radius: 50%; background-size: cover; background-position: center; flex-shrink: 0; border: 1px solid #555; background-color: #222; display:flex; justify-content:center; align-items:center; font-size:20px; }
        .qb-narrative-content { flex: 1; display: flex; flex-direction: column; }
        .qb-narrative-name { font-family: 'Cinzel', serif; font-size: 13px; color: #D4AF37; font-weight: bold; margin-bottom: 5px; letter-spacing: 1px; }
        .qb-narrative-text { font-size: 14px; color: #eee; line-height: 1.5; font-family: 'Crimson Text', serif; }
        .qb-narrative-close { font-size: 18px; color: #888; cursor: pointer; padding: 0 5px; transition: color 0.2s; }
        .qb-narrative-close:hover { color: #fff; }
    `;

    if (!document.getElementById('qb-core-style')) {
        const style = document.createElement('style');
        style.id = 'qb-core-style';
        style.innerHTML = appStyle;
        document.head.appendChild(style);
    }

    // === 2. 狀態與常數 ===
    const WORLDS = {
        xianxia:    { id: 'xianxia',    title: '仙俠武俠', icon: '⚔️', desc: '御劍乘風，問道長生。宗門林立，妖魔橫行。', danger: 4 },
        fantasy:    { id: 'fantasy',    title: '奇幻世界', icon: '🗡️', desc: '劍與魔法的史詩篇章。巨龍翱翔於天際。', danger: 3 },
        scifi:      { id: 'scifi',      title: '科幻世界', icon: '🤖', desc: '科技高度發達的未來。賽博朋克的霓虹燈。', danger: 4 },
        superpower: { id: 'superpower', title: '異能世界', icon: '⚡', desc: '現代社會的背面，潛藏著覺醒者。', danger: 3 },
        apocalypse: { id: 'apocalypse', title: '末日世界', icon: '☢️', desc: '文明崩塌後的荒原。喪屍橫行、輻射遍地。', danger: 5 },
        horror:     { id: 'horror',     title: '靈異詭秘', icon: '👻', desc: '不可名狀的恐懼。古老的儀式、午夜的凶宅。', danger: 5 }
    };

    // === 固定世界觀敘事骨架 (覆蓋隨機生成，確保任務貼合設定) ===
    const WORLD_LORE = {
        xianxia:    "【蒼泱神州】靈氣枯竭的修仙界。正道『天玄劍宗』佔據雲頂天宮，魔道『萬血魔宮』隱於深淵。凡人王朝『大夏』正以機關術崛起。任務多為斬妖除魔、秘境尋寶、宗門暗鬥。",
        fantasy:    "【艾斯蘭登大陸】經歷巨龍黃昏後的魔法大陸。『獅心王國』騎士守護著腐朽的世界樹，『深淵教團』企圖喚醒滅世巨龍。任務多為地下城探索、商隊護送、古代神器尋回。",
        scifi:      "【裂縫紀元·新伊甸都市】奈米共鳴災變後的賽博都市。老牌霸權『泰坦工業 (Titan Industries)』企圖將人類意識強制上傳為數據。反抗組織『清醒者 (The Awakened)』在地下進行殘酷的強制分離手術，而『解夢者 (Dreamwalkers)』試圖在意識深淵中喚醒沉眠者。任務多為：潛入泰坦工業伺服器、營救被綁架的沉眠者、黑市奈米體交易。",
        superpower: "【臨界都市·異時頻界】表裡世界重疊的現代都市。少數人類（異時頻者）會與異次元裂縫中的『奈米生命體 (Neonids)』產生共鳴，獲得超感知能力。部分異種進化為『模擬者 (Mimics)』潛伏於人類社會。政府的『裂縫監視局 (RSB)』正秘密獵殺他們。任務多為：收容失控的異種模擬者、保護天生共鳴者免受追殺、調查都市裂縫異常。",
        apocalypse: "【塵土紀元·零號廢土】核戰與不明真菌爆發後的廢土。水與抗輻射藥劑是硬通貨。『黎明營地』是最後的秩序，『血骷髏掠奪者』橫行荒野。任務多為：廢墟拾荒、營地防衛、探索劇毒孢子森林。",
        horror:     "【靜默海半島】常年被迷霧籠罩的洛夫克拉夫特式半島。『提燈調查團』對抗著不可名狀之物，『猩紅修道院』在地下進行邪神獻祭。理智（Sanity）極度脆弱。任務多為：邪教儀式調查、凶宅驅魔、從無法殺死的恐懼中逃生。"
    };

    let STATE = {
        activeWorld: null,
        hasSearched: false,
        questList: [],
        activeQuest: null,
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
            // [TODO: Standalone API] 功能待接入直連 API
            console.warn('[QB] AI 功能已停用，等待 Standalone API 整合');
            isProcessing = false;
            return null;
        } catch (e) {
            console.error("[QB] API 崩潰:", e);
            isProcessing = false;
            return null;
        }
    }

    // 將頭像同步至世界書共用素材庫
    async function saveAvatarToLorebook(name, url) {
        if (!win.TavernHelper) return;
        const charLbs = win.TavernHelper.getCharLorebooks ? win.TavernHelper.getCharLorebooks() : null;
        const lorebookName = charLbs && charLbs.primary ? charLbs.primary : null;
        if (!lorebookName) { console.warn('[QB] 找不到當前角色主世界書，跳過頭像同步。'); return; }
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
            console.log(`[QB] ✅ 頭像已同步至世界書：${name}`);
        } catch (e) { console.error('[QB] 同步頭像至世界書失敗', e); }
    }

    function sendNarrativeToLobby(text) {
        if (!text) return;
        const cleanText = text.replace(/\[Quest\|.*?\]/g, '').replace(/\[Recruit\|.*?\]/g, '').trim();
        if (cleanText === '') return;
        
        // 1. 傳給大廳背景播放 (保留對話紀錄)
        if (win.VoidTerminal && typeof win.VoidTerminal.playSequence === 'function') {
            win.VoidTerminal.playSequence(cleanText);
        }

        // 2. 🔥 同步觸發「獨立對話浮窗」，解決畫面被遮擋問題
        showQbNarrative(cleanText);
    }

    // 🔥 獨立對話浮窗系統 (V4.6 完美回歸)
    function showQbNarrative(text) {
        if (!text || text.trim() === '') return;
        
        let name = "系統";
        let message = text;
        const match = text.match(/\[Char\|([^|]+)\|([^|]+)\|([^\]]+)\]/);
        if (match) {
            name = match[1].trim();
            message = match[3].trim();
        } else {
            message = text.replace(/\[.*?\]/g, '').trim() || text;
        }

        if (message.startsWith('「') && message.endsWith('」')) {
            message = message.substring(1, message.length - 1);
        }

        const root = document.getElementById('qb-inner-modal-root');
        if (!root) return;

        let box = document.getElementById('qb-narrative-box');
        if (!box) {
            box = document.createElement('div');
            box.id = 'qb-narrative-box';
            box.innerHTML = `
                <div class="qb-narrative-avatar"></div>
                <div class="qb-narrative-content">
                    <div class="qb-narrative-name"></div>
                    <div class="qb-narrative-text"></div>
                </div>
                <div class="qb-narrative-close" onclick="this.parentElement.classList.remove('active')">✕</div>
            `;
            root.appendChild(box);
        }

        box.querySelector('.qb-narrative-name').innerText = name;
        box.querySelector('.qb-narrative-text').innerText = message;
        
        const avatarEl = box.querySelector('.qb-narrative-avatar');
        avatarEl.style.backgroundImage = 'none';
        avatarEl.innerText = '';
        if (name.includes('Iris') || name.includes('愛麗絲')) {
            avatarEl.style.backgroundImage = "url('https://files.catbox.moe/l5hl69.png')";
        } else if (name.includes('Cheshire') || name.includes('柴郡')) {
            avatarEl.style.backgroundImage = "url('https://files.catbox.moe/1gddlp.png')";
        } else {
            avatarEl.innerText = '👤';
        }

        box.classList.remove('active');
        void box.offsetWidth; 
        box.classList.add('active');

        // 8 秒後自動關閉
        setTimeout(() => {
            if (box.classList.contains('active')) {
                box.classList.remove('active');
            }
        }, 8000);
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
                    <div class="qb-bg"></div>
                    <div class="qb-header">
                        <h1 id="qb-modal-title">Quest Board</h1>
                        <button class="qb-close-btn danger" id="qb-global-close" onclick="window.QB_CORE.closeModal()">✕</button>
                    </div>
                    <div class="qb-content" id="qb-modal-content"></div>
                    <div class="qb-bottom-bar" id="qb-modal-bottom-bar" style="display:none;"></div>
                </div>
            `;
            homeTab.appendChild(root);
        }
        return root;
    }

    function openLobbyQuestPanel(worldId) {
        const root = injectInnerModal();
        if (!root) return;

        const world = WORLDS[worldId];
        if (!world) return;

        if (!STATE.activeWorld || STATE.activeWorld.id !== worldId) {
            STATE.activeWorld = world;
            STATE.hasSearched = false;
            STATE.questList = [];
            STATE.activeQuest = null;
            STATE.team = [];
            STATE.candidates = [];
            STATE.selectedMode = 'vn';
        }

        document.getElementById('qb-modal-title').innerText = `${world.icon} ${world.title} 委託板`;
        document.getElementById('qb-global-close').outerHTML = `<button class="qb-close-btn danger" id="qb-global-close" onclick="window.QB_CORE.closeModal()">✕</button>`;
        
        root.classList.add('active');

        if (STATE.hasSearched && STATE.questList.length > 0) {
            renderQuestList();
        } else {
            renderSearchState();
        }
    }

    function closeModal() {
        const root = document.getElementById('qb-inner-modal-root');
        if (root) { root.classList.remove('active'); }
    }

    // === 5. UI 渲染邏輯 ===
    function renderSearchState() {
        const content = document.getElementById('qb-modal-content');
        const bottomBar = document.getElementById('qb-modal-bottom-bar');
        bottomBar.style.display = 'none';

        content.innerHTML = `
            <div class="qb-manual-search">
                <p>目前沒有任務，請按搜尋生成新委託。</p>
                <button class="qb-search-btn" onclick="window.QB_CORE.manualSearch()">🔍 搜尋委託</button>
            </div>
        `;
    }

    function renderLoading(text) {
        const content = document.getElementById('qb-modal-content');
        const bottomBar = document.getElementById('qb-modal-bottom-bar');
        bottomBar.style.display = 'none';
        content.innerHTML = `
            <div class="qb-loading">
                <div class="qb-spinner"></div>
                <span>${text}</span>
            </div>
        `;
    }

    async function manualSearch() {
        renderLoading('正在連線視差宇宙，擷取任務節點...');
        const world = STATE.activeWorld;
        
        const lore = WORLD_LORE[world.id] || world.desc;
        const promptMsg = `🌟 PARALLAX 世界節點激活\n世界名稱：${world.title}\n世界觀與勢力背景：${lore}\n【系統指令】\n請身為視差宇宙的任務發佈節點，嚴格基於上述「世界觀與勢力背景」，為此世界生成 4 個符合設定的具體任務委託。\n任務的地點、敵對勢力、術語（如：清醒者、奈米體、異種等）必須完美貼合該世界的背景！\n嚴格使用 [Quest|任務ID|任務標題|任務等級(S/A/B/C)|任務描述(約30字)|預計報酬|地點|危險度(1-5)] 標籤格式。`;
        const res = await callApi('quest_list_gen', promptMsg);

        let quests = [];
        let cleanText = "";
        
        if (res) {
            const questRegex = /\[Quest\|([^|\]]+)\|([^|\]]+)\|([^|\]]+)\|([^|\]]+)\|([^|\]]+)\|([^|\]]+)\|([^|\]]+)\]/g;
            cleanText = res;
            let match;
            while ((match = questRegex.exec(res)) !== null) {
                quests.push({
                    id: match[1].trim(), title: match[2].trim(), rank: match[3].trim(),
                    desc: match[4].trim(), reward: match[5].trim(), location: match[6].trim(),
                    danger: parseInt(match[7].trim()) || world.danger
                });
                cleanText = cleanText.replace(match[0], ''); 
            }
        }

        if (quests.length > 0) {
            STATE.questList = quests;
            STATE.hasSearched = true;
        } else {
            STATE.questList = [{ id:'fallback', title: `探索${world.title}邊境`, rank: 'C', desc: '調查異常反應。', reward: '500G', location: '邊境', danger: world.danger }];
            STATE.hasSearched = true;
            cleanText = `[Char|系統|error|「訊號干擾嚴重，僅能擷取到部分基礎委託，請湊合著看吧。」]`;
        }
        
        renderQuestList();
        if (cleanText.trim()) sendNarrativeToLobby(cleanText);
    }

    function renderQuestList() {
        document.getElementById('qb-global-close').outerHTML = `<button class="qb-close-btn danger" id="qb-global-close" title="關閉面板" onclick="window.QB_CORE.closeModal()">✕</button>`;

        const content = document.getElementById('qb-modal-content');
        const bottomBar = document.getElementById('qb-modal-bottom-bar');
        
        if (STATE.questList.length === 0) { renderSearchState(); return; }

        let html = '';
        STATE.questList.forEach((q, i) => {
            html += `
                <div class="qb-quest-card" onclick="window.QB_CORE.openQuestDetail(${i})">
                    <div class="qb-quest-rank" style="color:${getRankColor(q.rank)}">${q.rank}</div>
                    <div class="qb-quest-title">${q.title}</div>
                    <div class="qb-quest-meta">
                        <span class="qb-quest-tag">🗺️ ${q.location}</span>
                        <span class="qb-quest-tag">⚠️ 危險度 ${q.danger}</span>
                    </div>
                    <div class="qb-quest-desc">${q.desc}</div>
                </div>
            `;
        });
        content.innerHTML = html;

        bottomBar.style.display = 'flex';
        bottomBar.innerHTML = `
            <button class="qb-btn-back" onclick="window.QB_CORE.closeModal()">關閉面板</button>
            <button class="qb-btn-action" onclick="window.QB_CORE.manualSearch()">重新搜尋</button>
        `;
    }

    function openQuestDetail(index) {
        document.getElementById('qb-global-close').outerHTML = `<button class="qb-close-btn" id="qb-global-close" title="返回列表" onclick="window.QB_CORE.backToQuests()">‹ 返回</button>`;

        STATE.activeQuest = STATE.questList[index];
        const q = STATE.activeQuest;
        const content = document.getElementById('qb-modal-content');
        const bottomBar = document.getElementById('qb-modal-bottom-bar');

        let teamHtml = STATE.team.map((m, i) => `
            <div class="qb-team-member">
                <div class="qb-team-avatar">${m.avatar || (m.gender === '女' ? '👩' : '👨')}</div>
                <div class="qb-team-info">
                    <div class="qb-team-name">${m.name} <span style="font-size:10px; border:1px solid #ccc; padding:0 3px; border-radius:3px;">Lv.${m.level||'?'}</span></div>
                    <div class="qb-team-role">${m.role || m.class || '隊友'}</div>
                </div>
                <button class="qb-team-remove" onclick="window.QB_CORE.removeTeamMember(${i})">移除</button>
            </div>
        `).join('');

        if (STATE.team.length < 3) {
            teamHtml += `
                <div style="display:flex; gap:10px; margin-top:8px;">
                    <button class="qb-recruit-btn" style="flex:1;" onclick="window.QB_CORE.toggleRecruit()">➕ 招募 AI</button>
                    <button class="qb-recruit-btn" style="flex:1;" onclick="window.QB_CORE.openInviteList()">💌 邀請好友</button>
                </div>
            `;
        }

        content.innerHTML = `
            <div class="qb-detail-card">
                <div class="qb-detail-title">${q.title} <span style="font-size:14px;color:${getRankColor(q.rank)};float:right;">Rank ${q.rank}</span></div>
                <div class="qb-detail-section">
                    <div class="qb-detail-label">背景描述</div>
                    <div class="qb-detail-text">${q.desc}</div>
                </div>
                <div class="qb-detail-section" style="display:flex; gap:20px;">
                    <div><div class="qb-detail-label">地點</div><div class="qb-detail-text">📍 ${q.location}</div></div>
                    <div><div class="qb-detail-label">預計報酬</div><div class="qb-detail-reward">💰 ${q.reward}</div></div>
                </div>
            </div>
            <div class="qb-detail-title" style="font-size:14px; margin-bottom:10px;">小隊配置 (${STATE.team.length}/3)</div>
            <div class="qb-team-list">${teamHtml}</div>
        `;

        bottomBar.style.display = 'flex';
        bottomBar.innerHTML = `
            <button class="qb-btn-back" onclick="window.QB_CORE.backToQuests()">返回列表</button>
            <button class="qb-btn-action" onclick="window.QB_CORE.confirmStart()">🚀 視差跳躍 (DIVE)</button>
        `;
    }

    function backToQuests() { renderQuestList(); }
    function backToDetail() { openQuestDetail(STATE.questList.indexOf(STATE.activeQuest)); }
    function getRankColor(r) { return {'S':'#b91c1c','A':'#7e22ce','B':'#1d4ed8'}[r] || '#4b5563'; }

    // === 6. 隊友招募邏輯 ===
    async function toggleRecruit() {
        if (STATE.candidates && STATE.candidates.length > 0) { 
            renderRecruitUI(); 
        } else {
            await rerollRecruits();
        }
    }

    async function rerollRecruits() {
        renderLoading('正在從世界節點檢索適格者...');
        const q = STATE.activeQuest;
        const promptMsg = `任務標題：${q.title}\n任務等級：${q.rank}\n請幫我招募 4 名合適的隊友，並嚴格使用 [Recruit|...] 標籤格式。`;
        
        const res = await callApi('quest_recruit_gen', promptMsg);
        
        let recruits = [];
        let cleanText = "";
        
        if (res) {
            const recruitRegex = /\[Recruit\|([^|\]]+)\|([^|\]]+)\|([^|\]]+)\|([^|\]]+)\|([^|\]]+)\|([^|\]]+)\|([^|\]]*)\]/g;
            cleanText = res;
            let match;
            while ((match = recruitRegex.exec(res)) !== null) {
                recruits.push({
                    name: match[1].trim(), role: match[2].trim(), level: parseInt(match[3].trim()) || 1,
                    gender: match[4].trim(), specialty: match[5].trim(), desc: match[6].trim(),
                    imgPrompt: match[7] ? match[7].trim() : '', avatarUrl: ''
                });
                cleanText = cleanText.replace(match[0], '');
            }
        }

        if (recruits.length > 0) STATE.candidates = recruits;
        else STATE.candidates = [{ name:'錯誤NPC', role:'無', desc:'生成失敗', level:1, gender:'?', specialty:'無', imgPrompt:'', avatarUrl:'' }];

        renderRecruitUI();
        if (cleanText.trim()) sendNarrativeToLobby(cleanText);

        // 背景非同步生成頭像
        if (win.OS_IMAGE_MANAGER) {
            STATE.candidates.forEach(async (c, i) => {
                if (!c.imgPrompt) return;
                try {
                    const url = await win.OS_IMAGE_MANAGER.generateItem(c.imgPrompt, { width: 512, height: 512 });
                    STATE.candidates[i].avatarUrl = url;
                    const imgEl = document.getElementById(`qb-recruit-avatar-${i}`);
                    if (imgEl) imgEl.src = url;
                    await saveAvatarToLorebook(c.name, url);
                } catch (e) { console.warn(`[QB] 頭像生成失敗: ${c.name}`, e); }
            });
        }
    }

    function renderRecruitUI() {
        document.getElementById('qb-global-close').outerHTML = `<button class="qb-close-btn" id="qb-global-close" title="返回詳情" onclick="window.QB_CORE.backToDetail()">‹ 返回</button>`;

        const content = document.getElementById('qb-modal-content');
        const bottomBar = document.getElementById('qb-modal-bottom-bar');

        let html = `<div class="qb-detail-title" style="font-size:14px; margin-bottom:12px;">點擊招募傭兵 (目前 ${STATE.team.length}/3)</div>`;
        
        STATE.candidates.forEach((c, i) => {
            const inTeam = STATE.team.some(m => m.name === c.name);
            const selClass = inTeam ? 'selected' : '';
            const checkHtml = inTeam ? `<div style="color:#D4AF37; font-size:18px; font-weight:bold; margin-left:auto;">✓</div>` : '';

            html += `
                <div class="qb-recruit-card ${selClass}" onclick="window.QB_CORE.toggleRecruitCandidate(${i})">
                    <div class="qb-team-avatar">${c.avatarUrl ? `<img id="qb-recruit-avatar-${i}" src="${c.avatarUrl}">` : `<img id="qb-recruit-avatar-${i}" src="" style="display:none">${c.gender === '女' ? '👩' : '👨'}`}</div>
                    <div class="qb-team-info">
                        <div class="qb-team-name">${c.name} <span style="font-size:10px; border:1px solid #ccc; padding:0 3px; border-radius:3px;">Lv.${c.level}</span></div>
                        <div class="qb-team-role" style="color:#D4AF37;">${c.role} • ${c.specialty}</div>
                        <div style="font-size:11px;color:#718096;margin-top:2px;">${c.desc}</div>
                    </div>
                    ${checkHtml}
                </div>
            `;
        });
        content.innerHTML = html;

        bottomBar.innerHTML = `
            <button class="qb-btn-back" onclick="window.QB_CORE.backToDetail()">‹ 返回詳情</button>
            <button class="qb-btn-action" onclick="window.QB_CORE.rerollRecruits()">🔄 重新整理</button>
        `;
    }

    function toggleRecruitCandidate(index) {
        const c = STATE.candidates[index];
        const existIdx = STATE.team.findIndex(m => m.name === c.name);
        if (existIdx >= 0) {
            STATE.team.splice(existIdx, 1);
        } else {
            if (STATE.team.length >= 3) { alert("隊伍已滿 (最多3人)"); return; }
            STATE.team.push(JSON.parse(JSON.stringify(c)));
        }
        renderRecruitUI();
    }

    function removeTeamMember(index) {
        STATE.team.splice(index, 1);
        openQuestDetail(STATE.questList.indexOf(STATE.activeQuest));
    }

    // === 7. 好友邀請邏輯 ===
    async function openInviteList() {
        document.getElementById('qb-global-close').outerHTML = `<button class="qb-close-btn" id="qb-global-close" title="返回詳情" onclick="window.QB_CORE.backToDetail()">‹ 返回</button>`;

        const db = window.OS_DB || (win.OS_DB);
        let contacts = [];
        if (db && db.getAllContacts) { contacts = await db.getAllContacts(); }

        const content = document.getElementById('qb-modal-content');
        const bottomBar = document.getElementById('qb-modal-bottom-bar');
        
        let html = `<div class="qb-detail-title" style="font-size:14px; margin-bottom:12px;">邀請好友同行 (目前 ${STATE.team.length}/3)</div>`;
        if (contacts.length === 0) {
            html += `<div style="text-align:center;color:#a0aec0;padding:20px;">聯絡簿空空如也</div>`;
        } else {
            html += `<div class="qb-invite-list">`;
            contacts.forEach(c => {
                const inTeam = STATE.team.some(m => m.name === c.name);
                const btnState = inTeam ? 'disabled' : '';
                const btnText = inTeam ? '✓ 已入隊' : '邀請';
                
                html += `
                    <div class="qb-invite-item">
                        <div class="qb-invite-avatar"><img src="${c.avatar || ''}" onerror="this.style.display='none'; this.parentElement.innerText='👤';"></div>
                        <div class="qb-invite-info">
                            <div class="qb-invite-name">${c.name}</div>
                        </div>
                        <button class="qb-invite-btn" ${btnState} onclick="window.QB_CORE.addFriendToTeam('${c.name}', '${c.avatar||''}')">
                            ${btnText}
                        </button>
                    </div>
                `;
            });
            html += `</div>`;
        }

        content.innerHTML = html;
        bottomBar.innerHTML = `
            <button class="qb-btn-back" style="flex:1;" onclick="window.QB_CORE.backToDetail()">‹ 返回詳情</button>
        `;
    }

    function addFriendToTeam(name, avatar) {
        if (STATE.team.length >= 3) { alert("隊伍已滿 (最多3人)"); return; }
        const rpgRole = ['異界旅客', '命運羈絆', '穿越者', '支援者'][Math.floor(Math.random()*4)];
        STATE.team.push({ name: name, avatar: avatar ? `<img src="${avatar}">` : '👤', role: rpgRole, level: '?', desc: '聯絡簿好友', isFriend: true });
        openInviteList(); 
    }

    // === 8. 模式選擇與潛行 ===
    function confirmStart() {
        const q = STATE.activeQuest;
        const teamNames = STATE.team.length ? STATE.team.map(m => m.name).join(', ') : "單人行動";

        document.getElementById('qb-global-close').outerHTML = `<button class="qb-close-btn" id="qb-global-close" title="返回詳情" onclick="window.QB_CORE.backToDetail()">‹ 返回</button>`;

        const content = document.getElementById('qb-modal-content');
        const bottomBar = document.getElementById('qb-modal-bottom-bar');

        content.innerHTML = `
            <div style="text-align:center; margin-bottom:20px;">
                <div style="font-family:'Cinzel'; font-size:20px; font-weight:bold; color:#1a202c;">${q.title}</div>
                <div style="color:#718096; font-size:12px; margin-top:5px;">${STATE.activeWorld.title} • ${teamNames}</div>
            </div>
            <div class="qb-detail-card">
                <div class="qb-detail-label">選擇敘事模式</div>
                <div class="qb-mode-select">
                    <div class="qb-mode-opt active" id="mode-vn" onclick="window.QB_CORE.selectMode('vn')">
                        <div style="font-size:24px; margin-bottom:5px;">🎭</div>
                        <div>視覺小說 (VN)</div>
                    </div>
                    <div class="qb-mode-opt" id="mode-novel" onclick="window.QB_CORE.selectMode('novel')">
                        <div style="font-size:24px; margin-bottom:5px;">📖</div>
                        <div>小說文本</div>
                    </div>
                </div>
            </div>
        `;

        bottomBar.innerHTML = `
            <button class="qb-btn-back" onclick="window.QB_CORE.backToDetail()">‹ 取消</button>
            <button class="qb-btn-action" onclick="window.QB_CORE.diveQuest()">✨ 視差跳躍</button>
        `;
    }

    function selectMode(mode) {
        STATE.selectedMode = mode;
        document.querySelectorAll('.qb-mode-opt').forEach(el => el.classList.remove('active'));
        document.getElementById(`mode-${mode}`).classList.add('active');
    }

    async function diveQuest() {
        const q = STATE.activeQuest;
        const w = STATE.activeWorld;
        const playerName = (window.VoidTerminal && window.VoidTerminal.getUserName) ? window.VoidTerminal.getUserName() : '體驗者';
        
        if (!STATE.team.find(m => m.name === playerName)) {
            STATE.team.unshift({ name: playerName, role: '隊長', desc: '玩家本人' });
        }

        let teamDetails = "無 (單人行動)";
        if (STATE.team.length > 0) {
            teamDetails = STATE.team.map(m => {
                const guestTag = m.isFriend ? ' [通訊錄好友]' : '';
                const specTag = m.specialty ? ` | 專長：${m.specialty}` : '';
                return `- ${m.name}${guestTag} (Lv.${m.level || '?'} ${m.role || m.class || '隊友'})\n  簡介：${m.desc}${specTag}`;
            }).join('\n');
        }
        
        const startPrompt = `
🌟 PARALLAX 世界激活
━━━━━━━━━━━━━━━━━━━━━
[System Command: NEXUS PARALLAX Start Quest]
World: ${w.title} (${w.desc})
Quest: ${q.title} (Rank ${q.rank})
Objective: ${q.desc}
Mode: ${STATE.selectedMode === 'vn' ? 'VN格式' : '小說格式'}

【隊伍陣容】
主角：{{user}}
隊員詳情：
${teamDetails}

世界观隔离：已启动
奥瑞亚都市元素：已屏蔽
NPCs:生成中，確保符合規則
【請注意】角色死亡將直接傳回附近村莊，並出現負面效果
1. 請以 旁白 視角開始這段冒險。
2. 視差系統啟動後，會在純白大廳會合，介紹周圍環境與當前狀況，並在整備後傳進世界。
3. 如果有隊友，請根據上方【隊伍陣容】的詳細人設，讓他們進行符合性格的開場互動。
体验开始 ↓
━━━━━━━━━━━━━━━━━━━━━
`;

        const content = document.getElementById('qb-modal-content');
        const bottomBar = document.getElementById('qb-modal-bottom-bar');
        bottomBar.style.display = 'none';
        content.innerHTML = `
            <div style="height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#D4AF37;">
                <div class="qb-spinner" style="width:40px; height:40px; border-width:4px;"></div>
                <div style="font-family:'Cinzel'; margin-top:20px; font-weight:bold; letter-spacing:2px;">LINK START</div>
            </div>
        `;
        
        try {
            const entityId = `qb_${Date.now()}`;
            if (win.OS_BRIDGE && typeof win.OS_BRIDGE.startSession === 'function') {
                win.OS_BRIDGE.startSession(entityId, `任務:${q.title}`);
            }

            if (win.TavernHelper && typeof win.TavernHelper.createChatMessages === 'function') {
                await win.TavernHelper.createChatMessages([{
                    role: 'user',
                    name: 'System',
                    message: startPrompt
                }], { refresh: 'affected' });
            } else {
                console.error("找不到 TavernHelper，無法發送跑團劇情");
            }
            
            setTimeout(() => {
                closeModal();
                if (window.AureliaControlCenter && typeof window.AureliaControlCenter.switchPage === 'function') {
                    window.AureliaControlCenter.switchPage('nav-story');
                }
            }, 1000);
            
        } catch(e) {
            console.error("DIVE 失敗:", e);
            renderQuestList();
        }
    }

    // === 9. 導出 API ===
    window.QB_CORE = {
        openLobbyQuestPanel: openLobbyQuestPanel,
        closeModal: closeModal,
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
        selectMode: selectMode,
        diveQuest: diveQuest
    };

})();