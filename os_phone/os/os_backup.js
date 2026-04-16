// ----------------------------------------------------------------
// [檔案] os_backup.js (V2.0 - 終極全量備份版：支援 AVS 與 VN V16)
// 路徑：os_phone/os/os_backup.js
// 職責：統一資料備份引擎
//   - 備份目標：IndexedDB 所有重要倉庫 + localStorage 設定
//   - 雲端：GitHub Gist（僅限世界書/寵物等輕量必要資料）
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
        'os_worldbook_cats',          // 世界書分類
        'vn_cfg_v4',                  // VN 面板設定
        'os_persona_data',            // 人設資料
        'os_economy_data',            // 錢包餘額/交易
        'avs_current_state',          // [AVS] 當前全局動態變數 JSON 狀態
        'avs_active_ui_templates',    // [AVS] 當前啟用的美化面板快取
        'vn_current_story_id',        // [VN] 當前故事 ID
        'vn_current_story_title',     // [VN] 當前故事顯示名
        'vn_prompt_order',            // [VN] 提示詞順序
        'wx_phone_api_config'         // 微信設定
    ];

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
            if (opts.pets !== false) out.pets = await _getStore('pets');
            if (opts.achievements !== false) out.achievements = await _getStore('achievements');

            // 🌟 2. 全量資料 (僅限本地 JSON 打包)
            if (opts.fullExport) {
                out.petLogs = await _getStore('pet_logs');
                
                // 🔥 新增：AVS 變數工坊資料
                out.varPacks = await _getStore('var_packs');
                out.uiTemplates = await _getStore('ui_templates');
                
                // 🔥 新增：VN 視覺小說長線劇本
                out.vnChapters = await _getStore('vn_chapters');
                
                // 🔥 新增：各類聊天與歷史紀錄
                out.apiChats = await _getStore('api_chats');
                out.childChatHistory = await _getStore('child_chat_history');
                out.wbPosts = await _getStore('wb_posts');
                out.lobbyHistory = await _getStore('lobby_history');
            }
        } catch(e) { console.warn('[OS_BACKUP] DB 收集部分失敗:', e); }
        return out;
    }

    function collectLocalStorage() {
        const out = {};
        LS_BACKUP_KEYS.forEach(k => {
            const v = localStorage.getItem(k);
            if (v !== null) out[k] = v; 
        });
        return out;
    }

    // ── 全量資料打包（本地匯出用） ────────────────────────────────────
    async function collectAll(opts = {}) {
        // 強制開啟全量收集模式
        const dbData = await collectDB({ ...opts, fullExport: true });
        return {
            version: 3, // 升級為 V3 備份格式
            exportedAt: new Date().toISOString(),
            type: 'full',
            db: dbData,
            localStorage: collectLocalStorage()
        };
    }

    // ── Gist 備份資料打包（只含輕量必要資料） ─────────────────────────
    async function collectEssential() {
        const dbData = await collectDB({ worldbook: true, pets: true, achievements: true, fullExport: false });
        return {
            version: 3,
            exportedAt: new Date().toISOString(),
            type: 'essential',
            db: dbData,
            localStorage: collectLocalStorage()
        };
    }

    // ── 還原資料 ──────────────────────────────────────────────────────
    async function applyData(data, opts = {}) {
        let restored = { worldbook: 0, pets: 0, achievements: 0, localStorage: 0, avs: 0, vn: 0, chats: 0 };

        // IndexedDB 恢復
        if (data.db) {
            const d = data.db;
            
            // 恢復基礎資料
            if (d.worldbook?.length) {
                for (const e of d.worldbook) await _putStore('world_book_entries', e).catch(()=>{});
                restored.worldbook = d.worldbook.length;
            }
            if (d.pets?.length) {
                for (const e of d.pets) await _putStore('pets', e).catch(()=>{});
                restored.pets = d.pets.length;
            }
            if (d.achievements?.length) {
                for (const e of d.achievements) await _putStore('achievements', e).catch(()=>{});
                restored.achievements = d.achievements.length;
            }

            // 恢復 AVS 資料
            if (d.varPacks?.length) {
                for (const e of d.varPacks) await _putStore('var_packs', e).catch(()=>{});
                restored.avs += d.varPacks.length;
            }
            if (d.uiTemplates?.length) {
                for (const e of d.uiTemplates) await _putStore('ui_templates', e).catch(()=>{});
                restored.avs += d.uiTemplates.length;
            }

            // 恢復 VN 資料
            if (d.vnChapters?.length) {
                for (const e of d.vnChapters) await _putStore('vn_chapters', e).catch(()=>{});
                restored.vn += d.vnChapters.length;
            }

            // 恢復其他歷史紀錄
            if (d.petLogs?.length) for (const e of d.petLogs) await _putStore('pet_logs', e).catch(()=>{});
            if (d.apiChats?.length) {
                for (const e of d.apiChats) await _putStore('api_chats', e).catch(()=>{});
                restored.chats += d.apiChats.length;
            }
            if (d.childChatHistory?.length) for (const e of d.childChatHistory) await _putStore('child_chat_history', e).catch(()=>{});
            if (d.wbPosts?.length) for (const e of d.wbPosts) await _putStore('wb_posts', e).catch(()=>{});
            if (d.lobbyHistory?.length) for (const e of d.lobbyHistory) await _putStore('lobby_history', e).catch(()=>{});
        }

        // LocalStorage 恢復
        if (data.localStorage && opts.restoreSettings !== false) {
            Object.entries(data.localStorage).forEach(([k, v]) => {
                localStorage.setItem(k, v);
                restored.localStorage++;
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

    // ── 儲存空間估算 (包含所有 V16 倉庫) ────────────────────────────────
    async function estimateSize() {
        const results = {};
        // 將 AVS 和 VN 加入掃描清單
        const stores = [
            'world_book_entries', 'pets', 'pet_logs', 'achievements', 
            'child_chat_history', 'var_packs', 'ui_templates', 'vn_chapters', 'api_chats'
        ];
        for (const s of stores) {
            try {
                const items = await _getStore(s);
                const kb = Math.round(new Blob([JSON.stringify(items)]).size / 1024);
                results[s] = { count: items.length, kb };
            } catch(e) { results[s] = { count: 0, kb: 0 }; }
        }
        return results;
    }

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
        collectEssential,
        collectAll,
    };

    console.log('[PhoneOS] ✅ 統一備份引擎 (OS_BACKUP V2.0 - 支援 AVS 與 VN) 已載入');
})();