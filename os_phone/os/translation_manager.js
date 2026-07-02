/**
 * ===== 翻译管理器 =====
 * 自动将中文内容翻译为英文，用于图片生成
 * 使用免费的翻译API，减少AI输出中的ENG_PROMPT需求
 */

(function() {
    'use strict';

    const logger = {
        info: (msg, ...args) => console.log(`[翻译管理器] ${msg}`, ...args),
        warn: (msg, ...args) => console.warn(`[翻译管理器] ${msg}`, ...args),
        error: (msg, ...args) => console.error(`[翻译管理器] ${msg}`, ...args),
        debug: (msg, ...args) => console.log(`[翻译管理器] DEBUG: ${msg}`, ...args)
    };

    /**
     * 翻译管理器
     */
    const TranslationManager = {
        state: {
            // 翻译服务配置
            services: {
                // MyMemory Translation API（免费，按字符数计：匿名每日约5000字符/IP、跨日重置，单次查询上限500字符）
                mymemory: {
                    apiUrl: 'https://api.mymemory.translated.net/get',
                    enabled: true,
                    priority: 1
                },
                // Google Translate（备用，通过网页版，可能不稳定）
                google: {
                    apiUrl: 'https://translate.googleapis.com/translate_a/single',
                    enabled: true,
                    priority: 2
                }
            },
            // 缓存翻译结果（避免重复翻译）
            cache: new Map(),
            // 缓存最大大小
            maxCacheSize: 1000
        },

        /**
         * 检测文本是否为中文
         * @param {string} text - 要检测的文本
         * @returns {boolean} - 是否为中文
         */
        isChinese(text) {
            if (!text || typeof text !== 'string') return false;
            // 检测中文字符（包括简体、繁体、标点）
            const chineseRegex = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;
            return chineseRegex.test(text);
        },

        /**
         * 使用 MyMemory Translation API 翻译
         * @param {string} text - 要翻译的文本
         * @param {string} from - 源语言代码（默认：'zh'）
         * @param {string} to - 目标语言代码（默认：'en'）
         * @returns {Promise<string>} - 翻译后的文本
         */
        async translateWithMyMemory(text, from = 'zh', to = 'en') {
            try {
                const cacheKey = `${text}_${from}_${to}`;
                
                // 检查缓存
                if (this.state.cache.has(cacheKey)) {
                    logger.debug('使用缓存翻译结果');
                    return this.state.cache.get(cacheKey);
                }

                // MyMemory 单次查询硬上限 500 字符，超过必回 403，直接跳过省一次白等
                if (text.length > 500) {
                    throw new Error(`文本 ${text.length} 字符超过 MyMemory 单次 500 上限`);
                }

                // 构建请求URL
                const params = new URLSearchParams({
                    q: text,
                    langpair: `${from}|${to}`
                });
                const url = `${this.state.services.mymemory.apiUrl}?${params.toString()}`;

                // 发送请求
                const response = await fetch(url);
                if (response.status === 429) {
                    this.state.services.mymemory.enabled = false;
                    logger.warn('MyMemory 今日免费额度已用完（按字符数计、跨日重置），本次载入改走 Google');
                    throw new Error('MyMemory 今日免费额度已用完');
                }
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                const status = Number(data && data.responseStatus);
                const rawResult = (data && data.responseData && data.responseData.translatedText) || '';

                if (status === 200 && rawResult && !/MYMEMORY WARNING/i.test(rawResult)) {
                    const translatedText = rawResult.trim();

                    // 退化防呆：中文进去、译文却没吐出任何英字（整段被吃成逗号/符号）＝坏结果，抛出去改走 Google，且不污染缓存
                    if (this._isDegenerate(text, translatedText)) {
                        throw new Error('MyMemory 结果退化：中文被吃成空/符号');
                    }

                    // 保存到缓存
                    this.addToCache(cacheKey, translatedText);

                    logger.debug(`翻译成功: "${text.substring(0, 30)}..." -> "${translatedText.substring(0, 30)}..."`);
                    return translatedText;
                }

                // 额度用尽时 API 回 429（或把 WARNING 塞在 translatedText 里）：本次载入内直接停用，别再每张图白等一趟
                if (status === 429 || /MYMEMORY WARNING/i.test(rawResult)) {
                    this.state.services.mymemory.enabled = false;
                    logger.warn('MyMemory 今日免费额度已用完（按字符数计、跨日重置），本次载入改走 Google');
                }
                throw new Error(`MyMemory 返回 ${status}: ${String((data && data.responseDetails) || rawResult).substring(0, 120)}`);
            } catch (error) {
                logger.warn(`MyMemory翻译失败: ${error && error.message ? error.message : error}`);
                throw error;
            }
        },

        /**
         * 使用 Google Translate（备用方案）
         * @param {string} text - 要翻译的文本
         * @param {string} from - 源语言代码（默认：'zh-CN'）
         * @param {string} to - 目标语言代码（默认：'en'）
         * @returns {Promise<string>} - 翻译后的文本
         */
        async translateWithGoogle(text, from = 'zh-CN', to = 'en') {
            try {
                const cacheKey = `${text}_${from}_${to}`;
                
                // 检查缓存
                if (this.state.cache.has(cacheKey)) {
                    logger.debug('使用缓存翻译结果（Google）');
                    return this.state.cache.get(cacheKey);
                }

                // 构建请求URL
                const params = new URLSearchParams({
                    client: 'gtx',
                    sl: from,
                    tl: to,
                    dt: 't',
                    q: text
                });
                const url = `${this.state.services.google.apiUrl}?${params.toString()}`;

                // 发送请求
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();

                // gtx 按句子分段返回：data[0] = [[译文段, 原文段, ...], ...]，必须全段拼接（只取 [0][0][0] 会把第一段之后整串丢掉）
                if (data && Array.isArray(data[0]) && data[0].length) {
                    const translatedText = data[0].map(seg => (seg && seg[0]) || '').join('').trim();
                    if (!translatedText) {
                        throw new Error('Google翻译API返回空结果');
                    }
                    if (this._isDegenerate(text, translatedText)) {
                        throw new Error('Google 结果退化：中文被吃成空/符号');
                    }

                    // 保存到缓存
                    this.addToCache(cacheKey, translatedText);

                    logger.debug(`翻译成功（Google）: "${text.substring(0, 30)}..." -> "${translatedText.substring(0, 30)}..."`);
                    return translatedText;
                } else {
                    throw new Error('Google翻译API返回无效数据');
                }
            } catch (error) {
                logger.warn(`Google翻译失败: ${error && error.message ? error.message : error}`);
                throw error;
            }
        },

        /**
         * 添加翻译结果到缓存
         * @param {string} key - 缓存键
         * @param {string} value - 翻译结果
         */
        addToCache(key, value) {
            // 如果缓存已满，删除最旧的条目
            if (this.state.cache.size >= this.state.maxCacheSize) {
                const firstKey = this.state.cache.keys().next().value;
                this.state.cache.delete(firstKey);
            }
            this.state.cache.set(key, value);
        },

        /**
         * 翻译文本（自动选择最佳服务）
         * @param {string} text - 要翻译的文本
         * @param {string} from - 源语言代码（默认：'zh'）
         * @param {string} to - 目标语言代码（默认：'en'）
         * @returns {Promise<string>} - 翻译后的文本
         */
        async translate(text, from = 'zh', to = 'en') {
            if (!text || typeof text !== 'string' || text.trim() === '') {
                logger.warn('翻译文本为空');
                return text;
            }

            // 如果源语言和目标语言相同，直接返回
            if (from === to) {
                return text;
            }

            // 如果目标语言已经是英文，且文本不是中文，直接返回
            if (to === 'en' && !this.isChinese(text)) {
                logger.debug('文本不是中文，直接返回');
                return text;
            }

            // 🏷️ 图片 prompt 是 booru 式标签串（英文标签 + 中文标签混排）。整串当中文丢给句子翻译器，中文段会被
            //    吃成空、只剩一排逗号（no characters, no people,,,,,,）——且英文前缀还活着，空值防呆抓不到。
            //    改逐段翻：英文标签原样留、只把含中文的段送去翻、翻不动就留中文（绝不留空）。
            if (to === 'en' && /[,，]/.test(text)) {
                const out = [];
                for (const seg of text.split(/[,，]/)) {
                    const s = seg.trim();
                    if (!s) continue;                                     // 空段丢掉（顺手清掉 ,, 这种连逗号）
                    if (!this.isChinese(s)) { out.push(s); continue; }    // 纯英文标签原样保留
                    let t = s;
                    try { t = await this._translateOne(s, from, to); } catch (e) { t = s; }
                    out.push((t && String(t).trim()) || s);               // 退化/空 → 留中文原段
                }
                return out.join(', ');
            }

            // 单段（无逗号）：直接翻，失败留原文，避免阻塞流程
            try {
                return await this._translateOne(text, from, to);
            } catch (error) {
                logger.error('翻译失败:', error);
                return text;
            }
        },

        /**
         * 单段翻译：MyMemory 优先，坏了/退化就落 Google（服务层已做退化防呆，坏结果会 throw）
         */
        async _translateOne(text, from, to) {
            if (this.state.services.mymemory.enabled) {
                try {
                    return await this.translateWithMyMemory(text, from, to);
                } catch (error) {
                    logger.warn('MyMemory翻译失败，尝试Google翻译');
                }
            }
            if (this.state.services.google.enabled) {
                return await this.translateWithGoogle(text, from, to);   // 失败向上抛，由调用端决定留原文
            }
            logger.warn('没有可用的翻译服务，返回原文');
            return text;
        },

        /**
         * 退化判定：中文进去、译文却没吐出任何拉丁字母（整段被吃成逗号/符号），或整段为空 ＝ 坏结果
         */
        _isDegenerate(input, output) {
            if (!output || !String(output).trim()) return true;
            if (this.isChinese(input) && !/[a-zA-Z]/.test(output)) return true;
            return false;
        },

        /**
         * 为图片生成优化翻译（添加图片生成相关的关键词）
         * @param {string} text - 要翻译的中文文本
         * @param {object} options - 选项
         * @param {string} options.style - 图片风格（如：'realistic', 'anime', 'illustration'）
         * @returns {Promise<string>} - 优化后的英文提示词
         */
        async translateForImageGeneration(text, options = {}) {
            try {
                // 先翻译基本文本
                let translatedText = await this.translate(text, 'zh', 'en');

                // 如果翻译失败或返回原文，尝试添加一些通用的图片生成关键词
                if (translatedText === text && this.isChinese(text)) {
                    logger.warn('翻译失败，使用原文并添加通用关键词');
                    translatedText = text;
                }

                // 添加图片生成相关的关键词（如果需要）
                const style = options.style || 'realistic';
                const styleKeywords = {
                    'realistic': 'photorealistic, high quality, detailed',
                    'anime': 'anime style, manga illustration, detailed',
                    'illustration': 'illustration, artistic, detailed',
                    'cinematic': 'cinematic lighting, dramatic, detailed'
                };

                const keywords = styleKeywords[style] || styleKeywords.realistic;
                
                // 如果翻译后的文本已经包含这些关键词，就不重复添加
                if (!translatedText.toLowerCase().includes(keywords.split(',')[0].trim().toLowerCase())) {
                    translatedText = `${translatedText}, ${keywords}`;
                }

                return translatedText;
            } catch (error) {
                logger.error('图片生成翻译失败:', error);
                // 失败时返回原文，让图片生成服务自己处理
                return text;
            }
        },

        /**
         * 清除缓存
         */
        clearCache() {
            this.state.cache.clear();
            logger.info('翻译缓存已清除');
        }
    };

    // 暴露到全局
    if (typeof window !== 'undefined') {
        window.TranslationManager = TranslationManager;
        logger.info('✅ 翻译管理器已加载');
    }

    // 如果是在 Node.js 环境中
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = TranslationManager;
    }
})();

