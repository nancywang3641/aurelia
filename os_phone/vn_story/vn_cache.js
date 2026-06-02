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

    // 🌍 圖片類 store → 依「當前世界(chatId)」隔離；chat_bg 等不隔離。
    //    key 自動變成 `世界::原key`，所以 vn_core / wx / journal 的呼叫一字不用改就只看當前世界。
    //    舊資料（沒有前綴的 key）→ 視為「未分類」，不會混進任何世界。
    const IMAGE_STORES = { bg_cache:1, avatar_cache:1, item_cache:1, scene_cache:1, sprite_cache:1 };
    const SEP = '::';

    function _curWorld() {
        try { const w = window.parent || window; const ctx = w.SillyTavern && w.SillyTavern.getContext && w.SillyTavern.getContext(); if (ctx && ctx.chatId) return String(ctx.chatId); } catch(e){}
        try { const w = window.parent || window; if (w.VoidTerminal && w.VoidTerminal.getChatId) { const c = w.VoidTerminal.getChatId(); if (c) return String(c); } } catch(e){}
        return 'lobby_default';
    }
    function _scoped(store, key) {
        if (!IMAGE_STORES[store] || typeof key !== 'string') return key;
        const w = _curWorld();
        if (!w) return key;
        if (key.indexOf(SEP) >= 0) return key;     // 已是 世界::xxx 複合鍵，不再疊
        return w + SEP + key;
    }

    function _txGet(store, key) {
        return _openIDB().then(db => new Promise(res => {
            const req = db.transaction(store, 'readonly').objectStore(store).get(key);
            req.onsuccess = () => res(req.result || null);
            req.onerror = () => res(null);
        })).catch(() => null);
    }
    function _txSet(store, key, value) {
        return _openIDB().then(db => new Promise(res => {
            const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(value, key);
            tx.oncomplete = () => res(true); tx.onerror = () => res(false);
        })).catch(() => false);
    }
    function _txDel(store, key) {
        return _openIDB().then(db => new Promise(res => {
            const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).delete(key);
            tx.oncomplete = () => res(true); tx.onerror = () => res(false);
        })).catch(() => false);
    }

    const VN_Cache = {
        // 自動隔離版（圖片 store 依當前世界加前綴）→ VN 播放、wx、journal 都走這條，自動只看當前世界
        async get(store, key) { return _txGet(store, _scoped(store, key)); },
        async set(store, key, value) {
            const v = value;
            if (IMAGE_STORES[store] && v && typeof v === 'object') {
                if (v.chatId == null) v.chatId = _curWorld();   // 標記出處世界
                v.lastUsed = Date.now();                         // 最近使用時間（給「最近/已使用」篩選）
            }
            return _txSet(store, _scoped(store, key), v);
        },
        async delete(store, key) { return _txDel(store, _scoped(store, key)); },

        // 原始版（用完整 key、不加世界前綴）→ 給畫廊操作「指定世界的某一筆」用
        async getRaw(store, key) { return _txGet(store, key); },
        async setRaw(store, key, value) { return _txSet(store, key, value); },
        async deleteRaw(store, key) { return _txDel(store, key); },

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
        },

        // ── 世界工具（給畫廊）──
        getCurrentWorld: _curWorld,
        // 從一筆 getAll 結果推出它屬於哪個世界：新資料看 value.chatId；舊資料看 key 前綴；都沒有 → ''（未分類）
        worldOf(entry) {
            if (!entry) return '';
            if (entry.chatId) return String(entry.chatId);
            const k = entry.key;
            if (typeof k === 'string' && k.indexOf(SEP) > 0) return k.slice(0, k.indexOf(SEP));
            return '';
        },
        // 取某筆的「原始 key」（去掉世界前綴），給「複製到其他世界」用
        bareKeyOf(entry) {
            const k = entry && entry.key;
            if (typeof k === 'string' && k.indexOf(SEP) > 0) return k.slice(k.indexOf(SEP) + SEP.length);
            return k;
        },
        scopedKey(world, bareKey) { return world ? (world + SEP + bareKey) : bareKey; }
    };

    // 暴露給其他擴展腳本（os_settings 角色立繪面板、wx_view 等）
    window.VN_Cache = VN_Cache;
})();
