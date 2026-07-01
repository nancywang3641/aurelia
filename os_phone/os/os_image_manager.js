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
    let _last429ToastAt = 0;   // 拼車撞 429 會一張一張連噴 → 節流：一段時間內只報一次，不洗版

    // ── 本機 GPU 雙向紅綠燈（2026-06-11 實測修正：單向紅燈會讓圖片永遠等不到空檔）──
    // 優先序：即時語音（玩家正在聽）＞ 本機圖片（頭像/插圖預載）＞ 預熱語音（未來台詞）。
    //   • 圖片發單前讓「即時語音」≤8 秒（即時語音是幾秒的短爆發）
    //   • 「預熱語音」反過來讓圖片：vn_tts._runPrewarm 每句前先等本機圖片清空
    //     （否則 15 句連發＝紅燈常駐，圖片白等之外還跟語音擠爆 12GB VRAM → ComfyUI 卡死）
    // 只有本機路線（comfyui_direct / tavern_sd）參與；雲端（NAI/Pollinations）不搶顯卡、照舊並行。
    if (!win.AURELIA_GPU_LIGHT || !win.AURELIA_GPU_LIGHT.imgStart) {
        win.AURELIA_GPU_LIGHT = {
            _voiceBusy: 0,   // 即時語音（不含預熱）
            _imgBusy: 0,     // 本機圖片生成中數量
            voiceStart: function() { this._voiceBusy++; },
            voiceEnd:   function() { this._voiceBusy = Math.max(0, this._voiceBusy - 1); },
            imgStart:   function() { this._imgBusy++; },
            imgEnd:     function() { this._imgBusy = Math.max(0, this._imgBusy - 1); },
            waitVoiceIdle: async function(maxMs) {
                const cap = maxMs || 8000;
                const t0 = Date.now();
                while (this._voiceBusy > 0 && (Date.now() - t0) < cap) {
                    await new Promise(r => setTimeout(r, 250));
                }
            },
            waitImagesIdle: async function(maxMs) {
                const cap = maxMs || 120000;
                const t0 = Date.now();
                while (this._imgBusy > 0 && (Date.now() - t0) < cap) {
                    await new Promise(r => setTimeout(r, 400));
                }
            }
        };
    }

    // ── 本機 GPU 單線佇列（2026-06-11 終極版：紅綠燈互讓有競態窗口，遲到的單照樣撞）──
    // 同時只跑「一件」本機 GPU 工作，物理上不可能再撞顯卡。
    // 優先序：0=即時語音（玩家正在聽，插隊）＞ 1=本機圖片 ＞ 2=預熱語音（未來台詞墊底）。
    // 只有本機工作進佇列（SoVITS、ComfyUI 直連、酒館SD）；雲端（NAI/Pollinations）不進、照舊並行。
    if (!win.AURELIA_GPU_QUEUE) {
        win.AURELIA_GPU_QUEUE = {
            _q: [], _running: false, _seq: 0,
            // maxMs：單項逾時保險（預設 240 秒）。一項卡死（SoVITS 沒開、連線懸掛…）不准堵死整條隊，
            // 逾時就放行後面的單，孤兒請求留在背景自生自滅。
            run: function(fn, prio, maxMs) {
                const self = this;
                return new Promise(function(resolve, reject) {
                    self._q.push({ fn: fn, prio: (prio == null ? 1 : prio), maxMs: (maxMs || 240000), seq: self._seq++, resolve: resolve, reject: reject });
                    self._q.sort(function(a, b) { return (a.prio - b.prio) || (a.seq - b.seq); });
                    self._pump();
                });
            },
            _pump: function() {
                const self = this;
                if (self._running) return;
                const item = self._q.shift();
                if (!item) return;
                self._running = true;
                let done = false;
                const finish = function(cb, v) {
                    if (done) return;
                    done = true;
                    clearTimeout(timer);
                    cb(v);
                    self._running = false;
                    self._pump();
                };
                const timer = setTimeout(function() {
                    console.warn('[GPU佇列] 一項工作逾時(' + item.maxMs + 'ms)，放行後面的單');
                    finish(item.resolve, undefined);
                }, item.maxMs);
                Promise.resolve().then(function() { return item.fn(); })
                    .then(function(v) { finish(item.resolve, v); }, function(e) { finish(item.reject, e); });
            }
        };
    }

    const ImageManager = {
        config: {
            service: 'pollinations', // 預設（legacy：單一全域服務，保留供舊讀者；新路由走三桶）
            // 三桶各自選接口：死物桶(bg/item/pet) vs 頭像桶(char) vs 插圖桶(scene)
            serviceInanimate: 'pollinations', // 死物桶：bg / item / pet
            serviceLiving: 'pollinations',    // legacy：舊「活物桶」(char+scene 共用)，保留供遷移/舊讀者；新路由走 serviceChar/serviceScene
            serviceChar: 'pollinations',      // 頭像桶：char（角色頭像／立繪）
            serviceScene: 'pollinations',     // 插圖桶：scene（場景插圖／CG）
            pollinations: {
                url: 'https://gen.pollinations.ai/image', // API 端點
                apiKey: '', // Pollen API Key
                model: 'flux', // 預設模型（zimage 2026-06-28 起在 gen 端點卡死/逾時，改用 flux：3 秒秒出、最便宜）
                models: {
                    'zimage': 'Z-Image Turbo (0.002p)',
                    'flux': 'Flux Schnell (0.00175p)',
                    'p-image': 'Pruna p-image (0.005p)',
                    'klein': 'FLUX.2 Klein 4B (0.01p)',
                    'grok-imagine': 'Grok Imagine (0.02p)',
                    'qwen-image': 'Qwen Image Plus (0.03p)',
                    'seedream': 'Seedream 4.0 (0.03p)',
                    'seedream5': 'Seedream 5.0 Lite (0.035p)',
                    'seedream-pro': 'Seedream 4.5 Pro (0.04p)',
                    'ideogram-v4-turbo': 'Ideogram 4 Turbo (0.03p)',
                    'nanobanana': 'NanoBanana',
                    'nanobanana-pro': 'NanoBanana Pro',
                    'gptimage': 'GPT Image 1 Mini',
                    'gpt-image-2': 'GPT Image 2',
                    'kontext': 'FLUX.1 Kontext (0.04p)'
                },
                charBasePrompt: 'anime style, 2d, cel shading, flat color, illustration, high quality, best quality, no photorealistic, no 3d, clean lines',
                charNegPrompt: 'bad anatomy, extra limbs, disfigured, blurry, low quality, worst quality, watermark, text',
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
                capFreeSize: true,   // 🛡️ 防超免費尺寸：超過 1024×1024(約100萬px) 自動等比縮回，避免誤設大圖扣 Anlas
            },
            // 酒館原生 /sd：走使用者在酒館 Image Generation 擴展設好的後端；以下全可空，空=用酒館自己的設定
            tavernSd: { negative: '', width: '', height: '', steps: '', cfg: '' },
            // ComfyUI 直連：奧瑞亞內部組 workflow，走酒館伺服器代理(/api/sd/comfy/generate)生圖
            comfyuiDirect: {
                url: 'http://127.0.0.1:8188', modelType: 'checkpoint', model: '', vae: '', sampler: 'euler', scheduler: 'normal',
                steps: 28, cfg: 6.5, width: 1024, height: 1024, seed: -1, clipSkip: 0,
                basePrompt: '', negPrompt: '', loras: [],
                // Flux 模式專用
                fluxClipL: 'clip_l.safetensors', fluxT5: 't5xxl_fp8_e4m3fn.safetensors', fluxAe: 'ae.safetensors', guidance: 3.5,
                // Anima 模式專用（Qwen 文字編碼器 + Qwen VAE）
                animaClip: 'qwen_3_06b_base.safetensors', animaVae: 'qwen_image_vae.safetensors'
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
                        // 向後相容：舊用戶只有單一 service → 各桶都繼承它，現狀不變
                        serviceInanimate: savedConfig.serviceInanimate || savedConfig.service || this.config.service,
                        serviceLiving: savedConfig.serviceLiving || savedConfig.service || this.config.service,
                        // 頭像/插圖拆桶：沒存過新桶 → 遷移自舊「活物桶」serviceLiving，現狀不變（要分才分）
                        serviceChar:  savedConfig.serviceChar  || savedConfig.serviceLiving || savedConfig.service || this.config.service,
                        serviceScene: savedConfig.serviceScene || savedConfig.serviceLiving || savedConfig.service || this.config.service,
                        pollinations: {
                            ...this.config.pollinations,
                            ...savedConfig.pollinations,
                            models: this.config.pollinations.models
                        },
                        novelai: {
                            ...this.config.novelai,
                            ...savedConfig.novelai
                        },
                        tavernSd: {
                            ...this.config.tavernSd,
                            ...(savedConfig.tavernSd || {})
                        },
                        comfyuiDirect: {
                            ...this.config.comfyuiDirect,
                            ...(savedConfig.comfyuiDirect || {}),
                            loras: (savedConfig.comfyuiDirect && Array.isArray(savedConfig.comfyuiDirect.loras)) ? savedConfig.comfyuiDirect.loras : this.config.comfyuiDirect.loras
                        }
                    };
                    
                    if (!this.config.pollinations.models[this.config.pollinations.model]) {
                        console.warn(`[ImageManager] 舊模型 ${this.config.pollinations.model} 已失效，重置為 flux`);
                        this.config.pollinations.model = 'flux';
                    }

                    console.log('[ImageManager] ✅ 配置已載入，當前模型:', this.config.pollinations.model);
                } catch(e){
                    console.error('[ImageManager] ❌ 載入配置失敗:', e);
                }
            }
        },

        // --- 同 (prompt, type) 結果快取 ---
        // 解決 011.html 這類「ST 正則注入面板」script 多次重跑導致每次都吃新 seed / 耗 token 的問題。
        // 同 prompt + type 第二次呼叫直接回傳第一次的 URL（Pollinations 是 deterministic-on-seed，
        // 鎖住 URL = 鎖住圖；NAI 則直接複用既有 blob URL）。
        // options.force = true 可跳過 cache 強制重生。
        _urlCache: new Map(),

        // 釋放某個 cache 項（blob 順手 revoke）→ 圖庫重生轉成持久 dataURL 後呼叫，免暫時 blob URL 永久佔記憶體
        evict: function(type, prompt) {
            try {
                const k = (type || 'scene') + '|' + (prompt || '');
                const v = this._urlCache.get(k);
                if (v && typeof v === 'string' && v.startsWith('blob:')) { try { URL.revokeObjectURL(v); } catch (e) {} }
                this._urlCache.delete(k);
            } catch (e) {}
        },

        // --- 三桶路由：依 type 取該桶選的接口 ---
        // 頭像桶 char = serviceChar；插圖桶 scene = serviceScene；其餘(bg/item/pet…) = serviceInanimate。
        // char/scene 多重 fallback：新桶 → 舊「活物桶」serviceLiving → legacy 全域 service → 'pollinations'，保證永不回 undefined。
        serviceFor: function(type) {
            if (type === 'char')  return this.config.serviceChar  || this.config.serviceLiving || this.config.service || 'pollinations';
            if (type === 'scene') return this.config.serviceScene || this.config.serviceLiving || this.config.service || 'pollinations';
            return this.config.serviceInanimate || this.config.service || 'pollinations';
        },

        // --- 核心生成函數 (整合翻譯 + cache) ---
        generate: async function(prompt, type = 'scene', options = {}) {
            // 🔥 步驟 0: cache 命中
            const cacheKey = type + '|' + (prompt || '');
            if (!options.force && this._urlCache.has(cacheKey)) {
                console.log(`[ImageManager] cache hit [${type}]: ${prompt}`);
                return this._urlCache.get(cacheKey);
            }

            console.log(`[ImageManager] Raw Input [${type}]: ${prompt}`);

            // 🔥 步驟 1: 自動翻譯
            let englishPrompt = prompt;
            if (win.TranslationManager) {
                try {
                    if (win.TranslationManager.isChinese(prompt)) {
                        console.log('[ImageManager] 偵測到中文，正在翻譯...');
                        const _tr = await win.TranslationManager.translate(prompt, 'zh', 'en');
                        englishPrompt = (_tr && String(_tr).trim()) ? _tr : prompt;  // 翻譯回空→用原文，絕不送空 prompt
                        console.log(`[ImageManager] 翻譯結果: ${englishPrompt}`);
                    }
                } catch(e) {
                    console.warn('[ImageManager] 翻譯失敗，使用原文:', e);
                }
            }

            // 🛡️ 空 prompt 防護：翻譯回空 / 來源本來就空 → 直接跳過，絕不用空 prompt 生圖（顛模型空 prompt 會吐裸圖）
            if (!englishPrompt || !String(englishPrompt).trim()) {
                console.warn('[ImageManager] 空 prompt，跳過生成');
                return null;
            }

            // 🔥 步驟 2: 路由判斷（依 type 桶取接口：活物桶 char/scene、死物桶 bg/item/pet）
            // options.provider 可「單次」覆蓋桶選擇（給 VN 面板各自選 NAI / POLL AI 用）；沒給就走該 type 的桶
            const service = (['novelai', 'pollinations', 'tavern_sd', 'comfyui_direct'].includes(options.provider)) ? options.provider : this.serviceFor(type);
            let result;
            if (service === 'tavern_sd') {
                // 酒館原生 /sd：raw prompt（不塞奧瑞亞底詞，尊重朋友的 SD 設定）；失敗回 null，不偷偷換來源
                console.log(`[ImageManager] Final Prompt [${type}→TavernSD]: ${englishPrompt}`);
                result = await this._genTavernSd(englishPrompt, type, options);
            } else if (service === 'comfyui_direct') {
                // ComfyUI 直連：奧瑞亞內部組 workflow（底詞由 comfyuiDirect.basePrompt 控制，不套 poll ai 底詞）
                console.log(`[ImageManager] Final Prompt [${type}→ComfyUIDirect]: ${englishPrompt}`);
                result = await this._genComfyuiDirect(englishPrompt, type, options);
            } else if (service === 'novelai' && this.config.novelai.token) {
                // NAI 使用 Danbooru tag 格式，底詞/負詞在 _genNovelAI 內部處理
                console.log(`[ImageManager] Final Prompt [${type}→NAI${options.raw ? ' RAW' : ''}]: ${englishPrompt}`);
                result = await this._genNovelAI(englishPrompt, type, options);
            } else {
                // 🔥 步驟 3: Pollinations 底詞（只在走 Pollinations 時套用；options.raw=true 跳過）
                if (type === 'char' && !options.raw) {
                    const charBase = this.config.pollinations.charBasePrompt;
                    if (charBase) englishPrompt = charBase + ', ' + englishPrompt;
                }
                console.log(`[ImageManager] Final Prompt [${type}→Pol${options.raw ? ' RAW' : ''}]: ${englishPrompt}`);

                // 🔥 步驟 4: Pollinations 負詞（options.raw=true 跳過）
                if (!options.negativePrompt && type === 'char' && !options.raw) {
                    options = { ...options, negativePrompt: this.config.pollinations.charNegPrompt || undefined };
                }

                result = this._genPollinations(englishPrompt, type, options);
            }

            if (result) {
                // 覆蓋同 key 舊值前，若舊值是 blob URL 先 revoke（force 重生會留死 blob → 累積 OOM）
                const _old = this._urlCache.get(cacheKey);
                if (_old && _old !== result && typeof _old === 'string' && _old.startsWith('blob:')) { try { URL.revokeObjectURL(_old); } catch (e) {} }
                this._urlCache.set(cacheKey, result);
                // 上限保護：超過 60 條淘汰最舊的（blob 順手 revoke），避免 Map 無限長累積大字串 / 死 blob
                if (this._urlCache.size > 60) {
                    const _fk = this._urlCache.keys().next().value;
                    const _fv = this._urlCache.get(_fk);
                    if (_fv && typeof _fv === 'string' && _fv.startsWith('blob:')) { try { URL.revokeObjectURL(_fv); } catch (e) {} }
                    this._urlCache.delete(_fk);
                }
            }
            return result;
        },

        // --- Pollinations 生成邏輯 ---
        _genPollinations: function(basePrompt, type, options = {}) {
            try { win.AURELIA_USAGE && win.AURELIA_USAGE.bumpImg(); } catch (e) {}   // 生圖計數
            let optimizedPrompt = basePrompt;

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

        // --- 酒館原生 /sd 生成：走使用者在酒館 Image Generation 擴展設好的後端 ---
        // 不塞奧瑞亞底詞/負詞（尊重朋友的 SD 設定）；失敗回 null 並用 toastr 提示，不偷偷換來源。
        _genTavernSd: async function(prompt, type, options = {}) {
            try { win.AURELIA_USAGE && win.AURELIA_USAGE.bumpImg(); } catch (e) {}

            const trigger = (win.TavernHelper && win.TavernHelper.triggerSlash) || win.triggerSlash;
            if (typeof trigger !== 'function') {
                console.warn('[ImageManager] 找不到 triggerSlash，無法走酒館原生生圖');
                try { win.toastr && win.toastr.warning('找不到酒館助手，無法使用「酒館原生」生圖', '生圖'); } catch (e) {}
                return null;
            }

            // 淨化 prompt：移除會破壞 STscript 解析的字元（| 管道、{{ }} 巨集、換行）
            const clean = String(prompt || '')
                .replace(/\|/g, ' ')
                .replace(/\{\{|\}\}/g, '')
                .replace(/[\r\n]+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            if (!clean) return null;

            const t = this.config.tavernSd || {};
            const args = ['quiet=true', 'gallery=false', 'extend=false'];
            const neg = options.negativePrompt || t.negative;
            if (neg) args.push('negative="' + String(neg).replace(/"/g, '') + '"');
            if (options.seed) args.push('seed=' + options.seed);
            const w = options.width || t.width;  if (w) args.push('width=' + w);
            const h = options.height || t.height; if (h) args.push('height=' + h);
            if (t.steps) args.push('steps=' + t.steps);
            if (t.cfg)   args.push('cfg=' + t.cfg);

            const cmd = '/sd ' + args.join(' ') + ' ' + clean;
            console.log('[ImageManager] 酒館原生 /sd 指令:', cmd);

            // 進本機 GPU 單線佇列（優先序 1）：跟語音絕不同時上顯卡
            return await win.AURELIA_GPU_QUEUE.run(async () => {
                try {
                    try { win.AURELIA_GPU_LIGHT.imgStart(); } catch (e) {}
                    const url = await trigger(cmd);
                    if (!url || typeof url !== 'string' || !url.trim()) {
                        console.warn('[ImageManager] /sd 回傳空，可能未設定後端');
                        try { win.toastr && win.toastr.warning('生圖失敗，請先在酒館「圖像生成」擴展設定好後端', '酒館原生生圖'); } catch (e) {}
                        return null;
                    }
                    console.log('[ImageManager] ✅ 酒館原生生圖成功');
                    return url.trim();
                } catch (error) {
                    console.error('[ImageManager] ❌ 酒館原生生圖失敗:', error);
                    try { win.toastr && win.toastr.error('生圖失敗：' + (error.message || error), '酒館原生生圖'); } catch (e) {}
                    return null;
                } finally {
                    try { win.AURELIA_GPU_LIGHT.imgEnd(); } catch (e) {}
                }
            }, 1);
        },

        // --- ComfyUI 直連：奧瑞亞內部自動組 workflow → 走酒館伺服器代理(/api/sd/comfy/generate) → 回 base64 ---
        // 不依賴 ST 的 workflow 檔；LoRA/參數全由 config.comfyuiDirect（奧瑞亞 UI）控制。
        _genComfyuiDirect: async function(prompt, type, options = {}) {
            try { win.AURELIA_USAGE && win.AURELIA_USAGE.bumpImg(); } catch (e) {}
            const cfg = this.config.comfyuiDirect || {};
            const url = (cfg.url || '').trim();
            if (!url) {
                try { win.toastr && win.toastr.warning('請先在「ComfyUI 直連」設定填入網址', 'ComfyUI 直連'); } catch (e) {}
                return null;
            }
            if (!cfg.model && cfg.workflowMode !== 'custom') {
                try { win.toastr && win.toastr.warning('請先在「ComfyUI 直連」選一個模型', 'ComfyUI 直連'); } catch (e) {}
                return null;
            }

            // 酒館驗證 headers（含 CSRF），走伺服器代理免 CORS
            const ctx = (win.SillyTavern && win.SillyTavern.getContext) ? win.SillyTavern.getContext() : null;
            const headers = (ctx && ctx.getRequestHeaders && ctx.getRequestHeaders()) || { 'Content-Type': 'application/json' };

            let posText = [cfg.basePrompt, prompt].filter(Boolean).join(', ');
            let negText = options.negativePrompt || cfg.negPrompt || '';
            // 防「男變女」：場景(scene)＋角色頭像/立繪(char) 的提示詞若沒有任何女性詞 → 三重防護
            // 中和女性化髮型詞 ＋ 正面加男性錨點(male focus, masculine) ＋ 負面強負女性特徵
            // （此模型太顛，男角穿粉色/M字瀏海等就變女；夾擊把它拉回男性。有女角的不動）
            if ((type === 'scene' || type === 'char') && !/(\bgirl\b|\bgirls\b|\bwoman\b|\bwomen\b|\bfemale\b|1girl|2girls)/i.test(posText)) {
                // 中和會讓男角變女的女性偏向髮型詞（保留中分外觀、拔掉女性 trigger）
                posText = posText.replace(/\bm[-\s]?shaped bangs\b/ig, 'center-parted hair')
                                 .replace(/\bparted bangs\b/ig, 'parted hair');
                posText = [posText, 'male focus, masculine'].filter(Boolean).join(', ');
                negText = [negText, '(breast:1.5), (girl:1.5), (woman:1.5)'].filter(Boolean).join(', ');
            }
            let wf;
            if (cfg.workflowMode === 'custom' && (cfg.customWorkflow || '').trim()) {
                // 自帶工作流模式（進階）：用使用者貼的 ComfyUI 工作流，只注入 %prompt%/%negative%/%seed%/%width%/%height%
                // 模型/LoRA/參數/放大/修臉全由他的工作流決定，奧瑞亞不自動組
                wf = this._applyCustomWorkflow(cfg.customWorkflow, posText, negText, options, cfg);
                if (!wf) return null;  // JSON 解析失敗（已 toastr 提示）
            } else {
                // 自動組：場景插圖(type==='scene')依設定自動套高清修復 + FaceDetailer 修臉
                // （頭像每輪生不套以免變慢；立繪走自己的開關，不經這裡）
                let _opts = options;
                if (type === 'scene') {
                    _opts = Object.assign({}, options);
                    // 預設開：config 沒這欄位(舊存檔/沒開過設定)也視為開，除非使用者明確存成 false
                    if (cfg.sceneHires !== false && !_opts.comfyHires) _opts.comfyHires = { scale: parseFloat(cfg.sceneHiresScale) || 1.5, denoise: 0.45 };
                    if (cfg.sceneFaceDetailer !== false) _opts.comfyFaceDetailer = true;
                }
                wf = this._buildComfyWorkflow(posText, negText, type, _opts, cfg);
            }
            const body = { url: url, prompt: '{"prompt": ' + JSON.stringify(wf) + '}' };

            // 進本機 GPU 單線佇列（優先序 1）：跟語音絕不同時上顯卡
            return await win.AURELIA_GPU_QUEUE.run(async () => {
                // 逾時保險：ComfyUI 卡死（OOM/排隊爆掉）時 180 秒放棄這張，別讓佇列整條凍住
                const _ac = (typeof AbortController !== 'undefined') ? new AbortController() : null;
                const _timer = _ac ? setTimeout(() => { try { _ac.abort(); } catch (e) {} }, 180000) : null;
                try {
                    try { win.AURELIA_GPU_LIGHT.imgStart(); } catch (e) {}
                    // PWA/手機沒有酒館後端代理 → 瀏覽器直接打 ComfyUI(需 --listen --enable-cors-header)；酒館內照舊走代理免 CORS
                    if (this._comfyDirectBrowser()) {
                        return await this._genComfyuiBrowserDirect(wf, url, _ac);
                    }
                    const res = await fetch('/api/sd/comfy/generate', { method: 'POST', headers: headers, body: JSON.stringify(body), signal: _ac ? _ac.signal : undefined });
                    if (!res.ok) {
                        const t = await res.text().catch(() => '');
                        console.error('[ImageManager] ComfyUI 直連失敗:', res.status, t);
                        try { win.toastr && win.toastr.error('ComfyUI 生圖失敗：' + (t || res.status), 'ComfyUI 直連'); } catch (e) {}
                        return null;
                    }
                    const j = await res.json();
                    if (j && j.data) {
                        console.log('[ImageManager] ✅ ComfyUI 直連生圖成功');
                        return 'data:image/' + (j.format || 'png') + ';base64,' + j.data;
                    }
                    return null;
                } catch (error) {
                    const _msg = (error && error.name === 'AbortError') ? '生成逾時(180秒)，已放棄這張讓後面的繼續' : (error.message || error);
                    console.error('[ImageManager] ComfyUI 直連錯誤:', _msg);
                    try { win.toastr && win.toastr.error('ComfyUI 連線錯誤：' + _msg, 'ComfyUI 直連'); } catch (e) {}
                    return null;
                } finally {
                    if (_timer) clearTimeout(_timer);
                    try { win.AURELIA_GPU_LIGHT.imgEnd(); } catch (e) {}
                }
            }, 1);
        },

        // PWA/手機沒有酒館後端 → 瀏覽器直接打 ComfyUI；酒館內(有 SillyTavern.getContext)走代理免 CORS
        _comfyDirectBrowser: function() {
            try { return !!(win.OS_API && win.OS_API.isStandalone && win.OS_API.isStandalone()); }
            catch (e) { return false; }
        },

        // 瀏覽器直連 ComfyUI：POST /prompt → 輪詢 /history/{id} → /view 抓圖 → base64
        // 需 ComfyUI 啟動帶 --listen 0.0.0.0 --enable-cors-header（否則跨來源被瀏覽器擋）
        _genComfyuiBrowserDirect: async function(wf, url, ac) {
            const base = String(url || '').replace(/\/+$/, '');
            const sig = ac ? ac.signal : undefined;
            const cid = this._comfyClientId || (this._comfyClientId = 'aurelia_' + Math.floor(Math.random() * 1e9).toString(36));
            // 1) 送工作流
            const qr = await fetch(base + '/prompt', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: wf, client_id: cid }), signal: sig,
            });
            if (!qr.ok) { const t = await qr.text().catch(function(){ return ''; }); throw new Error('送工作流被拒 ' + qr.status + (t ? '：' + t.slice(0, 160) : '')); }
            const qj = await qr.json().catch(function(){ return {}; });
            if (qj.node_errors && Object.keys(qj.node_errors).length) throw new Error('工作流節點錯誤：' + JSON.stringify(qj.node_errors).slice(0, 200));
            const pid = qj.prompt_id;
            if (!pid) throw new Error('ComfyUI 沒回 prompt_id（檢查工作流/模型名）');
            // 2) 輪詢歷史（逾時靠外層 AbortController 180s）
            let outputs = null;
            while (true) {
                if (sig && sig.aborted) { const e = new Error('AbortError'); e.name = 'AbortError'; throw e; }
                await new Promise(function (r) { setTimeout(r, 1000); });
                let hj = null;
                try { const hr = await fetch(base + '/history/' + pid, { signal: sig }); if (hr.ok) hj = await hr.json(); }
                catch (e) { if (e && e.name === 'AbortError') throw e; }
                const entry = hj && hj[pid];
                if (entry) {
                    if (entry.status && entry.status.status_str === 'error') throw new Error('ComfyUI 執行失敗（看 ComfyUI 終端機錯誤）');
                    if (entry.outputs) { outputs = entry.outputs; break; }
                }
            }
            // 3) 找產出圖（優先 type=output 的 SaveImage 結果）
            const imgs = [];
            for (const nid in outputs) { const o = outputs[nid]; if (o && Array.isArray(o.images)) Array.prototype.push.apply(imgs, o.images); }
            const img = imgs.filter(function (x) { return x && x.type === 'output'; })[0] || imgs[0];
            if (!img) throw new Error('ComfyUI 沒產出圖片');
            // 4) 抓圖 → base64（與代理回傳格式一致）
            const vp = new URLSearchParams({ filename: img.filename || '', subfolder: img.subfolder || '', type: img.type || 'output' });
            const ir = await fetch(base + '/view?' + vp.toString(), { signal: sig });
            if (!ir.ok) throw new Error('抓圖失敗 ' + ir.status);
            const blob = await ir.blob();
            const dataUrl = await new Promise(function (resolve, reject) { const fr = new FileReader(); fr.onload = function () { resolve(fr.result); }; fr.onerror = reject; fr.readAsDataURL(blob); });
            console.log('[ImageManager] ✅ ComfyUI 瀏覽器直連生圖成功');
            return dataUrl;
        },

        // 抓 ComfyUI 清單（模型/採樣器/排程/VAE/LoRA）：直連時自己解析 /object_info，酒館內走代理。回 {models,samplers,schedulers,vaes,loras}
        fetchComfyLists: async function(url) {
            const base = String(url || '').replace(/\/+$/, '');
            if (this._comfyDirectBrowser()) {
                const r = await fetch(base + '/object_info');
                if (!r.ok) throw new Error('object_info ' + r.status);
                const oi = await r.json();
                const pick = function (node, field) {
                    try {
                        const inp = oi[node] && oi[node].input;
                        const a = inp && ((inp.required && inp.required[field]) || (inp.optional && inp.optional[field]));
                        return (a && Array.isArray(a[0])) ? a[0] : [];
                    } catch (e) { return []; }
                };
                const ckpts = pick('CheckpointLoaderSimple', 'ckpt_name');
                const unets = pick('UNETLoader', 'unet_name');
                const ggufs = pick('UnetLoaderGGUF', 'unet_name');
                // 對齊代理格式：models 是 {value,text}，text 帶 UNet:/GGUF: 前綴供面板分類
                const models = [].concat(
                    ckpts.map(function (n) { return { value: n, text: n }; }),
                    unets.map(function (n) { return { value: n, text: 'UNet: ' + n }; }),
                    ggufs.map(function (n) { return { value: n, text: 'GGUF: ' + n }; })
                );
                return { models: models, samplers: pick('KSampler', 'sampler_name'), schedulers: pick('KSampler', 'scheduler'), vaes: pick('VAELoader', 'vae_name'), loras: pick('LoraLoader', 'lora_name') };
            }
            // 酒館代理
            const ctx = (win.SillyTavern && win.SillyTavern.getContext) ? win.SillyTavern.getContext() : null;
            const headers = (ctx && ctx.getRequestHeaders && ctx.getRequestHeaders()) || { 'Content-Type': 'application/json' };
            const post = async function (path) { try { const r = await fetch(path, { method: 'POST', headers: headers, body: JSON.stringify({ url: url }) }); return r.ok ? await r.json() : null; } catch (e) { return null; } };
            return { models: await post('/api/sd/comfy/models'), samplers: await post('/api/sd/comfy/samplers'), schedulers: await post('/api/sd/comfy/schedulers'), vaes: await post('/api/sd/comfy/vaes'), loras: await post('/api/sd/comfy/loras') };
        },

        // 預設包風格預覽：用「指定預設包設定 + 測試詞」生一張小圖，不動到當前面板設定
        // presetCfg：一個預設包物件（含 model/loras/params…，但通常沒有 url）→ 與當前 config 合併補 url
        previewComfyPreset: async function(presetCfg, prompt) {
            const live = this.config.comfyuiDirect || {};
            const cfg = Object.assign({}, live, presetCfg || {});  // 預設包覆蓋模型/LoRA/參數；url 等沿用 live
            const url = (cfg.url || '').trim();
            if (!url) throw new Error('ComfyUI 網址空白（先在面板填網址＋測試）');
            if (!cfg.model) throw new Error('這個包沒有模型(model 空白) — 另存時面板可能沒選到模型');
            const ctx = (win.SillyTavern && win.SillyTavern.getContext) ? win.SillyTavern.getContext() : null;
            const headers = (ctx && ctx.getRequestHeaders && ctx.getRequestHeaders()) || { 'Content-Type': 'application/json' };
            const posText = [cfg.basePrompt, prompt].filter(Boolean).join(', ');
            const negText = cfg.negPrompt || '';
            // 預覽用小圖(512×768)。每次給新隨機種子→避開 ComfyUI 對「相同工作流」的快取
            // （完全命中快取時不產生新輸出→代理拿不到圖→伺服器 500），順便讓重新生成有變化
            const wf = this._buildComfyWorkflow(posText, negText, 'char', { width: 512, height: 768, seed: Math.floor(Math.random() * 1e15) }, cfg);
            // PWA/手機：瀏覽器直連 ComfyUI（不吞錯，讓真正原因往上拋給卡片顯示）
            if (this._comfyDirectBrowser()) {
                return await this._genComfyuiBrowserDirect(wf, url, null);
            }
            const body = { url: url, prompt: '{"prompt": ' + JSON.stringify(wf) + '}' };
            // 注意：不吞錯，把真正原因往上拋給卡片顯示
            const res = await fetch('/api/sd/comfy/generate', { method: 'POST', headers: headers, body: JSON.stringify(body) });
            if (!res.ok) {
                const t = await res.text().catch(function(){ return ''; });
                throw new Error('伺服器 ' + res.status + (t ? ('：' + String(t).slice(0, 180)) : ''));
            }
            const j = await res.json();
            if (j && j.data) return 'data:image/' + (j.format || 'png') + ';base64,' + j.data;
            throw new Error('沒回傳圖片資料（檢查模型/LoRA 名稱是否正確）');
        },

        // 自帶工作流：把使用者貼的 ComfyUI 工作流(API 格式)注入變數後，回傳工作流節點物件
        // 支援變數（含引號替換）：%prompt% %negative%（字串）/ %seed% %width% %height%（數字）
        _applyCustomWorkflow: function(tpl, posText, negText, options, cfg) {
            options = options || {}; cfg = cfg || {};
            const w = parseInt(options.width  || cfg.width  || 1024) || 1024;
            const h = parseInt(options.height || cfg.height || 1024) || 1024;
            const seed = (options.seed && Number(options.seed) >= 0) ? Number(options.seed) : Math.floor(Math.random() * 1e15);
            let s = String(tpl);
            s = s.split('"%prompt%"').join(JSON.stringify(posText || ''));
            s = s.split('"%negative%"').join(JSON.stringify(negText || ''));
            s = s.split('"%model%"').join(JSON.stringify(cfg.model || ''));
            s = s.split('"%seed%"').join(String(seed));
            s = s.split('"%width%"').join(String(w));
            s = s.split('"%height%"').join(String(h));
            let obj;
            try { obj = JSON.parse(s); }
            catch (e) {
                try { win.toastr && win.toastr.error('自訂工作流 JSON 解析失敗：' + (e.message || e), 'ComfyUI 直連'); } catch (_) {}
                return null;
            }
            // 解開 {"prompt": {...}} 外殼（有些匯出帶 prompt 鍵）
            if (obj && obj.prompt && typeof obj.prompt === 'object' && !obj.prompt.class_type) obj = obj.prompt;
            return obj;
        },

        // 加 FaceDetailer 修臉節點（偵測臉→裁出放大重畫→貼回）；回傳修臉後的影像輸出 ref
        // refs: { image, model, clip, vae, positive, negative }；samp = { cfg, sampler_name, scheduler } 控制二次採樣
        _addFaceDetailerNodes: function(nodes, refs, nid, samp) {
            samp = samp || { cfg: 7.0, sampler_name: 'dpmpp_2m', scheduler: 'karras' };
            const detId = String(nid);
            const fdId  = String(nid + 1);
            nodes[detId] = { class_type: 'UltralyticsDetectorProvider', inputs: { model_name: 'bbox/face_yolov8m.pt' } };
            nodes[fdId] = { class_type: 'FaceDetailer', inputs: {
                image: refs.image, model: refs.model, clip: refs.clip, vae: refs.vae,
                positive: refs.positive, negative: refs.negative, bbox_detector: [detId, 0],
                guide_size: 512, guide_size_for: true, max_size: 1024,
                seed: Math.floor(Math.random() * 1e15), steps: 20,
                cfg: samp.cfg,
                sampler_name: samp.sampler_name,
                scheduler: samp.scheduler,
                denoise: 0.45, feather: 5, noise_mask: true, force_inpaint: true,
                bbox_threshold: 0.5, bbox_dilation: 10, bbox_crop_factor: 3.0,
                sam_detection_hint: 'center-1', sam_dilation: 0, sam_threshold: 0.93,
                sam_bbox_expansion: 0, sam_mask_hint_threshold: 0.7, sam_mask_hint_use_negative: 'False',
                drop_size: 10, wildcard: '', cycle: 1
            }};
            return [fdId, 0];
        },

        // 內部組 ComfyUI API workflow（txt2img + LoRA 串接，全用 ComfyUI 內建節點，不依賴 rgthree）
        _buildComfyWorkflow: function(posText, negText, type, options, cfg) {
            if (cfg.modelType === 'flux') return this._buildFluxWorkflow(posText, negText, type, options, cfg);
            if (cfg.modelType === 'anima') return this._buildAnimaWorkflow(posText, negText, type, options, cfg);
            const w = parseInt(options.width  || cfg.width  || 1024) || 1024;
            const h = parseInt(options.height || cfg.height || 1024) || 1024;
            const steps = parseInt(cfg.steps) || 28;
            const cfgScale = parseFloat(cfg.cfg) || 6.5;
            const sampler = cfg.sampler || 'euler';
            const scheduler = cfg.scheduler || 'normal';
            let seed = (cfg.seed != null && Number(cfg.seed) >= 0) ? Number(cfg.seed) : Math.floor(Math.random() * 1e15);
            if (options.seed) seed = options.seed;

            const nodes = {};
            let nid = 100;

            // 1) checkpoint
            nodes['4'] = { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: cfg.model || '' } };
            let modelRef = ['4', 0];
            let clipRef  = ['4', 1];

            // 2) LoRA 串接（內建 LoraLoader）
            (cfg.loras || []).forEach((L) => {
                if (!L || !L.on || !L.name) return;
                const id = String(nid++);
                nodes[id] = {
                    class_type: 'LoraLoader',
                    inputs: {
                        lora_name: L.name,
                        strength_model: (L.strengthModel != null ? parseFloat(L.strengthModel) : 1) || 0,
                        strength_clip:  (L.strengthClip  != null ? parseFloat(L.strengthClip)  : 1) || 0,
                        model: modelRef, clip: clipRef
                    }
                };
                modelRef = [id, 0]; clipRef = [id, 1];
            });

            // 3) CLIP skip（可選）
            if (cfg.clipSkip && parseInt(cfg.clipSkip) > 0) {
                const id = String(nid++);
                nodes[id] = { class_type: 'CLIPSetLastLayer', inputs: { clip: clipRef, stop_at_clip_layer: -Math.abs(parseInt(cfg.clipSkip)) } };
                clipRef = [id, 0];
            }

            // 4) 提示詞編碼
            nodes['6'] = { class_type: 'CLIPTextEncode', inputs: { text: posText || '', clip: clipRef } };
            nodes['7'] = { class_type: 'CLIPTextEncode', inputs: { text: negText || '', clip: clipRef } };

            // 5) 空 latent
            nodes['5'] = { class_type: 'EmptyLatentImage', inputs: { width: w, height: h, batch_size: 1 } };

            // 6) KSampler
            nodes['3'] = { class_type: 'KSampler', inputs: {
                seed: seed, steps: steps, cfg: cfgScale, sampler_name: sampler, scheduler: scheduler, denoise: 1.0,
                model: modelRef, positive: ['6', 0], negative: ['7', 0], latent_image: ['5', 0]
            }};

            // 6.5) 高清修復（ComfyUI 直連專屬）：base latent → 潛空間放大 → 二次低重繪採樣補細節
            let latentRef = ['3', 0];
            const _hr = options.comfyHires;
            if (_hr && parseFloat(_hr.scale) > 1) {
                const upId = String(nid++);
                nodes[upId] = { class_type: 'LatentUpscaleBy', inputs: { samples: ['3', 0], upscale_method: 'nearest-exact', scale_by: parseFloat(_hr.scale) } };
                const ks2 = String(nid++);
                const hd = (_hr.denoise != null ? parseFloat(_hr.denoise) : 0.45);
                nodes[ks2] = { class_type: 'KSampler', inputs: {
                    seed: seed, steps: steps, cfg: cfgScale, sampler_name: sampler, scheduler: scheduler, denoise: hd,
                    model: modelRef, positive: ['6', 0], negative: ['7', 0], latent_image: [upId, 0]
                }};
                latentRef = [ks2, 0];
            }

            // 7) VAE：空=用 checkpoint 內建；有填=VAELoader
            let vaeRef = ['4', 2];
            if (cfg.vae && String(cfg.vae).trim()) {
                const id = String(nid++);
                nodes[id] = { class_type: 'VAELoader', inputs: { vae_name: cfg.vae } };
                vaeRef = [id, 0];
            }
            nodes['8'] = { class_type: 'VAEDecode', inputs: { samples: latentRef, vae: vaeRef } };

            // 8.5) FaceDetailer 修臉（場景插圖用，options.comfyFaceDetailer）
            let imageRef = ['8', 0];
            if (options.comfyFaceDetailer) {
                imageRef = this._addFaceDetailerNodes(nodes, { image: ['8', 0], model: modelRef, clip: clipRef, vae: vaeRef, positive: ['6', 0], negative: ['7', 0] }, nid, { cfg: 7.0, sampler_name: 'dpmpp_2m', scheduler: 'karras' });
            }

            // 9) 存圖
            nodes['9'] = { class_type: 'SaveImage', inputs: { filename_prefix: 'Aurelia', images: imageRef } };

            return nodes;
        },

        // 內部組 Flux API workflow（UNETLoader + DualCLIPLoader + FluxGuidance + 16通道 latent）
        _buildFluxWorkflow: function(posText, negText, type, options, cfg) {
            const w = parseInt(options.width  || cfg.width  || 1024) || 1024;
            const h = parseInt(options.height || cfg.height || 1024) || 1024;
            const steps = parseInt(cfg.steps) || 20;
            const sampler = cfg.sampler || 'euler';
            const scheduler = cfg.scheduler || 'simple';
            const guidance = (cfg.guidance != null ? parseFloat(cfg.guidance) : 3.5) || 3.5;
            let seed = (cfg.seed != null && Number(cfg.seed) >= 0) ? Number(cfg.seed) : Math.floor(Math.random() * 1e15);
            if (options.seed) seed = options.seed;

            const nodes = {};
            let nid = 100;
            // 載入：UNET(Flux 模型) + 雙 CLIP(clip_l + t5xxl, type=flux) + VAE(ae)
            nodes['4']  = { class_type: 'UNETLoader',     inputs: { unet_name: cfg.model || '', weight_dtype: 'default' } };
            nodes['11'] = { class_type: 'DualCLIPLoader', inputs: { clip_name1: cfg.fluxClipL || 'clip_l.safetensors', clip_name2: cfg.fluxT5 || 't5xxl_fp8_e4m3fn.safetensors', type: 'flux' } };
            nodes['10'] = { class_type: 'VAELoader',      inputs: { vae_name: cfg.fluxAe || 'ae.safetensors' } };
            let modelRef = ['4', 0];
            let clipRef  = ['11', 0];

            // LoRA 串接（Flux LoRA 也走 LoraLoader）
            (cfg.loras || []).forEach((L) => {
                if (!L || !L.on || !L.name) return;
                const id = String(nid++);
                nodes[id] = {
                    class_type: 'LoraLoader',
                    inputs: {
                        lora_name: L.name,
                        strength_model: (L.strengthModel != null ? parseFloat(L.strengthModel) : 1) || 0,
                        strength_clip:  (L.strengthClip  != null ? parseFloat(L.strengthClip)  : 1) || 0,
                        model: modelRef, clip: clipRef
                    }
                };
                modelRef = [id, 0]; clipRef = [id, 1];
            });

            // 正向 → FluxGuidance（取代 CFG）；負向（Flux 多半空，但節點要在）
            nodes['6']  = { class_type: 'CLIPTextEncode', inputs: { text: posText || '', clip: clipRef } };
            nodes['22'] = { class_type: 'FluxGuidance',   inputs: { conditioning: ['6', 0], guidance: guidance } };
            nodes['7']  = { class_type: 'CLIPTextEncode', inputs: { text: negText || '', clip: clipRef } };

            // Flux 用 16 通道 latent
            nodes['5'] = { class_type: 'EmptySD3LatentImage', inputs: { width: w, height: h, batch_size: 1 } };

            // KSampler：Flux 固定 cfg=1（引導靠 FluxGuidance）
            nodes['3'] = { class_type: 'KSampler', inputs: {
                seed: seed, steps: steps, cfg: 1.0, sampler_name: sampler, scheduler: scheduler, denoise: 1.0,
                model: modelRef, positive: ['22', 0], negative: ['7', 0], latent_image: ['5', 0]
            }};

            // 高清修復（Flux）：潛空間放大 → 二次低重繪採樣（cfg 維持 1，引導靠 FluxGuidance）
            let latentRef = ['3', 0];
            const _hr = options.comfyHires;
            if (_hr && parseFloat(_hr.scale) > 1) {
                const upId = String(nid++);
                nodes[upId] = { class_type: 'LatentUpscaleBy', inputs: { samples: ['3', 0], upscale_method: 'nearest-exact', scale_by: parseFloat(_hr.scale) } };
                const ks2 = String(nid++);
                const hd = (_hr.denoise != null ? parseFloat(_hr.denoise) : 0.45);
                nodes[ks2] = { class_type: 'KSampler', inputs: {
                    seed: seed, steps: steps, cfg: 1.0, sampler_name: sampler, scheduler: scheduler, denoise: hd,
                    model: modelRef, positive: ['22', 0], negative: ['7', 0], latent_image: [upId, 0]
                }};
                latentRef = [ks2, 0];
            }

            nodes['8'] = { class_type: 'VAEDecode', inputs: { samples: latentRef, vae: ['10', 0] } };
            let imageRef = ['8', 0];
            if (options.comfyFaceDetailer) {
                imageRef = this._addFaceDetailerNodes(nodes, { image: ['8', 0], model: modelRef, clip: clipRef, vae: ['10', 0], positive: ['22', 0], negative: ['7', 0] }, nid, { cfg: 1.0, sampler_name: 'euler', scheduler: 'simple' });
            }
            nodes['9'] = { class_type: 'SaveImage', inputs: { filename_prefix: 'Aurelia', images: imageRef } };
            return nodes;
        },

        // 內部組 Anima API workflow（UNETLoader + 單 CLIPLoader[qwen, type=stable_diffusion] + VAELoader[qwen]）
        // 對位官方 image_anima_base_v1 範本：載入像 Flux（三檔分離），但採樣走標準正負向＋CFG（非 FluxGuidance）；
        // latent 用標準 EmptyLatentImage（非 SD3 16 通道，範本如此）；自然語言提示詞。
        _buildAnimaWorkflow: function(posText, negText, type, options, cfg) {
            const w = parseInt(options.width  || cfg.width  || 1024) || 1024;
            const h = parseInt(options.height || cfg.height || 1024) || 1024;
            const steps = parseInt(cfg.steps) || 30;
            // CFG 直接吃面板，但夾在 Anima 安全區（1~6）；超出（例如 SDXL 殘留的 6.5/7）→ 自動回 4 防過曝燒圖
            const _c = parseFloat(cfg.cfg);
            const cfgScale = (_c >= 1 && _c <= 6) ? _c : 4.0;
            // 採樣器/排程器：直接吃面板；留空才退 Anima 官方推薦 er_sde/simple
            const sampler   = cfg.sampler   || 'er_sde';
            const scheduler = cfg.scheduler || 'simple';
            let seed = (cfg.seed != null && Number(cfg.seed) >= 0) ? Number(cfg.seed) : Math.floor(Math.random() * 1e15);
            if (options.seed) seed = options.seed;

            const nodes = {};
            let nid = 100;
            // 載入：UNET(Anima 本體) + 單 CLIP(qwen 文字編碼器, type=stable_diffusion) + VAE(qwen)
            nodes['4']  = { class_type: 'UNETLoader', inputs: { unet_name: cfg.model || '', weight_dtype: 'default' } };
            nodes['11'] = { class_type: 'CLIPLoader', inputs: { clip_name: cfg.animaClip || 'qwen_3_06b_base.safetensors', type: 'stable_diffusion' } };
            nodes['10'] = { class_type: 'VAELoader',  inputs: { vae_name: cfg.animaVae || 'qwen_image_vae.safetensors' } };
            let modelRef = ['4', 0];
            let clipRef  = ['11', 0];

            // LoRA 串接（Anima LoRA 也走 LoraLoader）
            (cfg.loras || []).forEach((L) => {
                if (!L || !L.on || !L.name) return;
                const id = String(nid++);
                nodes[id] = {
                    class_type: 'LoraLoader',
                    inputs: {
                        lora_name: L.name,
                        strength_model: (L.strengthModel != null ? parseFloat(L.strengthModel) : 1) || 0,
                        strength_clip:  (L.strengthClip  != null ? parseFloat(L.strengthClip)  : 1) || 0,
                        model: modelRef, clip: clipRef
                    }
                };
                modelRef = [id, 0]; clipRef = [id, 1];
            });

            // 提示詞編碼（標準正負向 + CFG，不走 FluxGuidance）
            nodes['6'] = { class_type: 'CLIPTextEncode', inputs: { text: posText || '', clip: clipRef } };
            nodes['7'] = { class_type: 'CLIPTextEncode', inputs: { text: negText || '', clip: clipRef } };

            // 標準 4 通道 latent（對位官方範本，非 SD3）
            nodes['5'] = { class_type: 'EmptyLatentImage', inputs: { width: w, height: h, batch_size: 1 } };

            nodes['3'] = { class_type: 'KSampler', inputs: {
                seed: seed, steps: steps, cfg: cfgScale, sampler_name: sampler, scheduler: scheduler, denoise: 1.0,
                model: modelRef, positive: ['6', 0], negative: ['7', 0], latent_image: ['5', 0]
            }};

            // 高清修復：潛空間放大 → 二次低重繪採樣（cfg/採樣器維持 Anima 設定）
            let latentRef = ['3', 0];
            const _hr = options.comfyHires;
            if (_hr && parseFloat(_hr.scale) > 1) {
                const upId = String(nid++);
                nodes[upId] = { class_type: 'LatentUpscaleBy', inputs: { samples: ['3', 0], upscale_method: 'nearest-exact', scale_by: parseFloat(_hr.scale) } };
                const ks2 = String(nid++);
                const hd = (_hr.denoise != null ? parseFloat(_hr.denoise) : 0.45);
                nodes[ks2] = { class_type: 'KSampler', inputs: {
                    seed: seed, steps: steps, cfg: cfgScale, sampler_name: sampler, scheduler: scheduler, denoise: hd,
                    model: modelRef, positive: ['6', 0], negative: ['7', 0], latent_image: [upId, 0]
                }};
                latentRef = [ks2, 0];
            }

            nodes['8'] = { class_type: 'VAEDecode', inputs: { samples: latentRef, vae: ['10', 0] } };
            let imageRef = ['8', 0];
            if (options.comfyFaceDetailer) {
                imageRef = this._addFaceDetailerNodes(nodes, { image: ['8', 0], model: modelRef, clip: clipRef, vae: ['10', 0], positive: ['6', 0], negative: ['7', 0] }, nid, { cfg: cfgScale, sampler_name: sampler, scheduler: scheduler });
            }
            nodes['9'] = { class_type: 'SaveImage', inputs: { filename_prefix: 'Aurelia', images: imageRef } };
            return nodes;
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
            try { win.AURELIA_USAGE && win.AURELIA_USAGE.bumpImg(); } catch (e) {}   // 生圖計數
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

            // 尺寸：預設 1024x1024，但接受 options 傳入
            // scene / char 都是人物插圖類型；item / pet 是物品類型
            const isChar = (type === 'char' || type === 'scene');
            let width  = options.width  || 1024;
            let height = options.height || 1024;
            // 🛡️ 防超免費尺寸：NAI Opus 免 Anlas 上限 ≈ 1024×1024(1,048,576px)。超過就等比縮回上限、避免誤設大圖扣點數。
            //    config.novelai.capFreeSize === false 才放行大圖（想花 Anlas 出大圖的人自己關）。
            if (cfg.capFreeSize !== false) {
                const _freePx = 1024 * 1024;
                if (width * height > _freePx) {
                    const _s = Math.sqrt(_freePx / (width * height));
                    const _w = Math.max(64, Math.round(width  * _s / 64) * 64);
                    const _h = Math.max(64, Math.round(height * _s / 64) * 64);
                    console.warn(`[ImageManager] 🛡️ NAI 尺寸 ${width}x${height} 超過免費上限 → 縮到 ${_w}x${_h}（防扣 Anlas；要出大圖請到 NAI 設定關「防超免費尺寸」）`);
                    width = _w; height = _h;
                }
            }
            // 🔒 NAI 鐵規則：寬高必須是 64 的倍數，否則伺服器直接回 500 Internal Server Error。
            //    （例：自訂 1020×1020 非 64 倍數 → NAI 500；這裡 round 到最近的 64 倍數 → 1024×1024，使用者無感）
            width  = Math.max(64, Math.round(width  / 64) * 64);
            height = Math.max(64, Math.round(height / 64) * 64);

            // 底詞：NAI Danbooru tag 格式（設定可自訂）
            // scene / char 已由呼叫方（getScene/getAvatar）預先 join avatarBasePrompt，
            // 這裡再前置 NAI 品質底詞（masterpiece, best quality…）
            // options.raw = true 完全跳過底詞 / 負詞注入（立繪用，自己帶模板）
            let finalPrompt = prompt;
            if (!options.raw) {
                if (isChar && cfg.charBasePrompt) {
                    finalPrompt = cfg.charBasePrompt + ', ' + prompt;
                } else if (!isChar && cfg.itemBasePrompt) {
                    finalPrompt = cfg.itemBasePrompt + ', ' + prompt;
                }
            }

            // 負向提示詞：優先使用呼叫方傳入的 options.negativePrompt（使用者自訂），
            // 否則按類型使用預設值
            const negativePrompt = options.negativePrompt ||
                (options.raw ? '' :
                    (isChar
                        ? (cfg.charNegPrompt || 'nsfw, lowres, bad anatomy, bad hands, extra fingers, missing fingers, worst quality, low quality, jpeg artifacts, signature, watermark, blurry')
                        : (cfg.itemNegPrompt || 'person, human, body, face, hands, worst quality, low quality, blurry, watermark, text')));

            const model   = cfg.model    || 'nai-diffusion-3';
            const isV4    = model.includes('nai-diffusion-4');
            const seed    = Math.floor(Math.random() * 9999999999);

            // 從用戶設定讀取，fallback 到安全預設值
            const sampler       = cfg.sampler       || 'k_euler_ancestral';
            const scale         = cfg.scale         ?? 5;
            let   steps         = cfg.steps         ?? 28;
            // 🛡️ 防超免費步數：跟尺寸保險同一個開關（capFreeSize）→ 步數夾在 28 內不扣 Anlas；想衝高步數就到 NAI 設定關掉那個開關
            if (cfg.capFreeSize !== false) steps = Math.min(steps, 28);
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
                const _emsg = (error && error.message) || String(error);
                console.error('[ImageManager] ❌ NAI 失敗，回退 Pollinations:', _emsg);
                // 🔎 把 NAI 真實錯誤碼/內文彈到畫面（console 唯讀看不到）→ 撞錯誤立刻見真章：
                //    併發限制是 429/"concurrent"；500=NAI 伺服器錯誤；400=prompt/參數問題；402=Anlas 不足。各自對策不同。
                this._lastNaiError = { msg: _emsg, type: type, at: '' };
                try {
                    const _tr = (win.toastr || window.toastr || (window.parent && window.parent.toastr));
                    if (_tr) {
                        const _concur = /\b429\b|concurrent|conflict|too many|rate.?limit/i.test(_emsg);
                        if (_concur) {
                            // 拼車時一批圖會同時撞 429、一張一張連噴 → 30 秒內只報一次，避免洗版（仍每張都退/略過、只是不重複彈窗）
                            const _now = Date.now();
                            if (_now - _last429ToastAt > 30000) {
                                _last429ToastAt = _now;
                                _tr.error('NAI 併發衝突（多半是拼車同時生圖）→ 錯開幾秒按 🔄 重試', 'NAI 429 併發', { timeOut: 8000 });
                            }
                        }
                        else _tr.warning('NAI 生圖失敗（非併發）：' + _emsg, 'NAI 錯誤', { timeOut: 8000 });
                    }
                } catch (_) {}
                // 🎯 插圖(scene)：NAI 失敗「不」回退 Pollinations —— NAI 是 Danbooru tag、Pollinations 是自然語言，
                //    格式不相容、硬退會生出垃圾圖。寧可這張略過（上游 _doFetchScene/顯示端都 if(url) 判空、不插破圖；可按 🔄 重生）。
                if (type === 'scene') {
                    console.warn('[ImageManager] scene 插圖 NAI 失敗 → 不回退 Pollinations（提示詞不相容），略過此張');
                    return null;
                }
                // 回退時補上 Pollinations 底詞，確保風格一致
                let fallbackPrompt = prompt;
                if (type === 'char' && this.config.pollinations.charBasePrompt) {
                    fallbackPrompt = this.config.pollinations.charBasePrompt + ', ' + prompt;
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
            try { win.AURELIA_USAGE && win.AURELIA_USAGE.bumpImg(); } catch (e) {}   // 生圖計數（背景）
            console.log(`[ImageManager] 🚀 OS 接收原始 prompt: ${rawPrompt.substring(0, 50)}...`);

            let translatedPrompt = rawPrompt;
            const isChinese = /[\u4e00-\u9fa5]/.test(rawPrompt);

            if (isChinese && win.TranslationManager) {
                try {
                    // 用纯 translate：translateForImageGeneration 会硬加 photorealistic 风格词，跟下方 negative prompt 打架
                    const _tr = await win.TranslationManager.translate(rawPrompt, 'zh', 'en');
                    translatedPrompt = (_tr && String(_tr).trim()) ? _tr : rawPrompt;  // 翻譯回空→用原文，絕不送空 prompt
                } catch (e) {}
            }

            // 🔥 把翻譯後的 prompt 寫回 options，讓 caller（vn_core 等）拿來存 cache
            options.translatedPrompt = translatedPrompt;

            // 🗑️ 已拔除硬塞的 defaultPrompt style，直接使用翻譯後的原意
            const optimizedPrompt = translatedPrompt;

            // ✅ 優先使用外部傳入的 Negative Prompt，否則用預設防護詞
            const negativePrompt = options.negativePrompt || 'people, person, man, woman, child, crowd, character, pedestrian, anime screencap, cel shading, flat color, simple lines, sketch, low quality, worst quality, blurry, overexposed, photography, photorealistic, 3d render';

            // 🌄 背景接口由「死物桶」(背景・物品 來源) 決定（2026-06-12）：預設 Pollinations；
            //    選 NAI / ComfyUI直連 / 酒館原生 就走對應接口（給只有 NAI、沒 GitHub 被 poll 限流的人）。
            //    bgBasePrompt/bgNegPrompt 已由呼叫方(getBg) 處理好，這裡照搬。
            const _bgSvc = (typeof this.serviceFor === 'function') ? this.serviceFor('bg') : 'pollinations';
            if (_bgSvc !== 'pollinations') {
                const _bgOpts = { ...options, negativePrompt: negativePrompt, width: options.width || 1024, height: options.height || 1024 };
                if (_bgSvc === 'novelai' && this.config.novelai && this.config.novelai.token) {
                    // raw=true：跳過 NAI 物品底詞(white background/no background…會毀背景)，只用 bgBasePrompt + bgNegPrompt
                    return await this._genNovelAI(optimizedPrompt, 'bg', { ..._bgOpts, raw: true });
                } else if (_bgSvc === 'comfyui_direct') {
                    return await this._genComfyuiDirect(optimizedPrompt, 'bg', _bgOpts);
                } else if (_bgSvc === 'tavern_sd') {
                    return await this._genTavernSd(optimizedPrompt, 'bg', _bgOpts);
                }
                // 接口未就緒(例如 NAI 沒填 token) → 往下 fall through 回 Pollinations，不讓背景生不出來
            }

            // 預設：Pollinations
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
            // 物品專用底詞/負詞（與角色分離），整條走統一 generate 路由：serviceFor('item')=死物桶，
            //   pollinations / comfyui_direct / novelai / tavern_sd 全由 generate 內部分派 → 換哪條線路物品都跟著走。
            const itemBase = this.config.pollinations.itemBasePrompt;
            const finalPrompt = itemBase ? itemBase + ', ' + prompt : prompt;
            const negPrompt = options.negativePrompt || this.config.pollinations.itemNegPrompt || undefined;
            return this.generate(finalPrompt, 'item', {
                ...options,
                width: options.width || 512,
                height: options.height || 512,
                negativePrompt: negPrompt,
                raw: true
            });
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