// ----------------------------------------------------------------
// [檔案] os_achievement.js (V1.1 - 全域成就)
// 路徑：os_phone/os/os_achievement.js
// 職責：成就系統 - 管理 VN 劇情解鎖的成就 (全域，不過濾 chatId)
//
// 設計說明：
//   成就跨所有 chat 共用，chatId 欄位僅供顯示「來自哪段劇情」。
//   原因：外出 VN 劇情的 chatId 與大廳 chatId 不同，若以 chatId 過濾
//   則大廳永遠看不到 VN 裡解鎖的成就。
//
// 接口：
//   OS_ACHIEVEMENT.unlock(name, desc)      — 由 vn_core.js 呼叫
//   OS_ACHIEVEMENT.load()                  — 載入全部成就 (由大廳/VoidTerminal 呼叫)
//   OS_ACHIEVEMENT.loadForChat(chatId)     — 向下相容別名，等同 load()
//   OS_ACHIEVEMENT.markRedeemed(id, shards)— 由 404 商店呼叫
//   OS_ACHIEVEMENT.getAll()                — 返回全部成就快取
//   OS_ACHIEVEMENT.getPending()            — 返回未兌換成就列表
// ----------------------------------------------------------------
(function() {
    console.log('[OS_ACHIEVEMENT] 成就系統 V1.1 (全域) 載入中...');
    const win = window.parent || window;

    let _achievements = [];   // 全域成就快取 (所有 chatId 合併)
    let _currentChatId = null; // 當前活躍 chatId，僅供新成就標記來源用

    // ================================================================
    // 工具：取得當前 chatId（給新成就標記來源用）
    // ================================================================
    function getChatId() {
        const w = window.parent || window;
        if (w.SillyTavern && w.SillyTavern.getContext) {
            try {
                const c = w.SillyTavern.getContext();
                if (c && c.chatId) return c.chatId;
            } catch(e) {}
        }
        return 'lobby_default';
    }

    // ================================================================
    // 核心：從 IndexedDB 載入「全部」成就 (不過濾 chatId)
    // ================================================================
    async function load() {
        const db = win.OS_DB;
        if (!db || !db.getAchievements) {
            _achievements = [];
            return [];
        }
        try {
            // 傳 null → getAchievements 返回所有成就
            const list = await db.getAchievements(null);
            _achievements = list || [];
            console.log(`[OS_ACHIEVEMENT] 載入全域成就 → ${_achievements.length} 筆`);
            return _achievements;
        } catch(e) {
            console.error('[OS_ACHIEVEMENT] 載入失敗:', e);
            _achievements = [];
            return [];
        }
    }

    // 向下相容：loadForChat 等同 load()，chatId 參數保留但不用於過濾
    async function loadForChat(chatId) {
        if (chatId) _currentChatId = chatId;
        return load();
    }

    // ================================================================
    // 核心：解鎖成就 (由 vn_core.js [Achievement|名稱|描述] 呼叫)
    // ================================================================
    async function unlock(name, desc) {
        if (!name) return;

        // 確保快取已載入
        if (_achievements.length === 0) await load();

        const chatId = getChatId();
        if (!_currentChatId) _currentChatId = chatId;

        // 防重複：全域內，同名成就只記一次
        if (_achievements.some(a => a.name === name)) {
            console.log(`[OS_ACHIEVEMENT] 成就 "${name}" 已存在，略過重複解鎖`);
            return;
        }

        const entry = {
            id:        'ach_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            chatId:    chatId,      // 記錄來源劇情，僅供顯示
            name:      name,
            desc:      desc || '',
            timestamp: Date.now(),
            redeemed:  false,
            shards:    0,           // 兌換後由柴郡 API 填入
            exp:       0            // shards / 8，結算後供 child 面板讀取
        };

        _achievements.push(entry);

        // 寫入 IndexedDB
        const db = win.OS_DB;
        if (db && db.addAchievement) {
            try { await db.addAchievement(entry); }
            catch(e) { console.error('[OS_ACHIEVEMENT] DB 寫入失敗:', e); }
        }

        console.log(`[OS_ACHIEVEMENT] ✅ 解鎖: "${name}" (chatId: ${chatId})`);

        // 通知大廳面板刷新 (若當前已開啟)
        if (win.VoidTerminal && win.VoidTerminal.refreshAchievementPanel) {
            win.VoidTerminal.refreshAchievementPanel();
        }
    }

    // ================================================================
    // 擴充：標記成就已兌換 (供 404 商店呼叫)
    // ================================================================
    async function markRedeemed(id, shards) {
        const ach = _achievements.find(a => a.id === id);
        if (!ach) return;
        ach.redeemed = true;
        ach.shards   = shards || 0;
        ach.exp      = Math.round((shards || 0) / 8);  // EXP = shards / 8

        const db = win.OS_DB;
        if (db && db.updateAchievement) {
            try { await db.updateAchievement(ach); }
            catch(e) { console.error('[OS_ACHIEVEMENT] 更新 DB 失敗:', e); }
        }

        console.log(`[OS_ACHIEVEMENT] 💎 兌換: "${ach.name}" shards=${ach.shards} exp=${ach.exp}`);

        // 通知 child 面板加 EXP
        if (ach.exp > 0 && win.CHILD_CORE && typeof win.CHILD_CORE.addExpFromAchievement === 'function') {
            win.CHILD_CORE.addExpFromAchievement(ach.exp);
        }

        // 刷新成就面板
        if (win.VoidTerminal && win.VoidTerminal.refreshAchievementPanel) {
            win.VoidTerminal.refreshAchievementPanel();
        }
    }

    // ================================================================
    // 公開 API
    // ================================================================
    win.OS_ACHIEVEMENT = {
        unlock,
        load,
        loadForChat,          // 向下相容
        getAll:           () => [..._achievements],
        getPending:       () => _achievements.filter(a => !a.redeemed),
        getRedeemed:      () => _achievements.filter(a =>  a.redeemed),
        getCurrentChatId: () => _currentChatId,
        getChatId,
        markRedeemed
    };

    // 啟動時自動載入一次
    load().catch(() => {});

    console.log('[OS_ACHIEVEMENT] ✅ 就緒');
})();
