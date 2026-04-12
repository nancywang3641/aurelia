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
                // MyMemory Translation API（免费，每天1000次请求）
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

                // 构建请求URL
                const params = new URLSearchParams({
                    q: text,
                    langpair: `${from}|${to}`
                });
                const url = `${this.state.services.mymemory.apiUrl}?${params.toString()}`;

                // 发送请求
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                
                if (data.responseStatus === 200 && data.responseData && data.responseData.translatedText) {
                    const translatedText = data.responseData.translatedText.trim();
                    
                    // 保存到缓存
                    this.addToCache(cacheKey, translatedText);
                    
                    logger.debug(`翻译成功: "${text.substring(0, 30)}..." -> "${translatedText.substring(0, 30)}..."`);
                    return translatedText;
                } else {
                    throw new Error('翻译API返回无效数据');
                }
            } catch (error) {
                logger.warn('MyMemory翻译失败:', error);
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
                
                if (data && data[0] && data[0][0] && data[0][0][0]) {
                    const translatedText = data[0][0][0].trim();
                    
                    // 保存到缓存
                    this.addToCache(cacheKey, translatedText);
                    
                    logger.debug(`翻译成功（Google）: "${text.substring(0, 30)}..." -> "${translatedText.substring(0, 30)}..."`);
                    return translatedText;
                } else {
                    throw new Error('Google翻译API返回无效数据');
                }
            } catch (error) {
                logger.warn('Google翻译失败:', error);
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

            // 如果目标语言已经是英文，且文本不是中文，直接返回
            if (to === 'en' && !this.isChinese(text)) {
                logger.debug('文本不是中文，直接返回');
                return text;
            }

            // 如果源语言和目标语言相同，直接返回
            if (from === to) {
                return text;
            }

            try {
                // 优先使用 MyMemory
                if (this.state.services.mymemory.enabled) {
                    try {
                        return await this.translateWithMyMemory(text, from, to);
                    } catch (error) {
                        logger.warn('MyMemory翻译失败，尝试Google翻译');
                    }
                }

                // 备用：使用 Google Translate
                if (this.state.services.google.enabled) {
                    try {
                        return await this.translateWithGoogle(text, from, to);
                    } catch (error) {
                        logger.error('所有翻译服务都失败');
                        throw error;
                    }
                }

                // 如果所有服务都不可用，返回原文
                logger.warn('没有可用的翻译服务，返回原文');
                return text;
            } catch (error) {
                logger.error('翻译失败:', error);
                // 翻译失败时返回原文，避免阻塞流程
                return text;
            }
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

