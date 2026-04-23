// ----------------------------------------------------------------
// [檔案] os_db.js (V20 - 建立獨立 Studio 草稿庫)
// 路徑：os_phone/os/os_db.js
// 職責：管理 IndexedDB 資料庫。支援酒館與獨立版雙通向。
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入系統資料庫 (System Storage V20)...');
    const win = window.parent || window; 

    const DB_NAME = 'WeChat_Simulator_DB';
    const DB_VERSION = 20; // 🔥 升級至 V20

    const STORE_NAME_IMAGES = 'images';
    const STORE_NAME_CHATS = 'api_chats';
    const STORE_NAME_WB = 'wb_posts';
    const STORE_NAME_INV = 'investigation_data';
    const STORE_NAME_MAP = 'map_data';
    const STORE_NAME_PETS = 'pets';
    const STORE_NAME_PET_LOGS = 'pet_logs';
    const STORE_NAME_LOBBY      = 'lobby_history';
    const STORE_NAME_ACH        = 'achievements';
    const STORE_NAME_CHILD_CHAT = 'child_chat_history';
    const STORE_NAME_WORLDBOOK  = 'world_book_entries';
    const STORE_NAME_VN_CHAPTERS = 'vn_chapters';
    
    const STORE_NAME_VAR_PACKS = 'var_packs';           
    const STORE_NAME_UI_TEMPLATES = 'ui_templates';     
    const STORE_NAME_STUDIO = 'studio_chats';
    const STORE_NAME_STUDIO_DRAFTS = 'studio_drafts'; // 🔥 新增：純淨草稿庫

    let dbInstance = null;

    win.OS_DB = {
        init: function() {
            return new Promise((resolve, reject) => {
                if (dbInstance) { resolve(dbInstance); return; }
                
                const request = indexedDB.open(DB_NAME, DB_VERSION); 
                
                request.onupgradeneeded = (event) => {
                    console.log(`[OS_DB] 資料庫正在升級... (V${event.oldVersion} -> V${event.newVersion})`);
                    const db = event.target.result;

                    const stores = [
                        STORE_NAME_IMAGES, STORE_NAME_CHATS, STORE_NAME_WB,
                        STORE_NAME_INV, STORE_NAME_MAP, STORE_NAME_PETS,
                        STORE_NAME_PET_LOGS, STORE_NAME_LOBBY, STORE_NAME_ACH,
                        STORE_NAME_CHILD_CHAT, STORE_NAME_WORLDBOOK,
                        STORE_NAME_VN_CHAPTERS, STORE_NAME_VAR_PACKS,
                        STORE_NAME_UI_TEMPLATES, STORE_NAME_STUDIO,
                        STORE_NAME_STUDIO_DRAFTS // 🔥 註冊草稿庫
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

        // --- 🎨 靈感創作室 (Studio) 對話快取 ---
        saveStudioChat: async function(modeId, messages) {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                try {
                    const tx = db.transaction(STORE_NAME_STUDIO, 'readwrite');
                    tx.objectStore(STORE_NAME_STUDIO).put({ id: modeId, messages: messages, timestamp: Date.now() });
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = (e) => reject(e.target.error);
                } catch(e) { reject(e); }
            });
        },
        getStudioChat: async function(modeId) {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                try {
                    const req = db.transaction(STORE_NAME_STUDIO, 'readonly').objectStore(STORE_NAME_STUDIO).get(modeId);
                    req.onsuccess = () => resolve(req.result ? req.result.messages : []);
                    req.onerror = (e) => reject(e.target.error);
                } catch(e) { reject(e); }
            });
        },
        clearStudioChat: async function(modeId) {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                try {
                    const tx = db.transaction(STORE_NAME_STUDIO, 'readwrite');
                    tx.objectStore(STORE_NAME_STUDIO).delete(modeId);
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = (e) => reject(e.target.error);
                } catch(e) { reject(e); }
            });
        },

        // --- 寵物、圖片、聊天歷史 (維持原樣) ---
        savePet: async function(petData) {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                try {
                    const tx = db.transaction(STORE_NAME_PETS, 'readwrite');
                    if (!petData.id) petData.id = 'pet_' + Date.now();
                    tx.objectStore(STORE_NAME_PETS).put(petData);
                    tx.oncomplete = () => resolve(petData.id);
                    tx.onerror = (e) => reject(e.target.error);
                } catch (e) { reject(e); }
            });
        },
        getAllPets: async function() {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                try {
                    const req = db.transaction(STORE_NAME_PETS, 'readonly').objectStore(STORE_NAME_PETS).getAll();
                    req.onsuccess = () => resolve(req.result || []);
                    req.onerror = (e) => reject(e.target.error);
                } catch (e) { reject(e); }
            });
        },
        getPet: async function(id) {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                try {
                    const req = db.transaction(STORE_NAME_PETS, 'readonly').objectStore(STORE_NAME_PETS).get(id);
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
                    tx.objectStore(STORE_NAME_PETS).delete(id);
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = (e) => reject(e.target.error);
                } catch(e) { reject(e); }
            });
        },
        savePetLog: async function(logData) {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                try {
                    const tx = db.transaction(STORE_NAME_PET_LOGS, 'readwrite');
                    if (!logData.id) logData.id = 'log_' + Date.now();
                    if (!logData.timestamp) logData.timestamp = Date.now();
                    tx.objectStore(STORE_NAME_PET_LOGS).put(logData);
                    tx.oncomplete = () => resolve(logData.id);
                    tx.onerror = (e) => reject(e.target.error);
                } catch (e) { reject(e); }
            });
        },
        getRelatedPetLogs: async function(petId) {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                try {
                    const req = db.transaction(STORE_NAME_PET_LOGS, 'readonly').objectStore(STORE_NAME_PET_LOGS).getAll();
                    req.onsuccess = () => {
                        let logs = req.result || [];
                        if (petId) logs = logs.filter(log => log.participants && log.participants.includes(petId));
                        resolve(logs.sort((a, b) => b.timestamp - a.timestamp));
                    };
                    req.onerror = (e) => reject(e.target.error);
                } catch (e) { reject(e); }
            });
        },
        getAllPetLogs: async function() { return this.getRelatedPetLogs(null); },
        clearPetLogs: async function() {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                try {
                    const tx = db.transaction(STORE_NAME_PET_LOGS, 'readwrite');
                    tx.objectStore(STORE_NAME_PET_LOGS).clear();
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = (e) => reject(e.target.error);
                } catch(e) { reject(e); }
            });
        },
        saveImage: async function(id, f) { 
            const db = await this.init(); 
            return new Promise((r, j) => {
                try {
                    const rd = new FileReader();
                    rd.onload = () => {
                        const tx = db.transaction(STORE_NAME_IMAGES, 'readwrite');
                        tx.objectStore(STORE_NAME_IMAGES).put({id: id, data: new Blob([rd.result], {type: f.type})});
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
                    const req = db.transaction(STORE_NAME_IMAGES, 'readonly').objectStore(STORE_NAME_IMAGES).get(id);
                    req.onsuccess = () => { r(req.result ? URL.createObjectURL(req.result.data) : null); };
                    req.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        },
        saveChildBg: async function(childId, base64) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_IMAGES, 'readwrite');
                    tx.objectStore(STORE_NAME_IMAGES).put({ id: 'child_bg_' + childId, data: base64 });
                    tx.oncomplete = () => r(true);
                } catch(e) { j(e); }
            });
        },
        getChildBg: async function(childId) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const req = db.transaction(STORE_NAME_IMAGES, 'readonly').objectStore(STORE_NAME_IMAGES).get('child_bg_' + childId);
                    req.onsuccess = () => r(req.result ? req.result.data : null);
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
                } catch(e) { j(e); }
            });
        },
        saveApiChat: async function(id, d) { 
            const db = await this.init(); 
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_CHATS, 'readwrite');
                    tx.objectStore(STORE_NAME_CHATS).put({id: id, chatId: id, data: d, timestamp: Date.now()});
                    tx.oncomplete = () => r(id);
                } catch(e) { j(e); }
            });
        },
        getApiChat: async function(id) { 
            const db = await this.init(); 
            return new Promise((r, j) => {
                try {
                    const req = db.transaction(STORE_NAME_CHATS, 'readonly').objectStore(STORE_NAME_CHATS).get(id);
                    req.onsuccess = () => r(req.result ? req.result.data : null);
                } catch(e) { j(e); }
            });
        },
        getAllApiChats: async function() { 
            const db = await this.init(); 
            return new Promise((r, j) => {
                try {
                    const req = db.transaction(STORE_NAME_CHATS, 'readonly').objectStore(STORE_NAME_CHATS).getAll();
                    req.onsuccess = () => {
                        const c = {};
                        if(req.result) req.result.forEach(i => { c[i.chatId] = i.data; });
                        r(c);
                    };
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
                } catch(e) { j(e); }
            });
        },
        saveWbPost: async function(p) { 
            const db = await this.init(); 
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_WB, 'readwrite');
                    if(!p.timestamp) p.timestamp = Date.now();
                    tx.objectStore(STORE_NAME_WB).put(p);
                    tx.oncomplete = () => r(p.id);
                } catch(e) { j(e); }
            });
        },
        getAllWbPosts: async function() { 
            const db = await this.init(); 
            return new Promise((r, j) => {
                try {
                    const req = db.transaction(STORE_NAME_WB, 'readonly').objectStore(STORE_NAME_WB).getAll();
                    req.onsuccess = () => r((req.result || []).sort((a,b) => b.timestamp - a.timestamp));
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
                } catch(e) { j(e); }
            });
        },
        saveInvestigationState: async function(chatId, d) { 
            const db = await this.init(); 
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_INV, 'readwrite');
                    tx.objectStore(STORE_NAME_INV).put({id: chatId, ...d, timestamp: Date.now()});
                    tx.oncomplete = () => r(true);
                } catch(e) { j(e); }
            });
        },
        getInvestigationState: async function(chatId) { 
            const db = await this.init(); 
            return new Promise((r, j) => {
                try {
                    const req = db.transaction(STORE_NAME_INV, 'readonly').objectStore(STORE_NAME_INV).get(chatId);
                    req.onsuccess = () => r(req.result || null);
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
                } catch(e) { j(e); }
            });
        },
        saveMapFacilityData: async function(z, f, d) { 
            const db = await this.init(); 
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_MAP, 'readwrite');
                    tx.objectStore(STORE_NAME_MAP).put({id: `${z}_${f}`, zoneId: z, facilityKey: f, ...d, timestamp: Date.now()});
                    tx.oncomplete = () => r(true);
                } catch(e) { j(e); }
            });
        },
        getMapFacilityData: async function(z, f) { 
            const db = await this.init(); 
            return new Promise((r, j) => {
                try {
                    const req = db.transaction(STORE_NAME_MAP, 'readonly').objectStore(STORE_NAME_MAP).get(`${z}_${f}`);
                    req.onsuccess = () => r(req.result || null);
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
                } catch(e) { j(e); }
            });
        },
        saveLobbyHistory: async function(chatId, data) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_LOBBY, 'readwrite');
                    tx.objectStore(STORE_NAME_LOBBY).put({ id: chatId, ...data, timestamp: Date.now() });
                    tx.oncomplete = () => r(true);
                } catch(e) { j(e); }
            });
        },
        getLobbyHistory: async function(chatId) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const req = db.transaction(STORE_NAME_LOBBY, 'readonly').objectStore(STORE_NAME_LOBBY).get(chatId);
                    req.onsuccess = () => r(req.result || null);
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
                } catch(e) { j(e); }
            });
        },
        getAllLobbyHistories: async function() {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const req = db.transaction(STORE_NAME_LOBBY, 'readonly').objectStore(STORE_NAME_LOBBY).getAll();
                    req.onsuccess = () => r(req.result || []);
                } catch(e) { j(e); }
            });
        }
    };

    Object.assign(win.OS_DB, {
        addAchievement: async function(entry) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_ACH, 'readwrite');
                    tx.objectStore(STORE_NAME_ACH).put(entry);
                    tx.oncomplete = () => r(entry.id);
                } catch(e) { j(e); }
            });
        },
        updateAchievement: async function(entry) { return this.addAchievement(entry); },
        getAchievements: async function(chatId) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const req = db.transaction(STORE_NAME_ACH, 'readonly').objectStore(STORE_NAME_ACH).getAll();
                    req.onsuccess = () => {
                        let list = req.result || [];
                        if (chatId) list = list.filter(a => a.chatId === chatId);
                        r(list.sort((a, b) => a.timestamp - b.timestamp));
                    };
                } catch(e) { j(e); }
            });
        },
        clearAchievements: async function(chatId) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_ACH, 'readwrite');
                    const store = tx.objectStore(STORE_NAME_ACH);
                    if (!chatId) { store.clear(); tx.oncomplete = () => r(true); return; }
                    const req = store.getAll();
                    req.onsuccess = () => {
                        (req.result || []).filter(a => a.chatId === chatId).forEach(a => store.delete(a.id));
                        tx.oncomplete = () => r(true);
                    };
                } catch(e) { j(e); }
            });
        }
    });

    Object.assign(win.OS_DB, {
        saveChildChatHistory: async function(childId, messages) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_CHILD_CHAT, 'readwrite');
                    tx.objectStore(STORE_NAME_CHILD_CHAT).put({ id: childId, messages, timestamp: Date.now() });
                    tx.oncomplete = () => r(true);
                } catch(e) { j(e); }
            });
        },
        getChildChatHistory: async function(childId) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const req = db.transaction(STORE_NAME_CHILD_CHAT, 'readonly').objectStore(STORE_NAME_CHILD_CHAT).get(childId);
                    req.onsuccess = () => r(req.result ? req.result.messages : []);
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
                } catch(e) { j(e); }
            });
        }
    });

    // --- 📖 正式世界書條目接口 ---
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
                } catch(e) { j(e); }
            });
        },
        getAllWorldbookEntries: async function() {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const req = db.transaction(STORE_NAME_WORLDBOOK, 'readonly').objectStore(STORE_NAME_WORLDBOOK).getAll();
                    req.onsuccess = () => r((req.result || []).sort((a, b) => (a.order ?? 999) - (b.order ?? 999)));
                } catch(e) { j(e); }
            });
        },
        getWorldbookEntriesByCategory: async function(categoryName) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const req = db.transaction(STORE_NAME_WORLDBOOK, 'readonly').objectStore(STORE_NAME_WORLDBOOK).getAll();
                    req.onsuccess = () => {
                        const all = req.result || [];
                        r(all.filter(e => e.category === categoryName));
                    };
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
                } catch(e) { j(e); }
            });
        }
    });

    // =========================================================
    // 🔥 新增：純淨草稿庫接口 (與世界書徹底隔離)
    // =========================================================
    Object.assign(win.OS_DB, {
        saveStudioDraft: async function(entry) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    if (!entry.id) entry.id = 'draft_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
                    entry.updatedAt = Date.now();
                    const tx = db.transaction(STORE_NAME_STUDIO_DRAFTS, 'readwrite');
                    tx.objectStore(STORE_NAME_STUDIO_DRAFTS).put(entry);
                    tx.oncomplete = () => r(entry.id);
                } catch(e) { j(e); }
            });
        },
        getAllStudioDrafts: async function() {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const req = db.transaction(STORE_NAME_STUDIO_DRAFTS, 'readonly').objectStore(STORE_NAME_STUDIO_DRAFTS).getAll();
                    req.onsuccess = () => r(req.result || []);
                } catch(e) { j(e); }
            });
        },
        getStudioDraftsByCategory: async function(categoryName) {
            const drafts = await this.getAllStudioDrafts();
            return drafts.filter(e => e.category === categoryName);
        },
        deleteStudioDraftsByCategory: async function(categoryName) {
            const drafts = await this.getAllStudioDrafts();
            const targets = drafts.filter(e => e.category === categoryName);
            for (const entry of targets) await this.deleteStudioDraft(entry.id);
            return targets.length;
        },
        deleteStudioDraft: async function(id) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_STUDIO_DRAFTS, 'readwrite');
                    tx.objectStore(STORE_NAME_STUDIO_DRAFTS).delete(id);
                    tx.oncomplete = () => r(true);
                } catch(e) { j(e); }
            });
        },
        clearStudioDrafts: async function() {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_STUDIO_DRAFTS, 'readwrite');
                    tx.objectStore(STORE_NAME_STUDIO_DRAFTS).clear();
                    tx.oncomplete = () => r(true);
                } catch(e) { j(e); }
            });
        }
    });

    // --- VN 與其他系統 (維持原樣) ---
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
                } catch(e) { j(e); }
            });
        },
        getAllVnChapters: async function() {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const req = db.transaction(STORE_NAME_VN_CHAPTERS, 'readonly').objectStore(STORE_NAME_VN_CHAPTERS).getAll();
                    req.onsuccess = () => r((req.result || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
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
                        (req.result || []).filter(ch => ch.storyId === storyId).forEach(ch => store.delete(ch.id));
                        tx.oncomplete = () => r(true);
                    };
                } catch(e) { j(e); }
            });
        }
    });

    Object.assign(win.OS_DB, {
        saveVarPack: async function(pack) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_VAR_PACKS, 'readwrite');
                    tx.objectStore(STORE_NAME_VAR_PACKS).put(pack);
                    tx.oncomplete = () => r(pack.id);
                } catch(e) { j(e); }
            });
        },
        getAllVarPacks: async function() {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const req = db.transaction(STORE_NAME_VAR_PACKS, 'readonly').objectStore(STORE_NAME_VAR_PACKS).getAll();
                    req.onsuccess = () => r(req.result || []);
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
                } catch(e) { j(e); }
            });
        },
        saveUITemplate: async function(templateData) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    if (!templateData.createdAt) templateData.createdAt = Date.now();
                    const tx = db.transaction(STORE_NAME_UI_TEMPLATES, 'readwrite');
                    tx.objectStore(STORE_NAME_UI_TEMPLATES).put(templateData);
                    tx.oncomplete = () => r(templateData.id);
                } catch(e) { j(e); }
            });
        },
        getAllUITemplates: async function() {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const req = db.transaction(STORE_NAME_UI_TEMPLATES, 'readonly').objectStore(STORE_NAME_UI_TEMPLATES).getAll();
                    req.onsuccess = () => r((req.result || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
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
                } catch(e) { j(e); }
            });
        },
        saveVNTagTemplate: async function(tagData) {
            if (!tagData.id) {
                tagData.id = 'vn_tag_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
            }
            tagData.isVNTag = true;
            return this.saveUITemplate(tagData);
        },
        getAllVNTagTemplates: async function() {
            const allTpls = await this.getAllUITemplates();
            return allTpls.filter(t => t.regexString || t.isBlock || t.isVNTag);
        }
    });

    Object.assign(win.OS_DB, {
        factoryReset: async function() {
            return new Promise((resolve, reject) => {
                try {
                    if (dbInstance) {
                        dbInstance.close();
                        dbInstance = null;
                    }
                    const req = indexedDB.deleteDatabase(DB_NAME);
                    req.onsuccess = () => {
                        console.log('[OS_DB] 💥 資料庫已徹底格式化刪除 (Factory Reset)');
                        resolve(true);
                    };
                    req.onerror = (e) => reject(e.target.error);
                } catch(e) { reject(e); }
            });
        }
    });

    win.WX_DB = win.OS_DB;
})();