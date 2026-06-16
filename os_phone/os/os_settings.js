// ----------------------------------------------------------------
// [檔案] os_settings.js (V6.0.0 - Aurelia Style, Sync Primary URL & Factory Reset)
// 職責：管理 PhoneOS 全域設定
// 修改：
// 1. 全面套用 Aurelia 核心 CSS (拿鐵色/流金/磨砂玻璃)，統一系統視覺。
// 2. 副模型新增「同步主模型 API 端點」拉桿，自動繼承 URL/Key。
// 3. 🔥 新增：核彈級「一鍵格式化」雙重確認清空數據功能。
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入系統設置模塊 (V6.0.0 Aurelia Style & Sync & Reset)...');

    // 定義系統級樣式 (全面替換為 Aurelia 咖啡流金風格)

    const targetDoc = (window.parent && window.parent.document) ? window.parent.document : document;
    if (!targetDoc.getElementById('os-settings-css')) {
    } else {
        targetDoc.getElementById('os-settings-css').innerHTML = appStyle;
    }

    const LLM_STORAGE_KEY = 'os_global_config';
    const SEC_LLM_STORAGE_KEY = 'os_secondary_llm_config';
    const IMG_STORAGE_KEY = 'os_image_config';
    const MINIMAX_STORAGE_KEY = 'os_minimax_config';
    const CLAUDE_ROOM_STORAGE_KEY = 'os_claude_room_config';
    
    // --- 讀取 LLM 設置 ---
    function loadLlmConfig() {
        let saved = localStorage.getItem(LLM_STORAGE_KEY);
        let config = { 
            url: '', key: '', model: 'gemini-3.1-pro-preview', 
            useSystemApi: true, stProfileId: '', 
            directMode: false, enableStreaming: false, disableTyping: false,
            enableSummaryOnly: false,
            maxTokens: 2000, temperature: 1.0, top_p: 1.0, frequency_penalty: 0, presence_penalty: 0,
            usePresetPrompts: false, presetName: ''
        };
        if (saved) { try { config = { ...config, ...JSON.parse(saved) }; } catch(e) {} }
        return config;
    }

    // --- 讀取副模型 LLM 設置 (含 syncWithPrimary) ---
    function loadSecLlmConfig() {
        let saved = localStorage.getItem(SEC_LLM_STORAGE_KEY);
        let config = {
            url: '', key: '', model: 'gemini-1.5-flash',
            useSystemApi: true, stProfileId: '', syncWithPrimary: true, // 🔥 預設開啟同步主模型
            directMode: false, enableStreaming: false, disableTyping: false,
            enableSummaryOnly: false,
            maxTokens: 1000, temperature: 1.0, top_p: 1.0, frequency_penalty: 0, presence_penalty: 0,
            usePresetPrompts: false, presetName: ''
        };
        if (saved) { try { config = { ...config, ...JSON.parse(saved) }; } catch(e) {} }
        return config;
    }

    // --- 讀取 Image 設置 ---
    function loadImageConfig() {
        let saved = localStorage.getItem(IMG_STORAGE_KEY);
        let config = {
            service: 'pollinations',
            serviceInanimate: 'pollinations', // 死物桶：背景/物品/寵物
            serviceLiving: 'pollinations',    // 活物桶：角色/插圖
            imgSourceSynced: true,            // 背景來源是否同步角色（true＝沿用角色接口）
            pollinations: {
                url: 'https://gen.pollinations.ai/image',
                apiKey: '',
                model: 'zimage',
                size: '512x512',
                models: {
                    'flux': 'Flux Schnell (0.001p)',
                    'zimage': 'Z-Image Turbo (0.002p)',
                    'flux-2-dev': 'FLUX.2 Dev [Alpha] (0.001p)',
                    'imagen-4': 'Imagen 4 [Alpha] (0.0025p)',
                    'grok-imagine': 'Grok Imagine [Alpha] (0.0025p)',
                    'klein': 'FLUX.2 Klein 4B (0.01p)',
                    'gptimage': 'GPT Image 1 Mini (高消耗)',
                    'klein-large': 'FLUX.2 Klein 9B (0.015p)'
                },
                charBasePrompt: 'anime style, 2d, cel shading, flat color, illustration, high quality, best quality, no photorealistic, no 3d, clean lines',
                charNegPrompt: 'bad anatomy, extra limbs, disfigured, blurry, low quality, worst quality, watermark, text',
            },
            novelai: {
                token: '',
                url: 'https://image.novelai.net/ai/generate-image',
                model: 'nai-diffusion-3',
                capFreeSize: true,   // 🛡️ 防超免費尺寸（防誤扣 Anlas）
                sampler: 'k_euler_ancestral',
                scale: 5,
                steps: 28,
                ucPreset: 1,
                qualityToggle: true,
                smea: true,
                smeaDyn: false,
                charBasePrompt: '',
                charNegPrompt: '',
                itemBasePrompt: '',
                itemNegPrompt: '',
                naiPresets: []
            },
            sceneGen: {
                enabled: false,
                promptStyle: 'auto',
                size: '1024x1024',

                sceneBasePrompt: '',
                sceneNegPrompt: 'worst quality, low quality, blurry, watermark, text, signature',
                specPrompt: `WHEN TO INSERT A SCENE
- Location changes or a new environment is established
- Significant emotional shift or dramatic turning point
- New character introduced with notable appearance
- Action, combat, or NSFW scene begins

PROMPT RULES (Danbooru-style tags, comma-separated, single line)

TAG ORDER:
1. Subject count: 1girl / 2boys / 1boy 1girl / etc.
   For 2+ characters: add one prose lock sentence describing spatial positions.
   e.g.: 2girls, a silver-haired girl on the left faces a dark-haired girl on the right,
2. Per character — use AND to separate multiple characters:
   [(adult:1.5), position, skin_tone, physique, eye_color, hair_desc, clothing, pose, expression]
3. Interaction / relationship tags (written outside character blocks)
4. Environment + lighting + camera: location, time_of_day, shot_type, angle

MULTI-CHARACTER RULES
- AND blocks for up to 2 focal characters only.
- 3+ characters: pick 2 focal, demote the rest to background_characters, depth_of_field.
- Give each focal character equal tag detail — do not simplify one to save space.
- Close contact or NSFW: remove left_side / right_side spatial tags.
- Always write (adult:1.5) as the very first tag inside each character block.

SHOT TYPES
Calm / dialogue : bust_shot or medium_shot, from_side or from_front
Action          : dynamic_angle, motion_blur, dutch_angle
Intimate / NSFW : close-up, from_above or from_side — no spatial position tags

EXAMPLE "prompt" value:
"2girls, a pale-skinned girl on the left reaches toward a tanned girl on the right, [(adult:1.5), left_side, pale_skin, gentle_vibe, long_silver_hair, soft_bangs, white_dress, reaching_out, worried_expression] AND [(adult:1.5), right_side, tanned_skin, calm_vibe, short_dark_hair, no_bangs, casual_jacket, stepping_back, neutral_expression], tense_atmosphere, dramatic_moment, rainy_street, night, from_side, medium_shot, shallow_depth_of_field"`,
                specTemplates: [],
                extractEnabled: false,
                extractPrompt: `請依「最新這段正文」實際發生、看得到的畫面，輸出最多 2 張場景插圖。
- 只照正文「真的發生、畫得出來的畫面」畫，不要推理後續劇情、不要腦補角色心理或感情。
- 角色長相用你已知的角色狀態/設定(髮色、衣著等)，不要亂編；正文沒寫的外觀沿用設定。
- 純男場景(完全沒有女角)請在 prompt 內加上 male focus, masculine。
- 多人場景：每個 prompt 只描述一個角色、各自標籤分開寫，不要讓 A 的衣服長到 B 身上。
- 每張圖的 prompt 是該畫面的 Danbooru 英文標籤、逗號分隔、單行。
- 找不到適合入畫的畫面就不要硬湊(回空)。
（插圖的「擺放位置」與 scenes 格式由系統自動處理，你只要照下方規則給 after_paragraph 數字即可。）`,
                // 🏷️ 標籤版（NAI / Danbooru）：移植自 NAI Diffusion V4.5 五層系統範本（NSFW 全保留、具體範例已中性化成佔位防副模型照抄）
                extractPromptTags: `每張插圖的 "prompt" 用 NAI Diffusion V4.5 的 Danbooru 標籤格式（英文、逗號分隔、單行）。嚴格照五層順序：

第0層 人數＋防混淆鎖：prompt 最前面先放人數（1boy / 2boys / 1boy 1girl…）。2 人以上緊接一句英文短句，把各角色的關鍵特徵＋位置先鎖定，避免特徵互相污染。
第1層 外觀（防同臉，放 AND 區塊內）：每個焦點角色都要完整寫，禁止偷懶只詳寫第一個、第二個留空。每個角色區塊開頭固定 3 鎖 → [1] 年齡體型 (adult:1.5)/adult_male/young_adult　[2] 位置 left_side/right_side（NSFW 貼身時「不要」放位置 tag）　[3] 對比 膚色/髮色；接著完整描述、不可省略：氣質, 臉型, 體型, 眼型, 髮長, 髮型, 髮質, 瀏海, 特徵, 服裝, 表情。
第2層 動作/姿勢（放 AND 區塊內）。
第3層 互動（放 AND 區塊外）：貼身接觸用 same_height, bodies_intertwined 防身形縮小。
第4層 環境與鏡頭（放 AND 區塊外，鏡頭 tag「只能」放這層、絕不放進角色區塊）：場景, 時間, 光線, 鏡頭(from_side / bust_shot / medium_shot…)。

人群控制(3＋角色)：只挑 1~2 個焦點角色用 AND 區塊，其餘降級成 crowd, blurry_background, depth_of_field；絕不寫 3 個以上 AND 區塊。
鏡頭模式：平靜/SFW → standing/sitting, left_side/right_side, from_side, medium_shot/bust_shot；動作 → dynamic_pose, dynamic_angle, motion_blur；NSFW → nsfw 當第一個 tag，明確體位直接畫(missionary, mating_press, penetration…)，貼身零距離不放位置 tag。
🚫 表達「不接觸／有距離」鐵則（最常出包！）：畫圖 AI 看不懂否定句——寫 they do not touch / no contact 反而會讓它看到 touch 就把兩人畫在一起(黏一起、躺懷裡)。所以：①絕不用 do not touch / not touching / no contact 這類否定句。②要有距離就用肯定詞：standing apart, space between them, an arm's length apart, facing each other across a gap, at a distance, keeping distance。③遠距離互動(施法/遞物/指引)動詞用 pointing/channeling/directing/aiming … toward，禁用 envelops/touches/rests on/cups/cradles/leaning into 這種貼身詞(會被讀成親密)。④只有真的要親密/NSFW 才寫接觸詞(hug/embrace/in arms…)。

其它：純男場景(無女角)加 male focus, masculine；多人時每角色標籤分開寫、A 的衣服別長到 B 身上；★角色長相(髮色/瞳色/體型)一律以下方【角色外觀錨點】為權威，照填、不要漏、不要亂編，錨點沒列到的才沿用已知設定；找不到適合入畫的畫面就回空、不硬湊。

格式範例（[方括號]是佔位，照正文實際內容填，不要照抄方括號裡的字）：
SFW 2 人對話：2boys, a [膚色] adult on the left talks to a [膚色] adult on the right, [young_adult, left_side, [膚色], [氣質], [臉型], [體型], [眼型], [髮型], [瀏海], [服裝], standing, talking, looking_at_another] AND [adult_male, right_side, [膚色], [氣質], [臉型], [體型], [眼型], [髮型], [瀏海], [服裝], leaning_against_wall, listening], casual_conversation, eye_contact, [場景], [時間], from_side, bust_shot
NSFW 零距離：(nsfw:1.2), 2boys of the same height, a [膚色] adult male on top penetrating a [膚色] adult male underneath, [(adult:1.5), [膚色], [氣質], [臉型], [體型], [眼型], [髮型], [瀏海], naked_upper_body, kneeling, on_top, inserting, [表情]] AND [(adult:1.5), [膚色], [氣質], [臉型], [體型], [眼型], [髮型], naked, lying_on_back, legs_up, under_another, inserted, [表情]], same_height, bodies_intertwined, mating_press, penetration, [場景], from_side, medium_shot`,
                // 💬 自然語言版（Pollinations / ComfyUI Anima：自然語言比標籤更好）
                extractPromptNatural: `每張插圖的 "prompt" 用「自然語言英文句子」描述畫面（給 Pollinations / ComfyUI，自然語言比標籤更好）。
- 只照「最新這段正文」真的發生、畫得出來的畫面，不要推理後續劇情、不腦補角色心理或感情。
- 一句話交代：誰、在做什麼、在哪裡、光線氣氛、鏡頭遠近。
- ★角色外觀(髮色/眼色/體型/服裝)一律以下方【角色外觀錨點】為權威，照它寫、不要漏、不要自己編；錨點沒列到的角色才依劇情與已知設定。
- 多人場景：每個人各自的外觀(尤其髮色/眼色)都要寫清楚，別讓 A 的特徵混到 B 身上。
- 純男場景(完全沒有女角)寫明 male focus。
- 找不到適合入畫的畫面就回空、不硬湊。`
            },
            comfyuiDirect: {
                url: 'http://127.0.0.1:8188', modelType: 'checkpoint', model: '', vae: '', sampler: 'euler', scheduler: 'normal',
                steps: 28, cfg: 6.5, width: 1024, height: 1024, seed: -1, clipSkip: 0,
                basePrompt: '', negPrompt: '', loras: [], presets: [], previewPrompt: '1 person, upper body portrait, looking at viewer, simple background',
                sceneHires: true, sceneHiresScale: 1.5, sceneFaceDetailer: true,
                workflowMode: 'auto', customWorkflow: '',
                fluxClipL: 'clip_l.safetensors', fluxT5: 't5xxl_fp8_e4m3fn.safetensors', fluxAe: 'ae.safetensors', guidance: 3.5,
                animaClip: 'qwen_3_06b_base.safetensors', animaVae: 'qwen_image_vae.safetensors'
            }
        };
        if (saved) {
            try {
                const savedConfig = JSON.parse(saved);
                const pol = savedConfig.pollinations || {};
                if (pol.defaultPrompt && !pol.charBasePrompt) {
                    pol.charBasePrompt = pol.defaultPrompt;
                    delete pol.defaultPrompt;
                }
                config = {
                    ...config,
                    ...savedConfig,
                    pollinations: {
                        ...config.pollinations,
                        ...pol,
                        models: config.pollinations.models
                    },
                    novelai: {
                        ...config.novelai,
                        ...(savedConfig.novelai || {})
                    },
                    sceneGen: (function () {
                        const _sg = { ...config.sceneGen, ...(savedConfig.sceneGen || {}) };
                        // 舊存檔只有單一 extractPrompt（多半是使用者調過的 ComfyUI/自然語言版）→ 沒有新「自然語言版」欄位時遷進去不丟；標籤版用新 V4.5 預設
                        const _saved = savedConfig.sceneGen || {};
                        if (_saved.extractPrompt && !_saved.extractPromptNatural) _sg.extractPromptNatural = _saved.extractPrompt;
                        return _sg;
                    })(),
                    comfyuiDirect: {
                        ...config.comfyuiDirect,
                        ...(savedConfig.comfyuiDirect || {}),
                        loras: (savedConfig.comfyuiDirect && Array.isArray(savedConfig.comfyuiDirect.loras)) ? savedConfig.comfyuiDirect.loras : config.comfyuiDirect.loras,
                        presets: (savedConfig.comfyuiDirect && Array.isArray(savedConfig.comfyuiDirect.presets)) ? savedConfig.comfyuiDirect.presets : config.comfyuiDirect.presets
                    },
                    pixabayKey:    savedConfig.pixabayKey || '',
                    fallbackForce: savedConfig.fallbackForce === true,
                    avatarSize:    savedConfig.avatarSize || '',
                    bgSize:        savedConfig.bgSize || '1024x768'
                };
            } catch(e) {}
        }
        return config;
    }
    
    // --- 讀取 Minimax 語音設置 ---
    function loadMinimaxConfig() {
        let saved = localStorage.getItem(MINIMAX_STORAGE_KEY);
        let config = {
            enabled: false,
            groupId: '',
            apiKey: '',
            provider: 'cn',
            speechModel: 'speech-01-turbo',
            defaultSpeed: 1.0,
            defaultLanguageBoost: '',
            voiceProfiles: []
        };
        if (saved) { try { config = { ...config, ...JSON.parse(saved) }; } catch(e) {} }
        return config;
    }

    function loadVectorConfig() {
        let saved = localStorage.getItem('os_vector_config');
        let config = { enabled: false, embeddingUrl: '', embeddingModel: 'text-embedding-3-small', syncKeyWithPrimary: true, embeddingKey: '', topK: 5 };
        if (saved) { try { config = { ...config, ...JSON.parse(saved) }; } catch(e) {} }
        return config;
    }

    // --- 讀取Claude 的房間設置（獨立 Claude 接口，跟主/副模型完全隔離；不對接酒館 profile / preset） ---
    // 新版資料結構：跟其他 AI 提供者一樣只有 URL + 密鑰，多預設可隨時切換
    // - 朋友只填一個 Anthropic 預設就能用、不需要 server / cc-bridge
    // - Rae 可加多組（例如本機 cc-bridge / VPS cc-bridge / Anthropic 直連）
    function loadClaudeRoomConfig() {
        let saved = localStorage.getItem(CLAUDE_ROOM_STORAGE_KEY);
        // 2026-05-24:Anthropic 直連預設拔除;奧瑞亞 = agent 前端,新安裝預設空 preset,
        // 使用者自己加 cc-bridge / VPS cc-bridge 等端點。
        const defaultPresets = [];
        let config = {
            presets: defaultPresets,
            activePresetId: '',
            // 預設值（聊天時 inline picker 不選的話用這些）
            model: 'claude-opus-4-7',
            maxTokens: 4096,
            temperature: 1.0,
            top_p: 1.0,
            // inline picker 覆寫值（空字串 = 用該 endpoint server 的預設）
            inlineModel:   '',
            inlineEffort:  '',
            inlineBackend: '',
        };
        if (saved) {
            try { config = { ...config, ...JSON.parse(saved) }; } catch(e) {}

            // 從舊版 endpoints 結構 migrate 到 presets array（一次性、之後不再執行）
            if (saved.includes('"endpoints"') && (!config.presets || config.presets.length === 1)) {
                try {
                    const old = JSON.parse(saved);
                    const migrated = [];
                    if (old.endpoints) {
                        for (const [slotId, ep] of Object.entries(old.endpoints)) {
                            const key = ep.token || ep.apiKey || '';
                            if (ep.url || key) {
                                migrated.push({ id: slotId, name: ep.name || slotId, url: ep.url || '', key });
                            }
                        }
                    }
                    if (migrated.length) {
                        config.presets = migrated;
                        config.activePresetId = old.activeEndpoint || migrated[0].id;
                    }
                } catch(e) {}
            }

            // 從更早的舊版（單一 url/key）migrate
            if (saved.includes('"url"') && (!config.presets || config.presets.every(p => !p.url && !p.key))) {
                try {
                    const old = JSON.parse(saved);
                    if (old.url || old.key) {
                        config.presets = [
                            { id: 'legacy', name: '預設', url: old.url || '', key: old.key || '' },
                            ...defaultPresets,
                        ];
                        config.activePresetId = 'legacy';
                    }
                } catch(e) {}
            }

            if (!config.presets || !config.presets.length) config.presets = defaultPresets;
            if (!config.presets.find(p => p.id === config.activePresetId)) {
                config.activePresetId = config.presets[0].id;
            }
        }
        return config;
    }

    // 取得當前 active preset 的展開資料
    function getActivePreset(config) {
        config = config || loadClaudeRoomConfig();
        const presets = config.presets || [];
        return presets.find(p => p.id === config.activePresetId) || presets[0] || { id: '', name: '', url: '', key: '' };
    }

    function saveClaudeRoomConfig(data) {
        localStorage.setItem(CLAUDE_ROOM_STORAGE_KEY, JSON.stringify(data));
    }

    function saveConfig(llmData, secLlmData, imgData, minimaxData) {
        localStorage.setItem(LLM_STORAGE_KEY, JSON.stringify(llmData));
        localStorage.setItem(SEC_LLM_STORAGE_KEY, JSON.stringify(secLlmData));
        localStorage.setItem(IMG_STORAGE_KEY, JSON.stringify(imgData));
        
        if (minimaxData) {
            localStorage.setItem(MINIMAX_STORAGE_KEY, JSON.stringify(minimaxData));
            const win2 = window.parent || window;
            if (win2.OS_MINIMAX && typeof win2.OS_MINIMAX.saveConfig === 'function') {
                win2.OS_MINIMAX.saveConfig(minimaxData);
            }
        }
        
        const win = window.parent || window;
        if (win.OS_IMAGE_MANAGER) {
            // 兩桶 + legacy mirror（service = serviceLiving）。同步 ON 時 serviceInanimate 已＝serviceLiving
            win.OS_IMAGE_MANAGER.config.serviceInanimate = imgData.serviceInanimate || imgData.service;
            win.OS_IMAGE_MANAGER.config.serviceLiving = imgData.serviceLiving || imgData.service;
            win.OS_IMAGE_MANAGER.config.service = imgData.serviceLiving || imgData.service;
            if (typeof imgData.imgSourceSynced === 'boolean') win.OS_IMAGE_MANAGER.config.imgSourceSynced = imgData.imgSourceSynced;
            if (imgData.pollinations) {
                win.OS_IMAGE_MANAGER.config.pollinations = {
                    ...win.OS_IMAGE_MANAGER.config.pollinations,
                    ...imgData.pollinations,
                    models: win.OS_IMAGE_MANAGER.config.pollinations.models
                };
            }
            if (imgData.novelai) {
                win.OS_IMAGE_MANAGER.config.novelai = {
                    ...win.OS_IMAGE_MANAGER.config.novelai,
                    ...imgData.novelai
                };
            }
            if (imgData.comfyuiDirect) {
                win.OS_IMAGE_MANAGER.config.comfyuiDirect = {
                    ...win.OS_IMAGE_MANAGER.config.comfyuiDirect,
                    ...imgData.comfyuiDirect
                };
            }
            console.log('[OS設置] ✅ 圖片管理器配置已更新, 死物桶:', win.OS_IMAGE_MANAGER.config.serviceInanimate, '活物桶:', win.OS_IMAGE_MANAGER.config.serviceLiving);
        }
    }

    window.OS_SETTINGS = {
        getConfig: loadLlmConfig,
        getSecondaryConfig: loadSecLlmConfig,
        getImageConfig: loadImageConfig,
        getMinimaxConfig: loadMinimaxConfig,
        getClaudeRoomConfig: loadClaudeRoomConfig,
        saveClaudeRoomConfig: saveClaudeRoomConfig,
        getActiveClaudePreset: getActivePreset,
        // 向下相容的舊 API（其他地方還在用），轉接到新 getActivePreset
        getActiveClaudeEndpoint: function() {
            const p = getActivePreset();
            return { id: p.id, name: p.name, url: p.url, token: p.key, apiKey: '' };
        },
        saveConfig: saveConfig
    };

    const getSTContext = () => { try { return window.parent.SillyTavern ? window.parent.SillyTavern.getContext() : null; } catch (e) { return null; } };

    function launchApp(container, mode) {
        const llmConfig = loadLlmConfig();
        const secLlmConfig = loadSecLlmConfig();
        const imgConfig = loadImageConfig();
        const minimaxConfig = loadMinimaxConfig();
        const claudeRoomConfig = loadClaudeRoomConfig();
        const vnD = (window.VN_SETTINGS_PANEL?.load) ? window.VN_SETTINGS_PANEL.load() : {};

        // 畫廊子 tab 切換 helper（含 avatar/bg 列表 lazy load）
        if (!window._switchOsGalTab) {
            window._switchOsGalTab = function(el, tabId) {
                el.parentElement.querySelectorAll('[data-galtab]').forEach(t => t.classList.remove('active'));
                el.classList.add('active');
                document.querySelectorAll('.img-subtab-view').forEach(v => v.style.display = 'none');
                const target = document.getElementById('view-img-' + tabId);
                if (target) target.style.display = 'block';
                if (tabId === 'avatar' && window.VN_PLAYER?.loadAvatarManager) {
                    window.VN_PLAYER.loadAvatarManager('vncfg-avatar-mgr-list');
                } else if (tabId === 'bg' && window.VN_PLAYER?.loadBgManager) {
                    window.VN_PLAYER.loadBgManager('vncfg-bg-mgr-list');
                } else if (tabId === 'scene' && window.VN_PLAYER?.loadSceneManager) {
                    window.VN_PLAYER.loadSceneManager('vncfg-scene-mgr-list');
                }
            };
        }

        // API tab 內層子 tab：主模型 / 副模型 切換（就像語音面板的子 tab）
        if (!window._switchApiTab) {
            window._switchApiTab = function(which) {
                document.querySelectorAll('.api-subview').forEach(v => { v.style.display = (v.id === 'view-' + which) ? '' : 'none'; });
                document.querySelectorAll('.api-subtab').forEach(t => t.classList.toggle('active', t.dataset.apitab === which));
            };
        }

        // ───── 頭像 tab 內層子 tab：頭像快取 / 角色立繪 ─────
        if (!window._switchAvatarSub) {
            window._switchAvatarSub = function(el, subId) {
                document.querySelectorAll('.av-sub').forEach(t => {
                    t.classList.remove('active');
                    t.style.color = 'rgba(26,28,40,0.40)';
                    t.style.borderColor = '#444';
                    t.style.background = 'transparent';
                });
                el.classList.add('active');
                el.style.color = '#1A1C28';
                el.style.borderColor = 'rgba(26,28,40,0.25)';
                el.style.background = 'rgba(26,28,40,0.06)';
                document.querySelectorAll('.avatar-sub-view').forEach(v => v.style.display = 'none');
                const target = document.getElementById('avatar-sub-' + subId);
                if (target) target.style.display = 'block';
                if (subId === 'sprite' && window._initSpriteUI) window._initSpriteUI();
            };
        }

        // ───── 角色立繪 UI：lazy 初始化 ─────
        if (!window._initSpriteUI) {
            const DEF_PREFIX = 'centered composition, entire body visible, body in frame, (facing viewer:1.2), front view, looking at viewer, solid background, (cowboy shot), full body, clothes and pants, school, ((detailed rendering)), clean and fluid linework, delicate and refined, entire body visible, both shoulders visible, ';
            const DEF_SUFFIX = '';
            const LS_PFX = 'os_sprite_tpl_prefix';
            const LS_SFX = 'os_sprite_tpl_suffix';
            const LS_RATIO = 'os_sprite_upscale_ratio';
            const LS_HIRES = 'os_sprite_hires';
            const state = { inited: false, bgRemover: null, blob: null, blobUrl: null, isRemoved: false };

            const setStatus = (msg, isErr) => {
                const el = document.getElementById('sprite-status');
                if (!el) return;
                el.textContent = msg || '';
                el.style.color = isErr ? '#fc8181' : 'rgba(26,28,40,0.40)';
            };
            const enableBtn = (id, on) => {
                const b = document.getElementById(id);
                if (!b) return;
                b.style.opacity = on ? '1' : '0.5';
                b.style.pointerEvents = on ? 'auto' : 'none';
            };

            // 清洗頭像 prompt：剝掉跟立繪衝突的構圖 / 背景 / 視角 tag
            // 原 prompt 可能含 "bust shot, soft background, looking at viewer"，會跟模板的 upper body / dark background 打架
            function stripPromptForSprite(p) {
                if (!p) return '';
                const patterns = [
                    // 構圖類
                    /\bbust(\s+|-)?shot\b/gi, /\bportrait\b/gi, /\bheadshot\b/gi, /\bhead\s+shot\b/gi,
                    /\bclose[\s-]?up\b/gi, /\bcowboy(\s+|-)?shot\b/gi,
                    /\bupper(\s+|-)?body\b/gi, /\bfull(\s+|-)?body\b/gi,
                    /\bhead\s+and\s+shoulders\b/gi, /\bwaist[\s-]?up\b/gi, /\bchest[\s-]?up\b/gi,
                    // 背景類（白底/簡單/純色/任意 *background*）
                    /\b[a-z]*\s*background\b/gi,
                    /\bisolated\b/gi, /\bno\s+bg\b/gi,
                    // 燈光（避免跟模板的 dramatic lighting 重複）
                    /\bsoft\s+lighting\b/gi, /\bstudio\s+lighting\b/gi, /\bflat\s+lighting\b/gi,
                    // 視角
                    /\bfrom\s+(above|below|side|behind|front)\b/gi,
                ];
                let s = p;
                patterns.forEach(rx => { s = s.replace(rx, ''); });
                // 清理多餘逗號 / 空白
                s = s.replace(/,\s*,+/g, ',').replace(/^\s*,+/, '').replace(/,+\s*$/, '').replace(/\s+/g, ' ').trim();
                return s;
            }

            async function spriteGenerate(name, finalPrompt) {
                // finalPrompt 來自卡片內 textarea，預填清洗版、可由用戶微調，這裡不再清洗
                const win2 = window.parent || window;
                if (!name) { setStatus('請從上方列表點一個角色', true); return; }
                if (!finalPrompt) { setStatus('「' + name + '」的 prompt 為空', true); return; }
                if (!win2.OS_IMAGE_MANAGER) { setStatus('OS_IMAGE_MANAGER 未就緒', true); return; }

                state.selectedName = name;
                state.selectedPrompt = finalPrompt;  // 存用戶最終確認的版本（供 spriteSave）
                document.getElementById('sprite-selected-info').innerHTML =
                    '🎯 當前：<b style="color:#1A1C28;">' + name + '</b>';

                const fullPrompt = document.getElementById('sprite-tpl-prefix').value + finalPrompt + document.getElementById('sprite-tpl-suffix').value;
                setStatus('⏳ 為「' + name + '」生立繪中（5–30 秒）...');
                document.getElementById('sprite-preview').innerHTML = '<span style="color:#666;font-size:11px;">生成中...</span>';
                enableBtn('sprite-removebg-btn', false);
                enableBtn('sprite-removebg-canvas-btn', false);
                enableBtn('sprite-save-btn', false);

                try {
                    // 立繪基礎 512×896 (約 4:7 直立，full body 站姿放得下腿)、依「精緻度倍率」放大、跳過 cache。
                    // NAI 的提示詞格式跟 Pollinations 完全不同，純靠通用模板會很裸/畫質差 →
                    // 真的會走 NAI 時就「不 raw」，讓它套用「圖片設置」裡設好的 NAI 底詞/負詞（跟頭像同一套畫風）；
                    // Pollinations（或 NAI 沒 token 退回）維持 raw（純模板，行為不變）。
                    const _imCfg = win2.OS_IMAGE_MANAGER.config;
                    const _useNAI = !!(_imCfg && _imCfg.service === 'novelai' && _imCfg.novelai && _imCfg.novelai.token);
                    const _isComfy = !!(_imCfg && _imCfg.service === 'comfyui_direct');
                    // 立繪 base 比例（可調，「立繪比例」下拉，預設 512×896；鎧甲/壯角色選寬一點）
                    let _bw = 512, _bh = 896;
                    try { const _bp = String(localStorage.getItem('os_sprite_size') || '512x896').split('x').map(Number); if (_bp[0] && _bp[1]) { _bw = _bp[0]; _bh = _bp[1]; } } catch(e) {}
                    // 精緻度倍率＋高清修復都是 ComfyUI 直連專屬；非 ComfyUI 不套倍率（base 比例就是最終尺寸）
                    const _ratioEl = document.getElementById('sprite-upscale-ratio');
                    const _ratio = _isComfy ? (parseFloat((_ratioEl && _ratioEl.value) || localStorage.getItem(LS_RATIO) || '1.5') || 1.5) : 1;
                    const _hiresEl = document.getElementById('sprite-hires');
                    const _hiresOn = _isComfy && _hiresEl && _hiresEl.checked && _ratio > 1;
                    let _opts;
                    if (_hiresOn) {
                        _opts = { force: true, width: _bw, height: _bh, raw: !_useNAI, comfyHires: { scale: _ratio, denoise: 0.45 } };
                        setStatus('⏳ 為「' + name + '」生立繪中（高清修復，較久 15–60 秒）...');
                    } else {
                        const _sw = Math.round(_bw * _ratio / 8) * 8;
                        const _sh = Math.round(_bh * _ratio / 8) * 8;
                        _opts = { force: true, width: _sw, height: _sh, raw: !_useNAI };
                    }
                    const url = await win2.OS_IMAGE_MANAGER.generate(fullPrompt, 'char', _opts);
                    if (!url) throw new Error('OS_IMAGE_MANAGER 回傳空 URL');
                    const res = await fetch(url);
                    if (!res.ok) throw new Error('抓圖失敗 HTTP ' + res.status);
                    const blob = await res.blob();

                    if (state.blobUrl) { try { URL.revokeObjectURL(state.blobUrl); } catch(_){} }
                    state.blob = blob;
                    state.blobUrl = URL.createObjectURL(blob);
                    state.isRemoved = false;

                    document.getElementById('sprite-preview').innerHTML = '<img src="' + state.blobUrl + '" style="max-width:100%;max-height:300px;border-radius:4px;">';
                    setStatus('✅ 生成完成');
                    enableBtn('sprite-removebg-btn', true);
                    enableBtn('sprite-removebg-canvas-btn', true);
                    enableBtn('sprite-save-btn', true);
                } catch (e) {
                    console.error('[Sprite] 生成失敗:', e);
                    setStatus('❌ ' + e.message, true);
                    document.getElementById('sprite-preview').innerHTML = '<span style="color:#fc8181;font-size:11px;">生成失敗</span>';
                }
            }

            async function renderAvatarPicker() {
                const win2 = window.parent || window;
                const listEl = document.getElementById('sprite-picker-list');
                if (!listEl) return;
                if (!win2.VN_Cache) { listEl.innerHTML = '<span style="color:#fc8181;">VN_Cache 未就緒，請先進 VN 一次再回來</span>'; return; }
                try {
                    const VC = win2.VN_Cache;
                    const cur = VC.getCurrentWorld ? VC.getCurrentWorld() : '';
                    const all = await VC.getAll('avatar_cache');
                    const valid = all.filter(e => e.url && !e.url.startsWith('blob:'));
                    const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
                    // 依世界分組（含「未分類」舊頭像）+ 下拉切換 → 舊頭像也挑得到、能繼續轉立繪
                    const groups = {};
                    valid.forEach(e => { const w = VC.worldOf ? VC.worldOf(e) : ''; (groups[w] = groups[w] || []).push(e); });
                    const wkeys = Object.keys(groups).sort((a, b) => { if (a === cur) return -1; if (b === cur) return 1; if (a === '') return 1; if (b === '') return -1; return a < b ? -1 : 1; });
                    if (!wkeys.includes(cur)) wkeys.unshift(cur);
                    if (state.pickerWorld == null || (groups[state.pickerWorld] === undefined && state.pickerWorld !== cur)) state.pickerWorld = cur;
                    const wlabel = w => !w ? '📦 未分類（舊頭像）' : (w === cur ? '★ 當前世界' : (w.length > 20 ? '…' + w.slice(-18) : w));
                    let html = '<select class="vng-sel" id="sprite-picker-world" style="margin-bottom:10px;">'
                        + wkeys.map(w => '<option value="' + esc(w) + '"' + (w === state.pickerWorld ? ' selected' : '') + '>' + wlabel(w) + ' (' + (groups[w] || []).length + ')</option>').join('')
                        + '</select>';
                    const pentries = groups[state.pickerWorld] || [];
                    if (!pentries.length) {
                        html += '<div style="color:#666;font-size:11px;padding:10px 0;">這個世界沒有頭像</div>';
                    } else {
                        html += '<div class="vng-grid">' + pentries.map(e => {
                            const bare = VC.bareKeyOf ? VC.bareKeyOf(e) : e.key;
                            return '<div class="vng-card vng-pick" data-key="' + encodeURIComponent(e.key) + '" data-name="' + esc(bare) + '" title="' + esc(bare) + '"><img src="' + esc(e.url) + '"><div class="vng-foot">' + esc(bare) + '</div></div>';
                        }).join('') + '</div>';
                    }
                    listEl.className = '';
                    listEl.innerHTML = html;
                    const wsel = document.getElementById('sprite-picker-world');
                    if (wsel) wsel.onchange = () => { state.pickerWorld = wsel.value; renderAvatarPicker(); };
                    listEl.querySelectorAll('.vng-pick').forEach(card => {
                        card.onclick = () => {
                            listEl.querySelectorAll('.vng-pick').forEach(c => c.classList.remove('is-sel'));
                            card.classList.add('is-sel');
                            const k = decodeURIComponent(card.getAttribute('data-key'));
                            const name = card.getAttribute('data-name');
                            const entry = valid.find(x => x.key === k);
                            state.selectedName = name;
                            const cleaned = stripPromptForSprite(entry ? (entry.prompt || '') : '');
                            const pEl = document.getElementById('sprite-sel-prompt'); if (pEl) pEl.value = cleaned;
                            const bar = document.getElementById('sprite-sel-bar'); if (bar) bar.style.display = 'flex';
                            const info = document.getElementById('sprite-selected-info'); if (info) info.textContent = '已選角色：' + name;
                        };
                    });
                } catch (e) {
                    listEl.innerHTML = '<span style="color:#fc8181;">列表載入失敗: ' + e.message + '</span>';
                }
            }

            async function spriteRemoveBg() {
                if (!state.blob) { setStatus('沒圖可去背', true); return; }
                if (state.isRemoved) { setStatus('已經去過背了', true); return; }
                enableBtn('sprite-removebg-btn', false);
                setStatus('⏳ 載入 AI 模型（第一次 ~40MB，之後快）...');
                try {
                    if (!state.bgRemover) {
                        const m = await import('https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm');
                        state.bgRemover = m.removeBackground;
                    }
                    setStatus('🪄 AI 去背中（單執行緒約 10–30 秒）...');
                    const removed = await state.bgRemover(state.blob, {
                        model: 'isnet_fp16',
                        output: { format: 'image/png', quality: 1.0 },
                        progress: (k, c, t) => { if (t > 0) setStatus('🪄 ' + k + ': ' + Math.round(c/t*100) + '%'); }
                    });
                    _applyRemovedBlob(removed);
                    setStatus('✅ AI 去背完成');
                } catch (e) {
                    console.error('[Sprite] AI 去背失敗:', e);
                    setStatus('❌ AI 去背失敗: ' + e.message, true);
                    enableBtn('sprite-removebg-btn', true);
                    enableBtn('sprite-removebg-canvas-btn', true);
                }
            }

            // 去背成功後共用：換 state.blob + 預覽（透明用棋盤格底襯托）
            const REMOVED_PREVIEW_BG = 'background:linear-gradient(45deg,#2a2018 25%,transparent 25%),linear-gradient(-45deg,#2a2018 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#2a2018 75%),linear-gradient(-45deg,transparent 75%,#2a2018 75%);background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0;';
            function _applyRemovedBlob(removed) {
                if (state.blobUrl) { try { URL.revokeObjectURL(state.blobUrl); } catch(_){} }
                state.blob = removed;
                state.blobUrl = URL.createObjectURL(removed);
                state.isRemoved = true;
                document.getElementById('sprite-preview').innerHTML =
                    '<img src="' + state.blobUrl + '" style="max-width:100%;max-height:300px;border-radius:4px;' + REMOVED_PREVIEW_BG + '">';
                enableBtn('sprite-save-btn', true);
            }

            // ✂️ 純色去背（canvas）：抓四角背景色 → 從邊緣 flood-fill 把「接近背景色且與邊緣連通」的像素設透明。
            //   只去除邊緣連通的背景 → 角色內部不會被打洞；二值 alpha → 不會像 AI matting 把角色弄半透明。
            //   專治純色背景立繪（尤其 NAI 圖被 AI 模型過度透明化的情況）。不下載模型、瞬間完成。
            async function spriteRemoveBgCanvas() {
                if (!state.blob) { setStatus('沒圖可去背', true); return; }
                if (state.isRemoved) { setStatus('已經去過背了（要換方式請重新生成）', true); return; }
                enableBtn('sprite-removebg-btn', false);
                enableBtn('sprite-removebg-canvas-btn', false);
                setStatus('✂️ 純色去背中...');
                try {
                    const bmp = await createImageBitmap(state.blob);
                    const W = bmp.width, H = bmp.height;
                    const cv = document.createElement('canvas');
                    cv.width = W; cv.height = H;
                    const ctx = cv.getContext('2d', { willReadFrequently: true });
                    ctx.drawImage(bmp, 0, 0);
                    if (bmp.close) bmp.close();
                    const imgData = ctx.getImageData(0, 0, W, H);
                    const d = imgData.data;

                    // 背景色：四角各取 ~6×6 平均（立繪是純色背景＋角色置中，角落必為背景）
                    const sampleCorner = (x0, y0) => {
                        let r = 0, g = 0, b = 0, n = 0;
                        for (let y = y0; y < Math.min(y0 + 6, H); y++)
                            for (let x = x0; x < Math.min(x0 + 6, W); x++) {
                                const i = (y * W + x) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
                            }
                        return n ? [r / n, g / n, b / n] : [0, 0, 0];
                    };
                    const cs = [sampleCorner(0, 0), sampleCorner(Math.max(0, W - 6), 0),
                                sampleCorner(0, Math.max(0, H - 6)), sampleCorner(Math.max(0, W - 6), Math.max(0, H - 6))];
                    const bg = [0, 1, 2].map(k => cs.reduce((s, c) => s + c[k], 0) / cs.length);

                    // 去背強度滑桿 → 容差（顏色距離平方）。strength 0..100 → tol 20..110
                    const strEl = document.getElementById('sprite-bg-strength');
                    const strength = strEl ? parseInt(strEl.value, 10) : 50;
                    const tol = 20 + (isNaN(strength) ? 50 : strength) * 0.9;
                    const tol2 = tol * tol * 3;
                    const isBg = (p) => {
                        const i = p * 4, dr = d[i] - bg[0], dg = d[i + 1] - bg[1], db = d[i + 2] - bg[2];
                        return (dr * dr + dg * dg + db * db) <= tol2;
                    };

                    // 從四條邊入種子，flood-fill 連通的背景像素
                    const visited = new Uint8Array(W * H);
                    const stack = [];
                    for (let x = 0; x < W; x++) { stack.push(x); stack.push((H - 1) * W + x); }
                    for (let y = 0; y < H; y++) { stack.push(y * W); stack.push(y * W + W - 1); }
                    while (stack.length) {
                        const p = stack.pop();
                        if (visited[p]) continue;
                        visited[p] = 1;
                        if (!isBg(p)) continue;
                        d[p * 4 + 3] = 0; // 透明
                        const x = p % W, y = (p / W) | 0;
                        if (x > 0) stack.push(p - 1);
                        if (x < W - 1) stack.push(p + 1);
                        if (y > 0) stack.push(p - W);
                        if (y < H - 1) stack.push(p + W);
                    }
                    ctx.putImageData(imgData, 0, 0);
                    const removed = await new Promise(res => cv.toBlob(res, 'image/png'));
                    if (!removed) throw new Error('canvas 轉檔失敗');
                    _applyRemovedBlob(removed);
                    setStatus('✅ 純色去背完成');
                } catch (e) {
                    console.error('[Sprite] 純色去背失敗:', e);
                    setStatus('❌ 純色去背失敗: ' + e.message, true);
                    enableBtn('sprite-removebg-btn', true);
                    enableBtn('sprite-removebg-canvas-btn', true);
                }
            }

            async function spriteSave() {
                const win2 = window.parent || window;
                const name = state.selectedName;
                if (!name) { setStatus('沒有選中的角色', true); return; }
                if (!state.blob) { setStatus('沒圖可存', true); return; }
                if (!win2.VN_Cache) { setStatus('VN_Cache 未就緒，請先進 VN 一次再回來', true); return; }
                setStatus('⏳ 儲存中...');
                try {
                    const dataUrl = await new Promise((res, rej) => {
                        const r = new FileReader();
                        r.onload = () => res(r.result);
                        r.onerror = rej;
                        r.readAsDataURL(state.blob);
                    });
                    const prefix = document.getElementById('sprite-tpl-prefix').value;
                    const suffix = document.getElementById('sprite-tpl-suffix').value;
                    await win2.VN_Cache.set('sprite_cache', name, {
                        url: dataUrl,
                        prompt: prefix + (state.selectedPrompt || '') + suffix,
                        isRemoved: state.isRemoved,
                        createdAt: Date.now()
                    });
                    setStatus('✅ 已存「' + name + '」立繪');
                    refreshList();
                } catch (e) {
                    console.error('[Sprite] 儲存失敗:', e);
                    setStatus('❌ 儲存失敗: ' + e.message, true);
                }
            }

            async function refreshList() {
                const win2 = window.parent || window;
                const listEl = document.getElementById('sprite-list');
                if (!listEl) return;
                if (!win2.VN_Cache) { listEl.innerHTML = '<span style="color:#fc8181;">VN_Cache 未就緒，請先進 VN 一次再回來</span>'; return; }
                // 🌍 改用畫廊網格（世界感知、圖片為主）；VN_PLAYER 未就緒時退回極簡清單
                if (win2.VN_PLAYER && win2.VN_PLAYER.loadSpriteManager) { win2.VN_PLAYER.loadSpriteManager('sprite-list'); return; }
                try {
                    const all = await win2.VN_Cache.getAll('sprite_cache');
                    listEl.innerHTML = all.length ? all.map(e => '<div style="color:#888;font-size:11px;padding:2px 0;">' + e.key + '</div>').join('') : '<span style="color:#666;">尚無已存立繪</span>';
                } catch (e) { listEl.innerHTML = '<span style="color:#fc8181;">列表載入失敗</span>'; }
            }

            // 每次切到 sprite tab 都跑一次：DOM 是新的時要重新綁事件
            // 用 onclick/onchange 覆寫，不用 addEventListener（避免重複疊加），安全
            window._initSpriteUI = function() {
                const prefixEl = document.getElementById('sprite-tpl-prefix');
                const suffixEl = document.getElementById('sprite-tpl-suffix');
                if (!prefixEl || !suffixEl) return;
                prefixEl.value = localStorage.getItem(LS_PFX) || DEF_PREFIX;
                suffixEl.value = localStorage.getItem(LS_SFX) || DEF_SUFFIX;
                prefixEl.onchange = () => localStorage.setItem(LS_PFX, prefixEl.value);
                suffixEl.onchange = () => localStorage.setItem(LS_SFX, suffixEl.value);
                const sizeEl = document.getElementById('sprite-base-size');
                if (sizeEl) {
                    sizeEl.value = localStorage.getItem('os_sprite_size') || '512x896';
                    sizeEl.onchange = () => localStorage.setItem('os_sprite_size', sizeEl.value);
                }
                const ratioEl = document.getElementById('sprite-upscale-ratio');
                if (ratioEl) {
                    ratioEl.value = localStorage.getItem(LS_RATIO) || '1.5';
                    ratioEl.onchange = () => localStorage.setItem(LS_RATIO, ratioEl.value);
                }
                // 高清修復：ComfyUI 直連專屬，依當前來源顯示/隱藏
                const _win2 = window.parent || window;
                // 立繪是 char 型 → 走活物桶
                const _svc = (_win2.OS_IMAGE_MANAGER && typeof _win2.OS_IMAGE_MANAGER.serviceFor === 'function')
                    ? _win2.OS_IMAGE_MANAGER.serviceFor('char')
                    : ((_win2.OS_IMAGE_MANAGER && _win2.OS_IMAGE_MANAGER.config && _win2.OS_IMAGE_MANAGER.config.service) || '');
                const hiresRow = document.getElementById('sprite-hires-row');
                const hiresEl = document.getElementById('sprite-hires');
                if (hiresRow) hiresRow.style.display = (_svc === 'comfyui_direct') ? 'inline-flex' : 'none';
                if (ratioEl) ratioEl.style.display = (_svc === 'comfyui_direct') ? '' : 'none';   // 精緻度倍率也 ComfyUI 專屬：非 ComfyUI 藏起來、固定小圖 512×896
                if (hiresEl) {
                    hiresEl.checked = localStorage.getItem(LS_HIRES) === '1';
                    hiresEl.onchange = () => localStorage.setItem(LS_HIRES, hiresEl.checked ? '1' : '0');
                }
                document.getElementById('sprite-tpl-reset').onclick = () => {
                    prefixEl.value = DEF_PREFIX;
                    suffixEl.value = DEF_SUFFIX;
                    localStorage.removeItem(LS_PFX);
                    localStorage.removeItem(LS_SFX);
                };
                document.getElementById('sprite-removebg-btn').onclick = spriteRemoveBg;
                document.getElementById('sprite-removebg-canvas-btn').onclick = spriteRemoveBgCanvas;
                document.getElementById('sprite-save-btn').onclick = spriteSave;
                const _genBtn = document.getElementById('sprite-gen-btn');
                if (_genBtn) _genBtn.onclick = () => {
                    if (!state.selectedName) { setStatus('請先點上方一個角色', true); return; }
                    const p = (document.getElementById('sprite-sel-prompt').value || '').trim();
                    spriteGenerate(state.selectedName, p);
                };
                renderAvatarPicker();
                refreshList();
            };
        }

        // 偵測 TTS 當前 mode（minimax / sovits / off）
        let vttsEnabled = false;
        try { vttsEnabled = !!(JSON.parse(localStorage.getItem('vn_tts_v1') || '{}').enabled); } catch (e) {}
        const currentTtsMode = minimaxConfig.enabled ? 'minimax' : (vttsEnabled ? 'sovits' : 'off');

        // 語音 mode 三選一互斥切換
        if (!window._switchTtsMode) {
            window._switchTtsMode = function(el, mode) {
                el.parentElement.querySelectorAll('[data-ttsmode]').forEach(b => {
                    b.classList.remove('active');
                    b.style.background = 'transparent';
                    b.style.color = 'rgba(26,28,40,0.55)';
                    b.style.fontWeight = '400';
                    b.style.boxShadow = 'none';
                });
                el.classList.add('active');
                el.style.background = 'rgba(26,28,40,0.09)';
                el.style.color = '#1A1C28';
                el.style.fontWeight = '700';
                el.style.boxShadow = '0 0 0 1px rgba(26,28,40,0.25) inset';
                document.querySelectorAll('.voice-area').forEach(v => v.style.display = 'none');
                const target = document.getElementById('voice-area-' + mode);
                if (target) target.style.display = 'block';
                // SoVITS lazy init：第一次切到 sovits 才注入 vn_tts_panel
                if (mode === 'sovits' && window.VN_TTS_Panel?.initInline) {
                    window.VN_TTS_Panel.initInline('vn-tts-inline-root');
                }
                // 同步 checkbox（mode 互斥：被選的 checked、其他 unchecked）
                const mm = document.getElementById('mm-enabled');
                const vtts = document.getElementById('vtts-enabled');
                if (mm)   mm.checked = (mode === 'minimax');
                if (vtts) vtts.checked = (mode === 'sovits');
                // 🔥 Immediate apply：立即寫 localStorage（不依賴主保存按鈕）
                try {
                    const mmCfg = JSON.parse(localStorage.getItem('os_minimax_config') || '{}');
                    mmCfg.enabled = (mode === 'minimax');
                    localStorage.setItem('os_minimax_config', JSON.stringify(mmCfg));
                } catch (e) {}
                try {
                    const ttsCfg = JSON.parse(localStorage.getItem('vn_tts_v1') || '{}');
                    ttsCfg.enabled = (mode === 'sovits');
                    localStorage.setItem('vn_tts_v1', JSON.stringify(ttsCfg));
                } catch (e) {}
                // 同步 in-memory config（避免背景音不及生效）
                if (window.VN_TTS?.config) window.VN_TTS.config.enabled = (mode === 'sovits');
            };
        }

        const isStandalone = !!(window.OS_API && typeof window.OS_API.isStandalone === 'function' && window.OS_API.isStandalone());
        if (isStandalone) {
            llmConfig.useSystemApi = false;
            secLlmConfig.useSystemApi = false;
        }
        const stHide = isStandalone ? ' style="display:none"' : '';
        
        let stProfiles = [];
        let stActiveProfileId = '';
        try {
            const context = getSTContext();
            if (context && context.extensionSettings && context.extensionSettings.connectionManager) {
                stProfiles = context.extensionSettings.connectionManager.profiles || [];
                stActiveProfileId = context.extensionSettings.connectionManager.selectedProfile || '';
            }
        } catch(e) {}

        const buildProfileOptions = (currentId) => {
            const resolvedId = currentId || stActiveProfileId;
            let opts = `<option value=""${!resolvedId ? ' selected' : ''}>(🚀 當前激活的連接 / Current Active)</option>`;
            stProfiles.forEach(p => {
                const isSelected = p.id === resolvedId ? 'selected' : '';
                const safeName = p.name ? p.name.replace(/</g, "&lt;") : "Unknown";
                opts += `<option value="${p.id}" ${isSelected}>📂 ${safeName.substring(0,25)}</option>`;
            });
            return opts;
        };

        const primaryProfileOpts = buildProfileOptions(llmConfig.stProfileId);
        const secondaryProfileOpts = buildProfileOptions(secLlmConfig.stProfileId);

        // HTML 結構
        container.innerHTML = `
            <div class="set-container">
                <div class="set-header">
                    <div class="set-back-btn" id="nav-home">‹</div>
                    <div class="set-title">系統設置</div>
                    <div style="width:32px"></div>
                </div>
                
                <div class="set-tabs">
                    <div class="set-tab active" data-tab="api">API</div>
                    <div class="set-tab" data-tab="img">圖片</div>
                    <div class="set-tab" data-tab="voice">語音</div>
                    <div class="set-tab" data-tab="vn">素材</div>
                    <div class="set-tab" data-tab="vec"${!isStandalone ? ' style="display:none"' : ''}>記憶向量</div>
                    <div class="set-tab" data-tab="sys"${!isStandalone ? ' style="display:none"' : ''}>系統/備份</div>
                </div>

                <div class="set-content">

                    <div id="view-api" class="tab-view active">
                        <div class="api-subtab-row">
                            <div class="api-subtab active" data-apitab="llm" onclick="window._switchApiTab && window._switchApiTab('llm')">主模型</div>
                            <div class="api-subtab" data-apitab="sec-llm" onclick="window._switchApiTab && window._switchApiTab('sec-llm')">副模型</div>
                        </div>
                    <div id="view-llm" class="api-subview">
                        <div class="set-group"${stHide}>
                            <div class="set-label">
                                <span>🔗 跟隨酒館主系統 (推薦)</span>
                                <label class="toggle-switch"><input type="checkbox" id="os-system-api" ${llmConfig.useSystemApi ? 'checked' : ''}><span class="slider"></span></label>
                            </div>
                            <div id="st-profile-group" class="${llmConfig.useSystemApi ? '' : 'hidden'}" style="margin-top:10px; border-top:1px solid rgba(26,28,40,0.10); padding-top:10px;">
                                <div class="set-label">選擇連接預設 (Profile)</div>
                                <select class="set-select" id="os-st-profile">${primaryProfileOpts}</select>
                                <div id="st-profile-info" style="margin-top:6px; font-size:11px; color:rgba(26,28,40,0.72); word-break:break-all; line-height:1.6;"></div>
                            </div>
                        </div>

                        <div class="set-group" id="manual-api-group">
                            <div><div class="set-label">手動 API 地址</div><input class="set-input" id="os-api-url" placeholder="http://..." value="${llmConfig.url}"></div>
                            <div style="margin-top:10px;"><div class="set-label">API Key</div><input class="set-input" id="os-api-key" type="password" value="${llmConfig.key}"></div>
                        </div>

                        <div class="set-group">
                            <div class="set-label">選擇模型</div>
                            <div id="model-system-notice" class="${llmConfig.useSystemApi ? '' : 'hidden'}" style="background:rgba(26,28,40,0.06); padding:10px; border-radius:4px; font-size:12px; color:#1A1C28; border:1px solid rgba(26,28,40,0.15);">
                                🔗 已跟隨酒館主系統，模型由酒館決定。<br>直接在酒館介面切換模型即可，無需在此設定。
                            </div>
                            <div class="model-row ${llmConfig.useSystemApi ? 'hidden' : ''}" id="model-row">
                                <select class="set-select" id="os-api-model"><option value="${llmConfig.model}">${llmConfig.model} (當前)</option></select>
                                <div class="btn-fetch" id="os-fetch-btn" title="${isStandalone ? '拉取模型清單' : '從酒館同步'}">${isStandalone ? '<i class="fa-solid fa-microchip"></i>' : '🔄'}</div>
                            </div>
                        </div>

                        <div class="set-group">
                            <div class="set-label">
                                <span>僅讀取摘要 (Save Tokens)</span>
                                <label class="toggle-switch"><input type="checkbox" id="os-summary-mode" ${llmConfig.enableSummaryOnly ? 'checked' : ''}><span class="slider"></span></label>
                            </div>
                            <div class="set-desc">開啟後，手機系統只讀取 &lt;summary&gt; 標籤內容，節省大量 Token 並避免讀取過舊的歷史。</div>
                        </div>

                        <div class="set-group"${stHide}>
                            <div class="set-label">
                                <span>📋 注入 Preset 自訂條目</span>
                                <label class="toggle-switch"><input type="checkbox" id="os-use-preset-prompts" ${llmConfig.usePresetPrompts ? 'checked' : ''}><span class="slider"></span></label>
                            </div>
                            <div class="set-desc">開啟後，注入指定 Preset 的自訂條目為系統提示詞（排除佔位符）。需安裝 TavernHelper 插件。</div>
                            <div id="os-preset-name-group" style="margin-top:10px; display:${llmConfig.usePresetPrompts ? 'flex' : 'none'}; gap:8px; align-items:center;">
                                <select class="set-select" id="os-preset-name" style="flex:1;">
                                    <option value="">（使用當前 in_use Preset）</option>
                                </select>
                                <div class="btn-fetch" id="os-preset-refresh-btn" title="重新整理 Preset 列表" style="flex-shrink:0;">🔄</div>
                            </div>
                        </div>

                        <div class="set-group">
                            <div class="set-slider-container">
                                <div class="set-label"><span>Max Tokens</span></div>
                                <input type="number" min="100" max="200000" step="100" value="${llmConfig.maxTokens}" class="set-input" id="os-max-tokens" style="margin-top:6px; width:100%;">
                            </div>
                            <div class="set-slider-container" style="margin-top:10px;">
                                <div class="set-label"><span>Temperature</span><span class="set-slider-val" id="val-temp">${llmConfig.temperature}</span></div>
                                <input type="range" min="0" max="2" step="0.05" value="${llmConfig.temperature}" class="set-slider" id="os-temperature">
                            </div>
                            <div class="set-slider-container" style="margin-top:10px;">
                                <div class="set-label"><span>Top P</span><span class="set-slider-val" id="val-topp">${llmConfig.top_p ?? 1.0}</span></div>
                                <input type="range" min="0" max="1" step="0.01" value="${llmConfig.top_p ?? 1.0}" class="set-slider" id="os-top-p">
                            </div>
                            <div class="set-slider-container" style="margin-top:10px;">
                                <div class="set-label"><span>Frequency Penalty</span><span class="set-slider-val" id="val-freq">${llmConfig.frequency_penalty ?? 0}</span></div>
                                <input type="range" min="-2" max="2" step="0.01" value="${llmConfig.frequency_penalty ?? 0}" class="set-slider" id="os-freq-penalty">
                            </div>
                            <div class="set-slider-container" style="margin-top:10px;">
                                <div class="set-label"><span>Presence Penalty</span><span class="set-slider-val" id="val-pres">${llmConfig.presence_penalty ?? 0}</span></div>
                                <input type="range" min="-2" max="2" step="0.01" value="${llmConfig.presence_penalty ?? 0}" class="set-slider" id="os-pres-penalty">
                            </div>
                        </div>

                        <div class="set-group">
                            <div class="set-label">
                                <span>💭 請求模型思維鏈</span>
                                <label class="toggle-switch"><input type="checkbox" id="os-enable-thinking" ${llmConfig.enableThinking ? 'checked' : ''}><span class="slider"></span></label>
                            </div>
                            <div style="font-size:11px; color:rgba(26,28,40,0.72); margin-top:6px;">讓模型回傳思考過程（需模型支援，如 Gemini 2.5 / Claude 3.5+）。開啟後 Temperature 自動設為 1。</div>
                            <div style="margin-top:10px;" id="thinking-budget-group" class="${llmConfig.enableThinking ? '' : 'hidden'}">
                                <div class="set-label"><span>思考預算 (tokens)</span><span class="set-slider-val" id="val-think-budget">${llmConfig.thinkingBudget || 8000}</span></div>
                                <input type="range" min="1000" max="32000" step="1000" value="${llmConfig.thinkingBudget || 8000}" class="set-slider" id="os-thinking-budget">
                            </div>
                        </div>

                        <div class="set-group">
                            <div class="set-label">🔌 測試 API 連線</div>
                            <div class="btn-test" id="os-test-btn">發送測試訊息</div>
                            <div id="os-test-result" style="display:none; margin-top:10px; background:rgba(228,232,245,0.90); border-radius:4px; padding:12px; font-size:12px; color:#3A3F5C; font-family:monospace; white-space:pre-wrap; word-break:break-all; max-height:120px; overflow-y:auto;"></div>
                        </div>
                    </div>

                    <div id="view-sec-llm" class="api-subview" style="display:none;">
                        <div style="background:rgba(26,28,40,0.06); padding:10px; border-radius:4px; margin-bottom:15px; border:1px solid rgba(26,28,40,0.15); font-size:12px; color:#1A1C28; line-height:1.6;">
                            ℹ️ <b>副模型</b> 用於寵物聊天、路人NPC對話等輕量任務。建議使用 Gemini Flash 或 GPT-4o-mini 等快速模型。
                        </div>

                        <div class="set-group"${stHide}>
                            <div class="set-label">
                                <span>🔗 跟隨酒館主系統</span>
                                <label class="toggle-switch"><input type="checkbox" id="sec-system-api" ${secLlmConfig.useSystemApi ? 'checked' : ''}><span class="slider"></span></label>
                            </div>
                            <div id="sec-st-profile-group" class="${secLlmConfig.useSystemApi ? '' : 'hidden'}" style="margin-top:10px; border-top:1px solid rgba(26,28,40,0.10); padding-top:10px;">
                                <div class="set-label">選擇連接預設 (Profile)</div>
                                <select class="set-select" id="sec-st-profile">${secondaryProfileOpts}</select>
                                <div id="sec-st-profile-info" style="margin-top:6px; font-size:11px; color:rgba(26,28,40,0.72); word-break:break-all; line-height:1.6;"></div>
                            </div>
                        </div>

                        <div class="set-group" id="sec-sync-primary-group" style="${secLlmConfig.useSystemApi ? 'display:none;' : ''}">
                             <div class="set-label">
                                <span>🔗 同步主模型 URL 與 Key</span>
                                <label class="toggle-switch"><input type="checkbox" id="sec-sync-primary" ${secLlmConfig.syncWithPrimary ? 'checked' : ''}><span class="slider"></span></label>
                            </div>
                            <div class="set-desc">開啟後，自動共用主模型的 API 地址與密鑰，模型選項仍可獨立選擇。</div>
                        </div>

                        <div class="set-group" id="sec-manual-api-group" style="${(secLlmConfig.useSystemApi || secLlmConfig.syncWithPrimary) ? 'display:none;' : 'display:flex;'}">
                            <div><div class="set-label">手動 API 地址</div><input class="set-input" id="sec-api-url" placeholder="http://..." value="${secLlmConfig.url}"></div>
                            <div style="margin-top:10px;"><div class="set-label">API Key</div><input class="set-input" id="sec-api-key" type="password" value="${secLlmConfig.key}"></div>
                        </div>

                        <div class="set-group">
                            <div class="set-label">選擇模型</div>
                            <div id="sec-model-system-notice" class="${secLlmConfig.useSystemApi ? '' : 'hidden'}" style="background:rgba(26,28,40,0.06); padding:10px; border-radius:4px; font-size:12px; color:#1A1C28; border:1px solid rgba(26,28,40,0.15);">
                                🔗 已跟隨酒館主系統，模型由酒館決定。<br>直接在酒館介面切換模型即可，無需在此設定。
                            </div>
                            <div class="model-row ${secLlmConfig.useSystemApi ? 'hidden' : ''}" id="sec-model-row">
                                <select class="set-select" id="sec-api-model"><option value="${secLlmConfig.model}">${secLlmConfig.model} (當前)</option></select>
                                <div class="btn-fetch" id="sec-fetch-btn" title="${isStandalone ? '拉取模型清單' : '從端點同步'}">${isStandalone ? '<i class="fa-solid fa-microchip"></i>' : '🔄'}</div>
                            </div>
                        </div>

                        <div class="set-group">
                            <div class="set-label">
                                <span>僅讀取摘要 (Save Tokens)</span>
                                <label class="toggle-switch"><input type="checkbox" id="sec-summary-mode" ${secLlmConfig.enableSummaryOnly ? 'checked' : ''}><span class="slider"></span></label>
                            </div>
                        </div>

                        <div class="set-group"${stHide}>
                            <div class="set-label">
                                <span>📋 注入 Preset 自訂條目</span>
                                <label class="toggle-switch"><input type="checkbox" id="sec-use-preset-prompts" ${secLlmConfig.usePresetPrompts ? 'checked' : ''}><span class="slider"></span></label>
                            </div>
                            <div id="sec-preset-name-group" style="margin-top:10px; display:${secLlmConfig.usePresetPrompts ? 'flex' : 'none'}; gap:8px; align-items:center;">
                                <select class="set-select" id="sec-preset-name" style="flex:1;">
                                    <option value="">（使用當前 in_use Preset）</option>
                                </select>
                                <div class="btn-fetch" id="sec-preset-refresh-btn" title="重新整理 Preset 列表" style="flex-shrink:0;">🔄</div>
                            </div>
                        </div>

                        <div class="set-group">
                            <div class="set-slider-container">
                                <div class="set-label"><span>Max Tokens</span></div>
                                <input type="number" min="100" max="200000" step="100" value="${secLlmConfig.maxTokens}" class="set-input" id="sec-max-tokens" style="margin-top:6px; width:100%;">
                            </div>
                            <div class="set-slider-container" style="margin-top:10px;">
                                <div class="set-label"><span>Temperature</span><span class="set-slider-val" id="sec-val-temp">${secLlmConfig.temperature}</span></div>
                                <input type="range" min="0" max="2" step="0.05" value="${secLlmConfig.temperature}" class="set-slider" id="sec-temperature">
                            </div>
                            <div class="set-slider-container" style="margin-top:10px;">
                                <div class="set-label"><span>Top P</span><span class="set-slider-val" id="sec-val-topp">${secLlmConfig.top_p ?? 1.0}</span></div>
                                <input type="range" min="0" max="1" step="0.01" value="${secLlmConfig.top_p ?? 1.0}" class="set-slider" id="sec-top-p">
                            </div>
                            <div class="set-slider-container" style="margin-top:10px;">
                                <div class="set-label"><span>Frequency Penalty</span><span class="set-slider-val" id="sec-val-freq">${secLlmConfig.frequency_penalty ?? 0}</span></div>
                                <input type="range" min="-2" max="2" step="0.01" value="${secLlmConfig.frequency_penalty ?? 0}" class="set-slider" id="sec-freq-penalty">
                            </div>
                            <div class="set-slider-container" style="margin-top:10px;">
                                <div class="set-label"><span>Presence Penalty</span><span class="set-slider-val" id="sec-val-pres">${secLlmConfig.presence_penalty ?? 0}</span></div>
                                <input type="range" min="-2" max="2" step="0.01" value="${secLlmConfig.presence_penalty ?? 0}" class="set-slider" id="sec-pres-penalty">
                            </div>
                        </div>

                        <div class="set-group">
                            <div class="set-label">🔌 測試 API 連線</div>
                            <div class="btn-test" id="sec-test-btn">發送測試訊息</div>
                            <div id="sec-test-result" style="display:none; margin-top:10px; background:rgba(228,232,245,0.90); border-radius:4px; padding:12px; font-size:12px; color:#3A3F5C; font-family:monospace; white-space:pre-wrap; word-break:break-all; max-height:120px; overflow-y:auto;"></div>
                        </div>
                    </div>
                    </div><!-- /view-api -->

                    <div id="view-img" class="tab-view hidden">
                        <div class="gal-subtab-row">
                            <div class="gal-subtab active" data-galtab="api"    onclick="_switchOsGalTab(this,'api')">圖片設置</div>
                            <div class="gal-subtab" data-galtab="avatar" onclick="_switchOsGalTab(this,'avatar')">頭像</div>
                            <div class="gal-subtab" data-galtab="bg"     onclick="_switchOsGalTab(this,'bg')">背景</div>
                            <div class="gal-subtab" data-galtab="scene"  onclick="_switchOsGalTab(this,'scene')">插圖</div>
                        </div>
                        <div id="view-img-api" class="img-subtab-view">

                        <!-- ── 子分頁鈕：背景 / 角色 ── -->
                        <div class="img-srctab-row">
                            <div class="img-srctab" id="img-srctab-char" data-imgsrctab="char" onclick="window._switchImgSrcTab && window._switchImgSrcTab('char')">角色</div>
                            <div class="img-srctab" id="img-srctab-bg" data-imgsrctab="bg" onclick="window._switchImgSrcTab && window._switchImgSrcTab('bg')">背景</div>
                        </div>

                        <!-- ── 🎭 角色 分頁 body（活物：角色・頭像・插圖）── -->
                        <div id="img-tab-char" class="img-srctab-body">
                            <div class="set-group">
                                <div class="set-label">🎭 角色・🎬 插圖 來源</div>
                                <select class="set-select" id="img-service-living">
                                    <option value="pollinations" ${(imgConfig.serviceLiving || imgConfig.service) === 'pollinations' ? 'selected' : ''}>✨ Pollinations</option>
                                    <option value="novelai" ${(imgConfig.serviceLiving || imgConfig.service) === 'novelai' ? 'selected' : ''}>💎 NovelAI</option>
                                    <option value="tavern_sd" ${(imgConfig.serviceLiving || imgConfig.service) === 'tavern_sd' ? 'selected' : ''}>🎨 酒館原生</option>
                                    <option value="comfyui_direct" ${(imgConfig.serviceLiving || imgConfig.service) === 'comfyui_direct' ? 'selected' : ''}>🧩 ComfyUI 直連</option>
                                </select>
                                <div class="set-desc" style="margin-top:6px;">角色／頭像／場景插圖都用這個來源。</div>
                            </div>
                            <div class="set-group">
                                <div class="set-label">📐 角色頭像尺寸 <span style="font-weight:normal; color:rgba(26,28,40,0.72); font-size:11px;">空＝各接口預設(Poll 512 / NAI 1024)</span></div>
                                <select class="set-select" id="img-avatar-size" style="font-size:12px;">
                                    <option value=""          ${!(imgConfig.avatarSize) ? 'selected':''}>跟各接口預設</option>
                                    <option value="512x512"   ${imgConfig.avatarSize==='512x512'   ? 'selected':''}>512×512（方形）</option>
                                    <option value="768x768"   ${imgConfig.avatarSize==='768x768'   ? 'selected':''}>768×768</option>
                                    <option value="1024x1024" ${imgConfig.avatarSize==='1024x1024' ? 'selected':''}>1024×1024（清晰）</option>
                                    <option value="832x1216"  ${imgConfig.avatarSize==='832x1216'  ? 'selected':''}>832×1216（NAI 直幅）</option>
                                </select>
                            </div>
                        </div>

                        <!-- ── 🌄 背景 分頁 body（死物：背景・物品）── -->
                        <div id="img-tab-bg" class="img-srctab-body" style="display:none;">
                            <div class="set-group">
                                <div class="set-label">
                                    <span>🔗 同步角色來源</span>
                                    <label class="toggle-switch"><input type="checkbox" id="img-sync-bg-to-char"><span class="slider"></span></label>
                                </div>
                                <div class="set-desc">開啟後，背景和角色用同一個來源，不用再貼一次帳號。</div>
                            </div>
                            <div class="set-group" id="img-bg-source-group">
                                <div class="set-label">🌄 背景・📦 物品 來源</div>
                                <select class="set-select" id="img-service-inanimate">
                                    <option value="pollinations" ${(imgConfig.serviceInanimate || imgConfig.service) === 'pollinations' ? 'selected' : ''}>✨ Pollinations</option>
                                    <option value="novelai" ${(imgConfig.serviceInanimate || imgConfig.service) === 'novelai' ? 'selected' : ''}>💎 NovelAI</option>
                                    <option value="tavern_sd" ${(imgConfig.serviceInanimate || imgConfig.service) === 'tavern_sd' ? 'selected' : ''}>🎨 酒館原生</option>
                                    <option value="comfyui_direct" ${(imgConfig.serviceInanimate || imgConfig.service) === 'comfyui_direct' ? 'selected' : ''}>🧩 ComfyUI 直連</option>
                                </select>
                            </div>
                            <div class="set-group" id="img-bg-synced-note" style="display:none;">
                                <div class="set-desc" id="img-bg-synced-note-text">（與角色相同）</div>
                            </div>
                            <div class="set-group">
                                <div class="set-label">📐 背景尺寸 <span style="font-weight:normal; color:rgba(26,28,40,0.72); font-size:11px;">所有接口共用</span></div>
                                <select class="set-select" id="img-bg-size" style="font-size:12px;">
                                    <option value="1024x768"  ${(imgConfig.bgSize||'1024x768')==='1024x768'  ? 'selected':''}>1024×768（橫幅，預設）</option>
                                    <option value="1024x1024" ${(imgConfig.bgSize||'1024x768')==='1024x1024' ? 'selected':''}>1024×1024（方形）</option>
                                    <option value="1216x832"  ${(imgConfig.bgSize||'1024x768')==='1216x832'  ? 'selected':''}>1216×832（寬幅）</option>
                                    <option value="1280x720"  ${(imgConfig.bgSize||'1024x768')==='1280x720'  ? 'selected':''}>1280×720（16:9）</option>
                                </select>
                                <div class="set-label" style="margin-top:12px;">🌄 背景生圖底詞</div>
                                <textarea class="set-textarea" id="vncfg-bg-prompt" style="min-height:55px;">${vnD.bgBasePrompt || ''}</textarea>
                                <div class="set-label" style="margin-top:8px;">🚫 背景 Negative</div>
                                <textarea class="set-textarea" id="vncfg-bg-neg" style="min-height:45px;">${vnD.bgNegPrompt || ''}</textarea>
                            </div>
                        </div>

                        <!-- ── 共用接口設定區（一次只顯示一個，由 refreshImgPanel 控制）── -->
                        <div id="img-iface-groups">

                            <div id="img-group-comfyui" class="${((imgConfig.serviceInanimate || imgConfig.service) === 'comfyui_direct' || (imgConfig.serviceLiving || imgConfig.service) === 'comfyui_direct') ? '' : 'hidden'}">
                                <div class="iface-section-title is-first">🔌 連線設定</div>
                                <div class="set-group">
                                    <div class="set-desc">🧩 連接你電腦上的 ComfyUI，在這裡加 LoRA、調參數就好，其餘都自動處理。</div>
                                </div>
                                <div class="set-group">
                                    <div class="set-label">ComfyUI 網址</div>
                                    <div style="display:flex; gap:8px;">
                                        <input class="set-input" id="img-cfd-url" type="text" placeholder="http://127.0.0.1:8188" value="${imgConfig.comfyuiDirect?.url || 'http://127.0.0.1:8188'}" style="flex:1;">
                                        <button class="set-btn" id="img-cfd-test" type="button" style="white-space:nowrap;">🔌 測試 / 抓清單</button>
                                    </div>
                                    <div class="set-desc" id="img-cfd-status" style="margin-top:6px;"></div>
                                </div>
                                <div class="set-group">
                                    <div class="set-label">⚙️ 進階設定 <span style="font-weight:normal; color:rgba(26,28,40,0.72); font-size:11px;">想用自己的工作流再開，否則不用碰</span></div>
                                    <select class="set-select" id="img-cfd-wfmode">
                                        <option value="auto" ${(imgConfig.comfyuiDirect?.workflowMode||'auto')!=='custom'?'selected':''}>自動（推薦，在下面設定就好）</option>
                                        <option value="custom" ${imgConfig.comfyuiDirect?.workflowMode==='custom'?'selected':''}>自訂（貼自己的工作流）</option>
                                    </select>
                                    <div id="img-cfd-custom-wf" class="${imgConfig.comfyuiDirect?.workflowMode==='custom'?'':'hidden'}" style="margin-top:8px;">
                                        <textarea class="set-textarea" id="img-cfd-custom-wf-text" style="min-height:120px; font-family:monospace; font-size:11px; white-space:pre;" placeholder='貼 ComfyUI「API 格式」工作流，例如 { "3": {...}, "4": {...} }'>${imgConfig.comfyuiDirect?.customWorkflow || ''}</textarea>
                                        <div class="set-desc" style="margin-top:4px;">
                                            貼 ComfyUI <b>API 格式</b>工作流（ComfyUI 設定開 Dev mode → 選單「Save (API Format)」匯出）。<br>
                                            要奧瑞亞注入的地方用變數（含引號整個替換）：<code>"%prompt%"</code>　<code>"%negative%"</code>　<code>"%model%"</code>　<code>"%seed%"</code>　<code>"%width%"</code>　<code>"%height%"</code><br>
                                            ⚠️ 只有上面這幾個變數會被注入；其餘（LoRA、採樣器、放大、修臉…）請直接寫死在你的工作流裡，奧瑞亞不會碰。下面的 LoRA/參數欄在自訂模式<b>不生效</b>。
                                        </div>
                                    </div>
                                </div>
                                <div class="set-group">
                                    <div class="set-label">📦 預設包 <span style="font-weight:normal; color:rgba(26,28,40,0.72); font-size:11px;">把整組設定存起來，一鍵切換</span></div>
                                    <button class="set-btn" id="img-cfd-preset-open" type="button" onclick="window._cfdPreset.open()" style="margin-top:4px;">📦 打開預設包 · ${(imgConfig.comfyuiDirect?.presets || []).length} 個</button>
                                    <div class="set-desc" style="margin-top:4px;">每個包存一組設定，可存預覽圖、套用、刪除。改完記得到底部按儲存。</div>
                                </div>
                                <!-- 預設包 modal（可視化卡片牆） -->
                                <div id="img-cfd-preset-modal" style="display:none; position:fixed; inset:0; z-index:99999; background:rgba(0,0,0,0.55); align-items:center; justify-content:center;">
                                    <div style="background:#f5f3ee; width:min(560px,92vw); max-height:86vh; border-radius:12px; padding:16px; overflow:auto; box-shadow:0 10px 40px rgba(0,0,0,0.4);">
                                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
                                            <div style="font-size:15px; font-weight:700; color:#1A1C28;">📦 預設包</div>
                                            <span style="cursor:pointer; font-size:18px; color:#1A1C28; padding:0 6px;" onclick="window._cfdPreset.close()">✕</span>
                                        </div>
                                        <div style="font-size:11px; color:rgba(26,28,40,0.7); margin-bottom:4px;">🎨 預覽測試詞（每個包都用這句生縮圖，只比風格差異）</div>
                                        <input id="img-cfd-preview-prompt" class="set-input" style="width:100%; margin-bottom:12px;" value="${(imgConfig.comfyuiDirect?.previewPrompt || '1 person, upper body portrait, looking at viewer, simple background').replace(/"/g,'&quot;')}">
                                        <div id="img-cfd-preset-grid" style="display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:10px;"></div>
                                        <div style="display:flex; gap:6px; align-items:center; margin-top:14px; border-top:1px solid rgba(26,28,40,0.12); padding-top:12px;">
                                            <input id="img-cfd-preset-newname" class="set-input" placeholder="新預設包名稱（如：日常動漫）" style="flex:1;">
                                            <button class="set-btn" type="button" onclick="window._cfdPreset.saveNew()" style="white-space:nowrap;">➕ 從目前設定另存</button>
                                        </div>
                                        <div class="cfd-pack-io-row">
                                            <button class="set-btn" type="button" onclick="window._cfdPreset.importPack()">📥 匯入預設包檔</button>
                                            <button class="set-btn" type="button" onclick="window._cfdPreset.exportPack()">📤 匯出全部</button>
                                            <input type="file" id="img-cfd-preset-file" accept=".json,application/json" class="cfd-pack-file-hidden">
                                        </div>
                                        <div class="cfd-pack-io-hint">拿到別人分享的畫風包檔，按「匯入」讀進來；「匯出」會把整面卡片牆存成一個檔，可以分享給朋友。同名的包匯入時會直接更新。</div>
                                    </div>
                                </div>
                                <div class="set-group">
                                    <div class="set-label">模型類型</div>
                                    <select class="set-select" id="img-cfd-type">
                                        <option value="checkpoint" ${(imgConfig.comfyuiDirect?.modelType||'checkpoint')==='checkpoint'?'selected':''}>標準 Checkpoint（SDXL/Illustrious/Pony…）</option>
                                        <option value="flux" ${imgConfig.comfyuiDirect?.modelType==='flux'?'selected':''}>Flux（單體，需 clip_l/t5xxl/ae）</option>
                                        <option value="anima" ${imgConfig.comfyuiDirect?.modelType==='anima'?'selected':''}>Anima（自然語言動漫，需 qwen 編碼器＋VAE）</option>
                                    </select>
                                </div>
                                <div class="set-group">
                                    <div class="set-label">模型</div>
                                    <select class="set-select" id="img-cfd-model">
                                        <option value="${imgConfig.comfyuiDirect?.model || ''}" selected>${imgConfig.comfyuiDirect?.model || '（先按上面「測試 / 抓清單」）'}</option>
                                    </select>
                                </div>
                                <div class="set-group ${imgConfig.comfyuiDirect?.modelType==='flux'?'':'hidden'}" id="img-cfd-flux-fields">
                                    <div class="set-desc">Flux 專用搭配檔（檔名一般跟你下載的一致，不用改）：</div>
                                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:6px;">
                                        <div><div class="set-label" style="font-size:11px;">clip_l</div><input class="set-input" id="img-cfd-clipl" value="${imgConfig.comfyuiDirect?.fluxClipL || 'clip_l.safetensors'}"></div>
                                        <div><div class="set-label" style="font-size:11px;">t5xxl</div><input class="set-input" id="img-cfd-t5xxl" value="${imgConfig.comfyuiDirect?.fluxT5 || 't5xxl_fp8_e4m3fn.safetensors'}"></div>
                                        <div><div class="set-label" style="font-size:11px;">ae VAE</div><input class="set-input" id="img-cfd-ae" value="${imgConfig.comfyuiDirect?.fluxAe || 'ae.safetensors'}"></div>
                                        <div><div class="set-label" style="font-size:11px;">Guidance（建議 3.5）</div><input class="set-input" id="img-cfd-guidance" type="number" step="0.1" min="0" max="10" value="${imgConfig.comfyuiDirect?.guidance ?? 3.5}"></div>
                                    </div>
                                    <div class="set-desc" style="margin-top:4px;">Flux 模式：CFG 自動＝1、引導靠 Guidance；上面「模型」要選 diffusion_models 裡的 Flux（按測試會自動列出）。</div>
                                </div>
                                <div class="set-group ${imgConfig.comfyuiDirect?.modelType==='anima'?'':'hidden'}" id="img-cfd-anima-fields">
                                    <div class="set-desc">Anima 專用搭配檔（檔名跟你下載的一致，通常不用改）：</div>
                                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:6px;">
                                        <div><div class="set-label" style="font-size:11px;">文字編碼器（qwen）</div><input class="set-input" id="img-cfd-anima-clip" value="${imgConfig.comfyuiDirect?.animaClip || 'qwen_3_06b_base.safetensors'}"></div>
                                        <div><div class="set-label" style="font-size:11px;">VAE（qwen）</div><input class="set-input" id="img-cfd-anima-vae" value="${imgConfig.comfyuiDirect?.animaVae || 'qwen_image_vae.safetensors'}"></div>
                                    </div>
                                    <div class="set-desc" style="margin-top:4px;">Anima 模式：自然語言提示詞、CFG 自動≈4、採樣 er_sde/simple；上面「模型」要選 diffusion_models 裡的 anima-base（按測試會自動列出）。</div>
                                </div>
                                <div class="set-group">
                                    <div class="set-label">LoRA（開關 ☑ + 名字 + 模型/CLIP 強度）</div>
                                    <datalist id="img-cfd-lora-list"></datalist>
                                    <div id="img-cfd-loras"></div>
                                    <button class="set-btn" id="img-cfd-add-lora" type="button" style="margin-top:6px;">➕ 加 LoRA</button>
                                    <div class="set-desc" style="margin-top:4px;">LoRA 要跟模型同架構（SDXL 配 SDXL）。名字可下拉選或手打檔名。</div>
                                </div>
                                <div class="set-group">
                                    <div class="set-label">基本參數</div>
                                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:6px;">
                                        <div><div class="set-label" style="font-size:11px;">採樣器</div><select class="set-select" id="img-cfd-sampler">${['euler','euler_ancestral','euler_cfg_pp','dpmpp_2m','dpmpp_2m_sde','dpmpp_3m_sde','dpmpp_sde','dpmpp_2s_ancestral','heun','dpm_2','lms','ddim','uni_pc','uni_pc_bh2','lcm','res_multistep','er_sde'].map(s => `<option value="${s}"${(imgConfig.comfyuiDirect?.sampler||'euler')===s?' selected':''}>${s}</option>`).join('')}</select></div>
                                        <div><div class="set-label" style="font-size:11px;">排程器</div><select class="set-select" id="img-cfd-scheduler">${['normal','karras','exponential','sgm_uniform','simple','ddim_uniform','beta','linear_quadratic','kl_optimal'].map(s => `<option value="${s}"${(imgConfig.comfyuiDirect?.scheduler||'normal')===s?' selected':''}>${s}</option>`).join('')}</select></div>
                                        <div><div class="set-label" style="font-size:11px;">步數</div><input class="set-input" id="img-cfd-steps" type="number" min="1" max="60" value="${imgConfig.comfyuiDirect?.steps ?? 28}"></div>
                                        <div><div class="set-label" style="font-size:11px;">CFG</div><input class="set-input" id="img-cfd-cfg" type="number" step="0.1" min="1" max="20" value="${imgConfig.comfyuiDirect?.cfg ?? 6.5}"></div>
                                        <div><div class="set-label" style="font-size:11px;">寬度</div><input class="set-input" id="img-cfd-width" type="number" step="64" value="${imgConfig.comfyuiDirect?.width ?? 1024}"></div>
                                        <div><div class="set-label" style="font-size:11px;">高度</div><input class="set-input" id="img-cfd-height" type="number" step="64" value="${imgConfig.comfyuiDirect?.height ?? 1024}"></div>
                                        <div><div class="set-label" style="font-size:11px;">種子（-1 隨機）</div><input class="set-input" id="img-cfd-seed" type="number" value="${imgConfig.comfyuiDirect?.seed ?? -1}"></div>
                                        <div><div class="set-label" style="font-size:11px;">CLIP skip（0 關）</div><input class="set-input" id="img-cfd-clipskip" type="number" min="0" max="4" value="${imgConfig.comfyuiDirect?.clipSkip ?? 0}"></div>
                                        <div style="grid-column:1 / -1;"><div class="set-label" style="font-size:11px;">VAE（空＝模型內建）</div><select class="set-select" id="img-cfd-vae"><option value=""${!imgConfig.comfyuiDirect?.vae?' selected':''}>（內建 VAE）</option>${imgConfig.comfyuiDirect?.vae?`<option value="${imgConfig.comfyuiDirect.vae}" selected>${imgConfig.comfyuiDirect.vae}</option>`:''}</select></div>
                                    </div>
                                </div>
                                <div class="set-group">
                                    <div class="set-label">🖼️ 場景插圖品質 <span class="ist-hint">只在「場景插圖」自動套用（頭像不套；會變慢）</span></div>
                                    <div class="cfd-scene-row">
                                        <label class="cfd-scene-chk">
                                            <input type="checkbox" id="img-cfd-scene-hires" ${imgConfig.comfyuiDirect?.sceneHires !== false ? 'checked' : ''}>🔬 高清修復
                                        </label>
                                        <select class="set-select cfd-scene-scale" id="img-cfd-scene-hires-scale">
                                            <option value="1.5" ${String(imgConfig.comfyuiDirect?.sceneHiresScale ?? 1.5)==='1.5'?'selected':''}>1.5x</option>
                                            <option value="2" ${String(imgConfig.comfyuiDirect?.sceneHiresScale)==='2'?'selected':''}>2x</option>
                                        </select>
                                        <label class="cfd-scene-chk">
                                            <input type="checkbox" id="img-cfd-scene-facedetailer" ${imgConfig.comfyuiDirect?.sceneFaceDetailer !== false ? 'checked' : ''}>🎯 FaceDetailer 修臉
                                        </label>
                                    </div>
                                    <div class="set-desc">需 ComfyUI 裝 Impact Pack（你已裝）。場景小臉/遠景眼睛會清楚很多，代價是每張場景多花十幾秒。</div>
                                </div>
                                <div class="iface-section-title">📝 提示詞（底詞）</div>
                                <div class="set-group">
                                    <div class="field-row">
                                        <div class="set-label">底詞（選填，可空）</div>
                                        <textarea class="set-textarea" id="img-cfd-base">${imgConfig.comfyuiDirect?.basePrompt || ''}</textarea>
                                    </div>
                                    <div class="field-row">
                                        <div class="set-label">負面提示詞（選填）</div>
                                        <textarea class="set-textarea" id="img-cfd-neg">${imgConfig.comfyuiDirect?.negPrompt || ''}</textarea>
                                    </div>
                                </div>
                            </div>

                            <div id="img-group-tavernsd" class="${((imgConfig.serviceInanimate || imgConfig.service) === 'tavern_sd' || (imgConfig.serviceLiving || imgConfig.service) === 'tavern_sd') ? '' : 'hidden'}">
                                <div class="iface-section-title is-first">🔌 連線設定</div>
                                <div class="set-group">
                                    <div class="set-desc">🎨 用酒館原生「圖像生成」擴展的後端生圖（你在那邊設好的 WebUI / ComfyUI / NAI / Horde…）。提示詞交給你的後端＋酒館共用前綴處理，奧瑞亞不額外加底詞。</div>
                                    <div class="set-desc">⚠️ 前提：先在酒館「圖像生成」擴展設好一個後端來源。沒設好會跳提示，不會偷偷換成別的來源。</div>
                                </div>
                            </div>

                            <div id="img-group-pollinations" class="${((imgConfig.serviceInanimate || imgConfig.service) === 'pollinations' || (imgConfig.serviceLiving || imgConfig.service) === 'pollinations') ? '' : 'hidden'}">
                                <div class="iface-section-title is-first">🔌 連線設定</div>
                                <div class="set-group">
                                    <div class="field-row">
                                        <div class="set-label">API Key <span class="lbl-req">(必填 - 需儲值)</span></div>
                                        <input class="set-input" id="img-pol-apikey" type="password" placeholder="請輸入 Pollinations API Key..." value="${imgConfig.pollinations.apiKey || ''}">
                                        <div class="set-desc">* 現在已無免費方案，請至官網獲取 Key。</div>
                                    </div>
                                    <div class="field-row">
                                        <div class="set-label">模型 (按價格排序)</div>
                                        <select class="set-select" id="img-pol-model">
                                            <option value="flux" ${imgConfig.pollinations.model === 'flux' ? 'selected' : ''}>🟢 Flux Schnell (0.001p)</option>
                                            <option value="zimage" ${imgConfig.pollinations.model === 'zimage' ? 'selected' : ''}>🟢 Z-Image Turbo (0.002p)</option>
                                            <option value="flux-2-dev" ${imgConfig.pollinations.model === 'flux-2-dev' ? 'selected' : ''}>🔵 FLUX.2 Dev Alpha (0.001p)</option>
                                            <option value="imagen-4" ${imgConfig.pollinations.model === 'imagen-4' ? 'selected' : ''}>🔵 Imagen 4 Alpha (0.0025p)</option>
                                            <option value="grok-imagine" ${imgConfig.pollinations.model === 'grok-imagine' ? 'selected' : ''}>🔵 Grok Imagine Alpha (0.0025p)</option>
                                            <option value="klein" ${imgConfig.pollinations.model === 'klein' ? 'selected' : ''}>🟠 FLUX.2 Klein 4B (0.01p)</option>
                                            <option value="gptimage" ${imgConfig.pollinations.model === 'gptimage' ? 'selected' : ''}>🔴 GPT Image 1 Mini (高消耗)</option>
                                            <option value="klein-large" ${imgConfig.pollinations.model === 'klein-large' ? 'selected' : ''}>🟠 FLUX.2 Klein 9B (0.015p)</option>
                                        </select>
                                    </div>
                                    <div class="set-desc">📐 尺寸已改到各部位分頁各自調：角色頭像在「🎭 頭像」、背景在「🌄 背景」、場景在「🎬 插圖」。</div>
                                </div>
                            </div>

                            <div id="img-group-nai" class="${((imgConfig.serviceInanimate || imgConfig.service) === 'novelai' || (imgConfig.serviceLiving || imgConfig.service) === 'novelai') ? '' : 'hidden'}">
                                <div class="iface-section-title is-first">🔌 連線設定</div>
                                <div class="set-group">
                                    <div class="field-row">
                                        <div class="set-label">NovelAI Token <span class="lbl-req">(必填)</span></div>
                                        <input class="set-input" id="img-nai-token" type="password" placeholder="pst-..." value="${imgConfig.novelai.token}">
                                    </div>
                                    <div class="field-row">
                                        <div class="set-label"><span>🛡️ 防超免費尺寸（防誤扣 Anlas）</span><label class="toggle-switch"><input type="checkbox" id="img-nai-cap-free" ${imgConfig.novelai.capFreeSize !== false ? 'checked' : ''}><span class="slider"></span></label></div>
                                        <div class="set-desc">開啟＝NAI 生圖超過 1024×1024（Opus 免 Anlas 上限）自動等比縮回，防誤設大圖扣點數。想花 Anlas 出大圖再關。</div>
                                    </div>
                                    <div class="field-row">
                                        <div class="set-label">模型版本</div>
                                        <select class="set-select" id="img-nai-model">
                                            <option value="nai-diffusion-3" ${imgConfig.novelai.model === 'nai-diffusion-3' ? 'selected' : ''}>V3 Anime（最省 Anlas）</option>
                                            <option value="nai-diffusion-4-curated-preview" ${imgConfig.novelai.model === 'nai-diffusion-4-curated-preview' ? 'selected' : ''}>V4 Curated（動漫精選）</option>
                                            <option value="nai-diffusion-4-full" ${imgConfig.novelai.model === 'nai-diffusion-4-full' ? 'selected' : ''}>V4 Full（開放風格）</option>
                                            <option value="nai-diffusion-4-5-full" ${imgConfig.novelai.model === 'nai-diffusion-4-5-full' ? 'selected' : ''}>V4.5 Full（最新/寫實佳）</option>
                                        </select>
                                    </div>
                                    <div class="nai-adv">
                                        <div class="nai-adv-head" onclick="this.closest('.nai-adv').classList.toggle('open')">
                                            <span>⚙️ 進階參數 <span class="ist-hint">（不懂可不動，預設跟官方一致）</span></span>
                                            <span class="nai-adv-arrow"></span>
                                        </div>
                                        <div class="nai-adv-body">
                                            <div class="field-grid-2">
                                                <div>
                                                    <div class="set-label">Sampler</div>
                                                    <select class="set-select" id="img-nai-sampler">
                                                        <option value="k_euler_ancestral" ${(imgConfig.novelai.sampler||'k_euler_ancestral')==='k_euler_ancestral'?'selected':''}>k_euler_ancestral（預設）</option>
                                                        <option value="k_euler" ${imgConfig.novelai.sampler==='k_euler'?'selected':''}>k_euler</option>
                                                        <option value="k_dpmpp_2m" ${imgConfig.novelai.sampler==='k_dpmpp_2m'?'selected':''}>k_dpmpp_2m（V4.5 推薦）</option>
                                                        <option value="k_dpmpp_2s_ancestral" ${imgConfig.novelai.sampler==='k_dpmpp_2s_ancestral'?'selected':''}>k_dpmpp_2s_ancestral</option>
                                                        <option value="k_dpmpp_sde" ${imgConfig.novelai.sampler==='k_dpmpp_sde'?'selected':''}>k_dpmpp_sde</option>
                                                        <option value="k_dpmpp_2m_sde" ${imgConfig.novelai.sampler==='k_dpmpp_2m_sde'?'selected':''}>k_dpmpp_2m_sde（底板C）</option>
                                                        <option value="ddim_v3" ${imgConfig.novelai.sampler==='ddim_v3'?'selected':''}>ddim_v3（V4 限定）</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <div class="set-label">CFG Scale <span class="lbl-opt">（建議 4~9）</span></div>
                                                    <input class="set-input" type="number" id="img-nai-scale" min="1" max="20" step="0.5" value="${imgConfig.novelai.scale ?? 5}">
                                                </div>
                                                <div>
                                                    <div class="set-label">Steps <span class="lbl-opt">（建議 28~40）</span></div>
                                                    <input class="set-input" type="number" id="img-nai-steps" min="1" max="50" step="1" value="${imgConfig.novelai.steps ?? 28}">
                                                </div>
                                                <div>
                                                    <div class="set-label">UC Preset <span class="lbl-opt">（負詞預設）</span></div>
                                                    <select class="set-select" id="img-nai-uc-preset">
                                                        <option value="0" ${(imgConfig.novelai.ucPreset??1)===0?'selected':''}>0 - 輕量</option>
                                                        <option value="1" ${(imgConfig.novelai.ucPreset??1)===1?'selected':''}>1 - 標準（推薦）</option>
                                                        <option value="2" ${(imgConfig.novelai.ucPreset??1)===2?'selected':''}>2 - 人形強化</option>
                                                    </select>
                                                </div>
                                            </div>
                                            <div class="nai-adv-checks">
                                                <label>
                                                    <input type="checkbox" id="img-nai-quality-toggle" ${imgConfig.novelai.qualityToggle!==false?'checked':''}>
                                                    <span class="chk-label">Quality Toggle</span>
                                                </label>
                                                <label id="img-nai-smea-group" class="nai-smea-toggle${imgConfig.novelai.model==='nai-diffusion-3'?'':' is-disabled'}">
                                                    <input type="checkbox" id="img-nai-smea" ${imgConfig.novelai.smea!==false?'checked':''}>
                                                    <span class="chk-label">SMEA <span class="lbl-opt">（V3 專屬）</span></span>
                                                </label>
                                                <label id="img-nai-smea-dyn-group" class="nai-smea-toggle${imgConfig.novelai.model==='nai-diffusion-3'?'':' is-disabled'}">
                                                    <input type="checkbox" id="img-nai-smea-dyn" ${imgConfig.novelai.smeaDyn?'checked':''}>
                                                    <span class="chk-label">SMEA Dynamic</span>
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div class="iface-section-title">📝 提示詞（底詞）</div>
                                <div class="set-group">
                                    <div class="nai-preset-box">
                                        <div class="nai-preset-head">
                                            <div class="set-label">📋 提示詞預設</div>
                                            <span class="ist-hint">含底詞、負詞、Sampler、Scale</span>
                                        </div>
                                        <div class="row-inline">
                                            <select id="img-nai-preset-sel" class="set-select">
                                                <option value="">-- 選擇預設 --</option>
                                                ${(imgConfig.novelai.naiPresets || []).map((p, i) => `<option value="${i}">${p.name}</option>`).join('')}
                                            </select>
                                            <span class="nai-mini-btn" onclick="window._naiPreset.apply()">套用</span>
                                            <span class="nai-mini-btn" onclick="window._naiPreset.save()">另存</span>
                                            <span class="nai-mini-btn is-danger" onclick="window._naiPreset.del()">刪除</span>
                                        </div>
                                        <div class="row-inline nai-pack-open-row">
                                            <span class="nai-pack-open-btn" onclick="window._naiPreset.open()">📦 拖圖生預設・看預覽圖</span>
                                        </div>
                                        <div id="img-nai-preset-name-row" class="nai-preset-name-row">
                                            <div class="row-inline">
                                                <input id="img-nai-preset-name-input" class="set-input" placeholder="輸入預設名稱（如：底板A - ge_tianzun）">
                                                <span class="nai-mini-btn" onclick="window._naiPreset.confirmSave()">確認</span>
                                                <span class="nai-mini-btn is-ghost" onclick="window._naiPreset.cancelSave()">取消</span>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- 📦 NAI 拖圖預設包 modal：拖圖→解析內嵌配方→存預設(縮圖進 IndexedDB) -->
                                    <div id="img-nai-pack-modal" class="nai-pack-modal">
                                        <div class="nai-pack-box">
                                            <div class="nai-pack-head">
                                                <div class="nai-pack-title">📦 NAI 預設包（拖圖生成・含預覽）</div>
                                                <button type="button" class="nai-pack-close" onclick="window._naiPreset.close()">✕</button>
                                            </div>
                                            <div id="img-nai-pack-drop" class="nai-pack-drop">
                                                <input type="file" id="img-nai-pack-file" accept="image/png,image/webp,image/*" multiple class="nai-pack-file-hidden">
                                                <div class="nai-pack-drop-hint">把下載的 <b>NAI 原圖</b>拖進來（可一次多張），或 <span class="nai-pack-pick" onclick="document.getElementById('img-nai-pack-file').click()">點此選圖</span><br>自動讀出底詞 / 負詞 / sampler / CFG / steps，存成預設，並用這張圖當預覽。<br><span class="nai-pack-warn">⚠️ 要原圖，截圖或被轉成 JPG 的讀不到。</span></div>
                                            </div>
                                            <div id="img-nai-pack-status" class="nai-pack-status"></div>
                                            <div id="img-nai-pack-grid" class="nai-pack-grid"></div>
                                        </div>
                                    </div>

                                    <div class="field-row">
                                        <div class="set-label">🎨 角色底詞 <span class="lbl-opt">（Danbooru tag 格式，逗號分隔）</span></div>
                                        <textarea class="set-textarea" id="img-nai-char-base">${imgConfig.novelai.charBasePrompt || ''}</textarea>
                                        <div class="field-reset"><span onclick="document.getElementById('img-nai-char-base').value='masterpiece, best quality, very aesthetic, absurdres, anime style, detailed face'">[重置]</span></div>
                                    </div>
                                    <div class="field-row">
                                        <div class="set-label">🚫 角色負詞</div>
                                        <textarea class="set-textarea" id="img-nai-char-neg">${imgConfig.novelai.charNegPrompt || ''}</textarea>
                                        <div class="field-reset"><span onclick="document.getElementById('img-nai-char-neg').value='nsfw, lowres, bad anatomy, bad hands, extra fingers, missing fingers, worst quality, low quality, jpeg artifacts, signature, watermark, blurry'">[重置]</span></div>
                                    </div>
                                    <div id="img-nai-item-block" class="nai-item-stack">
                                        <div class="field-row">
                                            <div class="set-label">📦 物品底詞</div>
                                            <textarea class="set-textarea" id="img-nai-item-base">${imgConfig.novelai.itemBasePrompt || ''}</textarea>
                                            <div class="field-reset"><span onclick="document.getElementById('img-nai-item-base').value='masterpiece, best quality, white background, simple background, no background, product image, detailed'">[重置]</span></div>
                                        </div>
                                        <div class="field-row">
                                            <div class="set-label">🚫 物品負詞</div>
                                            <textarea class="set-textarea" id="img-nai-item-neg">${imgConfig.novelai.itemNegPrompt || ''}</textarea>
                                            <div class="field-reset"><span onclick="document.getElementById('img-nai-item-neg').value='person, human, character, body, face, hands, worst quality, low quality, blurry, watermark, text'">[重置]</span></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div id="img-pol-prompts-group" class="${(imgConfig.serviceLiving || imgConfig.service) === 'pollinations' ? '' : 'hidden'}">
                        <div class="iface-section-title">📝 提示詞（底詞）</div>
                        <div class="set-group">
                            <div class="field-row">
                                <div class="set-label">🎨 角色頭像通用底詞 <span class="lbl-opt">（全模組共用：夜店 / 偵探 / 寶寶 / VN頭像）</span></div>
                                <textarea class="set-textarea" id="img-style-prompt">${imgConfig.pollinations.charBasePrompt}</textarea>
                                <div class="field-hint">↑ 這裡設定的詞會自動加在所有角色頭像生圖的最前面。VN背景不受影響。VN頭像可在 VN 設定裡追加額外詞。</div>
                                <div class="field-reset"><span onclick="document.getElementById('img-style-prompt').value='anime style, 2d, cel shading, flat color, illustration, high quality, best quality, no photorealistic, no 3d, clean lines'">[重置為預設]</span></div>
                            </div>
                            <div class="field-row">
                                <div class="set-label">🚫 角色負詞</div>
                                <textarea class="set-textarea" id="img-char-neg-prompt">${imgConfig.pollinations.charNegPrompt}</textarea>
                                <div class="field-reset"><span onclick="document.getElementById('img-char-neg-prompt').value='bad anatomy, extra limbs, disfigured, blurry, low quality, worst quality, watermark, text'">[重置為預設]</span></div>
                            </div>
                        </div>
                        </div>

                        <!-- ── 🧑‍🎨 頭像追加詞（按接口，屬「角色」分頁；放在底詞區下方，不再頂在連線設定上面）── -->
                        <div id="img-avatar-add-zone">
                            <div class="set-group" id="img-avatar-add-main">
                                <div class="set-label">🧑‍🎨 頭像追加詞 <span style="font-weight:normal; color:rgba(26,28,40,0.72); font-size:11px;">插在通用底詞與角色描述之間</span></div>
                                <textarea class="set-textarea" id="vncfg-avatar-prompt" style="min-height:55px;">${vnD.avatarBasePrompt || ''}</textarea>
                                <div class="set-label" style="margin-top:8px;">🚫 頭像 Negative</div>
                                <textarea class="set-textarea" id="vncfg-avatar-neg" style="min-height:45px;">${vnD.avatarNegPrompt || ''}</textarea>
                            </div>
                            <div class="set-group" id="img-avatar-add-tav">
                                <div class="set-label">🎨 頭像追加詞（酒館原生 / ComfyUI 專用）</div>
                                <textarea class="set-textarea" id="vncfg-avatar-prompt-tavern" style="min-height:55px;">${vnD.avatarBasePromptTavern || ''}</textarea>
                                <div class="set-label" style="margin-top:8px;">🚫 頭像 Negative（酒館原生 / ComfyUI）</div>
                                <textarea class="set-textarea" id="vncfg-avatar-neg-tavern" style="min-height:45px;">${vnD.avatarNegPromptTavern || ''}</textarea>
                            </div>
                        </div>

                        <!-- ── 🎬 場景插圖（共用設定）｜屬「角色」分頁 ── -->
                        <div class="set-group" id="img-scene-block" style="border-top:1px solid rgba(26,28,40,0.12); padding-top:15px; margin-top:5px;">
                            <div class="set-label" style="font-size:13px;">🎬 場景插圖</div>
                            <div class="set-desc" style="margin-top:6px;">尺寸／風格／底詞／負詞 套用於所有場景插圖（不論主模型 [Scene|] 或下方副模型搭便車）。</div>

                            <div id="img-scene-body" style="margin-top:14px;">

                                <!-- ── 場景插圖尺寸（獨立於主圖片尺寸）── -->
                                <div style="margin-bottom:12px;">
                                    <div class="set-label" style="font-size:11px;">📐 場景插圖尺寸</div>
                                    <select class="set-select" id="img-scene-size" style="font-size:12px;" onchange="document.getElementById('img-scene-size-custom').style.display=(this.value==='custom')?'':'none';">
                                        <option value="512x512"   ${(imgConfig.sceneGen?.size||'1024x1024')==='512x512'   ? 'selected':''}>512×512（最快最省，較糊）</option>
                                        <option value="768x768"   ${(imgConfig.sceneGen?.size||'1024x1024')==='768x768'   ? 'selected':''}>768×768（平衡）</option>
                                        <option value="1024x1024" ${(imgConfig.sceneGen?.size||'1024x1024')==='1024x1024' ? 'selected':''}>1024×1024（清晰，推薦）</option>
                                        <option value="1024x768"  ${(imgConfig.sceneGen?.size||'1024x1024')==='1024x768'  ? 'selected':''}>1024×768（橫幅）</option>
                                        <option value="768x1024"  ${(imgConfig.sceneGen?.size||'1024x1024')==='768x1024'  ? 'selected':''}>768×1024（直幅）</option>
                                        <option value="1216x832"  ${(imgConfig.sceneGen?.size||'1024x1024')==='1216x832'  ? 'selected':''}>1216×832（NAI 橫幅）</option>
                                        <option value="832x1216"  ${(imgConfig.sceneGen?.size||'1024x1024')==='832x1216'  ? 'selected':''}>832×1216（NAI 直幅）</option>
                                        <option value="custom"    ${!['512x512','768x768','1024x1024','1024x768','768x1024','1216x832','832x1216'].includes(imgConfig.sceneGen?.size||'1024x1024') ? 'selected':''}>✏️ 自訂…</option>
                                    </select>
                                    <input class="set-input" id="img-scene-size-custom" type="text" placeholder="寬x高，例如 1020x1020" value="${!['512x512','768x768','1024x1024','1024x768','768x1024','1216x832','832x1216'].includes(imgConfig.sceneGen?.size||'1024x1024') ? (imgConfig.sceneGen?.size||'') : ''}" style="font-size:12px; margin-top:6px; display:${!['512x512','768x768','1024x1024','1024x768','768x1024','1216x832','832x1216'].includes(imgConfig.sceneGen?.size||'1024x1024') ? '' : 'none'};">
                                    <div style="font-size:11px; color:rgba(26,28,40,0.72); margin-top:3px;">← 越大越清晰但越耗點數。自訂填「寬x高」(數字)；多數模型建議用 64 的倍數(如 1024)。</div>
                                </div>

                                <!-- ── Prompt 風格 ── -->
                                <div style="margin-bottom:12px;">
                                    <div class="set-label" style="font-size:11px;">🎛️ Prompt 風格</div>
                                    <select class="set-select" id="img-scene-prompt-style" style="font-size:12px;"
                                        onchange="(function(v){
                                            const _sceneSvc = (typeof window.OS_IMAGE_MANAGER?.serviceFor==='function') ? window.OS_IMAGE_MANAGER.serviceFor('scene') : window.OS_IMAGE_MANAGER?.config?.service;
                                            const isPoll = v==='natural' || (v==='auto' && _sceneSvc!=='novelai');
                                            const _exT = document.getElementById('img-scene-extract-tags-row'); if (_exT) _exT.style.display = isPoll ? 'none' : '';
                                            const _exN = document.getElementById('img-scene-extract-natural-row'); if (_exN) _exN.style.display = isPoll ? '' : 'none';
                                        })(this.value)">
                                        <option value="auto" ${(imgConfig.sceneGen?.promptStyle||'auto')==='auto' ? 'selected':''}>🔀 自動（跟主服務）</option>
                                        <option value="tags" ${imgConfig.sceneGen?.promptStyle==='tags' ? 'selected':''}>🏷️ 標籤（NAI / Danbooru）</option>
                                        <option value="natural" ${imgConfig.sceneGen?.promptStyle==='natural' ? 'selected':''}>💬 自然語言（Pollinations）</option>
                                    </select>
                                </div>

                                <div class="set-desc" style="margin-bottom:12px; font-size:11px;">🎨 場景插圖跟角色共用同一份底詞／負詞——在上方「接口設定」的角色底詞調整即可，這裡不另設場景底詞。</div>
                            </div>
                        </div>

                        <div class="set-group" id="img-scene-extract-block" style="border-top:1px dashed rgba(26,28,40,0.10); padding-top:14px; margin-top:14px;">
                            <div style="display:flex; align-items:center; justify-content:space-between;">
                                <span>🖼️ 自動插圖（副模型搭便車 · 接記憶）</span>
                                <label class="toggle-switch"><input type="checkbox" id="img-scene-extract-enabled" ${imgConfig.sceneGen?.extractEnabled ? 'checked' : ''}><span class="slider"></span></label>
                            </div>
                            <div class="set-desc" style="margin-top:6px;">開啟後：每輪「記憶抽取（AVS＋向量）」那次副模型呼叫會<b>順便</b>依正文吐 2 張插圖 prompt → 自動生圖、貼進對應訊息。不勞主模型、不多花 API。（酒館／獨立版皆可）</div>
                            <div class="set-desc" style="margin-top:6px; font-size:11px; color:rgba(26,28,40,0.72);">其它觸發：① 主模型直接吐 [Scene|]（世界書開規則，最省、零額外 API）；② 此處副模型搭便車（免額外呼叫）。獨立版（PWA 專門呼叫）已退役。</div>
                            <div class="set-label" style="font-size:12px; margin-top:10px;">副模型插圖指令 <span style="font-weight:normal; color:rgba(26,28,40,0.72); font-size:11px;">隨上方「Prompt 風格」切換</span></div>
                            <div id="img-scene-extract-tags-row" style="display:${(()=>{const s=imgConfig.sceneGen?.promptStyle||'auto'; return (s==='natural'||(s==='auto'&&imgConfig.service!=='novelai')) ? 'none' : '';})()};">
                                <div style="font-size:10px; color:rgba(26,28,40,0.6); margin-bottom:3px;">🏷️ 標籤版（給 NAI / Danbooru · 五層系統）</div>
                                <textarea class="set-textarea" id="img-scene-extract-tags" style="min-height:170px; font-size:11px; font-family:monospace;">${(imgConfig.sceneGen?.extractPromptTags || '').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>
                            </div>
                            <div id="img-scene-extract-natural-row" style="display:${(()=>{const s=imgConfig.sceneGen?.promptStyle||'auto'; return (s==='natural'||(s==='auto'&&imgConfig.service!=='novelai')) ? '' : 'none';})()};">
                                <div style="font-size:10px; color:rgba(26,28,40,0.6); margin-bottom:3px;">💬 自然語言版（給 Pollinations / ComfyUI）</div>
                                <textarea class="set-textarea" id="img-scene-extract-natural" style="min-height:120px; font-size:11px; font-family:monospace;">${(imgConfig.sceneGen?.extractPromptNatural || '').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>
                            </div>
                            <div style="font-size:10px; color:rgba(26,28,40,0.72); margin-top:4px;">↑ 附加到「記憶副模型」指令叫它額外吐 scenes。選 🏷️標籤＝上面欄、💬自然語言＝下面欄；切到哪個接口就只顯示對應那欄。改這裡就能調插圖的數量／風格／規則。</div>
                        </div>

                        <div class="set-group">
                            <div class="set-label">測試生成</div>
                            <input class="set-input" id="img-test-prompt" type="text" placeholder="輸入描述..." value="a handsome man holding a rose">
                            <div class="btn-test" id="img-test-btn" style="margin-top:10px;">🎨 生成預覽</div>
                            <div id="img-test-preview" style="margin-top:15px; display:none; text-align:center;">
                                <img id="img-test-image" style="max-width:100%; border-radius:4px; border:1px solid rgba(26,28,40,0.15);" />
                                <div id="img-test-url" style="font-size:11px; color:rgba(26,28,40,0.72); margin-top:8px; word-break:break-all;"></div>
                            </div>
                        </div>

                        <div class="set-group" id="img-pixabay-block" style="border-top:1px dashed rgba(26,28,40,0.10); padding-top:14px; margin-top:14px;">
                            <div class="set-label">🆘 退路圖庫（Pixabay）</div>
                            <div class="set-desc" style="margin-bottom:8px;">Pollinations 卡住或 12 秒 timeout 時，自動從 Pixabay 抓相符照片當背景，套玻璃磨砂遮罩。免費註冊 → <a href="https://pixabay.com/api/docs/" target="_blank" style="color:#1A1C28;">pixabay.com/api/docs</a></div>
                            <input class="set-input" id="img-pixabay-key" type="password" placeholder="Pixabay API Key（空白 = 不啟用退路）" value="${imgConfig.pixabayKey || ''}">
                            <div style="margin-top:10px; display:flex; align-items:center; gap:8px;">
                                <label class="toggle-switch"><input type="checkbox" id="img-fallback-force" ${imgConfig.fallbackForce ? 'checked' : ''}><span class="slider"></span></label>
                                <span style="font-size:12px; color:#1A1C28;">🧪 強制走退路圖庫（測試用，不去 Pollinations）</span>
                            </div>
                        </div>


                        </div><!-- /view-img-api -->
                        <div id="view-img-avatar" class="img-subtab-view" style="display:none;">
                            <!-- 內層子 tab：頭像快取 vs 角色立繪 -->
                            <div style="display:flex;gap:6px;padding:0 0 10px;border-bottom:1px solid rgba(26,28,40,0.06);margin-bottom:10px;">
                                <div class="av-sub active" data-avsub="cache"  style="cursor:pointer;padding:4px 10px;font-size:12px;color:#1A1C28;border:1px solid rgba(26,28,40,0.25);border-radius:4px;background:rgba(26,28,40,0.06);" onclick="_switchAvatarSub(this,'cache')">📦 頭像快取</div>
                                <div class="av-sub"        data-avsub="sprite" style="cursor:pointer;padding:4px 10px;font-size:12px;color:rgba(26,28,40,0.72);border:1px solid #444;border-radius:4px;"                              onclick="_switchAvatarSub(this,'sprite')">🎨 角色立繪</div>
                            </div>

                            <!-- 子: 頭像快取 -->
                            <div id="avatar-sub-cache" class="avatar-sub-view">
                                <div class="set-group">
                                    <div class="set-label">🎭 角色頭像快取 <span style="font-weight:normal; color:rgba(26,28,40,0.72); font-size:11px;">防重複生圖</span></div>
                                    <div id="vncfg-avatar-mgr-list" style="margin-top:8px;"></div>
                                    <button class="set-btn" type="button" onclick="window.VN_PLAYER && window.VN_PLAYER.backupAvatarsToWorldbook && window.VN_PLAYER.backupAvatarsToWorldbook(this)">💾 備份頭像到角色世界書</button>
                                </div>
                                <div class="set-desc" style="margin-top:4px;">* 生圖已全數自動接管至 OS_IMAGE_MANAGER。備份後即使本地快取清空，也能從角色卡世界書讀回、不必重生（寫入當前角色卡主世界書，停用條目不進 AI）。</div>
                            </div>

                            <!-- 子: 角色立繪（去背工作室）-->
                            <div id="avatar-sub-sprite" class="avatar-sub-view" style="display:none;">
                                <div class="set-group">
                                    <div class="set-label">🎨 從頭像快取轉立繪 <span style="font-weight:normal; color:rgba(26,28,40,0.72); font-size:11px;">點角色 → 生立繪 → 去背 → 存（只顯示當前世界）</span></div>

                                    <div id="sprite-picker-list" style="margin-top:10px;max-height:300px;overflow-y:auto;">載入中...</div>

                                    <div id="sprite-sel-bar" class="vng-studio-sel" style="display:none;">
                                        <div class="vng-studio-sel-name" id="sprite-selected-info">尚未選擇角色</div>
                                        <textarea id="sprite-sel-prompt" class="vng-studio-prompt" placeholder="立繪 prompt（已清洗，可微調）"></textarea>
                                        <div class="vng-studio-sel-row">
                                            <select id="sprite-base-size" class="set-select" style="width:auto;flex:0 0 auto;min-width:0;" title="立繪比例：鎧甲/壯角色選寬一點、瘦角色窄的就夠；都在 NAI 免費尺寸內">
                                                <option value="512x896">512×896（窄·瘦）</option>
                                                <option value="640x896">640×896（標準）</option>
                                                <option value="704x896">704×896（寬·鎧甲）</option>
                                                <option value="768x896">768×896（超寬·厚甲）</option>
                                            </select>
                                            <select id="sprite-upscale-ratio" class="set-select" style="width:auto;flex:0 0 auto;min-width:0;" title="立繪精緻度：直接用大解析度生，治小模型的糊。立繪一次性存檔，不怕慢。">
                                                <option value="1">標準 1x（512×896）</option>
                                                <option value="1.5" selected>精緻 1.5x（768×1344）</option>
                                                <option value="2">高清 2x（1024×1792）</option>
                                            </select>
                                            <label id="sprite-hires-row" style="display:none;align-items:center;gap:4px;font-size:11px;color:#1A1C28;white-space:nowrap;cursor:pointer;" title="ComfyUI 直連專屬：base 生完→潛空間放大→二次低重繪採樣，真的補出細節（比單純放大清晰）。較慢。">
                                                <input type="checkbox" id="sprite-hires" style="margin:0;">🔬 高清修復
                                            </label>
                                            <button class="vng-studio-gen" id="sprite-gen-btn">✨ 生立繪</button>
                                            <details class="vng-studio-tpl">
                                                <summary>📜 Prompt 模板（前後綴）</summary>
                                                <div class="set-label" style="margin-top:8px;font-size:11px;">前綴</div>
                                                <textarea class="set-input" id="sprite-tpl-prefix" style="margin-top:4px;min-height:48px;font-family:inherit;font-size:12px;"></textarea>
                                                <div class="set-label" style="margin-top:8px;font-size:11px;">後綴</div>
                                                <textarea class="set-input" id="sprite-tpl-suffix" style="margin-top:4px;min-height:48px;font-family:inherit;font-size:12px;"></textarea>
                                                <button class="btn-test" id="sprite-tpl-reset" style="margin-top:6px;padding:4px 10px;font-size:11px;">↻ 還原預設</button>
                                            </details>
                                        </div>
                                    </div>

                                    <div id="sprite-preview" class="vng-studio-preview"><span style="color:#888;font-size:11px;">生立繪後在這裡預覽、去背</span></div>

                                    <div class="vng-studio-bar">
                                        <button class="vng-studio-act" id="sprite-removebg-canvas-btn" style="opacity:0.5;pointer-events:none;">✂️ 純色去背</button>
                                        <button class="vng-studio-act" id="sprite-removebg-btn" style="opacity:0.5;pointer-events:none;">🪄 AI 去背</button>
                                        <button class="vng-studio-act primary" id="sprite-save-btn" style="opacity:0.5;pointer-events:none;">💾 存立繪</button>
                                    </div>
                                    <div class="vng-studio-strength">
                                        <span>純色去背強度</span>
                                        <input type="range" id="sprite-bg-strength" min="0" max="100" value="50" class="set-slider">
                                        <span class="vng-studio-hint">背景有漸層調高</span>
                                    </div>
                                    <div id="sprite-status" class="vng-studio-status"></div>
                                </div>

                                <div class="set-group" style="margin-top:14px;">
                                    <div class="set-label">📚 已存立繪</div>
                                    <div id="sprite-list" style="margin-top:8px;">載入中...</div>
                                </div>

                                <div class="set-desc" style="margin-top:6px;">* ✂️ 純色去背：本機瞬間完成，適合純色背景（NAI 圖用這個）。🪄 AI 去背：首次下載模型(~40MB)，適合雜背景。立繪存進當前世界，VN 優先讀取。</div>
                            </div>
                        </div>
                        <div id="view-img-bg" class="img-subtab-view" style="display:none;">
                            <div class="set-group">
                                <div class="set-label">🌄 場景背景快取 <span style="font-weight:normal; color:rgba(26,28,40,0.72); font-size:11px;">防重複生圖</span></div>
                                <div id="vncfg-bg-mgr-list" style="margin-top:8px;"></div>
                            </div>
                            <div class="set-desc" style="margin-top:4px;">* 包含 bg_cache（場景背景）。</div>
                        </div>
                        <div id="view-img-scene" class="img-subtab-view" style="display:none;">
                            <div class="set-group">
                                <div class="set-label">🎬 場景插圖快取 <span style="font-weight:normal; color:rgba(26,28,40,0.72); font-size:11px;">劇情全螢幕 CG；「⋯」可看大圖 / 編輯重生 / 刪除</span></div>
                                <div id="vncfg-scene-mgr-list" style="margin-top:8px;"></div>
                            </div>
                            <div class="set-desc" style="margin-top:4px;">* 包含 scene_cache（場景插圖）。提示詞在「⋯ → 編輯重生」裡查看與修改。</div>
                        </div>
                    </div>

                    <div id="view-voice" class="tab-view hidden">

                        <!-- 三選一 mode 切換 -->
                        <div style="display:flex;gap:6px;margin-bottom:16px;padding:4px;background:rgba(26,28,40,0.06);border-radius:6px;">
                            <div data-ttsmode="minimax" onclick="_switchTtsMode(this,'minimax')" style="flex:1;text-align:center;padding:10px;cursor:pointer;border-radius:4px;font-size:13px;letter-spacing:1.5px;transition:all 0.2s;${currentTtsMode==='minimax' ? 'background:rgba(26,28,40,0.09);color:#1A1C28;font-weight:700;box-shadow:0 0 0 1px rgba(26,28,40,0.25) inset;' : 'color:rgba(26,28,40,0.55);'}">MINIMAX</div>
                            <div data-ttsmode="sovits"  onclick="_switchTtsMode(this,'sovits')"  style="flex:1;text-align:center;padding:10px;cursor:pointer;border-radius:4px;font-size:13px;letter-spacing:1.5px;transition:all 0.2s;${currentTtsMode==='sovits' ? 'background:rgba(26,28,40,0.09);color:#1A1C28;font-weight:700;box-shadow:0 0 0 1px rgba(26,28,40,0.25) inset;' : 'color:rgba(26,28,40,0.55);'}">SoVITS TTS</div>
                            <div data-ttsmode="off"     onclick="_switchTtsMode(this,'off')"     style="flex:1;text-align:center;padding:10px;cursor:pointer;border-radius:4px;font-size:13px;letter-spacing:1.5px;transition:all 0.2s;${currentTtsMode==='off' ? 'background:rgba(26,28,40,0.09);color:#1A1C28;font-weight:700;box-shadow:0 0 0 1px rgba(26,28,40,0.25) inset;' : 'color:rgba(26,28,40,0.55);'}">全關閉</div>
                        </div>

                        <!-- 旁白·系統（跨模式、永遠顯示；旁白與系統音默認都關閉） -->
                        <div id="vn-narr-inline-root" style="margin-bottom:16px;"></div>

                        <!-- MINIMAX 設定區 -->
                        <div id="voice-area-minimax" class="voice-area" style="display:${currentTtsMode==='minimax' ? 'block' : 'none'};">

                        <div style="background:rgba(26,28,40,0.06); padding:10px; border-radius:4px; margin-bottom:15px; border:1px solid rgba(26,28,40,0.10); font-size:12px; color:#1A1C28;">
                            🎵 <b>Minimax TTS</b>：配置後，VN 面板 [Char|...] 對話自動合成語音。請至 Minimax 平台取得 API Key。
                        </div>

                        <!-- mm-enabled 已被三選一頂端按鈕取代，隱藏但保留以維持 save / 切換邏輯 -->
                        <input type="checkbox" id="mm-enabled" style="display:none;" ${minimaxConfig.enabled ? 'checked' : ''}>

                        <div class="set-group">
                            <div class="set-label">服務區域</div>
                            <select class="set-select" id="mm-provider">
                                <option value="cn" ${minimaxConfig.provider === 'cn' ? 'selected' : ''}>🇨🇳 國內版 (api.minimaxi.com)</option>
                                <option value="io" ${minimaxConfig.provider === 'io' ? 'selected' : ''}>🌍 海外版 (api.minimax.io)</option>
                            </select>
                        </div>

                        <div class="set-group">
                            <div class="set-label">Group ID <span style="font-size:11px; color:#fc8181;">(必填)</span></div>
                            <input class="set-input" id="mm-group-id" type="text" placeholder="請輸入 Minimax Group ID..." value="${minimaxConfig.groupId || ''}">
                            <div class="set-desc">登入 Minimax 平台後，在帳號設定頁面可找到 Group ID。</div>
                        </div>

                        <div class="set-group">
                            <div class="set-label">API Key <span style="font-size:11px; color:#fc8181;">(必填)</span></div>
                            <input class="set-input" id="mm-api-key" type="password" placeholder="請輸入 Minimax API Key..." value="${minimaxConfig.apiKey || ''}">
                        </div>

                        <div class="set-group">
                            <div class="set-label">語音模型</div>
                            <select class="set-select" id="mm-speech-model">
                                <option value="speech-2.8-hd"    ${minimaxConfig.speechModel === 'speech-2.8-hd'    ? 'selected' : ''}>speech-2.8-hd ✨ (支援語氣詞)</option>
                                <option value="speech-2.8-turbo" ${minimaxConfig.speechModel === 'speech-2.8-turbo' ? 'selected' : ''}>speech-2.8-turbo ✨ (支援語氣詞)</option>
                                <option value="speech-2.6-hd"    ${minimaxConfig.speechModel === 'speech-2.6-hd'    ? 'selected' : ''}>speech-2.6-hd</option>
                                <option value="speech-2.6-turbo" ${minimaxConfig.speechModel === 'speech-2.6-turbo' ? 'selected' : ''}>speech-2.6-turbo</option>
                                <option value="speech-02-hd"     ${minimaxConfig.speechModel === 'speech-02-hd'     ? 'selected' : ''}>speech-02-hd</option>
                                <option value="speech-02-turbo"  ${minimaxConfig.speechModel === 'speech-02-turbo'  ? 'selected' : ''}>speech-02-turbo (預設)</option>
                                <option value="speech-01-turbo"  ${minimaxConfig.speechModel === 'speech-01-turbo'  ? 'selected' : ''}>speech-01-turbo</option>
                            </select>
                        </div>

                        <div class="set-group">
                            <div class="set-slider-container">
                                <div class="set-label"><span>預設語速</span><span class="set-slider-val" id="mm-speed-val">${(minimaxConfig.defaultSpeed ?? 1.0).toFixed(1)}</span></div>
                                <input type="range" min="0.5" max="2" step="0.1" value="${minimaxConfig.defaultSpeed ?? 1.0}" class="set-slider" id="mm-speed">
                            </div>
                            <div style="margin-top:15px;">
                                <div class="set-label">語言增強</div>
                                <select class="set-select" id="mm-lang-boost">
                                    <option value=""          ${ !minimaxConfig.defaultLanguageBoost          ? 'selected' : ''}>無（自動判斷）</option>
                                    <option value="auto"      ${minimaxConfig.defaultLanguageBoost==='auto'      ? 'selected' : ''}>自動判斷</option>
                                    <option value="Chinese"   ${minimaxConfig.defaultLanguageBoost==='Chinese'   ? 'selected' : ''}>中文普通話</option>
                                    <option value="Cantonese" ${minimaxConfig.defaultLanguageBoost==='Cantonese' ? 'selected' : ''}>粵語</option>
                                    <option value="Japanese"  ${minimaxConfig.defaultLanguageBoost==='Japanese'  ? 'selected' : ''}>日文</option>
                                    <option value="English"   ${minimaxConfig.defaultLanguageBoost==='English'   ? 'selected' : ''}>英文</option>
                                </select>
                            </div>
                        </div>

                        <div class="set-group">
                            <div class="set-label">🎭 音色設定檔 <span style="font-size:11px; color:rgba(26,28,40,0.72); font-weight:normal;">（VN / wx 面板通用）</span></div>
                            <div class="set-desc">每個角色可設定「顯示名稱」、「Minimax 音色ID」與多個「別名」。VN 面板輸出的角色名會自動比對所有別名（大小寫不敏感），找到後播放對應音色。</div>
                            <div id="mm-profile-list" style="display:flex; flex-direction:column; gap:12px; margin-top:12px;"></div>
                            <div style="display:flex; gap:8px; margin-top:12px;">
                                <div class="btn-test" id="mm-add-profile-btn" style="flex:1;">＋ 新增音色設定檔</div>
                                <div class="btn-test" id="mm-browse-voices-btn" style="flex:1; background:rgba(228,232,245,0.96);">🔍 瀏覽官方音色庫</div>
                            </div>
                        </div>

                        <div id="mm-voice-modal" style="display:none; position:fixed; inset:0; z-index:9999; background:rgba(26,13,10,0.85); align-items:center; justify-content:center;">
                            <div style="background:rgba(228,232,245,0.97); border:1px solid rgba(26,28,40,0.20); border-radius:8px; padding:16px; width:92%; max-width:480px; max-height:82vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.6);">
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                                    <div style="font-weight:bold; color:#1A1C28; font-size:14px;">🎵 官方音色庫 <span id="mm-voice-count" style="font-size:11px; color:rgba(26,28,40,0.72); font-weight:normal;"></span></div>
                                    <span id="mm-voice-modal-close" style="cursor:pointer; color:#1A1C28; font-size:20px; line-height:1; padding:0 4px;">✕</span>
                                </div>
                                <input id="mm-voice-search" class="set-input" placeholder="搜尋 voice_id 或描述..." style="margin-bottom:8px;">
                                <div id="mm-voice-list" style="overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:6px; padding-right:4px;"></div>
                            </div>
                        </div>

                        <div class="set-group">
                            <div class="set-label">🔌 測試語音</div>
                            <div style="display:flex; gap:8px; margin-bottom:10px;">
                                <input class="set-input" id="mm-test-voice-id" type="text" placeholder="語音 ID，例如：male-01" style="flex:1;">
                            </div>
                            <input class="set-input" id="mm-test-text" type="text" placeholder="測試文字" value="你好，我是AI語音助手，測試一下。" style="margin-bottom:10px;">
                            <div class="btn-test" id="mm-test-btn">🎵 播放測試語音</div>
                            <div class="btn-test" id="mm-stop-btn" style="margin-top:8px; display:none;">⏹ 停止播放</div>
                            <div id="mm-test-result" style="display:none; margin-top:10px; background:rgba(228,232,245,0.90); border-radius:4px; padding:12px; font-size:12px; color:#1A1C28; font-family:monospace; word-break:break-all;"></div>
                        </div>

                        </div><!-- /voice-area-minimax -->

                        <!-- SoVITS 設定區（vn_tts_panel inline 注入點） -->
                        <div id="voice-area-sovits" class="voice-area" style="display:${currentTtsMode==='sovits' ? 'block' : 'none'};">
                            <div id="vn-tts-inline-root"></div>
                        </div>

                        <!-- 全關閉 -->
                        <div id="voice-area-off" class="voice-area" style="display:${currentTtsMode==='off' ? 'block' : 'none'};">
                            <div style="background:rgba(26,28,40,0.04);padding:24px;border-radius:6px;text-align:center;color:rgba(26,28,40,0.72);font-size:13px;line-height:1.9;border:1px solid rgba(26,28,40,0.06);">
                                🔇 已關閉所有語音合成<br>
                                <span style="font-size:11px;color:#888;">VN 面板對話將不會自動朗讀<br>點上方按鈕切換語音引擎</span>
                            </div>
                        </div>
                    </div>

                    <!-- ── VN 系統設置（由 vn_settings.js 提供） ── -->
                    <div id="view-vn" class="tab-view hidden">
                        ${window.VN_SETTINGS_PANEL ? window.VN_SETTINGS_PANEL.getHTML() : '<div class="set-desc" style="padding:20px; text-align:center;">⚠️ vn_settings.js 尚未載入</div>'}
                    </div>

                    <!-- ── 向量記憶設定 ── -->
                    <div id="view-vec" class="tab-view hidden">
                        <div class="set-group">
                            <div class="set-label">記憶模式
                                <label class="toggle-switch">
                                    <input type="checkbox" id="vec-enabled">
                                    <span class="slider"></span>
                                </label>
                            </div>
                            <div class="set-desc">
                                <b>關閉</b>：不啟用記憶召回（依靠章節原文 + 摘要）<br>
                                <b>開啟</b>：副模型背景提取 → 向量搜尋按需召回（長劇/多NPC推薦）
                            </div>
                        </div>

                        <div class="set-group">
                            <div class="set-label">Embedding 端點</div>
                            <div class="set-desc">OpenAI 相容的 /v1/embeddings 端點，可與主模型同一個 API 服務</div>
                            <input class="set-input" id="vec-url" type="text" placeholder="https://api.openai.com/v1（不需加 /embeddings）" />
                            <div class="set-label" style="margin-top:12px;">Embedding 模型</div>
                            <input class="set-input" id="vec-model" type="text" placeholder="text-embedding-3-small" style="margin-top:6px;" />
                            <div class="set-label" style="margin-top:12px;">
                                API Key
                                <label style="display:flex;align-items:center;gap:6px;font-weight:400;font-size:11px;cursor:pointer;">
                                    <input type="checkbox" id="vec-sync-key"> 同步主模型 Key
                                </label>
                            </div>
                            <input class="set-input" id="vec-key" type="password" placeholder="留空則同步主模型 Key" style="margin-top:6px;" />
                        </div>

                        <div class="set-group">
                            <div class="set-label">召回條數 top-K <span class="set-slider-val" id="vec-topk-val">5</span></div>
                            <div class="set-desc">每次 buildContext 從向量庫召回最相關的 N 條記憶注入</div>
                            <input class="set-slider" type="range" id="vec-topk" min="1" max="20" value="5" />
                        </div>

                        <div class="set-group">
                            <div class="set-label">測試連線</div>
                            <div class="btn-test" id="vec-test-btn">🔌 測試 Embedding API</div>
                            <div id="vec-test-result" style="margin-top:8px;font-size:12px;color:rgba(26,28,40,0.72);min-height:16px;"></div>
                        </div>
                    </div>

                    <div id="view-sys" class="tab-view hidden">

                        <div class="set-group">
                            <div class="set-label">🖥️ 介面佈局 (解決頂部遮擋)</div>
                            <div class="set-desc">在 iOS 加到主畫面 (PWA) 時，若遇到動態島或瀏海遮擋頂部 UI，可開啟「強制下移」。</div>
                            <select class="set-select" id="os-layout-mode">
                                <option value="auto" ${localStorage.getItem('aurelia_layout_mode') !== 'pad-ios' ? 'selected' : ''}>📱 自動適配 (Auto/預設)</option>
                                <option value="pad-ios" ${localStorage.getItem('aurelia_layout_mode') === 'pad-ios' ? 'selected' : ''}>🍎 強制下移 (iOS 動態島/瀏海)</option>
                            </select>
                        </div>

                        <div style="background:rgba(26,28,40,0.06); padding:10px; border-radius:4px; margin-bottom:15px; border:1px solid rgba(26,28,40,0.10); font-size:12px; color:#1A1C28;">
                            ☁️ 備份會將世界書、寵物、成就、App 設定等<b>輕量資料</b>同步至 GitHub Gist。
                            大型資料（寵物日誌、未來 VN 存檔等）請使用「本地全量匯出」。
                        </div>

                        <div class="set-group">
                            <div class="set-label">🔑 GitHub Gist 設定</div>
                            <div class="set-desc">申請 <b>gist</b> 權限的 Personal Access Token（Settings → Developer settings → Fine-grained tokens）。首次備份後 Gist ID 自動保存。</div>
                            <input class="set-input" id="bk-token" type="password" placeholder="ghp_xxxxxxxxxxxx（不會備份 Token 本身）" />
                            <input class="set-input" id="bk-gist-id" placeholder="Gist ID（首次留空，備份後自動填入）" style="margin-top:8px;" />
                            <div id="bk-gist-hint" style="font-size:11px; color:#1A1C28; margin-top:6px; word-break:break-all;"></div>
                            <div style="display:flex; gap:8px; margin-top:10px;">
                                <div class="btn-save" id="bk-gist-save-btn" style="flex:1; padding:12px; font-size:13px;">☁️ 備份到 Gist</div>
                                <div class="btn-test" id="bk-gist-restore-btn" style="flex:1;">⬇️ 從 Gist 還原</div>
                            </div>
                        </div>

                        <div class="set-group">
                            <div class="set-label">
                                📊 本地儲存空間
                                <span class="btn-test" id="bk-scan-btn" style="padding:4px 12px; font-size:11px; cursor:pointer; margin:0;">掃描</span>
                            </div>
                            <div id="bk-storage-info" style="font-size:12px; color:rgba(26,28,40,0.72); margin-top:8px;">點擊「掃描」查看各資料佔用量</div>
                        </div>

                        <div class="set-group">
                            <div class="set-label">💾 本地全量備份</div>
                            <div class="set-desc">匯出包含所有 IndexedDB 資料的 JSON 檔案，可保存至手機相簿/iCloud/Google Drive。未來 VN 故事存檔也會一併匯出。</div>
                            <div class="btn-save" id="bk-export-btn" style="padding:12px; font-size:13px;">📤 匯出完整備份 JSON</div>
                            <div class="btn-test" id="bk-import-btn" style="margin-top:8px;">📥 從本地 JSON 還原</div>
                            <input type="file" id="bk-file-input" accept=".json" style="display:none;" />
                        </div>

                        <div class="danger-zone">
                            <h3><i class="fa-solid fa-triangle-exclamation"></i> 危險區域：一鍵格式化</h3>
                            <p>此操作將徹底刪除所有本地資料庫（包含角色、對話、長線劇情、變數工坊、寵物與系統設定）。操作後將自動重整網頁。請務必先進行備份！</p>
                            <div class="btn-danger" id="bk-format-btn">💥 格式化並清空所有數據</div>
                        </div>

                        <div id="bk-status" style="font-size:12px; color:rgba(26,28,40,0.72); text-align:center; padding:10px 0; min-height:20px;"></div>
                    </div>

                </div>
                <div class="set-footer">
                    <div class="btn-save" id="os-save-btn">保存所有設定</div>
                    <div class="set-status" id="os-status"></div>
                </div>
            </div>
        `;

        const backBtn = container.querySelector('#nav-home');
        backBtn.onclick = () => { const win = window.parent || window; if (win.PhoneSystem) win.PhoneSystem.goHome(); };

        const tabs = container.querySelectorAll('.set-tab[data-tab]');
        const views = container.querySelectorAll('.tab-view');
        tabs.forEach(tab => {
            tab.onclick = () => {
                tabs.forEach(t => t.classList.remove('active'));
                views.forEach(v => v.classList.remove('active'));
                views.forEach(v => v.classList.add('hidden'));
                tab.classList.add('active');
                const targetId = `view-${tab.dataset.tab}`;
                const targetView = container.querySelector(`#${targetId}`);
                if (targetView) { targetView.classList.remove('hidden'); targetView.classList.add('active'); }
            };
        });

        // 「圖片設置」(接口/底詞/尺寸) = 系統設置裡的 tab；圖庫快取圖(頭像/背景/插圖) = 獨立「相簿」app。
        //   view-img 永遠 render，靠下面切可見性把「設定」與「圖庫」分到兩邊。
        const _imgTabBtn = container.querySelector('.set-tab[data-tab="img"]');
        const _galRow    = container.querySelector('.gal-subtab-row');
        const _galApiBtn = container.querySelector('.gal-subtab[data-galtab="api"]');
        const _apiView   = container.querySelector('#view-img-api');
        if (mode === 'album') {
            const _titleEl = container.querySelector('.set-title');
            if (_titleEl) _titleEl.textContent = '相簿';
            // 相簿只放圖庫：藏「圖片設置」子分頁與設定本體，預設顯示頭像快取
            if (_galApiBtn) _galApiBtn.style.display = 'none';
            if (_apiView)   _apiView.style.display = 'none';
            if (_imgTabBtn) _imgTabBtn.click();   // 切到 view-img
            const _avatarBtn = container.querySelector('.gal-subtab[data-galtab="avatar"]');
            if (_avatarBtn) _avatarBtn.click();   // 預設顯示頭像圖庫
            const _tabsBar = container.querySelector('.set-tabs');
            if (_tabsBar) _tabsBar.style.display = 'none';
            // 相簿只看圖、沒設定可存 → 藏「保存所有設定」footer（那是圖片設置的）
            const _footer = container.querySelector('.set-footer');
            if (_footer) _footer.style.display = 'none';
            // 內容區零上 padding，讓黏頂的畫廊主 tab 緊貼 header、捲動不露縫
            const _sc = container.querySelector('.set-content');
            if (_sc) _sc.classList.add('is-album');
        } else {
            // 系統設置：「圖片設置」tab 只給設定，藏圖庫子分頁列與快取圖（那些留給相簿）
            if (_galRow) _galRow.style.display = 'none';
            ['avatar', 'bg', 'scene'].forEach(t => {
                const v = container.querySelector(`#view-img-${t}`);
                if (v) v.style.display = 'none';
            });
            if (_apiView) _apiView.style.display = '';
        }

        // 備份分頁
        bindBackupTab(container);

        // 綁定元素 (主模型)
        const elSystemApi = container.querySelector('#os-system-api');
        const stProfileGroup = container.querySelector('#st-profile-group');
        const manualGroup = container.querySelector('#manual-api-group');
        const elStProfile = container.querySelector('#os-st-profile');
        const elUrl = container.querySelector('#os-api-url');
        const elKey = container.querySelector('#os-api-key');
        const elModel = container.querySelector('#os-api-model');
        const elMaxTokens = container.querySelector('#os-max-tokens');
        const elTemp = container.querySelector('#os-temperature');
        const elTopP = container.querySelector('#os-top-p');
        const elFreqPenalty = container.querySelector('#os-freq-penalty');
        const elPresPenalty = container.querySelector('#os-pres-penalty');
        const elEnableThinking = container.querySelector('#os-enable-thinking');
        const elThinkingBudget = container.querySelector('#os-thinking-budget');
        const elThinkBudgetVal = container.querySelector('#val-think-budget');
        const thinkBudgetGroup = container.querySelector('#thinking-budget-group');
        const elSummaryMode = container.querySelector('#os-summary-mode');
        const elUsePresetPrompts = container.querySelector('#os-use-preset-prompts');
        const valTemp = container.querySelector('#val-temp');
        const valTopP = container.querySelector('#val-topp');
        const valFreq = container.querySelector('#val-freq');
        const valPres = container.querySelector('#val-pres');

        // 綁定元素 (副模型)
        const secSystemApi = container.querySelector('#sec-system-api');
        const secProfileGroup = container.querySelector('#sec-st-profile-group');
        const secManualGroup = container.querySelector('#sec-manual-api-group');
        const secSyncPrimary = container.querySelector('#sec-sync-primary');
        const secSyncGroup = container.querySelector('#sec-sync-primary-group');
        const secStProfile = container.querySelector('#sec-st-profile');
        const secUrl = container.querySelector('#sec-api-url');
        const secKey = container.querySelector('#sec-api-key');
        const secModel = container.querySelector('#sec-api-model');
        const secMaxTokens = container.querySelector('#sec-max-tokens');
        const secTemp = container.querySelector('#sec-temperature');
        const secTopP = container.querySelector('#sec-top-p');
        const secFreqPenalty = container.querySelector('#sec-freq-penalty');
        const secPresPenalty = container.querySelector('#sec-pres-penalty');
        const secSummaryMode = container.querySelector('#sec-summary-mode');
        const secUsePresetPrompts = container.querySelector('#sec-use-preset-prompts');
        const elPresetName       = container.querySelector('#os-preset-name');
        const elPresetNameGroup  = container.querySelector('#os-preset-name-group');
        const elPresetRefresh    = container.querySelector('#os-preset-refresh-btn');
        const secPresetName      = container.querySelector('#sec-preset-name');
        const secPresetNameGroup = container.querySelector('#sec-preset-name-group');
        const secPresetRefresh   = container.querySelector('#sec-preset-refresh-btn');
        const secValTemp = container.querySelector('#sec-val-temp');
        const secValTopP = container.querySelector('#sec-val-topp');
        const secValFreq = container.querySelector('#sec-val-freq');
        const secValPres = container.querySelector('#sec-val-pres');

        // 綁定元素 (圖片)
        const elImgServiceInanimate = container.querySelector('#img-service-inanimate'); // 死物桶：背景/物品/寵物
        const elImgServiceLiving    = container.querySelector('#img-service-living');    // 活物桶：角色/插圖
        const elPolGroup = container.querySelector('#img-group-pollinations');
        const elPolApiKey = container.querySelector('#img-pol-apikey');
        const elPolModel = container.querySelector('#img-pol-model');
        const elPolSize = container.querySelector('#img-pol-size');
        const elNaiGroup = container.querySelector('#img-group-nai');
        const elNaiToken = container.querySelector('#img-nai-token');
        const elNaiModel = container.querySelector('#img-nai-model');
        const elStylePrompt = container.querySelector('#img-style-prompt');
        const elCharNegPrompt = container.querySelector('#img-char-neg-prompt');
        const elImgTestPrompt = container.querySelector('#img-test-prompt');
        const btnImgTest = container.querySelector('#img-test-btn');
        const imgTestPreview = container.querySelector('#img-test-preview');
        const imgTestImage = container.querySelector('#img-test-image');
        const imgTestUrl = container.querySelector('#img-test-url');

        // 向量記憶設定 — 載入並填充欄位
        const vecCfg = loadVectorConfig();
        const vecEnabled  = container.querySelector('#vec-enabled');
        const vecUrl      = container.querySelector('#vec-url');
        const vecModel    = container.querySelector('#vec-model');
        const vecSyncKey  = container.querySelector('#vec-sync-key');
        const vecKey      = container.querySelector('#vec-key');
        const vecTopK     = container.querySelector('#vec-topk');
        const vecTopKVal  = container.querySelector('#vec-topk-val');
        const vecTestBtn  = container.querySelector('#vec-test-btn');
        const vecTestResult = container.querySelector('#vec-test-result');
        if (vecEnabled)  vecEnabled.checked       = vecCfg.enabled;
        if (vecUrl)      vecUrl.value             = vecCfg.embeddingUrl || '';
        if (vecModel)    vecModel.value           = vecCfg.embeddingModel || '';
        if (vecSyncKey)  vecSyncKey.checked       = vecCfg.syncKeyWithPrimary !== false;
        if (vecKey)      vecKey.value             = vecCfg.embeddingKey || '';
        if (vecTopK)   { vecTopK.value            = vecCfg.topK || 5; }
        if (vecTopKVal)  vecTopKVal.innerText      = vecCfg.topK || 5;
        if (vecTopK)     vecTopK.oninput = () => { if (vecTopKVal) vecTopKVal.innerText = vecTopK.value; };

        // 按鈕
        const btnFetch = container.querySelector('#os-fetch-btn');
        const secFetch = container.querySelector('#sec-fetch-btn');
        const btnSave = container.querySelector('#os-save-btn');
        const btnTest = container.querySelector('#os-test-btn');
        const secTestBtn = container.querySelector('#sec-test-btn');
        const status = container.querySelector('#os-status');

        // Sliders Listeners
        elTemp.oninput = () => valTemp.innerText = parseFloat(elTemp.value).toFixed(2);
        elTopP.oninput = () => valTopP.innerText = parseFloat(elTopP.value).toFixed(2);
        elFreqPenalty.oninput = () => valFreq.innerText = parseFloat(elFreqPenalty.value).toFixed(2);
        elPresPenalty.oninput = () => valPres.innerText = parseFloat(elPresPenalty.value).toFixed(2);

        if (elEnableThinking) {
            elEnableThinking.onchange = () => {
                if (thinkBudgetGroup) thinkBudgetGroup.classList.toggle('hidden', !elEnableThinking.checked);
            };
        }
        if (elThinkingBudget && elThinkBudgetVal) {
            elThinkingBudget.oninput = () => { elThinkBudgetVal.innerText = parseInt(elThinkingBudget.value).toLocaleString(); };
        }
        
        secTemp.oninput = () => secValTemp.innerText = parseFloat(secTemp.value).toFixed(2);
        secTopP.oninput = () => secValTopP.innerText = parseFloat(secTopP.value).toFixed(2);
        secFreqPenalty.oninput = () => secValFreq.innerText = parseFloat(secFreqPenalty.value).toFixed(2);
        secPresPenalty.oninput = () => secValPres.innerText = parseFloat(secPresPenalty.value).toFixed(2);

        // Toggle Logic
        const toggleInputs = (sysApi, manGroup, profGroup) => {
            if (sysApi.checked) { manGroup.style.display = 'none'; profGroup.classList.remove('hidden'); } 
            else { manGroup.style.display = 'flex'; profGroup.classList.add('hidden'); }
        };
        
        const elModelRow = container.querySelector('#model-row');
        const elModelNotice = container.querySelector('#model-system-notice');
        const secModelRow = container.querySelector('#sec-model-row');
        const secModelNotice = container.querySelector('#sec-model-system-notice');

        const toggleModelRow = (isSystem, row, notice) => {
            if (isSystem) { row.classList.add('hidden'); notice.classList.remove('hidden'); }
            else { row.classList.remove('hidden'); notice.classList.add('hidden'); }
        };

        elSystemApi.onchange = () => {
            toggleInputs(elSystemApi, manualGroup, stProfileGroup);
            toggleModelRow(elSystemApi.checked, elModelRow, elModelNotice);
        };
        toggleInputs(elSystemApi, manualGroup, stProfileGroup);
        toggleModelRow(elSystemApi.checked, elModelRow, elModelNotice);

        // 🔥 副模型特有的 Toggle 邏輯
        secSystemApi.onchange = () => {
            toggleInputs(secSystemApi, secManualGroup, secProfileGroup);
            toggleModelRow(secSystemApi.checked, secModelRow, secModelNotice);
            if (secSyncGroup) secSyncGroup.style.display = secSystemApi.checked ? 'none' : 'flex';
            if (!secSystemApi.checked && secSyncPrimary && secSyncPrimary.checked) {
                secManualGroup.style.display = 'none';
            }
        };
        
        if (secSyncPrimary) {
            secSyncPrimary.onchange = () => {
                if (secSyncPrimary.checked) {
                    secManualGroup.style.display = 'none';
                } else if (!secSystemApi.checked) {
                    secManualGroup.style.display = 'flex';
                }
            };
            if (!secSystemApi.checked) {
                secManualGroup.style.display = secSyncPrimary.checked ? 'none' : 'flex';
            }
        }
        
        toggleInputs(secSystemApi, secManualGroup, secProfileGroup);
        toggleModelRow(secSystemApi.checked, secModelRow, secModelNotice);
        if (secSyncGroup) secSyncGroup.style.display = secSystemApi.checked ? 'none' : 'flex';
        if (!secSystemApi.checked && secSyncPrimary && secSyncPrimary.checked) secManualGroup.style.display = 'none';

        // --- Preset 名稱選擇器 ---
        function populatePresetSelect(selectEl, currentName) {
            const th = window.TavernHelper || window.parent?.TavernHelper;
            if (!th || typeof th.getPresetNames !== 'function') {
                selectEl.innerHTML = '<option value="">（TavernHelper 不可用）</option>';
                return;
            }
            try {
                const names = th.getPresetNames();
                selectEl.innerHTML = '<option value="">（使用當前 in_use Preset）</option>' +
                    names.map(n => `<option value="${n}" ${n === currentName ? 'selected' : ''}>${n}</option>`).join('');
            } catch(e) {
                selectEl.innerHTML = '<option value="">（讀取失敗）</option>';
            }
        }

        if (elPresetName && llmConfig.usePresetPrompts)   populatePresetSelect(elPresetName,  llmConfig.presetName  || '');
        if (secPresetName && secLlmConfig.usePresetPrompts) populatePresetSelect(secPresetName, secLlmConfig.presetName || '');

        if (elUsePresetPrompts) elUsePresetPrompts.onchange = () => {
            if (elPresetNameGroup) elPresetNameGroup.style.display = elUsePresetPrompts.checked ? 'flex' : 'none';
            if (elUsePresetPrompts.checked && elPresetName) populatePresetSelect(elPresetName, llmConfig.presetName || '');
        };
        if (secUsePresetPrompts) secUsePresetPrompts.onchange = () => {
            if (secPresetNameGroup) secPresetNameGroup.style.display = secUsePresetPrompts.checked ? 'flex' : 'none';
            if (secUsePresetPrompts.checked && secPresetName) populatePresetSelect(secPresetName, secLlmConfig.presetName || '');
        };

        if (elPresetRefresh)  elPresetRefresh.onclick  = () => elPresetName  && populatePresetSelect(elPresetName,  elPresetName.value);
        if (secPresetRefresh) secPresetRefresh.onclick = () => secPresetName && populatePresetSelect(secPresetName, secPresetName.value);

        // --- Profile URL Info ---
        function showProfileInfo(selectEl, infoEl) {
            if (!infoEl) return;
            const selectedId = selectEl.value;
            if (!selectedId) {
                infoEl.innerHTML = '<span>ℹ️ 使用當前激活的 ST 連接</span>';
                return;
            }
            const p = stProfiles.find(x => x.id === selectedId);
            if (!p) { infoEl.textContent = '(找不到 Profile)'; return; }
            const url = p['api-url'] || '(URL 未記錄)';
            const liveModel = (() => { try { return getSTContext()?.getChatCompletionModel?.() || ''; } catch(_) { return ''; } })();
            const model = liveModel || p.model || '(模型未記錄)';
            const api = p.api ? ` <span>[${p.api}]</span>` : '';
            infoEl.innerHTML = `🌐 ${url}<br>🤖 ${model}${api}`;
        }

        const profileInfoEl = container.querySelector('#st-profile-info');
        const secProfileInfoEl = container.querySelector('#sec-st-profile-info');
        showProfileInfo(elStProfile, profileInfoEl);
        showProfileInfo(secStProfile, secProfileInfoEl);
        elStProfile.addEventListener('change', () => showProfileInfo(elStProfile, profileInfoEl));
        secStProfile.addEventListener('change', () => showProfileInfo(secStProfile, secProfileInfoEl));

        function updateSmeaVisibility(model) {
            const isV3 = model === 'nai-diffusion-3';
            const smeaGrp    = container.querySelector('#img-nai-smea-group');
            const smeaDynGrp = container.querySelector('#img-nai-smea-dyn-group');
            // SMEA 僅 V3 可用：用 .is-disabled class 控制（CSS 內 opacity+pointer-events），別用 inline 避免殘留
            if (smeaGrp)    smeaGrp.classList.toggle('is-disabled', !isV3);
            if (smeaDynGrp) smeaDynGrp.classList.toggle('is-disabled', !isV3);
        }
        if (elNaiModel) elNaiModel.onchange = () => updateSmeaVisibility(elNaiModel.value);

        // ── 圖片設置：背景／角色 兩個子分頁，一次只顯示一邊（取代舊「兩桶聯集」） ──
        const SVC_DISP = {
            pollinations: '✨ Pollinations',
            novelai: '💎 NovelAI',
            tavern_sd: '🎨 酒館原生',
            comfyui_direct: '🧩 ComfyUI 直連'
        };
        const elImgSyncBg     = container.querySelector('#img-sync-bg-to-char');
        const elImgBgSrcGroup = container.querySelector('#img-bg-source-group');
        const elImgBgNote     = container.querySelector('#img-bg-synced-note');
        const elImgBgNoteText = container.querySelector('#img-bg-synced-note-text');
        const elImgTabChar    = container.querySelector('#img-tab-char');
        const elImgTabBg      = container.querySelector('#img-tab-bg');
        const elImgSceneBlock = container.querySelector('#img-scene-block');
        const elImgSceneExtract = container.querySelector('#img-scene-extract-block'); // 副模型版（插圖→角色）
        const elImgPixabay      = container.querySelector('#img-pixabay-block');        // 退路圖庫（背景）
        const elImgPolPrompts = container.querySelector('#img-pol-prompts-group');
        const elTavGroup      = container.querySelector('#img-group-tavernsd');
        const elCfdGroup      = container.querySelector('#img-group-comfyui');
        const srcTabBtnChar   = container.querySelector('#img-srctab-char');
        const srcTabBtnBg     = container.querySelector('#img-srctab-bg');

        // 目前子分頁（預設「角色」）
        let imgSrcTab = 'char';

        // 同步開關初始狀態：有存就用存的，否則用「兩桶是否相等」推斷
        if (elImgSyncBg) {
            elImgSyncBg.checked = (typeof imgConfig.imgSourceSynced === 'boolean')
                ? imgConfig.imgSourceSynced
                : ((imgConfig.serviceInanimate || imgConfig.service) === (imgConfig.serviceLiving || imgConfig.service));
        }

        // 只顯示「要顯示的那一個接口」設定區，其餘三個藏起
        function showOnlyIfaceGroup(svc) {
            if (elNaiGroup) elNaiGroup.classList.toggle('hidden', svc !== 'novelai');
            if (elPolGroup) elPolGroup.classList.toggle('hidden', svc !== 'pollinations');
            if (elTavGroup) elTavGroup.classList.toggle('hidden', svc !== 'tavern_sd');
            if (elCfdGroup) elCfdGroup.classList.toggle('hidden', svc !== 'comfyui_direct');
        }

        const refreshImgPanel = () => {
            const livingSvc = elImgServiceLiving ? elImgServiceLiving.value : 'pollinations';
            const synced = elImgSyncBg ? elImgSyncBg.checked : true;

            // 子分頁鈕 active 樣式
            if (srcTabBtnChar) srcTabBtnChar.classList.toggle('active', imgSrcTab === 'char');
            if (srcTabBtnBg)   srcTabBtnBg.classList.toggle('active', imgSrcTab === 'bg');
            // 兩個 body 一次只出一邊
            if (elImgTabChar) elImgTabChar.style.display = (imgSrcTab === 'char') ? '' : 'none';
            if (elImgTabBg)   elImgTabBg.style.display   = (imgSrcTab === 'bg')   ? '' : 'none';

            if (imgSrcTab === 'char') {
                // 角色分頁：顯示 living 接口設定 + 角色頭像底詞 + 場景插圖（副模型版）
                showOnlyIfaceGroup(livingSvc);
                if (elImgPolPrompts) elImgPolPrompts.classList.toggle('hidden', livingSvc !== 'pollinations');
                // 頭像追加詞按接口：Pol/NAI 用主版、酒館原生/ComfyUI 用專用版（選 NAI 不再看到 ComfyUI 專用詞）
                { const _avZone = container.querySelector('#img-avatar-add-zone'); if (_avZone) _avZone.style.display = ''; }   // 頭像追加詞區屬角色分頁，這裡顯示
                const _isTavAv = (livingSvc === 'tavern_sd' || livingSvc === 'comfyui_direct');
                const _avM = container.querySelector('#img-avatar-add-main'); if (_avM) _avM.classList.toggle('hidden', _isTavAv);
                const _avT = container.querySelector('#img-avatar-add-tav'); if (_avT) _avT.classList.toggle('hidden', !_isTavAv);
                { const _itB = container.querySelector('#img-nai-item-block'); if (_itB) _itB.classList.add('hidden'); }   // 物品＝死物，角色分頁藏物品底詞
                if (elImgSceneBlock)   elImgSceneBlock.style.display = '';
                if (elImgSceneExtract) elImgSceneExtract.style.display = '';
                if (elImgPixabay)      elImgPixabay.style.display = 'none';   // 退路圖庫屬背景、角色分頁藏
            } else {
                // 背景分頁
                if (synced) {
                    // 同步：藏下拉、顯示「與角色相同」、接口設定本體留在角色分頁（這裡不重複出）
                    if (elImgBgSrcGroup) elImgBgSrcGroup.style.display = 'none';
                    if (elImgBgNote)     elImgBgNote.style.display = '';
                    if (elImgBgNoteText) elImgBgNoteText.textContent = '（與角色相同：' + (SVC_DISP[livingSvc] || livingSvc) + '）';
                    showOnlyIfaceGroup(null); // 四個接口區全藏（設定在角色分頁）
                } else {
                    // 不同步：顯示背景自己的下拉 + 它選的接口設定
                    const bgSvc = elImgServiceInanimate ? elImgServiceInanimate.value : 'pollinations';
                    if (elImgBgSrcGroup) elImgBgSrcGroup.style.display = '';
                    if (elImgBgNote)     elImgBgNote.style.display = 'none';
                    showOnlyIfaceGroup(bgSvc);
                }
                // 角色頭像底詞 + 場景插圖（含副模型版）只屬角色分頁；退路圖庫(背景)在背景分頁顯示
                { const _avZone = container.querySelector('#img-avatar-add-zone'); if (_avZone) _avZone.style.display = 'none'; }   // 頭像追加詞區屬角色分頁，背景分頁藏
                if (elImgPolPrompts) elImgPolPrompts.classList.add('hidden');
                { const _itB = container.querySelector('#img-nai-item-block'); if (_itB) _itB.classList.remove('hidden'); }   // 物品底詞在背景分頁(死物桶)顯示
                if (elImgSceneBlock)   elImgSceneBlock.style.display = 'none';
                if (elImgSceneExtract) elImgSceneExtract.style.display = 'none';
                if (elImgPixabay)      elImgPixabay.style.display = '';   // 退路圖庫（背景生不出抓照片）屬背景
            }
            // 測試生成是通用工具 → 兩分頁都留
        };

        // 子分頁切換鈕
        window._switchImgSrcTab = (tab) => {
            imgSrcTab = (tab === 'bg') ? 'bg' : 'char';
            refreshImgPanel();
        };

        if (elImgServiceInanimate) elImgServiceInanimate.onchange = refreshImgPanel;
        if (elImgServiceLiving)    elImgServiceLiving.onchange = refreshImgPanel;
        if (elImgSyncBg)           elImgSyncBg.addEventListener('change', refreshImgPanel);
        refreshImgPanel(); // 初始化同步一次

        // ===== ComfyUI 直連：LoRA 行 + 測試連線 =====
        let cfdPresets = [...((imgConfig.comfyuiDirect && imgConfig.comfyuiDirect.presets) || [])];
        (function setupComfyDirect(){
            const cfd = (imgConfig && imgConfig.comfyuiDirect) || ((window.parent || window).OS_IMAGE_MANAGER && (window.parent || window).OS_IMAGE_MANAGER.config && (window.parent || window).OS_IMAGE_MANAGER.config.comfyuiDirect) || {};
            const lorasBox = container.querySelector('#img-cfd-loras');
            function escAttr(s){ return String(s == null ? '' : s).replace(/"/g, '&quot;'); }
            // 模型類型（標準/Flux）：切換 Flux 欄位 + 依類型過濾模型下拉（checkpoint vs UNet）
            let lastModels = null;
            function curType(){ const t = container.querySelector('#img-cfd-type'); return (t && t.value) || 'checkpoint'; }
            function refreshModels(){
                if (!Array.isArray(lastModels)) return;
                const isUnet = (curType() === 'flux' || curType() === 'anima');
                const arr = lastModels.filter(function(x){ const t = (x && x.text) || ''; return isUnet ? /^UNet:/i.test(t) : !/^(UNet|GGUF):/i.test(t); });
                const sel = container.querySelector('#img-cfd-model');
                if (!sel) return;
                const cur = sel.value;
                let opts = arr.map(function(x){ return (x && x.value != null) ? x.value : x; });
                if (cur && opts.indexOf(cur) === -1) opts.push(cur);
                sel.innerHTML = opts.map(function(v){ return '<option value="' + escAttr(v) + '"' + (v === cur ? ' selected' : '') + '>' + escAttr(v) + '</option>'; }).join('');
            }
            const typeSel = container.querySelector('#img-cfd-type');
            if (typeSel) typeSel.addEventListener('change', function(){
                const ff = container.querySelector('#img-cfd-flux-fields');
                if (ff) ff.classList.toggle('hidden', typeSel.value !== 'flux');
                const af = container.querySelector('#img-cfd-anima-fields');
                if (af) af.classList.toggle('hidden', typeSel.value !== 'anima');
                refreshModels();
            });
            // 工作流模式：自訂時顯示貼上框
            const wfModeSel = container.querySelector('#img-cfd-wfmode');
            if (wfModeSel) wfModeSel.addEventListener('change', function(){
                const box = container.querySelector('#img-cfd-custom-wf');
                if (box) box.classList.toggle('hidden', wfModeSel.value !== 'custom');
            });
            function makeLoraRow(L){
                L = L || { on: true, name: '', strengthModel: 1, strengthClip: 1 };
                const row = document.createElement('div');
                row.className = 'cfd-lora-row';
                // 兩行式（手機窄屏友善）：第一行 勾選+名字(拉滿)+刪除；第二行 模型/CLIP 強度帶中文標籤。靠 row 的 flex-wrap + 第二行 100% 寬強制換行
                row.style.cssText = 'display:flex; flex-wrap:wrap; gap:4px 6px; align-items:center; margin-bottom:8px; padding-bottom:8px; border-bottom:1px dashed rgba(26,28,40,0.12);';
                row.innerHTML =
                    '<input type="checkbox" class="cfd-lora-on" ' + (L.on !== false ? 'checked' : '') + ' title="啟用" style="margin:0 2px; flex:0 0 auto;">' +
                    '<input type="text" class="cfd-lora-name set-input" list="img-cfd-lora-list" placeholder="LoRA 檔名" value="' + escAttr(L.name) + '" style="flex:1 1 0; min-width:0;">' +
                    '<button type="button" class="cfd-lora-del" title="刪除" style="background:none;border:none;color:#e74c3c;cursor:pointer;font-size:18px;padding:0 4px; flex:0 0 auto;">✕</button>' +
                    '<div style="flex:1 1 100%; display:flex; gap:6px; align-items:center; padding-left:24px;">' +
                        '<span style="font-size:11px; color:rgba(26,28,40,0.7); white-space:nowrap;">模型</span>' +
                        '<input type="number" class="cfd-lora-sm set-input" step="0.1" min="0" max="2" value="' + (L.strengthModel != null ? L.strengthModel : 1) + '" title="模型強度" style="width:60px; flex:0 0 auto;">' +
                        '<span style="font-size:11px; color:rgba(26,28,40,0.7); white-space:nowrap; margin-left:6px;">CLIP</span>' +
                        '<input type="number" class="cfd-lora-sc set-input" step="0.1" min="0" max="2" value="' + (L.strengthClip != null ? L.strengthClip : 1) + '" title="CLIP強度" style="width:60px; flex:0 0 auto;">' +
                    '</div>';
                row.querySelector('.cfd-lora-del').addEventListener('click', function(){ row.remove(); });
                return row;
            }
            if (lorasBox) {
                lorasBox.innerHTML = '';
                (Array.isArray(cfd.loras) ? cfd.loras : []).forEach(function(L){ lorasBox.appendChild(makeLoraRow(L)); });
            }
            const addBtn = container.querySelector('#img-cfd-add-lora');
            if (addBtn) addBtn.addEventListener('click', function(){ if (lorasBox) lorasBox.appendChild(makeLoraRow()); });

            const testBtn = container.querySelector('#img-cfd-test');
            const statusEl = container.querySelector('#img-cfd-status');
            if (testBtn) testBtn.addEventListener('click', async function(){
                const url = (container.querySelector('#img-cfd-url')?.value || '').trim();
                if (!url) { if (statusEl) statusEl.textContent = '請先填網址'; return; }
                if (statusEl) statusEl.textContent = '⏳ 連線中…';
                const W = window.parent || window;
                const ctx = (W.SillyTavern && W.SillyTavern.getContext) ? W.SillyTavern.getContext() : null;
                const headers = (ctx && ctx.getRequestHeaders && ctx.getRequestHeaders()) || { 'Content-Type': 'application/json' };
                const post = async function(path){
                    try { const r = await fetch(path, { method:'POST', headers: headers, body: JSON.stringify({ url: url }) }); if (!r.ok) return null; return await r.json(); }
                    catch(e){ return null; }
                };
                const fillDatalist = function(id, arr, useValue){
                    const dl = container.querySelector('#' + id);
                    if (!dl || !Array.isArray(arr)) return 0;
                    dl.innerHTML = arr.map(function(x){ const v = useValue ? (x && x.value != null ? x.value : x) : x; return '<option value="' + escAttr(v) + '">'; }).join('');
                    return arr.length;
                };
                const fillSelect = function(id, arr, useValue, addEmpty){
                    const sel = container.querySelector('#' + id);
                    if (!sel || !Array.isArray(arr)) return 0;
                    const cur = sel.value;
                    let opts = arr.map(function(x){ return useValue ? (x && x.value != null ? x.value : x) : x; });
                    if (addEmpty) opts.unshift('');
                    if (cur && opts.indexOf(cur) === -1) opts.push(cur);
                    sel.innerHTML = opts.map(function(v){ const lbl = (v === '' ? '（內建 VAE）' : v); return '<option value="' + escAttr(v) + '"' + (v === cur ? ' selected' : '') + '>' + escAttr(lbl) + '</option>'; }).join('');
                    return arr.length;
                };
                const models = await post('/api/sd/comfy/models');
                const samplers = await post('/api/sd/comfy/samplers');
                const schedulers = await post('/api/sd/comfy/schedulers');
                const vaes = await post('/api/sd/comfy/vaes');
                const loras = await post('/api/sd/comfy/loras');
                if (models === null && samplers === null) { if (statusEl) statusEl.textContent = '❌ 連不上（檢查網址、ComfyUI 開著沒）'; return; }
                lastModels = models || [];
                refreshModels();
                const mc = (Array.isArray(models) ? models.length : 0);
                if (samplers) fillSelect('img-cfd-sampler', samplers, false, false);
                if (schedulers) fillSelect('img-cfd-scheduler', schedulers, false, false);
                if (vaes) fillSelect('img-cfd-vae', vaes, false, true);
                const lc = fillDatalist('img-cfd-lora-list', loras || [], false);
                if (statusEl) statusEl.textContent = '✅ 連上！模型 ' + mc + ' 個' + (loras ? ('、LoRA ' + lc + ' 個可下拉') : '（LoRA 清單酒館未提供→手打檔名）');
            });

            // ── 預設包：modal + grid + 風格預覽縮圖 ──
            const setVal = function(id, v){ const el = container.querySelector(id); if (el && v !== undefined) el.value = v; };
            const setSelectVal = function(id, v){ // select：值不在選項就先補一個 option 再選
                const sel = container.querySelector(id); if (!sel || v == null) return;
                if (![].slice.call(sel.options).some(function(o){ return o.value === String(v); })) {
                    const o = document.createElement('option'); o.value = v; o.textContent = (v === '' ? '（內建 VAE）' : v); sel.appendChild(o);
                }
                sel.value = v;
            };
            // 從面板目前欄位打包一個預設包物件（另存 / 覆蓋 共用）
            function buildCfdPreset(name){
                const g  = function(id){ return (container.querySelector(id)?.value || '').trim(); };
                const gi = function(id, d){ const v = parseInt(container.querySelector(id)?.value ?? d); return isNaN(v) ? d : v; };
                const gf = function(id, d){ const v = parseFloat(container.querySelector(id)?.value ?? d); return isNaN(v) ? d : v; };
                return {
                    name: name,
                    modelType: g('#img-cfd-type') || 'checkpoint',
                    model:     g('#img-cfd-model'),
                    vae:       g('#img-cfd-vae'),
                    sampler:   g('#img-cfd-sampler') || 'euler',
                    scheduler: g('#img-cfd-scheduler') || 'normal',
                    steps:     gi('#img-cfd-steps', 28),
                    cfg:       gf('#img-cfd-cfg', 6.5),
                    width:     gi('#img-cfd-width', 1024),
                    height:    gi('#img-cfd-height', 1024),
                    clipSkip:  gi('#img-cfd-clipskip', 0),
                    basePrompt:g('#img-cfd-base'),
                    negPrompt: g('#img-cfd-neg'),
                    fluxClipL: g('#img-cfd-clipl') || 'clip_l.safetensors',
                    fluxT5:    g('#img-cfd-t5xxl') || 't5xxl_fp8_e4m3fn.safetensors',
                    fluxAe:    g('#img-cfd-ae') || 'ae.safetensors',
                    guidance:  gf('#img-cfd-guidance', 3.5),
                    animaClip: g('#img-cfd-anima-clip') || 'qwen_3_06b_base.safetensors',
                    animaVae:  g('#img-cfd-anima-vae') || 'qwen_image_vae.safetensors',
                    loras: Array.from(container.querySelectorAll('#img-cfd-loras .cfd-lora-row')).map(function(r){ return {
                        on:   r.querySelector('.cfd-lora-on')?.checked ?? true,
                        name: (r.querySelector('.cfd-lora-name')?.value || '').trim(),
                        strengthModel: parseFloat(r.querySelector('.cfd-lora-sm')?.value ?? 1),
                        strengthClip:  parseFloat(r.querySelector('.cfd-lora-sc')?.value ?? 1)
                    }; }).filter(function(l){ return l.name; })
                };
            }
            function getPreviewPrompt(){
                const el = container.querySelector('#img-cfd-preview-prompt');
                return (el && el.value.trim()) || '1 person, upper body portrait, looking at viewer, simple background';
            }
            // 把預設包填回面板（套用）
            function applyPresetToPanel(p){
                if (!p) return;
                const mt = p.modelType || 'checkpoint';
                setVal('#img-cfd-type', mt);
                const ff = container.querySelector('#img-cfd-flux-fields');
                if (ff) ff.classList.toggle('hidden', mt !== 'flux');
                const af = container.querySelector('#img-cfd-anima-fields');
                if (af) af.classList.toggle('hidden', mt !== 'anima');
                refreshModels();
                setSelectVal('#img-cfd-model', p.model || '');
                setSelectVal('#img-cfd-vae', p.vae || '');
                setSelectVal('#img-cfd-sampler', p.sampler || 'euler');
                setSelectVal('#img-cfd-scheduler', p.scheduler || 'normal');
                setVal('#img-cfd-steps', p.steps != null ? p.steps : 28);
                setVal('#img-cfd-cfg', p.cfg != null ? p.cfg : 6.5);
                setVal('#img-cfd-width', p.width != null ? p.width : 1024);
                setVal('#img-cfd-height', p.height != null ? p.height : 1024);
                setVal('#img-cfd-clipskip', p.clipSkip != null ? p.clipSkip : 0);
                setVal('#img-cfd-base', p.basePrompt || '');
                setVal('#img-cfd-neg', p.negPrompt || '');
                setVal('#img-cfd-clipl', p.fluxClipL || 'clip_l.safetensors');
                setVal('#img-cfd-t5xxl', p.fluxT5 || 't5xxl_fp8_e4m3fn.safetensors');
                setVal('#img-cfd-ae', p.fluxAe || 'ae.safetensors');
                setVal('#img-cfd-guidance', p.guidance != null ? p.guidance : 3.5);
                setVal('#img-cfd-anima-clip', p.animaClip || 'qwen_3_06b_base.safetensors');
                setVal('#img-cfd-anima-vae', p.animaVae || 'qwen_image_vae.safetensors');
                if (lorasBox) { lorasBox.innerHTML = ''; (Array.isArray(p.loras) ? p.loras : []).forEach(function(L){ lorasBox.appendChild(makeLoraRow(L)); }); }
            }
            // 把生成的圖縮成 ~256px JPEG 縮圖（避免 localStorage 爆肥）
            function toThumb(dataUrl){
                return new Promise(function(resolve){
                    try {
                        const img = new Image();
                        img.onload = function(){
                            const max = 256; let w = img.width, h = img.height;
                            if (w >= h) { if (w > max){ h = Math.round(h*max/w); w = max; } }
                            else { if (h > max){ w = Math.round(w*max/h); h = max; } }
                            const c = document.createElement('canvas'); c.width = w; c.height = h;
                            c.getContext('2d').drawImage(img, 0, 0, w, h);
                            resolve(c.toDataURL('image/jpeg', 0.7));
                        };
                        img.onerror = function(){ resolve(dataUrl); };
                        img.src = dataUrl;
                    } catch(e){ resolve(dataUrl); }
                });
            }
            function cardStatus(i, msg){
                const el = container.querySelector('.cfd-card-status[data-idx="' + i + '"]');
                if (el) el.textContent = msg || '';
            }
            function renderPresetGrid(){
                const grid = container.querySelector('#img-cfd-preset-grid');
                if (!grid) return;
                const openBtn = container.querySelector('#img-cfd-preset-open');
                if (openBtn) openBtn.textContent = '📦 打開預設包（' + cfdPresets.length + ' 個）';
                if (!cfdPresets.length) { grid.innerHTML = '<div style="grid-column:1/-1; color:rgba(26,28,40,0.5); font-size:12px; padding:20px; text-align:center;">還沒有預設包。把面板調好後，按下面「➕ 從目前設定另存」。</div>'; return; }
                grid.innerHTML = cfdPresets.map(function(p, i){
                    const thumb = p.preview
                        ? '<img src="' + p.preview + '" style="width:100%; aspect-ratio:1; object-fit:cover; border-radius:6px; background:#0001;">'
                        : '<div style="width:100%; aspect-ratio:1; border-radius:6px; background:rgba(26,28,40,0.06); display:flex; align-items:center; justify-content:center; color:rgba(26,28,40,0.4); font-size:11px; text-align:center; line-height:1.5;">尚無預覽<br>點 🖼️ 生成</div>';
                    return '<div style="border:1px solid rgba(26,28,40,0.15); border-radius:8px; padding:8px; background:#fff;">' +
                        thumb +
                        '<div style="font-size:12px; font-weight:600; color:#1A1C28; margin:6px 0 4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="' + escAttr(p.name) + '">' + escAttr(p.name) + '</div>' +
                        '<div style="display:flex; gap:3px;">' +
                          '<span style="flex:1; text-align:center; font-size:11px; cursor:pointer; padding:4px 0; border:1px solid rgba(26,28,40,0.2); border-radius:4px; background:rgba(26,28,40,0.05);" onclick="window._cfdPreset.applyIdx(' + i + ')">套用</span>' +
                          '<span style="font-size:12px; cursor:pointer; padding:4px 7px; border:1px solid rgba(26,28,40,0.2); border-radius:4px; background:rgba(26,28,40,0.05);" title="生成風格預覽" onclick="window._cfdPreset.genPreviewIdx(' + i + ')">🖼️</span>' +
                          '<span style="font-size:12px; cursor:pointer; padding:4px 7px; border:1px solid #2b6cb0; border-radius:4px; background:rgba(43,108,176,0.1);" title="用目前面板設定覆蓋（會清掉預覽）" onclick="window._cfdPreset.overwriteIdx(' + i + ')">🔄</span>' +
                          '<span style="font-size:12px; cursor:pointer; padding:4px 7px; border:1px solid #fc8181; border-radius:4px; background:rgba(252,129,129,0.1);" title="刪除" onclick="window._cfdPreset.delIdx(' + i + ')">🗑️</span>' +
                        '</div>' +
                        '<div class="cfd-card-status" data-idx="' + i + '" style="font-size:10px; color:rgba(26,28,40,0.55); margin-top:3px; min-height:13px;"></div>' +
                      '</div>';
                }).join('');
            }
            window._cfdPreset = {
                open: function(){ const m = container.querySelector('#img-cfd-preset-modal'); if (m) m.style.display = 'flex'; renderPresetGrid(); },
                close: function(){ const m = container.querySelector('#img-cfd-preset-modal'); if (m) m.style.display = 'none'; },
                applyIdx: function(i){
                    const p = cfdPresets[i]; if (!p) return;
                    applyPresetToPanel(p);
                    this.close();
                    if (statusEl) statusEl.textContent = '✅ 已套用預設包「' + (p.name || '') + '」（要正式生圖記得按底部保存）';
                },
                saveNew: function(){
                    const ni = container.querySelector('#img-cfd-preset-newname');
                    const name = ni && ni.value.trim();
                    if (!name) { alert('請先輸入新預設包名稱'); if (ni) ni.focus(); return; }
                    cfdPresets.push(buildCfdPreset(name));
                    if (ni) ni.value = '';
                    renderPresetGrid();
                },
                overwriteIdx: function(i){
                    const old = cfdPresets[i]; if (!old) return;
                    if (!confirm('用目前面板的設定覆蓋預設包「' + old.name + '」？\n（舊預覽圖會清掉，需重新生成）')) return;
                    cfdPresets[i] = buildCfdPreset(old.name);  // 沿用原名、預覽清空
                    renderPresetGrid();
                },
                delIdx: function(i){
                    const old = cfdPresets[i]; if (!old) return;
                    if (!confirm('刪除預設包「' + old.name + '」？')) return;
                    cfdPresets.splice(i, 1);
                    renderPresetGrid();
                },
                genPreviewIdx: async function(i){
                    const p = cfdPresets[i]; if (!p) return;
                    const W = window.parent || window;
                    const mgr = W.OS_IMAGE_MANAGER;
                    if (!mgr || typeof mgr.previewComfyPreset !== 'function') { cardStatus(i, '生圖模組未就緒'); return; }
                    cardStatus(i, '⏳ 生成中…(15-40秒)');
                    try {
                        const url = await mgr.previewComfyPreset(p, getPreviewPrompt());
                        if (!url) { cardStatus(i, '❌ 失敗（檢查 ComfyUI 連線/模型）'); return; }
                        const thumb = await toThumb(url);
                        if (cfdPresets[i]) cfdPresets[i].preview = thumb;
                        renderPresetGrid();
                        cardStatus(i, '✅ 完成（記得按底部保存）');
                    } catch(e){ cardStatus(i, '❌ ' + (e && e.message || e)); }
                },
                exportPack: function(){
                    if (!cfdPresets.length) { alert('還沒有預設包可以匯出。'); return; }
                    const data = { type: 'aurelia_image_presets', version: 1, presets: cfdPresets };
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    const d = new Date();
                    a.download = '生圖預設包_' + d.getFullYear() + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0') + '.json';
                    a.click();
                    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1000);
                },
                importPack: function(){
                    const fi = container.querySelector('#img-cfd-preset-file');
                    if (fi) { fi.value = ''; fi.click(); }
                },
                // 把外來 JSON 收斂成乾淨的預設包物件（只留認識的欄位，缺的補預設值）
                _sanitizePreset: function(p){
                    const num = function(v, d){ const n = parseFloat(v); return isNaN(n) ? d : n; };
                    const int = function(v, d){ const n = parseInt(v); return isNaN(n) ? d : n; };
                    const s = function(v){ return (v == null) ? '' : String(v).trim(); };
                    return {
                        name: s(p.name),
                        modelType: ['checkpoint','flux','anima'].indexOf(p.modelType) >= 0 ? p.modelType : 'checkpoint',
                        model: s(p.model), vae: s(p.vae),
                        sampler: s(p.sampler) || 'euler', scheduler: s(p.scheduler) || 'normal',
                        steps: int(p.steps, 28), cfg: num(p.cfg, 6.5),
                        width: int(p.width, 1024), height: int(p.height, 1024),
                        clipSkip: int(p.clipSkip, 0),
                        basePrompt: s(p.basePrompt), negPrompt: s(p.negPrompt),
                        fluxClipL: s(p.fluxClipL) || 'clip_l.safetensors',
                        fluxT5: s(p.fluxT5) || 't5xxl_fp8_e4m3fn.safetensors',
                        fluxAe: s(p.fluxAe) || 'ae.safetensors',
                        guidance: num(p.guidance, 3.5),
                        animaClip: s(p.animaClip) || 'qwen_3_06b_base.safetensors',
                        animaVae: s(p.animaVae) || 'qwen_image_vae.safetensors',
                        loras: (Array.isArray(p.loras) ? p.loras : []).map(function(L){
                            return { on: !!(L && L.on !== false), name: s(L && L.name),
                                     strengthModel: num(L && L.strengthModel, 1), strengthClip: num(L && L.strengthClip, 1) };
                        }).filter(function(L){ return L.name; }),
                        preview: (typeof p.preview === 'string' && p.preview.indexOf('data:image') === 0) ? p.preview : ''
                    };
                },
                _importFile: function(file){
                    const self = this;
                    const reader = new FileReader();
                    reader.onload = function(){
                        try {
                            const j = JSON.parse(String(reader.result));
                            const arr = Array.isArray(j) ? j : (Array.isArray(j.presets) ? j.presets : null);
                            if (!arr || !arr.length) { alert('❌ 這個檔案裡找不到預設包，確認拿到的是畫風包檔（.json）再試一次。'); return; }
                            let added = 0, updated = 0;
                            arr.forEach(function(p){
                                if (!p || !String(p.name || '').trim()) return;
                                const clean = self._sanitizePreset(p);
                                const idx = cfdPresets.findIndex(function(x){ return x.name === clean.name; });
                                if (idx >= 0) {
                                    if (!clean.preview && cfdPresets[idx].preview) clean.preview = cfdPresets[idx].preview; // 沒帶縮圖就沿用舊的
                                    cfdPresets[idx] = clean; updated++;
                                } else { cfdPresets.push(clean); added++; }
                            });
                            if (!added && !updated) { alert('❌ 檔案裡的預設包都沒有名稱，讀不進來。'); return; }
                            renderPresetGrid();
                            alert('✅ 讀進來了：新增 ' + added + ' 個、更新 ' + updated + ' 個畫風包。\n記得按底部「保存」才會真的存住。');
                        } catch(e) { alert('❌ 這個檔案讀不出來，確認是畫風包檔（.json）再試一次。'); }
                    };
                    reader.readAsText(file);
                }
            };
            // 匯入用的隱藏檔案選擇器
            (function(){
                const fi = container.querySelector('#img-cfd-preset-file');
                if (fi) fi.addEventListener('change', function(){
                    const f = fi.files && fi.files[0];
                    if (f) window._cfdPreset._importFile(f);
                });
            })();
        })();

        // Fetch Logic (Primary)
        btnFetch.onclick = async () => {
            btnFetch.style.animation = "spin 1s linear infinite";
            status.innerText = "⏳ 正在獲取模型列表...";
            
            try {
                if (elSystemApi.checked) {
                    const win = window.parent;
                    let foundModel = win.oai_settings?.openai_model || win.settings?.makersuite_model;
                    if (!foundModel) {
                        const domSelect = win.document.querySelector('#model_openai_select');
                        if (domSelect) foundModel = domSelect.value;
                    }
                    if (foundModel) {
                        elModel.innerHTML = `<option value="${foundModel}" selected>${foundModel}</option>`;
                        status.innerText = `✅ 已同步 (系統): ${foundModel}`;
                    } else {
                        throw new Error("無法讀取酒館模型");
                    }
                } 
                else {
                    const url = elUrl.value.trim();
                    const key = elKey.value.trim();
                    if (!url) throw new Error("請輸入 API 地址");

                    let fetchUrl = url.replace(/\/chat\/completions$/, '').replace(/\/$/, '') + '/v1/models';
                    const res = await fetch(fetchUrl, { method: 'GET', headers: { 'Authorization': `Bearer ${key}` } });
                    
                    if (!res.ok) throw new Error(`API 錯誤: ${res.status}`);
                    
                    const data = await res.json();
                    let models = data.data || data.models || [];
                    
                    if (models.length > 0) {
                        elModel.innerHTML = '';
                        models.forEach(m => { 
                            const id = m.id || m;
                            elModel.innerHTML += `<option value="${id}">${id}</option>`; 
                        });
                        status.innerText = `✅ 成功獲取 ${models.length} 個模型`;
                    } else {
                        throw new Error("API 返回了空列表");
                    }
                }
            } catch (e) {
                console.error(e);
                status.innerText = `❌ 同步失敗: ${e.message}`;
            } finally {
                btnFetch.style.animation = "none";
            }
        };

        // Fetch Logic (Secondary)
        secFetch.onclick = async () => {
            secFetch.style.animation = "spin 1s linear infinite";
            status.innerText = "⏳ 正在獲取副模型列表...";
            
            try {
                if (secSystemApi.checked) {
                    const win = window.parent;
                    let foundModel = win.oai_settings?.openai_model || win.settings?.makersuite_model;
                    if (!foundModel) {
                        const domSelect = win.document.querySelector('#model_openai_select');
                        if (domSelect) foundModel = domSelect.value;
                    }
                    if (foundModel) {
                        secModel.innerHTML = `<option value="${foundModel}" selected>${foundModel}</option>`;
                        status.innerText = `✅ 副模型已同步 (系統): ${foundModel}`;
                    } else {
                        throw new Error("無法讀取酒館模型");
                    }
                } 
                else {
                    // 🔥 自動根據同步拉桿決定取用哪組 URL/Key
                    const isSync = secSyncPrimary && secSyncPrimary.checked;
                    const url = isSync ? elUrl.value.trim() : secUrl.value.trim();  
                    const key = isSync ? elKey.value.trim() : secKey.value.trim();  
                    
                    if (!url) throw new Error("請輸入副模型 API 地址");

                    let fetchUrl = url.replace(/\/chat\/completions$/, '').replace(/\/$/, '') + '/v1/models';
                    const res = await fetch(fetchUrl, { method: 'GET', headers: { 'Authorization': `Bearer ${key}` } });
                    
                    if (!res.ok) throw new Error(`API 錯誤: ${res.status}`);
                    
                    const data = await res.json();
                    let models = data.data || data.models || [];
                    
                    if (models.length > 0) {
                        secModel.innerHTML = ''; 
                        models.forEach(m => { 
                            const id = m.id || m;
                            secModel.innerHTML += `<option value="${id}">${id}</option>`; 
                        });
                        status.innerText = `✅ 副模型列表更新成功 (${models.length})`;
                    } else {
                        throw new Error("API 返回空列表");
                    }
                }

            } catch (e) {
                console.error(e);
                status.innerText = `❌ 副模型同步失敗: ${e.message}`;
            } finally {
                secFetch.style.animation = "none";
            }
        };

        // === Claude 的房間（獨立 Claude 接口）binding：slider 同步 + 測試連線 ===
        const elClaudeRoomTemp = container.querySelector('#claude-room-temperature');
        const elClaudeRoomTopP = container.querySelector('#claude-room-top-p');
        const elClaudeRoomValTemp = container.querySelector('#claude-room-val-temp');
        const elClaudeRoomValTopP = container.querySelector('#claude-room-val-topp');
        if (elClaudeRoomTemp && elClaudeRoomValTemp) {
            elClaudeRoomTemp.oninput = () => { elClaudeRoomValTemp.textContent = elClaudeRoomTemp.value; };
        }
        if (elClaudeRoomTopP && elClaudeRoomValTopP) {
            elClaudeRoomTopP.oninput = () => { elClaudeRoomValTopP.textContent = elClaudeRoomTopP.value; };
        }

        const claudeRoomTestBtn = container.querySelector('#claude-room-test-btn');
        const claudeRoomTestResult = container.querySelector('#claude-room-test-result');
        // URL 兼容處理：用戶可填 base URL / /v1 / 完整 URL，自動補成 /v1/chat/completions
        function _normalizeChatUrl(raw) {
            let u = (raw || '').trim().replace(/\/+$/, '');
            if (!u) return '';
            // Anthropic 直連格式：保留 /v1/messages 不變
            if (/api\.anthropic\.com/i.test(u) || u.endsWith('/v1/messages')) {
                if (u.endsWith('/v1/messages')) return u;
                if (u.endsWith('/v1')) return u + '/messages';
                if (/api\.anthropic\.com$/i.test(u)) return u + '/v1/messages';
                return u;
            }
            // OpenAI / cc-bridge 兼容：補 /v1/chat/completions
            if (u.endsWith('/chat/completions')) return u;
            if (u.endsWith('/v1')) return u + '/chat/completions';
            return u + '/v1/chat/completions';
        }

        // 判斷 URL 是不是 Anthropic 直連
        function _isAnthropicDirectUrl(u) {
            if (!u) return false;
            return /api\.anthropic\.com/i.test(u) || u.endsWith('/v1/messages');
        }

        // ===== Claude Presets：渲染清單 + CRUD =====
        const presetsListEl = container.querySelector('#claude-presets-list');
        const presetsHiddenEl = container.querySelector('#claude-presets-json');
        const activePresetIdEl = container.querySelector('#claude-active-preset-id');
        let _presets = [];
        let _activeId = '';
        try { _presets = JSON.parse(presetsHiddenEl?.value || '[]') || []; } catch(e) {}
        _activeId = activePresetIdEl?.value || (_presets[0]?.id || '');

        function _persistPresets() {
            if (presetsHiddenEl) presetsHiddenEl.value = JSON.stringify(_presets);
            if (activePresetIdEl) activePresetIdEl.value = _activeId;
        }

        function _renderPresets() {
            if (!presetsListEl) return;
            presetsListEl.innerHTML = '';
            _presets.forEach((p, idx) => {
                const card = document.createElement('div');
                card.style.cssText = 'background:rgba(228,232,245,0.4); border:1px solid rgba(26,28,40,0.10); border-radius:6px; padding:10px; margin-bottom:8px;';
                card.innerHTML = `
                    <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:bold; color:#1A1C28;">
                        <input type="radio" name="claude-active-preset" value="${p.id}" ${p.id === _activeId ? 'checked' : ''}>
                        <input class="set-input" data-field="name" placeholder="預設名稱" value="${(p.name || '').replace(/"/g,'&quot;')}" style="flex:1; min-width:0;">
                        <button class="claude-preset-del" title="刪除預設" style="background:rgba(217,81,34,0.2); color:#D95122; border:1px solid rgba(217,81,34,0.4); border-radius:4px; padding:2px 8px; cursor:pointer;">✕</button>
                    </label>
                    <div style="margin-top:8px;">
                        <input class="set-input" data-field="url" placeholder="https://api.anthropic.com/v1/messages 或 cc-bridge URL" value="${(p.url || '').replace(/"/g,'&quot;')}">
                    </div>
                    <div style="margin-top:6px;">
                        <input class="set-input" data-field="key" type="password" placeholder="API Key（sk-ant-... 或 cc_bridge_token）" value="${(p.key || '').replace(/"/g,'&quot;')}">
                    </div>
                `;
                // radio
                card.querySelector('input[type="radio"]').onchange = (e) => {
                    if (e.target.checked) { _activeId = p.id; _persistPresets(); }
                };
                // 三個欄位 input 監聽（即時更新 _presets）
                card.querySelectorAll('input[data-field]').forEach(inp => {
                    inp.oninput = () => {
                        _presets[idx][inp.dataset.field] = inp.value;
                        _persistPresets();
                    };
                });
                // 刪除
                card.querySelector('.claude-preset-del').onclick = () => {
                    if (_presets.length <= 1) { alert('至少要留一組預設'); return; }
                    if (!confirm(`刪除預設「${p.name || p.id}」？`)) return;
                    _presets.splice(idx, 1);
                    if (_activeId === p.id) _activeId = _presets[0].id;
                    _persistPresets();
                    _renderPresets();
                };
                presetsListEl.appendChild(card);
            });
        }

        _renderPresets();

        const presetAddBtn = container.querySelector('#claude-preset-add-btn');
        if (presetAddBtn) {
            presetAddBtn.onclick = () => {
                const id = 'p' + Date.now().toString(36);
                _presets.push({ id, name: '新預設', url: 'https://api.anthropic.com/v1/messages', key: '' });
                _activeId = id;
                _persistPresets();
                _renderPresets();
            };
        }

        if (claudeRoomTestBtn && claudeRoomTestResult) {
            claudeRoomTestBtn.onclick = async () => {
                const active = _presets.find(p => p.id === _activeId) || _presets[0];
                if (!active) {
                    claudeRoomTestResult.style.display = 'block';
                    claudeRoomTestResult.textContent = '❌ 沒有任何預設，請先新增';
                    return;
                }
                const url = _normalizeChatUrl(active.url);
                const key = (active.key || '').trim();
                const model = container.querySelector('#claude-room-model').value.trim() || 'claude-opus-4-7';
                if (!url || !key) {
                    claudeRoomTestResult.style.display = 'block';
                    claudeRoomTestResult.textContent = `❌ 「${active.name || active.id}」沒填完整 URL+密鑰`;
                    return;
                }
                const isAnthropic = _isAnthropicDirectUrl(url);
                claudeRoomTestBtn.textContent = '⏳ 測試中（首次可能 10-30 秒）…';
                claudeRoomTestResult.style.display = 'block';
                claudeRoomTestResult.textContent = `⏳ 打 ${url}\n（${isAnthropic ? 'Anthropic 直連' : 'cc-bridge / OpenAI 兼容'}）…`;
                try {
                    let resp, data;
                    if (isAnthropic) {
                        resp = await fetch(url, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'x-api-key': key,
                                'anthropic-version': '2023-06-01',
                                'anthropic-dangerous-direct-browser-access': 'true',
                            },
                            body: JSON.stringify({
                                model,
                                max_tokens: 100,
                                messages: [{ role: 'user', content: '用一句繁中說「Claude 的房間連線測試成功」' }],
                            }),
                        });
                        data = await resp.json();
                        if (resp.ok && data.content) {
                            const txt = (data.content.find(b => b.type === 'text') || {}).text || '';
                            claudeRoomTestResult.textContent = `✅ 連線成功\n\n回覆：${txt}`;
                        } else {
                            claudeRoomTestResult.textContent = `❌ ${(data.error && data.error.message) || '未知錯誤'}\nstatus: ${resp.status}`;
                        }
                    } else {
                        resp = await fetch(url, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${key}`,
                            },
                            body: JSON.stringify({
                                model,
                                messages: [{ role: 'user', content: '用一句繁中說「Claude 的房間連線測試成功」' }],
                                stream: false,
                                max_tokens: 100,
                            }),
                        });
                        data = await resp.json();
                        if (resp.ok && data.choices && data.choices[0]) {
                            claudeRoomTestResult.textContent = `✅ 連線成功\n\n回覆：${data.choices[0].message.content}`;
                        } else {
                            claudeRoomTestResult.textContent = `❌ ${(data.error && data.error.message) || '未知錯誤'}\nstatus: ${resp.status}`;
                        }
                    }
                } catch (e) {
                    claudeRoomTestResult.textContent = `❌ 網路錯誤：${e.message}`;
                } finally {
                    claudeRoomTestBtn.textContent = '🔍 測試當前預設的連線';
                }
            };
        }

        btnSave.onclick = () => {
            try {
                const layoutMode = container.querySelector('#os-layout-mode')?.value || 'auto';
                localStorage.setItem('aurelia_layout_mode', layoutMode);
                // ⚠️ 只在 PWA(獨立)版才套 iOS 安全區下移；酒館裡 ST 已處理過、再套會重複往下推 → 一律移除
                const isStandalone = !(window.parent || window).SillyTavern;
                const targetDocs = [document];
                if (window.parent && window.parent.document) targetDocs.push(window.parent.document);
                targetDocs.forEach(d => {
                    if (layoutMode === 'pad-ios' && isStandalone) {
                        d.body.classList.add('layout-pad-ios');
                    } else {
                        d.body.classList.remove('layout-pad-ios');
                    }
                });
                
                const header = container.querySelector('.set-header');
                if (header) {
                    if (layoutMode === 'pad-ios') {
                        header.style.setProperty('padding-top', '55px', 'important');
                    } else {
                        header.style.removeProperty('padding-top');
                    }
                }

                const llmData = {
                    useSystemApi: elSystemApi.checked,
                    stProfileId: elStProfile.value,
                    url: elUrl.value.trim(),
                    key: elKey.value.trim(),
                    model: elModel.value,
                    enableSummaryOnly: elSummaryMode ? elSummaryMode.checked : false,
                    usePresetPrompts: elUsePresetPrompts ? elUsePresetPrompts.checked : false,
                    presetName: (elPresetName ? elPresetName.value : '') || '',
                    maxTokens: parseInt(elMaxTokens.value),
                    temperature: parseFloat(elTemp.value),
                    top_p: parseFloat(elTopP.value),
                    frequency_penalty: parseFloat(elFreqPenalty.value),
                    presence_penalty: parseFloat(elPresPenalty.value),
                    enableThinking: elEnableThinking ? elEnableThinking.checked : false,
                    thinkingBudget: elThinkingBudget ? parseInt(elThinkingBudget.value) : 8000,
                    directMode: false, enableStreaming: false, disableTyping: false
                };

                // 🔥 自動根據同步拉桿，存儲對應的 URL/Key
                const isSecSync = secSyncPrimary ? secSyncPrimary.checked : false;
                const secLlmData = {
                    useSystemApi: secSystemApi.checked,
                    stProfileId: secStProfile.value,
                    syncWithPrimary: isSecSync,
                    url: isSecSync ? elUrl.value.trim() : secUrl.value.trim(),
                    key: isSecSync ? elKey.value.trim() : secKey.value.trim(),
                    model: secModel.value,
                    enableSummaryOnly: secSummaryMode ? secSummaryMode.checked : false,
                    usePresetPrompts: secUsePresetPrompts ? secUsePresetPrompts.checked : false,
                    presetName: (secPresetName ? secPresetName.value : '') || '',
                    maxTokens: parseInt(secMaxTokens.value),
                    temperature: parseFloat(secTemp.value),
                    top_p: parseFloat(secTopP.value),
                    frequency_penalty: parseFloat(secFreqPenalty.value),
                    presence_penalty: parseFloat(secPresPenalty.value),
                    directMode: false, enableStreaming: false, disableTyping: false
                };

                // 同步開關：ON＝背景沿用角色來源；OFF＝背景用自己選的
                const _imgSyncBgEl = container.querySelector('#img-sync-bg-to-char');
                const _imgSynced   = _imgSyncBgEl ? _imgSyncBgEl.checked : true;
                const _imgLivingSvc = elImgServiceLiving ? elImgServiceLiving.value : 'pollinations';
                const imgData = {
                    // 兩桶各自存；service 保留＝活物桶當 legacy mirror（避免漏改的舊讀者爆掉）
                    serviceInanimate: _imgSynced ? _imgLivingSvc : (elImgServiceInanimate ? elImgServiceInanimate.value : 'pollinations'),
                    serviceLiving:    _imgLivingSvc,
                    service:          _imgLivingSvc,
                    imgSourceSynced:  _imgSynced,
                    pollinations: {
                        url: 'https://gen.pollinations.ai/image',
                        apiKey: elPolApiKey.value.trim(),
                        model: elPolModel.value,
                        size: elPolSize?.value || imgConfig.pollinations?.size || '1024x1024',
                        models: imgConfig.pollinations.models || {},
                        charBasePrompt: elStylePrompt.value.trim(),
                        charNegPrompt: elCharNegPrompt.value.trim(),
                        itemBasePrompt: imgConfig.pollinations.itemBasePrompt,
                        itemNegPrompt: imgConfig.pollinations.itemNegPrompt
                    },
                    novelai: {
                        token: elNaiToken.value.trim(),
                        url: 'https://image.novelai.net/ai/generate-image',
                        model: elNaiModel ? elNaiModel.value : 'nai-diffusion-3',
                        capFreeSize:   container.querySelector('#img-nai-cap-free')?.checked ?? true,
                        sampler:       (container.querySelector('#img-nai-sampler')?.value        || 'k_euler_ancestral'),
                        scale:         parseFloat(container.querySelector('#img-nai-scale')?.value  ?? 5),
                        steps:         parseInt(container.querySelector('#img-nai-steps')?.value    ?? 28),
                        ucPreset:      parseInt(container.querySelector('#img-nai-uc-preset')?.value ?? 1),
                        qualityToggle: container.querySelector('#img-nai-quality-toggle')?.checked ?? true,
                        smea:          container.querySelector('#img-nai-smea')?.checked ?? true,
                        smeaDyn:       container.querySelector('#img-nai-smea-dyn')?.checked ?? false,
                        charBasePrompt: (container.querySelector('#img-nai-char-base')?.value || '').trim(),
                        charNegPrompt:  (container.querySelector('#img-nai-char-neg')?.value  || '').trim(),
                        itemBasePrompt: (container.querySelector('#img-nai-item-base')?.value || '').trim(),
                        itemNegPrompt:  (container.querySelector('#img-nai-item-neg')?.value  || '').trim(),
                        naiPresets: naiPresets,
                    },
                    comfyuiDirect: {
                        url:       (container.querySelector('#img-cfd-url')?.value || '').trim(),
                        modelType: (container.querySelector('#img-cfd-type')?.value || 'checkpoint'),
                        model:     (container.querySelector('#img-cfd-model')?.value || '').trim(),
                        vae:       (container.querySelector('#img-cfd-vae')?.value || '').trim(),
                        sampler:   (container.querySelector('#img-cfd-sampler')?.value || 'euler').trim(),
                        scheduler: (container.querySelector('#img-cfd-scheduler')?.value || 'normal').trim(),
                        steps:     parseInt(container.querySelector('#img-cfd-steps')?.value ?? 28) || 28,
                        cfg:       parseFloat(container.querySelector('#img-cfd-cfg')?.value ?? 6.5) || 6.5,
                        width:     parseInt(container.querySelector('#img-cfd-width')?.value ?? 1024) || 1024,
                        height:    parseInt(container.querySelector('#img-cfd-height')?.value ?? 1024) || 1024,
                        seed:      (function(){ const v = parseInt(container.querySelector('#img-cfd-seed')?.value ?? -1); return isNaN(v) ? -1 : v; })(),
                        clipSkip:  parseInt(container.querySelector('#img-cfd-clipskip')?.value ?? 0) || 0,
                        basePrompt:(container.querySelector('#img-cfd-base')?.value || '').trim(),
                        negPrompt: (container.querySelector('#img-cfd-neg')?.value || '').trim(),
                        loras: Array.from(container.querySelectorAll('#img-cfd-loras .cfd-lora-row')).map(r => ({
                            on:   r.querySelector('.cfd-lora-on')?.checked ?? true,
                            name: (r.querySelector('.cfd-lora-name')?.value || '').trim(),
                            strengthModel: parseFloat(r.querySelector('.cfd-lora-sm')?.value ?? 1),
                            strengthClip:  parseFloat(r.querySelector('.cfd-lora-sc')?.value ?? 1)
                        })).filter(l => l.name),
                        fluxClipL: (container.querySelector('#img-cfd-clipl')?.value || 'clip_l.safetensors').trim(),
                        fluxT5:    (container.querySelector('#img-cfd-t5xxl')?.value || 't5xxl_fp8_e4m3fn.safetensors').trim(),
                        fluxAe:    (container.querySelector('#img-cfd-ae')?.value || 'ae.safetensors').trim(),
                        guidance:  parseFloat(container.querySelector('#img-cfd-guidance')?.value ?? 3.5) || 3.5,
                        animaClip: (container.querySelector('#img-cfd-anima-clip')?.value || 'qwen_3_06b_base.safetensors').trim(),
                        animaVae:  (container.querySelector('#img-cfd-anima-vae')?.value || 'qwen_image_vae.safetensors').trim(),
                        presets:   cfdPresets,
                        previewPrompt: (container.querySelector('#img-cfd-preview-prompt')?.value || '').trim(),
                        sceneHires:        container.querySelector('#img-cfd-scene-hires')?.checked ?? true,
                        sceneHiresScale:   parseFloat(container.querySelector('#img-cfd-scene-hires-scale')?.value || 1.5) || 1.5,
                        sceneFaceDetailer: container.querySelector('#img-cfd-scene-facedetailer')?.checked ?? true,
                        workflowMode:  (container.querySelector('#img-cfd-wfmode')?.value || 'auto'),
                        customWorkflow:(container.querySelector('#img-cfd-custom-wf-text')?.value || '')
                    },
                    sceneGen: {
                        promptStyle:      container.querySelector('#img-scene-prompt-style')?.value || 'auto',
                        size:             (() => { const _sz = container.querySelector('#img-scene-size'); if (_sz?.value === 'custom') { const _c = (container.querySelector('#img-scene-size-custom')?.value || '').trim().toLowerCase().replace(/\s+/g, '').replace(/[×*]/g, 'x'); return /^\d{2,5}x\d{2,5}$/.test(_c) ? _c : '1024x1024'; } return _sz?.value || '1024x1024'; })(),
                        sceneBasePrompt: (container.querySelector('#img-scene-base-prompt')?.value || '').trim(),
                        sceneNegPrompt:  (container.querySelector('#img-scene-neg-prompt')?.value  || '').trim(),
                        extractEnabled:   container.querySelector('#img-scene-extract-enabled')?.checked ?? false,
                        extractPromptTags:    (container.querySelector('#img-scene-extract-tags')?.value || '').trim(),
                        extractPromptNatural: (container.querySelector('#img-scene-extract-natural')?.value || '').trim(),
                    },
                    pixabayKey:    (container.querySelector('#img-pixabay-key')?.value || '').trim(),
                    fallbackForce:  container.querySelector('#img-fallback-force')?.checked ?? false,
                    avatarSize:    (container.querySelector('#img-avatar-size')?.value || ''),
                    bgSize:        (container.querySelector('#img-bg-size')?.value || '1024x768')
                };

                const mmGroupId   = container.querySelector('#mm-group-id');
                const mmApiKey    = container.querySelector('#mm-api-key');
                const mmProvider  = container.querySelector('#mm-provider');
                const mmModel     = container.querySelector('#mm-speech-model');
                const mmEnabled   = container.querySelector('#mm-enabled');
                const mmSpeed     = container.querySelector('#mm-speed');
                const mmLangBoost = container.querySelector('#mm-lang-boost');
                const voiceProfiles = [];
                container.querySelectorAll('.mm-profile-card').forEach(card => {
                    const label   = card.querySelector('.mm-p-label')?.value.trim();
                    const id      = card.querySelector('.mm-p-id')?.value.trim();
                    const aliases = [];
                    card.querySelectorAll('.mm-alias-chip').forEach(chip => {
                        const t = chip.dataset.alias;
                        if (t) aliases.push(t);
                    });
                    if (label && id) voiceProfiles.push({ label, id, aliases });
                });
                const minimaxData = mmGroupId ? {
                    enabled:              mmEnabled  ? mmEnabled.checked        : false,
                    groupId:              mmGroupId.value.trim(),
                    apiKey:               mmApiKey   ? mmApiKey.value.trim()      : '',
                    provider:             mmProvider ? mmProvider.value          : 'cn',
                    speechModel:          mmModel    ? mmModel.value             : 'speech-01-turbo',
                    defaultSpeed:         mmSpeed    ? parseFloat(mmSpeed.value) : 1.0,
                    defaultLanguageBoost: mmLangBoost ? mmLangBoost.value        : '',
                    voiceProfiles
                } : null;

                saveConfig(llmData, secLlmData, imgData, minimaxData);

                // 換產圖器後：依新 service 自動翻「-VN小說家-」世界書三條目的開關（只翻 enabled，不寫內容）
                try { (window.parent || window).OS_AVATAR_RULES_INJECTOR?.syncAvatarRuleEntries?.(); } catch (e) {}

                // Claude 的房間設定（獨立儲存，跟主/副模型完全隔離）
                const elClaudeRoomModel = container.querySelector('#claude-room-model');
                if (elClaudeRoomModel) {
                    // 從 hidden field 讀回現場編輯的 presets / activeId
                    let presets = [];
                    try { presets = JSON.parse(container.querySelector('#claude-presets-json')?.value || '[]') || []; } catch(e) {}
                    // URL 跑一次 normalize（保證後端格式統一）
                    presets = presets.map(p => ({ ...p, url: _normalizeChatUrl(p.url || '') || (p.url || '') }));
                    const activePresetId = container.querySelector('#claude-active-preset-id')?.value
                        || (presets[0]?.id || '');

                    // 讀回 inline picker 既有覆寫值（不被儲存覆蓋掉）
                    const existing = loadClaudeRoomConfig();

                    const claudeRoomData = {
                        presets,
                        activePresetId,
                        model: elClaudeRoomModel.value.trim() || 'claude-opus-4-7',
                        maxTokens: parseInt(container.querySelector('#claude-room-max-tokens').value) || 4096,
                        temperature: parseFloat(container.querySelector('#claude-room-temperature').value) || 1.0,
                        top_p: parseFloat(container.querySelector('#claude-room-top-p').value) || 1.0,
                        inlineModel:   existing.inlineModel   || '',
                        inlineEffort:  existing.inlineEffort  || '',
                        inlineBackend: existing.inlineBackend || '',
                    };
                    saveClaudeRoomConfig(claudeRoomData);
                }

                // 向量記憶設定
                if (vecEnabled) {
                    const vecData = {
                        enabled:           vecEnabled.checked,
                        embeddingUrl:      vecUrl  ? vecUrl.value.trim()  : '',
                        embeddingModel:    vecModel ? vecModel.value.trim() : 'text-embedding-3-small',
                        syncKeyWithPrimary: vecSyncKey ? vecSyncKey.checked : true,
                        embeddingKey:      vecKey  ? vecKey.value.trim()  : '',
                        topK:              vecTopK  ? parseInt(vecTopK.value) : 5
                    };
                    localStorage.setItem('os_vector_config', JSON.stringify(vecData));
                }

                // VN 設置由外部模組統一存入 vn_cfg_v4
                if (window.VN_SETTINGS_PANEL) window.VN_SETTINGS_PANEL.save(container);
                btnSave.innerText = "已保存 ✓";
                status.innerText = "✅ 設置已生效";
                setTimeout(() => { btnSave.innerText = "保存所有設定"; }, 2000);
            } catch (e) {
                console.error("保存失敗:", e);
                status.innerText = `❌ 保存失敗: ${e.message}`; 
            }
        };

        // --- Test API Logic (共用) ---
        async function runApiTest(cfg, modelVal, resultEl) {
            resultEl.style.display = 'block';
            resultEl.style.color = 'rgba(26,28,40,0.40)';
            resultEl.textContent = '⏳ 測試中...';
            try {
                let replyText = '';
                const win = window.parent || window;
                const doc = win.document;

                if (cfg.useSystemApi) {
                    const context = win.SillyTavern?.getContext?.();
                    if (!context) throw new Error('無法取得 ST Context');

                    if (cfg.stProfileId) {
                        const profilesSelect = doc.getElementById('connection_profiles');
                        if (!profilesSelect) throw new Error('找不到 ST 連線設定選單 (#connection_profiles)');

                        const originalProfileId = profilesSelect.value;
                        const needSwitch = (originalProfileId !== cfg.stProfileId);

                        if (needSwitch) {
                            profilesSelect.value = cfg.stProfileId;
                            await new Promise((resolve, reject) => {
                                const timeout = setTimeout(() => reject(new Error('切換設定檔逾時 (10秒)')), 10000);
                                context.eventSource.once(context.eventTypes.CONNECTION_PROFILE_LOADED, () => {
                                    clearTimeout(timeout);
                                    resolve();
                                });
                                profilesSelect.dispatchEvent(new Event('change'));
                            });
                        }

                        let response;
                        try {
                            response = await context.ConnectionManagerRequestService.sendRequest(
                                cfg.stProfileId,
                                [{ role: 'user', content: 'Hi' }],
                                50
                            );
                        } finally {
                            if (needSwitch) {
                                profilesSelect.value = originalProfileId || '';
                                profilesSelect.dispatchEvent(new Event('change'));
                            }
                        }
                        replyText = response?.choices?.[0]?.message?.content || JSON.stringify(response);
                    } else {
                        const headers = context.getRequestHeaders();
                        const res = await fetch('/api/backends/chat-completions/generate', {
                            method: 'POST',
                            headers: { ...headers, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }], max_tokens: 50, stream: false })
                        });
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        const data = await res.json();
                        replyText = data?.choices?.[0]?.message?.content || data?.content || JSON.stringify(data);
                    }
                } else {
                    if (!cfg.url) throw new Error('請先填寫 API 地址');
                    let targetUrl = cfg.url.replace(/\/$/, '');
                    if (!targetUrl.includes('/chat/completions')) targetUrl += (targetUrl.endsWith('/v1') ? '' : '/v1') + '/chat/completions';
                    const res = await fetch(targetUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.key}` },
                        body: JSON.stringify({ model: modelVal, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 50, stream: false })
                    });
                    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
                    const data = await res.json();
                    replyText = data?.choices?.[0]?.message?.content || data?.content || JSON.stringify(data);
                }

                resultEl.style.color = 'rgba(26,28,40,0.25)';
                resultEl.textContent = '✅ 回應: ' + replyText;
                status.innerText = '✅ API 連線成功';
            } catch (e) {
                resultEl.style.color = '#fc8181';
                resultEl.textContent = '❌ 錯誤: ' + e.message;
                status.innerText = '❌ API 測試失敗'; 
            }
        }

        btnTest.onclick = async () => {
            btnTest.style.opacity = '0.5'; btnTest.textContent = '⏳ 測試中...';
            await runApiTest(
                { useSystemApi: elSystemApi.checked, stProfileId: elStProfile.value, url: elUrl.value.trim(), key: elKey.value.trim() },
                elModel.value,
                container.querySelector('#os-test-result')
            );
            btnTest.style.opacity = '1'; btnTest.textContent = '🔌 發送測試訊息';
        };

        // 🔥 副模型測試：自動判斷是否使用同步的 URL/Key
        secTestBtn.onclick = async () => {
            secTestBtn.style.opacity = '0.5'; secTestBtn.textContent = '⏳ 測試中...';
            const isSecSync = secSyncPrimary && secSyncPrimary.checked;
            const testUrl = isSecSync ? elUrl.value.trim() : secUrl.value.trim();
            const testKey = isSecSync ? elKey.value.trim() : secKey.value.trim();
            await runApiTest(
                { useSystemApi: secSystemApi.checked, stProfileId: secStProfile.value, url: testUrl, key: testKey },
                secModel.value,
                container.querySelector('#sec-test-result')
            );
            secTestBtn.style.opacity = '1'; secTestBtn.textContent = '🔌 發送測試訊息';
        };


        // 若預設 mode 是 sovits，render 後立刻注入 vn_tts_panel inline
        if (currentTtsMode === 'sovits' && window.VN_TTS_Panel?.initInline) {
            setTimeout(() => window.VN_TTS_Panel.initInline('vn-tts-inline-root'), 100);
        }
        // 旁白·系統選擇器：不分模式都掛（永遠顯示在模式切換下方；旁白/系統默認關閉）
        if (window.VN_TTS_Panel?.mountNarration) {
            setTimeout(() => window.VN_TTS_Panel.mountNarration('vn-narr-inline-root'), 100);
        }

        const mmSpeedSlider = container.querySelector('#mm-speed');
        const mmSpeedVal    = container.querySelector('#mm-speed-val');
        if (mmSpeedSlider) {
            mmSpeedSlider.oninput = () => {
                mmSpeedVal.textContent = parseFloat(mmSpeedSlider.value).toFixed(1);
            };
        }

        let naiPresets = [...(imgConfig.novelai.naiPresets || [])];
        // 拖圖預設用穩定 id 對應 IndexedDB 縮圖；舊預設（沒 id）補一個
        naiPresets.forEach(p => { if (p && !p.id) p.id = 'np_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7); });

        function refreshNaiPresetDropdown() {
            const sel = container.querySelector('#img-nai-preset-sel');
            if (!sel) return;
            const cur = sel.value;
            sel.innerHTML = '<option value="">-- 選擇預設 --</option>' +
                naiPresets.map((p, i) => `<option value="${i}">${p.name}</option>`).join('');
            if (cur !== '' && naiPresets[parseInt(cur)]) sel.value = cur;
        }

        // ── NAI 拖圖預設包：helpers ──
        const naiEscAttr = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
        function naiSuggestName(r, f) {
            const pp = (r && r.prompt) || '';
            const m = pp.match(/::\s*([^:,\n]+?)\s*::/);
            let base = m ? m[1] : ((pp.split(/[,\n]/).map(s => s.trim()).filter(Boolean)[0]) || '');
            base = base.replace(/^\d+(\.\d+)?::/, '').replace(/[{}\[\]]/g, '').trim();
            if (!base && f && f.name) base = f.name.replace(/\.[^.]+$/, '');
            return (base || 'NAI 預設').slice(0, 24);
        }
        function naiFileToThumb(file) {
            return new Promise(resolve => {
                createImageBitmap(file).then(bmp => {
                    const max = 256; let w = bmp.width, h = bmp.height;
                    if (w >= h) { if (w > max) { h = Math.round(h * max / w); w = max; } }
                    else { if (h > max) { w = Math.round(w * max / h); h = max; } }
                    const c = document.createElement('canvas'); c.width = w; c.height = h;
                    c.getContext('2d').drawImage(bmp, 0, 0, w, h);
                    if (bmp.close) bmp.close();
                    resolve(c.toDataURL('image/jpeg', 0.72));
                }).catch(() => resolve(null));
            });
        }
        function naiNewId() { return 'np_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7); }

        window._naiPreset = {
            apply() {
                const sel = container.querySelector('#img-nai-preset-sel');
                if (!sel || sel.value === '') { alert('請先選擇預設'); return; }
                const p = naiPresets[parseInt(sel.value)];
                if (!p) return;
                const set = (id, v) => { const el = container.querySelector(id); if (el) el.value = v; };
                set('#img-nai-char-base', p.charBasePrompt || '');
                set('#img-nai-char-neg',  p.charNegPrompt  || '');
                set('#img-nai-item-base', p.itemBasePrompt || '');
                set('#img-nai-item-neg',  p.itemNegPrompt  || '');
                if (p.sampler  !== undefined) set('#img-nai-sampler', p.sampler);
                if (p.scale    !== undefined) set('#img-nai-scale',   p.scale);
                if (p.steps    !== undefined) set('#img-nai-steps',   p.steps);
                if (p.ucPreset !== undefined) set('#img-nai-uc-preset', p.ucPreset);
            },
            save() {
                const row = container.querySelector('#img-nai-preset-name-row');
                if (row) row.style.display = 'block';
                container.querySelector('#img-nai-preset-name-input')?.focus();
            },
            confirmSave() {
                const nameInput = container.querySelector('#img-nai-preset-name-input');
                const name = nameInput?.value.trim();
                if (!name) { alert('請輸入預設名稱'); return; }
                const get = id => (container.querySelector(id)?.value || '').trim();
                const getNum = (id, def) => parseFloat(container.querySelector(id)?.value ?? def);
                const getInt = (id, def) => parseInt(container.querySelector(id)?.value ?? def);
                naiPresets.push({
                    id: naiNewId(),
                    name,
                    charBasePrompt: get('#img-nai-char-base'),
                    charNegPrompt:  get('#img-nai-char-neg'),
                    itemBasePrompt: get('#img-nai-item-base'),
                    itemNegPrompt:  get('#img-nai-item-neg'),
                    sampler:   get('#img-nai-sampler') || 'k_euler_ancestral',
                    scale:     getNum('#img-nai-scale', 5),
                    steps:     getInt('#img-nai-steps', 28),
                    ucPreset:  getInt('#img-nai-uc-preset', 1),
                });
                refreshNaiPresetDropdown();
                const sel = container.querySelector('#img-nai-preset-sel');
                if (sel) sel.value = String(naiPresets.length - 1);
                const row = container.querySelector('#img-nai-preset-name-row');
                if (row) row.style.display = 'none';
                if (nameInput) nameInput.value = '';
            },
            cancelSave() {
                const row = container.querySelector('#img-nai-preset-name-row');
                if (row) row.style.display = 'none';
                const nameInput = container.querySelector('#img-nai-preset-name-input');
                if (nameInput) nameInput.value = '';
            },
            del() {
                const sel = container.querySelector('#img-nai-preset-sel');
                if (!sel || sel.value === '') { alert('請先選擇要刪除的預設'); return; }
                const idx = parseInt(sel.value);
                const name = naiPresets[idx]?.name || '';
                if (!confirm(`刪除預設「${name}」？`)) return;
                const tid = naiPresets[idx]?.thumbId;
                if (tid) { try { (window.parent || window).OS_DB?.deleteNaiThumb(tid); } catch (e) {} }
                naiPresets.splice(idx, 1);
                refreshNaiPresetDropdown();
                this.renderGrid();
            },

            // ── 拖圖預設包（卡片牆 + 縮圖預覽）──
            open() {
                const m = container.querySelector('#img-nai-pack-modal');
                if (m) m.classList.add('is-open');
                this._bindDrop();
                this.renderGrid();
            },
            close() {
                const m = container.querySelector('#img-nai-pack-modal');
                if (m) m.classList.remove('is-open');
            },
            _bindDrop() {
                if (this._dropBound) return;
                const drop = container.querySelector('#img-nai-pack-drop');
                const file = container.querySelector('#img-nai-pack-file');
                if (!drop) return;
                const self = this;
                drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('is-drag'); });
                drop.addEventListener('dragleave', () => drop.classList.remove('is-drag'));
                drop.addEventListener('drop', e => {
                    e.preventDefault(); drop.classList.remove('is-drag');
                    if (e.dataTransfer && e.dataTransfer.files) self.handleFiles(e.dataTransfer.files);
                });
                if (file) file.addEventListener('change', e => { self.handleFiles(e.target.files); e.target.value = ''; });
                this._dropBound = true;
            },
            async handleFiles(fileList) {
                const W = window.parent || window;
                const RECIPE = W.NAI_RECIPE, OSDB = W.OS_DB;
                const statusEl = container.querySelector('#img-nai-pack-status');
                const files = Array.from(fileList || []).filter(f => /image\//.test(f.type) || /\.(png|webp)$/i.test(f.name || ''));
                if (!files.length) return;
                if (!RECIPE || !RECIPE.parseFile) { if (statusEl) statusEl.textContent = '解析模組未就緒'; return; }
                let ok = 0, fail = 0;
                for (let fi = 0; fi < files.length; fi++) {
                    const f = files[fi];
                    if (statusEl) statusEl.textContent = `⏳ 解析中 ${fi + 1}/${files.length}…`;
                    let res = null;
                    try { res = await RECIPE.parseFile(f); } catch (e) { res = null; }
                    if (!res || !res.ok) { fail++; continue; }
                    const r = res.recipe;
                    const id = naiNewId();
                    let thumbId = '';
                    try {
                        const thumb = await naiFileToThumb(f);
                        if (thumb && OSDB && OSDB.saveNaiThumb) { await OSDB.saveNaiThumb(id, thumb); thumbId = id; }
                    } catch (e) {}
                    naiPresets.push({
                        id, name: naiSuggestName(r, f),
                        charBasePrompt: r.prompt || '',
                        charNegPrompt:  r.neg || '',
                        itemBasePrompt: '', itemNegPrompt: '',
                        sampler: r.sampler || 'k_euler',
                        scale: (r.scale != null ? r.scale : 5),
                        steps: (r.steps != null ? r.steps : 28),
                        ucPreset: 1,
                        thumbId, fromImage: true, model: r.model || ''
                    });
                    ok++;
                }
                refreshNaiPresetDropdown();
                this.renderGrid();
                if (statusEl) statusEl.textContent = `✅ 成功加入 ${ok} 個${fail ? `（${fail} 張讀不到資訊：截圖 / JPG / 被平台洗過）` : ''} · 記得按底部 💾 保存`;
            },
            async renderGrid() {
                const grid = container.querySelector('#img-nai-pack-grid');
                if (!grid) return;
                if (!naiPresets.length) {
                    grid.innerHTML = '<div class="nai-pack-empty">還沒有預設。把下載的 NAI 圖拖進上面區塊，就會自動變成帶預覽圖的預設。</div>';
                    return;
                }
                grid.innerHTML = naiPresets.map((p, i) => {
                    const meta = [p.sampler, (p.scale != null ? ('CFG ' + p.scale) : ''), (p.steps != null ? (p.steps + ' steps') : '')].filter(Boolean).join(' · ');
                    return `<div class="nai-pack-card">
                        <div class="nai-pack-thumb">
                            <img class="nai-pack-thumb-img" data-thumb="${naiEscAttr(p.thumbId || '')}" alt="">
                            <span class="nai-pack-nothumb">${p.thumbId ? '讀取中…' : '無預覽'}</span>
                        </div>
                        <div class="nai-pack-name" title="${naiEscAttr(p.name)}">${naiEscAttr(p.name)}</div>
                        <div class="nai-pack-meta">${naiEscAttr(meta)}</div>
                        <div class="nai-pack-actions">
                            <span class="nai-pack-act" onclick="window._naiPreset.applyIdx(${i})">套用</span>
                            <span class="nai-pack-act" onclick="window._naiPreset.renameIdx(${i})" title="改名">✏️</span>
                            <span class="nai-pack-act is-danger" onclick="window._naiPreset.delIdx(${i})" title="刪除">🗑️</span>
                        </div>
                    </div>`;
                }).join('');
                const OSDB = (window.parent || window).OS_DB;
                grid.querySelectorAll('.nai-pack-thumb-img[data-thumb]').forEach(async img => {
                    const tid = img.getAttribute('data-thumb');
                    if (!tid || !OSDB || !OSDB.getNaiThumb) return;
                    try {
                        const b64 = await OSDB.getNaiThumb(tid);
                        if (b64) { img.src = b64; img.classList.add('is-loaded'); const sib = img.nextElementSibling; if (sib) sib.remove(); }
                        else { const sib = img.nextElementSibling; if (sib) sib.textContent = '無預覽'; }
                    } catch (e) {}
                });
            },
            applyIdx(i) {
                const p = naiPresets[i]; if (!p) return;
                const set = (id, v) => { const el = container.querySelector(id); if (el && v != null) el.value = v; };
                set('#img-nai-char-base', p.charBasePrompt || '');
                set('#img-nai-char-neg',  p.charNegPrompt  || '');
                set('#img-nai-item-base', p.itemBasePrompt || '');
                set('#img-nai-item-neg',  p.itemNegPrompt  || '');
                if (p.sampler  != null) set('#img-nai-sampler', p.sampler);
                if (p.scale    != null) set('#img-nai-scale',   p.scale);
                if (p.steps    != null) set('#img-nai-steps',   p.steps);
                if (p.ucPreset != null) set('#img-nai-uc-preset', p.ucPreset);
                this.close();
                const W = window.parent || window;
                if (W.toastr) W.toastr.success(`已套用「${p.name || ''}」，記得按底部 💾 保存`);
            },
            renameIdx(i) {
                const p = naiPresets[i]; if (!p) return;
                const nn = prompt('改名：', p.name || '');
                if (nn == null) return;
                p.name = nn.trim() || p.name;
                refreshNaiPresetDropdown();
                this.renderGrid();
            },
            async delIdx(i) {
                const p = naiPresets[i]; if (!p) return;
                if (!confirm(`刪除預設「${p.name || ''}」？`)) return;
                if (p.thumbId) { try { await (window.parent || window).OS_DB?.deleteNaiThumb(p.thumbId); } catch (e) {} }
                naiPresets.splice(i, 1);
                refreshNaiPresetDropdown();
                this.renderGrid();
            }
        };

        // ── 場景插圖：規範提示詞模板 handlers ──────────────────────
        let sceneSpecTemplates = [...(imgConfig.sceneGen?.specTemplates || [])];

        function refreshSceneSpecDropdown() {
            const sel = container.querySelector('#img-scene-spec-sel');
            if (!sel) return;
            const cur = sel.value;
            sel.innerHTML = '<option value="">-- 選擇模板 --</option>' +
                sceneSpecTemplates.map((t, i) => `<option value="${i}">${t.name}</option>`).join('');
            if (cur !== '' && sceneSpecTemplates[parseInt(cur)]) sel.value = cur;
        }

        // 同步 NAI 預設包下拉（預設包存入後需刷新參考下拉）
        function refreshScenePresetRef() {
            const sel = container.querySelector('#img-scene-preset-ref');
            if (!sel) return;
            const cur = sel.value;
            sel.innerHTML = '<option value="">-- 從 NAI 預設包複製底詞 --</option>' +
                naiPresets.map((p, i) => `<option value="${i}">${p.name}</option>`).join('');
            if (cur !== '' && naiPresets[parseInt(cur)]) sel.value = cur;
        }

        window._sceneSpec = {
            apply() {
                const sel = container.querySelector('#img-scene-spec-sel');
                if (!sel || sel.value === '') { alert('請先選擇模板'); return; }
                const t = sceneSpecTemplates[parseInt(sel.value)];
                if (!t) return;
                const ta = container.querySelector('#img-scene-spec-prompt');
                if (ta) ta.value = t.prompt || '';
            },
            save() {
                const row = container.querySelector('#img-scene-spec-name-row');
                if (row) row.style.display = 'block';
                container.querySelector('#img-scene-spec-name-input')?.focus();
            },
            confirmSave() {
                const nameInput = container.querySelector('#img-scene-spec-name-input');
                const name = nameInput?.value.trim();
                if (!name) { alert('請輸入模板名稱'); return; }
                const ta = container.querySelector('#img-scene-spec-prompt');
                sceneSpecTemplates.push({ name, prompt: ta?.value.trim() || '' });
                refreshSceneSpecDropdown();
                const sel = container.querySelector('#img-scene-spec-sel');
                if (sel) sel.value = String(sceneSpecTemplates.length - 1);
                const row = container.querySelector('#img-scene-spec-name-row');
                if (row) row.style.display = 'none';
                if (nameInput) nameInput.value = '';
            },
            cancelSave() {
                const row = container.querySelector('#img-scene-spec-name-row');
                if (row) row.style.display = 'none';
                const nameInput = container.querySelector('#img-scene-spec-name-input');
                if (nameInput) nameInput.value = '';
            },
            del() {
                const sel = container.querySelector('#img-scene-spec-sel');
                if (!sel || sel.value === '') { alert('請先選擇要刪除的模板'); return; }
                const idx = parseInt(sel.value);
                const name = sceneSpecTemplates[idx]?.name || '';
                if (!confirm(`刪除模板「${name}」？`)) return;
                sceneSpecTemplates.splice(idx, 1);
                refreshSceneSpecDropdown();
            },
            // 從 NAI 預設包複製底詞到場景底詞框
            applyPreset() {
                const sel = container.querySelector('#img-scene-preset-ref');
                if (!sel || sel.value === '') { alert('請先選擇 NAI 預設包'); return; }
                const p = naiPresets[parseInt(sel.value)];
                if (!p) return;
                const base = container.querySelector('#img-scene-base-prompt');
                const neg  = container.querySelector('#img-scene-neg-prompt');
                if (base) base.value = p.charBasePrompt || '';
                if (neg)  neg.value  = p.charNegPrompt  || '';
            }
        };

        const mmProfileList = container.querySelector('#mm-profile-list');
        const mmAddProfileBtn = container.querySelector('#mm-add-profile-btn');

        function makeAliasChip(alias) {
            const chip = document.createElement('span');
            chip.className = 'mm-alias-chip';
            chip.dataset.alias = alias;
            chip.style.cssText = 'display:inline-flex; align-items:center; gap:4px; background:rgba(228,232,245,0.96); border:1px solid rgba(26,28,40,0.20); border-radius:20px; padding:3px 10px; font-size:12px; color:#1A1C28; margin:2px;';
            chip.innerHTML = `${alias} <span style="cursor:pointer; color:rgba(26,28,40,0.72); font-size:14px; line-height:1;" title="移除">×</span>`;
            chip.querySelector('span').onclick = () => chip.remove();
            return chip;
        }

        function makeProfileCard(profile = {}, expanded = false) {
            const card = document.createElement('div');
            card.className = 'mm-profile-card';
            card.style.cssText = 'background:rgba(228,232,245,0.60); border:1px solid rgba(26,28,40,0.15); border-radius:8px; overflow:hidden;';

            const header = document.createElement('div');
            header.style.cssText = 'display:flex; align-items:center; gap:8px; padding:10px 14px; cursor:pointer; user-select:none;';
            header.innerHTML = `
                <span class="mm-p-arrow" style="color:rgba(26,28,40,0.72); font-size:12px; transition:transform 0.2s; flex-shrink:0;">${expanded ? '▼' : '▶'}</span>
                <span class="mm-p-name-display" style="flex:1; font-weight:600; color:#1A1C28; font-size:14px;">${profile.label || '（未命名）'}</span>
                <span style="flex-shrink:0; cursor:pointer; color:#fc8181; font-size:18px; padding:2px 4px;" title="刪除此音色">🗑</span>
            `;
            header.querySelector('span[title]').onclick = (e) => { e.stopPropagation(); card.remove(); };
            card.appendChild(header);

            const body = document.createElement('div');
            body.style.cssText = `padding:0 14px 14px; display:flex; flex-direction:column; gap:10px; ${expanded ? '' : 'display:none;'}`;
            body.style.display = expanded ? 'flex' : 'none';

            const nameRow = document.createElement('div');
            nameRow.innerHTML = `<div class="set-label" style="font-size:12px; margin-bottom:4px;">角色名稱</div>
                <input class="set-input mm-p-label" type="text" placeholder="如：愛麗絲" value="${profile.label || ''}" style="font-weight:600; color:#1A1C28;">`;
            const labelInput = nameRow.querySelector('.mm-p-label');
            const nameDisplay = header.querySelector('.mm-p-name-display');
            labelInput.addEventListener('input', () => {
                nameDisplay.textContent = labelInput.value.trim() || '（未命名）';
            });
            body.appendChild(nameRow);

            const idRow = document.createElement('div');
            idRow.innerHTML = `<div class="set-label" style="font-size:12px; margin-bottom:4px;">Minimax 音色ID</div>
                <input class="set-input mm-p-id" type="text" placeholder="例如：female-shaonv" value="${profile.id || ''}">`;
            body.appendChild(idRow);

            const aliasSection = document.createElement('div');
            aliasSection.innerHTML = `<div class="set-label" style="font-size:12px; margin-bottom:6px;">別名 <span style="color:rgba(26,28,40,0.72); font-weight:normal;">（大小寫不敏感）</span></div>`;
            const chipContainer = document.createElement('div');
            chipContainer.style.cssText = 'display:flex; flex-wrap:wrap; gap:2px; min-height:28px; background:rgba(228,232,245,0.90); border:1px solid rgba(26,28,40,0.10); border-radius:4px; padding:6px; margin-bottom:6px;';
            (profile.aliases || []).forEach(a => chipContainer.appendChild(makeAliasChip(a)));

            const aliasAddRow = document.createElement('div');
            aliasAddRow.style.cssText = 'display:flex; gap:6px;';
            aliasAddRow.innerHTML = `
                <input class="set-input mm-p-alias-input" type="text" placeholder="輸入別名後按 Enter 或 ＋" style="flex:1; font-size:13px;">
                <div class="btn-fetch mm-p-alias-add" title="新增別名" style="font-size:18px; flex-shrink:0;">＋</div>
            `;
            const aliasInput = aliasAddRow.querySelector('.mm-p-alias-input');
            const aliasAdd   = aliasAddRow.querySelector('.mm-p-alias-add');
            function addAlias() {
                const v = aliasInput.value.trim();
                if (!v) return;
                chipContainer.appendChild(makeAliasChip(v));
                aliasInput.value = '';
            }
            aliasAdd.onclick = addAlias;
            aliasInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addAlias(); } });

            aliasSection.appendChild(chipContainer);
            aliasSection.appendChild(aliasAddRow);
            body.appendChild(aliasSection);
            card.appendChild(body);

            header.onclick = (e) => {
                if (e.target.title === '刪除此音色') return;
                const isOpen = body.style.display !== 'none';
                body.style.display = isOpen ? 'none' : 'flex';
                header.querySelector('.mm-p-arrow').textContent = isOpen ? '▶' : '▼';
            };

            return card;
        }

        if (mmProfileList) {
            (minimaxConfig.voiceProfiles || []).forEach(p => {
                mmProfileList.appendChild(makeProfileCard(p, false));
            });
        }

        if (mmAddProfileBtn && mmProfileList) {
            mmAddProfileBtn.onclick = () => {
                const card = makeProfileCard({}, true);
                mmProfileList.appendChild(card);
                card.querySelector('.mm-p-label')?.focus();
            };
        }

        const mmBrowseBtn  = container.querySelector('#mm-browse-voices-btn');
        const mmVoiceModal = container.querySelector('#mm-voice-modal');
        const mmVoiceList  = container.querySelector('#mm-voice-list');
        const mmVoiceSearch= container.querySelector('#mm-voice-search');
        const mmVoiceCount = container.querySelector('#mm-voice-count');
        let _fetchedVoices = [];

        function renderVoiceList(voices) {
            if (!mmVoiceList) return;
            mmVoiceList.innerHTML = '';
            voices.forEach(v => {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex; align-items:flex-start; gap:8px; background:rgba(228,232,245,0.90); border:1px solid rgba(26,28,40,0.10); border-radius:4px; padding:10px 12px; cursor:default;';
                const desc = Array.isArray(v.description) ? v.description[0] : (v.description || '');
                row.innerHTML = `
                    <div style="flex:1; min-width:0;">
                        <div style="font-size:13px; color:#1A1C28;">${desc || v.voice_id}</div>
                        <div style="font-size:10px; color:rgba(26,28,40,0.72); font-family:monospace; margin-top:3px; word-break:break-all;">${v.voice_id}</div>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:4px; flex-shrink:0;">
                        <button class="mm-v-use"   style="font-size:11px; background:rgba(228,232,245,0.80); border:1px solid rgba(26,28,40,0.15); color:#1A1C28; border-radius:4px; padding:4px 8px; cursor:pointer; white-space:nowrap;">填入測試</button>
                        <button class="mm-v-add"   style="font-size:11px; background:rgba(26,28,40,0.08); border:1px solid rgba(26,28,40,0.25); color:#1A1C28; border-radius:4px; padding:4px 8px; cursor:pointer; white-space:nowrap;">新增檔案</button>
                    </div>`;
                row.querySelector('.mm-v-use').onclick = () => {
                    const el = container.querySelector('#mm-test-voice-id');
                    if (el) { el.value = v.voice_id; el.dispatchEvent(new Event('input')); }
                    mmVoiceModal.style.display = 'none';
                };
                row.querySelector('.mm-v-add').onclick = () => {
                    const card = makeProfileCard({ id: v.voice_id, label: '' }, true);
                    mmProfileList.appendChild(card);
                    card.querySelector('.mm-p-label')?.focus();
                    mmVoiceModal.style.display = 'none';
                };
                mmVoiceList.appendChild(row);
            });
        }

        if (mmBrowseBtn && mmVoiceModal) {
            mmBrowseBtn.onclick = async () => {
                const groupId = (container.querySelector('#mm-group-id')?.value || '').trim();
                const apiKey  = (container.querySelector('#mm-api-key')?.value  || '').trim();
                const provider = container.querySelector('#mm-provider')?.value || 'cn';
                if (!groupId || !apiKey) {
                    alert('請先填寫 Group ID 與 API Key');
                    return;
                }
                mmVoiceModal.style.display = 'flex';
                mmVoiceList.innerHTML = '<div style="text-align:center; color:rgba(26,28,40,0.72); padding:20px;">⏳ 載入中...</div>';
                mmVoiceSearch.value = '';
                if (mmVoiceCount) mmVoiceCount.textContent = '';

                const baseUrl = provider === 'io' ? 'https://api.minimax.io' : 'https://api.minimaxi.com';
                try {
                    const res = await fetch(`${baseUrl}/v1/get_voice`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ voice_type: 'system' })
                    });
                    const data = await res.json();
                    if (!res.ok || data.base_resp?.status_code !== 0) {
                        throw new Error(data.base_resp?.status_msg || res.statusText);
                    }
                    _fetchedVoices = data.system_voice || [];
                    if (mmVoiceCount) mmVoiceCount.textContent = `（共 ${_fetchedVoices.length} 個）`;
                    renderVoiceList(_fetchedVoices);
                } catch(err) {
                    mmVoiceList.innerHTML = `<div style="color:#fc8181; padding:10px;">❌ 載入失敗：${err.message}</div>`;
                }
            };

            mmVoiceSearch?.addEventListener('input', () => {
                const q = mmVoiceSearch.value.toLowerCase();
                const filtered = _fetchedVoices.filter(v => {
                    const desc = Array.isArray(v.description) ? v.description.join(' ') : (v.description || '');
                    return v.voice_id.toLowerCase().includes(q) || desc.toLowerCase().includes(q);
                });
                renderVoiceList(filtered);
            });

            container.querySelector('#mm-voice-modal-close')?.addEventListener('click', () => {
                mmVoiceModal.style.display = 'none';
            });
            mmVoiceModal.addEventListener('click', (e) => {
                if (e.target === mmVoiceModal) mmVoiceModal.style.display = 'none';
            });
        }

        const mmTestBtn  = container.querySelector('#mm-test-btn');
        const mmStopBtn  = container.querySelector('#mm-stop-btn');
        const mmResult   = container.querySelector('#mm-test-result');
        if (mmTestBtn) {
            mmTestBtn.onclick = async () => {
                const voiceId = (container.querySelector('#mm-test-voice-id')?.value || '').trim();
                const text    = (container.querySelector('#mm-test-text')?.value || '').trim();
                const groupId = (container.querySelector('#mm-group-id')?.value || '').trim();
                const apiKey  = (container.querySelector('#mm-api-key')?.value || '').trim();
                const provider = container.querySelector('#mm-provider')?.value || 'cn';
                const model   = container.querySelector('#mm-speech-model')?.value || 'speech-01-turbo';

                if (!groupId || !apiKey) {
                    mmResult.style.display = 'block';
                    mmResult.style.color = '#fc8181';
                    mmResult.textContent = '❌ 請先填寫 Group ID 與 API Key';
                    return;
                }
                if (!voiceId) {
                    mmResult.style.display = 'block';
                    mmResult.style.color = '#fc8181';
                    mmResult.textContent = '❌ 請輸入語音 ID（如 male-01）';
                    return;
                }

                mmTestBtn.style.opacity = '0.5';
                mmTestBtn.textContent = '⏳ 合成中...';
                mmResult.style.display = 'block';
                mmResult.style.color = 'rgba(26,28,40,0.40)';
                mmResult.textContent = '⏳ 正在呼叫 Minimax TTS API...';

                const win = window.parent || window;
                if (win.OS_MINIMAX) {
                    const existingCfg = win.OS_MINIMAX.getConfig ? win.OS_MINIMAX.getConfig() : {};
                    win.OS_MINIMAX.saveConfig({ ...existingCfg, groupId, apiKey, provider, speechModel: model });
                    const ok = await win.OS_MINIMAX.play(text, voiceId);
                    if (ok) {
                        mmResult.style.color = 'rgba(26,28,40,0.25)';
                        mmResult.textContent = '✅ 語音播放中...';
                        if (mmStopBtn) mmStopBtn.style.display = 'block';
                    } else {
                        mmResult.style.color = '#fc8181';
                        mmResult.textContent = '❌ 播放失敗，請檢查 Group ID / API Key / 語音 ID 是否正確';
                    }
                } else {
                    mmResult.style.color = '#fc8181';
                    mmResult.textContent = '❌ OS_MINIMAX 模組尚未載入，請確認 os_minimax.js 已加入載入列表';
                }
                mmTestBtn.style.opacity = '1';
                mmTestBtn.textContent = '🎵 播放測試語音';
            };
        }
        if (mmStopBtn) {
            mmStopBtn.onclick = () => {
                const win = window.parent || window;
                if (win.OS_MINIMAX) win.OS_MINIMAX.stop();
                mmStopBtn.style.display = 'none';
                if (mmResult) { mmResult.style.color = 'rgba(26,28,40,0.40)'; mmResult.textContent = '已停止播放'; }
            };
        }

        btnImgTest.onclick = async () => {
            const testPrompt = elImgTestPrompt.value.trim();
            if (!testPrompt) return;
            btnImgTest.innerText = "⏳ 生成中...";
            btnImgTest.style.opacity = "0.5";
            status.innerText = "⏳ 正在生成圖片...";

            try {
                const win = window.parent || window;
                const imageManager = win.OS_IMAGE_MANAGER;
                if (!imageManager) throw new Error('ImageManager 未載入');

                // 同步兩桶（測試用 char 型→走活物桶；legacy mirror = 活物桶）
                imageManager.config.serviceInanimate = elImgServiceInanimate ? elImgServiceInanimate.value : imageManager.config.serviceInanimate;
                imageManager.config.serviceLiving = elImgServiceLiving ? elImgServiceLiving.value : imageManager.config.serviceLiving;
                imageManager.config.service = imageManager.config.serviceLiving;

                imageManager.config.pollinations.apiKey = elPolApiKey.value.trim();
                imageManager.config.pollinations.model = elPolModel.value;
                imageManager.config.pollinations.charBasePrompt = elStylePrompt.value.trim();
                imageManager.config.pollinations.charNegPrompt = elCharNegPrompt.value.trim();

                const getNum = (selector, def) => parseFloat(container.querySelector(selector)?.value ?? def);
                const getInt = (selector, def) => parseInt(container.querySelector(selector)?.value ?? def);
                
                imageManager.config.novelai.token = elNaiToken.value.trim();
                if (elNaiModel) imageManager.config.novelai.model = elNaiModel.value;
                imageManager.config.novelai.capFreeSize = container.querySelector('#img-nai-cap-free')?.checked ?? true;
                imageManager.config.novelai.sampler = container.querySelector('#img-nai-sampler')?.value || 'k_euler_ancestral';
                imageManager.config.novelai.scale = getNum('#img-nai-scale', 5);
                imageManager.config.novelai.steps = getInt('#img-nai-steps', 28);
                imageManager.config.novelai.ucPreset = getInt('#img-nai-uc-preset', 1);
                imageManager.config.novelai.qualityToggle = container.querySelector('#img-nai-quality-toggle')?.checked ?? true;
                imageManager.config.novelai.smea = container.querySelector('#img-nai-smea')?.checked ?? true;
                imageManager.config.novelai.smeaDyn = container.querySelector('#img-nai-smea-dyn')?.checked ?? false;
                imageManager.config.novelai.charBasePrompt = (container.querySelector('#img-nai-char-base')?.value || '').trim();
                imageManager.config.novelai.charNegPrompt = (container.querySelector('#img-nai-char-neg')?.value || '').trim();

                // ComfyUI 直連：測試也套當前面板值（免先保存）
                imageManager.config.comfyuiDirect = {
                    ...imageManager.config.comfyuiDirect,
                    workflowMode:  (container.querySelector('#img-cfd-wfmode')?.value || 'auto'),
                    customWorkflow:(container.querySelector('#img-cfd-custom-wf-text')?.value || ''),
                    url:       (container.querySelector('#img-cfd-url')?.value || '').trim(),
                    modelType: (container.querySelector('#img-cfd-type')?.value || 'checkpoint'),
                    model:     (container.querySelector('#img-cfd-model')?.value || '').trim(),
                    vae:       (container.querySelector('#img-cfd-vae')?.value || '').trim(),
                    sampler:   (container.querySelector('#img-cfd-sampler')?.value || 'euler').trim(),
                    scheduler: (container.querySelector('#img-cfd-scheduler')?.value || 'normal').trim(),
                    steps:     parseInt(container.querySelector('#img-cfd-steps')?.value ?? 28) || 28,
                    cfg:       parseFloat(container.querySelector('#img-cfd-cfg')?.value ?? 6.5) || 6.5,
                    width:     parseInt(container.querySelector('#img-cfd-width')?.value ?? 1024) || 1024,
                    height:    parseInt(container.querySelector('#img-cfd-height')?.value ?? 1024) || 1024,
                    seed:      (function(){ const v = parseInt(container.querySelector('#img-cfd-seed')?.value ?? -1); return isNaN(v) ? -1 : v; })(),
                    clipSkip:  parseInt(container.querySelector('#img-cfd-clipskip')?.value ?? 0) || 0,
                    basePrompt:(container.querySelector('#img-cfd-base')?.value || '').trim(),
                    negPrompt: (container.querySelector('#img-cfd-neg')?.value || '').trim(),
                    fluxClipL: (container.querySelector('#img-cfd-clipl')?.value || 'clip_l.safetensors').trim(),
                    fluxT5:    (container.querySelector('#img-cfd-t5xxl')?.value || 't5xxl_fp8_e4m3fn.safetensors').trim(),
                    fluxAe:    (container.querySelector('#img-cfd-ae')?.value || 'ae.safetensors').trim(),
                    guidance:  parseFloat(container.querySelector('#img-cfd-guidance')?.value ?? 3.5) || 3.5,
                    animaClip: (container.querySelector('#img-cfd-anima-clip')?.value || 'qwen_3_06b_base.safetensors').trim(),
                    animaVae:  (container.querySelector('#img-cfd-anima-vae')?.value || 'qwen_image_vae.safetensors').trim(),
                    loras: Array.from(container.querySelectorAll('#img-cfd-loras .cfd-lora-row')).map(function(r){ return {
                        on:   r.querySelector('.cfd-lora-on')?.checked ?? true,
                        name: (r.querySelector('.cfd-lora-name')?.value || '').trim(),
                        strengthModel: parseFloat(r.querySelector('.cfd-lora-sm')?.value ?? 1),
                        strengthClip:  parseFloat(r.querySelector('.cfd-lora-sc')?.value ?? 1)
                    }; }).filter(function(l){ return l.name; })
                };

                const [width, height] = (elPolSize?.value || '1024x1024').split('x').map(Number);
                
                // force:true → 測試按鈕每次都實生，不吃 _urlCache 舊圖（測試搞快取根本沒意義）
                // ComfyUI 直連用面板自己的尺寸(cfg.width/height)，其他來源用上面的測試尺寸
                const _testIsCfd = (elImgServiceLiving ? elImgServiceLiving.value : '') === 'comfyui_direct';
                const imageUrl = await imageManager.generate(testPrompt, 'char', _testIsCfd ? { force: true } : { width, height, force: true });

                imgTestImage.src = imageUrl;
                imgTestUrl.textContent = /^(data:|blob:)/.test(imageUrl) ? '✅ 圖片已生成（內嵌資料，省略顯示）' : `URL: ${imageUrl}`;
                imgTestPreview.style.display = 'block';

                imgTestImage.onload = () => { status.innerText = "✅ 圖片加載成功"; };
                imgTestImage.onerror = () => { status.innerText = "❌ 圖片加載失敗 (請檢查 API Key / Token)"; };

            } catch(e) {
                console.error(e);
                status.innerText = `❌ 錯誤: ${e.message}`;
            } finally {
                btnImgTest.innerText = "🎨 生成預覽";
                btnImgTest.style.opacity = "1";
            }
        };

        // 向量 Embedding 測試按鈕
        if (vecTestBtn) {
            vecTestBtn.onclick = async () => {
                vecTestBtn.style.opacity = '0.5';
                vecTestBtn.textContent = '⏳ 測試中...';
                if (vecTestResult) { vecTestResult.style.color = 'rgba(26,28,40,0.40)'; vecTestResult.textContent = '⏳ 呼叫 Embedding API...'; }
                try {
                    const winRef = window.parent || window;
                    if (!winRef.OS_VECTOR_ENGINE) throw new Error('OS_VECTOR_ENGINE 尚未載入');
                    const vec = await winRef.OS_VECTOR_ENGINE.embed('測試文字');
                    if (vecTestResult) { vecTestResult.style.color = '#7CFC00'; vecTestResult.textContent = `✅ 連線成功！向量維度：${vec.length}`; }
                } catch(e) {
                    if (vecTestResult) { vecTestResult.style.color = '#FF6B6B'; vecTestResult.textContent = `❌ ${e.message}`; }
                } finally {
                    vecTestBtn.style.opacity = '1';
                    vecTestBtn.textContent = '🔌 測試 Embedding API';
                }
            };
        }

    }

    function bindBackupTab(container) {
        const win = window.parent || window;
        const BACKUP = win.OS_BACKUP;

        const elToken     = container.querySelector('#bk-token');
        const elGistId    = container.querySelector('#bk-gist-id');
        const elGistHint  = container.querySelector('#bk-gist-hint');
        const elStatus    = container.querySelector('#bk-status');

        function setStatus(msg, color) {
            if (elStatus) { elStatus.textContent = msg; elStatus.style.color = color || 'rgba(26,28,40,0.40)'; }
        }
        function setBtnLoading(btn, text) { if (btn) { btn.textContent = text; btn.style.opacity = '0.5'; btn.style.pointerEvents = 'none'; } }
        function setBtnDone(btn, text) { if (btn) { btn.textContent = text; btn.style.opacity = '1'; btn.style.pointerEvents = ''; } }

        if (BACKUP) {
            const s = BACKUP.getSettings();
            if (elToken && s.token) elToken.value = s.token;
            if (elGistId && s.gistId) elGistId.value = s.gistId;
            if (elGistHint && s.gistId) elGistHint.textContent = '目前 Gist ID: ' + s.gistId;
        }

        const btnGistSave = container.querySelector('#bk-gist-save-btn');
        if (btnGistSave) btnGistSave.addEventListener('click', async () => {
            if (!BACKUP) { setStatus('❌ OS_BACKUP 模組未載入', '#fc8181'); return; }
            const token = elToken?.value.trim();
            const gistId = elGistId?.value.trim() || null;
            if (!token) { setStatus('請先填入 GitHub Token', '#fc8181'); return; }
            BACKUP.saveSettings({ token, gistId });
            setBtnLoading(btnGistSave, '備份中...');
            setStatus('⏳ 正在備份到 GitHub Gist...', 'rgba(26,28,40,0.25)');
            try {
                const result = await BACKUP.gistBackup();
                if (elGistId) elGistId.value = result.gistId;
                if (elGistHint) elGistHint.textContent = '✅ 備份成功！Gist ID: ' + result.gistId + '（' + result.sizeKB + ' KB）';
                BACKUP.saveSettings({ token, gistId: result.gistId });
                setStatus('✅ 備份完成（' + result.sizeKB + ' KB）', 'rgba(26,28,40,0.25)');
            } catch(e) { setStatus('❌ 備份失敗：' + e.message, '#fc8181'); }
            setBtnDone(btnGistSave, '☁️ 備份到 Gist');
        });

        const btnGistRestore = container.querySelector('#bk-gist-restore-btn');
        if (btnGistRestore) btnGistRestore.addEventListener('click', async () => {
            if (!BACKUP) { setStatus('❌ OS_BACKUP 模組未載入', '#fc8181'); return; }
            const token = elToken?.value.trim();
            const gistId = elGistId?.value.trim() || null;
            if (!token || !gistId) { setStatus('請先填入 Token 與 Gist ID', '#fc8181'); return; }
            if (!confirm('從 Gist 還原將合併資料（不清空現有），確定繼續？')) return;
            BACKUP.saveSettings({ token, gistId });
            setBtnLoading(btnGistRestore, '還原中...');
            setStatus('⏳ 正在從 GitHub Gist 還原...', 'rgba(26,28,40,0.25)');
            try {
                const data = await BACKUP.gistRestore();
                const result = await BACKUP.applyData(data);
                setStatus(`✅ 還原完成：世界書 ${result.worldbook} 條、寵物 ${result.pets} 隻、設定 ${result.localStorage} 項`, 'rgba(26,28,40,0.25)');
            } catch(e) { setStatus('❌ 還原失敗：' + e.message, '#fc8181'); }
            setBtnDone(btnGistRestore, '⬇️ 從 Gist 還原');
        });

        const btnScan = container.querySelector('#bk-scan-btn');
        const elStorageInfo = container.querySelector('#bk-storage-info');
        if (btnScan) btnScan.addEventListener('click', async () => {
            if (!BACKUP) { if (elStorageInfo) elStorageInfo.textContent = 'OS_BACKUP 未載入'; return; }
            btnScan.textContent = '掃描中...';
            try {
                const info = await BACKUP.estimateSize();
                const lines = Object.entries(info).map(([k, v]) =>
                    `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(26,28,40,0.10);">
                        <span style="color:#3A3F5C">${k}</span>
                        <span style="color:#1A1C28; font-weight:bold;">${v.count} 筆 / ${v.kb} KB</span>
                    </div>`
                ).join('');
                if (elStorageInfo) elStorageInfo.innerHTML = lines || '（無資料）';
            } catch(e) { if (elStorageInfo) elStorageInfo.textContent = '掃描失敗: ' + e.message; }
            btnScan.textContent = '掃描';
        });

        const btnExport = container.querySelector('#bk-export-btn');
        if (btnExport) btnExport.addEventListener('click', async () => {
            if (!BACKUP) { setStatus('❌ OS_BACKUP 模組未載入', '#fc8181'); return; }
            setBtnLoading(btnExport, '準備中...');
            setStatus('⏳ 正在打包資料...', 'rgba(26,28,40,0.25)');
            try {
                const sizeKB = await BACKUP.exportLocal();
                setStatus('✅ 匯出完成（' + sizeKB + ' KB），請儲存至安全位置', 'rgba(26,28,40,0.25)');
            } catch(e) { setStatus('❌ 匯出失敗：' + e.message, '#fc8181'); }
            setBtnDone(btnExport, '📤 匯出完整備份 JSON');
        });

        const btnImport = container.querySelector('#bk-import-btn');
        const fileInput = container.querySelector('#bk-file-input');
        if (btnImport) btnImport.addEventListener('click', () => fileInput?.click());
        if (fileInput) fileInput.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file || !BACKUP) return;
            if (!confirm('從本地 JSON 還原將合併資料，確定繼續？')) return;
            setStatus('⏳ 正在匯入...', 'rgba(26,28,40,0.25)');
            try {
                const result = await BACKUP.importLocal(file);
                setStatus(`✅ 匯入完成：世界書 ${result.worldbook} 條、寵物 ${result.pets} 隻、設定 ${result.localStorage} 項`, 'rgba(26,28,40,0.25)');
            } catch(e) { setStatus('❌ 匯入失敗：' + e.message, '#fc8181'); }
            e.target.value = '';
        });

        // 🔥 新增：一鍵格式化邏輯
        const btnFormat = container.querySelector('#bk-format-btn');
        if (btnFormat) {
            btnFormat.addEventListener('click', async () => {
                const firstConfirm = confirm('⚠️ 警告：即將清空所有系統數據！這將徹底刪除你的所有劇情、對話、變數和設定！\n\n確定要繼續嗎？');
                if (!firstConfirm) return;
                
                const secondConfirm = confirm('🛑 最終防線：資料刪除後無法恢復（宛如物理超渡）。\n請確保你已經匯出了備份檔。\n\n真的要徹底格式化嗎？');
                if (!secondConfirm) return;

                setBtnLoading(btnFormat, '格式化中...');
                setStatus('💥 正在執行全系統格式化，請勿關閉網頁...', '#fc8181');
                
                try {
                    // 清除 LocalStorage
                    localStorage.clear();
                    
                    // 呼叫 OS_DB 的核彈接口
                    const win = window.parent || window;
                    if (win.OS_DB && typeof win.OS_DB.factoryReset === 'function') {
                        await win.OS_DB.factoryReset();
                    } else {
                        console.warn('[PhoneOS] 找不到 OS_DB.factoryReset，僅執行 localStorage 清理');
                    }
                    
                    setStatus('✅ 格式化完成！系統即將重生...', '#b8ffcb');
                    setTimeout(() => {
                        window.location.reload();
                    }, 1500);
                } catch (e) {
                    setStatus('❌ 格式化失敗：' + e.message, '#fc8181');
                    setBtnDone(btnFormat, '💥 格式化並清空所有數據');
                }
            });
        }
    }

    window.OS_SETTINGS.launchApp = launchApp;
    // 相簿 app（大廳手機殼）：用同一引擎跑「只顯示畫廊」模式
    window.OS_SETTINGS.launchAlbum = function (container) { return launchApp(container, 'album'); };

    function install() {
        const win = window.parent || window;
        if (win.PhoneSystem) { win.PhoneSystem.install('設置', '⚙️', '#4c4c4c', launchApp); }
        else { setTimeout(install, 500); }
    }
    install();
})();