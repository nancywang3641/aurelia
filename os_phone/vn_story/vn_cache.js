// ----------------------------------------------------------------
// [檔案] vn_cache.js
// 路徑：os_phone/vn_story/vn_cache.js
// 職責：VN 視覺小說播放器 - IDB 核心快取系統
// 自 vn_core.js V8.6 拆分出獨立模組
// 依賴：無（純 indexedDB 包裝）
// 暴露：window.VN_Cache
// ----------------------------------------------------------------
(function () {
    'use strict';
    console.log('[PhoneOS] 載入 VN 快取模組 (vn_cache.js)...');

    function _openIDB() {
        return new Promise((res, rej) => {
            const req = indexedDB.open('vn_player_db', 7);
            req.onupgradeneeded = e => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('bg_cache'))     db.createObjectStore('bg_cache');
                if (!db.objectStoreNames.contains('avatar_cache')) db.createObjectStore('avatar_cache');
                if (!db.objectStoreNames.contains('item_cache'))   db.createObjectStore('item_cache');
                if (!db.objectStoreNames.contains('chat_bg'))      db.createObjectStore('chat_bg');
                if (!db.objectStoreNames.contains('scene_cache'))  db.createObjectStore('scene_cache');
                if (!db.objectStoreNames.contains('sprite_cache')) db.createObjectStore('sprite_cache');
                if (db.objectStoreNames.contains('handles'))       db.deleteObjectStore('handles');
            };
            req.onsuccess = e => res(e.target.result);
            req.onerror = () => rej(req.error);
        });
    }

    const VN_Cache = {
        async get(store, key) {
            try {
                const db = await _openIDB();
                return new Promise((res, rej) => {
                    const req = db.transaction(store, 'readonly').objectStore(store).get(key);
                    req.onsuccess = () => res(req.result || null);
                    req.onerror = () => rej(req.error);
                });
            } catch(e) { return null; }
        },
        async set(store, key, value) {
            try {
                const db = await _openIDB();
                return new Promise((res, rej) => {
                    const tx = db.transaction(store, 'readwrite');
                    tx.objectStore(store).put(value, key);
                    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
                });
            } catch(e) {}
        },
        async delete(store, key) {
            try {
                const db = await _openIDB();
                return new Promise((res, rej) => {
                    const tx = db.transaction(store, 'readwrite');
                    tx.objectStore(store).delete(key);
                    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
                });
            } catch(e) {}
        },
        async getAll(store) {
            try {
                const db = await _openIDB();
                return new Promise(res => {
                    const results = [];
                    const req = db.transaction(store, 'readonly').objectStore(store).openCursor();
                    req.onsuccess = e => {
                        const c = e.target.result;
                        if (c) { results.push({ key: c.key, ...c.value }); c.continue(); }
                        else res(results);
                    };
                    req.onerror = () => res([]);
                });
            } catch(e) { return []; }
        }
    };

    // 暴露給其他擴展腳本（os_settings 角色立繪面板、wx_view 等）
    window.VN_Cache = VN_Cache;
})();
