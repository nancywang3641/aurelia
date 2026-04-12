// ----------------------------------------------------------------
// [檔案] pet_home.js (V5.8 - Fix Double Message)
// 路徑：os_phone/pet/pet_home.js
// 職責：
// 1. [修復] 解決用戶發言重複發送給 AI 的問題 (Double Entry Bug)。
// 2. [保留] V5.7 的離線生活模擬、長敘事 Prompt、去背功能。
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入寵物家 (V5.8 Fix Double Msg)...');
    const win = window.parent || window;

    // 定義樣式
    const homeStyle = `
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Lato:wght@300;400;700&display=swap');
        :root { --ph-royal: #112250; --ph-sapphire: #3C507D; --ph-gold: #E0C58F; --ph-text: #F5F0E9; --ph-vn-bg: rgba(10, 15, 30, 0.85); --ph-danger: #ff4757; }
        .ph-container { width: 100%; height: 100%; background: linear-gradient(180deg, var(--ph-royal) 0%, #000 100%); color: var(--ph-text); font-family: 'Lato', sans-serif; display: flex; flex-direction: column; overflow: hidden; position: relative; }
        
        /* Header */
        .ph-header { position: absolute; top: 0; left: 0; width: 100%; padding: 15px; display: flex; justify-content: space-between; align-items: flex-start; z-index: 20; box-sizing: border-box; pointer-events: none; }
        .ph-btn-icon { pointer-events: auto; background: rgba(0,0,0,0.4); border: 1px solid var(--ph-gold); color: var(--ph-gold); width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.3s; backdrop-filter: blur(4px); font-size: 14px; }
        .ph-btn-icon:hover { background: var(--ph-gold); color: var(--ph-royal); }
        .ph-btn-heart { border-color: #ff6b6b; color: #ff6b6b; }
        .ph-btn-heart:hover { background: #ff6b6b; color: #fff; }
        .ph-btn-settings { border-color: var(--ph-gold); color: var(--ph-gold); }
        .ph-btn-settings:hover { background: var(--ph-gold); color: var(--ph-royal); }
        
        /* List View */
        .ph-list-view { flex: 1; padding: 60px 20px 20px 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 15px; }
        .ph-list-title { text-align: center; font-family: 'Cinzel', serif; font-size: 18px; color: var(--ph-gold); margin-bottom: 10px; text-shadow: 0 2px 10px rgba(0,0,0,0.5); }
        .ph-pet-card { background: rgba(255,255,255,0.05); border: 1px solid rgba(224, 197, 143, 0.2); border-radius: 12px; padding: 10px; display: flex; align-items: center; gap: 15px; transition: 0.2s; position: relative; overflow: hidden; }
        .ph-pet-card:hover { background: rgba(255,255,255,0.1); border-color: var(--ph-gold); transform: translateY(-2px); }
        .ph-card-img { width: 60px; height: 60px; object-fit: cover; border-radius: 8px; background: #000; border: 1px solid #444; }
        .ph-card-info { flex: 1; }
        .ph-card-name { font-family: 'Cinzel', serif; font-weight: bold; color: #fff; font-size: 14px; }
        .ph-card-type { font-size: 10px; color: var(--ph-gold); text-transform: uppercase; margin-bottom: 4px; }
        .ph-card-stats { display: flex; gap: 8px; font-size: 10px; color: #aaa; }
        .ph-card-actions { display: flex; flex-direction: column; gap: 5px; min-width: 60px; }
        .ph-btn-enter { background: var(--ph-gold); color: var(--ph-royal); border: none; padding: 5px; border-radius: 4px; font-size: 10px; font-weight: bold; cursor: pointer; }
        .ph-btn-banish { background: transparent; border: 1px solid var(--ph-danger); color: var(--ph-danger); padding: 5px; border-radius: 4px; font-size: 10px; cursor: pointer; transition: 0.2s; }
        .ph-btn-banish:hover { background: var(--ph-danger); color: white; }

        /* Room View */
        .ph-stage { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; padding-bottom: 120px; }
        .ph-pet-avatar { 
            width: 300px; height: 300px; 
            border-radius: 0; object-fit: contain; border: none; 
            filter: drop-shadow(0 0 15px rgba(224, 197, 143, 0.4)); 
            animation: ph-breath 4s ease-in-out infinite; 
            background: transparent; cursor: pointer; transition: 0.3s; 
        }
        .ph-pet-avatar:active { transform: scale(0.95); filter: brightness(1.2) drop-shadow(0 0 20px rgba(224, 197, 143, 0.8)); }
        @keyframes ph-breath { 0% { transform: scale(1); } 50% { transform: scale(1.02); } 100% { transform: scale(1); } }
        
        .ph-vn-wrapper { position: absolute; bottom: 60px; left: 10px; right: 10px; z-index: 15; }
        .ph-vn-box { background: var(--ph-vn-bg); border: 1px solid var(--ph-gold); border-radius: 12px; padding: 18px 15px 10px 15px; min-height: 85px; box-shadow: 0 5px 20px rgba(0,0,0,0.5); backdrop-filter: blur(5px); position: relative; }
        .ph-vn-name-tag { position: absolute; top: -14px; left: 15px; background: var(--ph-gold); color: var(--ph-royal); padding: 2px 12px; border-radius: 4px; font-family: 'Cinzel', serif; font-weight: bold; font-size: 12px; box-shadow: 0 2px 5px rgba(0,0,0,0.3); }
        .ph-vn-text { font-size: 13px; line-height: 1.5; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.8); }
        
        .ph-bottom-bar { position: absolute; bottom: 0; left: 0; width: 100%; height: 50px; background: #111; border-top: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; padding: 0 10px; z-index: 20; box-sizing: border-box; gap: 10px; }
        .ph-action-btn { background: transparent; border: none; color: var(--ph-gold); font-size: 20px; cursor: pointer; padding: 5px; transition: 0.2s; }
        .ph-action-btn:hover { transform: scale(1.1); text-shadow: 0 0 5px var(--ph-gold); }
        .ph-input-box { flex: 1; position: relative; display: flex; align-items: center; }
        .ph-input { width: 100%; background: #222; border: 1px solid #444; color: #fff; padding: 8px 35px 8px 12px; border-radius: 20px; font-size: 12px; outline: none; }
        .ph-send-btn { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); width: 24px; height: 24px; background: var(--ph-gold); border-radius: 50%; border: none; color: var(--ph-royal); font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 12px; }
        
        /* Overlays & Panels */
        .ph-overlay { position: absolute; bottom: 0; left: 0; width: 100%; height: 60%; background: #151520; border-top: 2px solid var(--ph-gold); border-radius: 20px 20px 0 0; z-index: 50; transform: translateY(110%); transition: transform 0.3s cubic-bezier(0.33, 1, 0.68, 1); display: flex; flex-direction: column; box-shadow: 0 -10px 50px rgba(0,0,0,0.8); }
        .ph-overlay.active { transform: translateY(0); } .ph-overlay.full { height: 100%; border-radius: 0; }
        .ph-ov-header { padding: 12px 20px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.2); }
        .ph-ov-title { color: var(--ph-gold); font-family: 'Cinzel', serif; font-weight: bold; }
        .ph-ov-close { cursor: pointer; color: #666; }
        .ph-ov-actions { display: flex; gap: 10px; align-items: center; }
        .ph-btn-clear { background: transparent; border: 1px solid #fa5151; color: #fa5151; padding: 4px 12px; border-radius: 4px; font-size: 11px; cursor: pointer; transition: 0.2s; font-family: 'Cinzel', serif; }
        .ph-btn-clear:hover { background: #fa5151; color: #fff; }
        .ph-ov-content { flex: 1; overflow-y: auto; padding: 15px; }
        .ph-inv-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
        .ph-inv-item { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 8px; text-align: center; cursor: pointer; position: relative; transition: 0.2s; }
        .ph-inv-item:hover { border-color: var(--ph-gold); background: rgba(255,255,255,0.1); }
        .ph-inv-icon { font-size: 24px; display: block; margin-bottom: 4px; }
        .ph-inv-count { position: absolute; top: 2px; right: 2px; background: var(--ph-gold); color: var(--ph-royal); font-size: 9px; padding: 1px 4px; border-radius: 8px; }
        .ph-inv-name { font-size: 9px; color: #ccc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ph-hist-msg { margin-bottom: 12px; font-size: 13px; line-height: 1.4; display: flex; align-items: flex-start; gap: 10px; }
        .ph-hist-checkbox { margin-top: 2px; cursor: pointer; width: 18px; height: 18px; flex-shrink: 0; accent-color: var(--ph-gold); }
        .ph-hist-content { flex: 1; }
        .ph-hist-user { color: #aaa; font-size: 11px; margin-bottom: 2px; }
        .ph-hist-ai { color: var(--ph-gold); font-size: 11px; margin-bottom: 2px; }
        .ph-hist-text { background: rgba(255,255,255,0.05); padding: 8px 12px; border-radius: 8px; }
        .ph-hist-select-actions { display: flex; gap: 8px; align-items: center; }
        .ph-btn-select-all { background: transparent; border: 1px solid var(--ph-gold); color: var(--ph-gold); padding: 4px 10px; border-radius: 4px; font-size: 11px; cursor: pointer; transition: 0.2s; font-family: 'Cinzel', serif; }
        .ph-btn-select-all:hover { background: var(--ph-gold); color: var(--ph-royal); }
        .ph-btn-delete-selected { background: transparent; border: 1px solid #fa5151; color: #fa5151; padding: 4px 10px; border-radius: 4px; font-size: 11px; cursor: pointer; transition: 0.2s; font-family: 'Cinzel', serif; }
        .ph-btn-delete-selected:hover { background: #fa5151; color: #fff; }
        .ph-btn-delete-selected:disabled { opacity: 0.5; cursor: not-allowed; }
        .ph-hist-tabs { display: flex; gap: 0; border-bottom: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.2); }
        .ph-hist-tab { flex: 1; padding: 10px; text-align: center; cursor: pointer; color: #666; font-size: 12px; transition: 0.2s; border-bottom: 2px solid transparent; }
        .ph-hist-tab.active { color: var(--ph-gold); border-bottom-color: var(--ph-gold); }
        .ph-hist-tab-content { display: none; }
        .ph-hist-tab-content.active { display: block; }
        .ph-empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #888; text-align: center; }
        .ph-btn-go-shop { background: var(--ph-gold); color: var(--ph-royal); border: none; padding: 8px 20px; border-radius: 20px; font-weight: bold; cursor: pointer; margin-top: 15px; }
        
        /* Info Panel */
        .ph-info-panel { background: rgba(20, 25, 40, 0.98); padding: 20px; border: 1px solid var(--ph-gold); border-radius: 12px; width: 80%; max-width: 300px; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) scale(0.9); opacity: 0; pointer-events: none; transition: 0.3s; z-index: 100; box-shadow: 0 20px 50px rgba(0,0,0,0.8); }
        .ph-info-panel.active { transform: translate(-50%, -50%) scale(1); opacity: 1; pointer-events: auto; }
        .ph-info-row { margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px; display: flex; flex-direction: column; }
        .ph-info-label { font-size: 10px; color: var(--ph-gold); text-transform: uppercase; font-weight: bold; margin-bottom: 6px; }
        .ph-info-val { font-size: 13px; color: #eee; line-height: 1.5; text-align: left; }
        .ph-info-close { position: absolute; top: 10px; right: 10px; color: #666; cursor: pointer; font-size: 18px; }
        .ph-info-close:hover { color: #fff; }

        /* 設置面板 & 房間設置 */
        .ph-settings-panel { background: rgba(20, 25, 40, 0.95); padding: 20px; border: 1px solid var(--ph-gold); border-radius: 12px; width: 85%; max-width: 400px; max-height: 60vh; overflow-y: auto; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) scale(0.9); opacity: 0; pointer-events: none; transition: 0.3s; z-index: 100; box-shadow: 0 20px 50px rgba(0,0,0,0.8); }
        .ph-settings-panel.active { transform: translate(-50%, -50%) scale(1); opacity: 1; pointer-events: auto; }
        .ph-settings-panel::-webkit-scrollbar { width: 6px; }
        .ph-settings-panel::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); border-radius: 3px; }
        .ph-settings-panel::-webkit-scrollbar-thumb { background: rgba(224, 197, 143, 0.5); border-radius: 3px; }
        .ph-settings-panel::-webkit-scrollbar-thumb:hover { background: rgba(224, 197, 143, 0.8); }
        .ph-settings-close { position: absolute; top: 10px; right: 10px; color: #666; cursor: pointer; font-size: 18px; }
        .ph-settings-title { text-align: center; color: var(--ph-gold); font-family: 'Cinzel', serif; font-weight: bold; font-size: 16px; margin-bottom: 15px; }
        .ph-bg-upload-area, .ph-pet-img-upload-area { border: 2px dashed rgba(224, 197, 143, 0.5); border-radius: 8px; padding: 15px; text-align: center; cursor: pointer; transition: 0.2s; margin-bottom: 15px; background: rgba(0,0,0,0.2); }
        .ph-bg-upload-area:hover, .ph-pet-img-upload-area:hover { border-color: var(--ph-gold); background: rgba(224, 197, 143, 0.1); }
        #ph-bg-file-input, #ph-pet-img-file-input { display: none; }
        .ph-bg-current { margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); }
        .ph-bg-current-label { color: var(--ph-gold); font-size: 12px; margin-bottom: 10px; text-transform: uppercase; }
        .ph-bg-preview { width: 100%; aspect-ratio: 16/9; border-radius: 8px; border: 2px solid var(--ph-gold); overflow: hidden; background: #222; position: relative; }
        .ph-bg-preview img { width: 100%; height: 100%; object-fit: cover; }
        .ph-bg-preview-none { display: flex; align-items: center; justify-content: center; color: #666; font-size: 12px; height: 100%; }
        .ph-bg-remove-btn { margin-top: 10px; width: 100%; background: transparent; border: 1px solid #fa5151; color: #fa5151; padding: 8px; border-radius: 4px; font-size: 12px; cursor: pointer; transition: 0.2s; }
        .ph-btn-magic { width: 100%; margin-top: 8px; padding: 10px; background: linear-gradient(135deg, rgba(138, 43, 226, 0.3), rgba(75, 0, 130, 0.3)); border: 1px solid rgba(138, 43, 226, 0.5); color: #e0b0ff; border-radius: 8px; font-size: 12px; font-weight: bold; cursor: pointer; transition: 0.2s; }
        .ph-btn-download { width: 100%; margin-top: 8px; padding: 10px; background: linear-gradient(135deg, rgba(59, 130, 246, 0.3), rgba(37, 99, 235, 0.3)); border: 1px solid rgba(59, 130, 246, 0.5); color: #93c5fd; border-radius: 8px; font-size: 12px; font-weight: bold; cursor: pointer; transition: 0.2s; }
        .ph-btn-regenerate { width: 100%; margin-top: 8px; padding: 10px; background: linear-gradient(135deg, rgba(255, 193, 7, 0.3), rgba(255, 152, 0, 0.3)); border: 1px solid rgba(255, 193, 7, 0.5); color: #ffd54f; border-radius: 8px; font-size: 12px; font-weight: bold; cursor: pointer; transition: 0.2s; }
        .ph-btn-copy { width: 100%; margin-top: 8px; padding: 10px; background: linear-gradient(135deg, rgba(156, 39, 176, 0.3), rgba(123, 31, 162, 0.3)); border: 1px solid rgba(156, 39, 176, 0.5); color: #ce93d8; border-radius: 8px; font-size: 12px; font-weight: bold; cursor: pointer; transition: 0.2s; }

        /* 隨機事件設置與彈窗 */
        .ph-form-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px; }
        .ph-form-label { color: #ccc; font-size: 13px; }
        .ph-form-input { background: #222; border: 1px solid #444; color: #fff; padding: 5px; border-radius: 4px; width: 60px; text-align: center; }
        .ph-toggle-switch { position: relative; width: 40px; height: 20px; }
        .ph-toggle-switch input { opacity: 0; width: 0; height: 0; }
        .ph-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #444; transition: .4s; border-radius: 20px; }
        .ph-slider:before { position: absolute; content: ""; height: 14px; width: 14px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; }
        input:checked + .ph-slider { background-color: var(--ph-gold); }
        input:checked + .ph-slider:before { transform: translateX(20px); }
        
        .ph-event-modal { background: rgba(20, 25, 40, 0.98); border: 1px solid var(--ph-gold); border-radius: 16px; padding: 25px; width: 85%; max-width: 350px; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) scale(0.9); opacity: 0; pointer-events: none; transition: 0.3s; z-index: 200; box-shadow: 0 0 50px rgba(0,0,0,0.8); text-align: center; }
        .ph-event-modal.active { transform: translate(-50%, -50%) scale(1); opacity: 1; pointer-events: auto; }
        .ph-event-actors { display: flex; justify-content: center; gap: 20px; margin-bottom: 20px; }
        .ph-event-actor-img { width: 60px; height: 60px; border-radius: 50%; border: 2px solid var(--ph-gold); object-fit: cover; background: #000; }
        .ph-event-content { font-size: 13px; line-height: 1.6; color: #eee; background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; margin-bottom: 20px; text-align: left; white-space: pre-wrap; word-wrap: break-word; max-height: 300px; overflow-y: auto; }
        .ph-btn-nice { background: var(--ph-gold); color: var(--ph-royal); border: none; padding: 8px 30px; border-radius: 20px; font-weight: bold; cursor: pointer; font-family: 'Cinzel', serif; }

        /* 日誌列表樣式 */
        .ph-log-item { background: rgba(255,255,255,0.05); padding: 12px; margin-bottom: 10px; border-radius: 8px; border-left: 3px solid var(--ph-gold); position: relative; }
        .ph-log-time { font-size: 9px; color: #888; margin-bottom: 4px; }
        .ph-log-content { font-size: 12px; line-height: 1.4; color: #ddd; }
        .ph-log-avatars { position: absolute; top: 8px; right: 8px; display: flex; gap: -5px; }
        .ph-log-mini-img { width: 20px; height: 20px; border-radius: 50%; border: 1px solid #000; object-fit: cover; margin-left: -8px; }
    `;

    const doc = window.parent.document || document;
    if (!doc.getElementById('pet-home-css')) {
        const s = doc.createElement('style'); s.id = 'pet-home-css'; s.innerHTML = homeStyle; doc.head.appendChild(s);
    }

    // 全局狀態
    let STATE = { 
        pets: [], 
        currentPetId: null, 
        currentView: 'list', 
        container: null, 
        typingTimer: null,
        deleteMode: false, // 刪除模式開關
        eventSettings: {
            enabled: true,
            chance: 30, // %
            maxDaily: 3,
            dailyCount: 0,
            lastDate: "",
            timeAware: false, // 時間感知開關
            lastVisitTime: 0
        }
    };

    // --- 數據加載區 ---

    async function loadPets() {
        if (!win.OS_DB) {
            renderError("OS_DB 未載入，請刷新頁面");
            return;
        }
        try {
            const list = await win.OS_DB.getAllPets();
            STATE.pets = list || [];
            
            // 初始化寵物的最後訪問時間和聊天時間（如果不存在）
            STATE.pets.forEach(pet => {
                let needSave = false;
                if (!pet.lastVisitTime) {
                    pet.lastVisitTime = Date.now();
                    needSave = true;
                }
                if (!pet.lastChatTime) {
                    pet.lastChatTime = Date.now();
                    needSave = true;
                }
                if (needSave && win.OS_DB && win.OS_DB.savePet) {
                    win.OS_DB.savePet(pet).catch(e => console.warn('初始化時間失敗:', e));
                }
            });
            
            loadEventSettings();

            if (STATE.pets.length > 0) {
                STATE.currentView = 'list';
                renderPetList();
                
                // 1. 檢查離線事件 (優先)
                await checkTimeSkipEvent();
                
                // 2. 檢查隨機事件
                checkRandomEvent();
            } else {
                renderEmptyUI();
            }
            
            // 更新最後訪問時間
            updateLastVisit();

        } catch(e) { 
            console.error("Load pets error:", e);
            renderError(`<div style="font-size:30px; margin-bottom:10px;">⚠️</div><div>資料庫錯誤</div>`);
        }
    }

    function loadEventSettings() {
        const raw = localStorage.getItem('ph_event_settings');
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                STATE.eventSettings = { ...STATE.eventSettings, ...parsed };
                const today = new Date().toDateString();
                if (STATE.eventSettings.lastDate !== today) {
                    STATE.eventSettings.dailyCount = 0;
                    STATE.eventSettings.lastDate = today;
                    saveEventSettings();
                }
            } catch(e) {}
        }
    }

    function saveEventSettings() {
        localStorage.setItem('ph_event_settings', JSON.stringify(STATE.eventSettings));
    }
    
    function updateLastVisit() {
        STATE.eventSettings.lastVisitTime = Date.now();
        saveEventSettings();
    }

    function renderError(msgHtml) {
        if (!STATE.container) return;
        STATE.container.innerHTML = `
            <div class="ph-header"><button class="ph-btn-icon" onclick="window.PhoneSystem.goHome()">❮</button></div>
            <div class="ph-empty-state">${msgHtml}</div>
        `;
    }

    function getCurrentPet() { return STATE.pets.find(p => p.id === STATE.currentPetId); }

    async function saveCurrentPet() {
        const pet = getCurrentPet();
        if (!pet || !win.OS_DB) return;
        const idx = STATE.pets.findIndex(p => p.id === pet.id);
        if (idx !== -1) STATE.pets[idx] = pet;
        try { await win.OS_DB.savePet(pet); } catch(e) {}
        updateBars();
    }

    // --- 🔥 離線生活模擬 (Time Skip) ---
    async function checkTimeSkipEvent() {
        if (!STATE.eventSettings.enabled) return;
        if (STATE.pets.length < 1) return;
        
        const now = Date.now();
        const last = STATE.eventSettings.lastVisitTime || now;
        const diffMinutes = (now - last) / (1000 * 60); // 分鐘數
        
        // 設定閾值：例如 30 分鐘
        if (diffMinutes < 30) return;

        console.log(`[PetHome] 檢測到長時間離開 (${Math.floor(diffMinutes)}分)，觸發離線事件...`);
        
        // 隨機選一隻或兩隻
        const p1 = STATE.pets[Math.floor(Math.random() * STATE.pets.length)];
        let p2 = null;
        if (STATE.pets.length > 1 && Math.random() > 0.5) {
            p2 = STATE.pets.find(p => p.id !== p1.id);
        }

        // 生成 Prompt
        let prompt = "";
        if (p2) {
            prompt = `User has been away for ${Math.floor(diffMinutes / 60)} hours.
Pet A: ${p1.name} (${p1.type}).
Pet B: ${p2.name} (${p2.type}).
Describe what they did together while the owner was gone (e.g. slept together, made a mess, stared at the door).
Write a descriptive paragraph (80-120 words). Output in Traditional Chinese.`;
        } else {
            const personality = p1.personality || '可愛';
            const behavior = p1.behavior ? `，${p1.behavior}` : '';
            prompt = `User has been away for ${Math.floor(diffMinutes / 60)} hours.
Pet: ${p1.name} (${p1.type}，性格：${personality}${behavior}).
Describe what it did alone while waiting for the owner.
Write a descriptive paragraph (80-120 words). Output in Traditional Chinese.`;
        }

        // [TODO: Standalone API] 功能待接入直連 API
        console.warn('[Pet] AI 功能已停用，等待 Standalone API 整合');
        return;
    }

    // --- 🔥 隨機事件邏輯 (在線) ---

    async function checkRandomEvent() {
        if (!STATE.eventSettings.enabled) return;
        if (STATE.pets.length < 2) return;
        if (STATE.eventSettings.dailyCount >= STATE.eventSettings.maxDaily) return;

        const roll = Math.random() * 100;
        if (roll > STATE.eventSettings.chance) return;

        console.log('[PetHome] 🎉 觸發隨機事件！');
        triggerRandomEvent();
    }

    async function triggerRandomEvent() {
        const shuffled = [...STATE.pets].sort(() => 0.5 - Math.random());
        const p1 = shuffled[0];
        const p2 = shuffled[1];

        // 🔥 使用 os_prompts.js 中的專業 prompt
        let prompt = win.OS_PROMPTS ? win.OS_PROMPTS.get('pet_random_event') : '';
        
        if (!prompt) {
            // 如果 prompt 不存在，使用備用 prompt
            const p1Personality = p1.personality || '可愛';
            const p1Behavior = p1.behavior ? `，${p1.behavior}` : '';
            const p2Personality = p2.personality || '溫和';
            const p2Behavior = p2.behavior ? `，${p2.behavior}` : '';
            prompt = `你是一位擅長描寫寵物互動場景的作家。請根據以下信息，創作一個完整、生動的小短篇故事（150-200字）。

寵物A：${p1.name}（${p1.type}，性格：${p1Personality}${p1Behavior}）
寵物B：${p2.name}（${p2.type}，性格：${p2Personality}${p2Behavior}）

要求：
1. 必須是完整的小故事（有開頭、過程、結尾），不要只寫片段。
2. 明確描述發生了什麼事，誰做了什麼動作，結果如何。
3. 包含具體動作、環境細節、聲音效果、情感表達。
4. 符合每個寵物的性格特徵。
5. 使用繁體中文，直接輸出故事內容。`;
        } else {
            // 替換 prompt 中的變量
            const p1Personality = p1.personality || '可愛';
            const p1Behavior = p1.behavior ? `，${p1.behavior}` : '';
            const p2Personality = p2.personality || '溫和';
            const p2Behavior = p2.behavior ? `，${p2.behavior}` : '';
            prompt = prompt
                .replace(/{{petA_name}}/g, p1.name)
                .replace(/{{petA_type}}/g, p1.type)
                .replace(/{{petA_personality}}/g, `${p1Personality}${p1Behavior}`)
                .replace(/{{petB_name}}/g, p2.name)
                .replace(/{{petB_type}}/g, p2.type)
                .replace(/{{petB_personality}}/g, `${p2Personality}${p2Behavior}`);
        }

        // [TODO: Standalone API] 功能待接入直連 API
        console.warn('[Pet] AI 功能已停用，等待 Standalone API 整合');
        return;
    }

    function showEventModal(p1, p2, text) {
        const root = document.getElementById('ph-root');
        if (!root) return;
        const old = document.getElementById('ph-event-modal');
        if (old) old.remove();

        // 转义 HTML 特殊字符，确保文本完整显示
        const escapeHtml = (str) => {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        };
        
        // 将换行符转换为 <br>，同时保留其他文本
        const escapedText = escapeHtml(text).replace(/\n/g, '<br>');

        const html = `
            <div id="ph-event-modal" class="ph-event-modal active">
                <div style="color:var(--ph-gold); font-family:'Cinzel',serif; font-weight:bold; margin-bottom:15px;">DAILY EVENT</div>
                <div class="ph-event-actors">
                    <img src="${p1.imageUrl}" class="ph-event-actor-img" title="${p1.name}">
                    <div style="font-size:20px; display:flex; align-items:center;">⚡</div>
                    <img src="${p2.imageUrl}" class="ph-event-actor-img" title="${p2.name}">
                </div>
                <div class="ph-event-content">${escapedText}</div>
                <button class="ph-btn-nice" onclick="document.getElementById('ph-event-modal').remove()">NICE!</button>
            </div>
        `;
        root.insertAdjacentHTML('beforeend', html);
    }

    // --- 視圖與聊天 ---

    function enterPetRoom(id) {
        STATE.currentPetId = id;
        STATE.currentView = 'room';
        renderRoomUI();
        
        // 處理離線狀態消耗
        if (win.PET_STATUS) {
            const result = win.PET_STATUS.processOfflineConsumption();
            if (result.consumed && result.offlineMinutes >= 5) {
                const timeStr = win.PET_STATUS.formatOfflineTime(result.offlineMinutes);
                if (win.toastr) {
                    win.toastr.info(`離線 ${timeStr}，狀態已自然消耗`, '', { timeOut: 3000 });
                }
            }
        }
        
        const pet = getCurrentPet();
        if (pet && pet.chatHistory && pet.chatHistory.length > 0) {
            const lastMsg = pet.chatHistory[pet.chatHistory.length - 1];
            if (!lastMsg.isUser) {
                setTimeout(() => {
                    const box = document.getElementById('vn-text-content');
                    if(box) box.innerHTML = lastMsg.text;
                }, 100);
            }
        }
    }

    function goBackToList() {
        // 記錄離開時間
        if (win.PET_STATUS) {
            win.PET_STATUS.recordVisitTime();
        }
        STATE.currentView = 'list';
        STATE.currentPetId = null;
        renderPetList();
    }

    function renderPetList() {
        const root = document.getElementById('ph-root');
        let html = `
            <div class="ph-header">
                <button class="ph-btn-icon" onclick="window.PhoneSystem.goHome()">❮</button>
                <div style="color:var(--ph-gold); font-family:'Cinzel',serif; font-weight:bold;">PET CENTER</div>
                <div style="display:flex; gap:8px;">
                    <button class="ph-btn-icon" onclick="window.PET_HOME.openLogPanel()">📜</button>
                    <button class="ph-btn-icon ph-btn-settings" onclick="window.PET_HOME.openGlobalSettings()">⚙</button>
                </div>
            </div>
            <div class="ph-list-view">
                <div class="ph-list-title">MY PETS (${STATE.pets.length})</div>
        `;

        STATE.pets.forEach(pet => {
            html += `
                <div class="ph-pet-card">
                    <img class="ph-card-img" src="${pet.imageUrl}" onerror="this.src='https://api.dicebear.com/7.x/shapes/svg?seed=${pet.name}'">
                    <div class="ph-card-info">
                        <div class="ph-card-name">${pet.name}</div>
                        <div class="ph-card-type">${pet.type}</div>
                        <div class="ph-card-stats">
                            <span>❤️ ${pet.intimacy || 0}%</span>
                            <span>🍖 ${pet.hunger || 0}%</span>
                        </div>
                    </div>
                    <div class="ph-card-actions">
                        <button class="ph-btn-enter" onclick="window.PET_HOME.enterPetRoom('${pet.id}')">ENTER</button>
                        <button class="ph-btn-banish" onclick="window.PET_HOME.banishPet('${pet.id}')">BANISH</button>
                    </div>
                </div>
            `;
        });

        html += `
                <div style="text-align:center; margin-top:20px;">
                    <button class="ph-btn-go-shop" style="font-size:12px;" onclick="window.PET_HOME.openPetShop()">+ 領養新寵物</button>
                </div>
            </div>
            
            <div id="ph-global-settings" class="ph-settings-panel">
                <div class="ph-settings-close" onclick="window.PET_HOME.closeOverlay('global')">✕</div>
                <div class="ph-settings-title">全局設置</div>
                <div style="border-bottom: 1px solid rgba(224,197,143,0.2); margin: 15px 0; padding-bottom: 15px;">
                    <div style="font-size: 12px; color: var(--ph-gold); font-weight: bold; margin-bottom: 10px;">隨機事件設置</div>
                    <div class="ph-form-row">
                        <span class="ph-form-label">開啟隨機事件</span>
                        <label class="ph-toggle-switch"><input type="checkbox" id="set-event-enable" ${STATE.eventSettings.enabled ? 'checked' : ''} onchange="window.PET_HOME.saveGlobalSettings()"><span class="ph-slider"></span></label>
                    </div>
                    <div class="ph-form-row">
                        <span class="ph-form-label">觸發機率 (%)</span>
                        <input type="number" id="set-event-chance" class="ph-form-input" value="${STATE.eventSettings.chance}" min="0" max="100" onchange="window.PET_HOME.saveGlobalSettings()">
                    </div>
                    <div class="ph-form-row">
                        <span class="ph-form-label">每日上限 (次)</span>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <input type="number" id="set-event-max" class="ph-form-input" value="${STATE.eventSettings.maxDaily}" min="1" max="10" onchange="window.PET_HOME.saveGlobalSettings()">
                            <span id="ph-daily-count-display" style="font-size: 11px; color: #aaa;">已使用：${STATE.eventSettings.dailyCount || 0}/${STATE.eventSettings.maxDaily}</span>
                        </div>
                    </div>
                </div>
                <div>
                    <div style="font-size: 12px; color: var(--ph-gold); font-weight: bold; margin-bottom: 10px;">時間感知</div>
                    <div class="ph-form-row">
                        <span class="ph-form-label">開啟時間感知</span>
                        <label class="ph-toggle-switch"><input type="checkbox" id="set-time-aware" ${STATE.eventSettings.timeAware ? 'checked' : ''} onchange="window.PET_HOME.saveGlobalSettings()"><span class="ph-slider"></span></label>
                    </div>
                    <div style="font-size: 11px; color: #999; margin-top: 5px; line-height: 1.4;">開啟後，AI會感知當前時間，可以根據時間做出不同反應（如：早上問好、晚上想睡覺等）</div>
                </div>
            </div>

            <div id="ph-log-panel" class="ph-overlay full">
                <div class="ph-ov-header">
                    <div class="ph-ov-title">OBSERVATION LOGS</div>
                    <div class="ph-ov-actions">
                        <button class="ph-btn-clear" onclick="window.PET_HOME.clearLogs()">🗑️ 清空</button>
                        <div class="ph-ov-close" onclick="window.PET_HOME.closeOverlay('log')">✕</div>
                    </div>
                </div>
                <div id="ph-log-content" class="ph-ov-content">Loading...</div>
            </div>
        `;
        root.innerHTML = html;
        root.style.background = 'linear-gradient(180deg, var(--ph-royal) 0%, #000 100%)';
        root.style.backgroundImage = '';
    }

    function renderRoomUI() {
        const pet = getCurrentPet();
        const root = document.getElementById('ph-root');
        
        root.innerHTML = `
            <div class="ph-header">
                <button class="ph-btn-icon" onclick="window.PET_HOME.goBackToList()">❮</button>
                <div style="display:flex; gap:8px;">
                    <button class="ph-btn-icon ph-btn-heart" onclick="window.PET_HOME.openInfo()">♥</button>
                    <button class="ph-btn-icon ph-btn-settings" onclick="window.PET_HOME.openSettings()">⚙</button>
                </div>
            </div>
            ${win.PET_STATUS ? win.PET_STATUS.generateStatsFloatHTML() : ''}
            <div class="ph-stage"><img id="ph-pet-img" src="${pet.imageUrl}" class="ph-pet-avatar" onclick="window.PET_HOME.interact()"></div>
            <div class="ph-vn-wrapper"><div class="ph-vn-box"><div class="ph-vn-name-tag">${pet.name}</div><div class="ph-vn-text" id="vn-text-content">(看著你...)</div></div></div>
            <div class="ph-bottom-bar">
                <button class="ph-action-btn" title="Inventory" onclick="window.PET_HOME.openInventory()">🎒</button>
                <button class="ph-action-btn" title="History Log" onclick="window.PET_HOME.openHistory()">📜</button>
                <div class="ph-input-box"><input id="ph-input" class="ph-input" placeholder="說點什麼..." onkeypress="if(event.key==='Enter') window.PET_HOME.sendChatMessage()"><button class="ph-send-btn" onclick="window.PET_HOME.sendChatMessage()">➤</button></div>
                <button class="ph-action-btn" title="Touch" onclick="window.PET_HOME.interact()">✋</button>
            </div>
            
            <div id="ph-ov-inv" class="ph-overlay"><div class="ph-ov-header"><div class="ph-ov-title">INVENTORY</div><div class="ph-ov-close" onclick="window.PET_HOME.closeOverlay('inventory')">✕</div></div><div id="ph-inv-content" class="ph-ov-content"></div></div>
            <div id="ph-ov-hist" class="ph-overlay full">
                <div class="ph-ov-header">
                    <div class="ph-ov-title">HISTORY</div>
                    <div class="ph-ov-actions">
                        <button class="ph-btn-clear" id="ph-toggle-delete-mode-btn" onclick="window.PET_HOME.toggleDeleteMode()" style="display:none;">🗑️ 刪除模式</button>
                        <div class="ph-hist-select-actions" id="ph-hist-select-actions" style="display:none;">
                            <button class="ph-btn-select-all" id="ph-select-all-btn" onclick="window.PET_HOME.toggleSelectAll()">全選</button>
                            <button class="ph-btn-delete-selected" id="ph-delete-selected-btn" onclick="window.PET_HOME.deleteSelectedHistory()">🗑️ 刪除選中</button>
                            <button class="ph-btn-clear" onclick="window.PET_HOME.toggleDeleteMode()" style="margin-left:5px;">取消</button>
                        </div>
                        <div class="ph-ov-close" onclick="window.PET_HOME.closeOverlay('history')">✕</div>
                    </div>
                </div>
                <div class="ph-hist-tabs">
                    <div class="ph-hist-tab active" data-tab="chat" onclick="window.PET_HOME.switchHistoryTab('chat')">聊天歷史</div>
                    <div class="ph-hist-tab" data-tab="state" onclick="window.PET_HOME.switchHistoryTab('state')">狀態LOG</div>
                </div>
                <div id="ph-hist-chat-content" class="ph-hist-tab-content active ph-ov-content" style="background:rgba(0,0,0,0.5);"></div>
                <div id="ph-hist-state-content" class="ph-hist-tab-content ph-ov-content" style="background:rgba(0,0,0,0.5);"></div>
            </div>
            
            <div id="ph-info-panel" class="ph-info-panel">
                <div class="ph-info-close" onclick="window.PET_HOME.closeOverlay('info')">✕</div>
                <div style="text-align:center; color:var(--ph-gold); font-family:'Cinzel',serif; font-weight:bold; font-size:16px; margin-bottom:15px;">PET PROFILE</div>
                <div class="ph-info-row"><span class="ph-info-label">NAME</span><div class="ph-info-val">${pet.name}</div></div>
                <div class="ph-info-row"><span class="ph-info-label">TYPE</span><div class="ph-info-val">${pet.type}</div></div>
                <div class="ph-info-row"><span class="ph-info-label">ROOM</span><div class="ph-info-val">${pet.roomName || '未命名房間'}</div></div>
                <div class="ph-info-row"><span class="ph-info-label">性格</span><div class="ph-info-val">${pet.personality || 'Unknown'}</div></div>
                <div class="ph-info-row"><span class="ph-info-label">行為描述</span><div class="ph-info-val">${pet.behavior || 'Unknown'}</div></div>
                <div class="ph-info-row"><span class="ph-info-label">ABOUT</span><div class="ph-info-val" style="font-size:11px;">${pet.desc || 'No description available.'}</div></div>
            </div>

            <div id="ph-settings-panel" class="ph-settings-panel"><div class="ph-settings-close" onclick="window.PET_HOME.closeOverlay('settings')">✕</div><div class="ph-settings-title">設置背景</div><div class="ph-bg-upload-area" onclick="document.getElementById('ph-bg-file-input').click()"><div class="ph-bg-upload-icon">📷</div><div class="ph-bg-upload-text">點擊上傳圖片</div><div class="ph-bg-upload-hint">支持 JPG、PNG 格式</div></div><input type="file" id="ph-bg-file-input" accept="image/jpeg,image/jpg,image/png" onchange="window.PET_HOME.handleImageUpload(event)"><div class="ph-bg-current"><div class="ph-bg-current-label">當前背景</div><div class="ph-bg-preview" id="ph-bg-preview"></div><button class="ph-bg-remove-btn" onclick="window.PET_HOME.removeBackground()" id="ph-bg-remove-btn" style="display:none;">移除背景</button><div id="ph-bg-regenerate-section" style="margin-top:15px; padding-top:15px; border-top:1px solid rgba(255,255,255,0.1); display:none;"><div class="ph-bg-current-label">房間背景生成</div><button class="ph-btn-regenerate" id="ph-btn-regenerate" onclick="window.PET_HOME.regenerateRoomBackground()">🔄 重新生成背景</button><button class="ph-btn-copy" id="ph-btn-copy-prompt" onclick="window.PET_HOME.copyRoomBgPrompt()">📋 複製 PROMPT</button></div></div><div style="margin-top:20px; border-top:1px solid rgba(255,255,255,0.1); padding-top:15px;"><div class="ph-bg-current-label">寵物圖像處理</div><button class="ph-btn-magic" id="ph-remove-bg-btn" onclick="window.PET_HOME.processRemoveBg()">🪄 一鍵去背 (Remove White BG)</button><div style="font-size:10px; color:#888; margin-top:5px; margin-bottom:10px;">* 將圖片中的白色像素轉為透明。</div><button class="ph-btn-download" onclick="window.PET_HOME.downloadPetImage()">💾 下載圖片</button><div class="ph-pet-img-upload-area" onclick="document.getElementById('ph-pet-img-file-input').click()"><div style="font-size:20px;">📤</div><div class="ph-pet-img-upload-text">點擊上傳已處理的圖片</div></div><input type="file" id="ph-pet-img-file-input" accept="image/png,image/jpeg,image/jpg" onchange="window.PET_HOME.handlePetImageUpload(event)"></div></div>
        `;
        updateBars();
        applyBackground();
        renderBackgroundPreview();
    }

    async function sendChatMessage() {
        const input = document.getElementById('ph-input');
        const text = input.value.trim();
        if (!text) return;
        const pet = getCurrentPet();
        if (!pet) return;

        input.value = '';
        
        // 1. 先將用戶訊息加入歷史 (UI 立即顯示)
        addToHistory("You", text, true);
        
        const box = document.getElementById('vn-text-content');
        box.innerHTML = `<span style="color:#aaa; font-style:italic;">(思考中...)</span>`;

        if (!win.OS_API) { typeText("(API 未連接)", false); return; }

        try {
            // 🔥 拆分式日志：记录各个组成部分
            const promptParts = {
                basePrompt: '',
                roommates: '',
                timeAware: '',
                stateLog: '',
                systemMemory: ''
            };
            
            let sysPrompt = win.OS_PROMPTS ? win.OS_PROMPTS.get('pet_chat_system') : "";
            
            const personality = pet.personality || "可愛";
            const behavior = pet.behavior || "未知";
            const about = pet.desc || "無描述";
            sysPrompt = sysPrompt.replace(/{{petName}}/g, pet.name)
                .replace(/{{petType}}/g, pet.type)
                .replace(/{{petPersonality}}/g, personality)
                .replace(/{{petBehavior}}/g, behavior)
                .replace(/{{petAbout}}/g, about);
            promptParts.basePrompt = sysPrompt;

            if (STATE.pets && STATE.pets.length > 1) {
                const otherPets = STATE.pets.filter(p => p.id !== pet.id);
                if (otherPets.length > 0) {
                    const roommatesInfo = otherPets.map(p => {
                        const roomInfo = p.roomName ? `（房間：${p.roomName}）` : '';
                        const pPersonality = p.personality || '可愛';
                        const pBehavior = p.behavior ? `，${p.behavior}` : '';
                        return `- ${p.name}：${p.type}${roomInfo}，性格：${pPersonality}${pBehavior}`;
                    }).join('\n');
                    const roommatesSection = `\n\n[你的室友們 / Roommates]\n${roommatesInfo}\n（這些是和你一起生活的其他寵物，當話題涉及它們時，請參考這些信息）`;
                    sysPrompt += roommatesSection;
                    promptParts.roommates = roommatesSection;
                }
            }

            // 時間感知
            if (STATE.eventSettings.timeAware) {
                const now = new Date();
                const hour = now.getHours();
                const minute = now.getMinutes();
                const dayOfWeek = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
                const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 星期${dayOfWeek}`;
                let timeOfDay = '';
                if (hour >= 5 && hour < 12) timeOfDay = '上午';
                else if (hour >= 12 && hour < 14) timeOfDay = '中午';
                else if (hour >= 14 && hour < 18) timeOfDay = '下午';
                else if (hour >= 18 && hour < 22) timeOfDay = '傍晚';
                else timeOfDay = '夜晚';
                
                const timeSection = `\n\n[當前時間 / Current Time]\n日期：${dateStr}\n時間：${timeOfDay} ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}\n（你可以根據當前時間做出相應的反應，例如：早上問好、中午想吃飯、晚上想睡覺等）`;
                sysPrompt += timeSection;
                promptParts.timeAware = timeSection;
            }

            // 狀態LOG（最近30條）
            if (pet.stateLog && pet.stateLog.length > 0) {
                const recentStateLogs = pet.stateLog.slice(-30);
                const stateLogText = recentStateLogs.map(log => {
                    const timeAgo = win.PET_STATUS ? win.PET_STATUS.formatTimeAgo(log.timestamp) : '剛剛';
                    return `- [${timeAgo}] ${log.action}`;
                }).join('\n');
                const stateLogSection = `\n\n[狀態LOG / Status Log]\n${stateLogText}\n（這些是你最近的操作記錄，請根據這些記錄來調整你的回應。例如：如果記錄顯示剛餵食，你可以表達感謝或滿足；如果剛洗澡，可以表達舒適感）`;
                sysPrompt += stateLogSection;
                promptParts.stateLog = stateLogSection;
            }

            if (win.OS_DB && typeof win.OS_DB.getRelatedPetLogs === 'function') {
                try {
                    const logs = await win.OS_DB.getRelatedPetLogs(pet.id);
                    if (logs.length > 0) {
                        const recentLogs = logs.slice(0, 5);
                        const memoryText = recentLogs.map(l => {
                            const date = new Date(l.timestamp).toLocaleDateString();
                            return `- [${date}] ${l.content}`; 
                        }).join('\n');
                        
                        const memorySection = `\n\n[System Memory / Recent Events]\n${memoryText}\n(請根據這些近期發生的事情與互動來調整你的回應)`;
                        sysPrompt += memorySection;
                        promptParts.systemMemory = memorySection;
                    }
                } catch(e) { console.warn('Memory fetch failed', e); }
            }

            // 🔥 修復關鍵：這裡 contextMsgs 已經包含了最新的用戶發言 (因為 addToHistory 已經執行過了)
            let contextMsgs = [];
            if (pet.chatHistory && pet.chatHistory.length > 0) {
                const historySlice = pet.chatHistory.slice(-20);
                contextMsgs = historySlice.map(msg => ({ role: msg.isUser ? 'user' : 'assistant', content: msg.text }));
                
                // 🔥 檢查聊天時間間隔，如果超過2小時，在最新的用戶消息前添加時間間隔提示
                // 注意：最新的消息應該是最後一條，且由於 addToHistory 已經執行，最新的用戶消息應該在 contextMsgs 的最後
                if (win.PET_STATUS && contextMsgs.length > 0) {
                    const timeIntervalHint = win.PET_STATUS.checkChatTimeInterval(2);
                    if (timeIntervalHint) {
                        // 從後往前找到最後一條用戶消息（應該就是最新的那條）
                        for (let i = contextMsgs.length - 1; i >= 0; i--) {
                            if (contextMsgs[i].role === 'user') {
                                // 在用戶消息內容前添加時間間隔提示
                                contextMsgs[i].content = timeIntervalHint + '\n\n' + contextMsgs[i].content;
                                console.log('[PetHome] 檢測到長時間間隔，已添加時間間隔提示');
                                break;
                            }
                        }
                    }
                }
            }

            // ❌ 錯誤寫法 (舊)：...contextMsgs, { role: 'user', content: text }  <-- 這樣會重複！
            // ✅ 正確寫法：既然 contextMsgs 已經有了，就不用再加一次
            const messages = [{ role: 'system', content: sysPrompt }, ...contextMsgs];
            
            // 🔥 Debug: 拆分式日志输出
            console.group('📊 [PetHome] System Prompt 組成分析');
            console.table({
                '基礎人設 (Base Prompt)': {
                    '長度': promptParts.basePrompt.length,
                    '包含': '名字、物種、性格、行為描述、關於、互動指令'
                },
                '室友信息 (Roommates)': {
                    '長度': promptParts.roommates.length,
                    '包含': promptParts.roommates ? '其他寵物信息' : '無'
                },
                '時間感知 (Time Aware)': {
                    '長度': promptParts.timeAware.length,
                    '包含': promptParts.timeAware ? '當前日期時間' : '未開啟'
                },
                '狀態LOG (State Log)': {
                    '長度': promptParts.stateLog.length,
                    '包含': promptParts.stateLog ? `${pet.stateLog?.slice(-30).length || 0}條操作記錄` : '無記錄'
                },
                '系統記憶 (System Memory)': {
                    '長度': promptParts.systemMemory.length,
                    '包含': promptParts.systemMemory ? '隨機事件記錄' : '無記錄'
                },
                '歷史對話 (Chat History)': {
                    '長度': contextMsgs.reduce((sum, msg) => sum + msg.content.length, 0),
                    '包含': `${contextMsgs.length}條消息 (user + assistant)`
                },
                '總計 (Total System)': {
                    '長度': sysPrompt.length,
                    '包含': '所有system prompt部分'
                },
                '總消息數 (Total Messages)': {
                    '長度': messages.length,
                    '包含': `1 system + ${contextMsgs.length} history`
                }
            });
            console.groupEnd();
            
            let config = {};
            if (win.OS_SETTINGS) {
                const secConfig = win.OS_SETTINGS.getSecondaryConfig ? win.OS_SETTINGS.getSecondaryConfig() : null;
                const isSecValid = secConfig && (secConfig.key || (secConfig.useSystemApi && secConfig.stProfileId));
                if (isSecValid) config = secConfig; 
                else config = win.OS_SETTINGS.getConfig();
            }

            // [TODO: Standalone API] 功能待接入直連 API
            console.warn('[Pet] AI 功能已停用，等待 Standalone API 整合');
            return;
        } catch (e) { console.error(e); typeText("(睡著了...)", false); }
    }

    async function openLogPanel() {
        const overlay = document.getElementById('ph-log-panel');
        const content = document.getElementById('ph-log-content');
        if(!overlay || !content) return;
        
        overlay.classList.add('active');
        content.innerHTML = '<div style="text-align:center; margin-top:20px;">Loading logs...</div>';

        if (win.OS_DB && win.OS_DB.getAllPetLogs) {
            try {
                const logs = await win.OS_DB.getAllPetLogs();
                if (logs.length === 0) {
                    content.innerHTML = '<div class="ph-empty-state">暫無觀察日記</div>';
                } else {
                    content.innerHTML = logs.map(log => {
                        const date = new Date(log.timestamp).toLocaleString();
                        let avatarsHtml = '';
                        if (log.participants) {
                            log.participants.forEach(pid => {
                                const p = STATE.pets.find(pet => pet.id === pid);
                                if(p) avatarsHtml += `<img src="${p.imageUrl}" class="ph-log-mini-img" title="${p.name}">`;
                            });
                        }
                        return `
                            <div class="ph-log-item">
                                <div class="ph-log-time">${date}</div>
                                <div class="ph-log-avatars">${avatarsHtml}</div>
                                <div class="ph-log-content">${log.content}</div>
                            </div>
                        `;
                    }).join('');
                }
            } catch (e) { content.innerHTML = 'Error loading logs'; }
        }
    }

    async function clearLogs() {
        if(!confirm("確定清空所有觀察日記？")) return;
        if(win.OS_DB && win.OS_DB.clearPetLogs) {
            await win.OS_DB.clearPetLogs();
            openLogPanel();
        }
    }

    function typeText(text, saveToDb = true) {
        const box = document.getElementById('vn-text-content');
        if (!box) return;
        if (STATE.typingTimer) clearInterval(STATE.typingTimer);
        box.innerHTML = '';
        let i = 0; const speed = 30;
        STATE.typingTimer = setInterval(() => {
            if (i < text.length) { box.innerHTML += text.charAt(i); i++; } 
            else { clearInterval(STATE.typingTimer); }
        }, speed);
        if (saveToDb) { const pet = getCurrentPet(); if (pet) addToHistory(pet.name, text, false); }
    }
    function addToStateLog(action) {
        if (win.PET_STATUS) {
            win.PET_STATUS.addToStateLog(action);
        }
    }
    function addToHistory(sender, text, isUser) {
        const pet = getCurrentPet(); if (!pet) return;
        if (!pet.chatHistory) pet.chatHistory = [];
        const msgObj = { sender, text, isUser, time: new Date().toLocaleTimeString(), timestamp: Date.now() };
        pet.chatHistory.push(msgObj);
        if (pet.chatHistory.length > 100) pet.chatHistory.shift();
        saveCurrentPet();
        const histList = document.getElementById('ph-hist-chat-content');
        if (histList && document.getElementById('ph-ov-hist').classList.contains('active')) {
            renderHistoryItem(histList, msgObj);
            histList.scrollTop = histList.scrollHeight;
            updateDeleteButtonState();
        }
    }
    async function interact() {
        const pet = getCurrentPet(); if (!pet) return;
        pet.mood = Math.min(100, (pet.mood || 0) + 5);
        pet.intimacy = Math.min(100, (pet.intimacy || 0) + 1);
        await saveCurrentPet();
        addToStateLog('互動（撫摸/觸摸）');
        const reactions = ["(蹭蹭你的手心)", "(發出呼嚕呼嚕的聲音)", "(開心地搖尾巴)", "喵~ ❤️", "(瞇著眼睛很享受)"];
        typeText(reactions[Math.floor(Math.random() * reactions.length)], false);
    }
    async function useItem(index) {
        if (!win.PET_INVENTORY) { alert("無倉庫系統"); return; }
        const inv = win.PET_INVENTORY.getUserInventory();
        const item = inv[index];
        const pet = getCurrentPet();
        if (!item || !pet) return;
        const effect = item.effect || {};
        if(effect.hunger) pet.hunger = Math.min(100, (pet.hunger||0) + effect.hunger);
        if(effect.mood) pet.mood = Math.min(100, (pet.mood||0) + effect.mood);
        if(effect.cleanliness) pet.cleanliness = Math.min(100, (pet.cleanliness||0) + effect.cleanliness);
        if(effect.intimacy) pet.intimacy = Math.min(100, (pet.intimacy||0) + effect.intimacy);
        win.PET_INVENTORY.consumeItem(item.id, 1);
        await saveCurrentPet();

        // 記錄到狀態LOG
        let logAction = '';
        if (item.type === 'Food') logAction = `餵食：${item.name}`;
        else if (item.type === 'Toy') logAction = `玩玩具：${item.name}`;
        else if (item.type === 'Clean') logAction = `洗澡/清潔`;
        else logAction = `使用：${item.name}`;
        addToStateLog(logAction);

        closeOverlay('inventory');
        if (win.toastr) win.toastr.success(`使用了 ${item.name}`);
    }
    async function processRemoveBg() {
        const pet = getCurrentPet();
        if (!pet || !pet.imageUrl) { alert("沒有寵物圖片"); return; }
        const btn = document.getElementById('ph-remove-bg-btn');
        if (btn) btn.innerHTML = "⏳ 處理中...";
        try {
            const img = new Image(); img.crossOrigin = "Anonymous";
            img.onload = async () => {
                const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
                const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
                const frame = ctx.getImageData(0, 0, canvas.width, canvas.height); const data = frame.data;
                const threshold = 230; let pixelChanged = 0;
                for (let i = 0; i < data.length; i += 4) {
                    if (data[i] > threshold && data[i+1] > threshold && data[i+2] > threshold) {
                        data[i+3] = 0; pixelChanged++;
                    }
                }
                if (pixelChanged > 0) {
                    ctx.putImageData(frame, 0, 0); const newUrl = canvas.toDataURL('image/png');
                    pet.imageUrl = newUrl; await saveCurrentPet();
                    document.getElementById('ph-pet-img').src = newUrl;
                    if (win.toastr) win.toastr.success("背景已移除 (白色轉透明)");
                } else { alert("未檢測到白色背景，無需處理。"); }
                if (btn) btn.innerHTML = "🪄 一鍵去背 (Remove White BG)";
            };
            img.onerror = () => { alert("圖片加載失敗"); if (btn) btn.innerHTML = "❌ 失敗"; };
            img.src = pet.imageUrl;
        } catch (e) { console.error(e); alert("處理失敗"); if (btn) btn.innerHTML = "❌ 錯誤"; }
    }
    function downloadPetImage() {
        const pet = getCurrentPet();
        if (!pet || !pet.imageUrl) { win.toastr ? win.toastr.error('沒有圖片') : alert('沒有圖片'); return; }
        try {
            const img = new Image(); img.crossOrigin = "Anonymous";
            img.onload = function() {
                const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
                const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
                canvas.toBlob(function(blob) {
                    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url;
                    a.download = `${pet.name || 'pet'}_${Date.now()}.png`; document.body.appendChild(a); a.click(); document.body.removeChild(a);
                    URL.revokeObjectURL(url); if (win.toastr) win.toastr.success('圖片已下載');
                }, 'image/png');
            };
            img.onerror = function() {
                const a = document.createElement('a'); a.href = pet.imageUrl; a.download = `${pet.name || 'pet'}_${Date.now()}.png`; a.target = '_blank';
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                if (win.toastr) win.toastr.info('已打開圖片，請右鍵保存');
            };
            img.src = pet.imageUrl;
        } catch (e) { console.error('下載失敗:', e); win.toastr ? win.toastr.error('下載失敗') : alert('下載失敗'); }
    }
    async function handlePetImageUpload(event) {
        const file = event.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = async function(e) {
            const pet = getCurrentPet(); if (!pet) return;
            pet.imageUrl = e.target.result; await saveCurrentPet();
            const imgElement = document.getElementById('ph-pet-img');
            if (imgElement) imgElement.src = pet.imageUrl;
            if (win.toastr) win.toastr.success('寵物圖片已更新');
        };
        reader.readAsDataURL(file); event.target.value = '';
    }
    function renderEmptyUI() {
        const root = document.getElementById('ph-root');
        if (!root) return;
        root.innerHTML = `
            <div class="ph-header">
                <button class="ph-btn-icon" onclick="window.PhoneSystem.goHome()">❮</button>
                <div style="color:var(--ph-gold); font-family:'Cinzel',serif; font-weight:bold;">PET CENTER</div>
            </div>
            <div class="ph-empty-state">
                <div style="font-size:40px; margin-bottom:10px;">🐰</div>
                <div>還沒有領養寵物</div>
                <button class="ph-btn-go-shop" onclick="window.PET_HOME.openPetShop()">去寵物店</button>
            </div>
        `;
    }

    function launch(container) {
        STATE.container = container; STATE.container.innerHTML = `<div class="ph-container" id="ph-root"></div>`;
        // 初始化狀態管理模組
        if (win.PET_STATUS) {
            win.PET_STATUS.init(getCurrentPet, saveCurrentPet);
        }
        loadPets();
    }
    function openGlobalSettings() { 
        // 更新已使用次数显示
        const dailyCountSpan = document.getElementById('ph-daily-count-display');
        if (dailyCountSpan) {
            dailyCountSpan.textContent = `已使用：${STATE.eventSettings.dailyCount || 0}/${STATE.eventSettings.maxDaily}`;
        }
        document.getElementById('ph-global-settings').classList.add('active'); 
    }
    function saveGlobalSettings() {
        const enabled = document.getElementById('set-event-enable').checked;
        const chance = parseInt(document.getElementById('set-event-chance').value);
        const max = parseInt(document.getElementById('set-event-max').value);
        const timeAware = document.getElementById('set-time-aware').checked;
        STATE.eventSettings.enabled = enabled; 
        STATE.eventSettings.chance = chance; 
        STATE.eventSettings.maxDaily = max;
        STATE.eventSettings.timeAware = timeAware;
        saveEventSettings();
        // 更新已使用次数显示
        const dailyCountSpan = document.getElementById('ph-daily-count-display');
        if (dailyCountSpan) {
            dailyCountSpan.textContent = `已使用：${STATE.eventSettings.dailyCount || 0}/${STATE.eventSettings.maxDaily}`;
        }
    }
    function banishPet(id) {
        const pet = STATE.pets.find(p => p.id === id); if (!pet) return;
        if (!confirm(`⚠️ 確定要放逐 (永久刪除) [${pet.name}] 嗎？`)) return;
        if (win.OS_DB && win.OS_DB.deletePet) win.OS_DB.deletePet(id);
        STATE.pets = STATE.pets.filter(p => p.id !== id);
        if (STATE.pets.length === 0) renderEmptyUI(); else renderPetList();
    }
    function closeOverlay(type) {
        if (type === 'inventory') document.getElementById('ph-ov-inv').classList.remove('active');
        if (type === 'history') {
            document.getElementById('ph-ov-hist').classList.remove('active');
            // 关闭历史面板时重置删除模式
            STATE.deleteMode = false;
        }
        if (type === 'info') document.getElementById('ph-info-panel').classList.remove('active');
        if (type === 'settings') document.getElementById('ph-settings-panel').classList.remove('active');
        if (type === 'global') document.getElementById('ph-global-settings').classList.remove('active');
        if (type === 'log') document.getElementById('ph-log-panel').classList.remove('active');
    }
    async function deleteSelectedHistory() {
        const pet = getCurrentPet(); 
        if (!pet || !pet.chatHistory) return;
        
        const checkboxes = document.querySelectorAll('#ph-hist-chat-content .ph-hist-checkbox:checked');
        if (checkboxes.length === 0) {
            if (win.toastr) win.toastr.warning('請先選擇要刪除的項目');
            return;
        }
        
        if (!confirm(`確定要刪除選中的 ${checkboxes.length} 條記錄嗎？`)) return;
        
        const timestampsToDelete = Array.from(checkboxes).map(cb => {
            const ts = cb.dataset.timestamp;
            return typeof ts === 'string' ? parseInt(ts) : ts;
        });
        pet.chatHistory = pet.chatHistory.filter(item => {
            const itemTs = item.timestamp;
            return !timestampsToDelete.some(ts => ts === itemTs || Number(ts) === Number(itemTs));
        });
        await saveCurrentPet();
        
        // 退出删除模式
        STATE.deleteMode = false;
        const deleteModeBtn = document.getElementById('ph-toggle-delete-mode-btn');
        const selectActions = document.getElementById('ph-hist-select-actions');
        if (deleteModeBtn) deleteModeBtn.style.display = 'block';
        if (selectActions) selectActions.style.display = 'none';
        
        await renderHistoryContent();
        updateDeleteButtonState();
        if (win.toastr) win.toastr.success(`已刪除 ${checkboxes.length} 條記錄`);
    }
    
    function toggleDeleteMode() {
        STATE.deleteMode = !STATE.deleteMode;
        const deleteModeBtn = document.getElementById('ph-toggle-delete-mode-btn');
        const selectActions = document.getElementById('ph-hist-select-actions');
        
        if (STATE.deleteMode) {
            // 进入删除模式
            if (deleteModeBtn) deleteModeBtn.style.display = 'none';
            if (selectActions) selectActions.style.display = 'flex';
        } else {
            // 退出删除模式
            if (deleteModeBtn) deleteModeBtn.style.display = 'block';
            if (selectActions) selectActions.style.display = 'none';
            // 清除所有选中状态
            const checkboxes = document.querySelectorAll('#ph-hist-chat-content .ph-hist-checkbox');
            checkboxes.forEach(cb => cb.checked = false);
        }
        
        // 重新渲染历史内容以显示/隐藏复选框
        renderHistoryContent();
        updateDeleteButtonState();
    }
    
    function toggleSelectAll() {
        const checkboxes = document.querySelectorAll('#ph-hist-chat-content .ph-hist-checkbox');
        const selectAllBtn = document.getElementById('ph-select-all-btn');
        if (!checkboxes.length) return;
        
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
        checkboxes.forEach(cb => cb.checked = !allChecked);
        
        if (selectAllBtn) {
            selectAllBtn.textContent = allChecked ? '全選' : '取消全選';
        }
        updateDeleteButtonState();
    }
    
    function updateDeleteButtonState() {
        const checkboxes = document.querySelectorAll('#ph-hist-chat-content .ph-hist-checkbox:checked');
        const deleteBtn = document.getElementById('ph-delete-selected-btn');
        const selectAllBtn = document.getElementById('ph-select-all-btn');
        
        if (deleteBtn) {
            deleteBtn.disabled = checkboxes.length === 0;
        }
        
        if (selectAllBtn) {
            const allCheckboxes = document.querySelectorAll('#ph-hist-chat-content .ph-hist-checkbox');
            const allChecked = allCheckboxes.length > 0 && Array.from(allCheckboxes).every(cb => cb.checked);
            selectAllBtn.textContent = allChecked ? '取消全選' : '全選';
        }
    }
    function updateBars() {
        if (win.PET_STATUS) {
            win.PET_STATUS.updateBars();
        }
    }
    function openInventory() {
        if (!win.PET_INVENTORY) return;
        const list = document.getElementById('ph-inv-content');
        const inv = win.PET_INVENTORY.getUserInventory();
        if (inv.length === 0) list.innerHTML = `<div class="ph-empty-state">背包是空的<br><button class="ph-btn-go-shop" onclick="window.PET_HOME.openPetShop()">去買東西</button></div>`;
        else list.innerHTML = `<div class="ph-inv-grid">` + inv.map((item, idx) => `<div class="ph-inv-item" onclick="window.PET_HOME.useItem(${idx})"><span class="ph-inv-count">${item.count}</span><span class="ph-inv-icon">${item.icon}</span><div class="ph-inv-name">${item.name}</div></div>`).join('') + `</div>`;
        document.getElementById('ph-ov-inv').classList.add('active');
    }
    async function openHistory() {
        const overlay = document.getElementById('ph-ov-hist');
        if (!overlay) return;
        overlay.classList.add('active');
        await renderHistoryContent();
        // 确保删除模式按钮在聊天历史标签时显示
        const activeTab = document.querySelector('.ph-hist-tab.active');
        if (activeTab && activeTab.dataset.tab === 'chat') {
            const deleteModeBtn = document.getElementById('ph-toggle-delete-mode-btn');
            const selectActions = document.getElementById('ph-hist-select-actions');
            if (deleteModeBtn) deleteModeBtn.style.display = 'block';
            if (selectActions) {
                selectActions.style.display = STATE.deleteMode ? 'flex' : 'none';
            }
        }
    }
    function switchHistoryTab(tab) {
        const tabs = document.querySelectorAll('.ph-hist-tab');
        const chatContent = document.getElementById('ph-hist-chat-content');
        const stateContent = document.getElementById('ph-hist-state-content');
        const selectActions = document.getElementById('ph-hist-select-actions');
        const deleteModeBtn = document.getElementById('ph-toggle-delete-mode-btn');
        
        tabs.forEach(t => t.classList.remove('active'));
        document.querySelector(`.ph-hist-tab[data-tab="${tab}"]`).classList.add('active');
        
        if (tab === 'chat') {
            chatContent.classList.add('active');
            stateContent.classList.remove('active');
            if (deleteModeBtn) deleteModeBtn.style.display = 'block';
            if (selectActions) {
                selectActions.style.display = STATE.deleteMode ? 'flex' : 'none';
            }
        } else {
            chatContent.classList.remove('active');
            stateContent.classList.add('active');
            if (deleteModeBtn) deleteModeBtn.style.display = 'none';
            if (selectActions) selectActions.style.display = 'none';
        }
        renderHistoryContent();
    }
    async function renderHistoryContent() {
        const pet = getCurrentPet();
        if (!pet) {
            document.getElementById('ph-hist-chat-content').innerHTML = `<div style="text-align:center;color:#666;margin-top:20px;">未找到當前寵物</div>`;
            return;
        }
        
        // 渲染聊天歷史
        const chatContent = document.getElementById('ph-hist-chat-content');
        if (chatContent && chatContent.classList.contains('active')) {
            chatContent.innerHTML = '';
            if (!pet.chatHistory || pet.chatHistory.length === 0) {
                chatContent.innerHTML = `<div style="text-align:center;color:#666;margin-top:20px;">暫無紀錄</div>`;
            } else {
                pet.chatHistory.forEach(item => renderHistoryItem(chatContent, item));
                setTimeout(() => { 
                    chatContent.scrollTop = chatContent.scrollHeight;
                    updateDeleteButtonState();
                }, 50);
            }
        }
        
        // 渲染狀態LOG
        const stateContent = document.getElementById('ph-hist-state-content');
        if (stateContent && stateContent.classList.contains('active')) {
            if (win.PET_STATUS) {
                win.PET_STATUS.renderAllStateLogs(stateContent);
            } else {
                stateContent.innerHTML = `<div style="text-align:center;color:#666;margin-top:20px;">暫無狀態記錄</div>`;
            }
        }
    }
    function renderHistoryItem(container, item) {
        const div = document.createElement('div'); 
        div.className = 'ph-hist-msg';
        const itemId = `ph-hist-item-${item.timestamp || Date.now()}`;
        
        if (STATE.deleteMode) {
            // 删除模式：显示复选框
            div.innerHTML = `
                <input type="checkbox" class="ph-hist-checkbox" id="${itemId}" data-timestamp="${item.timestamp || Date.now()}" onchange="window.PET_HOME.updateDeleteButtonState()">
                <div class="ph-hist-content">
                    <div class="${item.isUser ? 'ph-hist-user' : 'ph-hist-ai'}">${item.sender} <span style="font-size:9px;opacity:0.5;float:right">${item.time}</span></div>
                    <div class="ph-hist-text">${item.text}</div>
                </div>
            `;
        } else {
            // 普通模式：不显示复选框
            div.innerHTML = `
                <div class="ph-hist-content" style="flex: none; width: 100%;">
                    <div class="${item.isUser ? 'ph-hist-user' : 'ph-hist-ai'}">${item.sender} <span style="font-size:9px;opacity:0.5;float:right">${item.time}</span></div>
                    <div class="ph-hist-text">${item.text}</div>
                </div>
            `;
        }
        container.appendChild(div);
    }
    function openInfo() { document.getElementById('ph-info-panel').classList.add('active'); }
    function openSettings() { 
        document.getElementById('ph-settings-panel').classList.add('active');
        renderBackgroundPreview();
    }
    function renderBackgroundPreview() {
        const preview = document.getElementById('ph-bg-preview');
        const removeBtn = document.getElementById('ph-bg-remove-btn');
        const regenerateSection = document.getElementById('ph-bg-regenerate-section');
        if (!preview) return;
        const pet = getCurrentPet(); if (!pet) return;
        const bgData = pet.background;
        if (bgData && bgData.startsWith('data:image')) {
            preview.innerHTML = `<img src="${bgData}" alt="背景預覽">`;
            if (removeBtn) removeBtn.style.display = 'block';
            if (regenerateSection) regenerateSection.style.display = 'none';
            } else {
            preview.innerHTML = `<div class="ph-bg-preview-none">使用預設背景</div>`;
            if (removeBtn) removeBtn.style.display = 'none';
            // 如果有 room_bg_prompt 但没有背景，显示重新生成按钮
            if (regenerateSection) {
                regenerateSection.style.display = pet.room_bg_prompt ? 'block' : 'none';
            }
        }
    }
    function handleImageUpload(event) {
        const file = event.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = async function(e) {
            const pet = getCurrentPet(); if (!pet) return;
            pet.background = e.target.result;
            await saveCurrentPet(); applyBackground(); renderBackgroundPreview();
        };
        reader.readAsDataURL(file);
    }
    async function removeBackground() {
        const pet = getCurrentPet(); if (!pet) return;
        pet.background = null; await saveCurrentPet(); applyBackground(); renderBackgroundPreview();
    }
    async function regenerateRoomBackground() {
        const pet = getCurrentPet(); if (!pet || !pet.room_bg_prompt) {
            if(win.toastr) win.toastr.error("沒有房間背景 PROMPT");
            return;
        }
        
        const btn = document.getElementById('ph-btn-regenerate');
        if (btn) {
            btn.disabled = true;
            btn.innerText = '⏳ 生成中...';
        }
        
        try {
            if (!win.OS_IMAGE_MANAGER) {
                if(win.toastr) win.toastr.error("圖片生成器未就緒");
                if (btn) {
                    btn.disabled = false;
                    btn.innerText = '🔄 重新生成背景';
                }
            return;
        }
        
            console.log(`[PetHome] 重新生成房間背景 (Pet ID: ${pet.id})...`);
            const bgUrl = await win.OS_IMAGE_MANAGER.generateBackgroundAsync(pet.room_bg_prompt);
            
            if (!bgUrl) {
                if(win.toastr) win.toastr.error("背景生成失敗，請稍後再試");
                if (btn) {
                    btn.disabled = false;
                    btn.innerText = '🔄 重新生成背景';
                }
            return;
        }
        
            // 將背景URL轉換為base64
            const response = await fetch(bgUrl);
            if (!response.ok) {
                if(win.toastr) win.toastr.error(`背景圖片獲取失敗: ${response.status}`);
                if (btn) {
                    btn.disabled = false;
                    btn.innerText = '🔄 重新生成背景';
                }
            return;
        }
        
            const blob = await response.blob();
            if (!blob || blob.size === 0) {
                if(win.toastr) win.toastr.error("背景圖片數據無效");
                if (btn) {
                    btn.disabled = false;
                    btn.innerText = '🔄 重新生成背景';
                }
            return;
        }
        
            const reader = new FileReader();
            reader.onload = async function() {
                try {
                    const base64Data = reader.result;
                    if (!base64Data || !base64Data.startsWith('data:image')) {
                        if(win.toastr) win.toastr.error("背景數據格式錯誤");
                        if (btn) {
                            btn.disabled = false;
                            btn.innerText = '🔄 重新生成背景';
                        }
            return;
        }
        
                    pet.background = base64Data;
            await saveCurrentPet();
                    applyBackground();
                    renderBackgroundPreview();
                    if(win.toastr) win.toastr.success("✅ 房間背景已重新生成");
                } catch (err) {
                    console.error('[PetHome] 保存背景數據失敗:', err);
                    if(win.toastr) win.toastr.error("保存失敗: " + err.message);
                } finally {
                    if (btn) {
                        btn.disabled = false;
                        btn.innerText = '🔄 重新生成背景';
                    }
                }
            };
            reader.onerror = (e) => {
                console.error('[PetHome] 背景轉換失敗:', e);
                if(win.toastr) win.toastr.error("背景轉換失敗");
                if (btn) {
                    btn.disabled = false;
                    btn.innerText = '🔄 重新生成背景';
                }
            };
            reader.readAsDataURL(blob);
        } catch (e) {
            console.error('[PetHome] 房間背景生成失敗:', e);
            if(win.toastr) win.toastr.error("生成失敗: " + e.message);
            if (btn) {
                btn.disabled = false;
                btn.innerText = '🔄 重新生成背景';
            }
        }
    }
    function copyRoomBgPrompt() {
        const pet = getCurrentPet(); if (!pet || !pet.room_bg_prompt) {
            if(win.toastr) win.toastr.error("沒有房間背景 PROMPT");
            return;
        }
        
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(pet.room_bg_prompt).then(() => {
                if(win.toastr) win.toastr.success("✅ PROMPT 已複製到剪貼板");
            }).catch(err => {
                console.error('複製失敗:', err);
                // 降级方案
                copyToClipboardFallback(pet.room_bg_prompt);
            });
        } else {
            copyToClipboardFallback(pet.room_bg_prompt);
        }
    }
    function copyToClipboardFallback(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            if(win.toastr) win.toastr.success("✅ PROMPT 已複製到剪貼板");
        } catch (err) {
            console.error('複製失敗:', err);
            if(win.toastr) win.toastr.error("複製失敗，請手動複製");
        }
        document.body.removeChild(textarea);
    }
    function applyBackground() {
        const container = document.getElementById('ph-root');
        if (!container) return;
        if(STATE.currentView === 'list') {
             container.style.background = 'linear-gradient(180deg, var(--ph-royal) 0%, #000 100%)';
             container.style.backgroundImage = ''; return;
        }
        const pet = getCurrentPet();
        if (!pet || !pet.background) {
            container.style.background = 'linear-gradient(180deg, var(--ph-royal) 0%, #000 100%)';
            container.style.backgroundImage = '';
            } else {
            container.style.background = '';
            container.style.backgroundImage = `url('${pet.background}')`;
            container.style.backgroundSize = 'cover'; container.style.backgroundPosition = 'center'; container.style.backgroundRepeat = 'no-repeat';
        }
    }

    function openPetShop() {
        const win = window.parent || window;
        if (!win.PET_SHOP || !win.PhoneSystem) {
            console.warn('[PetHome] PET_SHOP 或 PhoneSystem 未載入');
            return;
        }
        
        try {
            // 獲取 App 運行層容器
            const appLayer = win.PhoneSystem.getAppLayer();
            if (!appLayer) {
                console.warn('[PetHome] 無法獲取 App 運行層');
                return;
            }
            
            // 切換到 App 層
            const phoneFrame = appLayer.closest('.phone-frame');
            if (phoneFrame) {
                const home = phoneFrame.querySelector('#os-home');
                if (home) home.classList.add('hidden');
                appLayer.classList.add('active');
            }
            
            // 啟動寵物店
            win.PET_SHOP.launch(appLayer);
        } catch (e) {
            console.error('[PetHome] 打開寵物店失敗:', e);
        }
    }

    win.PET_HOME = { 
        launch, interact, sendChatMessage, openInventory, openHistory, openInfo, openSettings, closeOverlay, useItem, handleImageUpload, removeBackground, processRemoveBg, downloadPetImage, handlePetImageUpload,
        enterPetRoom, goBackToList, banishPet,
        openGlobalSettings, saveGlobalSettings,
        openLogPanel, clearLogs,
        openPetShop,
        regenerateRoomBackground, copyRoomBgPrompt,
        switchHistoryTab,
        toggleDeleteMode, deleteSelectedHistory, toggleSelectAll, updateDeleteButtonState
    };
})();