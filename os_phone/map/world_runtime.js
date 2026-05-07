// ----------------------------------------------------------------
// [檔案] world_runtime.js (V4.0 - Patch-based LiveStates 快照系統)
// 路徑：scripts/os_phone/map/world_runtime.js
// 職責：管理「當前世界」資料容器，供 map_core 讀取
//        - 預設世界：奧瑞亞 (Aurealis)，從 AUREALIS_DATA 包進來
//        - 動態世界：從 OS_DB 載入 / world_generator 灌入
//        - 角色排程：schedule_engine 寫入後存活在 currentWorld.schedules
//        - 即時狀態：vn_bridge 為每條訊息存 patch；liveStates 是計算結果
//                   reroll/swipe/delete 訊息會自動清掉對應 patch
//        - 動態地點：DYNAMIC: 前綴自動加成 Z_DYNAMIC 虛擬設施
//        - chatId 變動時自動切換，找不到就標記為「待初始化」
//        - 預覽模式：使用者可暫時觀察別的世界，互動全鎖
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入世界容器層 (V3.0)...');
    const win = window.parent || window;

    const AUREALIS_ID = '__AUREALIS_DEFAULT__';

    let currentWorldId = AUREALIS_ID;
    let currentWorld = null;
    let realChatId = AUREALIS_ID;   // 實際綁 chatId 的世界（預覽用來判斷對應）
    let isPreview = false;           // 是否處於預覽模式
    let onWorldChanged = null;       // 給 map_core 訂閱重新渲染

    function buildAurealisWorld() {
        if (!win.AUREALIS_DATA) {
            console.warn('[WorldRuntime] AUREALIS_DATA 尚未載入');
            return null;
        }
        return {
            id: AUREALIS_ID,
            name: 'AUREALIS',
            zones: win.AUREALIS_DATA.zones,
            isDefault: true
        };
    }

    function detectWorldId() {
        try {
            if (win.SillyTavern && win.SillyTavern.getContext) {
                const ctx = win.SillyTavern.getContext();
                if (ctx && ctx.chatId) return ctx.chatId;
            }
        } catch (e) {}
        return AUREALIS_ID;
    }

    // 切到指定 worldId
    async function switchTo(worldId) {
        if (!worldId || worldId === AUREALIS_ID) {
            currentWorldId = AUREALIS_ID;
            currentWorld = buildAurealisWorld();
            console.log('[WorldRuntime] 切換到預設世界（奧瑞亞）');
            if (onWorldChanged) onWorldChanged(currentWorld);
            return currentWorld;
        }

        currentWorldId = worldId;

        // 查 OS_DB
        if (win.OS_DB && typeof win.OS_DB.getWorldData === 'function') {
            try {
                const saved = await win.OS_DB.getWorldData(worldId);
                if (saved && saved.zones) {
                    currentWorld = {
                        id: worldId,
                        name: saved.name || 'Unknown World',
                        worldMap: saved.worldMap || null,
                        zones: saved.zones,
                        schedules: saved.schedules || null,
                        scheduleMeta: saved.scheduleMeta || null,
                        liveStates: saved.liveStates || {},
                        statePatches: saved.statePatches || {},
                        isDefault: false,
                        generatedAt: saved.timestamp
                    };
                    // 載入時重算一次 liveStates（保險：避免持久化的 cache 與 patches 不同步）
                    if (Object.keys(currentWorld.statePatches).length > 0) {
                        recomputeLiveStates();
                    }
                    console.log('[WorldRuntime] ✅ 從 OS_DB 載入世界:', saved.name,
                        saved.schedules ? `(含 ${Object.keys(saved.schedules).length} 個角色排程)` : '(無排程)');
                    if (onWorldChanged) onWorldChanged(currentWorld);
                    return currentWorld;
                }
            } catch (e) {
                console.error('[WorldRuntime] 讀 OS_DB 失敗:', e);
            }
        }

        // 沒資料 → 等使用者初始化
        currentWorld = null;
        console.log('[WorldRuntime] ⚠️ 此世界尚未生成，等待初始化:', worldId);
        if (onWorldChanged) onWorldChanged(null);
        return null;
    }

    // 把生成好的世界寫進 runtime + 存 OS_DB
    async function setWorld(worldId, worldData) {
        if (!worldId || !worldData || !worldData.zones) {
            console.error('[WorldRuntime] setWorld 參數不完整');
            return false;
        }
        currentWorldId = worldId;
        currentWorld = {
            id: worldId,
            name: worldData.name || 'Unknown',
            worldMap: worldData.worldMap || null,
            zones: worldData.zones,
            schedules: null,
            scheduleMeta: null,
            liveStates: {},
            statePatches: {},
            isDefault: false,
            generatedAt: Date.now()
        };
        if (win.OS_DB && typeof win.OS_DB.saveWorldData === 'function') {
            try {
                await win.OS_DB.saveWorldData(worldId, {
                    name: currentWorld.name,
                    worldMap: currentWorld.worldMap,
                    zones: currentWorld.zones,
                    schedules: null,
                    scheduleMeta: null,
                    liveStates: {},
                    statePatches: {}
                });
                console.log('[WorldRuntime] 💾 已存進 OS_DB:', currentWorld.name);
            } catch (e) {
                console.error('[WorldRuntime] 存 OS_DB 失敗:', e);
            }
        }
        if (onWorldChanged) onWorldChanged(currentWorld);
        return true;
    }

    // 即時狀態（vn_bridge 抽取的 liveStates）─────────────────
    // 結構: liveStates[charName] = {
    //   location_id, action, dialogue,
    //   until_period: '晚上',     // 過了該時段就過期
    //   until_ts: 1714857600000,  // 或時間戳
    //   source: 'vn',
    //   msgId: 12,                 // 來源訊息 id（5-C 快照系統會用）
    //   updatedAt: ...
    // }

    function _isExpired(state, now) {
        if (!state) return true;
        const t = now || new Date();
        if (state.until_ts && t.getTime() >= state.until_ts) return true;
        if (state.until_period && win.SCHEDULE_ENGINE) {
            const cur = win.SCHEDULE_ENGINE.getTimePeriod(t);
            // 過了原本標記的時段就視為過期
            if (cur !== state.until_period) {
                // 為避免「同個時段內 cur 還沒到 until 也判過期」這個情況，
                // 採保守規則：only 過期當 cur ≠ until 且 updatedAt 不是當前時段
                const updatedPeriod = state.updatedAtPeriod || null;
                if (updatedPeriod && cur !== updatedPeriod) return true;
            }
        }
        return false;
    }

    // 角色名 normalize：trim + Unicode NFC 規範化
    // 解決相同字看起來一樣但底層不同的問題（組合字符、簡繁混用尾隨空格等）
    function _normName(s) {
        if (!s) return '';
        try { return String(s).trim().normalize('NFC'); }
        catch (e) { return String(s).trim(); }
    }

    // === Patch 系統：每條訊息一個 patch，liveStates = patches apply 結果 ===

    const MAX_PATCHES = 50;

    // 給定 msgId + moves 寫入快照
    // moves = [{ character, location_id, action, dialogue, until_period, category }, ...]
    async function setPatch(msgId, moves, mcName) {
        if (!currentWorld) return false;
        if (!currentWorld.statePatches) currentWorld.statePatches = {};
        const id = String(msgId);
        const now = new Date();
        currentWorld.statePatches[id] = {
            msgId: id,
            moves: Array.isArray(moves) ? moves : [],
            mcName: mcName || '',
            timestamp: now.getTime(),
            updatedAtPeriod: win.SCHEDULE_ENGINE ? win.SCHEDULE_ENGINE.getTimePeriod(now) : null
        };
        compactPatches();
        recomputeLiveStates();
        try { await cleanOrphanDynamics(); } catch (e) {}
        await persistFullWorld();
        if (onWorldChanged) onWorldChanged(currentWorld);
        return true;
    }

    async function removePatch(msgId) {
        if (!currentWorld || !currentWorld.statePatches) return false;
        const id = String(msgId);
        if (!(id in currentWorld.statePatches)) return false;
        delete currentWorld.statePatches[id];
        recomputeLiveStates();
        try { await cleanOrphanDynamics(); } catch (e) {}
        await persistFullWorld();
        if (onWorldChanged) onWorldChanged(currentWorld);
        console.log('[WorldRuntime] 🗑️ patch 移除 (msgId:', id, ')');
        return true;
    }

    function compactPatches() {
        if (!currentWorld || !currentWorld.statePatches) return;
        const ids = Object.keys(currentWorld.statePatches);
        if (ids.length <= MAX_PATCHES) return;
        // 按 msgId 數值排序（manual_xxx 字串會排到後面，自然保留新的）
        const sorted = ids.slice().sort((a, b) => {
            const na = Number(a), nb = Number(b);
            if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
            if (Number.isFinite(na)) return -1;
            if (Number.isFinite(nb)) return 1;
            return String(a).localeCompare(String(b));
        });
        const toRemove = sorted.slice(0, ids.length - MAX_PATCHES);
        toRemove.forEach(id => delete currentWorld.statePatches[id]);
        console.log('[WorldRuntime] 🗜️ 容量壓縮，刪除最舊 patch:', toRemove.length, '筆');
    }

    function recomputeLiveStates() {
        if (!currentWorld) return;
        const patches = currentWorld.statePatches || {};
        const ids = Object.keys(patches).sort((a, b) => {
            const na = Number(a), nb = Number(b);
            if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
            if (Number.isFinite(na)) return -1;
            if (Number.isFinite(nb)) return 1;
            return String(a).localeCompare(String(b));
        });
        const result = {};
        ids.forEach(id => {
            const p = patches[id];
            if (!p || !Array.isArray(p.moves)) return;
            const mcNorm = _normName(p.mcName || '');
            p.moves.forEach(m => {
                if (!m || !m.character || !m.location_id) return;
                const name = _normName(m.character);
                if (!name) return;
                if (mcNorm && (name === mcNorm || name.includes(mcNorm) || mcNorm.includes(name))) return;
                // 後寫的覆蓋先寫的
                result[name] = {
                    location_id: m.location_id,
                    action: m.action || '',
                    dialogue: m.dialogue || '',
                    until_period: m.until_period || null,
                    until_ts: m.until_ts || null,
                    category: m.category || 'Outing',
                    source: 'vn',
                    msgId: id,
                    updatedAt: p.timestamp,
                    updatedAtPeriod: p.updatedAtPeriod
                };
            });
        });
        currentWorld.liveStates = result;
    }

    // 向下相容介面：把舊的 setLiveState/Batch 接到 patch 系統
    // 沒給 msgId 就用 manual_<時間戳>
    async function setLiveState(charName, state) {
        const name = _normName(charName);
        if (!name || !state) return false;
        const moves = [{
            character: name,
            location_id: state.location_id,
            action: state.action,
            dialogue: state.dialogue,
            until_period: state.until_period,
            category: state.category
        }];
        return await setPatch(`manual_${Date.now()}`, moves, '');
    }

    async function setLiveStatesBatch(stateMap, msgId, mcName) {
        if (!stateMap || typeof stateMap !== 'object') return false;
        const moves = Object.keys(stateMap).map(name => ({
            character: name,
            ...stateMap[name]
        }));
        const id = msgId !== undefined && msgId !== null ? msgId : `manual_${Date.now()}`;
        return await setPatch(id, moves, mcName || '');
    }

    function getLiveState(charName, time) {
        if (!currentWorld || !currentWorld.liveStates) return null;
        const name = _normName(charName);
        const s = currentWorld.liveStates[name] || currentWorld.liveStates[charName];
        if (!s) return null;
        if (_isExpired(s, time)) {
            delete currentWorld.liveStates[name];
            delete currentWorld.liveStates[charName];
            persistLiveStates();
            return null;
        }
        return s;
    }

    async function clearLiveState(charName) {
        if (!currentWorld || !currentWorld.liveStates) return;
        const name = _normName(charName);
        delete currentWorld.liveStates[name];
        delete currentWorld.liveStates[charName]; // 雙保險：未 normalize 的 key 也清
        await persistLiveStates();
        if (onWorldChanged) onWorldChanged(currentWorld);
    }

    async function clearAllLiveStates() {
        if (!currentWorld) return;
        currentWorld.liveStates = {};
        currentWorld.statePatches = {}; // 同步清空快照，否則重算會還原
        try { await cleanOrphanDynamics(); } catch (e) {}
        await persistFullWorld();
        if (onWorldChanged) onWorldChanged(currentWorld);
    }

    async function cleanExpiredLiveStates() {
        if (!currentWorld || !currentWorld.liveStates) return 0;
        const now = new Date();
        let cleaned = 0;
        Object.keys(currentWorld.liveStates).forEach(name => {
            if (_isExpired(currentWorld.liveStates[name], now)) {
                delete currentWorld.liveStates[name];
                cleaned++;
            }
        });
        if (cleaned > 0) {
            await persistLiveStates();
            if (onWorldChanged) onWorldChanged(currentWorld);
            // 順便清掉沒人用的動態地點
            try { await cleanOrphanDynamics(); } catch (e) {}
        }
        return cleaned;
    }

    // === 動態地點 (Z_DYNAMIC) ──────────────────────────────────
    // VN 劇情提到地圖外的地點時，自動加成虛擬設施，跟著當前世界一起存

    const DYNAMIC_ZONE_ID = 'Z_DYNAMIC';

    function ensureDynamicZone() {
        if (!currentWorld) return null;
        if (!currentWorld.zones) currentWorld.zones = {};
        if (!currentWorld.zones[DYNAMIC_ZONE_ID]) {
            currentWorld.zones[DYNAMIC_ZONE_ID] = {
                name: '🌀 DRIFT',
                background: '',
                bgPrompt: '',
                isDynamic: true,
                facilities: {}
            };
        }
        return currentWorld.zones[DYNAMIC_ZONE_ID];
    }

    function _hashName(name) {
        let h = 0;
        for (let i = 0; i < name.length; i++) {
            h = ((h << 5) - h) + name.charCodeAt(i);
            h |= 0;
        }
        return Math.abs(h).toString(36).substring(0, 6);
    }

    function _loremFlickrUrl(displayName) {
        const tags = (displayName || 'place')
            .replace(/[^a-zA-Z0-9, ]/g, '')
            .replace(/\s+/g, ',') || 'place';
        return `https://loremflickr.com/1280/720/${encodeURIComponent(tags)}`;
    }

    // 加一個動態 facility，回傳 sceneId
    // 同 displayName 已存在 → 重用，不重複建
    async function addDynamicFacility(displayName) {
        if (!currentWorld) return null;
        const name = _normName(displayName);
        if (!name) return null;
        const zone = ensureDynamicZone();

        // 同 displayName 已存在的話重用
        const existing = Object.keys(zone.facilities).find(
            k => zone.facilities[k] && _normName(zone.facilities[k].name) === name
        );
        if (existing) return zone.facilities[existing].sceneId || `${DYNAMIC_ZONE_ID}_${existing}`;

        const facKey = `dyn_${Date.now().toString(36).substring(-4)}_${_hashName(name)}`;
        const sceneId = `${DYNAMIC_ZONE_ID}_${facKey}`;
        zone.facilities[facKey] = {
            sceneId,
            name,
            shortName: name.length > 6 ? name.substring(0, 5) + '…' : name,
            icon: '🌀',
            className: 'facility-dynamic',
            characters: [],
            imageUrl: _loremFlickrUrl(name),
            fallbackUrl: _loremFlickrUrl(name),
            isDynamic: true,
            createdAt: Date.now()
        };

        // 持久化
        await persistFullWorld();
        if (onWorldChanged) onWorldChanged(currentWorld);
        console.log('[WorldRuntime] 🌀 新增動態地點:', name, '→', sceneId);
        return sceneId;
    }

    // 清掉沒被任何 liveStates 引用的動態 facility（過期清理用）
    async function cleanOrphanDynamics() {
        if (!currentWorld || !currentWorld.zones || !currentWorld.zones[DYNAMIC_ZONE_ID]) return 0;
        const zone = currentWorld.zones[DYNAMIC_ZONE_ID];
        const live = currentWorld.liveStates || {};
        const usedSceneIds = new Set(
            Object.values(live).map(s => s && s.location_id).filter(Boolean)
        );
        let cleaned = 0;
        Object.keys(zone.facilities).forEach(facKey => {
            const f = zone.facilities[facKey];
            if (!f.isDynamic) return; // 防呆
            if (!usedSceneIds.has(f.sceneId)) {
                delete zone.facilities[facKey];
                cleaned++;
            }
        });
        if (cleaned > 0) {
            // 整個區都空了就連區也刪掉
            if (Object.keys(zone.facilities).length === 0) {
                delete currentWorld.zones[DYNAMIC_ZONE_ID];
            }
            await persistFullWorld();
            if (onWorldChanged) onWorldChanged(currentWorld);
            console.log('[WorldRuntime] 🧹 清理動態地點:', cleaned, '筆');
        }
        return cleaned;
    }

    async function persistFullWorld() {
        if (!currentWorld) return;
        if (currentWorld.isDefault) return;
        if (!win.OS_DB || typeof win.OS_DB.saveWorldData !== 'function') return;
        try {
            await win.OS_DB.saveWorldData(currentWorldId, {
                name: currentWorld.name,
                worldMap: currentWorld.worldMap || null,
                zones: currentWorld.zones,
                schedules: currentWorld.schedules,
                scheduleMeta: currentWorld.scheduleMeta,
                liveStates: currentWorld.liveStates,
                statePatches: currentWorld.statePatches || {}
            });
        } catch (e) {
            console.error('[WorldRuntime] persistFullWorld 失敗:', e);
        }
    }

    async function persistLiveStates() {
        // 與 persistFullWorld 同（保留別名給舊呼叫處）
        await persistFullWorld();
    }

    // 把生成好的角色排程寫進當前世界 + 存 OS_DB
    async function setSchedules(schedules, meta) {
        if (!currentWorld || !currentWorld.zones) {
            console.error('[WorldRuntime] setSchedules: 當前無世界資料');
            return false;
        }
        // 排程換新 → 清掉時段內快取，避免角色卡在舊分支
        try {
            if (win.SCHEDULE_ENGINE && typeof win.SCHEDULE_ENGINE.clearActivityCache === 'function') {
                win.SCHEDULE_ENGINE.clearActivityCache();
            }
        } catch (e) {}
        if (currentWorld.isDefault) {
            // 奧瑞亞不存 DB（它是固定世界），但 schedules 可活在記憶體
            currentWorld.schedules = schedules;
            currentWorld.scheduleMeta = meta || null;
            console.log('[WorldRuntime] 📋 奧瑞亞排程已存記憶體（不持久化）');
            if (onWorldChanged) onWorldChanged(currentWorld);
            return true;
        }
        currentWorld.schedules = schedules;
        currentWorld.scheduleMeta = meta || null;
        if (win.OS_DB && typeof win.OS_DB.saveWorldData === 'function') {
            try {
                await win.OS_DB.saveWorldData(currentWorldId, {
                    name: currentWorld.name,
                    worldMap: currentWorld.worldMap || null,
                    zones: currentWorld.zones,
                    schedules: currentWorld.schedules,
                    scheduleMeta: currentWorld.scheduleMeta,
                    liveStates: currentWorld.liveStates || {}
                });
                console.log('[WorldRuntime] 📋 排程已存進 OS_DB');
            } catch (e) {
                console.error('[WorldRuntime] 存排程失敗:', e);
                return false;
            }
        }
        if (onWorldChanged) onWorldChanged(currentWorld);
        return true;
    }

    // 為某個 facility 設定 sceneMap（場景地標資料）並持久化
    async function saveFacilitySceneMap(zoneId, facKey, sceneMap) {
        if (!currentWorld || !currentWorld.zones) {
            console.error('[WorldRuntime] saveFacilitySceneMap: 當前無世界資料');
            return false;
        }
        const zone = currentWorld.zones[zoneId];
        if (!zone || !zone.facilities || !zone.facilities[facKey]) {
            console.error('[WorldRuntime] saveFacilitySceneMap: 找不到 facility', zoneId, facKey);
            return false;
        }
        zone.facilities[facKey].sceneMap = sceneMap;

        if (currentWorld.isDefault) {
            // 奧瑞亞純記憶體
            console.log('[WorldRuntime] 🗺️ 奧瑞亞 sceneMap 已存記憶體（不持久化）');
            if (onWorldChanged) onWorldChanged(currentWorld);
            return true;
        }
        if (win.OS_DB && typeof win.OS_DB.saveWorldData === 'function') {
            try {
                await win.OS_DB.saveWorldData(currentWorldId, {
                    name: currentWorld.name,
                    worldMap: currentWorld.worldMap || null,
                    zones: currentWorld.zones,
                    schedules: currentWorld.schedules,
                    scheduleMeta: currentWorld.scheduleMeta,
                    liveStates: currentWorld.liveStates || {}
                });
                console.log(`[WorldRuntime] 🗺️ sceneMap 已存（${zoneId}/${facKey}）`);
            } catch (e) {
                console.error('[WorldRuntime] 存 sceneMap 失敗:', e);
                return false;
            }
        }
        if (onWorldChanged) onWorldChanged(currentWorld);
        return true;
    }

    // 用奧瑞亞當這個 chatId 的世界（不存 DB，純記憶體 fallback）
    function useAurealisAsFallback() {
        currentWorld = buildAurealisWorld();
        console.log('[WorldRuntime] 🏛️ 此聊天使用奧瑞亞當作預設世界');
        if (onWorldChanged) onWorldChanged(currentWorld);
        return currentWorld;
    }

    // 預覽某個 worldId（不影響 realChatId / chatId 對應）
    async function previewWorld(worldId) {
        if (!worldId) return false;
        // 進入預覽前先記住「真實對應」的 chatId 世界
        // 若已在預覽中，realChatId 已經是真實的，不要覆蓋
        isPreview = (worldId !== realChatId);
        await switchTo(worldId);
        return true;
    }

    // 退出預覽，切回 realChatId 對應的世界
    async function exitPreview() {
        if (!isPreview) return;
        isPreview = false;
        await switchTo(realChatId);
    }

    win.WORLD_RUNTIME = {
        AUREALIS_ID,
        getCurrentWorldId: () => currentWorldId,
        getCurrentWorld: () => currentWorld,
        getRealChatId: () => realChatId,
        getZoneIds: () => currentWorld && currentWorld.zones ? Object.keys(currentWorld.zones) : [],
        getZone: (id) => currentWorld && currentWorld.zones ? currentWorld.zones[id] : null,
        switchTo,
        setWorld,
        setSchedules,
        saveFacilitySceneMap,
        getSchedules: () => currentWorld ? currentWorld.schedules : null,
        hasSchedules: () => !!(currentWorld && currentWorld.schedules && Object.keys(currentWorld.schedules).length > 0),
        // 即時狀態 API
        setLiveState,
        setLiveStatesBatch,
        getLiveState,
        getAllLiveStates: () => (currentWorld && currentWorld.liveStates) ? { ...currentWorld.liveStates } : {},
        clearLiveState,
        clearAllLiveStates,
        cleanExpiredLiveStates,
        // Patch 快照 API
        setPatch,
        removePatch,
        recomputeLiveStates,
        getAllPatches: () => (currentWorld && currentWorld.statePatches) ? { ...currentWorld.statePatches } : {},
        // 動態地點 API
        DYNAMIC_ZONE_ID,
        addDynamicFacility,
        cleanOrphanDynamics,
        useAurealisAsFallback,
        detectWorldId,
        previewWorld,
        exitPreview,
        isPreview: () => isPreview,
        isDefault: () => currentWorldId === AUREALIS_ID,
        needsInit: () => currentWorldId !== AUREALIS_ID && !currentWorld,
        onChange: (cb) => { onWorldChanged = cb; }
    };

    // 啟動：載入奧瑞亞當預設
    currentWorld = buildAurealisWorld();
    console.log('[WorldRuntime] ✅ 預設世界已載入:', currentWorldId);

    function attachChatListener() {
        if (!win.eventOn) {
            setTimeout(attachChatListener, 500);
            return;
        }
        const onChatChange = async () => {
            const newChatId = detectWorldId();
            if (newChatId !== realChatId) {
                console.log('[WorldRuntime] 🔄 chatId 變動:', realChatId, '→', newChatId);
                realChatId = newChatId;
                isPreview = false; // 切聊天 = 強制退出預覽
                await switchTo(newChatId);
            }
        };
        win.eventOn('chat_id_changed', onChatChange);
        setTimeout(async () => {
            // 啟動時強制切到當前 chatId 對應的世界（不依賴 onChatChange 的 != 比對，
            // 否則初始化階段會被「早就相等」騙過 → 永遠停在啟動預設的奧瑞亞）
            const initialChatId = detectWorldId();
            realChatId = initialChatId;
            isPreview = false;
            await switchTo(initialChatId);
        }, 1500);
    }
    setTimeout(attachChatListener, 1000);
})();
