// ----------------------------------------------------------------
// [檔案] world_generator.js (V1.0 - Stage 1: 動態世界生成器)
// 路徑：scripts/os_phone/map/world_generator.js
// 職責：讀取當前世界書 + 角色卡 → AI 生成 zones/facilities JSON
//        → 跑 pollinations 生設施背景圖 → 灌進 WORLD_RUNTIME + OS_DB
// 依賴：OS_API.buildContext / OS_API.chat / OS_IMAGE_MANAGER / WORLD_RUNTIME / OS_DB
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入動態世界生成器 (V1.0)...');
    const win = window.parent || window;

    // 世界大地圖底板風格詞綴（俯視全景，無人物，整個 world 一張）
    // 兩份 baseplate，根據 AI 判定的 world_genre 選用
    // - fictional：完全虛構（修仙 / 奇幻 / 異世界 / 末日 / 賽博）→ 強制虛構 + 禁真實地理
    // - historical：真實歷史背景（明清 / 江戶 / 維多利亞 / 二戰）→ 寫實地理風，允許真實地名
    const WORLDMAP_BASEPLATE_FICTIONAL = "imaginary fictional fantasy realm map, original invented continent, hand-drawn fantasy cartography, painted overhead view, top-down aerial perspective, regions separated by terrain, decorative borders, parchment style, soft lighting, masterpiece, highres, no characters, environment-focused, NO real-world geography, NO earth continents, NO china map, NO asia mainland shape, NO real country borders, NOT a political map";
    const WORLDMAP_BASEPLATE_HISTORICAL = "historical world map, period-accurate cartography, antique map illustration, painted overhead view, top-down aerial perspective, parchment style, sepia tones, hand-lettered place names, decorative compass rose, soft lighting, masterpiece, highres, no characters, environment-focused";
    // 舊名稱保留（avoid breaking external refs，現在指向 fictional）
    const DEFAULT_WORLDMAP_BASEPLATE = WORLDMAP_BASEPLATE_FICTIONAL;

    const STAGE1_PROMPT = `[系統指令：動態世界地圖生成]
你是世界觀地圖建構 AI。請根據當前【世界書】與【角色卡】設定，生成此世界的區域與設施清單。

【世界規模判斷 — 自行依世界書內容決定，不可機械式平均】
- 小場景（村莊 / 校園 / 單一機構 / 異空間 / 偏鄉小鎮）：2-3 個區域，每區 3-4 個設施
- 中型場景（城鎮 / 都會 / 王國首都 / 學院）：3-5 個區域，每區 4-6 個設施
- 史詩級（多國 / 大陸 / 帝國 / 多元宇宙）：4-6 個區域，每區 5-7 個設施
※ 區域數 / 設施數要貼合世界書描寫，不要每次都湊 3 區 3 設施

【嚴格規則】
- 設施名稱必須符合該世界觀的認知框架（中世紀世界禁用「捷運站」「網咖」；末日廢土禁用「皇家城堡」；魔法學院禁用「便利商店」）
- 層級結構：世界 → 區域 (zone) → 設施 (facility)
- 各區域之間應有功能 / 氛圍差異（鬧區 vs 隱秘 vs 邊陲），避免同質化
- 每個區域 (zone) 需給一個能代表該區的 emoji icon
- 每個區域需給 mapX / mapY（0-100 整數座標，標出該區在「世界大地圖」上的位置；依世界書地理描述合理擺放——港口靠近邊緣、商業中心放中央、山區放角落、不同 zone 不可重疊）
- 每個設施需給一個 emoji icon、短名 (shortName, 4 字內)、英文背景圖 prompt (background_prompt)
- 整個世界另需一張「大地圖底板」，吐 world_map_prompt 欄位（英文關鍵詞，描述全景俯視構圖）

【⚠ 世界類型判定（world_genre 欄位）— 影響大地圖視覺風格】
請先讀世界書與角色卡，判定本世界類型，輸出在頂層的 world_genre 欄位：
- "fictional"：完全虛構世界（修仙 / 仙俠 / 奇幻 / 異世界 / 末日廢土 / 賽博 / 魔法學院 / 末世喪屍 / 異星）
  → 大地圖會用「虛構幻想」風格，world_map_prompt **嚴禁** 用任何真實地名（不可寫 china / japan / asia / europe / 北京 / 長安 / 九州 / 東海 / 崑崙 / 蓬萊 / 桃花源 等真實或典故地名），用純粹地形構圖英文詞（mountain / harbor / floating islands / mystical valley 等）
- "historical"：真實歷史背景（明清 / 民國 / 江戶 / 維多利亞時期 / 二戰 / 古羅馬 / 紀實年代劇）
  → 大地圖會用「歷史寫實」風格，world_map_prompt **可以** 自由使用真實地名與該時期地理（例如 ming dynasty china map, edo japan, victorian london, ancient rome）
- 不確定 / 邊界模糊（例如架空朝代但融合真實朝代元素）→ 預設用 "fictional" 保險

【⚠ JSON key 命名規則 — 違反必須重寫】
- zone 與 facility 的 JSON key 必須是「語意化的英文 snake_case」
- ✅ 好的 key：harbor_docks / noble_quarter / cathedral / wasteland_outpost / oracle_archive / dragon_roost / market_alley / forge / cybernet_cafe / monastery_garden
- ❌ 禁止的 key：Z1 / Z2 / Z3 / F1 / F2 / zone1 / zone_a / area_a / facility_x（任何制式編號或字母代號）
- key 用英文（程式辨識用），name 用中文（玩家看的）
- 同一張地圖內，每個 key 必須具有可辨識的語意，從 key 就能猜出是什麼地方

【輸出格式：嚴格 JSON，不要任何其他文字、不要 markdown 包裹】
範例（中型城市，3 區、設施數量不固定，虛構奇幻 / fictional）：
{
  "world_name": "霧光帝都・艾爾迪亞",
  "world_genre": "fictional",
  "world_map_prompt": "fantasy imperial capital map, central palace district on a hill, harbor docks at the northeast coast, shadow alleys at the southwest fringe, river running through, twilight",
  "zones": {
    "noble_quarter": {
      "name": "貴族街",
      "icon": "👑",
      "mapX": 50, "mapY": 45,
      "background_prompt": "majestic baroque mansions, gas lamps, marble pavement, twilight",
      "facilities": {
        "marble_palace": { "name": "白瑩王宮", "shortName": "王宮", "icon": "🏰", "background_prompt": "white marble palace, throne hall, gilded pillars" },
        "opera_house":   { "name": "金紗歌劇院", "shortName": "歌劇院", "icon": "🎭", "background_prompt": "ornate opera hall, red velvet, chandeliers" },
        "rose_garden":   { "name": "玫瑰庭園", "shortName": "庭園", "icon": "🌹", "background_prompt": "manicured rose garden, stone fountains, dusk light" },
        "knight_barracks": { "name": "騎士團駐地", "shortName": "騎士團", "icon": "⚔️", "background_prompt": "stone barracks, armored knights, training yard" },
        "high_cathedral":  { "name": "至高大教堂", "shortName": "教堂", "icon": "⛪", "background_prompt": "gothic cathedral, stained glass, candle light" }
      }
    },
    "harbor_docks": {
      "name": "風暴港埠",
      "icon": "⚓",
      "mapX": 78, "mapY": 22,
      "background_prompt": "stormy harbor, wooden ships, lighthouse, fog",
      "facilities": {
        "salty_tavern":   { "name": "鹹風酒館", "shortName": "酒館", "icon": "🍻", "background_prompt": "rough sailor tavern, oil lamps, wooden barrels" },
        "fish_market":    { "name": "晨霧魚市", "shortName": "魚市", "icon": "🐟", "background_prompt": "busy fish market, wet stone, morning fog" },
        "smuggler_pier":  { "name": "走私者碼頭", "shortName": "暗碼頭", "icon": "🪝", "background_prompt": "dark wooden pier, hooded figures, lantern" }
      }
    },
    "shadow_alleys": {
      "name": "影巷區",
      "icon": "🗡️",
      "mapX": 22, "mapY": 70,
      "background_prompt": "narrow shadowy alleys, gas lamps, cobblestone, fog",
      "facilities": {
        "thieves_den":    { "name": "影爪賊巢", "shortName": "賊巢", "icon": "🗝️", "background_prompt": "underground thieves hideout, candles, daggers" },
        "black_apothecary": { "name": "黑漆藥房", "shortName": "藥房", "icon": "⚗️", "background_prompt": "dim apothecary, glass vials, herbs hanging" },
        "card_house":     { "name": "命運牌館", "shortName": "牌館", "icon": "🃏", "background_prompt": "smoky gambling hall, oil lamps, gold coins" },
        "underground_arena": { "name": "深淵鬥技場", "shortName": "鬥技場", "icon": "🩸", "background_prompt": "underground fighting pit, torchlight, blood stains" }
      }
    }
  }
}

只輸出純 JSON，不要 \`\`\`json 包裹，不要說明。`;

    // 從 AI 回應抽出 JSON
    function extractJSON(text) {
        if (!text) return null;
        // 去掉 markdown 包裹
        let cleaned = text.trim();
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');

        // 嘗試直接 parse
        try { return JSON.parse(cleaned); } catch (e) {}

        // 抓第一個 { 到最後一個 } 的子串
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            const sub = cleaned.substring(firstBrace, lastBrace + 1);
            try { return JSON.parse(sub); } catch (e) {
                console.warn('[WorldGen] JSON 抽取失敗，最後嘗試也炸:', e.message);
            }
        }
        return null;
    }

    // 生區域圖：走「小地圖桶」路由(imgType:'map')→用小地圖桶自己的模型/預設 + 強制去人物負詞(俯視平面圖、絕不長角色)。
    //   ⚠️ 一次生一張、排序 await（世界生成很多張，非 poll 接口本來就慢/排隊，序列避免打爆）。
    //   NAI 回 blob: URL 重載會失效 → 轉 data URL 才能存進世界 DB 持久化（poll/ComfyUI 本來就持久，原樣回）。
    async function _genBgPersistent(prompt, opts) {
        const IM = win.OS_IMAGE_MANAGER;
        if (!IM || typeof IM.generateBackgroundAsync !== 'function') return '';
        const _o = Object.assign({ width: 1024, height: 1024 }, opts || {}, { imgType: 'map' });
        let url = '';
        try { url = await IM.generateBackgroundAsync(prompt, _o) || ''; }
        catch (e) { console.warn('[WorldGen] 圖生成失敗:', e && e.message); return ''; }
        if (url && url.indexOf('blob:') === 0) {
            try {
                const blob = await (await fetch(url)).blob();
                url = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result)); fr.onerror = () => r(''); fr.readAsDataURL(blob); });
            } catch (e) { /* 轉檔失敗就退回 blob（本次 session 能用，重載才失效） */ }
        }
        return url;
    }
    async function genFacilityImage(prompt) {
        return await _genBgPersistent(prompt, { width: 1024, height: 1024 });
    }

    // LoremFlickr fallback URL（永遠 work，當 onerror 時用）
    function genLoremFlickrUrl(keywords) {
        const tags = (keywords || 'city,scene')
            .replace(/[^a-zA-Z0-9, ]/g, '')
            .replace(/\s+/g, ',');
        return `https://loremflickr.com/1280/720/${encodeURIComponent(tags || 'city')}`;
    }

    // 把 AI 吐的 JSON 轉成 map_data 相容格式（async：一張一張排序生圖，走背景桶接口）
    async function buildWorldData(rawJson) {
        if (!rawJson || !rawJson.zones) return null;
        const zones = {};

        for (const zKey of Object.keys(rawJson.zones)) {
            const z = rawJson.zones[zKey];
            const facilities = {};
            const facObj = z.facilities || {};

            for (const fKey of Object.keys(facObj)) {
                const f = facObj[fKey];
                const sceneId = `${zKey}_${fKey}`;
                const bgPrompt = f.background_prompt || z.background_prompt || f.name;
                const imageUrl = await genFacilityImage(bgPrompt);
                facilities[fKey] = {
                    sceneId,
                    name: f.name || fKey,
                    shortName: f.shortName || f.name || fKey,
                    icon: f.icon || '📍',
                    className: `facility-${fKey.toLowerCase()}`,
                    characters: [],
                    imageUrl: imageUrl || genLoremFlickrUrl(bgPrompt),
                    fallbackUrl: genLoremFlickrUrl(bgPrompt),
                    bgPrompt
                };
            }

            // mapX / mapY：clamp 到 0-100，缺值給 null 讓 renderHome 退化成卡片排版
            const mapX = (typeof z.mapX === 'number') ? Math.max(0, Math.min(100, z.mapX)) : null;
            const mapY = (typeof z.mapY === 'number') ? Math.max(0, Math.min(100, z.mapY)) : null;

            zones[zKey] = {
                name: z.name || zKey,
                icon: z.icon || '',
                mapX,
                mapY,
                background: (await genFacilityImage(z.background_prompt || z.name)) || genLoremFlickrUrl(z.background_prompt || z.name),
                bgPrompt: z.background_prompt || '',
                facilities
            };
        }

        // 世界類型：fictional（虛構奇幻）或 historical（真實歷史背景），預設 fictional
        const genre = (rawJson.world_genre === 'historical') ? 'historical' : 'fictional';
        const baseplate = (genre === 'historical')
            ? WORLDMAP_BASEPLATE_HISTORICAL
            : WORLDMAP_BASEPLATE_FICTIONAL;

        // 世界大地圖底板（風格詞綴前置 + AI 給的 prompt 後置）
        const worldMap = { backdropPrompt: '', backdropUrl: '', genre };
        if (rawJson.world_map_prompt && typeof rawJson.world_map_prompt === 'string') {
            worldMap.backdropPrompt = rawJson.world_map_prompt;
            const fullWorldPrompt = `${baseplate}, ${rawJson.world_map_prompt}`;
            worldMap.backdropUrl = (await genFacilityImage(fullWorldPrompt)) || genLoremFlickrUrl(rawJson.world_map_prompt);
        }

        return {
            name: rawJson.world_name || 'Generated World',
            genre,
            worldMap,
            zones
        };
    }

    // 主入口：產生並寫入當前 chatId 對應的世界
    async function generateForCurrentChat(progressCb) {
        const worldId = win.WORLD_RUNTIME ? win.WORLD_RUNTIME.detectWorldId() : null;
        if (!worldId || worldId === win.WORLD_RUNTIME.AUREALIS_ID) {
            console.warn('[WorldGen] 沒有可用的 chatId，無法生成');
            if (progressCb) progressCb('error', '找不到 chatId');
            return false;
        }

        if (!win.OS_API || typeof win.OS_API.buildContext !== 'function') {
            console.error('[WorldGen] OS_API 未就緒');
            if (progressCb) progressCb('error', 'OS_API 未就緒');
            return false;
        }

        if (progressCb) progressCb('start', '正在掃描世界書...');

        let messages;
        try {
            messages = await win.OS_API.buildContext(STAGE1_PROMPT, 'map_world_gen');
        } catch (e) {
            console.error('[WorldGen] buildContext 失敗:', e);
            if (progressCb) progressCb('error', 'Context 構建失敗');
            return false;
        }

        if (progressCb) progressCb('ai', 'AI 正在繪製地圖...');

        return new Promise((resolve) => {
            let processed = false;
            win.OS_API.chat(messages, win.OS_SETTINGS.getConfig(), null, async (responseText) => {
                if (processed) return;

                const json = extractJSON(responseText);
                if (!json) {
                    // 流式可能還沒完整，先觀望（streaming 多次回呼，最後一次才完整）
                    if (responseText && responseText.length > 100 && responseText.includes('}')) {
                        // 看起來收完了卻還抽不到 JSON → 失敗
                        processed = true;
                        console.error('[WorldGen] 解析失敗，原始輸出:', responseText.substring(0, 500));
                        if (progressCb) progressCb('error', 'AI 沒吐出合法 JSON');
                        resolve(false);
                    }
                    return;
                }
                processed = true;
                console.log('[WorldGen] ✅ AI JSON 解析成功:', json.world_name);

                if (progressCb) progressCb('image', '正在生成設施背景圖（一張一張排序生成，非 poll 接口會慢些）...');

                const worldData = await buildWorldData(json);
                if (!worldData) {
                    if (progressCb) progressCb('error', '世界資料構建失敗');
                    resolve(false);
                    return;
                }

                if (progressCb) progressCb('save', '寫入資料庫...');
                const ok = await win.WORLD_RUNTIME.setWorld(worldId, worldData);
                if (progressCb) progressCb(ok ? 'done' : 'error', ok ? '完成！' : '存檔失敗');
                resolve(ok);
            }, (err) => {
                if (processed) return;
                processed = true;
                console.error('[WorldGen] AI 呼叫失敗:', err);
                if (progressCb) progressCb('error', 'AI 呼叫失敗');
                resolve(false);
            });
        });
    }

    win.WORLD_GENERATOR = {
        generateForCurrentChat,
        extractJSON,
        buildWorldData,
        genLoremFlickrUrl
    };
})();
