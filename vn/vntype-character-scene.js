/**
 * VN Type Character Scene - 手机版角色和场景管理模块 v20.1 (完整修正版)
 * 
 * 包含: 角色立绘管理、背景图片系统、场景切换、角色数据管理
 * 修复: 三种素材模式的正确获取逻辑
 */

// =======================================================================
//                            簡化的背景圖片系統
// =======================================================================

/**
 * 验证图片URL
 */
function validateImageUrl(imageUrl) {
    if (!imageUrl || typeof imageUrl !== 'string') return false;
    const trimmedUrl = imageUrl.trim();
    if (trimmedUrl === '') return false;
    return trimmedUrl.includes('.jpeg') || trimmedUrl.includes('.jpg') || trimmedUrl.includes('.png');
}

/**
 * 根据设施名称生成背景图片URL
 */
async function generateBackgroundUrl(facilityName) {
    const config = getMobileBackgroundConfig();
    if (!facilityName || facilityName.trim() === '') {
        return config.fallbackUrl;
    }
    
    const cleanFacilityName = facilityName.trim();
    
    // 檢查是否使用上傳模式
    const savedSettings = JSON.parse(localStorage.getItem('vn_material_settings') || '{}');
    const isUploadMode = savedSettings.sourceMode === 'upload';
    
    if (isUploadMode && window.materialImageManager) {
        // 上傳模式：從IndexedDB獲取背景圖片
        try {
            const images = await window.materialImageManager.getImagesByCategory('background');
            
            // 查找匹配的背景圖片
            const matchedImage = images.find(img => {
                const imgName = img.name.replace(/\.[^/.]+$/, ''); // 移除文件擴展名
                return imgName === cleanFacilityName || imgName.includes(cleanFacilityName);
            });
            
            if (matchedImage) {
                if (backgroundImageState.debug) {
                    // console.log(`[VN面板-手机版] 從IndexedDB找到背景圖片: ${matchedImage.name}`);
                }
                return matchedImage.url;
            } else {
                if (backgroundImageState.debug) {
                    // console.log(`[VN面板-手机版] IndexedDB中未找到背景圖片，使用URL模式`);
                }
            }
        } catch (error) {
            console.error('[VN面板-手机版] 從IndexedDB獲取背景圖片失敗:', error);
        }
    }
    
    // URL模式或IndexedDB未找到：使用URL構建
    const backgroundUrl = config.baseUrl + cleanFacilityName + config.imageFormat;
    
    if (backgroundImageState.debug) {
        // console.log(`[VN面板-手机版] 生成背景URL: ${cleanFacilityName} -> ${backgroundUrl}`);
    }
    
    return backgroundUrl;
}

/**
 * 通用的IndexedDB圖片查找函數
 */
async function findImageFromIndexedDB(category, label) {
    if (!window.materialImageManager) return null;
    
    try {
        const images = await window.materialImageManager.getImagesByCategory(category);
        const cleanLabel = label.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '');
        
        const matchedImage = images.find(img => {
            const imgName = img.name.replace(/\.[^/.]+$/, '');
            return imgName === cleanLabel || 
                   imgName.includes(cleanLabel) || 
                   img.label === cleanLabel;
        });
        
        return matchedImage ? matchedImage.url : null;
    } catch (error) {
        console.error(`[VN面板-手机版] 從IndexedDB獲取${category}圖片失敗:`, error);
        return null;
    }
}

/**
 * 從URL中提取設施名稱
 * @param {string} imageUrl - 圖片URL
 * @returns {string|null} 設施名稱或null
 */
function getFacilityNameFromUrl(imageUrl) {
    if (!imageUrl || typeof imageUrl !== 'string') {
        return null;
    }
    
    try {
        // 處理AI生成的圖片URL（pollinations.ai）
        if (imageUrl.includes('pollinations.ai')) {
            // 從AI生成的URL中提取設施名稱
            // 嘗試從URL參數中提取設施名稱
            try {
                const url = new URL(imageUrl);
                const prompt = url.searchParams.get('prompt');
                if (prompt) {
                    // 從prompt中提取設施名稱（通常是第一個關鍵詞）
                    const decodedPrompt = decodeURIComponent(prompt);
                    const words = decodedPrompt.split(/[,\s]+/);
                    if (words.length > 0) {
                        // 返回第一個有意義的詞作為設施名稱
                        const facilityName = words.find(word => 
                            word.length > 1 && 
                            !word.includes('%') && 
                            !word.includes('2D') && 
                            !word.includes('tiled') &&
                            !word.includes('graphics') &&
                            !word.includes('modern') &&
                            !word.includes('anime') &&
                            !word.includes('style')
                        );
                        return facilityName || null;
                    }
                }
            } catch (error) {
                console.error('[VN面板-手机版] 從AI URL提取設施名稱失敗:', error);
            }
            return null;
        }
        
        // 處理普通背景圖片URL
        const url = new URL(imageUrl);
        const pathname = url.pathname;
        
        // 從路徑中提取文件名（不包含擴展名）
        const filename = pathname.split('/').pop();
        if (filename) {
            const facilityName = filename.replace(/\.[^/.]+$/, ''); // 移除文件擴展名
            return facilityName || null;
        }
        
        return null;
    } catch (error) {
        console.error('[VN面板-手机版] 從URL提取設施名稱失敗:', error);
        return null;
    }
}



/**
 * 直接应用背景图片（手机版简化）
 */
async function applyBackgroundImage(imageUrl) {
    if (!gameContainer) return;
    
    if (!imageUrl || !validateImageUrl(imageUrl)) {
        applyFallbackBackground();
        return;
    }
    
    backgroundImageState.isApplying = true;
    
    try {
        // 檢查是否有預加載的圖片
        const facilityName = getFacilityNameFromUrl(imageUrl);
        const preloadedImg = facilityName ? getPreloadedBackgroundImage(facilityName) : null;
        
        if (preloadedImg) {
            // console.log(`[VN面板-手机版] 使用預加載的背景圖片: ${facilityName}`);
            
            // 直接使用預加載的圖片，無需等待
            gameContainer.style.backgroundImage = `url('${imageUrl}')`;
            backgroundImageState.appliedImageUrl = imageUrl;
            backgroundImageState.lastAppliedTime = Date.now();
            backgroundImageState.isApplying = false;
            
            if (backgroundImageState.debug) {
                // console.log(`[VN面板-手机版] 背景应用成功 (預加載): ${imageUrl}`);
            }
            
            if (window.VNFeatures?.isWaitingForSceneBackground) {
                window.VNFeatures.proceedAfterBackgroundReady();
            }
            return;
        }
        
        // 如果沒有預加載的圖片，正常加載
        const img = new Image();
        
        // 設置加載超時和延遲 - AI生成的圖片需要更長時間
        const isAIGenerated = imageUrl.includes('pollinations.ai');
        const timeoutDuration = isAIGenerated ? 45000 : 15000; // AI圖片45秒，普通圖片15秒
        
        const loadTimeout = setTimeout(() => {
            console.warn(`[VN面板-手机版] 背景加載超時 (${timeoutDuration/1000}秒): ${imageUrl}`);
            backgroundImageState.isApplying = false;
            
            // 如果是AI生成的圖片超時，記錄到日誌但不立即fallback
            if (isAIGenerated) {
                // console.log('[VN面板-手机版] AI背景圖片加載超時，但保持等待狀態');
                // 不立即fallback，給AI圖片更多時間
                return;
            }
            
            applyFallbackBackground();
        }, timeoutDuration);
        
        img.onload = () => {
            clearTimeout(loadTimeout);
            // console.log(`[VN面板-手机版] 背景圖片加載成功: ${imageUrl}`);
            
            // 立即應用背景，減少延遲
            gameContainer.style.backgroundImage = `url('${imageUrl}')`;
            backgroundImageState.appliedImageUrl = imageUrl;
            backgroundImageState.lastAppliedTime = Date.now();
            backgroundImageState.isApplying = false;
            
            if (backgroundImageState.debug) {
                // console.log(`[VN面板-手机版] 背景应用成功: ${imageUrl}`);
            }
            
            if (window.VNFeatures?.isWaitingForSceneBackground) {
                window.VNFeatures.proceedAfterBackgroundReady();
            }
        };
        
        img.onerror = (error) => {
            clearTimeout(loadTimeout);
            console.error(`[VN面板-手机版] 背景加载失败:`, error);
            console.warn(`[VN面板-手机版] 失敗的URL: ${imageUrl}`);
            
            // 如果是AI生成的圖片，嘗試診斷問題
            if (isAIGenerated) {
                // console.log('[VN面板-手机版] AI背景圖片加載失敗，可能的原因:');
                // console.log('1. URL編碼問題');
                // console.log('2. CORS跨域問題');
                // console.log('3. Pollinations服務器問題');
                // console.log('4. 網絡連接問題');
                
                // 檢查URL長度
                if (imageUrl.length > 2000) {
                    console.warn('[VN面板-手机版] URL過長，可能導致問題');
                }
            }
            
            backgroundImageState.isApplying = false;
            applyFallbackBackground();
        };
        
        // 設置跨域屬性
        img.crossOrigin = 'anonymous';
        
        img.src = imageUrl;
    } catch (error) {
        console.error('[VN面板-手机版] 应用背景出错:', error);
        backgroundImageState.isApplying = false;
        applyFallbackBackground();
    }
}

/**
 * 应用默认背景
 */
function applyFallbackBackground() {
    if (!gameContainer) return;
    
    const config = getMobileBackgroundConfig();
    const fallbackUrl = config.fallbackUrl;
    gameContainer.style.backgroundImage = `url('${fallbackUrl}')`;
    backgroundImageState.appliedImageUrl = fallbackUrl;
    backgroundImageState.lastAppliedTime = Date.now();
    
    if (backgroundImageState.debug) {
        // console.log('[VN面板-手机版] 使用fallback背景');
    }
    
    if (window.VNFeatures?.isWaitingForSceneBackground) {
        window.VNFeatures.proceedAfterBackgroundReady();
    }
}

/**
 * 更新背景（手机版简化）
 */
async function updateBackground() {
    const location = vnData.sceneInfo?.location;
    if (!location || !gameContainer) {
        if (gameContainer && !backgroundImageState.appliedImageUrl) {
            applyFallbackBackground();
        }
        return;
    }
    
    if (backgroundImageState.debug) {
        // console.log(`[VN面板-手机版] 更新背景: ${location}`);
    }
    
    // 檢查是否有AI生成的背景圖片等待應用
    if (backgroundImageState.pendingAIImage) {
        // console.log('[VN面板-手机版] 使用AI生成的背景圖片:', backgroundImageState.pendingAIImage);
        const aiImageUrl = backgroundImageState.pendingAIImage;
        backgroundImageState.pendingAIImage = null; // 清除待處理的圖片
        await applyBackgroundImage(aiImageUrl);
        return;
    }
    
    // 檢查是否已經有AI背景圖片正在應用中
    if (backgroundImageState.isApplying) {
        // console.log('[VN面板-手机版] 背景圖片正在應用中，跳過URL模式更新');
        return;
    }
    
    // 檢查是否已經應用了AI背景圖片
    if (backgroundImageState.appliedImageUrl && backgroundImageState.appliedImageUrl.includes('pollinations.ai')) {
        // console.log('[VN面板-手机版] 已應用AI背景圖片，跳過URL模式更新:', backgroundImageState.appliedImageUrl);
        return;
    }
    
    // 檢查是否剛剛應用了AI背景圖片（防止立即被覆蓋）
    if (backgroundImageState.lastAppliedTime && 
        Date.now() - backgroundImageState.lastAppliedTime < 5000 && // 5秒內不覆蓋
        backgroundImageState.appliedImageUrl && 
        backgroundImageState.appliedImageUrl.includes('pollinations.ai')) {
        // console.log('[VN面板-手机版] AI背景圖片剛應用不久，跳過URL模式更新:', backgroundImageState.appliedImageUrl);
        return;
    }
    
    // 如果沒有AI生成的圖片，使用URL模式
    const backgroundUrl = await generateBackgroundUrl(location);
    await applyBackgroundImage(backgroundUrl);
}

/**
 * 清除背景图片缓存（手机版简化）
 */
function clearBackgroundImageCache() {
    backgroundImageState.currentLocation = '';
    backgroundImageState.appliedLocation = '';
    backgroundImageState.appliedImageUrl = '';
    backgroundImageState.pendingAIImage = null; // 清除待處理的AI圖片
    backgroundImageState.lastAppliedTime = null; // 清除時間戳
    // console.log('[VN面板-手机版] 背景状态已清除');
}

// =======================================================================
//                            背景圖片預加載
// =======================================================================

// 背景圖片預加載緩存
const backgroundPreloadCache = new Map(); // facilityName -> Image

/**
 * 預加載背景圖片
 * @param {string} facilityName - 設施名稱
 * @param {string} imageUrl - 圖片URL
 */
function preloadBackgroundImage(facilityName, imageUrl) {
    if (!imageUrl || backgroundPreloadCache.has(facilityName)) {
        return;
    }
    
    try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        img.onload = () => {
            // console.log(`[VN面板-手机版] 背景圖片預加載成功: ${facilityName}`);
            backgroundPreloadCache.set(facilityName, img);
        };
        
        img.onerror = () => {
            console.warn(`[VN面板-手机版] 背景圖片預加載失敗: ${facilityName}`);
        };
        
        img.src = imageUrl;
    } catch (error) {
        console.error(`[VN面板-手机版] 預加載背景圖片出錯: ${facilityName}`, error);
    }
}

/**
 * 獲取預加載的背景圖片
 * @param {string} facilityName - 設施名稱
 * @returns {HTMLImageElement|null} 預加載的圖片元素
 */
function getPreloadedBackgroundImage(facilityName) {
    return backgroundPreloadCache.get(facilityName) || null;
}

/**
 * 清除預加載緩存
 */
function clearBackgroundPreloadCache() {
    backgroundPreloadCache.clear();
    // console.log('[VN面板-手机版] 背景預加載緩存已清除');
}

// =======================================================================
//                            角色立繪管理 (完整修正版)
// =======================================================================

/**
 * 获取当前素材模式
 */
function getCurrentSourceMode() {
    const savedSettings = JSON.parse(localStorage.getItem('vn_material_settings') || '{}');
    return savedSettings.sourceMode || 'url';
}

/**
 * 获取角色图片设置
 */
function getCharacterImgSettings() {
    // 優先使用 VNMaterialProcessor
    if (window.VNMaterialProcessor?.getCharacterImgSettings) {
        try {
            const settings = window.VNMaterialProcessor.getCharacterImgSettings();
            if (settings && settings.baseUrl) {
                // console.log('[VN面板-手机版] 使用VNMaterialProcessor獲取角色圖片設置:', settings);
                return settings;
            }
        } catch (error) {
            console.warn('[VN面板-手机版] VNMaterialProcessor.getCharacterImgSettings失敗:', error);
        }
    }
    
    // 备用获取方式 - 直接从DOM元素获取
    const charImgBaseUrlInput = document.getElementById('character-img-base-url');
    const charImgFormatInput = document.getElementById('character-img-format');
    
    const settings = {
        baseUrl: charImgBaseUrlInput ? charImgBaseUrlInput.value.trim() : 'https://nancywang3641.github.io/sound-files/char_img/',
        format: charImgFormatInput ? charImgFormatInput.value.trim() : '.png'
    };
    
    // console.log('[VN面板-手机版] 使用DOM元素獲取角色圖片設置:', settings);
    return settings;
}

/**
 * 获取预设图片设置
 */
function getPortraitSettings() {
    // 優先使用 VNMaterialProcessor
    if (window.VNMaterialProcessor?.getPortraitSettings) {
        try {
            const settings = window.VNMaterialProcessor.getPortraitSettings();
            if (settings && settings.baseUrl) {
                // console.log('[VN面板-手机版] 使用VNMaterialProcessor獲取預設圖片設置:', settings);
                return settings;
            }
        } catch (error) {
            console.warn('[VN面板-手机版] VNMaterialProcessor.getPortraitSettings失敗:', error);
        }
    }
    
    // 备用获取方式 - 直接从DOM元素获取
    const portraitBaseUrlInput = document.getElementById('portrait-base-url');
    const portraitFormatInput = document.getElementById('portrait-format');
    
    const settings = {
        baseUrl: portraitBaseUrlInput ? portraitBaseUrlInput.value.trim() : 'https://nancywang3641.github.io/sound-files/char_presets/',
        format: portraitFormatInput ? portraitFormatInput.value.trim() : '_presets.png'
    };
    
    // console.log('[VN面板-手机版] 使用DOM元素獲取預設圖片設置:', settings);
    return settings;
}

/**
 * URL模式：直接从用户设置的URL获取角色图片
 */
async function getCharacterImageFromUrl(characterName, expression) {
    // console.log(`[VN面板-手机版] URL模式获取角色图片: ${characterName}, 表情: ${expression}`);
    
    const charImgSettings = getCharacterImgSettings();
    const portraitSettings = getPortraitSettings();
    
    const cleanCharacterName = characterName.trim();
    const cleanExpression = (expression || '').trim();
    
    const fallbackUrls = [];
    
    // 1. 优先尝试角色图片URL
    if (cleanExpression && cleanExpression !== cleanCharacterName) {
        // 有表情：角色名_表情.png
        const expressionUrl = `${charImgSettings.baseUrl}${cleanCharacterName}_${cleanExpression}${charImgSettings.format}`;
        fallbackUrls.push(expressionUrl);
        // console.log(`[VN面板-手机版] 添加表情图片URL: ${expressionUrl}`);
    } else if (cleanExpression) {
        // 只有表情名：表情.png
        const expressionOnlyUrl = `${charImgSettings.baseUrl}${cleanExpression}${charImgSettings.format}`;
        fallbackUrls.push(expressionOnlyUrl);
        // console.log(`[VN面板-手机版] 添加表情名URL: ${expressionOnlyUrl}`);
    } else {
        // 没有表情：角色名.png
        const characterOnlyUrl = `${charImgSettings.baseUrl}${cleanCharacterName}${charImgSettings.format}`;
        fallbackUrls.push(characterOnlyUrl);
        // console.log(`[VN面板-手机版] 添加角色名URL: ${characterOnlyUrl}`);
    }
    
    // 2. 备用预设图片URL
    const presetsUrl = `${portraitSettings.baseUrl}${cleanCharacterName}${portraitSettings.format}`;
    fallbackUrls.push(presetsUrl);
    // console.log(`[VN面板-手机版] 添加预设URL: ${presetsUrl}`);
    
    // 3. 最终默认URL
    fallbackUrls.push('https://nancywang3641.github.io/sound-files/char_presets/default.png');
    
    // console.log(`[VN面板-手机版] URL模式回退序列:`, fallbackUrls);
    return fallbackUrls;
}

/**
 * 上传模式：从IndexedDB获取用户上传的Base64图片
 */
async function getCharacterImageFromUpload(characterName, expression) {
    // console.log(`[VN面板-手机版] 上传模式获取角色图片: ${characterName}, 表情: ${expression}`);
    
    if (!window.materialImageManager) {
        console.error('[VN面板-手机版] materialImageManager未初始化，回退到URL模式');
        return null;
    }
    
    try {
        // 从两个可能的分类获取图片
        const portraitImages = await window.materialImageManager.getImagesByCategory('portrait', 'upload');
        const characterImgImages = await window.materialImageManager.getImagesByCategory('character-img', 'upload');
        const allImages = [...portraitImages, ...characterImgImages];
        
        // console.log(`[VN面板-手机版] 上传模式图片统计: portrait=${portraitImages.length}, character-img=${characterImgImages.length}`);
        
        const cleanCharacterName = characterName.trim();
        const cleanExpression = (expression || '').trim();
        
        // 构建搜索模式
        const searchPatterns = [];
        if (cleanExpression && cleanExpression !== cleanCharacterName) {
            searchPatterns.push(`${cleanCharacterName}_${cleanExpression}`);
        }
        if (cleanExpression) {
            searchPatterns.push(cleanExpression);
        }
        searchPatterns.push(cleanCharacterName);
        searchPatterns.push(`${cleanCharacterName}_presets`);
        
        // console.log(`[VN面板-手机版] 上传模式搜索模式:`, searchPatterns);
        
        // 三轮匹配策略
        let matchedImage = null;
        
        // 第一轮：精确文件名匹配
        for (const pattern of searchPatterns) {
            matchedImage = allImages.find(img => {
                const imgName = img.name.replace(/\.[^/.]+$/, '');
                return imgName === pattern;
            });
            if (matchedImage) {
                // console.log(`[VN面板-手机版] 精确匹配成功: ${matchedImage.name} (模式: ${pattern})`);
                break;
            }
        }
        
        // 第二轮：标签和表情匹配
        if (!matchedImage) {
            matchedImage = allImages.find(img => {
                const labelMatch = img.label === cleanCharacterName;
                const emotionMatch = !cleanExpression || img.emotion === cleanExpression;
                return labelMatch && emotionMatch;
            });
            if (matchedImage) {
                // console.log(`[VN面板-手机版] 标签表情匹配成功: ${matchedImage.name} (标签: ${matchedImage.label}, 表情: ${matchedImage.emotion})`);
            }
        }
        
        // 第三轮：包含匹配
        if (!matchedImage) {
            for (const pattern of searchPatterns) {
                matchedImage = allImages.find(img => {
                    const imgName = img.name.replace(/\.[^/.]+$/, '');
                    return imgName.includes(pattern);
                });
                if (matchedImage) {
                    // console.log(`[VN面板-手机版] 包含匹配成功: ${matchedImage.name} (模式: ${pattern})`);
                    break;
                }
            }
        }
        
        if (matchedImage) {
            // 验证图片数据
            if (matchedImage.url && matchedImage.url.startsWith('data:image/')) {
                // console.log(`[VN面板-手机版] 上传模式找到图片: ${matchedImage.name}, Base64长度: ${matchedImage.url.length}`);
                return matchedImage.url;
            } else {
                console.warn(`[VN面板-手机版] 上传图片数据无效: ${matchedImage.name}`);
            }
        } else {
            // console.log(`[VN面板-手机版] 上传模式未找到匹配图片`);
             console.log(`[VN面板-手机版] 可用图片:`, allImages.map(img => ({
                name: img.name.replace(/\.[^/.]+$/, ''),
                label: img.label,
                emotion: img.emotion
            })));
        }
        
    } catch (error) {
        console.error('[VN面板-手机版] 上传模式获取图片失败:', error);
    }
    
    return null;
}

/**
 * URL单张模式：从IndexedDB获取用户添加的URL图片
 */
async function getCharacterImageFromUrlSingle(characterName, expression) {
    // console.log(`[VN面板-手机版] URL单张模式获取角色图片: ${characterName}, 表情: ${expression}`);
    
    if (!window.materialImageManager) {
        console.error('[VN面板-手机版] materialImageManager未初始化，回退到URL模式');
        return null;
    }
    
    try {
        // 从两个可能的分类获取URL图片
        const portraitImages = await window.materialImageManager.getImagesByCategory('portrait', 'url-single');
        const characterImgImages = await window.materialImageManager.getImagesByCategory('character-img', 'url-single');
        const allImages = [...portraitImages, ...characterImgImages];
        
        // console.log(`[VN面板-手机版] URL单张模式图片统计: portrait=${portraitImages.length}, character-img=${characterImgImages.length}`);
        
        const cleanCharacterName = characterName.trim();
        const cleanExpression = (expression || '').trim();
        
        // 构建搜索模式（与上传模式相同）
        const searchPatterns = [];
        if (cleanExpression && cleanExpression !== cleanCharacterName) {
            searchPatterns.push(`${cleanCharacterName}_${cleanExpression}`);
        }
        if (cleanExpression) {
            searchPatterns.push(cleanExpression);
        }
        searchPatterns.push(cleanCharacterName);
        searchPatterns.push(`${cleanCharacterName}_presets`);
        
        // console.log(`[VN面板-手机版] URL单张模式搜索模式:`, searchPatterns);
        
        // 使用相同的三轮匹配策略
        let matchedImage = null;
        
        // 第一轮：精确文件名匹配
        for (const pattern of searchPatterns) {
            matchedImage = allImages.find(img => {
                const imgName = img.name.replace(/\.[^/.]+$/, '');
                return imgName === pattern;
            });
            if (matchedImage) {
                // console.log(`[VN面板-手机版] 精确匹配成功: ${matchedImage.name} (模式: ${pattern})`);
                break;
            }
        }
        
        // 第二轮：标签和表情匹配
        if (!matchedImage) {
            matchedImage = allImages.find(img => {
                const labelMatch = img.label === cleanCharacterName;
                const emotionMatch = !cleanExpression || img.emotion === cleanExpression;
                return labelMatch && emotionMatch;
            });
            if (matchedImage) {
                // console.log(`[VN面板-手机版] 标签表情匹配成功: ${matchedImage.name} (标签: ${matchedImage.label}, 表情: ${matchedImage.emotion})`);
            }
        }
        
        // 第三轮：包含匹配
        if (!matchedImage) {
            for (const pattern of searchPatterns) {
                matchedImage = allImages.find(img => {
                    const imgName = img.name.replace(/\.[^/.]+$/, '');
                    return imgName.includes(pattern);
                });
                if (matchedImage) {
                    // console.log(`[VN面板-手机版] 包含匹配成功: ${matchedImage.name} (模式: ${pattern})`);
                    break;
                }
            }
        }
        
        if (matchedImage) {
            // 验证URL图片数据
            if (matchedImage.url && (matchedImage.url.startsWith('http://') || matchedImage.url.startsWith('https://'))) {
                // console.log(`[VN面板-手机版] URL单张模式找到图片: ${matchedImage.name}, URL: ${matchedImage.url}`);
                return matchedImage.url;
            } else {
                console.warn(`[VN面板-手机版] URL图片数据无效: ${matchedImage.name}`);
            }
        } else {
            // console.log(`[VN面板-手机版] URL单张模式未找到匹配图片`);
        }
        
    } catch (error) {
        console.error('[VN面板-手机版] URL单张模式获取图片失败:', error);
    }
    
    return null;
}

/**
 * 应用图片到元素并处理回退 (URL模式)
 */
function applyImageWithUrlFallback(imgElement, urlList) {
    if (!imgElement || !urlList || urlList.length === 0) {
        console.error('[VN面板-手机版] 无效的图片元素或URL列表');
        return;
    }
    
    let currentIndex = 0;
    
    const tryNextUrl = () => {
        if (currentIndex >= urlList.length) {
            console.error('[VN面板-手机版] 所有URL都加载失败');
            imgElement.style.visibility = 'hidden';
            return;
        }
        
        const currentUrl = urlList[currentIndex];
        // console.log(`[VN面板-手机版] 尝试URL [${currentIndex + 1}/${urlList.length}]: ${currentUrl}`);
        
        // 清除旧的事件监听器
        const oldErrorHandler = imgElement._errorHandler;
        const oldLoadHandler = imgElement._loadHandler;
        if (oldErrorHandler) imgElement.removeEventListener('error', oldErrorHandler);
        if (oldLoadHandler) imgElement.removeEventListener('load', oldLoadHandler);
        
        // 设置新的事件监听器
        imgElement._errorHandler = () => {
            console.warn(`[VN面板-手机版] URL加载失败: ${currentUrl}`);
            currentIndex++;
            tryNextUrl();
        };
        
        imgElement._loadHandler = () => {
            // console.log(`[VN面板-手机版] ✅ URL加载成功: ${currentUrl}`);
            imgElement.style.visibility = 'visible';
            imgElement.removeEventListener('error', imgElement._errorHandler);
            imgElement.removeEventListener('load', imgElement._loadHandler);
        };
        
        imgElement.addEventListener('error', imgElement._errorHandler, { once: true });
        imgElement.addEventListener('load', imgElement._loadHandler, { once: true });
        
        imgElement.src = currentUrl;
    };
    
    tryNextUrl();
}

/**
 * 主要的角色图片获取函数 (修正版)
 */
async function addFallbackToImage(imgElement, characterName, expression) {
    if (!imgElement || !characterName) {
        console.warn('[VN面板-手机版] addFallbackToImage: 无效参数');
        return;
    }

    const cleanCharacterName = characterName.trim();
    const cleanExpression = (expression || '').trim();
    const sourceMode = getCurrentSourceMode();
    
    // console.log(`[VN面板-手机版] 获取角色图片: ${cleanCharacterName}, 表情: ${cleanExpression}, 模式: ${sourceMode}`);
    
    let imageUrl = null;
    
    // 根据模式选择不同的获取策略
    switch (sourceMode) {
        case 'upload':
            // console.log('[VN面板-手机版] === 使用上传模式 ===');
            imageUrl = await getCharacterImageFromUpload(cleanCharacterName, cleanExpression);
            break;
            
        case 'url-single':
            // console.log('[VN面板-手机版] === 使用URL单张模式 ===');
            imageUrl = await getCharacterImageFromUrlSingle(cleanCharacterName, cleanExpression);
            break;
            
        case 'url':
        default:
            // console.log('[VN面板-手机版] === 使用URL模式 ===');
            // URL模式直接跳到URL回退逻辑
            break;
    }
    
    // 如果非URL模式找到了图片，直接使用
    if (imageUrl) {
        // console.log(`[VN面板-手机版] ${sourceMode}模式找到图片，直接使用`);
        
        imgElement.addEventListener('load', () => {
            // console.log(`[VN面板-手机版] ✅ ${sourceMode}模式图片加载成功`);
            imgElement.style.visibility = 'visible';
        }, { once: true });
        
        imgElement.addEventListener('error', async () => {
            console.warn(`[VN面板-手机版] ${sourceMode}模式图片加载失败，回退到URL模式`);
            const urlList = await getCharacterImageFromUrl(cleanCharacterName, cleanExpression);
            applyImageWithUrlFallback(imgElement, urlList);
        }, { once: true });
        
        imgElement.src = imageUrl;
        return;
    }
    
    // 如果没有找到图片或者是URL模式，使用URL回退逻辑
    // console.log(`[VN面板-手机版] 使用URL模式回退`);
    const urlList = await getCharacterImageFromUrl(cleanCharacterName, cleanExpression);
    applyImageWithUrlFallback(imgElement, urlList);
}

async function updateCharacterImageSimplified(charInfo) {
    if (!characterCenter) {
        console.error('[VN面板-手机版] characterCenter 未找到');
        return;
    }

    const existingImg = characterCenter.querySelector('img');
    const isSameCharacter = currentCharacter && currentCharacter.name === charInfo.name;

    if (isSameCharacter && currentCharacter.expression === charInfo.expression) {
        if (applyExpressionAnimationFn && existingImg) applyExpressionAnimationFn(existingImg, charInfo.expression);
        return; 
    }

    if (isSameCharacter && existingImg) {
        // console.log(`[VN面板-手机版] 更换表情: ${charInfo.name} -> ${charInfo.expression}`);
        
        // 清除旧的事件监听器
        const oldErrorHandler = existingImg._errorHandler;
        const oldLoadHandler = existingImg._loadHandler;
        if (oldErrorHandler) existingImg.removeEventListener('error', oldErrorHandler);
        if (oldLoadHandler) existingImg.removeEventListener('load', oldLoadHandler);
        
        await addFallbackToImage(existingImg, charInfo.name, charInfo.expression);
        
        if (applyExpressionAnimationFn) applyExpressionAnimationFn(existingImg, charInfo.expression);
        currentCharacter = { ...charInfo };
        return;
    }

    // console.log(`[VN面板-手机版] 切换角色: ${charInfo.name} (表情: ${charInfo.expression})`);

    const addNewImage = async () => {
        characterCenter.innerHTML = '';
        const newImg = document.createElement('img');
        newImg.classList.add('character-image-enter');
        
        await addFallbackToImage(newImg, charInfo.name, charInfo.expression);
        
        newImg.addEventListener('animationend', () => newImg.classList.remove('character-image-enter'), { once: true });

        characterCenter.appendChild(newImg);
        currentCharacter = { ...charInfo };
        
        if (applyExpressionAnimationFn) applyExpressionAnimationFn(newImg, charInfo.expression);
    };

    if (existingImg) {
        existingImg.classList.remove('character-image-enter');
        existingImg.classList.add('character-image-exit');
        existingImg.addEventListener('animationend', async () => {
            if (existingImg.parentNode) existingImg.parentNode.removeChild(existingImg);
            await addNewImage();
        }, { once: true });
    } else {
        await addNewImage();
    }
}

function handleCharacterExit(dialogue) {
    if (!dialogue || !dialogue.name) return;
    if (currentCharacter && currentCharacter.name === dialogue.name) {
        // console.log(`[VN面板-手机版] 角色退场: ${dialogue.name}`);
        const img = characterCenter.querySelector('img');
        if (img) {
            img.classList.add('character-image-exit');
            img.addEventListener('animationend', () => { 
                if (img.parentNode) img.parentNode.removeChild(img); 
            }, { once: true });
        }
        currentCharacter = null;
    }
}

// =======================================================================
//                            角色數據管理
// =======================================================================

function parseSimplifiedCharacterRelationships() {
    const charDataContent = document.getElementById('char-data-content');
    if (!charDataContent) {
        console.warn("[VN面板-手机版] char-data-content 元素未找到");
        return;
    }
    
    const relationships = [];
    if (vnData.rawCharadata) {
        const regex = /\[([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^\]]+?)\]/g;
        let match;
        while ((match = regex.exec(vnData.rawCharadata)) !== null) {
            relationships.push({ 
                from: match[1].trim(), 
                to: match[2].trim(), 
                relation: match[3].trim() 
            });
        }
    }

    const charDataPanel = document.querySelector('.char-data-panel');
    if (relationships.length === 0) {
        if (charDataPanel) charDataPanel.style.display = 'none';
        return;
    }
    
    if (charDataPanel) {
        charDataPanel.style.display = 'block';
        charDataPanel.classList.add('collapsed');
    }
    
    // 生成关系列表
    charDataContent.innerHTML = '';
    relationships.forEach(rel => {
        const item = document.createElement('div');
        item.className = 'relationship-item-simple';
        const relationInfo = parseRelationString(rel.relation);
        item.innerHTML = `
            <div class="relationship-line">
                <span class="char-from">${rel.from}</span> 
                <span class="relation-arrow">→</span> 
                <span class="char-to">${rel.to}</span>
            </div>
            <div class="relation-info">
                <span class="relation-icon">${relationInfo.icon}</span> 
                <span class="relation-text">${relationInfo.text}</span> 
                <span class="relation-value">${relationInfo.value}</span>
            </div>`;
        charDataContent.appendChild(item);
    });
}

function parseRelationString(relationStr) {
    if (!relationStr || typeof relationStr !== 'string') {
        return { icon: '❓', text: '未知', value: '0' };
    }
    
    const relationMap = {
        '🖤': { text: '厌', color: '#666' },
        '💔': { text: '恨', color: '#ff4757' },
        '🧠': { text: '尊敬', color: '#3742fa' },
        '💙': { text: '友', color: '#2ed573' },
        '❤️‍🔥': { text: '欲', color: '#ff6b6b' },
        '❤️': { text: '爱', color: '#ff3838' },
        '👪': { text: '家', color: '#ffa502' }
    };
    
    const match = relationStr.match(/([🖤💔🧠💙❤️‍🔥❤️👪]+)([^\d]*)?(\d+)?/);
    
    if (match) {
        const emoji = match[1];
        const value = match[3] || '0';
        const relationData = relationMap[emoji];
        
        if (relationData) {
            return {
                icon: emoji,
                text: relationData.text,
                value: value,
                color: relationData.color
            };
        }
    }
    
    const numMatch = relationStr.match(/(\d+)/);
    const value = numMatch ? numMatch[1] : '0';
    
    return {
        icon: '💙',
        text: '友',
        value: value,
        color: '#2ed573'
    };
}

function updatePlayerData() { 
    if (!vnData.userData) { 
        console.warn("[VN面板-手机版] updatePlayerData: vnData.userData 缺失"); 
        return; 
    } 
    
    updateStatValue('hp', vnData.userData.hp || "0"); 
    updateStatValue('san', vnData.userData.san || "0"); 
    updateStatValue('twisted', vnData.userData.distortion || "0"); 
    parseSimplifiedCharacterRelationships();
}

function updateStatValue(statKey, valueStr) { 
    let numValue = 0; 
    if (typeof valueStr === 'string') { 
        numValue = parseInt(valueStr.replace('%', '')) || 0; 
    } else if (typeof valueStr === 'number') { 
        numValue = valueStr; 
    } 
    
    numValue = Math.max(0, Math.min(100, numValue)); 
    
    const fillEl = document.querySelector(`.player-stats .${statKey}-fill`); 
    const valueEl = document.querySelector(`.player-stats .${statKey}-value`); 
    
    if (fillEl) fillEl.style.width = `${numValue}%`; 
    if (valueEl) valueEl.textContent = `${numValue}%`; 
}

function updateCharacterStats() { 
    updatePlayerData(); 
}

// =======================================================================
//                            故事結束處理功能
// =======================================================================

/**
 * 处理故事开始
 */
function handleStoryStart(data) {
    // console.log(`[VN面板-手机版] 故事开始: ${data.chapterInfo || '未知章节'} - ID: ${data.startId}`);
    
    // 可以在这里添加故事开始时的UI更新
    // 比如显示章节标题、更新状态等
}

/**
 * 处理故事结束
 */
async function handleStoryEnd(data) {
    // console.log(`[VN面板-手机版] 故事结束检测到 - 范围: ${data.range}`);
    
    try {
        // 延迟执行隐藏（确保所有消息都已载入）
        setTimeout(async () => {
            const success = await executeHideCommand(data.startId, data.endId);
            
            if (success) {
                // console.log(`[VN面板-手机版] 故事已自动隐藏: ${data.range}`);
                
                // 显示完成通知
                showVNNotification(`故事已完成并隐藏 (${data.range})`, 'success');
            } else {
                console.error(`[VN面板-手机版] 故事隐藏失败: ${data.range}`);
                showVNNotification(`故事隐藏失败: ${data.range}`, 'error');
            }
        }, 2000); // 2秒延迟
        
    } catch (error) {
        console.error(`[VN面板-手机版] 处理故事结束出错:`, error);
        showVNNotification(`处理故事结束出错: ${error.message}`, 'error');
    }
}

/**
 * 执行隐藏命令（直接调用酒馆AI API）
 */
async function executeHideCommand(startId, endId) {
    try {
        const hideCommand = `/hide ${startId}-${endId}`;
        // console.log(`[VN面板-手机版] 准备执行隐藏指令: ${hideCommand}`);
        
        // 验证ID范围
        if (!startId || !endId || startId > endId) {
            console.error(`[VN面板-手机版] ID范围无效: ${startId}-${endId}`);
            return false;
        }
        
        // 直接调用API
        let success = false;
        
        // 方法1: 优先使用JCY適配器
        if (window.JCYAdapter && window.JCYAdapter.isJCYSystem()) {
            try {
                // 通过postMessage发送AI请求到JCY主系统
                const result = window.JCYAdapter.sendMessageToJCYViaPostMessage({
                    type: 'VN_AI_REQUEST',
                    data: {
                        message: hideCommand,
                        source: 'VN_PANEL_HIDE_COMMAND'
                    }
                });
                // console.log(`[VN面板-JCY版] JCY適配器执行结果:`, result);
                success = result;
            } catch (error) {
                console.error(`[VN面板-JCY版] JCY適配器执行失败:`, error);
            }
        }
        
        // 方法2: 备用方法 - 直接通过postMessage发送
        if (!success) {
            try {
                window.parent.postMessage({
                    type: 'VN_AI_REQUEST',
                    data: {
                        message: hideCommand,
                        source: 'VN_PANEL_HIDE_COMMAND'
                    }
                }, '*');
                // console.log(`[VN面板-JCY版] 通过postMessage发送隐藏指令`);
                success = true;
            } catch (error) {
                console.error(`[VN面板-JCY版] postMessage发送失败:`, error);
            }
        }
        
        if (success) {
            // console.log(`[VN面板-手机版] 隐藏指令执行成功: ${hideCommand}`);
            return true;
        } else {
            console.error(`[VN面板-手机版] 所有API方法都失败了`);
            return false;
        }
        
    } catch (error) {
        console.error(`[VN面板-手机版] 执行隐藏指令失败: ${error.message}`);
        return false;
    }
}

/**
 * 显示VN面板通知
 */
function showVNNotification(message, type = 'info', duration = 3000) {
    try {
        // 尝试使用现有的通知系统
        if (window.showNotification) {
            window.showNotification(message, type, duration);
            return;
        }
        
        // 备用方案：创建临时通知元素
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'error' ? '#ff4444' : type === 'success' ? '#44ff44' : '#4444ff'};
            color: white;
            padding: 10px 15px;
            border-radius: 5px;
            z-index: 10000;
            font-size: 14px;
            max-width: 300px;
            word-wrap: break-word;
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, duration);
        
    } catch (error) {
        console.error(`[VN面板-手机版] 显示通知失败:`, error);
    }
}

/**
 * 测试故事隐藏功能
 */
async function testStoryHiding() {
    try {
        // console.log('[VN面板-手机版] 🧪 开始测试故事隐藏功能...');
        
        // 测试API可用性
        // console.log('[VN面板-手机版] 🔍 测试API可用性:');
        // console.log('  - window.TavernHelper:', !!window.TavernHelper);
        // console.log('  - window.TavernHelper?.triggerSlash:', !!window.TavernHelper?.triggerSlash);
        // console.log('  - window.SillyTavern:', !!window.SillyTavern);
        // console.log('  - window.SillyTavern?.executeSlashCommandsWithOptions:', !!window.SillyTavern?.executeSlashCommandsWithOptions);
        // console.log('  - window.parent?.TavernHelper:', !!window.parent?.TavernHelper);
        // console.log('  - window.top?.TavernHelper:', !!window.top?.TavernHelper);
        
        // 获取当前最新消息ID
        const currentId = await getLastMessageId();
        // console.log(`[VN面板-手机版] 📊 当前最新消息ID: ${currentId}`);
        
        // 测试隐藏命令执行
        const testRange = Math.max(1, currentId - 1);
        const success = await executeHideCommand(testRange, testRange);
        
        if (success) {
            // console.log('[VN面板-手机版] ✅ 故事隐藏功能测试成功');
            showVNNotification('故事隐藏功能测试成功', 'success');
        } else {
            console.error('[VN面板-手机版] ❌ 故事隐藏功能测试失败');
            showVNNotification('故事隐藏功能测试失败', 'error');
        }
        
    } catch (error) {
        console.error('[VN面板-手机版] 🧪 测试故事隐藏功能出错:', error);
        showVNNotification(`测试出错: ${error.message}`, 'error');
    }
}

function setupManualUpdateButton() {
    if (typeof eventOnButton === 'function') {
        eventOnButton('显示VN历史', getVNHistoryList);
        eventOnButton('测试VN面板通信', testVNPanelCommunication);
        eventOnButton('显示所有隐藏消息', showAllHiddenMessages);
        eventOnButton('手动隐藏故事', manualHideStory);
        eventOnButton('测试手机版背景', testMobileBackground);
        eventOnButton('测试故事隐藏功能', testStoryHiding);
        eventOnButton('测试角色图片获取', testCharacterImageRetrieval);
    }
}

/**
 * 测试角色图片获取功能
 */
async function testCharacterImageRetrieval() {
    // console.log('\n=== 测试角色图片获取功能 ===');
    
    const testCases = [
        { character: '許萊特', expression: 'Tired' },
        { character: '許萊特', expression: '' },
        { character: '小米', expression: 'happy' },
        { character: '不存在的角色', expression: 'sad' }
    ];
    
    for (const testCase of testCases) {
        // console.log(`\n🎭 测试: ${testCase.character} - ${testCase.expression || '无表情'}`);
        
        // 创建测试图片元素
        const testImg = document.createElement('img');
        testImg.style.cssText = `
            position: fixed;
            top: ${10 + testCases.indexOf(testCase) * 60}px;
            right: 10px;
            width: 100px;
            height: auto;
            border: 2px solid #ff6b6b;
            z-index: 10000;
            background: white;
        `;
        
        document.body.appendChild(testImg);
        
        try {
            await addFallbackToImage(testImg, testCase.character, testCase.expression);
            // console.log(`✅ ${testCase.character} 测试完成`);
        } catch (error) {
            console.error(`❌ ${testCase.character} 测试失败:`, error);
        }
        
        // 5秒后移除
        setTimeout(() => {
            if (testImg.parentNode) {
                document.body.removeChild(testImg);
            }
        }, 5000);
    }
}

// =======================================================================
//                            全域導出
// =======================================================================

// 添加到全局VNCoreAPI
if (window.VNCoreAPI) {
    Object.assign(window.VNCoreAPI, {
        // 背景图片功能（手机版简化）
        applyBackgroundImage, 
        applyFallbackBackground, 
        validateImageUrl, 
        clearBackgroundImageCache, 
        updateBackground, 
        generateBackgroundUrl,
        findImageFromIndexedDB,
        checkAndSwitchSceneBackground, // 新增的背景切换函数
        generateAndApplySceneBackground, // 新增的背景生成函数
        
        // 角色管理功能
        updateCharacterImageSimplified, 
        handleCharacterExit,
        
        // 角色数据功能
        updateCharacterStats,
        parseSimplifiedCharacterRelationships,
        updatePlayerData
    });
}

// 添加到全局VNCore
if (window.VNCore) {
    Object.assign(window.VNCore, {
        // 核心功能（手机版简化）
        applyBackgroundImage, 
        applyFallbackBackground, 
        clearBackgroundImageCache, 
        updateBackground, 
        generateBackgroundUrl,
        
        // 角色管理
        updateCharacterImageSimplified, 
        handleCharacterExit
    });
}

// 暴露故事结束处理API
window.VNStoryEndHandler = {
    handleStoryStart: handleStoryStart,
    handleStoryEnd: handleStoryEnd,
    executeHideCommand: executeHideCommand,
    showVNNotification: showVNNotification
};

// =======================================================================
//                            全局暴露
// =======================================================================

// 暴露預加載函數到全局
window.preloadBackgroundImage = preloadBackgroundImage;
window.getPreloadedBackgroundImage = getPreloadedBackgroundImage;
window.clearBackgroundPreloadCache = clearBackgroundPreloadCache;