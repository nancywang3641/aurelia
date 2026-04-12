// ----------------------------------------------------------------
// [檔案] os_image_manager.js (V3.0)
// 路徑：scripts/os_phone/os/os_image_manager.js
// 職責：統一管理圖片生成，並整合 TranslationManager 自動翻譯
// V3.0：
//   ① 實作 NovelAI 圖片生成（ZIP 解壓 → Blob URL）
//   ② 路由策略：背景永遠走 Pollinations，角色/物品/寵物有 NAI token 則走 NAI
//   ③ 新增 V4 / V4 Full 模型選項
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入圖片生成管理器 (V3.0)...');
    const win = window.parent || window;

    // NAI 帳號同時只能一個生成請求，所有 _genNovelAI 呼叫透過此 Promise 鏈串行
    let _naiQueue = Promise.resolve();

    const ImageManager = {
        config: {
            service: 'pollinations', // 預設
            pollinations: {
                url: 'https://gen.pollinations.ai/image', // API 端點
                apiKey: '', // Pollen API Key
                model: 'zimage', // 預設模型
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
                petBasePrompt: 'cute, 2D art, sticker style, simple background, white background, high quality',
                petNegPrompt: 'bad anatomy, blurry, low quality, worst quality, human, person, watermark, text',
                itemBasePrompt: 'item only, product shot, no background, white background, clean illustration, high quality',
                itemNegPrompt: 'person, human, character, body, face, hands, people, crowd, anatomy, bad anatomy, blurry, low quality, worst quality, watermark, text'
            },
            novelai: {
                token: '',
                url: 'https://image.novelai.net/ai/generate-image',
                model: 'nai-diffusion-3',
                // NAI 用 Danbooru tag 格式，與 Pollinations 自然語言格式完全不同
                charBasePrompt: 'masterpiece, best quality, very aesthetic, absurdres, anime style, detailed face',
                charNegPrompt: 'nsfw, lowres, bad anatomy, bad hands, extra fingers, missing fingers, worst quality, low quality, jpeg artifacts, signature, watermark, blurry',
                itemBasePrompt: 'masterpiece, best quality, white background, simple background, no background, product image, detailed',
                itemNegPrompt: 'person, human, character, body, face, hands, worst quality, low quality, blurry, watermark, text',
            }
        },

        init: function() {
            const saved = localStorage.getItem('os_image_config');
            if (saved) {
                try { 
                    const savedConfig = JSON.parse(saved);
                    this.config = {
                        ...this.config,
                        service: savedConfig.service || this.config.service,
                        pollinations: {
                            ...this.config.pollinations,
                            ...savedConfig.pollinations,
                            models: this.config.pollinations.models
                        },
                        novelai: {
                            ...this.config.novelai,
                            ...savedConfig.novelai
                        }
                    };
                    
                    if (!this.config.pollinations.models[this.config.pollinations.model]) {
                        console.warn(`[ImageManager] 舊模型 ${this.config.pollinations.model} 已失效，重置為 zimage`);
                        this.config.pollinations.model = 'zimage';
                    }

                    console.log('[ImageManager] ✅ 配置已載入，當前模型:', this.config.pollinations.model);
                } catch(e){
                    console.error('[ImageManager] ❌ 載入配置失敗:', e);
                }
            }
        },

        // --- 核心生成函數 (整合翻譯) ---
        generate: async function(prompt, type = 'scene', options = {}) {
            console.log(`[ImageManager] Raw Input [${type}]: ${prompt}`);
            
            // 🔥 步驟 1: 自動翻譯
            let englishPrompt = prompt;
            if (win.TranslationManager) {
                try {
                    if (win.TranslationManager.isChinese(prompt)) {
                        console.log('[ImageManager] 偵測到中文，正在翻譯...');
                        englishPrompt = await win.TranslationManager.translate(prompt, 'zh', 'en');
                        console.log(`[ImageManager] 翻譯結果: ${englishPrompt}`);
                    }
                } catch(e) {
                    console.warn('[ImageManager] 翻譯失敗，使用原文:', e);
                }
            }

            // 🔥 步驟 2: 路由判斷（char/item/pet/scene 有 NAI token 走 NAI；背景底板走 generateBackgroundAsync）
            const isNaiType = (type === 'char' || type === 'item' || type === 'pet' || type === 'scene');
            if (isNaiType && this.config.service === 'novelai' && this.config.novelai.token) {
                // NAI 使用 Danbooru tag 格式，底詞/負詞在 _genNovelAI 內部處理
                console.log(`[ImageManager] Final Prompt [${type}→NAI]: ${englishPrompt}`);
                return await this._genNovelAI(englishPrompt, type, options);
            }

            // 🔥 步驟 3: Pollinations 底詞（只在走 Pollinations 時套用）
            if (type === 'pet') {
                const petBase = this.config.pollinations.petBasePrompt;
                if (petBase) englishPrompt = petBase + ', ' + englishPrompt;
            } else if (type === 'char') {
                const charBase = this.config.pollinations.charBasePrompt;
                if (charBase) englishPrompt = charBase + ', ' + englishPrompt;
            }
            console.log(`[ImageManager] Final Prompt [${type}→Pol]: ${englishPrompt}`);

            // 🔥 步驟 4: Pollinations 負詞
            if (!options.negativePrompt) {
                if (type === 'pet') options = { ...options, negativePrompt: this.config.pollinations.petNegPrompt || undefined };
                else if (type === 'char') options = { ...options, negativePrompt: this.config.pollinations.charNegPrompt || undefined };
            }

            return this._genPollinations(englishPrompt, type, options);
        },

        // --- Pollinations 生成邏輯 ---
        _genPollinations: function(basePrompt, type, options = {}) {
            let optimizedPrompt = basePrompt;

            // 🔥 僅保留寵物去背的特殊邏輯，其他類型(包含 char)全部原汁原味輸出
            if (type === 'pet') {
                optimizedPrompt = `full body shot of ${basePrompt}, simple white background, no shadow`;
            } 

            const seed = options.seed || Math.floor(Math.random() * 100000);
            const width = options.width || 512;
            const height = options.height || 512;
            const model = options.model || this.config.pollinations.model;
            const encoded = encodeURIComponent(optimizedPrompt);

            // 🔥 構建 URL
            let url = `${this.config.pollinations.url}/${encoded}?width=${width}&height=${height}&model=${model}&seed=${seed}&nologo=true`;

            if (options.negativePrompt) {
                url += `&negative_prompt=${encodeURIComponent(options.negativePrompt)}`;
            }

            // 檢查 API Key
            if (this.config.pollinations.apiKey && this.config.pollinations.apiKey.trim() !== '') {
                const apiKey = this.config.pollinations.apiKey.trim();
                url += `&private=true&key=${apiKey}`;
            }

            console.log('[ImageManager] 生成 URL:', url);
            return url;
        },

        // --- ZIP 解析：從中央目錄讀正確大小，避免 data descriptor 格式導致 size=0 ---
        _extractZipFirstFile: async function(arrayBuffer) {
            const buf  = new Uint8Array(arrayBuffer);
            const view = new DataView(arrayBuffer);

            if (view.getUint32(0, true) !== 0x04034b50) throw new Error('非 ZIP 格式');

            // 從末端找 End of Central Directory (EOCD) 簽名 PK\x05\x06
            let eocd = -1;
            for (let i = buf.length - 22; i >= 0; i--) {
                if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
            }
            if (eocd === -1) throw new Error('找不到 EOCD');

            // 讀中央目錄偏移
            const cdOffset = view.getUint32(eocd + 16, true);
            if (view.getUint32(cdOffset, true) !== 0x02014b50) throw new Error('找不到中央目錄');

            // 從中央目錄取正確的壓縮大小（data descriptor 時本地檔頭的值為 0）
            const compression      = view.getUint16(cdOffset + 10, true);
            const compressedSz     = view.getUint32(cdOffset + 20, true);
            const localHeaderOff   = view.getUint32(cdOffset + 42, true);

            // 從本地檔頭算資料起始位置
            const localFnLen   = view.getUint16(localHeaderOff + 26, true);
            const localExtraLen= view.getUint16(localHeaderOff + 28, true);
            const dataStart    = localHeaderOff + 30 + localFnLen + localExtraLen;

            const rawData = arrayBuffer.slice(dataStart, dataStart + compressedSz);

            if (compression === 0) return rawData; // Store

            if (compression === 8) {               // Deflate
                const ds = new DecompressionStream('deflate-raw');
                const writer = ds.writable.getWriter();
                const reader = ds.readable.getReader();
                writer.write(new Uint8Array(rawData));
                writer.close();
                const chunks = [];
                let { done, value } = await reader.read();
                while (!done) { chunks.push(value); ({ done, value } = await reader.read()); }
                const total = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
                let off = 0;
                for (const c of chunks) { total.set(c, off); off += c.length; }
                return total.buffer;
            }
            throw new Error('不支援的壓縮方式: ' + compression);
        },

        // --- NovelAI 生成邏輯（char / item / pet / scene）---
        _genNovelAI: async function(prompt, type, options = {}) {
            const cfg = this.config.novelai;
            if (!cfg.token) {
                console.warn('[ImageManager] NAI token 未設定，回退 Pollinations');
                return this._genPollinations(prompt, type);
            }

            // Mutex：等待前一個 NAI 請求完成後才開始，避免 429 Concurrent lock
            let _release;
            const prevQueue = _naiQueue;
            _naiQueue = new Promise(res => { _release = res; });
            await prevQueue; // 等前一個完成
            console.log('[ImageManager] NAI 輪到我了，開始生成...');

            // 尺寸：預設 1024x1024，但接受 options 傳入（插圖需要 832x512 橫幅）
            const isChar = (type === 'char');
            const width  = options.width  || 1024;
            const height = options.height || 1024;

            // 底詞：NAI Danbooru tag 格式（設定可自訂）
            let finalPrompt = prompt;
            if (isChar && cfg.charBasePrompt) {
                finalPrompt = cfg.charBasePrompt + ', ' + prompt;
            } else if (!isChar && cfg.itemBasePrompt) {
                finalPrompt = cfg.itemBasePrompt + ', ' + prompt;
            }

            // 負向提示詞：從設定讀取
            const negativePrompt = isChar
                ? (cfg.charNegPrompt || 'nsfw, lowres, bad anatomy, bad hands, extra fingers, missing fingers, worst quality, low quality, jpeg artifacts, signature, watermark, blurry')
                : (cfg.itemNegPrompt || 'person, human, body, face, hands, worst quality, low quality, blurry, watermark, text');

            const model   = cfg.model    || 'nai-diffusion-3';
            const isV4    = model.includes('nai-diffusion-4');
            const seed    = Math.floor(Math.random() * 9999999999);

            // 從用戶設定讀取，fallback 到安全預設值
            const sampler       = cfg.sampler       || 'k_euler_ancestral';
            const scale         = cfg.scale         ?? 5;
            const steps         = cfg.steps         ?? 28;
            const ucPreset      = cfg.ucPreset      ?? 1;
            const qualityToggle = cfg.qualityToggle !== false;
            const smea          = cfg.smea          !== false;
            const smeaDyn       = cfg.smeaDyn       ?? false;

            const parameters = isV4 ? {
                // V4 / V4.5：使用用戶設定的 sampler / scale / steps
                params_version: 3,
                width, height,
                scale,
                sampler,
                steps,
                seed,
                n_samples: 1,
                ucPreset,
                qualityToggle,
                autoSmea: false,
                dynamic_thresholding: false,
                controlnet_strength: 1,
                legacy: false,
                add_original_image: true,
                cfg_rescale: 0.6,              // 對應真實成品，不花 Anlas
                noise_schedule: 'karras',
                legacy_v3_extend: false,
                skip_cfg_above_sigma: 83.3,    // V4.5 優化，不影響計費
                use_coords: false,
                legacy_uc: false,
                normalize_reference_strength_multiple: true,
                inpaintImg2ImgStrength: 1,
                characterPrompts: [],
                v4_prompt: {
                    caption: { base_caption: finalPrompt, char_captions: [] },
                    use_coords: false,
                    use_order: true
                },
                v4_negative_prompt: {
                    caption: { base_caption: negativePrompt, char_captions: [] },
                    legacy_uc: false
                },
                negative_prompt: negativePrompt,
                deliberate_euler_ancestral_bug: false,
                prefer_brownian: true,
            } : {
                // V3：SMEA 從用戶設定讀取
                width, height,
                scale,
                sampler,
                steps,
                seed,
                n_samples: 1,
                ucPreset,
                qualityToggle,
                sm: smea,           // V3 專屬，建議開啟
                sm_dyn: smeaDyn,
                dynamic_thresholding: false,
                controlnet_strength: 1,
                legacy: false,
                add_original_image: false,
                cfg_rescale: 0,
                noise_schedule: 'native',  // V3 用 native
                negative_prompt: negativePrompt
            };

            const requestBody = {
                input: finalPrompt,
                model,
                action: 'generate',
                parameters
            };

            console.log(`[ImageManager] NAI 請求 [${type}] → ${requestBody.model} ${width}x${height}`);
            console.log(`[ImageManager] NAI 實際 prompt: ${finalPrompt.slice(0, 80)}...`);

            try {
                const response = await fetch(cfg.url, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${cfg.token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(requestBody)
                });

                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`NAI ${response.status}: ${errText.slice(0, 120)}`);
                }

                const zipBuffer = await response.arrayBuffer();
                const pngBuffer = await this._extractZipFirstFile(zipBuffer);
                const blobUrl   = URL.createObjectURL(new Blob([pngBuffer], { type: 'image/png' }));

                console.log('[ImageManager] ✅ NAI 生成成功');
                _release(); // 釋放 mutex，讓下一個排隊請求繼續
                return blobUrl;

            } catch (error) {
                _release(); // 無論成功失敗都釋放
                console.error('[ImageManager] ❌ NAI 失敗，回退 Pollinations:', error.message);
                // 回退時補上 Pollinations 底詞，確保風格一致
                let fallbackPrompt = prompt;
                if (type === 'char' && this.config.pollinations.charBasePrompt) {
                    fallbackPrompt = this.config.pollinations.charBasePrompt + ', ' + prompt;
                } else if (type === 'pet' && this.config.pollinations.petBasePrompt) {
                    fallbackPrompt = this.config.pollinations.petBasePrompt + ', ' + prompt;
                }
                return this._genPollinations(fallbackPrompt, type);
            }
        },

        // 🔥 VN 背景生成器專用接口 (同步)
        generateBackground: function(prompt, options = {}) {
            console.log(`[ImageManager] 生成VN背景 (同步): ${prompt.substring(0, 50)}...`);

            // 🗑️ 已拔除硬塞的 vnStylePrompt，完全使用傳入的 prompt
            const finalPrompt = prompt;

            // ✅ 保留 VN 專用 Negative Prompt (防路人與劣質畫風，這是必要的防護網)
            const negativePrompt = 'people, person, man, woman, child, crowd, character, pedestrian, anime screencap, cel shading, flat color, simple lines, sketch, low quality, worst quality, blurry, overexposed, photography, photorealistic, 3d render';

            const seed = options.seed || Math.floor(Math.random() * 100000);
            const width = options.width || 1024;
            const height = options.height || 1024;
            const model = options.model || this.config.pollinations.model;
            
            const encoded = encodeURIComponent(finalPrompt);
            const encodedNegative = encodeURIComponent(negativePrompt);

            let url = `${this.config.pollinations.url}/${encoded}?width=${width}&height=${height}&model=${model}&seed=${seed}&negative_prompt=${encodedNegative}&nologo=true`;

            if (this.config.pollinations.apiKey && this.config.pollinations.apiKey.trim() !== '') {
                url += `&private=true&key=${this.config.pollinations.apiKey.trim()}`;
            }

            return url;
        },

        // 🔥 異步版本 (給 Host/OS/VN_Core 使用)
        generateBackgroundAsync: async function(rawPrompt, options = {}) {
            console.log(`[ImageManager] 🚀 OS 接收原始 prompt: ${rawPrompt.substring(0, 50)}...`);

            let translatedPrompt = rawPrompt;
            const isChinese = /[\u4e00-\u9fa5]/.test(rawPrompt);

            if (isChinese && win.TranslationManager) {
                try {
                    translatedPrompt = await win.TranslationManager.translateForImageGeneration(rawPrompt, 'background');
                } catch (e) {}
            }

            // 🗑️ 已拔除硬塞的 defaultPrompt style，直接使用翻譯後的原意
            const optimizedPrompt = translatedPrompt;

            // ✅ 優先使用外部傳入的 Negative Prompt，否則用預設防護詞
            const negativePrompt = options.negativePrompt || 'people, person, man, woman, child, crowd, character, pedestrian, anime screencap, cel shading, flat color, simple lines, sketch, low quality, worst quality, blurry, overexposed, photography, photorealistic, 3d render';

            const seed = options.seed || Math.floor(Math.random() * 100000);
            const width = options.width || 1024;
            const height = options.height || 1024;
            const model = options.model || this.config.pollinations.model;

            const encoded = encodeURIComponent(optimizedPrompt);
            const encodedNegative = encodeURIComponent(negativePrompt);
            
            let url = `${this.config.pollinations.url}/${encoded}?width=${width}&height=${height}&model=${model}&seed=${seed}&negative_prompt=${encodedNegative}&nologo=true`;

            if (this.config.pollinations.apiKey && this.config.pollinations.apiKey.trim() !== '') {
                url += `&private=true&key=${this.config.pollinations.apiKey.trim()}`;
            }

            return url;
        },

        // 🔥 物品生成專用接口（獨立底詞，不混用角色詞）
        generateItem: function(prompt, options = {}) {
            console.log(`[ImageManager] 生成物品: ${prompt.substring(0, 50)}...`);

            // 物品專用底詞（與角色完全分離）
            const itemBase = this.config.pollinations.itemBasePrompt;
            const finalPrompt = itemBase ? itemBase + ', ' + prompt : prompt;

            // 物品專用負詞（含排除人物）
            const negPrompt = options.negativePrompt || this.config.pollinations.itemNegPrompt || undefined;

            const seed = options.seed || Math.floor(Math.random() * 100000);
            const width = options.width || 512;
            const height = options.height || 512;
            const model = options.model || this.config.pollinations.model || 'flux';
            const encoded = encodeURIComponent(finalPrompt);

            let url = `${this.config.pollinations.url}/${encoded}?width=${width}&height=${height}&model=${model}&seed=${seed}&nologo=true`;

            if (negPrompt) {
                url += `&negative_prompt=${encodeURIComponent(negPrompt)}`;
            }

            if (this.config.pollinations.apiKey && this.config.pollinations.apiKey.trim() !== '') {
                url += `&private=true&key=${this.config.pollinations.apiKey.trim()}`;
            }

            return url;
        },

        setApiKey: function(apiKey) {
            this.config.pollinations.apiKey = apiKey;
            this.saveConfig();
        },

        saveConfig: function() {
            try {
                localStorage.setItem('os_image_config', JSON.stringify(this.config));
                console.log('[ImageManager] 配置已保存');
            } catch(e) {
                console.error('[ImageManager] 保存配置失敗:', e);
            }
        }
    };

    win.OS_IMAGE_MANAGER = ImageManager;
    ImageManager.init();
})();