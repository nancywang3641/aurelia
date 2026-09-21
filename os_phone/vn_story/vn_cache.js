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

    // 連線開一次就留著用：以前每讀寫一筆都重開一條、從不關，整理圖庫一口氣幾千筆會疊出幾千條連線。
    let _dbP = null;
    function _openIDB() {
        if (_dbP) return _dbP;
        const p = _openIDBOnce().then(db => {
            db.onversionchange = () => { try { db.close(); } catch (e) {} if (_dbP === p) _dbP = null; };
            db.onclose = () => { if (_dbP === p) _dbP = null; };
            return db;
        });
        p.catch(() => { if (_dbP === p) _dbP = null; });
        _dbP = p;
        return p;
    }
    function _openIDBOnce() {
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

    // 🚨 這支決定所有圖片快取的隔離鍵，兩版各有各的來源：
    //   酒館＝chatId；PWA＝storyId（chatId 在 PWA 的對應物，見 OS_AVS_ADAPTER.getStoryId）。
    //   以前 PWA 這條問的是 VoidTerminal.getChatId()，而那支只讀酒館 context、在 PWA **永遠回
    //   'lobby_default'** → 整個 PWA 不管哪一本書哪一條篇章全部擠進同一個桶：
    //     ① 相簿分不了組（她說的「沒綁 ID」）
    //     ② 「切拉桿不重生舊圖」變成全域生效 → 任何角色只要在任何故事出現過就有快取，
    //        立繪模式永遠不會自動生成（她說的「自動立繪還是死的」）—— 兩個症狀同一個根。
    //   storyId 一律問 OS_AVS_ADAPTER，不要自己拼 localStorage（會拿到假鑰匙）。
    function _curWorld() {
        const w = window.parent || window;
        try { const ctx = w.SillyTavern && w.SillyTavern.getContext && w.SillyTavern.getContext(); if (ctx && ctx.chatId) return String(ctx.chatId); } catch(e){}
        try {
            const ad = w.OS_AVS_ADAPTER || window.OS_AVS_ADAPTER;
            const sid = ad && ad.getStoryId && ad.getStoryId();
            if (sid) return String(sid);
        } catch(e){}
        try { if (w.VoidTerminal && w.VoidTerminal.getChatId) { const c = w.VoidTerminal.getChatId(); if (c) return String(c); } } catch(e){}
        return 'lobby_default';   // 還沒踏進任何故事（大廳）＝共用這一桶
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
        })).catch(() => false).then(async ok => { if (ok && IMAGE_STORES[store]) await _metaPut(store, key, value); return ok; });
    }
    function _txDel(store, key) {
        return _openIDB().then(db => new Promise(res => {
            const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).delete(key);
            tx.oncomplete = () => res(true); tx.onerror = () => res(false);
        })).catch(() => false).then(async ok => { if (ok && IMAGE_STORES[store]) await _metaDel([_mk(store, key)]); return ok; });
    }
    function _txKeys(store) {
        return _openIDB().then(db => new Promise((res, rej) => {
            const req = db.transaction(store, 'readonly').objectStore(store).getAllKeys();   // 只讀鑰匙，不碰值
            req.onsuccess = () => res(req.result || []);
            req.onerror = () => rej(req.error);
        }));
    }

    // ── 圖庫小帳（vn_player_meta）──────────────────────────────────────────
    // 圖片 store 的每一筆值裡都躺著整張圖（base64，一張 1～8MB）。要列清單就得讀值，
    // 而讀值＝把整張圖從硬碟搬進記憶體：她的圖庫 2026-09 已經 9.5GB／六千多張，
    // 開一次相簿就是讀 9GB，游標一次還會預抓一整批 → TauriTavern 直接 Out of Memory。
    // 所以清單要用的東西（提示詞、收藏、時間、屬於哪個世界…）另外記在這本小帳，
    // 列清單＝「圖庫的鑰匙」對「小帳」，全程不讀任何一張圖。
    // 🚨 小帳開成另一個資料庫、不是在 vn_player_db 加 store：那邊升版要搬動 9GB 的庫，
    //    而且升版被別條連線擋住時所有讀寫會一起卡死（OS_DB 踩過）。
    let _metaP = null;
    function _openMeta() {
        if (_metaP) return _metaP;
        const p = new Promise((res, rej) => {
            const req = indexedDB.open('vn_player_meta', 1);
            req.onupgradeneeded = e => { const db = e.target.result; if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta'); };
            req.onsuccess = e => {
                const db = e.target.result;
                db.onversionchange = () => { try { db.close(); } catch (er) {} if (_metaP === p) _metaP = null; };
                db.onclose = () => { if (_metaP === p) _metaP = null; };
                res(db);
            };
            req.onerror = () => rej(req.error);
        });
        p.catch(() => { if (_metaP === p) _metaP = null; });
        _metaP = p;
        return p;
    }
    const _MSEP = '|';
    function _mk(store, key) { return store + _MSEP + String(key); }
    // 值 → 小帳那一筆：圖本身（url、以及任何 data:/blob: 或超長的字串欄位，例如 bg 的 rawUrl）一律不抄
    function _metaOf(value) {
        const v = (value && typeof value === 'object') ? value : {};
        const m = {};
        for (const f of Object.keys(v)) {
            if (f === 'url') continue;
            const x = v[f];
            if (typeof x === 'string' && (x.length > 4000 || x.startsWith('data:') || x.startsWith('blob:'))) continue;
            m[f] = x;
        }
        return { m, hasUrl: !!v.url };
    }
    function _metaPut(store, key, value) {
        return _openMeta().then(db => new Promise(res => {
            const tx = db.transaction('meta', 'readwrite');
            tx.objectStore('meta').put({ k: key, ..._metaOf(value) }, _mk(store, key));
            tx.oncomplete = () => res(true); tx.onerror = tx.onabort = () => res(false);
        })).catch(e => { console.error('[VN_Cache] 圖庫小帳寫入失敗', e); return false; });
    }
    function _metaDel(metaKeys) {
        if (!metaKeys.length) return Promise.resolve(true);
        return _openMeta().then(db => new Promise(res => {
            const tx = db.transaction('meta', 'readwrite'); const os = tx.objectStore('meta');
            metaKeys.forEach(mk => os.delete(mk));
            tx.oncomplete = () => res(true); tx.onerror = tx.onabort = () => res(false);
        })).catch(() => false);
    }
    function _metaGet(store, key) {
        return _openMeta().then(db => new Promise(res => {
            const req = db.transaction('meta', 'readonly').objectStore('meta').get(_mk(store, key));
            req.onsuccess = () => res(req.result || null); req.onerror = () => res(null);
        }));
    }
    // 某個 store 的整本小帳（每筆只有幾百字，一次全拿沒問題）→ Map(小帳鑰匙 → 那一筆)
    function _metaAll(store) {
        return _openMeta().then(db => new Promise((res, rej) => {
            const os = db.transaction('meta', 'readonly').objectStore('meta');
            const range = IDBKeyRange.bound(store + _MSEP, store + _MSEP + '￿');
            const rk = os.getAllKeys(range), rv = os.getAll(range);
            rv.onsuccess = () => { const map = new Map(); (rk.result || []).forEach((k, i) => map.set(k, rv.result[i])); res(map); };
            rv.onerror = rk.onerror = () => rej(rv.error || rk.error);
        }));
    }
    const _entryOf = (key, rec) => ({ key, ...rec.m, hasUrl: !!rec.hasUrl });
    const _filling = {};   // store → 正在整理的那一輪（同一個 store 同時只跑一輪）

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

        // 清單用：每筆只回中繼資料 + hasUrl 旗標，不帶圖。
        // 圖片 store 走「鑰匙 × 小帳」，全程不讀任何一張圖（見上面「圖庫小帳」）。
        //   小帳還沒記到的（改版前就存在的舊圖）：
        //     預設 → 在這裡逐張整理完才回（opts.onProgress(i, n) 報進度）；
        //     opts.partial → 不等，先回只有鑰匙的那幾筆（hasUrl 當作有、世界看鑰匙前綴），
        //                    並把待整理的鑰匙掛在回傳陣列的 .pending 上，呼叫端自己叫 indexMissing。
        async getAllMeta(store, opts) {
            if (!IMAGE_STORES[store]) return this._scanMeta(store);
            try {
                const keys = await _txKeys(store);
                const metas = await _metaAll(store);
                const out = [], missing = [], live = new Set();
                for (const k of keys) {
                    const mk = _mk(store, k); live.add(mk);
                    const rec = metas.get(mk);
                    if (rec) out.push(_entryOf(k, rec)); else missing.push(k);
                }
                const dead = []; metas.forEach((rec, mk) => { if (!live.has(mk)) dead.push(mk); });
                if (dead.length) await _metaDel(dead);   // 圖已經不在了的小帳
                if (missing.length) {
                    if (opts && opts.partial) { missing.forEach(k => out.push({ key: k, hasUrl: true, _pending: 1 })); out.pending = missing; }
                    else out.push(...await this.indexMissing(store, missing, opts && opts.onProgress));
                }
                return out;
            } catch (e) { console.error('[VN_Cache] getAllMeta 失敗', store, e); return []; }
        },

        // 把還沒進小帳的圖補記進去：一次只讀一張、讀完就放，每幾張讓出一次執行緒。
        // 只有改版後第一次、或被繞過 VN_Cache 寫進來的圖才會走到這裡。回傳補好的那幾筆（不帶圖）。
        async indexMissing(store, keys, onProgress) {
            // 同一個 store 已經有一輪在跑 → 等它，等的期間把它的進度轉給這邊（不然畫面上那行會停在 0）
            while (_filling[store]) {
                const cur = _filling[store];
                if (onProgress) cur.listeners.add(onProgress);
                try { await cur; } catch (e) {}
            }
            const listeners = new Set(onProgress ? [onProgress] : []);
            const tell = (i, n) => listeners.forEach(fn => { try { fn(i, n); } catch (e) {} });
            const run = (async () => {
                const out = [], n = keys.length;
                for (let i = 0; i < n; i++) {
                    const k = keys[i];
                    let rec = await _metaGet(store, k);   // 別輪已經補過就不再讀圖
                    if (!rec) {
                        const v = await _txGet(store, k);
                        if (v == null) continue;          // 這段時間被刪了
                        rec = { k, ..._metaOf(v) };
                        await _metaPut(store, k, v);
                    }
                    out.push(_entryOf(k, rec));
                    if (i % 8 === 7 || i === n - 1) {
                        tell(i + 1, n);
                        await new Promise(r => setTimeout(r, 0));
                    }
                }
                return out;
            })();
            run.listeners = listeners;
            _filling[store] = run;
            try { return await run; } finally { if (_filling[store] === run) delete _filling[store]; }
        },

        // 沒有小帳的 store（chat_bg 這種少量的）照舊用游標掃，剝掉 url
        async _scanMeta(store) {
            try {
                const db = await _openIDB();
                return new Promise(res => {
                    const results = [];
                    const req = db.transaction(store, 'readonly').objectStore(store).openCursor();
                    req.onsuccess = e => {
                        const c = e.target.result;
                        if (c) {
                            const { url, ...rest } = (c.value && typeof c.value === 'object') ? c.value : {};
                            results.push({ key: c.key, ...rest, hasUrl: !!url });
                            c.continue();
                        } else res(results);
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
        scopedKey(world, bareKey) { return world ? (world + SEP + bareKey) : bareKey; },

        // 🗑️ 清掉某個世界(chatId)的所有圖片快取（背景/頭像/立繪/場景/物品）→ 給「刪聊天室一鍵清資料」用。
        //    world 可傳 raw ctx.chatId 或正規化後的 chatId 都行——兩邊都正規化(basename/去.jsonl/trim/空白→_)再比，
        //    所以日誌(正規化chatId)跟 block#3(raw world)都對得上。回傳清掉的筆數。
        async deleteByWorld(world) {
            const _norm = w => !w ? '' : String(w).split(/[\\/]/).pop().replace(/\.jsonl?$/i, '').trim().replace(/\s+/g, '_');
            const wn = _norm(world);
            if (!wn) return 0;
            let n = 0;
            for (const store of Object.keys(IMAGE_STORES)) {
                try {
                    // 只要 key/world：不讀圖、也不在這裡等整理（還沒整理的看鑰匙前綴就知道世界；
                    // 世界標記跟鑰匙前綴是同一支 set() 一起蓋的，沒有「有標記卻沒前綴」的圖）
                    const all = await this.getAllMeta(store, { partial: true });
                    for (const entry of all) {
                        if (_norm(this.worldOf(entry)) === wn) { if (await this.deleteRaw(store, entry.key)) n++; }
                    }
                } catch (e) {}
            }
            return n;
        }
    };

    // 暴露給其他擴展腳本（os_settings 角色立繪面板、wx_view 等）
    window.VN_Cache = VN_Cache;
})();
