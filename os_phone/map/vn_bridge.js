// ----------------------------------------------------------------
// [檔案] vn_bridge.js (V1.1 - 接 patch 快照系統)
// 路徑：scripts/os_phone/map/vn_bridge.js
// 職責：
//   1. 監聽酒館 GENERATION_ENDED 事件（AI 寫完正文）→ 抽取 → 寫 patch
//   2. 監聽 MESSAGE_DELETED / SWIPED / EDITED / UPDATED → 移除對應 patch
//   3. 預設關閉，需透過 console / 第 5-B 階段設置面板開啟
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入 VN ↔ Map 對接模組 (V1.0)...');
    const win = window.parent || window;

    // === 預設配置 ===
    const STORAGE_KEY = 'aurelia_map_vn_bridge';
    const DEFAULT_CONFIG = {
        enabled: false,           // 預設關
        debounceMs: 1000,         // 防抖延遲
        historyCount: 4,          // 餵給 flash 的最近訊息數
        retryCount: 3,            // 失敗重試次數
        retryDelayMs: 1000,       // 重試間隔
        timeoutMs: 30000,         // 副模型超時
        silentFallback: true      // 失敗時靜默 fallback（false = toast 警告）
    };
    const CONFIG = { ...DEFAULT_CONFIG };

    // 從 localStorage 載入配置（啟動時跑）
    function loadConfigFromStorage() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const saved = JSON.parse(raw);
            Object.keys(DEFAULT_CONFIG).forEach(k => {
                if (saved[k] !== undefined) CONFIG[k] = saved[k];
            });
            console.log('[VN_Bridge] 已載入儲存配置:', CONFIG);
        } catch (e) {
            console.warn('[VN_Bridge] 載入配置失敗，用預設值:', e);
        }
    }

    function saveConfigToStorage() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(CONFIG));
        } catch (e) {
            console.warn('[VN_Bridge] 寫入配置失敗:', e);
        }
    }

    loadConfigFromStorage();

    let _debounceTimer = null;
    let _running = false; // 防止重複觸發

    // === Prompt 構建 ===
    function buildExtractPrompt(historyText, world, charNames, mcName) {
        // 設施清單
        const facLines = [];
        Object.keys(world.zones || {}).forEach(zKey => {
            const z = world.zones[zKey];
            Object.keys(z.facilities || {}).forEach(fKey => {
                const f = z.facilities[fKey];
                const sid = f.sceneId || `${zKey}_${fKey}`;
                facLines.push(`- ${sid} (${z.name} / ${f.shortName || f.name})`);
            });
        });

        // 時段定義（給 until_period 用）
        const periods = '黎明 / 上午 / 下午 / 黃昏 / 晚上 / 午夜 / 凌晨';

        const mcNote = mcName
            ? `【主角名稱（玩家本人，禁止抽取）】\n${mcName}\n→ 主角是玩家在扮演的角色，不需要寫進 moves。即使劇情描述「${mcName}」去了某地，也不要抽他。\n\n`
            : '';

        return `[State Extraction Task]
You are a passive narrative state extractor for a visual novel map system.
Read the latest narrative below and extract ONLY EXPLICIT character location/state changes for NPCs (non-player characters).

${mcNote}【可用設施 sceneId 清單】
${facLines.join('\n') || '(無)'}

【已知活躍 NPC】
${charNames.length ? charNames.join(', ') : '(未知)'}

【規則】
1. 只抽取「明確」的位置/狀態變化，沒寫的不要編
2. **絕對不要抽取主角**（${mcName || '玩家本人'}）的狀態
3. location_id 必須從上面 sceneId 清單模糊比對選一個。如果劇情提到的地點地圖上完全沒有，輸出 "DYNAMIC:<地點名稱>"
4. action / dialogue 從原文摘要，不要超過 40 字
5. until_period 從這 7 個選一個或留空：${periods}
6. 如果這段劇情沒有任何 NPC 位置變化，回傳 {"moves": []}

【輸出格式：嚴格 JSON，禁止 markdown 包裹、禁止任何說明文字】
{
  "moves": [
    {
      "character": "沈砚",
      "location_id": "Z3_F1",
      "action": "與萧離對峙",
      "dialogue": "...",
      "until_period": "晚上"
    }
  ]
}

【最新劇情】
${historyText}

只輸出 JSON。`;
    }

    // 從劇情文本抽 [Protagonist|名字] 標籤（VN 系統標準格式，最權威）
    function extractMcFromHistory(historyText) {
        if (!historyText) return null;
        const m = historyText.match(/\[Protagonist\|([^\]|]+)\]/);
        return m ? m[1].trim() : null;
    }

    // 取主角名（優先順序：[Protagonist|X] 標籤 > schedule_engine.getMainUserName）
    function resolveMcName(historyText) {
        const fromTag = extractMcFromHistory(historyText);
        if (fromTag) {
            console.log('[VN_Bridge] 從 [Protagonist] 標籤抽到 MC:', fromTag);
            return fromTag;
        }
        if (win.SCHEDULE_ENGINE && typeof win.SCHEDULE_ENGINE.getMainUserName === 'function') {
            return win.SCHEDULE_ENGINE.getMainUserName();
        }
        return '';
    }

    function extractJSON(text) {
        if (!text) return null;
        let s = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
        try { return JSON.parse(s); } catch (e) {}
        const a = s.indexOf('{');
        const b = s.lastIndexOf('}');
        if (a >= 0 && b > a) {
            try { return JSON.parse(s.substring(a, b + 1)); } catch (e) {}
        }
        return null;
    }

    // 抓最近 N 條訊息合成文字
    async function fetchRecentMessages(count) {
        if (!win.TavernHelper || typeof win.TavernHelper.getChatMessages !== 'function') {
            return '';
        }
        try {
            // 先嘗試合法 range：'0-{{lastMessageId}}' 是 @types 文件指定格式
            let all = null;
            try {
                all = await win.TavernHelper.getChatMessages('0-{{lastMessageId}}');
            } catch (e1) {
                // fallback：先拿最新一條取 id，再組 range
                const last = await win.TavernHelper.getChatMessages(-1);
                const maxId = (Array.isArray(last) && last[0]) ? last[0].message_id : null;
                if (maxId !== null && maxId !== undefined) {
                    all = await win.TavernHelper.getChatMessages(`0-${maxId}`);
                }
            }
            if (!Array.isArray(all) || all.length === 0) {
                console.warn('[VN_Bridge] getChatMessages 回傳空');
                return '';
            }
            const tail = all.slice(-count);
            return tail.map(m => {
                const who = m.name || (m.role === 'user' ? 'User' : 'AI');
                const txt = (m.message || m.mes || '').toString().substring(0, 1500);
                return `[${who}]\n${txt}`;
            }).join('\n\n---\n\n');
        } catch (e) {
            console.warn('[VN_Bridge] 撈訊息失敗:', e);
            return '';
        }
    }

    // 跑副模型抽取（含重試）
    async function runExtractionOnce(prompt) {
        if (!win.OS_API || typeof win.OS_API.chatSecondary !== 'function') {
            throw new Error('OS_API.chatSecondary 不可用');
        }
        const messages = [
            { role: 'system', content: 'You are a state extraction tool. Output only strict JSON.' },
            { role: 'user', content: prompt }
        ];

        return new Promise((resolve, reject) => {
            let resolved = false;
            const timer = setTimeout(() => {
                if (resolved) return;
                resolved = true;
                reject(new Error('副模型超時'));
            }, CONFIG.timeoutMs);

            win.OS_API.chatSecondary(messages, null, (text) => {
                if (resolved) return;
                resolved = true;
                clearTimeout(timer);
                resolve(text);
            }, (err) => {
                if (resolved) return;
                resolved = true;
                clearTimeout(timer);
                reject(err);
            });
        });
    }

    async function runExtractionWithRetry(prompt) {
        let lastErr = null;
        for (let i = 0; i < CONFIG.retryCount; i++) {
            try {
                const text = await runExtractionOnce(prompt);
                const json = extractJSON(text);
                if (json && Array.isArray(json.moves)) {
                    return json;
                }
                lastErr = new Error(`第 ${i+1} 次：JSON 解析失敗`);
                console.warn('[VN_Bridge]', lastErr.message, '原始輸出 head:', String(text).substring(0, 200));
            } catch (e) {
                lastErr = e;
                console.warn(`[VN_Bridge] 第 ${i+1} 次失敗:`, e.message);
            }
            if (i < CONFIG.retryCount - 1) {
                await new Promise(r => setTimeout(r, CONFIG.retryDelayMs));
            }
        }
        throw lastErr || new Error('副模型抽取失敗');
    }

    // 把抽出的 moves 寫成「該訊息的 patch」
    async function applyMoves(moves, mcName, msgId) {
        if (!Array.isArray(moves) || moves.length === 0) return 0;

        // 主角過濾保險（patch 系統 recomputeLiveStates 也會再擋一次）
        if (!mcName && win.SCHEDULE_ENGINE && win.SCHEDULE_ENGINE.getMainUserName) {
            mcName = win.SCHEDULE_ENGINE.getMainUserName();
        }

        const cleanedMoves = [];
        const filtered = [];

        // 預先處理 DYNAMIC: 前綴 → 加成虛擬設施 → 改寫 location_id
        for (const m of moves) {
            if (!m || !m.character || !m.location_id) continue;
            if (mcName && (m.character === mcName || m.character.includes(mcName))) {
                filtered.push(m.character);
                continue;
            }

            let locId = m.location_id;
            if (typeof locId === 'string' && locId.startsWith('DYNAMIC:')) {
                const displayName = locId.substring(8).trim();
                if (displayName && win.WORLD_RUNTIME && win.WORLD_RUNTIME.addDynamicFacility) {
                    try {
                        const newSceneId = await win.WORLD_RUNTIME.addDynamicFacility(displayName);
                        if (newSceneId) locId = newSceneId;
                    } catch (e) {
                        console.warn('[VN_Bridge] addDynamicFacility 失敗:', e);
                    }
                }
            }

            cleanedMoves.push({
                character: m.character,
                location_id: locId,
                action: m.action || '',
                dialogue: m.dialogue || '',
                until_period: m.until_period || null,
                category: 'Outing'
            });
        }
        if (filtered.length > 0) {
            console.log('[VN_Bridge] 🛡️ 主角過濾，已忽略:', filtered.join(', '));
        }
        if (cleanedMoves.length === 0) return 0;

        const id = (msgId !== undefined && msgId !== null) ? msgId : `manual_${Date.now()}`;
        await win.WORLD_RUNTIME.setPatch(id, cleanedMoves, mcName || '');
        console.log('[VN_Bridge] ✅ patch 寫入 (msgId:', id, ')，角色:', cleanedMoves.map(m => m.character).join(', '));
        return cleanedMoves.length;
    }

    // === 主流程：監聽到 GENERATION_ENDED 後跑 ===
    // msgId: 酒館訊息 id（GENERATION_ENDED 事件帶的）。沒給就用 manual_<時間戳>
    async function onGenerationEnded(msgId) {
        if (!CONFIG.enabled) return;
        if (_running) {
            console.log('[VN_Bridge] 已有抽取在跑，跳過');
            return;
        }
        if (!win.WORLD_RUNTIME) {
            console.warn('[VN_Bridge] WORLD_RUNTIME 未就緒，跳過');
            return;
        }
        const world = win.WORLD_RUNTIME.getCurrentWorld();
        if (!world || !world.zones) {
            console.log('[VN_Bridge] 當前無世界資料，跳過抽取');
            return;
        }
        if (win.WORLD_RUNTIME.isPreview && win.WORLD_RUNTIME.isPreview()) {
            console.log('[VN_Bridge] 預覽模式中，跳過');
            return;
        }

        _running = true;
        try {
            // 過期清理
            await win.WORLD_RUNTIME.cleanExpiredLiveStates();

            const historyText = await fetchRecentMessages(CONFIG.historyCount);
            if (!historyText) {
                console.log('[VN_Bridge] 沒撈到訊息，跳過');
                return;
            }

            // 主角名（優先 [Protagonist|X] 標籤 → fallback OS_USER / ctx.name1）
            const mcName = resolveMcName(historyText);

            // 已知角色名單（schedule + liveStates 合併，排除主角）
            const known = new Set();
            if (world.schedules) Object.keys(world.schedules).forEach(n => known.add(n));
            if (world.liveStates) Object.keys(world.liveStates).forEach(n => known.add(n));
            if (mcName) known.delete(mcName);

            const prompt = buildExtractPrompt(historyText, world, [...known], mcName);
            console.log('[VN_Bridge] 🔍 開始副模型抽取...');
            const json = await runExtractionWithRetry(prompt);

            if (!json.moves || json.moves.length === 0) {
                console.log('[VN_Bridge] 抽取結果：本段無位置變化');
                // 沒位置變化也要寫一個空 patch，這樣 reroll 時會清掉舊資料
                if (msgId !== undefined && msgId !== null) {
                    await win.WORLD_RUNTIME.setPatch(msgId, [], mcName || '');
                }
                return;
            }
            await applyMoves(json.moves, mcName, msgId);
        } catch (e) {
            console.warn('[VN_Bridge] 抽取整體失敗:', e.message);
            if (!CONFIG.silentFallback && win.toastr) {
                win.toastr.warning('VN 對接抽取失敗：' + e.message, 'Map');
            }
        } finally {
            _running = false;
        }
    }

    // 防抖（接 msgId）
    function scheduleExtraction(msgId) {
        if (_debounceTimer) clearTimeout(_debounceTimer);
        _debounceTimer = setTimeout(() => {
            _debounceTimer = null;
            onGenerationEnded(msgId);
        }, CONFIG.debounceMs);
    }

    // === 監聽器掛載：GENERATION_ENDED + MESSAGE_DELETED/SWIPED/EDITED/UPDATED ===
    let _attached = false;
    function attachListeners() {
        if (_attached) return;
        if (!win.eventOn || !win.tavern_events) {
            setTimeout(attachListeners, 500);
            return;
        }
        const T = win.tavern_events;
        if (!T.GENERATION_ENDED) {
            console.warn('[VN_Bridge] tavern_events.GENERATION_ENDED 不存在');
            return;
        }

        // 1. AI 生成完畢 → 抽取 → 寫 patch
        win.eventOn(T.GENERATION_ENDED, (msgId) => {
            if (!CONFIG.enabled) return;
            scheduleExtraction(msgId);
        });

        // 2. 訊息變動類事件 → 移除對應 patch（reroll/swipe/edit/delete 都要清）
        const cleanupHandler = (evtName) => (msgId) => {
            if (!CONFIG.enabled) return;
            if (!win.WORLD_RUNTIME || !win.WORLD_RUNTIME.removePatch) return;
            console.log(`[VN_Bridge] 收到 ${evtName} (msgId: ${msgId}) → 清 patch`);
            win.WORLD_RUNTIME.removePatch(msgId);
        };
        if (T.MESSAGE_DELETED) win.eventOn(T.MESSAGE_DELETED, cleanupHandler('MESSAGE_DELETED'));
        if (T.MESSAGE_SWIPED)  win.eventOn(T.MESSAGE_SWIPED,  cleanupHandler('MESSAGE_SWIPED'));
        if (T.MESSAGE_EDITED)  win.eventOn(T.MESSAGE_EDITED,  cleanupHandler('MESSAGE_EDITED'));
        if (T.MESSAGE_UPDATED) win.eventOn(T.MESSAGE_UPDATED, cleanupHandler('MESSAGE_UPDATED'));

        _attached = true;
        console.log('[VN_Bridge] ✅ 已掛載 GENERATION_ENDED + 4 個訊息變動事件監聽器（總開關預設關閉）');
    }
    setTimeout(attachListeners, 1000);

    // === 對外 API ===
    win.VN_BRIDGE = {
        getConfig: () => ({ ...CONFIG }),
        getDefaultConfig: () => ({ ...DEFAULT_CONFIG }),
        setConfig: (patch) => {
            Object.assign(CONFIG, patch || {});
            saveConfigToStorage();
            console.log('[VN_Bridge] 配置更新:', CONFIG);
        },
        resetConfig: () => {
            Object.keys(CONFIG).forEach(k => delete CONFIG[k]);
            Object.assign(CONFIG, DEFAULT_CONFIG);
            saveConfigToStorage();
            console.log('[VN_Bridge] 🔄 配置已恢復預設');
        },
        enable: () => {
            CONFIG.enabled = true;
            saveConfigToStorage();
            console.log('[VN_Bridge] ✅ 已啟用');
        },
        disable: () => {
            CONFIG.enabled = false;
            saveConfigToStorage();
            console.log('[VN_Bridge] 🛑 已停用');
        },
        isEnabled: () => CONFIG.enabled,
        // 手動跑一次（測試用）→ 拿最新 msgId 當 patch key
        testRun: async () => {
            const wasEnabled = CONFIG.enabled;
            CONFIG.enabled = true;
            let latestMsgId = null;
            try {
                if (win.TavernHelper && typeof win.TavernHelper.getChatMessages === 'function') {
                    const last = await win.TavernHelper.getChatMessages(-1);
                    if (Array.isArray(last) && last[0]) latestMsgId = last[0].message_id;
                }
            } catch (e) {}
            try { await onGenerationEnded(latestMsgId); }
            finally { CONFIG.enabled = wasEnabled; }
        }
    };
})();
