// ----------------------------------------------------------------
// [檔案] os_db.js (V23 - 加入狀態資料庫 state_data)
// 路徑：os_phone/os/os_db.js
// 職責：管理 IndexedDB 資料庫。支援酒館與獨立版雙通向。
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入系統資料庫 (System Storage V23)...');
    const win = window.parent || window;

    const DB_NAME = 'WeChat_Simulator_DB';
    const DB_VERSION = 28; // 🔥 V28：通用 app 資料庫 app_data（創作室生的 app 用 st.dbSave/dbLoad；id=appId::scope::key）

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
    const STORE_NAME_STUDIO_DRAFTS = 'studio_drafts';
    const STORE_NAME_VN_MEMORIES  = 'vn_memories';   // 🔥 V21：向量記憶庫
    const STORE_NAME_VN_SUMMARIES = 'vn_grand_summaries'; // V22：大總結儲存
    const STORE_NAME_STATE_DATA   = 'state_data';    // 🔥 V23：狀態資料庫（副模型抽劇情狀態，key = chatId）
    const STORE_NAME_LOBBY_SUM_IDX = 'lobby_summary_index'; // 🔥 V24：酒館大廳跨卡總結索引（結語 + 角色名單，給瀅瀅/柴郡注 sysPrompt）
    const STORE_NAME_PHONE_APPS = 'phone_apps'; // 🔥 V25：手機殼下載的功能型 HTML app（id,name,emoji,iconUrl,html,source,createdAt）
    const STORE_NAME_APP_MEM = 'app_memory'; // 🔥 V26：插件通用記憶桶（角色對話型插件 st.remember 寫入；key = appId::角色名）
    const STORE_NAME_TAVERN_SUMMARY = 'tavern_summary'; // 🔥 V27：酒館大總結（key = chatId，一卡一筆全文存檔；程式壓縮注入、不再放世界書）
    const STORE_NAME_APP_DATA = 'app_data'; // 🔥 V28：通用 app 資料庫（創作室生的 app 用 st.dbSave/dbLoad；id = appId::scope::key）

    let dbInstance = null;

    // 取得當前 tavern 劇情存檔 id（與 state_runtime 同款正規化）→ 給 app 紀錄蓋章做 chatId 隔離
    function _curTavernChatId() {
        try {
            const ctx = win.SillyTavern && win.SillyTavern.getContext ? win.SillyTavern.getContext() : null;
            let cid = ctx && ctx.chatId;
            if (cid == null && win.SillyTavern && typeof win.SillyTavern.getCurrentChatId === 'function') cid = win.SillyTavern.getCurrentChatId();
            if (cid == null) return null;
            return String(cid).replace(/^.*[\\/]/, '').replace(/\.(jsonl|json)$/i, '');
        } catch (e) { return null; }
    }

    win.OS_DB = {
        currentChatId: function() { return _curTavernChatId(); },
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
                        STORE_NAME_STUDIO_DRAFTS,
                        STORE_NAME_VN_MEMORIES,  // 🔥 V21：向量記憶庫
                        STORE_NAME_VN_SUMMARIES, // 🔥 V22：大總結儲存
                        STORE_NAME_STATE_DATA,   // 🔥 V23：狀態資料庫
                        STORE_NAME_LOBBY_SUM_IDX,// 🔥 V24：酒館大廳跨卡總結索引
                        STORE_NAME_PHONE_APPS,   // 🔥 V25：手機殼 app 商店
                        STORE_NAME_APP_MEM,      // 🔥 V26：插件通用記憶桶
                        STORE_NAME_TAVERN_SUMMARY, // 🔥 V27：酒館大總結（key=chatId）
                        STORE_NAME_APP_DATA // 🔥 V28：通用 app 資料庫
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

        // --- 📦 通用 App 資料庫（創作室生的 app 用 st.dbSave/dbLoad；id = appId::scope::key）---
        saveAppData: async function(appId, key, value, chatId) {
            const db = await this.init();
            const id = String(appId || 'app') + '::' + (chatId ? ('chat:' + chatId) : 'global') + '::' + String(key || '');
            return new Promise((resolve, reject) => {
                try {
                    const tx = db.transaction(STORE_NAME_APP_DATA, 'readwrite');
                    tx.objectStore(STORE_NAME_APP_DATA).put({ id: id, value: value, ts: Date.now() });
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = (e) => reject(e.target.error);
                } catch (e) { reject(e); }
            });
        },
        getAppData: async function(appId, key, chatId) {
            const db = await this.init();
            const id = String(appId || 'app') + '::' + (chatId ? ('chat:' + chatId) : 'global') + '::' + String(key || '');
            return new Promise((resolve, reject) => {
                try {
                    const req = db.transaction(STORE_NAME_APP_DATA, 'readonly').objectStore(STORE_NAME_APP_DATA).get(id);
                    req.onsuccess = () => resolve(req.result ? req.result.value : null);
                    req.onerror = (e) => reject(e.target.error);
                } catch (e) { reject(e); }
            });
        },
        // 刪掉某 app 的所有 app_data（id = appId::scope::key，前綴 appId:: 全清；卸載 app 用，避免孤兒數據）。
        // 用 '::' 當邊界 → 不會誤刪 appId 前綴相同的別的 app（app_12 不會吃到 app_123）。
        deleteAppDataByApp: async function(appId) {
            const db = await this.init();
            const pre = String(appId || '') + '::';
            return new Promise((resolve, reject) => {
                try {
                    const tx = db.transaction(STORE_NAME_APP_DATA, 'readwrite');
                    const req = tx.objectStore(STORE_NAME_APP_DATA).openCursor();
                    req.onsuccess = (e) => { const cur = e.target.result; if (cur) { if (String(cur.key).indexOf(pre) === 0) cur.delete(); cur.continue(); } };
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = (e) => reject(e.target.error);
                } catch (e) { reject(e); }
            });
        },
        // 整批讀某 app 的 app_data（給「記憶回傳酒館」統一注入用）：回 [{key,scope,value}]，只收 global + 指定 chat。
        getAppDataByApp: async function(appId, chatId) {
            const db = await this.init();
            const pre = String(appId || '') + '::';
            const wantChat = chatId ? ('chat:' + chatId) : null;
            return new Promise((resolve, reject) => {
                try {
                    const out = [];
                    const req = db.transaction(STORE_NAME_APP_DATA, 'readonly').objectStore(STORE_NAME_APP_DATA).openCursor();
                    req.onsuccess = (e) => {
                        const cur = e.target.result;
                        if (!cur) { resolve(out); return; }
                        const id = String(cur.key);
                        if (id.indexOf(pre) === 0) {
                            const rest = id.slice(pre.length);              // scope::key
                            const sep = rest.indexOf('::');
                            const scope = sep > 0 ? rest.slice(0, sep) : '';
                            const key = sep > 0 ? rest.slice(sep + 2) : rest;
                            if (scope === 'global' || (wantChat && scope === wantChat)) {
                                out.push({ key: key, scope: scope, value: (cur.value && cur.value.value) });
                            }
                        }
                        cur.continue();
                    };
                    req.onerror = (e) => reject(e.target.error);
                } catch (e) { reject(e); }
            });
        },
        // 列出 app_data 裡所有出現過的 appId（id 取 '::' 前段），給孤兒掃描用。
        listAppDataAppIds: async function() {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                try {
                    const req = db.transaction(STORE_NAME_APP_DATA, 'readonly').objectStore(STORE_NAME_APP_DATA).getAllKeys();
                    req.onsuccess = () => { const set = {}; (req.result || []).forEach(k => { const s = String(k); const i = s.indexOf('::'); if (i > 0) set[s.slice(0, i)] = 1; }); resolve(Object.keys(set)); };
                    req.onerror = (e) => reject(e.target.error);
                } catch (e) { reject(e); }
            });
        },
        // 刪掉某 app 的所有 app_memory（id = appId::角色名，前綴 appId:: 全清）。
        deleteAppMemoryByApp: async function(appId) {
            const db = await this.init();
            const pre = String(appId || '') + '::';
            return new Promise((resolve, reject) => {
                try {
                    const tx = db.transaction(STORE_NAME_APP_MEM, 'readwrite');
                    const req = tx.objectStore(STORE_NAME_APP_MEM).openCursor();
                    req.onsuccess = (e) => { const cur = e.target.result; if (cur) { if (String(cur.key).indexOf(pre) === 0) cur.delete(); cur.continue(); } };
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = (e) => reject(e.target.error);
                } catch (e) { reject(e); }
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
        // NAI 預設包縮圖：拖圖生預設時把那張圖縮成 ~256px 存這（base64 字串），
        // naiPresets 只存引用 id → 設定檔(localStorage)不被一堆縮圖撐爆。
        saveNaiThumb: async function(id, base64) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_IMAGES, 'readwrite');
                    tx.objectStore(STORE_NAME_IMAGES).put({ id: 'nai_thumb_' + id, data: base64 });
                    tx.oncomplete = () => r(true);
                    tx.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        },
        getNaiThumb: async function(id) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const req = db.transaction(STORE_NAME_IMAGES, 'readonly').objectStore(STORE_NAME_IMAGES).get('nai_thumb_' + id);
                    req.onsuccess = () => r(req.result ? req.result.data : null);
                    req.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        },
        deleteNaiThumb: async function(id) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_IMAGES, 'readwrite');
                    tx.objectStore(STORE_NAME_IMAGES).delete('nai_thumb_' + id);
                    tx.oncomplete = () => r(true);
                    tx.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        },
        saveApiChat: async function(id, d) {
            const db = await this.init();
            // 🔒 chatId 隔離：第一次存檔時蓋上「當前劇情 id」（已有就不覆蓋）→ 注入器只注入當前劇情的對話，避免古代卡冒出現代手機數據
            try { if (d && typeof d === 'object' && d.tavernChatId == null) { const _c = _curTavernChatId(); if (_c != null) d.tavernChatId = _c; } } catch (e) {}
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
        // 當前劇情卡 id（正規化）對外暴露 → 給 wx 清「別卡殘留」時跟下面的濾用同一把尺
        getCurrentCardId: function () { return _curTavernChatId(); },
        // 只取「當前劇情卡」自己的 api_chats：按 saveApiChat 蓋的 tavernChatId 章隔離（與注入器同款），
        // 治「古代卡開 wx 卻列出現代卡聯絡清單」。沒蓋章的舊資料一律保留可見（不弄丟）；
        // 取不到當前卡 id 時退回全部（避免清單整個空掉）。
        getApiChatsForCurrentCard: async function () {
            const all = await this.getAllApiChats();
            const cid = _curTavernChatId();
            if (cid == null) return all;
            const out = {};
            for (const k in all) {
                const d = all[k];
                const tag = (d && typeof d === 'object') ? d.tavernChatId : null;
                if (tag == null || tag === cid) out[k] = d;   // 沒章=舊資料保留；同卡=保留；別卡=濾掉
            }
            return out;
        },

        // --- 🔥 V26：插件通用記憶桶 app_memory（角色對話型插件 st.remember 寫入；一筆=一個 appId×角色）---
        saveAppMemory: async function(appId, charName, entry) {
            const db = await this.init();
            try { if (entry && typeof entry === 'object' && entry.tavernChatId == null) { const _c = _curTavernChatId(); if (_c != null) entry.tavernChatId = _c; } } catch (e) {}
            const id = String(appId || 'app') + '::' + String(charName || '');
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_APP_MEM, 'readwrite');
                    const store = tx.objectStore(STORE_NAME_APP_MEM);
                    const getReq = store.get(id);
                    getReq.onsuccess = () => {
                        const rec = getReq.result || { id: id, appId: String(appId || 'app'), charName: String(charName || ''), entries: [] };
                        if (!Array.isArray(rec.entries)) rec.entries = [];
                        rec.entries.push(entry);
                        if (rec.entries.length > 50) rec.entries = rec.entries.slice(-50); // 每(app×角色)上限 50 條
                        rec.timestamp = Date.now();
                        store.put(rec);
                    };
                    tx.oncomplete = () => r(id);
                    tx.onerror = e => j(e.target.error);
                } catch(e) { j(e); }
            });
        },
        getAllAppMemory: async function() {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const req = db.transaction(STORE_NAME_APP_MEM, 'readonly').objectStore(STORE_NAME_APP_MEM).getAll();
                    req.onsuccess = () => r(req.result || []);
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
                } catch(e) { j(e); }
            });
        },
        saveWbPost: async function(p) {
            const db = await this.init();
            try { if (p && typeof p === 'object' && p.tavernChatId == null) { const _c = _curTavernChatId(); if (_c != null) p.tavernChatId = _c; } } catch (e) {}
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
        // === 🌍 動態世界資料 (複用 map_data store, 用 __world__ 前綴 key) ===
        saveWorldData: async function(worldId, data) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_MAP, 'readwrite');
                    tx.objectStore(STORE_NAME_MAP).put({
                        id: `__world__${worldId}`,
                        worldId,
                        ...data,
                        timestamp: Date.now()
                    });
                    tx.oncomplete = () => r(true);
                } catch(e) { j(e); }
            });
        },
        getWorldData: async function(worldId) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const req = db.transaction(STORE_NAME_MAP, 'readonly')
                        .objectStore(STORE_NAME_MAP).get(`__world__${worldId}`);
                    req.onsuccess = () => r(req.result || null);
                    req.onerror = () => j(req.error);
                } catch(e) { j(e); }
            });
        },
        listWorlds: async function() {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const req = db.transaction(STORE_NAME_MAP, 'readonly')
                        .objectStore(STORE_NAME_MAP).getAll();
                    req.onsuccess = () => {
                        const all = req.result || [];
                        r(all.filter(x => x.id && x.id.startsWith('__world__')));
                    };
                    req.onerror = () => j(req.error);
                } catch(e) { j(e); }
            });
        },
        deleteWorldData: async function(worldId) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_MAP, 'readwrite');
                    tx.objectStore(STORE_NAME_MAP).delete(`__world__${worldId}`);
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
                    tx.oncomplete = () => {
                        win.dispatchEvent(new CustomEvent('VN_CHAPTER_SAVED', { detail: {
                            id: chapter.id, storyId: chapter.storyId, content: chapter.content
                        }}));
                        r(chapter.id);
                    };
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
        },

        // ── vn_grand_summaries：大總結 CRUD ─────────────────────────
        saveGrandSummary: async function(entry) {
            // entry: { id, storyId, count, content, timestamp }
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    if (!entry.id) entry.id = 'gs_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5);
                    if (!entry.timestamp) entry.timestamp = Date.now();
                    const tx = db.transaction(STORE_NAME_VN_SUMMARIES, 'readwrite');
                    tx.objectStore(STORE_NAME_VN_SUMMARIES).put(entry);
                    tx.oncomplete = () => r(entry.id);
                } catch(e) { j(e); }
            });
        },
        getGrandSummaries: async function(storyId) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const req = db.transaction(STORE_NAME_VN_SUMMARIES, 'readonly').objectStore(STORE_NAME_VN_SUMMARIES).getAll();
                    req.onsuccess = () => {
                        const all = (req.result || []).filter(s => (s.storyId || '') === (storyId || ''));
                        r(all.sort((a, b) => (a.count || 0) - (b.count || 0)));
                    };
                } catch(e) { j(e); }
            });
        },
        deleteGrandSummary: async function(id) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_VN_SUMMARIES, 'readwrite');
                    tx.objectStore(STORE_NAME_VN_SUMMARIES).delete(id);
                    tx.oncomplete = () => r(true);
                } catch(e) { j(e); }
            });
        },

        // ── lobby_summary_index：酒館大廳跨卡總結索引（V24）─────────
        //   給 status_panel.js 生成大總結後寫 brief + 角色名單，供瀅瀅/柴郡 sysPrompt 注入
        //   entry: { id, cardName, chatId, summaryCount, brief, characters: [], lorebookBook, lorebookKey, timestamp }
        saveLobbySummaryIndex: async function(entry) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    if (!entry.id) entry.id = 'lsi_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5);
                    if (!entry.timestamp) entry.timestamp = Date.now();
                    const tx = db.transaction(STORE_NAME_LOBBY_SUM_IDX, 'readwrite');
                    tx.objectStore(STORE_NAME_LOBBY_SUM_IDX).put(entry);
                    tx.oncomplete = () => r(entry.id);
                    tx.onerror = (e) => j(e.target.error);
                } catch(e) { j(e); }
            });
        },
        getAllLobbySummaryIndex: async function() {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const req = db.transaction(STORE_NAME_LOBBY_SUM_IDX, 'readonly').objectStore(STORE_NAME_LOBBY_SUM_IDX).getAll();
                    req.onsuccess = () => r((req.result || []).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
                    req.onerror = (e) => j(e.target.error);
                } catch(e) { j(e); }
            });
        },
        deleteLobbySummaryIndex: async function(id) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_LOBBY_SUM_IDX, 'readwrite');
                    tx.objectStore(STORE_NAME_LOBBY_SUM_IDX).delete(id);
                    tx.oncomplete = () => r(true);
                } catch(e) { j(e); }
            });
        },

        // ── 給瀅瀅/柴郡 sysPrompt 注入用：每張卡 + 每個聊天室聚合最近 N 條結語 + 全角色名單（去重） ─────
        //   分組維度：cardName + chatId（同卡不同 chat 算不同故事線，避免跨 chat 混在一起）
        //   回傳：[{ cardName, chatId, storyTitle, briefs: [{ count, brief, ts }] 最新 N 條, characters: [{ name, row }] 同 chat 累積 }]
        //   briefsLimit 預設 5
        getLobbySummaryForPrompt: async function(briefsLimit = 5) {
            const all = await this.getAllLobbySummaryIndex();
            const byStory = new Map();
            for (const r of all) {
                const key = `${r.cardName || '(未命名)'}|||${r.chatId || ''}`;
                if (!byStory.has(key)) byStory.set(key, {
                    cardName: r.cardName || '(未命名)',
                    chatId:   r.chatId || '',
                    storyTitle: '',
                    _recs: [],
                    characters: [],
                });
                byStory.get(key)._recs.push(r);
            }
            const result = [];
            for (const bundle of byStory.values()) {
                bundle._recs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                // storyTitle 取最新一筆有值的（寫入端已沿用第一次的標題，這裡 newest 也是第一次的）
                bundle.storyTitle = bundle._recs.find(r => r.storyTitle)?.storyTitle || '';
                // bgCacheId 取最新一筆有值的，給封面圖去 VN bg_cache 撈用
                bundle.bgCacheId  = bundle._recs.find(r => r.bgCacheId)?.bgCacheId || '';
                // charHeader：角色表表頭，給日誌動態對位欄位(取最新一筆有值的)
                bundle.charHeader = bundle._recs.find(r => r.charHeader)?.charHeader || '';
                bundle.briefs = bundle._recs.slice(0, briefsLimit).map(r => ({
                    count: r.summaryCount || 0,
                    brief: r.brief || '',
                    ts:    r.timestamp || 0,
                }));
                // 角色卡：用「最新一筆有角色的紀錄」的完整角色表（跟著大總結去重後的結果）；不再跨筆 union，
                //   否則大總結已合併掉的舊重複角色(如蜘蛛精各別名)會永遠賴在索引、日誌一直顯示重複卡片。
                //   (_recs 已 newest-first 排序，find = 最新那筆)
                const _latest = bundle._recs.find(r => Array.isArray(r.characters) && r.characters.length);
                bundle.characters = (_latest ? _latest.characters : []).map(c => (typeof c === 'string' ? { name: c, row: c } : c));
                delete bundle._recs;
                result.push(bundle);
            }
            // 按最新一筆 brief 時間排序整個 stories 列表
            result.sort((a, b) => (b.briefs[0]?.ts || 0) - (a.briefs[0]?.ts || 0));
            return result;
        },

        // ── tavern_summary：酒館大總結（key=chatId，一卡一筆全文存檔；程式壓縮注入、不放世界書）─────
        //   record: { id(=chatId), content(全文), summaryCount, lastId, title, bgCacheId, updatedAt }
        saveTavernSummary: async function(chatId, rec) {
            const db = await this.init();
            const cid = String(chatId || '').trim();
            if (!cid) throw new Error('saveTavernSummary 缺 chatId');
            return new Promise((r, j) => {
                try {
                    const entry = Object.assign({}, rec, { id: cid, updatedAt: Date.now() });
                    const tx = db.transaction(STORE_NAME_TAVERN_SUMMARY, 'readwrite');
                    tx.objectStore(STORE_NAME_TAVERN_SUMMARY).put(entry);
                    tx.oncomplete = () => r(cid);
                    tx.onerror = (e) => j(e.target.error);
                } catch (e) { j(e); }
            });
        },
        getTavernSummary: async function(chatId) {
            const db = await this.init();
            const cid = String(chatId || '').trim();
            if (!cid) return null;
            return new Promise((r, j) => {
                try {
                    const req = db.transaction(STORE_NAME_TAVERN_SUMMARY, 'readonly').objectStore(STORE_NAME_TAVERN_SUMMARY).get(cid);
                    req.onsuccess = () => r(req.result || null);
                    req.onerror = (e) => j(e.target.error);
                } catch (e) { j(e); }
            });
        },
        deleteTavernSummary: async function(chatId) {
            const db = await this.init();
            const cid = String(chatId || '').trim();
            if (!cid) return true;
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_TAVERN_SUMMARY, 'readwrite');
                    tx.objectStore(STORE_NAME_TAVERN_SUMMARY).delete(cid);
                    tx.oncomplete = () => r(true);
                    tx.onerror = (e) => j(e.target.error);
                } catch (e) { j(e); }
            });
        },

        // ── 🗑️ 一鍵清空「某 chatId」的所有綁定資料（刪聊天室不玩了用）。回報每類清了幾筆／不可清原因 ──
        //    chatId：正規化 id（跟 tavern_summary / state_data 同款，建議用 OS_STORY_TOOLS.getChatId()）。
        //    opts.storyId：清向量記憶 / PWA大總結(它們按 storyId 存)；沒給就跳過(回 skip)。
        //    opts.vnWorld：VN 圖片快取的 world(=raw ctx.chatId)；交給 VN_Cache.deleteByWorld。
        //    全域共用的世界書/地圖/變數包無 chatId、無法反查 → 不在此清（本來就不該綁單一聊天）。
        deleteAllByChatId: async function (chatId, opts) {
            const cid = String(chatId || '').trim();
            const o = opts || {};
            const report = {};
            if (!cid) { report.error = '缺 chatId'; return report; }
            const db = await this.init();
            const self = this;
            // chatId 在各 store 正規化不一致（getChatIdentifier 空白→_、normalizeChatId 不換、_curTavernChatId 不 trim）
            //   → 收齊所有變體；key-delete 每個都刪、cursor 用集合比對，避免「含空白的 chatId」漏刪。
            const _raw = String(o.rawChatId || chatId || '');
            const _base = _raw.split(/[\\/]/).pop() || '';
            const idSet = new Set([cid,
                _base.replace(/\.jsonl?$/i, '').trim(),
                _base.replace(/\.(jsonl|json)$/i, ''),
                _base.replace(/\.jsonl?$/i, '').trim().replace(/\s+/g, '_')
            ].filter(Boolean));
            const ids = Array.from(idSet);
            const _inSet = x => x != null && idSet.has(String(x));
            const _delEach = async (fn) => { for (const id of ids) { try { await fn(id); } catch (_) {} } return 'ok'; };
            const _safe = async (label, fn) => { try { report[label] = await fn(); } catch (e) { report[label] = 'err:' + (e && e.message || e); } };
            const _purge = (store, matchFn) => new Promise((res, rej) => {
                try {
                    let n = 0;
                    const tx = db.transaction(store, 'readwrite');
                    const req = tx.objectStore(store).openCursor();
                    req.onsuccess = e => {
                        const c = e.target.result;
                        if (!c) return;
                        try { if (matchFn(c.value)) { c.delete(); n++; } } catch (_) {}
                        c.continue();
                    };
                    tx.oncomplete = () => res(n);
                    tx.onerror = e => rej(e.target.error);
                } catch (e) { rej(e); }
            });

            // 一、key 就是 chatId 的 store → 每個 id 變體都刪（清了就回 ok）
            await _safe('大總結', () => _delEach(id => self.deleteTavernSummary(id)));
            await _safe('狀態(AVS)', () => _delEach(id => self.deleteStateData ? self.deleteStateData(id) : null));
            await _safe('調查進度', () => _delEach(id => self.clearInvestigationState ? self.clearInvestigationState(id) : null));
            await _safe('大廳歷史', () => _delEach(id => self.deleteLobbyHistory ? self.deleteLobbyHistory(id) : null));
            await _safe('成就', () => _delEach(id => self.clearAchievements ? self.clearAchievements(id) : null));

            // 二、有 chatId 欄位 → cursor 批量刪（用 id 變體集合比對）
            await _safe('微信/電話', () => _purge(STORE_NAME_CHATS, v => v && v.data && _inSet(v.data.tavernChatId)));
            await _safe('微博', () => _purge(STORE_NAME_WB, v => v && _inSet(v.tavernChatId)));
            await _safe('大廳總結索引', () => _purge(STORE_NAME_LOBBY_SUM_IDX, v => v && _inSet(v.chatId)));

            // 三、app_memory：entries 內逐條過濾(留別卡的)；整筆空了才刪
            await _safe('app記憶', () => new Promise((res, rej) => {
                try {
                    let n = 0;
                    const tx = db.transaction(STORE_NAME_APP_MEM, 'readwrite');
                    const req = tx.objectStore(STORE_NAME_APP_MEM).openCursor();
                    req.onsuccess = e => {
                        const c = e.target.result;
                        if (!c) return;
                        const rec = c.value;
                        if (rec && Array.isArray(rec.entries)) {
                            const before = rec.entries.length;
                            const kept = rec.entries.filter(en => en && !_inSet(en.tavernChatId));
                            if (kept.length !== before) {
                                n += (before - kept.length);
                                if (kept.length === 0) c.delete();
                                else { rec.entries = kept; c.update(rec); }
                            }
                        }
                        c.continue();
                    };
                    tx.oncomplete = () => res(n);
                    tx.onerror = e => rej(e.target.error);
                } catch (e) { rej(e); }
            }));

            // 四、按 storyId 的（向量記憶 / PWA 大總結）→ 只在有給 storyId 時清
            if (o.storyId) {
                const sid = String(o.storyId);
                await _safe('向量記憶', async () => { if (self.deleteVnMemoriesByStoryId) await self.deleteVnMemoriesByStoryId(sid); return 'ok'; });
                await _safe('PWA大總結', () => _purge(STORE_NAME_VN_SUMMARIES, v => v && (v.storyId || '') === sid));
            } else {
                report['向量記憶'] = 'skip(無storyId)';
                report['PWA大總結'] = 'skip(無storyId)';
            }

            // 五、VN 圖片快取（背景/頭像/立繪/場景/物品）走 VN_Cache（獨立 DB、world=raw chatId）
            await _safe('圖片快取', async () => {
                const VC = (typeof window !== 'undefined' && window.VN_Cache) || win.VN_Cache;
                if (!VC || !VC.deleteByWorld) return 'skip(無VN_Cache)';
                return await VC.deleteByWorld(o.vnWorld || cid);
            });

            console.log('[OS_DB] 🗑️ deleteAllByChatId(' + cid + ') 完成:', report);
            return report;
        },

        // ── vn_memories：向量記憶條目 CRUD ──────────────────────────
        saveVnMemory: async function(entry) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    if (!entry.id) entry.id = 'vmem_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
                    if (!entry.createdAt) entry.createdAt = Date.now();
                    const tx = db.transaction(STORE_NAME_VN_MEMORIES, 'readwrite');
                    tx.objectStore(STORE_NAME_VN_MEMORIES).put(entry);
                    tx.oncomplete = () => r(entry.id);
                } catch(e) { j(e); }
            });
        },
        getAllVnMemories: async function(storyId) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const req = db.transaction(STORE_NAME_VN_MEMORIES, 'readonly').objectStore(STORE_NAME_VN_MEMORIES).getAll();
                    req.onsuccess = () => {
                        const all = req.result || [];
                        r(storyId ? all.filter(m => m.storyId === storyId) : all);
                    };
                } catch(e) { j(e); }
            });
        },
        deleteVnMemoriesByStoryId: async function(storyId) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_VN_MEMORIES, 'readwrite');
                    const store = tx.objectStore(STORE_NAME_VN_MEMORIES);
                    const req = store.getAll();
                    req.onsuccess = () => {
                        (req.result || []).filter(m => m.storyId === storyId).forEach(m => store.delete(m.id));
                        tx.oncomplete = () => r(true);
                    };
                } catch(e) { j(e); }
            });
        },
        // 刪除單筆記憶（給 AVS 📝 記憶分頁的「刪除這條」用）
        deleteVnMemory: async function(id) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_VN_MEMORIES, 'readwrite');
                    tx.objectStore(STORE_NAME_VN_MEMORIES).delete(id);
                    tx.oncomplete = () => r(true);
                } catch(e) { j(e); }
            });
        },
        // 刪除某一則訊息/章節(chapterId)的所有記憶 —— 重 roll / 重生 / 刪訊息時自動清，讓記憶跟著現存劇情走
        deleteVnMemoriesByChapter: async function(chapterId, storyId) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_VN_MEMORIES, 'readwrite');
                    const store = tx.objectStore(STORE_NAME_VN_MEMORIES);
                    const req = store.getAll();
                    req.onsuccess = () => {
                        (req.result || []).filter(m =>
                            String(m.chapterId) === String(chapterId) && (!storyId || m.storyId === storyId)
                        ).forEach(m => store.delete(m.id));
                    };
                    tx.oncomplete = () => r(true);
                } catch(e) { j(e); }
            });
        },
        // 把某世界的記憶「複製」到另一個世界 —— 換聊天 / 換備份檔(chatId 變了)後，把舊世界記憶搬過來。來源保留。
        copyVnMemoriesToStory: async function(fromStoryId, toStoryId) {
            if (!fromStoryId || !toStoryId || fromStoryId === toStoryId) return 0;
            const all = await this.getAllVnMemories(fromStoryId);
            let n = 0;
            for (const m of all) {
                const clone = Object.assign({}, m, { storyId: toStoryId });
                delete clone.id;          // 讓 saveVnMemory 配新 id（不覆蓋來源）
                delete clone.createdAt;
                try { await this.saveVnMemory(clone); n++; } catch (e) {}
            }
            return n;
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

    // === 🔥 V23：狀態資料庫（state_data）===
    // key = chatId，value = { id, schema, patches, current, timestamp }
    // 配合 state_schema.js (Stage 1 生 schema) + state_runtime.js (Stage 2 抽取 + injectPrompts)
    Object.assign(win.OS_DB, {
        saveStateData: async function(chatId, data) {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                try {
                    const entry = {
                        id: chatId,
                        schema: data.schema || null,       // Stage 1 生成的欄位定義
                        patches: data.patches || {},       // 每 msgId 一筆 patch
                        current: data.current || {},       // patches 累積後的當下狀態
                        npcLedger: data.npcLedger || null,     // 📇 NPC 登場記帳（npc_dossier.js）
                        npcDossiers: data.npcDossiers || null, // 📇 NPC 長期人物檔案（npc_dossier.js）
                        director: data.director || null,       // 🎬 導演稿（state_runtime 導演模式：patches[msgId]=全文快照）
                        timestamp: Date.now()
                    };
                    const tx = db.transaction(STORE_NAME_STATE_DATA, 'readwrite');
                    tx.objectStore(STORE_NAME_STATE_DATA).put(entry);
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = (e) => reject(e.target.error);
                } catch(e) { reject(e); }
            });
        },
        getStateData: async function(chatId) {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                try {
                    const req = db.transaction(STORE_NAME_STATE_DATA, 'readonly').objectStore(STORE_NAME_STATE_DATA).get(chatId);
                    req.onsuccess = () => resolve(req.result || null);
                    req.onerror = (e) => reject(e.target.error);
                } catch(e) { reject(e); }
            });
        },
        deleteStateData: async function(chatId) {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                try {
                    const tx = db.transaction(STORE_NAME_STATE_DATA, 'readwrite');
                    tx.objectStore(STORE_NAME_STATE_DATA).delete(chatId);
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = (e) => reject(e.target.error);
                } catch(e) { reject(e); }
            });
        },
        getAllStateData: async function() {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                try {
                    const req = db.transaction(STORE_NAME_STATE_DATA, 'readonly').objectStore(STORE_NAME_STATE_DATA).getAll();
                    req.onsuccess = () => resolve(req.result || []);
                    req.onerror = (e) => reject(e.target.error);
                } catch(e) { reject(e); }
            });
        }
    });

    // === 🔥 V25：手機殼 app 商店——已安裝的功能型 HTML app ===
    // rec: { id, name, emoji, iconUrl, html, source:'workshop'|'import', createdAt }
    Object.assign(win.OS_DB, {
        savePhoneApp: async function(rec) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    if (!rec.id) rec.id = 'app_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
                    if (!rec.createdAt) rec.createdAt = Date.now();
                    const tx = db.transaction(STORE_NAME_PHONE_APPS, 'readwrite');
                    tx.objectStore(STORE_NAME_PHONE_APPS).put(rec);
                    tx.oncomplete = () => r(rec.id);
                    tx.onerror = (e) => j(e.target.error);
                } catch(e) { j(e); }
            });
        },
        getPhoneApp: async function(id) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const req = db.transaction(STORE_NAME_PHONE_APPS, 'readonly').objectStore(STORE_NAME_PHONE_APPS).get(id);
                    req.onsuccess = () => r(req.result || null);
                    req.onerror = (e) => j(e.target.error);
                } catch(e) { j(e); }
            });
        },
        getAllPhoneApps: async function() {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const req = db.transaction(STORE_NAME_PHONE_APPS, 'readonly').objectStore(STORE_NAME_PHONE_APPS).getAll();
                    req.onsuccess = () => r((req.result || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
                    req.onerror = (e) => j(e.target.error);
                } catch(e) { j(e); }
            });
        },
        deletePhoneApp: async function(id) {
            const db = await this.init();
            return new Promise((r, j) => {
                try {
                    const tx = db.transaction(STORE_NAME_PHONE_APPS, 'readwrite');
                    tx.objectStore(STORE_NAME_PHONE_APPS).delete(id);
                    tx.oncomplete = () => r(true);
                    tx.onerror = (e) => j(e.target.error);
                } catch(e) { j(e); }
            });
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