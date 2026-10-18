// ----------------------------------------------------------------
// [檔案] world_runtime.js (V4.0 - Patch-based LiveStates 快照系統)
// 路徑：scripts/os_phone/map/world_runtime.js
// 職責：管理「當前世界」資料容器，供 map_core 讀取
//        - 預設世界：奧瑞亞 (Aurealis)，從 AUREALIS_DATA 包進來
//        - 動態世界：從 OS_DB 載入 / world_generator 灌入
//        - 角色排程：schedule_engine 寫入後存活在 currentWorld.schedules
//        - 即時狀態：liveStates / patches 機制（VN→Map 連動已移除，目前永遠空跑）
//        - 動態地點：DYNAMIC: 前綴自動加成 Z_DYNAMIC 虛擬設施
//        - chatId 變動時自動切換：奧瑞亞卡人在奧瑞亞→奧瑞亞；這段聊天存過地圖→那張；
//          按過「使用奧瑞亞預設城市」→奧瑞亞；都沒有才標記為「待初始化」（10-16）
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

    // 通知地圖重畫。重畫出錯只記下來、不往外丟：
    //   以前 switchTo 是在「讀 DB」的 try 裡面叫重畫，地圖畫面已被別的 app 清掉時重畫丟錯，
    //   被當成讀 DB 失敗 → currentWorld 清成 null，已經生成的世界顯示「尚未生成」，再按一次就把原本的蓋掉
    function _notify() {
        if (!onWorldChanged) return;
        try { onWorldChanged(currentWorld); }
        catch (e) { console.error('[WorldRuntime] 地圖重畫失敗（世界資料沒動）:', e); }
    }

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

    // 這段聊天現在在奧瑞亞嗎（10-16 她：「奧瑞亞的卡片總是不會自動套用預設地圖」）：
    //   卡歸奧瑞亞管＝綁了奧瑞亞那幾本書（跟「關於我→世界書」那格、切書機制同一個判斷，AURELIA_WORLDGATE.status），
    //   而且這段聊天沒有從世界門進異世界（OS_WORLDGATE.getCurrentWorld 是空的、視差書沒掛）。
    //   回 true／false；酒館助手還沒好、問不到就回 null（不判定，等一下再問）。
    async function _aureliaHere() {
        const G = win.AURELIA_WORLDGATE || window.AURELIA_WORLDGATE;
        let st = null;
        try { st = G && typeof G.status === 'function' ? G.status() : null; } catch (e) {}
        if (!st) return null;
        if (!st.ours) return false;
        if (st.inParallax) return false;
        const WG = win.OS_WORLDGATE || window.OS_WORLDGATE;
        try { if (WG && typeof WG.getCurrentWorld === 'function' && await WG.getCurrentWorld()) return false; } catch (e) {}
        return true;
    }

    // 這段聊天按過「使用奧瑞亞預設城市」（記在 app_data，一段聊天一筆）
    const _USE_AUREALIS = ['map', 'use_aurealis'];
    async function _usesAurealis(chatId) {
        if (!chatId || !win.OS_DB || typeof win.OS_DB.getAppData !== 'function') return false;
        try { return !!(await win.OS_DB.getAppData(_USE_AUREALIS[0], _USE_AUREALIS[1], chatId)); } catch (e) { return false; }
    }

    function _useAurealisFor(worldId, why) {
        currentWorld = buildAurealisWorld();
        console.log('[WorldRuntime] 🏛️ 這段聊天用奧瑞亞地圖（' + why + '）');
        _notify();
        return currentWorld;
    }

    // 開機時酒館助手可能還沒好、問不到這張卡歸誰：停在「待初始化」的話過一下再問（最多幾次）
    let _recheckLeft = 0;
    function _recheckLater(worldId) {
        if (_recheckLeft <= 0) return;
        _recheckLeft--;
        setTimeout(() => {
            if (worldId === realChatId && worldId === currentWorldId && !isPreview && !currentWorld) switchTo(worldId);
        }, 3000);
    }

    // 切到指定 worldId
    async function switchTo(worldId) {
        if (!worldId || worldId === AUREALIS_ID) {
            currentWorldId = AUREALIS_ID;
            currentWorld = buildAurealisWorld();
            console.log('[WorldRuntime] 切換到預設世界（奧瑞亞）');
            _notify();
            return currentWorld;
        }

        currentWorldId = worldId;

        // 奧瑞亞卡、人在奧瑞亞 → 直接用預設地圖，不看這段聊天存過的（那多半是進異世界時生的，回到奧瑞亞就該換回來）。
        // 只管「這段聊天自己的世界」：在世界管理裡預覽別段聊天的世界不套。
        let here = null;
        if (!isPreview && worldId === realChatId) {
            here = await _aureliaHere();
            if (worldId !== currentWorldId) return currentWorld;   // 等的時候又換了聊天
            if (here) return _useAurealisFor(worldId, '奧瑞亞卡、在奧瑞亞');
        }

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
                    _notify();
                    return currentWorld;
                }
            } catch (e) {
                console.error('[WorldRuntime] 讀 OS_DB 失敗:', e);
            }
        }

        if (worldId !== currentWorldId) return currentWorld;
        // 沒存過地圖、但這段聊天按過「使用奧瑞亞預設城市」→ 照用
        if (await _usesAurealis(worldId)) {
            if (worldId !== currentWorldId) return currentWorld;
            return _useAurealisFor(worldId, '這段聊天選過');
        }
        if (worldId !== currentWorldId) return currentWorld;

        // 沒資料 → 等使用者初始化
        currentWorld = null;
        console.log('[WorldRuntime] ⚠️ 此世界尚未生成，等待初始化:', worldId);
        _notify();
        if (here === null && !isPreview && worldId === realChatId) _recheckLater(worldId);
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
        _notify();
        return true;
    }

    // 即時狀態（liveStates，VN→Map 連動移除後永遠空跑）─────────────────
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
        _notify();
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
        _notify();
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
        _notify();
    }

    async function clearAllLiveStates() {
        if (!currentWorld) return;
        currentWorld.liveStates = {};
        currentWorld.statePatches = {}; // 同步清空快照，否則重算會還原
        try { await cleanOrphanDynamics(); } catch (e) {}
        await persistFullWorld();
        _notify();
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
            _notify();
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
                name: 'DRIFT',
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
    //   opts.keep：劇情去過的地方（vn_map_link），沒人站著也不清掉
    async function addDynamicFacility(displayName, opts) {
        if (!currentWorld) return null;
        const name = _normName(displayName);
        if (!name) return null;
        const zone = ensureDynamicZone();
        const keep = !!(opts && opts.keep);
        const painted = !!(currentWorld.worldMap && currentWorld.worldMap.painted);   // 直接畫的世界：不放隨機網路照片

        // 同 displayName 已存在的話重用
        const existing = Object.keys(zone.facilities).find(
            k => zone.facilities[k] && _normName(zone.facilities[k].name) === name
        );
        if (existing) {
            if (keep && !zone.facilities[existing].keep) { zone.facilities[existing].keep = true; await persistFullWorld(); }
            return zone.facilities[existing].sceneId || `${DYNAMIC_ZONE_ID}_${existing}`;
        }

        const facKey = `dyn_${Date.now().toString(36).substring(-4)}_${_hashName(name)}`;
        const sceneId = `${DYNAMIC_ZONE_ID}_${facKey}`;
        zone.facilities[facKey] = {
            sceneId,
            name,
            shortName: name.length > 6 ? name.substring(0, 5) + '…' : name,
            icon: 'hurricane',
            className: 'facility-dynamic',
            characters: [],
            imageUrl: painted ? '' : _loremFlickrUrl(name),
            fallbackUrl: painted ? '' : _loremFlickrUrl(name),
            isDynamic: true,
            keep: keep,
            createdAt: Date.now()
        };

        // 持久化
        await persistFullWorld();
        _notify();
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
            if (!f.isDynamic || f.keep) return; // 防呆；劇情去過的地方（keep）不清
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
            _notify();
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
            _notify();
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
                    liveStates: currentWorld.liveStates || {},
                    statePatches: currentWorld.statePatches || {}   // 整筆 put：漏了這欄存一次就把快照清掉（跟 persistFullWorld 同一份欄位）
                });
                console.log('[WorldRuntime] 📋 排程已存進 OS_DB');
            } catch (e) {
                console.error('[WorldRuntime] 存排程失敗:', e);
                return false;
            }
        }
        _notify();
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
            _notify();
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
                    liveStates: currentWorld.liveStates || {},
                    statePatches: currentWorld.statePatches || {}   // 整筆 put：漏了這欄存一次就把快照清掉（跟 persistFullWorld 同一份欄位）
                });
                console.log(`[WorldRuntime] 🗺️ sceneMap 已存（${zoneId}/${facKey}）`);
            } catch (e) {
                console.error('[WorldRuntime] 存 sceneMap 失敗:', e);
                return false;
            }
        }
        _notify();
        return true;
    }

    // 「使用奧瑞亞預設城市」那顆：這段聊天用奧瑞亞，而且記住（她 10-16：「按了「使用奧瑞亞預設城市」也記住」；以前只用這一次，換聊天、重整就又要按）。
    // 奧瑞亞本身還是不存 DB（它是固定世界），記的只是「這段聊天選了它」；之後替這段聊天生了別的地圖，生的那張優先。
    function useAurealisAsFallback() {
        const id = currentWorldId;
        _useAurealisFor(id, '按了使用奧瑞亞預設城市');
        if (id && id !== AUREALIS_ID && win.OS_DB && typeof win.OS_DB.saveAppData === 'function') {
            win.OS_DB.saveAppData(_USE_AUREALIS[0], _USE_AUREALIS[1], true, id).catch(e => console.warn('[WorldRuntime] 記不住這段聊天要用奧瑞亞:', e));
        }
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
                _recheckLeft = 3;
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
            _recheckLeft = 3;
            await switchTo(initialChatId);
        }, 1500);
    }
    setTimeout(attachChatListener, 1000);
})();
