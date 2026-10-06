// ----------------------------------------------------------------
// [檔案] os_backup.js (V2.0 - 終極全量備份版：支援 AVS 與 VN V16)
// 路徑：os_phone/os/os_backup.js
// 職責：統一資料備份引擎
//   - 備份目標：IndexedDB 所有重要倉庫 + localStorage 設定
//   - 雲端自動備份：托管伺服器或 GitHub 私人倉庫，分塊勾選（cloudBackup；10-04 起，舊的 Gist 拿掉了）
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
        'os_elevenlabs_config',       // ElevenLabs 語音設定
        'os_voice_cast',              // 角色配音名單（誰用哪個聲音）
        'os_vn_foreign',              // 外語角色名單（誰講哪種語言）
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
    // 只有本地全量匯出才收的（可能很大：書的封面、每本故事的狀態）
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
    // 🧩 小機（宿舍的 API 小機）：記憶與對話在 app_data／studio_chats 裡會跟著備份，
    //   但「宿舍名冊上有這隻」（os_claude_room_config 的 residents）和「它有哪幾串對話」（xiaoji_convs）在房間的 localStorage，
    //   以前沒備到——從備份還原，小機會不見（10-06 查到）。這裡只收小機那幾筆，不整份備份那個共用設定（裡面有橋的設定）。
    //   照意思找的向量（app_data 的 xiaoji_vec::）不收：還原後在本機重新算（不花錢），算完之前照字找照常。
    const XJ = {
        roster() {
            let cfg = null, convs = [];
            try { cfg = JSON.parse(localStorage.getItem('os_claude_room_config') || 'null'); } catch (e) {}
            try { convs = JSON.parse(localStorage.getItem('xiaoji_convs') || '[]') || []; } catch (e) {}
            const residents = ((cfg && Array.isArray(cfg.residents)) ? cfg.residents : []).filter(r => r && r.provider === 'xiaoji');
            const ids = new Set(residents.map(r => r.id));
            const active = {};
            ids.forEach(id => { const v = localStorage.getItem('xiaoji_active__' + id); if (v !== null) active['xiaoji_active__' + id] = v; });
            return { residents, convs: (Array.isArray(convs) ? convs : []).filter(c => c && ids.has(c.residentId)), active };
        },
        restore(r) {
            if (!r || !Array.isArray(r.residents) || !r.residents.length) return 0;
            let cfg = {};
            try { cfg = JSON.parse(localStorage.getItem('os_claude_room_config') || '{}') || {}; } catch (e) {}
            const list = Array.isArray(cfg.residents) ? cfg.residents : [];
            let n = 0;
            r.residents.forEach(x => { if (x && x.id && !list.some(y => y && y.id === x.id)) { list.push(x); n++; } });
            cfg.residents = list;
            localStorage.setItem('os_claude_room_config', JSON.stringify(cfg));
            let convs = [];
            try { convs = JSON.parse(localStorage.getItem('xiaoji_convs') || '[]') || []; } catch (e) {}
            (r.convs || []).forEach(c => { if (c && c.id && !convs.some(y => y && y.id === c.id)) convs.push(c); });
            localStorage.setItem('xiaoji_convs', JSON.stringify(convs));
            Object.keys(r.active || {}).forEach(k => { if (localStorage.getItem(k) === null) localStorage.setItem(k, r.active[k]); });
            return n;
        },
        skip(store, e) { return store === 'app_data' && /^xiaoji_vec::/.test(String((e && e.id) || '')); }
    };
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
    // 10-04 拿掉 Gist：以前存在這裡的 GitHub 金鑰與 Gist 編號清掉，不要留一把沒在用的金鑰在瀏覽器裡
    try { const _o = getSettings(); if (_o.token || _o.gistId) { delete _o.token; delete _o.gistId; saveSettings(_o); } } catch (e) {}

    // ── 通用 IndexedDB 方法 ──────────────────────────────────────────
    function _getStore(storeName) {
        return new Promise(async (resolve, reject) => {
            try {
                if (!win.OS_DB) return resolve([]);
                const db = await win.OS_DB.init();
                const tx = db.transaction(storeName, 'readonly');
                const req = tx.objectStore(storeName).getAll();
                req.onsuccess = () => resolve((req.result || []).filter(e => !XJ.skip(storeName, e)));
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
            // 🌟 1. 世界書與成就
            if (opts.worldbook !== false) out.worldbook = await _getStore('world_book_entries');
            if (opts.achievements !== false) out.achievements = await _getStore('achievements');

            // 🌟 2. 全量資料 (僅限本地 JSON 打包)
            if (opts.fullExport) {
                out.stores = {};
                for (const name of FULL_STORES) out.stores[name] = await _getStore(name);
                out.xiaoji_roster = XJ.roster();
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
            if (d.xiaoji_roster) { try { restored.xiaoji = XJ.restore(d.xiaoji_roster); } catch (e) { console.warn('[OS_BACKUP] 小機名冊沒還原成:', e); } }
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
        try { const s = getSettings(); s.lastExportAt = Date.now(); saveSettings(s); } catch (e) {}   // 打開 app 時「多久沒備份」看這個
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

    // ── 雲端自動備份（托管伺服器，2026-10-04）──────────────────────────
    //   她：「要不要做一個開關給pwa的備份，自動備份?」「上傳應該是不是可以單向勾選要的部分?」
    //   用「回覆交給伺服器跑」那組網址與通行碼（aurelia_relay_cfg），伺服器 POST /v1/backup 收、留最近七份。
    //   一塊一塊勾：設定那塊有 API 金鑰，預設不勾（托管伺服器的原則是不存她的金鑰）。勾選只管上傳，本地匯出照舊整份。
    //   開著時：打開 app 距離上次超過一天備份一次；切出去時距離上次「看過」超過六小時也備一次。內容沒變不上傳。
    //   沒伺服器（或沒開）：打開 app 時超過七天沒匯出就問一次要不要匯出，「之後再說」三天後再問（只在手機版）。
    const AUTO_KEY = 'os_backup_auto';
    const PARTS = [
        { k: 'story', label: '劇情（章節、記憶、大總結、書架、人設）', stores: ['vn_chapters', 'vn_memories', 'vn_grand_summaries', 'tavern_summary', 'map_data'],
          ls: ['aurelia_custom_worlds', 'vn_current_story_id', 'vn_current_story_title', 'os_personas'] },
        { k: 'phone', label: '手機 app（聊天、微博、各 app 的資料）', stores: ['api_chats', 'wb_posts', 'phone_apps', 'app_memory', 'app_data'] },
        { k: 'wb', label: '世界書', worldbook: true, ls: ['os_worldbook_books'] },
        { k: 'avs', label: '狀態與面板', stores: ['var_packs', 'ui_templates', 'state_data'],
          ls: ['avs_condition_rules', 'aurelia_rules_tavern', 'avs_current_state', 'avs_active_ui_templates'], prefixes: ['avs_state_'] },
        { k: 'lobby', label: '大廳', stores: ['lobby_history', 'lobby_summary_index', 'lobby_npc_memory'] },
        { k: 'studio', label: '創作室', stores: ['studio_chats', 'studio_drafts'] },
        { k: 'ach', label: '成就', achievements: true },
        { k: 'settings', label: '設定（含 API 金鑰）', off: true,
          ls: ['os_global_config', 'os_secondary_llm_config', 'os_image_config', 'os_minimax_config', 'os_elevenlabs_config',
               'os_voice_cast', 'os_vn_foreign', 'vn_cfg_v4', 'vn_prompt_order', 'wx_phone_api_config'] },
    ];
    // FULL_STORES 之後新加的倉庫沒排進哪一塊：先跟著「手機 app」走，不要默默漏掉
    (function () {
        const claimed = [].concat.apply([], PARTS.map(p => p.stores || []));
        const phone = PARTS.find(p => p.k === 'phone');
        FULL_STORES.forEach(s => { if (claimed.indexOf(s) === -1) phone.stores.push(s); });
    })();

    function autoGet() {
        let a = {};
        try { a = JSON.parse(localStorage.getItem(AUTO_KEY) || '{}') || {}; } catch (e) {}
        const parts = {};
        PARTS.forEach(p => { parts[p.k] = (a.parts && typeof a.parts[p.k] === 'boolean') ? a.parts[p.k] : !p.off; });
        return Object.assign({ on: false, dest: 'relay', lastAt: 0, lastHash: '', lastTryAt: 0, lastErr: '', lastSize: 0 }, a, { parts });
    }
    function autoSave(patch) {
        const a = Object.assign(autoGet(), patch || {});
        try { localStorage.setItem(AUTO_KEY, JSON.stringify(a)); } catch (e) {}
        return a;
    }
    // 托管伺服器那組（「回覆交給伺服器跑」填的）；網址與通行碼都有才算
    //   🚨 網址一律照 OS_RELAY.base() 整理：她沒打 https:// 時那邊會補上、回覆照常跑，
    //      這裡以前自己讀原字串沒補 → 被當成手機版網站底下的路徑，備份打到自己網站回 404（她：「上面交給伺服器跑，正常連了啊」）
    function relayOf() {
        try {
            const R = win.OS_RELAY;
            const c = (R && R.cfg) ? R.cfg() : (JSON.parse(localStorage.getItem('aurelia_relay_cfg') || '{}') || {});
            let url = (R && R.base) ? R.base() : String(c.url || '').trim().replace(/\/+$/, '');
            if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
            url = url.replace(/\/v1$/, '');
            const token = String(c.token || '').trim();
            return (url && token) ? { url, token } : null;
        } catch (e) { return null; }
    }
    async function collectParts(parts) {
        const sel = PARTS.filter(p => parts[p.k]);
        const db = { stores: {} }, ls = {};
        for (const p of sel) {
            if (p.worldbook) db.worldbook = await _getStore('world_book_entries');
            if (p.achievements) db.achievements = await _getStore('achievements');
            for (const s of (p.stores || [])) db.stores[s] = await _getStore(s);
            (p.ls || []).forEach(k => { const v = localStorage.getItem(k); if (v !== null) ls[k] = v; });
            if (p.prefixes) for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && p.prefixes.some(x => k.startsWith(x))) ls[k] = localStorage.getItem(k);
            }
        }
        if (sel.some(p => (p.stores || []).indexOf('app_data') !== -1)) db.xiaoji_roster = XJ.roster();
        return { version: 4, exportedAt: new Date().toISOString(), type: 'cloud', parts: sel.map(p => p.k), db, localStorage: ls };
    }
    async function _sha(text) {
        try {
            const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
            return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) { return ''; }   // 不安全的網址沒有 crypto.subtle：照傳，伺服器那邊就不會擋重複
    }
    function _device() {
        const u = (win.navigator && win.navigator.userAgent) || '';
        return /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Android/.test(u) ? 'Android' : /Mac/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : 'web';
    }
    // ── 備份到哪裡：托管伺服器（relay）或 GitHub 私人倉庫（github）────────
    //   她：「那朋友沒伺服器，沒辦法自動備份到 github?」→ 舊的 Gist 拿掉（只收一小部分、要自己按；
    //   Gist 設成秘密也是拿到網址就看得到），改成朋友自己的私人倉庫：每備份一次就是一次更新，以前的版本 GitHub 自己記著。
    //   金鑰存在這台的瀏覽器裡（跟 API 金鑰一樣），說明叫他們把權限開成只碰那一個倉庫。
    const GH_KEY = 'os_backup_github';   // { repo: 'owner/name', token }
    const GH_FILE = 'aurelia-backup.json';
    function _repoOf(v) {
        const m = String(v || '').trim().replace(/\.git$/, '').replace(/\/+$/, '').match(/(?:github\.com[\/:])?([\w.-]+)\/([\w.-]+)$/);
        return m ? m[1] + '/' + m[2] : '';
    }
    function ghGet() {
        let g = {};
        try { g = JSON.parse(localStorage.getItem(GH_KEY) || '{}') || {}; } catch (e) {}
        return { repo: _repoOf(g.repo), token: String(g.token || '').trim() };
    }
    function ghSave(patch) {
        const g = Object.assign(ghGet(), patch || {});
        g.repo = _repoOf(g.repo); g.token = String(g.token || '').trim();
        try { localStorage.setItem(GH_KEY, JSON.stringify(g)); } catch (e) {}
        return g;
    }
    // 現在選的那個地方填好了沒
    function destReady(a) {
        a = a || autoGet();
        if (a.dest === 'github') { const g = ghGet(); return !!(g.repo && g.token); }
        return !!relayOf();
    }
    async function _gh(path, opt) {
        opt = opt || {};
        const g = ghGet();
        if (!g.repo || !g.token) throw new Error('還沒填 GitHub 倉庫和金鑰');
        let res;
        try {
            res = await fetch('https://api.github.com/repos/' + g.repo + path, {
                method: opt.method || 'GET', body: opt.body,
                headers: Object.assign({ 'Authorization': 'Bearer ' + g.token, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, opt.headers || {})
            });
        } catch (e) { throw new Error('連不上 GitHub'); }
        if (res.status === 401) throw new Error('GitHub 金鑰不對，或已經過期');
        if (res.status === 403) throw new Error('這把金鑰沒有寫這個倉庫的權限（Contents 要開「讀寫」）');
        if (res.status === 404 && !opt.allow404) throw new Error('找不到這個倉庫（名字打錯，或金鑰沒開放給它）');
        return res;
    }
    function _b64(str) {
        const bytes = new TextEncoder().encode(str);
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return btoa(bin);
    }
    async function _ghUpload(body, hash) {
        // 更新要帶現在那份的 sha；沒有＝倉庫裡還沒有，第一次
        const r0 = await _gh('/contents/' + GH_FILE, { allow404: true });
        let sha;
        if (r0.ok) sha = ((await r0.json().catch(() => ({}))) || {}).sha;
        else if (r0.status !== 404) throw new Error('GitHub 回了 ' + r0.status);
        const msg = '奧瑞亞備份 ' + _device() + ' ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + (hash ? ' #' + hash.slice(0, 8) : '');
        const r = await _gh('/contents/' + GH_FILE, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: msg, content: _b64(body), sha: sha || undefined }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error((r.status === 409 || r.status === 422) ? '另一台剛好也在傳，等一下再試' : (j.message || ('GitHub 回了 ' + r.status)));
        return { id: j.commit && j.commit.sha, size: body.length };
    }
    async function _ghList() {
        const r = await _gh('/commits?path=' + encodeURIComponent(GH_FILE) + '&per_page=10', { allow404: true });
        if (r.status === 404) return [];
        const list = await r.json().catch(() => []);
        return (Array.isArray(list) ? list : []).map(c => {
            const m = String((c.commit && c.commit.message) || '').match(/^奧瑞亞備份 (\S+)/);
            const t = c.commit && (c.commit.committer || c.commit.author);
            return { id: c.sha, at: t ? Date.parse(t.date) / 1000 : 0, device: m ? m[1] : '' };
        });
    }
    async function _ghFetch(id) {
        const r = await _gh('/contents/' + GH_FILE + '?ref=' + encodeURIComponent(id), { headers: { 'Accept': 'application/vnd.github.raw+json' } });
        if (!r.ok) throw new Error('拿不到這一份（' + r.status + '）');
        return JSON.parse(await r.text());
    }

    // 回 { same } 或那一份的資料；失敗丟錯（中文）
    let _cloudBusy = null;
    function cloudBackup(opt) {
        if (_cloudBusy) return _cloudBusy;
        _cloudBusy = (async () => {
            opt = opt || {};
            const a = autoGet();
            const gh = a.dest === 'github';
            const r = gh ? null : relayOf();
            if (gh ? !destReady(a) : !r) throw new Error(gh ? '還沒填 GitHub 倉庫和金鑰' : '還沒填托管伺服器的網址與通行碼');
            if (!PARTS.some(p => a.parts[p.k])) throw new Error('一塊都沒勾');
            const data = await collectParts(a.parts);
            const body = JSON.stringify(data);
            const hash = await _sha(JSON.stringify(Object.assign({}, data, { exportedAt: '' })));
            autoSave({ lastTryAt: Date.now() });
            if (!opt.force && hash && hash === a.lastHash) return { same: true, size: body.length };
            let out;
            try {
                if (gh) out = await _ghUpload(body, hash);
                else {
                    let res, j = {};
                    try {
                        res = await fetch(r.url + '/v1/backup?hash=' + hash + '&device=' + encodeURIComponent(_device()), {
                            method: 'POST', headers: { 'Authorization': 'Bearer ' + r.token, 'Content-Type': 'application/json' }, body
                        });
                        j = await res.json().catch(() => ({}));
                    } catch (e) { throw new Error('連不上托管伺服器'); }
                    if (!res.ok) throw new Error(res.status === 401 ? '通行碼不對' : (j.error || ('伺服器回了 ' + res.status)));
                    out = j;
                }
            } catch (e) { autoSave({ lastErr: e.message }); throw e; }
            autoSave({ lastAt: Date.now(), lastHash: hash, lastErr: '', lastSize: body.length });
            return out;
        })().finally(() => { _cloudBusy = null; });
        return _cloudBusy;
    }
    async function cloudList() {
        if (autoGet().dest === 'github') return _ghList();
        const r = relayOf();
        if (!r) throw new Error('還沒填托管伺服器的網址與通行碼');
        const res = await fetch(r.url + '/v1/backups', { headers: { 'Authorization': 'Bearer ' + r.token } }).catch(() => null);
        if (!res) throw new Error('連不上托管伺服器');
        if (res.status === 401) throw new Error('通行碼不對');
        if (res.status === 404) throw new Error('托管伺服器還沒有備份的功能（要更新伺服器那支）');
        const j = await res.json().catch(() => ({}));
        return j.items || [];
    }
    async function cloudGet(id) {
        let data;
        if (autoGet().dest === 'github') data = await _ghFetch(id);
        else {
            const r = relayOf();
            if (!r) throw new Error('還沒填托管伺服器的網址與通行碼');
            const res = await fetch(r.url + '/v1/backup/' + encodeURIComponent(id), { headers: { 'Authorization': 'Bearer ' + r.token } }).catch(() => null);
            if (!res || !res.ok) throw new Error(res ? '拿不到這一份（' + res.status + '）' : '連不上托管伺服器');
            data = await res.json();
        }
        if (!data || !data.version || !data.db) throw new Error('這一份不是奧瑞亞的備份');
        return data;
    }

    // 自動：只在手機版（酒館的資料在電腦資料夾裡，本來就不會被清）
    function _isPwa() { try { return !!(win.OS_API && win.OS_API.isStandalone && win.OS_API.isStandalone()); } catch (e) { return false; } }
    const DAY = 86400000;
    const REMIND_KEY = 'os_backup_remind_snooze';
    async function _autoBoot() {
        if (!_isPwa()) return;
        const a = autoGet();
        if (a.on && destReady(a)) {
            if (Date.now() - (a.lastAt || 0) > DAY) cloudBackup().catch(e => console.warn('[OS_BACKUP] 自動備份沒成功：', e.message));
            // 開著卻三天以上沒成功：一天講一次
            if (a.lastAt && Date.now() - a.lastAt > 3 * DAY && a.lastErr) {
                const _d = new Date(), today = _d.getFullYear() + '-' + (_d.getMonth() + 1) + '-' + _d.getDate();
                try { if (localStorage.getItem('os_backup_fail_day') !== today) { localStorage.setItem('os_backup_fail_day', today);
                    const A = win.AUI || window.AUI; if (A && A.toast) A.toast('自動備份已經 ' + Math.floor((Date.now() - a.lastAt) / DAY) + ' 天沒成功：' + a.lastErr, { type: 'warn' }); } } catch (e) {}
            }
            return;
        }
        // 沒開自動：太久沒匯出就問一次
        const s = getSettings();
        let snooze = 0; try { snooze = Number(localStorage.getItem(REMIND_KEY) || 0); } catch (e) {}
        if (Date.now() < snooze) return;
        const last = s.lastExportAt || 0;
        if (last && Date.now() - last < 7 * DAY) return;
        if (!last) {   // 從沒匯出過：有玩過東西才問（剛裝好什麼都沒有就別吵）
            const has = (await _getStore('vn_chapters')).length || (await _getStore('api_chats')).length;
            if (!has) return;
        }
        const A = win.AUI || window.AUI;
        if (!A || !A.confirm) return;
        const ok = await A.confirm((last ? '已經 ' + Math.floor((Date.now() - last) / DAY) + ' 天沒備份了。' : '還沒備份過。')
            + '手機版的資料只存在這支手機的瀏覽器裡，清掉或換手機就沒了。要現在匯出一份嗎？',
            { title: '備份', okText: '匯出', cancelText: '之後再說', danger: false });   // 句子裡有「清掉」會被判成危險、按鈕變紅
        if (ok) { try { await exportLocal(); } catch (e) {} }
        else { try { localStorage.setItem(REMIND_KEY, String(Date.now() + 3 * DAY)); } catch (e) {} }
    }
    try { setTimeout(() => { _autoBoot().catch(() => {}); }, 20000); } catch (e) {}
    try {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'hidden' || !_isPwa()) return;
            const a = autoGet();
            if (a.on && destReady(a) && Date.now() - (a.lastTryAt || 0) > 6 * 3600000) cloudBackup().catch(() => {});
        });
    } catch (e) {}

    // ── 對外接口 ──────────────────────────────────────────────────────
    win.OS_BACKUP = {
        _xj: XJ,
        PARTS, autoGet, autoSave, relayOf, ghGet, ghSave, destReady, cloudBackup, cloudList, cloudGet, collectParts,
        getSettings,
        saveSettings,
        applyData,
        exportLocal,
        importLocal,
        estimateSize,
        storageStatus,
        requestPersist,
        collectAll,
    };

    console.log('[PhoneOS] ✅ 統一備份引擎 (OS_BACKUP V2.0 - 支援 AVS 與 VN) 已載入');
})();