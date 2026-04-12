/**
 * [檔案] host_core.js (V4.5 - Context Aware & Noir UI Restored)
 * 職責：不夜城牛郎俱樂部 - 完美樣式還原 + 世界書讀取修復
 * * 修改重點：
 * 1. [UI] 100% 使用 host_core-old.js 的代碼結構，確保面板樣式、愛心按鈕、秘密檔案完全一致。
 * 2. [API] 棄用手動組裝，改用 win.OS_API.buildContext()，這與直播模組(Livestream)邏輯一致，
 * 確保能讀取到酒館的 World Info (世界書) 和當前對話上下文。
 * 3. [經濟] 補回與 OS_ECONOMY 的對接，指名時會檢查餘額並扣款。
 */
(function() {
    console.log('[PhoneOS] 載入不夜城牛郎俱樂部 (V4.5 Context Aware)...');
    const win = window.parent || window;

    // =================================================================
    // 🔥 0. 經濟系統配置 (無縫植入)
    // =================================================================
    const PRICING = {
        'Silver': { cost: 1000, name: '白銀' },
        'Gold':   { cost: 3000, name: '黃金' },
        'Platinum': { cost: 8000, name: '白金' },
        'Secret': { cost: 15000, name: '隱藏' }
    };

    // 獲取錢包工具
    function getWalletInfo() {
        if (win.OS_ECONOMY) {
            return {
                balance: win.OS_ECONOMY.getBalance(),
                transaction: (amt, reason) => win.OS_ECONOMY.transaction(amt, reason)
            };
        }
        return { balance: 999999, transaction: () => true };
    }

    // =================================================================
    // 1. 樣式定義 (完全保留 V4.1 Noir Style)
    // =================================================================
    const hostStyle = `
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Lato:wght@300;400;700&family=Noto+Serif+TC:wght@400;700&display=swap');

        :root {
            --hc-bg: #1B1717;           /* Noir Black */
            --hc-panel: #262222;        /* Slightly lighter black */
            --hc-red: #810100;          /* Cherry Red */
            --hc-red-glow: #ff1a1a;
            --hc-maroon: #630000;       /* Maroon */
            --hc-cotton: #EDEBDD;       /* Cotton (Text) */
            --hc-gold: #D4AF37;         /* Luxury Gold */
            --hc-gold-dim: #8a7038;
            --hc-pink: #ff4d94;         /* Hot Pink for Secrets */
            --hc-glass: rgba(20, 20, 20, 0.85);
        }

        .hc-container { 
            width: 100%; height: 100%; 
            background-color: var(--hc-bg);
            background-image: radial-gradient(circle at 50% 0%, #2d1b1b 0%, var(--hc-bg) 60%);
            color: var(--hc-cotton); 
            font-family: 'Lato', 'Noto Serif TC', sans-serif;
            display: flex; flex-direction: column; overflow: hidden; position: relative;
        }

        /* --- 頭部導航 --- */
        .hc-header { 
            padding: 15px 20px; 
            display: flex; align-items: center; justify-content: space-between;
            background: linear-gradient(to bottom, rgba(0,0,0,0.8), transparent);
            z-index: 10;
        }
        .hc-header-center { text-align: center; }
        .hc-title { 
            font-family: 'Cinzel', serif; font-size: 20px; font-weight: 700; color: var(--hc-cotton); 
            letter-spacing: 2px; text-transform: uppercase;
            text-shadow: 0 2px 10px rgba(0,0,0,0.5);
        }
        .hc-subtitle { 
            font-size: 10px; color: var(--hc-gold); 
            letter-spacing: 3px; text-transform: uppercase; margin-top: 2px; opacity: 0.8;
        }
        .hc-btn-icon { 
            width: 36px; height: 36px; border-radius: 50%; 
            background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
            display: flex; align-items: center; justify-content: center; 
            cursor: pointer; font-size: 16px; color: var(--hc-cotton); transition: 0.3s;
        }
        .hc-btn-icon:hover { border-color: var(--hc-gold); color: var(--hc-gold); background: rgba(212, 175, 55, 0.1); }

        /* --- 內容滾動區 --- */
        .hc-content { 
            flex: 1; overflow-y: auto; padding: 10px 20px 40px 20px;
            display: flex; flex-direction: column; align-items: center; gap: 20px;
            scrollbar-width: thin; scrollbar-color: var(--hc-red) transparent;
        }
        
        .hc-controls-wrapper {
            width: 100%; max-width: 600px;
            display: flex; flex-direction: column; gap: 15px;
            align-items: center;
            margin-bottom: 10px;
        }

        .hc-tabs {
            display: flex; padding: 4px; border-radius: 30px;
            background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1);
            width: 100%; justify-content: space-between;
        }
        .hc-tab-btn {
            flex: 1; text-align: center; padding: 10px 0; border-radius: 25px;
            font-size: 13px; font-weight: bold; color: #888; cursor: pointer;
            transition: 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
            display: flex; align-items: center; justify-content: center; gap: 6px;
        }
        .hc-tab-btn.active {
            background: var(--hc-panel);
            color: var(--hc-gold);
            border: 1px solid var(--hc-gold-dim);
            box-shadow: 0 4px 15px rgba(0,0,0,0.5);
        }
        .hc-tab-icon { font-size: 14px; }

        .hc-recruit-btn {
            width: 100%; padding: 14px; border-radius: 12px;
            background: linear-gradient(135deg, var(--hc-red) 0%, var(--hc-maroon) 100%);
            border: 1px solid rgba(255,255,255,0.1);
            color: white; font-family: 'Cinzel', serif; font-size: 14px; font-weight: bold; letter-spacing: 1px;
            cursor: pointer; transition: 0.3s;
            box-shadow: 0 5px 20px rgba(129, 1, 0, 0.4);
            display: flex; align-items: center; justify-content: center; gap: 10px;
        }
        .hc-recruit-btn:hover {
            filter: brightness(1.2); transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(129, 1, 0, 0.6);
        }
        .hc-recruit-btn:active { transform: translateY(0); }
        .hc-recruit-btn:disabled { filter: grayscale(1); opacity: 0.6; cursor: wait; }

        .hc-grid { 
            display: grid; 
            grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); 
            gap: 15px; width: 100%; max-width: 1000px; 
            padding-bottom: 40px;
        }

        .hc-card {
            background: var(--hc-panel);
            border: 1px solid rgba(255,255,255,0.05);
            border-radius: 12px; overflow: hidden;
            position: relative; aspect-ratio: 3/4;
            cursor: pointer; transition: 0.3s;
            box-shadow: 0 4px 10px rgba(0,0,0,0.3);
        }
        .hc-card:hover {
            border-color: var(--hc-gold);
            box-shadow: 0 10px 25px rgba(0,0,0,0.5), 0 0 15px rgba(212, 175, 55, 0.15);
            transform: translateY(-4px);
        }
        .hc-card-img { width: 100%; height: 100%; object-fit: cover; transition: 0.6s; filter: brightness(0.9); }
        .hc-card:hover .hc-card-img { transform: scale(1.08); filter: brightness(1); }

        .hc-card-info {
            position: absolute; bottom: 0; left: 0; width: 100%;
            padding: 15px 12px; box-sizing: border-box;
            background: linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.6) 60%, transparent 100%);
            display: flex; flex-direction: column; gap: 2px;
        }
        .hc-card-role { font-size: 10px; color: var(--hc-gold); text-transform: uppercase; letter-spacing: 1px; font-weight: bold; }
        .hc-card-name { font-size: 16px; color: #fff; font-weight: bold; font-family: 'Noto Serif TC', serif; }
        .hc-card-price { font-size: 11px; color: #bbb; margin-top: 2px; }

        .hc-status-box { 
            width: 100%; height: 250px;
            display: flex; flex-direction: column; align-items: center; justify-content: center; 
            color: #666; gap: 15px; text-align: center;
            border: 1px dashed rgba(255,255,255,0.1); border-radius: 12px;
            grid-column: 1 / -1; /* 讓狀態框佔滿整行 */
        }
        .hc-spinner { 
            width: 32px; height: 32px; border: 3px solid rgba(129, 1, 0, 0.3); 
            border-top-color: var(--hc-red); border-radius: 50%; 
            animation: spin 1s infinite cubic-bezier(0.6, 0.05, 0.15, 0.95); 
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* --- 詳情頁模態窗 --- */
        .hc-modal-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.8); backdrop-filter: blur(8px);
            z-index: 100; display: flex; align-items: center; justify-content: center;
            opacity: 0; pointer-events: none; transition: 0.3s;
        }
        .hc-modal-overlay.active { opacity: 1; pointer-events: auto; }
        
        .hc-modal-card {
            width: 90%; max-width: 400px; height: auto; max-height: 85vh;
            background: #1a1a1a; border: 1px solid var(--hc-gold-dim);
            border-radius: 16px; display: flex; flex-direction: column;
            overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.8);
            animation: slideUp 0.3s ease-out;
        }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

        .hc-modal-img-area { position: relative; height: 180px; flex-shrink: 0; }
        .hc-modal-img { width: 100%; height: 100%; object-fit: cover; }
        .hc-modal-close {
            position: absolute; top: 15px; right: 15px; width: 32px; height: 32px;
            background: rgba(0,0,0,0.5); border-radius: 50%; color: #fff; border: 1px solid rgba(255,255,255,0.2);
            display: flex; align-items: center; justify-content: center; cursor: pointer;
            backdrop-filter: blur(4px); transition: 0.2s;
        }
        .hc-modal-close:hover { background: var(--hc-red); border-color: var(--hc-red); }

        .hc-modal-body { 
            padding: 15px 20px; 
            overflow-y: auto; 
            color: var(--hc-cotton); 
            flex: 1; 
            max-height: 40vh;
        }
        
        .hc-name-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px; }
        .hc-detail-name { font-family: 'Cinzel', serif; font-size: 24px; color: var(--hc-gold); }
        
        .hc-heart-btn {
            background: rgba(255, 77, 148, 0.1); border: 1px solid rgba(255, 77, 148, 0.3);
            color: var(--hc-pink); width: 32px; height: 32px; border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            font-size: 16px; cursor: pointer; transition: 0.3s;
            animation: pulse-slow 2s infinite;
        }
        .hc-heart-btn:hover { background: var(--hc-pink); color: #fff; box-shadow: 0 0 15px var(--hc-pink); }
        @keyframes pulse-slow { 0% { transform: scale(1); } 50% { transform: scale(1.05); } 100% { transform: scale(1); } }

        .hc-detail-quote { font-style: italic; color: #888; font-size: 12px; margin-bottom: 12px; border-left: 2px solid var(--hc-red); padding-left: 10px; }
        
        .hc-secret-panel {
            background: linear-gradient(135deg, rgba(20,0,0,0.8) 0%, rgba(40,0,0,0.6) 100%);
            border: 1px solid var(--hc-red); border-radius: 8px;
            padding: 12px; margin-bottom: 12px;
            display: none;
            animation: fadeIn 0.4s;
        }
        .hc-secret-panel.active { display: block; }
        .hc-secret-title { font-size: 11px; font-weight: bold; color: var(--hc-pink); letter-spacing: 1px; margin-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 3px; }
        .hc-secret-text { font-size: 12px; color: #ddd; line-height: 1.6; margin-bottom: 12px; padding: 8px; background: rgba(0,0,0,0.3); border-radius: 4px; border-left: 3px solid var(--hc-pink); }
        .hc-secret-list { list-style: none; padding: 0; margin: 0; font-size: 12px; color: #ddd; margin-bottom: 8px; }
        .hc-secret-list li { margin-bottom: 3px; padding-left: 15px; position: relative; }
        .hc-secret-list li::before { content: '♥'; position: absolute; left: 0; color: var(--hc-pink); font-size: 10px; top: 2px; }
        .hc-taboo-list li::before { content: '✖'; color: #888; }
        .hc-taboo-title { color: #aaa; }

        @keyframes fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }

        .hc-attrs { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
        .hc-attr-box { background: rgba(255,255,255,0.03); padding: 6px 10px; border-radius: 6px; }
        .hc-attr-label { font-size: 9px; color: var(--hc-red); text-transform: uppercase; font-weight: bold; letter-spacing: 1px; display: block; margin-bottom: 2px; }
        .hc-attr-val { font-size: 12px; color: #ddd; }

        .hc-desc-p { font-size: 13px; line-height: 1.5; color: #ccc; margin-bottom: 12px; text-align: justify; }

        .hc-mode-selector { display: flex; gap: 8px; justify-content: center; margin: 10px 0 12px 0; }
        .hc-mode-opt { padding: 6px 14px; border: 1px solid #333; color: #666; border-radius: 6px; font-size: 11px; cursor: pointer; transition: 0.2s; font-family: 'Cinzel', serif; letter-spacing: 1px; }
        .hc-mode-opt:hover { border-color: #888; color: #aaa; }
        .hc-mode-opt.active { border-color: var(--hc-gold); background: var(--hc-gold); color: #000; font-weight: bold; }

        .hc-modal-footer {
            padding: 12px 20px; border-top: 1px solid rgba(255,255,255,0.05);
            background: #111; display: flex; gap: 10px; flex-shrink: 0;
        }
        .hc-btn { flex: 1; padding: 10px; border-radius: 8px; font-weight: bold; cursor: pointer; border: none; font-size: 13px; }
        .hc-btn-sub { background: transparent; border: 1px solid #444; color: #888; }
        .hc-btn-main { background: var(--hc-red); color: white; box-shadow: 0 4px 15px rgba(129, 1, 0, 0.3); }
        .hc-btn-main:disabled { background: #444; cursor: not-allowed; opacity: 0.5; box-shadow: none; }

        /* 🔥 夜寮定制面板 (Nightliao Custom Panel) */
        .hc-custom-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.9); backdrop-filter: blur(10px);
            z-index: 150; display: none; align-items: center; justify-content: center;
            animation: fadeIn 0.3s;
        }
        .hc-custom-overlay.active { display: flex; }
        
        .hc-custom-panel {
            width: 90%; max-width: 420px; 
            max-height: 75vh; 
            background: linear-gradient(135deg, #1a0000 0%, #2d0a0a 100%);
            border: 2px solid var(--hc-gold-dim); border-radius: 16px;
            padding: 20px; 
            box-shadow: 0 20px 60px rgba(0,0,0,0.9);
            animation: slideUp 0.4s ease-out;
            display: flex; flex-direction: column; overflow: hidden;
        }
        
        .hc-custom-header { flex-shrink: 0; }
        .hc-custom-body { flex: 1; overflow-y: auto; overflow-x: hidden; padding-right: 5px; margin-right: -5px; margin-top: 15px; }
        .hc-custom-footer { flex-shrink: 0; margin-top: 15px; }
        
        .hc-custom-title { font-family: 'Cinzel', serif; font-size: 20px; color: var(--hc-gold); text-align: center; margin-bottom: 5px; letter-spacing: 2px; }
        .hc-custom-subtitle { text-align: center; font-size: 10px; color: #888; letter-spacing: 1px; margin-bottom: 0; }
        
        .hc-form-group { margin-bottom: 15px; }
        .hc-form-label { display: block; font-size: 12px; color: var(--hc-gold); margin-bottom: 8px; font-weight: bold; letter-spacing: 1px; }
        .hc-form-input, .hc-form-select, .hc-form-textarea { width: 100%; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 10px 12px; border-radius: 8px; font-size: 14px; font-family: inherit; box-sizing: border-box; }
        .hc-form-textarea { resize: vertical; min-height: 50px; }
        
        .hc-gender-group { display: flex; gap: 8px; }
        .hc-gender-btn { flex: 1; padding: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: #888; cursor: pointer; text-align: center; transition: 0.3s; font-weight: bold; font-size: 14px; }
        .hc-gender-btn.active { background: var(--hc-red); color: white; border-color: var(--hc-red); box-shadow: 0 0 15px rgba(129, 1, 0, 0.5); }
        
        .hc-tier-group { display: flex; flex-direction: column; gap: 8px; }
        .hc-tier-card { background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 10px 12px; cursor: pointer; transition: 0.3s; position: relative; }
        .hc-tier-card:hover { border-color: var(--hc-gold); }
        .hc-tier-card.active { border-color: var(--hc-gold); background: rgba(212, 175, 55, 0.1); box-shadow: 0 0 15px rgba(212, 175, 55, 0.2); }
        .hc-tier-name { font-weight: bold; font-size: 14px; color: var(--hc-gold); margin-bottom: 3px; display: flex; align-items: center; gap: 8px; }
        .hc-tier-desc { font-size: 11px; color: #aaa; line-height: 1.4; }
        .hc-tier-badge { position: absolute; top: 12px; right: 15px; background: var(--hc-gold); color: #000; padding: 2px 8px; border-radius: 4px; font-size: 9px; font-weight: bold; }
        
        .hc-custom-submit { width: 100%; padding: 14px; background: linear-gradient(135deg, var(--hc-red) 0%, var(--hc-maroon) 100%); border: none; border-radius: 10px; color: white; font-family: 'Cinzel', serif; font-size: 15px; font-weight: bold; cursor: pointer; letter-spacing: 1px; box-shadow: 0 5px 20px rgba(129, 1, 0, 0.4); transition: 0.3s; }
        .hc-custom-cancel { width: 100%; padding: 10px; background: transparent; border: 1px solid #444; border-radius: 8px; color: #888; cursor: pointer; margin-top: 8px; font-size: 13px; transition: 0.3s; }
        
        @media (max-width: 600px) {
            .hc-content { padding: 10px 15px 80px 15px; } 
            .hc-header { padding: 12px 15px; }
            .hc-title { font-size: 18px; }
            .hc-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; } 
            .hc-card-info { padding: 10px 8px; }
            .hc-card-name { font-size: 14px; }
            .hc-modal-card { width: 95%; max-height: 88vh; }
            .hc-modal-img-area { height: 160px; }
            .hc-modal-body { padding: 12px 18px; max-height: 35vh; }
        }
    `;

    const doc = window.parent.document || document;
    if (!doc.getElementById('host-club-v45-css')) {
        const s = doc.createElement('style'); s.id = 'host-club-v45-css'; s.innerHTML = hostStyle; doc.head.appendChild(s);
    }

    // =================================================================
    // 2. 狀態管理
    // =================================================================
    let STATE = {
        container: null,
        mode: 'host', // 'host' | 'hostess' | 'nightliao'
        hosts: [],
        isProcessing: false,
        selectedHost: null,
        selectedMode: 'vn',
        customParams: { gender: 'male', type: '', notes: '', tier: 'normal' }
    };

    // =================================================================
    // 3. 核心邏輯 - 🔥 API 調用修復 (使用 buildContext 抓取世界書)
    // =================================================================
    
    // 生成 Prompt 字符串
    function getRecruitPromptString(mode, customParams = null) {
        let role, gender;
        
        if (mode === 'nightliao' && customParams) {
            role = customParams.gender === 'female' ? '女夜寮' : '男夜寮';
            gender = customParams.gender === 'female' ? '女性' : '男性';
        } else {
            role = mode === 'hostess' ? '女伶' : '牛郎';
            gender = mode === 'hostess' ? '女性' : '男性';
        }
        
        // 內建風格描述
        let styleDesc = mode === 'nightliao' ? '私密夜寮風格' : '高級俱樂部風格';
        
        if (mode === 'nightliao' && customParams) {
            let customRequirements = '\n\n【客戶定制要求】';
            if (customParams.type) customRequirements += `\n- 類型偏好：${customParams.type}`;
            if (customParams.notes) customRequirements += `\n- 特殊要求：${customParams.notes}`;
            if (customParams.tier === 'vip') customRequirements += '\n- 會員等級：VIP（更高質量）';
            else if (customParams.tier === 'hidden') customRequirements += '\n- 會員等級：隱藏VIP（最頂級服務）';
            styleDesc += customRequirements;
        }
        
        // 🔥 重要：這裡不手動加世界書，因為 buildContext 會自動加
        return `[System Instruction: You are a JSON generator. Output VALID JSON array only.]
你現在是「不夜城」經理。請生成 4 位${role}（${gender}），年齡 20-35。
風格：${styleDesc}

請參考[World Info]中的種族與世界觀設定（如果有的話）。
RLUE:反刻板印象，不要只用 Alpha/Omega 的支配關係，而是用**「客戶需求」**來區分
請輸出嚴格的 JSON 數組格式 (不要 Markdown 代碼塊)，每個對象包含：
- name: 名字 (可包含英文名)
- title: 稱號 (如: 紅牌, 新人王)
- tier: 等級 (Silver, Gold, Platinum, Secret)
- price: 價格 (數字, 1000~20000)
- desc: 外貌與性格描述
- personality: 性格關鍵詞
- specialty: 特長
- greeting: 開場白
- fetishes: [數組] 性癖/XP
- taboos: [數組] 雷點/禁忌
- background: 入職背景 (描述這個角色是如何來到不夜城當host的，例如：前職、原因、故事等)
- serviceType: 營業類型 (上下位關係，用於男夜寮的方位區分。必須是以下選項之一：上位、下位、雙向。上位表示主導方，下位表示被動方，雙向表示可以接受兩種角色。這是針對男夜寮的重要屬性，用於區分服務方位)
- flexibility: 可妥協度 (數字 0-100，表示對反向需求的接受程度，超50後代表可妥協，0表示完全不接受，100表示完全接受)
- avatar_prompt: 用於生成頭像的英文提示詞(禁止輸出關鍵詞:photorealistic，任何會觸發真人頭像的關鍵詞，盡量是韓國動漫風，半厚塗風格，遊戲CG，千萬不要真人)`;
    }

    async function fetchRecruit(mode, customParams = null) {
        if (STATE.isProcessing) return;
        setLoading(true);

        try {
            // [TODO: Standalone API] 功能待接入直連 API
            console.warn('[HostClub] AI 功能已停用，等待 Standalone API 整合');
            throw new Error('Standalone API 尚未整合');
        } catch (e) {
            console.error("Recruit failed", e);
            alert("招募失敗，請檢查 API 設置。\n錯誤: " + e.message);
        } finally {
            setLoading(false);
        }
    }

    async function generateImagesBackground(data, mode, customParams) {
        const lorebookData = [];
        for (let i = 0; i < data.length; i++) {
            try {
                const host = data[i];
                let genderPrompt;
                if (mode === 'nightliao' && customParams) {
                    genderPrompt = customParams.gender === 'female' ? 'beautiful woman' : 'handsome man';
                } else {
                    genderPrompt = mode === 'hostess' ? 'beautiful woman' : 'handsome man';
                }

                let cleanPrompt = (host.avatar_prompt || '').toLowerCase();
                const basePrompt = `${genderPrompt}, ${cleanPrompt}`;
                
                const url = await win.OS_IMAGE_MANAGER.generate(basePrompt, 'char');
                STATE.hosts[i].avatarUrl = url;
                
                const imgEl = document.getElementById(`host-img-${i}`);
                if (imgEl) imgEl.src = url;
                
                lorebookData.push({ name: host.name.split('(')[0].trim(), url: url });
                
            } catch (e) { console.warn("Image gen failed for index " + i); }
        }
        
        // 保存到世界書
        if (lorebookData.length > 0 && win.TavernHelper) {
            saveToLorebookAsync(lorebookData);
        }
    }
    
    async function saveToLorebookAsync(dataList) {
        try {
            const lorebookName = '系統';
            const entryComment = '[隨機頭像素材]';
            const entries = await win.TavernHelper.getLorebookEntries(lorebookName);
            const targetEntry = entries.find(entry => entry.comment === entryComment);
            
            if (targetEntry) {
                const newLines = dataList.map(item => `${item.name}:${item.url}`).join('\n');
                const updatedContent = targetEntry.content ? `${targetEntry.content}\n${newLines}` : newLines;
                await win.TavernHelper.setLorebookEntries(lorebookName, [{ uid: targetEntry.uid, content: updatedContent }]);
                console.log(`[Host Club] ✅ 已保存 ${dataList.length} 筆頭像數據`);
            }
        } catch (e) { console.warn('Save to Lorebook failed', e); }
    }

    // =================================================================
    // 4. UI 渲染與交互 (完全沿用 V4.1)
    // =================================================================
    
    function launch(container) {
        STATE.container = container;
        renderStructure();
        renderGrid();
    }

    function renderStructure() {
        if (!STATE.container) return;
        STATE.container.innerHTML = `
            <div class="hc-container">
                <div class="hc-header">
                    <div class="hc-btn-icon" onclick="window.parent.PhoneSystem.goHome()">❮</div>
                    <div class="hc-header-center">
                        <div class="hc-title">NIGHTLESS</div>
                        <div class="hc-subtitle">PREMIUM CLUB</div>
                    </div>
                    <div class="hc-btn-icon" onclick="window.HOST_CLUB.clearData()">🗑️</div>
                </div>

                <div class="hc-content">
                    <div class="hc-controls-wrapper">
                        <div class="hc-tabs">
                            <div class="hc-tab-btn active" id="tab-host" onclick="window.HOST_CLUB.switchMode('host')">
                                <span class="hc-tab-icon">👔</span> 牛郎
                            </div>
                            <div class="hc-tab-btn" id="tab-hostess" onclick="window.HOST_CLUB.switchMode('hostess')">
                                <span class="hc-tab-icon">👠</span> 女伶
                            </div>
                            <div class="hc-tab-btn" id="tab-nightliao" onclick="window.HOST_CLUB.switchMode('nightliao')">
                                <span class="hc-tab-icon">🌙</span> 夜寮
                            </div>
                        </div>

                        <button class="hc-recruit-btn" id="btn-recruit" onclick="window.HOST_CLUB.handleRecruit()">
                            <span>✨ 招募新人 / RECRUIT</span>
                        </button>
                    </div>

                    <div id="hc-grid-area" class="hc-grid"></div>
                </div>

                <div id="hc-modal" class="hc-modal-overlay">
                    <div class="hc-modal-card">
                        <div class="hc-modal-img-area">
                            <img id="modal-img" class="hc-modal-img" src="">
                            <div class="hc-modal-close" onclick="window.HOST_CLUB.closeModal()">✕</div>
                        </div>
                        <div class="hc-modal-body" id="modal-body"></div>
                        <div class="hc-modal-footer">
                            <button class="hc-btn hc-btn-sub" onclick="window.HOST_CLUB.closeModal()">BACK</button>
                            <button class="hc-btn hc-btn-main" id="btn-confirm" onclick="window.HOST_CLUB.confirmHost()">SELECT / 指名</button>
                        </div>
                    </div>
                </div>

                <div id="hc-custom-overlay" class="hc-custom-overlay">
                    <div class="hc-custom-panel">
                        <div class="hc-custom-header">
                            <div class="hc-custom-title">夜寮定制服務</div>
                            <div class="hc-custom-subtitle">NIGHTLIAO CUSTOM SERVICE</div>
                        </div>
                        
                        <div class="hc-custom-body">
                            <div class="hc-form-group">
                                <label class="hc-form-label">性別 / GENDER</label>
                                <div class="hc-gender-group">
                                    <div class="hc-gender-btn active" data-gender="male" onclick="window.HOST_CLUB.selectGender('male')">🕴️ 男夜寮</div>
                                    <div class="hc-gender-btn" data-gender="female" onclick="window.HOST_CLUB.selectGender('female')">💃 女夜寮</div>
                                </div>
                            </div>

                            <div class="hc-form-group">
                                <label class="hc-form-label">喜好類型 / PREFERENCE</label>
                                <input type="text" class="hc-form-input" id="nightliao-type" placeholder="例如：S系、溫柔系...">
                            </div>

                            <div class="hc-form-group">
                                <label class="hc-form-label">備註 / NOTES</label>
                                <textarea class="hc-form-textarea" id="nightliao-notes" placeholder="特殊要求..."></textarea>
                            </div>

                            <div class="hc-form-group">
                                <label class="hc-form-label">會員等級 / TIER</label>
                                <div class="hc-tier-group">
                                    <div class="hc-tier-card active" data-tier="normal" onclick="window.HOST_CLUB.selectTier('normal')">
                                        <div class="hc-tier-name">🎫 普通會員</div>
                                        <div class="hc-tier-desc">基礎服務，4位隨機人選</div>
                                    </div>
                                    <div class="hc-tier-card" data-tier="vip" onclick="window.HOST_CLUB.selectTier('vip')">
                                        <div class="hc-tier-name">💎 VIP會員</div>
                                        <div class="hc-tier-desc">優先篩選，更符合喜好</div>
                                    </div>
                                    <div class="hc-tier-card" data-tier="hidden" onclick="window.HOST_CLUB.selectTier('hidden')">
                                        <div class="hc-tier-name">👑 隱藏VIP</div>
                                        <div class="hc-tier-desc">最頂級服務，神秘人選</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="hc-custom-footer">
                            <button class="hc-custom-submit" onclick="window.HOST_CLUB.confirmCustomRecruit()">確認招募 / CONFIRM</button>
                            <button class="hc-custom-cancel" onclick="window.HOST_CLUB.closeCustomPanel()">取消</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function renderGrid() {
        const grid = document.getElementById('hc-grid-area');
        if (!grid) return;

        if (STATE.isProcessing) {
            grid.innerHTML = `<div class="hc-status-box" style="grid-column: 1 / -1;"><div class="hc-spinner"></div><div>正在聯繫候選人...</div></div>`;
            return;
        }

        if (!STATE.hosts || STATE.hosts.length === 0) {
            grid.innerHTML = `<div class="hc-status-box" style="grid-column: 1 / -1;"><div style="font-size:30px">🍸</div><div>目前沒有人員名單<br>請點擊上方「招募新人」</div></div>`;
            return;
        }

        grid.innerHTML = STATE.hosts.map((host, idx) => `
            <div class="hc-card" onclick="window.HOST_CLUB.openDetail(${idx})">
                <img id="host-img-${idx}" src="${host.avatarUrl}" class="hc-card-img" loading="lazy">
                <div class="hc-card-info">
                    <div class="hc-card-role">${host.title || 'HOST'}</div>
                    <div class="hc-card-name">${host.name}</div>
                    <div class="hc-card-price">💎 ${host.price || '$$$'}</div>
                    ${host.serviceType ? `<div class="hc-card-service" style="font-size:10px; color:#999; margin-top:4px;">${host.serviceType} · 可妥協 ${host.flexibility || 0}%</div>` : ''}
                </div>
            </div>
        `).join('');
    }

    function switchMode(mode) {
        STATE.mode = mode;
        document.querySelectorAll('.hc-tab-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`tab-${mode}`).classList.add('active');
        STATE.hosts = []; 
        renderGrid();
    }

    function handleRecruit() {
        if (STATE.mode === 'nightliao') openCustomPanel();
        else fetchRecruit(STATE.mode);
    }

    function openCustomPanel() {
        const overlay = document.getElementById('hc-custom-overlay');
        if (overlay) {
            STATE.customParams = { gender: 'male', type: '', notes: '', tier: 'normal' };
            document.querySelectorAll('.hc-gender-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelector('[data-gender="male"]').classList.add('active');
            document.querySelectorAll('.hc-tier-card').forEach(card => card.classList.remove('active'));
            document.querySelector('[data-tier="normal"]').classList.add('active');
            document.getElementById('nightliao-type').value = '';
            document.getElementById('nightliao-notes').value = '';
            overlay.classList.add('active');
        }
    }

    function closeCustomPanel() {
        document.getElementById('hc-custom-overlay').classList.remove('active');
    }

    function selectGender(gender) {
        STATE.customParams.gender = gender;
        document.querySelectorAll('.hc-gender-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`[data-gender="${gender}"]`).classList.add('active');
    }

    function selectTier(tier) {
        STATE.customParams.tier = tier;
        document.querySelectorAll('.hc-tier-card').forEach(card => card.classList.remove('active'));
        document.querySelector(`[data-tier="${tier}"]`).classList.add('active');
    }

    function confirmCustomRecruit() {
        STATE.customParams.type = document.getElementById('nightliao-type').value.trim();
        STATE.customParams.notes = document.getElementById('nightliao-notes').value.trim();
        closeCustomPanel();
        fetchRecruit('nightliao', STATE.customParams);
    }

    function setLoading(isLoading) {
        STATE.isProcessing = isLoading;
        const btn = document.getElementById('btn-recruit');
        if (btn) btn.disabled = isLoading;
        renderGrid();
    }

    function openDetail(idx) {
        const host = STATE.hosts[idx];
        STATE.selectedHost = host;
        
        const wallet = getWalletInfo();
        const canAfford = wallet.balance >= host.price;
        
        const modal = document.getElementById('hc-modal');
        const img = document.getElementById('modal-img');
        const body = document.getElementById('modal-body');
        const btnConfirm = document.getElementById('btn-confirm');

        img.src = host.avatarUrl;

        // 構建秘密檔案 HTML
        let secretHtml = '';
        const hasSecrets = (host.fetishes && host.fetishes.length) || (host.taboos && host.taboos.length) || host.background || host.serviceType || host.flexibility !== undefined;
        if (hasSecrets) {
            secretHtml = `<div class="hc-secret-panel" id="secret-panel">`;
            if (host.background) {
                secretHtml += `<div class="hc-secret-title">📖 入職背景</div><div class="hc-secret-text">${host.background}</div>`;
            }
            if (host.serviceType || host.flexibility !== undefined) {
                secretHtml += `<div class="hc-secret-title">💼 營業資訊</div><div class="hc-secret-text">`;
                if (host.serviceType) {
                    secretHtml += `<div style="margin-bottom:6px;"><strong>營業類型：</strong>${host.serviceType}</div>`;
                }
                if (host.flexibility !== undefined) {
                    secretHtml += `<div><strong>可妥協度：</strong>${host.flexibility}%</div>`;
                }
                secretHtml += `</div>`;
            }
            if (host.fetishes && host.fetishes.length) {
                secretHtml += `<div class="hc-secret-title">♥ SECRET XP</div><ul class="hc-secret-list">${host.fetishes.map(x=>`<li>${x}</li>`).join('')}</ul>`;
            }
            if (host.taboos && host.taboos.length) {
                secretHtml += `<div class="hc-secret-title hc-taboo-title">✖ TABOOS</div><ul class="hc-secret-list hc-taboo-list">${host.taboos.map(x=>`<li>${x}</li>`).join('')}</ul>`;
            }
            secretHtml += `</div>`;
        } else {
            secretHtml = `<div class="hc-secret-panel" id="secret-panel" style="text-align:center; color:#666; padding:10px;">(此人隱藏極深，暫無情報)</div>`;
        }

        body.innerHTML = `
            <div class="hc-name-row">
                <div class="hc-detail-name">${host.name} <span style="font-size:12px; color:#666;">${host.age}歲</span></div>
                <div class="hc-heart-btn" onclick="window.HOST_CLUB.toggleSecret()" title="查看秘密檔案">♥</div>
            </div>
            ${secretHtml}
            <div class="hc-detail-quote">"${host.greeting || '...'}"</div>
            <div class="hc-desc-p">${host.desc}</div>
            <div class="hc-attrs">
                <div class="hc-attr-box"><span class="hc-attr-label">TITLE</span><span class="hc-attr-val">${host.title}</span></div>
                <div class="hc-attr-box"><span class="hc-attr-label">PRICE</span><span class="hc-attr-val" style="color:var(--hc-gold);">$${host.price}</span></div>
                <div class="hc-attr-box"><span class="hc-attr-label">SPECIALTY</span><span class="hc-attr-val">${host.specialty}</span></div>
                <div class="hc-attr-box"><span class="hc-attr-label">PERSONALITY</span><span class="hc-attr-val">${host.personality}</span></div>
                ${host.serviceType ? `<div class="hc-attr-box"><span class="hc-attr-label">營業類型</span><span class="hc-attr-val" style="color:var(--hc-pink);">${host.serviceType}</span></div>` : ''}
                ${host.flexibility !== undefined ? `<div class="hc-attr-box"><span class="hc-attr-label">可妥協</span><span class="hc-attr-val" style="color:var(--hc-pink);">${host.flexibility}%</span></div>` : ''}
            </div>
            <div class="hc-mode-selector">
                <div class="hc-mode-opt ${STATE.selectedMode === 'VN格式' ? 'active' : ''}" id="mode-vn" onclick="window.HOST_CLUB.selectMode('vn')">VN 模式</div>
                <div class="hc-mode-opt ${STATE.selectedMode === 'novel' ? 'active' : ''}" id="mode-novel" onclick="window.HOST_CLUB.selectMode('novel')">小說模式</div>
            </div>
            <div style="text-align:right; font-size:11px; color:#666; margin-top:5px;">當前餘額: $${wallet.balance}</div>
        `;

        if (!canAfford) {
            btnConfirm.innerText = "餘額不足";
            btnConfirm.disabled = true;
        } else {
            btnConfirm.innerText = `指名 ($-${host.price})`;
            btnConfirm.disabled = false;
        }

        modal.classList.add('active');
    }

    function toggleSecret() {
        const panel = document.getElementById('secret-panel');
        if (panel) {
            panel.style.display = getComputedStyle(panel).display === 'none' ? 'block' : 'none';
        }
    }

    function selectMode(mode) {
        STATE.selectedMode = mode;
        const btnVn = document.getElementById('mode-vn');
        const btnNovel = document.getElementById('mode-novel');
        if (btnVn && btnNovel) {
            btnVn.classList.toggle('active', mode === 'VN格式');
            btnNovel.classList.toggle('active', mode === 'novel');
        }
    }

    // 🔥 確認指名 (含經濟扣款)
    async function confirmHost() {
        if (!STATE.selectedHost) return;
        const host = STATE.selectedHost;
        const wallet = getWalletInfo();

        if (wallet.balance < host.price) {
            alert('餘額不足！');
            return;
        }

        if (confirm(`確定支付 $${host.price} 指名 ${host.name} 嗎？`)) {
            // 1. 扣款
            wallet.transaction(-host.price, `指名費: ${host.name}`);
            
            // 2. 構建系統指令
            let chineseName = host.name.split('(')[0].trim();
            const fetishes = (host.fetishes && host.fetishes.length) ? host.fetishes.join(', ') : '未知';
            const taboos = (host.taboos && host.taboos.length) ? host.taboos.join(', ') : '未知';
            const background = host.background || '未知';
            const serviceType = host.serviceType || '未知';
            const flexibility = host.flexibility !== undefined ? `${host.flexibility}%` : '未知';

            const systemInstruction = `[System Command: Host Club Request]
用戶在「不夜城」APP 中指名了以下角色：
姓名：${chineseName}
身份：${host.title}
外貌：${host.desc}
性格：${host.personality}
特長：${host.specialty}
價格：${host.price}

【私密檔案 (玩家已知)】
入職背景：${background}
營業類型：${serviceType} (上下位關係，用於男夜寮的方位區分。上位=主導方，下位=被動方，雙向=可接受兩種角色。這是針對男夜寮的重要屬性，用於區分服務方位，妥協度代表如與用戶相撞類型將可依據接受值調整)
可妥協度：${flexibility} (數字 0-100，表示對反向需求的接受程度，超50後代表可妥協，0表示完全不接受，100表示完全接受)
性癖/XP：${fetishes}
雷點/禁忌：${taboos}
(請在互動中適當體現這些特點，若玩家觸碰禁忌則反應劇烈，若觸發XP則更加興奮。入職背景是這個角色來到不夜城的原因和故事，可以在對話中自然地提及或暗示。營業類型是上下位關係：上位表示主導方，下位表示被動方，雙向表示可以接受兩種角色，這是針對男夜寮的方位區分，請根據這個屬性調整角色的服務風格和互動方式。可妥協度表示對反向需求的接受程度：0-50表示不太願意接受反向需求，超過50表示可以妥協接受反向需求，請根據這個數值調整角色對反向需求的反應)

請立刻扮演 ${chineseName} 進入包廂與 {{user}} 互動。
場景：高級俱樂部 VIP 包廂，燈光昏暗，氣氛曖昧。
模式：${STATE.selectedMode}`;

            if (win.TavernHelper) {
                await win.TavernHelper.createChatMessages([
                    { role: 'user', name: 'System', message: systemInstruction }
                ], { refresh: true });
                
                if (win.PhoneSystem) win.PhoneSystem.goHome();
            }
            
            closeModal();
        }
    }

    function closeModal() {
        document.getElementById('hc-modal').classList.remove('active');
        STATE.selectedHost = null;
    }

    function clearData() {
        STATE.hosts = [];
        renderGrid();
    }

    // 導出
    win.HOST_CLUB = {
        launch,
        switchMode,
        handleRecruit,
        openDetail,
        closeModal,
        confirmHost,
        clearData,
        toggleSecret,
        selectMode,
        openCustomPanel,
        closeCustomPanel,
        selectGender,
        selectTier,
        confirmCustomRecruit
    };

})();