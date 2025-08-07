/**
 * VN Type Character Scene - 手机版角色和场景管理模块 v20.1
 * 
 * 包含: 角色立绘管理、背景图片系统、场景切换、角色数据管理
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
                    console.log(`[VN面板-手机版] 從IndexedDB找到背景圖片: ${matchedImage.name}`);
                }
                return matchedImage.url;
            } else {
                if (backgroundImageState.debug) {
                    console.log(`[VN面板-手机版] IndexedDB中未找到背景圖片，使用URL模式`);
                }
            }
        } catch (error) {
            console.error('[VN面板-手机版] 從IndexedDB獲取背景圖片失敗:', error);
        }
    }
    
    // URL模式或IndexedDB未找到：使用URL構建
    const backgroundUrl = config.baseUrl + cleanFacilityName + config.imageFormat;
    
    if (backgroundImageState.debug) {
        console.log(`[VN面板-手机版] 生成背景URL: ${cleanFacilityName} -> ${backgroundUrl}`);
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
        const img = new Image();
        img.onload = () => {
            gameContainer.style.backgroundImage = `url('${imageUrl}')`;
            backgroundImageState.appliedImageUrl = imageUrl;
            backgroundImageState.isApplying = false;
            
            if (backgroundImageState.debug) {
                console.log(`[VN面板-手机版] 背景应用成功: ${imageUrl}`);
            }
            
            if (window.VNFeatures?.isWaitingForSceneBackground) {
                window.VNFeatures.proceedAfterBackgroundReady();
            }
        };
        
        img.onerror = () => {
            console.warn(`[VN面板-手机版] 背景加载失败，使用fallback: ${imageUrl}`);
            backgroundImageState.isApplying = false;
            applyFallbackBackground();
        };
        
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
    
    if (backgroundImageState.debug) {
        console.log('[VN面板-手机版] 使用fallback背景');
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
        console.log(`[VN面板-手机版] 更新背景: ${location}`);
    }
    
    // 直接生成URL并应用
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
    console.log('[VN面板-手机版] 背景状态已清除');
}

// =======================================================================
//                            角色立繪管理
// =======================================================================

async function addFallbackToImage(imgElement, characterName, expression) {
    if (!imgElement || !characterName) {
        console.warn('[VN面板-手机版] addFallbackToImage: 无效参数');
        return;
    }

    const cleanCharacterName = characterName.trim();
    const cleanExpression = (expression || '').trim();
    
    // 檢查是否使用上傳模式或URL單張模式
    const savedSettings = JSON.parse(localStorage.getItem('vn_material_settings') || '{}');
    const isUploadMode = savedSettings.sourceMode === 'upload';
    const isUrlSingleMode = savedSettings.sourceMode === 'url-single';
    const shouldUseIndexedDB = isUploadMode || isUrlSingleMode;
    
    console.log('[VN面板-手机版] 模式检查:', {
        savedSettings: savedSettings,
        sourceMode: savedSettings.sourceMode,
        isUploadMode: isUploadMode,
        isUrlSingleMode: isUrlSingleMode,
        shouldUseIndexedDB: shouldUseIndexedDB,
        hasMaterialManager: !!window.materialImageManager,
        characterName: cleanCharacterName,
        expression: cleanExpression
    });
    
    if (shouldUseIndexedDB && window.materialImageManager) {
        // 上傳模式或URL單張模式：優先從IndexedDB獲取圖片
        try {
            // 根據模式選擇獲取方法
            let images;
            if (isUploadMode) {
                images = await window.materialImageManager.getImagesByCategory('portrait', 'upload');
            } else if (isUrlSingleMode) {
                images = await window.materialImageManager.getImagesByCategory('portrait', 'url-single');
            } else {
                images = await window.materialImageManager.getImagesByCategory('portrait');
            }
            
            // 構建搜索文件名 - 支持多种命名格式
            const searchPatterns = [];
            
            // 1. 表情图片格式：角色名_表情.png
            if (cleanExpression && cleanExpression !== cleanCharacterName) {
                searchPatterns.push(`${cleanCharacterName}_${cleanExpression}`);
            }
            
            // 2. 预设图片格式：角色名_presets.png
            searchPatterns.push(`${cleanCharacterName}_presets`);
            
            // 3. 简单角色名格式：角色名.png
            searchPatterns.push(cleanCharacterName);
            
            // 4. 表情名格式：表情.png
            if (cleanExpression) {
                searchPatterns.push(cleanExpression);
            }
            
            console.log('[VN面板-手机版] 搜索模式:', searchPatterns);
            
            // 查找匹配的圖片
            const matchedImage = images.find(img => {
                const imgName = img.name.replace(/\.[^/.]+$/, ''); // 移除文件擴展名
                console.log('[VN面板-手机版] 检查图片:', imgName, 'against patterns:', searchPatterns);
                
                return searchPatterns.some(pattern => {
                    const isMatch = imgName === pattern || imgName.includes(pattern);
                    if (isMatch) {
                        console.log('[VN面板-手机版] 找到匹配:', imgName, '匹配模式:', pattern);
                    }
                    return isMatch;
                });
            });
            
            if (matchedImage) {
                console.log('[VN面板-手机版] 從IndexedDB找到立繪:', matchedImage.name);
                
                // 验证图片数据
                console.log('[VN面板-手机版] 验证IndexedDB图片数据:', {
                    name: matchedImage.name,
                    type: matchedImage.type,
                    size: matchedImage.size,
                    hasUrl: !!matchedImage.url,
                    urlType: matchedImage.url ? matchedImage.url.split(';')[0] : 'null',
                    protocol: window.location.protocol,
                    isSandboxed: window.location.href.includes('sandbox')
                });
                
                if (matchedImage.url && matchedImage.url.length < 300000) { // 300KB限制
                    console.log('[VN面板-手机版] 图片数据大小正常');
                    
                    // 检查环境
                    if (window.location.protocol === 'file:') {
                        console.warn('[VN面板-手机版] 警告: 在 file:// 协议下，图片加载可能不稳定');
                    }
                    
                    imgElement.addEventListener('load', () => {
                        console.log(`[VN面板-手机版] 成功加载IndexedDB图片: ${matchedImage.name}`);
                        imgElement.style.visibility = 'visible';
                    }, { once: true });
                    
                    imgElement.addEventListener('error', async (e) => {
                        console.error(`[VN面板-手机版] 加载IndexedDB图片失败: ${matchedImage.name}`, e);
                        console.error('[VN面板-手机版] 图片详情:', {
                            name: matchedImage.name,
                            type: matchedImage.type,
                            size: matchedImage.size,
                            url: matchedImage.url ? matchedImage.url.substring(0, 100) + '...' : 'null',
                            protocol: window.location.protocol
                        });
                        
                        // 不要立即删除，先标记为可疑
                        console.warn('[VN面板-手机版] 图片加载失败，可能是环境问题，标记为可疑数据');
                        
                        // 尝试重新加载一次
                        setTimeout(() => {
                            console.log('[VN面板-手机版] 尝试重新加载图片...');
                            imgElement.src = matchedImage.url;
                        }, 100);
                        
                        // 如果还是失败，回退到URL模式但不删除数据
                        setTimeout(() => {
                            if (imgElement.style.visibility !== 'visible') {
                                console.warn('[VN面板-手机版] 重新加载失败，回退到URL模式');
                                loadImageWithUrlFallback(imgElement, cleanCharacterName, cleanExpression);
                            }
                        }, 1000);
                    }, { once: true });
                    
                    imgElement.src = matchedImage.url;
                    return;
                } else {
                    console.warn('[VN面板-手机版] 图片数据过大，回退到URL模式');
                    loadImageWithUrlFallback(imgElement, cleanCharacterName, cleanExpression);
                }
            }
        } catch (error) {
            console.error('[VN面板-手机版] 從IndexedDB獲取立繪失敗:', error);
        }
    }

    // URL模式或IndexedDB未找到：使用URL構建
    console.log('[VN面板-手机版] 切换到URL模式或IndexedDB未找到匹配图片');
    loadImageWithUrlFallback(imgElement, cleanCharacterName, cleanExpression);
}

function loadImageWithUrlFallback(imgElement, characterName, expression) {
    // 動態獲取角色圖片和立繪URL
    function getLocalCharImgUrl() {
        if (window.VNMaterialProcessor?.getCharacterImgSettings) {
            const settings = window.VNMaterialProcessor.getCharacterImgSettings();
            return settings.baseUrl || 'https://nancywang3641.github.io/sound-files/char_img/';
        }
        return 'https://nancywang3641.github.io/sound-files/char_img/';
    }
    
    function getLocalPresetsUrl() {
        if (window.VNMaterialProcessor?.getPortraitSettings) {
            const settings = window.VNMaterialProcessor.getPortraitSettings();
            return settings.baseUrl || 'https://nancywang3641.github.io/sound-files/char_presets/';
        }
        return 'https://nancywang3641.github.io/sound-files/char_presets/';
    }
    
    const localCharImgUrl = getLocalCharImgUrl();
    const localPresetsUrl = getLocalPresetsUrl();
    
    const fallbackUrls = [];
    
    // 主要URL
    if (expression && expression !== characterName) {
        fallbackUrls.push(`${localCharImgUrl}${characterName}_${expression}.png`);
    } else if (expression) {
        fallbackUrls.push(`${localCharImgUrl}${expression}.png`);
    } else {
        fallbackUrls.push(`${localCharImgUrl}${characterName}.png`);
    }
    
    // 备用URL
    fallbackUrls.push(`${localPresetsUrl}${characterName}_presets.png`);
    fallbackUrls.push(`${localPresetsUrl}default.png`);

    let currentFallbackIndex = 0;
    let hasTriedAllFallbacks = false;

    const tryNextFallback = () => {
        if (hasTriedAllFallbacks) {
            console.error(`[VN面板-手机版] 所有fallback失败: '${characterName}' (表情: '${expression}')`);
            imgElement.style.visibility = 'hidden';
            imgElement.removeEventListener('error', tryNextFallback);
            return;
        }

        if (currentFallbackIndex < fallbackUrls.length) {
            const nextUrl = fallbackUrls[currentFallbackIndex];
            console.warn(`[VN面板-手机版] 尝试下一个fallback: ${nextUrl}`);
            imgElement.src = nextUrl;
            currentFallbackIndex++;
        } else {
            hasTriedAllFallbacks = true;
            console.error(`[VN面板-手机版] 所有fallback失败: '${characterName}' (表情: '${expression}')`);
            imgElement.style.visibility = 'hidden';
            imgElement.removeEventListener('error', tryNextFallback);
        }
    };

    // 清除之前的事件监听器
    const oldErrorHandler = imgElement.errorHandler;
    if (oldErrorHandler) {
        imgElement.removeEventListener('error', oldErrorHandler);
    }

    imgElement.errorHandler = tryNextFallback;
    imgElement.addEventListener('error', tryNextFallback);
    
    imgElement.addEventListener('load', () => {
        console.log(`[VN面板-手机版] 成功加载: ${imgElement.src}`);
        imgElement.style.visibility = 'visible';
        imgElement.removeEventListener('error', tryNextFallback);
    }, { once: true });

    console.log(`[VN面板-手机版] 设置fallback for ${characterName} (表情: ${expression})`);
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
        console.log(`[VN面板-手机版] 更换表情: ${charInfo.name} -> ${charInfo.expression}`);
        
        const oldErrorHandler = existingImg.errorHandler;
        if (oldErrorHandler) {
            existingImg.removeEventListener('error', oldErrorHandler);
        }
        
        await addFallbackToImage(existingImg, charInfo.name, charInfo.expression);
        existingImg.src = charInfo.imgSrc;
        
        if (applyExpressionAnimationFn) applyExpressionAnimationFn(existingImg, charInfo.expression);
        currentCharacter = { ...charInfo };
        return;
    }

    console.log(`[VN面板-手机版] 切换角色: ${charInfo.name} (表情: ${charInfo.expression})`);

    const addNewImage = async () => {
        characterCenter.innerHTML = '';
        const newImg = document.createElement('img');
        newImg.classList.add('character-image-enter');
        
        await addFallbackToImage(newImg, charInfo.name, charInfo.expression);
        
        newImg.addEventListener('animationend', () => newImg.classList.remove('character-image-enter'), { once: true });

        newImg.src = charInfo.imgSrc;
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
        console.log(`[VN面板-手机版] 角色退场: ${dialogue.name}`);
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
    console.log(`[VN面板-手机版] 故事开始: ${data.chapterInfo || '未知章节'} - ID: ${data.startId}`);
    
    // 可以在这里添加故事开始时的UI更新
    // 比如显示章节标题、更新状态等
}

/**
 * 处理故事结束
 */
async function handleStoryEnd(data) {
    console.log(`[VN面板-手机版] 故事结束检测到 - 范围: ${data.range}`);
    
    try {
        // 延迟执行隐藏（确保所有消息都已载入）
        setTimeout(async () => {
            const success = await executeHideCommand(data.startId, data.endId);
            
            if (success) {
                console.log(`[VN面板-手机版] 故事已自动隐藏: ${data.range}`);
                
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
        console.log(`[VN面板-手机版] 准备执行隐藏指令: ${hideCommand}`);
        
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
                console.log(`[VN面板-JCY版] JCY適配器执行结果:`, result);
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
                console.log(`[VN面板-JCY版] 通过postMessage发送隐藏指令`);
                success = true;
            } catch (error) {
                console.error(`[VN面板-JCY版] postMessage发送失败:`, error);
            }
        }
        
        if (success) {
            console.log(`[VN面板-手机版] 隐藏指令执行成功: ${hideCommand}`);
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
        console.log('[VN面板-手机版] 🧪 开始测试故事隐藏功能...');
        
        // 测试API可用性
        console.log('[VN面板-手机版] 🔍 测试API可用性:');
        console.log('  - window.TavernHelper:', !!window.TavernHelper);
        console.log('  - window.TavernHelper?.triggerSlash:', !!window.TavernHelper?.triggerSlash);
        console.log('  - window.SillyTavern:', !!window.SillyTavern);
        console.log('  - window.SillyTavern?.executeSlashCommandsWithOptions:', !!window.SillyTavern?.executeSlashCommandsWithOptions);
        console.log('  - window.parent?.TavernHelper:', !!window.parent?.TavernHelper);
        console.log('  - window.top?.TavernHelper:', !!window.top?.TavernHelper);
        
        // 获取当前最新消息ID
        const currentId = await getLastMessageId();
        console.log(`[VN面板-手机版] 📊 当前最新消息ID: ${currentId}`);
        
        // 测试隐藏命令执行
        const testRange = Math.max(1, currentId - 1);
        const success = await executeHideCommand(testRange, testRange);
        
        if (success) {
            console.log('[VN面板-手机版] ✅ 故事隐藏功能测试成功');
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