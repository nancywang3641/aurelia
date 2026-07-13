// ----------------------------------------------------------------
// [檔案] scene_map_engine.js (V1.0 - Stage 3: 設施場景地標生成)
// 路徑：scripts/os_phone/map/scene_map_engine.js
// 職責：
//   1. 進設施時即時 call AI 出 <scene-map> 標籤（底板 prompt + 3-5 個地標物件 + x/y 座標）
//   2. parse 標籤 → 寫進 facility.sceneMap → 給 map_core 渲染 + 避撞
//   3. 開關控制是否走 pollinations 補底板圖（預設關，省流量）
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入場景地標引擎 (V1.0)...');
    const win = window.parent || window;

    const BACKDROP_AUTO_KEY = 'aurelia_scene_backdrop_auto';

    // 🗑️ 寫死的俯視底板風格詞綴已刪（Rae 定案）：風格詞她自己放「小地圖 TAB」的底詞欄，
    //    要改也在那裡改——這裡只送 AI 給的 backdropPrompt，不再暗拼任何固定詞。

    function isBackdropAuto() {
        try { return localStorage.getItem(BACKDROP_AUTO_KEY) === '1'; } catch (e) { return false; }
    }
    function setBackdropAuto(v) {
        try { localStorage.setItem(BACKDROP_AUTO_KEY, v ? '1' : '0'); } catch (e) {}
    }

    // PROMPT 模板（用戶提供的場景地圖規範 + 補一些避撞區域提示）
    const PROMPT_TEMPLATE = `[系統指令：場景地標生成]
你是當前世界的場景設計 AI。請為設施「{FAC_NAME}」（{FAC_DESC}，位於{ZONE_NAME}）生成一份小場景地標清單。
世界觀請參考上文 [World Info]。

## 🗺️ 場景地圖生成規則

### 1. 核心格式
請務必包含 \`<scene-map>\` 開始和結束標籤。

**必須包含的兩種元素：**

**(1) 地圖底板（用於生成背景圖）**
格式：\`[地標底板|英文基本布局關鍵詞]\`
說明：描述小地圖底背景（如：village interior, library hall, garden corner...），其他外觀物件只能布局九宮格大概描述（上下左右中）。

**(2) 地標物件（地圖上的物體，人物 ≠ 地標物件，不可輸出人物）**
格式：\`[地標物件|emoji+中文短名|長描述|x:0-100,y:0-100]\`
- 第 1 欄：emoji + 中文短名（emoji 開頭，短名 4-6 字純名詞，例：🪧任務佈告板）→ 永遠顯示在地標下方
- 第 2 欄：長描述（一句話描寫此處氛圍 / 細節，10-25 字）→ 玩家點擊地標才彈出
- 第 3 欄：x/y 座標（0-100）

### 2. 坐標系統說明
(0,0) 左上角  -------  (100,0) 右上角
    |                       |
    |      (50,50) 中心     |
    |                       |
(0,100) 左下角 ------- (100,100) 右下角

### 3. 生成邏輯要求
- **🌏 文化畫風必寫明（重要）**：\`[地標底板|...]\` 的英文關鍵詞**開頭第一個詞就要標出本世界的文化／時代畫風**，別讓它預設成歐洲中世紀。依上文世界觀判斷後選對應詞：
  - 中式武俠／仙俠／古代中國 → \`ancient chinese, wuxia, traditional chinese architecture\`
  - 現代／都市 → \`modern, contemporary\`；未來科幻／賽博 → \`sci-fi, cyberpunk\`
  - 西方奇幻／中世紀 → \`medieval european fantasy\`；末日廢土 → \`post-apocalyptic wasteland\`；日式和風 → \`japanese, traditional japanese\`
  - 例：武俠酒館要寫 \`ancient chinese wuxia tavern, wooden...\` 而**不是** \`fantasy tavern\`。抓不準寧可多寫文化詞也別留白。
- **底板一致性**：底板必須符合該世界觀（不可中世紀世界給出捷運站，不可末日廢土給出皇家城堡）
- **物件數量**：3-5 個具有代表性的地標物件
- **布局合理**：物件不要全部重疊，根據描述合理分布在 0-100 平面上
- **小人活動區留白**：小人會在 y=60~92 範圍走動，重要可看的物件可以放在 y<60 上半部；y=60-92 範圍盡量分散別塞太密（避免擋小人路）
- **每個地標的中文描述開頭請帶一個 emoji**（如 🪧🏰🌸🍷🛏️📚🪑🍽️），讓玩家一眼識別
- **⚠ 兩欄分工嚴格**：
  - 短名（第 1 欄）：emoji + 4-6 字純名詞，例：🪑圓桌 / 🪧任務板 / 🔥壁爐 / 🛏️睡墊。禁止敘述句、修飾語
  - 長描述（第 2 欄）：10-25 字氛圍描寫，可有形容詞、場景細節、人群動態，例：「布告板附近擠滿了冒險者人群」、「爐火劈啪作響，幾隻獵犬伏在前方」
  - 短名是「標題」，長描述是「點擊浮窗內文」，別把長描述塞進短名

### ✅ 輸出範例
<scene-map>
[地標底板|cozy fantasy tavern interior, wooden tables left, bar counter back, fireplace right]
[地標物件|🔥壁爐|爐火劈啪作響，幾隻獵犬伏在前方烤火|x:80,y:35]
[地標物件|🍻吧檯|老闆正擦拭著黃銅酒杯，目光犀利地掃視來客|x:50,y:25]
[地標物件|🪑圓桌|散落著啤酒漬的木桌，三張舊木凳子圍著|x:25,y:75]
[地標物件|🪧任務佈告板|布告板附近擠滿了冒險者人群|x:15,y:30]
</scene-map>

只輸出 <scene-map>...</scene-map> 包裹的內容，不要其他文字、不要 markdown 包裹。`;

    function buildPrompt(facility, zone) {
        return PROMPT_TEMPLATE
            .replace(/\{FAC_NAME\}/g, facility.name || '未命名設施')
            .replace(/\{FAC_DESC\}/g, facility.shortName || facility.name || '此地')
            .replace(/\{ZONE_NAME\}/g, zone.name || '此區域');
    }

    // 抽 emoji（label 開頭第一個 emoji 字符）
    function _splitEmoji(label) {
        if (!label) return { emoji: '📍', text: '' };
        // 涵蓋常用 emoji 範圍
        const m = label.match(/^([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}\u{2300}-\u{23FF}])/u);
        if (m) {
            return { emoji: m[1], text: label.substring(m[1].length).trim() };
        }
        return { emoji: '📍', text: label.trim() };
    }

    function parseSceneMap(text) {
        if (!text) return null;
        const wrap = text.match(/<scene-map>([\s\S]*?)<\/scene-map>/i);
        const body = wrap ? wrap[1] : text;

        let backdropPrompt = '';
        const landmarks = [];

        // 一行一個 [tag|...] 標籤
        const re = /\[([^\|\]]+)\|([^\]]+)\]/g;
        let m;
        while ((m = re.exec(body)) !== null) {
            const tag = m[1].trim();
            const rest = m[2];
            const fields = rest.split('|').map(s => s.trim());

            if (/底板/.test(tag)) {
                if (fields[0]) backdropPrompt = fields[0];
                continue;
            }
            if (/物件/.test(tag)) {
                // 偵測格式：第 1 欄開頭是 emoji → 新格式 (emoji+短名 | 長描述 | 座標)
                //                       否則 → 舊格式 (英文keyword | emoji+短名 | 座標)
                const EMOJI_HEAD = /^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}\u{2300}-\u{23FF}]/u;
                const isNewFormat = EMOJI_HEAD.test(fields[0] || '');

                let labelRaw, description, coords;
                if (isNewFormat) {
                    labelRaw = fields[0] || '';
                    description = fields[1] || '';
                    coords = fields[2] || '';
                } else {
                    // 舊存檔相容：第 1 欄是英文 keyword、第 2 欄是 emoji+短名
                    labelRaw = fields[1] || fields[0] || '';
                    description = '';
                    coords = fields[2] || '';
                }

                const xMatch = coords.match(/x\s*[:：]\s*(\d+(?:\.\d+)?)/i);
                const yMatch = coords.match(/y\s*[:：]\s*(\d+(?:\.\d+)?)/i);
                if (!xMatch || !yMatch) continue;

                const { emoji, text } = _splitEmoji(labelRaw);
                landmarks.push({
                    label: text || labelRaw,
                    emoji: emoji,
                    description: description,
                    x: Math.max(0, Math.min(100, parseFloat(xMatch[1]))),
                    y: Math.max(0, Math.min(100, parseFloat(yMatch[1])))
                });
            }
        }

        if (!backdropPrompt && landmarks.length === 0) return null;
        return {
            backdropPrompt,
            backdropUrl: '',
            landmarks,
            generatedAt: Date.now()
        };
    }

    // 主入口：為某個 facility 生 sceneMap（走副模型，省主模型 token）
    async function generateForFacility(zoneId, facKey, progressCb) {
        if (!win.WORLD_RUNTIME || !win.OS_API || !win.OS_SETTINGS) {
            if (progressCb) progressCb('error', '依賴未就緒');
            return null;
        }
        if (typeof win.OS_API.chatSecondary !== 'function') {
            if (progressCb) progressCb('error', '副模型未啟用，請至「設置 → ⚡ 副模型」配置');
            return null;
        }
        const zone = win.WORLD_RUNTIME.getZone(zoneId);
        if (!zone || !zone.facilities || !zone.facilities[facKey]) {
            if (progressCb) progressCb('error', '找不到設施');
            return null;
        }
        const facility = zone.facilities[facKey];

        if (progressCb) progressCb('ai', '正在勘景...');

        const prompt = buildPrompt(facility, zone);
        let messages;
        try {
            messages = await win.OS_API.buildContext(prompt, 'map_scene_gen');
        } catch (e) {
            if (progressCb) progressCb('error', 'Context 構建失敗');
            return null;
        }

        return new Promise((resolve) => {
            let processed = false;
            // 走 chatSecondary：簽名 (messages, onChunk, onFinish, onError)
            win.OS_API.chatSecondary(messages, null, async (responseText) => {
                if (processed) return;
                if (!parseSceneMap(responseText)) {
                    // 流式可能還沒完整，等收尾再判失敗
                    if (responseText && responseText.length > 100 && /<\/scene-map>/i.test(responseText)) {
                        processed = true;
                        console.error('[SceneMap] 解析失敗，原始輸出:', responseText.substring(0, 500));
                        if (progressCb) progressCb('error', '解析失敗');
                        resolve(null);
                    }
                    return;
                }
                processed = true;
                const sceneMap = await applySceneMapFromText(zoneId, facKey, responseText);
                if (progressCb) progressCb(sceneMap ? 'done' : 'error', sceneMap ? '勘景完成' : '存檔失敗');
                resolve(sceneMap);
            }, (err) => {
                if (processed) return;
                processed = true;
                console.error('[SceneMap] AI 失敗:', err);
                if (progressCb) progressCb('error', 'AI 呼叫失敗');
                resolve(null);
            });
        });
    }

    // 給「探索此地」合併呼叫用：拿某設施的 scene-map 生成 prompt（可拼進主模型的掃描 prompt，一次呼叫同時要小地圖+路人）
    function buildScenePrompt(zoneId, facKey) {
        const zone = win.WORLD_RUNTIME && win.WORLD_RUNTIME.getZone ? win.WORLD_RUNTIME.getZone(zoneId) : null;
        if (!zone || !zone.facilities || !zone.facilities[facKey]) return '';
        return buildPrompt(zone.facilities[facKey], zone);
    }
    // 從任意 AI 回覆文字抽 <scene-map> → 解析 + 補底板圖 + 存檔。回 sceneMap 或 null（抽不到就 null，不報錯）。
    async function applySceneMapFromText(zoneId, facKey, responseText) {
        const zone = win.WORLD_RUNTIME && win.WORLD_RUNTIME.getZone ? win.WORLD_RUNTIME.getZone(zoneId) : null;
        if (!zone || !zone.facilities || !zone.facilities[facKey]) return null;
        const facility = zone.facilities[facKey];
        const sceneMap = parseSceneMap(responseText);
        if (!sceneMap) return null;
        console.log(`[SceneMap] ✅ ${facility.name}：底板="${sceneMap.backdropPrompt}", 地標 ${sceneMap.landmarks.length} 個`);
        // 開了補圖開關 → 補底板（走「小地圖桶」imgType:'map'，俯視去人物）。NAI 回 blob: 轉 data URL 才能存進世界 DB
        if (isBackdropAuto() && sceneMap.backdropPrompt && win.OS_IMAGE_MANAGER && typeof win.OS_IMAGE_MANAGER.generateBackgroundAsync === 'function') {
            try {
                const fullPrompt = sceneMap.backdropPrompt;   // 風格詞在「小地圖 TAB」底詞欄，不再暗拼固定詞
                let _bu = await win.OS_IMAGE_MANAGER.generateBackgroundAsync(fullPrompt, { width: 1024, height: 512, imgType: 'map' }) || '';
                if (_bu && _bu.indexOf('blob:') === 0) {
                    try { const _b = await (await fetch(_bu)).blob(); _bu = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result)); fr.onerror = () => r(''); fr.readAsDataURL(_b); }); } catch (e) {}
                }
                sceneMap.backdropUrl = _bu;
            } catch (e) { console.warn('[SceneMap] 底板圖生成失敗:', e); }
        }
        // 寫入 facility（持久化）
        if (typeof win.WORLD_RUNTIME.saveFacilitySceneMap === 'function') {
            const ok = await win.WORLD_RUNTIME.saveFacilitySceneMap(zoneId, facKey, sceneMap);
            return ok ? sceneMap : null;
        }
        facility.sceneMap = sceneMap;   // 降級：不持久化
        return sceneMap;
    }

    win.SCENE_MAP_ENGINE = {
        BACKDROP_AUTO_KEY,
        isBackdropAuto,
        setBackdropAuto,
        parseSceneMap,
        buildScenePrompt,
        applySceneMapFromText,
        generateForFacility
    };
})();
