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

    const STAGE1_PROMPT = `[系統指令：動態世界地圖生成]
你是「視差世界觀」的地圖建構 AI。請根據當前【世界書】與【角色卡】設定，生成此世界的區域與設施清單。

【嚴格規則】
- 設施名稱必須符合該世界觀的認知框架（中世紀世界禁用「捷運站」「網咖」等現代詞；末日廢土禁用「皇家城堡」等中世紀詞）
- 層級結構：世界 → 區域 (zone) → 設施 (facility)
- 數量限制：2~3 個區域，每個區域包含 3~5 個設施
- 每個設施需給一個 emoji icon、短名 (shortName)、英文背景圖 prompt (background_prompt)

【輸出格式：嚴格 JSON，不要任何其他文字、不要 markdown 包裹】
{
  "world_name": "世界名稱（中文）",
  "zones": {
    "Z1": {
      "name": "區域名稱",
      "background_prompt": "english keywords for image generation, e.g. medieval town square, sunset, fantasy",
      "facilities": {
        "F1": {
          "name": "設施全名",
          "shortName": "短名(4字內)",
          "icon": "🏰",
          "background_prompt": "english keywords"
        }
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

    // 跑 pollinations 出背景圖 URL（同步，不等下載完成）
    function genFacilityImage(prompt) {
        if (!win.OS_IMAGE_MANAGER || typeof win.OS_IMAGE_MANAGER.generateBackground !== 'function') {
            return '';
        }
        try {
            return win.OS_IMAGE_MANAGER.generateBackground(prompt, { width: 1024, height: 1024 });
        } catch (e) {
            console.warn('[WorldGen] 圖生成失敗:', e.message);
            return '';
        }
    }

    // LoremFlickr fallback URL（永遠 work，當 onerror 時用）
    function genLoremFlickrUrl(keywords) {
        const tags = (keywords || 'city,scene')
            .replace(/[^a-zA-Z0-9, ]/g, '')
            .replace(/\s+/g, ',');
        return `https://loremflickr.com/1280/720/${encodeURIComponent(tags || 'city')}`;
    }

    // 把 AI 吐的 JSON 轉成 map_data 相容格式
    function buildWorldData(rawJson) {
        if (!rawJson || !rawJson.zones) return null;
        const zones = {};

        Object.keys(rawJson.zones).forEach(zKey => {
            const z = rawJson.zones[zKey];
            const facilities = {};
            const facObj = z.facilities || {};

            Object.keys(facObj).forEach(fKey => {
                const f = facObj[fKey];
                const sceneId = `${zKey}_${fKey}`;
                const bgPrompt = f.background_prompt || z.background_prompt || f.name;
                const imageUrl = genFacilityImage(bgPrompt);
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
            });

            zones[zKey] = {
                name: z.name || zKey,
                background: genFacilityImage(z.background_prompt || z.name) || genLoremFlickrUrl(z.background_prompt || z.name),
                bgPrompt: z.background_prompt || '',
                facilities
            };
        });

        return {
            name: rawJson.world_name || 'Generated World',
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

                if (progressCb) progressCb('image', '正在生成設施背景圖...');

                const worldData = buildWorldData(json);
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
