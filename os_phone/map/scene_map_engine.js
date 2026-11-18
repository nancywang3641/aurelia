// ----------------------------------------------------------------
// [檔案] scene_map_engine.js (V1.0 - Stage 3: 設施場景地標生成)
// 路徑：scripts/os_phone/map/scene_map_engine.js
// 職責：
//   1. 進設施時即時 call AI 出 <scene-map> 標籤（底板 prompt + 3-5 個地標物件 + x/y 座標）
//   2. parse 標籤 → 寫進 facility.sceneMap → 給 map_core 渲染 + 避撞
//   3. 開關控制是否照圖片設置補底板圖（預設關，省流量）
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入場景地標引擎 (V1.0)...');
    const win = window.parent || window;

    const BACKDROP_AUTO_KEY = 'aurelia_scene_backdrop_auto';

    // 🗑️ 寫死的俯視底板風格詞綴已刪（Rae 定案）：風格詞她自己放「小地圖 TAB」的底詞欄，
    //    要改也在那裡改——這裡只送 AI 給的 backdropPrompt，不再暗拼任何固定詞。

    // ✂️ 白邊自動裁切：AI 常把底板畫成「飄在素色底上的物件」（白邊/留白）——顯示端是
    //    background-size:100% 100%，白邊會吃掉可用面積，亮度遮罩還會把白邊誤判成可站地板。
    //    做法：從四邊往內掃，整排/整列顏色近乎一致（各通道極差 <26）就裁掉；每邊最多裁 22%、
    //    裁剩不到一半就放棄（防呆），失敗一律回原圖。
    async function trimUniformBorder(url) {
        try {
            const img = await new Promise((res, rej) => {
                const i = new Image();
                if (!/^data:/.test(String(url))) i.crossOrigin = 'anonymous';
                i.onload = () => res(i); i.onerror = rej; i.src = url;
            });
            const W = img.naturalWidth, H = img.naturalHeight;
            if (!W || !H) return url;
            const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
            const cx = cv.getContext('2d', { willReadFrequently: true });
            cx.drawImage(img, 0, 0);
            const d = cx.getImageData(0, 0, W, H).data;
            const TOL = 26, STEP = 7;
            const lineUniform = (horizontal, idx) => {
                let mn = [255, 255, 255], mx = [0, 0, 0];
                const len = horizontal ? W : H;
                for (let k = 0; k < len; k += STEP) {
                    const p = horizontal ? (idx * W + k) * 4 : (k * W + idx) * 4;
                    for (let c = 0; c < 3; c++) { const v = d[p + c]; if (v < mn[c]) mn[c] = v; if (v > mx[c]) mx[c] = v; }
                }
                return (mx[0] - mn[0]) < TOL && (mx[1] - mn[1]) < TOL && (mx[2] - mn[2]) < TOL;
            };
            let top = 0, bottom = H - 1, left = 0, right = W - 1;
            const maxY = Math.floor(H * 0.22), maxX = Math.floor(W * 0.22);
            while (top < maxY && lineUniform(true, top)) top++;
            while ((H - 1 - bottom) < maxY && lineUniform(true, bottom)) bottom--;
            while (left < maxX && lineUniform(false, left)) left++;
            while ((W - 1 - right) < maxX && lineUniform(false, right)) right--;
            if (top === 0 && left === 0 && bottom === H - 1 && right === W - 1) return url;   // 沒白邊
            const w2 = right - left + 1, h2 = bottom - top + 1;
            if (w2 < W * 0.5 || h2 < H * 0.5) return url;   // 裁過頭=圖本身就素色，放棄
            const out = document.createElement('canvas'); out.width = w2; out.height = h2;
            out.getContext('2d').drawImage(cv, left, top, w2, h2, 0, 0, w2, h2);
            return out.toDataURL('image/png');
        } catch (e) { return url; }
    }

    // 🧭 灰度草稿（小地圖那一列走自訂接口、收得到參考圖時才用）：
    //   AI 寫的地標座標是照「正上方的平面圖」寫的，底圖畫歪地標就對不上。GPT 這種讀得懂話的模型，
    //   給它一張「哪裡有東西」的灰度草稿，再講明方塊只標位置，它會照位置畫、東西之間自己接起來（11-15 實測她：「GPT 比較好」）。
    //   ComfyUI 不走這條：Anima 照方塊畫會一格一格割裂，她看過說還是沒草稿好。
    //   草稿只拿地標的 x/y 畫同大小的柔邊方塊，不用任何素材；畫風、視角那些字照舊歸小地圖那一列的畫風包，這裡只講草稿怎麼看。
    // 畫布 3:2（GPT 只出 1536×1024 這種比例），地標排在中間 2:1 那一條，畫完上下各裁 1/8 就剛好是小地圖的 2:1。
    const GUIDE_W = 1536, GUIDE_H = 1024, GUIDE_TOP = 0.125, GUIDE_BLOCK = 0.15;
    function _guideXY(lm) {   // 地標座標（小地圖 0-100）→ 草稿上的百分比
        return { x: lm.x, y: (GUIDE_TOP + (1 - 2 * GUIDE_TOP) * lm.y / 100) * 100 };
    }
    function _guideLead(landmarks) {
        const spots = landmarks.map((lm, i) => {
            const p = _guideXY(lm);
            return (i + 1) + ') ' + (lm.label || 'an object') + ' at ' + Math.round(p.x) + '% from the left and ' + Math.round(p.y) + '% from the top';
        }).join('; ');
        return 'Image {n} is only a layout guide, not a picture to copy: on a dark background, each soft light-grey blob marks where one object of this place stands. '
            + 'Blobs: ' + spots + '. '
            + 'The names only tell you which object each blob is; never write them or any other text in the picture. '
            + 'Put each object on its blob with its own natural shape and size instead of copying the blob, '
            + 'connect everything into one believable, continuous place with floor details, paths and small props in between, '
            + 'and do not draw the blobs themselves.';
    }
    async function _guideRef(landmarks) {
        const cv = document.createElement('canvas'); cv.width = GUIDE_W; cv.height = GUIDE_H;
        const g = cv.getContext('2d');
        g.fillStyle = 'rgb(20,20,20)'; g.fillRect(0, 0, GUIDE_W, GUIDE_H);
        const s = GUIDE_W * GUIDE_BLOCK, r = 20;
        g.fillStyle = 'rgb(200,200,200)';
        g.shadowColor = 'rgb(200,200,200)'; g.shadowBlur = 18;   // 柔邊用陰影做：iPhone 的畫布不一定認 filter
        landmarks.forEach(lm => {
            const p = _guideXY(lm), cx = GUIDE_W * p.x / 100, cy = GUIDE_H * p.y / 100;
            const x = cx - s / 2, y = cy - s / 2;
            g.beginPath();
            g.moveTo(x + r, y); g.lineTo(x + s - r, y); g.quadraticCurveTo(x + s, y, x + s, y + r);
            g.lineTo(x + s, y + s - r); g.quadraticCurveTo(x + s, y + s, x + s - r, y + s);
            g.lineTo(x + r, y + s); g.quadraticCurveTo(x, y + s, x, y + s - r);
            g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
            g.fill();
        });
        const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
        return blob ? { name: 'the layout guide', kind: 'layout', lead: _guideLead(landmarks), blob: blob } : null;
    }
    // 畫好的圖裁掉上下各 1/8，留下跟草稿上地標那一條對齊的 2:1（照比例裁，接口回別的尺寸也對得上）
    async function _cropGuideBand(url) {
        try {
            const img = await new Promise((res, rej) => {
                const i = new Image();
                if (!/^data:/.test(String(url))) i.crossOrigin = 'anonymous';
                i.onload = () => res(i); i.onerror = rej; i.src = url;
            });
            const W = img.naturalWidth, H = img.naturalHeight;
            if (!W || !H) return url;
            const top = Math.round(H * GUIDE_TOP), h = H - top * 2;
            const out = document.createElement('canvas'); out.width = W; out.height = h;
            out.getContext('2d').drawImage(img, 0, top, W, h, 0, 0, W, h);
            return out.toDataURL('image/png');
        } catch (e) { console.warn('[SceneMap] 草稿版底圖裁切失敗，用原圖:', e); return url; }
    }

    function isBackdropAuto() {
        try { return localStorage.getItem(BACKDROP_AUTO_KEY) === '1'; } catch (e) { return false; }
    }
    // 回 true／false：存不下來時 lsSet 自己跳提示，設置頁拿它決定要不要報「已儲存」
    function setBackdropAuto(v) {
        return win.AUI.lsSet(BACKDROP_AUTO_KEY, v ? '1' : '0', '小地圖自動補底圖的開關');
    }

    // PROMPT 模板（用戶提供的場景地圖規範 + 補一些避撞區域提示）
    const PROMPT_TEMPLATE = `[系統指令：場景地標生成]
你是當前世界的場景設計 AI。請為設施「{FAC_NAME}」（{FAC_DESC}，位於{ZONE_NAME}）生成一份小場景地標清單。
世界觀請參考上文 [World Info]。

## 🗺️ 場景地圖生成規則

### 1. 核心格式
請務必包含 \`<scene-map>\` 開始和結束標籤。

**必須包含的兩種元素：**

{BASEPLATE_RULE}

**(2) 地標物件（地圖上的物體，人物 ≠ 地標物件，不可輸出人物）**
{LANDMARK_FORMAT}{PARTS_RULE}

### 2. 坐標系統說明
(0,0) 左上角  -------  (100,0) 右上角
    |                       |
    |      (50,50) 中心     |
    |                       |
(0,100) 左下角 ------- (100,100) 右下角

### 3. 生成邏輯要求
{CULTURE_RULE}- **底板一致性**：底板必須符合該世界觀（不可中世紀世界給出捷運站，不可末日廢土給出皇家城堡）
- **物件數量**：3-5 個具有代表性的地標物件
- **布局合理**：物件不要全部重疊，根據描述合理分布在 0-100 平面上
- **小人活動區留白**：小人會在 y=60~92 範圍走動，重要可看的物件可以放在 y<60 上半部；y=60-92 範圍盡量分散別塞太密（避免擋小人路）
- **每個地標的中文描述開頭請帶一個 emoji**（如 🪧🏰🌸🍷🛏️📚🪑🍽️），讓玩家一眼識別
- **⚠ 兩欄分工嚴格**：
  - 短名（第 1 欄）：emoji + 4-6 字純名詞，例：🪑圓桌 / 🪧任務板 / 🔥壁爐 / 🛏️睡墊。禁止敘述句、修飾語
  - 長描述（第 2 欄）：10-25 字氛圍描寫，可有形容詞、場景細節、人群動態，例：「布告板附近擠滿了冒險者人群」、「爐火劈啪作響，幾隻獵犬伏在前方」
  - 短名是「標題」，長描述是「點擊浮窗內文」，別把長描述塞進短名

### ✅ 輸出範例（底板行只看格式骨架，內容按世界觀自己寫）
<scene-map>
{BASEPLATE_EXAMPLE}
{EXAMPLE_LANDMARKS}
</scene-map>

只輸出 <scene-map>...</scene-map> 包裹的內容，不要其他文字、不要 markdown 包裹。`;

    // 🔀 底板詞格式按「小地圖桶」當前接口自動切（Rae：Anima 吃自然語言、SDXL 反而不能吃）：
    //    NAI / ComfyUI-SDXL(checkpoint) → 逗號標籤；Anima / Flux / 自訂接口 / 酒館原生 → 自然語言句子。
    //    按下探索那一刻現判，切接口即時生效，不用改設定。
    function _mapPromptStyle() {
        try {
            const IM = win.OS_IMAGE_MANAGER;
            const svc = (IM && typeof IM.serviceForUse === 'function') ? IM.serviceForUse('map') : ((IM && typeof IM.serviceFor === 'function') ? IM.serviceFor('map') : '');
            if (svc === 'novelai') return 'tags';
            if (svc === 'comfyui_direct') {
                const cfg = (typeof IM.comfyCfgForUse === 'function') ? IM.comfyCfgForUse('map') : ((typeof IM._comfyCfgFor === 'function') ? IM._comfyCfgFor('map') : ((IM.config && IM.config.comfyuiDirect) || {}));
                const mt = cfg.modelType;
                return (mt === 'anima' || mt === 'flux') ? 'natural' : 'tags';   // SDXL(checkpoint)=標籤
            }
            return 'natural';   // 自訂接口 / tavern_sd：自然語言比標籤好
        } catch (e) { return 'tags'; }
    }
    const BASEPLATE_RULE_TAGS =
`**(1) 地圖底板（用於生成背景圖）**
格式：\`[地標底板|英文標籤關鍵詞]\`
說明：用「逗號分隔的英文標籤(tag)」描述小地圖底背景與布局；家具物件只用九宮格方位詞（top/bottom/left/right/center）粗描；開頭第一個詞＝文化/時代畫風詞。`;
    const BASEPLATE_RULE_NATURAL =
`**(1) 地圖底板（用於生成背景圖）**
格式：\`[地標底板|一句完整的英文自然語言描述]\`
說明：用「一句完整的英文自然語言」描述這個場所的正俯視畫面：這是什麼場所、地面材質、主要家具大概在哪個方位（上/下/左/右/中）；**不要**逗號堆疊 tag。句子開頭一樣先點名文化/時代畫風。`;
    const BASEPLATE_EX_TAGS    = '[地標底板|文化畫風詞, 場所類型 interior, 家具A at top, 家具B on the left, floor material]';
    const BASEPLATE_EX_NATURAL = '[地標底板|A 文化畫風 場所類型 seen from directly above, with 家具A along the top, 家具B on the left, and 地面材質 floor]';
    // 模板裡按世界切換的幾段：生圖世界照舊；「直接畫」的世界（worldMap.painted）小地圖由 scene_painter.js 畫，
    //   底板那行改成地面＋室內外，每個地標多一欄種類，沒有生圖句所以文化畫風那條不給。
    const CULTURE_RULE = `- **🌏 文化畫風必寫明（重要）**：\`[地標底板|...]\` 的英文關鍵詞**開頭第一個詞就要標出本世界的文化／時代畫風**，別讓它預設成歐洲中世紀。依上文世界觀判斷後選對應詞：
  - 中式武俠／仙俠／古代中國 → \`ancient chinese, wuxia, traditional chinese architecture\`
  - 現代／都市 → \`modern, contemporary\`；未來科幻／賽博 → \`sci-fi, cyberpunk\`
  - 西方奇幻／中世紀 → \`medieval european fantasy\`；末日廢土 → \`post-apocalyptic wasteland\`；日式和風 → \`japanese, traditional japanese\`
  - 例：武俠酒館要寫 \`ancient chinese wuxia tavern, wooden...\` 而**不是** \`fantasy tavern\`。抓不準寧可多寫文化詞也別留白。
`;
    const LANDMARK_FORMAT_IMG =
`格式：\`[地標物件|emoji+中文短名|長描述|x:0-100,y:0-100]\`
- 第 1 欄：emoji + 中文短名（emoji 開頭，短名 4-6 字純名詞，例：🪧任務佈告板）→ 永遠顯示在地標下方
- 第 2 欄：長描述（一句話描寫此處氛圍 / 細節，10-25 字）→ 玩家點擊地標才彈出
- 第 3 欄：x/y 座標（0-100）`;
    function _landmarkFormatPainted() {
        const kinds = (win.SCENE_PAINTER && win.SCENE_PAINTER.KINDS || []).join(', ');
        return `格式：\`[地標物件|emoji+中文短名|長描述|x:0-100,y:0-100|種類]\`
- 第 1 欄：emoji + 中文短名（emoji 開頭，短名 4-6 字純名詞，例：🪧任務佈告板）→ 永遠顯示在地標下方
- 第 2 欄：長描述（一句話描寫此處氛圍 / 細節，10-25 字）→ 玩家點擊地標才彈出
- 第 3 欄：x/y 座標（0-100）
- 第 4 欄：種類，程式照這欄畫出那件東西的樣子。從這些英文照抄一個最接近的：${kinds}。都不像就寫 spot`;
    }
    function _baseplateRulePainted() {
        const floors = (win.SCENE_PAINTER && win.SCENE_PAINTER.FLOOR_NAMES || []).join('、');
        return `**(1) 地面（程式照這行畫小地圖的地板）**
格式：\`[地標底板|地面|室內或露天]\`
說明：這張小地圖不生圖，由程式照你給的地面與地標物件畫成正上方俯視的平面圖。地面從這些照抄一個：${floors}；第三欄寫「室內」或「露天」。`;
    }
    const EXAMPLE_LANDMARKS_IMG =
`[地標物件|🔥壁爐|爐火劈啪作響，幾隻獵犬伏在前方烤火|x:80,y:35]
[地標物件|🍻吧檯|老闆正擦拭著黃銅酒杯，目光犀利地掃視來客|x:50,y:25]
[地標物件|🪑圓桌|散落著啤酒漬的木桌，三張舊木凳子圍著|x:25,y:75]
[地標物件|🪧任務佈告板|布告板附近擠滿了冒險者人群|x:15,y:30]`;
    const EXAMPLE_LANDMARKS_PAINTED =
`[地標物件|🔥壁爐|爐火劈啪作響，幾隻獵犬伏在前方烤火|x:80,y:35|fireplace]
[地標物件|🍻吧檯|老闆正擦拭著黃銅酒杯，目光犀利地掃視來客|x:50,y:25|counter]
[地標物件|🪑圓桌|散落著啤酒漬的木桌，三張舊木凳子圍著|x:25,y:75|round_table]
[地標物件|🪧任務佈告板|布告板附近擠滿了冒險者人群|x:15,y:30|board]
[裝飾|emoji+短名|x:0-100,y:0-100|數量]
（裝飾照這個骨架再寫 6 到 12 行；零件庫沒有的東西，各加一段 <draw name="短名">…</draw>）`;
    // 現在這個聊天的世界是不是「直接畫」的（世界地圖由 world_painter 畫、不生圖）
    function isPaintedWorld() {
        try {
            const w = win.WORLD_RUNTIME && win.WORLD_RUNTIME.getCurrentWorld ? win.WORLD_RUNTIME.getCurrentWorld() : null;
            return !!(w && w.worldMap && w.worldMap.painted && win.SCENE_PAINTER);
        } catch (e) { return false; }
    }
    // 直接畫的世界：地標之外再列一批裝飾，讓小地圖不空（沒名牌、點不開）；零件照 (3) 一起畫
    const DECOR_RULE =
`**(2.5) 裝飾（讓這個地方看起來有人在用、不空）**
格式：\`[裝飾|emoji+中文短名|x:0-100,y:0-100|數量]\`
- 再列 6 到 12 行：地標以外本來就會在這裡的東西——小家具、雜物、燈、植物、地上的東西、桌上的東西、牆邊的東西。不要跟地標物件重複。
- 數量：同一種東西在這一帶擺幾個（1 到 6），程式會在那個位置附近撒開。
- 裝飾不會顯示名字，玩家也點不開，所以不用寫描述。
- 分散在整個平面上，下方正中間是入口，別堵住。`;
    // 直接畫的世界用哪個風格（fantasy/wuxia/…，world_painter 定的）：零件庫按風格分，同名東西在武俠和科幻各一份
    function paintedStyle() {
        try {
            const w = win.WORLD_RUNTIME && win.WORLD_RUNTIME.getCurrentWorld ? win.WORLD_RUNTIME.getCurrentWorld() : null;
            return (w && w.worldMap && w.worldMap.painted && w.worldMap.painted.style) || 'fantasy';
        } catch (e) { return 'fantasy'; }
    }

    function buildPrompt(facility, zone) {
        const painted = isPaintedWorld();
        const natural = _mapPromptStyle() === 'natural';
        return PROMPT_TEMPLATE
            .replace('{BASEPLATE_RULE}', painted ? _baseplateRulePainted() : (natural ? BASEPLATE_RULE_NATURAL : BASEPLATE_RULE_TAGS))
            .replace('{BASEPLATE_EXAMPLE}', painted ? '[地標底板|地面|室內或露天]' : (natural ? BASEPLATE_EX_NATURAL : BASEPLATE_EX_TAGS))
            .replace('{LANDMARK_FORMAT}', painted ? _landmarkFormatPainted() : LANDMARK_FORMAT_IMG)
            .replace('{PARTS_RULE}', painted ? '\n\n' + DECOR_RULE + '\n\n' + win.SCENE_PAINTER.partsRule(paintedStyle()) : '')
            .replace('{CULTURE_RULE}', painted ? '' : CULTURE_RULE)
            .replace('{EXAMPLE_LANDMARKS}', painted ? EXAMPLE_LANDMARKS_PAINTED : EXAMPLE_LANDMARKS_IMG)
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
            return { emoji: m[1], text: label.substring(m[1].length).replace(/^[️‍]+/, '').trim() };   // 🗄️ 這種帶變體符號的，剩下的看不見字元不留在名字裡
        }
        return { emoji: '📍', text: label.trim() };
    }

    function parseSceneMap(text) {
        if (!text) return null;
        const wrap = text.match(/<scene-map>([\s\S]*?)<\/scene-map>/i);
        const body = wrap ? wrap[1] : text;

        let backdropPrompt = '';
        let ground = null;
        const decor = [];
        const landmarks = [];

        // 一行一個 [tag|...] 標籤
        const re = /\[([^\|\]]+)\|([^\]]+)\]/g;
        let m;
        while ((m = re.exec(body)) !== null) {
            const tag = m[1].trim();
            const rest = m[2];
            const fields = rest.split('|').map(s => s.trim());

            if (/裝飾/.test(tag)) {   // 直接畫的世界才會有：[裝飾|emoji+短名|x:..,y:..|數量]
                const ci = fields.findIndex(f => /x\s*[:：]\s*\d/i.test(f) && /y\s*[:：]\s*\d/i.test(f));
                if (ci < 0) continue;
                const xm = fields[ci].match(/x\s*[:：]\s*(\d+(?:\.\d+)?)/i), ym = fields[ci].match(/y\s*[:：]\s*(\d+(?:\.\d+)?)/i);
                const lab = _splitEmoji(fields[0] || '').text || String(fields[0] || '').trim();
                const nField = fields.slice(ci + 1).find(f => /^\d+/.test(f));
                if (lab) decor.push({ label: lab, x: Math.max(0, Math.min(100, parseFloat(xm[1]))), y: Math.max(0, Math.min(100, parseFloat(ym[1]))), n: Math.max(1, Math.min(6, parseInt(nField, 10) || 1)) });
                continue;
            }
            if (/底板/.test(tag)) {
                if (fields[0]) backdropPrompt = fields[0];
                // 「直接畫」的世界這行是 地面|室內或露天（scene_painter 用）；生圖世界不讀，照舊當生圖句
                const SP = win.SCENE_PAINTER, fk = (SP && isPaintedWorld()) ? SP.floorKey(fields[0]) : '';
                if (fk) ground = { floor: fk, indoor: !/露天|戶外|室外|outdoor/i.test(fields[1] || '') };
                continue;
            }
            if (/物件/.test(tag)) {
                // 偵測格式：第 1 欄開頭是 emoji → 新格式 (emoji+短名 | 長描述 | 座標)
                //                       否則 → 舊格式 (英文keyword | emoji+短名 | 座標)
                const EMOJI_HEAD = /^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}\u{2300}-\u{23FF}]/u;
                const isNewFormat = EMOJI_HEAD.test(fields[0] || '');

                let labelRaw, description, coords;
                let kind = '';
                if (isNewFormat) {
                    labelRaw = fields[0] || '';
                    description = fields[1] || '';
                    coords = fields[2] || '';
                    // 第 4 欄種類（只有「直接畫」的世界會要；沒有就讓 scene_painter 從名字猜）
                    const k = String(fields[3] || '').toLowerCase().replace(/[^a-z_]/g, '');
                    if (k && win.SCENE_PAINTER && (win.SCENE_PAINTER.KINDS.indexOf(k) >= 0 || k === 'spot')) kind = k;
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
                const lm = {
                    label: text || labelRaw,
                    emoji: emoji,
                    description: description,
                    x: Math.max(0, Math.min(100, parseFloat(xMatch[1]))),
                    y: Math.max(0, Math.min(100, parseFloat(yMatch[1])))
                };
                if (kind) lm.kind = kind;
                landmarks.push(lm);
            }
        }

        if (!backdropPrompt && landmarks.length === 0) return null;
        const out = {
            backdropPrompt,
            backdropUrl: '',
            landmarks,
            generatedAt: Date.now()
        };
        if (ground) { out.ground = ground; out.backdropPrompt = ''; }   // 地面那行不是生圖句，別拿去補底板圖
        if (decor.length) out.decor = decor;
        return out;
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
        // 直接畫的世界：同一份回覆裡新畫的零件存進零件庫（之後任何地點再出現同名東西直接用，不再叫模型畫）
        if (isPaintedWorld() && win.SCENE_PAINTER && typeof win.SCENE_PAINTER.parseDrawBlocks === 'function') {
            const parts = win.SCENE_PAINTER.parseDrawBlocks(responseText), st = paintedStyle();
            const names = Object.keys(parts);
            for (const nm of names) await win.SCENE_PAINTER.libPut(st, nm, parts[nm]);
            if (names.length) console.log(`[SceneMap] 🧩 新零件 ${names.length} 件：${names.join('、')}`);
        }
        console.log(`[SceneMap] ✅ ${facility.name}：底板="${sceneMap.backdropPrompt}", 地標 ${sceneMap.landmarks.length} 個`);
        // 開了補圖開關 → 補底板（走「小地圖桶」imgType:'map'，俯視去人物）。NAI 回 blob: 轉 data URL 才能存進世界 DB
        //   「直接畫」的世界不補：它的底板行是地面名，不是生圖句，小地圖由 scene_painter 畫
        if (isBackdropAuto() && !isPaintedWorld() && sceneMap.backdropPrompt && win.OS_IMAGE_MANAGER && typeof win.OS_IMAGE_MANAGER.generateBackgroundAsync === 'function') {
            try {
                const fullPrompt = sceneMap.backdropPrompt;   // 風格詞在「小地圖 TAB」底詞欄，不再暗拼固定詞
                const IM = win.OS_IMAGE_MANAGER;
                const _opts = { width: 1024, height: 512, imgType: 'map', use: 'map' };
                // 走自訂接口（收得到參考圖）＋有地標 → 帶灰度草稿，照草稿的 3:2 要圖
                const _guide = (sceneMap.landmarks.length && typeof IM.takesRefImages === 'function' && IM.takesRefImages('map'))
                    ? await _guideRef(sceneMap.landmarks) : null;
                if (_guide) { _opts._layoutRef = _guide; _opts.width = GUIDE_W; _opts.height = GUIDE_H; }
                let _bu = await IM.generateBackgroundAsync(fullPrompt, _opts) || '';
                if (_bu && _bu.indexOf('blob:') === 0) {
                    try { const _b = await (await fetch(_bu)).blob(); _bu = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result)); fr.onerror = () => r(''); fr.readAsDataURL(_b); }); } catch (e) {}
                }
                if (_bu && _guide) _bu = await _cropGuideBand(_bu);   // 🧭 裁回地標那一條（2:1）
                if (_bu) _bu = await trimUniformBorder(_bu);   // ✂️ AI 出白邊就裁掉（沒白邊原樣回）
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
        trimUniformBorder,   // console 診斷用：白邊裁切（回 dataURL）
        isBackdropAuto,
        setBackdropAuto,
        parseSceneMap,
        buildScenePrompt,
        applySceneMapFromText,
        isPaintedWorld,
        paintedStyle
    };
})();
