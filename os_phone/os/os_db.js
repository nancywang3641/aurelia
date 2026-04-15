// ----------------------------------------------------------------
// [檔案] os_db.js (V16.1 - Dual-Mode Safe & Fully Expanded)
// 路徑：os_phone/os/os_db.js
// 職責：管理 IndexedDB 資料庫。支援酒館與獨立版雙通向。
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入系統資料庫 (System Storage V16.1 Memory)...');
    const win = window.parent || window; // 🔥 保留雙通向核心

    const DB_NAME = 'WeChat_Simulator_DB';
    const DB_VERSION = 16;

    const STORE_NAME_IMAGES = 'images';
    const STORE_NAME_CHATS = 'api_chats';
    const STORE_NAME_WB = 'wb_posts';
    const STORE_NAME_INV = 'investigation_data';
    const STORE_NAME_MAP = 'map_data';
    const STORE_NAME_PETS = 'pets';
    const STORE_NAME_PET_LOGS = 'pet_logs';
    const STORE_NAME_LOBBY      = 'lobby_history';      // 大廳導覽員對話歷史
    const STORE_NAME_ACH        = 'achievements';       // 成就系統
    const STORE_NAME_CHILD_CHAT = 'child_chat_history'; // 寶寶一對一聊天記錄
    const STORE_NAME_WORLDBOOK  = 'world_book_entries'; // 獨立世界書條目
    const STORE_NAME_VN_CHAPTERS = 'vn_chapters';       // VN 劇情章節存檔
    
    // --- 新增 AVS 與 UI 模板倉庫 ---
    const STORE_NAME_VAR_PACKS = 'var_packs';           // 動態變數表單配置
    const STORE_NAME_UI_TEMPLATES = 'ui_templates';     // AI 生成的 UI 美化模板

    let dbInstance = null;

    win.OS_DB = {
        init: function() {
            return new Promise((resolve, reject) => {
                if (dbInstance) { resolve(dbInstance); return; }
                
                // 開啟資料庫請求
                const request = indexedDB.open(DB_NAME, DB_VERSION); 
                
                request.onupgradeneeded = (event) => {
                    console.log(`[OS_DB] 資料庫正在升級... (V${event.oldVersion} -> V${event.newVersion})`);
                    const db = event.target.result;

                    const stores = [
                        STORE_NAME_IMAGES,
                        STORE_NAME_CHATS,
                        STORE_NAME_WB,
                        STORE_NAME_INV,
                        STORE_NAME_MAP,
                        STORE_NAME_PETS,
                        STORE_NAME_PET_LOGS,
                        STORE_NAME_LOBBY,
                        STORE_NAME_ACH,
                        STORE_NAME_CHILD_CHAT,
                        STORE_NAME_WORLDBOOK,
                        STORE_NAME_VN_CHAPTERS,
                        STORE_NAME_VAR_PACKS,
                        STORE_NAME_UI_TEMPLATES
                    ];

                    stores.forEach(name => {
                        if (!db.objectStoreNames.contains(name)) {
                            db.createObjectStore(name, { keyPath: 'id' });
                            console.log(`[OS_DB] ✅ 創建倉庫成功: ${name}`);
                        }
                    });
                };
                
                request.onsuccess = (event) => {
                    dbInstance = event.target.result;
                    resolve(dbInstance);
                };
                
                request.onerror = (event) => {
                    console.error('[OS_DB] 資料庫連接失敗:', event.target.error);
                    reject(event.target.error);
                };
            });
        },

        // --- 寵物數據接口 ---
        savePet: async function(petData) {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                try {
                    const tx = db.transaction(STORE_NAME_PETS, 'readwrite');
                    const store = tx.objectStore(STORE_NAME_PETS);
                    if (!petData.id) petData.id = 'pet_' + Date.now();
                    store.put(petData);
                    tx.oncomplete = () => resolve(petData.id);
                    tx.onerror = (e) => reject(e.target.error);
                } catch (e) { reject(e); }
            });
        },

        getAllPets: async function() {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                try {
                    const tx = db.transaction(STORE_NAME_PETS, 'readonly');
                    const store = tx.objectStore(STORE_NAME_PETS);
                    const req = store.getAll();
                    req.onsuccess = () => resolve(req.result || []);
                    req.onerror = (e) => reject(e.target.error);
                } catch (e) {
                    console.error("[OS_DB] 讀取寵物失敗:", e);
                    reject(e);
                }
            });
        },

        getPet: async function(id) {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                try {
                    const tx = db.transaction(STORE_NAME_PETS, 'readonly');
                    const store = tx.objectStore(STORE_NAME_PETS);
                    const req = store.get(id);
                    req.onsuccess = () => resolve(req.result || null);
                    req.onerror = (e) => reject(e.target.error);
                } catch(e) { reject(e); }
            });
        },
        
        deletePet: async function(id) {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                try {
                    const tx = db.transaction(STORE_NAME_PETS, 'readwrite');
                    const store = tx.objectStore(STORE_NAME_PETS);
                    store.delete(id);
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = (e) => reject(e.target.error);
                } catch(e) { reject(e); }
            });
        },

        // --- 寵物事件日誌接口 ---
        savePetLog: async function(logData) {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                try {
                    const tx = db.transaction(STORE_NAME_PET_LOGS, 'readwrite');
                    const store = tx.objectStore(STORE_NAME_PET_LOGS);
                    if (!logData.id) logData.id = 'log_' + Date.now();
                    if (!logData.timestamp) logData.timestamp = Date.now();
                    store.put(logData);
                    tx.oncomplete = () => resolve(logData.id);
                    tx.onerror = (e) => reject(e.target.error);
                } catch (e) { reject(e); }
            });
        },

        getRelatedPetLogs: async function(petId) {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                try {
                    const tx = db.transaction(STORE_NAME_PET_LOGS, 'readonly');
                    const store = tx.objectStore(STORE_NAME_PET_LOGS);
                    const req = store.getAll();
                    req.onsuccess = () => {
                        let logs = req.result || [];
                        if (petId) {
                            logs = logs.filter(log => 
                                log.participants && Array.isArray(log.participants) && log.participants.includes(petId)
                            );
                        }
                        logs.sort((a, b) => b.timestamp - a.timestamp);
                        resolve(logs);
                    };
                    req.onerror = (e) => reject(e.target.error);
                } catch (e) { reject(e); }
            });
        },

        getAllPetLogs: async function() {
            return this.getRelatedPetLogs(null);
        },

        clearPetLogs: async function() {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                try {
                    const tx = db.transaction(STORE_NAME_PET_LOGS, 'readwrite');
                    const store = tx.objectStore(STORE_NAME_PET_LOGS);
                    store.clear();
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = (e) => reject(e.target.error);
                } catch(e) { reject(e); }
            });
        },

        // --- 圖片儲存接口 ---
        saveImage: async function(id, f) { 
            const db = await this.init(); 
            return new Promise((r, j) => {
                try {
                    const rd = new FileReader();
                    rd.onload = () => {
                        const b = new Blob([rd.result], {type: f.type});
                        const tx = db.transaction(STORE_NAME_IMAGES, 'readwrite');
                        tx.objectStore(STORE_NAME_IMAGES).put({id: id, data: b});
                        tx.oncomplete = () => r(id);
                        tx.onerror = e => j(e.target.error);
                    };
                    rd.readAsArrayBuffer(f);
                } catch(e) { j(e); }
            });
        },

        getImage: async function(id) { 
            const db = await this.init(); 
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_IMAGES, 'readonly');
                    const req = tx.objectStore(STORE_NAME_IMAGES).get(id);
                    req.onsuccess = () => { r(req.result ? URL.createObjectURL(req.result.data) : null); };
                    req.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        },

        // --- 育兒系統背景圖接口 ---
        saveChildBg: async function(childId, base64) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_IMAGES, 'readwrite');
                    tx.objectStore(STORE_NAME_IMAGES).put({ id: 'child_bg_' + childId, data: base64 });
                    tx.oncomplete = () => r(true);
                    tx.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        },

        getChildBg: async function(childId) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_IMAGES, 'readonly');
                    const req = tx.objectStore(STORE_NAME_IMAGES).get('child_bg_' + childId);
                    req.onsuccess = () => r(req.result ? req.result.data : null);
                    req.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        },

        deleteChildBg: async function(childId) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_IMAGES, 'readwrite');
                    tx.objectStore(STORE_NAME_IMAGES).delete('child_bg_' + childId);
                    tx.oncomplete = () => r(true);
                    tx.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        },

        // --- 聊天系統接口 ---
        saveApiChat: async function(id, d) { 
            const db = await this.init(); 
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_CHATS, 'readwrite');
                    tx.objectStore(STORE_NAME_CHATS).put({id: id, chatId: id, data: d, timestamp: Date.now()});
                    tx.oncomplete = () => r(id);
                    tx.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        },

        getApiChat: async function(id) { 
            const db = await this.init(); 
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_CHATS, 'readonly');
                    const req = tx.objectStore(STORE_NAME_CHATS).get(id);
                    req.onsuccess = () => r(req.result ? req.result.data : null);
                    req.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        },

        getAllApiChats: async function() { 
            const db = await this.init(); 
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_CHATS, 'readonly');
                    const req = tx.objectStore(STORE_NAME_CHATS).getAll();
                    req.onsuccess = () => {
                        const c = {};
                        if(req.result) req.result.forEach(i => { c[i.chatId] = i.data; });
                        r(c);
                    };
                    req.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        },

        deleteApiChat: async function(id) { 
            const db = await this.init(); 
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_CHATS, 'readwrite');
                    tx.objectStore(STORE_NAME_CHATS).delete(id);
                    tx.oncomplete = () => r(true);
                    tx.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        },
        
        // --- WB (微博) 接口 ---
        saveWbPost: async function(p) { 
            const db = await this.init(); 
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_WB, 'readwrite');
                    if(!p.timestamp) p.timestamp = Date.now();
                    tx.objectStore(STORE_NAME_WB).put(p);
                    tx.oncomplete = () => r(p.id);
                    tx.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        },

        getAllWbPosts: async function() { 
            const db = await this.init(); 
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_WB, 'readonly');
                    const req = tx.objectStore(STORE_NAME_WB).getAll();
                    req.onsuccess = () => {
                        let p = req.result || [];
                        p.sort((a,b) => b.timestamp - a.timestamp);
                        r(p);
                    };
                    req.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        },

        deleteWbPost: async function(id) { 
            const db = await this.init(); 
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_WB, 'readwrite');
                    tx.objectStore(STORE_NAME_WB).delete(id);
                    tx.oncomplete = () => r(true);
                    tx.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        },

        clearWbPosts: async function() { 
            const db = await this.init(); 
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_WB, 'readwrite');
                    tx.objectStore(STORE_NAME_WB).clear();
                    tx.oncomplete = () => r(true);
                    tx.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        },
        
        // --- 偵探調查接口 ---
        saveInvestigationState: async function(chatId, d) { 
            const db = await this.init(); 
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_INV, 'readwrite');
                    tx.objectStore(STORE_NAME_INV).put({id: chatId, ...d, timestamp: Date.now()});
                    tx.oncomplete = () => r(true);
                    tx.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        },

        getInvestigationState: async function(chatId) { 
            const db = await this.init(); 
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_INV, 'readonly');
                    const req = tx.objectStore(STORE_NAME_INV).get(chatId);
                    req.onsuccess = () => r(req.result || null);
                    req.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        },

        clearInvestigationState: async function(chatId) { 
            const db = await this.init(); 
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_INV, 'readwrite');
                    tx.objectStore(STORE_NAME_INV).delete(chatId);
                    tx.oncomplete = () => r(true);
                    tx.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        },
        
        // --- 地圖與設施接口 ---
        saveMapFacilityData: async function(z, f, d) { 
            const db = await this.init(); 
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_MAP, 'readwrite');
                    const id = `${z}_${f}`;
                    tx.objectStore(STORE_NAME_MAP).put({id: id, zoneId: z, facilityKey: f, ...d, timestamp: Date.now()});
                    tx.oncomplete = () => r(true);
                    tx.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        },

        getMapFacilityData: async function(z, f) { 
            const db = await this.init(); 
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_MAP, 'readonly');
                    const id = `${z}_${f}`;
                    const req = tx.objectStore(STORE_NAME_MAP).get(id);
                    req.onsuccess = () => r(req.result || null);
                    req.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        },

        clearAllMapData: async function() { 
            const db = await this.init(); 
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_MAP, 'readwrite');
                    tx.objectStore(STORE_NAME_MAP).clear();
                    tx.oncomplete = () => r(true);
                    tx.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        },

        // --- 大廳對話歷史接口 ---
        saveLobbyHistory: async function(chatId, data) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_LOBBY, 'readwrite');
                    tx.objectStore(STORE_NAME_LOBBY).put({ id: chatId, ...data, timestamp: Date.now() });
                    tx.oncomplete = () => r(true);
                    tx.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        },

        getLobbyHistory: async function(chatId) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_LOBBY, 'readonly');
                    const req = tx.objectStore(STORE_NAME_LOBBY).get(chatId);
                    req.onsuccess = () => r(req.result || null);
                    req.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        },

        deleteLobbyHistory: async function(chatId) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_LOBBY, 'readwrite');
                    tx.objectStore(STORE_NAME_LOBBY).delete(chatId);
                    tx.oncomplete = () => r(true);
                    tx.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        },

        getAllLobbyHistories: async function() {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_LOBBY, 'readonly');
                    const req = tx.objectStore(STORE_NAME_LOBBY).getAll();
                    req.onsuccess = () => r(req.result || []);
                    req.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        }
    };

    // --- 成就系統接口 ---
    Object.assign(win.OS_DB, {
        addAchievement: async function(entry) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_ACH, 'readwrite');
                    tx.objectStore(STORE_NAME_ACH).put(entry);
                    tx.oncomplete = () => r(entry.id);
                    tx.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        },

        updateAchievement: async function(entry) {
            return this.addAchievement(entry); 
        },

        getAchievements: async function(chatId) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_ACH, 'readonly');
                    const req = tx.objectStore(STORE_NAME_ACH).getAll();
                    req.onsuccess = () => {
                        let list = req.result || [];
                        if (chatId) list = list.filter(a => a.chatId === chatId);
                        list.sort((a, b) => a.timestamp - b.timestamp);
                        r(list);
                    };
                    req.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        },

        clearAchievements: async function(chatId) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_ACH, 'readwrite');
                    const store = tx.objectStore(STORE_NAME_ACH);
                    if (!chatId) { store.clear(); tx.oncomplete = () => r(true); tx.onerror = e => j(e.target.error); return; }
                    const req = store.getAll();
                    req.onsuccess = () => {
                        (req.result || []).filter(a => a.chatId === chatId).forEach(a => store.delete(a.id));
                        tx.oncomplete = () => r(true);
                    };
                    tx.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        }
    });

    // --- 寶寶聊天記錄接口 ---
    Object.assign(win.OS_DB, {
        saveChildChatHistory: async function(childId, messages) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_CHILD_CHAT, 'readwrite');
                    tx.objectStore(STORE_NAME_CHILD_CHAT).put({ id: childId, messages, timestamp: Date.now() });
                    tx.oncomplete = () => r(true);
                    tx.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        },

        getChildChatHistory: async function(childId) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_CHILD_CHAT, 'readonly');
                    const req = tx.objectStore(STORE_NAME_CHILD_CHAT).get(childId);
                    req.onsuccess = () => r(req.result ? req.result.messages : []);
                    req.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        },

        deleteChildChatHistory: async function(childId) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_CHILD_CHAT, 'readwrite');
                    tx.objectStore(STORE_NAME_CHILD_CHAT).delete(childId);
                    tx.oncomplete = () => r(true);
                    tx.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        }
    });

    // --- 世界書條目接口 ---
    Object.assign(win.OS_DB, {
        saveWorldbookEntry: async function(entry) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    if (!entry.id) entry.id = 'wb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
                    entry.updatedAt = Date.now();
                    const tx = db.transaction(STORE_NAME_WORLDBOOK, 'readwrite');
                    tx.objectStore(STORE_NAME_WORLDBOOK).put(entry);
                    tx.oncomplete = () => r(entry.id);
                    tx.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        },

        getAllWorldbookEntries: async function() {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_WORLDBOOK, 'readonly');
                    const req = tx.objectStore(STORE_NAME_WORLDBOOK).getAll();
                    req.onsuccess = () => r((req.result || []).sort((a, b) => (a.order ?? 999) - (b.order ?? 999)));
                    req.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        },

        deleteWorldbookEntry: async function(id) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_WORLDBOOK, 'readwrite');
                    tx.objectStore(STORE_NAME_WORLDBOOK).delete(id);
                    tx.oncomplete = () => r(true);
                    tx.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        },

        clearWorldbookEntries: async function() {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_WORLDBOOK, 'readwrite');
                    tx.objectStore(STORE_NAME_WORLDBOOK).clear();
                    tx.oncomplete = () => r(true);
                    tx.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        }
    });

    // --- VN 章節存檔接口 ---
    Object.assign(win.OS_DB, {
        saveVnChapter: async function(chapter) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    if (!chapter.id) chapter.id = 'vn_ch_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5);
                    chapter.updatedAt = Date.now();
                    if (!chapter.createdAt) chapter.createdAt = Date.now();
                    const tx = db.transaction(STORE_NAME_VN_CHAPTERS, 'readwrite');
                    tx.objectStore(STORE_NAME_VN_CHAPTERS).put(chapter);
                    tx.oncomplete = () => r(chapter.id);
                    tx.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        },

        getAllVnChapters: async function() {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_VN_CHAPTERS, 'readonly');
                    const req = tx.objectStore(STORE_NAME_VN_CHAPTERS).getAll();
                    req.onsuccess = () => r((req.result || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
                    req.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        },

        deleteVnChapter: async function(id) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_VN_CHAPTERS, 'readwrite');
                    tx.objectStore(STORE_NAME_VN_CHAPTERS).delete(id);
                    tx.oncomplete = () => r(true);
                    tx.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        },

        deleteVnChaptersByStoryId: async function(storyId) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_VN_CHAPTERS, 'readwrite');
                    const store = tx.objectStore(STORE_NAME_VN_CHAPTERS);
                    const req = store.getAll();
                    req.onsuccess = () => {
                        (req.result || [])
                            .filter(ch => ch.storyId === storyId)
                            .forEach(ch => store.delete(ch.id));
                        tx.oncomplete = () => r(true);
                    };
                    tx.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        }
    });

    // =========================================================
    // 🔥 以下為本次新增：變數工坊 (AVS) 相關接口
    // =========================================================
    Object.assign(win.OS_DB, {
        saveVarPack: async function(pack) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_VAR_PACKS, 'readwrite');
                    tx.objectStore(STORE_NAME_VAR_PACKS).put(pack);
                    tx.oncomplete = () => r(pack.id);
                    tx.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        },

        getAllVarPacks: async function() {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_VAR_PACKS, 'readonly');
                    const req = tx.objectStore(STORE_NAME_VAR_PACKS).getAll();
                    req.onsuccess = () => r(req.result || []);
                    req.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        },

        deleteVarPack: async function(id) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_VAR_PACKS, 'readwrite');
                    tx.objectStore(STORE_NAME_VAR_PACKS).delete(id);
                    tx.oncomplete = () => r(true);
                    tx.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        },

        // UI Templates
        saveUITemplate: async function(templateData) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    if (!templateData.createdAt) templateData.createdAt = Date.now();
                    const tx = db.transaction(STORE_NAME_UI_TEMPLATES, 'readwrite');
                    tx.objectStore(STORE_NAME_UI_TEMPLATES).put(templateData);
                    tx.oncomplete = () => r(templateData.id);
                    tx.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        },

        getAllUITemplates: async function() {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_UI_TEMPLATES, 'readonly');
                    const req = tx.objectStore(STORE_NAME_UI_TEMPLATES).getAll();
                    req.onsuccess = () => r((req.result || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
                    req.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        },

        deleteUITemplate: async function(id) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_UI_TEMPLATES, 'readwrite');
                    tx.objectStore(STORE_NAME_UI_TEMPLATES).delete(id);
                    tx.oncomplete = () => r(true);
                    tx.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        }
    });

    win.WX_DB = win.OS_DB;
})();