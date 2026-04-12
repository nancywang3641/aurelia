// ----------------------------------------------------------------
// [檔案] os_backup.js (V1.0)
// 路徑：os_phone/os/os_backup.js
// 職責：統一資料備份引擎
//   - 備份目標：IndexedDB 重要倉庫 + localStorage 設定
//   - 雲端：GitHub Gist（輕量必要資料）
//   - 本地：JSON 檔案匯出入（包含大型資料）
//   - VN 故事文本量大，預設僅本地匯出，不走 Gist
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const LSKEY = 'os_backup_settings';

    // localStorage 中需要備份的 key 列表（不含敏感 token）
    const LS_BACKUP_KEYS = [
        'os_global_config',           // 主模型設定
        'os_secondary_llm_config',    // 副模型設定
        'os_image_config',            // 圖片生成設定
        'os_minimax_config',          // Minimax 語音設定
        'os_worldbook_cats',          // 世界書分類
        'vn_cfg_v4',                  // VN 面板設定
        'os_persona_data',            // 人設資料
        'os_economy_data',            // 錢包餘額/交易
    ];

    // ── 設定讀寫 ─────────────────────────────────────────────────────
    function getSettings() {
        try { return JSON.parse(localStorage.getItem(LSKEY) || '{}'); } catch(e) { return {}; }
    }
    function saveSettings(s) { localStorage.setItem(LSKEY, JSON.stringify(s)); }

    // ── 資料收集 ─────────────────────────────────────────────────────
    async function collectDB(opts) {
        const db = win.OS_DB;
        const out = {};
        try {
            if (opts.worldbook !== false && db?.getAllWorldbookEntries)
                out.worldbook = await db.getAllWorldbookEntries();

            if (opts.pets !== false && db?.getAllPets)
                out.pets = await db.getAllPets();

            if (opts.achievements !== false && db?.getAllAchievements)
                out.achievements = await db.getAllAchievements().catch(() => []);

            if (opts.petLogs && db) {
                // pet_logs 可能很大，只在全量備份時收集
                out.petLogs = await _getStore('pet_logs').catch(() => []);
            }
        } catch(e) { console.warn('[OS_BACKUP] DB 收集部分失敗:', e); }
        return out;
    }

    function collectLocalStorage() {
        const out = {};
        LS_BACKUP_KEYS.forEach(k => {
            const v = localStorage.getItem(k);
            if (v !== null) out[k] = v; // 保留原始字串，還原時直接 setItem
        });
        return out;
    }

    // 通用 IndexedDB getAll（用於 pet_logs 等沒有封裝方法的倉庫）
    function _getStore(storeName) {
        return new Promise(async (resolve, reject) => {
            try {
                const db = await win.OS_DB.init();
                const tx = db.transaction(storeName, 'readonly');
                const req = tx.objectStore(storeName).getAll();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = e => reject(e.target.error);
            } catch(e) { reject(e); }
        });
    }

    // ── 全量資料打包（本地匯出用） ────────────────────────────────────
    async function collectAll(opts = {}) {
        const dbData = await collectDB({ ...opts, petLogs: opts.petLogs !== false });
        return {
            version: 2,
            exportedAt: new Date().toISOString(),
            type: 'full',
            db: dbData,
            localStorage: collectLocalStorage()
        };
    }

    // ── Gist 備份資料打包（只含輕量必要資料） ─────────────────────────
    async function collectEssential() {
        const dbData = await collectDB({ worldbook: true, pets: true, achievements: true, petLogs: false });
        return {
            version: 2,
            exportedAt: new Date().toISOString(),
            type: 'essential',
            db: dbData,
            localStorage: collectLocalStorage()
        };
    }

    // ── 還原資料 ──────────────────────────────────────────────────────
    async function applyData(data, opts = {}) {
        const db = win.OS_DB;
        let restored = { worldbook: 0, pets: 0, achievements: 0, localStorage: 0 };

        // IndexedDB
        if (data.db) {
            const d = data.db;
            if (d.worldbook?.length && db?.saveWorldbookEntry) {
                for (const e of d.worldbook) await db.saveWorldbookEntry(e);
                restored.worldbook = d.worldbook.length;
            }
            if (d.pets?.length && db?.savePet) {
                for (const e of d.pets) await db.savePet(e);
                restored.pets = d.pets.length;
            }
            if (d.achievements?.length && db) {
                for (const e of d.achievements) {
                    await _putStore('achievements', e).catch(() => {});
                }
                restored.achievements = d.achievements.length;
            }
        }

        // localStorage
        if (data.localStorage && opts.restoreSettings !== false) {
            Object.entries(data.localStorage).forEach(([k, v]) => {
                localStorage.setItem(k, v);
                restored.localStorage++;
            });
        }

        return restored;
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

    // ── GitHub Gist API ───────────────────────────────────────────────
    async function gistBackup() {
        const s = getSettings();
        if (!s.token) throw new Error('請先填入 GitHub Personal Access Token');

        const data = await collectEssential();
        const content = JSON.stringify(data, null, 2);

        // 檢查大小（Gist 單檔上限約 10MB，超過提醒用戶改用本地匯出）
        const sizeKB = Math.round(new Blob([content]).size / 1024);
        if (sizeKB > 8192) throw new Error(`資料量過大（${sizeKB}KB），請改用「本地匯出」備份大型資料`);

        const body = { files: { 'aurelia-backup.json': { content } } };
        let url = 'https://api.github.com/gists', method = 'POST';
        if (s.gistId) { url += '/' + s.gistId; method = 'PATCH'; }
        else { body.description = '奧瑞亞系統統一備份 V2'; body.public = false; }

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
    async function exportLocal(includeVN = false) {
        const data = await collectAll({ petLogs: true });
        if (includeVN) {
            // 預留：VN 故事存檔（未來接入後在這裡補充）
            // data.db.vnSessions = await _getStore('vn_sessions').catch(() => []);
        }
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

    // ── 儲存空間估算 ──────────────────────────────────────────────────
    async function estimateSize() {
        const results = {};
        const stores = ['world_book_entries', 'pets', 'pet_logs', 'achievements', 'child_chat_history'];
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

    console.log('[PhoneOS] ✅ 統一備份引擎 (OS_BACKUP V1.0) 已載入');
})();
