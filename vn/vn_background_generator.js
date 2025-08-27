/**
 * VN背景圖片生成器 v1.0
 * 
 * 功能：
 * - 解析Scene標籤中的圖片生成提示詞
 * - 調用Pollinations AI API生成背景圖片
 * - 管理背景圖片設置和配置
 * - 與VN面板整合顯示生成的背景
 */

// =======================================================================
//                            背景生成器配置
// =======================================================================

const BACKGROUND_GENERATOR_CONFIG = {
    // 默認設置
    defaultModel: 'pollinations-flux',
    defaultSize: '1024x1024',
    defaultQuality: 'standard',
    
    // 支持的模型
    supportedModels: {
        'pollinations-flux': {
            name: 'FLUX - 推薦模型',
            description: '生成速度快，品質優秀',
            apiUrl: 'https://image.pollinations.ai/prompt',
            requiresApiKey: false
        },
        'pollinations-kontext': {
            name: 'Kontext',
            description: '適合複雜場景和細節豐富的圖像',
            apiUrl: 'https://image.pollinations.ai/prompt',
            requiresApiKey: false
        },
        'pollinations-turbo': {
            name: 'Turbo',
            description: '超快速生成，適合快速測試和迭代',
            apiUrl: 'https://image.pollinations.ai/prompt',
            requiresApiKey: false
        }
    },
    
    // 圖片尺寸選項
    sizeOptions: [
        '1024x1024',
        '1024x768',
        '768x1024',
        '1280x720',
        '720x1280'
    ]
};

// =======================================================================
//                            背景生成器狀態
// =======================================================================

let backgroundGeneratorState = {
    isEnabled: true,
    currentModel: BACKGROUND_GENERATOR_CONFIG.defaultModel,
    currentSize: BACKGROUND_GENERATOR_CONFIG.defaultSize,
    currentQuality: BACKGROUND_GENERATOR_CONFIG.defaultQuality,
    lastGeneratedImage: null,
    generationHistory: [],
    isGenerating: false
};

// =======================================================================
//                            本地存儲管理
// =======================================================================

function loadBackgroundGeneratorConfig() {
    try {
        const saved = localStorage.getItem('vn_background_generator_config');
        if (saved) {
            const config = JSON.parse(saved);
            backgroundGeneratorState = { ...backgroundGeneratorState, ...config };
            // console.log('[背景生成器] 已載入本地配置');
        }
    } catch (error) {
        console.error('[背景生成器] 載入配置失敗:', error);
    }
}

function saveBackgroundGeneratorConfig() {
    try {
        localStorage.setItem('vn_background_generator_config', JSON.stringify(backgroundGeneratorState));
        // console.log('[背景生成器] 配置已保存');
    } catch (error) {
        console.error('[背景生成器] 保存配置失敗:', error);
    }
}

// =======================================================================
//                            核心生成功能
// =======================================================================

/**
 * 生成背景圖片
 * @param {string} prompt - 圖片生成提示詞
 * @param {string} facilityName - 設施名稱（用於記錄）
 * @returns {Promise<string>} 生成的圖片URL
 */
async function generateBackgroundImage(prompt, facilityName = '') {
    try {
        if (!backgroundGeneratorState.isEnabled) {
            // console.log('[背景生成器] 背景生成功能已禁用');
            return null;
        }
        
        if (backgroundGeneratorState.isGenerating) {
            // console.log('[背景生成器] 正在生成中，請稍候...');
            return null;
        }
        
        // console.log('[背景生成器] 開始智能背景圖片獲取:', { facilityName, prompt });
        backgroundGeneratorState.isGenerating = true;
        
        // 1. 首先檢查用戶選擇的模式（上傳模式或URL模式）
        const savedSettings = JSON.parse(localStorage.getItem('vn_material_settings') || '{}');
        const isUploadMode = savedSettings.sourceMode === 'upload';
        
        if (isUploadMode) {
            // 上傳模式：檢查IndexedDB中的上傳圖片
            const uploadedBackground = await checkUploadedBackground(facilityName);
            if (uploadedBackground) {
                // console.log('[背景生成器] 找到上傳模式背景:', uploadedBackground);
                return { url: uploadedBackground, source: 'upload' };
            }
        } else {
            // URL模式：檢查URL背景圖片
            const urlBackground = await checkURLBackground(facilityName);
            if (urlBackground) {
                // console.log('[背景生成器] 找到URL模式背景:', urlBackground);
                return { url: urlBackground, source: 'url' };
            }
        }
        
        // 2. 檢查AI緩存是否有已生成的圖片
        const cachedImage = await checkAICache(facilityName);
        if (cachedImage) {
            // console.log('[背景生成器] 找到AI緩存背景:', cachedImage);
            return { url: cachedImage, source: 'cache' };
        }
        
        // 3. 生成新的AI圖片
        if (!prompt || prompt.trim() === '') {
            console.error('[背景生成器] 提示詞為空，無法生成AI圖片');
            return null;
        }
        
        // console.log('[背景生成器] 開始生成新的AI背景圖片');
        
        // 優化提示詞
        const optimizedPrompt = optimizeImagePrompt(prompt);
        
        // 生成圖片URL
        const imageUrl = await generateImageWithPollinations(optimizedPrompt);
        
        if (imageUrl) {
            // 保存到AI緩存，使用設施名稱作為標籤
            await saveToAICache(facilityName, imageUrl, optimizedPrompt);
            
            // 記錄生成歷史
            const generationRecord = {
                timestamp: Date.now(),
                prompt: prompt,
                optimizedPrompt: optimizedPrompt,
                facilityName: facilityName,
                imageUrl: imageUrl,
                model: backgroundGeneratorState.currentModel,
                size: backgroundGeneratorState.currentSize
            };
            
            backgroundGeneratorState.lastGeneratedImage = imageUrl;
            backgroundGeneratorState.generationHistory.unshift(generationRecord);
            
            // 限制歷史記錄數量
            if (backgroundGeneratorState.generationHistory.length > 20) {
                backgroundGeneratorState.generationHistory = backgroundGeneratorState.generationHistory.slice(0, 20);
            }
            
            // console.log('[背景生成器] 新AI背景圖片生成成功:', imageUrl);
            
            return { url: imageUrl, source: 'generated' };
        } else {
            throw new Error('AI圖片生成失敗');
        }
        
    } catch (error) {
        console.error('[背景生成器] 智能背景圖片獲取失敗:', error);
        return null;
    } finally {
        backgroundGeneratorState.isGenerating = false;
    }
}

// =======================================================================
//                            智能緩存系統
// =======================================================================

/**
 * 檢查上傳模式背景
 * @param {string} facilityName - 設施名稱
 * @returns {Promise<string|null>} 背景URL或null
 */
async function checkUploadedBackground(facilityName) {
    try {
        if (!window.materialImageManager) {
            // console.log('[背景生成器] materialImageManager未初始化，無法檢查上傳圖片');
            return null;
        }
        
        const images = await window.materialImageManager.getImagesByCategory('background');
        const cleanName = facilityName.replace(/[^\w\u4e00-\u9fff]/g, '_');
        
        // 查找匹配的背景圖片
        const matchedImage = images.find(img => {
            const imgName = img.name.replace(/\.[^/.]+$/, ''); // 移除文件擴展名
            return imgName === cleanName || 
                   imgName.includes(cleanName) || 
                   img.label === cleanName;
        });
        
        if (matchedImage) {
            // console.log('[背景生成器] 找到上傳背景:', matchedImage.name);
            return matchedImage.url;
        }
        
        // console.log('[背景生成器] 上傳背景不存在:', cleanName);
        return null;
    } catch (error) {
        console.error('[背景生成器] 檢查上傳背景時出錯:', error);
        return null;
    }
}

/**
 * 檢查URL模式背景
 * @param {string} facilityName - 設施名稱
 * @returns {Promise<string|null>} 背景URL或null
 */
async function checkURLBackground(facilityName) {
    try {
        // 使用與VN處理器相同的URL生成邏輯
        const cleanName = facilityName.replace(/[^\w\u4e00-\u9fff]/g, '_');
        const url = `https://nancywang3641.github.io/sound-files/location_img/${cleanName}.jpeg`;
        
        // 檢查圖片是否存在
        const exists = await checkImageExists(url);
        if (exists) {
            // console.log('[背景生成器] URL背景存在:', url);
            return url;
        }
        
        // console.log('[背景生成器] URL背景不存在:', url);
        return null;
    } catch (error) {
        console.error('[背景生成器] 檢查URL背景時出錯:', error);
        return null;
    }
}

/**
 * 檢查AI緩存
 * @param {string} facilityName - 設施名稱
 * @returns {Promise<string|null>} 緩存的圖片URL或null
 */
async function checkAICache(facilityName) {
    try {
        const cache = getAICache();
        const cachedItem = cache[facilityName];
        
        if (cachedItem && cachedItem.imageUrl) {
            // 檢查緩存的圖片是否仍然有效
            const exists = await checkImageExists(cachedItem.imageUrl);
            if (exists) {
                // console.log('[背景生成器] AI緩存有效:', cachedItem.imageUrl);
                return cachedItem.imageUrl;
            } else {
                // console.log('[背景生成器] AI緩存圖片已失效，移除:', facilityName);
                delete cache[facilityName];
                saveAICache(cache);
            }
        }
        
        return null;
    } catch (error) {
        console.error('[背景生成器] 檢查AI緩存時出錯:', error);
        return null;
    }
}

/**
 * 保存到AI緩存
 * @param {string} facilityName - 設施名稱
 * @param {string} imageUrl - 圖片URL
 * @param {string} prompt - 提示詞
 */
async function saveToAICache(facilityName, imageUrl, prompt) {
    try {
        const cache = getAICache();
        cache[facilityName] = {
            imageUrl: imageUrl,
            prompt: prompt,
            timestamp: Date.now()
        };
        saveAICache(cache);
        // console.log('[背景生成器] 已保存到AI緩存:', facilityName, imageUrl);
    } catch (error) {
        console.error('[背景生成器] 保存AI緩存時出錯:', error);
    }
}

/**
 * 檢查圖片是否存在
 * @param {string} url - 圖片URL
 * @returns {Promise<boolean>} 圖片是否存在
 */
function checkImageExists(url) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            // console.log('[背景生成器] 圖片檢查成功:', url);
            resolve(true);
        };
        img.onerror = () => {
            // console.log('[背景生成器] 圖片檢查失敗:', url);
            resolve(false);
        };
        img.src = url;
        // 增加超時時間到10秒，避免網絡延遲導致誤判
        setTimeout(() => {
            // console.log('[背景生成器] 圖片檢查超時:', url);
            resolve(false);
        }, 10000);
    });
}

/**
 * 獲取AI緩存
 * @returns {Object} 緩存對象
 */
function getAICache() {
    try {
        const cache = localStorage.getItem('vn_ai_background_cache');
        return cache ? JSON.parse(cache) : {};
    } catch (error) {
        console.error('[背景生成器] 獲取AI緩存時出錯:', error);
        return {};
    }
}

/**
 * 保存AI緩存
 * @param {Object} cache - 緩存對象
 */
function saveAICache(cache) {
    try {
        localStorage.setItem('vn_ai_background_cache', JSON.stringify(cache));
    } catch (error) {
        console.error('[背景生成器] 保存AI緩存時出錯:', error);
    }
}

/**
 * 清除AI緩存
 */
function clearAICache() {
    try {
        localStorage.removeItem('vn_ai_background_cache');
        // console.log('[背景生成器] AI緩存已清除');
    } catch (error) {
        console.error('[背景生成器] 清除AI緩存時出錯:', error);
    }
}

// =======================================================================
//                            圖片生成功能
// =======================================================================

/**
 * 使用Pollinations AI生成圖片
 * @param {string} prompt - 圖片生成提示詞
 * @returns {Promise<string>} 生成的圖片URL
 */
async function generateImageWithPollinations(prompt) {
    try {
        const model = backgroundGeneratorState.currentModel;
        const size = backgroundGeneratorState.currentSize;
        
        // 解析尺寸
        const [width, height] = size.split('x').map(Number);
        
        // 優化提示詞，移除特殊字符
        const cleanPrompt = prompt
            .replace(/[^\w\s,.-]/g, '') // 移除特殊字符，保留字母、數字、空格、逗號、點、連字符
            .replace(/\s+/g, ' ') // 多個空格替換為單個空格
            .trim();
        
        // 編碼提示詞
        const encodedPrompt = encodeURIComponent(cleanPrompt);
        
        // 構建API URL
        let apiUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${Date.now()}`;
        
        // 添加模型參數
        if (model === 'pollinations-flux') {
            apiUrl += '&model=flux';
        } else if (model === 'pollinations-kontext') {
            apiUrl += '&model=kontext';
        } else if (model === 'pollinations-turbo') {
            apiUrl += '&model=turbo';
        }
        
        // console.log('[背景生成器] Pollinations AI URL:', apiUrl);
        // console.log('[背景生成器] 原始提示詞:', prompt);
        // console.log('[背景生成器] 清理後提示詞:', cleanPrompt);
        
        // 返回直接URL（Pollinations AI不需要實際的API調用）
        return apiUrl;
        
    } catch (error) {
        console.error('[背景生成器] Pollinations AI調用失敗:', error);
        throw error;
    }
}

/**
 * 優化圖片生成提示詞
 * @param {string} prompt - 原始提示詞
 * @returns {string} 優化後的提示詞
 */
function optimizeImagePrompt(prompt) {
    try {
        // 移除多餘的空格和換行
        let optimized = prompt.trim().replace(/\s+/g, ' ');
        
        // 預設提示詞 - 統一畫風
        const defaultPrefix = "2D, tiled graphics, modern, anime style, Horizontal perspective, no human, no character";
        
        // 組合最終提示詞：預設提示詞 + AI輸出的提示詞
        optimized = `${defaultPrefix} ${optimized}`;
        
        // 限制長度
        if (optimized.length > 500) {
            optimized = optimized.substring(0, 500);
        }
        
        // console.log('[背景生成器] 提示詞優化:', { original: prompt, optimized });
        return optimized;
        
    } catch (error) {
        console.error('[背景生成器] 提示詞優化失敗:', error);
        return prompt;
    }
}

/**
 * 通知VN面板更新背景
 * @param {string} imageUrl - 生成的圖片URL
 * @param {string} facilityName - 設施名稱
 */
function notifyVNPanelBackgroundUpdate(imageUrl, facilityName) {
    try {
        // 查找VN面板iframe
        const vnIframe = findVNPanelIframe();
        if (vnIframe && vnIframe.contentWindow) {
            // 發送消息到VN面板
            vnIframe.contentWindow.postMessage({
                type: 'background-image-update',
                imageUrl: imageUrl,
                facilityName: facilityName,
                timestamp: Date.now()
            }, '*');
            
            // console.log('[背景生成器] 已通知VN面板更新背景');
        }
    } catch (error) {
        console.error('[背景生成器] 通知VN面板失敗:', error);
    }
}

/**
 * 查找VN面板iframe
 * @returns {HTMLIFrameElement|null}
 */
function findVNPanelIframe() {
    try {
        // 嘗試多種方式查找VN面板
        let vnIframe = window.parent.document.querySelector('.vn-panel-iframe');
        
        if (!vnIframe) {
            const mapIframe = window.parent.document.querySelector('.map-panel-iframe');
            if (mapIframe && mapIframe.contentDocument) {
                vnIframe = mapIframe.contentDocument.querySelector('#vn-panel-iframe');
            }
        }
        
        if (!vnIframe) {
            const mapContainer = window.parent.document.querySelector('#map-panel-placeholder');
            if (mapContainer) {
                const mapFrameInContainer = mapContainer.querySelector('iframe');
                if (mapFrameInContainer && mapFrameInContainer.contentDocument) {
                    vnIframe = mapFrameInContainer.contentDocument.querySelector('#vn-panel-iframe');
                }
            }
        }
        
        return vnIframe;
    } catch (error) {
        console.error('[背景生成器] 查找VN面板失敗:', error);
        return null;
    }
}

// =======================================================================
//                            設置管理
// =======================================================================

/**
 * 更新背景生成器設置
 * @param {Object} settings - 新的設置
 */
function updateBackgroundGeneratorSettings(settings) {
    try {
        backgroundGeneratorState = { ...backgroundGeneratorState, ...settings };
        saveBackgroundGeneratorConfig();
        // console.log('[背景生成器] 設置已更新:', settings);
    } catch (error) {
        console.error('[背景生成器] 更新設置失敗:', error);
    }
}

/**
 * 獲取當前設置
 * @returns {Object} 當前設置
 */
function getBackgroundGeneratorSettings() {
    return { ...backgroundGeneratorState };
}

/**
 * 重置為默認設置
 */
function resetBackgroundGeneratorSettings() {
    backgroundGeneratorState = {
        isEnabled: true,
        currentModel: BACKGROUND_GENERATOR_CONFIG.defaultModel,
        currentSize: BACKGROUND_GENERATOR_CONFIG.defaultSize,
        currentQuality: BACKGROUND_GENERATOR_CONFIG.defaultQuality,
        lastGeneratedImage: null,
        generationHistory: [],
        isGenerating: false
    };
    saveBackgroundGeneratorConfig();
    // console.log('[背景生成器] 設置已重置為默認值');
}

// =======================================================================
//                            歷史記錄管理
// =======================================================================

/**
 * 獲取生成歷史
 * @returns {Array} 生成歷史記錄
 */
function getGenerationHistory() {
    return [...backgroundGeneratorState.generationHistory];
}

/**
 * 清除生成歷史
 */
function clearGenerationHistory() {
    backgroundGeneratorState.generationHistory = [];
    saveBackgroundGeneratorConfig();
    // console.log('[背景生成器] 生成歷史已清除');
}

// =======================================================================
//                            測試功能
// =======================================================================

/**
 * 測試Pollinations URL是否有效
 * @param {string} imageUrl - 要測試的圖片URL
 * @returns {Promise<boolean>} 是否有效
 */
async function testPollinationsUrl(imageUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        const timeout = setTimeout(() => {
            console.warn('[背景生成器] Pollinations URL測試超時:', imageUrl);
            resolve(false);
        }, 10000); // 10秒超時
        
        img.onload = () => {
            clearTimeout(timeout);
            // console.log('[背景生成器] Pollinations URL測試成功:', imageUrl);
            resolve(true);
        };
        
        img.onerror = () => {
            clearTimeout(timeout);
            console.error('[背景生成器] Pollinations URL測試失敗:', imageUrl);
            resolve(false);
        };
        
        img.src = imageUrl;
    });
}

/**
 * 測試背景生成功能
 */
async function testBackgroundGeneration() {
    try {
        // console.log('[背景生成器] 開始測試背景生成功能');
        
        const testPrompt = "night, abandoned industrial edge, ruined factory wall, collapsed chimney, chain-link fence, overgrown weeds, distant streetlight";
        const result = await generateBackgroundImage(testPrompt, '測試設施');
        
        if (result) {
            // console.log('[背景生成器] 測試成功:', result);
            
            // 測試Pollinations URL是否有效
            if (result.url && result.url.includes('pollinations.ai')) {
                // console.log('[背景生成器] 測試Pollinations URL有效性...');
                const isValid = await testPollinationsUrl(result.url);
                // console.log('[背景生成器] Pollinations URL有效性:', isValid);
            }
            
            return result;
        } else {
            console.error('[背景生成器] 測試失敗');
            return null;
        }
    } catch (error) {
        console.error('[背景生成器] 測試過程中發生錯誤:', error);
        return null;
    }
}

// =======================================================================
//                            初始化
// =======================================================================

function initBackgroundGenerator() {
    try {
        loadBackgroundGeneratorConfig();
        // console.log('[背景生成器] 初始化完成');
        // console.log('[背景生成器] 當前設置:', backgroundGeneratorState);
    } catch (error) {
        console.error('[背景生成器] 初始化失敗:', error);
    }
}

// =======================================================================
//                            全局暴露
// =======================================================================

// 暴露到全局作用域
window.vnBackgroundGenerator = {
    // 核心功能
    generateBackgroundImage,
    updateSettings: updateBackgroundGeneratorSettings,
    getSettings: getBackgroundGeneratorSettings,
    resetSettings: resetBackgroundGeneratorSettings,
    
    // 歷史記錄
    getHistory: getGenerationHistory,
    clearHistory: clearGenerationHistory,
    
    // 測試功能
    test: testBackgroundGeneration,
    testUrl: testPollinationsUrl,
    
    // 配置
    config: BACKGROUND_GENERATOR_CONFIG,
    
    // 狀態
    getState: () => ({ ...backgroundGeneratorState })
};

// 自動初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBackgroundGenerator);
} else {
    initBackgroundGenerator();
}

// console.log('[背景生成器] 模組已加載完成');
