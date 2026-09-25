// ----------------------------------------------------------------
// [檔案] os_backup.js (V2.0 - 終極全量備份版：支援 AVS 與 VN V16)
// 路徑：os_phone/os/os_backup.js
// 職責：統一資料備份引擎
//   - 備份目標：IndexedDB 所有重要倉庫 + localStorage 設定
//   - 雲端：GitHub Gist（僅限世界書/成就等輕量必要資料）
//   - 本地：JSON 檔案匯出入（100% 包含 AVS、VN章節、聊天紀錄等大型資料）
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const LSKEY = 'os_backup_settings';

    // 🔥 V2.0 升級：加入所有 AVS 與系統核心的 LocalStorage Keys
    const LS_BACKUP_KEYS = [
        'os_global_config',           // 主模型設定
        'os_secondary_llm_config',    // 副模型設定
        'os_image_config',            // 圖片生成設定
        'os_minimax_config',          // Minimax 語音設定
        'os_worldbook_books',         // 世界書書包清單
        'vn_cfg_v4',                  // VN 面板設定
        'os_personas',                // 人設
        'avs_condition_rules',        // [AVS] 條件規則
        'aurelia_rules_tavern',       // [AVS] 酒館版規則
        'avs_current_state',          // [AVS] 當前全局動態變數 JSON 狀態
        'avs_active_ui_templates',    // [AVS] 當前啟用的美化面板快取
        'vn_current_story_id',        // [VN] 當前故事 ID
        'vn_current_story_title',     // [VN] 當前故事顯示名
        'vn_prompt_order',            // [VN] 提示詞順序
        'wx_phone_api_config'         // 微信設定
    ];
    // 只有本地全量匯出才收的（可能很大：書的封面、每本故事的狀態；Gist 有 8MB 上限）
    const LS_FULL_ONLY_KEYS = [
        'aurelia_custom_worlds'       // 書架上的書
    ];
    // 開頭符合就收（每本故事一個 key），也只在全量匯出
    const LS_BACKUP_PREFIXES = [
        'avs_state_'                  // [AVS] 各故事的狀態數值
    ];

    // 全量備份收的 IndexedDB 倉庫：OS_DB 除了圖片（images 存的是二進位，JSON 裝不下）以外全部
    //   🚨 OS_DB 新增倉庫時這裡也要加一列，不然備份不到
    const FULL_STORES = [
        'var_packs', 'ui_templates', 'vn_chapters', 'api_chats', 'wb_posts', 'lobby_history',
        'map_data', 'studio_chats', 'studio_drafts', 'vn_memories', 'vn_grand_summaries', 'state_data',
        'lobby_summary_index', 'phone_apps', 'app_memory', 'tavern_summary', 'app_data', 'lobby_npc_memory'
    ];
    // 舊版備份檔（V3）用的欄位名 → 倉庫名；還原舊檔時用
    const LEGACY_FIELDS = {
        varPacks: 'var_packs', uiTemplates: 'ui_templates', vnChapters: 'vn_chapters',
        apiChats: 'api_chats', wbPosts: 'wb_posts', lobbyHistory: 'lobby_history'
    };

    // ── 設定讀寫 ─────────────────────────────────────────────────────
    function getSettings() {
        try { return JSON.parse(localStorage.getItem(LSKEY) || '{}'); } catch(e) { return {}; }
    }
    function saveSettings(s) { localStorage.setItem(LSKEY, JSON.stringify(s)); }

    // ── 通用 IndexedDB 方法 ──────────────────────────────────────────
    function _getStore(storeName) {
        return new Promise(async (resolve, reject) => {
            try {
                if (!win.OS_DB) return resolve([]);
                const db = await win.OS_DB.init();
                const tx = db.transaction(storeName, 'readonly');
                const req = tx.objectStore(storeName).getAll();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = e => reject(e.target.error);
            } catch(e) { resolve([]); } // 若該倉庫不存在則回傳空陣列
        });
    }

    function _putStore(storeName, entry) {
        return new Promise(async (resolve, reject) => {
            try {
                const db = await win.OS_DB.init();
                const tx = db.transaction(storeName, 'readwrite');
                tx.objectStore(storeName).put(entry);
                tx.oncomplete = () => resolve();
                tx.onerror = e => reject(e.target.error);
            } catch(e) { reject(e); }
        });
    }

    // ── 資料收集 ─────────────────────────────────────────────────────
    async function collectDB(opts) {
        const out = {};
        try {
            // 🌟 1. 輕量資料 (Gist 與本地都會備份)
            if (opts.worldbook !== false) out.worldbook = await _getStore('world_book_entries');
            if (opts.achievements !== false) out.achievements = await _getStore('achievements');

            // 🌟 2. 全量資料 (僅限本地 JSON 打包)
            if (opts.fullExport) {
                out.stores = {};
                for (const name of FULL_STORES) out.stores[name] = await _getStore(name);
            }
        } catch(e) { console.warn('[OS_BACKUP] DB 收集部分失敗:', e); }
        return out;
    }

    function collectLocalStorage(full) {
        const out = {};
        LS_BACKUP_KEYS.concat(full ? LS_FULL_ONLY_KEYS : []).forEach(k => {
            const v = localStorage.getItem(k);
            if (v !== null) out[k] = v; 
        });
        if (full) for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && LS_BACKUP_PREFIXES.some(p => k.startsWith(p))) out[k] = localStorage.getItem(k);
        }
        return out;
    }

    // ── 全量資料打包（本地匯出用） ────────────────────────────────────
    async function collectAll(opts = {}) {
        // 強制開啟全量收集模式
        const dbData = await collectDB({ ...opts, fullExport: true });
        return {
            version: 4, // V4：倉庫收在 db.stores（舊的 V3 檔照樣能還原）
            exportedAt: new Date().toISOString(),
            type: 'full',
            db: dbData,
            localStorage: collectLocalStorage(true)
        };
    }

    // ── Gist 備份資料打包（只含輕量必要資料） ─────────────────────────
    async function collectEssential() {
        const dbData = await collectDB({ worldbook: true, achievements: true, fullExport: false });
        return {
            version: 4,
            exportedAt: new Date().toISOString(),
            type: 'essential',
            db: dbData,
            localStorage: collectLocalStorage()
        };
    }

    // ── 還原資料 ──────────────────────────────────────────────────────
    async function applyData(data, opts = {}) {
        let restored = { worldbook: 0, achievements: 0, localStorage: 0, avs: 0, vn: 0, chats: 0 };

        // IndexedDB 恢復
        if (data.db) {
            const d = data.db;
            
            // 恢復基礎資料
            if (d.worldbook?.length) {
                for (const e of d.worldbook) await _putStore('world_book_entries', e).catch(()=>{});
                restored.worldbook = d.worldbook.length;
            }
            if (d.achievements?.length) {
                for (const e of d.achievements) await _putStore('achievements', e).catch(()=>{});
                restored.achievements = d.achievements.length;
            }

            // 其他倉庫：新檔在 d.stores，舊檔（V3）是幾個分開的欄位
            const stores = Object.assign({}, d.stores || {});
            Object.keys(LEGACY_FIELDS).forEach(f => { if (Array.isArray(d[f]) && !stores[LEGACY_FIELDS[f]]) stores[LEGACY_FIELDS[f]] = d[f]; });
            for (const name of Object.keys(stores)) {
                if (!FULL_STORES.includes(name) || !Array.isArray(stores[name])) continue;
                for (const e of stores[name]) await _putStore(name, e).catch(()=>{});
                const n = stores[name].length;
                if (name === 'var_packs' || name === 'ui_templates' || name === 'state_data') restored.avs += n;
                else if (name === 'vn_chapters' || name === 'vn_memories' || name === 'vn_grand_summaries') restored.vn += n;
                else if (name === 'api_chats') restored.chats += n;
            }
        }

        // LocalStorage 恢復
        if (data.localStorage && opts.restoreSettings !== false) {
            Object.entries(data.localStorage).forEach(([k, v]) => {
                try { localStorage.setItem(k, v); restored.localStorage++; }
                catch (e) { console.warn('[OS_BACKUP] 還原設定失敗（空間不夠？）:', k, e); }
            });
        }

        return restored;
    }

    // ── GitHub Gist API ───────────────────────────────────────────────
    async function gistBackup() {
        const s = getSettings();
        if (!s.token) throw new Error('請先填入 GitHub Personal Access Token');

        const data = await collectEssential();
        const content = JSON.stringify(data, null, 2);

        // 檢查大小（Gist 單檔上限約 10MB）
        const sizeKB = Math.round(new Blob([content]).size / 1024);
        if (sizeKB > 8192) throw new Error(`資料量過大（${sizeKB}KB），請改用「本地匯出」備份`);

        const body = { files: { 'aurelia-backup.json': { content } } };
        let url = 'https://api.github.com/gists', method = 'POST';
        if (s.gistId) { url += '/' + s.gistId; method = 'PATCH'; }
        else { body.description = '奧瑞亞系統統一備份 V3'; body.public = false; }

        const res = await fetch(url, {
            method,
            headers: { 'Authorization': 'Bearer ' + s.token, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error('GitHub 錯誤 ' + res.status + ': ' + (err.message || res.statusText));
        }
        const json = await res.json();
        if (!s.gistId) { s.gistId = json.id; saveSettings(s); }
        return { gistId: json.id, url: json.html_url, sizeKB };
    }

    async function gistRestore() {
        const s = getSettings();
        if (!s.token) throw new Error('請先填入 GitHub Token');
        if (!s.gistId) throw new Error('尚無 Gist ID，請先備份一次');

        const res = await fetch('https://api.github.com/gists/' + s.gistId, {
            headers: { 'Authorization': 'Bearer ' + s.token }
        });
        if (!res.ok) throw new Error('GitHub 錯誤 ' + res.status);
        const json = await res.json();
        const raw = json.files?.['aurelia-backup.json']?.content;
        if (!raw) throw new Error('Gist 中找不到 aurelia-backup.json');
        return JSON.parse(raw);
    }

    // ── 本地匯出入 ────────────────────────────────────────────────────
    async function exportLocal() {
        const data = await collectAll();
        const content = JSON.stringify(data, null, 2);
        const sizeKB = Math.round(new Blob([content]).size / 1024);
        const blob = new Blob([content], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'aurelia-full-backup-' + new Date().toISOString().slice(0, 10) + '.json';
        a.click();
        return sizeKB;
    }

    async function importLocal(file, opts = {}) {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data.version || !data.db) throw new Error('無法識別的備份格式');
        return applyData(data, opts);
    }

    // ── 儲存空間 ────────────────────────────────────────────────────
    // 分項（掃描鈕）：文字資料算大小，圖片只算張數——圖的大小要把圖讀出來才量得到，整庫讀一遍會撐爆記憶體。
    //   張數走 VN_Cache.getAllMeta(partial)＝只看鑰匙，不讀圖。名字一律給人看的，不顯示倉庫代號。
    const SIZE_STORES = [
        ['vn_chapters', '劇情章節'], ['api_chats', '聊天 app 的對話'], ['world_book_entries', '世界書'],
        ['var_packs', '變數包'], ['ui_templates', '劇情面板'], ['achievements', '成就']
    ];
    const IMAGE_STORES = [['scene_cache', '插圖'], ['bg_cache', '背景'], ['avatar_cache', '頭像與直生立繪'], ['sprite_cache', '立繪'], ['item_cache', '物品圖']];
    async function estimateSize() {
        const results = {};
        const C = win.VN_Cache || window.VN_Cache;
        if (C && C.getAllMeta) {
            let n = 0; const parts = [];
            for (const [s, label] of IMAGE_STORES) {
                try { const k = (await C.getAllMeta(s, { partial: true })).length; if (k) { n += k; parts.push(label + ' ' + k); } } catch (e) {}
            }
            results['圖片'] = { count: n, unit: '張', note: parts.join('、') };
        }
        for (const [s, label] of SIZE_STORES) {
            try {
                const items = await _getStore(s);
                const kb = Math.round(new Blob([JSON.stringify(items)]).size / 1024);
                results[label] = { count: items.length, kb };
            } catch(e) { results[label] = { count: 0, kb: 0 }; }
        }
        return results;
    }

    // 整個站在這台裝置上用了多少、瀏覽器給多少、資料有沒有受保護。
    //   瀏覽器空間吃緊時是「整個站的資料一起丟」，不是只丟圖；受保護（persist）之後瀏覽器不會自己動手清，
    //   只有使用者自己去清。酒館桌面版的資料在電腦資料夾裡、本來就不會被清，叫了也無害，所以不分版本都叫。
    async function storageStatus() {
        const st = { supported: false, usage: 0, quota: 0, ratio: 0, persisted: null };
        const ns = win.navigator && win.navigator.storage;
        if (!ns) return st;
        try { if (ns.estimate) { const e = await ns.estimate(); st.supported = true; st.usage = e.usage || 0; st.quota = e.quota || 0; st.ratio = st.quota ? st.usage / st.quota : 0; } } catch (e) {}
        try { if (ns.persisted) st.persisted = await ns.persisted(); } catch (e) {}
        return st;
    }
    async function requestPersist() {
        const ns = win.navigator && win.navigator.storage;
        if (!ns || !ns.persist) return null;
        try { if (ns.persisted && await ns.persisted()) return true; return await ns.persist(); } catch (e) { return false; }
    }
    // 開機後自己申請一次保護；用到八成以上一天提醒一次（不擋畫面）
    const WARN_KEY = 'os_storage_warn_day';
    async function _bootCheck() {
        await requestPersist();
        const st = await storageStatus();
        if (!st.supported || st.ratio < 0.8) return;
        const _d = new Date(), today = _d.getFullYear() + '-' + (_d.getMonth() + 1) + '-' + _d.getDate();
        try { if (localStorage.getItem(WARN_KEY) === today) return; localStorage.setItem(WARN_KEY, today); } catch (e) {}
        const A = win.AUI || window.AUI;
        // 「系統/備份」那一頁只有 PWA 有；酒館版沒有那頁，就只指相簿
        let pwa = false; try { pwa = !!(win.OS_API && win.OS_API.isStandalone && win.OS_API.isStandalone()); } catch (e) {}
        const msg = '這台裝置留給奧瑞亞的空間已經用了 ' + Math.round(st.ratio * 100) + '%。'
                  + (pwa ? '到 設置 → 系統/備份 先匯出一份備份，再到相簿壓縮或清掉不要的圖。' : '到相簿壓縮或清掉不要的圖。');
        try { if (A && A.toast) A.toast(msg, { type: 'warn' }); } catch (e) {}
    }
    try { setTimeout(() => { _bootCheck().catch(() => {}); }, 6000); } catch (e) {}

    // ── 對外接口 ──────────────────────────────────────────────────────
    win.OS_BACKUP = {
        getSettings,
        saveSettings,
        gistBackup,
        gistRestore,
        applyData,
        exportLocal,
        importLocal,
        estimateSize,
        storageStatus,
        requestPersist,
        collectEssential,
        collectAll,
    };

    console.log('[PhoneOS] ✅ 統一備份引擎 (OS_BACKUP V2.0 - 支援 AVS 與 VN) 已載入');
})();