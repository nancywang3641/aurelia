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
            },
            // 酒館原生 /sd：走使用者在酒館 Image Generation 擴展設好的後端；以下全可空，空=用酒館自己的設定
            tavernSd: { negative: '', width: '', height: '', steps: '', cfg: '' },
            // ComfyUI 直連：奧瑞亞內部組 workflow，走酒館伺服器代理(/api/sd/comfy/generate)生圖
            comfyuiDirect: {
                url: 'http://127.0.0.1:8188', modelType: 'checkpoint', model: '', vae: '', sampler: 'euler', scheduler: 'normal',
                steps: 28, cfg: 6.5, width: 1024, height: 1024, seed: -1, clipSkip: 0,
                basePrompt: '', negPrompt: '', loras: [],
                // Flux 模式專用
                fluxClipL: 'clip_l.safetensors', fluxT5: 't5xxl_fp8_e4m3fn.safetensors', fluxAe: 'ae.safetensors', guidance: 3.5
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
                        console.warn(`[ImageManager] 舊模型 ${this.config.pollinations.model} 已失效，重置為 zimage`);
                        this.config.pollinations.model = 'zimage';
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
                        englishPrompt = await win.TranslationManager.translate(prompt, 'zh', 'en');
                        console.log(`[ImageManager] 翻譯結果: ${englishPrompt}`);
                    }
                } catch(e) {
                    console.warn('[ImageManager] 翻譯失敗，使用原文:', e);
                }
            }

            // 🔥 步驟 2: 路由判斷（char/item/scene 有 NAI token 走 NAI；背景底板走 generateBackgroundAsync）
            // options.provider 可「單次」覆蓋全域 service（給 VN 面板各自選 NAI / POLL AI 用）；沒給就維持全域
            const isNaiType = (type === 'char' || type === 'item' || type === 'scene');
            const service = (['novelai', 'pollinations', 'tavern_sd', 'comfyui_direct'].includes(options.provider)) ? options.provider : this.config.service;
            let result;
            if (service === 'tavern_sd') {
                // 酒館原生 /sd：raw prompt（不塞奧瑞亞底詞，尊重朋友的 SD 設定）；失敗回 null，不偷偷換來源
                console.log(`[ImageManager] Final Prompt [${type}→TavernSD]: ${englishPrompt}`);
                result = await this._genTavernSd(englishPrompt, type, options);
            } else if (service === 'comfyui_direct') {
                // ComfyUI 直連：奧瑞亞內部組 workflow（底詞由 comfyuiDirect.basePrompt 控制，不套 poll ai 底詞）
                console.log(`[ImageManager] Final Prompt [${type}→ComfyUIDirect]: ${englishPrompt}`);
                result = await this._genComfyuiDirect(englishPrompt, type, options);
            } else if (isNaiType && service === 'novelai' && this.config.novelai.token) {
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
                this._urlCache.set(cacheKey, result);
                if (type === 'scene') this._recordUsage();  // 只統計場景插圖
            }
            return result;
        },

        // --- 用量統計：每次「場景插圖」真實生成記一筆，供「會員方案划算度」估算 ---
        _recordUsage: function() {
            try {
                const KEY = 'os_image_usage';
                let u = {};
                try { u = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch(e) {}
                u.total = (u.total || 0) + 1;
                const ym = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
                u.byMonth = u.byMonth || {};
                u.byMonth[ym] = (u.byMonth[ym] || 0) + 1;
                localStorage.setItem(KEY, JSON.stringify(u));
            } catch(e) { /* 統計失敗不影響生成流程 */ }
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

            try {
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
            }
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
            if (!cfg.model) {
                try { win.toastr && win.toastr.warning('請先在「ComfyUI 直連」選一個模型', 'ComfyUI 直連'); } catch (e) {}
                return null;
            }

            // 酒館驗證 headers（含 CSRF），走伺服器代理免 CORS
            const ctx = (win.SillyTavern && win.SillyTavern.getContext) ? win.SillyTavern.getContext() : null;
            const headers = (ctx && ctx.getRequestHeaders && ctx.getRequestHeaders()) || { 'Content-Type': 'application/json' };

            const posText = [cfg.basePrompt, prompt].filter(Boolean).join(', ');
            const negText = options.negativePrompt || cfg.negPrompt || '';
            // 場景插圖(type==='scene')：依設定自動套高清修復 + FaceDetailer 修臉
            // （頭像每輪生不套以免變慢；立繪走自己的開關，不經這裡）
            let _opts = options;
            if (type === 'scene') {
                _opts = Object.assign({}, options);
                if (cfg.sceneHires && !_opts.comfyHires) _opts.comfyHires = { scale: parseFloat(cfg.sceneHiresScale) || 1.5, denoise: 0.45 };
                if (cfg.sceneFaceDetailer) _opts.comfyFaceDetailer = true;
            }
            const wf = this._buildComfyWorkflow(posText, negText, type, _opts, cfg);
            const body = { url: url, prompt: '{"prompt": ' + JSON.stringify(wf) + '}' };

            try {
                const res = await fetch('/api/sd/comfy/generate', { method: 'POST', headers: headers, body: JSON.stringify(body) });
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
                console.error('[ImageManager] ComfyUI 直連錯誤:', error);
                try { win.toastr && win.toastr.error('ComfyUI 連線錯誤：' + (error.message || error), 'ComfyUI 直連'); } catch (e) {}
                return null;
            }
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

        // 加 FaceDetailer 修臉節點（偵測臉→裁出放大重畫→貼回）；回傳修臉後的影像輸出 ref
        // refs: { image, model, clip, vae, positive, negative }；isFlux 決定二次採樣的 cfg/sampler
        _addFaceDetailerNodes: function(nodes, refs, nid, isFlux) {
            const detId = String(nid);
            const fdId  = String(nid + 1);
            nodes[detId] = { class_type: 'UltralyticsDetectorProvider', inputs: { model_name: 'bbox/face_yolov8m.pt' } };
            nodes[fdId] = { class_type: 'FaceDetailer', inputs: {
                image: refs.image, model: refs.model, clip: refs.clip, vae: refs.vae,
                positive: refs.positive, negative: refs.negative, bbox_detector: [detId, 0],
                guide_size: 512, guide_size_for: true, max_size: 1024,
                seed: Math.floor(Math.random() * 1e15), steps: 20,
                cfg: isFlux ? 1.0 : 7.0,
                sampler_name: isFlux ? 'euler' : 'dpmpp_2m',
                scheduler: isFlux ? 'simple' : 'karras',
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
                imageRef = this._addFaceDetailerNodes(nodes, { image: ['8', 0], model: modelRef, clip: clipRef, vae: vaeRef, positive: ['6', 0], negative: ['7', 0] }, nid, false);
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
                imageRef = this._addFaceDetailerNodes(nodes, { image: ['8', 0], model: modelRef, clip: clipRef, vae: ['10', 0], positive: ['22', 0], negative: ['7', 0] }, nid, true);
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
            const width  = options.width  || 1024;
            const height = options.height || 1024;

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
                    translatedPrompt = await win.TranslationManager.translateForImageGeneration(rawPrompt, 'background');
                } catch (e) {}
            }

            // 🔥 把翻譯後的 prompt 寫回 options，讓 caller（vn_core 等）拿來存 cache
            options.translatedPrompt = translatedPrompt;

            // 🗑️ 已拔除硬塞的 defaultPrompt style，直接使用翻譯後的原意
            const optimizedPrompt = translatedPrompt;

            // ✅ 優先使用外部傳入的 Negative Prompt，否則用預設防護詞
            const negativePrompt = options.negativePrompt || 'people, person, man, woman, child, crowd, character, pedestrian, anime screencap, cel shading, flat color, simple lines, sketch, low quality, worst quality, blurry, overexposed, photography, photorealistic, 3d render';

            // 背景永遠走 Pollinations：ComfyUI(/sd) 是角色/頭像取向，畫背景不適合（會塞人物），故不論全域來源是否為 tavern_sd，背景都不走 /sd
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