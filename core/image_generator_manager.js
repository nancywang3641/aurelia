/**
 * ===== 图片生成管理器 =====
 * 统一管理所有面板的图片生成功能
 * 支持：Pollinations（免费）和 NovelAI（付费）
 * 可被多个面板使用：echo/chat/dating/map/forum
 */

(function() {
    'use strict';

    const logger = {
        info: (msg, ...args) => console.log(`[图片生成管理器] ${msg}`, ...args),
        warn: (msg, ...args) => console.warn(`[图片生成管理器] ${msg}`, ...args),
        error: (msg, ...args) => console.error(`[图片生成管理器] ${msg}`, ...args),
        debug: (msg, ...args) => console.log(`[图片生成管理器] DEBUG: ${msg}`, ...args)
    };

    /**
     * 图片生成管理器
     */
    const ImageGeneratorManager = {
        state: {
            // 面板设置：每个面板可以选择使用哪个服务
            // 注意：dating、map、vn、avatar 通过按钮触发，不需要 enabled 开关
            panelSettings: {
                echo: { enabled: false, service: 'pollinations' },
                chat: { enabled: false, service: 'pollinations' },
                dating: { enabled: true, service: 'pollinations' }, // 通过按钮触发，enabled 不影响功能
                map: { enabled: true, service: 'pollinations' }, // 通过按钮触发，enabled 不影响功能
                forum: { enabled: false, service: 'pollinations' },
                vn: { enabled: true, service: 'novelai' }, // 通过按钮触发，enabled 不影响功能
                avatar: { enabled: true, service: 'pollinations' } // Avatar 头像生成，通过 [Avatar:...] 触发
            },
            // Pollinations 配置
            pollinations: {
                apiUrl: 'https://image.pollinations.ai/prompt',
                defaultModel: 'flux', // 可选: flux, kontext, turbo
                defaultSize: '512x512',
                defaultPrompt: 'manhwa illustration style, acrylic painting texture, detailed anime-inspired illustration, trending illustration, fashionable illustrations, flat illustrations, rich in detail, dramatic light and shadow contrasts. delicate gradients, Mucha-inspired color scheme. 8K quality with excellent lighting and shadows.'
            },
            // NovelAI 配置
            novelai: {
                apiUrl: 'https://api.novelai.net',
                imageApiUrl: 'https://image.novelai.net',
                token: '',
                settings: {
                    model: 'nai-diffusion-4-5-full',
                    size: { width: 512, height: 512 },
                    steps: 28,
                    scale: 5,
                    sampler: 'k_euler_ancestral',
                    seed: -1, // -1 表示随机
                    ucPreset: 1,
                    qualityToggle: true,
                    autoSmea: false,
                    smeaDyn: false,
                    positivePrompt: 'masterpiece, best quality, amazing quality, very aesthetic, absurdres',
                    negativePrompt: 'lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry',
                    corsProxy: 'corsproxy.io',
                    customProxyUrl: ''
                }
            }
        },

        /**
         * 初始化
         */
        async init() {
            try {
                logger.info('初始化图片生成管理器...');
                await this.loadSettings();
                logger.info('图片生成管理器初始化完成');
                return true;
            } catch (error) {
                logger.error('初始化失败: ' + error.message);
                return false;
            }
        },

        /**
         * 从 localStorage 加载设置
         */
        async loadSettings() {
            try {
                const saved = localStorage.getItem('aurelia_image_generator_config');
                if (saved) {
                    const config = JSON.parse(saved);
                    if (config.panelSettings) {
                        this.state.panelSettings = { ...this.state.panelSettings, ...config.panelSettings };
                    }
                    if (config.pollinations) {
                        this.state.pollinations = { ...this.state.pollinations, ...config.pollinations };
                    }
                    if (config.novelai) {
                        this.state.novelai = { ...this.state.novelai, ...config.novelai };
                    }
                    logger.info('设置已从 localStorage 加载');
                }
            } catch (error) {
                logger.error('加载设置失败: ' + error.message);
            }
        },

        /**
         * 保存设置到 localStorage
         */
        async saveSettings() {
            try {
                const config = {
                    panelSettings: this.state.panelSettings,
                    pollinations: this.state.pollinations,
                    novelai: this.state.novelai
                };
                localStorage.setItem('aurelia_image_generator_config', JSON.stringify(config));
                logger.info('设置已保存');
                return true;
            } catch (error) {
                logger.error('保存设置失败: ' + error.message);
                return false;
            }
        },

        /**
         * 更新面板设置
         */
        updatePanelSettings(panel, enabled, service) {
            if (this.state.panelSettings[panel]) {
                this.state.panelSettings[panel].enabled = enabled;
                if (service) {
                    this.state.panelSettings[panel].service = service;
                }
            }
        },

        /**
         * 更新 NovelAI 设置
         */
        updateNovelAISettings(settings) {
            this.state.novelai = { ...this.state.novelai, ...settings };
        },

        /**
         * 更新 Pollinations 设置
         */
        updatePollinationsSettings(settings) {
            this.state.pollinations = { ...this.state.pollinations, ...settings };
        },

        /**
         * 获取面板使用的服务
         */
        getPanelService(panel) {
            const panelSetting = this.state.panelSettings[panel];
            if (!panelSetting) {
                return null;
            }
            // Dating、Map、VN、Avatar 面板特殊处理：始终返回服务（通过按钮触发，不需要检查 enabled）
            if (panel === 'dating' || panel === 'map' || panel === 'vn' || panel === 'avatar') {
                return panelSetting.service || 'pollinations';
            }
            // 其他面板需要检查 enabled 状态
            if (!panelSetting.enabled) {
                return null; // 面板未启用图片生成
            }
            return panelSetting.service;
        },

        /**
         * 优化提示词（根据服务类型）
         */
        optimizePrompt(character, service = 'pollinations') {
            if (service === 'novelai') {
                return this.optimizePromptForNovelAI(character);
            } else {
                return this.optimizePromptForPollinations(character);
            }
        },

        /**
         * 为 NovelAI 优化提示词（标签式）
         */
        optimizePromptForNovelAI(character) {
            const tags = [];
            
            // 性别标签
            if (character.gender) {
                if (character.gender === '男' || character.gender === 'male' || character.gender.toLowerCase().includes('male')) {
                    tags.push('1boy', 'male focus');
                } else if (character.gender === '女' || character.gender === 'female' || character.gender.toLowerCase().includes('female')) {
                    tags.push('1girl', 'female focus');
                } else {
                    tags.push('1person');
                }
            } else {
                tags.push('1person');
            }
            
            // 年龄标签
            if (character.age) {
                const ageMatch = character.age.match(/(\d+)/);
                if (ageMatch) {
                    const ageNum = parseInt(ageMatch[1]);
                    if (ageNum < 20) tags.push('teenager');
                    else if (ageNum < 30) tags.push('young adult');
                    else if (ageNum < 40) tags.push('adult');
                    else tags.push('mature');
                }
            }
            
            // 构图和细节
            tags.push('portrait', 'upper body', 'solo', 'detailed face', 'beautiful detailed eyes', 'looking at viewer');
            
            // 职业
            if (character.occupation) {
                tags.push(character.occupation);
            }
            
            // 质量标签
            tags.push('masterpiece', 'best quality', 'high quality', 'absurdres', 'beautiful', 'aesthetic', 'professional lighting');
            
            return tags.join(', ');
        },

        /**
         * 为 Pollinations 优化提示词（自然语言）
         */
        optimizePromptForPollinations(character) {
            const parts = [];
            
            if (character.name) parts.push(character.name);
            if (character.gender) {
                parts.push(character.gender === '男' ? 'male character' : 'female character');
            }
            if (character.age) {
                const ageMatch = character.age.match(/(\d+)/);
                if (ageMatch) {
                    const ageNum = parseInt(ageMatch[1]);
                    if (ageNum < 25) parts.push('young adult');
                    else if (ageNum < 35) parts.push('adult');
                    else parts.push('mature');
                }
            }
            if (character.occupation) parts.push(character.occupation);
            
            // 兴趣标签
            if (character.interests && character.interests.length > 0) {
                const interestTags = character.interests
                    .map(tag => tag.replace(/[📚🎵🏃✈️🎬📷🍜🎮🎨✍️☕🐾🔧🎸🌵🏍️🌌🏋️🍸🗣️💻🤖📖🧩🐶🐱🌸🎭]/g, '').trim())
                    .filter(tag => tag.length > 0)
                    .slice(0, 3);
                if (interestTags.length > 0) {
                    parts.push(interestTags.join(', '));
                }
            }
            
            let characterPrompt = parts.join(', ');
            if (characterPrompt) {
                characterPrompt = `portrait of ${characterPrompt}, character design`;
            } else {
                characterPrompt = 'character portrait';
            }
            
            return `${characterPrompt}, ${this.state.pollinations.defaultPrompt}`;
        },

        /**
         * 使用 Pollinations 生成图片
         */
        generateWithPollinations(character, promptText = null) {
            try {
                let prompt;
                
                // 如果提供了自定义提示词，使用它；否则自动生成
                if (promptText && promptText.trim()) {
                    prompt = promptText.trim();
                } else {
                    prompt = this.optimizePromptForPollinations(character);
                }
                
                // 确保追加默认提示词（风格）
                const defaultPrompt = this.state.pollinations.defaultPrompt;
                if (defaultPrompt && defaultPrompt.trim()) {
                    // 如果提示词中还没有包含默认提示词，则追加
                    if (!prompt.includes(defaultPrompt.trim())) {
                        prompt = `${prompt}, ${defaultPrompt.trim()}`;
                    }
                }
                
                const seed = Math.floor(Math.random() * 1000000000);
                const config = this.state.pollinations;
                const [width, height] = config.defaultSize.split('x').map(Number);
                const encodedPrompt = encodeURIComponent(prompt.trim());
                
                const apiUrl = `${config.apiUrl}/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&model=${config.defaultModel}`;
                
                logger.debug(`Pollinations 生成URL: ${character?.name || '未知'}`);
                logger.debug(`Pollinations 提示词: ${prompt}`);
                return apiUrl;
            } catch (error) {
                logger.error('Pollinations 生成失败:', error);
                return null;
            }
        },

        /**
         * 获取 ToastManager（支持 iframe）
         */
        getToastManager() {
            if (window.ToastManager) return window.ToastManager;
            if (window.parent && window.parent !== window && window.parent.ToastManager) {
                return window.parent.ToastManager;
            }
            return null;
        },

        /**
         * Blob 转 Base64（辅助函数）
         */
        blobToBase64(blob) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        },

        /**
         * 使用 NovelAI 生成图片
         */

        async generateWithNovelAI(character, promptText = null, customSettings = null) {
            try {
                const token = this.state.novelai.token;
                if (!token || token.trim() === '') {
                    logger.warn('NovelAI Token 未设置');
                    const toastManager = this.getToastManager();
                    if (toastManager) {
                        toastManager.warning('NovelAI Token 未设置，请在 API 面板的"图片生成"标签页中设置');
                    }
                    return null;
                }
                
                const settings = customSettings || this.state.novelai.settings;
                
                // 优先使用提供的提示词，否则使用 AI 提供的，最后使用自动生成的
                let basePrompt;
                if (promptText) {
                    basePrompt = promptText.trim();
                } else if (character._avatarPrompt && character._avatarPrompt.trim()) {
                    basePrompt = character._avatarPrompt.trim();
                } else {
                    basePrompt = this.optimizePromptForNovelAI(character);
                }
                
                // Seed 逻辑
                const seed = (settings.seed !== undefined && settings.seed > 0) 
                    ? settings.seed 
                    : Math.floor(Math.random() * 1000000000);
                
                // 构建完整提示词
                let finalPrompt = basePrompt;
                if (settings.positivePrompt && settings.positivePrompt.trim()) {
                    finalPrompt = `${basePrompt}, ${settings.positivePrompt.trim()}`;
                }
                
                const negativePrompt = settings.negativePrompt && settings.negativePrompt.trim() 
                    ? settings.negativePrompt.trim() 
                    : '';
                
                // 构建请求体
                const requestBody = {
                    input: finalPrompt,
                    model: settings.model || 'nai-diffusion-4-5-full',
                    action: 'generate',
                    parameters: {
                        params_version: 3,
                        width: settings.size.width,
                        height: settings.size.height,
                        scale: settings.scale,
                        sampler: settings.sampler,
                        steps: settings.steps,
                        seed: seed,
                        n_samples: 1,
                        ucPreset: settings.ucPreset || 1,
                        qualityToggle: settings.qualityToggle !== false,
                        autoSmea: settings.autoSmea === true,
                        smeaDyn: settings.smeaDyn === true,
                        dynamic_thresholding: false,
                        controlnet_strength: 1,
                        legacy: false,
                        add_original_image: true,
                        cfg_rescale: 0,
                        noise_schedule: 'karras',
                        legacy_v3_extend: false,
                        skip_cfg_above_sigma: null,
                        use_coords: false,
                        legacy_uc: false,
                        normalize_reference_strength_multiple: true,
                        inpaintImg2ImgStrength: 1,
                        characterPrompts: [],
                        v4_prompt: {
                            caption: {
                                base_caption: finalPrompt,
                                char_captions: []
                            },
                            use_coords: false,
                            use_order: true
                        },
                        v4_negative_prompt: {
                            caption: {
                                base_caption: negativePrompt,
                                char_captions: []
                            },
                            legacy_uc: false
                        },
                        negative_prompt: negativePrompt,
                        deliberate_euler_ancestral_bug: false,
                        prefer_brownian: true
                    }
                };
                
                // 构建 API URL（可能使用 CORS 代理）
                let apiUrl = `${this.state.novelai.imageApiUrl}/ai/generate-image`;
                if (settings.corsProxy && settings.corsProxy !== '') {
                    if (settings.corsProxy === 'custom' && settings.customProxyUrl) {
                        apiUrl = `${settings.customProxyUrl}${apiUrl}`;
                    } else if (settings.corsProxy === 'corsproxy.io') {
                        apiUrl = `https://corsproxy.io/?${encodeURIComponent(apiUrl)}`;
                    } else if (settings.corsProxy === 'allorigins.win') {
                        apiUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(apiUrl)}`;
                    }
                }
                
                // 发送请求
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify(requestBody)
                });
                
                if (!response.ok) {
                    const errorText = await response.text();
                    logger.error(`NovelAI API 请求失败: ${response.status}`, errorText.substring(0, 200));
                    throw new Error(`NovelAI API 请求失败: ${response.status} ${response.statusText}`);
                }
                
                // 处理 SSE 流式响应
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                let imageData = null;
                let chunks = [];
                
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    chunks.push(value);
                    try {
                        buffer += decoder.decode(value, { stream: true });
                    } catch (e) {
                        // 二进制数据，继续收集
                    }
                }
                
                // 尝试从 SSE 文本中提取图片
                const sseMatches = buffer.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/);
                if (sseMatches && sseMatches[1]) {
                    imageData = `data:image/png;base64,${sseMatches[1]}`;
                    logger.debug('从 SSE 文本中提取图片成功');
                } else {
                    // 合并所有 chunks 为 Uint8Array
                    const allChunks = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
                    let offset = 0;
                    for (const chunk of chunks) {
                        allChunks.set(chunk, offset);
                        offset += chunk.length;
                    }
                    
                    // 首先检查是否是直接的 PNG 文件（PNG 文件头：89 50 4E 47）
                    if (allChunks.length >= 4 && 
                        allChunks[0] === 0x89 && 
                        allChunks[1] === 0x50 && 
                        allChunks[2] === 0x4E && 
                        allChunks[3] === 0x47) {
                        // 直接是 PNG 文件
                        logger.debug('检测到直接 PNG 数据');
                        const base64 = btoa(String.fromCharCode(...allChunks));
                        imageData = `data:image/png;base64,${base64}`;
                    } else {
                        // 尝试从 ZIP 中提取
                        try {
                            imageData = await this.extractPNGFromZIP(allChunks);
                            if (!imageData) {
                                // ZIP 解压缩失败，尝试直接使用数据（可能是 PNG）
                                logger.warn('ZIP 解压缩失败，尝试直接使用数据作为 PNG');
                                const base64 = btoa(String.fromCharCode(...allChunks));
                                imageData = `data:image/png;base64,${base64}`;
                            }
                        } catch (zipError) {
                            logger.warn('ZIP 解压缩出错，尝试直接使用数据:', zipError);
                            // 如果 ZIP 解压缩失败，尝试直接使用数据作为 PNG
                            try {
                                const base64 = btoa(String.fromCharCode(...allChunks));
                                imageData = `data:image/png;base64,${base64}`;
                            } catch (base64Error) {
                                logger.error('Base64 转换失败:', base64Error);
                                throw new Error('无法从响应中提取图片数据');
                            }
                        }
                    }
                }
                
                if (!imageData) {
                    throw new Error('无法从响应中提取图片。请检查 API Token 是否正确，或尝试使用 Pollinations 服务。');
                }
                
                logger.debug('NovelAI 生成成功');
                return imageData;
                
            } catch (error) {
                logger.error('NovelAI 生成失败:', error);
                const toastManager = this.getToastManager();
                if (toastManager) {
                    const errorMsg = error.message || 'NovelAI 图片生成失败';
                    if (errorMsg.includes('Token') || errorMsg.includes('401') || errorMsg.includes('403')) {
                        toastManager.error('NovelAI Token 无效或已过期，请检查 API 面板中的设置');
                    } else if (errorMsg.includes('截断') || errorMsg.includes('truncated')) {
                        toastManager.warning('图片数据接收不完整，请重试或检查网络连接');
                    } else {
                        toastManager.error(`NovelAI 生成失败: ${errorMsg}`);
                    }
                }
                return null;
            }
        },

        /**
         * 从 ZIP 中提取 PNG（NovelAI 可能返回 ZIP）
         * 🔥 完全复制原本工作的逻辑
         */
        async extractPNGFromZIP(zipData) {
            try {
                logger.debug('[ZIP解压] 开始解压 ZIP 文件...');
                logger.debug('[ZIP解压] ZIP 文件大小:', zipData.length, 'bytes');
                
                // 检测 ZIP 文件（ZIP 文件头：50 4B）
                if (zipData.length < 4 || zipData[0] !== 0x50 || zipData[1] !== 0x4B) {
                    logger.debug('不是 ZIP 文件格式');
                    return null; // 不是 ZIP 文件
                }
                
                // 🔥 使用 DataView 读取 ZIP 结构（与原本代码一致）
                const view = new DataView(zipData.buffer, zipData.byteOffset, zipData.byteLength);
                
                // 读取文件名长度 (offset 26, little-endian)
                const filenameLength = view.getUint16(26, true);
                const extraFieldLength = view.getUint16(28, true);
                
                logger.debug('[ZIP解压] 文件名长度:', filenameLength);
                logger.debug('[ZIP解压] Extra field 长度:', extraFieldLength);
                
                // 读取压缩方法
                const compressionMethod = view.getUint16(8, true);
                logger.debug('[ZIP解压] 压缩方法:', compressionMethod === 8 ? 'DEFLATE' : compressionMethod === 0 ? 'STORED' : 'Unknown');
                
                // 读取 flags
                const flags = view.getUint16(6, true);
                const hasDataDescriptor = (flags & 0x08) !== 0;
                logger.debug('[ZIP解压] Flags:', flags.toString(16), '使用 data descriptor:', hasDataDescriptor);
                
                // 读取压缩后大小和未压缩大小
                let compressedSize = view.getUint32(18, true);
                let uncompressedSize = view.getUint32(22, true);
                logger.debug('[ZIP解压] Local header 压缩大小:', compressedSize, 'bytes');
                logger.debug('[ZIP解压] Local header 未压缩大小:', uncompressedSize, 'bytes');
                
                // 🔥 如果使用 data descriptor，需要从 Central Directory 读取大小
                if (hasDataDescriptor && compressedSize === 0) {
                    logger.debug('[ZIP解压] 检测到 data descriptor，搜索 Central Directory...');
                    
                    // 从文件末尾向前搜索 Central Directory (50 4B 01 02)
                    let cdOffset = -1;
                    for (let i = zipData.length - 22; i >= 0; i--) {
                        if (zipData[i] === 0x50 && zipData[i+1] === 0x4B && 
                            zipData[i+2] === 0x01 && zipData[i+3] === 0x02) {
                            cdOffset = i;
                            logger.debug('[ZIP解压] ✅ 找到 Central Directory at:', cdOffset);
                            break;
                        }
                    }
                    
                    if (cdOffset !== -1) {
                        // Central Directory 结构中的压缩大小在 offset 20
                        const cdView = new DataView(zipData.buffer, cdOffset);
                        compressedSize = cdView.getUint32(20, true);
                        uncompressedSize = cdView.getUint32(24, true);
                        logger.debug('[ZIP解压] 从 Central Directory 读取压缩大小:', compressedSize, 'bytes');
                        logger.debug('[ZIP解压] 从 Central Directory 读取未压缩大小:', uncompressedSize, 'bytes');
                    } else {
                        throw new Error('未找到 Central Directory');
                    }
                }
                
                // 跳过文件名和 extra field
                const dataOffset = 30 + filenameLength + extraFieldLength;
                logger.debug('[ZIP解压] 数据偏移:', dataOffset);
                
                // 提取压缩数据
                const compressedData = zipData.slice(dataOffset, dataOffset + compressedSize);
                logger.debug('[ZIP解压] 提取压缩数据，大小:', compressedData.length, 'bytes');
                
                // 🔥 使用浏览器内置的 DecompressionStream 解压
                if (compressionMethod === 8) {
                    logger.debug('[ZIP解压] 使用 DecompressionStream 解压 DEFLATE-RAW...');
                    
                    const blob = new Blob([compressedData]);
                    // ZIP 使用 raw DEFLATE（没有 zlib 头），必须用 'deflate-raw'
                    const decompressedStream = blob.stream().pipeThrough(new DecompressionStream('deflate-raw'));
                    const decompressedBlob = await new Response(decompressedStream).blob();
                    
                    logger.debug('[ZIP解压] ✅ 解压完成，大小:', decompressedBlob.size, 'bytes');
                    logger.debug('[ZIP解压] 预期大小:', uncompressedSize, 'bytes');
                    
                    // 验证解压后的大小
                    if (decompressedBlob.size !== uncompressedSize) {
                        logger.warn('[ZIP解压] ⚠️ 解压后大小不匹配！');
                    }
                    
                    // 转换为 base64
                    const base64 = await this.blobToBase64(decompressedBlob);
                    logger.debug('[ZIP解压] ✅ PNG 转换为 base64 完成');
                    
                    return base64;
                } else if (compressionMethod === 0) {
                    // STORED - 未压缩，直接使用
                    logger.debug('[ZIP解压] 数据未压缩，直接使用');
                    const pngBlob = new Blob([compressedData], { type: 'image/png' });
                    const base64 = await this.blobToBase64(pngBlob);
                    logger.debug('[ZIP解压] ✅ PNG 转换为 base64 完成');
                    return base64;
                } else {
                    throw new Error('不支持的压缩方法: ' + compressionMethod);
                }
            } catch (error) {
                logger.error('[ZIP解压] ❌ 失败:', error);
                throw error;
            }
        },

        /**
         * 生成图片（统一入口）
         */
        async generateImage(panel, character, promptText = null) {
            const service = this.getPanelService(panel);
            if (!service) {
                logger.warn(`面板 ${panel} 未启用图片生成`);
                return null;
            }
            
            if (service === 'novelai') {
                return await this.generateWithNovelAI(character, promptText);
            } else {
                return this.generateWithPollinations(character, promptText);
            }
        }
    };

    // 暴露到全局
    window.ImageGeneratorManager = ImageGeneratorManager;

    // 自动初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => ImageGeneratorManager.init());
    } else {
        ImageGeneratorManager.init();
    }

    logger.info('图片生成管理器已载入');

})();

