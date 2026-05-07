// ----------------------------------------------------------------
// [檔案] schedule_engine.js (V1.0 - Stage 2: 角色排程引擎)
// 路徑：scripts/os_phone/map/schedule_engine.js
// 職責：
//   1. 從 [Character_Profiles] 條目 parse 出當前世界角色清單
//   2. AI 為每個角色生 7 時段 × ≤3 分支 × prob 加總 100 的排程
//   3. 提供 getCurrentActivity / getCharsAtFacility 給 map_core 用
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入角色排程引擎 (V1.0)...');
    const win = window.parent || window;

    // 7 時段定義（依策畫書）
    const PERIODS = [
        { name: '黎明', start: 5,  end: 8  },
        { name: '上午', start: 8,  end: 12 },
        { name: '下午', start: 12, end: 17 },
        { name: '黃昏', start: 17, end: 19 },
        { name: '晚上', start: 19, end: 23 },
        { name: '午夜', start: 23, end: 26 }, // 23:00 - 02:00 跨日
        { name: '凌晨', start: 2,  end: 5  }
    ];

    function getTimePeriod(date) {
        const h = (date || new Date()).getHours();
        if (h >= 5  && h < 8 ) return '黎明';
        if (h >= 8  && h < 12) return '上午';
        if (h >= 12 && h < 17) return '下午';
        if (h >= 17 && h < 19) return '黃昏';
        if (h >= 19 && h < 23) return '晚上';
        if (h >= 23 || h < 2 ) return '午夜';
        return '凌晨';
    }

    // 主角名（過濾用，主角不該被排程或寫進 liveStates）
    // 多源 fallback：OS_USER → WX_USER → 酒館 ctx.name1
    function getMainUserName() {
        try {
            if (win.OS_USER && typeof win.OS_USER.getInfo === 'function') {
                const u = win.OS_USER.getInfo();
                if (u && u.name) return u.name;
            }
        } catch (e) {}
        try {
            if (win.WX_USER && typeof win.WX_USER.getInfo === 'function') {
                const u = win.WX_USER.getInfo();
                if (u && u.name) return u.name;
            }
        } catch (e) {}
        try {
            if (win.SillyTavern && win.SillyTavern.getContext) {
                const ctx = win.SillyTavern.getContext();
                if (ctx && ctx.name1) return ctx.name1;
            }
        } catch (e) {}
        return '';
    }

    // 讀取 [Character_Profiles] 條目並 parse 出角色清單
    async function loadProfileChars(chatId) {
        try {
            const helper = win.TavernHelper;
            if (!helper || typeof helper.getLorebookEntries !== 'function') {
                console.warn('[Schedule] TavernHelper 未就緒');
                return [];
            }

            let bookName = null;
            try {
                if (typeof helper.getCurrentCharPrimaryLorebook === 'function') {
                    bookName = await helper.getCurrentCharPrimaryLorebook();
                }
            } catch (e) {}
            if (!bookName) {
                console.warn('[Schedule] 找不到主世界書');
                return [];
            }

            const entries = await helper.getLorebookEntries(bookName);
            const targetComment = `[Character_Profiles] - ${chatId}`;
            const entry = entries.find(e => e.comment === targetComment);

            if (!entry || !entry.content) {
                console.log('[Schedule] 此聊天尚無 [Character_Profiles] 條目');
                return [];
            }

            // parse markdown 表格
            const chars = [];
            const lines = entry.content.split('\n');
            let headers = null;
            let nameIdx = -1, idIdx = -1, persIdx = -1;

            for (const line of lines) {
                const t = line.trim();
                if (!t.includes('|')) continue;
                if (/^\|?[\s\-:]+\|/.test(t)) continue; // 分隔行
                const cols = t.replace(/^\|/, '').replace(/\|$/, '').split('|').map(s => s.trim());
                if (!cols[0]) continue;

                // 表頭
                if (!headers && /名字|名稱|姓名/i.test(cols[0])) {
                    headers = cols;
                    nameIdx = cols.findIndex(c => /名字|名稱|姓名/i.test(c));
                    idIdx = cols.findIndex(c => /身份|身分/i.test(c));
                    persIdx = cols.findIndex(c => /性格/i.test(c));
                    continue;
                }

                if (!headers) continue;
                if (cols[nameIdx] === '--' || !cols[nameIdx]) continue;

                chars.push({
                    name: cols[nameIdx],
                    identity: idIdx >= 0 ? (cols[idIdx] || '') : '',
                    persona: persIdx >= 0 ? (cols[persIdx] || '') : ''
                });
            }

            // 過濾主角
            const mainName = getMainUserName();
            const filtered = mainName
                ? chars.filter(c => c.name !== mainName && !c.name.includes(mainName))
                : chars;

            console.log(`[Schedule] 從 profile 解析出 ${filtered.length} 個角色（主角 "${mainName}" 已過濾）`);
            return filtered;
        } catch (e) {
            console.error('[Schedule] loadProfileChars 失敗:', e);
            return [];
        }
    }

    // 構建設施清單字串（餵給 AI）
    function buildFacilityListText(worldData) {
        if (!worldData || !worldData.zones) return '';
        const lines = [];
        Object.keys(worldData.zones).forEach(zKey => {
            const z = worldData.zones[zKey];
            Object.keys(z.facilities || {}).forEach(fKey => {
                const f = z.facilities[fKey];
                const sceneId = f.sceneId || `${zKey}_${fKey}`;
                lines.push(`- ${sceneId} (${z.name} / ${f.name})`);
            });
        });
        return lines.join('\n');
    }

    // 構建 Stage 2 prompt（雙模式）
    // 模式 A：profile 有角色 → 列清單，AI 照名單生
    // 模式 B：profile 為空 → 命令 AI 從 [World Info] 自行提取角色（系統卡 / 開頭尚未跑 VN）
    function buildSchedulePrompt(chars, worldData) {
        const facilityText = buildFacilityListText(worldData);
        const mainName = getMainUserName();
        const useProfile = Array.isArray(chars) && chars.length > 0;

        let header;
        if (useProfile) {
            const charList = chars.map(c => `- ${c.name}（${c.identity || '?'}）：${c.persona || '?'}`).join('\n');
            header = `你是此世界的敘事 AI。請為以下角色各自生成一份 24 小時排程表。

【角色清單】
${charList}`;
        } else {
            header = `你是此世界的敘事 AI。請從上文 [World Info] 中提取此世界的重要角色，為每個角色生成一份 24 小時排程表。

【角色提取規則】
- 從 [World Info] 中挑出 NPC、配角、具名角色（不論作者把資料放在哪個條目、用什麼命名方式都要能辨識）
- 主角 "${mainName || '(玩家本人)'}" 絕對不得列入排程
- 角色總數最多 5 個，挑最有戲份、最有存在感的；少於 5 個也可以
- 角色名請用世界書中明確出現的人名，不要自創新角色`;
        }

        return `[系統指令：動態角色排程生成]
${header}

【可選地點 location_id 清單】
${facilityText}

【嚴格規則】
1. 每個角色都要有 7 個時段：黎明、上午、下午、黃昏、晚上、午夜、凌晨
2. 每個時段最多 3 條分支，分支 prob (機率) 數值總和必須剛好等於 100
3. category 只能是：Work / Home / Outing
4. location_id（地點綁定，這是最重要的規則）：
   - Work / Outing：必須從上面清單中選 sceneId
   - Home（在家活動，包括睡覺、休息、私下相處）：
     ★ 優先檢查地圖清單中是否有「該角色居住的設施」（例如住宅、別墅、公寓、套房、臥室、小屋、家、宅邸這類），有的話必須用該 sceneId
     ★ 只有在地圖完全沒有對應住處設施時，才允許填 "Home"
     ★ 戀愛卡 / 同居劇情：通常主角和配偶住在一起，那個地圖上的住宅就是雙方的 Home
5. action / dialogue 必須符合該世界觀，不可破壞沉浸感
6. 行為要符合該角色的身份與性格

【輸出格式：嚴格 JSON，不要任何其他文字、不要 markdown 包裹】
{
  "schedules": {
    "角色名": {
      "黎明": [
        {"category": "Home", "prob": 100, "location_id": "Home", "action": "...", "dialogue": "..."}
      ],
      "上午": [
        {"category": "Work", "prob": 70, "location_id": "Z1_F1", "action": "...", "dialogue": "..."},
        {"category": "Outing", "prob": 30, "location_id": "Z2_F3", "action": "...", "dialogue": "..."}
      ]
    }
  }
}

只輸出純 JSON。`;
    }

    function extractJSON(text) {
        if (!text) return null;
        let cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
        try { return JSON.parse(cleaned); } catch (e) {}
        const a = cleaned.indexOf('{');
        const b = cleaned.lastIndexOf('}');
        if (a >= 0 && b > a) {
            try { return JSON.parse(cleaned.substring(a, b + 1)); } catch (e) {}
        }
        return null;
    }

    // 主入口：為當前世界生排程
    async function generateSchedules(progressCb) {
        if (!win.WORLD_RUNTIME) {
            if (progressCb) progressCb('error', 'WORLD_RUNTIME 未就緒');
            return false;
        }
        const world = win.WORLD_RUNTIME.getCurrentWorld();
        if (!world || !world.zones) {
            if (progressCb) progressCb('error', '當前無世界資料');
            return false;
        }

        const chatId = win.WORLD_RUNTIME.detectWorldId();
        if (progressCb) progressCb('load', '讀取角色檔案...');

        const chars = await loadProfileChars(chatId);
        const usedFallback = chars.length === 0;

        if (progressCb) {
            progressCb('ai', usedFallback
                ? '從世界書提取角色生成排程...'
                : `為 ${chars.length} 個角色生成排程...`);
        }

        const prompt = buildSchedulePrompt(chars, world);
        let messages;
        try {
            messages = await win.OS_API.buildContext(prompt, 'map_schedule_gen');
        } catch (e) {
            if (progressCb) progressCb('error', 'Context 構建失敗');
            return false;
        }

        return new Promise((resolve) => {
            let processed = false;
            win.OS_API.chat(messages, win.OS_SETTINGS.getConfig(), null, async (responseText) => {
                if (processed) return;
                const json = extractJSON(responseText);
                if (!json) {
                    if (responseText && responseText.length > 200 && responseText.includes('}')) {
                        processed = true;
                        console.error('[Schedule] 解析失敗，原始輸出:', responseText.substring(0, 500));
                        if (progressCb) progressCb('error', 'AI 沒吐合法 JSON');
                        resolve(false);
                    }
                    return;
                }
                processed = true;

                if (!json.schedules || typeof json.schedules !== 'object') {
                    if (progressCb) progressCb('error', 'JSON 缺 schedules 欄');
                    resolve(false);
                    return;
                }

                const finalCharCount = Object.keys(json.schedules).length;
                console.log('[Schedule] ✅ AI JSON 解析成功:', Object.keys(json.schedules));

                // 寫入 WORLD_RUNTIME + OS_DB
                const ok = await win.WORLD_RUNTIME.setSchedules(json.schedules, {
                    fallback: usedFallback,
                    charCount: finalCharCount
                });
                if (progressCb) progressCb(ok ? 'done' : 'error', ok ? '排程已生成' : '存檔失敗');
                resolve(ok);
            }, (err) => {
                if (processed) return;
                processed = true;
                console.error('[Schedule] AI 呼叫失敗:', err);
                if (progressCb) progressCb('error', 'AI 呼叫失敗');
                resolve(false);
            });
        });
    }

    // 時段內快取：同角色同時段同天，骰一次就鎖定
    // 用 WeakMap 以 sched 物件當 key —— setSchedules 換新物件後，舊 cache 自動失效
    let branchCache = new WeakMap(); // WeakMap<schedObj, Map<"charName|period|YYYY-MM-DD", branch>>

    function _dayKey(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    // 手動清快取（重新生成排程 / debug 用）
    function clearActivityCache() {
        branchCache = new WeakMap();
        console.log('[Schedule] 🧹 排程快取已清空');
    }

    // 骰子函數：給定角色，回傳當下時段命中的分支
    // 優先順序：liveStates（VN 即時抽取）> schedule（平常作息範本）
    function getCurrentActivity(charName, time) {
        // 1. 先查 liveStates（VN > schedule）—— live 是即時的，不快取
        if (win.WORLD_RUNTIME && typeof win.WORLD_RUNTIME.getLiveState === 'function') {
            const live = win.WORLD_RUNTIME.getLiveState(charName, time);
            if (live) {
                return {
                    category: live.category || 'Outing',
                    location_id: live.location_id,
                    action: live.action || '',
                    dialogue: live.dialogue || '',
                    isLive: true,
                    until_period: live.until_period,
                    until_ts: live.until_ts
                };
            }
        }

        // 2. 走 schedule
        const world = win.WORLD_RUNTIME ? win.WORLD_RUNTIME.getCurrentWorld() : null;
        if (!world || !world.schedules) return null;
        const sched = world.schedules[charName];
        if (!sched) return null;

        const now = time || new Date();
        const period = getTimePeriod(now);
        const branches = sched[period];
        if (!Array.isArray(branches) || branches.length === 0) return null;

        // 查時段快取（同 sched 物件 + 同 charName + 同 period + 同日期）
        const cacheKey = `${charName}|${period}|${_dayKey(now)}`;
        let inner = branchCache.get(sched);
        if (inner && inner.has(cacheKey)) {
            return inner.get(cacheKey);
        }

        // miss → 骰
        const total = branches.reduce((s, b) => s + (Number(b.prob) || 0), 0);
        let chosen;
        if (total <= 0) {
            chosen = branches[0];
        } else {
            let r = Math.random() * total;
            chosen = branches[branches.length - 1];
            for (const b of branches) {
                r -= (Number(b.prob) || 0);
                if (r <= 0) { chosen = b; break; }
            }
        }

        // 寫入快取
        if (!inner) {
            inner = new Map();
            branchCache.set(sched, inner);
        }
        inner.set(cacheKey, chosen);
        return chosen;
    }


    // 取在指定設施內的所有角色（當下時段）
    // 同時涵蓋 schedule 角色與 liveStates 角色（即使後者沒有 schedule）
    function getCharsAtFacility(zoneId, facKey, time) {
        const world = win.WORLD_RUNTIME ? win.WORLD_RUNTIME.getCurrentWorld() : null;
        if (!world) return [];

        const sceneId = `${zoneId}_${facKey}`;
        const fac = world.zones && world.zones[zoneId] && world.zones[zoneId].facilities[facKey];
        const facSceneId = fac && fac.sceneId ? fac.sceneId : sceneId;

        // 合併兩邊角色名單去重
        const names = new Set();
        if (world.schedules) Object.keys(world.schedules).forEach(n => names.add(n));
        if (world.liveStates) Object.keys(world.liveStates).forEach(n => names.add(n));

        const hits = [];
        names.forEach(name => {
            const act = getCurrentActivity(name, time);
            if (!act) return;
            if (act.location_id === sceneId || act.location_id === facSceneId) {
                hits.push({
                    name,
                    role: '',
                    action: act.action || '',
                    dialogue: act.dialogue || '...',
                    category: act.category || '',
                    isLive: !!act.isLive
                });
            }
        });
        return hits;
    }

    win.SCHEDULE_ENGINE = {
        PERIODS,
        getTimePeriod,
        getMainUserName,
        loadProfileChars,
        generateSchedules,
        getCurrentActivity,
        getCharsAtFacility,
        clearActivityCache,
        extractJSON
    };
})();
